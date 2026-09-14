import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const URL=process.env.DEV_URL??'http://127.0.0.1:5180',OUT='output/dongho-map-v4/game';
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{
 localStorage.setItem('mandate:language:v1','vi');
 localStorage.setItem('mandate:graphics:v1','medium');
 localStorage.setItem('mandate:map-theme:v1','dong-ho');
});
try{
 await page.goto(`${URL}/?capture=1&noladder=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'),null,{timeout:30000});
 await page.evaluate(()=>window.__startBenchGame(20260901,'ascent', 'v1'));
 await page.waitForFunction(()=>window.__phaserGame.scene.isActive('ConquestScene'),null,{timeout:30000});
 await page.evaluate(()=>{
  const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isPaused=true;s.ascentAccumulator=-1e9;
  s.state.lands.forEach(l=>{l.isVisible=true;l.isExplored=true;});
  window.__phaserGame.scene.getScene('ConquestUIScene').scene.setVisible(false);s.refresh();
 });
 const shots=[];
 for(const season of ['Spring','Summer','Autumn','Winter'])for(const view of ['country','village','fields','mountains']){
  const sceneState=await page.evaluate(({season,view})=>{
   const s=window.__phaserGame.scene.getScene('ConquestScene'),st=s.state;st.season=season;s.refresh();
   const home=st.lands.find(l=>l.ownerId==='dai-viet'&&l.type==='castle')??st.lands.find(l=>l.ownerId==='dai-viet');
   const at=s.getSettlementAnchor(home),zoom=view==='country'?1.2:view==='fields'?1.8:view==='mountains'?1.6:2.4;s.setMapZoom(zoom);
   const focusKey=view==='fields'?'conquestTerrainPlate':view==='mountains'?'conquestReliefArt':null;
   const focus=focusKey?s.children.list.filter(c=>c.getData?.(focusKey)
    && (view!=='mountains'||c.getData(focusKey).startsWith('terrain.karst-')))
    .sort((a,b)=>Math.hypot(a.x-s.wx(at.x),a.y-s.wy(at.y))-Math.hypot(b.x-s.wx(at.x),b.y-s.wy(at.y)))[0]:null;
   const cam=s.cameras.main,scale=cam.zoom/zoom;cam.removeBounds();
   const focusY=focus?focus.y-(view==='mountains'?focus.displayHeight/2:0):s.wy(at.y);
   cam.scrollX=(focus?.x??s.wx(at.x))-390/(2*zoom);cam.scrollY=focusY-cam.height/scale/(2*zoom);
   return {season,view,zoom,at,flora:s.children.list.filter(c=>c.getData?.('conquestScatterArt')).length,
    relief:s.children.list.filter(c=>c.getData?.('conquestReliefArt')).length,
    paddies:s.children.list.filter(c=>c.getData?.('conquestTerrainPlate')).length};
  },{season,view});
  await page.waitForTimeout(900);await page.screenshot({path:`${OUT}/${season.toLowerCase()}-${view}.png`});shots.push(sceneState);
 }
 const state=await page.evaluate(()=>window.render_game_to_text());
 assert.equal(errors.length,0,errors.join('\n'));
 writeFileSync(`${OUT}/state.json`,JSON.stringify({shots,state,errors},null,2)+'\n');
 console.log(JSON.stringify({shots,errors}));
}finally{await browser.close();}
