// Verifies the second round on Dragon Ascent's war screens. Three reports, three sections:
//
//   1. "Chien Su page really really bad — 'Tran Da Danh' not really need at all. And some battle
//      i can not click to it — really critical because some battle i still can not control."
//      Every contested province must be a door: a live field walks onto its ground, and anything
//      else opens a sheet that can stand a fight up there (`openFieldAt`).
//   2. "Battle result too bad UI/UX — stop using card everywhere: show heroe, show army info,
//      show result, show place clearly." The Reckoning must draw no card surfaces at all, and
//      must name the province, the commander and the count.
//   3. "IF multiple battle please pause the game — user need to managed it." A second field going
//      live stops the world and raises the board.
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
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

console.log('=== A FIELD THE PLAYER ASKS FOR ===');

const sys = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const {
    openFieldAt, fieldCandidateAt, beginBattle, delegateBattle,
  } = await import('/src/systems/ascent/BattleSystem.ts');
  const { liveBattles } = await import('/src/systems/ascent/fronts.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  let s = 90210 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // `supply`/`rations`/`provisions`, not `supplies` — the war system's own field names. A host
  // built with the wrong ones has no battle preview and `beginBattle` quietly declines it.
  const host = (id, kingdomId, landId, men) => ({
    id,
    name: id,
    kingdomId,
    landId,
    units: { spearmen: men, archers: Math.round(men / 3), heavyInfantry: Math.round(men / 6) },
    morale: 85,
    supply: 90,
    rations: 999,
    provisions: 999,
    level: 1,
    experience: 0,
    experienceToNextLevel: 120,
  });

  const build = () => {
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.pendingAscentPrompt = undefined;
    st.armies = st.armies.filter((a) => a.kingdomId === PLAYER);
    st.invasions = [];
    st.siegeOrders = [];
    return st;
  };

  // A besieged seat with no fight on it — the exact case with no door before this round.
  const st = build();
  const capitalId = st.ascent.capitalLandId;
  const capital = st.lands.find((l) => l.id === capitalId);
  const foe = st.kingdoms.find((k) => k.id !== PLAYER).id;
  const besieger = host('besieger-1', foe, capitalId, 700);
  st.armies.push(besieger, host('ours-1', PLAYER, capitalId, 500));
  st.siegeOrders.push({
    landId: capitalId,
    armyId: besieger.id,
    attackerKingdomId: foe,
    fromLandId: capital.neighbors[0],
    progress: 3,
    required: 6,
  });

  const candidate = fieldCandidateAt(st, capitalId)?.id;
  const watchedBefore = st.ascent.lastWatchedKey;
  const opened = openFieldAt(st, capitalId);
  const standing = st.ascent.activeBattle;

  // Nothing hostile anywhere near this one. (A run opens holding the seat alone, so the second
  // province has to be granted before it can be asked about — a land we do not own answers false
  // for a different reason and would prove nothing.)
  const quietLand = st.lands.find((l) => l.id !== capitalId && !capital.neighbors.includes(l.id))
    ?? st.lands.find((l) => l.id !== capitalId);
  quietLand.ownerId = PLAYER;
  const openedOnQuiet = openFieldAt(st, quietLand.id);

  // Asked for while another field is already under the player's hand: the new one takes the
  // focus, the old one steps back to a general, and no second-front alert is raised.
  const st2 = build();
  const cap2 = st2.ascent.capitalLandId;
  const foe2 = st2.kingdoms.find((k) => k.id !== PLAYER).id;
  const other = st2.lands.find((l) => l.id !== cap2);
  if (other) other.ownerId = PLAYER;
  st2.armies.push(host('b2', foe2, cap2, 600), host('o2', PLAYER, cap2, 400));
  st2.siegeOrders.push({
    landId: cap2,
    armyId: 'b2',
    attackerKingdomId: foe2,
    fromLandId: st2.lands.find((l) => l.id === cap2).neighbors[0],
    progress: 1,
    required: 6,
  });
  if (other) {
    st2.armies.push(host('b3', foe2, other.id, 300), host('o3', PLAYER, other.id, 300));
    openFieldAt(st2, other.id);
  }
  const firstLand = st2.ascent.activeBattle?.landId;
  openFieldAt(st2, cap2);

  // ── who holds the dials when a fight opens at the player rather than by them ──
  //
  // The standing order (`handToGenerals`, default on): a wave that lands on a province opens
  // under whoever is holding it, and the take-back chip is one tap. Reported as *by default in
  // conquest mode, fight will automatically control.*
  const auto = build();
  const autoCap = auto.ascent.capitalLandId;
  const autoFoe = auto.kingdoms.find((k) => k.id !== PLAYER).id;
  // Big enough to clear `worthWatching`'s floor against the seat's own walls — the gates are
  // measured and tuned, and a fixture that sneaks under them proves nothing about delegation.
  auto.armies.push(host('auto-inv', autoFoe, autoCap, 4000), host('auto-ours', PLAYER, autoCap, 400));
  // Enrolment reads the invasion register to decide who is closing on the province — a host with
  // no record against it is a neighbour standing on its own ground, not an attacker.
  (auto.invasions ??= []).push({
    armyId: 'auto-inv', kingdomId: autoFoe, targetLandId: autoCap, intent: 'conquest', plan: 'spearhead',
  });
  auto.pendingBattle = {
    invaderArmyId: 'auto-inv',
    landId: autoCap,
    landName: auto.lands.find((l) => l.id === autoCap).name,
    kingdomId: autoFoe,
    kingdomName: 'Foe',
    isGreat: false,
    attackerPower: 0,
    defenderPower: 0,
  };
  const autoOpened = beginBattle(auto);
  const autoDelegated = auto.ascent.activeBattle?.delegated === true;

  // ── a defence the odds roll would simply lose us ──
  //
  // Above the watch band, so the gates decline it: eight hundred against twelve on a province we
  // hold. It must open anyway, or the province changes hands with no field, no notice and
  // nothing to answer — the card the report arrived with.
  const doomed = build();
  const doomedLand = doomed.lands.find((l) => l.id !== doomed.ascent.capitalLandId);
  doomedLand.ownerId = PLAYER;
  doomedLand.localSoldiers = 12;
  const doomedFoe = doomed.kingdoms.find((k) => k.id !== PLAYER).id;
  doomed.armies.push(host('doom-inv', doomedFoe, doomedLand.id, 800));
  (doomed.invasions ??= []).push({
    armyId: 'doom-inv', kingdomId: doomedFoe, targetLandId: doomedLand.id,
    intent: 'conquest', plan: 'spearhead',
  });
  doomed.pendingBattle = {
    invaderArmyId: 'doom-inv',
    landId: doomedLand.id,
    landName: doomedLand.name,
    kingdomId: doomedFoe,
    kingdomName: 'Foe',
    isGreat: false,
    attackerPower: 0,
    defenderPower: 0,
  };
  const doomedOpened = beginBattle(doomed);
  const doomedLive = doomed.ascent.activeBattle?.landId === doomedLand.id;
  // …and the player's own answer is remembered for the next one.
  delegateBattle(auto, false);
  const afterTakeBack = auto.ascent.handToGenerals;

  return {
    autoOpened,
    autoDelegated,
    afterTakeBack,
    doomedOpened,
    doomedLive,
    candidate,
    opened,
    openedLand: standing?.landId,
    openedIsCapital: standing?.landId === capitalId,
    commanded: standing ? standing.delegated !== true : false,
    ourStart: standing?.ourStart ?? 0,
    theirStart: standing?.theirStart ?? 0,
    besiegerId: besieger.id,
    watchedUnspent: st.ascent.lastWatchedKey === watchedBefore,
    openedOnQuiet,
    firstLand,
    secondLand: st2.ascent.activeBattle?.landId,
    secondIsCapital: st2.ascent.activeBattle?.landId === cap2,
    handedBack: (st2.ascent.sideBattles ?? []).some((b) => b.landId === firstLand && b.delegated),
    liveAfter: liveBattles(st2).length,
    noAlert: st2.ascent.frontsOpened === undefined,
  };
});

check('a besieger under the walls is a candidate to be fought', sys.candidate === sys.besiegerId, `${sys.candidate}`);
check('the player can stand a field up on a besieged province', sys.opened === true && sys.openedIsCapital, `${sys.openedLand}`);
check('and it is theirs to command, not a general\'s', sys.commanded === true);
check('both sides are counted onto it', sys.ourStart > 0 && sys.theirStart > 0, `${sys.ourStart} v ${sys.theirStart}`);
check('a field asked for spends no wave ration', sys.watchedUnspent === true);
check('ground with nobody on it opens nothing', sys.openedOnQuiet === false);
check('a second field asked for takes the focus', sys.secondIsCapital === true, `${sys.firstLand} → ${sys.secondLand}`);
check('the field left behind goes to its general', sys.handedBack === true, `${sys.liveAfter} live`);
check('asking for a field raises no second-front alert', sys.noAlert === true);
check('a fight that opens AT the player opens under its general', sys.autoOpened === true
  && sys.autoDelegated === true, `opened=${sys.autoOpened} delegated=${sys.autoDelegated}`);
check('and taking it back is remembered for the next fight', sys.afterTakeBack === false);
check('a defence the odds would simply lose is never settled off-screen',
  sys.doomedOpened === true && sys.doomedLive === true,
  `opened=${sys.doomedOpened} live=${sys.doomedLive}`);

console.log('=== THE BOARD ===');

await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(700);

const board = await page.evaluate(async () => {
  const { battleAt } = await import('/src/systems/ascent/fronts.ts');
  const { contestedFronts } = await import('/src/systems/ascent/battleReport.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');
  const game = window.__phaserGame;
  const ui = game.scene.getScene('ConquestUIScene');
  const st = ui.state;
  ui.closeLane?.();
  st.pendingAscentPrompt = undefined;
  st.ascent.activeBattle = undefined;
  st.ascent.sideBattles = [];
  st.ascent.frontsOpened = undefined;
  st.ascent.battleHistory = [{
    turn: 1,
    key: 'past',
    landId: st.lands[0].id,
    landName: 'GHOST PROVINCE',
    role: 'defence',
    outcome: 'they-rout',
    rounds: 4,
    ourStart: 100, theirStart: 200, ourEnd: 90, theirEnd: 20,
    theirHosts: 1, ourHosts: 1, levyFought: false, delegated: true, wave: 1,
  }];

  const host = (id, kingdomId, landId, men) => ({
    id, name: id, kingdomId, landId,
    units: { spearmen: men, archers: 0, heavyInfantry: 0 },
    morale: 80, supplies: 100, level: 1, experience: 0, experienceToNextLevel: 100,
  });

  // Two provinces under pressure and no fight on either: before this round the board drew both
  // as text and neither could be pressed.
  const foe = st.kingdoms.find((k) => k.id !== PLAYER).id;
  const seat = st.lands.find((l) => l.id === st.ascent.capitalLandId)
    ?? st.lands.find((l) => l.ownerId === PLAYER);
  // The run opens holding the seat alone; a second province is granted so the board has two rows
  // to draw and the "every row is a door" check has something to prove.
  const second = st.lands.find((l) => l.id !== seat.id);
  second.ownerId = PLAYER;
  st.armies = st.armies.filter((a) => a.kingdomId === PLAYER);
  st.siegeOrders = [];
  st.armies.push(host('inv-a', foe, seat.id, 800), host('inv-b', foe, second.id, 300));
  st.armies.push(host('def-a', PLAYER, seat.id, 400), host('def-b', PLAYER, second.id, 350));
  st.siegeOrders.push({
    landId: seat.id, armyId: 'inv-a', attackerKingdomId: foe,
    fromLandId: seat.neighbors[0], progress: 2, required: 6,
  });

  const fronts = contestedFronts(st).length;

  const walk = (obj, out, dx = 0, dy = 0) => {
    const x = dx + (obj.x ?? 0);
    const y = dy + (obj.y ?? 0);
    if (obj.type === 'Text' && obj.text) out.texts.push(obj.text);
    const card = obj.getData?.('cardHeight');
    if (card != null) {
      out.cards.push({ tappable: (obj.list ?? []).some((c) => Boolean(c.input)) });
    }
    if (obj.input && obj.type === 'Rectangle') out.hits.push({ y: Math.round(y), obj });
    if (Array.isArray(obj.list)) obj.list.forEach((child) => walk(child, out, x, y));
  };
  const scan = () => {
    const out = { texts: [], cards: [], hits: [] };
    ui.modalLayer.list.forEach((o) => walk(o, out));
    return out;
  };

  ui.openLane('battle');
  const opened = ui.openPromptKey;
  const first = scan();
  const paused = st.isStrategyPause;

  // Tap the row for the besieged seat. Rows are `ui.card` containers with their own hit rect.
  const seatCard = first.cards.length;
  const rowHits = [];
  const collectRows = (obj) => {
    const card = obj.getData?.('cardHeight');
    if (card != null) {
      const hit = (obj.list ?? []).find((c) => Boolean(c.input));
      const label = (obj.list ?? []).find((c) => c.type === 'Text' && c.text);
      if (hit) rowHits.push({ hit, label: label?.text ?? '' });
    }
    if (Array.isArray(obj.list)) obj.list.forEach(collectRows);
  };
  ui.modalLayer.list.forEach(collectRows);
  const seatRow = rowHits.find((r) => r.label.includes(seat.name)) ?? rowHits[0];
  seatRow?.hit.emit('pointerup', { id: 1, downTime: 0 });

  const sheet = scan();
  const sheetNamesLand = sheet.texts.some((t) => t.includes(seat.name));

  // …and the order on that sheet stands a field up.
  const orders = [];
  const collectOrders = (obj) => {
    const card = obj.getData?.('cardHeight');
    if (card != null) {
      const hit = (obj.list ?? []).find((c) => Boolean(c.input));
      const label = (obj.list ?? []).find((c) => c.type === 'Text' && c.text);
      if (hit) orders.push({ hit, label: label?.text ?? '' });
    }
    if (Array.isArray(obj.list)) obj.list.forEach(collectOrders);
  };
  ui.modalLayer.list.forEach(collectOrders);
  const take = orders[0];
  take?.hit.emit('pointerup', { id: 2, downTime: 0 });

  const nowFighting = Boolean(battleAt(st, seat.id));
  const onField = ui.battleUi !== undefined;
  const running = !st.isStrategyPause && !st.isPaused;
  ui.closeLane();
  st.ascent.activeBattle = undefined;
  st.ascent.sideBattles = [];

  return {
    opened,
    fronts,
    rows: first.cards.length,
    tappable: first.cards.filter((c) => c.tappable).length,
    ghost: first.texts.some((t) => t.includes('GHOST PROVINCE')),
    ledger: first.texts.some((t) => /trận đã đánh|lately fought/i.test(t)),
    paused,
    seatName: seat.name,
    seatRowLabel: seatRow?.label ?? '',
    sheetNamesLand,
    orderLabel: take?.label ?? '',
    nowFighting,
    onField,
    running,
  };
});

check('the board opens for a realm under siege with no fight on it', board.opened === 'lane:battle');
check('it lists every contested province', board.rows >= board.fronts && board.fronts > 0,
  `${board.rows} rows for ${board.fronts} fronts`);
check('EVERY row is tappable', board.rows > 0 && board.tappable === board.rows,
  `${board.tappable}/${board.rows}`);
check('the finished-fight ledger is gone', !board.ledger && !board.ghost);
// Opened by hand rather than raised as an announcement, the board leaves the clock alone: the
// hold used to leak out through the battle lane and reopen running fights frozen mid-beat.
check('the board opened by hand does not stop the clock', board.paused === false);
check('a pressed province opens its own sheet', board.sheetNamesLand === true,
  `row "${board.seatRowLabel}"`);
check('the sheet can stand a field up on that ground', board.nowFighting === true,
  `order "${board.orderLabel}"`);
check('and it drops the player onto that field', board.onField === true);
check('the fight it drops them into is running, not frozen', board.running === true);

console.log('=== THE RECKONING ===');

const reck = await page.evaluate(() => {
  const game = window.__phaserGame;
  const ui = game.scene.getScene('ConquestUIScene');
  const st = ui.state;
  ui.closeLane?.();
  const hero = st.heroes[0];
  st.ascent.pendingAftermath = {
    record: {
      turn: 10,
      key: 'k',
      landId: st.lands[0].id,
      landName: st.lands[0].name,
      role: 'defence',
      outcome: 'they-rout',
      rounds: 6,
      ourStart: 727, theirStart: 960, ourEnd: 727, theirEnd: 575,
      theirHosts: 1, ourHosts: 1,
      levyFought: true,
      generalName: hero?.name,
      generalHeroId: hero?.id,
      kingdomName: 'Lãnh Chúa Phương Bắc',
      year: 2,
      delegated: true,
      wave: 1,
    },
    alsoFought: [{
      turn: 9, key: 'k2', landId: st.lands[1].id, landName: st.lands[1].name,
      role: 'defence', outcome: 'we-rout', rounds: 0,
      ourStart: 200, theirStart: 400, ourEnd: 0, theirEnd: 380,
      theirHosts: 1, ourHosts: 1, levyFought: false, delegated: true, wave: 1,
    }],
  };
  ui.openAftermath();

  const texts = [];
  const cards = [];
  let lowest = 0;
  const walk = (obj, dx, dy) => {
    const x = dx + (obj.x ?? 0);
    const y = dy + (obj.y ?? 0);
    if (obj.type === 'Text' && obj.text) {
      texts.push(obj.text);
      lowest = Math.max(lowest, y + (obj.height ?? 0));
    }
    if (obj.getData?.('cardHeight') != null) cards.push(1);
    if (Array.isArray(obj.list)) obj.list.forEach((child) => walk(child, x, y));
  };
  ui.modalLayer.list.forEach((o) => walk(o, 0, 0));
  const out = {
    texts,
    cards: cards.length,
    lowest: Math.round(lowest),
    height: game.scale.gameSize.height,
    land: st.lands[0].name,
    hero: hero?.name ?? '',
    elsewhere: st.lands[1].name,
  };
  ui.dismissAftermath();
  return out;
});

const said = (re) => reck.texts.some((t) => re.test(t));
check('the Reckoning uses no cards at all', reck.cards === 0, `${reck.cards} card surfaces`);
check('it names the place, large and first', reck.texts.some((t) => t.includes(reck.land)), reck.land);
check('it names who held the field', reck.texts.some((t) => t.includes(reck.hero)), reck.hero);
check('it prints the count as a table', said(/ra trận|marched/i) && said(/ngã xuống|^fell$/i)
  && said(/còn lại|left standing/i), reck.texts.slice(0, 12).join(' | '));
check('it still reports the fights fought elsewhere',
  reck.texts.some((t) => t.includes(reck.elsewhere)), reck.elsewhere);
check('nothing on it prints past the foot of the screen', reck.lowest <= reck.height,
  `lowest ${reck.lowest} of ${reck.height}`);

console.log('=== MORE THAN ONE FIELD ===');

const spread = await page.evaluate(async () => {
  const { addSideBattle } = await import('/src/systems/ascent/fronts.ts');
  const game = window.__phaserGame;
  const ui = game.scene.getScene('ConquestUIScene');
  const st = ui.state;
  ui.closeLane?.();
  st.pendingAscentPrompt = undefined;
  st.isStrategyPause = false;

  const mkField = (land) => ({
    landId: land.id,
    landName: land.name,
    kingdomId: st.kingdoms[1].id,
    kingdomName: st.kingdoms[1].name,
    invaderArmyId: `inv-${land.id}`,
    isGreat: false,
    round: 2,
    totalRounds: 20,
    stance: 'hold',
    theirStance: 'hold',
    ourFormation: 'chong',
    theirFormation: 'chong',
    brokenHostIds: [],
    ourLostTotal: 0,
    ourStartMorale: 80,
    ourAdvance: 0,
    theirAdvance: 0,
    ourMorale: 80,
    theirMorale: 80,
    ourHostCount: 1,
    theirHostCount: 1,
    reserve: { spearmen: 0, archers: 0, heavyInfantry: 0 },
    reserveSpent: true,
    rallySpent: true,
    rallyPower: 0,
    terrainEdge: 1,
    outcome: 'fighting',
    ourNow: 800, theirNow: 900, ourStart: 800, theirStart: 900,
    log: [],
    over: false,
    delegated: false,
    role: 'defence',
    approachBeats: 0,
    ourArmyIds: [],
    theirArmyIds: [],
    key: `k-${land.id}`,
  });

  const texts = [];
  const walk = (obj) => {
    if (obj.type === 'Text' && obj.text) texts.push(obj.text);
    if (Array.isArray(obj.list)) obj.list.forEach(walk);
  };

  // A second front while the player is *in* a fight: told, not frozen. Freezing a running
  // battle to announce another one is the stall reported as "fight stop in middle".
  const lands = st.lands.slice(0, 2);
  st.ascent.activeBattle = mkField(lands[0]);
  st.ascent.sideBattles = [];
  addSideBattle(st, mkField(lands[1]));
  const inFightPause = st.isStrategyPause;
  const inFightAlert = st.ascent.frontsOpened;
  ui.refresh();
  const inFightLane = ui.openPromptKey;
  const onFieldNotBoard = ui.battleUi !== undefined;
  const alertCleared = st.ascent.frontsOpened === undefined;
  const stillRunning = !st.isStrategyPause && !st.isPaused;
  ui.closeLane();

  // A second front with nobody on a field: *that* is when the board comes up and holds.
  st.ascent.activeBattle = undefined;
  st.ascent.sideBattles = [mkField(lands[0])];
  st.isStrategyPause = false;
  addSideBattle(st, mkField(lands[1]));
  const idlePause = st.isStrategyPause;
  ui.refresh();
  const idleLane = ui.openPromptKey;
  ui.modalLayer.list.forEach(walk);

  ui.closeLane();
  st.ascent.activeBattle = undefined;
  st.ascent.sideBattles = [];
  return {
    inFightPause, inFightAlert, inFightLane, onFieldNotBoard, alertCleared, stillRunning,
    idlePause, idleLane, texts,
  };
});

check('a second field is announced', spread.inFightAlert === 2, `frontsOpened=${spread.inFightAlert}`);
check('but it does NOT freeze a fight already under way', spread.inFightPause === false);
check('and the screen stays on the field, not on a list', spread.inFightLane === 'lane:battle'
  && spread.onFieldNotBoard === true);
check('the announcement is consumed, not re-raised every frame', spread.alertCleared === true);
check('the fight goes on running', spread.stillRunning === true);
check('with nobody on a field, the same news does stop the world', spread.idlePause === true);
check('and puts the board up to choose from', spread.idleLane === 'lane:battle');

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: every front is a door, the Reckoning is a report, and a spreading war stops the clock'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
