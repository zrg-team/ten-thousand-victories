import type Phaser from 'phaser';
import { proceduralConquestArtForced } from '../conquestMapArt';

export const BUTTERFLY_TEXTURE = 'life:butterflies-dongho-v1';
export const BUTTERFLY_FRAME_SIZE = 64;
/** Open wings fill 52 pixels; transparent padding must not determine world size. */
export const BUTTERFLY_WING_PIXELS = 52;
export const BUTTERFLY_WINGBEAT = [0, 1, 2, 1] as const;

export function preloadButterflyArt(scene: Phaser.Scene, baseUrl: string): void {
  if (proceduralConquestArtForced() || scene.textures.exists(BUTTERFLY_TEXTURE)) return;
  scene.load.spritesheet(BUTTERFLY_TEXTURE, `${baseUrl}art/life/dongho-butterflies-v1.png`, {
    frameWidth: BUTTERFLY_FRAME_SIZE, frameHeight: BUTTERFLY_FRAME_SIZE,
  });
}
