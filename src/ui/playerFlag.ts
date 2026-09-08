/**
 * Shared dynastic player-flag rendering. The colourful waving banners are part of
 * the game's identity rather than a per-theme treatment, so both the ink-wash and
 * illustrated-atlas item renderers draw the exact same flags via these helpers.
 */
import Phaser from 'phaser';
import { INK } from './inkTheme';
import { PIGMENT, mutePigment } from './ink/palette';
import { conquestArtStamp } from './conquestMapArt';
import { placeStamp } from './ink/stamp';
import { drawHouseBanner, houseBanner } from './ascent/houseBanner';

/**
 * The five standards keep their geometry — the waving cloth, the scalloped fringe, the nested
 * squares, the pseudo-glyph device. Only the pigments change: an art direction that throws away a
 * working system is a reskin, not a direction.
 *
 * Acid yellow becomes hoa hòe, sky blue becomes chàm, grass green becomes gỉ đồng; the red was
 * already sỏi son. `muted` desaturates the lot for a rival, so the only saturated red anywhere on
 * the map is still the player's own.
 */
interface FlagPigments {
  gold: number;
  goldBright: number;
  red: number;
  redBright: number;
  cream: number;
  blue: number;
  green: number;
  ink: number;
}

function flagPigments(muted: boolean): FlagPigments {
  const base: FlagPigments = {
    gold: PIGMENT.hoe,
    goldBright: PIGMENT.hoePale,
    red: PIGMENT.son,
    redBright: PIGMENT.sonDeep,
    cream: PIGMENT.diepHi,
    blue: PIGMENT.cham,
    // Mộc, the wood element on the ngũ sắc, and the foliage on everything else. A leaf, not
    // a patina.
    green: PIGMENT.tram,
    ink: PIGMENT.muc,
  };
  if (!muted) {
    return base;
  }
  return {
    gold: mutePigment(base.gold), goldBright: mutePigment(base.goldBright),
    red: mutePigment(base.red), redBright: mutePigment(base.redBright),
    cream: mutePigment(base.cream, 0.4), blue: mutePigment(base.blue),
    green: mutePigment(base.green), ink: base.ink,
  };
}

export type PlayerFlagStyle =
  | 'yellow-seal'
  | 'red-moon'
  | 'layered-square'
  | 'red-fringe-yellow'
  | 'yellow-red-medallion'
  | 'ngu-sac';

export const PLAYER_FLAG_STYLES: PlayerFlagStyle[] = [
  'yellow-seal',
  'red-moon',
  'layered-square',
  'red-fringe-yellow',
  'yellow-red-medallion',
  'ngu-sac',
];

/** Player standards share the saved dynasty sign; only rival standards use the seed. */
export function createPlayerLandFlag(scene: Phaser.Scene, isCapital = false, styleSeed = 0, muted = false): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  if (!muted) {
    const sign = houseBanner();
    // Keep the existing ground anchor (+8) and roughly 54-unit mast used by map/battle layouts.
    container.add(drawHouseBanner(scene, sign, 36, 58).setPosition(-2.88, -50));
    container.setData('playerStandard', { ...sign, isCapital });
    if (isCapital) container.setScale(1.22);
    return container;
  }
  const style = pickFlagStyle(styleSeed);
  const artStyle = style === 'yellow-red-medallion' ? 'yellow-medallion' : style;
  const artId = isCapital
    ? 'marker.capital-standard'
    : `marker.${muted ? 'rival-' : ''}flag-${artStyle}`;
  const authored = conquestArtStamp(scene, artId, { left: -18, right: 18, top: -48, bottom: 10 });
  if (authored) {
    container.add(placeStamp(scene, authored, 0, 0));
    if (isCapital) container.setScale(1.22);
    return container;
  }
  const pole = scene.add.graphics();
  const cloth = scene.add.graphics();
  const scale = isCapital ? 1.22 : 1;
  const poleX = 0;
  const poleTop = -46 * scale;
  const poleBottom = 8 * scale;
  // The ngũ sắc is a *square* cloth with a tail, not a pennant — the nested squares only read
  // as nested squares if the cloth they are on is one.
  const flagW = (style === 'layered-square' ? 28 : style === 'red-fringe-yellow' ? 29 : style === 'ngu-sac' ? 24 : 25) * scale;
  const flagH = (style === 'layered-square' ? 22 : style === 'red-fringe-yellow' ? 18 : style === 'ngu-sac' ? 21 : 17) * scale;

  drawStandardMast(pole, poleX, poleTop, poleBottom, scale, isCapital, muted);
  drawPlayerFlagCloth(cloth, style, poleX, poleTop, flagW, flagH, scale, styleSeed, muted);

  scene.tweens.add({
    targets: cloth,
    scaleX: { from: 0.96, to: 1.08 },
    skewX: { from: -0.05, to: 0.05 },
    duration: 900 + (isCapital ? 120 : 0),
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  container.add([pole, cloth]);
  return container;
}

/**
 * The pole the standard flies from — a mast, a finial and a footing, not a line.
 *
 * It was `lineBetween` at 2.2px with a soft ellipse under it, which is what a flag is pinned to in
 * a diagram. On the one province that matters most — the seat of the dynasty, the thing a player
 * looks for first — the realm's own standard was flying from a stick, and the stick had no top, no
 * bottom, and no thickness that changed anywhere along it.
 *
 * Three things fix that and cost almost nothing:
 *
 *  · a **tapered** mast in wood rather than ink, thicker at the foot, so it reads as a raised spar
 *  · a **finial** — the gilt lotus bud that tops a standard at a Vietnamese seat — which gives the
 *    pole an end instead of stopping in mid-air, and a binding where the cloth is lashed on
 *  · a **footing**: a stepped stone socket the mast stands in, so it is planted in the ground
 *    rather than hovering over a smudge
 *
 * The capital takes one thing more: a tassel on a cord under the finial. It is the difference
 * between a flag and a standard, and it is only ever drawn on the seat.
 */
function drawStandardMast(
  g: Phaser.GameObjects.Graphics,
  x: number,
  top: number,
  bottom: number,
  scale: number,
  isCapital: boolean,
  muted: boolean,
): void {
  const pig = flagPigments(muted);
  const wood = muted ? mutePigment(PIGMENT.nau) : PIGMENT.nau;

  // The ground it stands on, first: a soft shadow, then the socket, so the stone sits in the shade.
  g.fillStyle(pig.ink, 0.2);
  g.fillEllipse(x, bottom + 2.4 * scale, 13 * scale, 4.2 * scale);
  g.fillStyle(muted ? mutePigment(PIGMENT.diepLo) : PIGMENT.diepLo, 0.95);
  g.fillPoints([
    { x: x - 4.6 * scale, y: bottom + 2 * scale },
    { x: x + 4.6 * scale, y: bottom + 2 * scale },
    { x: x + 3.2 * scale, y: bottom - 3.4 * scale },
    { x: x - 3.2 * scale, y: bottom - 3.4 * scale },
  ], true);
  g.lineStyle(1 * scale, pig.ink, 0.6);
  g.strokePoints([
    { x: x - 4.6 * scale, y: bottom + 2 * scale },
    { x: x + 4.6 * scale, y: bottom + 2 * scale },
    { x: x + 3.2 * scale, y: bottom - 3.4 * scale },
    { x: x - 3.2 * scale, y: bottom - 3.4 * scale },
  ], true, true);

  // The mast: wider at the foot than at the head, which is the whole reason it reads as timber.
  const headY = top - 2.4 * scale;
  g.fillStyle(wood, 0.96);
  g.fillPoints([
    { x: x - 1.25 * scale, y: bottom },
    { x: x + 1.25 * scale, y: bottom },
    { x: x + 0.7 * scale, y: headY },
    { x: x - 0.7 * scale, y: headY },
  ], true);
  // A single lit edge down the left of the spar. Two-tone timber at this size is mud; one line is
  // enough to say the thing is round.
  g.lineStyle(0.6 * scale, pig.cream, 0.38);
  g.lineBetween(x - 0.7 * scale, bottom - 2 * scale, x - 0.35 * scale, headY + 2 * scale);
  g.lineStyle(0.8 * scale, pig.ink, 0.5);
  g.lineBetween(x + 1.25 * scale, bottom, x + 0.7 * scale, headY);
  g.lineStyle(0.6 * scale, pig.ink, 0.32);
  g.lineBetween(x - 1.25 * scale, bottom, x - 0.7 * scale, headY);

  // The binding where the cloth is lashed on.
  g.fillStyle(pig.ink, 0.7);
  g.fillRect(x - 1.7 * scale, top - 0.6 * scale, 3.4 * scale, 1.5 * scale);

  // The finial: a gilt bud on a collar. Slim — a wide diamond up here reads as a kite flying off
  // the top of the pole, which is what the first one did.
  g.fillStyle(pig.gold, 0.98);
  g.fillRect(x - 1.5 * scale, headY - 1.1 * scale, 3 * scale, 1.4 * scale);
  g.fillTriangle(x, headY - 5.4 * scale, x - 1.4 * scale, headY - 1.1 * scale, x + 1.4 * scale, headY - 1.1 * scale);
  g.fillTriangle(x, headY + 0.4 * scale, x - 1.4 * scale, headY - 1.1 * scale, x + 1.4 * scale, headY - 1.1 * scale);
  g.lineStyle(0.7 * scale, pig.ink, 0.6);
  g.strokeTriangle(x, headY - 5.4 * scale, x - 1.4 * scale, headY - 1.1 * scale, x + 1.4 * scale, headY - 1.1 * scale);

  if (!isCapital) {
    return;
  }
  // The seat's tassel, hung ON the mast and falling straight. Swung out on a long cord it read as
  // a spider on a thread beside the pole rather than a cord tied to it.
  const knotY = headY + 2.6 * scale;
  g.lineStyle(0.8 * scale, pig.red, 0.9);
  g.lineBetween(x - 0.4 * scale, headY + 0.6 * scale, x - 1.7 * scale, knotY);
  g.fillStyle(pig.red, 0.95);
  g.fillCircle(x - 1.9 * scale, knotY + 0.9 * scale, 1.3 * scale);
  g.lineStyle(0.6 * scale, pig.red, 0.85);
  for (const strand of [-0.7, 0.4]) {
    g.lineBetween(x - 1.9 * scale, knotY + 1.9 * scale, x - 1.9 * scale + strand * scale, knotY + 5.4 * scale);
  }
}

export function pickFlagStyle(seed: number): PlayerFlagStyle {
  const index = Math.abs(seed) % PLAYER_FLAG_STYLES.length;
  return PLAYER_FLAG_STYLES[index];
}

function drawPlayerFlagCloth(
  graphics: Phaser.GameObjects.Graphics,
  style: PlayerFlagStyle,
  poleX: number,
  poleTop: number,
  flagW: number,
  flagH: number,
  scale: number,
  seed: number,
  muted = false,
): void {
  const pig = flagPigments(muted);

  if (style === 'yellow-seal') {
    drawWavingRect(graphics, poleX, poleTop, flagW, flagH, pig.gold, 0.98, scale);
    graphics.lineStyle(2.2 * scale, pig.ink, 0.62);
    graphics.strokePath();
    graphics.fillStyle(pig.red, 0.94);
    graphics.fillCircle(poleX + flagW * 0.56, poleTop + flagH * 0.5, flagH * 0.32);
    drawPseudoGlyph(graphics, poleX + flagW * 0.56, poleTop + flagH * 0.52, scale * 0.46, pig.ink, seed);
    return;
  }

  if (style === 'red-moon') {
    drawWavingRect(graphics, poleX, poleTop, flagW, flagH, pig.red, 0.98, scale);
    graphics.lineStyle(2.4 * scale, pig.gold, 0.98);
    graphics.strokePath();
    graphics.fillStyle(pig.cream, 0.96);
    graphics.fillCircle(poleX + flagW * 0.55, poleTop + flagH * 0.52, flagH * 0.36);
    drawPseudoGlyph(graphics, poleX + flagW * 0.55, poleTop + flagH * 0.55, scale * 0.5, pig.ink, seed + 1);
    return;
  }

  if (style === 'ngu-sac') {
    // Cờ ngũ sắc: five nested squares in the ngũ hành colours, and three ragged points at the fly.
    //
    // `layered-square` was the closest thing here and it is not this: four bands of blue, gold,
    // green and red on a scalloped border, which is a decorative guess. The festival flag flown at
    // every đình and every hội in the delta is a specific object — five colours for the five
    // elements, nested from the outside in, with the earth's yellow at the centre because earth is
    // the middle direction, and a tail of three points (đuôi nheo) at the fly.
    //
    // Wood green outside, then fire red, then metal white, then water black, then earth yellow at
    // the heart. Five bands on a twenty-four-pixel cloth is close to the limit of what will read,
    // so the inner two are deliberately small — at map scale the eye takes the green-red-white
    // rhythm and the yellow centre, which is exactly what identifies it.
    const bands: Array<[number, number]> = [
      [pig.green, 0.0], [pig.red, 0.11], [pig.cream, 0.22], [pig.ink, 0.31], [pig.goldBright, 0.38],
    ];
    // The tail first, so the cloth is printed over its own roots.
    const tailX = poleX + flagW;
    for (let i = 0; i < 3; i += 1) {
      const y0 = poleTop + flagH * (0.14 + i * 0.29);
      graphics.fillStyle(i === 1 ? pig.red : pig.green, 0.94);
      graphics.fillTriangle(
        tailX - flagW * 0.04, y0,
        tailX + flagW * 0.30, y0 + flagH * 0.07,
        tailX - flagW * 0.04, y0 + flagH * 0.16,
      );
    }
    for (const [colour, inset] of bands) {
      graphics.fillStyle(colour, 0.97);
      graphics.fillRect(
        poleX + flagW * inset, poleTop + flagH * inset,
        flagW * (1 - inset * 2), flagH * (1 - inset * 2),
      );
    }
    graphics.lineStyle(1.1 * scale, pig.ink, 0.34);
    graphics.strokeRect(poleX, poleTop, flagW, flagH);
    return;
  }

  if (style === 'layered-square') {
    drawScallopedFringe(graphics, poleX, poleTop, flagW, flagH, scale, pig.red);
    graphics.fillStyle(pig.blue, 0.96);
    graphics.fillRect(poleX + flagW * 0.08, poleTop + flagH * 0.12, flagW * 0.82, flagH * 0.76);
    graphics.fillStyle(pig.goldBright, 0.98);
    graphics.fillRect(poleX + flagW * 0.18, poleTop + flagH * 0.22, flagW * 0.62, flagH * 0.56);
    graphics.fillStyle(pig.green, 0.98);
    graphics.fillRect(poleX + flagW * 0.28, poleTop + flagH * 0.32, flagW * 0.42, flagH * 0.36);
    graphics.fillStyle(pig.red, 0.98);
    graphics.fillRect(poleX + flagW * 0.37, poleTop + flagH * 0.4, flagW * 0.24, flagH * 0.2);
    drawPseudoGlyph(graphics, poleX + flagW * 0.49, poleTop + flagH * 0.52, scale * 0.36, pig.goldBright, seed + 2);
    return;
  }

  if (style === 'red-fringe-yellow') {
    drawScallopedFringe(graphics, poleX, poleTop, flagW, flagH, scale, pig.red);
    graphics.fillStyle(pig.gold, 0.98);
    graphics.fillRect(poleX + flagW * 0.08, poleTop + flagH * 0.14, flagW * 0.76, flagH * 0.7);
    if (seed % 2 === 0) {
      graphics.lineStyle(1.7 * scale, pig.red, 0.94);
      graphics.strokeCircle(poleX + flagW * 0.47, poleTop + flagH * 0.49, flagH * 0.28);
      drawPseudoGlyph(graphics, poleX + flagW * 0.47, poleTop + flagH * 0.5, scale * 0.44, pig.ink, seed + 3);
    } else {
      drawPseudoGlyph(graphics, poleX + flagW * 0.48, poleTop + flagH * 0.52, scale * 0.5, pig.red, seed + 4);
    }
    return;
  }

  drawWavingRect(graphics, poleX, poleTop, flagW, flagH, pig.gold, 0.98, scale);
  graphics.lineStyle(2.2 * scale, pig.red, 0.95);
  graphics.strokePath();
  graphics.fillStyle(pig.red, 0.94);
  graphics.fillCircle(poleX + flagW * 0.55, poleTop + flagH * 0.5, flagH * 0.34);
  drawPseudoGlyph(graphics, poleX + flagW * 0.55, poleTop + flagH * 0.53, scale * 0.48, pig.ink, seed + 5);
}

function drawWavingRect(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha: number,
  scale: number,
): void {
  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(x, y);
  graphics.lineTo(x + width * 0.44, y + 1.5 * scale);
  graphics.lineTo(x + width, y);
  graphics.lineTo(x + width, y + height);
  graphics.lineTo(x + width * 0.46, y + height - 1.3 * scale);
  graphics.lineTo(x, y + height);
  graphics.closePath();
  graphics.fillPath();
}

function drawScallopedFringe(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  color: number,
): void {
  graphics.fillStyle(color, 0.96);
  graphics.fillRect(x, y, width, height);
  graphics.lineStyle(1.1 * scale, INK.ink, 0.32);
  graphics.strokeRect(x, y, width, height);
}

function drawPseudoGlyph(
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  scale: number,
  color: number,
  seed: number,
): void {
  const variant = Math.abs(seed) % 5;
  graphics.lineStyle(Math.max(0.75, 1.55 * scale), color, 0.95);

  if (variant === 0) {
    graphics.lineBetween(centerX - 5 * scale, centerY - 6 * scale, centerX + 5 * scale, centerY - 6 * scale);
    graphics.lineBetween(centerX, centerY - 8 * scale, centerX, centerY + 8 * scale);
    graphics.lineBetween(centerX - 6 * scale, centerY + 1 * scale, centerX + 6 * scale, centerY + 1 * scale);
    graphics.lineBetween(centerX - 3 * scale, centerY + 6 * scale, centerX + 5 * scale, centerY + 10 * scale);
    return;
  }

  if (variant === 1) {
    graphics.lineBetween(centerX - 6 * scale, centerY - 7 * scale, centerX + 6 * scale, centerY - 7 * scale);
    graphics.lineBetween(centerX - 2 * scale, centerY - 9 * scale, centerX - 2 * scale, centerY + 9 * scale);
    graphics.lineBetween(centerX - 7 * scale, centerY + 1 * scale, centerX + 7 * scale, centerY + 1 * scale);
    graphics.lineBetween(centerX + 4 * scale, centerY - 7 * scale, centerX + 4 * scale, centerY + 8 * scale);
    return;
  }

  if (variant === 2) {
    graphics.lineBetween(centerX - 7 * scale, centerY - 4 * scale, centerX + 7 * scale, centerY - 4 * scale);
    graphics.lineBetween(centerX - 3 * scale, centerY - 9 * scale, centerX - 3 * scale, centerY + 8 * scale);
    graphics.lineBetween(centerX - 6 * scale, centerY + 5 * scale, centerX + 7 * scale, centerY + 5 * scale);
    graphics.lineBetween(centerX + 5 * scale, centerY - 2 * scale, centerX + 1 * scale, centerY + 9 * scale);
    return;
  }

  if (variant === 3) {
    graphics.lineBetween(centerX - 5 * scale, centerY - 7 * scale, centerX + 6 * scale, centerY - 8 * scale);
    graphics.lineBetween(centerX, centerY - 7 * scale, centerX, centerY + 6 * scale);
    graphics.lineBetween(centerX - 5 * scale, centerY + 3 * scale, centerX + 6 * scale, centerY + 3 * scale);
    graphics.lineBetween(centerX - 2 * scale, centerY + 8 * scale, centerX + 3 * scale, centerY + 5 * scale);
    return;
  }

  graphics.lineBetween(centerX - 6 * scale, centerY - 8 * scale, centerX + 7 * scale, centerY - 6 * scale);
  graphics.lineBetween(centerX - 2 * scale, centerY - 6 * scale, centerX - 2 * scale, centerY + 8 * scale);
  graphics.lineBetween(centerX - 7 * scale, centerY, centerX + 5 * scale, centerY);
  graphics.lineBetween(centerX + 3 * scale, centerY - 5 * scale, centerX + 3 * scale, centerY + 9 * scale);
}
