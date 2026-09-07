import type Phaser from 'phaser';
const textureLimits = new WeakMap<WebGLRenderingContext, number>();

/**
 * What the device's GPU will actually hold.
 *
 * The map's static bake and the fog bake are sized `world × BAKE_SCALE`, and a big revealed world
 * on a high tier asks for textures past 4096 on a side — the floor `MAX_TEXTURE_SIZE` on the
 * mid-tier phones this game targets. Phaser does not clamp a RenderTexture to the limit; the GL
 * call fails and the bake silently renders black. So every RT that scales with the world asks
 * here first.
 */
export function maxTextureSize(scene: Phaser.Scene): number {
  const renderer = scene.game.renderer as { gl?: WebGLRenderingContext };
  const gl = renderer.gl;
  if (!gl) {
    return 4096; // Canvas fallback: no hard GL limit; 4096 keeps memory sane anyway.
  }
  const cached = textureLimits.get(gl); if (cached) return cached;
  const reported = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number | null;
  const limit = typeof reported === 'number' && reported > 0 ? reported : 4096;
  textureLimits.set(gl, limit); return limit;
}

/**
 * The largest bake scale ≤ `wanted` whose texture fits the device limit.
 *
 * Returns `wanted` untouched on any machine where it fits — which is every desktop and most
 * phones — and steps down only as far as the limit forces. A bake at a reduced scale is soft;
 * a bake past the limit is black.
 */
export function fitBakeScale(
  scene: Phaser.Scene,
  worldWidth: number,
  worldHeight: number,
  wanted: number,
): number {
  const limit = maxTextureSize(scene);
  const longest = Math.max(worldWidth, worldHeight);
  if (longest <= 0) {
    return wanted;
  }
  return Math.min(wanted, limit / Math.ceil(longest));
}
