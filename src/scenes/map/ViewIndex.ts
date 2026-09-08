/**
 * Which of the map's live objects the camera can actually see.
 *
 * Desktop cameras can cover thousands of images plus settlement containers and Graphics.
 * Phaser's sprite culling does not eliminate their update cost and does not cover those
 * containers or paths. This index tracks each object's full painted bounds in a uniform grid.
 * Queries visit only intersecting cells, then check exact bounds; objects spanning several
 * cells are visited once. Stable records avoid repeated id hashing while the camera moves.
 *
 * Culling is not only about the draw. A traffic mover runs an `onUpdate` every frame evaluating a
 * spline; a fog cloud runs an infinite yoyo. `setVisible(false)` stops neither, so an entry may
 * carry a tween to pause with it — that is usually the larger half of the saving.
 */
import type Phaser from 'phaser';

/** What an object is, so a quality tier can drop a whole class of them when zoomed out. */
export type CullKind = 'node' | 'label' | 'flag' | 'army' | 'traffic' | 'cloud';

export interface CullEntry {
  /** What kind of thing this is, for the zoom LOD. */
  kind: CullKind;
  object?: object;
  /** World position the object is anchored at. */
  x: number;
  y: number;
  /**
   * How far from that anchor the object actually paints. A settlement node reaches well below and
   * to the side of its land centre, and popping in at the screen edge is worse than drawing a few
   * extra objects — so this is deliberately generous.
   */
  radius: number;
  /** Full world bounds, when available; radius remains the fallback for Graphics. */
  bounds?: { left: number; top: number; right: number; bottom: number };
  /** Called only when the object crosses in or out of view, never per frame. */
  setCulled(culled: boolean): void;
}

interface IndexedEntry extends CullEntry {
  id: string;
  active: boolean;
  culled: boolean;
  visitedAt: number;
  visibleAt: number;
}
const DEFAULT_CELL_SIZE = 256;

export class ViewIndex {
  private readonly cellSize: number;
  private readonly entries = new Map<string, IndexedEntry>();
  private readonly cells = new Map<string, Set<IndexedEntry>>();
  /** Which cell each id currently sits in, so a move can leave the old one. */
  private readonly placement = new Map<string, string[]>();
  private visible: IndexedEntry[] = [];
  private dirty = new Set<string>();
  private nextVisible: IndexedEntry[] = [];
  private query = 0;
  private culled = new Set<string>();
  /** Kinds the current quality tier has dropped at this zoom. Treated exactly as out-of-view. */
  private suppressed = new Set<CullKind>();

  constructor(cellSize: number = DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize;
  }

  /**
   * Sets which kinds are dropped regardless of where the camera is.
   *
   * Deliberately routed through the same `culled` bookkeeping as the view test rather than kept as a
   * second switch on each object: two independent reasons to hide one thing, each unaware of the
   * other, is how a cart ends up visible because the zoom changed while it was off-screen.
   */
  setSuppressed(kinds: Iterable<CullKind>): boolean {
    // The normal frame path passes one of three immutable arrays. Avoid allocating a
    // Set and a spread array simply to discover that this frame's LOD is unchanged.
    if (Array.isArray(kinds) && kinds.length === this.suppressed.size && kinds.every(kind => this.suppressed.has(kind))) return false;
    const next = new Set(kinds);
    if (next.size === this.suppressed.size && [...next].every((kind) => this.suppressed.has(kind))) {
      return false;
    }
    this.suppressed = next;
    return true;
  }

  /** Registers an object, or moves one already registered. */
  set(id: string, entry: CullEntry): void {
    const old = this.entries.get(id);
    if (old && entry.object && old.object === entry.object && old.kind === entry.kind && old.x === entry.x && old.y === entry.y && old.radius === entry.radius) {
      const a = this.bounds(old), b = this.bounds(entry);
      if (a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom) {
        // A retained settlement can have a new set of ink objects at the same bounds.
        old.setCulled = entry.setCulled;
        if (this.culled.has(id)) entry.setCulled(true);
        return;
      }
    }
    const b = this.bounds(entry);
    const keys: string[] = [];
    for (let y = Math.floor(b.top / this.cellSize); y <= Math.floor(b.bottom / this.cellSize); y++) {
      for (let x = Math.floor(b.left / this.cellSize); x <= Math.floor(b.right / this.cellSize); x++) keys.push(`${x},${y}`);
    }
    const record: IndexedEntry = old ?? { ...entry, id, active: true, culled: false, visitedAt: 0, visibleAt: 0 };
    for (const key of this.placement.get(id) ?? []) if (!keys.includes(key)) this.leave(id, key);
    for (const key of keys) {
      let bucket = this.cells.get(key);
      if (!bucket) { bucket = new Set(); this.cells.set(key, bucket); }
      bucket.add(record);
    }
    // Phaser Rectangle stores x/y/width/height; its edges are prototype getters.
    // Spreading it loses those edges and makes the precise view test accept everything.
    Object.assign(record, entry, { bounds: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } });
    this.entries.set(id, record); this.placement.set(id, keys); this.dirty.add(id);
    if (this.culled.has(id)) entry.setCulled(true);
  }

  private bounds(entry: CullEntry): { left: number; right: number; top: number; bottom: number } {
    return entry.bounds ?? { left: entry.x - entry.radius, right: entry.x + entry.radius, top: entry.y - entry.radius, bottom: entry.y + entry.radius };
  }

  private leave(id: string, key: string): void {
    const bucket = this.cells.get(key), entry = this.entries.get(id); if (entry) bucket?.delete(entry);
    if (bucket?.size === 0) this.cells.delete(key);
  }

  remove(id: string): void {
    for (const key of this.placement.get(id) ?? []) this.leave(id, key);
    const entry = this.entries.get(id); if (entry) entry.active = false;
    this.placement.delete(id); this.entries.delete(id); this.culled.delete(id); this.dirty.delete(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  clear(): void {
    this.entries.clear();
    this.cells.clear();
    this.placement.clear();
    this.culled.clear(); this.visible.length = 0; this.nextVisible.length = 0; this.dirty.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /** How many registered objects are currently culled. Read by the culling verifier. */
  get culledCount(): number {
    return this.culled.size;
  }

  /**
   * Shows what the view rectangle reaches and hides the rest.
   *
   * Only the entries that *changed* side are told, so a still camera does no work beyond the cell
   * sweep, and a slow pan touches a handful of objects per frame.
   */
  apply(view: Phaser.Geom.Rectangle, margin = 0): void {
    const left = view.x - margin;
    const top = view.y - margin;
    const right = view.right + margin;
    const bottom = view.bottom + margin;

    const visible = this.nextVisible; visible.length = 0;
    const query = ++this.query;
    const minCol = Math.floor(left / this.cellSize);
    const maxCol = Math.floor(right / this.cellSize);
    const minRow = Math.floor(top / this.cellSize);
    const maxRow = Math.floor(bottom / this.cellSize);

    for (let col = minCol; col <= maxCol; col += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const bucket = this.cells.get(`${col},${row}`);
        if (!bucket) {
          continue;
        }
        for (const entry of bucket) {
          // One numeric visit stamp avoids hashing thousands of ids several times
          // on every mouse move. Wide images belong to more than one grid cell.
          if (entry.visitedAt === query) continue;
          entry.visitedAt = query;
          // The cell sweep is a coarse pass — an object near a cell edge can sit in a cell the view
          // touches while itself lying outside it, so each candidate is checked against its own reach.
          const bounds = this.bounds(entry);
          if (bounds.right < left || bounds.left > right || bounds.bottom < top || bounds.top > bottom || this.suppressed.has(entry.kind)) continue;
          entry.visibleAt = query;
          visible.push(entry);
          if (entry.culled) this.setCulled(entry.id, false);
        }
      }
    }

    for (const entry of this.visible) if (entry.active && entry.visibleAt !== query) this.setCulled(entry.id, true);
    // Newly registered objects start visible, even when their cell was never visited.
    for (const id of this.dirty) this.setCulled(id, this.entries.get(id)?.visibleAt !== query);
    this.nextVisible = this.visible; this.visible = visible; this.dirty.clear();
  }

  private setCulled(id: string, culled: boolean): void {
    const entry = this.entries.get(id);
    if (!entry || culled === entry.culled) return;
    entry.culled = culled;
    if (culled) this.culled.add(id); else this.culled.delete(id);
    entry.setCulled(culled);
  }

  /** Reveals everything and forgets the culled set, for teardown and for the `?nocull=1` escape. */
  showAll(): void {
    for (const [id, entry] of this.entries) {
      if (entry.culled) {
        entry.culled = false;
        entry.setCulled(false);
      }
    }
    this.culled = new Set<string>();
    this.visible = [...this.entries.values()];
  }

  /** Drops every entry whose id is not in `keep`, revealing it first so nothing dies hidden. */
  retainOnly(keep: Set<string>): void {
    for (const id of [...this.entries.keys()]) {
      if (keep.has(id)) {
        continue;
      }
      if (this.culled.has(id)) {
        this.entries.get(id)?.setCulled(false);
      }
      this.remove(id);
    }
  }
}
