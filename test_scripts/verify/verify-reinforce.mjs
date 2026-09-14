// Four reports, one round: the war screens' page turns, the relief control, the reinforcement
// dial, and the muster card's commander.
//
//   · *Chiến sự page crash sometime — I can do nothing.* A page turn inside the battle lane
//     (`replaceLanePage`) emptied the modal layer but left `battleUi` pointing at the destroyed
//     containers, with `openPromptKey` still `lane:battle`. `refresh` reads that key and calls
//     `updateBattle`, which rebuilt the dock, the exits and the relief plate into dead containers
//     — nothing drawn, and a fresh set of interactive zones registered with the input plugin every
//     time, invisible and stacked over the page that is on screen. Measured: ten orphans per turn,
//     with the battle clock still beating a full `refresh` against a screen that no longer exists.
//   · *In battle screen, fast reinforcement feature does not show any more.* The chip hid itself
//     when no host was free — which is precisely when the realm is fighting on every front.
//   · *Current reinforcement only 200 men; click, slide how much I want; as more as numbers it
//     will slower and cost more.*
//   · *If hero is in a army they must not create "Lập quân".*
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5233';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

// ── the dial and the commander: state only, no renderer ─────────────────────
console.log('=== THE DIAL AND THE COMMANDER ===');
const engine = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { getArmyUpgradeOptions, reinforcementLimit, reinforcementTicks, upgradeArmy } =
    await import('/src/systems/WarSystem.ts');
  const { findFreeCommander } = await import('/src/systems/ascent/AutopilotSystem.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st.pendingAscentPrompt = undefined;
  st.resources.gold = 9000;
  st.resources.humans = 4000;
  const army = st.armies.find((a) => a.kingdomId === PLAYER && !a.isLevy);
  const bill = (n) => {
    const row = getArmyUpgradeOptions(st, army.id, n).find((o) => o.kind === 'reinforce');
    return { men: row.gain, gold: row.cost.gold, humans: row.cost.humans, ticks: reinforcementTicks(row.gain) };
  };
  const small = bill(120);
  const big = bill(900);
  const dflt = bill(undefined);

  // The dial cannot be pushed past what the realm holds.
  st.resources.humans = 260;
  const cappedByPeople = reinforcementLimit(st);
  st.resources.humans = 4000;
  st.resources.gold = 110;
  const cappedByPurse = reinforcementLimit(st);
  st.resources.gold = 9000;

  // The order files a refit whose length is the count the player chose.
  const ok = upgradeArmy(st, army.id, 'reinforce', 750);
  const refit = army.refit ? { ...army.refit } : undefined;

  // ── the muster card's commander ──
  const st2 = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st2.pendingAscentPrompt = undefined;
  // A fresh run has exactly one champion — the king, at the head of the royal host — so the
  // fixture builds the case the report is about: a hero with no posting recorded who is
  // nonetheless standing with an army (`generalHeroId` alone, which is what a story writes).
  const hosted = st2.armies.find((a) => a.kingdomId === PLAYER && !a.isLevy);
  const free = st2.heroes[0];
  hosted.generalHeroId = free.id;
  free.assignedTo = undefined;
  const pickedGeneral = findFreeCommander(st2) === free.id;
  // With the host taken off him he is the natural choice again — the predicate reads the field,
  // not a stale flag.
  hosted.generalHeroId = undefined;
  const pickedWhenFree = findFreeCommander(st2) === free.id;

  // And a card already on the screen is dropped when its commander takes a host.
  const st3 = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const chosen = st3.heroes[0];
  chosen.assignedTo = undefined;
  st3.pendingAscentPrompt = {
    kind: 'muster-proposal',
    heroId: chosen.id,
    plan: {
      heroId: chosen.id, soldiers: 400, rations: 10, provisions: 10,
      composition: 'balanced', orders: { kind: 'auto' },
    },
    landId: st3.lands[0].id, ticks: 4, suppliesCost: 5, purpose: 'target',
  };
  const host3 = st3.armies.find((a) => a.kingdomId === PLAYER && !a.isLevy);
  host3.generalHeroId = chosen.id;
  drainAscentPrompts(st3);
  // Dropped, not merely re-sorted: whatever stands in the slot afterwards, it is not this card.
  // (A fresh run has its own queue, so the slot is rarely left empty.)
  const liveCardDropped = st3.pendingAscentPrompt?.kind !== 'muster-proposal';

  return {
    small, big, dflt, cappedByPeople, cappedByPurse, ok, refit,
    pickedGeneral, pickedWhenFree, liveCardDropped,
  };
});

check('the dial opens where the flat order used to sit', engine.dflt.men === 220,
  `${engine.dflt.men} men`);
check('a bigger call-up costs more gold', engine.big.gold > engine.small.gold,
  `${engine.small.gold} → ${engine.big.gold} for ${engine.small.men} → ${engine.big.men} men`);
check('and takes more people', engine.big.humans > engine.small.humans,
  `${engine.small.humans} → ${engine.big.humans}`);
check('and stands the host down for longer', engine.big.ticks > engine.small.ticks,
  `${engine.small.ticks} → ${engine.big.ticks} season(s)`);
check('220 men still takes the three seasons the flat order took', engine.dflt.ticks === 3,
  String(engine.dflt.ticks));
check('the dial stops at the people the realm has', engine.cappedByPeople === 260,
  String(engine.cappedByPeople));
// 110 gold at 0.55 a man is two hundred, give or take the floor.
check('and at what the treasury can pay the bounty on',
  engine.cappedByPurse >= 195 && engine.cappedByPurse <= 200, String(engine.cappedByPurse));
check('the order is taken', engine.ok === true);
check('and the refit it files is as long as the count chosen',
  engine.refit?.gain === 750 && engine.refit?.total === Math.ceil(750 / 75),
  `${engine.refit?.gain} men over ${engine.refit?.total} season(s)`);
check('a champion at the head of a host is never picked to raise another',
  engine.pickedGeneral === false);
check('and is picked again the moment he is off it', engine.pickedWhenFree === true);
check('and a muster card already up is dropped when its commander takes one',
  engine.liveCardDropped === true);

// ── the page turn, in the real lane ─────────────────────────────────────────
console.log('=== A PAGE TURN INSIDE THE BATTLE LANE ===');
await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);

const opened = await page.evaluate(async () => {
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = ui.state;
  ui.closeLane?.();
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  const foe = st.kingdoms.find((k) => k.id !== PLAYER);
  const host = (id, kingdomId, landId, men) => ({
    id, name: id, kingdomId, landId,
    units: { spearmen: men, archers: (men / 4) | 0, heavyInfantry: (men / 8) | 0 },
    morale: 80, supply: 80, rations: 80, provisions: 80, level: 1, experience: 0, experienceToNextLevel: 100,
  });
  const seat = st.lands.find((l) => l.id === st.ascent.capitalLandId);
  const a = st.lands.find((l) => l.id !== seat.id);
  const b = st.lands.find((l) => l.id !== seat.id && l.id !== a.id);
  a.ownerId = PLAYER;
  b.ownerId = PLAYER;
  st.armies = [];
  for (const [land, tag, men] of [[seat, 'seat', 520], [a, 'a', 340], [b, 'b', 240]]) {
    st.armies.push(host(`inv-${tag}`, foe.id, land.id, men), host(`def-${tag}`, PLAYER, land.id, 400));
  }
  const mk = (land, tag, delegated) => ({
    landId: land.id, landName: land.name, kingdomId: foe.id, kingdomName: foe.name,
    invaderArmyId: `inv-${tag}`, isGreat: false, round: 2, totalRounds: 400,
    stance: 'hold', theirStance: 'press', ourFormation: 'chong', theirFormation: 'chong',
    brokenHostIds: [], ourLostTotal: 0, ourStartMorale: 80, ourAdvance: 0.45, theirAdvance: 0.45,
    ourMorale: 70, theirMorale: 80, ourHostCount: 1, theirHostCount: 1,
    reserve: { spearmen: 0, archers: 0, heavyInfantry: 0 }, reserveSpent: true,
    rallySpent: true, rallyPower: 0, terrainEdge: 1, outcome: 'fighting',
    ourNow: 400, theirNow: 520, ourStart: 400, theirStart: 520,
    log: [], over: false, delegated, role: 'defence', approachBeats: 0,
    ourArmyIds: [`def-${tag}`], theirArmyIds: [`inv-${tag}`], key: `k-${land.id}`, beats: [],
  });
  st.ascent.activeBattle = mk(seat, 'seat', false);
  st.ascent.sideBattles = [mk(a, 'a', true), mk(b, 'b', true)];
  st.isPaused = false;
  st.isStrategyPause = false;
  ui.lastAutoOpenedBattleKey = st.ascent.activeBattle.key;
  ui.openLane('battle');
  return ui.openPromptKey;
});
check('the battle lane opens on the fight', opened === 'lane:battle', opened);
// The relief plate is built by the beat clock, not by the first frame.
await page.waitForTimeout(3200);

const beforeTurn = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const zones = [];
  const labels = [];
  const walk = (o) => {
    if (o.input?.enabled && o.type === 'Zone') zones.push(o);
    if (o.type === 'Text' && o.text) labels.push(o.text);
    if (Array.isArray(o.list)) o.list.forEach(walk);
  };
  (ui.battleUi?.relief?.list ?? []).forEach(walk);
  return { registered: (ui.input._list ?? ui.input.list ?? []).length, chips: zones.length, labels };
});
// Both corners of the field carry a chip: relief on ours, the other fronts on theirs. Every host
// of ours is standing in a line, which is exactly when the relief chip used to disappear.
check('the relief control stands even when no host is free', beforeTurn.chips >= 2,
  `${beforeTurn.chips} chip(s): ${beforeTurn.labels.join(' | ')}`);

await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const zones = [];
  const walk = (o) => {
    if (o.input?.enabled && o.type === 'Zone') zones.push(o);
    if (Array.isArray(o.list)) o.list.forEach(walk);
  };
  ui.battleUi.relief.list.forEach(walk);
  // The far corner is the other-fronts chip; two or more fields and it opens the war board.
  zones.sort((x, y) => y.x - x.x)[0]?.emit('pointerup', { id: 1, downTime: 0 });
});
await page.waitForTimeout(1500);

const turned = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const texts = [];
  const collect = (o) => {
    if (o.type === 'Text' && o.text) texts.push(o.text);
    if (Array.isArray(o.list)) o.list.forEach(collect);
  };
  ui.modalLayer.list.forEach(collect);
  return {
    key: ui.openPromptKey,
    battleUi: Boolean(ui.battleUi),
    clock: Boolean(ui.battleClock),
    registered: (ui.input._list ?? ui.input.list ?? []).length,
    onBoard: texts.some((x) => /Chiến sự|The war/i.test(x)),
  };
});
check('the fronts chip opens the war board', turned.onBoard === true);
check('and the fight is torn down with the page it was on', turned.battleUi === false);
check('its clock stops beating against a screen that is gone', turned.clock === false);
check('nothing of the fight is left registered with the input plugin',
  turned.registered <= beforeTurn.registered,
  `${beforeTurn.registered} → ${turned.registered}`);

// ── the board is about a war that moves ────────────────────────────────────
console.log('=== A BOARD DRAWN OVER A WAR THAT MOVES ===');
const stale = await page.evaluate(async () => {
  const board = await import('/src/scenes/conquest/screens/warBoard.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = ui.state;
  const read = () => {
    const texts = [];
    const collect = (o) => {
      if (o.type === 'Text' && o.text) texts.push(o.text.split(String.fromCharCode(10))[0]);
      if (Array.isArray(o.list)) o.list.forEach(collect);
    };
    ui.modalLayer.list.forEach(collect);
    return texts;
  };
  // Back to the board, with three fields live.
  ui.replaceLanePage(() => board.showWarBoard(ui));
  const before = read();
  const boardKeySet = ui.warBoardKey !== '';
  // A general settles the field the player is standing on while the board is up.
  const gone = st.ascent.activeBattle;
  gone.over = true;
  gone.outcome = 'they-rout';
  st.armies = st.armies.filter((a) => a.id !== gone.invaderArmyId);
  ui.refresh();
  const after = read();
  return {
    boardKeySet,
    goneName: gone.landName,
    listedBefore: before.some((x) => x.includes(gone.landName)),
    listedAfter: after.some((x) => x.includes(gone.landName)),
  };
});
check('the board stamps the war it was drawn from', stale.boardKeySet === true);
check('a field that has ended is on it before', stale.listedBefore === true, stale.goneName);
check('and off it the moment the fight is settled', stale.listedAfter === false,
  `${stale.goneName} still listed`);

// ── a page that breaks is still a page you can leave ───────────────────────
console.log('=== A LANE PAGE THAT THROWS MID-BUILD ===');
const broke = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.state.pendingAscentPrompt = undefined;
  ui.state.ascent.promptQueue = [];
  ui.closeLane?.();
  const real = ui.showArmyScreen.bind(ui);
  // Throw where a bad row would: after the frame and a row, before `finish()` adds Close.
  ui.showArmyScreen = () => {
    const { addRow } = ui.laneList('probe', 'probe', {});
    addRow({ title: 'a row', subtitle: 'then it breaks', border: 0x000000 });
    throw new Error('PROBE_LANE_THROW');
  };
  ui.openLane('army');
  ui.showArmyScreen = real;
  let close;
  const walk = (o) => {
    if (o.type === 'Text' && (o.text === 'Close' || o.text === 'Đóng')) close = o;
    if (Array.isArray(o.list)) o.list.forEach(walk);
  };
  ui.modalLayer.list.forEach(walk);
  return { key: ui.openPromptKey, hasClose: Boolean(close), modal: ui.modalLayer.length };
});
check('a half-built page is replaced, not left standing', broke.modal > 0 && broke.key === 'lane:army',
  `${broke.modal} objects, key ${broke.key}`);
check('and it carries the way out that the build never reached', broke.hasClose === true);
const left = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane();
  return { key: ui.openPromptKey, hold: ui.state.isStrategyPause };
});
check('closing it hands the world back', left.key === '' && left.hold === false, JSON.stringify(left));

// The throw is still reported — this is a floor under the player, not a way of not knowing.
const deliberate = errors.filter((e) => e.includes('PROBE_LANE_THROW'));
check('the failure is still shouted at the console', deliberate.length > 0);

const unexpected = errors.filter((e) => !e.includes('PROBE_LANE_THROW'));
check('no console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the lane turns cleanly, relief is always on the field, the call-up is a dial'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
