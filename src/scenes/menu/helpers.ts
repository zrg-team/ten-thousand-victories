/**
 * Pure helpers the menu modules import directly.
 *
 * `pageFloor`, the drawn river and its span query, the seeded rng, the ring edges and the hatch
 * fill. None of these touch the scene, which is why they are a leaf rather than forwarders: a
 * module imports them, and this file imports no sibling.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT } from '../../game/constants';
import { t } from '../../i18n';
import { BACK_BAR_BAND } from '../../ui/InkUI';
import { thickPath, type Pt } from '../../ui/ink/stroke';

/**
 * The menu river, as a shape that can be asked questions.
 *
 * It remains queryable after the armies are gone because the paddy contract is just as important:
 * every field belongs on the right bank, never painted across the water.
 */
export interface MenuRiver {
  /** The bank polygon, exactly as drawn. */
  banks: Pt[];
  /** Horizontal extent of the water at a given height, or undefined above/below the course. */
  spanAt(y: number): { left: number; right: number } | undefined;
}

export function createMenuRiver(): MenuRiver {
  const course: Pt[] = [
    { x: 246, y: 286 }, { x: 232, y: 340 }, { x: 208, y: 392 },
    { x: 174, y: 444 }, { x: 128, y: 492 }, { x: 62, y: 530 }, { x: -24, y: 552 },
  ];
  const banks = thickPath(course, course.map((_, index) => 5 + index * 2.4));

  return {
    banks,
    // Read off the drawn polygon rather than recomputed from the centre line: the band is offset
    // perpendicular to a course that runs diagonally, so its horizontal extent at a given height is
    // markedly wider than its nominal width.
    spanAt(y: number) {
      let left = Infinity;
      let right = -Infinity;
      for (let index = 0; index < banks.length; index += 1) {
        const a = banks[index];
        const b = banks[(index + 1) % banks.length];
        if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
          const t = Math.abs(b.y - a.y) < 1e-6 ? 0 : (y - a.y) / (b.y - a.y);
          const x = a.x + (b.x - a.x) * t;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      return left === Infinity ? undefined : { left, right };
    },
  };
}

/** Polygon ring of wall edges around a centre, used to fortify the menu citadel. */
export function ringEdges(cx: number, cy: number, rx: number, ry: number, sides = 8): Array<[number, number, number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return points.map((p, i): [number, number, number, number] => {
    const next = points[(i + 1) % sides];
    return [p[0], p[1], next[0], next[1]];
  });
}

export function createMenuRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

/**
 * A hatched band: what is promised, drawn distinct from what is banked.
 *
 * Thin bars on a stride rather than a lighter fill — a second solid tone read as a second
 * bar, and the difference between *held* and *would hold if the reign ended now* is the
 * whole thing the segment is there to say.
 */
export function drawHatch(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, colour: number): void {
  if (width <= 1) return;
  g.fillStyle(colour, 0.72);
  for (let cursor = x; cursor < x + width; cursor += 4) {
    g.fillRect(cursor, y, Math.min(2, x + width - cursor), height);
  }
}

/** The band a menu sub-page may draw in: under the wordmark, above the way back. */
export function pageFloor(): number {
  return GAME_HEIGHT - BACK_BAR_BAND - 12;
}
