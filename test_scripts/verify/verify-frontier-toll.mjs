/**
 * Two rules that make a frontier and a veteran worth having.
 *
 * **The toll.** `findInvasionStep` is a hop-count BFS that ignores who owns the ground, and a
 * hostile column only ever fights a province it actually steps onto — so a host routed through the
 * neutral country beside a held frontier used to walk the length of the realm and arrive at the
 * capital at full strength with three garrisons watching it go past. `passingColumnLoss` puts a
 * price on that road: every leg completed on ground our provinces overlook costs the column men,
 * scaled by what those provinces could actually field, capped per leg and per campaign, and paid
 * for on our side in garrison turnout.
 *
 * **The wage settled in goods.** A realm out of coin loses a host in five seasons and the
 * bookkeeping takes the *smallest* one, which is rarely the one anybody would have chosen. A host
 * worth keeping — a veteran, or one that has been equipped — is now carried on the granaries
 * instead (`settleWagesInKind`), twice at most, for as many seasons as the court's stability can
 * promise. A fresh levy is not: that is the whole distinction the rule exists to draw.
 *
 *   node test_scripts/verify/verify-frontier-toll.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
const SEEDS = [1337, 4242, 99, 20260812];
const TICKS = 320;
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });

// ── the toll's arithmetic, read straight off the rule ─────────────────────────
const maths = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { passingColumnLoss } = await import('/src/systems/ascent/hostileMarch.ts');
  const { PLAYER_KINGDOM_ID } = await import('/src/game/constants.ts');
  const config = await import('/src/game/ascentConfig.ts');
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });

  // A neutral province with neighbours we can hand back and forth.
  const road = st.lands.find((land) => land.ownerId !== PLAYER_KINGDOM_ID && land.neighbors.length >= 2);
  const neighbours = road.neighbors.map((id) => st.lands.find((l) => l.id === id)).filter(Boolean);
  const owners = neighbours.map((land) => land.ownerId);
  neighbours.forEach((land) => { land.ownerId = 'neutral'; });
  const unwatched = passingColumnLoss(st, road, 1000, 0);

  // One province of ours beside it, lightly held, then walled and manned.
  const watcher = neighbours[0];
  watcher.ownerId = PLAYER_KINGDOM_ID;
  watcher.defense = 10;
  watcher.localSoldiers = 20;
  watcher.population = 400;
  const light = passingColumnLoss(st, road, 1000, 0);
  watcher.defense = 160;
  watcher.localSoldiers = 900;
  watcher.population = 4000;
  const heavy = passingColumnLoss(st, road, 1000, 0);
  // Who is marching changes the price. It must never change whether the road is open.
  const hardCharger = passingColumnLoss(st, road, 1000, 0, { personality: 'aggressive', plan: 'spearhead' });
  const careful = passingColumnLoss(st, road, 1000, 0, { personality: 'defensive', plan: 'raider' });
  const capped = passingColumnLoss(st, road, 1, 0);
  const spent = passingColumnLoss(st, road, 1, config.PASSING_CAMPAIGN_MAX - 0.01);
  const exhausted = passingColumnLoss(st, road, 1, config.PASSING_CAMPAIGN_MAX);
  neighbours.forEach((land, i) => { land.ownerId = owners[i]; });
  return {
    unwatched: unwatched.share,
    light: light.share,
    heavy: heavy.share,
    capped: capped.share,
    spent: spent.share,
    exhausted: exhausted.share,
    legMax: config.PASSING_LEG_MAX,
    campaignMax: config.PASSING_CAMPAIGN_MAX,
    watchers: heavy.watchers.length,
    exhaustionShare: heavy.spent,
    hardCharger: hardCharger.share,
    careful: careful.share,
  };
});
check('ground no province of ours overlooks is free to march', maths.unwatched === 0, String(maths.unwatched));
check('a held frontier costs a column men', maths.light > 0, `light ${maths.light.toFixed(3)}`);
check('and a walled, manned one costs it more', maths.heavy > maths.light,
  `light ${maths.light.toFixed(3)} vs heavy ${maths.heavy.toFixed(3)}`);
check('no single leg can take more than the leg cap', maths.capped <= maths.legMax + 1e-9,
  `${maths.capped.toFixed(3)} <= ${maths.legMax}`);
check('the campaign ceiling closes the toll',
  maths.spent > 0 && maths.spent <= 0.01 + 1e-9 && maths.exhausted === 0,
  `left ${maths.spent.toFixed(4)}, spent ${maths.exhausted}`);
check('the provinces that did it pay for it in turnout', maths.exhaustionShare > 0,
  `${maths.exhaustionShare.toFixed(4)} of a turnout per leg`);
check('a hard-driving court pays more for the same road than a careful one',
  maths.hardCharger > maths.careful && maths.careful > 0,
  `aggressive spearhead ${maths.hardCharger.toFixed(3)} vs defensive raider ${maths.careful.toFixed(3)}`);

// ── the toll in a real run ────────────────────────────────────────────────────
const runs = await page.evaluate(async ([seeds, ticks]) => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { PLAYER_KINGDOM_ID } = await import('/src/game/constants.ts');
  const pick = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'envoy': case 'famine': case 'rival-demand': case 'empire-response':
        return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'story-beat': return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
      default: return 'ok';
    }
  };
  const out = [];
  for (const seed of seeds) {
    let rng = seed >>> 0;
    Math.random = () => {
      rng = (rng + 0x6d2b79f5) | 0;
      let t = Math.imul(rng ^ (rng >>> 15), 1 | rng);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const bled = new Set();
    const contacted = new Set();
    let worst = 0;
    let overCap = 0;
    let arrivals = 0;
    let reachedDeep = 0;
    for (let tick = 0; tick < ticks; tick += 1) {
      advanceAscentTick(st);
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) resolveAscentPrompt(st, pick(st.pendingAscentPrompt));
      for (const record of st.invasions ?? []) {
        const share = record.passingLoss ?? 0;
        if (share > 0) bled.add(record.armyId);
        if (share > worst) worst = share;
        if (share > 0.3 + 1e-9) overCap += 1;
      }
      // A host that paid the toll and then reached a province of ours anyway: the toll is a
      // price on the march, and must never be able to hold a column off the realm.
      for (const land of st.lands) {
        if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
        if (!land.siege && !(st.ascent?.battles ?? []).some((b) => b.landId === land.id)) continue;
        for (const record of st.invasions ?? []) {
          if (!bled.has(record.armyId)) continue;
          const army = st.armies.find((a) => a.id === record.armyId);
          if (army && army.landId && land.neighbors.concat(land.id).includes(army.landId)
            && !contacted.has(record.armyId)) {
            contacted.add(record.armyId);
            reachedDeep += 1;
          }
        }
      }
      arrivals += (st.invasions ?? []).length > 0 ? 1 : 0;
    }
    out.push({
      seed,
      bled: bled.size,
      worst: Math.round(worst * 1000) / 1000,
      overCap,
      sawInvaders: arrivals > 0,
      wave: st.ascent?.wave ?? 0,
      reachedDeep,
    });
  }
  return out;
}, [SEEDS, TICKS]);
check('columns are bled on the road in a real run', runs.every((r) => r.bled > 0),
  runs.map((r) => `${r.seed}:${r.bled} hosts`).join(' '));
check('and never past the campaign ceiling', runs.every((r) => r.overCap === 0),
  runs.map((r) => `${r.seed}:${r.worst}`).join(' '));
check('the war still comes', runs.every((r) => r.sawInvaders && r.wave >= 3),
  runs.map((r) => `${r.seed}:w${r.wave}`).join(' '));
check('a column that ignores the frontier still gets where it was going',
  runs.every((r) => r.reachedDeep > 0),
  runs.map((r) => `${r.seed}:${r.reachedDeep} contacts past a watched province`).join(' '));

// ── wages settled in goods ────────────────────────────────────────────────────
const wages = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { progressArmyLogistics } = await import('/src/systems/WarSystem.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { PLAYER_KINGDOM_ID } = await import('/src/game/constants.ts');
  const { KIND_MAX_SETTLEMENTS } = await import('/src/game/ascentConfig.ts');
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  for (let i = 0; i < 30 && st.armies.length === 0; i += 1) advanceAscentTick(st);
  const template = st.armies[0];
  if (!template) return { error: 'no army to clone' };
  const home = st.lands.find((l) => l.ownerId === PLAYER_KINGDOM_ID) ?? st.lands[0];
  st.armies = st.armies.filter((a) => a.kingdomId !== PLAYER_KINGDOM_ID);
  const host = (id, level, elite) => {
    const army = {
      ...JSON.parse(JSON.stringify(template)),
      id,
      kingdomId: PLAYER_KINGDOM_ID,
      landId: home.id,
      name: id,
      isLevy: false,
      patron: undefined,
      generalHeroId: undefined,
      units: { spearmen: 400, archers: 150, heavyInfantry: 60 },
      morale: 70,
      supply: 70,
      rations: 400,
      provisions: 300,
      level,
      elite,
      experience: 0,
      experienceToNextLevel: 100,
      unpaidTicks: 0,
      inKindSeasons: undefined,
      inKindSettlements: undefined,
      refit: undefined,
    };
    st.armies.push(army);
    return army;
  };
  const veteran = host('veteran', 4, 1);
  const levy = host('levy', 1, 0);

  // Broke, but the granaries are full.
  st.resources.gold = 0;
  st.resources.supplies = 4000;
  st.resourceRates.gold = -30;
  st.court.stability = 90;
  const before = st.resources.supplies;
  progressArmyLogistics(st);
  const firstSeason = {
    veteranUnpaid: veteran.unpaidTicks ?? 0,
    levyUnpaid: levy.unpaidTicks ?? 0,
    settlements: veteran.inKindSettlements ?? 0,
    seasons: veteran.inKindSeasons ?? 0,
    goods: before - st.resources.supplies,
  };

  // Run it out: the grace, then the second settlement, then nothing.
  for (let season = 0; season < 14; season += 1) {
    st.resources.gold = 0;
    st.resourceRates.gold = -30;
    progressArmyLogistics(st);
  }
  const after = {
    settlements: veteran.inKindSettlements ?? 0,
    veteranUnpaid: veteran.unpaidTicks ?? 0,
    max: KIND_MAX_SETTLEMENTS,
  };

  // And with the granaries empty there is nothing to settle with.
  const poor = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  poor.armies = [{
    ...JSON.parse(JSON.stringify(veteran)),
    id: 'poor',
    unpaidTicks: 0,
    inKindSeasons: undefined,
    inKindSettlements: undefined,
    landId: poor.lands[0].id,
  }];
  poor.resources.gold = 0;
  poor.resources.supplies = 0;
  poor.resourceRates.gold = -30;
  progressArmyLogistics(poor);
  return { firstSeason, after, emptyStore: poor.armies[0].unpaidTicks ?? 0 };
});
check('a veteran host is carried on the granaries when the coin runs out',
  wages.firstSeason?.veteranUnpaid === 0 && wages.firstSeason?.settlements === 1,
  JSON.stringify(wages.firstSeason));
check('and the granaries are actually charged for it', (wages.firstSeason?.goods ?? 0) > 0,
  `${wages.firstSeason?.goods} supplies`);
check('a court that can promise it buys more than one season',
  (wages.firstSeason?.seasons ?? 0) >= 1, `stability 90 → ${wages.firstSeason?.seasons} more`);
check('a fresh levy is not carried', (wages.firstSeason?.levyUnpaid ?? 0) >= 1,
  `levy unpaid ${wages.firstSeason?.levyUnpaid}`);
check('the settlement runs out and the arrears clock restarts',
  wages.after?.settlements === wages.after?.max && (wages.after?.veteranUnpaid ?? 0) > 0,
  JSON.stringify(wages.after));
check('an empty store settles nothing', (wages.emptyStore ?? 0) >= 1, `unpaid ${wages.emptyStore}`);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the frontier takes its toll, and a veteran can be paid in rice'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
