/**
 * The stores: grain that rots, goods that spoil, and the markets that turn a surplus into coin.
 *
 * Measured over eight seeded runs of the steward driver (focus by aptitude, governors posted),
 * whichever resource the realm's ground favoured piled up without limit — 66,050 food on one
 * seed, 35,615 supplies on another — while the other ran short and the treasury sat at nothing.
 * Nothing in the mode consumed a stock that size: a full host musters on a few hundred grain, a
 * burnt district is made good for tens, and the only exchange was a charter with a warm court.
 * The favoured resource stopped being a resource within a hundred seasons of the founding.
 *
 * Two answers, and they are one mechanic seen from both sides:
 *
 *  - **The stores waste.** Above `STORE_WASTE_SEASONS` of the realm's own use, the excess loses
 *    `STORE_WASTE_RATE` a season — the granary's capacity is seasons of consumption, not a number.
 *    The same shape as the treasury's graft, for the same reason: a stock nobody can spend is a
 *    scoreboard that has stopped counting, and a stock that rots is a rate the player manages —
 *    which is what the focus dial is for.
 *  - **The markets sell.** Once a season, each counting house the realm has built moves
 *    `SALE_UNITS_PER_MARKET_LEVEL` of grain or goods for coin at a flat rate well under what a
 *    charter with a cordial court pays. Throughput is bounded by what the player built, so a
 *    glut drains over seasons rather than in one tap, and a market is worth upgrading for
 *    something other than its own output.
 *
 * Waste is taken from the *stock* after the season's income lands, not folded into the rate the
 * header shows. The famine card reads `resourceRates.food` for its runway, and a rate dragged
 * negative by rot on a granary holding twenty thousand grain would raise a famine on a realm
 * that has never been fuller. The ledger carries the figure instead (`AscentLedger.waste`).
 *
 * A leaf: reads state and config, imports no other system.
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  SALE_GOLD_PER_FOOD,
  SALE_GOLD_PER_SUPPLY,
  SALE_LOTS_PER_SEASON,
  SALE_THIN_LOT_RATE,
  SALE_UNITS_PER_MARKET_LEVEL,
  STORE_WASTE_FLOOR,
  STORE_WASTE_RATE,
  STORE_WASTE_SEASONS,
  GLUT_DECAY,
  GLUT_DEPTH,
  GLUT_FLOOR,
} from '../../game/ascentConfig';
import { rulesOf } from '../../game/ascentRuleset';
import { pushToast } from '../empire/notifications';
import { resourceLabel, resourceToken, t } from '../../i18n';
import type { GameState } from '../../state/types';

export type StoreKey = 'food' | 'supplies';
export const STORE_KEYS: readonly StoreKey[] = ['food', 'supplies'];

/** What the realm itself consumes a season of a store: the demand side of the books, floored at 0. */
export function storeUse(state: GameState, key: StoreKey): number {
  return Math.max(0, state.ascentLedger?.[key].demand ?? 0);
}

/** Stock above which a store wastes: seasons of the realm's own use, never below the floor. */
export function storeWasteFrom(state: GameState, key: StoreKey): number {
  return Math.max(STORE_WASTE_FLOOR, Math.round(storeUse(state, key) * STORE_WASTE_SEASONS));
}

/** Applies the season's waste to the stores and writes it into the ledger. Ascent only. */
export function tickStoreWaste(state: GameState): void {
  if (state.gameMode !== 'ascent' || !state.ascentLedger) return;
  const waste = { food: 0, supplies: 0 };
  for (const key of STORE_KEYS) {
    const excess = state.resources[key] - storeWasteFrom(state, key);
    if (excess <= 0) continue;
    const lost = Math.floor(excess * STORE_WASTE_RATE);
    if (lost <= 0) continue;
    state.resources[key] -= lost;
    waste[key] = lost;
  }
  state.ascentLedger.waste = waste;
}

/**
 * Units of grain or goods the realm's counting houses can move in a season. Markets, harbours
 * and guilds — the buildings whose whole business is trade — each level a lot.
 */
export function marketCapacity(state: GameState): number {
  let levels = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
    for (const building of land.buildings) {
      if (building.type === 'market' || building.type === 'harbor' || building.type === 'guild') levels += building.level;
    }
  }
  return levels * SALE_UNITS_PER_MARKET_LEVEL;
}

export function saleGoldPerUnit(key: StoreKey): number {
  return key === 'food' ? SALE_GOLD_PER_FOOD : SALE_GOLD_PER_SUPPLY;
}

/**
 * Units of a store the markets have taken lately, decayed to this season (marketGlut).
 *
 * Reported 2026-09-15: a realm selling its full lot of goods every season turned 1,120 goods into
 * 224 gold, half its gross, at a price that never moved. A market that is fed the same glut season
 * after season pays less for it; one left to rest recovers.
 */
export function recentSales(state: GameState, key: StoreKey): number {
  const sale = state.ascent?.storeSales?.[key];
  if (!sale?.recent || sale.recentTurn === undefined) return 0;
  return sale.recent * Math.pow(GLUT_DECAY, Math.max(0, state.turn - sale.recentTurn));
}

/** The share of the base price the market pays right now: 1 when rested, never under `GLUT_FLOOR`. The literal 1 when the rule is off. */
export function marketGlutFactor(state: GameState, key: StoreKey): number {
  if (state.gameMode !== 'ascent' || !rulesOf(state).marketGlut) return 1;
  const capacity = marketCapacity(state);
  if (capacity <= 0) return 1;
  const recent = recentSales(state, key);
  if (recent <= 0) return 1;
  return Math.max(GLUT_FLOOR, 1 / (1 + recent / (GLUT_DEPTH * capacity)));
}

/** Lots of this store already sold this season. The markets take `SALE_LOTS_PER_SEASON`. */
export function lotsSoldThisSeason(state: GameState, key: StoreKey): number {
  const sale = state.ascent?.storeSales?.[key];
  return sale && sale.turn === state.turn ? sale.lots : 0;
}

export interface SaleQuote {
  key: StoreKey;
  /** What one tap would sell — the lot, or what is left of the stock. */
  units: number;
  gold: number;
  /** The lot the markets can move a season. Zero when there is no counting house at all. */
  capacity: number;
  /** True for the season's second lot, which the thinned market pays less for. */
  thin: boolean;
  /** Share of the base price a glutted market pays (1 = rested). */
  glut: number;
  /** Why it cannot be sold right now, when it cannot. */
  blocked?: 'no-market' | 'nothing' | 'sold';
}

/** The sale the Ledger page offers, quoted from the same arithmetic `sellStores` runs. */
export function saleQuote(state: GameState, key: StoreKey): SaleQuote {
  const capacity = marketCapacity(state);
  const lots = lotsSoldThisSeason(state, key);
  const thin = lots >= 1;
  const units = Math.max(0, Math.min(capacity, Math.floor(state.resources[key])));
  const glut = marketGlutFactor(state, key);
  const gold = glut === 1
    ? Math.floor(units * saleGoldPerUnit(key) * (thin ? SALE_THIN_LOT_RATE : 1))
    : Math.floor(units * saleGoldPerUnit(key) * glut * (thin ? SALE_THIN_LOT_RATE : 1));
  const blocked = capacity <= 0
    ? 'no-market'
    : lots >= SALE_LOTS_PER_SEASON ? 'sold' : units <= 0 ? 'nothing' : undefined;
  return { key, units, gold, capacity, thin, glut, blocked };
}

/**
 * Sells one lot of a store for coin. The player's own verb from the Ledger page; the autopilot
 * calls it too, only for stock that would otherwise rot (`autoSellWaste`).
 */
export function sellStores(state: GameState, key: StoreKey, units?: number): boolean {
  const ascent = state.ascent;
  if (state.gameMode !== 'ascent' || !ascent) return false;
  const quote = saleQuote(state, key);
  if (quote.blocked) return false;
  const sold = Math.max(0, Math.min(quote.units, Math.floor(units ?? quote.units)));
  if (sold <= 0) return false;
  const gold = quote.glut === 1
    ? Math.floor(sold * saleGoldPerUnit(key) * (quote.thin ? SALE_THIN_LOT_RATE : 1))
    : Math.floor(sold * saleGoldPerUnit(key) * quote.glut * (quote.thin ? SALE_THIN_LOT_RATE : 1));
  state.resources[key] -= sold;
  state.resources.gold += gold;
  ascent.storeSales ??= {};
  const prior = ascent.storeSales[key];
  const next: NonNullable<typeof prior> = { turn: state.turn, lots: (prior && prior.turn === state.turn ? prior.lots : 0) + 1 };
  // marketGlut: the lot joins what the market has taken lately. Written only under the rule, so a
  // v1 save carries exactly the fields it always did.
  if (rulesOf(state).marketGlut) {
    next.recent = recentSales(state, key) + sold;
    next.recentTurn = state.turn;
  }
  ascent.storeSales[key] = next;
  ascent.laneStats.storesSold = (ascent.laneStats.storesSold ?? 0) + sold;
  pushToast(state, t('ascent.ledger.soldToast', { units: `${resourceToken(key)}${sold}`, resource: resourceLabel(key), gold }), 'info');
  return true;
}

/**
 * The steward's rule: sell what would rot, and nothing else. A full lot is sold when the stock
 * stands a whole lot above the waste line, and only ever the season's *first* lot at the full
 * rate — the thin second lot is the player's, so a glut never leaves them a row that reads
 * "sold this season" every time they look. Everything under the line is theirs to keep, feed a
 * host with, gift, or sell by hand.
 */
export function autoSellWaste(state: GameState): void {
  if (state.gameMode !== 'ascent' || !state.ascent) return;
  for (const key of STORE_KEYS) {
    const quote = saleQuote(state, key);
    if (quote.blocked || quote.thin || quote.capacity <= 0) continue;
    const excess = state.resources[key] - storeWasteFrom(state, key);
    if (excess >= quote.capacity) sellStores(state, key, quote.capacity);
  }
}
