/**
 * The beta ruleset's doors and locks.
 *
 * Dragon Ascent runs are stamped with a ruleset when they start (`CampaignConfig.ruleset`, via
 * `newAscentRun`) and keep it for life. This gate proves the promises that make that safe:
 *
 *   - the Settings opt-in decides only *new* reigns, and defaults off;
 *   - a stable run carries no field at all (so its saves are unchanged);
 *   - the Skirmish is always stable, whatever Settings says;
 *   - saves keep a beta reign beta, and an unknown ruleset resumes as stable;
 *   - "go again" keeps the reign's own ruleset, not the current setting;
 *   - the menu shows the BETA mark only while the beta is on, and tags a beta save's Continue;
 *   - the Settings row exists in both languages and actually flips the preference.
 *
 * Usage: node test_scripts/verify/verify-ruleset.mjs
 * Env:   DEV_URL for a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const BETA_KEY = 'mandate:beta:ascent:v1';

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
await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));

const openMenu = async () => {
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(900);
};

// ── Headless: the factory, the registry and the save path ───────────────────
await openMenu();
const headless = await page.evaluate(async (betaKey) => {
  const { newAscentRun } = await import('/src/state/ascentRun.ts');
  const { rulesOf, rulesetIdOf } = await import('/src/game/ascentRuleset.ts');
  const { saveSnapshot, loadSnapshot, SAVE_SNAPSHOT_KEY } = await import('/src/state/save.ts');
  const language = localStorage.getItem('mandate:language:v1');
  localStorage.clear();
  localStorage.setItem('mandate:language:v1', language ?? 'en');

  const out = {};
  const off = newAscentRun();
  out.offField = 'ruleset' in off.campaignConfig;
  out.offId = rulesetIdOf(off);
  localStorage.setItem(betaKey, 'on');
  const on = newAscentRun();
  out.onId = rulesetIdOf(on);
  out.onRules = rulesOf(on).id;
  out.skirmishId = rulesetIdOf(newAscentRun({ ruleset: 'stable' }));
  out.skirmishField = 'ruleset' in newAscentRun({ ruleset: 'stable' }).campaignConfig;

  // A beta reign saved and read back.
  saveSnapshot(on);
  out.savedId = loadSnapshot()?.state.campaignConfig?.ruleset;

  // A save from a build that knew a ruleset this one does not — and one that spelled stable out.
  const raw = JSON.parse(localStorage.getItem(SAVE_SNAPSHOT_KEY));
  raw.state.campaignConfig.ruleset = 'gamma';
  localStorage.setItem(SAVE_SNAPSHOT_KEY, JSON.stringify(raw));
  const unknown = loadSnapshot()?.state;
  out.unknownField = unknown ? 'ruleset' in unknown.campaignConfig : 'no-save';
  out.unknownId = rulesetIdOf(unknown);
  raw.state.campaignConfig.ruleset = 'stable';
  localStorage.setItem(SAVE_SNAPSHOT_KEY, JSON.stringify(raw));
  out.explicitStableField = 'ruleset' in (loadSnapshot()?.state.campaignConfig ?? { ruleset: 1 });
  delete raw.state.campaignConfig.ruleset;
  localStorage.setItem(SAVE_SNAPSHOT_KEY, JSON.stringify(raw));
  out.oldSaveId = rulesetIdOf(loadSnapshot()?.state);
  localStorage.removeItem(SAVE_SNAPSHOT_KEY);
  localStorage.removeItem(betaKey);
  return out;
}, BETA_KEY);

check('beta is off by default and a stable run carries no ruleset field', !headless.offField && headless.offId === 'stable',
  `field ${headless.offField}, id ${headless.offId}`);
check('with the opt-in on, a new reign is beta', headless.onId === 'beta' && headless.onRules === 'beta', JSON.stringify(headless));
check('a door that names stable (the Skirmish) stays stable with the opt-in on',
  headless.skirmishId === 'stable' && !headless.skirmishField);
check('a beta reign survives save → load as beta', headless.savedId === 'beta', `read back ${headless.savedId}`);
check('an unknown ruleset in a save resumes as stable, with the field dropped',
  headless.unknownField === false && headless.unknownId === 'stable', `field ${headless.unknownField}, id ${headless.unknownId}`);
check('an explicit "stable" is normalised to no field', headless.explicitStableField === false);
check('a save from before rulesets reads as stable', headless.oldSaveId === 'stable');

// ── Rendered: the menu door, the BETA mark, go again ────────────────────────
const badgeCount = () => page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene')
  .children.list.filter((c) => c.getData?.('menuBetaBadge')).length);
const buttonAt = (sceneKey, pattern) => page.evaluate(([key, source]) => {
  const scene = window.__phaserGame.scene.getScene(key);
  const re = new RegExp(source);
  const walk = (list) => {
    for (const child of list ?? []) {
      const label = child.list?.find?.((k) => k.type === 'Text' && re.test(k.text));
      if (label) { const m = label.getWorldTransformMatrix(); return { x: m.tx, y: m.ty }; }
      const deeper = child.list ? walk(child.list) : null;
      if (deeper) return deeper;
    }
    return null;
  };
  return walk(scene?.children?.list);
}, [sceneKey, pattern]);

check('the stable menu draws no BETA mark', (await badgeCount()) === 0);

await page.evaluate((key) => localStorage.setItem(key, 'on'), BETA_KEY);
await openMenu();
// The mark is a pill printed inside the button beside its title, so the one tagged object is the
// button, its title is still exactly the game's name, and the pill's own text is BETA.
const betaLabel = await buttonAt('MenuScene', '^Dragon Ascent$') && await buttonAt('MenuScene', '^BETA$');
check('with the opt-in on, the play button carries the BETA mark', (await badgeCount()) === 1 && Boolean(betaLabel),
  `${await badgeCount()} badge objects, label ${betaLabel ? 'found' : 'missing'}`);

const play = await buttonAt('MenuScene', '^Dragon Ascent');
check('the play button is on the page', Boolean(play));
if (play) {
  await page.mouse.click(play.x, play.y);
  const started = await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 20000 })
    .then(() => true).catch(() => false);
  check('pressing it starts a reign', started);
  const readout = await page.evaluate(() => ({
    config: window.__mandateState?.campaignConfig?.ruleset,
    text: JSON.parse(window.render_game_to_text()).ascent?.ruleset,
  }));
  check('the reign the menu started is beta, and the text readout says so', readout.config === 'beta' && readout.text === 'beta', JSON.stringify(readout));

  // Turn the opt-in off mid-reign, then "go again": the next reign keeps this one's rules.
  await page.evaluate((key) => localStorage.removeItem(key), BETA_KEY);
  const before = await page.evaluate(() => window.__mandateState);
  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:restart-ascent'));
  await page.waitForFunction((old) => window.__mandateState && window.__mandateState !== old, before, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  const again = await page.evaluate(() => window.__mandateState?.campaignConfig?.ruleset);
  check('"go again" keeps the reign\'s ruleset even after the opt-in is turned off', again === 'beta', `next reign: ${again}`);

  // A beta reign saved from inside the run tags the menu's Continue line.
  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:save-snapshot'));
  await page.waitForTimeout(300);
}

await openMenu();
check('with the opt-in off again, the BETA mark is gone', (await badgeCount()) === 0);
const continueTagged = await buttonAt('MenuScene', 'Continue .*beta');
check('a beta save\'s Continue line says beta', Boolean(continueTagged));

// ── Settings: the row, in both languages, and the tap that flips it ─────────
for (const language of ['en', 'vi']) {
  await page.evaluate((lang) => localStorage.setItem('mandate:language:v1', lang), language);
  await openMenu();
  await page.evaluate(() => {
    const game = window.__phaserGame;
    game.scene.stop('MenuScene');
    game.scene.start('SettingsScene');
  });
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('SettingsScene'), null, { timeout: 10000 });
  await page.waitForTimeout(700);
  const flipped = await page.evaluate(async ({ key, lang }) => {
    const { t } = await import('/src/i18n/index.ts');
    const scene = window.__phaserGame.scene.getScene('SettingsScene');
    const texts = [];
    const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') texts.push(c); if (c.list) walk(c.list); } };
    walk(scene.children.list);
    const rowLabel = texts.find((c) => c.text === t('beta.settings.row'));
    const heading = texts.some((c) => c.text.toLowerCase() === t('beta.settings.section').toLowerCase());
    if (!rowLabel) return { found: false, heading, lang };
    const holder = rowLabel.parentContainer;
    const on = holder.list.find((c) => c.type === 'Text' && c.text === t('menu.toggle.on') && Math.abs(c.y - rowLabel.y) < 4);
    const hit = holder.list.find((c) => c.type === 'Rectangle' && on && Math.abs(c.x - on.x) < 1 && Math.abs(c.y - on.y) < 1);
    hit?.emit('pointerup', { id: 99, downTime: -1 });
    return { found: true, heading, pressed: Boolean(hit), stored: localStorage.getItem(key), lang };
  }, { key: BETA_KEY, lang: language });
  check(`the Settings page lists the beta row (${language})`, flipped.found && flipped.heading, JSON.stringify(flipped));
  check(`tapping On stores the opt-in (${language})`, flipped.pressed && flipped.stored === 'on', JSON.stringify(flipped));
  await page.evaluate((key) => localStorage.removeItem(key), BETA_KEY);
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.evaluate(() => localStorage.clear());
await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: the beta is a door, and every lock holds' : 'FAIL: the beta ruleset leaks');
process.exit(failed === 0 ? 0 : 1);
