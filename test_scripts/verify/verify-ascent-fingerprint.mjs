/**
 * Did this change move Dragon Ascent at all?
 *
 * `verify-modes-regression` fingerprints empire, campaign and rival — never Ascent — so nothing
 * could prove that a refactor of shared Ascent code left the game byte-identical. This does: a
 * seeded headless run per seed, every tick folded into a hash, compared against a committed
 * baseline. The rule versions lean on it — v1 must reproduce its baseline
 * exactly after every refactor step, and a deliberate change re-baselines with its diff explained.
 *
 * Every run starts from a **fresh profile**: the meta stores (dynasty, cabinet, legacy, codex,
 * chronicle echoes) are wiped before each boot. Without that the founder card reads the Codex the
 * previous run wrote, the coronation fires only on the first run in the page, and "the same seed"
 * is not the same world — the confound that made two identical A/B arms read 1.6× apart.
 *
 * The driver answers the first option on offer (muster: accept), stops at the run-over card, and
 * never calls Math.random itself. Hashes use raw floats: a refactor that turns `x` into `1 * x`
 * is a real difference and must show up.
 *
 * Usage:
 *   node test_scripts/verify/verify-ascent-fingerprint.mjs [--seeds 8] [--ticks 600]
 *        [--ruleset v1|v2|all] [--against v1] [--write]      (old names: stable = v1, beta = v2, both = all)
 *   --write      record the run(s) as the baseline for their version
 *   --against X  compare every run against X's baseline (e.g. a new version vs its parent while the
 *                beta profile still equals stable)
 * Env: DEV_URL / PLAYTEST_URL for a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_OPTIONS, ENGINE_BOOT } from '../playtest/playtest-lib.mjs';

const BASE_URL = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const SEED_COUNT = Number(argOf('--seeds', 8));
const TICKS = Number(argOf('--ticks', 600));
// Every version this build runs is gated by default. `v1` must stay byte-identical; a later version
// moves only when its own rules change, and is re-baselined with the reason written down.
const ALL_RULESETS = ['v1', 'v2'];
const RULESET_ALIAS = { stable: 'v1', beta: 'v2' };
const version = (id) => RULESET_ALIAS[id] ?? id;
const RULESET_ARG = argOf('--ruleset', 'all');
const RULESETS = RULESET_ARG === 'all' || RULESET_ARG === 'both' ? ALL_RULESETS : [version(RULESET_ARG)];
const AGAINST = argOf('--against', undefined) ? version(argOf('--against', undefined)) : undefined;
const WRITE = process.argv.includes('--write');
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 11 + i * 11);
const CHECKPOINT_EVERY = 25;

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(here, 'baselines', 'ascent-fingerprint.json');

const git = (cmd) => { try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch { return ''; } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const runSeed = (seed, ruleset) => page.evaluate(async ({ seed, ticks, ruleset, every }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');

  // Fresh profile: every meta store gone, the language kept (see `__ptFreshProfile`).
  window.__ptFreshProfile();
  const state = await window.__ptBoot(seed, { ruleset });

  // FNV-1a over the tick record's JSON: cheap, stable, and sensitive to the last float bit.
  const fnv = (text) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };

  const PLAYER = 'dai-viet';
  const record = () => {
    const a = state.ascent;
    let owned = 0;
    for (const land of state.lands) if (land.ownerId === PLAYER) owned += 1;
    let hosts = 0;
    let men = 0;
    for (const army of state.armies) {
      if (army.kingdomId !== PLAYER) continue;
      hosts += 1;
      const u = army.units;
      men += (u.spearmen ?? 0) + (u.archers ?? 0) + (u.heavyInfantry ?? 0);
    }
    return {
      turn: state.turn,
      wave: a.wave,
      held: a.wavesSurvived,
      threat: a.threat,
      power: a.power,
      defence: a.defensePower,
      ambition: a.ambition,
      level: a.level,
      xp: a.xp,
      owned,
      hosts,
      men,
      invasions: (state.invasions ?? []).length,
      gold: state.resources.gold,
      food: state.resources.food,
      supplies: state.resources.supplies,
      humans: state.resources.humans,
      prompt: state.pendingAscentPrompt?.kind ?? null,
      queue: a.promptQueue.length,
      battle: a.activeBattle?.key ?? null,
      defeated: !!state.isDefeated,
    };
  };

  const choose = (options) => options[0];
  const hashes = [];
  const checkpoints = [];
  const kinds = {};
  let over = false;
  let tick = 0;
  for (; tick < ticks && !state.isDefeated && !over; tick += 1) {
    advanceAscentTick(state);
    drainAscentPrompts(state);
    let guard = 0;
    while (state.pendingAscentPrompt && guard++ < 40) {
      const kind = state.pendingAscentPrompt.kind;
      if (kind === 'run-over') { over = true; break; }
      const options = window.__ptOptions(state);
      if (!options || !options.length) break;
      kinds[kind] = (kinds[kind] ?? 0) + 1;
      if (!resolveAscentPrompt(state, choose(options))) break;
      drainAscentPrompts(state);
    }
    state.isPaused = false;
    const rec = record();
    hashes.push(fnv(JSON.stringify(rec)));
    if (tick % every === 0) checkpoints.push({ tick, rec });
  }
  window.__ptRestoreRandom();
  return {
    seed,
    ticksRun: tick,
    final: record(),
    endCause: state.ascent.endCause ?? null,
    kinds,
    hashes: hashes.join(''),
    checkpoints,
  };
}, { seed, ticks: TICKS, ruleset, every: CHECKPOINT_EVERY });

console.log(`\n  ASCENT FINGERPRINT — ${SEED_COUNT} seeds × ${TICKS} ticks, fresh profile (${BASE_URL})\n`);
const runs = {};
for (const ruleset of RULESETS) {
  runs[ruleset] = [];
  for (const seed of SEEDS) {
    const run = await runSeed(seed, ruleset);
    runs[ruleset].push(run);
    console.log(`  ${ruleset.padEnd(7)} seed ${String(seed).padStart(3)}  ticks ${String(run.ticksRun).padStart(3)}`
      + `  waves ${String(run.final.held).padStart(2)}  lands ${run.final.owned}  ${run.final.defeated ? `fell (${run.endCause})` : 'alive'}`);
  }
}

// Determinism: the first seed again must reproduce itself, or nothing below means anything.
const replay = await runSeed(SEEDS[0], RULESETS[0]);
const deterministic = replay.hashes === runs[RULESETS[0]][0].hashes;

const checks = [];
const check = (label, pass, detail) => {
  checks.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};
console.log('');
check('the same seed replays to the same hashes (fresh profile works)', deterministic,
  deterministic ? '' : `first diverging tick ${firstDiff(replay.hashes, runs[RULESETS[0]][0].hashes)}`);
check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

function firstDiff(a, b) {
  const n = Math.max(a.length, b.length) / 8;
  for (let i = 0; i < n; i += 1) if (a.slice(i * 8, i * 8 + 8) !== b.slice(i * 8, i * 8 + 8)) return i;
  return -1;
}

const baselineRef = argOf('--baseline-ref', undefined);
const baseline = baselineRef ? JSON.parse(execFileSync('git', ['show', `${baselineRef}:test_scripts/verify/baselines/ascent-fingerprint.json`], { encoding: 'utf8' }))
  : existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
// Baselines recorded before versions were numbered are keyed by the old names.
if (baseline?.runs) for (const [old, id] of Object.entries(RULESET_ALIAS)) {
  if (baseline.runs[old] && !baseline.runs[id]) { baseline.runs[id] = baseline.runs[old]; delete baseline.runs[old]; }
}
if (baselineRef && WRITE) throw new Error('--baseline-ref is read-only and cannot be combined with --write');

if (WRITE) {
  const next = baseline && baseline.seeds === SEED_COUNT && baseline.ticks === TICKS
    ? baseline
    : { version: 1, seeds: SEED_COUNT, ticks: TICKS, runs: {} };
  for (const ruleset of RULESETS) {
    next.runs[ruleset] = {
      recordedAt: new Date().toISOString(),
      commit: git('git rev-parse --short HEAD'),
      dirty: git('git status --porcelain -- src').length > 0,
      seeds: runs[ruleset],
    };
  }
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 1)}\n`);
  console.log(`\n  wrote ${RULESETS.join(' + ')} baseline → ${BASELINE_PATH}`);
} else if (!baseline) {
  check('a baseline exists to compare against', false, `run once with --write (${BASELINE_PATH})`);
} else if (baseline.seeds !== SEED_COUNT || baseline.ticks !== TICKS) {
  check('baseline matches this run\'s shape', false,
    `baseline is ${baseline.seeds} seeds × ${baseline.ticks} ticks; run with the same --seeds/--ticks`);
} else {
  for (const ruleset of RULESETS) {
    const target = AGAINST ?? ruleset;
    const recorded = baseline.runs[target];
    if (!recorded) {
      check(`a ${target} baseline exists`, false, 'record it with --write --ruleset ' + target);
      continue;
    }
    for (const run of runs[ruleset]) {
      const base = recorded.seeds.find((s) => s.seed === run.seed);
      const same = base && base.hashes === run.hashes;
      let detail = '';
      if (!same && base) {
        const at = firstDiff(run.hashes, base.hashes);
        const cp = [...base.checkpoints].reverse().find((c) => c.tick <= at);
        const mine = run.checkpoints.find((c) => c.tick === cp?.tick);
        detail = `first diverging tick ${at} (last checkpoint ${cp?.tick}: `
          + `baseline ${JSON.stringify(cp?.rec)} vs now ${JSON.stringify(mine?.rec)})`;
      }
      check(`${ruleset} seed ${run.seed} matches the ${target} baseline (${recorded.commit}${recorded.dirty ? '+dirty' : ''})`,
        !!same, detail);
    }
  }
}

await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: Dragon Ascent is byte-identical to its baseline' : 'FAIL: Dragon Ascent moved');
process.exit(failed === 0 ? 0 : 1);
