/**
 * Every beard over every head shape, big enough to see where it attaches.
 *
 * The roster sheet is 40 faces at a fifth of a phone's width and most of them are clean-shaven —
 * a beard that sits an eighth of a head too low reads there as a smudge near the jaw and nowhere
 * as a fault. This is one sheet per head shape, four beards a row, at three times that size, so
 * the attachment is the thing the sheet is about.
 *
 * Usage: node test_scripts/shot/shot-beards.mjs        → output/faces/beards-<head>.png
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5199';
const OUT = process.env.SHOT_OUT ?? 'output/faces';
mkdirSync(OUT, { recursive: true });

// The canonical head, the narrowest, the widest, the shortest chin and the longest — the corners
// of the range the fitting has to hold across.
const HEADS = process.env.BEARD_HEADS?.split(',')
  ?? ['head-oval', 'head-slim', 'head-full', 'head-round', 'head-long'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260818, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(700);

for (const head of HEADS) {
  const info = await page.evaluate(async (headKey) => {
    const { renderLookInBox } = await import('/src/ui/FaceRenderer.ts');
    const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
    const { resolveHeroLook } = await import('/src/ui/faces/heroLook.ts');
    const { heroTemplates } = await import('/src/data/heroes.ts');

    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.children.removeAll(true);
    scene.add.graphics().fillStyle(0xe8ddc4, 1).fillRect(0, 0, 390, 844).setDepth(-1);

    const beards = FACE_PART_DEFS.filter((d) => d.key.startsWith('beard-')).map((d) => d.key);
    // A man's look, so the wardrobe does not strip the facial hair back off; everything except the
    // head and the beard is held fixed, so a cell differs only in what is being judged.
    const man = heroTemplates.find((h) => h.sex === 'man' && !h.id.startsWith('real-')) ?? heroTemplates[0];
    const base = resolveHeroLook({ ...man, rarity: 'Common' });

    const COLS = 4, CELL = 390 / COLS;
    beards.forEach((beard, i) => {
      const parts = base.parts
        .filter((p) => !p.key.startsWith('head-') && !p.key.startsWith('beard-')
          && !p.key.startsWith('hat-'))
        .concat([{ key: headKey, tint: 'skin' }, { key: beard, tint: 'hair' }]);
      renderLookInBox(scene, { ...base, parts }, {
        x: (i % COLS) * CELL + 2,
        y: Math.floor(i / COLS) * (CELL * 1.25) + 6,
        width: CELL - 4,
        height: CELL * 1.25 - 8,
      }, 3);
    });
    return { beards };
  }, head);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/beards-${head}.png` });
  console.log(head, info.beards.length, 'beards');
}

console.log(errors.length ? errors.slice(0, 5) : 'no console errors');
await browser.close();
