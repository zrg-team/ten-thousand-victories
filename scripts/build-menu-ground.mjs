/**
 * Cuts the blank sky out of the front page's ground plate.
 *
 * The plate is a print: the river, the banks and the paddies are drawn on the printer's own
 * paper, and that paper is baked into every pixel of the frame — including the two fifths of it
 * above the horizon, where nothing is drawn at all. On the page that band is a rectangle of
 * warmer, mottled tone (measured at rgb(233,210,167)) laid over the menu's own điệp sheet
 * (rgb(233,223,194)), so the mountains stood on a visible panel instead of on the page. Every
 * other layer of the illustration — the karst, the bamboo, the lotus — is already transparent;
 * this is the one that was not.
 *
 * The cut is by *content*, not by a ruled line: the horizon runs from y=457 on the right-hand
 * paddies to y=586 in the middle of the river, so a straight crop would leave up to 130 units of
 * paper standing in the columns it missed. Each column is scanned from the top for the first run
 * of drawn ink; a running minimum across ±16 columns keeps one high hatch stroke from sawing a
 * notch in the edge, and the alpha ramps in over 36 units so the sky joins the page the way the
 * print's own paper did rather than on a ruled line.
 *
 *   node scripts/build-menu-ground.mjs
 *
 * Reads `public/art/menu-layer-ground-v5.png` and writes `menu-layer-ground-v6.webp` beside it.
 * Nothing below the horizon is touched: the near bank and the plate's own margins are part of
 * the drawing, not background.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SOURCE = 'public/art/menu-layer-ground-v5.png';
const TARGET = 'public/art/menu-layer-ground-v6.webp';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const source = `data:image/png;base64,${readFileSync(SOURCE).toString('base64')}`;
  const result = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const frame = context.getImageData(0, 0, width, height);
    const pixels = frame.data;

    // Paper never gets this dark: its darkest speckle over the whole sky measures 210 on its
    // brightest channel, while the faintest hatch stroke on the sand is under 180.
    const INK = 205;
    const brightest = (x, y) => {
      const at = (y * width + x) * 4;
      return Math.max(pixels[at], pixels[at + 1], pixels[at + 2]);
    };
    // Three dark rows inside a five-row window: one row is a speckle, three are a drawn edge.
    const drawn = new Int32Array(width);
    for (let x = 0; x < width; x += 1) {
      let first = height;
      for (let y = 0; y < height - 5 && first === height; y += 1) {
        let dark = 0;
        for (let step = 0; step < 5; step += 1) if (brightest(x, y + step) < INK) dark += 1;
        if (dark >= 3) first = y;
      }
      drawn[x] = first;
    }

    const SPAN = 16;
    const horizon = new Int32Array(width);
    for (let x = 0; x < width; x += 1) {
      let lowest = drawn[x];
      for (let step = -SPAN; step <= SPAN; step += 1) {
        const at = x + step;
        if (at >= 0 && at < width) lowest = Math.min(lowest, drawn[at]);
      }
      horizon[x] = lowest;
    }

    const FEATHER = 18;
    // Six units of clearance above the first stroke, so the ramp finishes before the drawing.
    const LIFT = 6;
    for (let x = 0; x < width; x += 1) {
      const edge = horizon[x] - LIFT;
      const to = Math.min(height, edge + FEATHER);
      for (let y = 0; y < to; y += 1) {
        const at = (y * width + x) * 4;
        const t = (y - (edge - FEATHER)) / (FEATHER * 2);
        pixels[at + 3] = Math.round(255 * Math.min(1, Math.max(0, t)));
      }
    }
    context.putImageData(frame, 0, 0);
    return {
      png: canvas.toDataURL('image/png'),
      horizon: { min: Math.min(...horizon), max: Math.max(...horizon) },
    };
  }, source);

  writeFileSync(TARGET, Buffer.from(result.png.split(',')[1], 'base64'));
  console.log(`${TARGET}: horizon ${result.horizon.min}–${result.horizon.max}, ${readFileSync(TARGET).length} bytes`);
} finally {
  await browser.close();
}
