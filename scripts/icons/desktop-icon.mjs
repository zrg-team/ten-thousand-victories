/**
 * Cuts the Windows/macOS/Linux application icon for the desktop cabinet.
 *
 * The cabinet used to hand electron-builder `apps/desktop/web/icon-512.png` — the PWA icon, which
 * is the river print *on its sheet of giấy điệp*. That is right for a browser tab sitting on a page
 * and wrong for a desktop icon, for three reasons that all show at once in Explorer:
 *
 *   · **A desktop icon is a shape, not a picture.** Windows has drawn icons as free-form silhouettes
 *     on the shell's own background since Vista. An opaque cream square is a bright tile on a dark
 *     file list and a dirty one on a light list, and either way it reads as a thumbnail of a picture
 *     rather than as the game's device.
 *   · **The sheet steals the box.** Inside that square the ship covers about three quarters of the
 *     height, so at the 16 px Explorer draws in list view the actual mark is eleven pixels. Cut from
 *     the transparent master instead and it fills 95% of the tile.
 *   · **`web/` is gitignored.** It is deleted and rewritten by `npm run sync` from `dist-shell`, so
 *     the packaging config pointed at a file a fresh clone does not have. The icon is source; it now
 *     lives beside the other build resources and is committed.
 *
 * So this cuts from `apps/mobile/branding/dongho-river-foreground-v7.png` — the same approved master
 * the favicons come off, with no sheet behind it — and writes `apps/desktop/build/`:
 *
 *   · `icon.ico`  ten sizes: 16 20 24 32 40 48 64 96 128 256. electron-builder's own conversion
 *     emits seven and skips 20, 40 and 96, which are exactly the sizes Windows 11 asks for at 125%,
 *     150% and 250% display scaling — a missing size is scaled from a neighbour by the shell, which
 *     is the blurriest path available.
 *   · `icon.png`  512, for the mac and linux targets, which take a PNG.
 *
 * Two things happen on the way down that a plain resize does not do, and both matter below 48 px:
 *
 *   · **Halving, not one long jump.** Going 1191 → 16 in a single `drawImage` samples far too few
 *     source pixels; the foam and the sail battens turn to noise. Each step halves until the next
 *     halving would undershoot, so every source pixel is carried into the result.
 *   · **A little of the contour back.** Downsampling is a blur, and a Đông Hồ mark is contour — mực
 *     and nothing else. Small sizes get an alpha-weighted unsharp pass on colour only (so the blur
 *     cannot drag transparent pixels' colour into the edge) and a mild alpha contrast, which puts
 *     the black line back on the sail and keeps the ship from dissolving into the wave.
 *
 * Output is committed. Re-run after touching the master or the numbers below; `--check` re-cuts and
 * fails if what is on disk differs, which is what the gate calls.
 *
 * Usage: node scripts/icons/desktop-icon.mjs [--out dir] [--check]
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ico, tagSrgb } from './river-icon-pack.mjs';

/** Windows asks for all ten at some display scale. 256 is the one electron-builder requires. */
export const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

/**
 * How much of the tile the mark's own bounding box fills.
 *
 * 0.96 rather than 1.0 leaves a hair of margin so the antialiased edge of the hull is not clipped
 * flat against the tile — a mark that touches the boundary reads as cropped, which is the look the
 * cropped small-size variants were rejected for.
 */
export const FILL = 0.96;

/** Unsharp amount and alpha contrast by size. Above 48 the downscale is gentle enough to leave be. */
const SHARPEN = (size) => (size <= 24 ? { amount: 0.55, alpha: 1.22 } : size <= 48 ? { amount: 0.4, alpha: 1.12 } : { amount: 0, alpha: 1 });

/**
 * The whole cut runs inside one page as a string of DOM work, because canvas is the only image
 * pipeline this repository has — there is no `sharp`, and `jimp-compact` lives under apps/mobile
 * for the gates. Returns data URLs, one per requested size.
 */
const CUT = async ({ src, sizes, fill, sharpen }) => {
  const img = new Image();
  img.src = src;
  await img.decode();

  const read = (canvas) => canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  const surface = (w, h) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  };

  // Trim to the mark's own alpha box, then centre it on a square stage. Centring on the box rather
  // than on the master's canvas is what removes the empty top-left corner of the sheet version.
  const whole = surface(img.width, img.height);
  whole.getContext('2d').drawImage(img, 0, 0);
  const pixels = read(whole).data;
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (pixels[(y * img.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const boxW = x1 - x0 + 1;
  const boxH = y1 - y0 + 1;
  const side = Math.max(boxW, boxH);
  const stage = surface(side, side);
  stage.getContext('2d').drawImage(img, x0, y0, boxW, boxH, (side - boxW) / 2, (side - boxH) / 2, boxW, boxH);

  /** Halve until one more halving would undershoot the target, then land on it exactly. */
  const shrink = (source, target) => {
    let current = source;
    while (current.width >> 1 >= target && current.width > 1) {
      const next = surface(Math.max(1, current.width >> 1), Math.max(1, current.height >> 1));
      const ctx = next.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(current, 0, 0, next.width, next.height);
      current = next;
    }
    const out = surface(target, target);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, target, target);
    return out;
  };

  /**
   * Unsharp on colour only, with every neighbour weighted by its own alpha so the blur cannot pull
   * the colour of a transparent pixel — which is an undefined black in canvas — into the contour and
   * leave a grey halo around the hull. Alpha gets a separate contrast about its midpoint.
   */
  const contour = (canvas, { amount, alpha }) => {
    if (!amount && alpha === 1) return canvas;
    const data = read(canvas);
    const { width: w, height: h } = canvas;
    const source = data.data;
    const result = new Uint8ClampedArray(source);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const at = (y * w + x) * 4;
        if (amount && source[at + 3] > 0) {
          const blurred = [0, 0, 0];
          let weight = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const nx = Math.min(w - 1, Math.max(0, x + kx));
              const ny = Math.min(h - 1, Math.max(0, y + ky));
              const nAt = (ny * w + nx) * 4;
              const k = kernel[(ky + 1) * 3 + (kx + 1)] * (source[nAt + 3] / 255);
              blurred[0] += source[nAt] * k;
              blurred[1] += source[nAt + 1] * k;
              blurred[2] += source[nAt + 2] * k;
              weight += k;
            }
          }
          if (weight > 0) {
            for (let c = 0; c < 3; c++) result[at + c] = source[at + c] + amount * (source[at + c] - blurred[c] / weight);
          }
        }
        if (alpha !== 1) {
          const a = source[at + 3] / 255;
          result[at + 3] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + (a - 0.5) * alpha)));
        }
      }
    }
    const out = surface(w, h);
    out.getContext('2d').putImageData(new ImageData(result, w, h), 0, 0);
    return out;
  };

  const cuts = {};
  for (const size of sizes) {
    const inner = Math.max(1, Math.round(size * fill));
    const tile = surface(size, size);
    tile.getContext('2d').drawImage(contour(shrink(stage, inner), sharpen[size]), Math.round((size - inner) / 2), Math.round((size - inner) / 2));
    cuts[size] = tile.toDataURL('image/png');
  }
  return cuts;
};

export async function buildDesktopIcon({ out = 'apps/desktop/build', check = false } = {}) {
  const master = readFileSync('apps/mobile/branding/dongho-river-foreground-v7.png');
  const sizes = [...new Set([...ICO_SIZES, 512])];
  const sharpen = Object.fromEntries(sizes.map((size) => [size, SHARPEN(size)]));

  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  let cuts;
  try {
    const page = await browser.newPage({ viewport: { width: 8, height: 8 }, deviceScaleFactor: 1 });
    await page.setContent('<body style="margin:0"></body>');
    cuts = await page.evaluate(CUT, {
      src: `data:image/png;base64,${master.toString('base64')}`,
      sizes,
      fill: FILL,
      sharpen,
    });
  } finally {
    await browser.close();
  }

  const png = (size) => tagSrgb(Buffer.from(cuts[size].slice('data:image/png;base64,'.length), 'base64'));
  const outputs = new Map();
  outputs.set('icon.ico', ico(ICO_SIZES.map((size) => ({ size, png: png(size) }))));
  outputs.set('icon.png', png(512));

  const drift = [];
  for (const [name, content] of outputs) {
    const target = join(out, name);
    if (check) {
      if (!existsSync(target) || !readFileSync(target).equals(content)) drift.push(target);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
  if (drift.length) throw new Error(`Desktop icon drift: ${drift.join(', ')}`);
  console.log(`Desktop icon ${check ? 'verified' : 'cut'} — icon.ico (${ICO_SIZES.join(' ')}) + icon.png (512)`);
  return outputs;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf('--out');
  await buildDesktopIcon({ out: at >= 0 ? process.argv[at + 1] : undefined, check: process.argv.includes('--check') });
}
