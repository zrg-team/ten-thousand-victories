/** Default 60 FPS, Auto 40 FPS, and legacy diagnostic 30 FPS use FramePacer, with Phaser's limiter disabled.
 * Changing a cap inside a frame must not create a second requestAnimationFrame loop.
 * Headless Chromium's 60 Hz display is supplemented by verify-performance-policy's
 * simulated 60/90/120/144 Hz elapsed-time checks.
 */
import { boot, startWorld, report } from '../perf/_boot.mjs';

const { browser, page, errors } = await boot({ dpr: 1, quality: 'low' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(600);

const stepsIn = (ms) => page.evaluate(async (dur) => {
  const game = window.__phaserGame;
  let steps = 0;
  const on = () => { steps += 1; };
  game.events.on('step', on);
  await new Promise((r) => setTimeout(r, dur));
  game.events.off('step', on);
  return steps;
}, ms);

const checks = [];

// No limiter engaged at boot; the menu runs at panel rate.
const limiterAtBoot = await page.evaluate(() => window.__phaserGame.loop.hasFpsLimit);
checks.push(['no fps limiter engaged by default', limiterAtBoot === false, `hasFpsLimit ${limiterAtBoot}`]);
const menuSteps = await stepsIn(2000);
checks.push(['the front page paces at 60 FPS', menuSteps >= 120 * 0.7 && menuSteps <= 120 * 1.35,
  `${menuSteps} steps / 2 s (want ~120)`]);

// The Auto floor has its own cadence, including when display refresh is enabled.
await page.evaluate(() => window.__ladder.useAuto('clarity'));
const clarity = await page.evaluate(() => ({ state: window.__ladder.state(), has: window.__phaserGame.loop.hasFpsLimit }));
checks.push(['Auto Clarity targets 40 FPS with the elapsed-time pacer', clarity.state.fps === 40 && !clarity.has && !clarity.state.pinned, JSON.stringify(clarity)]);
const claritySteps = await stepsIn(2000);
checks.push(['Clarity renders near 40 FPS', claritySteps >= 80 * .8 && claritySteps <= 80 * 1.15, `${claritySteps} steps / 2 s (want ~80)`]);

// The old 30 FPS profile remains available only to explicit diagnostic callers.
await page.evaluate(async () => { window.__ladder.force('low-30'); await new Promise((r) => setTimeout(r, 50)); });
const low30 = await page.evaluate(() => ({ limit: window.__ladder.targetFps(), has: window.__phaserGame.loop.hasFpsLimit }));
checks.push(['30 FPS uses the elapsed-time pacer', low30.has === false && low30.limit === 30, JSON.stringify(low30)]);
const cappedSteps = await stepsIn(2000);
checks.push(['low-30 paces at ~30', cappedSteps >= 60 * 0.7 && cappedSteps <= 60 * 1.35,
  `${cappedSteps} steps / 2 s (want ~60)`]);

// Leaving the diagnostic rung restores the normal 60 FPS target.
await page.evaluate(async () => { window.__ladder.force('low'); await new Promise((r) => setTimeout(r, 50)); });
const released = await page.evaluate(() => window.__phaserGame.loop.hasFpsLimit);
checks.push(['leaving low-30 preserves a single uncapped Phaser loop', released === false, `hasFpsLimit ${released}`]);

// The leak pin: cap changes fired from INSIDE game steps (the way scene code fires them) must
// not double the rAF loop. Toggle across several consecutive steps, then measure.
await page.evaluate(() => new Promise((resolve) => {
  const game = window.__phaserGame;
  let n = 0;
  const on = () => {
    n += 1;
    if (n === 2) window.__ladder.setSceneCap(40);
    if (n === 4) window.__ladder.setSceneCap(undefined);
    if (n === 6) window.__ladder.force('low-30');
    if (n === 8) window.__ladder.force('low');
    if (n >= 10) { game.events.off('prestep', on); resolve(undefined); }
  };
  game.events.on('prestep', on);
}));
await page.waitForTimeout(120);
const afterToggles = await stepsIn(2000);
checks.push(['mid-step cap changes do not double the loop', afterToggles <= 120 * 1.35,
  `${afterToggles} steps / 2 s after in-step toggles (a leaked loop reads ~240)`]);

// A world also runs uncapped at panel rate.
await startWorld(page, { mode: 'rival', seed: 1337 });
const worldSteps = await stepsIn(2000);
checks.push(['a world paces at 60 FPS', worldSteps >= 120 * 0.7 && worldSteps <= 120 * 1.35,
  `${worldSteps} steps / 2 s (want ~120)`]);

// The probe hook reports the same story.
const probe = await page.evaluate(() => window.__fpsProbe(2));
checks.push(['__fpsProbe reports frames', probe.frames > 60, `frames ${probe.frames}, p50 ${probe.p50} ms`]);

// The ladder hook exists and is pinned under capture.
const ladder = await page.evaluate(() => window.__ladder?.state());
checks.push(['the ladder is installed and pinned under ?capture=1',
  ladder !== undefined && ladder.enabled === false, JSON.stringify(ladder)]);
checks.push(['the live render scale is readable', await page.evaluate(() => window.__renderScale?.()) >= 1, '']);

checks.push(['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')]);
await browser.close();
report(checks);
