import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { inkPath, mulberry32, printedShape, washFill, type Pt } from './stroke';
import { UNIT, unitScale } from './proportion';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { Army, ArmyComposition, ArmyWardrobe, GameState } from '../../state/types';
import {
  blockShares, compositionOfUnits, DOCTRINE, FORMATION_ORDER, FORMATION_PLAN, HOST_MARK_CAP,
  MEN_PER_MARK, marchColumn, type BattleFormation, type FormationKey,
  type FormationTweak,
} from '../../data/ascent/formations';

/**
 * Đông Sơn bronze — the narrator's register, kept deliberately distinct from the world's.
 *
 * The rule that resolves the anachronism: **drum in the chrome, dynasty in the world.** The Ngọc Lũ
 * drum is 2,500 years old and predates every dynasty in the game by fifteen centuries, so using it
 * as world decoration would simply be wrong. But the game's frame is a modern retelling, and the
 * frame is allowed to speak in the oldest Vietnamese visual language there is.
 *
 * Also here: the host, whose block is sized by the number of men in it, and the seal, which carries
 * a **drawn device** and never a written character — the game ships in English and quốc ngữ, and a
 * Hán glyph is decoration pretending to be information.
 */

type G = Phaser.GameObjects.Graphics;

// ── the host ──────────────────────────────────────────────────────────────────

/**
 * One drawn figure stands for about this many men, and past `HOST_MARK_CAP` density stops adding
 * information and starts costing frames — ranks deepen instead.
 *
 * Both now live in `data/ascent/formations.ts` with the doctrine table, because the fight resolver
 * needs them to know whether a block is still standing and `src/systems/` may not import Phaser.
 * Re-exported here so every existing caller keeps working.
 */
export { HOST_MARK_CAP, MEN_PER_MARK };

/**
 * Ground between one man and the next, along the file and back through the ranks.
 *
 * **These carry `UNIT.figure`, and that is the whole point of them existing as named constants.**
 * The living exaggeration was applied inside `figure()` and nowhere else, while the spacing stayed
 * on the raw caller scale — so when people were made 1.8x life size the ranks did not open up to
 * make room. Each man ended up 2.4 rank-pitches tall with a spear 2.9 files long, and a host read as
 * a smudge of overlapping strokes rather than as a block of soldiers. That was the "army renders
 * badly" complaint, in one missing multiplication.
 *
 * Files are wider than ranks are deep, so a host is wider than it is deep the way one on the march
 * is. The rank shear is what stops the block reading as a grid.
 *
 * The numbers are the document's grid divided by the document's own unit — 16, 12 and 3.6 against a
 * soldier 42 units to the crown of his head — so a block in the game has the same density as the
 * plates in `docs/phase-1/12-armies-of-dai-viet.md`.
 *
 * They used to be 4.6 / 4.0 / 1.2, which is three body-widths of ground between one man and the
 * next: an open skirmish order, not a block. That spacing was chosen against the *old* figure — a
 * stick with a spear nearly three files long, which at any tighter pitch smeared into its
 * neighbours. The figure is a drawn soldier now and can stand shoulder to shoulder, which is both
 * what an army looked like and what makes a host read as a mass rather than as scattered marks.
 */
const FILE_PITCH = (16 / 9.46) * UNIT.figure;
const RANK_PITCH = (12 / 9.46) * UNIT.figure;
/**
 * A rank's depth as a multiple of a file's width.
 *
 * The one number a turn of the formation has to correct for: `dx` is counted in file pitches and
 * `dy` in rank pitches, so rotating them against each other without it shears the column.
 */
export const RANK_PER_FILE = RANK_PITCH / FILE_PITCH;
const RANK_SHEAR = (3.6 / 9.46) * UNIT.figure;

export interface HostShape {
  marks: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
}

/**
 * The block's AREA tracks the count, so a nine-thousand-man army is visibly a different object from
 * a two-thousand-man one without anybody reading a label. Formation is wider than deep, the way a
 * host on the march actually is.
 */
export function hostShape(men: number, markSpacing = FILE_PITCH, rankSpacing = RANK_PITCH): HostShape {
  const marks = Math.max(4, Math.min(HOST_MARK_CAP, Math.round(men / MEN_PER_MARK)));
  const cols = Math.max(3, Math.round(Math.sqrt(marks * 2.6)));
  const rows = Math.ceil(marks / cols);
  return { marks, cols, rows, width: cols * markSpacing, height: rows * rankSpacing };
}

/**
 * The block a host of this many men fills at drawing scale `s` — the shape `drawHost` will produce.
 *
 * Callers want this rather than `hostShape` directly: it is the only place that knows the pitch is
 * `FILE_PITCH`/`RANK_PITCH` and not some other pair of numbers. A caller that spells the
 * multiplication out itself is a caller that will still be spelling out the old one after the
 * spacing changes, which is precisely how the marker, its shadow and its standard came to disagree.
 */
export function hostShapeAt(men: number, s = 1): HostShape {
  return hostShape(men, FILE_PITCH * s, RANK_PITCH * s);
}

/**
 * One soldier: a body, a nón, and usually a spear. Five marks of information.
 *
 * Drawn through `inkPath` like every other living thing on the map. It used to be the sole
 * exception — a ruled `lineBetween`, a `fillCircle` and a second ruled line — while the farmer
 * standing forty pixels away went through the full two-pass soaked-underlay treatment. At a
 * distance that difference reads exactly as the complaint it drew: the villagers look printed and
 * the army looks like tally marks someone left on the paper.
 *
 * Kept to five strokes, because this runs up to `HOST_MARK_CAP` times per host and several hosts
 * can be on screen. The cost is paid once when the marker is built, not per frame — each rank is
 * its own `Graphics` that is tweened rather than redrawn.
 */
/**
 * Which people a soldier belongs to. Carried by the **body**, not by colour.
 *
 * The palette is a scarcity system with nine pigments in it; if the north were told apart by being
 * blue, a Ming column on a wet-season map would vanish. So the faction is a silhouette: a Việt robe
 * trapezoid, a Hán straight coat with a centre placket and a lower hem, a Chăm bare torso over a
 * flared sarong. It is the slot that still reads once the head is lost at distance.
 */
export type FigureFaction = 'viet' | 'han' | 'champa';

/**
 * The thirteen wardrobes.
 *
 * Eight Việt — the four on the Mandate ladder, the three lord periods, which never enter it
 * because they are what a *rival* Việt kingdom wears, and Đinh, which is where the ladder now
 * starts. Four northern, paired to the era they historically came in. One Chăm.
 */
export type FigureTheme = ArmyWardrobe;

/** The Mandate eras. Kept as a narrowing of `FigureTheme` so old call sites still read. */
export type FigureEra = 'dinh' | 'ly' | 'tran' | 'le' | 'nguyen';

/** levy → trained → royal guard, straight off `army.elite`. */
export type FigureTier = 0 | 1 | 2;

/**
 * What a man is carrying — and, through `FORMATION`, which block of the army he stands in.
 *
 * `spear` is not one of the four: it is what a levy holds, a billhook off a farm, and the default
 * when a host has no composition to read.
 */
export type FigureArm = 'spear' | 'sword' | 'skirmish' | 'bow' | 'mounted';

interface ThemeSpec {
  faction: FigureFaction;
  /** The robe's dye. */
  robe: number;
  /** The crown's. */
  crown: number;
  /** Hand-guns reach the row under the Later Lê; before that a skirmisher throws. */
  gun: boolean;
}

export const FIGURE_THEMES: Record<FigureTheme, ThemeSpec> = {
  // Đinh: undyed and hide, because there was no dye monopoly to enforce anything else, and the
  // one gilt thing on the field was on the man commanding it. Sourced frame by frame in
  // `docs/phase-1/23-the-thirteenth-wardrobe.md`.
  //
  // The helm is `nauDark` rather than `hide` — at plate scale the darker leather closed up with
  // the hair under it and the head came out a single black mass, which is also what hid the
  // gorget drawn in `hide` just below it.
  dinh: { faction: 'viet', robe: PIGMENT.nau, crown: PIGMENT.nauDark, gun: false },
  ly: { faction: 'viet', robe: PIGMENT.tram, crown: PIGMENT.hoePale, gun: false },
  tran: { faction: 'viet', robe: PIGMENT.nau, crown: PIGMENT.hoe, gun: false },
  le: { faction: 'viet', robe: PIGMENT.tram, crown: PIGMENT.son, gun: true },
  trinh: { faction: 'viet', robe: PIGMENT.nau, crown: PIGMENT.hide, gun: true },
  nguyenLord: { faction: 'viet', robe: PIGMENT.tram, crown: PIGMENT.muc, gun: true },
  tayson: { faction: 'viet', robe: PIGMENT.nau, crown: PIGMENT.cham, gun: true },
  nguyen: { faction: 'viet', robe: PIGMENT.hoe, crown: PIGMENT.nau, gun: true },
  song: { faction: 'han', robe: PIGMENT.chamPale, crown: PIGMENT.cham, gun: false },
  yuan: { faction: 'han', robe: PIGMENT.nauDark, crown: PIGMENT.hide, gun: false },
  ming: { faction: 'han', robe: PIGMENT.cham, crown: PIGMENT.nau, gun: true },
  qing: { faction: 'han', robe: PIGMENT.hide, crown: PIGMENT.cham, gun: true },
  champa: { faction: 'champa', robe: PIGMENT.hoe, crown: PIGMENT.nau, gun: false },
};

/** Which people wear a theme. The only place the mapping is written down. */
export function factionFor(theme: FigureTheme): FigureFaction {
  return FIGURE_THEMES[theme]?.faction ?? 'viet';
}

/**
 * What a soldier is wearing and carrying. Everything optional: a caller that passes nothing gets
 * the old silhouette, so this stayed additive across forty-odd call sites.
 */
export interface FigureKit {
  theme?: FigureTheme;
  /** @deprecated The four-era name for `theme`; still honoured so old callers keep working. */
  era?: FigureEra;
  tier?: FigureTier;
  arm?: FigureArm;
  /** The realm's colour, for the sash. The player's is sỏi son; a rival's is muted. */
  accent?: number;
  /**
   * The wobble seed, when the caller wants the same drawing back every time. Absent, the seed is
   * derived from `x, y` as it always was — which is right for figures inked in place, and useless
   * for a figure baked once and stamped at forty positions.
   */
  seed?: number;
}

/**
 * The document's own grid, and the single divisor that maps it onto the game's.
 *
 * `docs/phase-1/12-armies-of-dai-viet.md` draws a soldier **42 units** from the ground to the crown of
 * his head. `unitScale('figure', …)` puts that same distance at **4.44**. So one division, applied
 * once, and every number below is literally the number printed in the document — which is the only
 * way a drawing this long stays checkable against it.
 */
export const DOC_UNIT = 42 / 4.44;

/**
 * Body geometry per faction, in document units. `hem` is where the robe stops, `top` where it
 * starts, and the top edge **is** the shoulders — a separate shoulder line only adds weight.
 */
const BODY: Record<FigureFaction, { hem: number; top: number; hw: number; sw: number }> = {
  viet: { hem: -12, top: -30, hw: 7, sw: 6 },
  han: { hem: -9, top: -30, hw: 7.6, sw: 6.6 },
  champa: { hem: -12, top: -23, hw: 9.4, sw: 5.6 },
};

/**
 * One soldier: six slots, and every one of them is doing a job.
 *
 * Đạt H. Võ's *Timeline of Vietnamese army costume* separates eight periods with no text on the
 * figures at all, and the way it does that is the design here: **headwear carries most of the
 * identification, the chest carries the rank, one accent carries the realm.**
 *
 *   1. crown  — the theme. The most identifying mark, so the one that never drops at any zoom.
 *   2. body   — the faction. What still reads once the head is too small to see.
 *   3. chest  — the tier. Nothing, a mirror plate, or a plate with shoulder pieces.
 *   4. sash   — the realm. One diagonal stroke; the only place the scarcity law touches a soldier.
 *   5. arm    — the weapon, and the block of the formation this man stands in.
 *   6. ground — bare feet, or boots. Small, but it is what makes a levy read as farmers.
 *
 * **Three rules make it a person rather than a stack of parts**, and each was got wrong once
 * before it was got right:
 *
 *   - The skull is an **outline**, never a filled disc, so the paper shows through as a face.
 *   - The crown's brim sits at −39, *inside* the head circle (centre −36, r 6). A hat lifted clear
 *     of the skull reads as a lid resting on a ball. **The overlap is the join.**
 *   - Every weapon is held by an **arm that starts at the shoulder**. One extra stroke, and a man
 *     carrying a spear stops being a spear floating beside a man.
 *
 * Still drawn through `inkPath` like every other living thing on the map, and still counted: this
 * runs up to `HOST_MARK_CAP` times per host and several hosts can be on screen.
 */
export function figure(g: G, x: number, y: number, scale: number, colour: number, kit: FigureKit | boolean = {}): void {
  const s = unitScale('figure', scale);
  const u = s / DOC_UNIT;
  // A bare boolean is the old sixth argument — "does this one carry a spear".
  const spec: FigureKit = typeof kit === 'boolean' ? { arm: kit ? 'spear' : undefined } : kit;
  const seed = spec.seed ?? Math.round(x * 31 + y * 17);
  const theme: FigureTheme = spec.theme ?? spec.era ?? 'le';
  const T = FIGURE_THEMES[theme] ?? FIGURE_THEMES.le;
  const tier = spec.tier ?? 1;
  const arm = spec.arm;

  // `step` is a segment length in world units, so at a plate scale — the History page draws a
  // soldier a hundred units tall — a fixed 2.4 chops every outline into fifty wobbled pieces and
  // the figure comes out looking rubbed rather than printed. Growing it with the figure keeps the
  // *number* of wobbles constant, which is what the hand-drawn look actually is. Floored at the
  // old value so nothing at map or battlefield size changes.
  const ink = { colour, wobble: 0.055 * s, step: Math.max(2.4, 1.7 * s) };
  // Slightly off vertical, so a rank is people standing rather than a comb.
  const cx = x + ((seed % 7) - 3) * 0.5 * u;
  // A mounted man is lifted onto the saddle and everything above his feet goes with him; the pony
  // is drawn at ground level, which is what `ground` below is for.
  const lift = arm === 'mounted' ? -17 : 0;
  /** A point in the document's coordinates: x across, y up from the feet. */
  const P = (dx: number, dy: number): Pt => ({ x: cx + dx * u, y: y + (dy + lift) * u });
  const ground = (dx: number, dy: number): Pt => ({ x: cx + dx * u, y: y + dy * u });
  const stroke = (pts: Pt[], sd: number, w = 1.55, alpha = 0.85, closed = false): void => {
    inkPath(g, pts, sd, { ...ink, width: w * u, alpha, closed });
  };
  const solid = (pts: Pt[], fill: number, alpha = 0.85): void => {
    g.fillStyle(fill, alpha);
    g.fillPoints(pts, true);
  };
  const ring = (dx: number, dy: number, r: number, n = 10): Pt[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return P(dx + Math.cos(a) * r, dy + Math.sin(a) * r);
    });

  // ── 6. mount ──────────────────────────────────────────────────────────────
  if (arm === 'mounted') {
    const groundRing = (dx: number, dy: number, r: number, n = 8): Pt[] =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return ground(dx + Math.cos(a) * r, dy + Math.sin(a) * r);
      });
    const groundStroke = (pts: Pt[], sd: number, w = 1.55, alpha = 0.85, closed = false): void => {
      inkPath(g, pts, sd, { ...ink, width: w * u, alpha, closed });
    };
    drawPony(g, ground, groundRing, groundStroke, solid, seed, T.faction === 'han' ? PIGMENT.nauDark : PIGMENT.nau);
    // The saddle cloth, in the realm's own colour: the one place a rival's accent gets any size.
    if (spec.accent !== undefined) {
      solid([P(-9, -14.5), P(9, -14.5), P(9, -9.9), P(-9, -9.9)], spec.accent, 0.85);
    }
  }

  // ── 2. body ───────────────────────────────────────────────────────────────
  const B = BODY[T.faction];
  const robe = [P(-B.hw, B.hem), P(B.hw, B.hem), P(B.sw, B.top), P(-B.sw, B.top)];
  // The printed underlay, laid a hair off register like every other wash in the game. The
  // registration is scaled: the default 1.6 is a *map* number and would push a figure's robe
  // clean off the figure.
  washFill(g, robe, T.robe, seed + 21, 0.9, 1.5 * u);

  // Legs first, so the robe's hem prints over where they meet it.
  if (arm !== 'mounted') {
    stroke([P(-4, 0), P(-3, B.hem)], seed + 2);
    stroke([P(4, 0), P(3, B.hem)], seed + 3);
  } else {
    // One leg bent over the flank. A rider with two straight legs is a man standing behind a horse.
    stroke([P(-0.4, -13), P(6.6, -15), P(7.8, -5.6)], seed + 2, 1.7);
  }
  stroke(robe, seed + 22, 1.55, 0.85, true);
  if (T.faction === 'han') {
    // The coat's centre placket — the mark that separates a northern coat from a Việt robe at the
    // one size where the crowns have already gone.
    stroke([P(0, B.hem + 1.6), P(0, B.top + 1.2)], seed + 23, 0.9, 0.6);
  }
  if (T.faction === 'champa') {
    // A bare torso: two flanks and a shoulder line, so the man above the sarong is drawn rather
    // than implied.
    stroke([P(-5.6, B.top), P(-5.4, -29.4)], seed + 24, 1.4);
    stroke([P(5.6, B.top), P(5.4, -29.4)], seed + 25, 1.4);
    stroke([P(-5.4, -29.4), P(5.4, -29.4)], seed + 26, 1.4);
  }

  // ── 3. chest ──────────────────────────────────────────────────────────────
  if (tier >= 1) {
    if (theme === 'tran') {
      // The round mirror disc, in both the timeline and the texts.
      const disc = ring(0, -24, 4.6, 9);
      solid(disc, PIGMENT.horn);
      stroke(disc, seed + 31, 1.2, 0.8, true);
      if (tier > 1) solid(ring(0, -24, 1.5, 7), colour, 0.9);
    } else if (theme === 'ming') {
      // Brigandine: the studs are the armour, and they are the mark.
      const plate = [P(-4.8, -28), P(4.8, -28), P(4.8, -20), P(-4.8, -20)];
      solid(plate, PIGMENT.horn);
      stroke(plate, seed + 31, 1.1, 0.8, true);
      for (let i = -1; i <= 1; i += 1) solid(ring(i * 2.4, -25.8, 0.85, 6), colour, 0.9);
    } else if (T.faction === 'champa') {
      // No plate — a collar band over a bare chest. Chăm armour was light and the reliefs show it.
      stroke([P(-5.2, -27.4), P(0, -25.8), P(5.2, -27.4)], seed + 31, 1.4, 0.8);
      if (tier > 1) solid(ring(0, -25.2, 1.4, 6), PIGMENT.hoe, 0.9);
    } else if (T.faction === 'han') {
      // Lamellar: two banded courses and a small plate at the heart.
      stroke([P(-5.2, -27), P(5.2, -27)], seed + 31, 1.1, 0.7);
      stroke([P(-5.2, -23.6), P(5.2, -23.6)], seed + 32, 1.1, 0.7);
      const heart = [P(-2.6, -26.6), P(2.6, -26.6), P(2.6, -22), P(-2.6, -22)];
      solid(heart, PIGMENT.horn);
      stroke(heart, seed + 33, 1, 0.8, true);
    } else if (theme === 'dinh') {
      // Giáp phiến — the shell lame, hung in two courses that overlap downward. Two arcs, and
      // they are the only marks in this function that are *curved*: the mirror plate is a
      // rectangle, the Trần disc a circle, the northern lamellar two straight bands, so a
      // scalloped course is the one shape on the chest still unclaimed at this size.
      for (let row = 0; row < 2; row += 1) {
        const y = -27.6 + row * 3.6;
        for (let i = -2; i <= 1; i += 1) {
          const x = i * 2.6 + (row % 2) * 1.3;
          stroke([P(x, y), P(x + 1.3, y + 1.5), P(x + 2.6, y)], seed + 31 + row * 4 + i, 1, 0.72);
        }
      }
    } else {
      // Hộ tâm kính, the mirror plate — the commonest armour the northern record knows.
      const plate = [P(-4.5, -28), P(4.5, -28), P(4.5, -20.4), P(-4.5, -20.4)];
      solid(plate, PIGMENT.horn);
      stroke(plate, seed + 31, 1.2, 0.8, true);
    }
    if (tier > 1) {
      stroke([P(-6.5, -29.4), P(-9.3, -27.4), P(-9.5, -24)], seed + 34, 1.5, 0.75);
      stroke([P(6.5, -29.4), P(9.3, -27.4), P(9.5, -24)], seed + 35, 1.5, 0.75);
      if (theme === 'dinh') {
        // Hộ hạng — the studded gorget flaring over the shoulders, above the shoulder strokes
        // rather than instead of them. It is what makes a Đinh guard read as armoured when the
        // chest itself carries no plate: a filled collar has weight the two strokes do not.
        const gorget = [P(-7.4, -30.8), P(7.4, -30.8), P(6, -28.2), P(-6, -28.2)];
        solid(gorget, PIGMENT.hide, 0.9);
        stroke(gorget, seed + 36, 1.2, 0.8, true);
        solid(ring(-3.4, -29.6, 0.7, 5), PIGMENT.hoe, 0.9);
        solid(ring(3.4, -29.6, 0.7, 5), PIGMENT.hoe, 0.9);
      }
    }
  }

  // ── 4. sash ───────────────────────────────────────────────────────────────
  if (spec.accent !== undefined) {
    const sy = T.faction === 'champa' ? -17.5 : -16;
    inkPath(g, [P(-6.4, sy), P(6.4, sy - 6)], seed + 8, {
      colour: spec.accent, wobble: 0.08 * s, step: 2.2, width: 2.2 * u, alpha: 0.9,
    });
  }

  // ── the head, and 1. the crown over it ────────────────────────────────────
  stroke(ring(0, -36, 6, 11), seed + 40, 1.55, 0.85, true);
  drawCrown(g, P, ring, stroke, solid, seed, theme, T, tier, colour);

  // ── 5. arm ────────────────────────────────────────────────────────────────
  drawArm(g, P, ring, stroke, solid, seed, T, arm, tier, colour);

  // ── 6. ground ─────────────────────────────────────────────────────────────
  // Bare feet leave no mark; a guard's boots do. Two fills, and it is what makes the levy beside
  // him read as men pulled off the fields.
  if (tier > 1 && arm !== 'mounted') {
    solid([P(-5.5, -2), P(-1.1, -2), P(-1.1, 1), P(-5.5, 1)], colour, 0.62);
    solid([P(1.1, -2), P(5.5, -2), P(5.5, 1), P(1.1, 1)], colour, 0.62);
  }
  // The guard's rank mark: a drum band, never a written character — the seal rule forbids a Hán
  // glyph standing in for information.
  if (tier > 1) {
    const rk = T.faction === 'viet' ? PIGMENT.son : PIGMENT.nau;
    inkPath(g, [P(8.4, -25.4), P(11.2, -22.6)], seed + 51, { colour: rk, wobble: 0.05 * s, step: 2, width: 1.3 * u, alpha: 0.9 });
    inkPath(g, [P(10.4, -27.4), P(13.2, -24.6)], seed + 52, { colour: rk, wobble: 0.05 * s, step: 2, width: 1.3 * u, alpha: 0.9 });
  }
}

type PointAt = (dx: number, dy: number) => Pt;
type RingAt = (dx: number, dy: number, r: number, n?: number) => Pt[];
type StrokeAt = (pts: Pt[], sd: number, w?: number, alpha?: number, closed?: boolean) => void;
type SolidAt = (pts: Pt[], fill: number, alpha?: number) => void;

/**
 * Ngựa: the mount, and the reason `mounted` moves the whole figure rather than decorating it.
 *
 * Built off one measurement the way a horse actually is — **1.25 m at the withers**, body length
 * equal to that, barrel depth 0.45 of it, head 0.4 of it. Guess those three and the result is a
 * donkey. The Vietnamese cavalry mount is a small southern pony, not a destrier: drawn at European
 * size a mounted mark is nearly twice a footman and a wing reads as giants.
 *
 * Two details do most of the work. The hind leg **bends backwards at the hock**, which is most of
 * what separates a pony from a table. And the barrel and the neck are each an **open** outline that
 * hands off to the other — closed, the neck's base edge prints across the shoulder and reads as a
 * collar strap.
 */
function drawPony(
  g: G, at: PointAt, ring: RingAt, stroke: StrokeAt, solid: SolidAt, seed: number, coat: number,
): void {
  const pts = (...pairs: Array<[number, number]>): Pt[] => pairs.map(([dx, dy]) => at(dx, dy));

  const barrel = pts(
    [5.4, -31], [-6, -31.8], [-13.2, -29.6], [-16.2, -28.4], [-16.6, -25.6],
    [-18.2, -21.6], [-15.2, -19.2], [-12.8, -17.6], [-9.8, -18.2], [-2, -18],
    [5, -17.6], [9.4, -19.2], [13, -21.2], [13.2, -25.6],
  );
  const neck = pts(
    [5.6, -30.6], [9.4, -36.4], [14.2, -39.2], [16.6, -40.6], [18.8, -39.6], [21.4, -38.2],
    [23.4, -35], [25.6, -31.6], [26.2, -29.6], [24, -29.8], [20.6, -30.8], [17, -31.8],
    [14.6, -29], [12.6, -26.8], [12.8, -25.4],
  );

  // The wash wants closed shapes even though the outlines are open.
  solid([...neck, at(5.6, -30.6)], coat, 0.92);
  solid([...barrel, at(12.4, -30)], coat, 0.92);

  stroke(pts([-12.4, -18.6], [-14.6, -12.4], [-11.4, -8.2], [-12.4, -1.2]), seed + 70, 1.8);
  stroke(pts([-9.2, -18.6], [-11.2, -12.6], [-8.2, -8.6], [-9, -1.2]), seed + 71, 1.5);
  stroke(pts([9.2, -19], [10.2, -10.4], [10.8, -1.2]), seed + 72, 1.8);
  stroke(pts([12, -19.6], [13.2, -10.6], [13.8, -1.2]), seed + 73, 1.5);
  stroke(barrel, seed + 74, 1.55);
  stroke(neck, seed + 75, 1.55);
  stroke(pts([8.4, -31.6], [10.6, -35], [12.6, -37]), seed + 76, 1.2, 0.7);          // the mane
  stroke(pts([12, -35], [14, -37.6], [15.6, -38.8]), seed + 77, 1, 0.7);
  stroke(pts([-16.8, -26.4], [-20, -21], [-20.2, -14]), seed + 78, 1.8, 0.8);        // the tail
  stroke(pts([-16.6, -23], [-19.2, -18.6], [-19.4, -13.4]), seed + 79, 1.2, 0.7);
  solid(pts([17.2, -40], [16.6, -43.6], [19, -40.4]), PIGMENT.muc, 0.9);             // the ears
  solid(pts([19.6, -39.6], [19.6, -42.8], [21.2, -39.2]), PIGMENT.muc, 0.9);
  solid(ring(20.4, -36, 0.8, 6), PIGMENT.muc, 0.9);                                  // the eye
  solid(ring(24.4, -31.2, 0.6, 6), PIGMENT.muc, 0.9);                                // the nostril
}

/**
 * Slot 1. The brim sits at −39, which is *inside* the head circle — that overlap is what joins the
 * hat to the man, and lifting it clear was the single change that made the first pass read as a
 * lid on a ball.
 */
function drawCrown(
  g: G, P: PointAt, ring: RingAt, stroke: StrokeAt, solid: SolidAt,
  seed: number, theme: FigureTheme, T: ThemeSpec, tier: FigureTier, colour: number,
): void {
  const hair = (): void => solid([P(-6, -38.6), P(-4, -42.2), P(0, -43.4), P(4, -42.2), P(6, -38.6)], colour, 0.9);

  if (tier === 0) {
    // Bare-headed: what a man pulled off his fields is wearing.
    if (theme === 'nguyen' || theme === 'nguyenLord' || theme === 'tayson') {
      hair();
      solid(ring(0, -43.8, 3, 8), colour, 0.9);                       // búi tó, the bun
    } else if (theme === 'yuan' || theme === 'qing') {
      hair();
      stroke([P(-5.2, -38.6), P(-9.6, -34), P(-10.2, -26)], seed + 41, 1.4);   // the queue
    } else if (theme === 'song' || theme === 'ming') {
      const cap = [P(-6, -39), P(-4.4, -43.4), P(0, -44.6), P(4.4, -43.4), P(6, -39)];
      solid(cap, T.crown, 0.9);
      stroke(cap, seed + 41, 1.5, 0.85, true);                        // a cloth cap
    } else if (theme === 'champa') {
      hair();
      stroke([P(-6.2, -39.4), P(6.2, -39.4)], seed + 41, 1.4);        // a headband
    } else {
      hair();
      solid(ring(0, -43.6, 2.5, 7), colour, 0.9);                     // búi tóc, the topknot
    }
    return;
  }

  const domed = (halfW: number, apex: number): Pt[] => [
    P(-halfW, -39), P(-halfW * 0.86, apex * 0.72 - 10), P(0, apex), P(halfW * 0.86, apex * 0.72 - 10), P(halfW, -39),
  ];

  switch (theme) {
    case 'dinh': {                                 // a low bowl, a gilt brow band, and a plume
      const d = domed(6.6, -46);
      solid(d, T.crown, 0.92); stroke(d, seed + 42, 1.55, 0.85, true);
      stroke([P(-7.4, -39.6), P(7.4, -39.6)], seed + 43, 1.6, 0.9);
      // The plume is the whole silhouette at map size, so it is drawn taller than the helm and
      // is the one thing on a Đinh officer that survives the zoom-out.
      stroke([P(0, -46), P(-1.6, -52), P(0.8, -56.4)], seed + 44, 1.5, 0.85);
      break;
    }
    case 'ly': {                                   // dome, and a crest swept back and up off it
      const d = domed(7, -47);
      solid(d, T.crown, 0.9); stroke(d, seed + 42, 1.55, 0.85, true);
      stroke([P(4.2, -45.4), P(9.4, -46.6), P(13.6, -52.4)], seed + 43, 2.1, 0.8);
      break;
    }
    case 'tran': {                                 // dome, finial, and cheek flaps past the jaw
      const d = domed(7, -47.5);
      solid(d, T.crown, 0.9); stroke(d, seed + 42, 1.55, 0.85, true);
      solid(ring(0, -49.2, 1.9, 7), colour, 0.9);
      stroke([P(-6.9, -39), P(-7.6, -35.6), P(-7.8, -32.4)], seed + 43, 1.3, 0.8);
      stroke([P(6.9, -39), P(7.6, -35.6), P(7.8, -32.4)], seed + 44, 1.3, 0.8);
      break;
    }
    case 'le': {                                   // the helm gains a brim under the Later Lê
      const d = domed(6, -47);
      solid(d, T.crown, 0.9); stroke(d, seed + 42, 1.55, 0.85, true);
      stroke([P(-10.6, -39.4), P(10.6, -39.4)], seed + 43, 1.4, 0.85);
      break;
    }
    case 'nguyen': {                               // nón dấu — a shallow wide cone with a spike
      const cone = [P(-9.4, -38.4), P(0, -51.4), P(9.4, -38.4)];
      solid(cone, T.crown, 0.9); stroke(cone, seed + 42, 1.55, 0.85, true);
      stroke([P(0, -51.4), P(0, -55.4)], seed + 43, 1.3, 0.85);
      break;
    }
    case 'trinh': {                                // a tall dark fur cap
      const cap = [P(-6, -39), P(-6.6, -49.6), P(0, -51.2), P(6.6, -49.6), P(6.6, -39)];
      solid(cap, T.crown, 0.92); stroke(cap, seed + 42, 1.55, 0.85, true);
      stroke([P(-6.3, -44.2), P(6.4, -44.2)], seed + 43, 1, 0.5);
      break;
    }
    case 'nguyenLord':                             // bare-headed even when trained: hair and a bun
      solid([P(-6, -38.6), P(-4, -42.2), P(0, -43.4), P(4, -42.2), P(6, -38.6)], colour, 0.9);
      solid(ring(0, -44, 3.1, 8), colour, 0.9);
      stroke([P(-5.9, -38.4), P(5.9, -38.8)], seed + 43, 1.1, 0.7);
      break;
    case 'tayson': {                               // khăn đóng — a soft wrap, knot at the side
      const wrap = [P(-7.4, -39), P(-5, -45.6), P(0, -47), P(5, -45.6), P(7.4, -39)];
      solid(wrap, T.crown, 0.9); stroke(wrap, seed + 42, 1.55, 0.85, true);
      stroke([P(-6.3, -42.2), P(0, -44.2), P(6.3, -42.2)], seed + 43, 1, 0.7);
      solid(ring(8, -42.8, 1.7, 7), colour, 0.9);
      break;
    }
    case 'song': {                                 // a bowl under a wide upturned brim, and a plume
      const d = domed(6, -46);
      solid(d, T.crown, 0.9); stroke(d, seed + 42, 1.55, 0.85, true);
      stroke([P(-11.6, -37.6), P(0, -42), P(11.6, -37.6)], seed + 43, 1.5, 0.85);
      // Red in every source, and drawn in nâu: sỏi son is the player's banner, seal and losses,
      // and the scarcity law outranks the reference.
      stroke([P(0, -46), P(2.4, -50), P(-0.4, -54)], seed + 44, 2, 0.85);
      break;
    }
    case 'yuan': {                                 // conical helm, finial, fur neck lappets
      const cone = [P(-6, -39), P(0, -51.6), P(6, -39)];
      solid(cone, T.crown, 0.9); stroke(cone, seed + 42, 1.55, 0.85, true);
      solid(ring(0, -52.6, 1.6, 7), colour, 0.9);
      stroke([P(-6, -39), P(-8.4, -35.6), P(-8.4, -30.8)], seed + 43, 2, 0.8);
      stroke([P(6, -39), P(8.4, -35.6), P(8.4, -30.8)], seed + 44, 2, 0.8);
      break;
    }
    case 'ming': {                                 // the wide flat rattan hat
      const hat = [P(-12.6, -38.6), P(0, -46.8), P(12.6, -38.6)];
      solid(hat, T.crown, 0.9); stroke(hat, seed + 42, 1.55, 0.85, true);
      stroke([P(0, -46.8), P(0, -49.8)], seed + 43, 1.3, 0.85);
      break;
    }
    case 'qing': {                                 // a tall spike and a tassel, the queue behind
      const d = domed(5.6, -45.8);
      solid(d, T.crown, 0.9); stroke(d, seed + 42, 1.55, 0.85, true);
      stroke([P(0, -45.4), P(0, -56.4)], seed + 43, 1.3, 0.85);
      stroke([P(0, -56.4), P(2.4, -54.4), P(1.5, -50.4)], seed + 44, 1.6, 0.8);
      stroke([P(-5.4, -37.4), P(-9.8, -33), P(-10.4, -25.4)], seed + 45, 1.4, 0.8);
      break;
    }
    case 'champa': {                               // the tall pointed crown of the reliefs
      const crown = [P(-6, -39), P(-4.6, -47.6), P(0, -55), P(4.6, -47.6), P(6, -39)];
      solid(crown, T.crown, 0.9); stroke(crown, seed + 42, 1.55, 0.85, true);
      solid(ring(-6.7, -35.4, 1.3, 6), colour, 0.9);
      solid(ring(6.7, -35.4, 1.3, 6), colour, 0.9);
      break;
    }
    default:
      break;
  }
}

/**
 * Slot 5. Four arms, chosen so that no two disturb the block's outline in the same place — a
 * shield on the left, a low diagonal at the waist, a curve out from the ribs, or the whole man
 * raised onto a pony. At a mark's real size nothing looks like the weapon; what has to change is
 * the shape of the block.
 */
function drawArm(
  g: G, P: PointAt, ring: RingAt, stroke: StrokeAt, solid: SolidAt,
  seed: number, T: ThemeSpec, arm: FigureArm | undefined, tier: FigureTier, colour: number,
): void {
  const shoulder = T.faction === 'champa' ? -29.4 : -30;

  if (arm === 'spear') {
    // The levy's billhook: held upright and close in, so a rank is not a picket fence of crossed
    // shafts. The one arm the four below replace rather than join.
    stroke([P(10.9, -6.6), P(11.6, -30), P(12.3, -62.4)], seed + 60, 2.4, 0.72);
    return;
  }

  if (arm === 'sword' || arm === 'mounted') {
    const hand = arm === 'mounted' ? -20 : -16.5;
    stroke([P(5.6, shoulder + 1.4), P(8.4, hand + 1.5)], seed + 60, 1.5, 0.8);       // the arm
    stroke([P(8.4, hand), P(11.4, hand - 10), P(11.8, hand - 19)], seed + 61, 1.8);  // đao
    stroke([P(6.6, hand - 1.2), P(10.2, hand + 0.2)], seed + 62, 1.3, 0.8);          // the guard
    if (arm === 'sword') {
      // Cái khiên: wood with a rattan-bound edge, lacquered, a boss at the centre.
      const face = T.faction === 'han' ? PIGMENT.chamPale : (T.faction === 'champa' ? PIGMENT.hoePale : PIGMENT.tramPale);
      const shield = ring(-11.2, -22, 5.2, 10);
      stroke([P(-5.8, shoulder + 1.4), P(-8.6, -23.6)], seed + 63, 1.5, 0.8);        // the shield arm
      solid(shield, face, 0.92);
      stroke(shield, seed + 64, 1.5, 0.85, true);
      solid(ring(-11.2, -22, 1.4, 6), colour, 0.9);                                  // the umbo
    }
    return;
  }

  if (arm === 'skirmish') {
    if (T.gun) {
      // Súng hỏa mai — the matchlock, brought across the body. Hand-guns reach this row under the
      // Later Lê and never leave it.
      stroke([P(5.6, shoulder + 1.6), P(3.4, -24.6)], seed + 60, 1.5, 0.8);
      stroke([P(-7.4, -18.2), P(12.6, -30)], seed + 61, 1.9);
      stroke([P(-7.4, -18.2), P(-11, -16)], seed + 62, 2.6);                         // the stock
      solid(ring(1.6, -24.6, 1, 6), colour, 0.9);                                    // the match
    } else {
      // Lao — the javelin, cocked to throw, and a spare at the belt.
      stroke([P(5.6, shoulder + 1.4), P(8.6, -31)], seed + 60, 1.5, 0.8);
      stroke([P(-8.6, -26.2), P(12.4, -32.2)], seed + 61, 1.5);
      solid([P(12.4, -32.2), P(16.8, -33.8), P(13.2, -29.8)], colour, 0.9);
      stroke([P(-8.2, -14), P(-4.6, -21.2)], seed + 62, 1.1, 0.7);
    }
    return;
  }

  if (arm === 'bow') {
    stroke([P(5.6, shoulder + 1.4), P(8.8, -24)], seed + 60, 1.5, 0.8);              // the bow arm
    stroke([P(9, -32.6), P(15.4, -23), P(9, -13.4)], seed + 61, 1.6);
    stroke([P(9, -32.6), P(9, -13.4)], seed + 62, 0.7, 0.7);                         // the string
    stroke([P(3.2, -23), P(13.8, -23)], seed + 63, 0.8, 0.7);                        // the arrow
    if (tier > 0) stroke([P(-9.2, -24), P(-11.2, -20.4), P(-10.6, -16.2)], seed + 64, 1.6, 0.75);
  }
}
/**
 * What a whole host is wearing and carrying.
 *
 * `units` is the host's real composition, so the block draws the army the player actually
 * mustered: bring bowmen and the block fills with bows.
 */
export interface HostKit {
  theme?: FigureTheme;
  /**
   * Whether this host is on the road right now.
   *
   * **This is the whole switch.** A host on the road is drawn in column — narrow at the front,
   * closed up, filed one block behind another along the way it is walking (`marchColumn`) — and a
   * host at rest stands in its doctrine's arrangement. There is no second flag: the column used to
   * be gated behind one, which was off, so every host on the map crossed a province in the loose
   * shape it holds ground in. Part of the kit rather than a separate argument because the kit is
   * already what the marker's redraw signature is built from, and a host that falls in or breaks
   * ranks has to redraw exactly once.
   */
  marching?: boolean;
  /**
   * Which way it is walking, in radians, when it is marching at all.
   *
   * Quantised by the caller to a handful of directions — a column that redrew every time the road
   * curved a degree would rebuild its marker every frame.
   */
  marchHeading?: number;
  /**
   * How far apart the men stand, as a multiple of the formation's own pitch.
   *
   * Not a size — the figures keep the measured size `proportion.ts` gives them, which is the whole
   * point of that contract. This opens the *gaps*.
   *
   * Doc 12's geometry is a plate's geometry: it draws a soldier 42 units to the crown and files
   * him 16 units from his neighbour, which is a dense, deliberately shoulder-to-shoulder block.
   * Carried onto the map at `GROUND_SCALE`, the same ratio puts men **3.23 px wide at a 1.72 px
   * pitch** — overlapping by half — and ranks 1.29 px apart on a figure 6.82 px tall. A 2,400-man
   * host came out 33 px across and read as a smudge with a flag over it.
   *
   * The battle screen was given room by raising `BATTLE_HOST_SCALE` to 2.3; the map was never
   * re-checked. See `MAP_HOST_SPREAD`.
   */
  spread?: number;
  /**
   * The battle shape this host is standing in, if it is in a fight at all.
   *
   * Optional on purpose. Omitted, `armyShape` draws the one arrangement it always has — which is
   * what every caller outside the fight screen wants, because an army crossing a province on the
   * map is not standing in Thế Nỏ.
   */
  shape?: BattleFormation;
  /** @deprecated The four-era name for `theme`. */
  era?: FigureEra;
  tier?: FigureTier;
  accent?: number;
  units?: { spearmen: number; archers: number; heavyInfantry: number };
  /** How the host deploys. Read off `units` when absent — see `compositionFor`. */
  composition?: ArmyComposition;
  /**
   * What this host had when the fight opened.
   *
   * Given, the difference between it and the men still standing is spent in formation order, so
   * the screen empties before the line and the line before the bows. Omitted — which is every
   * caller drawing a host at rest — the army simply deploys whole.
   */
  mustered?: number;
  /** The old boolean, kept so callers that only ever said "spears or not" still work. */
  spear?: boolean;
  /**
   * Whether the block carries its own standards. Default true — a host crossing the map flies
   * its banner. The battle screen sets false and plants each side's standard at its own edge of
   * the field instead: a carried flag slid across the ground with every walk of the block, and
   * the realm's great banner pacing around mid-fight read as wrong to anyone watching.
   */
  standards?: boolean;
  /**
   * Density ceiling for this host's block, overriding `HOST_MARK_CAP`.
   *
   * The map's cap is about density: past 420 marks another figure adds nothing to a marker forty
   * pixels across. On the battle screen the same number is a *frontage*, and it was never checked
   * against the room — 420 marks is 33 files at `FILE_PITCH x BATTLE_HOST_SCALE`, which is 208 px a
   * side on a 390 px field, so both hosts ran off the edges and stood on the village and the camp.
   * See `BATTLE_HOST_MARK_CAP`; every other caller leaves this alone and keeps 420.
   */
  markCap?: number;
}

/**
 * The dynasty a run is currently dressed in.
 *
 * `mandate.era` is the progression track; `FigureEra` is the wardrobe. Four to four, so this is a
 * lookup rather than a judgement — and it is the *only* place the mapping is written down, so the
 * citadel and the host can never end up in different centuries.
 *
 * Modes without a Mandate track sit in the Later Lê, which is where the citadel has been hard-coded
 * since it was written.
 */
export function figureEraFor(state: GameState): FigureEra {
  switch (state.mandate?.era) {
    // The founding era *is* the tenth century, and drew as Lý for as long as Đinh had no
    // wardrobe. It has one now, so the ladder starts where the history does.
    case 'founding': return 'dinh';
    case 'rivalry': return 'tran';
    case 'mandate': return 'nguyen';
    default: return 'le';
  }
}

/**
 * Which wardrobe a given host is dressed in.
 *
 * The player wears the run's rolled dynasty; a rival wears whichever power it was rolled as. Both
 * fall back to the Mandate era, which is what every save made before the roll existed will do and
 * what the modes without a Mandate track do for ever.
 *
 * This and `figureEraFor` are the **only** places the state → wardrobe mapping is written down, so
 * the citadel and the host can never end up in different centuries.
 */
export function themeFor(state: GameState, army: Army): FigureTheme {
  if (army.kingdomId === PLAYER_KINGDOM_ID) return state.muster?.dynasty ?? figureEraFor(state);
  const kingdom = state.kingdoms.find((k) => k.id === army.kingdomId);
  return kingdom?.wardrobe ?? figureEraFor(state);
}

/** What a host is wearing: its dynasty, its elite tier, its realm's colour, its real arms. */
export function hostKitFor(state: GameState, army: Army): HostKit {
  return {
    theme: themeFor(state, army),
    // levy → trained → royal guard, straight off the tier the barracks and the era already set.
    tier: Math.max(0, Math.min(2, army.isLevy ? 0 : (army.elite ?? 0) + 1)) as 0 | 1 | 2,
    accent: army.kingdomId === PLAYER_KINGDOM_ID ? PIGMENT.son : PIGMENT.mucSoft,
    units: army.units,
    composition: compositionForArmy(state, army),
  };
}

/**
 * Which doctrine a host deploys in: its own if it has one, otherwise its realm's standing one.
 *
 * The player's comes from the run's muster roll; a rival's from whatever it was rolled as. Neither
 * is a balance lever — it decides the *shape of the formation*, nothing else.
 */
function compositionForArmy(state: GameState, army: Army): ArmyComposition | undefined {
  if (army.composition) return army.composition;
  if (army.kingdomId === PLAYER_KINGDOM_ID) return state.muster?.composition;
  return state.kingdoms.find((k) => k.id === army.kingdomId)?.composition;
}

/**
 * Draws a host sized by `men`, anchored at its top-left. Returns the block it filled.
 *
 * `rankTarget` lets a caller collect each rank into its own object — which is what a host needs to
 * be able to move at all, since one `Graphics` holding the whole block can only ever stand still.
 * The figures, their jitter and their order are identical either way.
 */
export function drawHost(
  g: G,
  x: number,
  y: number,
  men: number,
  seed: number,
  colour: number,
  s = 1,
  spear: boolean | HostKit = true,
  rankTarget?: (rank: number) => G,
): HostShape {
  const rand = mulberry32(seed);
  const kit: HostKit = typeof spear === 'boolean' ? { spear } : spear;
  // Which arm each figure carries, drawn from the host's own composition rather than a die.
  //
  // It used to be `spear && rand() > 0.25` — three quarters of every host carried a spear no
  // matter what it was made of. So a bow-heavy host and a wall of spearmen drew identically, and
  // the composition the player chose at muster, and now reads on the Order of Battle, was the one
  // thing about an army the picture would not show.
  const mix = kit.units;
  const total = mix ? Math.max(1, mix.spearmen + mix.archers + mix.heavyInfantry) : 0;
  const bowShare = mix ? mix.archers / total : 0;
  const heavyShare = mix ? mix.heavyInfantry / total : 0;
  const armFor = (roll: number): FigureArm | undefined => {
    if (!mix) return kit.spear !== false && roll > 0.25 ? 'spear' : undefined;
    if (roll < bowShare) return 'bow';
    if (roll < bowShare + heavyShare) return 'sword';
    // A quarter of the spearmen are drawn without one, so a block is not a picket fence.
    return roll > bowShare + heavyShare + (1 - bowShare - heavyShare) * 0.2 ? 'spear' : undefined;
  };
  const shape = hostShapeAt(men, s);
  let drawn = 0;
  for (let rank = 0; rank < shape.rows && drawn < shape.marks; rank += 1) {
    const target = rankTarget?.(rank) ?? g;
    for (let file = 0; file < shape.cols && drawn < shape.marks; file += 1) {
      figure(
        target,
        // Jitter scaled by `s` like everything else. It used to be absolute, so at the marker's
        // 0.82 it was a third of a file wide and at menu scale it was half of one — a formation
        // whose raggedness changed with how far away you were standing.
        x + file * FILE_PITCH * s + (rand() - 0.5) * 0.32 * FILE_PITCH * s + rank * RANK_SHEAR * s,
        y + rank * RANK_PITCH * s + (rand() - 0.5) * 0.3 * RANK_PITCH * s,
        s,
        colour,
        { theme: kit.theme ?? kit.era, tier: kit.tier, accent: kit.accent, arm: armFor(rand()) },
      );
      drawn += 1;
    }
  }
  return shape;
}

/**
 * An army is not a block. It is four of them.
 *
 * One block with the weapon types sprinkled through it is a lie about how an army stood, and it
 * throws away the only thing the arm slot is good for. Armies deployed **by arm**: a loose screen
 * of skirmishers out in front to take the first volley and fall back through the line, the shield
 * wall as the main body, the bows behind it shooting over, and the horse as a wing off the flank
 * waiting for something to open.
 *
 * It costs nothing extra to draw — the same marks, arranged — and it buys three things a mixed
 * block cannot: the doctrine reads at a glance, **which part of the army is dying** reads at a
 * glance, and the shape of the formation says what it is *for*.
 */
export type { FormationKey };

interface FormationSlot {
  arm: FigureArm;
  /**
   * Offsets are to the block's **centre**, in multiples of the block grid's own pitch — so the
   * formation keeps its shape whatever `FILE_PITCH` is, and a block that gets wider gets wider in
   * both directions instead of growing through its neighbour.
   *
   * `dx` runs toward the enemy, `dy` toward the viewer.
   */
  dx: number;
  dy: number;
  /** Some blocks stand looser than the line: a screen is not shoulder to shoulder. */
  pitch: number;
  rank: number;
  /** Casualty order. The screen is spent first and the horse last. */
  pri: number;
}

const FORMATION: Record<FormationKey, FormationSlot> = {
  screen: { arm: 'skirmish', dx: 7.0, dy: -1.67, pitch: 1.44, rank: 1, pri: 0 },
  line: { arm: 'sword', dx: 0, dy: 0, pitch: 1, rank: 1, pri: 1 },
  bows: { arm: 'bow', dx: -6.63, dy: 2.5, pitch: 1, rank: 1, pri: 2 },
  horse: { arm: 'mounted', dx: 1.125, dy: 7.17, pitch: 1.875, rank: 1.33, pri: 3 },
};

/** The block each shape's outline is built around — the one the eye finds the shape by. */
const SILHOUETTE_BLOCK: Record<BattleFormation, FormationKey> = {
  chong: 'line',
  xung: 'horse',
  tan: 'screen',
  quy: 'line',
  no: 'bows',
};

/** One block of a formation, and where it stands in the army's own coordinates. */
export interface FormationBlock {
  key: FormationKey;
  arm: FigureArm;
  /** Casualty order: lowest is spent first. */
  pri: number;
  marks: number;
  cols: number;
  rows: number;
  /** Top-left of the block — the same anchor `drawHost` takes. */
  x: number;
  y: number;
  /** Distance between files and between ranks, for this block. */
  pitch: number;
  rankPitch: number;
  /** How far each rank back steps sideways. Carried on the block so `spread` reaches it too. */
  shear: number;
  /**
   * How far each file to the right steps *down* — the other half of a lean, and zero everywhere
   * but a marching column on a road that runs more across the sheet than up it.
   *
   * `shear` alone can only tilt a block that is stacked in ranks down the sheet. A column marching
   * east is stacked in files across it, and without this the only lean available to it was none:
   * every road between due east and the diagonal drew the same flat bar. See `armyShape`.
   */
  fileShear: number;
  /** Ranks of one, two, three, drawn as a point. Only Thế Xung's horse asks for it. */
  wedge?: boolean;
  /** Where its feet land, which is what the painting order sorts on. */
  feet: number;
}

/** A whole army: its blocks, and the ground the lot of them stand on. */
export interface ArmyShape {
  blocks: FormationBlock[];
  marks: number;
  width: number;
  height: number;
  /** Extent in the army's own coordinates, so a caller can centre or footprint it. */
  left: number;
  top: number;
}

/**
 * Which doctrine a host deploys in.
 *
 * An explicit `composition` wins. Failing that it is read off the host's real `units`, so an army
 * that was mustered bow-heavy deploys as an archer host whether or not anybody labelled it one.
 */
export function compositionFor(kit: HostKit): ArmyComposition {
  return compositionOfUnits(kit.units, kit.composition);
}

/**
 * The formation a host of this many men fills at drawing scale `s`.
 *
 * The doctrine gives each block its *share* of the marks, not a fixed count, so a small host
 * deploys the same shape as a large one rather than the same number of men.
 *
 * `mustered` is what the host started the fight with. Give it, and the difference is spent **in
 * formation order** — the screen first, then the line, then the bows, and the horse last — with
 * each block keeping its frontage and losing depth, so the rear rank empties and the fighting line
 * stays where it is. That is the whole reason an army is several blocks: a mixed block loses a
 * mark at random and nothing is learned, where a formation loses its screen inside a few beats,
 * then grinds its line down, and when the *bows* start disappearing the picture has said the front
 * has collapsed without a word of text.
 *
 * Omit it — every caller that is drawing a host at rest — and the army simply deploys whole.
 */
export function armyShape(
  men: number, composition: ArmyComposition, s = 1, mustered?: number, spread = 1,
  shape?: BattleFormation, markCap?: number,
  /**
   * The road this host is on, if it is on one — its heading in radians.
   *
   * Hành quân is a *drawing* and not a battle shape: nothing resolves a fight against it and it is
   * not on the counter ring. It is settled here rather than handed in as a table of offsets
   * because filing one block behind another needs the block's real pitch in world units, which is
   * computed below and nowhere else. See `marchColumn`.
   */
  march?: { heading: number },
): ArmyShape {
  // The allocation — shares by doctrine, casualties spent in formation order — is `blockShares`,
  // which the fight resolver reads too. One table, one arithmetic, so the dock can never offer a
  // shape the exchange thinks has no block left to stand on.
  const shares = blockShares(composition, men, mustered, markCap);
  const plan = DOCTRINE[composition] ?? DOCTRINE.balanced;
  // On the road, the column decides each block's frontage and how close its files stand; where it
  // stands is settled after the loop, once the pitches are known.
  const column = march ? marchColumn(shares, march.heading) : undefined;
  // The five shapes, when a host is standing in one. Absent — every caller that is not the fight
  // screen and not on a road — the base table draws exactly what it always has, which is what keeps
  // the History plate out of this entirely.
  const tweaks: Partial<Record<FormationKey, FormationTweak>> | undefined = column
    ? Object.fromEntries(
      column.order.map((key) => [key, { aspect: column.aspect[key] }]),
    ) as Partial<Record<FormationKey, FormationTweak>>
    : (shape ? FORMATION_PLAN[shape] : undefined);

  /**
   * The silhouette must survive the doctrine.
   *
   * Every host can stand in every shape since the wind rework, and on the hardest setting the
   * drawing is the ONLY telegraph — so a spear host in Thế Xung has to show a point and a shock
   * host in Thế Tán has to show a loose screen, even though neither doctrine has a single mark in
   * the block those shapes are built around. The block is borrowed: a share of the line steps
   * into the empty slot and stands in that block's geometry, drawn as the line's own men (a
   * wedge of spearmen, not phantom riders). The map marker never sees this — no shape, no loan.
   */
  const borrowedArm: Partial<Record<FormationKey, FigureArm>> = {};
  if (shape) {
    const lead = SILHOUETTE_BLOCK[shape];
    if (lead !== 'line' && shares[lead].full <= 0 && shares.line.standing > 7) {
      const take = Math.max(6, Math.round(shares.line.standing * 0.4));
      shares[lead] = { full: take, standing: take };
      shares.line = { full: Math.max(1, shares.line.full - take), standing: shares.line.standing - take };
      borrowedArm[lead] = FORMATION.line.arm;
    }
  }

  const pitch = FILE_PITCH * s * spread;
  const rankPitch = RANK_PITCH * s * spread;
  const shear = RANK_SHEAR * s * spread;
  const blocks: FormationBlock[] = [];
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;

  for (const key of FORMATION_ORDER) {
    const standingMarks = shares[key].standing;
    if (standingMarks <= 0) continue;
    const base = FORMATION[key];
    const tweak = tweaks?.[key];
    const slot = tweak
      ? {
        ...base,
        dx: tweak.dx ?? base.dx,
        dy: tweak.dy ?? base.dy,
        pitch: tweak.pitch ?? base.pitch,
      }
      : base;
    const bp = pitch * slot.pitch;
    const br = rankPitch * slot.rank;
    // Frontage is set by what the block mustered; depth by what is left of it. A block that has
    // taken losses stands the same width and fewer ranks deep, which is a host thinning rather
    // than a host shrinking.
    const full = Math.max(1, shares[key].full) || standingMarks;
    const aspect = tweak?.aspect ?? plan[key].aspect;
    const fullRows = Math.max(1, Math.round(Math.sqrt(full / aspect)));
    let cols = Math.max(1, Math.ceil(full / fullRows));
    let rows = Math.max(1, Math.ceil(standingMarks / cols));
    // **A wedge is not `marks / cols` ranks deep.**
    //
    // `planArmy` lays a wedge out in ranks of one, two, three — so `n` marks need the triangular
    // row count, not the rectangular one, and the point of the wedge stands further forward than
    // `rows` accounts for. Everything derived from `rows` inherited the error: the block's `feet`
    // (which decides paint order), its share of the shape's bounds, and above all its ground —
    // measured on the map, the wedge's men stood **half a figure's width in front of their own
    // shadow**, the one case in the whole formation table where a host was not standing on it.
    if (tweak?.wedge) {
      // Ranks of 1, 2, 3, … so `r(r + 1) / 2 >= n` — the same walk `planArmy` makes.
      const wedgeRows = Math.max(1, Math.ceil((Math.sqrt(8 * standingMarks + 1) - 1) / 2));
      rows = wedgeRows;
      // The widest rank of a wedge holds `rows` men, and `planArmy` centres every rank on
      // `(cols - 1) / 2` — so the files it actually occupies are the wider of the two.
      cols = Math.max(cols, wedgeRows);
    }
    const marks = standingMarks;
    // Centre-anchored: the offset places the middle of the block, and the files grow either side.
    const bx = slot.dx * pitch - ((cols - 1) * bp) / 2;
    const by = slot.dy * rankPitch - ((rows - 1) * br) / 2;
    const feet = by + (rows - 1) * br;
    blocks.push({
      key, arm: borrowedArm[key] ?? slot.arm, pri: slot.pri, marks, cols, rows,
      x: bx, y: by, pitch: bp, rankPitch: br, shear, fileShear: 0, feet, wedge: tweak?.wedge,
    });
    left = Math.min(left, bx);
    right = Math.max(right, bx + (cols - 1) * bp);
    top = Math.min(top, by);
    bottom = Math.max(bottom, feet);
  }

  /**
   * **Nose to tail.**
   *
   * On the road the blocks are not where the doctrine puts them — they are strung out along it,
   * each one clearing the one ahead by a single marching interval and no more. That distance is
   * the block's own along-road extent, which is only knowable here: `cols`, `rows` and the two
   * pitches are all decided above, and a table of fixed offsets (which is what this was, twice)
   * cannot see any of them. The projection `|cos|·width + |sin|·depth` is the block's shadow on
   * the road's own axis, so the interval is a real gap at every heading and not just at the four
   * that happen to line up with the sheet.
   *
   * The head of the column is forward: the screen leads, the horse brings up the rear.
   */
  if (column && blocks.length > 0) {
    const cos = Math.cos(column.heading);
    const sin = Math.sin(column.heading);
    /**
     * **Tight across the road, open along it — and leaning to the road it is actually on.**
     *
     * A block is `cols` across screen-x and `rows` down screen-y, so which of its two pitches is
     * the road depends on the heading. The first pass closed both up and put men in file inside
     * one another; the second opened the along-road one and blended the two on `cos(2th)`, which
     * left a **square block on all four diagonals** — half of the eight headings the map
     * quantises to, and the whole of *there are no direction awareness*. Measured on a 2,600-man
     * host: 105 x 25 due east, 29 x 127 due south, and 84 x 73 to the south-east.
     *
     * So there is no blend. `upright` is which axis the road is more nearly running along, and the
     * block is laid out on it: files across the road, ranks down it. The other half of the answer
     * is the lean — a rank steps sideways as it steps back (`shear`), or a file steps down as
     * it steps across (`fileShear`), by exactly the road's own gradient. Due south the gradient is
     * zero and the column is a plain vertical file; at forty-five degrees it is one, and each rank
     * stands a full step to the side of the rank in front, which is a 45 degree file. Neither
     * layout is ever asked for a steeper lean than that, because `upright` picks the shallower.
     */
    const upright = Math.abs(sin) >= Math.abs(cos);
    /**
     * One rank's step measured **down the road itself**, not along a screen axis.
     *
     * A figure is 3.86 wide and 8.15 tall at map scale, so the distance that clears the man in
     * front is not one number but two — `MARCH_ALONG_X` going east, `MARCH_ALONG_Y` going north
     * — and a diagonal needs neither in full. Two men are clear of each other as soon as they
     * are clear on *one* axis, so the step a road asks for is the **smaller** of the two demands,
     * not their sum: at forty-five degrees a stride of 1.30 pitches puts a full figure-width
     * between one man and the next in x, and what they do in y no longer matters.
     *
     * Both other readings were tried and measured on a 2,600-man host. Dividing the laid-out
     * axis's number back out of the heading charges a diagonal the full *northward* clearance on
     * both axes: 147 units of road against 105 due east, the same men with forty per cent more air
     * in the file. Adding the two demands is nearer but still generous, and it pushed the largest
     * host's column to 306 units, past the length a province can hold.
     */
    const stepAlong = Math.min(
      Math.abs(cos) > 0 ? column.alongX / Math.abs(cos) : Infinity,
      Math.abs(sin) > 0 ? column.alongY / Math.abs(sin) : Infinity,
    ) * pitch;
    // The road's gradient on the axis the block is *not* laid out on: how far sideways a rank
    // steps as it steps back, or how far down a file steps as it steps across. Never past one,
    // because `upright` lays the block out on whichever axis the road runs more nearly along.
    const gradient = upright ? cos / Math.abs(sin) : sin / Math.abs(cos);
    const extent = new Map<FormationKey, number>();
    for (const block of blocks) {
      const room = column.room[block.key] ?? 1;
      // Across the road the column is tight, and that pitch is the sheet's; along it, the pitch is
      // whatever share of the road's own step this axis carries.
      block.pitch = (upright ? column.acrossX * pitch : stepAlong * Math.abs(cos)) * room;
      block.rankPitch = (upright ? stepAlong * Math.abs(sin) : column.acrossY * pitch) * room;
      // The decorative stagger stays — it is what keeps a file from reading as a drawn grid —
      // and the lean is added to it rather than replacing it.
      block.shear = shear * column.shear + (upright ? block.rankPitch * gradient : 0);
      block.fileShear = upright ? 0 : block.pitch * gradient;
      extent.set(block.key, (upright ? block.rows - 1 : block.cols - 1) * stepAlong * room);
    }
    // The interval is a distance down the road, so it is always the along-road step.
    const gap = column.interval * stepAlong;
    let cursor = 0;
    const centres = new Map<FormationKey, number>();
    for (const key of column.order) {
      const span = extent.get(key);
      if (span === undefined) continue;
      if (centres.size > 0) cursor += gap;
      centres.set(key, cursor + span / 2);
      cursor += span;
    }
    const middle = cursor / 2;
    left = Infinity; right = -Infinity; top = Infinity; bottom = -Infinity;
    for (const block of blocks) {
      const along = middle - (centres.get(block.key) ?? middle);
      // The grid's own extent, and the run the lean adds to it — which is signed, because a
      // road running west leans the file the other way. A block centred on its files alone would
      // sit half a lean off the road it is meant to be walking down.
      const wide = (block.cols - 1) * block.pitch;
      const deep = (block.rows - 1) * block.rankPitch;
      const runX = (block.rows - 1) * block.shear;
      const runY = (block.cols - 1) * block.fileShear;
      block.x = along * cos - (wide + runX) / 2;
      block.y = along * sin - (deep + runY) / 2;
      // Paint order sorts on the feet, so the lean's lowest man is the one that counts.
      block.feet = block.y + deep + Math.max(0, runY);
      left = Math.min(left, block.x + Math.min(0, runX));
      right = Math.max(right, block.x + wide + Math.max(0, runX));
      top = Math.min(top, block.y + Math.min(0, runY));
      bottom = Math.max(bottom, block.feet);
    }
  }

  // Painted bottom-up by ascending feet: whatever stands nearer the viewer is drawn last, or the
  // rear ranks come out on top of the front line. (`setDepth` inside a container is a no-op.)
  blocks.sort((a, b) => a.feet - b.feet);
  const total = FORMATION_ORDER.reduce((sum, key) => sum + shares[key].full, 0);
  return {
    blocks, marks: total,
    left, top, width: right - left, height: bottom - top,
  };
}

/**
 * Draws a whole army as its formation, anchored so that `x, y` is the **line's** centre-front —
 * the same place a single block used to stand, so callers keep their anchoring.
 *
 * `rankTarget` is handed a running index across every block, so a caller that wants each rank in
 * its own object (which is what lets a host move at all) gets one flat list back.
 */
/** One soldier's place in a formation: where he stands, which rank layer he draws into, what he carries. */
export interface FigurePlacement {
  x: number;
  y: number;
  /** Running rank index across every block — the same index `drawArmy` hands `rankTarget`. */
  rank: number;
  block: FormationKey;
  arm?: FigureArm;
}

/** A whole army as data: the shape, and every man's position in paint order. */
export interface ArmyPlan {
  shape: ArmyShape;
  figures: FigurePlacement[];
}

/**
 * The road a host is on, as `armyShape` wants it — or nothing, when it is standing still.
 *
 * One reading of the kit, shared by everything that draws a host, because the marker computes its
 * shape twice: once for the ground, the standard and the anchor, and once again inside `planArmy`
 * for the men. The two used to disagree the moment either side's condition drifted, which reads on
 * the map as a banner and a shadow that have formed column while the men have not moved.
 */
export function marchOf(kit: HostKit): { heading: number } | undefined {
  return kit.marching ? { heading: kit.marchHeading ?? 0 } : undefined;
}

/**
 * The placement walk `drawArmy` has always made, separated from the inking — so the same plan can
 * be drawn as live ink (`drawArmy` below, pixel-identical, held to it by `diag-army-hash`) or
 * placed as stamped images (`stampedArmy` in figureStamps.ts).
 *
 * Every `rand()` call happens in the exact order `drawBlock` made it, or the wobble changes and
 * the identity oracle fails: one stream per block, seeded `seed + block.pri * 131`, consumed
 * twice per figure in file order.
 */
export function planArmy(
  x: number,
  y: number,
  men: number,
  seed: number,
  s = 1,
  kit: HostKit = {},
): ArmyPlan {
  // **The men have to be laid out on the same plan as the ground under them.**
  //
  // This recomputed the shape from the kit alone, so a caller that had already worked one out with
  // an arrangement of its own got the ground, the shadow, the standard and the anchor from *its*
  // shape and the actual figures from *this* one. On the map that read as a host whose banner and
  // footprint closed into column while every man stayed exactly where he had been standing.
  // `marching` lives on the kit precisely so it survives the second call.
  const shape = armyShape(
    men, compositionFor(kit), s, kit.mustered, kit.spread ?? 1, kit.shape, kit.markCap,
    marchOf(kit),
  );
  const figures: FigurePlacement[] = [];
  let index = 0;
  for (const block of shape.blocks) {
    const rand = mulberry32(seed + block.pri * 131);
    const bx = x + block.x;
    const by = y + block.y;
    const shear = block.shear;
    let drawn = 0;
    if (block.wedge) {
      let rank = 0;
      while (drawn < block.marks) {
        const wide = rank + 1;
        for (let file = 0; file < wide && drawn < block.marks; file += 1) {
          const offset = (block.cols - 1) / 2 - rank / 2 + file;
          figures.push({
            x: bx + offset * block.pitch + (rand() - 0.5) * 0.32 * block.pitch + rank * shear,
            y: by + rank * block.rankPitch + (rand() - 0.5) * 0.3 * block.rankPitch,
            rank: index + rank, block: block.key, arm: block.arm,
          });
          drawn += 1;
        }
        rank += 1;
      }
    } else {
      for (let rank = 0; rank < block.rows && drawn < block.marks; rank += 1) {
        for (let file = 0; file < block.cols && drawn < block.marks; file += 1) {
          figures.push({
            x: bx + file * block.pitch + (rand() - 0.5) * 0.32 * block.pitch + rank * shear,
            y: by + rank * block.rankPitch + (rand() - 0.5) * 0.3 * block.rankPitch
              + file * block.fileShear,
            rank: index + rank, block: block.key, arm: block.arm,
          });
          drawn += 1;
        }
      }
    }
    index += block.rows;
  }
  return { shape, figures };
}

export function drawArmy(
  g: G,
  x: number,
  y: number,
  men: number,
  seed: number,
  colour: number,
  s = 1,
  kit: HostKit = {},
  rankTarget?: (index: number) => G,
): ArmyShape {
  const plan = planArmy(x, y, men, seed, s, kit);
  for (const man of plan.figures) {
    figure(
      rankTarget ? rankTarget(man.rank) : g,
      man.x, man.y, s, colour,
      { theme: kit.theme ?? kit.era, tier: kit.tier, accent: kit.accent, arm: man.arm },
    );
  }
  return plan.shape;
}

/**
 * **How much ground a rank of men covers beyond the men themselves.**
 *
 * All three are in figure units, so they hold at every drawing scale. A figure is 8.57 units wide
 * at any `s`, which is what these were measured against (`_footfit` prints the overhang per block
 * as a fraction of one figure).
 *
 * They used to be 9 / 6 / 1.1, and the depth was wrong twice over: 6 made the ellipse's half-depth
 * three units — a third of a figure's width past the boots — and the 1.1 lead pushed all of that
 * to the *front*, so a line's shadow reached 0.46 of a figure ahead of the front rank against 0.19
 * behind the back one. On the map at `GROUND_SCALE` that is 3 px and invisible; at
 * `BATTLE_HOST_SCALE` it is 8.5 px of grey apron laid in front of every rank on the field, which
 * is what a player sees and calls a wrong shadow.
 *
 * Width is deliberately left alone: 9 units puts the ellipse's edge under the outermost man's own
 * silhouette (a figure is drawn 8.57 wide), which is where the ground under a man ends.
 */
const FOOT_WIDTH = 9;
/** Shallow, as a shadow at midday is: about a fifth of a figure past the front and back ranks. */
const FOOT_DEPTH = 3.4;
/** A hair forward, so the light reads as coming from behind the host rather than from nowhere. */
const FOOT_LEAD = 0.35;

/**
 * The ground a host stands on. Takes the **same `x, y` and `s` as the `drawHost` call it belongs
 * to** — one anchoring convention, because two is how the shadow drifted off the men twice.
 *
 * Computed from where the feet actually land, not from `shape.width/height`. Those are the block's
 * *pitch* (`cols × spacing`), which overshoots the outermost figure by a full spacing in each axis,
 * and `y` is the BACK rank — the front rank's feet are a spacing short of `y + height`. Sizing the
 * ellipse off them put it a spacing low and, once an `x`-offset convention slipped, most of a block
 * to the left as well: a puddle beside the men rather than the ground under them.
 *
 * A round `groundShadow` cannot do this job at all — its height is tied to its width, and these
 * blocks are wide, shallow and sheared.
 */
export function hostFootprint(g: G, x: number, y: number, shape: HostShape, s = 1, alpha = 0.07): void {
  const { spanX, spanY } = hostSpan(shape, s);
  g.fillStyle(PIGMENT.muc, alpha);
  g.fillEllipse(x + spanX / 2, y + spanY / 2 + 1.1 * s, spanX + 9 * s, spanY + 6 * s);
}

/**
 * Where to put a formation so it stands like a single block did: centred across its files, with the
 * rearmost feet on the anchor line.
 *
 * A caller that anchored `drawHost` at `(-width/2, -height)` gets the same picture by anchoring
 * `drawArmy` here, which is what keeps the shadow, the standard and the marker's own origin
 * registered with the men through the change.
 */
export function armyAnchor(shape: ArmyShape): { x: number; y: number } {
  return { x: -(shape.left + shape.width / 2), y: -(shape.top + shape.height) };
}

/**
 * The ground the army stands on — **one patch per block**, not one under the lot of them.
 *
 * A single ellipse around a formation is a puddle with three groups of men floating in it: the
 * blocks are deliberately apart, and the gaps between them are the thing that makes the deployment
 * readable. Per block, it also means a block that loses every man can lose its ground with them.
 */
export function armyFootprint(g: G, x: number, y: number, shape: ArmyShape, s = 1, alpha = 0.07): void {
  g.fillStyle(PIGMENT.muc, alpha);
  for (const block of shape.blocks) {
    const spanX = (block.cols - 1) * block.pitch + (block.rows - 1) * block.shear;
    const spanY = (block.rows - 1) * block.rankPitch + (block.cols - 1) * block.fileShear;
    g.fillEllipse(
      x + block.x + spanX / 2, y + block.y + spanY / 2 + FOOT_LEAD * s,
      spanX + FOOT_WIDTH * s, spanY + FOOT_DEPTH * s,
    );
  }
}

/**
 * The ground the men's feet actually cover, measured from the same anchor `drawHost` is given.
 *
 * Deliberately **not** `shape.width`/`shape.height`: those are the block's *pitch*, `cols × spacing`,
 * which overshoots the outermost figure by a full spacing on each axis. Sizing anything off them
 * puts it a spacing too low and too wide. The shadow learned this the hard way (see
 * `hostFootprint`'s history); the standard then made the identical mistake independently, planting
 * itself a constant ~9 px in front of the men and ~2 px outside the shadow's left edge, at every
 * army size. Exported so there is exactly one answer to "where is this host standing".
 */
export function hostSpan(shape: HostShape, s = 1): { spanX: number; spanY: number } {
  return {
    // The rank shear pushes each rank right, so the feet span wider than the files alone.
    spanX: (shape.cols - 1) * FILE_PITCH * s + (shape.rows - 1) * RANK_SHEAR * s,
    spanY: (shape.rows - 1) * RANK_PITCH * s,
  };
}

/**
 * The cadence of a standing host: each rank shifts on its own phase, front rank first, so the block
 * breathes instead of sitting there as a printed stamp.
 *
 * Per *rank* rather than per figure on purpose. A busy map carries dozens of these markers, and four
 * tweens per host instead of forty is the difference between free and a frame budget.
 */
export function marchInPlace(
  scene: Phaser.Scene,
  ranks: ReadonlyArray<{ y: number }>,
  s = 1,
): Phaser.Tweens.Tween[] {
  // **Created stopped.** A host that is standing still is standing still: men holding ground do
  // not rise and fall on the spot, and every marker on the map doing it at once read as the whole
  // country breathing. The caller starts the cadence when the host is actually moving — see
  // `setHostStepping` — and stops it when it halts.
  return ranks.map((rank, index) => scene.tweens.add({
    targets: rank,
    y: rank.y - 0.29 * RANK_PITCH * s,
    duration: 900 + index * 80,
    delay: index * 200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    paused: true,
  }));
}

/** Where a marker keeps the cadence tweens its ranks step to, so anything holding the marker can stop them. */
export const HOST_STEP_KEY = 'hostStepTweens';

/**
 * Starts or stops a host's stepping cadence.
 *
 * The rank tweens are `yoyo`/`repeat: -1` and own the ranks' `y`, so stopping one mid-swing would
 * leave that rank standing a third of a rank-pitch out of line with its neighbours. Stopping
 * therefore also puts every rank back on the line it was built on, which is what `restart` +
 * `pause` does in one step: the tween seeks its start value and holds there.
 */
export function setHostStepping(
  holder: { getData(key: string): unknown },
  stepping: boolean,
): void {
  const tweens = holder.getData(HOST_STEP_KEY) as Phaser.Tweens.Tween[] | undefined;
  if (!tweens) return;
  for (const tween of tweens) {
    if (!tween || (tween as unknown as { pendingRemove?: boolean }).pendingRemove) continue;
    if (stepping) {
      tween.resume();
    } else {
      tween.restart();
      tween.pause();
    }
  }
}

// ── seals ─────────────────────────────────────────────────────────────────────

/**
 * **The clash** - crossed blades in a burst of soi son, the one mark that says "a fight is here".
 *
 * Lifted out of the battle screen so the map can carry the same mark rather than an approximation
 * of it. The map used to draw its own: a red ring with two straight white strokes across it, which
 * at marker size reads as a cancel badge - the international "no" glyph - and not as swords. The
 * two places in the game that mean the same thing now draw the same thing.
 *
 * Three pieces, each answering a different question, and the reason the blades are hung at -45 and
 * -135 rather than at +-45 is that both points then stand up and both hilts hang down. At +-45 the
 * points sit at opposite corners and the two hilts make a dark blob exactly where the eye lands.
 *
 * Everything is drawn into one `Graphics` at an explicit scale, so a caller can size it to a
 * 26-unit map badge or to the 46-unit mark the battlefield wants without a nested container. The
 * battle screen animates its own copy on top of this; nothing here moves.
 */
export function clashDevice(
  g: G,
  x: number,
  y: number,
  scale = 1,
  halo = true,
  accent = PIGMENT.son,
): void {
  const s = scale;
  /** A point in blade space, rotated by `turn` and dropped at the device origin. */
  const at = (px: number, py: number, turn: number): Pt => ({
    x: x + (px * Math.cos(turn) - py * Math.sin(turn)) * s,
    y: y + (px * Math.sin(turn) + py * Math.cos(turn)) * s,
  });
  const quad = (left: number, top: number, w: number, h: number, turn: number): Pt[] => [
    at(left, top, turn), at(left + w, top, turn),
    at(left + w, top + h, turn), at(left, top + h, turn),
  ];

  // A soft ground first, so the mark has weight over pale paper and over a dark block of men
  // alike. Without it the blades are a thin white scratch on whatever happens to be behind.
  if (halo) {
    g.fillStyle(accent, 0.16);
    g.fillCircle(x, y, 19 * s);
  }

  // Eight rays, alternating long and short and turned off-axis so the star does not read as a
  // compass. Uneven lengths because a cut mark on a print is never symmetrical.
  g.fillStyle(accent, 0.9);
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = (ray / 8) * Math.PI * 2 + 0.26;
    const reach = ray % 2 === 0 ? 23 : 14.5;
    g.fillTriangle(
      x + Math.cos(angle) * reach * s, y + Math.sin(angle) * reach * s,
      x + Math.cos(angle + 0.3) * 5.5 * s, y + Math.sin(angle + 0.3) * 5.5 * s,
      x + Math.cos(angle - 0.3) * 5.5 * s, y + Math.sin(angle - 0.3) * 5.5 * s,
    );
  }

  for (const turn of [-Math.PI / 4, -Math.PI * 0.75]) {
    // Grip, pommel and guard in soot; the guard is a short bar rather than a full cross-piece
    // because at this size a hilt drawn in detail is a smudge.
    g.fillStyle(PIGMENT.muc, 1);
    g.fillPoints(quad(-13, -1.3, 6.5, 2.6, turn), true);
    const pommel = at(-13.2, 0, turn);
    g.fillCircle(pommel.x, pommel.y, 1.9 * s);
    g.fillPoints(quad(-6.8, -3.8, 2.2, 7.6, turn), true);

    // Paper-bright, so the blade reads against the dark blocks of men it stands between.
    const edge: Pt[] = [
      at(-4.2, -2.4, turn), at(10, -2.1, turn), at(15.5, 0, turn),
      at(10, 2.1, turn), at(-4.2, 2.4, turn),
    ];
    g.fillStyle(PIGMENT.diepHi, 1);
    g.fillPoints(edge, true);
    g.lineStyle(1.3 * s, PIGMENT.muc, 0.95);
    g.strokePoints(edge, true, true);
  }
}

export type SealMotif = 'star' | 'lotus' | 'bird' | 'stakes';

/**
 * A stamped seal. The device is drawn, never written: the drum sun, a lotus, a Lạc bird, or the
 * Bạch Đằng stakes. Slightly crooked, because a seal pressed by hand is.
 */
export function seal(g: G, x: number, y: number, size: number, motif: SealMotif = 'star'): void {
  const half = size / 2;
  const unit = size * 0.28;
  const rotate = -0.06;
  const at = (dx: number, dy: number): Pt => ({
    x: x + dx * Math.cos(rotate) - dy * Math.sin(rotate),
    y: y + dx * Math.sin(rotate) + dy * Math.cos(rotate),
  });

  g.fillStyle(PIGMENT.son, 0.9);
  g.fillPoints([at(-half, -half), at(half, -half), at(half, half), at(-half, half)], true);
  g.lineStyle(1.1, 0xfbf2df, 0.42);
  g.strokePoints(
    [at(-half + 2.5, -half + 2.5), at(half - 2.5, -half + 2.5), at(half - 2.5, half - 2.5), at(-half + 2.5, half - 2.5), at(-half + 2.5, -half + 2.5)],
    false,
    false,
  );

  g.lineStyle(Math.max(1, size * 0.055), 0xfbf2df, 0.95);
  if (motif === 'lotus') {
    for (let petal = -2; petal <= 2; petal += 1) {
      const angle = -Math.PI / 2 + petal * 0.52;
      g.strokePoints(
        [at(0, unit * 0.9), at(Math.cos(angle) * unit * 1.1, Math.sin(angle) * unit * 0.9), at(Math.cos(angle) * unit * 0.6, -unit * 0.9)],
        false,
        false,
      );
    }
  } else if (motif === 'stakes') {
    for (let stake = -2; stake <= 2; stake += 1) {
      g.strokePoints([at(stake * unit * 0.52, unit), at(stake * unit * 0.52 + (stake % 2 ? 1.5 : -1.5), -unit)], false, false);
    }
    g.lineStyle(Math.max(1, size * 0.045), 0xfbf2df, 0.6);
    g.strokePoints([at(-unit * 1.3, unit * 0.2), at(unit * 1.3, unit * 0.05)], false, false);
  } else if (motif === 'bird') {
    heron(g, x, y, size * 0.11, true, 0xfbf2df);
  } else {
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = (ray / 12) * Math.PI * 2;
      g.strokePoints(
        [at(Math.cos(angle) * unit * 0.32, Math.sin(angle) * unit * 0.32), at(Math.cos(angle) * unit * 1.15, Math.sin(angle) * unit * 1.15)],
        false,
        false,
      );
    }
    g.fillStyle(0xfbf2df, 0.95);
    g.fillCircle(x, y, unit * 0.3);
  }
}

// ── the drum, unrolled ────────────────────────────────────────────────────────

/**
 * Răng cưa — the sawtooth band. The commonest geometric register on a drum, and the one that still
 * reads at seven pixels tall. A Greek-key meander at that size renders, unmistakably, as the letter
 * P repeated ninety times; this does not.
 */
export function sawtoothBand(g: G, x: number, y: number, width: number, height: number, alpha = 0.42, colour: number = PIGMENT.muc): void {
  g.lineStyle(0.75, colour, alpha);
  g.lineBetween(x, y, x + width, y);
  g.lineBetween(x, y + height, x + width, y + height);
  const step = height * 1.05;
  g.lineStyle(0.75, colour, alpha * 1.2);
  for (let index = 0; x + index * step < x + width - step; index += 1) {
    const px = x + 1 + index * step;
    g.strokePoints(
      [
        { x: px, y: y + height - 0.5 },
        { x: px + step * 0.5, y: y + 0.5 },
        { x: px + step, y: y + height - 0.5 },
      ],
      false,
      false,
    );
  }
}

/**
 * Chim Lạc — the long-billed water bird of the tympanum. At meter size the bill is the only
 * recognisable part, so it gets 40% of the length.
 */
export function heron(g: G, x: number, y: number, s: number, filled: boolean, colour: number = PIGMENT.muc): void {
  const points: Pt[] = [
    { x: x - 10.5 * s, y: y - 0.2 * s }, { x: x - 4.0 * s, y: y - 1.6 * s }, { x: x - 2.0 * s, y: y - 2.4 * s },
    { x: x + 1.2 * s, y: y - 2.0 * s }, { x: x + 4.0 * s, y: y - 5.0 * s }, { x: x + 7.4 * s, y: y - 4.2 * s },
    { x: x + 6.0 * s, y: y - 1.6 * s }, { x: x + 10.6 * s, y: y - 2.4 * s }, { x: x + 10.2 * s, y: y + 0.6 * s },
    { x: x + 5.6 * s, y: y + 1.6 * s }, { x: x + 6.2 * s, y: y + 4.6 * s }, { x: x + 4.8 * s, y: y + 4.4 * s },
    { x: x + 3.4 * s, y: y + 1.8 * s }, { x: x - 2.6 * s, y: y + 1.0 * s }, { x: x - 4.4 * s, y: y - 0.2 * s },
  ];
  if (filled) {
    g.fillStyle(colour, 0.8);
    g.fillPoints(points, true);
  }
  inkPath(g, points, 5, {
    width: 0.55 * Math.max(1, s * 0.5), alpha: filled ? 0.6 : 0.3, colour, wobble: 0.15, step: 3.5, closed: true,
  });
}

/**
 * The wave meter: herons ink in as the wave approaches. A bar chart from 500 BCE.
 *
 * Many small birds, not few large ones — at frieze density the eye reads the rhythm and supplies
 * the bird, exactly as it does on the drum itself. The opposite instinct produces a row of blobs.
 */
export function heronMeter(
  g: G,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  onDark = false,
): void {
  // On paper the birds are ink on a pale plate; on the dark chrome band the plate would read as a
  // grey placeholder, so there the birds are light and the ground is left alone.
  const flown = onDark ? PIGMENT.hoePale : PIGMENT.muc;
  const waiting = onDark ? PIGMENT.mucFaint : PIGMENT.muc;
  if (!onDark) {
    printedShape(
      g,
      [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
      PIGMENT.diepLo, 904, { width: 0.8, alpha: 0.45, wobble: 0.3, step: 9, fillAlpha: 0.4 },
    );
  } else {
    g.lineStyle(0.8, PIGMENT.mucFaint, 0.35);
    g.lineBetween(x, y + height, x + width, y + height);
  }
  const count = Math.max(8, Math.round(width / (height * 1.05)));
  const gap = (width - height * 0.7) / count;
  for (let index = 0; index < count; index += 1) {
    const done = index / count < progress;
    heron(g, x + height * 0.6 + index * gap, y + height * 0.5, height * 0.05, done, done ? flown : waiting);
  }
}

/** A cleared plate of paper for text to sit on. Type never sits on hatching. */
export function clearPlate(g: G, x: number, y: number, width: number, height: number, seed: number): void {
  const points: Pt[] = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  g.fillStyle(PIGMENT.diepHi, 0.88);
  g.fillPoints(points, true);
  inkPath(g, points, seed, { width: 0.9, alpha: 0.4, wobble: 0.5, step: 12, closed: true });
}
