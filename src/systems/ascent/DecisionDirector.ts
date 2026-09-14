import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { hasStandingHost } from './AscentState';
import {
  AFTERMATH_TICKS,
  COURT_GAP_TICKS,
  FAMINE_MIN_GAP_TICKS,
  MUSTER_TICKS,
  MUSTER_YIELD_MAX_TICKS,
  SUMMON_EVERY_N_WAVES,
  WAVE_INTERVAL_TICKS,
} from '../../game/ascentConfig';
import { buildDecreeOffer, offerDecree } from '../decree/OfferSystem';
import { buildConquestTargets, offerConquestPrompt } from './ConquestSystem';
import {
  buildLawOptions,
  findHeroNeedingPosting,
  offerAppointment,
  offerLawChoice,
  offerParliament,
  progressAscentCourtCooldown,
} from './CourtLaneSystem';
import { offerEnvoy, pickEnvoyTarget } from './EnvoySystem';
import { maybeOfferWorldEvent } from './WorldEventSystem';
import { offerProvinceOrder, provinceOrderReady } from './ProvinceOrderSystem';
import { famineReady, offerFamine, tickFamineCooldown } from './FamineSystem';
import { offerRivalDemand, rivalDemandReady, tickRivalCooldowns } from './RivalDirector';
import { offerHeroSummon } from './SummonSystem';
import { offerPowerDraft } from './PowerDraftSystem';
import { inAnyBattle } from './fronts';
import { doctrineReady, offerDoctrine } from './RealmDoctrineSystem';
import { offerStoryBeat, omenBeatReady, storyBeatReady, storyCardsMuted } from '../story/StorySystem';
import type { AscentPhase, AscentPromptKind, GameState } from '../../state/types';

/**
 * The pacing contract.
 *
 * Seven independent systems can each demand the player's attention, and left to themselves
 * they turn the run into a slideshow of modals with no play between them. Everything about
 * *when* the game interrupts lives here, in one readable table, rather than being smeared
 * across each system's tick.
 */

/**
 * A flat `MIN_GAP_TICKS = 4` used to live here, applied identically from the first season to
 * the last. Its history is worth keeping, because the phase gate below inherits its job:
 *
 * measured at a gap of 2, a full run raised ~250 prompts across 320 ticks — one decision every
 * 1.3 seasons — and half of all ticks ended with a modal open, so the map (the mode's entire
 * art surface, and the thing the autopilot does all its work on) was never on screen. Widening
 * it to 4 fixed the density and created a new problem: a perfectly even one, cv 0.106, in which
 * no stretch of a run felt different from any other.
 *
 * The gap is now a property of *where in the cycle you are* rather than a constant — see
 * `ascentPhaseFor` and `COURT_GAP_TICKS`.
 */

/**
 * Ticks a kind stays quiet after being answered. Event-driven kinds are absent on purpose.
 *
 * `conquer-target` is deliberately the longest of the recurring three. It fires as a *pair*
 * (province, then method), so at a 3-tick cooldown it alone accounted for ~46% of every
 * decision in a run — and the answer was "bribe" 68–90% of the time. Making the same choice
 * fifty times is not a decision, it is data entry.
 *
 * 6 rather than 9: at 9 the realm finished a run holding three to five provinces where it had
 * held twenty-four to thirty-two, and a map that never visibly grows is its own kind of dead
 * run. This was the dial that traded map growth against prompt fatigue.
 *
 * Cut to 3 once the phase gate took over the fatigue half of that trade. A six-season quiet
 * period is longer than a whole Court window, so a conquest answered in one cycle was not
 * ready again until the cycle after next: measured, the gate alone cost an engaged realm two
 * provinces and a third of its peak power, and dropped its advantage over a realm that
 * declined everything from 1.39× back to 1.07×. Two rules each holding the same lane closed
 * is one rule too many.
 */
const PROMPT_COOLDOWN: Partial<Record<AscentPromptKind, number>> = {
  'conquer-target': 3,
  // The Chronicle speaks mostly in whispers, which cost nothing. The few fragments loud enough
  // to stop the world are rationed here so a story can never turn the run into a reading task.
  'story-beat': 4,
  'court-appointment': 5,
  // Long on purpose. A shortage is a standing condition, and a card that re-offered the same
  // province every third season would be nagging rather than advising — the lever it proposes
  // is permanent, so once the realm has answered it should be left alone to see the answer work.
  'province-order': 9,
  'law-choice': 8,
  // The four raised instruments share one cooldown because they share one slot. Long, so a
  // village asking about its market days cannot crowd out the court — but shorter than the
  // law it sits beside, since a hich is only offered inside a two-season window and would
  // otherwise never be seen at all.
  'decree-offer': 10,
  envoy: 12,
};

/**
 * Ticks of nothing-to-do before the director stops waiting for a natural trigger and raises
 * the best available prompt anyway. This is the mechanical guarantee behind "the run never
 * has a stretch where there is nothing new".
 */
const STARVATION_TICKS = 4;

/**
 * Order the director tries kinds in. Time-critical first, then the follow-up that finishes a
 * decision already begun, then the choices that move the run forward, then rewards — a wave
 * landing must never be buried behind a card draft.
 */
/**
 * Ticks a ready kind may sit outranked before it jumps the queue.
 *
 * A strict priority list starves its own tail. Measured after the gap between prompts was
 * widened to 4: `hero-choice`, `law-choice`, `parliament` and `envoy` fired **zero** times in
 * a 320-tick run at every seed — the first four kinds consumed every slot. Losing the champion
 * summon in particular guts the mode, since the roster and the gacha are its identity.
 *
 * Ageing keeps the ordering meaningful for ordinary contention while guaranteeing that
 * anything with something to say is eventually heard. Counted in real ticks — see the loop in
 * `tickDecisionDirector`, which is why it sits above the gap gate rather than below it.
 *
 * Tuned rather than reasoned: promoting the summon by *reordering* the list instead simply
 * inverted the problem — heroes and their postings took 35% of a run's decisions and the realm
 * stopped expanding at four provinces. Ageing gives the tail a floor without giving it a
 * monopoly.
 */
const KIND_STARVATION_TICKS = 18;

/**
 * Kinds that age faster than that, and why each one does.
 *
 * `power-draft` is the only entry, and it is here because it is the only kind in the list that
 * is not the game asking the player for something — it is the game *owing* them something. A
 * level-up is already earned and already banked (`pendingLevelUps`); the card is only where it
 * gets spent. Ranked seventh and aged at eighteen it lost every slot to the realm's own
 * business: measured across six seeds, a banked draft waited **twenty-two seasons** before it
 * was offered, and two rendered runs of three minutes reached level 3 holding two unspent
 * drafts having been offered neither — in a mode whose whole identity is picking powers.
 *
 * Six, and the two numbers either side of it are both worse for reasons worth recording.
 *
 * At **four** the draft is offered promptly (a flat four-season wait on every seed) and it
 * starts taking Court slots from the cards that arm the realm: `verify-ascent-opening` fell
 * from 12/12 to 10/12, with the first three waves fought on the field dropping to 3 of 12. A
 * reward that arrives by pushing the army aside is not a better opening.
 *
 * At **eight and above** the wait stops being a wait and becomes a lottery. The cycle is
 * `WAVE_INTERVAL_TICKS` = 12 and only its Court stretch raises anything, so a threshold that
 * lands near the end of one window is not served until the next: measured worst-case waits were
 * 20 at eight, 16 at ten, and 20 again at twelve, against a uniform 6 here. The dial is not
 * smooth, and six is the last value on the tight side of that cliff.
 */
const KIND_STARVATION_OVERRIDE: Partial<Record<AscentPromptKind, number>> = {
  'power-draft': 6,
};

function starvationTicksFor(kind: AscentPromptKind): number {
  return KIND_STARVATION_OVERRIDE[kind] ?? KIND_STARVATION_TICKS;
}

const CONSIDER_ORDER: AscentPromptKind[] = [
  // First among the scheduled kinds. It fires four times in a whole run — once per era — and it
  // sets what the autopilot does with every season after it, so making it wait behind a card
  // draft would spend a third of the era it is meant to govern.
  'doctrine',
  // Famine leads. It is the only scheduled card whose subject is actively costing the realm
  // something every tick it waits, and it was the undiagnosed cause of most lost runs.
  'famine',
  // Rivals speak next among the scheduled cards: a demand is time-critical in a way a
  // card draft is not, and it is the pressure that was missing from the run entirely.
  'rival-demand',
  'court-appointment',
  // Below the rival's demand, above the conquest card. A province bleeding food costs the realm
  // every tick it waits and the answer is cheap — but a demand expires and a shortage does not.
  'province-order',
  'conquer-target',
  // Above the card draft: a hich exists only in the two seasons before a Great Invasion
  // lands, and a du answers something costing the realm every tick it waits. A power card
  // can wait a season; neither of those can.
  'decree-offer',
  'power-draft',
  'hero-choice',
  'law-choice',
  'parliament',
  'envoy',
  // Last of the scheduled kinds on purpose. A story is the least time-critical thing the
  // director can raise — it has waited seasons already and can wait one more — and putting it
  // ahead of the realm's actual business is how a narrative feature starts feeling like homework.
  // Ageing through KIND_STARVATION_TICKS still guarantees it is eventually heard.
  'story-beat',
];

/**
 * Share of a run's prompts the Chronicle may take.
 *
 * The DecisionDirector's own history is the argument for this number: nine kinds already compete
 * for the queue, four of them were measured firing *zero* times in a 320-tick run before ageing
 * was added, and a tenth kind with saga-length ambitions would starve the champion summon — which
 * is half this mode's identity. Whispers are exempt because they never pause anything.
 */
const STORY_PROMPT_SHARE = 0.15;

/**
 * Which phase of the wave cycle a countdown reading falls in.
 *
 * A pure function of the clock rather than a stored field, so the HUD, the director and any
 * later presentation of the cycle cannot drift apart — and so it stays correct across a save
 * without needing migration.
 *
 * Deliberately *not* keyed off `waveInFlight`: hosts can stand on the map for many seasons
 * while marching and besieging, so a phase that waited for the field to clear would swallow
 * whole cycles and leave the player with nothing to do for minutes at a time.
 */
export function ascentPhaseFor(ticksToWave: number): AscentPhase {
  if (ticksToWave <= MUSTER_TICKS) return 'muster';
  if (ticksToWave > WAVE_INTERVAL_TICKS - AFTERMATH_TICKS) return 'aftermath';
  return 'court';
}

/** The phase the run is in right now. */
export function ascentPhase(state: GameState): AscentPhase {
  return ascentPhaseFor(state.ascent?.ticksToWave ?? WAVE_INTERVAL_TICKS);
}

export function tickPromptCooldowns(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  for (const kind of Object.keys(ascent.promptCooldowns) as AscentPromptKind[]) {
    const value = ascent.promptCooldowns[kind] ?? 0;
    if (value <= 1) delete ascent.promptCooldowns[kind];
    else ascent.promptCooldowns[kind] = value - 1;
  }
  progressAscentCourtCooldown(state);
  tickFamineCooldown(state);
  tickRivalCooldowns(state);
}

/** Starts a kind's quiet period. Called by the resolver when a prompt is answered. */
export function startPromptCooldown(state: GameState, kind: AscentPromptKind): void {
  const ascent = state.ascent;
  const ticks = PROMPT_COOLDOWN[kind];
  if (!ascent || !ticks) return;
  ascent.promptCooldowns[kind] = ticks;
}

// ── Readiness ───────────────────────────────────────────────────────────────

/**
 * True when a kind has something real to say — not merely that its timer elapsed.
 *
 * Exported as `isAscentPromptReady` below, so a harness can ask the question directly instead of
 * running a hundred ticks and hoping the card it is testing for comes up.
 */
function isReady(state: GameState, kind: AscentPromptKind): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  if ((ascent.promptCooldowns[kind] ?? 0) > 0) return false;

  switch (kind) {
    case 'court-appointment':
      return Boolean(findHeroNeedingPosting(state));

    case 'conquer-target': {
      if (ascent.marchCooldown > 0) return false;
      // Only worth asking when a host is actually free to act on the answer, or when a
      // bloodless method (bribe, claim, settle) is affordable regardless of armies.
      //
      // **A host, not a headcount.** This used to accept any army with no march or siege order
      // against its name — which is every garrison levy standing on a wall, and every column
      // already in a battle line. So with all the claim slots committed and every real host in
      // the field, *Which way shall we expand?* still came up over a sheet on which nothing at
      // all could be pressed. Reported verbatim: *no need to show it, it is meaningless.*
      const idleHost = state.armies.some(
        (army) =>
          army.kingdomId === PLAYER_KINGDOM_ID &&
          !army.isLevy &&
          army.units.spearmen + army.units.archers + army.units.heavyInfantry > 0 &&
          !inAnyBattle(state, army.id) &&
          !state.movementOrders.some((order) => order.armyId === army.id) &&
          !state.siegeOrders.some((order) => order.armyId === army.id),
      );
      const targets = buildConquestTargets(state);
      const takeable = targets.filter((target) => target.methods.some((method) => !method.blockedReason));
      if (takeable.length === 0) return false;
      return idleHost || takeable.some((target) =>
        target.methods.some((method) => !method.blockedReason && method.method !== 'siege' && method.method !== 'occupy'));
    }

    case 'decree-offer':
      return Boolean(buildDecreeOffer(state));

    case 'doctrine':
      return doctrineReady(state);

    case 'power-draft':
      return ascent.pendingLevelUps > 0;

    case 'hero-choice':
      // Two sources: the court's Favor draft has already paid out, or a wave milestone is due.
      return Boolean(state.activeHeroDraft?.length)
        || (Math.floor(ascent.wavesSurvived / SUMMON_EVERY_N_WAVES) > ascent.summonsDone && state.heroDeck.length > 0);

    case 'law-choice':
      return buildLawOptions(state).length > 0;

    case 'parliament':
      return ascent.courtCardCooldown <= 0 && state.politicsDeck.length > 0;

    // `pickEnvoyTarget` already filters to courts worth visiting, so a target existing *is*
    // the readiness condition.
    case 'envoy':
      return Boolean(pickEnvoyTarget(state));


    case 'famine':
      return famineReady(state);

    case 'province-order':
      return provinceOrderReady(state);

    case 'rival-demand':
      return rivalDemandReady(state);

    case 'story-beat': {
      // The player has asked for these to wait in the Chronicle rather than stop the run. The
      // story keeps holding its card; nothing is lost, it is simply answered somewhere else.
      if (storyCardsMuted(state)) return false;
      if (!storyBeatReady(state)) return false;
      // Budget measured against prompts actually raised, not against ticks: a quiet run raises
      // few prompts of any kind, and the Chronicle should stay the same fraction of a busy run
      // and a slow one.
      // `promptsRaised` is stamped in `drainAscentPrompts`, the one place every prompt of every
      // kind passes through. The floor keeps the opening seasons from being all Chronicle before
      // the run has raised anything to take a share of.
      // An omen — a story answering a moment that will not come round again — is outside the share.
      if (omenBeatReady(state)) return true;
      const raised = state.storyPromptsRaised ?? 0;
      const shown = Math.max(8, ascent.promptsRaised ?? 0);
      return raised / shown < STORY_PROMPT_SHARE;
    }

    default:
      return false;
  }
}

/** Raises one prompt of the given kind. Returns false when its producer declined. */
function raise(state: GameState, kind: AscentPromptKind): boolean {
  switch (kind) {
    case 'court-appointment': {
      const hero = findHeroNeedingPosting(state);
      return Boolean(hero && offerAppointment(state, hero.id));
    }
    case 'conquer-target':
      return offerConquestPrompt(state);
    case 'doctrine':
      return offerDoctrine(state);
    case 'power-draft':
      offerPowerDraft(state);
      return true;
    case 'hero-choice':
      return offerHeroSummon(state);
    case 'law-choice':
      return offerLawChoice(state);
    case 'decree-offer':
      return offerDecree(state);
    case 'parliament':
      return offerParliament(state);
    case 'envoy':
      return offerEnvoy(state);

    case 'famine':
      return offerFamine(state);

    case 'province-order':
      return offerProvinceOrder(state);
    case 'story-beat':
      return offerStoryBeat(state);

    case 'rival-demand':
      return offerRivalDemand(state);
    default:
      return false;
  }
}

/**
 * Raises at most one prompt per tick.
 *
 * A wave response or a run ending is queued by its own system and outranks anything decided
 * here — this only governs the seven recurring decisions. Those two deliberately bypass the
 * gap rule (a host arriving cannot wait two seasons for a polite pause), which is why they are
 * not in `CONSIDER_ORDER`; everything scheduled here does respect it.
 */
/** `isReady`, for the harnesses. */
export function isAscentPromptReady(state: GameState, kind: AscentPromptKind): boolean {
  return isReady(state, kind);
}

export function tickDecisionDirector(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  ascent.promptWaiting ??= {};
  const ready = CONSIDER_ORDER.filter((kind) => isReady(state, kind));

  // Age every kind that has something to say, on every tick.
  //
  // Deliberately above the gates below: counting only the ticks on which the director got as
  // far as choosing meant a threshold of 14 was really 14 *raise opportunities*, roughly forty
  // seasons, and the champion summon surfaced two or three times in an entire run. Ageing in
  // real ticks is what makes the number below mean what it says.
  for (const kind of CONSIDER_ORDER) {
    if (ready.includes(kind)) ascent.promptWaiting[kind] = (ascent.promptWaiting[kind] ?? 0) + 1;
    else delete ascent.promptWaiting[kind];
  }

  // Something is already waiting: do not stack a second decision behind it.
  if (state.pendingAscentPrompt || ascent.promptQueue.length > 0) return;

  /**
   * **A realm with no host in the field yields its next window to the muster.**
   *
   * Not a shorter gap — the same gap, given to a different card. `proposeMuster` needs two clear
   * seasons since the last prompt, and in the middle of a run the court raises something most
   * seasons, so the muster never found one: measured across eight seeded runs, the gap alone
   * blocked 23 of 28 hostless ticks on the worst seed and the realm reached wave 5 with nothing in
   * the field. Shortening it to one season fixed the coverage and put `muster-proposal` straight
   * back into `verify-ascent`'s `backToBackKinds` — which is the assertion the gap exists for.
   *
   * So the pacing is left exactly alone and the *priority* changes instead. A realm with no army
   * cannot relieve a siege, take ground or answer a wave, and every scheduled decision the court
   * has to offer is downstream of having one. Yielding costs the court nothing permanent: kinds
   * age through `KIND_STARVATION_TICKS` while they wait, and the yield ends the moment a host
   * musters.
   *
   * Deliberately narrow. It reads only state — no import of the muster path, which would make a
   * cycle of `AutopilotSystem` -> `MusterSystem` -> here — and it requires a free champion,
   * because a realm with nobody to command a host is not about to raise one and standing the court
   * down for a card that cannot be raised is a deadlock rather than a priority.
   *
   * `MUSTER_YIELD_MAX_TICKS` bounds the silence. A poor realm may be unable to pay for a host for
   * a long time, and the first bound tried here was `autoRecruit`'s own runway gates — which
   * removed the whole benefit (funscore 84.7 -> 80.6, host coverage at wave 3 from seven seeds in
   * eight down to three), because a poor realm is exactly the one that needs its next card to be
   * the muster. Bounding the *silence* instead keeps that and still guarantees the court comes
   * back: without it the yield ran to a 54-season gap between decisions, which the pacing metric
   * scores as a quiet stretch and a player would read as the game having stopped.
   */
  const hasHost = hasStandingHost(state);
  const mustering = state.recruitmentOrders.length > 0;
  const commanderFree = state.heroes.some((hero) => !hero.assignedTo);
  const stoodDownTooLong = state.turn - ascent.lastPromptTurn >= MUSTER_YIELD_MAX_TICKS;
  if (!hasHost && !mustering && commanderFree && !stoodDownTooLong
    && state.turn >= (ascent.musterDeclinedUntil ?? 0)) return;

  // Famine bypasses the gap rule, like a wave landing does.
  //
  // It is the one scheduled kind whose readiness is both *transient* and *actively expensive*:
  // the granary crosses into the danger band for a few scattered seasons at a time, and every
  // one of those seasons is costing morale and population. Measured, the crisis was readable on
  // 16 ticks of a 200-tick run and the gap rule swallowed all 16 — the card existed, was
  // correctly wired, and never once appeared. A rule meant to stop modal spam should not be
  // able to suppress the emergency it most needs to surface.
  // Still never on the very next tick, though: the gap rule exists to stop modal chains, and
  // an urgent card is allowed to jump the queue without being allowed to spam it.
  const famineGapOk = state.turn - ascent.lastPromptTurn >= FAMINE_MIN_GAP_TICKS;
  if (ready[0] === 'famine' && famineGapOk && raise(state, 'famine')) {
    delete ascent.promptWaiting.famine;
    ascent.idleTicks = 0;
    return;
  }

  // The realm's scheduled business is heard in Court and nowhere else.
  //
  // This is what gives a cycle a shape. Outside Court the player is either reading what the
  // last wave cost them, watching the next one be named, or fighting it — and a card asking
  // which minister to appoint, arriving in the middle of any of those, is what made a wave
  // landing feel exactly like everything else. Nothing here suppresses a decision permanently:
  // a kind that misses its window ages through `KIND_STARVATION_TICKS` and speaks in the next.
  //
  // Famine keeps its exemption above, for the reason given there.
  //
  // The Chronicle was given a second window here — the aftermath, on the argument that reading
  // what the last wave cost is exactly when a story should speak, and that the phase gate was
  // costing 38% of the occasions a story held a card nobody raised. It was measured and taken
  // back out, and the reason is worth keeping so it is not tried again:
  //
  // `AFTERMATH_TICKS` is 2, and the aftermath sits immediately *before* Court in the cycle. So a
  // beat raised there always lands one or two seasons ahead of the Court window opening, stamps
  // `lastPromptTurn` on its way through `drainAscentPrompts`, and the gap rule then swallows the
  // first Court tick. Court is where the realm's growth is decided: `verify-economy` went from
  // all-checks-passing to a realm that never reached four provinces, its provincial demand at
  // 185% of gross. There is no safe placement — the window is two ticks wide and adjacent — so
  // the phase gate stands, and the Chronicle's volume comes from the other two fixes instead.
  if (ascentPhaseFor(ascent.ticksToWave) !== 'court') return;

  // Inside Court the gap tightens. The pacing target is not "fewer decisions" but decisions
  // that arrive together and then leave — a run measured at a flat 3.9 seasons between cards,
  // cv 0.106, had no quiet stretches to make the busy ones mean anything.
  const starving = ascent.idleTicks >= STARVATION_TICKS;
  if (!starving && state.turn - ascent.lastPromptTurn < COURT_GAP_TICKS) return;

  const overdue = ready
    .filter((kind) => (ascent.promptWaiting?.[kind] ?? 0) >= starvationTicksFor(kind))
    .sort((a, b) => (ascent.promptWaiting?.[b] ?? 0) - (ascent.promptWaiting?.[a] ?? 0));

  // **An event fills a slot nobody else wanted, or it does not happen.**
  //
  // World events were in `CONSIDER_ORDER` at first, and being last in it was not enough. A kind in
  // that list *competes*: it ages through `KIND_STARVATION_TICKS` like everything else and
  // eventually takes a Court slot from a card that was ready, which pushes that card into the next
  // window and lands it beside something else. Measured across six seeds, that took back-to-back
  // scheduled cards from 6 to 13 — and the flat 3.9-season metronome is exactly what this whole
  // phase machinery exists to break.
  //
  // Raised here instead, only on a Court tick where the gap has elapsed and **nothing else is
  // ready**, it can never displace anything. Its own grace, gap, quiet and draw live in
  // `WorldEventSystem`, so a quiet realm still does not get one every window.
  if (ready.length === 0) {
    if (maybeOfferWorldEvent(state)) ascent.idleTicks = 0;
    return;
  }

  // An omen's card goes first in Court. Last in `CONSIDER_ORDER` it waited out every other kind and
  // never reached its 18-tick starvation before its own node gave up: traced on Thánh Gióng, the
  // court's call sat held from season 341 to 355 through ten Court ticks, unraised, and the story
  // walked down "nobody was called" on its own. Still Court-only and still behind the gap.
  const omenFirst: AscentPromptKind[] = ready.includes('story-beat') && omenBeatReady(state) ? ['story-beat'] : [];
  for (const kind of [...omenFirst, ...overdue, ...ready]) {
    if (!raise(state, kind)) continue;
    // `lastPromptTurn` is stamped by `drainAscentPrompts`, which every prompt passes through.
    delete ascent.promptWaiting[kind];
    ascent.idleTicks = 0;
    return;
  }

  // Nothing was ready. When that persists, `refreshAscentLaneState` keeps raising
  // `decisionPressure`, which the HUD reads to nudge the player toward a lane button.
}
