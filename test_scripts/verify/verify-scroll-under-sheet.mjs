/**
 * Lists inside a run's pages scroll; lists under a sheet do not.
 *
 * Hotfix gate. The lock that keeps a page from scrolling under a modal keyed off the registered
 * sheet probe alone, and in a run every lane page and prompt IS the registered sheet — so the
 * probe answered true for the whole run and every list in Dragon Ascent froze (*all scroll views
 * in conquest gameplay broken — child pages, the land list, everything*). A list inside the sheet
 * is the sheet's own and must scroll; only a list under it is locked.
 *
 * Usage: node test_scripts/verify/verify-scroll-under-sheet.mjs   (a dev server must be running)
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260904, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
await page.waitForTimeout(1500);

/** Every scroll area on the UI scene: its hit zone, its content container, and where it sits. */
const listAreas = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const out = [];
  const walk = (list) => {
    for (let i = 0; i < list.length; i += 1) {
      const o = list[i];
      const next = list[i + 1];
      // `addTo` parents [hitZone, container] side by side; the content is the container's middle child.
      if (o.type === 'Zone' && next?.type === 'Container' && next.list?.length === 3 && next.list[1]?.type === 'Container') {
        const m = o.getWorldTransformMatrix();
        out.push({ x: m.tx, y: m.ty, w: o.width, h: o.height, contentY: next.list[1].y, sheet: Boolean(ui.openPromptKey) });
      }
      if (o.list) walk(o.list);
    }
  };
  walk(ui.children.list);
  return out;
});

// Open the Build screen: a lane page with the province list, drawn inside the modal layer.
await page.evaluate(async () => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const build = await import('/src/scenes/conquest/screens/build.ts');
  build.showBuildScreen(ui);
});
await page.waitForTimeout(800);
const before = await listAreas();
check('the Build screen opens with a scroll area, inside the run\'s registered sheet', before.length > 0 && before[0].sheet, JSON.stringify(before[0] ?? null));
const area = before[0];
if (area) {
  const frame = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); const s = window.__phaserGame.scale.gameSize; return { ox: c.left, oy: c.top, kx: c.width / s.width, ky: c.height / s.height }; });
  const x = area.x + area.w / 2;
  const y0 = area.y + area.h * 0.8;
  await page.mouse.move(frame.ox + x * frame.kx, frame.oy + y0 * frame.ky);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) { await page.mouse.move(frame.ox + x * frame.kx, frame.oy + (y0 - i * 18) * frame.ky); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await listAreas();
  check('a finger drag scrolls the list on the Build screen', after[0] && after[0].contentY !== area.contentY, `content y ${area.contentY} -> ${after[0]?.contentY}`);
  // The wheel, too.
  await page.mouse.move(frame.ox + x * frame.kx, frame.oy + (area.y + area.h / 2) * frame.ky);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(300);
  const wheeled = await listAreas();
  check('the wheel scrolls it as well', wheeled[0] && wheeled[0].contentY !== after[0]?.contentY, `content y ${after[0]?.contentY} -> ${wheeled[0]?.contentY}`);
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: lists inside a run\'s pages scroll' : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
