import type { GameState } from '../../state/types';
import { HERO_XP, HERO_PERKS, PROFESSIONAL_STATS } from './heroModel';

/** Reject unsupported/corrupt hero state without rewriting either save slot or opting legacy in. */
export function validHeroSave(state: GameState): boolean {
  const depth = state.ascent?.heroDepth;
  if (!depth) return true;
  const integer = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  if (state.gameMode !== 'ascent' || ![1, 2].includes(depth.rules?.version) || typeof depth.runId !== 'string'
    || JSON.stringify(depth.rules.thresholds) !== JSON.stringify(HERO_XP)
    || depth.rules.serviceCap !== 6 || depth.rules.deedCap !== 2
    || (depth.rules.trainingPerLevel !== undefined && ![0, 2].includes(depth.rules.trainingPerLevel))
    || !['growth','specializations','travel','recovery','residency','cards','lethal'].every(key => typeof depth.rules.capabilities?.[key as keyof typeof depth.rules.capabilities] === 'boolean')
    || !Array.isArray(depth.effects) || !Array.isArray(depth.notices) || !Array.isArray(depth.policies)
    || !Array.isArray(depth.memorials) || !Array.isArray(depth.residentActions) || !depth.encounters || !depth.exposures) return false;
  const instances = new Set<string>();
  const measurements = depth.measurements;
  if (measurements) {
    const counters = (value: unknown): boolean => !!value && typeof value === 'object' && !Array.isArray(value)
      && Object.values(value).every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0);
    if (!Number.isSafeInteger(measurements.sequence) || measurements.sequence < 0 || !Array.isArray(measurements.events)
      || measurements.events.length > 256 || !counters(measurements.counts) || !counters(measurements.offers)
      || !counters(measurements.choices) || !counters(measurements.lastSeason) || !counters(measurements.recruitedAt)
      || !measurements.seasons || !Object.values(measurements.seasons).every(row => row && integer(row.available, 0, Number.MAX_SAFE_INTEGER)
        && integer(row.productive, 0, row.available)) || !measurements.milestones
      || !Object.values(measurements.milestones).every(rows => Array.isArray(rows) && rows.every(row => row && integer(row.level, 1, 8)
        && Number.isFinite(row.turn) && Number.isFinite(row.recruitedTurn)))
      || !measurements.events.every(event => event && typeof event.id === 'string' && typeof event.type === 'string'
        && typeof event.instanceId === 'string' && Number.isFinite(event.turn) && Number.isFinite(event.window))) return false;
  }
  return Array.isArray(state.heroes) && state.heroes.every(hero => {
    const growth = hero.growth;
    if (!growth) return hero.id === 'king';
    if (growth.version !== 1 || typeof growth.instanceId !== 'string' || instances.has(growth.instanceId)
      || !integer(growth.xp, 0, 126) || !growth.training || !growth.contributions || !growth.windows || !growth.uses
      || !Array.isArray(growth.deeds) || !Array.isArray(growth.perks) || growth.perks.length > 2
      || growth.perks.some(id => !HERO_PERKS.some(perk => perk.id === id))
      || !PROFESSIONAL_STATS.every(key => integer(growth.training[key], 0, 14))
      || Object.values(growth.training).reduce((sum, n) => sum + n, 0) > 14
      || !Object.values(growth.windows).every(window => integer(window.service, 0, 6) && integer(window.deed, 0, 2) && Array.isArray(window.events))
      || !hero.life || !['active','transit','recovering','captive','dead'].includes(hero.life.kind)) return false;
    if (hero.life.kind === 'active' && (!hero.life.assignment || typeof hero.life.locationId !== 'string')) return false;
    if (hero.life.kind === 'transit' && (!hero.life.intendedPost || !Array.isArray(hero.life.path) || !Number.isFinite(hero.life.arrivalTurn))) return false;
    instances.add(growth.instanceId); return true;
  });
}
