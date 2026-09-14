/**
 * One scale on the battlefield too — measured off a real fight, not read off the source.
 *
 * `verify-ground-scale.mjs` does this for the map and has caught the same fault twice. The battle
 * screen was never covered by it, and drifted exactly as far as you would expect: the men were
 * drawn at `BATTLE_HOST_SCALE`, the scenery at `GROUND_SCALE * 1.5`, and every prop then carried a
 * hand-tuned multiplier on top — 0.42 for the bamboo, 0.55 for the seat, 0.7 for the buffalo. A
 * trâu came out at 0.756 against a soldier's 1.45, so an animal that stands nearly as tall as a
 * man was drawn at half his height, and the war camp beside it at twice the height a tent is.
 *
 * The premise of `proportion.ts` is that the corrections in `UNIT` only equalise the props **if
 * every call site passes the same caller scale**. So this arms the same probe, opens a real
 * engagement, and reads back the caller scale of every prop the battlefield draws.
 *
 * Depth is the one thing allowed to change it — a treeline on the horizon is drawn smaller than
 * the tree in the near corner, which is perspective and belongs to *where* a thing stands rather
 * than to what it is. So the band is checked against the spread `battleScaleAt` can legitimately
 * produce, and anything outside that is a call site disagreeing.
 *
 * One thing on that field is *not* covered here, and it should be said rather than left to be
 * discovered: the war camp does not go through `unitScale`, so the probe never sees it. It is
 * drawn straight in metres — every coordinate multiplied by `PX_PER_M` and the caller's scale — so
 * it lands on the buildings' rate by construction rather than by correction. At the scale it is
 * drawn at that works out to the same 3.7 px per metre the houses report below.
 *
 * Usage: node test_scripts/verify/verify-battle-scale.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);

const FIRST = `(p) => { const o = p.options ?? [];
  switch (p.kind) {
    case 'founder': return p.options[0];
    case 'power-draft': return p.cards?.[0] ?? 'skip';
    case 'conquer-target': return p.targets?.[0]?.landId ?? 'hold';
    case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
    case 'hero-choice': return p.heroIds?.[0] ?? 'pass';
    case 'court-appointment': return p.options[0].id;
    case 'law-choice': return p.projectIds?.[0] ? 'edict:' + p.projectIds[0] : 'hold';
    case 'parliament': return 'decline';
    default: return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
  } }`;

const run = await page.evaluate(async (src) => {
  window.__startBenchGame(20260812, 'ascent', 'v1');
  await new Promise((r) => setTimeout(r, 1200));
  const st = window.__mandateState;
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { setPropScaleProbe } = await import('/src/ui/ink/proportion.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  // eslint-disable-next-line no-eval
  const first = eval(src);

  for (let t = 0; t < 200 && !st.ascent.activeBattle; t += 1) {
    advanceAscentTick(st);
    world.refresh();
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 12) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
    ui.events.emit('state-changed');
  }
  if (!st.ascent.activeBattle) return null;

  // Armed only now, so what it catches is the battlefield and not the map behind it.
  const seen = [];
  setPropScaleProbe((sample) => seen.push(sample));
  // Force a full rebuild of the field with the probe listening.
  ui.battleUi.fieldSignature = 'probe';
  ui.updateBattle();
  await new Promise((r) => setTimeout(r, 400));
  setPropScaleProbe(undefined);

  const b = ui.battleUi;
  const top = b.content.y + 18;
  return {
    seen,
    land: st.ascent.activeBattle.landName,
    groundScale: ui.battleScaleAt(b.geometry.groundY),
    horizonScale: ui.battleScaleAt(top + b.fieldHeight * 0.30),
    nearScale: ui.battleScaleAt(top + b.fieldHeight),
  };
}, FIRST);

await browser.close();

if (!run) {
  console.log('CHECK: no engagement opened in 200 ticks — nothing to measure');
  process.exit(0);
}

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });

// Grass jitters on purpose (see RATE_EXEMPT in verify-ground-scale) and is not a size claim.
const samples = run.seen.filter((s) => s.prop !== 'grassTuft');
const byProp = new Map();
for (const s of samples) {
  if (!byProp.has(s.prop)) byProp.set(s.prop, []);
  byProp.get(s.prop).push(s.caller);
}

console.log(`\n  ${run.land} — ${samples.length} props drawn on the field\n`);
console.log(`  the scale runs ${run.horizonScale.toFixed(2)} at the horizon → ${run.groundScale.toFixed(2)} on the line`
  + ` → ${run.nearScale.toFixed(2)} at the near edge\n`);
console.log('  prop            n   caller scale      px per metre');
const rows = [...byProp.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [prop, scales] of rows) {
  const rates = samples.filter((s) => s.prop === prop).map((s) => s.pxPerMetre);
  console.log(`    ${prop.padEnd(12)} ${String(scales.length).padStart(3)}   ${Math.min(...scales).toFixed(2)} - ${Math.max(...scales).toFixed(2)}`
    + `      ${Math.min(...rates).toFixed(1)} - ${Math.max(...rates).toFixed(1)}`);
}

// The rate a prop is drawn at, once its class's exaggeration is divided back out. People and
// livestock carry `LIVING`; buildings and plants do not. Everything on the field should then agree
// to within the depth spread — that is the whole claim.
const LIVING = 1.8;
const alive = new Set(['figure', 'farmer', 'buffalo']);
const rate = (s) => s.pxPerMetre / (alive.has(s.prop) ? LIVING : 1);
const rates = samples.map(rate);

const all = samples.map((s) => s.caller);
const low = Math.min(...all);
const high = Math.max(...all);
// The legitimate spread, plus the ±20% jitter the scatter applies to individual plants.
const floor = run.horizonScale * 0.8;
const ceiling = run.nearScale * 1.2;

check('the battlefield drew something', samples.length >= 8, `${samples.length} props`);
check('nothing is drawn smaller than the horizon allows', low >= floor,
  `lowest ${low.toFixed(2)} against a floor of ${floor.toFixed(2)}`);
check('nothing is drawn larger than the near edge allows', high <= ceiling,
  `highest ${high.toFixed(2)} against a ceiling of ${ceiling.toFixed(2)}`);
// The whole point: the spread must be explained by depth, not by per-prop taste. Anything wider
// than the depth range plus jitter means a call site is picking its own size again.
check('the spread is depth and nothing else', high / low <= (run.nearScale / run.horizonScale) * 1.5,
  `${(high / low).toFixed(2)}x across the field, depth alone is ${(run.nearScale / run.horizonScale).toFixed(2)}x`);
// The check the complaint was actually about: a buffalo and a soldier and a tent, all drawn to
// the same metre once the one deliberate exaggeration is taken back out.
check('a metre is a metre, whatever is standing on it',
  Math.max(...rates) / Math.min(...rates) <= (run.nearScale / run.horizonScale) * 1.5,
  `${(Math.min(...rates)).toFixed(1)} - ${(Math.max(...rates)).toFixed(1)} px per metre`);
check('no console errors', errors.length === 0, errors[0] ?? 'none');

console.log('');
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name.padEnd(46)} ${c.detail}`);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length === 0
  ? '\nPASS: the battlefield is drawn at one scale'
  : '\nFAIL: the battlefield disagrees with itself');
process.exit(failed.length === 0 ? 0 : 1);
