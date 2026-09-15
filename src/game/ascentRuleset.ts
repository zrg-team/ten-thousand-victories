/**
 * Dragon Ascent rule versions: one engine, several numbered sets of rules.
 *
 * A run is stamped with its version when it starts (`CampaignConfig.ruleset`, set by
 * `newAscentRun`) and keeps it for life — saves, "go again" and resume all carry it. The same
 * scenes, the same tick loop and the same systems run every version; where a rule differs, the one
 * shared function that owns that rule reads `rulesOf(state)` and branches *inside itself*.
 *
 * **The versions** (`ASCENT_RULESET_INFO`):
 * - `v1` — the original game, frozen. Kept playable from Settings; `verify-ascent-fingerprint.mjs`
 *   holds it byte-identical to its baseline, and saves from before versions existed resume as v1.
 * - `v2` — the current game and the default (graduated from the old "beta", 2026-09-15).
 * - a future `v3` — see *Adding a version* below.
 *
 * Rules for this module, because everything imports it:
 *
 * - **A leaf.** Type-only imports. `PowerSystem`, `AscentState`, the meta stores, `GameState` and
 *   the UI all read rulesets, and those sit inside the two big import cycles
 *   (WarSystem ↔ InvasionSystem ↔ PowerSystem ↔ hostileMarch; legacy ↔ cabinet ↔ ResourceSystem
 *   ↔ AscentState). A registry that imported any system would close a new loop through them.
 * - **Ids, flags and numbers only — never functions.** A ruleset is data a save could name and a
 *   harness could print. Strategy code lives beside the function that owns the seam, not here.
 * - **v1 is the old game.** A seam's v1 branch is the old code moved verbatim, not the new formula
 *   run with old numbers (`1 * x` is not always `x`), and a v1 path never gains a `Math.random`
 *   draw. A bug fix may reach v1 and re-baseline it; a *rule* change never does.
 * - **One switch per feature.** Each difference is its own field, so it can be measured alone and
 *   carried into the next version alone. A version is its parent spread plus the fields it changes.
 *
 * **Adding a version** (a `v3` experiment, say):
 * 1. Add `'v3'` to `AscentRulesetId` (`state/types.ts`) and to `ASCENT_RULESET_IDS` below.
 * 2. `const V3: AscentRuleset = { ...V2, id: 'v3', ...only the new or changed fields }`, and add it
 *    to `BASE`. A new field goes on `AscentRuleset` with its V1 value, so older versions read "off".
 * 3. Give it an `ASCENT_RULESET_INFO` entry: `status: 'experimental'` lists it in Settings and puts
 *    the experimental badge on the Play button; `selectable: false` keeps it harness-only.
 * 4. Add `ruleset.v3.name` / `ruleset.v3.note` to `i18n/catalogs/ascentBeta.ts`.
 * 5. Record its fingerprint (`verify-ascent-fingerprint.mjs --write --ruleset v3`) and gate it.
 * 6. Graduating it is `DEFAULT_ASCENT_RULESET = 'v3'` and v2's status becoming `legacy`.
 * Retiring a version: drop it from the ids and map it in `RULESET_ALIASES` to the version its saves
 * should resume under.
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
   * the whole realm. 0 is the v1 sizing, byte for byte.
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
  /**
   * Economy round 2026-09-15 — reported as "gold and goods grow too fast, so the numbers stop
   * meaning anything". One switch per lever so each can be measured alone.
   *
   * damperNetwork — owning the land around a province is worth much less: an owned neighbour adds
   * 0.75 of a road instead of 2, and the connected block adds +3% a province (cap +30%) instead of
   * +9% (cap +160%). A province is worth holding for what it makes, not for touching other land.
   */
  readonly damperNetwork: boolean;
  /**
   * waterTrade — a province with hexes on a river or the sea trades by water: its coin lines earn up
   * to +60%, its markets a flat bonus, its farms irrigation, and only it can raise a harbour. Water
   * hexes never belong to a province (`terrainSummary.water` is always 0), so this counts the
   * province's own hexes that touch water — see `systems/ascent/WaterTrade.ts`.
   */
  readonly waterTrade: boolean;
  /**
   * goodsSink — goods are used up: walls, towers, barracks and the civic districts wear goods to
   * keep, hosts wear out their kit, and production climbs a flatter curve per level.
   */
  readonly goodsSink: boolean;
  /** marketGlut — a store sold season after season floods the market and the price falls; it recovers while the market rests. */
  readonly marketGlut: boolean;
  /**
   * parPrices — the price scale reads the invasion round and how far the realm stands above or below
   * a normal realm at that round (the par curve), passing only part of a lead into prices so skill
   * keeps buying more than par. Off is the income x hoard scale. See `priceScale.ts`.
   */
  readonly parPrices: boolean;
  /** upkeepRound — standing costs (hero pay, hosts, building upkeep, the offices' base wage) climb with the round, never with wealth. */
  readonly upkeepRound: boolean;
  /** heroRaises — champions ask for more pay by level, deeds and temperament; a proud one refused again and again may leave. */
  readonly heroRaises: boolean;
  /**
   * provinceAutoGrow — each province carries its own "grow by itself" switch instead of one
   * realm-wide autopilot builder. On by default where the autopilot ran (phones), off on a
   * hands-on reign (desktop), and either can be flipped per province. A governor makes it grow
   * sooner and choose better; an ungoverned province waits between orders, builds slower and
   * chooses naively. See `systems/ascent/ProvinceAutoGrow.ts`.
   */
  readonly provinceAutoGrow: boolean;
}
// strikeSizing, measured and NOT adopted for v2 (verify-skill-ceiling, 16 dev seeds, goal at
// capital + 2, 2026-09-13; beta baseline: raw spread 1.31×, paired 78%, agency 1.60×):
//   0.25 → raw 1.29×, agency 1.49× (Warhost falls to 16.4 waves) — both under the gate;
//   0.5  → raw 1.06×, paired 53% — the spread collapses (Bastion 23.0 → 17.3 waves);
//   1.0  → raw 1.45× but agency 1.14× — Bastion falls to 12.5 waves, barely above declining.
// Sizing capital-aimed waves by the capital alone punishes a tall realm far more than it rewards a
// wide one. Built behind the flag (0 = shipped sizing, byte for byte) so a better reference can be
// tried against the same gate.

/** Every version this build can run, oldest first. The Settings picker lists them in this order. */
export const ASCENT_RULESET_IDS: readonly AscentRulesetId[] = ['v1', 'v2'];

/** What a new reign plays when the player has never chosen, and what a harness gets unless it pins one. */
export const DEFAULT_ASCENT_RULESET: AscentRulesetId = 'v2';

export type AscentRulesetStatus = 'legacy' | 'current' | 'experimental';

/**
 * How each version is offered. `status` decides the badge (the default version wears none) and
 * `selectable` whether Settings lists it at all — an experiment can exist for harnesses first.
 * Words live in the catalog under `ruleset.<id>.name` / `.note`.
 */
export const ASCENT_RULESET_INFO: Readonly<Record<AscentRulesetId, { status: AscentRulesetStatus; selectable: boolean }>> = {
  v1: { status: 'legacy', selectable: true },
  v2: { status: 'current', selectable: true },
};

/**
 * Names older builds wrote into saves, preferences and harness flags, and the version each means
 * now. `stable` was the shipped game (v1); `beta` is what became v2. Never removed: a save lives in
 * a player's browser for as long as they keep it.
 */
const RULESET_ALIASES: Readonly<Record<string, AscentRulesetId>> = { stable: 'v1', beta: 'v2' };

/** V1 — the original game. */
const V1: AscentRuleset = {
  id: 'v1',
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
  damperNetwork: false,
  waterTrade: false,
  goodsSink: false,
  marketGlut: false,
  parPrices: false,
  upkeepRound: false,
  heroRaises: false,
  provinceAutoGrow: false,
};

/** V2 — V1 plus everything the beta proved. Spread, so a field V2 does not name reads as V1. */
const V2: AscentRuleset = {
  ...V1,
  id: 'v2',
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
  // Economy round, 2026-09-15: changed in v2 directly at the user's call. Each lever is measured
  // against the others switched off with `__ascentRulesetOverride` (diag-economy-v2.mjs --override).
  damperNetwork: true,
  waterTrade: true,
  goodsSink: true,
  marketGlut: true,
  parPrices: true,
  upkeepRound: true,
  heroRaises: true,
  provinceAutoGrow: true,
};

declare global {
  // eslint-disable-next-line no-var
  var __ascentRulesetOverride: Partial<Record<string, Record<string, unknown>>> | undefined;
}

const BASE: Readonly<Record<AscentRulesetId, AscentRuleset>> = { v1: V1, v2: V2 };

/**
 * The resolved table, with any harness override applied **once, at module load**.
 *
 * Same reason `ASCENT_TUNING` is seeded that way: the dev server can hold two instances of a module
 * (the game bundle's and a harness's `import('/src/…')`), so assigning into the object after boot
 * reaches only one of them. A harness sets `globalThis.__ascentRulesetOverride` with
 * `page.addInitScript` before navigation — e.g. `{ v2: { goal: false } }` (the old name
 * `{ beta: … }` still works) to measure a version without one of its features. Nothing in the game
 * writes it, and saves never carry it.
 */
const RULESETS: Readonly<Record<AscentRulesetId, AscentRuleset>> = (() => {
  const override = typeof globalThis !== 'undefined' ? globalThis.__ascentRulesetOverride : undefined;
  const table = {} as Record<AscentRulesetId, AscentRuleset>;
  for (const id of ASCENT_RULESET_IDS) {
    const patches = Object.entries(override ?? {})
      .filter(([key]) => normalizeRulesetId(key) === id)
      .map(([, patch]) => patch);
    table[id] = Object.assign({}, BASE[id], ...patches, { id });
  }
  return table;
})();

/** A version id this build runs, accepting the old names; `undefined` for anything else. */
export function normalizeRulesetId(value: unknown): AscentRulesetId | undefined {
  if (typeof value !== 'string') return undefined;
  if ((ASCENT_RULESET_IDS as readonly string[]).includes(value)) return value as AscentRulesetId;
  return RULESET_ALIASES[value];
}

export function isAscentRulesetId(value: unknown): value is AscentRulesetId {
  return typeof value === 'string' && (ASCENT_RULESET_IDS as readonly string[]).includes(value);
}

/**
 * The version a run was started under.
 *
 * **Absent means v1**: every save made before versions existed was the original game, and a v1
 * run still carries no field so its saves and fingerprints stay byte-identical. A name this build
 * does not know also resumes as v1.
 */
export function rulesetIdOf(state: Pick<GameState, 'campaignConfig'> | undefined): AscentRulesetId {
  return normalizeRulesetId(state?.campaignConfig?.ruleset) ?? 'v1';
}

/** The rules a run plays by. The one read every seam makes. */
export function rulesOf(state: Pick<GameState, 'campaignConfig'> | undefined): AscentRuleset {
  return RULESETS[rulesetIdOf(state)];
}

/** A version's rules by id. Old names are accepted (harnesses); anything unknown is v1. */
export function rulesetById(id: AscentRulesetId | 'stable' | 'beta'): AscentRuleset {
  return RULESETS[normalizeRulesetId(id) ?? 'v1'];
}
