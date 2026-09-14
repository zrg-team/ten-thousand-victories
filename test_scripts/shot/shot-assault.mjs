// Gives the royal host an attack order on a bordering province and drives the real scenes until
// the assault opens (the screen must open itself) and then to its end; screenshots the field and
// prints the outcome. Needs `npm run dev`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('output/web-game', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260812, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);
const res = await page.evaluate(async () => {
  const st = window.__mandateState;
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const SO = await import('/src/systems/ascent/StandingOrders.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  const settle = () => { let g = 0; while (st.pendingAscentPrompt && g++ < 10) { const p = st.pendingAscentPrompt; resolveAscentPrompt(st, p.kind === 'founder' ? p.options[0] : p.kind === 'court-appointment' ? p.options[0].id : p.kind === 'power-draft' ? (p.cards[0] ?? 'skip') : p.kind === 'hero-choice' ? 'pass' : p.kind === 'conquer-target' ? 'hold' : p.kind === 'law-choice' ? 'hold' : p.kind === 'parliament' ? 'decline' : (p.options?.[0]?.id ?? 'ok')); } };
  settle();
  // A quiet world so the assault is the only fight.
  const quiet = () => { st.ascent.ticksToWave = 999; st.armies = st.armies.filter((a) => a.kingdomId === 'dai-viet' || a.isLevy); st.invasions = []; };
  const royal = st.armies.find((a) => a.kingdomId === 'dai-viet');
  const home = st.lands.find((l) => l.id === royal.landId);
  const target = st.lands.find((l) => l.ownerId !== 'dai-viet' && l.hasVillage && home.neighbors.includes(l.id));
  royal.units.spearmen += 900; // a host worth watching against a village's walls
  st.resources.gold = 3000;
  const ok = SO.setArmyOrders(st, royal.id, { kind: 'attack', landId: target.id, force: true });
  let opened = -1; let ended = -1; let firstKey = null; let outcome = null;
  for (let i = 0; i < 30; i += 1) {
    quiet();
    advanceAscentTick(st); settle(); world.refresh(); ui.events.emit('state-changed');
    const b = st.ascent.activeBattle;
    if (b && opened < 0) { opened = i; firstKey = { key: b.key, role: b.role, ours: b.ourNow, theirs: b.theirNow, lane: ui.openPromptKey, hold: ui.battleAwaitingOrder }; await new Promise((r) => setTimeout(r, 400)); break; }
  }
  return { ok, target: target.name, owner: target.ownerId, opened, firstKey };
});
console.log(JSON.stringify(res));
await page.screenshot({ path: 'output/web-game/assault-open.png' });
const end = await page.evaluate(async () => {
  const st = window.__mandateState;
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  const settle = () => { let g = 0; while (st.pendingAscentPrompt && g++ < 10) { const p = st.pendingAscentPrompt; resolveAscentPrompt(st, p.kind === 'power-draft' ? (p.cards[0] ?? 'skip') : p.kind === 'hero-choice' ? 'pass' : p.kind === 'conquer-target' ? 'hold' : p.kind === 'law-choice' ? 'hold' : p.kind === 'parliament' ? 'decline' : (p.options?.[0]?.id ?? 'ok')); } };
  // Press the attack: the first order releases the hold.
  ui.events.emit('ui:battle-order', 'stance:press');
  const target = st.ascent.activeBattle?.landId;
  let ticks = 0;
  while (st.ascent.activeBattle && ticks++ < 20) { st.ascent.ticksToWave = 999; st.invasions = []; advanceAscentTick(st); settle(); world.refresh(); ui.events.emit('state-changed'); }
  const hist = st.ascent.battleHistory?.slice(-1)[0];
  const land = st.lands.find((l) => l.id === target);
  const siege = st.siegeOrders.find((o) => o.landId === target);
  const royal = st.armies.find((a) => a.kingdomId === 'dai-viet' && !a.isLevy);
  return { ticks, strategyPause: st.isStrategyPause, hist, landOwner: land?.ownerId, siege: siege ? { by: siege.armyId, required: siege.required } : null, royalAt: royal?.landId, royalOrders: royal?.orders, leviesLeft: st.armies.filter((a) => a.isLevy).length, message: st.message };
});
console.log(JSON.stringify(end));
console.log('ERRORS', errors);
await browser.close();
