import type { GameState } from '../state/types';
import { archiveHeroChronicle } from '../state/heroChronicle';

/** Keep failed archives retryable on the existing reign-end screen. */
export function leaveWithHeroChronicle(state: GameState, leave: () => void, onFailure: () => void): void {
  if (!state.ascent?.heroDepth?.chroniclePending || archiveHeroChronicle(state)) leave();
  else onFailure();
}
