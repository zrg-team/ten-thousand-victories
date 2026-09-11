/**
 * The scaled purse: what the realm's routine purchases cost once the realm has outgrown the
 * opening — and once it has more put by than it knows what to do with.
 *
 * Every price the war card quotes — walls, sellswords, a buy-off, a gift, an oath — is pegged to
 * income, so a rich realm keeps deciding about them. The *economy's* prices were not: a farm was
 * 32 gold, a bribed village ~55, a minimum host 70, a reroll 68, a burnt district a few dozen,
 * from the founding to the fall. Measured on a steward's run, gross gold went 80 → 330 a season
 * by wave 15 while every one of those prices stood still; the treasury banked 2,500-5,900 with
 * nothing left in it to decide. Reported as *"resources become useless in late game when already
 * have a lot"*.
 *
 * Two factors, multiplied, each smoothed a step a season toward its live figure so that a price
 * quoted on a card is the price charged when the card is answered a season or two later:
 *
 *  - **Income** — `clamp(1, (gross / BASE) ^ EXPONENT, MAX)` on gross gold a season. Sub-linear,
 *    so a realm earning five times the base pays about two and a half times the price: growth
 *    still buys more decisions a season, and no decision becomes a rounding error.
 *  - **Wealth** — the seasons of its own income (gold) or use (grain, goods) a store holds above
 *    the free seasons, to the half power, capped. Measured after the income scale alone shipped,
 *    the treasury still piled to fifteen, fourteen and fifty-nine seasons of income across three
 *    drivers, because routine prices were tens of coin against piles of thousands and grain had
 *    no scale at all. A working balance pays nothing extra; a hoard pays for being one. See
 *    `PRICE_WEALTH_FREE_SEASONS`.
 *
 * Gold prices wear both. Grain and goods prices wear their own store's wealth factor — the coin
 * of a muster grows with the purse, its rations with the granary, its kit with the armoury.
 *
 * A leaf module on purpose: `ResourceSystem`, `AcquisitionSystem`, `WarSystem` and the Ascent
 * systems all read it, and `ResourceSystem` <-> `CourtSystem` already form an import cycle.
 */
import {
  GAIN_SCALE_EXPONENT,
  GAIN_SCALE_MAX,
  PRICE_SCALE_BASE_GROSS,
  PRICE_SCALE_EXPONENT,
  PRICE_SCALE_MAX,
  PRICE_SCALE_SMOOTHING,
  PRICE_WEALTH_EXPONENT,
  PRICE_WEALTH_FREE_SEASONS,
  PRICE_WEALTH_MAX,
  PRICE_WEALTH_STORE_FLOOR,
  PRICE_WEALTH_STORE_USE_FLOOR,
  TREASURY_GRAFT_FROM,
  TREASURY_GRAFT_SEASONS,
} from '../../game/ascentConfig';
import type { GameState, ResourceBag } from '../../state/types';

/** The stores a price can be quoted in. People are never scaled: a man is a man. */
export type PricedStore = 'gold' | 'food' | 'supplies';
const STORES: PricedStore[] = ['gold', 'food', 'supplies'];

/** Gross gold a season as the books last recorded it. Zero before the first tick. */
export function realmGrossGold(state: GameState): number {
  return Math.max(0, state.ascentLedger?.gold.gross ?? 0);
}

/** Where the income scale is heading: the live figure, before smoothing. */
export function targetPriceScale(state: GameState): number {
  if (state.gameMode !== 'ascent') return 1;
  const gross = realmGrossGold(state);
  if (gross <= PRICE_SCALE_BASE_GROSS) return 1;
  return Math.min(PRICE_SCALE_MAX, Math.pow(gross / PRICE_SCALE_BASE_GROSS, PRICE_SCALE_EXPONENT));
}

/**
 * Seasons of its own income or use a store holds. The founding's purse is measured against the
 * base gross, and the founding's granary and armoury are never counted at all, so the opening
 * pays the base price whatever it was given to start with.
 */
export function heldSeasons(state: GameState, store: PricedStore): number {
  const stock = Math.max(0, state.resources[store]);
  const ledger = state.ascentLedger;
  if (store === 'gold') {
    return stock / Math.max(PRICE_SCALE_BASE_GROSS, ledger?.gold.gross ?? 0);
  }
  const use = Math.max(PRICE_WEALTH_STORE_USE_FLOOR, ledger?.[store].demand ?? 0);
  return Math.max(0, stock - PRICE_WEALTH_STORE_FLOOR) / use;
}

/** Where a store's wealth factor is heading: the live figure, before smoothing. */
export function targetWealthScale(state: GameState, store: PricedStore): number {
  if (state.gameMode !== 'ascent') return 1;
  const held = heldSeasons(state, store);
  if (held <= PRICE_WEALTH_FREE_SEASONS) return 1;
  return Math.min(PRICE_WEALTH_MAX, Math.pow(held / PRICE_WEALTH_FREE_SEASONS, PRICE_WEALTH_EXPONENT));
}

/** The income scale alone: what the realm's size makes things cost, before any hoard. */
export function realmIncomeScale(state: GameState): number {
  if (state.gameMode !== 'ascent' || !state.ascent) return 1;
  return state.ascent.priceScale ?? 1;
}

/** The smoothed wealth factor of one store. Exactly 1 outside Dragon Ascent. */
export function realmWealthScale(state: GameState, store: PricedStore): number {
  if (state.gameMode !== 'ascent' || !state.ascent) return 1;
  return state.ascent.wealthScale?.[store] ?? 1;
}

/**
 * The multiplier every routine gold price wears right now: income and wealth together. Exactly
 * 1 outside Dragon Ascent, so the classic economies keep their numbers to the digit.
 */
export function realmPriceScale(state: GameState): number {
  if (state.gameMode !== 'ascent' || !state.ascent) return 1;
  return Math.round(realmIncomeScale(state) * realmWealthScale(state, 'gold') * 100) / 100;
}

/** The multiplier a grain or goods price wears: that store's own hoard, and nothing else. */
export function storePriceScale(state: GameState, store: 'food' | 'supplies'): number {
  return realmWealthScale(state, store);
}

/** Steps the smoothed scales toward the live ones. Called once per Ascent tick, after the books close. */
export function tickPriceScale(state: GameState): void {
  const ascent = state.ascent;
  if (state.gameMode !== 'ascent' || !ascent) return;
  const step = (current: number, target: number): number =>
    // Two decimals: enough that a quoted price never drifts by a whole coin between seasons.
    Math.round((current + (target - current) * PRICE_SCALE_SMOOTHING) * 100) / 100;
  ascent.priceScale = step(ascent.priceScale ?? 1, targetPriceScale(state));
  const wealth = ascent.wealthScale ?? { gold: 1, food: 1, supplies: 1 };
  for (const store of STORES) {
    wealth[store] = step(wealth[store] ?? 1, targetWealthScale(state, store));
  }
  ascent.wealthScale = wealth;
}

/**
 * A cost with every store scaled by what it wears — gold by income and wealth, grain and goods
 * by their own hoard — rounded up so a scaled price is never below the base one. People pass
 * through untouched.
 */
export function scaledCost(state: GameState, cost: Partial<ResourceBag>): Partial<ResourceBag> {
  const scales = {
    gold: realmPriceScale(state),
    food: storePriceScale(state, 'food'),
    supplies: storePriceScale(state, 'supplies'),
  };
  if (scales.gold === 1 && scales.food === 1 && scales.supplies === 1) return cost;
  const out: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(cost) as [keyof ResourceBag, number | undefined][]) {
    if (value === undefined) continue;
    const scale = key === 'gold' || key === 'food' || key === 'supplies' ? scales[key] : 1;
    out[key] = scale === 1 ? value : Math.ceil(value * scale);
  }
  return out;
}

/**
 * What a **one-time** reward or forfeit is worth to a realm this size.
 *
 * Income only, and deliberately so: it reads the *gross* line from the books, never the hoard.
 * A wealth term here would mean that sitting on gold made every windfall larger, which is the
 * runaway the cost side's wealth factor exists to prevent.
 *
 * `humans` has no line in the ledger, so it borrows the gold scale. Flagged rather than hidden:
 * if a realm's people ever get their own gross line, this should read it.
 */
export function gainScale(state: GameState, store: keyof ResourceBag): number {
  if (state.gameMode !== 'ascent' || !state.ascent) return 1;
  const ledger = state.ascentLedger;
  const gross = store === 'humans' || store === 'gold'
    ? realmGrossGold(state)
    : Math.max(0, ledger?.[store].gross ?? 0);
  if (gross <= PRICE_SCALE_BASE_GROSS) return 1;
  return Math.min(GAIN_SCALE_MAX, Math.pow(gross / PRICE_SCALE_BASE_GROSS, GAIN_SCALE_EXPONENT));
}

/**
 * A one-time bag, worth what it should be worth to this realm. **Never a per-season bag.**
 *
 * Three rules, each of which was a bug before it was a rule:
 *
 *  - **Route by sign.** A gain wears `gainScale` (income only); a forfeit wears the full
 *    `scaledCost` (income x hoard), so a rich realm is punished harder rather than shrugging.
 *    Flooring naively on the signed value — `max(-220, -660)` — returns the *smaller* penalty and
 *    quietly makes every story blow free late in a run, which is how this was first written.
 *  - **Floor on magnitude.** The authored figure is the minimum in either direction, so a realm
 *    poorer than the opening is never paid less than the number the author wrote.
 *  - **Refuse a mixed-sign bag.** `{ supplies: -25, gold: 55 }` is an exchange *rate*, not a
 *    reward. Scaling its halves by different factors silently rewrites the rate — measured, the
 *    same barter swings between 160-for-65 and 40-for-195 depending which factor bites. Such a
 *    bag is returned untouched; a caller that means to scale a trade must say which side sets it.
 */
export function scaledGain(state: GameState, bag: Partial<ResourceBag>): Partial<ResourceBag> {
  if (state.gameMode !== 'ascent' || !state.ascent) return bag;
  const values = Object.values(bag).filter((value): value is number => typeof value === 'number');
  const mixed = values.some((value) => value > 0) && values.some((value) => value < 0);
  if (mixed) return bag;

  const out: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(bag) as [keyof ResourceBag, number | undefined][]) {
    if (value === undefined) continue;
    if (value === 0) { out[key] = 0; continue; }
    const scale = value > 0
      ? gainScale(state, key)
      // A forfeit is a price: the hoard pays for being one.
      : (key === 'gold' ? realmPriceScale(state)
        : key === 'humans' ? 1
          : storePriceScale(state, key));
    const scaled = Math.round(Math.abs(value) * scale);
    out[key] = Math.sign(value) * Math.max(Math.abs(value), scaled);
  }
  return out;
}

/**
 * The treasury above which graft begins. A flat 4,000 was calibrated for a realm grossing a few
 * hundred a season; a realm grossing more saves toward larger things (a mercenary company is nine
 * seasons of income) and must not be taxed for holding what one of them costs.
 */
export function treasuryGraftFrom(state: GameState): number {
  return Math.max(TREASURY_GRAFT_FROM, Math.round(realmGrossGold(state) * TREASURY_GRAFT_SEASONS));
}
