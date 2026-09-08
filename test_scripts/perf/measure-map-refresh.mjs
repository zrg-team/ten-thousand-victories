import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {startWorld,resolveOpening} from './_boot.mjs';
const out=process.env.OUT??'output/a9-performance/refresh';await mkdir(out,{recursive:true});
const results=[];
for(const worker of (process.env.WORKERS??'0,1').split(',').map(value=>value==='1')){
 const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 try{
  await page.routeWebSocket('**/*',s=>s.close());page.on('pageerror',e=>errors.push(e.stack));
  await page.addInitScript(()=>{localStorage.setItem('mandate:graphics:v1','high');localStorage.setItem('mandate:layout:v1','desktop');});
  const url=new URL(process.env.DEV_URL??'http://127.0.0.1:5179/');url.searchParams.set('bench','1');url.searchParams.set('retained','1');url.searchParams.set('mapworker',worker?'1':'0');
  await page.goto(url.href);await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));await startWorld(page,{mode:'ascent',seed:20260812});await resolveOpening(page);
  const settled=()=>page.waitForFunction(()=>{const p=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending;},null,{timeout:180000});
  await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();});await settled();
  for(const season of ['Summer','Autumn','Winter']){
   const result=await page.evaluate(season=>new Promise(resolve=>{
    const g=window.__phaserGame,s=g.scene.getScene('ConquestScene'),start=performance.now(),cpu=[],queue=[],costs=[];
    const step=s.nextVisual;s.nextVisual=function(...args){const a=performance.now();try{return step.apply(this,args)}finally{costs.push({tag:s.workTag,ms:performance.now()-a})}};
    let t=0;const pre=()=>t=performance.now();
    const post=()=>{cpu.push(performance.now()-t);const p=s.performanceStats();queue.push({ms:performance.now()-start,refresh:p.refreshPending,scenery:p.sceneryPending,ground:p.ground.pending,fog:p.fog.pending});
     if((!p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending)||performance.now()-start>120000){
      g.events.off('prestep',pre);g.events.off('postrender',post);s.nextVisual=step;const q=a=>a.sort((a,b)=>a-b)[Math.floor(a.length*.95)];
      resolve({season,completionMs:performance.now()-start,cpuP95:q(cpu),stepP95:q(costs.map(c=>c.ms)),costs,queue,stats:p,timeout:performance.now()-start>120000});
     }};
    g.events.on('prestep',pre);g.events.on('postrender',post);s.state.season=season;s.refresh();
   }),season);results.push({worker,...result,errors});console.log(JSON.stringify({worker,season,completionMs:result.completionMs,cpuP95:result.cpuP95,stepP95:result.stepP95,timeout:result.timeout}));await settled();
  }
 }finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
}
