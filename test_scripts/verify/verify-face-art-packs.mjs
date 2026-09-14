// Exercise all three real loaders, baked portraits, saved-look previews and selection precedence.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5180';
const OUT = 'output/hero-dongho-v2/review';
mkdirSync(OUT, { recursive: true });
const provenance = JSON.parse(readFileSync('public/faces-dongho-v2/provenance.json', 'utf8'));
assert.equal(provenance.parts.length, new Set(provenance.parts.map(p => p.id)).size);
for (const part of provenance.parts) assert.equal(readFileSync(`public/faces-dongho-v2/parts/${part.id}.png`).subarray(1, 4).toString(), 'PNG');
assert.equal(provenance.wardrobeCount, 140);
assert.equal(provenance.parts.filter(p => p.sourcePack === 'dongho-v2').length, 140);
const browser = await chromium.launch();
const results = [];
try {
  for (const pack of ['dongho-v2', 'dongho-v1', 'legacy']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { const path = new URL(r.url()).pathname; if (/^\/faces(?:-dongho-v\d+)?\//.test(path)) requests.push(path); });
    await page.goto(`${BASE}/?capture=1&heroArt=${pack}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene') && typeof window.__startBenchGame === 'function');
    const detail = await page.evaluate(async pack => {
      const art = await import('/src/ui/faces/artPack.ts');
      const faces = await import('/src/ui/FaceRenderer.ts');
      const { resolveHeroLook } = await import('/src/ui/faces/heroLook.ts');
      const { kingHatPool, rollKingChoice } = await import('/src/ui/faces/kingLook.ts');
      const { heroTemplates } = await import('/src/data/heroes.ts');
      const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      const texture = scene.textures.get(art.HERO_FACE_ART_PACKS[pack].texture);
      const creatorHats = ['dinh', 'ly', 'tran', 'le', 'tayson', 'nguyen'].flatMap(era =>
        kingHatPool({ ...rollKingChoice(() => .5), era, sex: 'woman' }, 3));
      if (!creatorHats.every(art.heroFaceHeadwearSupported)) throw new Error('Creator offered invisible headwear');
      const missing = FACE_PART_DEFS.filter(p => !texture.has(p.key)).map(p => p.key);
      const hero = heroTemplates.find(h => h.monastic) ?? heroTemplates[0];
      const look = resolveHeroLook(hero), before = JSON.stringify(look);
      // The preview must filter unsupported decorative marks without mutating the saved look.
      look.parts.push({ key: 'mark-tattoo', tint: 'none' }, { key: 'hat-crown-seven', tint: 'none' });
      const original = JSON.stringify(look);
      const preview = faces.renderLookInBox(scene, look, { x: 0, y: 0, width: 100, height: 160 });
      const frames = preview.list[0].list.filter(o => o.frame).map(o => o.frame.name);
      const preserved = JSON.stringify(look) === original;
      preview.destroy(true);
      const key = faces.heroFaceTextureKey(scene, hero), again = faces.heroFaceTextureKey(scene, hero);
      const rendered = faces.renderHeroFace(scene, hero, 0, 0, 1);
      const children = rendered.length; rendered.destroy(true);
      art.setHeroFaceArtPack(pack === 'legacy' ? 'dongho-v1' : 'legacy');
      const queryWins = art.getHeroFaceArtPackId() === pack;
      localStorage.removeItem('van-thang:hero-face-art');
      return { pack, ready: faces.heroFacesReady(scene), missing, children, preserved, queryWins, reused: key === again, key, frames, sourceLookExists: before.length > 0, atlas: [texture.source[0].width, texture.source[0].height] };
    }, pack);
    assert.equal(detail.ready, true); assert.deepEqual(detail.missing, []);
    assert.equal(detail.children, 1); assert.equal(detail.preserved, true);
    assert.equal(detail.queryWins, true); assert.equal(detail.reused, true);
    assert(detail.key.includes(`hero-face:${pack}:`));
    assert.equal(detail.frames.includes('mark-tattoo'), pack === 'legacy');
    assert.equal(detail.frames.includes('hat-crown-seven'), pack === 'legacy');
    assert.equal(new Set(requests).size, 2);
    assert(requests.every(p => pack === 'legacy' ? /^\/faces\/atlas\.(svg|json)$/.test(p) : p === `/faces-${pack}/atlas.png` || p === `/faces-${pack}/atlas.json`));
    // Actual game flow and UI: opening choice, recruited roster, then a readable sample sheet.
    await page.evaluate(() => window.__startBenchGame(20260906, 'ascent', 'v1'));
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${pack}-game.png` });
    await page.evaluate(async () => {
      const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
      const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
      const st = window.__mandateState;
      const settle = () => { let count = 0; while (st.pendingAscentPrompt && count++ < 12) {
        const p = st.pendingAscentPrompt;
        resolveAscentPrompt(st, p.kind === 'founder' ? p.options[0] : p.kind === 'court-appointment' ? p.options[0].id : p.kind === 'power-draft' ? (p.cards[0] ?? 'skip') : p.kind === 'hero-choice' ? (p.heroIds[0] ?? 'pass') : p.kind === 'conquer-target' ? 'hold' : 'ok');
      } };
      settle(); for (let i = 0; i < 35 && st.heroes.length < 3; i++) { advanceAscentTick(st); settle(); }
      window.__phaserGame.scene.getScene('ConquestScene').refresh();
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene'); ui.events.emit('state-changed'); ui.openLane('heroes');
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${pack}-roster.png` });
    await page.evaluate(async () => {
      const { renderHeroFaceInBox } = await import('/src/ui/FaceRenderer.ts');
      const { heroTemplates } = await import('/src/data/heroes.ts');
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene'); scene.children.removeAll(true);
      scene.add.rectangle(195, 422, 390, 844, 0xf0e7cf);
      const chosen = [heroTemplates[1], heroTemplates[8], heroTemplates.find(h => h.sex === 'woman'), heroTemplates.find(h => h.monastic), heroTemplates.find(h => h.era === 'nguyen'), heroTemplates[22]].filter(Boolean);
      chosen.forEach((hero, i) => {
        renderHeroFaceInBox(scene, hero, { x: i % 2 * 190 + 8, y: Math.floor(i / 2) * 278 + 12, width: 178, height: 244 }, 2);
        scene.add.text(i % 2 * 190 + 97, Math.floor(i / 2) * 278 + 258, hero.name, { fontFamily: 'serif', fontSize: '12px', color: '#382b21' }).setOrigin(.5, 0);
      });
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${pack}-portraits.png` });
    assert.deepEqual(errors, []);
    results.push({ ...detail, requests, errors });
    await page.close();
  }
  // A stored selection works without an URL override; invalid values fall back safely.
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('van-thang:hero-face-art', 'legacy'));
  await page.goto(`${BASE}/?capture=1`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  assert.equal(await page.evaluate(() => window.__phaserGame.textures.exists('face:atlas')), true);
  const defaults = await page.evaluate(async () => {
    const art = await import('/src/ui/faces/artPack.ts');
    localStorage.setItem('van-thang:hero-face-art', 'invalid');
    return art.getHeroFaceArtPackId();
  });
  assert.equal(defaults, 'dongho-v2');
  await page.close();
  writeFileSync(`${OUT}/checks.json`, JSON.stringify({ pngParts: provenance.parts.length, results }, null, 2));
  console.log(`PASS: ${provenance.parts.length} PNG parts, all three loaders, cache reuse, saved-look previews, selection precedence and game/roster screens.`);
} finally { await browser.close(); }
