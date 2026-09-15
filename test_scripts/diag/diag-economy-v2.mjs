/**
 * The v2 economy, wave by wave: what a realm earns, holds, sells and pays, and the par curve a
 * normal player sets for the smart price scale (`PAR_GROSS` / `PAR_TREASURY` in ascentConfig).
 *
 * Prints, does not assert. Two drivers, fresh profile per run:
 *   engaged  the first option everywhere (the funscore's engaged driver)
 *   trader   engaged, and sells a lot of goods and of grain at the market every season it can —
 *            the play the 2026-09-15 report showed (1,120 goods -> 224 gold a season)
 *
 * Par: per seed, the mean gross and treasury over each wave's seasons on the ENGAGED driver; the
 * median across seeds, only for waves at least half the seeds lived to; then a running maximum so
 * par never falls (the driver loses land late and a falling par would discount the survivors).
 *
 * Usage: PLAYTEST_URL=http://127.0.0.1:5179 node test_scripts/diag/diag-economy-v2.mjs
 *          [--seeds 16] [--ticks 400] [--ruleset v2] [--policies engaged,trader]
 *          [--override '{"v2":{"parPrices":false}}'] [--json out.json]
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { BASE_URL, ENGINE_BOOT, READ_OPTIONS } from '../playtest/playtest-lib.mjs';

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const SEED_COUNT = Number(argOf('--seeds', 16));
const TICKS = Number(argOf('--ticks', 400));
const RULESET = argOf('--ruleset', 'v2');
const POLICIES = String(argOf('--policies', 'engaged,trader')).split(',');
const OVERRIDE = argOf('--override', undefined);
const JSON_OUT = argOf('--json', null);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 11 + i * 11);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
if (OVERRIDE) {
  await page.addInitScript((o) => { globalThis.__ascentRulesetOverride = JSON.parse(o); }, OVERRIDE);
}
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 60000 },
);
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const runs = await page.evaluate(async ({ seeds, ticks, ruleset, policies }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const { heroPayroll } = await import('/src/systems/ResourceSystem.ts');
  const { saleQuote, sellStores } = await import('/src/systems/ascent/GranarySystem.ts');
  const { realmPriceScale, gainScale } = await import('/src/systems/ascent/priceScale.ts');
  let watersideHexes = null;
  try { ({ watersideHexes } = await import('/src/systems/ascent/WaterTrade.ts')); } catch { /* before the water round */ }
  const PLAYER = 'dai-viet';

  const play = async (seed, policy) => {
    window.__ptFreshProfile();
    const state = await window.__ptBoot(seed, { ruleset });
    const rows = [];
    let saleGold = 0;
    let over = false;
    for (let tick = 0; tick < ticks; tick += 1) {
      if (state.isDefeated || over) break;
      advanceAscentTick(state);
      drainAscentPrompts(state);
      let guard = 0;
      while (state.pendingAscentPrompt && guard < 40) {
        guard += 1;
        const options = window.__ptOptions(state);
        if (!options || !options.length) break;
        if (state.pendingAscentPrompt.kind === 'run-over') { over = true; break; }
        if (!resolveAscentPrompt(state, options[0])) break;
        drainAscentPrompts(state);
      }
      state.isPaused = false;
      if (policy === 'trader') {
        for (const key of ['supplies', 'food']) {
          const quote = saleQuote(state, key);
          if (quote.blocked || quote.thin || state.resources[key] < 200) continue;
          const before = state.resources.gold;
          if (sellStores(state, key)) saleGold += state.resources.gold - before;
        }
      }
      const ledger = state.ascentLedger;
      if (!ledger) continue;
      const mine = state.lands.filter((l) => l.ownerId === PLAYER);
      rows.push({
        t: tick + 1, wave: state.ascent.wave, lands: mine.length,
        wet: watersideHexes ? mine.filter((l) => watersideHexes(state, l) > 0).length : 0,
        gold: state.resources.gold, gross: ledger.gold.gross, net: state.resourceRates.gold,
        sup: state.resources.supplies, supGross: ledger.supplies.gross, supNet: state.resourceRates.supplies,
        food: state.resources.food, foodNet: state.resourceRates.food,
        pay: heroPayroll(state), parts: ledger.goldParts ?? null,
        ps: realmPriceScale(state), gs: gainScale(state, 'gold'), saleGold,
      });
    }
    window.__ptRestoreRandom?.();
    return { seed, policy, died: !!state.isDefeated, waves: state.ascent.wavesSurvived, rows };
  };

  const out = [];
  for (const policy of policies) for (const seed of seeds) out.push(await play(seed, policy));
  return out;
}, { seeds: SEEDS, ticks: TICKS, ruleset: RULESET, policies: POLICIES });

await browser.close();

const median = (values) => {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const mean = (values) => values.reduce((s, x) => s + x, 0) / Math.max(1, values.length);
const pad = (v, n) => String(v).padStart(n);
const r0 = (x) => (Number.isFinite(x) ? Math.round(x) : '-');
const r2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');

console.log(`\n  ECONOMY v2 — ruleset ${RULESET}, ${SEED_COUNT} seeds x ${TICKS} ticks${OVERRIDE ? `, override ${OVERRIDE}` : ''} (${BASE_URL})`);
const summary = {};
for (const policy of POLICIES) {
  const mineRuns = runs.filter((r) => r.policy === policy);
  const maxWave = Math.max(...mineRuns.flatMap((r) => r.rows.map((row) => row.wave)));
  // Per seed, per wave: the mean of each figure over that wave's seasons.
  const perWave = [];
  for (let wave = 0; wave <= maxWave; wave += 1) {
    const seedMeans = mineRuns
      .map((run) => run.rows.filter((row) => row.wave === wave))
      .filter((rows) => rows.length > 0)
      .map((rows) => ({
        lands: mean(rows.map((x) => x.lands)), wet: mean(rows.map((x) => x.wet)),
        gold: mean(rows.map((x) => x.gold)), gross: mean(rows.map((x) => x.gross)), net: mean(rows.map((x) => x.net)),
        sup: mean(rows.map((x) => x.sup)), supGross: mean(rows.map((x) => x.supGross)), supNet: mean(rows.map((x) => x.supNet)),
        food: mean(rows.map((x) => x.food)), pay: mean(rows.map((x) => x.pay)),
        hosts: mean(rows.map((x) => x.parts?.hosts ?? 0)), wages: mean(rows.map((x) => x.parts?.wages ?? 0)),
        buildings: mean(rows.map((x) => x.parts?.buildings ?? 0)),
        ps: mean(rows.map((x) => x.ps)), gs: mean(rows.map((x) => x.gs)),
        sale: rows[rows.length - 1].saleGold,
      }));
    if (seedMeans.length < Math.ceil(mineRuns.length / 2)) break;
    const pick = (k) => median(seedMeans.map((s) => s[k]));
    perWave.push({
      wave, alive: seedMeans.length,
      lands: pick('lands'), wet: pick('wet'), gold: pick('gold'), gross: pick('gross'), net: pick('net'),
      sup: pick('sup'), supGross: pick('supGross'), supNet: pick('supNet'), food: pick('food'), pay: pick('pay'),
      hosts: pick('hosts'), wages: pick('wages'), buildings: pick('buildings'), ps: pick('ps'), gs: pick('gs'), sale: pick('sale'),
    });
  }
  const waves = mineRuns.map((r) => r.waves);
  console.log(`\n  ${policy}: waves survived median ${median(waves)} (mean ${r2(mean(waves))}), died ${mineRuns.filter((r) => r.died).length}/${mineRuns.length}`);
  console.log('  wave alive lands wet |  gold gross   net | goods gross  net | food | pay hosts wages bldg | price gain | saleGold');
  for (const w of perWave) {
    console.log(`  ${pad(w.wave, 4)} ${pad(w.alive, 5)} ${pad(r2(w.lands), 5)} ${pad(r2(w.wet), 3)} | ${pad(r0(w.gold), 5)} ${pad(r0(w.gross), 5)} ${pad(r0(w.net), 5)} | ${pad(r0(w.sup), 5)} ${pad(r0(w.supGross), 5)} ${pad(r0(w.supNet), 4)} | ${pad(r0(w.food), 4)} | ${pad(r0(w.pay), 3)} ${pad(r0(w.hosts), 5)} ${pad(r0(w.wages), 5)} ${pad(r0(w.buildings), 4)} | ${pad(r2(w.ps), 5)} ${pad(r2(w.gs), 4)} | ${pad(r0(w.sale), 6)}`);
  }
  summary[policy] = { waves, perWave };
  if (policy === 'engaged') {
    let g = 120; let tr = 300;
    const par = perWave.map((w) => {
      g = Math.max(g, w.gross); tr = Math.max(tr, w.gold);
      return { wave: w.wave, gross: Math.round(g / 10) * 10, treasury: Math.round(tr / 50) * 50 };
    });
    summary.par = par;
    console.log(`\n  PAR (engaged median, running max): waves ${par.map((p) => p.wave).join('/')}`);
    console.log(`    gross    [${par.map((p) => p.gross).join(', ')}]`);
    console.log(`    treasury [${par.map((p) => p.treasury).join(', ')}]`);
  }
}
if (errors.length) console.log(`\n  page errors: ${errors.length}\n  ${errors.slice(0, 5).join('\n  ')}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ seeds: SEEDS, ticks: TICKS, ruleset: RULESET, override: OVERRIDE ?? null, summary }, null, 1));
