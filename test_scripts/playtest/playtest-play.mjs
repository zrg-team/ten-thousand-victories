/**
 * Play the game with a strategy you wrote, see how it did, write a better one.
 *
 * This is the harness for the question the other two cannot answer: **can a thinking player get
 * better at this?** A game where attempt three cannot beat attempt one has no skill in it, however
 * many decisions it puts on screen — and a skill ceiling is most of what makes a roguelite worth
 * a second run.
 *
 * A strategy is a preference list per prompt kind. The first listed option that is actually on
 * offer gets taken; anything unlisted falls through to `*`. Every run records what it chose and
 * what it passed over, so the next strategy can be written from evidence rather than from hope.
 *
 * Results accumulate in `output/playtest/strategies.json`, so the improvement curve across
 * attempts is itself a measurement.
 *
 * Usage:
 *   node test_scripts/playtest/playtest-play.mjs --strategy my-plan.json [--seeds 8] [--ticks 600]
 *   node test_scripts/playtest/playtest-play.mjs --leaderboard
 *   node test_scripts/playtest/playtest-play.mjs --template > my-plan.json
 * Env: PLAYTEST_URL to point at a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BASE_URL, ENGINE_BOOT, READ_OPTIONS } from './playtest-lib.mjs';

const LEDGER = 'output/playtest/strategies.json';
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};

if (process.argv.includes('--template')) {
  console.log(JSON.stringify({
    name: 'name-this-attempt',
    reasoning: 'One or two sentences: what you think wins, and why you believe it.',
    rules: {
      'power-draft': ['skip'],
      'conquer-target': ['hold'],
      'conquer-method': ['back'],
      'hero-choice': ['pass'],
      'law-choice': ['hold'],
      'empire-response': ['fortify', 'send-host', 'endure'],
      'famine': ['buy-grain', 'slaughter-herds', 'endure'],
      'rival-demand': ['refuse', 'endure'],
      '*': 'first',
    },
  }, null, 2));
  process.exit(0);
}

if (process.argv.includes('--leaderboard')) {
  if (!existsSync(LEDGER)) { console.log('No attempts recorded yet.'); process.exit(0); }
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const sorted = [...ledger.attempts].sort((a, b) => b.waves - a.waves);
  console.log('\n  ATTEMPTS, best first\n');
  console.log('  #  strategy                    waves   score  lands  deaths');
  sorted.forEach((a) => {
    console.log(`  ${String(a.attempt).padStart(2)}  ${a.name.slice(0, 26).padEnd(26)} ${String(a.waves).padStart(6)}${String(a.score).padStart(8)}${String(a.lands).padStart(7)}${String(a.deaths).padStart(8)}`);
  });
  const first = ledger.attempts[0];
  const best = sorted[0];
  console.log(`\n  first attempt ${first.waves} waves → best ${best.waves} waves` +
    `  (${first.waves ? ((best.waves / first.waves - 1) * 100).toFixed(0) : '∞'}% improvement over ${ledger.attempts.length} attempts)\n`);
  process.exit(0);
}

const STRATEGY_PATH = argOf('--strategy', null);
if (!STRATEGY_PATH) {
  console.error('Need --strategy <file.json>. Start from `--template`.');
  process.exit(1);
}
const strategy = JSON.parse(readFileSync(STRATEGY_PATH, 'utf8'));
const SEED_COUNT = Number(argOf('--seeds', 8));
/**
 * Runtime overrides for `ASCENT_TUNING` (ascentConfig), as JSON — e.g.
 * `--tuning '{"shadowShareMult":0.5,"ambitionCardMult":0}'`. Applied in the page after boot, so
 * every seed on this page sees them; the ledger records them beside the strategy so an A/B can
 * be told apart from a retune afterwards.
 */
const TUNING = JSON.parse(argOf('--tuning', '{}'));
const TICKS = Number(argOf('--ticks', 600));
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 11 + i * 11);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
// Before navigation, so every instance of ascentConfig the page loads is seeded — see the note on
// `ASCENT_TUNING`; assigning after boot only reached the harness's own import.
if (Object.keys(TUNING).length) await page.addInitScript((t) => { window.__ascentTuning = t; }, TUNING);
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);
if (Object.keys(TUNING).length) {
  await page.evaluate(async (tuning) => {
    const { ASCENT_TUNING } = await import('/src/game/ascentConfig.ts');
    Object.assign(ASCENT_TUNING, tuning);
  }, TUNING);
}

const runs = await page.evaluate(async ({ seeds, ticks, rules }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const { computeRunScore } = await import('/src/state/legacy.ts');

  /** The strategy's answer for this card, and whether the strategy actually had one. */
  const choose = (kind, options) => {
    const listed = rules[kind];
    if (Array.isArray(listed)) {
      for (const want of listed) if (options.includes(want)) return { pick: want, matched: true };
    }
    const fallback = rules['*'] ?? 'first';
    if (Array.isArray(fallback)) {
      for (const want of fallback) if (options.includes(want)) return { pick: want, matched: true };
    }
    return { pick: fallback === 'last' ? options[options.length - 1] : options[0], matched: false };
  };

  const out = [];
  for (const seed of seeds) {
    const state = await window.__ptBoot(seed, { ruleset: 'v1' });
    // The seed stays installed for the whole run, not just world generation — see `__ptBoot`.
    // Restored below so one policy's run cannot inherit the previous one's stream.
    const chosen = {};
    const unmatched = {};
    const passedOver = {};
    let tick = 0;
    let over = false;

    for (; tick < ticks; tick += 1) {
      if (state.isDefeated || over) break;
      advanceAscentTick(state);
      drainAscentPrompts(state);
      let guard = 0;
      while (state.pendingAscentPrompt && guard < 40) {
        guard += 1;
        const kind = state.pendingAscentPrompt.kind;
        const options = window.__ptOptions(state);
        if (!options || !options.length) break;
        // `run-over` is terminal: the resolver hands it to the summary scene rather than
        // clearing it, so a headless loop re-answers the same card until its guard trips.
        if (kind === 'run-over') { over = true; break; }
        const { pick, matched } = choose(kind, options);
        chosen[pick] = (chosen[pick] ?? 0) + 1;
        if (!matched) unmatched[kind] = (unmatched[kind] ?? 0) + 1;
        // What the strategy walked past, so the next one can be written knowing what was there.
        for (const other of options) {
          if (other !== pick) passedOver[other] = (passedOver[other] ?? 0) + 1;
        }
        if (!resolveAscentPrompt(state, pick)) break;
        drainAscentPrompts(state);
      }
      state.isPaused = false;
    }

    window.__ptRestoreRandom();
    out.push({
      seed,
      waves: state.ascent.wavesSurvived,
      score: computeRunScore(state),
      ticks: tick,
      died: !!state.isDefeated,
      lands: state.lands.filter((l) => l.ownerId === 'dai-viet').length,
      peakPower: Math.round(state.ascent.peakPower),
      goldEnd: Math.round(state.resources.gold),
      chosen,
      unmatched,
      passedOver,
    });
  }
  return out;
}, { seeds: SEEDS, ticks: TICKS, rules: strategy.rules ?? {} });

await browser.close();

const mean = (key) => runs.reduce((a, r) => a + r[key], 0) / runs.length;
const merge = (key) => runs.reduce((acc, r) => {
  for (const [k, v] of Object.entries(r[key])) acc[k] = (acc[k] ?? 0) + v;
  return acc;
}, {});
const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

mkdirSync('output/playtest', { recursive: true });
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { attempts: [] };
const attempt = {
  attempt: ledger.attempts.length + 1,
  name: strategy.name ?? 'unnamed',
  reasoning: strategy.reasoning ?? '',
  ranAt: new Date().toISOString(),
  seeds: SEEDS,
  waves: +mean('waves').toFixed(1),
  score: Math.round(mean('score')),
  lands: +mean('lands').toFixed(1),
  peakPower: Math.round(mean('peakPower')),
  deaths: runs.filter((r) => r.died).length,
  perSeed: runs.map((r) => ({ seed: r.seed, waves: r.waves, score: r.score, died: r.died })),
  unmatched: merge('unmatched'),
};
ledger.attempts.push(attempt);
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));

const previousBest = ledger.attempts.slice(0, -1).reduce((best, a) => Math.max(best, a.waves), 0);
console.log(`\n  ATTEMPT ${attempt.attempt} — "${attempt.name}"\n`);
if (attempt.reasoning) console.log(`  ${attempt.reasoning}\n`);
console.log(`  waves      ${attempt.waves}${previousBest ? `   (best so far ${previousBest} → ${attempt.waves > previousBest ? '\x1b[32mimproved\x1b[0m' : 'no gain'})` : ''}`);
console.log(`  score      ${attempt.score}`);
console.log(`  provinces  ${attempt.lands}`);
console.log(`  died       ${attempt.deaths}/${runs.length} runs`);
console.log(`\n  per seed   ${runs.map((r) => `${r.seed}:${r.waves}`).join('  ')}`);

const unmatched = merge('unmatched');
if (Object.keys(unmatched).length) {
  console.log(`\n  cards your strategy had no rule for (fell through to '*'):`);
  for (const [kind, n] of top(unmatched)) console.log(`    ${kind.padEnd(20)} ${n}×`);
}
console.log('\n  most-taken options:');
for (const [id, n] of top(merge('chosen'))) console.log(`    ${id.padEnd(28)} ${n}×`);
console.log('\n  most-refused options (what you walked past):');
for (const [id, n] of top(merge('passedOver'))) console.log(`    ${id.padEnd(28)} ${n}×`);
if (errors.length) console.log(`\n  \x1b[31m${errors.length} console errors\x1b[0m — ${errors[0]}`);
console.log(`\n  recorded in ${LEDGER} · compare with --leaderboard\n`);
