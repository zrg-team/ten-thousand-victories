/**
 * A Skirmish fight writes nothing to the house.
 *
 * Every Skirmish fight builds a real Dragon Ascent state so the fight reads real court and hero
 * data. Building one used to run the founding's bookkeeping too: the Legacy perk's founding draws
 * were banked into the Deck and the dynasty's trait uses were counted — so the practice yard paid a
 * draw per fight. The fix is `newAscentRun({ sandbox: true })`. A normal reign still banks both,
 * which is checked first so the fixture is proven live.
 *
 * Usage: node test_scripts/verify/verify-skirmish-stores.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
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
await page.addInitScript(() => {
  if (sessionStorage.getItem('skirmish-seeded')) return;
  sessionStorage.setItem('skirmish-seeded', '1');
  localStorage.clear();
  localStorage.setItem('mandate:language:v1', 'en');
});
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const legacy = await import('/src/state/legacy.ts');
  const { getCabinet } = await import('/src/state/cabinet.ts');
  const { getDynasty } = await import('/src/state/dynasty.ts');
  const { newAscentRun } = await import('/src/state/ascentRun.ts');

  // A house that pays at the founding: the draw perk carried, three founding traits, a two-card hand.
  legacy.addLegacyPoints(5000);
  for (let i = 0; i < 3; i += 1) legacy.purchaseLegacyPerk('rubbing-press');
  if (!legacy.getLegacy().loadout.includes('rubbing-press')) legacy.toggleLoadout('rubbing-press');
  const dynasty = { ...getDynasty(), traits: ['old-roads', 'deep-shelf', 'second-founder'] };
  localStorage.setItem('mandate:dynasty:v1', JSON.stringify(dynasty));
  localStorage.setItem('mandate:cabinet:v1', JSON.stringify({
    rubbings: 0, rubbingPity: 0, deeds: [], openingHand: ['fire-arrows', 'rice-tribute'],
    cards: { 'fire-arrows': { level: 1, copies: 1 }, 'rice-tribute': { level: 1, copies: 1 } },
  }));

  const read = () => ({
    rubbings: getCabinet().rubbings,
    uses: JSON.stringify(getDynasty().traitUses ?? {}),
    raw: ['mandate:cabinet:v1', 'mandate:dynasty:v1', 'mandate:legacy:v1'].map((k) => localStorage.getItem(k)).join('|'),
  });
  const out = { perkDraws: legacy.legacyStartRubbings() };

  const beforeSandbox = read();
  newAscentRun({ ruleset: 'stable', sandbox: true });
  newAscentRun({ ruleset: 'stable', sandbox: true });
  const afterSandbox = read();
  out.sandboxUnchanged = beforeSandbox.raw === afterSandbox.raw;

  const reign = newAscentRun({ ruleset: 'stable' });
  const afterReign = read();
  out.reignDraws = afterReign.rubbings - afterSandbox.rubbings;
  out.reignUses = afterReign.uses;
  out.reignHasFounderCard = reign.pendingAscentPrompt?.kind === 'founder' || reign.ascent.promptQueue.some((p) => p.kind === 'founder');
  out.rawBeforeArena = afterReign.raw;
  return out;
});

check('the fixture house pays founding draws', result.perkDraws > 0, `${result.perkDraws} a founding`);
check('a normal reign still banks the founding draws', result.reignDraws === result.perkDraws, `+${result.reignDraws}`);
check('a normal reign still counts the founding trait uses', /old-roads/.test(result.reignUses) && /second-founder/.test(result.reignUses), result.reignUses);
check('two sandbox runs write nothing to the Deck, Dynasty or Legacy stores', result.sandboxUnchanged);

// The real door: the Skirmish page fights twice.
await page.evaluate(() => {
  const g = window.__phaserGame;
  for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key);
  g.scene.start('BattleArenaScene');
});
await page.waitForFunction(() => window.__phaserGame.scene.isActive('BattleArenaScene'), null, { timeout: 15000 });
await page.waitForTimeout(800);
const arena = await page.evaluate(async (rawBefore) => {
  const scene = window.__phaserGame.scene.getScene('BattleArenaScene');
  scene.startFight();
  scene.startFight();
  const raw = ['mandate:cabinet:v1', 'mandate:dynasty:v1', 'mandate:legacy:v1'].map((k) => localStorage.getItem(k)).join('|');
  return { unchanged: raw === rawBefore, arena: Boolean(scene.state?.ascent?.arena ?? window.__mandateState?.ascent?.arena) };
}, result.rawBeforeArena);
check('two Skirmish fights from the Skirmish page write nothing to the house', arena.unchanged);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: the practice yard pays nothing into the house' : 'FAIL: Skirmish store writes');
process.exit(failed === 0 ? 0 : 1);
