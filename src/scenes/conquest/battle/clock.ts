/**
 * The beat pump and the redraw dispatcher — the two halves of one clock.
 *
 * `startBattleClock` reschedules itself rather than looping so a screen behind the fight can play
 * its backlog at 0.55 of a beat instead of skipping (skipping was the visible jump on the rails);
 * `drainBattleBeat` takes exactly one beat off the queue; `updateBattle` then decides what that
 * beat is allowed to cost — field, rails, orders, formation, log line and Moment all compare
 * their signature in this one place, and markers are slid rather than replaced so a focus target
 * survives a press. Only contact and a break interrupt the cadence, for `BATTLE_HIT_STOP_MS`.
 *
 * Drain before draw: `tick` takes the beat first, so the frame the rest of the refresh reads is
 * the one just taken. `updateBattle` also runs off `refresh` — on any state change an order
 * causes — so nothing in it may assume a beat has passed. Outside its own re-arm the clock is
 * only ever stopped from `conquest/shell.ts`, by `releaseOverlay` and by the SHUTDOWN handler;
 * miss either and it beats on against a lane that is gone.
 */
import Phaser from 'phaser';
import { battleBeatsPerTick, battleTickMs } from '../../../game/battleOptions';
import { ourHosts, theirHosts } from '../../../systems/ascent/BattleSystem';
import { BATTLE_HIT_STOP_MS, ARENA_ROUT_HOLD_MS } from '../../../game/ascentConfig';
import type { BattleBeat } from '../../../state/types';
import { hostSize } from '../constants';
import { battleFrame, battleLines, battleRailsSignature } from './geometry';
import { clearLayer } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { startBattleMusic, updateBattleMusic } from './music';
import { announceRelief, hostsJoined } from './relief';

/**
 * Takes the input off a container and everything under it, leaving the picture alone.
 *
 * `setVisible(false)` would also stop the input, and does not leave the picture alone: on the
 * battle screen the controls are the lower half of the paper, so hiding them shows whatever scene
 * is still resident behind this one.
 */
function disarm(object: Phaser.GameObjects.GameObject): void {
  object.disableInteractive();
  const children = (object as Phaser.GameObjects.Container).list;
  if (Array.isArray(children)) {
    for (const child of children) disarm(child);
  }
}

/**
 * Brings the open battle screen up to date with the fight underneath it.
 *
 * Called from `refresh`, so it runs on the battle's own clock *and* on any state change an
 * order causes — a posture pressed redraws its badge immediately rather than up to a beat
 * later. Each layer decides for itself whether it needs rebuilding; the markers are moved
 * rather than replaced so their focus targets survive a press.
 */
export function updateBattle(self: ConquestUIScene): void {
  const ui = self.battleUi;
  const battle = self.state.ascent?.activeBattle;
  if (!ui) return;
  if (!battle) {
    if (holdArenaRout(self)) return;
    self.closeLane();
    return;
  }

  const frame = battleFrame(self, battle);
  // The bed follows the field: as men fall the music thins with them.
  updateBattleMusic(self, battle);

  const fieldSignature = self.battleFieldSignature(battle);
  if (fieldSignature !== ui.fieldSignature) {
    // Who is new on the field, read before the rebuild forgets. Nothing on the opening build —
    // the fight has not said anything yet — and nothing on a field the ground bake has reset.
    const joined = ui.fieldSignature ? hostsJoined(ui.fieldSignature, fieldSignature) : undefined;
    self.buildBattleField(battle);
    if (joined) announceRelief(self, battle, joined);
  } else {
    // The shove is what contact looks like: once the lines meet they press into each other
    // instead of gliding, so the picture reads as a fight rather than a chart.
    const lines = battleLines(self, frame.ourAdvance, frame.theirAdvance);
    // Touching, as *drawn*, not as the advances define it.
    //
    // The two definitions are not the same and the gap between them was a dead window. The
    // advances sum to 1 at contact, but the drawn lines are held apart by the seam gap — which
    // is now measured off the blocks and so is wider than it used to be — so for the beat or
    // two before the sum reaches 1, the positions were already pinned by the clamp while the
    // shove was still switched off. Nothing moved at all. Measured on a real fight: 692 ms of
    // a completely still field in the middle of an engagement.
    const meeting = lines.met || frame.ourAdvance + frame.theirAdvance >= 1;
    // Headcounts come off the beat being shown when there is one, so the strength stamped on a
    // column belongs to the same moment as the position it is standing in.
    const sizes = frame.hostMen ?? new Map(
      [...ourHosts(self.state, battle), ...theirHosts(self.state, battle)]
        .map((host) => [host.id, hostSize(host)] as const),
    );
    self.slideMarkers(ui.ourMarkers, lines.ourX, meeting ? 4 : 0, sizes);
    self.slideMarkers(ui.theirMarkers, lines.theirX, meeting ? -4 : 0, sizes);
  }

  // The rails split in two: the fight's half is rebuilt only when the fight changes under it,
  // and the beat's half is two strings and one graphics.
  if (battleRailsSignature(battle) !== ui.railsSignature) self.buildBattleRails(battle);
  self.updateBattleRails(battle);
  self.buildBattlePips(battle);

  // Only when the line actually changes: re-inking the same two lines every beat makes the
  // ribbon flicker, and the newest line needs to hold long enough to be read.
  const newest = battle.log[battle.log.length - 1];
  if (newest !== ui.lastLine) {
    ui.lastLine = newest;
    self.updateBattleLogLine(battle);
  }

  // The men stand up in the new shape on the beat it lands, and not before: a host that
  // re-arranged the instant the order was given would make the walk free, and paying for the
  // walk is the whole decision the fast dial is built around.
  //
  // Per host through `redrawHostBlock` rather than by rebuilding the field: the field carries the
  // ground, the camps and the banners, and none of those have any business flickering because a
  // block moved.
  // Per side, not both: our order re-arranging *their* block was pure churn. While the opening
  // drum seals the field, their drawn shape is '?', and the seal lifting is itself the change
  // that redraws them — `redrawHostBlock` picks the sealed/unsealed shape at call time.
  const oursShape = battle.ourFormation;
  const theirsShape = self.battleOpeningSealed ? '?' : battle.theirFormation;
  const redrawSide = (entries: typeof ui.ourMarkers): void => {
    entries.forEach((entry) => {
      if (entry.routed || entry.arriving) return;
      const host = self.state.armies.find((army) => army.id === entry.hostId);
      if (host) self.redrawHostBlock(entry, hostSize(host));
    });
  };
  if (oursShape !== ui.shapeShown.ours) {
    ui.shapeShown.ours = oursShape;
    redrawSide(ui.ourMarkers);
  }
  if (theirsShape !== ui.shapeShown.theirs) {
    ui.shapeShown.theirs = theirsShape;
    redrawSide(ui.theirMarkers);
  }

  if (self.battleOrderSignature(battle) !== ui.orderSignature) {
    self.buildBattleOrders(battle);
  }
  // The exits' own clock: the hand-over chip is two chips wearing one slot and the pause chip
  // flips to Resume — those two flags are all four panels ever change for.
  if (`${battle.delegated ? 1 : 0}:${self.battleHalted ? 1 : 0}` !== ui.exitsKey) {
    self.buildBattleExits(battle);
  }
  // The per-beat readings — price, pips, notes, bars, the landing flare — write into the
  // standing dock rather than rebuilding it. See `drawBattleDock`.
  self.drawBattleDock(battle);

  self.updateBattleBubbles(battle);
  self.updateBattleNotice(battle);
  self.buildBattleRelief(battle);

  // Rebuilt only when the question or its clock changes — never every beat, because a card
  // destroyed between press and release never fires.
  //
  // Exactly the two parts `buildBattleMoment` writes, and no more: it seeds `ui.momentKey` itself,
  // so a third part here missed on every fight opened onto a Moment already standing — the card was
  // torn down and its 3500 ms drain bar restarted from full one beat (875 ms) after the screen came
  // up. `battle.round` was that third part and could never move anyway: `advanceBattle` holds the
  // fight for as long as the question stands.
  const momentKey = battle.moment ? `${battle.moment.id}:${battle.moment.raisedAtBeat}` : '';
  if (momentKey !== ui.momentKey) {
    self.buildBattleMoment(battle);
    ui.momentKey = momentKey;
  }
}

/**
 * Takes one beat off the queue and shows it.
 *
 * This is the whole of the fix for a fight that used to arrive in four frozen jumps. The
 * simulation still resolves `BATTLE_BEATS_PER_TICK` beats in a burst on the economy tick — it
 * has to, or every mode's regression fingerprint moves — but the screen no longer *reads* the
 * burst. It reads the record of it, one moment per interval.
 *
 * When the queue is empty the view falls back to live state, which is the right answer: it
 * means the picture has caught up with the truth.
 */
export function drainBattleBeat(self: ConquestUIScene): void {
  const ui = self.battleUi;
  const battle = self.state.ascent?.activeBattle;
  if (!ui || !battle) return;
  const queue = battle.beats;
  if (!queue || queue.length === 0) {
    ui.shown = undefined;
    return;
  }
  // One beat, always. A backlog is played faster by the clock (`startBattleClock`), never
  // skipped: the skip was the visible jump on the rails.
  ui.shown = queue.shift();
  if (ui.shown) {
    self.spawnBattleFloaters(ui.shown);
    self.spawnBattleArrows(ui.shown);
    self.layFallen(ui.shown);
    reactToBeat(self, ui.shown);
  }
}

/**
 * The two moments in a fight that are worth interrupting the rhythm for.
 *
 * `BattleBeat.broke` has been recorded since the buffer was written — its own doc comment calls
 * it "the moment worth a shake" — and nothing has ever read it. Contact was the same: the beat
 * where two lines meet arrived at exactly the cadence of the beat before it and the one after,
 * so the most violent thing on the screen was also the least remarkable.
 *
 * A hit-stop is the cheapest way to say *that mattered*: the clock holds for a fraction of a beat
 * and the picture sits still. It reads as weight rather than as a stutter because it happens only
 * on contact and on a break — measured across a fight, three or four times, never twice in a row.
 */
function reactToBeat(self: ConquestUIScene, beat: BattleBeat): void {
  const ui = self.battleUi;
  if (!ui) return;

  // Who won this exchange, as ground.
  //
  // The simulation already decides it — one side loses more men than the other — and the field
  // threw the answer away, because after contact `ourAdvance` and `theirAdvance` never move
  // again. Accumulated rather than set, so a run of won exchanges walks the line across the
  // field and one bad beat does not undo four good ones. Clamped, because the seam is clamped:
  // past the band the picture stops being a fight and becomes a rout, which the rout itself
  // already draws.
  const traded = beat.ourLoss + beat.theirLoss;
  if (traded > 0) {
    const won = (beat.theirLoss - beat.ourLoss) / traded;
    self.battlePress = Math.max(-1, Math.min(1, self.battlePress * 0.72 + won * 0.5));
  }

  const met = beat.ourAdvance + beat.theirAdvance >= 1;
  const firstContact = met && !ui.hadContact;
  if (firstContact) ui.hadContact = true;
  // Only once they are actually touching, and only when the exchange cost somebody something —
  // a ring struck over two lines still walking toward each other is a lie about the picture.
  if (met && traded > 0) self.strikeClash();

  const broke = beat.broke ?? [];
  if (broke.length > 0) {
    // A line breaking shakes the field, not the whole screen: the rails and the dock have to stay
    // readable, and a player reaching for Rally at exactly this moment should not have the button
    // move under their thumb.
    self.tweens.add({
      targets: [ui.field, ui.floaters],
      x: { from: -3, to: 0 },
      duration: 220,
      ease: 'Elastic.easeOut',
    });
    // And the hosts that broke turn away and run off their own edge.
    for (const id of broke) self.routMarker(id);
  }

  // Through the scene's own method, not the module function beside it. They are the same code,
  // but `verify-battle-juice` counts the hit-stop by wrapping `ui.holdBattleClock` — and a call
  // that goes straight to the local binding is invisible to it, so the check reported a working
  // feature as missing (0 holds) for as long as this line read `holdBattleClock(self, …)`.
  if (firstContact || broke.length > 0) self.holdBattleClock(BATTLE_HIT_STOP_MS);
}

/** Holds the beat clock for a moment without losing its cadence afterwards. */
export function holdBattleClock(self: ConquestUIScene, ms: number): void {
  const clock = self.battleClock;
  if (!clock) return;
  // Remembered for the re-arm in `startBattleClock`, which is the only thing that can hold a beat
  // asked for from inside the beat itself.
  self.battleHoldUntil = Math.max(self.battleHoldUntil ?? 0, self.time.now + ms);
  if (clock.paused || clock.hasDispatched) return;
  clock.paused = true;
  self.time.delayedCall(ms, () => {
    if (self.battleClock === clock) clock.paused = false;
  });
}

/**
 * Keeps the Skirmish's field on screen while the beaten side runs off it.
 *
 * `routHostBlock` carries a broken host away over `BATTLE_TICK_MS * 2`, and until now nobody had
 * ever seen it end: when the last host on a side breaks, the fight resolves inside the same tick,
 * `finishBattle` clears `activeBattle`, and the very next `updateBattle` closed the lane and
 * killed every tween on it. The arena then swapped the whole scene for its report. About a
 * second of animation, shown for a frame or two of it.
 *
 * Only the arena holds. In a real run the fight is one thing happening among many — a wave is
 * still walking in, the economy is still running, and the aftermath card is the thing that wants
 * the player's attention next — so stopping the map to watch an animation would be the tail
 * wagging the dog. The Skirmish exists to *look at the fight*, and it is the one place where the
 * last second of one is the point.
 *
 * Returns true while the hold is running, which is the caller's signal not to close the lane.
 * The dock goes with the fight: an orders card still standing over a finished battle is a set of
 * buttons that resolve against nothing.
 */
function holdArenaRout(self: ConquestUIScene): boolean {
  if (!self.state.ascent?.arena) return false;
  if (self.arenaRoutHold) return true;

  // The dock is dimmed and disarmed, not hidden, and the Moment card is taken away entirely.
  //
  // Both are questions put to a battle that no longer exists: an orders card over a finished
  // fight is a row of buttons that resolve against nothing, and a Moment still counting down
  // "The King decides in 1" is worse, because it implies a choice the result has already made.
  //
  // Hiding them was the first attempt and it punched a hole in the page: the cards *are* the
  // bottom half of this screen's paper, so with them gone the menu still resident behind the
  // whole thing showed through — "Classic Modes" and "Buy me a coffee" reading faintly under a
  // battlefield. Dimming keeps the sheet whole and still says plainly that the controls are
  // spent.
  const ui = self.battleUi;
  if (ui) {
    clearLayer(self, ui.moment);
    for (const dock of [ui.orders, ui.exits]) {
      // Shown again first: `buildBattleMoment` hides the orders dock while a Moment stands, and a
      // fight that ends on one would otherwise hold a screen with its whole middle missing.
      dock.setVisible(true);
      // 0.7, not the 0.3 that reads as "disabled" on a normal page. These cards *are* the
      // lower half of this sheet, and the lane behind them is translucent, so anything darker
      // let the menu still resident behind the game show through between the rows.
      dock.setAlpha(0.7);
      disarm(dock);
    }
  }

  // **Set the losers running, here, rather than waiting for a beat that will never arrive.**
  //
  // The flee is normally driven by `beat.broke`, and the screen runs behind the simulation:
  // `BATTLE_BEATS_PER_TICK` beats are produced per tick and shown one per `BATTLE_TICK_MS`. So
  // the beat that breaks the last host is still queued when `finishBattle` clears the battle out
  // from under it, and the UI never sees the one beat the whole animation hangs on. Holding the
  // field without this showed a frozen line for two seconds, which is worse than cutting away.
  //
  // Read off the record rather than the beats, because the record is what survived: the side
  // named in `outcome` is the side that broke. A fight that ended `spent` or `retreat` had nobody
  // rout, and correctly leaves both lines standing where they stopped.
  const record = self.state.ascent.battleHistory?.[self.state.ascent.battleHistory.length - 1];
  const routing = record?.outcome === 'we-rout' ? ui?.ourMarkers
    : record?.outcome === 'they-rout' ? ui?.theirMarkers
      : undefined;
  for (const entry of routing ?? []) {
    if (!entry.routed) self.routMarker(entry.hostId);
  }

  self.arenaRoutHold = self.time.delayedCall(ARENA_ROUT_HOLD_MS, () => {
    self.arenaRoutHold = undefined;
    if (self.openPromptKey === 'lane:battle') self.closeLane();
  });
  return true;
}

/**
 * Beats the screen forward.
 *
 * The fight belongs to the world — `advanceBattle` runs it from the economy tick, whether or
 * not anyone is watching — so this clock only asks the screen to catch up. Leaving the screen
 * no longer stops the siege, and coming back shows where it got to.
 */
export function startBattleClock(self: ConquestUIScene): void {
  stopBattleClock(self);
  // Self-rescheduling rather than a loop, so each beat can choose its own length. The player's
  // dial sets the base (paired with `battleBeatsPerTick` so the screen drains a season's beats
  // inside the season that produced them — see `battleOptions`); a screen that has fallen
  // behind the fight plays the backlog FASTER instead of skipping beats. Skipping was the
  // "jump": a loss number, a morale bar and a host's position all moving two steps in one.
  const tick = (): void => {
    // Beat first, then draw: the frame the rest of the refresh reads is the one just taken.
    const hadBeat = (self.state.ascent?.activeBattle?.beats?.length ?? 0) > 0;
    drainBattleBeat(self);
    self.refresh();
    // The refresh above can close the lane (fight resolved, a prompt arrived). `stopBattleClock`
    // removed the *stored* handle — which is this very timer, already executing — so without this
    // check the re-arm below installs a fresh clock on a lane that is gone, and it beats a full
    // refresh against nothing until the next overlay replaces it.
    if (!self.battleUi || self.openPromptKey !== 'lane:battle') return;
    const queued = self.state.ascent?.activeBattle?.beats?.length ?? 0;
    const hurry = queued > battleBeatsPerTick() * 2 ? 0.55 : queued > battleBeatsPerTick() ? 0.75 : 1;
    // A dry pump polls, it does not sleep. Production and drain run at exactly the same rate, so
    // any timer jitter leaves the queue empty for a moment — and a pump that then waited a whole
    // beat showed the late-arriving burst up to 875 ms after it existed. Checking again quickly
    // costs a timer; the still frame it prevents was the visible hitch.
    const wait = hadBeat ? battleTickMs() * hurry : battleTickMs() * 0.3;
    // A hold asked for during this very beat — contact, a break, relief — lands on the re-arm.
    // The timer that asked is the one executing, and pausing a one-shot that has already fired
    // does nothing: `holdBattleClock` paused the fired timer, the re-arm ran at full cadence, and
    // the hit-stop the screen was credited with never held a frame.
    const hold = Math.max(0, (self.battleHoldUntil ?? 0) - self.time.now);
    self.battleClock = self.time.delayedCall(Math.round(wait + hold), tick);
  };
  self.battleClock = self.time.delayedCall(battleTickMs(), tick);
}

export function stopBattleClock(self: ConquestUIScene): void {
  self.battleClock?.remove();
  self.battleClock = undefined;
}
