// The autopilot asks before it raises a host.
//
// A host used to appear on its own: a commander off a seat, a fifth of the population under
// arms, announced by a toast if at all. Now the muster is a card — who, how many, what it costs,
// where it goes — with three answers. This proves the card is raised instead of the host, that
// each answer does what it says, and that the run-wide switch restores the old silence.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-muster-proposal.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260823, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

/** Runs ticks until a muster card is up (or the autopilot recruited without one). */
const untilCard = (maxTicks) => page.evaluate(async (max) => {
  const T = await import('/src/systems/ascent/AscentTick.ts');
  const A = await import('/src/systems/ascent/AscentResolver.ts');
  const st = window.__mandateState;
  const recruitsBefore = st.ascent.autopilotStats.recruits;
  const ordersBefore = st.recruitmentOrders.length;
  let ticks = 0;
  for (; ticks < max; ticks += 1) {
    // Every other card is answered with its first option so the run keeps moving.
    while (st.pendingAscentPrompt && st.pendingAscentPrompt.kind !== 'muster-proposal') {
      const p = st.pendingAscentPrompt;
      const first = p.options?.[0]?.id ?? p.options?.[0] ?? p.heroIds?.[0] ?? p.cards?.[0] ?? p.targets?.[0]?.landId ?? p.projectIds?.[0] ?? 'ok';
      if (!A.resolveAscentPrompt(st, String(first))) { st.pendingAscentPrompt = undefined; st.isPaused = false; }
    }
    if (st.pendingAscentPrompt?.kind === 'muster-proposal') break;
    st.isPaused = false;
    T.advanceAscentTick(st);
  }
  const p = st.pendingAscentPrompt;
  return {
    ticks, turn: st.turn,
    card: p?.kind === 'muster-proposal' ? { heroId: p.heroId, soldiers: p.plan.soldiers, ticks: p.ticks, purpose: p.purpose, landId: p.landId } : undefined,
    silentRecruits: st.ascent.autopilotStats.recruits - recruitsBefore,
    silentOrders: st.recruitmentOrders.length - ordersBefore,
  };
}, maxTicks);

// ── 1. the card comes instead of the host ───────────────────────────────────────────────────
const first = await untilCard(120);
console.log('  first', JSON.stringify(first));
check(Boolean(first.card) && first.silentRecruits === 0 && first.silentOrders === 0,
  'the autopilot raises a card, not a host', first.card ? `after ${first.ticks} tick(s): ${first.card.soldiers} men, ${first.card.ticks} season(s), ${first.card.purpose}` : 'no card in 120 ticks');

// The card on screen: the headcount and the three answers.
// Two things legitimately sit in front of a card, and the loop above raises both: a siege that
// opened its own lane owns the screen until `refresh` hands it back (one call closes the lane and
// returns, the next draws), and `lastStoryOutcome` — what the previous answer was worth — is shown
// ahead of the next question on purpose. Both are correct. Neither is what this is testing, and
// with a single `refresh` this check passed or failed on which of them the run happened to raise.
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  for (let i = 0; i < 8 && !ui.openPromptKey.startsWith('muster-proposal:'); i += 1) {
    if (window.__mandateState.lastStoryOutcome) ui.dismissStoryOutcome();
    ui.refresh();
  }
});
await page.waitForTimeout(400);
const seen = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const out = [];
  const walk = (o) => { if (o.type === 'Text') out.push(o.text); if (o.list) o.list.forEach(walk); };
  walk(ui.modalLayer);
  return out;
});
const showsCount = seen.some((s) => s === String(first.card?.soldiers));
const answers = ['Raise it|Chuẩn y', 'Adjust|Chỉnh lại', 'Not now|Chưa cần'].map((pair) => seen.some((s) => new RegExp(`^(${pair})$`).test(s)));
check(showsCount && answers.every(Boolean), 'the card prints the headcount and offers raise / adjust / not now',
  `count ${showsCount}, answers ${answers.join('/')}`);

// ── 2. not now: silence for MUSTER_DECLINE_TICKS ────────────────────────────────────────────
const declined = await page.evaluate(async () => {
  const A = await import('/src/systems/ascent/AscentResolver.ts');
  const C = await import('/src/game/ascentConfig.ts');
  const st = window.__mandateState;
  const ok = A.resolveAscentPrompt(st, 'decline');
  return { ok, until: st.ascent.musterDeclinedUntil, turn: st.turn, want: C.MUSTER_DECLINE_TICKS };
});
const quiet = await untilCard(declined.want - 2);
check(declined.ok && declined.until === declined.turn + declined.want && !quiet.card && quiet.silentRecruits === 0,
  'declining keeps the autopilot quiet — no card and no host for the cooldown',
  `silent until turn ${declined.until}; ${quiet.ticks} tick(s) later: card ${Boolean(quiet.card)}, recruits ${quiet.silentRecruits}`);

// ── 3. accept: exactly the host on the card ─────────────────────────────────────────────────
await page.evaluate(() => { window.__mandateState.ascent.musterDeclinedUntil = 0; });
// 160, not 60. The trigger is "fewer hosts than its provinces warrant", so every host this script
// raises pushes the next card further out — measured, the first card lands around tick 50 and the
// third took past 60 often enough to fail one run in three on the budget alone.
const second = await untilCard(160);
const accepted = await page.evaluate(async () => {
  const A = await import('/src/systems/ascent/AscentResolver.ts');
  const st = window.__mandateState;
  const p = st.pendingAscentPrompt;
  if (p?.kind !== 'muster-proposal') return { noCard: true };
  const plan = p.plan;
  const ok = A.resolveAscentPrompt(st, 'accept');
  const order = st.recruitmentOrders.find((o) => o.heroId === plan.heroId);
  return { ok, plan: plan.soldiers, order: order && { soldiers: order.soldiers ?? order.total ?? order.count, heroId: order.heroId }, recruits: st.ascent.autopilotStats.recruits };
});
console.log('  accept', JSON.stringify(accepted));
check(Boolean(second.card) && accepted.ok && Boolean(accepted.order),
  'accepting musters the host on the card, under its commander',
  second.card ? JSON.stringify(accepted) : `no second card in ${second.ticks} tick(s)`);

// ── 4. adjust: the plan reaches the raise form ──────────────────────────────────────────────
await page.evaluate(() => { const st = window.__mandateState; st.recruitmentOrders = []; st.ascent.musterDeclinedUntil = 0; });
const third = await untilCard(160);
const adjusted = await page.evaluate(async () => {
  const st = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const p = st.pendingAscentPrompt;
  if (p?.kind !== 'muster-proposal') return { noCard: true };
  const soldiers = p.plan.soldiers;
  ui.refresh();
  // The same path the Adjust card takes.
  ui.musterHandover = { ...p.plan, orders: { ...p.plan.orders } };
  ui.choose('adjust');
  ui.openLane('army');
  const out = [];
  const walk = (o) => { if (o.type === 'Text') out.push(o.text); if (o.list) o.list.forEach(walk); };
  walk(ui.modalLayer);
  return { soldiers, lane: ui.openPromptKey, draft: ui.musterDraft?.soldiers, prompt: st.pendingAscentPrompt?.kind ?? '', texts: out.slice(0, 8) };
});
console.log('  adjust', JSON.stringify(adjusted));
check(Boolean(third.card) && adjusted.lane === 'lane:army' && adjusted.draft === adjusted.soldiers && adjusted.prompt === '',
  'adjusting closes the card and opens the raise form with the plan filled in',
  third.card ? JSON.stringify({ lane: adjusted.lane, draft: adjusted.draft, soldiers: adjusted.soldiers }) : `no third card in ${third.ticks} tick(s)`);
await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').closeLane());

// ── 5. the switch: left to the general, it musters without asking ──────────────────────────
await page.evaluate(() => { const st = window.__mandateState; st.recruitmentOrders = []; st.ascent.musterDeclinedUntil = 0; st.ascent.autoMusterSilently = true; });
const silent = await untilCard(60);
check(!silent.card && (silent.silentRecruits > 0 || silent.silentOrders > 0),
  'with musters left to the general, the host is raised without a card',
  `recruits ${silent.silentRecruits}, orders ${silent.silentOrders}, card ${Boolean(silent.card)}`);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the muster is not being asked about');
