import { seekingTheWorthy, SEEKING_PITY_BONUS, SEEKING_TIER_WEIGHT } from '../decree/rules';
import {
  PITY_GOLD_STEP,
  PITY_HARD_CAP,
  PITY_JADE_STEP,
  SUMMON_CARD_COUNT,
  SUMMON_WEIGHTS,
} from '../../game/ascentConfig';
import { generateHero } from '../../data/heroFactory';
import { initializeRecruitedHero } from '../heroes/HeroService';
import { fireHeroArrival } from './ArrivalSystem';
import { weightedPickIndex } from '../../utils/math';
import { unlockHero } from '../../state/codex';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { heroName, t } from '../../i18n';
import type { AscentRarity, GameState, Hero } from '../../state/types';

/**
 * Rarity is cosmetic everywhere else in the game — here it does real work: it drives both
 * the draw weights and, through the hero's own stats, the magnitude of what you get.
 */
const RARITY_BY_TIER: Record<AscentRarity, Hero['rarity']> = {
  bronze: 'Common',
  silver: 'Rare',
  gold: 'Epic',
  jade: 'Legendary',
};

const TIER_ORDER: AscentRarity[] = ['bronze', 'silver', 'gold', 'jade'];

export function tierForHero(hero: Hero): AscentRarity {
  return TIER_ORDER.find((tier) => RARITY_BY_TIER[tier] === hero.rarity) ?? 'bronze';
}

/**
 * Draw weights for one summon, shifted by soft pity: every summon that fails to produce a
 * gold-or-better tilts the odds further toward the top tiers, so a cold streak visibly
 * corrects itself instead of feeling arbitrary.
 */
function summonWeights(state: GameState, pity: number): Record<AscentRarity, number> {
  // Chiếu cầu hiền — the edict seeking the worthy, which Quang Trung issued after Hán Cao Tổ's.
  // The court that publicly asks for talent gets more of it: pity arrives two summons sooner and
  // the top tiers weigh half again as much. What it costs is on the payroll, not here — see
  // `SEEKING_UPKEEP_MULT`. This is the first decree in the game that reaches the gacha at all.
  const seeking = seekingTheWorthy(state);
  const effective = pity + (seeking ? SEEKING_PITY_BONUS : 0);
  const lift = seeking ? SEEKING_TIER_WEIGHT : 1;
  return {
    bronze: Math.max(4, SUMMON_WEIGHTS.bronze - effective * (PITY_GOLD_STEP * 0.8)),
    silver: SUMMON_WEIGHTS.silver,
    gold: (SUMMON_WEIGHTS.gold + effective * PITY_GOLD_STEP) * lift,
    jade: (SUMMON_WEIGHTS.jade + effective * PITY_JADE_STEP) * lift,
  };
}

function pickHeroOfTier(pool: Hero[], tier: AscentRarity): Hero | undefined {
  const matching = pool.filter((hero) => hero.rarity === RARITY_BY_TIER[tier]);
  if (matching.length === 0) return undefined;
  return matching[Math.floor(Math.random() * matching.length)];
}

/** Generates a champion of exactly the rolled tier straight into the deck, ids kept unique. */
function mintHeroOfTier(state: GameState, tier: AscentRarity, slot: number): Hero | undefined {
  const taken = new Set([...state.heroDeck.map((hero) => hero.id), ...state.heroes.map((hero) => hero.id)]);
  for (let salt = 0; salt < 40; salt += 1) {
    const seed = (state.turn + 1) * 7919 + slot * 104729 + salt * 2654435761;
    const hero = generateHero(seed, { rarity: RARITY_BY_TIER[tier] });
    if (taken.has(hero.id)) continue;
    state.heroDeck.push(hero);
    return hero;
  }
  return undefined;
}

/**
 * Rolls the three summon cards. One roll per card, each against the pity-adjusted weights,
 * falling back down the tiers when the deck has run dry of a rarity so a summon is never
 * empty.
 */
export function rollSummonHeroes(state: GameState): { heroIds: string[]; pityUsed: boolean } {
  const ascent = state.ascent;
  if (!ascent || state.heroDeck.length === 0) return { heroIds: [], pityUsed: false };

  const guaranteed = ascent.summonPity >= PITY_HARD_CAP;
  const weights = summonWeights(state, ascent.summonPity);
  const remaining = [...state.heroDeck];
  const heroIds: string[] = [];

  for (let slot = 0; slot < SUMMON_CARD_COUNT && remaining.length > 0; slot += 1) {
    // The hard-pity guarantee is spent on the first card so the player sees it immediately.
    const forceHigh = guaranteed && slot === 0;
    let tier: AscentRarity;
    if (forceHigh) {
      tier = pickHeroOfTier(remaining, 'jade') ? 'jade' : 'gold';
    } else {
      const index = weightedPickIndex(TIER_ORDER.map((candidate) => weights[candidate]));
      tier = TIER_ORDER[index < 0 ? 0 : index];
    }

    let hero = pickHeroOfTier(remaining, tier);
    // Walk down the ladder when the deck has run dry of the rolled tier — never up. The old
    // upward walk meant a *bronze* roll silently became silver, gold, then jade the moment the
    // deck's Commons were spent, which mid-run they always were: the 62% of rolls that were
    // supposed to be ordinary quietly upgraded themselves, and rarity stopped meaning anything.
    for (let step = TIER_ORDER.indexOf(tier) - 1; !hero && step >= 0; step -= 1) {
      hero = pickHeroOfTier(remaining, TIER_ORDER[step]);
    }
    // Nothing at or below the rolled tier: mint a champion *of the rolled tier* instead of
    // handing over whatever high card is left in the deck.
    if (!hero) {
      hero = mintHeroOfTier(state, tier, slot);
      if (hero) remaining.push(hero);
    }
    if (!hero) break;

    heroIds.push(hero.id);
    remaining.splice(remaining.indexOf(hero), 1);
  }

  return { heroIds, pityUsed: guaranteed };
}

/**
 * Raises the champion card from whichever source is ready.
 *
 * Two feed it. The court's Favor meter pays out a `state.activeHeroDraft` on its own clock —
 * that is the classic "heroes arrive over time" — and wave milestones roll the rarity-weighted
 * gacha. Both land on the same card so the player only ever learns one screen.
 */
export function offerHeroSummon(state: GameState): boolean {
  const draft = state.activeHeroDraft;
  if (draft?.length) {
    enqueueAscentPrompt(state, {
      kind: 'hero-choice',
      heroIds: draft.map((hero) => hero.id),
      source: 'court',
      pityUsed: false,
    });
    return true;
  }

  const { heroIds, pityUsed } = rollSummonHeroes(state);
  if (heroIds.length === 0) return false;
  enqueueAscentPrompt(state, { kind: 'hero-choice', heroIds, source: 'summon', pityUsed });
  return true;
}

/**
 * Recruits the chosen champion, records them in the permanent Codex, and resets or advances
 * soft pity. The two passed-over cards are discarded with the prompt.
 *
 * The hero is deliberately left unposted: `resolveAscentPrompt` raises the Appointment card
 * next, which is where the player decides what they actually do. An auto-assign here would
 * make the appointment a correction rather than a choice.
 */
export function recruitSummonedHero(state: GameState, heroId: string, source: 'summon' | 'court'): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;

  const hero = state.heroDeck.find((candidate) => candidate.id === heroId);
  if (!hero) return false;

  state.heroDeck = state.heroDeck.filter((candidate) => candidate.id !== heroId);
  state.heroes.push(hero);
  initializeRecruitedHero(state, hero);
  fireHeroArrival(state, hero);
  ascent.heroesSummoned += 1;

  if (source === 'court') {
    // A Favor draft is not a summon: counting it would advance the wave-milestone ledger and
    // silently swallow the next gacha the player earned.
    state.activeHeroDraft = undefined;
  } else {
    ascent.summonsDone += 1;
    const tier = tierForHero(hero);
    ascent.summonPity = tier === 'gold' || tier === 'jade' ? 0 : ascent.summonPity + 1;
  }

  const isNew = unlockHero(hero.id);
  pushToast(state, t('ascent.summon.joined', { hero: heroName(hero) }), isNew ? 'milestone' : 'reward');
  return true;
}

/** Declines all three. Pity still advances, so passing is never a pure loss. */
export function passHeroSummon(state: GameState, source: 'summon' | 'court'): void {
  const ascent = state.ascent;
  if (!ascent) return;
  if (source === 'court') {
    state.activeHeroDraft = undefined;
    return;
  }
  ascent.summonsDone += 1;
  ascent.summonPity += 1;
}
