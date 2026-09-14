/**
 * The one door every new Dragon Ascent run walks through.
 *
 * The menu, the guided walkthrough, "go again", the Skirmish and the bench hook each used to build
 * a run with their own copy of `createAscentGameState({ seaSides: 1, difficulty: 'normal' })`. A
 * per-run rule — the ruleset first of all — has to be decided before the factory runs (it shapes
 * the opening), so five copies would have been five places to forget it. This is the only caller
 * of `createAscentGameState` outside the harnesses.
 *
 * What it decides, and nothing else:
 * - **the ruleset**: an explicit one if the door names it (a resumed reign's "go again", the
 *   Skirmish, a harness), otherwise the player's Settings choice, read here and only here;
 * - **the hands-on rule**: stamped only when the door passes one, exactly as each door did before.
 *
 * A v1 run carries no `ruleset` field at all, so its state, its saves and its fingerprint are
 * byte-for-byte what they were before versions existed. Every other version is written by id.
 */
import { preferredAscentRuleset } from '../game/rulesetOptions';
import { normalizeRulesetId } from '../game/ascentRuleset';
import { createAscentGameState } from './GameState';
import type { AscentRulesetId, CampaignConfig, GameState } from './types';

export interface NewAscentRunOptions {
  /** Whose rules the run plays by. Omitted: the player's Settings choice. */
  /** Old names (`stable`, `beta`) are accepted from harnesses and resumed reigns. */
  ruleset?: AscentRulesetId | 'stable' | 'beta';
  /** The hands-on rule. Omitted: left as the factory made it (off). */
  hardcore?: boolean;
  /** A Skirmish: a real run's data, nothing written to the house (`RunCreationOptions.sandbox`). */
  sandbox?: boolean;
}

export function newAscentRun(options: NewAscentRunOptions = {}): GameState {
  const ruleset = normalizeRulesetId(options.ruleset) ?? preferredAscentRuleset();
  const config: CampaignConfig = { seaSides: 1, difficulty: 'normal' };
  if (ruleset !== 'v1') config.ruleset = ruleset;
  const state = createAscentGameState(config, options.sandbox ? { sandbox: true } : {});
  if (options.hardcore !== undefined && state.ascent) state.ascent.hardcore = options.hardcore;
  return state;
}
