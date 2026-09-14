import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.DEV_URL??'http://127.0.0.1:5180';
const browser=await chromium.launch();
try{
 for(const quality of ['low','medium','high']){
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(q=>{
   localStorage.setItem('mandate:graphics:v1',q);
   localStorage.setItem('mandate:map-theme:v1','dong-ho');
  },quality);
  await page.goto(`${base}/?capture=1&noladder=1`);
  await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'),null,{timeout:30000});
  await page.evaluate(()=>window.__startBenchGame(20260901,'ascent', 'v1'));
  await page.waitForFunction(()=>window.__phaserGame.scene.isActive('ConquestScene'));
  const result=await page.evaluate(()=>{
   const map=window.__phaserGame.scene.getScene('ConquestScene');map.state.isPaused=true;
   map.state.lands.forEach(l=>{l.isVisible=true;l.isExplored=true;});map.refresh();
   const source=map.children.list.filter(o=>o.type==='Image'&&o.getData('conquestGroundOrder')==='settlement');
   const decorations=map.children.list.filter(o=>o.type==='Image'&&['scatter','relief'].includes(o.getData('conquestGroundOrder')));
   const rt=map.staticBakeRT,original=rt.draw,drawn=[];
   rt.draw=function(items,...args){drawn.push(...(Array.isArray(items)?items:[items]));return original.call(this,items,...args);};
   try{map.bakeStaticTerrain();}finally{rt.draw=original;}
   const result={structures:source.length,baked:source.filter(o=>drawn.includes(o)).length,
    decorations:decorations.length,decorationBaked:decorations.filter(o=>drawn.includes(o)).length,
    decorationVisible:decorations.filter(o=>o.visible).length,
    visible:source.filter(o=>o.visible).length,
    graphics:map.children.list.filter(o=>o.type==='Graphics'&&o.getData('conquestGroundOrder')==='settlement')
      .map(o=>({baked:drawn.includes(o),visible:o.visible}))};
   const cam=map.cameras.main,home={x:cam.scrollX,y:cam.scrollY};
   cam.scrollX=-100000;cam.scrollY=-100000;map.syncViewCulling(true);
   const awayVisible=source.filter(o=>o.visible).length;
   const decorationAway=decorations.filter(o=>o.visible).length;
   cam.scrollX=home.x;cam.scrollY=home.y;map.syncViewCulling(true);
   return {...result,awayVisible,restoredVisible:source.filter(o=>o.visible).length,
    decorationAway,decorationRestored:decorations.filter(o=>o.visible).length};
  });
  assert(result.structures>0,`${quality}: missing structures`);
  assert.equal(result.baked,quality==='low'?result.structures:0,`${quality}: structure bake policy`);
  if(quality==='low')assert.equal(result.visible,0,'low: baked sources hidden');
  else assert(result.visible>0&&result.visible<result.structures,`${quality}: only nearby structures live after rebake`);
  assert.equal(result.awayVisible,0,`${quality}: offscreen structure culling`);
  assert(result.decorations>0,`${quality}: missing landscape images`);
  assert.equal(result.decorationBaked,quality==='low'?result.decorations:0,`${quality}: landscape bake policy`);
  assert.equal(result.decorationAway,0,`${quality}: offscreen landscape culling`);
  if(quality==='low')assert.equal(result.decorationVisible,0,'low: baked landscape hidden');
  else {
   assert(result.decorationVisible>0&&result.decorationVisible<result.decorations,`${quality}: only nearby landscape live`);
   assert(result.decorationRestored>0,`${quality}: landscape restored after panning`);
  }
  if(quality!=='low')assert(result.restoredVisible>0,`${quality}: structures restored after panning`);
  if(quality==='medium')assert(result.graphics.every(o=>o.baked&&!o.visible),'medium: vector ink drawn twice');
  assert.deepEqual(errors,[]);
  console.log(`${quality}: ${result.structures} structures, ${result.baked} baked, ${result.visible} live; ${result.decorations} landscape images, ${result.decorationBaked} baked, ${result.decorationVisible} live; culling restored, no duplicate vector ink`);
  await page.close();
 }
}finally{await browser.close();}
