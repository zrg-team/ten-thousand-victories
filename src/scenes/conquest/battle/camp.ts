/**
 * The other army's camp on the Dragon Ascent battle screen — tents, palisade, watchtower and the
 * đại kỳ over its gate. One caller: `buildBattleField` plants it once per field build, set back
 * behind their line and scaled by depth like everything else standing on that ground.
 *
 * The two functions live together because they share a unit, and it is not the one the rest of the
 * HUD is written in: every coordinate here is **metres of real camp**, taken to pixels by `PX_PER_M`
 * and the caller's scale, and `battleStandard` inherits that metre from the camp it is drawn into.
 * Read `proportion.ts` before touching a number — tuning these by eye is how a tent once came out
 * twice a tent's height, standing taller than the buffalo across the field was long.
 */
import Phaser from 'phaser';
import { inkPath, printedShape } from '../../../ui/ink/stroke';
import { PX_PER_M } from '../../../ui/ink/proportion';
import { PIGMENT } from '../../../ui/ink/palette';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * A quân doanh — a field camp, drawn in metres.
 *
 * Every coordinate below is **metres of real camp**, multiplied by `PX_PER_M` and the caller's
 * scale on the way out. That is not decoration: it is the only way this thing can be the right
 * size beside the men, and it was not. Drawn in raw design units and tuned by eye, its tents came
 * out about twice the height a tent is — so a tent stood taller than the buffalo in the next
 * field was long, and the whole camp read as a row of houses that had wandered onto the
 * battlefield. `proportion.ts` records that exact fault happening three times before, always for
 * the same reason: a shape drawn to look right on its own, against nothing.
 *
 * The real dimensions, which are what the numbers below say: a command pavilion 3.8 m at the
 * ridge and seven across, two soldiers' tents at 3.1 and 2.9 m, a palisade of 2 m stakes, a camp
 * gate at 2.8 m, a chòi canh whose platform is 4.6 m up and whose roof reaches 6.6 m, and the
 * đại kỳ on a 6.4 m pole.
 *
 * The first pass had them at 2.4 m and four across, which is a modern hike tent, and beside a
 * five-metre village roof across the field the camp read as a scatter of triangles rather than
 * as the other army's home. A trướng is a pavilion an officer stands up in and holds a council
 * under; the numbers now say that, and the camp reads at about two thirds of the village, which
 * is what the two things actually are.
 */
export function battleCamp(self: ConquestUIScene, x: number, y: number, color: number, seed = 7, s = 1, withStandard = true): Phaser.GameObjects.Container {
  const camp = self.add.container(x, y);
  const g = self.add.graphics();
  // One metre, in pixels, at this scale. Every number below is metres.
  const m = PX_PER_M * s;
  const ink = { colour: PIGMENT.muc, wobble: 0.1 * m, step: 4 };
  // The same three-quarter view every building in the game is drawn in.
  const OB = { x: 0.62, y: -0.42 };

  // The ground it all stands on. Without this the camp floats, which is half of why it read as
  // furniture rather than as a place.
  g.fillStyle(PIGMENT.muc, 0.07);
  g.fillEllipse(0.5 * m, 1.2 * m, 23 * m, 3.6 * m);

  // ── the tents ──────────────────────────────────────────────────────────
  //
  // A ridge tent in oblique: a lit near slope, a shaded far slope, a dark mouth where the flap is
  // tied back, and a ridgepole poking out past the cloth at both ends. Drawn back to front so the
  // near ones print over the far ones — a container does not depth-sort its children.
  const tents = [
    { tx: -6.6, ty: -1.4, w: 2.4, h: 3.1, d: 2.1, seed: seed + 3 },
    { tx: 5.4, ty: -0.9, w: 2.2, h: 2.9, d: 2, seed: seed + 11 },
    // The trướng: the command pavilion, and the reason a camp reads as a headquarters.
    { tx: -0.8, ty: 0.2, w: 3.5, h: 3.8, d: 2.6, seed: seed + 19 },
  ];
  for (const tent of [...tents].sort((a, b) => a.ty - b.ty)) {
    const foot = (tent.ty + 0.5) * m;
    const cx = tent.tx * m;
    const w = tent.w * m;
    const dx = tent.d * m * OB.x;
    const dy = tent.d * m * OB.y;
    const ridgeY = foot - tent.h * m;

    g.fillStyle(PIGMENT.muc, 0.1);
    g.fillEllipse(cx + dx * 0.4, foot + 0.2 * m, w * 2.6, w * 0.7);

    // The far slope, in the shade.
    printedShape(
      g,
      [
        { x: cx + w, y: foot },
        { x: cx + w + dx, y: foot + dy },
        { x: cx + dx, y: ridgeY + dy },
        { x: cx, y: ridgeY },
      ],
      PIGMENT.hoe, tent.seed + 1, { ...ink, width: 0.22 * m, alpha: 0.82, fillAlpha: 0.95 },
    );
    // The near gable, lit — the face the eye reads the tent off.
    printedShape(
      g,
      [{ x: cx - w, y: foot }, { x: cx, y: ridgeY }, { x: cx + w, y: foot }],
      PIGMENT.hoePale, tent.seed + 2, { ...ink, width: 0.25 * m, alpha: 0.9, fillAlpha: 1 },
    );
    // The mouth: a flap tied back on one side, which is what tells you it is a tent and not a
    // wedge of paper.
    printedShape(
      g,
      [
        { x: cx - w * 0.34, y: foot },
        { x: cx - w * 0.05, y: ridgeY + tent.h * m * 0.34 },
        { x: cx + w * 0.3, y: foot },
      ],
      PIGMENT.nauDark, tent.seed + 3, { ...ink, width: 0.16 * m, alpha: 0.5, fillAlpha: 0.72 },
    );
    // The ridgepole, out past the cloth at both ends, and a guy line to a peg.
    inkPath(g, [{ x: cx - 0.25 * m, y: ridgeY + 0.1 * m }, { x: cx + dx + 0.3 * m, y: ridgeY + dy }],
      tent.seed + 4, { ...ink, width: 0.18 * m, alpha: 0.62 });
    inkPath(g, [{ x: cx, y: ridgeY }, { x: cx - w * 1.45, y: foot + 0.15 * m }],
      tent.seed + 5, { ...ink, width: 0.1 * m, alpha: 0.4, wobble: 0.05 * m });
  }

  // ── the fire ───────────────────────────────────────────────────────────
  // A camp is people. One fire and a curl of smoke says so with four strokes.
  const fx = 8.2 * m;
  const fy = 0.4 * m;
  printedShape(
    g,
    [{ x: fx - 0.5 * m, y: fy }, { x: fx, y: fy - 0.85 * m }, { x: fx + 0.5 * m, y: fy }],
    PIGMENT.son, seed + 27, { ...ink, width: 0.14 * m, alpha: 0.55, fillAlpha: 0.8 },
  );
  inkPath(g, [{ x: fx - 0.8 * m, y: fy + 0.08 * m }, { x: fx + 0.8 * m, y: fy - 0.12 * m }], seed + 28,
    { ...ink, width: 0.16 * m, alpha: 0.7 });
  inkPath(
    g,
    [{ x: fx, y: fy - 1.1 * m }, { x: fx - 0.4 * m, y: fy - 2 * m },
      { x: fx + 0.3 * m, y: fy - 2.9 * m }, { x: fx - 0.2 * m, y: fy - 3.8 * m }],
    seed + 29, { ...ink, colour: PIGMENT.mucFaint, width: 0.2 * m, alpha: 0.3, wobble: 0.16 * m },
  );

  // ── the stand of spears ────────────────────────────────────────────────
  // Giá vũ khí: shafts leaned into a cone, which is how an army at rest stacks them.
  const sx = -10 * m;
  for (const lean of [-1, -0.35, 0.35, 1]) {
    inkPath(g, [{ x: sx + lean * 0.6 * m, y: 0.5 * m }, { x: sx + lean * 0.18 * m, y: -2.4 * m }],
      seed + 31 + lean * 10, { ...ink, width: 0.12 * m, alpha: 0.62, wobble: 0.06 * m });
  }

  // ── the palisade, its gate and a watchtower ────────────────────────────
  // In front of the tents, because that is where a fence is — and short, standing on the same
  // ground line as everything else.
  const fenceY = 1.1 * m;
  const stakeH = 2 * m;
  for (let i = -5; i <= 5; i += 1) {
    if (i === 0) continue; // the gateway
    const px = i * 1.9 * m;
    inkPath(g, [{ x: px, y: fenceY }, { x: px + 0.1 * m, y: fenceY - stakeH }], seed + 40 + i,
      { ...ink, width: 0.2 * m, alpha: 0.66, wobble: 0.06 * m });
  }
  // Two rails tying the stakes together — one fence, not a row of sticks.
  for (const t of [0.35, 0.72]) {
    inkPath(g, [{ x: -10 * m, y: fenceY - stakeH * t }, { x: 10 * m, y: fenceY - stakeH * t + 0.1 * m }],
      seed + 47 + t * 10, { ...ink, width: 0.11 * m, alpha: 0.4, step: 6 });
  }
  // The gate: two posts and a lintel.
  for (const gx of [-1.3 * m, 1.3 * m]) {
    inkPath(g, [{ x: gx, y: fenceY + 0.2 * m }, { x: gx, y: fenceY - 2.8 * m }],
      seed + 51 + gx, { ...ink, width: 0.22 * m, alpha: 0.78, wobble: 0.05 * m });
  }
  inkPath(g, [{ x: -1.6 * m, y: fenceY - 2.7 * m }, { x: 1.6 * m, y: fenceY - 2.85 * m }],
    seed + 59, { ...ink, width: 0.2 * m, alpha: 0.72, wobble: 0.06 * m });

  // Chòi canh: a platform 4.6 m up on four legs, with a thatched cap over it.
  const towerX = -9.4 * m;
  for (const lx of [-0.85 * m, 0.85 * m]) {
    inkPath(g, [{ x: towerX + lx, y: fenceY }, { x: towerX + lx * 0.55, y: fenceY - 4.6 * m }],
      seed + 61 + lx, { ...ink, width: 0.17 * m, alpha: 0.66, wobble: 0.05 * m });
  }
  inkPath(g, [{ x: towerX - 0.8 * m, y: fenceY - 2.5 * m }, { x: towerX + 0.8 * m, y: fenceY - 2.5 * m }],
    seed + 63, { ...ink, width: 0.11 * m, alpha: 0.4 });
  printedShape(
    g,
    [{ x: towerX - 1.1 * m, y: fenceY - 4.6 * m }, { x: towerX + 1.1 * m, y: fenceY - 4.6 * m },
      { x: towerX + 0.9 * m, y: fenceY - 5.3 * m }, { x: towerX - 0.9 * m, y: fenceY - 5.3 * m }],
    PIGMENT.diepLo, seed + 65, { ...ink, width: 0.16 * m, alpha: 0.66, fillAlpha: 0.95 },
  );
  printedShape(
    g,
    [{ x: towerX - 1.5 * m, y: fenceY - 5.3 * m }, { x: towerX + 1.5 * m, y: fenceY - 5.3 * m },
      { x: towerX, y: fenceY - 6.6 * m }],
    PIGMENT.nau, seed + 67, { ...ink, width: 0.17 * m, alpha: 0.7, fillAlpha: 0.92 },
  );

  // ── the đại kỳ over the gate ───────────────────────────────────────────
  if (withStandard) battleStandard(g, 0, fenceY - 2.8 * m, color, seed + 71, m);

  camp.add(g);
  return camp;
}

/**
 * The đại kỳ: the great standard an army plants over its own gate.
 *
 * A yellow ground saw-toothed on three sides with a device in the middle, which is what the
 * record describes — but the old one drew the teeth as a rounded scallop and put a plain filled
 * circle at the centre, so at any real size it read as a gold blob with a dot on it. The teeth
 * are cut square now, the cloth carries a border inside its own edge, the device is a ring rather
 * than a disc, and the pole is a pole: a shaft, a finial, and a tassel where the cloth is lashed
 * to it.
 *
 * `m` is one metre in pixels, like the camp it stands in: a 6.4 m pole with three and a half
 * metres of cloth on it.
 */
function battleStandard(
  g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, seed: number, m: number,
): void {
  const ink = { colour: PIGMENT.muc, wobble: 0.08 * m, step: 5 };
  const topY = y - 4.4 * m;
  const botY = y - 2.6 * m;
  const fly = 3.2 * m;
  const tooth = 0.34 * m;

  // The shaft, and the finial on top of it.
  inkPath(g, [{ x, y: y + 0.6 * m }, { x, y: topY - 0.5 * m }], seed,
    { ...ink, width: 0.28 * m, alpha: 0.85, step: 7 });
  printedShape(
    g,
    [{ x: x - 0.28 * m, y: topY - 0.5 * m }, { x, y: topY - 1.1 * m }, { x: x + 0.28 * m, y: topY - 0.5 * m }],
    PIGMENT.hoe, seed + 1, { ...ink, width: 0.13 * m, alpha: 0.7, fillAlpha: 0.95 },
  );

  // The cloth, cut square along the top, the fly and the bottom.
  const teeth: Array<{ x: number; y: number }> = [{ x: x + 0.16 * m, y: topY }];
  const steps = 5;
  for (let i = 0; i < steps; i += 1) {
    const a = x + 0.16 * m + fly * (i / steps);
    const b = x + 0.16 * m + fly * ((i + 0.5) / steps);
    teeth.push({ x: a, y: topY - tooth }, { x: b, y: topY - tooth }, { x: b, y: topY });
  }
  teeth.push({ x: x + 0.16 * m + fly, y: topY });
  teeth.push({ x: x + 0.16 * m + fly + tooth, y: (topY + botY) / 2 });
  teeth.push({ x: x + 0.16 * m + fly, y: botY });
  for (let i = steps; i > 0; i -= 1) {
    const a = x + 0.16 * m + fly * (i / steps);
    const b = x + 0.16 * m + fly * ((i - 0.5) / steps);
    teeth.push({ x: a, y: botY + tooth }, { x: b, y: botY + tooth }, { x: b, y: botY });
  }
  printedShape(g, teeth, PIGMENT.hoe, seed + 2, { ...ink, width: 0.17 * m, alpha: 0.75, fillAlpha: 0.95 });

  // A border inside the edge, so the cloth has a hem instead of being a shape.
  inkPath(
    g,
    [{ x: x + 0.5 * m, y: topY + 0.35 * m }, { x: x + fly - 0.2 * m, y: topY + 0.35 * m },
      { x: x + fly - 0.2 * m, y: botY - 0.35 * m }, { x: x + 0.5 * m, y: botY - 0.35 * m },
      { x: x + 0.5 * m, y: topY + 0.35 * m }],
    seed + 3, { ...ink, colour: PIGMENT.nauDark, width: 0.11 * m, alpha: 0.4, step: 7 },
  );

  // The device, in the side's own colour — a ring, not a dot. The realm's colour rides on the
  // device rather than on the cloth, so sỏi son stays spent on the player alone.
  const cx = x + 0.16 * m + fly * 0.45;
  const cy = (topY + botY) / 2;
  g.lineStyle(0.28 * m, color, 0.9);
  g.strokeCircle(cx, cy, 0.5 * m);
  g.fillStyle(color, 0.9);
  g.fillCircle(cx, cy, 0.18 * m);

  // The lashing, and a tassel hanging off it.
  inkPath(g, [{ x: x - 0.2 * m, y: topY + 0.18 * m }, { x: x + 0.36 * m, y: topY + 0.18 * m }], seed + 4,
    { ...ink, width: 0.16 * m, alpha: 0.6 });
  inkPath(g, [{ x: x - 0.08 * m, y: topY + 0.25 * m }, { x: x - 0.32 * m, y: topY + 1 * m }], seed + 5,
    { ...ink, colour: PIGMENT.son, width: 0.16 * m, alpha: 0.55, wobble: 0.16 * m });
}
