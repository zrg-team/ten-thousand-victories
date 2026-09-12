/**
 * The measurable half of "is this fun?".
 *
 * Fun is a judgement, but several of its preconditions are arithmetic, and those are the ones
 * that were silently false when this was written. The headline is the agency ratio: how a player
 * who engages with every offer does against one who declines everything. If declining wins, the
 * game punishes engagement and no amount of art or copy will fix it — that was the state of
 * Dragon Ascent in August 2026, where refusing every offer survived 29 waves against 15.
 *
 * Everything here runs the engine headlessly with no rendering, so a full sweep is seconds rather
 * than the fifteen real-time minutes a run takes. Pair it with `playtest-session.mjs`, which
 * watches the actual screen, and `playtest-play.mjs`, which lets a strategy be tuned and retried.
 *
 * Usage: node test_scripts/playtest/playtest-metrics.mjs [--seeds 8] [--ticks 600] [--json]
 * Env:   PLAYTEST_URL to point at a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BASE_URL, DECLINE, ENGINE_BOOT, READ_OPTIONS, bar, summarise } from '../../../../test_scripts/playtest/playtest-lib.mjs';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const SEED_COUNT = arg('--seeds', 8);
const TICKS = arg('--ticks', 600);
const JSON_ONLY = process.argv.includes('--json');
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 11 + i * 11);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const raw = await page.evaluate(async ({ seeds, ticks, decline }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const { computeRunScore } = await import('/src/state/legacy.ts');
  const { contestedDefencePower } = await import('/src/systems/ascent/PowerSystem.ts');

  /**
   * One run under one policy. Records not just the ending but the shape of the run: where the
   * decisions fell, how the danger moved, and how often the battle screen had anything in it.
   */
  const play = async (seed, policy) => {
    localStorage.clear(); const state = await window.__ptBoot(seed);
    // The seed stays installed for the whole run, not just world generation — see `__ptBoot`.
    // Restored below so one policy's run cannot inherit the previous one's stream.
    let rnd = ((seed * 2654435761) >>> 0) || 1;
    const random = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };

    const decisionTicks = [];
    const ratios = [];
    let tick = 0, answered = 0, battleTicks = 0, battleOpens = 0, inBattle = false, over = false;
    let goldPeak = 0, deepest = 0, dearest = 0;
    const kinds = {};

    for (; tick < ticks; tick += 1) {
      if (state.isDefeated || over) break;
      advanceAscentTick(state);
      drainAscentPrompts(state);

      if (state.ascent.activeBattle) {
        battleTicks += 1;
        if (!inBattle) { battleOpens += 1; inBattle = true; }
      } else {
        inBattle = false;
      }
      goldPeak = Math.max(goldPeak, state.resources.gold);
      const defence = contestedDefencePower(state);
      if (defence > 0) {
        const ratio = state.ascent.threat / defence;
        ratios.push(ratio);
        deepest = Math.max(deepest, ratio);
      }

      let guard = 0;
      while (state.pendingAscentPrompt && guard < 40) {
        guard += 1;
        const prompt = state.pendingAscentPrompt;
        // The dearest thing the run was ever actually offered, measured rather than assumed.
        // This used to be a hardcoded 54 — the priciest *card* — while the real sinks (walls,
        // sellswords, grain, tribute) are pegged to income and run into the thousands, so the
        // oversupply ratio it produced was inflated by orders of magnitude.
        for (const option of prompt.options ?? []) {
          const gold = option?.cost?.gold ?? 0;
          if (gold > dearest) dearest = gold;
        }
        if (prompt.kind === 'power-draft' && prompt.rerollCost > dearest) dearest = prompt.rerollCost;
        const options = window.__ptOptions(state);
        if (!options || !options.length) break;
        // `run-over` is terminal: the resolver hands it to the summary scene rather than
        // clearing it, so a headless loop re-answers the same card until its guard trips.
        if (prompt.kind === 'run-over') { over = true; break; }
        kinds[prompt.kind] = (kinds[prompt.kind] ?? 0) + 1;
        decisionTicks.push(tick);

        let pick;
        if (policy === 'engaged') pick = options[0];
        else if (policy === 'declining') {
          const out = decline[prompt.kind];
          pick = out && options.includes(out) ? out : options[options.length - 1];
        } else if (policy === 'random') pick = options[Math.floor(random() * options.length)];
        else pick = options[options.length - 1];

        if (!resolveAscentPrompt(state, pick)) break;
        answered += 1;
        drainAscentPrompts(state);
      }
      state.isPaused = false;
    }

    // Gaps between decision *moments*, in ticks. Cards that chain (a conquest target followed
    // straight by its method sheet) are one moment, not two — counting them separately invents
    // a variety the player never experiences, and scored a metronome full marks for pacing.
    const moments = [];
    for (const t of decisionTicks) {
      if (!moments.length || t - moments[moments.length - 1] > 1) moments.push(t);
    }
    const gaps = [];
    for (let i = 1; i < moments.length; i += 1) gaps.push(moments[i] - moments[i - 1]);

    window.__ptRestoreRandom();
    return {
      seed,
      waves: state.ascent.wavesSurvived,
      score: computeRunScore(state),
      ticks: tick,
      died: !!state.isDefeated,
      answered,
      kinds,
      gaps,
      ratios,
      deepestDanger: +deepest.toFixed(2),
      battleOpens,
      battleTicks,
      goldPeak: Math.round(goldPeak),
      dearest: Math.round(dearest),
      goldEnd: Math.round(state.resources.gold),
      lands: state.lands.filter((l) => l.ownerId === 'dai-viet').length,
      peakPower: Math.round(state.ascent.peakPower),
    };
  };

  const out = {};
  for (const policy of ['engaged', 'declining', 'random', 'contrarian']) {
    out[policy] = [];
    for (const seed of seeds) out[policy].push(await play(seed, policy));
  }
  return out;
}, { seeds: SEEDS, ticks: TICKS, decline: DECLINE });

await browser.close();

// ── scoring ────────────────────────────────────────────────────────────────
const mean = (rows, key) => rows.reduce((a, r) => a + r[key], 0) / rows.length;
const engaged = raw.engaged;
const declining = raw.declining;

const agencyRatio = mean(engaged, 'waves') / Math.max(0.001, mean(declining, 'waves'));
// Do different ways of playing produce different runs at all? Identical outcomes mean the
// choices are decoration even if engaged play happens to come out ahead.
const policyMeans = Object.values(raw).map((rows) => mean(rows, 'waves'));
const divergence = (Math.max(...policyMeans) - Math.min(...policyMeans)) / Math.max(0.001, Math.max(...policyMeans));

const pacing = summarise(engaged.flatMap((r) => r.gaps));
const dangerSpread = summarise(engaged.map((r) => r.deepestDanger));
const battlesPerRun = mean(engaged, 'battleOpens');
const goldPeakMean = mean(engaged, 'goldPeak');
// The dearest thing the run was actually offered, measured per run rather than hardcoded.
// Floored at 54 (the priciest card) so a run that never sees a real sink still scores against
// something, instead of dividing by zero and reporting a perfect economy.
const BIGGEST_PURCHASE = Math.max(54, Math.round(mean(engaged, 'dearest')));
const treasuryPressure = goldPeakMean / BIGGEST_PURCHASE;
const deathRate = engaged.filter((r) => r.died).length / engaged.length;

const clamp = (v) => Math.max(0, Math.min(1, v));
const dims = [
  {
    key: 'agency', weight: 25,
    // 1.0 = choices are neutral, 2.0 = engaging doubles your run. Below 1.0 scores zero:
    // a game that punishes engagement has negative agency, not a little.
    got: clamp((agencyRatio - 1) / 1),
    detail: `engaged ${mean(engaged, 'waves').toFixed(1)} waves vs declining ${mean(declining, 'waves').toFixed(1)} → ratio ${agencyRatio.toFixed(2)}`,
    target: 'engaged play should beat declining by 1.5×+',
  },
  {
    key: 'divergence', weight: 10,
    got: clamp(divergence / 0.5),
    detail: `spread across four policies: ${(divergence * 100).toFixed(0)}% of the best result`,
    target: 'different policies should reach visibly different places',
  },
  {
    key: 'pacing', weight: 15,
    got: clamp(pacing.cv / 0.6),
    detail: `${pacing.mean} ticks between decision moments (${pacing.min}–${pacing.max}), cv ${pacing.cv}`,
    target: 'a run should have quiet stretches and busy ones — cv 0.6+',
  },
  {
    key: 'tension', weight: 15,
    got: clamp((dangerSpread.mean - 0.5) / 0.6) * clamp(dangerSpread.cv / 0.25),
    detail: `peak threat/defence ${dangerSpread.mean} (spread cv ${dangerSpread.cv}), ${(deathRate * 100).toFixed(0)}% of runs ended in defeat`,
    target: 'danger should get real, and vary between runs',
  },
  {
    key: 'economy', weight: 10,
    got: clamp(1 - Math.log10(Math.max(1, treasuryPressure)) / 2),
    detail: `peak treasury ${Math.round(goldPeakMean).toLocaleString()} vs biggest purchase ${BIGGEST_PURCHASE}g → ${Math.round(treasuryPressure)}× oversupply`,
    target: 'peak treasury under 3× the most expensive thing to buy',
  },
  {
    key: 'showpiece', weight: 10,
    got: clamp(battlesPerRun / 4),
    detail: `battle screen opens ${battlesPerRun.toFixed(1)}× per run`,
    target: 'the live battle should open 3–5 times a run',
  },
];

const objective = dims.reduce((sum, d) => sum + d.got * d.weight, 0);
const objectiveMax = dims.reduce((sum, d) => sum + d.weight, 0);

const report = {
  measuredAt: new Date().toISOString(),
  seeds: SEEDS,
  ticks: TICKS,
  objectiveScore: +objective.toFixed(1),
  objectiveMax,
  dimensions: dims.map((d) => ({ ...d, points: +(d.got * d.weight).toFixed(1) })),
  policies: Object.fromEntries(Object.entries(raw).map(([k, rows]) => [k, {
    waves: +mean(rows, 'waves').toFixed(1),
    score: Math.round(mean(rows, 'score')),
    lands: +mean(rows, 'lands').toFixed(1),
    peakPower: Math.round(mean(rows, 'peakPower')),
    deaths: rows.filter((r) => r.died).length,
  }])),
  promptMix: engaged.reduce((acc, r) => {
    for (const [k, v] of Object.entries(r.kinds)) acc[k] = +((acc[k] ?? 0) + v / engaged.length).toFixed(1);
    return acc;
  }, {}),
  errors: errors.slice(0, 10),
};

mkdirSync('output/playtest', { recursive: true });
writeFileSync('output/playtest/metrics.json', JSON.stringify(report, null, 2));

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n  MEASURABLE FUN — ${SEED_COUNT} seeds × ${TICKS} ticks, headless\n`);
  for (const d of report.dimensions) {
    console.log(`  ${d.key.padEnd(11)} ${bar(d.points, d.weight)} ${String(d.points).padStart(5)}/${d.weight}`);
    console.log(`  ${''.padEnd(11)} ${d.detail}`);
    console.log(`  ${''.padEnd(11)} \x1b[2mwant: ${d.target}\x1b[0m\n`);
  }
  console.log(`  OBJECTIVE SCORE  ${report.objectiveScore} / ${objectiveMax}\n`);
  console.log('  policy         waves   score   lands  peakPower  deaths');
  for (const [k, v] of Object.entries(report.policies)) {
    console.log(`  ${k.padEnd(13)} ${String(v.waves).padStart(6)}${String(v.score).padStart(8)}${String(v.lands).padStart(8)}${String(v.peakPower).padStart(11)}${String(v.deaths).padStart(8)}`);
  }
  if (errors.length) console.log(`\n  \x1b[31m${errors.length} console errors\x1b[0m — ${errors[0]}`);
  console.log('\n  written to output/playtest/metrics.json\n');
}

