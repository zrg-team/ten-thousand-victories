/**
 * Deterministic performance benchmark for the RTS map scene.
 *
 * Drives a seeded game (window.__startBenchGame) so before/after runs are
 * comparable, then measures the things that actually hurt on mobile:
 *   - tickCostMs : wall-clock to advance N realtime ticks (forces N full
 *                  refresh() passes — the army/badge/node rebuild hot path)
 *   - objectCount: live Phaser GameObjects across MapScene + UIScene
 *   - heapMB     : JS heap after forced GC (memory pressure)
 *   - fps        : Phaser actualFps under a short real-loop run
 *
 * Usage:
 *   node test_scripts/perf/perf-bench.mjs [--label baseline] [--cpu 4] [--url http://127.0.0.1:5179]
 *                                    [--mode rival|campaign|empire|ascent]
 *
 * `--mode` matters: the four modes do not share a world scene, and a bench that only ever measured
 * `rival` cannot answer "is Dragon Ascent slow", which is the question people actually ask.
 * Writes results to test_scripts/perf-results/<label>.json and prints a summary.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Up one level: the results live beside the script families, not inside `perf/`, because they
// are committed output that `--label` diffs against and moving them would orphan `baseline.json`.
const OUT_DIR = join(__dirname, '..', 'perf-results');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const LABEL = arg('label', 'baseline');
const URL = arg('url', 'http://127.0.0.1:5179');
const CPU_THROTTLE = Number(arg('cpu', '4')); // mid-tier Android ~= 4x slowdown
const SEED = Number(arg('seed', '1337'));
const TICKS = Number(arg('ticks', '80'));
const REPEATS = Number(arg('repeats', '3'));
const MODE = arg('mode', 'rival');
const WORLD_SCENE = MODE === 'ascent' ? 'ConquestScene' : 'MapScene';

const browser = await chromium.launch({
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cdp = await page.context().newCDPSession(page);

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

// Wait for Phaser + the bench hook + assets (MenuScene becomes active post-preload).
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function'
    && window.__phaserGame
    && window.__phaserGame.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);

// Jump into a deterministic game.
await page.evaluate(([seed, mode]) => window.__startBenchGame(seed, mode, 'v1'), [SEED, MODE]);
await page.waitForFunction(
  (scene) => window.__phaserGame.scene.isActive(scene) && !!window.__mandateState,
  WORLD_SCENE,
  { timeout: 30000 },
);
await page.waitForTimeout(800); // let initial render settle

// Apply CPU throttle to emulate mid-tier mobile.
if (CPU_THROTTLE > 1) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
}

const measure = await page.evaluate(async ({ ticks, repeats }) => {
  const game = window.__phaserGame;

  const countObjects = () => {
    let n = 0;
    const walk = (obj) => {
      n += 1;
      if (obj && obj.list && Array.isArray(obj.list)) obj.list.forEach(walk);
    };
    for (const scene of game.scene.getScenes(true)) {
      scene.children.list.forEach(walk);
    }
    return n;
  };

  const heapMB = () => {
    if (window.gc) { try { window.gc(); } catch (_) {} }
    const m = performance.memory ? performance.memory.usedJSHeapSize : 0;
    return +(m / (1024 * 1024)).toFixed(2);
  };

  // --- real-loop FPS sample FIRST (clean idle loop, drop warmup frames) ---
  const rawDeltas = await new Promise((resolve) => {
    const samples = [];
    let last = performance.now();
    const stopAt = last + 2500;
    const tick = (now) => {
      samples.push(now - last);
      last = now;
      if (now < stopAt) requestAnimationFrame(tick);
      else resolve(samples);
    };
    requestAnimationFrame(tick);
  });
  const deltas = rawDeltas.slice(5).sort((a, b) => a - b); // drop warmup outliers
  const pct = (p) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))];

  // --- tick cost: advance realtime ticks (REALTIME_TICK_MS = 5500). One big-delta
  // game.step crosses a tick boundary in a single frame, forcing exactly one full
  // refresh() of armies/badges/nodes (the hot path) without 360 idle render frames. ---
  const STEP_MS = 6000; // > REALTIME_TICK_MS -> one realtime month + one refresh per step
  const tickCosts = [];
  for (let r = 0; r < repeats; r += 1) {
    const start = performance.now();
    for (let i = 0; i < ticks; i += 1) {
      game.step(performance.now(), STEP_MS);
    }
    tickCosts.push(performance.now() - start);
  }
  tickCosts.sort((a, b) => a - b);
  const medianTick = tickCosts[Math.floor(tickCosts.length / 2)];

  const objectCount = countObjects();
  const heap = heapMB();

  return {
    medianTickMs: +medianTick.toFixed(1),
    perTickMs: +(medianTick / ticks).toFixed(2),
    objectCount,
    heapMB: heap,
    actualFps: +game.loop.actualFps.toFixed(1),
    frameP50: +pct(0.5).toFixed(1),
    frameP95: +pct(0.95).toFixed(1),
    frameP99: +pct(0.99).toFixed(1),
  };
}, { ticks: TICKS, repeats: REPEATS });

const result = {
  label: LABEL,
  timestamp: new Date().toISOString(),
  config: { seed: SEED, ticks: TICKS, repeats: REPEATS, cpuThrottle: CPU_THROTTLE },
  errors,
  ...measure,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, `${LABEL}.json`), JSON.stringify(result, null, 2));

console.log(`\n=== perf-bench [${LABEL}] (cpu ${CPU_THROTTLE}x) ===`);
console.log(`per-tick refresh : ${result.perTickMs} ms   (median over ${TICKS} ticks x${REPEATS})`);
console.log(`live objects     : ${result.objectCount}`);
console.log(`JS heap          : ${result.heapMB} MB`);
console.log(`actual FPS       : ${result.actualFps}`);
console.log(`frame p50/p95/p99: ${result.frameP50} / ${result.frameP95} / ${result.frameP99} ms`);
if (errors.length) console.log(`!! page errors   : ${errors.length}\n${errors.slice(0, 5).join('\n')}`);

// Diff against baseline if present and we aren't the baseline.
const baselinePath = join(OUT_DIR, 'baseline.json');
if (LABEL !== 'baseline' && existsSync(baselinePath)) {
  const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const d = (now, then) => `${then} -> ${now}  (${(((now - then) / then) * 100).toFixed(1)}%)`;
  console.log(`\n--- vs baseline ---`);
  console.log(`per-tick refresh : ${d(result.perTickMs, base.perTickMs)}`);
  console.log(`live objects     : ${d(result.objectCount, base.objectCount)}`);
  console.log(`JS heap          : ${d(result.heapMB, base.heapMB)}`);
  console.log(`frame p95        : ${d(result.frameP95, base.frameP95)}`);
}

await browser.close();
if (errors.length) process.exit(1);
