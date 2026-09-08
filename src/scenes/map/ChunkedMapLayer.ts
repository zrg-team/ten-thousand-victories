import Phaser from 'phaser';
import { getGraphicsQuality } from '../../game/graphicsQuality';
import { mapWork, registerMapWork } from './mapWorkBudget';
import { mapPreparationWorker } from './MapPreparationWorker';
import { maxTextureSize } from '../../ui/ink/textureLimits';
import { MAP_CHUNK_SIZE as SIZE, graphicsCells, commandBatches } from './GraphicsChunks';

type Source = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible & { depth: number; alpha: number; blendMode: number };
interface Part { source: Source; commands?: number[]; signature: string }
interface Tile { key: string; target: Phaser.GameObjects.RenderTexture; image: Phaser.GameObjects.Image; bytes: number; used: number; visible: boolean; nearby: boolean; signature: string; owner: ChunkedMapLayer }
interface Budget { tiles: Set<Tile>; pending: number; limit: number }
/** A rectangle of the world, in design units. Structurally a `Phaser.Geom.Rectangle`, so one serves for both. */
export interface WorldRect { x: number; y: number; width: number; height: number }
/**
 * Ground to keep under paper: its bounds, and when the caller has it, its actual outline — a
 * province is a ragged hex region, and its bounding box reaches well into the neighbours it
 * shares corners with. Paper in the shape of the province reads as the province gone dark,
 * which in this theme is exactly what unexplored ground looks like; paper in the shape of a box
 * reads as a hole in the picture.
 */
export interface ConcealRegion extends WorldRect { loops?: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>> }
const budgets = new WeakMap<Phaser.Scene, Budget>();
const ids = new WeakMap<object, number>();
let serial = 0;
function id(object: object): number { let n = ids.get(object); if (!n) { n = ++serial; ids.set(object, n); } return n; }

/**
 * How much of a frame a band may spend while a cell IN VIEW has no imagery.
 *
 * The ordinary allowance is `mapWork`'s 3 ms a frame, shared between every band and the scene's
 * own refresh — the right price for prefetch and for repainting under imagery that is still
 * standing, and the wrong one for a hole in the picture: a frame that shows bare paper where the
 * world should be is not a frame saved. Measured at 6x CPU throttle (`verify-map-blank`): a pan
 * into unpainted ground and a context restore both left cells empty for as long as the 3 ms
 * allowance took to fill them. At this budget the fill costs a few frames of a lower rate,
 * which is the cheaper of the two.
 */
const VISIBLE_BOOST_MS = 24;

const intersects = (a: WorldRect, b: WorldRect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const intersection = (a: WorldRect, b: WorldRect): WorldRect => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, height: Math.min(a.y + a.height, b.y + b.height) - y };
};

/** One ground/fog band. Preparation and rasterisation both yield between bounded pieces. */
export class ChunkedMapLayer {
  private sources: Source[] = [];
  private plans = new Map<string, Part[]>();
  private planSignatures = new Map<string, string>();
  private tiles = new Map<string, Tile>();
  private prepare?: Generator<void>;
  private paint?: Generator<void>;
  private paintingKey?: string;
  private clock = 0;
  private scale = 1;
  private width = 0;
  private height = 0;
  private disposed = false;
  private budget: Budget;
  private cover?: Phaser.GameObjects.Graphics;
  /**
   * Ground that must stay hidden until its fog is current — provinces just lost, by rectangle.
   * Armed by the `invalidate` that follows, and released tile by tile as imagery comes back.
   */
  private concealed: ConcealRegion[] = [];
  /** Raised since the last invalidation and not yet armed; `concealSettled` takes these down whole. */
  private concealPending: ConcealRegion[] = [];
  private blocked = false;
  private frameCosts: number[] = [];
  private builds = 0;
  private invalidations = 0;
  private pendingWork = true;
  private lastPose = '';
  private readonly viewRect = new Phaser.Geom.Rectangle();
  private readonly nearbyRect = new Phaser.Geom.Rectangle();
  private readonly rectangles = new Map<string,Phaser.Geom.Rectangle>();
  private synchronous = false;
  private stopBudget: () => void;
  private readonly tick = () => {
    if(!this.prepare&&!this.paint&&!this.pendingWork&&!this.concealed.length&&this.lastPose===this.pose())return;
    mapWork(this.scene, remaining => this.update(remaining));
  };
  private readonly restored = () => { this.clearTiles(); this.invalidate(this.sources, this.width, this.height, this.scale); };

  constructor(private scene: Phaser.Scene, private depth: number) {
    let budget = budgets.get(scene);
    if (!budget) { budget = { tiles: new Set(), pending: 0, limit: (getGraphicsQuality() === 'high' ? 96 : 64) * 1048576 }; budgets.set(scene, budget); }
    this.budget = budget;
    this.stopBudget = registerMapWork(scene, () => !!this.prepare || !!this.paint || this.pendingWork || this.concealed.length > 0 || this.lastPose !== this.pose());
    budget.limit = (getGraphicsQuality() === 'high' ? 96 : 64) * 1048576;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    (scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).on?.(Phaser.Renderer.Events.RESTORE_WEBGL, this.restored);
  }

  invalidate(sources: readonly Phaser.GameObjects.GameObject[], width: number, height: number, scale: number): void {
    if (this.disposed) return;
    this.prepare?.return(undefined); this.paint?.return(undefined); this.paint = undefined; this.paintingKey = undefined;
    this.sources = sources.filter(source => !!source.scene) as Source[];
    if(this.width!==width||this.height!==height)this.rectangles.clear();
    this.width = width; this.height = height;
    const nextScale = Math.min(scale, (maxTextureSize(this.scene) - 4) / SIZE);
    if (nextScale !== this.scale) this.clearTiles();
    this.scale = nextScale;
    this.invalidations++;
    // The regions raised for this repaint are now the repaint's to release: each stands until
    // every tile under it has been painted from the plans prepared below.
    this.concealed.push(...this.concealPending); this.concealPending = [];
    this.prepare = this.preparePlans();
    this.paintCover();
  }

  /**
   * Hides ground until its fog has been re-inked.
   *
   * Raised by the scene the moment a province drops out of sight — before the fog Graphics has
   * been repainted, let alone re-planned — so the imagery standing over it, which shows the
   * province as it was, cannot outlive the refresh. What this used to do was cover the WHOLE
   * world in opaque paper and release that cover only once a later `invalidate` had been fully
   * painted out. Two faults, one screen: the ground, the towns and the armies vanished under the
   * fog band for the length of every repaint; and a conceal that no invalidation followed — a
   * hostile host's sighting going dark, then lit again before the refresh read its signatures —
   * left the sheet blank until some unrelated fog change came along. Measured at 6x CPU throttle
   * (`verify-map-blank`): the entire map paper for the whole of a 900-frame sample.
   *
   * A conceal now names the ground it is about. The rectangles stand whole until the next
   * `invalidate` arms them, then only over tiles not yet painted from the current plans, and
   * `concealSettled` takes them down when the refresh that raised them found nothing to re-ink.
   * No region means the whole world — kept for a caller that cannot say where, and never what
   * the map itself asks for.
   */
  conceal(regions?: readonly ConcealRegion[], awaitInvalidation = true): void {
    if (this.disposed) return;
    const rects: ConcealRegion[] = regions && regions.length > 0
      ? regions.map(region => ({ ...region }))
      : [{ x: 0, y: 0, width: this.width, height: this.height }];
    (awaitInvalidation ? this.concealPending : this.concealed).push(...rects);
    this.cover ??= this.scene.add.graphics().setDepth(this.depth + 0.001).setData('mapChunk', true);
    this.paintCover();
  }

  /**
   * The refresh that raised a conceal re-read the state and found the fog unchanged: what is
   * standing is current, and the cover has nothing left to hide.
   */
  concealSettled(): void {
    if (this.concealPending.length === 0) return;
    this.concealPending = [];
    this.paintCover();
  }

  /** How many concealed regions are standing, armed or not. */
  concealedCount(): number { return this.concealed.length + this.concealPending.length; }

  private *preparePlans(): Generator<void> {
    const plans = new Map<string, Part[]>();
    const add = (key: string, part: Part) => {
      const [x, y] = key.split(',').map(Number);
      if (x < 0 || y < 0 || x * SIZE >= this.width || y * SIZE >= this.height) return;
      const list = plans.get(key) ?? []; list.push(part); plans.set(key, list);
    };
    // Empty cells are also plans: removing the last mark must clear the old texture.
    for (let y = 0; y < this.height / SIZE; y++) for (let x = 0; x < this.width / SIZE; x++) plans.set(`${x},${y}`, []);
    for (const source of this.sources) {
      if (!source.scene) continue;
      const base = `${id(source)}:${source.x}:${source.y}:${source.scaleX}:${source.scaleY}:${source.rotation}:${source.alpha}`;
      if (source instanceof Phaser.GameObjects.Graphics) {
        const cells = yield* graphicsCells(source, this.synchronous);
        for (const [key, cell] of cells) add(key, { source, commands: cell.commands, signature: `${base}:${cell.hash}:${cell.commands.length}` });
      } else {
        const bounded = source as Source & { getBounds?(): Phaser.Geom.Rectangle; texture?: { key: string }; frame?: { name: string | number }; tintTopLeft?: number; flipX?: boolean; flipY?: boolean };
        const bounds = bounded.getBounds?.() ?? new Phaser.Geom.Rectangle(0, 0, this.width, this.height);
        for (let y = Math.floor(bounds.top / SIZE); y <= Math.floor(bounds.bottom / SIZE); y++) for (let x = Math.floor(bounds.left / SIZE); x <= Math.floor(bounds.right / SIZE); x++) {
          add(`${x},${y}`, { source, signature: `${base}:${bounded.texture?.key}:${bounded.frame?.name}:${bounded.tintTopLeft}:${bounded.flipX}:${bounded.flipY}` });
        }
      }
      yield;
    }
    const signatures = new Map<string, string>();
    for (const [key, parts] of plans) { signatures.set(key, this.signature(parts)); yield; }
    this.plans = plans; this.planSignatures = signatures; this.pendingWork = true;
  }

  private pose(): string { const c = this.scene.cameras.main; return `${c.scrollX}:${c.scrollY}:${c.width}:${c.height}:${c.zoom}`; }

  private view(): Phaser.Geom.Rectangle {
    const camera = this.scene.cameras.main;
    return this.viewRect.setTo(camera.scrollX, camera.scrollY, camera.width / camera.zoom, camera.height / camera.zoom);
  }
  private rectangle(key: string): Phaser.Geom.Rectangle {
    const saved=this.rectangles.get(key);if(saved)return saved;
    const [x, y] = key.split(',').map(Number);
    const box=new Phaser.Geom.Rectangle(x * SIZE, y * SIZE, Math.min(SIZE, this.width - x * SIZE), Math.min(SIZE, this.height - y * SIZE));
    this.rectangles.set(key,box);return box;
  }
  private signature(parts: Part[]): string { return parts.map(part => part.signature).join('|'); }
  /** Whether the tile standing on a cell was painted from the current plans. */
  private isCurrent(key: string): boolean { return this.tiles.get(key)?.signature === this.planSignatures.get(key); }
  private release(tile: Tile): void {
    tile.image.destroy(); tile.target.texture.destroy(); tile.target.destroy(); this.tiles.delete(tile.key); this.budget.tiles.delete(tile);
    this.pendingWork = true;
  }
  private clearTiles(): void { for (const tile of [...this.tiles.values()]) this.release(tile); }
  private room(bytes: number, visible: boolean): boolean {
    let used = this.budget.pending;
    for (const tile of this.budget.tiles) used += tile.bytes;
    if (used + bytes <= this.budget.limit) return true;
    // Prefetch must not evict another wanted prefetch tile and rebuild it forever.
    // Visible work may reclaim any offscreen tile; speculative work only reclaims distant ones.
    for (const tile of [...this.budget.tiles].filter(tile => !tile.visible && (visible || !tile.nearby)).sort((a, b) => Number(a.nearby) - Number(b.nearby) || a.used - b.used)) {
      used -= tile.bytes; tile.owner.release(tile);
      if (used + bytes <= this.budget.limit) return true;
    }
    return false;
  }

  /**
   * The cells in view with nothing right to show: no tile at all, or a concealed cell whose
   * imagery is still on its way. These are the frames worth spending real time on.
   */
  private visibleDeficit(): number {
    const view = this.view();
    const planned = !this.prepare;
    let count = 0;
    for (const key of this.plans.keys()) {
      const box = this.rectangle(key);
      if (!intersects(box, view)) continue;
      const tile = this.tiles.get(key);
      if (!tile) { count++; continue; }
      if (this.concealed.some(region => intersects(region, box)) && (!planned || !this.isCurrent(key))) count++;
    }
    return count;
  }

  /**
   * Redraws the paper over concealed ground: pending regions whole, armed regions only while a
   * tile beneath is not yet painted from the current plans. While plans are being prepared every
   * armed region is drawn whole, because the OLD plan's signatures would pass every tile.
   *
   * A region with an outline is drawn as that outline for as long as any tile under it is stale;
   * a bare rectangle is clipped to the stale tiles. The outline is not clipped because a province
   * is one shape to the eye, and half a province in paper reads as a fault rather than as fog.
   */
  private paintCover(): void {
    const cover = this.cover;
    if (!cover) return;
    cover.clear();
    let drawn = 0;
    const fill = (region: WorldRect): void => {
      if (region.width <= 0 || region.height <= 0) return;
      cover.fillRect(region.x, region.y, region.width, region.height);
      drawn++;
    };
    const outline = (region: ConcealRegion): void => {
      for (const loop of region.loops ?? []) {
        if (loop.length < 3) continue;
        cover.fillPoints(loop as Array<{ x: number; y: number }>, true);
        drawn++;
      }
    };
    const whole = (region: ConcealRegion): void => { if (region.loops) outline(region); else fill(region); };
    cover.fillStyle(0xe9dfc2, 1);
    for (const region of this.concealPending) whole(region);
    const planned = !this.prepare;
    for (const region of this.concealed) {
      if (!planned) { whole(region); continue; }
      const stale = [...this.plans.keys()].filter(key => intersects(this.rectangle(key), region) && !this.isCurrent(key));
      if (stale.length === 0) continue;
      if (region.loops) { outline(region); continue; }
      for (const key of stale) fill(intersection(this.rectangle(key), region));
    }
    cover.setVisible(drawn > 0);
  }

  /** An armed region comes down once every tile under it is current — offscreen ones included, so a stale tile the camera reaches later is still covered until it is repainted. */
  private releaseConcealed(): void {
    if (this.prepare || this.concealed.length === 0) return;
    const keys = [...this.plans.keys()];
    this.concealed = this.concealed.filter(region => keys.some(key => intersects(this.rectangle(key), region) && !this.isCurrent(key)));
  }

  private *paintTile(key: string, parts: Part[]): Generator<void> {
    const renderer = this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (renderer.contextLost || renderer.gl.isContextLost()) return;
    const box = this.rectangle(key), pad = 2, scale = this.scale;
    const w = parts.length ? Math.ceil(box.width * scale) : 1, h = parts.length ? Math.ceil(box.height * scale) : 1;
    // Phaser rounds DynamicTextures to even dimensions. Count the actual color allocation,
    // including possible mip levels on the rare power-of-two boundary tile.
    const textureWidth = Math.ceil((w + pad * 2) / 2) * 2, textureHeight = Math.ceil((h + pad * 2) / 2) * 2;
    const powerOfTwo = (n: number) => (n & (n - 1)) === 0;
    const mipmapped = powerOfTwo(textureWidth) && powerOfTwo(textureHeight);
    const bytes = Math.ceil(textureWidth * textureHeight * 4 * (mipmapped ? 4 / 3 : 1));
    const visible = Phaser.Geom.Intersects.RectangleToRectangle(box, this.view());
    if (!this.room(bytes, visible)) {
      // The tile this one replaces is the one thing the budget can always give back. Only for a
      // cell in view: a prefetch that evicts the imagery it is refreshing shows paper for nothing.
      const old = visible ? this.tiles.get(key) : undefined;
      if (old) this.release(old);
      if (!old || !this.room(bytes, visible)) { this.blocked = true; this.pendingWork = visible; return; }
    }
    this.budget.pending += bytes;
    let target: Phaser.GameObjects.RenderTexture | undefined;
    let scratch: Phaser.GameObjects.Graphics | undefined;
    let committed = false;
    try {
      target = this.scene.make.renderTexture({ width: textureWidth, height: textureHeight }, false);
      scratch = this.scene.make.graphics({}, false);
      target.clear(); target.render(); yield;
      for (const part of parts) {
        const source = part.source;
        if (!source.scene) continue;
        if (part.commands) {
          scratch.setPosition(source.x * scale, source.y * scale).setScale(source.scaleX * scale, source.scaleY * scale)
            .setRotation(source.rotation).setAlpha(source.alpha).setBlendMode(source.blendMode);
          for (const batch of commandBatches(part.commands)) {
            scratch.commandBuffer = batch;
            target.draw(scratch, pad - box.x * scale, pad - box.y * scale); target.render(); yield;
          }
        } else {
          const home = { x: source.x, y: source.y, sx: source.scaleX, sy: source.scaleY, visible: source.visible };
          source.setPosition(home.x * scale, home.y * scale).setScale(home.sx * scale, home.sy * scale).setVisible(true);
          try { target.draw(source, pad - box.x * scale, pad - box.y * scale); target.render(); }
          finally { source.setPosition(home.x, home.y).setScale(home.sx, home.sy).setVisible(home.visible); }
          yield;
        }
      }
      const texture = `map-chunk:${++serial}`;
      target.saveTexture(texture); target.texture.add('inner', 0, pad, pad, w, h);
      const image = this.scene.add.image(box.x, box.y, texture, 'inner').setOrigin(0).setDisplaySize(box.width, box.height)
        .setDepth(this.depth).setData('mapChunk', true);
      const old = this.tiles.get(key); if (old) this.release(old);
      const tile: Tile = { key, target, image, bytes, used: this.clock,
        visible: Phaser.Geom.Intersects.RectangleToRectangle(box, this.view()), nearby: true, signature: this.planSignatures.get(key)!, owner: this };
      this.tiles.set(key, tile); this.budget.tiles.add(tile); this.builds++; committed = true;
    } catch (error) {
      if (!renderer.contextLost && !renderer.gl.isContextLost()) throw error;
    } finally {
      scratch?.destroy(); this.budget.pending -= bytes;
      if (!committed) target?.destroy();
    }
  }

  update(budgetMs = 3): void {
    const renderer = this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (this.disposed || renderer.contextLost || renderer.gl.isContextLost()) return;
    const started = performance.now(), view = this.view(); this.clock++; this.blocked = false;
    const pose = this.pose(); if (pose !== this.lastPose) this.pendingWork = true; this.lastPose = pose;
    const nearby = this.nearbyRect.setTo(view.x-SIZE/2,view.y-SIZE/2,view.width+SIZE,view.height+SIZE);
    for (const tile of this.tiles.values()) {
      tile.visible = Phaser.Geom.Intersects.RectangleToRectangle(this.rectangle(tile.key), view);
      tile.nearby = Phaser.Geom.Intersects.RectangleToRectangle(this.rectangle(tile.key), nearby);
      tile.image.setVisible(tile.visible); if (tile.visible) tile.used = this.clock;
    }
    // A hole in the picture outranks the frame budget — see `VISIBLE_BOOST_MS`.
    const allowed = this.visibleDeficit() > 0 ? Math.max(budgetMs, VISIBLE_BOOST_MS) : budgetMs;
    while (!this.blocked && performance.now() - started < allowed) {
      if (this.prepare) {
        if (this.prepare.next().done) this.prepare = undefined;
        else { if (!this.synchronous && mapPreparationWorker(this.scene)?.waiting) break; continue; }
      }
      if (this.paint) {
        if (this.paint.next().done) { this.paint = undefined; this.paintingKey = undefined; } else continue;
      }
      if (this.blocked) break;
      if (!this.pendingWork) break;
      const candidates = [...this.plans].filter(([key]) => this.tiles.get(key)?.signature !== this.planSignatures.get(key))
        .filter(([key]) => Phaser.Geom.Intersects.RectangleToRectangle(this.rectangle(key), nearby))
        .sort(([a], [b]) => {
          const aa = this.rectangle(a), bb = this.rectangle(b);
          const av = Phaser.Geom.Intersects.RectangleToRectangle(aa, view), bv = Phaser.Geom.Intersects.RectangleToRectangle(bb, view);
          if (av !== bv) return av ? -1 : 1;
          return Math.hypot(aa.centerX - view.centerX, aa.centerY - view.centerY) - Math.hypot(bb.centerX - view.centerX, bb.centerY - view.centerY);
        });
      if (!candidates.length) {
        this.pendingWork = false;
        break;
      }
      this.paintingKey = candidates[0][0]; this.paint = this.paintTile(...candidates[0]);
    }
    // Concealed ground: an armed region stands only over tiles that are not yet current, and comes
    // down when none are left — a stale tile the camera has not reached keeps its region standing.
    this.releaseConcealed();
    this.paintCover();
    if (budgetMs < 100) this.frameCosts.push(performance.now() - started);
    if (this.frameCosts.length > 600) this.frameCosts.shift();
  }

  /** Initial map construction and deterministic screenshots may finish the visible area before exposing it. */
  flush(): void {
    // A caller cannot synchronously wait for a worker message on this thread.
    // Abandon only the pending plan and recompute it with the same pure functions.
    if(this.prepare && mapPreparationWorker(this.scene)?.waiting){this.prepare.return(undefined);this.prepare=this.preparePlans();}
    this.synchronous=true;try{this.update(30_000);}finally{this.synchronous=false;}
  }
  stats(): { tiles: number; bytes: number; pending: boolean; deficit: number; concealed: number; builds: number; invalidations: number; maxWorkMs: number } {
    return { tiles: this.tiles.size, bytes: [...this.budget.tiles].reduce((sum, tile) => sum + tile.bytes, this.budget.pending),
      pending: !!this.prepare || !!this.paintingKey || [...this.plans].some(([key]) => Phaser.Geom.Intersects.RectangleToRectangle(this.rectangle(key), this.view()) && this.tiles.get(key)?.signature !== this.planSignatures.get(key)),
      deficit: this.visibleDeficit(), concealed: this.concealedCount(),
      builds: this.builds, invalidations: this.invalidations, maxWorkMs: Math.max(0, ...this.frameCosts) };
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.stopBudget(); this.prepare?.return(undefined); this.paint?.return(undefined); this.clearTiles(); this.cover?.destroy();
    this.rectangles.clear();this.sources=[];this.plans.clear();this.planSignatures.clear();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick);
    (this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).off?.(Phaser.Renderer.Events.RESTORE_WEBGL, this.restored);
  }
}
