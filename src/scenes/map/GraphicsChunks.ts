import Phaser from 'phaser';
import { partitionGraphics } from './GraphicsPartition';
import { mapPreparationWorker } from './MapPreparationWorker';

export const MAP_CHUNK_SIZE = 512;
export interface GraphicCell { commands: number[]; hash: number }
const cache = new WeakMap<Phaser.GameObjects.Graphics, { version: number; length: number; transform: string; cells: Map<string, GraphicCell> }>();
const versions = new WeakMap<Phaser.GameObjects.Graphics, number>();
const lengths: Record<number, number> = { 0: 8, 1: 1, 2: 1, 3: 5, 4: 3, 5: 3, 6: 4, 7: 3, 8: 1, 9: 1, 10: 7, 11: 7, 14: 1, 15: 1, 16: 3, 17: 3, 18: 2, 21: 9, 22: 7 };
/** Partition complete paint operations, never individual edges. Paths crossing a seam retain
 * their original geometry and are clipped by the tile's padded framebuffer. No art is resampled. */
export function* graphicsCells(g: Phaser.GameObjects.Graphics, synchronous = false): Generator<void, Map<string, GraphicCell>> {
  if (!versions.has(g)) {
    versions.set(g, 0);
    const clear = g.clear;
    g.clear = function () { versions.set(g, (versions.get(g) ?? 0) + 1); return clear.call(this); };
  }
  const version = versions.get(g)!;
  const transform = [g.x, g.y, g.scaleX, g.scaleY, g.rotation].join();
  const saved = cache.get(g);
  if (saved?.version === version && saved.length === g.commandBuffer.length && saved.transform === transform) return saved.cells;
  const world = g.getWorldTransformMatrix();
  const matrix = [world.a,world.b,world.c,world.d,world.tx,world.ty]; world.destroy();
  const buffer = g.commandBuffer.slice();
  let cells: Map<string,GraphicCell>;
  const worker = !synchronous ? mapPreparationWorker(g.scene) : undefined;
  if (worker && buffer.length >= 4096) {
    const ticket = worker.partition(buffer,matrix);
    try { while (!ticket.done) yield; } finally { if (!ticket.done) ticket.cancel(); }
    cells = ticket.result ?? (yield* partitionGraphics(buffer,matrix));
  } else cells = yield* partitionGraphics(buffer,matrix);
  cache.set(g,{version,length:buffer.length,transform,cells});
  return cells;
}

/** Split only between complete save/restore-delimited primitives. */
export function* commandBatches(commands: number[]): Generator<number[]> {
  let start = 0, last = 0;
  for (let i = 0; i < commands.length;) {
    const op = commands[i]; i += lengths[op];
    if (op === 15) {
      last = i;
      if (i - start >= 2048) { yield commands.slice(start, i); start = i; }
    }
  }
  if (last > start) yield commands.slice(start, last);
}
