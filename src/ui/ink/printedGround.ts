import Phaser from 'phaser';
import { EDGE_DIRECTIONS, hexCorners } from '../../map/hex';
import type { LandscapeContext, LandscapeTile } from '../MapRenderer';
import { PIGMENT } from './palette';
import { mixPigment } from './season';
import { inkPath, type Pt } from './stroke';
import { connectedRiceGround } from './riceGround';

type Family = 'field' | 'grove' | 'ridge';
const family = (tile: LandscapeTile): Family | undefined =>
  tile.terrain === 'fields' || tile.terrain === 'riceFields' ? 'field'
    : tile.terrain === 'forest' ? 'grove' : tile.terrain === 'hills' ? 'ridge' : undefined;
const keyOf = (q: number, r: number): string => `${q},${r}`;
const pointKey = (p: Pt): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
const signedArea = (loop: Pt[]): number => loop.reduce((sum, p, i) => {
  const n = loop[(i + 1) % loop.length]; return sum + p.x * n.y - n.x * p.y;
}, 0);

/** Trace connected colour blocks. A province border never splits the landscape. */
function outlines(tiles: LandscapeTile[], ctx: LandscapeContext): Pt[][] {
  const members = new Set(tiles.map(tile => keyOf(tile.coord.q, tile.coord.r)));
  const edges = new Map<string, { a: Pt; b: Pt }>();
  for (const tile of tiles) {
    const corners = hexCorners(ctx.centreOf(tile), ctx.tileSize).map(([x, y]) => ({ x, y }));
    for (let edge = 0; edge < 6; edge++) {
      const d = EDGE_DIRECTIONS[edge];
      if (members.has(keyOf(tile.coord.q + d.q, tile.coord.r + d.r))) continue;
      const a = corners[edge], b = corners[(edge + 1) % 6];
      edges.set(pointKey(a), { a, b });
    }
  }
  const loops: Pt[][] = [];
  while (edges.size) {
    const first = edges.values().next().value!;
    const loop: Pt[] = [];
    let edge: { a: Pt; b: Pt } | undefined = first;
    while (edge) {
      loop.push(edge.a); edges.delete(pointKey(edge.a));
      if (pointKey(edge.b) === pointKey(first.a)) break;
      edge = edges.get(pointKey(edge.b));
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Rounded block-cut contour; broad bends instead of six-sided patches. */
function roundBlock(loop: Pt[]): Pt[] {
  return loop.flatMap((p, i) => {
    const next = loop[(i + 1) % loop.length];
    return [{ x: p.x * 0.82 + next.x * 0.18, y: p.y * 0.82 + next.y * 0.18 },
      { x: p.x * 0.18 + next.x * 0.82, y: p.y * 0.18 + next.y * 0.82 }];
  });
}

/**
 * The ground is printed in broad areas of pigment on the same paper as the
 * buildings and mountains. The optional grass material replaces only the opaque
 * base; these connected family blocks remain as a light pigment overlay above it.
 */
export function* paintPrintedGround(ctx: LandscapeContext, textured = false): Generator<void> {
  const g = ctx.graphics;
  if (new URLSearchParams(location.search).get('naturalground') === '0') {
    g.setData('printedGround', undefined);
    return;
  }
  const dry = ctx.tiles.filter(tile => tile.terrain !== 'water' && ctx.isVisible(tile));
  const byCoord = new Map(dry.map(tile => [keyOf(tile.coord.q, tile.coord.r), tile]));
  const families = new Map(dry.map(tile => [keyOf(tile.coord.q, tile.coord.r), family(tile)]));
  // A plain between two rice cells belongs to their shared field system. This
  // joins nearby paddies through their banks without changing any gameplay terrain.
  for (const tile of dry) {
    if (tile.terrain !== 'plains') continue;
    const fields = EDGE_DIRECTIONS.filter(d => {
      const other = byCoord.get(keyOf(tile.coord.q + d.q, tile.coord.r + d.r));
      return other && family(other) === 'field';
    }).length;
    if (fields >= 2) families.set(keyOf(tile.coord.q, tile.coord.r), 'field');
  }
  const base = mixPigment(PIGMENT.diepWarm, PIGMENT.tramPale, 0.17);
  // Opaque, identical pigment on every touching polygon. The overlap is greater
  // than one canvas sample across a shared edge, so antialiasing cannot leave a
  // transparent hairline. At the coast it stays beneath the existing bank stroke.
  for (const tile of textured ? [] : dry) {
    const corners = hexCorners(ctx.centreOf(tile), ctx.tileSize + 0.8).map(([x, y]) => ({ x, y }));
    g.fillStyle(base, 1).fillPoints(corners, true);
    yield;
  }
  const seen = new Set<string>();
  const blocks: Record<Family, number> = { field: 0, grove: 0, ridge: 0 };
  for (const tile of dry) {
    const first = keyOf(tile.coord.q, tile.coord.r), type = families.get(first);
    if (!type || seen.has(first)) continue;
    const group = [tile]; seen.add(first);
    for (let next = 0; next < group.length; next++) {
      const at = group[next];
      for (const d of EDGE_DIRECTIONS) {
        const key = keyOf(at.coord.q + d.q, at.coord.r + d.r);
        const other = byCoord.get(key);
        if (!other || seen.has(key) || families.get(key) !== type) continue;
        seen.add(key); group.push(other);
      }
      yield;
    }
    // Single small cells belong to the common ground. Their tree, rice or ridge
    // artwork already says what grows there; another island would repeat the fault.
    if (group.length < 3) continue;
    // Cultivated basins supply their own water/crop impressions and shared earthen bunds.
    if (type === 'field' && connectedRiceGround()) continue;
    blocks[type]++;
    const pigment = type === 'field' ? PIGMENT.hoePale : type === 'grove' ? PIGMENT.tramPale : PIGMENT.diepDeep;
    const colour = mixPigment(base, pigment, type === 'grove' ? 0.2 : 0.26);
    const loops = outlines(group, ctx);
    for (const loop of loops.filter(points => signedArea(points) > 0)) {
      const contour = roundBlock(loop);
      const polygon = new Phaser.Geom.Polygon(loop);
      const holes = loops.filter(points => signedArea(points) < 0
        && Phaser.Geom.Polygon.Contains(polygon, points[0].x, points[0].y));
      const points = [...contour], holeIndices: number[] = [];
      for (const hole of holes) { holeIndices.push(points.length); points.push(...hole); }
      const triangles = Phaser.Geom.Polygon.Earcut(points.flatMap(p => [p.x, p.y]), holeIndices);
      g.fillStyle(colour, textured ? 0.2 : 1);
      for (let i = 0; i < triangles.length; i += 3) {
        const a = points[triangles[i]], b = points[triangles[i + 1]], c = points[triangles[i + 2]];
        g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
      }
      // A few long lines along the lower bank evoke the contour block of a print.
      // No full outline around every region: the ownership line has that job.
      for (let i = 0; i < contour.length; i++) {
        const a = contour[i], b = contour[(i + 1) % contour.length];
        if (b.x >= a.x || Math.abs(b.x - a.x) < ctx.tileSize * 0.45) continue;
        inkPath(g, [a, b], Math.round(a.x * 3 + a.y), {
          colour: type === 'grove' ? PIGMENT.tramDeep : PIGMENT.nau,
          width: 0.65, alpha: 0.11, wobble: 0.45, bleed: 0.2,
        });
      }
      yield;
    }
  }
  g.setData('printedGround', { dryCells: dry.length, blocks, textureImages: textured ? dry.length : 0 });
}
