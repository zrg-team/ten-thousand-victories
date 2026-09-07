// Verify live cloud movement, army layering, bake exclusion and rebuild cleanup.
// Usage: DEV_URL=http://127.0.0.1:5179 WIDTH=1280 node test_scripts/verify/verify-battle-clouds.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('output/web-game', { recursive: true });

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const HEIGHT = Number(process.env.HEIGHT ?? 844);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.WIDTH ?? 390), height: HEIGHT }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);

await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = window.__phaserGame.scene.getScene('BattleArenaScene');
  s.ourMen = 1500; s.theirMen = 1500; s.martial = 70; s.ground = 'hills';
  s.startFight();
});
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 20000 });
await page.waitForTimeout(700);
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.battleAwaitingOrder = false;
  window.__mandateState.isStrategyPause = false;
});


const probe = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene').battleUi;
  const layer = ui.field.list.find(o => o.getData('battleAmbient') === 'mountain-clouds');
  const clouds = layer?.list.filter(o => o.getData('battleAmbient') === 'mountain-mist') ?? [];
  return { count: clouds.length, x: clouds.map(o => o.x),
    baked: ui.groundSources.includes(layer),
    behind: ui.field.list.indexOf(layer) < ui.field.list.indexOf(ui.ourMarkers[0].marker) };
});
const before = await probe();
await page.screenshot({path: 'output/web-game/clouds-before.png'});
await page.waitForTimeout(3500);
const after = await probe();
await page.screenshot({path: 'output/web-game/clouds-after.png'});
if (before.count !== 5 || after.count !== 5 || after.baked || !after.behind)
  throw new Error('Cloud count, bake exclusion or army layering failed: '+JSON.stringify(after));
if (!after.x.every((x,i) => Math.abs(x-before.x[i]) > 0.2)) throw new Error('Clouds did not drift');
const cleanup = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const old = ui.battleUi.field.list.find(o => o.getData('battleAmbient') === 'mountain-clouds');
  const clouds = old.list.filter(o => o.getData('battleAmbient') === 'mountain-mist');
  for(let i=0;i<3;i++) ui.buildBattleField(window.__mandateState.ascent.activeBattle);
  return { oldDestroyed: !old.active, oldTweens: clouds.some(o => ui.tweens.getTweensOf(o).length > 0),
    layers: ui.battleUi.field.list.filter(o => o.getData('battleAmbient') === 'mountain-clouds').length };
});
if (!cleanup.oldDestroyed || cleanup.oldTweens || cleanup.layers !== 1) throw new Error('Cleanup failed '+JSON.stringify(cleanup));
if(errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({before,after,cleanup,errors}));
await browser.close();
