/**
 * One goal, then Endless — the beta's finite reign (`src/systems/ascent/Goal.ts`).
 *
 * Contract, headless: a beta reign opens with the goal and a stable one never does; only a Great
 * Invasion from wave 12 on can win it, with the capital and three other provinces held and none of
 * them being taken; a miss moves the goal to the next Great Invasion; winning adds exactly the
 * bonus to the score and nothing to any store; ruling on keeps the bonus; ending banks once as a
 * victory; a victory cannot be claimed without a won goal; and the owed choice survives a save.
 *
 * Then natural play (does a real beta reign reach and answer the card without wedging), and the
 * rendered card and Reckoning in both languages.
 *
 * Usage: node test_scripts/verify/verify-goal.mjs [--seeds 8] [--ticks 260]
 * Env:   DEV_URL for a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { READ_OPTIONS, ENGINE_BOOT } from '../playtest/playtest-lib.mjs';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const argOf = (flag, fallback) => { const i = process.argv.indexOf(flag); return i === -1 ? fallback : Number(process.argv[i + 1]); };
const SEEDS = Array.from({ length: argOf('--seeds', 8) }, (_, i) => 11 + i * 11);
const TICKS = argOf('--ticks', 260);
const SHOTS = 'output/beta-round/shots';
mkdirSync(SHOTS, { recursive: true });

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
await page.addInitScript(() => { if (!localStorage.getItem('mandate:language:v1')) localStorage.setItem('mandate:language:v1', 'en'); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

// ── Contract ────────────────────────────────────────────────────────────────
const contract = await page.evaluate(async () => {
  const Goal = await import('/src/systems/ascent/Goal.ts');
  const { resolveAscentPrompt, endAscentRun } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts, enqueueAscentPrompt } = await import('/src/systems/ascent/AscentState.ts');
  const { computeRunScore, getLegacy } = await import('/src/state/legacy.ts');
  const { getDynasty } = await import('/src/state/dynasty.ts');
  const { saveSnapshot, loadSnapshot } = await import('/src/state/save.ts');
  const PLAYER = 'dai-viet';
  const { rulesetById } = await import('/src/game/ascentRuleset.ts');
  const NEED = rulesetById('beta').goal.provincesBesidesCapital;
  const metaKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('mandate:') && !k.includes('snapshot') && !k.includes('autosave') && k !== 'mandate:language:v1')
    .sort().map((k) => `${k}=${localStorage.getItem(k)}`).join('|');

  const boot = async (ruleset, seed = 77) => {
    window.__ptFreshProfile();
    const state = await window.__ptBoot(seed, { ruleset });
    window.__ptRestoreRandom();
    state.pendingAscentPrompt = undefined;
    state.ascent.promptQueue = [];
    return state;
  };
  /** Gives the realm `others` provinces besides the capital (neutral ground, nearest first). */
  const holdProvinces = (state, others) => {
    const capital = state.ascent.capitalLandId;
    for (const land of state.lands) if (land.ownerId === PLAYER && land.id !== capital) land.ownerId = 'neutral';
    let given = 0;
    for (const land of state.lands) {
      if (given >= others) break;
      if (land.id !== capital && land.ownerId !== PLAYER) { land.ownerId = PLAYER; given += 1; }
    }
    state.lands.find((l) => l.id === capital).ownerId = PLAYER;
  };
  const out = {};

  const stable = await boot('stable');
  out.stableGoal = stable.ascent.goal;
  const beta = await boot('beta');
  out.betaGoal = JSON.stringify(beta.ascent.goal);

  holdProvinces(beta, NEED);
  out.wave8 = Goal.evaluateGoal(beta, { wave: 8, boss: true });
  out.wave13NonBoss = Goal.evaluateGoal(beta, { wave: 13, boss: false });

  // A miss at 12 moves the goal to 16.
  const miss = await boot('beta');
  holdProvinces(miss, NEED - 1);
  out.missWon = Goal.evaluateGoal(miss, { wave: 12, boss: true });
  out.missTarget = miss.ascent.goal.targetWave;
  // ...and the 4th wins it with the capital alone (the tall road to the same goal).
  out.need = NEED;
  out.aloneAt12 = Goal.goalNeed(rulesetById('beta').goal, 12);
  out.winAt16 = Goal.evaluateGoal(miss, { wave: 16, boss: true }) && miss.ascent.goal.wonAtWave === 16
    && miss.ascent.goal.landsAtWin === NEED - 1;

  // A capital being taken blocks the win.
  const falling = await boot('beta');
  holdProvinces(falling, NEED + 1);
  falling.siegeOrders.push({ landId: falling.ascent.capitalLandId, armyId: 'x', attackerKingdomId: 'someone', fromLandId: falling.ascent.capitalLandId, progress: 0, required: 4 });
  out.fallingWon = Goal.evaluateGoal(falling, { wave: 12, boss: true });

  // The win: score moves by exactly the bonus, and no store is written.
  const win = await boot('beta');
  holdProvinces(win, NEED);
  const scoreBefore = computeRunScore(win);
  const metaBefore = metaKeys();
  out.won = Goal.evaluateGoal(win, { wave: 12, boss: true });
  out.wonGoal = JSON.stringify(win.ascent.goal);
  out.scoreDelta = computeRunScore(win) - scoreBefore;
  out.noStoreOnWin = metaKeys() === metaBefore;

  // The card: raised, and ahead of a queued draft.
  enqueueAscentPrompt(win, { kind: 'power-draft', level: 2, cards: ['a', 'b', 'c'], rerollCost: 40 });
  Goal.raiseGoalChoice(win);
  Goal.raiseGoalChoice(win);
  drainAscentPrompts(win);
  out.cardUp = win.pendingAscentPrompt?.kind;
  out.goalCards = win.ascent.promptQueue.filter((p) => p.kind === 'goal-won').length + (win.pendingAscentPrompt?.kind === 'goal-won' ? 1 : 0);

  // A pending choice survives save → load as the paused open card.
  saveSnapshot(win);
  const loaded = loadSnapshot()?.state;
  out.reloadCard = loaded?.pendingAscentPrompt?.kind;
  out.reloadPaused = loaded?.isPaused;

  // Rule on: closes, writes nothing, keeps the bonus; a second answer is a no-op.
  const metaBeforeRuleOn = metaKeys();
  out.ruleOnResolved = resolveAscentPrompt(win, 'rule-on');
  out.ruleOnGoal = JSON.stringify(win.ascent.goal);
  out.ruleOnNoStore = metaKeys() === metaBeforeRuleOn;
  out.ruleOnDefeated = win.isDefeated;
  Goal.raiseGoalChoice(win);
  out.noCardAfterRuleOn = win.pendingAscentPrompt?.kind !== 'goal-won' && !win.ascent.promptQueue.some((p) => p.kind === 'goal-won');
  saveSnapshot(win);
  out.reloadAfterRuleOn = loadSnapshot()?.state.pendingAscentPrompt?.kind ?? null;

  // Ruled on, then fell: the bonus is paid once, the record says it kept the goal.
  const legacyBeforeFall = getLegacy().points;
  const fallScore = computeRunScore(win);
  endAscentRun(win);
  endAscentRun(win);
  const fallRecord = getDynasty().history.at(-1);
  out.fallPaidOnce = getLegacy().points - legacyBeforeFall === Math.round(fallScore / 10);
  out.fallRecord = JSON.stringify({ ending: fallRecord?.ending, goalWave: fallRecord?.goalWave, score: fallRecord?.score, fallScore });
  out.fallPrompt = JSON.stringify({ kind: win.pendingAscentPrompt?.kind, outcome: win.pendingAscentPrompt?.outcome, goalWave: win.pendingAscentPrompt?.goalWave });

  // A blind 'ok' rules on, never ends.
  const blind = await boot('beta');
  holdProvinces(blind, NEED);
  Goal.evaluateGoal(blind, { wave: 12, boss: true });
  Goal.raiseGoalChoice(blind);
  drainAscentPrompts(blind);
  resolveAscentPrompt(blind, 'ok');
  out.blind = JSON.stringify({ choice: blind.ascent.goal.choice, defeated: blind.isDefeated });

  // Victory cannot be claimed without a won goal.
  const early = await boot('beta');
  endAscentRun(early, 'victory');
  out.earlyVictory = early.isDefeated;

  // End in victory: banks once, as a victory, without an ascension.
  const end = await boot('beta');
  holdProvinces(end, NEED);
  Goal.evaluateGoal(end, { wave: 12, boss: true });
  Goal.raiseGoalChoice(end);
  drainAscentPrompts(end);
  const legacyBefore = getLegacy();
  const endScore = computeRunScore(end);
  out.endResolved = resolveAscentPrompt(end, 'end');
  // Re-entrancy: the banking path again, both ways, must pay nothing more.
  endAscentRun(end, 'victory');
  endAscentRun(end);
  const legacyAfter = getLegacy();
  const endRecord = getDynasty().history.at(-1);
  out.end = JSON.stringify({
    defeated: end.isDefeated, cause: end.ascent.endCause, kind: end.pendingAscentPrompt?.kind,
    outcome: end.pendingAscentPrompt?.outcome, promptScore: end.pendingAscentPrompt?.score, endScore,
    legacyGain: legacyAfter.points - legacyBefore.points, expected: Math.round(endScore / 10),
    ascensions: legacyAfter.ascensions - legacyBefore.ascensions, ending: endRecord?.ending, goalWave: endRecord?.goalWave,
  });

  // The Skirmish never evaluates a goal.
  const arena = await boot('beta');
  arena.ascent.arena = true;
  holdProvinces(arena, NEED);
  out.arenaWon = Goal.evaluateGoal(arena, { wave: 12, boss: true });
  localStorage.removeItem('mandate:snapshot:v1');
  return out;
});

check('a stable reign has no goal', contract.stableGoal === undefined);
check('a beta reign opens with the goal, aimed at wave 12', contract.betaGoal === '{"status":"open","targetWave":12}', contract.betaGoal);
check('wave 8 (a Great Invasion before the third) never wins', contract.wave8 === false);
check('a non-boss wave never wins', contract.wave13NonBoss === false);
check('one province short misses, and the goal moves to wave 16', contract.missWon === false && contract.missTarget === 16, `target ${contract.missTarget}`);
check('the 3rd Great Invasion needs a province besides the capital', contract.aloneAt12 === contract.need && contract.need > 0, `need ${contract.aloneAt12}`);
check('the 4th Great Invasion then wins it with the capital alone', contract.winAt16 === true);
check('a capital being taken blocks the win', contract.fallingWon === false);
check('wave 12 with the capital and enough other provinces wins, pending a choice', contract.won === true, contract.wonGoal);
check('winning adds exactly the bonus to the score', contract.scoreDelta === 600, `delta ${contract.scoreDelta}`);
check('winning writes nothing to the meta stores', contract.noStoreOnWin);
check('the victory card rises once, ahead of a queued draft', contract.cardUp === 'goal-won' && contract.goalCards === 1, `${contract.cardUp} ×${contract.goalCards}`);
check('an owed choice survives save → load as the open card, paused', contract.reloadCard === 'goal-won' && contract.reloadPaused === true);
check('rule on closes the card, keeps the bonus and writes no store',
  contract.ruleOnResolved && contract.ruleOnNoStore && !contract.ruleOnDefeated && /"choice":"rule-on"/.test(contract.ruleOnGoal) && /"bonusScore":600/.test(contract.ruleOnGoal), contract.ruleOnGoal);
check('after ruling on, no card comes back — live or from a save', contract.noCardAfterRuleOn && contract.reloadAfterRuleOn === null);
check('ruled on then fallen: paid once, recorded as a kept goal', contract.fallPaidOnce && /"ending":"conquest","goalWave":12/.test(contract.fallRecord) && /"goalWave":12/.test(contract.fallPrompt) && !/"outcome"/.test(contract.fallPrompt),
  `${contract.fallRecord} ${contract.fallPrompt}`);
check('a blind "ok" rules on and never ends the reign', contract.blind === '{"choice":"rule-on","defeated":false}', contract.blind);
check('a victory cannot be claimed without a won goal', contract.earlyVictory === false);
const end = JSON.parse(contract.end);
check('end in victory banks once as a victory, without an ascension',
  end.defeated && end.cause === 'goal' && end.kind === 'run-over' && end.outcome === 'victory' && end.promptScore === end.endScore
  && end.legacyGain === end.expected && end.ascensions === 0 && end.ending === 'victory' && end.goalWave === 12, contract.end);
check('the Skirmish never evaluates a goal', contract.arenaWon === false);

// ── Natural play ────────────────────────────────────────────────────────────
const natural = await page.evaluate(async ({ seeds, ticks }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const rows = [];
  for (const seed of seeds) {
    window.__ptFreshProfile();
    const state = await window.__ptBoot(seed, { ruleset: 'beta' });
    let cardSeen = 0;
    let wedged = false;
    for (let tick = 0; tick < ticks && !state.isDefeated; tick += 1) {
      advanceAscentTick(state);
      drainAscentPrompts(state);
      let guard = 0;
      while (state.pendingAscentPrompt && guard++ < 40) {
        const kind = state.pendingAscentPrompt.kind;
        if (kind === 'run-over') break;
        if (kind === 'goal-won') cardSeen += 1;
        const options = window.__ptOptions(state);
        if (!options?.length) break;
        if (!resolveAscentPrompt(state, options[0])) break;
        drainAscentPrompts(state);
      }
      if (state.pendingAscentPrompt?.kind === 'goal-won') wedged = true;
      state.isPaused = false;
    }
    window.__ptRestoreRandom();
    rows.push({ seed, waves: state.ascent.wavesSurvived, goal: state.ascent.goal?.status, at: state.ascent.goal?.wonAtWave ?? null, target: state.ascent.goal?.targetWave ?? null, cardSeen, wedged });
  }
  return rows;
}, { seeds: SEEDS, ticks: TICKS });
console.log('\n  natural beta reigns (first-option driver):');
for (const row of natural) console.log(`    seed ${row.seed}: waves ${row.waves}, goal ${row.goal}${row.at ? ` at ${row.at}` : ` (target ${row.target})`}, card ×${row.cardSeen}`);
const winners = natural.filter((r) => r.goal === 'won');
check('in real play the card rises once per win and never wedges a reign',
  natural.every((r) => !r.wedged && (r.goal === 'won' ? r.cardSeen === 1 : r.cardSeen === 0)), JSON.stringify(natural.map((r) => [r.seed, r.cardSeen, r.wedged])));
check('real beta reigns do reach the goal (at least one seed)', winners.length > 0, `${winners.length}/${natural.length} won`);

// ── Rendered: the card, the Reckoning, the HUD ──────────────────────────────
for (const [language, height] of [['en', 844], ['vi', 620]]) {
  await page.setViewportSize({ width: 390, height });
  await page.evaluate((lang) => { localStorage.clear(); localStorage.setItem('mandate:language:v1', lang); }, language);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate(() => window.__startBenchGame(77, 'ascent', 'beta'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  // Clear the opening cards, then read the band.
  for (let i = 0; i < 12; i += 1) {
    const open = await page.evaluate(() => window.__mandateState?.pendingAscentPrompt?.kind);
    if (!open) break;
    await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      const opts = window.render_game_to_text ? JSON.parse(window.render_game_to_text()).ascent?.prompt?.options : undefined;
      scene.events.emit('ui:ascent-choice', (opts && opts[0]) || 'ok');
    });
    await page.waitForTimeout(350);
  }
  const hudWave = await page.evaluate(async () => {
    const { t } = await import('/src/i18n/index.ts');
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const texts = [];
    const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') texts.push(c.text); if (c.list) walk(c.list); } };
    walk(scene.children.list);
    const want = t('beta.hud.waveGoal', { wave: window.__mandateState.ascent.wave, goal: 12 });
    return { found: texts.includes(want), want };
  });
  check(`the band reads the wave against the goal (${language})`, hudWave.found, hudWave.want);

  // Win the goal on the live state and let the scene raise the card.
  await page.evaluate(async () => {
    const Goal = await import('/src/systems/ascent/Goal.ts');
    const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
    const state = window.__mandateState;
    const capital = state.ascent.capitalLandId;
    let given = 0;
    for (const land of state.lands) { if (given >= 2) break; if (land.id !== capital && land.ownerId !== 'dai-viet') { land.ownerId = 'dai-viet'; given += 1; } }
    state.ascent.pendingAftermath = undefined;
    Goal.evaluateGoal(state, { wave: 12, boss: true });
    Goal.raiseGoalChoice(state);
    drainAscentPrompts(state);
    window.__phaserGame.scene.getScene('ConquestScene').events.emit('state-changed');
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
  });
  const cardUp = await page.waitForFunction(() => String(window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey).startsWith('goal-won'), null, { timeout: 8000 })
    .then(() => true).catch(() => false);
  check(`the victory card opens on screen (${language})`, cardUp);
  await page.waitForTimeout(700);
  const card = await page.evaluate(async () => {
    const { t } = await import('/src/i18n/index.ts');
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const texts = [];
    const buttons = [];
    const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') texts.push(c); if (c.getData?.('goalChoice')) buttons.push(c); if (c.list) walk(c.list); } };
    walk(scene.children.list);
    const { GAME_HEIGHT } = await import('/src/game/constants.ts');
    const bottoms = buttons.map((b) => b.getBounds().bottom);
    return {
      title: texts.some((c) => c.text === t('beta.goal.title')),
      end: texts.some((c) => c.text === t('beta.goal.end')),
      ruleOn: texts.some((c) => c.text === t('beta.goal.ruleOn')),
      fits: bottoms.length === 2 && Math.max(...bottoms) <= GAME_HEIGHT,
      bottoms, height: GAME_HEIGHT,
    };
  });
  check(`the card names the victory and both choices, inside the screen (${language})`, card.title && card.end && card.ruleOn && card.fits, JSON.stringify(card));
  await page.screenshot({ path: `${SHOTS}/goal-card-${language}-${height}.png` });

  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:ascent-choice', 'end'));
  const reckoning = await page.waitForFunction(() => String(window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey).startsWith('run-over'), null, { timeout: 8000 })
    .then(() => true).catch(() => false);
  await page.waitForTimeout(900);
  const titled = await page.evaluate(async () => {
    const { t } = await import('/src/i18n/index.ts');
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const texts = [];
    const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') texts.push(c.text); if (c.list) walk(c.list); } };
    walk(scene.children.list);
    return texts.some((x) => x === t('beta.goal.reckoningTitle'));
  });
  check(`ending in victory opens the victory Reckoning (${language})`, reckoning && titled);
  await page.screenshot({ path: `${SHOTS}/goal-reckoning-${language}-${height}.png` });
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: a beta reign can be won, banked, or ruled on' : 'FAIL: the goal is broken');
process.exit(failed === 0 ? 0 : 1);
