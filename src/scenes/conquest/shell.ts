/**
 * The standing screen of Dragon Ascent: `create`, the per-tick `refresh`, and the furniture that
 * floats over the map rather than on top of it — the action bar's routing and status dots, the
 * advisor and whisper strips, the paused badge, the right-edge zoom/mode stack and the province
 * inspect card. `beginOverlay`/`closeOverlay` are here because claiming the modal layer and
 * deciding what furniture survives are one decision.
 *
 * `refresh` is the priority order of the whole mode, and it runs several times a tick — the
 * battle clock drives it at `BATTLE_TICK_MS` — so anything once-only is latched, never guarded.
 * `renderMapControls` rewrites `window.__hudTapBounds` wholesale, so appenders run after it; and
 * `create`'s SHUTDOWN handler is the only teardown advisor, whispers, tour and banner ever get.
 */
import Phaser from 'phaser';
import { applyPaperFX } from '../../ui/ink/PaperFX';
import { applyRenderScale } from '../../game/graphicsQuality';
import { qualityLadder } from '../../game/qualityLadder';
import {
  ACTION_BAR_HEIGHT,
  GAME_HEIGHT,
  GAME_WIDTH,
  HEADER_HEIGHT,
  PLAYER_KINGDOM_ID,
  isDesktopSheet,
  surfaceWidth,
  uiColumnX,
} from '../../game/constants';
import { ASCENT_HUD_HEIGHT } from '../../ui/ascent/AscentHud';
import { laneIsDocked, placeModalLayer } from './hudSheet';
import { refreshAscentLaneState } from '../../systems/ascent/ConquestSystem';
import { countOpenDoors } from '../../systems/story/StorySystem';
import { contestedFronts, realmUnderAttack } from '../../systems/ascent/battleReport';
import { INK_UI, InkUI } from '../../ui/InkUI';
import {
  bumpInputGeneration, forgetSheet, registerSheet, swallowRestOfPress,
} from '../../ui/inputGeneration';
import { playWaveBanner } from '../../ui/ascent/waveBanner';
import { AscentHud } from '../../ui/ascent/AscentHud';
import { AdvisorStrip } from '../../ui/ascent/AdvisorStrip';
import { BarHint } from '../../ui/ascent/BarHint';
import { InheritanceChip } from '../../ui/ascent/InheritanceChip';
import { WhisperLine } from '../../ui/ascent/WhisperLine';
import { hasSeenRunTour, takeGuidedRun } from '../../state/tour';
import { ActionBar, DESKTOP_BAR_LAYOUT, actionBarSlots } from '../../ui/ActionBar';
import { BAND_HEIGHT, BOTTOM_BAND_Y, ResourceBar, TOP_BAND_Y } from '../../ui/ResourceBar';
import { sawtoothBand } from '../../ui/ink/devices';
import { PIGMENT } from '../../ui/ink/palette';
import { placeStamp, stampDesign } from '../../ui/ink/stamp';
import { UI_FONT } from '../../ui/fonts';
import { heroName, t, tickLabel } from '../../i18n';
import { hostileClaimAt } from '../../systems/LandSystem';
import { buildFocusRows } from '../../ui/focusPanel';
import { getLandSpecialization } from '../../systems/ResourceSystem';
import { masonryPowerPerDefense, militiaPowerPerMan } from '../../systems/WarSystem';
import { landSupply } from '../../systems/ascent/SupplySystem';
import type { AscentLane, GameState, Land } from '../../state/types';
import { promptSignature } from './constants';
import { clearLanePage } from './layers';
import { showWarBoard, warBoardSignature } from './screens/warBoard';
import type { ConquestUIScene } from '../ConquestUIScene';
import { attachPaperSheet } from '../../ui/ink/paperSheet';
import { stopBattleMusic } from './battle/music';
import { isDesktopLayout, isDesktopPlatform } from '../../platform/layout';
import { installDesktopKeys } from '../../input/desktopKeys';
import { LAYOUT_RESIZED } from '../../game/desktopResize';
import { setHudSheet } from './hudSheet';
import { gameplayControl, mapControlLabel } from '../../ui/GameplayControl';


/**
 * The width the readout has beside the strip in the desktop's top bar: the strip's own width when
 * the bar is 16:9 wide, and less on a narrower sheet, where the pause/menu cluster at the bar's
 * right end would otherwise stand on it. Reserve the control strip's actual footprint and margin.
 */
function readoutWidth(): number {
  const system = actionBarSlots('ascent', {}, surfaceWidth(), DESKTOP_BAR_LAYOUT).find((slot) => slot.system);
  return Math.max(270, Math.min(GAME_WIDTH, (system?.x ?? surfaceWidth()) - 18 - GAME_WIDTH));
}

/**
 * The desktop's sheet-wide chrome, built once and again after a resize.
 *
 * The top bar is one band across the sheet with the resource strip at its left and the run's
 * readout beside it — the composition every strategy player reads first. The band is opaque and
 * drawn under both, and the strip's răng cưa frieze runs the whole width on the same rows, so no
 * seam or change of tone marks where the strip ends and the readout begins. One hairline separates
 * the stores from the readout; pause and menu each have a quiet paper edge. The strip's plate and frieze come
 * off (`create`): drawn over this band, the plate hid the teeth over the strip alone.
 *
 * The dock plate is the docked lane page's paper: solid, from the bar to the bottom bar, with a
 * rule and a soft shadow down its left side. A lane page dims the map at 0.93 on the phone so the
 * sheet reads as *over* the map; docked beside a lit map that translucency read as the map leaking
 * through the page, and the page's own bottom sheet ended on a strip of it. Under the modal layer,
 * shown only while a lane is docked (`renderActionBar`).
 */
function buildDesktopChrome(self: ConquestUIScene): void {
  self.desktopChrome?.forEach((object) => object.destroy());
  const width = surfaceWidth();
  const band = self.add.rectangle(0, 0, width, HEADER_HEIGHT, INK_UI.backgroundInk, 1)
    .setOrigin(0, 0)
    .setDepth(79);
  const frieze = stampDesign(self, `ui:band:topbar:v2:${width}x${HEADER_HEIGHT}`,
    { left: 0, right: width, top: 0, bottom: HEADER_HEIGHT + 1 },
    (g, x, y) => {
      g.translateCanvas(x, y);
      sawtoothBand(g, 8, TOP_BAND_Y, width - 16, BAND_HEIGHT, 0.45);
      sawtoothBand(g, 8, BOTTOM_BAND_Y, width - 16, BAND_HEIGHT, 0.4);
      g.lineStyle(1, PIGMENT.mucSoft, 0.35);
      g.lineBetween(0, HEADER_HEIGHT - 0.5, width, HEADER_HEIGHT - 0.5);
      g.lineBetween(GAME_WIDTH + 0.5, TOP_BAND_Y + BAND_HEIGHT + 5, GAME_WIDTH + 0.5, BOTTOM_BAND_Y - 5);
      g.translateCanvas(-x, -y);
    }, { pool: 'ui' });
  const friezeStamp = placeStamp(self, frieze, 0, 0).setDepth(79.5);

  const plate = self.add.graphics().setDepth(499).setVisible(laneIsDocked(self));
  const x = uiColumnX();
  const foot = GAME_HEIGHT - ACTION_BAR_HEIGHT;
  plate.fillStyle(INK_UI.overlay, 1);
  plate.fillRect(x, HEADER_HEIGHT, GAME_WIDTH, foot - HEADER_HEIGHT);
  for (let i = 0; i < 6; i += 1) {
    plate.fillStyle(INK_UI.brush, 0.05 * (6 - i) / 6);
    plate.fillRect(x - 2 - i * 2, HEADER_HEIGHT, 2, foot - HEADER_HEIGHT);
  }
  plate.lineStyle(1.5, INK_UI.brush, 0.7);
  plate.lineBetween(x - 0.5, HEADER_HEIGHT, x - 0.5, foot);
  self.dockEdge = plate;
  self.desktopChrome = [band, friezeStamp, plate];
}

/** The three map controls stacked at the right edge, matching the classic modes. */
type MapControlIcon = 'zoom-in' | 'zoom-out' | 'mode';

/**
 * The floating map controls: half their tap area, and the clearance kept below the lowest one.
 * The buttons draw 36×36 but claim 44×44 of touch, and it is the touch area that has to stay
 * off the action bar.
 */
const MAP_CONTROL_RADIUS = 22;
const MAP_CONTROL_GAP = 12;
/** Vertical pitch of the stack. */
const MAP_CONTROL_PITCH = 48;


export function create(self: ConquestUIScene): void {
  applyRenderScale(self);
  // The chrome is printed on the same sheet as the world, so it takes the same paper pass.
  applyPaperFX(self);
  // The grain over the whole sheet: this scene's camera covers it, and it renders last.
  self.paper = attachPaperSheet(self, { width: surfaceWidth() });
  self.ui = new InkUI(self);
  self.resourceBar = new ResourceBar(self, self.state);
  self.add.existing(self.resourceBar);
  self.resourceBar.setDepth(80);
  // The desktop's top bar: one band across the sheet, with the resource strip at its left and the
  // run's readout beside it rather than under it — the composition every strategy player reads
  // first. The band is drawn under both so the sheet's edge does not show between them.
  if (isDesktopSheet()) {
    buildDesktopChrome(self);
    self.resourceBar.setPlateVisible(false);
  }

  // The resource strip is the door to the ledger. A player wondering about a number taps
  // the number — no new bar button, and the books open exactly where the question arose.
  const ledgerHit = self.add
    .rectangle(0, 0, GAME_WIDTH, HEADER_HEIGHT, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setDepth(81)
    .setInteractive();
  ledgerHit.on('pointerup', () => {
    if (self.state.pendingAscentPrompt || self.openPromptKey !== '') return;
    self.openLane('ledger');
  });
  self.ledgerHit = ledgerHit;

  self.hud = new AscentHud(self, isDesktopSheet() ? { compact: true, width: readoutWidth() } : {});
  if (isDesktopSheet()) {
    // The readout beside the strip, laid out on the strip's own two rows (`AscentHud.placeCompact`)
    // and lifted so its band's top is the bar's top; the bar's band is its plate, so the readout's
    // own plate would only draw a seam in it.
    self.hud.root.setPosition(GAME_WIDTH, -HEADER_HEIGHT);
    self.hud.setPanelVisible(false);
  }

  // Built once and refreshed in place. Rebuilding it every tick would churn a dozen game
  // objects a second for a bar whose labels change only when the run's state does.
  self.actionBar = new ActionBar(self, self.state, (action) => handleBarAction(self, action), {
    // The bottom bar spans the desktop sheet, its lanes centred and its pause/menu cluster
    // lifted into the top bar's right end; the column's own row on the phone.
    width: surfaceWidth(),
    layout: isDesktopSheet() ? DESKTOP_BAR_LAYOUT : undefined,
  });
  self.actionBar.statusColor = (action) => barStatusColor(self, action);
  // Not `Boolean(activeBattle)`. See `realmUnderAttack`: a siege raises no watched battle, so the
  // one control that leads to the war used to leave the bar at the exact moment the war became
  // unwinnable without it.
  self.actionBar.context = () => ({ battleLive: realmUnderAttack(self.state) });
  self.actionBar.refresh();

  // The advisor. Built here beside the bar rather than per render for the same reason: it is
  // written into on every economy tick and rebuilding its text would cost a canvas measure a
  // second for a line that usually has not changed.
  //
  // Its action goes through `handleBarAction`, not through a private door of its own — the
  // advice names a lane and the bar already knows how to open every lane there is. A second
  // route into those screens is a second thing to keep correct.
  self.advisor = new AdvisorStrip(self, (lane) => handleBarAction(self, lane));
  // Under the bar at the left, where a desktop keeps its alerts: the strip can run to two lines
  // and open a sheet under itself, and neither fits inside a 52-unit band (it was tried, and it
  // read as a card jammed into the bar). The readout it used to sit under has moved up beside
  // the strip, so the advice follows the band up with ten units of space below the header.
  if (isDesktopSheet()) self.advisor.setOffset(0, 10 - ASCENT_HUD_HEIGHT);
  // Under the advisor, and a door rather than a notice: every whisper has a scene written for
  // it that nothing in this mode could reach.
  self.whispers = new WhisperLine(self, (storyId) => self.showStoryPage(storyId));
  // The next reign, read from this one. Above the bar and beside the map controls, and never in
  // the layout: it floats over the map exactly as the paused badge does.
  self.inheritance = new InheritanceChip(self, () => renderActionBar(self));
  // The advisor's line again, over the lane it wants pressed, for a few seconds. Fed from the
  // strip's own reading in `renderActionBar`, so the two can never point at different things.
  self.barHint = new BarHint(self, () => layoutInheritanceChip(self));

  // Taken once, here, rather than read where it is used: the flag is a one-shot handoff from the
  // manual and any second reader would find it already spent.
  self.guidedRun = takeGuidedRun();
  // Phaser reuses this scene instance. A replay must teach again, even after an earlier run.
  self.runTourDone = false;
  self.tourStagesShown.clear();
  // A first run teaches by default, and the manual's button forces it for any run.
  self.tourActive = self.guidedRun || !hasSeenRunTour();

  // The keyboard, on a computer only — the platform, not the sheet: a portrait window on a PC
  // still has the keys. Its teardown joins the SHUTDOWN handler below, because a listener left
  // on the keyboard plugin after the scene has gone answers for a run that is over.
  const removeKeys = isDesktopPlatform() ? installDesktopKeys(self) : undefined;
  // The sheet changed width: the published tap guard spans it, so it is composed again.
  const onLayoutResized = (): void => {
    if (!self.scene.isActive()) return;
    // The band, the frieze and the dock plate are sheet-wide; the readout's width follows the bar.
    buildDesktopChrome(self);
    self.hud.setWidth(readoutWidth());
    if (self.state.ascent) self.hud.render(self.state.ascent);
    renderActionBar(self);
  };
  if (isDesktopLayout()) self.game.events.on(LAYOUT_RESIZED, onLayoutResized);

  // The battle clock and the published control bounds both outlive a single render; neither
  // may survive the scene that owns them.
  self.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    removeKeys?.();
    self.game.events.off(LAYOUT_RESIZED, onLayoutResized);
    self.stopBattleClock();
    // A dead scene must not answer the input guard for a live one.
    forgetSheet();
    window.__hudTapBounds = [];
    self.advisor.destroy();
    self.whispers.destroy();
    self.inheritance.destroy();
    self.barHint.destroy();
    self.runTour?.destroy();
    self.runTour = undefined;
    self.waveBanner?.destroy();
    self.waveBanner = undefined;
    self.waveCueQueue = [];
    self.arenaRoutHold?.remove();
    self.arenaRoutHold = undefined;
    // The emitter and the scroll areas survive scene.stop(); everything above dies with the
    // display list, these two do not.
    self.events.off('state-changed', self.onStateChanged);
    clearLanePage(self);
    self.desktopChrome = undefined;
    self.dockEdge = undefined;
  });

  self.modalLayer = self.add.container(0, 0).setDepth(500);
  // How the input guard sees a sheet: whether one is up, and which container holds its controls.
  // Everything outside that container refuses the release of a press that began while it was up —
  // which is the whole of *"when in the modal must not click anything behind"*. See
  // `ui/inputGeneration`.
  registerSheet(
    () => self.openPromptKey !== '' && self.modalLayer.length > 0,
    self.modalLayer,
  );

  self.events.on('state-changed', self.onStateChanged);
  // The map's clash and siege marks are pressable, and this is where they land. Registered here
  // rather than on the map because the lane, and every guard around opening one, is this scene's.
  self.events.on('ui:open-battle', (landId: string) => self.openBattleAt(landId));
  self.worldDimmed = false;
  refresh(self);
}

// ── Frame ─────────────────────────────────────────────────────────────────

export function refresh(self: ConquestUIScene): void {
  if (!self.state.ascent) return;

  refreshAscentLaneState(self.state);
  self.resourceBar.refresh();
  self.hud.render(self.state.ascent);
  // Written before the lane guards below: those can return early, and the one line on screen
  // that claims to be reading the run must never be a tick behind the band above it — but not
  // while an overlay covers it: `renderActionBar` hides the strip under every lane and prompt,
  // and re-reading the whole run per beat for an invisible line was pure cost. The overlay's
  // close runs `refresh` again, which brings it straight back up to date.
  if (!self.state.pendingAscentPrompt && self.openPromptKey === '') self.advisor.render(self.state);
  self.whispers.render(self.state, self.advisor.bottom());
  // Same guard as the advisor: hidden under every card and lane, so re-reading the stores for
  // an invisible chip is pure cost. Its floor follows the inspect card the way the controls do.
  layoutInheritanceChip(self);

  // A lane that renders nothing has stranded the player: the bar and the map controls are
  // torn down before the screen is built, so an empty modal layer means no UI at all and no
  // way back. Recovering here rather than only at each lane's own guard makes the whole class
  // of bug survivable instead of fatal.
  if (self.openPromptKey.startsWith('lane:') && self.modalLayer.length === 0) {
    self.closeLane();
    return;
  }

  // The battle lane is the one screen whose contents move on their own — the fight runs on
  // the world's clock whether or not it is being watched — so it updates in place instead of
  // being rebuilt. Rebuilding it would also make its standing-order cards untappable, since a
  // card destroyed between press and release never fires.
  if (self.openPromptKey === 'lane:battle') {
    if (self.state.pendingAscentPrompt) {
      // A card has arrived over the fight. The prompt owns the screen while it is up — the
      // world is paused with it, so the siege waits — and the battle comes straight back after.
      self.reopenBattleAfterPrompt = true;
      self.closeLane();
      return;
    }
    self.updateBattle();
    // A fight that ended closes its own screen, which re-enters `refresh` — let that pass
    // finish the frame rather than carrying on against a key that no longer applies.
    if (self.openPromptKey !== 'lane:battle') return;
    // The lane's other screen is the war board, and it is the only page here with no clock of
    // its own. Redrawn when the *shape* of the war changes — see `warBoardSignature`.
    if (!self.battleUi && self.warBoardKey && self.warBoardKey !== warBoardSignature(self)) {
      self.replaceLanePage(() => showWarBoard(self));
      return;
    }
  }

  const prompt = self.state.pendingAscentPrompt;
  const key = prompt ? `${prompt.kind}:${promptSignature(prompt)}` : '';
  // Chrome overlays own the modal layer until dismissed; don't let a tick tear them down.
  const overlayOpen = self.openPromptKey === 'codex'
    || self.openPromptKey === 'quit'
    || self.openPromptKey === 'menu'
    || self.openPromptKey.startsWith('lane:');

  // The last fight of a run reports itself before the run does.
  //
  // The Reckoning waits for a clear screen — no overlay, no card — and `run-over` is itself a
  // card, raised on the same tick the fight that ended the run resolved. So the one engagement
  // in the whole run that matters most was the one whose result was never shown: the screen went
  // straight from the battlefield to the end of the run, which is exactly what "it doesn't show
  // any results, it jumps immediately to the last page" describes. Every other card can wait its
  // turn behind the Reckoning; this one cannot wait behind anything, because nothing follows it.
  // The whole ceremony counts, not only the Reckoning: a story outcome or a war board that
  // pushed in front of the dynasty card would strand the player mid-chain with no way back to it.
  const runEnding = prompt?.kind === 'run-over'
    || prompt?.kind === 'dynasty-level'
    || prompt?.kind === 'next-reign';
  if (runEnding && self.state.ascent?.pendingAftermath && !overlayOpen) {
    self.openAftermath();
    return;
  }

  // What the last answer actually did, before the next question is asked.
  //
  // Ahead of the prompt block on purpose: a story that chains straight into another beat would
  // otherwise overwrite `lastStoryOutcome` before it was ever read, and the one thing the player
  // asked for — being able to tell what a choice was worth — would be the thing dropped. It
  // yields only to the Reckoning, which nothing may sit in front of.
  //
  // Deliberately NOT an `AscentPrompt`: it would come out of `STORY_PROMPT_SHARE`'s fifteen per
  // cent and be rationed against the story cards it is reporting on.
  const outcome = self.state.lastStoryOutcome;
  if (outcome && !overlayOpen && !runEnding) {
    if (self.openPromptKey !== 'story-outcome') {
      self.lanePauseBeforeOpen = self.state.isStrategyPause;
      self.state.isStrategyPause = true;
      beginOverlay(self, 'story-outcome');
      self.showStoryOutcome(outcome);
      if (self.modalLayer.length === 0) self.dismissStoryOutcome();
    }
    return;
  }

  if (!overlayOpen && key !== self.openPromptKey) {
    // A decision card leaving the screen is a decision the player has answered. Counted here,
    // where the transition is already being detected, rather than in each of the twenty-odd
    // prompt renderers — the guided run's `decision` stage only needs to know that one has
    // happened, and a counter kept at the single place the key changes cannot drift from it.
    if (self.openPromptKey !== '' && key === '') self.promptsAnswered += 1;
    beginOverlay(self, key);
    if (prompt) self.renderPrompt(prompt);
  }

  // A fight that has just begun brings its own screen up. After the prompt key is reconciled,
  // so a card that arrived on the same tick is answered first and the battle follows it.
  if (self.maybeAutoOpenBattle()) return;

  // The war spreading to a second province brings the board up, ahead of the Reckoning for a
  // fight that has just ended: one is news about what happened, the other is a decision about
  // what to do next, and the decision does not wait behind the news. `addSideBattle` has already
  // stopped the world; `showWarBoard` clears the flag and hands the pause back on the way out.
  //
  // `!overlayOpen` would be wrong here and it is the case that matters most: the player is very
  // often *already on the battle screen* when the war spreads, and that is precisely the moment
  // they need telling. The battle lane is the one overlay this may replace, because it is the
  // same lane — it re-renders as the board and its own Close still leads home.
  //
  // **Unless the player is already on a fight.** Reported: *when I am in a battle and multiple
  // battles happen, do not automatically move me to the new battle*. The field they are watching
  // has its own fronts chip listing every live fight, so the announcement is read there; the
  // board replaces the lane only when the lane is showing the board already. The hold the
  // announcement asked for is released with it — nothing is on screen to explain a stopped world.
  if (self.state.ascent?.frontsOpened && !prompt && self.openPromptKey === 'lane:battle' && self.battleUi) {
    self.state.ascent.frontsOpened = undefined;
    if (!self.lanePauseBeforeOpen && !self.battleAwaitingOrder) self.state.isStrategyPause = false;
  }
  if (self.state.ascent?.frontsOpened && !prompt
    && (!overlayOpen || self.openPromptKey === 'lane:battle')) {
    self.openLane('battle');
    return;
  }

  // A fight that has just ended brings its own screen up too. After the battle, obviously, and
  // after any card that arrived with it — the world is held while it is read, exactly as every
  // other lane holds it.
  if (self.state.ascent?.pendingAftermath && !overlayOpen && !prompt) {
    self.openAftermath();
    return;
  }

  // The proclamation, once the screen is its own again.
  //
  // Deferred rather than dropped when a lane or a card owns the screen: the banner draws at 470
  // and the modal layer at 500, so playing it under a decision would spend the one moment the
  // mode has to say "you won that" on a strip of paper nobody can see. It waits, and a newer cue
  // overwrites an older one, so there is no backlog to drain.
  playPendingWaveCue(self);
  // After the prompt key is reconciled, never before: both of these decide whether to show
  // themselves from it, and reading last tick's value left the bar hidden for a whole frame
  // after the final card of a chain was answered.
  renderActionBar(self);
  renderInspect(self);
}

/**
 * Plays the wave director's banner cue, at most once each, and only onto a clear screen.
 *
 * The cue is cleared from state the instant it is read, before the banner is built: `refresh`
 * runs several times a tick — the battle clock drives it at `BATTLE_TICK_MS` — so a read that
 * left the cue standing would stack four proclamations on top of each other. `lastWaveCueId` is
 * the belt to that braces. It is *not* what protects a reloaded save: a new scene starts the
 * counter at zero, so a cue that survived into the save would play again — `sanitiseLoadedState`
 * drops them for that reason.
 */
function playPendingWaveCue(self: ConquestUIScene): void {
  const ascent = self.state.ascent;
  if (!ascent) return;

  // Drained out of state on sight, whether or not one can be played now. The director's queue is
  // capped at three and would otherwise keep the *oldest* three while the scene waited for a
  // clear screen; taking them here and holding them in the scene keeps them in the order they
  // were raised, and `lastWaveCueId` drops any a reloaded save has already shown.
  const raised = ascent.waveCues;
  if (raised && raised.length > 0) {
    for (const cue of raised) {
      if (cue.id > self.lastWaveCueId) {
        self.lastWaveCueId = cue.id;
        self.waveCueQueue.push(cue);
      }
    }
    ascent.waveCues = [];
  }

  if (self.waveBanner || self.waveCueQueue.length === 0) return;
  // Never over a decision. The banner draws at 470 and the modal layer at 500, so playing one
  // under a card would spend the moment on a strip of paper nobody can see.
  if (self.state.pendingAscentPrompt || self.openPromptKey !== '') return;

  const cue = self.waveCueQueue.shift();
  if (!cue) return;

  // **A result stops the world; a landing does not.**
  //
  // The two halves of the lifecycle are not the same kind of event. A landing is a warning about
  // something that is now happening on the map, and the map should keep moving under it - freezing
  // the game to say "you are being invaded" would be the game taking the news away from the
  // player. A result is the opposite: the fight is over, the figures on the plate are final, and
  // the only thing left is to read them. Letting the clock run through that meant the next tick's
  // toast, the next card and the next wave's countdown all arrived over the top of the one moment
  // in the run that exists to be looked at.
  //
  // Held as a *strategy* pause, the same lever the lane screens use, and released the instant the
  // plate leaves - including when a tap cuts it short. The prior value is captured rather than
  // assumed so the release cannot switch the clock back on under a player who had paused it
  // themselves.
  const holdsWorld = cue.phase === 'end';
  if (holdsWorld) {
    self.wavePauseBefore = self.state.isStrategyPause;
    self.state.isStrategyPause = true;
  }

  self.waveBanner = playWaveBanner(self, cue, () => {
    self.waveBanner = undefined;
    if (holdsWorld) self.state.isStrategyPause = self.wavePauseBefore;
    // Straight into the next one. A wave the realm plainly holds is met without a card, so a
    // result and the next landing are raised on the same tick and read as one sentence: this
    // invasion ended, that one is beginning.
    playPendingWaveCue(self);
  });
}

// ── Three Lane Surface ───────────────────────────────────────────────────

/**
 * Keeps the bar current and hides it while something owns the modal layer — behind the dim
 * its buttons would be half-visible and untappable.
 */
/**
 * The chip's floor: the inspect card, and the bar's hint card while one is up — both sit in the
 * chip's row, and the chip stands above whichever is there rather than printing through it.
 * Same guard as the advisor: hidden under every card and lane, so re-reading the stores for an
 * invisible chip is pure cost.
 */
function layoutInheritanceChip(self: ConquestUIScene): void {
  if (self.state.pendingAscentPrompt || self.openPromptKey !== '') return;
  const barTop = GAME_HEIGHT - ACTION_BAR_HEIGHT;
  // On the desktop the province card is docked at the right and the chip stands at the left, so
  // the card is not in the chip's row and does not lift it.
  const cardTop = isDesktopSheet() ? undefined : inspectCardTop(self);
  const floor = Math.min(cardTop ?? barTop, self.barHint.top() ?? barTop);
  self.inheritance.render(self.state, floor);
  // The tap guard and the paused badge both read the chip's rectangle.
  window.__hudTapBounds = [...self.mapControlBounds, ...self.advisor.tapBounds(), ...self.whispers.tapBounds(),
    ...self.inheritance.tapBounds()];
}

export function renderActionBar(self: ConquestUIScene): void {
  // Two questions that used to be one. `covered`: something owns the screen, so the map is deaf
  // and dimmed. `chromeHidden`: the bar and the strips come down as well. On the phone they are
  // the same answer. On the desktop a lane is a panel docked at the edge, and the bottom bar stays
  // up beside it so the next lane is one press away — the tab row every strategy game has — while
  // a card, a sheet or the battle's stage still takes everything down.
  const covered = Boolean(self.state.pendingAscentPrompt) || self.openPromptKey !== '';
  const chromeHidden = covered && !laneIsDocked(self);
  // The world's own dim, told once per transition from the one place that decides what "covered"
  // means, so the dim and the tap guard below can never disagree. Lighter under a docked lane,
  // whose map is meant to be looked at while reading; the card's dim is the event window's.
  if (covered !== self.worldDimmed) {
    self.worldDimmed = covered;
    self.events.emit('ui:world-dim', covered, laneIsDocked(self) ? 0.45 : 0.93);
  }
  self.actionBar.setVisible(!chromeHidden);
  if (!chromeHidden) self.actionBar.refresh();
  self.dockEdge?.setVisible(laneIsDocked(self));
  self.advisor.setVisible(!chromeHidden);
  self.whispers.setVisible(!chromeHidden);
  self.inheritance.setVisible(!chromeHidden);
  // Not while the run's tour is pointing at things: two cards with arrows is a page arguing.
  self.barHint.render(self.state, self.advisor.shown(), (action) => self.actionBar.slotBounds(action),
    covered || Boolean(self.runTour));
  renderMapControls(self, covered);
  // Composed wholesale on every refresh, from the stack's recorded rectangles plus whatever the
  // advisor and the whisper strip currently occupy. The controls themselves are keyed and only
  // rebuilt when they move; the published guard list is cheap and must always be current. In the
  // sheet's own units: this scene's camera covers the sheet on every layout.
  window.__hudTapBounds = covered
    ? [{ x: 0, y: 0, width: surfaceWidth(), height: GAME_HEIGHT }]
    : [...self.mapControlBounds, ...self.advisor.tapBounds(), ...self.whispers.tapBounds(),
      ...self.inheritance.tapBounds()];
  renderPausedBadge(self, covered);
  self.maybeRunTour(covered);
}

/**
 * A standing "the world is stopped" mark.
 *
 * Pause is now a real toggle rather than a door into the quit sheet, which means the player
 * can leave the game stopped and walk away from the bar — so the state has to be visible from
 * the map, not only from the shape of one 34px glyph. Deliberately not interactive: anything
 * tappable floating over the map has to be excluded from the map's own tap handling, and an
 * indicator that only reports does not earn that cost.
 */
function renderPausedBadge(self: ConquestUIScene, hidden: boolean): void {
  // The badge is centred, and the chip's plate reaches x=266 from the left — so when the chip is
  // up the badge stands above it rather than printing through its headline.
  const chipTop = self.inheritance.visible() ? self.inheritance.top() : undefined;
  const key = hidden || !self.state.isStrategyPause ? '' : `paused:${chipTop ?? '-'}`;
  if (key === self.pausedBadgeKey && (key === '') === (self.pausedBadge === undefined)) return;
  self.pausedBadgeKey = key;
  self.pausedBadge?.destroy();
  self.pausedBadge = undefined;
  if (key === '') return;

  const width = 128;
  const height = 24;
  const x = (surfaceWidth() - width) / 2;
  const y = (chipTop ?? GAME_HEIGHT - ACTION_BAR_HEIGHT) - height - 10;

  const badge = self.add.container(0, 0).setDepth(430);
  badge.add(self.ui.panel({ x, y, width, height }, {
    fill: INK_UI.backgroundInk,
    fillShade: INK_UI.brush,
    border: INK_UI.gold,
    radius: 12,
  }));
  badge.add(self.add.text(surfaceWidth() / 2, y + height / 2, t('ascent.hud.paused'), {
    color: '#2a2118',
    fontFamily: UI_FONT,
    fontSize: '11px',
    fontStyle: '700',
  }).setOrigin(0.5));
  self.pausedBadge = badge;
}

/**
 * Zoom and the terrain/control toggle, in the same right-edge stack the classic modes use.
 *
 * These are map controls, not menu entries, so they belong on the map rather than in the
 * action bar — and without the mode toggle the player has no way to reach the control view,
 * which is the one view that answers "who holds what" across the whole board at once.
 */
function renderMapControls(self: ConquestUIScene, hidden: boolean): void {
  // Keyed on everything the stack is drawn from. It was destroyed and rebuilt on every refresh
  // — every beat, during a fight — to draw the same three buttons in the same three places.
  const key = hidden ? 'hidden' : `${inspectCardTop(self) ?? '-'}:${self.state.mapRenderMode}`;
  if (key === self.mapControlsKey) return;
  self.mapControlsKey = key;
  for (const object of self.mapControlObjects) object.destroy();
  self.mapControlObjects = [];
  self.mapControlBounds = [];
  if (hidden) {
    // A prompt or lane overlay covers the map, so nothing below it is a map tap; the guard
    // itself is published by `renderActionBar`'s composition below.
    return;
  }

  // The sheet's right edge: the column's on the phone, the window's on the desktop.
  const x = surfaceWidth() - 30;
  // The inspect card spans the full width, so when one is up the stack sits above it
  // rather than on top of it.
  //
  // Measured from the *edge* of the lowest button rather than its centre. Clearing the bar by
  // 16px from the centre left only 16 − 21 = −5px between its tap area and the bar's, so the
  // bottom control sat on the bar it was supposed to float above.
  const inspectTop = inspectCardTop(self);
  const floor = inspectTop ?? GAME_HEIGHT - ACTION_BAR_HEIGHT;
  const bottom = floor - MAP_CONTROL_GAP - MAP_CONTROL_RADIUS;
  const controls: Array<[MapControlIcon, () => void]> = [
    ['zoom-in', () => self.events.emit('ui:zoom-map', 1)],
    ['zoom-out', () => self.events.emit('ui:zoom-map', -1)],
    ['mode', () => {
      self.events.emit('ui:toggle-render-mode');
      refresh(self);
    }],
  ];

  controls.forEach(([icon, onTap], index) => {
    const y = bottom - (controls.length - 1 - index) * MAP_CONTROL_PITCH;
    self.mapControlObjects.push(createMapIconButton(self, x, y, icon, onTap));
    // Published, not hardcoded: the stack shifts up when a province is selected, so a fixed
    // band in the world scene would guard the wrong pixels half the time. Without this the
    // canvas-level tap handler underneath treated a press on + / − as a tap on the province
    // behind it, selected that land, and the re-render destroyed the button before Phaser
    // could deliver the release — so the zoom controls never fired at all.
    //
    // Recorded on the scene rather than pushed straight into `__hudTapBounds`: the stack is
    // keyed now, so `renderActionBar` recomposes the published list every refresh from this.
    self.mapControlBounds.push({ x: x - 22, y: y - 22, width: 44, height: 44 });
  });
}

/** Map actions use the same printed controls as the clock and menu. */
function createMapIconButton(self: ConquestUIScene,
  x: number,
  y: number,
  icon: MapControlIcon,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const terrain = self.state.mapRenderMode === 'terrain';
  return gameplayControl(self, {
    x, y, icon: icon === 'mode' ? (terrain ? 'territory' : 'terrain') : icon,
    label: mapControlLabel(icon, terrain), active: icon === 'mode' && !terrain, onClick,
  }).setDepth(430);
}

/**
 * The bottom bar's routing — the same screens the classic modes open, plus the Codex. Exported
 * for the desktop keys, which are the bar's own actions reached without the mouse.
 */
export function handleBarAction(self: ConquestUIScene, action: string): void {
  if (action === 'pause') {
    togglePause(self);
    return;
  }
  if (action === 'menu') {
    self.showSystemMenu();
    return;
  }
  if (action === 'codex') {
    self.showCodex();
    return;
  }
  // On the desktop the bar stays up beside a docked lane, so a lane button is a tab: the same
  // one closes the page, another swaps it. Closed first, never opened over — `openLane` stashes
  // the pause it found, and a lane found under another lane would stash the lane's own hold.
  if (laneIsDocked(self)) {
    const same = self.openPromptKey === `lane:${action}`;
    self.closeLane();
    if (same) return;
  }
  self.openLane(action as AscentLane);
}

/**
 * Stop and start the world's clock. Nothing else.
 *
 * This is the "let me think" pause, and it used to be impossible to reach: the button
 * labelled Pause/Resume opened the save-and-quit sheet instead, so the only way to stop time
 * was through a menu whose other two options left the run. Two different jobs now have two
 * different buttons — this one, and the ☰ beside it.
 */
function togglePause(self: ConquestUIScene): void {
  self.state.isStrategyPause = !self.state.isStrategyPause;
  refresh(self);
}

/**
 * The dot on a bar button: a standing invitation to open that screen. Each condition is
 * about that screen specifically, so a lit button always means there is something real
 * behind it — never a decorative badge.
 */
function barStatusColor(self: ConquestUIScene, action: string): number | undefined {
  const state = self.state;
  const ascent = state.ascent;
  if (!ascent) return undefined;

  switch (action) {
    // A live siege is the loudest thing the bar can say — and a province under attack that the
    // screen did not open for is the second loudest. It used to say nothing at all about the
    // second, which is most of the 20–96 engagements a measured run settles.
    case 'battle': {
      if (ascent.activeBattle) return INK_UI.cinnabar;
      const fronts = contestedFronts(state);
      if (fronts.length === 0) return undefined;
      return fronts.some((front) => front.besieged || front.theirMen > front.ourMen)
        ? INK_UI.cinnabar
        : INK_UI.gold;
    }
    case 'heroes':
      return state.heroes.some((hero) => !hero.assignedTo) ? INK_UI.jade : undefined;
    case 'court':
      if (state.court.stability < 35) return INK_UI.cinnabar;
      return (state.mandate?.edictPoints ?? 0) > 0 ? INK_UI.gold : undefined;
    case 'army':
      // The one number that decides whether the run survives the next wave.
      return ascent.defensePower > 0 && ascent.threat > ascent.defensePower ? INK_UI.cinnabar : undefined;
    case 'affairs':
      return ascent.laneState.world === 'alert' ? INK_UI.cinnabar : undefined;
    case 'build':
      return state.buildOrders.length === 0 && state.resources.gold > 60 ? INK_UI.gold : undefined;
    // Lit while any story has said something within living memory. Not a badge for its own
    // sake: an unlit Chronicle button means nothing has happened worth reading.
    case 'chronicle': {
      // Red means a door is open — never lit for atmosphere. A lit button that leads to
      // nothing is how the Codex lost this slot.
      if (countOpenDoors(state) > 0) return INK_UI.cinnabar;
      return (state.stories ?? []).some((story) => state.turn - story.lastSpokeTurn <= 6)
        ? INK_UI.jade
        : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Claims the modal layer for a chrome overlay.
 *
 * Every screen that opens on top of the map goes through here so none of them can forget a
 * piece of the teardown: scroll areas register a global wheel handler, and the battle clock
 * keeps beating on a screen that is no longer there — both leaked when each screen cleared
 * the modal layer its own way.
 */
/**
 * The map underneath a full-bleed overlay, hidden while it cannot be seen.
 *
 * Measured on the fight screen at 390x844: the map cost **17 ms of a 67 ms frame** drawing a
 * world that was completely covered by a sheet of parchment. `setVisible(false)` skips the render
 * pass and nothing else — the scene keeps updating, so the world clock, the beats and every
 * system go on exactly as before.
 *
 * Only for screens that really do cover it. A prompt card with the map showing round its edges
 * would simply lose its background.
 */
export function setMapVisible(self: ConquestUIScene, visible: boolean): void {
  const parent = self.scene.manager.getScene('ConquestScene') ?? self.scene.manager.getScene('MapScene');
  if (parent && parent !== (self as Phaser.Scene) && parent.scene.isActive()) {
    // Never hidden on the desktop: the battle's stage is centred on the sheet with the map either
    // side of it, and the world dims under it instead (`ui:world-dim`). The 17 ms above was a
    // phone measurement.
    parent.scene.setVisible(visible || isDesktopSheet());
  }
}

export function beginOverlay(self: ConquestUIScene, key: string): void {
  swallowRestOfPress(self);
  // Everything built from here belongs to a newer interface than any press already in flight.
  //
  // This is the whole of the *"click Close, also click the menu behind"* fix. A sheet opens and
  // closes on the **press** — `InkUI.button` acts on `pointerdown` — so the release of that same
  // press is delivered to whatever the transition has just built underneath. Marking the boundary
  // here lets every release-driven control refuse a press it was not on screen for; see
  // `ui/inputGeneration`.
  bumpInputGeneration();
  // Building a full-screen overlay costs a burst of heavy frames; the ladder must not read
  // that burst as the device failing — a step down here is what blurred iPhones at high.
  qualityLadder()?.hold(800);
  releaseOverlay(self);
  self.openPromptKey = key;
  // Where this overlay belongs on the sheet — docked, centred, or the battle's stage.
  placeModalLayer(self);
  // **The map is not hidden here any more.** It used to be, for `lane:battle`, on the reasoning
  // that the battle screen is a full sheet of parchment with nothing showing through it — which is
  // true of the *fight* and false of the other page that lane opens. `showBattle` falls back to the
  // war board when no field is live, and the board is an ordinary lane list drawn over the lane's
  // 0.93 dim; with the map hidden underneath it, what showed through was the six scenes this game
  // keeps resident, chief among them the main menu. Photographed: the board's lower half was the
  // title screen, lotus and version line and all.
  //
  // So the decision moves to the one place that knows which page is about to be drawn — see
  // `showBattle`, which hides the map for the field and hands it back for the board.
  // Immediately, not on the next tick: an overlay opened while the world is held would
  // otherwise leave the bar and the zoom stack floating over it until something else moved.
  renderActionBar(self);
  renderInspect(self);
}

function releaseOverlay(self: ConquestUIScene): void {
  setMapVisible(self, true);
  // Back to the column: the battle is the only sheet that widens it, and it is gone with the layer.
  setHudSheet(self, false);
  self.stopBattleClock();
  // Nulled before `clearLanePage` runs, so the funnel cannot see it — this door pays its own way.
  if (self.battleUi) stopBattleMusic();
  self.battleUi = undefined;
  clearLanePage(self);
}

/** Closes a chrome overlay (Codex / menu / quit) without touching the prompt queue. */
export function closeOverlay(self: ConquestUIScene): void {
  // The direction the report is about: the press that closed this sheet must not go on to press
  // the bar it has just revealed.
  swallowRestOfPress(self);
  // Same boundary on the way out.
  bumpInputGeneration();
  // The close rebuilds the map chrome in one frame — held for the same reason as the open.
  qualityLadder()?.hold(800);
  releaseOverlay(self);
  self.openPromptKey = '';
  refresh(self);
}

// ── Province inspect ──────────────────────────────────────────────────────

/**
 * Detail for a tapped province, plus the one action it affords.
 *
 * "Select land, then choose how to take it" is the literal shape of the Conquer lane, so a
 * province the realm does not hold gets a button straight into its method sheet — the same
 * prompt the scheduler raises on its own clock, reached the direct way.
 */
/**
 * Top edge of the province inspect card, or `undefined` when none is shown. Sits clear of
 * the action bar; a province the realm does not hold is taller because it carries the
 * "ways in" button. Shared with the map controls so the two never overlap.
 */
function inspectCardTop(self: ConquestUIScene): number | undefined {
  const land = self.state.lands.find((candidate) => candidate.id === self.state.selectedLandId);
  if (!land || self.state.pendingAscentPrompt) return undefined;
  // Measured on the last render — a card sizes itself to its own text, so nothing can predict this
  // without building it. One frame stale at worst, and the only reader is the map controls' floor.
  return GAME_HEIGHT - ACTION_BAR_HEIGHT - (self.inspectBlockHeight ?? INSPECT_FALLBACK_HEIGHT);
}

/**
 * Gap and controls. **The card's own height is not set here, and that is the point.**
 *
 * `InkUI.card` treats the height it is given as a *minimum* and grows to fit its text, so two
 * cards asked for different fixed heights end up with different amounts of air under their last
 * line — ours tight against the rule, a rival's with a finger of blank paper. Reported as: *why
 * our land detail and other land padding different, make it consistent.*
 *
 * So neither is given one. Both are built, measured (`cardHeight`), and *then* positioned from
 * the foot of the screen, which makes the padding identical by construction and each card
 * exactly as tall as what is in it.
 *
 * 14 between the card and the controls, not 8: a button's ink border is drawn a few points proud
 * of its box, so at eight the row sat on the card's bottom rule and the card read as unclosed.
 */
const INSPECT_GAP = 14;
const INSPECT_BUTTON_HEIGHT = 38;
const INSPECT_FLOOR_GAP = 10;
/** Used before the first render has measured a card. */
const INSPECT_FALLBACK_HEIGHT = 134;

/**
 * The supply row: how far this province's goods travel, and how much survives the trip.
 *
 * Reads the cache `refreshAllLandOutputs` wrote, so the percentage on the card is by construction
 * the same number that was multiplied into the three figures above it.
 */
function supplyRow(state: GameState, land: Land): { label: string; value: string } {
  const reading = landSupply(state, land.id);
  if (reading.cutOff) {
    return { label: t('ascent.supply.row'), value: t('ascent.supply.cut') };
  }
  if (reading.hops === 0) {
    return { label: t('ascent.supply.row'), value: t('ascent.supply.seat') };
  }
  return {
    label: t('ascent.supply.row'),
    value: t('ascent.supply.hops', {
      hops: String(reading.hops),
      percent: String(Math.round(reading.factor * 100)),
    }),
  };
}

/** Everything of the reading the card prints, for the rebuild key. */
function supplyKey(state: GameState, land: Land): string {
  const reading = landSupply(state, land.id);
  return `${reading.cutOff ? 'cut' : reading.hops}/${reading.factor}`;
}

function renderInspect(self: ConquestUIScene): void {
  const land = self.state.lands.find((candidate) => candidate.id === self.state.selectedLandId);
  // Keyed on everything the card prints. It was destroyed and rebuilt on every refresh — every
  // beat, while a fight held a province selected — to show the same four numbers. An overlay
  // covering it empties the key, and the overlay's close rebuilds it fresh.
  const governor = land
    ? self.state.heroes.find((candidate) => candidate.assignedTo === land.id)
    : undefined;
  // The claim, and how far it has run. Ownership does not change for the 2-6 seasons a province
  // is being taken, and none of the other terms move either — so without this the card a player
  // opened on falling ground never repainted, never grew its retake button, and printed a clock
  // that never ticked. It is the reason the whole state was invisible from the map.
  const claim = land ? hostileClaimAt(self.state, land.id) : undefined;
  const key = !land || self.state.pendingAscentPrompt || self.openPromptKey !== ''
    ? ''
    : [land.id, land.ownerId, claim ? `${claim.progress}/${claim.required}` : '-',
      Math.round(land.outputs.gold), Math.round(land.outputs.food),
      Math.round(land.defense * masonryPowerPerDefense(self.state)
        + land.localSoldiers * militiaPowerPerMan(self.state)),
      // Both are printed now, so both have to be in the key or the card goes stale the moment the
      // player changes either from the very buttons it draws.
      governor?.id ?? '-', getLandSpecialization(land),
      // Likewise the supply reading: a corridor cut while this card is open changes the row, the
      // border and three of the numbers above, and none of the existing terms would have moved.
      supplyKey(self.state, land)].join(':');
  if (key === self.inspectKey) return;
  self.inspectKey = key;
  for (const object of self.inspectObjects) object.destroy();
  self.inspectObjects = [];

  if (key === '') return;
  if (!land) return;

  // Three states, not two. A province being taken is still ours on the map and still ours by
  // `ownerId`, but nothing the "ours" branch offers can be done to it — and the one thing that
  // can be done to it, marching an army back onto it, the card had no way to say.
  const falling = claim !== undefined;
  const claimLeft = claim ? Math.max(0, claim.required - claim.progress) : 0;
  const mine = land.ownerId === PLAYER_KINGDOM_ID && !falling;
  // The dock: the card and its buttons sit in the sheet's bottom-right corner on the desktop —
  // the selected-thing panel of every strategy game — and at the foot of the column on the phone,
  // where the dock is zero.
  const dock = uiColumnX();

  // Built at nought, measured, then moved — see the note on `INSPECT_GAP`.
  const card = self.ui.card(
    { x: 14 + dock, y: 0, width: GAME_WIDTH - 28, height: 0 },
    {
      title: land.name,
      subtitle: `${t('ascent.march.garrison', {
        value: Math.round(land.defense * masonryPowerPerDefense(self.state)
          + land.localSoldiers * militiaPowerPerMan(self.state)),
      })}`,
      rows: falling
        ? [
            // What the player needs in order to decide whether to spend a host on it: how long
            // there is, who is taking it, and what it is still worth while the clock runs.
            { label: t('ascent.falling.seasons'), value: `${claimLeft} ${tickLabel(claimLeft)}` },
            { label: t('ascent.falling.reducedYield'), value: t('ascent.falling.reducedYieldValue') },
            { label: t('resource.gold'), value: String(Math.round(land.outputs.gold)) },
            { label: t('resource.food'), value: String(Math.round(land.outputs.food)) },
          ]
        : mine
        ? [
            // All three stores, not the two that happened to fit. A focus is chosen against what
            // the province currently yields, and supplies was the one the card left out.
            { label: t('resource.food'), value: String(Math.round(land.outputs.food)) },
            { label: t('resource.supplies'), value: String(Math.round(land.outputs.supplies)) },
            { label: t('resource.gold'), value: String(Math.round(land.outputs.gold)) },
            // Who holds it. A governor is the one thing about a province of ours that is a
            // *decision* rather than a number, and it was readable nowhere on the map.
            {
              label: t('land.section.assignment'),
              value: governor ? heroName(governor) : t('gov.none'),
            },
            {
              label: t('focus.heading'),
              // Off `buildFocusRows`, so the card and the picker it opens can never disagree
              // about what a focus is called.
              value: buildFocusRows(self.state, land).find((row) => row.isCurrent)?.title ?? '—',
            },
            // How much of what it makes actually reaches the treasury, and why. Without this row
            // the haulage toll is an unexplained shortfall: the three numbers above are the
            // *delivered* figures, so a distant province simply looked poorer than it is.
            supplyRow(self.state, land),
          ]
        : [
            { label: t('resource.gold'), value: String(Math.round(land.outputs.gold)) },
            { label: t('resource.food'), value: String(Math.round(land.outputs.food)) },
          ],
      // Cinnabar for a province in trouble, either way it is in trouble: being taken, or still
      // ours and with no road home.
      border: falling || (mine && landSupply(self.state, land.id).cutOff)
        ? INK_UI.cinnabar
        : mine ? INK_UI.jade : INK_UI.softBrush,
    },
  );
  const cardHeight = Math.round((card.getData('cardHeight') as number) ?? INSPECT_FALLBACK_HEIGHT);
  self.inspectBlockHeight = cardHeight + INSPECT_GAP + INSPECT_BUTTON_HEIGHT + INSPECT_FLOOR_GAP;
  const cardY = GAME_HEIGHT - ACTION_BAR_HEIGHT - self.inspectBlockHeight;
  card.setPosition(14 + dock, cardY);
  card.setDepth(120);
  self.inspectObjects.push(card);

  /**
   * What a tapped province affords.
   *
   * A province of ours afforded **nothing** — the card returned early and the two things worth
   * doing to it, posting a governor and setting what it works at, were three taps deep inside the
   * Build lane and had to be found there by name. Reported alongside the tap itself: *if our land,
   * can see hero assigned, one button to change assign, one button to change focus.*
   *
   * They open the lane already on the right page (see `landHandover`), so the button is the whole
   * journey rather than the start of one.
   */
  const open = (page: 'options' | 'governor' | 'focus') => () => {
    self.landHandover = { landId: land.id, page };
    self.openLane('build');
  };

  const buttonY = cardY + cardHeight + INSPECT_GAP;
  // Three across for a province of ours: post a governor, set what it works at, put something up.
  // Building was the one of the three that still had to be found inside a lane by name.
  const third = (GAME_WIDTH - 40) / 3;
  const controls: Phaser.GameObjects.GameObject[] = falling
    ? [
        /**
         * The one thing that can still be done about this province.
         *
         * Governor, focus and building are all refused on carried ground, so the card used to
         * offer three buttons that answered "the enemy holds this ground" — and the order that
         * would actually help, marching a host back onto it, was not on the card at all. This
         * goes to the province's own war sheet, which carries both halves of a retake: walk onto
         * the field against the occupier, or call in the neighbours.
         */
        self.ui.button(
          { x: 14 + dock, y: buttonY, width: GAME_WIDTH - 28, height: INSPECT_BUTTON_HEIGHT },
          t('ascent.falling.retake', { land: land.name }),
          () => self.openBattleAt(land.id),
          { variant: 'primary', fontSize: '13px' },
        ),
      ]
    : mine
    ? [
        self.ui.button(
          { x: 14 + dock, y: buttonY, width: third, height: INSPECT_BUTTON_HEIGHT },
          governor ? t('ascent.inspect.changeGovernor') : t('ascent.inspect.postGovernor'),
          open('governor'),
          { variant: 'primary', fontSize: '11px' },
        ),
        self.ui.button(
          { x: 14 + dock + third + 6, y: buttonY, width: third, height: INSPECT_BUTTON_HEIGHT },
          t('ascent.inspect.changeFocus'),
          open('focus'),
          { fontSize: '11px' },
        ),
        self.ui.button(
          { x: 14 + dock + (third + 6) * 2, y: buttonY, width: third, height: INSPECT_BUTTON_HEIGHT },
          t('ascent.inspect.build'),
          open('options'),
          { fontSize: '11px' },
        ),
      ]
    : [
        self.ui.button(
          { x: 14 + dock, y: buttonY, width: GAME_WIDTH - 28, height: INSPECT_BUTTON_HEIGHT },
          t('ascent.conquer.claimThis', { land: land.name }),
          () => self.events.emit('ui:ascent-conquer', land.id),
          { variant: 'primary', fontSize: '13px' },
        ),
      ];
  for (const control of controls) {
    (control as Phaser.GameObjects.Container).setDepth(120);
    self.inspectObjects.push(control as Phaser.GameObjects.Container);
  }
}
