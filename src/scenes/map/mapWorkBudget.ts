import type Phaser from 'phaser';
import { qualityLadder } from '../../game/qualityLadder';
const frames = new WeakMap<Phaser.Scene, { time: number; spent: number }>();
const clients = new WeakMap<Phaser.Scene, Set<() => boolean>>();
const timings = new WeakMap<Phaser.Scene, { start:number; baseMs:number }>();
export function registerMapWork(scene: Phaser.Scene, pending: () => boolean): () => void {
  let set = clients.get(scene);
  if (!set) {
    set = new Set(); clients.set(scene, set);
    const timing={start:0,baseMs:8};timings.set(scene,timing);
    const pre=()=>{timing.start=performance.now();};
    const post=()=>{
      const frame=frames.get(scene);
      const base=Math.max(0,performance.now()-timing.start-(frame?.time===scene.time.now?frame.spent:0));
      // React immediately to a busy frame; release headroom gradually after it.
      timing.baseMs=Math.max(base,timing.baseMs*.8+base*.2);
    };
    scene.game.events.on('prestep',pre);scene.game.events.on('postrender',post);
    scene.events.once('shutdown',()=>{scene.game.events.off('prestep',pre);scene.game.events.off('postrender',post);clients.delete(scene);frames.delete(scene);timings.delete(scene);});
  }
  set.add(pending);
  return () => set!.delete(pending);
}
/** Ground, fog and seasonal path generation share this one frame allowance. */
export function mapWork(scene: Phaser.Scene, work: (remainingMs: number) => void, useRemainder = false): void {
  let frame = frames.get(scene);
  const time = scene.time.now;
  if (!frame || frame.time !== time) { frame = { time, spent: 0 }; frames.set(scene, frame); }
  const fps = qualityLadder()?.targetFps() ?? 60;
  // Keep the same share of frame time: 3 ms at 60, 4.5 ms at 40, 6 ms at legacy 30.
  const minimum = Math.max(3, Math.min(6, 180 / fps));
  // Spend otherwise unused frame time finishing visible content. Keep at least
  // 3 ms for scheduling/compositing and cap preparation at 8 ms even on fast GPUs.
  // Busy devices fall back to the original bounded allowance.
  const allowance = Math.max(minimum,Math.min(8,1000/fps-(timings.get(scene)?.baseMs??8)-3));
  // Only active queues share the allowance. Reserving two thirds for idle clients
  // made the final chunk stage needlessly slow, particularly under CPU throttling.
  // A single bounded primitive may overshoot; subsequent clients then wait for the next frame.
  let active = 0;
  for (const pending of clients.get(scene) ?? []) if (pending()) active++;
  active = Math.max(1, active);
  const remaining = Math.min(useRemainder ? allowance : allowance / active, allowance - frame.spent);
  const start = performance.now(); work(Math.max(0, remaining)); frame.spent += performance.now() - start;
}
