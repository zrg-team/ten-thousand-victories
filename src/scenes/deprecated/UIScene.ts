/**
 * **Deprecated.** The HUD of the three modes the game is no longer built around — `rival`,
 * `campaign` and `empire`. Dragon Ascent has its own (`ConquestUIScene`) and shares none of this.
 *
 * Still registered and still reachable; see `./README.md` for what is in this folder, what looks
 * like it belongs here and does not, and what has to change before any of it can go.
 */
import { attachPaperSheet } from '../../ui/ink/paperSheet';
import Phaser from 'phaser';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, isCampaignMode, PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  ACTION_BUTTON_HEIGHT,
  ACTION_BUTTON_Y,
  ActionBar,
  actionSlotAt,
} from '../../ui/ActionBar';
import { BattlePreviewPanel } from '../../ui/BattlePreviewPanel';
import { BottomSheet, SHEET_TOP } from '../../ui/BottomSheet';
import { CampaignScorePanel } from '../../ui/CampaignScorePanel';
import { ForeignAffairsPanel, stanceLabel } from '../../ui/ForeignAffairsPanel';
import { demandTribute, proposeTrade, sendGift } from '../../systems/ForeignAffairsSystem';
import { ambassadorHero, fomentUnrest, inciteWar, postAmbassador, recallAmbassador } from '../../systems/empire/EspionageSystem';
import {
  evaluatePactOffer,
  getFear,
  getPrestige,
  getTrust,
  giftCost,
  giftOpinionGain,
  hasPact,
  naturalBaseline,
  proposePact,
} from '../../systems/DiplomacySystem';
import { foreignChoiceEnabled } from '../../systems/ForeignEventSystem';
import { directiveTitle } from '../../systems/empire/DirectiveSystem';
import { eraLabel, eraProgress, pointsToNextEra } from '../../systems/empire/MandateSystem';
import { allProjects, enactProject, isProjectEnacted, projectBlockedReason, projectDescription, projectEffectSummary, projectTitle, repealProject } from '../../systems/empire/EdictSystem';
import {
  authorityCap,
  averageCompliance,
  ESTATE_CRISIS,
  estateStanding,
  overreach,
  realisedFactor,
  repealTerms,
  standingWeight,
} from '../../systems/DecreeSystem';
import { ABILITIES, abilityBlockedReason, abilityCooldown, abilityLabel, useAbility } from '../../systems/empire/AbilitySystem';
import {
  activeHeroMission,
  getHeroEnergy,
  heroAbilityBlockedReason,
  heroAbilityCooldown,
  heroAbilityLabel,
  heroMissionBlockedReason,
  heroMissionDef,
  heroMissionTargets,
  missionLabel,
} from '../../systems/empire/HeroActionSystem';
import { heroEventView } from '../../systems/empire/HeroEventSystem';
import { bankLegacy, getLegacy, rankForScore } from '../../state/legacy';
import { MINIMAP_H, MINIMAP_W, renderMinimap, type MinimapWorldInfo } from '../../ui/MinimapRenderer';
import { renderHeroFace } from '../../ui/FaceRenderer';
import { COMPACT_CARD_Y, LandPanel } from '../../ui/LandPanel';
import { ResourceBar } from '../../ui/ResourceBar';
import { createLabel, createPanel, createWoodButton, PARCHMENT } from '../../ui/theme';
import { InkScrollArea, InkUI, INK_UI, type InkCardOptions, type UIBounds } from '../../ui/InkUI';
import { UI_FONT } from '../../ui/fonts';
import { makeSwipeableCard, popInModal, staggerIn } from '../../ui/animations';
import { formatEconomyLine, getArmyGoldUpkeep, getBuildOptions, getLaborStatus, getTaxEffects, getUpgradeOptions, refreshAllLandOutputs } from '../../systems/ResourceSystem';
import { buildFocusRows } from '../../ui/focusPanel';
import {
  ALL_COURT_POSITIONS,
  assignHeroToLand,
  assignHeroToPosition,
  formatCourtPositionEffect,
  formatGovernorEffect,
  getCourtPositionLabel,
  removeHeroFromPosition,
} from '../../systems/CourtSystem';
import { ARMY_DEFAULT_PROVISIONS, ARMY_DEFAULT_RATIONS, ARMY_LOGISTICS_STEP } from '../../game/gameplayConfig';
import { applyPaperFX } from '../../ui/ink/PaperFX';
import { applyRenderScale, localPointer } from '../../game/graphicsQuality';
import type { CourtPositionId, GameState, Hero, Land, PoliticsCard, TaxPolicy } from '../../state/types';
import { ESTATE_IDS } from '../../state/types';
import {
  buildingLabel,
  formatResourceList,
  heroEffect,
  heroName,
  heroTypeLabel,
  politicsChoiceDescription,
  politicsChoiceLabel,
  politicsDescription,
  politicsTitle,
  politicsTypeLabel,
  rarityLabel,
  resourceLabel,
  seasonLabel,
  t,
  tickLabel,
} from '../../i18n';

type CourtPicker =
  | { kind: 'position'; positionId: CourtPositionId }
  | { kind: 'land'; landId: string }
  | { kind: 'diplomacy'; landId: string };

type ModalScreen =
  | 'none'
  | 'heroes'
  | 'court'
  | 'army'
  | 'request'
  | 'politics-result'
  | 'build'
  | 'battle-result'
  | 'threat-alert'
  | 'battle-decision'
  | 'land-detail'
  | 'game-menu'
  | 'exit-menu'
  | 'campaign-defeat'
  | 'foreign-affairs'
  | 'foreign-event'
  | 'hero-event'
  | 'directives'
  | 'edicts'
  | 'event-log';

const MESSAGE_STRIP_HEIGHT = 42;
/** Vertical band reserved for the always-visible empire-mode Mandate progress bar. */
const MANDATE_BAR_BAND = 24;

export class UIScene extends Phaser.Scene {
  private state!: GameState;
  private resourceBar!: ResourceBar;
  private actionBar!: ActionBar;
  private bottomSheet!: BottomSheet;
  private ui!: InkUI;
  private messageBackground!: Phaser.GameObjects.Graphics;
  private messageText!: Phaser.GameObjects.Text;
  private modalLayer!: Phaser.GameObjects.Container;
  private mapControls: Phaser.GameObjects.GameObject[] = [];
  private gameMenuButton: Phaser.GameObjects.GameObject[] = [];
  private modalScreen: ModalScreen = 'none';
  private modalJustOpened = false;
  private modalBuildLandId?: string;
  private requestBadge: Phaser.GameObjects.GameObject[] = [];
  private lastSpyReportCount = 0;
  private affairsBadge: Phaser.GameObjects.GameObject[] = [];
  private empireBanners: Phaser.GameObjects.GameObject[] = [];
  private notifBell: Phaser.GameObjects.GameObject[] = [];
  private toastObjects: Phaser.GameObjects.GameObject[] = [];
  private telegraphObjects: Phaser.GameObjects.GameObject[] = [];
  private mandateBarObjects: Phaser.GameObjects.GameObject[] = [];
  private lastYear?: number;
  private selectedAffairsKingdomId?: string;
  private affairsPactOpen = false;
  private affairsPactSweetener = 0;
  private politicsResultMessage = '';
  private minimapOpen = false;
  private minimapObjects: Phaser.GameObjects.GameObject[] = [];
  private selectedArmyLeaderId?: string;
  private armySoldiers = 400;
  private armyFood = ARMY_DEFAULT_RATIONS;
  private armySupplies = ARMY_DEFAULT_PROVISIONS;
  private armyComposition: 'balanced' | 'spears' | 'archers' | 'shock' = 'balanced';
  private battleStance: 'assault' | 'balanced' | 'cautious' = 'balanced';
  private courtTab: 'positions' | 'governors' = 'positions';
  /** When set, the Heroes modal shows the mission target picker for this hero id. */
  private heroActionPicker?: string;
  /** Which offered hero is currently selected in the recruitment draft. */
  private selectedDraftId?: string;
  private courtPicker?: CourtPicker;
  private lastCourtView?: string;
  private modalContentBounds: UIBounds = { x: 28, y: 102, width: 334, height: 636 };
  private modalFooterBounds: UIBounds = { x: 28, y: 748, width: 334, height: 48 };
  private activeScrollAreas: InkScrollArea[] = [];

  /** One key per piece of standing chrome; see `syncChrome`. */
  private chromeKeys: Record<string, string> = {};

  /** Forces the open minimap to redraw each refresh (its viewport rides the camera). */
  private minimapNonce = 0;
  private compactCard: Phaser.GameObjects.GameObject[] = [];
  /** Stored so `cleanup` can take it off: the scene's emitter survives `scene.stop()`, and an
   *  anonymous handler left behind stacks once per run — N runs meant N full HUD rebuilds per tick. */
  private readonly onStateChanged = (): void => {
    this.refresh();
  };

  private readonly domPointerUp = (event: PointerEvent): void => {
    const point = this.toGamePoint(event);
    if (!point) {
      return;
    }

    this.handlePointerUp({ x: point.x, y: point.y } as Phaser.Input.Pointer);
  };
  private readonly domMouseUp = (event: MouseEvent): void => {
    const point = this.toGamePoint(event);
    if (!point) {
      return;
    }

    this.handlePointerUp({ x: point.x, y: point.y } as Phaser.Input.Pointer);
  };

  constructor() {
    super('UIScene');
  }

  init(data: { state: GameState }): void {
    this.state = data.state;
    this.modalScreen = 'none';
    this.modalJustOpened = false;
    this.modalBuildLandId = undefined;
    this.requestBadge = [];
    this.affairsBadge = [];
    this.empireBanners = [];
    this.notifBell = [];
    this.selectedAffairsKingdomId = undefined;
    this.affairsPactOpen = false;
    this.affairsPactSweetener = 0;
    this.lastSpyReportCount = 0;
    this.selectedArmyLeaderId = undefined;
    this.armySoldiers = 400;
    this.armyFood = ARMY_DEFAULT_RATIONS;
    this.armySupplies = ARMY_DEFAULT_PROVISIONS;
    this.courtTab = 'positions';
    this.heroActionPicker = undefined;
    this.selectedDraftId = undefined;
    this.courtPicker = undefined;
    this.lastCourtView = undefined;
    this.activeScrollAreas = [];
    this.chromeKeys = {};
    this.compactCard = [];
    this.mapControls = [];
    this.gameMenuButton = [];
    this.minimapOpen = false;
    this.minimapObjects = [];
  }

  create(): void {
    applyRenderScale(this);
    // The chrome is printed on the same sheet as the world, so it takes the same paper pass.
    applyPaperFX(this);
    attachPaperSheet(this);
    this.input.setTopOnly(true);
    this.ui = new InkUI(this);
    this.resourceBar = new ResourceBar(this, this.state);
    this.actionBar = new ActionBar(this, this.state, (action) => this.handleAction(action));
    this.bottomSheet = new BottomSheet(this);
    this.modalLayer = this.add.container(0, 0).setDepth(500).setVisible(false);
    this.messageBackground = this.add.graphics().setDepth(108);
    this.messageBackground.fillGradientStyle(
      INK_UI.parchment,
      INK_UI.parchment,
      INK_UI.parchment,
      INK_UI.parchment,
      0.76,
      0.76,
      0.58,
      0.58,
    );
    this.messageBackground.fillRect(0, HEADER_HEIGHT, GAME_WIDTH, MESSAGE_STRIP_HEIGHT);
    // The parchment fill alone delimits the message strip; no drawn divider lines under
    // the resource bar (they read as a stray coloured line beneath the numbers).
    this.messageText = this.add.text(14, HEADER_HEIGHT + 5, '', {
      color: '#1e2a22',
      fontFamily: UI_FONT,
      fontSize: '12px',
      lineSpacing: 1,
      // Reserve the right edge of the strip for the Chronicle (notification) bell.
      wordWrap: { width: GAME_WIDTH - 110 },
    }).setDepth(110);
    this.messageText.setMaxLines(2);

    this.events.on('state-changed', this.onStateChanged);
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    this.game.canvas.addEventListener('pointerup', this.domPointerUp);
    this.game.canvas.addEventListener('mouseup', this.domMouseUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.refresh();
  }

  private cleanup(): void {
    this.events.off('state-changed', this.onStateChanged);
    this.destroyScrollAreas();
    this.game.canvas.removeEventListener('pointerup', this.domPointerUp);
    this.game.canvas.removeEventListener('mouseup', this.domMouseUp);
  }

  /** The one owner of scroll-area teardown: each holds a global wheel handler and a scene UPDATE
   *  listener, and Phaser clears neither on shutdown. */
  private destroyScrollAreas(): void {
    for (const scrollArea of this.activeScrollAreas) {
      scrollArea.destroy();
    }
    this.activeScrollAreas = [];
  }

  private handlePointerUp(rawPointer: Phaser.Input.Pointer): void {
    // Every bound below is a column number, so the pointer has to be one too.
    const pointer = localPointer(this, rawPointer);
    if (this.modalScreen !== 'none') {
      this.handleModalTap(pointer.x, pointer.y);
      return;
    }

    if (pointer.x >= GAME_WIDTH - 64 && pointer.x <= GAME_WIDTH - 4 && pointer.y >= 0 && pointer.y <= HEADER_HEIGHT - 18) {
      this.openModal('game-menu');
      return;
    }

    if (this.state.pendingCourtRequest && pointer.x >= GAME_WIDTH - 108 && pointer.x <= GAME_WIDTH - 8 && pointer.y >= HEADER_HEIGHT && pointer.y <= HEADER_HEIGHT + 70) {
      this.openModal('request');
      return;
    }

    const buttonTop = ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2;
    const buttonBottom = ACTION_BUTTON_Y + ACTION_BUTTON_HEIGHT / 2;
    if (pointer.y < buttonTop || pointer.y > buttonBottom) {
      return;
    }

    // Asks the bar itself where its buttons are rather than re-deriving a stride, so a bar
    // whose widths were clamped to fit the screen is still hit-tested where it was drawn.
    const slot = actionSlotAt(this.state.gameMode, pointer.x);
    if (slot) {
      this.handleAction(slot.action);
    }
  }

  private toGamePoint(event: PointerEvent | MouseEvent): { x: number; y: number } | undefined {
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return undefined;
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * GAME_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * GAME_HEIGHT,
    };
  }

  private handleModalTap(x: number, y: number): void {
    if (x >= 321 && x <= 363 && y >= 27 && y <= 57) {
      this.closeModal();
      this.refresh();
      return;
    }

    // The recruitment draft (Pass / Recruit + the selector tiles) is driven by its own
    // interactive buttons and hit areas, so no coordinate handling is needed here.

    if (this.modalScreen === 'army') {
      const leaders = this.state.heroes.filter((hero) => !hero.assignedTo);
      const visibleLeaders = leaders.slice(0, 3);
      visibleLeaders.forEach((hero, index) => {
        const cardX = GAME_WIDTH / 2 + (index - (visibleLeaders.length - 1) / 2) * 114;
        if (x >= cardX - 47 && x <= cardX + 47 && y >= 122 && y <= 248) {
          this.selectedArmyLeaderId = hero.id;
          this.refresh();
        }
      });

      if (leaders.length === 0) {
        return;
      }

      if (x >= 60 && x <= 124 && y >= 365 && y <= 407) {
        this.armySoldiers = Math.max(100, this.armySoldiers - 100);
        this.refresh();
        return;
      }
      if (x >= 266 && x <= 330 && y >= 365 && y <= 407) {
        this.armySoldiers = Math.min(Math.max(100, this.state.resources.humans), this.armySoldiers + 100);
        this.refresh();
        return;
      }
      if (x >= 60 && x <= 124 && y >= 499 && y <= 541) {
        this.armyFood = Math.max(0, this.armyFood - ARMY_LOGISTICS_STEP);
        this.refresh();
        return;
      }
      if (x >= 266 && x <= 330 && y >= 499 && y <= 541) {
        this.armyFood = Math.min(this.state.resources.food, this.armyFood + ARMY_LOGISTICS_STEP);
        this.refresh();
        return;
      }
      if (x >= 60 && x <= 124 && y >= 589 && y <= 631) {
        this.armySupplies = Math.max(0, this.armySupplies - ARMY_LOGISTICS_STEP);
        this.refresh();
        return;
      }
      if (x >= 266 && x <= 330 && y >= 589 && y <= 631) {
        this.armySupplies = Math.min(this.state.resources.supplies, this.armySupplies + ARMY_LOGISTICS_STEP);
        this.refresh();
        return;
      }
      if (x >= 97 && x <= 293 && y >= 686 && y <= 734) {
        if (!this.selectedArmyLeaderId) {
          this.state.message = t('msg.chooseCommander');
          this.refresh();
          return;
        }
        this.events.emit('ui:create-army', this.selectedArmyLeaderId, this.armySoldiers, this.armyFood, this.armySupplies, this.armyComposition);
        this.closeModal();
      }
      return;
    }

    if (this.modalScreen === 'request' && this.state.activePoliticsCard) {
      const [first, second] = this.state.activePoliticsCard.choices;
      if (x >= 61 && x <= 329 && y >= 429 && y <= 487) {
        this.events.emit('ui:politics-choice', first.id);
        if (!this.state.activePoliticsCard) {
          this.closeModal();
        } else {
          this.refresh();
        }
        return;
      }
      if (x >= 61 && x <= 329 && y >= 515 && y <= 573) {
        this.events.emit('ui:politics-choice', second.id);
        if (!this.state.activePoliticsCard) {
          this.closeModal();
        } else {
          this.refresh();
        }
      }
    }
  }

  private handleAction(action: string): void {
    if (action === 'heroes') {
      this.heroActionPicker = undefined;
      this.openModal('heroes');
      return;
    }

    if (action === 'court') {
      this.courtTab = 'positions';
      this.courtPicker = undefined;
      this.openModal('court');
      return;
    }

    if (action === 'army') {
      this.selectedArmyLeaderId = this.pickDefaultLeader()?.id;
      this.openModal('army');
      return;
    }

    if (action === 'build') {
      const selectedLand = this.getSelectedLand();
      const buildLand = selectedLand?.ownerId === PLAYER_KINGDOM_ID ? selectedLand : this.getDefaultBuildLand();
      if (!buildLand) {
        this.state.message = t('msg.selectDistrictBuild');
        this.refresh();
        return;
      }
      this.openBuildModal(buildLand.id);
      return;
    }

    if (action === 'foreign-affairs' || action === 'affairs') {
      if (isCampaignMode(this.state.gameMode)) {
        this.openModal('foreign-affairs');
      }
      return;
    }

    if (action === 'directives') {
      if (this.state.gameMode === 'empire') {
        this.openModal('directives');
      }
      return;
    }

    if (action === 'pause') {
      this.state.isStrategyPause = !this.state.isStrategyPause;
      this.refresh();
      return;
    }

    if (action === 'zoom-in') {
      this.events.emit('ui:zoom-map', 1);
      return;
    }

    if (action === 'zoom-out') {
      this.events.emit('ui:zoom-map', -1);
      return;
    }

    if (action === 'toggle-render-mode') {
      this.events.emit('ui:toggle-render-mode');
      this.refresh();
      return;
    }

    if (action === 'map') {
      this.closeModal();
      this.state.selectedLandId = undefined;
      this.state.latestBattlePreview = undefined;
      this.state.selectedArmyId = undefined;
      this.state.message = t('msg.mapMode');
      this.bottomSheet.hide();
      this.refresh();
    }
  }

  private openModal(screen: ModalScreen): void {
    this.state.isStrategyPause = false;
    if (screen === 'campaign-defeat') {
      // Defeat screen pauses but doesn't use the standard modal frame
      this.modalScreen = screen;
      this.modalJustOpened = true;
      this.state.isPaused = true;
      this.bottomSheet.hide();
      this.refresh();
      return;
    }

    this.modalScreen = screen;
    this.modalJustOpened = true;
    this.state.isPaused = true;
    this.bottomSheet.hide();

    if (screen === 'request' && this.state.pendingCourtRequest) {
      this.state.activePoliticsCard = this.state.pendingCourtRequest;
      this.state.pendingCourtRequest = undefined;
    }

    this.refresh();
  }

  private closeModal(): void {
    if (this.modalScreen === 'request' && this.state.activePoliticsCard) {
      this.state.message = t('msg.courtRequiresAnswer');
      return;
    }
    this.modalScreen = 'none';
    this.state.activePoliticsCard = undefined;
    this.state.latestBattleResult = undefined;
    this.state.isPaused = false;
    window.__suppressMapInputUntil = performance.now() + 280;
    this.clearModalLayer();
    this.modalLayer.setVisible(false);
    this.modalBuildLandId = undefined;
    this.heroActionPicker = undefined;
    this.selectedAffairsKingdomId = undefined;
    this.affairsPactOpen = false;
    this.affairsPactSweetener = 0;
    this.refresh();
  }

  private refresh(): void {
    this.resourceBar.refresh();
    this.actionBar.refresh();
    this.messageText.setText(this.state.message);
    // The standing chrome — bell, badges, banners, bars, controls — is keyed now, not swept:
    // each `syncChrome` below rebuilds its widget only when what it prints has changed. This
    // ran on every state-changed emit (every tick, and every beat during a fight) and rebuilt
    // ~20 objects with 8–17 fresh Text canvases to draw the same pixels. Toasts stay swept —
    // they are transient by design.
    this.clearToastFeed();

    // A brief cinematic when the year turns — the survival clock advancing is the
    // heartbeat of the campaign, so make each new year land as a moment.
    if (this.lastYear === undefined) {
      this.lastYear = this.state.year;
    } else if (this.state.year > this.lastYear) {
      this.lastYear = this.state.year;
      if (isCampaignMode(this.state.gameMode)) {
        this.playYearTransition(this.state.year);
      }
    }
    if (this.state.victory) {
      this.hideChrome();
      this.showVictory();
      return;
    }

    if (this.modalScreen === 'none' && this.state.isDefeated && isCampaignMode(this.state.gameMode)) {
      this.openModal('campaign-defeat');
      return;
    }

    // Urgent, pausing intel & tactical decisions preempt other modals.
    if (this.modalScreen === 'none' && this.state.pendingBattle) {
      this.openModal('battle-decision');
      return;
    }

    if (this.modalScreen === 'none' && this.state.pendingThreatAlert) {
      this.openModal('threat-alert');
      return;
    }

    if (this.modalScreen === 'none' && this.state.latestBattleResult) {
      this.openModal('battle-result');
      return;
    }

    if (this.modalScreen === 'none' && this.state.pendingCourtRequest) {
      this.openModal('request');
      return;
    }

    if (this.modalScreen === 'none' && this.state.pendingForeignCard) {
      this.openModal('foreign-event');
      return;
    }

    if (this.modalScreen === 'none' && this.state.pendingHeroEvent) {
      this.openModal('hero-event');
      return;
    }

    if (this.modalScreen !== 'none') {
      this.hideChrome();
      this.bottomSheet.hide();
      this.renderModal();
      return;
    }

    this.clearModalLayer();
    this.modalLayer.setVisible(false);
    this.syncChrome('menu', 'on', () => this.clearGameMenuButton(), () => this.renderGameMenuButton());
    {
      const unread = (this.state.eventLog ?? []).reduce((n, e) => (e.read ? n : n + 1), 0);
      this.syncChrome('bell', unread > 9 ? '9+' : String(unread),
        () => this.clearNotifBell(), () => this.renderNotifBell());
    }
    {
      // The same anchor arithmetic `renderMapControls` uses — the stack only moves when the
      // thing it floats above changes.
      const bottomAnchor = this.state.latestBattlePreview ? SHEET_TOP - 10
        : this.state.selectedLandId ? COMPACT_CARD_Y - 10
          : GAME_HEIGHT - 54;
      this.syncChrome('controls', `${bottomAnchor}:${this.state.mapRenderMode}`,
        () => this.clearMapControls(), () => this.renderMapControls());
    }
    // The open minimap redraws every refresh (the viewport rectangle rides the camera); the
    // closed toggle — the usual state — is built once.
    this.syncChrome('minimap',
      this.state.selectedLandId || this.state.latestBattlePreview ? 'hidden'
        : this.minimapOpen ? `open:${(this.minimapNonce += 1)}` : 'toggle',
      () => this.clearMinimap(), () => this.renderMinimap());

    this.syncChrome('request',
      this.state.pendingCourtRequest ? `card:${this.state.pendingCourtRequest.id ?? 'pending'}` : 'hidden',
      () => this.clearRequestBadge(),
      () => this.renderCourtRequestBadge(this.state.pendingCourtRequest!));

    if (this.state.gameMode === 'empire') {
      this.syncChrome('mandate', this.mandateBarKey(),
        () => this.clearMandateBar(), () => this.renderMandateBar());
      this.syncChrome('empire', this.empireBannersKey(),
        () => this.clearEmpireBanners(), () => this.renderEmpireBanners());
      this.syncChrome('telegraph', this.telegraphKey(),
        () => this.clearTelegraphBanner(), () => this.renderTelegraphBanner());
      // Toasts are surfaced in the header message strip (+ notification bell), not as a
      // floating feed that overlaps on-map panels — one place for notifications.
    }

    if (isCampaignMode(this.state.gameMode)) {
      this.syncChrome('affairs', this.dynastyKey(),
        () => this.clearAffairsBadge(), () => this.renderDynastyStability());
      const newReports = this.state.spyReports.length > this.lastSpyReportCount;
      if (newReports) {
        this.lastSpyReportCount = this.state.spyReports.length;
        const latest = this.state.spyReports[this.state.spyReports.length - 1];
        if (latest) {
          this.state.message = latest.message;
          this.messageText.setText(this.state.message);
        }
      }
    }

    if (this.state.latestBattlePreview) {
      this.syncChrome('compact', 'hidden', () => this.clearCompactCard(), () => {});
      // The whole preview is the key: it is a small plain object, and any field it prints
      // changing is exactly when the sheet's content must be rebuilt.
      const previewKey = `${JSON.stringify(this.state.latestBattlePreview)}|${this.battleStance}`;
      if (this.chromeKeys.preview !== previewKey) {
        this.chromeKeys.preview = previewKey;
        const panel = new BattlePreviewPanel(this, this.state, this.battleStance, (stance) => {
          this.battleStance = stance;
          this.refresh();
        }, (armyId, landId, stance) => {
          this.events.emit('ui:attack-land', armyId, landId, stance);
        });
        this.bottomSheet.show(panel.render(this.state.latestBattlePreview));
      }
      return;
    }
    this.chromeKeys.preview = 'hidden';

    const selectedLand = this.state.lands.find((land) => land.id === this.state.selectedLandId);
    if (selectedLand) {
      this.bottomSheet.hide();
      // Rebuilt once per tick while a province is selected (`turn` is in the key — the card
      // quotes order progress that moves on the tick), never on the quiet emits between.
      const compactKey = [selectedLand.id, selectedLand.ownerId, selectedLand.defense,
        selectedLand.buildings.length, selectedLand.population, selectedLand.localSoldiers,
        this.state.selectedArmyId ?? '', this.state.turn].join(':');
      this.syncChrome('compact', compactKey, () => this.clearCompactCard(), () => {
        this.compactCard = this.makeLandPanel(selectedLand).render(selectedLand);
      });
      return;
    }
    this.syncChrome('compact', 'hidden', () => this.clearCompactCard(), () => {});

    this.bottomSheet.hide();
  }

  /**
   * Rebuilds one piece of standing chrome only when its key changes.
   *
   * The key is everything the widget prints; 'hidden' clears without rebuilding. Hidden-or-kept
   * beats destroy-and-recreate here because most emits change nothing: before this, every tick
   * tore down and rebuilt the bell, the menu button, the map controls, the minimap toggle and —
   * in empire mode — the mandate bar and every banner, to draw the same pixels.
   */
  private syncChrome(slot: string, key: string, clear: () => void, render: () => void): void {
    if (this.chromeKeys[slot] === key) {
      return;
    }
    this.chromeKeys[slot] = key;
    clear();
    if (key !== 'hidden') {
      render();
    }
  }

  /** Puts every keyed widget away — the victory and modal paths, where no chrome shows. */
  private hideChrome(): void {
    this.syncChrome('menu', 'hidden', () => this.clearGameMenuButton(), () => {});
    this.syncChrome('bell', 'hidden', () => this.clearNotifBell(), () => {});
    this.syncChrome('controls', 'hidden', () => this.clearMapControls(), () => {});
    this.syncChrome('minimap', 'hidden', () => this.clearMinimap(), () => {});
    this.syncChrome('request', 'hidden', () => this.clearRequestBadge(), () => {});
    this.syncChrome('mandate', 'hidden', () => this.clearMandateBar(), () => {});
    this.syncChrome('empire', 'hidden', () => this.clearEmpireBanners(), () => {});
    this.syncChrome('telegraph', 'hidden', () => this.clearTelegraphBanner(), () => {});
    this.syncChrome('affairs', 'hidden', () => this.clearAffairsBadge(), () => {});
    this.syncChrome('compact', 'hidden', () => this.clearCompactCard(), () => {});
    this.chromeKeys.preview = 'hidden';
  }

  private mandateBarKey(): string {
    if (!this.state.mandate) return 'hidden';
    const prog = eraProgress(this.state);
    return `${prog.era}:${prog.atMax ? 1 : 0}:${Math.round(prog.points)}:${prog.nextThreshold}`;
  }

  private empireBannersKey(): string {
    if (this.state.selectedLandId || this.state.latestBattlePreview) return 'hidden';
    const rows = this.state.kingdoms
      .filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated)
      .map((k) => `${k.id}:${Math.round((k.relations ?? 50) / 5)}`
        + `:${(this.state.invasions ?? []).some((r) => r.kingdomId === k.id) ? 1 : 0}`);
    return rows.length > 0 ? rows.join('|') : 'hidden';
  }

  private telegraphKey(): string {
    const u = this.state.pendingUltimatum;
    if (!u || u.defused || this.state.selectedLandId || this.state.latestBattlePreview) return 'hidden';
    return `${u.kingdomId}:${u.isGreatInvasion ? 1 : 0}:${Math.max(0, u.dueTurn - this.state.turn)}`;
  }

  private dynastyKey(): string {
    const ds = this.state.dynastyStatus;
    if (!ds) return 'hidden';
    const value = Math.round(
      this.state.court.stability * 0.4 + (100 - ds.farmerUnrest) * 0.35 + ds.nobleRelations * 0.25,
    );
    return String(value);
  }

  private renderModal(): void {
    this.clearModalLayer();
    this.modalLayer.setVisible(true);

    if (this.modalScreen === 'campaign-defeat') {
      this.showCampaignDefeatScreen();
    } else if (this.modalScreen === 'heroes') {
      this.showHeroesScreen();
    } else if (this.modalScreen === 'court') {
      this.showCourtScreen();
    } else if (this.modalScreen === 'army') {
      this.showArmyScreen();
    } else if (this.modalScreen === 'request' && this.state.activePoliticsCard) {
      this.showPoliticsScreen(this.state.activePoliticsCard);
    } else if (this.modalScreen === 'politics-result') {
      this.showPoliticsResultScreen();
    } else if (this.modalScreen === 'build') {
      this.showBuildScreen();
    } else if (this.modalScreen === 'threat-alert') {
      this.showThreatAlertScreen();
    } else if (this.modalScreen === 'battle-decision') {
      this.showBattleDecisionScreen();
    } else if (this.modalScreen === 'battle-result') {
      this.showBattleResultScreen();
    } else if (this.modalScreen === 'land-detail') {
      this.showLandDetailScreen();
    } else if (this.modalScreen === 'game-menu') {
      this.showGameMenuScreen();
    } else if (this.modalScreen === 'exit-menu') {
      this.showExitMenuScreen();
    } else if (this.modalScreen === 'directives') {
      this.showDirectivesScreen();
    } else if (this.modalScreen === 'edicts') {
      this.showEdictsScreen();
    } else if (this.modalScreen === 'event-log') {
      this.showEventLogScreen();
    } else if (this.modalScreen === 'foreign-affairs') {
      this.showForeignAffairsScreen();
    } else if (this.modalScreen === 'foreign-event') {
      this.showForeignEventScreen();
    } else if (this.modalScreen === 'hero-event') {
      this.showHeroEventScreen();
    }

    if (this.modalJustOpened) {
      this.modalJustOpened = false;
      popInModal(this, this.modalLayer, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    }
  }

  private addModalBase(title: string, subtitle: string): void {
    const modal = this.ui.modal({ title, subtitle, onClose: () => this.closeModal() });
    this.modalContentBounds = modal.contentBounds;
    this.modalFooterBounds = modal.footerBounds;
    this.modalLayer.add(modal.objects);
  }

  private clearModalLayer(): void {
    this.destroyScrollAreas();
    this.modalLayer.removeAll(true);
  }

  private showHeroesScreen(): void {
    this.addModalBase(t('modal.heroes.title'), t('modal.heroes.subtitle'));
    const content = this.modalContentBounds;

    if (!this.state.activeHeroDraft || this.state.activeHeroDraft.length === 0) {
      // Empire mode: the roster is a live command hub — dispatch missions, fire signature
      // abilities, watch Energy recover. Other modes keep the simple read-only roster.
      if (this.state.gameMode === 'empire') {
        if (this.heroActionPicker) {
          this.showHeroMissionTargetPicker(this.heroActionPicker);
        } else {
          this.showHeroCommandHub();
        }
        return;
      }
      const favor = this.state.court.favor;
      const threshold = this.state.court.favorThreshold;
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 6, t('status.noHeroesWaiting'), 'label', {
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 290 },
      }).setOrigin(0.5));
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 32, t('status.nextArrival', { favor: Math.round(favor), threshold }), 'caption', {
        fontSize: '12px',
      }).setOrigin(0.5));
      const favorRatio = Phaser.Math.Clamp(favor / threshold, 0, 1);
      const favorBarBg = this.add.rectangle(GAME_WIDTH / 2 - 112, content.y + 61, 224, 12, INK_UI.brush, 0.28).setOrigin(0, 0.5);
      const favorBarFill = this.add.rectangle(GAME_WIDTH / 2 - 112, content.y + 61, 224 * favorRatio, 12, INK_UI.jade, 0.95).setOrigin(0, 0.5);
      this.modalLayer.add([favorBarBg, favorBarFill]);

      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 92, t('status.currentRoster'), 'label', { fontSize: '14px' }).setOrigin(0.5));
      const listBounds = { x: content.x, y: content.y + 118, width: content.width, height: content.height - 118 };
      const scroll = this.ui.scrollArea(listBounds);
      scroll.addTo(this.modalLayer);
      this.activeScrollAreas.push(scroll);
      const rosterRows: Phaser.GameObjects.Container[] = [];
      this.state.heroes.slice(0, 7).forEach((hero, index) => {
        const y = index * 66;
        const row = this.ui.card({ x: 0, y, width: listBounds.width, height: 58 });
        row.add(renderHeroFace(this, hero, 30, 30, 0.34));
        row.add(createLabel(this, 62, 13, heroName(hero), 'label', { fontSize: '13px', wordWrap: { width: 238 } }));
        row.add(createLabel(this, 62, 34, t('status.assigned', { assignment: hero.assignedTo ?? t('status.idle') }), 'caption', {
          fontSize: '11px',
          wordWrap: { width: 238 },
        }));
        scroll.content.add(row);
        rosterRows.push(row);
      });
      scroll.setContentHeight(this.state.heroes.slice(0, 7).length * 66);
      if (this.modalJustOpened) {
        staggerIn(this, rosterRows);
      }
      return;
    }

    // A visiting party of heroes — the player picks ONE. A tappable portrait tile per
    // offered hero drives the selection; the big card shows the selected hero's detail.
    const draft = this.state.activeHeroDraft;
    const selectedId = draft.some((h) => h.id === this.selectedDraftId) ? this.selectedDraftId! : draft[0].id;
    const selected = draft.find((h) => h.id === selectedId) ?? draft[0];

    const tileW = Math.min(104, Math.floor((content.width - (draft.length - 1) * 8) / draft.length));
    const tileGap = 8;
    const totalW = draft.length * tileW + (draft.length - 1) * tileGap;
    const selStartX = GAME_WIDTH / 2 - totalW / 2;
    const selY = content.y;
    const selectorTiles: Phaser.GameObjects.Container[] = [];
    draft.forEach((hero, i) => {
      const tx = selStartX + i * (tileW + tileGap);
      const isSelected = hero.id === selectedId;
      const tileH = 100;
      const tile = this.ui.card({ x: tx, y: selY, width: tileW, height: tileH }, {
        border: isSelected ? INK_UI.gold : INK_UI.softBrush,
        borderWidth: isSelected ? 3 : 1.5,
      });
      this.modalLayer.add(tile);
      this.modalLayer.add(renderHeroFace(this, hero, tx + tileW / 2, selY + 26, 0.34));
      // Name strip below the portrait with dark text — light-on-parchment was unreadable.
      const nameStrip = this.add.graphics();
      nameStrip.fillStyle(INK_UI.brush, isSelected ? 0.9 : 0.72);
      nameStrip.fillRoundedRect(tx + 4, selY + 56, tileW - 8, 38, 4);
      this.modalLayer.add(nameStrip);
      this.modalLayer.add(createLabel(this, tx + tileW / 2, selY + 60, heroName(hero), 'caption', {
        fontSize: '9px',
        align: 'center',
        color: isSelected ? '#2a2118' : '#6f6250',
        wordWrap: { width: tileW - 10 },
      }).setOrigin(0.5, 0).setMaxLines(2));
      const hit = this.add.rectangle(tx + tileW / 2, selY + tileH / 2, tileW, tileH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.selectedDraftId = hero.id;
        this.refresh();
      });
      this.modalLayer.add(hit);
      selectorTiles.push(tile);
    });

    const cardScale = 0.82;
    const cardCy = selY + 100 + 14 + 250 * cardScale;
    const bigCard = this.drawHeroCard(selected, GAME_WIDTH / 2, cardCy, cardScale, 0, true);
    this.modalLayer.add(bigCard);

    if (this.modalJustOpened) {
      staggerIn(this, selectorTiles, { staggerMs: 70, offsetY: -20, duration: 220 });
    }

    makeSwipeableCard(this, bigCard, 304 * cardScale, 500 * cardScale, {
      onSwipeRight: () => {
        this.events.emit('ui:hero-pick', selected.id);
        this.closeModal();
      },
      onSwipeLeft: () => this.passDraft(),
    });

    this.modalLayer.add(createWoodButton(this, 110, 748, 126, 42, t('action.pass'), () => this.passDraft(), { variant: 'dark' }));
    this.modalLayer.add(createWoodButton(this, 270, 748, 126, 42, t('action.recruit'), () => {
      this.events.emit('ui:hero-pick', selected.id);
      this.closeModal();
    }, { variant: 'highlight' }));
  }

  private passDraft(): void {
    this.state.activeHeroDraft = undefined;
    this.selectedDraftId = undefined;
    this.state.message = t('msg.visitingHeroesLeave');
    this.closeModal();
    this.refresh();
  }

  private showHeroCommandHub(): void {
    const content = this.modalContentBounds;
    const favor = this.state.court.favor;
    const threshold = this.state.court.favorThreshold;
    this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y, t('status.nextArrival', { favor: Math.round(favor), threshold }), 'caption', {
      fontSize: '11px',
      align: 'center',
    }).setOrigin(0.5));

    const listBounds = { x: content.x, y: content.y + 22, width: content.width, height: content.height - 22 };
    const scroll = this.ui.scrollArea(listBounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    const rowH = 122;
    const rows: Phaser.GameObjects.Container[] = [];
    this.state.heroes.forEach((hero, index) => {
      const row = this.buildHeroHubRow(hero, listBounds.width, index * rowH, rowH - 10);
      scroll.content.add(row);
      rows.push(row);
    });
    scroll.setContentHeight(this.state.heroes.length * rowH);
    if (this.modalJustOpened) {
      staggerIn(this, rows);
    }
  }

  private buildHeroHubRow(hero: Hero, width: number, top: number, height: number): Phaser.GameObjects.Container {
    const row = this.add.container(0, top);
    row.add(this.ui.card({ x: 0, y: 0, width, height }));
    row.add(renderHeroFace(this, hero, 30, 34, 0.32));

    const textX = 60;
    const energyLabelW = 62;
    row.add(createLabel(this, textX, 8, heroName(hero), 'label', {
      fontSize: '13px',
      wordWrap: { width: width - textX - energyLabelW },
    }).setMaxLines(1));
    // Type + upkeep cost so the player can weigh each hero's payroll at a glance.
    row.add(createLabel(this, textX, 26, `${heroTypeLabel(hero.type)} · ${t('hero.hub.upkeep', { gold: hero.upkeepGold })}`, 'caption', {
      fontSize: '10px',
      color: '#6f6250',
    }).setMaxLines(1));

    // Energy meter — the spine that paces all hero action.
    const energy = getHeroEnergy(hero);
    row.add(createLabel(this, width - 10, 8, t('hero.hub.energy', { value: energy }), 'caption', { fontSize: '9px', align: 'right', color: '#6f6250' }).setOrigin(1, 0));
    row.add(this.ui.statBar({ x: textX, y: 44, width: width - textX - 10, height: 7 }, energy, 100, energy > 40 ? INK_UI.jade : INK_UI.cinnabar));

    // Status line (friendly label; never wraps into the button row).
    const mission = activeHeroMission(this.state, hero.id);
    row.add(createLabel(this, textX, 56, this.heroStatusLabel(hero), 'caption', {
      fontSize: '10px',
      color: mission ? '#8a5f1c' : '#6f6250',
      wordWrap: { width: width - textX - 10 },
    }).setMaxLines(1));

    // Action buttons: Dispatch (mission) + signature Ability.
    const btnY = height - 32;
    const btnW = (width - 12) / 2;
    const def = heroMissionDef(hero);
    const missionBlocked = heroMissionBlockedReason(this.state, hero);
    row.add(this.ui.button({ x: 4, y: btnY, width: btnW, height: 26 }, t('hero.hub.dispatch', { mission: missionLabel(def.kind) }), () => {
      if (missionBlocked) {
        this.state.message = missionBlocked;
        this.refresh();
        return;
      }
      if (def.needsTarget) {
        this.heroActionPicker = hero.id;
        this.refresh();
      } else {
        this.events.emit('ui:hero-mission', hero.id);
      }
    }, { variant: missionBlocked ? 'disabled' : 'primary', fontSize: '10px' }));

    const abilityBlocked = heroAbilityBlockedReason(this.state, hero);
    const cd = heroAbilityCooldown(this.state, hero.id);
    const abilityText = cd > 0 ? `${heroAbilityLabel(hero)} (${cd})` : heroAbilityLabel(hero);
    row.add(this.ui.button({ x: 8 + btnW, y: btnY, width: btnW, height: 26 }, abilityText, () => {
      if (abilityBlocked) {
        this.state.message = abilityBlocked;
        this.refresh();
        return;
      }
      this.events.emit('ui:hero-ability', hero.id);
    }, { variant: abilityBlocked ? 'disabled' : 'secondary', fontSize: '10px' }));

    return row;
  }

  /** A short, human-readable status for a hero (mission / posting / idle) — never a raw id. */
  private heroStatusLabel(hero: Hero): string {
    const mission = activeHeroMission(this.state, hero.id);
    if (mission) {
      return t('hero.hub.onMission', { mission: missionLabel(mission.kind), ticks: mission.ticksRemaining });
    }
    const assignment = hero.assignedTo;
    if (!assignment) {
      return t('status.idle');
    }
    if (assignment.startsWith('diplomacy:')) {
      const land = this.state.lands.find((l) => l.id === assignment.slice('diplomacy:'.length));
      return t('status.assigned', { assignment: land?.name ?? t('action.affairs') });
    }
    const land = this.state.lands.find((l) => l.id === assignment);
    if (land) {
      return t('status.assigned', { assignment: land.name });
    }
    const army = this.state.armies.find((ar) => ar.id === assignment);
    if (army) {
      return t('status.assigned', { assignment: army.name });
    }
    return t('status.assigned', { assignment });
  }

  private showHeroMissionTargetPicker(heroId: string): void {
    const hero = this.state.heroes.find((h) => h.id === heroId);
    const content = this.modalContentBounds;
    this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y, t('hero.hub.chooseTarget', { hero: hero ? heroName(hero) : '' }), 'label', {
      fontSize: '15px',
      align: 'center',
      wordWrap: { width: 290 },
    }).setOrigin(0.5));

    const targets = heroMissionTargets(this.state);
    const listBounds = { x: content.x, y: content.y + 34, width: content.width, height: content.height - 94 };
    const scroll = this.ui.scrollArea(listBounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);
    const rows: Phaser.GameObjects.Container[] = [];
    targets.forEach((kingdom, index) => {
      const row = this.ui.card({ x: 0, y: index * 66, width: listBounds.width, height: 58 }, {
        title: kingdom.name,
        subtitle: t('hero.target.stats', { power: Math.round(kingdom.power ?? 0), stability: Math.round(kingdom.stability ?? 0) }),
        action: {
          label: t('hero.hub.strike'),
          variant: 'primary',
          onClick: () => {
            this.heroActionPicker = undefined;
            this.events.emit('ui:hero-mission', heroId, kingdom.id);
          },
        },
      });
      scroll.content.add(row);
      rows.push(row);
    });
    scroll.setContentHeight(targets.length * 66);
    if (this.modalJustOpened) {
      staggerIn(this, rows);
    }

    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2, this.modalFooterBounds.y + 20, 150, 40, t('action.cancel'), () => {
      this.heroActionPicker = undefined;
      this.refresh();
    }, { variant: 'dark' }));
  }

  private showCourtScreen(): void {
    const title = this.courtPicker?.kind === 'diplomacy' ? t('modal.diplomacy.title') : t('modal.court.title');
    const subtitle = this.courtPicker?.kind === 'diplomacy'
      ? t('modal.diplomacy.subtitle')
      : t('modal.court.subtitle');
    this.addModalBase(title, subtitle);
    const content = this.modalContentBounds;

    const courtPickerKey = this.courtPicker
      ? `${this.courtPicker.kind}:${this.courtPicker.kind === 'position' ? this.courtPicker.positionId : this.courtPicker.landId}`
      : 'none';
    const viewKey = `${this.courtTab}|${courtPickerKey}`;
    const animateRows = this.modalJustOpened || viewKey !== this.lastCourtView;
    this.lastCourtView = viewKey;

    if (this.courtPicker) {
      this.showCourtHeroPicker(this.courtPicker, animateRows);
      return;
    }

    const filledSeats = Object.values(this.state.court.seats).filter(Boolean).length;
    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y, width: content.width, height: 70 }, {
      title: t('court.officesFilled', { filled: filledSeats, total: this.state.court.unlockedSeats.length }),
      body: t('court.moreAssigned'),
      border: INK_UI.gold,
    }));

    const tabY = content.y + 92;
    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2 - 60, tabY, 110, 34, t('action.positions'), () => {
      this.courtTab = 'positions';
      this.refresh();
    }, { variant: this.courtTab === 'positions' ? 'highlight' : 'dark', fontSize: '12px' }));
    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2 + 60, tabY, 110, 34, t('action.governors'), () => {
      this.courtTab = 'governors';
      this.refresh();
    }, { variant: this.courtTab === 'governors' ? 'highlight' : 'dark', fontSize: '12px' }));

    const listBounds = { x: content.x, y: content.y + 120, width: content.width, height: content.height - 120 };
    if (this.courtTab === 'positions') {
      this.showCourtPositions(listBounds, animateRows);
    } else {
      this.showCourtGovernors(listBounds, animateRows);
    }
  }

  private showCourtPositions(bounds: UIBounds, animateRows: boolean): void {
    const scroll = this.ui.scrollArea(bounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);
    const rows: Phaser.GameObjects.Container[] = [];
    let rowY = 0;
    ALL_COURT_POSITIONS.forEach((positionId) => {
      const unlocked = this.state.court.unlockedSeats.includes(positionId);
      const heroId = this.state.court.seats[positionId];
      const hero = heroId ? this.state.heroes.find((candidate) => candidate.id === heroId) : undefined;
      const status = !unlocked ? t('status.lockedPublic') : hero ? heroName(hero) : t('status.vacant');
      // A seated hero shows the concrete bonus they're providing right now.
      const effect = hero ? (formatCourtPositionEffect(positionId, hero.stats) || t('court.fx.none')) : undefined;
      const row = this.ui.card({ x: 0, y: rowY, width: bounds.width, height: 54 }, {
        title: getCourtPositionLabel(positionId),
        subtitle: status,
        body: effect,
        muted: !unlocked,
        border: unlocked ? INK_UI.gold : INK_UI.softBrush,
        action: hero
          ? {
              label: t('action.remove'),
              onClick: () => {
                removeHeroFromPosition(this.state, positionId);
                this.refresh();
              },
              variant: 'danger',
            }
          : {
              label: unlocked ? t('action.assign') : t('action.locked'),
              onClick: () => {
                if (!unlocked) {
                  return;
                }
                this.courtPicker = { kind: 'position', positionId };
                this.refresh();
              },
              variant: unlocked ? 'primary' : 'disabled',
              disabled: !unlocked,
            },
      });
      scroll.content.add(row);
      rows.push(row);
      rowY += (row.getData('cardHeight') as number ?? 54) + 8;
    });
    scroll.setContentHeight(Math.max(0, rowY - 8));

    if (animateRows) {
      staggerIn(this, rows);
    }
  }

  private showCourtGovernors(bounds: UIBounds, animateRows: boolean): void {
    const lands = this.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).slice(0, 7);

    if (lands.length === 0) {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, bounds.y + 48, t('status.noDistricts'), 'label', {
        fontSize: '14px',
        align: 'center',
        wordWrap: { width: 290 },
      }).setOrigin(0.5));
      return;
    }

    const scroll = this.ui.scrollArea(bounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);
    const rows: Phaser.GameObjects.Container[] = [];
    let rowY = 0;
    lands.forEach((land) => {
      const governor = this.state.heroes.find((candidate) => candidate.assignedTo === land.id);
      const row = this.ui.card({ x: 0, y: rowY, width: bounds.width, height: 54 }, {
        title: land.name,
        subtitle: governor ? t('status.governor', { name: heroName(governor) }) : t('status.noGovernor'),
        body: governor ? formatGovernorEffect(this.state, governor.stats, land) : undefined,
        action: {
          label: governor ? t('action.change') : t('action.assign'),
          variant: governor ? 'secondary' : 'primary',
          onClick: () => {
          this.courtPicker = { kind: 'land', landId: land.id };
          this.refresh();
          },
        },
      });
      scroll.content.add(row);
      rows.push(row);
      rowY += (row.getData('cardHeight') as number ?? 54) + 8;
    });
    scroll.setContentHeight(Math.max(0, rowY - 8));

    if (animateRows) {
      staggerIn(this, rows);
    }
  }

  private showCourtHeroPicker(picker: CourtPicker, animateRows: boolean): void {
    const content = this.modalContentBounds;
    this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y, t('status.chooseHero'), 'label', { fontSize: '16px' }).setOrigin(0.5));

    const heroes = picker.kind === 'diplomacy'
      ? this.state.heroes
        .filter((hero) => !hero.assignedTo)
        .sort((a, b) => b.stats.administration - a.stats.administration)
      : this.state.heroes;

    if (heroes.length === 0) {
      const message = picker.kind === 'diplomacy'
        ? t('court.diplomacyNeedsHero')
        : t('court.noRecruitedHeroes');
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 90, message, 'label', {
        fontSize: '14px',
        align: 'center',
        wordWrap: { width: 290 },
      }).setOrigin(0.5));
    }

    const listBounds = { x: content.x, y: content.y + 32, width: content.width, height: content.height - 92 };
    const scroll = this.ui.scrollArea(listBounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);
    const rows: Phaser.GameObjects.Container[] = [];
    heroes.slice(0, 8).forEach((hero, index) => {
      const y = index * 66;
      const row = this.ui.card({ x: 0, y, width: listBounds.width, height: 58 }, {
        action: {
          label: t('action.select'),
          variant: 'primary',
          onClick: () => {
            if (picker.kind === 'position') {
              assignHeroToPosition(this.state, hero.id, picker.positionId);
            } else if (picker.kind === 'land') {
              assignHeroToLand(this.state, hero.id, picker.landId);
            } else {
              this.courtPicker = undefined;
              this.closeModal();
              this.events.emit('ui:land-action', 'diplomatize', picker.landId, hero.id);
              return;
            }
            this.courtPicker = undefined;
            this.refresh();
          },
        },
      });
      row.add(renderHeroFace(this, hero, 29, 29, 0.34));
      row.add(createLabel(this, 58, 10, heroName(hero), 'label', { fontSize: '13px', wordWrap: { width: 176 } }).setMaxLines(1));
      // Show what this hero would actually do in the seat — so each choice is informed.
      const effectLine = picker.kind === 'position'
        ? (formatCourtPositionEffect(picker.positionId, hero.stats) || t('court.fx.none'))
        : picker.kind === 'land'
          ? formatGovernorEffect(this.state, hero.stats, this.state.lands.find((l) => l.id === picker.landId))
          : t('status.administration', { value: hero.stats.administration });
      row.add(createLabel(this, 58, 32, effectLine, 'caption', {
        fontSize: '10px',
        color: '#4c6b46',
        wordWrap: { width: 182 },
      }).setMaxLines(1));
      scroll.content.add(row);
      rows.push(row);
    });
    scroll.setContentHeight(heroes.slice(0, 8).length * 66);

    if (animateRows) {
      staggerIn(this, rows);
    }

    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2, this.modalFooterBounds.y + 20, 150, 40, t('action.cancel'), () => {
      this.courtPicker = undefined;
      this.refresh();
    }, { variant: 'dark' }));
  }

  private showArmyScreen(): void {
    this.addModalBase(t('modal.army.title'), t('modal.army.subtitle'));
    const content = this.modalContentBounds;
    const leaders = this.state.heroes.filter((hero) => !hero.assignedTo);
    const selectedArmy = this.state.armies.find((army) => army.id === this.state.selectedArmyId && army.kingdomId === PLAYER_KINGDOM_ID)
      ?? this.state.armies.find((army) => army.kingdomId === PLAYER_KINGDOM_ID);
    const armyBlockHeight = selectedArmy ? 152 : 0;
    const maxSoldiers = Math.max(100, this.state.resources.humans);
    this.armySoldiers = Phaser.Math.Clamp(this.armySoldiers, 100, maxSoldiers);
    this.armyFood = Phaser.Math.Clamp(this.armyFood, 0, Math.max(0, this.state.resources.food));
    this.armySupplies = Phaser.Math.Clamp(this.armySupplies, 0, Math.max(0, this.state.resources.supplies));

    if (selectedArmy) {
      const total = selectedArmy.units.spearmen + selectedArmy.units.archers + selectedArmy.units.heavyInfantry;
      const wage = getArmyGoldUpkeep(selectedArmy);
      const unpaid = selectedArmy.unpaidTicks ?? 0;
      const payrollLine = unpaid > 0
        ? t('status.armyWageUnpaid', { wage, ticks: unpaid })
        : t('status.armyWage', { wage });
      this.modalLayer.add(this.ui.card({ x: content.x, y: content.y, width: content.width, height: 114 }, {
        title: `${selectedArmy.name} - ${t('building.level', { level: selectedArmy.level })}`,
        subtitle: `${total} ${t('status.soldiers').toLowerCase()}, XP ${selectedArmy.experience}/${selectedArmy.experienceToNextLevel}`,
        body: `${t('status.moraleSupply', { morale: Math.round(selectedArmy.morale), supply: Math.round(selectedArmy.supply) })}\n${payrollLine}\n${t('status.disbandInfo')}`,
        border: INK_UI.gold,
        action: {
          label: t('action.disband'),
          variant: 'danger',
          onClick: () => {
            this.events.emit('ui:disband-army', selectedArmy.id);
            this.closeModal();
          },
        },
      }));
      // Auto-command toggle: hand the general full permission to intercept invasions.
      const auto = selectedArmy.autoDefend ?? false;
      this.modalLayer.add(this.ui.button({ x: content.x, y: content.y + 120, width: content.width, height: 28 },
        auto ? t('army.autoOn') : t('army.autoOff'), () => {
          selectedArmy.autoDefend = !auto;
          this.state.message = auto ? t('army.autoOffMsg', { army: selectedArmy.name }) : t('army.autoOnMsg', { army: selectedArmy.name });
          this.refresh();
        }, { variant: auto ? 'primary' : 'secondary', fontSize: '11px' }));
    }

    if (leaders.length === 0) {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + armyBlockHeight + 70, t('status.allCommandersBusy'), 'label', {
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 292 },
      }).setOrigin(0.5));
      return;
    }

    const visibleLeaders = leaders.slice(0, 3);
    const leaderWidth = visibleLeaders.length === 1 ? 128 : 100;
    const leaderGap = 8;
    const leaderTotalWidth = visibleLeaders.length * leaderWidth + (visibleLeaders.length - 1) * leaderGap;
    visibleLeaders.forEach((hero, index) => {
      const x = content.x + (content.width - leaderTotalWidth) / 2 + index * (leaderWidth + leaderGap);
      const selected = hero.id === this.selectedArmyLeaderId;
      const card = this.ui.card({ x, y: content.y + armyBlockHeight, width: leaderWidth, height: 126 }, {
        border: selected ? INK_UI.gold : INK_UI.softBrush,
      });
      const hit = this.add.rectangle(x, content.y + armyBlockHeight, leaderWidth, 126, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.selectedArmyLeaderId = hero.id;
        this.refresh();
      });
      const portrait = renderHeroFace(this, hero, x + leaderWidth / 2, content.y + armyBlockHeight + 43, 0.5);
      const name = createLabel(this, x + leaderWidth / 2, content.y + armyBlockHeight + 94, heroName(hero), 'label', {
        fontSize: '10px',
        align: 'center',
        wordWrap: { width: leaderWidth - 16 },
      }).setOrigin(0.5);
      this.modalLayer.add([card, portrait, name, hit]);
    });

    this.addStepperCard(content.y + armyBlockHeight + 140, t('status.soldiers'), `${this.armySoldiers}`, t('status.availableHumans', { value: this.state.resources.humans }), '-100', '+100', () => {
      this.armySoldiers = Math.max(100, this.armySoldiers - 100);
      this.refresh();
    }, () => {
      this.armySoldiers = Math.min(maxSoldiers, this.armySoldiers + 100);
      this.refresh();
    });
    this.addStepperCard(content.y + armyBlockHeight + 244, t('status.foodToSend'), `${this.armyFood}`, t('status.availableFood', { value: this.state.resources.food }), `-${ARMY_LOGISTICS_STEP}`, `+${ARMY_LOGISTICS_STEP}`, () => {
      this.armyFood = Math.max(0, this.armyFood - ARMY_LOGISTICS_STEP);
      this.refresh();
    }, () => {
      this.armyFood = Math.min(this.state.resources.food, this.armyFood + ARMY_LOGISTICS_STEP);
      this.refresh();
    });
    this.addStepperCard(content.y + armyBlockHeight + 348, t('status.suppliesToSend'), `${this.armySupplies}`, t('status.availableSupplies', { value: this.state.resources.supplies }), `-${ARMY_LOGISTICS_STEP}`, `+${ARMY_LOGISTICS_STEP}`, () => {
      this.armySupplies = Math.max(0, this.armySupplies - ARMY_LOGISTICS_STEP);
      this.refresh();
    }, () => {
      this.armySupplies = Math.min(this.state.resources.supplies, this.armySupplies + ARMY_LOGISTICS_STEP);
      this.refresh();
    });

    // Composition doctrine — shapes the unit mix for the unit-counter system.
    const comps: Array<{ id: 'balanced' | 'spears' | 'archers' | 'shock'; label: string }> = [
      { id: 'balanced', label: t('comp.balanced') },
      { id: 'spears', label: t('comp.spears') },
      { id: 'archers', label: t('comp.archers') },
      { id: 'shock', label: t('comp.shock') },
    ];
    const compY = this.modalFooterBounds.y - 34;
    const cW = (GAME_WIDTH - 48) / comps.length;
    this.modalLayer.add(createLabel(this, 24, compY - 16, t('comp.title'), 'caption', { fontSize: '10px', color: '#6f6250' }));
    comps.forEach((c, i) => {
      const selected = this.armyComposition === c.id;
      this.modalLayer.add(this.ui.button({ x: 24 + i * cW, y: compY, width: cW - 4, height: 28 }, c.label, () => {
        this.armyComposition = c.id;
        this.refresh();
      }, { variant: selected ? 'primary' : 'secondary', fontSize: '10px' }));
    });

    this.modalLayer.add(
      createWoodButton(this, GAME_WIDTH / 2, this.modalFooterBounds.y + 22, 196, 44, t('action.createArmy'), () => {
        if (!this.selectedArmyLeaderId) {
          this.state.message = t('msg.chooseCommander');
          this.refresh();
          return;
        }
        this.events.emit('ui:create-army', this.selectedArmyLeaderId, this.armySoldiers, this.armyFood, this.armySupplies, this.armyComposition);
        this.closeModal();
      }, { variant: 'highlight' }),
    );
  }

  private addStepperCard(
    y: number,
    title: string,
    value: string,
    caption: string,
    minusLabel: string,
    plusLabel: string,
    onMinus: () => void,
    onPlus: () => void,
  ): void {
    const content = this.modalContentBounds;
    const cardHeight = 96;
    this.modalLayer.add(this.ui.card({ x: content.x, y, width: content.width, height: cardHeight }));
    this.modalLayer.add(createLabel(this, content.x + 12, y + 10, title, 'label', {
      fontSize: '15px',
      wordWrap: { width: 190 },
    }));
    this.modalLayer.add(createLabel(this, content.x + content.width - 12, y + 12, availabilityLabel(caption), 'caption', {
      fontSize: '10px',
      align: 'right',
      wordWrap: { width: 124 },
    }).setOrigin(1, 0));
    this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, y + 53, value, 'label', { fontSize: '28px' }).setOrigin(0.5));
    this.modalLayer.add(this.ui.button({ x: content.x + 12, y: y + 54, width: 78, height: 34 }, minusLabel, onMinus, {
      variant: 'secondary',
      fontSize: '12px',
    }));
    this.modalLayer.add(this.ui.button({ x: content.x + content.width - 90, y: y + 54, width: 78, height: 34 }, plusLabel, onPlus, {
      variant: 'primary',
      fontSize: '12px',
    }));
  }

  private showBuildScreen(): void {
    const land = this.getBuildLand();
    this.addModalBase(t('modal.build.title'), land ? land.name : t('modal.build.noSelection'));
    const content = this.modalContentBounds;

    if (!land || land.ownerId !== 'dai-viet') {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 90, t('modal.build.selectOwned'), 'label', {
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 280 },
      }).setOrigin(0.5));
      return;
    }

    const terrain = formatTerrain(land);
    const labor = getLaborStatus(this.state);
    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y, width: content.width, height: 124 }, {
      title: t('status.capacity', { used: land.buildings.length, max: land.buildingCapacity }),
      rows: [
        { label: t('status.terrain'), value: terrain },
        { label: t('status.labor'), value: t('status.laborValue', { workers: labor.required, efficiency: Math.round(labor.efficiency * 100) }) },
      ],
    }));

    const upgradeOptions = getUpgradeOptions(this.state, land);
    const options = getBuildOptions(this.state, land);
    const listBounds = { x: content.x, y: content.y + 136, width: content.width, height: content.height - 136 };
    const scroll = this.ui.scrollArea(listBounds);
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);
    const buildRows: Phaser.GameObjects.Container[] = [];

    // Cards auto-grow to fit their (variable-length) text, so lay them out with a
    // running cursor and a fixed gap rather than a fixed stride — no overlap, no clip.
    const rowGap = 10;
    let rowY = 0;
    const addRow = (cardOpts: InkCardOptions, minHeight: number): void => {
      // The card grows to fit its measured text; read back its actual height to stride.
      const row = this.ui.card({ x: 0, y: rowY, width: listBounds.width, height: minHeight }, cardOpts);
      scroll.content.add(row);
      buildRows.push(row);
      rowY += (row.getData('cardHeight') as number ?? minHeight) + rowGap;
    };

    // Province focus — one row per option, each priced against this province's own ground.
    //
    // This used to be a single card whose button cycled to the next focus. You could not see what
    // the alternatives were, let alone which of them the land suited, so the "decision" was a
    // six-state toggle pressed blind. Now every focus states its tilt and its aptitude here, and
    // the one the terrain favours is marked — which is the whole point of `getLandAptitude`.
    this.renderFocusRows(land, addRow);

    upgradeOptions.forEach((option) => {
      const cost = formatCost(option.cost);
      const label = `${buildingLabel(option.type)} - ${t('building.level', { level: `${option.level}/${option.maxLevel}` })}`;
      const atMax = option.level >= option.maxLevel;
      const costLine = atMax ? t('status.maximumLevel') : `${t('status.upgradeCost', { cost })} · ${option.ticks} ${tickLabel(option.ticks)}`;
      const detail = !atMax && !option.canUpgrade ? option.reason ?? t('status.unavailable') : '';
      addRow({
        title: label,
        subtitle: costLine,
        body: detail || formatBuildDetails(option),
        border: option.canUpgrade ? INK_UI.gold : INK_UI.softBrush,
        muted: !option.canUpgrade && !atMax,
        actionPlacement: 'right',
        action: {
          label: atMax ? t('building.max') : option.canUpgrade ? t('action.upgrade') : t('action.why'),
          variant: option.canUpgrade ? 'primary' : atMax ? 'disabled' : 'secondary',
          disabled: atMax,
          onClick: () => {
          if (option.canUpgrade) {
            this.events.emit('ui:land-action', `upgrade:${option.index}`, land.id);
          } else if (!atMax) {
            this.state.message = option.reason ?? t('msg.cannotUpgrade');
          }
          this.refresh();
          },
        },
      }, 116);
    });

    land.buildings.forEach((building, index) => {
      const label = `${buildingLabel(building.type)} - ${t('building.level', { level: building.level })}`;
      addRow({
        title: `${t('action.destroy')} ${label}`,
        body: t('status.noRefund'),
        border: INK_UI.cinnabar,
        actionPlacement: 'right',
        action: {
          label: t('action.destroy'),
          variant: 'danger',
          onClick: () => {
            this.events.emit('ui:land-action', `destroy:${index}`, land.id);
            this.refresh();
          },
        },
      }, 64);
    });

    options.forEach((option) => {
      const cost = formatCost(option.cost);
      const detail = option.canBuild ? `${buildDescription(option.type, land)}\n${formatBuildDetails(option)}` : option.reason ?? t('status.unavailable');
      addRow({
        title: buildingLabel(option.type),
        subtitle: `${t('status.cost', { cost })} · ${option.ticks} ${tickLabel(option.ticks)}`,
        body: detail,
        border: option.canBuild ? INK_UI.gold : INK_UI.softBrush,
        muted: !option.canBuild,
        actionPlacement: 'right',
        action: {
          label: option.canBuild ? t('action.build') : t('action.why'),
          variant: option.canBuild ? 'primary' : 'secondary',
          onClick: () => {
          if (option.canBuild) {
            this.events.emit('ui:land-action', `build:${option.type}`, land.id);
          } else {
            this.state.message = option.reason ?? t('msg.structureUnavailable');
          }
          this.refresh();
          },
        },
      }, 116);
    });

    scroll.setContentHeight(Math.max(0, rowY - rowGap));

    if (this.modalJustOpened) {
      staggerIn(this, buildRows);
    }
  }

  /**
   * The province-focus list: one row per focus, priced against this land's own ground.
   *
   * The copy and the aptitude reading live in `ui/focusPanel.ts` because Dragon Ascent shows the
   * same list from a different scene; only the card drawing is here.
   */
  private renderFocusRows(land: Land, addRow: (opts: InkCardOptions, minHeight: number) => void): void {
    addRow({
      title: t('focus.heading'),
      subtitle: t('focus.headingHint'),
      border: INK_UI.softBrush,
      muted: true,
    }, 52);

    for (const row of buildFocusRows(this.state, land)) {
      const suitTone = row.suitability === 'high'
        ? INK_UI.jade
        : row.suitability === 'low' ? INK_UI.softBrush : INK_UI.gold;
      addRow({
        // The recommendation is stated on the row itself, so the list can stay in a fixed order
        // and still tell the player where to look.
        title: row.isBest ? `${row.title}  ·  ${t('focus.best')}` : row.title,
        subtitle: row.effect,
        body: row.suitLine,
        border: row.isCurrent ? INK_UI.gold : suitTone,
        muted: row.suitability === 'low' && !row.isCurrent,
        actionPlacement: 'right',
        action: {
          label: row.isCurrent ? t('focus.current') : t('focus.set'),
          variant: row.isCurrent ? 'disabled' : 'secondary',
          onClick: () => {
            if (row.isCurrent) return;
            this.events.emit('ui:land-action', `specialize:${row.focus}`, land.id);
            this.refresh();
          },
        },
      }, 84);
    }
  }

  private showBattleResultScreen(): void {
    const result = this.state.latestBattleResult;
    if (!result) {
      this.closeModal();
      return;
    }

    const land = this.state.lands.find((candidate) => candidate.id === result.targetLandId);
    const army = this.state.armies.find((candidate) => candidate.id === result.attackerArmyId);
    const armyName = army?.name ?? t('battle.yourArmy');
    const landName = land?.name ?? t('battle.theDistrict');

    this.addModalBase(result.victory ? t('battle.victory') : t('battle.defeat'), landName);
    const content = this.modalContentBounds;

    const bodyText = result.victory
      ? t('battle.victoryBody', { army: armyName, land: landName, attackerPower: result.attackerPower, defenderPower: result.defenderPower, ticks: result.siegeTicks ?? 0, tickLabel: tickLabel(result.siegeTicks ?? 0) })
      : t('battle.defeatBody', { army: armyName, land: landName, attackerPower: result.attackerPower, defenderPower: result.defenderPower });

    this.modalLayer.add(
      this.ui.card({ x: content.x, y: content.y + 54, width: content.width, height: 260 }, {
        title: result.victory ? t('battle.prevailed', { army: armyName }) : t('battle.repelled', { army: armyName }),
        body: bodyText,
        border: result.victory ? INK_UI.gold : INK_UI.cinnabar,
      }),
    );

    if (result.generalFate && result.generalName) {
      const fateText = result.generalFate === 'slain'
        ? t('battle.generalSlain', { hero: result.generalName })
        : t('battle.generalWounded', { hero: result.generalName });
      this.modalLayer.add(this.ui.card({ x: content.x, y: content.y + 324, width: content.width, height: 66 }, {
        body: fateText,
        border: result.generalFate === 'slain' ? INK_UI.cinnabar : INK_UI.gold,
      }));
    }

    if (result.victory) {
      this.modalLayer.add(
        createWoodButton(this, GAME_WIDTH / 2 - 85, this.modalFooterBounds.y + 22, 150, 40, t('action.retreat'), () => {
          this.events.emit('ui:retreat-siege', result.attackerArmyId, result.targetLandId);
          this.closeModal();
        }, { variant: 'dark' }),
      );
      this.modalLayer.add(
        createWoodButton(this, GAME_WIDTH / 2 + 85, this.modalFooterBounds.y + 22, 150, 40, t('menu.continue'), () => this.closeModal(), {
          variant: 'highlight',
        }),
      );
    } else {
      this.modalLayer.add(
        createWoodButton(this, GAME_WIDTH / 2, this.modalFooterBounds.y + 22, 150, 40, t('menu.continue'), () => this.closeModal(), {
          variant: 'highlight',
        }),
      );
    }
  }

  private showPoliticsScreen(card: PoliticsCard): void {
    this.addModalBase(t('modal.request.title'), t('modal.request.subtitle'));
    const content = this.modalContentBounds;
    const eventCard = this.ui.card({ x: content.x, y: content.y + 8, width: content.width, height: 272 }, {
      title: politicsTitle(card),
      body: politicsDescription(card),
      border: INK_UI.cinnabar,
      status: politicsTypeLabel(card.type),
    });
    this.modalLayer.add([
      eventCard,
    ]);

    card.choices.forEach((choice, index) => {
      const y = content.y + 300 + index * 92;
      this.modalLayer.add(this.ui.card({ x: content.x, y, width: content.width, height: 76 }, {
        title: politicsChoiceLabel(choice),
        subtitle: politicsChoiceDescription(choice),
        action: {
          label: t('action.choose'),
          variant: index === 0 ? 'danger' : 'primary',
          onClick: () => {
            this.events.emit('ui:politics-choice', choice.id);
            // choosePoliticsCard is synchronous — state.message now has the result
            this.politicsResultMessage = this.state.message;
            this.modalScreen = 'politics-result';
            this.modalJustOpened = true;
            this.refresh();
          },
        },
      }));
    });
  }

  private showPoliticsResultScreen(): void {
    this.addModalBase(t('modal.request.result'), t('modal.request.resultSubtitle'));
    const content = this.modalContentBounds;

    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y + 20, width: content.width, height: 220 }, {
      title: t('modal.request.decisionMade'),
      body: this.politicsResultMessage,
      border: INK_UI.jade,
    }));

    this.modalLayer.add(createWoodButton(this, GAME_WIDTH / 2, this.modalFooterBounds.y + 22, 180, 44, t('menu.continue'), () => {
      this.closeModal();
    }, { variant: 'highlight' }));
  }

  private showGameMenuScreen(): void {
    this.addModalBase(t('modal.gameMenu.title'), t('modal.gameMenu.subtitle'));
    const content = this.modalContentBounds;

    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y + 28, width: content.width, height: 118 }, {
      title: t('status.currentCampaign'),
      body: `${t('time.yearSeasonComma', { year: this.state.year, season: seasonLabel(this.state.season) })}\n${t('status.districtsUnderRule', { count: this.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length })}`,
      border: INK_UI.gold,
    }));

    this.modalLayer.add(this.ui.button({ x: 58, y: 332, width: 274, height: 46 }, t('menu.continue'), () => {
      this.closeModal();
      this.refresh();
    }, { variant: 'primary', fontSize: '14px' }));
    this.modalLayer.add(this.ui.button({ x: 58, y: 402, width: 274, height: 46 }, t('action.saveSnapshot'), () => {
      this.events.emit('ui:save-snapshot');
      this.closeModal();
    }, { variant: 'secondary', fontSize: '14px' }));
    this.modalLayer.add(this.ui.button({ x: 58, y: 472, width: 274, height: 46 }, t('action.exitToMenu'), () => {
      this.modalScreen = 'exit-menu';
      this.modalJustOpened = true;
      this.refresh();
    }, { variant: 'danger', fontSize: '14px' }));
  }

  private showExitMenuScreen(): void {
    this.addModalBase(t('modal.exitMenu.title'), t('modal.exitMenu.subtitle'));
    const content = this.modalContentBounds;

    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y + 28, width: content.width, height: 118 }, {
      title: t('status.unsavedProgress'),
      body: t('status.exitMenuBody'),
      border: INK_UI.cinnabar,
    }));

    this.modalLayer.add(this.ui.button({ x: 58, y: 332, width: 274, height: 46 }, t('action.saveAndExit'), () => {
      this.events.emit('ui:exit-to-menu', true);
    }, { variant: 'primary', fontSize: '14px' }));
    this.modalLayer.add(this.ui.button({ x: 58, y: 402, width: 274, height: 46 }, t('action.exitWithoutSaving'), () => {
      this.events.emit('ui:exit-to-menu', false);
    }, { variant: 'danger', fontSize: '14px' }));
    this.modalLayer.add(this.ui.button({ x: 58, y: 472, width: 274, height: 46 }, t('action.cancel'), () => {
      this.modalScreen = 'game-menu';
      this.modalJustOpened = true;
      this.refresh();
    }, { variant: 'secondary', fontSize: '14px' }));
  }

  private drawHeroCard(
    hero: Hero,
    x: number,
    y: number,
    scale: number,
    rotation: number,
    active: boolean,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(x, y).setScale(scale).setRotation(rotation);
    const bg = createPanel(this, -152, -250, 304, 500, {
      fillAlpha: active ? 1 : 0.9,
      border: active ? 0xffde72 : PARCHMENT.border,
      borderWidth: 4,
      radius: 12,
    });
    const dark = this.add.rectangle(0, -112, 250, 226, 0x1b0904, 1);
    dark.setStrokeStyle(3, 0x5b3b22, 0.95);
    const portrait = renderHeroFace(this, hero, 0, -110, 1.16);
    const name = createLabel(this, 0, 34, heroName(hero), 'label', {
      fontSize: '22px',
      align: 'center',
      wordWrap: { width: 250 },
    }).setOrigin(0.5);
    const type = createLabel(this, 0, 72, `${rarityLabel(hero.rarity)} ${heroTypeLabel(hero.type)}`, 'caption', { fontSize: '14px', fontStyle: '700' }).setOrigin(0.5);
    const effect = createLabel(this, 0, 112, heroEffect(hero), 'body', {
      fontSize: '14px',
      align: 'center',
      wordWrap: { width: 244 },
    }).setOrigin(0.5, 0);
    const upkeep = createLabel(this, 112, 214, `${hero.upkeepGold}g`, 'label', { fontSize: '18px' }).setOrigin(1, 0.5);
    card.add([bg, dark, portrait, name, type, effect, upkeep]);
    return card;
  }

  private renderCourtRequestBadge(card: PoliticsCard): void {
    const badgeX = GAME_WIDTH - 86;
    const badgeY = HEADER_HEIGHT + 10;
    const badge = this.add
      .rectangle(badgeX, badgeY, 72, 30, INK_UI.parchment, 0.96)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(430);
    badge.setStrokeStyle(2, INK_UI.cinnabar, 0.9);
    const dot = this.add.circle(badgeX + 11, badgeY + 15, 4, INK_UI.cinnabar, 1).setDepth(431);
    const text = this.add.text(badgeX + 20, badgeY + 8, t('action.court'), {
      color: '#211103',
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: '700',
    }).setDepth(431);
    badge.on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.openModal('request');
    });
    this.requestBadge = [badge, dot, text];
    void card;
  }

  private clearRequestBadge(): void {
    for (const item of this.requestBadge) {
      item.destroy();
    }
    this.requestBadge = [];
  }

  private renderMapControls(): void {
    const bottomAnchor = this.state.latestBattlePreview ? SHEET_TOP - 10
      : this.state.selectedLandId ? COMPACT_CARD_Y - 10
      : GAME_HEIGHT - 54;
    const x = GAME_WIDTH - 24;

    const rows: Array<[number, 'zoom-in' | 'zoom-out' | 'mode', string]> = [
      [104, 'zoom-in', 'zoom-in'],
      [62, 'zoom-out', 'zoom-out'],
      [20, 'mode', 'toggle-render-mode'],
    ];

    // Published, not guessed at from the other side.
    //
    // `MapScene.isScreenPointOverFixedUi` used to guard this stack with two fixed bands measured
    // off the foot of the screen, and the stack does not stay in one place: it sits above the
    // inspect card when a province is selected and above the battle sheet when a preview is up,
    // three anchors in all. The bands covered eight of the nine resulting positions. The ninth —
    // zoom-in with a battle preview open — fell between them, so the canvas-level tap handler
    // claimed the press, selected the province underneath, and the re-render destroyed the button
    // before Phaser could deliver the release. Visible, pressable, inert.
    //
    // ConquestUIScene already solved this by publishing the rectangles it actually drew; this is
    // the same contract for the classic modes, and it cannot drift because nothing is duplicated.
    window.__hudTapBounds = [];
    this.mapControls = rows.map(([lift, icon, action]) => {
      const y = bottomAnchor - lift;
      window.__hudTapBounds!.push({ x: x - 22, y: y - 22, width: 44, height: 44 });
      return this.createMapIconButton(x, y, icon, () => this.handleAction(action));
    });
  }

  private createMapIconButton(
    x: number,
    y: number,
    icon: 'zoom-in' | 'zoom-out' | 'mode',
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(430);
    const g = this.add.graphics();
    g.fillStyle(INK_UI.parchment, 0.96);
    g.fillRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(3, INK_UI.softBrush, 0.25);
    g.strokeRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(2, INK_UI.brush, 0.9);
    g.strokeRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(3, INK_UI.brush, 0.9);

    if (icon === 'zoom-in' || icon === 'zoom-out') {
      g.lineBetween(-8, 0, 8, 0);
      if (icon === 'zoom-in') {
        g.lineBetween(0, -8, 0, 8);
      }
    } else if (this.state.mapRenderMode === 'terrain') {
      g.fillStyle(INK_UI.softBrush, 0.95);
      g.fillTriangle(-10, 8, 0, -9, 10, 8);
      g.fillStyle(0x5bb6d6, 0.9);
      g.fillRect(-10, 9, 20, 3);
    } else {
      g.fillStyle(INK_UI.jade, 0.95);
      g.fillRect(-10, -9, 9, 18);
      g.fillStyle(INK_UI.cinnabar, 0.95);
      g.fillRect(1, -9, 9, 18);
      g.lineStyle(2, INK_UI.brush, 0.82);
      g.strokeRect(-10, -9, 20, 18);
    }

    const hit = this.add.rectangle(0, 0, 42, 42, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    );
    hit.on(
      'pointerup',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        onClick();
      },
    );
    container.add([g, hit]);
    return container;
  }

  private clearMapControls(): void {
    for (const item of this.mapControls) {
      item.destroy();
    }
    this.mapControls = [];
    // Bounds go with the buttons. Left standing, they would guard a strip of empty map.
    window.__hudTapBounds = [];
  }

  private renderGameMenuButton(): void {
    const hit = this.add.rectangle(GAME_WIDTH - 34, 13, 60, 26, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .setDepth(430);
    hit.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    );
    hit.on(
      'pointerup',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.openModal('game-menu');
      },
    );
    const text = this.ui.label(GAME_WIDTH - 12, 5, t('action.menu'), 'button', {
      color: '#2a2118',
      fontSize: '12px',
      align: 'right',
    }).setOrigin(1, 0).setDepth(431);
    this.gameMenuButton = [hit, text];
  }

  private clearGameMenuButton(): void {
    for (const item of this.gameMenuButton) {
      item.destroy();
    }
    this.gameMenuButton = [];
  }

  /**
   * The Chronicle bell at the right edge of the message strip — the single entry point
   * to the unified notification log. Shows an unread badge so new happenings (empire
   * toasts, campaign events, spy reports) are noticed even after the transient feed fades.
   */
  private renderNotifBell(): void {
    const log = this.state.eventLog ?? [];
    const unread = log.reduce((n, e) => (e.read ? n : n + 1), 0);
    const active = unread > 0;

    const pillW = 90;
    const pillH = 26;
    const pillX = GAME_WIDTH - pillW - 8;
    const pillY = HEADER_HEIGHT + (MESSAGE_STRIP_HEIGHT - pillH) / 2;
    const accent = active ? INK_UI.gold : INK_UI.brush;

    const g = this.add.graphics().setDepth(120);
    g.fillStyle(INK_UI.backgroundInk, active ? 0.9 : 0.6);
    g.fillRoundedRect(pillX, pillY, pillW, pillH, 6);
    g.lineStyle(active ? 1.5 : 1, accent, active ? 0.95 : 0.55);
    g.strokeRoundedRect(pillX, pillY, pillW, pillH, 6);

    const label = this.ui.label(pillX + pillW / 2, pillY + pillH / 2, t('action.log'), 'button', {
      // On paper the inactive state is quiet ink, not a pale gold that disappears into the sheet.
      color: active ? '#2a2118' : '#6f6250',
      fontSize: '12px',
      align: 'center',
    }).setOrigin(0.5).setDepth(121);

    const hit = this.add.rectangle(pillX + pillW / 2, pillY + pillH / 2, pillW, pillH, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .setDepth(122);
    hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
    hit.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.openModal('event-log');
    });

    this.notifBell.push(g, label, hit);

    if (active) {
      const badgeX = pillX + pillW - 3;
      const badgeY = pillY - 1;
      const badge = this.add.graphics().setDepth(123);
      badge.fillStyle(INK_UI.cinnabar, 0.98);
      badge.fillCircle(badgeX, badgeY, 9);
      badge.lineStyle(1, INK_UI.backgroundInk, 0.9);
      badge.strokeCircle(badgeX, badgeY, 9);
      const count = this.ui.label(badgeX, badgeY, unread > 9 ? '9+' : String(unread), 'button', {
        color: '#2a2118',
        fontSize: '9px',
        align: 'center',
      }).setOrigin(0.5).setDepth(124);
      this.notifBell.push(badge, count);
    }
  }

  private clearNotifBell(): void {
    for (const item of this.notifBell) {
      item.destroy();
    }
    this.notifBell = [];
  }

  private renderMinimap(): void {
    // Hide when land/preview is selected — compact card fills the bottom area
    if (this.state.selectedLandId || this.state.latestBattlePreview) return;

    const TOGGLE_SIZE = 28;
    const barTop = GAME_HEIGHT - ACTION_BAR_HEIGHT;
    const toggleCX = 6 + TOGGLE_SIZE / 2;
    const toggleCY = barTop - 6 - TOGGLE_SIZE / 2;
    const toggleHitSize = TOGGLE_SIZE + 4;

    window.__minimapInputBounds = [{
      x: toggleCX - toggleHitSize / 2,
      y: toggleCY - toggleHitSize / 2,
      width: toggleHitSize,
      height: toggleHitSize,
    }];

    // Toggle button
    const g = this.add.graphics().setDepth(430);
    g.fillStyle(INK_UI.backgroundInk, 0.92);
    g.fillRoundedRect(toggleCX - TOGGLE_SIZE / 2, toggleCY - TOGGLE_SIZE / 2, TOGGLE_SIZE, TOGGLE_SIZE, 6);
    g.lineStyle(1.5, this.minimapOpen ? INK_UI.gold : INK_UI.softBrush, this.minimapOpen ? 0.9 : 0.5);
    g.strokeRoundedRect(toggleCX - TOGGLE_SIZE / 2, toggleCY - TOGGLE_SIZE / 2, TOGGLE_SIZE, TOGGLE_SIZE, 6);
    // map icon — 3×3 grid of small squares
    const iconColor = this.minimapOpen ? INK_UI.gold : 0x9a8c6a;
    g.fillStyle(iconColor, 0.9);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        g.fillRect(toggleCX - 7 + col * 5, toggleCY - 7 + row * 5, 3, 3);
      }
    }

    const toggleHit = this.add
      .rectangle(toggleCX, toggleCY, toggleHitSize, toggleHitSize, 0xffffff, 0.001)
      .setDepth(431)
      .setInteractive({ useHandCursor: true });
    toggleHit.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      window.__suppressMapInputUntil = performance.now() + 500;
    });
    toggleHit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      window.__suppressMapInputUntil = performance.now() + 500;
      this.minimapOpen = !this.minimapOpen;
      this.refresh();
    });
    this.minimapObjects.push(g, toggleHit);

    if (!this.minimapOpen) return;

    // Get camera/world info from MapScene without importing it (avoids circular deps)
    const mapScene = this.scene.get('MapScene') as unknown as { minimapInfo: MinimapWorldInfo };
    if (!mapScene?.minimapInfo) return;
    const info = mapScene.minimapInfo;

    const mmX = 6;
    const mmY = toggleCY - TOGGLE_SIZE / 2 - 6 - MINIMAP_H;
    window.__minimapInputBounds.push({ x: mmX, y: mmY, width: MINIMAP_W, height: MINIMAP_H });
    const mmObjects = renderMinimap(this, this.state, info, mmX, mmY, (worldX, worldY) => {
      this.events.emit('ui:pan-camera', worldX, worldY);
      this.minimapOpen = false;
      this.refresh();
    });
    this.minimapObjects.push(...mmObjects);
  }

  private clearMinimap(): void {
    for (const item of this.minimapObjects) {
      item.destroy();
    }
    this.minimapObjects = [];
    window.__minimapInputBounds = [];
  }

  private clearCompactCard(): void {
    for (const item of this.compactCard) {
      item.destroy();
    }
    this.compactCard = [];
  }

  private getSelectedLand(): Land | undefined {
    return this.state.lands.find((land) => land.id === this.state.selectedLandId);
  }

  private getDefaultBuildLand(): Land | undefined {
    return this.state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID && land.isVisible);
  }

  private getBuildLand(): Land | undefined {
    const landId = this.modalBuildLandId ?? this.state.selectedLandId;
    return this.state.lands.find((land) => land.id === landId);
  }

  private openBuildModal(landId: string): void {
    this.modalBuildLandId = landId;
    this.state.selectedLandId = landId;
    this.openModal('build');
  }

  private pickDefaultLeader(): Hero | undefined {
    return (
      this.state.heroes.find((hero) => hero.type === 'general' && !hero.assignedTo) ??
      this.state.heroes.find((hero) => !hero.assignedTo)
    );
  }

  private makeLandPanel(land: Land): LandPanel {
    return new LandPanel(this, this.state, (action, landId) => {
      if (action === 'open-land-detail') {
        this.openModal('land-detail');
        return;
      }
      if (action === 'diplomatize') {
        this.openDiplomacyPicker(landId);
        return;
      }
      if (action === 'open-build' && land.ownerId === PLAYER_KINGDOM_ID) {
        this.openBuildModal(landId);
        return;
      }
      if (action === 'clear-selection') {
        this.events.emit('ui:clear-selection');
        return;
      }
      this.events.emit('ui:land-action', action, landId);
    });
  }

  private showLandDetailScreen(): void {
    const land = this.getSelectedLand();
    if (!land) {
      this.closeModal();
      return;
    }

    const ownerLabel = land.ownerId === PLAYER_KINGDOM_ID
      ? t('owner.yourDistrict')
      : land.ownerId === 'neutral' ? t('owner.neutralTerritory') : t('owner.rivalTerritory');
    this.addModalBase(land.name, ownerLabel);

    const content = this.modalContentBounds;
    const { infoLines, actions } = this.makeLandPanel(land).renderDetailContent(land);

    const infoCardH = Math.min(infoLines.length * 18 + 32, 220);
    this.modalLayer.add(this.ui.card(
      { x: content.x, y: content.y, width: content.width, height: infoCardH },
      { body: infoLines.join('\n') },
    ));

    if (actions.length > 0) {
      const footer = this.modalFooterBounds;
      const btnH = 40;
      const btnGap = 8;
      const count = Math.min(actions.length, 3);
      const btnW = count === 1 ? 200 : Math.floor((content.width - (count - 1) * btnGap) / count);
      const totalW = count * btnW + (count - 1) * btnGap;
      const startX = content.x + (content.width - totalW) / 2;
      actions.slice(0, count).forEach((act, i) => {
        this.modalLayer.add(this.ui.button(
          { x: startX + i * (btnW + btnGap), y: footer.y + (footer.height - btnH) / 2, width: btnW, height: btnH },
          act.label,
          () => this.handleLandDetailAction(act.id, land.id),
          { variant: act.variant ?? 'secondary', fontSize: '11px' },
        ));
      });
    }
  }

  private handleLandDetailAction(action: string, landId: string): void {
    if (action === 'diplomatize') {
      this.openDiplomacyPicker(landId);
      return;
    }

    this.closeModal();
    if (action === 'open-build') {
      this.openBuildModal(landId);
      return;
    }
    this.events.emit('ui:land-action', action, landId);
  }

  private openDiplomacyPicker(landId: string): void {
    const hasFreeHero = this.state.heroes.some((hero) => !hero.assignedTo);
    if (!hasFreeHero) {
      this.state.message = t('court.diplomacyNeedsHero');
      if (this.modalScreen !== 'none') {
        this.closeModal();
      } else {
        this.refresh();
      }
      return;
    }

    this.courtPicker = { kind: 'diplomacy', landId };
    this.openModal('court');
  }

  private showCampaignDefeatScreen(): void {
    this.clearModalLayer();
    this.modalLayer.setVisible(true);
    const panel = new CampaignScorePanel(this, this.state, () => {
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
    for (const obj of panel.render()) {
      this.modalLayer.add(obj);
    }
  }

  private showForeignAffairsScreen(): void {
    const selected = this.selectedAffairsKingdomId
      ? this.state.kingdoms.find((k) => k.id === this.selectedAffairsKingdomId && !k.isDefeated)
      : undefined;

    if (selected) {
      if (this.affairsPactOpen) {
        this.showPactOffer(selected);
      } else {
        this.showForeignAffairsDetail(selected);
      }
      return;
    }

    this.addModalBase(t('campaign.affairs.title'), t('diplo.prestige', { value: Math.round(getPrestige(this.state)) }));
    const content = this.modalContentBounds;

    const scroll = this.ui.scrollArea({ x: content.x, y: content.y, width: content.width, height: content.height });
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    const panel = new ForeignAffairsPanel(this, this.state, () => this.refresh());
    const rivals = this.state.kingdoms.filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
    const rowH = 96;
    const items = panel.renderList({ x: 0, y: 0, width: content.width, height: rivals.length * rowH }, (kingdomId) => {
      this.selectedAffairsKingdomId = kingdomId;
      this.refresh();
    });
    for (const obj of items) {
      scroll.content.add(obj);
    }
    scroll.setContentHeight(rivals.length * rowH);
  }

  private showDirectivesScreen(): void {
    const mandate = this.state.mandate;
    const era = mandate ? eraLabel(mandate.era) : '';
    this.addModalBase(t('empire.directive.title'), t('empire.mandate.era', { era }));
    const content = this.modalContentBounds;

    // ── Mandate of Heaven header ──
    let y = content.y;
    const headerH = 58;
    const header = this.add.graphics();
    // Dark banner so the gold text reads clearly (light-on-light was unreadable on parchment).
    header.fillStyle(INK_UI.backgroundInk, 0.9);
    header.fillRoundedRect(content.x, y, content.width, headerH, 6);
    header.lineStyle(1, INK_UI.gold, 0.55);
    header.strokeRoundedRect(content.x, y, content.width, headerH, 6);
    this.modalLayer.add(header);
    this.modalLayer.add(createLabel(this, content.x + 10, y + 8, t('empire.mandate.points', { points: Math.round(mandate?.points ?? 0) }), 'label', { fontSize: '14px', color: '#2a2118' }));
    this.modalLayer.add(createLabel(this, content.x + content.width - 10, y + 8, t('empire.mandate.edictPoints', { points: mandate?.edictPoints ?? 0 }), 'caption', { fontSize: '11px', align: 'right', color: '#8a5f1c' }).setOrigin(1, 0));
    const toNext = pointsToNextEra(this.state);
    const nextLabel = toNext > 0 ? t('empire.mandate.toNext', { points: Math.ceil(toNext) }) : t('empire.mandate.ascendReady');
    this.modalLayer.add(createLabel(this, content.x + 10, y + 32, nextLabel, 'caption', { fontSize: '11px', color: '#8a5f1c', wordWrap: { width: content.width - 130 } }));
    // Jump to the Edicts & Wonders board.
    this.modalLayer.add(this.ui.button({ x: content.x + content.width - 118, y: y + 28, width: 118, height: 24 }, t('empire.edict.open'), () => {
      this.modalScreen = 'edicts';
      this.refresh();
    }, { variant: 'primary', fontSize: '10px' }));
    y += headerH + 8;

    // ── Tax stance (realm-wide guns-vs-butter lever) ──
    const taxOrder: TaxPolicy[] = ['lenient', 'balanced', 'harsh'];
    const curTax = this.state.taxPolicy ?? 'balanced';
    const taxFx = getTaxEffects(this.state);
    const nextTax = taxOrder[(taxOrder.indexOf(curTax) + 1) % taxOrder.length];
    this.modalLayer.add(createLabel(this, content.x + 10, y + 2, t('tax.title', { policy: t(`tax.${curTax}` as Parameters<typeof t>[0]) }), 'label', { fontSize: '12px', color: '#3a2410' }));
    this.modalLayer.add(createLabel(this, content.x + 10, y + 20, t('tax.effect', { gold: Math.round(taxFx.goldMult * 100), stab: taxFx.stabilityDelta > 0 ? `+${taxFx.stabilityDelta}` : `${taxFx.stabilityDelta}` }), 'caption', { fontSize: '10px', color: '#6b5230' }));
    this.modalLayer.add(this.ui.button({ x: content.x + content.width - 118, y: y + 4, width: 118, height: 28 }, t('tax.change'), () => {
      this.state.taxPolicy = nextTax;
      refreshAllLandOutputs(this.state);
      this.refresh();
    }, { variant: 'secondary', fontSize: '10px' }));
    y += 40;

    // ── Directive list ──
    const subtitle = createLabel(this, content.x + 10, y, t('empire.directive.subtitle'), 'caption', { fontSize: '10px', color: '#6b5230' });
    this.modalLayer.add(subtitle);
    y += 20;

    // Reserve a bottom row for royal commands (active abilities).
    const cmdRowH = 62;
    const listH = content.height - (y - content.y) - cmdRowH;
    const scroll = this.ui.scrollArea({ x: content.x, y, width: content.width, height: listH });
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    // ── Royal Commands (Rally / Levy / Decree) with cooldowns ──
    const cmdY = content.y + content.height - cmdRowH + 4;
    this.modalLayer.add(createLabel(this, content.x, cmdY - 2, t('empire.ability.title'), 'caption', { fontSize: '10px', color: '#6b5230' }));
    const abW = (content.width - 16) / ABILITIES.length;
    ABILITIES.forEach((ab, i) => {
      const cd = abilityCooldown(this.state, ab.id);
      const blocked = abilityBlockedReason(this.state, ab);
      const label = cd > 0 ? `${abilityLabel(ab.id)} (${cd})` : abilityLabel(ab.id);
      this.modalLayer.add(this.ui.button({ x: content.x + i * (abW + 8), y: cmdY + 14, width: abW, height: 34 }, label, () => {
        if (useAbility(this.state, ab.id)) this.refresh();
        else this.refresh();
      }, { variant: blocked ? 'disabled' : 'secondary', fontSize: '10px' }));
    });

    const directives = this.state.directives ?? [];
    const rowH = 86;
    let rowY = 0;
    for (const d of directives) {
      const tierColor = d.tier === 'epic' ? INK_UI.gold : d.tier === 'medium' ? INK_UI.jade : INK_UI.parchment;
      const card = this.add.graphics();
      card.fillStyle(INK_UI.parchment, 0.14);
      card.fillRoundedRect(0, rowY, content.width, rowH - 8, 6);
      card.fillStyle(tierColor, 0.9);
      card.fillRoundedRect(0, rowY, 6, rowH - 8, { tl: 6, bl: 6, tr: 0, br: 0 });
      scroll.content.add(card);
      scroll.content.add(createLabel(this, 14, rowY + 8, directiveTitle(d), 'label', { fontSize: '12px', wordWrap: { width: content.width - 90 } }));
      scroll.content.add(createLabel(this, content.width - 8, rowY + 8, t(`empire.directive.tier.${d.tier}` as Parameters<typeof t>[0]), 'caption', { fontSize: '9px', align: 'right', color: '#8a6d2e' }).setOrigin(1, 0));
      const barMax = Math.max(1, d.target - d.baseline);
      const barVal = Phaser.Math.Clamp(d.current - d.baseline, 0, barMax);
      const bar = this.ui.statBar({ x: 14, y: rowY + 42, width: content.width - 92, height: 10 }, barVal, barMax, tierColor);
      scroll.content.add(bar);
      scroll.content.add(createLabel(this, content.width - 8, rowY + 40, t('empire.directive.progress', { current: Math.round(d.current), target: Math.round(d.target) }), 'caption', { fontSize: '10px', align: 'right' }).setOrigin(1, 0));
      scroll.content.add(createLabel(this, 14, rowY + 58, t('empire.directive.reward', { mandate: d.rewardMandate }), 'caption', { fontSize: '10px', color: '#4c6b46' }));
      if (d.deadline !== undefined) {
        scroll.content.add(createLabel(this, content.width - 8, rowY + 58, t('empire.directive.deadline', { turn: d.deadline }), 'caption', { fontSize: '10px', align: 'right', color: '#c0392b' }).setOrigin(1, 0));
      }
      rowY += rowH;
    }
    scroll.setContentHeight(Math.max(listH, rowY));
  }

  private showEventLogScreen(): void {
    this.addModalBase(t('log.title'), t('log.subtitle'));
    const content = this.modalContentBounds;

    const log = this.state.eventLog ?? [];
    // Opening the Chronicle acknowledges every entry; the bell badge clears on return.
    for (const entry of log) {
      entry.read = true;
    }

    if (log.length === 0) {
      this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 40, t('log.empty'), 'label', {
        fontSize: '14px',
        align: 'center',
        color: '#6f6250',
        wordWrap: { width: content.width - 40 },
      }).setOrigin(0.5));
      return;
    }

    const scroll = this.ui.scrollArea({ x: content.x, y: content.y, width: content.width, height: content.height });
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    // Newest first — the freshest happenings sit at the top of the list.
    const entries = log.slice().reverse();
    const gap = 6;
    let rowY = 0;
    for (const entry of entries) {
      const accent =
        entry.kind === 'reward' ? INK_UI.jade
          : entry.kind === 'threat' ? INK_UI.cinnabar
            : entry.kind === 'milestone' ? INK_UI.gold
              : INK_UI.parchment;

      const textLabel = createLabel(this, 40, 8, entry.text, 'label', {
        fontSize: '12px',
        color: '#5a4c39',
        wordWrap: { width: content.width - 52 },
      });
      // Measure wrapped height so each card hugs its content regardless of text length.
      const textH = textLabel.height;
      const rowH = Math.max(46, textH + 26);

      const card = this.add.graphics();
      card.fillStyle(INK_UI.parchment, 0.12);
      card.fillRoundedRect(0, rowY, content.width, rowH - gap, 6);
      card.fillStyle(accent, 0.9);
      card.fillRoundedRect(0, rowY, 5, rowH - gap, { tl: 6, bl: 6, tr: 0, br: 0 });
      scroll.content.add(card);

      textLabel.setY(rowY + 8);
      scroll.content.add(textLabel);
      scroll.content.add(createLabel(this, content.width - 8, rowY + rowH - gap - 16, t('log.turn', { turn: entry.turn }), 'caption', {
        fontSize: '9px',
        align: 'right',
        color: '#6f6250',
      }).setOrigin(1, 0));

      rowY += rowH;
    }
    scroll.setContentHeight(Math.max(content.height, rowY));
  }

  private showEdictsScreen(): void {
    const mandate = this.state.mandate;
    this.addModalBase(t('empire.edict.title'), t('empire.mandate.edictPoints', { points: mandate?.edictPoints ?? 0 }));
    const content = this.modalContentBounds;

    // Back to the Agenda board.
    this.modalLayer.add(this.ui.button({ x: content.x, y: content.y, width: 104, height: 26 }, t('empire.edict.back'), () => {
      this.modalScreen = 'directives';
      this.refresh();
    }, { variant: 'secondary', fontSize: '10px' }));

    // Header: points on hand + how many decrees are already active, then a one-line primer
    // so "chiếu chỉ" reads as a purposeful currency rather than an unexplained number.
    const activeCount = mandate?.edicts.filter((id) => allProjects(this.state).some((p) => p.id === id && p.kind === 'edict')).length ?? 0;
    this.modalLayer.add(createLabel(this, content.x + content.width, content.y + 2, t('empire.mandate.edictPoints', { points: mandate?.edictPoints ?? 0 }), 'label', { fontSize: '13px', align: 'right', color: '#7a4a12' }).setOrigin(1, 0));
    this.modalLayer.add(createLabel(this, content.x + content.width, content.y + 20, t('empire.edict.activeCount', { count: activeCount }), 'caption', { fontSize: '9px', align: 'right', color: '#3f6b32' }).setOrigin(1, 0));
    this.modalLayer.add(createLabel(this, content.x, content.y + 32, t('empire.edict.explain'), 'caption', { fontSize: '9px', color: '#6b5230', wordWrap: { width: content.width } }));

    // ── What the realm will bear, and whether it is listening ──
    //
    // Two lines, not a panel: this screen is already a dense scrolling list and the numbers are
    // context for it rather than the subject. Weight against authority answers "may I pass another
    // law", obedience answers "are the ones I passed doing anything", and the estates line names
    // whichever constituency is in open grievance. Overreach turns the first line red, because it
    // is the state a player will otherwise never notice they are in.
    if (mandate) {
      const weight = standingWeight(this.state);
      const cap = authorityCap(this.state);
      const over = overreach(this.state);
      const authorityLine = `${t('decree.stat.weight')} ${t('decree.authority.value', { weight: `${weight}`, cap: `${cap}` })}  ·  ${t('decree.stat.compliance')} ${Math.round(averageCompliance(this.state))}%  ·  ×${realisedFactor(this.state).toFixed(2)}`;
      this.modalLayer.add(createLabel(this, content.x, content.y + 46, authorityLine, 'caption', {
        fontSize: '9px',
        color: over > 0 ? '#8f2114' : '#3f6b32',
      }));
      const estateLine = ESTATE_IDS
        .map((estate) => `${t(`decree.estate.${estate}` as Parameters<typeof t>[0])} ${Math.round(estateStanding(this.state, estate))}`)
        .join('  ·  ');
      const aggrieved = ESTATE_IDS.find((estate) => estateStanding(this.state, estate) < ESTATE_CRISIS);
      this.modalLayer.add(createLabel(this, content.x, content.y + 60, estateLine, 'caption', {
        fontSize: '9px',
        color: aggrieved ? '#8f2114' : '#6b5230',
      }));
    }

    const listTop = content.y + (mandate ? 78 : 62);
    const listH = content.height - (mandate ? 78 : 62);
    const scroll = this.ui.scrollArea({ x: content.x, y: listTop, width: content.width, height: listH });
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    const projects = allProjects(this.state);
    let rowY = 0;

    const addSection = (labelKey: 'empire.edict.section.edicts' | 'empire.edict.section.wonders') => {
      scroll.content.add(createLabel(this, 4, rowY, t(labelKey), 'caption', { fontSize: '11px', fontStyle: '700', color: '#7a4a12' }));
      rowY += 22;
    };

    const addRow = (project: ReturnType<typeof allProjects>[number]) => {
      const enacted = isProjectEnacted(this.state, project.id);
      const blocked = projectBlockedReason(this.state, project);
      const rowH = 84;
      const branchColor = project.branch === 'war' ? INK_UI.cinnabar : project.branch === 'economy' ? INK_UI.gold : INK_UI.jade;
      const card = this.add.graphics();
      card.fillStyle(INK_UI.parchment, enacted ? 0.08 : 0.14);
      card.fillRoundedRect(0, rowY, content.width, rowH - 8, 6);
      card.fillStyle(branchColor, 0.9);
      card.fillRoundedRect(0, rowY, 6, rowH - 8, { tl: 6, bl: 6, tr: 0, br: 0 });
      scroll.content.add(card);
      scroll.content.add(createLabel(this, 14, rowY + 7, projectTitle(project), 'label', { fontSize: '12px', color: '#2a1a06', wordWrap: { width: content.width - 110 } }).setMaxLines(1));
      scroll.content.add(createLabel(this, 14, rowY + 25, projectDescription(project), 'caption', { fontSize: '10px', color: '#6b5230', wordWrap: { width: content.width - 24 } }).setMaxLines(1));
      // Concrete, always-accurate effect line so the payoff of the edict is legible.
      const effects = projectEffectSummary(project);
      if (effects) {
        scroll.content.add(createLabel(this, 14, rowY + 44, effects, 'caption', { fontSize: '10px', color: '#3f6b32', wordWrap: { width: content.width - 20 } }).setMaxLines(1));
      }
      const cost = project.kind === 'edict'
        ? t('empire.edict.cost.points', { cost: project.edictCost ?? 0 })
        : Object.entries(project.resourceCost ?? {}).map(([k, v]) => `${v}${k[0]}`).join(' ');
      scroll.content.add(createLabel(this, 14, rowY + 62, cost, 'caption', { fontSize: '10px', color: '#7a4a12' }));

      const btnW = 90;
      const btnX = content.width - btnW - 4;
      if (enacted) {
        scroll.content.add(createLabel(this, btnX + btnW, rowY + 8, t('empire.edict.done'), 'caption', { fontSize: '10px', align: 'right', color: '#3f6b32' }).setOrigin(1, 0));
        // A standing law is a decision that can be taken back. Wonders cannot — a canal that has
        // been dug is not a statute, and `repealProject` prices repeal off the edict-point cost a
        // wonder never had.
        const terms = project.kind === 'edict' ? repealTerms(this.state, project.id) : undefined;
        if (terms) {
          scroll.content.add(this.ui.button({ x: btnX, y: rowY + 26, width: btnW, height: 26 }, t('decree.repeal.cost', { n: terms.cost }), () => {
            if (repealProject(this.state, project.id)) this.refresh();
          }, { variant: terms.affordable ? 'secondary' : 'disabled', fontSize: '10px' }));
        }
      } else if (blocked) {
        scroll.content.add(createLabel(this, btnX + btnW, rowY + 14, blocked, 'caption', { fontSize: '9px', align: 'right', color: '#8f2114', wordWrap: { width: btnW } }).setOrigin(1, 0));
      } else {
        scroll.content.add(this.ui.button({ x: btnX, y: rowY + 24, width: btnW, height: 30 }, project.kind === 'wonder' ? t('empire.edict.build') : t('empire.edict.enact'), () => {
          enactProject(this.state, project.id);
          this.refresh();
        }, { variant: 'primary', fontSize: '11px' }));
      }
      rowY += rowH;
    };

    addSection('empire.edict.section.edicts');
    for (const p of projects.filter((p) => p.kind === 'edict')) addRow(p);
    rowY += 8;
    addSection('empire.edict.section.wonders');
    for (const p of projects.filter((p) => p.kind === 'wonder')) addRow(p);

    scroll.setContentHeight(Math.max(listH, rowY));
  }

  private showForeignAffairsDetail(kingdom: GameState['kingdoms'][number]): void {
    const relations = Math.round(kingdom.relations ?? 50);
    this.addModalBase(kingdom.name, `${stanceLabel(relations)} · ${t('diplo.opinion')} ${relations}/100`);
    const content = this.modalContentBounds;

    // Back to list
    this.modalLayer.add(this.ui.button({ x: content.x, y: content.y, width: 116, height: 30 }, t('campaign.affairs.back'), () => {
      this.selectedAffairsKingdomId = undefined;
      this.refresh();
    }, { variant: 'secondary', fontSize: '11px' }));
    this.modalLayer.add(createLabel(this, content.x + content.width, content.y + 6, t('diplo.fearTrust', {
      fear: Math.round(getFear(this.state, kingdom)),
      trust: Math.round(getTrust(kingdom)),
    }), 'caption', { fontSize: '10px', align: 'right' }).setOrigin(1, 0));
    const appetite = Math.round(kingdom.warAppetite ?? 0);
    if (appetite >= 40 && !hasPact(kingdom)) {
      this.modalLayer.add(createLabel(this, content.x + content.width, content.y + 20, t('diplo.warAppetite', { pct: appetite }), 'caption', {
        fontSize: '10px', align: 'right', color: '#c0392b',
      }).setOrigin(1, 0));
    }

    // Opinion breakdown (baseline + each modifier), scrollable
    const breakdownTop = content.y + 40;
    const breakdownH = content.height - 40 - 244;
    const scroll = this.ui.scrollArea({ x: content.x, y: breakdownTop, width: content.width, height: breakdownH });
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    const rows: Array<{ label: string; value: number; muted?: boolean }> = [
      { label: t('diplo.baseline'), value: naturalBaseline(kingdom.personality), muted: true },
      ...(kingdom.opinionModifiers ?? []).map((m) => ({ label: m.label, value: Math.round(m.value) })),
    ];
    let rowY = 0;
    for (const row of rows) {
      const g = this.add.graphics();
      g.fillStyle(INK_UI.parchment, 0.16);
      g.fillRoundedRect(0, rowY, content.width, 26, 4);
      scroll.content.add(g);
      scroll.content.add(createLabel(this, 8, rowY + 6, row.label, 'caption', { fontSize: '11px', wordWrap: { width: content.width - 70 } }));
      const sign = row.value > 0 ? '+' : '';
      const valColor = row.muted ? '#6b5230' : row.value >= 0 ? '#4c6b46' : '#aa3a2c';
      scroll.content.add(createLabel(this, content.width - 8, rowY + 6, `${sign}${row.value}`, 'label', {
        fontSize: '12px', align: 'right', color: valColor,
      }).setOrigin(1, 0));
      rowY += 30;
    }
    if (rows.length <= 1) {
      scroll.content.add(createLabel(this, 8, rowY + 4, t('diplo.noModifiers'), 'caption', { fontSize: '11px' }));
      rowY += 24;
    }
    scroll.setContentHeight(rowY);

    // ── Empire intel: their evolving Power (visible) and Stability (needs an envoy) ──
    const kingdomId = kingdom.id;
    const envoy = ambassadorHero(this.state, kingdom);
    const intelY = content.y + content.height - 244;
    const power = Math.round(kingdom.power ?? 50);
    const stabilityText = envoy ? String(Math.round(kingdom.stability ?? 50)) : '??';
    this.modalLayer.add(createLabel(this, content.x, intelY,
      `${t('empire.stat.power')} ${power}   ·   ${t('empire.stat.stability')} ${stabilityText}`,
      'label', { fontSize: '12px', color: '#2a2118' }));
    if (kingdom.king) {
      this.modalLayer.add(createLabel(this, content.x + content.width, intelY, t('empire.stat.king', {
        name: kingdom.king.name,
        trait: kingdom.king.personality,
      }), 'caption', { fontSize: '10px', align: 'right', color: '#6f6250' }).setOrigin(1, 0));
    }

    // ── Diplomatic actions (gift / trade / pact / tribute) ──
    const giftLabel = t('diplo.action.gift', { cost: giftCost(kingdom), gain: giftOpinionGain(kingdom) });
    const btnY = content.y + content.height - 218;
    const btnW = (content.width - 10) / 2;
    const bh = 38;
    const gap = 8;
    const act = (fn: () => void) => {
      fn();
      this.refresh();
    };
    this.modalLayer.add(this.ui.button({ x: content.x, y: btnY, width: btnW, height: bh }, giftLabel, () => act(() => sendGift(this.state, kingdomId)), { variant: 'primary', fontSize: '11px' }));
    this.modalLayer.add(this.ui.button({ x: content.x + btnW + 10, y: btnY, width: btnW, height: bh }, t('diplo.action.trade'), () => act(() => proposeTrade(this.state, kingdomId)), { variant: 'secondary', fontSize: '11px' }));
    const pacted = hasPact(kingdom);
    this.modalLayer.add(this.ui.button({ x: content.x, y: btnY + bh + gap, width: btnW, height: bh }, pacted ? t('diplo.action.pacted') : t('diplo.action.pact'), () => {
      if (pacted) return;
      this.affairsPactOpen = true;
      this.affairsPactSweetener = 0;
      this.refresh();
    }, { variant: pacted ? 'disabled' : 'secondary', fontSize: '11px' }));
    this.modalLayer.add(this.ui.button({ x: content.x + btnW + 10, y: btnY + bh + gap, width: btnW, height: bh }, t('diplo.action.tribute'), () => act(() => demandTribute(this.state, kingdomId)), { variant: 'danger', fontSize: '11px' }));

    // ── Statecraft/espionage row (empire mode): envoy, sabotage, incite ──
    if (this.state.gameMode === 'empire') {
      const rowY = btnY + 2 * (bh + gap);
      const w3 = (content.width - 2 * gap) / 3;
      this.modalLayer.add(this.ui.button({ x: content.x, y: rowY, width: w3, height: bh },
        envoy ? t('empire.action.recall') : t('empire.action.ambassador'),
        () => act(() => (envoy ? recallAmbassador(this.state, kingdomId) : postAmbassador(this.state, kingdomId))),
        { variant: envoy ? 'secondary' : 'primary', fontSize: '10px' }));
      this.modalLayer.add(this.ui.button({ x: content.x + w3 + gap, y: rowY, width: w3, height: bh },
        t('empire.action.sabotage'), () => act(() => fomentUnrest(this.state, kingdomId)), { variant: 'danger', fontSize: '10px' }));
      this.modalLayer.add(this.ui.button({ x: content.x + 2 * (w3 + gap), y: rowY, width: w3, height: bh },
        t('empire.action.incite'), () => act(() => inciteWar(this.state, kingdomId)), { variant: 'danger', fontSize: '10px' }));
    }
  }

  private showPactOffer(kingdom: GameState['kingdoms'][number]): void {
    this.addModalBase(t('diplo.pactOffer.title'), kingdom.name);
    const content = this.modalContentBounds;
    const sweetener = this.affairsPactSweetener;
    const evaluation = evaluatePactOffer(this.state, kingdom, sweetener);

    let rowY = content.y;
    for (const reason of evaluation.reasons) {
      this.modalLayer.add(createLabel(this, content.x + 4, rowY, reason.label, 'caption', { fontSize: '11px', wordWrap: { width: content.width - 70 } }));
      const sign = reason.value > 0 ? '+' : '';
      this.modalLayer.add(createLabel(this, content.x + content.width - 4, rowY, `${sign}${reason.value}`, 'label', {
        fontSize: '12px', align: 'right', color: reason.value >= 0 ? '#4c6b46' : '#aa3a2c',
      }).setOrigin(1, 0));
      rowY += 24;
    }

    rowY += 10;
    const verdict = evaluation.accepts ? t('diplo.pactOffer.accepts') : t('diplo.pactOffer.refuses');
    this.modalLayer.add(createLabel(this, content.x + content.width / 2, rowY, `${verdict}  (${evaluation.score >= 0 ? '+' : ''}${evaluation.score})`, 'label', {
      fontSize: '15px', align: 'center', color: evaluation.accepts ? '#4c6b46' : '#aa3a2c',
    }).setOrigin(0.5, 0));
    rowY += 36;

    this.modalLayer.add(createLabel(this, content.x + content.width / 2, rowY, t('diplo.pactOffer.sweetener', { gold: sweetener }), 'caption', {
      fontSize: '12px', align: 'center',
    }).setOrigin(0.5, 0));
    rowY += 24;
    const stepW = 72;
    this.modalLayer.add(this.ui.button({ x: content.x + content.width / 2 - stepW - 8, y: rowY, width: stepW, height: 34 }, '− 10', () => {
      this.affairsPactSweetener = Math.max(0, sweetener - 10);
      this.refresh();
    }, { variant: 'secondary', fontSize: '13px' }));
    this.modalLayer.add(this.ui.button({ x: content.x + content.width / 2 + 8, y: rowY, width: stepW, height: 34 }, '+ 10', () => {
      this.affairsPactSweetener = Math.min(this.state.resources.gold, sweetener + 10);
      this.refresh();
    }, { variant: 'secondary', fontSize: '13px' }));

    const footer = this.modalFooterBounds;
    const halfW = (content.width - 10) / 2;
    this.modalLayer.add(this.ui.button({ x: content.x, y: footer.y, width: halfW, height: 42 }, t('diplo.pactOffer.propose'), () => {
      const ok = proposePact(this.state, kingdom.id, this.affairsPactSweetener);
      if (ok) {
        this.affairsPactOpen = false;
        this.affairsPactSweetener = 0;
      }
      this.refresh();
    }, { variant: 'primary', fontSize: '12px' }));
    this.modalLayer.add(this.ui.button({ x: content.x + halfW + 10, y: footer.y, width: halfW, height: 42 }, t('action.cancel'), () => {
      this.affairsPactOpen = false;
      this.refresh();
    }, { variant: 'secondary', fontSize: '12px' }));
  }

  private showHeroEventScreen(): void {
    const view = heroEventView(this.state);
    if (!view) {
      this.closeModal();
      return;
    }
    this.addModalBase(view.title, '');
    const content = this.modalContentBounds;

    if (view.hero) {
      this.modalLayer.add(renderHeroFace(this, view.hero, GAME_WIDTH / 2, content.y + 44, 0.72));
    }
    this.modalLayer.add(createLabel(this, GAME_WIDTH / 2, content.y + 96, view.description, 'label', {
      fontSize: '13px',
      align: 'center',
      color: '#8a5f1c',
      wordWrap: { width: content.width - 20 },
    }).setOrigin(0.5, 0));

    let y = content.y + 196;
    view.choices.forEach((choice, index) => {
      this.modalLayer.add(this.ui.card({ x: content.x, y, width: content.width, height: 96 }, {
        title: choice.label,
        subtitle: choice.description,
        border: index === 0 ? INK_UI.gold : INK_UI.softBrush,
        actionPlacement: 'bottom',
        action: {
          label: t('action.choose'),
          variant: index === 0 ? 'primary' : 'secondary',
          onClick: () => {
            this.events.emit('ui:hero-event-choice', choice.id);
            this.closeModal();
          },
        },
      }));
      y += 108;
    });
  }

  private showForeignEventScreen(): void {
    const card = this.state.pendingForeignCard;
    if (!card) {
      this.closeModal();
      return;
    }
    this.addModalBase(card.title, t('fcard.from', { kingdom: card.kingdomName }));
    const content = this.modalContentBounds;

    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y, width: content.width, height: 150 }, {
      body: card.description,
      border: INK_UI.cinnabar,
    }));

    let y = content.y + 166;
    for (const choice of card.choices) {
      const enabled = foreignChoiceEnabled(this.state, card, choice);
      this.modalLayer.add(this.ui.card({ x: content.x, y, width: content.width, height: 84 }, {
        title: choice.label,
        subtitle: choice.description,
        muted: !enabled,
        border: enabled ? INK_UI.gold : INK_UI.softBrush,
        actionPlacement: 'bottom',
        action: {
          label: enabled ? t('action.choose') : t('fcard.unavailable'),
          variant: enabled ? 'primary' : 'disabled',
          disabled: !enabled,
          onClick: () => {
            if (!enabled) return;
            this.events.emit('ui:foreign-choice', choice.id);
            this.closeModal();
          },
        },
      }));
      y += 96;
    }
  }

  /** Pausing intelligence alert — our agents warn of a coming host; the player must react. */
  private showThreatAlertScreen(): void {
    const alert = this.state.pendingThreatAlert;
    if (!alert) { this.closeModal(); return; }
    this.addModalBase(t('alert.title'), t('alert.subtitle'));
    const content = this.modalContentBounds;

    const strengthColor = alert.strength === 'stronger' ? INK_UI.cinnabar : alert.strength === 'even' ? INK_UI.gold : INK_UI.jade;
    const who = alert.warlordName ? t('alert.warlord', { warlord: alert.warlordName, kingdom: alert.kingdomName }) : alert.kingdomName;
    const bodyKey = alert.kind === 'coalition' ? 'alert.body.coalition' : 'alert.body.incoming';
    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y, width: content.width, height: 150 }, {
      title: t('alert.spyHeader'),
      body: t(bodyKey, { who, turns: alert.turns }),
      border: INK_UI.cinnabar,
    }));
    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y + 162, width: content.width, height: 74 }, {
      title: t(`alert.strength.${alert.strength}` as Parameters<typeof t>[0]),
      body: t('alert.advice'),
      border: strengthColor,
    }));

    const footer = this.modalFooterBounds;
    const btnW = (content.width - 12) / 2;
    // Jump straight to mustering an army.
    this.modalLayer.add(this.ui.button({ x: content.x, y: footer.y + 6, width: btnW, height: 44 }, t('alert.muster'), () => {
      this.acknowledgeThreatAlert();
      this.openModal('army');
    }, { variant: 'primary', fontSize: '13px' }));
    this.modalLayer.add(this.ui.button({ x: content.x + btnW + 12, y: footer.y + 6, width: btnW, height: 44 }, t('alert.understood'), () => {
      this.acknowledgeThreatAlert();
    }, { variant: 'secondary', fontSize: '13px' }));
  }

  private acknowledgeThreatAlert(): void {
    this.state.pendingThreatAlert = undefined;
    this.state.isPaused = false;
    this.closeModal();
    this.refresh();
  }

  /** Focused field-battle decision: commit, delegate to the general, or withdraw. */
  private showBattleDecisionScreen(): void {
    const battle = this.state.pendingBattle;
    if (!battle) { this.closeModal(); return; }
    this.addModalBase(t('battleDec.title'), t('battleDec.at', { land: battle.landName }));
    const content = this.modalContentBounds;

    const odds = battle.defenderPower > 0 ? battle.attackerPower / battle.defenderPower : 9;
    const oddsLabel = odds >= 1.15 ? t('battleDec.odds.bad') : odds <= 0.85 ? t('battleDec.odds.good') : t('battleDec.odds.even');
    const oddsColor = odds >= 1.15 ? INK_UI.cinnabar : odds <= 0.85 ? INK_UI.jade : INK_UI.gold;
    // A province defending itself is a different sheet, because the same three verbs mean
    // different things: there is no general standing here to delegate to and no host to withdraw,
    // so the screen would be describing an army that is not on the field.
    const garrison = battle.garrisonOnly === true;
    const forces = t('battleDec.forces', { atk: Math.round(battle.attackerPower), def: Math.round(battle.defenderPower), odds: oddsLabel });
    this.modalLayer.add(this.ui.card({ x: content.x, y: content.y, width: content.width, height: 120 }, {
      title: t('battleDec.enemy', { kingdom: battle.kingdomName }),
      body: garrison
        ? `${forces}\n${t('battleDec.garrison', { land: battle.landName, men: battle.militia ?? 0 })}`
        : forces,
      border: oddsColor,
    }));

    // `id` is the decision the systems take; `key` is what the sheet calls it.
    const opts: Array<{ id: 'attack' | 'delegate' | 'retreat'; key: string; variant: 'primary' | 'secondary' | 'danger' }> = garrison
      ? [
        { id: 'attack', key: 'sally', variant: 'primary' },
        { id: 'delegate', key: 'hold', variant: 'secondary' },
        { id: 'retreat', key: 'yield', variant: 'danger' },
      ]
      : [
        { id: 'attack', key: 'attack', variant: 'primary' },
        { id: 'delegate', key: 'delegate', variant: 'secondary' },
        { id: 'retreat', key: 'retreat', variant: 'danger' },
      ];
    let y = content.y + 134;
    for (const opt of opts) {
      this.modalLayer.add(this.ui.card({ x: content.x, y, width: content.width, height: 82 }, {
        title: t(`battleDec.${opt.key}` as Parameters<typeof t>[0]),
        subtitle: t(`battleDec.${opt.key}.d` as Parameters<typeof t>[0]),
        border: opt.variant === 'danger' ? INK_UI.cinnabar : opt.variant === 'primary' ? INK_UI.gold : INK_UI.softBrush,
        actionPlacement: 'right',
        action: {
          label: t(`battleDec.act.${opt.key}` as Parameters<typeof t>[0]),
          variant: opt.variant,
          onClick: () => {
            this.events.emit('ui:battle-decision', opt.id);
            this.state.pendingBattle = undefined;
            this.state.isPaused = false;
            this.closeModal();
            this.refresh();
          },
        },
      }));
      y += 90;
    }
  }

  /**
   * Dynasty Stability readout in the header's free top-centre space — a borderless,
   * colour-coded label (reusing the resource-rate palette) that reads as a natural
   * third header item beside the date and Menu, rather than a boxed widget. Shows the
   * composite value driving the collapse-defeat check (stability, unrest, nobles); a
   * small status dot gives an at-a-glance read.
   */
  private renderDynastyStability(): void {
    const ds = this.state.dynastyStatus;
    if (!ds) return;

    const value = Math.round(
      this.state.court.stability * 0.4 + (100 - ds.farmerUnrest) * 0.35 + ds.nobleRelations * 0.25,
    );
    // Same colour language as the resource rates (see ResourceBar.refresh).
    const textColor = value >= 50 ? '#4c6b46' : value >= 30 ? '#9a6b16' : '#8a2a1b';
    const dotColor = value >= 50 ? INK_UI.jade : value >= 30 ? INK_UI.gold : INK_UI.cinnabar;

    const text = this.ui.label(GAME_WIDTH / 2 + 5, 7, `${t('ui.dynastyStability')} ${value}%`, 'subtitle', {
      color: textColor,
      fontSize: '12px',
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(110);
    const dot = this.add.circle(GAME_WIDTH / 2 - text.width / 2, 13, 3, dotColor, 1).setDepth(110);
    this.affairsBadge.push(text, dot);
  }

  private clearAffairsBadge(): void {
    for (const item of this.affairsBadge) {
      item.destroy();
    }
    this.affairsBadge = [];
  }

  /**
   * Empire mode: a left-edge strip of banners for the off-map Empires (which never
   * appear on the board). Each shows the empire's colour, name, a relations tint,
   * and a ⚔ marker while one of its hosts is invading. Tapping opens foreign affairs.
   */
  private renderEmpireBanners(): void {
    if (this.state.selectedLandId || this.state.latestBattlePreview) {
      return; // bottom card / preview is up — keep the edge clear
    }

    const empires = this.state.kingdoms.filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
    const chipW = 108;
    const chipH = 34;
    const x = 6;
    let y = HEADER_HEIGHT + MESSAGE_STRIP_HEIGHT + MANDATE_BAR_BAND + 8;

    for (const empire of empires) {
      const relations = empire.relations ?? 50;
      const relColor = relations >= 65 ? INK_UI.jade : relations <= 35 ? INK_UI.cinnabar : INK_UI.gold;
      const invading = (this.state.invasions ?? []).some((r) => r.kingdomId === empire.id);

      const g = this.add.graphics().setDepth(430);
      g.fillStyle(INK_UI.backgroundInk, 0.9);
      g.fillRoundedRect(x, y, chipW, chipH, 6);
      g.fillStyle(empire.color, 0.95);
      g.fillRoundedRect(x, y, 7, chipH, { tl: 6, bl: 6, tr: 0, br: 0 });
      g.lineStyle(invading ? 2 : 1, invading ? INK_UI.cinnabar : relColor, invading ? 0.95 : 0.7);
      g.strokeRoundedRect(x, y, chipW, chipH, 6);
      // relations tick
      g.fillStyle(relColor, 0.9);
      g.fillRect(x + 12, y + chipH - 6, (chipW - 18) * Phaser.Math.Clamp(relations / 100, 0, 1), 3);

      const name = this.ui.label(x + 12, y + 4, empire.name, 'caption', {
        color: '#2a2118',
        fontSize: '9px',
        wordWrap: { width: chipW - 18 },
      }).setDepth(431);

      const items: Phaser.GameObjects.GameObject[] = [g, name];
      if (invading) {
        items.push(this.ui.label(x + chipW - 6, y + 3, '⚔', 'caption', {
          color: '#a4402c',
          fontSize: '12px',
          align: 'right',
        }).setOrigin(1, 0).setDepth(431));
      }

      const hit = this.add.rectangle(x + chipW / 2, y + chipH / 2, chipW, chipH, 0xffffff, 0.001)
        .setDepth(431)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        window.__suppressMapInputUntil = performance.now() + 500;
      });
      hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        window.__suppressMapInputUntil = performance.now() + 500;
        this.openModal('foreign-affairs');
      });
      items.push(hit);

      this.empireBanners.push(...items);
      y += chipH + 6;
    }
  }

  private clearEmpireBanners(): void {
    for (const item of this.empireBanners) {
      item.destroy();
    }
    this.empireBanners = [];
  }

  /**
   * The always-visible "XP bar" of empire mode: the Mandate of Heaven progression
   * strip pinned under the message strip. Shows the current era, a fill toward the
   * next era, and points — so the player *feels* progress accruing every tick and
   * sees exactly how close the next unlock (era) is. Tapping opens the Agenda.
   */
  private renderMandateBar(): void {
    if (!this.state.mandate) return;
    const prog = eraProgress(this.state);

    const x = 6;
    const w = GAME_WIDTH - 12;
    const h = 20;
    const y = HEADER_HEIGHT + MESSAGE_STRIP_HEIGHT + 2;
    const labelZone = 116;
    const valueZone = 68;

    const g = this.add.graphics().setDepth(428);
    g.fillStyle(INK_UI.backgroundInk, 0.94);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, INK_UI.gold, 0.7);
    g.strokeRoundedRect(x, y, w, h, 6);
    // Progress track (kept clear of the text zones so labels stay legible on dark).
    const trackX = x + labelZone;
    const trackW = w - labelZone - valueZone;
    const trackY = y + 6;
    const trackH = h - 12;
    g.fillStyle(INK_UI.brush, 0.35);
    g.fillRoundedRect(trackX, trackY, trackW, trackH, 3);
    g.fillStyle(INK_UI.gold, prog.atMax ? 0.95 : 0.8);
    const fillW = Math.round(trackW * prog.ratio);
    if (fillW > 2) g.fillRoundedRect(trackX, trackY, fillW, trackH, 3);
    this.mandateBarObjects.push(g);

    this.mandateBarObjects.push(
      this.ui.label(x + 8, y + h / 2, `☯ ${eraLabel(prog.era)}`, 'caption', {
        color: '#2a2118',
        fontSize: '11px',
        fontStyle: '700',
      }).setOrigin(0, 0.5).setDepth(429),
    );
    const valueText = prog.atMax ? t('empire.mandate.barAscend') : `${Math.round(prog.points)} / ${prog.nextThreshold}`;
    this.mandateBarObjects.push(
      this.ui.label(x + w - 8, y + h / 2, valueText, 'caption', {
        color: prog.atMax ? '#4c6b46' : '#8a5f1c',
        fontSize: '10px',
        align: 'right',
      }).setOrigin(1, 0.5).setDepth(429),
    );

    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0xffffff, 0.001)
      .setDepth(429)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      window.__suppressMapInputUntil = performance.now() + 400;
    });
    hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      window.__suppressMapInputUntil = performance.now() + 400;
      this.openModal('directives');
    });
    this.mandateBarObjects.push(hit);
  }

  private clearMandateBar(): void {
    for (const item of this.mandateBarObjects) {
      item.destroy();
    }
    this.mandateBarObjects = [];
  }

  /** A short centred "Year N" flourish that fades in and out when the year turns. */
  private playYearTransition(year: number): void {
    const container = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60).setDepth(2000).setAlpha(0).setScale(0.86);

    const g = this.add.graphics();
    g.fillStyle(INK_UI.backgroundInk, 0.82);
    g.fillRoundedRect(-136, -46, 272, 100, 10);
    g.lineStyle(2, INK_UI.gold, 0.9);
    g.strokeRoundedRect(-136, -46, 272, 100, 10);
    g.lineBetween(-104, -20, 104, -20);
    g.lineBetween(-104, 30, 104, 30);

    const title = this.ui.label(0, 4, t('empire.year.new', { year }), 'title', {
      color: '#2a2118', fontSize: '34px', align: 'center',
    }).setOrigin(0.5);
    const sub = this.ui.label(0, 40, t('empire.year.reign', { year }), 'caption', {
      color: '#8a5f1c', fontSize: '11px', align: 'center',
    }).setOrigin(0.5);
    container.add([g, title, sub]);

    this.tweens.add({ targets: container, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' });
    this.tweens.add({
      targets: container,
      alpha: 0,
      delay: 1000,
      duration: 420,
      ease: 'Cubic.In',
      onComplete: () => container.destroy(),
    });
  }

  /** A prominent top-centre banner counting down a telegraphed invasion. */
  private renderTelegraphBanner(): void {
    const u = this.state.pendingUltimatum;
    if (!u || u.defused || this.state.selectedLandId || this.state.latestBattlePreview) {
      return;
    }
    const kingdom = this.state.kingdoms.find((k) => k.id === u.kingdomId);
    const turns = Math.max(0, u.dueTurn - this.state.turn);
    const label = u.isGreatInvasion
      ? t('empire.ultimatum.bannerGreat', { warlord: u.warlordName ?? '', turns })
      : t('empire.ultimatum.banner', { kingdom: kingdom?.name ?? '', turns });
    const accent = u.isGreatInvasion ? INK_UI.cinnabar : INK_UI.gold;

    const w = 220;
    const h = 26;
    const x = (GAME_WIDTH - w) / 2;
    const y = HEADER_HEIGHT + MESSAGE_STRIP_HEIGHT + MANDATE_BAR_BAND + 6;
    const g = this.add.graphics().setDepth(432);
    g.fillStyle(INK_UI.backgroundInk, 0.92);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(u.isGreatInvasion ? 2 : 1.5, accent, 0.95);
    g.strokeRoundedRect(x, y, w, h, 6);
    const text = this.ui.label(x + w / 2, y + h / 2, label, 'caption', {
      color: u.isGreatInvasion ? '#a4402c' : '#2a2118',
      fontSize: '11px',
      align: 'center',
    }).setOrigin(0.5).setDepth(433);
    this.telegraphObjects.push(g, text);
  }

  private clearTelegraphBanner(): void {
    for (const item of this.telegraphObjects) {
      item.destroy();
    }
    this.telegraphObjects = [];
  }

  private clearToastFeed(): void {
    for (const item of this.toastObjects) {
      item.destroy();
    }
    this.toastObjects = [];
  }

  private showVictory(): void {
    this.modalScreen = 'none';
    this.state.isPaused = true;
    this.clearModalLayer();
    this.modalLayer.setVisible(false);

    if (this.state.gameMode === 'empire') {
      let earned = 0;
      if (!this.state.legacyBanked) {
        this.state.legacyBanked = true;
        earned = bankLegacy(this.state, true);
      }
      const rank = rankForScore(getLegacy().bestScore);
      this.bottomSheet.show([
        this.ui.card({ x: 18, y: SHEET_TOP + 28, width: GAME_WIDTH - 36, height: 156 }, {
          title: t('empire.ascend.title'),
          body: t('empire.ascend.body', { points: earned, rank }),
          border: INK_UI.gold,
          status: t('empire.ascend.status'),
        }),
      ]);
      return;
    }

    this.bottomSheet.show([
      this.ui.card({ x: 18, y: SHEET_TOP + 28, width: GAME_WIDTH - 36, height: 132 }, {
        title: t('modal.victory.title'),
        body: t('modal.victory.body'),
        border: INK_UI.gold,
        status: t('modal.victory.status'),
      }),
    ]);
  }
}

function formatCost(cost: Partial<GameState['resources']>): string {
  return formatResourceList(cost);
}

type BuildDetailOption = ReturnType<typeof getBuildOptions>[number] | ReturnType<typeof getUpgradeOptions>[number];

function formatBuildDetails(option: BuildDetailOption): string {
  return [
    `${t('status.category')}: ${categoryLabel(option.category)}`,
    `${t('status.labor')}: ${option.labor}`,
    `${t('status.produces')}: ${formatEconomyLine(option.output)}`,
    `${t('status.upkeep')}: ${formatEconomyLine(option.upkeep)}`,
  ].join('\n');
}

function categoryLabel(category: BuildDetailOption['category']): string {
  if (category === 'production') {
    return t('category.production');
  }
  if (category === 'military') {
    return t('category.military');
  }
  return t('category.public');
}

function formatTerrain(land: Land): string {
  const grass = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
  const ore = land.terrainSummary.mountains + land.terrainSummary.hills;
  const water = land.terrainSummary.water;
  const city = land.terrainSummary.fortress + land.terrainSummary.shrine;
  return t('terrain.summary', { grass, ore, water, city });
}

function buildDescription(type: string, land: Land): string {
  if (type === 'farm') {
    const waterBonus = land.terrainSummary.water > 0 ? t('desc.farmWater') : '';
    return t('desc.farm', { waterBonus });
  }
  if (type === 'mine') {
    return t('desc.mine');
  }
  if (type === 'wall') {
    return t('desc.wall');
  }
  if (type === 'tower') {
    return t('desc.tower');
  }
  if (type === 'barracks') {
    return t('desc.barracks');
  }
  if (type === 'communalHall') {
    return t('desc.communalHall');
  }
  if (type === 'harbor') {
    return t('desc.harbor');
  }
  if (type === 'workshop') {
    return t('desc.workshop');
  }
  if (type === 'guild') {
    return t('desc.guild');
  }
  if (type === 'university') {
    return t('desc.university');
  }
  return t('desc.market');
}

function availabilityLabel(text: string): string {
  const value = text.match(/(\d[\d,]*)$/)?.[1];
  return value ? t('status.available', { value }) : text;
}
