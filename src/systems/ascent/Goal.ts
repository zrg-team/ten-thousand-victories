/**
 * One goal, then Endless — the beta's finite reign (backlog B12, B13).
 *
 * Dragon Ascent had no win: every reign ended in defeat and inheritance. Under the beta ruleset a
 * reign carries one goal — break the third Great Invasion while holding the capital and one other
 * province, or a later one with the capital alone (`GoalRule`) — and winning it offers a real stopping point: **end in victory** now, or
 * **rule on** into the endless game with the victory bonus kept.
 *
 * The design keeps every reward on the terminal path. Nothing is banked when the goal is won; the
 * bonus is frozen on `AscentState.goal` and `computeRunScore` adds it once, inside the existing
 * `legacyBanked` guard, whether the reign ends by choice now or falls later. So there is no second
 * payout path to make idempotent, and "end in victory" never out-earns ruling on.
 *
 * Every function here is inert on a stable run: it has no `goal` rule and no `goal` state.
 * A leaf of the systems layer — it must never import `WaveDirector` (which calls it).
 */
import { BOSS_EVERY_N_WAVES } from '../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { rulesOf, type GoalRule } from '../../game/ascentRuleset';
import { provinceIsFalling } from '../LandSystem';
import { enqueueAscentPrompt } from './AscentState';
import { t } from '../../i18n';
import type { AscentGoal, GameState } from '../../state/types';

export function goalRule(state: GameState): GoalRule | null {
  return rulesOf(state).goal;
}

/** The goal state a new beta reign opens with; nothing on a stable reign. */
export function openingGoal(state: GameState): AscentGoal | undefined {
  const rule = goalRule(state);
  return rule ? { status: 'open', targetWave: goalFirstWave(rule) } : undefined;
}

/** The first wave that can decide the goal: the `greatInvasions`-th Great Invasion. */
export function goalFirstWave(rule: GoalRule): number {
  return rule.greatInvasions * BOSS_EVERY_N_WAVES;
}

/** The wave from which the capital alone wins, or undefined when the rule has no such wave. */
export function goalCapitalAloneWave(rule: GoalRule): number | undefined {
  return rule.capitalAloneFrom > 0 ? rule.capitalAloneFrom * BOSS_EVERY_N_WAVES : undefined;
}

/** Provinces besides the capital a Great Invasion settling at `wave` needs held to win the goal. */
export function goalNeed(rule: GoalRule, wave: number): number {
  const alone = goalCapitalAloneWave(rule);
  return alone !== undefined && wave >= alone ? 0 : rule.provincesBesidesCapital;
}

/** "one other province" / "2 other provinces", for the goal's sentences. */
export function goalProvincesPhrase(count: number): string {
  return count === 1 ? t('beta.goal.provincesOne') : t('beta.goal.provincesMany', { n: count });
}

/**
 * The Great Invasion the open goal is waiting on: wave 12, or — once that one settled without the
 * goal kept — the next Great Invasion. Stored on the goal, so the HUD reads it without a ruleset.
 */
export function goalTargetWave(state: GameState): number | undefined {
  const goal = state.ascent?.goal;
  return goal?.status === 'open' ? goal.targetWave : undefined;
}

/**
 * What the goal counts right now: the capital ours and not being taken, and every other province
 * ours and not being taken (`provinceIsFalling` — ground a lost fight has already given away is
 * not ground held).
 */
export function goalHold(state: GameState): { capital: boolean; others: number } {
  const capitalId = state.ascent?.capitalLandId;
  let capital = false;
  let others = 0;
  for (const land of state.lands) {
    if (land.ownerId !== PLAYER_KINGDOM_ID || provinceIsFalling(state, land.id)) continue;
    if (land.id === capitalId) capital = true;
    else others += 1;
  }
  return { capital, others };
}

/**
 * Called from `resolveWaveResult` the moment a wave's result is settled — the same moment, and on
 * both settle paths, that the "Great Invasion repelled" banner is decided, so the goal and the
 * banner can never disagree. Returns true when this settle won the goal.
 */
export function evaluateGoal(state: GameState, settled: { wave: number; boss: boolean }): boolean {
  const ascent = state.ascent;
  const rule = goalRule(state);
  if (!rule || !ascent?.goal || ascent.arena || state.isDefeated) return false;
  if (ascent.goal.status !== 'open') return false;
  if (!settled.boss || settled.wave < goalFirstWave(rule)) return false;
  const hold = goalHold(state);
  if (!hold.capital || hold.others < goalNeed(rule, settled.wave)) {
    // Missed: the goal waits on the next Great Invasion.
    ascent.goal.targetWave = settled.wave + BOSS_EVERY_N_WAVES;
    return false;
  }
  ascent.goal = {
    status: 'won',
    wonAtWave: settled.wave,
    landsAtWin: hold.others,
    bonusScore: rule.bonusScore,
    choicePending: true,
  };
  return true;
}

/**
 * Puts the victory card up while its choice is still owed. Called at the top of each tick, so the
 * card rises the tick *after* the win — the "repelled" banner plays first — and comes straight
 * back if anything cleared it.
 */
export function raiseGoalChoice(state: GameState): void {
  const ascent = state.ascent;
  const goal = ascent?.goal;
  if (!ascent || !goal || goal.status !== 'won' || !goal.choicePending) return;
  if (ascent.arena || state.isDefeated) return;
  if (state.pendingAscentPrompt?.kind === 'goal-won') return;
  if (ascent.promptQueue.some((queued) => queued.kind === 'goal-won')) return;
  enqueueAscentPrompt(state, { kind: 'goal-won', wave: goal.wonAtWave ?? ascent.wave });
}

/**
 * Saves drop pending prompts, so a reload between the win and the answer would lose the question.
 * `normalizeSnapshotState` calls this on the clone it saves and on the clone it loads: the card is
 * put back as the open prompt, paused, before the run takes a single tick.
 */
export function restoreGoalChoice(state: GameState): void {
  const goal = state.ascent?.goal;
  if (!goal || goal.status !== 'won' || !goal.choicePending || state.isDefeated) return;
  state.pendingAscentPrompt = { kind: 'goal-won', wave: goal.wonAtWave ?? state.ascent?.wave ?? 0 };
  state.isPaused = true;
}
