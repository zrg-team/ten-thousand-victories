/** Packs ImageGen drawings; never synthesizes or rasterizes replacement SVG artwork. */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const preview = process.argv.includes('--preview');
const out = preview ? 'output/royal-dongho-stage' : 'public/faces-royal';
const inventory = JSON.parse(readFileSync('src/data/royalWardrobe.json', 'utf8'));
const manifest = JSON.parse(readFileSync('docs/art/royal-dongho-v1-prompts.json', 'utf8'));
const sleeves = JSON.parse(readFileSync('docs/art/royal-dongho-sleeves-v2-prompts.json', 'utf8'));
const oldWar = JSON.parse(readFileSync('src/ui/faces/war-v1.defs.json', 'utf8'));
const jobs = new Map([...manifest.jobs, ...sleeves.jobs].map(job => [job.id, job]));
const war = new Map(oldWar.map(def => [def.key, def]));
assert.equal(new Set([...jobs.keys(), ...war.keys()]).size, inventory.length);
mkdirSync(out, { recursive: true });
const savePng = (path, data) => writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const results = [];
  for (const item of inventory) {
    const job = jobs.get(item.id), retained = job ? undefined : war.get(item.id);
    const source = job?.master ?? `public/faces-royal/war-v1/${item.id}.png`;
    if (preview && !existsSync(source)) continue;
    assert(existsSync(source), `Missing generated master: ${source}`);
    const result = await page.evaluate(async ({ item, data, retained, productionMatte }) => {
      const im = new Image(); im.src = data; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
      const raster = ctx.getImageData(0, 0, c.width, c.height), px = raster.data;
      if (productionMatte) {
        let removed = 0;
        for (let p = 0; p < px.length; p += 4) {
          if (Math.min(px[p], px[p + 2]) - px[p + 1] > 35 && px[p + 2] > px[p] * .7) { px[p + 3] = 0; removed++; }
        }
        if (removed < c.width * c.height * .05) throw Error(`Missing production matte: ${item.id}`);
        ctx.putImageData(raster, 0, 0);
      }
      let left = c.width, top = c.height, right = -1, bottom = -1, clear = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const a = px[(y * c.width + x) * 4 + 3];
        if (a < 8) clear++;
        if (a > 16) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
      }
      if (right <= left || clear < c.width * c.height * .05) throw Error(`Missing transparent cutout: ${item.id}`);
      if (!retained && (left < 2 || top < 2 || right >= c.width - 2 || bottom >= c.height - 2)) throw Error(`Clipped master: ${item.id}`);
      const sw = right - left + 1, sh = bottom - top + 1;
      let def = retained;
      if (!def) {
        const hat = item.slot === 'hat', robe = item.slot === 'robe';
        const winged = /royal-(ly-hat-1|le-hat-[23]|nguyen-hat-2)$/.test(item.id);
        const diagonal = item.id === 'royal-tayson-ornament-2';
        const ribbons = item.id === 'royal-nguyen-ornament-3';
        let w = hat ? winged ? 128 : 68 : robe ? 112 : diagonal ? 66 : ribbons ? 32 : 74;
        let h = hat ? Math.min(sh * w / sw, 48) : robe ? 70 : diagonal ? 52 : ribbons ? 24 : Math.min(sh * w / sw, 24);
        let cx = 0, cy = robe ? 61 : diagonal ? 65 : ribbons ? 83 : Math.min(84, 95 - h / 2);
        if (hat) {
          // Attach the lower center-front band to the forehead, ignoring side tails.
          const center = Math.round((left + right) / 2);
          let front = top;
          for (let y = top; y <= bottom; y++) if (px[(y * c.width + center) * 4 + 3] > 128) front = y;
          cy = -35 + h / 2 - (front - top) * h / sh;
        }
        def = { key: item.id, layer: hat ? 52 : robe ? 35 : 39, tint: 'none', cx, cy, w, h };
      }
      const dest = document.createElement('canvas'); dest.width = Math.ceil(def.w * 3); dest.height = Math.ceil(def.h * 3);
      const dc = dest.getContext('2d'); dc.imageSmoothingQuality = 'high';
      if (retained) dc.drawImage(c, 0, 0, dest.width, dest.height);
      else dc.drawImage(c, left, top, sw, sh, 0, 0, dest.width, dest.height);
      return { id: item.id, def, sourceBounds: { left, top, right, bottom }, clear, image: dest.toDataURL() };
    }, { item, retained, productionMatte: job?.productionMatte, data: `data:image/png;base64,${readFileSync(source).toString('base64')}` });
    result.source = source;
    savePng(`${out}/${item.id}.png`, result.image); results.push(result);
  }
  if (!preview) assert.equal(results.length, 54);
  let x = 2, y = 2, rowH = 0;
  const entries = results.map(result => {
    const w = Math.ceil(result.def.w * 3), h = Math.ceil(result.def.h * 3);
    if (x + w + 2 > 2048) { x = 2; y += rowH + 4; rowH = 0; }
    const entry = { ...result, x, y, w, h }; x += w + 4; rowH = Math.max(rowH, h); return entry;
  });
  const height = y + rowH + 2;
  const atlas = await page.evaluate(async ({ entries, height }) => {
    const c = document.createElement('canvas'); c.width = 2048; c.height = height;
    const ctx = c.getContext('2d');
    for (const e of entries) { const im = new Image(); im.src = e.image; await im.decode(); ctx.drawImage(im, e.x, e.y); }
    return c.toDataURL();
  }, { entries, height });
  savePng(`${out}/atlas.png`, atlas);
  const frames = Object.fromEntries(entries.map(e => [e.id, { frame: { x: e.x, y: e.y, w: e.w, h: e.h }, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: e.w, h: e.h }, sourceSize: { w: e.w, h: e.h } }]));
  writeFileSync(`${out}/atlas.json`, JSON.stringify({ frames, meta: { image: 'atlas.png', size: { w: 2048, h: height }, scale: '1' } }, null, 2) + '\n');
  writeFileSync(preview ? `${out}/defs.json` : 'src/ui/faces/royal.defs.json', JSON.stringify(results.map(r => r.def), null, 2) + '\n');
  writeFileSync(`${out}/provenance.json`, JSON.stringify({ generator: 'built-in image_gen', prompts: 'docs/art/royal-dongho-v1-prompts.json',
    sleevePrompts: 'docs/art/royal-dongho-sleeves-v2-prompts.json',
    retainedPrompts: 'docs/hero-war-dongho-v1-prompts.json', parts: results.map(({ id, source, sourceBounds }) => ({ id, source, sourceBounds })) }, null, 2) + '\n');
  // Contact sheet is a QA artifact, not shipped artwork.
  const sheet = await page.evaluate(async entries => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = Math.ceil(entries.length / 6) * 220;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#f0e7cf'; ctx.fillRect(0, 0, c.width, c.height);
    for (const [i, e] of entries.entries()) {
      const im = new Image(); im.src = e.image; await im.decode();
      const scale = Math.min(180 / im.width, 175 / im.height);
      const x = i % 6 * 200, y = Math.floor(i / 6) * 220;
      ctx.drawImage(im, x + (200 - im.width * scale) / 2, y + (180 - im.height * scale) / 2, im.width * scale, im.height * scale);
      ctx.fillStyle = '#302b26'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(e.id.replace('royal-', ''), x + 100, y + 205);
    }
    return c.toDataURL();
  }, entries);
  mkdirSync('output/royal-dongho', { recursive: true }); savePng('output/royal-dongho/contact-sheet.png', sheet);
  console.log(`Packed ${results.length} generated royal parts into 2048×${height}.`);
} finally { await browser.close(); }
