/**
 * A forecast for one invading host: where it is going, when it gets there, and what will be
 * standing there by then (backlog B10, beta `defenceBand`).
 *
 * The army lane used to set a host's strength beside its target's garrison plus whatever hosts
 * happened to be standing on that province *now* — no arrival time, and a relief march already on
 * the road counted for nothing. This reads the same quantities the contact roll uses, in the same
 * unit: attack is `armyPower`, defence is `combinedDefencePower` over the garrison (none, if the
 * province is already being taken) and every host of ours that is there or will arrive before the
 * invader does; the hold chance is `resolveInvaderBattle`'s own fuzz band under the same siege
 * tiers `projectedWinChance` copies.
 *
 * An estimate, and labelled as one: invaders re-choose targets, hosts get recalled, a watched
 * field is decided by the player. Pure: reads only.
 */
import { EARLY_WAVE_GRACE, INVADER_POWER_PER_SOLDIER, MAX_HOSTS_PER_KINGDOM } from '../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { armyPower, combinedDefencePower, findLandPath, garrisonPower, getTotalPathTicks } from '../WarSystem';
import { provinceIsFalling } from '../LandSystem';
import { doctrineHostMix, invasionCapital, invasionRoute, siegeTicksFor, stagingEdgesFor, stagingFromEdges } from '../empire/InvasionSystem';
import { getLegTicks } from '../../game/movementConfig';
import type { WaveShape } from '../../game/ascentConfig';
import type { Army, GameState, InvasionRecord } from '../../state/types';

export type ForecastVerdict = 'holds' | 'doubt' | 'falls';

export interface InvaderForecast {
  armyId: string;
  targetLandId: string;
  /**
   * Seasons until the host stands at the target's walls (on a neighbouring province, or on it);
   * undefined when no route is known. A host does not step onto walled ground of ours — it stops
   * beside it and a siege clock runs — so this, not "on the province", is when the defence is met.
   */
  reachTicks?: number;
  /** Seasons until it can storm: the walls, then the siege clock (running, or the one it will open). */
  assaultTicks?: number;
  attack: number;
  /** Defence standing on the target when the host arrives. */
  ready: number;
  holdPct: number;
  verdict: ForecastVerdict;
  /** Our hosts counted in `ready` (there now, or arriving in time). */
  counted: string[];
  /** Our hosts marching there that arrive too late to count. */
  late: string[];
}

const FUZZ_MIN = 0.9;
const FUZZ_MAX = 1.1;
const LARGE_HOST_POWER = 1000 * INVADER_POWER_PER_SOLDIER;
const anyGround = (): boolean => true;

/** Seasons left on a march: the rest of the current leg, then every leg after it. */
function marchTicksLeft(state: GameState, armyId: string): { destination?: string; ticks: number } {
  const order = state.movementOrders.find((candidate) => candidate.armyId === armyId);
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!order || !army || order.path.length === 0) return { ticks: 0 };
  const current = Math.max(0, Math.ceil(order.legRequired - order.progress));
  const rest = getTotalPathTicks(state, army, order.path.slice(1));
  return { destination: order.path[order.path.length - 1], ticks: current + rest };
}

/** One crown's share of a wave that has not landed: who sends it and how many hosts. */
export interface PlannedColumns {
  kingdomId: string;
  hosts: number;
}

/**
 * Where a wave that has not landed yet will first meet the realm, and in how many seasons — for the
 * response card, which is asked before any host exists.
 *
 * Plans each host the spawner will send (`launchOffMapInvasion`: host `i` musters on staging
 * district `i`, a crown commits at most `MAX_HOSTS_PER_KINGDOM`, one host through the opening grace),
 * in its court's own mix (march speed is the mix's), and walks the road `tickInvasions` walks
 * (`invasionRoute`, fewest districts) toward the province the shape aims at — or, for a shape that
 * picks on arrival, every province of ours. A host stops at the first province of ours on that road,
 * or beside its target once it is next to it, so that — not the target — is where it arrives. The
 * earliest host is the answer.
 *
 * Measured before this (one column, the reference mix, the cheapest-terrain path to the target):
 * ±1 season 63%, ±2 76% over 133 cards; multi-host and two-crown waves were the misses.
 */
export function plannedWaveArrival(
  state: GameState,
  columns: PlannedColumns[],
  shape: WaveShape,
  aimLandId: string | undefined,
): { landId: string; ticks: number } | undefined {
  const capital = invasionCapital(state);
  if (!capital) return undefined;
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const standing = owned.filter((land) => !provinceIsFalling(state, land.id));
  const targets = aimLandId ? [aimLandId] : (standing.length > 0 ? standing : owned).map((land) => land.id);
  const grace = (state.ascent?.wave ?? 0) <= EARLY_WAVE_GRACE;
  let best: { landId: string; ticks: number } | undefined;

  for (const { kingdomId, hosts } of columns) {
    const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
    const edges = stagingFromEdges(stagingEdgesFor(state, kingdomId, capital), shape.staging);
    if (!kingdom || edges.length === 0) continue;
    const committed = (state.invasions ?? []).filter((record) => record.kingdomId === kingdomId).length;
    const count = grace ? 1 : Math.min(hosts, Math.max(0, MAX_HOSTS_PER_KINGDOM - committed));
    const mix = doctrineHostMix(kingdom.personality);
    for (let i = 0; i < count; i += 1) {
      const stage = edges[i % edges.length];
      const column = {
        id: 'forecast-column', kingdomId, name: '', landId: stage.id,
        units: { spearmen: Math.round(mix.spearmen * 100), archers: Math.round(mix.archers * 100), heavyInfantry: Math.round(mix.heavy * 100) },
        morale: 85, supply: 90, rations: 350, provisions: 250, level: 2, experience: 0, experienceToNextLevel: 160,
      } as unknown as Army;
      for (const targetId of targets) {
        const arrival = walkToContact(state, column, stage.id, targetId);
        if (arrival && (!best || arrival.ticks < best.ticks)) best = arrival;
      }
    }
  }
  return best && { landId: best.landId, ticks: Math.max(1, best.ticks) };
}

/** Walks a planned host along the invader's road until it stands beside ground of ours it will fight. */
function walkToContact(state: GameState, column: Army, fromId: string, targetId: string): { landId: string; ticks: number } | undefined {
  const target = state.lands.find((land) => land.id === targetId);
  if (!target) return undefined;
  const route = invasionRoute(state, fromId, targetId);
  if (!route) return undefined;
  let here = state.lands.find((land) => land.id === fromId);
  let ticks = 0;
  for (const stepId of route) {
    if (!here) return undefined;
    if (target.ownerId === PLAYER_KINGDOM_ID && here.neighbors.includes(target.id)) return { landId: target.id, ticks };
    const step = state.lands.find((land) => land.id === stepId);
    if (!step) return undefined;
    // Columns take their first step on the tick they land (measured: a `1 +` here ran a season long).
    if (step.ownerId === PLAYER_KINGDOM_ID) return { landId: step.id, ticks };
    ticks += getLegTicks(column, step, state);
    here = step;
  }
  return undefined;
}

export function forecastInvader(state: GameState, record: InvasionRecord): InvaderForecast | undefined {
  const invader = state.armies.find((army) => army.id === record.armyId);
  const target = state.lands.find((land) => land.id === record.targetLandId);
  if (!invader || !target) return undefined;

  let reachTicks: number | undefined;
  if (invader.landId === target.id || target.neighbors.includes(invader.landId)) {
    reachTicks = 0;
  } else {
    const path = findLandPath(state, invader.landId, target.id, anyGround);
    if (path) {
      // Every leg but the last (that one is the storm), less what the current leg has already walked.
      const legs = path.slice(0, -1);
      let ticks = getTotalPathTicks(state, invader, legs);
      const order = state.movementOrders.find((candidate) => candidate.armyId === invader.id);
      if (order && order.path[0] === legs[0]) ticks -= Math.min(order.progress, order.legRequired);
      reachTicks = Math.max(0, ticks);
    }
  }
  const walled = target.ownerId === PLAYER_KINGDOM_ID && target.defense > 0;
  const assaultTicks = reachTicks === undefined ? undefined
    : reachTicks + 1 + (walled ? target.siege?.ticksLeft ?? siegeTicksFor(target) : 0);

  const counted: string[] = [];
  const late: string[] = [];
  let hostPower = 0;
  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID || army.isLevy) continue;
    if (army.landId === target.id && !state.movementOrders.some((order) => order.armyId === army.id)) {
      counted.push(army.id);
      hostPower += armyPower(state, army);
      continue;
    }
    const march = marchTicksLeft(state, army.id);
    if (march.destination !== target.id) continue;
    if (assaultTicks === undefined || march.ticks <= assaultTicks) {
      counted.push(army.id);
      hostPower += armyPower(state, army);
    } else {
      late.push(army.id);
    }
  }

  const garrison = target.ownerId === PLAYER_KINGDOM_ID && !provinceIsFalling(state, target.id)
    ? garrisonPower(state, target)
    : 0;
  const ready = combinedDefencePower(state, garrison, hostPower);
  const attack = armyPower(state, invader);
  const siegeMult = record.great ? 0.72 : attack > LARGE_HOST_POWER ? 0.8 : 0.85;
  const ratio = ready > 0 ? attack / (ready * siegeMult) : Infinity;
  const holdPct = ratio <= FUZZ_MIN ? 100 : ratio >= FUZZ_MAX ? 0 : Math.round(((FUZZ_MAX - ratio) / (FUZZ_MAX - FUZZ_MIN)) * 100);
  const verdict: ForecastVerdict = holdPct >= 70 ? 'holds' : holdPct >= 30 ? 'doubt' : 'falls';
  return {
    armyId: invader.id,
    targetLandId: target.id,
    ...(reachTicks !== undefined ? { reachTicks } : {}),
    ...(assaultTicks !== undefined ? { assaultTicks } : {}),
    attack: Math.round(attack),
    ready: Math.round(ready),
    holdPct,
    verdict,
    counted,
    late,
  };
}
