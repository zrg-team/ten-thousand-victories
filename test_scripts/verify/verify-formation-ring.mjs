// The ring has to be a ring.
//
// Five shapes, each beating the two clockwise from it. If that is not exactly true then some shape
// is dominant or some shape is helpless, and the whole fast dial collapses into "press the good
// one" — which is the fault the three-way stance ring had and the reason it was replaced.
//
// Pure arithmetic, so this runs against the module rather than against a fight.
//
//   node test_scripts/verify/verify-formation-ring.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
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

await page.goto(`${URL}/?capture=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

const probe = await page.evaluate(async () => {
  const F = await import('/src/data/ascent/formations.ts');
  const ring = F.FORMATION_RING;

  const beats = {};
  const losesTo = {};
  for (const a of ring) {
    beats[a] = ring.filter((b) => a !== b && F.formationBeats(a, b));
    losesTo[a] = ring.filter((b) => a !== b && F.formationBeats(b, a));
  }

  // Every ordered pair is exactly one of: a beats b, b beats a, or they are the same shape.
  const contradictions = [];
  const mutuallyBlind = [];
  for (const a of ring) {
    for (const b of ring) {
      if (a === b) continue;
      const ab = F.formationBeats(a, b);
      const ba = F.formationBeats(b, a);
      if (ab && ba) contradictions.push(`${a}<->${b}`);
      if (!ab && !ba) mutuallyBlind.push(`${a}|${b}`);
    }
  }

  const selfBeats = ring.filter((a) => F.formationBeats(a, a));
  const signs = {};
  for (const a of ring) {
    for (const b of ring) signs[`${a}>${b}`] = F.formationTiltSign(a, b);
  }

  // The retier: one step is the strong counter (±2), two steps the soft one (±1), antisymmetric.
  const tiers = {};
  for (const a of ring) {
    for (const b of ring) tiers[`${a}>${b}`] = F.formationTier(a, b);
  }

  // The CLASSIC availability rules live on in the archive — probe them there, so the archive is
  // proven to still answer, not merely to still compile. See formationsClassic.ts and docs/phase-1/18-formation-availability-by-blocks.md.
  const C = await import('/src/data/ascent/formationsClassic.ts');
  const doctrines = ['balanced', 'spears', 'archers', 'shock', 'horse'].map((d) => ({
    d, states: C.classicFormationAvailability(d, 2420, 2420),
  }));

  // Bleed a balanced host to nothing and record the order the shapes closed, classically.
  const closedAt = {};
  for (let men = 2420; men >= 0; men -= 20) {
    const states = C.classicFormationAvailability('balanced', Math.max(1, men), 2420);
    for (const shape of ring) {
      if (states[shape] !== 'ready' && closedAt[shape] === undefined) closedAt[shape] = men;
    }
  }
  const floor = C.classicFormationAvailability('balanced', 1, 2420);

  return { ring, beats, losesTo, contradictions, mutuallyBlind, selfBeats, signs, tiers, doctrines, closedAt, floor };
});

const { ring, beats, losesTo, contradictions, mutuallyBlind, selfBeats, signs, tiers, doctrines, closedAt, floor } = probe;

check(ring.length === 5, 'the ring holds five shapes', ring.join(' · '));

const twoEach = ring.every((a) => beats[a].length === 2 && losesTo[a].length === 2);
check(twoEach, 'every shape beats exactly two and loses to exactly two',
  ring.map((a) => `${a}:${beats[a].length}/${losesTo[a].length}`).join(' '));

check(contradictions.length === 0, 'no pair beats each other both ways', contradictions.join(', ') || 'none');
check(mutuallyBlind.length === 0, 'no pair is mutually neutral — there is nowhere to hide',
  mutuallyBlind.join(', ') || 'none');
check(selfBeats.length === 0, 'no shape beats itself', selfBeats.join(', ') || 'none');

// The document's own edges, spelled out. If any of these flips, the prose on the page is now a lie.
const DOC = [
  ['chong', 'xung'], ['chong', 'tan'],
  ['xung', 'tan'], ['xung', 'quy'],
  ['tan', 'quy'], ['tan', 'no'],
  ['quy', 'no'], ['quy', 'chong'],
  ['no', 'chong'], ['no', 'xung'],
];
const wrong = DOC.filter(([a, b]) => !beats[a].includes(b));
check(wrong.length === 0, "the ten edges match Doc 14's table",
  wrong.map(([a, b]) => `${a}>${b}`).join(', ') || 'all ten');

const signsOk = DOC.every(([a, b]) => signs[`${a}>${b}`] === 1 && signs[`${b}>${a}`] === -1)
  && ring.every((a) => signs[`${a}>${a}`] === 0);
check(signsOk, 'the tilt sign follows the ring, and is zero against a mirror');

// The retier. One step round the ring is the strong answer, two the soft one, and the relation is
// antisymmetric — tier(a,b) === -tier(b,a) — so no ordered pair can be strong both ways.
const near = ring.every((a, i) => tiers[`${a}>${ring[(i + 1) % 5]}`] === 2);
const far = ring.every((a, i) => tiers[`${a}>${ring[(i + 2) % 5]}`] === 1);
const anti = ring.every((a) => ring.every((b) => tiers[`${a}>${b}`] === -tiers[`${b}>${a}`]));
check(near, 'one step round the ring is the strong counter (+2)',
  ring.map((a, i) => `${a}>${ring[(i + 1) % 5]}:${tiers[`${a}>${ring[(i + 1) % 5]}`]}`).join(' '));
check(far, 'two steps is the soft counter (+1)');
check(anti, 'the tier is antisymmetric — tier(a,b) === -tier(b,a)');

// The ARCHIVE: doctrines with no horse never had the wedge, the one with no screen no skirmish.
const spears = doctrines.find((d) => d.d === 'spears').states;
const archers = doctrines.find((d) => d.d === 'archers').states;
const shock = doctrines.find((d) => d.d === 'shock').states;
check(spears.xung === 'gone' && archers.xung === 'gone',
  'classic archive: a doctrine with no horse never had Thế Xung', `spears:${spears.xung} archers:${archers.xung}`);
check(shock.tan === 'gone', 'classic archive: a doctrine with no screen never had Thế Tán', `shock:${shock.tan}`);

// The narrowing arc: the screen dies first and takes the skirmish with it.
check(closedAt.tan !== undefined && (closedAt.xung === undefined || closedAt.tan > closedAt.xung),
  'classic archive: Thế Tán closed before Thế Xung',
  `tan at ${closedAt.tan ?? 'never'} · xung at ${closedAt.xung ?? 'never'}`);

check(closedAt.chong === undefined && closedAt.quy === undefined,
  'classic archive: Thế Chông and Thế Quy never closed', `chong ${closedAt.chong ?? 'never'} · quy ${closedAt.quy ?? 'never'}`);

check(floor.quy === 'ready', 'classic archive: the tortoise was the floor', `quy:${floor.quy}`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the ring is not a ring');
