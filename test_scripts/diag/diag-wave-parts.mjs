/**
 * Which term makes an opening wave lethal? Logs every component of `waveTargetPower` at each
 * wave start for a few seeds under a steward-ish driver (accept musters, hold claims when broke).
 *
 * Usage: PLAYTEST_URL=http://127.0.0.1:5179 node test_scripts/diag/diag-wave-parts.mjs [--seeds 4] [--ticks 120]
 */
import { chromium } from 'playwright';
import { BASE_URL, ENGINE_BOOT, READ_OPTIONS } from '../playtest/playtest-lib.mjs';

const argOf = (flag, fallback) => { const i = process.argv.indexOf(flag); return i === -1 ? fallback : process.argv[i + 1]; };
const SEED_COUNT = Number(argOf('--seeds', 4));
const TICKS = Number(argOf('--ticks', 120));
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 11 + i * 11);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const out = await page.evaluate(async ({ seeds, ticks }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const WD = await import('/src/systems/ascent/WaveDirector.ts');
  const PS = await import('/src/systems/ascent/PowerSystem.ts');
  const AM = await import('/src/systems/ascent/AmbitionSystem.ts');
  const CFG = await import('/src/game/ascentConfig.ts');
  const { armyPower } = await import('/src/systems/WarSystem.ts');
  const PLAYER = 'dai-viet';
  const size = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;

  const parts = (state, wave, boss) => {
    const heat = AM.ambitionHeat(state);
    const baseline = CFG.WAVE_BASELINE_POWER * Math.pow(CFG.WAVE_BASELINE_GROWTH, Math.max(0, wave - 1));
    const target = baseline * heat * (boss ? CFG.BOSS_PRESSURE_MULT : 1);
    const facing = PS.waveFacingDefencePower(state);
    const match = CFG.waveMatchFactor(facing, target);
    let rival = 0; let mine = 0;
    for (const l of state.lands) { if (l.ownerId === PLAYER) mine += 1; else if (l.ownerId !== 'neutral') rival += 1; }
    const rivalShare = (rival + mine) > 0 ? rival / (rival + mine) : 0;
    const curve = target * match * (1 + rivalShare * CFG.RIVAL_LAND_PRESSURE);
    const rampShare = Math.min(CFG.WAVE_SHADOW_MAX, CFG.WAVE_SHADOW_BASE + CFG.WAVE_SHADOW_RAMP * Math.max(0, wave - 1));
    const heatedShare = Math.min(CFG.WAVE_SHADOW_CEIL, rampShare * (1 + (heat - 1) * CFG.WAVE_SHADOW_HEAT_SHARE));
    const lagged = WD.laggedDefencePower(state);
    const shadow = lagged * heatedShare * (boss ? CFG.BOSS_PRESSURE_MULT : 1);
    const field = PS.computeFieldDefencePower(state);
    const ceiling = Math.max(target, field * CFG.WAVE_FIELD_CEILING);
    const sized = Math.min(Math.max(curve, shadow), Math.max(curve, ceiling));
    const marchable = state.armies.reduce((s, a) => (a.kingdomId === PLAYER && !a.isLevy && !a.patron ? s + armyPower(state, a) : s), 0);
    const share = CFG.EARLY_WAVE_FIELD_SHARE[Math.min(CFG.EARLY_WAVE_FIELD_SHARE.length - 1, wave - 1)];
    const early = wave <= CFG.EARLY_WAVE_FIELD_SHARE.length && marchable > 0 ? Math.max(CFG.WAVE_BASELINE_POWER * 0.5, Math.min(sized, marchable * share)) : null;
    const final = WD.waveTargetPower(state, wave, boss, heat);
    return {
      wave, boss, turn: state.turn, heat: +heat.toFixed(2), baseline: Math.round(baseline), target: Math.round(target), facing: Math.round(facing), match: +match.toFixed(2),
      rivalShare: +rivalShare.toFixed(2), rivalMult: +(1 + rivalShare * CFG.RIVAL_LAND_PRESSURE).toFixed(2), curve: Math.round(curve), lagged: Math.round(lagged), shadowShare: +heatedShare.toFixed(2), shadow: Math.round(shadow),
      field: Math.round(field), ceiling: Math.round(ceiling), sized: Math.round(sized), marchable: Math.round(marchable), earlyCap: early == null ? null : Math.round(early), final: Math.round(final),
      lands: mine, rivalLands: rival, men: state.armies.filter((a) => a.kingdomId === PLAYER && !a.isLevy && !a.patron).reduce((s, a) => s + size(a), 0),
      contested: Math.round(PS.contestedDefencePower(state)),
    };
  };

  const runs = [];
  for (const seed of seeds) {
    const state = await window.__ptBoot(seed, { ruleset: 'v1' });
    const log = [];
    let lastWave = 0;
    const seen = new Set();
    const spawns = [];
    for (let tick = 0; tick < ticks && !state.isDefeated; tick += 1) {
      // Sample the parts the tick BEFORE the wave lands (ticksToWave === 1), which is what startWave sees.
      if (state.ascent.ticksToWave <= 1 && (state.invasions?.length ?? 0) >= 0) {
        const next = state.ascent.wave + 1;
        log.push(parts(state, next, WD.isBossWave(next)));
      }
      advanceAscentTick(state);
      drainAscentPrompts(state);
      for (const rec of state.invasions ?? []) {
        if (seen.has(rec.armyId)) continue;
        seen.add(rec.armyId);
        const army = state.armies.find((a) => a.id === rec.armyId);
        const log = state.eventLog ?? state.events ?? [];
        const recent = log.slice(-4).map((e) => (typeof e === 'string' ? e : (e.text ?? e.message ?? JSON.stringify(e)).slice(0, 70)));
        spawns.push({ tick, turn: state.turn, wave: state.ascent.wave, intent: rec.intent, plan: rec.plan, kingdom: rec.kingdomId, great: !!rec.great, men: army ? size(army) : 0, name: army?.name, msg: state.message?.slice(0, 80), recent });
      }
      lastWave = state.ascent.wave;
      let guard = 0;
      while (state.pendingAscentPrompt && guard++ < 40) {
        const p = state.pendingAscentPrompt;
        const options = window.__ptOptions(state);
        if (!options?.length || p.kind === 'run-over') break;
        let pick = options[0];
        if (p.kind === 'muster-proposal') pick = 'accept';
        if (p.kind === 'empire-response') pick = 'endure';
        if (p.kind === 'rival-demand') pick = options.includes('refuse') ? 'refuse' : options[options.length - 1];
        if (p.kind === 'envoy') pick = options.includes('trade') ? 'trade' : 'ignore';
        if (p.kind === 'conquer-target' && state.resources.gold < 60) pick = 'hold';
        if (p.kind === 'doctrine') pick = options.includes('enrich') ? 'enrich' : options[0];
        if (!resolveAscentPrompt(state, pick)) break;
        drainAscentPrompts(state);
      }
      state.isPaused = false;
    }
    window.__ptRestoreRandom();
    runs.push({ seed, log, spawns, died: !!state.isDefeated, waves: state.ascent.wavesSurvived });
  }
  return runs;
}, { seeds: SEEDS, ticks: TICKS });
await browser.close();

const pad = (v, n) => String(v ?? '-').padStart(n);
for (const run of out) {
  console.log(`\nseed ${run.seed}: ${run.died ? 'DIED' : 'alive'} after ${run.waves} waves`);
  console.log(' w  boss turn heat  base  targ facing match rivS rivM  curve lagged shS shadow field  ceil sized march early FINAL | lands rivalL men contested');
  const seenWave = new Set();
  for (const p of run.log) {
    if (seenWave.has(p.wave)) continue;
    seenWave.add(p.wave);
    console.log(`${pad(p.wave, 2)} ${pad(p.boss ? 'B' : '', 4)} ${pad(p.turn, 4)} ${pad(p.heat, 4)} ${pad(p.baseline, 5)} ${pad(p.target, 5)} ${pad(p.facing, 6)} ${pad(p.match, 5)} ${pad(p.rivalShare, 4)} ${pad(p.rivalMult, 4)} ${pad(p.curve, 6)} ${pad(p.lagged, 6)} ${pad(p.shadowShare, 3)} ${pad(p.shadow, 6)} ${pad(p.field, 5)} ${pad(p.ceiling, 5)} ${pad(p.sized, 5)} ${pad(p.marchable, 5)} ${pad(p.earlyCap, 5)} ${pad(p.final, 5)} | ${pad(p.lands, 5)} ${pad(p.rivalLands, 6)} ${pad(p.men, 3)} ${pad(p.contested, 9)}`);
  }
  console.log('  spawns: ' + run.spawns.map((s) => `t${s.turn}:w${s.wave}:${s.intent[0]}/${s.plan?.[0] ?? '?'}:${s.men}`).join(' '));
  for (const s of run.spawns.filter((x) => x.tick < 70)) console.log(`    t${s.turn} w${s.wave} ${s.men}m ${s.kingdom} ${s.name} great=${s.great} msg="${s.msg}" recent=${JSON.stringify(s.recent)}`);
}
