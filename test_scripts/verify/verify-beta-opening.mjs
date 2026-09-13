/**
 * The beta's opening (B05) and its run-start summary (B30).
 *
 * Beta: a house with nothing in force and nothing waiting on the menu goes straight from the
 * coronation to the first real choice; any house that carries something — Legacy perks, traits,
 * a slotted hand, draws to open — still sees the summary, and the summary now names the Legacy
 * layer it used to leave out. Stable: the card is raised exactly as before, for every house.
 *
 * Usage: node test_scripts/verify/verify-beta-opening.mjs
 * Env:   DEV_URL for a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { READ_OPTIONS, ENGINE_BOOT } from '../playtest/playtest-lib.mjs';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
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

const result = await page.evaluate(async () => {
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { carriesAnything, readCarriedOver } = await import('/src/systems/ascent/CarriedOver.ts');
  const { addRubbings } = await import('/src/state/cabinet.ts');
  const { addLegacyPoints, purchaseLegacyPerk, toggleLoadout } = await import('/src/state/legacy.ts');

  /** The opening's card order: the pending card, then the queue, as a player would meet them. */
  const opening = async (ruleset) => {
    const state = await window.__ptBoot(5, { ruleset });
    window.__ptRestoreRandom();
    return { state, order: [state.pendingAscentPrompt?.kind, ...state.ascent.promptQueue.map((p) => p.kind)].filter(Boolean) };
  };
  const snapshotStores = () => Object.keys(localStorage).filter((k) => k.startsWith('mandate:') && k !== 'mandate:language:v1')
    .sort().map((k) => `${k}=${localStorage.getItem(k)}`).join('|');
  const out = {};

  window.__ptFreshProfile();
  out.freshBeta = (await opening('beta')).order;
  window.__ptFreshProfile();
  out.freshStable = (await opening('stable')).order;

  // Crowned but empty: the first reign's coronation answered, nothing else banked.
  window.__ptFreshProfile();
  const first = await opening('beta');
  resolveAscentPrompt(first.state, 'crowned');
  out.crownedBeta = (await opening('beta')).order;
  out.crownedStable = (await opening('stable')).order;

  // Owned only: a vault too small for the cheapest rung is context, not a reason to stop the reign.
  window.__ptFreshProfile();
  addLegacyPoints(10);
  out.ownedOnly = { carries: carriesAnything(readCarriedOver()), order: (await opening('beta')).order };

  // Legacy only: a perk bought and carried.
  window.__ptFreshProfile();
  addLegacyPoints(200);
  purchaseLegacyPerk('founders-purse');
  if (!readCarriedOver().perks.length) toggleLoadout('founders-purse');
  const legacyOnly = readCarriedOver();
  out.legacyOnly = { perks: legacyOnly.perks, order: (await opening('beta')).order };

  // Draws only.
  window.__ptFreshProfile();
  addRubbings(2);
  out.drawsOnly = (await opening('beta')).order;

  // Traits only, written as the dynasty store holds them.
  window.__ptFreshProfile();
  localStorage.setItem('mandate:dynasty:v1', JSON.stringify({ xp: 2500, level: 1, traits: ['quartermaster'], pendingPicks: 0, reigns: 1, bestScore: 2500, respecs: 0, history: [], traitUses: {} }));
  out.traitsOnly = (await opening('beta')).order;

  // The reader writes nothing.
  const before = snapshotStores();
  readCarriedOver();
  carriesAnything(readCarriedOver());
  out.readerWritesNothing = snapshotStores() === before;
  return out;
});

const has = (order, kind) => order.includes(kind);
check('stable: a fresh profile still opens coronation → inheritance → mandate', JSON.stringify(result.freshStable.slice(0, 3)) === '["coronation","inheritance","mandate"]', result.freshStable.join(' → '));
check('stable: a crowned empty house still gets the card', has(result.crownedStable, 'inheritance'), result.crownedStable.join(' → '));
check('beta: a fresh profile skips the empty card (coronation → mandate)', !has(result.freshBeta, 'inheritance') && result.freshBeta[0] === 'coronation' && result.freshBeta[1] === 'mandate', result.freshBeta.join(' → '));
check('beta: a crowned empty house opens on the mandate', result.crownedBeta[0] === 'mandate' && !has(result.crownedBeta, 'inheritance'), result.crownedBeta.join(' → '));
check('beta: points below the cheapest rung alone do not raise the card', !result.ownedOnly.carries && !has(result.ownedOnly.order, 'inheritance'), JSON.stringify(result.ownedOnly));
check('beta: a carried Legacy perk raises the card', result.legacyOnly.perks.length === 1 && has(result.legacyOnly.order, 'inheritance'), JSON.stringify(result.legacyOnly));
check('beta: draws waiting raise the card', has(result.drawsOnly, 'inheritance'), result.drawsOnly.join(' → '));
check('beta: a held trait raises the card', has(result.traitsOnly, 'inheritance'), result.traitsOnly.join(' → '));
check('the carried-over reader writes no store', result.readerWritesNothing);

// Rendered: a Legacy-only beta house sees the Legacy section.
for (const language of ['en', 'vi']) {
  await page.evaluate((lang) => localStorage.setItem('mandate:language:v1', lang), language);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate(async () => {
    const lang = localStorage.getItem('mandate:language:v1');
    localStorage.clear();
    localStorage.setItem('mandate:language:v1', lang);
    const { addLegacyPoints, purchaseLegacyPerk, toggleLoadout, getLegacy } = await import('/src/state/legacy.ts');
    addLegacyPoints(400);
    purchaseLegacyPerk('founders-purse');
    if (!getLegacy().loadout.includes('founders-purse')) toggleLoadout('founders-purse');
    // Crowned, so the run opens on the inheritance card rather than the rite.
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({ xp: 0, level: 0, traits: [], pendingPicks: 0, reigns: 1, bestScore: 900, respecs: 0, history: [], traitUses: {}, house: 'Lê', founder: { id: 'king', name: 'Lê Lợi', type: 'general', sex: 'man', look: { head: 1 } } }));
  });
  await page.evaluate(() => window.__startBenchGame(5, 'ascent', 'beta'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
  // Answer the rite if it is up (a hand-written store is not a crowned king), then the summary follows.
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    if (String(scene.openPromptKey).startsWith('coronation')) scene.events.emit('ui:ascent-choice', 'crowned');
  });
  const opened = await page.waitForFunction(() => String(window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey).startsWith('inheritance'), null, { timeout: 10000 })
    .then(() => true).catch(() => false);
  await page.waitForTimeout(900);
  const texts = await page.evaluate(async () => {
    const { t } = await import('/src/i18n/index.ts');
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const all = [];
    const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') all.push(c.text); if (c.list) walk(c.list); } };
    walk(scene.children.list);
    return {
      title: all.includes(t('beta.inherit.title')),
      head: all.includes(t('beta.inherit.legacyHead')),
      rank: all.some((x) => x.includes(t('beta.inherit.perkRank', { level: 1, max: 10 }))),
      vault: all.some((x) => x.startsWith(t('beta.inherit.vault', { points: 999999 }).split('999999')[0]) || /\d+ (Legacy|Di Sản)/.test(x)),
    };
  });
  check(`beta: the summary opens for a Legacy house and names the Legacy layer (${language})`, opened && texts.title && texts.head && texts.rank, JSON.stringify(texts));
  await page.screenshot({ path: `${SHOTS}/beta-inheritance-${language}.png` });
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: the beta opening says what the house carries, and nothing when it carries nothing' : 'FAIL: the beta opening is wrong');
process.exit(failed === 0 ? 0 : 1);
