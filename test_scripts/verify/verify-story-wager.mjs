// Verifies the Chronicle's decision trees and the wager contract, on the story that is one.
//
// The general harness drives whole runs and reports what happened to turn up; this one walks
// `thanh-giong` deliberately, because the things worth asserting about a wager — that refusing is
// survivable, that the tag is stamped, and above all that paying for it *costs* something the
// muster can feel — are invisible unless you go and take each branch on purpose.
//
// Run against a dev server.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto((process.env.DEV_URL ?? 'http://127.0.0.1:5180') + '/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { storyTemplate } = await import('/src/data/stories/index.ts');
  const {
    resolveStoryBeat, storyDrift, storyParams,
  } = await import('/src/systems/story/StorySystem.ts');
  const { storyText } = await import('/src/i18n/story/index.ts');
  // Not 'player'. Filtering on the wrong id made a probe count a fake army while the verb
  // under test correctly removed a real one, and the check passed on both counts being 1.
  const { PLAYER_KINGDOM_ID: ME } = await import('/src/game/constants.ts');

  const out = {};
  const template = storyTemplate('thanh-giong');
  const { storyViolations, describeViolations } = await import('/src/systems/story/invariants.ts');
  const { STORY_BEAT_PRINTS } = await import('/src/ui/storyPrint.ts');

  // A realm losing badly enough that the story will look at it, with a live story planted by hand
  // so the walk starts from a known node rather than from whatever the seed roll produced.
  const build = (seed = 4242) => {
    let s = seed >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.resources.humans = 2000;
    st.resources.supplies = 1500;
    st.resources.gold = 1500;
    st.resources.food = 1500;
    const land = st.lands.find((l) => l.ownerId === ME && l.hasVillage) ?? st.lands.find((l) => l.ownerId === ME);
    const rival = st.kingdoms.find((k) => k.id !== ME);
    st.stories = [{
      id: 'walk', templateId: 'thanh-giong', cast: { landId: land.id, kingdomId: rival?.id },
      memory: {}, temperature: 0, seededTurn: st.turn, lastSpokeTurn: st.turn, spoken: [],
      node: 'tin-giac', path: ['tin-giac'], nodeSince: st.turn,
      names: { land: land.name, rival: rival?.name },
    }];
    return st;
  };

  const story = (st) => st.stories[0];
  const answer = (st, fragmentId, optionId) => resolveStoryBeat(st, 'walk', fragmentId, optionId);
  const fragment = (id) => template.fragments.find((f) => f.id === id);
  const bag = (st) => ({ food: st.resources.food, supplies: st.resources.supplies, gold: st.resources.gold });
  const spent = (before, after) => ({
    food: before.food - after.food, supplies: before.supplies - after.supplies, gold: before.gold - after.gold,
  });
  // Just wide enough for a fragment's `when` gate.
  const gateCtx = (st) => ({
    state: st, story: story(st), world: { waveIncoming: false }, node: () => story(st).node, said: () => true,
  });
  /** Two invading hosts on our soil, one holding a claim with the walls invested. */
  const invade = (st) => {
    const target = st.lands.find((l) => l.ownerId === ME);
    const rival = st.kingdoms.find((k) => k.id !== ME);
    const hosts = [1800, 900].map((size, i) => ({
      id: `invasion-test-${i}`, kingdomId: rival.id, name: 'Giặc', landId: target.id,
      units: { spearmen: Math.round(size * 0.6), archers: Math.round(size * 0.3), heavyInfantry: Math.round(size * 0.1) },
      morale: 90, supply: 80, rations: 100, provisions: 100, level: 1, experience: 0, experienceToNextLevel: 140,
    }));
    st.armies.push(...hosts);
    st.invasions = [...(st.invasions ?? []), ...hosts.map((h) => ({
      armyId: h.id, kingdomId: rival.id, intent: 'conquest', targetLandId: target.id, plan: 'spearhead',
    }))];
    st.siegeOrders.push({
      landId: target.id, armyId: hosts[0].id, attackerKingdomId: rival.id, fromLandId: target.neighbors[0] ?? target.id,
      progress: 1, required: 6, claimants: [hosts[0].id],
    });
    target.siege = { attackerId: hosts[0].id, kingdomId: rival.id, kingdomName: rival.name, ticksLeft: 2, ticks: 4 };
    return { target, soldiers: hosts.reduce((n, h) => n + h.units.spearmen + h.units.archers + h.units.heavyInfantry, 0) };
  };

  // ── The graph: the engine's own structural rules, on this story ───────────
  out.violations = describeViolations(storyViolations([template]));

  // ── The gate: much stronger, and rare even then ───────────────────────────
  {
    const st = build();
    st.ascent.threat = 1200; st.ascent.defensePower = 1000;
    Math.random = () => 0;
    out.gateWhenClose = template.seed(st) === undefined;
    st.ascent.threat = 4000;
    out.gateWhenMuchStronger = template.seed(st) !== undefined;
    Math.random = () => 0.99;
    out.gateRollDeclines = template.seed(st) === undefined;
    out.seedWeight = template.seedWeight;
    out.omen = template.omen === true;
  }

  // ── The record: call → X → 2X → the people → 3X gold → the ride → Sóc Sơn ─
  {
    const st = build();
    answer(st, 'loi-keu-goi', 'sai-su-gia');
    out.afterCall = story(st).node;
    const x = { food: story(st).memory.x_food, supplies: story(st).memory.x_supplies, gold: story(st).memory.x_gold };
    out.x = x;
    // X is a share of this realm's stores (14% of 1,500 = 210), not an authored literal.
    out.xScalesWithRealm = x.food === 210 && x.supplies === 210 && x.gold === 210;

    let before = bag(st);
    answer(st, 'lan-xin-thu-nhat', 'gui-gao-va-hang');
    out.first = spent(before, bag(st));
    out.afterFirst = story(st).node;

    // The card waits while the realm cannot pay it.
    const food = st.resources.food;
    st.resources.food = 10;
    out.secondClosedWhenPoor = !fragment('lan-xin-thu-hai').when(gateCtx(st));
    out.waitingWhisperOpen = fragment('no-van-nam-doi').when(gateCtx(st));
    st.resources.food = food;
    out.secondOpenWhenAble = fragment('lan-xin-thu-hai').when(gateCtx(st));

    before = bag(st);
    answer(st, 'lan-xin-thu-hai', 'gui-gap-doi');
    out.second = spent(before, bag(st));
    out.afterSecond = story(st).node;

    // A founding province sits at 100, which would hide the rise.
    for (const l of st.lands) if (l.ownerId === ME) l.loyalty = 50;
    const loyaltyBefore = st.lands.filter((l) => l.ownerId === ME).map((l) => l.loyalty);
    answer(st, 'ca-nuoc-nuoi-giong', 'ok');
    const loyaltyAfter = st.lands.filter((l) => l.ownerId === ME).map((l) => l.loyalty);
    out.peopleRaisedLoyalty = loyaltyAfter.every((v, i) => v >= loyaltyBefore[i]) && loyaltyAfter.some((v, i) => v > loyaltyBefore[i]);
    out.afterPeople = story(st).node;

    before = bag(st);
    answer(st, 'lan-xin-thu-ba', 'ren-ngua-sat');
    out.third = spent(before, bag(st));
    out.afterThird = story(st).node;
    out.driftOnRecord = storyDrift(story(st));

    // He does not ride down an empty road.
    out.noRideWithoutInvaders = !fragment('he-rides').when(gateCtx(st));
    const { target, soldiers } = invade(st);
    out.rideWithInvaders = fragment('he-rides').when(gateCtx(st));
    const slainBefore = st.campaignScore?.enemySoldiersSlain ?? 0;
    const repelledBefore = st.invasionsRepelled ?? 0;
    before = bag(st);
    answer(st, 'he-rides', 'ok');
    const after = bag(st);
    out.ride = {
      invasionsLeft: (st.invasions ?? []).length,
      invaderArmiesLeft: st.armies.filter((a) => a.id.startsWith('invasion-test-')).length,
      claimsLeft: st.siegeOrders.filter((o) => o.landId === target.id && o.attackerKingdomId !== ME).length,
      wallClock: target.siege,
      slain: (st.campaignScore?.enemySoldiersSlain ?? 0) - slainBefore,
      soldiers,
      repelled: (st.invasionsRepelled ?? 0) - repelledBefore,
      returned: { food: after.food - before.food, supplies: after.supplies - before.supplies },
      gaveFood: out.first.food + out.second.food,
      gaveSupplies: out.first.supplies + out.second.supplies,
    };
    out.afterRide = story(st).node;
    answer(st, 'soc-son-khong-xuong-nua', 'ok');
    out.recordEnded = (st.stories ?? []).length === 0;
    out.recordEntry = (st.chronicle ?? []).map((e) => `${e.fragmentId}:${e.historicity}`);
  }

  // ── Refusing each ask: the further you went, the more stopping costs ──────
  {
    const st = build();
    answer(st, 'loi-keu-goi', 'sai-su-gia');
    const before = bag(st);
    answer(st, 'lan-xin-thu-nhat', 'tre-con-la-tre-con');
    out.refuseFirst = { node: story(st).node, drift: storyDrift(story(st)), spent: spent(before, bag(st)) };
    answer(st, 'me-dua-be-len-kinh', 'cho-ba-ve');
    out.refuseFirst.end = story(st).node;
  }
  {
    const st = build();
    answer(st, 'loi-keu-goi', 'sai-su-gia');
    answer(st, 'lan-xin-thu-nhat', 'gui-gao-va-hang');
    answer(st, 'lan-xin-thu-hai', 'dung-lai');
    out.refuseSecond = { node: story(st).node, givenFood: story(st).memory.gave_food };
    answer(st, 'nua-chung', 'ok');
    out.refuseSecond.end = story(st).node;
  }
  {
    const st = build();
    answer(st, 'loi-keu-goi', 'sai-su-gia');
    answer(st, 'lan-xin-thu-nhat', 'gui-gao-va-hang');
    answer(st, 'lan-xin-thu-hai', 'gui-gap-doi');
    answer(st, 'ca-nuoc-nuoi-giong', 'ok');
    answer(st, 'lan-xin-thu-ba', 'khong-con-vang');
    out.refuseGold = { node: story(st).node };
    invade(st);
    answer(st, 'ra-di-tay-khong', 'de-no-di');
    answer(st, 'nhung-cay-tre-dang-nga', 'ok');
    out.refuseGold.invadersLeft = (st.invasions ?? []).length;
    out.refuseGold.ended = (st.stories ?? []).length === 0;
  }

  // ── Nobody was called: the war without a miracle ─────────────────────────
  {
    const st = build();
    answer(st, 'loi-keu-goi', 'ta-co-quan-roi');
    out.divergedNode = story(st).node;
    out.divergedDrift = storyDrift(story(st));
    answer(st, 'danh-the-nao', 'giu-ai');
    answer(st, 'dot-kho-hay-cat-duong', 'dot-kho-truoc-mat-chung');
    out.refusalNode = story(st).node;
    answer(st, 'tu-lo-lay-duoc', 'ok');
    out.refusalEntry = (st.chronicle ?? []).map((e) => `${e.fragmentId}:${e.historicity}`);
  }

  // ── Every ending has prose; every card and blow has its words; prints map to real beats ──
  {
    const st = build();
    const params = storyParams(st, story(st));
    const missing = (key) => storyText(key, params) === key;
    out.endingsMissingProse = template.nodes
      .filter((n) => n.terminal)
      .map((n) => template.fragments.find((f) => f.terminal && f.in?.includes(n.id)))
      .filter(Boolean)
      .map((f) => `thanh-giong.${f.id}.chronicle`)
      .filter(missing);
    out.endingCount = template.nodes.filter((n) => n.terminal).length;
    const keys = [];
    for (const f of template.fragments) {
      if (f.volume === 'whisper') keys.push(`${f.id}.line`, `${f.id}.scene`);
      else keys.push(`${f.id}.title`, `${f.id}.body`);
      for (const o of f.options ?? []) keys.push(`${f.id}.${o.id}`);
    }
    for (const n of template.nodes) keys.push(`node.${n.id}`);
    out.wordsMissing = { vi: keys.map((k) => `thanh-giong.${k}`).filter(missing) };
    out.prints = Object.entries(STORY_BEAT_PRINTS)
      .filter(([key]) => key.startsWith('thanh-giong.'))
      .map(([key, print]) => ({ key, print, beat: fragment(key.split('.')[1])?.volume }));
  }

  // Tran Quoc Toan: the yes/no, and both sides going on.
  {
    const build2 = () => {
      let s = 909 >>> 0;
      Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
      st.resources.gold = 900; st.resources.supplies = 900; st.resources.humans = 2000;
      const land = st.lands.find((l) => l.ownerId === ME) ?? st.lands[0];
      st.stories = [{
        id: 'walk', templateId: 'orange', cast: { landId: land.id },
        memory: {}, temperature: 0, seededTurn: st.turn, lastSpokeTurn: st.turn, spoken: [],
        node: 'qua-cam', path: ['binh-than', 'qua-cam'], nodeSince: st.turn,
        names: { land: land.name },
      }];
      return st;
    };
    const st = build2();
    const s = () => st.stories[0];
    resolveStoryBeat(st, 'walk', 'juice-on-his-wrist', 'he-is-a-child');
    out.orangeNo = { node: s().node, drift: storyDrift(s()) };
    const armiesBefore = st.armies.length;
    resolveStoryBeat(st, 'walk', 'he-raises-his-banner', 'ok');
    out.orangeHost = st.armies.length - armiesBefore;
    resolveStoryBeat(st, 'walk', 'cong-nhan-hay-khong', 'de-tu-lo');
    out.orangeAfterTwo = s().node;

    const st2 = build2();
    const s2 = () => st2.stories[0];
    resolveStoryBeat(st2, 'walk', 'juice-on-his-wrist', 'admit-him');
    out.orangeYes = { node: s2().node, drift: storyDrift(s2()), heroes: st2.heroes.length };
    resolveStoryBeat(st2, 'walk', 'lam-gi-voi-cau-ta', 'giao-mot-quan');
    resolveStoryBeat(st2, 'walk', 'cau-xin-tien-phong', 'cho-di');
    out.orangeYesEnd = s2().node;
    // A terminal whisper fires on the next story tick rather than on the answer, so the
    // chronicle is legitimately still empty. What matters here is that the branch arrived at a
    // divergent ending node with the tag stuck to it.
    out.orangeYesDrift = storyDrift(s2());
  }

  // Ly Thuong Kiet: the lever actually removes the army from the map.
  {
    let s = 5150 >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.resources.gold = 900; st.resources.supplies = 900;
    const land = st.lands.find((l) => l.ownerId === ME) ?? st.lands[0];
    st.armies.push({
      id: 'main-host', kingdomId: ME, name: 'Chu Luc', landId: land.id,
      units: { spearmen: 900, archers: 300, heavyInfantry: 120 },
      morale: 100, supply: 80, rations: 200, provisions: 150,
      level: 2, experience: 0, experienceToNextLevel: 200,
    });
    st.stories = [{
      id: 'walk', templateId: 'tien-phat',
      cast: { landId: land.id, kingdomId: st.kingdoms.find((k) => k.id !== ME)?.id },
      memory: {}, temperature: 0, seededTurn: st.turn, lastSpokeTurn: st.turn, spoken: [],
      node: 'tin-bien', path: ['tin-bien'], nodeSince: st.turn, names: { land: land.name },
    }];
    const before = st.armies.filter((a) => a.kingdomId === ME).length;
    resolveStoryBeat(st, 'walk', 'danh-truoc-hay-doi', 'danh-truoc');
    const during = st.armies.filter((a) => a.kingdomId === ME).length;
    resolveStoryBeat(st, 'walk', 'dot-kho-roi-rut', 'dot-kho-va-ve');
    const after = st.armies.filter((a) => a.kingdomId === ME).length;
    out.lever = {
      node: st.stories[0].node, hostsBefore: before,
      hostsWhileAbroad: during, hostsAfter: after, sent: st.stories[0].memory.sent,
    };
    const st3 = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st3.stories = [{
      id: 'walk', templateId: 'tien-phat', cast: { landId: st3.lands[0].id },
      memory: {}, temperature: 0, seededTurn: 0, lastSpokeTurn: 0, spoken: [],
      node: 'tin-bien', path: ['tin-bien'], nodeSince: 0, names: {},
    }];
    resolveStoryBeat(st3, 'walk', 'danh-truoc-hay-doi', 'doi-chung-toi');
    resolveStoryBeat(st3, 'walk', 'co-thu-hay-chan-bien', 'chan-o-bien');
    resolveStoryBeat(st3, 'walk', 'chan-duoc-hay-vo', 'danh-chan');
    out.leverWait = { node: st3.stories[0].node, drift: storyDrift(st3.stories[0]) };
  }

  return out;
});

await browser.close();

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

console.log('\n=== THE GRAPH ===');
check('thanh-giong passes every structural rule', result.violations.length === 0, result.violations.join(' | '));

console.log('\n=== THE GATE ===');
check('an invasion only slightly stronger is not answered', result.gateWhenClose);
check('an invasion half again stronger is', result.gateWhenMuchStronger);
check('and even then the roll can decline', result.gateRollDeclines);
check('the lowest seed weight in the catalogue', result.seedWeight < 1.4, String(result.seedWeight));
check('an omen: seeded on its own gate, not by the draw', result.omen);

console.log('\n=== THE ASKS ===');
console.log(`     X = ${JSON.stringify(result.x)}`);
check('the call leads to the child', result.afterCall === 'su-gia', result.afterCall);
check('X is a share of this realm\'s stores', result.xScalesWithRealm, JSON.stringify(result.x));
check('the first ask takes X grain and X goods, no gold',
  result.first.food === result.x.food && result.first.supplies === result.x.supplies && result.first.gold === 0,
  JSON.stringify(result.first));
check('the card waits while the realm cannot pay', result.secondClosedWhenPoor && result.waitingWhisperOpen);
check('and opens once it can', result.secondOpenWhenAble);
check('the second ask is exactly twice the first',
  result.second.food === 2 * result.x.food && result.second.supplies === 2 * result.x.supplies && result.second.gold === 0,
  JSON.stringify(result.second));
check('the whole country feeding him raises loyalty', result.peopleRaisedLoyalty);
check('the third ask is three times X in gold', result.third.gold === 3 * result.x.gold && result.third.food === 0,
  JSON.stringify(result.third));
check('the record walks su-gia → xin-lan-hai → ca-lang-gop → ren-sat → ra-tran',
  [result.afterFirst, result.afterSecond, result.afterPeople, result.afterThird].join(',') === 'xin-lan-hai,ca-lang-gop,ren-sat,ra-tran',
  [result.afterFirst, result.afterSecond, result.afterPeople, result.afterThird].join(' → '));
check('the record stays chính sử', result.driftOnRecord === 'chinh-su', result.driftOnRecord);

console.log('\n=== THE RIDE ===');
check('he does not ride down an empty road', result.noRideWithoutInvaders);
check('he rides when they stand on our soil', result.rideWithInvaders);
check('every invading host is destroyed', result.ride.invasionsLeft === 0 && result.ride.invaderArmiesLeft === 0,
  `${result.ride.invasionsLeft} records, ${result.ride.invaderArmiesLeft} armies left`);
check('their claim and wall clock go with them', result.ride.claimsLeft === 0 && !result.ride.wallClock);
check('the dead are counted', result.ride.slain === result.ride.soldiers, `${result.ride.slain}/${result.ride.soldiers}`);
check('each host is booked as beaten', result.ride.repelled === 2, String(result.ride.repelled));
check('their baggage returns what the people gave',
  result.ride.returned.food >= result.ride.gaveFood && result.ride.returned.supplies >= result.ride.gaveSupplies,
  JSON.stringify(result.ride));
check('the ride ends at Sóc Sơn', result.afterRide === 'soc-son', result.afterRide);
check('the story retires when it ends', result.recordEnded);
check('the ending is stamped chính sử', result.recordEntry.some((e) => e.endsWith(':chinh-su')), result.recordEntry.join(' | '));

console.log('\n=== REFUSING EACH ASK ===');
check('refusing the first ask costs nothing and leaves the record',
  result.refuseFirst.node === 'khong-tin' && result.refuseFirst.drift === 'ngoai-truyen'
  && result.refuseFirst.spent.food === 0 && result.refuseFirst.spent.supplies === 0,
  JSON.stringify(result.refuseFirst));
check('and it still carries a decision and an ending', result.refuseFirst.end === 'lang-quen', result.refuseFirst.end);
check('refusing the second loses the first', result.refuseSecond.node === 'bo-do' && result.refuseSecond.givenFood > 0,
  JSON.stringify(result.refuseSecond));
check('and the village decides the rest', ['nguoi-khong-lo', 'bo-di'].includes(result.refuseSecond.end), result.refuseSecond.end);
check('refusing the gold sends a giant with bare hands', result.refuseGold.node === 'tay-khong', result.refuseGold.node);
check('who breaks half the invasion, not all of it', result.refuseGold.invadersLeft === 1 && result.refuseGold.ended,
  JSON.stringify(result.refuseGold));

console.log('\n=== NOBODY WAS CALLED ===');
check('refusing the call does not end the story', result.divergedNode === 'khong-goi', result.divergedNode);
check('leaving the record stamps ngoại truyện', result.divergedDrift === 'ngoai-truyen', result.divergedDrift);
check('the branch carries two more decisions', result.refusalNode === 'tu-lo-lay', result.refusalNode);
check('its ending is stamped ngoại truyện', result.refusalEntry.some((e) => e.endsWith(':ngoai-truyen')), result.refusalEntry.join(' | '));

console.log('\n=== WORDS AND PICTURES ===');
check(`all ${result.endingCount} endings have an annal line`, result.endingsMissingProse.length === 0, result.endingsMissingProse.join(', '));
check('every beat, option and step has its words', result.wordsMissing.vi.length === 0, result.wordsMissing.vi.join(', '));
check('seven moments have a print, each on a card or a blow',
  result.prints.length === 7 && result.prints.every((p) => ['card', 'blow'].includes(p.beat)),
  result.prints.map((p) => `${p.key}:${p.beat}`).join(', '));

console.log('\n=== TRAN QUOC TOAN - THE YES/NO ===');
check('NO keeps the record and raises the banner', result.orangeNo.node === 'la-co', result.orangeNo.node);
check('the banner is a real host you did not ask for', result.orangeHost === 1, String(result.orangeHost));
check('the record carries two more decisions', result.orangeAfterTwo === 'co-rieng', result.orangeAfterTwo);
check('YES leaves the record', result.orangeYes.drift === 'ngoai-truyen', result.orangeYes.drift);
check('YES gives you a general history never gave you', result.orangeYes.heroes > 0, result.orangeYes.heroes + ' heroes');
check('and the branch keeps asking, twice more', result.orangeYesEnd === 'tuong-tre', result.orangeYesEnd);
check('and its ending node is divergent', result.orangeYesDrift === 'ngoai-truyen', result.orangeYesDrift);

console.log('\n=== LY THUONG KIET - THE LEVER SPENDS THE ARMY ===');
console.log('     hosts: ' + result.lever.hostsBefore + ' -> ' + result.lever.hostsWhileAbroad + ' while abroad -> ' + result.lever.hostsAfter + ' home');
check('striking first removes the host from the map', result.lever.hostsWhileAbroad < result.lever.hostsBefore, result.lever.sent + ' soldiers committed');
check('withdrawing brings it back', result.lever.hostsAfter > result.lever.hostsWhileAbroad);
check('the record reaches the river line', result.lever.node === 'nhu-nguyet', result.lever.node);
check('waiting is a full campaign, not a shrug', result.leverWait.node === 'chan-duoc', result.leverWait.node);


console.log('\n=== CONSOLE ===');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the tree branches, the tag sticks, and the wager costs what it claims to'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
