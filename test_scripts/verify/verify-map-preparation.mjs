import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {startWorld,resolveOpening} from '../perf/_boot.mjs';
const out=process.env.OUT??'output/a9-performance/preparation';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>{errors.push(e.stack);console.error(e.stack)});await page.routeWebSocket('**/*',s=>s.close());
try{
 await page.goto('http://127.0.0.1:5179/?bench=1&retained=1&mapworker=1');await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
 await startWorld(page,{mode:'ascent',seed:20260812});await resolveOpening(page);await page.evaluate(()=>window.__mandateState.isStrategyPause=true);
 await page.waitForFunction(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !s.refreshPending&&!s.sceneryPending&&!s.ground.pending&&!s.fog.pending;},null,{timeout:180000});
 const result=await page.evaluate(async()=>{
  const {graphicsCells:original}=await import('/output/a9-performance/baseline/source/src/scenes/map/GraphicsChunks.ts');
  const {partitionGraphics}=await import('/src/scenes/map/GraphicsPartition.ts');
  const {MapPreparationWorker}=await import('/src/scenes/map/MapPreparationWorker.ts');
  const scene=window.__phaserGame.scene.getScene('ConquestScene');
  const run=g=>{let r=g.next();while(!r.done)r=g.next();return r.value};
  const signature=map=>JSON.stringify([...map].sort(([a],[b])=>a.localeCompare(b)).map(([key,cell])=>[key,cell.hash,cell.commands.map(Number)]));
  const sources=scene.children.list.filter(o=>o.type==='Graphics'&&o.commandBuffer.length>0);
  // Include transforms and seams beyond those used by today's authored map.
  const sample=scene.make.graphics({},false);sample.setPosition(511.25,-512.1).setScale(-1.17,2.01).setRotation(.43);
  sample.save().translateCanvas(11,17).rotateCanvas(.2).scaleCanvas(1.3,.7).fillStyle(0x123456,.3).fillRect(-512,500,1100,70).lineStyle(7,0xabcdef,.65).strokeCircle(509,511,54).restore();sources.push(sample);
  const worker=new MapPreparationWorker(),checks=[];
  for(const source of sources){
   const m=source.getWorldTransformMatrix(),matrix=[m.a,m.b,m.c,m.d,m.tx,m.ty];m.destroy();
   const a=signature(run(original(source))),b=signature(run(partitionGraphics(source.commandBuffer,matrix)));
   const ticket=worker.partition(source.commandBuffer,matrix);while(!ticket.done)await new Promise(r=>setTimeout(r,5));
   checks.push({commands:source.commandBuffer.length,pureMatches:a===b,workerMatches:!!ticket.result&&a===signature(ticket.result)});
  }
  const input=sources.find(g=>g.commandBuffer.length>4096).commandBuffer;
  const cancelled=worker.partition(input,[1,0,0,1,0,0]);cancelled.cancel();
  const pending=Array.from({length:8},()=>worker.partition(input,[1,0,0,1,0,0]));
  const bounded=worker.stats().queued<=2;
  while(pending.some(t=>!t.done))await new Promise(r=>setTimeout(r,5));
  const stats=worker.stats();worker.destroy();const shutdown=worker.partition(input,[1,0,0,1,0,0]);sample.destroy();
  return {checks,bounded,cancelledResultIgnored:!cancelled.result,shutdownFallback:shutdown.done&&!shutdown.result,stats};
 });
 await writeFile(`${out}/partition.json`,JSON.stringify({result,errors},null,2));console.log(JSON.stringify(result));
 assert(result.checks.every(c=>c.pureMatches&&c.workerMatches));assert(result.bounded&&result.cancelledResultIgnored&&result.shutdownFallback);assert.equal(errors.length,0);
}finally{await browser.close();}
