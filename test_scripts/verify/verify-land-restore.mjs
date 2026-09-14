/**
 * The people hold the walls, and a held defence costs the ground.
 *
 * Gate for the round that answered three reports — *the land immediately restore full powers
 * after fight*, *if your kingdom have no people why it defend still high?*, and the walls-only
 * capital that held forty waves for free. Headless engine throughout.
 *
 *   1. manning: a district's walls are worth less with fewer people behind them
 *   2. the watch is bounded by the people
 *   3. a hidden-roll defence that holds still charges the province (ledger: us X -> Y, Y < X)
 *   4. the charge writes exhaustion, a breach, dead people and burnt levels — and raises the card
 *   5. haste pays the bill and makes the district whole; endure does not
 *   6. the recovery clocks step on seasons, not ticks
 *
 * Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-land-restore.mjs
 */
import { chromium } from 'playwright';
import { ENGINE_BOOT, READ_OPTIONS } from '../playtest/playtest-lib.mjs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

console.log('=== FORMULA ===');
const formula = await page.evaluate(async () => {
  const { garrisonPower, wallManning } = await import('/src/systems/WarSystem.ts');
  const { militiaCapacity, growProvincialMilitia, recoverGarrison, repairProvincialDefence } = await import('/src/systems/ResourceSystem.ts');
  const { PEOPLE_PER_WALL_POINT, WALL_MANNING_FLOOR, WALL_MANNING_FREE_DEFENSE, MILITIA_POPULATION_SHARE, GARRISON_RECOVER_SEASONS } = await import('/src/game/ascentConfig.ts');
  const state = await window.__ptBoot(4242, { ruleset: 'v1' });
  const cap = state.lands.find((l) => l.id === state.ascent.capitalLandId);
  // A fortress: walls well above the palisade band, which is where people are needed.
  const fortress = { ...cap, defense: WALL_MANNING_FREE_DEFENSE + 200 };
  const need = 200 * PEOPLE_PER_WALL_POINT;
  const full = { ...fortress, population: need * 2 };
  const thin = { ...fortress, population: Math.round(need * 0.4) };
  const empty = { ...fortress, population: 0 };
  // A palisade needs nobody: a fresh claim with modest walls is whole whatever its people.
  const claim = { ...cap, defense: WALL_MANNING_FREE_DEFENSE - 5, population: 20 };
  const manning = { full: wallManning(state, full), thin: wallManning(state, thin), empty: wallManning(state, empty), floor: WALL_MANNING_FLOOR, claim: wallManning(state, claim) };
  const power = { full: garrisonPower(state, full), thin: garrisonPower(state, thin) };

  // the watch is bounded by the people
  const crowded = { ...cap, population: 400, defense: 300, buildings: cap.buildings.map((b) => ({ ...b, level: 5 })) };
  const capacity = militiaCapacity(state, crowded);
  // and over-cap militia sheds as a share of the excess, not two men
  const over = state.lands.find((l) => l.id === cap.id);
  over.localSoldiers = Math.floor(over.population * MILITIA_POPULATION_SHARE) + 1000;
  const before = over.localSoldiers;
  growProvincialMilitia(state);
  const shed = before - over.localSoldiers;

  // clocks: exhaustion steps on even turns only
  over.garrisonExhaustion = 0.5;
  state.turn = 101; recoverGarrison(state); const afterOdd = over.garrisonExhaustion;
  state.turn = 102; recoverGarrison(state); const afterEven = over.garrisonExhaustion;
  over.wallsBreached = 12; const def0 = over.defense;
  state.turn = 103; repairProvincialDefence(state); const defOdd = over.defense;
  state.turn = 104; repairProvincialDefence(state); const defEven = over.defense;
  // and a paid restore quadruples the pace
  over.garrisonExhaustion = 0.5; over.restoreHasteUntil = 200;
  state.turn = 105; recoverGarrison(state); const hasted = over.garrisonExhaustion;
  window.__ptRestoreRandom();
  return { manning, power, capacity, popBound: Math.floor(crowded.population * MILITIA_POPULATION_SHARE), shed, afterOdd, afterEven, def0, defOdd, defEven, hasted, step: 1 / GARRISON_RECOVER_SEASONS };
});
check('walls fully manned with people to spare', formula.manning.full === 1, JSON.stringify(formula.manning));
check('walls under-manned with few people', formula.manning.thin < 0.5 && formula.manning.thin > formula.manning.floor, `thin ${formula.manning.thin}`);
check('an empty district keeps only the floor', formula.manning.empty === formula.manning.floor, `empty ${formula.manning.empty}`);
check('a palisade needs nobody — a fresh claim is whole', formula.manning.claim === 1, `claim ${formula.manning.claim}`);
check('and garrison power follows manning', formula.power.thin < formula.power.full * 0.75, `full ${Math.round(formula.power.full)} thin ${Math.round(formula.power.thin)}`);
check('the watch is bounded by the people', formula.capacity === formula.popBound, `cap ${formula.capacity} people-bound ${formula.popBound}`);
check('over-cap militia sheds a share, not two men', formula.shed > 2, `shed ${formula.shed}`);
check('exhaustion holds on an odd turn', formula.afterOdd === 0.5, `${formula.afterOdd}`);
check('and steps on the even turn', Math.abs(formula.afterEven - (0.5 - formula.step)) < 1e-9, `${formula.afterEven}`);
check('the breach repairs on seasons too', formula.defOdd === formula.def0 && formula.defEven > formula.def0, `${formula.def0} -> ${formula.defOdd} -> ${formula.defEven}`);
check('a paid restore recovers faster', formula.hasted < 0.5 - formula.step, `hasted ${formula.hasted}`);

console.log('=== CHARGE ===');
const charge = await page.evaluate(async () => {
  const { chargeProvinceForDefence, buildRestoreOptions, resolveRestore } = await import('/src/systems/ascent/RestoreSystem.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const state = await window.__ptBoot(4243, { ruleset: 'v1' });
  const cap = state.lands.find((l) => l.id === state.ascent.capitalLandId);
  cap.buildings = [{ type: 'farm', level: 3 }, { type: 'farm', level: 3 }, { type: 'market', level: 2 }, { type: 'wall', level: 2 }, { type: 'mine', level: 3 }, { type: 'farm', level: 2 }];
  cap.defense = 120; cap.population = 3000; cap.localSoldiers = 900;
  state.ascent.promptQueue = []; state.pendingAscentPrompt = undefined;
  const before = { pop: cap.population, def: cap.defense, levels: cap.buildings.reduce((s, b) => s + b.level, 0), militia: cap.localSoldiers };
  const dead = 300; cap.localSoldiers -= dead;
  const result = chargeProvinceForDefence(state, cap, 0.4, dead);
  const after = { pop: cap.population, def: cap.defense, levels: cap.buildings.reduce((s, b) => s + b.level, 0), ex: cap.garrisonExhaustion, breach: cap.wallsBreached, ruins: cap.ruins?.length ?? 0, wallsIntact: cap.buildings.filter((b) => b.type === 'wall').every((b) => b.level === 2) };
  state.ascent.lastPromptTurn = undefined; // the card waits out the pacing gap after the last card; there was none
  drainAscentPrompts(state);
  const prompt = state.pendingAscentPrompt;
  const options = prompt?.kind === 'restore-land' ? prompt.options : [];
  // a second charge in the same wave merges rather than stacking a second card
  state.ascent.promptQueue = []; state.pendingAscentPrompt = undefined; cap.restoreAskedWave = undefined;
  chargeProvinceForDefence(state, cap, 0.3, 100);
  chargeProvinceForDefence(state, cap, 0.3, 100);
  const queued = state.ascent.promptQueue.filter((p) => p.kind === 'restore-land').length;
  state.ascent.lastPromptTurn = undefined; // the card waits out the pacing gap after the last card; there was none
  drainAscentPrompts(state);
  const merged = state.pendingAscentPrompt;

  // haste: pay, whole
  state.resources.gold = 5000; state.resources.food = 5000; state.resources.supplies = 5000;
  const bill = buildRestoreOptions(state, cap);
  const goldBefore = state.resources.gold;
  const ok = resolveRestore(state, merged, 'haste');
  const whole = { def: cap.defense, breach: cap.wallsBreached ?? 0, ruins: cap.ruins?.length ?? 0, levels: cap.buildings.reduce((s, b) => s + b.level, 0), ex: cap.garrisonExhaustion ?? 0, goldSpent: goldBefore - state.resources.gold };

  // endure: free, nothing moves
  cap.wallsBreached = 9; cap.defense -= 9; cap.ruins = ['farm']; cap.buildings[0].level -= 1; cap.garrisonExhaustion = 0.3;
  const p2 = { kind: 'restore-land', landId: cap.id, landName: cap.name, breach: 9, ruins: 1, dead: 0, spent: 0.3, options: buildRestoreOptions(state, cap) };
  const g2 = state.resources.gold;
  const ok2 = resolveRestore(state, p2, 'endure');
  const endured = { breach: cap.wallsBreached ?? 0, ruins: cap.ruins?.length ?? 0, ex: cap.garrisonExhaustion ?? 0, goldSpent: g2 - state.resources.gold };
  // a priced option the purse cannot meet leaves the card standing
  state.resources.gold = 0; state.resources.food = 0; state.resources.supplies = 0;
  const p3 = { ...p2, options: buildRestoreOptions(state, cap).map((o) => ({ ...o, affordable: true })) };
  const refused = resolveRestore(state, p3, 'haste');
  window.__ptRestoreRandom();
  return { result, before, after, kind: prompt?.kind, options, queued, mergedBreach: merged?.breach, bill, ok, whole, ok2, endured, refused };
});
check('the charge writes people, exhaustion, breach and ruins', charge.after.pop < charge.before.pop && charge.after.ex > 0.39 && charge.after.breach > 0 && charge.after.ruins > 0, JSON.stringify(charge.after));
check('walls and towers are not burnt as buildings', charge.after.wallsIntact, '');
check('building levels came down by the ruins count', charge.before.levels - charge.after.levels === charge.after.ruins, `${charge.before.levels} -> ${charge.after.levels}, ruins ${charge.after.ruins}`);
check('and the restore card is raised', charge.kind === 'restore-land', charge.kind);
check('with haste, steady and endure', charge.options.map((o) => o.id).join(',') === 'haste,steady,endure', charge.options.map((o) => o.id).join(','));
check('haste is priced, endure is free', charge.options[0]?.cost?.gold > 0 && !charge.options[2]?.cost, JSON.stringify(charge.options[0]?.cost));
check('two charges in a wave are one card', charge.queued === 1 && charge.mergedBreach > 0, `queued ${charge.queued} breach ${charge.mergedBreach}`);
check('haste pays the bill', charge.ok && charge.whole.goldSpent === charge.bill[0].cost.gold, `spent ${charge.whole.goldSpent} bill ${charge.bill[0].cost.gold}`);
// Money re-arms men; it does not un-wound them — a quarter of the exhaustion stays (RESTORE_HASTE_EXHAUSTION_LEFT).
check('and the district is whole', charge.whole.breach === 0 && charge.whole.ruins === 0 && charge.whole.ex <= 0.25 + 1e-9, JSON.stringify(charge.whole));
check('endure spends nothing and fixes nothing', charge.ok2 && charge.endured.goldSpent === 0 && charge.endured.breach === 9 && charge.endured.ruins === 1, JSON.stringify(charge.endured));
check('an unaffordable haste leaves the card standing', charge.refused === false, `${charge.refused}`);

console.log('=== THE LEDGER (seeded run) ===');
const run = await page.evaluate(async () => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const out = [];
  for (const seed of [11, 22, 33, 44]) {
    const state = await window.__ptBoot(seed, { ruleset: 'v1' });
    let over = false; let restoreCards = 0; let restoreAnswered = 0;
    for (let tick = 0; tick < 420; tick += 1) {
      if (state.isDefeated || over) break;
      advanceAscentTick(state); drainAscentPrompts(state);
      let guard = 0;
      while (state.pendingAscentPrompt && guard++ < 40) {
        const p = state.pendingAscentPrompt;
        if (p.kind === 'run-over') { over = true; break; }
        if (p.kind === 'restore-land') restoreCards += 1;
        const opts = window.__ptOptions(state);
        if (!opts || !opts.length) break;
        const handled = resolveAscentPrompt(state, opts[0]);
        if (!handled) break;
        if (p.kind === 'restore-land') restoreAnswered += 1;
        state.ascent.lastPromptTurn = undefined; // the card waits out the pacing gap after the last card; there was none
  drainAscentPrompts(state);
      }
      state.isPaused = false;
    }
    const hist = state.ascent.battleHistory ?? [];
    const heldHidden = hist.filter((r) => r.role === 'defence' && r.rounds === 0 && (r.outcome === 'they-rout' || r.outcome === 'spent') && r.ourStart > 0);
    const charged = heldHidden.filter((r) => r.ourEnd < r.ourStart);
    const overPeople = state.lands.filter((l) => l.ownerId === 'dai-viet' && l.localSoldiers > l.population * 0.5 + 5).length;
    out.push({ seed, waves: state.ascent.wavesSurvived, heldHidden: heldHidden.length, charged: charged.length, restoreCards, restoreAnswered, overPeople, pending: state.pendingAscentPrompt?.kind ?? null });
    window.__ptRestoreRandom();
  }
  return out;
});
for (const r of run) console.log('   ', JSON.stringify(r));
const held = run.reduce((s, r) => s + r.heldHidden, 0);
const charged = run.reduce((s, r) => s + r.charged, 0);
check('hidden-roll defences that held cost the province', held > 0 && charged / held >= 0.8, `${charged}/${held} charged`);
check('the restore card is raised and answered in play', run.some((r) => r.restoreCards > 0) && run.every((r) => r.restoreAnswered === r.restoreCards), run.map((r) => `${r.restoreAnswered}/${r.restoreCards}`).join(' '));
check('no province keeps a watch larger than half its people', run.every((r) => r.overPeople === 0), run.map((r) => r.overPeople).join(' '));
check('no run ends wedged on a card', run.every((r) => r.pending === null || r.pending === 'run-over'), run.map((r) => r.pending).join(' '));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the people hold the walls and a held defence costs the ground' : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
