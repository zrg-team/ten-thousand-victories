/** Real pointer scrolling, recycling, sheet locking and tap protection at short-phone height.
 * Power drafts now use a fan; a bounded interactive list fixture exercises the shared row path. */
import { boot, startWorld, resolveOpening, report, BASE } from '../perf/_boot.mjs';
const {browser,page,errors}=await boot({quality:'medium',dpr:2,query:'?capture=1&bench=1'});
const checks=[];
try {
  await page.setViewportSize({width:390,height:620});await page.goto(`${BASE}/?capture=1&bench=1`);
  await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
  await startWorld(page,{mode:'ascent'});await resolveOpening(page);
  await page.evaluate(()=>{
    const ui=window.__phaserGame.scene.getScene('ConquestUIScene');ui.beginOverlay('codex');
    const area=ui.ui.scrollArea({x:20,y:180,width:350,height:330});area.addTo(ui.modalLayer);ui.activeScrollAreas.push(area);
    window.__picked=[];let y=0;
    for(let i=0;i<127;i++){const top=y,height=i%3===0?72:54;
      area.lazyRow(`item:${i}`,top,height,()=>area.content.add(ui.ui.button({x:0,y:top,width:340,height:height-8},`Row ${i}`,()=>window.__picked.push(i))));y+=height;
    }area.setContentHeight(y);window.__list=area;window.__mandateState.isStrategyPause=true;
  });
  await page.waitForTimeout(300);
  const box=await page.evaluate(()=>{const g=window.__phaserGame,r=g.canvas.getBoundingClientRect(),scale=window.__ladder.state().scale;return {x:r.x,y:r.y,k:r.width/(g.scale.width/scale)};});
  const at=(x,y)=>[box.x+x*box.k,box.y+y*box.k];
  const drag=async()=>{await page.mouse.move(...at(180,470));await page.mouse.down();for(let i=1;i<=12;i++){await page.mouse.move(...at(180,470-i*18));await page.waitForTimeout(16);}await page.mouse.up();await page.waitForTimeout(120);};
  await drag();
  const after=await page.evaluate(()=>({offset:window.__list.offset,picked:window.__picked,stats:window.__list.virtualStats()}));
  checks.push(['finger drag scrolls variable-height rows',after.offset>100,JSON.stringify(after)]);
  checks.push(['release after scrolling selects nothing',after.picked.length===0]);
  checks.push(['row objects stay bounded',after.stats.mounted<=12]);
  await page.evaluate(()=>{window.__list.setLocked(true);window.__list.setScroll(0);});await drag();
  checks.push(['a raised sheet locks scrolling',await page.evaluate(()=>window.__list.offset===0)]);
  await page.evaluate(()=>{window.__list.setLocked(false);window.__list.setScroll(0);});await page.waitForTimeout(160);
  await page.mouse.click(...at(180,205));await page.waitForTimeout(200);
  checks.push(['a fresh tap still selects the visible row',await page.evaluate(()=>window.__picked.length===1&&window.__picked[0]===0)]);
  await page.evaluate(()=>window.__list.setScroll(100000));
  checks.push(['the final row is reachable',await page.evaluate(()=>window.__list.offset===window.__list.maxScroll&&window.__list.content.list.some(r=>r.getData('virtualKey')==='item:126'&&r.visible))]);
  const outside=await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestUIScene'),a=window.__list;const nodes=[];const walk=o=>{if(o.input)nodes.push(o);o.list?.forEach(walk);};a.content.list.filter(r=>!r.visible).forEach(walk);return nodes.every(o=>!s.input.manager.inputCandidate(o,s.cameras.main));});
  checks.push(['offscreen rows cannot receive input',outside]);
  checks.push(['content changes preserve the visible item and inset',await page.evaluate(()=>{
    const ui=window.__phaserGame.scene.getScene('ConquestUIScene'),area=ui.ui.scrollArea({x:0,y:0,width:200,height:100});
    const VirtualList=window.__list.lazyList.constructor;
    const items=Array.from({length:20},(_,i)=>({id:`key:${i}`,height:i%2?60:40}));
    const list=new VirtualList(area,{key:item=>item.id,measure:item=>item.height,create:()=>ui.add.container(),bind:()=>{}},items);
    area.setScroll(517);list.setItems([{id:'inserted',height:73},...items]);
    const preserved=area.offset===590;area.destroy();return preserved;
  })]);
  checks.push(['no console errors',errors.length===0,errors.join(' | ')]);
} finally {await browser.close();}
report(checks);
