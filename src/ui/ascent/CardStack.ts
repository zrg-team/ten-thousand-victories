/**
 * A deck of choices held in one hand: the front card is read, the ones behind it are peeked, and
 * the whole decision is made with the thumb.
 *
 * The mode draws champions three or four at a time, and a list of three full cards does not fit a
 * 390-wide phone — the founder screen was already a one-card carousel with arrows because of it.
 * This is that carousel finished: a real stack you can see the depth of, a sideways flick to see
 * another, and a flick *up* to take the one you are holding. Buttons still do everything the
 * gestures do; the gestures are the fast path, never the only path.
 *
 * ## Why the pointer stream, not Phaser's drag system
 *
 * `input.topOnly` is on and every card lays a full-bleed hit rectangle over itself, so a `Zone`
 * placed above the stack is not reliably the drag candidate (`InkScrollArea` documents the same
 * trap and solves it the same way). Filtering `scene.input`'s own pointer events by our bounds in
 * *design* space is exact, survives any render scale, and never fights a card's tap handler.
 */
import Phaser from 'phaser';
import { localPointer } from '../../game/graphicsQuality';
import { soundDirector } from '../sound/SoundDirector';
import { PIGMENT } from '../ink/palette';

export interface CardStackOptions {
  /** Top-left of the front card, in design units. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** One card per option, each laid out from its own (0, 0) at exactly `width` × `height`. */
  cards: Phaser.GameObjects.Container[];
  /** A card was flicked up, or the caller's confirm button was pressed. */
  onSelect: (index: number) => void;
  /** The front card changed. Fired for every browse, so a caller can repaint dots or a footer. */
  onBrowse?: (index: number) => void;
}

/** How the three visible cards sit: the front flat, the rest fanned below it. */
const RANKS = [
  { dx: 0, dy: 0, scale: 1, rotation: 0, alpha: 1 },
  { dx: 6, dy: 13, scale: 0.955, rotation: 0.032, alpha: 0.92 },
  { dx: -7, dy: 25, scale: 0.912, rotation: -0.034, alpha: 0.74 },
];

/** Room the fanned cards claim below the front one. Callers add this to the front card's height. */
export const CARD_STACK_PEEK = RANKS[RANKS.length - 1].dy + 6;

/** Travel that turns a drag into a decision. About a thumb's comfortable arc, not a swipe of the arm. */
const SIDE_THRESHOLD = 52;
const LIFT_THRESHOLD = 58;

export class CardStack {
  readonly view: Phaser.GameObjects.Container;

  private readonly holders: Phaser.GameObjects.Container[] = [];
  private readonly cue: Phaser.GameObjects.Graphics;
  private index = 0;
  private drag?: { x: number; y: number; id: number };
  /** True while a card is flying. A second gesture mid-flight would select the wrong champion. */
  private busy = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: CardStackOptions,
  ) {
    const { x, y, width, height, cards } = opts;
    this.view = scene.add.container(x + width / 2, y + height / 2);

    for (const card of cards) {
      const holder = scene.add.container(0, 0);
      card.setPosition(-width / 2, -height / 2);
      holder.add(card);
      this.view.add(holder);
      this.holders.push(holder);
    }

    // The lift cue: a gold edge that comes up under the thumb as the card clears the threshold, so
    // "up means take this one" is learned on the first attempt rather than read in the hint.
    this.cue = scene.add.graphics();
    this.cue.lineStyle(3, PIGMENT.hoe, 1);
    this.cue.strokeRoundedRect(-width / 2 - 2, -height / 2 - 2, width + 4, height + 4, 10);
    this.cue.setAlpha(0);

    this.layout();

    const onDown = (pointer: Phaser.Input.Pointer): void => {
      if (this.busy || this.drag) return;
      const at = localPointer(scene, pointer);
      // Against where the stack actually is: on the desktop the modal layer it sits in is centred
      // on a wider sheet, and `x`/`y` are the layer's own numbers.
      const world = this.view.getWorldTransformMatrix();
      const left = world.tx - width / 2;
      const top = world.ty - height / 2;
      if (at.x < left - 8 || at.x > left + width + 8 || at.y < top - 8 || at.y > top + height + CARD_STACK_PEEK) return;
      this.drag = { x: at.x, y: at.y, id: pointer.id };
    };
    const onMove = (pointer: Phaser.Input.Pointer): void => {
      if (!this.drag || this.drag.id !== pointer.id || !pointer.isDown) return;
      const at = localPointer(scene, pointer);
      const dx = at.x - this.drag.x;
      const dy = at.y - this.drag.y;
      const front = this.holders[this.index];
      front.setPosition(dx, Math.min(dy, dy * 0.35));
      front.setRotation(Phaser.Math.Clamp(dx / 420, -0.3, 0.3));
      this.cue.setAlpha(dy < 0 ? Phaser.Math.Clamp(-dy / LIFT_THRESHOLD, 0, 1) : 0);
    };
    const onUp = (pointer: Phaser.Input.Pointer): void => {
      if (!this.drag || this.drag.id !== pointer.id) return;
      const at = localPointer(scene, pointer);
      const dx = at.x - this.drag.x;
      const dy = at.y - this.drag.y;
      this.drag = undefined;
      this.release(dx, dy);
    };

    scene.input.on('pointerdown', onDown);
    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup', onUp);
    scene.input.on('pointerupoutside', onUp);
    // The scene tears the modal layer down with `removeAll(true)`; without this the handlers stay
    // hooked to a dead stack and the next prompt's first swipe reaches into destroyed containers.
    this.view.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.input.off('pointerdown', onDown);
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      scene.input.off('pointerupoutside', onUp);
    });
  }

  /** Which option is face up. */
  get current(): number {
    return this.index;
  }

  get count(): number {
    return this.holders.length;
  }

  /** Take the card that is face up — what the confirm button calls. */
  select(): void {
    if (this.busy) return;
    this.lift(() => this.opts.onSelect(this.index));
  }

  /** Step the deck without a gesture — what the side arrows call. */
  browse(step: number): void {
    if (this.busy || this.holders.length < 2) return;
    this.flyOut(step > 0 ? -1 : 1, () => this.advance(step));
  }

  private release(dx: number, dy: number): void {
    if (-dy >= LIFT_THRESHOLD && -dy >= Math.abs(dx)) {
      // At the lift, not at the callback: the sound belongs to the card leaving the deck, which
      // is what the player just did, and `lift` runs an animation before it reports.
      soundDirector.card();
      this.lift(() => this.opts.onSelect(this.index));
      return;
    }
    if (Math.abs(dx) >= SIDE_THRESHOLD && this.holders.length > 1) {
      const direction = dx > 0 ? 1 : -1;
      // **Either flick brings up the card you can see behind this one.**
      //
      // It used to walk backwards on a right flick, on the reasoning that a deck browses both
      // ways. The fan does not: `layout` always peeks `index + 1` and `index + 2`, so a right
      // flick showed you card B under your thumb and then dealt you card C. Reported exactly that
      // way — *hold card A, bottom shows card B, swipe and it shows card C.*
      //
      // A peek that lies about what the gesture will do is worse than losing one direction of
      // travel, and the arrows either side of the dots still walk the deck both ways for anyone
      // who wants to go back. So both flicks advance, and what you saw is what you get.
      this.flyOut(direction, () => this.advance(1));
      return;
    }
    this.settle();
  }

  private settle(): void {
    const front = this.holders[this.index];
    this.scene.tweens.add({
      targets: front, x: 0, y: 0, rotation: 0, duration: 180, ease: 'Back.Out',
    });
    this.scene.tweens.add({ targets: this.cue, alpha: 0, duration: 140 });
  }

  private lift(then: () => void): void {
    this.busy = true;
    const front = this.holders[this.index];
    this.scene.tweens.add({
      targets: this.cue, alpha: 0, duration: 200,
    });
    this.scene.tweens.add({
      targets: front,
      y: front.y - (this.opts.height + 160),
      alpha: 0,
      scale: 1.04,
      duration: 240,
      ease: 'Quad.In',
      onComplete: then,
    });
  }

  private flyOut(direction: number, then: () => void): void {
    this.busy = true;
    const front = this.holders[this.index];
    this.scene.tweens.add({ targets: this.cue, alpha: 0, duration: 120 });
    this.scene.tweens.add({
      targets: front,
      x: direction * (this.opts.width + 180),
      rotation: direction * 0.34,
      alpha: 0,
      duration: 200,
      ease: 'Quad.In',
      onComplete: () => {
        // Straight back to the bottom of the deck, invisible until `layout` gives it a rank.
        front.setPosition(0, 0).setRotation(0).setAlpha(0).setVisible(false);
        then();
      },
    });
  }

  private advance(step: number): void {
    const count = this.holders.length;
    this.index = (this.index + step + count) % count;
    this.busy = false;
    this.layout();
    this.opts.onBrowse?.(this.index);
  }

  /**
   * Places every card by its distance from the front, and paints back-to-front.
   *
   * `setDepth` inside a container is silently a no-op — a Container is a display list of its own
   * — so the order has to be the child order, which is what `bringToTop` fixes here.
   */
  private layout(): void {
    const count = this.holders.length;
    for (let rank = RANKS.length - 1; rank >= 0; rank -= 1) {
      if (rank >= count) continue;
      const holder = this.holders[(this.index + rank) % count];
      const spec = RANKS[rank];
      holder.setVisible(true);
      holder.setPosition(spec.dx, spec.dy);
      holder.setRotation(spec.rotation);
      holder.setScale(spec.scale);
      holder.setAlpha(spec.alpha);
      this.view.bringToTop(holder);
    }
    // Anything deeper than the third card is behind two others and would only cost fill rate.
    for (let step = RANKS.length; step < count; step += 1) {
      this.holders[(this.index + step) % count].setVisible(false);
    }
    const front = this.holders[this.index];
    front.add(this.cue);
    this.cue.setAlpha(0);
  }
}
