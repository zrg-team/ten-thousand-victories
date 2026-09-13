import type { GameState } from './types';
import type { HeroMemorial } from '../systems/heroes/types';
import { heroLevel, heroRulesV2, heroFormerPosting } from '../systems/heroes/heroModel';
const KEY = 'mandate:hero-chronicle:v1';
/** Cosmetic history only. Run creation never reads this store. */
export function readHeroChronicle(): HeroMemorial[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((entry): entry is HeroMemorial => entry && typeof entry.id === 'string'
      && typeof entry.name === 'string' && typeof entry.highestLevel === 'number' && Array.isArray(entry.deeds)).slice(-100) : [];
  } catch { return []; }
}
export function archiveHeroChronicle(state: GameState): boolean {
  const depth = state.ascent?.heroDepth;
  if (!depth) return true;
  for (const hero of state.heroes) {
    if (!hero.growth || hero.life?.kind === 'dead') continue;
    const id = `${hero.growth.instanceId}:survived`;
    if (!depth.memorials.some(entry => entry.id === id)) depth.memorials.push({ id, heroId: hero.id, name: hero.name,
      highestLevel: heroLevel(hero), deeds: [...hero.growth.deeds], fate: 'survived', turn: state.turn, wave: state.ascent!.wave,
      ...(heroRulesV2(state) ? heroFormerPosting(state, hero) : {}) });
  }
  const merged = new Map(readHeroChronicle().map(entry => [entry.id, entry]));
  for (const entry of depth.memorials) merged.set(entry.id, entry);
  try {
    localStorage.setItem(KEY, JSON.stringify([...merged.values()].slice(-100)));
    delete depth.chroniclePending; return true;
  } catch { depth.chroniclePending = true; return false; }
}
