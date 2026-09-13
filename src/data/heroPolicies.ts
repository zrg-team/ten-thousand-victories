import type { PowerCardDef } from '../state/types';
import { heroActive, heroCapability, heroLevel, heroRulesV2 } from '../systems/heroes/heroModel';
import type { HeroPolicyId } from '../systems/heroes/types';
export const HERO_POLICY_IDS: HeroPolicyId[] = ['hero-apprenticeship', 'hero-frontier-commission', 'hero-safe-passage',
  'hero-letters-of-credence', 'hero-field-infirmary', 'hero-acting-council'];
/** Run policies stay out of the permanent Cabinet and opening-hand pool. */
export const HERO_POWER_CARDS: PowerCardDef[] = HERO_POLICY_IDS.map(id => ({ id, rarity: 'silver', maxStacks: 1,
  levels: [{ effect: { permanent: true }, display: {} }], weight: .8,
  requires: state => {
    if (!heroCapability(state, 'cards') || state.ascent?.heroDepth?.policies.includes(id)) return false;
    const heroes = state.heroes.filter(hero => hero.growth && heroActive(hero));
    if (id === 'hero-apprenticeship') return heroes.some(mentor => heroLevel(mentor) >= 3 && heroes.some(student => heroLevel(student) < heroLevel(mentor)));
    if (id === 'hero-safe-passage') return heroCapability(state, 'travel') && heroes.length > 0;
    if (id === 'hero-frontier-commission') return heroCapability(state, 'recovery') && heroes.some(hero => hero.life?.kind === 'active' && hero.life.assignment.kind === 'province'
      && (!heroRulesV2(state) || state.lands.some(land => land.id === hero.assignedTo && land.specialization === 'fortress')));
    if (id === 'hero-letters-of-credence') return heroCapability(state, 'residency') && heroes.length > 0;
    if (id === 'hero-field-infirmary') return heroCapability(state, 'recovery') && heroes.length > 0;
    return heroCapability(state, 'travel') && heroes.some(hero => hero.assignedTo?.startsWith('court:'));
  },
}));
