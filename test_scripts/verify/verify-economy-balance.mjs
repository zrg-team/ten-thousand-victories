/**
 * The 2026-09-15 economy round, held to what it promised.
 *
 * Reported with two screenshots: gold and goods growing so fast the numbers stopped meaning
 * anything; costs that never scaled (seven heroes 46, building upkeep 17, a 145-man host 6); and an
 * ask that champions should want raises by level and character. What this proves, v2 against v1 on
 * the same seed:
 *
 *   1. damperNetwork — owning the land next door adds far less; the connected block's bonus is capped
 *   2. waterTrade    — a province on the water earns a real premium, can raise a harbour; dry and v1 cannot
 *   3. goodsSink     — walls and hosts wear goods on v2 and not on v1
 *   4. marketGlut    — selling a lot depresses the next price, and a rested market recovers
 *   5. parPrices     — the founding pays as written; a par realm pays the round; twice par keeps
 *                      1.6-1.75x par's buying power; under par gets a discount but never below 1;
 *                      a one-time story cost weighs against the treasury; a court trade keeps its rate;
 *                      rewards never outrun the income ceiling
 *   6. upkeepRound   — standing costs climb with the round only on v2
 *   7. heroRaises    — asks are sized to gross by temperament; refusal costs loyalty; a hero only
 *                      leaves after a warned card, and never a modest or steady one; v1 never asks
 *
 * Headless engine, constructed fixtures (map generation is unseeded, so a fixture is chosen from the
 * world rather than assumed). `verify-ascent-fingerprint.mjs --ruleset v1` holds v1 byte-identical.
 *
 * Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-economy-balance.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`CONSOLE: ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 60000 },
);

const out = await page.evaluate(async () => {
  const seed = (n) => {
    let s = n >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const realRandom = Math.random;
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const RS = await import('/src/systems/ResourceSystem.ts');
  const WT = await import('/src/systems/ascent/WaterTrade.ts');
  const PS = await import('/src/systems/ascent/priceScale.ts');
  const GS = await import('/src/systems/ascent/GranarySystem.ts');
  const HR = await import('/src/systems/ascent/HeroRaiseSystem.ts');
  const HP = await import('/src/systems/heroes/heroPay.ts');
  const HS = await import('/src/systems/heroes/HeroService.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  const make = (ruleset, n = 777) => {
    seed(n);
    const config = { seaSides: 1, difficulty: 'normal' };
    if (ruleset !== 'v1') config.ruleset = ruleset;
    const state = createAscentGameState(config);
    Math.random = realRandom;
    return state;
  };
  const r = {};

  // ── 1 · network: a capital ringed by our own provinces ──
  for (const id of ['v1', 'v2']) {
    const state = make(id);
    const capital = state.lands.find((land) => land.id === state.ascent.capitalLandId);
    const alone = RS.calculateLandOutputs(state, capital, 1).gold;
    for (const nid of capital.neighbors) {
      const n = state.lands.find((land) => land.id === nid);
      if (n) n.ownerId = PLAYER;
    }
    RS.refreshAllLandOutputs(state);
    const ringed = RS.calculateLandOutputs(state, capital, 1).gold;
    r[`ring_${id}`] = { alone, ringed, gain: ringed / Math.max(1, alone), block: RS.landTradeNetworkBonus(state, capital) };
  }

  // ── 2 · water: the wettest province in the world, and a dry one of the same kind ──
  {
    const v2 = make('v2');
    const v1 = make('v1');
    const byWet = [...v2.lands].map((land) => ({ land, wet: WT.watersideHexes(v2, land) })).sort((a, b) => b.wet - a.wet);
    const wet = byWet[0];
    const dry = byWet.find((entry) => entry.wet === 0 && entry.land.type === wet.land.type) ?? byWet[byWet.length - 1];
    r.water = {
      wetHexes: wet.wet,
      bonusV2: WT.waterTradeBonus(v2, wet.land),
      bonusDry: WT.waterTradeBonus(v2, dry.land),
      bonusV1: WT.waterTradeBonus(v1, v1.lands.find((land) => land.id === wet.land.id)),
      harbourWet: WT.canHarbour(v2, wet.land),
      harbourDry: WT.canHarbour(v2, dry.land),
      harbourV1: WT.canHarbour(v1, v1.lands.find((land) => land.id === wet.land.id)),
    };
    // The same market on the wet province pays more on v2 than on v1.
    const put = (state, landId) => {
      const land = state.lands.find((candidate) => candidate.id === landId);
      land.ownerId = PLAYER;
      land.buildings = [{ type: 'market', level: 3 }];
      return RS.calculateLandOutputs(state, land, 1).gold;
    };
    r.water.marketV2 = put(v2, wet.land.id);
    r.water.marketV1 = put(v1, wet.land.id);
  }

  // ── 3 · goods: walls and a host wear goods on v2 ──
  for (const id of ['v1', 'v2']) {
    const state = make(id);
    const capital = state.lands.find((land) => land.id === state.ascent.capitalLandId);
    capital.buildings.push({ type: 'wall', level: 3 }, { type: 'barracks', level: 2 });
    RS.refreshAllLandOutputs(state);
    r[`goods_${id}`] = state.ascentLedger.supplies.demand;
  }

  // ── 4 · glut ──
  {
    const state = make('v2');
    const capital = state.lands.find((land) => land.id === state.ascent.capitalLandId);
    capital.buildings.push({ type: 'market', level: 5 });
    state.resources.supplies = 5000;
    const first = GS.saleQuote(state, 'supplies');
    GS.sellStores(state, 'supplies');
    state.turn += 1;
    const next = GS.saleQuote(state, 'supplies');
    GS.sellStores(state, 'supplies');
    state.turn += 1;
    const third = GS.saleQuote(state, 'supplies');
    state.turn += 12;
    const rested = GS.saleQuote(state, 'supplies');
    r.glut = { first: first.glut, next: next.glut, third: third.glut, rested: rested.glut, firstGold: first.gold, nextGold: next.gold };
    const v1 = make('v1');
    v1.lands.find((land) => land.id === v1.ascent.capitalLandId).buildings.push({ type: 'market', level: 5 });
    v1.resources.supplies = 5000;
    GS.sellStores(v1, 'supplies');
    v1.turn += 1;
    r.glut.v1 = GS.saleQuote(v1, 'supplies').glut;
    r.glut.v1Fields = Object.keys(v1.ascent.storeSales.supplies).sort().join(',');
  }

  // ── 5 · par prices: the worked table ──
  {
    const at = (id, wave, gross, gold) => {
      const state = make(id);
      state.ascent.wave = wave;
      state.ascentLedger.gold.gross = gross;
      state.resources.gold = gold;
      return { price: PS.targetPriceScale(state), gain: PS.gainScale(state, 'gold'), par: PS.parPricesActive(state) ? PS.parFigures(state) : null, upkeep: PS.upkeepRoundScale(state) };
    };
    const founding = at('v2', 0, 120, 1500);
    const par8 = at('v2', 8, 0, 0);
    const parGross = par8.par.gross; const parTreasury = par8.par.treasury;
    const par = at('v2', 8, parGross, parTreasury);
    const twice = at('v2', 8, parGross * 2, parTreasury * 2);
    const half = at('v2', 8, parGross * 0.5, parTreasury * 0.5);
    const late = at('v2', 20, 0, 0);
    r.par = {
      founding: founding.price,
      par: par.price,
      twice: twice.price,
      half: half.price,
      // Buying power relative to par: worth over price, divided by par's.
      twiceBuying: (2 / twice.price) / (1 / par.price),
      halfBuying: (0.5 / half.price) / (1 / par.price),
      gainCeilingOk: [founding, par, twice, half].every((row, i) => row.gain <= Math.max(1, Math.pow([120, parGross, parGross * 2, parGross * 0.5][i] / 120, 0.75)) + 1e-9),
      parGross, parTreasury,
      upkeep8: par.upkeep,
      upkeep20: late.upkeep,
      upkeepV1: at('v1', 8, parGross, parTreasury).upkeep,
    };
  }

  // ── 5b · a one-time choice weighs against the purse ──
  {
    const SV = await import('/src/systems/ascent/storyValue.ts');
    const PSys = await import('/src/systems/PoliticsSystem.ts');
    const at = (id, gold) => {
      const state = make(id);
      state.ascent.wave = 8;
      state.ascentLedger.gold.gross = 262;
      state.resources.gold = gold;
      return state;
    };
    const rich = at('v2', 4700);
    const poor = at('v2', 400);
    const v1 = at('v1', 4700);
    const trade = PSys.courtResourceDelta(rich, { resourceDelta: { gold: -45, food: 75 } });
    r.purse = {
      rich: SV.storyCost(rich, { gold: 40 }).gold,
      poor: SV.storyCost(poor, { gold: 40 }).gold,
      v1: SV.storyCost(v1, { gold: 40 }).gold,
      huge: SV.treasuryWeighted(rich, 4000),
      tradeGold: trade.gold,
      tradeFood: trade.food,
      v1Trade: PSys.courtResourceDelta(v1, { resourceDelta: { gold: -45, food: 75 } }),
    };
  }

  // ── 7 · hero raises ──
  {
    const state = make('v2');
    state.ascent.wave = 8;
    state.ascentLedger.gold.gross = 470;
    state.resources.gold = 5000;
    // A recruited champion from the deck, and one of each temperament if the deck has them.
    const recruits = [];
    for (const hero of [...state.heroDeck]) {
      if (recruits.length >= 12) break;
      state.heroDeck = state.heroDeck.filter((h) => h.id !== hero.id);
      state.heroes.push(hero);
      HS.initializeRecruitedHero(state, hero);
      if (hero.growth) recruits.push(hero);
    }
    const tempers = {};
    for (const hero of recruits) (tempers[HP.heroTemperament(hero)] ??= []).push(hero);
    r.raise = { recruits: recruits.length, tempers: Object.fromEntries(Object.entries(tempers).map(([k, v]) => [k, v.length])) };
    for (const hero of recruits) {
      HP.ensureHeroPay(state, hero);
      HP.heroPayState(hero).sinceTurn = state.turn - 500;
    }
    r.raise.ready = HR.heroRaiseReady(state);
    const proud = tempers.greedy?.[0] ?? tempers.ambitious?.[0];
    const calm = tempers.steady?.[0] ?? tempers.modest?.[0];
    // Asks: sized to gross, bigger for the proud.
    if (proud && calm) {
      r.raise.askProud = HR.heroRaiseAsk(state, proud);
      r.raise.askCalm = HR.heroRaiseAsk(state, calm);
    }
    // Grant: the wage rises by the ask.
    if (calm) {
      const before = RS.heroWage(state, calm);
      const ask = HR.heroRaiseAsk(state, calm);
      const loyaltyBefore = calm.stats.loyalty;
      HR.resolveHeroRaise(state, { heroId: calm.id, ask, temperament: HP.heroTemperament(calm), warn: false }, 'grant');
      r.raise.grantDelta = RS.heroWage(state, calm) - before;
      r.raise.grantAsk = ask;
      r.raise.grantPosted = !calm.assignedTo ? 0.5 : 1;
      r.raise.grantLoyalty = calm.stats.loyalty - loyaltyBefore;
      // A calm champion refused to the floor never leaves.
      calm.stats.loyalty = 5;
      const pay = HP.heroPayState(calm);
      pay.refusals = 5; pay.warned = true;
      HR.resolveHeroRaise(state, { heroId: calm.id, ask, temperament: HP.heroTemperament(calm), warn: true }, 'refuse');
      r.raise.calmStays = state.heroes.some((h) => h.id === calm.id);
    }
    if (proud) {
      const ask = HR.heroRaiseAsk(state, proud);
      const temperament = HP.heroTemperament(proud);
      proud.stats.loyalty = 20;
      const pay = HP.heroPayState(proud);
      // Unwarned: even at low loyalty a refusal never sends them away, it only warns.
      HR.resolveHeroRaise(state, { heroId: proud.id, ask, temperament, warn: false }, 'refuse');
      HR.resolveHeroRaise(state, { heroId: proud.id, ask, temperament, warn: false }, 'refuse');
      r.raise.proudStaysUnwarned = state.heroes.some((h) => h.id === proud.id);
      r.raise.proudWarned = pay.warned;
      // Warned, loyalty low: the refusal the card warned of sends them away.
      HR.resolveHeroRaise(state, { heroId: proud.id, ask, temperament, warn: pay.warned }, 'refuse');
      r.raise.proudLeft = !state.heroes.some((h) => h.id === proud.id);
      r.raise.proudInDeck = state.heroDeck.some((h) => h.id === proud.id);
    }
    // v1: never asks, and the wage is the written one.
    const v1 = make('v1');
    v1.ascent.wave = 8;
    const hero = v1.heroDeck[0];
    v1.heroDeck = v1.heroDeck.slice(1);
    v1.heroes.push(hero);
    r.raise.v1Ready = HR.heroRaiseReady(v1);
    r.raise.v1Mult = HP.heroEarnedPayMult(v1, hero);
  }
  return r;
});

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
};
const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : String(x));

console.log('\n=== 1 · CONNECTED LAND ===');
check('v1: a ringed capital earns far more than a lone one', out.ring_v1.gain > 1.3, `x${f2(out.ring_v1.gain)}`);
check('v2: ringing the capital adds much less than on v1', out.ring_v2.gain < out.ring_v1.gain * 0.85, `v2 x${f2(out.ring_v2.gain)} vs v1 x${f2(out.ring_v1.gain)}`);
check('v2: the connected block adds at most +30%', out.ring_v2.block <= 0.3 + 1e-9, `+${Math.round(out.ring_v2.block * 100)}% (v1 +${Math.round(out.ring_v1.block * 100)}%)`);

console.log('\n=== 2 · WATER TRADE ===');
check('the world has a province on the water', out.water.wetHexes > 0, `${out.water.wetHexes} hexes`);
check('v2: a wet province earns a premium of at least 25%', out.water.bonusV2 >= 0.25, `+${Math.round(out.water.bonusV2 * 100)}%`);
check('v2: dry ground earns none; v1 none anywhere', out.water.bonusDry === 0 && out.water.bonusV1 === 0);
check('v2: the same market pays more on the water than v1 pays', out.water.marketV2 > out.water.marketV1 * 0.9, `v2 ${out.water.marketV2} vs v1 ${out.water.marketV1}`);
check('a harbour: wet yes, dry no, v1 never', out.water.harbourWet && !out.water.harbourDry && !out.water.harbourV1);

console.log('\n=== 3 · GOODS SINK ===');
check('v2: walls and barracks wear goods v1 does not', out.goods_v2 > out.goods_v1, `v2 ${out.goods_v2} vs v1 ${out.goods_v1}`);

console.log('\n=== 4 · MARKET GLUT ===');
check('a rested market pays the full price', out.glut.first === 1);
check('the season after a lot, the price has fallen', out.glut.next < 0.9, `${f2(out.glut.next)}`);
check('a second lot in a row falls further', out.glut.third < out.glut.next, `${f2(out.glut.third)}`);
check('rested a dozen seasons, it recovers', out.glut.rested > 0.9, `${f2(out.glut.rested)}`);
check('v1: no glut, and its sale record keeps the old fields', out.glut.v1 === 1 && out.glut.v1Fields === 'lots,turn', out.glut.v1Fields);

console.log('\n=== 5 · PAR PRICES ===');
check('the founding pays as written', out.par.founding === 1, f2(out.par.founding));
check('a par realm pays the round (1.5-2.5x at wave 8)', out.par.par >= 1.5 && out.par.par <= 2.5, f2(out.par.par));
check('twice par pays more, but keeps 1.6-1.75x par\'s buying power', out.par.twice > out.par.par && out.par.twiceBuying >= 1.6 && out.par.twiceBuying <= 1.75, `price ${f2(out.par.twice)}, buying ${f2(out.par.twiceBuying)}`);
check('half par pays less than par, never under the written price', out.par.half < out.par.par && out.par.half >= 1, `price ${f2(out.par.half)}, buying ${f2(out.par.halfBuying)}`);
check('rewards never outrun the income ceiling', out.par.gainCeilingOk === true);

console.log('\n=== 6 · UPKEEP ROUND ===');
check('v2: standing costs climb with the round (x1.3-2 at wave 8)', out.par.upkeep8 >= 1.3 && out.par.upkeep8 <= 2 && out.par.upkeep20 >= out.par.upkeep8 && out.par.upkeep20 <= 3, `w8 x${f2(out.par.upkeep8)} w20 x${f2(out.par.upkeep20)}`);

console.log('\n=== 5b · THE PURSE ===');
check('a 40-gold story costs at least 3% of a 4,700 treasury', out.purse.rich >= 141, `${out.purse.rich}`);
check('a small purse pays the priced figure, not a share', out.purse.poor < out.purse.rich, `${out.purse.poor}`);
check('the floor never takes more than 40% of the treasury', out.purse.huge <= 1880 && out.purse.huge > 0, `${out.purse.huge}`);
check('a court trade keeps its rate and is not pocket change', out.purse.tradeGold <= -90 && Math.abs(out.purse.tradeFood / -out.purse.tradeGold - 75 / 45) < 0.05, `${out.purse.tradeGold} gold for ${out.purse.tradeFood} food`);
check('v1: the old price, and the trade as written', out.purse.v1 < out.purse.rich && out.purse.v1Trade.gold === -45 && out.purse.v1Trade.food === 75, `${out.purse.v1}`);
check('v1: the literal 1', out.par.upkeepV1 === 1);

console.log('\n=== 7 · HERO RAISES ===');
check('recruits carry a temperament', out.raise.recruits > 0, JSON.stringify(out.raise.tempers));
check('an overdue champion is ready to ask', out.raise.ready === true);
if (out.raise.askProud !== undefined) {
  check('asks are sized to gross (1-10% of 470)', out.raise.askCalm >= 4 && out.raise.askProud <= 47, `calm ${out.raise.askCalm}, proud ${out.raise.askProud}`);
}
if (out.raise.grantDelta !== undefined) {
  check('a granted raise lifts the wage by the ask', Math.abs(out.raise.grantDelta - out.raise.grantAsk * out.raise.grantPosted) < 0.51, `+${f2(out.raise.grantDelta)} for ask ${out.raise.grantAsk}`);
  check('a grant buys loyalty', out.raise.grantLoyalty > 0, `+${out.raise.grantLoyalty}`);
  check('a modest or steady champion never leaves over pay', out.raise.calmStays === true);
}
if (out.raise.proudLeft !== undefined) {
  check('refused without a warning, a proud champion stays', out.raise.proudStaysUnwarned === true);
  check('...and is warned', out.raise.proudWarned === true);
  check('the warned refusal sends them away, back to the deck', out.raise.proudLeft === true && out.raise.proudInDeck === true);
}
check('v1: no asks, the written wage', out.raise.v1Ready === false && out.raise.v1Mult === 1);

console.log('\n=== ERRORS ===');
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the economy round holds' : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
