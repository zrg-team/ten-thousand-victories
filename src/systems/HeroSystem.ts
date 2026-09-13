import { PLAYER_KINGDOM_ID } from '../game/constants';
import { ensureHeroDeck } from '../data/heroFactory';
import { SUMMON_WEIGHTS } from '../game/ascentConfig';
import { chooseByIndex, weightedPickIndex } from '../utils/math';
import type { GameState, Hero, HeroType } from '../state/types';
import { heroName, t } from '../i18n';
import { initializeRecruitedHero, commitHeroAssignment } from './heroes/HeroService';

/** Low rarity first, so "walk down the ladder" is an index walk toward zero. */
const RARITY_LADDER: ReadonlyArray<Hero['rarity']> = ['Common', 'Rare', 'Epic', 'Legendary'];
const TIER_OF_RARITY: Record<Hero['rarity'], keyof typeof SUMMON_WEIGHTS> = {
  Common: 'bronze',
  Rare: 'silver',
  Epic: 'gold',
  Legendary: 'jade',
};

/**
 * Three picks drawn against the summon's rarity weights, never upgrading a dry tier.
 *
 * The Favor draft used to walk the deck by index with no rarity weighting at all — and the
 * authored deck is 42% Epic-and-Legendary, so the court quietly handed out top champions far
 * more often than the gacha it shares a card with. Same weights, same ladder rule, one feel.
 */
function weightedPicks(pool: Hero[], count: number): Hero[] {
  const remaining = [...pool];
  const picks: Hero[] = [];
  while (picks.length < count && remaining.length > 0) {
    const index = weightedPickIndex(RARITY_LADDER.map((rarity) => SUMMON_WEIGHTS[TIER_OF_RARITY[rarity]]));
    let step = Math.max(0, index);
    let candidates: Hero[] = [];
    // Walk down when the rolled tier is dry; if even Common is dry, take the lowest tier left.
    for (; step >= 0; step -= 1) {
      candidates = remaining.filter((hero) => hero.rarity === RARITY_LADDER[step]);
      if (candidates.length > 0) break;
    }
    if (candidates.length === 0) {
      const lowest = RARITY_LADDER.find((rarity) => remaining.some((hero) => hero.rarity === rarity));
      candidates = remaining.filter((hero) => hero.rarity === lowest);
    }
    const hero = candidates[Math.floor(Math.random() * candidates.length)];
    picks.push(hero);
    remaining.splice(remaining.indexOf(hero), 1);
  }
  return picks;
}

export function createHeroDraft(state: GameState, preferredType?: HeroType): void {
  ensureHeroDeck(state);
  if (state.activeHeroDraft || state.heroDeck.length === 0) {
    return;
  }

  const preferred = preferredType ? state.heroDeck.filter((hero) => hero.type === preferredType) : [];
  const pool = preferred.length > 0 ? preferred : state.heroDeck;
  const picks: Hero[] = [];

  if (state.gameMode === 'ascent') {
    picks.push(...weightedPicks(pool, 3));
  } else {
    const offset = state.turn % pool.length;
    for (let index = 0; index < Math.min(3, pool.length); index += 1) {
      const hero = chooseByIndex(pool, offset + index);
      if (hero && !picks.some((pick) => pick.id === hero.id)) {
        picks.push(hero);
      }
    }
  }

  state.activeHeroDraft = picks;
  state.message = t('msg.newHeroes');
}

export function recruitHero(state: GameState, heroId: string): boolean {
  if (!state.activeHeroDraft) {
    return false;
  }

  const hero = state.activeHeroDraft.find((candidate) => candidate.id === heroId);

  if (!hero) {
    return false;
  }

  state.heroes.push(hero);
  initializeRecruitedHero(state, hero);
  state.heroDeck = state.heroDeck.filter((candidate) => candidate.id !== hero.id);
  state.activeHeroDraft = undefined;
  state.message = t('msg.heroJoins', { hero: heroName(hero) });

  if (hero.type === 'general') {
    const army = state.armies.find((candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID);
    if (army && !army.generalHeroId) {
      army.generalHeroId = hero.id;
      hero.assignedTo = army.id;
      if (hero.growth) commitHeroAssignment(state, hero, { kind: 'host', armyId: army.id });
    }
  }

  return true;
}
