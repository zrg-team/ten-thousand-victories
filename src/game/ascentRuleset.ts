/**
 * Dragon Ascent rulesets: one engine, more than one set of rules.
 *
 * Gameplay experiments ship as a **beta** the player turns on in Settings, not as edits to the
 * shipped game. A run is stamped with its ruleset when it starts (`CampaignConfig.ruleset`, set by
 * `newAscentRun`) and keeps it for life — saves, "go again" and resume all carry it. The same
 * scenes, the same tick loop and the same systems run both; where a rule differs, the one shared
 * function that owns that rule reads `rulesOf(state)` and branches *inside itself*.
 *
 * Rules for this module, because everything imports it:
 *
 * - **A leaf.** Type-only imports. `PowerSystem`, `AscentState`, the meta stores, `GameState` and
 *   the UI all read rulesets, and those sit inside the two big import cycles
 *   (WarSystem ↔ InvasionSystem ↔ PowerSystem ↔ hostileMarch; legacy ↔ cabinet ↔ ResourceSystem
 *   ↔ AscentState). A registry that imported any system would close a new loop through them.
 * - **Ids, flags and numbers only — never functions.** A ruleset is data a save could name and a
 *   harness could print. Strategy code lives beside the function that owns the seam, not here.
 * - **Stable is today's game.** A seam's stable branch is the old code moved verbatim, not the new
 *   formula run with old numbers (`1 * x` is not always `x`), and a stable path never gains a
 *   `Math.random` draw. `verify-ascent-fingerprint.mjs` holds stable byte-identical to a baseline.
 * - **One switch per experiment.** Each beta feature is its own field, so it can be measured alone
 *   (`docs/phase-2/validation-plan.md`: keep experiments separately selectable) and graduated
 *   alone: promoting a feature is copying its value into `STABLE` and deleting the dead branch.
 */
import type { AscentRulesetId, GameState } from '../state/types';

export type { AscentRulesetId } from '../state/types';

/**
 * A finite objective for the reign (backlog B12): break a Great Invasion from the `greatInvasions`-th
 * on while holding the capital and `provincesBesidesCapital` other provinces — or, from the
 * `capitalAloneFrom`-th on, with the capital alone — then choose to end the reign in victory or rule
 * on into the endless game with the bonus kept. `null`: the endless game.
 */
export interface GoalRule {
  readonly greatInvasions: number;
  readonly provincesBesidesCapital: number;
  /** The Great Invasion from which holding the capital alone is enough. 0: never. */
  readonly capitalAloneFrom: number;
  /** Score added once, whenever the reign ends, after the goal is won. */
  readonly bonusScore: number;
}

export interface AscentRuleset {
  readonly id: AscentRulesetId;
  readonly heroGrowth: boolean;
  readonly heroSpecializations: boolean;
  readonly heroTravel: boolean;
  readonly heroRecovery: boolean;
  readonly heroResidency: boolean;
  readonly heroCards: boolean;
  readonly heroLethal: boolean;
  readonly heroRulesVersion: 1 | 2;
  /** Frozen into new hero runs; zero is used only by the training-ablation harness. */
  readonly heroTrainingPerLevel: 0 | 2;
  /** B12 — one goal, then Endless. */
  readonly goal: GoalRule | null;
  /** B05 — a house carrying nothing in force and nothing waiting skips the run-start summary. */
  readonly inheritanceGate: boolean;
  /** B30 — the run-start summary and the Reckoning also say what the Legacy vault carries. */
  readonly carriedSummary: boolean;
  /**
   * B01 — conquest numbers say what they are: diplomacy shows trust progress and the seasons the
   * real trust gain (court multiplier included) will take, never a "certain" beside a percentage;
   * a siege quotes the clamped roll it will actually make; a wave met without an order is a
   * forecast, not a result; a defence card's preview values walls at what Ascent walls are worth.
   */
  readonly truthfulNumbers: boolean;
  /**
   * B10 — the band compares like with like: DEFENCE (what can fight where a wave lands, the figure
   * the verdict was always computed against) beside THREAT, instead of a composite POWER that folds
   * in the treasury. Realm worth (the old POWER) stays on the Reckoning.
   */
  readonly defenceBand: boolean;
  /**
   * B10 — THREAT between waves quotes what will actually land: the wave shape's size, a pending
   * coalition, the relations dial (locked once rolled, expected before) and difficulty, which the
   * old projection left out so the number jumped the moment the hosts spawned.
   */
  readonly threatProjection: boolean;
  /**
   * B10 — seasons before a wave that its court is drawn, so THREAT quotes that court's relations dial
   * rather than an average of four (the largest remaining landing jump). 0 = drawn at launch, as on
   * stable. Requires `threatProjection`.
   *
   * Measured on the skill-ceiling gate (16 dev seeds): drawing a whole wave ahead cost the engaged
   * plans 2–4 waves each (agency 1.60× → 1.30×) — relations are read before the current wave is
   * fought, so the court at war with the realm tends to come straight back. A short lead keeps the
   * draw where the relations are.
   */
  readonly aggressorForecast: number;
  /**
   * B10 — THREAT is re-read at the end of a season whose last host died in it, instead of quoting
   * the dead host until the next season. Requires `threatProjection`.
   */
  readonly threatRefresh: boolean;
  /**
   * B19 — every reward label on the draft names its scope: a card's stack is *this reign*, its
   * level and copies belong to *the Deck*, and an unowned card says so instead of promising
   * "3 more to combine" (a draft never adds a copy).
   */
  readonly scopeLabels: boolean;
  /**
   * A1/A3 — how far (0–1) a wave after the opening is sized against what it strikes (the capital,
   * the median frontier province, the hunted host; `systems/ascent/strikeReference.ts`) instead of
   * the whole realm. 0 is the shipped sizing, byte for byte.
   */
  readonly strikeSizing: number;
  /**
   * Story options, story rewards and court petitions weigh against what they are about — the army
   * for wages, the people for relief, and the round for all of them — over the scaled purse
   * (`systems/ascent/storyValue.ts`). Off is the purse alone, the shipped price.
   */
  readonly scaledStories: boolean;
  /**
   * The paid talent search (`ChampionSearch.talentSearchPrice`) is priced by how far the court's
   * Favour meter still has to go — dearer than the whole treasury right after a free champion,
   * cheapest just before the next one — and climbs with every search already bought this reign.
   * Off is the shipped price: a base or a flat share of the treasury, whichever is greater.
   */
  readonly talentPriceByFavor: boolean;
}
// strikeSizing, measured and NOT adopted for the beta (verify-skill-ceiling, 16 dev seeds, goal at
// capital + 2, 2026-09-13; beta baseline: raw spread 1.31×, paired 78%, agency 1.60×):
//   0.25 → raw 1.29×, agency 1.49× (Warhost falls to 16.4 waves) — both under the gate;
//   0.5  → raw 1.06×, paired 53% — the spread collapses (Bastion 23.0 → 17.3 waves);
//   1.0  → raw 1.45× but agency 1.14× — Bastion falls to 12.5 waves, barely above declining.
// Sizing capital-aimed waves by the capital alone punishes a tall realm far more than it rewards a
// wide one. Built behind the flag (0 = shipped sizing, byte for byte) so a better reference can be
// tried against the same gate.

export const ASCENT_RULESET_IDS: readonly AscentRulesetId[] = ['stable', 'beta'];

const STABLE: AscentRuleset = {
  id: 'stable',
  heroGrowth: false,
  heroRulesVersion: 1,
  heroTrainingPerLevel: 2,
  heroSpecializations: false,
  heroTravel: false,
  heroRecovery: false,
  heroResidency: false,
  heroCards: false,
  heroLethal: false,
  goal: null,
  inheritanceGate: false,
  carriedSummary: false,
  truthfulNumbers: false,
  defenceBand: false,
  threatProjection: false,
  aggressorForecast: 0,
  threatRefresh: false,
  scopeLabels: false,
  strikeSizing: 0,
  scaledStories: false,
  talentPriceByFavor: false,
};

/** Stable, plus the experiments. Spread so a field the beta does not override reads as stable. */
const BETA: AscentRuleset = {
  ...STABLE,
  id: 'beta',
  talentPriceByFavor: true,
  scaledStories: true,
  heroGrowth: true,
  heroRulesVersion: 2,
  heroSpecializations: true,
  heroTravel: true,
  heroRecovery: true,
  heroResidency: true,
  heroCards: true,
  // Warning comprehension and physical-device/player cohorts remain release gates.
  heroLethal: false,
  // Wave 12 is ~9.5 simulated minutes. Two provinces besides the capital, not three — measured with
  // the honest skill-ceiling plans on 32 unseen seeds (1009 + 37i), 2026-09-13: at three, the wide
  // plans kept it in 7/32 and 6/32 reigns; at two, 13/32 and 9/32, declining 0/32 either way, and
  // the tall Bastion plan ~never (the goal rewards holding ground, surviving rewards walls — a real
  // fork). Bonus 600 = five waves' score; banking never out-earns ruling on (the bonus is kept).
  // Two ways to win, so the goal does not pick the strategy: a wide realm can win at the 3rd Great
  // Invasion, a tall one by holding out to the 4th. Scored on the skill-ceiling plans over 64 seeds
  // (goal checks recorded with winning switched off): capital + 2 at the 3rd won Bastion 8%, Frontier
  // 33%, Warhost 22%; capital + 1 at the 3rd or capital alone at the 4th wins 77% / 70% / 63%, and
  // the declining plan 20% — the only rule tried with every engaged plan >= 60% and declining <= 25%.
  goal: { greatInvasions: 3, provincesBesidesCapital: 1, capitalAloneFrom: 4, bonusScore: 600 },
  inheritanceGate: true,
  carriedSummary: true,
  truthfulNumbers: true,
  defenceBand: true,
  threatProjection: true,
  aggressorForecast: 5,
  threatRefresh: true,
  scopeLabels: true,
};

declare global {
  // eslint-disable-next-line no-var
  var __ascentRulesetOverride: Partial<Record<AscentRulesetId, Record<string, unknown>>> | undefined;
}

/**
 * The resolved table, with any harness override applied **once, at module load**.
 *
 * Same reason `ASCENT_TUNING` is seeded that way: the dev server can hold two instances of a module
 * (the game bundle's and a harness's `import('/src/…')`), so assigning into the object after boot
 * reaches only one of them. A harness sets `globalThis.__ascentRulesetOverride` with
 * `page.addInitScript` before navigation — e.g. `{ beta: { goal: false } }` to measure the beta
 * without one of its features. Nothing in the game writes it, and saves never carry it.
 */
const RULESETS: Readonly<Record<AscentRulesetId, AscentRuleset>> = (() => {
  const override = typeof globalThis !== 'undefined' ? globalThis.__ascentRulesetOverride : undefined;
  const stable: AscentRuleset = { ...STABLE, ...(override?.stable ?? {}), id: 'stable' };
  const beta: AscentRuleset = { ...BETA, ...(override?.beta ?? {}), id: 'beta' };
  return { stable, beta };
})();

export function isAscentRulesetId(value: unknown): value is AscentRulesetId {
  return value === 'stable' || value === 'beta';
}

/** The ruleset a run was started under. Anything absent or unrecognised is `stable`. */
export function rulesetIdOf(state: Pick<GameState, 'campaignConfig'> | undefined): AscentRulesetId {
  const id = state?.campaignConfig?.ruleset;
  return isAscentRulesetId(id) ? id : 'stable';
}

/** The rules a run plays by. The one read every seam makes. */
export function rulesOf(state: Pick<GameState, 'campaignConfig'> | undefined): AscentRuleset {
  return RULESETS[rulesetIdOf(state)];
}

export function rulesetById(id: AscentRulesetId): AscentRuleset {
  return RULESETS[id];
}
