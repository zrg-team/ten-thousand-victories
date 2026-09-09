import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const out = 'output/hero-war-v1'; mkdirSync(out, { recursive: true });
const warDefs = JSON.parse(readFileSync('src/ui/faces/royal.defs.json', 'utf8')).filter(d => /^royal-(ly|tran|tayson)-(hat|robe)-2$/.test(d.key));
assert.equal(warDefs.length, 6);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/?capture=1`); await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  const report = await page.evaluate(async () => {
    const { default: royal } = await import('/src/ui/faces/royal.defs.json');
    const war = royal.filter(d => /^royal-(ly|tran|tayson)-(hat|robe)-2$/.test(d.key));
    const { default: original } = await import('/src/ui/faces/dongho-v2.defs.json');
    const { fitDonghoPart } = await import('/src/ui/faces/donghoFit.ts');
    const { buildKingLook, rollKingChoice } = await import('/src/ui/faces/kingLook.ts');
    const { renderLookInBox } = await import('/src/ui/FaceRenderer.ts');
    const { purchaseRoyalWardrobe, addLegacyPoints } = await import('/src/state/legacy.ts');
    const must = (c, m) => { if (!c) throw Error(m); };
    const images = new Map();
    for (const d of [...war, ...original.filter(d => d.key.startsWith('eyes-'))]) {
      const im = new Image(); im.src = war.includes(d) ? `/faces-royal/${d.key}.png` : `/faces-dongho-v2/parts/${d.key}.png`; await im.decode(); images.set(d.key, im);
      if (!war.includes(d)) continue;
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0); const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
      let ink = 0, clear = 0, matte = 0;
      for (let i = 0; i < rgba.length; i += 4) { if (rgba[i + 3] < 10) clear++; else if (rgba[i + 3] > 128) {
        ink++; if (Math.min(rgba[i], rgba[i + 2]) - rgba[i + 1] > 35 && rgba[i + 2] > rgba[i] * .7) matte++;
      } }
      must(ink > c.width * c.height * .2 && clear > c.width * c.height * .05 && !matte, `Invalid cutout ${d.key}: ${ink}/${clear}/${matte}`);
    }
    const mask = (d, head) => {
      const c = document.createElement('canvas'); c.width = 408; c.height = 576;
      for (const f of fitDonghoPart(d, head)) c.getContext('2d').drawImage(images.get(d.key), (68 + f.cx - f.w / 2) * 3, (90 + f.cy - f.h / 2) * 3, f.w * 3, f.h * 3);
      return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    };
    let fits = 0;
    for (const head of original.filter(d => d.key.startsWith('head-'))) for (const hat of war.filter(d => d.key.includes('-hat-'))) {
      const a = mask(hat, head);
      for (const eye of original.filter(d => d.key.startsWith('eyes-'))) {
        const b = mask(eye, head); let overlap = 0, total = 0;
        for (let i = 3; i < a.length; i += 4) if (b[i] > 128) { total++; if (a[i] > 128) overlap++; }
        must(overlap / total < .02, `Eye occlusion: ${head.key}/${hat.key}/${eye.key}`); fits++;
      }
    }
    addLegacyPoints(1080); for (const d of war) must(purchaseRoyalWardrobe(d.key), `Purchase failed ${d.key}`);
    const scene = window.__phaserGame.scene.getScene('MenuScene'); scene.children.removeAll(true);
    scene.scale.setGameSize(1200, 700); scene.cameras.main.setSize(1200, 700).setZoom(1).setScroll(0, 0);
    const w = scene.cameras.main.width, h = scene.cameras.main.height; scene.add.rectangle(w / 2, h / 2, w, h, 0xeee3c6);
    let rendered = 0;
    ['ly', 'tran', 'tayson'].forEach((era, i) => {
      const look = buildKingLook({ ...rollKingChoice(() => .7), era, sex: 'man', age: 'prime', beard: 0,
        royalHat: `royal-${era}-hat-2`, royalRobe: `royal-${era}-robe-2` }, 3);
      const root = renderLookInBox(scene, look, { x: i * w / 3 + 8, y: 16, width: w / 3 - 16, height: h - 70 }, 2.5);
      const visit = o => { if (o.list) o.list.forEach(visit); else if (o.texture?.key === 'face:royal') rendered++; }; visit(root);
      scene.add.text((i + .5) * w / 3, h - 37, ['Lý · Giáp phiến', 'Trần · Giáp buộc dây', 'Tây Sơn · Giáp da'][i], { fontSize: '15px', fontFamily: 'serif', color: '#392e25' }).setOrigin(.5, 0);
    });
    must(rendered === 6, 'Renderer used old vector frames');
    return { parts: war.length, eyeFits: fits, generatedFramesRendered: rendered };
  });
  await page.waitForTimeout(100); await page.screenshot({ path: `${out}/complete-sets.png` });
  // Both legacy art selections must still load and show the same earned replacement IDs.
  for (const pack of ['legacy', 'dongho-v1']) {
    await page.goto(`${base}/?capture=1&heroArt=${pack}`); await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
    assert(await page.evaluate(() => window.__phaserGame.textures.get('face:royal').has('royal-tran-hat-2')));
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, artPacks: 3, errors }, null, 2)); console.log('PASS', report);
} finally { await browser.close(); }
