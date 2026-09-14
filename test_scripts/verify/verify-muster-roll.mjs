// What this run's armies look like, and whether that is honest.
//
// Two things have to hold at once and they pull against each other. Every run must open on a
// different war — a Ming column in a spear wall, then Chăm raiders with a cavalry wing — and the
// same seed must still reproduce the same run, or "reproducible seed" means nothing and every
// pinned-RNG harness in this directory is measuring noise.
//
//   node test_scripts/verify/verify-muster-roll.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
const ENEMY = ['song', 'yuan', 'ming', 'qing', 'champa'];
const VIET = ['ly', 'tran', 'le', 'trinh', 'nguyenLord', 'tayson', 'nguyen'];
const DOCTRINES = ['balanced', 'spears', 'archers', 'shock', 'horse'];

const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

/** Boot a seed and report what it mustered. */
const roll = async (seed) => {
  await page.evaluate((s) => window.__startBenchGame(s, 'ascent', 'v1'), seed);
  await page.waitForFunction(() => window.__mandateState?.muster !== undefined, null, { timeout: 20000 });
  return page.evaluate(() => {
    const st = window.__mandateState;
    return {
      dynasty: st.muster.dynasty,
      composition: st.muster.composition,
      rivals: st.kingdoms
        .filter((k) => k.id !== 'dai-viet')
        .map((k) => `${k.id}:${k.wardrobe}:${k.composition}`),
    };
  });
};

// ── the same seed is the same war ────────────────────────────────────────
const a = await roll(20260820);
const b = await roll(20260820);
check(
  JSON.stringify(a) === JSON.stringify(b),
  'the same seed musters the same armies',
  `${a.dynasty}/${a.composition} + ${a.rivals.length} rivals`,
);

// ── ten seeds, and what they drew ────────────────────────────────────────
const seen = { dynasty: new Set(), doctrine: new Set(), power: new Set() };
let strays = [];
let duplicateDeals = 0;
for (let i = 0; i < 10; i += 1) {
  const r = await roll(41000 + i * 977);
  seen.dynasty.add(r.dynasty);
  seen.doctrine.add(r.composition);
  const powers = r.rivals.map((s) => s.split(':')[1]);
  powers.forEach((p) => seen.power.add(p));
  strays = strays.concat(powers.filter((p) => !ENEMY.includes(p)));
  r.rivals.forEach((s) => { if (!DOCTRINES.includes(s.split(':')[2])) strays.push(s); });
  if (new Set(powers).size !== powers.length) duplicateDeals += 1;
}

check(strays.length === 0, 'every enemy is one of the five powers', strays.length ? strays.join(', ') : 'no strays in 10 runs');
check(VIET.includes(a.dynasty), 'the player wears a Việt dynasty', a.dynasty);
check(seen.power.size >= 3, 'the enemy changes between runs', `${seen.power.size} powers seen: ${[...seen.power].join(', ')}`);
check(seen.dynasty.size >= 2, 'the player changes between runs', `${seen.dynasty.size} dynasties: ${[...seen.dynasty].join(', ')}`);
check(seen.doctrine.size >= 2, 'the deployment changes between runs', `${seen.doctrine.size} doctrines: ${[...seen.doctrine].join(', ')}`);
check(duplicateDeals === 0, 'no two rivals in a run share a power', `${duplicateDeals} runs with a repeat`);
check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
