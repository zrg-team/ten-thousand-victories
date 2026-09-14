/**
 * **Store glyphs inside a sentence.**
 *
 * Prices and readings in their own strip are chips (`costChips`, `statChips`), but most amounts in
 * the game sit inside prose — "Còn thiếu 385 vàng — …", "+120 vàng, −40 lương thực", a story
 * choice's "Nộp 300 vàng" — and there a chip cannot go. Reported as *many places still say "vàng",
 * "lương thực" instead of icons — make it consistent everywhere*.
 *
 * So a string names a store with a token, `[[gold]]`, `[[food]]`, `[[supplies]]` or `[[humans]]`,
 * written directly before its figure ("[[gold]]385") — the chips' own order, glyph then number —
 * and every Phaser `Text` draws that token as the store's printed glyph. One hook, installed once
 * at boot, rather than a rich-text component threaded through four hundred call sites: labels,
 * card subtitles, lane notes, toasts, story pages and the cached-label images all create a `Text`,
 * so all of them get the glyph, with Phaser's own word wrap, alignment and measuring intact.
 *
 * **How.** `setText` swaps each token for an em space — a character exactly one font-size wide that
 * the word wrap never breaks on, so "[[gold]]385" stays one word and the line measures correctly —
 * and remembers which store each slot holds. `updateText` then draws the glyph from the icon atlas
 * into each slot as Phaser paints the line (`fillText` is called once per line, or once per letter
 * with letter spacing, at the position it computed itself).
 *
 * **The word comes back when the picture cannot**, as it does for chips: an atlas that failed to
 * load prints "vàng 385" rather than a gap with a number beside it.
 */
import Phaser from 'phaser';
import { resourceLabel } from '../i18n';
import type { ResourceKey } from '../state/types';
import { CONQUEST_UI_TEXTURE, opticalIconSize } from './conquestUiIcons';

const TOKEN = /\[\[(gold|food|supplies|humans)\]\]/g;
/** One em wide; never a word-wrap break (Phaser splits on U+0020 only). */
const SLOT = ' ';

type IconText = Phaser.GameObjects.Text & { __inlineIcons?: ResourceKey[] };

/** The token for a store, for strings built in code. */
export function iconToken(key: ResourceKey): string {
  return `[[${key}]]`;
}

/** Whether a string carries any store token. */
export function hasIconTokens(value: string): boolean {
  TOKEN.lastIndex = 0;
  return TOKEN.test(value);
}

function glyphsReady(scene: Phaser.Scene | undefined): boolean {
  const textures = scene?.sys?.textures;
  return Boolean(textures?.exists(CONQUEST_UI_TEXTURE));
}

/**
 * The string Phaser lays out: each token becomes a slot (or, with no atlas, the store's word), and
 * the stores in slot order. Exported for the measuring helpers that wrap text without `setText`.
 */
export function slotIcons(value: string, scene?: Phaser.Scene): { text: string; icons: ResourceKey[] } {
  const icons: ResourceKey[] = [];
  const ready = glyphsReady(scene);
  const text = value.replace(TOKEN, (_match, key: ResourceKey) => {
    if (!ready || !scene!.sys.textures.get(CONQUEST_UI_TEXTURE).has(key)) return `${resourceLabel(key)} `;
    icons.push(key);
    return SLOT;
  });
  return { text, icons };
}

/** Tokens as words, for surfaces that are not a Phaser `Text` (the DOM, logs, text dumps). */
export function iconTokensAsWords(value: string): string {
  return value.replace(TOKEN, (_match, key: ResourceKey) => `${resourceLabel(key)} `);
}

function fontPixels(text: Phaser.GameObjects.Text): number {
  const size = text.style.fontSize as unknown;
  const parsed = typeof size === 'number' ? size : Number.parseFloat(String(size));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
}

function drawGlyph(text: Phaser.GameObjects.Text, context: CanvasRenderingContext2D, key: ResourceKey, x: number, baseline: number): void {
  const textures = text.scene?.sys?.textures;
  if (!textures?.exists(CONQUEST_UI_TEXTURE)) return;
  const texture = textures.get(CONQUEST_UI_TEXTURE);
  if (!texture.has(key)) return;
  const frame = texture.get(key);
  const image = frame.source.image as CanvasImageSource;
  const em = fontPixels(text);
  // The slot is one em; the glyph is drawn a little larger than the capitals and optically evened
  // against its neighbours (a coin prints more ink than two figures), centred on the x-height.
  const size = opticalIconSize(key, em * 1.18);
  const aspect = frame.cutWidth / Math.max(1, frame.cutHeight);
  const w = aspect >= 1 ? size : size * aspect;
  const h = aspect >= 1 ? size / aspect : size;
  const cx = x + em / 2;
  const cy = baseline - em * 0.36;
  context.save();
  context.shadowColor = 'rgba(0,0,0,0)';
  context.drawImage(image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, cx - w / 2, cy - h / 2, w, h);
  context.restore();
}

let installed = false;

/** Once, at boot, before any scene draws a line. */
export function installInlineIcons(): void {
  if (installed) return;
  installed = true;
  const proto = Phaser.GameObjects.Text.prototype as IconText & {
    setText(value: string | string[]): Phaser.GameObjects.Text;
    updateText(): Phaser.GameObjects.Text;
  };
  const baseSetText = proto.setText;
  const baseUpdateText = proto.updateText;

  proto.setText = function setText(this: IconText & { _text?: string }, value: string | string[]) {
    const joined = Array.isArray(value) ? value.join('\n') : value;
    if (typeof joined === 'string' && joined.includes('[[')) {
      const { text, icons } = slotIcons(joined, this.scene);
      const before = this.__inlineIcons?.join(',') ?? '';
      this.__inlineIcons = icons.length ? icons : undefined;
      // Same slots, different stores ("[[gold]]5" → "[[food]]5"): Phaser would see an unchanged
      // string and skip the redraw.
      if (before !== icons.join(',')) this._text = undefined;
      return baseSetText.call(this, text);
    }
    if (this.__inlineIcons) {
      this.__inlineIcons = undefined;
      this._text = undefined;
    }
    return baseSetText.call(this, value);
  };

  proto.updateText = function updateText(this: IconText) {
    const icons = this.__inlineIcons;
    const context = (this as unknown as { context?: CanvasRenderingContext2D }).context;
    if (!icons?.length || !context) return baseUpdateText.call(this);
    const fill = context.fillText;
    let next = 0;
    const owner = this;
    context.fillText = function fillText(this: CanvasRenderingContext2D, line: string, x: number, y: number, maxWidth?: number) {
      if (maxWidth === undefined) fill.call(context, line, x, y);
      else fill.call(context, line, x, y, maxWidth);
      let at = line.indexOf(SLOT);
      while (at !== -1) {
        const key = icons[next++];
        if (key) drawGlyph(owner, context, key, x + context.measureText(line.slice(0, at)).width, y);
        at = line.indexOf(SLOT, at + 1);
      }
    };
    try {
      return baseUpdateText.call(this);
    } finally {
      context.fillText = fill;
    }
  };
}
