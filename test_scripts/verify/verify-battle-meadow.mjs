// Verify live meadow movement, army layering, bake exclusion and rebuild cleanup.
// Usage: DEV_URL=http://127.0.0.1:5179 WIDTH=1280 node test_scripts/verify/verify-battle-meadows.mjs
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
  // Hold combat to keep a random battle-moment overlay out of ambient visual checks.
  window.__mandateState.isStrategyPause = true;
});


const probe = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene').battleUi;
  const layer = ui.field.list.find(o => o.getData('battleAmbient') === 'meadow-insects');
  const meadows = layer?.list.filter(o => o.getData('battleInsect')) ?? [];
  return { count: meadows.length, x: meadows.map(o => o.x),
    motion: meadows.map(o => o.getData('battleInsectMotion')),
    span: meadows.map(o => o.getData('battleInsectSpan')), wings: meadows.slice(0,4).map(o => o.list[0].scaleX),
    baked: ui.groundSources.includes(layer),
    behind: ui.field.list.indexOf(layer) < ui.field.list.indexOf(ui.foreground) };
});
const before = await probe();
await page.screenshot({path: 'output/web-game/meadows-before.png'});
const samples = [before];
for (let i=0;i<16;i++) { await page.waitForTimeout(400); samples.push(await probe()); }
const after = samples.at(-1);
await page.screenshot({path: 'output/web-game/meadows-after.png'});
if (before.count !== 7 || after.count !== 7 || after.baked || !after.behind)
  throw new Error('Meadow count, bake exclusion or army layering failed: '+JSON.stringify(after));
if (!after.x.every((_,i) => Math.max(...samples.map(s=>s.x[i]))-Math.min(...samples.map(s=>s.x[i])) > 2)) throw new Error('Insects did not visibly travel');
if(!samples.some(s=>s.motion.includes('resting'))||!samples.some(s=>s.motion.includes('flying')))throw new Error('Natural flight/rest states missing');
if (!after.span.every(s => s < 3) || !samples.some(sample => sample.wings.some((s,i) => Math.abs(s-before.wings[i]) > 0.01))) throw new Error('Insect size or wing motion failed');
const cleanup = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const old = ui.battleUi.field.list.find(o => o.getData('battleAmbient') === 'meadow-insects');
  const insects = old.list.filter(o => o.getData('battleInsect'));
  const meadows = insects.flatMap(o => [o, ...o.list]);
  for(let i=0;i<3;i++) ui.buildBattleField(window.__mandateState.ascent.activeBattle);
  return { oldDestroyed: !old.active, oldTweens: meadows.some(o => ui.tweens.getTweensOf(o).length > 0),
    layers: ui.battleUi.field.list.filter(o => o.getData('battleAmbient') === 'meadow-insects').length };
});
if (!cleanup.oldDestroyed || cleanup.oldTweens || cleanup.layers !== 1) throw new Error('Cleanup failed '+JSON.stringify(cleanup));
if(errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({before,after,cleanup,errors}));
await browser.close();
