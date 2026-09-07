// Verify fallen figures use actual losing-army anchors and persist on the ground.
// Usage: DEV_URL=http://127.0.0.1:5179 WIDTH=1280 node test_scripts/verify/verify-battle-fallen.mjs
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



const result = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const ui = scene.battleUi;
  window.__mandateState.isStrategyPause = true;
  const beat = {round: 1, ourLoss: 60, theirLoss: 0, ourAdvance: 0, theirAdvance: 0};
  const start = ui.fallenPts.length;
  const anchors = [];
  const inverse = ui.field.getWorldTransformMatrix();
  const collect = (o,hostId) => {
    if(o.getData('conquestFigureAssetId')) {
      const m = o.getWorldTransformMatrix(); const p=inverse.applyInverse(m.tx,m.ty);
      anchors.push({x:p.x,y:p.y,hostId}); return;
    }
    if(o.list) o.list.forEach(c=>collect(c,hostId));
  };
  [...ui.ourMarkers,...ui.theirMarkers].forEach(m=>collect(m.marker,m.hostId));
  scene.layFallen(beat);
  const ours=ui.fallenPts.slice(start);
  if(ours.length!==2 || ours.some(p=>p.side!=='ours' || !anchors.some(a=>a.hostId===p.hostId && Math.hypot(a.x-p.x,a.y-p.y)<0.01)))
    throw new Error('Bodies do not match losing army soldier anchors');
  const noLoss=ui.fallenPts.length; scene.layFallen({...beat,ourLoss:0});
  if(ui.fallenPts.length!==noLoss) throw new Error('Zero losses created bodies');
  for(let i=0;i<6;i++) scene.layFallen({...beat,ourLoss:60,theirLoss:60,round:i+2});
  if(ui.fallenPts.slice(start).some(p=>!anchors.some(a=>a.hostId===p.hostId && Math.hypot(a.x-p.x,a.y-p.y)<0.01)))
    throw new Error('Enemy body outside host anchors');
  const saved=JSON.stringify(ui.fallenPts);
  ui.ourMarkers.forEach(m=>m.marker.x-=16);
  ui.theirMarkers.forEach(m=>m.marker.x+=16);
  if(JSON.stringify(ui.fallenPts)!==saved) throw new Error('Bodies followed moving armies');
  scene.buildBattleField(window.__mandateState.ascent.activeBattle);
  if(JSON.stringify(ui.fallenPts)!==saved || ui.groundSources.includes(ui.fallen) || !ui.fallen.visible)
    throw new Error('Rebuild lost bodies or baked the live layer');
  return {count:ui.fallenPts.length, anchors:anchors.length, sides:[...new Set(ui.fallenPts.map(p=>p.side))]};
});
await page.screenshot({path:'output/web-game/fallen-battle.png'});
await page.evaluate(()=>{
  const ui=window.__phaserGame.scene.getScene('ConquestUIScene').battleUi;
  [...ui.ourMarkers,...ui.theirMarkers].forEach(m=>m.marker.setVisible(false));
});
await page.screenshot({path:'output/web-game/fallen-detail.png'});
if(errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({result,errors}));
await browser.close();
