import Phaser from 'phaser';
import { cachedText } from './cachedText';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { sheetSpan } from '../game/cameraLayout';
import { addPressFeedback } from './animations';
import {
  installPressWatch, liftForInput, markControlBorn, noteControlFired, pressIsEchoOnto, releaseNotOwnedBy, sheetIsUp, insideSheet } from './inputGeneration';
import { CARD_ICON_SIZE, drawCardIcon, type CardIconId } from './CardIcons';
import { addConquestUiIcon } from './conquestUiIcons';
import { UI_FONT } from './fonts';
import { RectClip } from './ink/clipRect';
import { PIGMENT } from './ink/palette';
import {
  CAPTION_FONT as CHIP_CAPTION_FONT, drawCostChips, measureChipCaption, measureCostChips, type CostChip,
} from './costChips';
import { inkPath, mulberry32, washFill, type Pt } from './ink/stroke';
import { designLength, localPointer } from '../game/graphicsQuality';
import { isDesktopPlatform } from '../platform/layout';
import { t } from '../i18n';
import { applyStamp, placeStamp, stampDesign, type Stamp } from './ink/stamp';
import { soundDirector } from './sound/SoundDirector';
import { InkVirtualList, measureInkText } from './InkVirtualList';

/**
 * A printed surface: a sheet of paper with a hand-pulled contour round it.
 *
 * Every panel, card, button and tile in the game goes through this, which is why the interface
 * stopped being a set of rounded rectangles with new colours in them and became the same printed
 * object as the map. The rectangle's own corners are cut a little, the edge wobbles, and the fill
 * is registered a hair off its outline the way a colour block is.
 */
function printedSurface(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  opts: {
    fill?: number;
    fillAlpha?: number;
    border?: number;
    borderAlpha?: number;
    borderWidth?: number;
    seed?: number;
    /** Cut corners read as a torn sheet; 0 gives a plain rectangle. */
    cut?: number;
    shadow?: boolean;
  } = {},
): void {
  const cut = opts.cut ?? Math.min(2, Math.min(width, height) * 0.06);
  const seed = opts.seed ?? Math.round(width * 31 + height * 7);
  const sheet: Pt[] = [
    { x: cut, y: 0 }, { x: width - cut, y: 0 },
    { x: width, y: cut }, { x: width, y: height - cut },
    { x: width - cut, y: height }, { x: cut, y: height },
    { x: 0, y: height - cut }, { x: 0, y: cut },
  ];

  if (opts.shadow === true) {
    g.fillStyle(PIGMENT.muc, 0.05);
    g.fillPoints(sheet.map((p) => ({ x: p.x + 1.5, y: p.y + 2.5 })), true);
  }
  // The registration offset is what separates a card from the sheet under it.
  //
  // A Đông Hồ print is pulled colour-block first, contour-block last, and the two never land in
  // perfect register — so a sliver of the colour sits outside its own outline. At 0.35 that sliver
  // was sub-pixel and the card read as cream on cream. At 0.6 it is about a pixel of ground showing
  // along two edges, which is the medium's own way of saying "this is a separate sheet" — and it
  // costs nothing, unlike the drop shadow this replaces the need for.
  washFill(g, sheet, opts.fill ?? INK_UI.parchment, seed, opts.fillAlpha ?? 1, 0.6);
  inkPath(g, sheet, seed + 1, {
    width: opts.borderWidth ?? 1.8,
    alpha: opts.borderAlpha ?? 0.8,
    colour: opts.border ?? PIGMENT.muc,
    wobble: 0.3,
    step: 17,
    bleed: 0.12,
    closed: true,
  });
}

/**
 * The way back: one width, one height, one place, on every page in the game.
 *
 * Taken from the classic-modes page, which had it right — an inset bar at the foot with a chevron
 * in the label. Everywhere else had its own version: two pages put a 64x28 ghost button in the
 * top-left corner, out of a thumb's reach entirely, and the three that were already at the foot
 * ran the full width of the sheet at three different heights.
 *
 * The size is the classic page's own, to the point: 282 wide, and 44 through that page's vertical
 * scale — 39 on an 844 sheet. Copied as a formula rather than as a number so the reference page
 * renders exactly what it always did and every other page now renders the same thing.
 */
export const BACK_BAR_WIDTH = 282;
/** `MenuScene.vh(44)`, lifted verbatim. `GAME_HEIGHT` is fixed for the life of the page. */
export const BACK_BAR_HEIGHT = Math.round(
  44 * Math.max(0.62, Math.min(1, (GAME_HEIGHT - 148) / 790)),
);
/** What a page has to keep clear at its foot to sit the bar there. */
export const BACK_BAR_BAND = BACK_BAR_HEIGHT + 12;

export interface UIBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The interface palette, retuned to the Đông Hồ pigments.
 *
 * Every panel, modal, button and bar in the game reads from this table, so retuning it here is what
 * makes the chrome agree with the map rather than sitting on top of it in a different world. The
 * keys keep their old names — `parchment`, `cinnabar`, `gold` — because a hundred call sites use
 * them and renaming would be churn for nothing; only the values move, each to the pigment nearest
 * it: bamboo-soot black for the ground, điệp for the paper, sỏi son for the red, hoa hòe for gold.
 */
export const INK_UI = {
  // The chrome sits ON the paper, not on a slab of near-black floating over it. Every bar, header
  // and modal ground in the game reads from these two, and flipping them here is what stops the
  // interface looking like a different product bolted onto the map.
  backgroundInk: PIGMENT.diepHi,
  /** A sheet of paper laid over the world, not a blackout. The map stays faintly readable under it. */
  overlay: PIGMENT.diep,
  parchment: PIGMENT.diepHi,
  parchmentShade: PIGMENT.diep,
  parchmentDark: PIGMENT.diepLo,
  inkText: '#2a2118',
  mutedText: '#5a4c39',
  /** Text on a saturated ground — a sỏi son button, a stamped seal. Not for use on paper. */
  lightText: '#fbf2df',
  brush: PIGMENT.muc,
  softBrush: PIGMENT.mucSoft,
  jade: PIGMENT.giDong,
  cinnabar: PIGMENT.son,
  cinnabarDark: PIGMENT.sonDeep,
  gold: PIGMENT.hoe,
  goldLight: PIGMENT.hoePale,
};

export const INK_UI_HEX = {
  inkText: '#2a2118',
  mutedText: '#5a4c39',
  lightText: '#fbf2df',
  /**
   * `PIGMENT.sonDeep`, as CSS.
   *
   * The lead word of a tip is set in it on all three surfaces that print one — the launch
   * splash's inline stylesheet, the loading page, and the menu's tip card — and two of those are
   * DOM, which cannot read a number. Written once here so the three cannot drift apart.
   */
  cinnabarDeep: '#8a2a1b',
};

export type InkButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'disabled';

export interface InkButtonOptions {
  variant?: InkButtonVariant;
  fontSize?: string;
  radius?: number;
  extraHitPadding?: number;
  /**
   * A quieter second line printed under the label, inside the same button.
   *
   * For the note that only exists to qualify the button it sits under — "no saved campaign" beneath
   * Continue. Drawn as its own row of text on the page, that note costs a gap above it, a gap below
   * it and a line of its own on a sheet that may only be 620 tall; folded in here it costs the few
   * units the button grows by, and it greys out with the button instead of contradicting it.
   */
  subLabel?: string;
  /**
   * A glyph inked immediately left of the label, as one centred group with it.
   *
   * Inline rather than pinned to the left edge on purpose: the primary variant already prints a
   * flourish about sixteen units in from each end, and an icon parked at a left inset lands on top
   * of it. Grouping the glyph with the type also means a short label and a long one both stay
   * centred, which a left-pinned icon and a centred label do not.
   */
  icon?: CardIconId;
  /**
   * Drops the printed surface and leaves only what the caller puts inside it.
   *
   * For a control whose whole meaning is one glyph — Pause, the run menu. A frame around a mark
   * that is already a mark says nothing the mark did not: it draws a box, a border and a shade
   * per control, and on a bar of eight labelled buttons those two extra boxes are the only
   * things on it that are pure chrome. Everything else about the button survives — the hit
   * rectangle, the scroll-tap guard, the press tween — so a frameless control is still a
   * button in every way a finger can tell.
   */
  frameless?: boolean;
}

export interface InkTextLinkOptions {
  fontSize?: string;
  /** The glyph inked to the left of the phrase. Without one the phrase stands alone. */
  icon?: CardIconId;
  /** The phrase at rest. */
  color?: number;
  /** The glyph, the rule, and what the phrase turns into under the finger. */
  accent?: number;
}

export interface InkSurfaceOptions {
  fill?: number;
  fillShade?: number;
  fillAlpha?: number;
  border?: number;
  borderAlpha?: number;
  borderWidth?: number;
  /**
   * **Ignored.** The corner comes from `printedSurface`; pass `cut` to change it.
   *
   * Kept because four call sites pass it, and honouring it now would silently re-cut their
   * corners - two of them ask for 12 against the 7 they have been drawn with since they were
   * written.
   */
  radius?: number;
  /**
   * Corner cut, in points. `0` is a plain rectangle.
   *
   * The default takes a small diagonal off each corner, which is what makes a panel read as a torn
   * sheet of paper. A surface that runs to the edge of the screen is not a sheet on a table and
   * should not be cut: the diagonals leave four notches of bare page at the corners.
   */
  cut?: number;
  muted?: boolean;
  ornaments?: boolean;
}

export interface InkCardRow {
  label: string;
  value: string;
}

export interface InkCardOptions extends InkSurfaceOptions {
  cacheText?: boolean;
  title?: string;
  subtitle?: string;
  status?: string;
  /**
   * A stat badge in the card's top-right corner: a small printed plate carrying one figure and
   * the two words that qualify it.
   *
   * The `status` mark above is deliberately a label and not a pill, and that still holds for what
   * it is for — a one-word state like BUSY belongs in the page's own ink. A *number* is a
   * different thing: it has to be found at a glance across a list of rows and compared with the
   * one two rows down, and a run of type in a paragraph is the one shape that cannot be. So the
   * badge is built like a cell of `statPanel` — caption over figure, the composition this page
   * already uses for its four headline numbers at the top — and hung in the corner where a
   * reader's eye goes for the row's verdict.
   *
   * `caption` heads the figure, `value` is the figure, and `note` is the small line under it.
   * `tone` inks the plate's border and the note: gold for something worth protecting, quiet
   * brush for something ordinary.
   */
  badge?: { caption: string; value: string; note?: string; tone?: number };
  /**
   * The status mark's ink. Cinnabar by default, because a mark on a row is usually a warning —
   * but not always: a veteran host's rank is the opposite of a warning and must not be printed in
   * the colour the page uses for "this is going wrong". Colour only; the layout is unaffected, so
   * `measureCard` neither knows nor needs to know about this.
   */
  statusColor?: number;
  rows?: InkCardRow[];
  /**
   * The row's price, drawn as icon-and-figure chips under everything else it says.
   *
   * A cost belongs in `costs`, never in the subtitle: spelled into the prose it reads at the
   * same weight as the sentence around it, and a list of rows becomes a list of paragraphs to
   * be read rather than prices to be compared. See `costChips`.
   */
  costs?: CostChip[];
  /**
   * A small caption over the chip strip, for figures that are not a price — a province's yield
   * per season, a focus's tilt. Omitted for a cost, where the chips need no introduction.
   */
  costsLabel?: string;
  body?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: InkButtonVariant;
    disabled?: boolean;
  };
  actionPlacement?: 'right' | 'bottom';
}

export interface InkModalOptions {
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: number;
  height?: number;
}

export interface InkModalResult {
  objects: Phaser.GameObjects.GameObject[];
  panelBounds: UIBounds;
  contentBounds: UIBounds;
  footerBounds: UIBounds;
}

export interface InkScrollAreaOptions {
  wheelStep?: number;
}

/**
 * How far a finger may travel before the gesture stops being a tap and becomes a scroll.
 *
 * In design units, so it means the same thing at every render scale.
 *
 * **This was 6, and 6 is a mouse number.** A finger on glass rolls further than that on a perfectly
 * ordinary tap — so on a phone almost every tap crossed the threshold, was classified as a scroll,
 * and was swallowed. The list scrolled beautifully and nothing in it could be opened: tapping a
 * province on the Build page did nothing at all. Twenty units is about a fingertip's width and
 * still far short of a deliberate drag.
 */
const SCROLL_TAP_SLOP = 20;
/** The data key an `InkScrollArea` stamps on its content container. */
const SCROLL_CONTENT_KEY = 'inkScrollContent';

/**
 * Whether an object is inside a scrolling list — any ancestor is a scroll area's content.
 *
 * Asked at press time rather than at creation: a button is built first and added to a list after,
 * so the only moment it can know where it lives is when it is pressed.
 */
export function insideScrollList(target: Phaser.GameObjects.GameObject): boolean {
  let node = (target as Phaser.GameObjects.GameObject & { parentContainer?: Phaser.GameObjects.Container | null }).parentContainer;
  while (node) {
    if (node.getData?.(SCROLL_CONTENT_KEY)) return true;
    node = node.parentContainer;
  }
  return false;
}

/**
 * How a flick decays, per 60 Hz frame.
 *
 * The list used to stop dead the instant the finger left the glass: a drag tracked one-for-one and
 * then simply ended, which is why it read as heavy and unlike every other list on the phone. 0.94
 * a frame is about half a second of glide from a hard flick — long enough to throw a long list,
 * short enough that it never feels like it got away from you.
 */
const SCROLL_FRICTION = 0.94;
/** Below this — a fifth of a unit a frame — the glide has stopped and the tail is just noise. */
const SCROLL_MIN_FLICK = 0.012;
/** A hard cap on a fling, so a fast swipe on a short list cannot slingshot. */
const SCROLL_MAX_FLICK = 4.5;
/** A finger that has been still this long before it lifts was placing, not throwing. */
const SCROLL_FLICK_STALE_MS = 90;

/**
 * Rows the virtual list owns. It decides their residency and their visibility already, and two
 * writers of `visible` on one object is a bug waiting for an ordering change.
 */
const virtualHolders = new WeakSet<Phaser.GameObjects.GameObject>();

/** Half a row of slack, so a row entering the viewport is never a frame late. Costs nothing. */
const CULL_MARGIN = 24;
/** Ink wobble and stroke width reach past the geometry a container's measurable children report. */
const CULL_PAD = 8;

/**
 * A child's vertical extent in its parent's coordinates, or `undefined` if it cannot be measured.
 *
 * `getBounds()` is not usable here, and that is the whole reason this function exists: Phaser's
 * `Graphics` does not mix in `GetBounds` at all, and `Container.getBounds` silently unions only the
 * children that have it. A row that is a panel plus two labels would therefore measure as just the
 * labels — a subset of its real box — and a row that is only a `Graphics` would measure as an empty
 * rectangle and be hidden for ever. Three sources, in order of trust, and anything unmeasurable is
 * left alone rather than guessed at.
 */
function cullSpan(child: Phaser.GameObjects.GameObject): { top: number; bottom: number } | undefined {
  const told = (child as Phaser.GameObjects.GameObject & { getData?(key: string): unknown }).getData?.('cullSpan') as
    { top?: number; height?: number } | undefined;
  if (told && typeof told.top === 'number' && typeof told.height === 'number') {
    return { top: told.top, bottom: told.top + told.height };
  }
  const sized = child as Phaser.GameObjects.GameObject & { y?: number; originY?: number; displayHeight?: number };
  if (typeof sized.displayHeight === 'number' && sized.displayHeight > 0 && typeof sized.y === 'number') {
    const top = sized.y - (typeof sized.originY === 'number' ? sized.originY : 0) * sized.displayHeight;
    return { top, bottom: top + sized.displayHeight };
  }
  if (child instanceof Phaser.GameObjects.Container) {
    let top = Infinity;
    let bottom = -Infinity;
    for (const grandchild of child.list) {
      const span = cullSpan(grandchild);
      if (!span) continue;
      top = Math.min(top, span.top);
      bottom = Math.max(bottom, span.bottom);
    }
    if (top === Infinity) return undefined;
    const scale = child.scaleY ?? 1;
    return { top: child.y + top * scale - CULL_PAD, bottom: child.y + bottom * scale + CULL_PAD };
  }
  return undefined;
}

/**
 * The gesture a list has already claimed as a scroll, identified rather than merely flagged.
 *
 * Cards inside a scroll area lay a full-bleed hit rectangle over the whole viewport and fire on
 * `pointerup`, so without this every scroll would end by picking whatever card the finger happened
 * to lift over.
 *
 * It records **which** gesture scrolled, not that one did. As a bare boolean it could go stale and
 * stay set: the flag was cleared by an area's own `pointerdown` handler, so once the last scroll
 * area was destroyed there was nothing left to clear it, and every later tap anywhere in the game
 * was read as the tail of a scroll that had ended long ago. Matching on the pointer means a stale
 * value can never match a fresh gesture, so it cannot deaden the interface.
 */
let consumedGesture: { id: number; downTime: number } | undefined;

/**
 * Whether *this* gesture was a scroll, and so must not also be read as a tap.
 *
 * Call it first thing in any `pointerup` handler that sits inside an `InkScrollArea`, passing the
 * pointer the handler was given.
 */
export function scrollGestureConsumedTap(pointer: { id: number; downTime: number }): boolean {
  if (!consumedGesture) {
    return false;
  }
  return pointer.id === consumedGesture.id && pointer.downTime === consumedGesture.downTime;
}

export class InkScrollArea {
  readonly container: Phaser.GameObjects.Container;
  readonly content: Phaser.GameObjects.Container;
  readonly hitZone: Phaser.GameObjects.Zone;

  private readonly clip: RectClip;
  private readonly wheelStep: number;
  private contentHeight = 0;
  private scrollY = 0;
  private maxScroll = 0;
  private dragStart?: { pointerY: number; scrollY: number };
  /** Design units of scroll per millisecond, carried out of the drag and decayed by friction. */
  private velocity = 0;
  private lastMove?: { y: number; t: number };
  private disposed = false;
  private scrollListeners = new Set<() => void>();
  private disposeListeners = new Set<() => void>();
  private lazyRows: Array<{ key: string; top: number; height: number; build: () => void }> = [];
  private lazyList?: InkVirtualList<InkScrollArea['lazyRows'][number]>;
  private lazyCount = 0;
  /** Measured extents of the content's own children, in content space. */
  private readonly spans = new WeakMap<Phaser.GameObjects.GameObject, { top: number; bottom: number }>();
  /** Rows this area hid. It never shows a row it did not hide, so a page's own choice survives. */
  private readonly hidden = new WeakSet<Phaser.GameObjects.GameObject>();
  private cullCount = -1;
  private cullMissed = 0;
  private readonly culling = typeof window === 'undefined'
    || !/[?&]noscrollcull=1/.test(window.location.search);
  get offset(): number { return this.scrollY; }
  onScroll(fn: () => void): () => void { this.scrollListeners.add(fn); return () => this.scrollListeners.delete(fn); }
  onDispose(fn: () => void): void { this.disposeListeners.add(fn); }
  /** Existing page builders can append into content; only the rows near the viewport are built. */
  lazyRow(key: string, top: number, height: number, build: () => void): void {
    this.lazyRows.push({ key, top, height, build });
  }
  virtualStats(): { total: number; mounted: number; spare: number } | undefined { return this.lazyList?.stats(); }
  /** Set while something is drawn over the list; nothing under a sheet may move. */
  private locked = false;
  private readonly wheelHandler: (
    pointer: Phaser.Input.Pointer,
    objects: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
  ) => void;
  private readonly downHandler: (pointer: Phaser.Input.Pointer) => void;
  private readonly moveHandler: (pointer: Phaser.Input.Pointer) => void;
  private readonly upHandler: () => void;
  private readonly glideHandler: (time: number, delta: number) => void;

  constructor(private readonly scene: Phaser.Scene, readonly bounds: UIBounds, opts: InkScrollAreaOptions = {}) {
    this.wheelStep = opts.wheelStep ?? 1;
    this.container = scene.add.container(bounds.x, bounds.y);
    this.content = scene.add.container(0, 0);
    // Marked, so a control can tell it lives in a list and fire the way a list item does — on the
    // release, and only if the finger did not travel. See `insideScrollList`.
    this.content.setData(SCROLL_CONTENT_KEY, true);

    // The clip, bracketing the content in the container's child list. The rect is in container
    // space, and the container already sits at the area's origin, so it starts at 0,0.
    //
    // This is a stencil layer rather than a mask or a filter, and `RectClip` is worth reading
    // before touching it: v3's geometry mask is a no-op under Phaser 4's WebGL renderer, and the
    // Mask filter that replaces it crops to the design surface, so above RENDER_SCALE 1 — the
    // graphics tier nearly every phone gets — lists painted straight over the page title.
    this.clip = new RectClip(scene, { x: 0, y: 0, width: bounds.width, height: bounds.height });
    this.clip.begin(this.container);
    this.container.add(this.content);
    this.clip.end(this.container);
    this.clip.apply(this.content);

    // The zone still earns its place: it swallows taps that fall through the gaps between cards, so
    // the map underneath does not move while a list is open. It is no longer the scroll mechanism.
    this.hitZone = scene.add.zone(bounds.x, bounds.y, bounds.width, bounds.height).setOrigin(0, 0).setInteractive();

    // Scrolling is driven from the scene's own pointer stream rather than Phaser's drag system.
    // Dragging a Zone cannot work here: `input.topOnly` is on, every card lays a full-bleed
    // interactive rectangle across the whole viewport, and a Zone never joins the camera render list
    // so `sortGameObjects` always sinks it to the bottom of the hit list. The zone was therefore
    // never the drag candidate and `dragstart` never fired — leaving the wheel as the only way to
    // scroll, which is no way at all on a phone. Filtering the scene stream by our own bounds is the
    // same shape `wheelHandler` below already uses.
    this.downHandler = (pointer: Phaser.Input.Pointer) => {
      if (this.maxScroll <= 0 || !this.containsPointer(pointer)) {
        return;
      }
      // Catch to stop: putting a finger down on a gliding list halts it, the way every other list
      // on the device behaves. Without this a second flick compounds the first.
      this.velocity = 0;
      this.lastMove = undefined;
      this.dragStart = { pointerY: designLength(pointer.y), scrollY: this.scrollY };
    };
    this.moveHandler = (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || !pointer.isDown) {
        return;
      }
      const at = designLength(pointer.y);
      const travelled = at - this.dragStart.pointerY;
      this.setScroll(this.dragStart.scrollY - travelled);

      // Speed, smoothed. One raw sample is enough to throw a flick wildly — a stray move event a
      // millisecond apart reads as an enormous velocity — so the estimate is a running blend.
      const now = this.scene.time.now;
      if (this.lastMove) {
        const dt = Math.max(1, now - this.lastMove.t);
        const sample = -(at - this.lastMove.y) / dt;
        this.velocity = this.velocity * 0.6 + sample * 0.4;
      }
      this.lastMove = { y: at, t: now };
      // Claimed on travel alone, deliberately — not on whether the list moved.
      //
      // Requiring actual movement looks tempting and is wrong: a list already at its end does not
      // move however far the finger pulls, so the pull was not claimed and the release was read as
      // a tap. Dragging at the bottom of a list picked whatever row was under the finger. A list
      // that cannot scroll at all never gets here, because `downHandler` refuses to start a drag
      // when `maxScroll` is zero.
      if (Math.abs(travelled) >= SCROLL_TAP_SLOP) {
        consumedGesture = { id: pointer.id, downTime: pointer.downTime };
      }
    };
    this.upHandler = () => {
      // Once per release, and only if a drag was actually running.
      //
      // `pointerup` and `pointerupoutside` are both wired to this handler and Phaser fires both for
      // the same release. The second call found `lastMove` already cleared by the first, read that
      // as "the finger was resting", and zeroed the velocity the first call had just captured — so
      // every flick died on the frame it was thrown. Measured: velocity 0 at release, every time.
      if (!this.dragStart) {
        return;
      }
      this.dragStart = undefined;
      // A finger that stopped and rested before lifting was placing the list, not throwing it.
      if (!this.lastMove || this.scene.time.now - this.lastMove.t > SCROLL_FLICK_STALE_MS) {
        this.velocity = 0;
      }
      this.velocity = Phaser.Math.Clamp(this.velocity, -SCROLL_MAX_FLICK, SCROLL_MAX_FLICK);
      this.lastMove = undefined;
    };

    // The glide. Driven off the scene's own update so it stops when the scene does, rather than
    // off a tween — there is no fixed destination to tween to, only a speed that runs out.
    this.glideHandler = (_time: number, delta: number) => {
      if (this.dragStart || Math.abs(this.velocity) < SCROLL_MIN_FLICK) {
        return;
      }
      const before = this.scrollY;
      this.setScroll(this.scrollY + this.velocity * delta);
      // Hitting either end kills the glide outright: `setScroll` clamps, so without this the list
      // sits at the stop with a live velocity and swallows the next frame's worth of movement.
      if (this.scrollY === before) {
        this.velocity = 0;
        return;
      }
      this.velocity *= Math.pow(SCROLL_FRICTION, delta / (1000 / 60));
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.glideHandler);
    scene.input.on('pointerdown', this.downHandler);
    scene.input.on('pointermove', this.moveHandler);
    scene.input.on('pointerup', this.upHandler);
    scene.input.on('pointerupoutside', this.upHandler);

    this.wheelHandler = (pointer, _objects, _dx, dy) => {
      if (!this.containsPointer(pointer)) {
        return;
      }
      // Wheel deltas are not in one unit. Chrome reports pixels — about 100 a notch — while
      // Firefox and a good many mice report *lines*, about 3. Taken raw that is three design units
      // a notch, and a page of prose took forty notches to get through, which is most of what
      // "the scroll is slow" was. Small deltas are lines and get a line's worth of height.
      const step = Math.abs(dy) < 12 ? dy * 34 : dy;
      this.setScroll(this.scrollY + step * this.wheelStep);
    };
    scene.input.on('wheel', this.wheelHandler);
  }

  /** Whether a pointer is over this area, compared in design space. */
  private containsPointer(pointer: { x: number; y: number }): boolean {
    // Deaf under a sheet — asked here because both the drag and the wheel come through this
    // gate. A scene without a registered sheet locks its lists by hand (`setLocked`).
    // Only a list UNDER the sheet is locked — a list inside it is the sheet's own and scrolls.
    if (this.locked || (sheetIsUp() && !insideSheet(this.container))) return false;
    // Column-local, not sheet-space. On the desktop this scene's camera sits at the right edge of
    // a wider sheet, and the scene's pointer stream still carries wheel events from over the map
    // beside it — this test is the only thing that keeps a list from scrolling on those.
    const at = localPointer(this.scene, pointer);
    // Where the list actually is, not where it was asked to be: on the desktop a lane's page is
    // docked at the sheet's edge and a card is centred by moving the whole modal layer, and the
    // list rides inside it — its own `bounds` are still column numbers.
    const world = this.container.getWorldTransformMatrix();
    return (
      at.x >= world.tx &&
      at.x <= world.tx + this.bounds.width &&
      at.y >= world.ty &&
      at.y <= world.ty + this.bounds.height
    );
  }

  setContentHeight(height: number): void {
    this.contentHeight = Math.max(0, height);
    this.maxScroll = Math.max(0, this.contentHeight - this.bounds.height);
    if (this.lazyRows.length !== this.lazyCount) {
      this.lazyCount = this.lazyRows.length;
      if (!this.lazyList) this.lazyList = new InkVirtualList(this, {
        key: row => row.key, top: row => row.top, measure: row => row.height,
        create: () => { const holder = this.scene.add.container(); virtualHolders.add(holder); return holder; },
        bind: (holder, row) => {
          holder.removeAll(true);
          const before = new Set(this.content.list);
          row.build();
          const built = this.content.list.filter(child => !before.has(child));
          for (const child of built) {
            const positioned = child as Phaser.GameObjects.Container;
            positioned.y -= row.top;
            holder.add(child);
          }
        },
        unbind: holder => holder.removeAll(true),
      }, this.lazyRows);
      else this.lazyList.setItems(this.lazyRows);
    }
    this.setScroll(this.scrollY);
  }

  snapshotAnchor(): { key?: string; inset: number; offset: number } {
    const row = this.lazyRows.find(row => row.top + row.height > this.scrollY);
    return { key: row?.key, inset: this.scrollY - (row?.top ?? 0), offset: this.scrollY };
  }
  restoreAnchor(anchor: { key?: string; inset: number; offset: number }): void {
    const row = this.lazyRows.find(row => row.key === anchor.key);
    this.setScroll(row ? row.top + anchor.inset : anchor.offset);
  }

  setScroll(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.content.y = -this.scrollY;
    for (const fn of this.scrollListeners) fn();
    // After the listeners, not as one of them: `InkVirtualList.sync` is a scroll listener, so this
    // is where the frame's mounts and unmounts have already happened and the child list is final.
    // Registered as a listener instead, insertion order would run it first and a row mounted this
    // frame would stay hidden until the next scroll event — at the end of a fling, for ever.
    this.cull();
  }

  /**
   * Hides the rows the viewport cannot show.
   *
   * Phaser's container renderer has no bounds test — `ContainerWebGLRenderer` asks each child only
   * whether it is visible — so a row scrolled off the top is still transformed, tessellated, batched
   * and uploaded every frame, and the stencil then throws the fragments away. The work is all done
   * before the clip. Measured on How to Play, the largest page in the game: 204 `Text` objects and
   * 17,044 live Graphics commands resident, of which only a screenful is on screen.
   *
   * `InkVirtualList` already does this for the pages that opted into `lazyRow`. This covers the ones
   * that never did — every decision prompt and story page, the lane widget blocks, How to Play,
   * Settings, the Cabinet's panels and the menu's own pages — without touching a single page.
   */
  private cull(): void {
    if (!this.culling) return;
    const children = this.content.list;
    if (children.length !== this.cullCount) {
      this.cullCount = children.length;
      this.cullMissed = 0;
      for (const child of children) {
        if (virtualHolders.has(child) || this.spans.has(child)) continue;
        const span = cullSpan(child);
        if (span) this.spans.set(child, span);
        else this.cullMissed += 1;
      }
    }
    const top = this.scrollY - CULL_MARGIN;
    const bottom = this.scrollY + this.bounds.height + CULL_MARGIN;
    for (const child of children) {
      if (virtualHolders.has(child)) continue;
      const span = this.spans.get(child);
      if (!span) continue;
      const shown = child as Phaser.GameObjects.GameObject & { visible: boolean; setVisible(v: boolean): unknown };
      const wanted = span.bottom > top && span.top < bottom;
      // Only ever un-hide what this cull hid: a row a page deliberately hid stays hidden.
      if (!wanted) {
        if (shown.visible) { this.hidden.add(child); shown.setVisible(false); }
      } else if (this.hidden.has(child)) {
        this.hidden.delete(child);
        shown.setVisible(true);
      }
    }
  }

  /**
   * Whether a finger is down or a fling is still carrying the list.
   *
   * The virtual list reads this to cap how many rows it builds in a frame: building a row means
   * allocating a canvas and uploading a texture, and doing that under a moving finger is the
   * stutter. See `BIND_BUDGET` in `InkVirtualList`.
   */
  get gesturing(): boolean {
    return this.dragStart !== undefined || Math.abs(this.velocity) >= SCROLL_MIN_FLICK;
  }

  /** How much of the content the cull could measure. A page whose rows it cannot see is a warning. */
  cullStats(): { measured: number; missed: number; culled: number } {
    let measured = 0;
    let culled = 0;
    for (const child of this.content.list) {
      if (virtualHolders.has(child)) continue;
      if (this.spans.has(child)) measured += 1;
      if (this.hidden.has(child)) culled += 1;
    }
    return { measured, missed: this.cullMissed, culled };
  }

  addTo(parent: Phaser.GameObjects.Container): void {
    parent.add([this.hitZone, this.container]);
  }

  /** Locks or frees the list: a locked list ignores the drag, the wheel and any glide in progress. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.dragStart = undefined;
      this.velocity = 0;
      this.lastMove = undefined;
    }
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const fn of this.disposeListeners) fn();
    this.disposeListeners.clear(); this.scrollListeners.clear();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.glideHandler);
    this.scene.input.off('wheel', this.wheelHandler);
    this.scene.input.off('pointerdown', this.downHandler);
    this.scene.input.off('pointermove', this.moveHandler);
    this.scene.input.off('pointerup', this.upHandler);
    this.scene.input.off('pointerupoutside', this.upHandler);
    this.hitZone.destroy();
    this.container.destroy(true);
    this.clip.destroy();
  }
}

export class InkUI {
  constructor(private readonly scene: Phaser.Scene) {
    installPressWatch(scene);
  }

  label(
    x: number,
    y: number,
    text: string,
    variant: 'title' | 'subtitle' | 'body' | 'label' | 'caption' | 'button' = 'body',
    overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
  ): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, text, { ...textStyle(variant), ...overrides });
  }

  /** The badge's box, and the room the text must leave for it. Read by `measureCard` and `card`. */
  private static badgeBox(opts: InkCardOptions): { width: number; height: number } | undefined {
    if (!opts.badge) return undefined;
    return { width: 78, height: opts.badge.note ? 46 : 36 };
  }

  measureCard(width: number, minimum: number, opts: InkCardOptions): number {
    const badge = InkUI.badgeBox(opts);
    // The badge stands in the corner, so every line beside it wraps short of it — not only the
    // title, the way the `status` label's 58 does. A subtitle that kept the full width ran its
    // second line straight under the plate and its third out from behind it.
    const textWidth = width - 20 - (opts.action && opts.actionPlacement !== 'bottom' ? 82 : 0)
      - (badge ? badge.width + 8 : 0);
    const measure = (value: string, variant: 'label' | 'caption' | 'body', extra: Phaser.Types.GameObjects.Text.TextStyle = {}) =>
      measureInkText(this.scene, value, { ...textStyle(variant), wordWrap: { width: textWidth }, ...extra });
    let height = 18;
    if (opts.title) height += measure(opts.title, 'label', { wordWrap: { width: textWidth - (opts.status ? 58 : 0) } }) + 5;
    if (opts.subtitle) height += measure(opts.subtitle, 'caption') + 4;
    for (const row of opts.rows ?? []) {
      const value = `${row.label}: ${row.value}`;
      height += value.length > Math.max(28, Math.floor(textWidth / 8))
        ? measure(row.label, 'caption') + 2 + measure(row.value, 'body', { fontSize: '12px', lineSpacing: 3 }) + 5
        : measure(value, 'body', { fontSize: '12px' }) + 4;
    }
    if (opts.body) height += measure(opts.body, 'body', { fontSize: '12px', lineSpacing: 5 });
    if (opts.costs?.length) {
      const indent = opts.costsLabel ? measureChipCaption(this.scene, opts.costsLabel) : 0;
      height += measureCostChips(this.scene, opts.costs, textWidth, indent) + 4;
    }
    if (opts.action && opts.actionPlacement === 'bottom') height += 34;
    return Math.max(minimum, badge ? badge.height + 18 : 0, Math.round(height));
  }

  /**
   * A hand-drawn "crayon" tile used for every segmented selector (map theme,
   * language, campaign map-type/difficulty) so those controls read consistently.
   * Waxy parchment fill with a wobbly double outline; the caller adds the label
   * and an interactive hit area on top. Selected tiles use a gold fill + cinnabar
   * outline so the active choice pops on both the light atlas and dark ink themes.
   */
  crayonTile(bounds: UIBounds, opts: { selected?: boolean; fill?: number; accent?: number } = {}): Phaser.GameObjects.Image {
    const { selected = false } = opts;
    if (opts.fill !== undefined || opts.accent !== undefined) {
      const fill = opts.fill ?? INK_UI.parchment;
      const border = opts.accent ?? (selected ? INK_UI.cinnabar : INK_UI.softBrush);
      const { width, height } = bounds;
      const st = stampDesign(this.scene, `ui:print-tile:${width}x${height}:${fill}:${border}:${selected}`,
        { left: -3, top: -3, right: width + 3, bottom: height + 3 },
        (g, x, y) => {
          g.translateCanvas(x, y);
          printedSurface(g, width, height, {
            fill, border, borderWidth: selected ? 2 : 1.3, borderAlpha: selected ? 1 : 0.7,
          });
          g.translateCanvas(-x, -y);
        }, { pool: 'ui' });
      return placeStamp(this.scene, st, bounds.x, bounds.y);
    }
    // Segmented selectors reuse the exact button surface so tiles, buttons, and cards read
    // as one visual family: selected = primary (gold), unselected = secondary (parchment).
    // Stamped, not drawn: a fight screen holds five of these and repaints them per order.
    const st = buttonSurfaceStamp(this.scene, bounds.width, bounds.height, selected ? 'primary' : 'secondary', false);
    return placeStamp(this.scene, st, bounds.x, bounds.y);
  }

  panel(bounds: UIBounds, opts: InkSurfaceOptions = {}): Phaser.GameObjects.Graphics {
    const {
      fill = INK_UI.parchment,
      fillShade = INK_UI.parchmentShade,
      fillAlpha = 1,
      border = INK_UI.brush,
      borderAlpha = 0.86,
      borderWidth = 1.8,
      radius = 8,
      cut,
      muted = false,
      ornaments = false,
    } = opts;

    const g = this.scene.add.graphics({ x: bounds.x, y: bounds.y });
    const alpha = muted ? fillAlpha * 0.55 : fillAlpha;
    void radius;

    printedSurface(g, bounds.width, bounds.height, {
      fill, fillAlpha: alpha, border, borderAlpha: muted ? borderAlpha * 0.6 : borderAlpha,
      borderWidth, cut, seed: Math.round(bounds.x * 13 + bounds.y * 7 + bounds.width),
    });
    // A second rule is reserved for ceremonial plates, leaving ordinary controls quiet.
    if (ornaments) inkPath(
      g,
      [{ x: 4, y: 4 }, { x: bounds.width - 4, y: 4 }, { x: bounds.width - 4, y: bounds.height - 4 }, { x: 4, y: bounds.height - 4 }],
      Math.round(bounds.width * 3 + bounds.height),
      { width: 0.8, alpha: muted ? 0.16 : 0.3, colour: fillShade, wobble: 0.6, step: 14, closed: true },
    );

    if (ornaments) {
      this.drawCornerMarks(g, bounds.width, bounds.height, muted);
    }

    return g;
  }

  card(bounds: UIBounds, opts: InkCardOptions = {}): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    const padding = 10;
    const actionRightWidth = opts.action && opts.actionPlacement !== 'bottom' ? 82 : 0;
    const badge = InkUI.badgeBox(opts);
    const textWidth = bounds.width - padding * 2 - actionRightWidth - (badge ? badge.width + 8 : 0);

    // Build the text first and grow the box to its ACTUAL rendered height. Phaser computes
    // each Text's wrapped height on creation, so reading `.height` — instead of estimating
    // character counts — is what makes cards reliably contain text in any language (long
    // Vietnamese lines wrap differently than a char estimate would predict). The requested
    // height is only a minimum. After the last line is stacked, the box's final height is
    // known and the background is inserted behind the text.
    const label = (x: number, y: number, text: string, variant: 'label' | 'caption' | 'body', overrides: Phaser.Types.GameObjects.Text.TextStyle) =>
      opts.cacheText ? cachedText(this.scene, x, y, text, { ...textStyle(variant), ...overrides }) : this.label(x, y, text, variant, overrides);
    let cursorY = 8;
    const stack = (obj: Phaser.GameObjects.Text | Phaser.GameObjects.Image, gapBelow: number): void => {
      container.add(obj);
      // Cached CanvasTexture images carry physical frame dimensions in displayHeight.
      // Their logical height matches Text.height; neither label is scaled in this layout.
      cursorY += obj.height + gapBelow;
    };

    if (opts.title) {
      stack(label(padding, cursorY, opts.title, 'label', {
        fontSize: '15px',
        wordWrap: { width: textWidth - (opts.status ? 58 : 0) },
      }), 5);
    }

    if (opts.subtitle) {
      stack(label(padding, cursorY, opts.subtitle, 'caption', {
        wordWrap: { width: textWidth },
      }), 4);
    }

    if (opts.rows) {
      for (const row of opts.rows) {
        const rowText = `${row.label}: ${row.value}`;
        const longValue = rowText.length > Math.max(28, Math.floor(textWidth / 8));
        if (longValue) {
          stack(label(padding, cursorY, row.label, 'caption', { wordWrap: { width: textWidth } }), 2);
          stack(label(padding, cursorY, row.value, 'body', {
            fontSize: '12px',
            lineSpacing: 3,
            wordWrap: { width: textWidth },
          }), 5);
        } else {
          stack(label(padding, cursorY, rowText, 'body', {
            fontSize: '12px',
            wordWrap: { width: textWidth },
          }), 4);
        }
      }
    }

    if (opts.body) {
      stack(label(padding, cursorY, opts.body, 'body', {
        fontSize: '12px',
        lineSpacing: 5,
        wordWrap: { width: textWidth },
      }), 0);
    }

    if (opts.costs?.length) {
      // The caption rides on the strip's own line, not above it: what these figures are is one
      // word, and a word does not need a line of its own on a card five of which fit a screen.
      const indent = opts.costsLabel ? measureChipCaption(this.scene, opts.costsLabel) : 0;
      if (opts.costsLabel) {
        const caption = this.scene.add.text(padding, cursorY + 8, opts.costsLabel.toLocaleUpperCase(), {
          ...CHIP_CAPTION_FONT, color: INK_UI_HEX.mutedText,
        });
        container.add(caption);
      }
      const strip = drawCostChips(this.scene, opts.costs,
        { x: padding, y: cursorY + 2, width: textWidth, muted: opts.muted, indent });
      container.add(strip);
      cursorY += measureCostChips(this.scene, opts.costs, textWidth, indent) + 4;
    }

    let contentBottom = cursorY + 10; // breathing room below the last line
    if (opts.action && opts.actionPlacement === 'bottom') {
      contentBottom += 34; // reserve the bottom button row
    }
    const height = Math.max(bounds.height, Math.round(contentBottom));

    // Insert the background behind the already-stacked text.
    if (opts.ornaments) container.addAt(this.panel({ x: 0, y: 0, width: bounds.width, height }, opts), 0);
    else {
      const surface = { fill: opts.fill ?? INK_UI.parchment, fillAlpha: (opts.fillAlpha ?? 1) * (opts.muted ? .55 : 1),
        border: opts.border ?? INK_UI.brush, borderAlpha: (opts.borderAlpha ?? .86) * (opts.muted ? .6 : 1),
        borderWidth: opts.borderWidth ?? 1.8, cut: opts.cut, seed: Math.round(bounds.width) };
      const stamp = stampDesign(this.scene, `ui:card:${bounds.width}:${height}:${JSON.stringify(surface)}`,
        { left: -3, top: -3, right: bounds.width + 3, bottom: height + 3 },
        (g, x, y) => { g.translateCanvas(x, y); printedSurface(g, bounds.width, height, surface); g.translateCanvas(-x, -y); }, { pool: 'ui' });
      container.addAt(placeStamp(this.scene, stamp, 0, 0), 0);
    }

    if (opts.badge && badge) {
      /**
       * Stamped, like the card surface above it.
       *
       * This was live `Graphics` on the reasoning that "a stamp is keyed by its rectangle and these
       * plates differ by their ink". The card's own surface, eight lines up, had already solved
       * that by putting the ink in the key — so the badge did too, and every badged row in the
       * Army, Court and Realm lanes paid a wash fill plus three wobbled stroke passes, per row, per
       * frame. There are two boxes and a handful of tones, so this is a dozen textures at most.
       */
      const tone = opts.badge.tone ?? INK_UI.softBrush;
      const left = bounds.width - padding - badge.width;
      const top = 8;
      const plateInk = {
        fill: INK_UI.parchmentDark,
        fillAlpha: 0.5,
        border: tone,
        borderAlpha: 0.9,
        borderWidth: 1.2,
        seed: Math.round(badge.width * 13 + badge.height),
      };
      const plateStamp = stampDesign(this.scene,
        `ui:badge:${badge.width}:${badge.height}:${JSON.stringify(plateInk)}`,
        { left: -3, top: -3, right: badge.width + 3, bottom: badge.height + 3 },
        (g, x, y) => {
          g.translateCanvas(x, y);
          printedSurface(g, badge.width, badge.height, plateInk);
          g.translateCanvas(-x, -y);
        }, { pool: 'ui' });
      container.add(placeStamp(this.scene, plateStamp, left, top));
      const middle = left + badge.width / 2;
      const caption = this.scene.add.text(middle, top + 6, opts.badge.caption.toLocaleUpperCase(), {
        ...textStyle('caption'), color: INK_UI_HEX.mutedText, fontSize: '8px', fontStyle: '700',
      }).setOrigin(0.5, 0);
      caption.setLetterSpacing?.(1.1);
      // English runs longer than Vietnamese here — "FIELD POWER" against "LỰC CHIẾN" — and the
      // plate is a fixed box in a column of fixed boxes, so the words shrink rather than the box.
      if (caption.width > badge.width - 8) caption.setScale((badge.width - 8) / caption.width);
      const value = this.scene.add.text(middle, top + 15, opts.badge.value, {
        ...textStyle('label'), color: colorToCss(tone), fontSize: '17px', fontStyle: '700',
      }).setOrigin(0.5, 0);
      // Long numbers shrink rather than leave the plate: a realm's best host can run to five
      // figures and the badge is a fixed box in a list of fixed boxes.
      if (value.width > badge.width - 10) value.setScale((badge.width - 10) / value.width);
      container.add([caption, value]);
      if (opts.badge.note) {
        const note = this.scene.add.text(middle, top + badge.height - 12, opts.badge.note.toLocaleUpperCase(), {
          ...textStyle('caption'), color: colorToCss(tone), fontSize: '8px', fontStyle: '700',
        }).setOrigin(0.5, 0);
        note.setLetterSpacing?.(1);
        if (note.width > badge.width - 8) note.setScale((badge.width - 8) / note.width);
        container.add(note);
      }
    }

    if (opts.status) {
      // A label, not a pill. On paper a filled chip reads as a sticker; letter-spaced small caps
      // in muted ink says the same thing and stays part of the page.
      const status = this.scene.add.text(bounds.width - padding, 9, opts.status.toLocaleUpperCase(), {
        ...textStyle('caption'),
        color: opts.muted ? INK_UI_HEX.mutedText : colorToCss(opts.statusColor ?? INK_UI.cinnabar),
        fontSize: '9px',
        fontStyle: '700',
      }).setOrigin(1, 0);
      status.setLetterSpacing?.(1.2);
      container.add(status);
    }

    if (opts.action) {
      if (opts.actionPlacement === 'bottom') {
        const actionWidth = Math.min(180, bounds.width - padding * 2);
        container.add(this.button({
          x: (bounds.width - actionWidth) / 2,
          y: height - 38,
          width: actionWidth,
          height: 30,
        }, opts.action.label, opts.action.onClick, {
          variant: opts.action.disabled ? 'disabled' : opts.action.variant ?? 'secondary',
          fontSize: '12px',
        }));
      } else {
        container.add(this.button({
          x: bounds.width - padding - 72,
          y: (height - 30) / 2,
          width: 72,
          height: 30,
        }, opts.action.label, opts.action.onClick, {
          variant: opts.action.disabled ? 'disabled' : opts.action.variant ?? 'secondary',
          fontSize: '11px',
        }));
      }
    }

    container.setData('cardHeight', height);
    return container;
  }

  button(bounds: UIBounds, label: string, onClick: () => void, opts: InkButtonOptions = {}): Phaser.GameObjects.Container {
    const { variant = 'secondary', fontSize = '13px', radius = 8, extraHitPadding = 0 } = opts;
    const disabled = variant === 'disabled';
    const container = this.scene.add.container(bounds.x, bounds.y);
    // The surface is a baked stamp placed as an image — a button used to be ~40 live Graphics
    // commands re-tessellated every frame it stood on screen, times every button on the sheet.
    // Both states are baked up front so the first press never rasterises under the finger; the
    // press-drop offset is inside the pressed drawing (`drawButtonSurface` translates), so the
    // swap is the whole gesture. `radius` stays in the signature for its callers; the surface
    // never used it (`void radius` in drawButtonSurface).
    const surface = opts.frameless
      ? undefined
      : placeStamp(this.scene, buttonSurfaceStamp(this.scene, bounds.width, bounds.height, variant, false), 0, 0);
    const pressedStamp = opts.frameless || disabled
      ? undefined
      : buttonSurfaceStamp(this.scene, bounds.width, bounds.height, variant, true);
    const draw = (pressed: boolean): void => {
      if (!surface) return;
      applyStamp(surface, pressed && pressedStamp
        ? pressedStamp
        : buttonSurfaceStamp(this.scene, bounds.width, bounds.height, variant, false));
    };
    void radius;

    // Frameless controls have no contour, corner cut, or ornament to protect the label from. Give
    // their inline group the space that border padding would otherwise waste; the glyph itself is
    // 26 × 0.62 plus a seven-unit gap, so 24 units is its real reservation rather than 30.
    const labelWidth = bounds.width
      - (opts.frameless ? 4 : 12)
      - (opts.icon ? (opts.frameless ? 24 : 30) : 0);
    const text = this.label(bounds.width / 2, bounds.height / 2, label, 'button', {
      color: variant === 'danger' ? INK_UI_HEX.lightText
        : variant === 'primary' ? colorToCss(INK_UI.cinnabar)
        : INK_UI_HEX.inkText,
      fontSize,
      align: 'center',
      // A glyph and its gap come out of the label's line before it wraps, or a long label wraps to
      // the full width and then the group is centred as if it had not.
      wordWrap: { width: labelWidth },
    }).setOrigin(0.5);
    text.setAlpha(disabled ? 0.55 : 1);

    /**
     * The second line, if there is one — built *before* the label is fitted, because it is the
     * label's height budget.
     *
     * `fitTextToButton` was measuring the label against the whole button, then the note was
     * stacked under it and the pair overflowed. It only shows when both wrap: a Moment offering
     * `Strike before they deploy` over `Numbers only tell once they are in line.` in a 163-point
     * button needs two lines of each, about 56 points of type in a 46-point box, and it printed
     * straight through the timer bar under the card.
     */
    let sub: Phaser.GameObjects.Text | undefined;
    if (opts.subLabel) {
      sub = this.label(bounds.width / 2, 0, opts.subLabel, 'caption', {
        color: variant === 'danger' ? INK_UI_HEX.lightText : INK_UI_HEX.mutedText,
        fontSize: '10px',
        align: 'center',
        wordWrap: { width: bounds.width - 16 },
      }).setOrigin(0.5);
      sub.setAlpha(disabled ? 0.55 : 0.82);
    }
    fitTextToButton(text, bounds, fontSize, Boolean(opts.icon), sub ? sub.height + 1 : 0, Boolean(opts.frameless));

    // Both lines are re-centred as a block rather than the label staying put and the note hanging
    // off the bottom — a button whose type sits high with a gap under it reads as a button with
    // something clipped off it. The note gives ground of its own if the pair is still too tall:
    // the label is what the button *is*, so it shrinks last.
    if (sub) {
      const budget = bounds.height - 8;
      for (let size = 9.5; size >= 7.5 && text.height + 1 + sub.height > budget; size -= 0.5) {
        sub.setFontSize(size);
      }
      // Still too tall at the floor size: give words, not the box. A note that has shrunk to 7.5
      // and still does not fit used to print straight through whatever stood under the button
      // (user report: the Moment card's timer bar) — trimmed tail-first with an ellipsis instead.
      if (text.height + 1 + sub.height > budget) {
        const words = (opts.subLabel ?? '').split(' ');
        while (words.length > 1 && text.height + 1 + sub.height > budget) {
          words.pop();
          sub.setText(`${words.join(' ')}…`);
        }
      }
      const block = text.height + 1 + sub.height;
      text.setY(bounds.height / 2 - block / 2 + text.height / 2);
      sub.setY(bounds.height / 2 + block / 2 - sub.height / 2);
    }

    let glyph: Phaser.GameObjects.Container | undefined;
    if (opts.icon) {
      const tint = variant === 'primary' ? INK_UI.cinnabar
        : variant === 'danger' ? PIGMENT.diepHi
        : PIGMENT.muc;
      glyph = drawCardIcon(this.scene, opts.icon, tint);
      // The glyph box is 26 units and a button label is 13–17px, so it is drawn at roughly the
      // cap-height of the type beside it rather than at the size a card would give it.
      const scale = 0.62;
      glyph.setScale(scale);
      glyph.setAlpha(disabled ? 0.5 : 0.92);
      const glyphWidth = CARD_ICON_SIZE * scale;
      const GAP = 7;
      const group = glyphWidth + GAP + text.width;
      const left = bounds.width / 2 - group / 2;
      glyph.setPosition(left + glyphWidth / 2, text.y);
      text.setX(left + glyphWidth + GAP + text.width / 2);
    }

    const hitArea = this.scene.add
      .rectangle(
        bounds.width / 2,
        bounds.height / 2,
        bounds.width + extraHitPadding,
        bounds.height + extraHitPadding,
        0xffffff,
        0.001,
      )
      .setInteractive(disabled ? undefined : { useHandCursor: true });

    const stop = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation();

    /**
     * A button fires when it is **pressed**, not when it is released.
     *
     * Reported: *click hold look bad, please make it faster and almost touch.* Waiting for the
     * release is a whole gesture of latency on a phone — the finger lands, the ink darkens, and
     * nothing happens until it lifts, which reads as the control needing to be held down.
     *
     * Firing on the press also settles the other half of the report — *only prevent too quick or
     * drag on to button* — for free, and more honestly than a guard could: a drag that *ends* on a
     * button never generated a press on it, so it cannot fire it. Nothing has to detect the drag.
     *
     * Safe here specifically because `InkUI.button` is chrome — footers, cards, the action bar —
     * and never a row inside a scrolling list. Rows carry their own `pointerup` handler and consult
     * `scrollGestureConsumedTap` (see `laneList.addRow`), which is the right rule for something you
     * scroll past. The scroll guard is still asked here: a fresh gesture can never match a claimed
     * one, so it costs nothing and covers a button that ever does end up inside a list.
     */
    let firedAt = 0;
    markControlBorn(hitArea);
    /** The guarded firing, shared by the press path and the release path. */
    const fire = (pointer: Phaser.Input.Pointer): void => {
      if (scrollGestureConsumedTap(pointer)) return;
      // Two presses inside a frame or two of each other are one press the platform delivered twice
      // — a WebView sending both `pointerdown` and `mousedown`, most often. Cheaper and more
      // reliable than trying to identify the duplicate by its type.
      const now = pointer.downTime || performance.now();
      if (now - firedAt < 120) return;
      // The same duplicate landing on a DIFFERENT button — the one the first press revealed under
      // the finger. Exit on the run's sheet, then Play on the front page: see `pressIsEchoOnto`.
      if (pressIsEchoOnto(hitArea, pointer)) return;
      firedAt = now;
      noteControlFired(pointer);
      // The court's paper, under every press. This is also the gesture that unlocks the audio
      // context on first touch — see SoundDirector.tap.
      soundDirector.tap();
      onClick();
    };

    /**
     * **Inside a list, a button is a list item: it arms on the press and fires on the release,
     * and a finger that travels disarms it.**
     *
     * The press-fire above was written for chrome and was right for chrome. But buttons are laid
     * inside scrolling lists all over the game now — a card's Unlock in the vault, a row's action
     * on a lane page, a trait on the dynasty page — and there a press-fire means the item fires the
     * moment a scroll begins on it: *I click and drag, basic scroll behaviour, and it triggers
     * immediately instead of behaving like a mobile app.* Every list on the phone does the other
     * thing: the item darkens under the finger, a finger that moves past the slop un-darkens it
     * and scrolls, and a finger that lifts where it landed fires it. So that is what a button does
     * when it finds itself inside a list — decided at press time, because it is added to the list
     * after it is built. Chrome keeps the press, and its speed.
     */
    let armed: { id: number; downTime: number; x: number; y: number } | undefined;
    const onMove = (pointer: Phaser.Input.Pointer): void => {
      if (!armed || pointer.id !== armed.id) return;
      const travelled = designLength(Phaser.Math.Distance.Between(armed.x, armed.y, pointer.x, pointer.y));
      if (travelled > SCROLL_TAP_SLOP) {
        disarm();
        draw(false);
      }
    };
    const disarm = (): void => {
      if (!armed) return;
      armed = undefined;
      this.scene.input.off('pointermove', onMove);
    };
    container.once('destroy', () => this.scene.input.off('pointermove', onMove));

    hitArea.on('pointerdown', (
      pointer: Phaser.Input.Pointer,
      localX: number,
      localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      if (disabled) { stop(pointer, localX, localY, event); return; }
      draw(true);
      if (insideScrollList(container)) {
        // The press is NOT stopped here: the list scrolls off the scene's own pointer stream, and
        // a stopped press never reached it — which is why a drag that began on a button could
        // neither scroll nor be told from a tap. The list sees the press; this control arms.
        armed = { id: pointer.id, downTime: pointer.downTime, x: pointer.x, y: pointer.y };
        this.scene.input.on('pointermove', onMove);
        return;
      }
      stop(pointer, localX, localY, event);
      fire(pointer);
    });
    hitArea.on('pointerup', (
      pointer: Phaser.Input.Pointer,
      localX: number,
      localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      if (disabled) { stop(pointer, localX, localY, event); return; }
      draw(false);
      if (!armed || armed.id !== pointer.id || armed.downTime !== pointer.downTime) { stop(pointer, localX, localY, event); return; }
      const travelled = designLength(Phaser.Math.Distance.Between(armed.x, armed.y, pointer.x, pointer.y));
      disarm();
      if (travelled > SCROLL_TAP_SLOP) return;
      fire(pointer);
    });
    hitArea.on('pointerout', () => {
      if (!disabled) {
        draw(false);
      }
    });
    // Hover, on the desktop only: the ink darkens under the cursor the way it darkens under a
    // finger, and `pointerout` above already takes it back. A phone never hovers, and a touch's
    // own `pointerover` would flash every button on the way to a press.
    if (isDesktopPlatform()) {
      hitArea.on('pointerover', () => {
        if (!disabled) draw(true);
      });
    }

    const parts: Phaser.GameObjects.GameObject[] = surface ? [surface] : [];
    if (glyph) parts.push(glyph);
    parts.push(text);
    if (sub) parts.push(sub);
    parts.push(hitArea);
    container.add(parts);
    if (!disabled) {
      addPressFeedback(this.scene, container, hitArea, { width: bounds.width, height: bounds.height });
    }
    return container;
  }

  /**
   * A phrase you can press: ink, a mark beside it, a hand-ruled underline — and no button.
   *
   * For the places where a filled or ghosted button would overstate the case. The support row is
   * the reason it exists: two footer offers drawn as buttons read as things the game is asking you
   * to do, when they are asides the player may notice or ignore. Stripped to a marked, underlined
   * phrase they read as what they are — writing on the page you happen to be able to press.
   *
   * The rule is drawn, not a font underline, so it wobbles like everything else here; the glyph and
   * the rule carry the accent at rest and the phrase joins them under the finger, which is the
   * whole hover state. The hit box is padded out to a thumb whatever the type size.
   *
   * Laid out rightward from `x` and centred vertically on `y` — a caller centring a row of these
   * has to measure them first, so the width lands on `getData('linkWidth')`.
   */
  textLink(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    opts: InkTextLinkOptions = {},
  ): Phaser.GameObjects.Container {
    const { fontSize = '12px', icon, color = INK_UI.brush, accent = INK_UI.cinnabar } = opts;
    const container = this.scene.add.container(x, y);

    const iconSize = 18;
    const textX = icon ? iconSize + 6 : 0;
    const text = this.label(textX, 0, label, 'button', { color: colorToCss(color), fontSize }).setOrigin(0, 0.5);
    const width = textX + text.width;

    const rule = this.scene.add.graphics();
    const ruleY = Math.round(text.height / 2);
    const drawRule = (hot: boolean): void => {
      rule.clear();
      inkPath(
        rule,
        [{ x: textX, y: ruleY }, { x: textX + text.width, y: ruleY }],
        Math.round(width * 7 + label.length * 3),
        { width: hot ? 1.5 : 1.1, alpha: hot ? 0.95 : 0.5, colour: accent, wobble: 0.7, step: 9 },
      );
    };
    drawRule(false);
    container.add([rule, text]);

    if (icon) {
      const glyph = drawCardIcon(this.scene, icon, accent);
      glyph.setPosition(iconSize / 2, 0).setScale(iconSize / CARD_ICON_SIZE);
      container.add(glyph);
    }

    const hitHeight = Math.max(30, text.height + 12);
    const hitArea = this.scene.add
      .rectangle(width / 2, 0, width + 14, hitHeight, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });

    const setHot = (hot: boolean): void => {
      text.setColor(colorToCss(hot ? accent : color));
      drawRule(hot);
    };

    hitArea.on('pointerover', () => setHot(true));
    hitArea.on('pointerout', () => setHot(false));
    hitArea.on('pointerdown', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      setHot(true);
    });
    hitArea.on('pointerup', (
      pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      setHot(false);
      // Same guard every button here carries: a finger that lifts on a link at the end of a drag
      // was scrolling, not pressing.
      if (scrollGestureConsumedTap(pointer)) {
        return;
      }
      // And this control has to have existed when the press began — see `inputGeneration`. A sheet
      // closing on `pointerdown` builds this row under a finger that is still down, and without
      // this the release of that same press picks it.
      if (releaseNotOwnedBy(hitArea)) {
        return;
      }
      // Or be the echo of the press that built it — see `pressIsEchoOnto`.
      if (pressIsEchoOnto(hitArea, pointer)) {
        return;
      }
      noteControlFired(pointer);
      soundDirector.tap();
      onClick();
    });
    markControlBorn(hitArea);

    container.add(hitArea);
    container.setData('linkWidth', width);
    return container;
  }

  modal(opts: InkModalOptions): InkModalResult {
    const width = opts.width ?? 362;
    // Never taller than the sheet. A fixed 742 on a 662-tall design box put the header above the
    // screen and the footer below it, which is how a modal loses its own close button.
    const height = Math.min(opts.height ?? 742, GAME_HEIGHT - 24);
    const x = (GAME_WIDTH - width) / 2;
    const y = (GAME_HEIGHT - height) / 2;
    const headerHeight = 104;
    const footerHeight = 66;

    // The whole sheet, from its left edge: on a page scene that edge is left of x = 0 (`sheetSpan`).
    const span = sheetSpan(this.scene);
    const blocker = this.scene.add
      .rectangle(span.left, 0, span.width, GAME_HEIGHT, INK_UI.overlay, 0.88)
      .setOrigin(0, 0)
      .setInteractive();
    // Both halves of a press. The release used to fall through to the scene-level `pointerup`,
    // which is harmless only for as long as nothing listens there.
    const swallow = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation();
    blocker.on('pointerdown', swallow);
    blocker.on('pointerup', swallow);
    // Above everything drawn last frame, before this one is drawn — see `liftForInput`.
    liftForInput(this.scene, [blocker]);

    const frame = this.panel({ x, y, width, height }, {
      fill: INK_UI.parchment,
      fillShade: INK_UI.parchmentDark,
      border: INK_UI.brush,
      radius: 12,
      borderWidth: 3,
    });
    const header = this.scene.add.graphics({ x, y });
    header.fillStyle(INK_UI.parchment, 0.96);
    header.fillRoundedRect(0, 0, width, headerHeight, { tl: 12, tr: 12, bl: 0, br: 0 });
    // Two rules under the title, the way a printed page separates its head from its body.
    header.lineStyle(1.4, INK_UI.brush, 0.42);
    header.lineBetween(10, headerHeight - 3, width - 10, headerHeight - 3);
    header.lineStyle(0.8, INK_UI.cinnabar, 0.5);
    header.lineBetween(10, headerHeight, width - 10, headerHeight);

    const title = this.label(x + width / 2, y + 18, opts.title, 'title', {
      color: INK_UI_HEX.inkText,
      align: 'center',
      wordWrap: { width: width - 80 },
    }).setOrigin(0.5, 0);
    const subtitle = this.label(x + width / 2, y + 58, opts.subtitle ?? '', 'subtitle', {
      align: 'center',
      fontSize: '11px',
      lineSpacing: 2,
      wordWrap: { width: width - 60 },
    }).setOrigin(0.5, 0);
    const close = this.closeIcon({ x: x + width - 46, y: y + 18, width: 32, height: 32 }, opts.onClose);

    return {
      objects: [blocker, frame, header, title, subtitle, close],
      panelBounds: { x, y, width, height },
      contentBounds: { x: x + 14, y: y + headerHeight + 14, width: width - 28, height: height - headerHeight - footerHeight - 20 },
      footerBounds: { x: x + 14, y: y + height - footerHeight + 10, width: width - 28, height: footerHeight - 18 },
    };
  }

  /**
   * The way back, at `y`, centred. See `BACK_BAR_WIDTH`.
   *
   * A method rather than five call sites agreeing to pass the same numbers, because five call
   * sites agreeing is exactly what was not happening.
   */
  backBar(y: number, onClick: () => void): Phaser.GameObjects.Container {
    return this.button(
      {
        x: Math.round((GAME_WIDTH - BACK_BAR_WIDTH) / 2),
        y,
        width: BACK_BAR_WIDTH,
        height: BACK_BAR_HEIGHT,
      },
      t('menu.back'),
      onClick,
      { variant: 'secondary', fontSize: '14px' },
    );
  }

  closeIcon(bounds: UIBounds, onClick: () => void): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    const text = addConquestUiIcon(this.scene, 'close', 22)
      .setPosition(bounds.width / 2, bounds.height / 2 - 1);
    const hitArea = this.scene.add
      .rectangle(bounds.width / 2, bounds.height / 2, bounds.width, bounds.height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hitArea.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    );
    hitArea.on(
      'pointerup',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        soundDirector.tap();
        onClick();
      },
    );
    container.add([text, hitArea]);
    return container;
  }

  scrollArea(bounds: UIBounds, opts: InkScrollAreaOptions = {}): InkScrollArea {
    return new InkScrollArea(this.scene, bounds, opts);
  }

  infoRow(bounds: UIBounds, label: string, value: string): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    container.add(this.label(0, 0, label, 'caption', { wordWrap: { width: bounds.width * 0.42 } }));
    container.add(this.label(bounds.width, 0, value, 'body', {
      align: 'right',
      fontSize: '12px',
      wordWrap: { width: bounds.width * 0.55 },
    }).setOrigin(1, 0));
    return container;
  }

  statBar(bounds: UIBounds, value: number, max: number, color = INK_UI.jade): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    const ratio = max <= 0 ? 0 : Phaser.Math.Clamp(value / max, 0, 1);
    const g = this.scene.add.graphics();
    const mid = bounds.height / 2;
    const seed = Math.round(bounds.x * 7 + bounds.y * 3 + bounds.width);
    // The track is a faint rule and the fill a heavier one drawn over it, so a bar reads as a
    // measured length of ink rather than as two nested boxes.
    inkPath(g, [{ x: 0, y: mid }, { x: bounds.width, y: mid }], seed, {
      width: Math.max(1, bounds.height * 0.8), alpha: 0.2, colour: INK_UI.brush, wobble: 0.3, step: 14,
    });
    if (ratio > 0) {
      inkPath(g, [{ x: 0, y: mid }, { x: Math.max(1.5, bounds.width * ratio), y: mid }], seed + 1, {
        width: Math.max(1, bounds.height * 0.8), alpha: 0.88, colour: color, wobble: 0.45, step: 12,
      });
    }
    container.add(g);
    return container;
  }

  /**
   * A draggable dial: `statBar`'s measured line of ink, with a seal-red thumb the finger owns.
   *
   * Drag anywhere on the bounds; the value moves *relatively* from where it stood, like a real
   * fader under a finger, so grabbing the middle of the track does not snap the thumb there.
   * `onPreview` fires on every movement for live labels; `onChange` once, on release — callers
   * that recompute the world should do it there.
   *
   * The zone sits above the scroll area's hit zone, so dragging the slider never scrolls the
   * list underneath it (input.topOnly is on).
   */
  slider(
    bounds: UIBounds,
    opts: {
      value: number;
      onChange: (value: number) => void;
      onPreview?: (value: number) => void;
      color?: number;
    },
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(bounds.x, bounds.y);
    const thumbR = 9;
    const trackX = thumbR + 2;
    const trackWidth = bounds.width - (thumbR + 2) * 2;
    const mid = bounds.height / 2;
    const color = opts.color ?? INK_UI.cinnabar;
    const seed = Math.round(bounds.x * 7 + bounds.y * 3 + bounds.width);

    let value = Phaser.Math.Clamp(opts.value, 0, 1);
    const g = this.scene.add.graphics();
    container.add(g);

    const paint = () => {
      g.clear();
      inkPath(g, [{ x: trackX, y: mid }, { x: trackX + trackWidth, y: mid }], seed, {
        width: 3, alpha: 0.2, colour: INK_UI.brush, wobble: 0.3, step: 14,
      });
      const tip = trackX + trackWidth * value;
      if (value > 0.01) {
        inkPath(g, [{ x: trackX, y: mid }, { x: tip, y: mid }], seed + 1, {
          width: 3, alpha: 0.8, colour: color, wobble: 0.45, step: 12,
        });
      }
      // The thumb is a seal pressed on the line: a solid disc with the paper showing as a ring.
      g.fillStyle(INK_UI.parchment, 1);
      g.fillCircle(tip, mid, thumbR - 1.5);
      g.fillStyle(color, 0.92);
      g.fillCircle(tip, mid, thumbR - 4);
      g.lineStyle(1.4, INK_UI.brush, 0.6);
      g.strokeCircle(tip, mid, thumbR - 1.5);
    };
    paint();

    const zone = this.scene.add
      .zone(bounds.width / 2, mid, bounds.width, Math.max(bounds.height, thumbR * 2 + 14))
      .setInteractive({ draggable: true, useHandCursor: true });
    container.add(zone);

    let startValue = value;
    let startX = 0;
    zone.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      startValue = value;
      startX = designLength(pointer.x);
    });
    zone.on('drag', (pointer: Phaser.Input.Pointer) => {
      value = Phaser.Math.Clamp(startValue + (designLength(pointer.x) - startX) / trackWidth, 0, 1);
      paint();
      opts.onPreview?.(value);
    });
    zone.on('dragend', () => {
      opts.onChange(value);
    });

    return container;
  }

  private drawCornerMarks(g: Phaser.GameObjects.Graphics, width: number, height: number, muted: boolean): void {
    const alpha = muted ? 0.32 : 0.72;
    const size = 5;
    const inset = 7;
    const corners: Array<[number, number]> = [
      [inset, inset],
      [width - inset, inset],
      [inset, height - inset],
      [width - inset, height - inset],
    ];
    g.fillStyle(INK_UI.cinnabar, alpha);
    for (const [cx, cy] of corners) {
      g.fillRect(cx - size / 2, cy - 1, size, 2);
      g.fillRect(cx - 1, cy - size / 2, 2, size);
    }
  }
}

function textStyle(variant: 'title' | 'subtitle' | 'body' | 'label' | 'caption' | 'button'): Phaser.Types.GameObjects.Text.TextStyle {
  switch (variant) {
    case 'title':
      return { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '22px', fontStyle: '700' };
    case 'subtitle':
      return { color: '#5a4c39', fontFamily: UI_FONT, fontSize: '12px' };
    case 'label':
      return { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '15px', fontStyle: '700' };
    case 'caption':
      return { color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '11px' };
    case 'button':
      return { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '13px', fontStyle: '700' };
    default:
      return { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '13px' };
  }
}

/**
 * Shrink a button's label until it is actually inside the button.
 *
 * Phaser's word wrap only breaks on spaces, so a single word wider than the button does not wrap —
 * it draws straight through the border and into the next control. That is what the action bar
 * looked like: at 47 units a button, "Heroes" measures 40 and "Affairs" 38 against 37 units of
 * usable width, so both labels sat on their own outline, and with the Battle button present the
 * lanes drop to 41 and the words ran into each other across the seam. Vietnamese fails the other
 * way — "Ngoại giao" wraps to two lines 28 tall inside 36 units of button and touches both edges.
 *
 * So the label is measured after it is laid out and stepped down half a point at a time until it
 * fits both ways, with a floor so a hopeless case ends up small rather than invisible. It only ever
 * shrinks: a label that already fits is left at the size its caller asked for, which is why this
 * can sit in the shared button and change nothing on the screens that had the room all along.
 */
function fitTextToButton(
  text: Phaser.GameObjects.Text,
  bounds: UIBounds,
  fontSize: string,
  hasIcon: boolean,
  /** Height already spoken for by a second line under this one. */
  reserved = 0,
  frameless = false,
): void {
  const base = Number.parseFloat(fontSize) || 13;
  // 12 units of side padding is the border (1.6) plus its wobble plus the cut corner, doubled;
  // 10 vertical keeps a two-line label off the top corner where the status dot is stamped.
  const maxWidth = bounds.width
    - (frameless ? 4 : 12)
    - (hasIcon ? (frameless ? 24 : 30) : 0);
  const maxHeight = bounds.height - 10 - reserved;
  if (text.width <= maxWidth && text.height <= maxHeight) return;

  const floor = Math.max(9, base * 0.72);
  for (let size = base - 0.5; size >= floor; size -= 0.5) {
    text.setFontSize(size);
    if (text.width <= maxWidth && text.height <= maxHeight) return;
  }
  text.setFontSize(floor);
}

/**
 * One baked button face per (variant, state, size). Sizes repeat heavily — a modal's buttons
 * share a width — so the working set is small; the `ui` pool cap holds the rest. Rendered
 * through `stampDesign` (transform-respecting) because the drawing is in design units.
 *
 * The box leaves room for what the drawing does outside [0..w]x[0..h]: the shadow at +2.5, the
 * pressed drop at +2, and the border wobble either side.
 */
function buttonSurfaceStamp(
  scene: Phaser.Scene,
  width: number,
  height: number,
  variant: InkButtonVariant,
  pressed: boolean,
): Stamp {
  const w = Math.round(width);
  const h = Math.round(height);
  return stampDesign(scene, `ui:btn:${variant}:${pressed ? 1 : 0}:${w}x${h}`,
    { left: -6, right: w + 6, top: -6, bottom: h + 8 },
    (g, x, y) => {
      g.translateCanvas(x, y);
      drawButtonSurface(g, w, h, 8, variant, pressed);
      g.translateCanvas(-x, -y);
    }, { pool: 'ui' });
}

function drawButtonSurface(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  radius: number,
  variant: InkButtonVariant,
  pressed: boolean,
): void {
  const disabled = variant === 'disabled';
  const alpha = disabled ? 0.55 : 1;
  const palette = buttonPalette(variant, pressed);

  const drop = pressed ? 2 : 0;
  const seed = Math.round(width * 17 + height * 5 + (pressed ? 1 : 0));
  void radius;

  g.translateCanvas(0, drop);
  if (variant === 'ghost') {
    // Quiet, not absent. At the old 0.14 fill and 0.5 border this was a 1.15:1 contrast smudge —
    // and it is the variant the back and close buttons on every prompt, lane and sheet in Dragon
    // Ascent are drawn with, so the way out of a page was the least visible thing on it. Raised
    // until it reads as a control, and no further: the fill is still light and partial and the
    // border is still `softBrush`, so it stays plainly subordinate to `secondary` (opaque fill,
    // near-black border at 0.85, 1.6 wide) sitting next to it in the same footer.
    printedSurface(g, width, height, {
      fill: INK_UI.parchment, fillAlpha: pressed ? 0.55 : 0.45,
      border: palette.border, borderAlpha: 0.72 * alpha, borderWidth: 1.2, seed, shadow: false,
    });
  } else {
    printedSurface(g, width, height, {
      fill: pressed ? palette.bottom : palette.top, fillAlpha: alpha,
      border: palette.border, borderAlpha: 0.85 * alpha, borderWidth: 1.6, seed,
      shadow: false,
    });
    // A stamped seal at each end of a wide button, in place of the old arrow notches.
    if (width >= 220 && height >= 42) {
      const y = height / 2;
      const mark = variant === 'danger' ? INK_UI.goldLight : INK_UI.cinnabar;
      const rand = mulberry32(seed + 9);
      for (const cx of [17, width - 17]) {
        g.fillStyle(mark, disabled ? 0.2 : 0.5);
        for (let ray = 0; ray < 8; ray += 1) {
          const angle = (ray / 8) * Math.PI * 2 + rand() * 0.1;
          g.fillRect(cx + Math.cos(angle) * 3.4 - 0.8, y + Math.sin(angle) * 3.4 - 0.8, 1.6, 1.6);
        }
        g.fillCircle(cx, y, 1.5);
      }
    }
  }
  g.translateCanvas(0, -drop);
}

function buttonPalette(variant: InkButtonVariant, pressed: boolean): { top: number; bottom: number; border: number } {
  if (variant === 'primary') {
    // Sỏi son as an OUTLINE, not a fill.
    //
    // The scarcity law says the saturated red belongs to the player alone — their banner, their
    // seal, their losses. A list of six equal actions rendered as six red slabs spends it six
    // times on one screen and the map stops having a focal point. An inked border and red
    // lettering on paper still reads as "this is the action" while leaving the filled red to
    // `danger`, which is genuinely rare.
    return {
      top: pressed ? INK_UI.parchmentDark : INK_UI.parchment,
      bottom: INK_UI.parchmentDark,
      border: INK_UI.cinnabar,
    };
  }
  if (variant === 'danger') {
    return {
      top: pressed ? INK_UI.cinnabarDark : INK_UI.cinnabar,
      bottom: pressed ? 0x5e1e17 : INK_UI.cinnabarDark,
      border: INK_UI.brush,
    };
  }
  if (variant === 'ghost') {
    return { top: INK_UI.parchment, bottom: INK_UI.parchment, border: INK_UI.softBrush };
  }
  return {
    top: pressed ? INK_UI.parchmentDark : INK_UI.parchmentShade,
    bottom: pressed ? PIGMENT.diepDeep : INK_UI.parchmentShade,
    border: variant === 'disabled' ? INK_UI.softBrush : INK_UI.brush,
  };
}

function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
