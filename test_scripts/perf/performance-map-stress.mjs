/** Full revealed-map visual preparation gate, separately from the ordinary six-land fixture. */
import assert from 'node:assert/strict';
import { boot, startWorld, resolveOpening, FIRST_OPTION } from './_boot.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const { browser, page, cdp, errors } = await boot({ quality: 'medium', dpr: 3, query: '?capture=1&bench=1' });
const idle = () => page.waitForFunction(() => {
  const s=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();
  return !s.refreshPending&&!s.sceneryPending&&!s.ground.pending&&!s.fog.pending;
},null,{timeout:180000});
try {
  await startWorld(page,{mode:'ascent'});await resolveOpening(page);
  await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();});await idle();
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const before=await page.evaluate(()=>window.__phaserGame.scene.getScene('ConquestScene').performanceStats());
  const change=await page.evaluate(src=>{
    const s=window.__phaserGame.scene.getScene('ConquestScene'),state=s.state,from=state.season,first=eval(src);let ticks=0;
    while(state.season===from&&ticks++<5){let n=0;while(state.pendingAscentPrompt&&n++<20)window.__performanceBench.resolve(first(state.pendingAscentPrompt));window.__performanceBench.tick();}
    // Keep the revealed-world fixture after the real season tick recomputes normal visibility.
    for(const land of state.lands){land.isVisible=true;land.isExplored=true;}
    s.refreshCosts=[];s.workCosts={};s.groundChunks.frameCosts=[];s.overlays.fogChunks.frameCosts=[];
    s.refresh();state.isStrategyPause=true;
    return {from,to:state.season,ticks,lands:state.lands.length};
  },FIRST_OPTION);
  const start=Date.now();await idle();
  const after=await page.evaluate(()=>window.__phaserGame.scene.getScene('ConquestScene').performanceStats());
  const result={change,elapsedMs:Date.now()-start,before,after,errors};
  await mkdir('output/performance-review/full-map',{recursive:true});
  await writeFile('output/performance-review/full-map/results.json',JSON.stringify(result,null,2));
  assert.notEqual(change.from,change.to);assert.equal(after.ground.invalidations-before.ground.invalidations,1);
  assert.ok(Math.max(after.maxRefreshWorkMs,after.ground.maxWorkMs,after.fog.maxWorkMs)<50,JSON.stringify(after));
  assert.ok(after.ground.bytes<=64*1048576);assert.deepEqual(errors,[]);
  console.log('PASS full-map season preparation',JSON.stringify(result));
} finally {await browser.close();}
