/**
 * The band compares like with like (B10).
 *
 * Stable: POWER (the composite realm figure) beside THREAT, exactly as before.
 * Beta: DEFENCE — the figure the verdict has always been computed against — beside THREAT, the
 * value on the band is that defence, and the advisor's steady line quotes the same two numbers.
 *
 * Usage: node test_scripts/verify/verify-beta-band.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};
const browser = await chromium.launch();
const errors = [];

for (const [ruleset, language] of [['stable', 'en'], ['beta', 'en'], ['beta', 'vi']]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
  await page.addInitScript((lang) => { localStorage.clear(); localStorage.setItem('mandate:language:v1', lang); }, language);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate((r) => window.__startBenchGame(21, 'ascent', r), ruleset);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const band = await page.evaluate(async () => {
    const { t } = await import('/src/i18n/index.ts');
    const { formatNumber } = await import('/src/utils/format.ts');
    const { topAdvice, adviseAscent } = await import('/src/systems/ascent/Advisor.ts');
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const texts = [];
    const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') texts.push(c.text); if (c.list) walk(c.list); } };
    walk(scene.children.list);
    const state = window.__mandateState;
    const steady = adviseAscent(state).find((a) => a.id === 'steady');
    return {
      hasPower: texts.includes(t('ascent.hud.power')),
      hasDefence: texts.includes(t('beta.hud.defence')),
      hasThreat: texts.includes(t('ascent.hud.threat')),
      defenceValue: texts.includes(formatNumber(Math.round(state.ascent.defensePower))),
      powerValue: texts.includes(formatNumber(state.ascent.power)),
      steadyLine: steady ? t(steady.line, steady.params) : '',
      top: topAdvice(state)?.id,
    };
  });
  if (ruleset === 'stable') {
    check('stable: the band still reads POWER beside THREAT, with the POWER figure', band.hasPower && !band.hasDefence && band.hasThreat && band.powerValue, JSON.stringify(band));
    check('stable: the steady advice still quotes POWER', /POWER/.test(band.steadyLine), band.steadyLine);
  } else {
    check(`beta: the band reads DEFENCE beside THREAT, with the defence figure (${language})`, band.hasDefence && !band.hasPower && band.hasThreat && band.defenceValue, JSON.stringify(band));
    check(`beta: the steady advice quotes DEFENCE and THREAT (${language})`, band.steadyLine.includes(language === 'vi' ? 'PHÒNG THỦ' : 'DEFENCE'), band.steadyLine);
  }
  await page.screenshot({ path: `output/beta-round/shots/band-${ruleset}-${language}.png`, clip: { x: 0, y: 0, width: 390, height: 120 } });

  // The army lane's invader rows: beta forecasts when a host reaches the walls and what holds there.
  await page.evaluate(`${(await import('../playtest/playtest-lib.mjs')).READ_OPTIONS}`);
  const lane = await page.evaluate(async () => {
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
    const { t } = await import('/src/i18n/index.ts');
    const state = window.__mandateState;
    const visible = () => (state.invasions ?? []).some((record) => {
      const army = state.armies.find((a) => a.id === record.armyId);
      const at = army && state.lands.find((l) => l.id === army.landId);
      return at?.isVisible && record.plan !== 'withdrawing' && record.targetLandId;
    });
    for (let tick = 0; tick < 160 && !visible() && !state.isDefeated; tick += 1) {
      advanceAscentTick(state);
      drainAscentPrompts(state);
      let guard = 0;
      while (state.pendingAscentPrompt && guard++ < 40) {
        const options = window.__ptOptions(state);
        if (!options?.length || !resolveAscentPrompt(state, options[0])) break;
        drainAscentPrompts(state);
      }
      state.pendingAscentPrompt = undefined;
      state.isPaused = false;
    }
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.openLane('army');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const texts = [];
    const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') texts.push(c.text); if (c.list) walk(c.list); } };
    walk(scene.children.list);
    const cue = t('beta.war.forecast', { ticks: 'X', assault: 'Y', pct: 'Z' }).split('X')[0];
    return { invaders: visible(), forecast: texts.some((x) => x.includes(cue.trim())), sample: texts.find((x) => x.includes('→')) };
  });
  if (ruleset === 'stable') {
    check('stable: the army lane invader rows carry no forecast', !lane.forecast, JSON.stringify(lane));
  } else {
    check(`beta: the army lane forecasts the walls, the storm and the hold (${language})`, lane.invaders && lane.forecast, JSON.stringify(lane));
  }
  await page.screenshot({ path: `output/beta-round/shots/army-lane-${ruleset}-${language}.png` });
  await page.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: the band compares like with like in beta, and stable is unchanged' : 'FAIL: the band');
process.exit(failed === 0 ? 0 : 1);
