/** Verify deterministic geometry and settled culling, independently of input/frame scheduling. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {startWorld,resolveOpening} from '../perf/_boot.mjs';
const out=process.env.OUT??'output/a9-performance/fixture';await mkdir(out,{recursive:true});const results=[];
for(const quality of ['high','medium','clarity'])for(const [version,base] of Object.entries({baseline:process.env.BASELINE_URL,candidate:process.env.CANDIDATE_URL}).filter(([,url])=>url)){
 const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,hasTouch:true,serviceWorkers:'block'});
 try{
  await page.addInitScript(q=>{localStorage.setItem('mandate:graphics:v1',q==='clarity'?'medium':q);localStorage.setItem('mandate:layout:v1','desktop');},quality);
  const url=new URL(base);url.searchParams.set('bench','1');await page.goto(url.href);await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
  if(quality==='clarity')await page.evaluate(()=>window.__ladder.force('clarity'));
  await startWorld(page,{mode:'ascent',seed:20260812});await resolveOpening(page);
  await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();s.setMapZoom(.72);s.cameras.main.setScroll(64.28011937706562,1106.6053187994319);});
  await page.waitForFunction(()=>{const p=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending;},null,{timeout:180000});
  const result=await page.evaluate(()=>{
   const s=window.__phaserGame.scene.getScene('ConquestScene');s.syncViewCulling(true);
   const images=s.children.list.filter(o=>o.type==='Image'&&o.getData('decorationKey'));
   const geometry=images.map(o=>[o.getData('decorationKey'),o.x,o.y,o.scaleX,o.scaleY,o.rotation,o.texture.key,o.frame.name,o.alpha,o.tintTopLeft,o.flipX,o.flipY,o.depth]);
   return {geometry,visible:images.filter(o=>o.visible).map(o=>o.getData('decorationKey')).sort(),buffer:[s.game.renderer.gl.drawingBufferWidth,s.game.renderer.gl.drawingBufferHeight]};
  });
  results.push({quality,version,objects:result.geometry.length,geometryHash:createHash('sha256').update(JSON.stringify(result.geometry)).digest('hex'),visible:result.visible,buffer:result.buffer});
 }finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
}
for(const quality of ['high','medium','clarity']){const a=results.find(r=>r.quality===quality&&r.version==='baseline'),b=results.find(r=>r.quality===quality&&r.version==='candidate');if(a&&b){assert.equal(a.geometryHash,b.geometryHash,`${quality} geometry`);assert.deepEqual(a.visible,b.visible,`${quality} settled visibility`);assert.deepEqual(a.buffer,b.buffer);}}
console.log(JSON.stringify(results.map(r=>({...r,visible:r.visible.length}))));
