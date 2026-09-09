/**
 * Two dials the player owns: how hard the enemy is to out-think, and how fast a round goes by.
 *
 * They are preferences rather than run state — they belong to the browser the way the language and
 * the map theme do, not to a reign — so they live beside those in `localStorage` and not in a
 * snapshot. A player who changes the speed mid-siege should not find it reverted by loading a save
 * made before they changed it.
 *
 * **Both default to exactly what the game did before this file existed.** Every harness in
 * `test_scripts/` is tuned against that behaviour, and a setting whose default quietly moves the
 * baseline turns every regression fingerprint into a question about which dial was set.
 */

import { ASCENT_BATTLE_ESCALATION } from './ascentConfig';

export type BattleDifficulty = 'easy' | 'medium' | 'hard' | 'nightmare';
export type BattleSpeed = 'slow' | 'normal' | 'fast';
/**
 * Whether the dock marks the shapes that beat the one the invader is standing in.
 *
 * A third dial, and deliberately not folded into difficulty. Difficulty is how well the *enemy*
 * plays; this is how much the interface plays for you — and a player can want a patient invader
 * and no crib sheet, or a vicious one with the marks left on while they learn the ring. Keeping
 * them apart is also the only way to answer "make it harder without changing the fight": with
 * the marks off, the loss numbers still say you are losing and the table is what tells you which
 * shape fixes it. That inference is the game.
 */
export type BattleHints = 'show' | 'hide';

export const BATTLE_DIFFICULTIES: BattleDifficulty[] = ['easy', 'medium', 'hard', 'nightmare'];
export const BATTLE_SPEEDS: BattleSpeed[] = ['slow', 'normal', 'fast'];
export const BATTLE_HINTS: BattleHints[] = ['show', 'hide'];

interface DifficultyProfile {
  /**
   * Added to the beats the invader hesitates before ordering its answer. Positive is slower.
   *
   * Difficulty is how fast and how fully the enemy PLAYS — never how hard he hits. Nothing in
   * this profile touches damage, morale or the odds: a harder enemy answers sooner
   * (`reactDelay`), refuses to rest (`answersEven`) and plays more of the game's own verbs at
   * you (`wagerAfter`) — the same verbs the player has, at the same prices.
   *
   * It used to lengthen their walk instead. Since the wind rework every walk is one flat beat and
   * the delay moved to hesitation — beats they stand countered before ordering — which is worth
   * strictly more to the player: a hesitating invader is being countered at full tilt, where a
   * walking one had zeroed the tilt for both sides. See `advanceEnemyFormation`.
   */
  readonly reactDelay: number;
  /**
   * Clash beats the player must stand IDLE on the formation dial before the invader dares his
   * own dồn sức on a winning shape — piling everything onto a counter nobody is answering.
   * `null` never wagers (easy: the pattern simply does not exist there). The player's answer is
   * the player's own verb: re-form and the wager folds on the spot. See `advanceEnemyWager`.
   */
  readonly wagerAfter: number | null;
  /**
   * Whether they re-form out of an even matchup as well as a losing one.
   *
   * Normally an invader only answers when the ring is actually against them, which is what gives a
   * player the window the whole design depends on: counter, hold it while they walk, spend the
   * advantage before they arrive. Turning this on removes the even-matchup rest, so there is never
   * a beat where they are content.
   */
  readonly answersEven: boolean;
  /**
   * How long the speech bubbles over the two hosts stay up, in ms. `Infinity` keeps them for as
   * long as the sentence is true; `0` never draws them at all.
   *
   * The bubbles are the fight in words — "All ranks, level spears!", "we are spread loose" — and on
   * the default setting they now fade, so the drawn formation is what a player learns to read.
   * Hard fades faster; nightmare has no bubbles, only the picture. Both sides, deliberately: a
   * player who ordered a shape knows what they ordered, and a bubble repeating it back was one
   * more thing on a screen that wants the eye on the men.
   */
  readonly bubbleMs: number;
  /**
   * Whether the chips are rimmed to show which shapes beat the enemy's. On hard and nightmare
   * they are not: the player sees THAT they are losing (the loss numbers stay on every setting)
   * and has two pips to find out WHICH shape fixes it. That inference is the game.
   */
  readonly rims: boolean;
}

const DIFFICULTY: Record<BattleDifficulty, DifficultyProfile> = {
  // Two extra beats is a long window — enough to counter, watch it land, and still spend a beat or
  // two inside the advantage before they answer. And no wager: easy is for learning the shapes.
  easy: { reactDelay: 2, answersEven: false, bubbleMs: Infinity, rims: true, wagerAfter: null },
  // Six idle beats is roughly two seasons of sitting still — long enough that a player merely
  // between decisions never sees it, short enough that a player who has stopped playing does.
  medium: { reactDelay: 0, answersEven: false, bubbleMs: 2400, rims: true, wagerAfter: 6 },
  hard: { reactDelay: -1, answersEven: false, bubbleMs: 1100, rims: false, wagerAfter: 4 },
  // Fastest they can be re-formed at all, never a beat of contentment, no words on the field,
  // and the wager comes almost at once.
  nightmare: { reactDelay: -2, answersEven: true, bubbleMs: 0, rims: false, wagerAfter: 3 },
};

interface SpeedProfile {
  /** Beats the simulation resolves per economy tick. */
  readonly beatsPerTick: number;
  /** Milliseconds the screen holds one beat while it drains them. */
  readonly tickMs: number;
}

/**
 * The two numbers move together, and that is not a convenience.
 *
 * `advanceBattle` resolves a burst of beats on the economy tick; the screen drains one per
 * `tickMs`. If their product drifts from `ASCENT_TICK_MS` (3500) the view either runs dry and sits
 * on a still picture for the rest of the season, or falls further behind the simulation every
 * tick until it is showing a fight that finished. Each profile below is sized so a tick's worth
 * plays out just inside the tick that produced it, which is the rule `BATTLE_TICK_MS`'s own comment
 * was written to keep.
 */
const SPEED: Record<BattleSpeed, SpeedProfile> = {
  // A beat is shown for 875 ms now, up from 560. At 560 a 28-beat fight was over in 25 s and read
  // as a dice roll — "no game feeling at all" — and every number on the rails stepped faster than
  // the eye could settle on it. The product still matches the world tick.
  slow: { beatsPerTick: 3, tickMs: 1166 },
  normal: { beatsPerTick: 4, tickMs: 875 },
  fast: { beatsPerTick: 6, tickMs: 583 },
};

const DIFFICULTY_KEY = 'mandate:battle:difficulty:v1';
const SPEED_KEY = 'mandate:battle:speed:v1';
const HINTS_KEY = 'mandate:battle:hints:v1';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  // Guarded because the systems are imported directly by headless harnesses, and a preference that
  // throws where there is no storage would take the whole fight down with it.
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
  } catch {
    return fallback;
  }
}

let difficulty: BattleDifficulty | undefined;
let speed: BattleSpeed | undefined;
let hints: BattleHints | undefined;

export function getBattleDifficulty(): BattleDifficulty {
  difficulty ??= read(DIFFICULTY_KEY, BATTLE_DIFFICULTIES, 'medium');
  return difficulty;
}

export function setBattleDifficulty(value: BattleDifficulty): void {
  difficulty = value;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DIFFICULTY_KEY, value);
  } catch { /* a browser with storage refused is still a browser that can play */ }
}

export function getBattleHints(): BattleHints {
  hints ??= read(HINTS_KEY, BATTLE_HINTS, 'show');
  return hints;
}

export function setBattleHints(value: BattleHints): void {
  hints = value;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(HINTS_KEY, value);
  } catch { /* as above */ }
}

export function getBattleSpeed(): BattleSpeed {
  speed ??= read(SPEED_KEY, BATTLE_SPEEDS, 'normal');
  return speed;
}

export function setBattleSpeed(value: BattleSpeed): void {
  speed = value;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SPEED_KEY, value);
  } catch { /* as above */ }
}

// ── Wave escalation: floors under the player's own dials ────────────────────
//
// From `ASCENT_BATTLE_ESCALATION` (ascentConfig): as a run's waves mount, the EFFECTIVE
// difficulty and pace stop going below the table's floors, and the bubbles' linger is capped —
// whatever the Settings rows say. Floors only ever raise; a player already above one feels
// nothing. The wave is handed in by `showBattle` (0 outside a Dragon Ascent fight), so the
// arena, the classic siege and every harness keep the exact behaviour the profiles promise.

let escalationWave = 0;
let bubbleOverride: number | undefined;

/**
 * A fight-scoped pin on the bubbles' linger — the Skirmish page's own dial. `-1` keeps the
 * words forever, `0` silences them, `undefined` follows the difficulty profile (and the wave
 * caps). An explicit pin beats both: it exists exactly so a practice fight can be set up with
 * more or fewer words than the player's real campaign gives them.
 */
export function setBattleBubbleOverride(ms?: number): void {
  bubbleOverride = ms;
}

/** The current run's wave, for the escalation floors. 0 = no escalation. */
export function setBattleEscalationWave(wave: number): void {
  escalationWave = wave;
}

function escalated(): {
  difficulty: BattleDifficulty; speed: BattleSpeed; bubbleCap: number; hintsHidden: boolean;
} {
  let diffIdx = BATTLE_DIFFICULTIES.indexOf(getBattleDifficulty());
  let speedIdx = BATTLE_SPEEDS.indexOf(getBattleSpeed());
  let bubbleCap = Infinity;
  let hintsHidden = false;
  for (const step of ASCENT_BATTLE_ESCALATION) {
    if (escalationWave < step.wave) continue;
    if (step.enemyFloor) diffIdx = Math.max(diffIdx, BATTLE_DIFFICULTIES.indexOf(step.enemyFloor));
    if (step.paceFloor) speedIdx = Math.max(speedIdx, BATTLE_SPEEDS.indexOf(step.paceFloor));
    if (step.bubbleCapMs !== undefined) bubbleCap = Math.min(bubbleCap, step.bubbleCapMs);
    if (step.hideHints) hintsHidden = true;
  }
  return {
    difficulty: BATTLE_DIFFICULTIES[diffIdx], speed: BATTLE_SPEEDS[speedIdx], bubbleCap, hintsHidden,
  };
}

/** Beats of hesitation before the invader orders its answer. See `DifficultyProfile.reactDelay`. */
export function battleReactDelay(): number {
  return DIFFICULTY[escalated().difficulty].reactDelay;
}

/** Whether the invader answers an even matchup as well as a losing one. */
export function battleAnswersEven(): boolean {
  return DIFFICULTY[escalated().difficulty].answersEven;
}

/** Idle beats before the invader wagers on a winning shape, or null to never. */
export function battleEnemyWagerAfter(): number | null {
  return DIFFICULTY[escalated().difficulty].wagerAfter;
}

/**
 * Whether the dock shows which shapes beat the enemy's.
 *
 * Three things can take the marks away and any one of them is enough: the player asked for it in
 * Settings, the invader is playing at a tier that never had them (hard and nightmare), or the run
 * has reached the wave where the campaign stops explaining itself. See `DifficultyProfile.rims`
 * and `AscentBattleEscalationStep.hideHints`.
 */
export function battleRimsShown(): boolean {
  if (getBattleHints() === 'hide') return false;
  const effective = escalated();
  return !effective.hintsHidden && DIFFICULTY[effective.difficulty].rims;
}

/** How long a speech bubble over a host lingers, capped by the wave escalation. */
export function battleBubbleMs(): number {
  if (bubbleOverride !== undefined) return bubbleOverride === -1 ? Infinity : bubbleOverride;
  const eff = escalated();
  return Math.min(DIFFICULTY[eff.difficulty].bubbleMs, eff.bubbleCap);
}

export function battleBeatsPerTick(): number {
  return SPEED[escalated().speed].beatsPerTick;
}

export function battleTickMs(): number {
  return SPEED[escalated().speed].tickMs;
}
