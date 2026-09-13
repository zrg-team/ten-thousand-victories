/**
 * Beta response card: does "their first column reaches {land} in about N seasons" come true?
 *
 * In real beta reigns (first-option driver), every response card's estimate is recorded; the wave
 * then launches on the answer, and the first tick any host of that wave stands at the named
 * province's walls (on a neighbouring district, or on it) is compared with the estimate.
 *
 * Usage: node test_scripts/diag/diag-response-arrival.mjs [--seeds 12] [--ticks 400]
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
  const errors = [];
  let unarrived = 0;
  for (const seed of seeds) {
    window.__ptFreshProfile();
    const state = await window.__ptBoot(seed, { ruleset: 'beta' });
    let pending;
    for (let tick = 0; tick < ticks && !state.isDefeated; tick += 1) {
      advanceAscentTick(state);
      drainAscentPrompts(state);
      let guard = 0;
      while (state.pendingAscentPrompt && guard++ < 40) {
        const prompt = state.pendingAscentPrompt;
        if (prompt.kind === 'run-over') break;
        if (prompt.kind === 'empire-response' && prompt.arrivalLandName) {
          if (pending) unarrived += 1;
          const land = state.lands.find((l) => l.name === prompt.arrivalLandName);
          pending = land ? { landId: land.id, predicted: tick + prompt.ticksToArrival, hostsBefore: new Set((state.invasions ?? []).map((r) => r.armyId)) } : undefined;
        }
        const options = window.__ptOptions(state);
        if (!options?.length || !resolveAscentPrompt(state, options[0])) break;
        drainAscentPrompts(state);
      }
      state.isPaused = false;
      if (pending) {
        const land = state.lands.find((l) => l.id === pending.landId);
        const arrived = (state.invasions ?? []).some((record) => {
          if (pending.hostsBefore.has(record.armyId)) return false;
          const army = state.armies.find((a) => a.id === record.armyId);
          return army && (army.landId === land.id || land.neighbors.includes(army.landId));
        });
        if (arrived) { errors.push(tick - pending.predicted); pending = undefined; }
        else if (tick > pending.predicted + 20) { unarrived += 1; pending = undefined; }
      }
    }
    window.__ptRestoreRandom();
  }
  return { errors, unarrived };
}, { seeds: SEEDS, ticks: TICKS });

const abs = result.errors.map(Math.abs);
const within = (n) => abs.filter((e) => e <= n).length / Math.max(1, abs.length);
const sorted = [...result.errors].sort((a, b) => a - b);
console.log(`response cards ${abs.length + result.unarrived}  arrived ${abs.length}  exact ${(within(0) * 100).toFixed(0)}%  ±1 ${(within(1) * 100).toFixed(0)}%  ±2 ${(within(2) * 100).toFixed(0)}%`
  + `  median error ${sorted[Math.floor(sorted.length / 2)] ?? 'n/a'}  (never reached that province: ${result.unarrived})`);
await browser.close();
