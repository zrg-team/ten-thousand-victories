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
 *      and then ASK — landing on the front page with the run on offer, never resuming by itself.
 *   E. a cold open after the app was killed: the same sheet, and "Not now" keeps the run for the
 *      next open without ever putting it on the Continue line, which is the player's own save.
 *
 * D and E navigate, so they run last.
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
// The page comes back on its own — and stops at the front page. Booting straight into a save is
// what put players into runs they never opened (a reload that happened on the menu found the
// manual save and started it), so the reload writes the run down and then asks.
console.log('\n=== D. context lost, never restored ===');
const runBefore = await page.evaluate(() => {
  const world = window.__phaserGame.scene.getScenes(true).find((s) => s.state && Array.isArray(s.state.lands));
  return { seed: world?.state.mapConfig?.seed ?? null, wave: world?.state.ascent?.wave ?? null };
});
const navigated = page.waitForEvent('load', { timeout: 15000 }).then(() => true).catch(() => false);
await page.evaluate(() => window.__loseExt.loseContext());
const reloaded = await navigated;
check('D: the page reloaded itself within the watchdog window', reloaded);

/** The resume sheet's two buttons in page pixels, or null when no sheet is up. */
const resumeOffer = () => page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  if (!scene?.modalObjects) return null;
  const find = (id) => scene.modalObjects.find((o) => o.getData?.('resumeOffer') === id);
  const point = (button) => {
    const box = button.getData('visualBounds');
    return { x: button.x + box.width / 2, y: button.y + box.height / 2 };
  };
  const primary = find('continue');
  const later = find('later');
  if (!primary) return null;
  return { continue: point(primary), later: later ? point(later) : null };
});
/** Whether the front page shows a Continue line at all — it reads the player's own save only. */
const continueLine = () => page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const walk = (list) => (list ?? []).some((o) => o.getData?.('menuLink') === 'continue' || walk(o.list));
  return walk(scene?.children?.list);
});
const worldSeed = () => page.evaluate(() => {
  const world = window.__phaserGame.scene.getScenes(true).find((s) => s.state && Array.isArray(s.state.lands));
  return world?.state.mapConfig?.seed ?? null;
});

let landed = false;
if (reloaded) {
  await bootToMenu();
  await page.waitForTimeout(900);
  const offer = await resumeOffer();
  const inRun = await page.evaluate(() => window.__phaserGame.scene.isActive('ConquestScene'));
  const reason = await page.evaluate(() => (window.__health ? window.__health().reloadReason : null));
  check('D: the reload stops at the front page instead of resuming itself', !inRun);
  check('D: the lost run is offered in a sheet', offer !== null && offer.later !== null, JSON.stringify(offer));
  check('D: the reload reason names the lost context', reason?.cause === 'context-lost', JSON.stringify(reason ?? null));
  // Nothing was ever saved by hand in this run, so there is nothing for Continue to point at.
  check('D: the snapshot is not put on the Continue line', (await continueLine()) === false);
  if (offer) {
    await frame('5-offer-after-reload');
    await page.mouse.click(offer.continue.x, offer.continue.y);
    try {
      await page.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestScene'), null, { timeout: 30000 });
      await page.waitForTimeout(900);
      landed = true;
    } catch (err) {
      errors.push(`D: ${err.message.split('\n')[0]}`);
    }
    const after = landed ? await page.evaluate(() => {
      const world = window.__phaserGame.scene.getScenes(true).find((s) => s.state && Array.isArray(s.state.lands));
      return { seed: world?.state.mapConfig?.seed ?? null, wave: world?.state.ascent?.wave ?? null, message: world?.state.message ?? null };
    }) : null;
    check('D: taking the offer lands in the same run', landed && after?.seed === runBefore.seed,
      landed ? `seed ${runBefore.seed} -> ${after.seed}, wave ${runBefore.wave} -> ${after.wave}` : 'never reached ConquestScene');
    check('D: the resumed run carries the notice', typeof after?.message === 'string' && after.message.length > 0, after?.message ?? '');
    if (landed) {
      const afterD = await frame('6-after-resume');
      check('D: the restored run draws a frame', afterD > 24, `${afterD} distinct samples`);
    }
  }
}

// ── E. a cold open after the app was killed ───────────────────────────────────────────────
// No reason flag this time — the way a killed app or a closed tab comes back. And a save the
// player DID make, sitting beside it, to prove the two are never mixed up.
console.log('\n=== E. cold open with a lost run beside a real save ===');
if (landed) {
  const saved = await page.evaluate(async () => {
    const save = await import('/src/state/save.ts');
    const world = window.__phaserGame.scene.getScenes(true).find((s) => s.state && Array.isArray(s.state.lands));
    // The player's own save, deliberately made OLDER than the snapshot the kill will leave.
    const manual = save.saveSnapshot(world.state);
    const aged = JSON.parse(localStorage.getItem(save.SAVE_SNAPSHOT_KEY));
    aged.savedAt = '2000-01-01T00:00:00.000Z';
    localStorage.setItem(save.SAVE_SNAPSHOT_KEY, JSON.stringify(aged));
    // Now the device takes the app away mid-run, and the player never comes back to it.
    world.state.ascent.wave += 7;
    window.dispatchEvent(new Event('pagehide'));
    return { seed: manual.state.mapConfig.seed, auto: Boolean(localStorage.getItem(save.AUTOSAVE_SNAPSHOT_KEY)) };
  });
  check('E: the kill left a snapshot beside the older manual save', saved.auto);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await bootToMenu();
  await page.waitForTimeout(900);
  const offerE = await resumeOffer();
  check('E: the front page asks about the lost run', offerE !== null && offerE.later !== null);
  check("E: the player's own save still has its Continue line", (await continueLine()) === true);
  await frame('7-offer-cold-open');

  if (offerE) {
    // "Not now" lowers the sheet and nothing else: no run starts, and the snapshot is kept.
    await page.mouse.click(offerE.later.x, offerE.later.y);
    await page.waitForTimeout(500);
    const afterLater = await page.evaluate(async () => {
      const save = await import('/src/state/save.ts');
      return {
        inRun: window.__phaserGame.scene.isActive('ConquestScene'),
        modal: window.__phaserGame.scene.getScene('MenuScene').modalObjects.length,
        kept: Boolean(save.pendingAutosave()),
        // The one that matters: Continue is the player's save, never the newer snapshot.
        continueIsManual: save.loadSnapshot()?.savedAt === '2000-01-01T00:00:00.000Z',
      };
    });
    check('E: declining starts nothing', !afterLater.inRun && afterLater.modal === 0);
    check('E: declining keeps the run for the next open', afterLater.kept);
    check("E: Continue is the player's own save, never the newer snapshot", afterLater.continueIsManual);

    // The sheet is not raised twice in one page life — but a fresh open asks again.
    await page.evaluate(() => {
      const g = window.__phaserGame;
      g.scene.stop('MenuScene');
      g.scene.start('MenuScene');
    });
    await bootToMenu();
    await page.waitForTimeout(500);
    check('E: the offer is not repeated on a later visit to the front page', (await resumeOffer()) === null);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await bootToMenu();
    await page.waitForTimeout(900);
    check('E: a fresh open asks again', (await resumeOffer()) !== null);

    // Taking the player's own save instead is the other intent, and it must drop the snapshot:
    // they have said which run they want.
    await page.evaluate(async () => {
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      scene.closeModal();
      const save = await import('/src/state/save.ts');
      scene.startGame(save.loadSnapshot().state);
    });
    try {
      await page.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestScene'), null, { timeout: 30000 });
      await page.waitForTimeout(1000);
    } catch (err) {
      errors.push(`E: ${err.message.split('\n')[0]}`);
    }
    const resumedSeed = await worldSeed();
    const dropped = await page.evaluate(async () => !(await import('/src/state/save.ts')).pendingAutosave());
    check('E: loading the manual save loads the manual save', resumedSeed === saved.seed,
      `expected ${saved.seed}, got ${resumedSeed}`);
    check('E: playing again drops the snapshot nobody chose', dropped);
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
