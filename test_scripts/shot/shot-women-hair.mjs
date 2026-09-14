// Focused women-only portrait sheet for judging historical hair silhouettes at a useful size.
//
// Usage: node test_scripts/shot/shot-women-hair.mjs [label]
//        DEV_URL=http://127.0.0.1:5179 node test_scripts/shot/shot-women-hair.mjs final
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const LABEL = process.argv[2] ?? 'current';
const COLS = 3;
const ROWS = 5;
const PER_PAGE = COLS * ROWS;

mkdirSync('output/web-game', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`CONSOLE ${message.text()}`);
});

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);
await page.evaluate(() => window.__startBenchGame(20260901, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(700);

const pageCount = await page.evaluate(async ({ perPage }) => {
  const { heroTemplates } = await import('/src/data/heroes.ts');
  return Math.ceil(heroTemplates.filter((hero) => hero.sex === 'woman').length / perPage);
}, { perPage: PER_PAGE });

for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
  const result = await page.evaluate(async ({ cols, rows, perPage, pageIndex }) => {
    const { renderHeroFace, HERO_FACE_W, HERO_FACE_H } = await import('/src/ui/FaceRenderer.ts');
    const { heroTemplates } = await import('/src/data/heroes.ts');
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.children.removeAll(true);

    const women = heroTemplates
      .filter((hero) => hero.sex === 'woman')
      .slice(pageIndex * perPage, pageIndex * perPage + perPage);
    const cellW = 390 / cols;
    const cellH = 844 / rows;
    const faceScale = Math.min((cellW - 16) / HERO_FACE_W, (cellH - 25) / HERO_FACE_H);
    scene.add.graphics().fillStyle(0xe8ddc4, 1).fillRect(0, 0, 390, 844).setDepth(-2);

    women.forEach((hero, index) => {
      const column = index % cols;
      const row = Math.floor(index / cols);
      const x = column * cellW + cellW / 2;
      const top = row * cellH;
      const y = top + 4 + (HERO_FACE_H * faceScale) / 2;
      scene.add.existing(renderHeroFace(scene, hero, x, y, faceScale));
      scene.add.text(x, top + cellH - 15, `${hero.era ?? 'mixed'} · ${hero.name}`, {
        color: '#3a2c1d',
        fontFamily: 'Arial, sans-serif',
        fontSize: '7px',
        align: 'center',
      }).setOrigin(0.5).setDepth(200);
    });
    return women.map((hero) => `${hero.era ?? 'mixed'}:${hero.name}`);
  }, { cols: COLS, rows: ROWS, perPage: PER_PAGE, pageIndex });

  await page.waitForTimeout(350);
  await page.screenshot({ path: `output/web-game/women-hair-${LABEL}-${pageIndex}.png` });
  console.log(`page ${pageIndex}: ${result.join(' | ')}`);
}

console.log(errors.length ? `FAIL ${errors.length} errors\n${errors.slice(0, 5).join('\n')}` : 'PASS: no console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
