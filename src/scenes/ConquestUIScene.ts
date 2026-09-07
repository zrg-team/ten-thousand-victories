import Phaser from 'phaser';
import { RectClip } from '../ui/ink/clipRect';
import { type MusterPlan } from '../systems/ascent/MusterSystem';
import { type HeroPickerRow, type HostPickerRow } from '../ui/heroPickerRows';
import { InkUI, type InkScrollArea, type UIBounds } from '../ui/InkUI';
import { type MapItemRenderer } from '../ui/MapItemRenderer';
import { type CardIconId } from '../ui/CardIcons';
import { AscentHud } from '../ui/ascent/AscentHud';
import { AdvisorStrip } from '../ui/ascent/AdvisorStrip';
import { BarHint } from '../ui/ascent/BarHint';
import { InheritanceChip } from '../ui/ascent/InheritanceChip';
import { WhisperLine } from '../ui/ascent/WhisperLine';
import { Copilot, type CopilotStep } from '../ui/Copilot';
import type { CoronationSheet } from '../ui/coronation/CoronationSheet';
import { ActionBar } from '../ui/ActionBar';
import { ResourceBar } from '../ui/ResourceBar';
import type {
  AscentBattle,
  AscentLane,
  AscentPrompt,
  AscentWaveCue,
  BattleBeat,
  ConquestMethodOption,
  ConquestTarget,
  CourtPositionId,
  GameState,
  Hero,
} from '../state/types';
import type { BattleMarker } from './conquest/constants';
import type { PaperSheet } from '../ui/ink/paperSheet';
import * as battleBubbles from './conquest/battle/bubbles';
import * as battleCamp from './conquest/battle/camp';
import * as battleClock from './conquest/battle/clock';
import * as battleDock from './conquest/battle/dock';
import * as battleEffects from './conquest/battle/effects';
import * as battleField from './conquest/battle/field';
import * as battleGeometry from './conquest/battle/geometry';
import * as battleGround from './conquest/battle/ground';
import * as battleMoment from './conquest/battle/moment';
import * as battleOrders from './conquest/battle/orders';
import * as battleRails from './conquest/battle/rails';
import * as battleShell from './conquest/battle/shell';
import * as lanesFrame from './conquest/lanes/frame';
import * as lanesWidgets from './conquest/lanes/widgets';
import * as promptsConquest from './conquest/prompts/conquest';
import * as promptsCourt from './conquest/prompts/court';
import * as promptsCoronation from './conquest/prompts/coronation';
import * as promptsInheritance from './conquest/prompts/inheritance';
import * as promptsFrame from './conquest/prompts/frame';
import * as promptsOptionCard from './conquest/prompts/optionCard';
import * as promptsRealm from './conquest/prompts/realm';
import * as promptsRouter from './conquest/prompts/router';
import * as promptsRun from './conquest/prompts/run';
import * as promptsStory from './conquest/prompts/story';
import * as screensAffairs from './conquest/screens/affairs';
import * as screensAftermath from './conquest/screens/aftermath';
import * as screensArmy from './conquest/screens/army';
import * as screensArmyTargets from './conquest/screens/armyTargets';
import * as screensBuild from './conquest/screens/build';
import * as screensChronicle from './conquest/screens/chronicle';
import * as screensChronicleEntry from './conquest/screens/chronicleEntry';
import * as screensCourt from './conquest/screens/court';
import * as screensRaiseHost from './conquest/screens/raiseHost';
import * as screensStoryPage from './conquest/screens/storyPage';
import * as warBoard from './conquest/screens/warBoard';
import * as screensSystem from './conquest/screens/system';
import * as shell from './conquest/shell';
import * as tour from './conquest/tour';

/**
 * Dragon Ascent's HUD scene.
 *
 * Written fresh rather than extending `UIScene`: that scene is 3,000 lines built around
 * twenty modals this mode never opens, and its pointer handler hit-tests hardcoded pixel
 * rectangles belonging to the classic screens — inheriting it would mean inheriting a large
 * dormant tap surface that silently swallows presses meant for this HUD. What is reused is
 * the component library (InkUI, ResourceBar, animations, hero portraits), which is where the
 * actual visual work lives.
 *
 * Decisions arrive as full-screen prompt cards, and the standing `ActionBar` at the bottom —
 * the same component the classic modes use — is how the player reaches those same systems on
 * their own initiative. The cards set the rhythm; the bar means you are never stuck waiting
 * for one.
 *
 * ## What this file is now
 *
 * It reached 11,115 lines and 152 methods before being split into `./conquest/`. What is left here
 * is the *scene*: every field, the Phaser lifecycle, and a forwarding method for each function
 * another module needs to reach. The drawing lives in the modules, one per area of the screen, and
 * each function there takes the scene as `self`.
 *
 * Three things to know before moving anything:
 *
 * - **The fields stay here on purpose.** The Playwright harnesses reach into a live scene by name —
 *   `ui.openPromptKey`, `ui.modalLayer`, `ui.battleUi` — so these are load-bearing property names,
 *   not private detail, whatever the encapsulation would prefer.
 * - **Modules do not import each other.** A call that crosses a module boundary goes `self.foo()`,
 *   through the forwarding method below, which is why the tree has no import cycles. A function used
 *   only inside its own file is not exported and is called directly as `foo(self)`. So a method here
 *   with no caller outside its own module does not belong here either.
 * - **The exceptions are leaves.** `conquest/layers.ts`, `conquest/battle/geometry.ts` and
 *   `conquest/constants.ts` import no sibling, so the modules import *them* directly rather than
 *   bouncing off the scene. Adding a sibling import to one of those three is what would start a cycle.
 */
export class ConquestUIScene extends Phaser.Scene {
  state!: GameState;

  ui!: InkUI;

  hud!: AscentHud;

  resourceBar!: ResourceBar;

  modalLayer!: Phaser.GameObjects.Container;

  actionBar!: ActionBar;

  inspectObjects: Phaser.GameObjects.GameObject[] = [];

  mapControlObjects: Phaser.GameObjects.GameObject[] = [];

  /** What the inspect card currently shows, so a refresh that changes nothing rebuilds nothing. */
  inspectKey = '';

  /** Whether the paused badge is up, so it is not destroyed and redrawn by every refresh. */
  pausedBadgeKey = '';

  /** What the map-control stack was drawn for (`hidden:floor:mode`). */
  mapControlsKey = '';

  /** The controls' published tap-guards, so `renderActionBar` can recompose `__hudTapBounds`
   *  every refresh without the stack itself being rebuilt. */
  mapControlBounds: Array<{ x: number; y: number; width: number; height: number }> = [];

  /** Scroll areas register a global wheel handler, so they must be destroyed explicitly. */
  activeScrollAreas: InkScrollArea[] = [];

  /** Stored so the SHUTDOWN handler can take it off: the emitter survives `scene.stop()`, and a
   *  leaked copy runs the whole refresh once more per run — and per beat during a fight. */
  readonly onStateChanged = (): void => {
    this.refresh();
  };

  openPromptKey = '';

  /**
   * Whether the lane dock is showing everything it is waiting on, or only the most urgent.
   *
   * Collapsed by default and remembered for the session rather than the page: a player who opens
   * it once is telling you they want the whole list, and being made to say so again on every lane
   * is the kind of forgetting that reads as the interface not listening.
   */
  dockExpanded = false;

  /**
   * How far the sheet has to travel on the page about to be drawn, in points, or undefined for
   * no movement at all.
   *
   * Folding rebuilds the page, so by the time the sheet is drawn in its new state the old one is
   * already gone and there is nothing left to animate *from*. The toggle therefore records the
   * distance as it flips, and `finish` starts the new sheet that far out of place and tweens it
   * home — which is the same picture as the old sheet sliding away, for a fraction of the work.
   */
  dockSlideFrom: number | undefined = undefined;

  /**
   * How the lane page now on screen was built, so the bottom sheet can rebuild it to fold.
   *
   * Set by `buildLanePage` for every lane page there is, which is why the sheet works on pages
   * that never asked for it.
   */
  lanePageBuild: (() => void) | undefined = undefined;

  /** Test-only: skip the ground bake so a harness can diff the baked field against a live one. */
  skipGroundBake = false;

  lanePauseBeforeOpen = false;
  /** The resource strip's tap door and the paper grain — moved and re-sized with the HUD's sheet. */
  ledgerHit?: Phaser.GameObjects.Rectangle;
  paper?: PaperSheet;
  /** The docked panel's left edge on the desktop — see `conquest/shell.ts`. */
  dockEdge?: Phaser.GameObjects.Graphics;
  /** The desktop's sheet-wide band, frieze and dock plate, rebuilt on resize (`buildDesktopChrome`). */
  desktopChrome?: Phaser.GameObjects.GameObject[];
  /**
   * Whether the world scene has been told to dim beside the column — see `renderActionBar`. Reset
   * on `create`: the world builds a fresh dim every run, and the first frame has to be told.
   */
  worldDimmed = false;

  /** The "world is stopped" badge, rebuilt with the bar. */
  pausedBadge?: Phaser.GameObjects.Container;

  /** The standing advisor under the readout band. Never rebuilt, only written into. */
  advisor!: AdvisorStrip;

  /** The Chronicle's ambient lines, which this mode had no surface for at all. */
  whispers!: WhisperLine;

  /** What this reign has earned for the next one, above the bar. Built once, written into. */
  inheritance!: InheritanceChip;

  /** The advisor's line, said once over the lane it points at. Built once, written into. */
  barHint!: BarHint;

  /** The Chronicle shelf currently open; kept while a story page is inspected and revisited. */
  chronicleTab: 'actions' | 'ongoing' | 'heard' | 'recorded' = 'actions';

  /**
   * The four cards a first run is shown, while they are up.
   *
   * Held rather than fired and forgotten so the scene's shutdown can take the veil down with it:
   * the tour lays a full-screen blocker, and a blocker outliving its scene deafens whatever comes
   * next. This is the same fault the front-page tour had when Settings was opened underneath it.
   */
  runTour?: Copilot;

  /**
   * Whether this scene has already offered the tour, regardless of what storage thinks.
   *
   * `maybeRunTour` is called from `renderActionBar`, which runs on every economy tick, so the only
   * thing stopping a second tour is the answer to "has it been seen". Leaving that answer entirely
   * to `hasSeenRunTour()` is a loop waiting to happen: under `?tour=1` the storage answer is
   * overridden to "no" forever, so the tour closed and immediately reopened from its first card,
   * every tick, and could not be got rid of. A latch in the scene is the honest guard — the tour is
   * offered once per run because it is about this run, and storage only decides whether it is
   * offered at all.
   */
  runTourDone = false;

  /**
   * Whether this run was started from the manual's "play a guided run" button.
   *
   * It does one thing: force the walkthrough on for a run that would not otherwise get one. A
   * *first* run is walked through in full regardless — it is exactly the player who needs it —
   * so this is only the door back in for somebody who has already played, or skipped it.
   */
  guidedRun = false;

  /**
   * Whether this run teaches at all, decided once when it starts.
   *
   * It used to be re-derived on every frame from `runTourDone || hasSeenRunTour()`, and that is
   * wrong the moment the walkthrough is more than one card: the first stage closing marks the tour
   * as seen, which then switched the remaining stages off for the rest of the run. A player got
   * the throne card explained and nothing else, ever.
   *
   * Asked once, here. Storage decides whether a run teaches; it does not get to change its mind
   * halfway through one.
   */
  tourActive = false;

  /** Stages already shown, by id. Each fires once per run. */
  tourStagesShown = new Set<string>();

  /** The clock's state before a coach card stopped it, restored when the card closes. */
  tourPauseBefore = false;

  /** Prompts answered so far, which is how the `decision` stage knows it has something to explain. */
  promptsAnswered = 0;

  /**
   * What `promptsAnswered` stood at when the scripted part of the walkthrough finished.
   *
   * The `decision` card exists to catch the player just after they have answered their first
   * real decision — it says "that was a decision" and tells them to look at what it moved on the
   * band. It fired on `promptsAnswered > 0`, and by then the count was already three: the
   * mandate, the founder and the court appointment are all prompts, and the walkthrough had just
   * walked the player through every one of them. So the card arrived immediately after "now let
   * it run", announcing a decision whose last act had been closing a coach card, and pointing at
   * a band that had not moved since.
   *
   * -1 until the hand-over, so the stage cannot fire during the scripted opening at all.
   */
  promptsAtHandover = -1;

  /**
   * The engagement the screen last opened itself for. A battle opens the lane exactly once —
   * closing it is a decision, and the fight carries on underneath — so this is keyed on the
   * battle's identity rather than on "is one live".
   */
  lastAutoOpenedBattleKey = '';

  /**
   * The war the board was drawn from, while the board is the page in the battle lane.
   *
   * The Battle lane holds one of two screens, and only one of them keeps itself current: the
   * fight updates in place off its own clock, while the board — the *war in progress* — was drawn
   * once and then left. Nothing rebuilt it, so a fight that ended left its row standing, and the
   * row's tap looked up a battle that was no longer there and returned. That is a dead control on
   * the one screen the player opens when they cannot find the war.
   *
   * Coarse on purpose: which provinces are contested, which are being fought, and which one the
   * player is standing on. Rebuilding on the headcounts would tear the rows down between press
   * and release, which is the same bug wearing the opposite coat. Empty while any other page of
   * the lane is up (the fight, the front sheet, the relief picker) — those are never rebuilt
   * under the player.
   */
  warBoardKey = '';

  /**
   * The proclamation currently unrolled over the map, and the cue id it was raised for.
   *
   * Held so the scene's shutdown can take it down — a banner outliving its scene leaves tweens
   * writing to destroyed text — and so a cue is played exactly once. The director raises a cue and
   * the scene clears it, but `refresh` runs several times a tick (the battle clock drives it at
   * `BATTLE_TICK_MS`), so "clear it as you play it" has to be atomic with the read.
   */
  waveBanner?: { skip: () => void; destroy: () => void };

  /** Cues taken off the director's queue and not yet played, in the order they were raised. */
  waveCueQueue: AscentWaveCue[] = [];

  /** The clock's state before a result banner stopped it, restored when the plate leaves. */
  wavePauseBefore = false;

  lastWaveCueId = 0;

  /** True from the screen opening itself until the first order: the world is held meanwhile. */
  battleAwaitingOrder = false;

  /**
   * The opening drum, while both sides are still choosing.
   *
   * **The fight used to be decided before it started.** The enemy's shape is drawn at `beginBattle`
   * and was on screen — in their block, on the chip rims, in the telegraph line — while the player
   * picked theirs, and the fight did not begin until they did. So the opening was a free look at
   * the answer: read their shape, tap the one that beats it, start on a two-tier advantage every
   * time. The five shapes are a rock-paper-scissors ring, and one side seeing the other's throw is
   * not a ring at all.
   *
   * Both throws are now made blind. Their shape was always random — `openingShape` hashes the
   * fight's own key — so nothing about the simulation changes; what changes is that it is *sealed*
   * until the drum runs out. While it is, an order commits but does not start the fight: the clock
   * does that, which is what stops the player buying information by simply waiting.
   */
  battleOpeningTimer?: Phaser.Time.TimerEvent;

  /** Whole seconds left on the drum, for the line in the field. */
  battleOpeningLeft = 0;

  /** The Skirmish's post-fight hold, while the beaten side runs off. See `holdArenaRout`. */
  arenaRoutHold?: Phaser.Time.TimerEvent;

  /**
   * How hard one side has been pushing the other, in [-1, 1]. Positive is ours.
   *
   * Lives on the scene rather than in the simulation on purpose: it is a *reading* of beats the
   * fight already resolved, not a new quantity for the fight to obey. See `battleLines`.
   */
  battlePress = 0;

  /** A prompt interrupted the battle screen; reopen it once the prompt is answered. */
  reopenBattleAfterPrompt = false;


  /** A tappable prompt option. Everything the player can do is one of these. */
  /** Draws the two hosts on the battle screen, reusing the map's own marker art. */
  battleItems?: MapItemRenderer;

  battleClock?: Phaser.Time.TimerEvent;

  /**
   * The live battle screen's three layers, kept apart so each can be refreshed on its own
   * schedule: the field only when the hosts on it change, the readout every beat, the standing
   * orders only when what they offer changes. Rebuilding the lot every beat is what would make
   * the orders untappable — a card destroyed between press and release never fires.
   */
  /**
   * The coronation's own state, kept off the drawing.
   *
   * Every stepper tap rebuilds the sheet through `replaceLanePage`, which empties the modal layer
   * — so anything held by the drawing is gone with it. The king being made lives here instead,
   * for as long as the rite is open, and is dropped the moment it ends.
   */
  coronationSheet?: CoronationSheet;

  battleUi?: {
    content: UIBounds;
    fieldHeight: number;
    field: Phaser.GameObjects.Container;
    readout: Phaser.GameObjects.Container;
    /** The round track above the field: the fight's clock, which nothing used to show. */
    pips: Phaser.GameObjects.Container;
    /** Per-beat casualty numbers, rising and fading. Owns nothing tappable. */
    floaters: Phaser.GameObjects.Container;
    /**
     * The dead, drawn once each and never cleared until the field is rebuilt.
     *
     * The killing floor fills up as the fight runs, so the ground itself becomes a record of how
     * hard it was — and it is still there at the end, under whoever is left standing.
     */
    fallen: Phaser.GameObjects.Graphics;
    /**
     * Where each one fell, kept apart from the graphics that draws them.
     *
     * `buildBattleField` clears the field container with `removeAll(true)` whenever the hosts on
     * it change — relief arriving, a column breaking — which destroyed the layer the dead were
     * drawn into. Measured, `fallen.active` was false while forty had supposedly been laid: they
     * were being drawn onto an object that no longer existed. The positions survive now and the
     * layer is redrawn from them.
     */
    fallenPts: Array<{ x: number; y: number; side?: 'ours' | 'theirs'; hostId?: string }>;
    fallenCount: number;
    /** The open Moment, over the field. Rebuilt only when the question changes. */
    moment: Phaser.GameObjects.Container;
    /** Which Moment is drawn, so the card is not rebuilt under the player's finger every beat. */
    momentKey: string;
    /**
     * The ground layers the bake flattened and hid.
     *
     * Kept so `verify-battle-ground-bake` can put exactly those back and diff the two pictures. It
     * cannot work the list out for itself: the mask's own source is an invisible rectangle that was
     * already hidden before the bake, and restoring that floods the field with white paper — which
     * is what the check reported as an 85% difference, twice, before this existed.
     */
    groundSources: Phaser.GameObjects.GameObject[];
    /**
     * The clip holding the land inside the frame, kept so a field rebuild can dispose it.
     *
     * Under WebGL the stencil pair are children of `field` and `clearLayer` takes them with it,
     * but the rectangle they are cut from lives off the display list — and on Canvas, where the
     * fallback geometry mask is the live mechanism, that rectangle is all there is.
     */
    groundClip?: RectClip;
    /**
     * The same, for the near foreground — which is a second bracket because it is drawn after the
     * men rather than under them (see `buildBattleForeground`). Two clips, two rectangles to
     * dispose, and `clearLayer` cannot be trusted to take either.
     */
    foregroundClip?: RectClip;
    /**
     * The baked near foreground, kept so it can be lifted back above a rebuilt host block.
     *
     * Z-order here is child order — `setDepth` is inert inside a Container — and `redrawHostBlock`
     * appends its replacement to the end. See `keepForegroundOnTop`.
     */
    foreground?: Phaser.GameObjects.RenderTexture;
    /**
     * The hosts have filled the field, so the settlement and the camp are not drawn at all.
     *
     * Decided once per rebuild in `buildBattleField` and read by `buildBattleGround`, because the
     * ground is drawn before the men and cannot ask the markers how large they came out.
     */
    sceneryHidden?: boolean;
    /** Where the two exits sit at the foot, so `buildBattleExits` never has to guess. */
    exitBounds: UIBounds;
    /**
     * The two speech bubbles over the hosts, and the line each is currently saying.
     *
     * Their own layer because `field` is rebuilt whenever the hosts on it change and a bubble must
     * survive that, and because the bubble is redrawn on a different clock from either: only when
     * the *sentence* changes, which across a whole engagement is four or five times rather than
     * once a beat.
     */
    bubbles: Phaser.GameObjects.Container;
    bubbleSaid: { ours: string; theirs: string };
    /** Where the two lines stood when the bubbles were last drawn. See `updateBattleBubbles`. */
    bubbleAt: { ours: number; theirs: number };
    /** Scene time the last shout started, so a redraw cannot cut one short. See `shoutBubble`. */
    bubbleShoutAt: number;
    /**
     * The two bubbles, kept apart so one can be replaced without the other.
     *
     * They used to share a `clearLayer`, which meant the enemy's telegraph changing tore down our
     * own bubble mid-shout — measured, the pop was dead inside 180 ms of a 380 ms tween because
     * the *other* side had said something.
     */
    bubbleOf: { ours?: Phaser.GameObjects.Container; theirs?: Phaser.GameObjects.Container };
    /**
     * A bubble that has faded on the difficulty's clock stays gone until its side SAYS something
     * new. Without this flag the next walk of the host would quietly redraw it — the liveness
     * check below reads "no bubble" as "needs one".
     */
    bubbleFaded: { ours: boolean; theirs: boolean };
    /** The fight's one red line, in the header band. Written in place, never rebuilt. */
    notice: Phaser.GameObjects.Text;
    /** The newest line of `battle.log`, repeated in the header where it can actually be read. */
    logLine: Phaser.GameObjects.Text;
    /** Where the header put the round track, so `buildBattlePips` never has to guess. */
    pipBounds: UIBounds;
    /**
     * Where each part of the fight's furniture ended up, for the coach to point at.
     *
     * Recorded as the dock lays itself out rather than recomputed by whoever wants to highlight
     * something, and for the same reason `exitBounds` is: the arithmetic is four constants deep
     * (the header band's own height, the field's measured height, `BATTLE_RAILS_HEIGHT`,
     * `BATTLE_READOUT_HEIGHT`) and a second copy of it in the tour would come apart the first time
     * anybody moved a row by three pixels. Filled every rebuild, so it is never a beat stale.
     */
    coachBounds: Partial<Record<
      'pips' | 'field' | 'rails' | 'readout' | 'stance' | 'formation', UIBounds
    >>;
    /** Both dials, fixed. They used to scroll, and Retreat sat below the fold. */
    orders: Phaser.GameObjects.Container;
    /**
     * Hand-over and leave, along the foot of the screen.
     *
     * Their own layer because `field` is rebuilt whenever the hosts on it change and these must
     * survive that, and because a hand-over flips what the left one says without anything else on
     * the screen having moved.
     */
    exits: Phaser.GameObjects.Container;
    /**
     * The relief control, pinned to our corner of the field: "send a host" while nobody is on the
     * road, and who is coming — how many, how soon — once someone is. Its own layer, rebuilt only
     * when `reliefKey` changes, for the same reason as every other tappable thing on this screen.
     */
    relief: Phaser.GameObjects.Container;
    reliefKey: string;
    rivalColor: number;
    /** Identity of the hosts drawn on the field, so relief and routs trigger a redraw. */
    fieldSignature: string;
    /** Identity of what the order cards offer, so a spent one-shot greys out. */
    orderSignature: string;
    /** Identity of what the exit chips say (`delegated:halted`), so they rebuild on that alone. */
    exitsKey: string;
    /**
     * The shape each side is *drawn standing in*, so the blocks re-arrange on the beat an order
     * lands — and only the side whose shape moved is redrawn. A formation change used to redraw
     * both hosts; the other side's block flickering for our order was pure waste.
     *
     * Separate from `fieldSignature` on purpose: that one rebuilds the ground, the camps and the
     * banners, and none of them should flicker because a block moved.
     */
    shapeShown: { ours: string; theirs: string };
    /**
     * Identity of the half of the rails a beat does not move, so it is built once per fight.
     *
     * See `buildBattleRails`: rebuilding the whole readout on the beat was two thirds of the
     * screen's per-beat cost, almost all of it re-doing work whose inputs had not changed.
     */
    railsSignature: string;
    /** The four measured lines, drawn into one graphics rather than four fresh containers. */
    railsBars?: Phaser.GameObjects.Graphics;
    /** Where the rails were laid, so the beat can re-ink them without measuring anything. */
    railsGeom?: { barW: number; readoutY: number; ourX: number; theirX: number };
    /**
     * The rails as they are DRAWN, which trails the beat: numbers count and bars slide from the
     * last beat's reading to this one's over the beat's own length, so the screen breathes
     * between exchanges instead of stepping. Undefined until the first beat is shown.
     */
    railsEased?: { ourNow: number; theirNow: number; ourMorale: number; theirMorale: number };
    /** The stamina pips, kept so a spend can fly out of them and a refusal can flash them. */
    staminaPips?: Phaser.GameObjects.Container | Phaser.GameObjects.Graphics;
    staminaAt?: { x: number; y: number };
    railsTween?: Phaser.Tweens.Tween;
    ourStrength?: Phaser.GameObjects.Text;
    theirStrength?: Phaser.GameObjects.Text;
    /**
     * Spent casualty numbers, kept to be used again.
     *
     * Two `Text` objects a beat is two canvas measures, two texture uploads and two objects for
     * the collector, 1.8 times a second for the length of a siege. They say the same six shapes
     * over and over; there is no reason to build them more than once.
     */
    floaterPool?: Phaser.GameObjects.Text[];
    /** The round track, redrawn into one graphics instead of rebuilt out of two objects a beat. */
    pipTrack?: Phaser.GameObjects.Graphics;
    pipsLeft?: Phaser.GameObjects.Text;
    /** The mark over the seam. Kept, because its pulse never ends and one a fight is plenty. */
    clashMark?: Phaser.GameObjects.Container;
    /** Whether the lines have met yet, so the hit-stop fires on the first contact only. */
    hadContact?: boolean;
    /** Marker plus the host it stands for, so its strength can be re-stamped as men fall. */
    ourMarkers: BattleMarker[];
    theirMarkers: BattleMarker[];
    geometry: { leftX: number; rightX: number; span: number; groundY: number };
    /**
     * The beat currently on screen, drained from `battle.beats`.
     *
     * The view renders from this rather than from the live battle whenever it has one: the
     * simulation runs six beats in a burst on the economy tick, and reading live state would
     * show only the last of them. Undefined means the queue has run dry and the picture has
     * caught up with the truth — which is exactly when it should show the truth.
     */
    shown?: BattleBeat;
    /** The last log line shown, so the same sentence is not re-inked every beat. */
    lastLine?: string;
    /**
     * The dock's retained handles — everything `drawBattleDock` writes per beat, so the dock
     * itself is rebuilt only when what it *offers* changes. See `battleOrderSignature`.
     */
    dock?: {
      price: Phaser.GameObjects.Text;
      arms: Phaser.GameObjects.Text;
      verdict: Phaser.GameObjects.Text;
      verdictKey: string;
      pips: Phaser.GameObjects.Graphics;
      pipsKey: string;
      pipGeom: { px: number; topY: number };
      defendBounds?: UIBounds;
      defendChosen: boolean;
      /** Whether the field has already answered the current wager (see drawBattleDock). */
      committedShown: boolean;
      defendGlow?: Phaser.GameObjects.Graphics;
      lastFlareBeat: number;
      chips: Record<string, {
        bounds: UIBounds;
        tile: Phaser.GameObjects.Image;
        verb: Phaser.GameObjects.Text;
        glyph: Phaser.GameObjects.Container;
        glyphX: number;
        glyphY: number;
        glyphScale: number;
        baseInk: number;
        baseVerbColour: string;
        held: boolean;
        walking: boolean;
        note?: Phaser.GameObjects.Text;
        noteKey: string;
        bar?: Phaser.GameObjects.Graphics;
        barBeats: number;
        gone: boolean;
        parts: Array<{
          o: Phaser.GameObjects.Components.Transform;
          hx: number;
          hy: number;
          hs: number;
        }>;
      }>;
    };
  };

  /** The draft the raise-host form is editing; reset each time the lane opens. */
  musterDraft?: MusterPlan;

  /** A plan the muster card handed to the raise form — consumed by the next `openLane('army')`. */
  musterHandover?: MusterPlan;

  /**
   * A province the map's inspect card handed to the Build lane, and which page to open on.
   *
   * The same shape as `musterHandover` above and for the same reason: the two actions a province
   * affords live inside a lane, and a button on the map has to be able to say *open that lane,
   * already on this province's governor list* without the lane needing to know who asked.
   */
  landHandover?: { landId: string; page: 'options' | 'governor' | 'focus' };

  /**
   * Set before `openLane('battle')` on a fresh fight, so the very first build is already sealed.
   * The screen used to build unsealed and be rebuilt sealed a frame later — a whole second
   * field-and-dock build whose only purpose was un-naming a shape the first build had leaked.
   */
  battleSealPending = false;

  /** Whether the two sides are still choosing, and so cannot see each other's shape. */
  get battleOpeningSealed(): boolean {
    return this.battleSealPending || (this.battleAwaitingOrder && this.battleOpeningTimer !== undefined);
  }

  /**
   * Whether the fight is standing still because the *world* is — the player's own Pause, or a
   * pause the map was left in when the screen opened. Not the opening hold: that has its own drum
   * and its own line, and ends on its own.
   */
  get battleHalted(): boolean {
    return !this.battleAwaitingOrder && (this.state.isStrategyPause || this.state.isPaused);
  }

  constructor() {
    super('ConquestUIScene');
  }

  /* ---------------------------------------------------------- Phaser lifecycle */

  init(data: { state: GameState }): void {
    this.state = data.state;
    this.inspectObjects = [];
    this.mapControlObjects = [];
    this.activeScrollAreas = [];
    this.openPromptKey = '';
    this.lanePauseBeforeOpen = false;
    this.battleUi = undefined;
    this.lastAutoOpenedBattleKey = '';
    this.warBoardKey = '';
    this.battleAwaitingOrder = false;
    this.battleSealPending = false;
    this.inspectKey = '';
    this.pausedBadgeKey = '';
    this.mapControlsKey = '';
    this.mapControlBounds = [];
    this.battleOpeningTimer?.remove();
    this.battleOpeningTimer = undefined;
    this.reopenBattleAfterPrompt = false;
    window.__hudTapBounds = [];
  }

  create(): void { shell.create(this); }

  refresh(): void { shell.refresh(this); }

  /* -------------------------- the standing screen: bar, map controls, overlays */

  renderActionBar(): void { shell.renderActionBar(this); }

  beginOverlay(key: string): void { shell.beginOverlay(this, key); }

  /**
   * Whether the world is drawn behind the current page.
   *
   * On the facade because the one screen that has to *restore* it — the war board — lives in
   * `screens/warBoard`, which `conquest/shell` already imports; reaching back the other way for
   * the function would close an import cycle for the sake of one line.
   */
  setMapVisible(visible: boolean): void { shell.setMapVisible(this, visible); }

  /**
   * How tall the province inspect block came out last render — card, gap and controls.
   *
   * A card grows to fit its own text (`InkUI.card`), so this cannot be predicted; the map controls
   * read it to keep clear of the block's top edge.
   */
  inspectBlockHeight?: number;

  /**
   * Raised by `optionCard` while a prompt page is being built, read and cleared by that page's
   * `finish`. It is what lets the *page* know it contains a control that must be held without
   * every renderer having to declare it — see `drawHoldHint`.
   */
  promptUsedHoldCards?: boolean;

  closeOverlay(): void { shell.closeOverlay(this); }

  /* ------------------------------------------------- the first-run walkthrough */

  maybeRunTour(hidden: boolean): void { tour.maybeRunTour(this, hidden); }

  tourStages(): Array<{
    id: string;
    /** May be raised while a decision card owns the screen. Only for stages about that card. */
    overCard?: boolean;
    when: () => boolean;
    steps: () => CopilotStep[];
  }> {
    return tour.tourStages(this);
  }

  /* --------------------- the lane: the sliding page every screen is drawn into */

  openLane(lane: AscentLane): void { lanesFrame.openLane(this, lane); }

  laneList(
    title: string,
    subtitle: string,
    laneOpts: {
      /** A primary action in the close button's slot, in place of Close. */
      footer?: {
        label: string;
        onTap: () => void;
        disabled?: boolean;
        /**
         * This button *is* the way out — do not pair a close beside it.
         *
         * Only true where closing the lane any other way would leave state behind: the aftermath
         * report clears `pendingAftermath` as it dismisses, so a plain close there would put the
         * same screen straight back on the player.
         */
        soleAction?: boolean;
      };
      /** A free-form control the bottom sheet carries — the court's tax dial. */
      footerWidget?: {
        height: number;
        build: (parent: Phaser.GameObjects.Container, width: number) => void;
      };
      /**
       * A checkbox pinned just above the footer button, in the same thumb reach.
       *
       * A setting the player toggles while reading belongs at the foot for the same reason
       * the battle exits were moved there: the top of a phone is where a one-handed grip
       * cannot go without shifting, and a control nobody can reach is a control nobody uses.
       * The whole row is the hit area, label included.
       */
      footerToggle?: { label: string; hint?: string; checked: boolean; onToggle: () => void };
      /**
       * A segmented choice pinned above the footer button, in the toggle's slot — for the one
       * standing setting on a page that has more than two answers.
       */
      footerPicker?: { label: string; options: string[]; note: string; selected: number; onPick: (index: number) => void };
      /** A compact, fixed tab strip above the scrolling body. */
      tabs?: {
        items: Array<{ label: string; count?: number }>;
        active: number;
        onSelect: (index: number) => void;
      };
      /**
       * What this lane is waiting on, listed at the foot in the thumb's own band. See the full
       * note on `laneOpts.dock` in `lanes/frame` for why it is at the bottom rather than the top.
       */
      dock?: {
        label?: (shown: number) => string;
        items: Array<{ label: string; hint?: string; onPress: () => void }>;
        /** Redraws this page, so the dock can open and close without the lane knowing how. */
        rebuild?: () => void;
      };
      /** A ghost "back" above the footer button, for pages one step inside a lane. */
      back?: () => void;
    } = {},
  ): {
    content: UIBounds;
    addRow: (
      opts: { title: string; subtitle: string; border: number; muted?: boolean; portrait?: Hero },
      onTap?: () => void,
    ) => void;
    addHeading: (title: string, hint?: string) => void;
    addNote: (text: string, tone?: number) => void;
    addWidget: (
      height: number,
      build: (parent: Phaser.GameObjects.Container, width: number) => number | void,
    ) => void;
    finish: () => void;
  } {
    return lanesFrame.laneList(this, title, subtitle, laneOpts);
  }

  closeLane(): void { lanesFrame.closeLane(this); }

  addStoryOpening(
    on: 'land' | 'hero' | 'army' | 'rival' | 'treasury',
    subjectId: string | undefined,
    addHeading: (label: string) => void,
    addRow: (opts: { title: string; subtitle: string; border: number }, onTap?: () => void) => void,
  ): void {
    lanesFrame.addStoryOpening(this, on, subjectId, addHeading, addRow);
  }

  replaceLanePage(build: () => void): void { lanesFrame.replaceLanePage(this, build); }

  /* ------------------------------------- the widgets a lane page is built from */

  statPanel(
    parent: Phaser.GameObjects.Container,
    width: number,
    cells: Array<{ label: string; value: string; accent?: string }>,
  ): number {
    return lanesWidgets.statPanel(this, parent, width, cells);
  }

  actionTiles(
    parent: Phaser.GameObjects.Container,
    width: number,
    tiles: Array<{ title: string; note?: string; border: number; muted?: boolean; onTap?: () => void }>,
    opts: { columns?: 1 | 2 } = {},
  ): number {
    return lanesWidgets.actionTiles(this, parent, width, tiles, opts);
  }

  segmentedRow(
    parent: Phaser.GameObjects.Container,
    width: number,
    opts: { label: string; options: string[]; note: string; selected: number; onPick: (index: number) => void },
  ): number {
    return lanesWidgets.segmentedRow(this, parent, width, opts);
  }

  showHeroPicker(opts: {
    title: string;
    subtitle?: string;
    rows: HeroPickerRow[];
    /** The confirm page's headline and lines for a row — the role, in words. */
    confirm: (row: HeroPickerRow) => { title: string; lines: string[] };
    onPick: (heroId: string) => void;
    onBack: () => void;
    /** An extra row at the foot: leave vacant, recall, take the field without a commander. */
    extra?: { title: string; subtitle: string; onTap: () => void };
  }): void {
    lanesWidgets.showHeroPicker(this, opts);
  }

  showHostPicker(opts: {
    title: string;
    subtitle?: string;
    rows: HostPickerRow[];
    confirm: (row: HostPickerRow) => { title: string; lines: string[]; danger?: boolean };
    onPick: (armyId: string, force: boolean) => void;
    onBack: () => void;
  }): void {
    lanesWidgets.showHostPicker(this, opts);
  }

  showConfirmPage(opts: {
    title: string;
    subtitle?: string;
    portrait?: Hero;
    lines: string[];
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
    onBack: () => void;
  }): void {
    lanesWidgets.showConfirmPage(this, opts);
  }

  /* ------------------------------- the prompt card, and the answer coming back */

  promptFrame(title: string, subtitle: string, opts?: { coverReadout?: boolean }): UIBounds {
    return promptsFrame.promptFrame(this, title, subtitle, opts);
  }

  choose(choiceId: string): void { promptsFrame.choose(this, choiceId); }

  promptScrollBody(
    title: string,
    subtitle: string,
    footerHeight: number,
  ): { content: UIBounds; body: Phaser.GameObjects.Container; bodyWidth: number; finish: (usedHeight: number) => void } {
    return promptsFrame.promptScrollBody(this, title, subtitle, footerHeight);
  }

  /* -------------------------------- the option card every prompt is a stack of */

  optionCard(
    bounds: UIBounds,
    opts: {
      title: string;
      body: string;
      note?: string;
      noteColor?: string;
      /** A longer hold than the rule, for the one page that asks it (the reign-end sequence). */
      holdMs?: number;
      /** Width kept clear on the right (a portrait column), so text wraps before it. */
      reserveRight?: number;
      /** Glyph drawn in a left gutter. Resolved from the option id by `iconForOption`. */
      icon?: CardIconId;
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
    },
  ): Phaser.GameObjects.Container {
    return promptsOptionCard.optionCard(this, bounds, opts);
  }

  /* ---------------------------------------------------------- prompts conquest */

  showPowerDraft(prompt: Extract<AscentPrompt, { kind: 'power-draft' }>): void { promptsConquest.showPowerDraft(this, prompt); }

  showConquerTarget(prompt: Extract<AscentPrompt, { kind: 'conquer-target' }>): void { promptsConquest.showConquerTarget(this, prompt); }

  showConquerMethod(target: ConquestTarget, notice?: string): void { promptsConquest.showConquerMethod(this, target, notice); }

  showMethodActorPicker(target: ConquestTarget, option: ConquestMethodOption, notice?: string): void { promptsConquest.showMethodActorPicker(this, target, option, notice); }

  /* ------------------------------------------------------------- prompts court */

  showHeroChoice(prompt: Extract<AscentPrompt, { kind: 'hero-choice' }>): void { promptsCourt.showHeroChoice(this, prompt); }

  showAppointment(prompt: Extract<AscentPrompt, { kind: 'court-appointment' }>): void { promptsCourt.showAppointment(this, prompt); }

  showDecreeOffer(prompt: Extract<AscentPrompt, { kind: 'decree-offer' }>): void { promptsCourt.showDecreeOffer(this, prompt); }

  showLawChoice(prompt: Extract<AscentPrompt, { kind: 'law-choice' }>): void { promptsCourt.showLawChoice(this, prompt); }

  showDoctrine(prompt: Extract<AscentPrompt, { kind: 'doctrine' }>): void { promptsCourt.showDoctrine(this, prompt); }

  showParliament(prompt: Extract<AscentPrompt, { kind: 'parliament' }>): void { promptsCourt.showParliament(this, prompt); }

  /* ------------------------------------------------------------- prompts realm */

  showEnvoy(prompt: Extract<AscentPrompt, { kind: 'envoy' }>): void { promptsRealm.showEnvoy(this, prompt); }
  showWorldEvent(prompt: Extract<AscentPrompt, { kind: 'world-event' }>): void { promptsRealm.showWorldEvent(this, prompt); }

  showMusterProposal(prompt: Extract<AscentPrompt, { kind: 'muster-proposal' }>): void { promptsRealm.showMusterProposal(this, prompt); }

  showFamine(prompt: Extract<AscentPrompt, { kind: 'famine' }>): void { promptsRealm.showFamine(this, prompt); }
  showRestoreLand(prompt: Extract<AscentPrompt, { kind: 'restore-land' }>): void {
    promptsRealm.showRestoreLand(this, prompt);
  }

  showProvinceOrder(prompt: Extract<AscentPrompt, { kind: 'province-order' }>): void {
    promptsRealm.showProvinceOrder(this, prompt);
  }

  showRivalDemand(prompt: Extract<AscentPrompt, { kind: 'rival-demand' }>): void { promptsRealm.showRivalDemand(this, prompt); }

  showEmpireResponse(prompt: Extract<AscentPrompt, { kind: 'empire-response' }>): void { promptsRealm.showEmpireResponse(this, prompt); }

  showWaveResult(prompt: Extract<AscentPrompt, { kind: 'wave-result' }>): void { promptsRealm.showWaveResult(this, prompt); }
  showHostLost(prompt: Extract<AscentPrompt, { kind: 'host-lost' }>): void { promptsRealm.showHostLost(this, prompt); }

  /* ------------------------------------------------------------ prompts router */

  renderPrompt(prompt: AscentPrompt): void { promptsRouter.renderPrompt(this, prompt); }

  /* --------------------------------------------------------------- prompts run */

  showCoronation(): void { promptsCoronation.showCoronation(this); }

  showInheritance(): void { promptsInheritance.showInheritance(this); }

  showFounder(prompt: Extract<AscentPrompt, { kind: 'founder' }>): void { promptsRun.showFounder(this, prompt); }

  showMandate(prompt: Extract<AscentPrompt, { kind: 'mandate' }>): void { promptsRun.showMandate(this, prompt); }

  heroDeckPrompt(opts: {
    title: string;
    subtitle: string;
    heroes: Hero[];
    badgeFor?: (hero: Hero) => string | undefined;
    noteFor?: (hero: Hero) => string | undefined;
    confirmLabel: string;
    ignoreLabel?: string;
    onSelect: (hero: Hero) => void;
    onIgnore?: () => void;
  }): void {
    promptsRun.heroDeckPrompt(this, opts);
  }

  showRunOver(prompt: Extract<AscentPrompt, { kind: 'run-over' }>): void { promptsRun.showRunOver(this, prompt); }
  showDynastyLevel(prompt: Extract<AscentPrompt, { kind: 'dynasty-level' }>): void { promptsRun.showDynastyLevel(this, prompt); }
  showBindCard(prompt: Extract<AscentPrompt, { kind: 'bind-card' }>): void { promptsRun.showBindCard(this, prompt); }
  showNextReign(prompt: Extract<AscentPrompt, { kind: 'next-reign' }>): void { promptsRun.showNextReign(this, prompt); }

  /* ------------------------------------------------------------- prompts story */

  showStoryBeat(prompt: Extract<AscentPrompt, { kind: 'story-beat' }>): void { promptsStory.showStoryBeat(this, prompt); }

  /* ----------------------------------------------------------- screens affairs */

  showAffairsScreen(): void { screensAffairs.showAffairsScreen(this); }

  /* --------------------------------------------------------- screens aftermath */

  dismissStoryOutcome(): void { screensAftermath.dismissStoryOutcome(this); }

  showStoryOutcome(report: NonNullable<GameState['lastStoryOutcome']>): void { screensAftermath.showStoryOutcome(this, report); }

  openAftermath(): void { screensAftermath.openAftermath(this); }

  dismissAftermath(): void { screensAftermath.dismissAftermath(this); }

  /* -------------------------------------------------------------- screens army */

  showArmyScreen(): void { screensArmy.showArmyScreen(this); }

  showArmyDetail(armyId: string): void { screensArmy.showArmyDetail(this, armyId); }

  /* ------------------------------------------------------ screens army targets */

  showCommanderPicker(armyId: string): void { screensArmyTargets.showCommanderPicker(this, armyId); }

  showMarchTargets(armyId: string): void { screensArmyTargets.showMarchTargets(this, armyId); }

  showAttackTargets(armyId: string): void { screensArmyTargets.showAttackTargets(this, armyId); }

  showFollowTargets(armyId: string): void { screensArmyTargets.showFollowTargets(this, armyId); }

  showHuntTargets(armyId: string): void { screensArmyTargets.showHuntTargets(this, armyId); }

  /* ------------------------------------------------------------- screens build */

  showBuildScreen(): void { screensBuild.showBuildScreen(this); }

  showClaimTargets(): void { screensBuild.showClaimTargets(this); }

  showBuildOptions(landId: string): void { screensBuild.showBuildOptions(this, landId); }

  showFocusPicker(landId: string): void { screensBuild.showFocusPicker(this, landId); }

  showGovernorPicker(landId: string): void { screensBuild.showGovernorPicker(this, landId); }

  showLedgerScreen(): void { screensBuild.showLedgerScreen(this); }

  /* --------------------------------------------------------- screens chronicle */

  showChronicleScreen(): void { screensChronicle.showChronicleScreen(this); }

  showChronicleEntry(entryId: string): void { screensChronicleEntry.showChronicleEntry(this, entryId); }

  /* ------------------------------------------------------------- screens court */

  showHeroesScreen(): void { screensCourt.showHeroesScreen(this); }

  showCourtScreen(): void { screensCourt.showCourtScreen(this); }

  showSeatPicker(seat: CourtPositionId): void { screensCourt.showSeatPicker(this, seat); }

  /* -------------------------------------------------------- screens raise host */

  showRaiseHostForm(): void { screensRaiseHost.showRaiseHostForm(this); }

  /* -------------------------------------------------------- screens story page */

  showStoryPage(storyId: string): void { screensStoryPage.showStoryPage(this, storyId); }

  /* ------------------------------------------------------------ screens system */

  showSystemMenu(): void { screensSystem.showSystemMenu(this); }

  showCodex(): void { screensSystem.showCodex(this); }

  /* ------------------------------------------------------------ battle bubbles */

  updateBattleBubbles(battle: AscentBattle): void { battleBubbles.updateBattleBubbles(this, battle); }

  /* --------------------------------------------------------------- battle camp */

  battleCamp(x: number, y: number, color: number, seed = 7, s = 1): Phaser.GameObjects.Container { return battleCamp.battleCamp(this, x, y, color, seed, s); }

  /* -------------------------------------------------------------- battle clock */

  updateBattle(): void { battleClock.updateBattle(this); }

  drainBattleBeat(): void { battleClock.drainBattleBeat(this); }

  holdBattleClock(ms: number): void { battleClock.holdBattleClock(this, ms); }

  startBattleClock(): void { battleClock.startBattleClock(this); }

  stopBattleClock(): void { battleClock.stopBattleClock(this); }

  /* --------------------------------------------------------------- battle dock */

  buildBattleRelief(battle: AscentBattle): void { battleDock.buildBattleRelief(this, battle); }

  showReinforcePicker(onBack: () => void): void { battleDock.showReinforcePicker(this, onBack); }

  buildBattleExits(battle: AscentBattle): void { battleDock.buildBattleExits(this, battle); }

  /* ------------------------------------------------------------ battle effects */

  spawnBattleArrows(beat: BattleBeat): void { battleEffects.spawnBattleArrows(this, beat); }

  spawnBattleFloaters(beat: BattleBeat): void { battleEffects.spawnBattleFloaters(this, beat); }

  battleClashMark(): Phaser.GameObjects.Container { return battleEffects.battleClashMark(this); }

  strikeClash(): void { battleEffects.strikeClash(this); }

  /* -------------------------------------------------------------- battle field */

  battleFieldSignature(battle: AscentBattle): string { return battleField.battleFieldSignature(this, battle); }

  buildBattleField(battle: AscentBattle): void { battleField.buildBattleField(this, battle); }

  routMarker(hostId: string): void { battleField.routMarker(this, hostId); }

  slideMarkers(
    markers: BattleMarker[],
    x: number,
    shove: number,
    sizes: Map<string, number>,
  ): void {
    battleField.slideMarkers(this, markers, x, shove, sizes);
  }

  redrawHostBlock(entry: BattleMarker, men: number): void { battleField.redrawHostBlock(this, entry, men); }

  /* ----------------------------------------------------------- battle geometry */

  battleScaleAt(y: number): number { return battleGeometry.battleScaleAt(this, y); }

  /* ------------------------------------------------------------- battle ground */

  buildBattleGround(battle: AscentBattle): void { battleGround.buildBattleGround(this, battle); }

  buildBattleForeground(battle: AscentBattle): void { battleGround.buildBattleForeground(this, battle); }

  layFallen(beat: BattleBeat): void { battleGround.layFallen(this, beat); }

  bakeBattleGround(from: number, isForeground = false): void { battleGround.bakeBattleGround(this, from, isForeground); }

  /* ------------------------------------------------------------- battle moment */

  buildBattleMoment(battle: AscentBattle): void { battleMoment.buildBattleMoment(this, battle); }

  /* ------------------------------------------------------------- battle orders */

  battleOrderSignature(battle: AscentBattle): string { return battleOrders.battleOrderSignature(this, battle); }

  buildBattleOrders(battle: AscentBattle): void { battleOrders.buildBattleOrders(this, battle); }

  drawBattleDock(battle: AscentBattle): void { battleOrders.drawBattleDock(this, battle); }

  stampFormationChip(bounds: UIBounds): void { battleOrders.stampFormationChip(this, bounds); }

  /* -------------------------------------------------------------- battle rails */

  buildBattleRails(battle: AscentBattle): void { battleRails.buildBattleRails(this, battle); }

  updateBattleRails(battle: AscentBattle): void { battleRails.updateBattleRails(this, battle); }

  /* -------------------------------------------------------------- battle shell */

  maybeAutoOpenBattle(): boolean { return battleShell.maybeAutoOpenBattle(this); }

  releaseBattleHold(): void { battleShell.releaseBattleHold(this); }

  toggleBattlePause(): void { battleShell.toggleBattlePause(this); }

  resumeBattleForOrder(): void { battleShell.resumeBattleForOrder(this); }

  showBattle(): void { battleShell.showBattle(this); }
  /** The fronts board on its own — the Battle lane's other half. See `warBoard`. */
  showWarBoard(): void { warBoard.showWarBoard(this); }

  buildBattlePips(battle: AscentBattle): void { battleShell.buildBattlePips(this, battle); }

  updateBattleLogLine(battle: AscentBattle): void { battleShell.updateBattleLogLine(this, battle); }

  updateBattleNotice(battle: AscentBattle): void { battleShell.updateBattleNotice(this, battle); }
}
