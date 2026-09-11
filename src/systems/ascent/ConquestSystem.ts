import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  CONQUEST_GARRISON_SHARE,
  CLAIM_DECLINE_TICKS,
  MARCH_HOLD_TICKS,
  MARCH_REPROMPT_TICKS,
  REFUGEE_SHARE,
  XP_PER_LAND_TAKEN,
} from '../../game/ascentConfig';
import {
  bribeLand,
  claimBlockedReason,
  getBribeSuccessChance,
  getClaimBarSeasons,
  getDiplomacySuppliesCost,
  getDiplomacyThreshold,
  getGoldBribeCost,
  getLandTrust,
  getNoblePower,
  getSettleHumansCost,
  getSettleTicks,
  settleLand,
  startDiplomaticClaim,
  startIntimidation,
} from '../AcquisitionSystem';
import { findLand, getAcquisitionOrder, getSiegeOrder } from '../LandSystem';
import { armyPower, createBattlePreview, findLandPath, issueMoveOrder } from '../WarSystem';
import { enqueueAscentPrompt } from './AscentState';
import { chargeAmbition } from './AmbitionSystem';
import { isAutoHost } from './armyOrders';
import { hostOrderRefusal, setArmyOrders } from './StandingOrders';
import { releaseHeroAssignment } from '../CourtSystem';
import { pushToast } from '../empire/notifications';
import { applyResourceDelta, getLandAptitude, militiaCapacity, refreshAllLandOutputs } from '../ResourceSystem';
import { addAscentXp, landGarrisonPower } from './PowerSystem';
import { heroName, t } from '../../i18n';
import type {
  Army,
  AscentConquestMethod,
  AscentLaneState,
  ConquestMethodOption,
  ConquestTarget,
  GameState,
  Hero,
  Land,
} from '../../state/types';

const CONQUEST_METHODS: AscentConquestMethod[] = ['bribe', 'diplomacy', 'intimidation', 'settle', 'occupy', 'siege'];

/** How many provinces to offer. Enough for a real choice, few enough to read at a glance. */
const MAX_CONQUEST_TARGETS = 4;

export function ensureAscentLaneState(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  ascent.laneState ??= { conquer: 'ready', court: 'ready', world: 'ready', lastDecisionTurn: {} };
  ascent.laneState.lastDecisionTurn ??= {};
  ascent.conquestPlans ??= [];
  // Old saves predate the claim ledger; an absent record simply means nobody has been refused yet.
  ascent.claimAttempts ??= {};
  ascent.decisionPressure ??= 0;
  ascent.idleTicks ??= 0;
  ascent.promptCooldowns ??= {};
  ascent.promptWaiting ??= {};
  ascent.famineCooldown ??= 0;
  ascent.autoResolveBattles ??= false;
  ascent.autoClaimSilently ??= false;
  ascent.lastWatchedWave ??= -1;
  ascent.drawnCourtCards ??= [];
  ascent.lastPromptTurn ??= 0;
  ascent.courtCardCooldown ??= 3;
  ascent.defenceSamples ??= [];
  ascent.raidCooldown ??= 0;
  ascent.tributeCooldown ??= 0;
  ascent.coalitionCooldownTicks ??= 0;
  ascent.vassalCooldown ??= 0;
  ascent.coalitionPending ??= false;
  ascent.reservedHeroIds ??= [];
  ascent.reserveSeatMark ??= 0;
  ascent.laneStats ??= {
    conquestsByMethod: emptyMethodTally(),
    appointments: 0,
    edictsEnacted: 0,
    parliamentAnswered: 0,
    envoyActions: {},
  };
  ascent.laneStats.conquestsByMethod ??= emptyMethodTally();
  for (const method of CONQUEST_METHODS) {
    ascent.laneStats.conquestsByMethod[method] ??= 0;
  }
  ascent.laneStats.appointments ??= 0;
  ascent.laneStats.edictsEnacted ??= 0;
  ascent.laneStats.parliamentAnswered ??= 0;
  ascent.laneStats.envoyActions ??= {};
}

function emptyMethodTally(): Record<AscentConquestMethod, number> {
  return Object.fromEntries(CONQUEST_METHODS.map((method) => [method, 0])) as Record<AscentConquestMethod, number>;
}

// ── Lane status ─────────────────────────────────────────────────────────────

export function refreshAscentLaneState(state: GameState): AscentLaneState | undefined {
  const ascent = state.ascent;
  if (!ascent) return undefined;
  ensureAscentLaneState(state);

  const claiming = state.acquisitionOrders.some((order) => order.buyerId === PLAYER_KINGDOM_ID)
    || state.siegeOrders.some((order) => order.attackerKingdomId === PLAYER_KINGDOM_ID);
  const targets = buildConquestTargets(state);
  ascent.laneState.conquer = claiming
    ? 'busy'
    : targets.some((target) => target.methods.some((method) => !method.blockedReason))
      ? 'ready'
      : 'blocked';

  // The court is "ready" when a decision is genuinely waiting: an unposted hero, an unspent
  // edict point, or a court that is about to speak. Alert when stability is sliding.
  const unposted = state.heroes.some((hero) => !hero.assignedTo);
  const edictPoints = state.mandate?.edictPoints ?? 0;
  ascent.laneState.court = state.court.stability < 35
    ? 'alert'
    : unposted || edictPoints > 0
      ? 'ready'
      : 'busy';

  const capital = state.lands.find((land) => land.id === ascent.capitalLandId);
  const capitalLost = Boolean(capital && capital.ownerId !== PLAYER_KINGDOM_ID);
  const ratio = ascent.defensePower > 0 ? ascent.threat / ascent.defensePower : 99;
  ascent.laneState.world = capitalLost || ratio >= 1.1
    ? 'alert'
    : state.invasions?.length
      ? 'busy'
      : 'ready';

  const pressureLanes = ['conquer', 'court', 'world'] as const;
  const anyReady = pressureLanes
    .some((lane) => ascent.laneState[lane] === 'ready' || ascent.laneState[lane] === 'alert');
  const anyBusy = Boolean(claiming || state.buildOrders.length || state.movementOrders.length || state.invasions?.length);
  ascent.idleTicks = anyReady || anyBusy ? 0 : ascent.idleTicks + 1;
  ascent.decisionPressure = anyReady || anyBusy
    ? Math.max(0, ascent.decisionPressure - 1)
    : ascent.decisionPressure + 1;

  return ascent.laneState;
}

// ── Targets ─────────────────────────────────────────────────────────────────

/**
 * Every province bordering the realm, each carrying the full menu of ways to take it.
 *
 * Ordering puts takeable provinces first, then the best odds — a list that led with an
 * unreachable fortress would read as "there is nothing to do here".
 */
export function buildConquestTargets(state: GameState): ConquestTarget[] {
  return buildAllConquestTargets(state).slice(0, MAX_CONQUEST_TARGETS);
}

/**
 * Every province on the realm's border — each neighbour of owned ground that is not ours —
 * takeable first, then by odds. The card prompt shows the top few (`buildConquestTargets`);
 * the claim list on the Build lane shows all of them, because a border a player is scrolling
 * is a map, not a hand of cards, and a province left off it simply did not exist to them.
 */
export function buildAllConquestTargets(state: GameState): ConquestTarget[] {
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const seen = new Set<string>();
  const targets: ConquestTarget[] = [];

  for (const land of owned) {
    for (const neighborId of land.neighbors) {
      if (seen.has(neighborId)) continue;
      seen.add(neighborId);
      const candidate = state.lands.find((item) => item.id === neighborId);
      if (!candidate || candidate.ownerId === PLAYER_KINGDOM_ID) continue;
      targets.push(buildConquestTarget(state, candidate));
    }
  }

  return targets.sort((a, b) => {
    const aOpen = a.methods.some((method) => !method.blockedReason) ? 0 : 1;
    const bOpen = b.methods.some((method) => !method.blockedReason) ? 0 : 1;
    return aOpen - bOpen || b.bestChance - a.bestChance || a.garrison - b.garrison;
  });
}

/** The full menu for one province, whether or not it is currently on the prompt. */
export function buildConquestTarget(state: GameState, land: Land): ConquestTarget {
  const methods = buildMethodOptions(state, land);
  const open = methods.filter((method) => !method.blockedReason);
  const busy = getAcquisitionOrder(state, land.id)
    ? t('ascent.conquer.busyClaim')
    : getSiegeOrder(state, land.id)
      ? t('ascent.conquer.busySiege')
      : undefined;

  return {
    landId: land.id,
    landName: land.name,
    landKind: land.ownerId !== NEUTRAL_OWNER_ID ? 'rival' : land.hasVillage ? 'village' : 'wilderness',
    ownerName: state.kingdoms.find((kingdom) => kingdom.id === land.ownerId)?.name,
    garrison: Math.round(landGarrisonPower(state, land)),
    rewardTag: rewardTag(land),
    suits: landSuits(land),
    bestChance: open.reduce((best, method) => Math.max(best, method.chance), 0),
    hasCertainMethod: open.some((method) => method.chance >= 100),
    methods,
    busyReason: busy,
  };
}

/**
 * Builds one card per acquisition path the province admits.
 *
 * Methods the province cannot ever admit (bribing empty wilderness, settling a walled town)
 * are omitted entirely; methods it admits but the realm cannot currently afford or staff come
 * through with a `blockedReason` and render greyed. That distinction is the whole teaching
 * surface of this mode: the player sees *why* an option is shut, and what would open it.
 */
export function buildMethodOptions(state: GameState, land: Land): ConquestMethodOption[] {
  const busy = getAcquisitionOrder(state, land.id)
    ? t('ascent.conquer.busyClaim')
    : getSiegeOrder(state, land.id)
      ? t('ascent.conquer.busySiege')
      : undefined;

  const options: ConquestMethodOption[] = [];
  const neutral = land.ownerId === NEUTRAL_OWNER_ID;

  if (neutral && land.hasVillage) {
    options.push(bribeOption(state, land));
    options.push(diplomacyOption(state, land));
    options.push(intimidationOption(state, land));
  }

  if (neutral && !land.hasVillage) {
    options.push(settleOption(state, land));
    options.push(occupyOption(state, land));
  }

  // Force is always on the table for a settled province, and the only path to a rival's.
  if (!neutral || land.hasVillage) {
    options.push(siegeOption(state, land));
  }

  if (busy) {
    for (const option of options) option.blockedReason ??= busy;
  }

  // Every method that files an acquisition order competes for the realm's claim parties. Siege and
  // occupation do not: one is a host reducing a province, the other a host walking onto empty
  // ground, and neither ties up an envoy. Shown greyed with the reason rather than hidden, which is
  // this file's standing contract — see the note on `buildMethodOptions` above.
  const claimBlocked = claimBlockedReason(state);
  if (claimBlocked) {
    for (const option of options) {
      if (CLAIM_METHODS.has(option.method)) option.blockedReason ??= claimBlocked;
    }
  }
  return options;
}

/** How many past conquest attempts are worth keeping. Only the last few are ever read. */
const CONQUEST_PLAN_HISTORY = 40;

/**
 * The methods that occupy one of the realm's claim slots.
 *
 * Exported so the map's province card can grey the same rows the sheet greys. Two readings of
 * "is this a claim?" in two files is how the cap came to block the Build lane and not the map.
 */
export const CLAIM_METHODS: ReadonlySet<string> = new Set(['bribe', 'diplomacy', 'intimidation', 'settle']);

function bribeOption(state: GameState, land: Land): ConquestMethodOption {
  const cost = getGoldBribeCost(state, land);
  const chance = Math.round(getBribeSuccessChance(state, land) * 100);
  const barred = getClaimBarSeasons(state, land.id);
  return {
    method: 'bribe',
    cost: { gold: cost },
    ticks: 1,
    loyalty: 68,
    chance,
    // Barred first: a province that has refused the crown enough times will not discuss money
    // at all, and saying "you cannot afford it" about an offer nobody will hear is the wrong
    // sentence. Only coin is shut — the envoy, the threat and the host are all still on the sheet.
    blockedReason: barred > 0
      ? t('ascent.conquer.coinRefused', { n: barred })
      // The gold is spent before the roll and is lost on refusal, so an unaffordable bribe is a
      // hard block rather than a gamble the player can talk themselves into.
      : state.resources.gold < cost
        ? t('ascent.conquer.needGold', { cost, have: Math.floor(state.resources.gold) })
        : undefined,
  };
}

function diplomacyOption(state: GameState, land: Land): ConquestMethodOption {
  const cost = getDiplomacySuppliesCost(state, land);
  const hero = bestDiplomat(state);
  const trust = getLandTrust(land, PLAYER_KINGDOM_ID);
  const threshold = getDiplomacyThreshold(land);
  const gain = Math.max(0.5, 1 + (hero?.stats.administration ?? 0) * 0.03);

  return {
    method: 'diplomacy',
    cost: { supplies: cost },
    ticks: Math.max(1, Math.ceil((threshold - trust) / gain)),
    loyalty: 85,
    // Diplomacy cannot fail once started — it only takes time — so the "chance" it shows is
    // how far along the trust already is, which is what actually varies between provinces.
    chance: Math.round(Math.min(99, Math.max(20, (trust / Math.max(1, threshold)) * 100))),
    heroId: hero?.id,
    blockedReason: !hero
      ? t('ascent.conquer.needHero')
      : state.resources.supplies < cost
        ? t('ascent.conquer.needSupplies', { cost, have: Math.floor(state.resources.supplies) })
        : undefined,
  };
}

function intimidationOption(state: GameState, land: Land): ConquestMethodOption {
  const army = bestAdjacentOwnedArmy(state, land);
  const power = army ? armyPower(state, army) : 0;
  const needed = Math.max(1, land.localSoldiers * 0.5);
  return {
    method: 'intimidation',
    ticks: army ? Math.max(1, Math.ceil(100 / Math.max(1, power / Math.max(1, land.localSoldiers * 4)))) : 0,
    loyalty: 50,
    chance: 100,
    armyId: army?.id,
    blockedReason: !army
      ? t('ascent.conquer.needBorderHost')
      : power < needed
        ? t('ascent.conquer.hostTooWeak')
        : undefined,
  };
}

function settleOption(state: GameState, land: Land): ConquestMethodOption {
  const cost = getSettleHumansCost(state, land);
  return {
    method: 'settle',
    cost: { humans: cost },
    ticks: getSettleTicks(state, land),
    loyalty: 65,
    chance: 100,
    blockedReason: state.resources.humans < cost
      ? t('ascent.conquer.needHumans', { cost, have: Math.floor(state.resources.humans) })
      : undefined,
  };
}

function occupyOption(state: GameState, land: Land): ConquestMethodOption {
  const army = bestReachableArmy(state, land);
  return {
    method: 'occupy',
    ticks: 1,
    loyalty: 55,
    chance: 100,
    armyId: army?.id,
    blockedReason: army ? undefined : noHostReason(state),
  };
}

function siegeOption(state: GameState, land: Land): ConquestMethodOption {
  const { chance, armyId } = bestBattle(state, land);
  return {
    method: 'siege',
    ticks: 3,
    loyalty: 45,
    chance,
    armyId,
    blockedReason: !armyId ? noHostReason(state) : undefined,
  };
}

/**
 * Why no host can carry a military method out — told apart from *having* no host.
 *
 * "The realm needs a host" is the wrong sentence to a player who is looking at two of them, and
 * it was the one the sheet used whenever the ones they had were busy: an auxiliary answering its
 * patron, a levy on its own walls, a column mid-refit. The distinction is the whole difference
 * between "go and raise an army" and "wait four seasons".
 */
function noHostReason(state: GameState): string {
  const owned = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
  return owned.length > 0 ? t('ascent.conquer.noHostFree') : t('ascent.conquer.needHost');
}

// ── Execution ───────────────────────────────────────────────────────────────

/** What came of one attempt: whether it was made, whether it took, and why it did not. */
export interface ConquestAttempt {
  /** The attempt was made. The prompt is answered either way — see the note on failure below. */
  attempted: boolean;
  /** It took. When false the province is no closer to being yours, and may have cost you. */
  ok: boolean;
  /** Why it did not take, phrased for the player. Only set when the attempt fell short. */
  reason?: string;
}

/**
 * Commits to one method against one province, through the same public APIs the classic
 * modes use. Every branch is an existing function — this mode adds no conquest maths.
 *
 * Whether the attempt was *made* is not the same as whether it worked. A refused bribe has
 * already spent the gold (`bribeLand` pays before it rolls), so reporting that as "not handled"
 * would leave the card open and hand the player unlimited free retries on a purchase they
 * already made.
 *
 * But the two used to collapse into one `true` on the way out, and the caller had no way to
 * tell them apart. The outcome went to `state.message` and to the conquest plan's `status`,
 * and this mode reads neither — so a bribe the nobles refused looked exactly like a tap that
 * did not register: the sheet closed, the gold was gone, and nothing was underway. The reason
 * is returned now, so the caller can put it in front of the player.
 */
/** Who a method should commit, when the player has chosen rather than left it to the sheet. */
export interface ConquestActor {
  heroId?: string;
  armyId?: string;
  /** Storm below the odds gate the autopilot keeps. */
  force?: boolean;
}

export function executeConquestMethod(
  state: GameState,
  landId: string,
  method: AscentConquestMethod,
  actor?: ConquestActor,
): ConquestAttempt {
  const ascent = state.ascent;
  const land = findLand(state, landId);
  if (!ascent || !land) return { attempted: false, ok: false };
  ensureAscentLaneState(state);

  // The method sheet only ever offers methods this province admits, so an attempt that gets
  // this far is legitimate even when the dice go against it.
  const option = buildMethodOptions(state, land).find((candidate) => candidate.method === method);
  if (!option || option.blockedReason) {
    return { attempted: false, ok: false, reason: option?.blockedReason };
  }

  // `state.message` is the only channel the acquisition systems report a refusal through, and
  // it is a single slot that nothing clears. Remembering what was in it lets a refusal that
  // wrote nothing — a march with no host free to take the order writes nothing — be told apart
  // from one that did, instead of serving last season's news as this attempt's reason.
  const messageBefore = state.message;
  let ok = false;
  /**
   * The refusal this attempt knows about, named by the branch that hit it.
   *
   * The fallback below reads `state.message` and compares it with what was there before, which
   * cannot tell "wrote the same thing again" from "wrote nothing". A host that refuses twice
   * writes the identical message twice, so the second tap fell through to "that came to nothing"
   * — measured on the real sheet: the true reason once, then nothing useful for as long as the
   * player kept pressing. A branch that knows why says so here instead of leaving it to be
   * inferred.
   */
  let refusal: string | undefined;
  switch (method) {
    case 'bribe':
      ok = bribeLand(state, landId);
      break;
    case 'diplomacy': {
      const hero = (actor?.heroId ? state.heroes.find((candidate) => candidate.id === actor.heroId) : undefined)
        ?? bestDiplomat(state);
      // A seated minister may ride as envoy, but the claim refuses anyone still posted — so the
      // seat is vacated first. (`bestDiplomat` has offered ministers for as long as it has
      // existed, and every one of those attempts came to nothing for exactly this reason.)
      if (hero && hero.assignedTo && !state.armies.some((army) => army.id === hero.assignedTo)) {
        const wasGovernor = state.lands.some((candidate) => candidate.id === hero.assignedTo);
        releaseHeroAssignment(state, hero);
        if (wasGovernor) refreshAllLandOutputs(state);
      }
      ok = Boolean(hero && startDiplomaticClaim(state, landId, hero.id));
      break;
    }
    case 'intimidation': {
      const army = (actor?.armyId ? state.armies.find((candidate) => candidate.id === actor.armyId) : undefined)
        ?? bestAdjacentOwnedArmy(state, land);
      ok = Boolean(army && startIntimidation(state, landId, army.id));
      break;
    }
    case 'settle':
      ok = settleLand(state, landId);
      break;
    case 'occupy':
    case 'siege':
      if (actor?.armyId) {
        // The player named the host: it takes the standing order to attack, which marches it
        // (through owned ground) and storms once the odds clear — or at once, when forced.
        //
        // Asked before the order is given, not inferred from the message afterwards. This is the
        // same question `buildHostPickerRows` greys the row on, so the two cannot disagree about
        // whether the tap was ever going to work.
        refusal = hostOrderRefusal(state, actor.armyId);
        ok = !refusal && setArmyOrders(state, actor.armyId, { kind: 'attack', landId, force: actor.force });
      } else {
        ok = marchBestHostToTarget(state, landId);
      }
      // The sheet offered this because *some* host could reach the province; the march declines
      // when every one of them is already committed elsewhere. Two different questions, so the
      // option's own `blockedReason` cannot answer this one.
      if (!ok) refusal ??= t('ascent.conquer.noHostFree');
      break;
  }

  const reason = ok
    ? undefined
    : refusal
      ?? (state.message && state.message !== messageBefore
        ? state.message
        : t('ascent.conquer.cameToNothing'));

  ascent.conquestPlans.push({
    id: `asc-conquest-${state.turn}-${landId}-${method}`,
    landId,
    method,
    createdTurn: state.turn,
    status: ok ? 'executing' : 'blocked',
    reason,
  });
  // One entry per attempt, and nothing ever read more than the last handful — `main.ts` slices
  // the final five for the text renderer and that is the only consumer. Left unbounded it rode
  // into `localStorage` on every save (`normalizeSnapshotState` structuredClones the whole state),
  // so a long run's refused taps quietly ate the save quota. Keep a readable tail, drop the rest.
  if (ascent.conquestPlans.length > CONQUEST_PLAN_HISTORY) {
    ascent.conquestPlans = ascent.conquestPlans.slice(-CONQUEST_PLAN_HISTORY);
  }
  ascent.laneState.lastDecisionTurn.conquer = state.turn;

  if (ok) {
    ascent.laneStats.conquestsByMethod[method] += 1;
    // Only a military method sets the front: that is what the autopilot marches at. A bribe
    // or a claim resolves on its own clock and must not pull hosts off their current front.
    if (method === 'occupy' || method === 'siege') {
      ascent.frontLandId = landId;
      ascent.frontBlocked = false;
    }
  }
  // Quiet period either way — a refused bribe should not re-open the same card next tick.
  ascent.marchCooldown = MARCH_REPROMPT_TICKS;
  return { attempted: true, ok, reason };
}

/** Declines to advance; the autopilot consolidates instead, and stays quiet for a while. */
export function holdConquest(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.frontBlocked = false;
  ascent.frontLandId = undefined;
  ascent.marchCooldown = MARCH_HOLD_TICKS;
  // A realm that has just said "not yet" to taking ground must not be shown the court's own
  // claim proposal on the next tick. `marchCooldown` governs the march; this governs the ask.
  ascent.claimDeclinedUntil = state.turn + CLAIM_DECLINE_TICKS;
  ascent.laneState.lastDecisionTurn.conquer = state.turn;
}

/** Raises the province prompt. No-op when there is nothing conquerable to offer. */
export function offerConquestPrompt(state: GameState): boolean {
  const targets = buildConquestTargets(state);
  if (targets.length === 0) return false;
  enqueueAscentPrompt(state, { kind: 'conquer-target', targets });
  return true;
}

/** Raises the method sheet for one province — from the prompt, or from a map tap. */
export function offerConquestMethods(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId === PLAYER_KINGDOM_ID) return false;
  const target = buildConquestTarget(state, land);
  if (target.methods.length === 0) return false;
  enqueueAscentPrompt(state, { kind: 'conquer-method', target });
  return true;
}

/** Best odds any current host has against the standing front. 0 when there is no host. */
export function frontWinChance(state: GameState): number {
  const front = state.lands.find((land) => land.id === state.ascent?.frontLandId);
  return front ? bestBattle(state, front).chance : 0;
}

/**
 * Momentum for provinces that joined the realm this tick — and the bill for those that left.
 */
export function detectConquests(state: GameState, ownedBefore: Set<string>): void {
  const ascent = state.ascent;
  if (!ascent) return;

  let gained = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID || ownedBefore.has(land.id)) continue;
    gained += 1;
    addAscentXp(state, XP_PER_LAND_TAKEN);
    /**
     * The men who took it hold it.
     *
     * A province joined the realm carrying whatever watch its previous owner had left — for
     * neutral ground the handful the map generated, and for ground retaken after a loss the
     * quarter that survived the line below. `growProvincialMilitia` then needs
     * `MILITIA_SEASONS_TO_FULL` (22) seasons to raise a real garrison, and a wave lands every
     * `WAVE_INTERVAL_TICKS` (12). So new ground was soft for two waves after it was taken, and
     * measured over five seeded runs the realm **gained 8, 5, 14, 9 and 16 provinces and lost 9,
     * 5, 15, 7 and 17** — a treadmill that peaked at four to eight provinces and ended on nought
     * to three.
     *
     * That is the mode's agency problem stated in territory: expanding is what engaging *does*,
     * and it bought nothing that lasted, so every policy converged (measured, an 8% spread across
     * four of them) and declining survived as long as playing. Every symmetric lever tried against
     * it — the wave's shadow floor, the match factor, an unconditional first host — moved the
     * declining run as much as the engaged one, because a passive realm has walls too. Ground is
     * the one term that only moves for the player who goes and takes it.
     *
     * Deliberately a *share* of what the province can support rather than a full garrison, and
     * with no loyalty or masonry attached: Đồn điền — the military colony decree — grants exactly
     * that (loyalty 100, defence x1.5, full militia) and has to stay clearly the better thing to
     * have bought. Never lowers a garrison, so retaking well-held ground is not a punishment.
     */
    const arriving = Math.round(militiaCapacity(state, land) * CONQUEST_GARRISON_SHARE);
    if (arriving > land.localSoldiers) land.localSoldiers = arriving;
    // The retake window closes because it was used. Left standing, a province taken back would
    // keep granting `retakeBonus` against its *next* owner for another two waves.
    land.lostAtWave = undefined;
    land.siege = undefined;
    if (ascent.frontLandId === land.id) {
      ascent.frontLandId = undefined;
      ascent.frontBlocked = false;
    }
  }

  // And the other direction, which had no code at all.
  //
  // `completeLandAcquisition` pays `+land.population` into the realm's people the moment a province
  // joins it, and nothing anywhere took it back — so a province taken, lost and retaken paid out
  // twice, and losing ground cost the realm nothing beyond that district's income. Territory churn
  // was a ratchet that only turned upward, which is most of why the map had stopped mattering.
  //
  // The inverse is deliberately not the whole figure. A throne that leaves takes people with it:
  // `REFUGEE_SHARE` follow it out and stay in the national pool, and the rest are on their own land
  // and are counted by whoever holds it now.
  for (const land of state.lands) {
    if (!ownedBefore.has(land.id) || land.ownerId === PLAYER_KINGDOM_ID) continue;
    const stayed = Math.round(land.population * (1 - REFUGEE_SHARE));
    if (stayed > 0) applyResourceDelta(state, { humans: -stayed });
    // The watch it kept belongs to the new owner, bar the few who walked out with everyone else.
    land.localSoldiers = Math.round(land.localSoldiers * 0.25);
    /**
     * The retake window opens here.
     *
     * `retakeBonus` reads this: for `RETAKE_BONUS_WAVES` waves the throne's own people are still
     * on this ground, and a host marched back in fights at up to +25%. Together with walls that
     * stay down after a loss (`wallsBreached`, land-consequences round), it is what turns a
     * province lost into *lose -> muster -> take it back* rather than a one-way ratchet.
     */
    land.lostAtWave = ascent.wave;
    // Whatever was at its walls is the new owner's problem now.
    land.siege = undefined;
    // Said out loud. Two fifths of a province's people vanishing in silence is indistinguishable
    // from a bug, and being able to feel this is the entire point of charging for it.
    pushToast(state, t('ascent.land.lost', { land: land.name, people: stayed }), 'threat');
  }

  // Ambition is charged here rather than at the order, and deliberately regardless of *who*
  // gave it: this is the one place a province is known to have actually joined the realm.
  // Charging at the order would bill the player for bribes that failed and sieges that broke,
  // and exempting the autopilot's routine purchases would let a passive run accumulate a
  // twenty-province empire for free — which is exactly how a declining player used to outlive
  // an engaged one.
  if (gained > 0) chargeAmbition(state, 'province', gained);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function marchBestHostToTarget(state: GameState, landId: string): boolean {
  // Only the hosts left to the autopilot: a host under the player's own standing order goes
  // where that order says (see `StandingOrders`), and a garrison levy goes nowhere.
  const candidates = state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && isAutoHost(army))
    .filter((army) => !state.siegeOrders.some((order) => order.armyId === army.id))
    .filter((army) => Boolean(findLandPath(state, army.landId, landId)))
    .sort((a, b) => armyPower(state, b) - armyPower(state, a));

  let moved = false;
  // Everything but the last host: one stays home so a wave never lands on an empty realm.
  for (const army of candidates.slice(0, Math.max(1, candidates.length - 1))) {
    moved = issueMoveOrder(state, army.id, landId) || moved;
  }
  if (!moved && candidates[0]) {
    moved = issueMoveOrder(state, candidates[0].id, landId);
  }
  return moved;
}

function bestReachableArmy(state: GameState, land: Land): Army | undefined {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron && Boolean(findLandPath(state, army.landId, land.id)))
    .sort((a, b) => armyPower(state, b) - armyPower(state, a))[0];
}

function bestAdjacentOwnedArmy(state: GameState, land: Land): Army | undefined {
  return state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron)
    .filter((army) => {
      const armyLand = findLand(state, army.landId);
      return Boolean(armyLand && armyLand.ownerId === PLAYER_KINGDOM_ID && armyLand.neighbors.includes(land.id));
    })
    .sort((a, b) => armyPower(state, b) - armyPower(state, a))[0];
}

/** An unposted hero, best at winning a province over by talking. */
/**
 * Who carries the realm's offer. An unposted champion first, then a minister pulled from their
 * desk — sending an envoy is exactly the errand a chancellor runs.
 *
 * The fallback is what makes this method exist at all. With only unposted heroes eligible, the
 * envoy row was blocked in *every single instance* logged across a full run, always with the
 * same reason: the court and the army between them absorb every champion the realm draws, so
 * "needs a hero with no posting" was a permanent state rather than a temporary one. A row that
 * can never be chosen is not teaching the player the system, it is noise on the card.
 *
 * Deliberately not a hero already commanding a host: stripping a general to send them abroad
 * leaves an army leaderless in the middle of a war.
 */
function bestDiplomat(state: GameState): Hero | undefined {
  const rank = (hero: Hero): number => hero.stats.diplomacy + hero.stats.administration;
  const byRank = (a: Hero, b: Hero): number => rank(b) - rank(a);

  const unposted = state.heroes.filter((hero) => !hero.assignedTo).sort(byRank)[0];
  if (unposted) return unposted;
  return state.heroes.filter((hero) => hero.assignedTo?.startsWith('court:')).sort(byRank)[0];
}

/**
 * Honest odds against a province: the real `createBattlePreview` when a host borders it,
 * otherwise its own formula against the garrison so a multi-leg march still shows a truthful
 * number. No host at all reads as 0%, which is the correct warning.
 */
function bestBattle(state: GameState, land: Land): { chance: number; armyId?: string } {
  let best = 0;
  let armyId: string | undefined;

  for (const army of state.armies.filter((candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID && !candidate.isLevy)) {
    const preview = createBattlePreview(state, army.id, land.id);
    let chance: number;
    if (preview) {
      chance = preview.winChance;
    } else if (findLandPath(state, army.landId, land.id)) {
      const attack = armyPower(state, army);
      chance = Math.round((attack / Math.max(1, attack + landGarrisonPower(state, land))) * 100);
    } else {
      continue; // unreachable: offering it would hand the player an order their host refuses
    }
    if (!armyId || chance > best) {
      best = chance;
      armyId = army.id;
    }
  }
  return { chance: best, armyId };
}

/**
 * The economic focus this ground is best made for, and how well.
 *
 * What a claim is actually chosen *for*: the reward tag below reads today's outputs, which for a
 * village nobody has built on is nothing, so it called nearly every province "open country". A
 * player who reads the land — a delta for rice, a limestone shelf for iron, a crossroads for
 * coin — has to be able to read it before paying for it, or the skill has nowhere to show.
 */
function landSuits(land: Land): ConquestTarget['suits'] {
  const aptitude = getLandAptitude(land);
  const focus = (['breadbasket', 'mining', 'trade'] as const)
    .reduce((best, next) => (aptitude[next] > aptitude[best] ? next : best));
  return { focus, pct: Math.round(aptitude[focus] * 100) };
}

/** The one-word reason to want this province, shown as the card's reward tag. */
function rewardTag(land: Land): string {
  if (land.terrainSummary.shrine > 0) return 'shrine';
  const { gold, food, supplies } = land.outputs;
  const best = Math.max(gold, food, supplies);
  if (best <= 0) return 'plain';
  if (best === gold) return 'gold';
  if (best === supplies) return 'iron';
  if (best === food) return 'food';
  return 'plain';
}

/** Formats a hero for a method card's detail line. */
export function methodHeroName(state: GameState, heroId: string | undefined): string | undefined {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  return hero ? heroName(hero) : undefined;
}

/** True when the sheet lets the player choose who carries this method out. */
export function methodHasActor(method: AscentConquestMethod): boolean {
  return method === 'diplomacy' || method === 'intimidation' || method === 'occupy' || method === 'siege';
}

/** "Envoy: X — tap to choose" / "Host: Y — tap to choose", for the method card's body. */
export function methodActorLine(state: GameState, option: ConquestMethodOption): string | undefined {
  if (option.method === 'diplomacy') {
    const name = methodHeroName(state, option.heroId);
    return t('ascent.conquer.actorEnvoy', { hero: name ?? t('ascent.conquer.actorNone') });
  }
  if (option.method === 'intimidation' || option.method === 'occupy' || option.method === 'siege') {
    const army = state.armies.find((candidate) => candidate.id === option.armyId);
    return t('ascent.conquer.actorHost', {
      army: army?.name ?? t('ascent.conquer.actorNone'),
      power: army ? Math.round(armyPower(state, army)) : 0,
    });
  }
  return undefined;
}
