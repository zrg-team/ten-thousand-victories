/**
 * The one row every decision list in Dragon Ascent is stacked out of — the power draft, the
 * conquer-method sheet, the court's appointments, the law, decree and doctrine cards, the story
 * beats, the aftermath's acknowledgement. A widget rather than a screen: it owns a card's paper,
 * rail, wash, glyph, badge and its press, and knows nothing about what the choice means.
 *
 * Two things bite anyone editing it. The card is laid out text-first and the paper, rail, wash and
 * glyph are pushed in behind at fixed indices (`addAt` 0, 1, 2), so reordering those changes what
 * covers what. And `bounds.height` is a *minimum* — the real height is measured off the laid-out
 * text and published on `cardHeight`, which is what a caller must stride by, never a constant.
 */
import Phaser from 'phaser';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap, type UIBounds } from '../../../ui/InkUI';
import { CARD_ICON_SIZE, drawCardIcon, type CardIconId } from '../../../ui/CardIcons';
import { drawCostChips, measureCostChips, type CostChip } from '../../../ui/costChips';
import { addStoryChoiceIcon, isStoryChoiceIcon, STORY_CHOICE_ICON_SIZE } from '../../../ui/storyChoiceIcons';
import { UI_FONT } from '../../../ui/fonts';
import { soundDirector } from '../../../ui/sound/SoundDirector';
import { BADGE_CLEARANCE, cssHex } from '../constants';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * How long a prompt card must be held before it counts as chosen.
 *
 * Long enough that a brush of the finger does not spend a draft, short enough that a deliberate
 * press never feels like waiting. The card draws the hold filling along its foot, so the
 * requirement is visible rather than a button that mysteriously ignored you.
 *
 * **70, down from 140 and 260 before that.** Each cut has been the same complaint, and the last
 * one arrived with a reason the earlier ones did not have: `InkUI.button` now acts on the *press*,
 * so a footer button on the same screen fires the instant a finger lands while the cards above it
 * still wanted a seventh of a second on release. Two feels on one page reads as the cards being
 * broken, not as the cards being careful.
 *
 * Seventy is about four frames. A deliberate tap rests 80–150 ms, so it clears comfortably; the
 * brush this exists to stop — a finger passing over a card on its way to a flick — does not, and
 * neither does the tail of a scroll, which `scrollGestureConsumedTap` refuses on its own anyway.
 *
 * It is not zero, and that is a decision rather than an oversight. These cards spend a Power Draft,
 * appoint a seat, sign a law — irreversible, one tap, in a list the finger is already moving
 * through. The guard is what the hint below now says out loud.
 */
const CARD_HOLD_MS = 70;


export function optionCard(self: ConquestUIScene,
  bounds: UIBounds,
  opts: {
    title: string;
    body: string;
    note?: string;
    noteColor?: string;
    /**
     * What the choice costs, drawn as icon-and-figure chips between the body and the note.
     *
     * The prices used to arrive *as* the note — "168 vàng" in green prose under a paragraph of
     * green-adjacent prose — so the one figure that decides between two cards was the same shape
     * as everything else on them. The note keeps what it is for: a warning, a condition, a reason
     * the card is barred.
     */
    costs?: CostChip[];
    /** Width kept clear on the right (a portrait column), so text wraps before it. */
    reserveRight?: number;
    /** Glyph drawn in a left gutter. Resolved from the option id by `iconForOption`. */
    icon?: CardIconId;
    /** Story choices share generated motifs with the held decisions in the Chronicle. */
    iconArt?: 'story';
    accent: number;
    /**
     * Tints the whole card face with the accent at this alpha. Rarity's second voice: the
     * rail and badge said "jade" only to a player who already knew the code; a card whose
     * paper itself is washed green or gold reads at a glance, which is the point of rarity.
     */
    washAlpha?: number;
    badge?: string;
    disabled?: boolean;
    parent?: Phaser.GameObjects.Container;
    onTap: () => void;
    /**
     * How long the card must be held, when a page wants more than the rule. The reign-end
     * sequence asks 450 ms: the fork is the moment, the ring filling is the choice being made,
     * and there is no footer button on that page to make two feels of one page.
     */
    holdMs?: number;
  },
): Phaser.GameObjects.Container {
  const container = self.add.container(bounds.x, bounds.y);
  const alpha = opts.disabled ? 0.45 : 1;
  // A glyph shifts the whole text column right rather than overlapping it, so a card
  // with an icon wraps exactly as one without it does — the auto-fit height logic below
  // depends on the measured text being honest.
  const storyIcon = opts.icon && opts.iconArt === 'story' && isStoryChoiceIcon(opts.icon) ? opts.icon : undefined;
  // Reserve the same room even if an optional atlas download fails.
  const gutter = opts.icon ? STORY_CHOICE_ICON_SIZE + 12 : 0;
  const textX = 16 + gutter;
  const textWidth = bounds.width - 32 - gutter - (opts.reserveRight ?? 0);

  // Text first, panel afterwards — the card grows to fit what it holds.
  //
  // `bounds.height` used to be final, and a long description was simply clipped by it (this
  // comment used to admit as much). It is now a *minimum*: everything below measures Phaser's
  // real laid-out text height, exactly as `InkUI.card` does, and publishes the result on
  // `cardHeight` so a caller can stride by it instead of by a constant.
  const titleWidth = textWidth - (opts.badge ? BADGE_CLEARANCE : 0);
  const titleText = self.ui.label(textX, 10, opts.title, 'label', {
    fontSize: '14px',
    wordWrap: { width: titleWidth },
  }).setAlpha(alpha);
  container.add(titleText);

  // Body follows the title's *measured* height rather than a fixed offset: reserving width
  // for the badge means a long title can now wrap to two lines, and a hard-coded y drew the
  // body straight through the second one.
  const bodyText = self.ui.label(textX, 10 + titleText.height + 4, opts.body, 'body', {
    fontSize: '11px',
    color: INK_UI_HEX.mutedText,
    wordWrap: { width: textWidth },
  }).setAlpha(alpha);
  container.add(bodyText);

  // The note is pinned to the card's foot, so its height has to be reserved before the card's
  // own height is settled — and *measured*, not assumed.
  //
  // This reserved a flat 20px and drew the note at `height - 20`. One line fits in 20px and a
  // wrapped one does not, so any note long enough to wrap — which in Vietnamese is most of the
  // longer ones, the language running wider than the English it was laid out against — spilled
  // through the card's own border and over the card below it. Two separate screens reported it.
  // The price sits under the body and above the note, in the text column: measured first, so the
  // card's own height accounts for it exactly as it does for the wrapped lines above.
  const costsHeight = opts.costs?.length
    ? measureCostChips(self, opts.costs, textWidth) + 6
    : 0;
  const costsTop = bodyText.y + bodyText.height + 6;
  if (opts.costs?.length) {
    container.add(drawCostChips(self, opts.costs,
      { x: textX, y: costsTop, width: textWidth, muted: opts.disabled }));
  }

  const noteText = opts.note
    ? self.add.text(textX, 0, opts.note, {
      color: opts.noteColor ?? '#4c6b46',
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontStyle: '700',
      wordWrap: { width: bounds.width - 32 - textX + 16 },
    }).setAlpha(alpha)
    : undefined;
  const noteHeight = noteText ? noteText.height + 8 : 0;
  const contentBottom = bodyText.y + bodyText.height + 10 + costsHeight + noteHeight;
  const height = Math.max(bounds.height, contentBottom, storyIcon ? STORY_CHOICE_ICON_SIZE + 20 : 0);

  if (noteText) {
    noteText.setY(height - noteHeight);
    container.add(noteText);
  }

  // A thin ink contour, the same weight as every other line on the page — the accent is spent
  // on the rail down the left edge instead. A card outlined in its own accent reads as a
  // coloured box; a card on paper with one stamped edge reads as a choice.
  //
  // Inserted behind the text that has already been laid out, the same way `InkUI.card` does it.
  const surface = self.ui.panel(
    { x: 0, y: 0, width: bounds.width, height },
    { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: opts.disabled ? 0.3 : 0.52, muted: opts.disabled },
  );
  container.addAt(surface, 0);

  const rail = self.add.graphics();
  rail.fillStyle(opts.accent, alpha);
  rail.fillRect(1, 5, 4.5, height - 10);
  container.addAt(rail, 1);

  if (opts.washAlpha) {
    const wash = self.add.graphics();
    wash.fillStyle(opts.accent, opts.washAlpha * (opts.disabled ? 0.5 : 1));
    wash.fillRect(2, 2, bounds.width - 4, height - 4);
    // Above the paper, below the rail and everything written on the card.
    container.addAt(wash, 1);
  }

  if (opts.icon) {
    const size = STORY_CHOICE_ICON_SIZE;
    let glyph: Phaser.GameObjects.Image | Phaser.GameObjects.Container | undefined = storyIcon
      ? addStoryChoiceIcon(self, storyIcon) : undefined;
    if (!glyph) {
      glyph = drawCardIcon(self, opts.icon, opts.accent).setScale(size / CARD_ICON_SIZE);
      if (storyIcon) glyph.setData('storyChoiceIcon', {
        id: storyIcon, source: glyph.getData('conquestUiIcon')?.source ?? 'unavailable',
      });
    }
    glyph.setPosition(16 + size / 2, height / 2).setAlpha(alpha);
    container.addAt(glyph, 2);
  }

  // The badge sits top-right on the title's own line, so the title has to wrap before it.
  // Without this a longer title runs underneath and is clipped mid-word.
  if (opts.badge) {
    // A letter-spaced small-caps label rather than a filled chip. On paper a coloured pill reads
    // as a sticker pasted on the page; the accent survives as the ink colour instead.
    const badge = self.add.text(bounds.width - 12, 11, opts.badge.toLocaleUpperCase(), {
      color: cssHex(opts.accent),
      fontFamily: UI_FONT,
      fontSize: '9px',
      fontStyle: '700',
    }).setOrigin(1, 0).setAlpha(0.85);
    badge.setLetterSpacing?.(1.4);
    container.add(badge);
  }

  if (!opts.disabled) {
    const hit = self.add
      .rectangle(bounds.width / 2, height / 2, bounds.width, height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });

    // A prompt card has to be *held*, not tapped.
    //
    // These are the irreversible choices in the run — the power you draft, the champion you keep,
    // the province you commit to — and they sit under the finger in a list that scrolls. A stray
    // tap while reading spends a decision that cannot be taken back, and the scroll guard only
    // catches gestures that travelled; a clean accidental tap is indistinguishable from a
    // deliberate one *unless the interface asks for more*.
    //
    // Deliberately not applied to `laneList` rows: those are navigation, they can be undone by
    // going back, and making the player hold to open a screen would be tiresome. The rule is that
    // a hold guards a commitment, never a look.
    const fill = self.add.graphics();
    container.add(fill);
    let armedAt = 0;
    let timer: Phaser.Time.TimerEvent | undefined;

    const holdMs = opts.holdMs ?? CARD_HOLD_MS;
    const clearArm = () => {
      timer?.remove();
      timer = undefined;
      armedAt = 0;
      fill.clear();
    };
    const paintArm = (progress: number) => {
      fill.clear();
      if (progress <= 0) return;
      // A line growing along the foot of the card. It reads as the choice being made rather than
      // as a loading bar, and it tells the player the hold is the point.
      //
      // Four points tall rather than two and a half, and at full strength: at seventy milliseconds
      // the line is on screen for four frames, and a 2.5px hairline at 55% has no chance of being
      // seen in that time. If the guard is going to refuse a press it has to be visibly refusing.
      fill.fillStyle(opts.accent, 0.8);
      fill.fillRect(1, height - 5, (bounds.width - 2) * Math.min(1, progress), 4);
    };

    // Tell the page it contains something that has to be held — `drawHoldHint` prints the line
    // once, from `finish`, and only where a card like this was actually drawn.
    self.promptUsedHoldCards = true;

    hit.on('pointerdown', () => {
      armedAt = self.time.now;
      timer = self.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          // Ends itself when the finger lifts anywhere, rather than on `pointerout`. Clearing on
          // `pointerout` looked equivalent and was not: holding still scrolls the list a little,
          // the card moves under the stationary finger, Phaser reports the pointer as having left
          // it, and a press the player was still making was cancelled underneath them.
          if (!self.input.activePointer.isDown) {
            clearArm();
            return;
          }
          paintArm((self.time.now - armedAt) / holdMs);
        },
      });
    });
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const held = armedAt > 0 ? self.time.now - armedAt : 0;
      clearArm();
      // A drag that ends over this card scrolled the list; it did not choose it.
      if (scrollGestureConsumedTap(pointer)) {
        return;
      }
      if (held < holdMs) {
        // A press released early used to die without a trace, and a card that swallows taps
        // reads as broken. Leave the partial hold-line on screen for a beat so the player
        // sees the card responding — and sees that it wants to be held, not tapped.
        paintArm(held / holdMs);
        self.tweens.add({
          targets: fill,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            fill.clear();
            fill.setAlpha(1);
          },
        });
        return;
      }
      // The card, not the button: `optionCard` never went through `InkUI`, so every prompt card
      // in the mode was silent. Fired here rather than on the press, because here is where the
      // hold has actually been paid and the card is taken — a refused press stays quiet.
      soundDirector.card();
      opts.onTap();
    });
    container.add(hit);
  }

  container.setData('cardHeight', height);
  (opts.parent ?? self.modalLayer).add(container);
  return container;
}
