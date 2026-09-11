import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  AUTOBUILD_GOLD_RESERVE,
  AUTOTRIM_BROKE_TICKS,
  AUTOTRIM_GAP_TICKS,
  AUTOTRIM_PAYROLL_SHARE,
  AUTO_CLAIM_INTERVAL_TICKS,
  AUTO_CLAIM_MAX_ORDERS,
  AUTO_CLAIM_MIN_CHANCE,
  AUTO_CLAIM_TREASURY_SHARE,
  COURT_GAP_TICKS,
  DEFENSIVE_POSTURE_RATIO,
  GOLD_GLUT_SEASONS,
  MARCH_MIN_WIN_CHANCE,
  MIN_ARMY_SOLDIERS,
  MIN_MUSTER_SUPPLY_SHARE,
  RECRUIT_HUMAN_RESERVE,
  REMNANT_SHARE,
  SCARCITY_CRISIS_MULT,
  SCARCITY_CRISIS_SEASONS,
  SCARCITY_WARNING_MULT,
  SCARCITY_WARNING_SEASONS,
  SUPPLY_FOOD_RESERVE,
  SUPPLY_STORE_RESERVE,
  SUPPLY_TICKS_HELD,
  recruitSoldiers,
  targetArmyCount,
} from '../../game/ascentConfig';
import {
  applyResourceDelta,
  ascentArmyUpkeep,
  buildDistrictBuilding,
  getArmyGoldUpkeep,
  getBuildOptions,
  getBuildOrder,
  getUpgradeOptions,
  heroPayroll,
  type BuildOption,
  type UpgradeOption,
  upgradeDistrictBuilding,
} from '../ResourceSystem';
import {
  bribeLand,
  canStartClaim,
  getBribeSuccessChance,
  getGoldBribeCost,
  getPlayerClaimCount,
} from '../AcquisitionSystem';
import {
  disbandArmy, getRecruitmentOrder, issueMoveOrder, musterLimit, queueRecruitment,
} from '../WarSystem';
import { frontWinChance, offerConquestMethods } from './ConquestSystem';
import { chargeAmbition } from './AmbitionSystem';
import { isAutoHost, isPinnedByClaim } from './armyOrders';
import { liveBattles } from './fronts';
import { canDismissHero, dismissHero } from './CourtLaneSystem';
import {
  doctrineClaimIntervalMult,
  doctrineDefenceMult,
  doctrineHostBonus,
  doctrineOutputMult,
} from './RealmDoctrineSystem';
import { pushToast } from '../empire/notifications';
import { t } from '../../i18n';
import { enqueueAscentPrompt, standingHostCount } from './AscentState';
import { defaultMusterPlan, musterBlockedReason } from './MusterSystem';
import { realmIncomeScale } from './priceScale';
import { autoSellWaste } from './GranarySystem';
import { getMusterEstimate } from '../WarSystem';
import type { GameState, Land, LandBuildingType } from '../../state/types';

/**
 * The "auto-fire" layer. Every tick this files the orders a human player would file by
 * hand — and *only* through the public order APIs (`buildDistrictBuilding`,
 * `upgradeDistrictBuilding`, `queueRecruitment`, `issueMoveOrder`). It never mutates
 * economy or combat state directly, so all the existing math is reused unchanged and a
 * balance change in ResourceSystem/WarSystem automatically applies here too.
 *
 * One order of each kind per tick, so the realm grows at a readable pace rather than
 * emptying the treasury the instant it can afford something.
 */

/** Buildings worth extra weight when a wave is about to outclass us. */
const DEFENSIVE_BUILDINGS: LandBuildingType[] = ['wall', 'tower', 'barracks'];

function playerLands(state: GameState): Land[] {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

/** Are we outmatched by the incoming wave? Tilts the build priority toward defence. */
function underPressure(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent || ascent.power <= 0) return false;
  return ascent.threat / ascent.power > DEFENSIVE_POSTURE_RATIO;
}

/**
 * What one unit per season of each resource is worth to the realm *right now*.
 *
 * The fixed weights this replaces were the single most damaging numbers in the mode. Gold
 * scored 3 and food scored 1, so the autopilot built markets in preference to farms at every
 * opportunity — and a realm that optimises for coin while its granary empties produces exactly
 * what measurement found across every seed: food pinned at zero for hundreds of consecutive
 * seasons, `collectPlayerIncome` docking every host 4 morale and 6 supply per tick, population
 * shrinking, defence quietly collapsing, and a treasury of several hundred thousand gold with
 * nothing to buy. The famine and the idle fortune were never two problems. They were one
 * scoring line.
 *
 * Weighting by scarcity corrects both directions at once: whatever the realm is running out of
 * becomes the most valuable thing it can build, and whatever it is drowning in stops dominating
 * the choice. It also makes the economy self-correcting rather than one-way, which is what lets
 * a realm recover from a bad stretch instead of spiralling.
 */
function outputWeights(state: GameState): Record<'gold' | 'food' | 'supplies' | 'humans', number> {
  const rates = state.resourceRates;
  const held = state.resources;

  /** Seasons of buffer left at the current burn rate; Infinity while a resource is growing. */
  const runway = (stock: number, rate: number): number =>
    rate >= 0 ? Number.POSITIVE_INFINITY : Math.max(0, stock) / Math.max(1, -rate);

  const byScarcity = (base: number, stock: number, rate: number): number => {
    const seasons = runway(stock, rate);
    if (seasons <= SCARCITY_CRISIS_SEASONS) return base * SCARCITY_CRISIS_MULT;
    if (seasons <= SCARCITY_WARNING_SEASONS) return base * SCARCITY_WARNING_MULT;
    return base;
  };

  // Coin the realm cannot spend is not worth building more of. Without this the treasury still
  // runs away in the seeds where trade multipliers compound hardest.
  const goldGlut = rates.gold > 0 && held.gold > rates.gold * GOLD_GLUT_SEASONS;

  // The player's standing doctrine rides on top of scarcity rather than replacing it: a realm
  // told to enrich still builds farms when the granary is emptying, because a starved realm is
  // nobody's plan. Scarcity is the floor; doctrine decides what to do with the surplus.
  return {
    // A broke realm builds markets: gold used to be the one resource with no scarcity term, so a
    // treasury pinned at zero never changed what the autopilot chose to build.
    gold: (goldGlut ? 1 : byScarcity(3, held.gold, rates.gold)) * doctrineOutputMult(state, 'gold'),
    food: byScarcity(1, held.food, rates.food) * doctrineOutputMult(state, 'food'),
    supplies: byScarcity(2.5, held.supplies, rates.supplies) * doctrineOutputMult(state, 'supplies'),
    humans: 0.4,
  };
}

/**
 * Net value of a building per season: what it produces, minus what it costs to keep, priced
 * against what the realm is currently short of.
 */
function optionScore(
  option: BuildOption | UpgradeOption,
  defensive: boolean,
  isCapital: boolean,
  weight: Record<'gold' | 'food' | 'supplies' | 'humans', number>,
  doctrineMult: number,
): number {
  const out = option.output;
  const keep = option.upkeep;
  const produced = (out.gold ?? 0) * weight.gold + (out.food ?? 0) * weight.food
    + (out.supplies ?? 0) * weight.supplies + (out.humans ?? 0) * weight.humans;
  // Upkeep is priced on the same scale, so a building whose *running cost* is the very thing
  // the realm is short of stops looking like a bargain the moment the shortage begins.
  const consumed = (keep.gold ?? 0) * weight.gold + (keep.supplies ?? 0) * weight.supplies
    + (keep.food ?? 0) * weight.food;
  // Fortifications always carry weight, not only under pressure: home defence in this mode
  // is the walls' job, which is what frees the field host to stay on the offensive.
  //
  // The capital is weighted hardest of all, because losing it ends the run outright while
  // losing any other province is a setback. Invaders with conquest intent march straight at
  // it, and an unwalled seat falls to the fourth wave no matter how much ground was taken.
  const base = DEFENSIVE_BUILDINGS.includes(option.type) ? (defensive ? 18 : 7) : 0;
  const defenceBonus = (isCapital ? base * 3 : base) * doctrineMult;
  // Cheaper and faster options win ties, so early ticks are never idle.
  return produced - consumed + defenceBonus - option.ticks * 0.5;
}

/** Files at most one build order: the best-scoring affordable building across the realm. */
function autoBuild(state: GameState): boolean {
  const defensive = underPressure(state);
  const weight = outputWeights(state);
  const doctrineMult = doctrineDefenceMult(state);
  let best: { landId: string; type: LandBuildingType; score: number } | undefined;

  for (const land of playerLands(state)) {
    if (getBuildOrder(state, land.id)) continue;
    const isCapital = land.id === state.ascent?.capitalLandId;
    for (const option of getBuildOptions(state, land)) {
      if (!option.canBuild) continue;
      const score = optionScore(option, defensive, isCapital, weight, doctrineMult);
      if (!best || score > best.score) {
        best = { landId: land.id, type: option.type, score };
      }
    }
  }

  if (!best) return false;
  return buildDistrictBuilding(state, best.landId, best.type);
}

/** Files at most one upgrade order. Only runs when there was nothing new worth building. */
function autoUpgrade(state: GameState): boolean {
  const defensive = underPressure(state);
  const weight = outputWeights(state);
  const doctrineMult = doctrineDefenceMult(state);
  let best: { landId: string; index: number; score: number } | undefined;

  for (const land of playerLands(state)) {
    if (getBuildOrder(state, land.id)) continue;
    const isCapital = land.id === state.ascent?.capitalLandId;
    const options = getUpgradeOptions(state, land);
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (!option.canUpgrade) continue;
      const score = optionScore(option, defensive, isCapital, weight, doctrineMult);
      if (!best || score > best.score) {
        best = { landId: land.id, index, score };
      }
    }
  }

  if (!best) return false;
  return upgradeDistrictBuilding(state, best.landId, best.index);
}

function armySize(army: { units: { spearmen: number; archers: number; heavyInfantry: number } }): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

/**
 * Sends shattered hosts home.
 *
 * Armies in this game only ever shrink — nothing heals them — so a fifty-soldier remnant is
 * militarily useless yet still counts against the target host number, which quietly blocks
 * raising a fresh one forever. `disbandArmy` returns its survivors to the population, so the
 * levy going home is also how manpower gets recycled into the next real host.
 */
function autoDisbandRemnants(state: GameState): void {
  // Across every live field: a host holding a second front is still in a line, and sending it
  // home as a "remnant" mid-fight is how a defence read as broken before a blow was struck.
  const engaged = new Set(liveBattles(state)
    .flatMap((live) => [...(live.ourArmyIds ?? []), ...(live.theirArmyIds ?? [])]));
  const small = state.armies.filter(
    (army) =>
      army.kingdomId === PLAYER_KINGDOM_ID &&
      // A garrison levy is not a host, and a host in the line is not sent home mid-fight —
      // both used to be dissolved here at the top of the tick, and the field they were
      // standing on read as broken before a blow was struck.
      !army.isLevy &&
      // An auxiliary is not ours to send home, however thin it has worn.
      !army.patron &&
      !engaged.has(army.id) &&
      // A remnant mid-refit is about to stop being one — the men it paid for are marching in.
      !army.refit &&
      armySize(army) < MIN_ARMY_SOLDIERS * REMNANT_SHARE &&
      !state.siegeOrders.some((order) => order.armyId === army.id),
  );
  for (const army of small) {
    // A host under the player's own orders is theirs to keep, however small. Say so once.
    if (!isAutoHost(army)) {
      const warned = (state.ascent!.remnantWarnedIds ??= []);
      if (!warned.includes(army.id)) {
        warned.push(army.id);
        pushToast(state, t('ascent.orders.remnant', { army: army.name, n: armySize(army) }), 'info');
      }
      continue;
    }
    disbandArmy(state, army.id);
  }
}

/**
 * Lets a champion go when the treasury has been empty a while and the roster is what empties it.
 *
 * The bench is the one gold drain the autopilot never touched: a naive run took every summon it
 * was offered and, once its provinces were lost, sat for two hundred seasons paying twelve heroes
 * out of a one-province gross. A steward would let somebody go. This does what a steward would —
 * the least useful unposted champion, never the king or the founder, one every dozen seasons,
 * announced — and only while the coffers are pinned at nothing with the roster over half the take.
 */
function autoTrimPayroll(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  const gross = Math.max(1, state.ascentLedger?.gold.gross ?? 1);
  const payroll = state.ascentLedger?.goldParts?.payroll ?? heroPayroll(state);
  const pinned = state.resources.gold <= 0 && state.resourceRates.gold < 0;
  ascent.brokeTicks = pinned ? (ascent.brokeTicks ?? 0) + 1 : 0;
  if (ascent.brokeTicks < AUTOTRIM_BROKE_TICKS) return;
  if (payroll < gross * AUTOTRIM_PAYROLL_SHARE) return;
  if (state.turn - (ascent.lastPayrollTrimTurn ?? -AUTOTRIM_GAP_TICKS) < AUTOTRIM_GAP_TICKS) return;

  const candidate = state.heroes
    .filter((hero) => !hero.assignedTo && canDismissHero(state, hero))
    .sort((a, b) => Math.max(...Object.values(a.stats)) - Math.max(...Object.values(b.stats)))[0];
  if (!candidate) return;
  if (dismissHero(state, candidate.id)) ascent.lastPayrollTrimTurn = state.turn;
}

/** The shared per-host wage, summed — the private `getTotalArmyGoldUpkeep` is not exported. */
function getTotalArmyGoldUpkeepAscent(state: GameState): number {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy)
    .reduce((sum, army) => sum + getArmyGoldUpkeep(army), 0);
}

/**
 * A hero with no posting, best martial first — the natural commander for a new host.
 *
 * **A general at the head of a host is not free, whatever `assignedTo` says.** The two are set
 * together on every ordinary path, but not on all of them — a story that hands a champion a
 * column writes `generalHeroId` alone, and so does the arena — so this could pick a hero standing
 * with an army, and the muster card came up asking the realm to raise a second one under him.
 * `musterBlockedReason` refuses that plan, so the card either proposed a commander it could not
 * use or never arrived at all. Reported verbatim: *if hero is in a army they must not create "Lập
 * quân".* Same predicate here as there, so the plan and the block cannot disagree.
 */
export function findFreeCommander(state: GameState): string | undefined {
  return state.heroes
    .filter((hero) => !hero.assignedTo)
    .filter((hero) => !state.armies.some((army) => army.generalHeroId === hero.id))
    .filter((hero) => !state.recruitmentOrders.some((order) => order.heroId === hero.id))
    .sort((a, b) => b.stats.martial - a.stats.martial)[0]?.id;
}

/**
 * Keeps the realm at its target number of standing hosts. `queueRecruitment` handles the
 * land choice, the cost, and the muster timer; we only decide *whether* and *how big*.
 */
function autoRecruit(state: GameState): boolean {
  // A realm that cannot feed the men it has does not raise more. Soldiers now eat a full
  // ration and armies drag on growth, so recruiting into a deficit is how the autopilot
  // would starve the realm on the player's behalf — the one failure it must never commit.
  //
  // Both resources are judged by *runway*, not by the instantaneous rate. Provincial demand
  // deliberately steers a well-run realm toward break-even — the autopilot's own output
  // weights push surplus food back into growth — so "rate must be positive" gates are
  // permanently false in exactly the realms they were meant to protect. Measured twice: a
  // gold-rate gate froze recruiting for a whole run (realm dead at three provinces, no host
  // ever raised), then a food-rate gate did the same (zero recruits across 500 ticks). The
  // honest question is whether the granary and treasury can carry the current deficit long
  // enough for the next harvest to answer — about twenty seasons.
  const foodRate = state.resourceRates.food;
  const goldRate = state.resourceRates.gold;
  const foodRunwayOk = foodRate > 1
    || state.resources.food > Math.abs(Math.min(0, foodRate)) * 20 + 60;
  const goldRunwayOk = goldRate >= 0 || state.resources.gold > Math.abs(goldRate) * 20;
  if (!foodRunwayOk || !goldRunwayOk) return false;

  const lands = playerLands(state);
  const inFlight = state.recruitmentOrders.length;
  // Only hosts that could actually fight count toward the target — and a garrison levy is not one
  // of them. A levy exists for the length of a single battle and is dissolved by
  // `dissolveGarrisonLevies` the moment it ends, so counting it here tells the autopilot the realm
  // has a standing host it is about to lose. Harmless while battles were rare; once they became
  // frequent it suppressed recruitment for a whole run, and the realm quietly stopped replacing
  // the armies it lost.
  // The same trap as the levy below it, and a worse one: a well-fed auxiliary counted here would
  // tell the autopilot the realm already has the hosts it needs, and the realm would quietly stop
  // raising its own. Accepting help must not cost the player their army.
  const standing = standingHostCount(state);
  // The doctrine the player set moves the target: a realm at arms keeps more hosts standing, a
  // counting house keeps fewer and spends the manpower on itself. Never below one — a realm with
  // no host at all cannot answer anything.
  const target = Math.max(1, targetArmyCount(lands.length) + doctrineHostBonus(state));
  if (standing + inFlight >= target) return false;

  // One muster at a time per land; bail early rather than spam a failing call.
  if (lands.some((land) => getRecruitmentOrder(state, land.id))) return false;

  if (state.ascent?.autoMusterSilently) return raiseHostNow(state);
  proposeMuster(state, underPressure(state) ? 'pressure' : 'target');
  return false;
}

/**
 * Puts the muster to the player instead of making it.
 *
 * The plan is `defaultMusterPlan` — the same sizing `raiseHostNow` uses, under the same free
 * commander — so what the card shows is what accepting it raises. Nothing is queued while a
 * card of this kind is already up or queued (`enqueueAscentPrompt` refuses a duplicate kind
 * anyway), while the player's refusal still stands, or when the plan could not be mustered as it
 * is: a card whose only answer is "you cannot afford this" is a toast with extra steps.
 */
export function proposeMuster(state: GameState, purpose: 'target' | 'pressure'): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  if (state.turn < (ascent.musterDeclinedUntil ?? 0)) return false;
  if (state.pendingAscentPrompt || ascent.promptQueue.length > 0) return false;
  // The pacing contract — which this was the only card in the mode to break.
  //
  // Every other scheduled decision is raised by `DecisionDirector`, which will not put one up
  // inside `COURT_GAP_TICKS` of the last. The muster is raised here instead, by the autopilot, and
  // had no such gate: "no card is up" is true again the instant the previous one is answered, so a
  // muster landed on the very next tick. `verify-ascent` asserts that scheduled cards never land on
  // consecutive ticks and named exactly one offender — `backToBackKinds: ["muster-proposal"]` — for
  // as long as the card has existed. Two decisions on two consecutive seasons is the thing the
  // whole gap rule exists to stop; a muster is in no more of a hurry than a law is.
  /**
   * **The gap is not negotiable, even for a realm with no host at all.**
   *
   * Tried and reverted: a one-season gap while hostless. It is the largest single cause of a
   * hostless realm staying hostless — 23 of 28 blocked ticks on one seeded run, 15 of 23 on
   * another — and relaxing it did lift host coverage at wave 3 from six seeds in eight to eight in
   * eight. It also put `muster-proposal` straight back into `verify-ascent`'s
   * `backToBackKinds`, which is the assertion this very clause was added to satisfy, and the
   * slideshow it describes is a reported complaint rather than a theoretical one.
   *
   * `COURT_GAP_TICKS` is already only two, so there is nothing to shave: two is the least that
   * can mean "not on consecutive ticks". The muster has to win its window the same way every other
   * card does. What was changed instead is everything that *wasted* the windows it did get — an
   * unaffordable plan, and a treasury spent out from under the card after it was quoted.
   */
  if (state.turn - ascent.lastPromptTurn < COURT_GAP_TICKS) return false;
  const plan = defaultMusterPlan(state);
  if (!plan.heroId || musterBlockedReason(state, plan)) return false;
  const estimate = getMusterEstimate(state, plan.soldiers);
  if (!estimate.land) return false;
  enqueueAscentPrompt(state, {
    kind: 'muster-proposal',
    heroId: plan.heroId,
    plan,
    landId: estimate.land.id,
    ticks: estimate.ticks,
    suppliesCost: estimate.suppliesCost,
    purpose,
    frontLandId: ascent.frontLandId,
  });
  return true;
}

/**
 * Musters one host from whatever the realm can spare, under its best free commander.
 *
 * Shared by the autopilot and by the Army screen's "Raise a host" button. Deliberately does
 * *not* check the target host count: the autopilot applies that gate itself before calling in,
 * while a player pressing the button has decided they want another host regardless — the whole
 * point of having the screen is to be able to overrule the automation.
 */
export function raiseHostNow(state: GameState): boolean {
  const commanderId = findFreeCommander(state);
  if (!commanderId) return false;

  const affordable = state.resources.humans - RECRUIT_HUMAN_RESERVE;
  if (affordable < MIN_ARMY_SOLDIERS) return false;

  // Muster with as much of a baggage train as the realm can actually spare — demanding a
  // full one up front makes `queueRecruitment` fail outright in a poor realm, so no host
  // ever gets raised at all. `autoResupply` tops it up over the following seasons.
  // Muster to what the granary can carry, not to what the muster rolls allow.
  //
  // A host mustered onto an empty granary is worse than no host at all. Measured over a full
  // run: with the realm at zero food this raised a full levy carrying *nothing*,
  // `progressArmyLogistics` starved it over the following seasons, the autopilot saw its
  // numbers fall under `REMNANT_SHARE` and raised another — a sawtooth (1400 → 276 → 1596 →
  // 365 …) that burned the population down and froze the realm at five provinces for a hundred
  // and thirty seasons.
  //
  // Capping the size rather than refusing the muster matters: refusing outright dropped
  // autopilot recruitment to *zero* for an entire run, which trades the sawtooth for a realm
  // that never fields an army at all. A small, fed host beats both.
  const spareFood = Math.max(0, Math.floor(state.resources.food - SUPPLY_FOOD_RESERVE));
  const rationsPerSoldier = (SUPPLY_TICKS_HELD / 100) * MIN_MUSTER_SUPPLY_SHARE;
  const soldiersTheFarmsCanFeed = Math.floor(spareFood / rationsPerSoldier);
  // ...and what the treasury can actually pay for. Since `MAX_ARMY_SOLDIERS` stopped being a cap,
  // `recruitSoldiers` is simply four fifths of the realm's people — which the autopilot would
  // happily try to muster and be refused for want of coin, every season, for ever.
  const soldiers = Math.min(recruitSoldiers(affordable), soldiersTheFarmsCanFeed, musterLimit(state));
  if (soldiers < MIN_ARMY_SOLDIERS) return false;

  const wantRations = Math.max(1, Math.ceil(soldiers / 100)) * SUPPLY_TICKS_HELD;
  const wantProvisions = Math.max(1, Math.ceil(soldiers / 150)) * SUPPLY_TICKS_HELD;
  const rations = Math.min(wantRations, spareFood);
  const provisions = Math.min(wantProvisions, Math.max(0, Math.floor(state.resources.supplies - SUPPLY_STORE_RESERVE)));
  const mustered = queueRecruitment(state, commanderId, soldiers, rations, provisions);
  // A realm putting men under arms is a realm its neighbours start watching. Charged only on a
  // muster that actually went through, and cheaply — `targetArmyCount` bounds the realm's
  // hosts, so this is a handful of points across a run rather than a second treadmill.
  if (mustered) chargeAmbition(state, 'host');
  return mustered;
}

/**
 * Walks a spare host onto neighbouring empty wilderness.
 *
 * The boundary between what the autopilot may take and what it may not is deliberate: nobody
 * lives here, nobody resists, and `progressMovementOrders` routes it to `occupyEmptyLand` with
 * no battle at all — so claiming it is bookkeeping, not a decision. Villages and rival-held
 * provinces are left alone entirely; those are the player's to take, and by which method.
 *
 * Without this the run stalls on empty ground it obviously wants; with it applied any wider,
 * the Conquer lane's choices would be made for the player before they saw them.
 */
function autoClaimWilderness(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent || ascent.frontLandId) return false;

  const idle = state.armies.filter(
    (army) =>
      army.kingdomId === PLAYER_KINGDOM_ID &&
      !army.isLevy &&
      isAutoHost(army) &&
      !army.refit &&
      !isPinnedByClaim(state, army) &&
      !state.movementOrders.some((order) => order.armyId === army.id) &&
      !state.siegeOrders.some((order) => order.armyId === army.id),
  );
  // Never the last host *while anything is on the map*: the capital falling ends the run. But a
  // realm with no invader in sight may walk its only host onto adjacent empty ground and back —
  // `tickAutoDefend` retargets it the moment a threat appears.
  //
  // The second clause exists because conquest hosts now strike the frontier rather than marching
  // to the seat, which keeps every host permanently busy defending: measured, `verify-ascent`'s
  // "autopilot marched" check went from passing to zero marches in a whole run. A realm that never
  // walks onto the empty ground beside it stops growing on the map, which is the most visible
  // thing the automation does.
  const hosts = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron).length;
  const invadersLive = (state.invasions?.length ?? 0) > 0;
  if (idle.length === 0 || (hosts < 2 && invadersLive)) return false;

  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const seen = new Set<string>();
  for (const land of owned) {
    for (const neighbourId of land.neighbors) {
      if (seen.has(neighbourId)) continue;
      seen.add(neighbourId);
      const neighbour = state.lands.find((candidate) => candidate.id === neighbourId);
      if (!neighbour) continue;
      if (neighbour.ownerId !== NEUTRAL_OWNER_ID || neighbour.hasVillage) continue;
      if (state.acquisitionOrders.some((order) => order.landId === neighbour.id)) continue;

      if (issueMoveOrder(state, idle[0].id, neighbour.id)) return true;
    }
  }
  return false;
}

/**
 * Buys the adjacent villages that are not decisions: certain to accept, and cheap enough
 * against the treasury that no player would ever say no.
 *
 * This extends the same rule `autoClaimWilderness` is built on — "nobody resists, so claiming
 * it is bookkeeping" — to the purchases that are equally foregone. It exists because the run's
 * expansion rate had become welded to its *prompt* rate: the Conquer card is the only way a
 * village is ever taken, so slowing prompts down for pacing (250 decisions a run was a
 * slideshow) also cut the realm from ~30 provinces to 6, and a map that never grows is the
 * clearest possible way to tell a player their choices are not adding up to anything.
 *
 * Both gates matter. `AUTO_CLAIM_MIN_CHANCE` keeps every risky claim on the player's card
 * where it belongs, and `AUTO_CLAIM_TREASURY_SHARE` keeps this from ever spending money the
 * player might need — which also, finally, gives a fat treasury somewhere to go.
 */
function autoPurchaseVillage(state: GameState): boolean {
  // Never while the realm is fighting for its life: coin belongs to the war then.
  if (underPressure(state)) return false;

  // A realm sitting on coin it has no use for buys land faster and pays more for it.
  //
  // The response card used to be the treasury's main outlet, but it now only appears for waves
  // that are genuinely in doubt — most are met and reported without asking — so on a strong run
  // the gold stopped going anywhere and banked to sixty-plus seasons of income again. Tying the
  // pace of routine expansion to the glut gives surplus somewhere to go without touching the
  // prices of anything the player chooses deliberately, and it switches itself off the moment
  // the treasury is no longer embarrassing.
  const rates = state.resourceRates;
  const glutted = rates.gold > 0 && state.resources.gold > rates.gold * GOLD_GLUT_SEASONS;
  const interval = Math.max(2, Math.round(
    (glutted ? Math.max(2, AUTO_CLAIM_INTERVAL_TICKS / 2) : AUTO_CLAIM_INTERVAL_TICKS)
    * doctrineClaimIntervalMult(state),
  ));
  const share = glutted ? AUTO_CLAIM_TREASURY_SHARE * 2 : AUTO_CLAIM_TREASURY_SHARE;

  if (state.turn % interval !== 0) return false;

  // The autopilot yields its slot to the player.
  //
  // Claims are now capped — one at a time by default (`getClaimSlots`) — and the autopilot draws
  // from the same pool. Left to race, it would take the realm's only claim party every twelve
  // ticks and the player would find the Conquer lane permanently greyed out by their own
  // administration. So it expands only into slack the player is not using: never while a claim of
  // theirs is running, and never into the last free slot's worth of room.
  if (getPlayerClaimCount(state) > 0) return false;
  if (!canStartClaim(state)) return false;
  // Its own ceiling still applies on top, so a widened cap does not hand the whole gain to the AI.
  if (getPlayerClaimCount(state) >= AUTO_CLAIM_MAX_ORDERS) return false;

  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const ownedIds = new Set(owned.map((land) => land.id));
  const seen = new Set<string>();
  const candidates: Land[] = [];

  for (const land of owned) {
    for (const neighbourId of land.neighbors) {
      if (seen.has(neighbourId) || ownedIds.has(neighbourId)) continue;
      seen.add(neighbourId);
      const neighbour = state.lands.find((candidate) => candidate.id === neighbourId);
      if (!neighbour || neighbour.ownerId !== NEUTRAL_OWNER_ID || !neighbour.hasVillage) continue;
      if (state.acquisitionOrders.some((order) => order.landId === neighbour.id)) continue;
      candidates.push(neighbour);
    }
  }

  // Cheapest first, so the treasury share buys as much ground as it can.
  candidates.sort((a, b) => getGoldBribeCost(state, a) - getGoldBribeCost(state, b));
  for (const land of candidates) {
    const cost = getGoldBribeCost(state, land);
    if (cost > state.resources.gold * share) continue;
    if (getBribeSuccessChance(state, land) < AUTO_CLAIM_MIN_CHANCE) continue;
    // Asked, not taken. Only the first affordable province is ever put up — a proposal the
    // pacing gates turn down is the whole tick's answer, because the next candidate would meet
    // exactly the same gates.
    if (!state.ascent?.autoClaimSilently) return proposeClaim(state, land);
    if (bribeLand(state, land.id)) return true;
  }
  return false;
}

/**
 * Puts the routine claim to the player instead of making it.
 *
 * A province appearing in the realm unannounced is the same complaint the muster card was built
 * to answer — see `proposeMuster`, whose gates this mirrors — and it is worse here, because a
 * claim also spends the realm's one claim slot and the gold in the treasury. So the default is
 * that the court points at the province and the player decides; `autoClaimSilently` hands routine
 * expansion back, from the Build screen where the slot it spends is already on show.
 *
 * The sheet raised is the *existing* method sheet, not a yes/no on the bribe the autopilot had in
 * mind. It costs no new card and it is a better question: the player sees every way into that
 * province, priced, and can send an envoy where the court would have spent coin. Leaving it by
 * the Back button is a real answer, and `CLAIM_DECLINE_TICKS` makes it stick.
 */
export function proposeClaim(state: GameState, land: Land): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  if (state.turn < (ascent.claimDeclinedUntil ?? 0)) return false;
  if (state.pendingAscentPrompt || ascent.promptQueue.length > 0) return false;
  // The pacing contract. Routine expansion must not be the reason two cards land on two
  // consecutive seasons — that is the slideshow `COURT_GAP_TICKS` exists to stop, and the muster
  // card cost a release for breaking it.
  if (state.turn - ascent.lastPromptTurn < COURT_GAP_TICKS) return false;
  return offerConquestMethods(state, land.id);
}

/**
 * Marches idle hosts at the front the *player* designated. `progressMovementOrders` runs the
 * arrival battle and pushes the siege by itself, so this is the whole of the offensive loop —
 * there is no new combat code anywhere in this mode.
 */
function autoMarch(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  ascent.frontBlocked = false;

  // The seat of the dynasty comes before any front. Losing it starts a short clock
  // (`CAPITAL_GRACE_TICKS`); a realm holding twenty provinces and ten thousand gold used to
  // sit out that clock with every host idle, because nothing told the autopilot to go back.
  const capital = state.lands.find((land) => land.id === ascent.capitalLandId);
  const capitalLost = Boolean(capital && capital.ownerId !== PLAYER_KINGDOM_ID);
  if (capitalLost && capital) {
    ascent.frontLandId = capital.id;
  }
  if (!ascent.frontLandId) return false;

  const front = state.lands.find((land) => land.id === ascent.frontLandId);
  if (!front || front.ownerId === PLAYER_KINGDOM_ID) {
    // The front fell (or was taken some other way) — clear it so a new March Order is asked for.
    ascent.frontLandId = undefined;
    return false;
  }

  // A general will not throw the host at walls it cannot break. Holding here is what makes
  // the power curve the thing that opens the map: keep compounding and the odds come to you.
  // Not for the seat itself: with the dynasty's clock running, the host goes whatever the odds.
  if (!capitalLost && frontWinChance(state) < MARCH_MIN_WIN_CHANCE) {
    ascent.frontBlocked = true;
    return false;
  }

  const idle = state.armies.filter(
    (army) =>
      army.kingdomId === PLAYER_KINGDOM_ID &&
      !army.isLevy &&
      // Only the hosts left to the autopilot: a host under the player's own standing order is
      // moved by that order and nothing else (see `StandingOrders`) — and a host mid-refit is
      // nobody's to march at all.
      isAutoHost(army) &&
      !army.refit &&
      !isPinnedByClaim(state, army) &&
      !state.movementOrders.some((order) => order.armyId === army.id) &&
      !state.siegeOrders.some((order) => order.armyId === army.id),
  );
  if (idle.length === 0) return false;

  // Always leave one host at home once there are two to split. The capital falling ends
  // the run, so committing the last defender to an offensive is never worth the ground —
  // unless the capital *is* the front, when everything marches.
  const garrisonKeep = idle.length > 1 && !capitalLost ? 1 : 0;
  const marchers = idle.slice(0, Math.max(1, idle.length - garrisonKeep));

  let marched = false;
  for (const army of marchers) {
    if (issueMoveOrder(state, army.id, front.id)) {
      marched = true;
    }
  }

  // No host could find a route — the realm's territory no longer connects to this front
  // (a province between here and there changed hands). Flag it so a fresh March Order is
  // raised; otherwise the run stays pinned on an unreachable target forever, quietly
  // stops expanding, and the player is never told why.
  if (!marched) {
    ascent.frontBlocked = true;
  }
  return marched;
}

/**
 * Keeps hosts fed.
 *
 * `queueRecruitment` hands an army a one-off stock of rations and provisions and nothing in
 * the game ever tops it up — in the hand-played modes an army is a short campaign, not a
 * standing force. An endless run cannot work that way: without this the host starves inside
 * ten ticks, attrition shreds it, and the realm loses every province it just took.
 *
 * Resupplying here also gives the economy pillar a direct line to the military one: food and
 * supply income is what keeps hosts in the field, so an economy card really does buy war.
 */
function autoResupply(state: GameState): void {
  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;

    const total = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
    if (total <= 0) continue;

    // Mirrors the burn rate in `progressArmyLogistics`.
    const rationUse = Math.max(1, Math.ceil(total / 100));
    const provisionUse = Math.max(1, Math.ceil(total / 150));
    const wantRations = rationUse * SUPPLY_TICKS_HELD;
    const wantProvisions = provisionUse * SUPPLY_TICKS_HELD;

    const foodShort = Math.max(0, wantRations - army.rations);
    const suppliesShort = Math.max(0, wantProvisions - army.provisions);
    if (foodShort <= 0 && suppliesShort <= 0) continue;

    // Never resupply into famine: the realm's own stores come first.
    //
    // Deliberately flat, and deliberately *not* waived for a host that has run out. Feeding a
    // starving host out of the last of the granary was tried and it is the wrong shape: the
    // reserve is the autopilot's discipline, and dipping below it is the player's own lever —
    // `resupplyHost`, which `verify-ascent` pins in as many words ("resupply reaches below the
    // autopilot reserve"). Taking that decision automatically removes the one move a player has
    // when the stores are low, so what a starving host needs is not a quiet top-up but to be
    // *told* — see the warning in `progressArmyLogistics`.
    const food = Math.min(foodShort, Math.max(0, state.resources.food - SUPPLY_FOOD_RESERVE));
    const supplies = Math.min(suppliesShort, Math.max(0, state.resources.supplies - SUPPLY_STORE_RESERVE));
    if (food <= 0 && supplies <= 0) continue;

    applyResourceDelta(state, { food: -food, supplies: -supplies });
    army.rations += food;
    army.provisions += supplies;
  }
}

/**
 * Splits the roster into an offensive host and home defenders.
 *
 * Hosts marching on the front or holding a siege are explicitly NOT put under auto-command:
 * `tickAutoDefend` re-targets any idle auto-command army at the nearest threatened district,
 * which otherwise yanks the attacking host home the moment it arrives and sends it
 * ping-ponging between the front and the capital forever, conquering nothing.
 *
 * Everything else holds full command so raids get intercepted with no player input. The
 * `pendingBattle` safety net in the tick covers the offensive host, whose battles would
 * otherwise raise an empire-mode modal this mode does not render.
 */
function autoDefend(state: GameState): void {
  // A garrison levy is not a host: it fights the one battle it was raised for and goes home.
  // And a commanded host is not the autopilot's to intercept with: `setArmyOrders` clears its
  // flag once and it is left alone here.
  const mine = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && isAutoHost(army));

  // While a front is set, the strongest host stays committed to it even between orders.
  // Deciding purely from live orders leaves it briefly idle on arrival, which is all
  // `tickAutoDefend` needs to drag it home — and the two then trade it back and forth
  // every tick while the campaign goes nowhere.
  const spearhead = state.ascent?.frontLandId
    ? mine.slice().sort((a, b) => armySize(b) - armySize(a))[0]?.id
    : undefined;

  for (const army of mine) {
    const onOffensive =
      army.id === spearhead ||
      state.movementOrders.some((order) => order.armyId === army.id) ||
      state.siegeOrders.some((order) => order.armyId === army.id);
    army.autoDefend = !onOffensive;
  }
}

export function tickAscentAutopilot(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  // Hands-on rule (tự tay cai trị): the hosts still hold their own ground, and nothing else moves without an order.
  if (ascent.hardcore) {
    autoDefend(state);
    return;
  }

  autoDisbandRemnants(state);
  autoTrimPayroll(state);

  if (autoRecruit(state)) {
    ascent.autopilotStats.recruits += 1;
  }

  // Building spends gold that a reroll might want, so leave a small float — and never the
  // wages: while the books run red the reserve covers eight seasons of the deficit, and at any
  // time four seasons of the roster's and the hosts' pay. Measured before this, the autopilot
  // spent the treasury on mines while the royal host went unpaid and dissolved at turn twenty.
  const wageBill = heroPayroll(state) + ascentArmyUpkeep(state).gold + getTotalArmyGoldUpkeepAscent(state);
  // The flat reserve is a minimum host at the founding's prices; it wears the realm's price
  // scale so a rich realm's autopilot does not build down to a float that no longer buys one.
  // The income scale alone: a reserve that grew with the hoard would be the hoard defending
  // itself against being spent.
  const buildReserve = Math.max(AUTOBUILD_GOLD_RESERVE * realmIncomeScale(state), -state.resourceRates.gold * 8, wageBill * 4);
  /**
   * **Nothing is bought while a muster card is standing.**
   *
   * `autoRecruit` runs first and *proposes* — the card is queued, and it quotes a price. Building
   * runs next, in the same tick, and spends whatever is above the reserve. So the autopilot was
   * routinely pricing a host, spending the treasury on a granary, and then failing the muster on
   * accept — which also bought four seasons of `musterDeclinedUntil` silence for a card the player
   * had said yes to.
   *
   * Measured across eight seeded runs: after the plan itself was made affordable, this was the
   * remaining cause of a hostless realm staying hostless — twelve to fourteen of the blocked ticks
   * on the two worst seeds were that silence.
   *
   * A quoted price the realm can no longer pay is the worst of both: the card was a lie and the
   * seasons are gone. The host is the more important purchase in every case where both are
   * possible, so the buildings wait a season.
   */
  const musterStanding = state.pendingAscentPrompt?.kind === 'muster-proposal'
    || ascent.promptQueue.some((prompt) => prompt.kind === 'muster-proposal');
  if (!musterStanding && state.resources.gold > buildReserve) {
    if (autoBuild(state)) {
      ascent.autopilotStats.builds += 1;
    } else if (autoUpgrade(state)) {
      ascent.autopilotStats.upgrades += 1;
    }
  }

  autoResupply(state);
  // Grain and goods that would rot go to market. Only the stock above the waste line, so the
  // player's own once-a-season sale is never spent on stores they meant to keep.
  autoSellWaste(state);

  // The player's standing order first; free ground only when there is no front to press.
  if (autoMarch(state) || autoClaimWilderness(state)) {
    ascent.autopilotStats.marches += 1;
  }

  // Routine purchases need no host, so they are not part of the march chain above.
  // A village is bought with the same gold the standing muster card was priced against — see
  // the note on `musterStanding` above. Buying one out from under a quoted host is the same
  // fault as building one, and costs the same four seasons of silence when the muster then fails.
  if (!musterStanding) autoPurchaseVillage(state);

  autoDefend(state);
}
