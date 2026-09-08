import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/history-layout'; mkdirSync(OUT, {recursive:true});
const browser = await chromium.launch();
const checks=[], errors=[];
const check=(ok,name,detail)=>{checks.push({ok,name,detail});console.log(`${ok?'PASS':'FAIL'} ${name}`);};
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function point(page,key,value,{scroll=false,top=false,scene='HistoryScene'}={}) {
 return page.evaluate(({key,value,scroll,top,scene})=>{
  const s=window.__phaserGame.scene.getScene(scene);
  const walk=list=>{for(const o of list??[]){if(o.getData(key)===value)return o;const n=walk(o.list);if(n)return n;}};
  let o=walk(s.children.list);if(!o)return null;
  if(scroll){const m=o.getWorldTransformMatrix();s.scroll.setScroll(s.scroll.offset+m.ty-s.listTop-(top?14:s.scroll.bounds.height/2));o=walk(s.children.list);}
  const hit=o.list?.find(c=>c.input?.enabled)??o;
  const m=hit.getWorldTransformMatrix();
  const c=s.cameras.main,a=c.getWorldPoint(0,0),b=c.getWorldPoint(1,1),r=s.game.canvas.getBoundingClientRect();
  return {x:r.x+(m.tx-a.x)/(b.x-a.x)/s.scale.width*r.width,y:r.y+(m.ty-a.y)/(b.y-a.y)/s.scale.height*r.height};
 },{key,value,scroll,top,scene});
}
async function click(p,key,value,opts){if(opts?.scene==='MenuScene')await p.waitForTimeout(1200);const at=await point(p,key,value,opts);if(!at)throw Error(`Missing ${key}:${value}`);await p.mouse.click(at.x,at.y,{delay:35});await p.waitForTimeout(280);}
for(const [lang,width,height] of [['vi',390,844],['vi',320,568],['en',390,844],['vi',1440,900],['en',1440,900]]) {
 const tag=`${lang}-${width}x${height}`;
 if(process.env.HISTORY_CASE && process.env.HISTORY_CASE!==tag)continue;
 const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 p.on('pageerror',e=>errors.push(`${tag}: ${e.message}`));p.on('console',m=>{if(m.type()==='error')errors.push(`${tag}: ${m.text()}`);});
 await p.addInitScript(l=>localStorage.setItem('mandate:language:v1',l),lang);
 await p.goto(`${BASE}/?capture=1&noladder=1&layout=${width>600?'desktop':'phone'}`);
 await p.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
 await click(p,'menuUtility','history',{scene:'MenuScene'});
 await p.waitForFunction(()=>window.__phaserGame?.scene.isActive('HistoryScene'));
 check((await state(p)).mode==='history',`${tag}: menu opens History`);
 for(const tab of ['dynasties','figures','stories','army','terms']){
  await click(p,'historyTab',tab);
  let s=await state(p);
  check(s.tab===tab,`${tag}/${tab}: chapter button works`);
  const tabs=await Promise.all(s.tabs.map(t=>point(p,'historyTab',t)));
  check(tabs.every(a=>a.x>0&&a.x<width&&a.y>0&&a.y<height/2),`${tag}/${tab}: all five chapter buttons visible`);
  await p.screenshot({path:`${OUT}/${tag}-${tab}.png`});
  if(tab==='army') {
   await click(p,'historyContents',true);
   await click(p,'historyArmyChip','tran',{scroll:true});
   await click(p,'historyArmyChip','tier2',{scroll:true});
   await click(p,'historyArmyChip','mounted',{scroll:true});
   await click(p,'historyArmyChip','horse',{scroll:true});
   s=await state(p);
   check(s.army.dynasty==='tran'&&s.army.rank===2&&s.army.arm==='mounted'&&s.army.formation==='horse',`${tag}: all army selectors update reference`,s.army);
   await p.screenshot({path:`${OUT}/${tag}-army-controls.png`});
   await p.evaluate(()=>window.__phaserGame.scene.getScene('HistoryScene').scroll.setScroll(0));
   await p.screenshot({path:`${OUT}/${tag}-army-selected.png`});
   continue;
  }
  check(!s.openSection&&s.sections.length>=4,`${tag}/${tab}: opens organized contents`);
  const key=s.sections[0];
  await click(p,'sectionKey',key,{scroll:true,top:true});
  s=await state(p);
  check(s.openSection===key&&s.entries.length>0,`${tag}/${tab}: section opens its entries`);
  const entry=s.entries[0];
  await click(p,'rowKey',entry,{scroll:true,top:true});
  check((await state(p)).expanded===entry,`${tag}/${tab}: entry expands`);
  await p.screenshot({path:`${OUT}/${tag}-${tab}-reading.png`});
  const saved=await state(p);
  await click(p,'historyTab',tab==='terms'?'figures':'terms');
  await click(p,'historyTab',tab);
  s=await state(p);
  check(s.expanded===entry&&s.openSection===key&&Math.abs(s.scrollOffset-saved.scrollOffset)<2,`${tag}/${tab}: chapter switch restores article and position`);
  await p.mouse.click(width/2,10);
  check((await state(p)).expanded===entry,`${tag}/${tab}: fixed header blocks hidden rows`);
  await click(p,'rowKey',entry,{scroll:true,top:true});
  check(!(await state(p)).expanded,`${tag}/${tab}: entry collapses`);
  await click(p,'historyContents',true);
  s=await state(p);
  check(s.scrollOffset===0&&!s.openSection&&!s.expanded,`${tag}/${tab}: contents clears expansion and returns to top`);
  // Real drag through the overview must not select a section.
  const at=await p.evaluate(()=>{const s=window.__phaserGame.scene.getScene('HistoryScene');return s.listTop;});
  await p.mouse.move(width/2,height-140);await p.mouse.down();await p.mouse.move(width/2,height-220,{steps:8});await p.mouse.up();await p.waitForTimeout(100);
  check(!(await state(p)).openSection,`${tag}/${tab}: drag does not open a section`);
  await click(p,'historyContents',true);
 }
 if(width>600){await p.setViewportSize({width:1050,height:800});await p.waitForTimeout(300);const at=await point(p,'historyTab','terms');check(at.x>0&&at.x<1050&&at.y<400,`${tag}: resize keeps navigation visible`);await p.screenshot({path:`${OUT}/${tag}-resized.png`});}
 await click(p,'historyBack',true);
 check((await state(p)).mode==='menu',`${tag}: Back returns to menu`);
 await click(p,'menuUtility','history',{scene:'MenuScene'});
 await p.waitForFunction(()=>window.__phaserGame.scene.isActive('HistoryScene'));
 await p.keyboard.press('Escape');await p.waitForTimeout(200);
 check((await state(p)).mode==='menu',`${tag}: Escape returns to menu on repeat visit`);
 await p.close();
}
await browser.close();check(!errors.length,'no browser errors',errors);
writeFileSync(`${OUT}/results${process.env.HISTORY_CASE?'-'+process.env.HISTORY_CASE:''}.json`,JSON.stringify({checks,errors},null,2));
process.exitCode=checks.some(c=>!c.ok)?1:0;
