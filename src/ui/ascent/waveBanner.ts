import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, surfaceWidth } from '../../game/constants';
import { INK_UI } from '../InkUI';
import { PIGMENT, shadePigment } from '../ink/palette';
import { clearPlate, heron, sawtoothBand } from '../ink/devices';
import { inkPath } from '../ink/stroke';
import { TITLE_FONT, UI_FONT } from '../fonts';
import { formatNumber } from '../../utils/format';
import { t } from '../../i18n';
import type { AscentWaveCue } from '../../state/types';

/**
 * **The chiếu — a proclamation unrolled across the middle of the screen.**
 *
 * The wave is the mode. Everything in Dragon Ascent is priced against it, the whole ambition dial
 * exists to size it, and the run's score is mostly a count of how many were outlived. It reached
 * the screen as *one line in the header strip* — the same strip, the same 10px type, the same grey,
 * as a granary finishing. The single most consequential event in the mode was typographically
 * indistinguishable from the least, which is why a run could go twenty minutes without the player
 * ever being sure an invasion had started, let alone that they had just won one.
 *
 * So the lifecycle is announced the way an edict is announced: a strip of điệp paper unrolls, the
 * răng cưa closes it top and bottom, and it is read. Two beats, one for each end of the invasion:
 *
 *   - **the landing** — sỏi son, a drumbeat shudder, who is marching and with what.
 *   - **the result** — light behind the paper, a lacquer medallion punched onto its head, and
 *     the figures that say what it cost, counting up.
 *
 * It is still a woodblock print. Everything here is drawn with the same ink primitives as the map:
 * no particles, no glow, no colour outside the pigments. The weight comes from the *punch* of the
 * medallion and the sweep of the rays — the way a chop lands on paper — as `arrivalFanfare`
 * earns its moment, and for the same reason: this is one of the two places in the run where the
 * game is allowed to raise its voice.
 *
 * **Depth 470**, deliberately under the modal layer at 500. A card that opens covers the banner
 * rather than fighting it, and the banner never covers a decision the player has to make.
 */
const BANNER_DEPTH = 470;

/** How long before a tap anywhere will dismiss the banner. See the `skipZone` note below. */
const SKIP_HINT_DELAY = 600;

/** Side margin the title is squeezed to fit inside. */
const PAD_X = 22;
/**
 * The medallion's radius.
 *
 * 21 puts it at 42 across, which is the smallest a twelve-ray sun survives at: at 34 the rays
 * close up into a filled disc on a 2× phone screen and the three devices stop being three.
 */
const EMBLEM_RADIUS = 21;
/**
 * Paper above the title, and below the last line. The răng cưa lives inside both.
 *
 * The head has to clear the medallion, which hangs off the top edge and reaches `EMBLEM_RADIUS + 3`
 * into the sheet. 27 is that plus the leading the 25px title wants anyway.
 */
const PAD_TOP = 27;
const PAD_BOTTOM = 17;
/** Leading of one label/value row in the stat block. */
const ROW_PITCH = 17;
/** How far the stat columns stand in from the plate's edges. */
const STAT_X = 46;

/**
 * How long the plate stands still, and it is derived from what is printed on it.
 *
 * **The hold is not the reading time**, which is what made the first numbers wrong. The plate is
 * not fully legible at t=0: the unroll runs 260 ms, the type fades up until 520, and the figures
 * are still counting until 760. The hold then starts from a 560 ms lead-in. So a 2300 ms hold on a
 * result gave a reader 2860 − 760 ≈ **2.1 seconds** to take in a title, a line of prose, four
 * label/value rows and a headline counter — around thirty words and four numbers. Measured against
 * ordinary careful reading that is roughly half of what it needs.
 *
 * Erring long is close to free here: a tap anywhere dismisses the banner, so an impatient player
 * pays nothing for a generous hold, while a hurried one cannot get the time back. Every number
 * below has been raised twice on that reasoning, both times because the plate still read as
 * hurried in play - 2300, then 4200, now 6600 for the usual four-row result. Reading a small table
 * is slower than reading prose of the same length, and this one arrives unannounced over a moving
 * map, so the reader spends the first beat working out that it is there at all.
 *
 * A landing carries a title and one line and is sized flat. A result grows with its own stat block
 * rather than taking a single number for every shape it can be.
 *
 * On screen, end to end (lead-in + hold + the 420 ms fall):
 *
 *   landing            560 + 3800 + 450 = 4.8 s
 *   result, 2 rows     560 + 6800 + 450 = 7.8 s
 *   result, 4 rows     560 + 8400 + 450 = 9.4 s
 *
 * The result may be this long because **the world stops for it** - see `playPendingWaveCue`. A
 * landing does not stop anything and is still sized to be read at a glance while the map moves
 * under it.
 */
const HOLD_START = 3800;
const HOLD_END_BASE = 5200;
/** Added per label/value row on a result. Four rows is the usual case, giving 8400. */
const HOLD_END_PER_ROW = 800;

function holdFor(cue: AscentWaveCue, rowCount: number): number {
  return cue.phase === 'start' ? HOLD_START : HOLD_END_BASE + rowCount * HOLD_END_PER_ROW;
}

/** Vertical centre of the plate. Above the action bar, below the HUD, in the map's dead middle. */
function bandCentre(): number {
  return Math.round(GAME_HEIGHT * 0.42);
}

interface Outcome {
  /** The pigment the whole banner is keyed to. */
  accent: number;
  /** Title string, already interpolated. */
  title: string;
  /** One line under it. */
  subtitle: string;
  /** Whether the rays sweep and the laurel is drawn — only a win earns them. */
  celebrate: boolean;
  /** Which device the medallion carries. */
  emblem: EmblemKind;
}

/**
 * The four faces of the medallion, and each one is a **statement about the war**, not a decoration.
 *
 * The first cut put the drum sun on a win and the same sun cracked on a loss, which is a pretty
 * pairing that says nothing: the sun is the register's signature, so it read as "this is a Dong Son
 * banner" rather than as "you won". A badge whose whole job is to be understood before the words
 * are read has to carry the *event*.
 *
 *   - `march` - a sword crossed with a spear. War is about to begin. Dong Son drum warriors carry
 *     exactly these two arms, so the pairing is the period's own and not a heraldic import.
 *   - `triumph` - **chim Lac in flight**, the long-billed water bird that circles the sun on the
 *     Ngoc Lu tympanum. It is the Lac Viet's own emblem, and a bird put back into the air is what
 *     the end of a war looks like in this vocabulary - the same reading a dove carries elsewhere,
 *     in the register the rest of the game is drawn in.
 *   - `held` - the lotus. Bloodied but standing: the flower that comes up clean out of the mud, and
 *     the plainest thing in Vietnamese imagery for surviving what you were put through.
 *   - `overrun` - a citadel breached, its wall opened and its rubble spilling into the gap. The
 *     empire, thrown down.
 *
 * All four are read at 42px across on a phone, so each is a silhouette and a count of strokes.
 * Nothing is written on any of them: the game ships in English and quoc ngu, and a Han glyph would
 * be decoration pretending to be information.
 */
type EmblemKind = 'march' | 'triumph' | 'held' | 'overrun';

/**
 * The medallion pinned to the head of the proclamation - **the badge that says what this was**.
 *
 * The banner already says "INVASION 7 BROKEN" in 25px gold, and that is a *sentence*: it has to be
 * read before it means anything. A win and a loss looked, at a glance across a phone held at arm's
 * length, like the same object in two colours. This is the half-second version - a shape the eye
 * takes in before the words resolve, and the thing that makes the plate read as something awarded
 * rather than something announced.
 *
 * Drawn here rather than in `ink/devices.ts` because it is one device with one caller and its
 * geometry is tuned to this plate's head. It borrows the register wholesale: a lacquer ground, a
 * cream device, and a cream keyline set in from the rim.
 */
function emblem(g: Phaser.GameObjects.Graphics, radius: number, accent: number, kind: EmblemKind): void {
  const cream = 0xfbf2df;
  /** The box every device is drawn inside. Anything outside it collides with the keyline. */
  const box = radius * 0.7;
  const stroke = (width: number, alpha = 0.95): void => { g.lineStyle(width, cream, alpha); };

  // The wreath first, behind the disc: two sprigs climbing the sides and closing over the top,
  // six leaves each. It is the one piece of this that is pure ceremony, so only a win gets it -
  // and it climbs *upward* rather than fanning below, because the medallion hangs off the top edge
  // of the sheet and everything under it is buried in paper. Fanned downward, as the first cut had
  // it, the whole wreath read as a row of five dots stuck to the plate's rule.
  if (kind === 'triumph' || kind === 'held') {
    for (const side of [-1, 1]) {
      for (let leaf = 0; leaf < 6; leaf += 1) {
        const along = leaf / 5;
        // From just above the horizontal round to nearly the crown, on each side.
        const angle = Math.PI * (side < 0 ? 1.02 + along * 0.4 : 1.98 - along * 0.4);
        const cx = Math.cos(angle) * radius * 1.3;
        const cy = Math.sin(angle) * radius * 1.3;
        // Each leaf lies along the wreath rather than across it, and they shorten toward the crown
        // the way a real sprig tapers.
        const lean = angle + Math.PI / 2 - side * 0.34;
        const long = radius * (0.5 - along * 0.15);
        const wide = radius * (0.21 - along * 0.06);
        const tip = { x: Math.cos(lean) * long, y: Math.sin(lean) * long };
        const across = { x: Math.cos(lean + Math.PI / 2) * wide, y: Math.sin(lean + Math.PI / 2) * wide };
        g.fillStyle(accent, 0.74 - along * 0.17);
        g.fillPoints([
          { x: cx - tip.x * 0.5, y: cy - tip.y * 0.5 },
          { x: cx + across.x, y: cy + across.y },
          { x: cx + tip.x * 0.7, y: cy + tip.y * 0.7 },
          { x: cx - across.x, y: cy - across.y },
        ], true);
      }
    }
  }

  // A citadel thrown down breaks the disc it is stamped on: the two halves are drawn apart along a
  // diagonal, which is half the read at a glance and costs no second colour to say.
  const split = kind === 'overrun' ? 2.4 : 0;

  g.fillStyle(accent, 0.94);
  if (split > 0) {
    g.fillCircle(-split, -split, radius);
    g.fillCircle(split, split, radius);
  } else {
    g.fillCircle(0, 0, radius);
  }
  g.lineStyle(1.2, cream, 0.45);
  g.strokeCircle(-split, -split, radius - 3.5);

  if (kind === 'march') {
    // A sword crossed with a spear. Two *different* arms rather than two of the same, because a
    // pair of identical sticks at this size is a saltire, not a weapon.
    //
    // The spear runs bottom-right to top-left: a thin shaft and a leaf head. The sword runs the
    // other way: a broad blade, a crossguard and a pommel - the three marks `CardIcons.blade`
    // found were the minimum before it read as a tick.
    const d = box * 0.72;

    stroke(1.9);
    g.lineBetween(d, d, -d * 0.72, -d * 0.72);
    g.fillStyle(cream, 0.95);
    g.fillPoints([
      { x: -d * 1.12, y: -d * 1.12 },
      { x: -d * 0.5, y: -d * 0.92 },
      { x: -d * 0.92, y: -d * 0.5 },
    ], true);

    stroke(3.1);
    g.lineBetween(-d * 0.86, d * 0.86, d * 0.98, -d * 0.98);
    stroke(2.1);
    g.lineBetween(-d * 1.04, d * 0.44, -d * 0.32, d * 1.04);
    g.fillStyle(cream, 0.95);
    g.fillCircle(-d * 1.04, d * 1.04, 1.9);
  } else if (kind === 'triumph') {
    // Chim Lac, in the air. `heron` is the same bird the wave meter inks in, drawn at a scale that
    // fits the disc: it spans about 21 units at s = 1, so the disc's own width sets s.
    heron(g, 0, -box * 0.04, (box * 2.2) / 21, true, cream);
  } else if (kind === 'held') {
    // A lotus: five petals off a common foot.
    const unit = box * 0.78;
    stroke(Math.max(1.2, radius * 0.09));
    for (let petal = -2; petal <= 2; petal += 1) {
      const angle = -Math.PI / 2 + petal * 0.5;
      g.strokePoints([
        { x: 0, y: unit * 0.95 },
        { x: Math.cos(angle) * unit * 1.15, y: Math.sin(angle) * unit * 0.95 },
        { x: Math.cos(angle) * unit * 0.62, y: -unit * 0.95 },
      ], false, false);
    }
  } else {
    // A citadel breached. Two standing stubs of crenellated wall, the middle carried away, and the
    // rubble of it fallen into the gap. Solid fills rather than outlines: at 42px an outlined wall
    // with a hole in it is a scribble, while the silhouette survives being squinted at.
    const w = box * 1.06;
    const merlon = w * 0.26;
    g.fillStyle(cream, 0.95);
    // Two stubs of wall, each keeping its own pair of merlons, with a full third of the device
    // empty between them. The gap is the whole point and the first cut lost it: the rubble was
    // drawn tall enough to close the breach, so the badge read as one solid block with two notches
    // filed in the top.
    for (const side of [-1, 1]) {
      const outer = side * w;
      const inner = side * w * 0.54;
      const left = Math.min(outer, inner);
      const span = Math.abs(outer - inner);
      g.fillRect(left, -box * 0.04, span, box * 0.78);
      g.fillRect(left, -box * 0.48, merlon, box * 0.46);
      g.fillRect(left + span - merlon, -box * 0.48, merlon, box * 0.46);
    }
    // The rubble of the carried-away middle, spilled low across the gap: a broken edge, not a gate.
    g.fillPoints([
      { x: -w * 0.54, y: box * 0.74 },
      { x: -w * 0.54, y: box * 0.34 },
      { x: -w * 0.2, y: box * 0.56 },
      { x: w * 0.08, y: box * 0.3 },
      { x: w * 0.54, y: box * 0.74 },
    ], true);
    // One block thrown clear of it.
    g.fillRect(w * 0.16, box * 0.06, merlon * 0.66, merlon * 0.6);
  }
}

/**
 * The one place a cue is turned into words and a colour.
 *
 * Soi son is the player's pigment and is spent on the player alone, which cuts both ways here: the
 * landing is red because it is *aimed at them*, and the overrun is red because it is their loss.
 * A triumph is hoa hoe - sophora, lamplight - and a bloodied hold is gi dong, the patina on a
 * thing that survived.
 */
function readCue(cue: AscentWaveCue): Outcome {
  if (cue.phase === 'start') {
    return {
      accent: PIGMENT.son,
      title: cue.boss
        ? t('ascent.banner.startBoss', { wave: cue.wave })
        : t('ascent.banner.start', { wave: cue.wave }),
      // Display type, so the count noun is inflected rather than parenthesised. "4 host(s)" is
      // acceptable in a 10px log line and is not acceptable printed under a 25px heading.
      subtitle: t(
        cue.kingdomName
          ? (cue.hosts === 1 ? 'ascent.banner.startSubOne' : 'ascent.banner.startSub')
          : (cue.hosts === 1 ? 'ascent.banner.startSubAnonOne' : 'ascent.banner.startSubAnon'),
        {
          kingdom: cue.kingdomName ?? '',
          hosts: cue.hosts,
          power: formatNumber(Math.round(cue.power)),
        },
      ),
      celebrate: false,
      emblem: 'march',
    };
  }

  if (cue.outcome === 'overrun') {
    return {
      accent: PIGMENT.son,
      title: t('ascent.banner.endOverrun', { wave: cue.wave }),
      subtitle: t('ascent.banner.endSubOverrun'),
      celebrate: false,
      emblem: 'overrun',
    };
  }

  if (cue.outcome === 'held') {
    return {
      accent: PIGMENT.giDong,
      title: t('ascent.banner.endHeld', { wave: cue.wave }),
      subtitle: t('ascent.banner.endSubHeld', { lost: cue.landsLost ?? 0 }),
      celebrate: true,
      emblem: 'held',
    };
  }

  return {
    accent: INK_UI.gold,
    title: cue.boss
      ? t('ascent.banner.endBossTriumph', { wave: cue.wave })
      : t('ascent.banner.endTriumph', { wave: cue.wave }),
    subtitle: t('ascent.banner.endSubTriumph'),
    celebrate: true,
    emblem: 'triumph',
  };
}

/** A label/value row on the result banner. The value counts up; the label does not. */
interface StatRow {
  label: string;
  value: number;
  /** Rendered ahead of the figure — the `+` on momentum is not part of the number. */
  prefix?: string;
}

function statsFor(cue: AscentWaveCue): StatRow[] {
  if (cue.phase === 'start') return [];
  const rows: StatRow[] = [];
  if ((cue.hostsBroken ?? 0) > 0) {
    rows.push({ label: t('ascent.banner.hostsBroken'), value: cue.hostsBroken ?? 0 });
  }
  rows.push({ label: t('ascent.banner.provinces'), value: cue.landsHeld ?? 0 });
  if ((cue.momentum ?? 0) > 0) {
    rows.push({ label: t('ascent.banner.momentum'), value: cue.momentum ?? 0, prefix: '+' });
  }
  rows.push({ label: t('ascent.banner.seasons'), value: cue.seasons ?? 1 });
  return rows;
}

/**
 * Plays one banner and destroys itself.
 *
 * Returns a handle so the scene can cut a banner short — a run ending, or a newer cue arriving,
 * must not leave a proclamation hanging.
 */
export function playWaveBanner(
  scene: Phaser.Scene,
  cue: AscentWaveCue,
  onDone?: () => void,
): { skip: () => void; destroy: () => void } {
  const outcome = readCue(cue);
  const rows = statsFor(cue);
  const centre = bandCentre();
  const halfW = GAME_WIDTH / 2;

  // Centred on the sheet: the proclamation is built 390 wide and the desktop sheet is wider.
  const offset = Math.round((surfaceWidth() - GAME_WIDTH) / 2);
  const root = scene.add.container(offset, 0).setDepth(BANNER_DEPTH);
  let finished = false;
  /** Declared up here so `finish` can cancel them; both are assigned once the plate is built. */
  let holdTimer: Phaser.Time.TimerEvent | undefined;
  let armTimer: Phaser.Time.TimerEvent | undefined;

  // ── the type, before the paper ──────────────────────────────────────────────
  //
  // Built first and measured, because the plate is sized to fit it rather than the other way
  // round. A fixed height is wrong in both directions the moment the game is read in Vietnamese:
  // "Giữ được nước — mất 2 châu." wraps where the English does not, and a landing has no stat
  // block at all. Everything below is positioned from the *measured* stack.
  const accentHex = `#${outcome.accent.toString(16).padStart(6, '0')}`;

  const title = scene.add.text(0, 0, outcome.title, {
    color: accentHex, fontFamily: TITLE_FONT, fontSize: '25px', fontStyle: '700', align: 'center',
  }).setOrigin(0.5, 0);
  // A proclamation is one line. Long Vietnamese titles ("ĐÃ PHÁ ĐẠI XÂM LƯỢC 12") overrun a
  // 390-wide sheet at 25px, and they are squeezed rather than wrapped: two lines of display type
  // would push the figures off the plate and turn the heading into a paragraph.
  if (title.width > GAME_WIDTH - PAD_X * 2) {
    title.setScale((GAME_WIDTH - PAD_X * 2) / title.width, 1);
  }

  const subtitle = scene.add.text(0, 0, outcome.subtitle, {
    color: '#5a4c39', fontFamily: UI_FONT, fontSize: '11px', align: 'center',
    wordWrap: { width: GAME_WIDTH - PAD_X * 2 - 20 },
  }).setOrigin(0.5, 0);

  const outlived = cue.phase === 'end' && (cue.survived ?? 0) > 0
    ? scene.add.text(0, 0, cue.survived === 1
      ? t('ascent.banner.survivedOne')
      : t('ascent.banner.survived', { n: cue.survived ?? 0 }), {
      color: accentHex, fontFamily: UI_FONT, fontSize: '11.5px', fontStyle: '700', align: 'center',
    }).setOrigin(0.5, 0)
    : undefined;

  // ── the plate, sized to what it has to hold ─────────────────────────────────
  const titleTop = PAD_TOP;
  const ruleY = titleTop + title.height + 4;
  const subtitleTop = ruleY + 7;
  const statsTop = subtitleTop + subtitle.height + (rows.length > 0 ? 13 : 0);
  const statsBottom = statsTop + rows.length * ROW_PITCH;
  const outlivedRuleY = statsBottom + 8;
  const outlivedTop = outlivedRuleY + 6;
  const height = Math.round(
    (outlived ? outlivedTop + outlived.height : statsBottom) + PAD_BOTTOM,
  );
  const halfH = height / 2;
  /** Plate-local y for a distance measured down from the plate's top edge. */
  const at = (fromTop: number): number => -halfH + fromTop;

  // ── the ground ──────────────────────────────────────────────────────────────
  // Not a blackout. The map stays legible under it — this is a strip of paper laid over the
  // world, and the world is the thing the proclamation is *about*.
  const scrim = scene.add.graphics();
  scrim.fillStyle(PIGMENT.muc, 0.4);
  // The scrim covers the whole sheet, so it starts a column's offset left of the root.
  scrim.fillRect(-offset, 0, surfaceWidth(), GAME_HEIGHT);
  scrim.setAlpha(0);
  root.add(scrim);

  /**
   * Everything the proclamation is made of, above the scrim, so it can be *taken away* as one
   * object rather than dismantled.
   *
   * The exit used to be a 200 ms scaleY collapse on the plate alone, with the seal and the light
   * behind it cross-fading on their own clock — at that length and with three separate curves it
   * read as the banner blinking out, not as it leaving. One container, one curve: the sheet is
   * lowered out of frame and fades as it goes. Its children keep screen coordinates because the
   * container sits at the origin.
   */
  const stage = scene.add.container(0, 0);
  root.add(stage);

  // Light from behind the paper. Only the ends of the rays clear the plate's top and bottom
  // edges, which is the whole effect: something is happening *behind* the proclamation. Drawn
  // before the band so the paper occludes their roots — a ray field standing in front of type
  // reads as a slot machine, which is the one register this game may not borrow.
  const backRays = scene.add.graphics();
  if (outcome.celebrate) {
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2 + 0.19;
      backRays.lineStyle(index % 2 === 0 ? 3 : 1.4, outcome.accent, index % 2 === 0 ? 0.34 : 0.2);
      backRays.beginPath();
      backRays.moveTo(Math.cos(angle) * 40, Math.sin(angle) * 40);
      backRays.lineTo(Math.cos(angle) * 300, Math.sin(angle) * 300);
      backRays.strokePath();
    }
    backRays.setPosition(halfW, centre).setAlpha(0).setScale(0.55);
    stage.add(backRays);
  }

  // ── the plate ───────────────────────────────────────────────────────────────
  // Its own container so the unroll scales the paper and its furniture together while the text
  // inside fades in at full size — type that scales up from a sliver reads as a zoom effect, which
  // is the one thing a woodblock cannot do.
  const band = scene.add.container(halfW, centre);
  stage.add(band);

  const paper = scene.add.graphics();
  clearPlate(paper, -halfW, -halfH, GAME_WIDTH, height, cue.wave * 31 + cue.phase.length);
  // A warmer light down the top of the sheet, so the plate is not a flat rectangle of one value.
  // Stepped, not a single band: one rectangle over the top third put a visible tonal edge straight
  // across the middle of the plate, which read as two sheets of paper rather than as light.
  const washTo = shadePigment(PIGMENT.diepHi, 1.02);
  for (let step = 0; step < 16; step += 1) {
    paper.fillStyle(washTo, 0.5 * (1 - step / 16) ** 1.6);
    paper.fillRect(-halfW, -halfH + (height * 0.5 * step) / 16, GAME_WIDTH, height * 0.5 / 16 + 0.6);
  }
  // The accent bleeds in from both ends — the pigment of the news, before a word of it is read.
  for (let step = 0; step < 8; step += 1) {
    paper.fillStyle(outcome.accent, 0.075 - step * 0.009);
    paper.fillRect(-halfW + step * 8, -halfH, 8, height);
    paper.fillRect(halfW - step * 8 - 8, -halfH, 8, height);
  }
  band.add(paper);

  // Răng cưa top and bottom: the drum's own register, and the device that says *proclamation*
  // rather than *dialog box*. The accent rules sit outside them, hard against the plate's edge.
  const frieze = scene.add.graphics();
  sawtoothBand(frieze, -halfW + 6, -halfH + 5, GAME_WIDTH - 12, 5, 0.4);
  sawtoothBand(frieze, -halfW + 6, halfH - 10, GAME_WIDTH - 12, 5, 0.4);
  frieze.lineStyle(2.4, outcome.accent, 0.85);
  frieze.lineBetween(-halfW, -halfH + 1.2, halfW, -halfH + 1.2);
  frieze.lineBetween(-halfW, halfH - 1.2, halfW, halfH - 1.2);
  frieze.setAlpha(0);
  band.add(frieze);

  // A dry-brush stroke swept the width of the plate under the title, hand-drawn and wobbling —
  // the same `inkPath` the map's coastlines are drawn with, at the same three passes.
  const brush = scene.add.graphics();
  inkPath(
    brush,
    [
      { x: -halfW + 30, y: at(ruleY) },
      { x: -30, y: at(ruleY - 1.4) },
      { x: 44, y: at(ruleY + 1.2) },
      { x: halfW - 30, y: at(ruleY) },
    ],
    cue.wave * 7 + 3,
    { width: 1.2, alpha: 0.45, wobble: 0.9, step: 14, colour: outcome.accent },
  );
  brush.setAlpha(0);
  band.add(brush);

  // ── the figures ─────────────────────────────────────────────────────────────
  // Everything from here is added to `content`, a child of the plate — so every coordinate is
  // **plate-local**, measured from the plate's centre, not from the screen's left edge. Laid out
  // in screen units the first time, the whole stat block sat 195px right of where it belonged and
  // every figure fell clean off the sheet.
  const content = scene.add.container(0, 0);
  band.add(content);

  title.setY(at(titleTop));
  subtitle.setY(at(subtitleTop));
  content.add([title, subtitle]);

  const counters: Array<{ text: Phaser.GameObjects.Text; row: StatRow }> = [];
  rows.forEach((row, index) => {
    const y = at(statsTop + index * ROW_PITCH);
    const label = scene.add.text(-halfW + STAT_X, y, row.label, {
      color: '#5a4c39', fontFamily: UI_FONT, fontSize: '10.5px',
    }).setOrigin(0, 0);
    const value = scene.add.text(halfW - STAT_X, y - 1.5, `${row.prefix ?? ''}0`, {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '13.5px', fontStyle: '700', align: 'right',
    }).setOrigin(1, 0);
    // A dotted leader, because four label/value pairs with a gap between them read as two
    // unrelated lists rather than as a table.
    const leader = scene.add.graphics();
    leader.fillStyle(PIGMENT.mucFaint, 0.55);
    const leaderTo = halfW - STAT_X - 34;
    for (let dot = -halfW + STAT_X + label.width + 7; dot < leaderTo; dot += 4.5) {
      leader.fillRect(dot, y + 7, 1.3, 1.3);
    }
    content.add([leader, label, value]);
    counters.push({ text: value, row });
  });

  // The run's headline achievement, and the reason the result banner exists at all: a number that
  // only ever goes up, printed on its own line under a rule.
  if (outlived) {
    const rule = scene.add.graphics();
    rule.lineStyle(0.9, PIGMENT.mucFaint, 0.5);
    rule.lineBetween(-halfW + 54, at(outlivedRuleY), halfW - 54, at(outlivedRuleY));
    outlived.setY(at(outlivedTop));
    content.add([rule, outlived]);
  }

  content.setAlpha(0);

  // ── the medallion ───────────────────────────────────────────────────────────
  // Pinned to the head of the sheet, straddling its top edge — a badge on a proclamation, and the
  // first thing the eye lands on. It was a lacquer chop in the bottom-right corner, which is where
  // a chop belongs on a real edict and exactly the wrong place for the one mark that says *what
  // this is*: read top to bottom, the verdict arrived after the figures it explains.
  //
  // Every result gets one, a loss included. A win and a loss used to differ only in the colour of
  // the type, which at arm's length is not a difference at all.
  const chop = scene.add.graphics();
  const rays = scene.add.graphics();
  const chopX = halfW;
  const chopY = centre - halfH + 3;
  if (outcome.celebrate) {
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      rays.lineStyle(2.2, outcome.accent, 0.55);
      rays.beginPath();
      rays.moveTo(Math.cos(angle) * 22, Math.sin(angle) * 22);
      rays.lineTo(Math.cos(angle) * 74, Math.sin(angle) * 74);
      rays.strokePath();
    }
    rays.setPosition(chopX, chopY).setAlpha(0).setScale(0.5);
    stage.add(rays);
  }

  emblem(chop, EMBLEM_RADIUS, outcome.accent, outcome.emblem);
  chop.setPosition(chopX, chopY).setScale(2.4).setAlpha(0);
  stage.add(chop);

  // ── dismissing ──────────────────────────────────────────────────────────────
  //
  // A **scene-level** pointer listener, not an interactive object.
  //
  // The first version laid a full-screen `Zone` over the map and made it interactive. It dismissed
  // the banner from anywhere, which is what was wanted, and it also swallowed every control
  // underneath it: Phaser delivers a pointer to the topmost interactive object only, and at depth
  // 470 the zone outranks the map controls at 430. So for the whole life of the banner the zoom
  // buttons and the terrain/control toggle were visible, pressable and inert - and once a result
  // began holding the world for nine seconds, that dead window was long enough to read as the
  // buttons simply being broken.
  //
  // `input.on(POINTER_UP)` fires for the pointer rather than for an object, so it competes with
  // nothing. A tap on bare paper dismisses the plate; a tap on a real control works normally,
  // because Phaser aborts the scene-level event when a game object calls `stopPropagation`, which
  // every button in this scene does. That is the right split: pressing a button is not a request
  // to dismiss an announcement, and the hold will take the banner away by itself anyway.
  //
  // The map keeps working underneath either way. MapScene runs its own input plugin and consults
  // `window.__hudTapBounds` to decide what is chrome; the banner publishes nothing to it and never
  // sets `__suppressMapInputUntil`, so a tap that dismisses the plate still pans or selects.
  const dismissOnTap = (): void => {
    holdTimer?.remove();
    rollAway();
  };

  const finish = (): void => {
    if (finished) return;
    finished = true;
    // The banner's own timers die with it. Both are guarded against a destroyed banner, so leaving
    // them armed was harmless — but a `destroy()` left a hold timer counting down for up to another
    // 2.9 s and an arming timer for 600 ms, on a clock that outlives the object they refer to.
    holdTimer?.remove();
    armTimer?.remove();
    scene.input.off(Phaser.Input.Events.POINTER_UP, dismissOnTap);
    scene.tweens.killTweensOf([root, stage, band, content, frieze, brush, chop, rays, backRays, scrim]);
    for (const counter of counters) scene.tweens.killTweensOf(counter.text);
    root.destroy(true);
    onDone?.();
  };

  /**
   * The proclamation is lowered away: the sheet drifts down out of the middle of the screen and
   * fades as it falls, and the ground it was standing on goes with it.
   *
   * Down rather than up, and accelerating rather than easing out, because that is the direction
   * the eye expects a thing to leave in once it has been read — the entrance came *open*, so the
   * exit goes *away*. 420 ms is roughly twice what it was: at 200 ms the plate did not travel far
   * enough to register as motion and the whole banner read as blinking out.
   *
   * The type is dropped a beat early. Text tweened all the way down at full opacity smears against
   * the paper it is printed on; letting it go first leaves a blank sheet falling, which is what a
   * proclamation being taken down actually looks like.
   */
  const rollAway = (): void => {
    if (finished) return;
    scene.tweens.killTweensOf([backRays, chop, rays]);
    scene.tweens.add({ targets: content, alpha: 0, duration: 190, ease: 'Sine.easeIn' });
    scene.tweens.add({
      targets: stage,
      y: 34,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeIn',
    });
    // The sheet also closes a little as it goes, so it reads as a scroll being rolled rather than
    // as a rectangle sliding off a shelf.
    scene.tweens.add({ targets: band, scaleY: 0.78, duration: 420, ease: 'Cubic.easeIn' });
    scene.tweens.add({ targets: scrim, alpha: 0, duration: 380, delay: 60, ease: 'Sine.easeIn' });
    // A tween's own `onComplete` cannot own the end here: `chop`, `rays` and `backRays` are only
    // drawn for a celebration, so on a landing that list is three already-idle graphics.
    scene.time.delayedCall(450, finish);
  };

  // ── the sequence ────────────────────────────────────────────────────────────
  scene.tweens.add({ targets: scrim, alpha: 1, duration: 130, ease: 'Sine.easeOut' });

  // The unroll. A scroll opens along its length, so the paper grows in x from a sliver and only
  // then settles in y — one tween doing both reads as a box zooming, which is a dialog box, not a
  // proclamation.
  band.setScale(0.05, 0.55);
  scene.tweens.add({ targets: band, scaleX: 1, duration: 260, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: band, scaleY: 1, duration: 200, delay: 170, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: [frieze, brush], alpha: 1, duration: 200, delay: 230, ease: 'Sine.easeOut' });

  // The drumbeat. Two shudders as the plate lands, and it is the plate that moves, never the
  // camera: this scene's camera carries the HUD and the action bar, and shaking those reads as a
  // fault rather than as an impact.
  scene.tweens.add({
    targets: band,
    x: { from: halfW - 3.5, to: halfW },
    duration: 90,
    delay: 250,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: 1,
  });

  content.setY(5);
  scene.tweens.add({ targets: content, alpha: 1, y: 0, duration: 240, delay: 280, ease: 'Cubic.easeOut' });

  if (outcome.celebrate) {
    // Light behind the paper, swelling once and settling low. Slow, because it is the ground the
    // moment stands on; the seal below is the thing with the edge.
    scene.tweens.add({
      targets: backRays,
      alpha: { from: 0, to: 0.85 },
      scale: 1,
      duration: 520,
      delay: 210,
      ease: 'Cubic.easeOut',
    });
    scene.tweens.add({
      targets: backRays,
      alpha: 0.32,
      angle: 6,
      duration: 900,
      delay: 730,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: rays,
      alpha: { from: 0.9, to: 0 },
      scale: 1.7,
      duration: 460,
      delay: 580,
      ease: 'Cubic.easeOut',
    });
  }

  // The medallion falls and *lands* — the overshoot is the whole feeling. Straight out of
  // `arrivalFanfare`, because the game should have exactly one gesture for "this mattered".
  scene.tweens.add({ targets: chop, scale: 1, alpha: 1, duration: 220, delay: 380, ease: 'Back.easeIn' });

  // Figures count up rather than appearing, for the same reason POWER counts up in the HUD: a
  // number that moves is read, and a number that is simply there is not.
  for (const counter of counters) {
    if (counter.row.value <= 0) {
      counter.text.setText(`${counter.row.prefix ?? ''}0`);
      continue;
    }
    scene.tweens.addCounter({
      from: 0,
      to: counter.row.value,
      duration: 460,
      delay: 300,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        if (!counter.text.active) return;
        counter.text.setText(`${counter.row.prefix ?? ''}${formatNumber(Math.round(tween.getValue() ?? 0))}`);
      },
      onComplete: () => {
        if (counter.text.active) {
          counter.text.setText(`${counter.row.prefix ?? ''}${formatNumber(counter.row.value)}`);
        }
      },
    });
  }

  holdTimer = scene.time.delayedCall(560 + holdFor(cue, rows.length), rollAway);

  // Armed a beat late, so the tap that answered the card *before* the banner cannot dismiss the
  // banner in the same gesture — a pointerup can land on a listener that did not exist when the
  // press began, and the proclamation would flash and vanish without ever being read.
  armTimer = scene.time.delayedCall(SKIP_HINT_DELAY, () => {
    if (finished) return;
    scene.input.on(Phaser.Input.Events.POINTER_UP, dismissOnTap);
  });

  return {
    skip: () => { holdTimer.remove(); rollAway(); },
    destroy: finish,
  };
}
