import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { targetArmyCount } from '../../game/ascentConfig';
import { getProject, REALM_PROJECTS } from '../../data/edicts';
import {
  ALL_COURT_POSITIONS,
  assignHeroToLand,
  assignHeroToPosition,
  COURT_POSITION_EFFECTS,
  formatCourtPositionEffect,
  formatGovernorEffect,
  getCourtBonuses,
  getCourtPositionLabel,
  releaseHeroAssignment,
} from '../CourtSystem';
import { refreshAllLandOutputs } from '../ResourceSystem';
import { estateStanding, overreach } from '../DecreeSystem';
import { ennobled } from '../decree/rules';
import { weightedPickIndex } from '../../utils/math';
import { applyCourtEffect, choosePoliticsCard } from '../PoliticsSystem';
import { enactProject, isUnlockMet, projectBlockedReason, projectEffectSummary, projectTitle, isStandingLaw } from '../empire/EdictSystem';
import { eraIndex } from '../empire/MandateSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { heroName, politicsTitle, t } from '../../i18n';
import type {
  AppointmentOption,
  EstateId,
  CourtPositionId,
  GameState,
  Hero,
  HeroStats,
  Land,
  PoliticsCard,
  TaxPolicy,
} from '../../state/types';

// ── Appointments ────────────────────────────────────────────────────────────

/** The stat each seat actually converts into realm-wide bonuses (see COURT_POSITION_EFFECTS). */
const SEAT_PRIMARY_STAT: Record<CourtPositionId, keyof HeroStats> = {
  marshal: 'martial',
  quartermaster: 'logistics',
  treasurer: 'administration',
  steward: 'administration',
  chancellor: 'diplomacy',
  spymaster: 'diplomacy',
  censor: 'loyalty',
  masterOfHorse: 'renown',
};

const MAX_APPOINTMENT_OPTIONS = 3;
/** Stability the court loses when a champion is let go. */
const DISMISS_STABILITY_COST = 2;

/** The stat a seat is scored on — shared with the hero picker so both rank candidates alike. */
export function seatPrimaryStat(seat: CourtPositionId): keyof HeroStats {
  return SEAT_PRIMARY_STAT[seat];
}

/**
 * Ordering weights. These only decide which three postings are *offered* and in what order —
 * the player still chooses. They are kept close together so no single role can run away with
 * every appointment in a long run.
 */
/**
 * A vacant ministry outranks a vacant province, and by more than the governor bonus can close.
 *
 * At 10 against a governor cap of 12, a wide realm always had enough ungoverned provinces to
 * push "governor" above every court seat, so champions were posted to districts one after
 * another and the ministries stayed empty for whole runs — taking the court's realm-wide
 * multipliers, and much of the point of the law and parliament cards, out of the game. A seat
 * is a permanent realm-wide effect; a governorship helps one province.
 */
const SEAT_VACANT_BONUS = 18;
const GOVERNOR_NEED_CAP = 12;
/** Beats any stat line: the realm cannot raise a host without a free hero. */
const RESERVE_URGENT_SCORE = 200;
/** Otherwise last, but always present — the player may always decline to post someone. */
const RESERVE_IDLE_SCORE = -1;

/**
 * Where this champion could serve, best first, each printing the concrete bonus their own
 * stats produce there — so the choice is read off numbers rather than guessed from a title.
 *
 * "Await a command" is always among them — see the note on its score below.
 */
export function buildAppointmentOptions(state: GameState, hero: Hero): AppointmentOption[] {
  const scored: Array<{ option: AppointmentOption; score: number }> = [];

  for (const seat of ALL_COURT_POSITIONS) {
    if (!state.court.unlockedSeats.includes(seat)) continue;
    const sittingId = state.court.seats[seat];
    if (sittingId === hero.id) continue;

    const sitting = state.heroes.find((candidate) => candidate.id === sittingId);
    const stat = hero.stats[SEAT_PRIMARY_STAT[seat]];
    // Only propose displacing someone who is clearly worse at the job — a shuffle that trades
    // two points of martial costs 2 stability and gains nothing.
    if (sitting && sitting.stats[SEAT_PRIMARY_STAT[seat]] >= stat - 8) continue;

    scored.push({
      option: {
        id: `court:${seat}`,
        role: 'court',
        title: getCourtPositionLabel(seat),
        effect: formatCourtPositionEffect(seat, hero.stats),
        detail: sitting ? t('ascent.appoint.replaces', { hero: heroName(sitting) }) : undefined,
      },
      // A vacant ministry is a standing loss of realm-wide bonuses, so filling one outranks
      // a marginally better fit somewhere already staffed.
      score: stat + (sitting ? -12 : SEAT_VACANT_BONUS),
    });
  }

  // A garrison levy has no general and takes none: it is the province's walls turned out for
  // one battle, not a host to be given a commander.
  // Never an auxiliary: the court cannot appoint a commander over a host that does not take the
  // court's orders, and offering to is how a player learns to distrust the lane.
  const leaderless = state.armies.find((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron && !army.generalHeroId);
  if (leaderless) {
    scored.push({
      option: {
        id: `general:${leaderless.id}`,
        role: 'general',
        title: t('ascent.appoint.general'),
        effect: t('ascent.appoint.generalFx', { power: Math.round(hero.stats.martial * 0.4) }),
        detail: leaderless.name,
      },
      // A host with no commander is a live handicap, so leading one outranks a desk.
      score: hero.stats.martial + 14,
    });
  }

  const province = bestUngovernedLand(state);
  if (province) {
    scored.push({
      option: {
        id: `governor:${province.id}`,
        role: 'governor',
        title: t('ascent.appoint.governor', { land: province.name }),
        effect: formatGovernorEffect(state, hero.stats, province),
        detail: t('ascent.appoint.governorDetail'),
      },
      // Bounded on purpose. Unbounded, a wide realm makes "governor" the top-scored posting
      // forever and every champion is sent to a province while the ministries sit empty —
      // which is exactly the opposite of what a sprawling realm needs.
      score: hero.stats.administration + Math.min(GOVERNOR_NEED_CAP, ungovernedCount(state) * 2),
    });
  }

  // "Await a command" is both scored *and* guaranteed a slot.
  //
  // `queueRecruitment` only accepts an *unposted* hero. A realm that seats every champion it
  // draws therefore loses the ability to raise a host at all — the armies it has are the
  // armies it will ever have, and the next wave ends the run. So it is never allowed to fall
  // off the bottom of the list; when nobody else is spare it rises to the top instead.
  const reserve: AppointmentOption = {
    id: 'reserve',
    role: 'general',
    title: t('ascent.appoint.reserve'),
    effect: t('ascent.appoint.reserveFx'),
    detail: needsCommander(state, hero) ? t('ascent.appoint.reserveNeeded') : undefined,
  };
  const reserveScore = needsCommander(state, hero) ? RESERVE_URGENT_SCORE : RESERVE_IDLE_SCORE;

  const postings = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_APPOINTMENT_OPTIONS)
    .map((entry) => entry.option);

  // Urgent reserve leads; otherwise it closes the list — and after it, for anyone the realm may
  // let go, the one lever payroll ever had. Payroll was the largest gold drain in every measured
  // run and the roster only ever grew: a hero, once summoned, drew pay until the run ended.
  const ordered = reserveScore > (scored[0]?.score ?? 0) ? [reserve, ...postings] : [...postings, reserve];
  if (canDismissHero(state, hero)) {
    ordered.push({
      id: 'dismiss',
      role: 'dismiss',
      title: t('ascent.appoint.dismiss'),
      effect: t('ascent.appoint.dismissFx', { gold: hero.upkeepGold }),
      detail: t('ascent.appoint.dismissNote'),
    });
  }
  return ordered;
}

/** Whether the realm may let this hero go: not the king, not the founder, not one away on a mission. */
export function canDismissHero(state: GameState, hero: Hero): boolean {
  if (hero.id === 'king') return false;
  if (state.ascent?.founderHeroId === hero.id) return false;
  // Sắc phong công thần — a rank the throne granted is a rank it cannot quietly revoke. Also
  // closes the obvious exploit: ennoble for the stat lift, then dismiss to clear the payroll.
  if (ennobled(hero)) return false;
  const at = hero.assignedTo;
  if (at && (at.startsWith('ambassador:') || at.startsWith('diplomacy-'))) return false;
  if (at && state.recruitmentOrders.some((order) => order.id === at)) return false;
  return true;
}

/**
 * Lets a hero go. Their posting is vacated, they leave the roster and return to the deck — the
 * summon may find them again — and the court takes the small stability knock a dismissal costs.
 */
export function dismissHero(state: GameState, heroId: string): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero || !canDismissHero(state, hero)) return false;
  const wasGovernor = Boolean(hero.assignedTo && state.lands.some((land) => land.id === hero.assignedTo));
  releaseHeroAssignment(state, hero);
  if (wasGovernor) refreshAllLandOutputs(state);
  state.heroes = state.heroes.filter((candidate) => candidate.id !== heroId);
  if (!state.heroDeck.some((candidate) => candidate.id === heroId)) state.heroDeck.push(hero);
  state.court.stability = Math.max(0, state.court.stability - DISMISS_STABILITY_COST);
  if (state.ascent) {
    state.ascent.reservedHeroIds = state.ascent.reservedHeroIds.filter((id) => id !== heroId);
  }
  pushToast(state, t('ascent.appoint.dismissed', { hero: heroName(hero), gold: hero.upkeepGold }), 'info');
  return true;
}

/**
 * True when this hero is the realm's last chance to field an army at all.
 *
 * Deliberately "no hosts", not "fewer hosts than `targetArmyCount`". Being one host short of
 * target is an ambition, not an emergency, and treating it as one has a compounding cost:
 * `targetArmyCount` rises with province count, so once routine expansion started working the
 * realm sat permanently below target, `RESERVE_URGENT_SCORE` outranked every seat on every
 * appointment card, and a run staffed **zero** court positions — taking the court, its laws and
 * its parliament dark for the whole game. Losing the treasurer to keep a spare general is only
 * worth it when the alternative is no army whatsoever.
 */
function needsCommander(state: GameState, hero: Hero): boolean {
  const hosts = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy).length;
  if (hosts > 0) return false;
  return !state.heroes.some((candidate) => candidate.id !== hero.id && !candidate.assignedTo);
}

/** The owned province that would gain most from a governor: none posted, biggest output. */
function bestUngovernedLand(state: GameState): Land | undefined {
  return state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .filter((land) => !state.heroes.some((hero) => hero.assignedTo === land.id))
    .sort((a, b) => (b.outputs.gold + b.outputs.food + b.outputs.supplies) - (a.outputs.gold + a.outputs.food + a.outputs.supplies))[0];
}

function ungovernedCount(state: GameState): number {
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const governed = owned.filter((land) => state.heroes.some((hero) => hero.assignedTo === land.id)).length;
  return Math.max(0, owned.length - governed);
}

/** `requested`: asked for from the Court lane rather than raised by the director's clock. */
export function offerAppointment(state: GameState, heroId: string, requested = false): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) return false;
  const options = buildAppointmentOptions(state, hero);
  if (options.length === 0) return false;
  enqueueAscentPrompt(state, { kind: 'court-appointment', heroId, options }, { requested });
  return true;
}

/** Applies a posting through the existing court APIs. `reserve` releases whatever duty the hero holds. */
export function applyAppointment(state: GameState, heroId: string, optionId: string): boolean {
  const ascent = state.ascent;
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) return false;

  let ok = false;
  if (optionId === 'dismiss') {
    ok = dismissHero(state, heroId);
    return ok;
  }
  if (optionId === 'reserve') {
    // "Await a command" has to actually free the hero, or its own promise — "stays free to
    // raise a new host or ride as an envoy" — is a lie: a seated minister stayed seated, kept
    // counting toward court bonuses, and was still invisible to findFreeCommander. This was
    // also the mode's only way to vacate a court seat or an army command at all.
    const wasGovernor = Boolean(hero.assignedTo && state.lands.some((land) => land.id === hero.assignedTo));
    releaseHeroAssignment(state, hero);
    if (wasGovernor) refreshAllLandOutputs(state);
    if (ascent && !ascent.reservedHeroIds.includes(heroId)) {
      ascent.reservedHeroIds.push(heroId);
      ascent.reserveSeatMark = state.court.unlockedSeats.length;
    }
    ok = true;
  } else if (optionId.startsWith('court:')) {
    ok = assignHeroToPosition(state, heroId, optionId.slice('court:'.length) as CourtPositionId);
  } else if (optionId.startsWith('governor:')) {
    ok = assignHeroToLand(state, heroId, optionId.slice('governor:'.length));
  } else if (optionId.startsWith('general:')) {
    const army = state.armies.find((candidate) => candidate.id === optionId.slice('general:'.length));
    if (army && army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy) {
      // Out of the old posting first: a minister given a host used to keep the seat's name on
      // the map while `assignedTo` said "army", and the seat's bonuses with it.
      const wasGovernor = Boolean(hero.assignedTo && state.lands.some((land) => land.id === hero.assignedTo));
      releaseHeroAssignment(state, hero);
      if (wasGovernor) refreshAllLandOutputs(state);
      const previous = state.heroes.find((candidate) => candidate.id === army.generalHeroId);
      if (previous && previous.id !== hero.id) previous.assignedTo = undefined;
      army.generalHeroId = hero.id;
      hero.assignedTo = army.id;
      ok = true;
    }
  }

  if (ok && ascent && optionId !== 'reserve') {
    ascent.reservedHeroIds = ascent.reservedHeroIds.filter((id) => id !== heroId);
    ascent.laneStats.appointments += 1;
    ascent.laneState.lastDecisionTurn.court = state.turn;
  }
  return ok;
}

/**
 * An unposted hero who has somewhere worth going — the readiness gate for the prompt.
 *
 * Heroes the player deliberately held in reserve are skipped, or the card would re-open on
 * them every few seconds forever: "Await a command" leaves them unposted, which is exactly
 * the condition that made them eligible. They come back into consideration the moment the
 * realm's postings actually change — a new seat unlocks, or a host loses its commander.
 */
export function findHeroNeedingPosting(state: GameState): Hero | undefined {
  const ascent = state.ascent;
  if (!ascent) return undefined;

  const leaderless = state.armies.some((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.generalHeroId);
  if (leaderless || state.court.unlockedSeats.length > ascent.reserveSeatMark) {
    ascent.reservedHeroIds = [];
  }

  return state.heroes
    .filter((hero) => !hero.assignedTo && !ascent.reservedHeroIds.includes(hero.id))
    // A real posting on offer, not only the bench and the door.
    .find((hero) => buildAppointmentOptions(state, hero).some((option) => option.id !== 'reserve' && option.role !== 'dismiss'));
}

// ── Laws (edicts, wonders, and the tax dial) ────────────────────────────────

const MAX_LAW_OPTIONS = 4;

/**
 * The projects the throne may enact right now, the run's own achievements first.
 *
 * A play-earned edict (see `RealmProject.unlock`) leads the card whenever one is open: the
 * throne should offer the decree the realm just earned by surviving, conquering or seating
 * someone, not the same three most-expensive rows every time. Era-track projects follow,
 * newest era first. Capped because a scrollable law list is a menu, which is what this mode
 * is built to avoid.
 */
export function buildLawOptions(state: GameState): string[] {
  const eligible = REALM_PROJECTS
    // Chiếu and wonders only — the other three instruments are raised by the world, not chosen
    // from a list. See `isStandingLaw`.
    .filter((project) => isStandingLaw(project) && !projectBlockedReason(state, project));
  if (eligible.length === 0) return [];

  // ── A draw, not a sort ────────────────────────────────────────────────────
  //
  // This used to be a deterministic sort, and that single line was why run twenty offered the same
  // four rows as run one: the catalogue could grow to any size and the player would still only
  // ever see its top slice. Weighting and drawing without replacement is what turns a menu into a
  // deck — a run now sees ten to fourteen laws out of a pool near sixty-five, and *which* ten
  // depends on who was drawn, what was conquered and which stories ended.
  //
  // The weights are still opinionated, so this is not a shuffle: what the run has earned leads,
  // what a champion brought with them is close behind, and the estate a law would please pulls it
  // up when that estate is the one in trouble.
  const taught = state.mandate?.taughtDecrees ?? [];
  const weightOf = (project: (typeof REALM_PROJECTS)[number]): number => {
    let weight = 10 + eraIndex(project.era) * 4;
    // Earned by play, and by a named champion, lead — the run should be offered the decree it
    // just produced rather than the same three most expensive rows every time.
    if (project.unlock?.kind === 'hero') weight += 55;
    else if (project.unlock) weight += 35;
    if (taught.includes(project.id)) weight += 45;
    // A law that would please whichever estate is worst off is worth putting in front of a player
    // who probably needs it. Read off the actual standing, so the deck answers the realm's state.
    for (const [estate, delta] of Object.entries(project.estates)) {
      if ((delta ?? 0) <= 0) continue;
      const standing = estateStanding(state, estate as EstateId);
      if (standing < 45) weight += (45 - standing) * 0.8;
    }
    // A realm already past its authority should be shown cheap laws, not another three-weight one.
    if (overreach(state) > 0) weight += (4 - project.weight) * 6;
    return Math.max(1, weight);
  };

  const pool = [...eligible];
  const drawn: string[] = [];
  while (drawn.length < MAX_LAW_OPTIONS && pool.length > 0) {
    const weights = pool.map(weightOf);
    const index = weightedPickIndex(weights);
    const picked = pool.splice(index < 0 ? 0 : index, 1)[0];
    drawn.push(picked.id);
  }
  return drawn;
}

/**
 * Toasts each edict the run's play has just brought into reach — once, when it happens.
 *
 * This is the loop's feedback beat: without it, an edict unlocked by the fourth survived wave
 * sits silently in a prompt the player may not open for a year, and the growth the system is
 * built around goes unnoticed.
 */
export function tickEdictDiscovery(state: GameState): void {
  const ascent = state.ascent;
  const mandate = state.mandate;
  if (!ascent || !mandate) return;
  ascent.knownEdictIds ??= [];
  for (const project of REALM_PROJECTS) {
    if (!project.unlock || ascent.knownEdictIds.includes(project.id)) continue;
    if (mandate.edicts.includes(project.id)) {
      ascent.knownEdictIds.push(project.id);
      continue;
    }
    if (!isUnlockMet(state, project.unlock)) continue;
    if (eraIndex(mandate.era) < eraIndex(project.era)) continue;
    ascent.knownEdictIds.push(project.id);
    pushToast(state, t('ascent.law.newEdict', { title: projectTitle(project) }), 'milestone');
  }
}

/** `requested`: asked for from the Court lane rather than raised by the director's clock. */
export function offerLawChoice(state: GameState, requested = false): boolean {
  const projectIds = buildLawOptions(state);
  if (projectIds.length === 0) return false;
  enqueueAscentPrompt(state, {
    kind: 'law-choice',
    projectIds,
    points: state.mandate?.edictPoints ?? 0,
    // Tax left this prompt: a standing policy offered as an event card could only be set when
    // the card happened to come up. It is now the dial on the court screen (see TaxSystem).
    taxOptions: [],
  }, { requested });
  return true;
}

/** `edict:<id>` enacts a project · `tax:<policy>` moves the dial · `hold` banks the point. */
export function resolveLawChoice(state: GameState, choiceId: string): boolean {
  const ascent = state.ascent;

  if (choiceId === 'hold') return true;

  if (choiceId.startsWith('tax:')) {
    const policy = choiceId.slice('tax:'.length) as TaxPolicy;
    if (!['lenient', 'balanced', 'harsh'].includes(policy)) return false;
    state.taxPolicy = policy;
    // Keep the dial in step: a stance card from a prompt queued before the slider existed
    // must not leave `taxRate` pointing somewhere else.
    state.taxRate = policy === 'lenient' ? 0.2 : policy === 'harsh' ? 0.8 : 0.5;
    pushToast(state, t('ascent.law.taxSet', { policy: t(`ascent.tax.${policy}` as Parameters<typeof t>[0]) }), 'milestone');
    if (ascent) ascent.laneState.lastDecisionTurn.court = state.turn;
    return true;
  }

  const id = choiceId.startsWith('edict:') ? choiceId.slice('edict:'.length) : choiceId;
  if (!getProject(id) || !enactProject(state, id)) return false;
  if (ascent) {
    ascent.laneStats.edictsEnacted += 1;
    ascent.laneState.lastDecisionTurn.court = state.turn;
  }
  return true;
}

/** Card-ready copy for one project: its name and its effect in hard numbers. */
export function lawCardView(state: GameState, projectId: string): { title: string; effect: string; cost: string; locks?: string } | undefined {
  const project = getProject(projectId);
  if (!project) return undefined;

  // Naming the sibling an enactment kills is the point of an exclusive group: the player must
  // see that this is a fork in the run, not just a bonus.
  const sibling = project.exclusiveGroup
    ? REALM_PROJECTS.find((other) => other.id !== project.id && other.exclusiveGroup === project.exclusiveGroup)
    : undefined;

  return {
    title: projectTitle(project),
    effect: projectEffectSummary(project),
    cost: project.kind === 'wonder'
      ? t('ascent.law.wonderCost')
      : t('ascent.law.pointCost', { n: project.edictCost ?? 0 }),
    locks: sibling ? t('ascent.law.locks', { title: projectTitle(sibling) }) : undefined,
  };
}

// ── Parliament (the court card deck) ────────────────────────────────────────

/**
 * Counts the court's cooldown down. The formula is lifted from `progressPoliticsCooldown` so a
 * seated Chancellor makes the court speak more often here too — which is the reason to seat one.
 */
export function progressAscentCourtCooldown(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.courtCardCooldown = Math.max(0, ascent.courtCardCooldown - 1);
}

export function resetAscentCourtCooldown(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  const bonuses = getCourtBonuses(state);
  ascent.courtCardCooldown = Math.max(2, Math.round(7 / Math.max(0.2, bonuses.cardFrequencyMult)));
}

/** Cards not yet drawn this run. Refills once the deck is spent, so a long run never runs dry. */
function availableCourtCards(state: GameState): PoliticsCard[] {
  const ascent = state.ascent;
  if (!ascent) return [];
  const fresh = state.politicsDeck.filter((card) => !ascent.drawnCourtCards.includes(card.id));
  if (fresh.length > 0) return fresh;
  ascent.drawnCourtCards = [];
  return [...state.politicsDeck];
}

/**
 * Picks the next court card with the classic weighting — crises surge when the realm is
 * unstable, seasonal cards favour their season, and a seated hero's bias pulls their own
 * subject matter to the top — but draws without replacement so a run keeps showing new cards.
 */
export function drawAscentCourtCard(state: GameState): PoliticsCard | undefined {
  const pool = availableCourtCards(state);
  if (pool.length === 0) return undefined;

  const weights = pool.map((card) => {
    let weight = 1;
    if (card.type === 'crisis' && state.court.stability < 35) weight *= 2.5;
    if (card.seasons?.includes(state.season)) weight *= 2.25;
    for (const heroId of Object.values(state.court.seats)) {
      const hero = state.heroes.find((candidate) => candidate.id === heroId);
      if (hero?.cardBias === card.type) weight *= 1.5;
    }
    return weight;
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  let index = 0;
  for (; index < weights.length - 1; index += 1) {
    roll -= weights[index];
    if (roll <= 0) break;
  }
  return pool[index];
}

export function offerParliament(state: GameState): boolean {
  const ascent = state.ascent;
  const card = drawAscentCourtCard(state);
  if (!ascent || !card) return false;
  ascent.drawnCourtCards.push(card.id);
  enqueueAscentPrompt(state, { kind: 'parliament', cardId: card.id });
  return true;
}

export function findCourtCard(state: GameState, cardId: string): PoliticsCard | undefined {
  return state.politicsDeck.find((card) => card.id === cardId);
}

/**
 * Answers the court through the classic `choosePoliticsCard` → `applyCourtEffect` pipeline.
 *
 * That function clears `isPaused` on its way out; `drainAscentPrompts` runs immediately after
 * and re-pauses if another prompt is queued, so chaining still holds.
 */
export function resolveParliament(state: GameState, cardId: string, choiceId: string): boolean {
  const ascent = state.ascent;
  const card = findCourtCard(state, cardId);
  if (!card) return false;

  // Declining is always legal. Without it a card whose *both* choices cost more than the
  // treasury holds would corner the player on a modal with no move — the one thing a
  // pausing prompt must never do.
  if (choiceId === 'decline') {
    pushToast(state, t('ascent.parliament.declined', { title: politicsTitle(card) }), 'info');
    resetAscentCourtCooldown(state);
    if (ascent) ascent.laneState.lastDecisionTurn.court = state.turn;
    return true;
  }

  state.activePoliticsCard = card;
  const ok = choosePoliticsCard(state, choiceId);
  if (!ok) {
    // Unaffordable choice: leave the card open so the player picks the other one, or declines.
    state.activePoliticsCard = undefined;
    return false;
  }

  resetAscentCourtCooldown(state);
  if (ascent) {
    ascent.laneStats.parliamentAnswered += 1;
    ascent.laneState.lastDecisionTurn.court = state.turn;
  }
  return true;
}

/**
 * The bonus a seated hero contributes, summarised for the Court lane roster. Reuses the same
 * effect table the appointment card prints from, so the two can never disagree.
 */
export function seatedEffectSummary(state: GameState, seat: CourtPositionId): string | undefined {
  const heroId = state.court.seats[seat];
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero) return undefined;
  return formatCourtPositionEffect(seat, hero.stats);
}

/** Re-exported so callers do not need a second import just to read a seat's raw delta. */
export { COURT_POSITION_EFFECTS, applyCourtEffect };
