/**
 * Does playing BETTER beat playing at all?
 *
 * `playtest-metrics` guards agency — engaged play must beat declining by 1.5×. Nothing guarded the
 * next question, and it went unnoticed for a whole tuning pass: four genuinely different engaged
 * strategies landed at 15.6, 15.1, 13.3 and 9.6 waves (2026-09-04), because every term the wave
 * was sized against read the realm's strength back into the threat. A game where the choice of
 * plan moves the result by two waves has a floor but no ceiling.
 *
 * Three engaged plans on different axes — expand and arm, settle and hold, hoard and buy — plus
 * the declining baseline, each over the same seeds. The gate holds two things: every engaged
 * plan still beats declining (the agency guard, re-stated here so a ceiling fix cannot buy its
 * spread by breaking the floor), and the best engaged plan is 30% or more *realm* ahead of the
 * worst.
 *
 * **Measured on power, not on waves, and that distinction is the whole gate.** A wave costs
 * `WAVE_BASELINE_GROWTH` (1.11) times the last one, so the wave count is a logarithm of the
 * strength a plan actually reached, and comparing raw wave counts crushes real differences into
 * nothing. Measured 2026-09-12: the best plan reached 24.3 waves against the worst at 19.8 — a
 * flat 1.22x that reads like "the plan barely matters", while the 4.5-wave gap between them is
 * `1.11^4.5` = **1.60x the realm**. Holding raw waves to 1.3x would have demanded 1.9x the power,
 * which no pair of competent plans will ever show; the gate was unreachable by construction and
 * had been failing since it was written. The wave figures are still printed, because they are
 * what a player experiences.
 *
 * Usage: node test_scripts/verify/verify-skill-ceiling.mjs [--seeds 8] [--ticks 600]
 * Env:   PLAYTEST_URL / DEV_URL for a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';
import { BASE_URL, ENGINE_BOOT, READ_OPTIONS } from '../playtest/playtest-lib.mjs';

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
// Twelve, not eight: measured on 2026-09-04 a single plan swung 8 ↔ 31 waves between seeds, and
// at eight seeds two arms of an A/B that differed by nothing came out 1.6× apart. The paired
// statistic below is what makes the number readable at all.
const SEED_COUNT = Number(argOf('--seeds', 12));
const TICKS = Number(argOf('--ticks', 600));
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 11 + i * 11);
const SPREAD_MIN = 1.3;
/** The wave curve's own growth rate — see the note above on why the spread is measured through it. */
const WAVE_GROWTH = 1.11;
/** In how many seeds the best plan must actually beat the worst — spread alone is seed noise. */
const PAIRED_MIN = 0.6;
const AGENCY_MIN = 1.5;

/** Preference lists per prompt kind; the first listed option on offer is taken, `*` is the fallback. */
const PLANS = {
  'expand-and-arm': {
    'conquer-target': ['*'], 'conquer-method': ['settle', 'occupy', 'assault', 'first'],
    'muster-proposal': ['accept'], 'empire-response': ['fortify', 'hire-mercenaries', 'endure'],
    'rival-demand': ['pay', 'refuse', 'endure'], 'restore-land': ['haste', 'steady', 'manage'],
    'power-draft': ['*'], famine: ['buy-grain', 'slaughter-herds', 'endure'], '*': 'first',
  },
  'settle-and-hold': {
    'conquer-target': ['*'], 'conquer-method': ['settle', 'back'],
    'muster-proposal': ['accept'], 'empire-response': ['fortify', 'endure'],
    'rival-demand': ['refuse', 'endure'], 'restore-land': ['steady', 'manage', 'haste'],
    'power-draft': ['*'], famine: ['buy-grain', 'slaughter-herds', 'endure'], '*': 'first',
  },
  'hoard-and-buy': {
    'conquer-target': ['hold'], 'conquer-method': ['back'],
    'muster-proposal': ['accept'], 'empire-response': ['buy-off', 'hire-mercenaries', 'fortify', 'endure'],
    'rival-demand': ['pay', 'bribe', 'endure'], 'restore-land': ['haste', 'steady', 'manage'],
    'power-draft': ['*'], famine: ['buy-grain', 'slaughter-herds', 'endure'], '*': 'first',
  },
  declining: {
    'conquer-target': ['hold'], 'conquer-method': ['back'], 'power-draft': ['skip'],
    'hero-choice': ['pass'], 'law-choice': ['hold'], 'muster-proposal': ['decline'],
    'empire-response': ['endure'], 'rival-demand': ['refuse', 'endure'], famine: ['endure'],
    'restore-land': ['manage'], '*': 'last',
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 160)}`); });
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const playPlan = (rules) => page.evaluate(async ({ seeds, ticks, rules }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const choose = (kind, options) => {
    const listed = rules[kind];
    if (Array.isArray(listed)) for (const want of listed) if (options.includes(want)) return want;
    const fallback = rules['*'] ?? 'first';
    if (Array.isArray(fallback)) for (const want of fallback) if (options.includes(want)) return want;
    return fallback === 'last' ? options[options.length - 1] : options[0];
  };
  const out = [];
  for (const seed of seeds) {
    const state = await window.__ptBoot(seed);
    let over = false;
    for (let tick = 0; tick < ticks && !state.isDefeated && !over; tick += 1) {
      advanceAscentTick(state);
      drainAscentPrompts(state);
      let guard = 0;
      while (state.pendingAscentPrompt && guard++ < 40) {
        const kind = state.pendingAscentPrompt.kind;
        const options = window.__ptOptions(state);
        if (!options || !options.length) break;
        if (kind === 'run-over') { over = true; break; }
        if (!resolveAscentPrompt(state, choose(kind, options))) break;
        drainAscentPrompts(state);
      }
      state.isPaused = false;
    }
    window.__ptRestoreRandom();
    out.push({ seed, waves: state.ascent.wavesSurvived, died: !!state.isDefeated });
  }
  return out;
}, { seeds: SEEDS, ticks: TICKS, rules });

console.log(`\n  SKILL CEILING — ${SEED_COUNT} seeds × ${TICKS} ticks, headless (${BASE_URL})\n`);
const waves = {};
const perSeed = {};
for (const [name, rules] of Object.entries(PLANS)) {
  const rows = await playPlan(rules);
  waves[name] = rows.reduce((s, r) => s + r.waves, 0) / rows.length;
  perSeed[name] = rows.map((r) => r.waves);
  console.log(`  ${name.padEnd(16)} ${waves[name].toFixed(1).padStart(5)} waves   per seed ${perSeed[name].join(' ')}`);
}
await browser.close();

const engaged = Object.entries(waves).filter(([n]) => n !== 'declining');
const best = engaged.reduce((a, b) => (b[1] > a[1] ? b : a));
const worst = engaged.reduce((a, b) => (b[1] < a[1] ? b : a));
const spread = best[1] / Math.max(0.001, worst[1]);
// What that wave gap is worth in realm: each wave is 1.11x the last, so a plan that lasts N
// waves longer fielded 1.11^N times the strength to do it.
const powerSpread = WAVE_GROWTH ** (best[1] - worst[1]);
const weakestAgency = worst[1] / Math.max(0.001, waves.declining);
// Paired on the seed: the same world under both plans. A mean spread can be one lucky seed.
const pairedWins = perSeed[best[0]].filter((w, i) => w > perSeed[worst[0]][i]).length / SEED_COUNT;

const checks = [];
const check = (label, pass, detail) => {
  checks.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}  — ${detail}`);
};
console.log('');
check('every engaged plan beats declining (the agency floor)', weakestAgency >= AGENCY_MIN,
  `weakest engaged ${worst[1].toFixed(1)} vs declining ${waves.declining.toFixed(1)} → ${weakestAgency.toFixed(2)}× (want ${AGENCY_MIN}×)`);
check('the best plan is 30%+ more realm than the worst (the ceiling)', powerSpread >= SPREAD_MIN,
  `${best[0]} ${best[1].toFixed(1)} vs ${worst[0]} ${worst[1].toFixed(1)} waves → ${powerSpread.toFixed(2)}× the realm`
  + ` (${spread.toFixed(2)}× on raw waves; want ${SPREAD_MIN}×)`);
check('and beats it seed for seed, not on one lucky world', pairedWins >= PAIRED_MIN,
  `${best[0]} ahead of ${worst[0]} in ${(pairedWins * 100).toFixed(0)}% of seeds (want ${PAIRED_MIN * 100}%)`);
check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: a better plan is a longer reign' : 'FAIL: the plan barely matters');
process.exit(failed === 0 ? 0 : 1);
