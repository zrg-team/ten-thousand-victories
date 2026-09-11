/**
 * The setup phase and the scaled purse (Dragon Ascent).
 *
 * The contract this round shipped, in the order a player meets it:
 *   1. The opening is three single-column waves and nothing else. Measured before: the first
 *      sixty seasons carried five to eleven hostile hosts (a tribute refused at season 16 sent a
 *      punitive host during wave one; raids began at wave one; a collapsed empire's opportunist
 *      landed at wave three), and the realm never held more than three provinces.
 *   2. The seat is asked what it is for, once, before the first wave — the focus is the setup
 *      phase's biggest lever and used to be two taps deep in a lane nobody was shown.
 *   3. A realm that has lost its host is not quoted the whole curve: the opening cap reads the
 *      host the realm could raise (`fieldablePower`), so wave four for a hostless realm is under
 *      what a re-mustered minimum host could meet, not the 935-2,165 men it used to be.
 *   4. Grain rots and goods spoil above twenty seasons of use, and the markets sell what would
 *      rot — so a favoured store settles in the hundreds rather than the tens of thousands.
 *   5. Routine prices wear the realm's scale: a farm, a village and a host cost more to a realm
 *      grossing four hundred a season than to one grossing forty; every classic mode pays 1.
 *
 * Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-setup-phase.mjs
 */
import { chromium } from 'playwright';
import { READ_OPTIONS } from '../playtest/playtest-lib.mjs';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 160)}`); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 40000 });
await page.evaluate(READ_OPTIONS);

// ── 1-4: the opening, played on four seeds ─────────────────────────────────────────────────────
const runs = await page.evaluate(async ({ seeds, ticks }) => {
  const GS = await import('/src/state/GameState.ts');
  const Tick = await import('/src/systems/ascent/AscentTick.ts');
  const Resolver = await import('/src/systems/ascent/AscentResolver.ts');
  const AS = await import('/src/systems/ascent/AscentState.ts');
  const CFG = await import('/src/game/ascentConfig.ts');
  const G = await import('/src/systems/ascent/GranarySystem.ts');
  const PID = 'dai-viet';
  const men = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;

  const out = [];
  for (const seed of seeds) {
    const orig = Math.random;
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      const st = GS.createAscentGameState({ seaSides: 1, difficulty: 'normal' });
      const seen = new Set();
      const spawns = [];
      let setupCards = 0;
      let setupTurn = -1;
      let demandsInGrace = 0;
      let firstWaveTurn = -1;
      let stockPeak = { food: 0, supplies: 0 };
      let salesInRun = 0;
      for (let i = 0; i < ticks && !st.isDefeated; i += 1) {
        Tick.advanceAscentTick(st);
        AS.drainAscentPrompts(st);
        for (const rec of st.invasions ?? []) {
          if (seen.has(rec.armyId)) continue;
          seen.add(rec.armyId);
          const army = st.armies.find((a) => a.id === rec.armyId);
          spawns.push({ turn: st.turn, wave: st.ascent.wave, men: army ? men(army) : 0, kingdom: rec.kingdomId });
          if (firstWaveTurn < 0) firstWaveTurn = st.turn;
        }
        stockPeak.food = Math.max(stockPeak.food, st.resources.food);
        stockPeak.supplies = Math.max(stockPeak.supplies, st.resources.supplies);
        let guard = 0;
        while (st.pendingAscentPrompt && guard++ < 40) {
          const p = st.pendingAscentPrompt;
          if (p.kind === 'run-over') break;
          if (p.kind === 'province-order' && p.reason === 'setup') { setupCards += 1; if (setupTurn < 0) setupTurn = st.turn; }
          if (p.kind === 'rival-demand' && st.ascent.wave <= CFG.EARLY_WAVE_GRACE) demandsInGrace += 1;
          const options = window.__ptOptions(st);
          if (!options?.length) break;
          let id = options[0];
          if (p.kind === 'muster-proposal') id = 'accept';
          if (p.kind === 'province-order') id = p.options.find((o) => o.role === 'focus')?.id ?? options[0];
          if (p.kind === 'rival-demand') id = options.includes('refuse') ? 'refuse' : options[options.length - 1];
          if (!Resolver.resolveAscentPrompt(st, id)) break;
          AS.drainAscentPrompts(st);
        }
        st.isPaused = false;
        if (st.pendingAscentPrompt?.kind === 'run-over') break;
      }
      salesInRun = st.ascent.laneStats.storesSold ?? 0;
      const grace = CFG.EARLY_WAVE_GRACE;
      const inGrace = spawns.filter((x) => x.wave >= 1 && x.wave <= grace);
      const perWave = {};
      for (const x of inGrace) perWave[x.wave] = (perWave[x.wave] ?? 0) + 1;
      out.push({
        seed, grace, firstWaveTurn, spawnsInGrace: inGrace.length, perWave, crownsInGrace: new Set(inGrace.map((x) => x.kingdom)).size,
        biggestInGrace: Math.max(0, ...inGrace.map((x) => x.men)), setupCards, setupTurn, demandsInGrace,
        wave: st.ascent.wave, defeated: !!st.isDefeated, stockPeak, salesInRun,
        useFood: G.storeUse(st, 'food'), wasteFromFood: G.storeWasteFrom(st, 'food'),
        lands: st.lands.filter((l) => l.ownerId === PID).length,
      });
    } finally { Math.random = orig; }
  }
  return out;
}, { seeds: [4242, 12161, 20080, 27999], ticks: 110 });

console.log('=== THE OPENING, PLAYED (4 seeds x 110 ticks) ===');
for (const r of runs) {
  console.log(`  seed ${String(r.seed).padStart(5)}  first host season ${r.firstWaveTurn}  waves 1-${r.grace}: ${r.spawnsInGrace} hosts ${JSON.stringify(r.perWave)} from ${r.crownsInGrace} crown(s), biggest ${r.biggestInGrace} men`
    + `  | setup card x${r.setupCards} at season ${r.setupTurn}  | demands in grace ${r.demandsInGrace}  | reached wave ${r.wave}${r.defeated ? ' DEFEATED' : ''}  lands ${r.lands}`);
}
check('the first wave waits for the setup phase', runs.every((r) => r.firstWaveTurn >= 15 && r.firstWaveTurn <= 22),
  runs.map((r) => r.firstWaveTurn).join(', '));
check('the opening is three single columns', runs.every((r) => r.spawnsInGrace === r.grace && Object.values(r.perWave).every((n) => n === 1)),
  runs.map((r) => `${r.spawnsInGrace}/${r.grace}`).join(', '));
check('and each is a column, not a horde', runs.every((r) => r.biggestInGrace <= 700),
  runs.map((r) => r.biggestInGrace).join(', '));
check('nobody is shaken down before the grace ends', runs.every((r) => r.demandsInGrace === 0),
  runs.map((r) => r.demandsInGrace).join(', '));
check('the seat is asked what it is for, once, in the opening', runs.every((r) => r.setupCards === 1 && r.setupTurn > 0 && r.setupTurn < 17),
  runs.map((r) => `x${r.setupCards}@${r.setupTurn}`).join(', '));
check('nobody is wiped out in the opening', runs.every((r) => !r.defeated || r.wave > 5),
  `${runs.filter((r) => r.defeated).length}/${runs.length} defeated`);

// ── 3: the hostless cap ───────────────────────────────────────────────────────────────────────
const cap = await page.evaluate(async ({ seed }) => {
  const GS = await import('/src/state/GameState.ts');
  const WD = await import('/src/systems/ascent/WaveDirector.ts');
  const CFG = await import('/src/game/ascentConfig.ts');
  const orig = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    const st = GS.createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.ascent.wave = 3;
    const withHost = WD.waveTargetPower(st, 4, true);
    // The realm loses its army outright.
    st.armies = st.armies.filter((a) => a.kingdomId !== 'dai-viet');
    const hostless = WD.waveTargetPower(st, 4, true);
    // The floor is the minimum host, never the host the purse could raise — see `fieldablePower`.
    const potential = CFG.MIN_ARMY_SOLDIERS * CFG.INVADER_POWER_PER_SOLDIER;
    const share = CFG.EARLY_WAVE_FIELD_SHARE[3];
    return { withHost: Math.round(withHost), hostless: Math.round(hostless), bound: Math.round(potential * share), floor: CFG.WAVE_BASELINE_POWER * 0.5 };
  } finally { Math.random = orig; }
}, { seed: 4242 });
console.log(`\n=== THE HOSTLESS CAP ===\n  wave 4 with the royal host ${cap.withHost}, without it ${cap.hostless} (bound ${cap.bound}, floor ${cap.floor})`);
check('a realm that lost its host is quoted what it could re-raise, not the whole curve',
  cap.hostless >= cap.floor && cap.hostless <= cap.bound + 1, `${cap.hostless} vs bound ${cap.bound}`);

// ── 4: the stores ─────────────────────────────────────────────────────────────────────────────
const stores = await page.evaluate(async () => {
  const GS = await import('/src/state/GameState.ts');
  const Tick = await import('/src/systems/ascent/AscentTick.ts');
  const AS = await import('/src/systems/ascent/AscentState.ts');
  const G = await import('/src/systems/ascent/GranarySystem.ts');
  const CFG = await import('/src/game/ascentConfig.ts');
  const st = GS.createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st.ascent.autoResolveBattles = true;
  // Answer the opening so the tick is free to run.
  let guard = 0;
  const Resolver = await import('/src/systems/ascent/AscentResolver.ts');
  while (st.pendingAscentPrompt && guard++ < 20) {
    const o = window.__ptOptions(st);
    if (!o?.length || !Resolver.resolveAscentPrompt(st, o[0])) break;
    AS.drainAscentPrompts(st);
  }
  Tick.advanceAscentTick(st);
  // A glut: sixty thousand grain on a realm that eats a few a season.
  st.resources.food = 60000;
  const before = st.resources.food;
  const from = G.storeWasteFrom(st, 'food');
  const soldBefore = st.ascent.laneStats.storesSold ?? 0;
  Tick.advanceAscentTick(st);
  const wasted = st.ascentLedger?.waste?.food ?? 0;
  const afterOne = st.resources.food;
  // The steward sold the rotting lot during the season, so the player's own sale reads "sold".
  const capacity = G.marketCapacity(st);
  const autoSold = (st.ascent.laneStats.storesSold ?? 0) - soldBefore;
  const quoteAfterAuto = G.saleQuote(st, 'food');
  // Under the line, nothing wastes and the steward stays out of it: the sale is the player's.
  st.resources.food = Math.min(500, from - 1);
  Tick.advanceAscentTick(st);
  const wastedUnderLine = st.ascentLedger?.waste?.food ?? 0;
  const quote = G.saleQuote(st, 'food');
  const goldBefore = st.resources.gold;
  const sold = G.sellStores(st, 'food');
  const goldGained = st.resources.gold - goldBefore;
  // The second lot is thin, and there is no third.
  const thinQuote = G.saleQuote(st, 'food');
  const twice = G.sellStores(st, 'food');
  const thrice = G.saleQuote(st, 'food');
  return {
    before, from, wasted, afterOne, expectedWaste: Math.floor((before - from) * CFG.STORE_WASTE_RATE), capacity, autoSold, quoteAfterAuto, quote, sold, goldGained, twice, thinQuote, thrice, wastedUnderLine,
    rate: CFG.SALE_GOLD_PER_FOOD, thinRate: CFG.SALE_THIN_LOT_RATE,
  };
});
console.log(`\n=== THE STORES ===\n  60,000 grain against a waste line of ${stores.from}: ${stores.wasted} rotted in a season (expected ~${stores.expectedWaste}); market moves ${stores.capacity} a season; the steward sold ${stores.autoSold}; under the line the player's sale quotes ${stores.quote.units} for ${stores.quote.gold} gold`);
check('grain above the line rots at the rate', stores.wasted > 0 && Math.abs(stores.wasted - stores.expectedWaste) <= Math.max(3, stores.expectedWaste * 0.15),
  `${stores.wasted} vs ${stores.expectedWaste}`);
check('and nothing rots under it', stores.wastedUnderLine === 0, `${stores.wastedUnderLine}`);
check('the steward sells the rotting lot and leaves the thin second lot to the player', stores.capacity > 0 && stores.autoSold === stores.capacity && !stores.quoteAfterAuto.blocked && stores.quoteAfterAuto.thin,
  `capacity ${stores.capacity}, steward sold ${stores.autoSold}, then thin=${stores.quoteAfterAuto.thin} blocked=${stores.quoteAfterAuto.blocked}`);
check('under the line the sale is the player\'s, for coin, and the second lot is thin', stores.sold && stores.goldGained === stores.quote.gold && stores.goldGained > 0
  && stores.thinQuote.thin && stores.thinQuote.gold === Math.floor(stores.thinQuote.units * stores.rate * stores.thinRate) && stores.twice && stores.thrice.blocked === 'sold',
  `gained ${stores.goldGained} of ${stores.quote.gold}; thin lot ${stores.thinQuote.gold}; second ${stores.twice}; third ${stores.thrice.blocked}`);
check('a favoured store settles in the hundreds, not the tens of thousands',
  runs.every((r) => r.stockPeak.food < 6000 && r.stockPeak.supplies < 6000),
  runs.map((r) => `${Math.round(r.stockPeak.food)}/${Math.round(r.stockPeak.supplies)}`).join(', '));

// ── 5: the scaled purse ───────────────────────────────────────────────────────────────────────
const purse = await page.evaluate(async () => {
  const GS = await import('/src/state/GameState.ts');
  const R = await import('/src/systems/ResourceSystem.ts');
  const A = await import('/src/systems/AcquisitionSystem.ts');
  const War = await import('/src/systems/WarSystem.ts');
  const P = await import('/src/systems/ascent/priceScale.ts');
  const st = GS.createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  R.refreshAllLandOutputs(st);
  const capital = st.lands.find((l) => l.id === st.ascent.capitalLandId);
  const village = st.lands.find((l) => l.ownerId === 'neutral' && l.hasVillage);
  const farmAt = () => R.getBuildOptions(st, capital).find((o) => o.type === 'farm')?.cost.gold ?? 0;
  const bribeAt = () => (village ? A.getGoldBribeCost(st, village) : 0);
  const musterAt = () => War.musterCost(st, 320).gold;
  const opening = { scale: P.realmPriceScale(st), farm: farmAt(), bribe: bribeAt(), muster: musterAt(), gross: P.realmGrossGold(st) };
  // A realm grossing five times the base, once the smoothed scale has caught up.
  st.ascentLedger.gold.gross = 600;
  for (let i = 0; i < 40; i += 1) P.tickPriceScale(st);
  const rich = { scale: P.realmPriceScale(st), farm: farmAt(), bribe: bribeAt(), muster: musterAt(), target: P.targetPriceScale(st) };
  // The classic economies pay exactly 1.
  const empire = GS.createEmpireGameState({ seaSides: 1, difficulty: 'normal' });
  const empireScale = P.realmPriceScale(empire);
  return { opening, rich, empireScale };
});
console.log(`\n=== THE SCALED PURSE ===\n  founding: scale ${purse.opening.scale} (gross ${purse.opening.gross}) farm ${purse.opening.farm} village ${purse.opening.bribe} host ${purse.opening.muster}`
  + `\n  grossing 600: scale ${purse.rich.scale} (target ${purse.rich.target.toFixed(2)}) farm ${purse.rich.farm} village ${purse.rich.bribe} host ${purse.rich.muster}`);
check('the founding pays the base price', purse.opening.scale === 1);
check('a realm grossing five times the base pays more, sub-linearly',
  purse.rich.scale > 2 && purse.rich.scale < 3.2 && purse.rich.farm > purse.opening.farm * 2 && purse.rich.bribe > purse.opening.bribe * 2 && purse.rich.muster > purse.opening.muster * 2,
  `scale ${purse.rich.scale}, farm ${purse.opening.farm}->${purse.rich.farm}, village ${purse.opening.bribe}->${purse.rich.bribe}, host ${purse.opening.muster}->${purse.rich.muster}`);
check('the classic modes pay 1', purse.empireScale === 1, `${purse.empireScale}`);

// ── 6: the scaled gain ────────────────────────────────────────────────────────────────────────
//
// The other half of the purse, and until now the half nothing measured. Every reward in Dragon
// Ascent was unpinned: a search of the whole suite for an exact assertion on a payout figure
// returned nothing, only direction checks. The gain curve could have shipped arbitrarily wrong
// and every harness would have stayed green.
const gain = await page.evaluate(async () => {
  const GS = await import('/src/state/GameState.ts');
  const P = await import('/src/systems/ascent/priceScale.ts');
  const st = GS.createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const openingReward = P.scaledGain(st, { gold: 260 }).gold;
  const openingFine = P.scaledGain(st, { gold: -220 }).gold;
  st.ascentLedger.gold.gross = 600;
  st.ascentLedger.food.gross = 300;
  st.resources.gold = 1800;
  for (let i = 0; i < 40; i += 1) P.tickPriceScale(st);
  const rich = {
    reward: P.scaledGain(st, { gold: 260 }).gold,
    fine: P.scaledGain(st, { gold: -220 }).gold,
    gainScale: P.gainScale(st, 'gold'),
    priceScale: P.realmPriceScale(st),
    // An exchange must keep the rate its author wrote.
    barter: P.scaledGain(st, { supplies: -25, gold: 55 }),
    // A realm poorer than the opening is never paid less than the authored figure.
    zero: P.scaledGain(st, { gold: 0 }).gold,
  };
  const empire = GS.createEmpireGameState({ seaSides: 1, difficulty: 'normal' });
  return { openingReward, openingFine, rich, empireReward: P.scaledGain(empire, { gold: 260 }).gold };
});
console.log(`
=== THE SCALED GAIN ===
  founding: reward ${gain.openingReward} fine ${gain.openingFine}`
  + `
  grossing 600: reward ${gain.rich.reward} fine ${gain.rich.fine} (gain ${gain.rich.gainScale.toFixed(2)} vs price ${gain.rich.priceScale.toFixed(2)})`);
check('the founding is paid exactly what the author wrote', gain.openingReward === 260 && gain.openingFine === -220,
  `${gain.openingReward} / ${gain.openingFine}`);
check('a richer realm is paid more for the same deed', gain.rich.reward > gain.openingReward * 1.5,
  `${gain.openingReward} -> ${gain.rich.reward}`);
// The penalty must grow too. Flooring on the signed value returns max(-220, -660) = -220, which
// leaves every story blow flat forever and makes being punished free late in a run.
check('and fined more for the same failure', gain.rich.fine < gain.openingFine * 1.5,
  `${gain.openingFine} -> ${gain.rich.fine}`);
// Rewards must not outrun prices, or "late resources are meaningless" returns from the other side.
check('rewards grow slower than nothing but faster than prices, modestly',
  gain.rich.gainScale > gain.rich.priceScale && gain.rich.gainScale / gain.rich.priceScale < 1.5,
  `gain ${gain.rich.gainScale.toFixed(2)} vs price ${gain.rich.priceScale.toFixed(2)}`);
check('an exchange keeps the rate its author wrote',
  gain.rich.barter.supplies === -25 && gain.rich.barter.gold === 55, JSON.stringify(gain.rich.barter));
check('the classic modes are paid exactly the authored figure', gain.empireReward === 260, `${gain.empireReward}`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the opening is a setup phase, the stores settle, and the purse scales'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
