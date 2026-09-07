/**
 * The paper, as a sheet laid over the screen — not as a shader pass.
 *
 * The frame ledger measured the PaperFX camera filter at ≥ 8 ms a frame at render scale 3 on a
 * desktop GPU: an external filter forces the whole frame through an extra framebuffer round-trip
 * per filtered camera, every frame, to composite a texture that never changes. The same look —
 * grain, tone, a vignette — is two multiply-blended quads: a tiling grain sprite and a stretched
 * tone plate. WebGL's MULTIPLY blend is `DST_COLOR, ONE_MINUS_SRC_ALPHA`, so on a white-based
 * tile the alpha is a clean strength dial: alpha 0 leaves the frame untouched, alpha 1 multiplies
 * it fully by the tile's own tint.
 *
 * One sheet, on the LAST scene rendering to the canvas (the UI scene of the pair), covers world
 * and chrome alike with no seam — the property the external filter existed for. The old pass
 * stays reachable at `?fx=shader` for A/B.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, pageColumnX, surfaceWidth } from '../../game/constants';
import { renderScale } from '../../game/graphicsQuality';
import { PIGMENT } from './palette';
import { mulberry32 } from './stroke';

/** Above everything a scene shows: modals at 500, Copilot at ~900, the year flourish at 2000. */
export const PAPER_SHEET_DEPTH = 10_000;

const GRAIN_KEY = 'ink:paper-grain';
const TONE_KEY = 'ink:paper-tone';
const GRAIN_TILE = 512;
const TONE_TILE = 256;
/** The grain's resting strength; `?paper=N` overrides it for the eye pass. */
const TILE_ALPHA = 0.55;

export interface PaperSheet {
  tile: Phaser.GameObjects.TileSprite;
  tone: Phaser.GameObjects.Image;
  setStrength(strength: number): void;
  setVisible(visible: boolean): void;
  /**
   * Re-covers a different box, in the scene's design units. `cameraZoom` is the map zoom a world
   * camera carries on top of the render scale — 1 for a chrome or page scene.
   */
  resize(width: number, height: number, cameraZoom?: number): void;
  destroy(): void;
}

const active = new Set<PaperSheet>();

/** The sheets currently attached — the quality ladder flips these live. */
export function activePaperSheets(): ReadonlySet<PaperSheet> {
  return active;
}

function query(name: string): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * OFF by default at every tier — `?paper=N` is the only way to lay the sheet.
 *
 * The user's verdict (2026-08-25, with side-by-side front-page screenshots): the sheet reads as
 * "a gray filter", and the tier without it "looks better — no filter at all". Measured on the
 * menu: 14% mean brightness lost overall, 22% in the corners (the tone plate's vignette at full
 * alpha plus the grain multiply). The aging the sheet was tuned to add is already IN the art —
 * the paper ground, the điệp washes — so doubling it grays the sheet instead of aging it. The
 * old shader pass stays at `?fx=shader`; both remain A/B switches, not defaults.
 */
export function paperSheetEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (query('nofx') === '1' || query('fx') === 'shader') return false;
  const asked = Number(query('paper'));
  return Number.isFinite(asked) && asked > 0;
}

/**
 * The grain: a white-based tile of fibre and grit. White-based because MULTIPLY leaves white
 * untouched — the fibres are the only thing that darkens, at ±3% luminance, so the sheet reads
 * as texture rather than as a grey film.
 */
export function ensurePaperGrainTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(GRAIN_KEY)) return GRAIN_KEY;
  const texture = scene.textures.createCanvas(GRAIN_KEY, GRAIN_TILE, GRAIN_TILE);
  if (!texture) return GRAIN_KEY;
  const ctx = texture.getContext();
  const rand = mulberry32(0x0d13b7);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, GRAIN_TILE, GRAIN_TILE);

  // The same laid-fibre loop the điệp ground uses (paper.ts), on a white base: short strokes
  // lying mostly along the sheet, wrap-safe by sheer density rather than by tiling copies.
  ctx.lineWidth = 0.8;
  for (let index = 0; index < 1100; index += 1) {
    const x = rand() * GRAIN_TILE;
    const y = rand() * GRAIN_TILE;
    const length = 2 + rand() * 9;
    const angle = (rand() - 0.5) * 0.5;
    const shade = 247 + Math.floor(rand() * 6) - 3;
    ctx.globalAlpha = 0.5 + rand() * 0.3;
    ctx.strokeStyle = `rgb(${shade},${shade - 1},${shade - 3})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  // Grit: single darker points, sparse.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgb(240,238,233)';
  for (let index = 0; index < 260; index += 1) {
    ctx.fillRect(rand() * GRAIN_TILE, rand() * GRAIN_TILE, 1, 1);
  }
  ctx.globalAlpha = 1;
  texture.refresh();
  return GRAIN_KEY;
}

/**
 * The tone: the shader's vignette and its handful of soft điệp blots, in one stretched plate.
 * Same curve the fragment shader used: 1 − 0.22·pow(clamp(len·1.38, 0, 1), 2.2).
 */
export function ensurePaperToneTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TONE_KEY)) return TONE_KEY;
  const texture = scene.textures.createCanvas(TONE_KEY, TONE_TILE, TONE_TILE);
  if (!texture) return TONE_KEY;
  const ctx = texture.getContext();
  const rand = mulberry32(0x5eed);

  const image = ctx.createImageData(TONE_TILE, TONE_TILE);
  const data = image.data;
  for (let py = 0; py < TONE_TILE; py += 1) {
    for (let px = 0; px < TONE_TILE; px += 1) {
      const nx = (px / TONE_TILE) * 2 - 1;
      const ny = (py / TONE_TILE) * 2 - 1;
      const len = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2;
      const vignette = 1 - 0.22 * Math.pow(Math.min(1, Math.max(0, len * 1.38)), 2.2);
      const value = Math.round(255 * vignette);
      const at = (py * TONE_TILE + px) * 4;
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = Math.round(value * 0.985); // a hair warm, the aged sheet's cast
      data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Five or six soft điệp blots, the shader's `aged` term at mix 0.16.
  const r = (PIGMENT.diepLo >> 16) & 0xff;
  const g = (PIGMENT.diepLo >> 8) & 0xff;
  const b = PIGMENT.diepLo & 0xff;
  for (let blot = 0; blot < 6; blot += 1) {
    const x = rand() * TONE_TILE;
    const y = rand() * TONE_TILE;
    const radius = 18 + rand() * 42;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.16)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  texture.refresh();
  return TONE_KEY;
}

/**
 * The sheet for a page scene — a screen with nothing behind it. On the phone that is the column;
 * on the desktop the page's camera covers the whole sheet with the column in the middle
 * (`cameraLayout.ts`), and the grain has to reach the edges of the window with it.
 */
export function attachPagePaper(scene: Phaser.Scene, opts: { depth?: number; strength?: number } = {}): PaperSheet | undefined {
  return attachPaperSheet(scene, { ...opts, x: -pageColumnX(), width: surfaceWidth(), height: GAME_HEIGHT });
}

/**
 * Lays the sheet over a scene. Call from the LAST scene that renders (the UI scene of a pair, or
 * a standalone scene); returns undefined when the tier or a switch says no.
 */
export function attachPaperSheet(
  scene: Phaser.Scene,
  /**
   * `width`/`height` default to the column. The desktop's world scene asks for the part of the
   * sheet its chrome column does not cover, so the map beside the column is on paper too.
   */
  opts: { depth?: number; strength?: number; x?: number; width?: number; height?: number } = {},
): PaperSheet | undefined {
  if (!paperSheetEnabled()) return undefined;

  const asked = Number(query('paper'));
  const strength0 = Number.isFinite(asked) && asked > 0 ? asked : (opts.strength ?? 1);
  const depth = opts.depth ?? PAPER_SHEET_DEPTH;
  const width = opts.width ?? GAME_WIDTH;
  const height = opts.height ?? GAME_HEIGHT;
  const x = opts.x ?? 0;

  const tile = scene.add.tileSprite(x, 0, width, height, ensurePaperGrainTexture(scene))
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(depth)
    .setBlendMode(Phaser.BlendModes.MULTIPLY);
  // One grain texel ≈ one buffer pixel, whatever the render scale — the grain must not soften.
  tile.setTileScale(1 / renderScale());

  const tone = scene.add.image(x, 0, ensurePaperToneTexture(scene))
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(depth + 0.01)
    .setBlendMode(Phaser.BlendModes.MULTIPLY);
  tone.setDisplaySize(width, height);

  // The sheet breathes: a slow drift of the grain, imperceptible directly, gone when you stare.
  // Except under ?capture=1 — the harness mode that compares screenshots pixel by pixel, where a
  // grain that moves between two frames reads as "the picture changed" in every diff-based gate.
  const drift = query('capture') === '1' ? undefined : scene.tweens.addCounter({
    from: 0, to: GRAIN_TILE, duration: 120_000, repeat: -1,
    onUpdate: (tween) => {
      const value = tween.getValue() ?? 0;
      tile.tilePositionX = value;
      tile.tilePositionY = value * 0.6;
    },
  });

  const sheet: PaperSheet = {
    tile,
    tone,
    setStrength(strength: number) {
      tile.setAlpha(Math.max(0, Math.min(1, strength * TILE_ALPHA)));
      tone.setAlpha(Math.max(0, Math.min(1, strength)));
    },
    setVisible(visible: boolean) {
      tile.setVisible(visible);
      tone.setVisible(visible);
    },
    resize(nextWidth: number, nextHeight: number, cameraZoom = 1) {
      tile.setSize(nextWidth, nextHeight);
      // Still one grain texel per buffer pixel: a world camera carries the map's own zoom on top
      // of the render scale, and the grain must not soften or sharpen with it.
      tile.setTileScale(1 / (renderScale() * cameraZoom));
      tone.setDisplaySize(nextWidth, nextHeight);
    },
    destroy() {
      drift?.remove();
      tile.destroy();
      tone.destroy();
      active.delete(sheet);
    },
  };
  sheet.setStrength(strength0);
  active.add(sheet);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sheet.destroy());
  return sheet;
}
