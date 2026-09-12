/**
 * **A price, drawn rather than spelled.**
 *
 * Every cost in the mode used to reach the player as `formatResourceList` — "679 vàng, 180 vật
 * tư" — a run of words in the same ink, at the same size, as the sentence explaining what the
 * option does. Three of those stacked in a list is a page nobody scans: the figure that decides
 * the choice is buried in prose, and the reader has to *read* to find out what a row costs.
 *
 * A chip is the icon and the figure, and nothing else. The atlas already carries a purpose-drawn
 * glyph for each of the four resources — `gold`, `food`, `supplies`, `humans` — plus the
 * hourglass the mode has always used for time, so the unit is a picture and the number is the
 * only text. Chips wrap across as many lines as they need and every consumer measures before it
 * draws, because both the lane cards and the prompt cards size their paper to their contents.
 *
 * **The word comes back when the picture cannot.** `addConquestUiIcon` hides a glyph whose atlas
 * failed to download rather than printing a missing-texture box, which for a price strip would
 * leave a bare number with no unit at all — "679" against "679 vàng" is a different sentence. So
 * `chipText` asks whether the frame is really there and falls back to the label when it is not.
 */
import Phaser from 'phaser';
import { CONQUEST_UI_TEXTURE, addConquestUiIcon, opticalIconSize, type ConquestUiIconId } from './conquestUiIcons';
import { PIGMENT } from './ink/palette';
import { UI_FONT } from './fonts';
import { measureInkTextWidth } from './InkVirtualList';
import { resourceLabel, t } from '../i18n';
import type { ResourceKey } from '../state/types';

/** The four resources, each on its own drawn glyph. */
export const RESOURCE_ICON: Record<ResourceKey, ConquestUiIconId> = {
  gold: 'gold',
  food: 'food',
  supplies: 'supplies',
  humans: 'humans',
};

/**
 * Fixed reading order, so two rows in a list line their prices up the same way — and it is the
 * *header strip's* order, food first, because a price the player is weighing against the running
 * total above it should not ask them to re-sort four glyphs first.
 */
const RESOURCE_ORDER: ResourceKey[] = ['food', 'supplies', 'gold', 'humans'];

export interface CostChip {
  icon: ConquestUiIconId;
  /** The figure. Numbers only — the glyph is the unit. */
  value: string;
  /** The unit in words, printed only if the glyph is unavailable. */
  label: string;
  tone?: number;
}

const cssHex = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;

/**
 * **Two sizes, because a chip is used for two different jobs.**
 *
 * `price` is the original: what a card costs, printed under the words that describe it, at the
 * weight a figure needs when it decides whether the row is tappable at all.
 *
 * `stat` is the strip that replaced a card's *subtitle* — "Strength 1250 · War appetite 0",
 * "morale 100 · supply 83", "Defence 160 · Loyalty 100%". Those lines were 9px muted prose, and a
 * price-sized strip in their place reads as the loudest thing on a row that is mostly a name. So
 * the glyph drops to 12 and the figure to 10: still the picture-and-number a chip is, at the
 * weight the line it replaced was set in.
 */
export type ChipSize = 'price' | 'stat';

interface ChipMetrics {
  icon: number;
  iconGap: number;
  chipGap: number;
  lineHeight: number;
  font: Phaser.Types.GameObjects.Text.TextStyle;
}

const METRICS: Record<ChipSize, ChipMetrics> = {
  price: {
    icon: 15, iconGap: 3, chipGap: 12, lineHeight: 18,
    font: { fontFamily: UI_FONT, fontSize: '12px', fontStyle: '700' },
  },
  stat: {
    icon: 12, iconGap: 3, chipGap: 9, lineHeight: 15,
    font: { fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700' },
  },
};

/** Chips for a resource bag, in the fixed order, skipping anything the bag does not charge. */
export function resourceChips(
  bag: Partial<Record<ResourceKey, number>> | undefined,
  tone?: number,
): CostChip[] {
  if (!bag) return [];
  const chips: CostChip[] = [];
  for (const key of RESOURCE_ORDER) {
    const value = bag[key];
    if (!value) continue;
    chips.push({
      icon: RESOURCE_ICON[key],
      value: String(Math.round(value)),
      label: resourceLabel(key),
      tone,
    });
  }
  return chips;
}

/** How long it takes, in the mode's own unit — seasons. */
export function seasonsChip(ticks: number, tone?: number): CostChip {
  return {
    icon: 'hourglass',
    value: String(Math.round(ticks)),
    label: t('ascent.chip.seasons'),
    tone,
  };
}

function iconAvailable(scene: Phaser.Scene, id: ConquestUiIconId): boolean {
  return scene.textures.exists(CONQUEST_UI_TEXTURE) && scene.textures.get(CONQUEST_UI_TEXTURE).has(id);
}

function chipText(scene: Phaser.Scene, chip: CostChip): string {
  return iconAvailable(scene, chip.icon) ? chip.value : `${chip.value} ${chip.label}`;
}

function chipWidth(scene: Phaser.Scene, chip: CostChip, m: ChipMetrics): number {
  const glyph = iconAvailable(scene, chip.icon) ? m.icon + m.iconGap : 0;
  return glyph + measureInkTextWidth(scene, chipText(scene, chip), m.font);
}

/**
 * Lines the strip needs at this width — the one number both measure and draw agree on.
 *
 * `indent` is room kept on the first line for a caption printed beside the chips rather than
 * above them: thirteen points of card height per province sheet, which is a row of the list
 * every four sheets.
 */
function layout(
  scene: Phaser.Scene, chips: CostChip[], width: number, indent = 0, size: ChipSize = 'price',
): Array<Array<{ chip: CostChip; x: number }>> {
  const m = METRICS[size];
  const lines: Array<Array<{ chip: CostChip; x: number }>> = [];
  let line: Array<{ chip: CostChip; x: number }> = [];
  let x = indent;
  for (const chip of chips) {
    const w = chipWidth(scene, chip, m);
    if (line.length > 0 && x + w > width) {
      lines.push(line);
      line = [];
      x = 0;
    }
    line.push({ chip, x });
    x += w + m.chipGap;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** Height a strip of chips will take at this width. Zero for no chips, so callers can add it blind. */
export function measureCostChips(
  scene: Phaser.Scene, chips: CostChip[], width: number, indent = 0, size: ChipSize = 'price',
): number {
  if (chips.length === 0) return 0;
  return layout(scene, chips, width, indent, size).length * METRICS[size].lineHeight;
}

/** Width a caption takes before the first chip, in the caption's own type. */
export function measureChipCaption(scene: Phaser.Scene, caption: string): number {
  return measureInkTextWidth(scene, caption.toLocaleUpperCase(), CAPTION_FONT) + CAPTION_GAP;
}

/** The caption's own ink, shared by everything that prints one beside a strip. */
export const CAPTION_FONT: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: UI_FONT, fontSize: '8px', fontStyle: '700',
};
const CAPTION_GAP = 8;

/**
 * Draws the strip into a container whose origin is the strip's top-left. The caller positions it;
 * the height it occupies is exactly what `measureCostChips` returned for the same width.
 */
export function drawCostChips(
  scene: Phaser.Scene,
  chips: CostChip[],
  opts: { x: number; y: number; width: number; muted?: boolean; indent?: number; size?: ChipSize },
): Phaser.GameObjects.Container {
  const holder = scene.add.container(opts.x, opts.y);
  const alpha = opts.muted ? 0.45 : 1;
  const size = opts.size ?? 'price';
  const m = METRICS[size];
  layout(scene, chips, opts.width, opts.indent ?? 0, size).forEach((line, index) => {
    const top = index * m.lineHeight;
    for (const { chip, x } of line) {
      const hasGlyph = iconAvailable(scene, chip.icon);
      if (hasGlyph) {
        holder.add(addConquestUiIcon(scene, chip.icon, opticalIconSize(chip.icon, m.icon))
          .setPosition(x + m.icon / 2, top + m.lineHeight / 2 - 1)
          .setAlpha(alpha));
      }
      const text = scene.add.text(x + (hasGlyph ? m.icon + m.iconGap : 0), top + (size === 'stat' ? 1 : 2), chipText(scene, chip), {
        ...m.font,
        color: cssHex(chip.tone ?? PIGMENT.giDong),
      }).setAlpha(alpha);
      holder.add(text);
    }
  });
  return holder;
}
