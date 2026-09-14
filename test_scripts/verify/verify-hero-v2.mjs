import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
let report;
try {
  await page.goto(`${process.env.DEV_URL ?? 'http://127.0.0.1:5179'}/?capture=1`);
  await page.waitForFunction(() => window.__startBenchGame && window.__phaserGame?.scene.isActive('MenuScene'));
  report = await page.evaluate(async () => {
    const service = await import('/src/systems/heroes/HeroService.ts');
    const model = await import('/src/systems/heroes/heroModel.ts');
    const { heroFate } = await import('/src/systems/heroes/heroFate.ts');
    const { newAscentRun } = await import('/src/state/ascentRun.ts');
    const { generateHero } = await import('/src/data/heroFactory.ts');
    const { heroAssignmentPreview } = await import('/src/systems/heroes/heroPreview.ts');
    const { heroProvinceModifiers } = await import('/src/systems/heroes/heroContributions.ts');
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { saveSnapshot, autosaveSnapshot, loadSnapshot, pendingAutosave, SAVE_SNAPSHOT_KEY, AUTOSAVE_SNAPSHOT_KEY } = await import('/src/state/save.ts');
    const { archiveHeroChronicle } = await import('/src/state/heroChronicle.ts');
    const { validHeroSave } = await import('/src/systems/heroes/heroSave.ts');
    const checks = [], distributions = [], check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
    const make = () => { const s = newAscentRun({ ruleset: 'beta' }); s.pendingAscentPrompt = undefined; s.ascent.promptQueue = []; s.isStrategyPause = false; s.isPaused = false; return s; };
    let seed = 510;
    const recruit = s => { const h = generateHero(seed++); s.heroes.push(h); service.initializeRecruitedHero(s, h); return h; };
    const fixture = () => {
      const s = make(), h = recruit(s), land = s.lands.find(land => land.id === s.ascent.capitalLandId);
      const refuge = s.lands.find(other => land.neighbors.includes(other.id)); refuge.ownerId = 'dai-viet';
      service.commitHeroAssignment(s, h, { kind: 'province', landId: land.id });
      return { s, h, land, refuge };
    };
    const fresh = make();
    check('Fresh Beta snapshots v2 with death disabled', fresh.ascent.heroDepth.rules.version === 2 && !model.heroCapability(fresh, 'lethal'));
    check('New runs snapshot the approved +2 professional training', fresh.ascent.heroDepth.rules.trainingPerLevel === 2);
    saveSnapshot(fresh); check('V2 rules survive reload without registry migration', loadSnapshot().state.ascent.heroDepth.rules.version === 2);
    const stable = newAscentRun({ ruleset: 'stable' }); service.beginHeroSeason(stable);
    check('Stable does not allocate measurements or hero fields', !stable.ascent.heroDepth && stable.heroes.every(h => !h.growth));
    {
      const s=make(), h=recruit(s); s.ascent.heroDepth.rules.trainingPerLevel=0;
      service.creditHeroService(s,h,{id:'training-ablation',window:1,stat:'martial',service:6,deed:2});
      check('Training ablation retains levels/XP without earned stat bonuses', h.growth.xp===8 && model.heroLevel(h)===2 && Object.values(h.growth.training).every(n=>n===0));
      check('Saved ablation rules validate', validHeroSave(s));
      s.ascent.heroDepth.measurements.counts=null;
      check('Corrupt measurement data is rejected before simulation resumes', !validHeroSave(s));
    }

    for (const withdrawal of [false, true]) {
      const s = make(), a = recruit(s), b = recruit(s), host = s.armies.find(army => army.kingdomId === 'dai-viet');
      const second = { ...structuredClone(host), id: 'hero-v2-second' }; s.armies.push(second);
      service.commitHeroAssignment(s, a, { kind: 'host', armyId: host.id }); service.commitHeroAssignment(s, b, { kind: 'host', armyId: second.id });
      service.beginHeroEncounter(s, host.landId, [host.id, second.id]);
      s.ascent.wavesSurvived++;
      service.completeHeroEncounter(s, host.landId, false, withdrawal); service.completeHeroEncounter(s, host.landId, false, withdrawal);
      check(`Two commanders: ${withdrawal ? 'withdrawal earns deed' : 'defeat earns participation'} once in originating window`,
        [a,b].every(h => h.growth.xp === (withdrawal ? 4 : 2) && h.growth.windows[1].service === 2 && h.growth.windows[1].deed === (withdrawal ? 2 : 0) && !h.growth.windows[2]));
    }
    {
      const s = make(), h = recruit(s), host = s.armies.find(a => a.kingdomId === 'dai-viet');
      service.commitHeroAssignment(s, h, { kind: 'host', armyId: host.id });
      const receipt = { id: 'requested-column', window: 1, instanceId: h.growth.instanceId, requested: true };
      service.heroResupplyDelivery(s, host.id, receipt, 2, 3, false);
      check('Partial requested column earns service but no completion deed', h.growth.xp === 2 && h.growth.windows[1].deed === 0);
      s.ascent.wavesSurvived++;
      service.heroResupplyDelivery(s, host.id, receipt, 2, 3, true); service.heroResupplyDelivery(s, host.id, receipt, 2, 3, true);
      check('Completed requested column earns deed once in dispatch window', h.growth.xp === 4 && h.growth.windows[1].deed === 2 && !h.growth.windows[2]);
    }
    {
      const { s, h, land, refuge } = fixture();
      const before = JSON.stringify(s), preview = heroAssignmentPreview(s, h, { kind: 'province', landId: refuge.id });
      check('Destination comparison never mutates live state', JSON.stringify(s) === before);
      check('Destination training uses its real focus', !!preview.stat);
      const home = heroAssignmentPreview(s, h, { kind: 'home' }); check('Home predicts no earned professional training', home.stat === undefined);
      const encounter = service.beginHeroEncounter(s, land.id, []), exposure = s.ascent.heroDepth.exposures[`${encounter}:${h.growth.instanceId}`];
      const turn = s.turn, resources = JSON.stringify(s.resources);
      advanceAscentTick(s);
      // A hero warning no longer stops the world (reported: the game halted over and over for "… gặp nguy").
      void resources;
      check('First warning does not stop the world: the season runs and its grace is marked', s.turn > turn && !s.isStrategyPause && exposure.pauseIssued);
    }
    {
      // Hold and revision on an encounter the season has not yet played out: with the world no longer
      // stopped for a warning, a full tick resolves this fixture's enemy-less encounter at once.
      const { s, h, refuge, land } = fixture();
      const encounter = service.beginHeroEncounter(s, land.id, []), exposure = s.ascent.heroDepth.exposures[`${encounter}:${h.growth.instanceId}`];
      const revision = exposure.revision;
      check('Current encounter hold accepted', service.holdHero(s, exposure.id, revision).ok);
      refuge.ownerId = 'neutral'; service.refreshHeroExposure(s, h, exposure);
      check('Changed escape geometry revokes hold and re-raises the warning without pausing', exposure.revision > revision && !exposure.hold && !exposure.acknowledged && !s.isStrategyPause);
      check('Stale hold confirmation cannot accept revised risk', !service.holdHero(s, exposure.id, revision).ok);
    }
    for (const lossIn of [1, 8]) {
      const { s, h, land } = fixture();
      // Two observed beats make a real attrition estimate, instead of inventing an odds roll.
      const front = { landId: land.id, over: false, round: 1, ourNow: lossIn * 100, theirNow: 10000, ourMorale: 90, theirMorale: 90,
        beats: [{ ourLoss: 50, theirLoss: 1 }, { ourLoss: 50, theirLoss: 1 }], ourArmyIds: [], invaderArmyId: 'front-host' };
      s.ascent.activeBattle = front;
      const encounter = service.beginHeroEncounter(s, land.id, []), exposure = s.ascent.heroDepth.exposures[`${encounter}:${h.growth.instanceId}`];
      const forecast = service.heroRiskForecast(s, h, land.id);
      service.beginHeroSeason(s); s.isStrategyPause = false; service.beginHeroSeason(s);
      const endangered = forecast.lossIn <= (forecast.arrivalTurn - s.turn) + 1;
      check(`Observed field ETA ${lossIn}: protection follows escape ETA + 1`, endangered ? h.life.kind === 'transit' || !!h.life.sheltering : h.life.kind === 'active' && !h.life.sheltering, forecast);
      if (!endangered) {
        service.holdHero(s, exposure.id, exposure.revision); front.theirNow *= 2;
        service.refreshHeroExposure(s, h, exposure);
        check('Enemy reinforcement invalidates a previous hold', !exposure.hold && !exposure.acknowledged);
      }
    }
    {
      const { s, h, land } = fixture(); s.ascent.heroDepth.policies.push('hero-frontier-commission');
      service.beginHeroEncounter(s, land.id, []);
      land.specialization = 'balanced'; check('Commission rejects non-fortress without spending its use', !service.useHeroPolicy(s, 'hero-frontier-commission', h.id, land.id).ok && s.ascent.heroDepth.policyUses['hero-frontier-commission'] === undefined);
      land.specialization = 'fortress'; s.ascent.activeBattle = { landId: land.id, over: false, round: 1 };
      check('Commission rejects locked combat orders', service.heroCommissionReason(s, h.id, land.id) === 'orders-locked');
      delete s.ascent.activeBattle;
      check('Commission accepted before engagement on a fortress', service.useHeroPolicy(s, 'hero-frontier-commission', h.id, land.id).ok);
      check('Commission retains actual defensive contribution and production cost', heroProvinceModifiers(s, land).defense === .1 && heroProvinceModifiers(s, land).food === -.1);
      const quote = service.previewHeroTransfer(s, h.id, { kind: 'home' }); service.transferHero(s, quote);
      check('Departure removes commission defense but keeps following settlement production cost', heroProvinceModifiers(s, land).defense === 0 && heroProvinceModifiers(s, land).food === -.1);
      s.turn++; service.tickHeroLifecycle(s);
      check('Commission production cost expires after next settlement', heroProvinceModifiers(s, land).food === 0);
    }
    {
      const { s, h, land } = fixture(), captor = s.kingdoms.find(k => k.id !== 'dai-viet' && !k.isDefeated);
      service.unlinkHeroDuty(s, h); h.life = { kind: 'captive', captorId: captor.id, detentionId: 'court:captor', capturedTurn: s.turn, exposureId: 'capture-A' };
      s.resources.gold = 10000;
      const quote = service.quoteHeroRelease(s, h.id, 'gold'), gold = s.resources.gold;
      h.life.exposureId = 'capture-B';
      check('Same-price recapture invalidates ransom confirmation', !service.releaseHeroFromQuote(s, quote).ok && s.resources.gold === gold);
      h.life.exposureId = 'capture-A'; h.growth.instanceId += ':new-instance';
      check('Replacement hero identity invalidates ransom confirmation', !service.releaseHeroFromQuote(s, quote).ok && s.resources.gold === gold);
      const valid = service.quoteHeroRelease(s, h.id, 'gold');
      check('Fresh ransom quote commits cost and release once', service.releaseHeroFromQuote(s, valid).ok && !service.releaseHeroFromQuote(s, valid).ok && s.resources.gold === gold - valid.cost);
      service.commitHeroAssignment(s, h, { kind: 'province', landId: land.id }); archiveHeroChronicle(s);
      check('Surviving chronicle records former posting', s.ascent.heroDepth.memorials.find(m => m.heroId === h.id).formerAssignment?.landId === land.id);
      const traveler=recruit(s);service.commitHeroAssignment(s,traveler,{kind:'province',landId:land.id});
      service.commitHeroAssignment(s,traveler,{kind:'home'});service.memorializeHero(s,traveler,'dismissed');
      const entry=s.ascent.heroDepth.memorials.find(m=>m.heroId===traveler.id);
      check('Former posting keeps its name after departure and world replacement',entry.formerAssignment?.landId===land.id && entry.formerPlaceName===land.name);
    }
    {
      const { s, h, land, refuge } = fixture();
      service.transferHero(s, service.previewHeroTransfer(s, h.id, { kind: 'province', landId: refuge.id }));
      const enemy = { ...structuredClone(s.armies[0]), id: 'tie-captor', kingdomId: s.kingdoms.find(k => k.id !== 'dai-viet').id, landId: refuge.id, generalHeroId: undefined };
      s.armies.push(enemy); s.siegeOrders.push({ armyId: enemy.id, landId: refuge.id, attackerKingdomId: enemy.kingdomId,
        fromLandId: land.id, progress: 0, required: 1, presentAtClaim: s.armies.map(a => a.id) });
      s.ascent.ticksToWave = 1000;
      advanceAscentTick(s);
      check('Real settlement resolves occupation before same-season hero arrival', refuge.ownerId === enemy.kingdomId && h.assignedTo !== refuge.id, { owner: refuge.ownerId, life: h.life });
    }
    for (const cancellation of ['recall', 'host-expulsion', 'charter-lost', 'recaptured-target', 'envoy-instance']) {
      const { s, h, land } = fixture(), court = s.kingdoms.find(k => k.id !== 'dai-viet' && !k.isDefeated);
      service.commitHeroAssignment(s, h, { kind: 'home' }); court.relations = 80; s.invasions = [];
      court.opinionModifiers = [{ id: 'trade-charter', value: 10, turnsLeft: 20 }]; land.outputs.supplies = 10;
      service.postResident(s, h.id, court.id); s.turn += 2; service.tickHeroLifecycle(s); s.turn++; service.tickHeroLifecycle(s);
      s.court.influence = 80;
      const prisoner = recruit(s); prisoner.life = { kind: 'captive', captorId: court.id, detentionId: 'court:held', capturedTurn: s.turn, exposureId: 'first-capture' };
      const release = cancellation === 'recaptured-target';
      const quote = service.residentActionQuote(s, h.id, release ? 'release' : 'supplies', release ? prisoner.id : land.id);
      check(`${cancellation}: resident action starts from a valid quote`, quote.ok && service.startResidentAction(s, quote).ok);
      if(cancellation === 'recall') service.recallResident(s, h.id);
      if(cancellation === 'host-expulsion') court.relations = 20;
      if(cancellation === 'charter-lost') court.opinionModifiers = [];
      if(cancellation === 'recaptured-target') prisoner.life.exposureId = 'new-capture';
      if(cancellation === 'envoy-instance') h.growth.instanceId += ':replacement';
      s.turn += 2; service.tickHeroLifecycle(s); service.tickHeroLifecycle(s);
      check(`${cancellation}: cancel refunds once and cannot grant an effect`, s.court.influence === 80 && !s.ascent.heroDepth.residentActions.length && !s.ascent.heroDepth.effects.some(e => e.kind === 'supply') && prisoner.life.kind === 'captive');
    }
    // Each transaction is tested against an actual failed storage write, then a successful retry and reload.
    for (const kind of ['departure', 'xp', 'fate', 'ransom', 'memorial']) {
      const { s, h, land, refuge } = fixture(); s.resources.gold = 10000;
      let command;
      if (kind === 'departure') { const q = service.previewHeroTransfer(s, h.id, { kind: 'province', landId: refuge.id }); command = () => service.transferHero(s, q); }
      if (kind === 'xp') command = () => service.creditHeroService(s, h, { id: 'failure-credit', window: 1, stat: 'administration', service: 6, deed: 2 });
      if (kind === 'fate') { const id = service.beginHeroEncounter(s, land.id, []); command = () => service.resolveHeroExposure(s, h, id); }
      if (kind === 'ransom') {
        service.unlinkHeroDuty(s, h); h.life = { kind: 'captive', captorId: s.kingdoms.find(k => k.id !== 'dai-viet').id, detentionId: 'court:failure', capturedTurn: s.turn, exposureId: 'failure-capture' };
        const q = service.quoteHeroRelease(s, h.id, 'gold'); command = () => service.releaseHeroFromQuote(s, q);
      }
      if (kind === 'memorial') command = () => service.memorializeHero(s, h, 'dismissed');
      saveSnapshot(s); autosaveSnapshot(s);
      // Keep the two explicitly distinct save doors; Continue deliberately reads the manual slot.
      const manualFixture = JSON.parse(localStorage.getItem(SAVE_SNAPSHOT_KEY)); manualFixture.savedAt = new Date(0).toISOString();
      localStorage.setItem(SAVE_SNAPSHOT_KEY, JSON.stringify(manualFixture));
      const oldManual = localStorage.getItem(SAVE_SNAPSHOT_KEY), oldRecovery = localStorage.getItem(AUTOSAVE_SNAPSHOT_KEY);
      command(); const after = JSON.stringify(s), setItem = Storage.prototype.setItem;
      let saved;
      try { Storage.prototype.setItem = () => { throw new Error('injected transaction write failure'); }; saved = autosaveSnapshot(s); }
      finally { Storage.prototype.setItem = setItem; }
      check(`${kind}: failed write keeps both old slots intact`, !saved && localStorage.getItem(SAVE_SNAPSHOT_KEY) === oldManual && localStorage.getItem(AUTOSAVE_SNAPSHOT_KEY) === oldRecovery);
      command(); check(`${kind}: retrying command does not duplicate committed state`, JSON.stringify(s) === after);
      check(`${kind}: successful retry restores whole transaction`, autosaveSnapshot(s) && JSON.stringify(pendingAutosave()?.state.heroes.find(hero => hero.id === h.id)) === JSON.stringify(h));
    }
    {
      const { s, h } = fixture();
      for (let w = 1; w <= 3; w++) { s.ascent.wavesSurvived = w - 1; const event = { id: `growth:${w}`, window: w, stat: 'administration', service: 6, deed: 2 };
        service.creditHeroService(s, h, event); service.creditHeroService(s, h, event); }
      const data = s.ascent.heroDepth.measurements;
      check('Measurements count authoritative credits once', data.counts.hero_service_credit === 3);
      check('Level milestones include level 3 with original recruit turn', data.milestones[h.growth.instanceId].some(row => row.level === 3 && row.recruitedTurn === 1));
      check('Perk offer denominators exist before a choice', data.offers.granary === 1 && data.offers.works === 1);
      service.chooseHeroPerk(s, h.id, 'granary'); check('Perk choice measurement records one selection', data.choices.granary === 1);
      const snapshot = service.beginHeroSeason(s); s.turn++; service.finishHeroSeason(s, snapshot); service.finishHeroSeason(s, snapshot);
      check('Deployment time has one denominator season per hero', Object.values(data.seasons).reduce((n,row) => n + row.available,0) === 1);
      check('Measurements contain IDs and transitions, no biography text', !JSON.stringify(data.events).includes(h.name));
    }
    const wilson = (success, n) => { const z = 1.96, p = success/n, divisor = 1 + z*z/n;
      const center = (p + z*z/(2*n))/divisor, margin = z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))/divisor; return [center-margin,center+margin]; };
    for (const tier of [{ name: 'open', trapped: false, lethal: false, expected: { safe: .7, wounded: .3 } },
      { name: 'trapped-protected', trapped: true, lethal: false, expected: { wounded: .35, captured: .65 } },
      { name: 'trapped-consented-capability-test-only', trapped: true, lethal: true, expected: { wounded: .35, captured: .60, dead: .05 } }]) {
      const counts = { safe: 0, wounded: 0, captured: 0, dead: 0 };
      for (let seed = 1; seed <= 10000; seed++) counts[heroFate(model.heroEventRoll(seed, 1, 'encounter:1'), tier.trapped, tier.lethal, true)]++;
      const intervals = Object.fromEntries(Object.entries(counts).map(([key,n]) => [key,wilson(n,10000)]));
      distributions.push({ tier: tier.name, n: 10000, counts, confidence95: intervals });
      for (const [key, expected] of Object.entries(tier.expected)) check(`${tier.name}: ${key} within 2 percentage points over 10,000 losses`, Math.abs(counts[key]/10000-expected) < .02, { n: counts[key], confidence95: intervals[key] });
      if (!tier.lethal) check(`${tier.name}: no death without capability and consent`, counts.dead === 0);
    }
    check('Fate boundaries retain exact 5% conditional lethal band', heroFate(.949999,true,true,true) === 'captured' && heroFate(.95,true,true,true) === 'dead' && heroFate(.99,true,false,true) === 'captured');
    check('Fresh registry still has death disabled after all tests', !model.heroCapability(make(), 'lethal'));
    return { checks, distributions };
  });
} finally { await browser.close(); }
report.checks.push({ name: 'No browser exceptions', pass: errors.length === 0, detail: errors });
fs.mkdirSync('output/hero-depth', { recursive: true }); fs.writeFileSync('output/hero-depth/verification-v2.json', JSON.stringify(report, null, 2));
for (const c of report.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${!c.pass ? ' ' + JSON.stringify(c.detail) : ''}`);
console.log(`${report.checks.filter(c => c.pass).length}/${report.checks.length} passed`);
if (report.checks.some(c => !c.pass)) process.exitCode = 1;
