/**
 * What a story's or a court petition's one-time sum is worth, measured against the thing it is about.
 *
 * The scaled purse (`priceScale.ts`) already pegs every price to income and hoard. That is the right
 * yardstick for a bribe or a gift, and the wrong one for most of what a story asks: back pay for four
 * seasons is a question about the size of the army, not the size of the treasury; relief for a
 * starving district is a question about how many people there are; and nothing a card cost knew
 * which round of the run it was raised in. Reported with the court's *Army Wage Arrears* quoting
 * 35 gold to a realm holding 4,000 and fielding thousands of men: *the number must be based on some
 * criterion — the army for wages, the resources I have and the round for the rest*.
 *
 * **Beta only** (`scaledStories`). On a stable reign every function here returns exactly what the
 * scaled purse already charged, so stable runs are unchanged to the coin.
 *
 * Three bases, each a floor raised over the scaled purse, never a replacement for it:
 *
 *  - `realm` (the default) — the scaled purse, times the round.
 *  - `people` — as `realm`, and a people cost or gain (and any grain or coin the people eat) grows
 *    with the realm's population instead of standing at the number written for a founding.
 *  - `{ wages: n }` — the gold is at least `n` seasons of what the realm's hosts are paid today.
 *
 * **The round** is `1 + STORY_ROUND_SCALE_PER_WAVE × wave`, capped. Late waves are harder, and a
 * choice raised in one should weigh like it. Deliberately gentle: income and hoard already move
 * prices by several times, and the round is the part of difficulty they do not see.
 *
 * Never used on a per-season effect (`stipend`, `debt`, `exactTribute`): a recurring sum stacks
 * against a growing realm on its own, which is how a card becomes an engine. Nor on a mixed-sign
 * bag — an exchange rate the author wrote stays the rate they wrote.
 *
 * A leaf over `priceScale`, the ruleset registry and the config.
 */
import {
  STORY_TREASURY_CAP,
  STORY_TREASURY_EXPONENT,
  STORY_TREASURY_REF,
  STORY_PEOPLE_BASE,
  STORY_PEOPLE_EXPONENT,
  STORY_PEOPLE_MAX,
  STORY_ROUND_SCALE_MAX,
  STORY_ROUND_SCALE_PER_WAVE,
} from '../../game/ascentConfig';
import { rulesOf } from '../../game/ascentRuleset';
import type { GameState, ResourceBag, ValueBasis } from '../../state/types';
import { parPricesActive, realmPriceScale, scaledCost, scaledGain, storePriceScale } from './priceScale';

/** Whether this reign prices its stories by what they are about. */
export function storiesScaled(state: GameState): boolean {
  return state.gameMode === 'ascent' && Boolean(state.ascent) && rulesOf(state).scaledStories;
}

/** How much later in the run this is: 1 at the founding, rising with every wave, capped. */
export function roundScale(state: GameState): number {
  if (!storiesScaled(state)) return 1;
  // Par prices already carry the round inside the purse (`parRound`); multiplying it in again here
  // would charge a wave-25 story the round twice (x2.25 on top of x2.5).
  if (parPricesActive(state)) return 1;
  const wave = Math.max(0, state.ascent?.wave ?? 0);
  return Math.min(STORY_ROUND_SCALE_MAX, 1 + STORY_ROUND_SCALE_PER_WAVE * wave);
}

/** The realm's people against the founding's: sub-linear, never below 1, capped. */
export function peopleScale(state: GameState): number {
  if (!storiesScaled(state)) return 1;
  const people = Math.max(0, state.resources.humans);
  if (people <= STORY_PEOPLE_BASE) return 1;
  return Math.min(STORY_PEOPLE_MAX, Math.pow(people / STORY_PEOPLE_BASE, STORY_PEOPLE_EXPONENT));
}

/** Gold a season the realm's hosts cost today — the books' own figure (`goldParts.hosts`). */
export function hostWageBill(state: GameState): number {
  return Math.max(0, state.ascentLedger?.goldParts?.hosts ?? 0);
}

const isPeople = (basis: ValueBasis | undefined): boolean => basis === 'people';
const wageSeasons = (basis: ValueBasis | undefined): number => (typeof basis === 'object' ? basis.wages : 0);

/**
 * A story or court **cost**, as it will be quoted and charged. The scaled purse on a stable reign;
 * on a Beta reign, raised to its basis and the round. Rounded up, never below the purse's figure.
 */
export function storyCost(state: GameState, cost: Partial<ResourceBag>, basis?: ValueBasis): Partial<ResourceBag> {
  const purse = scaledCost(state, cost);
  if (!storiesScaled(state)) return purse;
  const round = roundScale(state);
  const people = isPeople(basis) ? peopleScale(state) : 1;
  const out: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(purse) as [keyof ResourceBag, number | undefined][]) {
    if (value === undefined) continue;
    if (key === 'humans') {
      // A people cost written for a founding grows with the people only when the card says it is
      // about them: "five hundred men" in a story's own words stays five hundred.
      out[key] = isPeople(basis) ? Math.ceil((cost[key] ?? value) * people) : value;
      continue;
    }
    const authored = cost[key] ?? value;
    // People eat: grain and coin for a population's relief follow the population as well as the purse.
    const byPeople = key === 'food' || key === 'gold' ? authored * people : 0;
    out[key] = Math.ceil(Math.max(value, byPeople) * round);
  }
  const seasons = wageSeasons(basis);
  if (seasons > 0 && (cost.gold ?? 0) > 0) {
    out.gold = Math.max(out.gold ?? 0, Math.ceil(hostWageBill(state) * seasons));
  }
  // The purse the choice is weighed against (parPrices): a coin cost is never a rounding error beside
  // the treasury the player is holding. See `STORY_TREASURY_EXPONENT`.
  if ((cost.gold ?? 0) > 0 && out.gold !== undefined) {
    out.gold = Math.max(out.gold, treasuryWeighted(state, cost.gold ?? 0));
  }
  return out;
}

/**
 * What an authored coin cost weighs against the treasury (parPrices): `authored x (treasury/REF)^0.7`,
 * never more than `STORY_TREASURY_CAP` of the treasury, and 0 below REF or without the rule — the
 * caller takes the greater of this and its own price.
 */
export function treasuryWeighted(state: GameState, authoredGold: number): number {
  if (!parPricesActive(state) || authoredGold <= 0) return 0;
  const treasury = Math.max(0, state.resources.gold);
  if (treasury <= STORY_TREASURY_REF) return 0;
  const weighted = authoredGold * Math.pow(treasury / STORY_TREASURY_REF, STORY_TREASURY_EXPONENT);
  return Math.ceil(Math.min(weighted, treasury * STORY_TREASURY_CAP));
}

/**
 * The one factor a court *trade* (a mixed-sign bag) is scaled by under parPrices, on both sides, so
 * the exchange rate the author wrote is the rate paid and neither side is pocket change. 1 otherwise.
 */
export function tradeBagScale(state: GameState, bag: Partial<ResourceBag>): number {
  if (!parPricesActive(state)) return 1;
  const gold = Math.abs(bag.gold ?? 0);
  const byPrice = realmPriceScale(state);
  const byTreasury = gold > 0 ? treasuryWeighted(state, gold) / gold : 0;
  return Math.max(1, byPrice, byTreasury);
}

/**
 * A story or court **one-time sum** — a gain or a forfeit — as it will land. `scaledGain` on a
 * stable reign; on a Beta reign, times the round, with people following the population where the
 * card is about them. A mixed-sign bag passes through untouched, exactly as `scaledGain` leaves it.
 */
export function storyGain(state: GameState, bag: Partial<ResourceBag>, basis?: ValueBasis): Partial<ResourceBag> {
  const purse = scaledGain(state, bag);
  if (!storiesScaled(state)) return purse;
  const values = Object.values(bag).filter((value): value is number => typeof value === 'number');
  if (values.some((value) => value > 0) && values.some((value) => value < 0)) return purse;
  const round = roundScale(state);
  const people = peopleScale(state);
  const out: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(purse) as [keyof ResourceBag, number | undefined][]) {
    if (value === undefined || value === 0) { if (value !== undefined) out[key] = value; continue; }
    if (key === 'humans' && isPeople(basis)) {
      const authored = Math.abs(bag[key] ?? value);
      out[key] = Math.sign(value) * Math.round(Math.max(Math.abs(value), authored * people) * round);
      continue;
    }
    out[key] = Math.sign(value) * Math.round(Math.abs(value) * round);
  }
  return out;
}

/**
 * A figure a story reads rather than charges — a cap on a ransom, a threshold for a riot — in the
 * same units as the purse it is compared with. Authored for a founding; on a Beta reign it keeps
 * meaning the same thing for a realm many times richer. Stable reigns read it as written.
 */
export function storyFigure(state: GameState, store: 'gold' | 'food' | 'supplies', authored: number): number {
  if (!storiesScaled(state)) return authored;
  const purse = store === 'gold' ? realmPriceScale(state) : storePriceScale(state, store);
  return Math.round(authored * purse * roundScale(state));
}
