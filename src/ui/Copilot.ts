import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { sheetSpan } from '../game/cameraLayout';
import type { TranslationKey } from '../i18n';
import { getLanguage, setLanguage, t, type LanguageCode } from '../i18n';
import { drawLanguageFlag } from './languageFlags';
import { InkUI, INK_UI, INK_UI_HEX, type UIBounds } from './InkUI';
import { TITLE_FONT, UI_FONT } from './fonts';

export interface CopilotStep {
  id: string;
  heading: TranslationKey;
  body: TranslationKey;
  /**
   * What this card is about, as a rectangle on the page.
   *
   * A thunk rather than a value because the front page is laid out by flow — the column is
   * measured against the sheet's actual height and the language's actual line count — so nothing
   * on it has a y a caller could write down in advance. Returning `undefined` is legal and means
   * the card has no subject: the first and last steps are about the page as a whole.
   */
  target?: () => UIBounds | undefined;
  /**
   * Offers English and Tiếng Việt on this card.
   *
   * For the very first card of the front page's tour, and only for it. A tour is the first thing
   * a new player is shown and it is shown in whatever language the browser happened to default
   * to — so a Vietnamese speaker's introduction to the game is five cards of English, and the
   * switch that would fix it is a two-word line at the bottom of a page the tour is currently
   * covering with its own veil. The one moment the choice is most needed is the one moment the
   * usual control cannot be reached.
   */
  languagePicker?: boolean;
  /**
   * A drawing, between the paragraph and the buttons.
   *
   * For the one thing in this game that a paragraph genuinely cannot carry: which formation
   * answers which. The rule is a five-way ring, and the coach's only way of saying so in words was
   * "laid out in the ring order they beat each other in" — a sentence that describes a picture
   * instead of being one, and one nobody parses with a host closing on them.
   *
   * A thunk that draws into the card and reports its own height, so the card measures art the same
   * way it measures type. Everything it adds must be parented to the returned container: the card
   * is torn down and rebuilt on every step and on a language change, and a loose Graphics survives
   * both.
   */
  art?: (x: number, y: number, width: number) => {
    container: Phaser.GameObjects.Container;
    height: number;
  };
}

export interface CopilotOptions {
  steps: readonly CopilotStep[];
  /** The last card's second button. Omitted, the card carries only its finish button. */
  onGuide?: () => void;
  /**
   * What the final card's button says. Defaults to "Start playing".
   *
   * A walkthrough is several of these in sequence, one per moment of the run, and each is its own
   * `Copilot` — so every one of them thinks it is the last. Left to the default, a card explaining
   * the throne offers to start a game the player is already inside.
   */
  finishLabel?: TranslationKey;
  /** Finished or skipped, both. The caller marks it seen; the tour does not touch storage. */
  onClose: () => void;
  /**
   * The language was changed from the card, and the page underneath needs redrawing.
   *
   * Nothing in this game subscribes to `subscribeLanguageChange` — every existing switch simply
   * re-renders its own scene by hand — so without this the tour would come up in Vietnamese over a
   * front page still labelled in English, and stay that way until something else happened to
   * redraw it. The tour does not call `render` itself because it has no business knowing which
   * scene it is standing on.
   */
  onLanguage?: () => void;
}

/** Above every other thing either scene puts on the glass. */
const DEPTH = 900;
const CARD_WIDTH = GAME_WIDTH - 40;
const PAD = 16;

/**
 * The first-run tour: five cards that say what the front page is and how the game is played.
 *
 * **It exists because the front page is five buttons and a picture, and four of the five are not
 * self-explanatory to anyone who has not played this.** "Dragon Ascent" does not say *start here*,
 * "Classic Modes" does not say what a classic mode is, and the two most useful things on the page
 * for a new player — the manual and the language switch — are the two smallest marks on it. A
 * front page can be beautiful and still be a locked door.
 *
 * Five cards, and they are a hard limit rather than a starting point. A tour is a toll on the way
 * to the thing the player actually came for, and every card past the point where they have got the
 * idea is a card that teaches them to dismiss the next one unread. It is also shown exactly once,
 * skippable from the first card, and re-runnable from the manual — three different ways of saying
 * the same thing, which is that the player is allowed to not want this.
 *
 * The dim is drawn as four rectangles *around* the subject rather than one across the whole sheet
 * with a hole punched in it. Same picture, but Phaser has no even-odd fill and a `BlendModes.ERASE`
 * hole needs the veil on its own render texture — four rects is the version that cannot go wrong
 * on a device whose driver disagrees about blend modes.
 *
 * Input is blocked wholesale while the tour is up, including over the lit rectangle. A spotlight
 * that is also pressable turns a tour into a quiz, and the one thing a player must not have to do
 * here is guess which of the two overlapping interfaces is listening.
 */
export class Copilot {
  private readonly ui: InkUI;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private index = 0;
  private closed = false;

  constructor(private readonly scene: Phaser.Scene, private readonly opts: CopilotOptions) {
    this.ui = new InkUI(scene);
    this.renderStep();
  }

  destroy(): void {
    this.clear();
    this.closed = true;
  }

  private clear(): void {
    for (const object of this.objects) {
      object.destroy();
    }
    this.objects = [];
  }

  private close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.clear();
    this.opts.onClose();
  }

  private renderStep(): void {
    this.clear();
    const step = this.opts.steps[this.index];
    if (!step) {
      this.close();
      return;
    }
    const last = this.index === this.opts.steps.length - 1;
    const target = step.target?.();

    this.renderVeil(target);
    this.renderCard(step, target, last);
  }

  /** The dim, and the son frame round whatever this card is about. */
  private renderVeil(target?: UIBounds): void {
    const veil = this.scene.add.graphics().setDepth(DEPTH);
    veil.fillStyle(INK_UI.overlay, 0.82);
    // From the sheet's left edge, not the column's: on a page scene (the front page) that edge is
    // left of x = 0, and a veil laid from 0 left the landscape lit beside a dimmed page (`sheetSpan`).
    const { left, width } = sheetSpan(this.scene);
    if (!target) {
      veil.fillRect(left, 0, width, GAME_HEIGHT);
    } else {
      // 6 units of air round the subject, so the frame sits off the button rather than on it.
      const box = {
        x: target.x - 6,
        y: target.y - 6,
        width: target.width + 12,
        height: target.height + 12,
      };
      // The veil is the sheet's width: on the desktop the tour has to cover the map beside the
      // column too, or the lit rectangle is one bright patch in a half-dimmed window.
      veil.fillRect(left, 0, width, box.y);
      veil.fillRect(left, box.y + box.height, width, GAME_HEIGHT - box.y - box.height);
      veil.fillRect(left, box.y, box.x - left, box.height);
      veil.fillRect(box.x + box.width, box.y, left + width - box.x - box.width, box.height);
      veil.lineStyle(2, INK_UI.cinnabar, 0.9);
      veil.strokeRoundedRect(box.x, box.y, box.width, box.height, 10);
    }
    this.objects.push(veil);

    // Everything under the tour is deaf while it is up, the lit rectangle included.
    const blocker = this.scene.add
      .rectangle(left, 0, width, GAME_HEIGHT, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setDepth(DEPTH)
      .setInteractive();
    blocker.on('pointerdown', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation());
    this.objects.push(blocker);
  }

  /**
   * The card, placed clear of its subject.
   *
   * Below it if there is room, above it if there is not, and low on the sheet when the card has no
   * subject at all. Measured rather than chosen: the front page's column moves with the viewport
   * height and the language, so a card at a written-down y would sit on the very button it is
   * pointing at on some perfectly ordinary phone.
   */
  private renderCard(step: CopilotStep, target: UIBounds | undefined, last: boolean): void {
    const bodyWidth = CARD_WIDTH - PAD * 2;
    const heading = this.scene.add.text(0, 0, t(step.heading), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '17px',
      fontStyle: '700',
      wordWrap: { width: bodyWidth },
    });
    const body = this.scene.add.text(0, 0, t(step.body), {
      color: '#4a3b28',
      fontFamily: UI_FONT,
      fontSize: '12px',
      lineSpacing: 4,
      wordWrap: { width: bodyWidth },
    });

    const BUTTON_H = 34;
    // The picker's own row, when there is one: a line of type and the air around it.
    const LANGUAGE_ROW = step.languagePicker ? 30 : 0;
    /**
     * The drawing is made before the card is sized, because it is part of what the card has to fit.
     *
     * Its height is not knowable without drawing it — the counter table's row count is the ring's
     * own length — so it is measured exactly the way the paragraph is: build it, ask how tall, add
     * it up. Built at the origin and moved into place once `y` is known, because `y` is derived
     * from this very number.
     */
    const art = step.art?.(0, 0, bodyWidth);
    const ART_ROW = art ? art.height + 12 : 0;
    const height = PAD + heading.height + 6 + body.height + ART_ROW + LANGUAGE_ROW + 14
      + BUTTON_H + PAD;
    const x = (GAME_WIDTH - CARD_WIDTH) / 2;

    /**
     * The card lives at the foot of the sheet, and that is a reachability rule rather than a
     * layout preference.
     *
     * This is played one-handed. A card placed against the top of a 844-unit phone puts its
     * buttons about 780 units from the thumb — visible, explained, and impossible to press
     * without the other hand. It was doing exactly that for the cards that explain a decision,
     * where it had been moved so as not to cover the options it described.
     *
     * So the card is anchored to the bottom instead, always, and the connection to whatever it is
     * describing is made by the arrow below rather than by proximity. The one exception is a
     * subject that is itself at the foot — the action bar — where the card steps above it, which
     * still leaves the buttons within about seventy units of the bottom edge.
     */
    const GAP = 14;
    const foot = GAME_HEIGHT - height - 20;
    const targetIsLow = target ? target.y > GAME_HEIGHT - height - 40 : false;
    const y = Phaser.Math.Clamp(
      targetIsLow && target ? target.y - GAP - height : foot,
      16,
      Math.max(16, GAME_HEIGHT - height - 16),
    );

    const panel = this.ui.panel({ x, y, width: CARD_WIDTH, height }, {
      fill: INK_UI.parchment,
      fillShade: INK_UI.parchmentDark,
      border: INK_UI.brush,
      borderWidth: 2,
      radius: 10,
    }).setDepth(DEPTH + 1);
    this.objects.push(panel);

    /**
     * A stub of an arrow from the card to the thing it is about.
     *
     * With the card pinned to the foot and the subject often up at the header, the two can be six
     * hundred units apart, and a lit rectangle at one end of the screen with a paragraph at the
     * other is two unrelated things until something joins them. The arrow is drawn at the card's
     * edge and aligned with the subject's centre, so the eye is pointed the right way without a
     * line being dragged across the whole page.
     */
    if (target) {
      const pointsUp = target.y + target.height <= y;
      const tipX = Phaser.Math.Clamp(
        target.x + target.width / 2,
        x + 24,
        x + CARD_WIDTH - 24,
      );
      const arrow = this.scene.add.graphics().setDepth(DEPTH + 2);
      arrow.fillStyle(INK_UI.brush, 1);
      if (pointsUp) {
        arrow.fillTriangle(tipX - 9, y + 1, tipX + 9, y + 1, tipX, y - 11);
      } else if (target.y >= y + height) {
        arrow.fillTriangle(tipX - 9, y + height - 1, tipX + 9, y + height - 1, tipX, y + height + 11);
      }
      this.objects.push(arrow);
    }

    heading.setPosition(x + PAD, y + PAD).setDepth(DEPTH + 2);
    body.setPosition(x + PAD, heading.y + heading.height + 6).setDepth(DEPTH + 2);
    this.objects.push(heading, body);

    let cursor = body.y + body.height;
    if (art) {
      art.container.setPosition(x + PAD, cursor + 10).setDepth(DEPTH + 2);
      this.objects.push(art.container);
      cursor += ART_ROW;
    }

    if (step.languagePicker) {
      this.renderLanguagePicker(x, cursor + 12);
    }

    const row = y + height - PAD - BUTTON_H;

    // The counter, and the only thing on the card that is not a sentence or a button. It answers
    // the question a tour is always being asked, which is how much longer this goes on for.
    //
    // Omitted for a single card, where "1 of 1" answers a question nobody asked and reads as the
    // start of a sequence that never arrives.
    const counter = this.opts.steps.length > 1
      ? this.scene.add.text(x + PAD, row + BUTTON_H / 2, t('copilot.step', {
        n: this.index + 1,
        total: this.opts.steps.length,
      }), {
        color: INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '10px',
      }).setOrigin(0, 0.5).setDepth(DEPTH + 2)
      : undefined;
    if (counter) this.objects.push(counter);

    // Skip stays a quiet phrase rather than becoming a button, on every card including the last.
    // A tour whose exit is as loud as its Next is a tour that expects to be escaped from.
    const skip = this.ui.textLink(
      x + PAD + (counter ? counter.width + 12 : 0),
      row + BUTTON_H / 2,
      t('copilot.skip'),
      () => this.close(),
      { fontSize: '11px' },
    );
    skip.setDepth(DEPTH + 2);
    this.objects.push(skip);

    const advance = () => {
      this.index += 1;
      if (this.index >= this.opts.steps.length) {
        this.close();
        return;
      }
      this.renderStep();
    };

    // On the last card of a tour that has somewhere to send the player, the loud button IS that
    // offer and the quiet one is the exit. Everywhere else the loud button simply advances.
    const handing = last && Boolean(this.opts.onGuide);
    const nextWidth = handing ? 116 : 104;
    const nextX = x + CARD_WIDTH - PAD - nextWidth;
    const next = this.ui.button(
      { x: nextX, y: row, width: nextWidth, height: BUTTON_H },
      handing ? t('copilot.playNow')
        : last ? t(this.opts.finishLabel ?? 'copilot.done')
        : t('copilot.next'),
      handing
        ? () => {
          const open = this.opts.onGuide;
          this.close();
          open?.();
        }
        : last ? () => this.close() : advance,
      { variant: 'primary', fontSize: '13px' },
    ).setDepth(DEPTH + 2);
    this.objects.push(next);

    // The exit, as a button rather than as the quiet phrase — on this one card it stands beside a
    // real offer and is a real choice, not an escape hatch from a tour.
    if (handing) {
      const closeWidth = 88;
      this.objects.push(this.ui.button(
        { x: nextX - 8 - closeWidth, y: row, width: closeWidth, height: BUTTON_H },
        t('copilot.close'),
        () => this.close(),
        { variant: 'ghost', fontSize: '12px' },
      ).setDepth(DEPTH + 2));
      // Skip would be a third way to do what Close already does, in less room than either deserves.
      skip.setVisible(false);
    }
  }

  /**
   * Tiếng Việt · English, centred on the card, with platform-independent flags.
   *
   * Drawn as two pressable words rather than as buttons, the same way the front page draws the
   * same choice — this is a preference, not an action the tour is asking for, and two more
   * buttons on a card that already has two would read as four things to decide between.
   *
   * Switching re-renders the card in place rather than restarting the tour: the player stays on
   * the step they were reading, in the language they just asked for. `setLanguage` also tells the
   * scene underneath, which redraws its own labels; the tour survives that because it is not part
   * of the scene's content.
   */
  private renderLanguagePicker(cardX: number, y: number): void {
    const current = getLanguage();
    const options: Array<{ id: LanguageCode; label: string }> = [
      { id: 'vi', label: 'Tiếng Việt' },
      { id: 'en', label: 'English' },
    ];

    const labels = options.map((option) => this.scene.add.text(0, y, option.label, {
      color: option.id === current ? '#3a2a14' : INK_UI_HEX.mutedText,
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: option.id === current ? '700' : '400',
    }).setOrigin(0, 0).setDepth(DEPTH + 2));
    const FLAG_WIDTH = 22;
    const FLAG_GAP = 6;
    const OPTION_GAP = 18;
    const widths = labels.map((label) => FLAG_WIDTH + FLAG_GAP + label.width);
    const total = widths[0] + OPTION_GAP + widths[1];
    let cursor = cardX + CARD_WIDTH / 2 - total / 2;

    labels.forEach((label, index) => {
      const option = options[index];
      const width = widths[index];
      const flag = drawLanguageFlag(this.scene, option.id, FLAG_WIDTH, 14)
        .setPosition(cursor + FLAG_WIDTH / 2, y + label.height / 2)
        .setDepth(DEPTH + 2);
      label.setX(cursor + FLAG_WIDTH + FLAG_GAP);
      this.objects.push(flag, label);

      const hit = this.scene.add
        .rectangle(cursor + width / 2, y + label.height / 2, width + 12, 34, 0xffffff, 0.001)
        .setData('languageOption', option.id)
        .setDepth(DEPTH + 2);
      if (option.id !== current) {
        hit.setInteractive({ useHandCursor: true });
        hit.on('pointerup', (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          setLanguage(option.id);
          // The page first, then the card on top of it — the scene's re-render tears down its own
          // content, and the card is not part of that content, so the order only matters for what
          // the player sees flash.
          this.opts.onLanguage?.();
          this.renderStep();
        });
      }
      this.objects.push(hit);
      cursor += width + OPTION_GAP;
    });
  }
}
