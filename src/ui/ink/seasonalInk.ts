import type Phaser from 'phaser';
type G = Phaser.GameObjects.Graphics;
interface Mark { start: number; end: number; paint(g: G): void }
const marks = new WeakMap<G, Mark[]>();
let capturing = 0;
export function captureSeasonalInk<T>(build: () => T): T { capturing++; try { return build(); } finally { capturing--; } }
export function seasonalMark(g: G, paint: (g: G) => void): void {
  const start = g.commandBuffer.length; paint(g);
  if (!capturing) return;
  const list = marks.get(g) ?? []; list.push({ start, end: g.commandBuffer.length, paint }); marks.set(g, list);
}
/** Replace only recorded vegetation paths. Structures, images, input, motion and labels survive. */
export function repaintSeasonalInk(g: G): void {
  const list = marks.get(g); if (!list?.length) return;
  const original = g.commandBuffer, next: number[] = [], scratch = g.scene.make.graphics({}, false);
  let end = 0;
  for (const mark of list) {
    for (let i = end; i < mark.start; i++) next.push(original[i]);
    end = mark.end; scratch.clear(); mark.paint(scratch); mark.start = next.length;
    for (const value of scratch.commandBuffer) next.push(value);
    mark.end = next.length;
  }
  for (let i = end; i < original.length; i++) next.push(original[i]);
  g.clear(); g.commandBuffer = next; scratch.destroy();
}
