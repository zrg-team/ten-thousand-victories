import Phaser from 'phaser';
import { layoutKind } from '../../platform/layout';
import { PIGMENT } from './palette';

/**
 * The map's lens and the map's material — the Settings page's map filters. Off by default on the
 * phone; the desktop sheet opens on Sa bàn at 30% with far clouds (`DESKTOP_DEFAULTS`). One shader on the MAP camera only: the HUD scene draws over it afterwards and stays
 * sharp, as do the fight screen and every page.
 *
 * Two families, chosen separately and combinable:
 *
 * **Depth** — where the viewer stands.
 *  · focus    — a sharp band where the eye rests; the far (top) edge softens quickly, the near
 *               (bottom) edge more slowly, the way a lens over a model table does
 *  · air      — distance loses colour and gains paper: aerial perspective, and the "far distance" of
 *               Guo Xi's landscapes, painted in mist rather than shadow
 *  · presence — the focus band keeps a little more colour, so the middle stands forward
 *  · clouds   — soft banks over the far ground, anchored to the world so they stay put as it pans
 *  · sa bàn   — tilt-shift photography: the generals' sand table. A narrow band, a hard blur, and
 *               the toy-bright colour and contrast that make a real landscape read as a model
 *
 * **Material** — what the map is made of. Each one is a craft or a record this country actually
 * kept, not a generic retro filter:
 *  · pixel  — the map re-woven from the printer's own pigments only, in world-anchored cells, with an
 *             ordered dither so the haze between colours reads as the reference's dot screen
 *  · stitch — tranh thêu, the embroidered picture (Quất Động's craft): every cell a cross-stitch in a
 *             pigment-coloured thread, with the bare cloth left where the ground is paper
 *  · ink    — the court map (the Hồng Đức atlas register): everything in soot and indigo wash on the
 *             sheet, with only sỏi son left in colour — the player's red, which is exactly the one
 *             colour the reference keeps
 *  · photo  — the 1900s albumen print: sepia, a soft halation, edges that fall off into the light
 *             — and the player's red hand-tinted, as the postcards of the period were
 *  · silk   — tranh lụa: a lifted, low-contrast, warm sheet where the ink breathes into the silk
 *
 * Never darker: haze, cloud and photo edges all go toward the điệp paper or lighter — the sheet is
 * the brightest thing in a Đông Hồ print, and darkening the ground has been measured and rejected
 * twice. No grain or texture is laid over open ground either (also rejected); the stitch style
 * leaves paper as flat cloth for that reason.
 *
 * Cost: one extra framebuffer pass on the map camera while anything is on, nothing while all is off
 * (an inactive controller is skipped). Blur is a 12-tap disc, pixel cells take 4 taps, and a pixel in
 * the focus band with no style takes one. Phaser's own TiltShift is a 100-tap bokeh.
 */

export const DEPTH_FILTERS = ['off', 'mist', 'tilt', 'deep', 'lens', 'miniature'] as const;
export type DepthFilterId = typeof DEPTH_FILTERS[number];
export const MAP_STYLES = ['off', 'pixel', 'stitch', 'ink', 'photo', 'silk'] as const;
export type MapStyleId = typeof MAP_STYLES[number];

export interface DepthSettings {
  filter: DepthFilterId;
  style: MapStyleId;
  /** How heavy the depth look is, 0..1 — the Settings slider. */
  depthAmount: number;
  /** How heavy the material look is, 0..1 — its own slider. */
  styleAmount: number;
  clouds: boolean;
}

const STORAGE_KEY = 'mandate:map-depth:v1';
const DEFAULTS: DepthSettings = { filter: 'off', style: 'off', depthAmount: 0.5, styleAmount: 0.65, clouds: false };
/**
 * The desktop sheet opens on the sand table — Sa bàn at 30% with the far clouds — the look the user
 * picked for it. Only the desktop layout: its wide map is where a focus band has room to read, and a
 * phone column keeps the plain print. A default only; the first choice a player makes is stored and
 * wins from then on, "off" included.
 */
const DESKTOP_DEFAULTS: DepthSettings = { ...DEFAULTS, filter: 'miniature', depthAmount: 0.3, clouds: true };

function defaultSettings(): DepthSettings {
  return layoutKind() === 'desktop' ? DESKTOP_DEFAULTS : DEFAULTS;
}
/**
 * The depth slider's full travel reaches a little past the first tuning's "medium" (1.2 of it), and
 * its default half-way sits at 0.6 — the gentle level the user settled on after calling the first
 * tuning too much.
 */
const DEPTH_GAIN = 1.2;
/** The tile choices the sliders replaced, for a store written before them. */
const LEGACY_STRENGTH: Record<string, [number, number]> = { soft: [0.3, 0.4], medium: [0.5, 0.65], strong: [0.83, 1] };

function amount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export const DEPTH_FX_KEY = 'MapDepthFX';

interface DepthPreset {
  /** Focus band centre, 0 = bottom of the screen, 1 = top. */
  focus: number;
  /** Half-height of the sharp band. */
  band: number;
  /** How far past the band the effects take to reach full. */
  feather: number;
  /** Blur radius at full depth, in hundredths of the screen height. */
  blur: number;
  mist: number;
  mute: number;
  presence: number;
  /** Rounded viewfinder corners going soft and pale. */
  lens: number;
  /** Whole-frame saturation gain — the toy colour of a tilt-shift photograph. */
  saturation: number;
  /** Whole-frame contrast gain, pivoted high so the paper holds and only the ink deepens. */
  contrast: number;
}

const FLAT: DepthPreset = { focus: 0.5, band: 2, feather: 1, blur: 0, mist: 0, mute: 0, presence: 0, lens: 0, saturation: 0, contrast: 0 };

const PRESETS: Record<DepthFilterId, DepthPreset> = {
  off: FLAT,
  mist: { ...FLAT, band: 0.12, feather: 0.36, mist: 0.55, mute: 0.5, presence: 0.12 },
  tilt: { ...FLAT, band: 0.12, feather: 0.3, blur: 0.8 },
  deep: { ...FLAT, band: 0.13, feather: 0.34, blur: 0.6, mist: 0.45, mute: 0.45, presence: 0.12, lens: 0.35 },
  lens: { ...FLAT, band: 0.07, feather: 0.34, blur: 1.1, mist: 0.3, mute: 0.8, presence: 0.15, lens: 0.9 },
  miniature: { ...FLAT, band: 0.08, feather: 0.26, blur: 1.35, saturation: 0.24, contrast: 0.2 },
};

const STYLE_INDEX: Record<MapStyleId, number> = { off: 0, pixel: 1, stitch: 2, ink: 3, photo: 4, silk: 5 };

/** The pigments a cell may be re-woven from: the printer's own list, nothing invented. */
const WEAVE: number[] = [
  PIGMENT.diep, PIGMENT.diepHi, PIGMENT.diepLo, PIGMENT.diepWarm, PIGMENT.diepDeep,
  PIGMENT.muc, PIGMENT.mucSoft, PIGMENT.mucFaint,
  PIGMENT.son, PIGMENT.sonPale,
  PIGMENT.cham, PIGMENT.chamPale,
  PIGMENT.tram, PIGMENT.tramPale, PIGMENT.tramDeep,
  PIGMENT.giDong, PIGMENT.giDongPale,
  PIGMENT.hoe, PIGMENT.hoePale, PIGMENT.nau,
];

function glslColour(hex: number): string {
  const c = (shift: number) => (((hex >> shift) & 0xff) / 255).toFixed(4);
  return `vec3(${c(16)}, ${c(8)}, ${c(0)})`;
}

/** GLSL ES 1.0 has no constant arrays, so the nearest-pigment search is written out long-hand. */
function nearestPigmentGlsl(): string {
  const lines = WEAVE.slice(1).map((hex) =>
    `  p = ${glslColour(hex)}; d = dot((c - p) * (c - p), W); if (d < bd) { bd = d; best = p; }`);
  return `vec3 nearestPigment(vec3 c) {
  const vec3 W = vec3(2.0, 4.0, 3.0);
  vec3 best = ${glslColour(WEAVE[0])};
  float bd = dot((c - best) * (c - best), W);
  vec3 p; float d;
${lines.join('\n')}
  return best;
}`;
}

const FRAGMENT = `
#pragma phaserTemplate(shaderName)

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCamera;   // scrollX, scrollY, zoom (buffer px per world unit)
uniform float uFocus;
uniform float uBand;
uniform float uFeather;
uniform float uBlur;
uniform float uMist;
uniform float uMute;
uniform float uPresence;
uniform float uLens;
uniform float uClouds;
uniform float uSaturation;
uniform float uContrast;
uniform float uStyle;   // 0 none, 1 pixel, 2 stitch, 3 ink, 4 photo, 5 silk
uniform float uCell;    // pixel / stitch cell size, buffer px
uniform float uStyleMix; // the Độ đậm slider, 0..1: how heavy the material look lies

varying vec2 outTexCoord;

const vec3 PAPER = ${glslColour(PIGMENT.diep)};
const vec3 PAPER_HI = ${glslColour(PIGMENT.diepHi)};
const vec3 CLOUD = vec3(0.985, 0.972, 0.935);
const vec3 MUC = ${glslColour(PIGMENT.muc)};
const vec3 CHAM_PALE = ${glslColour(PIGMENT.chamPale)};
const vec3 SEPIA_DARK = vec3(0.36, 0.26, 0.18);
const vec3 SEPIA_LIGHT = vec3(0.965, 0.925, 0.835);

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// How close a colour is to the sheet itself — any of the điệp tones the ground is printed in. 1 on
// the paper, 0 on anything pigmented. Every look below leaves the paper where it was: the ground's
// colour and brightness are settled, and a dither or a stitch across open ground is the grain that
// was built and rejected.
float paperness(vec3 c) {
  float d = min(min(length(c - ${glslColour(PIGMENT.diep)}), length(c - ${glslColour(PIGMENT.diepHi)})),
    min(min(length(c - ${glslColour(PIGMENT.diepWarm)}), length(c - ${glslColour(PIGMENT.diepLo)})), length(c - ${glslColour(PIGMENT.diepDeep)})));
  return 1.0 - smoothstep(0.03, 0.1, d);
}

// How much of a pixel is the player's sỏi son: red well clear of both other channels.
float sonness(vec3 c) { return clamp((c.r - max(c.g, c.b)) * 3.0 - 0.25, 0.0, 1.0); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// 4x4 ordered (Bayer) threshold in -0.5..0.5, from a whole-cell index.
float bayer2(vec2 p) { return mod(2.0 * mod(p.x, 2.0) + 3.0 * mod(p.y, 2.0), 4.0); }
float bayer4(vec2 p) { return (4.0 * bayer2(p) + bayer2(floor(p / 2.0)) + 0.5) / 16.0 - 0.5; }

${nearestPigmentGlsl()}

vec4 disc(vec2 at, float radius) {
  vec2 px = vec2(radius * uResolution.y / uResolution.x, radius);
  vec4 acc = texture2D(uMainSampler, at);
  float theta = 0.0;
  for (int i = 1; i < 12; i++) {
    theta += 2.39996323;
    acc += texture2D(uMainSampler, at + px * sqrt(float(i) / 11.0) * vec2(cos(theta), sin(theta)));
  }
  return acc / 12.0;
}

vec3 unpremultiply(vec4 t) { return t.rgb / max(t.a, 0.002); }

void main() {
  vec2 uv = outTexCoord;
  vec2 screen = vec2(uv.x, 1.0 - uv.y) * uResolution;
  vec2 world = uCamera.xy + screen / uCamera.z;

  // Cells for the pixel and stitch materials, anchored to the WORLD so the weave does not crawl
  // across the map as it pans. Everything below reads from the cell's centre, so a cell is one colour.
  // Both sliders mean the same thing at 0: nothing. A material at 0 is not sampled into cells at all.
  bool celled = uStyle > 0.5 && uStyle < 2.5 && uStyleMix > 0.001;
  vec2 cellFrac = vec2(0.5);
  vec2 cellId = vec2(0.0);
  vec2 at = uv;
  if (celled) {
    float cw = uCell / uCamera.z;
    cellId = floor(world / cw);
    cellFrac = fract(world / cw);
    vec2 centrePx = ((cellId + 0.5) * cw - uCamera.xy) * uCamera.z;
    at = vec2(centrePx.x, uResolution.y - centrePx.y) / uResolution;
    world = (cellId + 0.5) * cw;
  }

  // Depth: 0 in the focus band, 1 past the feather. The far side (top) arrives sooner.
  float dy = at.y - uFocus;
  float far = step(0.0, dy);
  float depth = clamp((abs(dy) - uBand) / (uFeather * mix(1.35, 0.85, far)), 0.0, 1.0);
  depth = depth * depth * (3.0 - 2.0 * depth);

  // Viewfinder corners: a superellipse, so the edges stay clean and only the corners go.
  vec2 q = abs(at - 0.5) * 2.0;
  float corner = pow(pow(q.x, 6.0) + pow(q.y, 6.0), 1.0 / 6.0);
  float lens = smoothstep(0.8, 1.02, corner) * uLens;

  // Alpha is carried through, premultiplied: the map camera leaves holes (unexplored gaps, beyond
  // the world) that the page's paper shows through. Writing alpha 1 painted them black.
  float coc = max(depth * mix(0.7, 1.0, far), lens * 0.8);
  vec4 texel;
  if (coc * uBlur > 0.02) {
    texel = disc(at, coc * uBlur * 0.01);
  } else if (celled) {
    vec2 o = vec2(0.25 * uCell) / uResolution;
    texel = (texture2D(uMainSampler, at + vec2(o.x, o.y)) + texture2D(uMainSampler, at + vec2(-o.x, o.y))
      + texture2D(uMainSampler, at + vec2(o.x, -o.y)) + texture2D(uMainSampler, at - o)) * 0.25;
  } else {
    texel = texture2D(uMainSampler, at);
  }
  float alpha = texel.a;
  if (alpha < 0.002) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 col = texel.rgb / alpha;

  float son = sonness(col);
  float paper = paperness(col);
  float air = max(depth * mix(0.45, 1.0, far), lens);

  // Presence and air: the band keeps a touch more colour; distance loses it, son excepted.
  float saturation = 1.0 + uSaturation * (1.0 - paper) + uPresence * (1.0 - depth) * (1.0 - lens) - uMute * air * (1.0 - son);
  col = mix(vec3(luma(col)), col, saturation);
  // Contrast pivoted near the paper: the sheet barely moves, the ink and colour deepen.
  col = clamp(0.8 + (col - 0.8) * (1.0 + uContrast * (1.0 - paper)), 0.0, 1.0);
  col = mix(col, PAPER, uMist * air * air * (1.0 - 0.7 * son));

  // Clouds: two octaves of soft noise in world space, only where the ground is already far.
  if (uClouds > 0.0) {
    vec2 p = world / vec2(520.0, 150.0) + vec2(uTime * 0.012, 0.0);
    float n = valueNoise(p) * 0.65 + valueNoise(p * 2.3 + 7.1) * 0.35;
    float bank = smoothstep(0.42, 0.72, n) * smoothstep(0.05, 0.7, depth) * mix(0.35, 1.0, far);
    col = mix(col, CLOUD, uClouds * bank * 0.9);
  }

  vec3 graded = col;
  if (uStyleMix <= 0.001) {
    // Material slider at 0: no material.
  } else if (uStyle > 0.5 && uStyle < 1.5) {
    // Pixel: re-woven from the pigments, the dither turning every blend into a dot screen. The
    // slider moves both halves — the cells grow (uCell) and the palette and dot screen take hold —
    // so a light setting is a fine, faithful weave and a heavy one is chunky pigment-only pixel art.
    vec3 woven = nearestPigment(col + bayer4(cellId) * 0.14 * uStyleMix * (1.0 - paper));
    col = mix(col, woven, uStyleMix);
  } else if (uStyle > 1.5 && uStyle < 2.5) {
    // Stitch: cloth where the ground is paper; elsewhere a cross in the nearest thread colour.
    vec3 thread = nearestPigment(col);
    float cloth = max(paper, step(0.999, paperness(thread)));
    vec2 f = cellFrac - 0.5;
    float w = 0.17;
    float under = 1.0 - smoothstep(w, w + 0.07, abs(f.x - f.y));
    float over = 1.0 - smoothstep(w, w + 0.07, abs(f.x + f.y));
    float inside = 1.0 - smoothstep(0.42, 0.47, max(abs(f.x), abs(f.y)));
    // A thread is lit along its middle and turns into the cloth at its sides.
    vec3 underLit = thread * (0.86 + 0.22 * (1.0 - abs(f.x + f.y) * 1.4)) * mix(1.0, 0.86, smoothstep(0.0, w, abs(f.x - f.y)));
    vec3 overLit = thread * (0.9 + 0.22 * (1.0 - abs(f.x - f.y) * 1.4)) * mix(1.0, 0.86, smoothstep(0.0, w, abs(f.x + f.y)));
    vec3 stitched = mix(col, underLit, under * inside);
    stitched = mix(stitched, overLit, over * inside);
    // The stitches come in with the slider as the cells grow under them.
    col = mix(col, mix(stitched, col, cloth), uStyleMix);
  } else if (uStyle > 2.5 && uStyle < 3.5) {
    // Ink: soot on the sheet, an indigo breath in the mid-tones; only son keeps its colour.
    float t = smoothstep(0.1, 0.9, luma(col));
    vec3 ink = mix(MUC, PAPER, t);
    ink = mix(ink, CHAM_PALE, 0.24 * 4.0 * t * (1.0 - t));
    col = mix(ink, col, son);
  } else if (uStyle > 3.5) {
    // The halo the photo glows with and the silk breathes into widens with the slider.
    vec3 soft = unpremultiply(disc(at, 0.0015 + 0.006 * uStyleMix));
    if (uStyle < 4.5) {
      // Photo: sepia, a halation where the light is, edges falling off into the light, son tinted.
      float l = luma(col);
      vec3 sepia = mix(SEPIA_DARK, SEPIA_LIGHT, smoothstep(0.04, 0.96, l));
      vec3 softSepia = mix(SEPIA_DARK, SEPIA_LIGHT, smoothstep(0.04, 0.96, luma(soft)));
      sepia = mix(sepia, max(sepia, softSepia), 0.5);
      float edge = smoothstep(0.5, 1.0, length((at - 0.5) * vec2(1.1, 1.0)) * 1.3);
      sepia = mix(sepia, softSepia, edge);
      sepia = mix(sepia, SEPIA_LIGHT, edge * 0.6);
      col = mix(sepia, mix(sepia, col, 0.75), son);
    } else {
      // Silk: a pastel, lifted sheet, and the ink breathing a little way into the weave. Driven by
      // the slider directly rather than blended: at full strength silk is a quiet look, so a blend of
      // it from 0 to 1 read as a slider that did nothing. Pigment only: the paper is already the
      // silk's ground and stays exactly as printed.
      float amount = uStyleMix;
      float pastel = 1.0 - 0.6 * amount;
      float lift = 0.38 * amount;
      vec3 silk = mix(mix(vec3(luma(col)), col, pastel), PAPER, lift);
      vec3 softSilk = mix(mix(vec3(luma(soft)), soft, pastel), PAPER, lift);
      silk = mix(silk, max(silk, softSilk), 0.75 * amount);
      silk = mix(silk, min(silk, softSilk), 0.4 * amount);
      col = mix(silk, col, paper);
    }
  }

  // Ink and photo are whole re-tellings of the colour, so their slider is how much of the retelling
  // lies over the map as printed. Pixel and silk read the slider inside their own recipes above.
  if (uStyle > 2.5 && uStyle < 4.5) col = mix(graded, col, uStyleMix);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
}
`;

let settings: DepthSettings | undefined;
const controllers = new Set<DepthFXController>();

/** Whether anything would change a pixel. A slider at 0 is off, so the pass costs nothing there. */
function wantsPass(current: DepthSettings): boolean {
  return (current.filter !== 'off' && current.depthAmount > 0.001)
    || (current.style !== 'off' && current.styleAmount > 0.001);
}

export function getDepthSettings(): DepthSettings {
  if (settings) return settings;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as (Partial<DepthSettings> & { strength?: string }) | null;
    const legacy = LEGACY_STRENGTH[raw?.strength ?? ''];
    const base = defaultSettings();
    settings = {
      filter: DEPTH_FILTERS.includes(raw?.filter as DepthFilterId) ? raw!.filter! : base.filter,
      style: MAP_STYLES.includes(raw?.style as MapStyleId) ? raw!.style! : base.style,
      depthAmount: amount(raw?.depthAmount, legacy?.[0] ?? base.depthAmount),
      styleAmount: amount(raw?.styleAmount, legacy?.[1] ?? base.styleAmount),
      clouds: typeof raw?.clouds === 'boolean' ? raw.clouds : base.clouds,
    };
  } catch {
    settings = { ...defaultSettings() };
  }
  return settings;
}

/** Stores the choice and applies it to every live map camera at once — no restart. */
export function setDepthSettings(next: Partial<DepthSettings>): void {
  const merged = { ...getDepthSettings(), ...next };
  settings = {
    ...merged,
    depthAmount: amount(merged.depthAmount, DEFAULTS.depthAmount),
    styleAmount: amount(merged.styleAmount, DEFAULTS.styleAmount),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage refused (private window): the choice still holds for this session.
  }
  for (const controller of controllers) controller.setActive(wantsPass(settings));
}

export class DepthFXController extends Phaser.Filters.Controller {
  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, DEPTH_FX_KEY);
  }
}

export class DepthFXNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(DEPTH_FX_KEY, manager, undefined, FRAGMENT);
  }

  setupUniforms(controller: DepthFXController, drawingContext: Phaser.Renderer.WebGL.DrawingContext): void {
    const current = getDepthSettings();
    if (!wantsPass(current)) return;
    const preset = PRESETS[current.filter];
    const k = current.depthAmount * DEPTH_GAIN;
    const camera = controller.camera;
    const pm = this.programManager;
    pm.setUniform('uResolution', [drawingContext.width, drawingContext.height]);
    pm.setUniform('uTime', camera.scene.time.now / 1000);
    pm.setUniform('uCamera', [camera.scrollX, camera.scrollY, camera.zoom]);
    pm.setUniform('uFocus', preset.focus);
    // A stronger setting also narrows the band a little, so it deepens rather than only smears.
    pm.setUniform('uBand', preset.band / Math.sqrt(Math.max(k, 0.05)));
    pm.setUniform('uFeather', preset.feather);
    pm.setUniform('uBlur', preset.blur * k);
    pm.setUniform('uMist', Math.min(1, preset.mist * k));
    pm.setUniform('uMute', Math.min(1, preset.mute * k));
    // Scaled like everything else, so the depth slider at 0 is no depth at all.
    pm.setUniform('uPresence', preset.presence * (k / 0.6));
    pm.setUniform('uLens', Math.min(1, preset.lens * k));
    pm.setUniform('uSaturation', preset.saturation * k);
    pm.setUniform('uContrast', preset.contrast * k);
    pm.setUniform('uClouds', current.clouds && current.filter !== 'off' ? Math.min(1, 0.7 * k) : 0);
    pm.setUniform('uStyle', current.styleAmount > 0.001 ? STYLE_INDEX[current.style] : 0);
    pm.setUniform('uStyleMix', current.styleAmount);
    // Cells in screen heights, so the weave reads alike at every render scale. They grow from a single buffer pixel at the slider's low end (no pixelation at all) to chunky
    // at its top: a seventieth of the screen for pixel art, a forty-fifth for a stitch you can see.
    const v = current.styleAmount;
    const largest = drawingContext.height / (current.style === 'stitch' ? 45 : 70);
    pm.setUniform('uCell', 1 + (largest - 1) * v);
  }
}

/**
 * Puts the map filters on a map scene's camera. Always attached, active only while something is
 * chosen, so the Settings page can turn it on and off live. Safe under Canvas or a lost context —
 * the map looks perfectly fine without it, and a filter that threw at boot would take the game.
 */
export function applyDepthFX(scene: Phaser.Scene): void {
  try {
    const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const nodes = renderer?.renderNodes;
    if (!nodes) return;
    if (!nodes.hasNode(DEPTH_FX_KEY)) nodes.addNodeConstructor(DEPTH_FX_KEY, DepthFXNode);
    const camera = scene.cameras.main;
    const controller = new DepthFXController(camera);
    controller.setActive(wantsPass(getDepthSettings()));
    camera.filters.external.add(controller);
    controllers.add(controller);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controllers.delete(controller));
    // Harness and eye-pass hook: switch looks live on one frame.
    (window as unknown as { __mapDepth?: typeof setDepthSettings }).__mapDepth = setDepthSettings;
  } catch (error) {
    console.warn('Map depth filter unavailable; drawing without it:', error);
  }
}
