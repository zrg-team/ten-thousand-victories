import type Phaser from 'phaser';
import type { LandscapeContext } from '../MapRenderer';
import { proceduralConquestArtForced } from '../conquestMapArt';
import { tileAssetsEnabled } from '../../game/groundSettings';

const mod = (n: number, d: number): number => ((n % d) + d) % d;

function requestedVersion(): 'v1' | 'v2' | undefined {
  const params = new URLSearchParams(location.search);
  if (params.get('naturalground') === '0' || proceduralConquestArtForced()) return;
  // V1 is the selected ground for ordinary launches. Keep both earlier looks
  // reachable for comparison without making the chosen art require a preview URL.
  if (params.get('groundart') === 'paper') return;
  return params.get('groundart') === 'grass-v2' ? 'v2' : 'v1';
}

export function preloadGrassGround(scene: Phaser.Scene, baseUrl: string): void {
  // Keep the selected atlas ready even when Settings disables its use. Enabling
  // it later from the menu must work without reloading the application.
  const version = requestedVersion();
  if (!version) return;
  const texture = `dongho-ground:grass-${version}`;
  if (scene.textures.exists(texture)) return;
  scene.load.spritesheet(texture, `${baseUrl}art/ground/dongho-grass-${version}.webp`, {
    frameWidth: 128, frameHeight: 144,
  });
}

export function hasGrassGround(scene: Phaser.Scene): boolean {
  return grassGroundTexture(scene) !== undefined;
}

/** The ready atlas selected by the same preference and overrides as the map. */
export function grassGroundTexture(scene: Phaser.Scene): string | undefined {
  const version = requestedVersion();
  const texture = `dongho-ground:grass-${version}`;
  return tileAssetsEnabled() && version && scene.textures.exists(texture) ? texture : undefined;
}

/** Fill a rectangular field with connected atlas samples, flattened into ground perspective. */
export function createGrassGroundArea(
  scene: Phaser.Scene, bounds: { x: number; y: number; width: number; height: number },
  radius = 48, flatten = 0.45,
): Phaser.GameObjects.Container | undefined {
  const texture = grassGroundTexture(scene);
  if (!texture || bounds.width <= 0 || bounds.height <= 0) return;
  const layer = scene.add.container(0, 0).setData('grassGroundArea', texture);
  const sx = radius / 64, sy = sx * flatten;
  const dx = Math.sqrt(3) * radius, dy = radius * 1.5 * flatten;
  const width = 128 * sx, height = 144 * sy;
  for (let row = -1; row <= Math.ceil(bounds.height / dy) + 1; row++) {
    for (let column = -1; column <= Math.ceil(bounds.width / dx) + 1; column++) {
      const x = bounds.x + (column + mod(row, 2) / 2) * dx;
      const y = bounds.y + row * dy;
      const left = Math.max(bounds.x, x - width / 2);
      const top = Math.max(bounds.y, y - height / 2);
      const right = Math.min(bounds.x + bounds.width, x + width / 2);
      const bottom = Math.min(bounds.y + bounds.height, y + height / 2);
      if (right <= left || bottom <= top) continue;
      const image = scene.add.image(x, y, texture, mod(row, 4) * 4 + mod(column, 4))
        .setDisplaySize(width, height);
      // Crop only the boundary samples. This survives the field's RenderTexture bake
      // without a second stencil and preserves the atlas phase across every join.
      image.setCrop((left - x + width / 2) / sx, (top - y + height / 2) / sy,
        (right - left) / sx, (bottom - top) / sy);
      layer.add(image);
    }
  }
  return layer;
}

/**
 * One continuous world-aligned grass material. Frame choice is its UV phase,
 * never a random variant: neighbouring samples meet at the same texture point.
 * The shared atlas avoids per-cell masks or separate canvas/GPU textures. All
 * source images enter the existing static ground chunks; no live grass layer.
 */
export function* paintGrassGround(
  scene: Phaser.Scene, ctx: LandscapeContext,
): Generator<Phaser.GameObjects.Image | undefined> {
  const active = hasGrassGround(scene);
  const texture = `dongho-ground:grass-${requestedVersion()}`;
  const stats = { active, cells: 0, atlas: active ? texture : null };
  ctx.graphics.setData('grassGround', stats);
  if (!active) return;
  const scale = ctx.tileSize / 64;
  for (const tile of ctx.tiles) {
    yield;
    if (tile.terrain === 'water' || !ctx.isVisible(tile)) continue;
    const {q,r} = tile.coord;
    const column = mod(q + Math.floor(r / 2), 4), row = mod(r, 4);
    const at = ctx.centreOf(tile);
    const image = scene.add.image(at.x, at.y, texture, row * 4 + column)
      .setDisplaySize(128 * scale, 144 * scale).setDepth(0.01)
      .setData('grassGroundCell', `${q},${r}`);
    stats.cells++;
    yield image;
  }
}
