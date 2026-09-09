import { addConquestUiIcon } from '../conquestUiIcons';
import Phaser from 'phaser';
import { GAME_WIDTH } from '../../game/constants';
import { t } from '../../i18n';
import type { GameState } from '../../state/types';
import { readInheritance, type InheritanceLedger } from '../../systems/ascent/Inheritance';
import { markControlBorn, releaseNotOwnedBy, setContainerInputEnabled } from '../inputGeneration';
import { INK_UI, InkUI } from '../InkUI';
import { PIGMENT } from '../ink/palette';
import { sawtoothBand } from '../ink/devices';
import { TITLE_FONT, UI_FONT } from '../fonts';
import { formatNumber } from '../../utils/format';
import { motionMs } from '../../game/lifeSettings';
import { houseBanner, stampHouseBanner } from './houseBanner';

const SIDE = 10;
/**
 * Narrower than the strips above the map on purpose. The chip shares its row with the map
 * controls (a 42-wide stack against the right edge from x=339) and the paused badge, and a
 * full-width plate down here would be a second action bar. 256 holds a 11px bold line of about
 * thirty-two characters after the seal — every headline in the catalogue was written to fit that
 * in Vietnamese first, and `maxLines: 1` clips rather than grows if one does not.
 */
const WIDTH = 256;
const HEIGHT = 40;
/**
 * The chip at rest. Two lines and a meter over the map, on every screen of the run, was a second
 * strip the player had not asked for — *"the Dynasty section should be smaller by default"*. Shut,
 * it is one line and the banner; the caption, the meter and the ledger come back with a tap.
 */
const HEIGHT_COMPACT = 24;
/**
 * The shut chip's width: the banner, the reign's score so far, the caret and the chevron. Very
 * small by default — reported as *this UI must be very small by default and click to expand* —
 * the whole line of what the reign has earned is the open card's, one tap away.
 */
const WIDTH_COMPACT_MIN = 96;
const WIDTH_COMPACT_MAX = 160;
const BANNER_SCALE_COMPACT = 0.6;
const PAD = 8;
/**
 * The house banner at the left, and where the text starts after it.
 *
 * A hanging silk 20 wide and 28 tall: the swallowtail needs the height to read as a banner rather
 * than a coloured rectangle, and 28 leaves six units of paper above and below it in a 40 plate.
 */
const BANNER_W = 20;
const BANNER_H = 28;
const TEXT_X = SIDE + PAD + BANNER_W + 10;
/** Air between the chip's foot and whatever it floats above (the bar, or an inspect card). */
const FLOOR_GAP = 10;
/** Under the whisper line (434) and the advisor (435); above the map and the inspect card (120). */
const DEPTH = 432;
/**
 * How long the house line holds the shut chip after anything moves, in ms.
 *
 * The chip used to rotate six topics on a nine-second clock, and the house — the one line every
 * reign feeds from the first wave — was on screen 17% of the time. Now it is *house first, then
 * the nearest milestone*: the house for six seconds after any change, and otherwise whichever of
 * the other ledgers is closest to paying out, in its own units. Measured target: the house on
 * screen at least half the run.
 */
const HOUSE_HOLD_MS = 6000;
/** At rest the shut chip alternates: the house for eight seconds of every twelve, then the nearest milestone. */
const REST_CYCLE_MS = 12000;
const REST_HOUSE_MS = 8000;
/** How long an event holds the headline before the selection resumes. */
const EVENT_HOLD_MS = 6500;
/**
 * The "one more wave" threshold: a wave's yield is about 120 XP plus power, so under 400 XP to
 * the next level the chip says so. Above that the ping would be noise.
 */
const ALMOST_XP = 400;
/** The ink caret after the house line blinks on this clock — a step, not a fade. */
const CARET_MS = 500;

type Topic = 'house' | 'seals' | 'bind' | 'legacy' | 'record' | 'heroes';
const TOPICS: Topic[] = ['house', 'seals', 'bind', 'legacy', 'record', 'heroes'];

interface Headline {
  topic: Topic;
  text: string;
  /** 0–1 for a thin bar under the line; undefined draws none. */
  fill?: number;
  accent: number;
  /**
   * How far this ledger is from its next payout, 0–1 in its own units; the shut chip shows the
   * smallest. Undefined means the line is news rather than a distance and never competes.
   */
  remaining?: number;
}

/**
 * **The next reign, read from this one — a chip in the bottom-left corner.**
 *
 * **The problem it solves.** Three systems carry a player from one reign to the next: the house
 * grows on the run's score, the cabinet fills from its rubbings and the bind, and the vault banks
 * Legacy. Every one of them was paid out at the Reckoning and nowhere else, so for the whole of a
 * run the meta-game was invisible — a player twenty waves in had earned two dynasty levels, three
 * rubbings and a new record, and the screen said nothing. Reported as: *only apply when a game
 * finished, it not feel progressive*.
 *
 * **The shape.** One small printed plate above the action bar, never over the map's centre — the
 * same torn sheet the paused badge beside it is drawn on, not the flat strip the advisor uses,
 * because this floats over the map and a floating thing needs an edge and a shadow. On the left,
 * **the house's own banner** (`houseBanner`): the field, trim and emblem the player chose at the
 * coronation, so the chip identifies *their* house the way the Tông Phả sheet does, rather than a
 * generic seal. Then a caption saying whose reign this is for, one headline that rotates through
 * what the reign has earned so far, and a hairline meter under it when the headline is a fraction
 * of something. It never pauses the world, never covers a decision — it hides under every prompt and
 * lane exactly as the advisor does — and it is pressed, not needed: a tap opens a six-row sheet
 * above the chip listing everything at once, and a second tap closes it.
 *
 * **It raises its voice only when something lands.** A rubbing earned, the house crossing a level,
 * a record broken, a combine becoming ready: the banner lands the way `arrivalFanfare`'s seal does
 * and a `+1` climbs off it on a slip of the same paper, and that topic holds the headline for a few seconds before the rotation
 * resumes. Everything else is quiet. Compare the ▲ ticker on POWER — the same register, one storey
 * down.
 *
 * **Built once and written into**, like the band and the advisor: `refresh` calls it per economy
 * tick and per beat during a fight, and the ledger is only re-read when its inputs move.
 */
export class InheritanceChip {
  private readonly ui: InkUI;
  private root: Phaser.GameObjects.Container;
  /** The printed sheet. Rebuilt only when the plate's rectangle changes — see `plateKey`. */
  private plate?: Phaser.GameObjects.Graphics;
  private plateKey = '';
  /** Rules and accents drawn over the plate every pass. */
  private skin: Phaser.GameObjects.Graphics;
  /** The house's banner, centred on its own holder so the punch can scale it about its middle. */
  private stamp: Phaser.GameObjects.Container;
  private chevron: Phaser.GameObjects.Image;
  private meter: Phaser.GameObjects.Graphics;
  private caption: Phaser.GameObjects.Text;
  private line: Phaser.GameObjects.Text;
  private hit: Phaser.GameObjects.Rectangle;
  /** The opened half, rebuilt on open. */
  private sheet: Phaser.GameObjects.GameObject[] = [];
  private sheetHeight = 0;
  private open = false;
  private hidden = false;
  /** Set by the tap that opened the sheet; the next draw plays the rows in rather than placing them. */
  private justOpened = false;

  private ledger?: InheritanceLedger;
  private ledgerKey = '';
  private headlines: Headline[] = [];
  /** Until when the house line holds the shut chip after the last change. */
  private houseUntil = 0;
  /** The ink caret after the house line: *this reign is still being written*. */
  private caret: Phaser.GameObjects.Image;
  private caretTimer?: Phaser.Time.TimerEvent;
  /** The topic an event pinned to the headline, until `holdUntil`. */
  private pinned?: Topic;
  private holdUntil = 0;
  private drawnKey = '';
  private chipTop = 0;
  private floor = 0;

  /**
   * @param onToggle Called after the sheet opens or shuts. The world scene's tap guard is a list
   *   the shell recomposes on every refresh, and a sheet that has just opened is not on it until
   *   the next tick — a tap on the sheet in that gap would select the province behind it.
   */
  constructor(private readonly scene: Phaser.Scene, private readonly onToggle?: () => void) {
    this.ui = new InkUI(scene);
    this.root = scene.add.container(0, 0).setDepth(DEPTH);
    this.skin = scene.add.graphics();
    // Built once: the banner can only change on the menu, between reigns.
    this.stamp = scene.add.container(0, 0);
    // The chip sits on the HUD for the whole run; its flag is baked rather than re-inked each frame.
    const banner = stampHouseBanner(scene, houseBanner(), BANNER_W, BANNER_H);
    banner.setPosition(-BANNER_W / 2, -BANNER_H / 2);
    this.stamp.add(banner);
    this.meter = scene.add.graphics();
    this.chevron = addConquestUiIcon(scene, 'chevron-up', 12);
    this.caption = scene.add.text(TEXT_X, 0, t('ascent.inherit.caption').toUpperCase(), {
      color: '#6b4f12',
      fontFamily: UI_FONT,
      fontSize: '8px',
      fontStyle: '700',
    }).setAlpha(0.85);
    this.caption.setLetterSpacing?.(1.2);
    this.line = scene.add.text(TEXT_X, 0, '', {
      color: '#2a2118',
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontStyle: '700',
      // One line only, fitted by `fitLine` — never wrapped, because a headline that wraps pushes
      // the chip up into the map.
    });
    this.caret = addConquestUiIcon(scene, 'chevron-up', 8).setOrigin(0, 0.5).setVisible(false);
    // A step, not a fade: the caret is the one loop the run keeps, and it reads as a cursor.
    this.caretTimer = scene.time.addEvent({
      delay: CARET_MS, loop: true,
      callback: () => { if (this.caret.active && this.caret.getData('on')) this.caret.setAlpha(this.caret.alpha > 0.5 ? 0.15 : 1); },
    });
    this.hit = scene.add.rectangle(SIDE, 0, WIDTH, HEIGHT, 0xffffff, 0.001)
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
      this.open = !this.open;
      this.justOpened = this.open;
      this.drawnKey = '';
      this.draw();
      this.onToggle?.();
    });
    this.root.add([this.skin, this.meter, this.stamp, this.caption, this.line, this.caret, this.chevron, this.hit]);
  }

  /** Everything the chip occupies, so the world scene never reads a press on it as a map tap. */
  tapBounds(): Array<{ x: number; y: number; width: number; height: number }> {
    if (this.hidden || !this.ledger) return [];
    return [{ x: SIDE, y: this.chipTop - this.sheetHeight, width: this.chipWidth(), height: this.chipHeight() + this.sheetHeight }];
  }

  /** The handle's own height: one line shut, the full card open. */
  private chipHeight(): number {
    return this.open ? HEIGHT : HEIGHT_COMPACT;
  }

  /** The shut pill's width, sized to the number it carries — see `draw`. */
  private compactWidth = WIDTH_COMPACT_MIN;

  /** The handle's width: a seal-sized pill shut, the full plate open. */
  private chipWidth(): number {
    return this.open ? WIDTH : this.compactWidth;
  }

  /** The chip's top edge, so the paused badge can stand above it rather than through it. */
  top(): number {
    return this.chipTop - this.sheetHeight;
  }

  visible(): boolean {
    return !this.hidden && this.ledger !== undefined;
  }

  setVisible(visible: boolean): void {
    this.hidden = !visible;
    this.root.setVisible(visible);
    // Hiding a Phaser container leaves its hit areas live — see `setContainerInputEnabled`.
    setContainerInputEnabled(this.root, visible);
    if (this.hit.input) this.hit.input.enabled = visible;
    // A sheet does not survive being hidden: the prompt that covered it may have changed every
    // figure on it, and a stale sheet reappearing after a card is worse than the chip alone.
    if (!visible && this.open) {
      this.open = false;
      this.drawnKey = '';
    }
  }

  /**
   * Re-reads the ledger when the run has moved, and parks the chip above `floor`.
   *
   * `floor` is passed in rather than assumed for the reason the map controls take theirs: an
   * inspect card raises the bottom of the free map area, and a chip drawn through a province card
   * is a chip nobody can read either half of.
   */
  render(state: GameState, floor: number): void {
    const ascent = state.ascent;
    if (!ascent) return;
    // An inspect card raising the floor shuts the sheet. Left open it rode up with the chip, and
    // at the 620 clamp an open sheet over a province card left the paused badge no room at all —
    // it printed under the advisor strip. A selection is a new context; the receipt can be
    // reopened where it now stands.
    if (floor !== this.floor && this.open) {
      this.open = false;
      this.drawnKey = '';
      this.onToggle?.();
    }
    this.floor = floor;

    // Only the inputs the ledger is a function of. `computeRunScore` is cheap but the three
    // localStorage stores behind it are not free per beat, and a fight refreshes this several
    // times a second while none of these move.
    const stacks = Object.values(ascent.cardStacks).reduce((sum, n) => sum + n, 0);
    const key = [
      ascent.wavesSurvived, Math.round(ascent.peakPower), stacks, ascent.heroesSummoned,
      ascent.rubbingsEarned ?? 0, state.campaignScore?.peakLandsHeld ?? 0, (state.chronicle ?? []).length,
    ].join(':');
    if (key !== this.ledgerKey) {
      this.ledgerKey = key;
      const previous = this.ledger;
      const next = readInheritance(state);
      if (!next) return;
      this.ledger = next;
      this.headlines = buildHeadlines(next);
      // Anything moving puts the house back on the chip for a while: the house is what every
      // change feeds, and the line that says so is the one the player came to see.
      this.houseUntil = this.scene.time.now + HOUSE_HOLD_MS;
      if (previous) this.announce(previous, next);
    }
    if (!this.ledger) return;

    // An event pins its topic until its hold runs out; the selection in `current` does the rest.
    const now = this.scene.time.now;
    if (this.pinned && now >= this.holdUntil) this.pinned = undefined;
    this.draw();
  }

  destroy(): void {
    this.clearSheet();
    this.caretTimer?.remove(false);
    this.caretTimer = undefined;
    this.root.destroy();
    this.plate = undefined;
  }

  // ── Events ────────────────────────────────────────────────────────────

  /** What changed between two readings, and whether it is worth a stamp. */
  private announce(before: InheritanceLedger, after: InheritanceLedger): void {
    const events: Array<{ topic: Topic; text: string }> = [];
    if (after.rubbings > before.rubbings) {
      events.push({ topic: 'seals', text: t('ascent.inherit.ping.rubbing', { n: after.rubbings - before.rubbings }) });
    }
    if (after.houseLevelAfter > before.houseLevelAfter) {
      events.push({ topic: 'house', text: t('ascent.inherit.ping.level', { level: after.houseLevelAfter }) });
    } else {
      // The "one more wave" moment: the distance to the next level drops under a wave's yield.
      const shortBefore = before.xpNeed - before.xpInto;
      const shortAfter = after.xpNeed - after.xpInto;
      if (shortBefore >= ALMOST_XP && shortAfter < ALMOST_XP) {
        events.push({ topic: 'house', text: t('ascent.inherit.ping.almost', { level: after.houseLevelAfter + 1 }) });
      }
    }
    if (after.recordBeaten && !before.recordBeaten) {
      events.push({ topic: 'record', text: t('ascent.inherit.ping.record') });
    } else if (after.rankAfter !== before.rankAfter) {
      events.push({ topic: 'record', text: after.rankAfter });
    }
    if (after.bind?.status === 'ready' && before.bind?.status !== 'ready') {
      events.push({ topic: 'bind', text: t('ascent.inherit.ping.bind') });
    } else if (after.bind?.status === 'new' && before.bind?.cardId !== after.bind.cardId) {
      events.push({ topic: 'bind', text: t('ascent.inherit.ping.newSeal') });
    }
    if (after.nextPerk && before.nextPerk && after.nextPerk.short === 0 && before.nextPerk.short > 0) {
      events.push({ topic: 'legacy', text: t('ascent.inherit.ping.perk') });
    }
    if (events.length === 0) return;
    // One stamp per reading, for the loudest thing: two seals landing in the same tick is a
    // stutter, not twice the news. The order above is the order of loudness.
    const first = events[0];
    this.pinned = first.topic;
    this.holdUntil = this.scene.time.now + EVENT_HOLD_MS;
    if (!this.hidden) this.punch(first.text);
  }

  /**
   * The seal lands, and a line climbs off it.
   *
   * The same two beats as the chiếu chỉ fanfare — the punch and what the punch throws off — at a
   * fifth of the size and with no scrim, because the world keeps moving under this one. No
   * particles; a ring swept out and gone is the whole of the effect.
   */
  private punch(text: string): void {
    const cx = SIDE + PAD + BANNER_W / 2;
    const cy = this.chipTop + HEIGHT / 2;

    this.scene.tweens.killTweensOf(this.stamp);
    this.stamp.setScale(1.5).setAlpha(0.4);
    this.scene.tweens.add({
      targets: this.stamp, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut',
    });

    // A Graphics has no origin and scales about its own position, so the ring is placed at the
    // banner and drawn about zero — drawn at (cx, cy) it would sweep off towards the corner.
    const ring = this.scene.add.graphics({ x: cx, y: cy }).setDepth(DEPTH + 1);
    ring.lineStyle(2, INK_UI.gold, 0.9);
    ring.strokeCircle(0, 0, BANNER_H / 2 + 2);
    this.scene.tweens.add({
      targets: ring, alpha: 0, scale: 1.9, duration: 520, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    // On a small plate of its own: it climbs out of the chip onto the map, and the map under this
    // corner is hatched paddy — type never sits on hatching. The plate is điệp with a gold edge,
    // the same paper as the chip, so the line reads as a slip torn off it.
    const rise = this.scene.add.container(cx + 12, cy - 6).setDepth(DEPTH + 1);
    const slip = this.scene.add.text(0, 0, text, {
      color: '#6b4f12', fontFamily: TITLE_FONT, fontSize: '12px', fontStyle: '700',
    }).setOrigin(0, 0.5);
    const plate = this.ui.panel({ x: -6, y: -10, width: slip.width + 12, height: 20 }, {
      cut: 3, borderWidth: 1, border: INK_UI.gold, borderAlpha: 0.85, fillAlpha: 0.95,
    });
    rise.add([plate, slip]);
    // Climbs for the whole of its life but only starts fading half way up: a line that fades from
    // the first frame is gone before the eye has moved from the map to the corner. Measured on
    // the first cut — a 1.5 s climb-and-fade never once appeared in a screenshot taken 260 ms in.
    this.scene.tweens.add({ targets: rise, y: cy - 36, duration: 2200, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({
      targets: rise, alpha: 0, delay: 1100, duration: 1100, ease: 'Sine.easeIn',
      onComplete: () => rise.destroy(true),
    });
  }

  // ── Drawing ───────────────────────────────────────────────────────────

  /**
   * House first, then the nearest milestone.
   *
   * An event's topic while it holds; the house line for `HOUSE_HOLD_MS` after any change; and
   * otherwise whichever other ledger has the least distance left to its next payout. The house
   * is also the fallback when nothing else is a distance, so the chip never goes blank.
   */
  private current(): Headline | undefined {
    if (this.headlines.length === 0) return undefined;
    if (this.pinned) {
      const pinned = this.headlines.find((headline) => headline.topic === this.pinned);
      if (pinned) return pinned;
    }
    const house = this.headlines.find((headline) => headline.topic === 'house');
    const now = this.scene.time.now;
    if (house && now < this.houseUntil) return house;
    let nearest: Headline | undefined;
    for (const headline of this.headlines) {
      if (headline.topic === 'house' || headline.remaining === undefined) continue;
      if (!nearest || headline.remaining < (nearest.remaining ?? 1)) nearest = headline;
    }
    if (!nearest || !house) return nearest ?? house ?? this.headlines[0];
    // At rest — nothing has moved for a while — the house still takes two thirds of the clock,
    // the nearest milestone the rest. Measured: the house on the shut chip at least half the run.
    return now % REST_CYCLE_MS < REST_HOUSE_MS ? house : nearest;
  }

  private draw(): void {
    const headline = this.current();
    const ledger = this.ledger;
    if (!headline || !ledger) return;

    // Everything the picture depends on. A tick that moves nothing re-inks nothing.
    const key = `${headline.text}|${headline.fill ?? '-'}|${headline.accent}|${this.floor}|${this.open ? 1 : 0}|${this.ledgerKey}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;

    this.clearSheet();
    const chipHeight = this.chipHeight();
    // Shut, the pill is as wide as its number: "+3,2…" was the fixed width clipping a score
    // the whole chip exists to show. Measured before the plate, which is sized from it.
    if (!this.open) {
      fitLine(this.line, `+${formatNumber(ledger.score)}`, WIDTH_COMPACT_MAX, [11]);
      this.compactWidth = Math.round(Math.min(WIDTH_COMPACT_MAX, Math.max(WIDTH_COMPACT_MIN, (TEXT_X - SIDE) + this.line.width + 12 + 18 + PAD)));
    }
    const chipWidth = this.chipWidth();
    this.chipTop = this.floor - FLOOR_GAP - chipHeight;
    if (this.open) this.buildSheet(ledger);
    const top = this.chipTop - this.sheetHeight;
    const height = chipHeight + this.sheetHeight;

    // The plate: a printed sheet, cut corners and a hand-pulled contour, the same object as every
    // panel and button in the game. It was a `fillRoundedRect` with a hairline — the advisor
    // strip's register — and beside the paused badge, which is a torn sheet with a shadow, it read
    // as a different product. Rebuilt only when its rectangle changes: `printedSurface` records a
    // few hundred path segments, which is not a per-beat cost.
    const plateKey = `${top}:${height}:${chipWidth}`;
    if (plateKey !== this.plateKey) {
      this.plateKey = plateKey;
      this.plate?.destroy();
      this.plate = this.ui.panel({ x: SIDE, y: top, width: chipWidth, height }, {
        border: INK_UI.brush, borderAlpha: 0.7, borderWidth: 1.3, fillAlpha: 0.97, cut: 5,
      });
      this.root.addAt(this.plate, 0);
    }
    // Over the plate: a rule down the left in the headline's ink, and the sheet's own head.
    this.skin.clear();
    this.skin.fillStyle(headline.accent, 0.85);
    this.skin.fillRect(SIDE + 3, this.chipTop + (this.open ? 7 : 5), 2.5, chipHeight - (this.open ? 14 : 10));
    if (this.open) {
      // A rule between the sheet and the chip, so the chip still reads as the handle.
      this.skin.lineStyle(1, PIGMENT.mucSoft, 0.3);
      this.skin.lineBetween(SIDE + PAD, this.chipTop + 0.5, SIDE + WIDTH - PAD, this.chipTop + 0.5);
    }

    // The banner, hung at the left. Positioned about its own centre so the punch can scale it —
    // and drawn small on the shut chip, where a full banner would be taller than the line.
    const cx = SIDE + PAD + BANNER_W / 2;
    const cy = this.chipTop + chipHeight / 2;
    this.stamp.setPosition(cx, cy);
    this.stamp.setScale(this.open ? 1 : BANNER_SCALE_COMPACT);

    // Shut, the chip is the headline alone: the caption and the meter are the open card's.
    this.caption.setVisible(this.open);
    this.caption.setPosition(TEXT_X, this.chipTop + 5);
    // `fitLine` skips the re-raster for an identical string at the first size; during a fight the
    // ledger key moves on every beat (POWER is in it) while the sentence usually does not.
    // The caret needs its own eight units after the line when the house is on the chip.
    const caretRoom = headline.topic === 'house' ? 12 : 0;
    // Shut, the chip says one number: what the reign has earned so far. The headline is the
    // open card's, with its meter and caption.
    if (this.open) {
      fitLine(this.line, headline.text, WIDTH - (TEXT_X - SIDE) - PAD - 14 - caretRoom, [11, 10, 9]);
    }
    this.line.setPosition(TEXT_X, this.open ? this.chipTop + 16 : Math.round(cy - this.line.height / 2));
    // The live reign card's caret: the reign being written, said without a word. Always on the
    // shut pill; on the open card only beside the house line. Blinked by the timer while `on`.
    const caretOn = !this.open || headline.topic === 'house';
    this.caret.setVisible(caretOn && this.caret.getData('conquestUiIcon').source === 'generated').setData('on', caretOn);
    if (caretOn) {
      this.caret.setPosition(TEXT_X + this.line.width + 4, this.line.y + this.line.height / 2 + 1);
      if (!this.caret.getData('was')) this.caret.setAlpha(1);
    }
    this.caret.setData('was', caretOn);

    this.meter.clear();
    if (headline.fill !== undefined && this.open) {
      const barY = this.chipTop + HEIGHT - 6;
      const barW = WIDTH - (TEXT_X - SIDE) - PAD;
      this.meter.fillStyle(INK_UI.brush, 0.16);
      this.meter.fillRect(TEXT_X, barY, barW, 2.5);
      this.meter.fillStyle(INK_UI.gold, 0.9);
      this.meter.fillRect(TEXT_X, barY, Math.max(2, barW * Math.min(1, Math.max(0, headline.fill))), 2.5);
    }

    this.chevron.setPosition(SIDE + chipWidth - PAD - 3, cy).setAngle(this.open ? 180 : 0);

    // The hit area covers chip and sheet. Resized in place, never re-registered: a second
    // `setInteractive` replaces the handler and drops the listener bound to the first.
    this.hit.setPosition(SIDE, top);
    this.hit.setSize(chipWidth, height);
    const area = this.hit.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    area?.setSize(chipWidth, height);

    // The skin sits above the plate and under everything else: index 1, with the plate at 0.
    this.root.moveTo(this.skin, Math.min(1, this.root.length - 1));

    // A sheet that appears is a sheet that was always there; one that rises was opened. The
    // rows come in from a few units below, staggered, and the plate fades up under them.
    if (this.justOpened && this.open) {
      this.justOpened = false;
      if (this.plate) {
        this.plate.setAlpha(0.35);
        this.scene.tweens.add({ targets: this.plate, alpha: 1, duration: motionMs(160), ease: 'Sine.easeOut' });
      }
      this.sheet.forEach((object, index) => {
        const target = object as Phaser.GameObjects.GameObject & { y?: number; setAlpha?: (a: number) => unknown; setY?: (y: number) => unknown };
        if (typeof target.y !== 'number' || !target.setAlpha) return;
        const restY = target.y;
        target.setAlpha(0);
        target.setY?.(restY + 10);
        this.scene.tweens.add({ targets: target, alpha: 1, y: restY, duration: motionMs(220), delay: Math.min(index, 8) * motionMs(25), ease: 'Sine.easeOut' });
      });
      this.line.setAlpha(0);
      this.caption.setAlpha(0);
      this.scene.tweens.add({ targets: [this.line, this.caption], alpha: { getEnd: (t: Phaser.GameObjects.Text) => (t === this.caption ? 0.85 : 1) }, duration: motionMs(200), delay: motionMs(80) });
    }
  }

  private clearSheet(): void {
    for (const object of this.sheet) object.destroy();
    this.sheet = [];
    this.sheetHeight = 0;
  }

  /**
   * The opened half: every row at once, above the chip.
   *
   * Above rather than below because below is the action bar. Six rows of label and value, each
   * with its topic's rule on the left, and a line at the head saying when all of it is paid. A
   * row is one line — the sheet is a receipt, not a page, and the dynasty and cabinet screens on
   * the menu are where the long form lives.
   */
  private buildSheet(ledger: InheritanceLedger): void {
    const ROW = 19;
    const rows: Array<{ label: string; value: string; accent: number }> = [
      { label: t('ascent.inherit.sheet.house'), value: sheetHouse(ledger), accent: INK_UI.gold },
      { label: t('ascent.inherit.sheet.seals'), value: sheetSeals(ledger), accent: INK_UI.gold },
      { label: t('ascent.inherit.sheet.bind'), value: sheetBind(ledger), accent: INK_UI.gold },
      { label: t('ascent.inherit.sheet.legacy'), value: sheetLegacy(ledger), accent: INK_UI.jade },
      { label: t('ascent.inherit.sheet.record'), value: sheetRecord(ledger), accent: ledger.recordBeaten ? INK_UI.gold : INK_UI.brush },
      { label: t('ascent.inherit.sheet.heroes'), value: sheetHeroes(ledger), accent: INK_UI.jade },
    ];
    const headH = 30;
    this.sheetHeight = headH + rows.length * ROW + 8;
    const top = this.chipTop - this.sheetHeight;

    const title = this.scene.add.text(SIDE + PAD, top + 7, t('ascent.inherit.sheet.title'), {
      color: '#6b4f12', fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
    });
    this.sheet.push(title);
    const score = this.scene.add.text(SIDE + WIDTH - PAD, top + 6,
      t('ascent.inherit.sheet.score', { score: formatNumber(ledger.score) }), {
        color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '11px', fontStyle: '700', align: 'right',
      }).setOrigin(1, 0);
    this.sheet.push(score);

    const rules = this.scene.add.graphics();
    this.sheet.push(rules);
    // The răng cưa under the head — the mark the Reckoning plate and every edict in the game
    // carry, and what makes this a receipt rather than a list.
    sawtoothBand(rules, SIDE + PAD, top + headH - 6, WIDTH - PAD * 2, 3.5, 0.32);
    rows.forEach((row, index) => {
      const y = top + headH + index * ROW;
      rules.fillStyle(row.accent, 0.75);
      rules.fillRect(SIDE + PAD, y + 4, 2, ROW - 8);
      const label = this.scene.add.text(SIDE + PAD + 7, y + 3, row.label, {
        color: '#5a4c39', fontFamily: UI_FONT, fontSize: '9px',
      });
      const value = this.scene.add.text(SIDE + PAD + 64, y + 2, '', {
        color: '#2a2118', fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
      });
      fitLine(value, row.value, WIDTH - PAD * 2 - 64, [10, 9, 8.5]);
      this.sheet.push(label, value);
    });
    // Added after the height is known so `draw` paints one plate behind both halves. Container
    // children are not depth-sorted; `draw` sends the skin to the back afterwards.
    this.root.add(this.sheet);
  }
}

// ── The lines ───────────────────────────────────────────────────────────

/**
 * The headlines the chip rotates through, one per topic that has something to say.
 *
 * A topic with nothing to report is left out rather than printed empty — "0 champions called" is a
 * line about what the player has not done, and the chip exists to say what they have.
 */
function buildHeadlines(ledger: InheritanceLedger): Headline[] {
  const lines: Headline[] = [];
  const card = ledger.bind ? cardName(ledger.bind.cardId) : '';

  // House: the one line that is always there — every reign feeds it from the first wave.
  if (ledger.picksGained > 0) {
    lines.push({
      topic: 'house', accent: INK_UI.gold, fill: ledger.xpInto / Math.max(1, ledger.xpNeed),
      text: ledger.picksGained === 1
        ? t('ascent.inherit.house.rise', { level: ledger.houseLevelAfter })
        : t('ascent.inherit.house.riseMany', { level: ledger.houseLevelAfter, n: ledger.picksGained }),
    });
  } else {
    lines.push({
      topic: 'house', accent: INK_UI.gold, fill: ledger.xpInto / Math.max(1, ledger.xpNeed),
      text: t('ascent.inherit.house.gain', {
        xp: formatNumber(ledger.xp),
        level: ledger.houseLevelAfter + 1,
        need: formatNumber(Math.max(0, ledger.xpNeed - ledger.xpInto)),
      }),
    });
  }

  // Gold, not cinnabar: on this screen sỏi son is the advisor's alarm and the whisper's threat,
  // and a rubbing earned is the opposite of either. The same rule the tile edges on the
  // Reckoning follow — the reward colour is hoè.
  lines.push({
    topic: 'seals', accent: INK_UI.gold, fill: 1 - ledger.wavesToRubbing / 10,
    remaining: ledger.wavesToRubbing / 10,
    text: ledger.rubbings === 1
      ? t('ascent.inherit.seals.one', { waves: ledger.wavesToRubbing })
      : t('ascent.inherit.seals.count', { n: ledger.rubbings, waves: ledger.wavesToRubbing }),
  });

  if (ledger.bind) {
    const b = ledger.bind;
    const text = b.status === 'new' ? t('ascent.inherit.bind.new', { card })
      : b.status === 'ready' ? t('ascent.inherit.bind.ready', { card })
        : b.status === 'melt' ? t('ascent.inherit.bind.melt', { card, legacy: b.melt })
          : t('ascent.inherit.bind.copy', { card, n: b.copies, need: b.need });
    lines.push({
      topic: 'bind', accent: INK_UI.gold,
      ...(b.status === 'copy' ? { fill: b.copies / Math.max(1, b.need), remaining: (b.need - b.copies) / Math.max(1, b.need) } : {}),
      ...(b.status === 'ready' ? { remaining: 0 } : {}),
      text,
    });
  }

  if (ledger.legacy > 0 || ledger.nextPerk) {
    const perk = ledger.nextPerk ? perkName(ledger.nextPerk.id) : '';
    lines.push({
      topic: 'legacy', accent: INK_UI.jade,
      ...(ledger.nextPerk ? { remaining: ledger.nextPerk.short / Math.max(1, ledger.nextPerk.short + ledger.legacyTotalAfter) } : {}),
      text: !ledger.nextPerk
        ? t('ascent.inherit.legacy.plain', { n: formatNumber(ledger.legacy) })
        : ledger.nextPerk.short === 0
          ? t('ascent.inherit.legacy.ready', { n: formatNumber(ledger.legacy), perk })
          : t('ascent.inherit.legacy.gain', { n: formatNumber(ledger.legacy), perk, short: formatNumber(ledger.nextPerk.short) }),
    });
  }

  if (ledger.bestScore <= 0) {
    lines.push({ topic: 'record', accent: INK_UI.brush, text: t('ascent.inherit.record.first') });
  } else if (ledger.recordBeaten) {
    lines.push({
      topic: 'record', accent: INK_UI.gold,
      text: t('ascent.inherit.record.new', { over: formatNumber(ledger.recordDiff) }),
    });
  } else if (ledger.nextRank && ledger.nextRank.short < ledger.recordDiff) {
    lines.push({
      topic: 'record', accent: INK_UI.brush, fill: ledger.score / Math.max(1, ledger.nextRank.minScore),
      remaining: ledger.nextRank.short / Math.max(1, ledger.nextRank.minScore),
      text: t('ascent.inherit.rank.next', { rank: ledger.nextRank.label, short: formatNumber(ledger.nextRank.short) }),
    });
  } else {
    lines.push({
      topic: 'record', accent: INK_UI.brush, fill: ledger.score / Math.max(1, ledger.bestScore),
      remaining: ledger.recordDiff / Math.max(1, ledger.bestScore),
      text: t('ascent.inherit.record.chase', { diff: formatNumber(ledger.recordDiff) }),
    });
  }

  if (ledger.founderName) {
    lines.push({ topic: 'heroes', accent: INK_UI.jade, text: t('ascent.inherit.hero.founder', { name: ledger.founderName }) });
  } else if (ledger.harnessWavesLeft !== undefined && ledger.harnessWavesLeft > 0) {
    lines.push({
      topic: 'heroes', accent: INK_UI.jade, fill: 1 - ledger.harnessWavesLeft / 10, remaining: ledger.harnessWavesLeft / 10,
      text: t('ascent.inherit.hero.harness', { left: ledger.harnessWavesLeft }),
    });
  } else if (ledger.heroesSummoned > 0) {
    lines.push({
      topic: 'heroes', accent: INK_UI.jade,
      text: t('ascent.inherit.hero.called', { n: ledger.heroesSummoned, pts: formatNumber(ledger.heroPoints) }),
    });
  }

  // Stable order, so the rotation reads the same way every reign.
  return TOPICS.map((topic) => lines.find((line) => line.topic === topic)).filter((line): line is Headline => Boolean(line));
}

function sheetHouse(ledger: InheritanceLedger): string {
  return ledger.picksGained > 0
    ? t('ascent.inherit.row.houseRise', { xp: formatNumber(ledger.xp), level: ledger.houseLevelAfter, n: ledger.picksGained })
    : t('ascent.inherit.row.house', { xp: formatNumber(ledger.xp), need: formatNumber(Math.max(0, ledger.xpNeed - ledger.xpInto)) });
}

function sheetSeals(ledger: InheritanceLedger): string {
  return t('ascent.inherit.row.seals', { n: ledger.rubbings, waves: ledger.wavesToRubbing });
}

function sheetBind(ledger: InheritanceLedger): string {
  if (!ledger.bind) return t('ascent.inherit.row.bindNone');
  const card = cardName(ledger.bind.cardId);
  switch (ledger.bind.status) {
    case 'new': return t('ascent.inherit.row.bindNew', { card });
    case 'ready': return t('ascent.inherit.row.bindReady', { card });
    case 'melt': return t('ascent.inherit.row.bindMelt', { card, legacy: ledger.bind.melt });
    default: return t('ascent.inherit.row.bindCopy', { card, n: ledger.bind.copies, need: ledger.bind.need });
  }
}

function sheetLegacy(ledger: InheritanceLedger): string {
  const n = formatNumber(ledger.legacy);
  const total = formatNumber(ledger.legacyTotalAfter);
  if (!ledger.nextPerk) return t('ascent.inherit.row.legacyPlain', { n, total });
  const perk = perkName(ledger.nextPerk.id);
  return ledger.nextPerk.short === 0
    ? t('ascent.inherit.row.legacyReady', { n, total, perk })
    : t('ascent.inherit.row.legacy', { n, total, perk, short: formatNumber(ledger.nextPerk.short) });
}

function sheetRecord(ledger: InheritanceLedger): string {
  if (ledger.bestScore <= 0) return t('ascent.inherit.row.recordFirst', { rank: ledger.rankAfter });
  return ledger.recordBeaten
    ? t('ascent.inherit.row.recordNew', { over: formatNumber(ledger.recordDiff), rank: ledger.rankAfter })
    : t('ascent.inherit.row.record', { best: formatNumber(ledger.bestScore), diff: formatNumber(ledger.recordDiff), rank: ledger.rankAfter });
}

function sheetHeroes(ledger: InheritanceLedger): string {
  if (ledger.founderName) return t('ascent.inherit.row.founder', { name: ledger.founderName });
  return ledger.harnessWavesLeft !== undefined && ledger.harnessWavesLeft > 0
    ? t('ascent.inherit.row.harness', { n: ledger.heroesSummoned, left: ledger.harnessWavesLeft })
    : t('ascent.inherit.row.heroes', { n: ledger.heroesSummoned, pts: formatNumber(ledger.heroPoints) });
}

/**
 * Makes a one-line text fit a width: shrinks through the given sizes, then trims with an ellipsis.
 *
 * `wordWrap` + `maxLines: 1` clips at a word boundary and says nothing about having done so —
 * "Cấm Quân — the Imperial Guard · a" was the first bind headline seen in a review crop. Card
 * names run to 35 characters and rank labels to 27, and the chip is 256 wide, so some lines will
 * not fit at 11px however they are written. Two steps down in size is as far as legibility goes
 * on a phone; past that the tail is cut and marked as cut.
 */
function fitLine(label: Phaser.GameObjects.Text, text: string, maxWidth: number, sizes: number[]): void {
  for (const size of sizes) {
    label.setFontSize(size);
    if (label.text !== text) label.setText(text);
    if (label.width <= maxWidth) return;
  }
  let trimmed = text;
  while (trimmed.length > 4 && label.width > maxWidth) {
    trimmed = `${trimmed.slice(0, -2).trimEnd()}…`;
    label.setText(trimmed);
  }
}

function cardName(id: string): string {
  return t(`ascent.card.${id}` as Parameters<typeof t>[0]);
}

function perkName(id: string): string {
  return t(`empire.legacy.perk.${id}` as Parameters<typeof t>[0]);
}
