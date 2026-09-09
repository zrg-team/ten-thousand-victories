import { addConquestUiIcon } from '../conquestUiIcons';
import Phaser from 'phaser';
import { GAME_WIDTH, HEADER_HEIGHT } from '../../game/constants';
import { INK_UI, INK_UI_HEX, InkUI } from '../InkUI';
import { TITLE_FONT, UI_FONT } from '../fonts';
import { heatFor } from '../../systems/ascent/AmbitionSystem';
import { WAVE_INTERVAL_TICKS } from '../../game/ascentConfig';
import { heron } from '../ink/devices';
import { applyStamp, placeStamp, stampDesign } from '../ink/stamp';
import { t } from '../../i18n';
import { formatNumber } from '../../utils/format';
import type { AscentState } from '../../state/types';
import { PIGMENT } from '../ink/palette';
import { ROW_Y as STRIP_ROW_Y, TITLE_Y as STRIP_TITLE_Y } from '../ResourceBar';

/** The frieze's own height, in design units. Was an inline 11 in two places. */
const FRIEZE_HEIGHT = 11;

/**
 * One chim Lạc, baked. Keyed by size, state and colour, so the whole frieze is two textures.
 * `heron` draws around the anchor, so the box is the bird's own reach plus a margin for the ink.
 */
function heronStamp(scene: Phaser.Scene, size: number, filled: boolean, colour: number) {
  const margin = 1.2;
  return stampDesign(
    scene,
    `hud:heron:${filled ? 'flown' : 'waiting'}:${size.toFixed(3)}:${colour.toString(16)}`,
    { left: -(10.5 * size + margin), right: 10.6 * size + margin, top: -(5 * size + margin), bottom: 4.6 * size + margin },
    (g, x, y) => heron(g, x, y, size, filled, colour),
    { pool: 'ui', raster: 'super' },
  );
}

/**
 * Bottom edge of the HUD band. Kept in sync with ConquestScene's input guard.
 *
 * Deliberately tight. With the header above and a 50px action bar below, every pixel this band
 * takes is a pixel of map the player cannot see — and the map is the game. The three numbers are
 * laid out on two dense rows rather than three airy ones.
 *
 * Eight of these went to the header, which needed them: the band used to close itself with a răng
 * cưa frieze sitting immediately under the level bar, so the bottom of the readout was a gold
 * progress bar with a second, decorative bar of teeth directly beneath it and then a hairline
 * closing the band anyway. Three horizontal rules in eight pixels, two of which say nothing.
 */
/**
 * The band's height, and it is a *measured* number rather than a chosen one.
 *
 * It was 58 for three stacked rows: the two figures, then a countdown row, then a row for the
 * level, the wave and their meters — while the whole middle of the band, between a left-anchored
 * POWER and a right-anchored THREAT, sat empty across every one of them. The rows are two now,
 * with the wave frieze and the level rule moved into that empty middle where they always had room.
 * Nothing was dropped to do it.
 *
 * 48 = ambition's row (TOP+32) plus a 10px line and its leading, plus a hairline to close on. At
 * 46 that line's descenders sat on the hairline, which only shows up once ambition is above 1.
 */
export const ASCENT_HUD_HEIGHT = 48;

const TOP = HEADER_HEIGHT;

/**
 * The permanent readout: POWER, THREAT, MOMENTUM.
 *
 * These three numbers are the whole reason this mode is legible without menus — the player
 * should be able to answer "am I getting stronger?", "can I survive what's coming?" and
 * "when is my next choice?" at a glance, without opening anything.
 *
 * **Built once, then written into.** This band used to be torn down and rebuilt on every call:
 * eight `Text` objects, a Đông Sơn frieze and two bars, each text a canvas measure and a texture
 * upload. `ConquestUIScene.refresh` calls it, and during a fight the *battle clock* drives that
 * refresh at `BATTLE_TICK_MS` — so the band was rebuilt 1.8 times a second. Measured at a 4x CPU
 * throttle: 50.5 ms per beat, more than the entire battle screen underneath it. And a signature
 * guard could not save it, because during a fight every number here is genuinely moving — men are
 * dying, so POWER and THREAT change on every exchange. The work had to get cheaper, not rarer.
 *
 * So the objects are made once and each render writes strings and redraws two graphics. What still
 * allocates is the ▲/▼ ticker, which is a transient by nature and only appears when POWER moves.
 */
export class AscentHud {
  private readonly ui: InkUI;
  /** Tweened display value, so POWER counts up to its new figure instead of snapping. */
  private shownPower = 0;
  /**
   * Width of POWER at the figure it is counting *towards*, not the one it is showing.
   *
   * The frieze beside it starts where the number ends, and the number spends half a second
   * climbing — measured live, the column walked right across every count-up, one render at a time,
   * and a card that doubled the score dragged the whole middle of the band with it. Measured once
   * per change of target instead: two canvas measures when the score moves, none per frame.
   */
  private powerWidth = 0;
  /**
   * The span the label row has to itself, measured once from the two words that bound it.
   *
   * The label row and the figure row have different free widths — POWER and THREAT are two short
   * words, while 128,450 and "ahead 420" are not — so the level, the wave and the countdown are
   * laid out against the words above the figures rather than against the figures. Laid out against
   * the figures, a six-digit POWER pushed the wave count into the countdown.
   *
   * Cached because the two words only change with the language, and a language change restarts.
   */
  private labelSpan = { left: 72, right: GAME_WIDTH - 54 };

  /** The breath on the LIVE label. Held so it is started and stopped exactly once. */
  private livePulse?: Phaser.Tweens.Tween;

  /** The band's permanent furniture. Undefined until the first render builds it. */
  private parts?: {
    panel: Phaser.GameObjects.Graphics;
    powerValue: Phaser.GameObjects.Text;
    threatValue: Phaser.GameObjects.Text;
    threatVerdict: Phaser.GameObjects.Text;
    countdown: Phaser.GameObjects.Text;
    ambition: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    wave: Phaser.GameObjects.Text;
    meter: Phaser.GameObjects.Graphics;
    /** The wave frieze's birds, as placed stamps. See `layoutFrieze`. */
    frieze: Phaser.GameObjects.Container;
    xp: Phaser.GameObjects.Graphics;
    /** POWER's caption, then THREAT's. */
    labels: Phaser.GameObjects.Text[];
  };

  /** One image per bird in the wave frieze, reused across refreshes. */
  private readonly friezeBirds: Phaser.GameObjects.Image[] = [];

  /**
   * Everything the readout draws, in one container, so the whole band can be placed: on the desktop
   * it stands beside the resource strip in a top bar rather than under it (`conquest/shell.ts`).
   * Children keep the coordinates they always had; only the container moves.
   */
  readonly root: Phaser.GameObjects.Container;
  /** Whether the band paints its own plate; the desktop's top bar paints one under it instead. */
  private panelShown = true;
  /**
   * The bar layout: the readout on the resource strip's own two rows, for the desktop's top bar
   * where it stands beside the strip rather than under it. The phone band's rows are its own —
   * captions over figures over a meter over an ambition line, forty-eight units of them — and set
   * next to the strip's title row and store row they read as a second, denser bar glued to the
   * first, with the ambition line struck through by the frieze. On the strip's rows the two cells
   * of the bar share one rhythm (`placeCompact`).
   */
  private readonly compact: boolean;
  /** How wide the compact readout is; the phone band is the column's width. */
  private width: number;

  constructor(private readonly scene: Phaser.Scene, opts: { compact?: boolean; width?: number } = {}) {
    this.compact = opts.compact ?? false;
    this.width = opts.width ?? GAME_WIDTH;
    this.root = scene.add.container(0, 0).setDepth(90);
    this.ui = new InkUI(scene);
  }

  /** A new width for the compact readout; the next render lays its parts out against it. */
  setWidth(width: number): void {
    this.width = width;
  }

  /**
   * Where the readout stands on the sheet, for anything that has to point at it.
   *
   * Off the container, not off the constants: on the phone the band is the column's width under
   * the header and the two agree, but on the desktop `conquest/shell.ts` moves the whole root
   * beside the resource strip in the top bar, and the walkthrough's card — which had the phone's
   * rectangle written into it — lit a bare patch of map where the band would have been.
   */
  bounds(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.root.x,
      y: this.root.y + TOP,
      width: this.compact ? this.width : GAME_WIDTH,
      height: ASCENT_HUD_HEIGHT,
    };
  }

  setPanelVisible(visible: boolean): void {
    this.panelShown = visible;
    this.parts?.panel.setVisible(visible);
  }

  destroy(): void {
    this.livePulse?.remove();
    this.livePulse = undefined;
    const parts = this.parts;
    if (!parts) return;
    for (const object of [parts.panel, parts.powerValue, parts.threatValue, parts.threatVerdict,
      parts.countdown, parts.ambition, parts.level, parts.wave, parts.meter, parts.xp, ...parts.labels]) {
      object.destroy();
    }
    this.parts = undefined;
  }

  render(ascent: AscentState): void {
    const parts = this.parts ?? this.build();

    // ── POWER ────────────────────────────────────────────────────────────
    // Count up rather than snap: the number moving is the feedback for a card just taken. The
    // counter writes into a text object that now outlives the render, so a rebuild can no longer
    // orphan a tween half way through its climb.
    const target = ascent.power;
    if (this.shownPower !== target) {
      this.scene.tweens.killTweensOf(parts.powerValue);
      parts.powerValue.setText(formatNumber(target));
      this.powerWidth = parts.powerValue.width;
      parts.powerValue.setText(formatNumber(this.shownPower));
      this.scene.tweens.addCounter({
        from: this.shownPower,
        to: target,
        duration: 520,
        ease: 'Cubic.easeOut',
        onUpdate: (tween) => {
          this.shownPower = tween.getValue() ?? target;
          if (parts.powerValue.active) parts.powerValue.setText(formatNumber(this.shownPower));
        },
        onComplete: () => { this.shownPower = target; },
      });
    }

    const delta = ascent.power - ascent.powerPrev;
    if (delta !== 0 && ascent.powerPrev > 0) this.spawnTicker(delta, parts.powerValue.width);

    // ── THREAT ───────────────────────────────────────────────────────────
    const x = (this.compact ? this.width : GAME_WIDTH) - 14;
    // Compared against what can actually fight, not the headline POWER — a full treasury
    // does not hold a wall, and colouring it against POWER would flatter the player.
    const ratio = ascent.defensePower > 0 ? ascent.threat / ascent.defensePower : 99;
    const { color, key } = ratio < 0.7
      ? { color: '#4c6b46', key: 'ascent.hud.ahead' as const }
      : ratio < 1.1
        ? { color: '#9a6b16', key: 'ascent.hud.even' as const }
        : { color: '#a4402c', key: 'ascent.hud.behind' as const };

    write(parts.threatValue, formatNumber(ascent.threat), color);
    // Beside the figure, not beneath it: the verdict and the number are one thought.
    write(parts.threatVerdict, t(key), color);
    if (!this.compact) parts.threatVerdict.setX(x - parts.threatValue.width - 6);
    // How far left the THREAT column actually reaches this frame. Everything in the middle stops
    // here, and it is measured rather than assumed because "ahead" and "đang dẫn" are not the same
    // width, and neither is 420 and 12,480.
    let midRight = x - parts.threatValue.width - 6 - parts.threatVerdict.width - 10;

    // While hosts are on the map the countdown is the wrong question.
    //
    // "Next wave in 7" printed over a live invasion is not merely uninformative, it actively
    // misreads: the player is *in* one, and the band's only line about waves was counting down to
    // a different one. The countdown yields the slot for as long as the invasion stands, and comes
    // back the tick the map clears — which is also the tick the result banner unrolls, so the two
    // halves of the lifecycle agree with each other.
    const live = ascent.waveInFlight;
    const bossNext = (ascent.wave + 1) % 4 === 0;
    write(
      parts.countdown,
      live
        ? t('ascent.hud.live', { wave: ascent.wave })
        : bossNext
          ? t('ascent.hud.bossIn', { ticks: Math.max(0, ascent.ticksToWave) })
          : t('ascent.hud.waveIn', { ticks: Math.max(0, ascent.ticksToWave) }),
      live || bossNext ? '#a4402c' : '#5a4c39',
    );
    parts.countdown.setFontStyle(live || bossNext ? '700' : 'normal');
    // A slow breath on the label, started once and stopped once. Restarting it per render would
    // reset the phase on every beat of the battle clock, which reads as a flicker rather than a
    // pulse — the same fault the POWER counter had before it was given a life outside the render.
    if (live && !this.livePulse) {
      this.livePulse = this.scene.tweens.add({
        targets: parts.countdown,
        alpha: { from: 1, to: 0.42 },
        duration: 620,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    } else if (!live && this.livePulse) {
      this.livePulse.remove();
      this.livePulse = undefined;
      parts.countdown.setAlpha(1);
    }

    // The cause, printed beside its effect.
    //
    // The threat figure above already climbs as the player commits — it is quoted from live
    // ambition — but a number that moves for reasons the player cannot see is the exact
    // failure the ambition curve was built to end. This says *why* it moved, on the same
    // right-hand column, and warms from jade through gold to cinnabar as the realm gets bolder.
    const heat = heatFor(ascent.ambition);
    if (heat > 1.001) {
      write(
        parts.ambition,
        t('ascent.hud.ambition', { mult: heat.toFixed(1) }),
        heat < 1.4 ? '#4c6b46' : heat < 2 ? '#9a6b16' : '#a4402c',
      );
      parts.ambition.setVisible(true);
      if (!this.compact) {
        parts.ambition.setX(x);
        // The meters are bounded by whatever sits furthest left in the right-hand column, not by
        // any one label — otherwise the gold fill runs straight under this one.
        midRight = Math.min(midRight, x - parts.ambition.width - 10);
      }
    } else {
      parts.ambition.setVisible(false);
    }

    // ── MOMENTUM, in the middle ──────────────────────────────────────────
    // The column starts where POWER's own figure ends, so it slides right as the number grows past
    // four digits instead of being overrun by it. Clamped at both ends: a very short figure would
    // otherwise start the frieze under the word POWER, and a very long one would squeeze it to a
    // stub against THREAT.
    write(parts.level, t('ascent.hud.level', { level: ascent.level }));
    write(parts.wave, t('ascent.hud.wave', { wave: ascent.wave }));

    let barX: number;
    let barWidth: number;
    let y: number;
    if (this.compact) {
      ({ barX, barWidth, y } = this.placeCompact(parts));
    } else {
      barX = Phaser.Math.Clamp(14 + Math.max(this.powerWidth, parts.powerValue.width) + 16, 92, 214);
      barWidth = Math.max(56, midRight - barX);

      // The level and the wave sit on the label row, between POWER and THREAT — the one line of
      // this band that was empty in the middle from the day it was drawn — and they take that
      // row's own width, not the frieze's.
      parts.level.setPosition(this.labelSpan.left, TOP + 2);
      parts.wave.setPosition(this.labelSpan.left + parts.level.width + 7, TOP + 2);
      parts.countdown.setX(this.labelSpan.right);

      y = TOP + 17;
    }
    // In the bar the frieze yields the middle when the sheet is too narrow to draw it as birds:
    // eight herons in forty units is a smear, and the figures either side matter more.
    const meterShown = barWidth >= 44;

    // The wave, as a Đông Sơn frieze: the Lạc birds of the Ngọc Lũ tympanum ink in as it closes.
    // A bar chart from 500 BCE, and it earns the slot because the meter speaks in the narrator's
    // register — bronze — while the world it is counting down over is dated to a dynasty.
    const toWave = 1 - Math.max(0, Math.min(1, ascent.ticksToWave / Math.max(1, WAVE_INTERVAL_TICKS)));
    // Re-inked only when the frieze visibly moves: the meter is ~1,250 recorded path segments,
    // and re-recording them on every refresh was the band's single biggest line item.
    const meterKey = meterShown ? `${barX}:${barWidth}:${Math.round(toWave * barWidth)}` : 'off';
    if (this.meterKey !== meterKey) {
      this.meterKey = meterKey;
      parts.meter.clear();
      if (meterShown) {
        // The band's own rule under the birds — two commands, and the only live ink left here.
        parts.meter.lineStyle(0.8, PIGMENT.mucFaint, 0.35);
        parts.meter.lineBetween(barX, y + FRIEZE_HEIGHT, barX + barWidth, y + FRIEZE_HEIGHT);
      }
      this.layoutFrieze(parts.frieze, meterShown ? { x: barX, y, width: barWidth, progress: toWave } : undefined);
    }

    // Level progress keeps its own thin rule beneath the frieze: two different quantities, and
    // stacking them beat merging them into one ambiguous bar.
    const filled = Math.max(0, Math.min(1, ascent.xp / Math.max(1, ascent.xpToNext)));
    const xpKey = meterShown ? `${barX}:${barWidth}:${Math.round(filled * barWidth)}` : 'off';
    if (this.xpKey !== xpKey) {
      this.xpKey = xpKey;
      parts.xp.clear();
      if (meterShown) {
        // A unit tighter under the frieze in the bar, where the row closes on the bottom teeth.
        const xpY = y + (this.compact ? 12 : 13);
        parts.xp.fillStyle(INK_UI.brush, 0.2);
        parts.xp.fillRect(barX, xpY, barWidth, 3);
        if (filled > 0) {
          parts.xp.fillStyle(INK_UI.gold, 0.88);
          parts.xp.fillRect(barX, xpY, Math.max(1.5, barWidth * filled), 3);
        }
      }
    }
  }

  /**
   * The wave frieze, as baked birds rather than live ink.
   *
   * `heronMeter` drew fifteen chim Lạc into one `Graphics`, each a fifteen-point closed polygon
   * stroked three times by `inkPath` — about 2,774 recorded commands. The guard above already kept
   * it from being *re-inked* more than once every few seconds, and that saved nothing that reached
   * the GPU: Phaser 4 has no retained geometry for `Graphics`, so it re-walks the whole command
   * buffer, re-allocates a `Path` per sub-path, re-triangulates and re-uploads it **every frame**.
   * Measured on a settled Conquest map, this one object was 2,774 of the 4,143 live commands the
   * whole map submitted per frame — two thirds of it, for a bar that moves once per season.
   *
   * The birds are deterministic (`heron` seeds its wobble at a constant), so every flown bird is
   * identical to every other flown bird and the whole frieze is two textures and a row of images.
   * This is the same fix the header's răng cưa band already had — see `ui/ResourceBar.ts`.
   */
  private layoutFrieze(layer: Phaser.GameObjects.Container,
    bar?: { x: number; y: number; width: number; progress: number }): void {
    const birds = this.friezeBirds;
    if (!bar) {
      for (const bird of birds) bird.destroy();
      birds.length = 0;
      return;
    }
    const size = FRIEZE_HEIGHT * 0.05;
    const count = Math.max(8, Math.round(bar.width / (FRIEZE_HEIGHT * 1.05)));
    const gap = (bar.width - FRIEZE_HEIGHT * 0.7) / count;
    const flown = heronStamp(this.scene, size, true, PIGMENT.hoePale);
    const waiting = heronStamp(this.scene, size, false, PIGMENT.mucFaint);
    while (birds.length > count) birds.pop()!.destroy();
    for (let index = 0; index < count; index += 1) {
      const stamp = index / count < bar.progress ? flown : waiting;
      let bird = birds[index];
      if (!bird) {
        bird = placeStamp(this.scene, stamp, 0, 0);
        layer.add(bird);
        birds[index] = bird;
      } else {
        // Swaps the texture and moves the refcount with it; the image's own scale survives.
        applyStamp(bird, stamp);
      }
      bird.setPosition(bar.x + FRIEZE_HEIGHT * 0.6 + index * gap, bar.y + FRIEZE_HEIGHT * 0.5);
    }
  }

  /**
   * The bar layout, on the strip's two rows.
   *
   * Row one is the strip's title row: the level and the wave stand where the strip prints the
   * season, the ambition heat beside them, and the wave clock at the row's right end. Row two is
   * the strip's store row: POWER at the left as a caption and a figure, THREAT at the right as a
   * caption, a figure and its verdict, and the wave frieze and level rule in the middle, where
   * the phone band keeps them. Everything sits between the band's two frieze rows, which the
   * phone layout's ambition line did not; and the two cells of the bar share one baseline.
   */
  private placeCompact(parts: NonNullable<AscentHud['parts']>): { barX: number; barWidth: number; y: number } {
    const right = this.width - 14;
    const title = TOP + STRIP_TITLE_Y;
    parts.level.setPosition(14, title);
    parts.wave.setPosition(14 + parts.level.width + 7, title);
    parts.ambition.setPosition(parts.wave.x + parts.wave.width + 10, title + 3);
    parts.countdown.setPosition(right, title + 3);

    const row = TOP + STRIP_ROW_Y;
    const [powerLabel, threatLabel] = parts.labels;
    powerLabel.setPosition(14, row);
    parts.powerValue.setPosition(14 + powerLabel.width + 6, row);
    parts.threatVerdict.setPosition(right, row);
    parts.threatValue.setPosition(right - parts.threatVerdict.width - 5, row);
    threatLabel.setPosition(parts.threatValue.x - parts.threatValue.width - 6, row);

    // The frieze starts where POWER's target figure ends and stops short of THREAT's caption; it
    // is drawn eight units above the row's centre so its eleven units and the level rule beneath
    // close on the bottom teeth without touching them.
    const barX = parts.powerValue.x + Math.max(this.powerWidth, parts.powerValue.width) + 14;
    const midRight = threatLabel.x - threatLabel.width - 12;
    return { barX, barWidth: midRight - barX, y: row - 8 };
  }

  /** The furniture, made once: everything whose position and content the band keeps re-writing. */
  /** What the frieze last drew, so a quiet refresh re-records none of its ~1,250 segments. */
  private meterKey = '';
  private xpKey = '';

  private build(): NonNullable<AscentHud['parts']> {
    const labels: Phaser.GameObjects.Text[] = [];
    const compact = this.compact;

    // One plate with the resource bar above, not a card floating under it.
    //
    // This was an InkUI panel: gold border, cut corners, a rule inside its own edge. Directly
    // beneath a header that is a plain paper strip, that reads as a separate object bolted on —
    // the same complaint the chrome work started from, one level down. It is the same paper now,
    // drawn up over the header's closing hairline so the two are continuous, and closed at the
    // bottom by a single hairline. The header above wears the răng cưa frieze; repeating it here,
    // one pixel under the level bar, only added a second bar for the eye to read as data.
    const panel = this.scene.add.graphics();
    panel.fillStyle(INK_UI.backgroundInk, 0.97);
    panel.fillRect(0, TOP - 2, GAME_WIDTH, ASCENT_HUD_HEIGHT + 2);
    panel.lineStyle(1, PIGMENT.mucSoft, 0.35);
    panel.lineBetween(0, TOP + ASCENT_HUD_HEIGHT - 0.5, GAME_WIDTH, TOP + ASCENT_HUD_HEIGHT - 0.5);
    panel.setDepth(90);

    const x = (compact ? this.width : GAME_WIDTH) - 14;
    // In the bar the captions stand on the store row beside their figures, centred on it like the
    // strip's own labels; on the phone band they head their columns.
    const powerLabel = this.ui.label(14, TOP + 2, t('ascent.hud.power'), 'caption', {
      color: INK_UI_HEX.mutedText, fontSize: '9px',
    }).setOrigin(0, compact ? 0.5 : 0).setAlpha(0.7).setDepth(91);
    const threatLabel = this.ui.label(x, TOP + 2, t('ascent.hud.threat'), 'caption', {
      color: INK_UI_HEX.mutedText, fontSize: '9px', align: 'right',
    }).setOrigin(1, compact ? 0.5 : 0).setAlpha(0.7).setDepth(91);
    labels.push(powerLabel, threatLabel);
    this.labelSpan = { left: 14 + powerLabel.width + 14, right: x - threatLabel.width - 14 };

    // The figures are the strip's size in the bar — a 22px number beside 12px store counts was
    // the loudest thing on the row — and the phone band's on the phone.
    const powerValue = this.scene.add.text(14, TOP + 11, formatNumber(this.shownPower), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: compact ? '16px' : '22px', fontStyle: '700',
    }).setOrigin(0, compact ? 0.5 : 0).setDepth(91);

    const threatValue = this.scene.add.text(x, TOP + 11, '', {
      color: '#4c6b46', fontFamily: TITLE_FONT, fontSize: compact ? '16px' : '20px', fontStyle: '700', align: 'right',
    }).setOrigin(1, compact ? 0.5 : 0).setDepth(91);

    const threatVerdict = this.scene.add.text(x, TOP + 17, '', {
      color: '#4c6b46', fontFamily: UI_FONT, fontSize: '10px', align: 'right',
    }).setOrigin(1, compact ? 0.5 : 0).setAlpha(0.9).setDepth(91);

    // On the label row with the level and the wave, right-aligned over the meters. `render`
    // places it; the x here is only somewhere legal to stand before the first frame.
    const countdown = this.scene.add.text(x, TOP + 2, '', {
      color: '#5a4c39', fontFamily: UI_FONT, fontSize: compact ? '11px' : '10px', align: 'right',
    }).setOrigin(1, 0).setDepth(91);

    // Ambition keeps the right-hand column, under the verdict it explains; in the bar it follows
    // the wave along the title row.
    const ambition = this.scene.add.text(x, TOP + 32, '', {
      color: '#4c6b46', fontFamily: UI_FONT, fontSize: compact ? '11px' : '10px', fontStyle: '700', align: compact ? 'left' : 'right',
    }).setOrigin(compact ? 0 : 1, 0).setVisible(false).setDepth(91);

    // The level and the wave are the bar's title, set like the strip's season beside them.
    const level = this.scene.add.text(0, TOP + 2, '', {
      color: '#2a2118', fontFamily: UI_FONT, fontSize: compact ? '15px' : '10px', fontStyle: '700',
    }).setDepth(91);
    const wave = this.scene.add.text(0, TOP + 2, '', {
      color: '#5a4c39', fontFamily: UI_FONT, fontSize: compact ? '15px' : '10px',
    }).setDepth(91);

    const meter = this.scene.add.graphics().setDepth(91);
    const frieze = this.scene.add.container(0, 0).setDepth(91);
    const xp = this.scene.add.graphics().setDepth(91);

    this.parts = {
      panel, powerValue, threatValue, threatVerdict, countdown, ambition, level, wave, meter, frieze, xp, labels,
    };
    // Into the root, in the order the depths above asked for: the panel under everything, the
    // figures over it. A container ignores its children's `setDepth`, so the order is the depth.
    this.root.add([panel, ...labels, powerValue, threatValue, threatVerdict, countdown, ambition, level, wave, meter, frieze, xp]);
    panel.setVisible(this.panelShown);
    return this.parts;
  }

  /**
   * The ▲/▼ that rises off POWER when it moves. A transient by nature, so it is still made fresh.
   *
   * It climbs beside the figure, and it is measured against the *target* width for the same reason
   * the frieze is: spawned against the width of a number still counting, it starts inside the
   * digits. It crosses the left end of the frieze on its way up, which is the price of a band ten
   * units shorter — a transient that fades over 1.4s can share space; a permanent label cannot.
   * Under the number instead of beside it, which the first attempt tried, it hung out of the band.
   */
  private spawnTicker(delta: number, powerWidth: number): void {
    const rising = delta > 0;
    // In the bar the figure stands on the store row, so the ticker rises from beside it there.
    const figureX = this.compact && this.parts ? this.parts.powerValue.x : undefined;
    const ticker = this.scene.add.container(
      (figureX ?? 14) + Math.max(this.powerWidth, powerWidth) + 8,
      figureX !== undefined ? TOP + STRIP_ROW_Y + 1 : TOP + 24,
    ).setDepth(91);
    ticker.add(addConquestUiIcon(this.scene, rising ? 'chevron-up' : 'chevron-down', 10).setPosition(5, 6));
    ticker.add(this.scene.add.text(12, 0, formatNumber(Math.abs(delta)),
      { color: rising ? '#4c6b46' : '#a4402c', fontFamily: UI_FONT, fontSize: '11px', fontStyle: '700' }));
    this.root.add(ticker);
    this.scene.tweens.add({
      targets: ticker,
      y: figureX !== undefined ? TOP + STRIP_ROW_Y - 11 : TOP + 12,
      alpha: 0,
      duration: 1400,
      ease: 'Cubic.easeOut',
      // It owns its own end. Left in the band's object list it was destroyed by the next rebuild
      // with 840 ms of its climb still to run, leaving a tween writing to nothing.
      onComplete: () => ticker.destroy(),
    });
  }
}

/** `setText` re-measures the canvas and re-uploads the texture even for an identical string. */
function write(label: Phaser.GameObjects.Text, text: string, colour?: string): void {
  if (label.text !== text) label.setText(text);
  if (colour !== undefined && label.style.color !== colour) label.setColor(colour);
}
