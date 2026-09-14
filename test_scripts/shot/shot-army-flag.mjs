// Screenshots the map around the capital right after a Dragon Ascent start: the royal host's
// standard must match the province flags and its general's face must sit beside it while it
// stands. Needs `npm run dev`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('output/web-game', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
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
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  let guard = 0;
  while (st.pendingAscentPrompt && guard++ < 10) { const p = st.pendingAscentPrompt; resolveAscentPrompt(st, p.kind === 'founder' ? p.options[0] : p.kind === 'court-appointment' ? p.options[0].id : 'ok'); }
  world.refresh();
  ui.events.emit('state-changed');
  // Centre the camera on the royal host and zoom in.
  const army = st.armies.find((a) => a.kingdomId === 'dai-viet');
  const land = st.lands.find((l) => l.id === army.landId);
  const marker = world.armies.markers.get(army.id);
  // The map's own pan: `ui:pan-camera` takes design-unit world coordinates and honours bounds.
  world.setMapZoom(2.4);
  ui.events.emit('ui:pan-camera', marker.x, marker.y);
  await new Promise((r) => setTimeout(r, 600));
  const badges = world.armies.faceBadges.size;
  return { army: army.name, general: army.generalHeroId, land: land.name, badges, marker: [Math.round(marker.x), Math.round(marker.y)], seed: st.mapConfig.seed };
});
console.log(JSON.stringify(res));
await page.screenshot({ path: 'output/web-game/army-flag.png' });
console.log('ERRORS', errors);
await browser.close();
