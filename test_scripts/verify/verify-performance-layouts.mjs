/** Functional layout/chunk coverage; times from this matrix are not FPS measurements. */
import { boot, startWorld, resolveOpening, BASE } from '../perf/_boot.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const results = [], failures = [];
const directory = 'output/performance-review/layouts'; await mkdir(directory, {recursive:true});
for (const [quality, width, height, language] of [
  ['low',390,620,'en'], ['medium',390,844,'vi'], ['high',768,1024,'en'],
  ['clarity',1440,900,'vi'], ['high',1920,1080,'vi'], ['medium',3440,1440,'en'],
]) {
  const name = `${quality}-${width}-${language}`;
  if (process.env.CASE && !name.includes(process.env.CASE)) continue;
  let stage = 'start';
  const {browser,page,errors}=await boot({quality:quality==='clarity'?'medium':quality,dpr:width >= 1000 ? 1 : 2,query:'?capture=1&bench=1'});
  // Forced High on software WebGL can render only a few frames/sec. This is a
  // completion/visual matrix, separate from the 4x-CPU preparation and list gates.
  const idle = () => page.waitForFunction(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !s.refreshPending&&!s.sceneryPending&&!s.ground?.pending&&!s.fog?.pending;},null,{timeout:180000});
  try {
    await page.setViewportSize({width,height});
    await page.evaluate(language=>localStorage.setItem('mandate:language:v1',language),language);
    await page.goto(`${BASE}/?capture=1&bench=1${width>=1000?'&layout=desktop':''}`); await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
    if(quality==='clarity') await page.evaluate(()=>window.__ladder.force('clarity'));
    await startWorld(page,{mode:'ascent'});await resolveOpening(page);
    stage = 'reveal';
    await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();});await idle();
    const pans=[];
    for(const [zoom,corner] of [[.72,0],[.72,1],[1.65,1],[1,0]]) {
      stage = `pan ${zoom}/${corner}`;
      await page.evaluate(([z,c])=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.setMapZoom(z);s.cameras.main.setScroll(c? s.worldWidth-800:0,c?s.worldHeight-800:0);},[zoom,corner]);
      await idle(); pans.push(await page.evaluate(()=>window.__phaserGame.scene.getScene('ConquestScene').performanceStats()));
    }
    stage = 'center';
    if(pans.some(s=>s.ground.bytes>(quality==='high'?96:64)*1048576))throw Error('chunk budget exceeded');
    await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.setMapZoom(1);s.cameras.main.setScroll(Math.max(0,s.worldWidth/2-s.cameras.main.width/s.cameras.main.zoom/2),Math.max(0,s.worldHeight/2-s.cameras.main.height/s.cameras.main.zoom/2));});await idle();
    await page.screenshot({path:`${directory}/${name}-map.png`});
    const list=await page.evaluate(()=>{const ui=window.__phaserGame.scene.getScene('ConquestUIScene');ui.showCodex();const a=ui.activeScrollAreas[0];a.setScroll(3600);return a.virtualStats();});
    if(list.mounted>16)throw Error('unbounded Codex');
    await page.screenshot({path:`${directory}/${name}-codex.png`});
    for(const key of ['GuideScene','HistoryScene','CabinetScene']) {
      stage = key;
      await page.evaluate(key=>{const g=window.__phaserGame;for(const s of g.scene.getScenes(true))g.scene.stop(s.scene.key);g.scene.start(key);},key);
      await page.waitForFunction(key=>{const s=window.__phaserGame.scene.getScene(key);return s.sys.isActive()&&!!s.scroll;},key);
      await page.evaluate(key=>{const s=window.__phaserGame.scene.getScene(key);s.scroll.setScroll(900);},key);
      await page.screenshot({path:`${directory}/${name}-${key}.png`});
    }
    results.push({name,list,pans,errors});if(errors.length)throw Error(errors.join('\n'));
    console.log(`PASS ${name}`);
  } catch(e) { const stats=await page.evaluate(()=>window.__phaserGame?.scene.getScene('ConquestScene')?.performanceStats()).catch(()=>null); failures.push({name,stage,error:String(e),errors,stats});console.log(`FAIL ${name} (${stage}): ${e} ${JSON.stringify(stats)}`); }
  finally {await browser.close();}
}
await writeFile(`${directory}/results.json`,JSON.stringify({results,failures},null,2));process.exitCode=failures.length?1:0;
