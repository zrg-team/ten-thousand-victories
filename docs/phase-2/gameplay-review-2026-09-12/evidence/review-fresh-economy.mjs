/**
 * Economy probe: what the opening asks of a realm, what a late treasury can still buy, and how
 * much a player who reads the land (focus by aptitude, governors, disciplined claims and spending)
 * gains over one who taps the first option.
 *
 * Prints, does not assert. Policies (`--policies a,b,c`):
 *   engaged      options[0] everywhere (the funscore's engaged driver)
 *   disciplined  engaged, but refuses gold cards it cannot comfortably pay — spending skill only
 *   landwise     engaged spending + the land verbs a player who reads the map uses: focus by
 *                aptitude and need, governors posted, claims chosen by land value and made by hand
 *                from the Build lane, surplus sold through the markets
 *   steward      landwise + disciplined spending
 *   focused      engaged in every answer; the only difference is that each province is worked for
 *                the economic focus its ground suits best, set once — the focus lever in isolation
 *
 * The "skill premium" this round was measured with is `landwise` against `engaged`: the same
 * cards answered the same way, the only difference being the economic verbs.
 *
 * Usage: PLAYTEST_URL=http://127.0.0.1:5179 node test_scripts/diag/diag-economy-probe.mjs
 *          [--seeds 8] [--ticks 600] [--open 60] [--policies engaged,disciplined,steward] [--json out.json] [--quiet]
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { BASE_URL, ENGINE_BOOT, READ_OPTIONS } from '../../../../test_scripts/playtest/playtest-lib.mjs';

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const SEED_COUNT = Number(argOf('--seeds', 8));
const TICKS = Number(argOf('--ticks', 600));
const OPEN = Number(argOf('--open', 60));
const JSON_OUT = argOf('--json', null);
const POLICIES = String(argOf('--policies', 'engaged,landwise,steward')).split(',');
const QUIET = process.argv.includes('--quiet');
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 11 + i * 11);
const SAMPLES = [10, 20, 30, 40, 60, 80, 120, 160, 200, 300, 400, 500, 600];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const results = await page.evaluate(async ({ seeds, ticks, open, samples, policies }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const { buildResponseOptions } = await import('/src/systems/ascent/WaveDirector.ts');
  const { buildEnvoyOptions } = await import('/src/systems/ascent/EnvoySystem.ts');
  const { rerollPriceFor } = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { musterCost, musterLimit, getArmyUpgradeOptions, armyPower } = await import('/src/systems/WarSystem.ts');
  const { getGoldBribeCost, getDiplomacySuppliesCost, getBribeSuccessChance } = await import('/src/systems/AcquisitionSystem.ts');
  const {
    getBuildOptions, getUpgradeOptions, getLandAptitude, getLandSpecialization, setLandSpecialization, refreshAllLandOutputs,
  } = await import('/src/systems/ResourceSystem.ts');
  const { assignHeroToLand } = await import('/src/systems/CourtSystem.ts');
  const { restoreBill } = await import('/src/systems/ascent/RestoreSystem.ts');
  const { grainAmount, grainCost } = await import('/src/systems/ascent/FamineSystem.ts');
  const { contestedDefencePower } = await import('/src/systems/ascent/PowerSystem.ts');
  const { buildAllConquestTargets, executeConquestMethod } = await import('/src/systems/ascent/ConquestSystem.ts');
  const { canStartClaim } = await import('/src/systems/AcquisitionSystem.ts');
  const { saleQuote, sellStores, storeWasteFrom } = await import('/src/systems/ascent/GranarySystem.ts');

  const PLAYER = 'dai-viet';
  const NEUTRAL = 'neutral';
  const DOCTRINES = ['fortify', 'expand', 'enrich', 'arm'];
  const FOCUS_OF = { food: 'breadbasket', supplies: 'mining', gold: 'trade' };
  const ECON_EDICTS = ['land-survey', 'meritocracy', 'public-works', 'agrarian-focus', 'coin-reform', 'granary-network', 'spoils-doctrine', 'frontier-markets', 'census', 'tribute-system', 'golden-age'];

  const size = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;

  const play = async (seed, seedIndex, policy) => {
    localStorage.clear(); const state = await window.__ptBoot(seed);
    const seenInvaders = new Set();
    const spawns = [];
    const battles = [];
    const cards = [];
    const timeline = [];
    const prices = [];
    const lastFocusTurn = {};
    let focusChanges = 0;
    let governorsPosted = 0;
    let handClaims = 0;
    let handSales = 0;
    let goldFromSales = 0;
    let engagementsSeen = 0;
    let over = false;
    let landsPeak = 0;
    let goldPeak = 0;
    let goldSum = 0;
    let tick = 0;

    const owned = () => state.lands.filter((l) => l.ownerId === PLAYER);
    const neighbours = () => {
      const mine = new Set(owned().map((l) => l.id));
      const seen = new Set();
      const out = [];
      for (const land of owned()) {
        for (const id of land.neighbors) {
          if (mine.has(id) || seen.has(id)) continue;
          seen.add(id);
          const n = state.lands.find((l) => l.id === id);
          if (n) out.push(n);
        }
      }
      return out;
    };
    const runway = (stock, rate) => (rate >= 0 ? Infinity : Math.max(0, stock) / Math.max(1, -rate));
    const needWeights = () => {
      const r = state.resourceRates; const h = state.resources;
      const need = { food: 1, supplies: 0.9, gold: 1.1 };
      for (const k of ['food', 'supplies', 'gold']) {
        const s = runway(h[k], r[k]);
        if (s <= 3) need[k] *= 4; else if (s <= 10) need[k] *= 2;
      }
      if (r.gold > 0 && h.gold > r.gold * 25) need.gold *= 0.5;
      if (r.food > 8 && h.food > 300) need.food *= 0.6;
      return need;
    };
    /** Land value as a steward reads it: best need-weighted economic aptitude, plus people. */
    const landValue = (land, need) => {
      const apt = getLandAptitude(land);
      let best = 0;
      for (const [k, f] of Object.entries(FOCUS_OF)) best = Math.max(best, apt[f] * need[k]);
      return best + (land.hasVillage ? 0.35 : 0) + Math.min(0.3, (land.population ?? 0) / 1000);
    };

    const stewardTick = () => {
      const need = needWeights();
      // 1 · Focus: every province works the ground it suits, for the thing the realm is short of.
      for (const land of owned()) {
        const apt = getLandAptitude(land);
        let best = null; let bestScore = 0;
        for (const [k, f] of Object.entries(FOCUS_OF)) {
          const sc = apt[f] * need[k];
          if (sc > bestScore) { bestScore = sc; best = f; }
        }
        const cur = getLandSpecialization(land);
        if (!best || cur === best || apt[best] < 0.36) continue;
        const curKey = Object.keys(FOCUS_OF).find((k) => FOCUS_OF[k] === cur);
        const curScore = curKey ? apt[cur] * need[curKey] : 0;
        if (bestScore > curScore * 1.25 && state.turn - (lastFocusTurn[land.id] ?? -99) >= 6) {
          if (setLandSpecialization(state, land.id, best)) { lastFocusTurn[land.id] = state.turn; focusChanges += 1; }
        }
      }
      // 2 · Governors: idle champions to the richest ungoverned province — keeping the best
      //     general free so the muster card still has a commander to propose.
      const commanding = new Set(state.armies.map((a) => a.generalHeroId).filter(Boolean));
      const idle = state.heroes
        .filter((h) => !h.assignedTo && !commanding.has(h.id) && !state.recruitmentOrders.some((o) => o.heroId === h.id))
        .sort((a, b) => b.stats.martial - a.stats.martial);
      const spare = idle.slice(1); // the best martial stays free
      const ungoverned = owned()
        .filter((l) => !state.heroes.some((h) => h.assignedTo === l.id))
        .sort((a, b) => (b.outputs.gold + b.outputs.food + b.outputs.supplies) - (a.outputs.gold + a.outputs.food + a.outputs.supplies));
      for (const land of ungoverned) {
        const hero = spare.sort((a, b) => b.stats.administration - a.stats.administration).shift();
        if (!hero) break;
        if (assignHeroToLand(state, hero.id, land.id)) governorsPosted += 1;
      }
      if (focusChanges || governorsPosted) refreshAllLandOutputs(state);
      // 3 · Claims by hand, from the Build lane: the best-value neighbour with a certain or cheap
      //     way in, whenever a claim party is free. What a player who reads the land does between
      //     cards rather than waiting for the court to propose a province.
      if (tick % 4 === 0 && !state.pendingAscentPrompt && canStartClaim(state)
        && state.resources.gold >= 40 && !(state.resources.food < 60 && state.resourceRates.food < 0)) {
        const targets = buildAllConquestTargets(state)
          .map((tg) => ({ tg, land: state.lands.find((l) => l.id === tg.landId) }))
          .filter((x) => x.land)
          .map((x) => ({ ...x, value: landValue(x.land, need) }))
          .sort((a, b) => b.value - a.value);
        for (const { tg, land } of targets) {
          const open = tg.methods.filter((m) => !m.blockedReason);
          const pick = ['settle', 'occupy', 'diplomacy', 'bribe', 'intimidation'].find((m) => open.some((o) => o.method === m
            && (m !== 'bribe' || (getBribeSuccessChance(state, land) >= 0.5 && getGoldBribeCost(state, land) <= state.resources.gold * 0.6))));
          if (!pick) continue;
          const result = executeConquestMethod(state, land.id, pick);
          if (result.attempted) { handClaims += 1; break; }
        }
      }
      // 4 · The stores: sell whatever stands above the waste line, by hand, every season.
      for (const key of ['food', 'supplies']) {
        const quote = saleQuote(state, key);
        if (quote.blocked) continue;
        if (state.resources[key] > storeWasteFrom(state, key) * 0.8) {
          const before = state.resources.gold;
          if (sellStores(state, key)) { handSales += 1; goldFromSales += state.resources.gold - before; }
        }
      }
    };

    const share = (cost) => (state.resources.gold > 0 ? cost / state.resources.gold : Infinity);
    const seasons = (cost) => (state.resourceRates.gold > 0 ? cost / state.resourceRates.gold : Infinity);

    /** Spending discipline: refuse what the realm cannot comfortably pay. */
    const disciplinedPick = (prompt, options) => {
      const opt = (id) => (prompt.options ?? []).find((o) => o.id === id);
      const gold = (id) => opt(id)?.cost?.gold ?? 0;
      switch (prompt.kind) {
        case 'envoy': {
          if (options.includes('trade')) return 'trade';
          const rival = state.kingdoms.find((k) => k.id === prompt.kingdomId);
          if (options.includes('gift') && (rival?.relations ?? 50) < 38 && share(gold('gift')) <= 0.15) return 'gift';
          return 'ignore';
        }
        case 'rival-demand': {
          if (options.includes('pay') && share(gold('pay')) <= 0.25 && seasons(gold('pay')) <= 6) return 'pay';
          if (options.includes('buy-off') && share(gold('buy-off')) <= 0.25) return 'buy-off';
          if (options.includes('refuse')) return 'refuse';
          if (options.includes('defy')) return 'defy';
          return options[options.length - 1];
        }
        case 'empire-response': {
          const f = opt('fortify');
          if (f?.affordable && share(gold('fortify')) <= 0.3) return 'fortify';
          return options.includes('endure') ? 'endure' : options[0];
        }
        case 'famine': {
          for (const id of ['buy-grain', 'slaughter-herds', 'requisition', 'endure']) if (options.includes(id)) return id;
          return options[0];
        }
        case 'restore-land': {
          if (options.includes('haste') && share(gold('haste')) <= 0.12) return 'haste';
          if (options.includes('steady')) return 'steady';
          return options[options.length - 1];
        }
        case 'muster-proposal': return 'accept';
        case 'doctrine': return options.includes(DOCTRINES[seedIndex % 4]) ? DOCTRINES[seedIndex % 4] : options[0];
        default: return options[0];
      }
    };

    const stewardPick = (prompt, options) => {
      const need = needWeights();
      switch (prompt.kind) {
        case 'conquer-target': {
          // Discipline first: no claims into an empty purse or a starving granary.
          if (state.resources.gold < 40 || (state.resources.food < 60 && state.resourceRates.food < 0)) return 'hold';
          const ranked = prompt.targets
            .filter((t) => options.includes(t.landId))
            .map((t) => ({ id: t.landId, land: state.lands.find((l) => l.id === t.landId) }))
            .filter((t) => t.land)
            .map((t) => ({ ...t, value: landValue(t.land, need) }))
            .sort((a, b) => b.value - a.value);
          return ranked[0]?.id ?? 'hold';
        }
        case 'conquer-method': {
          const land = state.lands.find((l) => l.id === prompt.target.landId);
          const cheap = (id) => options.includes(id);
          if (cheap('settle')) return 'settle';
          if (cheap('occupy')) return 'occupy';
          if (cheap('diplomacy')) return 'diplomacy';
          if (cheap('bribe') && land && share(getGoldBribeCost(state, land)) <= 0.6 && getBribeSuccessChance(state, land) >= 0.5) return 'bribe';
          if (cheap('intimidation')) return 'intimidation';
          return 'back';
        }
        case 'law-choice': {
          for (const id of ECON_EDICTS) if (options.includes(`edict:${id}`)) return `edict:${id}`;
          const anyEdict = options.find((o) => o.startsWith('edict:'));
          return anyEdict ?? options[0];
        }
        case 'doctrine': {
          for (const id of ['enrich', 'expand']) if (options.includes(id)) return id;
          return options[0];
        }
        case 'province-order': {
          const focus = prompt.options.find((o) => o.role === 'focus');
          return focus ? focus.id : options[0];
        }
        default: return disciplinedPick(prompt, options);
      }
    };

    /** The land verbs of the steward, the spending of the naive player. */
    const landwisePick = (prompt, options) => {
      if (['conquer-target', 'conquer-method', 'law-choice', 'doctrine', 'province-order'].includes(prompt.kind)) return stewardPick(prompt, options);
      if (prompt.kind === 'muster-proposal') return 'accept';
      return options[0];
    };

    const priceSnapshot = () => {
      const ledger = state.ascentLedger;
      const villages = neighbours().filter((l) => l.ownerId === NEUTRAL && l.hasVillage);
      const bribes = villages.map((l) => getGoldBribeCost(state, l)).sort((a, b) => a - b);
      const diplo = villages.map((l) => getDiplomacySuppliesCost(state, l)).sort((a, b) => a - b);
      const capital = state.lands.find((l) => l.id === state.ascent.capitalLandId);
      const build = capital ? getBuildOptions(state, capital) : [];
      const farm = build.find((o) => o.type === 'farm');
      const tower = build.find((o) => o.type === 'tower');
      const upgrades = capital ? getUpgradeOptions(state, capital) : [];
      const hosts = state.armies.filter((a) => a.kingdomId === PLAYER && !a.isLevy && !a.patron).sort((a, b) => size(b) - size(a));
      const host = hosts[0];
      const refit = host ? getArmyUpgradeOptions(state, host) : [];
      const response = buildResponseOptions(state, Math.max(1, state.ascent.threat));
      const rival = state.kingdoms.find((k) => k.id !== PLAYER && !k.isDefeated);
      const envoy = rival ? buildEnvoyOptions(state, rival) : [];
      const cost = (opts, id) => opts.find((o) => o.id === id)?.cost?.gold ?? null;
      const limit = musterLimit(state);
      return {
        tick, turn: state.turn, wave: state.ascent.wave, level: state.ascent.level, lands: owned().length,
        gold: Math.round(state.resources.gold), food: Math.round(state.resources.food), supplies: Math.round(state.resources.supplies), humans: Math.round(state.resources.humans),
        goldGross: Math.round(ledger?.gold.gross ?? 0), goldNet: Math.round(state.resourceRates.gold), foodNet: Math.round(state.resourceRates.food), suppliesNet: Math.round(state.resourceRates.supplies),
        goldParts: ledger?.goldParts,
        reroll: rerollPriceFor(state.ascent.level),
        muster320: musterCost(state, 320).gold, musterLimit: limit, musterLimitGold: musterCost(state, limit).gold,
        bribeMin: bribes[0] ?? null, diploMin: diplo[0] ?? null,
        farm: farm?.cost?.gold ?? null, tower: tower?.cost?.gold ?? null,
        upg1: upgrades[0]?.cost?.gold ?? null,
        equip: refit.find((r) => r.kind === 'equip')?.cost?.gold ?? null,
        drill: refit.find((r) => r.kind === 'drill')?.cost?.gold ?? null,
        reinforce: refit.find((r) => r.kind === 'reinforce')?.cost?.gold ?? null,
        hostSize: host ? size(host) : 0,
        fortify: cost(response, 'fortify'), mercenary: cost(response, 'hire-mercenaries'), buyoff: cost(response, 'buy-off'),
        gift: cost(envoy, 'gift'), pact: cost(envoy, 'pact'), vassalize: cost(envoy, 'vassalize'),
        famineGrain: grainAmount(state), famineCost: grainCost(state),
        restoreCapital: capital ? (restoreBill(state, capital).gold ?? 0) : null,
        defence: Math.round(contestedDefencePower(state)), threat: Math.round(state.ascent.threat),
        warPurchases: state.ascent.warPurchases ?? 0,
      };
    };

    for (; tick < ticks; tick += 1) {
      if (state.isDefeated || over) break;
      const landsBefore = owned().length;
      advanceAscentTick(state);
      drainAscentPrompts(state);
      if (policy === 'steward' || policy === 'landwise') stewardTick();
      if (policy === 'focused') {
        // The one lever under test: every province works the ground it suits best, set once when
        // first held (or after the opening's own card has been answered), nothing else touched.
        for (const land of owned()) {
          if (lastFocusTurn[land.id] !== undefined) continue;
          const apt = getLandAptitude(land);
          const best = Object.values(FOCUS_OF).reduce((a, b) => (apt[b] > apt[a] ? b : a));
          if (apt[best] >= 0.36 && getLandSpecialization(land) !== best && setLandSpecialization(state, land.id, best)) focusChanges += 1;
          lastFocusTurn[land.id] = state.turn;
        }
        if (focusChanges) refreshAllLandOutputs(state);
      }

      for (const rec of state.invasions ?? []) {
        if (seenInvaders.has(rec.armyId)) continue;
        seenInvaders.add(rec.armyId);
        const army = state.armies.find((a) => a.id === rec.armyId);
        spawns.push({ tick, turn: state.turn, wave: state.ascent.wave, intent: rec.intent, plan: rec.plan, kingdom: rec.kingdomId, men: army ? size(army) : 0, power: army ? Math.round(armyPower(state, army)) : 0 });
      }
      const engagements = state.campaignScore?.engagements ?? 0;
      for (let i = engagementsSeen; i < engagements; i += 1) battles.push({ tick, turn: state.turn, wave: state.ascent.wave });
      engagementsSeen = engagements;

      const landsNow = owned().length;
      landsPeak = Math.max(landsPeak, landsNow);
      goldPeak = Math.max(goldPeak, state.resources.gold);
      goldSum += state.resources.gold;
      if (tick < open || tick % 10 === 0) {
        timeline.push({
          tick, turn: state.turn, wave: state.ascent.wave, ttw: state.ascent.ticksToWave, lands: landsNow,
          gold: Math.round(state.resources.gold), food: Math.round(state.resources.food), sup: Math.round(state.resources.supplies), hum: Math.round(state.resources.humans),
          gN: Math.round(state.resourceRates.gold), fN: Math.round(state.resourceRates.food), sN: Math.round(state.resourceRates.supplies),
          gross: Math.round(state.ascentLedger?.gold.gross ?? 0),
          hosts: state.armies.filter((a) => a.kingdomId === PLAYER && !a.isLevy && !a.patron).length,
          men: state.armies.filter((a) => a.kingdomId === PLAYER && !a.isLevy && !a.patron).reduce((s, a) => s + size(a), 0),
          inv: (state.invasions ?? []).length,
          lost: landsNow < landsBefore ? landsBefore - landsNow : 0,
        });
      }
      if (samples.includes(tick + 1)) prices.push(priceSnapshot());

      let guard = 0;
      while (state.pendingAscentPrompt && guard < 40) {
        guard += 1;
        const prompt = state.pendingAscentPrompt;
        const options = window.__ptOptions(state);
        if (!options || !options.length) break;
        if (prompt.kind === 'run-over') { over = true; break; }
        let pick = options[0];
        if (prompt.kind === 'doctrine' && policy === 'engaged') pick = options.includes(DOCTRINES[seedIndex % 4]) ? DOCTRINES[seedIndex % 4] : options[0];
        if (policy === 'disciplined') pick = disciplinedPick(prompt, options);
        if (policy === 'steward') pick = stewardPick(prompt, options);
        if (policy === 'landwise') pick = landwisePick(prompt, options);
        if (!options.includes(pick)) pick = options[0];
        const costGold = (prompt.options ?? []).find((o) => o.id === pick)?.cost?.gold ?? 0;
        cards.push({ tick, turn: state.turn, kind: prompt.kind, pick, gold: costGold, wave: state.ascent.wave });
        if (!resolveAscentPrompt(state, pick)) break;
        drainAscentPrompts(state);
      }
      state.isPaused = false;
    }
    if (!samples.includes(tick)) prices.push(priceSnapshot());
    window.__ptRestoreRandom();
    return {
      seed, policy, ticks: tick, died: !!state.isDefeated, waves: state.ascent.wavesSurvived, landsPeak, landsEnd: owned().length,
      goldPeak: Math.round(goldPeak), goldMean: Math.round(goldSum / Math.max(1, tick)), focusChanges, governorsPosted, handClaims, handSales, goldFromSales,
      foodEnd: Math.round(state.resources.food), suppliesEnd: Math.round(state.resources.supplies),
      spawns, battles, cards, timeline, prices,
    };
  };

  const out = {};
  for (const policy of policies) {
    out[policy] = [];
    let i = 0;
    for (const seed of seeds) out[policy].push(await play(seed, i++, policy));
  }
  return out;
}, { seeds: SEEDS, ticks: TICKS, open: OPEN, samples: SAMPLES, policies: POLICIES });

await browser.close();
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));

const pad = (v, n) => String(v ?? '-').padStart(n);
const mean = (rows, f) => {
  const vals = rows.map(f).filter((v) => typeof v === 'number' && Number.isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};
const r1 = (v) => (v == null ? '-' : (Math.round(v * 10) / 10).toString());
const at = (run, tk) => run.timeline.filter((r) => r.tick <= tk).pop();

console.log(`\n=== POLICY COMPARISON — ${SEED_COUNT} seeds × ${TICKS} ticks ===`);
console.log('policy       waves  ticks  landsPk landsEnd goldPk goldMean | @t40: lands gross gold food | @t80: lands gross gold food | @t150: lands gross gold food | opening hosts fights | focus gov claims sales saleGold | foodEnd supEnd');
for (const [policy, runs] of Object.entries(results)) {
  const col = (tk, f) => r1(mean(runs, (run) => { const r = at(run, tk); return r ? f(r) : null; }));
  const openHosts = mean(runs, (run) => run.spawns.filter((s) => s.tick < OPEN).length);
  const openFights = mean(runs, (run) => run.battles.filter((b) => b.tick < OPEN).length);
  console.log(`${policy.padEnd(12)} ${pad(r1(mean(runs, (r) => r.waves)), 5)} ${pad(r1(mean(runs, (r) => r.ticks)), 6)} ${pad(r1(mean(runs, (r) => r.landsPeak)), 7)} ${pad(r1(mean(runs, (r) => r.landsEnd)), 8)} ${pad(r1(mean(runs, (r) => r.goldPeak)), 6)} ${pad(r1(mean(runs, (r) => r.goldMean)), 8)} | ${pad(col(40, (r) => r.lands), 5)} ${pad(col(40, (r) => r.gross), 5)} ${pad(col(40, (r) => r.gold), 5)} ${pad(col(40, (r) => r.food), 5)} | ${pad(col(80, (r) => r.lands), 5)} ${pad(col(80, (r) => r.gross), 5)} ${pad(col(80, (r) => r.gold), 5)} ${pad(col(80, (r) => r.food), 5)} | ${pad(col(150, (r) => r.lands), 5)} ${pad(col(150, (r) => r.gross), 5)} ${pad(col(150, (r) => r.gold), 5)} ${pad(col(150, (r) => r.food), 5)} | ${pad(r1(openHosts), 5)} ${pad(r1(openFights), 6)} | ${pad(r1(mean(runs, (r) => r.focusChanges)), 5)} ${pad(r1(mean(runs, (r) => r.governorsPosted)), 3)} ${pad(r1(mean(runs, (r) => r.handClaims)), 6)} ${pad(r1(mean(runs, (r) => r.handSales)), 5)} ${pad(r1(mean(runs, (r) => r.goldFromSales)), 8)} | ${pad(r1(mean(runs, (r) => r.foodEnd)), 7)} ${pad(r1(mean(runs, (r) => r.suppliesEnd)), 6)}`);
}
for (const [policy, runs] of Object.entries(results)) {
  console.log(`  ${policy}: waves per seed ${runs.map((r) => r.waves).join(' ')}  | ticks ${runs.map((r) => r.ticks).join(' ')}`);
}

if (!QUIET) {
  const first = Object.values(results)[0];
  const firstName = Object.keys(results)[0];
  console.log(`\n=== OPENING (first ${OPEN} ticks) — policy ${firstName} ===`);
  for (const run of first) {
    const early = run.spawns.filter((s) => s.tick < OPEN);
    const fights = run.battles.filter((b) => b.tick < OPEN);
    const t = run.timeline.filter((r) => r.tick < OPEN);
    console.log(`\nseed ${run.seed}: ${run.ticks} ticks, waves ${run.waves}, lands peak ${run.landsPeak} end ${run.landsEnd}, gold peak ${run.goldPeak}`);
    console.log(`  hostile hosts: ${early.length}  (${early.map((s) => `t${s.turn}:${s.intent[0]}${s.men}m w${s.wave}`).join(', ')})   engagements: ${fights.length} at ${fights.map((b) => b.turn).join(',')}`);
    for (const tk of [0, 10, 20, 30, 40, 50, OPEN - 1]) {
      const r = t.find((x) => x.tick === tk) ?? t[t.length - 1];
      if (!r) continue;
      console.log(`   t${pad(r.turn, 3)} w${r.wave} lands ${r.lands} | gold ${pad(r.gold, 5)} (${pad(r.gN, 4)}, gross ${pad(r.gross, 4)}) food ${pad(r.food, 5)} (${pad(r.fN, 4)}) sup ${pad(r.sup, 4)} (${pad(r.sN, 3)}) hum ${pad(r.hum, 5)} | hosts ${r.hosts} men ${pad(r.men, 5)} inv ${r.inv}`);
    }
  }

  for (const [policy, runs] of Object.entries(results)) {
    console.log(`\n=== PRICE LEDGER — ${policy} (mean across seeds alive at the sample) ===`);
    const byTick = {};
    for (const run of runs) for (const p of run.prices) (byTick[p.tick] ??= []).push(p);
    console.log('tick  n wave lvl lands | gold  gross  net | reroll m320 mLimit(g)  bribe farm  twr upg1 equip drill reinf restore | fortify  merc buyoff | gift  pact vassal | famine | def  threat');
    for (const tick of Object.keys(byTick).map(Number).sort((a, b) => a - b)) {
      const rows = byTick[tick];
      if (rows.length < 2 && tick !== TICKS) continue;
      const a = (f) => { const v = mean(rows, f); return v == null ? '-' : Math.round(v); };
      console.log(`${pad(tick, 4)} ${pad(rows.length, 2)} ${pad(a((r) => r.wave), 4)} ${pad(a((r) => r.level), 3)} ${pad(a((r) => r.lands), 5)} | ${pad(a((r) => r.gold), 5)} ${pad(a((r) => r.goldGross), 5)} ${pad(a((r) => r.goldNet), 4)} | ${pad(a((r) => r.reroll), 6)} ${pad(a((r) => r.muster320), 4)} ${pad(a((r) => r.musterLimit), 6)}(${pad(a((r) => r.musterLimitGold), 5)}) ${pad(a((r) => r.bribeMin), 5)} ${pad(a((r) => r.farm), 4)} ${pad(a((r) => r.tower), 4)} ${pad(a((r) => r.upg1), 4)} ${pad(a((r) => r.equip), 5)} ${pad(a((r) => r.drill), 5)} ${pad(a((r) => r.reinforce), 5)} ${pad(a((r) => r.restoreCapital), 7)} | ${pad(a((r) => r.fortify), 7)} ${pad(a((r) => r.mercenary), 5)} ${pad(a((r) => r.buyoff), 6)} | ${pad(a((r) => r.gift), 4)} ${pad(a((r) => r.pact), 5)} ${pad(a((r) => r.vassalize), 6)} | ${pad(a((r) => r.famineCost), 6)} | ${pad(a((r) => r.defence), 4)} ${pad(a((r) => r.threat), 6)}`);
    }
  }

  console.log(`\n=== GOLD SPENT ON CARDS ===`);
  for (const [policy, runs] of Object.entries(results)) {
    const byKind = {};
    let total = 0;
    for (const run of runs) for (const c of run.cards.filter((c) => c.gold > 0)) { byKind[c.kind] = (byKind[c.kind] ?? 0) + c.gold; total += c.gold; }
    console.log(`${policy}: ${Math.round(total / runs.length)} gold per run — ${Object.entries(byKind).map(([k, v]) => `${k}:${Math.round(v / runs.length)}`).join(' ')}`);
  }
}
if (errors.length) console.log(`\n${errors.length} console errors — ${errors[0]}`);

