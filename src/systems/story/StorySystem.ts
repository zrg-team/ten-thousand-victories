import { BOSS_EVERY_N_WAVES, MUSTER_TICKS, WAVE_INTERVAL_TICKS } from '../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { applyResourceDelta, canSpend } from '../ResourceSystem';
import { scaledCost } from '../ascent/priceScale';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from '../ascent/AscentState';
import { storyTemplate, storyTemplates } from '../../data/stories';
import { storyText } from '../../i18n/story';
import { dropCharges } from './charges';
import { describeViolations, storyViolations } from './invariants';
import { findEcho, recordEcho } from './echoes';
import { unlockStory } from '../../state/codex';
import type {
  ActiveStory,
  ChronicleEntry,
  GameState,
  Hero,
  Historicity,
  Kingdom,
  Land,
  ResourceBag,
  StoryCast,
  StoryOpening,
  StoryVolume,
  StoryWatch,
} from '../../state/types';
import type { StoryCtx, StoryFragment, StoryOption, StoryOutcome, StoryTemplate, StoryWorldDelta } from './types';

/**
 * The Chronicle.
 *
 * A story is not a chain of beats with a counter. It is a pool of fragments, a bag of numbers
 * recording what has happened, and a rule for choosing: when something happens in the world the
 * story wakes, scores every fragment against the state and its own memory, and speaks whichever
 * one fits — drawing at random among the best few so the same situation does not always produce
 * the same line. Then it writes to memory and goes quiet.
 *
 * That is salience-based narrative rather than branching narrative, and the reason it matters is
 * that a branching tree is a map a player learns, while a pool is a personality they only ever
 * get to know. Nothing here counts progress, because there is no length to be a fraction of.
 *
 * Ascent only. Every entry point returns immediately in the other modes, which is what keeps
 * `verify-modes-regression` byte-identical.
 */

/**
 * Stories running at once.
 *
 * Five rather than four: with a catalogue this size, four concurrent slots and one seed attempt
 * every few seasons meant a run only ever met a third of it. The ceiling is on *pausing* volume,
 * which the prompt budget already holds independently — most of what these five say is whispers,
 * which cost nothing.
 */
/**
 * Raised from five. The catalogue is 29 templates and roughly 270 fragments, and a measured run
 * met about five of them — **17% of the writing, seen once.** The ceiling that matters is on
 * *pausing* volume, and the prompt budget below holds that independently; most of what these
 * stories say is whispers, which cost nothing and are the thing that makes a realm feel inhabited.
 */
const MAX_ACTIVE_STORIES = 8;

/**
 * Seasons between seeding attempts. Stories arrive quietly and rarely.
 *
 * Shortened from 6 for the same reason: with five slots and a six-season cadence a run simply ran
 * out of time to meet its own catalogue. Note the other half of the fix is not here at all — a
 * longer run meets more stories for free, so levers 01 and 02 raise this exposure without touching
 * a constant.
 */
const SEED_INTERVAL = 4;

/** A story says nothing for at least this many seasons after speaking. */
const MIN_QUIET = 3;

/**
 * Whispers per tick, across all stories.
 *
 * Was 1, on the grounds that two ambient lines at once reads as noise — true of two lines about
 * the *same* place, and the reason the second one is gated on a different province below.
 * Measured at 1, a run heard twenty story lines in twenty minutes and the back two-thirds of it
 * heard from the Chronicle only when the Chronicle stopped the game.
 */
const WHISPERS_PER_TICK = 2;

/**
 * Ticks a story may find nothing to say before it gives its slot back.
 *
 * Long enough that a story merely observing a `quiet` period, or waiting on a card the director
 * has not raised, is never evicted — those cases are excluded explicitly as well.
 */
const DRY_TICKS_BEFORE_RETIRE = 12;

/**
 * Ticks a story may hold a card the director has not raised before it lets go of it.
 *
 * Only one story-beat may be queued at a time and the budget allows roughly `turn × 0.0375` of
 * them in a whole run — eleven in a 300-tick run, measured. So a story that picks a card and waits
 * for a slot can wait for the rest of the run: fifteen stories queued one and seven were still
 * holding it at the end, mute, because a story holding a card may only whisper.
 *
 * Letting the card go is better than keeping it. The story stays alive, can speak again, and can
 * re-pick the same fragment later — and `firstWaiting` sorts by temperature, so the one that has
 * been waiting hardest is the one heard next.
 */
const STALE_WAITING_TICKS = 20;

/**
 * Ticks a story is turned back to its ambient pool after letting a stale card go.
 *
 * Deliberately two seasons longer than `DRY_TICKS_BEFORE_RETIRE`, which makes this the test that
 * decides whether a story deserves its slot: one with something ambient to say whispers during the
 * rest, clears `dryTicks`, and keeps the slot; one whose only content was a card the director
 * could not afford runs dry through the whole window and retires, freeing the slot for a story
 * that can speak. Measured before this existed: seven of eight live stories ended a run holding a
 * card, six of them having never said a single line.
 */
const CARD_REST_TICKS = DRY_TICKS_BEFORE_RETIRE + 2;

/** Temperature bleeds off on its own, so a story that is ignored cools rather than detonating. */
const COOL_PER_TICK = 0.06;

/** Treasury above this is "somebody has started counting". */
const HOARD_GOLD = 700;

/** Seasons an offer stands before it quietly stops being available. Never counted down on screen. */
const OFFER_SEASONS = 26;

let storySeq = 0;

// ── World delta ─────────────────────────────────────────────────────────────

function snapshot(state: GameState): StoryWatch {
  return {
    lands: state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length,
    heroes: state.heroes.length,
    gold: Math.round(state.resources.gold),
    food: Math.round(state.resources.food),
    battlesWon: state.campaignScore?.armiesDefeated ?? 0,
    wavesSurvived: state.ascent?.wavesSurvived ?? 0,
    courtSeatsFilled: Object.values(state.court.seats).filter(Boolean).length,
    captives: state.heroes.filter((hero) => hero.traits?.includes('Captive')).length,
  };
}

/**
 * Ticks until the next Great Invasion, counting the ordinary waves in between.
 *
 * `bossTelegraphed` is a two-tick warning and is the right trigger for a hịch — a document the
 * throne issues, which is worthless a season later. It is the wrong trigger for anything that has
 * to be *built*: two ticks is not enough to feed a giant three times. A wager needs a horizon, so
 * it gets one.
 */
function ticksToBoss(state: GameState): number {
  const ascent = state.ascent;
  if (!ascent) return Number.POSITIVE_INFINITY;
  const cyclesLeft = (BOSS_EVERY_N_WAVES - 1 - (ascent.wave % BOSS_EVERY_N_WAVES)
    + BOSS_EVERY_N_WAVES) % BOSS_EVERY_N_WAVES;
  return ascent.ticksToWave + cyclesLeft * WAVE_INTERVAL_TICKS;
}

function worldDelta(state: GameState, before: StoryWatch): StoryWorldDelta {
  const now = snapshot(state);
  const foodRate = state.resourceRates.food;
  const ascent = state.ascent;
  return {
    lostLand: now.lands < before.lands,
    gainedLand: now.lands > before.lands,
    lostHero: now.heroes < before.heroes,
    gainedHero: now.heroes > before.heroes,
    wonBattle: now.battlesWon > before.battlesWon,
    waveBroken: now.wavesSurvived > before.wavesSurvived,
    starving: foodRate < 0 && state.resources.food / Math.max(1, -foodRate) <= 4,
    hoarding: now.gold >= HOARD_GOLD,
    seatEmptied: now.courtSeatsFilled < before.courtSeatsFilled,

    // The war. Before these the pool could only ever score against `waveBroken` — a story could
    // react to a fight being over and to nothing else that mattered.
    ticksToBoss: ticksToBoss(state),
    bossTelegraphed: Boolean(ascent?.bossTelegraphed),
    waveIncoming: (ascent?.ticksToWave ?? Number.POSITIVE_INFINITY) <= MUSTER_TICKS,
    battleOpen: Boolean(ascent?.activeBattle && !ascent.activeBattle.over),
    capitalThreatened: (ascent?.capitalLostTicks ?? 0) > 0,
    heroCaptured: (now.captives ?? 0) > (before.captives ?? 0),
  };
}

// ── The trunk ───────────────────────────────────────────────────────────────

/**
 * The node a story is standing in.
 *
 * Also the entire save migration: a story written before nodes existed has no `node`, and
 * resolving it to the template's entry here means there is no upgrade step to write, forget, or
 * get wrong. A template with no `nodes` at all returns `''`, which no fragment's `in` can match —
 * so `candidates` waves everything through and the flat pool behaves exactly as before.
 */
function nodeOf(story: ActiveStory, template: StoryTemplate): string {
  return story.node ?? template.entry ?? template.nodes?.[0]?.id ?? '';
}

/** Less historical is a one-way trip. Used to keep `drift` a high-water mark. */
const DRIFT_RANK: Record<Historicity, number> = { 'chinh-su': 0, 'da-su': 1, 'ngoai-truyen': 2 };

/**
 * Moves a story to another node, and books what that means.
 *
 * `drift` is deliberately *not* the node's own class: a divergent branch may rejoin the record at
 * a `chinh-su` node — a confluence — and the tag still has to say the realm went the long way
 * round. You can return to what happened; you cannot make it true that you never left.
 */
function enterNode(state: GameState, story: ActiveStory, template: StoryTemplate, nodeId: string): void {
  const node = template.nodes?.find((candidate) => candidate.id === nodeId);
  // An unknown id means an authoring typo that INV-8 should have caught. Stay put rather than
  // strand the story in a node that does not exist.
  if (!node) return;
  const path = story.path ?? [];
  const reentered = path[path.length - 1] === nodeId;
  story.node = nodeId;
  // A repeatable door names its own node in `to` — that is what makes it repeatable — so
  // re-entering must not lay the same step down again. Four gifts to the same banner read as
  // four separate turns in the road on the story page, which is exactly what the spine is not.
  story.path = reentered ? path : [...path, nodeId];
  // The clock only restarts when the story has actually moved. Re-entering the node you are
  // standing in should not buy another patience window.
  if (!reentered) story.nodeSince = state.turn;
  if (DRIFT_RANK[node.historicity] > DRIFT_RANK[story.drift ?? 'chinh-su']) {
    story.drift = node.historicity;
  }
  // A story that has just turned a corner has something to say about it. Standing still is not
  // turning a corner.
  if (!reentered) story.temperature += 2;
}

// ── Context ─────────────────────────────────────────────────────────────────

function makeCtx(state: GameState, story: ActiveStory, world: StoryWorldDelta): StoryCtx {
  const template = storyTemplate(story.templateId);
  // What this beat did, collected as it happens. De-duplicated by (kind, name) so a verb called
  // twice reads as one larger number rather than two lines saying half of it each.
  const noted: StoryOutcome[] = [];
  // Named rather than returned inline: `leaveEcho` has to read `ctx.speaking` back out at call
  // time, and it is only set once the engine knows which fragment is talking.
  const ctx: StoryCtx = {
    state,
    story,
    world,
    quietFor: state.turn - story.lastSpokeTurn,
    age: state.turn - story.seededTurn,
    hero: () => state.heroes.find((candidate) => candidate.id === story.cast.heroId),
    otherHero: () => state.heroes.find((candidate) => candidate.id === story.cast.otherHeroId),
    land: () => state.lands.find((candidate) => candidate.id === story.cast.landId),
    rival: () => state.kingdoms.find((candidate) => candidate.id === story.cast.kingdomId),
    recall: (key) => story.memory[key] ?? 0,
    remember: (key, value) => { story.memory[key] = value; },
    bump: (key, by = 1) => {
      story.memory[key] = (story.memory[key] ?? 0) + by;
      return story.memory[key];
    },
    said: (fragmentId) => story.spoken.includes(fragmentId),
    heat: (by) => { story.temperature = Math.max(0, story.temperature + by); },
    sharing: () => (state.stories ?? []).filter((other) => other.id !== story.id && sharesSubject(other, story)).length,
    echoOf: (templateId, fragmentId) => findEcho(templateId, fragmentId)?.name,
    // `ctx.speaking` first, and the fallback only for a caller that never set it. Reading
    // `spoken[last]` alone was wrong everywhere it mattered: inside a fragment's own `effect` the
    // id has already been pushed and it happens to be right, but an option's `apply` runs before
    // `fire`, so every echo left from an *answer* was filed under the previous beat and `echoOf`
    // could never match it. That is the whole cross-run promise, and it had never worked.
    leaveEcho: (name) => recordEcho(story.templateId, ctx.speaking ?? story.spoken[story.spoken.length - 1] ?? '', name),
    note: (kind, amount, name) => {
      const hit = noted.find((entry) => entry.kind === kind && entry.name === name);
      if (hit && amount !== undefined) hit.amount = (hit.amount ?? 0) + amount;
      else if (!hit) noted.push({ kind, amount, name });
    },
    noted,
    node: () => (template ? nodeOf(story, template) : ''),
    goTo: (nodeId) => { if (template) enterNode(state, story, template, nodeId); },
    drift: () => story.drift ?? 'chinh-su',
  };
  return ctx;
}

/** True when two stories have taken an interest in the same person, place or court. */
function sharesSubject(a: ActiveStory, b: ActiveStory): boolean {
  return Boolean(
    (a.cast.heroId && (a.cast.heroId === b.cast.heroId || a.cast.heroId === b.cast.otherHeroId))
    || (a.cast.landId && a.cast.landId === b.cast.landId)
    || (a.cast.kingdomId && a.cast.kingdomId === b.cast.kingdomId),
  );
}

/**
 * Provinces the realm must hold before two stories sharing one are made to take turns.
 *
 * A story binds its province at seed and keeps it for the whole run, and Dragon Ascent's realm is
 * one to three provinces wide for most of a run — so the province is not a *choice* the seeder
 * made, it is the only address available. Measured across three runs, six of twelve stories bound
 * the same district, and the turn-taking rule below then silenced them for the rest of the run:
 * **49.9% of all story-ticks were blocked, 89.4% of them on a shared province.**
 *
 * Below this floor the rule is suppressing a coincidence rather than a collision, so it stands
 * down. A person is different — two stories about the same man in one season really does read as
 * the world double-narrating, so hero and court contention are enforced at every realm size.
 */
const CONTENTION_MIN_LANDS = 5;

/**
 * True when `b` must wait because `a` has already spoken about their shared subject this season.
 *
 * Deliberately narrower than `sharesSubject`, which answers a different question — "is this hero
 * spoken for by two stories at once" — and is what `ctx.sharing()` still reads.
 */
function contendsForSubject(a: ActiveStory, b: ActiveStory, landsOwned: number): boolean {
  if (a.cast.heroId && (a.cast.heroId === b.cast.heroId || a.cast.heroId === b.cast.otherHeroId)) return true;
  if (a.cast.kingdomId && a.cast.kingdomId === b.cast.kingdomId) return true;
  if (landsOwned < CONTENTION_MIN_LANDS) return false;
  return Boolean(a.cast.landId && a.cast.landId === b.cast.landId);
}

/** Interpolation available to every fragment of a story, without the fragment asking. */
export function storyParams(state: GameState, story: ActiveStory): Record<string, string | number> {
  const hero = state.heroes.find((candidate) => candidate.id === story.cast.heroId);
  const other = state.heroes.find((candidate) => candidate.id === story.cast.otherHeroId);
  const land = state.lands.find((candidate) => candidate.id === story.cast.landId);
  const rival = state.kingdoms.find((candidate) => candidate.id === story.cast.kingdomId);
  // Falling back to the frozen name rather than to '' — a general the world took away must still
  // have a name in the record, or the story page renders "  was taken." See `ActiveStory.names`.
  const frozen = story.names ?? {};
  return {
    hero: hero?.name ?? frozen.hero ?? '',
    other: other?.name ?? frozen.other ?? '',
    land: land?.name ?? frozen.land ?? '',
    rival: rival?.name ?? frozen.rival ?? '',
    // Echo: the season a thing happened, so a fragment can quote it back by name and date.
    season: story.memory.echoTurn ?? 0,
    year: Math.max(1, Math.round((story.memory.echoTurn ?? state.turn) / 4)),
  };
}

// ── Seeding ─────────────────────────────────────────────────────────────────

function activeFor(state: GameState, templateId: string): boolean {
  return (state.stories ?? []).some((story) => story.templateId === templateId);
}

/**
 * Considers starting one story. Nothing is announced — a story seeds latent, marks its cast,
 * and begins watching. The player cannot count how many are running.
 */
function trySeed(state: GameState): void {
  const stories = state.stories ?? [];
  if (stories.length >= MAX_ACTIVE_STORIES) return;

  const eligible: StoryTemplate[] = [];
  for (const template of storyTemplates) {
    if (state.turn < (template.minTurn ?? 0)) continue;
    if (!template.allowMultiple && activeFor(state, template.id)) continue;
    if (!template.allowMultiple && (state.storiesEnded ?? []).includes(template.id)) continue;
    eligible.push(template);
  }
  if (eligible.length === 0) return;

  /**
   * A template the run has not touched yet is favoured heavily over one it has.
   *
   * Without this the catalogue is a lottery re-rolled every seed tick, and a run samples the same
   * handful of favourites: measured across three runs with nineteen templates, two of them —
   * including the one that only exists when the player has been *efficient* — never seeded once.
   * A large catalogue is only large if a run actually walks around it.
   */
  const seen = new Set([
    ...(state.storiesEnded ?? []),
    ...stories.map((story) => story.templateId),
  ]);
  const weightOf = (template: StoryTemplate) =>
    template.seedWeight * (seen.has(template.id) ? 1 : 3.5);

  const total = eligible.reduce((sum, template) => sum + weightOf(template), 0);
  let roll = Math.random() * total;
  let chosen = eligible[eligible.length - 1];
  for (const template of eligible) {
    roll -= weightOf(template);
    if (roll <= 0) { chosen = template; break; }
  }

  const cast = chosen.seed(state);
  if (!cast) return;

  storySeq += 1;
  stories.push({
    id: `story-${state.turn}-${storySeq}`,
    templateId: chosen.id,
    cast,
    memory: {},
    temperature: 0,
    seededTurn: state.turn,
    // Counts as having "spoken" at seed so it observes the quiet period before its first line.
    lastSpokeTurn: state.turn,
    spoken: [],
    // The names, frozen now, while everyone the story has bound is still alive to have one.
    names: castNames(state, cast),
    // Absent `node` would resolve through `nodeOf` anyway; setting it makes the path start
    // complete, so the story page's spine has a first vertebra to draw.
    node: chosen.entry ?? chosen.nodes?.[0]?.id,
    path: chosen.nodes?.length ? [chosen.entry ?? chosen.nodes[0].id] : undefined,
    nodeSince: state.turn,
  });
  state.stories = stories;
}

/** The cast's names at bind time. See `ActiveStory.names` for why this is worth storing. */
function castNames(state: GameState, cast: StoryCast): ActiveStory['names'] {
  return {
    hero: state.heroes.find((candidate) => candidate.id === cast.heroId)?.name,
    other: state.heroes.find((candidate) => candidate.id === cast.otherHeroId)?.name,
    land: state.lands.find((candidate) => candidate.id === cast.landId)?.name,
    rival: state.kingdoms.find((candidate) => candidate.id === cast.kingdomId)?.name,
  };
}

// ── Choosing what to say ────────────────────────────────────────────────────

/** Default ceiling on a repeatable fragment. Three of anything is already a lot to hear. */
const DEFAULT_MAX_TIMES = 3;

/**
 * How often an ambient whisper may be heard, without the author having to say so.
 *
 * Expressed here rather than by marking two hundred fragments `repeatable`, for the same reason
 * `VOLUME_BIAS` is: the authored fields express *fit*, and this file expresses *pacing*. A story's
 * ambient lines are the first thing it runs out of, and a story that has run out of them goes
 * silent for the rest of the run or speaks only when it stops the game — measured, the back
 * two-thirds of a run heard from the Chronicle almost exclusively through interruptions.
 *
 * Only atmosphere qualifies: no ending, no offer on the table, nothing that asks. Those are events
 * and happen once. And the score already divides by `1 + timesSaid`, so a second telling is worth
 * half and fades out rather than nagging.
 */
const AMBIENT_MAX_TIMES = 2;

/**
 * How many times this fragment may be heard in one story, authored or inferred.
 *
 * Exported so `verify-chronicle` can assert against the rule the engine actually applies rather
 * than a copy of it — the copy is how a harness comes to pass while testing something else.
 */
export function maxTimesFor(fragment: StoryFragment): number {
  if (fragment.repeatable) return fragment.maxTimes ?? DEFAULT_MAX_TIMES;
  // Narrow on purpose. The first cut treated any plain whisper as atmosphere and a story page
  // came back reading "Le Quy Don was taken." at season 24 and again at season 27 - which is
  // not weather, it is an event happening twice.
  //
  // A plot beat shows itself two ways: it changes the world, or it pushes the story on. Those
  // happen once. A `when` gate is neither - it usually means no more than "this line is true
  // in this situation", and a situation can come round again.
  const ambient = fragment.volume === 'whisper'
    && !fragment.terminal
    && !fragment.opening
    && !fragment.options?.length
    && !fragment.effect
    && !fragment.heat;
  return ambient ? AMBIENT_MAX_TIMES : 1;
}

function timesSaid(ctx: StoryCtx, fragmentId: string): number {
  return ctx.story.spoken.filter((id) => id === fragmentId).length;
}

function candidates(template: StoryTemplate, ctx: StoryCtx, whispersOnly: boolean): StoryFragment[] {
  return template.fragments.filter((fragment) => {
    if (whispersOnly && (fragment.volume !== 'whisper' || fragment.opening)) return false;
    if (timesSaid(ctx, fragment.id) >= maxTimesFor(fragment)) return false;
    // Already on the table; picking it again would replace the offer with itself.
    if (ctx.story.offer === fragment.id) return false;
    // The trunk, and the whole cost of it inside the draw. A fragment with no `in` is ambient and
    // speaks wherever the story is standing.
    if (fragment.in && !fragment.in.includes(nodeOf(ctx.story, template))) return false;
    if (fragment.quiet !== undefined && ctx.quietFor < fragment.quiet) return false;
    if (fragment.when && !fragment.when(ctx)) return false;
    return true;
  });
}

/**
 * Scores every candidate, then draws at random among the strongest.
 *
 * The draw is what stops the same state always producing the same line, and the band it draws
 * from is deliberately narrow: widening it makes a story say things that do not fit the moment,
 * which is exactly the "random flavour text" reading this design has to avoid.
 */
/**
 * How strongly each volume is favoured in the draw, so the authored weights express *fit* and
 * this expresses *pacing*.
 *
 * Measured without it: only 49% of fragments were whispers against a design target of ~70%. The
 * cause is structural rather than authorial — a story that picks a card goes quiet until the
 * decision director gets round to raising it, so every card it picks costs it several seasons of
 * whispers it would otherwise have spoken. Weighting the draw restores the intended mix without
 * touching a single fragment's own weight.
 */
const VOLUME_BIAS: Record<StoryVolume, number> = {
  whisper: 2.1,
  card: 1,
  // Blows already gate hard on temperature and on two whispers having run first; they do not
  // need suppressing here as well.
  blow: 1,
};

function pickFragment(template: StoryTemplate, ctx: StoryCtx, whispersOnly = false): StoryFragment | undefined {
  const scored = candidates(template, ctx, whispersOnly).map((fragment) => ({
    fragment,
    // Each retelling is worth less than the last, so a repeatable line fades out rather than
    // stopping abruptly at its ceiling.
    score: ((fragment.weight ?? 1) + (fragment.salience?.(ctx) ?? 0))
      * VOLUME_BIAS[fragment.volume]
      / (1 + timesSaid(ctx, fragment.id)),
  })).filter((entry) => entry.score > 0);
  if (scored.length === 0) return undefined;

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  const band = scored.filter((entry) => entry.score >= best * 0.6).slice(0, 4);
  return band[Math.floor(Math.random() * band.length)].fragment;
}

// ── Speaking ────────────────────────────────────────────────────────────────

function record(state: GameState, story: ActiveStory, fragment: StoryFragment, ctx: StoryCtx): void {
  const chronicle = state.chronicle ?? [];
  storySeq += 1;
  const entry: ChronicleEntry = {
    id: `chron-${state.turn}-${storySeq}`,
    templateId: story.templateId,
    fragmentId: fragment.id,
    turn: state.turn,
    params: storyParams(state, story),
    tone: fragment.tone ?? 'info',
    // From the path's high-water mark, not from the terminal's own node: an ending reached the
    // long way round is still an ending reached the long way round.
    //
    // **Only for a template that has actually been classified.** Defaulting an untrunked story to
    // `chinh-su` made forty-five templates that nobody has placed against the record claim to be
    // in the annals — measured, every ending in six runs came back chính sử, most of them from
    // stories carrying no source class at all. An absent tag is honest; a wrong one is not.
    //
    // A flat template says so for itself with `record`, one authored word. Before that existed,
    // forty-five of forty-eight templates wrote `undefined` here, `chronicleTally` skipped them
    // all, and the Reckoning gated its whole story row on a count that was almost always zero —
    // so a run that concluded five stories closed without mentioning one of them.
    historicity: storyTemplate(story.templateId)?.nodes?.length
      ? (story.drift ?? 'chinh-su')
      : storyTemplate(story.templateId)?.record,
    // What the ending did. Held here as well as on `story.history` because the `ActiveStory` is
    // deleted the moment a terminal fires, and the record has to outlive it.
    outcome: ctx.noted.length ? [...ctx.noted] : undefined,
    // The whole telling, so the ending can be read back as the story it was.
    //
    // `story.history` is deleted with the story a few lines after this fires, and it was the only
    // record of the order things happened in — which is why Sử ký's recorded tab could only ever
    // be a list of last lines. Copied rather than referenced, and the terminal is appended here
    // because `fire` records it after `record` runs.
    // Who it was about, so the record can draw them. `cast` dies with the story a few lines below.
    heroId: story.cast.heroId,
    history: story.history?.length
      ? [...story.history, { fragmentId: fragment.id, turn: state.turn, outcome: ctx.noted.length ? [...ctx.noted] : undefined }]
      : undefined,
  };
  chronicle.push(entry);
  if (chronicle.length > 60) chronicle.splice(0, chronicle.length - 60);
  state.chronicle = chronicle;
}

/** Applies a fragment's own effect and books the consequences of having spoken. */
function fire(state: GameState, story: ActiveStory, fragment: StoryFragment, ctx: StoryCtx): void {
  // The first time a story actually says something to this player it goes on the shelf. Recorded
  // on speech rather than on seeding, because a story that seeded latent and never spoke is one
  // the player has not met.
  if (story.spoken.length === 0) unlockStory(story.templateId);
  // Pushed before the effect runs, so `ctx.said(ownId)` inside that effect still reads true —
  // several fragments rely on it. `ctx.speaking` is the separate, honest answer to "which beat
  // is talking", and is what `leaveEcho` keys off.
  story.spoken.push(fragment.id);
  ctx.speaking ??= fragment.id;
  story.lastSpokeTurn = state.turn;
  if (fragment.heat) ctx.heat(fragment.heat);
  fragment.effect?.(ctx);
  // The dated record the story page reads back. `spoken` answers "has this been said";
  // history answers "what happened, and when" — which is the difference between a flag check
  // and a story. Booked *after* the effect so it can carry what the beat actually did, not
  // merely that it happened.
  story.history = [...(story.history ?? []), {
    fragmentId: fragment.id,
    turn: state.turn,
    outcome: ctx.noted.length ? [...ctx.noted] : undefined,
  }];

  if (fragment.terminal) {
    record(state, story, fragment, ctx);
    state.stories = (state.stories ?? []).filter((candidate) => candidate.id !== story.id);
    state.storiesEnded = [...(state.storiesEnded ?? []), story.templateId];
    // An oath outlives its story otherwise: `tickStoryCharges` only drops a charge whose story has
    // already vanished, and only on the next tick, so the Chronicle screen kept showing a vow
    // sworn by somebody whose story had finished.
    dropCharges(state, story.id);
  }
}

/** A whisper: one line in the header strip. No pause, no queue slot, no acknowledgement. */
function whisper(state: GameState, story: ActiveStory, fragment: StoryFragment, ctx: StoryCtx): void {
  const params = storyParams(state, story);
  pushToast(
    state,
    storyText(`${story.templateId}.${fragment.id}.line`, params),
    fragment.tone ?? 'info',
    // The reference is what turns a line that scrolls past into a door. Every whisper has a
    // forty-to-ninety word `scene` written for it and, until the strip existed, no way at all to
    // reach it: Ascent runs `ConquestUIScene`, which reads neither `state.message` nor the log.
    { storyId: story.id, templateId: story.templateId, fragmentId: fragment.id },
  );
  fire(state, story, fragment, ctx);
}

// ── The tick ────────────────────────────────────────────────────────────────

/**
 * One story tick. Seeds occasionally, cools every story, and lets at most one whisper through.
 *
 * Cards and blows are not spoken here — they are *marked* on the story and raised by the
 * decision director, which owns the pacing contract for everything that pauses the world.
 */
/**
 * The structural check, run once, where an author will actually see it.
 *
 * `invariants.ts` has claimed "checked at module load in dev" since it was written and never was:
 * its only caller was `verify-chronicle`, so a typo'd node id shipped unless somebody remembered
 * to run the harness — and a bad id is a hole a player falls into forty minutes into a run.
 *
 * Not at module load, though. `invariants.ts` imports the catalogue, so importing it back from
 * `data/stories/index.ts` is a cycle, and running the check inside it executed before the
 * catalogue existed: every mode failed to boot. From inside a function the same cycle is inert,
 * because by the time anything calls this every module has finished initialising.
 *
 * `console.warn`, deliberately — not `throw`, which takes the game down over one authoring slip,
 * and not `console.error`, which `gate/smoke` and every verify harness read as a failure, so one
 * typo would turn every unrelated gate red. The harness keeps the hard assertion.
 */
let invariantsChecked = false;

function checkInvariantsOnce(): void {
  if (invariantsChecked || !import.meta.env?.DEV) return;
  invariantsChecked = true;
  const violations = storyViolations(storyTemplates);
  if (violations.length > 0) {
    console.warn(`[chronicle] ${violations.length} structural violations:\n${describeViolations(violations).join('\n')}`);
  }
}

export function tickStories(state: GameState): void {
  if (state.gameMode !== 'ascent' || !state.ascent) return;
  checkInvariantsOnce();

  const before = state.storyWatch ?? snapshot(state);
  const world = worldDelta(state, before);
  state.storyWatch = snapshot(state);

  if (state.turn % SEED_INTERVAL === 0) trySeed(state);

  const stories = state.stories ?? [];
  let whispersLeft = WHISPERS_PER_TICK;
  /** Provinces already whispered about this tick, so the second line is never about the first's. */
  const whisperedLands: string[] = [];
  /** Stories that have run dry and are giving their slot back at the end of the sweep. */
  const retiring: string[] = [];

  // Collision. Two stories that have bound the same hero or province do not both get to talk
  // about him in the same season — the hotter one speaks and the other waits, which reads as the
  // two of them contending for the same subject rather than as the world double-narrating it.
  //
  // The province half of that only applies once the realm is wide enough for a province to have
  // been a choice: see `CONTENTION_MIN_LANDS`.
  const spokenSubjects: ActiveStory[] = [];
  const landsOwned = playerLands(state).length;

  for (const story of [...stories].sort((a, b) => b.temperature - a.temperature)) {
    const template = storyTemplate(story.templateId);
    if (!template) continue;

    story.temperature = Math.max(0, story.temperature - COOL_PER_TICK);

    // An offer that stood long enough goes, without announcing that it has.
    if (story.offer && state.turn >= (story.offerUntil ?? 0)) {
      story.offer = undefined;
      story.offerUntil = undefined;
    }

    // A card the director never found room for. Holding it silences the story; letting it go does
    // not lose it, because the pool will offer it again.
    //
    // Unless the player has muted beats, in which case holding it *is* the arrangement: the card
    // is waiting for them in the Chronicle, and dropping it would quietly delete the thing they
    // are going to go and answer.
    //
    // Counted from when the card was picked, not from when the story last spoke. Those are not the
    // same clock: a story that whispers while holding a card kept pushing `lastSpokeTurn` forward
    // and so never reached the threshold at all. Measured, four of eight live stories ended a run
    // still holding a card they had picked up eighty seasons earlier.
    if (story.waiting && !storyCardsMuted(state)
      && state.turn - (story.waitingSince ?? story.lastSpokeTurn) > STALE_WAITING_TICKS) {
      story.waiting = undefined;
      story.waitingSince = undefined;
      story.cardRestUntil = state.turn + CARD_REST_TICKS;
    }

    // ── The patience clock ────────────────────────────────────────────────
    //
    // Cards are rationed to 15% of the run's prompts, so a story parked at a decision can wait
    // for one forever: measured, only 5 of 13 seeded stories reached an ending, and 2–5 sat in a
    // live slot having never said a word. Past patience the story gets louder — the only tell the
    // player ever gets. Past twice patience the moment has simply gone, and it takes the door
    // nobody chose, which is a different story rather than a worse one.
    const node = template.nodes?.find((candidate) => candidate.id === nodeOf(story, template));
    if (node && !node.terminal && node.patience) {
      const waited = state.turn - (story.nodeSince ?? story.seededTurn);
      if (waited >= node.patience) story.temperature += 0.4;
      if (waited >= node.patience * 2 && node.onIgnored) {
        story.waiting = undefined;
        story.waitingSince = undefined;
        enterNode(state, story, template, node.onIgnored);
        continue;
      }
    }

    const ctx = makeCtx(state, story, world);
    if (ctx.quietFor < MIN_QUIET) continue;
    if (spokenSubjects.some((other) => contendsForSubject(other, story, landsOwned))) continue;

    // A story already holding a card for the director may still whisper — indeed it *should*.
    // "A story heating up whispers more often, about smaller things" is the only tell the player
    // ever gets that something is coming, and going mute the moment a card is queued deletes it.
    // Whispers only while a card is already held, and while resting after letting one go.
    const resting = state.turn < (story.cardRestUntil ?? 0);
    const fragment = pickFragment(template, ctx, Boolean(story.waiting) || resting);
    if (!fragment) {
      // Nothing left to say. Give the slot back rather than squat on it for the rest of the run —
      // but only after long enough that a story merely waiting out a `quiet` is not evicted.
      story.dryTicks = (story.dryTicks ?? 0) + 1;
      if (story.dryTicks >= DRY_TICKS_BEFORE_RETIRE && !story.waiting && !story.offer) {
        retiring.push(story.id);
      }
      continue;
    }
    story.dryTicks = 0;
    spokenSubjects.push(story);

    // An opening is not speech. It hangs an offer on a subject and stands there — but it does
    // *not* stop the story talking, or a player who never takes the offer would silence it.
    if (fragment.opening) {
      story.offer = fragment.id;
      story.offerUntil = state.turn + OFFER_SEASONS;
      // Deliberately not marked as spoken and not counted against the quiet period: making an
      // offer is not the same as having said something.
      spokenSubjects.pop();
      continue;
    }

    if (fragment.volume === 'whisper') {
      if (whispersLeft <= 0) continue;
      // Two ambient lines in one season only when they are about different corners of the realm.
      // "Two whispers at once reads as noise" was right about two lines describing *one* place;
      // two provinces speaking in the same season is a realm rather than a narrator.
      const land = story.cast.landId;
      if (whispersLeft < WHISPERS_PER_TICK && (!land || whisperedLands.includes(land))) continue;
      if (land) whisperedLands.push(land);
      whispersLeft -= 1;
      whisper(state, story, fragment, ctx);
      continue;
    }

    // Cards and blows pause the world, so they go through the director's budget.
    story.waiting = fragment.id;
    story.waitingSince ??= state.turn;
  }

  if (retiring.length > 0) {
    state.stories = (state.stories ?? []).filter((story) => !retiring.includes(story.id));
  }
}

// ── Bridge to the decision director ─────────────────────────────────────────

interface Waiting {
  story: ActiveStory;
  template: StoryTemplate;
  fragment: StoryFragment;
}

/**
 * Whichever waiting story most deserves the queue's single story slot.
 *
 * **Deliberately not the first in the list, which is what it used to be.** Only one story-beat may
 * be pending or queued at a time, so scanning in list order handed the slot to whoever happened to
 * be earliest and starved everyone behind them *permanently*: measured over a 286-tick run,
 * seventeen stories queued a card and seven were still frozen holding one when the run ended,
 * having spoken between zero and two lines each. That is most of the reason only five of thirteen
 * seeded stories ever reached an ending.
 *
 * Hottest first, then longest-held, which is the same ordering `tickStories` already speaks in —
 * so a story that has been heating up and cannot get a word in is the next one heard.
 */
function firstWaiting(state: GameState): Waiting | undefined {
  const held: Waiting[] = [];
  for (const story of state.stories ?? []) {
    if (!story.waiting) continue;
    const template = storyTemplate(story.templateId);
    const fragment = template?.fragments.find((candidate) => candidate.id === story.waiting);
    if (!template || !fragment) continue;
    held.push({ story, template, fragment });
  }
  if (held.length === 0) return undefined;
  return held.sort((a, b) => (b.story.temperature - a.story.temperature)
    || (a.story.lastSpokeTurn - b.story.lastSpokeTurn))[0];
}

/** True when some story is holding a card or a blow the director could raise. */
export function storyBeatReady(state: GameState): boolean {
  if (state.gameMode !== 'ascent') return false;
  return Boolean(firstWaiting(state));
}

/**
 * The advisor line's speaker: whoever holds the seat most relevant to the story.
 *
 * Deliberately not a neutral narrator. A hero with low loyalty or high renown gives advice that
 * serves themselves, and nothing in the interface marks it — which is what finally gives
 * `loyalty` a meaning beyond a number on a card.
 */
function advisorFor(state: GameState, story: ActiveStory): Hero | undefined {
  const seated = Object.values(state.court.seats)
    .map((heroId) => state.heroes.find((hero) => hero.id === heroId))
    .filter((hero): hero is Hero => Boolean(hero) && hero!.id !== story.cast.heroId);
  if (seated.length === 0) return undefined;
  // The most self-interested voice in the room speaks first.
  return seated.sort((a, b) => (b.stats.renown - b.stats.loyalty) - (a.stats.renown - a.stats.loyalty))[0];
}

/** Builds the pausing prompt for whichever story is holding one. Returns false when none is. */
export function offerStoryBeat(state: GameState): boolean {
  const waiting = firstWaiting(state);
  if (!waiting) return false;
  const { story, fragment } = waiting;

  const params = storyParams(state, story);
  const ctx = makeCtx(state, story, worldDelta(state, state.storyWatch ?? snapshot(state)));
  const advisor = fragment.volume === 'card' ? advisorFor(state, story) : undefined;

  // Only one story may hold the queue at a time. Bail *before* clearing `waiting`, so a
  // fragment is never silently lost when the queue declines it — a story that forgot what it
  // was about to say is the one bug in this system a player could never diagnose.
  if (state.pendingAscentPrompt?.kind === 'story-beat'
    || state.ascent?.promptQueue.some((queued) => queued.kind === 'story-beat')) {
    return false;
  }

  state.storyPromptsRaised = (state.storyPromptsRaised ?? 0) + 1;
  story.waiting = undefined;
  story.waitingSince = undefined;

  const speaker = story.cast.heroId
    ? state.heroes.find((hero) => hero.id === story.cast.heroId)
    : undefined;

  // Enqueued rather than pushed live: the queue owns priority and the pause contract.
  enqueueAscentPrompt(state, {
    kind: 'story-beat',
    storyId: story.id,
    templateId: story.templateId,
    fragmentId: fragment.id,
    volume: fragment.volume,
    band: fragment.band,
    speakerHeroId: speaker?.id,
    params,
    advisorHeroId: advisor?.id,
    advisorKey: advisor ? `${story.templateId}.${fragment.id}.advice` : undefined,
    options: (fragment.options ?? []).map((option) => ({
      id: option.id,
      cost: storyOptionCost(state, option),
      affordable: (!option.cost || canSpend(state, storyOptionCost(state, option) ?? {}))
        && (option.enabled ? option.enabled(ctx) : true),
      blockedKey: option.blockedKey,
    })),
  });
  return true;
}

/**
 * Answers a story card, or dismisses a blow.
 *
 * A blow has no options; acknowledging it applies its effect, which is the point — you do not
 * get to choose, you get to live with it.
 */
export function resolveStoryBeat(state: GameState, storyId: string, fragmentId: string, choiceId: string): boolean {
  const story = (state.stories ?? []).find((candidate) => candidate.id === storyId);
  if (!story) return true; // The story ended underneath us; clear the prompt rather than wedge it.

  const template = storyTemplate(story.templateId);
  const fragment = template?.fragments.find((candidate) => candidate.id === fragmentId);
  if (!fragment) return true;

  const ctx = makeCtx(state, story, worldDelta(state, state.storyWatch ?? snapshot(state)));
  // Set here rather than left to `fire`: an option's `apply` runs first, and anything it books —
  // an echo above all — must be filed against the beat being answered.
  ctx.speaking = fragment.id;

  // Normally `offerStoryBeat` clears this when it builds the prompt. When beats are muted there is
  // no prompt: the story is answered straight off its own page, and nothing else would ever let go
  // of the card — so the page would keep showing a beat that had already been answered.
  if (story.waiting === fragmentId) {
    story.waiting = undefined;
    story.waitingSince = undefined;
  }

  if (fragment.volume === 'blow' || !fragment.options?.length) {
    fire(state, story, fragment, ctx);
    publishOutcome(state, story, fragment, ctx);
    return true;
  }

  const option = fragment.options.find((candidate) => candidate.id === choiceId);
  if (!option) {
    // Close it rather than refuse it. Reporting the prompt unhandled leaves it live forever and
    // the run sits on a card whose buttons do nothing — a far worse failure than a fragment that
    // resolves without applying anything.
    fire(state, story, fragment, ctx);
    publishOutcome(state, story, fragment, ctx);
    return true;
  }
  const paid = storyOptionCost(state, option);
  if (paid && !canSpend(state, paid)) return false;
  if (option.enabled && !option.enabled(ctx)) return false;

  if (option.cost) {
    applyResourceDelta(state, Object.fromEntries(
      Object.entries(paid ?? {}).map(([key, value]) => [key, -(value ?? 0)]),
    ));
    // The Chronicle records what was taken, not what was written: `noteCost` quoting the authored
    // figure while the treasury moved by the scaled one made the outcome sheet lie about the price.
    noteCost(ctx, paid ?? {});
  }
  // Echo: remember *when* this was answered, so a later fragment can quote the season back.
  ctx.remember('echoTurn', state.turn);
  ctx.remember(`chose_${option.id}`, 1);
  // How historical the run has been, as ordinary memory numbers, so a fragment can gate on it
  // with the same `when` machinery as everything else rather than a second engine.
  if (option.historicity) ctx.bump(option.historicity === 'annal' ? 'su' : 'lech');
  // What the treasury actually moved by. A story that pays a sum back must read this rather
  // than the authored figure: the deposit was scaled, and the literal no longer matches it.
  ctx.paid = paid;
  option.apply(ctx);
  // The trunk moves *after* the effect, so an `apply` that reads the current node still sees the
  // one the player was answering from.
  if (option.to && template) {
    const from = nodeOf(story, template);
    enterNode(state, story, template, option.to);
    noteTurn(ctx, story, from, option.to);
  }
  fire(state, story, fragment, ctx);
  publishOutcome(state, story, fragment, ctx);
  return true;
}

/**
 * Hands the ledger to the UI, once.
 *
 * Everything the beat did is already collected on `ctx.noted`; this is only the handover. A beat
 * that changed nothing observable sets nothing, so the report card never appears to say "nothing
 * happened" — silence is still a legitimate outcome and does not deserve a modal.
 */
function publishOutcome(state: GameState, story: ActiveStory, fragment: StoryFragment, ctx: StoryCtx): void {
  if (!ctx.noted.length) return;
  state.lastStoryOutcome = {
    templateId: story.templateId,
    fragmentId: fragment.id,
    params: storyParams(state, story),
    outcome: [...ctx.noted],
    historicity: storyTemplate(story.templateId)?.nodes?.length ? (story.drift ?? 'chinh-su') : undefined,
  };
}

/**
 * The turn a trunked answer took, in the node's own authored words.
 *
 * Forty-three options across `orange`, `thanh-giong` and `tien-phat` route the trunk and do
 * nothing else at the moment they are pressed — the destination beat pays, one card later. That
 * is the right idiom and it stays, but it left the press itself reading as inert, which is most
 * of "one question and then just story". The node names already exist and are already drawn on
 * the story page's spine; this simply says out loud which way the answer went.
 *
 * Never for a self-loop: a repeatable door names its own node in `to`, and "the story turns
 * toward the forge" is a lie when the story was already at the forge and has not moved.
 */
function noteTurn(ctx: StoryCtx, story: ActiveStory, from: string, to: string): void {
  if (!to || to === from) return;
  const key = `${story.templateId}.node.${to}`;
  const name = storyText(key, storyParams(ctx.state, story));
  if (name === key) return;
  ctx.note('turned', undefined, name);
  // Only when nothing else happened. A one-line report saying merely that the story moved is
  // thin; beside a real consequence, restating the stake is noise.
  if (ctx.noted.length === 1) {
    const stake = storyText(`${story.templateId}.stake`, storyParams(ctx.state, story));
    if (stake !== `${story.templateId}.stake`) ctx.note('stakeNow', undefined, stake);
  }
}

/**
 * Books an option's price into the same ledger as its result.
 *
 * A card that says only what it costs is the entire complaint this exists to answer, so the two
 * halves belong in one record: what you paid, and what it bought.
 */
/**
 * What an option actually asks for, here and now.
 *
 * Story prices were authored flat and charged flat, so a card asking 300 gold was a real decision
 * at the founding and loose change to a realm grossing 780 a season. They wear the same scaled
 * purse every other routine price already wears — and exactly 1 in the classic modes.
 *
 * **Every reader must go through this.** The sheet quotes a price, the drain re-checks whether it
 * is still affordable, and the resolver charges it; three readings of `option.cost` where one is
 * scaled and two are not is a card that quotes one number and takes another.
 */
function storyOptionCost(state: GameState, option: StoryOption): Partial<ResourceBag> | undefined {
  return option.cost ? scaledCost(state, option.cost) : undefined;
}

function noteCost(ctx: StoryCtx, cost: Partial<ResourceBag>): void {
  for (const [key, value] of Object.entries(cost)) {
    if (value) ctx.note(key, -value);
  }
}

// ── Openings ────────────────────────────────────────────────────────────────

/**
 * The offer hanging on a subject the player already visits.
 *
 * Never an order, never a deadline, never a reward preview. Ignoring it is free and is also an
 * answer — and in more than one story it is the answer that eventually matters.
 */
export function openingFor(state: GameState, on: 'land' | 'hero' | 'army' | 'rival' | 'treasury', subjectId?: string): StoryOpening | undefined {
  if (state.gameMode !== 'ascent') return undefined;
  for (const story of state.stories ?? []) {
    if (!story.offer) continue;
    const template = storyTemplate(story.templateId);
    const fragment = template?.fragments.find((candidate) => candidate.id === story.offer);
    if (!fragment?.opening || fragment.opening.on !== on) continue;

    if (on === 'land' && subjectId && story.cast.landId !== subjectId) continue;
    if (on === 'hero' && subjectId && story.cast.heroId !== subjectId) continue;
    if (on === 'rival' && subjectId && story.cast.kingdomId !== subjectId) continue;

    return storyOpening(state, story);
  }
  return undefined;
}

/**
 * The opening one specific story is holding, regardless of what any other story offers.
 *
 * The story page must use this rather than probing `openingFor` surface by surface: with five
 * stories live, two of them can hold offers on the *same* surface, and the surface probe only
 * ever returns the first — the second story's page then claimed "a door stands open" in the
 * list while showing nothing to take.
 */
export function storyOpening(state: GameState, story: ActiveStory): StoryOpening | undefined {
  if (!story.offer) return undefined;
  const template = storyTemplate(story.templateId);
  const fragment = template?.fragments.find((candidate) => candidate.id === story.offer);
  if (!fragment?.opening) return undefined;
  return {
    storyId: story.id,
    fragmentId: fragment.id,
    textKey: `${story.templateId}.${fragment.id}.line`,
    params: storyParams(state, story),
    // Fully qualified here so callers never have to know a story's key layout.
    actionKey: `${story.templateId}.${fragment.id}.${fragment.opening.actionKey}`,
  };
}

/**
 * What taking an opening would spend, and whether the treasury covers it right now.
 *
 * Exists so the door card can print its price and grey out honestly. Before this the card
 * always drew live and gold, and an unaffordable door swallowed the press without a word —
 * `takeOpening` returned `false` and the page did not so much as blink.
 */
export function openingView(state: GameState, opening: StoryOpening): { cost?: Partial<ResourceBag>; affordable: boolean } {
  const story = (state.stories ?? []).find((candidate) => candidate.id === opening.storyId);
  const template = story && storyTemplate(story.templateId);
  const fragment = template?.fragments.find((candidate) => candidate.id === opening.fragmentId);
  const option = fragment?.options?.[0];
  if (!option) return { affordable: true };
  const cost = storyOptionCost(state, option);
  return { cost, affordable: !cost || canSpend(state, cost) };
}

/** Takes an opening. The story reads it and moves on; nothing confirms anything. */
export function takeOpening(state: GameState, storyId: string, fragmentId: string): boolean {
  const story = (state.stories ?? []).find((candidate) => candidate.id === storyId);
  const template = story && storyTemplate(story.templateId);
  const fragment = template?.fragments.find((candidate) => candidate.id === fragmentId);
  if (!story || !fragment) return false;

  const ctx = makeCtx(state, story, worldDelta(state, state.storyWatch ?? snapshot(state)));
  ctx.speaking = fragment.id;
  const option = fragment.options?.[0];
  if (option) {
    const paid = storyOptionCost(state, option);
    if (paid && !canSpend(state, paid)) return false;
    if (option.enabled && !option.enabled(ctx)) return false;
    if (option.cost) {
      applyResourceDelta(state, Object.fromEntries(
        Object.entries(paid ?? {}).map(([key, value]) => [key, -(value ?? 0)]),
      ));
      noteCost(ctx, paid ?? {});
    }
    ctx.remember('echoTurn', state.turn);
    // The card writes this and the door never did, so a fragment could not tell whether a
    // standing offer had been taken or merely gone quiet.
    ctx.remember(`chose_${option.id}`, 1);
    if (option.historicity) ctx.bump(option.historicity === 'annal' ? 'su' : 'lech');
    // What the treasury actually moved by. A story that pays a sum back must read this rather
    // than the authored figure: the deposit was scaled, and the literal no longer matches it.
    ctx.paid = paid;
    option.apply(ctx);
    // A repeatable offering — Thánh Gióng's granary, say — names its own node in `to`, so taking
    // it leaves the story exactly where it was and the door can be opened again.
    if (option.to && template) {
      const from = nodeOf(story, template);
      enterNode(state, story, template, option.to);
      noteTurn(ctx, story, from, option.to);
    }
  }
  story.offer = undefined;
  story.offerUntil = undefined;
  fire(state, story, fragment, ctx);
  // Taking a door used to produce no acknowledgement whatsoever: you gave two hundred of the
  // granary and the sheet simply closed. That silence is most of "I cannot tell what my choices
  // did", and it is why the ledger matters more here than on the card.
  publishOutcome(state, story, fragment, ctx);
  return true;
}

// ── The story page's read model ─────────────────────────────────────────────

/**
 * Everything a story has said, oldest first, with the season each line landed.
 *
 * This is the "Đã xảy ra" column: the lines the player read one at a time across half an hour
 * of header strip, finally sitting together where they add up. Saves from before `history`
 * existed fall back to the undated `spoken` list rather than showing nothing.
 */
export function storySpokenHistory(
  state: GameState,
  story: ActiveStory,
): { fragmentId: string; turn?: number; outcome?: StoryOutcome[] }[] {
  if (story.history?.length) return story.history;
  return story.spoken.map((fragmentId) => ({ fragmentId }));
}

/**
 * True when the player has asked for story beats to wait rather than interrupt.
 *
 * See `AscentState.storyCardsMuted`. The Chronicle is the least time-critical thing the director
 * raises, so it is the one feature whose pacing the player can reasonably be handed.
 */
export function storyCardsMuted(state: GameState): boolean {
  return Boolean(state.ascent?.storyCardsMuted);
}

/**
 * The card or blow a story is holding for the player to come and answer.
 *
 * Only while beats are muted: otherwise `waiting` is a transient thing the director is about to
 * raise on its own, and showing it on the page would put the same beat in two places.
 */
export function heldBeat(
  state: GameState,
  story: ActiveStory,
): { fragment: StoryFragment; params: Record<string, string | number> } | undefined {
  if (!storyCardsMuted(state) || !story.waiting) return undefined;
  const template = storyTemplate(story.templateId);
  const fragment = template?.fragments.find((candidate) => candidate.id === story.waiting);
  if (!fragment) return undefined;
  return { fragment, params: storyParams(state, story) };
}

/**
 * Whether a story's options can be afforded right now, for the page that draws them.
 *
 * The same three gates `offerStoryBeat` applies when it builds a prompt — cost, `enabled`, and the
 * blocked-reason key — so a beat answered from the page cannot behave differently from the same
 * beat answered from a card.
 */
export function heldBeatOptions(
  state: GameState,
  story: ActiveStory,
  fragment: StoryFragment,
): { id: string; cost?: Partial<ResourceBag>; affordable: boolean; blockedKey?: string }[] {
  const ctx = makeCtx(state, story, worldDelta(state, state.storyWatch ?? snapshot(state)));
  return (fragment.options ?? []).map((option) => ({
    id: option.id,
    cost: storyOptionCost(state, option),
    affordable: (!option.cost || canSpend(state, storyOptionCost(state, option) ?? {}))
      && (option.enabled ? option.enabled(ctx) : true),
    blockedKey: option.blockedKey,
  }));
}

/** True when this story is holding an offer the player could act on right now. */
export function storyNeedsPlayer(story: ActiveStory): boolean {
  return Boolean(story.offer);
}

/**
 * True when this story wants the player, either way it can: a door standing open, or a beat it is
 * holding because beats are muted. What the Chronicle's "Needs you" group and the bar badge count.
 */
export function storyWantsPlayer(state: GameState, story: ActiveStory): boolean {
  return storyNeedsPlayer(story) || Boolean(heldBeat(state, story));
}

/**
 * The source class of a live story, for the chip at the head of its page.
 *
 * Read from the path's high-water mark rather than the current node, so a branch that has rejoined
 * the record still reads as having left it.
 */
export function storyDrift(story: ActiveStory): Historicity {
  return story.drift ?? 'chinh-su';
}

/**
 * The spine: every node the story has passed through, with its class and whether it is the one
 * standing now.
 *
 * This is the decision tree made visible, and it is the only screen that teaches the player the
 * feature exists. Empty for a template with no trunk, and the page simply omits the section.
 */
export function storyPath(
  state: GameState,
  story: ActiveStory,
): { nodeId: string; historicity: Historicity; current: boolean; diverged: boolean }[] {
  const template = storyTemplate(story.templateId);
  if (!template?.nodes?.length) return [];
  const path = story.path?.length ? story.path : [nodeOf(story, template)];
  const here = nodeOf(story, template);
  let worst: Historicity = 'chinh-su';
  return path.map((nodeId) => {
    const node = template.nodes?.find((candidate) => candidate.id === nodeId);
    const historicity = node?.historicity ?? 'chinh-su';
    // The step where the realm first left the record is the one worth marking; every step after
    // it is merely still away.
    const diverged = DRIFT_RANK[historicity] > DRIFT_RANK[worst];
    if (diverged) worst = historicity;
    return { nodeId, historicity, current: nodeId === here, diverged };
  });
}

/** How many endings of each class the run has recorded. The Reckoning's one line of identity. */
export function chronicleTally(state: GameState): Record<Historicity, number> & { total: number } {
  const tally = { 'chinh-su': 0, 'da-su': 0, 'ngoai-truyen': 0, total: 0 } as Record<Historicity, number> & { total: number };
  // Unclassified endings are not counted rather than counted as chính sử — see `record`.
  for (const entry of state.chronicle ?? []) {
    if (entry.historicity) tally[entry.historicity] += 1;
    // Counted whether or not it carries a class, so the Reckoning can say a run concluded five
    // stories even when some of them are templates nobody has placed against the record.
    tally.total += 1;
  }
  return tally;
}

/**
 * How the situation stands, for a story that has an answer to that.
 *
 * Same shape as `storyRegard` and read the same way: the template returns a suffix, the page
 * resolves `<templateId>.pressure.<suffix>`, and an unresolved key renders nothing rather than a
 * raw string. Only the instrument stories implement it.
 */
export function storyPressure(state: GameState, story: ActiveStory): string | undefined {
  const template = storyTemplate(story.templateId);
  if (!template?.pressure) return undefined;
  return template.pressure(makeCtx(state, story, worldDelta(state, state.storyWatch ?? snapshot(state))));
}

/** How many stories are holding an open door — the number on the Chronicle button. */
export function countOpenDoors(state: GameState): number {
  if (state.gameMode !== 'ascent') return 0;
  return (state.stories ?? []).filter((story) => storyWantsPlayer(state, story)).length;
}

/**
 * The bound character's current regard for the player, as a resolved text-key suffix.
 * Undefined when the template does not model it — the page simply omits the line.
 */
export function storyRegard(state: GameState, story: ActiveStory): string | undefined {
  const template = storyTemplate(story.templateId);
  if (!template?.regard) return undefined;
  const ctx = makeCtx(state, story, worldDelta(state, state.storyWatch ?? snapshot(state)));
  return template.regard(ctx);
}

// ── Marks ───────────────────────────────────────────────────────────────────

/** True when a story has taken an interest in this subject. The only signal it ever gives. */
export function isMarked(state: GameState, kind: 'land' | 'hero' | 'rival', id: string): boolean {
  if (state.gameMode !== 'ascent') return false;
  return (state.stories ?? []).some((story) => {
    if (kind === 'land') return story.cast.landId === id;
    if (kind === 'hero') return story.cast.heroId === id || story.cast.otherHeroId === id;
    return story.cast.kingdomId === id;
  });
}

// ── Helpers shared with the story data ──────────────────────────────────────

export function playerLands(state: GameState): Land[] {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

export function livingRivals(state: GameState): Kingdom[] {
  return state.kingdoms.filter((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated);
}

export function pick<T>(items: T[]): T | undefined {
  return items.length ? items[Math.floor(Math.random() * items.length)] : undefined;
}
