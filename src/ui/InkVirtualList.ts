import Phaser from 'phaser';
import type { InkScrollArea } from './InkUI';

export interface VirtualRow<T> {
  key(item: T): string;
  measure(item: T): number;
  top?(item: T): number;
  create(): Phaser.GameObjects.Container;
  bind(row: Phaser.GameObjects.Container, item: T): void;
  unbind?(row: Phaser.GameObjects.Container): void;
  dispose?(row: Phaser.GameObjects.Container): void;
}

/** Variable-height rows, with a bounded set of holders and no offscreen hit targets. */
export class InkVirtualList<T> {
  private items: readonly T[] = [];
  private starts: number[] = [0];
  private ends: number[] = [];
  private mounted = new Map<number, Phaser.GameObjects.Container>();
  private spare: Phaser.GameObjects.Container[] = [];
  private stop: () => void;
  private disposed = false;

  constructor(private area: InkScrollArea, private rows: VirtualRow<T>, items: readonly T[] = []) {
    this.stop = area.onScroll(() => this.sync());
    area.onDispose(() => this.destroy());
    this.setItems(items);
  }

  setItems(items: readonly T[]): void {
    const oldIndex = this.indexAt(this.area.offset);
    const anchor = this.items[oldIndex];
    const key = anchor === undefined ? undefined : this.rows.key(anchor);
    const inset = this.area.offset - (this.starts[oldIndex] ?? 0);
    for (const row of this.mounted.values()) this.release(row);
    this.mounted.clear();
    this.items = items;
    this.starts = [0]; this.ends = [];
    for (let i = 0; i < items.length; i++) {
      if (this.rows.top) this.starts[i] = this.rows.top(items[i]);
      this.ends[i] = this.starts[i] + Math.max(1, this.rows.measure(items[i]));
      this.starts[i + 1] = this.ends[i];
    }
    if (!this.rows.top) this.area.setContentHeight(this.starts.at(-1)!);
    const next = key === undefined ? -1 : items.findIndex(item => this.rows.key(item) === key);
    if (next >= 0) this.area.setScroll(this.starts[next] + inset);
    this.sync();
  }

  private indexAt(y: number): number {
    let lo = 0, hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.ends[mid] <= y) lo = mid + 1; else hi = mid;
    }
    return Math.min(lo, Math.max(0, this.items.length - 1));
  }

  private release(row: Phaser.GameObjects.Container): void {
    this.rows.unbind?.(row);
    row.setVisible(false).setActive(false);
    this.area.content.remove(row);
    if (this.spare.length < 4) this.spare.push(row);
    else this.disposeRow(row);
  }

  private disposeRow(row: Phaser.GameObjects.Container): void {
    if (this.rows.dispose) this.rows.dispose(row); else row.destroy(true);
  }

  sync(): void {
    if (this.disposed || this.items.length === 0) return;
    const first = this.indexAt(this.area.offset), last = this.indexAt(this.area.offset + this.area.bounds.height);
    const from = Math.max(0, first - 2), to = Math.min(this.items.length - 1, last + 2);
    for (const [i, row] of this.mounted) if (i < from || i > to) {
      this.mounted.delete(i); this.release(row);
    }
    for (let i = from; i <= to; i++) {
      let row = this.mounted.get(i);
      if (!row) {
        row = this.spare.pop() ?? this.rows.create();
        this.rows.bind(row, this.items[i]);
        this.area.content.add(row);
        this.mounted.set(i, row);
      }
      const visible = this.ends[i] > this.area.offset && this.starts[i] < this.area.offset + this.area.bounds.height;
      row.setPosition(0, this.starts[i]).setActive(visible).setVisible(visible);
      row.setData('virtualKey', this.rows.key(this.items[i]));
    }
  }

  stats(): { total: number; mounted: number; spare: number } {
    return { total: this.items.length, mounted: this.mounted.size, spare: this.spare.length };
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.stop();
    for (const row of [...this.mounted.values(), ...this.spare]) this.disposeRow(row);
    this.mounted.clear(); this.spare = [];
  }
}

/** Measure wrapping using Phaser's own font metrics, without rasterising a canvas per string. */
const rulers = new WeakMap<Phaser.Scene, Map<string, Phaser.GameObjects.Text>>();
const heights = new Map<string, number>();
export function measureInkText(scene: Phaser.Scene, value: string, style: Phaser.Types.GameObjects.Text.TextStyle): number {
  const key = JSON.stringify(style);
  const cacheKey = key + '\0' + value;
  const cached = heights.get(cacheKey);
  if (cached !== undefined) return cached;
  let pool = rulers.get(scene);
  if (!pool) {
    pool = new Map(); rulers.set(scene, pool);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const ruler of pool!.values()) ruler.destroy();
      rulers.delete(scene); heights.clear();
    });
  }
  let ruler = pool.get(key);
  if (!ruler) {
    ruler = scene.make.text({ text: '', style: { ...style, resolution: 1 } }, false);
    pool.set(key, ruler);
  }
  const lines = ruler.runWordWrap(value).split(/\r\n|\r|\n/).length;
  const result = ruler.style.getTextMetrics().fontSize * lines + (style.lineSpacing ?? 0) * (lines - 1);
  if (heights.size >= 2048) heights.delete(heights.keys().next().value!);
  heights.set(cacheKey, result);
  return result;
}
