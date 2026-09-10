import { tickVassals } from './VassalSystem';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  ASCENT_AUTO_DELEGATE_BEATS, CAPITAL_GRACE_TICKS, LOYALTY_SETTLE_PER_TICK, SUMMON_EVERY_N_WAVES,
} from '../../game/ascentConfig';
import { pushToast } from '../empire/notifications';
import { progressAcquisitions } from '../AcquisitionSystem';
import {
  collectPlayerIncome,
  getFocusLoyaltyBonus,
  growProvincialMilitia,
  growProvincialPopulation,
  progressBuildOrders,
  recoverGarrison,
  repairProvincialDefence,
} from '../ResourceSystem';
import { rebuildRuins } from './RestoreSystem';
import {
  progressArmyLogistics,
  progressMovementOrders,
  progressRecruitmentOrders,
  progressSiegeOrders,
} from '../WarSystem';
import { progressCourt } from '../CourtSystem';
import { tickDiplomacy } from '../DiplomacySystem';
import { tickAllyColumns } from './AllySupport';
import { provinceIsFalling, refreshPlayerVisibility } from '../LandSystem';
import {
  dissolveGarrisonLevies, resolvePendingBattle, tickAutoDefend, tickInvasions, tickSieges,
} from '../empire/InvasionSystem';
import { reconcileFronts } from './BattleSystem';
import { addMandate } from '../empire/MandateSystem';
import { tickGreatPowersYear } from '../empire/GreatPowersSystem';
import { ensureHeroDeck } from '../../data/heroFactory';
import { drainAscentPrompts } from './AscentState';
import { tickAscentAutopilot } from './AutopilotSystem';
import { tickStandingOrders } from './StandingOrders';
import { tickArmyRefits } from './refit';
import { tickPriceScale } from './priceScale';
import { tickStoreWaste } from './GranarySystem';
import { advanceBattle, beginBattle, delegateBattle } from './BattleSystem';
import { hasRoomForAnotherFront, liveBattleCount } from './fronts';
import { tickAscentProgress } from './PowerSystem';
import { tickRaids, tickWaveDirector } from './WaveDirector';
import { tickEnemyCommand } from './EnemyCommandDirector';
import { detectConquests, ensureAscentLaneState, refreshAscentLaneState } from './ConquestSystem';
import { tickDecisionDirector, tickPromptCooldowns } from './DecisionDirector';
import { tickStories } from '../story/StorySystem';
import { tickStoryCharges } from '../story/charges';
import { tickStoryPatrons } from '../story/patrons';
import { tickDecreeEffects } from '../decree/DecreeTick';
import { courtInRefuge, militaryColonies } from '../decree/rules';
import { tickEdictDiscovery } from './CourtLaneSystem';
import { endAscentRun } from './AscentResolver';
import { advanceSeasonClock, greatPowersDue } from '../seasonClock';
import { seasonLabel, t } from '../../i18n';
import type { GameState } from '../../state/types';

function ownedLandIds(state: GameState): Set<string> {
  return new Set(
    state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).map((land) => land.id),
  );
}

/**
 * The run ends when the capital falls — not when the last province does.
 *
 * Requiring every province to be lost made the run effectively unloseable once the realm
 * had a dozen of them, which drains all stakes from a mode whose whole point is a score
 * chase against an escalating threat curve. Losing the dynasty's seat is the ending.
 */
function checkAscentDefeat(state: GameState): void {
  if (state.isDefeated) return;

  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (owned.length === 0) {
    if (state.ascent) state.ascent.endCause = 'annihilated';
    endAscentRun(state);
    return;
  }

  const ascent = state.ascent;
  const capitalId = ascent?.capitalLandId;
  if (!ascent || !capitalId) return;

  const capital = state.lands.find((land) => land.id === capitalId);
  if (!capital || capital.ownerId === PLAYER_KINGDOM_ID) {
    // Retaken (or never lost) — the dynasty endures.
    if (ascent.capitalLostTicks > 0) {
      ascent.capitalLostTicks = 0;
      pushToast(state, t('ascent.capital.retaken', { land: capital?.name ?? '' }), 'reward');
    }
    return;
  }

  // Dụ tị nạn — the court has withdrawn, so there is no seat to lose. The Trần did this twice
  // and won both times. The grace clock simply does not advance while the admonition stands.
  if (courtInRefuge(state)) {
    ascent.capitalLostTicks = 0;
    return;
  }

  ascent.capitalLostTicks += 1;
  const remaining = CAPITAL_GRACE_TICKS - ascent.capitalLostTicks;
  if (remaining <= 0) {
    ascent.endCause = 'capital';
    ascent.endLandName = capital.name;
    endAscentRun(state);
    return;
  }
  pushToast(state, t('ascent.capital.lost', { land: capital.name, ticks: remaining }), 'threat');
}

/**
 * Newly-taken provinces come round over time.
 *
 * Without this, the loyalty a method stamps on a province would be a permanent penalty and every
 * player would simply always send the envoy. Drifting upward turns it into what it should be: a
 * *delay* you can choose to pay in seasons or in gold. A seated governor adds to this through
 * `progressCourt`, which is what makes a governorship worth more than a stat line.
 */
function settleOwnedLands(state: GameState): void {
  // Đồn điền — the military colony. Ground taken is ground garrisoned, at once: the province is
  // fully loyal the moment it is held and its own militia stands at full strength, because the men
  // holding it are the men who took it. What it never becomes is rich — see `settledMult`, which
  // pins a colonised realm at half yield for good.
  const colonies = militaryColonies(state);
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
    if (colonies) {
      land.loyalty = 100;
      // Once. `Math.max(defense, defense * 1.5)` is always the right-hand side, so this line
      // used to compound every tick: measured, a province's defense at 1.5e6 by tick 89 and the
      // realm's POWER at 1e99 by tick 600, with the threat gauge reading "comfortable" throughout.
      if (!land.colonised) {
        land.colonised = true;
        land.defense = Math.round(land.defense * 1.5);
      }
      continue;
    }
    if (land.loyalty >= 100) continue;
    // A province held as a fortress settles faster — the garrison is the reassurance.
    land.loyalty = Math.min(100, land.loyalty + LOYALTY_SETTLE_PER_TICK + getFocusLoyaltyBonus(state, land));
  }
}

/** Keeps the peak-lands figure current; it feeds the run score. */
function trackScore(state: GameState): void {
  if (!state.campaignScore) return;
  const held = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  state.campaignScore.turnsAlive = state.turn;
  state.campaignScore.peakLandsHeld = Math.max(state.campaignScore.peakLandsHeld, held);
}

/**
 * One Dragon Ascent economy tick.
 *
 * The first block mirrors `advanceRealtimeMonth` (RealtimeSystem) exactly for the
 * mode-agnostic half — income, orders, logistics, the court, the seasonal clock — so this mode
 * inherits every future economy and combat change for free. It then diverges: the autopilot
 * executes, the wave director escalates, and the decision director decides what to ask.
 *
 * Deliberately not called: `runBotTurns`, `tickCampaignEvents`, `tickForeignAffairs` (this mode
 * drives rival aggression through its own wave director), `tickSpySystem`, `progressDirectives`,
 * `checkVictory` — an endless run has no map-conquest win condition.
 */
export function advanceAscentTick(state: GameState): void {
  if (state.isDefeated || !state.ascent) return;

  // The arena runs the fight and nothing else.
  //
  // `BattleArenaScene` exists to answer one question — is the fight any good — and the rest of
  // the tick is noise against it: waves arriving mid-bout, cards interrupting, the economy
  // draining, stories firing. All of that would make two runs of the same matchup differ for
  // reasons that have nothing to do with the battle.
  //
  // Deliberately the *same* `beginBattle` and `advanceBattle` the real mode uses, on the same
  // clock. An arena that ran its own copy of the fight would verify a copy.
  if (state.ascent.arena) {
    // Begin AND advance on the same tick. Opening without a single beat left the screen a full
    // economy tick — 3.5 seconds — of two armies standing in silence before anything moved
    // (user report: "small delay, nothing happens, before the two armies fight"). The facing-
    // lines opening survives: the view drains the burst one beat per interval, so the first
    // beat still arrives at the drain clock's pace, not in a jump.
    if (state.pendingBattle && !state.ascent.activeBattle) beginBattle(state);
    advanceBattle(state);
    return;
  }

  ensureAscentLaneState(state);

  const ownedBefore = ownedLandIds(state);
  const wavesBefore = state.ascent.wavesSurvived;

  // ── Reused verbatim from the classic tick ────────────────────────────────
  collectPlayerIncome(state);
  // Grain rots and goods spoil above the stores' line, taken from the stock once the harvest is
  // in — never from the rate, which the famine card reads. See `GranarySystem`.
  tickStoreWaste(state);
  // The scaled purse follows the books, a step a season, so a price quoted on a card this
  // season is the price charged when the card is answered next season. See `priceScale.ts`.
  tickPriceScale(state);
  // Required, not optional: every peaceful claim — bribe, envoy, settle — and marching onto
  // unsettled ground all file acquisition orders rather than flipping the province on the
  // spot. Without this the Conquer lane's non-military methods never complete.
  progressAcquisitions(state);
  progressBuildOrders(state);
  progressSiegeOrders(state);
  progressMovementOrders(state);
  progressRecruitmentOrders(state);
  progressArmyLogistics(state);
  // The full court, not just its modifiers: Favor accrues toward the next hero draft, seated
  // governors raise their province's loyalty, ungoverned provinces drag on stability, and the
  // tax dial's fatigue compounds. That pressure is what makes appointments matter.
  progressCourt(state);
  // Opinion modifiers decay and relations drift back toward each empire's baseline. Normally
  // reached through the campaign-gated `tickForeignAffairs`; called directly here.
  tickDiplomacy(state);
  // Allied relief goes home when the fight it came for is over and its larder is out.
  tickAllyColumns(state);
  tickVassals(state);

  state.turn += 1;
  advanceSeasonClock(state);
  // The rival empires live on their own: they arm, destabilise, war on each other, collapse
  // and are reborn — so the world the player is fighting is not a static backdrop. On their own
  // tick count rather than on the year, so a longer season does not slow them down with it.
  if (greatPowersDue(state)) tickGreatPowersYear(state);

  // ── Dragon Ascent ────────────────────────────────────────────────────────
  state.ascent.marchCooldown = Math.max(0, state.ascent.marchCooldown - 1);
  tickAscentAutopilot(state);
  // Refits and supply columns advance before orders are read, so a host whose refit finishes
  // this tick takes its next order in the same breath rather than a season late.
  tickArmyRefits(state);
  // The player's own standing orders, after the autopilot has had its say and touched only the
  // hosts left to it. A commanded host walks back to its post, storms its target, keeps station
  // with its leader — and is never marched by anything else.
  tickStandingOrders(state);
  // The authored roster is removed from the deck as it is recruited, so a long run empties it
  // and the champion lane — half this mode's identity — quietly stops offering anything.
  ensureHeroDeck(state);

  tickWaveDirector(state);
  tickRaids(state);
  tickAutoDefend(state);
  // Before `tickInvasions`, so a host spawned this tick marches on the tick it was given orders,
  // and so a host that decided to withdraw does not spend one more tick advancing first.
  tickEnemyCommand(state);
  // The walls' own clock, immediately before the hosts standing under them are asked what they
  // are doing: a siege that runs out this season is stormed this season, so the last tick the
  // player could have acted on it is the last tick they are shown it.
  tickSieges(state);
  tickInvasions(state);

  // A field battle is now something the player watches and steers.
  //
  // This used to discard it unconditionally with `resolvePendingBattle(state, 'delegate')`,
  // which is why a host could fight for an entire run without ever being seen to. `beginBattle`
  // opens the watchable engagement; it returns false when there is nothing to watch (no host of
  // ours actually present), and the old silent delegation still covers that case and any run
  // where the player has handed battles back to their generals.
  //
  // Whenever there is room for another field — not only when nothing at all is being fought.
  //
  // That single condition used to be `!state.ascent.activeBattle`, and it is most of why a wave
  // striking three provinces was one battle and two hidden dice rolls. `beginBattle` now opens a
  // second and third front under their generals (`MAX_LIVE_BATTLES`); past the cap the old silent
  // delegation still covers it, reported through `battleReport`. `beginBattle` takes the record
  // off the state itself, so the fight it opens is never resolved a second time underneath it.
  let openedThisTick = false;
  if (state.pendingBattle && hasRoomForAnotherFront(state, state.pendingBattle.landId)) {
    const watched = !state.ascent.autoResolveBattles && beginBattle(state);
    if (!watched) resolvePendingBattle(state, 'delegate');
    openedThisTick = watched;
  }

  // A siege runs across seasons, not seconds. Several beats a tick keeps an engagement to a
  // handful of turns while leaving the player time to raise a host and march it in — which is
  // the whole point of the battle no longer freezing the world.
  //
  // A fight that opened this tick is advanced too. It used to be "left at its first beat, so
  // the screen opens on two lines facing each other" — but the beats are a QUEUE the view
  // drains at its own pace, so the facing-lines opening was already guaranteed, and what the
  // rule actually bought was a full tick of dead air before the first arrow.
  void openedThisTick;

  // In a RUN, an uncommanded field is an implicitly delegated one. The dials stay the player's
  // for a grace window — long enough to take the screen in and start commanding — and then the
  // general assumes them, with the hand-over in the log and the take-back chip one tap away.
  // Without this, "manual means manual" (built for the Skirmish, where doing nothing must lose)
  // quietly gutted every campaign defence the player did not personally fight: measured on the
  // seeded long run, fights the officers used to hold became routs, provinces fell early, and
  // the run died before its own late-game checks could fire. The arena never does this — it is
  // the practice yard, and an unclaimed fight losing there is the lesson.
  // Only the field the player is standing on can be *un*commanded — the side fights open
  // delegated, because there is nobody to grant a grace window to on a field nobody is watching.
  //
  // **A field the player claimed is not an uncommanded one.** `claimed` is set by the take-back
  // chip and by walking onto a side fight, and while it stands this rule leaves the field alone —
  // otherwise "take the field" was a button that undid itself on the next season, since a
  // take-back happens past the window by definition. The claim ends only where the player ends
  // it: handing over, leaving the screen, or moving to another fight.
  const live = state.ascent.activeBattle;
  if (live && !live.delegated && !live.claimed && !live.steeredFormation && !live.steeredStance
    && (live.approachBeats ?? 0) + live.round >= ASCENT_AUTO_DELEGATE_BEATS) {
    delegateBattle(state, true, false);
  }
  // Before the beat clock touches anything: `progressSiegeOrders` flipped owners back at the
  // movement step, and a fight standing on ground that changed hands this tick must end rather
  // than be advanced. See `reconcileFronts`.
  reconcileFronts(state);
  advanceBattle(state);

  // Once nothing is being fought *anywhere*, any province that turned its garrison out takes it
  // back in. A levy is a host for the length of one battle and no longer — see
  // `raiseGarrisonLevy`. Reading only `activeBattle` here would send home the militia standing in
  // a general's line on another front, mid-fight.
  //
  // The one exception is ground an enemy is in the act of taking. That province fights for nobody
  // (`battleMembership`), so its turnout is not "standing in a line" — it is a host with no side,
  // and leaving it in `state.armies` until the realm next falls quiet left a phantom garrison on
  // ground already lost. It goes home on its own, whatever else is being fought.
  if (liveBattleCount(state) === 0 && !state.pendingBattle) {
    dissolveGarrisonLevies(state);
  } else {
    dissolveGarrisonLevies(state, (army) => provinceIsFalling(state, army.landId));
  }

  settleOwnedLands(state);
  // Ground that defends itself. Militia is raised from each province's own people rather than
  // from the national pool, so holding territory no longer competes with fielding an army — see
  // `growProvincialMilitia`. After `settleOwnedLands`, because the ceiling reads loyalty.
  // People arrive before the watch they will be drawn from: `militiaCapacity` reads
  // `land.population`, so growing the district first means this season's arrivals count toward
  // this season's militia rather than next season's.
  growProvincialPopulation(state);
  growProvincialMilitia(state);
  // And the masonry the last fight knocked down, rebuilt a course at a time. Beside the militia
  // because they are the two halves of the same recovery: a province that held a wave is short of
  // both men and walls until it has had the seasons to make them good.
  repairProvincialDefence(state);
  // And the turnout the last fight spent — the third half of the same recovery, on its own clock.
  recoverGarrison(state);
  // And the farms and houses the fight burnt, a level at a time. See `RestoreSystem`.
  rebuildRuins(state);
  detectConquests(state, ownedBefore);
  tickAscentProgress(state);

  // Mandate (era) rises with the realm and with every wave broken. Eras raise the building
  // level cap, so the economy's ceiling lifts as the run goes on rather than plateauing.
  const wavesGained = state.ascent.wavesSurvived - wavesBefore;
  const landsGained = state.lands.filter(
    (land) => land.ownerId === PLAYER_KINGDOM_ID && !ownedBefore.has(land.id),
  ).length;
  addMandate(state, 0.35 + wavesGained * 4 + landsGained * 2);

  // After mandate and conquest have settled, so an edict unlocked by this very tick's wave or
  // captured province is announced on the tick it happened.
  tickEdictDiscovery(state);
  // The rule decrees that run on a clock: the examination hall seating a graduate, a dụ or
  // hịch lapsing and handing its weight back, and paper money's reckoning. Placed beside
  // discovery because both are the decree layer's own bookkeeping, and after the economy so a
  // crash reads this tick's stability rather than last tick's.
  tickDecreeEffects(state);

  trackScore(state);
  state.message = state.message || t('msg.economyTick', { year: state.year, season: seasonLabel(state.season) });

  tickPromptCooldowns(state);
  refreshAscentLaneState(state);
  // Before the director: stories notice what changed this tick, let at most one whisper through
  // (which costs no prompt budget at all), and mark anything louder for the director to weigh
  // against everything else competing for the player's attention.
  // Oaths are judged before the stories speak, so a charge kept this season is a thing the
  // Chronicle can talk about this season rather than next.
  tickStoryPatrons(state);
  tickStoryCharges(state);
  tickStories(state);
  tickDecisionDirector(state);
  checkAscentDefeat(state);
  drainAscentPrompts(state);

  refreshPlayerVisibility(state);
}
