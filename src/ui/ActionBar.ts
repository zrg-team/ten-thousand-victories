import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, isCampaignMode, uiColumnX } from '../game/constants';
import type { GameState } from '../state/types';
import {
  markControlBorn, noteControlFired, pressIsEchoOnto, releaseNotOwnedBy, setContainerInputEnabled,
} from './inputGeneration';
import { InkUI, INK_UI, INK_UI_HEX } from './InkUI';
import { CARD_ICON_SIZE, drawCardIcon, type CardIconId } from './CardIcons';
import { sawtoothBand } from './ink/devices';
import { t } from '../i18n';
import { placeStamp, stampDesign } from './ink/stamp';
import { soundDirector } from './sound/SoundDirector';
import { gameplayControl } from './GameplayControl';
import { isDesktopPlatform } from '../platform/layout';

const EMPIRE_KEYS = ['build', 'heroes', 'court', 'army', 'affairs', 'directives', 'pause'] as const;
const CAMPAIGN_KEYS = ['build', 'heroes', 'court', 'army', 'affairs', 'pause'] as const;
const RIVAL_KEYS = ['build', 'heroes', 'court', 'army', 'pause'] as const;
/**
 * Dragon Ascent's bar is the classic menu, not a new one: the same Build / Heroes / Court /
 * Army / Affairs screens the other modes have, plus this mode's Codex. Conquest is reached
 * the classic way too — by selecting a province on the map — so it needs no button here.
 */
/**
 * The Codex is deliberately **not** here.
 *
 * It is the permanent collection across runs — mostly rows reading "???" for champions not yet
 * summoned — and mid-run there is nothing to be done about any of it. A button on the action bar
 * is a standing promise that something behind it is worth doing now, and this one could not keep
 * it. The number that *does* matter in a run, how much of the roster has been recorded, already
 * appears on the founder card where it frames the choice being made.
 *
 * It is still reachable at the end of a run, which is the moment the collection changes and the
 * only moment a player has any reason to look at it. See `showRunOver`.
 */
/**
 * The Codex's slot now carries the Chronicle.
 *
 * The Codex could not keep the bar's standing promise that something behind a button is worth
 * doing *now* — it is a cross-run collection, mostly rows reading "???", and nothing in it can be
 * acted on mid-run. A Chronicle can: it is what has happened to this realm, this run, and the one
 * screen a player reaches for while playing.
 */
const ASCENT_KEYS = ['build', 'heroes', 'court', 'army', 'affairs', 'chronicle'] as const;

/**
 * Dragon Ascent's two system controls, drawn as glyphs at the right edge rather than as
 * labelled screens.
 *
 * They are separated because they answer different questions and were previously answered by
 * one button. `pause` stops the clock so the player can *think*; `menu` is where the run is
 * saved and left. The old single button was labelled Pause/Resume — a time toggle — but opened
 * the quit sheet, so the only way to un-pause was through a menu that looked like an exit.
 */
const ASCENT_SYSTEM_KEYS = ['pause', 'menu'] as const;

/**
 * The răng cưa band across the bar's top edge: where it starts, and how tall it is.
 *
 * Named rather than typed inline because the buttons are placed *from* it. It lost a unit of
 * height when they were — 5 to 4 — which is the difference between the bar having six units of
 * slack to spend on margins and having eight. At this size the tooth is two pixels either way and
 * nothing about the drum reads differently; the four units of air it bought are visible.
 */
const BAND_TOP = 2;
const BAND_HEIGHT = 4;
/** Air between the band and the buttons, and between the buttons and the foot of the screen. */
const BUTTON_CLEAR = 4;

export const ACTION_BUTTON_HEIGHT = 36;
/**
 * The type size the row is set in, and the floor it will not go below.
 *
 * 11 is the size the bar was fixed at, and it was a size for six English words: at 49 units a
 * button "Heroes" measures 40 against 37 units of usable width, so it drew over its own border.
 * 9 is where a bar label stops being readable at arm's length, so a row that cannot fit at 9 —
 * seven Vietnamese lanes with a siege running — is left slightly tight rather than illegible.
 */
const MAX_BAR_FONT = 11;
const MIN_BAR_FONT = 9;
/**
 * How small the row will go to keep every lane on ONE line.
 *
 * Below the readable floor on purpose, and it is the right trade here: "Ngoại giao" needs 48 units
 * at 9px against the 46 a lane has, so the whole row missing one line by two units is what put
 * half the bar's words a line lower than the other half. 8 buys the alignment back, and the glyph
 * over each word is carrying the identification now.
 */
const NOWRAP_BAR_FONT = 8;
/**
 * The buttons' centre line — measured down from the band, not taken as the middle of the bar.
 *
 * `GAME_HEIGHT - ACTION_BAR_HEIGHT / 2` is what this was, and centring is exactly what went wrong:
 * the bar is not symmetrical. It carries a hairline and a drum band across its top eight units and
 * nothing at all across its bottom, so a 36-unit button centred in 50 units of bar starts at seven
 * — one unit INSIDE the band — and the sawtooth ran through the top edge of every label. Placed
 * from the band instead, the arithmetic has to add up and says so: 6 of band + 4 + 36 + 4 = 50.
 */
export const ACTION_BUTTON_Y = GAME_HEIGHT - ACTION_BAR_HEIGHT
  + BAND_TOP + BAND_HEIGHT + BUTTON_CLEAR + ACTION_BUTTON_HEIGHT / 2;

/** Compact phone controls; the desktop cluster gets wider paper and separate 44-unit targets. */
const SYSTEM_BUTTON_WIDTH = 28;
const SYSTEM_CLUSTER_GAP = 10;

/**
 * One mark per lane, so the row can be read without reading it.
 *
 * The bar was six torn-paper buttons in a line, each with a border, a shade and a two-line
 * Vietnamese label inside 47 units — six frames competing for the same corner of the eye, and the
 * only way to tell one from another was to stop and read the type. A glyph is recognised where a
 * word has to be read, so the glyph carries the identity and the word confirms it.
 *
 * Drawn from `CardIcons`, which is the game's existing icon vocabulary rather than a second one:
 * the hammer over Build is the same hammer a build card prints.
 */
const LANE_ICONS: Record<string, CardIconId> = {
  build: 'hammer',
  heroes: 'person',
  court: 'crown',
  army: 'spears',
  affairs: 'globe',
  directives: 'banner',
  chronicle: 'scroll',
  battle: 'blade',
  pause: 'hourglass',
};

/**
 * The glyph's size on the bar: 26 × 0.68, so about 18 units.
 *
 * It went 0.46 → 0.42 → 0.68 across one afternoon, and the middle number is the interesting one.
 * At 0.46 the Vietnamese lanes wrapped to two lines and the second was printed off the bottom
 * edge, so the glyph was cut to buy the type its room. Setting the whole row at whatever size
 * keeps *every* lane on one line then handed all of that room back at once — a single line is
 * thirteen units where two were twenty-six — and a glyph sized for the crisis was left sitting in
 * the middle of it. The mark carries the identification now, so it takes the space.
 */
const LANE_ICON_SCALE = 0.68;
/**
 * And the glyph the *crowded* row gets instead.
 *
 * One row in the game cannot be set on a single line at any size: Dragon Ascent in Vietnamese with
 * a siege running, which is eight slots and lanes of 41 units. That row wraps, two lines are 22
 * units of type, and the large glyph leaves 20 for them — so its second line printed one and a
 * half units below the foot of the screen. The row that has to wrap gets the small mark back, and
 * every other row keeps the large one.
 */
const LANE_ICON_SCALE_WRAPPED = 0.42;
/** Air above the glyph, and between the glyph and the word under it. */
const ICON_TOP_PAD = 1;
const ICON_TEXT_GAP = 1;

/** Where the label's first line starts, measured from the centre of the lane's box. */
function laneTextTop(scale: number): number {
  return -ACTION_BUTTON_HEIGHT / 2 + ICON_TOP_PAD + CARD_ICON_SIZE * scale + ICON_TEXT_GAP;
}

/** One button's place on the bar. Produced by `actionBarSlots`, which owns all bar geometry. */
export interface ActionSlot {
  action: string;
  x: number;
  width: number;
  /** Icon-only control pinned to the right edge, drawn as a glyph rather than a label. */
  system: boolean;
}

export interface ActionBarContext {
  /** Ascent only: the Battle button exists exactly while there is a siege to watch. */
  battleLive?: boolean;
}

export function getActionKeys(gameMode: string, context: ActionBarContext = {}): readonly string[] {
  if (gameMode === 'ascent') {
    // `battle` sits first because while a siege is live it is the only thing that matters, and
    // it is the one button that appears and disappears with the state of the world. A button
    // that is present with nothing behind it is worse than no button: tapping it used to open
    // an empty screen with no way back.
    const lanes = context.battleLive ? ['battle', ...ASCENT_KEYS] : [...ASCENT_KEYS];
    return [...lanes, ...ASCENT_SYSTEM_KEYS];
  }
  if (gameMode === 'empire') return [...EMPIRE_KEYS];
  return isCampaignMode(gameMode) ? [...CAMPAIGN_KEYS] : [...RIVAL_KEYS];
}

/** Preferred label width, before the fit-to-screen clamp below. */
function getButtonWidth(gameMode: string): number {
  if (gameMode === 'ascent' || gameMode === 'empire') return 50;
  return isCampaignMode(gameMode) ? 60 : 72;
}

/**
 * Air between two buttons.
 *
 * Two units was not a gap. Each button is drawn as a torn sheet — a wobbled contour with a 1.6-unit
 * border and a shadow offset a unit and a half down-right — so at two units of nominal clearance
 * the ink of one button reached the ink of the next and the six lanes read as one crowded ribbon.
 * Three is the least that shows daylight at this scale, and it costs the lanes one unit of width.
 */
function getButtonGap(gameMode: string): number {
  if (gameMode === 'ascent' || gameMode === 'empire') return 3;
  return isCampaignMode(gameMode) ? 3 : 4;
}

function getButtonMargin(gameMode: string): number {
  if (gameMode === 'ascent' || gameMode === 'empire') return 5;
  return isCampaignMode(gameMode) ? 7 : 6;
}

function isSystemKey(gameMode: string, action: string): boolean {
  return gameMode === 'ascent' && (ASCENT_SYSTEM_KEYS as readonly string[]).includes(action);
}

/**
 * Every button's rectangle, laid out to fit the screen.
 *
 * The bar used to be `margin + index * (width + gap)` with a fixed width, which silently ran
 * off the right edge as soon as a mode had one button too many: Dragon Ascent's eight buttons
 * needed 420px of a 390px screen, so Pause was drawn 30px past the edge and could not be
 * pressed at all. Widths are now derived from the space actually available, so adding a button
 * makes the others narrower instead of pushing one off the world.
 *
 * The single source of truth for the bar's geometry: `ActionBar` draws from it and `UIScene`
 * hit-tests against it, so the two cannot drift.
 */
/**
 * How a bar wider than the column lays itself out — the desktop's bottom bar.
 *
 * The lanes are centred as one group with a hand's width each, the way a command row sits under
 * the map in every strategy game, and the pause/menu cluster leaves the row for the top bar's
 * right end, where a desktop keeps its clock and its menu (`clusterDy` lifts it there). On the
 * column the row is the phone's: lanes from the left margin, cluster pinned right, same height.
 */
export interface ActionBarLayout {
  centreLanes?: boolean;
  laneWidth?: number;
  laneGap?: number;
  /** Vertical shift of the system cluster from the bar's row; negative lifts it to the top bar. */
  clusterDy?: number;
  /**
   * The x the lane group must not cross, read at layout time. The desktop docks its lane pages at
   * the sheet's right edge, and a lane button under a docked page is a button the page covers:
   * on a sheet narrower than 16:9 the centred group would run under the dock, so it is centred
   * only as far as the dock allows and the lanes narrow to fit beside it. A function rather than
   * a number because the dock moves when the window is resized.
   */
  laneRight?: () => number;
}

/** The desktop row: 76-wide lanes, centred beside the dock, with the cluster lifted into the top bar. */
export const DESKTOP_BAR_LAYOUT: ActionBarLayout = {
  centreLanes: true, laneWidth: 76, laneGap: 8, clusterDy: HEADER_HEIGHT / 2 - ACTION_BUTTON_Y, laneRight: () => uiColumnX() - 12,
};

export function actionBarSlots(gameMode: string, context: ActionBarContext = {}, width = GAME_WIDTH, layout: ActionBarLayout = {}): ActionSlot[] {
  const keys = getActionKeys(gameMode, context);
  const margin = getButtonMargin(gameMode);
  const gap = layout.laneGap ?? getButtonGap(gameMode);

  const laneKeys = keys.filter((key) => !isSystemKey(gameMode, key));
  const systemKeys = keys.filter((key) => isSystemKey(gameMode, key));
  const systemWidth = layout.clusterDy ? 36 : SYSTEM_BUTTON_WIDTH;
  const systemGap = layout.clusterDy ? 12 : gap;

  const clusterWidth = systemKeys.length > 0
    ? systemKeys.length * systemWidth + (systemKeys.length - 1) * systemGap
    : 0;
  const reserved = systemKeys.length > 0 ? clusterWidth + SYSTEM_CLUSTER_GAP : 0;

  const laneRight = Math.min(width - margin - reserved, layout.laneRight?.() ?? Number.POSITIVE_INFINITY);
  const laneSpace = laneRight - margin - Math.max(0, laneKeys.length - 1) * gap;
  const laneWidth = laneKeys.length > 0
    ? Math.max(28, Math.min(layout.laneWidth ?? getButtonWidth(gameMode), Math.floor(laneSpace / laneKeys.length)))
    : 0;
  const groupWidth = laneKeys.length * laneWidth + Math.max(0, laneKeys.length - 1) * gap;
  const laneLeft = layout.centreLanes
    ? Math.max(margin, Math.min(Math.round((width - groupWidth) / 2), laneRight - groupWidth))
    : margin;

  const slots: ActionSlot[] = laneKeys.map((action, index) => ({
    action,
    x: laneLeft + index * (laneWidth + gap),
    width: laneWidth,
    system: false,
  }));

  // Pinned to the right edge rather than trailing the lanes, so Pause and Menu stay put when
  // the Battle button appears mid-siege and the lanes reflow around it.
  const clusterLeft = width - (layout.clusterDy ? 12 : margin) - clusterWidth;
  systemKeys.forEach((action, index) => {
    slots.push({
      action,
      x: clusterLeft + index * (systemWidth + systemGap),
      width: systemWidth,
      system: true,
    });
  });

  return slots;
}

/** The slot under a screen-space x, or undefined between/outside the buttons. */
export function actionSlotAt(gameMode: string, x: number, context: ActionBarContext = {}): ActionSlot | undefined {
  return actionBarSlots(gameMode, context).find((slot) => x >= slot.x && x <= slot.x + slot.width);
}

export class ActionBar extends Phaser.GameObjects.Container {
  /**
   * **Hiding this bar has to switch its buttons off, because Phaser will not.**
   *
   * `setVisible(false)` stops the bar being drawn and leaves every one of its hit areas live. That
   * is not a quirk of this class, it is how Phaser 4 works: adding a child to a Container sets the
   * child's `displayList` to `null` (`Container.addHandler` -> `removeFromDisplayList`), and
   * `GameObject.willRender` only ever consults `displayList` — never `parentContainer`. So the
   * input manager hit-tests a hidden container's children exactly as if they were on screen.
   *
   * `renderActionBar` hides this bar under every sheet and prompt. Its eight lane buttons therefore
   * stayed pressable underneath, directly beneath the footer of whatever sheet was open — and the
   * footer is where a sheet puts its Close. One press, two controls: the sheet closed on the press
   * and the lane under it fired on the release.
   *
   * Reported three times as *"click close button in modal -> also click on behind bottom bar"*.
   */
  setVisible(value: boolean): this {
    super.setVisible(value);
    setContainerInputEnabled(this, value);
    return this;
  }

  private readonly gameMode: string;
  private readonly ui: InkUI;
  private buttonObjects: Phaser.GameObjects.GameObject[] = [];

  /**
   * Optional per-button status dot. Dragon Ascent uses it to carry each lane's
   * ready/busy/alert state onto the bar, so relocating the lanes here loses none of the
   * at-a-glance signal the old top strip carried. Return `undefined` for no dot.
   */
  statusColor?: (action: string) => number | undefined;

  /** Extra state the key set depends on. Supplied by the scene, read on every refresh. */
  context: () => ActionBarContext = () => ({});

  /** Where a lane's button stands, so a card can point at it. Undefined for a lane not on the bar. */
  slotBounds(action: string): { x: number; y: number; width: number; height: number } | undefined {
    const slot = actionBarSlots(this.gameMode, this.context(), this.barWidth, this.layout).find((candidate) => candidate.action === action);
    if (!slot) return undefined;
    const dy = slot.system ? (this.layout.clusterDy ?? 0) : 0;
    return { x: slot.x, y: ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2 + dy, width: slot.width, height: ACTION_BUTTON_HEIGHT };
  }

  /**
   * The bar's own width. The column on the phone; the whole sheet on the desktop, where the lanes
   * start at the left margin and the system cluster is pinned to the right edge — the bottom bar
   * every strategy game has. Buttons keep their per-mode width; only the space between the two
   * groups grows.
   */
  readonly barWidth: number;
  readonly layout: ActionBarLayout;

  constructor(
    scene: Phaser.Scene,
    private readonly gameState: GameState,
    private readonly onAction: (action: string) => void,
    opts: { width?: number; layout?: ActionBarLayout } = {},
  ) {
    super(scene, 0, 0);
    this.gameMode = gameState.gameMode;
    this.barWidth = opts.width ?? GAME_WIDTH;
    this.layout = opts.layout ?? {};
    this.setDepth(420);
    this.ui = new InkUI(scene);

    const top = GAME_HEIGHT - ACTION_BAR_HEIGHT;
    const width = this.barWidth;
    this.add(scene.add.rectangle(0, top, width, ACTION_BAR_HEIGHT, INK_UI.backgroundInk, 0.97).setOrigin(0, 0));
    // The same drum band as the resource strip, so the two ends of the screen are one frame.
    // Baked for the same reason as the header's frieze: static teeth, every frame, all game.
    const bandStamp = stampDesign(scene, `ui:band:foot:${width}x${ACTION_BAR_HEIGHT}`,
      { left: 0, right: width, top: 0, bottom: ACTION_BAR_HEIGHT },
      (g, x, y) => {
        g.translateCanvas(x, y - top);
        g.lineStyle(1, INK_UI.softBrush, 0.35);
        g.lineBetween(0, top + 0.5, width, top + 0.5);
        sawtoothBand(g, 10, top + BAND_TOP, width - 20, BAND_HEIGHT, 0.45);
        g.translateCanvas(-x, -(y - top));
      }, { pool: 'ui' });
    this.add(placeStamp(scene, bandStamp, 0, top));

    scene.add.existing(this);
    this.buildButtons();
  }

  /** What the bar was last built from, so a refresh that changes nothing rebuilds nothing. */
  private refreshKey = '';

  /** Measured row layouts, keyed by the labels and lane width that decide them. The probe-Text
   *  search costs a dozen canvas measures; the same label set always lands on the same answer. */
  private readonly fontMemo = new Map<string, { size: number; scale: number }>();

  refresh(): void {
    // The bar was cleared and rebuilt — five to nine buttons, each a Graphics surface, a Text
    // and listeners — on every state-changed emit, which is every tick and every battle beat.
    // Everything it prints is in this key; a quiet refresh is now a string compare.
    const paused = this.gameState.isStrategyPause;
    const slots = actionBarSlots(this.gameMode, this.context(), this.barWidth, this.layout);
    const key = [
      paused ? 1 : 0,
      ...slots.map((slot) => `${slot.action}:${slot.x}:${slot.width}:${slot.system ? 1 : 0}`
        + `:${this.slotLabel(slot.action, paused)}:${this.statusColor?.(slot.action) ?? ''}`),
    ].join('|');
    if (key === this.refreshKey) return;
    this.refreshKey = key;
    this.clearButtons();
    this.buildButtons();
  }

  private clearButtons(): void {
    for (const btn of this.buttonObjects) {
      this.remove(btn, true);
    }
    this.buttonObjects = [];
  }

  /** What is printed on a lane button. Read twice per refresh: once to size the row, once to draw it. */
  private slotLabel(action: string, paused: boolean): string {
    if (action === 'pause') return paused ? t('action.resume') : t('action.pause');
    if (action === 'directives') return t('empire.action.directives');
    return t(`action.${action}` as Parameters<typeof t>[0]);
  }

  /**
   * One type size for the whole row, chosen from the longest label on it.
   *
   * `InkUI.button` will shrink a label that does not fit its own button, which is what stops a word
   * running through its border — but done button by button it produced a bar set in four sizes at
   * once (Build at 11, Heroes at 10, Affairs at 10.5, Battle at 9), and a row of equal buttons in
   * ragged type reads as a mistake even when every word fits. So the row is measured as a set and
   * the largest size that suits all of it is used for all of it.
   *
   * Measured on a throwaway Text rather than estimated from character counts: Vietnamese labels
   * wrap to two lines ("Ngoại giao") and the wrap decides the height, which is half of what has to
   * fit.
   */
  private barFontSize(labels: string[], laneWidth: number): { size: number; scale: number } {
    // Four units of clearance rather than twelve: there is no border for the type to run through
    // any more, only air, so the lane gets its own width back — which is what pays for the glyph
    // above the word without the word shrinking to fit under it.
    const maxWidth = laneWidth - 4;
    // What is left under the glyph, derived from the same three numbers `buildLaneButton` places
    // it with rather than restated as a constant — the two disagreeing is how a row gets chosen at
    // a size it cannot actually be drawn at. The `BUTTON_CLEAR` below the box counts: the type
    // sits in it by design.
    const maxHeight = ACTION_BUTTON_HEIGHT / 2 + BUTTON_CLEAR - laneTextTop(LANE_ICON_SCALE_WRAPPED);
    const probe = this.ui.label(0, 0, '', 'button', { align: 'center' });
    probe.setVisible(false);

    /**
     * **One line for every lane, if the row can be had at all.**
     *
     * The frames came off and the ragged edge they had been hiding came with them: "Xây" and "Sử
     * Ký" stand one line tall while "Triều đình" and "Ngoại giao" stand two, so half the row's
     * words ended a line lower than the other half and the bar read as six things at five
     * different heights. Aligned type is worth more here than large type — the glyph above each
     * word is what identifies the lane now, and the word underneath it only confirms.
     *
     * So the row is set at the largest size at which *nothing wraps*, down to 8. Only if even 8
     * cannot hold the longest label does it fall back to the wrapping fit below, which is the
     * seven-Vietnamese-lanes-with-a-siege case and is left slightly ragged rather than illegible.
     */
    probe.setWordWrapWidth(null);
    for (let size = MAX_BAR_FONT; size >= NOWRAP_BAR_FONT; size -= 0.5) {
      probe.setFontSize(size);
      const fits = labels.every((text) => {
        probe.setText(text);
        return probe.width <= maxWidth;
      });
      if (fits) {
        probe.destroy();
        return { size, scale: LANE_ICON_SCALE };
      }
    }

    probe.setWordWrapWidth(maxWidth);
    let chosen = MIN_BAR_FONT;
    for (let size = MAX_BAR_FONT; size >= MIN_BAR_FONT; size -= 0.5) {
      probe.setFontSize(size);
      const fits = labels.every((text) => {
        probe.setText(text);
        return probe.width <= maxWidth && probe.height <= maxHeight;
      });
      if (fits) {
        chosen = size;
        break;
      }
    }
    probe.destroy();
    return { size: chosen, scale: LANE_ICON_SCALE_WRAPPED };
  }

  private buildButtons(): void {
    const paused = this.gameState.isStrategyPause;
    const top = ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2;
    const slots = actionBarSlots(this.gameMode, this.context(), this.barWidth, this.layout);
    const laneWidth = slots.find((slot) => !slot.system)?.width ?? 0;
    const labels = slots.filter((slot) => !slot.system).map((slot) => this.slotLabel(slot.action, paused));
    const fontKey = `${labels.join('')}|${laneWidth}`;
    let fit = this.fontMemo.get(fontKey);
    if (!fit) {
      fit = this.barFontSize(labels, laneWidth);
      this.fontMemo.set(fontKey, fit);
    }
    const { size: fontSize, scale: iconScale } = fit;

    for (const slot of slots) {
      // A system button rides the layout's lift: on the desktop the cluster sits in the top bar.
      const dy = slot.system ? (this.layout.clusterDy ?? 0) : 0;
      const bounds = { x: slot.x, y: top + dy, width: slot.width, height: ACTION_BUTTON_HEIGHT };

      if (slot.system) {
        this.buildSystemButton(slot, bounds, paused);
        continue;
      }

      this.buildLaneButton(slot, bounds, this.slotLabel(slot.action, paused), fontSize, paused, iconScale);
      this.addStatusDot(slot, top, iconScale);
    }

    if (!this.layout.clusterDy) this.buildSeparator(slots, top);
  }

  /**
   * One lane: a mark over a word, on open paper.
   *
   * **No surface at all.** Every lane used to be a torn sheet with its own border and shade, which
   * is six printed boxes across the foot of a screen that is itself a printed sheet — the frames
   * were most of the ink down there and none of the meaning. What tells a player this is pressable
   * is that it is a row of marks in a bar at the bottom of the screen, and it always was; the
   * borders were saying it a seventh and eighth time.
   *
   * Loudness is carried by the ink instead of by a fill: a live siege inks its lane in sỏi son
   * rather than being printed white-on-red, and a paused clock does the same to Pause.
   *
   * Built here rather than through `InkUI.button` because that one sets its glyph *beside* the
   * label as one centred group — right for a 200-unit sheet button, wrong for a 47-unit lane where
   * the only way to fit both is to stack them.
   */
  private buildLaneButton(
    slot: ActionSlot,
    bounds: { x: number; y: number; width: number; height: number },
    label: string,
    fontSize: number,
    paused: boolean,
    iconScale: number,
  ): void {
    // The container is placed at the lane's *centre* so the press tween scales about the middle
    // of the mark. Anchored top-left it would shrink towards the corner, which reads as the
    // button sliding rather than being pushed.
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const container = this.scene.add.container(cx, cy);

    const loud = slot.action === 'battle' || (slot.action === 'pause' && paused);
    const tone = loud ? INK_UI.cinnabar : INK_UI.brush;

    const icon = drawCardIcon(this.scene, LANE_ICONS[slot.action] ?? 'scroll', tone);
    icon.setScale(iconScale);
    icon.setAlpha(loud ? 1 : 0.88);
    const iconHeight = CARD_ICON_SIZE * iconScale;
    icon.setPosition(0, -bounds.height / 2 + ICON_TOP_PAD + iconHeight / 2);

    const text = this.ui.label(0, 0, label, 'button', {
      color: loud ? '#8a2a1b' : INK_UI_HEX.inkText,
      fontSize: `${fontSize}px`,
      align: 'center',
      wordWrap: { width: bounds.width - 4 },
    }).setOrigin(0.5, 0);
    text.setY(laneTextTop(iconScale));

    const hit = this.scene.add
      .rectangle(0, 0, bounds.width, bounds.height + 8, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    // The bar draws its own buttons (the glyph sits above the label, which `InkUI.button`
    // cannot do), so it does not inherit InkUI's press sound and was silent. Each lane has
    // its own paper — see `SoundDirector.lane`.
    this.wirePress(hit, container, () => {
      soundDirector.lane(slot.action);
      this.onAction(slot.action);
    });

    container.add([icon, text, hit]);
    this.add(container);
    this.buttonObjects.push(container);
  }

  /**
   * The press, as a movement rather than as a redrawn surface.
   *
   * A framed button could say "pressed" by reprinting itself a shade darker and a unit lower.
   * With the frames gone there is nothing to reprint, so the mark itself takes the push: down to
   * 0.86 under the finger, and back on a small overshoot when it lifts. The overshoot is the part
   * that reads as a *button* and not as a fade — 1.06 for 90ms is enough to feel and too quick to
   * look like an animation.
   *
   * `killTweensOf` first, because a second tap arriving mid-spring would otherwise compose two
   * scales and leave the lane permanently small.
   */
  private wirePress(
    hit: Phaser.GameObjects.Rectangle,
    target: Phaser.GameObjects.Container,
    onClick: () => void,
  ): void {
    const stop = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation();

    const settle = (): void => {
      this.scene.tweens.killTweensOf(target);
      this.scene.tweens.add({
        targets: target,
        scale: { from: target.scale, to: 1 },
        duration: 150,
        ease: 'Back.easeOut',
      });
    };

    hit.on('pointerdown', (p: Phaser.Input.Pointer, lx: number, ly: number, e: Phaser.Types.Input.EventData) => {
      stop(p, lx, ly, e);
      this.scene.tweens.killTweensOf(target);
      this.scene.tweens.add({ targets: target, scale: 0.86, duration: 70, ease: 'Quad.easeOut' });
    });
    // A finger that slides off a lane must not leave it pressed — and on a bar this narrow,
    // sliding off is how a mis-tap is corrected.
    hit.on('pointerout', () => settle());
    hit.on('pointerup', (p: Phaser.Input.Pointer, lx: number, ly: number, e: Phaser.Types.Input.EventData) => {
      stop(p, lx, ly, e);
      settle();
      // The bar is rebuilt the instant a sheet closes, and a sheet closes on the *press*. Without
      // this the release of that same press lands on a lane that was not on screen when the
      // player decided to press anything — reported as *click Close, also click the menu behind*.
      if (releaseNotOwnedBy(hit)) return;
      // A bar rebuilt by the press that closed a sheet, then pressed again by that press's echo
      // (a phone's compat mouse pair, a ghost click) — see `pressIsEchoOnto`.
      if (pressIsEchoOnto(hit, p)) return;
      noteControlFired(p);
      onClick();
    });
    markControlBorn(hit);
  }

  /** A soft ink rule separates the lane labels from the clock and menu controls. */
  private buildSeparator(slots: ActionSlot[], top: number): void {
    const firstSystem = slots.find((slot) => slot.system);
    if (!firstSystem) {
      return;
    }
    const rule = this.scene.add.graphics();
    rule.lineStyle(1, INK_UI.softBrush, 0.32);
    const x = firstSystem.x - SYSTEM_CLUSTER_GAP / 2;
    rule.lineBetween(x, top + 5, x, top + ACTION_BUTTON_HEIGHT - 5);
    this.add(rule);
    this.buttonObjects.push(rule);
  }

  /** The clock and menu share the map controls' paper, ink weight, and press feedback. */
  private buildSystemButton(slot: ActionSlot, bounds: { x: number; y: number; width: number; height: number }, paused: boolean): void {
    const isPause = slot.action === 'pause';
    const lifted = Boolean(this.layout.clusterDy);
    const shortcut = isDesktopPlatform() ? (isPause ? ' · Space' : ' · Esc') : '';
    const container = gameplayControl(this.scene, {
      x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
      width: bounds.width, height: 30,
      treatment: lifted ? 'quiet' : 'paper',
      hitWidth: lifted ? 44 : bounds.width + getButtonGap(this.gameState.gameMode),
      icon: isPause ? (paused ? 'play' : 'pause') : 'menu',
      label: this.slotLabel(slot.action, paused) + shortcut,
      active: isPause && paused, hintSide: lifted ? 'below' : 'above',
      onClick: () => this.onAction(slot.action),
    });
    this.add(container);
    this.buttonObjects.push(container);
    this.addStatusDot(slot, bounds.y);
  }

  /**
   * The dot, stamped on the button's cut corner rather than inside it.
   *
   * Seven units in from the corner put it in the one place the label also wants: with a lane
   * 47 units wide an English label measured up to 40 and a wrapped Vietnamese one stands two lines
   * tall, so the dot landed on the type — on the "t" of Court, over the second line of "Triều
   * đình". Moved onto the corner itself it overlaps only the chamfer, which is paper, and the ring
   * behind it keeps it legible where it crosses the button's own border.
   */
  private addStatusDot(slot: ActionSlot, top: number, iconScale = LANE_ICON_SCALE): void {
    const dot = this.statusColor?.(slot.action);
    if (dot === undefined) return;
    // Drawn as siblings rather than children of the button, so the press tween (which scales the
    // whole container) does not make the dot pulse with it.
    //
    // Beside the glyph, not on the lane's top-right corner. The corner was clear while the label
    // was centred in a framed button; with the word set full-width under the mark, a dot at the
    // corner is a dot on the last letter of "Triều đình" — `verify-action-bar` caught it on three
    // of the eight rows. Level with the glyph and just outside it, there is nothing to land on:
    // the type starts below the mark, and the mark is 18 units wide in a 47-unit lane.
    const iconHalf = (CARD_ICON_SIZE * iconScale) / 2;
    const x = slot.system
      ? slot.x + slot.width - 4
      : Math.min(slot.x + slot.width - 4, slot.x + slot.width / 2 + iconHalf + 4);
    const y = top + ICON_TOP_PAD + 4;
    const ring = this.scene.add.circle(x, y, 4.6, INK_UI.parchment, 1);
    const marker = this.scene.add.circle(x, y, 3.2, dot, 0.95);
    this.add(ring);
    this.add(marker);
    this.buttonObjects.push(ring, marker);
  }
}
