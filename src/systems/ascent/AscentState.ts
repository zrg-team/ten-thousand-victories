import {
  MIN_ARMY_SOLDIERS,
  REMNANT_SHARE,
  BASE_DRAFT_WEIGHTS,
  COALITION_COOLDOWN_TICKS,
  RAID_INTERVAL_TICKS,
  REROLL_BASE_COST,
  TRIBUTE_COOLDOWN_TICKS,
  VASSAL_COOLDOWN_TICKS,
  WAVE_GRACE_TICKS,
  xpToNextLevel,
} from '../../game/ascentConfig';
import { provinceIsFalling } from '../LandSystem';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { canSpend } from '../ResourceSystem';
import { RESTORE_CARD_GAP_TICKS } from '../../game/ascentConfig';
import type { AscentConquestMethod, AscentLaneStats, AscentPrompt, AscentPromptKind, AscentState, GameState } from '../../state/types';

/**
 * Hosts the realm can actually fight with.
 *
 * Three readers had this inline and had to agree: `autoRecruit` (against its target),
 * `tickDecisionDirector` (whether to yield its window to the muster) and `advanceAscentTick`
 * (whether the last one has just died). They must use one definition or the court stands down for
 * a muster the autopilot does not think it needs.
 *
 * A garrison levy is not a host — it is dissolved the moment its battle ends. Nor is a story's
 * auxiliary: accepting help must not tell the realm it already has the army it needs. And a
 * remnant under `REMNANT_SHARE` of a minimum host is a rout's leftovers rather than a line.
 */
export function standingHostCount(state: GameState): number {
  return state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID
    && !army.isLevy
    && !army.patron
    && army.units.spearmen + army.units.archers + army.units.heavyInfantry
      >= MIN_ARMY_SOLDIERS * REMNANT_SHARE).length;
}

/** True while the realm has at least one host it could put in a line. */
export function hasStandingHost(state: GameState): boolean {
  return standingHostCount(state) > 0;
}

/**
 * **Rejected: clearing `musterDeclinedUntil` when the realm's last host dies.**
 *
 * The idea is sound in the abstract — a decline penalty arguably should not outlive the situation
 * it was declined in — and it was tried here. Two measurements killed it.
 *
 * It buys nothing: across sixteen seeded runs there were twelve host deaths and **not one** of them
 * happened with a decline silence standing, so the clause was a no-op and every downstream number
 * (host coverage, relief rate, army share) came back byte-identical.
 *
 * And it costs two regressions. `verify-ascent` went from one failure to three — *battles do not
 * swallow the run* and *autopilot recruited* — stable over three runs each way. The mechanism is
 * the same one that made shortening the failed-accept silence worse: a muster card that re-raises
 * after being refused is answered the same way again, and every re-raise spends a slot out of the
 * pacing budget that battles and the rest of the court are drawing on.
 *
 * If it is tried again, it needs to be paired with something that stops the re-raise loop — and it
 * needs a run where the silence is actually standing at the moment of death, which is not a state
 * these seeds reach.
 */

function createLaneStats(): AscentLaneStats {
  const methods: AscentConquestMethod[] = ['bribe', 'diplomacy', 'intimidation', 'settle', 'occupy', 'siege'];
  return {
    conquestsByMethod: Object.fromEntries(methods.map((method) => [method, 0])) as Record<AscentConquestMethod, number>,
    appointments: 0,
    edictsEnacted: 0,
    parliamentAnswered: 0,
    envoyActions: {},
    rivalAnswers: 0,
  };
}

export function createAscentState(): AscentState {
  return {
    wave: 0,
    ticksToWave: WAVE_GRACE_TICKS,
    bossTelegraphed: false,
    waveInFlight: false,
    lastWaveBoss: false,
    invasionsLastTick: 0,
    power: 0,
    powerPrev: 0,
    peakPower: 0,
    threat: 0,
    defensePower: 0,
    level: 1,
    xp: 0,
    xpToNext: xpToNextLevel(1),
    pendingLevelUps: 0,
    cardStacks: {},
    retiredCards: [],
    draftWeights: { ...BASE_DRAFT_WEIGHTS },
    summonPity: 0,
    summonsDone: 0,
    rerollCost: REROLL_BASE_COST,
    frontLandId: undefined,
    frontBlocked: false,
    capitalLostTicks: 0,
    marchCooldown: 0,
    promptQueue: [],
    autopilotStats: { builds: 0, upgrades: 0, recruits: 0, marches: 0 },
    laneState: { conquer: 'ready', court: 'ready', world: 'ready', lastDecisionTurn: {} },
    conquestPlans: [],
    decisionPressure: 0,
    idleTicks: 0,
    laneStats: createLaneStats(),
    wavesSurvived: 0,
    heroesSummoned: 0,
    rubbingsEarned: 0,
    promptCooldowns: {},
    promptWaiting: {},
    famineCooldown: 0,
    autoResolveBattles: false,
    autoMusterSilently: false,
    autoClaimSilently: false,
    lastWatchedWave: -1,
    lastPromptTurn: 0,
    drawnCourtCards: [],
    courtCardCooldown: 3,
    defenceSamples: [],
    ambition: 0,
    ambitionThisWave: 0,
    waveHeat: 1,
    ambitionSpent: 0,
    ambitionPeak: 0,
    warPurchases: 0,
    twiceBornWave: -1,
    raidCooldown: RAID_INTERVAL_TICKS,
    tributeCooldown: TRIBUTE_COOLDOWN_TICKS,
    coalitionCooldownTicks: COALITION_COOLDOWN_TICKS,
    vassalCooldown: VASSAL_COOLDOWN_TICKS,
    coalitionPending: false,
    reservedHeroIds: [],
    reserveSeatMark: 0,
  };
}

/**
 * Prompt priority, highest first. A plain table rather than a chain of `if`s in the UI,
 * so the ordering is one place to read and retune.
 *
 * The reasoning: terminal states first; then setup; then closure on what just happened; then
 * the time-critical defence; then the second half of a decision already begun (picking *how*
 * to take a province, or where a champion serves — leaving either half-finished is the most
 * confusing thing the queue can do); then the choices that keep the run moving; rewards last,
 * so a wave landing never gets buried behind a card draft.
 */
const PROMPT_PRIORITY: Record<AscentPromptKind, number> = {
  'run-over': 0,
  // Ahead of the mandate, which is ahead of the founding: the rite that makes the king comes
  // before the throne is handed anything and before anybody rises beside him.
  coronation: 0.4,
  // The ceremony, in the order it is walked. Both are raised by hand on the terminal path rather
  // than queued behind anything, so these numbers only ever decide a tie against a card the run
  // had already banked — and the ceremony wins it, because there is nothing left to answer.
  'dynasty-level': 0.1,
  'bind-card': 0.15,
  'next-reign': 0.2,
  // Between the rite and the dowry, in the order the reign is actually assembled: the king is
  // made, the house says what it already owns, and only then is the throne handed something new.
  inheritance: 0.45,
  mandate: 0.5,
  founder: 1,
  'wave-result': 2,
  // Closure on what just happened, beside the wave result: the player has lost a host and needs
  // to know before they are asked to plan the next season with an army that is no longer there.
  'host-lost': 2.5,
  'empire-response': 3,
  'conquer-method': 4,
  'court-appointment': 5,
  'conquer-target': 6,
  'law-choice': 7,
  // Just below the standing law it is a cousin of. A sac, du, hich or le is raised by the
  // world rather than reached for, so it should not push aside a decision the player has
  // already half-made — but it outranks the court and the envoy, because a hich is only ever
  // offered in the two seasons before a Great Invasion and is worthless a season later.
  'decree-offer': 7.5,
  // Just above the laws it will shape. Four cards in a whole run, each governing the era that
  // follows it, so it should not queue behind an edict it is about to change the value of.
  doctrine: 6.5,
  parliament: 8,
  // Between the parliament and the envoy: a host is worth more than a letter and less than a law,
  // and a muster the player has been asked about must not queue behind a draft.
  'muster-proposal': 8.5,
  // Under the muster, over the envoy. A province bleeding food costs the realm something every
  // tick it waits, the way a famine does — but unlike a famine it is a standing condition, not
  // an emergency, so it must not push a host or a law out of the way to be heard.
  'province-order': 8.7,
  envoy: 9,
  // **Last of everything.** An event is the world *reporting*; every other card is the realm being
  // asked to act, and an act outranks a report every time.
  //
  // It was tried at 9.2 — just under the envoy — on the reasoning that a stale event is worthless.
  // Measured, that reasoning was wrong in the way that matters: the mode's card budget is
  // contended, and a new kind does not merely add its own cards, it *displaces* everyone else's.
  // At 9.2 a run stopped expanding and stopped building a deck, because the conquest and draft
  // cards that drive both were the ones giving way. A feature that makes the run worse to add
  // texture to it has the trade backwards.
  'world-event': 12,
  'rival-demand': 3.5,
  // Above the rival demands: an empty granary is already costing the realm morale and
  // population every single tick it goes unanswered.
  famine: 3.2,
  // Beside the famine: a province that was fought over is losing output and walls every tick
  // the rebuilding is not decided, and the decision is what the fight was for.
  'restore-land': 3.3,
  'hero-choice': 10,
  'power-draft': 11,
  // Below every decision that moves the run and above the reward draft. A blow that has already
  // been telegraphed by two whispers should not jump ahead of a wave landing, but it must not sit
  // behind a card draft either — the world has already changed by the time it speaks.
  'story-beat': 9.5,
};

/**
/**
 * Kinds where a second prompt is *the same question asked again with fresher numbers*, not a
 * second thing to decide.
 *
 * A conquest target list, a wave response, a founding gift — each is recomputed from live state
 * every time it is raised, so two of them are one decision, and the newer one is strictly the
 * truer one. These supersede in place: the stale copy goes, the question stays.
 *
 * `power-draft` is here for a different reason and it matters: the draft is backed by the
 * `pendingLevelUps` counter, so a level earned while one is open is already banked and a second
 * card would open the same draft twice for one level.
 *
 * **Everything not in this set stacks.** A second court appointment, a second envoy, a second
 * famine, a second beat of a story is a *different* thing being asked, and dropping it is the
 * game deciding something needed the player and then quietly deciding it did not.
 */
const SUPERSEDED: ReadonlySet<AscentPromptKind> = new Set<AscentPromptKind>([
  'conquer-target', 'conquer-method', 'empire-response', 'wave-result', 'mandate', 'founder',
  'power-draft',
  // There is only ever one coronation, and a second raise of it is the same rite, not a second
  // one. Superseding rather than stacking is what keeps a reload mid-rite from queueing two.
  'coronation',
  // Same argument, and the same reload: the inheritance reads the stores live at draw time, so
  // two of them are one screen and the second is only ever the truer one.
  'inheritance',
]);

/**
 * How many of one kind may wait at once.
 *
 * Not unbounded: a run that banks eleven court appointments through a long siege hands the player
 * eleven cards the moment it ends, which is its own kind of losing them. Past the cap the *oldest*
 * of that kind gives way, so what survives is what is still true.
 */
const MAX_QUEUED_PER_KIND = 3;

/**
 * Queues a decision.
 *
 * The rule this used to follow was "only one prompt of a kind can be outstanding", and a second
 * was simply dropped on the floor. From the throne that reads as a card removing another card:
 * two champions arrive and you are asked about one, a second province revolts and nobody tells
 * you. Distinct requests now stack; only genuinely-recomputed ones supersede.
 */
/**
 * The cards a fully manual run does without: every one of them asks the player to do something a
 * lane already lets them do on their own terms. Events are not on this list.
 *
 * The silence is for the court's *own* proposals — the decision director raising a card on its
 * clock. The same card reached from a lane is the player doing the thing on their own terms, and
 * it must come up: with the silence applied to both, "Ban chiếu chỉ" on the Court page closed the
 * lane and showed nothing on every hands-on run — which is every desktop run.
 */
const HARDCORE_SILENCED: ReadonlySet<AscentPrompt['kind']> = new Set([
  'conquer-target', 'court-appointment', 'law-choice', 'decree-offer', 'province-order', 'muster-proposal', 'envoy',
]);

export function enqueueAscentPrompt(
  state: GameState,
  prompt: AscentPrompt,
  /** `requested`: the player asked for this card from a lane, so the hands-on silence does not apply. */
  opts: { requested?: boolean } = {},
): void {
  const ascent = state.ascent;
  if (!ascent) return;
  if (ascent.hardcore && !opts.requested && HARDCORE_SILENCED.has(prompt.kind)) return;

  if (prompt.kind === 'run-over') {
    // The one card that is allowed to take the screen from everything else, because there is
    // nothing left to answer.
    ascent.promptQueue = [prompt];
    state.pendingAscentPrompt = undefined;
    return;
  }

  if (SUPERSEDED.has(prompt.kind)) {
    // Already on screen: the player is looking at this exact question and the answer they give
    // is applied against live state anyway. Leave it alone rather than swapping the card under
    // their hand mid-read.
    if (state.pendingAscentPrompt?.kind === prompt.kind) return;
    const at = ascent.promptQueue.findIndex((queued) => queued.kind === prompt.kind);
    if (at >= 0) ascent.promptQueue[at] = prompt;
    else ascent.promptQueue.push(prompt);
    return;
  }

  const waiting = ascent.promptQueue.filter((queued) => queued.kind === prompt.kind).length;
  if (waiting >= MAX_QUEUED_PER_KIND) {
    const oldest = ascent.promptQueue.findIndex((queued) => queued.kind === prompt.kind);
    ascent.promptQueue.splice(oldest, 1);
  }
  ascent.promptQueue.push(prompt);
}

/**
 * A muster card the world has answered for itself: there is nobody left for it to name.
 *
 * The plan names a free commander chosen when the card was queued, and the card is answered some
 * seasons later. By then that champion may already be at the head of a host. Reading it is a
 * question the game has no business asking, and answering it was worse — `raiseHostWithPlan`
 * releases the commander, so accepting quietly took the general off the host he was leading.
 *
 * Dead, not merely early: there is no later moment at which this card becomes answerable, so it
 * is dropped.
 */
/**
 * The restore card is raised the tick a fight ends, which is usually the tick after the wave's
 * own card — and a district heals slowly, so nothing is lost by asking a season later. Stepped
 * over until the pacing gap has passed, the way the director spaces its scheduled cards, so it
 * never lands back-to-back with the card before it. `verify-ascent` holds that contract.
 */
function restoreCardEarly(state: GameState, prompt: AscentPrompt): boolean {
  if (prompt.kind !== 'restore-land') return false;
  const last = state.ascent?.lastPromptTurn;
  return last !== undefined && state.turn - last < RESTORE_CARD_GAP_TICKS;
}

/**
 * A rebuild card for a province that is no longer ours.
 *
 * Reported: *if my land lose should not show modal ask me to rebuild the land.* The card is raised
 * the tick a fight ends and then deliberately held a few seasons (`restoreCardEarly`) so it does
 * not land back-to-back with the wave's own card — and the war does not wait those seasons. The
 * next column takes the province while its rebuilding question is still in the queue, and the
 * player is then asked *"{land} was fought over: how hard does the throne push the rebuilding?"*
 * about ground the throne has just lost, with a mason's bill attached to somebody else's walls.
 *
 * Dead, not early: there is no later season at which this becomes answerable. Retaking the
 * province is its own fight, and it raises its own card.
 */
function restoreCardDead(state: GameState, prompt: AscentPrompt): boolean {
  if (prompt.kind !== 'restore-land') return false;
  const land = state.lands.find((one) => one.id === prompt.landId);
  // Ownership is the *late* half of this test, and on its own it is two to six seasons late.
  // A province whose walls have been carried is still flagged ours for the whole claim, so the
  // card sailed through this guard and asked the throne to fund masonry on a district an enemy
  // host was standing in — reported against the capital: *it shows a modal confirming I lost, but
  // it still asks me to rebuild*. Dead either way: the answer to falling ground is a retake, and
  // retaking raises its own card.
  return !land || land.ownerId !== PLAYER_KINGDOM_ID || provinceIsFalling(state, prompt.landId);
}

function musterCardDead(state: GameState, prompt: AscentPrompt): boolean {
  if (prompt.kind !== 'muster-proposal') return false;
  const hero = state.heroes.find((candidate) => candidate.id === prompt.heroId);
  return !hero || state.armies.some((army) => army.generalHeroId === hero.id);
}

/**
 * A muster card that is merely *early*: the recruiting yard is busy this season.
 *
 * `autoRecruit` will not propose while any province is recruiting, but nothing re-checked it
 * afterwards — and the player raising a host by hand from the Army lane is the ordinary thing to
 * do while a card waits its turn in the queue. So the card arrived asking to raise an army on the
 * season the yard was already full: the reported *"the Lập quân popup shows up even when an army
 * is being gathered"*.
 *
 * **Held, not dropped, and that distinction is the whole of it.** Dropping was tried first and it
 * silently switched the autopilot off: measured on `verify-ascent`'s long run, autopilot recruits
 * went 1 → 0 and the realm finished with **no hosts at all**, because a proposal thrown away is a
 * proposal that has to be re-earned through `musterDeclinedUntil`, the court gap and the priority
 * queue. Held, the question survives its own bad timing and is asked the season the yard frees up.
 *
 * Deliberately *not* "the realm already has a host". A standing army with a bigger enemy in front
 * of it is exactly when a second muster is worth asking about; what is never worth asking is one
 * the realm cannot act on this season.
 */
function musterCardEarly(state: GameState, prompt: AscentPrompt): boolean {
  if (prompt.kind !== 'muster-proposal') return false;
  return state.recruitmentOrders.length > 0;
}

/**
 * Promotes the highest-priority queued prompt into the live slot and pauses the run.
 * Called at the end of every tick, and again after each resolution so chained prompts
 * hand over without the map un-pausing and flickering between them.
 */
export function drainAscentPrompts(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  // The card already on the screen is checked against the same rule as the queue behind it.
  //
  // A muster is queued naming a free commander and answered some seasons later, and the world
  // moves in between: the queue drop below caught the champion who took a host while the card was
  // *waiting*, and missed the one who took a host while it was *up* — the longer window of the
  // two, because the card holds the run until it is answered. The player then reads "the king asks
  // to raise a host" about a king standing with his army.
  if (state.pendingAscentPrompt) {
    const up = state.pendingAscentPrompt;
    if (musterCardDead(state, up) || restoreCardDead(state, up)) {
      state.pendingAscentPrompt = undefined;
    } else if (musterCardEarly(state, up)) {
      // Off the screen, back into the queue: a muster begun while this card stood is not a reason
      // to lose the question, only a reason to stop asking it this season.
      state.pendingAscentPrompt = undefined;
      ascent.promptQueue.push(up);
    } else {
      state.isPaused = true;
      return;
    }
  }

  if (ascent.promptQueue.length === 0) {
    state.isPaused = false;
    return;
  }

  ascent.promptQueue.sort((a, b) => PROMPT_PRIORITY[a.kind] - PROMPT_PRIORITY[b.kind]);
  // Dead cards leave; early ones stay where they are and are stepped over.
  const deadDropped = ascent.promptQueue.filter(
    (queued) => !musterCardDead(state, queued) && !restoreCardDead(state, queued),
  );
  ascent.promptQueue.length = 0;
  ascent.promptQueue.push(...deadDropped);
  const nextIndex = ascent.promptQueue.findIndex((queued) => !musterCardEarly(state, queued) && !restoreCardEarly(state, queued));
  if (nextIndex < 0) {
    state.isPaused = false;
    return;
  }
  state.pendingAscentPrompt = ascent.promptQueue.splice(nextIndex, 1)[0];
  refreshAffordability(state, state.pendingAscentPrompt);
  state.isPaused = true;
  // Stamped here rather than in the decision director, because this is the one place *every*
  // prompt passes through. Stamping it only where the director raises one lets a wave response
  // or a chained follow-up be immediately followed by a fresh card on the very next tick,
  // which is precisely the slideshow the gap rule exists to prevent.
  ascent.lastPromptTurn = state.turn;
  // Same reasoning, same single choke point: this is the only honest count of what the player has
  // actually been shown, and the Chronicle's share is measured against it.
  ascent.promptsRaised = (ascent.promptsRaised ?? 0) + 1;
}

/**
 * A card's prices are true when it surfaces, not when it was queued.
 *
 * Every priced card (`famine`, `story-beat`, `restore-land`, `world-event`, `rival-demand`…) stamps
 * `affordable` when it is *enqueued*, and it can wait many ticks behind higher cards that spend the
 * same treasury — a restore paid at 3.3 empties the purse a story at 9.5 was priced against. The
 * resolver re-checks and refuses, the card stays up with an option that looks takeable, and a
 * driver that retries the same option wedges the run: measured on seed 55, a `story-beat` sat
 * pending from tick 100 to tick 600 with an `empire-response` behind it, so no wave was ever
 * launched and the realm "held" forty waves it never fought. Only ever downgrades: a card never
 * gains an option here that its own builder did not grant.
 */
function refreshAffordability(state: GameState, prompt: AscentPrompt): void {
  const options = (prompt as { options?: unknown }).options;
  if (!Array.isArray(options)) return;
  for (const option of options as { cost?: Parameters<typeof canSpend>[1]; affordable?: boolean }[]) {
    if (!option || typeof option !== 'object') continue;
    if (option.affordable && option.cost && !canSpend(state, option.cost)) option.affordable = false;
  }
}
