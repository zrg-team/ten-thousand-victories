import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../game/constants';
import { getAcquisitionOrder, findLand, isLandVisibleToPlayer, refreshPlayerVisibility } from './LandSystem';
import { applyResourceDelta, canSpend, landPopulationCapacity, refreshAllLandOutputs } from './ResourceSystem';
import { getCourtBonuses } from './CourtSystem';
import { extraClaimSlots } from './ascent/DoctrineSystem';
import { realmGrossGold, realmIncomeScale, realmPriceScale, storePriceScale } from './ascent/priceScale';
import {
  ASCENT_SETTLE_CAPACITY_DIVISOR,
  CLAIM_BAR_TICKS,
  CLAIM_FAIL_CHANCE_PENALTY,
  CLAIM_FAIL_ESCALATION,
  CLAIM_FAIL_LIMIT,
  EARLY_WAVE_GRACE,
  OPENING_CLAIM_PARTIES,
} from '../game/ascentConfig';
import type { AcquisitionMethod, AcquisitionOrder, Army, GameState, Hero, Land, ResourceBag } from '../state/types';
import { formatResourceList, heroName, t } from '../i18n';

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_TRUST = 40;
const INTIMIDATION_REQUIRED = 100;
const RESIST_FACTOR = 4;
const MIN_INTIMIDATION_RATIO = 0.5;
/**
 * What a province's own worth adds to its asking price.
 *
 * Weighted so the *yield* terms dominate a developed town and `CLAIM_BASE_PRICE` still carries a
 * bare one — the opening must keep paying roughly what it paid before, which
 * `verify-setup-phase` pins. Population is deliberately the gentlest of the three: people make a
 * place worth having, but pricing them steeply would make the largest provinces unbuyable rather
 * than expensive, and force is supposed to be the alternative, not the only answer.
 */
const CLAIM_BASE_PRICE = 14;
/** What the classic economies have always paid before the per-province terms. Do not touch. */
const CLAIM_BASE_PRICE_CLASSIC = 20;
const CLAIM_WORTH_PER_GOLD = 1.6;
const CLAIM_WORTH_PER_YIELD = 0.9;
const CLAIM_WORTH_PER_HEAD = 0.05;
/** Seasons of the realm's gross income a province can never cost less than. */
const CLAIM_INCOME_SEASONS = 0.5;
const BRIBE_SUCCESS_BASE = 85;
const BRIBE_NOBLE_PENALTY = 0.9;
const BRIBE_MIN_CHANCE = 0.25;
const BRIBE_MAX_CHANCE = 0.9;
const DIPLOMACY_TRUST_THRESHOLD_BASE = 65;
const DIPLOMACY_SUPPLIES_BASE = 10;
const DIPLOMACY_ASSIGNMENT_PREFIX = 'diplomacy-';
const SETTLE_HUMANS_BASE = 80;
/** Share of what the ground could eventually hold that must walk there to begin with. */
const SETTLE_CAPACITY_SHARE = 0.22;
const SETTLE_TICKS_BASE = 4;

const BUILDING_ACQUISITION_BONUS: Partial<Record<string, Partial<ResourceBag>>> = {
  farm: { food: 8 },
  mine: { supplies: 6 },
  market: { gold: 10 },
};

// ─── Claim Slots ──────────────────────────────────────────────────────────────

/**
 * How many provinces the realm can be courting at once.
 *
 * Claiming was previously unbounded: the only guard was one order per *land*, so a rich player
 * could open a claim on every neutral province on their border in a single sitting and simply wait.
 * That made expansion a question of treasury size rather than of choosing where to go next, and it
 * is why "which province, and by what method?" never felt like a decision worth the two taps.
 *
 * One at a time by default, so the choice is forced. The ceiling is raised by things the player
 * earns — the Surveyors' Corps power card and the Surveyors' Charter edict — which is what turns
 * "I want to expand faster" into something to build toward rather than a slider.
 *
 * Ascent only: the classic modes have never had a cap and must keep behaving exactly as they did.
 */
export function getClaimSlots(state: GameState): number {
  if (state.gameMode !== 'ascent') {
    return Number.POSITIVE_INFINITY;
  }
  // One more party for the founding — see `OPENING_CLAIM_PARTIES`. A claim already in flight when
  // the grace ends finishes; the slot simply does not reopen.
  const founding = (state.ascent?.wave ?? Number.POSITIVE_INFINITY) <= EARLY_WAVE_GRACE ? OPENING_CLAIM_PARTIES : 0;
  return 1 + extraClaimSlots(state) + getCourtBonuses(state).claimSlotBonus + founding;
}

/**
 * The methods that spend one of the realm's claim parties.
 *
 * Keyed on `AcquisitionMethod` — the shape an *order* carries — and deliberately not shared with
 * the conquest sheet's `CLAIM_METHODS`, which is keyed on `AscentConquestMethod` and spells the
 * military verb `siege` where an order says `conquest`. The two sets overlap without being the
 * same, and one list serving both would silently mis-file whichever name it did not know.
 */
const SLOTTED_METHODS: ReadonlySet<AcquisitionMethod> = new Set<AcquisitionMethod>([
  'bribe', 'diplomacy', 'intimidation', 'settle',
]);

/**
 * Claims the player currently has in flight. Bot-owned orders are not the player's problem.
 *
 * **An occupation is not a claim.** `occupyEmptyLand` files an order like everything else but
 * checks no slot before it does — walking a host onto empty ground is bookkeeping, not an envoy.
 * Counting it here meant that bookkeeping silently ate the realm's only party: the player was
 * told "all committed" while nothing was committed to anyone, and the Build lane shut its claim
 * browser on the strength of it. The cap is on envoys and coin; the army is the player's own
 * business, and neither half of that rule may be enforced without the other.
 */
export function getPlayerClaimCount(state: GameState): number {
  return state.acquisitionOrders.filter(
    (order) => order.buyerId === PLAYER_KINGDOM_ID && SLOTTED_METHODS.has(order.method),
  ).length;
}

/**
 * Whether another claim can be opened right now.
 *
 * Shared by all four starters and by `buildMethodOptions`, so a method that cannot be afforded in
 * *slots* is greyed out with a reason rather than silently failing on the tap — the same contract
 * that file already keeps for gold, supplies and heroes.
 */
export function canStartClaim(state: GameState): boolean {
  return getPlayerClaimCount(state) < getClaimSlots(state);
}

/** The reason a claim cannot start, or undefined if one can. */
export function claimBlockedReason(state: GameState): string | undefined {
  if (canStartClaim(state)) return undefined;
  return t('ascent.claim.allCommitted', { used: getPlayerClaimCount(state), cap: getClaimSlots(state) });
}

/** Guard shared by the four starters. Sets `state.message` so a blocked tap explains itself. */
function blockedByClaimSlots(state: GameState): boolean {
  const reason = claimBlockedReason(state);
  if (!reason) return false;
  state.message = reason;
  return true;
}

/**
 * Calls off a claim in progress and hands back what can honestly be handed back.
 *
 * There was no way to do this at all: an order ended only when the world drifted out from under it
 * — the diplomat was reassigned, or the intimidating host marched away — so a claim opened by
 * mistake occupied its slot until it completed. With a cap in place that would be a trap rather
 * than a constraint.
 *
 * Refunds are deliberately partial and deliberately explicit. A bribe's gold is in the noble's
 * hands already (`bribeLand` spends it before the order exists) and the settlers of a settle order
 * have physically left; only the diplomatic mission's supplies are still in the baggage train, and
 * even those come back short. The UI states the figure before the player confirms.
 */
export function cancelAcquisition(state: GameState, landId: string): boolean {
  const index = state.acquisitionOrders.findIndex(
    (order) => order.landId === landId && order.buyerId === PLAYER_KINGDOM_ID,
  );
  if (index < 0) return false;

  const order = state.acquisitionOrders[index];
  const land = findLand(state, landId);

  // No fatigue: the envoy was recalled, not worn out by a mission they completed.
  releaseDiplomaticHero(state, order, false);

  const refund = getClaimRefund(state, order);
  if (Object.keys(refund).length > 0) {
    applyResourceDelta(state, refund);
  }

  state.acquisitionOrders.splice(index, 1);
  // The order was granting sight of the province; without this the map keeps showing it.
  refreshPlayerVisibility(state);
  state.message = t('ascent.claim.cancelled', { land: land?.name ?? '' });
  return true;
}

/** What calling off a claim hands back. Exported so the confirm sheet can state it honestly. */
export function getClaimRefund(state: GameState, order: AcquisitionOrder): Partial<ResourceBag> {
  if (order.method !== 'diplomacy') {
    // Bribe gold is spent, settlers have left, an intimidating host costs nothing to recall.
    return {};
  }
  const land = findLand(state, order.landId);
  if (!land) return {};
  return { supplies: Math.round(getDiplomacySuppliesCost(state, land) * CLAIM_REFUND_SHARE) };
}

/** Share of a recallable claim's cost that comes back. The rest is the cost of changing your mind. */
const CLAIM_REFUND_SHARE = 0.5;

// ─── Derived Scores ───────────────────────────────────────────────────────────

export function getLandTrust(land: Land, kingdomId: string): number {
  return land.trust[kingdomId] ?? BASE_TRUST;
}

/**
 * What this province remembers about being offered money. Zero outside Dragon Ascent, where the
 * ledger does not exist and the classic modes must keep behaving exactly as they did.
 */
export function getClaimFailures(state: GameState, landId: string): number {
  if (state.gameMode !== 'ascent') return 0;
  return state.ascent?.claimAttempts?.[landId]?.failures ?? 0;
}

/** Seasons until this province will hear coin again, or 0 if it will hear it now. */
export function getClaimBarSeasons(state: GameState, landId: string): number {
  if (state.gameMode !== 'ascent') return 0;
  const until = state.ascent?.claimAttempts?.[landId]?.barredUntil ?? 0;
  return Math.max(0, until - state.turn);
}

/** True while the nobles here refuse to discuss money at all. */
export function isClaimBarred(state: GameState, landId: string): boolean {
  return getClaimBarSeasons(state, landId) > 0;
}

/**
 * Records a refused bribe against the province, and shuts the door once it has said no enough.
 *
 * The bar lengthens with the failure count rather than resetting it: a province that has turned
 * the crown down three times, waited out the bar and been refused again is not back where it
 * started. Only coin is barred — `bribeOption` is the sole reader — so envoy, intimidation and
 * force stay open and no province can ever be locked away.
 */
function noteClaimRefusal(state: GameState, landId: string): void {
  const ascent = state.ascent;
  if (state.gameMode !== 'ascent' || !ascent) return;
  ascent.claimAttempts ??= {};
  const record = ascent.claimAttempts[landId] ?? { failures: 0 };
  record.failures += 1;
  if (record.failures >= CLAIM_FAIL_LIMIT) {
    record.barredUntil = state.turn + CLAIM_BAR_TICKS * record.failures;
  }
  ascent.claimAttempts[landId] = record;
}

export function getNoblePower(land: Land): number {
  return land.localSoldiers
    + land.buildings.length * 4
    + land.buildingCapacity * 2
    + Math.floor(land.population / 20);
}

/**
 * The odds coin carries here, *after* what the province already thinks of the offer.
 *
 * Takes `state` because a refusal is remembered now: each previous one costs
 * `CLAIM_FAIL_CHANCE_PENALTY` before the usual floor. Without it the 25% floor made repetition a
 * waiting game — a purse large enough took any province in about four tries, whatever it did.
 */
export function getBribeSuccessChance(state: GameState, land: Land): number {
  const refused = getClaimFailures(state, land.id);
  const raw = (BRIBE_SUCCESS_BASE - getNoblePower(land) * BRIBE_NOBLE_PENALTY) / 100
    - refused * CLAIM_FAIL_CHANCE_PENALTY;
  return Math.min(BRIBE_MAX_CHANCE, Math.max(BRIBE_MIN_CHANCE, raw));
}

/**
 * What the nobles of a village ask to hand it over.
 *
 * Three things set it, and only the third was here before:
 *
 *  - **What the province is worth.** Its own yield and its people. Reported as *"it should be
 *    based on the economy of the land and the number of people"* — and the old formula read
 *    neither. It priced walls, slots and the watch, so a rich market town and a bare hamlet with
 *    the same garrison cost the same, and the most valuable ground on the board was routinely the
 *    cheapest thing on the sheet.
 *  - **What it has already refused.** `CLAIM_FAIL_ESCALATION` compounds per refusal, so a second
 *    attempt is half again as dear and a fourth is four times the first. The gold spent on a
 *    failure also *lowers* the treasury's wealth factor, which used to make the next attempt
 *    fractionally cheaper — the escalation is what turns that the right way round.
 *  - **What the crown can afford.** The scaled purse (Dragon Ascent; exactly 1 elsewhere).
 */
export function getGoldBribeCost(state: GameState, land: Land): number {
  const bonuses = getCourtBonuses(state);
  // Dragon Ascent only, like every other term added this round: the classic economies are held
  // byte-identical (`verify-modes-regression`), so they keep the flat 20 and the old shape exactly.
  const ascent = state.gameMode === 'ascent';
  const worth = ascent
    ? land.outputs.gold * CLAIM_WORTH_PER_GOLD
      + (land.outputs.food + land.outputs.supplies) * CLAIM_WORTH_PER_YIELD
      + land.population * CLAIM_WORTH_PER_HEAD
    : 0;
  const base = (ascent ? CLAIM_BASE_PRICE : CLAIM_BASE_PRICE_CLASSIC) + worth
    + land.defense * 0.5 + land.buildingCapacity * 2 + land.localSoldiers * 1.5;
  const refused = Math.pow(CLAIM_FAIL_ESCALATION, getClaimFailures(state, land.id));
  const priced = base * bonuses.acquisitionCostMult * realmPriceScale(state) * refused;
  if (!ascent) return Math.ceil(priced);
  /**
   * **Never below a season of the realm's own income.**
   *
   * The per-province terms above fixed *which* province costs what; they could not fix the fact
   * that a fixed base wears a sub-linear price curve (`^0.6`) while income grows faster than it.
   * Measured on a played run, a province cost 0.40 seasons of income at season 40 and **0.14** at
   * season 120 — the most important purchase in the game, the one compounding asset on the board,
   * costing a fifth of what a single season brought in. Coin on the claim card was decoration.
   *
   * Same shape the war card has used since it was written (`fortifyCost`): a floor in seasons of
   * income, so a crown pays a crown's price for a province. It wears the court's discount and the
   * province's own refusals like the quoted price does, and the founding never feels it — the
   * opening grosses about sixty a season against a village asking near seventy.
   */
  const floor = realmGrossGold(state) * CLAIM_INCOME_SEASONS * bonuses.acquisitionCostMult * refused;
  return Math.ceil(Math.max(priced, floor));
}

export function getDiplomacyThreshold(land: Land): number {
  return DIPLOMACY_TRUST_THRESHOLD_BASE + getNoblePower(land) * 0.3;
}

export function getDiplomacySuppliesCost(state: GameState, land: Land): number {
  const bonuses = getCourtBonuses(state);
  // Goods, not coin: the realm's size sets the ask (income scale) and a full armoury raises it
  // (its own wealth factor); the treasury's hoard is not what a gift of goods is measured by.
  return Math.ceil((DIPLOMACY_SUPPLIES_BASE + getNoblePower(land) * 0.5) * bonuses.acquisitionCostMult
    * realmIncomeScale(state) * storePriceScale(state, 'supplies'));
}

/**
 * Settlers enough to make something of the ground.
 *
 * A flat eighty people was the whole price of a province from the founding to the fall — real at
 * the opening, and nothing at all against a realm of forty thousand. It now scales with **the
 * ground being settled**, not with the realm's wealth: a wide, fertile site asks for more hands
 * than a thin one, which is both true and the one way of pricing people that does not break the
 * rule that a man is a man. `landPopulationCapacity` is what the province can eventually hold,
 * so the ask is a share of the place it is meant to become.
 */
export function getSettleHumansCost(state: GameState, land?: Land): number {
  if (!land || state?.gameMode !== 'ascent') return SETTLE_HUMANS_BASE;
  const capacity = landPopulationCapacity(state, land);
  return Math.max(SETTLE_HUMANS_BASE, Math.round(capacity * SETTLE_CAPACITY_SHARE));
}

export function getSettleTicks(state: GameState, land: Land): number {
  // Dragon Ascent settles empty ground at half the per-slot pace — see
  // `ASCENT_SETTLE_CAPACITY_DIVISOR`. The classic formula is untouched.
  const perSlot = state.gameMode === 'ascent'
    ? Math.ceil(land.buildingCapacity / ASCENT_SETTLE_CAPACITY_DIVISOR)
    : land.buildingCapacity;
  return Math.max(3, SETTLE_TICKS_BASE + perSlot);
}

export function getDiplomacyAssignment(landId: string): string {
  return `${DIPLOMACY_ASSIGNMENT_PREFIX}${landId}`;
}

export function getAssignedDiplomaticHero(state: GameState, order: AcquisitionOrder): Hero | undefined {
  if (order.method !== 'diplomacy' || !order.heroId) return undefined;
  const hero = state.heroes.find((h) => h.id === order.heroId);
  return hero?.assignedTo === getDiplomacyAssignment(order.landId) ? hero : undefined;
}

function releaseDiplomaticHero(state: GameState, order: AcquisitionOrder, addFatigue: boolean): void {
  const hero = getAssignedDiplomaticHero(state, order);
  if (!hero) return;
  hero.assignedTo = undefined;
  if (addFatigue) {
    hero.fatigue = Math.min(100, hero.fatigue + 20);
  }
}

// ─── Resource Bonus ───────────────────────────────────────────────────────────

export function getAcquisitionResourceBonus(land: Land): Partial<ResourceBag> {
  const bonus: Partial<ResourceBag> = {};
  for (const building of land.buildings) {
    const base = BUILDING_ACQUISITION_BONUS[building.type];
    if (!base) continue;
    const mult = 1 + (building.level - 1) * 0.6;
    for (const [key, value] of Object.entries(base) as Array<[keyof ResourceBag, number]>) {
      bonus[key] = (bonus[key] ?? 0) + Math.round(value * mult);
    }
  }
  return bonus;
}

// ─── Completion ───────────────────────────────────────────────────────────────

const LOYALTY_BY_METHOD: Record<AcquisitionMethod, number> = {
  bribe: 68,
  diplomacy: 85,
  intimidation: 50,
  settle: 65,
  occupy: 55,
  conquest: 60,
};

function completeLandAcquisition(state: GameState, land: Land, order: AcquisitionOrder): void {
  land.ownerId = PLAYER_KINGDOM_ID;
  land.loyalty = Math.max(land.loyalty, LOYALTY_BY_METHOD[order.method]);

  if (land.population > 0) {
    applyResourceDelta(state, { humans: land.population });
  }

  const bonus = getAcquisitionResourceBonus(land);
  if (Object.keys(bonus).length > 0) {
    applyResourceDelta(state, bonus);
  }

  if (order.method === 'intimidation') {
    land.trust[PLAYER_KINGDOM_ID] = Math.max(0, getLandTrust(land, PLAYER_KINGDOM_ID) - 15);
  }

  releaseDiplomaticHero(state, order, true);

  const popMsg = land.population > 0 ? t('msg.populationBonus', { population: land.population }) : '';
  const bonusKeys = formatResourceList(bonus);
  const bonusMsg = bonusKeys ? t('msg.resourceBonus', { bonus: bonusKeys }) : '';

  const methodMessages: Record<AcquisitionMethod, string> = {
    bribe: t('msg.acquiredBribe', { land: land.name, popMsg, bonusMsg }),
    diplomacy: t('msg.acquiredDiplomacy', { land: land.name, popMsg, bonusMsg }),
    intimidation: t('msg.acquiredIntimidation', { land: land.name, popMsg, bonusMsg }),
    settle: t('msg.acquiredSettle', { land: land.name }),
    occupy: t('msg.acquiredOccupy', { land: land.name }),
    conquest: t('msg.acquiredConquest', { land: land.name }),
  };
  state.message = methodMessages[order.method];
}

// ─── Bribe ────────────────────────────────────────────────────────────────────

export function bribeLand(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== NEUTRAL_OWNER_ID || !land.hasVillage) return false;

  if (getAcquisitionOrder(state, landId)) {
    state.message = t('msg.acquisitionProgress', { land: land.name });
    return false;
  }

  if (blockedByClaimSlots(state)) return false;

  const hasOwnedNeighbor = land.neighbors.some((nId) => findLand(state, nId)?.ownerId === PLAYER_KINGDOM_ID);
  if (!hasOwnedNeighbor) {
    state.message = t('msg.neutralAdjacentOnly');
    return false;
  }

  const cost = getGoldBribeCost(state, land);
  if (!canSpend(state, { gold: cost })) {
    state.message = t('msg.needGoldBribe', { cost });
    return false;
  }

  applyResourceDelta(state, { gold: -cost });

  const successChance = getBribeSuccessChance(state, land);
  if (Math.random() > successChance) {
    land.trust[PLAYER_KINGDOM_ID] = Math.max(0, getLandTrust(land, PLAYER_KINGDOM_ID) - 25);
    // The province remembers. The next offer here is dearer, likelier to fail, and after enough
    // of them will not be heard at all — see `noteClaimRefusal`.
    noteClaimRefusal(state, landId);
    state.message = t('msg.bribeRefused', { land: land.name });
    return false;
  }

  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    progress: 0,
    required: 1,
    costGold: cost,
    method: 'bribe',
  });
  refreshPlayerVisibility(state);
  state.message = t('msg.bribeAccepted', { land: land.name });
  return true;
}

// ─── Diplomatic Claim ─────────────────────────────────────────────────────────

export function startDiplomaticClaim(state: GameState, landId: string, heroId?: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== NEUTRAL_OWNER_ID || !land.hasVillage) return false;

  if (getAcquisitionOrder(state, landId)) {
    state.message = t('msg.acquisitionProgress', { land: land.name });
    return false;
  }

  if (blockedByClaimSlots(state)) return false;

  const hasOwnedNeighbor = land.neighbors.some((nId) => findLand(state, nId)?.ownerId === PLAYER_KINGDOM_ID);
  if (!hasOwnedNeighbor) {
    state.message = t('msg.neutralAdjacentOnly');
    return false;
  }

  if (!heroId) {
    state.message = t('msg.assignHeroDiplomacy');
    return false;
  }

  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero) {
    state.message = t('msg.heroUnavailableDiplomacy');
    return false;
  }

  if (hero.assignedTo) {
    state.message = t('msg.heroAlreadyAssigned', { hero: heroName(hero) });
    return false;
  }

  const suppliesCost = getDiplomacySuppliesCost(state, land);
  if (!canSpend(state, { supplies: suppliesCost })) {
    state.message = t('msg.needSuppliesDiplomacy', { cost: suppliesCost });
    return false;
  }

  applyResourceDelta(state, { supplies: -suppliesCost });
  hero.assignedTo = getDiplomacyAssignment(landId);

  const threshold = getDiplomacyThreshold(land);
  const currentTrust = getLandTrust(land, PLAYER_KINGDOM_ID);
  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    // Progress tracks trust toward the threshold so the on-map badge reads correctly.
    progress: Math.floor(currentTrust),
    required: Math.ceil(threshold),
    costGold: 0,
    method: 'diplomacy',
    heroId: hero.id,
  });

  refreshPlayerVisibility(state);
  state.message = t('msg.heroTravels', { hero: heroName(hero), land: land.name, threshold: Math.ceil(threshold), current: Math.floor(currentTrust) });
  return true;
}

// ─── Intimidation ─────────────────────────────────────────────────────────────

export function startIntimidation(state: GameState, landId: string, armyId: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== NEUTRAL_OWNER_ID || !land.hasVillage) return false;

  if (getAcquisitionOrder(state, landId)) {
    state.message = t('msg.acquisitionProgress', { land: land.name });
    return false;
  }

  if (blockedByClaimSlots(state)) return false;

  const army = state.armies.find((a) => a.id === armyId && a.kingdomId === PLAYER_KINGDOM_ID);
  if (!army) return false;

  const armyLand = findLand(state, army.landId);
  if (!armyLand || armyLand.ownerId !== PLAYER_KINGDOM_ID || !armyLand.neighbors.includes(landId)) {
    state.message = t('msg.armyAdjacentThreat', { land: land.name });
    return false;
  }

  const power = computeArmyPower(army);
  if (power < land.localSoldiers * MIN_INTIMIDATION_RATIO) {
    state.message = t('msg.armyTooWeak', { power: Math.round(power), land: land.name, garrison: land.localSoldiers });
    return false;
  }

  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    progress: 0,
    required: INTIMIDATION_REQUIRED,
    costGold: 0,
    method: 'intimidation',
    armyId,
  });

  refreshPlayerVisibility(state);
  state.message = t('msg.armyPressures', { land: land.name });
  return true;
}

function computeArmyPower(army: Army): number {
  const units = army.units.spearmen + army.units.archers * 1.25 + army.units.heavyInfantry * 1.8;
  return units * (army.morale / 100) * (army.supply / 100) * (1 + Math.max(0, army.level - 1) * 0.08);
}

// ─── Settle ───────────────────────────────────────────────────────────────────

export function settleLand(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== NEUTRAL_OWNER_ID || land.hasVillage) return false;

  if (getAcquisitionOrder(state, landId)) {
    state.message = t('msg.acquisitionProgress', { land: land.name });
    return false;
  }

  if (blockedByClaimSlots(state)) return false;

  const hasOwnedNeighbor = land.neighbors.some((nId) => findLand(state, nId)?.ownerId === PLAYER_KINGDOM_ID);
  if (!hasOwnedNeighbor) {
    state.message = t('msg.settleAdjacentOnly');
    return false;
  }

  const humansCost = getSettleHumansCost(state, land);
  if (!canSpend(state, { humans: humansCost })) {
    state.message = t('msg.needHumansSettlers', { cost: humansCost });
    return false;
  }

  const required = getSettleTicks(state, land);
  applyResourceDelta(state, { humans: -humansCost });
  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    progress: 0,
    required,
    costGold: 0,
    method: 'settle',
  });

  refreshPlayerVisibility(state);
  state.message = t('msg.settlersDepart', { land: land.name, seasons: required });
  return true;
}

// ─── Occupy (called from WarSystem when army enters empty neutral land) ────────

export function occupyEmptyLand(state: GameState, armyId: string, landId: string): void {
  const land = findLand(state, landId);
  const army = state.armies.find((a) => a.id === armyId);
  if (!land || !army || land.ownerId !== NEUTRAL_OWNER_ID || land.hasVillage) return;

  const fromLandId = army.landId;
  army.landId = landId;

  state.acquisitionOrders.push({
    landId,
    buyerId: PLAYER_KINGDOM_ID,
    progress: 0,
    required: 1,
    costGold: 0,
    method: 'occupy',
    armyId,
  });

  state.message = t('msg.armyEntersWilderness', { army: army.name, land: land.name });

  // Resolve immediately next tick via progressAcquisitions, but also record fromLandId on army
  // so the army is already at the new land for pathfinding purposes.
  void fromLandId;
}

// ─── Progress All Acquisition Orders ─────────────────────────────────────────

export function progressAcquisitions(state: GameState): boolean {
  const toComplete: string[] = [];
  const toCancel: string[] = [];

  for (const order of state.acquisitionOrders) {
    if (order.buyerId !== PLAYER_KINGDOM_ID) {
      // Bot conquest: simple tick progression
      order.progress += 1;
      if (order.progress >= order.required) toComplete.push(order.landId);
      continue;
    }

    switch (order.method) {
      case 'bribe':
      case 'settle':
      case 'occupy': {
        order.progress += 1;
        if (order.progress >= order.required) toComplete.push(order.landId);
        break;
      }

      case 'diplomacy': {
        const land = findLand(state, order.landId);
        const hero = order.heroId ? state.heroes.find((h) => h.id === order.heroId) : undefined;
        if (!land) {
          toCancel.push(order.landId);
          break;
        }
        if (!hero || hero.assignedTo !== getDiplomacyAssignment(order.landId)) {
          state.message = t('msg.diplomacyCancelledNoHero', { land: land.name });
          toCancel.push(order.landId);
          break;
        }
        const bonuses = getCourtBonuses(state);
        const gain = (1 + hero.stats.administration * 0.03) * bonuses.acquisitionSpeedMult;
        land.trust[PLAYER_KINGDOM_ID] = Math.min(100, getLandTrust(land, PLAYER_KINGDOM_ID) + gain);
        // Mirror trust into the order so the progress badge advances visibly.
        order.progress = Math.floor(land.trust[PLAYER_KINGDOM_ID]);
        if (land.trust[PLAYER_KINGDOM_ID] >= order.required) toComplete.push(order.landId);
        break;
      }

      case 'intimidation': {
        const land = findLand(state, order.landId);
        const army = order.armyId ? state.armies.find((a) => a.id === order.armyId) : undefined;
        if (!land || !army) {
          toCancel.push(order.landId);
          break;
        }
        const armyLand = findLand(state, army.landId);
        if (!armyLand || !armyLand.neighbors.includes(order.landId)) {
          state.message = t('msg.intimidationCancelledMoved', { land: land.name });
          toCancel.push(order.landId);
          break;
        }
        const power = computeArmyPower(army);
        const gain = power / Math.max(1, land.localSoldiers * RESIST_FACTOR);
        order.progress = Math.min(INTIMIDATION_REQUIRED, order.progress + gain);
        if (order.progress >= INTIMIDATION_REQUIRED) toComplete.push(order.landId);
        break;
      }

      default:
        break;
    }
  }

  for (const order of state.acquisitionOrders) {
    if (toCancel.includes(order.landId)) {
      releaseDiplomaticHero(state, order, false);
    }
  }

  state.acquisitionOrders = state.acquisitionOrders.filter((o) => !toCancel.includes(o.landId));

  if (toComplete.length === 0) return toCancel.length > 0;

  for (const landId of toComplete) {
    const land = findLand(state, landId);
    const order = getAcquisitionOrder(state, landId);
    if (!land || !order || land.ownerId !== NEUTRAL_OWNER_ID) continue;

    if (order.buyerId === PLAYER_KINGDOM_ID) {
      completeLandAcquisition(state, land, order);
    } else {
      // Bot conquest completion
      land.ownerId = order.buyerId;
      land.loyalty = Math.max(land.loyalty, 60);
      const kingdom = state.kingdoms.find((k) => k.id === order.buyerId);
      if (kingdom && isLandVisibleToPlayer(state, landId)) {
        state.message = t('msg.landJoinsKingdom', { land: land.name, kingdom: kingdom.name });
      }
    }
  }

  state.acquisitionOrders = state.acquisitionOrders.filter((o) => !toComplete.includes(o.landId));
  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  return true;
}
