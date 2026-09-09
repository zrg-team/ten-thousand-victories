/**
 * The page frame: `create`, `render`, the title, the page switch, arrival and teardown, and the
 * two ways out — starting a run, and the Continue sheet a lost run is offered through.
 *
 * `continueOffered` lives here with `create`, the only code that reads or sets it.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, isDesktopSheet } from '../../game/constants';
import { createInitialGameState } from '../../state/GameState';
import { loadSnapshot, pendingAutosave, snapshotLabel } from '../../state/save';
import { hasSeenTour, markClassicTourSeen, markTourSeen, requestGuidedRun } from '../../state/tour';
import { t } from '../../i18n';
import { subscribeUpdateStatus } from '../../pwa/updates';
import { subscribeInstall } from '../../pwa/install';
import { createMapItemRenderer } from '../../ui/MapItemRenderer';
import { createMapRenderer } from '../../ui/MapRenderer';
import { BACK_BAR_BAND, InkUI, INK_UI, INK_UI_HEX } from '../../ui/InkUI';
import { Copilot, type CopilotStep } from '../../ui/Copilot';
import { TITLE_FONT, UI_FONT } from '../../ui/fonts';
import { dongHoWordmark } from '../../ui/ink/dongHoWordmark';
import { applyPaperFX } from '../../ui/ink/PaperFX';
import { applyPendingRenderScale, applyRenderScale } from '../../game/graphicsQuality';
import { notifyShellReady } from '../../platform/shell';
import { attachPagePaper } from '../../ui/ink/paperSheet';
import { qualityLadder } from '../../game/qualityLadder';
import {
  bumpInputGeneration,
  forgetSheet,
  quietUntilNextFrame,
  registerSheet,
  swallowRestOfPress,
} from '../../ui/inputGeneration';
import { soundDirector } from '../../ui/sound/SoundDirector';
import { takeReloadReason } from '../../game/resilience';
import { pushToast } from '../../systems/empire/notifications';
import { ARRIVING_PAGES, PAGE_ARRIVAL_BAND, PAGE_ARRIVAL_RISE } from './constants';
import { openMainScroll } from './scrollOpening';
import { showLandscape } from './backdrop';
import type { MenuScene } from '../MenuScene';

/**
 * Whether this page life has already asked about a lost run. Module scope on purpose: the menu
 * scene is re-created every time a run exits to it, and the question belongs to *opening the
 * game*, not to every visit to the front page. A new page load — which is what a killed app or a
 * closed tab comes back through — starts it false again.
 */
let continueOffered = false;

export function create(self: MenuScene): void {
  applyPendingRenderScale(self.game);
  // A scene build is not the frame rate: without this hold the ladder counted the menu's own
  // construction as the device running hot and stepped an explicit tier down for it.
  qualityLadder()?.markSceneStart();
  // The peaceful bed. Asked for here and started by the first press — there is no audio
  // context before a gesture, and the menu is where the gesture happens.
  soundDirector.ambientMusic('menu');
  // No scene cap here: the front page carries live animation now, and a 30-fps pin made it
  // visibly chop against a 60–120 Hz panel. Battery pacing, if it returns, must come from a
  // real idle detector — not from capping the first thing the player sees.
  applyRenderScale(self);
  // The chrome is printed on the same sheet as the world, so it takes the same paper pass.
  applyPaperFX(self);
  attachPagePaper(self);
  window.__mandateState = undefined;
  self.registry.remove('gameState');
  self.ui = new InkUI(self);
  self.mapRenderer = createMapRenderer(self);
  self.mapItems = createMapItemRenderer(self);
  self.previewFlagSeed = loadSnapshot()?.state.mapConfig.seed ?? Math.floor(Math.random() * 1_000_000);
  self.drawBackground();
  self.drawDriftingLeaves();
  // Above every page object (they sit at depth <= 0), and registered as the sheet before the
  // first page is drawn, so nothing this scene builds can predate the guard.
  self.modalLayer = self.add.container(0, 0).setDepth(900);
  registerSheet(() => self.modalObjects.length > 0, self.modalLayer);
  // A sheet's pieces are pushed onto `modalObjects` from a dozen sites; rather than teach each of
  // them about the layer, anything still loose is adopted before the frame it first appears in.
  self.events.on(Phaser.Scenes.Events.PRE_RENDER, self.adoptModal, self);
  /**
   * The page reloaded itself to get its picture back — a GL context the phone never returned,
   * a loop a throw had killed (`game/resilience.ts`) — or the shell restarted a web view whose
   * process the OS took. The run was written down on the way out, so the player is carried
   * straight back into it, with one line in the header strip saying why.
   *
   * Once. A second reload for the same cause lands here instead, with the note moved onto the
   * Continue line: a run that dies on its own resume frame must not become a reload loop.
   */
  const reloaded = takeReloadReason();
  if (reloaded) {
    const snapshot = loadSnapshot();
    if (snapshot && reloaded.count <= 1) {
      pushToast(snapshot.state, t('menu.reloaded.notice'), 'info');
      // A beat later, never inside create: `scene.start` from here would tear the menu down
      // under the listeners the rest of this method is still attaching.
      self.time.delayedCall(80, () => {
        if (self.scene.isActive()) startGame(self, snapshot.state);
      });
    } else if (snapshot) {
      self.reloadNote = t('menu.reloaded.continueNote');
    }
  }
  render(self);
  // The other way a run gets lost: the phone reclaimed the whole app, the tab was closed, the
  // process died — a cold open with no reason flag, only the automatic snapshot the away pause
  // wrote on the way out. Asked once per page life, on the way in, rather than left to be
  // noticed on the Continue line. Not while the reload path above is already re-entering.
  if (!reloaded && !continueOffered) {
    const unfinished = pendingAutosave();
    if (unfinished) {
      continueOffered = true;
      offerContinue(self, unfinished);
    }
  }
  // The service worker finishes caching, or a new build lands, minutes after this page was
  // drawn. Redrawing on the change is what lets the front page raise its notice and the settings
  // page grow its Reload button without the player having to leave and come back.
  const unsubscribeUpdates = subscribeUpdateStatus(() => render(self));
  // `beforeinstallprompt` lands whenever Chromium gets round to deciding the site is
  // installable, which on a first visit is after this page is already drawn. Without this the
  // corner mark would offer the written guide to a browser that has a real button.
  const unsubscribeInstall = subscribeInstall(() => render(self));
  self.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    unsubscribeUpdates();
    unsubscribeInstall();
    self.installTipTimer?.remove();
    self.installTipTimer = undefined;
    self.tipBadgeTimer?.remove();
    self.tipBadgeTimer = undefined;
    self.lotusIdleWaveTimer?.remove();
    self.lotusIdleWaveTimer = undefined;
    self.copilot?.destroy();
    self.copilot = undefined;
    self.events.off(Phaser.Scenes.Events.PRE_RENDER, self.adoptModal, self);
    // Only this scene's registration — the run's HUD may already have registered its own.
    forgetSheet(self.modalLayer);
  });
  // After the page, never before it: every rectangle the tour points at is a measured one.
  if (self.mode === 'main' && (self.replayCopilot || !hasSeenTour())) {
    if (self.menuOpening) {
      self.menuOpening.afterOpen = () => {
        if (self.scene.isActive() && self.mode === 'main' && !self.copilot
          && (self.replayCopilot || !hasSeenTour())) startTour(self);
      };
    } else startTour(self);
  } else {
    // The tip badge is the tour's quiet successor: five cards once, then one line a visit for
    // ever after. In the same branch and not beside it, because the tour may not have opened
    // *yet* — it waits for the scroll to finish opening — and a badge armed in the meantime would
    // be sitting under the first card when it lands. See `armTipBadge` for the rest of the rules.
    self.armTipBadge();
  }
  // The launch splash comes down here and nowhere else, because this scene is the first thing
  // the game ever draws. `postrender` rather than the end of `create`: `create` runs *before*
  // the frame it just built reaches the canvas, so dismissing from here would cross-fade the
  // splash into one frame of empty paper. The hook is declared inline in `index.html` and is
  // gone by the time this fires a second time — `once` is belt to that braces.
  //
  // A native shell's splash comes down on the same frame and for the identical reason: it is
  // holding a full-screen image over a web view that has not painted anything yet, and it wants
  // the one frame that is genuinely the menu. Two splashes, one signal.
  self.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
    window.__splashDone?.();
    notifyShellReady();
  });
}

/**
 * The five cards a first-time player is shown, once.
 *
 * The steps are declared here rather than in `Copilot` because they are about *this page* — its
 * primary button, its Classic Modes door, its footer — and a tour component that knew which
 * scene it was touring would be a tour component that could only ever tour one.
 */
function startTour(self: MenuScene): void {
  self.replayCopilot = false;
  const steps: CopilotStep[] = [
    // The first card offers the language, because it is the first thing anybody sees and it is
    // shown in whatever the browser defaulted to. The front page's own switch is at the foot of
    // a page this tour is covering with its veil, so without this the one moment the choice is
    // most needed is the one moment it cannot be reached.
    {
      id: 'welcome',
      heading: 'copilot.welcome.h',
      body: 'copilot.welcome.b',
      languagePicker: true,
    },
    { id: 'play', heading: 'copilot.play.h', body: 'copilot.play.b', target: () => self.tourTargets.play },
    { id: 'modes', heading: 'copilot.modes.h', body: 'copilot.modes.b', target: () => self.tourTargets.classic },
    { id: 'learn', heading: 'copilot.learn.h', body: 'copilot.learn.b', target: () => self.tourTargets.footer },
    { id: 'ready', heading: 'copilot.ready.h', body: 'copilot.ready.b' },
  ];
  self.copilotFor = 'main';
  self.copilot = new Copilot(self, {
    steps,
    /**
     * The last card's second button starts a *run*, not the manual.
     *
     * A tour that ends by sending the reader to four pages of prose has answered "how do I
     * play" with "go and read". The player is one press from a game and has just been told
     * what every door on this page does; what they want now is somebody to sit beside them
     * while they play one. The manual is still a door on the footer for anyone who would
     * rather read first.
     */
    onGuide: () => {
      requestGuidedRun();
      self.startAscentRun();
    },
    // Skipped and finished are the same event here. A player who dismissed the tour has answered
    // the question it was asking, and showing it again next time refuses to take that answer.
    // The front page redraws in the new language under the card that asked for it. Safe while
    // the tour is up: `render`'s teardown guard compares the page the tour belongs to against
    // the page being drawn, and both are still `main`.
    onLanguage: () => render(self),
    onClose: () => {
      markTourSeen();
      self.copilot = undefined;
      self.copilotFor = undefined;
    },
  });
}

export function render(self: MenuScene): void {
  /**
   * **A page rebuilt under a finger must not be pressed by that finger.**
   *
   * Every button on this page acts on the press and most of them rebuild the page — Back, the
   * doors, Classic. Phaser hands the release of that same press to whatever it now finds under
   * the pointer, and it ranks candidates by *last frame's* render list, so a control built here
   * is not merely a candidate: it sorts below everything, and a tile, link or tablet that fires
   * on the release will take it. This is the boundary the run's HUD draws in `beginOverlay`, and
   * the front page never drew it. See `ui/inputGeneration`.
   */
  swallowRestOfPress(self);
  quietUntilNextFrame(self);
  bumpInputGeneration();
  // The tour ends when the page it is touring does.
  //
  // `startTour` only runs from `create`, and only on the front page — but `render` changes
  // `mode` without going near `create`, so the tour outlived the page it was measured against.
  // Its veil is a full-screen `setInteractive` blocker at depth 900: left up over the settings
  // sheet it framed nothing and deafened everything under it. Measured, with the tour running,
  // tapping a map-theme option did exactly nothing while the same tap worked without it — which
  // is what "changing map type does not work any more" is.
  //
  // Navigating away answers the tour's question the same way Skip does, so it counts as seen —
  // see `onClose`, which takes the same view.
  if (self.copilot && self.copilotFor !== self.mode) {
    self.copilot.destroy();
    self.copilot = undefined;
    if (self.copilotFor === 'classic') markClassicTourSeen();
    else markTourSeen();
    self.copilotFor = undefined;
  }
  clearContent(self);
  // The landscape is the front page's. Every other page is a sheet of paper, like the three
  // page scenes it stands beside in the footer.
  showLandscape(self, self.mode === 'main');
  const columnVeil = self.children.list.find((child) => child.getData?.('menuColumnVeil')) as Phaser.GameObjects.Graphics | undefined;
  columnVeil?.setVisible(self.mode === 'main' && !isDesktopSheet());
  if (!self.lineageSwipeArmed) {
    self.lineageSwipeArmed = true;
    self.input.on('pointermove', (pointer: Phaser.Input.Pointer) => self.onLineageSwipe(pointer));
  }
  // The wordmark is the front page's. Every other page draws its own head (`renderPageHead`):
  // a masthead that spent the top 236 units of a 620 sheet on a name the player had just read
  // is why the ledger scrolled, and why the Temple's title stood on a mountain.
  if (self.mode === 'main') renderTitle(self);
  const pageStart = self.content.length;
  renderPage(self);
  // Last, and on every mode rather than only the front page: it is app chrome, not a row of this
  // screen. Last also because its caption is set in the footer's left margin and the support
  // sentence is drawn into the same band — printed under the page, the caption would spend its
  // three seconds behind "help build the game".
  self.renderInstallMark();
  openMainScroll(self);
  if (self.mode !== self.shownMode && ARRIVING_PAGES.has(self.mode)) {
    // Inside the arrival rather than outside it: on the settings plate the mark rides the build
    // stamp, and a glyph left standing still while its own line slid down onto it would come
    // apart for the length of the tween.
    revealPage(self, self.content.slice(pageStart));
  }
  self.shownMode = self.mode;
}

/**
 * A page that arrives rather than one that is simply there.
 *
 * Settings and the mode list are the two doors off the front page, and a full sheet of controls
 * swapped for another in a single frame reads as a redraw — the eye is told the picture changed
 * without being shown anything move. The front page is left out: it is the page the game opens
 * on, it is already behind an animated landscape, and it is the one you come *back* to.
 *
 * The gesture is the history page's, unchanged: six units, 170ms, `Quad.easeOut`, and a 26ms
 * stagger capped at six steps. Two different arrival animations in one game reads as two games.
 *
 * Upwards into place, which is the direction the history page's rows already arrive from and
 * the one a list wants: the reader's eye is at the top of the sheet when the page changes, so
 * the movement happens where it is not being stared at and settles *under* the gaze rather than
 * away from it.
 */
export function revealPage(self: MenuScene, items: Phaser.GameObjects.GameObject[]): void {
  type Arriving = Phaser.GameObjects.GameObject & {
    y: number; alpha: number; setY(value: number): unknown; setAlpha(value: number): unknown;
  };
  const arriving = items.filter((item): item is Arriving => {
    const candidate = item as Partial<Arriving>;
    return typeof candidate.y === 'number' && typeof candidate.setAlpha === 'function';
  });
  // Sorted down the page, and stepped only where a real gap opens. A settings row is a name and
  // two choices sitting on one line: they are one thing arriving, not three in a queue.
  const ordered = arriving.slice().sort((first, second) => first.y - second.y);
  let step = 0;
  let bandY = ordered.length > 0 ? ordered[0].y : 0;
  for (const item of ordered) {
    if (item.y - bandY > PAGE_ARRIVAL_BAND) {
      step = Math.min(step + 1, 6);
      bandY = item.y;
    }
    const settledY = item.y;
    // Whatever alpha the page authored, not 1: an invisible hit rectangle carries its own, and
    // the version stamp is quiet on purpose.
    const settledAlpha = item.alpha;
    // A full-sheet veil only fades. Six units of travel on a rectangle cut to the sheet would
    // uncover a bright band along one edge for the length of the tween.
    const covering = item as { displayHeight?: number };
    if (!(typeof covering.displayHeight === 'number' && covering.displayHeight >= GAME_HEIGHT * 0.9)) {
      item.setY(settledY + PAGE_ARRIVAL_RISE);
    }
    item.setAlpha(0);
    // Tagged rather than inferred, exactly as the history page tags its rows: a harness can
    // assert the arrival ran without having to catch a 170ms tween mid-flight.
    item.setData('pageArrival', step);
    self.tweens.add({
      targets: item,
      y: settledY,
      alpha: settledAlpha,
      duration: 170,
      delay: step * 26,
      ease: 'Quad.easeOut',
    });
  }
}

/**
 * The way back, at the foot of the sheet — the same place on every page that has one.
 *
 * Each sub-page used to place it wherever its own content happened to stop: `cursor + 6` on the
 * classic page, `y + 6` on the shop, a clamped `vy(726)` on the ledger, a hardcoded `vy(690)` on
 * the confirm. On a short page that parks the control halfway up the sheet with a third of a
 * screen of nothing under it — reported as *"back button should not show in that place"* — and it
 * moves between pages, so the one control that is on all of them is the one that never sits still.
 *
 * `GuideScene` and `HistoryScene` already do this: *"The way back sits at the foot; the list gives
 * up `BACK_BAR_BAND` to clear it."* This is that rule, for the menu's own pages.
 */
export function footBackBar(self: MenuScene): void {
  self.content.push(self.ui.backBar(GAME_HEIGHT - BACK_BAR_BAND, () => {
    // One step back, not all the way: a page opened from the dynasty page returns to it.
    self.mode = self.returnMode ?? 'main';
    self.returnMode = undefined;
    render(self);
  }));
}

function renderPage(self: MenuScene): void {
  // Leaving the dynasty sheet disarms the respec — an armed destructive control must never
  // survive a navigation and be waiting, already half-pressed, when the player comes back.
  if (self.mode !== 'dynasty') {
    self.respecArmed = false;
    self.dynastyReign = undefined;
    self.dynastyCountIn = false;
  }
  self.lineageSwipe = undefined;
  // The Temple's unsaved dress does not survive leaving the page. Anything else would let a
  // player wander to the shop and back and find their king wearing a change they abandoned.
  if (self.mode !== 'temple') self.templeSheet = undefined;
  if (self.mode === 'confirm-new') {
    self.renderConfirmNew();
  } else if (self.mode === 'legacy') {
    self.renderLegacyShop();
  } else if (self.mode === 'dynasty') {
    self.renderDynastySheet();
  } else if (self.mode === 'temple') {
    self.renderTemple();
  } else if (self.mode === 'classic') {
    self.renderClassic();
  } else {
    self.renderMain();
  }
}

/**
 * The wordmark, on the front page and nowhere else.
 *
 * It was set at 36 units on a 390-wide sheet with the seal at 44 — a mark and a title that both
 * sat there being legible while the landscape behind them was the loudest thing on the page. A
 * front page has a subject, and on this one it has to be the name.
 *
 * It used to be printed again, smaller and pulled twice like a woodblock, at the top of every
 * page off the front page. Those pages carry their own head now (`renderPageHead`), the same one
 * the Guide, History and Settings scenes carry, because a page you have gone into has a heading,
 * not a masthead — and 236 units of a 620 sheet is a third of the screen spent on a name the
 * player read on the page they came from.
 */
function renderTitle(self: MenuScene): void {
  if (isDesktopSheet()) return;
  const title = dongHoWordmark(self, GAME_WIDTH / 2, self.vy(44) + 7,
    Phaser.Math.Clamp(260 * self.vScale, 226, 260));
  const subtitle = self.ui.label(GAME_WIDTH / 2, title.y + title.displayHeight / 2 + 4,
    'TEN THOUSAND VICTORIES', 'caption', {
      fontFamily: UI_FONT, fontSize: '9px', color: INK_UI_HEX.mutedText,
    }).setOrigin(0.5, 0).setLetterSpacing(1.4);
  self.content.push(title, subtitle);
}

/**
 * "Continue your last game?" — the sheet a lost run comes back through.
 *
 * A modal rather than an auto-resume: the player did not choose to leave, so they should be
 * the one to choose to go back — a run dropped into their hands the instant the app opens is a
 * surprise, and on a phone that opened by accident it is a surprise with a wave landing in it.
 * Both buttons keep the snapshot; "Not now" only lowers the sheet, and the Continue line under
 * it still holds the same run.
 */
function offerContinue(self: MenuScene, snapshot: NonNullable<ReturnType<typeof pendingAutosave>>): void {
  const BODY_WIDTH = 300;
  const body = self.add.text(0, 0, t('menu.resume.body', { note: snapshotLabel(snapshot) }), {
    color: '#2a2118',
    fontFamily: UI_FONT,
    fontSize: '13px',
    lineSpacing: 3,
    align: 'center',
    wordWrap: { width: BODY_WIDTH },
  }).setOrigin(0.5, 0);
  const ROW = 44;
  const GAP = 10;
  // 104 header + 20 the modal's own content inset + the body + two rows + a footer band it
  // does not use, because `contentBounds` is measured back off one whether or not it is drawn.
  const modal = self.ui.modal({
    title: t('menu.resume.title'),
    subtitle: t('menu.resume.subtitle'),
    onClose: () => self.closeModal(),
    height: 104 + 66 + 20 + body.height + 18 + ROW * 2 + GAP,
  });
  self.modalObjects.push(...modal.objects);
  const { contentBounds } = modal;
  const centreX = contentBounds.x + contentBounds.width / 2;
  let cursor = contentBounds.y + 4;
  body.setPosition(centreX, cursor);
  // Built before the sheet was, so it is *under* the sheet — same fix as the install sheet.
  self.children.bringToTop(body);
  self.modalObjects.push(body);
  cursor += body.height + 18;

  const buttonWidth = Math.min(260, contentBounds.width - 24);
  const buttonX = centreX - buttonWidth / 2;
  const primary = { x: buttonX, y: cursor, width: buttonWidth, height: ROW };
  self.modalObjects.push(self.ui.button(primary, t('menu.resume.continue'), () => {
    self.closeModal();
    startGame(self, snapshot.state);
  }, { variant: 'primary', fontSize: '14px' })
    // Read by `verify-resume.mjs`, which taps the offer rather than calling into the scene.
    .setData('resumeOffer', 'continue')
    .setData('visualBounds', { width: buttonWidth, height: ROW }));
  cursor += ROW + GAP;
  const later = { x: buttonX, y: cursor, width: buttonWidth, height: ROW };
  self.modalObjects.push(self.ui.button(later, t('menu.resume.later'), () => self.closeModal(),
    { variant: 'ghost', fontSize: '13px' })
    .setData('resumeOffer', 'later')
    .setData('visualBounds', { width: buttonWidth, height: ROW }));
  self.adoptModal();
}

export function startGame(self: MenuScene, state: ReturnType<typeof createInitialGameState>): void {
  // One save slot is shared across modes, so resume into the world scene the run belongs
  // to — an ascent save booted into MapScene would run the classic tick over ascent state.
  self.scene.start(state.gameMode === 'ascent' ? 'ConquestScene' : 'MapScene', { state });
}

function clearContent(self: MenuScene): void {
  self.menuOpening?.finish();
  // A re-render underneath an open modal would put fresh buttons on top of its blocker.
  self.closeModal();
  self.pageScroll?.destroy();
  self.pageScroll = undefined;
  self.dynastyPulse?.remove();
  self.dynastyPulse = undefined;
  for (const item of self.content) {
    item.destroy();
  }
  self.content = [];
}
