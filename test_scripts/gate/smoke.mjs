/**
 * The cheapest gate that can still fail honestly.
 *
 * A typecheck proves nothing about this game — almost every regression here compiles perfectly and
 * then throws on boot, renders an empty screen, or leaves a mode unreachable. This boots each mode
 * in a real browser, ticks it, and asserts the three things that must never break: the page loads
 * without console errors, every mode reaches its scene with live state (for the Skirmish, a built
 * setup sheet), and the drawn frame is not blank.
 *
 * ~45s for the two shipped modes and the three shelved ones. Run it before claiming a change
 * works.
 *
 *   node test_scripts/gate/smoke.mjs
 *   node test_scripts/gate/smoke.mjs --modes ascent,arena --shots     # only what ships
 *   DEV_URL=http://127.0.0.1:5199 node test_scripts/gate/smoke.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
/**
 * What ships first, then the shelf.
 *
 * `ascent` and `arena` are the two modes the menu offers. `empire`, `campaign` and `rival` are
 * built but not on any page — `MenuScene.renderClassic` lists one card — so they are booted here
 * only as a second door onto shared code (MapScene, the economy, the conquest UI), and are
 * labelled `[shelf]` in the output. A green line for one of them is not evidence about anything a
 * player can reach: a 2026-09-04 playtest read this gate's four green modes as four live modes.
 */
const SHELVED = new Set(['empire', 'campaign', 'rival']);
const MODES = argOf('--modes', 'ascent,arena,empire,campaign,rival').split(',').map((m) => m.trim());
const SEED = Number(argOf('--seed', 1337));
const WANT_SHOTS = process.argv.includes('--shots');
const OUT = 'output/smoke';

/** `ascent` runs in ConquestScene, the Skirmish in its own setup scene, the shelf in MapScene. */
const sceneFor = (mode) => {
  if (mode === 'ascent') return 'ConquestScene';
  if (mode === 'arena') return 'BattleArenaScene';
  return 'MapScene';
};
const modeLabel = (mode) => (SHELVED.has(mode) ? `${mode} [shelf]` : mode);

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass, detail });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 200)}`); });

console.log(`=== SMOKE — ${URL} — seed ${SEED} ===`);

let booted = false;
try {
  // `capture=1` retains the WebGL drawing buffer; without it every screenshot below is blank.
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
    null,
    { timeout: 30000 },
  );
  booted = true;
} catch (err) {
  errors.push(`BOOT: ${err.message.split('\n')[0]}`);
}
check('the page boots to MenuScene', booted, booted ? '' : `is a dev server up at ${URL}?`);

if (booted) {
  const menu = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  check('the menu reports itself', menu.mode === 'menu', `mode=${menu.mode} theme=${menu.mapTheme} lang=${menu.language}`);
}

if (WANT_SHOTS) mkdirSync(OUT, { recursive: true });

const summary = {};

for (const mode of booted ? MODES : []) {
  const scene = sceneFor(mode);
  const before = errors.length;
  let reached = false;

  try {
    await page.evaluate(([m, s]) => window.__startBenchGame(s, m, 'v1'), [mode, SEED]);
    await page.waitForFunction((s) => window.__phaserGame.scene.isActive(s), scene, { timeout: 30000 });
    await page.waitForTimeout(900);
    reached = true;
  } catch (err) {
    errors.push(`${mode}: ${err.message.split('\n')[0]}`);
  }
  check(`${modeLabel(mode)} reaches ${scene}`, reached);
  if (!reached) continue;

  if (mode === 'arena') {
    // The Skirmish holds no GameState — both hosts live on its own dials until "Take command"
    // hands the fight to ConquestScene — so "live state" here means the setup sheet built its
    // controls rather than that a world is ticking.
    const arena = await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('BattleArenaScene');
      // Walked, not counted at the top level: every dial on this sheet lives inside a container,
      // so a shallow filter reports 0 interactive on a screen that is nothing but controls.
      const count = (list) => (list ?? []).reduce((n, c) => n + 1 + (c.list ? count(c.list) : 0), 0);
      const hot = (list) => (list ?? []).reduce((n, c) => n + (c.input ? 1 : 0) + (c.list ? hot(c.list) : 0), 0);
      return { objects: count(s?.children?.list), interactive: hot(s?.children?.list) };
    });
    check(`${mode} draws its setup sheet`, arena.objects > 20, `${arena.objects} objects, ${arena.interactive} interactive at the top level`);
    summary[mode] = { objects: arena.objects, newErrors: errors.length - before };
  } else {
    // Two economy ticks' worth of time. The tick threshold is 5500ms (3500 in ascent), so this is
    // enough to prove the loop advances rather than just that the scene painted once.
    const snap = await page.evaluate(() => {
      window.advanceTime(12000);
      const raw = window.render_game_to_text();
      const st = window.__mandateState
        ?? window.__phaserGame.scene.getScene('ConquestScene')?.state
        ?? window.__phaserGame.scene.getScene('MapScene')?.state;
      return { text: raw, turn: st?.turn ?? null, lands: st?.lands?.length ?? 0, armies: st?.armies?.length ?? 0 };
    });
    const parsed = JSON.parse(snap.text);
    check(`${modeLabel(mode)} has live state`, parsed.mode !== 'menu' && parsed.mode !== 'loading' && snap.lands > 0,
      `mode=${parsed.mode} lands=${snap.lands} armies=${snap.armies} turn=${snap.turn}`);
    summary[mode] = { turn: snap.turn, lands: snap.lands, armies: snap.armies, newErrors: errors.length - before };
  }

  // A frame that is one flat colour is the classic "renderer threw, background remains" failure.
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 844 } });
  const distinct = new Set();
  for (let i = 0; i < shot.length - 3; i += 997) distinct.add(shot.readUInt32BE(i));
  check(`${modeLabel(mode)} draws a non-blank frame`, distinct.size > 24, `${distinct.size} distinct samples`);

  if (WANT_SHOTS) {
    writeFileSync(`${OUT}/${mode}.png`, shot);
    console.log(`     → ${OUT}/${mode}.png`);
  }
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

console.log('\n=== STATE FINGERPRINT ===');
console.log(JSON.stringify(summary, null, 2));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the game boots, both shipped modes run, the shelf still boots, nothing errors'
  : 'FAIL: smoke test broke');
process.exit(failed.length === 0 ? 0 : 1);
