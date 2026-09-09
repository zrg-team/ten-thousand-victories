/** Verify shipped raster assets, actual texture selection, and opaque hat/eye intersections. */
import { chromium } from 'playwright';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const out = 'output/royal-dongho'; mkdirSync(out, { recursive: true });
const defs = JSON.parse(readFileSync('src/ui/faces/royal.defs.json', 'utf8'));
const atlas = JSON.parse(readFileSync('public/faces-royal/atlas.json', 'utf8'));
assert.equal(defs.length, 54); assert.equal(Object.keys(atlas.frames).length, 54);
assert.equal(atlas.meta.image, 'atlas.png');
assert.deepEqual(readdirSync('public/faces-royal').filter(file => file.endsWith('.svg')), []);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/faces-royal/')) requests.push(request.url()); });
  await page.goto(`${base}/?capture=1`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  const report = await page.evaluate(async () => {
    const { default: royal } = await import('/src/ui/faces/royal.defs.json');
    const { default: original } = await import('/src/ui/faces/dongho-v2.defs.json');
    const { fitDonghoPart } = await import('/src/ui/faces/donghoFit.ts');
    const { buildKingLook, rollKingChoice } = await import('/src/ui/faces/kingLook.ts');
    const { renderLookInBox } = await import('/src/ui/FaceRenderer.ts');
    const { purchaseRoyalWardrobe, addLegacyPoints } = await import('/src/state/legacy.ts');
    const { ROYAL_WARDROBE } = await import('/src/data/royalWardrobe.ts');
    const must = (condition, label) => { if (!condition) throw Error(label); };
    const images = new Map();
    for (const def of [...royal, ...original.filter(d => /^(eyes-|head-)/.test(d.key))]) {
      const im = new Image();
      im.src = def.key.startsWith('royal-') ? `/faces-royal/${def.key}.png` : `/faces-dongho-v2/parts/${def.key}.png`;
      await im.decode(); images.set(def.key, im);
      if (!def.key.startsWith('royal-')) continue;
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0); const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
      let ink = 0, clear = 0, matte = 0;
      for (let p = 0; p < rgba.length; p += 4) {
        if (rgba[p + 3] < 10) clear++;
        else if (rgba[p + 3] > 128) { ink++; if (Math.min(rgba[p], rgba[p + 2]) - rgba[p + 1] > 35 && rgba[p + 2] > rgba[p] * .7) matte++; }
      }
      must(ink > c.width * c.height * .05 && clear > c.width * c.height * .02 && !matte, `Invalid alpha / matte: ${def.key}`);
    }
    const mask = (def, head) => {
      const c = document.createElement('canvas'); c.width = 408; c.height = 576; const ctx = c.getContext('2d');
      const im = images.get(def.key);
      for (const f of fitDonghoPart(def, head)) {
        const l = f.crop?.left ?? 0, r = f.crop?.right ?? 1, t = f.crop?.top ?? 0, b = f.crop?.bottom ?? 1;
        if (def.key.includes('-hat-')) must(f.cy - f.h / 2 >= -84.001
          && f.cx - f.w / 2 + l * f.w >= -68 && f.cx - f.w / 2 + r * f.w <= 68, `Hat clipped: ${head.key}/${def.key}`);
        ctx.drawImage(im, l * im.width, t * im.height, (r - l) * im.width, (b - t) * im.height,
          (68 + f.cx - f.w / 2 + l * f.w) * 3, (90 + f.cy - f.h / 2 + t * f.h) * 3, (r - l) * f.w * 3, (b - t) * f.h * 3);
      }
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    let fits = 0; const intersections = [], scalpCoverage = [];
    for (const head of original.filter(d => d.key.startsWith('head-'))) {
      const eyes = original.filter(d => d.key.startsWith('eyes-')).map(eye => ({ key: eye.key, mask: mask(eye, head) }));
      const scalp = mask(head, head);
      for (const hat of royal.filter(d => d.key.includes('-hat-'))) {
        const a = mask(hat, head);
        // Use the actual generated head/hat alpha, not the fitting landmarks:
        // no bald scalp should escape a full covering cap above its brow band.
        let uncovered = 0, scalpInk = 0;
        for (let y = 0; y < (90 - 38) * 3; y++) for (let x = 0; x < 408; x++) {
          const p = (y * 408 + x) * 4 + 3;
          if (scalp[p] > 200) { scalpInk++; if (a[p] < 128) uncovered++; }
        }
        scalpCoverage.push({ head: head.key, hat: hat.key, uncovered: uncovered / scalpInk });
        for (const eye of eyes) {
          let overlap = 0, total = 0;
          for (let p = 3; p < a.length; p += 4) if (eye.mask[p] > 128) { total++; if (a[p] > 128) overlap++; }
          if (overlap / total >= .02) intersections.push({ head: head.key, hat: hat.key, eyes: eye.key, overlap: overlap / total });
          fits++;
        }
      }
    }
    addLegacyPoints(20000); ROYAL_WARDROBE.forEach(item => must(purchaseRoyalWardrobe(item.id), item.id));
    const scene = window.__phaserGame.scene.getScene('MenuScene'); scene.children.removeAll(true);
    scene.scale.setGameSize(1440, 1000); scene.cameras.main.setSize(1440, 1000).setZoom(1).setScroll(0, 0);
    scene.add.rectangle(720, 500, 1440, 1000, 0xf0e7cf);
    const rendered = new Set();
    ['dinh', 'ly', 'tran', 'le', 'tayson', 'nguyen'].forEach((era, row) => {
      for (let v = 1; v <= 3; v++) {
        const look = buildKingLook({ ...rollKingChoice(() => .7), era, sex: era === 'nguyen' && v === 3 ? 'woman' : 'man', age: 'prime', beard: 0,
          royalHat: `royal-${era}-hat-${v}`, royalRobe: `royal-${era}-robe-${v}`, royalOrnament: `royal-${era}-ornament-${v}` }, 3);
        const root = renderLookInBox(scene, look, { x: row * 240 + 20, y: (v - 1) * 326 + 15, width: 200, height: 292 }, 1.5);
        const visit = o => { if (o.list) o.list.forEach(visit); else if (o.frame?.name?.startsWith('royal-')) { must(o.texture.key === 'face:royal', 'Wrong atlas'); rendered.add(o.frame.name); } }; visit(root);
        scene.add.text(row * 240 + 120, (v - 1) * 326 + 307, `${era} · ${v}`, { fontSize: '14px', color: '#302b26' }).setOrigin(.5, 0);
      }
    });
    return { parts: royal.length, eyeFits: fits, intersections, scalpCoverage, rendered: rendered.size };
  });
  await page.waitForTimeout(150); await page.screenshot({ path: `${out}/all-outfits.png` });
  // Review every cap on the extremes that circumference-only fitting misses.
  for (const head of ['head-fine', 'head-full', 'head-long', 'head-slim']) {
    await page.evaluate(async head => {
      const { default: royal } = await import('/src/ui/faces/royal.defs.json');
      const { buildKingLook, rollKingChoice } = await import('/src/ui/faces/kingLook.ts');
      const { neckForHead } = await import('/src/ui/faces/heroLook.ts');
      const { renderLookInBox } = await import('/src/ui/FaceRenderer.ts');
      const scene = window.__phaserGame.scene.getScene('MenuScene'); scene.children.removeAll(true);
      scene.add.rectangle(720, 500, 1440, 1000, 0xf0e7cf);
      royal.filter(d => d.key.includes('-hat-')).forEach((hat, i) => {
        const era = hat.key.split('-')[1], v = Number(hat.key.at(-1));
        const look = buildKingLook({ ...rollKingChoice(() => .7), era, sex: era === 'nguyen' && v === 3 ? 'woman' : 'man', age: 'prime', beard: 0,
          royalHat: hat.key, royalRobe: `royal-${era}-robe-1` }, 3);
        look.parts = [...look.parts.filter(p => !/^(head-|neck)/.test(p.key)), { key: head, tint: 'skin' }, { key: neckForHead(head), tint: 'skinShadow' }];
        renderLookInBox(scene, look, { x: i % 6 * 240 + 20, y: Math.floor(i / 6) * 326 + 15, width: 200, height: 292 }, 1.5);
        scene.add.text(i % 6 * 240 + 120, Math.floor(i / 6) * 326 + 307, hat.key.replace('royal-', ''), { fontSize: '13px', color: '#302b26' }).setOrigin(.5, 0);
      });
    }, head);
    await page.waitForTimeout(100); await page.screenshot({ path: `${out}/hats-${head}.png` });
  }
  // Every supported face pack uses the same generated wardrobe atlas.
  for (const pack of ['legacy', 'dongho-v1']) {
    await page.goto(`${base}/?capture=1&heroArt=${pack}`);
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
    assert(await page.evaluate(() => window.__phaserGame.textures.get('face:royal').getFrameNames().length === 54));
  }
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, artPacks: 3, errors }, null, 2));
  assert.equal(report.rendered, 54); assert.deepEqual(report.intersections, []); assert.deepEqual(errors, []);
  assert.equal(report.scalpCoverage.length, 288);
  assert.deepEqual(report.scalpCoverage.filter(fit => fit.uncovered > .01), [], 'Cap leaves scalp exposed above the brow band');
  assert(requests.every(url => !url.endsWith('.svg') && !url.includes('/war-v1/')));
  console.log('PASS', { parts: report.parts, eyeFits: report.eyeFits, scalpFits: report.scalpCoverage.length, rendered: report.rendered, artPacks: 3 });
} finally { await browser.close(); }
