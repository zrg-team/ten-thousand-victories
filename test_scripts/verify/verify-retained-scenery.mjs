import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startWorld,resolveOpening} from '../perf/_boot.mjs';
const out=process.env.OUT??'output/a9-performance/visual';await mkdir(out,{recursive:true});
const quality=process.env.QUALITY??'high';
const browser=await chromium.launch({headless:false}),errors=[];
const page=await browser.newPage({viewport:{width:Number(process.env.WIDTH??1280),height:Number(process.env.HEIGHT??800)},deviceScaleFactor:1});
await page.routeWebSocket('**/*',s=>s.close());page.on('pageerror',e=>{errors.push(e.stack);console.error(e.stack);});
const settled=()=>page.waitForFunction(()=>{const p=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending;},null,{timeout:180000});
try{
 await page.addInitScript(quality=>{localStorage.setItem('mandate:graphics:v1',quality==='clarity'?'medium':quality);localStorage.setItem('mandate:layout:v1','desktop');},quality);
 await page.addInitScript(language=>localStorage.setItem('mandate:language:v1',language),process.env.LANGUAGE??'vi');
 const url=new URL(process.env.DEV_URL??'http://127.0.0.1:5179/');url.searchParams.set('bench','1');url.searchParams.set('retained','1');
 await page.goto(url.href);await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));if(quality==='clarity')await page.evaluate(()=>window.__ladder.force('clarity'));await startWorld(page,{mode:'ascent',seed:20260812});await resolveOpening(page);
 await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();});await settled();
 const results=[];
 for(const zoom of [.72,1,1.65]){
  await page.evaluate(zoom=>{const g=window.__phaserGame,s=g.scene.getScene('ConquestScene');s.setMapZoom(zoom);s.cameras.main.setScroll(450,1050);for(const scene of g.scene.getScenes(true))scene.tweens.pauseAll();},zoom);await settled();await page.waitForTimeout(100);
  await page.evaluate(()=>{window.__phaserGame.loop.stop();});
  const shots={};
  for(const mode of ['reference','retained','repeat']){await page.evaluate(mode=>{const g=window.__phaserGame,s=g.scene.getScene('ConquestScene');s.retainedScenery.enabled=mode==='retained';g.loop.frame++;g.renderer.preRender();g.scene.render(g.renderer);g.renderer.postRender();},mode);shots[mode]=(await page.screenshot({path:`${out}/${zoom}-${mode}.png`})).toString('base64');}
  const pixels=await page.evaluate(async shots=>{
   const decode=async data=>{const bitmap=await createImageBitmap(await(await fetch(`data:image/png;base64,${data}`)).blob());try{const c=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}finally{bitmap.close();}};
   const [a,b,c]=await Promise.all([decode(shots.reference),decode(shots.retained),decode(shots.repeat)]);
   const compare=(a,b)=>{let changed=0,over2=0,max=0,sum=0;for(let i=0;i<a.length;i+=4){const d=[0,1,2].map(j=>Math.abs(a[i+j]-b[i+j])),m=Math.max(...d);changed+=m>0;over2+=m>2;max=Math.max(max,m);sum+=d[0]+d[1]+d[2];}return {pixels:a.length/4,changed,over2,max,mean:sum/(a.length/4*3)};};
   return {candidate:compare(a,b),repeatNoise:compare(a,c)};
  },shots);
  assert(pixels.candidate.mean<.01&&pixels.candidate.changed/pixels.candidate.pixels<.005&&pixels.candidate.over2/pixels.candidate.pixels<.0001,`visual difference exceeds numerical-raster tolerance: ${JSON.stringify(pixels)}`);
  const result=await page.evaluate(()=>{
   const s=window.__phaserGame.scene.getScene('ConquestScene'),r=s.retainedScenery,c=s.cameras.main;
   r.enabled=true;
   const expected=s.children.list.filter(o=>o.willRender(c));
   const byId=new Map([...r.members].map(([object,id])=>[id,object]));
   const expanded=s.cameras.getVisibleChildren(s.children.list,c).flatMap(object=>{
    if(object.node!==r.node)return [object];
    return r.previousOrder.slice(object.offset/12,object.offset/12+object.count/6).map(id=>byId.get(id));
   });
   return {zoom:s.mapZoom,retained:r.stats(),sources:s.children.list.filter(o=>o.type==='Image'&&o.visible&&o.getData('decorationKey')).length,
    painterOrderExact:expanded.length===expected.length&&expanded.every((object,index)=>object===expected[index])};
  });assert(result.painterOrderExact,'retained runs expand to the exact original visible painter order');results.push({...result,pixels});
  await page.evaluate(()=>{const g=window.__phaserGame;g.loop.start(g.step.bind(g));});
 }
 assert.equal(errors.length,0);await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
