import type { Army, AscentBattle, GameState, Hero, Land } from '../../state/types';
import { cappedHeroModifier, hasHeroPerk, heroActive, heroCapability, heroWindow, heroRulesV2 } from './heroModel';

/** Multipliers apply to this person's contribution, never to the whole kingdom. */
export function heroJobScale(state: GameState, hero: Hero): number {
  if (!hero.growth) return 1;
  if (!heroActive(hero)) return 0;
  const effects = state.ascent?.heroDepth?.effects.filter(effect => effect.heroId === hero.id && effect.untilTurn > state.turn) ?? [];
  return (effects.some(effect => effect.kind === 'mentoring') ? .9 : 1)
    * (effects.some(effect => effect.kind === 'acting') ? .5 : 1);
}
export function heroProvinceModifiers(state: GameState, land: Land, candidate?: Hero) {
  return heroProvinceModifierBreakdown(state, land, candidate).applied;
}
export function heroProvinceModifierBreakdown(state: GameState, land: Land, candidate?: Hero) {
  const hero = candidate ?? state.heroes.find(person => person.assignedTo === land.id);
  const effects = state.ascent?.heroDepth?.effects.filter(effect => effect.targetId === land.id && effect.untilTurn > state.turn) ?? [];
  const scale = hero ? heroJobScale(state, hero) : 0;
  const commission = effects.some(effect => effect.kind === 'commission' && state.heroes.some(person => person.id === effect.heroId
    && heroActive(person) && person.assignedTo === land.id)) ? .1 : 0;
  const penalty = commission || (heroRulesV2(state) && effects.some(effect => effect.kind === 'commission' && (effect.productionUntilTurn ?? 0) > state.turn) ? .1 : 0);
  const continuity = !hero ? effects.find(effect => effect.kind === 'continuity') : undefined;
  const raw = {
    food: (hasHeroPerk(hero, 'granary') ? .06 * scale : 0) + (continuity?.otherId === 'food' ? .03 : 0) - penalty,
    supplies: (hasHeroPerk(hero, 'works') ? .06 * scale : 0)
      + (land.specialization === 'garrison' && hasHeroPerk(hero, 'provincial-depot') ? .06 * scale : 0)
      + (continuity?.otherId === 'supplies' ? .03 : 0) - penalty
      + (effects.some(effect => effect.kind === 'supply') ? .1 : 0),
    gold: -penalty, defense: commission,
    loyalty: hasHeroPerk(hero, 'relief') && land.loyalty < 50 ? .2 : 0,
  };
  return { raw, applied: { ...raw, food: cappedHeroModifier(raw.food), supplies: cappedHeroModifier(raw.supplies) } };
}
export function heroHostFoodMultiplier(state: GameState, army: Army): number {
  return hasHeroPerk(state.heroes.find(hero => hero.id === army.generalHeroId), 'quartermaster') ? .92 : 1;
}
export function heroHostSuppliesMultiplier(state: GameState, army: Army): number {
  return hasHeroPerk(state.heroes.find(hero => hero.id === army.generalHeroId), 'efficient-march')
    && state.movementOrders.some(order => order.armyId === army.id) ? .9 : 1;
}
export function heroBattleDefense(state: GameState, battle: AscentBattle, army: Army): number {
  const hero = state.heroes.find(person => person.id === army.generalHeroId);
  return 1 + cappedHeroModifier(battle.round === 0 && hasHeroPerk(hero, 'prepared-line') ? .06 : 0,
    battle.stance === 'withdraw' && hasHeroPerk(hero, 'rearguard') ? .1 : 0);
}
export function heroBattleAttack(state: GameState, battle: AscentBattle, army: Army): number {
  const hero = state.heroes.find(person => person.id === army.generalHeroId);
  const joined = battle.heroCombat?.[army.id]?.joinedRound;
  return joined !== undefined && joined > 0 && joined === battle.round && hasHeroPerk(hero, 'relief-column') ? 1.06 : 1;
}
export function snapshotHeroBattle(state: GameState, battle: AscentBattle, hosts: Army[]): void {
  if (!heroCapability(state, 'specializations')) return;
  for (const host of hosts) {
    const ledger = (battle.heroCombat ??= {});
    ledger[host.id] ??= { heroId: host.generalHeroId, instanceId: state.heroes.find(hero => hero.id === host.generalHeroId)?.growth?.instanceId,
      window: heroWindow(state), joinedRound: battle.round, withdrawal: { spearmen: 0, archers: 0, heavyInfantry: 0 } };
  }
}
export function restoreHeroWithdrawal(state: GameState, battle: AscentBattle): void {
  for (const [armyId, ledger] of Object.entries(battle.heroCombat ?? {})) {
    const army = state.armies.find(host => host.id === armyId);
    const hero = state.heroes.find(person => person.id === ledger.heroId);
    const window = ledger.window ?? heroWindow(state);
    if (!army || !hero?.growth || (ledger.instanceId && hero.growth.instanceId !== ledger.instanceId)
      || !hasHeroPerk(hero, 'orderly-retreat') || hero.growth.uses[`orderly-retreat:${window}`] !== undefined) continue;
    if (!Object.values(ledger.withdrawal).some(n => n > 0)) continue;
    hero.growth.uses[`orderly-retreat:${window}`] = window;
    for (const unit of ['spearmen', 'archers', 'heavyInfantry'] as const) army.units[unit] += Math.floor(ledger.withdrawal[unit] * .5);
  }
}
