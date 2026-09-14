/**
 * Dragon Ascent rule versions: the doors and the locks.
 *
 * A run is stamped with a version when it starts (`CampaignConfig.ruleset`, via `newAscentRun`)
 * and keeps it for life. v2 (what the beta became) is the default since 2026-09-15; v1 (the
 * original game) stays one Settings tap away. This gate proves the promises that make that safe:
 *
 *   - a new reign plays the default (v2) unless the player chose otherwise;
 *   - choosing v1 gives a run with no ruleset field at all (so its saves are the old saves);
 *   - the old beta opt-in still means v2; the Skirmish is always v1, whatever Settings says;
 *   - saves keep their version, old names (`stable`, `beta`) are read, unknown ones resume as v1;
 *   - "go again" keeps the reign's own version, not the current setting;
 *   - the menu marks the Play button only when the next reign is not the default, and tags a
 *     non-default save's Continue line;
 *   - the Settings row lists every offered version in both languages and actually stores the choice;
 *   - the registry is complete: every version has its info, words, and a default that exists.
 *
 * Usage: node test_scripts/verify/verify-ruleset.mjs
 * Env:   DEV_URL for a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const KEY = 'mandate:ascent:ruleset:v1';
const LEGACY_BETA_KEY = 'mandate:beta:ascent:v1';

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

// ── Headless: the registry, the factory and the save path ────────────────────
await openMenu();
const headless = await page.evaluate(async ({ key, legacy }) => {
  const { newAscentRun } = await import('/src/state/ascentRun.ts');
  const registry = await import('/src/game/ascentRuleset.ts');
  const { rulesOf, rulesetIdOf, ASCENT_RULESET_IDS, ASCENT_RULESET_INFO, DEFAULT_ASCENT_RULESET, normalizeRulesetId } = registry;
  const { t } = await import('/src/i18n/index.ts');
  const { saveSnapshot, loadSnapshot, SAVE_SNAPSHOT_KEY } = await import('/src/state/save.ts');
  const language = localStorage.getItem('mandate:language:v1');
  localStorage.clear();
  localStorage.setItem('mandate:language:v1', language ?? 'en');

  const out = {};
  out.ids = [...ASCENT_RULESET_IDS];
  out.default = DEFAULT_ASCENT_RULESET;
  out.infoComplete = ASCENT_RULESET_IDS.every((id) => ASCENT_RULESET_INFO[id]
    && !t(`ruleset.${id}.name`).startsWith('ruleset.') && !t(`ruleset.${id}.note`).startsWith('ruleset.'));
  out.aliases = [normalizeRulesetId('stable'), normalizeRulesetId('beta'), normalizeRulesetId('gamma')];
  out.v2Differs = rulesOf({ campaignConfig: { ruleset: 'v2' } }).heroGrowth === true && rulesOf({ campaignConfig: {} }).heroGrowth === false;

  const fresh = newAscentRun();
  out.defaultId = rulesetIdOf(fresh);
  out.defaultField = fresh.campaignConfig.ruleset;

  localStorage.setItem(key, 'v1');
  const v1 = newAscentRun();
  out.v1Field = 'ruleset' in v1.campaignConfig;
  out.v1Id = rulesetIdOf(v1);
  localStorage.removeItem(key);

  localStorage.setItem(legacy, 'on');
  out.legacyBetaId = rulesetIdOf(newAscentRun());
  localStorage.removeItem(legacy);

  localStorage.setItem(key, 'v2');
  out.skirmishId = rulesetIdOf(newAscentRun({ ruleset: 'v1' }));
  out.oldNameDoor = [rulesetIdOf(newAscentRun({ ruleset: 'stable' })), 'ruleset' in newAscentRun({ ruleset: 'stable' }).campaignConfig, newAscentRun({ ruleset: 'beta' }).campaignConfig.ruleset];
  localStorage.removeItem(key);

  // A v2 reign saved and read back, then the same save as written by older builds.
  saveSnapshot(fresh);
  out.savedId = loadSnapshot()?.state.campaignConfig?.ruleset;
  const raw = JSON.parse(localStorage.getItem(SAVE_SNAPSHOT_KEY));
  const readAs = (value) => {
    if (value === undefined) delete raw.state.campaignConfig.ruleset; else raw.state.campaignConfig.ruleset = value;
    localStorage.setItem(SAVE_SNAPSHOT_KEY, JSON.stringify(raw));
    const state = loadSnapshot()?.state;
    return { field: state ? state.campaignConfig.ruleset ?? null : 'no-save', id: rulesetIdOf(state) };
  };
  out.saveBeta = readAs('beta');
  out.saveStable = readAs('stable');
  out.saveUnknown = readAs('gamma');
  out.saveAbsent = readAs(undefined);
  localStorage.removeItem(SAVE_SNAPSHOT_KEY);
  return out;
}, { key: KEY, legacy: LEGACY_BETA_KEY });

check('the registry lists v1 and v2, and the default is one of them', headless.ids.join() === 'v1,v2' && headless.ids.includes(headless.default), JSON.stringify(headless.ids));
check('every version has its info and its words in the catalog', headless.infoComplete);
check('old names are understood (stable → v1, beta → v2), unknown ones are not', headless.aliases.join() === 'v1,v2,', JSON.stringify(headless.aliases));
check('v2 and v1 really are different rules', headless.v2Differs);
check('a new reign with no choice made plays v2', headless.defaultId === 'v2' && headless.defaultField === 'v2', `${headless.defaultId} / field ${headless.defaultField}`);
check('choosing v1 gives a reign with no ruleset field at all', headless.v1Id === 'v1' && !headless.v1Field);
check('the old beta opt-in still means v2', headless.legacyBetaId === 'v2');
check('a door that names v1 (the Skirmish) stays v1 whatever Settings says', headless.skirmishId === 'v1');
check('a harness naming the old words gets clean state (stable = no field, beta = "v2")',
  headless.oldNameDoor[0] === 'v1' && headless.oldNameDoor[1] === false && headless.oldNameDoor[2] === 'v2', JSON.stringify(headless.oldNameDoor));
check('a v2 reign survives save → load as v2', headless.savedId === 'v2', `read back ${headless.savedId}`);
check('a save written as "beta" resumes as v2', headless.saveBeta.id === 'v2' && headless.saveBeta.field === 'v2', JSON.stringify(headless.saveBeta));
check('a save written as "stable" resumes as v1 with the field dropped', headless.saveStable.id === 'v1' && headless.saveStable.field === null, JSON.stringify(headless.saveStable));
check('an unknown version in a save resumes as v1 with the field dropped', headless.saveUnknown.id === 'v1' && headless.saveUnknown.field === null, JSON.stringify(headless.saveUnknown));
check('a save from before versions reads as v1', headless.saveAbsent.id === 'v1');

// ── Rendered: the menu door, the version mark, go again ─────────────────────
const badgeCount = () => page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene')
  .children.list.filter((c) => c.getData?.('menuRulesetBadge')).length);
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

check('with the default chosen, the menu draws no version mark', (await badgeCount()) === 0);

await page.evaluate((key) => localStorage.setItem(key, 'v1'), KEY);
await openMenu();
const markLabel = await buttonAt('MenuScene', '^Dragon Ascent$') && await buttonAt('MenuScene', '^V1$');
check('with v1 chosen, the play button carries the V1 mark', (await badgeCount()) === 1 && Boolean(markLabel),
  `${await badgeCount()} badge objects, label ${markLabel ? 'found' : 'missing'}`);

const play = await buttonAt('MenuScene', '^Dragon Ascent');
check('the play button is on the page', Boolean(play));
if (play) {
  await page.mouse.click(play.x, play.y);
  const started = await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 20000 })
    .then(() => true).catch(() => false);
  check('pressing it starts a reign', started);
  const readout = await page.evaluate(() => ({
    config: window.__mandateState?.campaignConfig?.ruleset ?? null,
    text: JSON.parse(window.render_game_to_text()).ascent?.ruleset,
  }));
  check('the reign the menu started is v1, and the text readout says so', readout.config === null && readout.text === 'v1', JSON.stringify(readout));

  // Change the choice mid-reign, then "go again": the next reign keeps this one's rules.
  await page.evaluate((key) => localStorage.removeItem(key), KEY);
  const before = await page.evaluate(() => window.__mandateState);
  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:restart-ascent'));
  await page.waitForFunction((old) => window.__mandateState && window.__mandateState !== old, before, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  const again = await page.evaluate(() => window.__mandateState?.campaignConfig?.ruleset ?? null);
  check('"go again" keeps the reign\'s version even after the choice changed', again === null, `next reign field: ${again}`);

  // A v1 reign saved from inside the run tags the menu's Continue line.
  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:save-snapshot'));
  await page.waitForTimeout(300);
}

await openMenu();
check('with the default chosen again, the mark is gone', (await badgeCount()) === 0);
const continueTagged = await buttonAt('MenuScene', 'Continue .*V1');
check('a v1 save\'s Continue line says V1', Boolean(continueTagged));

// ── Settings: the row, in both languages, and the tap that stores it ────────
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
  const tapped = await page.evaluate(async ({ key }) => {
    const { t } = await import('/src/i18n/index.ts');
    const scene = window.__phaserGame.scene.getScene('SettingsScene');
    const texts = [];
    const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') texts.push(c); if (c.list) walk(c.list); } };
    walk(scene.children.list);
    const rowLabel = texts.find((c) => c.text === t('ruleset.settings.row'));
    const heading = texts.some((c) => c.text.toLowerCase() === t('ruleset.settings.section').toLowerCase());
    if (!rowLabel) return { found: false, heading };
    const holder = rowLabel.parentContainer;
    const press = (label) => {
      const option = holder.list.find((c) => c.type === 'Text' && c.text === label);
      const hit = holder.list.find((c) => c.type === 'Rectangle' && option && Math.abs(c.x - option.x) < 1 && Math.abs(c.y - option.y) < 1);
      hit?.emit('pointerup', { id: 99, downTime: -1 });
      return Boolean(hit);
    };
    const options = [t('ruleset.v1.name'), t('ruleset.v2.name')].map((label) => texts.some((c) => c.text === label));
    const pressedV1 = press(t('ruleset.v1.name'));
    const storedV1 = localStorage.getItem(key);
    return { found: true, heading, options, pressedV1, storedV1 };
  }, { key: KEY });
  check(`the Settings page lists the rules row with both versions (${language})`,
    tapped.found && tapped.heading && tapped.options?.every(Boolean), JSON.stringify(tapped));
  check(`tapping V1 stores the choice (${language})`, tapped.pressedV1 && tapped.storedV1 === 'v1', JSON.stringify(tapped));
  await page.waitForTimeout(400);
  const back = await page.evaluate(async ({ key }) => {
    const { setPreferredAscentRuleset } = await import('/src/game/rulesetOptions.ts');
    setPreferredAscentRuleset('v2');
    return localStorage.getItem(key);
  }, { key: KEY });
  check(`choosing the default again clears the stored choice (${language})`, back === null, String(back));
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.evaluate(() => localStorage.clear());
await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: every rule version is a door, and every lock holds' : 'FAIL: the rule versions leak');
process.exit(failed === 0 ? 0 : 1);
