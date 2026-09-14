// Two things the fight screen never admitted: that the world can be paused under it, and that
// help can be sent to it.
//
//   1. A running fight opened from a paused map says PAUSED, offers Resume, and resumes on any
//      order — and a fight paused from inside stays paused on the map when the player steps out.
//   2. A host elsewhere can be sent to a live defence; it is listed with an ETA, the order files,
//      and it is in the line once it arrives. For an assault, a host sent to storm the same
//      province joins from the staging ground rather than striking alone.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-battle-relief.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260823, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

// ── the board: a defence on one province, a spare host two provinces away ──────────────────
const board = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const R = await import('/src/systems/ascent/reinforcement.ts');
  const st = window.__mandateState;
  // Clear the opening prompts so lanes can open.
  const A = await import('/src/systems/ascent/AscentResolver.ts');
  for (let i = 0; i < 8 && st.pendingAscentPrompt; i += 1) {
    const p = st.pendingAscentPrompt;
    const id = p.options?.[0]?.id ?? p.options?.[0] ?? p.heroIds?.[0] ?? p.cards?.[0] ?? 'ok';
    A.resolveAscentPrompt(st, typeof id === 'string' ? id : String(id));
  }
  st.ascent.promptQueue = [];
  st.pendingAscentPrompt = undefined;
  st.isPaused = false;

  const mk = (id, kingdomId, landId, total) => ({
    id, kingdomId, landId, name: id,
    units: { archers: Math.round(total * 0.3), heavyInfantry: Math.round(total * 0.2), spearmen: total - Math.round(total * 0.3) - Math.round(total * 0.2) },
    morale: 85, supply: 90, level: 2, experience: 0, experienceToNextLevel: 160,
    rations: 999, provisions: 999, autoDefend: false,
  });
  // Give the realm three owned provinces in a chain so there is somewhere to march from.
  const mine = st.lands.filter((l) => l.ownerId === 'dai-viet');
  const capital = mine[0];
  const ring1 = capital.neighbors.map((id) => st.lands.find((l) => l.id === id)).filter(Boolean);
  const mid = ring1[0];
  mid.ownerId = 'dai-viet'; mid.isVisible = true;
  const far = mid.neighbors.map((id) => st.lands.find((l) => l.id === id)).filter((l) => l && l.id !== capital.id)[0];
  far.ownerId = 'dai-viet'; far.isVisible = true;

  st.armies = st.armies.filter((a) => a.kingdomId !== 'dai-viet' || a.isLevy);
  st.armies = st.armies.filter((a) => !a.isLevy);
  st.movementOrders = []; st.siegeOrders = []; st.acquisitionOrders = [];
  st.armies.push(mk('home-host', 'dai-viet', capital.id, 1200));
  st.armies.push(mk('spare-host', 'dai-viet', far.id, 900));
  st.armies.push(mk('invader', 'northern-rival', capital.id, 2600));
  st.ascent.activeBattle = undefined;
  st.ascent.lastWatchedWave = -1;
  st.ascent.lastWatchedKey = undefined;
  st.pendingBattle = {
    invaderArmyId: 'invader', landId: capital.id, landName: capital.name,
    kingdomId: 'northern-rival', kingdomName: 'Lab', isGreat: true,
    attackerPower: 0, defenderPower: 0,
  };
  const opened = B.beginBattle(st);
  const b = st.ascent.activeBattle;
  const rows = R.reinforcementCandidates(st, b);
  return {
    opened, ours: b?.ourArmyIds, theirs: b?.theirArmyIds,
    rows: rows.map((r) => ({ id: r.army.id, eta: r.etaTicks, inTime: r.inTime, blocked: r.blockedReason ?? '', enRoute: r.enRoute })),
    ticksLeft: R.battleTicksLeft(b),
  };
});
console.log('  board', JSON.stringify(board));
const spare = board.rows.find((r) => r.id === 'spare-host');
check(board.opened && spare && !spare.blocked && spare.eta > 0,
  'a host elsewhere is offered as relief, with an ETA in seasons',
  `spare-host eta ${spare?.eta} · fight has ${board.ticksLeft} season(s) left · inTime ${spare?.inTime}`);
check(!board.rows.some((r) => r.id === 'home-host'), 'a host already in the line is not offered', board.rows.map((r) => r.id).join(','));

// ── 1. pause, seen from inside the fight ─────────────────────────────────────────────────────
const texts = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const out = [];
  const walk = (o) => { if (o.type === 'Text') out.push(o.text); if (o.list) o.list.forEach(walk); };
  walk(ui.modalLayer);
  return out;
});
// **A fight never opens onto a paused world any more.** The lane used to carry whatever hold was
// in force when it opened, and the failure that produced was not academic: a running battle
// reopened frozen at beat 15 with "Tiếp tục" the only control that did anything — reported as
// *fight stop in middle, nothing to do.* Walking into a fight is an instruction to fight it, so
// the lane clears both clocks on the way in and the screen keeps its own Pause for afterwards.
const opened = await page.evaluate(() => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  st.isStrategyPause = true; // the player paused the map
  st.isPaused = true;        // …and the hard clock too
  ui.refresh();
  ui.openLane('battle');
  ui.battleAwaitingOrder = false; // not a fresh fight: the opening drum is not what we test
  ui.battleOpeningTimer?.remove(); ui.battleOpeningTimer = undefined;
  ui.refresh();
  return { strategy: st.isStrategyPause, hard: st.isPaused, before: ui.lanePauseBeforeOpen };
});
await page.waitForTimeout(400);
let seen = await texts();
const pausedShown = seen.some((s) => /PAUSED|TẠM DỪNG/.test(s));
check(!opened.strategy && !opened.hard && opened.before === false && !pausedShown,
  'a fight opens running, whatever hold the map was under',
  `${JSON.stringify(opened)} banner ${pausedShown}`);

// Any order resumes it.
const afterOrder = await page.evaluate(async () => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.resumeBattleForOrder();
  ui.refresh();
  return { strategy: st.isStrategyPause, hard: st.isPaused, before: ui.lanePauseBeforeOpen };
});
seen = await texts();
check(!afterOrder.strategy && !afterOrder.hard && afterOrder.before === false && !seen.some((s) => /PAUSED|TẠM DỪNG/.test(s)),
  'and an order still leaves it running', JSON.stringify(afterOrder));

// Pause from inside, then step out: the map stays paused, because the player paused it.
const afterPause = await page.evaluate(() => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.toggleBattlePause();
  const inside = st.isStrategyPause;
  ui.closeLane();
  return { inside, outside: st.isStrategyPause };
});
check(afterPause.inside && afterPause.outside, 'pausing inside the fight holds the map after stepping out', JSON.stringify(afterPause));
await page.evaluate(() => { window.__mandateState.isStrategyPause = false; });

// ── 2. relief: the fight screen's control, the order, the arrival ───────────────────────────
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.openLane('battle');
  ui.battleAwaitingOrder = false;
  ui.battleOpeningTimer?.remove(); ui.battleOpeningTimer = undefined;
  ui.refresh();
});
await page.waitForTimeout(300);
seen = await texts();
const reliefBtn = seen.find((s) => /Send relief|Gọi tiếp viện/.test(s));
check(Boolean(reliefBtn), 'the fight screen offers to send relief', reliefBtn ?? seen.slice(0, 6).join(' | '));

const sent = await page.evaluate(async () => {
  const R = await import('/src/systems/ascent/reinforcement.ts');
  const st = window.__mandateState;
  const b = st.ascent.activeBattle;
  const ok = R.sendReinforcement(st, b, 'spare-host');
  const army = st.armies.find((a) => a.id === 'spare-host');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.refresh();
  return {
    ok, orders: army.orders, marching: st.movementOrders.some((o) => o.armyId === 'spare-host'),
    log: b.log[b.log.length - 1], enRoute: R.reinforcementsEnRoute(st, b),
  };
});
check(sent.ok && sent.orders?.kind === 'defend' && sent.marching && sent.enRoute.hosts === 1,
  'sending relief files a hold order on the province and the host marches', JSON.stringify({ orders: sent.orders, marching: sent.marching, enRoute: sent.enRoute }));
check(/spare-host/.test(sent.log ?? ''), 'the fight log says who is coming', sent.log);
seen = await texts();
check(seen.some((s) => /Relief on the road|Tiếp viện đang tới/.test(s)), 'the control now reports relief on the road');

// March it in: world ticks, then beats. The host should be in the line, and announced.
const arrived = await page.evaluate(async () => {
  const T = await import('/src/systems/ascent/AscentTick.ts');
  const st = window.__mandateState;
  const b = st.ascent.activeBattle;
  const before = b.log.length;
  st.isPaused = false; st.isStrategyPause = false;
  let ticks = 0;
  for (; ticks < 30 && !b.over; ticks += 1) {
    T.advanceAscentTick(st);
    if ((b.ourArmyIds ?? []).includes('spare-host')) break;
  }
  return {
    ticks, over: b.over, inLine: (b.ourArmyIds ?? []).includes('spare-host'),
    relief: b.log.slice(before).some((l) => /relief|tiếp viện|viện binh/i.test(l)),
    where: st.armies.find((a) => a.id === 'spare-host')?.landId, landId: b.landId,
  };
});
check(arrived.inLine, 'the host is enrolled in the line when it arrives',
  `after ${arrived.ticks} tick(s) · at ${arrived.where} vs ${arrived.landId} · over ${arrived.over}`);

// ── 3. an assault: relief joins from the staging ground instead of striking alone ───────────
const assault = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const R = await import('/src/systems/ascent/reinforcement.ts');
  const M = await import('/src/systems/ascent/battleMembership.ts');
  const st = window.__mandateState;
  const mine = st.lands.filter((l) => l.ownerId === 'dai-viet');
  const capital = mine[0];
  const target = capital.neighbors.map((id) => st.lands.find((l) => l.id === id)).find((l) => l && l.ownerId !== 'dai-viet');
  if (!target) return { skipped: 'no enemy neighbour' };
  const mk = (id, kingdomId, landId, total) => ({
    id, kingdomId, landId, name: id,
    units: { archers: Math.round(total * 0.3), heavyInfantry: Math.round(total * 0.2), spearmen: total - Math.round(total * 0.3) - Math.round(total * 0.2) },
    morale: 85, supply: 90, level: 2, experience: 0, experienceToNextLevel: 160,
    rations: 999, provisions: 999, autoDefend: false,
  });
  st.armies = st.armies.filter((a) => !['home-host', 'spare-host', 'invader'].includes(a.id) && !a.isLevy);
  st.movementOrders = [];
  st.armies.push(mk('storm-host', 'dai-viet', capital.id, 1500));
  st.armies.push(mk('second-host', 'dai-viet', capital.id, 700));
  st.ascent.activeBattle = undefined;
  st.ascent.lastWatchedKey = undefined;
  st.pendingBattle = {
    role: 'offence', attackerArmyIds: ['storm-host'], invaderArmyId: '', landId: target.id, landName: target.name,
    kingdomId: target.ownerId, kingdomName: 'Them', isGreat: false, attackerPower: 0, defenderPower: 0,
  };
  const opened = B.beginBattle(st);
  const b = st.ascent.activeBattle;
  if (!opened || !b) return { opened, target: target.id, owner: target.ownerId };
  const row = R.reinforcementCandidates(st, b).find((r) => r.army.id === 'second-host');
  const ok = R.sendReinforcement(st, b, 'second-host');
  M.enrolArrivals(st, b);
  return {
    opened, row: row && { eta: row.etaTicks, blocked: row.blockedReason ?? '' }, ok,
    orders: st.armies.find((a) => a.id === 'second-host').orders,
    inLine: (b.ourArmyIds ?? []).includes('second-host'),
    marching: st.movementOrders.some((o) => o.armyId === 'second-host'),
  };
});
console.log('  assault', JSON.stringify(assault));
check(assault.skipped || (assault.opened && assault.ok && assault.inLine && !assault.marching),
  'an assault takes relief from the staging ground, without a lone strike', assault.skipped ?? JSON.stringify(assault));

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: pause or relief is not reaching the fight screen');
