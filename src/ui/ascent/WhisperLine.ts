import { addConquestUiIcon } from '../conquestUiIcons';
import Phaser from 'phaser';
import { GAME_WIDTH } from '../../game/constants';
import type { GameEvent, GameState } from '../../state/types';
import { markControlBorn, releaseNotOwnedBy, setContainerInputEnabled } from '../inputGeneration';
import { INK_UI } from '../InkUI';
import { PIGMENT } from '../ink/palette';
import { UI_FONT } from '../fonts';

const SIDE = 10;
const WIDTH = GAME_WIDTH - SIDE * 2;
const PAD = 9;
/** Under the advisor at 435, so the two never fight; above the map, below any modal. */
const DEPTH = 434;

/** How long a line holds before it fades, in ms. Long enough to read twice in Vietnamese. */
const HOLD_MS = 4500;
const FADE_MS = 420;
/** The gap between one line leaving and the next arriving. */
const GAP_MS = 700;
/**
 * How many unshown whispers may queue.
 *
 * A tick can fire two, and a paused run can bank a handful more while a prompt is up. Past this
 * the oldest are dropped rather than shown late: a line about a season that ended four seasons
 * ago reads as a bug, and the Chronicle's "Đã nghe" list keeps them all anyway.
 */
const MAX_QUEUE = 4;

/**
 * The Chronicle, out loud.
 *
 * **The problem it solves.** Whispers — 43% of the entire story catalogue — were never rendered
 * in this mode at all. `whisper()` calls `pushToast`, which writes `state.message`,
 * `state.toasts` and `state.eventLog`; all three are read only by `UIScene`, and Ascent runs
 * `ConquestUIScene`, which reads none of them. So every ambient line a story spoke was scored,
 * drawn, translated and thrown away, and a player could go a whole run hearing only the handful
 * of beats loud enough to stop the world. That is exactly the report: *one question, and the rest
 * was just story*.
 *
 * The same failure and the same fix as the invasion banner (`waveBanner.ts`): a line in a strip
 * nobody was showing, given a surface of its own.
 *
 * **One line at a time, and it never stacks.** A feed that piles up is a feed nobody reads, and
 * two lines of prose from two different stories at once is worse than either alone. Whispers
 * queue, briefly, and are dropped rather than shown stale.
 *
 * **It is a door.** Every whisper has a forty-to-ninety word `scene` written for it, and until
 * this existed there was no way to reach it. Pressing the line opens the story it came from.
 */
export class WhisperLine {
  private root: Phaser.GameObjects.Container;
  private chevron: Phaser.GameObjects.Image;
  private skin: Phaser.GameObjects.Graphics;
  private line: Phaser.GameObjects.Text;
  private hit: Phaser.GameObjects.Rectangle;

  private queue: GameEvent[] = [];
  private showing?: GameEvent;
  /** Ids already queued or shown, so a re-render never replays the log. */
  private seen = new Set<string>();
  private primed = false;
  private nextAt = 0;
  private hideAt = 0;
  private top = 0;
  private height = 26;
  private hidden = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onOpen: (storyId: string) => void,
  ) {
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setAlpha(0);
    this.skin = scene.add.graphics();
    this.chevron = addConquestUiIcon(scene, 'chevron-up', 12).setAngle(90);
    this.line = scene.add.text(SIDE + PAD + 13, 0, '', {
      color: '#4a3b28',
      fontFamily: UI_FONT,
      fontSize: '11px',
      lineSpacing: 2,
      // Room for the mark on the left and the chevron on the right. Every one of these lines is
      // longer in Vietnamese than in English, so the strip wraps and grows rather than clipping.
      wordWrap: { width: WIDTH - PAD * 2 - 26 },
    });
    this.hit = scene.add.rectangle(SIDE, 0, WIDTH, this.height, 0x000000, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    markControlBorn(this.hit);
    this.hit.on('pointerup', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      if (releaseNotOwnedBy(this.hit)) return;
      const ref = this.showing?.ref;
      if (!ref) return;
      // Taken down on the way out. Coming back from the story page to a line still counting down
      // is the page arguing with itself about whether it was read.
      this.dismiss();
      this.onOpen(ref.storyId);
    });
    this.root.add([this.skin, this.line, this.chevron, this.hit]);
    // Its own clock, because the economy tick is far too coarse for a hold-and-fade — a season
    // can be several seconds and the strip has to come and go inside one.
    this.clock = scene.time.addEvent({ delay: 120, loop: true, callback: () => this.pump() });
  }

  /** The rectangle the world scene underneath must not read as a tap on the map. */
  tapBounds(): Array<{ x: number; y: number; width: number; height: number }> {
    if (!this.showing || this.hidden) return [];
    return [{ x: SIDE, y: this.top, width: WIDTH, height: this.height }];
  }

  setVisible(visible: boolean): void {
    this.hidden = !visible;
    // Deliberately not cleared: a whisper that arrived while a card was up is still worth saying
    // once the card is answered. It waits rather than being lost.
    this.root.setVisible(visible);
    // Hiding a Phaser container leaves its hit areas live — see `setContainerInputEnabled`.
    setContainerInputEnabled(this.root, visible);
    if (this.hit?.input) this.hit.input.enabled = visible;
  }

  /**
   * Reads new story lines out of the log and parks the strip under the advisor.
   *
   * `top` is passed in rather than computed because the advisor's height follows its own text and
   * doubles when it is opened — a fixed offset would put this through the middle of it.
   */
  render(state: GameState, top: number): void {
    this.top = top;
    for (const entry of state.eventLog ?? []) {
      if (!entry.ref || this.seen.has(entry.id)) continue;
      this.seen.add(entry.id);
      // The first pass only takes the log's measure. A save loaded mid-run holds up to a hundred
      // entries, and replaying a dynasty's worth of whispers at a player who has just pressed
      // Continue is not a feature.
      if (!this.primed) continue;
      this.queue.push(entry);
    }
    this.primed = true;
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    // Repaint rather than merely re-park: the advisor above grows and shrinks with its own text,
    // so a live strip has to follow it down the screen mid-hold.
    if (this.showing) this.draw();
  }

  /** The 120 ms pump above — stored because the scene clock does not die with this widget. */
  private clock?: Phaser.Time.TimerEvent;

  destroy(): void {
    this.clock?.remove();
    this.clock = undefined;
    this.root.destroy();
  }

  private pump(): void {
    const now = this.scene.time.now;
    if (this.showing) {
      if (now >= this.hideAt) this.dismiss();
      return;
    }
    if (this.hidden || now < this.nextAt || this.queue.length === 0) return;
    this.showing = this.queue.shift();
    this.draw();
    this.hideAt = now + HOLD_MS;
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: FADE_MS, ease: 'Quad.easeOut' });
  }

  private dismiss(): void {
    if (!this.showing) return;
    this.showing = undefined;
    this.nextAt = this.scene.time.now + FADE_MS + GAP_MS;
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: FADE_MS, ease: 'Quad.easeIn' });
  }

  private draw(): void {
    const entry = this.showing;
    if (!entry) return;
    this.line.setText(entry.text);
    this.layout();

    const accent = entry.kind === 'threat'
      ? INK_UI.cinnabar
      : entry.kind === 'reward' || entry.kind === 'milestone'
        ? INK_UI.gold
        : PIGMENT.mucSoft;

    this.skin.clear();
    this.skin.fillStyle(INK_UI.parchment, 0.94);
    this.skin.fillRoundedRect(SIDE, this.top, WIDTH, this.height, 7);
    this.skin.lineStyle(1, INK_UI.parchmentDark, 1);
    this.skin.strokeRoundedRect(SIDE, this.top, WIDTH, this.height, 7);
    // A rule down the left in the line's own tone, and a small open quote mark: the two things
    // that say "somebody is talking about you" without being read.
    this.skin.fillStyle(accent, 0.7);
    this.skin.fillRect(SIDE, this.top + 5, 2.5, this.height - 10);

    const cy = this.top + this.height / 2;
    this.skin.fillStyle(accent, 0.85);
    this.skin.fillCircle(SIDE + PAD + 3, cy - 2.2, 1.9);
    this.skin.fillCircle(SIDE + PAD + 7.4, cy - 2.2, 1.9);
    this.skin.fillStyle(accent, 0.45);
    this.skin.fillRect(SIDE + PAD + 1.6, cy, 1.6, 3.2);
    this.skin.fillRect(SIDE + PAD + 6, cy, 1.6, 3.2);

    this.chevron.setPosition(SIDE + WIDTH - PAD - 4, cy);

    this.root.sendToBack(this.skin);
  }

  /** Height follows the wrapped text; everything else is parked off `this.top`. */
  private layout(): void {
    this.height = Math.max(26, this.line.height + 14);
    this.line.setY(this.top + (this.height - this.line.height) / 2);
    this.hit.setY(this.top);
    // Resized in place, never re-registered: calling `setInteractive` twice on a live object
    // replaces its handler and drops the listener bound to the first one, so the strip would
    // stop opening the moment a longer line changed its height.
    this.hit.setSize(WIDTH, this.height);
    const area = this.hit.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    area?.setSize(WIDTH, this.height);
  }
}
