// Verify live meadow movement, army layering, bake exclusion and rebuild cleanup.
// Usage: DEV_URL=http://127.0.0.1:5179 WIDTH=1280 node test_scripts/verify/verify-battle-meadow.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const HEIGHT = Number(process.env.HEIGHT ?? 844);
const OUT = `output/battle-scenery/${process.env.WIDTH ?? 390}x${HEIGHT}`;
mkdirSync(OUT, {recursive: true});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.WIDTH ?? 390), height: HEIGHT }, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  localStorage.setItem('mandate:tile-assets:v1', 'on');
  localStorage.setItem('mandate:life:v1', JSON.stringify({ mapLife: 'full', motion: 'full' }));
  localStorage.setItem('mandate:layout:v1', innerWidth >= 780 ? 'desktop' : 'phone');
});
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
  return { count: meadows.length, x: meadows.map(o => o.x), y: meadows.map(o => o.y),
    motion: meadows.map(o => o.getData('battleInsectMotion')),
    span: meadows.map(o => o.getData('battleInsectSpan')),
    wings: meadows.filter(o => o.getData('battleInsect') === 'butterfly').map(o => o.list[0].frame?.name ?? o.list[0].scaleX),
    authored: meadows.filter(o => o.getData('battleInsect') === 'butterfly').every(o => o.list[0].texture?.key === 'life:butterflies-dongho-v1'),
    grassBaked: ui.groundSources.some(o => o.getData('battleTileGround') && !o.visible && o.list.length > 0),
    camps: ui.field.list.filter(o => o.getData('battleCamp')).map(o => ({y: o.y, scale: o.getData('battleCamp').scale})),
    horizon: ui.content.y + ui.fieldHeight * 0.30, groundY: ui.geometry.groundY,
    baked: ui.groundSources.includes(layer),
    behind: ui.field.list.indexOf(layer) < ui.field.list.indexOf(ui.foreground) };
});
const before = await probe();
await page.screenshot({path: `${OUT}/before.png`});
const samples = [before];
for (let i=0;i<16;i++) { await page.waitForTimeout(400); samples.push(await probe()); }
const after = samples.at(-1);
await page.screenshot({path: `${OUT}/after.png`});
if (before.count !== 7 || after.count !== 7 || after.baked || !after.behind)
  throw new Error('Meadow count, bake exclusion or army layering failed: '+JSON.stringify(after));
if (!after.x.every((_,i) => samples.some(a => samples.some(b => Math.hypot(a.x[i]-b.x[i], a.y[i]-b.y[i]) > 2)))) throw new Error('Insects did not visibly travel');
if(!samples.some(s=>s.motion.includes('resting'))||!samples.some(s=>s.motion.includes('flying')))throw new Error('Natural flight/rest states missing');
if (!after.span.every(s => s < 5) || !after.authored || !samples.some(sample => sample.wings.some((s,i) => s !== before.wings[i]))) throw new Error('Insect size, authored art or wing motion failed');
if (!after.grassBaked || after.camps.length !== 2 || !after.camps.every(c => c.y > after.horizon && c.y < after.horizon + (after.groundY - after.horizon) * 0.2)) throw new Error('Textured ground or distant camps missing');
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
const settings = await page.evaluate(async () => {
  const { setTileAssetsEnabled } = await import('/src/game/groundSettings.ts');
  const { setLifeSettings } = await import('/src/game/lifeSettings.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const count = () => ui.battleUi.field.list.find(o => o.getData('battleAmbient') === 'meadow-insects')?.list.length ?? 0;
  const grass = () => ui.battleUi.groundSources.some(o => o.getData('battleTileGround'));
  setTileAssetsEnabled(false); ui.updateBattle();
  const paper = !grass(), butterfliesWithoutTiles = count();
  setLifeSettings({mapLife: 'off'}); ui.updateBattle();
  const off = count();
  setLifeSettings({mapLife: 'calm', motion: 'reduced'}); ui.updateBattle();
  const calm = count();
  const layer = ui.battleUi.field.list.find(o => o.getData('battleAmbient') === 'meadow-insects');
  const reduced = layer.list.every(o => ui.tweens.getTweensOf(o).every(t => t.timeScale === 0.5));
  setTileAssetsEnabled(true); setLifeSettings({mapLife: 'full', motion: 'full'}); ui.updateBattle();
  return {paper, butterfliesWithoutTiles, off, calm, reduced, restored: grass() && count() === 7};
});
if (!settings.paper || settings.butterfliesWithoutTiles !== 7 || settings.off !== 0 || settings.calm !== 4 || !settings.reduced || !settings.restored) throw new Error('Settings failed '+JSON.stringify(settings));
if(errors.length) throw new Error(errors.join('\n'));
writeFileSync(`${OUT}/report.json`, JSON.stringify({before,after,cleanup,settings,errors}, null, 2));
console.log(JSON.stringify({count: after.count, authored: after.authored, grassBaked: after.grassBaked, camps: after.camps, cleanup, settings, errors}));
await browser.close();
