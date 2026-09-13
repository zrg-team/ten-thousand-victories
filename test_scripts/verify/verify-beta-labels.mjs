/**
 * Every reward label on the draft names its scope (B19).
 *
 * Beta: the sheet says a card lasts this reign; the stack line reads "This reign n/max"; the ghost
 * line is the Deck's; a card the Deck does not hold says "not in your Deck" instead of counting
 * copies toward a combine a draft cannot feed, and an owned card counts to the right level.
 * Stable: the draft is exactly as it was ("Every choice is permanent", "Stack", "more to combine").
 *
 * Usage: node test_scripts/verify/verify-beta-labels.mjs
 */
import { chromium } from 'playwright';
import { READ_OPTIONS } from '../playtest/playtest-lib.mjs';

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
  await page.evaluate(READ_OPTIONS);
  // One card owned at level 1 with one copy, so the owned line has something to count.
  await page.evaluate(async () => {
    const { addCabinetCard } = await import('/src/state/cabinet.ts');
    addCabinetCard('earthen-ramparts');
  });
  await page.evaluate((r) => window.__startBenchGame(13, 'ascent', r), ruleset);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
  await page.waitForTimeout(900);
  for (let i = 0; i < 12; i += 1) {
    const up = await page.evaluate(() => window.__mandateState?.pendingAscentPrompt?.kind);
    if (!up) break;
    await page.evaluate(() => {
      const options = window.__ptOptions(window.__mandateState);
      window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:ascent-choice', options?.[0] ?? 'ok');
    });
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => {
    const state = window.__mandateState;
    state.ascent.promptQueue = [];
    state.ascent.pendingLevelUps = 1;
    state.pendingAscentPrompt = { kind: 'power-draft', level: 2, cards: ['earthen-ramparts', 'fire-arrows', 'rice-tribute'], rerollCost: 40 };
    state.isPaused = true;
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
  });
  const opened = await page.waitForFunction(() => String(window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey).startsWith('power-draft'), null, { timeout: 8000 })
    .then(() => true).catch(() => false);
  await page.waitForTimeout(1600);
  const texts = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const all = [];
    const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') all.push(c.text); if (c.list) walk(c.list); } };
    walk(scene.children.list);
    return all;
  });
  const has = (re) => texts.some((x) => re.test(x));
  if (ruleset === 'stable') {
    check('stable: the draft still says every choice is permanent', opened && has(/permanent/i), texts.filter((x) => /permanent|reign/i.test(x)).join(' | '));
    check('stable: the stack line still reads "Stack n/max"', has(/Stack \d\/\d/));
    check('stable: an unowned card still counts copies "to combine"', has(/more to combine/));
  } else if (language === 'en') {
    check('beta: the draft says a card lasts this reign', opened && has(/rest of this reign/) && !has(/permanent/i));
    check('beta: the stack line names this reign', has(/This reign \d\/\d/) && !has(/Stack \d\/\d/));
    check('beta: an unowned card says it is not in the Deck, never "to combine"', has(/not in your Deck/) && !has(/more to combine/));
    check('beta: the owned card counts toward the next Deck level', has(/Deck: \d more → Lv2/), texts.filter((x) => /Deck/.test(x)).join(' | '));
  } else {
    check('beta: the Vietnamese draft names this reign and the Deck', opened && has(/Đời này \d\/\d/) && has(/chưa có trong Bộ Bài/), texts.filter((x) => /Đời này|Bộ Bài/.test(x)).join(' | '));
  }
  await page.screenshot({ path: `output/beta-round/shots/draft-${ruleset}-${language}.png` });
  await page.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: every draft label names its scope in beta; stable unchanged' : 'FAIL: draft labels');
process.exit(failed === 0 ? 0 : 1);
