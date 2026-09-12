/**
 * The five shapes, the ring they answer each other in, and the blocks they stand on.
 *
 * This module is deliberately **Phaser-free** and lives in `data/` rather than `ui/ink/`, because
 * both sides of the game need it and only one of them may import a renderer:
 *
 *   - `ui/ink/devices.ts` draws the four blocks and needs the doctrine weights;
 *   - `systems/ascent/BattleSystem.ts` resolves the fight and needs the ring — and `src/systems/`
 *     must never import Phaser, or every headless harness in the repo stops booting.
 *
 * Duplicating the table in both places would have worked until the first time somebody changed one
 * of them, so the table lives here once and `devices.ts` imports it back.
 *
 * See `docs/phase-1/14-five-shapes-two-dials.md` for the ring, `docs/phase-1/19-five-shapes-one-clock.md` for
 * the wind clock that retiered it, and `formationsClassic.ts` for the retired availability rules.
 */
import type { ArmyComposition } from '../../state/types';

// ─────────────────────────────────────────────────────────────────────────────
// The blocks
// ─────────────────────────────────────────────────────────────────────────────

/** How many men one drawn mark stands for. */
export const MEN_PER_MARK = 55;

/** Most marks a single host will ever be drawn with, however large it gets. */
export const HOST_MARK_CAP = 420;

export type FormationKey = 'screen' | 'line' | 'bows' | 'horse';

/** The order blocks are listed in — and, because `pri` follows it, the order they die in. */
export const FORMATION_ORDER: FormationKey[] = ['screen', 'line', 'bows', 'horse'];

/**
 * Each doctrine is the same army spent differently: `weight` is its share of the host's marks and
 * `aspect` is how wide the block stands against how deep.
 *
 * The numbers are the ones drawn in `docs/phase-1/12-armies-of-dai-viet.md`, which plates a 44-mark host
 * — so at 44 marks this table reproduces that page file for file.
 *
 * The zeroes are the doctrine's silhouette. They used to be load-bearing twice over — which
 * shapes a host could never form — until the availability rule was retired for the wind clock
 * (docs/phase-1/18-formation-availability-by-blocks.md, docs/phase-1/19-five-shapes-one-clock.md): every host has all five shapes now, and a `spears` army standing in Thế
 * Xung simply draws a wedge whose point block has no marks in it. The picture, not the dock,
 * carries what an army is.
 */
export const DOCTRINE: Record<ArmyComposition, Record<FormationKey, { weight: number; aspect: number }>> = {
  balanced: {
    screen: { weight: 5, aspect: 5 }, line: { weight: 21, aspect: 7 / 3 },
    bows: { weight: 12, aspect: 3 }, horse: { weight: 6, aspect: 1.5 },
  },
  // Everything in the line: nine files and four ranks deep, a token screen, almost no shot and not
  // one horse. A host that has decided to be an obstacle.
  spears: {
    screen: { weight: 3, aspect: 3 }, line: { weight: 36, aspect: 2.25 },
    bows: { weight: 8, aspect: 2 }, horse: { weight: 0, aspect: 1.5 },
  },
  // The main body is at the back, behind a crust two ranks deep whose whole job is to keep anything
  // off it. The weakness is visible without being written down.
  archers: {
    screen: { weight: 4, aspect: 4 }, line: { weight: 10, aspect: 2.5 },
    bows: { weight: 27, aspect: 3 }, horse: { weight: 0, aspect: 1.5 },
  },
  // No screen at all and a real wing: it gives up the exchange before contact entirely in order to
  // win the exchange at contact. The bare ground where every other doctrine has men is the tell.
  shock: {
    screen: { weight: 0, aspect: 4 }, line: { weight: 32, aspect: 2 },
    bows: { weight: 3, aspect: 3 }, horse: { weight: 10, aspect: 2.5 },
  },
  // A wing this size is paid for out of the block that has to hold the ground while it manoeuvres,
  // and the picture makes the trade legible.
  horse: {
    screen: { weight: 4, aspect: 4 }, line: { weight: 10, aspect: 2.5 },
    bows: { weight: 8, aspect: 2 }, horse: { weight: 18, aspect: 2 },
  },
};

/** What one block mustered, and what is left of it. */
export interface BlockShare {
  /** Marks the block deployed with — this is what sets its frontage, and it never shrinks. */
  full: number;
  /** Marks still on their feet. Zero means the block is gone. */
  standing: number;
}

/** How many marks a host of this many men is drawn with — the column's length scales off it. */
export function marksFor(men: number, cap = HOST_MARK_CAP): number {
  return Math.max(4, Math.min(cap, Math.round(men / MEN_PER_MARK)));
}

/**
 * How a host's marks are divided between its four blocks, and where its casualties have landed.
 *
 * The single source of truth for the picture. `armyShape` draws what this returns; the fight
 * stopped reading it when availability-by-blocks was retired (`formationsClassic.ts`, docs/phase-1/18-formation-availability-by-blocks.md).
 *
 * Casualties are spent **in formation order** — the screen first, then the line, then the bows, and
 * the horse last. That is the whole reason an army is several blocks: a mixed block loses a mark at
 * random and nothing is learned, where a formation loses its screen inside a few beats and the
 * picture has said the front has collapsed without a word of text.
 */
export function blockShares(
  composition: ArmyComposition, men: number, mustered?: number, markCap?: number,
): Record<FormationKey, BlockShare> {
  // `markCap` overrides the density ceiling for callers with less room than the map has. The
  // battle screen is the only one — see `BATTLE_HOST_MARK_CAP`, where 420 marks come out 208 px
  // wide on a 390 px field and two hosts cannot both be on the screen. Applied to `total` and
  // `standing` alike so the block still empties in formation order as men fall.
  const cap = markCap ?? HOST_MARK_CAP;
  const total = marksFor(Math.max(mustered ?? men, men), cap);
  const standing = marksFor(men, cap);
  const plan = DOCTRINE[composition] ?? DOCTRINE.balanced;
  const weightSum = FORMATION_ORDER.reduce((sum, key) => sum + plan[key].weight, 0) || 1;

  // Hand out marks by share, then give the rounding remainder to the line — which is the block
  // that should absorb it, and the one block every doctrine has.
  const share: Record<FormationKey, number> = { screen: 0, line: 0, bows: 0, horse: 0 };
  let handed = 0;
  for (const key of FORMATION_ORDER) {
    const n = plan[key].weight === 0 ? 0 : Math.round((total * plan[key].weight) / weightSum);
    share[key] = n;
    handed += n;
  }
  share.line = Math.max(1, share.line + (total - handed));

  const full: Record<FormationKey, number> = { ...share };

  // Casualties come out of the front of the formation, in order.
  let losses = Math.max(0, total - standing);
  for (const key of FORMATION_ORDER) {
    if (losses <= 0) break;
    const spent = Math.min(share[key], losses);
    share[key] -= spent;
    losses -= spent;
  }

  return {
    screen: { full: full.screen, standing: share.screen },
    line: { full: full.line, standing: share.line },
    bows: { full: full.bows, standing: share.bows },
    horse: { full: full.horse, standing: share.horse },
  };
}

/**
 * Which doctrine a host deploys in, read off its real units when nobody has labelled it.
 *
 * Lives here rather than in `devices.ts` because the fight needs the answer too, and it must be the
 * same answer — a host drawn as an archer army that the resolver thinks is balanced would offer
 * Thế Nỏ on a dock while denying it in the exchange.
 */
export function compositionOfUnits(
  units?: { spearmen: number; archers: number; heavyInfantry: number },
  explicit?: ArmyComposition,
): ArmyComposition {
  if (explicit) return explicit;
  if (!units) return 'balanced';
  const total = Math.max(1, units.spearmen + units.archers + units.heavyInfantry);
  if (units.archers / total >= 0.45) return 'archers';
  if (units.heavyInfantry / total >= 0.4) return 'shock';
  if (units.spearmen / total >= 0.7) return 'spears';
  return 'balanced';
}

// ─────────────────────────────────────────────────────────────────────────────
// The ring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The five shapes an army can stand in.
 *
 * Each is an arrangement of the four blocks above — nothing new is added to an army to give it a
 * formation, the same men simply stand differently.
 */
export type BattleFormation = 'chong' | 'xung' | 'tan' | 'quy' | 'no';

/**
 * The ring, in order. **Each shape beats the two clockwise from it and loses to the other two.**
 *
 * A five-cycle rather than a three-cycle because three options with two answers each cannot avoid
 * a dominant one for long, and because every edge here is defensible on its own terms:
 *
 *   chông → xung   a levelled hedge of stakes is what a horse will not run onto
 *   chông → tán    loose men cannot stop a hedge that simply keeps walking
 *   xung  → tán    scattered men in the open are what cavalry was made for
 *   xung  → quy    a wedge is a tool for splitting a packed block, and a turtle cannot step aside
 *   tán   → quy    a turtle catches nobody; it is bled from the flanks for as long as they have
 *                  anything left to throw
 *   tán   → nỏ     arrows loosed by the thousand into open order mostly find ground
 *   quy   → nỏ     shields up is the answer to arrows, and always was
 *   quy   → chông  locked shields turn the points aside and the denser side wins the shove
 *   nỏ    → chông  a hedge holds still, and holding still in front of massed crossbows is the
 *                  oldest mistake there is
 *   nỏ    → xung   the crossbow is the one thing in this country's memory that has stopped cavalry
 *
 * This order is also the order the chips are laid out on the dock, so the two shapes you beat are
 * always the two immediately to the right, wrapping. The rule is legible from the layout alone.
 */
export const FORMATION_RING: BattleFormation[] = ['chong', 'xung', 'tan', 'quy', 'no'];

/** How one shape re-states one block: where it stands, how wide, how loose. */
export interface FormationTweak {
  /** Toward the enemy, in file pitches. */
  dx?: number;
  /** Toward the viewer, in rank pitches. */
  dy?: number;
  /** Looser or tighter than the block normally stands. */
  pitch?: number;
  /** Frontage against depth. Higher is wider and shallower. */
  aspect?: number;
  /** Ranks of one, two, three — a point rather than a column. Only the wedge wants this. */
  wedge?: boolean;
}

/**
 * The five shapes, as an override of the one arrangement `devices.ts` otherwise always draws.
 *
 * A formation does not change who is in the host or how a man is drawn. It re-states, per block,
 * **how far forward it stands, how wide, and how loose** — which is exactly the three fields the
 * base table already carries. So this is that table with a fifth axis, and a shape the player
 * cannot see is a shape they cannot answer.
 *
 * Anything omitted keeps the base value, and a host with no plan at all draws exactly as it always
 * has. That default is load-bearing: `armyShape` has three callers and only one of them is in a
 * battle — the map marker and the History plate must never re-form, because an army crossing a
 * province is not standing in Thế Nỏ.
 *
 * The numbers are Doc 14's `PLAN` carried into this space, with one correction. Doc 14 drew its
 * frontages on a 780-wide chart: `front: 24` at a 16-unit pitch is 176 units of a host that has
 * about 205 to stand in before it is inside the enemy. On the real 390-wide surface the fronts come
 * down and each shape carries its character in **depth, looseness and which block is at the seam**
 * instead. See `docs/phase-1/14-five-shapes-two-dials.md`.
 */
export const FORMATION_PLAN: Record<BattleFormation, Partial<Record<FormationKey, FormationTweak>>> = {
  // The hedge: the line wide and shallow at the seam, everything else stacked behind it.
  chong: {
    line: { dx: 6.25, dy: 0, aspect: 5.5 },
    screen: { dx: 1.88, dy: -3.0 },
    bows: { dx: -3.13, dy: 3.0, aspect: 3 },
    horse: { dx: -6.56, dy: 7.17 },
  },
  // The wedge: the horse at the point, in ranks of one, two, three, and the foot behind it.
  // The point stands nine files out, not seven: at seven it read as the line's own right edge on
  // a phone, and the hardest setting has nothing but this silhouette to say "charge".
  xung: {
    horse: { dx: 9.0, dy: -0.83, wedge: true },
    line: { dx: 1.88, dy: 2.0, aspect: 2.33 },
    screen: { dx: -1.88, dy: -2.83 },
    bows: { dx: -5.94, dy: 3.33, aspect: 3 },
  },
  // The skirmish: the screen thrown forward and deliberately loose, the body massed behind.
  // The screen likewise: further out and looser, so the gap between it and the body is the shape.
  tan: {
    screen: { dx: 8.25, dy: -1.5, pitch: 2.6 },
    line: { dx: 0.63, dy: 1.67, aspect: 2.33 },
    bows: { dx: -3.75, dy: 4.33, aspect: 3 },
    horse: { dx: -6.88, dy: 8.0 },
  },
  // The tortoise: packed tight and deep. The smallest footprint of the five, and it should read so.
  quy: {
    line: { dx: 5.31, dy: 0, pitch: 0.81, aspect: 1 },
    bows: { dx: 1.38, dy: 3.83, pitch: 0.88, aspect: 1.33 },
    screen: { dx: -0.88, dy: -2.83, pitch: 0.88 },
    horse: { dx: -5.0, dy: 7.67 },
  },
  // The volley: one thin rank across the whole front, the bows banked deep behind it, and the
  // screen and horse pushed out onto the wings where they are not in the way of the shooting.
  no: {
    line: { dx: 5.94, dy: 0, pitch: 0.72, aspect: 12 },
    bows: { dx: 2.19, dy: 3.67, pitch: 1.31, aspect: 1.33 },
    screen: { dx: 0.31, dy: -4.33 },
    horse: { dx: -0.31, dy: 8.33 },
  },
};

/**
 * **Hành quân — the host on the road.**
 *
 * Not a battle shape and deliberately not a member of `BattleFormation`: nothing resolves a fight
 * against it, it has no place on the counter ring, and adding a sixth member there would change
 * every matchup in the mode. It is a *drawing*, used only by the map marker while a host is
 * between provinces — and every host between provinces uses it, whichever way it is walking.
 *
 * A host at rest stands in its doctrine's arrangement — a line, a screen thrown forward, the bows
 * banked behind, the horse off the flank — which is a wide, loose thing that reads as men holding
 * ground. A host on the march is the opposite: **narrow at the front, long from front to back, and
 * closed up**, because that is the only way a few thousand men get down one road.
 *
 * **This is computed from the blocks, not tabulated.** The two previous attempts were a table of
 * fixed offsets — `dy` steps of four rank pitches — and a table cannot know how deep the block it
 * is stepping past actually is. Measured on a 900-man host (`shot-column.mjs`), four blocks two
 * marks wide and three deep were filed 5.7 rank pitches apart: each block was 2 rank pitches deep,
 * so **two thirds of the column was bare road**. On the map that is not a column, it is four small
 * groups walking in single file with gaps between them, and it is why the plan was switched off by
 * default rather than fixed. `marchColumn` sizes each block first and then files them nose to tail
 * with one marching interval between, so the column closes up at any host size and any heading.
 */

/**
 * **Men abreast on the road — set by the road, not by the size of the army.**
 *
 * This was `√marks × 0.75`, which is how you size a *block*: a 900-man host came out three abreast
 * and three deep per block, and the player's verdict on it was that they still could not see the
 * host moving as a line — "only 5 to 10 people in columns". They were right, and the arithmetic
 * says so: at `MEN_PER_MARK` a 900-man host is drawn with sixteen marks in all, so three abreast
 * spends them on five ranks. A road is a fixed width; a bigger army does not widen it, it makes a
 * longer file. Two abreast turns those same sixteen marks into eight ranks strung down the road,
 * which is the thing being asked for.
 */
const MARCH_FRONTAGE_MIN = 2;
/** However long the host, it never files wider than a road. */
const MARCH_FRONTAGE_MAX = 12;
/**
 * The longest a column runs, in ranks — the only thing that ever widens the front.
 *
 * Two abreast at the mark cap would be 210 ranks — at the spacing below, most of the map in one
 * column. Past this the file doubles, trebles and so on rather than the tail growing: a 23,000-man
 * host marches twelve abreast because that is what it takes to fit on a road, not because it is
 * large. Measured on the map at this value, east then north: a 900-man host files two abreast and
 * eight deep (47 × 20, 17 × 62), a 2,600-man host three abreast and sixteen deep (98 × 21,
 * 22 × 128), and the mark cap twelve abreast and thirty-one deep (191 × 54, 60 × 250).
 */
const MARCH_MAX_RANKS = 18;
/**
 * The gap between one block and the next, in along-road pitches.
 *
 * A marching interval — the length of the pause between one sub-unit and the one behind it, not a
 * field. It has to stay under one figure's width or the four blocks read as four groups again.
 */
const MARCH_INTERVAL = 1.0;
/**
 * **How far apart the men stand along the road, and across it — as multiples of a standing host's
 * own file pitch.**
 *
 * These are the numbers that decide whether a column reads as marching men or as a caterpillar. A
 * block is laid out `cols` across screen-x by `rows` down screen-y, so *which* of the two is the
 * road changes with the heading — and the first pass closed **both** of them up, on the reasoning
 * that a column is tight. Measured: that put the along-road spacing at 3.08 against a figure drawn
 * 3.86 wide, so every man stood inside the man in front and a file of sixteen could be counted as
 * five. "Only 5 to 10 people in columns" is exactly what that looks like.
 *
 * A marching column is tight **across** and open **along**: shoulder to shoulder in a rank, a
 * stride between one rank and the next.
 *
 * There are four numbers and not two because a figure is **3.86 wide and 8.15 tall** at map scale
 * (`verify-map-host`), so the same distance reads as a gap across the sheet and as an overlap up
 * it. A column marching east needs 0.92 of a pitch between ranks to clear a man's width; the same
 * column marching north needs 1.25 to clear his height, and at 0.92 it came out a solid vertical
 * stack — a mass, not a file.
 */
const MARCH_ALONG_X = 0.92;
const MARCH_ALONG_Y = 1.25;
const MARCH_ACROSS_X = 0.62;
const MARCH_ACROSS_Y = 0.58;
/** The horse keeps its own room even in column — a rider is wider and longer than a man. */
const MARCH_ROOM_HORSE = 1.45;
/**
 * How much of the standing rank shear a column keeps.
 *
 * The shear leans each rank a fifth of a pitch to the right of the one in front, which reads as men
 * standing in a loose block and as a *drifting* file on a road running up the sheet — the column
 * arrived a whole host's width to the right of where it set off.
 */
const MARCH_SHEAR = 0.3;

/** The order the blocks take on the road: the screen out ahead, the horse bringing up the rear. */
export const MARCH_ORDER: FormationKey[] = ['screen', 'line', 'bows', 'horse'];

/** How a host is laid out while it is on the road — see `marchColumn`. */
export interface MarchColumn {
  /** The road's own angle, in radians. */
  heading: number;
  /** Blocks front to back along it. */
  order: FormationKey[];
  /** Frontage against depth per block, already turned to the road's angle. */
  aspect: Record<FormationKey, number>;
  /** How much room that block's men need, against a foot soldier's. */
  room: Record<FormationKey, number>;
  /**
   * Spacing along the road and across it, as multiples of the host's standing file pitch — one
   * pair for the sheet's x axis and one for its y, because a figure is far taller than it is wide.
   */
  alongX: number;
  alongY: number;
  acrossX: number;
  acrossY: number;
  /** The gap between one block and the next, in along-road pitches. */
  interval: number;
  /** How much of the standing rank shear the column keeps. */
  shear: number;
  /** Men abreast — reported so a harness can check the column is a column. */
  frontage: number;
}

/**
 * The column a host of these blocks forms on a road running at `radians`.
 *
 * Only the *shape* of each block is settled here — where it stands is `armyShape`'s, because that
 * is the only place that knows the block's real pitch in world units and can therefore file one
 * block behind another rather than at a guessed offset.
 *
 * **The aspect has to follow the heading.** A block is built `cols` across by `rows` deep in screen
 * axes, so a block deeper than it is wide reads as a column only while the road runs up and down
 * the sheet; on an east-west road the same block is a bar standing across its own line of march.
 *
 * This used to blend the two aspects on `cos(2θ)` — which is a seamless curve, and which put a
 * **square block on all four diagonals**, exactly half of the eight headings the map quantises to.
 * Reported: *there are no direction awareness*, and the report was right about the half of the
 * cases it saw. A 2,600-man host measured 105 × 25 due east and 29 × 127 due south — both plainly
 * lines — and 84 × 73 to the south-east, which is a host standing still.
 *
 * So the aspect is no longer blended. The block is laid out on whichever axis the road is *more*
 * nearly running along, and `armyShape` then **leans** the file over to the true heading with the
 * block's shear: a rank steps sideways as well as back, and forty-five degrees is a full step of
 * each. That gives a line at every heading rather than at four of them, and the two layouts meet
 * at the diagonal drawing the same 45° file, so there is still no seam to see.
 */
export function marchColumn(
  shares: Record<FormationKey, BlockShare>,
  radians: number,
): MarchColumn {
  const total = MARCH_ORDER.reduce((sum, key) => sum + Math.max(0, shares[key].full), 0);
  const frontage = Math.min(
    MARCH_FRONTAGE_MAX,
    Math.max(MARCH_FRONTAGE_MIN, Math.ceil(Math.max(1, total) / MARCH_MAX_RANKS)),
  );
  // Which axis the road is more nearly running along: 1 for up-and-down the sheet, 0 for across
  // it. Not a blend — see above. The diagonals go with the upright layout, which `armyShape` then
  // leans a full step per rank, and the two readings agree there because a 45° file is a 45° file
  // whichever way it was built.
  const along = Math.abs(Math.sin(radians)) >= Math.abs(Math.cos(radians)) ? 1 : 0;
  const aspect = {} as Record<FormationKey, number>;
  const room = {} as Record<FormationKey, number>;
  for (const key of MARCH_ORDER) {
    const full = Math.max(1, shares[key].full);
    // Never wider than the block has men for: a two-mark screen is two abreast, not six.
    const files = Math.max(1, Math.min(frontage, full));
    const depth = Math.max(1, Math.ceil(full / files));
    // `armyShape` derives rows from `√(full / aspect)`, so these are the two aspects that make it
    // land exactly on `depth` (road running up the sheet) and on `files` (road running across it).
    aspect[key] = Math.pow(full / (depth * depth), along) * Math.pow(full / (files * files), 1 - along);
    room[key] = key === 'horse' ? MARCH_ROOM_HORSE : 1;
  }
  return {
    heading: radians,
    order: MARCH_ORDER,
    aspect,
    room,
    alongX: MARCH_ALONG_X,
    alongY: MARCH_ALONG_Y,
    acrossX: MARCH_ACROSS_X,
    acrossY: MARCH_ACROSS_Y,
    shear: MARCH_SHEAR,
    interval: MARCH_INTERVAL,
    frontage,
  };
}

function ringIndex(formation: BattleFormation): number {
  return FORMATION_RING.indexOf(formation);
}

/** Does `a` answer `b`? True when `b` is one or two steps clockwise of `a`. */
export function formationBeats(a: BattleFormation, b: BattleFormation): boolean {
  const step = (ringIndex(b) - ringIndex(a) + FORMATION_RING.length) % FORMATION_RING.length;
  return step === 1 || step === 2;
}

/**
 * Which way the exchange leans, before any tempo is applied.
 *
 * Positive is ours: we deal more and take less. Deliberately a plain sign rather than a magnitude
 * — the *size* of the swing is a tuning constant in `ascentConfig`, so it can be moved in one
 * place after the first ten real fights without touching the geometry.
 */
export function formationTiltSign(ours: BattleFormation, theirs: BattleFormation): number {
  if (ours === theirs) return 0;
  if (formationBeats(ours, theirs)) return 1;
  if (formationBeats(theirs, ours)) return -1;
  return 0;
}

/**
 * How hard one shape answers another, as a signed tier: the ring with its distances kept.
 *
 * `formationBeats` says every shape beats the two that follow it. This says the *near* one of the
 * two is the real answer: one step clockwise is a **strong** counter (±2, full tilt), two steps a
 * **soft** counter (±1, half tilt via `BATTLE_FORMATION_TILT_BLUNT`), the mirror is 0. Encoded so
 * that magnitude is strength — `tilt = (tier / 2) × size` — and `tier(a, b) === -tier(b, a)` by
 * construction.
 *
 * This gradient is what makes a wind clock bite at all: with both answers equal, denying a player
 * one of them meant they shrugged and took the other, and the second-best shape was never learned.
 */
export function formationTier(ours: BattleFormation, theirs: BattleFormation): number {
  const step = (ringIndex(theirs) - ringIndex(ours) + FORMATION_RING.length) % FORMATION_RING.length;
  if (step === 1) return 2;
  if (step === 2) return 1;
  if (step === 3) return -1;
  if (step === 4) return -2;
  return 0;
}

