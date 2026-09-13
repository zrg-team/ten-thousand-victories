import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch();
const errors = [], samples = [];
fs.mkdirSync('output/hero-depth', { recursive: true });
try {
  for (const language of ['en', 'vi']) for (const width of [320,390,1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(lang => localStorage.setItem('mandate:language:v1',lang), language);
    await page.goto(`${process.env.DEV_URL ?? 'http://127.0.0.1:5179'}/?capture=1`);
    await page.waitForFunction(()=>window.__startBenchGame && window.__phaserGame?.scene.isActive('MenuScene'));
    await page.evaluate(()=>window.__startBenchGame(20260913,'ascent','beta'));
    await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('ConquestUIScene'));
    await page.waitForTimeout(500);
    samples.push(await page.evaluate(async () => {
      const state = window.__mandateState;
      const { generateHero } = await import('/src/data/heroFactory.ts');
      const service = await import('/src/systems/heroes/HeroService.ts');
      const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      const governor = generateHero(310), commander = generateHero(311);
      state.heroes.push(governor,commander);
      service.initializeRecruitedHero(state,governor); service.initializeRecruitedHero(state,commander);
      service.commitHeroAssignment(state,governor,{kind:'province',landId:state.ascent.capitalLandId});
      const army = state.armies.find(army=>army.kingdomId==='dai-viet');
      service.commitHeroAssignment(state,commander,{kind:'host',armyId:army.id});
      for(let i=0;i<6;i++) {
        state.pendingAscentPrompt = undefined; state.ascent.promptQueue=[]; state.isPaused=false;
        state.ascent.ticksToWave=1000; army.rations=100; army.provisions=100;
        advanceAscentTick(state);
      }
      state.pendingAscentPrompt=undefined;state.ascent.promptQueue=[];state.isPaused=false;
      ui.events.emit('state-changed'); ui.openLane('heroes');
      window.__heroShotId = governor.id;
      return { governor: service.heroSummary(state,governor), commander:service.heroSummary(state,commander) };
    }));
    await page.waitForTimeout(450);
    await page.screenshot({path:`output/hero-depth/roster-${language}-${width}.png`});
    await page.evaluate(async()=>{
      const { showHeroDepth } = await import('/src/scenes/conquest/screens/heroDepth.ts');
      const ui=window.__phaserGame.scene.getScene('ConquestUIScene');
      ui.replaceLanePage(()=>showHeroDepth(ui,window.__heroShotId));
    });
    await page.waitForTimeout(300);
    await page.screenshot({path:`output/hero-depth/detail-${language}-${width}.png`});
    fs.writeFileSync(`output/hero-depth/state-${language}-${width}.json`,await page.evaluate(()=>window.render_game_to_text()));
    const native=await page.evaluate(()=>({paused:window.__mandateState.isStrategyPause,input:window.__phaserGame.input.enabled,
      overlays:document.querySelectorAll('[data-hero-access], [data-hero-comparison], [data-hero-archive-exit]').length}));
    if(!native.paused||!native.input||native.overlays)errors.push(`Native UI ${language}/${width}: ${JSON.stringify(native)}`);
    await page.close();
  }
} finally { await browser.close(); }
fs.writeFileSync('output/hero-depth/play-results.json',JSON.stringify({samples,errors},null,2));
console.log(JSON.stringify({errors, samples:samples.map(s=>({governor:s.governor.xp,commander:s.commander.xp}))}));
if(errors.length) process.exitCode=1;
