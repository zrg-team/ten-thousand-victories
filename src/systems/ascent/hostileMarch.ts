import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { cabinetRuleMult } from '../../state/cabinet';
import type { Army, GameState, Land } from '../../state/types';
import { doctrine } from './DoctrineSystem';

export function hostileMarchRisk(state: GameState, land: Land, crossed: number): { loss: number; safe: number } {
  const levels = (type: string) => land.buildings.filter(b => b.type === type).reduce((n, b) => n + b.level, 0);
  const defenses = Math.min(0.12, levels('wall') * 0.02 + levels('tower') * 0.03 + levels('barracks') * 0.01);
  const guides = doctrine(state, 'hidden-paths') * 0.15 * cabinetRuleMult('hidden-paths');
  const escort = Math.min(0.75, doctrine(state, 'march-escort') * 0.25 * cabinetRuleMult('march-escort'));
  return {
    loss: Math.min(0.30, 0.08 + crossed * 0.02 + defenses) * (1 - escort),
    safe: Math.min(0.85, Math.max(0.15, 0.35 - crossed * 0.03 - defenses) + guides),
  };
}

export function isHostileMarchLand(land: Land): boolean {
  return Boolean(land.ownerId && land.ownerId !== PLAYER_KINGDOM_ID && land.ownerId !== 'neutral');
}

/** A single roll per completed hostile leg; percentage applies to the survivors. */
export function applyHostileMarchLoss(army: Army, loss: number, safe: number, roll: number): number {
  if (roll < safe) return 0;
  const entries = Object.entries(army.units) as Array<[keyof Army['units'], number]>;
  const total = entries.reduce((n, [, men]) => n + men, 0);
  const target = Math.min(total, Math.max(1, Math.round(total * loss)));
  let removed = 0;
  // Cumulative rounding preserves the exact total even for mixed one-man unit groups.
  let cumulative = 0;
  for (const [kind, men] of entries) {
    cumulative += men;
    const upto = total ? Math.round(target * cumulative / total) : 0;
    army.units[kind] = men - (upto - removed);
    removed = upto;
  }
  return removed;
}

/** Prefer friendly roads, then fewer crossings, then a shorter march. */
export function marchRouteCost(state: GameState, path: string[]): number {
  return path.length + path.slice(0, -1).reduce((n, id) => {
    const land = state.lands.find(candidate => candidate.id === id);
    return n + (land && isHostileMarchLand(land) ? 10000 : 0);
  }, 0);
}
