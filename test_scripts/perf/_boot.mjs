/**
 * Shared bootstrap for the perf and lifecycle harnesses.
 *
 * Two things every script here kept getting wrong, now decided once:
 *
 *  - **The URL.** Five conventions existed (`--url`, `DEV_URL`, `BASE_URL`, `PLAYTEST_URL`, and a
 *    hardcoded `:5173` that this project's dev server has never used — `yarn dev` is `:5179`).
 *    Order: `DEV_URL ?? BASE_URL ?? PLAYTEST_URL ?? http://127.0.0.1:5179`.
 *  - **The tier.** `renderScale()` is capped by `devicePixelRatio`, so a page opened at the
 *    default `deviceScaleFactor: 1` always measures scale 1 with no PaperFX, whatever the stored
 *    quality says. Perf runs default to `--dpr 3 --quality high` — the tier phones actually get.
 *
 * Headless Chromium rasterises through SwiftShader: counts (indices, upload bytes, draw calls,
 * commands, allocations) transfer to devices; milliseconds are this machine's.
 */
import { chromium } from 'playwright';

export const BASE = process.env.DEV_URL ?? process.env.BASE_URL ?? process.env.PLAYTEST_URL
  ?? 'http://127.0.0.1:5179';

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** First-affordable answer for every Ascent prompt kind, as a string for page.evaluate(eval). */
export const FIRST_OPTION = `(p) => { const o = p.options ?? [];
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

/**
 * Launches, applies the tier, opens the page and waits for the menu.
 * Returns `{ browser, ctx, page, cdp, errors }`; the caller owns `browser.close()`.
 */
export async function boot({
  dpr = Number(arg('dpr', '3')),
  quality = arg('quality', 'high'),
  query = '?capture=1',
  headless = true,
  gc = false,
  ladder = false,
} = {}) {
  const args = [];
  if (gc) args.push('--js-flags=--expose-gc', '--enable-precise-memory-info');
  const browser = await chromium.launch({ headless, args });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (quality && quality !== 'auto') {
    await page.addInitScript((q) => { localStorage.setItem('mandate:graphics:v1', q); }, quality);
  }
  await page.addInitScript(() => { localStorage.removeItem('mandate:graphics:rung:v1'); });
  const sep = query.includes('?') ? '&' : '?';
  const url = `${BASE}/${query}${ladder ? '' : `${sep}noladder=1`}`;
  const cdp = await ctx.newCDPSession(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function'
      && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
    null, { timeout: 40000 },
  );
  return { browser, ctx, page, cdp, errors };
}

/** Jumps into a deterministic run and waits for the world scene. */
export async function startWorld(page, { mode = 'rival', seed = 1337, settle = 800 } = {}) {
  const worldScene = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
  await page.evaluate(([s, m]) => window.__startBenchGame(s, m), [seed, mode]);
  await page.waitForFunction(
    (scene) => { const game = window.__phaserGame; const ui = game?.scene.getScene(scene === 'ConquestScene' ? 'ConquestUIScene' : 'UIScene'); return game?.scene.isActive(scene) === true && game.scene.getScene(scene).landNodes?.size > 0 && ui?.sys.isActive() && !!ui.ui; },
    worldScene, { timeout: 40000 },
  );
  if (settle > 0) await page.waitForTimeout(settle);
  return worldScene;
}

/** Classic modes: light the whole map — the state players actually complain about. */
export async function revealAll(page) {
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MapScene');
    for (const land of scene.state.lands) { land.isVisible = true; land.isExplored = true; }
    scene.refresh();
  });
  // Preparation is now scheduled across frames. A fixed delay can accidentally
  // benchmark old imagery or include unfinished cache work in ordinary draw costs.
  await page.waitForFunction(() => {
    const stats = window.__phaserGame.scene.getScene('MapScene').performanceStats();
    return !stats.refreshPending && !stats.sceneryPending && !stats.ground?.pending && !stats.fog?.pending;
  }, null, { timeout: 180000 });
}

/**
 * Waits until the world's ground/fog chunk layers have stopped painting: no build for 20 straight
 * stepped frames. `performanceStats().pending` only covers cells in view, and the nearby prefetch
 * that follows every invalidation keeps binding render targets for a while after it clears — a
 * frame sampled then reports the repaint (75k-137k indices, 1-2 MB, fbBinds 2-5), not the screen.
 * Measured 2026-09-09: the fight gate read 93k indices mid-tail against 34.5k settled.
 */
export async function settleChunkWork(page, sceneKey = 'ConquestScene', { maxFrames = 4000 } = {}) {
  return page.evaluate(([key, cap]) => {
    const game = window.__phaserGame; const scene = game.scene.getScene(key);
    if (!scene?.performanceStats) return { frames: 0, settled: true };
    let clock = performance.now(), quiet = 0, frames = 0, last = -1;
    while (frames < cap && quiet < 20) {
      const s = scene.performanceStats();
      const builds = (s.ground?.builds ?? 0) + (s.fog?.builds ?? 0);
      const busy = s.refreshPending || s.sceneryPending || s.ground?.pending || s.fog?.pending || builds !== last;
      quiet = busy ? 0 : quiet + 1; last = builds;
      clock += 16; game.step(clock, 16); frames++;
    }
    return { frames, settled: quiet >= 20 };
  }, [sceneKey, maxFrames]);
}

/** Drains the Ascent opening prompt chain (founder pick etc.) so the map is in play. */
export async function resolveOpening(page, { max = 12 } = {}) {
  await page.evaluate(async ([src, cap]) => {
    const st = window.__mandateState;
    const resolveAscentPrompt = window.__performanceBench ? (_state, choice) => window.__performanceBench.resolve(choice) : (await import('/src/systems/ascent/AscentResolver.ts')).resolveAscentPrompt;
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const first = eval(src);
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < cap) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
    ui.events.emit('state-changed');
    world.refresh();
  }, [FIRST_OPTION, max]);
  await page.waitForTimeout(300);
}

/** Advances Ascent ticks until a battle is live. Returns the land name or null. */
export async function driveToBattle(page, { maxTicks = 200 } = {}) {
  const name = await page.evaluate(async ([src, cap]) => {
    const st = window.__mandateState;
    const advanceAscentTick = window.__performanceBench ? () => window.__performanceBench.tick() : (await import('/src/systems/ascent/AscentTick.ts')).advanceAscentTick;
    const resolveAscentPrompt = window.__performanceBench ? (_state, choice) => window.__performanceBench.resolve(choice) : (await import('/src/systems/ascent/AscentResolver.ts')).resolveAscentPrompt;
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const first = eval(src);
    for (let t = 0; t < cap && !st.ascent.activeBattle; t += 1) {
      advanceAscentTick(st);
      world.refresh();
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
      ui.events.emit('state-changed');
    }
    ui.battleAwaitingOrder = false;
    return st.ascent.activeBattle ? st.ascent.activeBattle.landName : null;
  }, [FIRST_OPTION, maxTicks]);
  return name;
}

/** Wraps the GL entry points; per-frame numbers come back from `glFrame`. */
export async function installGlCounters(page) {
  await page.evaluate(() => {
    if (window.__glc) return;
    const gl = window.__phaserGame.renderer.gl;
    const c = { draws: 0, indices: 0, bytes: 0, fbBinds: 0, texBinds: 0, useProgram: 0 };
    const wrap = (name, fn) => { const o = gl[name]; gl[name] = function (...a) { fn(a); return o.apply(this, a); }; };
    wrap('drawElements', (a) => { c.draws += 1; c.indices += a[1]; });
    wrap('drawArrays', (a) => { c.draws += 1; c.indices += a[2]; });
    wrap('bufferSubData', (a) => { c.bytes += a[2]?.byteLength ?? 0; });
    wrap('bindFramebuffer', () => { c.fbBinds += 1; });
    wrap('bindTexture', () => { c.texBinds += 1; });
    wrap('useProgram', () => { c.useProgram += 1; });
    window.__glc = c;
  });
}

/** Steps N fixed-clock frames and returns per-frame GL averages plus p50 step ms. */
export async function glFrame(page, { frames = 10, warm = 3, units } = {}) {
  return page.evaluate(([n, w, u]) => {
    const game = window.__phaserGame;
    const c = window.__glc;
    if (u) game.renderer.renderNodes.setMaxParallelTextureUnits(u);
    let clock = performance.now();
    for (let i = 0; i < w; i += 1) { clock += 16; game.step(clock, 16); }
    for (const k of Object.keys(c)) c[k] = 0;
    const samples = [];
    for (let i = 0; i < n; i += 1) {
      clock += 16;
      const t = performance.now();
      game.step(clock, 16);
      samples.push(performance.now() - t);
    }
    if (u) game.renderer.renderNodes.setMaxParallelTextureUnits(game.renderer.maxTextures);
    samples.sort((a, b) => a - b);
    const round = (v) => Math.round(v / n);
    return {
      draws: round(c.draws), indices: round(c.indices), uploadKB: Math.round(c.bytes / n / 1024),
      fbBinds: round(c.fbBinds), texBinds: round(c.texBinds), useProgram: round(c.useProgram),
      p50ms: +samples[Math.floor(n / 2)].toFixed(1),
    };
  }, [frames, warm, units ?? 0]);
}

/** Object census across active scenes: totals plus visible Graphics command weight. */
export async function census(page) {
  return page.evaluate(() => {
    const game = window.__phaserGame;
    const out = { objects: 0, visible: 0, graphics: 0, visGraphics: 0, visCmds: 0, text: 0, containers: 0, images: 0, tweens: 0 };
    const walk = (o, parentVisible) => {
      out.objects += 1;
      const vis = parentVisible && o.visible !== false;
      if (vis) out.visible += 1;
      if (o.type === 'Graphics') { out.graphics += 1; if (vis) { out.visGraphics += 1; out.visCmds += o.commandBuffer.length; } }
      else if (o.type === 'Text') out.text += 1;
      else if (o.type === 'Container') out.containers += 1;
      else if (o.type === 'Image' || o.type === 'Sprite') out.images += 1;
      if (o.list && Array.isArray(o.list)) o.list.forEach((child) => walk(child, vis));
    };
    for (const scene of game.scene.getScenes(true)) {
      scene.children.list.forEach((child) => walk(child, true));
      out.tweens += scene.tweens.getTweens().length;
    }
    return out;
  });
}

/** Counts Text rasterisations and creations between reset() and read(). */
export async function textCounters(page) {
  await page.evaluate(() => {
    if (window.__textc) return;
    const c = { updates: 0, created: 0 };
    const probe = window.__phaserGame.scene.getScenes(true)[0].add.text(-9999, -9999, '');
    const proto = Object.getPrototypeOf(probe);
    probe.destroy();
    const orig = proto.updateText;
    proto.updateText = function (...a) { c.updates += 1; return orig.apply(this, a); };
    const tm = window.__phaserGame.textures;
    const addCanvas = tm.addCanvas.bind(tm);
    tm.addCanvas = (...a) => { c.created += 1; return addCanvas(...a); };
    window.__textc = c;
  });
  return {
    reset: () => page.evaluate(() => { window.__textc.updates = 0; window.__textc.created = 0; }),
    read: () => page.evaluate(() => ({ ...window.__textc })),
  };
}

export async function throttle(cdp, rate) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

/** Style-B reporting: prints each check, a summary, and exits non-zero on failure. */
export function report(checks) {
  let passed = 0;
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
    if (ok) passed += 1;
  }
  const all = passed === checks.length;
  console.log(`\n${passed}/${checks.length} checks passed`);
  console.log(all ? 'PASS: all checks green' : 'FAIL: see above');
  process.exit(all ? 0 : 1);
}
