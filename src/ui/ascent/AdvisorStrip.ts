import Phaser from 'phaser';
import { GAME_WIDTH, HEADER_HEIGHT } from '../../game/constants';
import { t } from '../../i18n';
import { markControlBorn, releaseNotOwnedBy, setContainerInputEnabled } from '../inputGeneration';
import type { GameState } from '../../state/types';
import { adviseAscent, type Advice, type AdviceTone } from '../../systems/ascent/Advisor';
import { InkUI, INK_UI } from '../InkUI';
import { PIGMENT } from '../ink/palette';
import { UI_FONT } from '../fonts';
import { ASCENT_HUD_HEIGHT } from './AscentHud';

/** Directly under the readout band, because the strip's whole job is to explain that band. */
export const ADVISOR_TOP = HEADER_HEIGHT + ASCENT_HUD_HEIGHT;
const SIDE = 10;
const WIDTH = GAME_WIDTH - SIDE * 2;
const PAD = 9;
/** Above the map, the map controls and the inspect card; below a prompt's modal layer. */
const DEPTH = 435;

/**
 * How many ticks a piece of advice must hold the top spot before it may be replaced by one of
 * equal or lower urgency.
 *
 * Without it the strip flickers. Half these rules straddle a threshold that the economy crosses
 * every other tick — the treasury sits at 4,010 gold and the graft line is 4,000 — so a strip that
 * simply printed `adviseAscent()[0]` would swap sentences under a reader's eye while they were
 * halfway through one. Something genuinely more urgent still cuts in immediately; this only
 * governs churn between things of similar weight.
 */
const DWELL_TICKS = 3;

const TONE: Record<AdviceTone, { mark: number; text: string }> = {
  urgent: { mark: INK_UI.cinnabar, text: '#8d2f20' },
  chance: { mark: INK_UI.gold, text: '#6b4f12' },
  calm: { mark: PIGMENT.mucSoft, text: '#5a4c39' },
};

/**
 * The in-run advisor, as one line you can press.
 *
 * **The problem it solves.** The front-page tour and the manual can only teach somebody who has
 * not started playing yet, and by the third wave everything they were told is gone. This mode
 * hands the player four numbers and expects them to act on the relationship between two of them —
 * and never says, at any point, which way to act. That is a fine thing to ask of a player who
 * already knows the mode and an impossible one to ask of a player learning it.
 *
 * So: one line, always present, under the band it is reading. It says what to do and quotes the
 * figure it is reading from, so that a player who follows it for ten waves has learned to read the
 * band and does not need it any more. That is the design goal — **the advisor should make itself
 * redundant**, not become a thing you must consult.
 *
 * Pressed, it opens the reasoning and a button that goes to the screen which answers it. Both
 * halves matter. Advice without a reason teaches nothing and is followed on faith; advice without
 * a door makes the player go and find the screen themselves, which is most of the work.
 *
 * Built once and written into, like `AscentHud` — this refreshes on every economy tick and a
 * strip that rebuilt its text objects would churn a canvas measure per tick for a line that
 * usually has not changed.
 */
export class AdvisorStrip {
  private readonly ui: InkUI;
  private root: Phaser.GameObjects.Container;
  private skin: Phaser.GameObjects.Graphics;
  private mark: Phaser.GameObjects.Graphics;
  private line: Phaser.GameObjects.Text;
  private hit: Phaser.GameObjects.Rectangle;
  /** The opened half: body, action button, and the panel behind them. Rebuilt on open. */
  private sheet: Phaser.GameObjects.GameObject[] = [];
  private open = false;
  private current?: Advice;
  private heldTicks = 0;
  private stripHeight = 26;
  private sheetHeight = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onLane: (lane: string) => void,
  ) {
    this.ui = new InkUI(scene);
    this.root = scene.add.container(0, 0).setDepth(DEPTH);
    this.skin = scene.add.graphics();
    this.mark = scene.add.graphics();
    this.line = scene.add.text(SIDE + PAD + 14, ADVISOR_TOP + 7, '', {
      color: TONE.calm.text,
      fontFamily: UI_FONT,
      fontSize: '11px',
      lineSpacing: 2,
      // Room for the mark on the left and the chevron on the right. Wrapping is allowed and the
      // strip grows to fit: every one of these lines is longer in Vietnamese than in English, and
      // a fixed one-line strip would simply clip half of them.
      wordWrap: { width: WIDTH - PAD * 2 - 14 - 16 },
    });
    this.hit = scene.add.rectangle(SIDE, ADVISOR_TOP, WIDTH, this.stripHeight, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.hit.on('pointerup', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      if (releaseNotOwnedBy(this.hit)) return;
      this.open = !this.open;
      this.draw();
    });
    markControlBorn(this.hit);
    this.root.add([this.skin, this.mark, this.line, this.hit]);
  }

  /**
   * The rectangles the world scene underneath must not read as taps on the map.
   *
   * Published rather than hardcoded for the same reason the zoom stack's are: the strip's height
   * follows its text and doubles when it is opened, so a fixed band in the world scene would
   * guard the wrong pixels most of the time — and an unguarded press here selects the province
   * behind the strip and re-renders the card out from under the release.
   */
  tapBounds(): Array<{ x: number; y: number; width: number; height: number }> {
    if (!this.root.visible) return [];
    return [{
      x: SIDE + this.root.x,
      y: ADVISOR_TOP + this.root.y,
      width: WIDTH,
      height: this.stripHeight + this.sheetHeight,
    }];
  }

  /**
   * Moves the whole strip. On the desktop the readout stands beside the resource strip instead of
   * under it, and this strip follows the band up by the readout's height (`conquest/shell.ts`);
   * `tapBounds` and `bottom` carry the offset so the world scene and the whisper line agree.
   */
  setOffset(x: number, y: number): void {
    this.root.setPosition(x, y);
  }

  /**
   * Where the strip ends, so whatever sits under it can follow.
   *
   * Published rather than assumed for the same reason `tapBounds` is: the height follows the
   * text and doubles when the sheet is open, so a fixed offset would put the next surface
   * through the middle of this one.
   */
  bottom(): number {
    return ADVISOR_TOP + this.root.y + this.stripHeight + this.sheetHeight;
  }

  /** The advice on the strip right now, dwell and all — what the bar's hint card repeats. */
  shown(): Advice | undefined {
    return this.current;
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
    // Hiding a Phaser container leaves its hit areas live — see `setContainerInputEnabled`. This
    // strip is hidden under every sheet, so without this it stays pressable through one.
    setContainerInputEnabled(this.root, visible);
    if (this.hit) this.hit.input && (this.hit.input.enabled = visible);
    // An open sheet does not survive being hidden. A prompt takes the screen, and coming back to
    // a panel the player opened four decisions ago — about a situation the decision has since
    // changed — is worse than coming back to the line.
    if (!visible && this.open) {
      this.open = false;
      this.draw();
    }
  }

  render(state: GameState): void {
    const ranked = adviseAscent(state);
    const next = ranked[0];
    if (!next) return;

    if (!this.current) {
      this.current = next;
      this.heldTicks = 0;
    } else if (next.id === this.current.id) {
      // Same advice, fresh figures — the numbers in it move every tick even when the sentence
      // does not, and a strip quoting a stale treasury is worse than one quoting none.
      this.current = next;
      this.heldTicks += 1;
    } else {
      const moreUrgent = next.priority > this.current.priority;
      const stale = !ranked.some((candidate) => candidate.id === this.current?.id);
      if (moreUrgent || stale || this.heldTicks >= DWELL_TICKS) {
        this.current = next;
        this.heldTicks = 0;
        // A sentence swapped underneath an open sheet is a different sheet. Close it rather than
        // silently rewrite what the player is reading.
        if (this.open) this.open = false;
      } else {
        this.heldTicks += 1;
        // Keep the standing advice, but re-read its figures from this tick's ranking.
        const refreshed = ranked.find((candidate) => candidate.id === this.current?.id);
        if (refreshed) this.current = refreshed;
      }
    }

    this.draw();
  }

  destroy(): void {
    this.clearSheet();
    this.root.destroy();
  }

  private clearSheet(): void {
    for (const object of this.sheet) object.destroy();
    this.sheet = [];
    this.sheetHeight = 0;
  }

  /** What the strip was last drawn from, so a tick that changes nothing re-inks nothing. */
  private drawnKey = '';

  private draw(): void {
    const advice = this.current;
    if (!advice) return;
    const tone = TONE[advice.tone];

    // The line, the tone and the open state are everything below reads. The figures inside the
    // sentence move every tick, so the key is the *rendered* text — a fresh treasury number is a
    // new key, an identical sentence is a skipped redraw (which used to be one unguarded
    // `setColor` re-raster plus three Graphics re-inks per economy tick, and per beat in a fight).
    const text = t(advice.line, advice.params);
    const key = `${text}|${advice.tone}|${this.open ? 1 : 0}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;

    this.line.setText(text);
    this.line.setColor(tone.text);
    this.stripHeight = Math.max(26, this.line.height + 14);
    this.line.setY(ADVISOR_TOP + (this.stripHeight - this.line.height) / 2);

    this.clearSheet();
    if (this.open) this.buildSheet(advice);

    const height = this.stripHeight + this.sheetHeight;
    this.skin.clear();
    this.skin.fillStyle(INK_UI.parchment, 0.96);
    this.skin.fillRoundedRect(SIDE, ADVISOR_TOP, WIDTH, height, 7);
    this.skin.lineStyle(1, INK_UI.parchmentDark, 1);
    this.skin.strokeRoundedRect(SIDE, ADVISOR_TOP, WIDTH, height, 7);
    // A bar down the left in the tone's own colour: the one part of the strip that can be read
    // without reading it, which is what makes "something is wrong" visible from across the map.
    this.skin.fillStyle(tone.mark, 0.75);
    this.skin.fillRect(SIDE, ADVISOR_TOP + 5, 2.5, height - 10);

    // The mark itself. A filled disc for a calm reading, a ring for anything that wants doing —
    // a shape difference as well as a colour one, because a fifth of the men reading this cannot
    // tell son from hoè.
    this.mark.clear();
    const cy = ADVISOR_TOP + this.stripHeight / 2;
    if (advice.tone === 'calm') {
      this.mark.fillStyle(tone.mark, 0.8);
      this.mark.fillCircle(SIDE + PAD + 4, cy, 3.2);
    } else {
      this.mark.lineStyle(2, tone.mark, 0.95);
      this.mark.strokeCircle(SIDE + PAD + 4, cy, 4.4);
      this.mark.fillStyle(tone.mark, 0.95);
      this.mark.fillCircle(SIDE + PAD + 4, cy, 1.4);
    }

    // The open/shut chevron, drawn rather than typed.
    //
    // It was a `›` / `⌄` pair of text glyphs, and the second one is not a chevron in Be Vietnam
    // Pro — it renders as a lowercase v, so the shut strip offered an arrow and the open one
    // appeared to have a letter stuck to its corner. Two strokes are the same picture at every
    // size and in every face, and this one already owns a Graphics.
    const chevronX = SIDE + WIDTH - PAD - 4;
    this.mark.lineStyle(1.6, PIGMENT.mucSoft, 0.75);
    if (this.open) {
      this.mark.beginPath();
      this.mark.moveTo(chevronX - 4, cy - 2);
      this.mark.lineTo(chevronX, cy + 2.5);
      this.mark.lineTo(chevronX + 4, cy - 2);
      this.mark.strokePath();
    } else {
      this.mark.beginPath();
      this.mark.moveTo(chevronX - 2, cy - 4);
      this.mark.lineTo(chevronX + 2.5, cy);
      this.mark.lineTo(chevronX - 2, cy + 4);
      this.mark.strokePath();
    }

    // The hit area is resized in place rather than re-registered. Calling `setInteractive` a
    // second time on a live object replaces its input handler and drops the listeners bound to
    // the first one, so the strip would stop opening the moment its text changed height.
    this.hit.setSize(WIDTH, this.stripHeight);
    const area = this.hit.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    area?.setSize(WIDTH, this.stripHeight);
    // The skin is drawn every pass and would otherwise sit on top of whatever was added last.
    this.root.sendToBack(this.mark);
    this.root.sendToBack(this.skin);
  }

  /** The opened half: the reasoning, and the door to the screen that answers it. */
  private buildSheet(advice: Advice): void {
    const top = ADVISOR_TOP + this.stripHeight;
    const body = this.scene.add.text(SIDE + PAD, top + 2, t(advice.body, advice.params), {
      color: '#4a3b28',
      fontFamily: UI_FONT,
      fontSize: '11px',
      lineSpacing: 3,
      wordWrap: { width: WIDTH - PAD * 2 },
    });
    this.sheet.push(body);
    let bottom = body.y + body.height;

    if (advice.lane) {
      const width = 128;
      const button = this.ui.button(
        { x: SIDE + WIDTH - PAD - width, y: bottom + 8, width, height: 28 },
        t('advice.open'),
        () => {
          const lane = advice.lane;
          this.open = false;
          this.draw();
          if (lane) this.onLane(lane);
        },
        { variant: 'secondary', fontSize: '11px' },
      );
      this.sheet.push(button);
      bottom = bottom + 8 + 28;
    }

    this.sheetHeight = bottom - top + 10;
    // Added to the container AFTER the height is known, so `draw` can paint one panel behind
    // both halves rather than two rectangles that have to agree with each other.
    //
    // Order is the only thing deciding what covers what in here: Phaser does not depth-sort a
    // container's children, so `setDepth` on any of these would be silently ignored. `draw` sends
    // the skin and the mark to the back after this, which is what keeps the panel behind its text.
    this.root.add(this.sheet);
  }
}
