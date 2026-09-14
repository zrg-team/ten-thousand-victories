// Screenshots the Army lane and one host's detail page (standing orders, recall, resupply) in
// the real scenes. Needs `npm run dev`.
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
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  let guard = 0;
  while (st.pendingAscentPrompt && guard++ < 10) {
    const p = st.pendingAscentPrompt;
    resolveAscentPrompt(st, p.kind === 'founder' ? p.options[0] : p.kind === 'court-appointment' ? p.options[0].id : 'ok');
  }
  ui.events.emit('state-changed');
  ui.openLane('army');
  await new Promise((r) => setTimeout(r, 300));
  const army = st.armies.find((a) => a.kingdomId === 'dai-viet');
  return { army: army?.name, key: ui.openPromptKey };
});
await page.screenshot({ path: 'output/web-game/army-lane.png' });
await page.evaluate(async () => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const army = st.armies.find((a) => a.kingdomId === 'dai-viet');
  ui.showArmyDetail(army.id);
  await new Promise((r) => setTimeout(r, 300));
});
await page.screenshot({ path: 'output/web-game/army-detail.png' });
console.log(JSON.stringify(res));
console.log('ERRORS', errors);
await browser.close();
