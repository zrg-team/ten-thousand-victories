/**
 * Đường thủy — a province on the water trades by water.
 *
 * Reported 2026-09-15: gold grew too fast, and the lever behind it was *owning land next to land*.
 * Each owned neighbour added two roads to a province (four gold a market level) and every province
 * in the connected block added another +9% to every coin line, up to +160%. So the answer to "where
 * should I expand?" was always "next to what I already hold", and the map had nothing else to say.
 * The player asked for the opposite: make adjacency nearly worthless and make *water* the thing a
 * trading province wants — a river or a coast is a road that costs nothing to keep.
 *
 * Water had never paid anything, though every line was written for it. The generator never gives a
 * water hex a `landId`, so `terrainSummary.water` is 0 on every province of every seed (measured on
 * all 42, three seeds) and `waterBonus`, the aptitude `wet` term and the harbour gate read a zero
 * for ever. This counts what a province really has instead: **its own hexes that touch water**.
 * Measured over eight seeds: 4–16 of the 42 provinces touch water, holding 1–23 such hexes, and the
 * capital does in two seeds of eight — so water is a place worth reaching for, not a given.
 *
 * Inert unless the run's rules turn it on (`waterTrade`); every reader returns the literal 1 or 0
 * otherwise, so v1 and the classic modes keep their numbers to the digit.
 *
 * A leaf: map helpers, config and the ruleset registry only. `ResourceSystem` reads it.
 */
import { hexKey, hexNeighbors } from '../../map/hex';
import type { HexTile } from '../../map/hexMapGenerator';
import {
  WATER_IRRIGATION_MAX,
  WATER_IRRIGATION_PER_HEX,
  WATER_MARKET_FLAT_MAX,
  WATER_MARKET_FLAT_PER_HEX,
  WATER_TRADE_BASE,
  WATER_TRADE_MAX,
  WATER_TRADE_PER_HEX,
  WATER_WET_FULL_HEXES,
} from '../../game/ascentConfig';
import { rulesOf } from '../../game/ascentRuleset';
import type { GameState, Land } from '../../state/types';

/** Per world: province id → its hexes that touch a water hex. The map never changes in a run. */
const WATERSIDE = new WeakMap<HexTile[], Map<string, number>>();

function watersideTable(tiles: HexTile[]): Map<string, number> {
  const cached = WATERSIDE.get(tiles);
  if (cached) return cached;
  const byKey = new Map<string, HexTile>();
  for (const tile of tiles) byKey.set(hexKey(tile.coord), tile);
  const table = new Map<string, number>();
  for (const tile of tiles) {
    if (!tile.landId || tile.terrain === 'water') continue;
    const wet = hexNeighbors(tile.coord).some((coord) => byKey.get(hexKey(coord))?.terrain === 'water');
    if (wet) table.set(tile.landId, (table.get(tile.landId) ?? 0) + 1);
  }
  WATERSIDE.set(tiles, table);
  return table;
}

/** The province's own hexes on a river bank or the coast. Independent of any rule. */
export function watersideHexes(state: GameState, land: Pick<Land, 'id'>): number {
  const tiles = state.hexTiles;
  if (!tiles?.length) return 0;
  return watersideTable(tiles).get(land.id) ?? 0;
}

/** True when this run trades by water. */
export function waterTradeActive(state: GameState): boolean {
  return state.gameMode === 'ascent' && rulesOf(state).waterTrade;
}

/** The share water adds to a province's coin lines: 0 without water or without the rule. */
export function waterTradeBonus(state: GameState, land: Pick<Land, 'id'>): number {
  if (!waterTradeActive(state)) return 0;
  const hexes = watersideHexes(state, land);
  if (hexes <= 0) return 0;
  return Math.min(WATER_TRADE_MAX, WATER_TRADE_BASE + WATER_TRADE_PER_HEX * hexes);
}

/** What a province's trade-carried coin is multiplied by. The literal 1 when nothing applies. */
export function waterTradeMult(state: GameState, land: Pick<Land, 'id'>): number {
  const bonus = waterTradeBonus(state, land);
  return bonus > 0 ? 1 + bonus : 1;
}

/** Flat coin a market level earns from the quay. */
export function waterMarketFlat(state: GameState, land: Pick<Land, 'id'>): number {
  if (!waterTradeActive(state)) return 0;
  return Math.min(WATER_MARKET_FLAT_MAX, WATER_MARKET_FLAT_PER_HEX * watersideHexes(state, land));
}

/** Grain a farm level draws from irrigation — what the dead `waterBonus` was always meant to be. */
export function waterIrrigation(state: GameState, land: Pick<Land, 'id'>): number {
  if (!waterTradeActive(state)) return 0;
  return Math.min(WATER_IRRIGATION_MAX, WATER_IRRIGATION_PER_HEX * watersideHexes(state, land));
}

/** 0–1: how wet the province reads to the focus advisor. `undefined` when the rule is off. */
export function waterWetness(state: GameState | undefined, land: Pick<Land, 'id'>): number | undefined {
  if (!state || !waterTradeActive(state)) return undefined;
  return Math.min(1, watersideHexes(state, land) / WATER_WET_FULL_HEXES);
}

/** True when the ground can take a harbour under this run's rules. */
export function canHarbour(state: GameState, land: Pick<Land, 'id'>): boolean {
  return waterTradeActive(state) && watersideHexes(state, land) > 0;
}
