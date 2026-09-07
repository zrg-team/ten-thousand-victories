/**
 * What one beat of the battle screen costs, and where the cost goes.
 *
 * `measure-render.mjs` answers "how expensive is a frame" for the map, and on a real GPU both the
 * map and the fight hold 80+ fps — so the frame was never the problem. The problem is the *beat*:
 * every `BATTLE_TICK_MS` the screen drains a beat and runs a full `refresh()`, 1.8 times a second,
 * and a hitch there is what "the game is very laggy" actually describes on a screen whose frames
 * are otherwise fine.
 *
 * It attributes the cost to each builder by wrapping them, which is the only way to see past
 * `refresh()` — where the whole screen hides — and it counts the live tweens each beat, because
 * this screen has twice leaked an immortal tween per rebuild.
 *
 * Measured at a 4x CPU throttle, before the work in this branch and after:
 *
 *   |                       | before   | after    |
 *   |-----------------------|----------|----------|
 *   | one beat, p50         | 44.5     | 23-33    |
 *   | AscentHud.render      | 50.5     | 7-13     |
 *   | the rails             | 24.3     | 3-8      |
 *   | the round track       |  5.3     | 0.8      |
 *   | live tweens, 26 beats | 11 -> 73 | 11 -> 12 |
 *
 * The ranges are across runs: which fight the seed lands on changes the host count and the seam,
 * and quoting a single figure for a number that moves by a third would be a nicer lie.
 *
 * Note the call counts in the breakdown. This harness drives a beat *and* lets the screen's own
 * clock fire inside the same window, so `updateBattle` runs about twice per beat here — divide by
 * the count, not by the beats, when reading a per-call cost.
 *
 * Usage: node test_scripts/perf/measure-battle-beat.mjs      (DEV_URL to point elsewhere)
 */
import { chromium } from 'playwright';
import { startWorld } from './_boot.mjs';
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cdp = await page.context().newCDPSession(page);
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
await page.goto(`${URL}/?capture=1&bench=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await startWorld(page,{mode:'ascent',seed:20260812});
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
console.log(await page.evaluate(async (src) => {
  const st = window.__mandateState;
  const advanceAscentTick = () => window.__performanceBench.tick();
  const resolveAscentPrompt = (_state,choice) => window.__performanceBench.resolve(choice);
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  const first = eval(src);
  for (let t = 0; t < 200 && !st.ascent.activeBattle; t += 1) {
    advanceAscentTick(st); world.refresh();
    let g = 0;
    while (st.pendingAscentPrompt && g++ < 12) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
    ui.events.emit('state-changed');
  }
  ui.battleAwaitingOrder = false;
  ui.openLane('battle');
  return st.ascent.activeBattle ? `${st.ascent.activeBattle.landName}` : 'no fight';
}, FIRST));
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.waitForTimeout(800);
const out = await page.evaluate(async () => {
  const st = window.__mandateState;
  const fightRound = () => window.__performanceBench.fightRound();
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const scene = ui;
  const costs = [];
  const tweenCounts = [];
  // Where the beat actually goes. Each builder is wrapped so its own time is attributed to it
  // rather than to "refresh", which is where the whole screen hides.
  const parts = {};
  const calls = {};
  for (const name of ['buildBattleRails', 'updateBattleRails', 'buildBattlePips', 'buildBattleOrders',
    'drawBattleDock', 'buildBattleExits', 'bakeBattleGround',
    'updateBattle', 'spawnBattleFloaters', 'layFallen', 'slideMarkers', 'redrawHostBlock', 'buildBattleField']) {
    const original = ui[name];
    if (typeof original !== 'function') continue;
    parts[name] = 0;
    calls[name] = 0;
    ui[name] = function (...a) { const t0 = performance.now(); const r = original.apply(this, a); parts[name] += performance.now() - t0; calls[name] += 1; return r; };
  }
  // The chrome the battle clock drags along with it: the whole screen refreshes on the beat.
  for (const [owner, name, label] of [[ui.resourceBar, 'refresh', 'resourceBar.refresh'],
    [ui.hud, 'render', 'hud.render'], [ui.actionBar, 'refresh', 'actionBar.refresh'],
    [ui.hud, 'renderPower', 'hud.power'], [ui.hud, 'renderThreat', 'hud.threat'],
    [ui.hud, 'renderMomentum', 'hud.momentum'], [ui.hud, 'destroy', 'hud.destroy']]) {
    if (!owner || typeof owner[name] !== 'function') continue;
    const original = owner[name];
    parts[label] = 0;
    calls[label] = 0;
    owner[name] = function (...a) { const t0 = performance.now(); const r = original.apply(this, a); parts[label] += performance.now() - t0; calls[label] += 1; return r; };
  }
  const tweensBefore = scene.tweens.getTweens().length;
  let clock = performance.now();
  // A beat, then a beat's worth of frames — otherwise nothing ever finishes and the tween count
  // is a measurement of the harness rather than of the screen.
  const frames = () => { for (let f = 0; f < 34; f += 1) { clock += 16.7; window.__phaserGame.step(clock, 16.7); } };
  for (let i = 0; i < 30; i += 1) {
    if ((st.ascent.activeBattle?.beats?.length ?? 0) < 2) {
      if (st.ascent.activeBattle && !st.ascent.activeBattle.over) fightRound(st);
    }
    if (!st.ascent.activeBattle || st.ascent.activeBattle.over) break;
    const t = performance.now();
    ui.drainBattleBeat();
    ui.refresh();
    costs.push(performance.now() - t);
    frames();
    tweenCounts.push(scene.tweens.getTweens().length);
  }
  costs.sort((a, b) => a - b);
  let objects = 0;
  for (const sc of window.__phaserGame.scene.getScenes(true)) objects += sc.children.list.length;
  return { beats: costs.length, p50: +costs[Math.floor(costs.length / 2)].toFixed(2),
    worst: +costs[costs.length - 1].toFixed(2), tweensBefore,
    tweensAfter: scene.tweens.getTweens().length, tweenCounts, objects, parts, calls };
});
console.log(`one beat (drain + refresh) at 4x throttle:  p50 ${out.p50} ms   worst ${out.worst} ms   over ${out.beats} beats`);
console.log(`tweens ${out.tweensBefore} -> ${out.tweensAfter}   per beat: ${out.tweenCounts.join(' ')}`);
console.log(`live objects ${out.objects}`);
console.log('where the time went (total ms over the run):');
for (const [k, v] of Object.entries(out.parts).sort((a, b) => b[1] - a[1])) {
  if (v > 0.5) console.log(`  ${k.padEnd(22)} ${v.toFixed(1)} ms   (${(v / out.beats).toFixed(1)} per beat)   ${out.calls[k]} calls`);
}
await browser.close();
