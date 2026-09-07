// ImageGen supplies the drawings. This only extracts production matte, fits and atlases them.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const ids = ['ly', 'tran', 'tayson'].flatMap(era => [`royal-${era}-hat-2`, `royal-${era}-robe-2`]);
const output = 'public/faces-royal/war-v1';
mkdirSync(output, { recursive: true });
const png = (path, data) => writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const results = [];
  for (const id of ids) {
    const source = `docs/art/hero-war-v1/${id}.png`;
    const result = await page.evaluate(async ({ id, source }) => {
      const im = new Image(); im.src = source; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
      const raster = ctx.getImageData(0, 0, c.width, c.height), px = raster.data;
      let left = c.width, top = c.height, right = 0, bottom = 0, removed = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const p = (y * c.width + x) * 4, r = px[p], g = px[p + 1], b = px[p + 2];
        if (Math.min(r, b) - g > 35 && b > r * .7) { px[p + 3] = 0; removed++; }
        if (px[p + 3] > 16) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
      }
      if (removed < c.width * c.height * .05 || right <= left || left < 2 || top < 2 || right >= c.width - 2 || bottom >= c.height - 2) throw Error(`Bad matte / clipped source: ${id}`);
      ctx.putImageData(raster, 0, 0);
      const sw = right - left + 1, sh = bottom - top + 1, hat = id.includes('-hat-');
      let w = hat ? id.includes('tayson') ? 74 : 68 : 112, h = hat ? sh * w / sw : 70;
      let cx = hat && id.includes('tayson') ? 3 : 0, cy = 61;
      if (hat) {
        // Seat the measured center-front lower band at y=-35. Knot tips and
        // side rims may reach lower; they are not forehead contact landmarks.
        const center = Math.round((left + right) / 2 - cx * sw / w);
        let front = top;
        for (let y = top; y <= bottom; y++) if (px[(y * c.width + center) * 4 + 3] > 128) front = y;
        cy = -35 + h / 2 - (front - top) * h / sh;
      }
      const dest = document.createElement('canvas'); dest.width = Math.ceil(w * 3); dest.height = Math.ceil(h * 3);
      const dc = dest.getContext('2d'); dc.imageSmoothingQuality = 'high';
      dc.drawImage(c, left, top, sw, sh, 0, 0, dest.width, dest.height);
      return { id, def: { key: id, layer: hat ? 52 : 35, tint: 'none', cx, cy, w, h },
        sourceBounds: { left, top, right, bottom }, removed, image: dest.toDataURL() };
    }, { id, source: `data:image/png;base64,${readFileSync(source).toString('base64')}` });
    png(`${output}/${id}.png`, result.image); results.push(result);
  }
  // Six frames use a single small texture; full masters never ship in the game.
  let x = 2, y = 2, rowH = 0;
  const entries = results.map(result => {
    const w = Math.ceil(result.def.w * 3), h = Math.ceil(result.def.h * 3);
    if (x + w + 2 > 1024) { x = 2; y += rowH + 4; rowH = 0; }
    const entry = { ...result, x, y, w, h }; x += w + 4; rowH = Math.max(rowH, h); return entry;
  });
  const height = y + rowH + 2;
  const atlas = await page.evaluate(async ({ entries, height }) => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = height;
    for (const e of entries) { const im = new Image(); im.src = e.image; await im.decode(); c.getContext('2d').drawImage(im, e.x, e.y); }
    return c.toDataURL();
  }, { entries, height });
  png(`${output}/atlas.png`, atlas);
  const frames = Object.fromEntries(entries.map(e => [e.id, { frame: { x: e.x, y: e.y, w: e.w, h: e.h }, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: e.w, h: e.h }, sourceSize: { w: e.w, h: e.h } }]));
  writeFileSync(`${output}/atlas.json`, JSON.stringify({ frames, meta: { image: 'atlas.png', size: { w: 1024, h: height }, scale: '1' } }, null, 2) + '\n');
  writeFileSync('src/ui/faces/war-v1.defs.json', JSON.stringify(results.map(r => r.def), null, 2) + '\n');
  writeFileSync(`${output}/provenance.json`, JSON.stringify({ generator: 'built-in image_gen', prompts: 'docs/hero-war-dongho-v1-prompts.json',
    parts: results.map(({ id, sourceBounds }) => ({ id, source: `docs/art/hero-war-v1/${id}.png`, sourceBounds })) }, null, 2) + '\n');
  console.log(`Packed ${results.length} generated war parts into 1024×${height}.`);
} finally { await browser.close(); }
