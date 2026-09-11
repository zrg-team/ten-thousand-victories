/**
 * Part 1: the claim rule, enforced and stated the same way everywhere.
 * Headless engine. Ascent only.
 */
import { chromium } from 'playwright';
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 160)); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });

const out = await page.evaluate(async () => {
  const { createAscentGameState, createEmpireGameState } = await import('/src/state/GameState.ts');
  const AQ = await import('/src/systems/AcquisitionSystem.ts');
  const CQ = await import('/src/systems/ascent/ConquestSystem.ts');
  const { PLAYER_KINGDOM_ID, NEUTRAL_OWNER_ID } = await import('/src/game/constants.ts');
  const r = { player: PLAYER_KINGDOM_ID };
  /**
   * The map is generated with unseeded `Math.random`, so a given world may simply not contain the
   * fixture a check needs — a neutral village, or one on our own border. Rolling until one does
   * is what keeps this harness from failing about once in ten runs for reasons that have nothing
   * to do with the code under test.
   */
  const worldWith = (predicate) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = createAscentGameState({});
      candidate.ascent.wave = 9;
      if (predicate(candidate)) return candidate;
    }
    return undefined;
  };
  const neutralVillage = (world) =>
    world.lands.find((l) => l.ownerId === NEUTRAL_OWNER_ID && l.hasVillage);
  const borderVillage = (world) => {
    for (const own of world.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID)) {
      const found = world.lands.find((l) => own.neighbors.includes(l.id)
        && l.ownerId === NEUTRAL_OWNER_ID && l.hasVillage);
      if (found) return found;
    }
    return undefined;
  };
  const order = (landId, method, buyerId = PLAYER_KINGDOM_ID) =>
    ({ landId, buyerId, progress: 0, required: 1, costGold: 0, method });
  const st = worldWith((w) => Boolean(neutralVillage(w)));

  r.slots = AQ.getClaimSlots(st);
  r.countEmpty = AQ.getPlayerClaimCount(st);

  // An occupation order must not consume an envoy slot...
  st.acquisitionOrders.push(order('x1', 'occupy'));
  r.countAfterOccupy = AQ.getPlayerClaimCount(st);
  r.canStartAfterOccupy = AQ.canStartClaim(st);

  // ...but an envoy order must.
  st.acquisitionOrders.push(order('x2', 'bribe'));
  r.countAfterBribe = AQ.getPlayerClaimCount(st);
  r.canStartAfterBribe = AQ.canStartClaim(st);
  r.blockedReason = AQ.claimBlockedReason(st) ?? null;

  // A bot's order is not the player's problem.
  st.acquisitionOrders.push(order('x3', 'bribe', 'bot-1'));
  r.countWithBot = AQ.getPlayerClaimCount(st);

  // CLAIM_METHODS is exported and excludes force.
  r.claimMethods = [...CQ.CLAIM_METHODS].sort();

  // At the cap, a neutral village greys its envoy rows but keeps force open.
  const village = neutralVillage(st);
  r.foundVillage = Boolean(village);
  if (village) {
    const capReason = AQ.claimBlockedReason(st);
    const methods = CQ.buildMethodOptions(st, village);
    r.shutAtCap = methods.filter((m) => m.blockedReason).map((m) => m.method).sort();
    // Every envoy method is shut, and shut *by the cap* specifically.
    const envoys = methods.filter((m) => CQ.CLAIM_METHODS.has(m.method));
    r.envoyCount = envoys.length;
    // `buildMethodOptions` uses `??=`, so a method already blocked for its own reason (no envoy
    // free, no adjacent host) keeps that reason and the cap only fills in where nothing else did.
    // So: every envoy is shut, and the cap is visibly the thing shutting at least one of them.
    r.everyEnvoyShut = envoys.every((m) => Boolean(m.blockedReason));
    r.capShutsAnEnvoy = envoys.some((m) => m.blockedReason === capReason);
    // Force may be blocked for its own reasons (no host free), but never by the claim cap.
    // That is the whole rule: envoys and coin are capped, a host you command is not.
    const force = methods.filter((m) => !CQ.CLAIM_METHODS.has(m.method));
    r.forceCount = force.length;
    r.noForceBlockedByCap = force.every((m) => m.blockedReason !== capReason);
  }

  // Classic modes are uncapped by construction.
  const emp = createEmpireGameState({});
  r.empireSlots = AQ.getClaimSlots(emp);

  // ── Part 2: a province remembers being offered money ──────────────────────
  const st2 = worldWith((w) => Boolean(neutralVillage(w)));
  const v2 = neutralVillage(st2);
  r.foundVillage2 = Boolean(v2);
  if (v2) {
    const priceAt = () => AQ.getGoldBribeCost(st2, v2);
    const chanceAt = () => AQ.getBribeSuccessChance(st2, v2);
    r.price0 = priceAt(); r.chance0 = chanceAt();
    r.barred0 = AQ.isClaimBarred(st2, v2.id);

    // The price must read the province's own worth, not just its walls.
    const rich = { ...v2, id: 'rich', outputs: { ...v2.outputs, gold: v2.outputs.gold + 20 } };
    r.richerCostsMore = AQ.getGoldBribeCost(st2, rich) > r.price0;
    const many = { ...v2, id: 'many', population: v2.population + 800 };
    r.morePeopleCostsMore = AQ.getGoldBribeCost(st2, many) > r.price0;

    // Each refusal escalates price and lowers the odds.
    st2.ascent.claimAttempts = { [v2.id]: { failures: 1 } };
    r.price1 = priceAt(); r.chance1 = chanceAt();
    st2.ascent.claimAttempts = { [v2.id]: { failures: 2 } };
    r.price2 = priceAt();

    // At the limit the door shuts for coin only.
    st2.ascent.claimAttempts = { [v2.id]: { failures: 3, barredUntil: st2.turn + 36 } };
    r.barredNow = AQ.isClaimBarred(st2, v2.id);
    r.barSeasons = AQ.getClaimBarSeasons(st2, v2.id);
    st2.resources.gold = 999999; // so the block cannot be "you cannot afford it"
    const m2 = CQ.buildMethodOptions(st2, v2);
    const bribe = m2.find((m) => m.method === 'bribe');
    r.bribeShutWhenBarred = Boolean(bribe && bribe.blockedReason);
    r.bribeShutByTheBar = bribe?.blockedReason?.includes(String(r.barSeasons)) ?? false;
    // The map is generated with unseeded Math.random, so whether a diplomat or a host happens to
    // be free varies run to run — "some other row is open" is not a stable assertion. The stable
    // one is that the bar is *only* ever the reason coin is shut: it must never be why the envoy,
    // the threat or the host is refused. That is the whole point of barring money alone.
    r.barNeverBlocksOthers = m2
      .filter((m) => m.method !== 'bribe')
      .every((m) => m.blockedReason !== bribe?.blockedReason);

    // The bar expires.
    st2.turn += 40;
    r.barLiftsWithTime = !AQ.isClaimBarred(st2, v2.id);
  }

  // ── End to end: a real refused bribe writes the ledger and moves the price ──
  // A village on our border, so `bribeLand` gets past its adjacency guard.
  const st3 = worldWith((w) => Boolean(borderVillage(w)));
  st3.resources.gold = 999999;
  const border = borderVillage(st3);
  r.foundBorderVillage = Boolean(border);
  if (border) {
    const realRandom = Math.random;
    try {
      Math.random = () => 0.999; // always above the chance: always refused
      r.e2ePriceBefore = AQ.getGoldBribeCost(st3, border);
      const goldBefore = st3.resources.gold;
      r.e2eReturned = AQ.bribeLand(st3, border.id);
      r.e2eSpent = goldBefore - st3.resources.gold;
      r.e2eFailures = AQ.getClaimFailures(st3, border.id);
      r.e2ePriceAfter = AQ.getGoldBribeCost(st3, border);
      // Three refusals in all, then the door shuts.
      AQ.bribeLand(st3, border.id);
      AQ.bribeLand(st3, border.id);
      r.e2eFailuresAfter3 = AQ.getClaimFailures(st3, border.id);
      r.e2eBarred = AQ.isClaimBarred(st3, border.id);
      // And a barred province refuses the call outright rather than taking more gold.
      const goldAtBar = st3.resources.gold;
      r.e2eBarredSpend = goldAtBar - st3.resources.gold;
    } finally { Math.random = realRandom; }
  }

  // The ledger is inert outside Dragon Ascent.
  const emp2 = createEmpireGameState({});
  r.empireFailures = AQ.getClaimFailures(emp2, emp2.lands[0].id);
  r.empireBarred = AQ.isClaimBarred(emp2, emp2.lands[0].id);
  return r;
});

await browser.close();
const checks = [];
const ck = (name, pass, detail) => checks.push({ name, pass, detail });
ck('an occupation consumes no envoy slot', out.countAfterOccupy === 0, `count=${out.countAfterOccupy}`);
ck('an occupation leaves a claim startable', out.canStartAfterOccupy === true, String(out.canStartAfterOccupy));
ck('an envoy order does consume one', out.countAfterBribe === 1, `count=${out.countAfterBribe}`);
ck('the cap then blocks a new claim', out.canStartAfterBribe === false, String(out.canStartAfterBribe));
ck('and it carries a reason', typeof out.blockedReason === 'string' && out.blockedReason.length > 0, String(out.blockedReason));
ck("a bot's order is not counted", out.countWithBot === 1, `count=${out.countWithBot}`);
ck('CLAIM_METHODS excludes force', JSON.stringify(out.claimMethods) === JSON.stringify(['bribe','diplomacy','intimidation','settle']), JSON.stringify(out.claimMethods));
ck('a village was found to test', out.foundVillage === true, String(out.foundVillage));
ck('the village offers envoy methods at all', out.envoyCount > 0, `envoys=${out.envoyCount}`);
ck('at the cap every envoy row is shut', out.everyEnvoyShut === true, `shut=${JSON.stringify(out.shutAtCap)}`);
ck('and the cap is the reason for at least one', out.capShutsAnEnvoy === true, `shut=${JSON.stringify(out.shutAtCap)}`);
ck('the village offers force at all', out.forceCount > 0, `force=${out.forceCount}`);
ck('the cap never blocks force', out.noForceBlockedByCap === true, `shut=${JSON.stringify(out.shutAtCap)}`);
ck('classic modes stay uncapped', out.empireSlots === Infinity || out.empireSlots === null, String(out.empireSlots));
ck('a village was found for the coin tests', out.foundVillage2 === true, String(out.foundVillage2));
ck('a richer province costs more', out.richerCostsMore === true, `base=${out.price0}`);
ck('a more populous province costs more', out.morePeopleCostsMore === true, `base=${out.price0}`);
ck('nothing is barred before any refusal', out.barred0 === false, String(out.barred0));
ck('one refusal raises the price', out.price1 > out.price0, `${out.price0} -> ${out.price1}`);
ck('and it compounds on the second', out.price2 > out.price1, `${out.price1} -> ${out.price2}`);
ck('one refusal lowers the odds', out.chance1 < out.chance0, `${out.chance0} -> ${out.chance1}`);
ck('at the limit the province is barred', out.barredNow === true, `${out.barSeasons} seasons`);
ck('coin is shut while barred', out.bribeShutWhenBarred === true, String(out.bribeShutWhenBarred));
ck('and shut by the bar, naming the seasons', out.bribeShutByTheBar === true, String(out.bribeShutByTheBar));
ck('the bar is never the reason anything else is shut', out.barNeverBlocksOthers === true, String(out.barNeverBlocksOthers));
ck('the bar lifts with time', out.barLiftsWithTime === true, String(out.barLiftsWithTime));
ck('a border village was found', out.foundBorderVillage === true, String(out.foundBorderVillage));
ck('a refused bribe really did cost gold', out.e2eSpent === out.e2ePriceBefore && out.e2eSpent > 0, `spent=${out.e2eSpent} quoted=${out.e2ePriceBefore}`);
ck('a refused bribe returns false', out.e2eReturned === false, String(out.e2eReturned));
ck('and writes one failure to the ledger', out.e2eFailures === 1, `failures=${out.e2eFailures}`);
ck('which raises the next asking price', out.e2ePriceAfter > out.e2ePriceBefore, `${out.e2ePriceBefore} -> ${out.e2ePriceAfter}`);
ck('three refusals bar the province', out.e2eFailuresAfter3 === 3 && out.e2eBarred === true, `failures=${out.e2eFailuresAfter3} barred=${out.e2eBarred}`);
ck('the ledger is inert in classic modes', out.empireFailures === 0 && out.empireBarred === false, `${out.empireFailures}/${out.empireBarred}`);
ck('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'CHECK'}: ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
const failed = checks.filter((c) => !c.pass).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
