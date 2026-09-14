/**
 * A new player meets the mode inside the first three minutes.
 *
 * Dragon Ascent is a roguelite, and the thing a roguelite is *for* is picking powers. A review
 * asked for the obvious promise — a power draft inside the opening minutes — and the measurement
 * said no: across three seeds a new player reached level 3 holding two unspent drafts and had
 * been offered neither after three minutes at the wheel. The draft was ranked seventh in the
 * decision director's order and aged at `KIND_STARVATION_TICKS`, eighteen seasons, so the realm's
 * own business took every slot. It is the one kind in that list which is not the game asking for
 * something but the game owing something, and it now ages at four (`KIND_STARVATION_OVERRIDE`).
 *
 * Two halves, because the promise has two clocks:
 *
 *   · **The player's clock**, rendered, one seed, wall time from page load — with a real reading
 *     delay per card, because every card stops the world and answering instantly would measure
 *     a game nobody plays.
 *   · **The realm's clock**, headless, six seeds — how many seasons a banked level-up waits
 *     before the card that spends it is offered. That is the contract the fix actually made, and
 *     it is the one a future reordering of `CONSIDER_ORDER` would silently break.
 *
 * `playtest/playtest-first-minutes.mjs` is the full timeline this was cut down from.
 *
 * Usage: node test_scripts/verify/verify-first-minutes.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const SEED = 424242;
const WINDOW_MS = 180000;
const READ_MS = 5000;
/** Seasons a reward the player has already earned may sit unoffered. */
const DRAFT_WAIT_TICKS = 8;

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const OPTIONS = `
window.__fmOptions = (p) => {
  switch (p.kind) {
    case 'founder': case 'mandate': case 'doctrine': return p.options;
    case 'power-draft': return [...p.cards, 'skip'];
    case 'conquer-target': return [...p.targets.filter((t) => t.methods.some((m) => !m.blockedReason)).map((t) => t.landId), 'hold'];
    case 'conquer-method': return p.notice
      ? ['back']
      : [...p.target.methods.filter((m) => !m.blockedReason).map((m) => m.method), 'back'];
    case 'hero-choice': return [...p.heroIds, 'pass'];
    case 'court-appointment': return p.options.filter((o) => !o.blockedReason).map((o) => o.id);
    case 'law-choice': return [...p.projectIds.map((i) => 'edict:' + i), ...p.taxOptions.map((t) => 'tax:' + t), 'hold'];
    case 'muster-proposal': return ['accept', 'adjust', 'decline'];
    case 'decree-offer': return [...p.projectIds, 'decline'];
    case 'empire-response': return p.options.map((o) => o.id);
    // The province card (the opening's setup card is one): the focus row first, then the posting,
    // then leave-it. It fell through to ['ok'], which the resolver refuses, and the card stood for
    // the rest of the window — the setup card now lands at about season 7, ahead of the draft.
    case 'province-order': return p.options.map((o) => o.id);
    case 'envoy': case 'famine': case 'rival-demand': case 'story-beat': case 'world-event':
      return (p.options ?? []).filter((o) => o.affordable !== false).map((o) => o.id);
    default: return ['ok'];
  }
};
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 140)}`); });

// ── The player's clock ───────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const at = () => (Date.now() - t0) / 1000;
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });
await page.evaluate((seed) => window.__startBenchGame(seed, 'ascent', 'v1'), SEED);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 40000 });
await page.evaluate(OPTIONS);
await page.evaluate(async () => { window.__fmRes = await import('/src/systems/ascent/AscentResolver.ts'); });

const marks = {};
const mark = (name) => { if (marks[name] === undefined) marks[name] = at(); };
let showing = null;
let shownAt = 0;
let firstCardPressable = 0;
const kinds = [];

while (Date.now() - t0 < WINDOW_MS && marks['power draft'] === undefined) {
  const now = await page.evaluate(() => {
    const st = window.__mandateState;
    // Vite watches the whole repository, so writing any file while this runs full-reloads the
    // page and the run is gone. Named here rather than surfacing as a TypeError three frames on.
    if (!st) return { gone: true };
    const p = st.pendingAscentPrompt;
    return {
      kind: p?.kind ?? null,
      pressable: p ? (window.__fmOptions(p) ?? []).length : 0,
      levelUps: st.ascent?.pendingLevelUps ?? 0,
      turn: st.turn,
      defeated: st.isDefeated,
    };
  });
  if (now.gone) { errors.push('the page reloaded mid-run — rerun with nothing writing to the repo'); break; }
  if (now.defeated) break;
  if (now.kind && now.kind !== showing) {
    showing = now.kind;
    shownAt = Date.now();
    kinds.push(now.kind);
    // The Coronation is measured differently, and only here.
    //
    // This check exists to catch a first card whose only control is "Continue". The rite is the
    // opposite of that — it is the widest choice in the game — but it carries **no option ids**,
    // because the four steps write the founder into the dynasty store themselves rather than
    // asking the systems to pick between things they know about. Counting its option map would
    // score a wardrobe as a confirmation dialog. What the check is about is the first card the
    // player is asked to *answer*, so the rite is stepped over and the mandate is measured.
    // The Inheritance card is a summary with one button, by design (see `createAscentGameState`);
    // like the rite it is stepped over, and the mandate is the first card that is *asked*.
    if (firstCardPressable === 0 && now.kind !== 'coronation' && now.kind !== 'inheritance') firstCardPressable = now.pressable;
    mark('first card');
    if (now.kind === 'power-draft') mark('power draft');
  }
  const think = showing === 'founder' ? READ_MS * 2 : READ_MS;
  if (showing && showing !== 'run-over' && Date.now() - shownAt >= think) {
    await page.evaluate(() => {
      const st = window.__mandateState;
      const p = st.pendingAscentPrompt;
      if (!p) return;
      if (!window.__fmRes.resolveAscentPrompt(st, (window.__fmOptions(p) ?? [])[0])) {
        st.pendingAscentPrompt = undefined;
      }
      window.__phaserGame.scene.getScene('ConquestScene')?.refresh?.();
    });
    showing = null;
  }
  await page.waitForTimeout(250);
}

check('the game asks the player something inside half a minute',
  marks['first card'] !== undefined && marks['first card'] <= 30,
  marks['first card'] !== undefined ? `${marks['first card'].toFixed(1)}s (${kinds[0]})` : 'no card in the window');
const firstAnswerable = kinds.find((kind) => kind !== 'coronation');
check('the first card is a choice, not a confirmation', firstCardPressable > 1,
  `${firstCardPressable} pressable on the ${firstAnswerable} card`);
check('a power draft is offered inside three minutes',
  marks['power draft'] !== undefined && marks['power draft'] <= WINDOW_MS / 1000,
  marks['power draft'] !== undefined
    ? `${marks['power draft'].toFixed(1)}s, after ${kinds.indexOf('power-draft')} other cards`
    : `never — ${kinds.length} cards in ${WINDOW_MS / 1000}s: ${kinds.join(', ')}`);

// ── The realm's clock ────────────────────────────────────────────────────────────────────────
const sweep = await page.evaluate(async ({ seeds, cap }) => {
  const GS = await import('/src/state/GameState.ts');
  const TICK = await import('/src/systems/ascent/AscentTick.ts');
  const RES = await import('/src/systems/ascent/AscentResolver.ts');
  const rows = [];
  for (const seed of seeds) {
    let g = seed >>> 0;
    Math.random = () => { g = (g + 0x6d2b79f5) | 0; let t = Math.imul(g ^ (g >>> 15), 1 | g);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = GS.createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    let bankedAt = null;
    let offeredAt = null;
    for (let tick = 0; tick < 60 && offeredAt === null; tick += 1) {
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) {
        const p = st.pendingAscentPrompt;
        if (p.kind === 'run-over') break;
        if (p.kind === 'power-draft' && bankedAt !== null && offeredAt === null) offeredAt = st.turn;
        if (!RES.resolveAscentPrompt(st, (window.__fmOptions(p) ?? [])[0])) st.pendingAscentPrompt = undefined;
      }
      if (bankedAt === null && (st.ascent?.pendingLevelUps ?? 0) > 0) bankedAt = st.turn;
      if (st.isDefeated) break;
      TICK.advanceAscentTick(st);
    }
    rows.push({ seed, bankedAt, offeredAt, waited: bankedAt !== null && offeredAt !== null ? offeredAt - bankedAt : null });
  }
  return { rows, cap };
}, { seeds: [424242, 20260901, 88881, 7, 31337, 1337], cap: DRAFT_WAIT_TICKS });

const banked = sweep.rows.filter((r) => r.bankedAt !== null);
const served = banked.filter((r) => r.waited !== null && r.waited <= DRAFT_WAIT_TICKS);
check('every run banks a level-up in its opening seasons', banked.length === sweep.rows.length,
  `${banked.length}/${sweep.rows.length} seeds, earliest turn ${Math.min(...banked.map((r) => r.bankedAt))}`);
check(`an earned draft is offered within ${DRAFT_WAIT_TICKS} seasons of being banked`,
  served.length === banked.length,
  sweep.rows.map((r) => `${r.seed}:${r.bankedAt ?? '-'}→${r.offeredAt ?? 'never'}`).join('  '));

check('no browser errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

await browser.close();
const passed = checks.filter((c) => c.pass).length;
console.log(`\n${passed}/${checks.length} first-minutes checks passed`);
if (passed !== checks.length) process.exitCode = 1;
