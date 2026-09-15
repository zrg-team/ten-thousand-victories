import type Phaser from 'phaser';
import { proceduralConquestArtForced } from '../conquestMapArt';

export type RiceFieldVersion = 'carved' | 'jade' | 'harvest';
export type RiceFieldStage = 'flooded' | 'fallow' | 'nursery' | 'transplanted' | 'ripe';
const FRAMES: Record<RiceFieldStage, number> = { flooded: 0, fallow: 1, nursery: 2, transplanted: 3, ripe: 4 };

/** Preserve every reviewed candidate and the original for reproducible in-game comparison. */
export function riceFieldVersion(): RiceFieldVersion | undefined {
  if (proceduralConquestArtForced()) return;
  const requested = new URLSearchParams(location.search).get('riceart');
  return requested === 'carved' || requested === 'jade' || requested === 'harvest' ? requested : undefined;
}

export function preloadRiceFieldArt(scene: Phaser.Scene, baseUrl: string): void {
  const version = riceFieldVersion();
  if (!version) return;
  const key = `dongho-rice:${version}-v1`;
  if (!scene.textures.exists(key)) scene.load.spritesheet(key, `${baseUrl}art/terrain/rice-${version}-v1.webp`, {
    frameWidth: 256, frameHeight: 160, endFrame: 4,
  });
}

export function riceFieldTexture(scene: Phaser.Scene): string | undefined {
  const version = riceFieldVersion();
  if (!version) return;
  const key = `dongho-rice:${version}-v1`;
  if (!scene.textures.exists(key)) return;
  const texture = scene.textures.get(key);
  return Object.values(FRAMES).every(frame => texture.has(String(frame))) ? key : undefined;
}

export function riceFieldFrame(stage: RiceFieldStage): number { return FRAMES[stage]; }
