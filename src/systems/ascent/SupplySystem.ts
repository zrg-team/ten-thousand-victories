import {
  SUPPLY_CUT_OFF_FACTOR,
  SUPPLY_HOP_FACTORS,
  SUPPLY_NEIGHBOR_WEIGHTS,
  SUPPLY_MIN_REALM_LANDS,
  ASCENT_TUNING,
} from '../../game/ascentConfig';
import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../../game/constants';
import type { GameState, Land, SupplyReading } from '../../state/types';

export type { SupplyReading };

/**
 * ── Supply lines ────────────────────────────────────────────────────────────────────────────────
 *
 * What the *shape* of the realm is worth, as opposed to its size.
 *
 * Before this the economy could not tell a solid block of twelve provinces from twelve claims
 * scattered behind three rivals' borders: `getTradeNetworkMult` counted owned provinces and never
 * asked whether any of them touched, and `calculateLandOutputs` asked one binary question of each
 * neighbour — is it ours — which scored a neutral market town, an empty moor and a hostile kingdom
 * identically at zero. Nothing anywhere asked whether a province could be reached from the capital
 * at all.
 *
 * Two readings come out of one pass over the existing `land.neighbors` graph:
 *
 *   **hops**  — distance to the capital walking only over ground we hold. Goods have to travel,
 *               and the realm pays for the journey (`SUPPLY_HOP_FACTORS`). Unreachable is the
 *               interesting case: a province whose corridor has been cut keeps its fields and its
 *               people and simply cannot get what it makes to the throne.
 *   **block** — how many provinces are in the connected piece this one belongs to. A trade network
 *               is a thing goods actually move through, so a realm split 8/4 is two networks, not
 *               one of twelve.
 *
 * Dragon Ascent only, by the same guard `settledMult` uses: every entry point returns the literal
 * `1` (or an empty reading) for `rival`, `campaign` and `empire`, so those modes' economies are
 * untouched byte for byte. Note the short-circuits return the *literal* — `1 * x` and a lerp that
 * lands on 1 are not the same float, and a mode-fingerprint diff catches exactly that.
 *
 * No Phaser import: the headless harnesses run thousands of ticks through this file.
 */

/** What a province with nothing to say reads as — foreign ground, and every classic mode. */
export const FULL_SUPPLY: SupplyReading = { hops: 0, block: 1, factor: 1, cutOff: false };

/** Whether the shape of the realm is allowed to move the economy at all. */
export function supplyLinesActive(state: GameState): boolean {
  return state.gameMode === 'ascent';
}

/**
 * The seat the goods are hauled to.
 *
 * `capitalLandId` can move — a story charge reseats the dynasty — so it is read fresh rather than
 * cached, and it falls back to the player's castle the same way every other consumer does. If the
 * capital is not ours (it has been taken and the grace clock is running) there is no seat to haul
 * to and the whole realm reads as cut off, which is the correct and quite deliberate reading.
 */
function capitalOf(state: GameState): Land | undefined {
  const seated = state.lands.find((land) => land.id === state.ascent?.capitalLandId);
  const capital = seated ?? state.lands.find(
    (land) => land.ownerId === PLAYER_KINGDOM_ID && land.type === 'castle',
  );
  return capital?.ownerId === PLAYER_KINGDOM_ID ? capital : undefined;
}

/** Haulage factor for a hop count, with the harness knob applied to the shortfall only. */
function factorForHops(hops: number): number {
  const raw = Number.isFinite(hops)
    ? SUPPLY_HOP_FACTORS[Math.min(hops, SUPPLY_HOP_FACTORS.length - 1)]
    : SUPPLY_CUT_OFF_FACTOR;
  const mult = ASCENT_TUNING.supplyPenaltyMult;
  // Scale the *shortfall*, not the factor: at mult 0 every province delivers whole, which is the
  // pre-supply-lines economy and therefore the A/B arm a sweep actually wants.
  if (mult === 1 || raw === 1) return raw;
  return Math.max(0, Math.min(1, 1 - (1 - raw) * mult));
}

/**
 * One pass: BFS from the capital over owned ground, then label the owned components.
 *
 * Called once per `refreshAllLandOutputs`, which is already O(lands²) because it does a
 * `lands.find` per neighbour (see docs/phase-1/21-frame-ledger.md). This builds the id index that function
 * never had, and a 42-node BFS costs nothing beside what is already being spent there.
 */
export function computeRealmSupply(state: GameState): Map<string, SupplyReading> {
  const readings = new Map<string, SupplyReading>();
  if (!supplyLinesActive(state)) return readings;

  const byId = new Map<string, Land>();
  for (const land of state.lands) byId.set(land.id, land);
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (owned.length === 0) return readings;
  // Below the floor the realm is too small for its shape to be a decision — see
  // `SUPPLY_MIN_REALM_LANDS`. The readings are still produced (the map and the card want to say
  // "cut off" whatever the size), but every factor is the literal 1: nothing is charged.
  const charged = owned.length >= SUPPLY_MIN_REALM_LANDS;

  // ── hops from the seat, across owned ground only ──
  const hops = new Map<string, number>();
  const capital = capitalOf(state);
  if (capital) {
    hops.set(capital.id, 0);
    let frontier = [capital.id];
    let depth = 0;
    while (frontier.length > 0) {
      depth += 1;
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighborId of byId.get(id)?.neighbors ?? []) {
          if (hops.has(neighborId)) continue;
          if (byId.get(neighborId)?.ownerId !== PLAYER_KINGDOM_ID) continue;
          hops.set(neighborId, depth);
          next.push(neighborId);
        }
      }
      frontier = next;
    }
  }

  // ── connected blocks of owned ground ──
  const blockOf = new Map<string, number>();
  const sizes: number[] = [];
  for (const land of owned) {
    if (blockOf.has(land.id)) continue;
    const index = sizes.length;
    const stack = [land.id];
    blockOf.set(land.id, index);
    let size = 0;
    while (stack.length > 0) {
      const id = stack.pop() as string;
      size += 1;
      for (const neighborId of byId.get(id)?.neighbors ?? []) {
        if (blockOf.has(neighborId)) continue;
        if (byId.get(neighborId)?.ownerId !== PLAYER_KINGDOM_ID) continue;
        blockOf.set(neighborId, index);
        stack.push(neighborId);
      }
    }
    sizes.push(size);
  }

  for (const land of owned) {
    const reach = hops.get(land.id) ?? Infinity;
    readings.set(land.id, {
      hops: reach,
      block: sizes[blockOf.get(land.id) ?? -1] ?? 1,
      factor: charged ? factorForHops(reach) : 1,
      cutOff: !Number.isFinite(reach),
    });
  }
  return readings;
}

/**
 * This province's reading, off the cache `refreshAllLandOutputs` writes.
 *
 * Reading the cache rather than recomputing is what keeps this callable from the renderer and the
 * inspect card on every frame. It is self-healing: `refreshAllLandOutputs` runs on every tick and
 * on every build, acquisition and decree, so a stale entry cannot outlive the change that caused
 * it. Anything not in the cache — foreign ground, a classic mode, the frame before the first
 * refresh — reads as fully supplied, which is the pre-existing behaviour.
 */
export function landSupply(state: GameState, landId: string): SupplyReading {
  return state.ascent?.supply?.[landId] ?? FULL_SUPPLY;
}

/** The delivered share of a province's output. Exactly `1` outside Dragon Ascent. */
export function supplyFactor(state: GameState, land: Land): number {
  if (!supplyLinesActive(state)) return 1;
  if (land.ownerId !== PLAYER_KINGDOM_ID) return 1;
  return landSupply(state, land.id).factor;
}

/**
 * What this province's neighbours are worth to its trade, summed.
 *
 * Returns the plain count of owned neighbours outside Dragon Ascent, which is what the caller did
 * before and what keeps the classic modes identical.
 */
export function neighborTradeWeight(state: GameState, land: Land): number {
  const weights = SUPPLY_NEIGHBOR_WEIGHTS;
  const active = supplyLinesActive(state);
  let sum = 0;
  for (const neighborId of land.neighbors) {
    const neighbor = state.lands.find((other) => other.id === neighborId);
    if (!neighbor) continue;
    if (neighbor.ownerId === PLAYER_KINGDOM_ID) {
      sum += weights.own;
      continue;
    }
    if (!active) continue;
    if (neighbor.ownerId === NEUTRAL_OWNER_ID) {
      sum += neighbor.hasVillage ? weights.neutralVillage : weights.neutralWild;
    } else {
      sum += weights.rival;
    }
  }
  return sum;
}

/**
 * Provinces whose route home changed since the last reading — the toast the player learns from.
 *
 * Diffed against the previous cache before it is overwritten, so no new state is needed to know
 * that *this* is the tick a corridor was cut.
 */
export function diffSupplySeverance(
  previous: Record<string, SupplyReading> | undefined,
  next: Map<string, SupplyReading>,
): { cut: string[]; restored: string[] } {
  const cut: string[] = [];
  const restored: string[] = [];
  if (!previous) return { cut, restored };
  for (const [id, reading] of next) {
    const before = previous[id];
    // A province with no previous reading is one just taken, not one just severed. Announcing it
    // would fire the alarm on every claim made behind a border, which is a normal way to expand.
    if (!before) continue;
    if (reading.cutOff && !before.cutOff) cut.push(id);
    if (!reading.cutOff && before.cutOff) restored.push(id);
  }
  return { cut, restored };
}
