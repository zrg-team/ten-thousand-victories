import type { GameState } from '../../state/types';
import { rulesOf } from '../../game/ascentRuleset';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { doctrineHostMix } from '../empire/hostDoctrine';

export function committedAggressor(state: GameState) {
  const id = state.ascent?.nextAggressorId;
  if (!id || !rulesOf(state).threatProjection || rulesOf(state).aggressorForecast <= 0) return undefined;
  return state.kingdoms.find(kingdom => kingdom.id === id && kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated && !kingdom.vassalage);
}

/** Read the director's committed choice. Never picks, generates, or refreshes an aggressor. */
export function committedWavePlan(state: GameState) {
  const ascent = state.ascent;
  if (!ascent?.nextAggressorId) return undefined;
  const crown = committedAggressor(state);
  if (!crown?.composition) return undefined;
  return { wave: ascent.wave + 1, kingdomId: crown.id, composition: crown.composition, mix: doctrineHostMix(crown.personality) };
}
