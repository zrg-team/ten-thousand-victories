import Phaser from 'phaser';
import type { HexTerrainType } from '../map/terrainTypes';
import type { PixelPoint } from '../map/hex';
import type { LandscapeContext, MapRenderer } from './MapRenderer';
import type { MapThemeDefinition, MapThemePalette } from './mapTheme';
import { PIGMENT } from './ink/palette';
import { groundTone, hatchPoly, inkPath, mulberry32, printedShape, washFill, type Pt } from './ink/stroke';
import {
  areca, bamboo, banana, banyan, bush, farmer, grassTuft, planKarstRange, planSoftRidge, tree,
  type ReliefPlan,
} from './ink/props';
import { drawFieldPlot, paddyLattice } from './ink/settlements';
import { groundDepth, unitScale, worldScale } from './ink/proportion';
import {
  getFoliageSeason, groundCast, mixPigment, mountainWeatherTint, seasonalStage, seasonPalette,
} from './ink/season';
import { scatterDensity } from '../game/graphicsQuality';
import {
  conquestArtStamp, conquestKarstArtId, conquestTreeArtId, hasConquestMapArt, stampFootY,
} from './conquestMapArt';
import { applyStamp, placeStamp } from './ink/stamp';

/**
 * Đông Hồ landscape rendering — the whole map drawn in one pass instead of tile by tile.
 *
 * The rule this class exists to enforce:
 *
 *   **The grid decides where. It never decides what shape.**
 *
 * Nothing here is clipped to a cell. Ground tone blends between cells with a radial falloff, props
 * are one scatter over the whole map that merely *consults* the grid for what to be, ranges and
 * field systems draw as whole objects across many cells, and everything sorts back-to-front so
 * overlap reads as depth.
 *
 * The version that clipped each tile into its own hexagon read, correctly, as a list of dioramas:
 * static, cut off at every boundary, and nothing like a country. Deleting the clip is the single
 * largest change in this art direction.
 */

/**
 * Ground tone per terrain. `null` means bare paper — mountains carry their own fill.
 *
 * Reads `seasonPalette()`, which on the map is **pinned to `BAKE_SEASON`**: this fill is the
 * expensive half of the terrain pass and only needs redrawing when a province changes hands. What
 * turns with the calendar is the softer `groundCast()` laid over this inside the *decoration* layer,
 * which is re-inked in ~170 ms — see `ink/season.ts`.
 *
 * On the menu diorama, drawn once per launch and never re-baked, the pin is the real season, so the
 * title screen still shows the ground the month deserves.
 */
function groundFor(terrain: HexTerrainType): number | null {
  const palette = seasonPalette();
  switch (terrain) {
    // Open grass. `plains` is 44% of the world, and on a print that much ground is the sheet: the
    // grass is stated by the tufts standing in it, not by a green laid under them. It leans toward
    // the canopy by a twelfth, only so a plain and a paddy are not the same cream. A quarter of the
    // way — the old value — was enough green to pull the map's dominant tone to hue 60° while the
    // sheet and the reference prints beside it sit at 40°.
    case 'plains':
      return mixPigment(palette.ground, palette.foliage, 0.08);
    // The paddy's colour comes from the lattice drawn on top of it, so its base stays quieter —
    // otherwise the plot fills and the ground tone compound into the loudest thing on the sheet.
    case 'fields':
    case 'riceFields':
      return palette.ground;
    // Forest floor is earth under a canopy, not more canopy — and earth in this palette is nâu, the
    // iron-brown, not the third of leaf green it used to borrow. A shade of the relief tone toward
    // brown is enough for a wood to read as a mass at country zoom, with no green blanket under
    // crowns that go gold in autumn.
    case 'forest':
      return mixPigment(palette.groundRelief, PIGMENT.nau, 0.12);
    case 'hills':
    case 'fortress':
    case 'shrine':
      return palette.groundRelief;
    default:
      return null;
  }
}

type PropKind = 'tree' | 'bush' | 'tuft' | 'bamboo' | 'banana' | 'areca' | 'banyan' | 'farmer';

interface ScatterSpec {
  count: [number, number];
  kinds: PropKind[];
  scale: [number, number];
}

/** How thickly each terrain is planted, and with what. Trees carry it; bamboo is an accent. */
/**
 * How thickly each kind of ground is planted.
 *
 * Cut back from what shipped, and the seat terrains cut to nothing. A tree is now drawn at its
 * real size against the roofs — eight metres against a nine-metre house — so the counts that
 * looked like scrub when trees were small turned the map into closed canopy the moment they
 * weren't, and the two or three that landed on every fortress hex stood in the middle of the town
 * they were meant to shelter. A settlement plants its own grove; the scatter stays out.
 */
const SCATTER: Partial<Record<HexTerrainType, ScatterSpec>> = {
  // Grass, with trees standing in it rather than the other way round. Tufts outnumber trees three
  // to one, because open ground carrying one or two props against the paddy's eight inked plots
  // per hex is what made plains read as blank paper next to farmland.
  //
  // Roughly double the count it used to carry. That coverage was previously bought by drawing each
  // tuft five times life size, which put grass at the same height as the farmers standing in it;
  // `UNIT.grassTuft` has come back down and the density is what replaces it. This is the cheap
  // half of the trade — a tuft is four inked blades and its FOOTPRINT is 3 against a tree's 11, so
  // they pack in without the spacing pass thinning them out.
  //
  // `scale` is **jitter around 1**, not a size. It multiplies `worldScale`, which is the one rate
  // the whole map is drawn at, so a range centred on 1 means "this prop, at world scale, give or
  // take". These used to be sizes in their own right — forest ran 0.7–1.45 on top of a separate
  // `tileSize / 24`, which is how a wood ended up drawn at three times the scale of the same tree
  // beside a village. Kept deliberately narrow: variety in a wood comes from *how many* and where,
  // and a range wide enough to be a second scale is exactly the fault this is fixing.
  plains: { count: [6, 11], kinds: ['tuft', 'tuft', 'tuft', 'tree'], scale: [0.85, 1.1] },
  fields: { count: [0, 2], kinds: ['tree', 'tuft', 'farmer'], scale: [0.85, 1.05] },
  riceFields: { count: [0, 1], kinds: ['tree', 'tuft'], scale: [0.9, 1.05] },
  forest: { count: [4, 7], kinds: ['tree', 'tree', 'tree', 'bamboo', 'banana'], scale: [0.85, 1.2] },
  hills: { count: [2, 4], kinds: ['tree', 'tree', 'tuft'], scale: [0.85, 1.1] },
  // Bushes only. A full tree becomes an accidental ruler beside a range and breaks the illusion
  // as soon as the plate is scaled; low scrub keeps the foot alive without competing with it.
  mountains: { count: [1, 2], kinds: ['bush'], scale: [0.8, 1.05] },
};

/** Roughly how much ground each scattered thing needs to itself, in units of the world scale. */
const FOOTPRINT: Record<PropKind, number> = {
  tree: 11,
  bush: 4,
  banyan: 20,
  bamboo: 9,
  banana: 7,
  areca: 6,
  farmer: 4,
  tuft: 3,
};

/** Plants tall enough to read as a tree line rather than low ground texture. */
const TALL_VEGETATION = new Set<PropKind>(['tree', 'banyan', 'bamboo', 'banana', 'areca']);

/**
 * Conservative visible boxes in map-tile units. These include the authored canvas padding and
 * procedural lean, so a crown cannot hang into a mountain even when its trunk is outside it.
 */
const TALL_VEGETATION_BOX: Partial<Record<PropKind, { halfWidth: number; height: number }>> = {
  tree: { halfWidth: 0.34, height: 0.72 },
  bamboo: { halfWidth: 0.5, height: 0.86 },
  banana: { halfWidth: 0.42, height: 0.56 },
  areca: { halfWidth: 0.34, height: 0.9 },
  banyan: { halfWidth: 0.8, height: 1.08 },
};

interface ScatterItem {
  x: number;
  y: number;
  kind: PropKind;
  scale: number;
  seed: number;
  /** Terrain that planted the item, retained for scale/content audits. */
  terrain: HexTerrainType;
}

/** Width of one relief lookup bucket, in world pixels. About two tiles. */
const RELIEF_BUCKET = 64;

/** A karst is a terrain landmark, not a house-sized prop. Values are in map tile radii. */
export const KARST_SCALE = Object.freeze({
  // The former 2.55 + 0.46 per back row could reach 4.39 tiles high: one deep mountain band
  // occupied most of a portrait screen. Depth still matters, but it now saturates as a range.
  baseHeight: 1.72,
  depthHeight: 0.2,
  maxHeight: 2.32,
  minimumPlateAspect: 1.55,
});

const PADDY_SYSTEM_STATES = ['flooded', 'fallow', 'transplanted', 'ripe', 'nursery'] as const;
type PaddySystemState = (typeof PADDY_SYSTEM_STATES)[number];

interface PaddySystemCell {
  x: number;
  y: number;
  q: number;
  r: number;
}

export interface PaddySystemPlan {
  x: number;
  y: number;
  width: number;
  height: number;
  seed: number;
  stage: number;
}

/**
 * Thins paddy cells into field *systems*, preferring well-supported interior cells.
 *
 * One ImageGen compound already contains ten joined parcels. Stamping it once per old procedural
 * plot turns it straight back into hundreds of disconnected cards, so the grouping and its scale
 * are part of the art contract rather than a renderer afterthought.
 */
export function planPaddySystems(cells: readonly PaddySystemCell[], tileSize: number): PaddySystemPlan[] {
  const occupied = new Set(cells.map((cell) => `${cell.q},${cell.r}`));
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const;
  const candidates = cells.map((cell) => {
    const support = neighbours.reduce(
      (count, [dq, dr]) => count + Number(occupied.has(`${cell.q + dq},${cell.r + dr}`)),
      0,
    );
    const seed = ((Math.imul(cell.q, 73856093) ^ Math.imul(cell.r, 19349663)) >>> 0);
    return { ...cell, support, seed };
  }).sort((a, b) => b.support - a.support || a.seed - b.seed);

  const plans: PaddySystemPlan[] = [];
  const spacing = tileSize * 2.65;
  for (const candidate of candidates) {
    if (plans.some((plan) => (plan.x - candidate.x) ** 2 + (plan.y - candidate.y) ** 2 < spacing ** 2)) {
      continue;
    }
    const widthTiles = candidate.support >= 5 ? 2.9
      : candidate.support >= 3 ? 2.45
        : candidate.support >= 1 ? 1.9 : 1.5;
    const width = tileSize * widthTiles;
    plans.push({
      x: candidate.x,
      y: candidate.y,
      width,
      height: width * 0.5,
      seed: candidate.seed,
      stage: (candidate.seed % 1009) / 1009,
    });
  }
  return plans.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** One visible cell, kept so the seasonal ground cast can be re-laid without re-walking the map. */
interface GroundCell {
  x: number;
  y: number;
  terrain: HexTerrainType;
}

interface PlannedRelief extends ReliefPlan {
  artId: string;
  terrain: 'mountains' | 'hills';
}

/** True when any tall part of a plant would enter an authored mountain plate. */
function touchesMountainRelief(
  item: ScatterItem,
  tileSize: number,
  relief: readonly PlannedRelief[],
): boolean {
  const box = TALL_VEGETATION_BOX[item.kind];
  if (!box) return false;
  const halfWidth = tileSize * box.halfWidth * item.scale;
  const topY = item.y - tileSize * box.height * item.scale;
  return relief.some((plan) => plan.terrain === 'mountains'
    && item.x + halfWidth >= plan.bounds.x0
    && item.x - halfWidth <= plan.bounds.x1
    && item.y >= plan.bounds.topY
    && topY <= plan.bounds.footY);
}

export class DongHoMapRenderer implements MapRenderer {
  /** Where every scattered prop stands, kept so a season change can repaint without replanting. */
  private scatterPlan?: ScatterItem[];
  /** Where every massif and ridge stands. Sorted in with the props, not under them. */
  private reliefPlan?: PlannedRelief[];
  /** The same ranges bucketed by x, for the occlusion question live objects have to ask. */
  private readonly reliefIndex = new Map<number, PlannedRelief[]>();
  /** Relief plans whose authored texture was unavailable when the landscape plan was built. */
  private readonly proceduralRelief = new Set<PlannedRelief>();
  /** The cells the cast is laid on, in draw order. Same lifetime as the plan. */
  private groundPlan?: GroundCell[];
  private scatterTileSize = 0;
  /** Authored scatter is scene-level so it can retain alpha and be flattened by the existing bake. */
  private generatedDecoration: Phaser.GameObjects.Image[] = [];
  private previousDecoration = new Map<string, Phaser.GameObjects.Image>();
  /** Low-alpha authored texture plates under the procedural coast and bund geometry. */
  private generatedTerrain: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    readonly theme: MapThemeDefinition,
  ) {}

  get palette(): MapThemePalette {
    return this.theme.palette;
  }

  // ── the wide hook: this renderer owns terrain entirely ──────────────────────

  drawLandscape(ctx: LandscapeContext): void {
    for (const _ of this.drawLandscapeJobs(ctx)) { /* initial construction */ }
  }

  *drawLandscapeJobs(ctx: LandscapeContext): Generator<void> {
    const { graphics, decoration, tiles, tileSize, isVisible } = ctx;
    const visible = tiles.filter((tile) => isVisible(tile));
    if (visible.length === 0) {
      return;
    }
    for (const image of this.generatedTerrain) image.destroy();
    this.generatedTerrain = [];

    // Flat ground only, in the terrain layer: tone, water, and the paddy, which IS the ground.
    //
    // The relief is no longer painted here. A massif inked into this layer sits below every tree
    // and every field on the map, so it can only ever be painted over — which is precisely how a
    // wood ends up growing out of a cliff face and a rice terrace ends up halfway up one. It is
    // planned here and drawn with the props, in one back-to-front order.
    yield* this.paintGround(graphics, visible, ctx);
    yield* this.paintWater(graphics, visible, ctx);
    yield* this.paintFields(graphics, visible, ctx);

    this.reliefPlan = yield* this.planRanges(visible, ctx);
    this.scatterPlan = yield* this.planScatter(visible, ctx, tileSize);
    this.groundPlan = visible.map((tile) => ({ ...ctx.centreOf(tile), terrain: tile.terrain }));
    this.scatterTileSize = tileSize;
    yield* this.repaintScatterJobs(decoration);
  }

  /**
   * Re-inks the seasonal half of the map, in whatever season `foliagePalette()` now names.
   *
   * The calendar turns every couple of economy ticks; the ground fill under it turns only when a
   * province changes hands. Redrawing the whole landscape for a change of leaf colour was measured
   * at ~1.5 s and is what kept the map's look pinned to one season for so long. This repaints the
   * one layer that actually differs and leaves the other four passes alone.
   *
   * The plan — where every prop stands, how big, which kind — is *not* recomputed. Positions must not
   * move when the leaves turn, or autumn would replant the country; and the placement pass (scatter
   * generation plus the spacing thin) is the expensive half. It is rebuilt by `drawLandscape` alone,
   * which runs exactly when the positions are genuinely stale.
   */
  repaintScatter(decoration: Phaser.GameObjects.Graphics): void {
    if (!this.scatterPlan) {
      return;
    }
    this.paintDecoration(decoration);
  }

  /**
   * The decoration layer, whole: the season's tone on the ground, then everything standing in it.
   *
   * Both halves live here because both turn with the calendar and neither may be a live `Graphics`
   * above the bake — a layer that re-submits a few hundred tessellated ground circles *per frame*
   * was measured at three times the per-tick cost of the whole map (50 ms -> 161 ms). Drawn into the
   * decoration layer instead, it is composited into the cached texture and costs nothing per frame;
   * it also lands *under* the props and above the terrain fill, which is the only place a tone can
   * sit without washing over the roofs and the water like the full-screen filter this replaced.
   */
  private paintDecoration(decoration: Phaser.GameObjects.Graphics): void {
    for (const _ of this.repaintScatterJobs(decoration)) { /* synchronous initial construction */ }
  }

  *repaintScatterJobs(decoration: Phaser.GameObjects.Graphics): Generator<void> {
    this.previousDecoration = new Map([...this.previousDecoration.values(), ...this.generatedDecoration].filter(image => !!image.scene).map(image => [image.getData('decorationKey') as string, image]));
    this.generatedDecoration = [];
    decoration.clear();
    const size = this.scatterTileSize;
    for (const cell of this.groundPlan ?? []) {
      const cast = groundCast(cell.terrain);
      if (!cast) {
        continue;
      }
      // Wide and many-ringed on purpose. `groundTone` blends by overlapping its falloff with the
      // neighbouring cells', and at the alpha this layer needs, a cell-sized radius over five rings
      // left visible concentric bands and a hard inner disc — the hex grid leaking back into the
      // picture, which is the one thing this renderer exists to avoid. Ten rings reaching well past
      // the neighbours is a smooth gradient; it costs ~2400 fills over a visible map, paid once per
      // season inside the bake and never per frame.
      groundTone(decoration, cell.x, cell.y, size * 1.75, cast.colour, cast.alpha, 10);
      yield;
    }
    yield* this.drawStanding(decoration, size);
    for (const image of this.previousDecoration.values()) image.destroy();
    this.previousDecoration.clear();
  }

  /**
   * Everything that stands up off the ground, drawn far to near — rock and trees in one order.
   *
   * This is the whole of the view logic. A thing is in front of another thing when its feet are
   * lower down the sheet, and the thing in front is drawn last. So a wood standing north of a
   * massif goes down first and the limestone is laid over the top of it: hidden, because that is
   * what standing behind a mountain looks like. A wood standing south of it is drawn after the
   * rock and covers its foot: visible, because that is what standing in front of one looks like.
   *
   * What was here before was not a sort at all. Relief went into the terrain layer, props went
   * into this one, and layers do not care where anything stands — so every tree on the map was in
   * front of every mountain on the map, including the ones a mile behind it. That is the defect,
   * and no amount of moving trees around fixes it, because the trees were never in the wrong place;
   * the order was.
   */
  private *drawStanding(decoration: Phaser.GameObjects.Graphics, size: number): Generator<void> {
    const unit = worldScale(size);
    const relief = this.reliefPlan ?? [];
    const props = this.scatterPlan ?? [];
    // Both lists arrive already sorted by their own foot line, so this is a merge, not a sort.
    let next = 0;
    for (const plan of relief) {
      while (next < props.length && props[next].y <= plan.footY) {
        if (!this.drawAuthoredProp(props[next], unit)) this.drawProp(decoration, props[next], unit);
        next += 1; yield;
      }
      if (!this.drawAuthoredRelief(plan)) plan.draw(decoration);
      yield;
    }
    for (; next < props.length; next += 1) {
      if (!this.drawAuthoredProp(props[next], unit)) this.drawProp(decoration, props[next], unit);
      yield;
    }
  }

  private reuseDecoration(key: string, stamp: import('./ink/stamp').Stamp, x: number, y: number, scale = 1): Phaser.GameObjects.Image {
    const old = this.previousDecoration.get(key); this.previousDecoration.delete(key);
    if (old) { applyStamp(old, stamp, scale); return old.setPosition(x, y); }
    return placeStamp(this.scene, stamp, x, y, scale).setData('decorationKey', key);
  }

  private drawAuthoredRelief(plan: PlannedRelief): boolean {
    const width = Math.max(12, plan.bounds.x1 - plan.bounds.x0);
    const height = Math.max(8, plan.bounds.footY - plan.bounds.topY);
    const stamp = conquestArtStamp(this.scene, plan.artId, {
      left: -width / 2, right: width / 2, top: -height, bottom: 0,
    });
    if (!stamp) return false;
    const key = `relief:${plan.artId}:${plan.bounds.x0}:${plan.footY}`;
    const image = this.reuseDecoration(key, stamp, (plan.bounds.x0 + plan.bounds.x1) / 2, plan.footY)
      .setData('conquestReliefArt', plan.artId)
      // A massif sorts against the towns as well as against the trees — see `groundDepth`. The
      // flag is what keeps it live alongside them on a tier that does not bake settlement ink.
      .setData('conquestGroundOrder', 'relief');
    if (plan.artId.startsWith('terrain.karst-')) {
      const tint = mountainWeatherTint();
      image.setTint(tint)
        .setData('conquestMountainWeather', getFoliageSeason())
        .setData('conquestMountainTint', tint);
    }
    // **Sorted on its ink, not on the box it was fitted into.** `plan.footY` is where the range
    // was *planned* to stand; where the drawing's feet actually land is a property of the PNG.
    // A soft ridge's ink ends a median 13 units below its plan and a seven-spire karst's 9 above
    // it, so half the relief on the map was sorting a stride away from its own base. See
    // `inkFoot` for the measurements.
    image.setDepth(groundDepth(stampFootY(image)));
    this.generatedDecoration.push(image);
    return true;
  }

  /** Keeps the old scatter plan and foot sorting; only the final mark changes from paths to PNG. */
  private drawAuthoredProp(item: ScatterItem, unit: number): boolean {
    // Authored relief is a scene-level Image too, so its foot-line depth interleaves correctly with
    // authored plants: a tree behind a PNG massif is baked first and the massif covers it. Only a
    // genuinely missing/corrupt relief texture still draws into the shared procedural Graphics;
    // an authored Image cannot sit behind that one indivisible buffer, so retain the old mark for
    // that exceptional fallback instead of mixing procedural trees into the normal authored map.
    if (this.isBehindProceduralRelief(item.x, item.y)) return false;
    // Mountain scrub is code-native so it remains crisp across the plate's whole scale range and
    // can take winter snow. It must never fall through to a missing `flora.bush.*` lookup.
    if (item.kind === 'bush') return false;
    const season = getFoliageSeason().toLowerCase();
    const id = item.kind === 'farmer'
      ? 'life.farmer'
      : item.kind === 'tree'
        ? conquestTreeArtId(season as 'spring' | 'summer' | 'autumn' | 'winter', item.seed)
        : `flora.${item.kind === 'tuft' ? 'grass' : item.kind}.${season}`;
    const stamp = conquestArtStamp(this.scene, id);
    if (!stamp) return false;
    const scaleKind = item.kind === 'tuft' ? 'grassTuft' : item.kind;
    void unitScale(scaleKind, item.scale * unit);
    const image = this.reuseDecoration(`prop:${item.kind}:${item.seed}:${item.x}:${item.y}`, stamp, item.x, item.y, item.scale * unit)
      .setAlpha(0.96)
      .setFlipX((item.seed & 1) === 1)
      .setData('conquestScatterArt', id)
      .setData('conquestGroundOrder', 'scatter');
    // Redraws can change clear bottom padding. Sort on the actual root/foot ink, as relief does.
    image.setDepth(groundDepth(stampFootY(image)));
    this.generatedDecoration.push(image);
    return true;
  }

  /**
   * Water, as one body rather than as a hexagon of blue.
   *
   * Blended tone gives the sheet of water; the shoreline is then found by looking for cells whose
   * neighbour is dry, and inked along those — so the coast is a drawn edge, not the boundary of a
   * fill. Flow lines run inside, never across it.
   */
  private *paintWater(graphics: Phaser.GameObjects.Graphics, tiles: LandscapeContext['tiles'], ctx: LandscapeContext): Generator<void> {
    const wet = new Set<string>();
    for (const tile of tiles) {
      yield;
      if (tile.terrain === 'water') {
        wet.add(`${tile.coord.q},${tile.coord.r}`);
      }
    }
    if (wet.size === 0) {
      return;
    }

    for (const tile of tiles) {
      yield;
      if (tile.terrain !== 'water') {
        continue;
      }
      const centre = ctx.centreOf(tile);
      groundTone(graphics, centre.x, centre.y, ctx.tileSize * 1.15, PIGMENT.chamWash, 0.5);
    }

    const rand = mulberry32(4400);
    for (const tile of tiles) {
      yield;
      if (tile.terrain !== 'water') {
        continue;
      }
      const centre = ctx.centreOf(tile);
      const { q, r } = tile.coord;
      // Only a cell with a dry neighbour is on the shore, so the ink follows the water's real edge.
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
      for (const [dq, dr] of neighbours) {
      yield;
        if (wet.has(`${q + dq},${r + dr}`)) {
          continue;
        }
        const away = ctx.centreAt(q + dq, r + dr);
        const mx = (centre.x + away.x) / 2;
        const my = (centre.y + away.y) / 2;
        const nx = -(away.y - centre.y);
        const ny = away.x - centre.x;
        const length = Math.hypot(nx, ny) || 1;
        const reach = ctx.tileSize * 0.55;
        inkPath(
          graphics,
          [
            { x: mx - (nx / length) * reach, y: my - (ny / length) * reach },
            { x: mx + (nx / length) * reach, y: my + (ny / length) * reach },
          ],
          Math.round(mx + my * 3),
          { width: 1.1, alpha: 0.62, colour: PIGMENT.cham, wobble: 1.8, step: 12 },
        );
      }
      // Two curved carved marks per cell, kept inside the continuous water body.
      for (let line = 0; line < 2; line += 1) {
      yield;
        const oy = centre.y + (rand() - 0.5) * ctx.tileSize * 0.7;
        const half = ctx.tileSize * (0.2 + rand() * 0.28);
        inkPath(
          graphics,
          [
            { x: centre.x - half, y: oy },
            { x: centre.x - half * 0.4, y: oy - 1.6 },
            { x: centre.x + half * 0.25, y: oy + 1.2 },
            { x: centre.x + half, y: oy },
          ],
          Math.round(centre.x + oy + line),
          { width: 0.8, alpha: 0.48, colour: PIGMENT.cham, wobble: 0.45, step: 9 },
        );
      }
    }
  }

  /**
   * Soft radial tone per cell, so neighbours overlap into one continuous field of colour.
   * A hex-shaped fill here is exactly how the grid leaks back into the picture.
   */
  private *paintGround(graphics: Phaser.GameObjects.Graphics, tiles: LandscapeContext['tiles'], ctx: LandscapeContext): Generator<void> {
    for (const tile of tiles) {
      yield;
      const tone = groundFor(tile.terrain);
      if (!tone) {
        continue;
      }
      const centre = ctx.centreOf(tile);
      const variance = ((tile.coord.q * 7 + tile.coord.r * 13) % 5) * 0.022;
      groundTone(graphics, centre.x, centre.y, ctx.tileSize * 1.05, tone, 0.12 + variance);
    }
  }

  /**
   * A run of mountain or hill cells becomes ONE range spanning the whole run, bleeding past its
   * cells. Never a peak per tile — that is what produced a picket fence of identical summits.
   *
   * Resolves geometry only, and hands back the ranges sorted by their foot line, so they can be
   * merged into the same far-to-near order as the props — see `drawStanding`.
   */
  private *planRanges(tiles: LandscapeContext['tiles'], ctx: LandscapeContext): Generator<void, PlannedRelief[]> {
    const plans: PlannedRelief[] = [];
    const relief = new Map<string, HexTerrainType>();
    const wet = new Set<string>();
    for (const tile of tiles) {
      yield;
      if (tile.terrain === 'mountains' || tile.terrain === 'hills') {
        relief.set(`${tile.coord.q},${tile.coord.r}`, tile.terrain);
      } else if (tile.terrain === 'water') {
        wet.add(`${tile.coord.q},${tile.coord.r}`);
      }
    }
    // A hex row below this one, in the pointy-top axial layout used by the map.
    const below = (q: number, r: number): HexTerrainType | undefined => relief.get(`${q},${r + 1}`) ?? relief.get(`${q - 1},${r + 1}`);
    /** How many rows of the same relief stand behind this one — the massif's depth. */
    const depthBehind = (q: number, r: number): number => {
      let depth = 0;
      let cursor = { q, r };
      while (depth < 4) {
        const back = relief.get(`${cursor.q},${cursor.r - 1}`) ? { q: cursor.q, r: cursor.r - 1 }
          : relief.get(`${cursor.q + 1},${cursor.r - 1}`) ? { q: cursor.q + 1, r: cursor.r - 1 }
            : undefined;
        if (!back) break;
        cursor = back;
        depth += 1;
      }
      return depth;
    };

    /**
     * Keeps a range from painting through a settlement in the neighbouring cell.
     *
     * Relief and settlements are rendered in different layers and cannot truly depth-sort. The
     * old range therefore bled straight through a capital flag or mine machinery. Split the
     * authored plate around the measured settlement clearance instead. Mountain cells remain on
     * both sides; only the impossible overlap is omitted.
     */
    const safeSegments = (
      x0: number,
      x1: number,
      baseY: number,
      height: number,
    ): Array<[number, number]> => {
      let segments: Array<[number, number]> = [[x0, x1]];
      for (const anchor of ctx.settlementAnchors) {
        const radius = anchor.r ?? ctx.tileSize * 1.2;
        const overlapsVertically = anchor.y + radius * 0.42 >= baseY - height * 1.18
          && anchor.y - radius * 0.42 <= baseY + height * 0.18;
        if (!overlapsVertically) continue;
        const cutLeft = anchor.x - radius * 0.72;
        const cutRight = anchor.x + radius * 0.72;
        segments = segments.flatMap(([left, right]) => {
          if (cutRight <= left || cutLeft >= right) return [[left, right]];
          const pieces: Array<[number, number]> = [];
          if (cutLeft - left >= ctx.tileSize * 0.72) pieces.push([left, cutLeft]);
          if (right - cutRight >= ctx.tileSize * 0.72) pieces.push([cutRight, right]);
          return pieces;
        });
      }
      return segments;
    };

    const byRow = new Map<number, Array<{ q: number; terrain: HexTerrainType }>>();
    for (const tile of tiles) {
      yield;
      if (tile.terrain !== 'mountains' && tile.terrain !== 'hills') {
        continue;
      }
      // Only the FRONT face of a massif is drawn. Painting every row produces stacked bands of
      // identical peaks — the banding that made the first pass read as a picket fence.
      if (below(tile.coord.q, tile.coord.r) === tile.terrain) {
        continue;
      }
      const row = byRow.get(tile.coord.r) ?? [];
      row.push({ q: tile.coord.q, terrain: tile.terrain });
      byRow.set(tile.coord.r, row);
    }

    for (const [r, row] of byRow) {
      yield;
      row.sort((a, b) => a.q - b.q);
      let index = 0;
      while (index < row.length) {
        const terrain = row[index].terrain;
        let end = index;
        while (end + 1 < row.length && row[end + 1].q === row[end].q + 1 && row[end + 1].terrain === terrain) {
          end += 1;
        }
        const from = ctx.centreAt(row[index].q, r);
        const to = ctx.centreAt(row[end].q, r);
        const seed = Math.round(from.x * 3 + from.y);
        // A deeper massif stands taller, so a range reads as a body of rock rather than a wall.
        const depth = depthBehind(row[index].q, r);

        // A range deliberately bleeds past the cells it was built from, which is what stops it
        // reading as one peak per tile. Against water that bleed put whole massifs lying across
        // the channel, so each end is pulled back in when the cell beyond it is wet, and the
        // massif is kept short when the rows it would rise over are water.
        const bleedLeft = wet.has(`${row[index].q - 1},${r}`) ? 0.12 : 1.1;
        const bleedRight = wet.has(`${row[end].q + 1},${r}`) ? 0.12 : 1.1;
        let risesOverWater = false;
        for (let q = row[index].q; q <= row[end].q && !risesOverWater; q += 1) {
      yield;
          // The two cells a pointy-top hex sits under, one row back.
          if (wet.has(`${q},${r - 1}`) || wet.has(`${q + 1},${r - 1}`)) {
            risesOverWater = true;
          }
        }
        const headroom = risesOverWater ? 0.45 : 1;

        const baseY = from.y + ctx.tileSize * (terrain === 'mountains' ? 0.8 : 0.7);
        const height = ctx.tileSize * (terrain === 'mountains'
          ? Math.min(
            KARST_SCALE.maxHeight,
            KARST_SCALE.baseHeight + depth * KARST_SCALE.depthHeight,
          ) * headroom
          : (0.42 + depth * 0.12) * headroom);
        let x0 = from.x - ctx.tileSize * bleedLeft;
        let x1 = to.x + ctx.tileSize * bleedRight;
        if (terrain === 'mountains') {
          // `conquestArtStamp` preserves aspect ratio. The old single-cell box was only 2.2 tiles
          // wide, so width won the fit and silently reduced a requested 1.78-tile mountain to
          // 1.47 tiles high. Give the planned/occluding bounds the same minimum aspect as the PNG;
          // the image, culling box and live-object occluder now grow together.
          const missing = Math.max(0, height * KARST_SCALE.minimumPlateAspect - (x1 - x0));
          const dryLeft = bleedLeft > 0.2;
          const dryRight = bleedRight > 0.2;
          if (dryLeft && dryRight) {
            x0 -= missing / 2;
            x1 += missing / 2;
          } else if (dryLeft) {
            x0 -= missing;
          } else if (dryRight) {
            x1 += missing;
          }
        }
        for (const [segmentStart, segmentEnd] of safeSegments(x0, x1, baseY, height)) {
      yield;
          if (terrain === 'mountains') {
            plans.push(Object.assign(planKarstRange(
              segmentStart, segmentEnd, baseY, height, seed + Math.round(segmentStart),
            ), {
              artId: conquestKarstArtId(seed + Math.round(segmentStart)),
              terrain: 'mountains' as const,
            }));
          } else {
            plans.push(Object.assign(planSoftRidge(
              segmentStart, segmentEnd, baseY, height, seed + Math.round(segmentStart),
            ), { artId: 'terrain.soft-ridge' as const, terrain: 'hills' as const }));
          }
        }
        index = end + 1;
      }
    }
    // Far to near. `byRow` is keyed by hex row but iterates in insertion order, which is tile
    // order and guarantees nothing about which range is in front of which.
    plans.sort((a, b) => a.footY - b.footY);
    this.indexRelief(plans);
    return plans;
  }

  /**
   * Buckets the relief by x so `isBehindRelief` is a couple of box tests rather than a walk of
   * every massif on the map. Asked once per moving thing per frame, so it has to be cheap.
   */
  private indexRelief(plans: PlannedRelief[]): void {
    this.reliefIndex.clear();
    this.proceduralRelief.clear();
    for (const plan of plans) {
      // Resolve once per range, not once per scattered prop. The asset check includes the rollback
      // switch and texture lookup, while this index is consulted thousands of times per repaint.
      if (!hasConquestMapArt(this.scene, plan.artId)) this.proceduralRelief.add(plan);
      const first = Math.floor(plan.bounds.x0 / RELIEF_BUCKET);
      const last = Math.floor(plan.bounds.x1 / RELIEF_BUCKET);
      for (let bucket = first; bucket <= last; bucket += 1) {
        const list = this.reliefIndex.get(bucket);
        if (list) {
          list.push(plan);
        } else {
          this.reliefIndex.set(bucket, [plan]);
        }
      }
    }
  }

  /**
   * Is the rock between this point and the viewer?
   *
   * The baked layers settle this by draw order — see `drawStanding`. Carts, travellers and hosts
   * are scene objects living above the whole cached map image and can never join that order, so
   * they ask this instead and hide while they are behind a massif. Walking up a cliff face was the
   * same fault as a tree growing out of one; it just could not be fixed the same way.
   */
  isBehindRelief(x: number, y: number): boolean {
    const plans = this.reliefIndex.get(Math.floor(x / RELIEF_BUCKET));
    if (!plans) {
      return false;
    }
    return plans.some((plan) => plan.occludes(x, y));
  }

  /** True only when the occluding relief itself must use the shared procedural Graphics layer. */
  private isBehindProceduralRelief(x: number, y: number): boolean {
    const plans = this.reliefIndex.get(Math.floor(x / RELIEF_BUCKET));
    if (!plans) {
      return false;
    }
    return plans.some((plan) => (
      this.proceduralRelief.has(plan) && plan.occludes(x, y)
    ));
  }

  /**
   * One wandering lattice across the whole map; a plot is kept only where the land beneath it is
   * paddy. Neighbouring cells therefore share their bunds and the field system ends raggedly —
   * which is what a delta looks like from above, and the opposite of a field per tile.
   */
  private *paintFields(graphics: Phaser.GameObjects.Graphics, tiles: LandscapeContext['tiles'], ctx: LandscapeContext): Generator<void> {
    const paddy = tiles.filter((tile) => tile.terrain === 'riceFields' || tile.terrain === 'fields');
    if (paddy.length === 0) {
      return;
    }

    const cells = paddy.map((tile) => {
      const centre = ctx.centreOf(tile);
      return { ...centre, q: tile.coord.q, r: tile.coord.r };
    });
    const systems = planPaddySystems(cells, ctx.tileSize);
    const familyLoaded = PADDY_SYSTEM_STATES.every((state) => (
      hasConquestMapArt(this.scene, `terrain.paddy-system-${state}`)
    ));
    if (familyLoaded) {
      const firstImage = this.generatedTerrain.length;
      let complete = true;
      for (const system of systems) {
        yield;
        const stage = seasonalStage(system.stage);
        const state: PaddySystemState = stage < 0.28 ? 'flooded'
          : stage < 0.4 ? 'fallow'
            : stage > 0.9 ? 'nursery'
              : stage > 0.68 ? 'ripe' : 'transplanted';
        if (!this.placeTerrainPlate(
          `terrain.paddy-system-${state}`,
          system.x,
          system.y,
          system.width,
          system.height,
          0.94,
          system.seed,
        )) {
          complete = false;
          break;
        }
      }
      if (complete) return;

      // Treat the connected plate family atomically. A corrupt state must not leave half authored,
      // half procedural field systems or muddy the fallback by drawing both in the same place.
      while (this.generatedTerrain.length > firstImage) {
        this.generatedTerrain.pop()?.destroy();
      }
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const centres: Array<{ x: number; y: number }> = [];
    for (const tile of paddy) {
      yield;
      const centre = ctx.centreOf(tile);
      centres.push(centre);
      minX = Math.min(minX, centre.x);
      minY = Math.min(minY, centre.y);
      maxX = Math.max(maxX, centre.x);
      maxY = Math.max(maxY, centre.y);
    }
    // How far past a paddy cell's own centre the field system is allowed to spread.
    //
    // A hexagon of circumradius `tileSize` has inradius `0.866 · tileSize`, so this is the *floor*
    // for covering a cell fully — go under it and holes open in the middle of the paddy. It used to
    // be 0.94, and a disc that wide has more area than the hexagon it stands for, so the painted
    // paddy came to ~110% of the paddy tiles and filled the concave gaps between neighbouring
    // cells as well. Just above the inradius keeps the cells covered and stops the spill.
    const reach = ctx.tileSize * 0.88;
    minX -= reach; minY -= reach; maxX += reach; maxY += reach;

    const nearPaddy = (x: number, y: number): boolean => {
      for (const centre of centres) {
        if ((centre.x - x) ** 2 + (centre.y - y) ** 2 < reach * reach) {
          return true;
        }
      }
      return false;
    };

    // The lattice is kept wherever paddy is *near*, which on a bank means the plots carry on over
    // the channel — a paddy cell one hex inland is still within reach of open water. Nobody floods
    // a bunded field on top of a river, so the water vetoes the plot the way the paddy grants it.
    const wetCentres: Array<{ x: number; y: number }> = [];
    for (const tile of tiles) {
      yield;
      if (tile.terrain === 'water') {
        wetCentres.push(ctx.centreOf(tile));
      }
    }
    // Vetoed on the plot's *body*, not its centre. `keep` is asked about a point, but a plot is
    // drawn `tileSize · 0.58` across, so testing the centre against the bank left half a paddy
    // lying in the channel — the same anchor-versus-body mistake the prop scatter made. Half a
    // plot's width past the water's own reach is what actually keeps the fields on land.
    const wetReach = reach + ctx.tileSize * 0.29;
    const overWater = (x: number, y: number): boolean => {
      for (const centre of wetCentres) {
        if ((centre.x - x) ** 2 + (centre.y - y) ** 2 < wetReach * wetReach) {
          return true;
        }
      }
      return false;
    };
    const keepPlot = (x: number, y: number): boolean => nearPaddy(x, y) && !overWater(x, y);

    // Missing, corrupt, unloaded, or explicitly disabled authored art falls back to the existing
    // shared procedural lattice. It is never drawn under a successfully authored compound.
    for (const plot of paddyLattice({
      x0: minX, x1: maxX, y0: minY, y1: maxY, cell: ctx.tileSize * 0.58, seed: 7777, keep: keepPlot,
    })) {
      drawFieldPlot(graphics, plot); yield;
    }
  }

  /** Places a texture inside an existing procedural patch; geometry and boundaries remain drawn. */
  private placeTerrainPlate(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha: number,
    seed: number,
  ): boolean {
    const stamp = conquestArtStamp(this.scene, id, {
      left: -width / 2, right: width / 2, top: -height / 2, bottom: height / 2,
    });
    if (!stamp) return false;
    const image = placeStamp(this.scene, stamp, x, y)
      .setDepth(0.15)
      .setAlpha(alpha)
      .setFlipX((seed & 1) === 1)
      .setData('conquestTerrainPlate', id);
    this.generatedTerrain.push(image);
    return true;
  }

  /**
   * Decides where everything stands. One scatter over the whole map: points drift past their own
   * cell on purpose, and the lot comes back sorted back-to-front so overlap reads as depth rather
   * than as z-fighting.
   *
   * Separate from the drawing so a change of season can repaint the props without moving them.
   */
  private *planScatter(
    tiles: LandscapeContext['tiles'],
    ctx: LandscapeContext,
    tileSize: number,
  ): Generator<void, ScatterItem[]> {
    const rand = mulberry32(2024);
    const density = scatterDensity();
    const items: ScatterItem[] = [];

    // Ground the scatter must leave alone: the seats, which draw their own groves and roofs, and
    // the limestone, whose faces are the drawing and not a place for trees to stand on.
    const keepClear: Array<{
      x: number; y: number; r: number; padByItem?: boolean; tallOnly?: boolean;
    }> = [];

    // Every settlement, not just the ones the generator happened to give fortress terrain. A farm,
    // a mine or a plain village renders through `addResourceCluster` on ordinary ground and was
    // getting trees planted through its roofs — and because settlements are live objects a whole
    // depth band above this baked layer, those trees can only ever draw *behind* the houses, even
    // the ones standing in front. Two layers that cannot share a sort must not share ground.
    for (const anchor of ctx.settlementAnchors) {
      yield;
      keepClear.push({ x: anchor.x, y: anchor.y, r: anchor.r ?? tileSize * 1.2 });
    }

    for (const tile of tiles) {
      yield;
      if (tile.terrain === 'fortress' || tile.terrain === 'shrine') {
        const centre = ctx.centreOf(tile);
        keepClear.push({ x: centre.x, y: centre.y, r: tileSize * 1.5 });
      } else if (tile.terrain === 'mountains') {
        // The limestone is drawn as whole massifs spanning several cells, and a scatter point may
        // drift a full tile past its own cell — so trees from the hills next door were standing
        // halfway up a cliff face. Pad by the complete plant reach, but only for tall vegetation:
        // the low mountain bushes are meant to remain at the foot.
        const centre = ctx.centreOf(tile);
        keepClear.push({
          x: centre.x, y: centre.y, r: tileSize * 0.95, padByItem: true, tallOnly: true,
        });
      } else if (tile.terrain === 'water') {
        // Water keeps its own surface, for exactly the reason the rock does. A scatter point is
        // thrown up to 1.12 tile radii from its own centre against an inradius of 0.87, so about
        // two points in five land outside the cell that spawned them — and the bank is where the
        // trees are. Without this, a river through wooded country grows a wood in midstream.
        //
        // `padByItem` is what makes it actually work. Clearing the anchor alone still left canopies
        // hanging over the channel: a tree whose trunk sits 2 units outside the bank is drawn many
        // times wider than that. Water is the one surface where the overhang reads as wrong, so
        // here the test is against the prop's own reach rather than its centre.
        const centre = ctx.centreOf(tile);
        keepClear.push({ x: centre.x, y: centre.y, r: tileSize * 0.95, padByItem: true });
      }
    }

    for (const tile of tiles) {
      yield;
      const spec = SCATTER[tile.terrain];
      if (!spec) {
        continue;
      }
      const centre = ctx.centreOf(tile);
      // Density follows the graphics setting: the scatter is the largest single cost in the
      // landscape, and thinning it is what buys a playable frame on a weak device without taking
      // the drawing apart.
      const spread = spec.count[0] + Math.floor(rand() * (spec.count[1] - spec.count[0] + 1));
      const count = Math.max(spec.count[0] > 0 ? 1 : 0, Math.round(spread * density));
      for (let index = 0; index < count; index += 1) {
      yield;
        const angle = rand() * Math.PI * 2;
        const distance = Math.sqrt(rand()) * tileSize * 1.12;
        items.push({
          x: centre.x + Math.cos(angle) * distance,
          y: centre.y + Math.sin(angle) * distance * 0.92,
          kind: spec.kinds[Math.floor(rand() * spec.kinds.length)],
          scale: spec.scale[0] + rand() * (spec.scale[1] - spec.scale[0]),
          seed: (tile.coord.q * 7919 + tile.coord.r * 104729 + index * 3167) % 100000,
          terrain: tile.terrain,
        });
      }
    }

    // Thin what remains so no two things stand in the same spot. Every point is placed inside its
    // own cell with no idea what the neighbouring cell put down, and the result was trees growing
    // through each other and through roofs. Bigger things claim their ground first.
    const unit = tileSize / 24;
    const claimed: ScatterItem[] = [];
    const cell = tileSize;
    const buckets = new Map<string, ScatterItem[]>();
    const keyOf = (x: number, y: number): string => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
    // Keep the exact exclusion test, but only visit circles whose bounds reach the
    // candidate's crown. Distant settlements/water cannot affect this point.
    const clearCells = new Map<string, typeof keepClear>();
    for (const zone of keepClear) {
      for (let y = Math.floor((zone.y - zone.r) / cell); y <= Math.floor((zone.y + zone.r) / cell); y++) {
        for (let x = Math.floor((zone.x - zone.r) / cell); x <= Math.floor((zone.x + zone.r) / cell); x++) {
          const key = `${x}:${y}`, list = clearCells.get(key) ?? [];
          list.push(zone); clearCells.set(key, list);
        }
      }
      yield;
    }
    const bySize = [...items].sort(
      (a, b) => FOOTPRINT[b.kind] * b.scale - FOOTPRINT[a.kind] * a.scale,
    );
    for (const item of bySize) {
      yield;
      const reach = FOOTPRINT[item.kind] * item.scale * unit * 0.5;
      const isTallVegetation = TALL_VEGETATION.has(item.kind);
      const nearbyClear = new Set<(typeof keepClear)[number]>();
      for (let y = Math.floor((item.y - reach) / cell); y <= Math.floor((item.y + reach) / cell); y++) {
        for (let x = Math.floor((item.x - reach) / cell); x <= Math.floor((item.x + reach) / cell); x++) {
          for (const zone of clearCells.get(`${x}:${y}`) ?? []) nearbyClear.add(zone);
        }
      }
      if ([...nearbyClear].some((zone) => (!zone.tallOnly || isTallVegetation)
        && Math.hypot(item.x - zone.x, item.y - zone.y) < zone.r + (zone.padByItem ? reach : 0))) {
        continue;
      }
      // A neighbouring forest or hill may throw a point more than one cell from its source. Test
      // the whole visible crown against the final (possibly multi-cell) mountain plate, not just
      // the point at its feet. This is the rule that makes the visible result genuinely bush-only.
      if (isTallVegetation && touchesMountainRelief(item, tileSize, this.reliefPlan ?? [])) {
        continue;
      }
      let blocked = false;
      const cx = Math.floor(item.x / cell);
      const cy = Math.floor(item.y / cell);
      for (let ox = -1; ox <= 1 && !blocked; ox += 1) {
        for (let oy = -1; oy <= 1 && !blocked; oy += 1) {
          for (const other of buckets.get(`${cx + ox}:${cy + oy}`) ?? []) {
            const gap = reach + FOOTPRINT[other.kind] * other.scale * unit * 0.5;
            if (Math.hypot(item.x - other.x, item.y - other.y) < gap * 0.72) {
              blocked = true;
              break;
            }
          }
        }
      }
      if (blocked) {
        continue;
      }
      claimed.push(item);
      const key = keyOf(item.x, item.y);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        buckets.set(key, [item]);
      }
    }
    claimed.sort((a, b) => a.y - b.y);
    return claimed;
  }

  /**
   * Inks one planted thing. Called on every season change, so it does no placement work of its own.
   *
   * `unit` — the one rate the whole map is drawn at, the same call the settlements, the herds and
   * the hosts make — is passed in rather than derived here, because the caller is now walking rock
   * and plants together and must not recompute it per prop.
   */
  private drawProp(graphics: Phaser.GameObjects.Graphics, item: ScatterItem, unit: number): void {
    const s = item.scale * unit;
    switch (item.kind) {
      case 'tree':
        graphics.fillStyle(PIGMENT.muc, 0.07);
        graphics.fillEllipse(item.x, item.y, 14 * s, 4.2 * s);
        tree(graphics, item.x, item.y, s, item.seed);
        break;
      case 'bush': bush(graphics, item.x, item.y, s, item.seed); break;
      case 'tuft': grassTuft(graphics, item.x, item.y, s, item.seed); break;
      case 'bamboo': bamboo(graphics, item.x, item.y, s, item.seed); break;
      case 'banana': banana(graphics, item.x, item.y, s, item.seed); break;
      case 'areca': areca(graphics, item.x, item.y, s, item.seed); break;
      case 'banyan': banyan(graphics, item.x, item.y, s, item.seed); break;
      case 'farmer': farmer(graphics, item.x, item.y, s, item.seed); break;
      default: break;
    }
  }

  // ── the narrow per-hex API, kept so the interface stays satisfied ───────────

  drawBackground(worldWidth: number, worldHeight: number): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(PIGMENT.diep, 1);
    graphics.fillRect(0, 0, worldWidth, worldHeight);
    // Broad tea-staining so the sheet is never one flat tone. The fine fibre and shell grit come
    // from the tiled paper texture composited over this by the scene.
    const rand = mulberry32(31);
    for (let index = 0; index < 22; index += 1) {
      graphics.fillStyle(rand() > 0.45 ? PIGMENT.diepLo : PIGMENT.diepHi, 0.05 + rand() * 0.05);
      graphics.fillEllipse(
        rand() * worldWidth,
        rand() * worldHeight,
        220 + rand() * 520,
        180 + rand() * 420,
      );
    }
    return graphics;
  }

  /**
   * Off-map padding is bare paper under this theme.
   *
   * Deliberately a no-op: even a 16%-alpha hex fill out here draws a visible staircase of hexagons
   * along the world's edge, which is the one thing this whole renderer exists to avoid.
   */
  drawHexFill(_graphics: Phaser.GameObjects.Graphics, _corners: PixelPoint[], _color: number): void {
    void _graphics; void _corners; void _color;
  }

  /** Unused under this theme — `drawLandscape` owns decoration. Kept for interface compatibility. */
  decorateTerrain(): void {
    /* intentionally empty */
  }

  drawCloud(graphics: Phaser.GameObjects.Graphics, x: number, y: number, baseRadius: number, seed: number, alpha = 0.9): void {
    const rand = mulberry32(seed);
    for (let puff = 0; puff < 6; puff += 1) {
      const angle = rand() * Math.PI * 2;
      const distance = baseRadius * (0.2 + rand() * 0.5);
      graphics.fillStyle(PIGMENT.diepHi, alpha * 0.9);
      graphics.fillCircle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance * 0.7, baseRadius * (0.5 + rand() * 0.4));
    }
  }

  /**
   * A border, not a chain of hexagons. Enough wobble that the six-sided origin of each edge stops
   * being legible, which is the difference between a frontier and a honeycomb.
   */
  drawZoneBorder(
    graphics: Phaser.GameObjects.Graphics,
    edges: Array<[number, number, number, number]>,
    _color: number,
    alpha = 0.95,
  ): void {
    // The passed colour is the kingdom's hue, and this theme deliberately refuses it: a frontier is
    // drawn in ink like everything else, and WHOSE it is comes from the hatch angle and the seal.
    void _color;
    // Kept only for callers that have loose edges and no loops — `drawZoneContour` below is what
    // the map actually uses, and it is the one that closes the corners. Drawn dead straight here:
    // a wobble applied per edge cannot join up (see `MapRenderer.drawZoneContour`), so an
    // edge-at-a-time frontier is better off ruled than jittered.
    for (const [x1, y1, x2, y2] of edges) {
      inkPath(graphics, [{ x: x1, y: y1 }, { x: x2, y: y2 }], Math.round(x1 + y1 * 3 + x2 * 7), {
        width: 1.0, alpha: Math.min(0.34, alpha * 0.38), colour: PIGMENT.mucSoft, wobble: 0,
      });
    }
  }

  /**
   * The frontier, pulled as one continuous line per loop.
   *
   * The wobble is the point of the thing and it is also why this cannot be done edge by edge:
   * `wobblePath` displaces every node *except* the path's last, so each separately-inked hex edge
   * ended on its corner and the next one started as much as 5.5 units off it. Around a one-hex
   * province that is six visible steps — the "random lines behind the village" a player sees, and
   * the notch in the middle of an otherwise straight run.
   *
   * A shorter `step` than the old 30 as well: a hex edge is about 50 units, so at 30 the whole
   * frontier had one wobble node per side and came out a hard polygon anyway. At 12 the line
   * actually bends, which is what stops a border reading as a CAD outline dropped on a painting.
   */
  drawZoneContour(
    graphics: Phaser.GameObjects.Graphics,
    loops: Array<Array<Pt>>,
    _color: number,
    alpha = 0.95,
  ): void {
    void _color;
    for (const loop of loops) {
      if (loop.length < 3) {
        continue;
      }
      inkPath(graphics, loop, Math.round(loop[0].x + loop[0].y * 3), {
        width: 1.0,
        alpha: Math.min(0.34, alpha * 0.38),
        colour: PIGMENT.mucSoft,
        wobble: 2.2,
        step: 12,
        closed: true,
      });
    }
  }

  /**
   * Territory, hatched rather than filled. The ANGLE carries the faction — a second channel, so
   * ownership survives greyscale and colour blindness — and the player's rules are the one place
   * on the map besides their banner and seal where sỏi son is spent.
   */
  drawZoneFill(
    graphics: Phaser.GameObjects.Graphics,
    loops: Array<Array<{ x: number; y: number }>>,
    isPlayer: boolean,
    isNeutral: boolean,
  ): void {
    if (isNeutral) {
      return;
    }
    for (const loop of loops) {
      if (loop.length < 3) {
        continue;
      }
      hatchPoly(graphics, loop, isPlayer ? -0.65 : 0.75, 18, isPlayer ? PIGMENT.son : PIGMENT.mucSoft, isPlayer ? 0.06 : 0.05, 0.7);
    }
  }

  /**
   * The shore, as a soft band of sand rather than a ruled edge.
   *
   * The default draws an eighteen-pixel stroke straight along each hex edge, which outlines every
   * island in a perfect staircase of hexagons. Heavy wobble and a low alpha turn the same edges
   * into a beach.
   */
  /**
   * Unexplored ground is paper the chronicle has not reached yet — which is exactly right for this
   * treatment, and would be perfect if the boundary were not a staircase of hexagons.
   *
   * Two passes fix that without a mask: a wobbled polygon so no two cells share a straight cut, and
   * a soft radial halo that spills past the cell and blurs the frontier into the drawn land.
   */
  drawFogCell(
    graphics: Phaser.GameObjects.Graphics,
    centre: { x: number; y: number },
    corners: PixelPoint[],
    radius: number,
    explored: boolean,
  ): void {
    const alpha = explored ? 0.8 : 0.9;
    const rand = mulberry32(Math.round(centre.x * 3 + centre.y * 7));
    const torn: Pt[] = [];
    for (let index = 0; index < corners.length; index += 1) {
      const a = corners[index];
      const b = corners[(index + 1) % corners.length];
      for (let step = 0; step < 3; step += 1) {
        const t = step / 3;
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const length = Math.hypot(nx, ny) || 1;
        const push = (rand() - 0.35) * radius * 0.2;
        torn.push({ x: a.x + (b.x - a.x) * t + (nx / length) * push, y: a.y + (b.y - a.y) * t + (ny / length) * push });
      }
    }
    graphics.fillStyle(PIGMENT.diepHi, alpha);
    graphics.fillPoints(torn, true);
    // The halo is what actually kills the staircase: it reaches into the neighbours.
    groundTone(graphics, centre.x, centre.y, radius * 1.5, PIGMENT.diepHi, alpha * 0.55);
  }

  /**
   * Foreign ground: paper the chronicle has not been written on, not a blue slab.
   *
   * The default mutes a rival's land with a per-hex wash in a cool blue chosen to separate it by
   * hue — which is a honeycomb of a colour no pigment in this palette can make. Veiling the merged
   * region in paper says the same thing in the sheet's own terms: your land is the drawn part.
   */
  drawForeignWash(
    graphics: Phaser.GameObjects.Graphics,
    loops: Array<Array<{ x: number; y: number }>>,
    isNeutral: boolean,
    ownerColour: number,
  ): void {
    void ownerColour;
    for (const loop of loops) {
      if (loop.length < 3) {
        continue;
      }
      const rand = mulberry32(Math.round(loop[0].x * 5 + loop[0].y * 11));
      const veil: Pt[] = loop.map((point, index) => {
        const next = loop[(index + 1) % loop.length];
        const nx = -(next.y - point.y);
        const ny = next.x - point.x;
        const length = Math.hypot(nx, ny) || 1;
        const push = (rand() - 0.4) * 3;
        return { x: point.x + (nx / length) * push, y: point.y + (ny / length) * push };
      });
      graphics.fillStyle(PIGMENT.diep, isNeutral ? 0.62 : 0.5);
      graphics.fillPoints(veil, true);
      // A rival's ground still carries its own hatch angle, so two neighbours read apart.
      hatchPoly(graphics, veil, isNeutral ? 1.35 : 0.75, 18, PIGMENT.mucSoft, isNeutral ? 0.035 : 0.06, 0.7);
    }
  }

  /** The undrawn part of the chronicle, with a torn edge rather than a stepped one. */
  drawFogRegion(
    graphics: Phaser.GameObjects.Graphics,
    loops: Array<Array<{ x: number; y: number }>>,
    explored: boolean,
  ): void {
    const alpha = explored ? 0.86 : 0.95;
    for (const loop of loops) {
      if (loop.length < 3) {
        continue;
      }
      const rand = mulberry32(Math.round(loop[0].x * 7 + loop[0].y * 3));
      // Push each existing vertex a little along its own normal. Subdividing first, or pushing
      // harder, makes the polygon self-intersect and the fill sprouts ribbons across the paper.
      const torn: Pt[] = loop.map((point, index) => {
        const next = loop[(index + 1) % loop.length];
        const nx = -(next.y - point.y);
        const ny = next.x - point.x;
        const length = Math.hypot(nx, ny) || 1;
        const push = (rand() - 0.4) * 3.5;
        return { x: point.x + (nx / length) * push, y: point.y + (ny / length) * push };
      });
      graphics.fillStyle(PIGMENT.diepHi, alpha);
      graphics.fillPoints(torn, true);
    }
  }

  drawShoreEdge(graphics: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number): void {
    const seed = Math.round(x1 + y1 * 3 + x2 * 7);
    inkPath(graphics, [{ x: x1, y: y1 }, { x: x2, y: y2 }], seed, {
      width: 11, alpha: 0.2, colour: PIGMENT.diepDeep, wobble: 5.5, step: 22,
    });
    inkPath(graphics, [{ x: x1, y: y1 }, { x: x2, y: y2 }], seed + 5, {
      width: 1.1, alpha: 0.22, colour: PIGMENT.mucFaint, wobble: 4.5, step: 20,
    });
  }

  drawRoad(graphics: Phaser.GameObjects.Graphics, points: PixelPoint[], widthFrom: number, _widthTo: number): void {
    void _widthTo;
    if (points.length < 2) {
      return;
    }
    const seed = Math.round(points[0].x + points[0].y);
    const width = Math.max(1.5, widthFrom * 0.65);
    // Matching paths form a quiet ink edge around a flat ochre road plate.
    inkPath(graphics, points as Pt[], seed, {
      width: width + 0.6, alpha: 0.4, colour: PIGMENT.mucSoft, wobble: 0.7, step: 14,
    });
    inkPath(graphics, points as Pt[], seed, {
      width, alpha: 0.72, colour: PIGMENT.hoePale, wobble: 0.7, step: 14,
    });
  }

  /**
   * A timber footbridge — deck, two rails and its posts in the water.
   *
   * Ochre planks and warm-black rails match the printed timber assets. Slightly bowed:
   * a flat deck at this size reads as a plank dropped on the river rather than a thing built.
   */
  drawBridge(
    graphics: Phaser.GameObjects.Graphics,
    at: PixelPoint,
    angle: number,
    span: number,
    roadWidth: number,
  ): void {
    const half = Math.max(6, span * 0.5 + 3);
    const deckHalf = Math.max(2.4, roadWidth * 0.85);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Along the bridge, then across it.
    const along = (t: number): Pt => ({ x: at.x + cos * t, y: at.y + sin * t });
    const across = (p: Pt, d: number): Pt => ({ x: p.x - sin * d, y: p.y + cos * d });
    // The bow, lifted against the road's own direction of travel.
    const rise = (t: number): number => -Math.cos((t / half) * (Math.PI / 2)) * half * 0.16;
    const seed = Math.round(at.x + at.y * 3);

    const railPoints = (side: number): Pt[] => {
      const out: Pt[] = [];
      for (let step = -3; step <= 3; step += 1) {
        const t = (step / 3) * half;
        const base = across(along(t), side * deckHalf);
        out.push({ x: base.x, y: base.y + rise(t) });
      }
      return out;
    };

    // Posts first, so the deck sits on top of them.
    for (const t of [-half * 0.55, 0, half * 0.55]) {
      const foot = along(t);
      const head = { x: foot.x, y: foot.y + rise(t) - deckHalf * 0.15 };
      inkPath(graphics, [{ x: foot.x, y: foot.y + deckHalf * 1.1 }, head], seed + Math.round(t),
        { width: 1, alpha: 0.85, colour: PIGMENT.muc, wobble: 0.4, step: 6 });
    }

    // The deck: a filled span between the two rail lines, so the water does not show through it.
    const left = railPoints(-1);
    const right = railPoints(1);
    graphics.fillStyle(PIGMENT.hoePale, 0.95);
    graphics.beginPath();
    graphics.moveTo(left[0].x, left[0].y);
    for (const p of left.slice(1)) graphics.lineTo(p.x, p.y);
    for (const p of [...right].reverse()) graphics.lineTo(p.x, p.y);
    graphics.closePath();
    graphics.fillPath();

    // Planking, then the two rails over it.
    for (let step = -2; step <= 2; step += 1) {
      const t = (step / 2.4) * half;
      const p = along(t);
      const lift = rise(t);
      inkPath(graphics,
        [across({ x: p.x, y: p.y + lift }, -deckHalf), across({ x: p.x, y: p.y + lift }, deckHalf)],
        seed + step * 7, { width: 0.65, alpha: 0.65, colour: PIGMENT.muc, wobble: 0.25, step: 5 });
    }
    for (const rail of [left, right]) {
      inkPath(graphics, rail, seed + Math.round(rail[0].x),
        { width: 1.1, alpha: 0.85, colour: PIGMENT.muc, wobble: 0.4, step: 8 });
    }
  }
}

/** Exported for the item renderer, which paints the same wash under settlements. */
export function paperWash(graphics: Phaser.GameObjects.Graphics, points: Pt[], seed: number): void {
  washFill(graphics, points, PIGMENT.diepLo, seed, 0.4);
}

export { printedShape };
