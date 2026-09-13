// Leaf readers: no systems, UI, storage or random draws. Stable reads return the original object.
import type { GameState, Hero, HeroStats, Land } from '../../state/types';
import type { HeroCapability, HeroDiscipline, HeroPerkId, ProfessionalStat } from './types';

export const HERO_XP = [0, 6, 16, 30, 48, 70, 96, 126] as const;
export const PROFESSIONAL_STATS: readonly ProfessionalStat[] = ['martial', 'logistics', 'administration', 'diplomacy'];
export const emptyTraining = (): Record<ProfessionalStat, number> => ({ martial: 0, logistics: 0, administration: 0, diplomacy: 0 });
export function heroCapability(state: GameState, capability: HeroCapability): boolean {
  return state.gameMode === 'ascent' && !state.ascent?.arena && [1, 2].includes(state.ascent?.heroDepth?.rules.version ?? 0)
    && state.ascent?.heroDepth?.rules.capabilities[capability] === true;
}
export function heroRulesV2(state: GameState): boolean { return state.ascent?.heroDepth?.rules.version === 2; }
export function heroFormerPosting(state: GameState, hero: Hero) {
  const active = hero.life?.kind === 'active' && hero.life.assignment.kind !== 'home' ? hero.life.assignment : undefined;
  const assignment = active ?? hero.growth?.lastPosting?.assignment ?? (hero.life?.kind === 'active' ? hero.life.assignment : undefined);
  const placeName = active ? active.kind === 'province' || active.kind === 'claim' ? state.lands.find(l => l.id === active.landId)?.name
    : active.kind === 'host' ? state.armies.find(a => a.id === active.armyId)?.name
    : active.kind === 'embassy' ? state.kingdoms.find(k => k.id === active.kingdomId)?.name : undefined : hero.growth?.lastPosting?.placeName;
  return { formerAssignment: assignment ? { ...assignment } : undefined, formerPlaceName: placeName };
}
export function effectiveHeroStats(hero: Hero): HeroStats {
  if (!hero.growth) return hero.stats;
  const stats = { ...hero.stats };
  for (const key of PROFESSIONAL_STATS) stats[key] = Math.min(100, stats[key] + hero.growth.training[key]);
  return stats;
}
export function heroLevel(hero: Hero, thresholds: readonly number[] = HERO_XP): number {
  const xp = hero.growth?.xp ?? 0;
  let level = 1;
  while (level < thresholds.length && xp >= thresholds[level]) level++;
  return level;
}
export function heroWindow(state: GameState): number { return (state.ascent?.wavesSurvived ?? 0) + 1; }
export function heroActive(hero: Hero): boolean {
  return !hero.life || (hero.life.kind === 'active' && !hero.life.sheltering);
}
export function heroAvailable(hero: Hero): boolean { return !hero.life || hero.life.kind === 'active'; }
export function hasHeroPerk(hero: Hero | undefined, id: HeroPerkId): boolean {
  return !!hero && heroActive(hero) && !!hero.growth?.perks.includes(id);
}
export function governorTrainingStat(land: Land): ProfessionalStat {
  switch (land.specialization ?? 'balanced') {
    case 'fortress': return 'martial';
    case 'garrison': case 'mining': return 'logistics';
    case 'trade': return 'diplomacy';
    default: return 'administration';
  }
}
export const HERO_PERKS: ReadonlyArray<{ id: HeroPerkId; discipline: HeroDiscipline; level: 3 | 6 }> = [
  { id: 'granary', discipline: 'stewardship', level: 3 }, { id: 'works', discipline: 'stewardship', level: 3 },
  { id: 'continuity', discipline: 'stewardship', level: 6 }, { id: 'relief', discipline: 'stewardship', level: 6 },
  { id: 'rearguard', discipline: 'command', level: 3 }, { id: 'prepared-line', discipline: 'command', level: 3 },
  { id: 'orderly-retreat', discipline: 'command', level: 6 }, { id: 'relief-column', discipline: 'command', level: 6 },
  { id: 'quartermaster', discipline: 'logistics', level: 3 }, { id: 'provincial-depot', discipline: 'logistics', level: 3 },
  { id: 'efficient-march', discipline: 'logistics', level: 6 }, { id: 'relief-stores', discipline: 'logistics', level: 6 },
  { id: 'resident-broker', discipline: 'statecraft', level: 3 }, { id: 'court-secretary', discipline: 'statecraft', level: 3 },
  { id: 'patient-audience', discipline: 'statecraft', level: 6 }, { id: 'custodian', discipline: 'statecraft', level: 6 },
];
export function availableHeroPerks(state: GameState, hero: Hero): HeroPerkId[] {
  if (!heroCapability(state, 'specializations') || !hero.growth || !heroAvailable(hero)) return [];
  const level = heroLevel(hero, state.ascent!.heroDepth!.rules.thresholds);
  const slot = hero.growth.perks.length === 0 ? 3 : hero.growth.perks.length === 1 ? 6 : 9;
  if (level < slot) return [];
  return HERO_PERKS.filter(perk => perk.level === slot
    && (!hero.growth!.discipline || hero.growth!.discipline === perk.discipline)
    && (perk.discipline !== 'statecraft' || heroCapability(state, 'residency'))).map(perk => perk.id);
}
/** A category's hero bonuses add once before this common cap. */
export function cappedHeroModifier(...values: number[]): number {
  return Math.max(-0.2, Math.min(0.2, values.reduce((sum, n) => sum + n, 0)));
}
/** Fate draws never consume the world RNG. Identity and event counters survive save/load. */
export function heroEventRoll(seed: number, serial: number, eventId: string): number {
  let hash = (seed ^ Math.imul(serial, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < eventId.length; i++) hash = Math.imul(hash ^ eventId.charCodeAt(i), 16777619) >>> 0;
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}
