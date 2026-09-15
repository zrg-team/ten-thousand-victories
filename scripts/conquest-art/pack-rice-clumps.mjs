import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const source = process.argv[2];
const target = process.argv[3] ?? 'public/art/ground/dongho-rice-clumps-v5.webp';
if (!source) throw Error('Pass the generated transparent four-by-four rice sprite sheet.');
if (existsSync(target)) throw Error('Use a new asset version instead of overwriting.');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async url => {
    const image = new Image(); image.src = url; await image.decode();
    const original = document.createElement('canvas'); original.width = image.width; original.height = image.height;
    const ctx = original.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    const alpha = pixels.filter((_, i) => i % 4 === 3);
    if (alpha.filter(a => a === 0).length / alpha.length < .3) throw Error('Expected a transparent sprite sheet.');
    const packed = document.createElement('canvas'); packed.width = packed.height = 512;
    const g = packed.getContext('2d'); g.imageSmoothingQuality = 'high';
    const bounds = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const x0 = Math.round(col * image.width / 4), x1 = Math.round((col + 1) * image.width / 4);
      const y0 = Math.round(row * image.height / 4), y1 = Math.round((row + 1) * image.height / 4);
      let left = x1, top = y1, right = x0, bottom = y0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        if (pixels[(y * image.width + x) * 4 + 3] <= 32) continue;
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      const w = right - left + 1, h = bottom - top + 1;
      const scale = Math.min(120 / w, 120 / h);
      g.drawImage(image, left, top, w, h, col * 128 + (128 - w * scale) / 2, row * 128 + 124 - h * scale, w * scale, h * scale);
      bounds.push({ row, col, left, top, width: w, height: h });
    }
    return { webp: packed.toDataURL('image/webp', .96).split(',')[1], bounds, width: image.width, height: image.height };
  }, 'data:image/png;base64,' + readFileSync(source).toString('base64'));
  writeFileSync(target, Buffer.from(result.webp, 'base64'));
  writeFileSync('output/rice-tiles-v5/sprite-packing.json', JSON.stringify({ ...result, webp: undefined }, null, 2));
  console.log(target);
} finally { await browser.close(); }
