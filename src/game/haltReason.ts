import type { GameState } from '../state/types';

/**
 * Why the world is stopped, when nothing on the screen is already saying so.
 *
 * Three flags stop the Ascent clock — `isPaused` (a card is up), `isStrategyPause` (the player's
 * Pause, a lane, a plate) and `isAwayPause` (the player left the window) — and the badge and the
 * bar's ❚❚/▶ used to read only the second. So a world held by either of the others showed a
 * running bar over a frozen map, and pressing the button flipped a flag that was not the one
 * holding it: reported as *sometimes the game pauses for no reason — no popup, nothing*.
 *
 * `undefined` when the world runs, or when a card is up (the card is the reason and says so).
 *
 *  - `player` — any strategy pause: the player's own, or a screen's hold. There used to be a `hero`
 *    reason for a pause raised over a champion in danger, but hero danger no longer stops the world
 *    — and while an exposure stood, *any* hold (the invasion banner's, a lane's) was labelled
 *    "… gặp nguy, open Heroes", which read as the hero system stopping the game when it had not.
 *  - `away` — the away pause outlived the return (a window that never got its focus back).
 *  - `stranded` — `isPaused` with no card pending, nothing queued and no run ending: a hard stop
 *    nothing on the screen can lift. Never correct; surfaced so a tap can clear it.
 *
 * A leaf: type-only imports, read by the scene, the chrome and the bar.
 */
export type HaltReason = 'player' | 'away' | 'stranded';

export function haltReason(state: GameState): HaltReason | undefined {
  if (state.isDefeated) return undefined;
  const ascent = state.gameMode === 'ascent' ? state.ascent : undefined;
  if (ascent && state.pendingAscentPrompt) return undefined;
  if (state.isStrategyPause) return 'player';
  if (state.isAwayPause) return 'away';
  if (ascent && state.isPaused && pausedWithNothingToShow(state)) return 'stranded';
  return undefined;
}

/**
 * Any champion in danger the player has not decided about — seen or not. What makes a reign risky,
 * and what lights the Heroes dot (`barStatusColor`) and raises the advisor's `hero-danger` line.
 */
export function heroAtRisk(state: GameState): boolean {
  return Object.values(state.ascent?.heroDepth?.exposures ?? {}).some((exposure) => !exposure.resolved && !exposure.acknowledged);
}

/**
 * `isPaused` with nothing that could be holding it: no card, none queued, no ceremony or
 * aftermath in progress. Every legitimate `isPaused` in the mode comes with one of those.
 */
export function pausedWithNothingToShow(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent || state.pendingAscentPrompt || state.isDefeated) return false;
  if ((ascent.promptQueue?.length ?? 0) > 0) return false;
  if (ascent.ceremonyStage !== undefined || ascent.pendingAftermath) return false;
  return true;
}

/**
 * The player said go: lift every hold the player is allowed to lift. A pending card is left
 * alone — it is a question, and resuming is not an answer to it.
 */
export function resumeWorld(state: GameState): void {
  state.isStrategyPause = false;
  state.isAwayPause = false;
  if (state.gameMode === 'ascent' && state.isPaused && pausedWithNothingToShow(state)) state.isPaused = false;
}
