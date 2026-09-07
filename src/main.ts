import { installPerformanceBench } from './game/performanceBench';
import Phaser from 'phaser';
import { gameConfig } from './game/config';
import { createInitialGameState, createCampaignGameState, createEmpireGameState, createAscentGameState } from './state/GameState';
import { scheduleCampaignEvents } from './systems/CampaignEventSystem';
import type { GameState } from './state/types';
import { getLanguage, heroName, politicsTitle, seasonLabel, t } from './i18n';
import { noteShellUpdate, registerServiceWorker } from './pwa/updates';
import { watchInstall } from './pwa/install';
import { usesServiceWorker } from './platform/shell';
import { getMapTheme } from './ui/mapTheme';
import { stampStats } from './ui/ink/stamp';
import { installQualityLadder } from './game/qualityLadder';
import { renderScaleNow } from './game/graphicsQuality';
import type { CoronationSheet } from './ui/coronation/CoronationSheet';
import { installResilience } from './game/resilience';
import { isDesktopPlatform, layoutDiagnosis } from './platform/layout';
import { installDesktopResize } from './game/desktopResize';

declare global {
  interface Window {
    __mandateState?: GameState;
    /** The loop and context watchdogs' own reading — see `game/resilience.ts`. */
    __health?: ReturnType<typeof installResilience>['health'];
    /** Live census of the ink-stamp registry - backend, count, bytes, pools. */
    /** How a native shell tells the game it has a newer bundle waiting. See below. */
    __gameUpdateReady?: (version?: string) => void;
    __inkStamps?: typeof stampStats;
    /** The quality ladder: state(), force(id), hold(ms) — see qualityLadder.ts. */
    __ladder?: ReturnType<typeof installQualityLadder>;
    /** The render scale the buffer is actually using right now. */
    __renderScale?: () => number;
    /** rAF histogram over N seconds: p50/p95/p99/worst and over-budget counts. */
    __fpsProbe?: (seconds?: number) => Promise<{
      frames: number; p50: number; p95: number; p99: number; worst: number;
      over16: number; over33: number; over50: number;
    }>;
    __phaserGame?: Phaser.Game;
    __suppressMapInputUntil?: number;
    __minimapInputBounds?: Array<{ x: number; y: number; width: number; height: number }>;
    /**
     * Screen areas Dragon Ascent's HUD scene has drawn over, which the world scene underneath
     * must not treat as taps on the map: the floating zoom/mode stack, and the whole screen
     * while a prompt or lane overlay owns it. Published rather than hardcoded because the
     * control stack moves with the province inspect card and the overlays come and go.
     */
    __hudTapBounds?: Array<{ x: number; y: number; width: number; height: number }>;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    /**
     * Boots a mode straight from a harness. `ascent` and `arena` are what the menu offers;
     * `empire`, `campaign` and `rival` are shelved and reachable only through this hook — see the
     * note on the implementation before reading a green run in one of them as shipped surface.
     */
    __startBenchGame?: (seed?: number, mode?: 'rival' | 'campaign' | 'empire' | 'ascent' | 'arena') => void;
    /**
     * The two halves of the launch splash, both declared inline in `index.html` so they exist
     * before this bundle does. `__splashDone` takes the splash down — `MenuScene` calls it once
     * the menu has genuinely been rendered — and `__fontsCss` resolves when the deferred
     * @font-face stylesheet has applied, which `BootScene` waits on before it measures a face.
     */
    __splashDone?: () => void;
    __fontsCss?: Promise<void>;
    /** Why this page chose the sheet it did — see `platform/layout.ts`. */
    __layoutDiagnosis?: ReturnType<typeof layoutDiagnosis>;
  }
}

// Before Phaser, so the first visit starts filling its offline cache while the loader is still
// unpacking fonts. Does nothing in dev — see `registerServiceWorker` — and nothing inside a
// native shell, which already holds every byte in its binary: see `usesServiceWorker`.
if (usesServiceWorker()) {
  registerServiceWorker();
}

/**
 * The one hook a native shell needs to reach, hung on `window` because that is the only surface a
 * shell has: it injects a line of script into the page, and a module export is not addressable from
 * there. Everything else in the shell contract runs the other way — the shell declares itself on
 * `window.__shell` and the game reads it — but an update arrives long after load, so this one has
 * to be a door rather than a value.
 *
 * Named for what it does rather than after the shell, because the next cabinet will call it too.
 */
window.__gameUpdateReady = noteShellUpdate;

// Before Phaser for a second reason: `beforeinstallprompt` is fired at the window the moment
// Chromium decides the site is installable, and a listener attached after that never hears it.
watchInstall();

const game = new Phaser.Game(gameConfig);
window.__phaserGame = game;
installPerformanceBench();
// A right-click on the map is a map gesture, not a request for the browser's menu — on the desktop
// layout only, where a mouse is what is expected to be in the hand.
if (isDesktopPlatform()) game.input.mouse?.disableContextMenu();
// One line, once, so a page that chose the wrong sheet can say why without a debugger: every
// signal the computer question and the sheet were decided from. Also on `window` for a report.
window.__layoutDiagnosis = layoutDiagnosis();
console.info('[layout]', JSON.stringify(window.__layoutDiagnosis));
// The desktop sheet follows the window; the phone's never moves. See `game/desktopResize.ts`.
installDesktopResize(game);
window.__inkStamps = stampStats;
window.__ladder = installQualityLadder(game);
// The two watchdogs behind "come back from the background and the game is blank": a loop a throw
// has killed is re-armed, a context the GPU never returned is reloaded, and the run is written
// down before either. See `game/resilience.ts` for the three failures this stands against.
window.__health = installResilience(game).health;
window.__renderScale = renderScaleNow;
window.__fpsProbe = (seconds = 3) => new Promise((resolve) => {
  // A rAF histogram: what the browser actually presented, not what the loop believes.
  const gaps: number[] = [];
  let last = performance.now();
  const until = last + seconds * 1000;
  const tick = (now: number): void => {
    gaps.push(now - last);
    last = now;
    if (now < until) { requestAnimationFrame(tick); return; }
    const sorted = [...gaps].sort((a, b) => a - b);
    const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    resolve({
      frames: gaps.length,
      p50: +at(0.5).toFixed(2), p95: +at(0.95).toFixed(2), p99: +at(0.99).toFixed(2),
      worst: +(sorted[sorted.length - 1] ?? 0).toFixed(2),
      over16: gaps.filter((g) => g > 16.7).length,
      over33: gaps.filter((g) => g > 33.4).length,
      over50: gaps.filter((g) => g > 50).length,
    });
  };
  requestAnimationFrame(tick);
});

window.render_game_to_text = () => {
  if (window.__phaserGame?.scene.isActive('MenuScene')) {
    const menu = window.__phaserGame.scene.getScene('MenuScene') as Phaser.Scene & { templeSheet?: CoronationSheet };
    return JSON.stringify({
      mode: 'menu',
      bannerEditor: menu.templeSheet?.bannerState(),
      wardrobe: menu.templeSheet?.wardrobeState(),
      language: getLanguage(),
      languageOptions: ['vi', 'en'],
      actions: ['guide', 'history', 'settings'],
      mapTheme: getMapTheme(),
      landscapeInteraction: getMapTheme() === 'dong-ho' ? 'tap-river-ripple' : undefined,
      artLayers: getMapTheme() === 'dong-ho'
        ? ['ground', 'mountains', 'mountain-mist', 'river-fx', 'bamboo', 'lotus'] : undefined,
      riverGestures: getMapTheme() === 'dong-ho'
        ? ['tap', 'drag', 'hover-wake'] : undefined,
      lotusGestures: getMapTheme() === 'dong-ho'
        ? ['hover', 'drag', 'water-wake'] : undefined,
      ambientMotion: getMapTheme() === 'dong-ho'
        ? ['mountain-drift', 'mountain-mist', 'bamboo-breeze', 'lotus-sway', 'river-surface-flow'] : undefined,
    });
  }

  const state = window.__mandateState;

  if (!state) {
    return JSON.stringify({ mode: 'loading' });
  }

  const selectedLand = state.selectedLandId
    ? state.lands.find((land) => land.id === state.selectedLandId)
    : undefined;
  const ascentUi = window.__phaserGame?.scene.isActive('ConquestUIScene')
    ? window.__phaserGame.scene.getScene('ConquestUIScene') as Phaser.Scene & {
        openPromptKey?: string;
        chronicleTab?: 'actions' | 'ongoing' | 'heard' | 'recorded';
        coronationSheet?: CoronationSheet;
      }
    : undefined;

  return JSON.stringify({
    coordinateSystem: 'Phaser canvas pixels, origin top-left, x right, y down',
    language: getLanguage(),
    mapTheme: getMapTheme(),
    mode: state.victory ? 'victory' : state.pendingCourtRequest || state.activePoliticsCard ? 'court_request' : state.movementOrders.length > 0 ? 'moving_army' : state.selectedArmyId ? 'army_selected' : 'playing',
    time: t('time.yearSeasonComma', { year: state.year, season: seasonLabel(state.season) }),
    realtimeSeconds: Math.round(state.realtimeSeconds),
    mapRenderMode: state.mapRenderMode,
    mapSettings: state.mapSettings,
    resources: state.resources,
    resourceRates: state.resourceRates,
    visibility: {
      visible: state.lands.filter((land) => land.isVisible).length,
      explored: state.lands.filter((land) => land.isExplored).length,
      total: state.lands.length,
    },
    acquisitionOrders: state.acquisitionOrders,
    selectedLand: selectedLand
      ? {
          id: selectedLand.id,
          name: selectedLand.name,
          ownerId: selectedLand.ownerId,
          type: selectedLand.type,
          defense: selectedLand.defense,
          loyalty: selectedLand.loyalty,
          buildings: selectedLand.buildings,
          buildingCapacity: selectedLand.buildingCapacity,
          terrainSummary: selectedLand.terrainSummary,
          outputs: selectedLand.outputs,
        }
      : null,
    armies: state.armies.map((army) => ({
      id: army.id,
      kingdomId: army.kingdomId,
      landId: army.landId,
      total: army.units.spearmen + army.units.archers + army.units.heavyInfantry,
      level: army.level,
      experience: army.experience,
      experienceToNextLevel: army.experienceToNextLevel,
      morale: army.morale,
      supply: army.supply,
      rations: army.rations,
      provisions: army.provisions,
    })),
    draftChoices: state.activeHeroDraft?.map((hero) => heroName(hero)) ?? [],
    politicsCard: state.activePoliticsCard ? politicsTitle(state.activePoliticsCard) : null,
    pendingCourtRequest: state.pendingCourtRequest ? politicsTitle(state.pendingCourtRequest) : null,
    activeCourtModifiers: state.activeCourtModifiers,
    court: {
      stability: Math.round(state.court.stability),
      influence: Math.round(state.court.influence),
      favor: Math.round(state.court.favor),
      favorThreshold: state.court.favorThreshold,
      unlockedSeats: state.court.unlockedSeats,
      seats: state.court.seats,
    },
    ascent: state.ascent
      ? {
          wave: state.ascent.wave,
          ticksToWave: state.ascent.ticksToWave,
          bossTelegraphed: state.ascent.bossTelegraphed,
          wavesSurvived: state.ascent.wavesSurvived,
          power: state.ascent.power,
          powerDelta: state.ascent.power - state.ascent.powerPrev,
          peakPower: state.ascent.peakPower,
          defensePower: state.ascent.defensePower,
          threat: state.ascent.threat,
          level: state.ascent.level,
          xp: state.ascent.xp,
          xpToNext: state.ascent.xpToNext,
          cardStacks: state.ascent.cardStacks,
          retiredCards: state.ascent.retiredCards,
          heroesSummoned: state.ascent.heroesSummoned,
          frontLandId: state.ascent.frontLandId,
          frontBlocked: state.ascent.frontBlocked,
          autopilot: state.ascent.autopilotStats,
          lanes: state.ascent.laneState,
          conquestPlans: state.ascent.conquestPlans.slice(-5),
          decisionPressure: state.ascent.decisionPressure,
          idleTicks: state.ascent.idleTicks,
          laneStats: state.ascent.laneStats,
          promptCooldowns: state.ascent.promptCooldowns,
          lastPromptTurn: state.ascent.lastPromptTurn,
          courtCardCooldown: state.ascent.courtCardCooldown,
          drawnCourtCards: state.ascent.drawnCourtCards,
          // The restored core systems, so a driver can assert they are actually running.
          era: state.mandate?.era,
          edictPoints: state.mandate?.edictPoints,
          edicts: state.mandate?.edicts ?? [],
          taxPolicy: state.taxPolicy ?? 'balanced',
          stability: Math.round(state.court.stability),
          favor: Math.round(state.court.favor * 10) / 10,
          courtSeats: state.court.seats,
          unlockedSeats: state.court.unlockedSeats,
          governors: state.lands
            .filter((land) => land.ownerId === 'dai-viet')
            .filter((land) => state.heroes.some((hero) => hero.assignedTo === land.id))
            .map((land) => land.id),
          rivals: state.kingdoms
            .filter((kingdom) => kingdom.id !== 'dai-viet' && !kingdom.isDefeated)
            .map((kingdom) => ({
              id: kingdom.id,
              name: kingdom.name,
              relations: Math.round(kingdom.relations ?? 50),
              power: Math.round(kingdom.power ?? 0),
              warAppetite: Math.round(kingdom.warAppetite ?? 0),
              ambassador: kingdom.ambassadorHeroId ?? null,
            })),
          queuedPrompts: state.ascent.promptQueue.length,
          prompt: state.pendingAscentPrompt
            ? {
                kind: state.pendingAscentPrompt.kind,
                options: describeAscentPromptOptions(state, state.pendingAscentPrompt),
              }
            : null,
          ui: {
            screen: ascentUi?.openPromptKey || 'map',
            bannerEditor: state.pendingAscentPrompt?.kind === 'coronation' ? ascentUi?.coronationSheet?.bannerState() : undefined,
            wardrobe: state.pendingAscentPrompt?.kind === 'coronation' ? ascentUi?.coronationSheet?.wardrobeState() : undefined,
            chronicleTab: ascentUi?.openPromptKey === 'lane:chronicle'
              ? ascentUi.chronicleTab ?? 'actions'
              : null,
            claimsAskFirst: !(state.ascent.autoClaimSilently ?? false),
            mustersAskFirst: !(state.ascent.autoMusterSilently ?? false),
            storiesWait: state.ascent.storyCardsMuted ?? false,
          },
        }
      : undefined,
    message: state.message,
  });
};

/** Option ids of the open Dragon Ascent prompt, so a driver can answer it blind. */
function describeAscentPromptOptions(state: GameState, prompt: NonNullable<GameState['pendingAscentPrompt']>): string[] {
  switch (prompt.kind) {
    // The rite writes its own result into the dynasty store, so there is no option to name; the
    // resolver takes any id and rolls a king when nothing was made. Listed anyway, because a
    // kind missing from an option map is how a driver wedges on the first screen of the game.
    case 'coronation': return ['crowned'];
    // Same shape, same reason: one button, any id accepted, and named here so a blind driver
    // logs the card it answered rather than the ['ok'] fallthrough.
    case 'inheritance': return ['acknowledged'];
    case 'founder': return prompt.options;
    case 'power-draft': return [...prompt.cards, 'skip'];
    case 'conquer-target': return [...prompt.targets.map((target) => target.landId), 'hold'];
    // Blocked methods are omitted: a driver answering blind must not pick an illegal option.
    case 'conquer-method':
      return [...prompt.target.methods.filter((m) => !m.blockedReason).map((m) => m.method), 'back'];
    case 'hero-choice': return [...prompt.heroIds, 'pass'];
    case 'court-appointment': return prompt.options.map((option) => option.id);
    case 'law-choice':
      return [
        ...prompt.projectIds.map((id) => `edict:${id}`),
        ...prompt.taxOptions.map((policy) => `tax:${policy}`),
        'hold',
      ];
    case 'parliament':
      return state.politicsDeck.find((card) => card.id === prompt.cardId)?.choices.map((choice) => choice.id) ?? ['ok'];
    case 'envoy': return prompt.options.filter((option) => option.affordable).map((option) => option.id);
    case 'rival-demand': return prompt.options.filter((option) => option.affordable).map((option) => option.id);
    case 'famine': case 'restore-land': return prompt.options.filter((option) => option.affordable).map((option) => option.id);
    case 'empire-response': return prompt.options.map((option) => option.id);
    // The ceremony. `dynasty-level` takes a trait id and nothing else — a driver that answered it
    // with 'ok' would leave the run's last card standing for ever, which is the exact failure the
    // famine case is annotated for further up the harness notes.
    case 'dynasty-level': return prompt.options;
    default: return ['ok'];
  }
}

window.advanceTime = (ms: number) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) {
    game.step(performance.now(), 1000 / 60);
  }
};

/**
 * Deterministic benchmark bootstrap (tooling only). Seeds Math.random so the generated map/state
 * is identical across before/after performance runs, builds a fresh game state, and jumps straight
 * into MapScene (which launches UIScene).
 *
 * **Three of these modes are shelved, and this hook is the only door left to them.**
 * `MenuScene.renderClassic` offers one card, the Skirmish: Throne of Empires, the Campaign and the
 * Rival start are still built and still held to their fingerprints by `verify-modes-regression`,
 * but no player can reach them. A harness that boots `empire`, `campaign` or `rival` is therefore
 * testing *shared* code — MapScene, the economy, the conquest UI — through a door the shipped game
 * does not have, and its result says nothing about what a player meets. A 2026-09-04 playtest read
 * a green four-mode smoke run as four live modes and graded three shelves; hence this note.
 *
 * What ships: `ascent` (Dragon Ascent, the game) and `arena` (the Skirmish). Restoring either long
 * classic run is putting its entry back in `renderClassic`'s list, and this comment is then wrong.
 */
window.__startBenchGame = (seed = 1337, mode = 'rival') => {
  // The Skirmish carries no GameState: it builds both hosts from its own dials and hands the fight
  // to ConquestScene on "Take command". Routed here so a gate can reach the one classic mode a
  // player is actually offered by the same call it uses for everything else.
  if (mode === 'arena') {
    for (const key of ['MenuScene', 'GuideScene', 'HistoryScene', 'CampaignScene', 'MapScene', 'UIScene', 'ConquestScene', 'ConquestUIScene']) {
      if (game.scene.getScene(key)) game.scene.stop(key);
    }
    game.scene.start('BattleArenaScene');
    return;
  }
  const originalRandom = Math.random;
  let s = (seed >>> 0) || 1;
  Math.random = () => {
    // mulberry32
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let state: GameState;
  try {
    if (mode === 'ascent') {
      state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    } else if (mode === 'empire') {
      state = createEmpireGameState({ seaSides: 1, difficulty: 'normal' });
      scheduleCampaignEvents(state);
    } else if (mode === 'campaign') {
      state = createCampaignGameState({ seaSides: 1, difficulty: 'normal' });
      scheduleCampaignEvents(state);
    } else {
      state = createInitialGameState();
    }
  } finally {
    Math.random = originalRandom;
  }
  window.__mandateState = state;
  // Mirror the real menu->game transition: stop the menu/campaign scenes so nothing
  // renders underneath MapScene (otherwise control-render-mode, which hides the opaque
  // paper background, would reveal them).
  const worldScene = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
  for (const key of ['MenuScene', 'GuideScene', 'HistoryScene', 'CampaignScene', 'MapScene', 'UIScene', 'ConquestScene', 'ConquestUIScene']) {
    if (key !== worldScene && game.scene.getScene(key)) game.scene.stop(key);
  }
  game.scene.start(worldScene, { state });
};
