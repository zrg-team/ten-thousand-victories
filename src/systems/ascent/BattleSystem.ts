import { hasCapstone } from '../decree/SchoolSystem';
import { proclamationInForce, tattooedArms, SAT_THAT_ROUT_FLOOR } from '../decree/rules';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  EARLY_WAVE_GRACE,
  BATTLE_ADVANCE_PER_TICK,
  BATTLE_APPROACH_MAX_BEATS,
  BATTLE_BASE_ROUNDS,
  BATTLE_BEATS_PER_TICK,
  BATTLE_CHARGE_COVER,
  BATTLE_CHARGE_MORALE,
  BATTLE_STANCE_TRADE,
  BATTLE_COUNTER_MORALE,
  BATTLE_FORMATION_TILT,
  BATTLE_FORMATION_TILT_SHARP,
  BATTLE_LOOSE_VOLLEY,
  BATTLE_MAX_ROUNDS,
  BATTLE_MOMENT_TICKS,
  BATTLE_MOMENT_BONUS_BEATS,
  BATTLE_MOMENT_EARLIEST,
  BATTLE_MOMENT_GAP,
  BATTLE_MOMENTS_PER_FIGHT,
  BATTLE_MOMENTS_PER_GREAT_FIGHT,
  BATTLE_MORALE_PER_LOSS,
  BATTLE_MORALE_WIN_GAIN,
  BATTLE_RALLY_BASE,
  BATTLE_WITHDRAW_BEATS,
  BATTLE_ROUND_BITE,
  BATTLE_RALLY_DESPERATION,
  BATTLE_ROUT_LOSS_SHARE,
  BATTLE_OVERTIME_MORALE,
  BATTLE_NUMBERS_FLOOR,
  BATTLE_OVERTIME_WEIGHT_CAP,
  BATTLE_ROUT_MORALE,
  BATTLE_VOLLEY_BITE,
  BATTLE_WITHDRAW_RECOVERY,
  BATTLE_STAMINA_MAX,
  BATTLE_STAMINA_REGEN_BEATS,
  BATTLE_TEMPER,
  type CommanderTemper,
  BATTLE_COMMIT_AMPLIFY,
  BATTLE_STANCE_RISK,
} from '../../game/ascentConfig';
import {
  battleAnswersEven, battleBeatsPerTick, battleEnemyWagerAfter, battleReactDelay,
} from '../../game/battleOptions';
import {
  formationBeats, formationTier, formationTiltSign,
  FORMATION_RING, type BattleFormation,
} from '../../data/ascent/formations';
import { raiseEnemyGarrisonLevy, raiseGarrisonLevy, resolveBattleRecord } from '../empire/InvasionSystem';
import { recordEngagement } from './battleReport';
import {
  addSideBattle, battleAt, focusBattle, hasRoomForAnotherFront, liveBattles, promoteNextFront,
  withFocus,
} from './fronts';
import { pushToast } from '../empire/notifications';
import {
  applyAttackOutcome, armyPower, compositionMatchup, issueMoveOrder, terrainDefenseMultiplier,
} from '../WarSystem';
import { occupyEmptyLand } from '../AcquisitionSystem';
import { findLand, provinceIsFalling } from '../LandSystem';
import { defenceCommanderOf } from './landCommand';
import { landGarrisonPower } from './PowerSystem';
import { battleLine, enrolArrivals, hostHeadcount, ourHosts, theirHosts } from './battleMembership';
import { isAutoHost } from './armyOrders';
import { t } from '../../i18n';
import { BATTLE_MOMENTS, eligibleMoments } from '../../data/ascent/battleMoments';
import type { BattleMomentDef, MomentContext, MomentEffect } from '../../data/ascent/battleMoments';
import type {
  Army, ArmyComposition, AscentBattle, BattleBeatHost, BattleMoment, BattleMomentAnswer, FieldStance,
  GameState, Land, PendingBattle,
} from '../../state/types';

// Re-exported so the screen and the harness keep one import for the fight's vocabulary.
export { battleLine, isEngaged, ourHosts, theirHosts } from './battleMembership';

/**
 * The fight you can actually watch — and, more to the point, one worth watching.
 *
 * The first version of this was a metronome. `bleed` scaled every unit type equally so
 * composition never shifted, `armyPower` stayed linear in headcount, and the power ratio barely
 * moved — which meant losses per beat were near-constant and nothing surprising could happen.
 * Worse, of the two postures one was strictly better: holding traded 7% more efficiently *and*
 * lost fewer men, with the only counterweight an end-of-fight bonus the player never saw. With
 * no tipping point and no real choice, "leave it to my generals" was the correct answer, and a
 * screen whose skip button is right has failed.
 *
 * Three things fix that, and all three reuse machinery that was already sitting here:
 *
 *  - **Morale is the currency.** `armyPower` already multiplies by `army.morale / 100`, and no
 *    battle code ever touched it. Writing morale down as casualties mount makes a sagging line
 *    compound into collapse on its own — the tipping point, for free.
 *  - **The approach is the archery phase.** `army.units.archers` already exists. Arrows fly
 *    while the lines close, so bringing bowmen pays off visibly and four dead seconds become
 *    the opening.
 *  - **Charging buys cover.** Closing fast means eating less of their fire. That is what finally
 *    gives charge a case against hold's better melee trade.
 */

const totalUnits = hostHeadcount;

/**
 * How many beats the queue keeps before the oldest are dropped.
 *
 * A screen that is open drains this every `BATTLE_TICK_MS`, so it never fills. A headless run
 * never drains at all, and a long engagement would otherwise grow an entry per beat forever —
 * `verify-ascent` fights hundreds of them in one run.
 */
const BEAT_QUEUE_CAP = 64;

/** A side's columns as the view needs them: who is standing, how many, and how steady. */
function beatHosts(hosts: Army[]): BattleBeatHost[] {
  return hosts.map((host) => ({ id: host.id, men: totalUnits(host), morale: Math.round(host.morale) }));
}

/**
 * Writes down what this beat looked like, for a screen that will replay it later.
 *
 * Called at the end of every beat and nowhere else. It reads state and pushes an object — it
 * never calls `Math.random`, so the simulation's RNG order is untouched and every mode's
 * regression fingerprint holds.
 */
/** Share of a side's standing men that are archers, 0..1. */
function bowShare(hosts: Army[]): number {
  const men = hosts.reduce((total, host) => total + totalUnits(host), 0);
  if (men <= 0) return 0;
  return hosts.reduce((total, host) => total + host.units.archers, 0) / men;
}

function recordBeat(
  battle: AscentBattle,
  phase: 'approach' | 'clash',
  ours: Army[],
  theirs: Army[],
  ourLoss: number,
  theirLoss: number,
  line?: string,
  broke?: string[],
): void {
  const beats = (battle.beats ??= []);
  beats.push({
    phase,
    round: battle.round,
    ourNow: battle.ourNow,
    theirNow: battle.theirNow,
    ourAdvance: battle.ourAdvance,
    theirAdvance: battle.theirAdvance,
    ourMorale: battle.ourMorale,
    theirMorale: battle.theirMorale,
    ourLoss: Math.round(ourLoss),
    theirLoss: Math.round(theirLoss),
    ourHosts: beatHosts(ours),
    theirHosts: beatHosts(theirs),
    line,
    broke: broke && broke.length > 0 ? broke : undefined,
    // For the arrows: a side walking between shapes looses nothing, which is part of the walk's
    // price and a tell in its own right.
    ourShape: reforming(battle.reformBeats) ? undefined : battle.ourFormation,
    theirShape: reforming(battle.theirReformBeats) ? undefined : battle.theirFormation,
    ourBows: bowShare(ours),
    theirBows: bowShare(theirs),
  });
  if (beats.length > BEAT_QUEUE_CAP) beats.splice(0, beats.length - BEAT_QUEUE_CAP);
}

/**
 * Whether this fight is worth stopping the game for: **a wave that reached ground we hold.**
 *
 * Not "any fight we are losing" — that odds clause was tried and barely filtered anything, since
 * a single intercepting host is almost always weaker than a wave, so "not clearly winning"
 * described 47 of 48 engagements. A rule that admits everything is not a rule.
 *
 * But the two-clause version that replaced it (a Great Invasion, or the capital) was far too
 * narrow in the other direction: measured, the live battle — the best thing this mode has —
 * opened **0.4 times per run**, so most players never saw it at all and auto-resolve became the
 * sensible default by neglect.
 *
 * Whose ground it is turns out to be the honest filter. A host we sent to storm someone else's
 * walls is a march, and the mode's fantasy is not marching; it is watching the realm you built
 * hold the line. That distinction cuts the same 48 engagements down without an odds clause, and
 * the once-per-wave cap in `beginBattle` does the rest.
 */
/**
 * Whose ground it is turned out to be too generous on its own.
 *
 * Measured after that rule shipped: the screen opened **28.3 times per run** against a design
 * target of 3–5, because every wave and every raid that touched any owned province qualified. A
 * showpiece that opens two dozen times a run is not a showpiece, it is a chore — and the auto-
 * resolve toggle becomes the sensible default by neglect, which is the exact failure the watchable
 * battle was built to fix.
 *
 * So ownership is now the *first* gate rather than the only one, and an ordinary defence must also
 * be genuinely in doubt. The capital and a Great Invasion still always open: those are the fights
 * the run turns on, and a player who is about to lose their seat should never learn about it from
 * a strip of text.
 */
/**
 * The odds a defence would be fought at, as the selection gate reads them.
 *
 * Walls and field hosts on one side; everything standing on the province or one hop from it on the
 * other, because the invader that made contact is stood on the *adjacent* land when this is asked.
 */
function watchOdds(state: GameState, land: Land): { defence: number; attack: number; columns: number } {
  const defence = landGarrisonPower(state, land)
    + state.armies
      .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === land.id)
      .reduce((sum, army) => sum + armyPower(state, army), 0);
  const near = state.armies.filter((army) => army.kingdomId !== PLAYER_KINGDOM_ID
    && (army.landId === land.id || land.neighbors.includes(army.landId)));
  return {
    defence,
    attack: near.reduce((sum, army) => sum + armyPower(state, army), 0),
    columns: near.length,
  };
}

/** How many enemy columns stand on a province or one hop from it. Used to break ties. */
export function enemyColumnsAt(state: GameState, land: Land): number {
  return watchOdds(state, land).columns;
}

/**
 * Should this contact be *fought*, rather than settled as a die roll?
 *
 * Two different questions wear this name now, and telling them apart is what let the war have
 * more than one field. Every clause below was written to ration **taking the screen** — the odds
 * band, the wave gap, the capital's mark are all forms of "is this worth stopping the game for",
 * and they are right about that. They are simply not the question being asked of a *side* front.
 *
 * A side front costs the player no attention: it opens under a general on a field they are not
 * standing on, and the only alternative to it is `resolveInvaderBattle`'s hidden roll. Rationing
 * it is rationing nothing but fidelity, so `asSide` skips straight past the band and the gap. The
 * per-province-per-wave key in `beginBattle` still holds — `maybeRequestBattleDecision` fires on
 * every tick an invader stands on contested ground, and without it one siege would open a fresh
 * front every tick.
 */
function worthWatching(state: GameState, landId: string, isGreat: boolean, asSide = false): boolean {
  const ascent = state.ascent;
  // The arena exists to watch one specific matchup. Every clause below asks whether a fight is
  // worth interrupting a *run* for, which is not a question the arena is asking.
  if (ascent?.arena) return true;
  const land = findLand(state, landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) return false;

  const { defence, attack } = watchOdds(state, land);
  if (defence <= 0 || attack <= 0) return false;
  const ratio = attack / defence;

  // A field the player is not being asked to stand on: anything with two sides on it is fought.
  if (asSide) return true;

  // A Great Invasion is the wave the run turns on, and it has a floor but no ceiling.
  //
  // It used to be unconditional on the grounds that a great wave is usually in band anyway. It is
  // not: with the capital's exemption gone, **every single remaining walkover was a Great Invasion
  // on the seat** — nine of ten, at 0.02 to 0.15, each running the full twenty-two rounds with the
  // defence never dropping below 64% strength. A wave the realm has already beaten is not a
  // turning point because it was labelled one.
  //
  // No ceiling, though. A great invasion the player is losing badly is exactly the fight they have
  // to be in the room for, and the ordinary band's upper limit would hide it.
  if (isGreat) return ratio >= GREAT_WATCH_MIN;

  // The capital keeps its priority and loses its exemption.
  //
  // It used to open unconditionally, and that single clause is most of why the screen was boring.
  // Measured over 44 watched fights across six seeded runs: **73% were on the seat**, and the seat
  // turns out the realm's largest levy — 2,574 against 269, 4,237 against 66, 5,303 against 136.
  // Median opening odds across everything watched were **0.20** and 64% were walkovers. The screen
  // was mostly being used to show the player a garrison of four thousand stepping on a raid.
  //
  // A seat genuinely at risk still always opens: nobody should learn they are about to lose their
  // capital from a strip of text, and neither should a player whose grace clock is already running.
  // Below that mark the seat queues up with everywhere else.
  const isCapital = ascent?.capitalLandId === landId;
  if (isCapital && (ratio >= CAPITAL_AT_RISK_RATIO || (ascent?.capitalLostTicks ?? 0) > 0)) return true;

  /**
   * The opening is not rationed. Every fight in it opens.
   *
   * The rules below are a *budget*: being worth watching and being worth stopping the game for are
   * different questions, and only the second is bounded. Both answers are wrong for a player's
   * first two waves, because they have not yet been shown what commanding a fight does — and
   * measured over three seeded runs, the first three waves produced sixteen engagements of which
   * **six** were fought on the field; the other ten were dispatches about a dice roll. Reported as
   * "let users handle fight", and the ration is what was stopping them.
   *
   * Ground of ours only, and `hasRoomForAnotherFront` still bounds how many fields run at once —
   * so this opens the fights the player has, not an unbounded number of them.
   */
  if (ascent && ascent.wave <= EARLY_WAVE_GRACE) return true;

  // A defence is rationed, not merely filtered.
  //
  // The odds band was tried on its own first and barely moved the count — 28.3 openings a run
  // became 25.9 — because with provincial militia most defences *are* genuinely in doubt, so the
  // band admits nearly all of them. Being worth watching and being worth *stopping the game for*
  // are different questions, and only the second one is bounded.
  if (ascent && ascent.wave - (ascent.lastWatchedWave ?? -99) < ORDINARY_WATCH_WAVE_GAP) return false;

  // In doubt, measured the honest way: what is actually standing here against what actually
  // defends here. A raid the province will brush off, and an assault it cannot survive, are both
  // decided before the first exchange — neither is worth stopping the game for.
  return ratio >= WATCH_ODDS_BAND_MIN && ratio <= WATCH_ODDS_BAND_MAX;
}

/**
 * True when the odds roll this defence is about to be handed to would take the province.
 *
 * The watch gates ration *screens*, and they are tuned: a fight decided before the first
 * exchange is not worth stopping the game for. That reasoning holds right up to the point where
 * what the fight decides is whether a province is still ours — and then the thing being rationed
 * away is not a screen, it is the news. Reported with the card for it in hand: *Vân Trại Thượng
 * đã mất*, twelve men against eight hundred, `rounds: 0` — settled by dispatch, on a province
 * the player held, with no field, no notice and nothing to answer.
 *
 * So a defence above the band on ground of ours opens anyway. It opens under its general like
 * any other, which means it costs no attention; what it buys is that the fight is *announced*
 * (see `maybeAutoOpenBattle`) and the player may walk onto it while there is still time to
 * march relief. Below the band nothing changes: a raid the walls brush off is still not news.
 */
function wouldCostUsTheProvince(state: GameState, landId: string): boolean {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) return false;
  if (state.ascent?.arena) return false;
  const { defence, attack } = watchOdds(state, land);
  if (defence <= 0 || attack <= 0) return false;
  return attack / defence > WATCH_ODDS_BAND_MAX;
}

/**
 * The band of attacker-to-defender power in which a defence is worth watching.
 *
 * Narrowed from 0.55-2.20. The old floor admitted a fight the province wins by a factor of two,
 * which is a result and not a battle; the old ceiling admitted one it loses by the same margin.
 */
const WATCH_ODDS_BAND_MIN = 0.65;
const WATCH_ODDS_BAND_MAX = 1.8;
/**
 * What "the seat is genuinely at risk" means: the enemy brings at least this share of the line
 * standing on the capital. Below it the capital is an ordinary defence and takes its turn.
 */
const CAPITAL_AT_RISK_RATIO = 0.6;
/**
 * The floor a Great Invasion must clear. Lower than the ordinary band's, because a great wave
 * earns some benefit of the doubt; there is deliberately no matching ceiling.
 */
const GREAT_WATCH_MIN = 0.5;
/**
 * Waves of quiet before a defence may take the screen again. Great Invasions ignore it.
 *
 * Dropped from two to one when the capital and the great waves stopped being exempt: those two
 * clauses had been supplying most of the run's fights, and with both rationed the screen opened
 * 3.2 times a run against a design target of four to six. The gap exists to stop a second fight
 * every wave, and at one wave of quiet it still does.
 */
const ORDINARY_WATCH_WAVE_GAP = 1;


export function beginBattle(state: GameState): boolean {
  const ascent = state.ascent;
  const pending = state.pendingBattle;
  // `hasRoomForAnotherFront`, not `!ascent.activeBattle`. That one clause is what made a wave
  // striking three provinces a fight at one of them and hidden dice at the other two; a second
  // contact now opens a second field, held by its general until the player walks onto it.
  if (!ascent || !pending) return false;
  // The province is asked about by name: the dynasty's seat is allowed one field past the cap,
  // because past the cap a contact is a die roll and the seat must never change hands on one.
  if (!hasRoomForAnotherFront(state, pending.landId)) return false;
  if (pending.role === 'offence') return beginAssault(state, pending);

  const invader = state.armies.find((army) => army.id === pending.invaderArmyId);
  if (!invader) return false;
  // **One field per province**, whatever the wave says — and a second column arriving where a
  // fight is already running **joins it** rather than getting its own roll for the same ground.
  //
  // This used to `return false`, and the caller answers false with `resolvePendingBattle(…,
  // 'delegate')` — a hidden odds roll that can take the province outright. So a wave converging on
  // one place had its lead column fought on screen while the ones behind it quietly rolled dice
  // for the same walls, and the ground could be captured out from under a battle still being
  // fought over it. Enrolment already knows how to seat an arrival (`enrolArrivals` runs every
  // beat); all that was missing was saying so instead of rolling.
  //
  // Ahead of every gate below, because none of them are asking the right question once a fight
  // is standing there: `lastWatchedKey` would refuse this contact and hand it straight to the
  // roll, which is the same defect one line further down.
  const standing = battleAt(state, pending.landId);
  if (standing) {
    const theirs = new Set(standing.theirArmyIds ?? []);
    theirs.add(pending.invaderArmyId);
    standing.theirArmyIds = [...theirs];
    enrolArrivals(state, standing);
    state.pendingBattle = undefined;
    state.isPaused = false;
    // True, so the caller does not settle it as a roll — the fight it just joined settles it.
    return true;
  }

  // The line here broke this wave, and nothing but the beaten militia's remnant is left to stand.
  // A field opened now is the province fighting the next column with what the last one left it —
  // 253 against 3,734, measured, one tick after a 1,394-man defence was routed on the same walls.
  // That is a dispatch, not a screen. A field host of ours on the ground is relief, and relief
  // fights: the caller's roll still settles the contact, so nothing is left undecided.
  if (ascent.routedGround?.[pending.landId] === ascent.wave
    && !state.armies.some((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy
      && army.landId === pending.landId && totalUnits(army) > 0)) return false;

  // Already holding a field: this one opens as a side front, under looser gates — see
  // `worthWatching`. The gates ration the player's attention, and a side front costs none.
  const asSide = Boolean(ascent.activeBattle && !ascent.activeBattle.over);
  if (!worthWatching(state, pending.landId, pending.isGreat, asSide)
    && !wouldCostUsTheProvince(state, pending.landId)) return false;

  // One watched engagement per province per wave.
  //
  // The cap exists because `maybeRequestBattleDecision` fires on every tick an invader stands on a
  // contested province, not once per battle, so a single siege of the capital used to raise the
  // modal again and again. But keying it on the wave alone meant a wave that struck three
  // provinces was watchable at exactly one of them, and combined with the field-host requirement
  // above, a measured run opened the battle screen **zero** times in 320 ticks. Keying it on the
  // province keeps the repeat-suppression that motivated the cap and lets a wave that attacks on
  // two fronts be fought on both.
  const watchKey = `${ascent.wave}:${pending.landId}`;
  if (ascent.lastWatchedKey === watchKey) return false;
  return raiseDefenceField(state, pending, watchKey, asSide);
}

/**
 * Whoever is nearest to being inside the walls of a province of ours, or nobody.
 *
 * The besieger first — a siege is the one attack that makes no contact and therefore raises no
 * fight of its own — then a host standing on the ground, then a column one province off that is
 * under invasion orders. Shared by the door below and by the war board, so a row the board draws
 * as enterable is enterable.
 */
export function fieldCandidateAt(state: GameState, landId: string): Army | undefined {
  const land = findLand(state, landId);
  if (!land || land.ownerId !== PLAYER_KINGDOM_ID) return undefined;
  const hostile = (army: Army): boolean => army.kingdomId !== PLAYER_KINGDOM_ID
    && !army.isLevy && totalUnits(army) > 0;
  const siege = state.siegeOrders.find((order) => order.landId === landId);
  const besieger = siege
    ? state.armies.find((army) => army.id === siege.armyId && hostile(army))
    : undefined;
  if (besieger) return besieger;
  const standingHere = state.armies.find((army) => hostile(army) && army.landId === landId);
  if (standingHere) return standingHere;
  const invading = new Set((state.invasions ?? []).map((record) => record.armyId));
  return state.armies.find((army) => hostile(army) && invading.has(army.id)
    && land.neighbors.includes(army.landId));
}

/**
 * Opens a field on a province the player has pointed at.
 *
 * **The door the gates never had.** `worthWatching` and `lastWatchedKey` ration the fights that
 * open *at* the player — deliberately, and that stays — but they were also the only way a fight
 * could exist at all, so ground the gates declined had no fight and therefore nothing to walk
 * onto. A siege is the worst case of it: the besieger stops making contact the moment it sits
 * down, so the one attack that can end the run was the one attack with no door. Reported
 * verbatim: *some battle i still can not control.*
 *
 * A ration on what the game interrupts you with is not a ration on what you may choose to do.
 * The cap still holds (three fields, four at the seat) because that one is about how many fights
 * a thumb can hold at once, and it is the player's own tap that spends it.
 */
export function openFieldAt(state: GameState, landId: string): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  const land = findLand(state, landId);
  if (!land) return false;
  // Already being fought: this is the same request as the board's other door, so answer it the
  // same way rather than refusing a tap that plainly means "put me on that field".
  //
  // Ownership is checked *first*, though. This branch short-circuited before any gate, so a fight
  // left standing on a province we no longer hold stayed enterable from the war board for as long
  // as it existed — the front half of the same defect `reconcileFronts` closes.
  if (battleAt(state, landId)) {
    if (land.ownerId !== PLAYER_KINGDOM_ID && battleAt(state, landId)?.role !== 'offence') return false;
    focusBattle(state, landId);
    return true;
  }
  if (!hasRoomForAnotherFront(state, landId)) return false;
  const invader = fieldCandidateAt(state, landId);
  if (!invader) return false;

  const pending: PendingBattle = {
    role: 'defence',
    invaderArmyId: invader.id,
    landId: land.id,
    landName: land.name,
    kingdomId: invader.kingdomId,
    kingdomName: state.kingdoms.find((kingdom) => kingdom.id === invader.kingdomId)?.name
      ?? invader.kingdomId,
    isGreat: false,
    attackerPower: 0,
    defenderPower: 0,
  };
  // Keyed on the turn, not the wave. The wave key is the ration on fights raised *at* the
  // player, and stamping it here would spend a ration this fight did not draw on — and would
  // then refuse the next contact on the same ground, handing it to the odds roll.
  const asSide = Boolean(ascent.activeBattle && !ascent.activeBattle.over);
  if (!raiseDefenceField(state, pending, `hold:${state.turn}:${land.id}`, asSide, true)) return false;
  return true;
}

/**
 * Stands a defence up on a province: enrols who is there, turns the walls out, files the field.
 *
 * Split out of `beginBattle` unchanged, so that the gates above it and the door beside it can
 * both reach it. `commanded` marks the field the player asked for by name: it takes the focus
 * instead of opening under a general, and it raises no second-front alert, because there is
 * nothing to announce to somebody about a thing they just pressed.
 */
function raiseDefenceField(
  state: GameState,
  pending: PendingBattle,
  watchKey: string,
  asSide: boolean,
  commanded = false,
): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  const invader = state.armies.find((army) => army.id === pending.invaderArmyId);
  if (!invader) return false;
  // Who is actually on the field. Rolled explicitly, because the invader that made contact is
  // standing on the *adjacent* province — keyed on the ground itself, every watched defence used
  // to open against nobody and end, as a hidden roll, inside the tick that opened it.
  const draft: AscentBattle = {
    ...emptyBattle(pending),
    role: 'defence',
    key: watchKey,
    // Read off the ground, not off which door was used: `openFieldAt` and `beginBattle` both land
    // here, and a fight on ground already being claimed is a retake however it was reached.
    // `reconcileFronts` needs this or it ends the fight the player just pressed for.
    retake: provinceIsFalling(state, pending.landId),
  };
  enrolArrivals(state, draft);
  if (theirHosts(state, draft).length === 0) return false;

  // The province's own walls turn out beside whatever host stands there — not only when nobody
  // does. Measured, a 333-man host standing in the capital *replaced* seventeen hundred men of
  // walls, because the levy was raised only for an empty province; the odds roll had always
  // counted both. Raised here, after every gate, so a fight that is not opened after all is
  // still rolled against walls counted once.
  const land = findLand(state, pending.landId);
  if (land && !state.armies.some((army) => army.isLevy && army.landId === land.id)) {
    raiseGarrisonLevy(state, land);
    enrolArrivals(state, draft);
  }
  const ours = ourHosts(state, draft);
  const defender = battleLine(state, draft);
  if (!defender) return false;

  // Neither ration is spent by a field the player opened themselves — see `openFieldAt`.
  if (!commanded) ascent.lastWatchedKey = watchKey;
  // The wave gap is the ration on *screens taken*, so only a fight that takes one spends it. A
  // side front stamping this would make the next wave's opening fight — the one the player is
  // actually meant to be in the room for — fail the gap it never used.
  if (!asSide && !commanded) ascent.lastWatchedWave = ascent.wave;

  // No reserve is held back any more: every man the side brought stands on the field from the
  // first beat, and the count the player chose is the count they see. The 28% held at camp was
  // a one-shot nobody could press — only a Moment or the general committed it — so to a player
  // it was a number that did not match their muster and then mysteriously grew. The rally is
  // whichever general is on the field, not whichever host happens to be largest.
  const fieldHosts = ours.filter((host) => !host.isLevy).sort((a, b) => totalUnits(b) - totalUnits(a));
  const theirs = theirHosts(state, draft);
  const oursTotal = ours.reduce((n, h) => n + totalUnits(h), 0);
  const theirsTotal = theirs.reduce((n, h) => n + totalUnits(h), 0);
  const scale = Math.min(1, (theirsTotal + oursTotal) / 2400);
  const totalRounds = Math.round(BATTLE_BASE_ROUNDS + (BATTLE_MAX_ROUNDS - BATTLE_BASE_ROUNDS) * scale);
  // Whoever actually commands here: the general of a host standing on the ground, or — when the
  // hosts are elsewhere and the province is turning out its own walls — the governor the player
  // posted to it. `fieldHosts` is kept as the first term so a relieving general still outranks the
  // resident, and `defenceCommanderOf` says the same thing to the header, the AI and the Reckoning.
  const general = defenceCommanderOf(state, land)
    ?? state.heroes.find((hero) => hero.id === fieldHosts.find((host) => host.generalHeroId)?.generalHeroId);

  const opened: AscentBattle = {
    ...draft,
    totalRounds,
    // Frozen at muster: a king who dies mid-fight does not change the man on the field.
    commanderTemper: temperOf(state, draft),
    theirFormation: doctrineOpening(state, draft) ?? openingShape(draft, theirsTotal),
    ourStartMorale: defender.morale,
    ourMorale: defender.morale,
    theirMorale: invader.morale,
    ourHostCount: ours.length,
    theirHostCount: theirs.length,
    // Summed across every host present, not just the strongest. Reading these off one army made
    // a two-column defence open showing only its vanguard's numbers.
    ourStart: oursTotal,
    theirStart: theirsTotal,
    ourNow: oursTotal,
    theirNow: theirsTotal,
    // Rally is the general's, so a host with nobody at its head simply does not get one.
    rallySpent: !general,
    rallyPower: general ? Math.round(BATTLE_RALLY_BASE + general.stats.martial * 0.25) : 0,
    // The ground the defender is standing on. Already used by `defenderPower`; stated on the
    // screen here so intercepting on high ground becomes a decision back on the map.
    terrainEdge: land ? terrainDefenseMultiplier(land) : 1,
  };
  // Who holds the dials, by standing order — see `handToGenerals`. A side front ignores this and
  // is always delegated (`addSideBattle`): there is nobody to grant a grace window to on a field
  // the player is not looking at.
  // …except a field the player pressed a button labelled *hold this one yourself* to open — and
  // except the arena, which is the practice yard: an unclaimed fight losing there is the lesson,
  // and the same reason `AscentTick`'s grace window skips it.
  opened.delegated = !commanded && !ascent.arena && ascent.handToGenerals !== false;
  if (opened.delegated) {
    // Same resolver as the maths above, or the screen would credit a defence to nobody while the
    // rally and the general AI were quietly using the governor's martial.
    const officer = defenceCommanderOf(state, land)
      ?? state.heroes.find((hero) => hero.id === ourHosts(state, opened).find((host) => host.generalHeroId)?.generalHeroId);
    opened.generalName = officer?.name;
    opened.generalMartial = officer ? officer.stats.martial : 45;
  }
  if (ascent.activeBattle && !ascent.activeBattle.over) {
    if (!addSideBattle(state, opened)) return false;
    // Asked for by name: the player is put on the field they pressed and the fight they were
    // watching steps back to its general. No alert and no hold either — the announcement exists
    // to tell somebody the war has spread, and they are the reason it just did.
    if (commanded) {
      ascent.frontsOpened = undefined;
      state.isStrategyPause = false;
      focusBattle(state, opened.landId);
    }
  } else {
    ascent.activeBattle = opened;
  }

  // The engagement now owns its own record: `finishBattle` rebuilds what the invasion code needs
  // from the battle itself. Leaving the pending record in place let the next tick "resolve" the
  // same fight a second time, underneath the one being watched.
  state.pendingBattle = undefined;
  state.isPaused = false;

  // Deliberately does *not* raise a prompt.
  //
  // A prompt goes through `drainAscentPrompts`, which sets `isPaused`, which stops
  // `ConquestScene.update` — and a frozen world is incompatible with marching reinforcements to
  // the fight. The battle is ordinary state now: the tick advances it, and the screen opens
  // itself when it starts (see `ConquestUIScene.maybeAutoOpenBattle`) and holds the world only
  // until the first order is given.
  pushToast(state, t('ascent.battle.begins', { land: pending.landName, kingdom: pending.kingdomName }), 'threat');

  // Relief marches itself. Requiring the player's host to be standing on the exact contested
  // province was one of the four gates that multiplied into a screen seen 0.8 times per run —
  // one army on a map of ten provinces is almost never on the right one. A host one province
  // away now turns for the fight on its own; `enrolArrivals` picks it up the beat it arrives, so
  // the map's real distances stay the clock and nothing teleports.
  summonAdjacentRelief(state, pending.landId);
  return true;
}

/**
 * A host of ours storming someone else's province, watched.
 *
 * Every offensive used to be a hidden roll by design (`worthWatching` admits only ground we
 * hold). The player's own attacks — a standing order to storm, a claim with a chosen host — now
 * open the same screen: our hosts stand on their origin and close on the walls, which are turned
 * out as a garrison levy sized to what the odds roll would have valued them at.
 */
function beginAssault(state: GameState, pending: PendingBattle): boolean {
  const ascent = state.ascent!;
  const land = findLand(state, pending.landId);
  const attackers = (pending.attackerArmyIds ?? [])
    .map((id) => state.armies.find((army) => army.id === id))
    .filter((army): army is Army => Boolean(army && army.kingdomId === PLAYER_KINGDOM_ID && totalUnits(army) > 0));
  if (!land || attackers.length === 0) return false;

  const key = `off:${state.turn}:${pending.landId}`;
  const draft: AscentBattle = {
    ...emptyBattle(pending),
    role: 'offence',
    key,
    ourArmyIds: attackers.map((army) => army.id),
    approachBeats: 0,
  };
  // The walls stand up to be fought. Only once: a second assault on the same province while
  // one garrison is still on its feet fights that garrison.
  if (!state.armies.some((army) => army.isLevy && army.kingdomId !== PLAYER_KINGDOM_ID && army.landId === land.id)) {
    raiseEnemyGarrisonLevy(state, land);
  }
  enrolArrivals(state, draft);
  const theirs = theirHosts(state, draft);
  const ours = ourHosts(state, draft);
  const line = battleLine(state, draft);
  if (!line || theirs.length === 0) return false;

  ascent.lastAssaultKey = key;
  const fieldHosts = ours.slice().sort((a, b) => totalUnits(b) - totalUnits(a));

  const oursTotal = ours.reduce((n, h) => n + totalUnits(h), 0);
  const theirsTotal = theirs.reduce((n, h) => n + totalUnits(h), 0);
  const scale = Math.min(1, (theirsTotal + oursTotal) / 2400);
  const totalRounds = Math.round(BATTLE_BASE_ROUNDS + (BATTLE_MAX_ROUNDS - BATTLE_BASE_ROUNDS) * scale);
  const generalId = fieldHosts.find((host) => host.generalHeroId)?.generalHeroId;
  const general = state.heroes.find((hero) => hero.id === generalId);

  // An assault is the player's own order, so it takes the focus and whatever defence they were
  // watching steps back to its general. Nobody marches on a city by accident.
  const standing = ascent.activeBattle;
  ascent.activeBattle = {
    ...draft,
    totalRounds,
    commanderTemper: temperOf(state, draft),
    theirFormation: doctrineOpening(state, draft) ?? openingShape(draft, theirsTotal),
    ourStartMorale: line.morale,
    ourMorale: line.morale,
    theirMorale: theirs[0].morale,
    ourHostCount: ours.length,
    theirHostCount: theirs.length,
    ourStart: oursTotal,
    theirStart: theirsTotal,
    ourNow: oursTotal,
    theirNow: theirsTotal,
    rallySpent: !general,
    rallyPower: general ? Math.round(BATTLE_RALLY_BASE + general.stats.martial * 0.25) : 0,
    // The ground is theirs this time: the edge goes to the walls, not to us.
    terrainEdge: terrainDefenseMultiplier(land),
  };
  // The same standing order the defences open under: an assault is still a fight, and a player
  // who has handed the war to their generals has handed this one over too.
  if (ascent.activeBattle) {
    ascent.activeBattle.delegated = !ascent.arena && ascent.handToGenerals !== false;
    ascent.activeBattle.generalName = general?.name;
    ascent.activeBattle.generalMartial = general ? general.stats.martial : 45;
  }
  if (standing && !standing.over) {
    standing.delegated = true;
    (ascent.sideBattles ??= []).push(standing);
  }
  state.pendingBattle = undefined;
  state.isPaused = false;
  pushToast(state, t('ascent.battle.assaultBegins', { land: land.name }), 'threat');
  return true;
}

/** A battle at its opening beat, before anyone has been counted. */
function emptyBattle(pending: PendingBattle): AscentBattle {
  return {
    landId: pending.landId,
    landName: pending.landName,
    invaderArmyId: pending.invaderArmyId,
    kingdomId: pending.kingdomId,
    kingdomName: pending.kingdomName,
    isGreat: pending.isGreat,
    round: 0,
    totalRounds: BATTLE_BASE_ROUNDS,
    // Opens balanced and in the hedge: the one shape every doctrine can form, and the tempo that
    // commits to nothing. A fight that begins already leaning has made the first decision for you.
    // Both sides open flat, and that is a deliberate, load-bearing change.
    //
    // The old dock opened on `hold` while the invader's doctrine opened on `press`, and under the
    // retired ring **hold countered press** — so an engagement nobody steered was a free 2.71-to-1
    // win for the player before a single order was given. Measured on the old constants:
    // ourShare 0.550 against theirShare 1.490.
    //
    // The document removes stance-countering on purpose: tempo decides how fast the men are spent,
    // shape decides which way. At even shape two symmetric defaults can only be level, and level is
    // the honest answer — "play moves a fight by about a third, it does not overturn one".
    //
    // The consequence is real and is not a bug: an unattended fight in Dragon Ascent now returns
    // roughly a coin flip where it used to be a rout in the player's favour, and the mode's economy
    // was tuned against the rout. See the note in the changelog; re-tuning it is separate work.
    stance: 'balanced',
    theirStance: 'balanced',
    ourFormation: 'chong',
    theirFormation: 'chong',
    brokenHostIds: [],
    ourLostTotal: 0,
    ourStartMorale: 0,
    ourAdvance: 0,
    theirAdvance: 0,
    ourMorale: 0,
    theirMorale: 0,
    ourHostCount: 0,
    theirHostCount: 0,
    ourStart: 0,
    theirStart: 0,
    ourNow: 0,
    theirNow: 0,
    // Retired: nobody is held at camp any more. The fields stay for save compatibility and
    // always read as empty and spent.
    reserve: { spearmen: 0, archers: 0, heavyInfantry: 0 },
    reserveSpent: true,
    rallySpent: true,
    rallyPower: 0,
    terrainEdge: 1,
    outcome: 'fighting',
    log: [],
    over: false,
    ourArmyIds: [],
    theirArmyIds: [],
  };
}

/** The invasion record a finished fight hands back to the shared invasion code. */
function battleRecord(battle: AscentBattle, invaderArmyId = battle.invaderArmyId): PendingBattle {
  return {
    invaderArmyId,
    landId: battle.landId,
    landName: battle.landName,
    kingdomId: battle.kingdomId,
    kingdomName: battle.kingdomName,
    isGreat: battle.isGreat,
    attackerPower: 0,
    defenderPower: 0,
  };
}

/** Orders idle player hosts on neighbouring provinces to march to the contested one. */
export function summonAdjacentRelief(state: GameState, landId: string): void {
  const land = findLand(state, landId);
  if (!land) return;
  const neighbours = new Set(land.neighbors);
  const capitalId = state.ascent?.capitalLandId;
  const candidates = state.armies.filter(
    (army) => army.kingdomId === PLAYER_KINGDOM_ID
      && !army.isLevy
      && neighbours.has(army.landId)
      // The seat keeps its garrison. Relief drawn from the capital left it to a roll it lost,
      // and the run ended while its hosts were winning the fight next door.
      && army.landId !== capitalId
      // Only hosts the autopilot may move, or one whose own standing order is to defend this very
      // province: a host told to hold its ground, or to go somewhere else, is not pulled off it.
      // An auxiliary is never an auto host — see `isAutoHost` — but running at the nearest
      // fighting is the whole of what it does, so it is named here explicitly.
      && (isAutoHost(army) || Boolean(army.patron) || (army.orders?.kind === 'defend' && army.orders.landId === landId))
      && totalUnits(army) > 0
      && !state.movementOrders.some((order) => order.armyId === army.id)
      && !state.siegeOrders.some((order) => order.armyId === army.id),
  );
  for (const army of candidates.slice(0, 2)) {
    if (issueMoveOrder(state, army.id, landId)) {
      pushToast(state, t('ascent.battle.relief', { name: army.name, land: land.name }), 'info');
    }
  }
}

/**
 * What the invader decides to do this beat.
 *
 * Until now the enemy had no posture at all: it advanced, it traded on fixed multipliers, and
 * it never reacted to anything. Beating something that cannot respond is arithmetic rather than
 * skill, and it was the single largest thing holding this screen at 7.
 *
 * Doctrine comes from `kingdom.personality`, which already exists with six values and an
 * established weighting precedent (`personalityWeight`, InvasionSystem). On top of the
 * personality sits a reactive layer both share — press a line that is wavering, steady your own
 * when it is — so the player is reading an opponent rather than a script.
 *
 * The invader deliberately gets no reserve and no rally. That asymmetry is the player's edge,
 * and it is what keeps a fair fight winnable.
 */
function enemyStance(state: GameState, battle: AscentBattle): FieldStance {
  const kingdom = state.kingdoms.find((candidate) => candidate.id === battle.kingdomId);
  const personality = kingdom?.personality ?? 'aggressive';
  const theirEdge = battle.theirMorale - battle.ourMorale;

  // Dồn sức plays to kill: while his wager stands he presses, whatever his doctrine says — the
  // whole point of doubling down is spending men faster while the shape is his. Read here, in
  // the one function the telegraph shares with the beat, so the screen's promise stays honest.
  if (battle.theirCommitted) return 'press';

  // Every branch is deterministic on state the player can see. That is what keeps the ring a read
  // rather than a guessing game: `battleTelegraph` shows this same value before the beat resolves,
  // and it must be the stance actually taken or the whole thing collapses into a coin flip.
  const bows = theirBowShare(state, battle);

  // Tempo follows the shape, for them exactly as the document asks it to for us.
  //
  // Without this the invader pressed on nearly every beat of nearly every fight, and pressing is a
  // far better trade than it used to be (1.55 dealt against the old 1.12). The old ring hid that:
  // the *player's* default stance countered the invader's default stance, so an unattended fight
  // was a free 2.7-to-1 win. Tempo cannot be countered any more — only shape can — so an enemy
  // that presses regardless is simply stronger than one that reads the board, and a fight nobody
  // was steering swung from 2.7:1 for the player to 1.1:1 against.
  //
  // Reading the tilt first fixes it at the source and keeps every property the telegraph needs:
  // deterministic, visible, and stable across a run.
  if (!reforming(battle.reformBeats) && !reforming(battle.theirReformBeats)) {
    const sign = formationTiltSign(battle.theirFormation, battle.ourFormation);
    // The stubborn never gambles, even on a winning tilt — which hands the player long windows
    // and dares them to overspend their dock into them. Every other temper converts.
    if (sign > 0) return BATTLE_TEMPER[temperOf(state, battle)].presses ? 'press' : 'balanced';
    if (sign < 0) return theirEdge > 25 ? 'balanced' : 'defend';
    // Even shape and the player has gone passive: EVERY doctrine presses. A line that has stopped
    // answering is not a stalemate, it is an opportunity — pressing into a defended mirror trades
    // 1.55×0.55 dealt against 0.50×1.40 taken, favourable at any size. This is what makes turtling
    // a phase you pay for rather than a policy you retire on: the wind harness's mirror-turtle
    // out-shot a passive invader with its bows and won on heart until this branch existed.
    // Deterministic on the stance the screen already prints, so the telegraph stays honest.
    //
    // A player who has NEVER ordered a shape is the passive line at its most absolute — measured,
    // mirror openings against an untouched dock were a fuzz coin-flip the sleeping player won
    // often enough to matter, because the invader sat content at even shape all fight.
    //
    // "Never ordered" means NEITHER dial. This read the shape clock alone, so a player fighting
    // the whole engagement on the tempo dial — bracing, pressing, never re-forming — was treated
    // as asleep: pressed at 1.55/1.40 on every even beat, no hesitation, no window. Measured in
    // `battle-lab` (2026-09-04) that is why the brace and charge cells of the ring grid scored
    // 1-2% against every doctrine while the one stance that happens to order a shape scored the
    // rest: the grid was grading "did you touch the dock", not the ring.
    if (battle.stance === 'defend' || battle.stance === 'withdraw'
      || (battle.beatsSinceOurShape === undefined && !battle.steeredStance)) return 'press';
    // Even shape against an active player buys nothing by spending faster. Aggressive powers still
    // press once they are ahead on heart, which is what keeps a personality learnable across a run.
    if (personality === 'aggressive' || personality === 'expansionist') {
      return theirEdge > 12 ? 'press' : 'balanced';
    }
  }

  switch (personality) {
    // Cautious powers spend other people's soldiers reluctantly: they stand off and shoot while
    // they have the archers for it, and only close when clearly ahead.
    case 'economic':
    case 'diplomatic':
      if (theirEdge > 18) return 'press';
      return bows > 0.3 ? 'balanced' : 'defend';
    // A defensive doctrine shoots first and only closes once it has the upper hand.
    case 'defensive':
      if (theirEdge > 8) return 'press';
      return bows > 0.22 ? 'balanced' : 'defend';
    // Aggressive and expansionist powers come on hard, and only steady up if badly beaten.
    default:
      return theirEdge < -20 ? 'defend' : 'press';
  }
}

/**
 * How one side's arms meet the other's, summed across every host on the field.
 *
 * `compositionMatchup` compares two hosts; a field can hold several a side, so the two sides are
 * pooled into one notional force each. Pooling rather than averaging per-pair, because a wing of
 * archers behind a wall of spears is one army's composition, not two armies' worth of separate
 * matchups.
 */
function matchupAcross(mine: Army[], theirs: Army[]): number {
  const pool = (hosts: Army[]): { spearmen: number; archers: number; heavyInfantry: number } => hosts.reduce(
    (total, host) => ({
      spearmen: total.spearmen + host.units.spearmen,
      archers: total.archers + host.units.archers,
      heavyInfantry: total.heavyInfantry + host.units.heavyInfantry,
    }),
    { spearmen: 0, archers: 0, heavyInfantry: 0 },
  );
  const foe = pool(theirs);
  if (foe.spearmen + foe.archers + foe.heavyInfantry <= 0) return 1;
  return compositionMatchup(pool(mine), { units: foe } as Army);
}

/** The trade a stance makes. Tempo only — the ring is a separate term entirely. */
function tradeFor(stance: FieldStance): { dealt: number; taken: number } {
  return BATTLE_STANCE_TRADE[stance] ?? BATTLE_STANCE_TRADE.balanced;
}

/**
 * A host in transit has no shape at all.
 *
 * Not "the shape it left" and not "the shape it is heading for" — men walking between blocks are in
 * neither, which is the whole cost of the fast dial and the reason changing shape is a decision
 * rather than a reflex.
 */
function reforming(beats?: number): boolean {
  return (beats ?? 0) > 0;
}

/**
 * Stamina: what a change of shape costs, and the only thing it costs.
 *
 * Two pips. Every change of formation spends one, whatever the shape, whatever the distance;
 * a pip comes back on its own every `BATTLE_STAMINA_REGEN_BEATS`, whatever the stance. That is the
 * whole rule — and it replaces the per-shape wind of docs/19, whose five clocks, stance-driven
 * recovery and match exception were three rules too many for a screen read at speed: nobody knew
 * why a chip was grey or what to do about it. With two pips the penalty for changing shape too
 * fast is simply having no pip when the next answer is needed, and the smart move in that wait —
 * Cố thủ, to bleed less until a pip returns — is on the screen already.
 *
 * Stance never touches stamina. Nothing but the clock refills it. Predictable on purpose.
 */
function staminaOf(battle: AscentBattle): number {
  return battle.stamina ?? BATTLE_STAMINA_MAX;
}

/** A pip comes back on its own clock, and only while one is missing. */
function regainStamina(battle: AscentBattle): void {
  const pips = staminaOf(battle);
  if (pips >= BATTLE_STAMINA_MAX) {
    battle.staminaClock = undefined;
    return;
  }
  battle.staminaClock = (battle.staminaClock ?? BATTLE_STAMINA_REGEN_BEATS) - 1;
  if (battle.staminaClock <= 0) {
    battle.stamina = pips + 1;
    battle.staminaClock = battle.stamina < BATTLE_STAMINA_MAX ? BATTLE_STAMINA_REGEN_BEATS : undefined;
  }
}


/**
 * The invader's temper: his kingdom's personality worn on the field, told to the player beside
 * his name on the strength rail. Great waves are always `cunning` — the graduation exam.
 */
function temperOf(state: GameState, battle: AscentBattle): CommanderTemper {
  if (battle.commanderTemper) return battle.commanderTemper;
  if (battle.isGreat) return 'cunning';
  const kingdom = state.kingdoms.find((candidate) => candidate.id === battle.kingdomId);
  switch (kingdom?.personality) {
    case 'aggressive':
    case 'expansionist':
      return 'hasty';
    case 'defensive':
      return 'stubborn';
    default:
      return 'measured';
  }
}

/**
 * The counter tier this beat, before sizing: ±2 strong, ±1 soft, 0 while either side walks.
 * Positive is ours. Split out of `formationTilt` because the morale drip scales on it too.
 */
function counterTier(battle: AscentBattle): number {
  if (reforming(battle.reformBeats) || reforming(battle.theirReformBeats)) return 0;
  return formationTier(battle.ourFormation, battle.theirFormation);
}

/**
 * Which way the exchange leans this beat. Positive is ours.
 *
 * Zero while **either** side is re-forming — a counter is worth nothing against men who are not in
 * a formation to be countered, and it is worth nothing to you if you are not in one to counter
 * with. The near answer (one step round the ring) leans at full size, the far one (two steps) at
 * half — `tier / 2` — so a Moment's `sharpen` raises the *size* and a sharpened soft counter is
 * 0.21, not 0.42. A Moment's `guard` still floors a losing tilt at zero.
 *
 * Exported for the harnesses: this is the ONE place the wager and the stance's risk dial land,
 * so the exchange, the telegraph and the dock's price line cannot disagree about either.
 */
export function formationTilt(battle: AscentBattle): number {
  const tier = counterTier(battle);
  if (tier === 0) return 0;

  const bonus = battle.momentBonus;
  // A guard cannot be turned against us: the floor a `steady` answer buys.
  if (tier < 0 && (bonus?.guardBeats ?? 0) > 0) return 0;

  const size = (bonus?.sharpBeats ?? 0) > 0 ? BATTLE_FORMATION_TILT_SHARP : BATTLE_FORMATION_TILT;
  // Dồn sức amplifies the tilt both ways — here, at the single source, so the exchange, the
  // telegraph and the dock's price line cannot disagree about what the wager is doing.
  const wager = battle.committed ? BATTLE_COMMIT_AMPLIFY : 1;
  // The invader's own wager, same coin, same both-ways honesty: doubling onto a shape that gets
  // countered mid-stand pays the counter out amplified. See `advanceEnemyWager` for when he dares.
  const foeWager = battle.theirCommitted ? BATTLE_COMMIT_AMPLIFY : 1;
  // The stance's risk dial — the same bet made persistent. Press lets the matchup's whole
  // verdict through amplified: your winning counter AND the one standing against you. Digging in
  // blunts both, honestly — the turtle trades its shield for its sword. OUR stance only: the
  // enemy's aggression reaches the exchange through his tempo trade (`BATTLE_STANCE_TRADE`),
  // and two risk factors on one shared tilt would breach the `(1 ± tilt) > 0` bound.
  const risk = BATTLE_STANCE_RISK[battle.stance] ?? 1;
  // Clamped because the exchange carries `(1 ± tilt)` and it must never go negative — the old
  // bound (sharp × wager × press = 0.907) held by construction until the enemy's wager could
  // stack on the player's. Two simultaneous wagers on a sharpened press are the one case that
  // breaches it, and a hard stop at the source beats every caller re-deriving the safety.
  const raw = (tier / 2) * size * wager * foeWager * risk;
  return Math.max(-0.92, Math.min(0.92, raw));
}

/**
 * Both dials, advanced one beat, before anything is resolved.
 *
 * The order matters: a stance ordered last beat lands *now* and only then starts its lock, and a
 * formation whose clock reaches zero is in shape *for* this beat rather than after it. Getting this
 * backwards would make every order arrive one beat later than the screen said it would.
 */
function advanceStance(battle: AscentBattle): void {
  // Tempo: slow to order, instant to complete. No lock any more — the wind clock is the whole of
  // the cadence now, and the dial that exists to cut your losses must never be the one the game
  // takes away.
  if (battle.stancePending) {
    battle.stance = battle.stancePending;
    battle.stancePending = undefined;
  }
}

/**
 * The formation clocks, ticked at the **end** of the beat the transit was paid on.
 *
 * The other half of `advanceStance`, and deliberately at the other end of the beat. A stance lands
 * at the top and is in force for the beat that follows the order; a shape must still be *walking*
 * for the beat it was ordered into, or a one-beat re-form would arrive without ever paying the
 * transit — which is exactly what `verify-battle-dials` caught: the host was in Thế Quy on the
 * first beat after the order, with full tilt and no penalty, and the fast dial was free.
 *
 * Order at beat N, walk through beat N+1 with no shape at all, stand in it from beat N+2.
 */
function settleFormations(battle: AscentBattle): void {
  if (reforming(battle.reformBeats)) {
    battle.reformBeats = (battle.reformBeats ?? 0) - 1;
    if (!reforming(battle.reformBeats) && battle.formationTarget) {
      battle.ourFormation = battle.formationTarget;
      battle.formationTarget = undefined;
      markFormationLanded(battle);
      battle.log.push(t('ascent.battle.reformDone', {
        shape: t(`ascent.formation.${battle.ourFormation}.full` as Parameters<typeof t>[0]),
      }));
    }
  }
  if (reforming(battle.theirReformBeats)) {
    battle.theirReformBeats = (battle.theirReformBeats ?? 0) - 1;
    if (!reforming(battle.theirReformBeats) && battle.theirFormationTarget) {
      battle.theirFormation = battle.theirFormationTarget;
      battle.theirFormationTarget = undefined;
    }
  }
  if ((battle.theirShapeLockBeats ?? 0) > 0) {
    battle.theirShapeLockBeats = (battle.theirShapeLockBeats ?? 0) - 1;
  }
  regainStamina(battle);
  const bonus = battle.momentBonus;
  if (bonus) {
    if ((bonus.sharpBeats ?? 0) > 0) bonus.sharpBeats = (bonus.sharpBeats ?? 0) - 1;
    if ((bonus.guardBeats ?? 0) > 0) bonus.guardBeats = (bonus.guardBeats ?? 0) - 1;
  }
}

/**
 * The shape the invader walks into next, and the clock it walks on.
 *
 * Deterministic on state the player can see — their personality, the morale edge, our held shape
 * and what is left of their own blocks. **Never a `Math.random` draw**: `battleTelegraph` prints
 * this before the beat resolves and it must be what actually happens, and a draw here would shift
 * the RNG call order for every mode's regression fingerprint.
 *
 * They answer our shape rather than guessing at it, which is what makes the fight a conversation:
 * you counter them, they counter back, and the question each time is whether the beats are worth it.
 */
function advanceEnemyFormation(state: GameState, battle: AscentBattle, theirs: Army[]): void {
  if (reforming(battle.theirReformBeats)) return;
  // A Moment can freeze them: three beats of knowing exactly what you are answering.
  if ((battle.theirShapeLockBeats ?? 0) > 0) return;

  /**
    * Only when they are actually losing the matchup. An invader that re-forms on every beat it
    * could is an invader permanently in transit, which is its own kind of free win.
    *
    * Nightmare takes the even case too — see `battleAnswersEven`. There is no beat on that setting
    * where the enemy is content to stand where they are.
    */
  const temper = BATTLE_TEMPER[temperOf(state, battle)];
  const tilt = formationTier(battle.theirFormation, battle.ourFormation);
  // He HOLDS while he is winning. That is the whole of his character as an opponent: while the
  // matchup favours him he gives nothing away — no bubble, no walk, no tell — and the player has
  // to notice from the losses alone that something must change. Restless rotation on a timer
  // was tried and retired: it handed the player a prompt every few beats, and the game stopped
  // being a read.
  //
  // An even shape against a dock NOBODY HAS TOUCHED is not a stalemate he respects on any
  // difficulty — the mirror was the sleeping player's best friend: measured, every chong-v-chong
  // opening against an idle dock ground out an auto win on the general's aura alone, because the
  // invader pressed but never re-formed. A player who has ordered even once keeps medium's
  // even-shape rest; the difficulty dial is untouched for anyone actually playing.
  // Neither dial, not just the shape dial — see the same rule in `enemyStance`.
  const idleDock = battle.beatsSinceOurShape === undefined && !battle.steeredStance;
  if (tilt > 0 || (tilt === 0 && !battleAnswersEven() && !idleDock)) return;

  // Difficulty is how fast the enemy answers your shape, and nothing else — see `battleOptions`.
  // The walk itself is a flat beat now, so the dial moved from walk length to HESITATION: beats
  // the invader stands countered before ordering, his temper's patience plus the difficulty's.
  // `beatsSinceOurShape` resets when we order, so easy invaders answer a settled shape and never
  // a fresh one, and the tilt window that used to be spent watching them walk (tilt 0 for both)
  // is spent actually countering them.
  const hesitation = Math.max(0, 1 + temper.hesitation + battleReactDelay());
  if ((battle.beatsSinceOurShape ?? 99) < hesitation) return;

  void theirs;
  // They answer the shape we are **standing in**, never the one we are walking towards.
  //
  // Reading `formationTarget` made them omniscient: they began countering a shape before it had
  // even formed, so a player who changed shape arrived to find the answer already waiting and could
  // never hold a winning matchup for a single beat. Measured in `battle-lab`, that alone put
  // skilled play at a 10.8% win rate with every fixed policy at zero.
  //
  // Reading the arrived shape gives the player the window the whole design depends on: counter,
  // hold it while they walk, and spend the advantage before they get there.
  const wanted = countersTo(battle.ourFormation)[0];
  if (!wanted || wanted === battle.theirFormation) return;
  //

  battle.theirFormationTarget = wanted;
  // Two, not one — and the difference is visibility, not speed. This order is placed INSIDE the
  // beat that will also settle it: at 1 the walk would start and land within a single fightRound,
  // and the telegraph would never once show `next` to the player — the read the whole ring is
  // played from. At 2 the order beat is the first walking beat and the walk crosses exactly one
  // readable boundary, which is the same one visible walking beat the player's own orders get
  // (theirs are placed BETWEEN beats). verify-battle-dials fight two watches this promise land.
  battle.theirReformBeats = 2;
}

/**
 * The invader's dồn sức — the user's own words for it: "sometimes they see us not change
 * formation, they push into the winning formation to have more kill."
 *
 * Deterministic on state the player can see, like every enemy decision, so the telegraph and the
 * price line stay honest. He dares it only when ALL of these hold:
 *   · the shape is his (`tier > 0` for him) and neither side is walking;
 *   · his temper gambles at all — the stubborn never wagers, exactly as he never presses;
 *   · the difficulty allows it (`battleEnemyWagerAfter`, null on easy) and the player has stood
 *     idle on the formation dial that long — an answering player never sees it;
 *   · his last wager is off cooldown (`theirWagerClock`, the same regen rhythm as a player pip).
 *
 * It folds like the player's: either side re-forming ends it, and so does his own heart failing —
 * a line that is starting to lose does not double down, it pulls back to `defend` through
 * `enemyStance`'s ordinary reads.
 */
function advanceEnemyWager(state: GameState, battle: AscentBattle): void {
  const walking = reforming(battle.reformBeats) || reforming(battle.theirReformBeats);
  const theirEdge = battle.theirMorale - battle.ourMorale;
  if (battle.theirCommitted) {
    if (walking || theirEdge < -15 || formationTier(battle.theirFormation, battle.ourFormation) <= 0) {
      battle.theirCommitted = false;
      battle.theirWagerClock = BATTLE_STAMINA_REGEN_BEATS;
    }
    return;
  }
  if ((battle.theirWagerClock ?? 0) > 0) {
    battle.theirWagerClock = (battle.theirWagerClock ?? 0) - 1;
    return;
  }
  const after = battleEnemyWagerAfter();
  if (after === null || walking) return;
  if (!BATTLE_TEMPER[temperOf(state, battle)].presses) return;
  if (formationTier(battle.theirFormation, battle.ourFormation) <= 0) return;
  // A dial never touched reads as endlessly idle — the wager exists precisely for the player who
  // is not answering, and the untouched fight is that player at their most absolute.
  if ((battle.beatsSinceOurShape ?? 99) < after) return;
  battle.theirCommitted = true;
  battle.log.push(t('ascent.battle.enemyCommits'));
}

/** What share of the invader's strength is bowmen — the thing that decides whether they stand off. */
function theirBowShare(state: GameState, battle: AscentBattle): number {
  const hosts = theirHosts(state, battle);
  const men = hosts.reduce((total, host) => total + totalUnits(host), 0);
  if (men <= 0) return 0;
  return hosts.reduce((total, host) => total + host.units.archers, 0) / men;
}

/**
 * The stance the invader will take on the next beat, for the screen to print.
 *
 * Resolved from the same function the fight uses and nothing else. A telegraph that could differ
 * from what happens is worse than none: it would teach the player a rule the game does not keep.
 */
export interface BattleTelegraph {
  /** The tempo they will fight the next beat at. */
  stance: FieldStance;
  /** The shape they are standing in now. */
  formation: BattleFormation;
  /** The shape they are walking into, if they are walking. */
  next?: BattleFormation;
  /** Beats until `next` lands. Zero when they are already in shape. */
  beatsLeft: number;
}

export function battleTelegraph(state: GameState): BattleTelegraph | undefined {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) return undefined;
  const offence = battle.role === 'offence';
  const theirs = theirHosts(state, battle);
  if (theirs.length === 0) return undefined;
  const stance = offence && theirs.every((host) => host.isLevy) ? 'defend' : enemyStance(state, battle);
  return {
    stance,
    formation: battle.theirFormation,
    next: battle.theirFormationTarget,
    beatsLeft: battle.theirReformBeats ?? 0,
  };
}

/** Strips a share of a host's strength, spread across its unit types. */
function bleed(army: Army, share: number): number {
  const before = totalUnits(army);
  const keep = Math.max(0, 1 - share);
  army.units.spearmen = Math.floor(army.units.spearmen * keep);
  army.units.archers = Math.floor(army.units.archers * keep);
  army.units.heavyInfantry = Math.floor(army.units.heavyInfantry * keep);
  return before - totalUnits(army);
}

/** Kills a flat number of men, taken from the front ranks first. */
function bleedCount(army: Army, count: number): number {
  const before = totalUnits(army);
  let left = Math.max(0, Math.round(count));
  for (const key of ['spearmen', 'heavyInfantry', 'archers'] as const) {
    const take = Math.min(army.units[key], left);
    army.units[key] -= take;
    left -= take;
    if (left <= 0) break;
  }
  return before - totalUnits(army);
}

/**
 * Morale is written straight onto the army, not held beside it.
 *
 * `armyPower` reads `army.morale`, so this is what makes a failing line get weaker as it fails —
 * the compounding collapse that gives the fight a shape. It also means the state of a host
 * coming out of a battle is carried by the same field every other system already reads.
 */
function setMorale(army: Army, value: number): number {
  const next = Math.max(0, Math.min(100, value));
  army.morale = next;
  return next;
}

// ── Moments: a decision with a deadline ─────────────────────────────────────

/**
 * Does the fight have a question worth asking right now, and which one?
 *
 * Every trigger reads state `fightRound` already computes. What changed is the size of the deck:
 * there were three questions, each fired once, so a player two fights into a run had already read
 * every card the mode would ever show them. Thirty now, in `data/ascent/battleMoments.ts`, drawn at
 * random from whichever are true — see the note there.
 *
 * The draw is seeded off the fight rather than off `Math.random`. Not for reproducibility's own
 * sake: the simulation's random call order is a fixture that every mode's regression fingerprint
 * depends on, and adding a roll here would move all four of them for a feature that only exists in
 * one. This costs nothing — the seed already varies per fight, per beat and per question asked.
 */
function raiseMoment(state: GameState, battle: AscentBattle, ours: Army[], theirs: Army[]): void {
  if (battle.moment || battle.over) return;
  const budget = battle.isGreat ? BATTLE_MOMENTS_PER_GREAT_FIGHT : BATTLE_MOMENTS_PER_FIGHT;
  if ((battle.momentsRaised ?? 0) >= budget) return;
  // Never on the opening beats: a fight that begins with a decision has not earned one yet.
  //
  // Measured against the *whole* fight rather than against `battle.round`, which does not count
  // the approach — the fight's own comment says so: "the approach does not spend the round
  // budget". So every question about the approach (the volleys, the crossing, catching them
  // striking camp) was gated behind a counter that is still zero while the approach is happening.
  // Five of the thirty were unreachable for that reason alone.
  const beat = (battle.approachBeats ?? 0) + battle.round;
  if (beat < BATTLE_MOMENT_EARLIEST) return;
  // And spaced, so the budget is not spent in the first six beats of a twenty-six beat fight.
  if (battle.momentLastBeat !== undefined && beat - battle.momentLastBeat < BATTLE_MOMENT_GAP) return;

  const asked = battle.momentIds ?? [];
  const context = momentContext(state, battle, ours, theirs);
  let pool = eligibleMoments(context, asked);
  // One question about the approach per fight, at most — see `BattleMomentDef.opening`.
  if (asked.some((id) => BATTLE_MOMENTS.find((def) => def.id === id)?.opening)) {
    pool = pool.filter((def) => !def.opening);
  }
  if (pool.length === 0) return;

  const chosen = pickMoment(pool, momentSeed(battle));
  const general = state.heroes.find((hero) => hero.id === ours.find((host) => host.generalHeroId)?.generalHeroId);

  setMoment(battle, {
    id: chosen.id,
    raisedAtBeat: battle.round,
    ticksLeft: BATTLE_MOMENT_TICKS,
    generalName: general ? general.name : undefined,
    generalMartial: general ? general.stats.martial : (battle.delegated ? battle.generalMartial ?? 45 : 0),
    hostId: chosen.hostId?.(context),
    subject: chosen.subject?.(context),
  });
  battle.momentLastBeat = beat;
}

/** Everything the deck's triggers are allowed to read, gathered once. */
function momentContext(
  state: GameState, battle: AscentBattle, ours: Army[], theirs: Army[],
): MomentContext {
  const land = state.lands.find((candidate) => candidate.id === battle.landId);
  const terrain = land?.terrainSummary;
  const wet = terrain ? terrain.riceFields + terrain.water + terrain.fields : 0;
  const broken = terrain ? terrain.forest + terrain.hills + terrain.mountains : 0;
  const ourNow = ours.reduce((n, host) => n + totalUnits(host), 0);
  const theirNow = theirs.reduce((n, host) => n + totalUnits(host), 0);
  return {
    battle,
    ours,
    theirs,
    round: battle.round,
    // The whole fight's clock, approach included — `round` stays at zero until the lines meet.
    beat: (battle.approachBeats ?? 0) + battle.round,
    left: battle.totalRounds - battle.round,
    phase: battle.ourAdvance + battle.theirAdvance >= 1 ? 'clash' : 'approach',
    ourMorale: battle.ourMorale,
    theirMorale: battle.theirMorale,
    ourNow,
    theirNow,
    odds: theirNow / Math.max(1, ourNow),
    ourSpent: 1 - ourNow / Math.max(1, battle.ourStart),
    theirSpent: 1 - theirNow / Math.max(1, battle.theirStart),
    // The band has to be wide: a host breaks at `BATTLE_ROUT_MORALE` and one bad exchange can
    // carry it from fifty to thirty in a single beat, so a narrow window is simply stepped over.
    wavering: theirs.find((host) => host.morale <= BATTLE_ROUT_MORALE + 18),
    failing: ours.find((host) => host.morale <= BATTLE_ROUT_MORALE + 18),
    terrainEdge: battle.terrainEdge,
    wetGround: wet > broken,
    brokenGround: broken >= wet,
    isGreat: Boolean(battle.isGreat),
    role: battle.role ?? 'defence',
    arms: battle.ourMatchup ?? 1,
    // The board itself, so a question can be about the very thing the player is looking at.
    ourFormation: battle.ourFormation,
    theirFormation: battle.theirFormation,
  };
}

/**
 * A weighted draw with no `Math.random` in it.
 *
 * mulberry32, inline, because `src/systems` imports nothing from the UI and this is four lines.
 */
function pickMoment(pool: BattleMomentDef[], seed: number): BattleMomentDef {
  let s = (seed >>> 0) || 1;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const roll = ((t ^ (t >>> 14)) >>> 0) / 4294967296;

  const total = pool.reduce((sum, def) => sum + (def.weight ?? 1), 0);
  let cursor = roll * total;
  for (const def of pool) {
    cursor -= def.weight ?? 1;
    if (cursor <= 0) return def;
  }
  return pool[pool.length - 1];
}

/**
 * The shape the invader opens in — any of the five, never always the hedge.
 *
 * Both sides used to open in Thế Chông, so the enemy's first bubble said the same thing every
 * fight and the opening order was a reflex rather than a read. Seeded off the fight, not drawn:
 * `Math.random` here would shift the RNG order for every mode's regression fingerprint, and the
 * same fight must open the same way twice for the lab to measure anything.
 */
/**
 * The shape a doctrine walks onto the field in — its signature, readable before a beat is fought.
 *
 * Measured in `battle-lab` (2026-09-04): aggressive, defensive and economic invaders produced
 * 17%, 20% and 20% win rates under the same play, because every one of them opened in a hashed
 * shape and brought the same 60/28/12 host. A doctrine the player cannot tell from another is
 * not a doctrine. Now the hasty come on in the wedge, the stubborn stand behind shields, the
 * counting-house powers loose from range, and the expansionist spreads to take ground — each of
 * which the ring has a named answer to. Diplomatic powers keep the draw: they have no field
 * character, and one doctrine that must be read on the beat is what stops the table from being
 * memorised outright. The ring is still a conversation after the opening: he re-forms whenever
 * the matchup turns against him (`advanceEnemyFormation`), on his temper's clock.
 */
function doctrineOpening(state: GameState, draft: AscentBattle): BattleFormation | undefined {
  const kingdom = state.kingdoms.find((candidate) => candidate.id === draft.kingdomId);
  switch (kingdom?.personality) {
    case 'aggressive': return 'xung';
    case 'defensive': return 'quy';
    case 'economic': return 'no';
    case 'expansionist': return 'tan';
    default: return undefined;
  }
}

function openingShape(draft: AscentBattle, salt: number): BattleFormation {
  let hash = 2166136261;
  for (const ch of `${draft.key ?? draft.landId}:${draft.kingdomId}:${salt}`) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  }
  return FORMATION_RING[(hash >>> 0) % FORMATION_RING.length];
}

/** Varies per fight, per beat and per question already asked, so a run never repeats a draw. */
function momentSeed(battle: AscentBattle): number {
  let hash = 2166136261;
  for (const ch of `${battle.key ?? battle.landId}:${battle.round}:${battle.momentsRaised ?? 0}`) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function setMoment(battle: AscentBattle, moment: BattleMoment): void {
  battle.moment = moment;
  battle.momentsRaised = (battle.momentsRaised ?? 0) + 1;
  (battle.momentIds ??= []).push(moment.id);
}

/**
 * Applies one answer's effects to the fight.
 *
 * The vocabulary is small and every entry in it is a lever the fight already has — see
 * `MomentEffect`. Scaled by `weight`, which is 1 when the player answered and the general's skill
 * when the general did: a commander's judgement is worth something, but never as much as being
 * there. Costs are *not* scaled — a decision that spends men spends them whoever made it.
 */
function applyMomentEffect(
  state: GameState, battle: AscentBattle, effect: MomentEffect, moment: BattleMoment, weight: number,
): void {
  const gain = (value: number, base: number): number => base + (value - base) * weight;

  battle.momentBonus = {
    beats: BATTLE_MOMENT_BONUS_BEATS,
    dealt: gain(effect.dealt ?? 1, 1),
    // `fightRound` reads `momentBonus.morale` as heart added per beat; the instant heart below is
    // separate and is written straight onto the line.
    morale: 0,
    taken: gain(effect.taken ?? 1, 1),
    // The two windows that speak the dials' own language rather than a percentage.
    sharpBeats: effect.sharpen ? BATTLE_MOMENT_BONUS_BEATS : 0,
    guardBeats: effect.guard ? BATTLE_MOMENT_BONUS_BEATS : 0,
  };

  // Tempo: a Moment's stance lands at once rather than next beat. The four-beat lock this used to
  // arm is retired — `stanceNow` is inert data now, kept in MomentEffect so old defs still parse.
  if (effect.stance) {
    battle.stance = effect.stance;
    battle.stancePending = undefined;
  }
  // Shape: the counter without the bill, or three beats of knowing what you are answering.
  if (effect.freeReform) battle.freeReform = true;
  if (effect.lockTheirShape) battle.theirShapeLockBeats = effect.lockTheirShape;

  if (effect.morale) {
    battle.ourMorale = clampMorale(battle.ourMorale + gain(effect.morale, 0));
    for (const host of ourHosts(state, battle)) setMorale(host, host.morale + gain(effect.morale, 0));
  }
  if (effect.theirMorale) {
    battle.theirMorale = clampMorale(battle.theirMorale + gain(effect.theirMorale, 0));
    for (const host of theirHosts(state, battle)) setMorale(host, host.morale + gain(effect.theirMorale, 0));
  }

  if (effect.advance) {
    battle.ourAdvance = Math.max(0, Math.min(1, battle.ourAdvance + effect.advance));
  }
  if (effect.rounds) {
    battle.totalRounds = Math.max(battle.round + 1, battle.totalRounds + effect.rounds);
  }
  if (effect.loss) applyMomentLosses(ourHosts(state, battle), effect.loss);
  if (effect.theirLoss) applyMomentLosses(theirHosts(state, battle), effect.theirLoss * weight);

  if (effect.rally && !battle.rallySpent) rally(state);
}

/** Men taken off a line at once, spread across its hosts in proportion to their size. */
function applyMomentLosses(hosts: Army[], share: number): void {
  const cut = Math.max(0, Math.min(0.5, share));
  if (cut <= 0) return;
  for (const host of hosts) {
    host.units.spearmen = Math.max(0, Math.round(host.units.spearmen * (1 - cut)));
    host.units.archers = Math.max(0, Math.round(host.units.archers * (1 - cut)));
    host.units.heavyInfantry = Math.max(0, Math.round(host.units.heavyInfantry * (1 - cut)));
  }
}

function clampMorale(value: number): number {
  return Math.max(0, Math.min(100, value));
}


/**
 * Answers the open Moment, and hands the player something for it.
 *
 * `commit` spends: it buys a sharp, short bonus and takes a risk. `steady` conserves: it buys
 * heart instead of edge. Both are scaled by the general's martial, which is what makes appointing
 * a good one to a host worth doing — the same number decides how well they answer for you when
 * the timer runs out.
 */
export function answerBattleMoment(state: GameState, answer: BattleMomentAnswer, byGeneral = false): boolean {
  const battle = state.ascent?.activeBattle;
  const moment = battle?.moment;
  if (!battle || !moment || battle.over) return false;

  // A commander's judgement is worth something, but never as much as being there. Answering
  // yourself is the full effect; a general answering for you is scaled by what they are.
  // Steeper than the 0.55 + 0.4x it was: 0.68 at martial 60 against 0.85 at 90, so the appointment
  // is worth making. Measured, it moves the delegation gap much less than it looks like it should
  // — 5.5 points below skilled play before, 6.0 after, against a gate of 8 to 15 — because most of
  // what a delegated fight decides is `generalPlaysBeat`'s stance each beat, not the two or three
  // Moments. The gate is still unmet and the lever that would meet it is that one, not this.
  //
  // A question nobody was GIVEN does not earn the general's judgement. In an undelegated fight a
  // timed-out Moment gets the floor weight — the officers do the timid minimum — because a player
  // ignoring the screen was collecting near-general-quality answers for free, one more channel by
  // which doing nothing quietly played well. Handing the fight over is what buys his number.
  const skill = 0.35 + (moment.generalMartial ?? 0) / 100 * 0.55;
  const weight = byGeneral ? (battle.delegated ? skill : 0.35) : 1;

  const def = BATTLE_MOMENTS.find((candidate) => candidate.id === moment.id);
  if (!def) { battle.moment = undefined; return false; }
  const effect = answer === 'commit' ? def.commit : def.steady;

  applyMomentEffect(state, battle, effect, moment, weight);
  battle.log.push(t(`ascent.moment.said.${effect.says}` as Parameters<typeof t>[0], {
    subject: moment.subject ?? battle.kingdomName,
  }));

  battle.moment = undefined;
  return true;
}

/**
 * Ages the open Moment by one tick of the world, and lets the general answer it when it runs out.
 *
 * The lapse is the delegation, which is the point: a player who looked away, or who handed this
 * host to its general on purpose, gets a decent answer rather than a penalty. What they lose is
 * the difference between a good commander's judgement and their own.
 *
 * Returns true while the Moment still stands — `advanceBattle` reads that and holds the fight,
 * which is what gives the player a window at all.
 */
function ageMoment(state: GameState, battle: AscentBattle): boolean {
  const moment = battle.moment;
  if (!moment) return false;
  moment.ticksLeft -= 1;
  if (moment.ticksLeft > 0) return true;
  // A cautious commander steadies the line; a bold one commits. Their martial decides which they
  // are as well as how well it goes, so a host's commander is a real appointment. An UNDELEGATED
  // fight always steadies: nobody chose to gamble, so nobody gambles — the answer is the timid
  // default at the floor weight (see `answerBattleMoment`).
  const bold = battle.delegated && (moment.generalMartial ?? 0) >= 60;
  answerBattleMoment(state, bold ? 'commit' : 'steady', true);
  return false;
}

export function fightRound(state: GameState): void {
  const ascent = state.ascent;
  const battle = ascent?.activeBattle;
  if (!ascent || !battle || battle.over) return;

  // The commander gives their orders for this beat — **only if the field was handed to him.**
  //
  // The dials belong to the player until `delegateBattle` says otherwise. This has been walked
  // both directions and each end of the spectrum failed in its own way:
  //
  //  · Nobody plays an untouched fight — the original rule. An untouched host stood flat while
  //    the invader read the board every beat: 17.5% win rate, 63% routed. Felt broken, so —
  //  · The host's own officer covered any dial the player had not taken. At full martial that
  //    made DOING NOTHING win the arena's even default 100 times in 100; capped, it still moved
  //    the player's own controls, and the user's verdict was the deciding one: "I did not press
  //    hand-over, but the formation changed itself." A hidden helper on your own dials reads as
  //    the game overriding your orders, whatever it does for the win rate.
  //
  // So: manual means manual, and losing an ignored fight is the honest price — delegation is one
  // tap away and buys the general's whole skill, rally included. No exceptions: the "shout, not
  // a dial" rally exception was tried and measured as part of why doing nothing still won.
  //
  // Here rather than in `advanceBattle` because the beat is the unit a commander acts on, and
  // because `advanceBattle` is not the only thing that runs a beat — `battle-lab` drives
  // `fightRound` directly, so a general placed one level up simply never played and every martial
  // value scored identically. A harness that cannot reach the code it is grading is not grading it.
  generalPlaysBeat(state, battle);

  // The tempo dial ticks first, so a stance ordered last beat is in force for this one — which is
  // what the dock told the player would happen. The shape clocks tick at the *end*; see
  // `settleFormations`.
  advanceStance(battle);

  // Read the field fresh each beat rather than holding references from when the fight opened.
  // That single choice is what makes reinforcement work: a host that marched in since the last
  // beat is simply enrolled, and one that was destroyed is simply no longer alive.
  enrolArrivals(state, battle);
  const ours = ourHosts(state, battle);
  const theirs = theirHosts(state, battle);
  const defender = ours[0];
  const invader = theirs[0];
  if (!invader || !defender) {
    battle.over = true;
    battle.outcome = ours.length > 0 ? 'they-rout' : 'we-rout';
    return;
  }

  // Relief that arrived since the last beat is worth announcing — it is the payoff for having
  // left the fight to go and fetch it.
  const ourCount = ours.length;
  const theirCount = theirs.length;
  if (ourCount > battle.ourHostCount) {
    battle.log.push(t('ascent.battle.reliefArrived', { n: ourCount - battle.ourHostCount }));
    battle.ourMorale = setMorale(defender, battle.ourMorale + BATTLE_CHARGE_MORALE);
  }
  if (theirCount > battle.theirHostCount) {
    battle.log.push(t('ascent.battle.enemyRelief', { n: theirCount - battle.theirHostCount }));
  }
  battle.ourHostCount = ourCount;
  battle.theirHostCount = theirCount;
  // Relief widens the denominator too, so the strength bars never read past full.
  battle.ourStart = Math.max(battle.ourStart, ours.reduce((total, host) => total + totalUnits(host), 0));
  battle.theirStart = Math.max(battle.theirStart, theirs.reduce((total, host) => total + totalUnits(host), 0));

  const charging = battle.stance === 'press';
  const withdrawing = battle.stance === 'withdraw';
  // Shooting is a *shape* now, not a tempo — Thế Nỏ is the host that has decided to stand off and
  // loose, which is exactly the split the two dials are built on.
  const loosing = battle.ourFormation === 'no';
  const offence = battle.role === 'offence';
  // How the two sides' arms meet, written before the branch rather than inside the melee.
  // It is true of the hosts, not of the phase — a spear wall is wrong against heavy infantry
  // while they are still a bowshot apart — and leaving it until after contact meant the screen
  // could not state it during the approach and the deck could not ask about it.
  battle.ourMatchup = matchupAcross(ours, theirs);
  battle.theirMatchup = matchupAcross(theirs, ours);
  // His wager first, because his stance reads it — dồn sức presses by definition.
  advanceEnemyWager(state, battle);
  // Walls do not sally: a garrison-only defence holds its ground and shoots.
  battle.theirStance = offence && theirs.every((host) => host.isLevy) ? 'defend' : enemyStance(state, battle);
  // Their shape is chosen from the same function the telegraph prints, so what the screen promised
  // is what the beat does. Deterministic on visible state — never a draw, or every mode's
  // regression fingerprint shifts for a reason that has nothing to do with this fight.
  advanceEnemyFormation(state, battle, theirs);

  if (offence) {
    // We are the ones coming. Pressing is the rush, the march is the march, and Cố thủ is
    // closing under shields — half pace, the same walk-speed language the defence speaks.
    // Either way the assault reaches the walls; a defender that never sallies cannot stall it
    // at the approach forever, which is what the cap below is for.
    battle.approachBeats = (battle.approachBeats ?? 0) + 1;
    battle.ourAdvance = Math.min(1, battle.ourAdvance
      + BATTLE_ADVANCE_PER_TICK * (charging ? 1.5 : battle.stance === 'defend' ? 0.5 : 1));
    if (battle.approachBeats >= BATTLE_APPROACH_MAX_BEATS) battle.ourAdvance = 1;
  } else {
    // The invader is always coming; we advance only when told to. Charging also closes faster,
    // which is half of why it is worth doing.
    //
    // Counted here too. `approachBeats` was incremented only on the assault path, where it caps
    // the approach — but it is also the only clock a defence has before contact, since
    // `battle.round` deliberately does not move until the lines meet. Without it every question
    // about a defensive approach sat behind a counter that was permanently zero.
    battle.approachBeats = (battle.approachBeats ?? 0) + 1;
    battle.theirAdvance = Math.min(1, battle.theirAdvance + BATTLE_ADVANCE_PER_TICK);
    // The stance IS the walk (user design, 2026-08-25): Thúc quân closes at speed, Cân bằng
    // closes at the march, Cố thủ stands its ground and lets them come. Every non-press stance
    // used to fall BACK, so a balanced line drifted away from the enemy it was supposedly
    // holding against and the dial read as nothing on the field. Two exceptions keep their
    // reasons: Thế Nỏ opens the range whenever it is not charging — a host that means to shoot
    // wants the ground between it and them, which is what makes it lose to a charge — and Lui
    // binh backs off (the withdraw block below adds the rest of the walk out).
    battle.ourAdvance = charging
      ? Math.min(1, battle.ourAdvance + BATTLE_ADVANCE_PER_TICK * 1.5)
      : loosing || withdrawing
        ? Math.max(0, battle.ourAdvance - BATTLE_ADVANCE_PER_TICK * (loosing ? 0.6 : 0.5))
        : battle.stance === 'defend'
          ? battle.ourAdvance
          : Math.min(1, battle.ourAdvance + BATTLE_ADVANCE_PER_TICK);
  }

  // Disengaging is something you survive, not a button you press. The line keeps trading — badly,
  // at `withdraw`'s own numbers — while it walks backwards, and only after `BATTLE_WITHDRAW_BEATS`
  // is it clear away. `finishBattle('retreat')` still returns the stragglers.
  if (withdrawing) {
    battle.withdrawBeats = (battle.withdrawBeats ?? 0) + 1;
    battle.ourAdvance = Math.max(0, battle.ourAdvance - BATTLE_ADVANCE_PER_TICK * 2);
    if (battle.withdrawBeats >= BATTLE_WITHDRAW_BEATS) {
      battle.log.push(t('ascent.battle.withdrew'));
      finishBattle(state, 'retreat');
      return;
    }
  } else if (battle.withdrawBeats) {
    battle.withdrawBeats = 0;
  }

  const met = battle.ourAdvance + battle.theirAdvance >= 1;

  if (!met) {
    // ── Archery: the approach is a phase, not dead time ────────────────────
    //
    // Arrows are the one exchange where numbers do not answer numbers: a host with bowmen hurts
    // one without, and the side that closes faster eats less of it. That asymmetry is what gives
    // both orders a real case, and it makes composition legible without any new data.
    const bows = (hosts: Army[]): number => hosts.reduce((total, host) => total + host.units.archers, 0);
    // A host that has chosen to shoot, shoots harder — this is the whole of what `loose` buys on
    // the approach, and it is why an arrow-heavy host wants the lines apart.
    const ourVolley = bows(ours) * BATTLE_VOLLEY_BITE * (battle.ourMorale / 100) * (loosing ? BATTLE_LOOSE_VOLLEY : 1);
    const theirVolley = bows(theirs) * BATTLE_VOLLEY_BITE * (battle.theirMorale / 100)
      * (battle.theirFormation === 'no' ? BATTLE_LOOSE_VOLLEY : 1);
    const cover = charging ? BATTLE_CHARGE_COVER : 1;

    // Spread across the hosts present, so arriving relief is shot at too.
    const ourLoss = ours.reduce((total, host) => total + bleedCount(host, (theirVolley * cover) / ours.length), 0);
    const theirLoss = theirs.reduce((total, host) => total + bleedCount(host, ourVolley / theirs.length), 0);

    battle.ourNow = ours.reduce((total, host) => total + totalUnits(host), 0);
    battle.theirNow = theirs.reduce((total, host) => total + totalUnits(host), 0);
    // The approach costs men too. Recording it only on the melee path left the dock printing
    // "the lines have not met" while the arrows were killing people, which is not a thing the
    // screen is allowed to say while a number it could show is going up.
    battle.lastBeatLoss = { ours: ourLoss, theirs: theirLoss };
    let volleyLine: string | undefined;
    if (ourLoss > 0 || theirLoss > 0) {
      volleyLine = t('ascent.battle.volley', { ours: ourLoss, theirs: theirLoss });
      battle.log.push(volleyLine);
    }
    // The approach can ask a question too, and until now it could not.
    //
    // `raiseMoment` was called once, at the foot of the melee path, past this early return — so
    // every question about closing the ground (the volleys, the crossing, catching them still
    // striking camp) was unreachable no matter what its trigger said. Measured across sixty
    // engagements, five of the thirty fired zero times for this reason alone.
    raiseMoment(state, battle, ours, theirs);
    settleFormations(battle);
    recordBeat(battle, 'approach', ours, theirs, ourLoss, theirLoss, volleyLine);
    // Deliberately does not spend the round budget: the approach is the opening, not the fight.
    return;
  }

  // ── First contact ────────────────────────────────────────────────────────
  if (battle.round === 0 && charging) {
    battle.ourMorale = setMorale(defender, battle.ourMorale + BATTLE_CHARGE_MORALE);
    battle.log.push(t('ascent.battle.charged'));
  }

  const sum = (hosts: Army[]): number => hosts.reduce((total, host) => total + armyPower(state, host), 0);
  // The ground's edge goes to whoever is defending it.
  // Composition, at last, in the one place that shows the player both sides of it.
  //
  // `compositionMatchup` — spearmen rout heavy, heavy crush archers, archers shred spears — has
  // been written, commented and correct in `WarSystem` since the classic odds roll, with exactly
  // one call site. The watched fight never used it, so the screen that draws both armies' arms
  // was the only place in the game where they did not matter.
  const ourArms = battle.ourMatchup ?? 1;
  const theirArms = battle.theirMatchup ?? 1;
  const ourPower = Math.max(1, sum(ours) * (offence ? 1 : battle.terrainEdge) * ourArms);
  const theirPower = Math.max(1, sum(theirs) * (offence ? battle.terrainEdge : 1) * theirArms);
  // Each side's losses are its own exposure times the other's aggression, so a cautious enemy
  // is genuinely a different fight from a reckless one rather than the same fight relabelled.
  // Tempo only. The ring is one separate term below, which is the whole point of the split.
  const ourTrade = tradeFor(battle.stance);
  const theirTrade = tradeFor(battle.theirStance);
  // Which way the men are spent, as against how fast. The walk between shapes costs exactly this
  // and no blood: the tilt reads zero for the beat it takes. The old 1.45x-taken transit penalty
  // billed the change twice once the wind clock existed, so it went with the clock's arrival.
  const tilt = formationTilt(battle);
  const fuzz = (): number => 0.9 + Math.random() * 0.2;

  // What a Moment bought, while it lasts. Half the deck answers a question by *protecting* the
  // line rather than by sharpening it — bracing, giving ground, plugging a pass — and without
  // this term every one of those answers would have been a placebo.
  const momentTaken = battle.momentBonus?.taken ?? 1;
  const momentDealt = battle.momentBonus?.dealt ?? 1;
  const ourShare = BATTLE_ROUND_BITE * (theirPower / (ourPower + theirPower)) * 2
    * ourTrade.taken * theirTrade.dealt
    * (1 - tilt) * momentTaken * fuzz();
  const theirShare = BATTLE_ROUND_BITE * (ourPower / (ourPower + theirPower)) * 2
    * ourTrade.dealt * theirTrade.taken
    * (1 + tilt) * momentDealt * fuzz();

  // Losses land across every host present, so relief shares the burden rather than watching.
  const ourLoss = ours.reduce((total, host) => total + bleed(host, Math.min(0.9, ourShare)), 0);

  // Spread across every host they have, always. Concentrating the line on one enemy column used to
  // be an order; it was a second cursor on a one-thumb screen, and it was very nearly always
  // correct, which makes it a tax rather than a choice. See `docs/14-five-shapes-two-dials.html`.
  const theirLoss = theirs.reduce((total, host) => total + bleed(host, Math.min(0.9, theirShare)), 0);

  // What the dock prints as the price of standing here.
  //
  // The *measured* exchange, not a re-derivation of it. A second copy of the formula in the view
  // would be one refactor away from disagreeing with the fight, and a readout that drifts from the
  // simulation teaches a rule the game does not keep. This costs one assignment and cannot drift.
  battle.lastBeatLoss = { ours: ourLoss, theirs: theirLoss };

  // Morale follows the exchange: bleeding costs heart, and winning the exchange restores a
  // little of it. Because `armyPower` reads morale, the side that starts losing keeps losing.
  //
  // Measured against the *engaged* line, not against `ourStart`. `ourStart` counts everything the
  // side brought — including the reserve, which by construction is standing at camp and not being
  // shot at, and including relief that widened the denominator when it arrived. Traced through a
  // real fight: a host of 351 with 134 in reserve took 28% casualties and lost **one point** of
  // heart, because the men at camp were absorbing the shock of the line's losses on paper. The
  // enemy, who had no reserve, fell from 85 to 46 over the same exchanges — the two sides were
  // running different morale models without anyone deciding they should.
  //
  // Dividing by what is actually standing there also makes the drop compound: the smaller a host
  // gets, the larger a share each further loss is, so a line that starts going breaks instead of
  // grinding down at a constant rate. That is what the constant's own doc comment claims it does.
  const ourEngaged = Math.max(1, ours.reduce((n, h) => n + totalUnits(h), 0) + ourLoss);
  const theirEngaged = Math.max(1, theirs.reduce((n, h) => n + totalUnits(h), 0) + theirLoss);
  const ourDrop = (ourLoss / ourEngaged) * BATTLE_MORALE_PER_LOSS;
  const theirDrop = (theirLoss / theirEngaged) * BATTLE_MORALE_PER_LOSS;
  // PROPORTIONAL, not absolute. Absolute was a morale faucet for the smaller army: at equal loss
  // *fractions* the bigger side always loses more men, so an outnumbered host "won" every beat of
  // a dead-even grind and collected BATTLE_MORALE_WIN_GAIN for standing still. The wind harness's
  // mirror-turtle caught it — a bot that only matched shapes and defended out-hearted an army 10%
  // larger without one real decision. Sharing the denominator with the drop above makes winning
  // the exchange mean trading *efficiently*, which is the ring's job to decide, not the muster's.
  const wonExchange = theirLoss / theirEngaged > ourLoss / ourEngaged;
  // The run, for the screen. Only counted once the two are actually trading — an approach where
  // nobody has lost anybody is not a round going against us.
  if (ourLoss + theirLoss > 0) {
    battle.wonLast = wonExchange;
    battle.lostRun = wonExchange ? 0 : (battle.lostRun ?? 0) + 1;
  }
  // Counts only once the player has ORDERED a shape (`setBattleFormation` stamps it to 0) —
  // undefined stays undefined, which `advanceEnemyFormation` reads as long-settled (`?? 99`).
  // The unconditional `?? 0` increment quietly re-armed the enemy's whole hesitation window for a
  // player who had never touched the dial: an untouched opening that happened to counter his got
  // the same free beats a real order earns, and that lottery was most of why doing nothing still
  // won a fifth of even fights. Hesitation is a reaction to a decision; no decision, no window.
  if (battle.beatsSinceOurShape !== undefined) battle.beatsSinceOurShape += 1;
  // Applied to *every* host on the side, not just the one the maths treats as the line, so a
  // battered relief column carries its own heart rather than borrowing the vanguard's.
  // Being answered costs heart as well as men — keyed off the shape, and scaled by how hard the
  // answer is: a strong counter drips the full rate, a soft one half. Cố thủ halves whatever
  // lands, which is what turns "I am out of shapes" from a death sentence into a decision to dig
  // in and ride the window out.
  const drip = (Math.abs(counterTier(battle)) / 2) * BATTLE_COUNTER_MORALE;
  const ourCountered = tilt < 0 ? drip * (battle.stance === 'defend' ? 0.5 : 1) : 0;
  const theirCountered = tilt > 0 ? drip * (battle.theirStance === 'defend' ? 0.5 : 1) : 0;
  const momentMorale = battle.momentBonus?.morale ?? 0;
  /**
   * Overtime: what used to be the end of the fight is now the point at which it stops being
   * survivable.
   *
   * A fight ended at `totalRounds` whether or not anything had been decided, and the commonest
   * result of a close engagement was `spent` — two hosts still standing, the field still contested,
   * and a screen that had spent twenty rounds asking for decisions announcing that none of them
   * mattered. The clock is gone. In its place both lines start losing heart simply for still being
   * there, and the loss grows every round, so the fight always reaches a decision — by somebody
   * breaking, which is the only ending this screen was ever built to show.
   *
   * See `BATTLE_OVERTIME_MORALE` for why this cannot run away.
   */
  const overtime = Math.max(0, battle.round - battle.totalRounds);
  const grind = overtime * BATTLE_OVERTIME_MORALE;
  // Weighted by the men still standing: the outnumbered line tires faster, the stronger one
  // slower. See `BATTLE_OVERTIME_WEIGHT_CAP` — the symmetric version decided fights by a coin-flip.
  const ourMenNow = Math.max(1, ours.reduce((n, h) => n + totalUnits(h), 0));
  const theirMenNow = Math.max(1, theirs.reduce((n, h) => n + totalUnits(h), 0));
  const cap = BATTLE_OVERTIME_WEIGHT_CAP;
  const ourGrind = grind * Math.min(cap, Math.max(1 / cap, theirMenNow / ourMenNow));
  const theirGrind = grind * Math.min(cap, Math.max(1 / cap, ourMenNow / theirMenNow));
  for (const host of ours) {
    setMorale(host, host.morale - ourDrop - ourCountered - ourGrind + momentMorale + (wonExchange ? BATTLE_MORALE_WIN_GAIN : 0));
  }
  for (const host of theirs) {
    setMorale(host, host.morale - theirDrop - theirCountered - theirGrind + (wonExchange ? 0 : BATTLE_MORALE_WIN_GAIN));
  }
  battle.ourMorale = defender.morale;
  battle.theirMorale = invader.morale;

  // Hosts break one at a time. Losing a host is a setback, not the battle — which is what makes
  // bringing a second column worth the march, and what stops one bad exchange ending everything.
  const brokeThisBeat: string[] = [];
  // Sát Thát — the arm tattoos of 1285. Trần soldiers cut "kill the Mongols" into their own
  // forearms before the second Yuan invasion, and this is the mechanical shape of that: our hosts
  // hold to a fifth strength rather than breaking at the usual morale. Only ours — the invader
  // never swore anything. The price is on the other side of the trade, in `SAT_THAT_RECRUIT_MULT`:
  // men who will not run are also men who cannot be replaced.
  // Measured against the side's opening strength rather than each host's own, because a host is
  // an `Army` and carries no record of what it marched in with — `battle.ourStart` is the only
  // honest starting figure either side has.
// Sát Thát vĩnh cửu, the militarist capstone, goes further than the oath it is named for: the
  // floor drops to zero, so our hosts fight until they are destroyed and never break at all.
  // The proclamation holds the line exactly as the capstone does, for one wave instead of forever.
  const eternal = hasCapstone(state, 'binh') || proclamationInForce(state);
  const swornFloor = eternal ? 0 : tattooedArms(state) ? battle.ourStart * (SAT_THAT_ROUT_FLOOR / 100) : -1;
  /**
   * **Numbers break a line too.** A side whose men fall below `BATTLE_NUMBERS_FLOOR` of the other
   * side's is broken outright, oath or no oath. The morale exemptions above are exemptions from
   * *losing heart*; they were never meant to let a company hold against an army, and under the
   * overtime grind that is exactly what they did — 528 men "won" against 3,412 because the
   * enemy's morale dipped first. Both sides, both directions: a wave that has been cut to a
   * fifteenth of the defence scatters just the same.
   */
  const menOurs = ours.reduce((n, h) => n + totalUnits(h), 0);
  const menTheirs = theirs.reduce((n, h) => n + totalUnits(h), 0);
  const oursOverwhelmed = menOurs > 0 && menTheirs > 0 && menOurs < menTheirs * BATTLE_NUMBERS_FLOOR;
  const theirsOverwhelmed = menOurs > 0 && menTheirs > 0 && menTheirs < menOurs * BATTLE_NUMBERS_FLOOR;
  for (const host of [...ours, ...theirs]) {
    const overwhelmed = ours.includes(host) ? oursOverwhelmed : theirsOverwhelmed;
    if (!overwhelmed && swornFloor >= 0 && ours.includes(host) && battle.ourNow > swornFloor) continue;
    if (!overwhelmed && host.morale > BATTLE_ROUT_MORALE) continue;
    battle.brokenHostIds.push(host.id);
    brokeThisBeat.push(host.id);
    battle.log.push(t('ascent.battle.hostBreaks', { name: host.name }));
    // A host that runs is cut down as it goes, exactly as a whole side is.
    bleed(host, BATTLE_ROUT_LOSS_SHARE);
  }

  battle.ourLostTotal += ourLoss;
  battle.round += 1;
  battle.ourNow = ours.reduce((total, host) => total + totalUnits(host), 0);
  battle.theirNow = theirs.reduce((total, host) => total + totalUnits(host), 0);
  // A question the fight has just produced. `advanceBattle` stops here until it is answered.
  raiseMoment(state, battle, ours, theirs);
  if (battle.momentBonus) {
    battle.momentBonus.beats -= 1;
    if (battle.momentBonus.beats <= 0) battle.momentBonus = undefined;
  }

  const exchangeLine = t('ascent.battle.exchange', { round: battle.round, ours: ourLoss, theirs: theirLoss });
  battle.log.push(exchangeLine);
  settleFormations(battle);
  recordBeat(battle, 'clash', ours, theirs, ourLoss, theirLoss, exchangeLine, brokeThisBeat);

  // ── Does anyone break? ───────────────────────────────────────────────────
  // A side is beaten when it has no host left in the line, not when its strongest wavers.
  if (theirHosts(state, battle).length === 0) {
    battle.outcome = 'they-rout';
    battle.log.push(t('ascent.battle.theyBreak', { kingdom: battle.kingdomName }));
    battle.over = true;
    return;
  }
  if (ourHosts(state, battle).length === 0) {
    battle.outcome = 'we-rout';
    battle.log.push(t('ascent.battle.weBreak'));
    battle.over = true;
    return;
  }
  // No `spent` here any more. `totalRounds` is where the grind starts, not where the fight stops —
  // see the overtime block in `fightRound`. The outcome itself is still reachable: handing a live
  // engagement to the generals or resolving one off-screen both still settle it on what is left
  // standing.
}

/**
 * Advances a live engagement by a tick's worth of beats, and closes it out when it ends.
 *
 * Called from the economy tick rather than from the view: the fight belongs to the world now,
 * so it carries on whether or not anyone is looking at it. The view animates what this produces.
 */
/**
 * The shapes that answer a given shape, best first.
 *
 * Two of them, because the ring gives every shape two answers — and since the ring was retiered
 * they are no longer equal: one step is the strong counter at full tilt, two steps the soft one at
 * half. Sorted strong-first, because in plain ring order the SOFT answer comes first for four of
 * the five shapes, and every `.find()` on this list would quietly play half-strength answers.
 */
function countersTo(theirs: BattleFormation): BattleFormation[] {
  return FORMATION_RING.filter((shape) => formationBeats(shape, theirs))
    .sort((a, b) => Math.abs(formationTier(b, theirs)) - Math.abs(formationTier(a, theirs)));
}

/**
 * Whether the commander reads this beat correctly.
 *
 * `martial` is the share of beats they get right; on the rest they fall back to their habit. This
 * is deliberately a hash rather than `Math.random`: every harness in the repo drives the same
 * systems, and drawing here would shift the RNG order for every mode's fingerprint. The same
 * commander in the same fight also has to make the same decisions twice, or two runs of the lab at
 * one martial value measure noise.
 */
function generalReadsBeat(battle: AscentBattle, martial: number, salt = 0): boolean {
  const h = Math.imul(((battle.round + 1 + salt * 7919) * 2654435761) ^ Math.round(battle.ourStart), 2246822519) >>> 0;
  return (h % 100) < martial;
}

function generalPlaysBeat(state: GameState, battle: AscentBattle): void {
  const met = battle.ourAdvance + battle.theirAdvance >= 1;
  // The dials are the player's until they are handed over. The officer no longer covers an
  // unclaimed dial at any skill — a helper moving the player's own controls read as the game
  // overriding orders (see the note at the call site).
  //
  // The last-ditch rally is for a fight somebody is FIGHTING. The player has no rally verb of
  // their own — it has always been the general's shout — so stripping it from every undelegated
  // fight quietly nerfed manual play itself: measured, a player answering every shape fell from
  // ~96% to ~38% at the default, while the untouched fight barely moved. The honest line is
  // steering: the general backs a commander who is commanding; an empty throne gets nothing.
  if (!battle.delegated) {
    const fighting = battle.steeredFormation || battle.steeredStance;
    if (fighting && met && !battle.rallySpent && battle.ourMorale < BATTLE_ROUT_MORALE + 6) rally(state);
    return;
  }
  // Delegation stamps `generalMartial`; the fallback covers a stamp that predates a save. No
  // commander at all means a middling one, the same figure `delegateBattle` falls back to.
  const martial = battle.generalMartial ?? (() => {
    const led = ourHosts(state, battle).find((host) => host.generalHeroId)?.generalHeroId;
    const hero = led ? state.heroes.find((candidate) => candidate.id === led) : undefined;
    return hero ? hero.stats.martial : 45;
  })();
  // The approach is an archery decision, and the general makes it the way the invader's own
  // doctrine does: a bow-backed host stands off and shoots (Cố thủ holds its ground now — the
  // stance IS the walk), everyone else closes at the march. Without this the walk rework quietly
  // gutted every delegated defence in a run: balanced closes since 2026-08-25, so a militia line
  // that lived on its volleys marched itself into melee — measured on the seeded long run, the
  // realm fell to one province and the late-game never came.
  if (!met && !reforming(battle.reformBeats)) {
    setBattleStance(state, bowShare(ourHosts(state, battle)) >= 0.22 ? 'defend' : 'balanced');
  }
  if (generalReadsBeat(battle, martial)) {
    const read = battleTelegraph(state);
    if (read) {
      // The shape they are heading for, if they are heading anywhere — every commander reads the
      // walk, not just the stand.
      //
      // Two handicaps for the fair commander were tried on 2026-09-04 to open the lab's "8-15
      // points under hand play" premium: reading the enemy's stand below martial 80, and needing
      // a second read to act. Both opened the gap in the lab (13 points) and both were paid for
      // by every delegated fight in a run — the metrics harness, whose engaged policy delegates
      // every fight, fell from 18.9 waves to 11.4-11.8 and the agency ratio from 2.48x to 1.9-2.1x.
      // Reading the stand alone measured a 0.0-point lab gap and the full run-length cost. A
      // realm that can defend itself while the player is elsewhere is worth more than a premium
      // on attention, so the lab's 8-15 target stays red with this note beside it.
      const target = read.next ?? read.formation;
      const answer = countersTo(target).find((shape) => canFormFormation(state, shape));
      if (answer && answer !== battle.ourFormation && !reforming(battle.reformBeats)) {
        setBattleFormation(state, answer);
      }
      // Tempo second, by **the same rule the invader plays** — press while the shape is ours,
      // steady while it is theirs, commit to nothing in between.
      //
      // This used to be an ad-hoc pair of conditions that mostly returned `balanced`, and the
      // asymmetry was fatal: the invader read the tilt every beat and the player's commander did
      // not, so an unsteered host stood flat at 1.0/1.0 while the invader pressed at 1.55/1.40.
      // Measured in `battle-lab`, the player routed in 80% of fights.
      // With the lock retired the commander could re-stance every beat, and under one-beat walks
      // that is press-balanced-press flapping with every order landing a beat late. Two dampers,
      // no new state: no stance orders while either side is walking (the read is about to be
      // stale), and on an even shape hold whatever is set rather than resetting to balanced —
      // unless the line is close to breaking, where the brake is always correct.
      if (!reforming(battle.reformBeats) && !reforming(battle.theirReformBeats)) {
        const sign = formationTiltSign(battle.ourFormation, battle.theirFormation);
        // Logged when it actually lands (setBattleStance refuses a repeat): the general presses
        // the very beat the fight's new shape wins the tilt, and an unattributed flip right
        // after a formation tap read as the TAP changing the stance (user-reported, worsened by
        // the two dials once sharing the word "Xung phong").
        if (sign > 0) {
          if (setBattleStance(state, 'press')) battle.log.push(t('ascent.battle.generalTempo', { s: t('ascent.stance.press') }));
        } else if (sign < 0 || battle.ourMorale < BATTLE_ROUT_MORALE + 20) {
          if (setBattleStance(state, 'defend')) battle.log.push(t('ascent.battle.generalTempo', { s: t('ascent.stance.defend') }));
        }
      }
    }
    if (met) {
      if (!battle.rallySpent && battle.ourMorale < BATTLE_ROUT_MORALE + 12) rally(state);
    }
    return;
  }
  // Their habit. Not a reset to `hold`: reverting the stance every beat they misread is worse than
  // standing still, and measured it cost a martial-90 commander fourteen points against skilled
  // play. They keep the line they are already in and spend the reserve late.
  if (met && !battle.rallySpent && battle.ourMorale < BATTLE_ROUT_MORALE + 6) rally(state);
}

/**
 * Hands the rest of the engagement to whoever holds the field, or takes it back.
 *
 * Reversible on purpose, and mid-beat. The plan's rule for this switch is two states and one tap:
 * a player who hands over because they are bored of a fight they are winning must be able to take
 * the field back the moment it turns.
 */
export function delegateBattle(state: GameState, delegated: boolean, standing = true): void {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) return;
  battle.delegated = delegated;
  // Handing the field over is one of the three ways a claim ends. The others are leaving the
  // screen (`closeLane`) and moving to another fight (`focusBattle`).
  if (delegated) battle.claimed = false;
  // And it is a *standing* order: the next field opens the way the last one was left. Handing
  // the war over once and having to hand it over again every fight is the thing the report
  // "by default fight will automatically control" is about.
  //
  // `standing: false` for the grace-window hand-over in `AscentTick` — a player who walked away
  // from one fight has not told the realm anything about the next one.
  if (standing && state.ascent) state.ascent.handToGenerals = delegated;
  if (!delegated) {
    // Claimed by hand, and the auto-delegate rule does not touch a claimed field — see `claimed`.
    battle.claimed = true;
    battle.log.push(t('ascent.battle.tookBack'));
    return;
  }
  const general = state.heroes.find(
    (hero) => hero.id === ourHosts(state, battle).find((host) => host.generalHeroId)?.generalHeroId,
  );
  battle.generalName = general?.name;
  battle.generalMartial = general ? general.stats.martial : 45;
  battle.log.push(general
    ? t('ascent.battle.handedTo', { name: general.name })
    : t('ascent.battle.handedToOfficers'));
}

/**
 * Beats every field the realm is holding, then puts the player back where they were.
 *
 * The sides are beaten *after* the watched fight rather than before it, so a general's fight that
 * ends this tick cannot promote itself into the chair the player is currently sitting in. A side
 * fight that finishes is dropped from the list by `withFocus` returning false; if the watched one
 * finished, `promoteNextFront` moves the player onto whichever remaining field most needs hands.
 */
/**
 * Ends any fight whose ground is no longer ours, before the beat clock touches it.
 *
 * **The reported bug, and it had no code at all.** `land.ownerId` is read by exactly three gates in
 * this file — `worthWatching`, `wouldCostUsTheProvince`, `fieldCandidateAt` — and all three run
 * when a field *opens*. Nothing looks again. `fronts.ts` does not read `state.lands` once, and
 * neither does `battleMembership`. So a province that changed hands mid-fight left the engagement
 * running on ground the enemy already held: the screen kept beating, the enemy kept arriving, and
 * the player was defending a place they had lost. Reported verbatim — *somehow i lose my land in
 * battle but enemy can still attack and battle screen still happen in that land during users
 * capture*.
 *
 * The ordering is the whole fix. `progressSiegeOrders` flips the owner at `AscentTick`'s movement
 * step, eighty-odd lines before `advanceBattle`, so the flip lands mid-tick with the fight
 * untouched. This runs in the gap.
 *
 * Ended as a **retreat** rather than deleted: retreat is what actually happened — the ground went,
 * the men pulled off it — and it is the verb that pays `BATTLE_WITHDRAW_RECOVERY`, files a record
 * through `recordEngagement`, and lets the Reckoning say so. A fight that simply vanished would be
 * the silent-loss defect this mode has been bitten by twice before.
 *
 * Offence is exempt: an assault is *supposed* to be fought on ground that is not ours.
 */
export function reconcileFronts(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  /**
   * Ground that is gone, or ground that is going.
   *
   * The ownership half was the original rule and it has a blind spot 2-6 seasons wide: a province
   * whose walls have been carried is still flagged as ours until `progressSiegeOrders` turns it,
   * so every other field standing on it kept beating away underneath a claim. That is the reported
   * *"same capital — I lost a fight but other fights still happen"*, and it is why the fall of the
   * seat could be announced while three more engagements were live on the same tile.
   *
   * A retake is the deliberate exception. It is the one defence that is *supposed* to be fought on
   * falling ground, so ending it here would cancel the fight one tick after the player asked for
   * it — the flag exists for exactly this line.
   */
  const lost = (battle: AscentBattle): boolean => battle.role !== 'offence'
    && (findLand(state, battle.landId)?.ownerId !== PLAYER_KINGDOM_ID
      || (provinceIsFalling(state, battle.landId) && !battle.retake));
  const said = (battle: AscentBattle): void => {
    battle.over = true;
    pushToast(state, t('ascent.battle.groundLost', { land: battle.landName }), 'threat');
  };

  // Structured exactly like `advanceBattle`, and for the same reason: `finishBattle` ends whatever
  // is *in focus*, so the watched fight and the side fights are reached differently. A side front
  // additionally has to be dropped from the list — `withFocus` reports whether the beat ended it,
  // which is the signal the filter below is built on.
  const active = ascent.activeBattle;
  if (active && !active.over && lost(active)) {
    finishBattle(state, 'retreat');
    said(active);
  }
  const sides = ascent.sideBattles ?? [];
  if (sides.length > 0) {
    ascent.sideBattles = sides.filter((side) => {
      if (side.over || !lost(side)) return !side.over;
      withFocus(state, side, () => finishBattle(state, 'retreat'));
      said(side);
      return false;
    });
  }
  // The player was standing on the field that just went. Put them on another one rather than on a
  // battle screen with no battle behind it.
  if (!ascent.activeBattle) promoteNextFront(state);
}

export function advanceBattle(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  if (ascent.activeBattle) advanceOneBattle(state);
  const sides = ascent.sideBattles ?? [];
  if (sides.length > 0) {
    ascent.sideBattles = sides.filter((side) => (
      !side.over && withFocus(state, side, () => advanceOneBattle(state))));
  }
  // The watched fight ended and a general is still holding a field somewhere: the player is put on
  // it rather than returned to a map with a war on it and no door into the war.
  if (!ascent.activeBattle) promoteNextFront(state);
}

function advanceOneBattle(state: GameState): void {
  const battle = state.ascent?.activeBattle;
  if (!battle) return;

  // A Moment holds the fight. Without this the window is consumed inside the same burst that
  // opened it and the player never sees the question, let alone answers it.
  if (battle.moment) {
    // A delegated fight does not hold the screen waiting for an answer nobody is going to give.
    // The commander answers it now, at the quality their martial buys.
    if (battle.delegated) battle.moment.ticksLeft = 0;
    if (ageMoment(state, battle)) return;
  }

  // How many beats a season is worth, which the player can set. `BATTLE_BEATS_PER_TICK` is still
  // the default this returns; see `battleOptions` for why the two speed numbers move together.
  const perTick = battleBeatsPerTick();
  for (let beat = 0; beat < perTick && !battle.over; beat += 1) {
    fightRound(state);
    if (!battle.moment) continue;
    // A commander does not stop the war to think.
    //
    // Breaking the burst is right when a player is going to be asked: the question reaches the
    // screen with the rest of the tick still ahead of it. It is wrong when the field has been
    // handed over, because the answer is already decided — and holding the burst for it cost the
    // general five of every six beats. Measured on a delegated fight: four beats in nine seconds,
    // against the eighteen a watched fight resolves in the same time.
    if (battle.delegated) {
      battle.moment.ticksLeft = 0;
      ageMoment(state, battle);
      continue;
    }
    // Stop the burst the instant one is raised, so the question reaches the screen with the rest
    // of the tick still ahead of it rather than already spent.
    break;
  }
  // `finishBattle` asks what the host was *told*, not which of three stances it was in when the
  // last beat landed. Loosing is a way of holding the ground, so it resolves as holding.
  if (battle.over) finishBattle(state, battle.stance === 'press' ? 'press' : 'hold');
}

/** Commits the host held back at camp. One-shot, and the reason to keep watching. */

/** The general steadies the host. One-shot, scaled by their martial — see `rallyPower`. */
export function rally(state: GameState): boolean {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.rallySpent || battle.over) return false;
  const defender = battleLine(state, battle);
  if (!defender) return false;

  // Scaled by the ground already lost, so a rally spent on a fresh host is largely wasted and
  // one spent on a wavering line is worth several times as much. That is what turns it from a
  // reminder into a decision: waiting pays, right up until the line breaks and it never gets
  // spent at all.
  const sag = Math.max(0, (battle.ourStartMorale - battle.ourMorale) / Math.max(1, battle.ourStartMorale));
  const gained = Math.round(battle.rallyPower * (1 + sag * BATTLE_RALLY_DESPERATION));
  battle.rallySpent = true;
  battle.ourMorale = setMorale(defender, battle.ourMorale + gained);
  battle.log.push(t('ascent.battle.rallied', { n: gained }));
  return true;
}

/**
 * Ends the engagement and lets the shared invasion code decide what it meant.
 *
 * The reserve is returned first whatever happens — men held at camp were never in the fight and
 * must not be quietly deleted by a retreat or a rout.
 */
export function finishBattle(state: GameState, decision: 'press' | 'hold' | 'retreat'): void {
  const ascent = state.ascent;
  const battle = ascent?.activeBattle;
  if (!ascent) return;
  if (!battle) {
    // Nothing being watched: the shared code still owns whatever record is waiting.
    if (state.pendingBattle) resolveBattleRecord(state, takePending(state), decision === 'press' ? 'attack' : decision === 'retreat' ? 'retreat' : 'delegate');
    return;
  }

  // `outcome` used to be computed and thrown away: routing them, being routed, and grinding to
  // the round limit all resolved identically, so the most dramatic thing that can happen in the
  // fight carried no consequence at all.
  //
  // Breaking them is a decisive win. Being broken is *worse than withdrawing* — a routing host
  // is cut down as it runs — which is what makes pulling out in time a real skill rather than a
  // button nobody presses.
  if (battle.outcome === 'we-rout') {
    for (const host of ourHosts(state, battle)) bleed(host, BATTLE_ROUT_LOSS_SHARE);
  }

  // A withdrawal ordered in time is an orderly one: the host keeps its formation, and the
  // stragglers and lightly wounded rejoin it over the following days. A rout does not — men who
  // run are ridden down, which is what `BATTLE_ROUT_LOSS_SHARE` above models.
  //
  // This is what finally makes pulling out a *tactical* skill and not only a strategic one.
  // Deliberately done by recovering losses rather than by weakening `hold`: making the standing
  // orders trade worse to justify retreat would have undone the dominated-option-free balance
  // that took two passes to earn. Withdrawal now earns its keep on its own terms.
  /**
   * Stragglers rejoin a host that withdrew in good order — and **only** that host.
   *
   * This also paid out on a *won* defence, and it was most of why a fight's last number and its
   * next number never agreed. It landed *after* the last beat wrote `ourNow` and *before* the
   * record read it, so the card said 1,379 while the hosts held 2,464; it landed on the levy as
   * well as the field hosts, so the walls' casualties came back too; and `dissolveGarrisonLevies`
   * then read the refunded survivors and charged the militia and the masonry for a fight less
   * than half as bloody as the one that was fought. Measured: 62% losses read as 46%.
   *
   * A victory now costs what it cost. The note that put it here — "a realm that fought and won
   * each wave shrank as surely as one that lost" — is answered by `GARRISON_RECOVER_SEASONS`: the
   * turnout comes back, on a clock, from the province rather than from thin air.
   */
  if (decision === 'retreat' && battle.outcome !== 'we-rout' && battle.outcome !== 'they-rout') {
    const hosts = ourHosts(state, battle);
    const recovered = Math.round(battle.ourLostTotal * BATTLE_WITHDRAW_RECOVERY);
    if (hosts.length > 0 && recovered > 0) {
      const each = Math.floor(recovered / hosts.length);
      for (const host of hosts) {
        host.units.spearmen += Math.round(each * 0.6);
        host.units.archers += Math.round(each * 0.25);
        host.units.heavyInfantry += Math.round(each * 0.15);
      }
      // The record must say what the hosts actually hold.
      battle.ourNow = hosts.reduce((total, host) => total + totalUnits(host), 0);
    }
  }

  if (battle.role === 'offence') {
    finishAssault(state, battle, decision);
    return;
  }

  // The field decides — including when nobody broke.
  //
  // A rout on either side was already settled outright, but a fight that simply ran out of rounds
  // used to be handed back to the old odds roll, which re-decided from the top a battle the player
  // had just spent five minutes steering. Measured, that was **68% of all engagements**: 21.3
  // fought per run, 6.4 won by breaking them, 0.5 lost by being broken, and the other 14.4 thrown
  // to a die. A tactical screen whose result is overruled two times in three is decoration.
  //
  // So an exhausted field is scored on what the exhaustion produced: whichever side kept more of
  // what it brought has held the ground. `ourStart` and `theirStart` already track that, and both
  // widen when relief arrives, so a defence that was reinforced is judged on the whole force it
  // ended up committing rather than on the vanguard it opened with.
  const heldShare = battle.ourNow / Math.max(1, battle.ourStart);
  const theirShare = battle.theirNow / Math.max(1, battle.theirStart);
  const spentWinner: 'defence' | 'invader' | undefined = battle.outcome === 'spent'
    ? (heldShare >= theirShare ? 'defence' : 'invader')
    : undefined;

  const resolved = battle.outcome === 'they-rout'
    ? 'attack'
    : battle.outcome === 'we-rout'
      ? 'delegate'
      : decision === 'retreat' ? 'retreat' : decision === 'press' ? 'attack' : 'delegate';
  const forced = battle.outcome === 'they-rout'
    ? 'defence'
    : battle.outcome === 'we-rout'
      ? 'invader'
      // A withdrawal the player ordered is still a withdrawal — the field is given up by choice,
      // and `BATTLE_WITHDRAW_RECOVERY` above has already paid them back for ordering it in time.
      : decision === 'retreat' ? undefined : spentWinner;
  const invaderIds = (battle.theirArmyIds ?? []).filter((id) => id !== battle.invaderArmyId);

  // Written down before the shared code moves anyone: the chronicle and the harness both read it.
  const ourIds = battle.ourArmyIds ?? [];
  // And who led, while there is still a host to ask. The Reckoning draws the face, and the
  // hosts are dissolved by the time it is read.
  const ledBy = ourIds
    .map((id) => state.armies.find((army) => army.id === id))
    .find((army) => army?.generalHeroId)?.generalHeroId
    // A defence fought by the province's own walls is still fought by somebody: the governor. Without
    // this the Reckoning credited every levy-only victory to `tướng lĩnh dưới quyền`. This function
    // is the defence half only — `finishAssault` is the offence twin, and a province we are storming
    // has no governor of ours to credit.
    ?? defenceCommanderOf(state, findLand(state, battle.landId))?.id;
  // The field is cleared *before* the record is filed, not after, because `raiseAftermath` now
  // refuses to raise a dispatch over a live fight (a silent engagement three provinces away must
  // not take the screen off the one the player is standing on). Filed while `activeBattle` was
  // still set, a fight the player had handed to a general reported itself as one of those and
  // was silently dropped.
  ascent.activeBattle = undefined;
  recordEngagement(state, {
    turn: state.turn,
    key: battle.key ?? `${battle.landId}`,
    landId: battle.landId,
    landName: battle.landName,
    role: battle.role ?? 'defence',
    outcome: battle.outcome === 'fighting' ? (decision === 'retreat' ? 'retreat' : 'spent') : battle.outcome,
    rounds: battle.round,
    ourStart: battle.ourStart,
    theirStart: battle.theirStart,
    ourEnd: battle.ourNow,
    theirEnd: battle.theirNow,
    theirHosts: (battle.theirArmyIds ?? []).length,
    ourHosts: ourIds.length,
    levyFought: state.armies.some((army) => army.isLevy && ourIds.includes(army.id)),
    generalName: battle.delegated ? battle.generalName : undefined,
    generalHeroId: ledBy,
    kingdomName: battle.kingdomName,
    year: state.year,
    season: state.season,
    delegated: battle.delegated,
    wave: ascent.wave,
  });

  // `reported` — the record above IS this fight's report, and the shared settlement code files
  // one of its own for every engagement it settles now (see `battleReport`). Without the flag the
  // watched fight is the one fight in the run that gets reported twice.
  resolveBattleRecord(state, battleRecord(battle), resolved, forced, true);
  // A rout breaks *every* host that came to the field, not only the one that made contact:
  // a coalition that ran does not get to try the same gate again next tick, one column at a time.
  if (forced === 'defence') {
    for (const id of invaderIds) resolveBattleRecord(state, battleRecord(battle, id), 'delegate', 'defence', true);
  }
  // And a line that broke does not stand again this wave with what is left of it. The next
  // column to reach these walls is settled by dispatch, or joins the siege the winner has laid
  // (`joinsStandingSiege`) — unless a field host of ours has arrived to relieve the place. See
  // `routedGround`; reported as *"I lost the fight, then another fight happened at the same
  // place in the background"*.
  if (forced === 'invader') {
    (ascent.routedGround ??= {})[battle.landId] = ascent.wave;
  }
}

/** What an assault of ours came to, applied through the same consequence the odds roll uses. */
function finishAssault(state: GameState, battle: AscentBattle, decision: 'press' | 'hold' | 'retreat'): void {
  const ascent = state.ascent!;
  const land = findLand(state, battle.landId);
  const attackers = (battle.ourArmyIds ?? [])
    .map((id) => state.armies.find((army) => army.id === id))
    .filter((army): army is Army => Boolean(army && army.kingdomId === PLAYER_KINGDOM_ID && totalUnits(army) > 0))
    .sort((a, b) => totalUnits(b) - totalUnits(a));
  const theirs = theirHosts(state, battle);
  const ourPower = attackers.reduce((n, h) => n + armyPower(state, h), 0);
  const theirPower = theirs.reduce((n, h) => n + armyPower(state, h), 0) * battle.terrainEdge;

  // Cleared before the record is filed — see `finishBattle`.
  ascent.activeBattle = undefined;
  recordEngagement(state, {
    turn: state.turn,
    key: battle.key ?? `${battle.landId}`,
    landId: battle.landId,
    landName: battle.landName,
    generalName: battle.delegated ? battle.generalName : undefined,
    generalHeroId: attackers.find((host) => host.generalHeroId)?.generalHeroId,
    kingdomName: battle.kingdomName,
    year: state.year,
    season: state.season,
    delegated: battle.delegated,
    wave: ascent.wave,
    role: 'offence',
    outcome: battle.outcome === 'fighting' ? (decision === 'retreat' ? 'retreat' : 'spent') : battle.outcome,
    rounds: battle.round,
    ourStart: battle.ourStart,
    theirStart: battle.theirStart,
    ourEnd: battle.ourNow,
    theirEnd: battle.theirNow,
    theirHosts: (battle.theirArmyIds ?? []).length,
    ourHosts: (battle.ourArmyIds ?? []).length,
    levyFought: false,
  });

  // The walls are a picture of the province's defence, not a host: they go back into the walls.
  state.armies = state.armies.filter((army) => !(army.isLevy && army.kingdomId !== PLAYER_KINGDOM_ID && army.landId === battle.landId));

  const primary = attackers[0];
  if (!primary || !land) return;
  if (decision === 'retreat' && battle.outcome !== 'we-rout' && battle.outcome !== 'they-rout') {
    // An orderly withdrawal: the host keeps its ground and its formation (recovery was applied
    // above), and its standing order settles into holding where it stands.
    state.message = t('msg.defeatAt', { land: land.name });
    return;
  }
  const victory = battle.outcome === 'they-rout'
    ? true
    : battle.outcome === 'we-rout'
      ? false
      : Math.random() * 100 < Math.min(90, Math.max(10, Math.round((ourPower / Math.max(1, ourPower + theirPower)) * 100)));
  const preview = { attackerPower: Math.round(ourPower), defenderPower: Math.round(theirPower) };
  if (land.ownerId === 'neutral' && !land.hasVillage) {
    // Empty wilderness someone was camped on: the walk-in it would have been, once cleared.
    if (victory) occupyEmptyLand(state, primary.id, land.id);
    else state.message = t('msg.defeatAt', { land: land.name });
    return;
  }
  applyAttackOutcome(state, primary, land, preview, victory);
}

/** Takes the waiting record off the state, un-pausing the world it paused. */
function takePending(state: GameState): PendingBattle {
  const pending = state.pendingBattle as PendingBattle;
  state.pendingBattle = undefined;
  state.isPaused = false;
  return pending;
}

/**
 * Records that a *person* took a dial. The officer no longer plays unclaimed dials at all — only
 * delegation hands him the field — but steering still gates his one supporting act: the
 * last-ditch rally goes only to a fight somebody is visibly fighting (see `generalPlaysBeat`).
 * Kept on the order channel alone, which is the only place that knows a person pressed something.
 */
export function markPlayerSteered(state: GameState, dial?: 'formation' | 'stance'): void {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) return;
  // No dial named means both — which is what `battle-lab` wants when it is grading a fight with
  // no commander at all, and what a caller that has not been taught the difference will get.
  if (dial !== 'stance') battle.steeredFormation = true;
  if (dial !== 'formation') battle.steeredStance = true;
}

/**
 * Orders a stance. It lands on the **next** beat, and every stance is live on every beat — the
 * four-beat lock is retired. The wind clock carries the whole cadence now, and the dial that
 * exists to cut your losses must never be the dial the game takes away.
 *
 * Never writes `battle.stance` directly: the order/effect split is what makes this a different kind
 * of control from the formation strip, and collapsing it would put both dials back on one clock.
 */
export function setBattleStance(state: GameState, stance: FieldStance): boolean {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) return false;
  if (stance === battle.stance && !battle.stancePending) return false;
  battle.stancePending = stance;
  return true;
}

/**
 * Can we change into this shape right now — is there a pip to pay for it?
 *
 * Every shape is always on the dock; the only question is stamina. A Moment's `freeReform` is the
 * one exception, and it is a gift the fight hands over, not a rule. The two earlier availability
 * rules — by army block (docs/18) and by per-shape wind (docs/19) — are retired; see `staminaOf`.
 */
export function canFormFormation(state: GameState, formation: BattleFormation): boolean {
  const battle = state.ascent?.activeBattle;
  if (!battle) return false;
  if (formation === battle.ourFormation && !battle.formationTarget) return false;
  return battle.freeReform === true || staminaOf(battle) >= 1;
}

/** The pips, for the dock and the harnesses. */
export function battleStamina(battle: AscentBattle): { pips: number; max: number; nextIn: number } {
  const pips = staminaOf(battle);
  return {
    pips,
    max: BATTLE_STAMINA_MAX,
    nextIn: pips >= BATTLE_STAMINA_MAX ? 0 : (battle.staminaClock ?? BATTLE_STAMINA_REGEN_BEATS),
  };
}

/**
 * How many beats this host needs to change shape: one, flat, for everyone.
 *
 * The old tier-and-martial table moved army quality onto a clock nobody could see; a walk the
 * player can always count is worth more than one that flatters a guard host. Quality lives in the
 * trade maths and the headcount now, and the enemy's reaction time carries the difficulty dial
 * (see `advanceEnemyFormation`). The one exception kept: a host below the rout line stumbles —
 * two beats — because a broken line re-forming as crisply as a fresh one read as a bug.
 */
export function reformBeatsFor(state: GameState, battle: AscentBattle): number {
  void state;
  if (battle.freeReform) return 0;
  return battle.ourMorale < BATTLE_ROUT_MORALE ? 2 : 1;
}

/**
 * Orders a change of shape. Instant to give, slow to arrive — the mirror of the stance dial.
 *
 * The host is in **no** formation until the clock runs out, which is the entire cost of the fast
 * dial and the question the fight is built around: is the counter worth the beats it takes to
 * reach it?
 */
export function setBattleFormation(state: GameState, formation: BattleFormation): boolean {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) return false;
  if (formation === battle.ourFormation && !battle.formationTarget) return false;
  if (!canFormFormation(state, formation)) return false;

  const beats = reformBeatsFor(state, battle);
  // The pip is spent at the order, never refunded: an order is a decision, and a decision that
  // can be taken back for free is not one. `freeReform` pays for itself.
  if (!battle.freeReform) {
    battle.stamina = staminaOf(battle) - 1;
    battle.staminaClock ??= BATTLE_STAMINA_REGEN_BEATS;
  }
  // The order counts as noticing, whether or not it turns out to be the right one — the losing
  // banner exists to say *you are being countered and have not answered*, and this is an answer.
  battle.beatsSinceOurShape = 0;
  battle.lostRun = 0;
  battle.freeReform = false;
  // The wager rides one stand: changing shape folds it.
  battle.committed = false;
  battle.formationTarget = formation;
  battle.reformBeats = beats;
  // What it counted down from, so the dock can show how far the order has walked. A bar that does
  // not know its own length finishes at the wrong time, which is worse than having no bar.
  battle.reformTotalBeats = Math.max(1, beats);
  if (beats <= 0) {
    battle.ourFormation = formation;
    battle.formationTarget = undefined;
    markFormationLanded(battle);
  }
  return true;
}

/**
 * Dồn sức: wager a second pip on the shape already held.
 *
 * The pip buys amplitude, not direction — `formationTilt` swings harder BOTH ways while the
 * wager stands, so this is the confident player's tool and the impatient player's trap. One
 * wager per stand; a change of shape folds it (see `setBattleFormation`); a walk cannot be
 * wagered on because a walking host has no shape to bet on.
 */
export function commitBattleFormation(state: GameState): boolean {
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) return false;
  if (reforming(battle.reformBeats)) return false;
  if (battle.committed) return false;
  if (staminaOf(battle) < 1) return false;
  battle.stamina = staminaOf(battle) - 1;
  battle.staminaClock ??= BATTLE_STAMINA_REGEN_BEATS;
  battle.committed = true;
  battle.beatsSinceOurShape = 0;
  return true;
}

/**
 * Record that an order arrived, and whether it was worth making.
 *
 * The dock reads this to say so. It fires on **every** landing but remembers whether the shape
 * counters, because praise for a change that bought nothing is noise a player learns to ignore
 * inside two fights.
 */
export function markFormationLanded(battle: AscentBattle): void {
  battle.landedBeat = (battle.approachBeats ?? 0) + battle.round;
  battle.landedCountered = formationBeats(
    battle.ourFormation,
    battle.theirFormationTarget ?? battle.theirFormation,
  );
}

/** A snapshot for the view, so the scene never reaches into army internals itself. */
export function battleView(state: GameState): AscentBattle | undefined {
  return state.ascent?.activeBattle;
}


