/**
 * The paid talent search's price (Heroes page, *Tìm nhân tài trong thiên hạ*).
 *
 * Beta (`talentPriceByFavor`): priced by how much of the Favour meter is still to fill — right
 * after a free champion it costs more than the treasury holds, a season before the next one it
 * costs about what the shipped price did — and every search already bought this reign multiplies
 * the next. Stable keeps the shipped price, byte for byte, and never counts searches.
 *
 *   node test_scripts/verify/verify-talent-price.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });

const r = await page.evaluate(async () => {
  const { newAscentRun } = await import('/src/state/ascentRun.ts');
  const CS = await import('/src/systems/ascent/ChampionSearch.ts');
  const C = await import('/src/game/ascentConfig.ts');
  const { realmPriceScale } = await import('/src/systems/ascent/priceScale.ts');

  const shaped = (ruleset, { gold, favor, threshold = 13, searches = 0 }) => {
    const st = newAscentRun({ ruleset, sandbox: true });
    st.resources.gold = gold;
    st.court.favor = favor;
    st.court.favorThreshold = threshold;
    st.activeHeroDraft = undefined;
    st.pendingAscentPrompt = undefined;
    if (searches) st.ascent.talentSearches = searches;
    return st;
  };
  const shipped = (st) => Math.ceil(Math.max(C.TALENT_SEARCH_BASE_GOLD * realmPriceScale(st), Math.max(0, st.resources.gold) * C.TALENT_SEARCH_TREASURY_SHARE));

  const out = {};
  // Stable: the shipped price at every point of the meter, and no search counter.
  const stableRows = [0, 4, 9, 12].map((favor) => { const st = shaped('stable', { gold: 2244, favor }); return [CS.talentSearchPrice(st), shipped(st)]; });
  out.stableSame = stableRows.every(([a, b]) => a === b);
  out.stableRows = stableRows;
  const stableSearch = shaped('stable', { gold: 5000, favor: 0 });
  CS.searchForTalent(stableSearch);
  out.stableCounterField = 'talentSearches' in stableSearch.ascent;

  // Beta, one treasury, the meter at four points.
  out.beta = Object.fromEntries([0, 4, 9, 12].map((favor) => [favor, CS.talentSearchPrice(shaped('beta', { gold: 2244, favor }))]));
  out.shipped9 = shipped(shaped('stable', { gold: 2244, favor: 9 }));
  // Escalation.
  out.repeat = [0, 1, 2, 3].map((searches) => CS.talentSearchPrice(shaped('beta', { gold: 2244, favor: 9, searches })));
  // A poor realm cannot sidestep the share by holding nothing.
  out.poorFar = CS.talentSearchPrice(shaped('beta', { gold: 0, favor: 0 }));
  out.poorNear = CS.talentSearchPrice(shaped('beta', { gold: 0, favor: 12 }));

  // A real beta search counts, and the next one is dearer.
  const live = shaped('beta', { gold: 100000, favor: 9 });
  const firstPrice = CS.talentSearchPrice(live);
  const bought = CS.searchForTalent(live);
  live.pendingAscentPrompt = undefined;
  live.ascent.promptQueue = [];
  live.activeHeroDraft = undefined;
  live.ascent.talentSearchTurn = -1000;
  live.resources.gold = 100000;
  const secondPrice = CS.talentSearchPrice(live);
  out.live = { bought, counted: live.ascent.talentSearches, firstPrice, secondPrice };
  return out;
});

check('stable keeps the shipped price at every point of the meter', r.stableSame, JSON.stringify(r.stableRows));
check('stable never writes a search counter', r.stableCounterField === false);
check('beta: right after a free champion the search costs more than the treasury', r.beta[0] > 2244, JSON.stringify(r.beta));
check('beta: the price falls as the next champion nears', r.beta[0] > r.beta[4] && r.beta[4] > r.beta[9] && r.beta[9] > r.beta[12], JSON.stringify(r.beta));
check('beta: near the next champion it is about the shipped price (within 25%)', Math.abs(r.beta[9] - r.shipped9) / r.shipped9 <= 0.25, `${r.beta[9]} vs shipped ${r.shipped9}`);
check('beta: every search already bought multiplies the next by 1.5', r.repeat.every((p, i) => i === 0 || Math.abs(p / r.repeat[0] - 1.5 ** i) < 0.01), JSON.stringify(r.repeat));
check('beta: a treasury of nothing still pays more the further the next champion is', r.poorFar > r.poorNear && r.poorNear > 0, `${r.poorFar} far, ${r.poorNear} near`);
check('beta: a bought search is counted and the next one is dearer', r.live.bought && r.live.counted === 1 && r.live.secondPrice > r.live.firstPrice, JSON.stringify(r.live));
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const failed = checks.filter((pass) => !pass).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed === 0 ? 'PASS: the search costs what it skips' : 'FAIL: the talent search is mispriced');
process.exit(failed === 0 ? 0 : 1);
