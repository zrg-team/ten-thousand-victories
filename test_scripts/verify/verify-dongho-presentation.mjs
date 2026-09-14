// Actual map transforms and illustrated decision layouts at both phone-height limits.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
const base=process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const out='output/dongho-first-pass';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
let failures=0;const errors=[];
function check(ok,label,detail=''){console.log(`${ok?'PASS':'FAIL'} ${label} ${detail}`);if(!ok)failures++;}
for(const [lang,height] of [['en',844],['vi',844],['vi',620]]){
 const page=await browser.newPage({viewport:{width:390,height},deviceScaleFactor:2});
 page.on('pageerror',e=>errors.push(e.stack??e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(lang=>{
  localStorage.setItem('mandate:language:v1',lang);localStorage.setItem('mandate:graphics:v1','medium');
  localStorage.setItem('mandate:life:v1',JSON.stringify({motion:'reduced'}));
 },lang);
 await page.goto(`${base}/?capture=1&noladder=1`);
 await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
 await page.evaluate(()=>window.__startBenchGame(20260901,'ascent', 'v1'));
 await page.waitForFunction(()=>window.__phaserGame.scene.isActive('ConquestScene'));
 await page.evaluate(()=>{
  const st=window.__mandateState;st.isPaused=true;
  window.__phaserGame.scene.getScene('ConquestScene').ascentAccumulator=-1e9;
  st.pendingAscentPrompt=undefined;st.ascent.promptQueue=[];
  const ui=window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeOverlay();ui.events.emit('state-changed');
 });
 await page.waitForTimeout(500);
 const loaded=await page.evaluate(()=>['harvest','muster','petition'].every(k=>window.__phaserGame.textures.exists(`story-print:${k}`)));
 check(loaded,`${lang}/${height} narrative textures loaded`);
 if(lang==='en'){
  for(const zoom of [.6,1.2,2.4]){
   const sample=await page.evaluate(zoom=>{
    const world=window.__phaserGame.scene.getScene('ConquestScene');
    const st=world.state;const land=st.lands.find(l=>l.ownerId==='dai-viet');
    const label=world.landLabels.get(land.id);
    world.setMapZoom(zoom);
    const camera=world.cameras.main;const scale=camera.zoom/zoom;
    camera.setScroll(label.x-390/(2*zoom),label.y-70-camera.height/scale/(2*zoom));
    world.syncViewCulling(true);
    const r=world.labelWorldRect(land.id);
    const text=label.list.find(o=>o.type==='Text');
    // Test the visible right edge, not only the centre where even stale geometry succeeds.
    const edgeX=label.x+label.width*label.scaleX*.48;
    world.__presentationBadge?.destroy();
    const markerAt=world.getVisibleLandMarkerPoint(land);
    const badge=world.progressBadge(markerAt.x,markerAt.y,5,6,'siege');
    world.__presentationBadge=badge;
    badge.setDepth(80);
    return {ratio:label.scaleX*zoom,resolution:text.style.resolution,
     edge:world.resolveTapLand(edgeX,label.y)===land.id,
     padded:r.width>label.width*label.scaleX,
     badgeWidth:badge.width*badge.scaleX*zoom};
   },zoom);
   check(sample.ratio<=1.151 && sample.badgeWidth<=77,`zoom ${zoom} annotations stay compact`,JSON.stringify(sample));
   check(sample.resolution>=3 && sample.edge && sample.padded,`zoom ${zoom} crisp type and matching touch target`);
   await page.waitForTimeout(450);await page.screenshot({path:`${out}/map-${zoom}.png`});
  }
 }
 for(const kind of ['power','muster','envoy','law','decree']){
  await page.evaluate(async kind=>{
   const st=window.__mandateState;const ui=window.__phaserGame.scene.getScene('ConquestUIScene');
   st.isPaused=true;st.pendingAscentPrompt=undefined;st.ascent.promptQueue=[];
   ui.closeOverlay();
   if(kind==='power'){
    st.pendingAscentPrompt={kind:'power-draft',level:3,cards:['iron-levy','rice-tribute','mandarin-academy'],rerollCost:40};
   }else if(kind==='muster'){
    const hero=st.heroes[0] ?? st.heroDeck[0];
    st.pendingAscentPrompt={kind:'muster-proposal',heroId:hero.id,
     landId:st.lands.find(l=>l.ownerId==='dai-viet').id,ticks:3,suppliesCost:18,purpose:'target',
     plan:{heroId:hero.id,soldiers:300,rations:12,provisions:10,composition:'balanced',orders:'defend'}};
   }else if(kind==='envoy'){
    const {offerEnvoyTo}=await import('/src/systems/ascent/EnvoySystem.ts');
    const {drainAscentPrompts}=await import('/src/systems/ascent/AscentState.ts');
    offerEnvoyTo(st,st.kingdoms.find(k=>k.id!=='dai-viet').id);drainAscentPrompts(st);
   }else if(kind==='law')st.pendingAscentPrompt={kind:'law-choice',projectIds:[],taxOptions:['lenient','balanced','harsh'],points:2};
   else st.pendingAscentPrompt={kind:'decree-offer',instrument:'le',projectIds:['le-thuy-loi'],targetName:'Cửu Đô Nam'};
   ui.events.emit('state-changed');
  },kind);
  await page.waitForTimeout(kind==='power'?1800:800);
  const layout=await page.evaluate(()=>{
   const ui=window.__phaserGame.scene.getScene('ConquestUIScene');
   const pictures=[];const walk=o=>{if(o.getData?.('storyPrint'))pictures.push(o);o.list?.forEach(walk);};walk(ui.modalLayer);
   const scroll=ui.activeScrollAreas[0];
   return {pictures:pictures.length,valid:pictures.every(o=>{
    const b=o.getBounds();return b.width>0 && b.height>0 && Math.abs(b.width/b.height-1.5)<.01;
   }),scroll:!!scroll,scrollMax:scroll?.maxScroll??0};
  });
  check(layout.valid && (layout.pictures>0 || (kind==='power'&&height===620)),`${lang}/${height} ${kind} complete print fits`,JSON.stringify(layout));
  await page.screenshot({path:`${out}/${kind}-${lang}-${height}.png`});
  if(layout.scroll && layout.scrollMax>0){
   await page.mouse.move(190,430);await page.mouse.wheel(0,1800);await page.waitForTimeout(350);
   const moved=await page.evaluate(()=>window.__phaserGame.scene.getScene('ConquestUIScene').activeScrollAreas[0].scrollY);
   check(moved>0,`${lang}/${height} ${kind} choices remain scrollable`);
   await page.screenshot({path:`${out}/${kind}-${lang}-${height}-bottom.png`});
  }
  // Use the same pointer press a player uses, including a choice after scrolling.
  const target=await page.evaluate(async kind=>{
   const {t}=await import('/src/i18n/index.ts');
   const key={power:'ascent.fan.take',muster:'ascent.muster.decline',envoy:'ascent.envoy.ignore',
    law:'ascent.law.hold',decree:'decree.instrument.le.decline'}[kind];
   const ui=window.__phaserGame.scene.getScene('ConquestUIScene');
   const nodes=[];const walk=o=>{if(o.type==='Text'&&o.text===t(key))nodes.push(o);o.list?.forEach(walk);};walk(ui.modalLayer);
   const b=nodes[0]?.getBounds();if(!b)return null;
   const r=window.__phaserGame.canvas.getBoundingClientRect(),k=r.width/390;
   return {x:r.left+(b.x+b.width/2)*k,y:r.top+(b.y+b.height/2)*k};
  },kind);
  check(target && target.y>100 && target.y<height,`${lang}/${height} ${kind} action is on screen`);
  if(target){
   await page.mouse.move(target.x,target.y);await page.mouse.down();
   await page.waitForTimeout(180);await page.mouse.up();await page.waitForTimeout(400);
   const resolved=await page.evaluate(kind=>window.__mandateState.pendingAscentPrompt?.kind!==({power:'power-draft',muster:'muster-proposal',envoy:'envoy',law:'law-choice',decree:'decree-offer'}[kind]),kind);
   check(resolved,`${lang}/${height} ${kind} pointer action resolves the decision`);
  }
 }
 // Missing artwork must keep the original card symbol and all options usable.
 await page.evaluate(async()=>{
  const {addStoryPrint}=await import('/src/ui/storyPrint.ts');
  const ui=window.__phaserGame.scene.getScene('ConquestUIScene');
  window.__mandateState.pendingAscentPrompt=undefined;
  ui.closeOverlay();
  window.__phaserGame.textures.remove('story-print:harvest');
  window.__missingPrintSafe=addStoryPrint(ui,ui.modalLayer,'harvest',{x:0,y:0,width:100,height:60})===undefined;
 });
 check(await page.evaluate(()=>window.__missingPrintSafe),`${lang}/${height} missing print degrades safely`);
 await page.close();
}
check(errors.length===0,'no browser errors',errors.join(' | '));
await browser.close();process.exit(failures?1:0);

