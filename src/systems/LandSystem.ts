import { registryTallies } from './decree/rules';
import { isEndlessMode, PLAYER_KINGDOM_ID } from '../game/constants';
import { ENEMY_SPOT_RADIUS } from '../game/ascentConfig';
import type { GameState, Land, SiegeOrder } from '../state/types';
import { t } from '../i18n';

/** Larger, better-defended, more developed districts take longer to siege or settle. */
export function getAcquisitionTicksRequired(land: Land): number {
  const valueScore = land.defense + land.buildingCapacity * 2 + (land.terrainSummary.fortress + land.terrainSummary.shrine) * 4;
  return Math.max(2, Math.min(6, Math.round(valueScore / 12)));
}

export function findLand(state: GameState, landId: string): Land | undefined {
  return state.lands.find((land) => land.id === landId);
}

export function isAdjacent(state: GameState, fromLandId: string, toLandId: string): boolean {
  const fromLand = findLand(state, fromLandId);
  return fromLand?.neighbors.includes(toLandId) ?? false;
}

export function getPlayerArmyAtLand(state: GameState, landId: string) {
  return state.armies.find((army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === landId);
}

export function isLandVisibleToPlayer(state: GameState, landId: string): boolean {
  return findLand(state, landId)?.isVisible ?? false;
}

export function refreshPlayerVisibility(state: GameState): void {
  const visibleLandIds = new Set<string>();

  // Sổ đinh · tín bài — the Nguyễn registry. Everyone counted, everyone carrying a tag, and the
  // throne able to read any prefecture off a ledger without sending anyone to look. Information as
  // a decree: the map is simply legible, which is what the clerks in every village are *for* and
  // exactly why the countryside resents them.
  if (registryTallies(state)) {
    for (const land of state.lands) visibleLandIds.add(land.id);
  }

  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }

    visibleLandIds.add(land.id);
    for (const neighborId of land.neighbors) {
      visibleLandIds.add(neighborId);
    }
  }

  for (const order of state.acquisitionOrders) {
    if (order.buyerId === PLAYER_KINGDOM_ID) {
      visibleLandIds.add(order.landId);
    }
  }

  addHostileHostSightings(state, visibleLandIds);

  for (const land of state.lands) {
    land.isVisible = visibleLandIds.has(land.id);
    land.isExplored = land.isExplored || land.isVisible;
  }
}

/**
 * Lights the ground a hostile host is marching over, within scouting range of the realm.
 *
 * Dragon Ascent only, and the other half of making an invasion something the player watches
 * approach. Even after invaders were given real marches, the approach happened entirely in the
 * dark: visibility is owned-plus-neighbours, and `ArmyRenderer.drawArmies` skips any army on an
 * invisible land — so a host became visible only on the tick it arrived beside the realm, having
 * apparently materialised there.
 *
 * A scouting radius rather than a fog lift: only provinces carrying an enemy host are revealed,
 * and only those within `ENEMY_SPOT_RADIUS` hops of ground the player holds. The rest of the map
 * stays dark, so exploration still means something.
 */
function addHostileHostSightings(state: GameState, visibleLandIds: Set<string>): void {
  if (state.gameMode !== 'ascent') {
    return;
  }

  const hostileLandIds = new Set(
    state.armies
      .filter((army) => army.kingdomId !== PLAYER_KINGDOM_ID)
      .map((army) => army.landId),
  );
  if (hostileLandIds.size === 0) {
    return;
  }

  // Breadth-first out from owned ground, so "within N hops" counts hops rather than distance.
  let frontier = state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .map((land) => land.id);
  const seen = new Set(frontier);

  for (let hop = 0; hop < ENEMY_SPOT_RADIUS && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const landId of frontier) {
      const land = findLand(state, landId);
      if (!land) continue;
      for (const neighborId of land.neighbors) {
        if (seen.has(neighborId)) continue;
        seen.add(neighborId);
        next.push(neighborId);
        if (hostileLandIds.has(neighborId)) {
          visibleLandIds.add(neighborId);
        }
      }
    }
    frontier = next;
  }
}

export function getAcquisitionOrder(state: GameState, landId: string) {
  return state.acquisitionOrders.find((order) => order.landId === landId);
}

export function getSiegeOrder(state: GameState, landId: string) {
  return state.siegeOrders.find((order) => order.landId === landId);
}

/**
 * The claim standing on a province of ours whose walls are already carried, or nothing.
 *
 * **The window nothing knew about.** Winning a fight at a province does not take it: the winner
 * walks onto the ground and `resolveInvaderBattle` lays a `SiegeOrder`, and the flag turns 2-6
 * seasons later in `progressSiegeOrders`. For that whole stretch `land.ownerId` is still the
 * player's — so every guard in the game that asks "is this still ours?" answered yes about ground
 * that was already lost. Reported, all three from this one gap: *other fights still happen at the
 * same place*, *it is a blank fight because the land is occupied*, and *it still asks me to
 * rebuild*.
 *
 * So the window gets a name. A falling province stays ours on the map and keeps a quarter of its
 * yield, but it is frozen to orders, raises no militia, opens no new fight of its own, and can be
 * won back by an army the player sends — see `provinceIsFalling`'s callers.
 *
 * Mode-gated **here**, not at the call sites, because `applyAttackOutcome` lays hostile claims on
 * player ground in the classic modes too, and sixteen callers each remembering the gate is sixteen
 * chances to forget it. Dragon Ascent only; everywhere else this is always undefined.
 */
export function hostileClaimAt(state: GameState, landId: string): SiegeOrder | undefined {
  if (state.gameMode !== 'ascent') return undefined;
  const land = findLand(state, landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) return undefined;
  return state.siegeOrders.find(
    (order) => order.landId === landId && order.attackerKingdomId !== PLAYER_KINGDOM_ID,
  );
}

/** True while `landId` is ours on the map and already being taken. See `hostileClaimAt`. */
export function provinceIsFalling(state: GameState, landId: string): boolean {
  return hostileClaimAt(state, landId) !== undefined;
}

export function checkVictory(state: GameState): void {
  // Endless modes have no map-conquest win. Empire mode's only win is prestige
  // Ascension (climb to the Heavenly Mandate era and complete the Ascension directive);
  // Dragon Ascent has none at all — it is a score chase that ends in defeat.
  if (isEndlessMode(state.gameMode)) {
    if (state.mandate?.ascended && !state.victory) {
      state.victory = true;
      state.message = t('empire.ascend.victory');
    }
    return;
  }

  const enemyCastles = state.lands.filter(
    (land) => land.type === 'enemyCastle' && land.ownerId !== PLAYER_KINGDOM_ID,
  );
  state.victory = enemyCastles.length === 0;

  if (state.victory) {
    state.message = t('msg.victory');
  }
}
