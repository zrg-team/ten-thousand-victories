import { chromium } from 'playwright';
import fs from 'node:fs';
import { heroCanvasText, clickHeroCanvas, heroDomOverlays } from '../playtest/hero-canvas.mjs';
const browser=await chromium.launch(),checks=[],errors=[],timings=[];
const base=process.env.DEV_URL??'http://127.0.0.1:5179';
try{
  fs.mkdirSync('output/hero-depth',{recursive:true});
  for(const lang of ['en','vi'])for(const width of [320,390,1440]){
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(lang=>localStorage.setItem('mandate:language:v1',lang),lang);
    await page.goto(`${base}/?capture=1`);await page.waitForFunction(()=>window.__startBenchGame&&window.__phaserGame?.scene.isActive('MenuScene'));
    await page.evaluate(()=>window.__startBenchGame(20260914,'ascent','beta'));
    await page.waitForFunction(()=>window.__phaserGame.scene.isActive('ConquestUIScene'));
    const data=await page.evaluate(async()=>{
      const s=window.__mandateState,ui=window.__phaserGame.scene.getScene('ConquestUIScene');
      const service=await import('/src/systems/heroes/HeroService.ts'),{generateHero}=await import('/src/data/heroFactory.ts'),{t}=await import('/src/i18n/index.ts');
      const heroes=[generateHero(700),generateHero(701)];s.heroes.push(...heroes);heroes.forEach(h=>service.initializeRecruitedHero(s,h));
      const land=s.lands.find(l=>l.id===s.ascent.capitalLandId);service.commitHeroAssignment(s,heroes[0],{kind:'province',landId:land.id});
      service.creditHeroService(s,heroes[0],{id:'ui-v2-credit',window:1,stat:'administration',service:6});
      s.pendingAscentPrompt=undefined;s.ascent.promptQueue=[];s.isPaused=true;ui.events.emit('state-changed');ui.dockExpanded=true;ui.openLane('heroes');
      window.__heroInterface={hero:heroes[0].id,other:heroes[1].id,land:land.id};
      // The aftermath is a row in the Heroes page's bottom sheet now (opened above), labelled with its count.
      return {aftermathRow:`${t('hero.depth.aftermath')} · ${s.ascent.heroDepth.notices.length}`,compare:t('hero.depth.compare'),aftermath:t('hero.depth.aftermath'),chronicle:t('hero.depth.chronicle'),hero:heroes[0].name};
    });
    const check=(name,pass,detail)=>checks.push({name:`${lang}/${width}: ${name}`,pass:!!pass,detail});
    check('hero roster uses game UI with no HTML overlays',await heroDomOverlays(page)===0);
    check('comparison action removed',!(await heroCanvasText(page)).includes(data.compare));
    await clickHeroCanvas(page,data.aftermathRow);
    const aftermath=await heroCanvasText(page);
    check('canvas action opens grouped hero aftermath',aftermath.includes(data.aftermath)&&aftermath.includes(data.hero));
    await page.evaluate(async()=>{
      const service=await import('/src/systems/heroes/HeroService.ts'),{showHeroChronicle}=await import('/src/scenes/conquest/screens/heroDepth.ts');
      const s=window.__mandateState,hero=s.heroes.find(h=>h.id===window.__heroInterface.hero);
      service.memorializeHero(s,hero,'dismissed');
      const ui=window.__phaserGame.scene.getScene('ConquestUIScene');ui.replaceLanePage(()=>showHeroChronicle(ui));
    });
    const chronicle=await heroCanvasText(page);
    check('chronicle displays saved former posting',chronicle.includes(lang==='vi'?'Vị trí cuối:':'Last posting:'));
    check('no untranslated hero UI keys',!/(hero\.depth\.|hero\.perk\.|stat\.)/.test(chronicle));
    check('canvas input stays enabled during reading',await page.evaluate(()=>window.__phaserGame.input.enabled&&window.__mandateState.isStrategyPause));
    check('chronicle adds no browser popup',await heroDomOverlays(page)===0);
    const samples=await page.evaluate(async()=>{
      const {heroAssignmentPreview}=await import('/src/systems/heroes/heroPreview.ts');
      const s=window.__mandateState,h=s.heroes.find(h=>h.id===window.__heroInterface.other),values=[];
      for(let i=0;i<30;i++){const start=performance.now();heroAssignmentPreview(s,h,{kind:'province',landId:window.__heroInterface.land});values.push(performance.now()-start);}
      return values.sort((a,b)=>a-b);
    });
    timings.push({lang,width,environment:'Desktop Chromium, fresh two-hero fixture; not physical-mobile performance',n:samples.length,p50:samples[15],p95:samples[28]});
    await page.close();
  }
}finally{await browser.close();}
checks.push({name:'No browser exceptions',pass:errors.length===0,detail:errors});
fs.writeFileSync('output/hero-depth/interface-v2.json',JSON.stringify({checks,errors,timings},null,2));
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} interface checks passed`,checks.filter(c=>!c.pass));
if(checks.some(c=>!c.pass))process.exitCode=1;
