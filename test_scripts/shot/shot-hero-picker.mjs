// Screenshots the WP3 screens in the real scenes: the roster with portraits, a court seat's
// picker, the raise-host form, the claim list and a method sheet with its actor line — and
// drives one muster through the form's event to prove the plan lands as a recruitment order.
// Needs `npm run dev`.
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
const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: `output/web-game/${name}.png` }); };
const res = await page.evaluate(async () => {
  const st = window.__mandateState;
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  const settle = () => { let g = 0; while (st.pendingAscentPrompt && g++ < 10) { const p = st.pendingAscentPrompt; resolveAscentPrompt(st, p.kind === 'founder' ? p.options[0] : p.kind === 'court-appointment' ? p.options[0].id : p.kind === 'power-draft' ? (p.cards[0] ?? 'skip') : p.kind === 'hero-choice' ? (p.heroIds[0] ?? 'pass') : p.kind === 'conquer-target' ? 'hold' : 'ok'); } };
  settle();
  // A few heroes on the roster so the pickers have something to show.
  for (let i = 0; i < 30 && st.heroes.length < 3; i += 1) { advanceAscentTick(st); settle(); }
  world.refresh();
  ui.events.emit('state-changed');
  return { heroes: st.heroes.length, armies: st.armies.filter((a) => a.kingdomId === 'dai-viet').length };
});
console.log(JSON.stringify(res));
await page.evaluate(() => { const ui = window.__phaserGame.scene.getScene('ConquestUIScene'); ui.openLane('heroes'); });
await shot('roster');
await page.evaluate(() => { const ui = window.__phaserGame.scene.getScene('ConquestUIScene'); ui.closeLane(); ui.openLane('court'); ui.showSeatPicker('marshal'); });
await shot('seat-picker');
await page.evaluate(() => { const ui = window.__phaserGame.scene.getScene('ConquestUIScene'); ui.closeLane(); ui.openLane('army'); ui.showRaiseHostForm(); });
await shot('raise-host');
await page.evaluate(() => { const ui = window.__phaserGame.scene.getScene('ConquestUIScene'); ui.closeLane(); ui.openLane('build'); ui.showClaimTargets(); });
await shot('claim-list');
const muster = await page.evaluate(async () => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const { defaultMusterPlan } = await import('/src/systems/ascent/MusterSystem.ts');
  ui.closeLane();
  const before = st.recruitmentOrders.length;
  const pending = st.pendingAscentPrompt?.kind ?? null;
  st.pendingAscentPrompt = undefined; st.ascent.promptQueue = []; st.isPaused = false;
  const plan = defaultMusterPlan(st);
  st.resources.food = Math.max(st.resources.food, 500); st.resources.supplies = Math.max(st.resources.supplies, 300); st.resources.humans = Math.max(st.resources.humans, 900);
  const { musterBlockedReason } = await import('/src/systems/ascent/MusterSystem.ts');
  const full = { ...plan, soldiers: 400, composition: 'spears', orders: { kind: 'defend', landId: st.ascent.capitalLandId } };
  const reason = musterBlockedReason(st, full);
  ui.events.emit('ui:ascent-raise-host', full);
  const order = st.recruitmentOrders[st.recruitmentOrders.length - 1];
  ui.openLane('army');
  return { pending, reason, before, after: st.recruitmentOrders.length, order: order ? { soldiers: order.totalSoldiers, comp: order.composition, orders: order.orders, hero: order.heroId } : null };
});
console.log(JSON.stringify(muster));
await shot('army-muster');
// A method sheet with an actor line: raise the conquer prompt for the first border province.
const sheet = await page.evaluate(async () => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const CQ = await import('/src/systems/ascent/ConquestSystem.ts');
  const { enqueueAscentPrompt, drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  ui.closeLane();
  const targets = CQ.buildAllConquestTargets(st);
  const target = targets.find((t) => t.methods.some((m) => !m.blockedReason && (m.method === 'diplomacy' || m.method === 'siege' || m.method === 'occupy'))) ?? targets[0];
  if (!target) return { none: true };
  enqueueAscentPrompt(st, { kind: 'conquer-method', target });
  drainAscentPrompts(st);
  ui.events.emit('state-changed');
  await new Promise((r) => setTimeout(r, 300));
  return { land: target.landName, methods: target.methods.map((m) => `${m.method}${m.blockedReason ? '(x)' : ''}${m.heroId ? ':' + m.heroId : ''}${m.armyId ? ':' + m.armyId : ''}`) };
});
console.log(JSON.stringify(sheet));
await shot('method-sheet');
const actor = await page.evaluate(async () => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const prompt = st.pendingAscentPrompt;
  if (!prompt || prompt.kind !== 'conquer-method') return { none: true };
  const option = prompt.target.methods.find((m) => !m.blockedReason && m.method === 'diplomacy');
  if (!option) return { noDiplomacy: true };
  ui.showMethodActorPicker(prompt.target, option, prompt.notice);
  await new Promise((r) => setTimeout(r, 300));
  return { opened: ui.openPromptKey, hero: option.heroId };
});
console.log(JSON.stringify(actor));
await shot('envoy-picker');
const chosen = await page.evaluate(async () => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const prompt = st.pendingAscentPrompt;
  const option = prompt?.target.methods.find((m) => !m.blockedReason && m.method === 'diplomacy');
  if (!option) return { none: true };
  // Pick the *other* hero than the sheet's default, to prove the choice carries.
  const other = st.heroes.find((h) => h.id !== option.heroId && !h.assignedTo?.startsWith('diplomacy-') && !st.recruitmentOrders.some((o) => o.id === h.assignedTo) && !st.armies.some((a) => a.id === h.assignedTo)) ?? st.heroes.find((h) => h.id === option.heroId);
  st.resources.supplies = Math.max(st.resources.supplies, 200);
  ui.choose(`diplomacy:${other.id}`);
  await new Promise((r) => setTimeout(r, 200));
  const order = st.acquisitionOrders.find((o) => o.landId === prompt.target.landId);
  return { picked: other.id, defaultWas: option.heroId, order: order ? { method: order.method, heroId: order.heroId } : null, promptNow: st.pendingAscentPrompt?.kind ?? null };
});
console.log(JSON.stringify(chosen));
console.log('ERRORS', errors);
await browser.close();
