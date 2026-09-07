import { marchRouteCost } from './hostileMarch';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { ARMY_RESUPPLY_TICKS, MARCH_MIN_WIN_CHANCE, SUPPLY_TICKS_HELD } from '../../game/ascentConfig';
import { applyResourceDelta } from '../ResourceSystem';
import {
  armyPower,
  cancelSiege,
  createBattlePreview,
  findLandPath,
  issueHuntOrder,
  issueMoveOrder,
} from '../WarSystem';
import { findLand } from '../LandSystem';
import { pushToast } from '../empire/notifications';
import { finishBattle } from './BattleSystem';
import { landGarrisonPower } from './PowerSystem';
import { armyOrders, commandableHosts, hostOrderLabel, isEngagedHost, isPinnedByClaim } from './armyOrders';
import { t } from '../../i18n';
import type { Army, ArmyOrders, GameState } from '../../state/types';

/**
 * A host does what it was told (Dragon Ascent).
 *
 * The autopilot used to command every host, every tick: it marched all but one idle host at the
 * front, rewrote `autoDefend` on each of them, and dissolved anything under a company as a
 * remnant — so a host the player had parked was gone or somewhere else by the next season, and
 * "why did my army move" was the most common question the mode raised. Standing orders are the
 * answer: a host under `defend`, `attack`, `follow` or `hunt` is moved by this file alone, and
 * the autopilot keeps only the hosts left to it (`orders.kind === 'auto'`).
 *
 * The rules are deliberately dull. A defending host walks back if displaced and the road is open,
 * and otherwise holds where it is; an attacking host reaches its target's border and storms it
 * once the odds clear the same gate the autopilot uses, then settles into defending whatever
 * ground it ends on; a following host keeps station on its leader's province, or the nearest
 * owned one; a hunting host re-issues its pursuit. Every change of state is announced once.
 */

const size = (army: Army): number => army.units.spearmen + army.units.archers + army.units.heavyInfantry;

function busy(state: GameState, army: Army): boolean {
  return state.movementOrders.some((order) => order.armyId === army.id)
    || state.siegeOrders.some((order) => order.armyId === army.id)
    || isEngagedHost(state, army.id);
}

/** Odds this host would storm `landId` with — the same figure the conquest sheet quotes. */
export function hostOddsAgainst(state: GameState, army: Army, landId: string): number {
  const land = findLand(state, landId);
  if (!land) return 0;
  const preview = createBattlePreview(state, army.id, land.id);
  if (preview) return preview.winChance;
  const attack = armyPower(state, army);
  return Math.round((attack / Math.max(1, attack + landGarrisonPower(state, land))) * 100);
}

/** The owned province closest to `fromLandId` by road, if any road exists. */
export function nearestOwnedLand(state: GameState, fromLandId: string): string | undefined {
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID && land.id !== fromLandId);
  let best: { id: string; legs: number } | undefined;
  for (const land of owned) {
    const path = findLandPath(state, fromLandId, land.id);
    if (!path) continue;
    if (!best || path.length < best.legs) best = { id: land.id, legs: path.length };
  }
  return best?.id;
}

/** The owned neighbour of `landId` this host can reach soonest — where an assault is staged from. */
function stagingFor(state: GameState, army: Army, landId: string, hostileTransit = false): string | undefined {
  const target = findLand(state, landId);
  if (!target) return undefined;
  let best: { id: string; legs: number } | undefined;
  for (const neighbourId of target.neighbors) {
    const neighbour = findLand(state, neighbourId);
    if (!neighbour || neighbour.ownerId !== PLAYER_KINGDOM_ID) continue;
    if (neighbour.id === army.landId) return neighbour.id;
    const path = findLandPath(state, army.landId, neighbour.id)
      ?? (hostileTransit ? findLandPath(state, army.landId, neighbour.id, () => true) : undefined);
    if (!path) continue;
    if (!best || marchRouteCost(state, path) < best.legs) best = { id: neighbour.id, legs: marchRouteCost(state, path) };
  }
  return best?.id;
}

/**
 * Why this host will refuse an order, phrased for the player — or undefined when it will take one.
 *
 * The one place that answers the question, because three places were answering it differently and
 * the player paid for the disagreement. `setArmyOrders` refused a host in refit and an auxiliary;
 * `buildHostPickerRows` offered both as tappable rows; and `executeConquestMethod` then reported
 * the refusal as "every host is busy elsewhere", which is not what happened. Measured on the real
 * tap path: a host mid-refit was offered on the siege sheet, the first tap gave the wrong reason,
 * and the second gave none at all — the sheet re-raised itself with "that came to nothing" for as
 * long as the player kept pressing, with the world clock stopped throughout.
 *
 * A missing or foreign host returns undefined rather than a reason: there is nothing to say to the
 * player about a host that is not theirs and was never on the sheet. `setArmyOrders` still refuses
 * it; this function is about the ones worth explaining.
 */
export function hostOrderRefusal(state: GameState, armyId: string): string | undefined {
  const army = state.armies.find((candidate) => candidate.id === armyId && candidate.kingdomId === PLAYER_KINGDOM_ID);
  if (!army) return undefined;
  // An auxiliary is nobody's to command — the same line `isAutoHost` draws, for the same reason.
  if (army.patron) return t('ascent.pick.blocked.auxiliary');
  if (army.isLevy) return t('ascent.pick.blocked.levy');
  if (army.refit) return t('ascent.army.refitBusy');
  return undefined;
}

/**
 * Gives a host its standing order and acts on it at once, so a march or a hunt starts on the tap
 * rather than a season later. Returns false when the order names nothing.
 */
export function setArmyOrders(state: GameState, armyId: string, orders: ArmyOrders): boolean {
  const army = state.armies.find((candidate) => candidate.id === armyId && candidate.kingdomId === PLAYER_KINGDOM_ID);
  if (!army || army.isLevy || army.patron) return false;
  // A host mid-refit takes no orders — the order surfaces all say so; this is the backstop for
  // anything that reaches the system directly.
  if (army.refit) {
    state.message = t('ascent.army.refitBusy');
    return false;
  }
  if ((orders.kind === 'defend' || orders.kind === 'attack') && !findLand(state, orders.landId)) return false;
  if ((orders.kind === 'follow' || orders.kind === 'hunt')
    && (orders.armyId === army.id || !state.armies.some((candidate) => candidate.id === orders.armyId))) return false;

  army.orders = orders.kind === 'auto' ? undefined : { ...orders };
  // A commanded host is not the autopilot's to intercept with; the flag is the autopilot's own
  // and it recomputes it for auto hosts every tick.
  if (orders.kind !== 'auto') army.autoDefend = false;
  // A fresh order supersedes whatever march the last one had under way — except a fight, which
  // is left only through the battle's own orders.
  if (!isEngagedHost(state, army.id) && orders.kind !== 'hunt') {
    state.movementOrders = state.movementOrders.filter((order) => order.armyId !== army.id);
  }
  applyOrdersNow(state, army);
  pushToast(state, t('ascent.orders.set', { army: army.name, order: hostOrderLabel(state, army) }), 'info');
  return true;
}

/**
 * Breaks a host off from whatever it is doing and brings it home: out of the fight, off the
 * siege, and marching for the capital (or the nearest owned province with a road). The host then
 * holds wherever it lands.
 */
export function recallHost(state: GameState, armyId: string): { ok: boolean; reason?: string } {
  const army = state.armies.find((candidate) => candidate.id === armyId && candidate.kingdomId === PLAYER_KINGDOM_ID);
  if (!army || army.isLevy || army.patron) return { ok: false };
  if (army.refit) return { ok: false, reason: t('ascent.army.refitBusy') };

  // Out of the line first: a withdrawal is battle-wide, exactly as the screen's own Retreat is.
  if (isEngagedHost(state, army.id)) finishBattle(state, 'retreat');
  const siege = state.siegeOrders.find((order) => order.armyId === army.id);
  if (siege) cancelSiege(state, army.id, siege.landId);
  state.movementOrders = state.movementOrders.filter((order) => order.armyId !== army.id);

  const capitalId = state.ascent?.capitalLandId;
  const capital = capitalId ? findLand(state, capitalId) : undefined;
  const homeId = capital && capital.ownerId === PLAYER_KINGDOM_ID
    && (army.landId === capital.id || findLandPath(state, army.landId, capital.id))
    ? capital.id
    : nearestOwnedLand(state, army.landId)
      ?? (findLand(state, army.landId)?.ownerId === PLAYER_KINGDOM_ID ? army.landId : undefined);
  if (!homeId) {
    return { ok: false, reason: t('ascent.orders.noRoadHome', { army: army.name }) };
  }

  army.orders = { kind: 'defend', landId: homeId };
  army.autoDefend = false;
  if (homeId !== army.landId) issueMoveOrder(state, army.id, homeId);
  const home = findLand(state, homeId);
  pushToast(state, t('ascent.orders.recalled', { army: army.name, land: home?.name ?? homeId }), 'info');
  return { ok: true };
}

/** What a manual resupply would move, and why it cannot when it cannot. */
export function resupplyPreview(state: GameState, armyId: string): {
  wantRations: number;
  wantProvisions: number;
  food: number;
  supplies: number;
  blocked?: string;
} {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army) return { wantRations: 0, wantProvisions: 0, food: 0, supplies: 0, blocked: t('ascent.orders.resupplyNone') };
  const total = Math.max(1, size(army));
  // Mirrors the burn rate in `progressArmyLogistics`, and the target `autoResupply` keeps to.
  const wantRations = Math.max(1, Math.ceil(total / 100)) * SUPPLY_TICKS_HELD;
  const wantProvisions = Math.max(1, Math.ceil(total / 150)) * SUPPLY_TICKS_HELD;
  // The player's own hand may reach below the autopilot's reserve — that is the one thing this
  // button does that the autopilot would not — but never below nothing.
  const food = Math.min(Math.max(0, wantRations - army.rations), Math.max(0, Math.floor(state.resources.food)));
  const supplies = Math.min(Math.max(0, wantProvisions - army.provisions), Math.max(0, Math.floor(state.resources.supplies)));
  let blocked: string | undefined;
  // A refitting host takes no orders, a resupply among them; and one column at a time — a
  // second tap while the first is on the road would double-bill the stores.
  if (army.refit) blocked = t('ascent.army.refitBusy');
  else if (army.resupplyRun) blocked = t('ascent.orders.resupplyEnRoute', { n: army.resupplyRun.ticksLeft });
  else if (army.rations >= wantRations && army.provisions >= wantProvisions) blocked = t('ascent.orders.resupplyFull');
  else if (food <= 0 && supplies <= 0) blocked = t('ascent.orders.resupplyNone');
  return { wantRations, wantProvisions, food, supplies, blocked };
}

/** Tops a host's baggage up from the realm's stores. */
export function resupplyHost(state: GameState, armyId: string): { ok: boolean; food: number; supplies: number; reason?: string } {
  const army = state.armies.find((candidate) => candidate.id === armyId && candidate.kingdomId === PLAYER_KINGDOM_ID);
  if (!army) return { ok: false, food: 0, supplies: 0 };
  const preview = resupplyPreview(state, armyId);
  if (preview.blocked) return { ok: false, food: 0, supplies: 0, reason: preview.blocked };
  // The stores are debited on the tap; the baggage arrives over the column's ticks
  // (`tickArmyRefits`). The host acts freely while it comes — a resupply costs patience, not
  // the host's freedom, which is what separates it from a refit.
  applyResourceDelta(state, { food: -preview.food, supplies: -preview.supplies });
  army.resupplyRun = { ticksLeft: ARMY_RESUPPLY_TICKS, food: preview.food, supplies: preview.supplies };
  pushToast(state, t('ascent.orders.resupplySent', {
    army: army.name, food: preview.food, supplies: preview.supplies, n: ARMY_RESUPPLY_TICKS,
  }), 'info');
  return { ok: true, food: preview.food, supplies: preview.supplies };
}

/** Falls back to holding the ground the host stands on, and says why. */
function settle(state: GameState, army: Army, key: 'ascent.orders.taken' | 'ascent.orders.repelled' | 'ascent.orders.noRoad' | 'ascent.orders.lostLeader', landId?: string): void {
  const land = landId ? findLand(state, landId) : undefined;
  const here = findLand(state, army.landId);
  army.orders = { kind: 'defend', landId: army.landId };
  pushToast(state, t(key, { army: army.name, land: land?.name ?? '', here: here?.name ?? '' }), 'info');
}

/** One host, one season: the step `tickStandingOrders` takes and `setArmyOrders` takes at once. */
function applyOrdersNow(state: GameState, army: Army): void {
  // A refit freezes the standing order where it stands: the host neither marches nor storms
  // until the work is done. It resumes its old order on the tick the refit completes.
  if (army.refit) return;
  const orders = armyOrders(army);
  if (orders.kind === 'auto') return;
  const here = findLand(state, army.landId);

  switch (orders.kind) {
    case 'defend': {
      if (army.landId === orders.landId) { orders.holding = false; return; }
      if (busy(state, army)) return;
      const post = findLand(state, orders.landId);
      if (post?.ownerId === PLAYER_KINGDOM_ID && (findLandPath(state, army.landId, post.id)
        ?? (orders.hostileTransit ? findLandPath(state, army.landId, post.id, () => true) : undefined))) {
        orders.holding = false;
        issueMoveOrder(state, army.id, post.id, orders.hostileTransit);
        return;
      }
      if (!orders.holding) {
        orders.holding = true;
        pushToast(state, t('ascent.orders.holdLost', { army: army.name, land: post?.name ?? '', here: here?.name ?? '' }), 'info');
      }
      return;
    }
    case 'attack': {
      const target = findLand(state, orders.landId);
      if (!target) { settle(state, army, 'ascent.orders.noRoad', orders.landId); return; }
      if (target.ownerId === PLAYER_KINGDOM_ID) { settle(state, army, 'ascent.orders.taken', target.id); return; }
      if (busy(state, army) || isPinnedByClaim(state, army)) return;
      if (orders.struck) { settle(state, army, 'ascent.orders.repelled', target.id); return; }
      if (here?.neighbors.includes(target.id)) {
        const odds = hostOddsAgainst(state, army, target.id);
        if (odds >= MARCH_MIN_WIN_CHANCE || orders.force) {
          orders.holding = false;
          orders.struck = true;
          issueMoveOrder(state, army.id, target.id);
          return;
        }
        if (!orders.holding) {
          orders.holding = true;
          pushToast(state, t('ascent.orders.holdOdds', { army: army.name, land: target.name, pct: odds }), 'info');
        }
        return;
      }
      const staging = stagingFor(state, army, target.id, orders.hostileTransit);
      if (!staging) { settle(state, army, 'ascent.orders.noRoad', target.id); return; }
      if (staging !== army.landId) issueMoveOrder(state, army.id, staging, orders.hostileTransit);
      return;
    }
    case 'follow': {
      const leader = state.armies.find((candidate) => candidate.id === orders.armyId && candidate.kingdomId === PLAYER_KINGDOM_ID);
      if (!leader) { settle(state, army, 'ascent.orders.lostLeader'); return; }
      if (busy(state, army)) return;
      const leaderLand = findLand(state, leader.landId);
      const dest = leaderLand?.ownerId === PLAYER_KINGDOM_ID
        ? leader.landId
        : leaderLand?.neighbors.find((id) => findLand(state, id)?.ownerId === PLAYER_KINGDOM_ID);
      if (!dest || dest === army.landId) return;
      if (findLandPath(state, army.landId, dest)) {
        orders.holding = false;
        issueMoveOrder(state, army.id, dest);
        return;
      }
      if (!orders.holding) {
        orders.holding = true;
        pushToast(state, t('ascent.orders.holdUnreachable', { army: army.name, leader: leader.name }), 'info');
      }
      return;
    }
    case 'hunt': {
      const quarry = state.armies.find((candidate) => candidate.id === orders.armyId);
      if (!quarry || size(quarry) <= 0) { settle(state, army, 'ascent.orders.lostLeader'); return; }
      if (state.movementOrders.some((order) => order.armyId === army.id) || isEngagedHost(state, army.id)) return;
      if (!issueHuntOrder(state, army.id, quarry.id)) settle(state, army, 'ascent.orders.noRoad');
      return;
    }
  }
}

/** Every commanded host takes its step. Called right after the autopilot each tick. */
export function tickStandingOrders(state: GameState): void {
  if (state.gameMode !== 'ascent' || !state.ascent) return;
  for (const army of commandableHosts(state)) {
    if (armyOrders(army).kind === 'auto') continue;
    applyOrdersNow(state, army);
  }
}
