import Phaser from 'phaser';
import { seal } from './devices';
import { PIGMENT } from './palette';
import { placeStamp, stampDesign } from './stamp';
import { inkPath, mulberry32, type Pt } from './stroke';

type G = Phaser.GameObjects.Graphics;

/**
 * A vertical menu adaptation of Vietnamese sắc phong: warm decorated paper, cloud margins,
 * and vermilion seal. Rolled ends communicate the interaction's scroll metaphor; this is not
 * a reconstruction of the wide historical documents. Sources: docs/design/royal-scroll-menu.md.
 * One cached stamp keeps the paper grain and ornament out of the live render loop.
 */
export function royalScroll(
  scene: Phaser.Scene, x: number, y: number, width: number, height: number,
  withSeal = true,
): Phaser.GameObjects.Image {
  const stamp = stampDesign(scene, `ui:royal-scroll:v2:${width}:${height}:${withSeal ? 'lotus' : 'plain'}`,
    { left: -19, right: width + 21, top: -13, bottom: height + 17 },
    (g, ax, ay) => {
      g.translateCanvas(ax, ay);
      drawPaper(g, width, height);
      drawBorder(g, width, height, withSeal);
      drawRoll(g, width, 0, false);
      drawRoll(g, width, height, true);
      g.translateCanvas(-ax, -ay);
    }, { pool: 'ui', raster: 'plain', pad: 1 });
  return placeStamp(scene, stamp, x, y);
}

/** The moving lower roll used only during the menu's opening. */
export function royalScrollRoll(scene: Phaser.Scene, x: number, y: number, width: number): Phaser.GameObjects.Image {
  const stamp = stampDesign(scene, `ui:royal-scroll-roll:v1:${width}`,
    { left: -19, right: width + 21, top: -13, bottom: 17 },
    (g, ax, ay) => {
      g.translateCanvas(ax, ay);
      drawRoll(g, width, 0, true);
      g.translateCanvas(-ax, -ay);
    }, { pool: 'ui', raster: 'plain', pad: 1 });
  return placeStamp(scene, stamp, x, y);
}

function drawPaper(g: G, w: number, h: number): void {
  const paper: Pt[] = [
    { x: 0, y: 0 }, { x: w, y: 0 }, { x: w - 1.5, y: h * 0.22 },
    { x: w - 0.5, y: h * 0.51 }, { x: w - 2, y: h * 0.78 }, { x: w, y: h },
    { x: 0, y: h }, { x: 1.6, y: h * 0.74 }, { x: 0.5, y: h * 0.44 },
    { x: 2, y: h * 0.19 },
  ];
  for (const [offset, alpha] of [[7, 0.035], [4, 0.06], [2, 0.1]]) {
    g.fillStyle(PIGMENT.muc, alpha);
    g.fillPoints(paper.map((p) => ({ x: p.x + offset, y: p.y + offset })), true);
  }
  g.fillStyle(PIGMENT.diepHi, 1);
  g.fillPoints(paper, true);
  g.fillStyle(PIGMENT.hoePale, 0.16);
  g.fillPoints(paper, true);

  // Narrow, fading strips give the paper a curved edge without darkening the reading field.
  for (let i = 0; i < 22; i++) {
    g.fillStyle(PIGMENT.hoe, 0.14 * (1 - i / 22) ** 2);
    g.fillRect(2 + i, 8, 1, h - 16);
    g.fillRect(w - 3 - i, 8, 1, h - 16);
    g.fillStyle(PIGMENT.nau, 0.07 * (1 - i / 22) ** 2);
    g.fillRect(3, 7 + i, w - 6, 1);
    g.fillRect(3, h - 8 - i, w - 6, 1);
  }
  const rand = mulberry32(632);
  for (let i = 0; i < 680; i++) {
    const fx = 4 + rand() * (w - 8), fy = 10 + rand() * (h - 20);
    g.lineStyle(0.45, i % 3 ? PIGMENT.nau : PIGMENT.diepHi, i % 3 ? 0.035 : 0.25);
    g.lineBetween(fx, fy, fx + 0.5 + rand() * 2.5, fy - 0.3 + rand() * 0.6);
  }
  inkPath(g, paper, 631, { width: 0.85, colour: PIGMENT.nau, alpha: 0.56,
    wobble: 0.3, step: 24, bleed: 0.12, closed: true });
}

function drawBorder(g: G, w: number, h: number, withSeal: boolean): void {
  // Keep the narrow ornamental register entirely outside the buttons' reading field.
  for (const x of [10, w - 10]) {
    inkPath(g, [{ x, y: 16 }, { x, y: h - 16 }], 633 + x,
      { width: 0.65, colour: PIGMENT.hoe, alpha: 0.64, wobble: 0.1, step: 35, bleed: 0.1 });
  }
  for (const x of [20, w - 20]) {
    g.lineStyle(0.55, PIGMENT.hoe, 0.4);
    g.lineBetween(x, 25, x, h - 25);
  }
  for (let y = 46; y < h - 34; y += 36) {
    for (const x of [15, w - 15]) {
      inkPath(g, [{ x, y: y - 4 }, { x: x + 3, y }, { x, y: y + 4 }, { x: x - 3, y }],
        637 + y, { width: 0.65, colour: PIGMENT.hoe, alpha: 0.47,
          wobble: 0, closed: true, bleed: 0.1 });
    }
  }
  for (const side of [1, -1]) {
    const x = side === 1 ? 32 : w - 32;
    cloud(g, x, 25, side, 0.48);
    cloud(g, x, h - 18, side, 0.34);
  }
  // The game's drawn lotus device identifies the seal; no invented imperial lettering.
  if (withSeal) seal(g, w / 2, 130, 20, 'lotus');
  for (const [left, right] of [[30, w / 2 - 23], [w / 2 + 23, w - 30]]) {
    g.lineStyle(0.7, PIGMENT.hoe, 0.5);
    g.lineBetween(left, 130, right, 130);
  }
  g.lineStyle(0.65, PIGMENT.hoe, 0.37);
  g.lineBetween(30, h - 110, w - 30, h - 110);
}

/** Small cloud curls, drawn as sampled curves so the shared ink contour can soften them. */
function cloud(g: G, x: number, y: number, mirror: number, alpha: number): void {
  const outer = new Phaser.Curves.Spline([
    0, 2, 5, 1, 8, -3, 14, -4, 19, 0, 24, 0, 30, 4, 35, 4,
    28, 7, 19, 6, 12, 7, 5, 6, 0, 2,
  ]).getPoints(36);
  const inner = new Phaser.Curves.Spline([6, 3, 11, 2, 13, -1, 17, 2, 23, 3]).getPoints(16);
  for (const path of [outer, inner]) {
    inkPath(g, path.map((p) => ({ x: x + p.x * mirror, y: y + p.y })), 641,
      { width: 0.8, colour: PIGMENT.hoe, alpha, wobble: 0.08, step: 6, bleed: 0.15 });
  }
}

function drawRoll(g: G, w: number, y: number, bottom: boolean): void {
  const radius = bottom ? 8 : 6;
  g.fillStyle(PIGMENT.muc, 0.1);
  g.fillRoundedRect(-14, y - radius + 4, w + 30, radius * 2 + 2, 3);
  // Short wood ends and gold collars, kept small enough to leave the landscape dominant.
  g.fillStyle(PIGMENT.nauDark, 1);
  g.fillRoundedRect(-17, y - 3.5, w + 34, 7, 2);
  g.fillStyle(PIGMENT.nau, 1);
  g.fillRect(-16, y - 3, w + 32, 2);
  for (const x of [-9, w + 6]) {
    g.fillStyle(PIGMENT.hoePale, 1);
    g.fillRect(x, y - 4.5, 3, 9);
    g.lineStyle(0.6, PIGMENT.nauDark, 0.72);
    g.strokeRect(x, y - 4.5, 3, 9);
  }
  const roll: Pt[] = [
    { x: 1, y: y - radius }, { x: w - 1, y: y - radius },
    { x: w + 3, y: y - radius + 3 }, { x: w + 3, y: y + radius - 2 },
    { x: w - 1, y: y + radius }, { x: 1, y: y + radius },
    { x: -3, y: y + radius - 2 }, { x: -3, y: y - radius + 3 },
  ];
  g.fillStyle(PIGMENT.diepDeep, 1);
  g.fillPoints(roll, true);
  g.fillStyle(PIGMENT.diepWarm, 1);
  g.fillRect(0, y - radius + 2, w, radius + 1);
  g.fillStyle(PIGMENT.diepHi, 0.8);
  g.fillRect(1, y - radius + 2, w - 2, 2);
  g.lineStyle(0.7, PIGMENT.hoe, 0.58);
  g.lineBetween(1, y + radius - 2, w - 1, y + radius - 2);
  inkPath(g, roll, bottom ? 643 : 642, { width: 0.85, colour: PIGMENT.nauDark,
    alpha: 0.7, wobble: 0.2, step: 30, bleed: 0.15, closed: true });
  for (const x of [0, w]) {
    g.fillStyle(PIGMENT.diepLo, 1);
    g.fillEllipse(x, y, 6, radius * 2 - 1);
    g.lineStyle(0.7, PIGMENT.nau, 0.8);
    g.strokeEllipse(x, y, 6, radius * 2 - 1);
    g.strokeEllipse(x + 0.5, y + 0.5, 2.5, radius + 1);
  }
}
