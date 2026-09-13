import type { GameState, Hero } from '../../state/types';
import { refreshAllLandOutputs } from '../ResourceSystem';
import { garrisonPower } from '../WarSystem';
import { commitHeroAssignment, applyHeroDepartureEffects, serviceStat } from './HeroService';
import type { HeroAssignment } from './types';
import { heroProvinceModifierBreakdown } from './heroContributions';
import { governorTrainingStat } from './heroModel';

export function heroImpactParams(view: { gold: number; food: number; supplies: number; defense: number }) {
  return { gold: +view.gold.toFixed(2), food: +view.food.toFixed(2), supplies: +view.supplies.toFixed(2), defense: view.defense };
}

/** Compare the actual economic and defense readers on an isolated state, never invented penalties. */
export function heroDepartureImpact(state: GameState, hero: Hero) {
  const copy = structuredClone(state), person = copy.heroes.find(candidate => candidate.id === hero.id)!;
  const land = state.lands.find(province => province.id === hero.assignedTo);
  refreshAllLandOutputs(copy);
  const before = { ...copy.resourceRates };
  const defenseBefore = land ? garrisonPower(copy, copy.lands.find(province => province.id === land.id)!) : 0;
  applyHeroDepartureEffects(copy, person);
  commitHeroAssignment(copy, person, { kind: 'home' }); refreshAllLandOutputs(copy);
  const defenseAfter = land ? garrisonPower(copy, copy.lands.find(province => province.id === land.id)!) : 0;
  return { gold: copy.resourceRates.gold - before.gold, food: copy.resourceRates.food - before.food,
    supplies: copy.resourceRates.supplies - before.supplies,
    defense: defenseBefore ? Math.round((defenseAfter / defenseBefore - 1) * 100) : 0 };
}

/** A hypothetical settled posting; never executes a transfer or changes the live candidate. */
export function heroAssignmentPreview(state: GameState, hero: Hero, assignment: HeroAssignment) {
  const copy = structuredClone(state), person = copy.heroes.find(candidate => candidate.id === hero.id)!;
  refreshAllLandOutputs(copy);
  const before = { ...copy.resourceRates };
  const land = assignment.kind === 'province' ? copy.lands.find(province => province.id === assignment.landId) : undefined;
  const defenseBefore = land ? garrisonPower(copy, land) : 0;
  applyHeroDepartureEffects(copy, person);
  commitHeroAssignment(copy, person, assignment); refreshAllLandOutputs(copy);
  const defenseAfter = land ? garrisonPower(copy, land) : 0;
  return { stat: land ? governorTrainingStat(land) : serviceStat(copy, person), modifiers: land ? heroProvinceModifierBreakdown(copy, land) : undefined,
    gold: copy.resourceRates.gold - before.gold, food: copy.resourceRates.food - before.food,
    supplies: copy.resourceRates.supplies - before.supplies,
    defense: defenseBefore ? Math.round((defenseAfter / defenseBefore - 1) * 100) : 0 };
}
