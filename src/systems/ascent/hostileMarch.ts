import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  PASSING_BASE,
  PASSING_CAMPAIGN_MAX,
  PASSING_EXHAUSTION_SHARE,
  PASSING_LEG_MAX,
  PASSING_PLAN,
  PASSING_TEMPER,
  PASSING_WATCH_SCALE,
} from '../../game/ascentConfig';
import { cabinetRuleMult } from '../../state/cabinet';
import type { Army, GameState, Land } from '../../state/types';
import { doctrine } from './DoctrineSystem';
import { landGarrisonPower } from './PowerSystem';

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

/**
 * What the provinces overlooking a stretch of road can do to a column using it.
 *
 * The mirror of `hostileMarchRisk`, from the other side of the war. `land` is the neutral ground
 * the hostile column has just marched onto; the watchers are our provinces next to it, and what
 * they are worth is the garrison power they would fight with — walls, their manning, the militia
 * — so this reads the same number the province would defend itself with rather than inventing a
 * second measure of how strong a district is.
 *
 * `share` is against the column's *current* strength and `spent` is what each watching province
 * pays in turnout for having done it. Both are shares, not men: the caller owns the arithmetic on
 * a specific host.
 */
export function passingColumnLoss(
  state: GameState,
  land: Land,
  hostPower: number,
  alreadyLost: number,
  column: { personality?: string; plan?: string } = {},
): { share: number; watchers: Land[]; spent: number } {
  const watchers = land.neighbors
    .map((id) => state.lands.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Land => candidate?.ownerId === PLAYER_KINGDOM_ID);
  if (watchers.length === 0) return { share: 0, watchers, spent: 0 };
  const watched = watchers.reduce((sum, watcher) => sum + landGarrisonPower(state, watcher), 0);
  // Against the column, not in the abstract: the same ring is a serious ambush for a raiding
  // party and a nuisance for a boss coalition, which is the reading a player already has.
  const pressure = Math.min(1, watched / Math.max(1, hostPower));
  // Who is marching, and what they came to do. This scales the price; it never withholds the
  // road. A commander who means to ignore the frontier still marches past it — see `PASSING_TEMPER`.
  const temper = (column.personality ? PASSING_TEMPER[column.personality] : undefined) ?? 1;
  const errand = (column.plan ? PASSING_PLAN[column.plan] : undefined) ?? 1;
  const wanted = Math.min(
    PASSING_LEG_MAX,
    (PASSING_BASE + PASSING_WATCH_SCALE * pressure) * temper * errand,
  );
  // The campaign ceiling is spent in men, so it has to be converted back into a share of what is
  // left standing — a host at 80% of its muster with a 30% ceiling has 10 points of it left.
  const room = Math.max(0, PASSING_CAMPAIGN_MAX - alreadyLost);
  const share = Math.min(wanted, room);
  return { share, watchers, spent: share * PASSING_EXHAUSTION_SHARE };
}

/** Prefer friendly roads, then fewer crossings, then a shorter march. */
export function marchRouteCost(state: GameState, path: string[]): number {
  return path.length + path.slice(0, -1).reduce((n, id) => {
    const land = state.lands.find(candidate => candidate.id === id);
    return n + (land && isHostileMarchLand(land) ? 10000 : 0);
  }, 0);
}
