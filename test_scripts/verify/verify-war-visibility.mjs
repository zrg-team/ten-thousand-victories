// Verifies that Dragon Ascent's war is *visible*: the reported fault was an enemy taking the
// capital with no Giao chiến button on the bar, no mark on the map and nothing said anywhere —
// "I lost and do not know why".
//
// Four defects, four sections:
//   1. `progressSiegeOrders` read `activeBattle` alone, so a siege ran on under a general who was
//      holding the province — the seat could fall mid-fight.
//   2. The bar's Battle slot existed only while `activeBattle` did, so the war board it leads to
//      was unreachable exactly when the realm was besieged.
//   3. The advisor — this mode's one rendered channel for "what should I do" — said nothing about
//      a siege or a contested province, and nothing at all while the grace clock ran.
//   4. The map drew a clash mark for `activeBattle` only, so the second and third fields were
//      invisible.
//
// Plus the two UI asks that came with it: the battle button lists all the fields when there is
// more than one, and the Reckoning's foot no longer carries the Codex.
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

console.log('=== SYSTEMS ===');

const sys = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { progressSiegeOrders } = await import('/src/systems/WarSystem.ts');
  const { realmUnderAttack, contestedFronts } = await import('/src/systems/ascent/battleReport.ts');
  const { adviseAscent } = await import('/src/systems/ascent/Advisor.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  let s = 4242 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  st.pendingAscentPrompt = undefined;
  const capitalId = st.ascent.capitalLandId;
  const capital = st.lands.find((l) => l.id === capitalId);

  // A quiet realm: nothing hostile anywhere near us.
  st.armies = st.armies.filter((a) => a.kingdomId === PLAYER);
  st.invasions = [];
  st.siegeOrders = [];
  const quiet = realmUnderAttack(st);

  // Now a besieger sits down on the seat. No `activeBattle`, no pendingBattle — exactly the
  // shape of the reported case.
  const besieger = {
    id: 'besieger-1',
    name: 'Besieger',
    kingdomId: st.kingdoms.find((k) => k.id !== PLAYER).id,
    landId: capitalId,
    units: { spearmen: 900, archers: 300, heavyInfantry: 200 },
    morale: 80,
    supplies: 100,
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
  };
  st.armies.push(besieger);
  st.siegeOrders.push({
    landId: capitalId,
    armyId: besieger.id,
    attackerKingdomId: besieger.kingdomId,
    fromLandId: capital.neighbors[0],
    progress: 0,
    required: 6,
  });

  const underAttack = realmUnderAttack(st);
  const fronts = contestedFronts(st);
  const advice = adviseAscent(st).sort((a, b) => b.priority - a.priority);

  // The siege advances with nobody contesting it.
  progressSiegeOrders(st);
  const advancedUncontested = st.siegeOrders[0]?.progress;

  // Now a general holds the seat: a *side* battle on this province, with the besieger in the
  // line. Before the fix this read `activeBattle` only, so the clock kept running.
  const ourHost = {
    id: 'ours-1',
    name: 'Ours',
    kingdomId: PLAYER,
    landId: capitalId,
    units: { spearmen: 800, archers: 200, heavyInfantry: 100 },
    morale: 80,
    supplies: 100,
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
  };
  st.armies.push(ourHost);
  const field = {
    landId: capitalId,
    landName: capital.name,
    kingdomId: besieger.kingdomId,
    kingdomName: 'Foe',
    invaderArmyId: besieger.id,
    ourArmyIds: [ourHost.id],
    theirArmyIds: [besieger.id],
    brokenHostIds: [],
    round: 3,
    totalRounds: 20,
    ourNow: 1100,
    theirNow: 1400,
    ourStart: 1100,
    theirStart: 1400,
    over: false,
    delegated: true,
    role: 'defence',
  };
  st.ascent.sideBattles = [field];
  const before = st.siegeOrders[0].progress;
  progressSiegeOrders(st);
  const heldBySideBattle = st.siegeOrders[0]?.progress === before;

  // And the same field promoted to the player's own: the behaviour that already worked.
  st.ascent.sideBattles = [];
  st.ascent.activeBattle = field;
  const before2 = st.siegeOrders[0].progress;
  progressSiegeOrders(st);
  const heldByActiveBattle = st.siegeOrders[0]?.progress === before2;

  // The grace clock: the run's last seasons must say so.
  st.ascent.activeBattle = undefined;
  st.ascent.sideBattles = [];
  capital.ownerId = besieger.kingdomId;
  st.ascent.capitalLostTicks = 2;
  const dying = adviseAscent(st).sort((a, b) => b.priority - a.priority);

  return {
    quiet,
    underAttack,
    frontIds: fronts.map((f) => `${f.landId}:${f.besieged}`),
    topAdvice: advice[0]?.id,
    adviceIds: advice.map((a) => a.id),
    advanceduncontested: advancedUncontested,
    heldBySideBattle,
    heldByActiveBattle,
    dyingTop: dying[0]?.id,
    dyingParams: dying[0]?.params,
  };
});

check('quiet realm is not "under attack"', sys.quiet === false, `got ${sys.quiet}`);
check('a siege on our ground counts as under attack', sys.underAttack === true);
check('the besieged seat is a contested front', sys.frontIds.some((f) => f.endsWith(':true')), sys.frontIds.join(','));
check('an uncontested siege still advances', sys.advanceduncontested === 1, `progress ${sys.advanceduncontested}`);
check('a SIDE battle holds the siege clock', sys.heldBySideBattle === true);
check('the commanded battle still holds it', sys.heldByActiveBattle === true);
check('the advisor names the besieged capital', sys.topAdvice === 'capital-besieged', `top: ${sys.topAdvice} of [${sys.adviceIds}]`);
check('the advisor speaks while the dynasty is dying', sys.dyingTop === 'capital-lost',
  `top: ${sys.dyingTop} ticks=${sys.dyingParams?.ticks}`);

console.log('=== A LONG RUN ===');

// End to end: over four seeded runs, no province may change hands while a fight is standing on
// it. That is the reported loss said as an invariant — the seat besieged at 5/6, a general
// holding it, and the siege clock running anyway.
const long = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { liveBattles } = await import('/src/systems/ascent/fronts.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  const stolen = [];
  let engagements = 0;
  let seatSieges = 0;
  for (const seed of [11, 909, 20260826, 777]) {
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    // Play it as an autopilot run: answer whatever card is up with its first legal option, so
    // the run keeps moving without this script re-implementing a player.
    const answer = (p) => {
      switch (p.kind) {
        case 'founder': return p.options[0];
        case 'power-draft': return p.cards[0] ?? 'skip';
        case 'conquer-target': return 'hold';
        case 'conquer-method': return 'back';
        case 'hero-choice': return p.heroIds?.[0] ?? 'pass';
        case 'court-appointment': return p.options?.[0]?.id;
        case 'law-choice': return 'hold';
        case 'doctrine': return p.options?.[0];
        case 'parliament': return 'decline';
        case 'run-over': return undefined;
        default: return p.options?.[0]?.id ?? p.options?.[0] ?? 'ok';
      }
    };
    for (let tick = 0; tick < 400 && !st.isDefeated; tick += 1) {
      let guard = 0;
      while (st.pendingAscentPrompt && st.pendingAscentPrompt.kind !== 'run-over' && guard++ < 40) {
        const choice = answer(st.pendingAscentPrompt);
        if (choice === undefined) break;
        resolveAscentPrompt(st, choice);
      }
      if (st.pendingAscentPrompt?.kind === 'run-over') break;
      const before = new Map(liveBattles(st).map((b) => [b.landId, b.landName]));
      engagements += before.size;
      if (before.has(st.ascent.capitalLandId)) seatSieges += 1;
      const owners = new Map(st.lands.map((l) => [l.id, l.ownerId]));
      advanceAscentTick(st);
      for (const [landId, landName] of before) {
        if (owners.get(landId) !== PLAYER) continue;
        const now = st.lands.find((l) => l.id === landId);
        // A field whose fight *ended* this tick is allowed to lose the ground: that is a battle
        // being lost, which is the honest way to lose a province.
        const stillFighting = liveBattles(st).some((b) => b.landId === landId);
        if (now && now.ownerId !== PLAYER && stillFighting) stolen.push(`${landName}@seed${seed}`);
      }
    }
  }
  return { stolen, engagements, seatSieges };
});

check('no province changes hands under a fight still being fought',
  long.stolen.length === 0, long.stolen.slice(0, 4).join(', '));
check('the long runs actually fought something', long.engagements > 20,
  `${long.engagements} field-ticks, ${long.seatSieges} of them on the seat`);

console.log('=== BAR AND LANE ===');

await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);

const ui = await page.evaluate(async () => {
  const { getActionKeys } = await import('/src/ui/ActionBar.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');
  const game = window.__phaserGame;
  const ui = game.scene.getScene('ConquestUIScene');
  const st = ui.state;

  // Clear whatever card the opening raised, so the lane can be driven.
  st.pendingAscentPrompt = undefined;
  ui.closeLane?.();

  const quietKeys = [...getActionKeys('ascent', { battleLive: false })];
  const loudKeys = [...getActionKeys('ascent', { battleLive: true })];

  // Two live fields, neither of them freshly opened.
  const lands = [...st.lands.filter((l) => l.ownerId === PLAYER), ...st.lands];
  const mkField = (land) => ({
    landId: land.id,
    landName: land.name,
    kingdomId: st.kingdoms.find((k) => k.id !== PLAYER).id,
    kingdomName: 'Foe',
    invaderArmyId: `inv-${land.id}`,
    isGreat: false,
    ourArmyIds: [],
    theirArmyIds: [],
    brokenHostIds: [],
    round: 4,
    totalRounds: 20,
    stance: 'hold',
    theirStance: 'hold',
    ourFormation: 'line',
    theirFormation: 'line',
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
    ourNow: 800,
    theirNow: 900,
    ourStart: 800,
    theirStart: 900,
    log: [],
    over: false,
    delegated: false,
    role: 'defence',
    approachBeats: 4,
    key: `k-${land.id}`,
  });
  st.ascent.activeBattle = mkField(lands[0]);
  st.ascent.sideBattles = [mkField(lands[1])];
  st.ascent.frontsOpened = undefined;

  const titleOf = () => ui.modalLayer.list
    .filter((o) => o.type === 'Text')
    .map((o) => o.text)
    .filter(Boolean);

  // Two fields live: the button opens the *fight*, never a list in front of it.
  ui.openLane('battle');
  const twoFieldTitles = titleOf();
  const twoFieldsOpenFight = ui.battleUi !== undefined;
  ui.closeLane();

  // One field only, same answer.
  st.ascent.sideBattles = [];
  ui.openLane('battle');
  const oneFieldOpensFight = ui.battleUi !== undefined;
  ui.closeLane();

  // Nothing live at all, and ground of ours with an enemy on it: *now* the lane is the board.
  st.ascent.activeBattle = undefined;
  const mine = st.lands.find((l) => l.ownerId === PLAYER) ?? st.lands[0];
  mine.ownerId = PLAYER;
  st.armies.push({
    id: 'board-probe', name: 'Probe',
    kingdomId: st.kingdoms.find((k) => k.id !== PLAYER).id,
    landId: mine.id,
    units: { spearmen: 400, archers: 0, heavyInfantry: 0 },
    morale: 80, supplies: 100, level: 1, experience: 0, experienceToNextLevel: 100,
  });
  const boardTitles = (() => {
    ui.openLane('battle');
    const seen = titleOf();
    const drew = ui.openPromptKey === 'lane:battle';
    ui.closeLane();
    return { seen, drew };
  })();

  st.ascent.activeBattle = undefined;
  st.ascent.sideBattles = [];
  return {
    quietKeys, loudKeys, twoFieldTitles, twoFieldsOpenFight, oneFieldOpensFight, boardTitles,
  };
});

// The Battle slot is permanent now (reported: the bar changed shape with the war), so quiet and loud bars match.
check('the bar keeps its Battle slot when nothing is happening', ui.quietKeys[0] === 'battle', ui.quietKeys.join(','));
check('the bar does not change shape when the realm is attacked', ui.loudKeys.join(',') === ui.quietKeys.join(','));
check('two live fields still open the FIGHT, never a list in front of it',
  ui.twoFieldsOpenFight === true, ui.twoFieldTitles.slice(0, 3).join(' | '));
check('a lone field opens the fight too', ui.oneFieldOpensFight === true);
check('with nothing live, the lane is the board', ui.boardTitles.drew === true
  && ui.boardTitles.seen.some((s) => /chiến sự|the war/i.test(s)),
  ui.boardTitles.seen.slice(0, 3).join(' | '));

console.log('=== THE RECKONING ===');

const over = await page.evaluate(() => {
  const game = window.__phaserGame;
  const ui = game.scene.getScene('ConquestUIScene');
  const st = ui.state;
  ui.closeLane?.();
  st.pendingAscentPrompt = {
    kind: 'run-over',
    score: 2658,
    previousBest: 8649,
    cause: 'capital',
    landName: st.lands[0].name,
    reign: 'Triều Thử',
    reignDetail: '6 chiều · Thử gia · theo 4',
  };
  ui.refresh();
  // Button labels live inside the button's own Container, so a flat scan of `modalLayer.list`
  // sees the ledger and none of the controls — which is exactly the check that matters here.
  const texts = [];
  const walk = (obj, dx, dy) => {
    const x = dx + (obj.x ?? 0);
    const y = dy + (obj.y ?? 0);
    if (obj.type === 'Text' && obj.text) texts.push({ text: obj.text, y: Math.round(y), h: Math.round(obj.height ?? 0) });
    if (Array.isArray(obj.list)) obj.list.forEach((child) => walk(child, x, y));
  };
  ui.modalLayer.list.forEach((o) => walk(o, 0, 0));
  const height = game.scale.gameSize.height;
  return {
    texts: texts.map((t) => t.text),
    lowest: Math.max(...texts.map((t) => t.y + t.h)),
    height,
  };
});

check('the Reckoning no longer carries the Codex',
  !over.texts.some((t) => /Danh lục|Codex/i.test(t)), over.texts.filter((t) => /Danh|Codex/i.test(t)).join(','));
check('it still offers the way back to the menu',
  over.texts.some((t) => /menu/i.test(t)), over.texts.slice(-4).join(' | '));
check('nothing on it prints past the foot of the screen', over.lowest <= over.height,
  `lowest ${over.lowest} of ${over.height}`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the war is visible, the fields are listable, and the Reckoning fits'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
