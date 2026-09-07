import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const base = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const out = 'output/royal-wardrobe'; mkdirSync(out,{recursive:true});
const inventory = JSON.parse(readFileSync('src/data/royalWardrobe.json','utf8'));
assert.equal(inventory.length,54); assert.equal(new Set(inventory.map(i=>i.id)).size,54);
assert.equal(new Set(inventory.map(i=>createHash('sha256').update(readFileSync(`public/faces-royal/${i.id}.svg`)).digest('hex'))).size,54,'Duplicate art');
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1200,height:1100}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?capture=1`);
 await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
 const report=await page.evaluate(async()=>{
  const {ROYAL_WARDROBE,royalItemFits}=await import('/src/data/royalWardrobe.ts');
  const {getLegacy,purchaseRoyalWardrobe,addLegacyPoints,ownsRoyalWardrobe}=await import('/src/state/legacy.ts');
  const {buildKingLook,rollKingChoice,storedLook,choiceFromStored}=await import('/src/ui/faces/kingLook.ts');
  const {royalField}=await import('/src/ui/faces/royalWardrobe.ts');
  const {renderLookInBox}=await import('/src/ui/FaceRenderer.ts');
  const {donghoWardrobeParts}=await import('/src/ui/faces/donghoWardrobe.ts');
  const {fitDonghoPart}=await import('/src/ui/faces/donghoFit.ts');
  const {default:defs}=await import('/src/ui/faces/dongho-v2.defs.json');
  const {default:royalDefs}=await import('/src/ui/faces/royal.defs.json');
  const must=(c,m)=>{if(!c)throw Error(m)};
  localStorage.removeItem('mandate:legacy:v1');
  const starter=rollKingChoice(()=>.7), first=ROYAL_WARDROBE[0];
  must(!purchaseRoyalWardrobe(first.id),'zero balance bought');
  must(!purchaseRoyalWardrobe('unknown'),'unknown bought');
  const locked={...starter,era:first.era,[royalField(first.slot)]:first.id};
  must(!buildKingLook(locked,2).parts.some(p=>p.key===first.id),'locked equipped');
  addLegacyPoints(first.cost);
  must(purchaseRoyalWardrobe(first.id)&&getLegacy().points===0,'exact debit');
  must(purchaseRoyalWardrobe(first.id)&&getLegacy().points===0,'repeat debit');
  must(buildKingLook(locked,2).parts.some(p=>p.key===first.id),'owned invisible');
  const next=ROYAL_WARDROBE[1]; addLegacyPoints(next.cost);
  const raw=localStorage.getItem('mandate:legacy:v1'), original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(){throw Error('quota')};
  must(!purchaseRoyalWardrobe(next.id),'failed storage succeeded');
  Storage.prototype.setItem=original;
  must(localStorage.getItem('mandate:legacy:v1')===raw,'failed storage charged');
  addLegacyPoints(20000);
  let checked=0;
  const scene=window.__phaserGame.scene.getScene('MenuScene');
  for(const item of ROYAL_WARDROBE){
   must(item.cost>0&&scene.textures.get('face:royal').has(item.id),`missing ${item.id}`);
   must(purchaseRoyalWardrobe(item.id),`buy ${item.id}`);
   const choice={...starter,era:item.era,sex:item.sex==='woman'?'woman':'man',[royalField(item.slot)]:item.id};
   const look=buildKingLook(choice,2);
   must(donghoWardrobeParts(look).some(p=>p.key===item.id),`filtered ${item.id}`);
   must(choiceFromStored(storedLook(look,choice))[royalField(item.slot)]===item.id,'save choice lost');
   const wrong={...choice,era:item.era==='le'?'tran':'le'};
   must(!buildKingLook(wrong,2).parts.some(p=>p.key===item.id),'era leak'); checked++;
  }
  let beardFits=0;
  for(const head of defs.filter(d=>d.key.startsWith('head-')))for(const beard of defs.filter(d=>d.key.startsWith('beard-')&&!d.key.startsWith('beard-moustache'))){
   const fits=fitDonghoPart(beard,head), lower=fits.at(-1);
   const top=lower.cy-lower.h/2+(lower.crop?.top??0)*lower.h;
   if(!/stubble|chinstrap|full/.test(beard.key))must(Math.abs(top-(head.cy+head.h/2-2))<=3,`beard anchor ${head.key}/${beard.key}`);
   beardFits++;
  }
  let hatFits=0;
  for(const head of defs.filter(d=>d.key.startsWith('head-')))for(const hat of royalDefs.filter(d=>d.key.includes('-hat-'))){
   for(const fit of fitDonghoPart(hat,head)) {
    const left=fit.cx-fit.w/2+(fit.crop?.left??0)*fit.w;
    const right=fit.cx-fit.w/2+(fit.crop?.right??1)*fit.w;
    if(/royal-(ly-hat-1|le-hat-[23]|nguyen-hat-2)$/.test(hat.key))must(left>=-64&&right<=64,'wing escaped');
   }
   hatFits++;
  }
  window.__royalTest={starter,buildKingLook,renderLookInBox,ROYAL_WARDROBE,royalField,defs,ownsRoyalWardrobe};
  return {checked,beardFits,hatFits,owned:getLegacy().wardrobe.length};
 });
 assert.equal(report.owned,54);
 // Each part shown on a complete portrait. One era per screenshot keeps details readable.
 for(const era of ['dinh','ly','tran','le','tayson','nguyen']){
  await page.evaluate(era=>{
   const {starter,buildKingLook,renderLookInBox,ROYAL_WARDROBE,royalField}=window.__royalTest;
   const scene=window.__phaserGame.scene.getScene('MenuScene'); scene.children.removeAll(true);
   scene.cameras.main.setZoom(1).setScroll(0,0); const w=scene.cameras.main.width,h=scene.cameras.main.height;
   scene.add.rectangle(w/2,h/2,w,h,0xf0e7cf);
   ROYAL_WARDROBE.filter(i=>i.era===era).forEach((item,i)=>{
    const x=i%3*w/3,y=Math.floor(i/3)*h/3;
    const choice={...starter,era,sex:item.sex==='woman'?'woman':'man',age:'prime',beard:0,[royalField(item.slot)]:item.id};
    renderLookInBox(scene,buildKingLook(choice,3),{x:x+10,y:y+3,width:w/3-20,height:h/3-25},1.3);
    scene.add.text(x+6,y+h/3-21,item.name,{fontFamily:'serif',fontSize:'13px',color:'#392e25'});
   });
  },era);
  await page.waitForTimeout(100); await page.screenshot({path:`${out}/${era}.png`});
 }
 await page.evaluate(()=>{
  const {starter,buildKingLook,renderLookInBox}=window.__royalTest;
  const s=window.__phaserGame.scene.getScene('MenuScene');s.children.removeAll(true);
  const w=s.cameras.main.width,h=s.cameras.main.height;s.add.rectangle(w/2,h/2,w,h,0xf0e7cf);
  ['dinh','ly','tran','le','tayson','nguyen'].forEach((era,i)=>{
   const v=i===0||i===2||i===4?2:1;
   const c={...starter,era,sex:'man',age:'prime',beard:0,royalHat:`royal-${era}-hat-${v}`,royalRobe:`royal-${era}-robe-${v}`,royalOrnament:`royal-${era}-ornament-1`};
   const x=i%3*w/3,y=Math.floor(i/3)*h/2;
   renderLookInBox(s,buildKingLook(c,3),{x:x+4,y:y+12,width:w/3-8,height:h/2-48},1.8);
   s.add.text(x+w/6,y+h/2-30,['Đinh · võ tướng','Lý · triều phục','Trần · võ tướng','Lê · long bào','Tây Sơn · áo trận','Nguyễn · hoàng bào'][i],{fontSize:'14px',fontFamily:'serif',color:'#392e25'}).setOrigin(.5,0);
  });
 });
 await page.waitForTimeout(100);await page.screenshot({path:`${out}/complete-outfits.png`});
 await page.evaluate(()=>{
  const {starter,buildKingLook,renderLookInBox,defs}=window.__royalTest;
  const scene=window.__phaserGame.scene.getScene('MenuScene');scene.children.removeAll(true);
  const w=scene.cameras.main.width,h=scene.cameras.main.height;scene.add.rectangle(w/2,h/2,w,h,0xf0e7cf);
  const beards=defs.filter(d=>d.key.startsWith('beard-'));
  beards.forEach((beard,i)=>{
   const look=buildKingLook({...starter,era:'le',sex:'man',age:'elder',royalRobe:'royal-le-robe-1',royalHat:'royal-le-hat-1'},3);
   look.parts=look.parts.filter(p=>!p.key.startsWith('beard-'));look.parts.push({key:beard.key,tint:'hair'});
   const x=i%5*w/5,y=Math.floor(i/5)*h/3;
   renderLookInBox(scene,look,{x,y,width:w/5,height:h/3-20},1.1);
   scene.add.text(x+3,y+h/3-18,beard.key.replace('beard-',''),{fontSize:'12px',color:'#392e25'});
  });
 });
 await page.waitForTimeout(100);await page.screenshot({path:`outPLACE/beards.png`.replace('outPLACE',out)});
 // Real sheet handlers: unaffordable, purchase, remove, re-equip, return; two locales.
 for(const language of ['en','vi']){
  await page.evaluate(async language=>{
   const {setLanguage}=await import('/src/i18n/index.ts');setLanguage(language);
   const {CoronationSheet}=await import('/src/ui/coronation/CoronationSheet.ts');
   const {InkUI}=await import('/src/ui/InkUI.ts');
   const scene=window.__phaserGame.scene.getScene('MenuScene');scene.children.removeAll(true);
   const w=scene.cameras.main.width,h=scene.cameras.main.height;scene.add.rectangle(w/2,h/2,w,h,0xf0e7cf);
   const body=scene.add.container(12,12);
   const sheet=new CoronationSheet({scene,ui:new InkUI(scene),mode:'temple',finish(){},redraw(){body.removeAll(true);sheet.draw(body,336)}});
   sheet.choice={...window.__royalTest.starter,era:'le',sex:'man'};sheet.wardrobeOpen=true;
   localStorage.setItem('mandate:legacy:v1',JSON.stringify({points:0,wardrobe:[],ladder:10}));
   sheet.draw(body,336);window.__royalSheet=sheet;window.__royalBody=body;
  },language);
  const result=await page.evaluate(async()=>{
   const {getLegacy,addLegacyPoints}=await import('/src/state/legacy.ts');
   const sheet=window.__royalSheet,body=window.__royalBody,id='royal-le-hat-1';
   const tap=()=>body.list.find(o=>o.getData?.('royalItem')===id).emit('pointerup',{downX:0,downY:0,x:0,y:0});
   tap();if(sheet.choice.royalHat||getLegacy().points!==0)throw Error('unaffordable selected');
   addLegacyPoints(140);tap();if(sheet.choice.royalHat!==id||getLegacy().points!==0)throw Error('UI purchase');
   tap();if(sheet.choice.royalHat)throw Error('remove failed');
   tap();if(sheet.choice.royalHat!==id||getLegacy().points!==0)throw Error('reequip charged');
   return true;
  }); assert(result);
  await page.waitForTimeout(100);await page.screenshot({path:`${out}/shop-${language}.png`});
 }
 await page.reload(); await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
 assert(await page.evaluate(async()=> (await import('/src/state/legacy.ts')).ownsRoyalWardrobe('royal-le-hat-1')));
 for(const viewport of [{width:390,height:844},{width:390,height:664},{width:1440,height:900}]) {
  const live=await browser.newPage({viewport,deviceScaleFactor:1});live.on('pageerror',e=>errors.push(e.message));
  await live.goto(`${base}/?capture=1`);await live.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
  await live.evaluate(async()=>{
   const {setLanguage}=await import('/src/i18n/index.ts');setLanguage('en');
   const {setDynastyFounder}=await import('/src/state/dynasty.ts');
   const {rollFounder}=await import('/src/ui/faces/kingLook.ts');
   const {addLegacyPoints}=await import('/src/state/legacy.ts');addLegacyPoints(300);
   setDynastyFounder(rollFounder(0,()=>.7),'Lê');
   const m=window.__phaserGame.scene.getScene('MenuScene');m.mode='temple';m.render();
   m.templeSheet.choice.era='le';m.templeSheet.choice.sex='man';m.render();
  });
  const locate=async(data,id)=>await live.evaluate(({data,id})=>{
   const m=window.__phaserGame.scene.getScene('MenuScene'), area=m.pageScroll;
   const o=area.content.list.find(o=>o.getData?.(data)===(id??true));if(!o)throw Error(`Missing ${data}/${id}`);
   area.setScroll(o.y-area.bounds.height/2+(o.height||42)/2);
   const p=o.getWorldTransformMatrix().transformPoint((o.width||350)/2,(o.height||42)/2);
   const c=m.cameras.main,s=c.matrix.transformPoint(p.x-c.scrollX,p.y-c.scrollY);
   const rect=window.__phaserGame.canvas.getBoundingClientRect();
   return {x:rect.x+s.x/m.scale.width*rect.width,y:rect.y+s.y/m.scale.height*rect.height};
  },{data,id});
  const entry=await locate('royalWardrobeOpen');await live.mouse.click(entry.x,entry.y);await live.waitForTimeout(100);
  assert(await live.evaluate(()=>window.__phaserGame.scene.getScene('MenuScene').templeSheet.wardrobeOpen),'real entry tap');
  await live.screenshot({path:`${out}/temple-${viewport.width}-${viewport.height}.png`});
  const target=await locate('royalItem','royal-le-robe-1');await live.mouse.click(target.x,target.y);await live.waitForTimeout(100);
  const state=await live.evaluate(()=>JSON.parse(window.render_game_to_text()).wardrobe);
  assert.equal(state.points,120);assert(state.equipped.includes('royal-le-robe-1'));assert(state.owned.includes('royal-le-robe-1'));
  await live.screenshot({path:`${out}/temple-equipped-${viewport.width}-${viewport.height}.png`});
  await live.evaluate(()=>{const m=window.__phaserGame.scene.getScene('MenuScene');m.templeSheet.foot().close.onTap();m.templeSheet.step=1;m.templeSheet.foot().close.onTap()});
  assert(await live.evaluate(async()=> (await import('/src/state/dynasty.ts')).getDynasty().founder.look.parts.some(p=>p.key==='royal-le-robe-1')),'Temple finish lost wardrobe');
  await live.reload();await live.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
  assert(await live.evaluate(async()=> (await import('/src/state/dynasty.ts')).getDynasty().founder.look.parts.some(p=>p.key==='royal-le-robe-1')),'Reload lost founder outfit');
  await live.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/report.json`,JSON.stringify({...report,liveLayouts:3,errors},null,2));
 console.log('PASS',report,'purchase failure, exact balance, duplicate, era gating, save/reload, shop controls EN/VI; no errors');
}finally{await browser.close()}
