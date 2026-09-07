// Verify hostile reinforcement routing, attrition, luck, cards and capital UI.
// Usage: DEV_URL=http://127.0.0.1:5179 WIDTH=1280 node test_scripts/verify/verify-hostile-reinforcement.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('output/web-game', { recursive: true });

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const HEIGHT = Number(process.env.HEIGHT ?? 844);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.WIDTH ?? 390), height: HEIGHT }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);

await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(900);
await page.evaluate(() => {
  const s = window.__phaserGame.scene.getScene('BattleArenaScene');
  s.ourMen = 1500; s.theirMen = 1500; s.martial = 70; s.ground = 'hills';
  s.startFight();
});
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 20000 });
await page.waitForTimeout(700);
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.battleAwaitingOrder = false;
  window.__mandateState.isStrategyPause = false;
});



const report = await page.evaluate(async()=>{
  const W=await import('/src/systems/WarSystem.ts');
  const R=await import('/src/systems/ascent/reinforcement.ts');
  const H=await import('/src/systems/ascent/hostileMarch.ts');
  const P=await import('/src/systems/ascent/PowerDraftSystem.ts');
  const M=await import('/src/systems/ascent/battleMembership.ts');
  const original=window.__mandateState;
  const checks=[]; const check=(ok,msg)=>{if(!ok)throw new Error(msg); checks.push(msg)};
  const make=()=>{
    const s=structuredClone(original); const template=s.lands[0];
    s.lands=[0,1,2,3].map((n)=>({...structuredClone(template),id:'route-'+n,name:'Trấn '+n,
      ownerId:n===0||n===3?'dai-viet':'northern-rival',buildings:[],
      neighbors:[n-1,n+1].filter(i=>i>=0&&i<4).map(i=>'route-'+i)}));
    const a=structuredClone(s.armies.find(a=>a.kingdomId==='dai-viet'&&!a.isLevy));
    Object.assign(a,{id:'relief-test',name:'Đạo tiếp viện',landId:'route-0',units:{spearmen:600,archers:300,heavyInfantry:100},orders:undefined,refit:undefined,patron:undefined});
    s.armies=[a]; s.movementOrders=[];s.siegeOrders=[];s.acquisitionOrders=[];s.pendingBattle=undefined;
    s.ascent.sideBattles=[];s.ascent.cardStacks={};s.ascent.capitalLandId='route-0';
    Object.assign(s.ascent.activeBattle,{landId:'route-3',landName:'Trấn 3',role:'defence',ourArmyIds:[],theirArmyIds:[],over:undefined,round:1,totalRounds:72});
    return {s,a,b:s.ascent.activeBattle};
  };
  let {s,a,b}=make();
  check(!W.findLandPath(s,a.landId,b.landId),'ordinary route remains blocked by hostile transit');
  const row=R.reinforcementCandidates(s,b)[0];
  check(!row.blockedReason&&row.hostileLands===2&&row.routeWarning&&row.etaTicks>0,'hostile relief offered with warning and ETA');
  check(R.sendReinforcement(s,b,a.id)&&s.movementOrders[0]?.hostileTransit,'send creates authorized transit order');
  const originalRoll=Math.random;
  const step=(roll)=>{const o=s.movementOrders[0];o.progress=o.legRequired-1;Math.random=()=>roll;try{W.progressMovementOrders(s)}finally{Math.random=originalRoll}};
  step(0.99);
  check(a.landId==='route-1'&&Object.values(a.units).reduce((x,y)=>x+y,0)===920,'first hostile leg loses 8 percent and advances');
  check(s.lands[1].ownerId==='northern-rival'&&!s.pendingBattle,'transit neither captures nor starts battle');
  s=JSON.parse(JSON.stringify(s));a=s.armies[0];b=s.ascent.activeBattle;
  check(s.movementOrders[0].hostileCrossed===1,'save round trip preserves exposure');
  step(0.99);
  check(Object.values(a.units).reduce((x,y)=>x+y,0)===828,'second hostile leg loses 10 percent of survivors');
  step(0.99);
  check(a.landId==='route-3'&&s.movementOrders.length===0,'survivors arrive at rally');
  M.enrolArrivals(s,b);
  check(b.ourArmyIds.includes(a.id),'surviving relief joins the watched fight');
  ({s,a,b}=make()); R.sendReinforcement(s,b,a.id);step(0);step(0);step(0);
  check(Object.values(a.units).reduce((x,y)=>x+y,0)===1000,'lucky march arrives without losses');
  const plain=H.hostileMarchRisk(s,s.lands[1],0);s.lands[1].buildings=[{type:'tower',level:2},{type:'wall',level:1},{type:'barracks',level:1}];
  const fortified=H.hostileMarchRisk(s,s.lands[1],0);
  check(fortified.loss>plain.loss&&fortified.safe<plain.safe,'hostile defenses increase loss and detection');
  check(P.takePowerCard(s,'hidden-paths')&&P.takePowerCard(s,'march-escort'),'both cards can be drafted');
  const protectedRisk=H.hostileMarchRisk(s,s.lands[1],0);
  check(protectedRisk.loss<fortified.loss&&protectedRisk.safe>fortified.safe,'both card effects applied');
  const single={...a,units:{spearmen:1,archers:0,heavyInfantry:0}};
  check(H.applyHostileMarchLoss(single,0.3,0.15,0.99)===1&&single.units.spearmen===0,'last soldier can be lost without negative counts');
  ({s,a,b}=make());a.units={spearmen:1,archers:0,heavyInfantry:0};
  R.sendReinforcement(s,b,a.id);step(0.99);
  check(s.armies.length===0&&s.movementOrders.length===0,'wiped out host and its march are removed');
  ({s,a,b}=make());
  const extra={...structuredClone(s.lands[0]),id:'detour',neighbors:['route-0','route-3']};
  s.lands.push(extra);s.lands[0].neighbors.push('detour');s.lands[3].neighbors.push('detour');
  R.sendReinforcement(s,b,a.id);
  check(s.movementOrders[0].path[0]==='detour','friendly detour preferred over enemy crossing');
  ({s,a,b}=make());b.role='offence'; b.landId='target';
  const target={...structuredClone(s.lands[1]),id:'target',neighbors:['route-3']};s.lands.push(target);s.lands[3].neighbors.push('target');
  check(!R.reinforcementCandidates(s,b)[0].blockedReason&&R.sendReinforcement(s,b,a.id),'offensive relief can traverse hostile land to staging');
  check(s.movementOrders[0]?.path.at(-1)==='route-3','offensive relief targets friendly staging province');
  ({s,a,b}=make());s.lands[1].ownerId='dai-viet';s.lands[2].ownerId='dai-viet';
  check(!R.reinforcementCandidates(s,b)[0].routeWarning,'friendly route has no hostile warning');
  s.lands[0].neighbors=[];
  check(Boolean(R.reinforcementCandidates(s,b)[0].blockedReason),'physically disconnected destination remains blocked');
  ({s,a,b}=make());
  // Use real scene state for reviewable reinforcement and capital screenshots.
  Object.assign(original,s);window.__mandateState=original;
  const ui=window.__phaserGame.scene.getScene('ConquestUIScene');
  const dock=await import('/src/scenes/conquest/battle/dock.ts');
  dock.showReinforcePicker(ui,()=>{});
  return checks;
});
await page.screenshot({path:'output/web-game/hostile-reinforcement.png'});
if(Number(process.env.WIDTH??390)===390) {
  await page.mouse.click(220,190);
  const sent=await page.evaluate(()=>window.__mandateState.movementOrders.some(o=>o.armyId==='relief-test'&&o.hostileTransit));
  if(!sent)throw new Error('Warning row did not dispatch on click');
  report.push('warning row remains clickable and sends relief');
}
await page.evaluate(async()=>{
 const ui=window.__phaserGame.scene.getScene('ConquestUIScene');
 const build=await import('/src/scenes/conquest/screens/build.ts');
 ui.replaceLanePage(()=>build.showBuildScreen(ui));
});
await page.screenshot({path:'output/web-game/capital-highlight.png'});
if(Number(process.env.WIDTH??390)===390) {
  await page.mouse.click(110,300);
  const title=await page.evaluate(()=>{
    const ui=window.__phaserGame.scene.getScene('ConquestUIScene');const out=[];
    const walk=o=>{if(o.type==='Text')out.push(o.text);if(o.list)o.list.forEach(walk)};walk(ui.modalLayer);return out.join(' ');
  });
  if(!title.includes('Kinh đô')&&!title.includes('Capital'))throw new Error('Capital label missing from opened province');
  report.push('capital tile opens with capital label');
}
if(errors.length)throw new Error(errors.join('\n'));
console.log(JSON.stringify({report,errors}));await browser.close();
