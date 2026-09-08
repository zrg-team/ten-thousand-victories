// Relief reaching a live fight is the payoff for having sent it, and it used to arrive as one
// ten-point line in the header: the column simply stood in the line on the next rebuild, drawn
// exactly like a column that had been there all along. Reported: *when reinforcement come to
// battle it should be shown in message bubble and highlighted — that's an epic moment.*
//
// What the screen does now, and what this checks:
//   · our host SHOUTS it — the bubble over the men says relief has come, and pops like an order
//   · the column marches IN from our edge of the field rather than appearing in the line
//   · a proclamation ribbon crosses the sky over the field and takes itself down
//   · the beat clock holds for the moment, the way it does for contact and a break
//   · the enemy's relief gets the same treatment in their colours
//   · reopening a fight that was reinforced while the screen was closed announces nothing
//
// Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-relief-fanfare.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('output', { recursive: true });
const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260823, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);
// A save under `src/` from another session reloads the page; a reloaded page reads as a feature
// failure on every later probe, so the run is stamped and the stamp checked before it is believed.
await page.evaluate(() => { window.__reliefRun = 1; });
const reloaded = () => page.evaluate(() => !window.__reliefRun).catch(() => true);

// ── the board: a defence on the capital, a spare host two provinces away ───────────────────
const board = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const A = await import('/src/systems/ascent/AscentResolver.ts');
  const st = window.__mandateState;
  for (let i = 0; i < 8 && st.pendingAscentPrompt; i += 1) {
    const p = st.pendingAscentPrompt;
    const id = p.options?.[0]?.id ?? p.options?.[0] ?? p.heroIds?.[0] ?? p.cards?.[0] ?? 'ok';
    A.resolveAscentPrompt(st, typeof id === 'string' ? id : String(id));
  }
  st.ascent.promptQueue = [];
  st.pendingAscentPrompt = undefined;
  st.isPaused = false;

  const mk = (id, kingdomId, landId, total, name = id) => ({
    id, kingdomId, landId, name,
    units: { archers: Math.round(total * 0.3), heavyInfantry: Math.round(total * 0.2), spearmen: total - Math.round(total * 0.3) - Math.round(total * 0.2) },
    morale: 85, supply: 90, level: 2, experience: 0, experienceToNextLevel: 160,
    rations: 999, provisions: 999, autoDefend: false,
  });
  const mine = st.lands.filter((l) => l.ownerId === 'dai-viet');
  const capital = mine[0];
  const ring1 = capital.neighbors.map((id) => st.lands.find((l) => l.id === id)).filter(Boolean);
  const mid = ring1[0];
  mid.ownerId = 'dai-viet'; mid.isVisible = true;
  const far = mid.neighbors.map((id) => st.lands.find((l) => l.id === id)).filter((l) => l && l.id !== capital.id)[0];
  far.ownerId = 'dai-viet'; far.isVisible = true;

  st.armies = st.armies.filter((a) => !a.isLevy && a.kingdomId !== 'dai-viet');
  st.movementOrders = []; st.siegeOrders = []; st.acquisitionOrders = [];
  st.armies.push(mk('home-host', 'dai-viet', capital.id, 1200, 'Đạo Thần Sách'));
  st.armies.push(mk('spare-host', 'dai-viet', far.id, 900, 'Đạo Long Dực'));
  st.armies.push(mk('invader', 'northern-rival', capital.id, 2600, 'Bắc quân'));
  st.ascent.activeBattle = undefined;
  st.ascent.sideBattles = [];
  st.ascent.lastWatchedWave = -1;
  st.ascent.lastWatchedKey = undefined;
  st.pendingBattle = {
    invaderArmyId: 'invader', landId: capital.id, landName: capital.name,
    kingdomId: 'northern-rival', kingdomName: 'Bắc Triều', isGreat: true,
    attackerPower: 0, defenderPower: 0,
  };
  const opened = B.beginBattle(st);
  return { opened, ours: st.ascent.activeBattle?.ourArmyIds, capital: capital.id };
});
check(board.opened && board.ours?.includes('home-host'), 'a defence is live on the capital', JSON.stringify(board));

const openFight = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.openLane('battle');
  ui.battleAwaitingOrder = false;
  ui.battleOpeningTimer?.remove(); ui.battleOpeningTimer = undefined;
  ui.refresh();
});
await openFight();
await page.waitForTimeout(400);

const readUi = () => page.evaluate(async () => {
  const G = await import('/src/scenes/conquest/battle/geometry.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const b = window.__mandateState.ascent.activeBattle;
  const u = ui.battleUi;
  if (!u || !b) return { none: true, why: { lane: ui.openPromptKey, battle: Boolean(b), prompt: window.__mandateState.pendingAscentPrompt?.kind }, said: {}, spare: null, foe: null };
  const lines = G.battleLines(ui, b.ourAdvance, b.theirAdvance);
  const entry = (list, id) => { const e = list.find((m) => m.hostId === id); return e && { arriving: Boolean(e.arriving), x: Math.round(e.marker.x), alpha: e.marker.alpha }; };
  return {
    fanfare: u.fanfare?.list.length ?? -1,
    call: u.bubbleCall ? { side: u.bubbleCall.side, text: u.bubbleCall.text } : null,
    said: { ...u.bubbleSaid },
    ourX: Math.round(lines.ourX), theirX: Math.round(lines.theirX),
    spare: entry(u.ourMarkers, 'spare-host'),
    foe: entry(u.theirMarkers, 'late-column'),
    held: Boolean(ui.battleClock?.paused),
    // The relief line is pushed at the top of the beat that seats the column, and the same tick's
    // later beats bury it — which is the whole reason the bubble carries it now.
    log: b.log.slice(-8).find((line) => /Viện binh|Relief|relief/i.test(line)) ?? b.log[b.log.length - 1],
    ours: b.ourArmyIds, theirs: b.theirArmyIds,
  };
});

const quiet = await readUi();
check(quiet.fanfare === 0 && !quiet.call, 'a fight opens with no fanfare standing', JSON.stringify({ fanfare: quiet.fanfare, call: quiet.call }));

// ── relief sent, and marched in with the screen open ─────────────────────────────────────────
const arrival = await page.evaluate(async () => {
  const R = await import('/src/systems/ascent/reinforcement.ts');
  const T = await import('/src/systems/ascent/AscentTick.ts');
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const b = st.ascent.activeBattle;
  const sent = R.sendReinforcement(st, b, 'spare-host');
  ui.refresh();
  st.isPaused = false; st.isStrategyPause = false;
  let ticks = 0;
  for (; ticks < 30 && !b.over; ticks += 1) {
    T.advanceAscentTick(st);
    // A decision card raised by the tick would take the screen; this is about the fight, not the court.
    st.pendingAscentPrompt = undefined; st.ascent.promptQueue = [];
    st.isPaused = false; st.isStrategyPause = false;
    // The screen reads the fight on every state change, which is where the arrival is noticed.
    ui.refresh();
    if ((b.ourArmyIds ?? []).includes('spare-host')) break;
  }
  return { sent, ticks, over: b.over, inLine: (b.ourArmyIds ?? []).includes('spare-host') };
});
check(arrival.sent && arrival.inLine && !arrival.over, 'the relief host is in the line', JSON.stringify(arrival));

const moment = await readUi();
console.log('  at arrival', JSON.stringify(moment));
check(moment.fanfare > 0, 'the arrival raises a proclamation over the field', `${moment.fanfare} objects in the fanfare layer`);
check(moment.call?.side === 'ours' && /Viện binh|Reinforcements|relief/i.test(moment.call?.text ?? ''),
  'our host shouts that relief has come', moment.call?.text);
check(/Viện binh|Reinforcements|relief/i.test(moment.said?.ours ?? ''), 'and the bubble over the men says it', moment.said?.ours);
check(moment.spare?.arriving === true && moment.spare.x < moment.ourX - 20,
  'the column marches in from our edge rather than appearing in the line', JSON.stringify({ spare: moment.spare, ourX: moment.ourX }));
check(moment.held, 'the beat clock holds for the moment');
check(/Viện binh|Relief|relief/i.test(moment.log ?? ''), 'the log line records it', moment.log);

await page.waitForTimeout(260);
await page.screenshot({ path: 'output/relief-fanfare.png' });

// The entrance finishes on its own, and the column stands on the line afterwards.
await page.waitForFunction(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const e = ui.battleUi?.ourMarkers.find((m) => m.hostId === 'spare-host');
  return e && !e.arriving;
}, null, { timeout: 5000 }).catch(() => {});
const landed = await readUi();
check(landed.spare && !landed.spare.arriving && Math.abs(landed.spare.x - landed.ourX) < 40 && landed.spare.alpha === 1,
  'the column stands in the line once its march is done', JSON.stringify({ spare: landed.spare, ourX: landed.ourX }));

// The shout gives way to the formation sentence, and the ribbon takes itself down.
await page.waitForFunction(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const u = ui.battleUi;
  return u && !u.bubbleCall && u.fanfare.list.length === 0;
}, null, { timeout: 8000 }).catch(() => {});
const after = await readUi();
check(!after.call && after.fanfare === 0, 'the shout and the ribbon are gone within a few seconds',
  JSON.stringify({ call: after.call, fanfare: after.fanfare }));
check(!/Viện binh|Reinforcements/i.test(after.said?.ours ?? 'Viện binh'), 'and the bubble is back to what the men are doing', after.said?.ours);

// ── the enemy's relief, in their colours ──────────────────────────────────────────────────────
const foe = await page.evaluate(async () => {
  const T = await import('/src/systems/ascent/AscentTick.ts');
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const b = st.ascent.activeBattle;
  st.armies.push({
    id: 'late-column', kingdomId: 'northern-rival', landId: b.landId, name: 'Hậu quân Bắc',
    units: { archers: 200, heavyInfantry: 100, spearmen: 500 },
    morale: 85, supply: 90, level: 2, experience: 0, experienceToNextLevel: 160,
    rations: 999, provisions: 999, autoDefend: false,
  });
  // Membership is read on the beat, so one tick seats them; the refresh is where the screen sees it.
  T.advanceAscentTick(st);
  st.pendingAscentPrompt = undefined; st.ascent.promptQueue = [];
  st.isPaused = false; st.isStrategyPause = false;
  ui.refresh();
  return { over: b.over, theirs: b.theirArmyIds };
});
const theirs = await readUi();
console.log('  enemy relief', JSON.stringify({ foe, call: theirs.call, foeMarker: theirs.foe, theirX: theirs.theirX }));
check(foe.theirs?.includes('late-column') && theirs.call?.side === 'theirs' && theirs.fanfare > 0,
  'enemy relief is announced from their side', JSON.stringify({ call: theirs.call, fanfare: theirs.fanfare }));
check(theirs.foe?.arriving === true && theirs.foe.x > theirs.theirX + 20,
  'and their column marches in from their edge', JSON.stringify({ foe: theirs.foe, theirX: theirs.theirX }));

// ── reopening does not re-announce ───────────────────────────────────────────────────────────
await page.evaluate(() => { const ui = window.__phaserGame.scene.getScene('ConquestUIScene'); ui.closeLane(); });
await page.waitForTimeout(200);
await openFight();
await page.waitForTimeout(400);
const reopened = await readUi();
check(reopened.fanfare === 0 && !reopened.call, 'reopening a reinforced fight announces nothing',
  JSON.stringify({ fanfare: reopened.fanfare, call: reopened.call }));

// Pre-existing on this checkout: story-print setting images referenced before they exist.
const mine = errors.filter((e) => !/Failed to process file|File failed:|is not valid JSON/.test(e));
check(mine.length === 0, 'no console errors', mine.slice(0, 3).join(' | '));

if (await reloaded()) {
  console.log('\nCHECK: the page reloaded under the harness (a save under src/ from another session) — re-run before believing any red above');
  await browser.close();
  process.exit(2);
}
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) { console.log('FAIL: relief is not arriving as a moment'); process.exit(1); }
