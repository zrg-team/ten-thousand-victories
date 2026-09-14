/**
 * Nothing a hero wears is drawn where there is no body to wear it on.
 *
 * Four separate reports of "the head, neck and body do not look joined" turned out to be four
 * instances of one fault, and nothing in the suite could see any of them. A portrait is a stack
 * of independently authored SVG parts; a collar drawn out at x 30 and up at y 33 composes without
 * complaint, renders without error, and hangs in mid-air on the paper because the robe's shoulder
 * does not reach that far until y 51. It is invisible to a type check, to the atlas build, and to
 * the connectivity check that came before this one — the nhật bình yoke was *joined* to the
 * figure by its band over the throat while both its corners floated.
 *
 * So this measures the one thing that matters: **per row, how far past the body behind it does a
 * worn part reach?** The body is the slimmest neck (`neck-slim`, which most women draw) or the
 * narrowest robe the part can be worn with, whichever is wider at that row.
 *
 * What it caught when it was written, in units of overhang at the worst row:
 *
 *     collar-giaolinh-wide  28      collar-band-oxblood  23      collar-tuthan   15.6
 *     collar-giaolinh       21      collar-band-brocade  22      collar-yem-wrap 15
 *     collar-twoflap        21.6    kesa                 17-19   collar-vienlinh 11
 *
 * All of them are now inside the budget below, reached by carrying the robe's shoulder control
 * point out to `-30 NECK + 4` and bringing every one of those tips down onto it.
 *
 * The budget is not zero on purpose. A collar band stands slightly proud of a throat — that is
 * what a collar does — and the parts left near the line are sloping edges that converge onto the
 * shoulder rather than blunt ends that stop in air. Twelve is a little above the worst survivor,
 * so the gate holds the line without forbidding a collar from being a collar.
 *
 * Usage: node test_scripts/verify/verify-portrait-fit.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
// This gate measures the original layered-collar geometry. V2 has complete garments;
// its assembly, alpha and anatomy checks live in verify-wardrobe-v2.mjs.
const PACK = process.env.HERO_ART ?? 'dongho-v1';
/** Units a worn part may stand proud of the body beneath it. */
const BUDGET = 12;

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 140)}`); });
await page.goto(`${BASE}/?capture=1&heroArt=${PACK}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });
await page.evaluate(() => window.__startBenchGame(20260901, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 40000 });
await page.waitForTimeout(700);

const out = await page.evaluate(async () => {
  const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
  const { ACTIVE_HERO_FACE_ART_PACK } = await import('/src/ui/faces/artPack.ts');
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const byKey = new Map(FACE_PART_DEFS.map((p) => [p.key, p]));
  const SCALE = 5, CX = 195, CY = 300, Y0 = 14, Y1 = 70;

  /** Half-width of one part at each design row, off the drawn pixels rather than its box. */
  const profileOf = async (def) => {
    scene.children.removeAll(true);
    scene.add.graphics().fillStyle(0x00ff00, 1).fillRect(0, 0, 390, 844).setDepth(-10);
    const root = scene.add.container(CX, CY).setScale(SCALE);
    root.add(scene.add.image(def.cx, def.cy, ACTIVE_HERO_FACE_ART_PACK.texture, def.key).setDisplaySize(def.w, def.h));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const img = new Image();
    img.src = window.__phaserGame.canvas.toDataURL('image/png');
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const dpr = img.width / 390;
    const half = {};
    for (let dy = Y0; dy <= Y1; dy += 1) {
      const y = Math.round((CY + dy * SCALE) * dpr);
      if (y < 0 || y >= c.height) { half[dy] = 0; continue; }
      const row = ctx.getImageData(0, y, c.width, 1).data;
      let widest = 0;
      for (let x = 0; x < c.width; x += 1) {
        const i = x * 4;
        if (row[i] < 130 && row[i + 1] > 190 && row[i + 2] < 130) continue;
        const dx = Math.abs(((x / dpr) - CX) / SCALE);
        if (dx > widest) widest = dx;
      }
      half[dy] = +widest.toFixed(1);
    }
    return half;
  };

  const backing = {};
  for (const key of ['neck-slim', 'robe-body', 'robe-slim', 'robe-sloped']) {
    backing[key] = await profileOf(byKey.get(key));
  }

  const WORN = /^(collar|guard|sash|belt|buttons|kesa|yem)/;
  const suspects = FACE_PART_DEFS.filter((p) => WORN.test(p.key) && (p.cy - p.h / 2) < 52);
  const rows = [];
  for (const def of suspects) {
    const profile = await profileOf(def);
    let worst = null;
    for (let dy = Y0; dy <= Y1; dy += 1) {
      const mine = profile[dy] ?? 0;
      if (mine <= 0) continue;
      const behind = Math.max(
        backing['neck-slim'][dy] ?? 0,
        Math.min(backing['robe-body'][dy] ?? 0, backing['robe-slim'][dy] ?? 0, backing['robe-sloped'][dy] ?? 0),
      );
      const over = +(mine - behind).toFixed(1);
      if (!worst || over > worst.over) worst = { dy, over, mine, behind: +behind.toFixed(1) };
    }
    if (worst) rows.push({ key: def.key, ...worst });
  }
  rows.sort((a, b) => b.over - a.over);
  return { rows, parts: suspects.length };
});
await browser.close();

const over = out.rows.filter((r) => r.over > BUDGET);
console.log(`\n  ${out.parts} worn parts measured; widest overhangs:`);
for (const r of out.rows.slice(0, 6)) {
  console.log(`    ${r.key.padEnd(28)} ${String(r.over).padStart(6)} past the body at y=${r.dy}`
    + `  (part ${r.mine}, body ${r.behind})`);
}
console.log('');

check(`nothing worn hangs more than ${BUDGET} units past the body`, over.length === 0,
  over.length === 0
    ? `worst is ${out.rows[0].key} at ${out.rows[0].over}`
    : over.map((r) => `${r.key} ${r.over} at y=${r.dy}`).join(' · '));
check('the measurement found something to measure', out.parts > 30 && out.rows.length > 20,
  `${out.parts} worn parts, ${out.rows.length} profiled`);
check('no browser errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

const passed = checks.filter((c) => c.pass).length;
console.log(`\n${passed}/${checks.length} portrait-fit checks passed`);
if (passed !== checks.length) process.exitCode = 1;
