import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startWorld,resolveOpening} from '../perf/_boot.mjs';

const base=process.env.DEV_URL??'http://127.0.0.1:5184/ten-thousand-victories';
const out='output/rice-tiles-v5';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const report={errors:[],runs:[],checks:{}};
const save=()=>writeFileSync(`${out}/verification.json`,JSON.stringify(report,null,2));
const settle=page=>page.waitForFunction(()=>{const s=window.__phaserGame?.scene.getScene('ConquestScene')?.performanceStats();return s&&!s.refreshPending&&!s.sceneryPending&&!s.ground.pending&&!s.fog.pending;},null,{timeout:90000});

function audit(){
 const s=window.__phaserGame.scene.getScene('ConquestScene'),plan=s.mapRenderer.ricePlan;
 const rectangles=points=>points.map((p,i)=>{const b=points[(i+1)%points.length];return{x:p.y-b.y,y:b.x-p.x};});
 const overlap=(a,b)=>[...rectangles(a),...rectangles(b)].every(n=>{
  const ap=a.map(p=>p.x*n.x+p.y*n.y),bp=b.map(p=>p.x*n.x+p.y*n.y);
  return Math.min(...ap)<Math.max(...bp)&&Math.max(...ap)>Math.min(...bp);
 });
 const rect=b=>[{x:b.x,y:b.y},{x:b.right,y:b.y},{x:b.right,y:b.bottom},{x:b.x,y:b.bottom}];
 const objects=[];const visit=o=>{objects.push(o);if(o.list)o.list.forEach(visit);};s.children.list.forEach(visit);
 const trees=objects.filter(o=>/^flora\.(tree|bamboo|banana|areca|banyan)/.test(o.getData?.('conquestScatterArt')??''));
 const settlements=objects.filter(o=>o.getData?.('conquestSettlementArt'));
 const treeIntrusions=[],settlementIntrusions=[];
 for(const p of plan.parcels){
  for(const o of trees)if(overlap(p.corners,rect(o.getBounds())))treeIntrusions.push({parcel:p.id,art:o.getData('conquestScatterArt'),bounds:o.getBounds()});
  for(const o of settlements)if(overlap(p.corners,rect(o.getBounds())))settlementIntrusions.push({parcel:p.id,bounds:o.getBounds()});
 }
 const geo=s.landscapeGeometry(),R=geo.tileSize,first=s.state.hexTiles[0],at=geo.centreOf(first);
 const ox=at.x-R*Math.sqrt(3)*(first.coord.q+first.coord.r/2),oy=at.y-R*1.5*first.coord.r;
 const terrain=new Map(s.state.hexTiles.map(t=>[`${t.coord.q},${t.coord.r}`,t.terrain]));
 const owner=(x,y)=>{
  const q=(Math.sqrt(3)/3*(x-ox)-(y-oy)/3)/R,r=2/3*(y-oy)/R;
  let a=Math.round(q),b=Math.round(-q-r),c=Math.round(r);
  const da=Math.abs(a-q),db=Math.abs(b+q+r),dc=Math.abs(c-r);
  if(da>db&&da>dc)a=-b-c;else if(db<=dc)c=-a-b;return`${a},${c}`;
 };
 const outside=[],notFullTiles=[];
 for(const p of plan.parcels){
  const full=p.corners.length===6&&p.corners.every((a,i)=>{
   const angle=(-30+i*60)*Math.PI/180;
   return Math.hypot(a.x-p.centre.x-Math.cos(angle)*R,a.y-p.centre.y-Math.sin(angle)*R)<.0001;
  })&&Math.abs(p.area-R*R*3*Math.sqrt(3)/2)<.0001;
  if(!full)notFullTiles.push(p.id);
  for(let edge=0;edge<p.corners.length;edge++){
   const a=p.corners[edge],b=p.corners[(edge+1)%p.corners.length];
   for(let i=0;i<=16;i++)for(let j=0;j<=16-i;j++){
    const u=i/16*.999,v=j/16*.999;
    const x=p.centre.x+(a.x-p.centre.x)*u+(b.x-p.centre.x)*v;
    const y=p.centre.y+(a.y-p.centre.y)*u+(b.y-p.centre.y)*v;
    const t=terrain.get(owner(x,y));
    if(t!=='fields'&&t!=='riceFields')outside.push({parcel:p.id,x,y,terrain:t});
   }
  }
 }
 const images=objects.filter(o=>o.getData?.('riceParcel'));
 const textureKeys=s.textures.getTextureKeys().filter(k=>k.startsWith('rice-parcels:'));
 let pixelHash=null,bytes=0;
 for(const key of textureKeys){
  const texture=s.textures.get(key);bytes+=texture.width*texture.height*4;
  const data=texture.context.getImageData(0,0,texture.width,texture.height).data;let hash=2166136261;
  for(let i=0;i<data.length;i++)hash=Math.imul(hash^data[i],16777619);pixelHash=hash>>>0;
 }
 return{season:s.state.season,ground:s.mapRenderer.riceGraphics.getData('riceGround'),treeIntrusions,settlementIntrusions,outside,notFullTiles,
  plan:JSON.stringify(plan.parcels),cached:!s.mapRenderer.riceGraphics.visible&&images.every(o=>!o.visible),
  roadsAbove:images.every(o=>o.depth<s.connectionGraphics.depth),textureKeys,bytes,pixelHash,
  worldArea:s.state.hexTiles.filter(t=>t.terrain!=='water').length*R*R*3*Math.sqrt(3)/2,
  fieldArea:s.state.hexTiles.filter(t=>t.terrain==='fields'||t.terrain==='riceFields').length*R*R*3*Math.sqrt(3)/2,
  sourceObjects:images.length,camera:{x:s.cameras.main.scrollX,y:s.cameras.main.scrollY,zoom:s.cameras.main.zoom}};
}

try{
 let target={x:803.9491608478035,y:1765.681293192552};
 for(const mode of ['desktop','phone','tile-off','missing-art','compact']){
  const page=await browser.newPage({viewport:mode==='phone'?{width:390,height:844}:{width:1440,height:960}});
  const requests=[];page.on('request',r=>{if(r.url().includes('rice-clumps')||r.url().includes('rice-seasons')||r.url().includes('wet-rice'))requests.push(r.url());});
  page.on('pageerror',e=>report.errors.push({mode,error:String(e)}));
  page.on('console',m=>{if(m.type()==='error'&&!(mode==='missing-art'&&m.text().includes('ERR_FAILED')))report.errors.push({mode,error:m.text()});});
  if(mode==='missing-art')await page.route('**/dongho-rice-clumps-v5b.webp',r=>r.abort());
  await page.addInitScript(mode=>{
   localStorage.setItem('mandate:layout:v1',mode==='phone'?'mobile':'desktop');
   localStorage.setItem('mandate:graphics:v1',mode==='phone'?'medium':'high');
   localStorage.setItem('mandate:tile-assets:v1',mode==='tile-off'?'off':'on');
   localStorage.setItem('mandate:map-depth:v1',JSON.stringify({filter:'off',style:'off',clouds:false}));
   localStorage.setItem('mandate:life:v1',JSON.stringify({birds:false,traffic:'none',mapLife:'off',motion:'reduced',seasons:true}));
  },mode);
  await page.goto(`${base}/?capture=1&bench=1&noladder=1${mode==='compact'?'&ricescale=compact':''}`);
  await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'),null,{timeout:60000});
  await startWorld(page,{mode:'ascent',seed:1337});await resolveOpening(page);await settle(page);
  const run={mode,requests,normal:await page.evaluate(audit),seasons:[]};
  await page.evaluate(()=>{
   const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;
   for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;l.ownerId='dai-viet';}s.refresh();
  });await settle(page);
  target??=await page.evaluate(()=>{
   const s=window.__phaserGame.scene.getScene('ConquestScene');
   return [...s.mapRenderer.ricePlan.parcels].sort((a,b)=>Math.hypot(a.centre.x-s.worldWidth/2,a.centre.y-s.worldHeight/2)-Math.hypot(b.centre.x-s.worldWidth/2,b.centre.y-s.worldHeight/2))[0].centre;
  });
  await page.evaluate(({target,mode})=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.setMapZoom(mode==='phone'?2:2.3);s.scrollToCentre(target.x,target.y);},{target,mode});
  for(const season of mode==='desktop'||mode==='phone'||mode==='compact'?['Spring','Summer','Autumn','Winter']:['Autumn']){
   await page.evaluate(season=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.season=season;s.refresh();window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');},season);await settle(page);
   await page.screenshot({path:`${out}/${mode}-${season}.png`});
   run.seasons.push(await page.evaluate(audit));
  }
  if(mode==='desktop'){
   // An actual economy tick must advance Winter to Spring and repaint the same resident plan.
   await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.seasonTick=1;window.__performanceBench.tick();s.refresh();});await settle(page);
   run.calendarTick=await page.evaluate(audit);
   // Rebuilding the terrain should dispose the old atlas, not accumulate GPU textures.
   await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.renderSignatures.terrain='';s.refresh();});await settle(page);
   run.rebuilt=await page.evaluate(audit);
   const before=await page.evaluate(()=>{const c=window.__phaserGame.scene.getScene('ConquestScene').cameras.main;return[c.scrollX,c.scrollY];});
   await page.mouse.move(700,470);await page.mouse.down();await page.mouse.move(840,510,{steps:12});await page.mouse.up();
   report.checks.drag=await page.evaluate(before=>{const c=window.__phaserGame.scene.getScene('ConquestScene').cameras.main;return c.scrollX!==before[0]||c.scrollY!==before[1];},before);
  }
  report.runs.push(run);save();
  console.log(JSON.stringify({mode,parcels:run.seasons[0].ground.parcels,trees:run.seasons.map(s=>s.treeIntrusions.length),settlements:run.seasons.map(s=>s.settlementIntrusions.length),outside:run.seasons[0].outside.length,errors:report.errors}));
  await page.close();
 }
 const desktop=report.runs[0],all=report.runs.flatMap(r=>r.seasons);
 report.checks.actualSeasonalPixels=new Set(desktop.seasons.map(s=>s.pixelHash)).size===4;
 report.checks.stableGeometry=desktop.seasons.every(s=>s.plan===desktop.seasons[0].plan);
 report.checks.calendarTick=desktop.calendarTick.season==='Spring'&&desktop.calendarTick.ground.season==='Spring'&&desktop.calendarTick.pixelHash===desktop.seasons[0].pixelHash;
 report.checks.noTreeCanopies=all.every(s=>s.treeIntrusions.length===0);
 report.checks.noSettlementIntrusions=all.every(s=>s.settlementIntrusions.length===0);
 report.checks.agriculturalTerrainOnly=all.every(s=>s.outside.length===0);
 report.checks.localised=all.every(s=>s.ground.area/s.worldArea<.1&&s.ground.parcels>=10&&s.ground.districts>=2&&s.ground.districts<=8);
 report.checks.fullTerrainTiles=all.every(s=>s.notFullTiles.length===0);
 report.checks.tileFollowingBorder=all.every(s=>s.ground.drawnBunds===s.ground.perimeterEdges+(s.ground.borderMode==='tiles'?s.ground.sharedEdges:0));
 report.checks.connectedInterior=all.every(s=>s.ground.sharedEdges>=s.ground.parcels-s.ground.districts);
 report.checks.cached=all.every(s=>s.cached&&s.roadsAbove);
 report.checks.noTextureLeak=desktop.rebuilt.textureKeys.length===desktop.seasons[0].textureKeys.length;
 report.checks.noOldAtlas=report.runs.every(r=>r.requests.every(x=>!x.includes('wet-rice')&&!x.includes('rice-seasons')));
 report.checks.fallback=report.runs.filter(r=>['tile-off','missing-art'].includes(r.mode)).every(r=>!r.seasons[0].ground.textured&&r.seasons[0].textureKeys.length===0);
 report.checks.noUnexpectedErrors=report.errors.length===0;
 if(Object.values(report.checks).some(v=>!v))process.exitCode=1;
}catch(e){report.failure=String(e);process.exitCode=1;}
finally{await browser.close();save();console.log(JSON.stringify({checks:report.checks,errors:report.errors,failure:report.failure}));}
