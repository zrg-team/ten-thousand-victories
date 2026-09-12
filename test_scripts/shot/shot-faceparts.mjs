/**
 * One part family over one head shape, at portrait size, so a part that does not sit where it
 * belongs is visible rather than a smudge on a contact sheet.
 *
 * Usage:
 *   node test_scripts/shot/shot-faceparts.mjs beard
 *   FACE_HEAD=head-slim node test_scripts/shot/shot-faceparts.mjs bun,hairpin,knot,topknot
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5199';
const OUT = process.env.SHOT_OUT ?? 'output/faces';
const FAMILIES = (process.argv[2] ?? 'beard').split(',');
const HEAD = process.env.FACE_HEAD ?? 'head-oval';
mkdirSync(OUT, { recursive: true });

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

for (const family of FAMILIES) {
  const info = await page.evaluate(async ({ family, headKey }) => {
    const { renderLookInBox } = await import('/src/ui/FaceRenderer.ts');
    const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
    const { resolveHeroLook } = await import('/src/ui/faces/heroLook.ts');
    const { heroTemplates } = await import('/src/data/heroes.ts');

    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.children.removeAll(true);
    scene.add.graphics().fillStyle(0xe8ddc4, 1).fillRect(0, 0, 390, 844).setDepth(-1);

    const keys = FACE_PART_DEFS.filter((d) => d.key.startsWith(`${family}-`) || d.key === family)
      .map((d) => d.key).slice(0, 16);
    const man = heroTemplates.find((h) => h.sex === 'man' && !h.id.startsWith('real-')) ?? heroTemplates[0];
    const base = resolveHeroLook({ ...man, rarity: 'Common' });
    const strip = new RegExp(`^(head-|hat-|${family}-|${family}$)`);
    const tint = /^(bun|hair|topknot|knot|beard)/.test(family) ? 'hair' : 'none';

    const COLS = 4, CELL = 390 / COLS;
    keys.forEach((key, i) => {
      const parts = base.parts.filter((p) => !strip.test(p.key))
        .concat([{ key: headKey, tint: 'skin' }, { key, tint }]);
      renderLookInBox(scene, { ...base, parts }, {
        x: (i % COLS) * CELL + 2,
        y: Math.floor(i / COLS) * (CELL * 1.25) + 6,
        width: CELL - 4,
        height: CELL * 1.25 - 8,
      }, 3);
    });
    return { keys };
  }, { family, headKey: HEAD });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${family}-${HEAD}.png` });
  console.log(`${family} on ${HEAD}: ${info.keys.length} — ${info.keys.join(', ')}`);
}

console.log(errors.length ? errors.slice(0, 5) : 'no console errors');
await browser.close();
