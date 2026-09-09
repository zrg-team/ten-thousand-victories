import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { createInitialGameState } from '../state/GameState';
import { getDynasty } from '../state/dynasty';
import { CoronationSheet } from '../ui/coronation/CoronationSheet';
import { t } from '../i18n';
import { type MapItemRenderer } from '../ui/MapItemRenderer';
import { type MapRenderer } from '../ui/MapRenderer';
import { InkUI, type InkScrollArea, type UIBounds } from '../ui/InkUI';
import { Copilot } from '../ui/Copilot';
import { type SupportChannel } from '../data/support';
import { LANGUAGE_TOP, type MenuMode } from './menu/constants';
import * as backdrop from './menu/backdrop';
import * as dynasty from './menu/dynasty';
import * as dynastyLineage from './menu/dynastyLineage';
import * as dynastyTablet from './menu/dynastyTablet';
import * as front from './menu/front';
import * as install from './menu/install';
import * as tipBadge from './menu/tipBadge';
import * as landscape from './menu/landscape';
import * as leaves from './menu/leaves';
import * as legacyShop from './menu/legacyShop';
import * as settings from './menu/settings';
import * as sheets from './menu/sheets';
import * as shell from './menu/shell';
import * as support from './menu/support';
import * as temple from './menu/temple';
import * as water from './menu/water';

/**
 * The front page, and every page reachable from it without starting a run.
 *
 * ## What this file is now
 *
 * It reached 5,847 lines before being split into `./menu/`. What is left here is the *scene*:
 * every field, the Phaser lifecycle, the design-space scale (`vy`/`vh`), and a forwarding method
 * for each function another module needs to reach. The drawing lives in the modules, one per area
 * of the page, and each function there takes the scene as `self`.
 *
 * Three things to know before moving anything:
 *
 * - **The fields stay here on purpose.** Modules read and write them through `self`, and the
 *   harnesses reach into the live scene by name (`lotusIdleWaveLog`, `closeModal`), so these are
 *   load-bearing property names, not private detail.
 * - **Modules do not import each other.** A call that crosses a module boundary goes `self.foo()`,
 *   through the forwarding method below, which is why the tree has no import cycles. A function
 *   used only inside its own file is not exported and is called directly as `foo(self)`.
 * - **The exceptions are leaves.** `menu/constants.ts` and `menu/helpers.ts` import no sibling, so
 *   the modules import *them* directly rather than bouncing off the scene. Adding a sibling import
 *   to either is what would start a cycle.
 *
 * The cut is mechanical — `scripts/menu-split/` — and `verify.cjs` there proves every method body
 * is the same syntax tree it was.
 */
export class MenuScene extends Phaser.Scene {
  ui!: InkUI;

  mapRenderer!: MapRenderer;

  mapItems!: MapItemRenderer;

  content: Phaser.GameObjects.GameObject[] = [];

  /** The coffee modal, when open. Kept apart from `content` so a re-render underneath cannot orphan it. */
  modalObjects: Phaser.GameObjects.GameObject[] = [];

  /**
   * The one container a sheet's furniture lives in, at a depth above everything the page draws.
   *
   * Two jobs. It is what the input guard is told a sheet *is* (`registerSheet`), so a release from
   * a press that began under a sheet is refused by every control outside it — the same rule the
   * run's HUD has carried since the third *click Close, also click the menu behind* report, and
   * which this page never had. And its depth puts the sheet's objects at the top of the camera's
   * render list from their first frame, which is what `InputPlugin.sortGameObjects` ranks hits by:
   * an object not yet rendered sorts to the *bottom*, so a modal built inside a press handler lost
   * the same gesture's release to whatever was rendered beneath it. Reproduced on the dynasty
   * tablet: open the support sheet, release over the tablet under it, and the page changed.
   */
  modalLayer!: Phaser.GameObjects.Container;

  /**
   * Whether the install hint has already had its turn this visit.
   *
   * Once per page load, not once ever: somebody who has not installed after four visits has said
   * no four times, but they have also possibly never seen it — the strip shows for six seconds in
   * the corner of a page whose middle is a button they came to press. Shown again next launch,
   * never twice in one, and never at all once the game is running from the home screen.
   */
  installTipShown = false;

  installTipTimer?: Phaser.Time.TimerEvent;

  /** Set while the install sheet is up, so the tip does not re-arm underneath it. */
  installModalOpen = false;

  /**
   * Whether the tip badge has already had its turn this visit.
   *
   * Same rule as the install hint, and for the same reason: once per visit to the front page, and
   * never twice in one. A re-render — an update landing, an install prompt arriving — must not
   * deal a second card of advice over the first one.
   */
  tipBadgeShown = false;

  tipBadgeTimer?: Phaser.Time.TimerEvent;

  /**
   * What the tip badge leans over: the topmost thing on this page that starts a game.
   *
   * Written by whichever front page was drawn. On the phone column that is always Dragon Ascent;
   * on the desktop scroll a save puts Continue above it, and a card of advice that pointed past
   * the button the player is going to press would be pointing at the wrong one.
   */
  tipAnchor?: UIBounds;

  mode: MenuMode = 'main';

  /** Where Back goes from a page that another page opened: the shop and the king open from the
   *  dynasty page and must return there, not to the front page. */
  returnMode?: MenuMode;

  /**
   * Printed on the Continue line instead of the save's date when the page has just reloaded
   * itself to get its picture back and the run could not be re-entered on its own — see `create`.
   */
  reloadNote?: string;

  /**
   * The respec row, armed but not yet fired.
   *
   * Renouncing is the one destructive control on the menu — it hands a biography back to the table
   * — and it sat behind a single tap. Armed in place rather than behind a `confirm-*` page on
   * purpose: the chips the player is about to give up stay on screen while they decide, which is
   * precisely the information the decision needs. Cleared by anything that leaves the page.
   */
  respecArmed = false;

  /**
   * The scrolling body of whichever sub-page has one, so `clearContent` can dispose it.
   *
   * An `InkScrollArea` that is never destroyed leaves its global wheel handler hooked to a dead
   * scene — the same trap the prompt frames document. `this.content` holds the layer it draws into,
   * which destroys the objects but not the listener.
   */
  pageScroll?: InkScrollArea;

  /**
   * The Temple's open re-dress, kept across the page's own redraws.
   *
   * Every stepper tap re-renders the whole menu page, which destroys everything the sheet drew.
   * The king being dressed lives here instead, and is dropped by any navigation away — an
   * abandoned change must not be waiting, half-made, when the player comes back.
   */
  templeSheet?: CoronationSheet;

  /** The dynasty tablet's seal pulse, killed with the page it is stamped on. */
  dynastyPulse?: Phaser.Tweens.Tween;

  /**
   * The reign card open on the ledger, by its index in the lineage row; unset means the most
   * recent banked reign. Dropped on leaving the page, like the armed respec.
   */
  dynastyReign?: number;

  /** Whether the next epitaph draw counts its score in — set by a tap, never by a redraw. */
  dynastyCountIn = false;

  /** The lineage row's rectangle and selection, for the swipe that browses it. */
  lineageSwipe?: { top: number; bottom: number; count: number; selected: number; handled: number };

  lineageSwipeArmed = false;

  /** The open sheet's tap-outside / swipe-down listeners, removed by `closeModal`. */
  sheetDismiss?: { move: (pointer: Phaser.Input.Pointer) => void };

  /**
   * The page currently drawn, which is not always the page `render` is about to draw.
   *
   * `render` runs for four reasons that are not navigation — a setting toggled, a language
   * switched, the service worker changing its mind, an install prompt arriving — and a page that
   * replayed its arrival on each of those would flinch every time it was touched.
   */
  shownMode?: MenuMode;

  /** Finishes and releases the temporary roll/reveal before a redraw or scene shutdown. */
  menuOpening?: { finish: () => void; afterOpen?: () => void };

  /**
   * The leaves adrift over the sheet, and the last place a hand was.
   *
   * Not one leaf chasing a cursor: a handful of them on their own slow currents, and a pointer
   * that moves is a gust the nearest of them feel. Which is the difference between a page with a
   * pet on it and a page with weather.
   */
  leaves: Array<{
    blade: Phaser.GameObjects.Graphics;
    vx: number; vy: number; spin: number; phase: number; sway: number; flutter: number;
  }> = [];

  windLast = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };

  previewFlagSeed = 0;

  /**
   * The next unprompted swell under the lotus, while one is pending.
   *
   * Each wave schedules the one after it, so this holds a single live timer rather than a queue.
   * Kept on the scene only so the chain can be cut on the way out: a delayed call that fired into
   * a torn-down water layer would be spawning graphics into nothing.
   */
  lotusIdleWaveTimer?: Phaser.Time.TimerEvent;

  /**
   * The last few unprompted swells, newest last.
   *
   * Ambient motion is the one kind of thing a screenshot cannot prove: a wave that opens once
   * every several seconds is either absent or mid-fade in any single frame. The ledger lets the
   * living-map harness read what the water actually did instead of catching it at the right
   * instant. Bounded, because nothing here is worth growing for the life of the page.
   */
  readonly lotusIdleWaveLog: Array<{
    stem: string; x: number; y: number; duration: number; peak: number;
  }> = [];

  /**
   * The front-page tour, while it is running.
   *
   * Kept out of `content` for the same reason the coffee modal is: a re-render underneath would
   * destroy the tour's veil and leave its card floating over a page it no longer blocks.
   */
  copilot?: Copilot;

  /**
   * What the tour points at, filled in by `renderMain` as it lays the column out.
   *
   * The column is measured against the sheet's real height and the language's real line count, so
   * none of these rectangles exists until the page has been built. A tour step asks for its target
   * at the moment it is drawn and reads whatever is here — which is why the tour is started after
   * `render()` and not before it.
   */
  tourTargets: Partial<Record<'play' | 'classic' | 'footer' | 'skirmish', UIBounds>> = {};

  /** Set for this visit to the classic page, so a re-render cannot raise the tour twice. */
  classicTourDone = false;

  /** An explicit replay for this menu visit; consumed when its copilot opens. */
  replayCopilot = false;

  /**
   * Which page the standing tour belongs to.
   *
   * There are two of them on this scene now — the front page's and the classic page's — and the
   * guard in `render` that takes a tour down when the player navigates away has to know which one
   * is up. Without it that guard would tear down the classic tour the instant it appeared, since
   * its page is not `main`, and would mark the *front page's* flag as seen while doing it: one
   * tour destroyed on sight, the other silently never shown again.
   */
  copilotFor?: MenuMode;

  /**
   * The menu was drawn against an 844-tall sheet, but the design height now follows the device, so
   * on a phone with browser chrome it can be two hundred units shorter.
   *
   * Everything in the button column sits at a fixed y while the theme picker and language row are
   * anchored to the bottom — so a shorter sheet slid the two into each other and the tagline came
   * out underneath the theme tiles. These map the design's own coordinates into whatever vertical
   * band is actually left above those bottom rows, which also relieves a collision the 844 layout
   * already had whenever the legacy-shop button was showing.
   */
  get vScale(): number {
    const BOTTOM_ROWS = 140;   // the footer: utility buttons, flagged language row, and support
    const DESIGN_BOTTOM = 790; // lowest content y in the 844 design
    return Math.max(0.62, Math.min(1, (GAME_HEIGHT - BOTTOM_ROWS) / DESIGN_BOTTOM));
  }

  constructor() {
    super('MenuScene');
  }

  /* ---------------------------------------------------------- Phaser lifecycle */

  init(data?: { mode?: MenuMode; replayCopilot?: boolean }): void {
    // Another scene coming back to a page (the deck's Back returns to the dynasty page): the mode
    // rides in as scene data. Without it the scene restarts wherever it last was.
    if (data?.mode) this.mode = data.mode;
    this.replayCopilot = data?.replayCopilot === true;
    if (this.replayCopilot) this.classicTourDone = false;
  }

  create(): void { shell.create(this); }

  update(time: number, delta: number): void { leaves.update(this, time, delta); }

  /* ----- kept on the scene: the design-space scale every page lays out against */

  /** A design-space y in the band the device actually leaves. */
  vy(y: number): number {
    return Math.round(y * this.vScale);
  }

  /** A design-space height, scaled with its position so gaps stay proportional. */
  vh(height: number): number {
    return Math.round(height * this.vScale);
  }

  /* -------- the page frame: render, the title, page changes, leaving for a run */

  render(): void { shell.render(this); }

  revealPage(items: Phaser.GameObjects.GameObject[]): void { shell.revealPage(this, items); }

  footBackBar(): void { shell.footBackBar(this); }

  startGame(state: ReturnType<typeof createInitialGameState>): void { shell.startGame(this, state); }

  /* ------------------------------- the modal layer every sheet is adopted into */

  riseSheet(objects: Phaser.GameObjects.GameObject[]): void { sheets.riseSheet(this, objects); }

  adoptModal(): void { sheets.adoptModal(this); }

  closeModal(): void { sheets.closeModal(this); }

  armSheetDismiss(panel: UIBounds): void { sheets.armSheetDismiss(this, panel); }

  /* --------------------------------- the front page and the classic-modes page */

  renderMain(): void { front.renderMain(this); }

  renderClassic(): void { front.renderClassic(this); }

  startAscentRun(): void { front.startAscentRun(this); }

  renderConfirmNew(): void { front.renderConfirmNew(this); }

  /* --------------------------------------------- the Temple: dressing the king */

  renderTemple(): void { temple.renderTemple(this); }

  /* ----------------------------------------------------------- the Legacy shop */

  renderLegacyShop(): void { legacyShop.renderLegacyShop(this); }

  /* ---------------------------------------------------------- the dynasty page */

  renderDynastyTitleBar(title: string = t('dynasty.title'), withMark = true): number { return dynasty.renderDynastyTitleBar(this, title, withMark); }

  renderDynastySheet(): void { dynasty.renderDynastySheet(this); }

  openTraitSheet(id: string): void { dynasty.openTraitSheet(this, id); }

  /* -------------------------------------- the lineage row and its reign sheets */

  drawDynastyLineage(
    body: Phaser.GameObjects.Container,
    store: ReturnType<typeof getDynasty>,
    PAD: number,
    W: number,
    y: number,
    measure: (text: string, size: string, width: number) => number,
    bodyTop: number,
  ): number {
    return dynastyLineage.drawDynastyLineage(this, body, store, PAD, W, y, measure, bodyTop);
  }

  onLineageSwipe(pointer: Phaser.Input.Pointer): void { dynastyLineage.onLineageSwipe(this, pointer); }

  openReignsSheet(): void { dynastyLineage.openReignsSheet(this); }

  /* -------------------------------------- the dynasty tablet on the front page */

  renderDynastyTablet(x: number, y: number, width: number, height: number): void { dynastyTablet.renderDynastyTablet(this, x, y, width, height); }

  /* ------------------------------------------------------- the language line */

  renderLanguageSwitch(top = LANGUAGE_TOP): void { settings.renderLanguageSwitch(this, top); }

  /* ----------------------- the support row, the version line, the coffee sheet */

  renderSupportRow(): void { support.renderSupportRow(this); }

  renderVersionLine(): void { support.renderVersionLine(this); }

  renderSupportModal(activeId?: SupportChannel['id']): void { support.renderSupportModal(this, activeId); }

  /* ------------------------------------------- the install mark, tip and sheet */

  renderInstallMark(): void { install.renderInstallMark(this); }

  /* --------------------------------------- the tip badge over the play button */

  armTipBadge(): void { tipBadge.armTipBadge(this); }

  /* ------------------------------------------ the illustration behind the page */

  drawBackground(): void { backdrop.drawBackground(this); }

  /* ---------------------------------- the river, the wakes and the lotus swell */

  animateDongHoIllustration(
    bounds: { left: number; top: number; width: number; height: number },
    layers: {
      ground: Phaser.GameObjects.Image;
      mountains: Phaser.GameObjects.Image;
      mountainMist: Phaser.GameObjects.Container;
      waterFx: Phaser.GameObjects.Container;
      bamboo: Phaser.GameObjects.Image;
      bambooWind: Phaser.GameObjects.Image[];
      lotus: Phaser.GameObjects.Image;
    },
  ): void {
    water.animateDongHoIllustration(this, bounds, layers);
  }

  /* --------------------------------- the drawn landscapes for the other themes */

  drawAtlasLandscape(): void { landscape.drawAtlasLandscape(this); }

  drawLandscape(): void { landscape.drawLandscape(this); }

  drawArmies(): void { landscape.drawArmies(this); }

  drawFogBands(): void { landscape.drawFogBands(this); }

  /* ------------------------------------------ the drifting leaves and the wind */

  drawDriftingLeaves(): void { leaves.drawDriftingLeaves(this); }
}
