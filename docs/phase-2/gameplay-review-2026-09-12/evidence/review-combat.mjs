import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir='docs/phase-2/gameplay-review-2026-09-12/evidence/combat-controls';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.addInitScript(()=>{localStorage.setItem('mandate:language:v1','en');localStorage.setItem('mandate:graphics:v1','medium')});
await page.goto('http://127.0.0.1:5179/?capture=1&layout=phone');
await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
await page.evaluate(()=>{window.__phaserGame.scene.start('BattleArenaScene');});
await page.waitForFunction(()=>window.__phaserGame.scene.isActive('BattleArenaScene'));
await page.waitForTimeout(800);
// Controlled setup only: large equal armies allow the controls to be inspected without tool latency deciding the fight.
await page.evaluate(()=>{const a=window.__phaserGame.scene.getScene('BattleArenaScene');a.ourMen=9000;a.theirMen=9000;a.startFight();});
await page.waitForFunction(()=>window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey==='lane:battle');
const log=[];
async function snap(name){await page.screenshot({path:`${dir}/${name}.png`});const state=await page.evaluate(()=>{const st=window.__mandateState,b=st.ascent.activeBattle;return {formation:b.ourFormation,target:b.formationTarget,stance:b.stance,pending:b.stancePending,stamina:b.stamina,ours:b.ourNow,theirs:b.theirNow,round:b.round,over:b.over,paused:st.isStrategyPause,ui:window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey};});log.push({name,state});}
await snap('01-opening');
await page.mouse.click(267,733,{delay:120});await page.waitForTimeout(150);await snap('02-shields-ordered');
await page.mouse.click(286,669,{delay:120});await page.waitForTimeout(150);await snap('03-press-ordered');
await page.waitForFunction(()=>window.__mandateState.ascent.activeBattle.round>=4,null,{timeout:20000});await snap('04-orders-landed');
await page.mouse.click(58,813,{delay:120});await page.waitForTimeout(250);await snap('05-pause');
await page.waitForTimeout(1200);await snap('06-pause-holds');
writeFileSync(`${dir}/results.json`,JSON.stringify({scope:'Instrumented equal-army skirmish, native mouse controls in phone layout; not a balance win-rate test.',log,errors},null,2));
console.log(JSON.stringify({log,errors}));await browser.close();
