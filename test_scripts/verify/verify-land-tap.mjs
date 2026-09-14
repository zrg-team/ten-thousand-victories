/**
 * The province tap target: the name, not the ground.
 *
 * Reported after release — *click to land UI/UX very bad and hard to click*. Selecting by hex
 * sounds generous and is not: the target is an irregular patch with no edge the eye can see, it
 * fights the pan gesture over every pixel of the map, and on a phone it is guesswork which of two
 * neighbours a thumb landed in. Dragon Ascent now resolves a tap through the name plate.
 *
 * Three things have to hold together, and the middle one is the trap:
 *
 *   1. a tap on a name selects the province that name belongs to
 *   2. ...which is **not** the province under the plate — a plate is drawn below its settlement and
 *      routinely stands on a neighbour's hexes, so resolving through `findLandIdAt` picks the wrong
 *      province. That is why the first attempt at this appeared to do nothing at all.
 *   3. bare ground selects nothing while the plate is up, and selects normally once it is not —
 *      fog hides a plate and so does the low tier's zoom LOD (`verify-culling` covers that it
 *      does), and a rule that left provinces unreachable would be worse than the fault it fixes
 *
 * The classic modes are untouched: there, tapping a province is half of *tap the army, then tap
 * where it marches*, so the ground has to stay the target.
 *
 * Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-land-tap.mjs
 */
import { chromium } from 'playwright';
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
await p.evaluate(() => window.__startBenchGame(20260828, 'ascent', 'v1'));
await p.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await p.waitForTimeout(1200);

const out = await p.evaluate(() => {
  const w = window.__phaserGame.scene.getScene('ConquestScene');
  const centreOf = (id) => {
    const r = w.labelWorldRect(id);
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  };
  const withLabel = [...w.landLabels.keys()].filter((id) => w.hasVisibleLabel(id));
  const id = withLabel[0];
  const c = centreOf(id);

  // A point inside the province's hexes but far from every plate.
  const land = w.state.lands.find((l) => l.id === id);
  let bare = null;
  for (let dx = -220; dx <= 220 && !bare; dx += 20) {
    for (let dy = -220; dy <= 220; dy += 20) {
      const x = c.x + dx; const y = c.y + dy;
      if (w.landAtLabel(x, y)) continue;
      if (!w.findLandIdAt(x, y)) continue;
      bare = { x, y, under: w.findLandIdAt(x, y) };
      break;
    }
  }

  const onPlate = w.resolveTapLand(c.x, c.y) ?? null;
  const onBare = bare ? (w.resolveTapLand(bare.x, bare.y) ?? null) : 'no-sample';
  const bareHasLabel = bare ? w.hasVisibleLabel(bare.under) : null;

  // Hide the plate the way the zoom LOD does, and the ground must answer again.
  const label = w.landLabels.get(bare?.under ?? id);
  const before = label.visible;
  label.setVisible(false);
  const hiddenFallback = bare ? (w.resolveTapLand(bare.x, bare.y) ?? null) : 'no-sample';
  label.setVisible(before);

  // A plate standing over a neighbour's hexes must still select the province it names.
  let straddling = null;
  for (const other of withLabel) {
    const rect = w.labelWorldRect(other);
    if (!rect) continue;
    const cx = rect.x + rect.width / 2; const cy = rect.y + rect.height / 2;
    const beneath = w.findLandIdAt(cx, cy);
    if (beneath && beneath !== other) {
      straddling = { plate: other, ground: beneath, resolved: w.resolveTapLand(cx, cy) ?? null };
      break;
    }
  }
  return { id, onPlate, bare, bareHasLabel, onBare, hiddenFallback, straddling, labelled: withLabel.length };
});

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};
console.log(JSON.stringify(out, null, 1));
check('a tap on the name selects that province', out.onPlate === out.id, `${out.onPlate} vs ${out.id}`);
if (out.bare === null) console.log('CHECK: no bare-ground sample found — nothing to assert');
else {
  check('a tap on bare ground selects nothing while its plate is up',
    out.bareHasLabel ? out.onBare === null : true,
    `ground of ${out.bare.under} -> ${out.onBare}`);
  check('and the ground answers again once the plate is gone',
    out.hiddenFallback === out.bare.under, `-> ${out.hiddenFallback}`);
}
if (out.straddling) {
  check('a plate standing on a neighbour still names its own province',
    out.straddling.resolved === out.straddling.plate,
    `plate ${out.straddling.plate} over ${out.straddling.ground} -> ${out.straddling.resolved}`);
} else console.log('CHECK: no straddling plate in view');
check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await b.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the name is the target' : 'FAIL: see above');
process.exit(failed.length === 0 ? 0 : 1);
