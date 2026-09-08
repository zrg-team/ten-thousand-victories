/** Allocation sampling is intentionally separate from timing windows. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {startWorld,resolveOpening} from './_boot.mjs';
const out=process.env.OUT??'output/a9-performance/allocations';await mkdir(out,{recursive:true});
for(const [version,url] of Object.entries({baseline:process.env.BASELINE_URL,candidate:process.env.CANDIDATE_URL}).filter(([,url])=>url)){
 const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1280,height:800}}),cdp=await page.context().newCDPSession(page);
 try{
  await page.addInitScript(()=>{localStorage.setItem('mandate:layout:v1','desktop');localStorage.setItem('mandate:graphics:v1','high')});
  const target=new URL(url);target.searchParams.set('bench','1');await page.goto(target.href);await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
  await startWorld(page,{mode:'ascent',seed:20260812});await resolveOpening(page);await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();});
  await page.waitForFunction(()=>{const p=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending;},null,{timeout:180000});
  await cdp.send('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  const before=await cdp.send('Runtime.getHeapUsage');
  await page.mouse.move(750,350);await page.mouse.down();for(let i=0;i<240;i++){await page.mouse.move(750+Math.sin(i/20)*180,350+Math.cos(i/28)*120);await page.waitForTimeout(16);}await page.mouse.up();
  const after=await cdp.send('Runtime.getHeapUsage'),{profile}=await cdp.send('HeapProfiler.stopSampling');
  await writeFile(`${out}/${version}.heapprofile`,JSON.stringify(profile));await writeFile(`${out}/${version}.json`,JSON.stringify({before,after,samplingInterval:32768,sampledBytes:profile.samples.reduce((n,s)=>n+s.size,0),note:'Statistical allocation sampling, not an exact allocation counter; no forced GC.'},null,2));
 }finally{await browser.close();}
}
