/** Launch-only Auto selection and a passive current-session monitor. Production compatible. */
import { boot, startWorld, resolveOpening, report } from '../perf/_boot.mjs';
const checks=[];
const heat = page => page.evaluate(()=>{
  const g=window.__phaserGame;
  for(let i=0;i<450;i++){g.events.emit('prestep',i*100,100);g.events.emit('postrender');}
  return {state:window.__ladder.state(),record:JSON.parse(localStorage.getItem('mandate:graphics:launch:v3'))};
});
{
  const {browser,page,errors}=await boot({quality:'auto',dpr:2,query:'?bench=1',ladder:true});
  try {
    const initial=await page.evaluate(()=>({state:window.__ladder.state(),record:JSON.parse(localStorage.getItem('mandate:graphics:launch:v3')),old:localStorage.getItem('mandate:graphics:rung:v1')}));
    checks.push(['first run calibrates a clarity-preserving profile', ['high','medium','clarity'].includes(initial.state.rung)&&initial.state.scale>=2&&initial.state.fps>=40&&initial.record?.samples?.length>0,JSON.stringify(initial)]);
    checks.push(['obsolete automatic rung records are discarded', initial.old===null]);
    // A deterministic High fixture isolates monitor behavior from this test computer's GPU.
    await page.evaluate(()=>window.__ladder.useAuto('high'));
    const hot=await heat(page);
    checks.push(['heat recommends next launch without changing this session',hot.state.rung==='high'&&hot.record.next==='medium'&&hot.state.stepsDown===0,JSON.stringify(hot)]);
    await startWorld(page,{mode:'ascent'});await resolveOpening(page);
    checks.push(['scene transitions keep this session fixed',await page.evaluate(()=>window.__ladder.state().rung==='high')]);
    await page.reload();await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
    checks.push(['next launch uses the saved recommendation',await page.evaluate(()=>window.__ladder.state().rung==='medium')]);
    await page.evaluate(()=>{const k='mandate:graphics:launch:v3',r=JSON.parse(localStorage.getItem(k));r.fingerprint='obsolete';localStorage.setItem(k,JSON.stringify(r));});
    await page.reload();await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
    checks.push(['changed display/profile characteristics invalidate calibration',await page.evaluate(()=>JSON.parse(localStorage.getItem('mandate:graphics:launch:v3')).fingerprint!=='obsolete')]);
    checks.push(['no Auto console errors',errors.length===0,errors.join(' | ')]);
  } finally {await browser.close();}
}
{
  const {browser,page,errors}=await boot({quality:'high',dpr:2,query:'?bench=1',ladder:true});
  try {
    const hot=await heat(page);
    checks.push(['manual High is preserved and bypasses calibration',hot.state.rung==='high'&&hot.state.pinned&&hot.record===null,JSON.stringify(hot)]);
    await startWorld(page,{mode:'ascent'});
    checks.push(['manual choice survives entering play',await page.evaluate(()=>window.__ladder.state().rung==='high')]);
    checks.push(['no manual console errors',errors.length===0,errors.join(' | ')]);
  } finally {await browser.close();}
}
report(checks);
