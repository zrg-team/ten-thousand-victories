/**
 * The beta's truthful numbers (B01): conquest cards say what their numbers are.
 *
 *   - stable: the diplomacy card is exactly what it was (no trust field, the old ETA formula);
 *   - beta: diplomacy shows trust progress and an ETA that **matches the real claim to the season**
 *     (court multiplier included); a province asking for more than the trust cap is blocked with
 *     that reason; a siege quotes the clamped roll; a defence card's preview values walls at the
 *     Ascent price; the method sheet never says "certain" beside a trust figure.
 *   - both: the army lane's "chance to carry it" is a percentage, not a percentage × 100.
 *
 * Usage: node test_scripts/verify/verify-beta-truth.mjs
 */
import { chromium } from 'playwright';
import { READ_OPTIONS, ENGINE_BOOT } from '../playtest/playtest-lib.mjs';

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
await page.addInitScript(() => { if (!localStorage.getItem('mandate:language:v1')) localStorage.setItem('mandate:language:v1', 'en'); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const r = await page.evaluate(async () => {
  const Conquest = await import('/src/systems/ascent/ConquestSystem.ts');
  const Acq = await import('/src/systems/AcquisitionSystem.ts');
  const { powerCardView } = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { ROLLABLE_POWER_CARDS } = await import('/src/data/ascentCards.ts');
  const PLAYER = 'dai-viet';
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const boot = async (ruleset) => {
    window.__ptFreshProfile();
    const state = await window.__ptBoot(31, { ruleset });
    window.__ptRestoreRandom();
    // Answer the opening the way a reign does — the founder is the envoy a diplomacy card needs.
    for (let i = 0; i < 12 && state.pendingAscentPrompt; i += 1) {
      const options = window.__ptOptions(state);
      if (!options?.length || !resolveAscentPrompt(state, options[0])) break;
    }
    state.pendingAscentPrompt = undefined;
    state.ascent.promptQueue = [];
    state.resources.supplies = 99999;
    state.resources.gold = 99999;
    return state;
  };
  // A village the realm can actually reach: the conquest targets on offer border the realm.
  const village = (state) => {
    const offered = Conquest.buildConquestTargets(state).map((target) => state.lands.find((l) => l.id === target.landId));
    return offered.find((l) => l && l.ownerId === 'neutral' && l.hasVillage && Acq.getDiplomacyThreshold(l) <= 95)
      ?? state.lands.find((l) => l.ownerId === 'neutral' && l.hasVillage && Acq.getDiplomacyThreshold(l) <= 95);
  };
  const out = {};

  const stable = await boot('stable');
  const sLand = village(stable);
  const sDip = Conquest.buildConquestTarget(stable, sLand).methods.find((m) => m.method === 'diplomacy');
  out.stableDip = { trust: sDip?.trust, estimate: sDip?.estimate, chance: sDip?.chance };

  const beta = await boot('beta');
  const land = village(beta);
  const target = Conquest.buildConquestTarget(beta, land);
  const dip = target.methods.find((m) => m.method === 'diplomacy');
  out.betaDip = { trust: dip?.trust, ticks: dip?.ticks, blocked: dip?.blockedReason, hero: dip?.heroId };
  const siege = target.methods.find((m) => m.method === 'siege');
  out.siegeChance = siege?.chance;

  // The ETA, against the claim itself: start it with the card's own envoy and count the seasons.
  if (dip && !dip.blockedReason) {
    const quoted = dip.ticks;
    const attempt = Conquest.executeConquestMethod(beta, land.id, 'diplomacy', { heroId: dip.heroId });
    let seasons = 0;
    while (land.ownerId !== PLAYER && seasons < 300) {
      Acq.progressAcquisitions(beta);
      seasons += 1;
    }
    out.eta = { quoted, actual: seasons, started: attempt?.attempted ?? attempt, owner: land.ownerId };
  }

  // A province that wants more trust than the cap is blocked, with the reason.
  const proud = await boot('beta');
  const high = proud.lands.find((l) => l.ownerId === 'neutral' && l.hasVillage);
  high.localSoldiers = 400;
  const proudDip = Conquest.buildConquestTarget(proud, high).methods.find((m) => m.method === 'diplomacy');
  out.unreachable = { need: proudDip?.trust?.need, blocked: proudDip?.blockedReason };

  // Defence cards: the beta preview values a wall point at the Ascent price.
  const defenceCard = ROLLABLE_POWER_CARDS.find((card) => card.levels?.[0]?.effect?.defenseBoost);
  if (defenceCard) {
    const s = await boot('stable');
    const b = await boot('beta');
    out.defencePreview = { card: defenceCard.id, stable: powerCardView(s, defenceCard.id)?.powerGainPct, beta: powerCardView(b, defenceCard.id)?.powerGainPct };
  }

  // The army lane's front line, both rulesets: frontWinChance is already 0–100.
  const { t } = await import('/src/i18n/index.ts');
  const line = t('ascent.war.frontBody', { pct: Math.round(Conquest.frontWinChance(beta)) });
  out.frontLine = line;
  return out;
});

check('stable: the diplomacy card is unchanged (no trust field, no estimate flag)', r.stableDip.trust === undefined && r.stableDip.estimate === undefined, JSON.stringify(r.stableDip));
check('beta: diplomacy carries trust progress and an ETA', Boolean(r.betaDip.trust) && r.betaDip.ticks > 0, JSON.stringify(r.betaDip));
check('beta: the diplomacy ETA matches the real claim to the season', r.eta && r.eta.quoted === r.eta.actual && r.eta.owner === 'dai-viet', JSON.stringify(r.eta));
check('beta: a province wanting more than 100 trust is blocked with that reason', r.unreachable.need > 100 && /100/.test(r.unreachable.blocked ?? ''), JSON.stringify(r.unreachable));
check('beta: the siege quotes a roll inside 10–90', r.siegeChance === undefined || (r.siegeChance >= 10 && r.siegeChance <= 90), `chance ${r.siegeChance}`);
if (r.defencePreview) {
  check('beta: a defence card previews no more POWER than stable promised', r.defencePreview.beta <= r.defencePreview.stable, JSON.stringify(r.defencePreview));
}
check('both: the front line prints a percentage, never ×100', !/\d{4,}%/.test(r.frontLine), r.frontLine);

// Rendered: the beta method sheet for a village.
await page.evaluate(() => window.__startBenchGame(31, 'ascent', 'beta'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);
// Clear the opening through the scene, the way a player's taps do.
for (let i = 0; i < 12; i += 1) {
  const up = await page.evaluate(() => window.__mandateState?.pendingAscentPrompt?.kind);
  if (!up) break;
  await page.evaluate(() => {
    const options = window.__ptOptions(window.__mandateState);
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:ascent-choice', options?.[0] ?? 'ok');
  });
  await page.waitForTimeout(350);
}
await page.evaluate(async () => {
  const Conquest = await import('/src/systems/ascent/ConquestSystem.ts');
  const Acq = await import('/src/systems/AcquisitionSystem.ts');
  const state = window.__mandateState;
  state.ascent.promptQueue = [];
  state.resources.supplies = 99999;
  const offered = Conquest.buildConquestTargets(state).map((target) => state.lands.find((l) => l.id === target.landId));
  const land = offered.find((l) => l && l.ownerId === 'neutral' && l.hasVillage && Acq.getDiplomacyThreshold(l) <= 95)
    ?? state.lands.find((l) => l.ownerId === 'neutral' && l.hasVillage);
  state.pendingAscentPrompt = { kind: 'conquer-method', target: Conquest.buildConquestTarget(state, land) };
  state.isPaused = true;
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
const opened = await page.waitForFunction(() => String(window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey).startsWith('conquer-method'), null, { timeout: 8000 })
  .then(() => true).catch(() => false);
await page.waitForTimeout(700);
const sheet = await page.evaluate(async () => {
  const { t } = await import('/src/i18n/index.ts');
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const texts = [];
  const walk = (list) => { for (const c of list ?? []) { if (c.type === 'Text') texts.push(c.text); if (c.list) walk(c.list); } };
  walk(scene.children.list);
  return {
    trust: texts.some((x) => /trust \d+\/\d+/.test(x)),
    certainBesideTrust: texts.some((x) => /trust \d+\/\d+/.test(x) && /certain/i.test(x)),
    oldDescription: texts.some((x) => x.includes(t('ascent.method.diplomacy.d'))),
  };
});
check('beta: the method sheet shows trust progress, and no "certain" description', opened && sheet.trust && !sheet.certainBesideTrust && !sheet.oldDescription, JSON.stringify(sheet));
await page.screenshot({ path: 'output/beta-round/shots/beta-conquer-method.png' });

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: the beta conquest numbers say what they are' : 'FAIL: a beta number is still lying');
process.exit(failed === 0 ? 0 : 1);
