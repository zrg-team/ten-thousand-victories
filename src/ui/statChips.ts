/**
 * **A reading, drawn rather than spelled.**
 *
 * `costChips` solved this once for prices: a chip is the icon and the figure, and nothing else.
 * What it did not touch is the other half of every card in the mode — the *subtitle*, which is
 * where a row says what it is worth reading for. Measured off the rendered display list, one
 * screen at a time, every lane was still printing those as words:
 *
 * ```
 * affairs   Strength 1250  ·  War appetite 0  ·  vs Vijaya
 * claims    2 ways in  ·  Garrison 39  ·  Suits Gold · 85%
 * army      morale 100  ·  supply 83
 * province  Defence 160  ·  Loyalty 100%
 * ledger    In +111  ·  out −70
 * court     gold ×1.00  ·  stability +0.0/season  ·  growth +0.0
 * ```
 *
 * Six screens, one habit: the unit is a word, the word is the same width as the figure, and four
 * rows of it is a paragraph the player is expected to parse to compare two provinces. The header
 * strip has drawn its four stores as glyphs since the first build and nobody has ever had to read
 * it — that is the standard this brings to the rest of the mode.
 *
 * **The vocabulary is fixed here, not at the call site.** A stat means the same thing on every
 * screen it appears on, so defence is a shield in the army lane, on the province sheet and on the
 * war board, and the player learns it once. Every glyph comes out of `icons-v5` — no new art —
 * and `chipText` still falls back to the word if the atlas failed to download.
 */
import { RESOURCE_ICON, type CostChip } from './costChips';
import type { ConquestUiIconId } from './conquestUiIcons';
import { resourceLabel, t } from '../i18n';
import type { LandSpecialization, ResourceKey } from '../state/types';

/**
 * Every reading the mode prints beside a figure, and the glyph that stands for it.
 *
 * Where two stats compete for the obvious glyph, the one printed more often keeps it: `heart` is
 * a host's morale (on every standing host, every repaint) and loyalty takes `crown`, which is
 * what loyalty is to — the throne.
 */
const STAT_ICON = {
  /** What a province, or the realm, can hold with. */
  defence: 'shield',
  /** What is coming for it. */
  threat: 'crossed-weapons',
  /** Men on the walls of a province we do not own yet. */
  garrison: 'spears',
  /** A host's fighting weight. */
  power: 'blade',
  /** A rival's, which is the same reading against a different name. */
  strength: 'blade',
  /** How badly a rival wants a war. */
  appetite: 'skull',
  /** A host's will. */
  morale: 'heart',
  /** A host's rations. */
  supply: 'supplies',
  /** A province's, toward us. */
  loyalty: 'crown',
  /** Bodies — people in a province, people in the realm. */
  people: 'humans',
  /** Men under arms. */
  soldiers: 'spears',
  /** Standing hosts, by the flag each one marches under. */
  hosts: 'banner',
  /** Buildings standing out of the buildings a province admits. */
  built: 'hammer',
  /** Open approaches into a province. */
  ways: 'door',
  /** How well the ground suits what we would do with it. */
  suits: 'terrain',
  /** The court's footing. */
  stability: 'scales',
  /** Seasons — the mode's own clock. */
  seasons: 'hourglass',
  /** What came in. */
  income: 'chevrons-up',
  /** What went back out. */
  outgo: 'chevrons-down',
} as const satisfies Record<string, ConquestUiIconId>;

export type StatKind = keyof typeof STAT_ICON;

/** The word each reading falls back to when its glyph is missing — and only then. */
const STAT_LABEL: Record<StatKind, () => string> = {
  defence: () => t('army.stat.defence'),
  threat: () => t('army.stat.threat'),
  garrison: () => t('ascent.chip.garrison'),
  power: () => t('ascent.army.statPower'),
  strength: () => t('ascent.army.statPower'),
  appetite: () => t('ascent.chip.appetite'),
  morale: () => t('ascent.army.statMorale'),
  supply: () => t('ascent.army.statSupply'),
  loyalty: () => t('ascent.chip.loyalty'),
  people: () => t('ascent.land.people'),
  soldiers: () => t('army.stat.soldiers'),
  hosts: () => t('army.stat.hosts'),
  built: () => t('ascent.chip.built'),
  ways: () => t('ascent.chip.ways'),
  suits: () => t('ascent.chip.suits'),
  stability: () => t('ascent.chip.stability'),
  seasons: () => t('ascent.chip.seasons'),
  income: () => t('ascent.chip.in'),
  outgo: () => t('ascent.chip.out'),
};

/**
 * One reading as a chip.
 *
 * `value` is passed already formatted, because the figure is the part the screen knows how to
 * write: a percentage, a ratio, a signed delta and a plain count are all the same chip, and
 * rounding one of them here would be this module guessing at a rule the caller already has.
 */
export function statChip(kind: StatKind, value: string | number, tone?: number): CostChip {
  return {
    icon: STAT_ICON[kind],
    value: typeof value === 'number' ? String(Math.round(value)) : value,
    label: STAT_LABEL[kind](),
    tone,
  };
}

/**
 * Several readings at once, dropping any the caller passed as `undefined`.
 *
 * Written this way so a screen can offer a reading conditionally — a rival's feud, a host's
 * supply while it is in the field — without an array of `.filter(Boolean)` at every call site.
 */
export function statChips(
  entries: Array<[StatKind, string | number | undefined] | [StatKind, string | number | undefined, number | undefined] | undefined>,
): CostChip[] {
  const chips: CostChip[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const [kind, value, tone] = entry;
    if (value === undefined) continue;
    chips.push(statChip(kind, value, tone));
  }
  return chips;
}

/**
 * What a focus *is*, as one glyph — the store it fills, or the thing it defends with.
 *
 * The claim list is where this earns its place: five provinces, each saying which focus the
 * ground suits and how well. Spelled, that is "Suits Goods · 87%" against "Suits Gold · 100%" and
 * the player compares two words before they get to the two figures. As glyphs it is a coin beside
 * 100% and a sheaf beside 87%, and the row is read rather than parsed.
 */
const FOCUS_ICON: Record<LandSpecialization, ConquestUiIconId> = {
  balanced: 'balance',
  breadbasket: 'food',
  mining: 'supplies',
  trade: 'gold',
  populous: 'humans',
  fortress: 'wall',
  garrison: 'spears',
};

/**
 * A focus and a figure — how well the ground suits it, what it multiplies.
 *
 * `label` is handed in rather than looked up: the focus's name is mode-dependent (`focusTitle`
 * reads `state.gameMode`) and this module is deliberately stateless.
 */
export function focusChip(
  focus: LandSpecialization, value: string, label: string, tone?: number,
): CostChip {
  return { icon: FOCUS_ICON[focus], value, label, tone };
}

/**
 * A resource amount as a chip, with the figure written by the caller.
 *
 * `resourceChips` already does this for a whole cost bag, and rounds. This is for the places that
 * print one store with a sign or a multiplier on it — "+61", "−70", "×1.00" — where the string is
 * the reading and rounding it back to an integer would throw the reading away.
 */
export function resourceChip(key: ResourceKey, value: string | number, tone?: number): CostChip {
  return {
    icon: RESOURCE_ICON[key],
    value: typeof value === 'number' ? String(Math.round(value)) : value,
    label: resourceLabel(key),
    tone,
  };
}
