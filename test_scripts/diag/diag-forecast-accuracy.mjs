/**
 * How accurate is the beta front forecast's arrival time? (backlog B10)
 *
 * In real beta reigns (first-option driver), every invading host's forecast is recorded the tick
 * its current target is first seen; when the host then reaches the target's walls (on a neighbouring
 * province, or on it), the predicted arrival tick is compared with the real one. Measured 2026-09-13
 * on 12 seeds: 325 arrivals, 96% exact, 97% within one season. Hosts that re-target or leave the map are counted apart,
 * because the forecast is explicitly "if it keeps this target".
 *
 * Usage: node test_scripts/diag/diag-forecast-accuracy.mjs [--seeds 12] [--ticks 400]
 */
import { chromium } from 'playwright';
import { READ_OPTIONS, ENGINE_BOOT } from '../playtest/playtest-lib.mjs';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const argOf = (flag, fallback) => { const i = process.argv.indexOf(flag); return i === -1 ? fallback : Number(process.argv[i + 1]); };
const SEEDS = Array.from({ length: argOf('--seeds', 12) }, (_, i) => 11 + i * 11);
const TICKS = argOf('--ticks', 400);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const result = await page.evaluate(async ({ seeds, ticks }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const { forecastInvader } = await import('/src/systems/ascent/frontForecast.ts');
  const errors = [];
  let retargeted = 0;
  let unrouted = 0;
  for (const seed of seeds) {
    window.__ptFreshProfile();
    const state = await window.__ptBoot(seed, { ruleset: 'beta' });
    const watch = new Map(); // armyId -> { target, predicted }
    for (let tick = 0; tick < ticks && !state.isDefeated; tick += 1) {
      advanceAscentTick(state);
      drainAscentPrompts(state);
      let guard = 0;
      while (state.pendingAscentPrompt && guard++ < 40) {
        if (state.pendingAscentPrompt.kind === 'run-over') break;
        const options = window.__ptOptions(state);
        if (!options?.length || !resolveAscentPrompt(state, options[0])) break;
        drainAscentPrompts(state);
      }
      state.isPaused = false;
      const live = new Set();
      for (const record of state.invasions ?? []) {
        live.add(record.armyId);
        const army = state.armies.find((a) => a.id === record.armyId);
        if (!army || !record.targetLandId || record.plan === 'withdrawing') continue;
        const seen = watch.get(record.armyId);
        if (seen && seen.target !== record.targetLandId) { retargeted += 1; watch.delete(record.armyId); }
        const target = state.lands.find((l) => l.id === record.targetLandId);
        if (army.landId === record.targetLandId || target?.neighbors.includes(army.landId)) {
          const entry = watch.get(record.armyId);
          if (entry && !entry.done) { errors.push(tick - entry.predicted); entry.done = true; }
          continue;
        }
        if (!watch.has(record.armyId)) {
          const forecast = forecastInvader(state, record);
          if (forecast?.reachTicks === undefined) { unrouted += 1; continue; }
          watch.set(record.armyId, { target: record.targetLandId, predicted: tick + forecast.reachTicks });
        }
      }
      for (const id of [...watch.keys()]) if (!live.has(id)) watch.delete(id);
    }
    window.__ptRestoreRandom();
  }
  return { errors, retargeted, unrouted };
}, { seeds: SEEDS, ticks: TICKS });

const abs = result.errors.map(Math.abs);
const within = (n) => abs.filter((e) => e <= n).length / Math.max(1, abs.length);
const sorted = [...result.errors].sort((a, b) => a - b);
console.log(`arrivals ${abs.length}  exact ${(within(0) * 100).toFixed(0)}%  ±1 ${(within(1) * 100).toFixed(0)}%  ±2 ${(within(2) * 100).toFixed(0)}%`
  + `  median error ${sorted[Math.floor(sorted.length / 2)] ?? 'n/a'}  (retargeted ${result.retargeted}, no route ${result.unrouted})`);
await browser.close();
