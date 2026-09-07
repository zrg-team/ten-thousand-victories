import Phaser from 'phaser';
import { getGraphicsQuality } from '../../game/graphicsQuality';
import { mapWork, registerMapWork } from './mapWorkBudget';
import { maxTextureSize } from '../../ui/ink/textureLimits';
import { MAP_CHUNK_SIZE as SIZE, graphicsCells, commandBatches } from './GraphicsChunks';

type Source = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible & { depth: number; alpha: number; blendMode: number };
interface Part { source: Source; commands?: number[]; signature: string }
interface Tile { key: string; target: Phaser.GameObjects.RenderTexture; image: Phaser.GameObjects.Image; bytes: number; used: number; visible: boolean; nearby: boolean; signature: string; owner: ChunkedMapLayer }
interface Budget { tiles: Set<Tile>; pending: number; limit: number }
const budgets = new WeakMap<Phaser.Scene, Budget>();
const ids = new WeakMap<object, number>();
let serial = 0;
function id(object: object): number { let n = ids.get(object); if (!n) { n = ++serial; ids.set(object, n); } return n; }

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
  private covered = false;
  private awaitingConceal = false;
  private blocked = false;
  private frameCosts: number[] = [];
  private builds = 0;
  private invalidations = 0;
  private pendingWork = true;
  private lastPose = '';
  private stopBudget: () => void;
  private readonly tick = () => mapWork(this.scene, remaining => this.update(remaining));
  private readonly restored = () => { this.clearTiles(); this.invalidate(this.sources, this.width, this.height, this.scale); };

  constructor(private scene: Phaser.Scene, private depth: number, private conservative = false) {
    let budget = budgets.get(scene);
    if (!budget) { budget = { tiles: new Set(), pending: 0, limit: (getGraphicsQuality() === 'high' ? 96 : 64) * 1048576 }; budgets.set(scene, budget); }
    this.budget = budget;
    this.stopBudget = registerMapWork(scene, () => !!this.prepare || !!this.paint || this.pendingWork || this.lastPose !== this.pose());
    budget.limit = (getGraphicsQuality() === 'high' ? 96 : 64) * 1048576;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    (scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).on?.(Phaser.Renderer.Events.RESTORE_WEBGL, this.restored);
  }

  invalidate(sources: readonly Phaser.GameObjects.GameObject[], width: number, height: number, scale: number): void {
    if (this.disposed) return;
    this.prepare?.return(undefined); this.paint?.return(undefined); this.paint = undefined; this.paintingKey = undefined;
    this.sources = sources.filter(source => !!source.scene) as Source[];
    this.width = width; this.height = height;
    const nextScale = Math.min(scale, (maxTextureSize(this.scene) - 4) / SIZE);
    if (nextScale !== this.scale) this.clearTiles();
    this.scale = nextScale;
    this.invalidations++; this.awaitingConceal = false;
    if (this.conservative) {
      this.cover ??= this.scene.add.graphics().setDepth(this.depth + 0.001).setData('mapChunk', true);
      if (this.tiles.size === 0 || this.covered) this.conceal(false);
    }
    this.prepare = this.preparePlans();
  }

  /** Called before a queued visibility loss, so old cached imagery cannot leak information. */
  conceal(awaitInvalidation = true): void {
    this.awaitingConceal = awaitInvalidation;
    this.covered = true;
    this.cover?.clear().fillStyle(0xe9dfc2, 1).fillRect(0, 0, this.width, this.height).setVisible(true);
  }

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
        const cells = yield* graphicsCells(source);
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
    return new Phaser.Geom.Rectangle(camera.scrollX, camera.scrollY, camera.width / camera.zoom, camera.height / camera.zoom);
  }
  private rectangle(key: string): Phaser.Geom.Rectangle {
    const [x, y] = key.split(',').map(Number);
    return new Phaser.Geom.Rectangle(x * SIZE, y * SIZE, Math.min(SIZE, this.width - x * SIZE), Math.min(SIZE, this.height - y * SIZE));
  }
  private signature(parts: Part[]): string { return parts.map(part => part.signature).join('|'); }
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
    if (!this.room(bytes, visible)) { this.blocked = true; this.pendingWork = visible; return; }
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
    const nearby = Phaser.Geom.Rectangle.Clone(view); Phaser.Geom.Rectangle.Inflate(nearby, SIZE / 2, SIZE / 2);
    for (const tile of this.tiles.values()) {
      tile.visible = Phaser.Geom.Intersects.RectangleToRectangle(this.rectangle(tile.key), view);
      tile.nearby = Phaser.Geom.Intersects.RectangleToRectangle(this.rectangle(tile.key), nearby);
      tile.image.setVisible(tile.visible); if (tile.visible) tile.used = this.clock;
    }
    while (!this.blocked && performance.now() - started < budgetMs) {
      if (this.prepare) { if (this.prepare.next().done) this.prepare = undefined; else continue; }
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
    // On a pan, an unbuilt fog cell must never expose the map beneath it. Covers are
    // interiors only and remain opaque until the replacement is committed.
    if (this.conservative && this.cover) {
      this.cover.clear().fillStyle(0xe9dfc2, 1);
      if (this.awaitingConceal || (this.prepare && this.covered)) this.cover.fillRect(0, 0, this.width, this.height);
      else for (const [key, parts] of this.plans) {
        const box = this.rectangle(key);
        // A visibility loss may have happened while this tile was offscreen. Even after
        // the previous viewport settled, its stale cached fog cannot be trusted on a pan.
        if (Phaser.Geom.Intersects.RectangleToRectangle(box, view) && this.tiles.get(key)?.signature !== this.planSignatures.get(key)) {
          this.cover.fillRect(box.x, box.y, box.width, box.height);
        }
      }
      this.cover.setVisible(true);
      if (!this.awaitingConceal && !this.prepare && !this.paint && [...this.plans].every(([key]) => !Phaser.Geom.Intersects.RectangleToRectangle(this.rectangle(key), view) || this.tiles.get(key)?.signature === this.planSignatures.get(key))) this.covered = false;
    }
    if (budgetMs < 100) this.frameCosts.push(performance.now() - started);
    if (this.frameCosts.length > 600) this.frameCosts.shift();
  }

  /** Initial map construction and deterministic screenshots may finish the visible area before exposing it. */
  flush(): void { this.update(30_000); }
  stats(): { tiles: number; bytes: number; pending: boolean; builds: number; invalidations: number; maxWorkMs: number } {
    return { tiles: this.tiles.size, bytes: [...this.budget.tiles].reduce((sum, tile) => sum + tile.bytes, this.budget.pending),
      pending: !!this.prepare || !!this.paintingKey || [...this.plans].some(([key]) => Phaser.Geom.Intersects.RectangleToRectangle(this.rectangle(key), this.view()) && this.tiles.get(key)?.signature !== this.planSignatures.get(key)), builds: this.builds, invalidations: this.invalidations, maxWorkMs: Math.max(0, ...this.frameCosts) };
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.stopBudget(); this.prepare?.return(undefined); this.paint?.return(undefined); this.clearTiles(); this.cover?.destroy();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick);
    (this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).off?.(Phaser.Renderer.Events.RESTORE_WEBGL, this.restored);
  }
}
