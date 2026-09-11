/**
 * What claiming land actually feels like across a run: how often coin is refused, how often a
 * province shuts its door, how long expansion stalls, and what a claim costs against income.
 * Prints, does not assert.
 */
import { chromium } from 'playwright';
import { BASE_URL, ENGINE_BOOT, READ_OPTIONS } from '../playtest/playtest-lib.mjs';
const SEEDS = Number(process.argv.includes('--seeds') ? process.argv[process.argv.indexOf('--seeds')+1] : 8);
const TICKS = 600;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const out = await page.evaluate(async ({ seeds, ticks }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const { getClaimFailures, isClaimBarred, getGoldBribeCost, getClaimSlots, getPlayerClaimCount } =
    await import('/src/systems/AcquisitionSystem.ts');
  const { PLAYER_KINGDOM_ID } = await import('/src/game/constants.ts');
  const rows = [];
  for (let s = 0; s < seeds; s += 1) {
    const seed = 11 + s * 11;
    const st = await window.__ptBoot(seed);
    const seen = { failures: 0, barred: new Set(), landsTaken: 0, quotes: [], stalls: 0 };
    let lastLandCount = st.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).length;
    let sinceGain = 0, longestStall = 0, slotFullTicks = 0;
    for (let t = 0; t < ticks; t += 1) {
      if (st.isDefeated) break;
      // engaged driver: always take the first option
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) {
        // `__ptOptions(state)` returns plain option ids; taking the first is the engaged driver.
        const opts = window.__ptOptions(st) || [];
        resolveAscentPrompt(st, opts[0] ?? 'ok');
        drainAscentPrompts(st);
      }
      advanceAscentTick(st);
      drainAscentPrompts(st);
      // sample the claim ledger
      const att = st.ascent?.claimAttempts ?? {};
      let f = 0; for (const k of Object.keys(att)) { f += att[k].failures ?? 0; if (isClaimBarred(st, k)) seen.barred.add(k); }
      seen.failures = f;
      if (getPlayerClaimCount(st) >= getClaimSlots(st)) slotFullTicks += 1;
      const now = st.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).length;
      if (now > lastLandCount) { seen.landsTaken += now - lastLandCount; sinceGain = 0; }
      else { sinceGain += 1; longestStall = Math.max(longestStall, sinceGain); }
      lastLandCount = now;
      if (t === 40 || t === 120 || t === 240 || t === 400) {
        const v = st.lands.find((l) => l.ownerId === 'neutral' && l.hasVillage);
        if (v) seen.quotes.push({ t, cost: getGoldBribeCost(st, v), gross: Math.round(st.ascentLedger?.gold.gross ?? 0), gold: Math.round(st.resources.gold) });
      }
    }
    rows.push({ seed, ticks: st.turn, waves: st.ascent?.wave ?? 0, lands: lastLandCount,
      taken: seen.landsTaken, failures: seen.failures, barred: seen.barred.size,
      longestStall, slotFullPct: Math.round(slotFullTicks / Math.max(1, st.turn) * 100), quotes: seen.quotes });
  }
  return rows;
}, { seeds: SEEDS, ticks: TICKS });

await browser.close();
const mean = (f) => (out.reduce((a, r) => a + f(r), 0) / out.length).toFixed(1);
console.log('seed ticks waves lands taken | refusals barred | longestStall slotFull%');
for (const r of out) console.log(String(r.seed).padStart(4), String(r.ticks).padStart(5), String(r.waves).padStart(5), String(r.lands).padStart(5), String(r.taken).padStart(5), '|',
  String(r.failures).padStart(8), String(r.barred).padStart(6), '|', String(r.longestStall).padStart(12), String(r.slotFullPct).padStart(9));
console.log('\nMEAN  ticks', mean((r) => r.ticks), 'waves', mean((r) => r.waves), 'landsEnd', mean((r) => r.lands),
  'taken', mean((r) => r.taken), '| refusals', mean((r) => r.failures), 'provincesBarred', mean((r) => r.barred),
  '| longestStall', mean((r) => r.longestStall), 'seasons, slotFull', mean((r) => r.slotFullPct) + '%');
console.log('\nclaim price vs income over a run (first seed):');
for (const q of out[0].quotes) console.log(`  t${String(q.t).padStart(3)}  cost ${String(q.cost).padStart(5)}  gross/season ${String(q.gross).padStart(4)}  held ${String(q.gold).padStart(6)}  = ${(q.cost / Math.max(1, q.gross)).toFixed(2)} seasons of income`);
if (errs.length) console.log('\nERRORS', errs.slice(0, 3));
