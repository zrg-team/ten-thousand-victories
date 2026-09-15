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
  PAR_CEILING_EXPONENT,
  PAR_GAIN_ROUND_EXPONENT,
  PAR_GAIN_SKILL_EXPONENT_ABOVE,
  PAR_GAIN_SKILL_EXPONENT_BELOW,
  PAR_GAIN_SKILL_MAX,
  PAR_GAIN_SKILL_MIN,
  PAR_GROSS,
  PAR_HOARD_EXPONENT,
  PAR_HOARD_FREE_SEASONS,
  PAR_HOARD_MAX,
  PAR_PRICE_MAX,
  PAR_ROUND_EXPONENT,
  PAR_SKILL_EXPONENT_ABOVE,
  PAR_SKILL_EXPONENT_BELOW,
  PAR_SKILL_MAX,
  PAR_SKILL_MIN,
  PAR_TREASURY,
  PAR_TREASURY_SEASONS,
  UPKEEP_ROUND_EXPONENT,
  UPKEEP_ROUND_MAX,
} from '../../game/ascentConfig';
import { rulesOf } from '../../game/ascentRuleset';
import type { GameState, ResourceBag } from '../../state/types';

/** The stores a price can be quoted in. People are never scaled: a man is a man. */
export type PricedStore = 'gold' | 'food' | 'supplies';
const STORES: PricedStore[] = ['gold', 'food', 'supplies'];

/** Gross gold a season as the books last recorded it. Zero before the first tick. */
export function realmGrossGold(state: GameState): number {
  return Math.max(0, state.ascentLedger?.gold.gross ?? 0);
}

// ── The par curve: prices read the round, and how far the realm stands from a normal one ──
//
// Reported 2026-09-15: *"make a smart scaling that does not make users feel no progression (my skill
// no matter) — difficult but still enjoyable. Consider current gold, the invasion round, and the
// delta between the user's gold and a base number we feel is normal for all users."*
//
// The income x hoard scale priced a realm against *itself*: whatever it earned, prices followed at
// the 0.6 power, and a treasury above four seasons paid again. So a strong realm's lead was taxed
// twice, and a real player at wave ~10 (gross 470, 5.7k gold) paid x3.95 — less buying power than a
// normal realm at the same wave. Skill did not show.
//
// Par prices split the scale into what everyone pays and what a lead pays:
//  - **Round** — what a normal realm grosses at this wave (`PAR_GROSS`) against the founding's 120,
//    at the 0.7 power. The war gets dearer for everyone as it goes on.
//  - **Standing** — the realm's worth (gross + treasury/16) over par's, passed through at `r^0.4`
//    above par and `r^0.25` below, ramped in over the first waves. A realm at twice par pays 1.32x
//    and keeps 1.52x par's buying power: the lead is priced, never erased.
//  - **Ceiling** — never more than income can carry (`(gross/120)^0.75`), so a realm is not priced
//    out by a treasury it has no income behind.
//  - **Hoard** — only past ten seasons of income held (see `targetWealthScale`), so saving toward a
//    mercenary company is a plan while sitting on gold is still not a strategy.

/** A per-wave table read at the run's wave, flat after its last entry. */
function parAt(table: readonly number[], wave: number): number {
  return table[Math.max(0, Math.min(table.length - 1, Math.floor(wave)))] ?? table[table.length - 1];
}

/** True when this run prices against the par curve. */
export function parPricesActive(state: GameState): boolean {
  return state.gameMode === 'ascent' && !!state.ascent && rulesOf(state).parPrices;
}

/** Gross gold a season and treasury a normal realm holds at this run's wave. */
export function parFigures(state: GameState): { gross: number; treasury: number } {
  const wave = state.ascent?.wave ?? 0;
  return { gross: parAt(PAR_GROSS, wave), treasury: parAt(PAR_TREASURY, wave) };
}

/** The round's weight on prices: 1 at the founding, climbing with what a normal realm earns. */
export function parRound(state: GameState): number {
  return Math.pow(parFigures(state).gross / PRICE_SCALE_BASE_GROSS, PAR_ROUND_EXPONENT);
}

/** The realm's worth over par's: gross plus a treasury counted as `PAR_TREASURY_SEASONS` of it. */
export function parRatio(state: GameState): number {
  const par = parFigures(state);
  const worth = realmGrossGold(state) + Math.max(0, state.resources.gold) / PAR_TREASURY_SEASONS;
  return worth / Math.max(1, par.gross + par.treasury / PAR_TREASURY_SEASONS);
}

/** 0 at the founding, 1 from the third wave: the opening is priced as written, whatever the purse. */
function parRamp(state: GameState): number {
  return Math.max(0, Math.min(1, ((state.ascent?.wave ?? 0) - 1) / 2));
}

function leadFactor(ratio: number, above: number, max: number, below: number, min: number, ramp: number): number {
  const raw = ratio >= 1
    ? Math.min(max, Math.pow(ratio, above))
    : Math.max(min, Math.pow(Math.max(1e-6, ratio), below));
  return 1 + (raw - 1) * ramp;
}

/** What the realm's standing against par adds to prices (1 = par). */
export function parStanding(state: GameState): number {
  return leadFactor(parRatio(state), PAR_SKILL_EXPONENT_ABOVE, PAR_SKILL_MAX, PAR_SKILL_EXPONENT_BELOW, PAR_SKILL_MIN, parRamp(state));
}

/**
 * What standing costs climb by with the round (`upkeepRound`): hero pay, the hosts' coin, building
 * upkeep, the offices' base wage. The round only — never the standing or the hoard, because an
 * upkeep that grew with income would be the self-neutralising economy this mode escaped once.
 * The literal 1 when the rule is off.
 */
export function upkeepRoundScale(state: GameState): number {
  if (state.gameMode !== 'ascent' || !state.ascent || !rulesOf(state).upkeepRound) return 1;
  return Math.min(UPKEEP_ROUND_MAX, Math.round(Math.pow(parRound(state), UPKEEP_ROUND_EXPONENT) * 100) / 100);
}

/** Where the income scale is heading: the live figure, before smoothing. */
export function targetPriceScale(state: GameState): number {
  if (state.gameMode !== 'ascent') return 1;
  const gross = realmGrossGold(state);
  if (parPricesActive(state)) {
    const ceiling = Math.max(1, Math.pow(gross / PRICE_SCALE_BASE_GROSS, PAR_CEILING_EXPONENT));
    return Math.max(1, Math.min(PAR_PRICE_MAX, parRound(state) * parStanding(state), ceiling));
  }
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
  // Under par prices the treasury already counts toward standing, so the hoard factor waits for a
  // real hoard: ten seasons of income, not four. Grain and goods keep their own reading.
  if (store === 'gold' && parPricesActive(state)) {
    if (held <= PAR_HOARD_FREE_SEASONS) return 1;
    return Math.min(PAR_HOARD_MAX, Math.pow(held / PAR_HOARD_FREE_SEASONS, PAR_HOARD_EXPONENT));
  }
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
  // Under par prices a reward follows the round and a softer share of the realm's standing than
  // prices take, so buying power drifts 1.0-1.4 across a run for every kind of player.
  if ((store === 'gold' || store === 'humans') && parPricesActive(state)) {
    const round = Math.pow(parFigures(state).gross / PRICE_SCALE_BASE_GROSS, PAR_GAIN_ROUND_EXPONENT);
    const lead = leadFactor(parRatio(state), PAR_GAIN_SKILL_EXPONENT_ABOVE, PAR_GAIN_SKILL_MAX, PAR_GAIN_SKILL_EXPONENT_BELOW, PAR_GAIN_SKILL_MIN, parRamp(state));
    // The same ceiling prices wear: a reward never outruns what the realm's income could buy with
    // it. Without it a two-province realm grossing 100 at wave 8 was paid x2.77 on every windfall
    // while its prices sat at x1.0 — the buying-power drift this curve exists to hold near 1.
    const ceiling = Math.max(1, Math.pow(realmGrossGold(state) / PRICE_SCALE_BASE_GROSS, PAR_CEILING_EXPONENT));
    return Math.max(1, Math.min(GAIN_SCALE_MAX, round * lead, ceiling));
  }
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

/**
 * The price scale taken apart for the Books page: what the round asks, what the realm's standing
 * adds, what a hoard adds. `worth` is the standing itself — so it agrees with the ratio printed beside
 * it — and `round` is what remains of the smoothed scale once the standing is divided out, so the
 * three always multiply to the total prices really wear. When income caps the price (the ceiling),
 * that shows as a smaller round, never as a realm standing below par.
 */
export interface PriceBreakdown {
  total: number;
  round: number;
  worth: number;
  hoard: number;
  ratio: number;
  parGross: number;
  parTreasury: number;
}

export function priceBreakdown(state: GameState): PriceBreakdown | undefined {
  if (!parPricesActive(state)) return undefined;
  const par = parFigures(state);
  const standing = Math.max(0.01, parStanding(state));
  const income = realmIncomeScale(state);
  return {
    total: realmPriceScale(state),
    round: Math.round((income / standing) * 100) / 100,
    worth: Math.round(standing * 100) / 100,
    hoard: realmWealthScale(state, 'gold'),
    ratio: Math.round(parRatio(state) * 100) / 100,
    parGross: par.gross,
    parTreasury: par.treasury,
  };
}
