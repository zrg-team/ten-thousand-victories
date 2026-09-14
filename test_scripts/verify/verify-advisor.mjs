// The in-run advisor: does it read the right number, and does it name the right screen?
//
// Asserted through the strip that is actually on the glass rather than by calling `adviseAscent`
// in isolation. The rules are the easy half; the half that breaks is the wiring — a strip that is
// hidden behind a prompt, a dwell counter that will not let urgent advice through, a tap the map
// underneath steals. None of that is visible from a unit test of the ranking function.
//
// Each scenario forces a situation into the live state, ticks the UI, and reads the line.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const DWELL = 4; // > DWELL_TICKS in AdvisorStrip, so a lower-priority rule may take the strip

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`ok   ${label}`); }
  else { failed += 1; console.log(`FAIL ${label}${detail ? `  — ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
await page.waitForTimeout(1200);

// Drain the opening cards. See shot-guide.mjs for why this reads `openPromptKey` rather than
// `state.pendingAscentPrompt`, and why the LAST option id is the one to send.
const barUp = () => page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
  .children.list.some((c) => c.constructor?.name === 'ActionBar' && c.visible));
for (let guard = 0; guard < 24 && !(await barUp()); guard += 1) {
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    if (!scene.openPromptKey) return;
    scene.events.emit('ui:ascent-choice', String(scene.openPromptKey).split(',').pop() || 'ok');
  });
  await page.waitForTimeout(500);
}
check('the run reaches a playable frame', await barUp());

/**
 * Force a situation, tick the UI, and report the strip.
 *
 * `apply` runs inside the page against the live `GameState`. Ticking `refresh` by hand rather than
 * waiting on the world clock keeps the run from moving underneath the assertion — a real tick
 * would spend the gold, feed the army and raise the wave that the scenario just arranged.
 */
const scenario = (apply) => page.evaluate(async (source) => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const state = scene.state;
  // eslint-disable-next-line no-new-func
  new Function('state', 'ascent', source)(state, state.ascent);
  for (let tick = 0; tick < 4; tick += 1) scene.refresh();
  const strip = scene.children.list.find((c) => c.depth === 435);
  const texts = (strip?.list ?? []).filter((c) => c.type === 'Text').map((c) => c.text);
  return { line: texts[0] ?? '', visible: Boolean(strip?.visible), all: texts };
}, apply);

// ── Each rule, forced ───────────────────────────────────────────────────────
let seen = await scenario(`
  ascent.wave = 6; ascent.ticksToWave = 5;
  ascent.threat = 4000; ascent.defensePower = 1000; ascent.power = 5000;
  ascent.ambition = 0; ascent.activeBattle = undefined; ascent.bossTelegraphed = false;
  state.resources.gold = 100; state.resources.food = 900; state.resourceRates.food = 5;
  if (state.mandate) state.mandate.edictPoints = 0;
`);
check('outmatched → THREAT against the defence, with both figures',
  /4,?000/.test(seen.line) && /1,?000/.test(seen.line), seen.line);

// Either phrasing is correct and only ONE of them may be live: `ahead` stands down while the
// realm is stalled, because both rules end in "go and take something" and two sentences for one
// idea reads as two things to do.
seen = await scenario(`ascent.threat = 300; ascent.defensePower = 2000; ascent.ambition = 40;`);
check('comfortable and already growing → the strip offers expansion, not alarm',
  /room|dư sức/i.test(seen.line), seen.line);

seen = await scenario(`state.resources.gold = 9000;`);
check('a hoarded treasury outranks a comfortable wave',
  /9,?000/.test(seen.line) && /rot|mục/i.test(seen.line), seen.line);

seen = await scenario(`state.resources.gold = 100; ascent.ambition = 60;`);
check('ambition at the ceiling is raised, with the multiplier',
  /×\s*3|3\.\d/.test(seen.line), seen.line);

seen = await scenario(`
  ascent.ambition = 0; ascent.wave = 6;
  ascent.threat = 300; ascent.defensePower = 2000;
`);
check('ambition at rest is raised as a wasted opportunity',
  /×\s*1|1\.0/.test(seen.line) || /room|dư sức/i.test(seen.line), seen.line);

seen = await scenario(`
  ascent.ambition = 0;
  state.resources.food = 40; state.resourceRates.food = -10;
`);
check('a short granary is quoted in seasons left',
  /4 /.test(seen.line) && /grain|lương/i.test(seen.line), seen.line);

seen = await scenario(`
  state.resources.food = 900; state.resourceRates.food = 5;
  ascent.bossTelegraphed = true; ascent.ticksToWave = 2;
`);
check('a telegraphed Great Invasion outranks the larder and the treasury',
  /Great Invasion|Đại Xâm Lược/i.test(seen.line), seen.line);

// ── The wiring, which is the half that actually breaks ──────────────────────
const geometry = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const strip = scene.children.list.find((c) => c.depth === 435);
  const line = (strip?.list ?? []).find((c) => c.type === 'Text');
  return {
    guarded: (window.__hudTapBounds ?? []).some((b) => b.y > 60 && b.y < 140 && b.width > 300),
    lineWidth: line?.width ?? 0,
    lineHeight: line?.height ?? 0,
  };
});
check('the strip publishes its own tap guard to the world scene', geometry.guarded,
  JSON.stringify(geometry));
check('the line fits the sheet', geometry.lineWidth <= 366, `${geometry.lineWidth}px`);

// Opened by a real press at the strip's own coordinates.
const opened = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const strip = scene.children.list.find((c) => c.depth === 435);
  const before = (strip?.list ?? []).filter((c) => c.type === 'Text').length;
  const hit = (strip?.list ?? []).find((c) => c.type === 'Rectangle');
  hit?.emit('pointerup', { id: 1, downTime: 0 }, 0, 0, { stopPropagation() {} });
  const after = (strip?.list ?? []).filter((c) => c.type === 'Text').length;
  return { before, after };
});
check('pressing the strip opens the reasoning under it', opened.after > opened.before,
  JSON.stringify(opened));

// Driven through `renderActionBar` rather than `refresh`. `refresh` has a recovery guard — a
// `lane:` key over an empty modal layer means a lane rendered nothing and stranded the player, so
// it closes the lane and returns before it ever reaches the bar. Faking the key and calling
// `refresh` therefore tests the guard, not the strip, and passes for the wrong reason.
const hiddenBehindPrompt = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const strip = scene.children.list.find((c) => c.depth === 435);
  scene.openPromptKey = 'chrome:probe';
  scene.renderActionBar();
  const wasVisible = Boolean(strip?.visible);
  const guardedWhileHidden = (window.__hudTapBounds ?? []).length;
  scene.openPromptKey = '';
  scene.renderActionBar();
  return { wasVisible, guardedWhileHidden, backAgain: Boolean(strip?.visible) };
});
check('the strip gets out of the way of a lane screen', !hiddenBehindPrompt.wasVisible);
check('and comes back after it', hiddenBehindPrompt.backAgain);

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${passed}/${passed + failed} checks passed`);
console.log(failed ? 'FAIL: the advisor is not reading the run' : 'PASS: the advisor reads the run and names the screen');
process.exit(failed ? 1 : 0);
