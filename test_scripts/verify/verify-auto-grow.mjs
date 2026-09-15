/**
 * Tự phát triển — provinces that build by themselves (provinceAutoGrow, v2).
 *
 * Reported 2026-09-15: a province should be able to grow by itself, slower and less wisely without a
 * governor; automatic on mobile, a choice on desktop. Measured before: a mobile reign's realm-wide
 * autopilot grew every province alike whether governed or not, and a hands-on (desktop) reign built
 * nothing at all on its own.
 *
 * What this proves, on constructed runs driven by the autopilot and the build clock alone:
 *   1. v1 is untouched: no switch, no per-province growth
 *   2. hands-on (desktop): a province never switched files nothing; switched on, it builds
 *   3. mobile default: every province grows, and one switched off files nothing of its own
 *   4. a governed province files more of its own orders than an ungoverned one, and faster
 *   5. an ungoverned order takes longer and waits its rest; orders are marked as the province's own
 *
 * Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-auto-grow.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`CONSOLE: ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 60000 });

const out = await page.evaluate(async () => {
  const seedRandom = (n) => {
    let s = n >>> 0;
    const real = Math.random;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return () => { Math.random = real; };
  };
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const RS = await import('/src/systems/ResourceSystem.ts');
  const AP = await import('/src/systems/ascent/AutopilotSystem.ts');
  const AG = await import('/src/systems/ascent/ProvinceAutoGrow.ts');
  const HS = await import('/src/systems/heroes/HeroService.ts');
  const { PLAYER_KINGDOM_ID: P } = await import('/src/game/constants.ts');

  const make = (ruleset, { hardcore = false } = {}) => {
    const restore = seedRandom(4242);
    const config = { seaSides: 1, difficulty: 'normal' };
    if (ruleset !== 'v1') config.ruleset = ruleset;
    const st = createAscentGameState(config);
    restore();
    st.ascent.hardcore = hardcore;
    st.pendingAscentPrompt = undefined;
    st.ascent.promptQueue = [];
    return st;
  };
  // Seasons of the autopilot and the build clock, with a treasury that never gates anything.
  const run = (st, seasons, onSeason) => {
    const own = {};
    for (let i = 0; i < seasons; i += 1) {
      st.resources.gold = 50000; st.resources.food = 5000; st.resources.supplies = 5000; st.resources.humans = Math.max(st.resources.humans, 2000);
      RS.refreshAllLandOutputs(st);
      const before = new Set(st.buildOrders);
      AP.tickAscentAutopilot(st);
      for (const order of st.buildOrders) if (!before.has(order) && order.auto) (own[order.landId] ??= []).push({ turn: st.turn, required: order.required });
      onSeason?.(st);
      RS.progressBuildOrders(st);
      st.turn += 1;
      st.pendingAscentPrompt = undefined;
      st.ascent.promptQueue = [];
    }
    return own;
  };
  const levels = (land) => land.buildings.reduce((sum, b) => sum + b.level, 0);
  const r = {};

  // 1 · v1
  {
    const st = make('v1', { hardcore: true });
    const cap = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    r.v1 = { active: AG.autoGrowActive(st), grows: AG.landAutoGrows(st, cap), set: AG.setLandAutoGrow(st, cap.id, true), field: cap.autoGrow };
  }

  // 2 · hands-on
  {
    const st = make('v2', { hardcore: true });
    const cap = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    const before = levels(cap);
    const idle = run(st, 12);
    const idleLevels = levels(cap);
    AG.setLandAutoGrow(st, cap.id, true);
    const grew = run(st, 30);
    r.handsOn = { defaultOn: AG.autoGrowDefault(st), idleOrders: (idle[cap.id] ?? []).length, idleGrew: idleLevels - before, orders: (grew[cap.id] ?? []).length, grew: levels(cap) - idleLevels };
  }

  // 3 · mobile default, one province switched off
  {
    const st = make('v2');
    const cap = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    const other = cap.neighbors.map((id) => st.lands.find((l) => l.id === id)).find((l) => l && l.ownerId !== P && l.type !== 'enemyCastle');
    other.ownerId = P; other.loyalty = 100;
    AG.setLandAutoGrow(st, other.id, false);
    const own = run(st, 30);
    r.mobile = { capOn: AG.landAutoGrows(st, cap), otherOn: AG.landAutoGrows(st, other), capOrders: (own[cap.id] ?? []).length, otherOrders: (own[other.id] ?? []).length };
  }

  // 4/5 · governed vs ungoverned, the same capital on the same seed
  const paced = (governed) => {
    const st = make('v2', { hardcore: true });
    const cap = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    for (const hero of st.heroes) if (hero.assignedTo === cap.id) hero.assignedTo = undefined;
    if (governed) {
      const hero = st.heroDeck[0];
      st.heroDeck = st.heroDeck.slice(1);
      st.heroes.push(hero);
      HS.initializeRecruitedHero(st, hero);
      hero.assignedTo = cap.id;
    }
    AG.setLandAutoGrow(st, cap.id, true);
    const start = levels(cap);
    const own = run(st, 40);
    const orders = own[cap.id] ?? [];
    return { orders: orders.length, grew: levels(cap) - start, firstGap: orders.length > 1 ? orders[1].turn - orders[0].turn : null, firstRequired: orders[0]?.required ?? null, pace: AG.autoGrowPace(st, cap) };
  };
  r.governed = paced(true);
  r.ungoverned = paced(false);
  return r;
});

const checks = [];
const check = (label, pass, detail = '') => { checks.push(pass); console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`); };

console.log('\n=== 1 · v1 ===');
check('v1 has no per-province growth and ignores the switch', out.v1.active === false && out.v1.grows === false && out.v1.set === false && out.v1.field === undefined, JSON.stringify(out.v1));
console.log('\n=== 2 · HANDS-ON (desktop) ===');
check('a hands-on reign defaults provinces off', out.handsOn.defaultOn === false);
check('an unswitched province files nothing of its own', out.handsOn.idleOrders === 0 && out.handsOn.idleGrew === 0, JSON.stringify(out.handsOn));
check('switched on, it builds by itself', out.handsOn.orders >= 2 && out.handsOn.grew >= 2, `${out.handsOn.orders} orders, +${out.handsOn.grew} levels`);
console.log('\n=== 3 · MOBILE DEFAULT ===');
check('provinces grow by default', out.mobile.capOn === true && out.mobile.capOrders >= 2, JSON.stringify(out.mobile));
check('a province switched off files nothing of its own', out.mobile.otherOn === false && out.mobile.otherOrders === 0);
console.log('\n=== 4/5 · THE GOVERNOR ===');
check('a governed province files more of its own orders', out.governed.orders > out.ungoverned.orders, `governed ${out.governed.orders} vs ungoverned ${out.ungoverned.orders}`);
check('and grows more levels', out.governed.grew > out.ungoverned.grew, `+${out.governed.grew} vs +${out.ungoverned.grew}`);
check('an ungoverned province rests between works and builds slower', out.ungoverned.pace.gap > out.governed.pace.gap && out.ungoverned.pace.ticksMult > 1 && (out.ungoverned.firstGap ?? 99) > (out.governed.firstGap ?? 0), JSON.stringify({ g: out.governed, u: out.ungoverned }));
console.log('\n=== ERRORS ===');
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((p) => !p).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(failed ? 'FAIL: provinces do not grow the way the switch promises' : 'PASS: provinces grow by themselves, better with a governor');
process.exit(failed ? 1 : 0);
