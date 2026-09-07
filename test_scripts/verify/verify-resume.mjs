/**
 * Coming back from the background must never leave a blank sheet.
 *
 * "Focus the game and it is totally blank" was three failures with one face, and this drives
 * each of them against the real scenes:
 *
 *   A. hidden -> visible, blur -> focus: the away pause engages and lifts, the frame is drawn.
 *   B. a throw inside one game step: Phaser's rAF driver runs the callback before it requests the
 *      next frame, so the loop dies — `game/resilience.ts` must re-arm it within a few seconds.
 *   C. a WebGL context lost and then restored: the faces baked through `saveTexture` are repainted
 *      (`game/gpuBakes.ts`) and the frame comes back whole.
 *   D. a WebGL context lost and NEVER restored: the page must write the run down, reload itself,
 *      and carry the player straight back into the run with the reason in the header strip.
 *
 * D navigates, so it runs last.
 *
 *   node test_scripts/verify/verify-resume.mjs
 *   DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-resume.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/verify-resume';
const SHOTS = process.argv.includes('--shots');
if (SHOTS) mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
const warnings = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.stack ?? err.message}`));
page.on('console', (m) => {
  const text = m.text().slice(0, 240);
  if (m.type() === 'error') errors.push(`CONSOLE: ${text}`);
  if (/\[resilience\]|\[gpuBakes\]/.test(text)) warnings.push(text);
});

const bootToMenu = async () => {
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
    null, { timeout: 30000 },
  );
};

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await bootToMenu();

const distinctOf = (shot) => {
  const distinct = new Set();
  for (let i = 0; i < shot.length - 3; i += 997) distinct.add(shot.readUInt32BE(i));
  return distinct.size;
};
const frame = async (name) => {
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 844 } });
  if (SHOTS) writeFileSync(`${OUT}/${name}.png`, shot);
  return distinctOf(shot);
};
// The ACTIVE world scene's state — a stopped scene keeps its old `.state`, and the menu nulls the global.
const probe = () => page.evaluate(() => {
  const g = window.__phaserGame;
  const world = g.scene.getScenes(true).find((s) => s.state && Array.isArray(s.state.lands));
  const health = window.__health ? window.__health() : {};
  return {
    frame: g.loop.frame,
    rafRunning: g.loop.raf.isRunning,
    contextLost: g.renderer.contextLost,
    awayPause: world?.state.isAwayPause ?? null,
    message: world?.state.message ?? null,
    active: g.scene.getScenes(true).map((s) => s.scene.key),
    health,
  };
});
const setHidden = (hidden) => page.evaluate((hidden) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  if (hidden) {
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('visibilitychange'));
  } else {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  }
}, hidden);

console.log(`=== verify-resume — ${URL} ===`);
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(1200);
const base = await frame('0-base');
check('the run draws a frame', base > 24, `${base} distinct samples`);

// ── A. hidden -> visible ──────────────────────────────────────────────────────────────────
console.log('\n=== A. hidden -> visible ===');
const stampsBefore = await page.evaluate(() => window.__inkStamps().count);
await setHidden(true);
const hidden = await probe();
check('A: the away pause engages while hidden', hidden.awayPause === true, JSON.stringify({ awayPause: hidden.awayPause, active: hidden.active }));
await page.waitForTimeout(1200);
const stampsAfter = await page.evaluate(() => window.__inkStamps().count);
console.log(`     stamps resident: ${stampsBefore} -> ${stampsAfter} (idle ones are evicted on hidden)`);
await setHidden(false);
await page.waitForTimeout(700);
const back = await probe();
const afterA = await frame('1-after-visibility');
check('A: the away pause lifts on visible', back.awayPause === false, JSON.stringify({ awayPause: back.awayPause }));
check('A: the frame is drawn after the return', afterA > 24, `${afterA} distinct samples`);

// ── B. a throw inside one step ────────────────────────────────────────────────────────────
console.log('\n=== B. a throw inside one game step ===');
const beforeB = await probe();
await page.evaluate(() => {
  window.__phaserGame.events.once('step', () => { throw new Error('verify-resume: simulated throw inside a step'); });
});
await page.waitForTimeout(700);
const dead = await probe();
check('B: the throw stopped the loop (the premise)', dead.frame <= beforeB.frame + 2, `frame ${beforeB.frame} -> ${dead.frame}`);
// The heartbeat declares the loop dead after 4 s of no steps and checks once a second.
await page.waitForTimeout(6000);
const revived = await probe();
check('B: the heartbeat re-armed the loop', revived.frame > dead.frame + 10 && revived.health.rearms >= 1,
  `frame ${dead.frame} -> ${revived.frame}, rearms=${revived.health.rearms}, lastError=${revived.health.lastError ?? '—'}`);
const afterB = await frame('2-after-rearm');
check('B: the frame is drawn after the re-arm', afterB > 24, `${afterB} distinct samples`);
// The simulated throw is the one page error this harness expects.
const unexpected = errors.filter((e) => !/simulated throw inside a step/.test(e));

// ── C. context lost -> restored ───────────────────────────────────────────────────────────
console.log('\n=== C. context lost -> restored ===');
const bakesBefore = await page.evaluate(() => (window.__health ? window.__health().gpuBakes : -1));
check('C: GPU bakes are registered for repaint', bakesBefore > 0, `${bakesBefore} registered`);
const errBeforeC = unexpected.length;
const lost = await page.evaluate(() => {
  const gl = window.__phaserGame.renderer.gl;
  const ext = gl.getExtension('WEBGL_lose_context');
  if (!ext) return 'no WEBGL_lose_context extension';
  window.__loseExt = ext;
  ext.loseContext();
  return 'lost';
});
check('C: a context loss could be simulated', lost === 'lost', lost);
await page.waitForTimeout(500);
const during = await probe();
const duringFrame = await frame('3-context-lost');
console.log(`     during loss: contextLost=${during.contextLost} distinct=${duringFrame} (a lost context IS a blank sheet)`);
await page.evaluate(() => window.__loseExt.restoreContext());
await page.waitForTimeout(1500);
const restored = await probe();
const afterC = await frame('4-context-restored');
check('C: the renderer reports the context restored', restored.contextLost === false);
check('C: the frame is drawn after the restore', afterC > 24 && afterC >= base * 0.8, `${afterC} distinct (base ${base})`);
const newErrorsC = errors.filter((e) => !/simulated throw inside a step/.test(e)).slice(errBeforeC);
check('C: no errors across loss and restore', newErrorsC.length === 0, newErrorsC.slice(0, 3).join(' | '));

// ── D. context lost and never restored ────────────────────────────────────────────────────
console.log('\n=== D. context lost, never restored ===');
const runBefore = await page.evaluate(() => {
  const world = window.__phaserGame.scene.getScenes(true).find((s) => s.state && Array.isArray(s.state.lands));
  return { seed: world?.state.mapConfig?.seed ?? null, wave: world?.state.ascent?.wave ?? null };
});
const navigated = page.waitForEvent('load', { timeout: 15000 }).then(() => true).catch(() => false);
await page.evaluate(() => window.__loseExt.loseContext());
const reloaded = await navigated;
check('D: the page reloaded itself within the watchdog window', reloaded);
let landed = false;
let after = null;
if (reloaded) {
  try {
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestScene'), null, { timeout: 30000 });
    await page.waitForTimeout(1000);
    landed = true;
    after = await page.evaluate(() => {
      const world = window.__phaserGame.scene.getScenes(true).find((s) => s.state && Array.isArray(s.state.lands));
      return {
        seed: world?.state.mapConfig?.seed ?? null,
        wave: world?.state.ascent?.wave ?? null,
        message: world?.state.message ?? null,
        reason: window.__health ? window.__health().reloadReason : null,
      };
    });
  } catch (err) {
    errors.push(`D: ${err.message.split('\n')[0]}`);
  }
}
check('D: the menu carried the player back into the run', landed && after?.seed === runBefore.seed,
  landed ? `seed ${runBefore.seed} -> ${after.seed}, wave ${runBefore.wave} -> ${after.wave}` : 'never reached ConquestScene');
check('D: the reload reason names the lost context', after?.reason?.cause === 'context-lost', JSON.stringify(after?.reason ?? null));
// `pushToast` writes `state.message` and the event log. The classic UIScene prints the message
// in its header strip; Ascent's `WhisperLine` only voices log entries that carry a story ref, so
// there the notice lives in the log (the bell) — this asserts the state, not a strip.
check('D: the run carries the notice', typeof after?.message === 'string' && after.message.length > 0, after?.message ?? '');
if (landed) {
  const afterD = await frame('5-after-reload');
  check('D: the restored run draws a frame', afterD > 24, `${afterD} distinct samples`);
}

// ── E. a cold open after the run was lost ─────────────────────────────────────────────────
// No reason flag this time — the way a killed app or a closed tab comes back. The automatic
// snapshot written on the way out is the only trace, and the front page must ASK, not assume.
console.log('\n=== E. cold open with a lost run: the offer ===');
if (landed) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await bootToMenu();
  await page.waitForTimeout(600);
  const offer = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    const find = (id) => scene.modalObjects.find((o) => o.getData?.('resumeOffer') === id);
    const button = find('continue');
    const later = find('later');
    if (!button) return null;
    const box = button.getData('visualBounds');
    return { x: button.x + box.width / 2, y: button.y + box.height / 2, hasLater: Boolean(later), objects: scene.modalObjects.length };
  });
  check('E: the front page offers the lost run in a modal', offer !== null && offer.hasLater, JSON.stringify(offer));
  const offerFrame = await frame('6-offer');
  if (offer) {
    await page.mouse.click(offer.x, offer.y);
    let resumed = false;
    try {
      await page.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestScene'), null, { timeout: 30000 });
      resumed = true;
    } catch (err) {
      errors.push(`E: ${err.message.split('\n')[0]}`);
    }
    const seedE = resumed ? await page.evaluate(() => {
      const world = window.__phaserGame.scene.getScenes(true).find((s) => s.state && Array.isArray(s.state.lands));
      return world?.state.mapConfig?.seed ?? null;
    }) : null;
    check('E: tapping Continue resumes the same run', resumed && seedE === runBefore.seed, `seed ${runBefore.seed} -> ${seedE}, offer frame ${offerFrame} distinct`);
  }
  // Back on the front page inside the same page life, the question is not asked again.
  if (offer) {
    await page.evaluate(() => {
      const g = window.__phaserGame;
      for (const key of ['ConquestUIScene', 'ConquestScene']) g.scene.stop(key);
      g.scene.start('MenuScene');
    });
    await bootToMenu();
    await page.waitForTimeout(400);
    const again = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      return scene.modalObjects.some((o) => o.getData?.('resumeOffer'));
    });
    check('E: the offer is not repeated on a later visit to the front page', again === false);
  }
} else {
  check('E: skipped — D never landed in the run', false);
}

const finalUnexpected = errors.filter((e) => !/simulated throw inside a step/.test(e));
check('no unexpected console errors', finalUnexpected.length === 0, finalUnexpected.slice(0, 3).join(' | '));

console.log('\n=== watchdog lines ===');
for (const line of warnings.slice(0, 12)) console.log('  ' + line);

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: a dead loop is re-armed, a lost context reloads into the run, a restored one repaints'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
