import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Pack the ImageGen-isolated chroma masters; no authored strokes are redrawn.
const [source, version] = process.argv.slice(2);
if (!source || !['carved', 'jade', 'harvest'].includes(version)) {
  throw Error('Usage: node scripts/conquest-art/pack-rice-fields.mjs <master.png> carved|jade|harvest');
}
const target = `public/art/terrain/rice-${version}-v1.webp`;
if (existsSync(target)) throw Error(`Preserve the existing ${target}; version a replacement.`);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async url => {
    const image = new Image(); image.src = url; await image.decode();
    if (image.width !== 1536 || image.height !== 1024) throw Error('Unexpected master dimensions.');
    const source = document.createElement('canvas'); source.width = 1536; source.height = 1024;
    const g = source.getContext('2d', { willReadFrequently: true }); g.drawImage(image, 0, 0);
    const pixels = g.getImageData(0, 0, source.width, source.height);
    const d = pixels.data;
    let removed = 0;
    // Magenta does not occur in this pigment family. Key the isolated production matte,
    // including antialiased edge contamination, before downsampling onto transparent gutters.
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] - d[i+1] > 8 && d[i+2] - d[i+1] > 8) {
        d[i] = d[i+1] = d[i+2] = d[i+3] = 0; removed++;
      }
    }
    if (removed < source.width * source.height * 0.45) throw Error('Production matte not isolated.');
    g.putImageData(pixels, 0, 0);
    const atlas = document.createElement('canvas'); atlas.width = 768; atlas.height = 320;
    const a = atlas.getContext('2d', { willReadFrequently: true }); a.imageSmoothingQuality = 'high';
    const frames = [];
    for (let f = 0; f < 5; f++) {
      const left = f % 3 * 512, top = Math.floor(f / 3) * 512;
      let x0 = left + 512, y0 = top + 512, x1 = left, y1 = top;
      for (let y = top; y < top + 512; y++) for (let x = left; x < left + 512; x++) {
        if (d[(y * 1536 + x) * 4 + 3] > 32) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w < 300 || h < 150 || w > 508) throw Error('Empty or contaminated sprite.');
      const scale = Math.min(244 / w, 148 / h), dw = w * scale, dh = h * scale;
      a.drawImage(source, x0, y0, w, h, f % 3 * 256 + (256 - dw) / 2, Math.floor(f / 3) * 160 + (160 - dh) / 2, dw, dh);
      frames.push({ frame: f, crop: { x: x0, y: y0, w, h }, width: dw, height: dh });
    }
    const p = a.getImageData(0, 0, 768, 320).data;
    let gutterInk = 0, magenta = 0, transparent = 0;
    for (let y = 0; y < 320; y++) for (let x = 0; x < 768; x++) {
      const i = (y * 768 + x) * 4;
      if (p[i+3] === 0) transparent++;
      if ((x % 256 < 3 || x % 256 > 252 || y % 160 < 3 || y % 160 > 156) && p[i+3]) gutterInk++;
      if (p[i+3] > 16 && p[i] - p[i+1] > 35 && p[i+2] - p[i+1] > 30 && p[i+2] > p[i] * 0.65) magenta++;
    }
    if (gutterInk || magenta) throw Error(`Matte or gutter audit failed: ${JSON.stringify({ gutterInk, magenta })}`);
    return { png: atlas.toDataURL('image/webp', 0.94).split(',')[1], frames, removed, transparent, gutterInk, magenta };
  }, `data:image/png;base64,${readFileSync(source).toString('base64')}`);
  mkdirSync('public/art/terrain', { recursive: true }); mkdirSync('output/rice-fields', { recursive: true });
  const bytes = Buffer.from(result.png, 'base64'); delete result.png;
  writeFileSync(target, bytes);
  Object.assign(result, { source, target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  writeFileSync(`output/rice-fields/${version}-packing.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
