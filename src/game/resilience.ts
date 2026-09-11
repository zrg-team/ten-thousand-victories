import Phaser from 'phaser';
import { autosaveSnapshot } from '../state/save';
import type { GameState } from '../state/types';
import { gpuBakeCount } from './gpuBakes';

/**
 * The page can always bring itself back.
 *
 * "Focus the game from the background and it is totally blank" turned out to be three different
 * failures wearing one face, and none of them left a tell the player could see:
 *
 * 1. **A throw inside one game step kills the loop for ever.** Phaser's rAF driver invokes the
 *    step callback *before* it requests the next frame (`RequestAnimationFrame.step`), so an
 *    exception anywhere in update, render, a tween or a timer callback leaves `raf.isRunning`
 *    true with no frame ever scheduled. Measured with the scratch harness: one thrown `step`
 *    event and the frame counter never moved again. A phone drops a backgrounded canvas's
 *    contents, so a loop that dies on the resume frame is not a freeze — it is a blank sheet.
 * 2. **A WebGL context that is lost and never restored is a permanent blank.** The renderer
 *    returns early from `render()` while `contextLost` is set, the loop keeps running, and
 *    nothing reloads. Chromium on Android reclaims the GPU context of a backgrounded page and
 *    does not always hand it back.
 * 3. **A killed WebView process** — handled in the shell (`apps/mobile/App.tsx`), which lands
 *    on the same reload path as the two above by writing the same reason flag.
 *
 * Two watchdogs, one reload. The heartbeat re-arms a dead loop with Phaser's own `sleep`/`wake`
 * pair; past a small budget of re-arms it gives up and reloads. The context watchdog reloads once
 * a lost context has stayed lost for a few seconds *while the page is visible* — a loss in the
 * background is timed from the moment the player is back, not from when the phone took the GPU.
 * Every reload writes the run down first (`autosaveSnapshot`) and leaves a reason in
 * `sessionStorage`, which `MenuScene` reads to lead with on the sheet it raises over the front
 * page. It offers the run; it does not resume it. A reload can happen with nobody playing — a
 * context lost while the menu is up — and booting itself into a save is not a thing the player
 * asked for.
 *
 * `?noresilience=1` turns the watchdogs off, for a harness that deliberately stops the loop.
 */

export type ReloadCause = 'context-lost' | 'loop-dead' | 'shell-restart';

export interface ReloadReason {
  cause: ReloadCause;
  /** How many times in a row the page has come back for this cause. */
  count: number;
  at: string;
  /** The last uncaught error text before the reload, when there was one. */
  error?: string;
}

/** Shared with the shell, which writes it through an injected script. Bump on a shape change. */
export const RELOAD_REASON_KEY = 'mandate:reload-reason:v1';

/**
 * Floor on how stale the step clock may be before the loop is declared dead. Generous: this is
 * checked from a macrotask, which cannot run *during* a long synchronous step (a 2 s map rebuild
 * on a throttled phone updates the clock the moment it finishes), so only a loop that genuinely
 * scheduled nothing can trip it.
 */
const STALE_STEP_MS = 4000;
const HEARTBEAT_MS = 1000;
/** How long a lost context may stay lost, visible, before the page gives up on a restore. */
const CONTEXT_LOST_MS = 4000;
/** Re-arms allowed per minute before a reload is the more honest answer. */
const MAX_REARMS_PER_MINUTE = 3;

export interface Health {
  frame: number;
  rafRunning: boolean;
  loopRunning: boolean;
  contextLost: boolean;
  /** Milliseconds since the last completed step, in wall time. */
  sinceStepMs: number;
  visible: boolean;
  rearms: number;
  /** GPU-rendered textures registered for repaint after a context restore. */
  gpuBakes: number;
  lastError?: string;
  reloadReason?: ReloadReason;
}

export interface ResilienceHandle {
  health(): Health;
  dispose(): void;
}

function readReason(): ReloadReason | undefined {
  try {
    const raw = sessionStorage.getItem(RELOAD_REASON_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<ReloadReason>;
    if (typeof parsed.cause !== 'string') return undefined;
    return {
      cause: parsed.cause as ReloadCause,
      count: typeof parsed.count === 'number' ? parsed.count : 1,
      at: typeof parsed.at === 'string' ? parsed.at : '',
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
    };
  } catch {
    return undefined;
  }
}

/** Reads the reason the page last reloaded itself for and clears it, so it is answered once. */
export function takeReloadReason(): ReloadReason | undefined {
  const reason = readReason();
  if (reason) {
    try { sessionStorage.removeItem(RELOAD_REASON_KEY); } catch { /* storage refused */ }
  }
  return reason;
}

/** Writes the reason the page is about to reload for. The count carries over a repeat. */
export function noteReloadReason(cause: ReloadCause, error?: string): ReloadReason {
  const prior = readReason();
  const reason: ReloadReason = {
    cause,
    count: prior && prior.cause === cause ? prior.count + 1 : 1,
    at: new Date().toISOString(),
    error,
  };
  try { sessionStorage.setItem(RELOAD_REASON_KEY, JSON.stringify(reason)); } catch { /* storage refused */ }
  return reason;
}

/**
 * The state the player is actually in, read off the ACTIVE world scene — never the global:
 * `MenuScene` nulls `window.__mandateState`, and a stopped scene keeps its old `.state` field.
 */
export function liveGameState(game: Phaser.Game): GameState | undefined {
  for (const scene of game.scene.getScenes(true)) {
    const state = (scene as Phaser.Scene & { state?: GameState }).state;
    if (state && Array.isArray(state.lands) && state.lands.length > 0) return state;
  }
  return undefined;
}

function describeError(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value).slice(0, 200); } catch { return String(value); }
}

export function installResilience(game: Phaser.Game): ResilienceHandle {
  const disabled = typeof window !== 'undefined' && /[?&]noresilience=1\b/.test(window.location.search);
  let lastStepAt = performance.now();
  let lastError: string | undefined;
  let contextLostAt: number | undefined;
  let rearmTimes: number[] = [];
  let reloading = false;
  const reloadReason = readReason();

  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer & { contextLost?: boolean };
  const isLost = (): boolean => Boolean(renderer?.contextLost);
  const visible = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  const onPostStep = (): void => { lastStepAt = performance.now(); };
  const onError = (event: ErrorEvent): void => { lastError = describeError(event.error ?? event.message); };
  const onRejection = (event: PromiseRejectionEvent): void => { lastError = describeError(event.reason); };
  const onVisibility = (): void => {
    // Time the player was away is not time the loop was dead: the browser halts rAF on a hidden
    // page. And a context taken while hidden is timed from now, not from when it went.
    lastStepAt = performance.now();
    contextLostAt = visible() && isLost() ? performance.now() : undefined;
  };
  const onLose = (): void => { contextLostAt = performance.now(); };
  const onRestore = (): void => { contextLostAt = undefined; };

  const reload = (cause: ReloadCause): void => {
    if (reloading) return;
    reloading = true;
    const state = liveGameState(game);
    if (state) {
      try { autosaveSnapshot(state); } catch { /* the reload is still the right answer */ }
    }
    const reason = noteReloadReason(cause, lastError);
    console.warn(`[resilience] reloading: ${cause} (attempt ${reason.count})${lastError ? ` — ${lastError}` : ''}`);
    window.location.reload();
  };

  const beat = (): void => {
    if (disabled || reloading || !visible() || game.isPaused) return;
    const now = performance.now();

    if (isLost()) {
      contextLostAt ??= now;
      if (now - contextLostAt > CONTEXT_LOST_MS) reload('context-lost');
      return;
    }

    const loop = game.loop;
    if (!loop.running || !loop.raf.isRunning) return;
    if (now - lastStepAt <= STALE_STEP_MS) return;

    rearmTimes = rearmTimes.filter((t) => now - t < 60_000);
    if (rearmTimes.length >= MAX_REARMS_PER_MINUTE) {
      reload('loop-dead');
      return;
    }
    rearmTimes.push(now);
    console.warn(`[resilience] the game loop stopped scheduling frames; re-arming (${rearmTimes.length}/${MAX_REARMS_PER_MINUTE})${lastError ? ` — last error: ${lastError}` : ''}`);
    // Phaser's own restart pair: `sleep` cancels whatever is pending and clears `running`;
    // `wake` starts rAF again and ticks once so the sheet is repainted this very macrotask.
    loop.sleep();
    loop.wake();
    lastStepAt = performance.now();
  };

  game.events.on(Phaser.Core.Events.POST_STEP, onPostStep);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  document.addEventListener('visibilitychange', onVisibility);
  renderer?.on?.(Phaser.Renderer.Events.LOSE_WEBGL, onLose);
  renderer?.on?.(Phaser.Renderer.Events.RESTORE_WEBGL, onRestore);
  const timer = window.setInterval(beat, HEARTBEAT_MS);

  const health = (): Health => ({
    frame: game.loop.frame,
    rafRunning: game.loop.raf.isRunning,
    loopRunning: game.loop.running,
    contextLost: isLost(),
    sinceStepMs: Math.round(performance.now() - lastStepAt),
    visible: visible(),
    rearms: rearmTimes.length,
    gpuBakes: gpuBakeCount(),
    lastError,
    reloadReason,
  });

  return {
    health,
    dispose() {
      window.clearInterval(timer);
      game.events.off(Phaser.Core.Events.POST_STEP, onPostStep);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer?.off?.(Phaser.Renderer.Events.LOSE_WEBGL, onLose);
      renderer?.off?.(Phaser.Renderer.Events.RESTORE_WEBGL, onRestore);
    },
  };
}
