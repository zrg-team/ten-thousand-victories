/**
 * How far does THREAT jump the tick a wave lands? (backlog B10)
 *
 * The HUD quotes a projection between waves and the live invader strength once hosts are on the
 * map. For every scheduled wave launch this records the figure the band showed the tick before and
 * the figure it showed the tick after, per ruleset, and prints the relative jump — median and p90.
 *
 * Usage: node test_scripts/diag/diag-threat-landing.mjs [--seeds 12] [--ticks 400]
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

const measure = (ruleset) => page.evaluate(async ({ seeds, ticks, ruleset }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const jumps = [];
  for (const seed of seeds) {
    window.__ptFreshProfile();
    const state = await window.__ptBoot(seed, { ruleset });
    for (let tick = 0; tick < ticks && !state.isDefeated; tick += 1) {
      const beforeWave = state.ascent.wave;
      const beforeHosts = state.invasions?.length ?? 0;
      const quoted = state.ascent.threat;
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
      // A scheduled wave that put hosts on an empty map this tick.
      // A quote below half the smallest wave is a straggler's live strength, not a projection.
      if (state.ascent.wave > beforeWave && beforeHosts === 0 && (state.invasions?.length ?? 0) > 0 && quoted >= 125) {
        jumps.push(Math.abs(state.ascent.threat - quoted) / quoted);
      }
    }
    window.__ptRestoreRandom();
  }
  return jumps;
}, { seeds: SEEDS, ticks: TICKS, ruleset });

const pct = (list, q) => {
  if (!list.length) return NaN;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
for (const ruleset of ['stable', 'beta']) {
  const jumps = await measure(ruleset);
  console.log(`${ruleset.padEnd(6)} launches ${String(jumps.length).padStart(3)}  median jump ${(pct(jumps, 0.5) * 100).toFixed(1)}%  p90 ${(pct(jumps, 0.9) * 100).toFixed(1)}%`);
}
await browser.close();
