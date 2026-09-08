/** Matched production benchmarks. No forced game steps, screenshots, or GC in timing windows.
 * BASELINE_URL=... CANDIDATE_URL=... PAIRS=5 QUALITY=high,medium,clarity npm run perf:conquest
 * PROFILE=1 records a separate CPU/Chrome frame trace. Desktop throttling is not an A9 result. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startWorld, resolveOpening, installGlCounters } from './_boot.mjs';
import {gpuSample} from './gpu-timing.mjs';
const out = process.env.OUT ?? 'output/a9-performance/comparison';
const versions = Object.entries({ baseline: process.env.BASELINE_URL, candidate: process.env.CANDIDATE_URL ?? process.env.DEV_URL }).filter(([, url]) => url);
if (!versions.length) throw Error('Set BASELINE_URL and/or CANDIDATE_URL to production preview URLs');
const profiles = (process.env.QUALITY ?? 'high,medium,clarity').split(',');
const pairs = Number(process.env.PAIRS ?? 5), seconds = Number(process.env.SECONDS ?? 5);
const width = Number(process.env.WIDTH ?? 1920), height = Number(process.env.HEIGHT ?? 1080), dpr = Number(process.env.DPR ?? 1);
const language = process.env.LANGUAGE ?? 'en';
const layout = process.env.LAYOUT ?? 'desktop';
const results = [];
await mkdir(out, { recursive: true });
const percentile = (v, p) => [...v].sort((a, b) => a-b)[Math.min(v.length-1, Math.floor(v.length*p))] ?? null;
const settled = page => page.waitForFunction(() => { const s=window.__phaserGame?.scene.getScene('ConquestScene')?.performanceStats(); return s&&!s.refreshPending&&!s.sceneryPending&&!s.ground?.pending&&!s.fog?.pending; }, null, { timeout: 180000 });
async function capture(page, cdp, label, drag) {
  await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.cameras.main.setScroll(180,980);});
  await settled(page);await page.waitForTimeout(500);
  await page.evaluate(() => {
    const g=window.__phaserGame;
    const p=window.__conquestSample={start:performance.now(),last:0,frames:0,cpu:[],gaps:[],longtasks:[],stages:{},input:[],poses:[],originals:[],textures:{calls:0,estimatedUploadBytes:0,submissionMs:0}};
    const hook=(object,name,label)=>{if(typeof object?.[name]!=='function')return;const fn=object[name];object[name]=function(...args){const start=performance.now();try{return fn.apply(this,args);}finally{(p.stages[label]??=[]).push(performance.now()-start);}};p.originals.push(()=>object[name]=fn);};
    const s=g.scene.getScene('ConquestScene');
    hook(s,'syncViewCulling','culling');hook(s,'nextVisual','preparation');hook(s.groundChunks,'update','groundPreparation');hook(s,'handleDomMove','touchHandling');
    // Phaser caches the scene update callback in Systems; replacing scene.update
    // after startup does not intercept it. This span includes simulation + culling.
    hook(s.sys,'sceneUpdate','worldUpdate');hook(g.renderer,'render','submission');
    p.cameraStart=[s.cameras.main.scrollX,s.cameras.main.scrollY];
    p.retainedStart=s.performanceStats().retained;
    const gl=g.renderer.gl;
    for(const name of ['texImage2D','texSubImage2D']){
      const original=gl[name];gl[name]=function(...args){const start=performance.now();try{return original.apply(this,args)}finally{
        p.textures.calls++;p.textures.submissionMs+=performance.now()-start;
        const source=args.at(-1);if(source){const w=source.width??(name==='texImage2D'?args[3]:args[4]),h=source.height??(name==='texImage2D'?args[4]:args[5]);p.textures.estimatedUploadBytes+=source.byteLength??(Number.isFinite(w)&&Number.isFinite(h)?w*h*4:0);}
      }};p.originals.push(()=>gl[name]=original);
    }
    const move=e=>{p.pendingInput=e.timeStamp};document.addEventListener('pointermove',move);p.originals.push(()=>document.removeEventListener('pointermove',move));
    p.pre=()=>p.frameStart=performance.now();p.post=()=>{const now=performance.now();if(p.last)p.gaps.push(now-p.last);p.last=now;p.cpu.push(now-p.frameStart);p.frames++;if(p.frames%8===0){const c=s.cameras.main;p.poses.push([c.scrollX,c.scrollY,c.width/c.zoom,c.height/c.zoom]);}if(p.pendingInput!==undefined){p.input.push(now-p.pendingInput);p.pendingInput=undefined;}};
    g.events.on('prestep',p.pre);g.events.on('postrender',p.post);
    p.observer=new PerformanceObserver(l=>p.longtasks.push(...l.getEntries().map(e=>e.duration)));p.observer.observe({entryTypes:['longtask']});
    for(const k in window.__glc)window.__glc[k]=0;
  });
  const start=Date.now();
  if (drag) {
    const x=width*.6,y=height*.48;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    // Identical positions and event counts in every version. Real dispatch is
    // awaited; an overloaded browser takes longer instead of skipping input.
    for(let i=1;i<=Math.round(seconds*60);i++){const t=i/60;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+Math.sin(t*1.7)*width*.17,y:y+Math.sin(t*1.1)*height*.17}]});const delay=start+i*1000/60-Date.now();if(delay>0)await page.waitForTimeout(delay);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } else await page.waitForTimeout(seconds*1000);
  return page.evaluate(label=>{
    const p=window.__conquestSample,g=window.__phaserGame;g.events.off('prestep',p.pre);g.events.off('postrender',p.post);p.observer.disconnect();for(const restore of p.originals)restore();
    const q=(v,k)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*k))]??null;
    const s=g.scene.getScene('ConquestScene');
    return {label,elapsedMs:performance.now()-p.start,frames:p.frames,fps:p.frames*1000/(performance.now()-p.start),cpuP50:q(p.cpu,.5),cpuP95:q(p.cpu,.95),gapP95:q(p.gaps,.95),gapP99:q(p.gaps,.99),over50:p.gaps.filter(x=>x>50).length/Math.max(1,p.gaps.length),inputSubmissionP95:q(p.input,.95),longtasks:p.longtasks,stages:Object.fromEntries(Object.entries(p.stages).map(([k,v])=>[k,{calls:v.length,p50:q(v,.5),p95:q(v,.95)}])),draws:window.__glc.draws/p.frames,uploadKiB:window.__glc.bytes/p.frames/1024,textures:p.textures,retainedVertexUploadedBytes:p.retainedStart?s.performanceStats().retained.vertexUploadedBytes-p.retainedStart.vertexUploadedBytes:null,raw:{cpu:p.cpu,gaps:p.gaps,input:p.input,poses:p.poses},stats:s.performanceStats(),visual:{cameraStart:p.cameraStart,cameraEnd:[s.cameras.main.scrollX,s.cameras.main.scrollY],zoom:s.mapZoom,lands:s.state.lands.length,visibleScenery:s.children.list.filter(o=>o.type==='Image'&&o.visible&&o.getData('decorationKey')).length}};
  },label);
}
try {
for(let pair=0;pair<pairs;pair++)for(const quality of profiles)for(const [version,base] of pair%2?[...versions].reverse():versions){
  const browser=await chromium.launch({headless:false});
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:true,serviceWorkers:'block'});
  const cdp=await page.context().newCDPSession(page),errors=[];
  await page.routeWebSocket('**/*', socket => socket.close());
  const record={pair,quality,version,width,height,dpr,language,layout,errors,samples:[]};results.push(record);
  page.on('pageerror',e=>{errors.push(e.stack??String(e));console.error(e.stack??String(e));});
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  try {
    await page.addInitScript(({quality,language,layout})=>{localStorage.setItem('mandate:graphics:v1',quality==='clarity'?'medium':quality);localStorage.setItem('mandate:layout:v1',layout);localStorage.setItem('mandate:language:v1',language);}, {quality,language,layout});
    const url=new URL(base);url.searchParams.set('bench','1');
    await page.goto(url.href);await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
    if(quality==='clarity')await page.evaluate(()=>window.__ladder.force('clarity'));
    await startWorld(page,{mode:'ascent',seed:20260812});await resolveOpening(page);
    await page.evaluate(()=>{window.__phaserGame.scene.getScene('ConquestScene').state.isStrategyPause=true;});await settled(page);
    await installGlCounters(page);record.samples.push(await capture(page,cdp,'opening-touch',true));
    await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();});await settled(page);
    await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.setMapZoom(.72);s.cameras.main.setScroll(180,980);});await settled(page);
    record.device=await page.evaluate(()=>{const g=window.__phaserGame,gl=g.renderer.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,gpu:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],profile:window.__ladder.state(),gpuTimer:!!(gl.getExtension('EXT_disjoint_timer_query_webgl2')||gl.getExtension('EXT_disjoint_timer_query')),scripts:[...document.scripts].map(s=>s.src).filter(Boolean)};});
    record.samples.push(await capture(page,cdp,'revealed-idle',false));
    record.samples.push(await capture(page,cdp,'revealed-touch',true));
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    record.samples.push(await capture(page,cdp,'revealed-touch-cpu4',true));
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    if(pair===0){await page.screenshot({path:`${out}/${version}-${quality}.png`});record.bounds=await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');return s.children.list.filter(o=>o.type==='Image'&&o.getData('decorationKey')).map(o=>{const b=o.getBounds();return {x:b.x,y:b.y,width:b.width,height:b.height};});});}
    if(pair===0)record.gpuDuration=await gpuSample(page);
    if(process.env.PROFILE==='1'&&pair===0){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await cdp.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,cc,v8,disabled-by-default-v8.gc',transferMode:'ReturnAsStream'});await capture(page,cdp,'trace-touch',true);const {profile}=await cdp.send('Profiler.stop');await writeFile(`${out}/${version}-${quality}.cpuprofile`,JSON.stringify(profile));const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;let trace='';for(;;){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});await writeFile(`${out}/${version}-${quality}.trace.json`,trace);}
    console.log(JSON.stringify({pair,quality,version,samples:record.samples.map(({label,cpuP95,fps,uploadKiB})=>({label,cpuP95,fps,uploadKiB})),errors}));
  }catch(e){record.failure=String(e);process.exitCode=1;console.error(record.failure);}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify({deviceAcceptance:'A9 not yet verified',results},null,2));}
}
}finally{
const rows=results.flatMap(r=>r.samples.map(s=>[r.pair,r.version,r.quality,s.label,s.fps,s.cpuP50,s.cpuP95,s.gapP95,s.inputSubmissionP95,s.uploadKiB].join(',')));
await writeFile(`${out}/results.csv`,'pair,version,quality,workload,fps,cpuP50,cpuP95,gapP95,inputSubmissionP95,uploadKiB\n'+rows.join('\n'));
const comparisons=[];for(const quality of profiles)for(const workload of ['revealed-touch','revealed-touch-cpu4']){const values=version=>results.filter(r=>r.version===version&&r.quality===quality).map(r=>r.samples.find(s=>s.label===workload)?.cpuP95).filter(Number.isFinite);const a=values('baseline'),b=values('candidate');if(a.length&&b.length)comparisons.push({quality,workload,baseline:percentile(a,.5),candidate:percentile(b,.5),improvement:1-percentile(b,.5)/percentile(a,.5),baselineRuns:a,candidateRuns:b});}await writeFile(`${out}/summary.json`,JSON.stringify({comparisons,deviceAcceptance:'A9 not yet verified'},null,2));
}
