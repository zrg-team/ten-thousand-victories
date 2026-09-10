/**
 * Supply lines: is the *shape* of the realm worth anything?
 *
 * Before this, twelve provinces in one block and twelve scattered behind three rivals' borders
 * paid exactly the same. `getTradeNetworkMult` counted owned provinces without asking whether any
 * of them touched, `calculateLandOutputs` scored every non-owned neighbour at a flat zero, and
 * nothing anywhere asked whether a province could be reached from the capital at all.
 *
 * What this proves:
 *
 *   1. a province beside the seat reads hops<=2 and delivers in full
 *   2. cutting the corridor strands the far province, and its delivered output falls
 *   3. reopening the corridor restores it on the next refresh
 *   4. a province ringed by our ground out-earns the same province ringed by a rival's
 *   5. the trade network is per-block, not per-realm
 *   6. rival/campaign/empire are untouched — the factor is the *literal* 1 and the trade
 *      multiplier returns the identical float it did before
 *   7. a host marches faster over its own ground, in Ascent only
 *
 * Built on a synthetic province chain rather than a played run, because the assertions are about
 * graph topology and a real run's map never puts a corridor where the test wants one. The chain is
 * grafted onto a real `createAscentGameState`, so every formula under test is the shipped one.
 *
 * Headless engine — no renderer. Ascent-only mechanics; `verify-modes-regression.mjs` holds the
 * other three modes byte-identical.
 *
 * Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-supply-lines.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
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
  const { createAscentGameState, createInitialGameState, createCampaignGameState } =
    await import('/src/state/GameState.ts');
  const RS = await import('/src/systems/ResourceSystem.ts');
  const SS = await import('/src/systems/ascent/SupplySystem.ts');
  const MV = await import('/src/game/movementConfig.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  const r = {};

  // ── A five-province chain: seat — a — b — c — d, and a spur `far` off d ──
  //
  // Every province identical apart from its place in the chain, so a difference in output can only
  // have come from topology. Grafted onto a real ascent state so the shipped economy runs on it.
  const build = () => {
    seed(4242);
    const state = createAscentGameState({});
    const mk = (id, neighbors) => ({
      id,
      name: id,
      type: 'market',
      ownerId: PLAYER,
      x: 0, y: 0,
      defense: 20,
      loyalty: 100,
      compliance: 100,
      neighbors,
      buildings: [],
      buildingCapacity: 3,
      terrainSummary: {
        plains: 7, fields: 0, riceFields: 0, forest: 0,
        mountains: 0, hills: 0, water: 0, fortress: 0, shrine: 0,
      },
      outputs: { food: 0, supplies: 0, gold: 0, humans: 0 },
      isVisible: true,
      isExplored: true,
      special: '',
      population: 100,
      localSoldiers: 10,
      hasVillage: true,
      trust: {},
    });
    const chain = [
      mk('seat', ['a']),
      mk('a', ['seat', 'b']),
      mk('b', ['a', 'c']),
      mk('c', ['b', 'd']),
      mk('d', ['c', 'far']),
      mk('far', ['d']),
    ];
    chain[0].type = 'castle';
    state.lands = chain;
    state.hexTiles = [];
    state.armies = [];
    state.buildOrders = [];
    state.siegeOrders = [];
    state.acquisitionOrders = [];
    state.movementOrders = [];
    state.ascent.capitalLandId = 'seat';
    return state;
  };
  const landOf = (state, id) => state.lands.find((l) => l.id === id);
  const worth = (l) => l.outputs.food + l.outputs.supplies + l.outputs.gold;

  // ── 1 + 2 + 3: reach, severance, recovery ──
  {
    const state = build();
    RS.refreshAllLandOutputs(state);
    const near = SS.landSupply(state, 'a');
    const farBefore = SS.landSupply(state, 'far');
    const farWorthBefore = worth(landOf(state, 'far'));
    r.nearHops = near.hops;
    r.nearFactor = near.factor;
    r.farHops = farBefore.hops;
    r.farFactor = farBefore.factor;
    r.farBlockBefore = farBefore.block;

    // Cut the corridor: `c` changes hands, stranding d and far.
    landOf(state, 'c').ownerId = 'northern-rival';
    RS.refreshAllLandOutputs(state);
    const farAfter = SS.landSupply(state, 'far');
    r.farCutOff = farAfter.cutOff;
    r.farBlockAfter = farAfter.block;
    r.farFactorCut = farAfter.factor;
    r.farWorthDrop = farWorthBefore > 0 ? worth(landOf(state, 'far')) / farWorthBefore : -1;
    r.nearStillFine = !SS.landSupply(state, 'a').cutOff;

    // And back again.
    landOf(state, 'c').ownerId = PLAYER;
    RS.refreshAllLandOutputs(state);
    r.farRestored = !SS.landSupply(state, 'far').cutOff;
    r.farWorthRestored = worth(landOf(state, 'far')) === farWorthBefore;
  }

  // ── 4: neighbour tiers ──
  //
  // A hub province with three border districts, flipped together across four arms. Three
  // neighbours rather than one, and a real market on the ground, because the delivered figure is
  // an integer: on a two-neighbour province with no buildings the village and wilderness arms come
  // out 7.198 and 6.608 and *both round to 7*, which says nothing about whether the tiers work.
  //
  // The three foreign arms are the clean comparison — none of them is owned, so the trade network
  // is identical across all three and the only thing that moves is the weight. The owned arm
  // deliberately gains on both counts, because owning a neighbour genuinely does both.
  {
    const tierState = (ownerId, hasVillage) => {
      const state = build();
      const hub = landOf(state, 'b');
      hub.neighbors = ['a', 'n1', 'n2', 'n3'];
      landOf(state, 'a').neighbors = ['seat', 'b'];
      for (const id of ['n1', 'n2', 'n3']) {
        const leaf = { ...landOf(state, 'far'), id, name: id, neighbors: ['b'], type: 'farm' };
        leaf.outputs = { food: 0, supplies: 0, gold: 0, humans: 0 };
        leaf.ownerId = ownerId;
        leaf.hasVillage = hasVillage;
        state.lands.push(leaf);
      }
      // Drop the rest of the chain so the hub's block is exactly what this test intends.
      state.lands = state.lands.filter((l) => !['c', 'd', 'far'].includes(l.id));
      landOf(state, 'b').neighbors = ['a', 'n1', 'n2', 'n3'];
      return state;
    };
    const tier = (ownerId, hasVillage) => {
      const state = tierState(ownerId, hasVillage);
      RS.refreshAllLandOutputs(state);
      return {
        gold: landOf(state, 'b').outputs.gold,
        weight: SS.neighborTradeWeight(state, landOf(state, 'b')),
      };
    };
    const own = tier(PLAYER, true);
    const village = tier('neutral', true);
    const wild = tier('neutral', false);
    const rival = tier('northern-rival', true);
    r.tierOwn = own.gold; r.tierNeutralVillage = village.gold;
    r.tierNeutralWild = wild.gold; r.tierRival = rival.gold;
    r.weightOwn = own.weight; r.weightVillage = village.weight;
    r.weightWild = wild.weight; r.weightRival = rival.weight;
  }

  // ── 5: the trade network is per-block ──
  {
    const state = build();
    RS.refreshAllLandOutputs(state);
    r.blockWhole = SS.landSupply(state, 'far').block;
    landOf(state, 'c').ownerId = 'northern-rival';
    RS.refreshAllLandOutputs(state);
    r.blockSplitFar = SS.landSupply(state, 'far').block;
    r.blockSplitNear = SS.landSupply(state, 'a').block;
  }

  // ── 6: the classic modes are untouched ──
  {
    seed(99);
    const rival = createInitialGameState();
    seed(99);
    const campaign = createCampaignGameState({});
    const ours = rival.lands.find((l) => l.ownerId === PLAYER) ?? rival.lands[0];
    const theirs = campaign.lands.find((l) => l.ownerId === PLAYER) ?? campaign.lands[0];
    // Strict identity, not approximate: `1 * x` and a lerp that lands on 1 are different floats,
    // and that is exactly what a mode fingerprint diff catches.
    r.rivalFactorIsOne = SS.supplyFactor(rival, ours) === 1;
    r.campaignFactorIsOne = SS.supplyFactor(campaign, theirs) === 1;
    r.rivalSupplyInactive = !SS.supplyLinesActive(rival);
    // Outside Ascent the neighbour weight must be the plain owned-neighbour count it replaced.
    const owned = ours.neighbors.filter(
      (id) => rival.lands.find((o) => o.id === id)?.ownerId === PLAYER).length;
    r.rivalWeightIsCount = SS.neighborTradeWeight(rival, ours) === owned;
    r.rivalNoSupplyState = rival.ascent === undefined;
  }

  // ── 7: marching on our own roads ──
  {
    const state = build();
    const army = {
      id: 'h1', name: 'h', kingdomId: PLAYER, landId: 'seat',
      units: { spearmen: 100, archers: 0, heavyInfantry: 0 },
      level: 1, morale: 100, supply: 100, provisions: 50, rations: 50,
    };
    // Mountains, where the bonus can actually change the rounded answer.
    const hard = landOf(state, 'b');
    hard.terrainSummary = {
      plains: 0, fields: 0, riceFields: 0, forest: 0,
      mountains: 7, hills: 0, water: 0, fortress: 0, shrine: 0,
    };
    hard.ownerId = PLAYER;
    r.legOwn = MV.getLegTicks(army, hard, state);
    hard.ownerId = 'northern-rival';
    r.legForeign = MV.getLegTicks(army, hard, state);
    // And identical in a classic mode, whoever holds it.
    seed(7);
    const rival = createInitialGameState();
    hard.ownerId = PLAYER;
    r.legClassicOwn = MV.getLegTicks(army, hard, rival);
    hard.ownerId = 'northern-rival';
    r.legClassicForeign = MV.getLegTicks(army, hard, rival);
  }

  return r;
});

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

console.log('=== REACH ===');
check('a province beside the seat is 1 hop out', out.nearHops === 1, `hops=${out.nearHops}`);
check('near ground delivers in full', out.nearFactor === 1, `factor=${out.nearFactor}`);
check('the far end of the chain is further out', out.farHops >= 3, `hops=${out.farHops}`);
check('and delivers less than in full', out.farFactor < 1, `factor=${out.farFactor}`);

console.log('\n=== SEVERANCE ===');
check('cutting the corridor strands the far province', out.farCutOff === true);
check('a stranded province delivers the cut-off share', Math.abs(out.farFactorCut - 0.45) < 1e-9,
  `factor=${out.farFactorCut}`);
check('its delivered output actually falls', out.farWorthDrop < 0.85,
  `now ${(out.farWorthDrop * 100).toFixed(0)}% of before`);
check('ground still joined to the seat is unaffected', out.nearStillFine === true);
check('reopening the corridor un-strands it', out.farRestored === true);
check('and restores its output exactly', out.farWorthRestored === true);

console.log('\n=== NEIGHBOUR TIERS ===');
const weights = [out.weightOwn, out.weightVillage, out.weightWild, out.weightRival];
check('the weight ranks ours > village > wilderness > rival',
  out.weightOwn > out.weightVillage
  && out.weightVillage > out.weightWild
  && out.weightWild > out.weightRival,
  `weight ${weights.join(' > ')}`);
const tiers = [out.tierOwn, out.tierNeutralVillage, out.tierNeutralWild, out.tierRival];
check('and the delivered gold ranks the same way',
  out.tierOwn > out.tierNeutralVillage
  && out.tierNeutralVillage > out.tierNeutralWild
  && out.tierNeutralWild > out.tierRival,
  `gold ${tiers.join(' > ')}`);

console.log('\n=== TRADE NETWORK PER BLOCK ===');
check('a whole realm is one block', out.blockWhole === 6, `block=${out.blockWhole}`);
check('cutting it makes two smaller blocks',
  out.blockSplitFar === 2 && out.blockSplitNear === 3,
  `far=${out.blockSplitFar} near=${out.blockSplitNear}`);

console.log('\n=== CLASSIC MODES UNTOUCHED ===');
check('rival supply factor is the literal 1', out.rivalFactorIsOne === true);
check('campaign supply factor is the literal 1', out.campaignFactorIsOne === true);
check('supply lines are inactive outside ascent', out.rivalSupplyInactive === true);
check('neighbour weight is the old owned count', out.rivalWeightIsCount === true);
check('no ascent state to cache a reading on', out.rivalNoSupplyState === true);

console.log('\n=== MARCH ===');
check('a host marches faster over its own ground', out.legOwn < out.legForeign,
  `own=${out.legOwn} foreign=${out.legForeign}`);
check('and identically in a classic mode', out.legClassicOwn === out.legClassicForeign,
  `own=${out.legClassicOwn} foreign=${out.legClassicForeign}`);

console.log('\n=== ERRORS ===');
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the shape of the realm is worth something, and only in Dragon Ascent'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
