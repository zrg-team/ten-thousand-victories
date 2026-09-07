import Phaser from 'phaser';

export const MAP_CHUNK_SIZE = 512;
export interface GraphicCell { commands: number[]; hash: number }
const cache = new WeakMap<Phaser.GameObjects.Graphics, { version: number; length: number; transform: string; cells: Map<string, GraphicCell> }>();
const versions = new WeakMap<Phaser.GameObjects.Graphics, number>();
const lengths: Record<number, number> = { 0: 8, 1: 1, 2: 1, 3: 5, 4: 3, 5: 3, 6: 4, 7: 3, 8: 1, 9: 1, 10: 7, 11: 7, 14: 1, 15: 1, 16: 3, 17: 3, 18: 2, 21: 9, 22: 7 };
const bits = new Float64Array(1);
const words = new Int32Array(bits.buffer);
function hash(h: number, value: number): number {
  bits[0] = value;
  return Math.imul(Math.imul(h ^ words[0], 16777619) ^ words[1], 16777619);
}

/** Partition complete paint operations, never individual edges. Paths crossing a seam retain
 * their original geometry and are clipped by the tile's padded framebuffer. No art is resampled. */
export function* graphicsCells(g: Phaser.GameObjects.Graphics): Generator<void, Map<string, GraphicCell>> {
  if (!versions.has(g)) {
    versions.set(g, 0);
    const clear = g.clear;
    g.clear = function () { versions.set(g, (versions.get(g) ?? 0) + 1); return clear.call(this); };
  }
  const version = versions.get(g)!;
  const transform = [g.x, g.y, g.scaleX, g.scaleY, g.rotation].join();
  const saved = cache.get(g);
  if (saved?.version === version && saved.length === g.commandBuffer.length && saved.transform === transform) return saved.cells;
  const buffer = g.commandBuffer.slice();
  const cells = new Map<string, GraphicCell>();
  let fill = [7, 0xffffff, 1], line = [6, 1, 0xffffff, 1];
  let path: number[] = [], points: number[] = [], transforms: number[] = [];
  const stack: number[] = [];
  const local = new Phaser.GameObjects.Components.TransformMatrix();
  const world = g.getWorldTransformMatrix();
  const combined = new Phaser.GameObjects.Components.TransformMatrix();
  const add = (command: number[], xy: number[]) => {
    if (!xy.length) return;
    local.loadIdentity();
    for (let i = 0; i < transforms.length;) {
      const op = transforms[i++];
      if (op === 16) { local.translate(transforms[i++], transforms[i++]); }
      else if (op === 17) { local.scale(transforms[i++], transforms[i++]); }
      else local.rotate(transforms[i++]);
    }
    world.multiply(local, combined);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < xy.length; i += 2) {
      const x = combined.getX(xy[i], xy[i + 1]), y = combined.getY(xy[i], xy[i + 1]);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    const pad = Math.max(4, Math.abs(line[1]) * Math.max(Math.abs(combined.scaleX), Math.abs(combined.scaleY)) * 2);
    const primitive = [14, ...transforms, ...fill, ...line, ...command, 15];
    for (let y = Math.floor((top - pad) / MAP_CHUNK_SIZE); y <= Math.floor((bottom + pad) / MAP_CHUNK_SIZE); y++) {
      for (let x = Math.floor((left - pad) / MAP_CHUNK_SIZE); x <= Math.floor((right + pad) / MAP_CHUNK_SIZE); x++) {
        const key = `${x},${y}`;
        let cell = cells.get(key);
        if (!cell) { cell = { commands: [], hash: 2166136261 }; cells.set(key, cell); }
        for (const value of primitive) { cell.commands.push(value); cell.hash = hash(cell.hash, value); }
      }
    }
  };
  for (let i = 0, steps = 0; i < buffer.length;) {
    const op = buffer[i], length = lengths[op];
    if (!length) throw new Error(`Unsupported Phaser graphics command ${op}`);
    const command = buffer.slice(i, i + length); i += length;
    switch (op) {
      case 7: case 21: fill = command; break;
      case 6: case 22: line = command; break;
      case 14: stack.push(transforms.length); break;
      case 15: transforms.length = stack.pop() ?? 0; break;
      case 16: case 17: case 18: transforms.push(...command); break;
      case 1: path = [1]; points = []; break;
      case 2: path.push(2); break;
      case 4: case 5: path.push(...command); points.push(command[1], command[2]); break;
      case 0: {
        path.push(...command);
        const [, x, y, r] = command;
        points.push(x - r, y - r, x + r, y - r, x + r, y + r, x - r, y + r); break;
      }
      case 8: case 9: add([...path, op], points); break;
      case 3: { const [, x, y, w, h] = command; add(command, [x, y, x + w, y, x + w, y + h, x, y + h]); break; }
      case 10: case 11: add(command, command.slice(1)); break;
    }
    if (++steps % 128 === 0) yield;
  }
  cache.set(g, { version, length: buffer.length, transform, cells });
  local.destroy(); world.destroy(); combined.destroy();
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
