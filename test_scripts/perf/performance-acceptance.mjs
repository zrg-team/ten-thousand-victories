/** Runs against Vite dev OR a production preview. No /src browser imports. */
import { boot, startWorld, resolveOpening, installGlCounters, glFrame, FIRST_OPTION } from './_boot.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const { browser, page, cdp, errors } = await boot({ quality: process.env.QUALITY ?? 'medium', dpr: 3, query: '?capture=1&bench=1', gc: true });
const checks = [], results = {};
const check = (name, ok, detail) => { checks.push({name,ok,detail}); console.log(`${ok?'PASS':'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
const idle = () => page.waitForFunction(() => { const s=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !s.refreshPending&&!s.sceneryPending&&!s.ground?.pending&&!s.fog?.pending; }, null, {timeout:60000});
const stats = () => page.evaluate(()=>window.__phaserGame.scene.getScene('ConquestScene').performanceStats());
await mkdir('output/performance-review/acceptance',{recursive:true});
try {
  results.menuTextures = await page.evaluate(()=>Object.keys(window.__phaserGame.textures.list).filter(k=>k.startsWith('conquest')));
  check('screen art waits for its scene', !results.menuTextures.some(k=>/figures|buildings|walk/.test(k)),results.menuTextures);
  await startWorld(page,{mode:'ascent'}); await resolveOpening(page); await page.evaluate(()=>window.__mandateState.isStrategyPause=true); await idle();
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  results.list = await page.evaluate(()=>{const ui=window.__phaserGame.scene.getScene('ConquestUIScene');const start=performance.now();ui.showCodex();return {openMs:performance.now()-start,stats:ui.activeScrollAreas.map(s=>s.virtualStats())};});
  check('127-row Codex opens within 100 ms at 4x CPU',results.list.openMs<=100,results.list);
  check('list objects depend on viewport',results.list.stats[0].total===127&&results.list.stats[0].mounted<=15,results.list.stats);
  results.labelSize=await page.evaluate(()=>{const ui=window.__phaserGame.scene.getScene('ConquestUIScene'),labels=[];const walk=o=>{if(o.getData?.('cachedText'))labels.push({scale:o.scaleX,width:o.width,pixels:o.frame.width,resolution:o.frame.source.resolution});o.list?.forEach(walk);};ui.activeScrollAreas[0].content.list.forEach(walk);return labels;});
  check('shared labels retain their original logical size',results.labelSize.length>0&&results.labelSize.every(l=>l.scale===1&&Math.abs(l.width-l.pixels/l.resolution)<1),results.labelSize[0]);
  check('cards fit their measured row heights',await page.evaluate(()=>{const area=window.__phaserGame.scene.getScene('ConquestUIScene').activeScrollAreas[0];return area.content.list.every(holder=>{const row=area.lazyRows.find(r=>r.key===holder.getData('virtualKey'));return !row||holder.list.every(card=>(card.getData('cardHeight')??0)<=row.height-8);});}));
  await installGlCounters(page);results.listDraw=await glFrame(page);check('list draw work near visible-only reference',results.listDraw.draws<=50&&results.listDraw.uploadKB<=420,results.listDraw);
  await page.screenshot({path:'output/performance-review/acceptance/codex.png'});
  results.scroll=await page.evaluate(()=>{const ui=window.__phaserGame.scene.getScene('ConquestUIScene'),area=ui.activeScrollAreas[0];let max=0,maxMs=0;for(let i=0;i<80;i++){const t=performance.now();area.setScroll(i*110);maxMs=Math.max(maxMs,performance.now()-t);max=Math.max(max,area.virtualStats().mounted);}area.setScroll(0);return {maxMounted:max,maxMs};});
  check('sustained scrolling keeps bounded rows',results.scroll.maxMounted<=16,results.scroll);
  await page.evaluate(()=>{window.__phaserGame.scene.getScene('ConquestUIScene').closeLane();window.__mandateState.isStrategyPause=true;}); await idle();
  const before = await stats();
  await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');window.__beforeSeasonNodes=[...s.landNodes];window.__seasonCullPasses=0;const original=s.syncCullableJobs.bind(s);s.syncCullableJobs=function*(){window.__seasonCullPasses++;yield* original();};});
  results.season=await page.evaluate(src=>{const s=window.__phaserGame.scene.getScene('ConquestScene'),st=s.state,first=eval(src),season=st.season;const nodes=[...s.landNodes.values()];s.refreshCosts=[];let ticks=0;const t=performance.now();while(st.season===season&&ticks++<5){let n=0;while(st.pendingAscentPrompt&&n++<20)window.__performanceBench.resolve(first(st.pendingAscentPrompt));window.__performanceBench.tick();}s.refresh();st.isStrategyPause=true;return {dispatchMs:performance.now()-t,ticks,from:season,to:st.season,nodesBefore:nodes.length};},FIRST_OPTION);
  await idle();results.season.after=await stats();
  check('season retains settlements and registers culling once',await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');return window.__seasonCullPasses===1&&window.__beforeSeasonNodes.every(([id,node])=>s.landNodes.get(id)===node);}),await page.evaluate(()=>({passes:window.__seasonCullPasses})));
  check('real season changes have one ground invalidation',results.season.after.ground.invalidations-before.ground.invalidations===1,results.season);
  check('recurring preparation slices stay below 50 ms',Math.max(results.season.after.maxRefreshWorkMs,results.season.after.ground.maxWorkMs,results.season.after.fog.maxWorkMs)<=50,results.season.after);
  await page.screenshot({path:'output/performance-review/acceptance/map-season.png'});
  const localBefore=await stats();
  results.build=await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene'),land=s.state.lands.find(l=>l.isVisible&&l.ownerId==='dai-viet');const id=land?.id;if(!id)return {built:false};for(const key of ['food','gold','supplies','population'])s.state.resources[key]=100000;const built=window.__performanceBench.build(id,'farm');for(let i=0;i<200&&s.state.buildOrders.length;i++)window.__performanceBench.progressBuild();s.refresh();return {built,id};});
  await idle();results.build.after=await stats();
  check('construction invalidation is local',results.build.built&&results.build.after.ground.builds-localBefore.ground.builds<localBefore.ground.tiles,results.build);
  results.pan=[];
  for(const zoom of [.72,1,2]) { await page.evaluate(z=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.setMapZoom(z);s.cameras.main.setScroll(Math.max(0,s.worldWidth/2-250),Math.max(0,s.worldHeight/2-400));},zoom);await idle();results.pan.push(await stats()); }
  check('pan/zoom obey shared texture budget',results.pan.every(s=>s.ground.bytes<=((process.env.QUALITY==='high'?96:64)*1048576)),results.pan.map(s=>({bytes:s.ground.bytes,tiles:s.ground.tiles})));
  // Ownership fixture isolates visual invalidation from unrelated diplomacy rules.
  results.ownership=await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene'),land=s.state.lands.find(l=>l.isVisible&&l.ownerId!=='dai-viet');if(!land)return false;land.ownerId='dai-viet';s.refresh();return land.id;});await idle();
  check('ownership change completes',!!results.ownership,await stats());
  check('no browser errors',errors.length===0,errors);
} catch(error) { check('harness completed',false,String(error)); }
finally { await writeFile('output/performance-review/acceptance/results.json',JSON.stringify({checks,results,errors},null,2));await browser.close(); }
process.exitCode=checks.every(c=>c.ok)?0:1;
