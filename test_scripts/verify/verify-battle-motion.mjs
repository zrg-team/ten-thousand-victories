// Does the army on the battle screen move, or does it jump and then stand still?
//
// The complaint was "teleport teleport when moving", and it was exactly right: `slideMarkers`
// tweened a host over `BATTLE_TICK_MS * 0.45` and the beat is `BATTLE_TICK_MS`, so a column
// crossed its ground in a quarter of a second and then held perfectly still for the remaining
// three tenths. Every beat. Nothing measured it, because "is it smooth" is not a thing a
// state-reading harness can see.
//
// So this one samples the marker's real screen position off the render loop and reports the share
// of frames in which it moved at all, plus the largest single jump between consecutive frames.
// A tween that fills the beat moves on nearly every frame in small steps; a tween that fills half
// of it is still for half the samples, whatever the tween graph says.
//
// Usage: node test_scripts/verify/verify-battle-motion.mjs      (DEV_URL to point elsewhere)
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const SEED = Number(process.env.SEED ?? 20260812);
// One economy tick's worth of beats and no more. `drainBattleBeat` takes *two* per interval once
// the queue is longer than a tick's worth — it would rather skip than fall further behind — and a
// double step is not the cadence a player watching a live fight sees. Sampled just short of the
// time those beats take to drain, so the window never includes the dead air after the queue runs
// out, which is the harness stopping rather than the screen.
const QUEUE_BEATS = 6;
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 3000);

// Headed by default, and that is not a convenience. Headless Chromium rasterises in software and
// runs this scene at about ten frames a second; a 560 ms tween then has six samples in it and
// "did it move this frame" measures the harness rather than the screen. Set HEADLESS=1 if the
// machine has no display — the travel and the still-time still mean something, the per-frame
// share does not.
const headless = process.env.HEADLESS === '1';
const browser = await chromium.launch({ headless });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// A headed window fetches its own favicon and the dev server has none; that 404 is not the game
// failing, and a check that reports it is a check nobody will read twice.
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
});

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
// MenuScene must be up first: PreloadScene starts it, and a MenuScene that boots *after* the
// bench bootstrap wipes `window.__mandateState` in its own create().
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate((s) => window.__startBenchGame(s, 'ascent', 'v1'), SEED);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene') && !!window.__mandateState,
  null, { timeout: 30000 });
await page.waitForTimeout(800);

const FIRST = `(p) => { const o = p.options ?? [];
  switch (p.kind) {
    case 'founder': return p.options[0];
    case 'power-draft': return p.cards?.[0] ?? 'skip';
    case 'conquer-target': return p.targets?.[0]?.landId ?? 'hold';
    case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
    case 'hero-choice': return p.heroIds?.[0] ?? 'pass';
    case 'court-appointment': return p.options[0].id;
    case 'law-choice': return p.projectIds?.[0] ? 'edict:' + p.projectIds[0] : 'hold';
    case 'parliament': return 'decline';
    default: return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
  } }`;

const opened = await page.evaluate(async ([src, beats]) => {
  const st = window.__mandateState;
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  // eslint-disable-next-line no-eval
  const first = eval(src);
  for (let tick = 0; tick < 200 && !st.ascent.activeBattle; tick += 1) {
    advanceAscentTick(st);
    world.refresh();
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 12) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
    ui.events.emit('state-changed');
  }
  if (!st.ascent.activeBattle) return null;
  // A tap does two things: it lifts the opening hold on the scene and it gives the order. The
  // fight does not advance until the hold is lifted.
  ui.releaseBattleHold();
  ui.events.emit('ui:battle-order', 'stance:press');
  // Resolve a stretch of the fight into the beat queue and then leave it alone. The view drains
  // one beat per `BATTLE_TICK_MS` off its own clock, which is the thing under test — driving the
  // world during the sample would measure the harness's cadence instead of the screen's.
  const { fightRound } = await import('/src/systems/ascent/BattleSystem.ts');
  for (let i = 0; i < beats && !st.ascent.activeBattle.over; i += 1) {
    if (st.ascent.activeBattle.moment) st.ascent.activeBattle.moment = undefined;
    fightRound(st);
  }
  await new Promise((r) => setTimeout(r, 300));
  return { land: st.ascent.activeBattle.landName, queued: st.ascent.activeBattle.beats?.length ?? 0 };
}, [FIRST, QUEUE_BEATS]);

if (!opened) {
  console.log('CHECK: no engagement opened in 200 ticks — nothing to measure');
  await browser.close();
  process.exit(0);
}

// Sample straight off the render loop, so what is measured is what is drawn.
await page.evaluate(() => {
  window.__track = [];
  const game = window.__phaserGame;
  const ui = game.scene.getScene('ConquestUIScene');
  game.events.on('poststep', () => {
    const marker = ui.battleUi?.ourMarkers?.[0]?.marker;
    const theirs = ui.battleUi?.theirMarkers?.[0]?.marker;
    if (!marker?.active) return;
    window.__track.push([performance.now(), marker.x, theirs?.active ? theirs.x : marker.x]);
  });
});
await page.waitForTimeout(SAMPLE_MS);

const out = await page.evaluate(() => {
  const all = window.__track ?? [];
  // Trim to between the first movement and the last. Sampling starts at whatever phase of the
  // beat clock it happens to start at, and ends when the queued beats run out — neither of those
  // silences is the screen's, and counting them measures the harness.
  const moves = [];
  for (let i = 1; i < all.length; i += 1) {
    if (Math.abs(all[i][1] - all[i - 1][1]) + Math.abs(all[i][2] - all[i - 1][2]) > 0.05) moves.push(i);
  }
  const track = moves.length >= 2 ? all.slice(moves[0] - 1, moves[moves.length - 1] + 1) : all;
  const gaps = [];
  let moved = 0;
  let biggest = 0;
  let stillRun = 0;
  let longestStill = 0;
  for (let i = 1; i < track.length; i += 1) {
    const dx = Math.abs(track[i][1] - track[i - 1][1]) + Math.abs(track[i][2] - track[i - 1][2]);
    const dt = track[i][0] - track[i - 1][0];
    gaps.push(dt);
    // Below a twentieth of a design unit a frame is not moving, it is rounding.
    if (dx > 0.05) { moved += 1; stillRun = 0; } else { stillRun += dt; longestStill = Math.max(longestStill, stillRun); }
    // Per sixteen milliseconds, not per frame. A frame that took twice as long covers twice the
    // ground and is not a teleport — measured, a run with another browser on the machine came in
    // at 24 ms a frame and failed a fixed per-frame threshold while moving perfectly smoothly.
    biggest = Math.max(biggest, dt > 0 ? (dx * 16) / dt : dx);
  }
  gaps.sort((a, b) => a - b);
  return {
    frames: track.length,
    movedShare: track.length > 1 ? moved / (track.length - 1) : 0,
    biggestJump: biggest,
    longestStillMs: longestStill,
    frameMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0,
    travelled: track.length > 1 ? Math.abs(track[track.length - 1][1] - track[0][1]) : 0,
  };
});

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });
// A beat is 560 ms. Anything that stands still for most of one is the fault being tested for.
check('the line moves on most frames', headless || out.movedShare >= 0.6, `${(out.movedShare * 100).toFixed(0)}% of frames at ~${out.frameMs.toFixed(0)} ms`);
check('never frozen for a third of a second', out.longestStillMs <= 340, `longest still ${Math.round(out.longestStillMs)} ms`);
check('no single frame teleports', out.biggestJump <= 6, `biggest step ${out.biggestJump.toFixed(2)} units per 16 ms`);
check('it actually went somewhere', out.travelled >= 4, `${out.travelled.toFixed(1)} units of travel`);
check('no console errors', errors.length === 0, errors[0] ?? 'none');

console.log(`\n  ${opened.land} — ${out.frames} frames at ~${out.frameMs.toFixed(1)} ms\n`);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'CHECK'}  ${c.name.padEnd(38)} ${c.detail}`);
}
console.log(checks.every((c) => c.ok) ? '\nPASS: the army moves like an army' : '\nCHECK: see above');
await browser.close();
