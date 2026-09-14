// The court asks before it takes a province, and a refused bribe says so.
//
// Two faults, both invisible from the outside and both about the same lane:
//
//   1. `autoPurchaseVillage` bought adjacent villages on its own — the player's gold, the realm's
//      one claim slot, no card. Now it raises the method sheet for the province it picked, and
//      `autoClaimSilently` (the Build screen's switch) restores the old silence.
//   2. Answering the method sheet with a bribe the nobles refused closed the sheet and said
//      nothing at all: `enqueueAscentPrompt` drops a superseded kind that is "already on screen",
//      and the answered card was still sitting in `pendingAscentPrompt` when the handler asked
//      for it back. The gold was gone and the mode reported a tap that never registered.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-auto-claim.mjs
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
await page.evaluate(() => window.__startBenchGame(20260824, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

/**
 * Runs a stretch of seasons with a player who never takes ground on purpose: every conquest card
 * is declined, every other card answered with its first option. So a bribe order that appears was
 * filed by the autopilot and nobody else.
 *
 * The treasury is topped up each season, and that is not a thumb on the scale — it is the only
 * way to measure this at all. Routine purchases are capped at `AUTO_CLAIM_TREASURY_SHARE` (22%)
 * of the gold in hand, and a run left to itself hovers near zero: measured over 200 unassisted
 * seasons the feature never fired once, in either arm, which would have made this a check that
 * cannot fail.
 *
 * An autopilot-raised sheet is one that is up *after* a tick the player answered nothing during.
 * Headless there are no UI events, so `offerConquestMethods` has exactly one other caller — the
 * `conquer-target` fast path — and that only runs while a card is being answered.
 */
const run = (silently, ticks) => page.evaluate(async ({ silently, ticks }) => {
  const T = await import('/src/systems/ascent/AscentTick.ts');
  const A = await import('/src/systems/ascent/AscentResolver.ts');
  const st = window.__mandateState;
  st.ascent.autoClaimSilently = silently;

  let unprompted = 0;
  let bribes = 0;
  const seen = new Set(st.acquisitionOrders.map((o) => `${o.landId}:${o.method}`));

  for (let i = 0; i < ticks; i += 1) {
    let answered = 0;
    while (st.pendingAscentPrompt && answered < 20) {
      const p = st.pendingAscentPrompt;
      answered += 1;
      // Decline anything that would take ground; answer everything else so the run keeps moving.
      const answer = p.kind === 'conquer-method' ? 'back'
        : p.kind === 'conquer-target' ? 'hold'
        : String(p.options?.[0]?.id ?? p.options?.[0] ?? p.heroIds?.[0] ?? p.cards?.[0]
          ?? p.targets?.[0]?.landId ?? p.projectIds?.[0] ?? 'ok');
      if (!A.resolveAscentPrompt(st, answer)) { st.pendingAscentPrompt = undefined; st.isPaused = false; }
    }
    st.resources.gold = Math.max(st.resources.gold, 3000);
    st.isPaused = false;
    T.advanceAscentTick(st);
    if (answered === 0 && st.pendingAscentPrompt?.kind === 'conquer-method') unprompted += 1;
    for (const o of st.acquisitionOrders) {
      const key = `${o.landId}:${o.method}`;
      if (o.buyerId === 'dai-viet' && o.method === 'bribe' && !seen.has(key)) {
        seen.add(key);
        bribes += 1;
      }
    }
  }
  return { unprompted, bribes, turn: st.turn, lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length };
}, { silently, ticks });

// ── 1. asking is the default ────────────────────────────────────────────────────────────────
const asked = await run(false, 300);
check(asked.bribes === 0, 'no province is bought behind the player', `bribe orders filed: ${asked.bribes}`);
check(asked.unprompted > 0, 'the court raises the method sheet instead', `sheets raised unprompted: ${asked.unprompted}`);

// ── 2. the switch hands routine expansion back ───────────────────────────────────────────────
await page.evaluate(() => window.__startBenchGame(20260824, 'ascent', 'v1'));
await page.waitForTimeout(500);
const silent = await run(true, 300);
check(silent.bribes > 0, 'autoClaimSilently buys as it always did', `bribe orders filed: ${silent.bribes}`);
check(
  silent.unprompted === 0,
  'and asks nothing while it does',
  `sheets raised unprompted: ${silent.unprompted}`,
);

// ── 3. a declined sheet stays declined ───────────────────────────────────────────────────────
const decline = await page.evaluate(async () => {
  const C = await import('/src/systems/ascent/ConquestSystem.ts');
  const P = await import('/src/systems/ascent/AutopilotSystem.ts');
  const A = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  st.ascent.claimDeclinedUntil = 0;
  st.ascent.lastPromptTurn = -99;
  const land = st.lands.find((l) => C.buildAllConquestTargets(st).some((t) => t.landId === l.id));
  const raised = P.proposeClaim(st, land);
  drainAscentPrompts(st);
  const kind = st.pendingAscentPrompt?.kind;
  A.resolveAscentPrompt(st, 'back');
  const until = st.ascent.claimDeclinedUntil;
  // Same tick, same province: the court has been told no.
  st.ascent.lastPromptTurn = -99;
  const again = P.proposeClaim(st, land);
  return { raised, kind, quietFor: until - st.turn, again };
});
check(decline.raised && decline.kind === 'conquer-method', 'proposeClaim raises the existing sheet', decline.kind ?? 'none');
check(decline.again === false, 'and Back stops it coming straight back', `quiet for ${decline.quietFor} seasons`);

// ── 4. a refused bribe is spoken, not swallowed ──────────────────────────────────────────────
const refusal = await page.evaluate(async () => {
  const C = await import('/src/systems/ascent/ConquestSystem.ts');
  const A = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  st.acquisitionOrders = st.acquisitionOrders.filter((o) => o.buyerId !== 'player');
  st.resources.gold = 100000;
  const village = C.buildAllConquestTargets(st).find((t) => t.methods.some((m) => m.method === 'bribe'));
  if (!village) return { err: 'no village on the border' };
  C.offerConquestMethods(st, village.landId);
  drainAscentPrompts(st);
  const goldBefore = st.resources.gold;
  const real = Math.random;
  Math.random = () => 0.999999;               // the 45% the player meets
  const resolved = A.resolveAscentPrompt(st, 'bribe');
  Math.random = real;
  return {
    resolved,
    spent: Math.round(goldBefore - st.resources.gold),
    backKind: st.pendingAscentPrompt?.kind ?? null,
    notice: st.pendingAscentPrompt?.notice ?? null,
    sameLand: st.pendingAscentPrompt?.target?.landId === village.landId,
  };
});
check(!refusal.err, 'a village to bribe was on the border', refusal.err ?? '');
check(refusal.spent > 0, 'the refused bribe really did cost gold', `${refusal.spent} spent`);
check(
  refusal.backKind === 'conquer-method' && refusal.sameLand,
  'the sheet comes back on the same province',
  refusal.backKind ?? 'nothing on screen',
);
check(Boolean(refusal.notice), 'carrying what the nobles said', refusal.notice ?? 'no notice');

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
