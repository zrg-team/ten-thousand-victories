/**
 * Map overlay layers drawn above the terrain: per-land ownership borders, the
 * selection outline, and fog-of-war tiles with drifting ink-cloud puffs over
 * hidden districts. Pairs with the selected environment renderer for border/cloud styling and
 * `src/map/boundary.ts` for the underlying region geometry.
 */
import Phaser from 'phaser';
import { COLORS, NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../../game/constants';
import { traceLandBoundaryEdges, traceLandBoundaryLoops } from '../../map/boundary';
import type { HexTile } from '../../map/hexMapGenerator';
import { hashString } from '../../utils/math';
import type { GameState, Land } from '../../state/types';
import type { MapRenderer } from '../../ui/MapRenderer';
import { fitBakeScale } from '../../ui/ink/textureLimits';
import { placeStamp, stamp } from '../../ui/ink/stamp';
import { ChunkedMapLayer } from './ChunkedMapLayer';

type WorldTransform = (value: number) => number;
type OwnerColorLookup = (ownerId: string) => number;

export class OverlayRenderer {
  private zoneGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  /** Merged-region outlines, per land. Rebuilt with the zone layers, so ownership flips pick up. */
  private readonly boundaryLoopCache = new Map<string, Array<Array<{ x: number; y: number }>>>();
  private cloudGraphics = new Map<string, Phaser.GameObjects.Image>();
  /** Each cloud's drift loop, kept so the view index can stop one that has left the screen. */
  private cloudTweens = new Map<string, Phaser.Tweens.Tween>();
  /** Where each cloud sits and how far it paints, for the view index. */
  private cloudAnchors = new Map<string, { x: number; y: number; radius: number }>();
  private landBoundaryLoops = new Map<string, Array<Array<{ x: number; y: number }>>>();
  private armyHighlightLoops = new Map<string, Array<Array<{ x: number; y: number }>>>();
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private fogGraphics!: Phaser.GameObjects.Graphics;
  /** The lighter veil over ground the realm can see but does not hold. See `repaintForeignHaze`. */
  private foreignHazeGraphics!: Phaser.GameObjects.Graphics;
  private fogBakeRT?: Phaser.GameObjects.RenderTexture;
  concealPending(): void { this.fogChunks?.conceal(); }
  chunkStats() { return this.fogChunks?.stats(); }
  private fogChunks?: ChunkedMapLayer;
  private armyHighlightGraphics?: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapRenderer: MapRenderer,
  ) {}

  /** Outlines each land's merged hex region in its owner's color (terrain fill stays untinted). */
  createZoneLayers(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    getOwnerColor: OwnerColorLookup,
  ): void {
    this.boundaryLoopCache.clear();
    for (const land of state.lands) {
      const graphics = this.scene.add.graphics();
      // Sit above the terrain fill but behind terrain decorations (mountains, forests,
      // etc.) so border ink strokes don't cut across painted scenery in front of them.
      graphics.setDepth(0.5);
      this.zoneGraphics.set(land.id, graphics);
    }

    this.repaintAllZones(state, hexTileMap, wx, wy, getOwnerColor);
  }

  repaintAllZones(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    getOwnerColor: OwnerColorLookup,
  ): void {
    for (const land of state.lands) {
      this.paintZoneBorder(state, hexTileMap, wx, wy, land, getOwnerColor);
    }
  }

  private paintZoneBorder(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    land: Land,
    getOwnerColor: OwnerColorLookup,
  ): void {
    const graphics = this.zoneGraphics.get(land.id);
    if (!graphics) {
      return;
    }

    graphics.clear();
    if (!land.isVisible) {
      return;
    }

    const edges = traceLandBoundaryEdges(state, hexTileMap, wx, wy, land.id);
    const color = getOwnerColor(land.ownerId);
    // Unowned territory borders fade into faint ink wash so the map doesn't read as a
    // dense grid of tiles; owned/claimed borders stay crisp as ownership signal.
    const { borders } = this.mapRenderer.palette;
    const alpha = color === COLORS.neutral ? borders.neutralAlpha : borders.ownedAlpha;

    // A theme may prefer to carry ownership as something other than a saturated fill — the Đông Hồ
    // renderer hatches the merged region, with the angle standing for the faction. Painted before
    // the contour so the border still reads as the region's edge.
    const wantsLoops = Boolean(this.mapRenderer.drawZoneFill || this.mapRenderer.drawZoneContour);
    const loops = wantsLoops
      ? traceLandBoundaryLoops(state, hexTileMap, wx, wy, this.boundaryLoopCache, land.id)
      : [];
    if (this.mapRenderer.drawZoneFill) {
      this.mapRenderer.drawZoneFill(
        graphics,
        loops,
        land.ownerId === PLAYER_KINGDOM_ID,
        land.ownerId === NEUTRAL_OWNER_ID || color === COLORS.neutral,
      );
    }
    // The frontier as loops where the theme can take them — an inked contour has to be pulled in
    // one stroke per loop or its corners do not meet. See `MapRenderer.drawZoneContour`.
    if (this.mapRenderer.drawZoneContour) {
      this.mapRenderer.drawZoneContour(graphics, loops, color, alpha);
    } else {
      this.mapRenderer.drawZoneBorder(graphics, edges, color, alpha);
    }
  }

  createSelectionLayer(): void {
    this.selectionGraphics = this.scene.add.graphics();
    this.selectionGraphics.setDepth(60);
  }

  /** Strokes the outer boundary of the selected land's merged hex region. */
  updateSelectionOutline(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
  ): void {
    this.selectionGraphics.clear();
    const landId = state.selectedLandId;
    if (!landId) {
      return;
    }

    this.selectionGraphics.lineStyle(4, COLORS.selected, 0.95);
    for (const [x1, y1, x2, y2] of traceLandBoundaryEdges(state, hexTileMap, wx, wy, landId)) {
      this.selectionGraphics.lineBetween(x1, y1, x2, y2);
    }
  }

  createFogLayer(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    frontier?: ReadonlySet<string>,
  ): void {
    this.fogGraphics = this.scene.add.graphics();
    // Just below the drifting cloud puffs (depth 78) but still above all unit/marker
    // layers. The static tint is the single heaviest Graphics on the map (tens of
    // thousands of fill commands re-tessellated every frame), so it is baked to a
    // texture via `bakeFog` and this live Graphics is only used as the bake source.
    this.fogGraphics.setDepth(77.5);
    this.repaintFogOfWar(state, hexTileMap, wx, wy, frontier);
  }

  /**
   * Bakes the static fog tint (this layer's own Graphics plus any extra static fog
   * Graphics, e.g. the filler-tile fog) into a single RenderTexture, then hides the
   * source Graphics. This replaces ~90k per-frame fill/triangulation commands with a
   * single textured quad. Re-run whenever visibility changes (the static signature).
   */
  bakeFog(worldWidth: number, worldHeight: number, extra: Phaser.GameObjects.Graphics[] = [], scale = 1): void {
    if (!/[?&]wholebake=1\b/.test(window.location.search)) {
      const initial = !this.fogChunks;
      this.fogChunks ??= new ChunkedMapLayer(this.scene, 77.5, true);
      const sources = [this.fogGraphics, ...extra];
      this.fogChunks.invalidate(sources, worldWidth, worldHeight, scale);
      for (const source of sources) source.setVisible(false);
      if (initial) this.fogChunks.flush();
      return;
    }
    // A world-sized texture past MAX_TEXTURE_SIZE fails silently and renders black - clamp
    // first, so a huge revealed world on a small GPU gets a softer fog, not a missing one.
    scale = fitBakeScale(this.scene, worldWidth, worldHeight, scale);
    // The quality rung can change mid-run, and with it the wanted scale — an RT sized for the
    // old one would silently bake at the wrong density. Compared through the size ASKED for:
    // Phaser rounds RT dimensions up, so `rt.width` cannot hold this guard.
    const wantW = Math.ceil(worldWidth * scale);
    const wantH = Math.ceil(worldHeight * scale);
    if (this.fogBakeRT && this.fogBakeRT.getData('bakeSize') !== `${wantW}x${wantH}`) {
      this.fogBakeRT.destroy();
      this.fogBakeRT = undefined;
    }
    if (!this.fogBakeRT) {
      // Baked at `scale` resolution then displayed scaled up; fog is a soft tint so the
      // reduced resolution is imperceptible and it cuts the cached-texture memory.
      this.fogBakeRT = this.scene.add.renderTexture(0, 0, wantW, wantH)
        .setOrigin(0, 0)
        .setScale(1 / scale)
        .setDepth(77.5)
        .setData('bakeSize', `${wantW}x${wantH}`);
    }
    // Skip if the WebGL context is lost — clearing/drawing the RenderTexture would
    // dereference a null GL binding. The bake re-runs on the next visibility change.
    const renderer = this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (renderer?.contextLost) {
      return;
    }
    const sources = [this.fogGraphics, ...extra];
    // Sources are anchored at world origin, so scaling them shrinks their geometry into
    // the reduced-res texture.
    for (const source of sources) { source.setVisible(true); source.setScale(scale); }
    try {
      this.fogBakeRT.clear();
      this.fogBakeRT.draw(sources, 0, 0);
      // Phaser 4 buffers the draw commands; `render` executes them. Before the sources are put
      // back to scale 1 and hidden below, or the buffer replays against the wrong geometry.
      this.fogBakeRT.render();
    } catch (error) {
      console.warn('Fog bake skipped (renderer unavailable):', error);
      for (const source of sources) source.setScale(1);
      return;
    }
    for (const source of sources) { source.setVisible(false); source.setScale(1); }
  }

  /**
   * Ground the realm can SEE but does not hold — hazed, so that what is yours reads as yours.
   *
   * Visibility here is owned-plus-neighbours, so a province you have never set foot in arrives on
   * the sheet drawn exactly as crisply as your own capital: its houses, its farmers, its herds and
   * its name plate, all at full strength. There was no filter on it of any kind — fog is painted
   * only over ground that is *hidden*, and the moment a province stops being hidden it becomes
   * indistinguishable from the realm.
   *
   * Two things lift the haze, which is precisely the pair a player would name: **you hold it**, or
   * **one of your hosts is standing on it**. A province you have marched into is a province you
   * have looked at.
   *
   * Half the weight of the frontier fog and none of its texture: this is not the chronicle failing
   * to reach the ground, it is the ground belonging to somebody else. It sits just under the fog so
   * hidden ground still reads as hidden, and above every marker and settlement node so the veil
   * covers what stands on the land and not merely the land.
   */
  createForeignHazeLayer(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
  ): Phaser.GameObjects.Graphics {
    this.foreignHazeGraphics = this.scene.add.graphics();
    this.foreignHazeGraphics.setDepth(77.4);
    this.repaintForeignHaze(state, hexTileMap, wx, wy);
    return this.foreignHazeGraphics;
  }

  /** Whether the realm has actually been on this ground — held it, or has a host standing there. */
  static isHeldOrOccupied(state: GameState, land: Land): boolean {
    if (land.ownerId === PLAYER_KINGDOM_ID) {
      return true;
    }
    return state.armies.some((army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === land.id);
  }

  repaintForeignHaze(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
  ): void {
    if (!this.foreignHazeGraphics) {
      return;
    }
    this.foreignHazeGraphics.clear();
    for (const land of state.lands) {
      // Hidden ground is the fog's business, and drawing both over it doubles the veil.
      if (!land.isVisible || OverlayRenderer.isHeldOrOccupied(state, land)) {
        continue;
      }
      const loops = traceLandBoundaryLoops(state, hexTileMap, wx, wy, this.landBoundaryLoops, land.id);
      this.foreignHazeGraphics.fillStyle(this.mapRenderer.palette.fog, 0.42);
      for (const loop of loops) {
        if (loop.length >= 3) {
          this.foreignHazeGraphics.fillPoints(loop, true);
        }
      }
    }
  }

  repaintFogOfWar(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    frontier?: ReadonlySet<string>,
  ): void {
    if (!this.fogGraphics) {
      return;
    }

    this.fogGraphics.clear();
    const activeIds = new Set<string>();
    for (const land of state.lands) {
      if (land.isVisible) {
        continue;
      }
      // Only the band of hidden ground the realm actually touches is drawn. Fog used to be painted
      // over every hidden province, which made the *early* game the expensive one — 39 fogged lands
      // at three visible, and the fog layer the second-heaviest on the map at 364k fill commands.
      // Beyond this band the sheet is simply paper the chronicle has not reached yet, which is both
      // free and what this theme already says unexplored ground should look like.
      if (frontier && !frontier.has(land.id)) {
        continue;
      }

      const loops = traceLandBoundaryLoops(state, hexTileMap, wx, wy, this.landBoundaryLoops, land.id);
      if (this.mapRenderer.drawFogRegion) {
        // A flat fill of the merged loop still follows hex edges, so the frontier between the
        // drawn world and the undrawn one reads as a honeycomb. A theme may tear it instead.
        this.mapRenderer.drawFogRegion(this.fogGraphics, loops, land.isExplored);
      } else {
        this.fogGraphics.fillStyle(this.mapRenderer.palette.fog, land.isExplored ? 0.85 : 0.94);
        for (const loop of loops) {
          this.fogGraphics.fillPoints(loop, true);
        }
      }

      activeIds.add(land.id);
      this.paintFogPuffs(land, wx, wy);
    }

    for (const [landId, graphics] of this.cloudGraphics) {
      if (!activeIds.has(landId)) {
        // Remove the drift loop before the target dies, or it keeps ticking against a dead object.
        this.cloudTweens.get(landId)?.remove();
        this.cloudTweens.delete(landId);
        this.cloudAnchors.delete(landId);
        graphics.destroy();
        this.cloudGraphics.delete(landId);
      }
    }
  }

  /**
   * Paints a small cluster of overlapping rounded puffs over a hidden district, with a
   * darker shadow layer beneath and brighter highlight circles on top so the fog reads
   * as a cottony cloud rather than a flat tint. The cloud lives on its own Graphics layer
   * so it can slowly drift back and forth, independent of the static fog tint.
   */
  private paintFogPuffs(land: Land, wx: WorldTransform, wy: WorldTransform): void {
    const seed = hashString(land.id);
    const baseRadius = Phaser.Math.Clamp(30 + land.buildingCapacity * 9, 38, 78);
    const alpha = land.isExplored ? 0.55 : 0.85;
    const baseX = wx(land.x);
    const baseY = wy(land.y);

    // A cloud is ~15 filled circles that never change shape, and a fresh map keeps dozens of
    // them drifting — as live Graphics that was hundreds of re-tessellated fills per frame for
    // pictures identical to the last frame. Eight looks per renderer theme, baked once, and a
    // cloud is one image: the drift tween and the culling ride the Image exactly as they rode
    // the Graphics. Radius is an instance scale; explored-vs-hidden is the image's alpha.
    const CANON = 56;
    const look = seed % 8;
    const theme = (this.mapRenderer as unknown as { theme?: { id?: string } }).theme?.id ?? 'x';
    const st = stamp(this.scene, `world:cloud:${theme}:v${look}`, {
      left: -CANON * 1.8, right: CANON * 1.8, top: -CANON * 1.5, bottom: CANON * 1.5,
    }, (g, x, y, raster) => {
      this.mapRenderer.drawCloud(g, x, y, CANON * raster, look * 977 + 31, 1);
    }, { raster: 'plain', pool: 'world', pad: 4 });

    let image = this.cloudGraphics.get(land.id);
    if (!image) {
      image = placeStamp(this.scene, st, baseX, baseY);
      image.setDepth(78);
      this.cloudGraphics.set(land.id, image);

      const driftX = 5 + (seed % 5);
      const driftY = 3 + ((seed >> 3) % 4);
      const duration = 14000 + (seed % 9) * 1300;
      this.cloudTweens.set(
        land.id,
        this.scene.tweens.add({
          targets: image,
          x: baseX + driftX,
          y: baseY + driftY,
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }),
      );
    }

    this.cloudAnchors.set(land.id, { x: baseX, y: baseY, radius: baseRadius + 24 });
    image.setAlpha(alpha);
    image.setScale(st.scale * (baseRadius / CANON));
  }

  /** Every fog cloud with where it sits, for the view index. */
  cloudTargets(): Array<{ id: string; x: number; y: number; radius: number }> {
    return [...this.cloudAnchors.entries()]
      .filter(([landId]) => this.cloudGraphics.has(landId))
      .map(([landId, anchor]) => ({ id: `cloud::${landId}`, ...anchor }));
  }

  /** Hides one fog cloud and stops it drifting while it is off-screen. */
  setCloudCulled(id: string, culled: boolean): void {
    const landId = id.slice('cloud::'.length);
    this.cloudGraphics.get(landId)?.setVisible(!culled);
    const tween = this.cloudTweens.get(landId);
    if (!tween) {
      return;
    }
    if (culled) {
      tween.pause();
    } else {
      tween.resume();
    }
  }

  /**
   * Soft gold highlight over every land the given army could be ordered to: its
   * own territory reachable via owned lands (BFS over `land.neighbors`, same
   * connectivity rule as march pathfinding) plus the non-player lands bordering
   * that territory (attackable on arrival).
   */
  highlightReachableLands(
    state: GameState,
    hexTileMap: Map<string, HexTile>,
    wx: WorldTransform,
    wy: WorldTransform,
    armyId: string,
  ): void {
    if (!this.armyHighlightGraphics) {
      this.armyHighlightGraphics = this.scene.add.graphics();
      this.armyHighlightGraphics.setDepth(55);
    }

    this.armyHighlightGraphics.clear();
    const army = state.armies.find((candidate) => candidate.id === armyId);
    if (!army) {
      return;
    }

    const reachable = new Set<string>();
    const visited = new Set<string>([army.landId]);
    const queue: string[] = [army.landId];

    while (queue.length > 0) {
      const current = queue.shift() as string;
      const land = state.lands.find((candidate) => candidate.id === current);
      if (!land) {
        continue;
      }

      for (const neighborId of land.neighbors) {
        if (visited.has(neighborId)) {
          continue;
        }
        visited.add(neighborId);

        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor) {
          continue;
        }

        reachable.add(neighborId);
        if (neighbor.ownerId === PLAYER_KINGDOM_ID) {
          queue.push(neighborId);
        }
      }
    }

    for (const landId of reachable) {
      for (const loop of traceLandBoundaryLoops(state, hexTileMap, wx, wy, this.armyHighlightLoops, landId)) {
        this.armyHighlightGraphics.fillStyle(COLORS.selected, 0.22);
        this.armyHighlightGraphics.fillPoints(loop, true);
      }

      this.armyHighlightGraphics.lineStyle(2.5, COLORS.selected, 0.8);
      for (const [x1, y1, x2, y2] of traceLandBoundaryEdges(state, hexTileMap, wx, wy, landId)) {
        this.armyHighlightGraphics.lineBetween(x1, y1, x2, y2);
      }
    }
  }

  /** Clears the reachable-lands highlight, e.g. when no army is selected. */
  clearArmyHighlight(): void {
    this.armyHighlightGraphics?.clear();
  }
}
