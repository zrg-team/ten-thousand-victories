// Contact sheet of hero portraits — the only honest way to judge the wardrobe, because every
// failure mode here (a beard on a princess, a Nguyễn collar on a Trần official, two hats in
// one stack) is visible and none of it is a type error.
//
// Usage: node test_scripts/shot/shot-portraits.mjs [roster|generated|both]
//        DEV_URL=http://127.0.0.1:5179 node test_scripts/shot/shot-portraits.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const URL = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const WHICH = process.argv[2] ?? 'both';
mkdirSync('output/web-game', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260818, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(700);

const sheet = async (name, source, page0) => {
  const info = await page.evaluate(async ({ source, page0 }) => {
    const { renderHeroFace, HERO_FACE_W, HERO_FACE_H } = await import('/src/ui/FaceRenderer.ts');
    const { heroTemplates } = await import('/src/data/heroes.ts');
    const { generateHero } = await import('/src/data/heroFactory.ts');
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    // Wipe whatever the UI had up; this scene is only a canvas for the sheet.
    scene.children.removeAll(true);
    const COLS = 5, ROWS = 8, PER = COLS * ROWS;
    const heroes = source === 'roster'
      ? heroTemplates.slice(page0 * PER, page0 * PER + PER)
      : Array.from({ length: PER }, (_, i) => generateHero(90210 + (page0 * PER + i) * 7919));
    const cellW = 390 / COLS, scale = (cellW - 6) / HERO_FACE_W;
    const bg = scene.add.graphics().fillStyle(0xe8ddc4, 1).fillRect(0, 0, 390, 844).setDepth(-1);
    heroes.forEach((hero, i) => {
      const cx = (i % COLS) * cellW + cellW / 2;
      const cy = Math.floor(i / COLS) * (HERO_FACE_H * scale + 10) + HERO_FACE_H * scale * 0.62 + 8;
      scene.add.existing(renderHeroFace(scene, hero, cx, cy, scale));
    });
    void bg;
    return { count: heroes.length, names: heroes.map((h) => h.name) };
  }, { source, page0 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `output/web-game/${name}.png` });
  return info;
};

if (WHICH === 'roster' || WHICH === 'both') {
  for (const p of [0, 1]) console.log(`roster ${p}:`, (await sheet(`portraits-roster-${p}`, 'roster', p)).count);
}
if (WHICH === 'generated' || WHICH === 'both') {
  for (const p of [0, 1]) console.log(`generated ${p}:`, (await sheet(`portraits-generated-${p}`, 'generated', p)).count);
}
console.log(errors.length ? `FAIL ${errors.length} errors\n${errors.slice(0, 5).join('\n')}` : 'PASS: no console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
