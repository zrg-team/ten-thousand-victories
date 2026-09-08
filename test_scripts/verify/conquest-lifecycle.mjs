/** Same-state retained memory, real touch controls, pools and WebGL recovery. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {startWorld,resolveOpening,driveToBattle} from '../perf/_boot.mjs';
const out=process.env.OUT??'output/a9-performance/lifecycle';await mkdir(out,{recursive:true});
const cycleCount=Number(process.env.CYCLES??6);
assert(Number.isInteger(cycleCount)&&cycleCount>=6,'CYCLES must be at least six');
const results=[];
for(const [version,base] of Object.entries({baseline:process.env.BASELINE_URL,candidate:process.env.CANDIDATE_URL??process.env.DEV_URL??'http://127.0.0.1:5179/'}).filter(([,url])=>url)){
 const browser=await chromium.launch({headless:false}),contextPage=await browser.newContext({viewport:{width:1280,height:800},hasTouch:true}),page=await contextPage.newPage(),cdp=await contextPage.newCDPSession(page),errors=[],cycles=[];
 try{
  page.on('pageerror',e=>{errors.push(e.stack);console.error(e.stack)});
  await page.addInitScript(()=>{localStorage.setItem('mandate:layout:v1','desktop');localStorage.setItem('mandate:graphics:v1','high');localStorage.setItem('mandate:language:v1','en')});
  const url=new URL(base);url.searchParams.set('bench','1');await page.goto(url.href);await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
  const settled=()=>page.waitForFunction(()=>{const p=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending;},null,{timeout:180000});
  for(let cycle=0;cycle<cycleCount;cycle++){
   await startWorld(page,{mode:'ascent',seed:20260812});await resolveOpening(page);await page.evaluate(()=>window.__mandateState.isStrategyPause=true);await settled();
   // Warm identical UI/text/portrait families before comparing retained heap.
   await page.evaluate(()=>{const ui=window.__phaserGame.scene.getScene('ConquestUIScene');ui.showCodex();ui.closeLane();});await page.waitForTimeout(100);await cdp.send('HeapProfiler.collectGarbage');
   const heap=(await cdp.send('Runtime.getHeapUsage')).usedSize;
   const state=await page.evaluate(()=>{const g=window.__phaserGame,s=g.scene.getScene('ConquestScene');return {stats:s.performanceStats(),objects:s.children.list.length,buffers:g.renderer.glBufferWrappers.length,vaos:g.renderer.glVAOWrappers.length,textureCount:Object.keys(g.textures.list).length}});
   cycles.push({cycle,heap,...state});console.log(JSON.stringify({version,cycle,heapMiB:heap/1048576,buffers:state.buffers,vaos:state.vaos}));
  }
  const touch=[];
  for(const viewport of [{width:1280,height:800},{width:800,height:1280}]){
   await page.setViewportSize(viewport);await settled();
   const before=await page.evaluate(()=>{const c=window.__phaserGame.scene.getScene('ConquestScene').cameras.main;return [c.scrollX,c.scrollY,c.zoom]});
   const x=viewport.width*.58,y=viewport.height*.43;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   for(let i=1;i<=24;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*3,y:y+i*2,id:1}]});await page.waitForTimeout(16);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);
   const after=await page.evaluate(()=>{const c=window.__phaserGame.scene.getScene('ConquestScene').cameras.main;return [c.scrollX,c.scrollY,c.zoom]});
   const zoomBefore=await page.evaluate(()=>window.__phaserGame.scene.getScene('ConquestScene').mapZoom);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-40,y,id:1},{x:x+40,y,id:2}]});
   for(let i=1;i<=20;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-40-i*3,y,id:1},{x:x+40+i*3,y,id:2}]});await page.waitForTimeout(16);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled();
   const zoom=await page.evaluate(()=>window.__phaserGame.scene.getScene('ConquestScene').mapZoom);
   touch.push({viewport,before,after,zoomBefore,zoom,pinchChangedZoom:zoom!==zoomBefore});assert(Math.hypot(after[0]-before[0],after[1]-before[1])>20,'touch pan');
   await page.screenshot({path:`${out}/${version}-${viewport.width}.png`});
  }
  let pools;
  if(version==='candidate')pools=await page.evaluate(()=>{
   const s=window.__phaserGame.scene.getScene('ConquestScene'),cache=s.progressBadges;
   cache.begin('build');const first=cache.get('pool-fixture',200,200,1,10,'build');cache.end('build');
   cache.begin('build');const second=cache.get('pool-fixture',200,200,2,10,'build');cache.end('build');
   const stable=first===second;
   cache.begin('build');for(let i=0;i<80;i++)cache.get(`fixture-${i}`,200,200,i,100,'build');cache.end('build');
   cache.begin('build');cache.end('build');const stats=cache.stats();
   return {stable,...stats};
  });
  if(pools){assert(pools.stable);assert(Object.values(pools.idle).every(n=>n<=32));}
  // Exercise real browser-tab visibility in addition to the explicit focus events.
  // Neither reproduces Android process eviction or thermal suspension.
  await page.setViewportSize({width:1280,height:800});
  await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();s.setMapZoom(.72);s.cameras.main.setScroll(180,980);});await settled();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(300);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settled();
  const backgroundTab=await page.context().newPage();await backgroundTab.bringToFront();await page.waitForTimeout(500);
  const hidden=await page.evaluate(()=>document.hidden);
  await page.bringToFront();await backgroundTab.close();await settled();await page.waitForTimeout(300);
  const resumed=await page.evaluate(()=>({hidden:document.hidden,frame:window.__phaserGame.loop.frame}));
  await page.waitForTimeout(200);
  const resumedFrame=await page.evaluate(()=>window.__phaserGame.loop.frame);
  const background={hidden,resumedHidden:resumed.hidden,framesAfterResume:resumedFrame-resumed.frame,
   visibilityTransitionVerified:hidden&&!resumed.hidden,
   note:hidden?'Browser reported a hidden-to-visible transition.':'Driver kept the game visible; real hidden-tab suspension is unavailable in this run. Explicit blur/focus handlers were exercised separately.'};
  console.log(JSON.stringify({version,background}));
  assert(!resumed.hidden&&background.framesAfterResume>0,'rendering after returning to the game tab');
  const cameraBefore=await page.evaluate(()=>{const c=window.__phaserGame.scene.getScene('ConquestScene').cameras.main;return [c.scrollX,c.scrollY,c.zoom]});
  const context=await page.evaluate(()=>{const g=window.__phaserGame,ext=g.renderer.gl.getExtension('WEBGL_lose_context');if(!ext)return false;window.__restoreTest=ext;ext.loseContext();return true;});
  if(context){await page.waitForTimeout(350);await page.evaluate(()=>window.__restoreTest.restoreContext());await page.waitForFunction(()=>!window.__phaserGame.renderer.contextLost);await settled();await page.waitForTimeout(200);}
  const recovered=await page.evaluate(()=>{const g=window.__phaserGame,s=g.scene.getScene('ConquestScene'),c=s.cameras.main;return {initialGlError:g.renderer.gl.getError(),lost:g.renderer.contextLost,stats:s.performanceStats(),camera:[c.scrollX,c.scrollY,c.zoom],visibleScenery:s.children.list.filter(o=>o.type==='Image'&&o.visible&&o.getData('decorationKey')).length}});
  recovered.cameraBefore=cameraBefore;
  await page.waitForTimeout(250);
  recovered.glError=await page.evaluate(()=>window.__phaserGame.renderer.gl.getError());
  assert.equal(recovered.glError,0,'steady rendering after context recovery');assert.equal(recovered.lost,false);
  assert(recovered.visibleScenery>100,'context recovery renders a populated scenery viewport');
  await page.screenshot({path:`${out}/${version}-restored.png`});
  const battle=await driveToBattle(page);
  assert(battle,'seeded campaign reaches a live battle');
  await page.evaluate(()=>window.__phaserGame.scene.getScene('ConquestUIScene').showBattle());
  await page.waitForTimeout(500);await page.screenshot({path:`${out}/${version}-battle.png`});
  await page.evaluate(()=>{const ui=window.__phaserGame.scene.getScene('ConquestUIScene');ui.closeLane();for(let i=0;i<30&&window.__mandateState.ascent.activeBattle;i++)window.__performanceBench.fightRound();ui.events.emit('state-changed');window.__phaserGame.scene.getScene('ConquestScene').refresh();});
  await settled();
  const battleAfter=await page.evaluate(()=>!!window.__mandateState.ascent.activeBattle);
  const result={version,cycles,touch,pools,background,context,recovered,battle,battleAfter,errors};results.push(result);assert.equal(errors.length,0);
 }catch(error){results.push({version,cycles,errors,failure:String(error)});throw error;}
 finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
}
if(results.length===2){const median=v=>v.sort((a,b)=>a-b)[Math.floor(v.length/2)],a=median(results[0].cycles.slice(2).map(c=>c.heap)),b=median(results[1].cycles.slice(2).map(c=>c.heap));const comparison={baselineMiB:a/1048576,candidateMiB:b/1048576,deltaMiB:(b-a)/1048576,within10MiB:b-a<=10*1048576};await writeFile(`${out}/memory.json`,JSON.stringify(comparison,null,2));assert(comparison.within10MiB);}
