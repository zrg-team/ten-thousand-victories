/**
 * The renderer decisions this game makes about the device it woke up on.
 *
 * Everything here is a Phaser default the game had never chosen. `git log -S` finds no commit in
 * `src/` that ever set `autoMobileTextures`, `antialiasGL`, `failIfMajorPerformanceCaveat` or
 * `mipmapFilter` — the FPS playbook listed them as "engine knobs, in the order to try them" and
 * they were never tried. Two of them are actively wrong for this game on a phone, and one hides a
 * failure mode that no tier system can explain.
 *
 * Every knob is a three-state flag rather than a boolean, and reads a URL parameter or a stored
 * value before falling back to what the device suggests, so a harness can measure the same build
 * both ways in one session instead of comparing two builds.
 */
import type Phaser from 'phaser';
import { isDesktopPlatform } from '../platform/layout';

type Choice = 'on' | 'off' | 'auto';

/** `?name=on|off|auto`, else the stored value, else `auto`. Read once: a URL cannot change under a running page. */
function choice(name: string, storageKey: string): Choice {
  if (typeof window === 'undefined') return 'auto';
  const url = new RegExp(`[?&]${name}=(on|off|auto|1|0)\b`).exec(window.location.search);
  const raw = url ? url[1] : (() => {
    try { return localStorage.getItem(storageKey); } catch { return null; }
  })();
  if (raw === 'on' || raw === '1') return 'on';
  if (raw === 'off' || raw === '0') return 'off';
  return 'auto';
}

export const textureUnitChoice = choice('texunits', 'mandate:render:texunits:v1');
export const antialiasChoice = choice('aa', 'mandate:render:aa:v1');
export const strictContextChoice = choice('strictgl', 'mandate:render:strictgl:v1');

/**
 * Whether the drawing buffer is multisampled.
 *
 * `antialiasGL` becomes the context's `antialias` attribute, which is MSAA on the default
 * framebuffer — resolved in full every frame, and on a tiled mobile GPU that resolve is bandwidth,
 * the one thing a Mali-G52-class part has least of. This game does not need it above render scale
 * 1: the buffer is already 2 or 3 times the 390-wide design surface, so every vector edge is
 * supersampled and then box-filtered down by the panel, and `roundPixels` puts every quad on an
 * integer. No camera is filtered any more either (the paper pass is off at every shipped tier), so
 * nothing is left that MSAA is the right tool for.
 *
 * Kept ON at scale 1, where the buffer is the design surface and a hairline has nothing to spare.
 * `render.antialias` — the texture filter — is deliberately untouched; turning that off would
 * change the art.
 */
export function wantsMultisampling(renderScale: number): boolean {
  if (antialiasChoice !== 'auto') return antialiasChoice === 'on';
  return renderScale <= 1;
}

/** Whether context creation should refuse a software rasteriser. Off by default — see `softwareRenderer`. */
export function wantsStrictContext(): boolean {
  return strictContextChoice === 'on';
}

/**
 * How many textures one batch may bind.
 *
 * Phaser's `autoMobileTextures` defaults to true, which sets `maxParallelTextureUnits` to **1** on
 * any non-desktop device: every distinct texture becomes its own draw call. That default assumes a
 * game whose art is not atlased. This one's is — seven pages under `public/art/atlases/` — and its
 * own retained scenery node samples eight textures in a single shader. Measured on the Conquest
 * map at 16 units: 62 draw calls against 134 texture binds. At one unit those binds are the draw
 * count.
 *
 * The value is settable at runtime (`RenderNodeManager.setMaxParallelTextureUnits` clamps to
 * `[1, maxTextures]` and fires the event the batch handlers rebuild their shaders from), so this is
 * a call after boot rather than a config key — no reload to measure it both ways, and desktop is
 * left alone.
 *
 * `auto` stops at 8 rather than taking the maximum: selecting between 16 samplers is a 16-branch
 * chain in the fragment shader, and on a small GPU that per-fragment cost can eat the draw calls it
 * saves. Eight is the middle of the range and the point to measure from.
 */
export function applyTextureUnits(game: Phaser.Game): number {
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const nodes = renderer?.renderNodes;
  if (!nodes?.setMaxParallelTextureUnits) return 1;
  const max = renderer.maxTextures ?? 1;
  const want = textureUnitChoice === 'off' ? 1
    : textureUnitChoice === 'on' ? max
      : Math.min(max, 8);
  nodes.setMaxParallelTextureUnits(want);
  return nodes.maxParallelTextureUnits;
}

/**
 * The name of the software rasteriser this page is running on, or `undefined` on a real GPU.
 *
 * `failIfMajorPerformanceCaveat` defaults to false, so a device whose GPU is blocklisted — a driver
 * on Chrome's deny list, a phone in a broken state, a VM — is handed a **software** context and the
 * whole game rasterises on the CPU. It does not fail; it is simply four to ten times too slow, and
 * no tier the ladder can pick will save it. Nothing detected this before.
 *
 * Turning the caveat flag on instead would be worse than the disease: `Phaser.AUTO` would fall back
 * to Canvas, and this game cannot run on Canvas — `RetainedMapRenderer` casts the renderer to
 * `WebGLRenderer` and registers a custom GLSL render node inside `MapScene.create`, so the fallback
 * is a crash, not a degraded mode. Detecting and demoting keeps the game running.
 */
export function softwareRenderer(game: Phaser.Game): string | undefined {
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const gl = renderer?.gl;
  if (!gl) return 'canvas';
  let name = '';
  try {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    name = String((debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  } catch { return undefined; }
  return /swiftshader|llvmpipe|software|softwarerasterizer|microsoft basic render|angle \(software/i.test(name)
    ? name : undefined;
}

/** Published for a bug report, and for the harnesses that record which rig a number came from. */
export function renderDiagnosis(game: Phaser.Game): Record<string, unknown> {
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  return {
    textureUnits: renderer?.renderNodes?.maxParallelTextureUnits,
    maxTextures: renderer?.maxTextures,
    multisampled: renderer?.gl?.getContextAttributes?.()?.antialias,
    software: softwareRenderer(game) ?? false,
    desktop: isDesktopPlatform(),
    choices: { texunits: textureUnitChoice, aa: antialiasChoice, strictgl: strictContextChoice },
  };
}
