import Phaser from 'phaser';
import { GAME_HEIGHT, ACTION_BAR_HEIGHT, surfaceWidth } from '../../game/constants';
import { t } from '../../i18n';
import type { GameState } from '../../state/types';
import type { Advice } from '../../systems/ascent/Advisor';
import { INK_UI, InkUI } from '../InkUI';
import { UI_FONT } from '../fonts';

/**
 * The bar's dot, spoken: a small card over the lane the advisor wants pressed, with an arrow
 * down to its icon, that says what to do there and goes away on its own.
 *
 * The dot on a lane button says *something is behind this*; it does not say what, and a player
 * who has not learned the six lanes reads a lit button as decoration. The advisor strip says what
 * — at the top of the screen, a thumb's length from the button it is talking about. This puts
 * the sentence where the finger is going: *"the bar highlight should be a small popover, an
 * arrow to the icon, showing the recommended action, and hide after a few seconds"*.
 *
 * It follows the strip's own reading (`AdvisorStrip.shown`), so the two never disagree, and it
 * shows once per piece of advice: a new recommendation raises it, the same one does not raise it
 * again after it has faded. Deliberately not a control — the button under the arrow is the
 * control, and anything tappable floating over the map has to be excluded from the map's own tap
 * handling. The run's ledger sheet has a switch for it (`barHintsMuted`).
 */

const SHOW_MS = 6500;
const WIDTH_MAX = 216;
const PAD = 9;
const ARROW_W = 12;
const ARROW_H = 7;
const GAP_ABOVE_BAR = 6;
/** Above the bar (420) and the chip (432), under the paused badge's sheet (500). */
const DEPTH = 436;

export class BarHint {
  private readonly ui: InkUI;
  private root: Phaser.GameObjects.Container;
  private plate?: Phaser.GameObjects.Graphics;
  private arrow: Phaser.GameObjects.Graphics;
  private line: Phaser.GameObjects.Text;
  private shownId = '';
  private up = false;
  private hideAt?: Phaser.Time.TimerEvent;
  private drawnKey = '';
  private plateTop?: number;

  /** `onChange` fires when the card goes up or comes down, so the chip beside it can make room. */
  constructor(private readonly scene: Phaser.Scene, private readonly onChange?: () => void) {
    this.ui = new InkUI(scene);
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setVisible(false).setAlpha(0);
    this.arrow = scene.add.graphics();
    this.line = scene.add.text(0, 0, '', {
      color: '#2a2118',
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontStyle: '700',
      lineSpacing: 2,
      wordWrap: { width: WIDTH_MAX - PAD * 2 },
    });
    this.root.add([this.arrow, this.line]);
  }

  /**
   * Called on every HUD refresh with the strip's current advice and the bar's geometry.
   * `hidden` is the HUD's own hidden state — a prompt or a page owns the screen.
   */
  render(
    state: GameState,
    advice: Advice | undefined,
    slotBounds: (action: string) => { x: number; y: number; width: number; height: number } | undefined,
    hidden: boolean,
  ): void {
    const muted = state.ascent?.barHintsMuted ?? false;
    if (hidden || muted || !advice?.lane) {
      this.lower();
      return;
    }
    const slot = slotBounds(advice.lane);
    if (!slot) {
      this.lower();
      return;
    }
    // Once per piece of advice. The same recommendation standing for a minute is the strip's job.
    let raised = false;
    if (advice.id !== this.shownId) {
      this.shownId = advice.id;
      this.raise();
      raised = true;
    }
    if (!this.up) return;

    // The top strip carries the event. This short signpost only names the lane to press.
    const text = t(`action.${advice.lane}` as Parameters<typeof t>[0]);
    const centreX = slot.x + slot.width / 2;
    const key = `${text}|${Math.round(centreX)}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const heightBefore = this.plateTop;

    this.line.setText(text);
    const width = Math.min(WIDTH_MAX, Math.ceil(this.line.width) + PAD * 2);
    const height = Math.ceil(this.line.height) + PAD * 2;
    const barTop = GAME_HEIGHT - ACTION_BAR_HEIGHT;
    const bottom = barTop - GAP_ABOVE_BAR - ARROW_H;
    const top = bottom - height;
    this.plateTop = top;
    // Centred on the lane, held inside the sheet: the outer lanes would otherwise hang off it.
    const x = Math.round(Math.min(surfaceWidth() - 8 - width, Math.max(8, centreX - width / 2)));

    this.plate?.destroy();
    this.plate = this.ui.panel({ x, y: top, width, height }, {
      border: INK_UI.gold, borderAlpha: 0.9, borderWidth: 1.3, fillAlpha: 0.98, cut: 4,
    });
    this.root.addAt(this.plate, 0);
    this.line.setPosition(x + PAD, top + PAD);

    // The arrow: the plate's own paper, pointing at the icon it is about.
    this.arrow.clear();
    const ax = Math.round(Math.min(x + width - PAD - ARROW_W / 2, Math.max(x + PAD + ARROW_W / 2, centreX)));
    this.arrow.fillStyle(INK_UI.parchment, 0.98);
    this.arrow.fillTriangle(ax - ARROW_W / 2, bottom - 1, ax + ARROW_W / 2, bottom - 1, ax, bottom + ARROW_H);
    this.arrow.lineStyle(1.3, INK_UI.gold, 0.9);
    this.arrow.beginPath();
    this.arrow.moveTo(ax - ARROW_W / 2, bottom);
    this.arrow.lineTo(ax, bottom + ARROW_H);
    this.arrow.lineTo(ax + ARROW_W / 2, bottom);
    this.arrow.strokePath();

    // Told after the plate exists, because the listener reads `top()`.
    if (raised || heightBefore !== top) this.onChange?.();
  }

  private raise(): void {
    this.up = true;
    this.drawnKey = '';
    this.root.setVisible(true);
    this.scene.tweens.killTweensOf(this.root);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 180, ease: 'Quad.easeOut' });
    this.hideAt?.remove();
    this.hideAt = this.scene.time.delayedCall(SHOW_MS, () => this.lower());
  }

  private lower(): void {
    if (!this.up) return;
    this.up = false;
    this.hideAt?.remove();
    this.hideAt = undefined;
    this.scene.tweens.killTweensOf(this.root);
    this.scene.tweens.add({
      targets: this.root, alpha: 0, duration: 240, ease: 'Quad.easeIn',
      onComplete: () => { if (!this.up) this.root.setVisible(false); },
    });
    this.onChange?.();
  }

  /** The card's top edge while it is up, so the chip can stand above it rather than through it. */
  top(): number | undefined {
    return this.up ? this.plateTop : undefined;
  }

  /** Whether the card is up right now. */
  isUp(): boolean {
    return this.up;
  }

  /** Test seam: what the card is saying, or nothing. */
  shown(): string | undefined {
    return this.up ? this.line.text : undefined;
  }

  destroy(): void {
    this.hideAt?.remove();
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy();
  }
}
