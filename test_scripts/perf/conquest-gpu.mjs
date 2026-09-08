import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {startWorld,resolveOpening} from './_boot.mjs';
import {gpuSample} from './gpu-timing.mjs';
const out=process.env.OUT??'output/a9-performance/gpu';await mkdir(out,{recursive:true});const results=[];
for(const quality of ['high','medium','clarity'])for(const [version,base] of Object.entries({baseline:process.env.BASELINE_URL,candidate:process.env.CANDIDATE_URL}).filter(([,url])=>url)){
 const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,hasTouch:true,serviceWorkers:'block'});
 try {
  await page.addInitScript(quality=>{localStorage.setItem('mandate:graphics:v1',quality==='clarity'?'medium':quality);localStorage.setItem('mandate:layout:v1','desktop');localStorage.setItem('mandate:language:v1','en');},quality);
  const url=new URL(base);url.searchParams.set('bench','1');await page.goto(url.href);await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
  if(quality==='clarity')await page.evaluate(()=>window.__ladder.force('clarity'));
  await startWorld(page,{mode:'ascent',seed:20260812});await resolveOpening(page);
  await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();s.setMapZoom(.72);s.cameras.main.setScroll(64.28011937706562,1106.6053187994319);});
  await page.waitForFunction(()=>{const p=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending;},null,{timeout:180000});await page.waitForTimeout(500);
  const result={quality,version,...await gpuSample(page)};results.push(result);console.log(JSON.stringify({...result,ms:result.ms?.length}));
 }finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
}
