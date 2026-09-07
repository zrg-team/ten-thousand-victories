import type Phaser from 'phaser';
import { qualityLadder } from '../../game/qualityLadder';
const frames = new WeakMap<Phaser.Scene, { time: number; spent: number }>();
const clients = new WeakMap<Phaser.Scene, Set<() => boolean>>();
export function registerMapWork(scene: Phaser.Scene, pending: () => boolean): () => void {
  let set = clients.get(scene);
  if (!set) { set = new Set(); clients.set(scene, set); }
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
  const allowance = Math.max(3, Math.min(6, 180 / fps));
  // Only active queues share the allowance. Reserving two thirds for idle clients
  // made the final chunk stage needlessly slow, particularly under CPU throttling.
  // A single bounded primitive may overshoot; subsequent clients then wait for the next frame.
  const active = Math.max(1, [...clients.get(scene) ?? []].filter(pending => pending()).length);
  const remaining = Math.min(useRemainder ? allowance : allowance / active, allowance - frame.spent);
  const start = performance.now(); work(Math.max(0, remaining)); frame.spent += performance.now() - start;
}
