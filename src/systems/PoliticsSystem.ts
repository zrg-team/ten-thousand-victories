import { writtenCodeSeverity } from './decree/rules';
import { applyResourceDelta, canSpend, progressBuildOrders, refreshAllLandOutputs } from './ResourceSystem';
import { scaledGain } from './ascent/priceScale';
import { createHeroDraft } from './HeroSystem';
import { getBuildingLevelCap } from './empire/MandateSystem';
import { PLAYER_KINGDOM_ID } from '../game/constants';
import { addCourtModifier, getCourtBonuses } from './CourtSystem';
import { addOpinionModifier } from './DiplomacySystem';
import type { CourtEffect, GameState, HeroType, Land, LandBuildingType, ResourceBag } from '../state/types';
import { buildingLabel, formatResourceList, politicsChoiceDescription, politicsChoiceLabel, politicsTitle, t } from '../i18n';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Picks the next court card, weighting crises higher when stability is low and biasing toward seated heroes' favored card types. */
export function drawPoliticsCard(state: GameState): void {
  if (state.activePoliticsCard || state.pendingCourtRequest || state.politicsDeck.length === 0) {
    return;
  }

  const weights = state.politicsDeck.map((card) => {
    let weight = 1;

    if (card.type === 'crisis' && state.court.stability < 35) {
      weight *= 2.5;
    }

    if (card.seasons?.includes(state.season)) {
      weight *= 2.25;
    }

    for (const heroId of Object.values(state.court.seats)) {
      const hero = state.heroes.find((candidate) => candidate.id === heroId);
      if (hero?.cardBias === card.type) {
        weight *= 1.5;
      }
    }

    return weight;
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * totalWeight;
  let index = 0;
  for (; index < weights.length - 1; index += 1) {
    roll -= weights[index];
    if (roll <= 0) {
      break;
    }
  }

  const card = state.politicsDeck[index];
  state.pendingCourtRequest = card;
  state.isPaused = true;
  state.message = t('msg.courtAttention', { title: politicsTitle(card) });
}

/** Decrements the court card cooldown each economy tick, drawing a new card and resetting the cooldown once it elapses. */
export function progressPoliticsCooldown(state: GameState): void {
  if (state.activePoliticsCard || state.pendingCourtRequest) {
    return;
  }

  state.court.cardCooldown -= 1;
  if (state.court.cardCooldown > 0) {
    return;
  }

  drawPoliticsCard(state);
  const bonuses = getCourtBonuses(state);
  state.court.cardCooldown = Math.max(2, Math.round(7 / bonuses.cardFrequencyMult));
}

export function choosePoliticsCard(state: GameState, choiceId: string): boolean {
  const card = state.activePoliticsCard;

  if (!card) {
    return false;
  }

  const choice = card.choices.find((candidate) => candidate.id === choiceId);

  if (!choice) {
    return false;
  }

  const cost = getChoiceResourceCost(state, choice.effects);
  if (Object.keys(cost).length > 0 && !canSpend(state, cost)) {
    state.message = t('msg.needChoiceCost', { cost: formatResourceList(cost) });
    return false;
  }

  applyCourtEffect(state, politicsChoiceLabel(choice), choice.effects);

  state.activePoliticsCard = undefined;
  state.isPaused = false;
  if (choice.effects.nextCourtCardSoon) {
    state.court.cardCooldown = 1;
  }
  if (choice.effects.extraCourtDraw) {
    drawPoliticsCard(state);
  }
  state.message = t('msg.politicsChoice', { label: politicsChoiceLabel(choice), description: politicsChoiceDescription(choice) });
  return true;
}

/**
 * Applies a card choice's payload: resource deltas, a timed/permanent court modifier, and
 * the one-shot grants. The universal effect pipeline — also used by Dragon Ascent's Power
 * Draft, where each take pushes another stacking modifier under an `asc:<id>:<n>` label.
 */
export function applyCourtEffect(state: GameState, label: string, effect: CourtEffect): void {
  if (effect.resourceDelta) {
    // A `resourceDelta` is the one-shot half of a card — paid or taken once, on the tap — so it
    // wears the realm's scale like any other one-time sum. Its sibling `resourceRateModifier` is
    // per-season and stays exactly as authored: a recurring grant is permanent, stacks, and
    // multiplies against a realm that is itself growing, which is how a card becomes an engine.
    //
    // `scaledGain` passes a mixed-sign bag straight through, so a card that trades one store for
    // another keeps the exchange rate its author wrote.
    applyResourceDelta(state, scaledGain(state, effect.resourceDelta));
  }

  const modifier = createModifier(label, effect);
  if (modifier) {
    addCourtModifier(state, modifier);
  }

  if (effect.freeBuilding) {
    grantFreeBuilding(state, effect.freeBuilding);
  }
  if (effect.freeUpgrade) {
    grantFreeUpgrade(state, effect.freeUpgrade);
  }
  if (effect.freeHeroDraft) {
    createHeroDraft(state, effect.freeHeroDraft === true ? undefined : effect.freeHeroDraft);
  }
  if (effect.completeBuildOrder) {
    completeOrderOfKind(state, 'build');
  }
  if (effect.completeUpgradeOrder) {
    completeOrderOfKind(state, 'upgrade');
  }
  if (effect.restoreArmyReadiness) {
    for (const army of state.armies.filter((candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID)) {
      army.morale = 100;
      army.supply = 100;
    }
  }
  if (effect.defenseBoost) {
    const land = pickOwnedLand(state, (candidate) => candidate.ownerId === PLAYER_KINGDOM_ID);
    if (land) {
      land.defense += effect.defenseBoost;
    }
  }
  if (effect.favorDelta) {
    state.court.favor = Math.max(0, state.court.favor + effect.favorDelta);
  }
  if (effect.stabilityDelta) {
    // Hình thư, 1042 — law written down. A court crisis lands at half force, because a realm with
    // a code has a procedure for the thing rather than an argument about it. Only the harm is
    // halved: a decree that also blunted good news would just be a tax with a nice name.
    const severity = effect.stabilityDelta < 0 ? writtenCodeSeverity(state) : 1;
    state.court.stability = clamp(state.court.stability + effect.stabilityDelta * severity, 0, 100);
  }
  if (effect.influenceDelta) {
    state.court.influence = clamp(state.court.influence + effect.influenceDelta, 0, 100);
  }

  if (effect.relationsAllDelta) {
    const delta = effect.relationsAllDelta;
    for (const kingdom of state.kingdoms) {
      if (kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated) {
        addOpinionModifier(kingdom, {
          id: `decree-${state.turn}-${kingdom.id}`,
          label: t('diplo.mod.decree'),
          value: delta,
          decay: 0.5,
          source: 'request',
        });
      }
    }
  }

  if (effect.hostilityResetAll) {
    for (const kingdom of state.kingdoms) {
      if (kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated && (kingdom.hostilityTimer ?? 0) > 0) {
        kingdom.hostilityTimer = 0;
      }
    }
  }

  refreshAllLandOutputs(state);
}

/** What a choice asks for, as it will actually be charged — see `applyCourtEffect`. */
function getChoiceResourceCost(state: GameState, effect: CourtEffect): Partial<ResourceBag> {
  const cost: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(scaledGain(state, effect.resourceDelta ?? {}))) {
    if ((value ?? 0) < 0) {
      cost[key as keyof ResourceBag] = Math.abs(value ?? 0);
    }
  }
  return cost;
}

function createModifier(label: string, effect: CourtEffect) {
  const modifierKeys: Array<keyof CourtEffect> = [
    'resourceRateModifier',
    'recruitSpeedModifier',
    'courtCardSpeedModifier',
    'armyPowerModifier',
    'armyXpModifier',
    'buildingCostModifier',
    'buildSpeedBonus',
    'upgradeSpeedBonus',
    'acquisitionCostModifier',
    'armyGoldUpkeepModifier',
    'buildingGoldUpkeepModifier',
    'buildingSuppliesUpkeepModifier',
    'marketGoldOutputModifier',
    'recruitmentSupplyCostModifier',
    'nextArmyLevelBonus',
    'nextArmyArchersBonus',
    'nextArmyHeavyBonus',
    'battleSupplyCostModifier',
    'armyLevelCapBonus',
  ];

  if (!modifierKeys.some((key) => typeof effect[key] !== 'undefined')) {
    return undefined;
  }

  return {
    id: `court-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    label,
    remainingTicks: effect.permanent ? undefined : effect.durationTicks ?? 1,
    resourceRateModifier: effect.resourceRateModifier,
    recruitSpeedModifier: effect.recruitSpeedModifier,
    courtCardSpeedModifier: effect.courtCardSpeedModifier,
    armyPowerModifier: effect.armyPowerModifier,
    armyXpModifier: effect.armyXpModifier,
    buildingCostModifier: effect.buildingCostModifier,
    buildSpeedBonus: effect.buildSpeedBonus,
    upgradeSpeedBonus: effect.upgradeSpeedBonus,
    acquisitionCostModifier: effect.acquisitionCostModifier,
    armyGoldUpkeepModifier: effect.armyGoldUpkeepModifier,
    buildingGoldUpkeepModifier: effect.buildingGoldUpkeepModifier,
    buildingSuppliesUpkeepModifier: effect.buildingSuppliesUpkeepModifier,
    marketGoldOutputModifier: effect.marketGoldOutputModifier,
    recruitmentSupplyCostModifier: effect.recruitmentSupplyCostModifier,
    nextArmyLevelBonus: effect.nextArmyLevelBonus,
    nextArmyArchersBonus: effect.nextArmyArchersBonus,
    nextArmyHeavyBonus: effect.nextArmyHeavyBonus,
    battleSupplyCostModifier: effect.battleSupplyCostModifier,
    armyLevelCapBonus: effect.armyLevelCapBonus,
  };
}

function pickOwnedLand(state: GameState, predicate: (land: Land) => boolean): Land | undefined {
  return state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID && predicate(land))
    .sort((a, b) => b.buildingCapacity - b.buildings.length - (a.buildingCapacity - a.buildings.length))[0];
}

function isSingletonBuilding(type: LandBuildingType): boolean {
  return type === 'wall' || type === 'tower' || type === 'barracks' || type === 'communalHall';
}

function grantFreeBuilding(state: GameState, type: LandBuildingType): void {
  const land = pickOwnedLand(state, (candidate) => {
    if (candidate.buildings.length >= candidate.buildingCapacity) {
      return false;
    }
    return !isSingletonBuilding(type) || !candidate.buildings.some((building) => building.type === type);
  });

  if (!land) {
    state.message = t('msg.noFreeBuildingRoom', { building: buildingLabel(type) });
    return;
  }

  land.buildings.push({ type, level: 1 });
  if (type === 'wall') {
    land.defense += 6;
  } else if (type === 'tower') {
    land.defense += 10;
  }
}

function grantFreeUpgrade(state: GameState, type: LandBuildingType): void {
  for (const land of state.lands.filter((candidate) => candidate.ownerId === PLAYER_KINGDOM_ID)) {
    const building = land.buildings.find((candidate) => candidate.type === type && candidate.level < getBuildingLevelCap(state));
    if (building) {
      building.level += 1;
      if (type === 'wall') {
        land.defense += 6;
      } else if (type === 'tower') {
        land.defense += 10;
      }
      return;
    }
  }

  grantFreeBuilding(state, type);
}

function completeOrderOfKind(state: GameState, kind: 'build' | 'upgrade'): void {
  const order = state.buildOrders.find((candidate) => candidate.kind === kind);
  if (!order) {
    return;
  }
  order.progress = order.required;
  progressBuildOrders(state);
}
