import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const URL=process.env.DEV_URL??'http://127.0.0.1:5180';
const OUR_STYLE=process.env.OUR_STYLE??'le';
const THEIR_STYLE=process.env.THEIR_STYLE??'ming';
// History exposes these seven wardrobes; opponents are inspected in actual battles.
const THEMES=['ly','tran','le','trinh','nguyenLord','tayson','nguyen'];
const OUT='output/dongho-style-v4/game';mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{
 localStorage.setItem('mandate:language:v1','vi');
 localStorage.setItem('mandate:graphics:v1','medium');
 localStorage.setItem('mandate:map-theme:v1','dong-ho');
});
try{
 await page.goto(`${URL}/?capture=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'),null,{timeout:30000});
 await page.evaluate(()=>window.__startBenchGame(20260901,'ascent', 'v1'));
 await page.waitForFunction(()=>window.__phaserGame.scene.isActive('ConquestScene'),null,{timeout:30000});
 for(const zoom of [1.2,2.4]){
  await page.evaluate(({zoom,style})=>{
   const map=window.__phaserGame.scene.getScene('ConquestScene'),st=window.__mandateState;
   st.isPaused=true;map.ascentAccumulator=-1e9;st.muster.dynasty=style;
   // Art inspection: hide the opening founder sheet so the world is visible.
   window.__phaserGame.scene.getScene('ConquestUIScene').scene.setVisible(false);
   st.lands.forEach(l=>{l.isVisible=true;l.isExplored=true;});
   map.refresh();
   const land=st.lands.find(l=>l.ownerId==='dai-viet'&&l.type==='castle')??st.lands.find(l=>l.ownerId==='dai-viet');
   const at=map.getSettlementAnchor(land);map.setMapZoom(zoom);
   const cam=map.cameras.main,scale=cam.zoom/zoom;
   cam.removeBounds();cam.scrollX=map.wx(at.x)-390/(2*zoom);
   cam.scrollY=map.wy(at.y)-cam.height/scale/(2*zoom);
  },{zoom,style:OUR_STYLE});
  await page.waitForTimeout(1200);await page.screenshot({path:`${OUT}/map-${zoom}.png`});
 }
 await page.evaluate(()=>{
  for(const key of ['ConquestUIScene','ConquestScene'])window.__phaserGame.scene.stop(key);
  window.__phaserGame.scene.start('HistoryScene');
 });
 await page.waitForFunction(()=>window.__phaserGame.scene.isActive('HistoryScene'));
 for(const theme of THEMES){
  await page.evaluate(theme=>{
   const s=window.__phaserGame.scene.getScene('HistoryScene');
   s.tab='army';s.armyTheme=theme;s.armyTier=2;s.armyArm='mounted';s.pendingScroll=0;s.render();
  },theme);
  await page.waitForTimeout(350);await page.screenshot({path:`${OUT}/history-${theme}.png`});
 }
 await page.evaluate(()=>{
  window.__phaserGame.scene.stop('HistoryScene');
  window.__phaserGame.scene.start('BattleArenaScene');
 });
 await page.waitForFunction(()=>window.__phaserGame.scene.isActive('BattleArenaScene'));
 await page.evaluate(({ours,theirs})=>{
  const s=window.__phaserGame.scene.getScene('BattleArenaScene');
  s.ourStyle=ours;s.theirStyle=theirs;s.ourMen=1500;s.theirMen=1500;s.martial=70;s.ground='hills';s.startFight();
 },{ours:OUR_STYLE,theirs:THEIR_STYLE});
 await page.waitForFunction(()=>window.__phaserGame.scene.isActive('ConquestScene'));
 await page.evaluate(()=>{
  // The earlier still-map inspection froze this reusable scene's accumulator.
  // Restore its real clock before observing the arena's normal opening and orders.
  window.__phaserGame.scene.getScene('ConquestScene').ascentAccumulator=0;
  window.__mandateState.isPaused=false;
 });
 await page.waitForTimeout(900);
 await page.screenshot({path:`${OUT}/battle-standing.png`});
 const startX=await page.evaluate(()=>window.__phaserGame.scene.getScene('ConquestUIScene').battleUi.ourMarkers[0].marker.x);
 await page.waitForFunction(startX=>{
  const marker=window.__phaserGame.scene.getScene('ConquestUIScene').battleUi?.ourMarkers[0]?.marker;
  return marker&&Math.abs(marker.x-startX)>2;
 },startX,{timeout:40000});
 const motion=[];
 for(let i=0;i<4;i++){
  motion.push(await page.evaluate(()=>{
   const marker=window.__phaserGame.scene.getScene('ConquestUIScene').battleUi.ourMarkers[0].marker;
   return {x:marker.x,frame:marker.getData('conquestArmyFrameAnimation').frame};
  }));
  await page.screenshot({path:`${OUT}/battle-moving-${i}.png`});
  await page.waitForTimeout(220);
 }
 const state=await page.evaluate(style=>({text:window.render_game_to_text(),
  battle:window.__mandateState.ascent?.activeBattle,
  loaded:window.__phaserGame.textures.get(`conquest-art:figure.${style}.royal.mounted`).source[0].image.src}),OUR_STYLE);
 assert(motion.some(m=>Math.abs(m.x-startX)>2),'battle capture must show a crossing line');
 writeFileSync(`${OUT}/state.json`,JSON.stringify({state,motion,ours:OUR_STYLE,theirs:THEIR_STYLE,errors},null,2));
 console.log(JSON.stringify({activeBattle:!!state.battle,round:state.battle?.round,motion,source:state.loaded,errors}));
 if(errors.length)process.exitCode=1;
}finally{await browser.close();}
