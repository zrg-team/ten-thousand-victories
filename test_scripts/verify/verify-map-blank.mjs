/**
 * "Sometimes the map shows blank and then renders full again — more on weak devices."
 *
 * Three things put bare paper over the world for longer than a frame, and all three scale with
 * how slow the device is, because the chunked map bands repaint under a 3 ms-a-frame allowance:
 *
 *   1. A province dropping out of sight. `MapScene.refresh` asked the fog band to conceal, and the
 *      band answered by covering the WHOLE world in opaque paper until every visible fog tile had
 *      been re-planned and re-painted — the ground, the towns and the armies under it included.
 *      Measured here at 6x CPU throttle before the fix: the entire map blank for the length of
 *      the repaint.
 *   2. A pan into ground no tile has been painted for yet.
 *   3. A WebGL context restore, which empties every tile.
 *
 * The gates: a visibility loss never covers the whole map (only the province that was lost, until
 * its own fog is back); and a visible cell with no imagery — after a loss, a pan or a restore — is
 * filled within a bounded number of frames, because a frame with nothing to show is the one frame
 * worth spending real time on.
 *
 * Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-map-blank.mjs [--throttle 6]
 * Writes output/map-blank-<scenario>.png mid-repaint so the frame can be looked at.
 */
import { mkdirSync } from 'node:fs';
import { boot, startWorld, resolveOpening, arg } from '../perf/_boot.mjs';

mkdirSync('output', { recursive: true });
const THROTTLE = Number(arg('throttle', '6'));
const { browser, page, cdp, errors } = await boot({ quality: 'medium', query: '?capture=1&bench=1', dpr: 2 });

const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
};
const note = (label, detail = '') => console.log(`  ${label}${detail ? ` — ${detail}` : ''}`);

/** Reads both chunk bands off the world scene: cover state and the cells in view with no imagery. */
const PROBE = `(() => {
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  const bands = { ground: world.groundChunks, fog: world.overlays?.fogChunks };
  const hit = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const read = (layer) => {
    if (!layer) return { deficit: 0, full: false, any: false, pending: false, rects: [] };
    const view = layer.view();
    let deficit = 0;
    for (const key of layer.plans.keys()) {
      const box = layer.rectangle(key);
      if (!hit(box, view)) continue;
      const tile = layer.tiles.get(key);
      if (!tile) deficit += 1;
    }
    // The cover's own command buffer: rectangles for a bare region, paths for a province outline.
    // Anything drawn at all is paper standing; only a rectangle can be the whole world.
    const cmd = layer.cover?.visible ? (layer.cover.commandBuffer ?? []) : [];
    const rects = [];
    let paths = 0;
    for (let i = 0; i < cmd.length;) {
      const op = cmd[i];
      if (op === 3) { rects.push({ x: cmd[i + 1], y: cmd[i + 2], w: cmd[i + 3], h: cmd[i + 4] }); i += 5; }
      else if (op === 8) { paths += 1; i += 1; }
      else if (op === 7) i += 3;
      else if (op === 6) i += 4;
      else i += 1;
    }
    const full = rects.some((r) => r.w >= layer.width && r.h >= layer.height);
    return { deficit, full, any: rects.length + paths > 0, pending: layer.stats().pending, rects, paths };
  };
  return { ground: read(bands.ground), fog: read(bands.fog), stats: world.performanceStats() };
})()`;

/** Samples one probe per animation frame until `done(sample)` holds, or the cap. */
async function sample(label, done, maxFrames = 900, setup = 'undefined') {
  return page.evaluate(async ([src, cap, doneSrc, setupSrc]) => {
    const probe = () => eval(src);
    const settled = eval(doneSrc);
    // The change under test is made here, in the same task as the first sample: a repaint that
    // finishes inside a screenshot's worth of wall time is still seen from its first frame.
    const info = eval(setupSrc);
    const frames = [];
    const t0 = performance.now();
    let calm = 0;
    for (let i = 0; i < cap; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const s = probe();
      frames.push({ gDef: s.ground.deficit, fDef: s.fog.deficit, fFull: s.fog.full, fAny: s.fog.any,
        gPend: s.ground.pending, fPend: s.fog.pending, refresh: s.stats.refreshPending });
      // Three quiet frames in a row: a repaint that is genuinely finished, not a gap between steps.
      calm = settled(s) ? calm + 1 : 0;
      if (calm >= 3 && i >= 4) break;
    }
    const ms = performance.now() - t0;
    const count = (fn) => frames.filter(fn).length;
    return {
      frames: frames.length, ms: Math.round(ms),
      fogFullFrames: count((f) => f.fFull),
      fogAnyCoverFrames: count((f) => f.fAny),
      fogDeficitFrames: count((f) => f.fDef > 0),
      groundDeficitFrames: count((f) => f.gDef > 0),
      worstGroundDeficit: Math.max(0, ...frames.map((f) => f.gDef)),
      worstFogDeficit: Math.max(0, ...frames.map((f) => f.fDef)),
      first: frames[0], last: frames[frames.length - 1], info,
    };
  }, [PROBE, maxFrames, done, setup]);
}

// Quiet means nothing is blank: no cell in view without imagery and no paper standing. Deliberately
// not "the world is idle" — a running world keeps its refresh busy with sightings and seasons,
// and none of that is a blank frame.
const QUIET = `(s) => s.ground.deficit === 0 && s.fog.deficit === 0 && !s.fog.any`;

try {
  await startWorld(page, { mode: 'ascent' });
  await resolveOpening(page);
  await page.waitForFunction(() => {
    const s = window.__phaserGame.scene.getScene('ConquestScene').performanceStats();
    return !s.refreshPending && !s.sceneryPending && !s.ground?.pending && !s.fog?.pending;
  }, null, { timeout: 120000 });
  // The world is left running: the report is about play, not about a paused screenshot.
  await page.evaluate(() => { const st = window.__mandateState; st.isPaused = false; st.isStrategyPause = false; });

  const baseline = await page.evaluate(PROBE);
  note('settled baseline', JSON.stringify({ ground: baseline.stats.ground, fog: baseline.stats.fog }));
  check(baseline.ground.deficit === 0 && baseline.fog.deficit === 0 && !baseline.fog.any,
    'the opening map is fully painted with no cover standing', JSON.stringify({ g: baseline.ground.deficit, f: baseline.fog.deficit, cover: baseline.fog.any }));

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  note(`CPU throttled ${THROTTLE}x from here on`);

  // ── 1. a province drops out of sight ──────────────────────────────────────────────────────
  const LOSE_ONE = `(() => {
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const st = window.__mandateState;
    const cam = world.cameras.main;
    // A visible province that is not ours and is on screen — the case the fog has to answer.
    const view = { x: cam.scrollX, y: cam.scrollY, w: cam.width / cam.zoom, h: cam.height / cam.zoom };
    const candidates = st.lands.filter((l) => l.isVisible && l.ownerId !== 'dai-viet');
    const node = (id) => world.landNodes.get(id);
    const onScreen = candidates.find((l) => { const n = node(l.id); return n && n.x > view.x && n.x < view.x + view.w && n.y > view.y && n.y < view.y + view.h; });
    const land = onScreen ?? candidates[0];
    land.isVisible = false;
    world.refresh();
    const n = node(land.id);
    return { id: land.id, name: land.name, at: n ? { x: Math.round(n.x), y: Math.round(n.y) } : null, onScreen: Boolean(onScreen) };
  })()`;

  // 1a. Permanent: the world is held, so no tick lights the province again and the fog must be
  // re-inked. The paper over it should last the repaint and not a frame longer.
  await page.evaluate(() => { const st = window.__mandateState; st.isPaused = true; st.isStrategyPause = true; });
  const loss = await sample('loss', QUIET, 900, LOSE_ONE);
  note('visibility lost (world held) on', JSON.stringify(loss.info));
  note('loss repaint', JSON.stringify({ ...loss, info: undefined }));
  check(loss.fogFullFrames === 0, 'a visibility loss never covers the whole map',
    `${loss.fogFullFrames} of ${loss.frames} frames were a full-map cover (${loss.ms} ms at ${THROTTLE}x)`);
  check(loss.fogAnyCoverFrames > 0 && loss.fogAnyCoverFrames <= 90, 'the lost province is under paper for the repaint and no longer',
    `${loss.fogAnyCoverFrames} frames of cover, ${loss.ms} ms`);
  check(loss.groundDeficitFrames === 0, 'the ground under a lost province keeps its imagery while the fog repaints',
    `${loss.groundDeficitFrames} frames with unpainted visible ground`);
  const covered = await page.evaluate(([src, at]) => {
    // The lost province's own fog is back, so nothing should be standing over it now.
    const s = eval(src);
    return { any: s.fog.any, rects: s.fog.rects.length, paths: s.fog.paths, concealed: s.stats.fog?.concealed, at };
  }, [PROBE, loss.info.at]);
  check(!covered.any && covered.concealed === 0, 'and no cover is left standing once its fog is painted', JSON.stringify(covered));

  // The picture: the cover is too short-lived under the boost to catch with a screenshot, so it is
  // staged — the same region, raised and left standing — then taken down again.
  await page.evaluate(() => {
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const st = window.__mandateState;
    const land = st.lands.find((l) => l.isVisible && l.ownerId !== 'dai-viet');
    const region = world.overlays.landConcealRegion(st, world.hexTileMap, (v) => world.wx(v), (v) => world.wy(v), land.id);
    world.overlays.concealPending([region]);
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: 'output/map-blank-loss.png' });
  await page.evaluate(() => { window.__phaserGame.scene.getScene('ConquestScene').overlays.concealSettled(); });

  // 1b. Transient: the world runs, and the tick's visibility pass lights the province again — a
  // hostile column's sighting going dark, then lit. This is the case that used to blank the map
  // until some unrelated fog change came along.
  await page.evaluate(() => { const st = window.__mandateState; st.isPaused = false; st.isStrategyPause = false; });
  const transient = await sample('flicker', QUIET, 900, LOSE_ONE);
  note('visibility lost (world running) on', JSON.stringify(transient.info));
  note('flicker repaint', JSON.stringify({ ...transient, info: undefined }));
  check(transient.fogFullFrames === 0, 'a transient loss never covers the whole map', `${transient.fogFullFrames} full-cover frames`);
  check(transient.fogAnyCoverFrames <= 90, 'and its paper comes down on its own',
    `${transient.fogAnyCoverFrames} frames of cover, ${transient.ms} ms`);

  // ── 2. a pan into ground nothing has painted yet ──────────────────────────────────────────
  const pan = await page.evaluate(() => {
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const layer = world.groundChunks;
    const cam = world.cameras.main;
    const view = layer.view();
    // The plan cell farthest from the view with no tile: the far corner of the world.
    let far, best = -1;
    for (const key of layer.plans.keys()) {
      if (layer.tiles.get(key)) continue;
      const box = layer.rectangle(key);
      const d = Math.hypot(box.centerX - view.centerX, box.centerY - view.centerY);
      if (d > best) { best = d; far = box; }
    }
    if (!far) return { skipped: 'every cell already painted' };
    const w = cam.width / cam.zoom, h = cam.height / cam.zoom;
    cam.setScroll(
      Math.max(0, Math.min(world.worldWidth - w, far.centerX - w / 2)),
      Math.max(0, Math.min(world.worldHeight - h, far.centerY - h / 2)),
    );
    return { to: { x: Math.round(cam.scrollX), y: Math.round(cam.scrollY) }, distance: Math.round(best) };
  });
  note('panned', JSON.stringify(pan));
  if (!pan.skipped) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: 'output/map-blank-pan.png' });
    const after = await sample('pan', QUIET);
    note('pan repaint', JSON.stringify(after));
    check(after.groundDeficitFrames <= 40, 'ground panned into view is painted within a few dozen throttled frames',
      `${after.groundDeficitFrames} frames with a visible unpainted cell (worst ${after.worstGroundDeficit} cells), ${after.ms} ms`);
    check(after.fogFullFrames === 0, 'a pan never covers the whole map', `${after.fogFullFrames} full-cover frames`);
  }

  // ── 3. the GPU hands back an empty context ───────────────────────────────────────────────
  const restored = await page.evaluate(async () => {
    const game = window.__phaserGame;
    const gl = game.renderer.gl;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return { skipped: 'no WEBGL_lose_context' };
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 120));
    ext.restoreContext();
    const t0 = performance.now();
    while (game.renderer.contextLost && performance.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 30));
    return { lost: game.renderer.contextLost, waited: Math.round(performance.now() - t0) };
  });
  note('context restore', JSON.stringify(restored));
  if (!restored.skipped && !restored.lost) {
    await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
    await page.screenshot({ path: 'output/map-blank-restore.png' });
    const after = await sample('restore', QUIET);
    note('restore repaint', JSON.stringify(after));
    check(after.groundDeficitFrames <= 60, 'the ground is repainted within a bounded number of frames after a restore',
      `${after.groundDeficitFrames} frames with a visible unpainted cell, ${after.ms} ms`);
  }

  // Pre-existing on this checkout: story-print setting images are referenced before they exist.
  const mine = errors.filter((e) => !/Failed to process file|File failed:|is not valid JSON/.test(e));
  check(mine.length === 0, 'no console errors', mine.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) { console.log('FAIL: the map still goes blank on a slow device'); process.exit(1); }
