/**
 * Driving the real game for the trailer.
 *
 * Everything here is lifted from `test_scripts/shot/shot-readme.mjs`, which is where this repo
 * learned how to photograph a run that looks like a run: freeze the clock the instant the world
 * exists, pin the RNG across the ticks that follow, answer every card the way an engaged player
 * would, and clear the four slots that otherwise print a battle report over the country.
 *
 * The one thing that is new is the crank. A film cannot be captured in real time here — headless
 * Chromium rasterises through SwiftShader and a 2x map frame costs far more than a thirtieth of a
 * second — so the driver stops Phaser's rAF loop and hands the game its own clock, one 1/30 s step
 * at a time. Tweens, timers, the season fade and the ascent tick accumulator all run off that
 * delta, so a frame that takes 300 ms to draw still lands on the timeline at exactly its own
 * thirtieth of a second. Nothing downstream may read a wall clock, or the film stops being
 * reproducible.
 */

const RATE = 30;

/** Mulberry32, the copy every harness in this repo carries. Pins the run, not just the world. */
export const PIN_RNG = `(seed) => {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}`;

/**
 * An engaged player: takes the first real option of every card, kept in step with
 * `AscentResolver.resolveAscentPrompt`. The fall-through must never be `ok` — that is an id
 * nothing accepts, and a driver that answers it silently declines to play.
 */
export const FIRST_CHOICE = `
window.__firstChoice = (p, retry) => {
  const affordable = () => (p.options?.find((o) => o.affordable) ?? p.options?.[0])?.id;
  switch (p.kind) {
    case 'founder': return p.options[0];
    case 'power-draft': return p.cards[0] ?? 'skip';
    case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
    case 'conquer-method': {
      const open = [...p.target.methods]
        .filter((m) => !m.blockedReason)
        .sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
      return open[Math.max(0, (retry ?? 1) - 1)]?.method ?? 'back';
    }
    case 'hero-choice': return p.heroIds[0] ?? 'pass';
    case 'court-appointment': return p.options[0].id;
    case 'law-choice': return p.projectIds[0] ? 'edict:' + p.projectIds[0] : 'hold';
    case 'parliament': return 'decline';
    case 'doctrine': return (p.options.includes('expand') ? 'expand' : p.options[0]) ?? 'hold';
    case 'muster-proposal': return 'accept';
    case 'mandate': return p.options[0];
    case 'decree-offer': return p.projectIds?.[0] ?? 'decline';
    case 'empire-response': return p.options[0].id;
    case 'province-order': return (p.options.find((o) => o.role === 'focus') ?? p.options[0]).id;
    default: return affordable() ?? 'ok';
  }
};`;

/** A page with the game's own settings pinned: the chosen language, the Dong Ho theme, high tier. */
export async function newPage(browser, { width, height, scale, lang = 'en' }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.addInitScript((chosen) => {
    localStorage.setItem('mandate:language:v1', chosen);
    localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
    // The dense bake and the live settlement band are behind `high`. A trailer is the one place
    // the game is judged on a machine that can afford them.
    localStorage.setItem('mandate:graphics:v1', 'high');
  }, lang);
  // Nothing Vite watches may reload the page during a ten-minute capture.
  await page.routeWebSocket('**', (ws) => ws.close());
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Location.prototype, 'reload', { value: () => {}, configurable: true });
    } catch { /* the socket block is the load-bearing half */ }
  });
  return page;
}

/**
 * `layout` is not optional for the desktop film.
 *
 * `platform/layout.ts` resolves the sheet in four steps, and step four — a landscape window with a
 * fine pointer — deliberately excludes `navigator.webdriver`, because a hundred harnesses open
 * headless Chromium in landscape and must not wake up measuring a different game. A driven browser
 * that wants the wide sheet has to ask for it by rule one, on the URL.
 */
export async function toMenu(page, url, layout) {
  const ask = layout ? `&layout=${layout}` : '';
  await page.goto(`${url}/?capture=1${ask}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
    null, { timeout: 30000 },
  );
  await page.waitForTimeout(1200);
}

/**
 * Boots a mode and stops its clock on the spot. The second and a half between `__startBenchGame`
 * and the first frame is real ticks on the browser's own RNG otherwise — which is what made the
 * README's map shot photograph a nine-province realm one afternoon and a one-province realm the
 * next.
 */
export async function boot(page, url, seed, mode = 'ascent', layout) {
  await toMenu(page, url, layout);
  await page.evaluate(([s, m]) => window.__startBenchGame(s, m), [seed, mode]);
  const key = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
  await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), key, { timeout: 30000 });
  await page.evaluate((k) => {
    window.__mandateState.isPaused = true;
    const world = window.__phaserGame.scene.getScene(k);
    if (world) world.ascentAccumulator = -1e9;   // belt and braces: no queued catch-up either
  }, key);
  await page.waitForTimeout(1500);
}

/** Runs the world forward with every card answered, then leaves the screen clean. */
export async function advance(page, ticks, { stopOnBattle = false, battleAfter = 0, seed = 20260901 } = {}) {
  await page.evaluate(FIRST_CHOICE);
  return page.evaluate(async ({ ticks, stopOnBattle, battleAfter, seed, pin }) => {
    const st = window.__mandateState;
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    st.ascent.autoResolveBattles = !stopOnBattle || battleAfter > 0;
    // Both are real settings the game offers. Left off, every claim and every muster arrives as a
    // card, and a realm that asks holds one province where a realm that acts holds nine.
    st.ascent.autoClaimSilently = true;
    st.ascent.autoMusterSilently = true;
    // eslint-disable-next-line no-eval
    eval(`(${pin})`)(seed);
    let t = 0;
    for (; t < ticks; t += 1) {
      if (stopOnBattle && t >= battleAfter) st.ascent.autoResolveBattles = false;
      advanceAscentTick(st);
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 10) {
        if (st.pendingAscentPrompt.kind === 'run-over') break;
        resolveAscentPrompt(st, window.__firstChoice(st.pendingAscentPrompt, guard));
      }
      if (stopOnBattle && st.ascent.activeBattle) break;
    }
    if (!stopOnBattle) {
      st.pendingAscentPrompt = undefined;
      st.ascent.promptQueue = [];
      st.isPaused = false;
      st.isStrategyPause = false;
      world.ascentAccumulator = -1e9;
    } else {
      let g = 0;
      while (st.pendingAscentPrompt && st.pendingAscentPrompt.kind !== 'run-over' && g++ < 12) {
        resolveAscentPrompt(st, window.__firstChoice(st.pendingAscentPrompt, g));
      }
      st.ascent.promptQueue = st.ascent.promptQueue.filter((p) => p.kind === 'run-over');
      st.isPaused = false;
      st.isStrategyPause = true;
    }
    // The four slots that print something else over the country. Each is its own, and none of them
    // is touched by clearing the prompt queue: the wave banner's queued cue, the story ledger
    // ("what changed - Noted"), the Reckoning a resolved fight leaves standing, the whispers.
    if (st.ascent.waveCues) st.ascent.waveCues = [];
    ui.waveCueQueue = [];
    if (ui.waveBanner) {
      try { ui.waveBanner.destroy(); } catch { /* already gone */ }
      ui.waveBanner = undefined;
    }
    st.lastStoryOutcome = undefined;
    if (st.ascent) st.ascent.pendingAftermath = undefined;
    if (!stopOnBattle) {
      try { ui.closeOverlay?.(); ui.closeLane?.(); } catch { /* nothing open */ }
    }
    world.refresh();
    ui.events.emit('state-changed');
    // A live fight does not raise its own screen; it is entered by tapping the bar's lit Battle
    // button. Without this the battle shot is a photograph of the map.
    if (stopOnBattle && st.ascent.activeBattle) ui.openLane('battle');
    return {
      turn: st.turn, wave: st.ascent.wave, year: st.year, season: st.season,
      lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
      capitalHeld: Boolean(st.lands.find((l) => l.type === 'castle' && l.ownerId === 'dai-viet')),
      battle: Boolean(st.ascent.activeBattle),
    };
  }, { ticks, stopOnBattle, battleAfter, seed, pin: PIN_RNG });
}

/**
 * Parks the world camera on a province and returns where it landed. Uses the scene's own pan
 * formula rather than `camera.centerOn`: the map camera has its origin at (0,0), so Phaser centres
 * about the wrong point, which is how the first cut of the README's map shot framed the coast four
 * times running.
 */
export async function frameOn(page, { zoom = 1.2, season, landId, yNudge = 0, sceneKey = 'ConquestScene', skipSettle = false, revealAll = false } = {}) {
  const at = await page.evaluate(({ zoom, season, landId, yNudge, sceneKey, revealAll }) => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene(sceneKey);
    const st = scene.state;
    // A wide shot of a fogged country is a picture of nothing: at 0.55 the unexplored provinces
    // wash out to bare paper and the realm reads as empty. Revealing is what a run does anyway.
    if (revealAll) st.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
    if (season) st.season = season;
    const land = (landId ? st.lands.find((l) => l.id === landId) : undefined)
      ?? st.lands.find((l) => l.ownerId === 'dai-viet' && l.type === 'castle')
      ?? st.lands.find((l) => l.ownerId === 'dai-viet') ?? st.lands[0];
    scene.refresh();
    const ui = game.scene.getScene('ConquestUIScene');
    ui?.events.emit('state-changed');
    ui?.refresh?.();
    const anchor = scene.getSettlementAnchor?.(land) ?? { x: land.x, y: land.y };
    const wx = scene.wx(anchor.x);
    const wy = scene.wy(anchor.y) + yNudge;
    scene.setMapZoom(zoom);
    const cam = scene.cameras.main;
    cam.removeBounds();
    // The sheet, read off the running game rather than assumed.
    //
    // This was `390` — the phone column — which is right on a phone and wrong on the desktop, where
    // the world camera is the whole 1351-unit sheet (`constants.worldCameraWidth`). Framed against
    // 390 on a wide surface the centre lands a third of the way in, which is how the first desktop
    // frame put the capital off the left edge.
    const designW = cam.width / (cam.zoom / zoom);
    const designH = cam.height / (cam.zoom / zoom);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    cam.scrollX = clamp(wx - designW / (2 * zoom), 0, Math.max(0, scene.worldWidth - designW / zoom));
    cam.scrollY = clamp(wy - designH / (2 * zoom), 0, Math.max(0, scene.worldHeight - designH / zoom));
    return { name: land.name, id: land.id, wx, wy, designH };
  }, { zoom, season, landId, yNudge, sceneKey, revealAll });
  // The trailer settles on its own clock instead: with the rAF loop stopped, waiting on a
  // timeout waits on a page that is not drawing.
  if (!skipSettle) await settle(page, sceneKey);
  return at;
}

/**
 * Waits for the map to finish drawing itself. Setting the season starts `prepareSeason`, a
 * generator the scene pumps a bounded slice of per frame — so this cannot be a timeout, and it
 * cannot be one sample either: a job that has not *started* reports exactly what a finished one
 * reports. Four consecutive quiet samples with the chunk counters unmoved.
 */
export async function settle(page, sceneKey = 'ConquestScene') {
  const sample = () => page.evaluate((k) => {
    const scene = window.__phaserGame?.scene.getScene(k);
    const stats = scene?.performanceStats?.();
    if (!stats) return null;
    return {
      busy: Boolean(stats.sceneryPending || stats.refreshPending || stats.ground?.pending),
      mark: [stats.ground?.builds, stats.ground?.invalidations, stats.fog?.builds].join('/'),
    };
  }, sceneKey);
  const deadline = Date.now() + 30000;
  let previous = null;
  let quiet = 0;
  while (Date.now() < deadline) {
    const now = await sample();
    if (!now) return;
    quiet = !now.busy && previous?.mark === now.mark ? quiet + 1 : 0;
    previous = now;
    if (quiet >= 4) break;
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(600);
}

/**
 * Takes Phaser's clock away from rAF and gives it to us. After this the page draws nothing at all
 * unless `__tick` is called, which is exactly the point: no frame can be dropped, and no animation
 * can outrun the capture.
 */
export async function installCrank(page) {
  await page.evaluate(() => {
    const game = window.__phaserGame;
    game.loop.stop();
    window.__clock = 100000;
    window.__tick = (dt) => { window.__clock += dt; game.step(window.__clock, dt); };
  });
}

/** Advances the game by `frames` frames of film. `speed` > 1 runs the world faster than the film. */
export async function crank(page, frames, speed = 1) {
  await page.evaluate(({ frames, dt }) => {
    for (let i = 0; i < frames; i += 1) window.__tick(dt);
  }, { frames, dt: (1000 / RATE) * speed });
}

export const FPS = RATE;
