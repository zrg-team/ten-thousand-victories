/** Desktop drag benchmark. Use a headed browser for the real GPU, not SwiftShader.
 * DEV_URL defaults to http://localhost:5179/. Production URLs may add ?bench=1.
 * QUALITY=auto exercises launch selection; CPU_RATE applies throughout that run.
 * Manual quality measures unthrottled frames, then the same drag at 4x CPU.
 */
import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {startWorld,resolveOpening,installGlCounters} from './_boot.mjs';
const quality=process.env.QUALITY??'high', auto=quality==='auto';
const name=process.argv[2]??`${quality}-drag`;
const browser=await chromium.launch({headless:false});
const page=await browser.newPage({viewport:{width:Number(process.env.WIDTH??1920),height:Number(process.env.HEIGHT??1080)},deviceScaleFactor:1});
const cdp=await page.context().newCDPSession(page);
await page.routeWebSocket('**/*',socket=>socket.close());
const out={url:process.env.DEV_URL??'http://localhost:5179/',samples:{},errors:[]};
await mkdir('output/map-drag',{recursive:true});
page.on('pageerror',e=>{out.errors.push(e.stack);console.log('PAGEERROR',e.stack);});
page.on('console',m=>{if(/reload|error|warn|context/i.test(m.text()))console.log('CONSOLE',m.type(),m.text());});
page.on('framenavigated',f=>{if(f===page.mainFrame())console.log('NAV',f.url());});
const settled=()=>page.waitForFunction(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !s.refreshPending&&!s.sceneryPending&&!s.ground.pending&&!s.fog.pending;},null,{timeout:120000});
async function sample(label,drag){
 await page.evaluate(()=>{const g=window.__phaserGame,p=window.__sample={gaps:[],cpu:[],start:performance.now(),frames:0,last:0,longtasks:[]};let start=0;for(const k in window.__glc)window.__glc[k]=0;p.pre=()=>start=performance.now();p.post=()=>{const n=performance.now();if(p.last)p.gaps.push(n-p.last);p.last=n;p.frames++;p.cpu.push(n-start);};p.obs=new PerformanceObserver(l=>p.longtasks.push(...l.getEntries().map(e=>e.duration)));p.obs.observe({entryTypes:['longtask']});g.events.on('prestep',p.pre);g.events.on('postrender',p.post);});
 if(drag){for(let n=0;n<4;n++){await page.mouse.move(1050,450);await page.mouse.down();for(let i=1;i<=60;i++){await page.mouse.move(1050+Math.sin(n*Math.PI/2)*i*4,450+(n%2?1:-1)*i*3);await page.waitForTimeout(16);}await page.mouse.up();}}
 else await page.waitForTimeout(5000);
 out.samples[label]=await page.evaluate(()=>{const p=window.__sample,g=window.__phaserGame;g.events.off('prestep',p.pre);g.events.off('postrender',p.post);p.obs.disconnect();const q=(v,k)=>[...v].sort((a,b)=>a-b)[Math.floor(v.length*k)];const s=g.scene.getScene('ConquestScene');return {fps:p.frames*1000/(performance.now()-p.start),frames:p.frames,cpuP50:q(p.cpu,.5),cpuP95:q(p.cpu,.95),gapP95:q(p.gaps,.95),maxGap:Math.max(...p.gaps),longtasks:p.longtasks,draws:window.__glc.draws/p.frames,indices:window.__glc.indices/p.frames,uploadKiB:window.__glc.bytes/p.frames/1024,scroll:[s.cameras.main.scrollX,s.cameras.main.scrollY],zoom:s.cameras.main.zoom,visibleDecorations:s.children.list.filter(o=>o.type==='Image'&&o.visible&&o.getData('decorationKey')).length};});
 console.log(label,JSON.stringify(out.samples[label]));
}
try{
 await page.addInitScript(q=>{if(q==='auto')localStorage.removeItem('mandate:graphics:v1');else localStorage.setItem('mandate:graphics:v1',q);localStorage.setItem('mandate:layout:v1','desktop');},quality);
 if(auto)await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.CPU_RATE??1)});
 await page.goto(out.url);await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));out.launch=await page.evaluate(()=>({state:window.__ladder.state(),record:JSON.parse(localStorage.getItem('mandate:graphics:launch:v3'))}));
 await startWorld(page,{mode:'ascent'});await resolveOpening(page);
 await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;});await settled();
 await installGlCounters(page);await sample('opening-drag',true);
 await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();});await settled();
 await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.setMapZoom(.72);s.cameras.main.setScroll(s.worldWidth/2-s.cameras.main.width/s.cameras.main.zoom/2,s.worldHeight/2-s.cameras.main.height/s.cameras.main.zoom/2);});await settled();
 await page.waitForTimeout(100);
 await page.screenshot({path:`output/map-drag/${name}.png`});
 await sample('revealed-idle',false);await sample('revealed-drag',true);
 if(!auto)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await sample(auto?`auto-drag-cpu${process.env.CPU_RATE??1}x`:'revealed-drag-cpu4x',true);
 if(process.env.CPU_PROFILE==='1') {
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await sample('profile-drag',true);
  const {profile}=await cdp.send('Profiler.stop');await writeFile(`output/map-drag/${name}.cpuprofile`,JSON.stringify(profile));
 }
 out.session=await page.evaluate(()=>window.__ladder.state());
 out.device=await page.evaluate(()=>{const g=window.__phaserGame,gl=g.renderer.gl,e=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:e&&gl.getParameter(e.UNMASKED_RENDERER_WEBGL),buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],layout:localStorage.getItem('mandate:layout:v1')};});
}catch(e){out.failure=String(e);console.log(out.failure);process.exitCode=1;}
finally{if(out.errors.length)process.exitCode=1;await writeFile(`output/map-drag/${name}.json`,JSON.stringify(out,null,2));await browser.close();}
