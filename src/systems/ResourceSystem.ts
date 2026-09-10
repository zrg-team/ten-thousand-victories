import { isEndlessMode, PLAYER_KINGDOM_ID } from '../game/constants';
import {
  GARRISON_RECOVER_MIN_STEP,
  GARRISON_RECOVER_SHARE,
  MILITIA_OVER_CAP_DECAY,
  MILITIA_POPULATION_SHARE,
  ARMY_CAMPAIGN_FOOD_MULT,
  ARMY_FOOD_PER_SOLDIER,
  ARMY_GOLD_PER_SOLDIER,
  ARMY_UPKEEP_SCALE,
  ASCENT_KING_UPKEEP_MULT,
  DEMAND_FOOD_PER_POP,
  DEMAND_GOLD_BASE,
  DEMAND_GOLD_GARRISON,
  DEMAND_GOLD_OUTPUT_SHARE,
  DEMAND_GOLD_PER_BUILDING,
  DEMAND_RAMP_TICKS,
  DEMAND_SUPPLIES_BASE,
  DEMAND_SUPPLIES_PER_POP,
  DEMAND_TOAST_COOLDOWN,
  GOLD_SOFTCAP_EXPONENT,
  GOLD_SOFTCAP_FROM,
  HERO_RESERVE_UPKEEP_SHARE,
  MILITIA_REGROW_DELAY,
  ASCENT_MILITIA_REGROW_DELAY,
  POP_CAPACITY_CAPITAL_MULT,
  POP_CROWDING_FOOD,
  POP_GROWTH_MIN_PER_TICK,
  POP_GROWTH_SEASONS_TO_FILL,
  POP_CAPACITY_LOYALTY_FLOOR,
  POP_CAPACITY_PER_BUILDING_LEVEL,
  POP_CAPACITY_PER_LAND,
  POP_DECAY_ABOVE_CAP,
  TREASURY_GRAFT_RATE,
  UNPAID_LOYALTY_FLOOR,
  UNPAID_LOYALTY_PER_TICK,
  UNPAID_RATCHET_TICKS,
  UNPAID_RECOVER_TREASURY,
  UNPAID_WITHHOLD_SHARE,
  UNPAID_WRITEOFF_TICKS,
  WALL_REPAIR_SEASONS,
  demandDifficultyScale,
  FOCUS_PENALTY_AT_BEST,
  FOCUS_PENALTY_AT_WORST,
  CLAIM_OUTPUT_SHARE,
} from '../game/ascentConfig';
import { provinceIsFalling } from './LandSystem';
import {
  computeRealmSupply,
  diffSupplySeverance,
  landSupply,
  neighborTradeWeight,
  supplyFactor,
  supplyLinesActive,
  type SupplyReading,
} from './ascent/SupplySystem';
import { ARMY_PROVISION_USE_PER_150, ARMY_RATION_USE_PER_100 } from '../game/gameplayConfig';
import { palisadeMilitiaBonus } from './ascent/DoctrineSystem';
import { doctrineMilitiaMult } from './ascent/RealmDoctrineSystem';
import { scaledCost, treasuryGraftFrom } from './ascent/priceScale';
import { eraIndex, eraLabel, getBuildingLevelCap } from './empire/MandateSystem';
import { pushToast } from './empire/notifications';
import { getCourtBonuses, getLandGovernorOutputMult } from './CourtSystem';
import { estateStanding, ESTATE_CRISIS, landRealised, realmShare } from './DecreeSystem';
import {
  dikeOffice,
  IDLE_HOST_FOOD,
  isFarming,
  landLimit,
  LAND_LIMIT_COUNT,
  militaryColonies,
  paperMoney,
  PAPER_MONEY_DECAY,
  PAPER_MONEY_STABLE_ABOVE,
  sanghaPatronage,
  seekingTheWorthy,
  SEEKING_UPKEEP_MULT,
  tutelaryOutputMult,
  villageWatch,
  VILLAGE_WATCH_MILITIA,
} from './decree/rules';
import { currentTaxRate, taxGoldMult, taxGrowthDelta, taxStabilityBase } from './TaxSystem';
import type { Army, BuildOrder, EraId, GameState, Land, LandBuildingType, LandSpecialization, ResourceBag, ResourceKey, Season } from '../state/types';
import { buildingLabel, buildBuildingLabel, formatResourceList, resourceLabel, t } from '../i18n';

export type BuildingCategory = 'production' | 'military' | 'public';

export interface BuildingEconomySpec {
  type: LandBuildingType;
  category: BuildingCategory;
  baseCost: Partial<ResourceBag>;
  buildLabor: number;
  buildTicks: number;
  laborPerLevel: number;
  output: Partial<ResourceBag>;
  upkeep: Partial<ResourceBag>;
  defensePerLevel?: number;
}

export interface BuildOption {
  type: LandBuildingType;
  label: string;
  cost: Partial<ResourceBag>;
  labor: number;
  ticks: number;
  category: BuildingCategory;
  upkeep: Partial<ResourceBag>;
  output: Partial<ResourceBag>;
  canBuild: boolean;
  reason?: string;
}

export interface UpgradeOption {
  index: number;
  type: LandBuildingType;
  level: number;
  maxLevel: number;
  cost: Partial<ResourceBag>;
  labor: number;
  ticks: number;
  category: BuildingCategory;
  upkeep: Partial<ResourceBag>;
  output: Partial<ResourceBag>;
  canUpgrade: boolean;
  reason?: string;
}

export interface LaborStatus {
  available: number;
  required: number;
  efficiency: number;
}

export interface PublicBuildingEffects {
  favorPerTick: number;
  stabilityPerTick: number;
  influencePerTick: number;
  growthBonus: number;
  publicLevels: number;
}

export const BUILDING_LABELS: Record<LandBuildingType, string> = {
  farm: 'Build Farm',
  mine: 'Build Mine',
  market: 'Build Market',
  wall: 'Build Wall',
  tower: 'Build Tower',
  barracks: 'Build Barracks',
  communalHall: 'Build Communal Hall',
  harbor: 'Build Harbor',
  workshop: 'Build Workshop',
  guild: 'Build Guild',
  university: 'Build University',
};

const RESOURCE_KEYS: ResourceKey[] = ['food', 'supplies', 'gold', 'humans'];
const BUILDING_ORDER: LandBuildingType[] = ['farm', 'mine', 'market', 'harbor', 'workshop', 'guild', 'university', 'wall', 'tower', 'barracks', 'communalHall'];
const PRODUCTION_BUILDINGS = new Set<LandBuildingType>(['farm', 'mine', 'market', 'harbor', 'workshop', 'guild']);

// Levels 1..5. Output climbs steeply so a developed district is a real investment,
// while upkeep climbs much flatter — this is what lets a well-run province run a
// surplus instead of the old income≈upkeep lockstep that pinned net gold near zero.
const UPGRADE_COST_MULTIPLIERS = [2.1, 3.3, 4.8, 6.6];
const OUTPUT_MULTIPLIERS = [1, 1.7, 2.7, 4.0, 5.6];
const UPKEEP_MULTIPLIERS = [1, 1.3, 1.6, 1.9, 2.2];

export const BUILDING_ECONOMY: Record<LandBuildingType, BuildingEconomySpec> = {
  farm: {
    type: 'farm',
    category: 'production',
    baseCost: { gold: 32 },
    buildLabor: 2,
    buildTicks: 3,
    laborPerLevel: 2,
    output: { food: 9 },
    upkeep: {},
  },
  mine: {
    type: 'mine',
    category: 'production',
    baseCost: { gold: 38, food: 8 },
    buildLabor: 3,
    buildTicks: 4,
    laborPerLevel: 3,
    output: { supplies: 8, gold: 1 },
    upkeep: { food: 1 },
  },
  market: {
    type: 'market',
    category: 'production',
    baseCost: { supplies: 28, food: 8 },
    buildLabor: 3,
    buildTicks: 4,
    laborPerLevel: 3,
    output: { gold: 9, supplies: 2 },
    upkeep: { food: 1 },
  },
  wall: {
    type: 'wall',
    category: 'military',
    baseCost: { gold: 42 },
    buildLabor: 2,
    buildTicks: 3,
    laborPerLevel: 0,
    output: {},
    upkeep: {},
    defensePerLevel: 8,
  },
  tower: {
    type: 'tower',
    category: 'military',
    baseCost: { gold: 58 },
    buildLabor: 3,
    buildTicks: 4,
    laborPerLevel: 0,
    output: {},
    upkeep: { gold: 1 },
    defensePerLevel: 14,
  },
  barracks: {
    type: 'barracks',
    category: 'military',
    baseCost: { gold: 56, supplies: 24 },
    buildLabor: 3,
    buildTicks: 4,
    laborPerLevel: 0,
    output: {},
    upkeep: { gold: 2, food: 1 },
  },
  communalHall: {
    type: 'communalHall',
    category: 'public',
    baseCost: { supplies: 26 },
    buildLabor: 2,
    buildTicks: 4,
    laborPerLevel: 0,
    output: {},
    upkeep: { food: 1 },
  },
  // ── Era-unlocked advanced districts ──
  harbor: {
    type: 'harbor',
    category: 'production',
    baseCost: { gold: 60, supplies: 20 },
    buildLabor: 3,
    buildTicks: 4,
    laborPerLevel: 3,
    output: { gold: 7, supplies: 5 },
    upkeep: { food: 1 },
  },
  workshop: {
    type: 'workshop',
    category: 'production',
    baseCost: { gold: 55, supplies: 26 },
    buildLabor: 4,
    buildTicks: 4,
    laborPerLevel: 4,
    output: { supplies: 8, gold: 3 },
    upkeep: { food: 1, gold: 1 },
  },
  guild: {
    type: 'guild',
    category: 'production',
    baseCost: { gold: 110, supplies: 30 },
    buildLabor: 4,
    buildTicks: 5,
    laborPerLevel: 4,
    output: { gold: 15, supplies: 2 },
    upkeep: { gold: 2, food: 1 },
  },
  university: {
    type: 'university',
    category: 'public',
    baseCost: { gold: 90, supplies: 40 },
    buildLabor: 3,
    buildTicks: 5,
    laborPerLevel: 0,
    output: {},
    upkeep: { gold: 1, food: 1 },
  },
};

/** Minimum era each building type requires. Absent = buildable from the founding era. */
export const BUILDING_ERA_REQUIREMENT: Partial<Record<LandBuildingType, EraId>> = {
  harbor: 'rivalry',
  workshop: 'rivalry',
  guild: 'empires',
  university: 'mandate',
};

/**
 * Per-focus output tilt (food / supplies / gold). A specialization pushes a province hard
 * toward one role at the cost of the others, turning "what should this land be?" into a real
 * decision. `populous` also feeds population growth via its extra food (see growth formula).
 */
export const SPECIALIZATION_MULT: Record<LandSpecialization, { food: number; supplies: number; gold: number }> = {
  balanced: { food: 1, supplies: 1, gold: 1 },
  breadbasket: { food: 1.6, supplies: 0.85, gold: 0.8 },
  mining: { food: 0.85, supplies: 1.6, gold: 0.9 },
  trade: { food: 0.85, supplies: 0.9, gold: 1.6 },
  populous: { food: 1.35, supplies: 0.85, gold: 0.85 },
  fortress: { food: 0.9, supplies: 1.35, gold: 0.8 },
  // Never reachable outside Dragon Ascent — `buildFocusRows` does not offer it, and nothing else
  // writes `specialization`. Present because the record is exhaustive over the union.
  garrison: { food: 0.9, supplies: 1.2, gold: 0.85 },
};

/**
 * What the two martial focuses pay in Dragon Ascent, where they are not economic choices at all.
 *
 * `fortress` in the classic modes is a second mine wearing a shield — `supplies ×1.35`, which is
 * `mining` with a worse name. In Ascent the player asked for a focus that actually *defends*, so
 * here it buys defence and loyalty and pays for them with an output cut across all three
 * resources; and `garrison` buys soldiers rather than goods. Neither can ride on the output table
 * alone, so both also appear in `getFocusDefenseMult` / `getFocusGarrisonMult` below.
 *
 * Kept as a separate table, consulted only when `gameMode === 'ascent'`, for the same reason
 * `settledMult` is mode-guarded: empire, campaign and rival must stay byte-identical.
 */
const ASCENT_FOCUS_MULT: Partial<Record<LandSpecialization, { food: number; supplies: number; gold: number }>> = {
  // Defend: the province works for its own walls, not for the treasury.
  fortress: { food: 0.82, supplies: 0.86, gold: 0.78 },
  // Army: the fields feed soldiers instead of the realm, and the smiths arm them.
  garrison: { food: 0.78, supplies: 1.15, gold: 0.8 },
};

/**
 * The output tilt a focus promises, for a screen that must state it before it is chosen.
 *
 * The same table the economy reads, so a card cannot quote a number the next tick disagrees with.
 */
export function getSpecializationMult(
  state: GameState,
  focus: LandSpecialization,
): { food: number; supplies: number; gold: number } {
  return specializationMult(state, focus);
}

/** The output tilt a focus promises on this land, in this mode. */
function specializationMult(state: GameState, focus: LandSpecialization): { food: number; supplies: number; gold: number } {
  if (state.gameMode === 'ascent') {
    return ASCENT_FOCUS_MULT[focus] ?? SPECIALIZATION_MULT[focus];
  }
  return SPECIALIZATION_MULT[focus];
}

/**
 * How much more a province defends itself for having been told to.
 *
 * Ascent only, and the whole point of the repointed `fortress`. Scaled by aptitude the same way
 * output is, so high ground with one approach is genuinely worth fortifying and an open crossroads
 * is not. Read wherever garrison strength is computed — `landDefencePower`, the siege garrison, and
 * the levy muster — rather than written into `land.defense`, which would compound every tick.
 */
export function getFocusDefenseMult(
  state: GameState,
  land: Land,
  // Defaults to what the province is set to; passed explicitly by the card that offers to change
  // it, which has to quote the answer before the answer exists.
  focus: LandSpecialization = getLandSpecialization(land),
): number {
  if (state.gameMode !== 'ascent' || focus !== 'fortress') {
    return 1;
  }
  return 1 + 0.45 + getLandAptitude(land).fortress * 0.5;
}

/**
 * How much more the province gives to the army for having been told to.
 *
 * Ascent only. Covers both halves of what "army" should mean: soldiers raised here come faster and
 * in greater number, and a host standing here fights harder.
 */
export function getFocusGarrisonMult(state: GameState, land: Land): number {
  if (state.gameMode !== 'ascent' || getLandSpecialization(land) !== 'garrison') {
    return 1;
  }
  return 1 + 0.4 + getLandAptitude(land).garrison * 0.45;
}

/**
 * The militia a province can turn out from its own people — the ceiling it grows toward.
 *
 * **Drawn from the province, never from `state.resources.humans`.** That distinction is the whole
 * point. A field host costs the national pool one person per soldier and then throttles the growth
 * that would replace it (see the `civShare` term in `calculatePlayerResourceRates`), which measured
 * out at one army per hundred seasons: a realm could take ground and never hold it, peaking at 6.8
 * provinces and ending with 3.1. Militia breaks that deadlock without touching the throttle —
 * ground defends itself, and the national pool is left for the armies that march.
 *
 * Keyed on what the province *is* rather than on its walls alone, so developing a district and
 * holding it are both worth something, and a disloyal province turns out fewer men — which gives
 * the loyalty a conquest method stamps on a province a second, military consequence.
 */
/**
 * How many people one province can hold — the district's share of the realm's ceiling.
 *
 * Ascent only, and the counterpart to `militiaCapacity` above: that one bounds the men a province
 * turns out, this one bounds the people it turns them out of. Same shape on purpose — a base for
 * simply being ground, a term for how developed it is, and a loyalty factor, so the three levers a
 * player has over a province all read the same way whichever number they are looking at.
 */
export function landPopulationCapacity(state: GameState, land: Land): number {
  const built = land.buildings.reduce((sum, building) => sum + 1 + building.level * 0.5, 0);
  const seat = state.ascent?.capitalLandId === land.id ? POP_CAPACITY_CAPITAL_MULT : 1;
  const base = POP_CAPACITY_PER_LAND * seat + built * POP_CAPACITY_PER_BUILDING_LEVEL;
  return Math.floor(
    base
    * (POP_CAPACITY_LOYALTY_FLOOR + (land.loyalty / 100) * (1 - POP_CAPACITY_LOYALTY_FLOOR))
    * (getLandSpecialization(land) === 'populous' ? 1.35 : 1),
  );
}

/**
 * Everyone the realm's ground can hold, which is what `state.resources.humans` grows toward.
 *
 * **The ceiling that did not exist.** Growth is `ownedLands + foodNet/7 + humans/700` and that last
 * term compounds off the pool itself, so a realm that never took a second province still climbed
 * without limit — measured from the reported run, one district holding 46,400 people at +229 a
 * season in Year 74, with `applyResourceDelta`'s clamp at zero the only bound anywhere in the file.
 *
 * Summed per province rather than `lands * constant` so that the ways a player can raise it are the
 * ways they already know: take more ground, build on the ground they have, keep it loyal.
 */
export function realmPopulationCapacity(state: GameState): number {
  let total = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
    total += landPopulationCapacity(state, land);
  }
  // Zero, not one. The floor was a divide-by-zero guard and it lied on the one screen anybody
  // reads: a realm with no ground left showed `8.8k/1` on the resource strip and was billed
  // emigration against a ceiling of a single person. Callers guard the division instead.
  return total;
}

/**
 * How full the realm's ground is, 0..1+ — the one figure crowding, the growth taper and the strip
 * all read, so they can never disagree about what "full" means. A realm with no land is full by
 * definition; there is nowhere for anybody to be.
 */
export function realmPopulationFill(state: GameState): number {
  const capacity = realmPopulationCapacity(state);
  if (capacity <= 0) return 1;
  return state.resources.humans / capacity;
}

/**
 * What the realm's institutions are worth to a province's watch (Throne of Empires).
 *
 * The mode's whole progression — Mandate points, eras, the seats and edicts they unlock — bought
 * the player nothing at the only place a realm is actually tested, which is a province with a host
 * outside it. An empire in the Mandate era has registers, granaries, a militia law and a road to
 * march reinforcements down; a realm still in its founding has a village headman and a ditch.
 * This is where that difference is spent.
 *
 * 1 everywhere else, so Dragon Ascent's tuned garrison numbers do not move.
 */
function eraMilitiaMult(state: GameState): number {
  if (state.gameMode !== 'empire') return 1;
  return [1, 1.35, 1.75, 2.15][eraIndex(state.mandate?.era ?? 'founding')] ?? 1;
}

export function militiaCapacity(state: GameState, land: Land): number {
  const built = land.buildings.reduce((sum, building) => sum + 1 + building.level * 0.5, 0);
  const base = land.defense * 2.2 + built * 16 + land.population * 0.12;
  const cap = Math.floor(
    base
    * (0.4 + (land.loyalty / 100) * 0.6)
    * getFocusGarrisonMult(state, land)
    * (1 + palisadeMilitiaBonus(state))
    * doctrineMilitiaMult(state)
    * eraMilitiaMult(state)
    // Lệ giáp binh ratified: every commune keeps its own watch. Paid for with a claim slot —
    // men guarding their own village are not men marching to claim another.
    * (villageWatch(state) ? VILLAGE_WATCH_MILITIA : 1),
  );
  // The watch is the people, so it cannot outnumber them (Dragon Ascent). Every multiplier above
  // stacks on a figure that only *reads* the population — measured, 4,603 militia on 870 people.
  // See `MILITIA_POPULATION_SHARE`.
  if (state.gameMode === 'ascent') {
    return Math.min(cap, Math.floor(land.population * MILITIA_POPULATION_SHARE));
  }
  return cap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supply lines (Throne of Empires)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seasons of baggage the realm keeps packed for a host standing on its own ground.
 *
 * Ten is deliberately a campaign's worth and not more: a supplied host can march out and fight
 * abroad for two and a half years on what it carries, and after that it is living off whatever
 * it can take — which is the difference the whole rule is drawing.
 */
export const HOME_SUPPLY_SEASONS = 10;

/**
 * Whether the realm is feeding this host, rather than the host feeding itself out of the baggage
 * it left the capital with.
 *
 * **Throne of Empires had no resupply of any kind.** `resupplyHost` exists, but it is wired into
 * `ConquestScene` and nothing else, so a host's `rations` were set once by `queueRecruitment` and
 * from that moment only ever fell. Measured on a played 64-turn run: the realm's one army left the
 * capital with twenty-one seasons of food, was at 45% of its opening battle power by the time the
 * first real wave landed, and was **dead of starvation by turn 29** — year four, with no fight and
 * no way for the player to prevent it. `progressArmyLogistics` skips invaders outright, so the
 * hosts marching at that realm ate nothing at all. That asymmetry is most of the reported
 * complaint, and it is not a number that needed tuning: it was a missing rule.
 *
 * The rule is the ordinary one. On your own ground you are supplied from your own granaries and
 * the realm pays the bill on the resource strip (see `armyRealmFoodPressure`). Off it — besieging
 * a province, or standing on ground nobody owns — you eat what you carried. Which is exactly what
 * makes taking ground matter, and what keeps a march abroad a decision with a clock on it.
 */
export function isHomeSupplied(state: GameState, army: Army): boolean {
  if (state.gameMode !== 'empire') return false;
  if (army.kingdomId !== PLAYER_KINGDOM_ID || army.isLevy || army.patron) return false;
  // A host in the siege lines is outside the walls it is reducing, not billeted behind its own.
  if (state.siegeOrders.some((order) => order.armyId === army.id)) return false;
  return state.lands.some((land) => land.id === army.landId && land.ownerId === PLAYER_KINGDOM_ID);
}

/** The baggage a supplied host is kept topped up to, in rations and in provisions. */
export function homeSupplyTarget(army: Army): { rations: number; provisions: number } {
  const total = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
  return {
    rations: Math.max(1, Math.ceil(total / 100) * ARMY_RATION_USE_PER_100) * HOME_SUPPLY_SEASONS,
    provisions: Math.max(1, Math.ceil(total / 150) * ARMY_PROVISION_USE_PER_150) * HOME_SUPPLY_SEASONS,
  };
}

/** Seasons a province takes to raise its militia from nothing to full. */
const MILITIA_SEASONS_TO_FULL = 22;

/**
 * Grows every owned province's militia toward what it can support, and lets an over-strength
 * one settle back down.
 *
 * Called once per Ascent tick, and once per economy tick in Throne of Empires. Growth is
 * deliberately slow enough that a freshly-taken province is not a fortress next season — the
 * militia arriving *is* the province becoming yours — and fast enough that a garrison spent
 * holding a wave is back before the wave after next.
 *
 * **Throne of Empires needed this more than Ascent did, and never had it.** `createCampaignLands`
 * forces the player's seat to `defense >= 52` and forces nothing else, so every province a realm
 * claims keeps the defence the map generated for it: measured over seed 1337, median 17, range
 * 4-29, with `localSoldiers = floor(defense * 0.7) + rand(6)` — about fifteen men. Nothing in that
 * mode ever moved either number again. Against a turn-32 wave (450 battle power, measured) that is
 * a defence of ~355 and a **100% chance the province falls**, against 0% at the seat, at every turn
 * and every realm size tested. The reported shape of it: four years of expansion, then every
 * province taken back one a season while the capital stands untouched.
 *
 * Letting the militia grow is what makes ground held for years different from ground taken last
 * season — a claim starts at ~15 men and a province kept, walled and loyal reaches ~100, which is
 * the difference between 355 and 740 battle power, i.e. between certainly falling and holding.
 */
export function growProvincialMilitia(state: GameState): void {
  if (!isEndlessMode(state.gameMode)) return;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
    // A district the war has just walked over is not raising a fresh watch the same afternoon.
    // Without this the militia stepped back up on the very next tick after a levy went home, which
    // is half of why a repelled wave cost the province nothing at all.
    // The watch IS people (Dragon Ascent): when they die, starve or leave, the men under arms go
    // with them at once — not at 4% a tick. Measured with only the soft decay, one province in
    // five ticks still carried a watch larger than half its people. Before the regrow delay, so a
    // district that has just buried its militia is bounded on the very tick it did.
    if (state.gameMode === 'ascent') {
      land.localSoldiers = Math.min(land.localSoldiers, Math.floor(land.population * MILITIA_POPULATION_SHARE));
    }
    const regrowDelay = state.gameMode === 'ascent' ? ASCENT_MILITIA_REGROW_DELAY : MILITIA_REGROW_DELAY;
    if (state.turn - (land.levyReturnedTurn ?? -regrowDelay) < regrowDelay) continue;
    // On seasons, like the walls and the turnout (Dragon Ascent). Stepping every tick refilled a
    // watch that had just buried a third of itself inside five ticks, so the second host of a wave
    // met a province at 1.05x the power the first had left it — measured across 58 such pairs with
    // nothing paid to restore anything. `MILITIA_SEASONS_TO_FULL` is now seasons, as it says.
    if (state.gameMode === 'ascent' && state.turn % 2 !== 0 && land.localSoldiers < militiaCapacity(state, land)) continue;
    const cap = militiaCapacity(state, land);
    if (land.localSoldiers >= cap) {
      // Over capacity: a province lost and retaken, loyalty fallen, a decree that lifted the watch,
      // or people dead in its defence. Shed as a share of the excess rather than a flat two men:
      // at two a tick a watch of 6,400 on 6,000 people took three hundred ticks to come down,
      // which is to say never.
      const excess = land.localSoldiers - cap;
      land.localSoldiers = Math.max(cap, land.localSoldiers - Math.max(2, Math.ceil(excess * MILITIA_OVER_CAP_DECAY)));
      continue;
    }
    const step = Math.max(2, Math.ceil(cap / MILITIA_SEASONS_TO_FULL));
    land.localSoldiers = Math.min(cap, land.localSoldiers + step);
  }
}

/**
 * People arrive in a district until it is as full as its ground and its buildings allow.
 *
 * **`land.population` could only ever go down.** It was set once at world generation and
 * touched afterwards only by famine, a sacking or a story; `getLandPopulationGrowth` returns a flat 1 and
 * is read by the build sheet and by nothing else. So the per-district ceiling added last round was
 * decorative — a limit on a number that never moved — and the only quantity that could actually be
 * limited was the national pool. Reported as: *why not limited people of a land?*
 *
 * Growing it is what makes the whole thing real, and it pays for itself three ways with no extra
 * mechanism: `militiaCapacity` reads `population * 0.12`, so a developed district raises a
 * bigger watch; `ascentProvincialDemand` charges food at `DEMAND_FOOD_PER_POP`, so a district that fills
 * up **eats more**, which is the stress the ceiling is supposed to express; and the build sheet's
 * line finally moves.
 *
 * Gated on the realm's grain, because that is the honest rule — people do not arrive somewhere that
 * cannot feed them, and a realm in deficit should not be quietly compounding its own food bill.
 * Tapered as the district fills, so the last quarter takes as long as the first half.
 */
export function growProvincialPopulation(state: GameState): void {
  if (state.gameMode !== 'ascent') return;
  // A realm that cannot feed the people it has does not gain more. `resourceRates` is last tick's
  // net, which is exactly the figure the player is looking at when they wonder why growth stopped.
  if (state.resourceRates.food < 0) return;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
    const cap = landPopulationCapacity(state, land);
    if (land.population >= cap) {
      // Over capacity: a district that has been razed, lost loyalty or had buildings destroyed.
      // People leave at the same gentle rate the realm pool sheds them.
      land.population = Math.max(cap, land.population - POP_GROWTH_MIN_PER_TICK);
      continue;
    }
    const room = cap - land.population;
    const step = Math.max(POP_GROWTH_MIN_PER_TICK, Math.ceil(cap / POP_GROWTH_SEASONS_TO_FILL));
    // Tapered on the room left rather than flat, so a district slows as it fills instead of
    // slamming into its ceiling — the same shape as the realm pool's own taper.
    land.population = Math.min(cap, land.population + Math.max(1, Math.round(step * (room / cap))));
  }
}

/**
 * Rebuilds what a fought defence knocked down, a little each season.
 *
 * The other half of `dissolveGarrisonLevies`, which is where the walls are charged. Kept as a
 * separate counter (`land.wallsBreached`) rather than as a remembered undamaged figure, so that
 * every other writer of `land.defense` — a fortify purchase, a hero's arrival, a decree, a story —
 * still composes: masonry bought while a breach stands raises the wall and leaves the breach to be
 * repaired on its own clock.
 *
 * Called once per Ascent tick, beside the militia.
 */
/**
 * The men behind the walls come back, a season at a time. See `garrisonExhaustion`.
 *
 * Linear over `GARRISON_RECOVER_SEASONS` from wherever the last fight left it, so a province that
 * held is thin for the next contact and whole by the one after. Only ours: a spent province that
 * changed hands is the new owner's problem, and its exhaustion is cleared with the flag.
 */
export function recoverGarrison(state: GameState): void {
  if (state.gameMode !== 'ascent') return;
  for (const land of state.lands) {
    const spent = land.garrisonExhaustion ?? 0;
    if (spent <= 0) continue;
    if (land.ownerId !== PLAYER_KINGDOM_ID) { land.garrisonExhaustion = undefined; continue; }
    // A season is two ticks, and the dial is in seasons — it was stepping every tick, so "eight
    // seasons" healed in eight ticks, inside the twelve of a wave, and the next contact met a
    // whole province. A paid `steady` restore runs at four times the pace.
    const hasted = (land.restoreHasteUntil ?? -1) > state.turn;
    if (!hasted && state.turn % 2 !== 0) continue;
    // A share of what is still spent, floored so it ends — see `GARRISON_RECOVER_SHARE`. A full
    // charge clears in about `GARRISON_RECOVER_SEASONS` plus the floor's tail; a light one no
    // longer vanishes inside a season.
    const step = Math.max(spent * GARRISON_RECOVER_SHARE, GARRISON_RECOVER_MIN_STEP) * (hasted ? 2 : 1);
    const left = spent - step;
    land.garrisonExhaustion = left > 0.005 ? left : undefined;
  }
}

export function repairProvincialDefence(state: GameState): void {
  if (state.gameMode !== 'ascent') return;
  for (const land of state.lands) {
    const breach = land.wallsBreached ?? 0;
    if (breach <= 0) continue;
    // A province in enemy hands rebuilds nothing for us. Left standing rather than cleared, so
    // retaking it does not hand back walls the fight knocked down.
    if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
    // On seasons, not ticks — see `recoverGarrison`. A `steady` restore quadruples the pace.
    const hasted = (land.restoreHasteUntil ?? -1) > state.turn;
    if (!hasted && state.turn % 2 !== 0) continue;
    const step = Math.min(breach, Math.max(1, Math.ceil((breach * (hasted ? 2 : 1)) / WALL_REPAIR_SEASONS)));
    land.defense += step;
    land.wallsBreached = breach - step;
    if (land.wallsBreached <= 0) land.wallsBreached = undefined;
  }
}

/**
 * What one province contributes to the realm's population growth each tick.
 *
 * The realm's figure is a single sum in `calculatePlayerResourceRates` — one settler per owned
 * province, two more for each set to `populous`, plus realm-wide terms for surplus food, stability
 * and public buildings that belong to no province in particular. This pulls out the part a
 * *province* is responsible for, so the land screen can answer "what is this place giving me?"
 * without inventing a number or claiming credit for the realm's.
 */
export function getLandPopulationGrowth(state: GameState, land: Land): number {
  if (land.ownerId !== PLAYER_KINGDOM_ID) {
    return 0;
  }
  return 1 + (getLandSpecialization(land) === 'populous' ? 2 : 0);
}

/** Extra loyalty a province regains each tick for being held as a fortress. Ascent only. */
export function getFocusLoyaltyBonus(state: GameState, land: Land): number {
  if (state.gameMode !== 'ascent' || getLandSpecialization(land) !== 'fortress') {
    return 0;
  }
  return 0.35 + getLandAptitude(land).fortress * 0.4;
}

export function getLandSpecialization(land: Land): LandSpecialization {
  return land.specialization ?? 'balanced';
}

/**
 * How well a province's ground suits each focus, from 0 (fights the land) to 1 (made for it).
 *
 * Before this, terrain was very nearly inert: `calculateLandOutputs` asked three *binary* questions
 * — is there any water, any rice, more mountain than hill — each worth a flat +2, and ignored how
 * much of anything a province actually had. So every land answered to every focus identically and
 * "what should this province be?" had no right answer to find. Aptitude is what makes the map
 * argue back: a delta wants to be a breadbasket, a limestone shelf wants to be a mine, and a
 * crossroads wants to trade.
 *
 * Read off `land.terrainSummary` (counted once at world-gen, so this is O(1)) and
 * `land.neighbors.length`, which is the province's road connectivity.
 */
export function getLandAptitude(land: Land): Record<LandSpecialization, number> {
  const ts = land.terrainSummary;
  const workable = Math.max(1, ts.plains + ts.fields + ts.riceFields + ts.forest + ts.mountains + ts.hills);
  const share = (n: number): number => Math.min(1, n / workable);
  // Connectivity saturates at six, the most neighbours a hex-built province can realistically hold.
  const roads = Math.min(1, land.neighbors.length / 6);
  const wet = Math.min(1, ts.water / 3);

  // What the province is *for* counts as much as what it is made of.
  //
  // Terrain alone gave nonsense advice: a temple standing on open plains scored a perfect 1.0 for
  // `populous`, but a temple earns gold, so the recommended focus multiplied a resource the land
  // does not produce while paying the penalty on the one it does. A land's type is the single best
  // predictor of which resource its buildings will actually pour into, so it belongs in the answer.
  const KIND_BIAS: Record<LandSpecialization, number> = {
    balanced: 0,
    breadbasket: land.type === 'farm' ? 0.3 : 0,
    mining: land.type === 'iron' ? 0.35 : 0,
    trade: land.type === 'market' || land.type === 'temple' || land.type === 'castle' ? 0.32 : 0,
    populous: land.type === 'farm' || land.type === 'castle' ? 0.18 : 0,
    fortress: land.type === 'castle' ? 0.2 : 0,
    // Soldiers come from people and from somewhere to drill them.
    garrison: land.type === 'castle' ? 0.28 : land.type === 'farm' ? 0.12 : 0,
  };

  return {
    // A neutral focus is neutral everywhere: `balanced` must never be the terrain-optimal answer,
    // or the whole choice collapses back into leaving it alone.
    balanced: 0.5,
    // Wet ground and land already under crop. Irrigation is what makes a delta.
    breadbasket: clamp01(share(ts.riceFields + ts.fields) * 1.5 + wet * 0.35 + share(ts.plains) * 0.25 + KIND_BIAS.breadbasket),
    // Rock. Hills count for less than mountains: the ore is in the massif.
    mining: clamp01(share(ts.mountains) * 1.3 + share(ts.hills) * 0.6 + KIND_BIAS.mining),
    // Roads first, then water — a river or a coast is a road that costs nothing to keep.
    trade: clamp01(roads * 0.85 + wet * 0.45 + KIND_BIAS.trade),
    // Room to settle: open ground and woodland to clear, and not a province of cliffs.
    populous: clamp01(share(ts.plains) * 1.2 + share(ts.forest) * 0.5 - share(ts.mountains) * 0.4 + KIND_BIAS.populous),
    // High ground, and few ways in. A province with one approach is worth holding.
    fortress: clamp01(share(ts.mountains + ts.hills) * 0.9 + (1 - roads) * 0.5 + KIND_BIAS.fortress),
    // Men to raise and open ground to muster them on — the opposite reading of the same map that
    // `fortress` wants. A mustering field is not a mountain redoubt.
    garrison: clamp01(share(ts.plains + ts.fields) * 0.9 + share(ts.forest) * 0.3 + roads * 0.3 + KIND_BIAS.garrison),
  };
}

/** The resource each focus is chosen *for*. `balanced` favours none. */
const FOCUS_RESOURCE: Record<LandSpecialization, keyof ResourceBag | undefined> = {
  balanced: undefined,
  breadbasket: 'food',
  mining: 'supplies',
  trade: 'gold',
  populous: 'food',
  fortress: 'supplies',
  garrison: 'supplies',
};

/**
 * Focuses that draw no terrain dividend in Ascent, because what they pay is not a resource.
 *
 * A defended province that also out-mined a mine would be strictly better than one, which is the
 * exact flaw the repoint exists to correct.
 */
const ASCENT_NO_DIVIDEND: ReadonlySet<LandSpecialization> = new Set<LandSpecialization>(['fortress']);

/**
 * The yield a province draws from its own ground, once a focus is set to exploit it.
 *
 * Separate from the multiplicative tilt, and the reason a focus is worth setting at all. The tilt
 * alone could only ever scale what the buildings already made, so on a young province — which is
 * every province at the moment the player is asked to choose — every focus was a pure loss: the
 * bonus multiplied a resource with nothing in it while the penalty came off one that was earning.
 *
 * This pays out on the land itself, in proportion to how well it suits the focus, so working a
 * delta as a breadbasket is worth something the season you decide it.
 */
function focusTerrainDividend(state: GameState, land: Land): Partial<ResourceBag> {
  const focus = getLandSpecialization(land);
  const key = FOCUS_RESOURCE[focus];
  if (!key || (state.gameMode === 'ascent' && ASCENT_NO_DIVIDEND.has(focus))) {
    return {};
  }
  return { [key]: getLandAptitude(land)[focus] * 7 };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * What a focus multiplies its province's output by, once the ground is taken into account.
 *
 * `SPECIALIZATION_MULT` is the *promise* a focus makes; this is what it delivers on this land.
 * A perfectly-suited province gets a little more than the promise, an unsuited one clearly less,
 * and the tilt away from the other two resources is paid in full either way — so a mine on a
 * flood plain is a genuine mistake rather than a slightly weaker version of the same thing.
 */
export function getFocusOutputMult(state: GameState, land: Land): { food: number; supplies: number; gold: number } {
  const focus = getLandSpecialization(land);
  const base = specializationMult(state, focus);
  if (focus === 'balanced') {
    return base;
  }
  // 0 aptitude -> 0.7 of the promised gain, 1 aptitude -> 1.15 of it.
  const aptitude = getLandAptitude(land)[focus];
  const scale = 0.7 + aptitude * 0.45;
  // The penalties on the other two resources are paid in full in the classic modes. In Dragon
  // Ascent they shrink with aptitude — see `FOCUS_PENALTY_AT_WORST` / `_AT_BEST`: ground made for
  // the focus keeps most of what it gives up, ground that fights it pays a tenth more.
  const penalty = state.gameMode === 'ascent'
    ? FOCUS_PENALTY_AT_WORST + (FOCUS_PENALTY_AT_BEST - FOCUS_PENALTY_AT_WORST) * aptitude
    : 1;
  const apply = (value: number): number => (value > 1 ? 1 + (value - 1) * scale : 1 - (1 - value) * penalty);
  return { food: apply(base.food), supplies: apply(base.supplies), gold: apply(base.gold) };
}

/** Live tax-dial effects: gold multiplier, per-tick stability drift (incl. tax fatigue), and growth delta. */
export function getTaxEffects(state: GameState): { goldMult: number; stabilityDelta: number; growthDelta: number } {
  // One continuous dial (see TaxSystem). The classic three stances sit on the exact points of
  // these curves that reproduce their old numbers, so saves and empire mode are unchanged.
  const rate = currentTaxRate(state);
  // Effective stability drift includes the compounding resentment from sustained heavy taxes.
  const fatiguePenalty = (state.taxFatigue ?? 0) * 0.16;
  return {
    goldMult: taxGoldMult(rate),
    stabilityDelta: Number((taxStabilityBase(rate) - fatiguePenalty).toFixed(1)),
    growthDelta: taxGrowthDelta(rate),
  };
}

/** Assign a province's economic focus. Player-owned lands only; refreshes outputs. */
export function setLandSpecialization(state: GameState, landId: string, focus: LandSpecialization): boolean {
  const land = state.lands.find((candidate) => candidate.id === landId);
  // Nor is a province re-tasked while an enemy is taking it: the district is not answering the
  // throne this season. See `hostileClaimAt`.
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID || provinceIsFalling(state, landId)) {
    return false;
  }
  land.specialization = focus;
  // Stamped so the province card leaves a freshly-set focus alone long enough to see it work
  // (Dragon Ascent; see `ProvinceOrderSystem`). Nothing in the classic modes reads it.
  if (state.gameMode === 'ascent') land.focusSetTurn = state.turn;
  refreshAllLandOutputs(state);
  return true;
}

function buildOrderKindLabel(kind: BuildOrder['kind']): string {
  return t(kind === 'upgrade' ? 'order.upgrading' : 'order.building').toLowerCase();
}

function outputMultiplier(level: number): number {
  return OUTPUT_MULTIPLIERS[Math.max(0, Math.min(level - 1, OUTPUT_MULTIPLIERS.length - 1))] ?? 1;
}

function upkeepMultiplier(level: number): number {
  return UPKEEP_MULTIPLIERS[Math.max(0, Math.min(level - 1, UPKEEP_MULTIPLIERS.length - 1))] ?? 1;
}

function upgradeCostMultiplier(level: number): number {
  return UPGRADE_COST_MULTIPLIERS[Math.max(0, Math.min(level - 1, UPGRADE_COST_MULTIPLIERS.length - 1))] ?? 1;
}

export function emptyResourceBag(): ResourceBag {
  return {
    food: 0,
    supplies: 0,
    gold: 0,
    humans: 0,
  };
}

export function canSpend(state: GameState, cost: Partial<ResourceBag>): boolean {
  return Object.entries(cost).every(([key, value]) => {
    const resourceKey = key as ResourceKey;
    return state.resources[resourceKey] >= Math.abs(value ?? 0);
  });
}

export function applyResourceDelta(state: GameState, delta: Partial<ResourceBag> | Record<string, number>): void {
  for (const [key, value] of Object.entries(delta)) {
    if (!RESOURCE_KEYS.includes(key as ResourceKey)) {
      continue;
    }

    const resourceKey = key as ResourceKey;
    state.resources[resourceKey] = Math.max(0, state.resources[resourceKey] + (value ?? 0));
  }
}

export function getBuildingCategory(type: LandBuildingType): BuildingCategory {
  return BUILDING_ECONOMY[type].category;
}

/** Whether the realm's current era has unlocked a building type (empire-mode gating). */
export function isBuildingUnlocked(state: GameState, type: LandBuildingType): boolean {
  const required = BUILDING_ERA_REQUIREMENT[type];
  if (!required) return true;
  const currentEra: EraId = state.mandate?.era ?? 'founding';
  return eraIndex(currentEra) >= eraIndex(required);
}

export function getPublicBuildingEffects(state: GameState): PublicBuildingEffects {
  const publicLevels = state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .reduce((sum, land) => (
      sum + land.buildings
        .filter((building) => getBuildingCategory(building.type) === 'public')
        .reduce((buildingSum, building) => buildingSum + building.level, 0)
    ), 0);

  return {
    publicLevels,
    favorPerTick: publicLevels * 0.4,
    stabilityPerTick: publicLevels * 0.08,
    influencePerTick: publicLevels * 0.04,
    growthBonus: publicLevels,
  };
}

export function refreshAllLandOutputs(state: GameState): void {
  const labor = getLaborStatus(state);
  const courtBonuses = getCourtBonuses(state);

  // ── Đường tiếp vận: the shape of the realm, read once ──
  //
  // The only site the supply walk runs. Everything downstream — `calculateLandOutputs`, the map
  // wash, the inspect card — reads the cache this writes, so the walk happens once per refresh
  // rather than once per province, and the numbers on the card can never disagree with the numbers
  // that were paid. Empty (and therefore inert) in every mode but Dragon Ascent.
  if (state.ascent) {
    const supply = computeRealmSupply(state);
    announceSupplyChanges(state, supply);
    state.ascent.supply = Object.fromEntries(supply);
  }

  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      land.outputs = calculateLandOutputs(state, land, 1);
      continue;
    }

    // ── Chiếu Chỉ: whether this province is carrying out the throne's law ──
    //
    // This is the seam where the realm's contribution is actually separable. Everything the realm
    // adds on top of ground and buildings arrives here as a multiplier — a seated governor and the
    // court/decree output bonuses — and `realmShare` bends each of them back toward 1 by how far
    // this province is obeying. A defiant one returns `landRealised` 0 and therefore keeps only
    // what its terrain and districts make.
    //
    // Applied here rather than inside `calculateLandOutputs` because that function returns *before*
    // the court multipliers are applied, so scaling in there would have divided out bonuses that
    // had not been added yet — measured, it changed a province's output by exactly nothing.
    //
    // `state.mandate` guards it: rival and campaign fall straight through with realised 1.
    const realised = state.mandate ? landRealised(land) : 1;
    // Sắc phong thành hoàng: the ground a deified champion watches over simply produces more, for
    // as long as the realm holds it. The one-off compliance bump `applySpecialEffect` grants would
    // be erased by ordinary drift within twenty seasons, and "it never forgets them" has to mean
    // something permanent or the investiture is a toast with a number attached.
    const governorMult = realmShare(getLandGovernorOutputMult(state, land.id), realised)
      * tutelaryOutputMult(state, land);
    const outputs = calculateLandOutputs(state, land, labor.efficiency * governorMult * settledMult(state, land));
    outputs.gold = Math.round(outputs.gold * realmShare(courtBonuses.goldOutputMult, realised));
    outputs.food = Math.round(outputs.food * realmShare(courtBonuses.foodOutputMult, realised));
    outputs.supplies = Math.round(outputs.supplies * realmShare(courtBonuses.suppliesOutputMult, realised));
    /**
     * The haulage bill — what survives the journey to the capital.
     *
     * Applied here rather than through the `efficiency` argument, and that is not a stylistic
     * choice: `efficiency` reaches only the per-building loop inside `calculateLandOutputs`, so a
     * castle's or a market's flat land-type income would have escaped it entirely — and those are
     * exactly the gold lines that a road is supposed to carry. Scaling the finished bag catches
     * every source.
     *
     * `supplyFactor` returns the literal 1 outside Dragon Ascent and for any province within two
     * hops of the seat, so the common case multiplies by a number that changes nothing.
     */
    const haulage = supplyFactor(state, land);
    if (haulage !== 1) {
      outputs.gold = Math.round(outputs.gold * haulage);
      outputs.food = Math.round(outputs.food * haulage);
      outputs.supplies = Math.round(outputs.supplies * haulage);
    }
    /**
     * A province being taken delivers a quarter of what it makes.
     *
     * The walls are carried and an enemy host is camped in the district, but the flag does not
     * turn for another 2-6 seasons — and for that whole stretch this loop paid the province out
     * in full, because every test here asks only whose it is. Scaled last, after the court and
     * governor multipliers, so it stays one legible factor rather than something smeared through
     * the stack. See `CLAIM_OUTPUT_SHARE`.
     */
    if (provinceIsFalling(state, land.id)) {
      outputs.gold = Math.round(outputs.gold * CLAIM_OUTPUT_SHARE);
      outputs.food = Math.round(outputs.food * CLAIM_OUTPUT_SHARE);
      outputs.supplies = Math.round(outputs.supplies * CLAIM_OUTPUT_SHARE);
    }
    land.outputs = outputs;
  }

  applyLandLimit(state);
  state.resourceRates = calculatePlayerResourceRates(state);
}

/**
 * Hạn điền, 1397 — the land limit.
 *
 * Hồ Quý Ly capped noble holdings at ten mẫu and confiscated the surplus for redistribution. Here
 * the three richest provinces give up a third of what they make and the three poorest receive it,
 * which flattens the snowball and can rescue a run whose good ground was taken early.
 *
 * Applied after every province has been costed, because it is a transfer between them and cannot
 * be expressed while each is still being computed on its own. Total output is deliberately
 * *conserved* rather than reduced — the law redistributes, it does not destroy, and its real
 * price is the twelve points of Thương standing it costs on enactment.
 */
function applyLandLimit(state: GameState): void {
  if (!landLimit(state)) return;
  // Ground being taken is out of the redistribution entirely. Cut to a quarter it ranks among the
  // poorest, so the law would have paid it a share out of the provinces still standing — the realm
  // subsidising a district the enemy is walking into.
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID
    && !provinceIsFalling(state, land.id));
  if (owned.length < LAND_LIMIT_COUNT * 2) return;

  const worth = (land: Land) => land.outputs.food + land.outputs.supplies + land.outputs.gold;
  const ranked = [...owned].sort((a, b) => worth(b) - worth(a));
  const richest = ranked.slice(0, LAND_LIMIT_COUNT);
  const poorest = ranked.slice(-LAND_LIMIT_COUNT);

  const pot: ResourceBag = emptyResourceBag();
  for (const land of richest) {
    for (const key of RESOURCE_KEYS) {
      const taken = Math.floor(land.outputs[key] / 3);
      land.outputs[key] -= taken;
      pot[key] += taken;
    }
  }
  for (const key of RESOURCE_KEYS) {
    const share = Math.floor(pot[key] / poorest.length);
    if (share <= 0) continue;
    for (const land of poorest) land.outputs[key] += share;
  }
}

/**
 * Trade-network multiplier on gold: a larger connected realm makes every market and
 * city worth more, so expansion *compounds* the economy instead of adding flat income.
 * This is the main answer to "none of my work affects the economy" — taking land now
 * lifts output across the whole network, not just on the new tile.
 */
function getTradeNetworkMult(state: GameState, land: Land): number {
  // A trade network is a thing goods actually move through, so in Dragon Ascent it is the size of
  // the connected block this province sits in, not the realm's total holdings. A realm split eight
  // and four is two networks — and the four stranded provinces get a four-province network, which
  // is the whole reason a contiguous empire is worth more than a scattered one of the same size.
  // Outside Ascent it stays the plain realm count, byte for byte.
  const reach = supplyLinesActive(state) && land.ownerId === PLAYER_KINGDOM_ID
    ? landSupply(state, land.id).block
    : state.lands.filter((other) => other.ownerId === PLAYER_KINGDOM_ID).length;
  return 1 + Math.min(1.6, Math.max(0, reach - 1) * 0.09);
}

/**
 * Says so, on the tick a corridor is cut or reopened.
 *
 * The rule is invisible without this. A province going quiet looks exactly like a province being
 * raided, and the player's first encounter with supply lines should not be a number on a card they
 * had no reason to open. Diffed against the cache still on state, before it is overwritten.
 */
function announceSupplyChanges(state: GameState, next: Map<string, SupplyReading>): void {
  const { cut, restored } = diffSupplySeverance(state.ascent?.supply, next);
  const name = (id: string) => state.lands.find((land) => land.id === id)?.name ?? id;
  for (const id of cut) {
    pushToast(state, t('ascent.supply.cutToast', { land: name(id) }), 'threat');
  }
  for (const id of restored) {
    pushToast(state, t('ascent.supply.restoredToast', { land: name(id) }), 'info');
  }
}

/**
 * How much of its output a province actually delivers while it is still settling in.
 *
 * Dragon Ascent only. `AcquisitionSystem` already stamps a different starting loyalty per
 * method — intimidation 50, occupation 55, settlement 65, a bribe 68, an envoy 85 — and in this
 * mode that number did *nothing at all*: `tickCrises` is never called here and loyalty has never
 * touched output anywhere. So the one axis that distinguished the six ways of taking a province
 * was inert, every method collapsed to "cheapest and fastest", and the method sheet was two taps
 * for a foregone answer.
 *
 * Giving it teeth makes the choice real in both directions: a bribe hands you the ground now and
 * a sullen province for a while, an envoy takes seasons and arrives productive. Loyalty drifts up
 * over time (see `settleOwnedLands`), so it is a delay rather than a permanent tax — and a seated
 * governor, who already raises loyalty every tick, speeds the recovery.
 *
 * Guarded on the mode so the classic modes' economies are untouched, byte for byte.
 */
function settledMult(state: GameState, land: Land): number {
  if (state.gameMode !== 'ascent') return 1;
  // Đồn điền — Lê Thánh Tông's military colonies. Soldiers were settled on the ground they had just
  // taken, which made a frontier province defensible immediately and productive slowly. Here that
  // is exactly the trade: the settling-in penalty is replaced by a flat half yield that never
  // improves, in exchange for the garrison and defence bonus applied in `ConquestSystem`. Better
  // than the floor for ground you have only just taken, worse than the ceiling for ground you have
  // held for years — which is what makes it a decision rather than a free upgrade.
  if (militaryColonies(state)) return 0.5;
  const loyalty = Math.max(0, Math.min(100, land.loyalty));
  return UNSETTLED_OUTPUT_FLOOR + (1 - UNSETTLED_OUTPUT_FLOOR) * (loyalty / 100);
}

/**
 * Share of its output a wholly disloyal province still delivers.
 *
 * 0.75 rather than 0.6: at the harsher floor the drag on a realm that is *expanding* — which is
 * every realm, most of the time — slowed the whole economy enough to cost drafts and levels, and
 * a mechanic meant to differentiate six acquisition methods should not quietly retune the run's
 * tempo. The gap between an envoy's province and an intimidated one is still a tenth of its
 * output for a few dozen seasons, which is plenty to choose on.
 */
const UNSETTLED_OUTPUT_FLOOR = 0.75;

export function calculateLandOutputs(state: GameState, land: Land, efficiency = 1): ResourceBag {
  const outputs = emptyResourceBag();
  // What the neighbours are worth to this province's trade. Our own ground scores 1 apiece, as the
  // plain count did; a neutral district with a village, empty ground and a rival's border score a
  // descending share of that instead of the flat zero all three used to get. Outside Dragon Ascent
  // this returns the identical owned-neighbour count, so the term is unchanged there.
  const ownedNeighbors = neighborTradeWeight(state, land);
  const roads = Math.floor(land.neighbors.length / 3) + ownedNeighbors * 2;
  // The trade network is the biggest thing the realm gives a province — up to +160% — and it is
  // given by *being part of this realm*, so a province that has stopped answering the throne stops
  // receiving it. See `realmShare`; realised is 1 outside empire/ascent, leaving this untouched.
  const tradeMult = land.ownerId === PLAYER_KINGDOM_ID
    ? realmShare(getTradeNetworkMult(state, land), state.mandate ? landRealised(land) : 1)
    : 1;
  // Terrain bonuses scale with how much of it there is, rather than asking whether there is any.
  //
  // These were `water > 0 ? 2 : 0`, `riceFields > 0 ? 2 : 0` and `mountains > hills ? 2 : 0` —
  // three yes/no questions that made a province with one water hex worth exactly as much as a
  // river delta. Counting is what lets a good site actually be a good site, and it is the same
  // reading `getLandAptitude` uses, so the number the focus selector shows matches what is paid.
  const ts = land.terrainSummary;
  const waterBonus = Math.min(4, ts.water * 1.2);
  const riceBonus = Math.min(4, (ts.riceFields + ts.fields * 0.5) * 0.6);
  const mountainBonus = Math.min(4, ts.mountains * 0.7 + ts.hills * 0.3);

  if (land.type === 'castle' || land.type === 'enemyCastle') {
    outputs.gold += (8 + roads) * tradeMult;
    outputs.supplies += 3 + Math.floor(roads);
  }

  if (land.type === 'market' || land.type === 'temple') {
    outputs.gold += (3 + roads) * tradeMult;
    outputs.supplies += Math.max(1, Math.floor(roads / 2));
  }

  for (const building of land.buildings) {
    const spec = BUILDING_ECONOMY[building.type];
    if (spec.category !== 'production') {
      continue;
    }

    const multiplier = outputMultiplier(building.level) * efficiency;
    if (building.type === 'farm') {
      outputs.food += (spec.output.food ?? 0) * multiplier + (waterBonus + riceBonus) * multiplier;
    } else if (building.type === 'mine') {
      outputs.supplies += ((spec.output.supplies ?? 0) + mountainBonus) * multiplier;
      outputs.gold += (spec.output.gold ?? 0) * multiplier;
    } else if (building.type === 'market') {
      const marketMult = land.ownerId === PLAYER_KINGDOM_ID ? getCourtBonuses(state).marketGoldOutputMult : 1;
      outputs.gold += ((spec.output.gold ?? 0) + roads * 2) * multiplier * marketMult * tradeMult;
      outputs.supplies += ((spec.output.supplies ?? 0) + Math.floor(roads / 2)) * multiplier;
    } else {
      // Advanced production districts (harbor / workshop / guild): gold flows through the
      // trade network, other yields scale with level. Harbor also rides the local water bonus.
      const harborWater = building.type === 'harbor' ? waterBonus * multiplier : 0;
      outputs.gold += (spec.output.gold ?? 0) * multiplier * tradeMult;
      outputs.supplies += ((spec.output.supplies ?? 0) * multiplier) + harborWater;
      outputs.food += (spec.output.food ?? 0) * multiplier;
    }
  }

  if (land.ownerId === PLAYER_KINGDOM_ID) {
    // The land's own dividend first, so the tilt below scales it too — a focus that suits the
    // ground compounds with itself, which is what makes a correct reading of a province pay.
    for (const [key, value] of Object.entries(focusTerrainDividend(state, land))) {
      outputs[key as keyof ResourceBag] += value ?? 0;
    }
    // Then the tilt, scaled by how well the ground suits the focus — see `getFocusOutputMult`.
    const focus = getFocusOutputMult(state, land);
    outputs.food *= focus.food;
    outputs.supplies *= focus.supplies;
    outputs.gold *= focus.gold;
  }

  for (const key of RESOURCE_KEYS) {
    outputs[key] = Math.round(outputs[key]);
  }

  return outputs;
}

function getBuildingLaborRequired(state: GameState): number {
  let required = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    for (const building of land.buildings) {
      const spec = BUILDING_ECONOMY[building.type];
      required += Math.ceil(spec.laborPerLevel * building.level * upkeepMultiplier(building.level));
    }
  }
  return required;
}

function getConstructionLaborRequired(state: GameState): number {
  return state.buildOrders.reduce((sum, order) => {
    const level = order.kind === 'upgrade' ? 2 : 1;
    return sum + Math.ceil(BUILDING_ECONOMY[order.building].buildLabor * upkeepMultiplier(level));
  }, 0);
}

/**
 * Soldiers under the player's banner. A garrison levy is left out: it is the province's own
 * walls turned out for one battle (see `raiseGarrisonLevy`), draws no pay and eats no ration,
 * and counting it here inflated every host's wage bill for the length of a fight.
 */
export function getPlayerTroops(state: GameState): number {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron)
    .reduce((sum, army) => sum + army.units.spearmen + army.units.archers + army.units.heavyInfantry, 0);
}

export function getArmyGoldUpkeep(army: { units: { spearmen: number; archers: number; heavyInfantry: number }; level: number }): number {
  const total = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
  return Math.ceil(total / 250) + army.level;
}

function getTotalArmyGoldUpkeep(state: GameState): number {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron)
    .reduce((sum, army) => sum + getArmyGoldUpkeep(army), 0);
}

/**
 * The extra, size-scaled cost of a standing army in Dragon Ascent — zero in every other mode.
 *
 * Returns whole numbers so the header strip's rate readout stays legible, and reads the same
 * troop total the shared upkeep does, so the two are additive rather than double-counting the
 * same soldiers on different scales.
 */
export function ascentArmyUpkeep(state: GameState): { gold: number; food: number } {
  if (state.gameMode !== 'ascent') return { gold: 0, food: 0 };

  const troops = getPlayerTroops(state);
  if (troops <= 0) return { gold: 0, food: 0 };

  // A host that is marching, or standing on ground the realm does not own, eats harder than
  // one in garrison — men who move eat more than men who do not, and it is the classic reason
  // armies stop moving. Split per army so one host on campaign does not bill the whole muster.
  let garrisonTroops = 0;
  let campaignTroops = 0;
  // Ngụ binh ư nông: a host sitting at home is out in the fields, not on the payroll. It draws no
  // supplies and sends food back. The Lý, Trần and Lê all ran this, rotating the army home for the
  // fifth- and tenth-month harvests, and it is why Đại Việt could field armies it could not
  // otherwise feed. The bill comes due in `recalledHostPenalty` the season they are called back.
  let idleHosts = 0;
  for (const army of state.armies) {
    // An auxiliary is fed by whoever raised it — `tickStoryPatrons` burns its own stores and
    // starves it when they run out. Charging the realm for a host it cannot command would make
    // accepting help a tax.
    if (army.kingdomId !== PLAYER_KINGDOM_ID || army.isLevy || army.patron) continue;
    const size = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
    const marching = state.movementOrders.some((order) => order.armyId === army.id);
    const abroad = state.lands.find((land) => land.id === army.landId)?.ownerId !== PLAYER_KINGDOM_ID;
    if (marching || abroad) campaignTroops += size;
    // Out in the fields only after standing still for a few seasons — see `FARMING_AFTER`. A host
    // that halted this tick is in garrison, not at the harvest.
    else if (isFarming(state, army.idleTicks)) idleHosts += 1;
    else garrisonTroops += size;
  }

  // 1 + troops/scale: the superlinear term. At the scale figure the bill has doubled.
  const burden = 1 + troops / ARMY_UPKEEP_SCALE;
  const foodDraw = garrisonTroops * ARMY_FOOD_PER_SOLDIER
    + campaignTroops * ARMY_FOOD_PER_SOLDIER * ARMY_CAMPAIGN_FOOD_MULT;
  return {
    gold: Math.ceil(troops * ARMY_GOLD_PER_SOLDIER * burden),
    // Negative is allowed and intended: enough hosts at home under ngụ binh ư nông and the army
    // becomes a net food *producer*. That is the decree working, not an accounting slip.
    food: Math.ceil(foodDraw * burden) - idleHosts * IDLE_HOST_FOOD,
  };
}

/**
 * What the realm's own provinces consume this season (Dragon Ascent only).
 *
 * The missing half of the economy. A province used to only produce — no bread, no wants, no
 * wages — so holding land was pure profit forever and a Year-10 run banked eleven thousand
 * gold with nothing to fear and nothing to buy. Now people eat, settled towns want goods, and
 * officials and garrisons draw pay: growth writes its own bill, in the same resources the
 * player is hoarding.
 *
 * Ramped in over the first `DEMAND_RAMP_TICKS` seasons so the opening minutes teach rather
 * than execute. Per-land figures are kept because the ledger's whole job is to point at the
 * *place* that is short, not at a total.
 */
export function ascentProvincialDemand(state: GameState): {
  bag: { food: number; supplies: number; gold: number };
  perLand: { landId: string; food: number; supplies: number; gold: number }[];
} {
  const empty = { bag: { food: 0, supplies: 0, gold: 0 }, perLand: [] as { landId: string; food: number; supplies: number; gold: number }[] };
  if (state.gameMode !== 'ascent') return empty;

  // Demand scales with difficulty the same way waves do — easy is easy because the world asks
  // less of you on *both* fronts (see `demandDifficultyScale`).
  const ramp = Math.min(1, state.turn / DEMAND_RAMP_TICKS) * demandDifficultyScale(state.campaignConfig?.difficulty);
  if (ramp <= 0) return empty;

  const garrisonedLandIds = new Set(
    state.armies
      .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)
      .map((army) => army.landId),
  );

  const perLand: { landId: string; food: number; supplies: number; gold: number }[] = [];
  const bag = { food: 0, supplies: 0, gold: 0 };
  const unpaid = new Set(state.unpaidLandIds ?? []);
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
    const food = Math.ceil((land.population / DEMAND_FOOD_PER_POP) * ramp);
    const supplies = land.hasVillage
      ? Math.ceil((DEMAND_SUPPLIES_BASE + Math.floor(land.population / DEMAND_SUPPLIES_PER_POP)) * ramp)
      : 0;
    // An unpaid province draws no pay — its officials have stopped collecting AND stopped
    // billing. Without this the coin shortfall was a spiral with no exit: going unpaid
    // withheld the province's gold while its wage bill kept running, so the deficit that
    // caused the arrears could never close. Measured, one seeded run ended on 0 gold with
    // the realm pinned at three provinces. Shortfall must sting, not strangle.
    // Flat wages for the offices, plus administration's proportional cut of the province's
    // own output — the term that keeps a compounding trade network from outrunning its costs
    // (see `DEMAND_GOLD_OUTPUT_SHARE`).
    const gold = unpaid.has(land.id) ? 0 : Math.ceil(
      (DEMAND_GOLD_BASE
        + land.buildings.length * DEMAND_GOLD_PER_BUILDING
        + (garrisonedLandIds.has(land.id) ? DEMAND_GOLD_GARRISON : 0)
        + Math.max(0, land.outputs.gold) * DEMAND_GOLD_OUTPUT_SHARE) * ramp,
    );
    perLand.push({ landId: land.id, food, supplies, gold });
    bag.food += food;
    bag.supplies += supplies;
    bag.gold += gold;
  }
  return { bag, perLand };
}

export function getLaborStatus(state: GameState): LaborStatus {
  // More labor per head, and a higher efficiency floor, so growing your realm no longer
  // silently taxes every district's output — expansion should compound, not self-throttle.
  const available = Math.max(0, Math.floor(state.resources.humans / 28));
  const required = getBuildingLaborRequired(state) + getConstructionLaborRequired(state);
  return {
    available,
    required,
    efficiency: required <= 0 ? 1 : Math.min(1, Math.max(0.7, available / required)),
  };
}

function addBag(target: ResourceBag, delta: Partial<ResourceBag>, sign = 1): void {
  for (const [key, value] of Object.entries(delta)) {
    if (!RESOURCE_KEYS.includes(key as ResourceKey)) {
      continue;
    }
    target[key as ResourceKey] += Math.round((value ?? 0) * sign);
  }
}

/**
 * Hà đê sứ, 1248 — the dike office.
 *
 * Trần Thái Tông made flood control a standing office with its own officials rather than a thing
 * done after the water came. Water and rice ground stops fearing the season entirely, which in
 * this economy means the winter multiplier stops applying to a realm built on the delta.
 */
function dikeProtected(state: GameState): boolean {
  if (!dikeOffice(state)) return false;
  return state.lands.some((land) => land.ownerId === PLAYER_KINGDOM_ID
    && (land.terrainSummary.water > 0 || land.terrainSummary.riceFields > 0));
}

function getSeasonFarmMultiplier(season: Season): number {
  switch (season) {
    case 'Spring': return 1.1;
    case 'Autumn': return 1.25;
    case 'Winter': return 0.8;
    case 'Summer':
    default: return 1;
  }
}

function getPopulationFoodMultiplier(season: Season): number {
  return season === 'Winter' ? 1.15 : 1;
}

function calculateBuildingUpkeep(state: GameState): ResourceBag {
  const upkeep = emptyResourceBag();
  const courtBonuses = getCourtBonuses(state);

  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    for (const building of land.buildings) {
      const spec = BUILDING_ECONOMY[building.type];
      for (const [key, value] of Object.entries(spec.upkeep)) {
        const resourceKey = key as ResourceKey;
        const courtMult = resourceKey === 'gold'
          ? courtBonuses.buildingGoldUpkeepMult
          : resourceKey === 'supplies'
            ? courtBonuses.buildingSuppliesUpkeepMult
            : 1;
        upkeep[resourceKey] += Math.ceil((value ?? 0) * building.level * upkeepMultiplier(building.level) * courtMult);
      }
    }
  }

  return upkeep;
}

export function calculatePlayerResourceRates(state: GameState): ResourceBag {
  const rates = emptyResourceBag();

  // An unpaid province (ascent) withholds its tax *here*, at the source, so what it keeps can
  // never exceed what it actually contributed. The first version subtracted raw
  // `land.outputs.gold` on the spending side — after the tax stance had already scaled the
  // income — and the double-charge meant three unpaid provinces "withheld" more gold than the
  // whole realm grossed (measured: 106 withheld against 98 gross), a hole no treasury could
  // climb out of.
  const withholding = state.gameMode === 'ascent' && state.unpaidLandIds?.length
    ? new Set(state.unpaidLandIds)
    : undefined;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) {
      continue;
    }
    rates.food += land.outputs.food;
    rates.supplies += land.outputs.supplies;
    // Half, not all: see `UNPAID_WITHHOLD_SHARE`. Withholding everything made the ratchet
    // deepen the very deficit it exists to relieve.
    rates.gold += withholding?.has(land.id)
      ? land.outputs.gold * UNPAID_WITHHOLD_SHARE
      : land.outputs.gold;
  }

  // The dike office holds the winter off a delta realm: the season stops taking from the harvest,
  // though a good season still gives. Only ever a floor, never a cap — see `dikeProtected`.
  const seasonMult = dikeProtected(state)
    ? Math.max(1, getSeasonFarmMultiplier(state.season))
    : getSeasonFarmMultiplier(state.season);
  rates.food = Math.round(rates.food * seasonMult);

  // Tax stance scales gross gold income before upkeep is deducted.
  rates.gold = Math.round(rates.gold * getTaxEffects(state).goldMult);

  const courtBonuses = getCourtBonuses(state);
  for (const [key, value] of Object.entries(courtBonuses.resourceRateModifier)) {
    if (key !== 'humans') {
      rates[key as ResourceKey] += value ?? 0;
    }
  }

  // Everything above this line is the income side; everything below it spends. Snapshotted
  // here so the ledger can show the player gross and demand separately — the two halves the
  // one-figure header strip was hiding, and the reason nobody could learn why a number moved.
  const grossSnapshot = { food: rates.food, supplies: rates.supplies, gold: rates.gold };

  const buildingUpkeep = calculateBuildingUpkeep(state);
  addBag(rates, buildingUpkeep, -1);
  // The gold an unpaid province keeps, for the ledger's "withheld" line.
  let withheldGold = 0;
  if (withholding) {
    for (const land of state.lands) {
      if (land.ownerId === PLAYER_KINGDOM_ID && withholding.has(land.id)) {
        withheldGold += land.outputs.gold * (1 - UNPAID_WITHHOLD_SHARE);
      }
    }
  }

  const playerTroops = getPlayerTroops(state);
  const heroUpkeep = heroPayroll(state);
  // Gentler per-head food draw so a larger population isn't self-defeating: population is
  // the master resource (it is labor *and* soldiers), so growing it must stay affordable.
  // Eased from /200 to /240 for this mode's sake.
  //
  // Once the realm stopped collapsing — it now ends a run holding seventeen provinces instead of
  // three — the population it keeps alive rose with it, and food went from short in a fifth of all
  // seasons to short in better than a third. Hunger is meant to be a pressure the player manages,
  // not the default state of a successful realm.
  const baseFoodPerHead = state.gameMode === 'ascent' ? 240 : 200;
  /**
   * A full district feeds its people worse than an empty one (ascent).
   *
   * **This is what the ceiling is meant to feel like.** A clamp that stops a number is a rule the
   * player has to be told; land that grows crowded and starts eating harder is a thing they can
   * watch happen — and because growth is driven by `foodNet / 7`, the crowding slows the growth on
   * its own, ahead of the taper, without either mechanism having to know about the other.
   *
   * Squared, so the bill arrives late: an empty realm pays nothing, a half-full one pays 15% of
   * `POP_CROWDING_FOOD`, and only a realm pressed against its ground pays the whole of it.
   */
  const crowding = state.gameMode === 'ascent'
    ? 1 + POP_CROWDING_FOOD * Math.min(1.5, realmPopulationFill(state)) ** 2
    : 1;
  const foodPerHead = baseFoodPerHead / crowding;
  const populationFoodUpkeep = Math.ceil((state.resources.humans / foodPerHead) * getPopulationFoodMultiplier(state.season));
  /**
   * What the realm's own granaries send to the hosts standing on its ground (Throne of Empires).
   *
   * The counterpart to `isHomeSupplied`: the baggage is topped up in `progressArmyLogistics`, and
   * this is where it is paid for, so the strip says what is actually happening rather than showing
   * a surplus while the granary empties. A soldier billeted at home costs the realm about twice
   * what he cost it as a farmer — `queueRecruitment` already took him out of `humans`, so
   * `populationFoodUpkeep` fell by `n / 200` when he was raised and this charges `n / 100` back.
   * That difference is the price of a standing army, and it is meant to be felt.
   *
   * Zero in every other mode, where `isHomeSupplied` is false for every host.
   */
  const homeSupplyFood = state.armies.reduce((sum, army) => (
    isHomeSupplied(state, army)
      ? sum + Math.max(1, Math.ceil((army.units.spearmen + army.units.archers + army.units.heavyInfantry) / 100) * ARMY_RATION_USE_PER_100)
      : sum
  ), 0);
  const homeSupplySupplies = state.armies.reduce((sum, army) => (
    isHomeSupplied(state, army)
      ? sum + Math.max(1, Math.ceil((army.units.spearmen + army.units.archers + army.units.heavyInfantry) / 150) * ARMY_PROVISION_USE_PER_150)
      : sum
  ), 0);
  const armyRealmFoodPressure = Math.ceil(playerTroops / 300) + homeSupplyFood;
  const suppliesUpkeep = Math.ceil(playerTroops / 650) + homeSupplySupplies;
  const armyGoldUpkeep = Math.ceil(getTotalArmyGoldUpkeep(state) * courtBonuses.armyGoldUpkeepMult);

  // Dragon Ascent charges armies what they are actually worth to keep.
  //
  // The shared figures above are nominal: `getArmyGoldUpkeep` is `ceil(soldiers / 250) + level`,
  // so a two-thousand-strong host costs eleven gold a season against an income in the thousands.
  // A standing army was therefore free, which removes the oldest strategic tension there is —
  // every realm in history has had to choose between the field and the treasury.
  //
  // Charged superlinearly on purpose: a bigger host needs disproportionately more baggage,
  // administration and coin, so doubling the army more than doubles its bill. Guarded on the
  // mode, so the classic economies keep their exact numbers.
  const ascentArmy = ascentArmyUpkeep(state);
  rates.food -= populationFoodUpkeep + armyRealmFoodPressure + ascentArmy.food;
  rates.supplies -= suppliesUpkeep;
  rates.gold -= heroUpkeep + armyGoldUpkeep + ascentArmy.gold;

  // The provinces themselves eat, want goods, and draw pay (ascent only). Unpaid provinces
  // are already handled on the income side: they withhold their tax at the source and bill
  // no wages (see `ascentProvincialDemand`), so the shortfall is a *place* the ledger can
  // point at without also being a spiral the treasury cannot exit.
  let provincialGold = 0;
  if (state.gameMode === 'ascent') {
    const demand = ascentProvincialDemand(state);
    rates.food -= demand.bag.food;
    rates.supplies -= demand.bag.supplies;
    rates.gold -= demand.bag.gold;
    provincialGold = demand.bag.gold;
  }

  const foodNetBeforeHumanGrowth = rates.food;
  const ownedLandCount = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  const stabilityBonus = state.court.stability >= 70 ? 1 : state.court.stability < 40 ? -1 : 0;
  const publicGrowthBonus = getPublicBuildingEffects(state).growthBonus;
  const eventGrowthModifier = courtBonuses.resourceRateModifier.humans ?? 0;

  if (foodNetBeforeHumanGrowth < 0) {
    rates.humans = state.resources.food <= 0
      ? -Math.max(1, Math.ceil(Math.abs(foodNetBeforeHumanGrowth) / 5))
      : 0;
  } else {
    // Growth rewards food surplus (invest in farms → faster growth) and mildly compounds
    // with the current population, so a thriving realm's labour/soldier pool actually snowballs.
    const surplusGrowth = Math.floor(foodNetBeforeHumanGrowth / 7);
    const compoundGrowth = Math.floor(state.resources.humans / 700);
    // Provinces set to a `populous` focus each add a steady trickle of extra settlers.
    const populousBonus = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID && getLandSpecialization(land) === 'populous').length * 2;
    rates.humans = Math.max(0, ownedLandCount + surplusGrowth + compoundGrowth + populousBonus + stabilityBonus + publicGrowthBonus + eventGrowthModifier + getTaxEffects(state).growthDelta);
  }

  // Growth is civilian (ascent). Soldiers do not raise families on campaign, so a realm whose
  // muster rivals its population grows at a fraction of the rate — which is what stops the
  // hole an army makes from quietly refilling itself and the cost from evaporating. Measured
  // before this: 2,171 soldiers standing over 860 civilians, and the economy never noticed.
  if (state.gameMode === 'ascent' && rates.humans > 0) {
    const troops = getPlayerTroops(state);
    const civShare = state.resources.humans / Math.max(1, state.resources.humans + troops);
    rates.humans = Math.round(rates.humans * Math.min(1, Math.max(0.3, civShare)));
  }

  // And the ground itself is the ceiling (ascent).
  //
  // The throttle above prices the hole an army makes; this prices the land. Nothing anywhere bounded
  // the pool before it — the compounding term alone guaranteed growth for ever — and the reported
  // run shows what that means once a player stops expanding: one district, Year 74, 46,400 people,
  // still climbing at +229 a season. Territory was worth income and nothing else.
  //
  // A taper rather than a clamp, deliberately. A number that simply stops reads as a bug; a number
  // whose growth thins out as the districts fill reads as what it is, and the player can watch the
  // rate recover the season after they take another province.
  if (state.gameMode === 'ascent') {
    const capacity = realmPopulationCapacity(state);
    if (rates.humans > 0) {
      rates.humans = Math.round(rates.humans * Math.max(0, 1 - realmPopulationFill(state)));
    }
    // Over the ceiling — usually a realm that has just lost ground — people leave rather than
    // starve. Gentle enough (2% of the excess) that taking the land back inside a wave or two
    // undoes it, which is the whole point of making it recoverable.
    if (state.resources.humans > capacity) {
      rates.humans = -Math.ceil((state.resources.humans - capacity) * POP_DECAY_ABOVE_CAP);
    }
  }

  // Dragon Ascent: a sprawling realm keeps less of what it earns.
  //
  // Gold income here compounds through the trade network (up to +160%), court multipliers,
  // edicts and era unlocks all at once, and it reached nine thousand a season by the late game —
  // by which point every price in the mode is a rounding error and the treasury banks eighty
  // seasons of income it can never spend. Charging armies properly fixed the *rate* but not the
  // curve, because the curve was the problem.
  //
  // Above the threshold each additional gold is worth progressively less, which is ordinary
  // administrative drag: a bigger empire spends more of its own revenue simply existing. Every
  // price that matters — mercenaries, tribute, buy-offs — is pegged to income, so they scale
  // down with it and the *decisions* keep their shape while the numbers stay legible.
  let softcapGold = 0;
  // Merchants in open grievance stop moving money for you, so the drag starts far earlier. Half
  // the usual threshold rather than a new exponent: the shape of the curve is right, it is *where
  // it begins to bite* that a hostile Thương estate changes.
  const softcapFrom = state.mandate && estateStanding(state, 'thuong') < ESTATE_CRISIS
    ? GOLD_SOFTCAP_FROM * 0.5
    : GOLD_SOFTCAP_FROM;
  // Thông bảo hội sao, 1396 — paper money lifts the ceiling off income entirely. What it costs is
  // below: a treasury that rots whenever the realm is unsteady. Hồ Quý Ly's currency was backed by
  // decree and nothing else, and the country would not hold it.
  const uncapped = paperMoney(state);
  if (!uncapped && state.gameMode === 'ascent' && rates.gold > softcapFrom) {
    const excess = rates.gold - softcapFrom;
    const capped = Math.round(softcapFrom + Math.pow(excess, GOLD_SOFTCAP_EXPONENT));
    softcapGold = rates.gold - capped;
    rates.gold = capped;
  }

  // ...and a treasury that just sits there loses part of itself to the people counting it.
  //
  // The cap above works on income and so could never touch a hoard already banked, which is what
  // a run actually ends with: a hundred seasons of it. Charged on the excess only, and folded into
  // the displayed rate rather than taken quietly, so the header tells the player their gold is
  // draining and gives them a reason to spend it. See `TREASURY_GRAFT_FROM`.
  // The line moves with the realm: a flat 4,000 taxed a rich realm for holding what one
  // mercenary company costs it. See `treasuryGraftFrom`.
  let graftGold = 0;
  const graftFrom = treasuryGraftFrom(state);
  if (state.gameMode === 'ascent' && state.resources.gold > graftFrom) {
    graftGold = Math.round((state.resources.gold - graftFrom) * TREASURY_GRAFT_RATE);
    rates.gold -= graftGold;
  }

  // Paper money's price. A fiat currency nobody trusts loses value while the realm is unsteady,
  // and the whole treasury goes with it — folded into the displayed rate rather than taken
  // quietly, the same way graft is, so the header tells the player their money is evaporating.
  if (uncapped && state.court.stability < PAPER_MONEY_STABLE_ABOVE) {
    const rot = Math.round(state.resources.gold * PAPER_MONEY_DECAY);
    graftGold += rot;
    rates.gold -= rot;
  }

  // The books, kept current every tick. Gross is the income side snapshotted above; demand is
  // simply gross minus net, which the ledger presents without needing to itemise every term.
  // Shortfalls are managed by `collectPlayerIncome` as events happen, so the list survives.
  if (state.gameMode === 'ascent') {
    const line = (key: 'food' | 'supplies' | 'gold') => ({
      gross: grossSnapshot[key],
      demand: grossSnapshot[key] - rates[key],
      net: rates[key],
    });
    state.ascentLedger = {
      food: line('food'),
      supplies: line('supplies'),
      gold: line('gold'),
      shortfalls: state.ascentLedger?.shortfalls ?? [],
      // Written once a season by `tickStoreWaste`, after income lands; the books are rebuilt by
      // every `refreshAllLandOutputs` in between (a focus set, a governor posted, a province
      // taken), and a line that vanished on each of those read as "nothing wasted" for most of
      // the season it was measured in.
      waste: state.ascentLedger?.waste,
      // Named, so the books can say what eats the treasury rather than one figure for "out".
      goldParts: {
        payroll: heroUpkeep,
        hosts: armyGoldUpkeep + ascentArmy.gold,
        wages: provincialGold,
        buildings: buildingUpkeep.gold ?? 0,
        graft: graftGold,
        softcap: softcapGold,
        withheld: Math.round(withheldGold),
      },
    };
  }

  return rates;
}

export function collectPlayerIncome(state: GameState): void {
  refreshAllLandOutputs(state);
  const hadFoodShortage = state.resourceRates.food < 0 && state.resources.food + state.resourceRates.food <= 0;
  const hadSuppliesShortage = state.resourceRates.supplies < 0 && state.resources.supplies + state.resourceRates.supplies <= 0;
  if (hadFoodShortage && state.resourceRates.humans >= 0) {
    state.resourceRates.humans = -Math.max(1, Math.ceil(Math.abs(state.resourceRates.food) / 5));
  }
  applyResourceDelta(state, state.resourceRates);

  if (hadFoodShortage) {
    for (const army of state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)) {
      army.morale = Math.max(25, army.morale - 4);
      army.supply = Math.max(20, army.supply - 6);
    }
    state.message = t('msg.foodEmpty');
  }

  if (hadSuppliesShortage) {
    for (const army of state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID)) {
      army.supply = Math.max(15, army.supply - 5);
    }
    state.message = t('msg.suppliesEmpty');
  }

  ascentShortfallEvents(state, hadFoodShortage, hadSuppliesShortage);
}

/**
 * Unmet demand as *events*, not numbers (Dragon Ascent).
 *
 * The critical part of the demand system, and where a lazy version would have died: if a
 * shortfall only reduces a figure, nobody notices and nothing has been added. Each want that
 * goes unmet lands in the header as a named place — a market with no rice, a workshop with no
 * iron, a province that quietly stops sending tax — and in the ledger's "going without" list,
 * where tapping the row opens the province that needs the answer.
 *
 * The coin line is deliberately the same sentence the Reed Banner speaks when a province
 * declares for the herdsman's son. From the throne, a rebellion and an unpaid clerk look
 * identical until you go and find out — which is the economy and the Chronicle finally
 * speaking one language.
 */
function ascentShortfallEvents(state: GameState, foodShort: boolean, suppliesShort: boolean): void {
  if (state.gameMode !== 'ascent' || !state.ascent) return;

  const ledger = state.ascentLedger;
  const marks = (state.shortfallToastTurns ??= {});
  const quiet = (kind: 'food' | 'supplies' | 'gold') =>
    state.turn - (marks[kind] ?? -DEMAND_TOAST_COOLDOWN) < DEMAND_TOAST_COOLDOWN;
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const recordShortfall = (landId: string, kind: 'food' | 'supplies' | 'gold') => {
    if (!ledger) return;
    if (ledger.shortfalls.some((entry) => entry.landId === landId && entry.kind === kind)) return;
    ledger.shortfalls.push({ landId, kind, sinceTurn: state.turn });
    if (ledger.shortfalls.length > 6) ledger.shortfalls.shift();
  };
  const clearShortfall = (kind: 'food' | 'supplies' | 'gold') => {
    if (!ledger) return;
    ledger.shortfalls = ledger.shortfalls.filter((entry) => entry.kind !== kind);
  };

  // Bread. The market with the least loyal, hungriest crowd goes without first, and the
  // famine card — already written, already good — inherits a realm that has seen it coming.
  if (foodShort) {
    const hungriest = owned
      .filter((land) => land.hasVillage && land.population > 50)
      .sort((a, b) => a.loyalty - b.loyalty)[0];
    if (hungriest) {
      hungriest.population = Math.max(20, Math.floor(hungriest.population * 0.985));
      hungriest.loyalty = Math.max(0, hungriest.loyalty - 2);
      recordShortfall(hungriest.id, 'food');
      if (!quiet('food')) {
        marks.food = state.turn;
        pushToast(state, t('ascent.demand.bread', { land: hungriest.name }), 'threat');
      }
    }
  } else {
    clearShortfall('food');
  }

  // Cloth and iron. Settled provinces slide; the yards slow (see `progressBuildOrders`).
  if (suppliesShort) {
    const wanting = owned.filter((land) => land.hasVillage).sort((a, b) => b.population - a.population)[0];
    if (wanting) {
      wanting.loyalty = Math.max(0, wanting.loyalty - 1);
      recordShortfall(wanting.id, 'supplies');
      if (!quiet('supplies')) {
        marks.supplies = state.turn;
        pushToast(state, t('ascent.demand.cloth', { land: wanting.name }), 'threat');
      }
    }
  } else {
    clearShortfall('supplies');
  }

  // Coin. An empty treasury stops paying somebody — a named somebody. Their province withholds
  // its gold (see `calculatePlayerResourceRates`) and the garrison's arrears start counting.
  const goldShort = state.resources.gold <= 0 && state.resourceRates.gold < 0;
  const unpaid = (state.unpaidLandIds ??= []);
  const restore = (restored: string | undefined, key: 'ascent.demand.coinRecover' | 'ascent.demand.coinWriteOff') => {
    if (!restored) return;
    const land = state.lands.find((candidate) => candidate.id === restored);
    const at = ledger?.shortfalls.findIndex((entry) => entry.kind === 'gold' && entry.landId === restored) ?? -1;
    if (ledger && at >= 0) ledger.shortfalls.splice(at, 1);
    if (land) pushToast(state, t(key, { land: land.name }), 'info');
  };
  // Arrears wear on the provinces that carry them: loyalty slides while the wage is late.
  for (const id of unpaid) {
    const land = state.lands.find((candidate) => candidate.id === id);
    if (land) land.loyalty = Math.max(UNPAID_LOYALTY_FLOOR, land.loyalty - UNPAID_LOYALTY_PER_TICK);
  }
  // A write-off, whatever the books say: an arrear this old is settled and the clerks return.
  // The one-way ratchet is what turned one bad season into a permanent state — measured, 200
  // seasons with every province unpaid — and a pulse is the honest shape of the pressure.
  // Kept on the state itself, not read back off the ledger's capped shortfall list: an entry
  // that had scrolled off the list made its province un-writable-off, and the ratchet locked.
  const since = (state.unpaidSince ??= {});
  for (const id of unpaid) since[id] ??= state.turn;
  const overdue = unpaid.find((id) => state.turn - (since[id] ?? state.turn) >= UNPAID_WRITEOFF_TICKS);
  if (overdue) {
    unpaid.splice(unpaid.indexOf(overdue), 1);
    delete since[overdue];
    restore(overdue, 'ascent.demand.coinWriteOff');
    // A written-off province gets a full cadence of pay before the ratchet may reach for it
    // again — otherwise the same clerks were stopped again in the same season they came back.
    marks.goldRatchet = state.turn;
  }
  if (goldShort) {
    // The garrison's arrears are counted by `progressArmyLogistics`, once per tick, with the
    // desertion step at three and the disbandment at five. This used to count them *again*
    // here, so a treasury three seasons empty dissolved every host the realm had — the royal
    // host at turn five, before the first wave had even marched — and read as "my army just
    // vanished". One clerk keeps the book.
    // Poorest province first. The clerks at the edge of the realm are the first the treasury
    // stops paying and the last to be missed — the capital's counting-house goes dark last.
    // The first version unpaid the *richest* three, which amputated the realm's whole gold
    // engine on the first bad season and turned a warning sign into a death blow.
    const next = owned
      .filter((land) => !unpaid.includes(land.id) && land.outputs.gold > 0)
      .sort((a, b) => a.outputs.gold - b.outputs.gold)[0];
    // One province per *sustained* stretch of arrears, on its own cadence — not one per tick.
    // Clerks live with a late wage for a season or two before they stop collecting; the
    // tick-cadence version walked out all three provinces inside three ticks of the first bad
    // season, before any recovery could exist.
    const ratchetDue = state.turn - (marks.goldRatchet ?? -UNPAID_RATCHET_TICKS) >= UNPAID_RATCHET_TICKS;
    if (next && unpaid.length < 3 && ratchetDue) {
      unpaid.push(next.id);
      since[next.id] = state.turn;
      recordShortfall(next.id, 'gold');
      marks.goldRatchet = state.turn;
      if (!quiet('gold')) {
        marks.gold = state.turn;
        pushToast(state, t('ascent.demand.coin', { land: next.name }), 'threat');
      }
    }
  } else if (unpaid.length > 0
    && (state.resources.gold > UNPAID_RECOVER_TREASURY || state.resourceRates.gold >= 0)) {
    // Reachable by flow as well as by stock: with withholding applied at the source, a realm
    // whose *paying* provinces cover the bills again is solvent even before the treasury
    // refills, and the officials drift back one province a season.
    // Recovery is gradual and says so: one province at a time comes back on the books.
    const back = unpaid.shift();
    if (back) delete since[back];
    restore(back, 'ascent.demand.coinRecover');
  }
}

/**
 * What the roster costs this season.
 *
 * Every mode but Dragon Ascent pays every hero in full, as it always has. Ascent halves the pay
 * of a hero with no posting — a bench of champions is a cost, not a payroll — and halves the
 * king's, so a run does not open in deficit on its own founder's wage. Payroll was the largest
 * gold drain in every measured run, and the one the player had no lever on.
 */
export function heroPayroll(state: GameState): number {
  // Two decrees move the payroll, and they pull in opposite directions on purpose. Sùng Phật
  // keeps the monastics for nothing — the Lý and Trần courts were staffed by monks who took no
  // wage — while Chiếu cầu hiền advertises for talent and gets talent that knows its price.
  const monasticsFree = sanghaPatronage(state);
  const seeking = seekingTheWorthy(state) ? SEEKING_UPKEEP_MULT : 1;
  const upkeepOf = (hero: GameState['heroes'][number]) =>
    (monasticsFree && hero.monastic ? 0 : hero.upkeepGold * seeking);

  if (state.gameMode !== 'ascent') {
    return Math.round(state.heroes.reduce((sum, hero) => sum + upkeepOf(hero), 0));
  }
  const total = state.heroes.reduce((sum, hero) => {
    const kingMult = hero.id === 'king' ? ASCENT_KING_UPKEEP_MULT : 1;
    const postingMult = hero.assignedTo ? 1 : HERO_RESERVE_UPKEEP_SHARE;
    return sum + upkeepOf(hero) * kingMult * postingMult;
  }, 0);
  return Math.round(total);
}

export function getBuildOrder(state: GameState, landId: string): BuildOrder | undefined {
  return state.buildOrders.find((order) => order.landId === landId);
}

export function getBuildOptions(state: GameState, land: Land): BuildOption[] {
  const activeOrder = getBuildOrder(state, land.id);
  /**
   * Nothing is founded on ground an enemy is walking into.
   *
   * First in the reason chain because it outranks every other blocker: it does not matter that
   * the realm can afford a market here or that the terrain allows it. Refused rather than hidden,
   * so the sheet still explains itself — and because `autoBuild`/`autoUpgrade` read these same
   * options, this one seam also stops the autopilot spending its single decision a season on a
   * province it is in the middle of losing.
   */
  const fallingReason = provinceIsFalling(state, land.id) ? t('ascent.falling.busyGround') : undefined;

  return BUILDING_ORDER.map((type) => {
    const spec = BUILDING_ECONOMY[type];
    const terrainReason = getBuildingTerrainBlocker(land, type);
    const capacityReason = land.buildings.length >= land.buildingCapacity ? t('reason.noCapacity') : undefined;
    const singletonTypes: LandBuildingType[] = ['wall', 'tower', 'barracks', 'communalHall', 'harbor', 'workshop', 'guild', 'university'];
    const duplicateReason = type === 'market' && land.buildings.filter((building) => building.type === 'market').length >= getMarketLimit(land)
      ? t('reason.marketLimit')
      : singletonTypes.includes(type) && land.buildings.some((building) => building.type === type)
        ? t('reason.alreadyBuilt', { building: buildingLabel(type) })
        : undefined;
    const eraReason = !isBuildingUnlocked(state, type)
      ? t('reason.needEra', { era: eraLabel(BUILDING_ERA_REQUIREMENT[type]!) })
      : undefined;
    const activeOrderReason = activeOrder
      ? t('reason.alreadyOrder', {
        kind: buildOrderKindLabel(activeOrder.kind),
        building: buildingLabel(activeOrder.building),
        progress: activeOrder.progress,
        required: activeOrder.required,
      })
      : undefined;
    // The scaled purse (Dragon Ascent; exactly 1 elsewhere): a farm that cost 32 gold to a realm
    // grossing 40 a season is not a decision to one grossing 400. See `priceScale.ts`.
    const cost = scaledCost(state, scaleResourceBag(spec.baseCost, getCourtBonuses(state).buildingCostMult));
    const costReason = !canSpend(state, cost) ? formatCostBlocker(cost) : undefined;
    const reason = fallingReason ?? eraReason ?? terrainReason ?? capacityReason ?? duplicateReason ?? activeOrderReason ?? costReason;

    return {
      type,
      label: buildBuildingLabel(type),
      cost,
      labor: spec.buildLabor,
      ticks: Math.max(1, spec.buildTicks - getCourtBonuses(state).buildSpeedBonus),
      category: spec.category,
      upkeep: getScaledUpkeep(type, 1),
      output: getScaledOutput(type, 1),
      canBuild: !reason,
      reason,
    };
  });
}

export function getUpgradeOptions(state: GameState, land: Land): UpgradeOption[] {
  const activeOrder = getBuildOrder(state, land.id);
  /** See `getBuildOptions` — no masonry is raised on ground already being taken. */
  const fallingReason = provinceIsFalling(state, land.id) ? t('ascent.falling.busyGround') : undefined;

  const buildingCap = getBuildingLevelCap(state);
  return land.buildings.map((building, index) => {
    const spec = BUILDING_ECONOMY[building.type];
    const atMaxLevel = building.level >= buildingCap;
    const activeOrderReason = activeOrder
      ? t('reason.alreadyOrder', {
        kind: buildOrderKindLabel(activeOrder.kind),
        building: buildingLabel(activeOrder.building),
        progress: activeOrder.progress,
        required: activeOrder.required,
      })
      : undefined;
    const cost = scaledCost(state, scaleResourceBag(
      spec.baseCost,
      upgradeCostMultiplier(building.level) * getCourtBonuses(state).buildingCostMult,
    ));
    const costReason = !atMaxLevel && !canSpend(state, cost) ? formatCostBlocker(cost) : undefined;
    const reason = fallingReason ?? (atMaxLevel ? t('reason.maxLevel') : (activeOrderReason ?? costReason));
    const nextLevel = Math.min(buildingCap, building.level + 1);

    return {
      index,
      type: building.type,
      level: building.level,
      maxLevel: buildingCap,
      cost,
      labor: Math.ceil(spec.buildLabor * upkeepMultiplier(nextLevel)),
      ticks: Math.max(1, spec.buildTicks - getCourtBonuses(state).buildSpeedBonus - getCourtBonuses(state).upgradeSpeedBonus),
      category: spec.category,
      upkeep: getScaledUpkeep(building.type, nextLevel),
      output: getScaledOutput(building.type, nextLevel),
      canUpgrade: !reason,
      reason,
    };
  });
}

export function buildDistrictBuilding(state: GameState, landId: string, building: LandBuildingType): boolean {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) {
    return false;
  }

  const option = getBuildOptions(state, land).find((candidate) => candidate.type === building);
  if (!option) {
    return false;
  }

  if (!option.canBuild) {
    state.message = option.reason ?? t('msg.cannotBuildHere');
    return false;
  }

  applyResourceDelta(state, Object.fromEntries(Object.entries(option.cost).map(([key, value]) => [key, -(value ?? 0)])));
  state.buildOrders.push({
    landId,
    building,
    kind: 'build',
    progress: 0,
    required: option.ticks,
  });
  state.message = t('msg.startedConstruction', { building: buildingLabel(building), land: land.name, ticks: option.ticks });
  refreshAllLandOutputs(state);
  return true;
}

export function upgradeDistrictBuilding(state: GameState, landId: string, buildingIndex: number): boolean {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) {
    return false;
  }

  const option = getUpgradeOptions(state, land)[buildingIndex];
  if (!option) {
    return false;
  }

  if (!option.canUpgrade) {
    state.message = option.reason ?? t('msg.cannotUpgrade');
    return false;
  }

  applyResourceDelta(state, Object.fromEntries(Object.entries(option.cost).map(([key, value]) => [key, -(value ?? 0)])));
  state.buildOrders.push({
    landId,
    building: option.type,
    kind: 'upgrade',
    buildingIndex,
    progress: 0,
    required: option.ticks,
  });
  state.message = t('msg.startedUpgrade', {
    building: buildingLabel(option.type),
    level: option.level + 1,
    land: land.name,
    ticks: option.ticks,
  });
  refreshAllLandOutputs(state);
  return true;
}

export function destroyDistrictBuilding(state: GameState, landId: string, buildingIndex: number): boolean {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) {
    return false;
  }

  if (getBuildOrder(state, land.id)) {
    state.message = t('msg.finishBeforeDestroy');
    return false;
  }

  const building = land.buildings[buildingIndex];
  if (!building) {
    return false;
  }

  const label = buildingLabel(building.type);
  const defenseBonus = BUILDING_ECONOMY[building.type].defensePerLevel;
  if (defenseBonus) {
    land.defense = Math.max(0, land.defense - defenseBonus * building.level);
  }
  land.buildings.splice(buildingIndex, 1);
  refreshAllLandOutputs(state);
  state.message = t('msg.destroyedBuilding', { building: label, land: land.name });
  return true;
}

export function progressBuildOrders(state: GameState): boolean {
  // No iron, no pace (ascent): while the supply stores are empty the yards work every other
  // season. The goods pile finally has a reason to exist beyond its own number.
  if (state.gameMode === 'ascent' && state.resources.supplies <= 0 && state.turn % 2 === 1) {
    return false;
  }

  const completed: BuildOrder[] = [];

  for (const order of state.buildOrders) {
    order.progress += 1;
    if (order.progress >= order.required) {
      completed.push(order);
    }
  }

  if (completed.length === 0) {
    return false;
  }

  for (const order of completed) {
    const land = state.lands.find((candidate) => candidate.id === order.landId);
    if (!land) {
      continue;
    }

    const label = buildingLabel(order.building);
    const defenseBonus = BUILDING_ECONOMY[order.building].defensePerLevel;

    if (order.kind === 'upgrade' && order.buildingIndex !== undefined) {
      const instance = land.buildings[order.buildingIndex];
      if (instance) {
        instance.level += 1;
        if (defenseBonus) {
          land.defense += defenseBonus;
        }
        state.message = t('msg.upgradedBuilding', { building: label, level: instance.level, land: land.name });
      }
    } else {
      land.buildings.push({ type: order.building, level: 1 });
      if (defenseBonus) {
        land.defense += defenseBonus;
      }
      state.message = t('msg.completedBuilding', { building: label, land: land.name });
    }
  }

  state.buildOrders = state.buildOrders.filter((order) => !completed.includes(order));
  refreshAllLandOutputs(state);
  return true;
}

function getScaledOutput(type: LandBuildingType, level: number): Partial<ResourceBag> {
  const output = BUILDING_ECONOMY[type].output;
  return scaleResourceBag(output, outputMultiplier(level));
}

function getScaledUpkeep(type: LandBuildingType, level: number): Partial<ResourceBag> {
  const upkeep = BUILDING_ECONOMY[type].upkeep;
  return scaleResourceBag(upkeep, level * upkeepMultiplier(level));
}

function getBuildingTerrainBlocker(land: Land, building: LandBuildingType): string | undefined {
  if (building === 'farm') {
    const grassTiles = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
    const existingFarms = land.buildings.filter((candidate) => candidate.type === 'farm').length;
    return grassTiles >= (existingFarms + 1) * 4 ? undefined : t('reason.needGrass');
  }

  if (building === 'mine') {
    const oreTiles = land.terrainSummary.mountains + land.terrainSummary.hills;
    const existingMines = land.buildings.filter((candidate) => candidate.type === 'mine').length;
    return oreTiles >= (existingMines + 1) * 3 ? undefined : t('reason.needOre');
  }

  if (building === 'harbor') {
    return land.terrainSummary.water > 0 ? undefined : t('reason.needWater');
  }

  const hasCityCore = land.terrainSummary.fortress + land.terrainSummary.shrine > 0;
  return hasCityCore || land.neighbors.length >= 3 ? undefined : t('reason.needCity');
}

function getMarketLimit(land: Land): number {
  return land.terrainSummary.fortress + land.terrainSummary.shrine > 0 ? 2 : 1;
}

function scaleResourceBag(cost: Partial<ResourceBag>, multiplier: number): Partial<ResourceBag> {
  const scaled: Partial<ResourceBag> = {};
  for (const [key, value] of Object.entries(cost)) {
    const amount = Math.ceil((value ?? 0) * multiplier);
    if (amount > 0) {
      scaled[key as ResourceKey] = amount;
    }
  }
  return scaled;
}

/** Sum of levels across all `barracks` buildings on a district - drives recruitment speed. */
export function getBarracksLevel(land: Land): number {
  return land.buildings
    .filter((building) => building.type === 'barracks')
    .reduce((sum, building) => sum + building.level, 0);
}

export function formatEconomyLine(values: Partial<ResourceBag>): string {
  const text = formatResourceList(values);
  return text || t('building.none');
}

function formatCostBlocker(cost: Partial<ResourceBag>): string {
  return t('reason.needCost', { parts: formatResourceList(cost) });
}

export function formatLabor(labor: number): string {
  return `${labor} ${resourceLabel('humans')}`;
}
