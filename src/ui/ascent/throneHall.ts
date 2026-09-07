/**
 * The throne hall, empty, on the morning a new king takes it.
 *
 * The authored Đông Hồ print is used on the opening-choice screen (`showMandate`), with live
 * player standards layered above it. The procedural hall below remains an offline fallback.
 * Its original reference is a Nguyễn
 * court painting — the tiered tile roof with its carp-and-pearl ridge, the colonnade, the flight
 * of steps down into a paved courtyard, the pair of bronze đỉnh at the foot of them, banners at
 * either side. Everything in that picture is here **except the people**: the court has not been
 * summoned yet, which is the whole point of the screen. The only thing on the dais is the seat,
 * with the player's own standard at each side.
 *
 * This is a UI diorama at a fixed pixel size, not a map prop — it never enters the scatter, the
 * bake or `proportion.ts`, so it takes no `unitScale` key. Its scale comes from the box it is
 * asked to fill.
 */
import Phaser from 'phaser';
import { PIGMENT } from '../ink/palette';
import { inkPath, printedShape, type Pt } from '../ink/stroke';
import { createPlayerLandFlag } from '../playerFlag';

type G = Phaser.GameObjects.Graphics;

/** Height the diorama draws at, for the width it is given. Fixed: the composition is not fluid. */
export const THRONE_HALL_HEIGHT = 186;
export const THRONE_HALL_TEXTURE = 'throne-hall-dongho-v1';

export function preloadThroneHall(scene: Phaser.Scene, base: string): void {
  if (!scene.textures.exists(THRONE_HALL_TEXTURE)) {
    scene.load.image(THRONE_HALL_TEXTURE, `${base}art/ascent/throne-hall-dongho-v1.webp`);
  }
}

function addStandards(scene: Phaser.Scene, view: Phaser.GameObjects.Container, width: number, seed: number): void {
  for (const side of [-1, 1]) {
    const flag = createPlayerLandFlag(scene, true, seed);
    flag.setScale(1.3).setPosition(width / 2 + side * (width / 2 - 26), THRONE_HALL_HEIGHT - 10);
    view.add(flag);
  }
}

export function throneHallDiorama(scene: Phaser.Scene, width: number, seed: number): Phaser.GameObjects.Container {
  if (!scene.textures.exists(THRONE_HALL_TEXTURE)) return proceduralThroneHall(scene, width, seed);
  const view = scene.add.container(0, 0);
  const print = scene.add.image(width / 2, THRONE_HALL_HEIGHT / 2, THRONE_HALL_TEXTURE);
  // Fit the complete print; never crop the roof tips, clouds or courtyard on compact screens.
  print.setScale(Math.min(width / print.width, THRONE_HALL_HEIGHT / print.height));
  print.setData('throneHallPrint', true);
  view.add(print);
  addStandards(scene, view, width, seed);
  return view;
}

/**
 * A tiled roof in elevation: the eave line curves *up* at the corners, never down.
 *
 * A straight-bottomed trapezoid reads as a shed. The lift at the corners (`RISE`) plus the đầu đao
 * spur past them is the whole silhouette of the thing — at this size it is doing more work than
 * every tile course put together.
 */
function tiledRoof(
  g: G,
  cx: number,
  ridgeY: number,
  eaveY: number,
  ridgeHalf: number,
  eaveHalf: number,
  seed: number,
): void {
  const RISE = 9;
  const eaveAt = (t: number): Pt => ({ x: cx + t * eaveHalf, y: eaveY - RISE * t * t });

  const bottom: Pt[] = [];
  for (let step = 8; step >= -8; step -= 1) bottom.push(eaveAt(step / 8));

  printedShape(
    g,
    [{ x: cx - ridgeHalf, y: ridgeY }, { x: cx + ridgeHalf, y: ridgeY }, ...bottom],
    PIGMENT.mucSoft,
    seed,
    { width: 1.1, alpha: 0.78, wobble: 0.3, step: 9, fillAlpha: 0.88 },
  );

  // Tile courses run down the slope. Seven of them: fewer reads as a blank plane, more turns
  // the roof into a grey wash at 344 wide.
  for (let course = 1; course < 7; course += 1) {
    const t = (course / 7) * 2 - 1;
    const foot = eaveAt(t);
    inkPath(g, [{ x: cx + t * ridgeHalf, y: ridgeY + 1 }, foot], seed + 20 + course, {
      width: 0.5, alpha: 0.24, wobble: 0.25, step: 9,
    });
  }

  // The ridge, and the two corner spurs that lift off the eave ends.
  inkPath(g, [{ x: cx - ridgeHalf, y: ridgeY }, { x: cx + ridgeHalf, y: ridgeY }], seed + 40, {
    width: 1.8, alpha: 0.82, wobble: 0.2, step: 10,
  });
  for (const side of [-1, 1]) {
    const corner = eaveAt(side);
    inkPath(
      g,
      [corner, { x: corner.x + side * 6, y: corner.y - 4 }, { x: corner.x + side * 8, y: corner.y - 11 }],
      seed + 50 + side,
      { width: 1.1, alpha: 0.8, wobble: 0.2, step: 4 },
    );
  }
}

/**
 * Cá chép chầu nguyệt — two carp turned in toward a pearl, the standing ridge ornament.
 *
 * Gold, because it is the one place on this screen lamplight is allowed; the hall itself is soot
 * and timber.
 */
function ridgeOrnament(g: G, cx: number, ridgeY: number, half: number, seed: number): void {
  for (const side of [-1, 1]) {
    const x = cx + side * (half - 4);
    printedShape(
      g,
      [
        { x, y: ridgeY },
        { x: x + side * 7, y: ridgeY - 4 },
        { x: x + side * 6, y: ridgeY - 11 },
        { x: x + side * 1, y: ridgeY - 7 },
      ],
      PIGMENT.hoe,
      seed + side,
      { width: 0.9, alpha: 0.7, wobble: 0.2, step: 4, fillAlpha: 0.75 },
    );
  }
  // The pearl, with its flame.
  g.fillStyle(PIGMENT.hoe, 0.85);
  g.fillCircle(cx, ridgeY - 7, 4.2);
  g.lineStyle(1, PIGMENT.muc, 0.55);
  g.strokeCircle(cx, ridgeY - 7, 4.2);
  for (let ray = 0; ray < 7; ray += 1) {
    const angle = -Math.PI + (ray / 6) * Math.PI;
    g.lineStyle(0.9, PIGMENT.hoe, 0.75);
    g.lineBetween(
      cx + Math.cos(angle) * 5.4,
      ridgeY - 7 + Math.sin(angle) * 5.4,
      cx + Math.cos(angle) * 9,
      ridgeY - 7 + Math.sin(angle) * 9,
    );
  }
}

/** Đỉnh — a three-legged bronze urn, patinated. One stands at each foot of the steps. */
function bronzeUrn(g: G, x: number, groundY: number, s: number, seed: number): void {
  const bodyY = groundY - 9 * s;
  const belly: Pt[] = [];
  for (let step = 0; step < 12; step += 1) {
    const angle = (step / 12) * Math.PI * 2;
    belly.push({ x: x + Math.cos(angle) * 8 * s, y: bodyY + Math.sin(angle) * 6.6 * s });
  }
  printedShape(g, belly, PIGMENT.giDong, seed, { width: 0.9, alpha: 0.72, wobble: 0.2, step: 5, fillAlpha: 0.8 });

  // Rim and the two ears above it.
  inkPath(g, [{ x: x - 9 * s, y: bodyY - 6 * s }, { x: x + 9 * s, y: bodyY - 6 * s }], seed + 3, {
    width: 1.2, alpha: 0.75, wobble: 0.16, step: 6,
  });
  for (const side of [-1, 1]) {
    inkPath(
      g,
      [
        { x: x + side * 7 * s, y: bodyY - 6 * s },
        { x: x + side * 9.5 * s, y: bodyY - 10 * s },
        { x: x + side * 5 * s, y: bodyY - 11 * s },
      ],
      seed + 5 + side,
      { width: 0.9, alpha: 0.68, wobble: 0.16, step: 4 },
    );
  }
  // Three legs — two seen, the third behind, which is why the middle one is fainter.
  for (const leg of [-1, 0, 1]) {
    inkPath(
      g,
      [{ x: x + leg * 5.5 * s, y: bodyY + 4 * s }, { x: x + leg * 7 * s, y: groundY }],
      seed + 9 + leg,
      { width: 1.1, alpha: leg === 0 ? 0.35 : 0.7, wobble: 0.14, step: 4 },
    );
  }
}

/**
 * The seat itself, lit and empty.
 *
 * A gold wash behind it does the work a shaft of light would: at this size a drawn lamp is three
 * indistinct pixels, but a glow says "the one thing in this hall that matters is unoccupied".
 */
function emptyThrone(g: G, cx: number, baseY: number, seed: number): void {
  g.fillStyle(PIGMENT.hoe, 0.13);
  g.fillCircle(cx, baseY - 16, 30);
  g.fillStyle(PIGMENT.hoe, 0.1);
  g.fillCircle(cx, baseY - 16, 20);

  // Dais.
  printedShape(
    g,
    [{ x: cx - 20, y: baseY }, { x: cx + 20, y: baseY }, { x: cx + 17, y: baseY - 5 }, { x: cx - 17, y: baseY - 5 }],
    PIGMENT.nauDark, seed, { width: 0.8, alpha: 0.7, wobble: 0.14, step: 6, fillAlpha: 0.85 },
  );
  // Seat and back panel.
  printedShape(
    g,
    [{ x: cx - 11, y: baseY - 5 }, { x: cx + 11, y: baseY - 5 }, { x: cx + 11, y: baseY - 12 }, { x: cx - 11, y: baseY - 12 }],
    PIGMENT.hoe, seed + 2, { width: 0.9, alpha: 0.72, wobble: 0.14, step: 5, fillAlpha: 0.82 },
  );
  printedShape(
    g,
    [
      { x: cx - 9, y: baseY - 12 },
      { x: cx - 9, y: baseY - 26 },
      { x: cx, y: baseY - 31 },
      { x: cx + 9, y: baseY - 26 },
      { x: cx + 9, y: baseY - 12 },
    ],
    PIGMENT.hoe, seed + 4, { width: 0.9, alpha: 0.72, wobble: 0.14, step: 5, fillAlpha: 0.7 },
  );
  // Armrests, and the sun disc cut into the back.
  for (const side of [-1, 1]) {
    inkPath(g, [{ x: cx + side * 11, y: baseY - 12 }, { x: cx + side * 14, y: baseY - 18 }], seed + 6 + side, {
      width: 1, alpha: 0.66, wobble: 0.12, step: 4,
    });
  }
  g.lineStyle(1, PIGMENT.muc, 0.5);
  g.strokeCircle(cx, baseY - 22, 3.4);
}

/**
 * The whole diorama, sized to `width`, with the player's standard flying at both sides.
 *
 * Returns a container laid out from its own (0, 0); the caller places it and adds
 * `THRONE_HALL_HEIGHT` to its cursor.
 */
function proceduralThroneHall(scene: Phaser.Scene, width: number, seed: number): Phaser.GameObjects.Container {
  const view = scene.add.container(0, 0);
  const g = scene.add.graphics();
  view.add(g);

  const cx = width / 2;
  const groundY = THRONE_HALL_HEIGHT - 8;
  const hallHalf = Math.min(104, width * 0.3);
  // Three storeys of it: the courtyard you stand in, the stylobate the hall sits on, and the hall.
  const platformTop = 130;
  const platformFoot = platformTop + 18;
  const pillarTop = platformTop - 46;
  const lowerEaveY = pillarTop + 1;
  const lowerRidgeY = lowerEaveY - 21;
  const friezeY = lowerRidgeY - 12;
  const upperRidgeY = friezeY - 27;

  // The sun coming up behind the roof. The reign starts this morning; nothing else on the screen
  // says the hour.
  g.fillStyle(PIGMENT.hoe, 0.14);
  g.fillCircle(cx, upperRidgeY + 14, 62);
  g.fillStyle(PIGMENT.hoePale, 0.16);
  g.fillCircle(cx, upperRidgeY + 14, 40);
  g.fillStyle(PIGMENT.hoePale, 0.16);
  g.fillCircle(cx, upperRidgeY + 14, 22);

  // Courtyard: paving in a shallow perspective, so the eye is standing in it looking up at the hall.
  printedShape(
    g,
    [{ x: 2, y: groundY + 8 }, { x: width - 2, y: groundY + 8 }, { x: width - 30, y: platformFoot }, { x: 30, y: platformFoot }],
    PIGMENT.diepLo, seed + 70, { width: 0.8, alpha: 0.42, wobble: 0.4, step: 14, fillAlpha: 0.55 },
  );
  for (let slab = 1; slab < 6; slab += 1) {
    const t = slab / 6;
    inkPath(
      g,
      [{ x: 2 + (width - 4) * t, y: groundY + 8 }, { x: 30 + (width - 60) * t, y: platformFoot }],
      seed + 80 + slab, { width: 0.5, alpha: 0.18, wobble: 0.5, step: 16 },
    );
  }

  // Stylobate, and the flight of steps down the middle of it into the court.
  printedShape(
    g,
    [
      { x: cx - hallHalf * 1.3, y: platformTop },
      { x: cx + hallHalf * 1.3, y: platformTop },
      { x: cx + hallHalf * 1.36, y: platformFoot },
      { x: cx - hallHalf * 1.36, y: platformFoot },
    ],
    PIGMENT.diepDeep, seed + 90, { width: 0.9, alpha: 0.6, wobble: 0.25, step: 12, fillAlpha: 0.8 },
  );
  const stairHalfTop = hallHalf * 0.42;
  const stairHalfFoot = hallHalf * 0.56;
  printedShape(
    g,
    [
      { x: cx - stairHalfTop, y: platformTop },
      { x: cx + stairHalfTop, y: platformTop },
      { x: cx + stairHalfFoot, y: groundY },
      { x: cx - stairHalfFoot, y: groundY },
    ],
    PIGMENT.diep, seed + 96, { width: 0.9, alpha: 0.55, wobble: 0.22, step: 12, fillAlpha: 0.85 },
  );
  const STEPS = 5;
  for (let course = 1; course < STEPS; course += 1) {
    const t = course / STEPS;
    const y = platformTop + (groundY - platformTop) * t;
    const half = stairHalfTop + (stairHalfFoot - stairHalfTop) * t;
    inkPath(g, [{ x: cx - half, y }, { x: cx + half, y }], seed + 100 + course, {
      width: 0.8, alpha: 0.4, wobble: 0.3, step: 10,
    });
  }
  // Thềm rồng — the ramps either side of the steps, which is where a dragon would be carved.
  for (const side of [-1, 1]) {
    inkPath(
      g,
      [
        { x: cx + side * stairHalfTop, y: platformTop },
        { x: cx + side * (stairHalfTop + stairHalfFoot) * 0.5, y: (platformTop + groundY) / 2 },
        { x: cx + side * stairHalfFoot, y: groundY },
      ],
      seed + 108 + side, { width: 1.3, alpha: 0.6, wobble: 0.2, step: 8 },
    );
  }

  // The hall's shaded interior, then the throne standing in it, then the colonnade in front.
  printedShape(
    g,
    [
      { x: cx - hallHalf, y: platformTop },
      { x: cx + hallHalf, y: platformTop },
      { x: cx + hallHalf, y: pillarTop },
      { x: cx - hallHalf, y: pillarTop },
    ],
    PIGMENT.mucSoft, seed + 110, { width: 0.9, alpha: 0.5, wobble: 0.3, step: 12, fillAlpha: 0.4 },
  );
  emptyThrone(g, cx, platformTop, seed + 120);

  // Seven posts, six bays — and the middle post is left out. A column dead centre stands
  // straight in front of the seat and hides the one thing the screen is about; a hall's
  // gian giữa is the wide open bay for exactly that reason.
  const bays = 6;
  for (let bay = 0; bay <= bays; bay += 1) {
    if (bay === bays / 2) continue;
    const x = cx - hallHalf + (hallHalf * 2 * bay) / bays;
    printedShape(
      g,
      [{ x: x - 3, y: platformTop }, { x: x + 3, y: platformTop }, { x: x + 2.4, y: pillarTop }, { x: x - 2.4, y: pillarTop }],
      PIGMENT.nau, seed + 130 + bay, { width: 0.8, alpha: 0.72, wobble: 0.12, step: 8, fillAlpha: 0.9 },
    );
    inkPath(g, [{ x: x - 4.5, y: platformTop }, { x: x + 4.5, y: platformTop }], seed + 150 + bay, {
      width: 1, alpha: 0.6, wobble: 0.1, step: 5,
    });
  }

  tiledRoof(g, cx, lowerRidgeY, lowerEaveY, hallHalf * 0.92, hallHalf * 1.3, seed + 200);

  // The painted board between the two roofs, where a hall carries its name. Left blank on purpose:
  // a Hán glyph here would be decoration pretending to be information.
  printedShape(
    g,
    [
      { x: cx - hallHalf * 0.8, y: friezeY },
      { x: cx + hallHalf * 0.8, y: friezeY },
      { x: cx + hallHalf * 0.8, y: lowerRidgeY },
      { x: cx - hallHalf * 0.8, y: lowerRidgeY },
    ],
    PIGMENT.diep, seed + 210, { width: 0.9, alpha: 0.62, wobble: 0.2, step: 10, fillAlpha: 0.9 },
  );
  for (let panel = 1; panel < 8; panel += 1) {
    const x = cx - hallHalf * 0.8 + (hallHalf * 1.6 * panel) / 8;
    inkPath(g, [{ x, y: friezeY + 2 }, { x, y: lowerRidgeY - 2 }], seed + 220 + panel, {
      width: 0.5, alpha: 0.3, wobble: 0.1, step: 6,
    });
  }

  tiledRoof(g, cx, upperRidgeY, friezeY, hallHalf * 0.62, hallHalf * 1.02, seed + 300);
  ridgeOrnament(g, cx, upperRidgeY, hallHalf * 0.62, seed + 320);

  // The pair of đỉnh, down in the court at the foot of the steps where they actually stand.
  bronzeUrn(g, cx - hallHalf * 0.95, groundY - 1, 1.35, seed + 400);
  bronzeUrn(g, cx + hallHalf * 0.95, groundY - 1, 1.35, seed + 430);

  // The two standards. Same flag the provinces will fly, one at each side of the court — the only
  // sỏi son on the screen, and the reason the courtyard is otherwise all paper and soot.
  addStandards(scene, view, width, seed);

  return view;
}
