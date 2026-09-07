/**
 * The README's pictures, produced from the live game so they never drift from it.
 *
 * Every image under docs/readme/ comes out of this script: portrait shots of the screens that
 * explain the game, a four-season strip, a three-theme strip, a row of champion portraits, two
 * crops (the battle field band, the shape-counter ring). Screenshots are taken as PNG and re-encoded to WebP *inside Chromium* — this
 * machine has no image tools, and a 2× PNG of the sheet weighs 1.1 MB where the WebP weighs a
 * tenth of that. Strips are composed the same way, on a canvas, with transparent gutters so they
 * sit on GitHub's light and dark pages alike.
 *
 *   DEV_URL=http://127.0.0.1:5199 node test_scripts/shot/shot-readme.mjs [section...]
 *
 * Sections: menu ascent battle chronicle empire seasons skirmish history portraits graphics.
 * With no arguments every section runs. The README's banner is composed from these files
 * afterwards by `scripts/build-banner.mjs` (`yarn banner`), which needs no game.
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'docs/readme';
const QUALITY = 0.82;
const ONLY = process.argv.slice(2);
const want = (name) => ONLY.length === 0 || ONLY.includes(name);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const written = [];

// ── encoding ────────────────────────────────────────────────────────────────────────────────────

/** A blank page that only ever holds a canvas — the game page is never touched by the encoder. */
const codec = await browser.newPage();
await codec.goto('about:blank');

/**
 * Lays PNG buffers side by side (or one alone), scales, and returns WebP bytes.
 * `gap` is in source pixels; gutters and any spare height are left transparent.
 */
async function encode(buffers, { gap = 0, scale = 1, quality = QUALITY } = {}) {
  const dataUrl = await codec.evaluate(async ({ images, gap, scale, quality }) => {
    const bitmaps = await Promise.all(images.map((src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/png;base64,${src}`;
    })));
    const width = bitmaps.reduce((sum, im) => sum + im.width, 0) + gap * (bitmaps.length - 1);
    const height = Math.max(...bitmaps.map((im) => im.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    let x = 0;
    for (const im of bitmaps) {
      ctx.drawImage(im, Math.round(x * scale), 0, Math.round(im.width * scale), Math.round(im.height * scale));
      x += im.width + gap;
    }
    return canvas.toDataURL('image/webp', quality);
  }, { images: buffers.map((b) => b.toString('base64')), gap, scale, quality });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function save(name, buffers, opts) {
  const bytes = await encode(buffers, opts);
  const path = `${OUT}/${name}.webp`;
  writeFileSync(path, bytes);
  written.push({ path, kb: Math.round(statSync(path).size / 1024) });
  console.log(`   ${path}  ${written.at(-1).kb} KB`);
}

// ── driving the game ────────────────────────────────────────────────────────────────────────────

/**
 * A page of its own browser, closed with it.
 *
 * Every section opens one, and a dozen live WebGL contexts in a single Chromium is over the limit:
 * the late sections start losing the context silently — a half-drawn strip of faces, then a boot
 * whose `__mandateState` never arrives and a run that dies on `st.kingdoms`. Sections are
 * independent, so the cheapest fix is to give each one a browser and let `page.close()` take it
 * down. The codec page stays on the shared browser: it never touches WebGL.
 */
async function newPage(viewport = { width: 390, height: 844 }) {
  const own = await chromium.launch();
  const page = await own.newPage({ viewport, deviceScaleFactor: 2 });
  const closePage = page.close.bind(page);
  page.close = async () => { await closePage(); await own.close(); };
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
  await page.addInitScript(() => {
    localStorage.setItem('mandate:language:v1', 'en');
    if (!localStorage.getItem('mandate:map-theme:v1')) localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
    // The default tier is medium on every device; the dense bake and the live settlement band are
    // behind `high`. A README picture is the one place the game is judged on a machine that can
    // afford them, so the pictures are taken the way the game looks at its best.
    localStorage.setItem('mandate:graphics:v1', 'high');
  });
  return page;
}

async function toMenu(page) {
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
}

/**
 * Boots a mode and **stops its clock on the spot**.
 *
 * `__startBenchGame` seeds the world's construction; the run that follows is pinned by the loop in
 * `advanceAscent`. Between the two, the scene is live — and the second and a half this function
 * used to spend waiting for the first frame is a second and a half of real ticks on the browser's
 * own RNG, a different number of them every time the machine is busier or quieter. That drift is
 * what made the map shot unreproducible: the same seeds, the same code and the same script
 * photographed a nine-province realm one afternoon and a one-province realm the next. Frozen here,
 * the pinned ticks are the only ticks the run ever takes.
 */
async function boot(page, seed, mode) {
  await toMenu(page);
  await page.evaluate(([s, m]) => window.__startBenchGame(s, m), [seed, mode]);
  const key = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
  await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), key, { timeout: 30000 });
  await page.evaluate((k) => {
    window.__mandateState.isPaused = true;
    const world = window.__phaserGame.scene.getScene(k);
    // Belt and braces: the flag stops the clock, the sunk accumulator stops a queued catch-up.
    if (world) world.ascentAccumulator = -1e9;
  }, key);
  await page.waitForTimeout(1500);
}

/**
 * An engaged player: takes the first real option of every card. Installed in-page as
 * `window.__firstChoice`.
 *
 * Every kind the resolver knows is listed, and the list is the whole point. The fall-through used
 * to answer `ok`, an id nothing accepts — so the cards that arrived after this script was written
 * were never answered at all. A `muster-proposal` in particular is the only way a realm raises a
 * host: unanswered, it sat in the slot while the guard loop spun on it, and 150 ticks later the
 * photographed realm had no army, no champion and one province, because the autopilot had been
 * declining to play since the card existed. Same defect `playtest/playtest-lib.mjs` records for
 * its own driver; keep both in step with `AscentResolver.resolveAscentPrompt`.
 */
const FIRST_CHOICE = `
window.__firstChoice = (p, retry) => {
  const affordable = () => (p.options?.find((o) => o.affordable) ?? p.options?.[0])?.id;
  switch (p.kind) {
    case 'founder': return p.options[0];
    case 'power-draft': return p.cards[0] ?? 'skip';
    case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
    case 'conquer-method': {
      // Best odds first, then the next best each time the sheet comes back — a refused attempt
      // re-raises the same card carrying its refusal notice, and answering it with the method that
      // just failed is how one run answered this card 778 times and took nothing. Leaving instead
      // ('back') is no better: it sets a decline cooldown, and a run that declines every claim
      // photographs a realm of one province. So: work down the open methods, leave when they run out.
      const open = [...p.target.methods]
        .filter((m) => !m.blockedReason)
        .sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
      return open[Math.max(0, (retry ?? 1) - 1)]?.method ?? 'back';
    }
    case 'hero-choice': return p.heroIds[0] ?? 'pass';
    // Left as the card scores it. Preferring a host command changes nothing about this run, and
    // preferring a governorship changes everything — the same seeds then hold two provinces at
    // turn 148 instead of nine at turn 110 — so the picture takes the court's own advice.
    case 'court-appointment': return p.options[0].id;
    case 'law-choice': return p.projectIds[0] ? 'edict:' + p.projectIds[0] : 'hold';
    case 'parliament': return 'decline';
    // A doctrine briefs the autopilot rather than overruling it, and the picture wants a realm
    // that grew: 'expand' where it is on the table.
    case 'doctrine': return (p.options.includes('expand') ? 'expand' : p.options[0]) ?? 'hold';
    // A realm that never musters is a realm with nothing to photograph.
    case 'muster-proposal': return 'accept';
    case 'mandate': return p.options[0];
    case 'decree-offer': return p.projectIds?.[0] ?? 'decline';
    case 'empire-response': return p.options[0].id;
    case 'envoy': // The province card: take the free, permanent lever where there is one —
    case 'envoy': // posting a champion spends the one person the court has.
    case 'envoy': case 'province-order': return (p.options.find((o) => o.role === 'focus') ?? p.options[0]).id;
    case 'envoy': case 'famine': case 'rival-demand':
    case 'story-beat': case 'world-event': return affordable();
    default: return affordable() ?? 'ok';
  }
};`;

/**
 * Runs the ascent world forward with prompts answered, then leaves the map clean and redrawn.
 *
 * `__startBenchGame` seeds `Math.random` for state construction only, so the ticks after it are
 * a different run every time — the first cut of this framed a capital that had changed hands.
 * The tick loop pins the RNG too, so the picture is the same one on every regeneration.
 *
 * `battleAfter` lets the early fights resolve themselves and stops on the first that opens at or
 * past that tick: the fight a run meets at turn 15 is two unled militia hosts in a bare winter,
 * and the one it meets at turn 130 has a commander, a reserve, and a summer field worth looking at.
 */
async function advanceAscent(page, ticks, { stopOnBattle = false, battleAfter = 0, seed = 20260818 } = {}) {
  await page.evaluate(FIRST_CHOICE);
  return page.evaluate(async ({ ticks, stopOnBattle, battleAfter, seed }) => {
    const st = window.__mandateState;
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    // A map picture wants the map, not the battle screen a fight opens over it. The battle shot
    // is the one run that wants that screen; every other run lets its generals fight.
    st.ascent.autoResolveBattles = !stopOnBattle || battleAfter > 0;
    // Both are real settings the game offers — silent muster from Settings, silent claim from the
    // Build screen, where the slots it spends are already on show. Left off, every claim and every
    // muster arrives as a card, and a card answered in a headless loop costs the realm the season
    // it was proposed for: measured over 18 seed pairs, a realm that asks holds one province at
    // turn 150 and a realm that acts holds nine at turn 110.
    st.ascent.autoClaimSilently = true;
    st.ascent.autoMusterSilently = true;
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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
      // The wave director raises its start/end banner cues into state and the UI drains them on
      // the next refresh — a 150-tick run leaves up to three queued, and the first regeneration
      // after the banner shipped photographed "INVASION 6 BROKEN" instead of the country. Cleared
      // here, inside the same synchronous evaluate, so the scene never sees them.
      if (st.ascent.waveCues) st.ascent.waveCues = [];
      ui.waveCueQueue = [];
      if (ui.waveBanner) {
        try { ui.waveBanner.destroy(); } catch { /* already gone */ }
        ui.waveBanner = undefined;
      }
      try { ui.closeOverlay?.(); ui.closeLane?.(); } catch { /* nothing open */ }
      // The Chronicle out loud: a whisper holds for 4.5 s and fades over 0.4, so a picture taken
      // while one is leaving catches half a sentence under whatever notice is over it. Silenced
      // for the photograph — the strip is in the video, not in the still.
      try { ui.whispers?.setVisible(false); } catch { /* not built yet */ }
      // Whatever held the world during the run — a banner's end-plate, a system prompt, a lane
      // closer restoring the hold it remembered — the photograph wants a running realm: both
      // pause flags off (each prints a PAUSED plate and swaps the action bar to Resume), and the
      // tick accumulator sunk so the clock stays quiet through the framing waits anyway.
      st.isPaused = false;
      st.isStrategyPause = false;
      world.ascentAccumulator = -1e9;
    } else {
      // The battle owns the screen; anything else that came up in the same tick is answered so
      // no story card sits over the field. The hold here can be the honest one — the battle
      // screen covers the map HUD, so no plate shows.
      let g = 0;
      while (st.pendingAscentPrompt && st.pendingAscentPrompt.kind !== 'run-over' && g++ < 12) {
        resolveAscentPrompt(st, window.__firstChoice(st.pendingAscentPrompt, g));
      }
      st.ascent.promptQueue = st.ascent.promptQueue.filter((p) => p.kind === 'run-over');
      st.isPaused = false;
      st.isStrategyPause = true;
      // The invasion banner, for the same reason the map branch above clears it: a fight this
      // late in a run always opens inside a wave, so the cue for that wave is still queued and
      // the UI raises it on the next refresh. The map shot learned this; this branch never did,
      // and photographed "INVASION 5" across the middle of the field.
      if (st.ascent.waveCues) st.ascent.waveCues = [];
      ui.waveCueQueue = [];
      if (ui.waveBanner) {
        try { ui.waveBanner.destroy(); } catch { /* already gone */ }
        ui.waveBanner = undefined;
      }
    }
    // Answering a story beat *publishes* its ledger — the "what changed · Noted" card — into
    // `lastStoryOutcome`, a slot of its own that clearing the prompt queue does not touch. Three
    // regenerations in a row photographed The Reed Banner's receipts instead of the country
    // before this line existed.
    st.lastStoryOutcome = undefined;
    // A fight that ends while the autopilot runs leaves its Reckoning standing in
    // `ascent.pendingAftermath`, and the shell raises that over everything on the next refresh —
    // the map, the draft, the conquest card and the summon were all photographed as one battle
    // report before this line existed. It is its own slot; no prompt clearing touches it.
    if (st.ascent) st.ascent.pendingAftermath = undefined;
    world.refresh();
    ui.events.emit('state-changed');
    // A live fight does not raise its own screen. `shell.ts` opens the battle lane unasked for
    // exactly one case — `ascent.frontsOpened`, a war spreading to a second province — because a
    // player already watching one field asked not to be moved to another. Every other fight is
    // entered by tapping Battle, which is what the bar's lit red button is for. So this taps it:
    // without the call the picture is the map with an invasion banner over it, which is how the
    // battle shot came back as a photograph of the country.
    if (stopOnBattle && st.ascent.activeBattle) ui.openLane('battle');
    const capital = st.lands.find((l) => l.type === 'castle' && l.ownerId === 'dai-viet');
    return { turn: st.turn, wave: st.ascent.wave, lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length, capitalHeld: Boolean(capital), battle: Boolean(st.ascent.activeBattle) };
  }, { ticks, stopOnBattle, battleAfter, seed });
}

const shot = (page, clip) => page.screenshot(clip ? { clip } : {});

/**
 * Parks the world camera on a province and says where on the sheet it landed. The player's
 * capital unless `landId` names another — the seasons strip wants a paddy country, and on this
 * map the capital sits in a mountain pass where nothing floods and nothing ripens.
 *
 * Uses the scene's own pan formula, not `camera.centerOn`: the map camera has its origin at (0,0)
 * so Phaser centres about the wrong point, which is how the first cut of this photographed the
 * coast four times. The season is pinned too — a run left to itself lands on whatever the tick
 * count says, and winter's bare trees are the least inviting picture of the country.
 */
async function frameCapital(page, sceneKey, { zoom = 1.2, season, revealAll = false, hideUi = false, yNudge = 0, landId, own = false } = {}) {
  const at = await page.evaluate(({ sceneKey, zoom, season, revealAll, hideUi, yNudge, landId, own }) => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene(sceneKey);
    const st = scene.state;
    if (hideUi) game.scene.getScene(sceneKey === 'ConquestScene' ? 'ConquestUIScene' : 'UIScene')?.scene.setVisible(false);
    if (revealAll) st.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
    if (season) st.season = season;
    const capital = (landId ? st.lands.find((l) => l.id === landId) : undefined)
      ?? st.lands.find((l) => l.ownerId === 'dai-viet' && l.type === 'castle')
      ?? st.lands.find((l) => l.ownerId === 'dai-viet') ?? st.lands[0];
    // A neutral province draws washed toward the paper; the strip wants the country at full
    // pigment, so the framed land is taken into the realm for the length of the photograph.
    if (own) capital.ownerId = 'dai-viet';
    scene.refresh();
    // The header prints the season too; make sure it agrees with the ground.
    const uiScene = game.scene.getScene(sceneKey === 'ConquestScene' ? 'ConquestUIScene' : 'UIScene');
    uiScene?.events.emit('state-changed');
    uiScene?.refresh?.();
    // The citadel is drawn on the province's fortress hexes, which can be most of a province away
    // from the centroid the land node sits on — so aim at the seat the settlement renderer uses.
    const anchor = scene.getSettlementAnchor?.(capital) ?? { x: capital.x, y: capital.y };
    const wx = scene.wx(anchor.x);
    const wy = scene.wy(anchor.y) + yNudge;
    scene.setMapZoom(zoom);
    const cam = scene.cameras.main;
    // The scene sets no Phaser bounds any more (its own clamp is the right one for an origin-(0,0)
    // camera); this is a no-op kept so the framing stays correct against an older checkout.
    cam.removeBounds();
    const renderScale = cam.zoom / zoom;
    const designW = 390;
    const designH = cam.height / renderScale;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    cam.scrollX = clamp(wx - designW / (2 * zoom), 0, Math.max(0, scene.worldWidth - designW / zoom));
    cam.scrollY = clamp(wy - designH / (2 * zoom), 0, Math.max(0, scene.worldHeight - designH / zoom));
    return { sx: (wx - cam.scrollX) * zoom, sy: (wy - cam.scrollY) * zoom, designH, name: capital.name };
  }, { sceneKey, zoom, season, revealAll, hideUi, yNudge, landId, own });
  await settle(page, sceneKey);
  return at;
}

/**
 * Waits for the map to finish drawing itself, rather than guessing how long that takes.
 *
 * Setting `state.season` does not repaint the country — it starts `prepareSeason`, a generator the
 * scene pumps a bounded slice of per frame: scatter, then accents, then every land's ink and
 * labels, then the ground bake, then the culling sweep. `performanceStats()` reports it as
 * `sceneryPending`, and `refreshPending` covers the refresh job beside it.
 *
 * This used to be `waitForTimeout(1600)`, and 1600 ms is not enough on a machine with anything
 * else running. The seasons strip is where that showed, because it changes the season four times
 * on one page: the panels came back progressively fuller — Spring bare paper, Summer one clump of
 * bamboo, Autumn and Winter most of an orchard — which is not four seasons of a country, it is one
 * repaint photographed four times while it was still going. A timeout cannot be tuned out of this;
 * the job is bounded by frames, so a busy machine simply gets fewer of them.
 *
 * Waiting for the flags to be clear is not enough either, and this is the subtler half: a job that
 * has not *started* reports exactly what a finished one reports. Framing sets the season and calls
 * `refresh()`, the job registers a frame or two later, and a wait that polls in between sees a
 * quiet scene and returns immediately — which is how the first full pass after this function was
 * written still photographed a bare Spring beside three painted seasons. So this waits for
 * quiet that *stays* quiet: four consecutive samples with nothing pending and the chunk counters
 * unmoved. Stability, not a flag, and not a number of milliseconds.
 */
async function settle(page, sceneKey) {
  const sample = () => page.evaluate((k) => {
    const scene = window.__phaserGame?.scene.getScene(k);
    const stats = scene?.performanceStats?.();
    if (!stats) return null;
    return {
      busy: Boolean(stats.sceneryPending || stats.refreshPending || stats.ground?.pending),
      // The counters, so a job that finishes one chunk and starts the next is not mistaken for a
      // finished map between two samples.
      mark: [stats.ground?.builds, stats.ground?.invalidations, stats.fog?.builds].join('/'),
    };
  }, sceneKey);

  const deadline = Date.now() + 30000;
  let previous = null;
  let quiet = 0;
  while (Date.now() < deadline) {
    const now = await sample();
    if (!now) return;                       // a scene with no stats has nothing to wait for
    quiet = !now.busy && previous?.mark === now.mark ? quiet + 1 : 0;
    previous = now;
    if (quiet >= 4) break;                  // four consecutive quiet samples, ~600 ms of nothing
    await page.waitForTimeout(150);
  }
  // The counters going quiet is not the same as the frame being drawn: the last slice bakes the
  // ground and re-registers culling, and what is on the GPU is a frame behind that. Also covers the
  // season cross-fade, which is a tween rather than part of the job.
  await page.waitForTimeout(700);
}

/** A square of `size` design units around the framed subject, kept on the sheet. */
function squareAround(at, size = 390) {
  const x = Math.max(0, Math.min(390 - size, at.sx - size / 2));
  const y = Math.max(0, Math.min(at.designH - size, at.sy - size / 2));
  return { x, y, width: size, height: size };
}

// The paddy country the seasons and themes strips are shot over: a river, a hamlet, and plots in
// every direction on the seed-1337 rival map. Chosen from a contact sheet of every farm province —
// the capital of this map sits in a mountain pass, which photographs the same in June and January.
const SEASONS_LAND = 'district-02';

let ascentMapPng, founderPng, battlePng;

// ── 1 · the Wise code ───────────────────────────────────────────────────────────────────────────
//
// Named `menu` because it used to photograph the front page as well — that frame existed only to
// be the first panel of the old filmstrip banner, and nothing has wanted it since the banner became
// a composed sheet. The section stays for the code below, which does need a booted game.
if (want('menu')) {
  console.log('menu');
  const page = await newPage();
  await toMenu(page);
  await page.waitForTimeout(600);

  // The Support section shows the Wise code on its own — the same code the game draws, rendered by
  // the game's own encoder so the README can never disagree with the modal. PNG, not WebP: a code
  // is flat black on white and lossless is both smaller and safer for a scanner.
  const wiseQr = await page.evaluate(async () => {
    const [{ encodeQr }, { SUPPORT }] = await Promise.all([import('/src/utils/qr.ts'), import('/src/data/support.ts')]);
    const link = SUPPORT.channels.find((c) => c.id === 'wise')?.link;
    if (!link) return null;
    const matrix = encodeQr(link, 'M');
    const scale = 10;
    const quiet = 4;
    const px = (matrix.size + quiet * 2) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#2a2118';
    for (let y = 0; y < matrix.size; y += 1) for (let x = 0; x < matrix.size; x += 1) if (matrix.modules[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    return { link, dataUrl: canvas.toDataURL('image/png') };
  });
  if (wiseQr) {
    const path = `${OUT}/qr-wise.png`;
    writeFileSync(path, Buffer.from(wiseQr.dataUrl.split(',')[1], 'base64'));
    written.push({ path, kb: Math.round(statSync(path).size / 1024) });
    console.log(`   ${path}  ${written.at(-1).kb} KB  (${wiseQr.link})`);
  }
  await page.close();
}

// ── 2 · Dragon Ascent: the map after a while, then the cards ────────────────────────────────────
if (want('ascent')) {
  console.log('dragon ascent');
  const page = await newPage();
  // Seeds by audition, not accident, and re-auditioned whenever the balance moves — on the frozen
  // clock, or the audition is of a different run than the camera will see. Driven over a grid of
  // boot/tick pairs, this one is the realm that both grows and survives: eight provinces from tick
  // 50 to 75, three hosts, the capital never lost. It is photographed at that peak rather than at a
  // round number — the same run is down to two provinces by tick 125, because the rivals take back
  // what a realm stops defending.
  await boot(page, 20260901, 'ascent');
  founderPng = await shot(page);
  await save('founder', [founderPng]);

  const progress = await advanceAscent(page, 65, { seed: 20260901 });
  console.log('   run:', JSON.stringify(progress));
  const ascentFrame = await frameCapital(page, 'ConquestScene', { zoom: 1.2, season: 'Autumn', yNudge: 40 });
  console.log('   framed on', ascentFrame.name, `at sheet ${Math.round(ascentFrame.sx)},${Math.round(ascentFrame.sy)}`);
  ascentMapPng = await shot(page);
  await save('ascent-map', [ascentMapPng]);

  // The power draft: the roguelite's card pick.
  await page.evaluate(async () => {
    const st = window.__mandateState;
    const { offerPowerDraft } = await import('/src/systems/ascent/PowerDraftSystem.ts');
    const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
    st.ascent.pendingLevelUps = Math.max(1, st.ascent.pendingLevelUps ?? 0);
    offerPowerDraft(st);
    drainAscentPrompts(st);
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
  });
  await page.waitForTimeout(700);
  const draftPng = await shot(page);
  await save('power-draft', [draftPng]);

  // Where do we press: the conquest card.
  await page.evaluate(async () => {
    const st = window.__mandateState;
    st.pendingAscentPrompt = undefined;
    st.ascent.promptQueue = [];
    const C = await import('/src/systems/ascent/ConquestSystem.ts');
    const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
    C.offerConquestPrompt(st);
    drainAscentPrompts(st);
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
  });
  await page.waitForTimeout(700);
  const conquerPng = await shot(page);
  await save('conquer', [conquerPng]);

  // The Build lane: the works a province can raise, priced by the economy that will pay for them.
  await page.evaluate(() => {
    const st = window.__mandateState;
    st.pendingAscentPrompt = undefined;
    st.ascent.promptQueue = [];
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.events.emit('state-changed');
    ui.openLane('build');
  });
  await page.waitForTimeout(900);
  await save('build', [await shot(page)]);

  // The summon: the gacha card, drawn over the same realm so the header vouches for the price.
  await page.evaluate(async () => {
    const st = window.__mandateState;
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    try { ui.closeLane?.(); } catch { /* nothing open */ }
    const { offerHeroSummon } = await import('/src/systems/ascent/SummonSystem.ts');
    const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
    st.pendingAscentPrompt = undefined;
    st.ascent.promptQueue = [];
    offerHeroSummon(st);
    drainAscentPrompts(st);
    ui.events.emit('state-changed');
  });
  await page.waitForTimeout(900);
  await save('summon', [await shot(page)]);

  await page.close();
}

// ── 3 · a battle that opened itself ─────────────────────────────────────────────────────────────
if (want('battle')) {
  console.log('battle');
  const page = await newPage();
  await boot(page, 20260901, 'ascent');
  // The same run the map is photographed on, carried past its peak to the first fight that opens
  // after tick 90 — chosen from a contact sheet of every opening this run offers, because most of
  // them are a province levy defending itself and a levy has no commander to put in the corner of
  // the screen. At 90 the wave that arrives is the one that reaches the capital: two ranked hosts
  // of ~2.5k on a summer field, and Đinh Hoài Hiển in the commander's box.
  //
  // Re-auditioned 2026-09-07, and the reason is worth keeping. This read 130 while the realm
  // could still afford it. Every tick before the threshold is fought by the autopilot rather than
  // watched, and the seasons since — the wealth-scaled purse, the Four Courts difficulty dial —
  // made 130 ticks of autopilot more than this seed survives: the run was over at turn 119, so
  // the loop ran out with no fight to stop on and the shot came back as the run-over sheet, a
  // dynasty-lost screen captioned "Formations answer formations" on both stores. A threshold this
  // script cannot reach fails silently, in the one direction nothing checks. If a balance pass
  // moves the numbers again, re-audition rather than nudging the number: the run must still hold
  // its capital at the tick it stops on, which is what the log line below prints.
  const battle = await advanceAscent(page, 400, { stopOnBattle: true, battleAfter: 90, seed: 20260901 });
  console.log('   run:', JSON.stringify(battle));
  await page.waitForTimeout(1200);
  battlePng = await shot(page);
  await save('battle', [battlePng]);
  // The field alone, wide: how a host is drawn — ranked figures in their shape, the banner, the
  // camp behind. Same held frame as the full shot, cropped to the band between the commander
  // card and the strength bars.
  await save('armies', [await shot(page, { x: 0, y: 186, width: 390, height: 296 })]);
  await page.close();
}

// ── 4 · the Chronicle: a story card, reached by a headless run handed to the real scene ──────────
if (want('chronicle')) {
  console.log('chronicle');
  const page = await newPage();
  await toMenu(page);
  await page.evaluate(FIRST_CHOICE);
  const story = await page.evaluate(async () => {
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    let s = 20260816 >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    let found = null;
    for (let i = 0; i < 400 && !found; i += 1) {
      advanceAscentTick(st);
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 8) {
        const p = st.pendingAscentPrompt;
        if (p.kind === 'story-beat') { found = { templateId: p.templateId, fragmentId: p.fragmentId }; break; }
        if (p.kind === 'run-over') break;
        resolveAscentPrompt(st, window.__firstChoice(p, guard));
      }
    }
    window.__shotState = st;
    return { found, turn: st.turn };
  });
  console.log('   story:', JSON.stringify(story));
  await page.evaluate(() => window.__phaserGame.scene.start('ConquestScene', { state: window.__shotState }));
  await page.waitForTimeout(3000);
  const chroniclePng = await shot(page);
  await save('chronicle', [chroniclePng]);
  await page.close();
}

// ── 5 · a classic mode: Throne of Empires on the hand-played map ────────────────────────────────
if (want('empire')) {
  console.log('empire');
  const page = await newPage();
  await boot(page, 1337, 'empire');
  await page.evaluate(async () => {
    const st = window.__mandateState;
    const { advanceRealtimeMonth } = await import('/src/systems/RealtimeSystem.ts');
    let s = 20260818 >>> 0;   // pinned, like the ascent loop — an unpinned run lost the capital once
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 70; i += 1) {
      st.pendingCourtRequest = undefined; st.activePoliticsCard = undefined; st.pendingForeignCard = undefined;
      st.pendingHeroEvent = undefined; st.pendingThreatAlert = undefined; st.pendingBattle = undefined; st.isPaused = false;
      advanceRealtimeMonth(st);
    }
    // The slots are cleared at the head of each month, but the *last* month raises its own:
    // the first cut of this photographed an envoy's Call to Arms sitting over the whole country.
    st.pendingCourtRequest = undefined; st.activePoliticsCard = undefined; st.pendingForeignCard = undefined;
    st.pendingHeroEvent = undefined; st.pendingThreatAlert = undefined; st.pendingBattle = undefined;
    st.isPaused = false;
    const ui = window.__phaserGame.scene.getScene('UIScene');
    try { ui.closeModal?.(); } catch { /* nothing open */ }
    const world = window.__phaserGame.scene.getScene('MapScene');
    // Clearing the slots is not enough on its own, because `isPaused = false` hands the clock back
    // and the framing that follows takes real seconds. `MapScene.update` counts them into
    // `realtimeAccumulator` and calls `advanceRealtimeMonth` every REALTIME_TICK_MS, which raises
    // a fresh card into a slot this code has already swept — and the picture is that card. Sinking
    // the accumulator buys silence without printing a PAUSED plate over the country, which is
    // exactly the trade `advanceAscent` makes with `ascentAccumulator` for the Dragon Ascent map.
    //
    // The old fixed 1600 ms wait mostly landed inside one month and mostly got away with it. It
    // stopped getting away with it the moment the wait became honest: the first full pass after
    // `settle()` replaced the timeout photographed a Court Request covering the whole map.
    world.realtimeAccumulator = -1e9;
    world.refresh();
    ui.refresh?.();
  });
  const empireFrame = await frameCapital(page, 'MapScene', { zoom: 1.15, season: 'Summer', yNudge: 40, revealAll: true });
  console.log('   framed on', empireFrame.name, `at sheet ${Math.round(empireFrame.sx)},${Math.round(empireFrame.sy)}`);
  // The UI plays a 1.7 s "Year N" plaque when it notices the year changed, and nine years just did.
  await page.waitForTimeout(1500);
  const empirePng = await shot(page);
  await save('empire-map', [empirePng]);
  await page.close();
}

// ── 6 · the four seasons, one square of the same country ────────────────────────────────────────
if (want('seasons')) {
  console.log('seasons');
  const page = await newPage();
  await boot(page, 1337, 'rival');
  await page.evaluate(() => { window.__mandateState.isPaused = true; });
  const seasonPngs = [];
  for (const season of ['Spring', 'Summer', 'Autumn', 'Winter']) {
    const at = await frameCapital(page, 'MapScene', { zoom: 1.35, season, revealAll: true, hideUi: true, yNudge: 30, landId: SEASONS_LAND, own: true });
    seasonPngs.push(await shot(page, squareAround(at)));
  }
  await save('seasons', seasonPngs, { gap: 24, scale: 0.5 });
  await page.close();
}

// ── 7 · the three themes ────────────────────────────────────────────────────────────────────────
//
// Removed 2026-09-07, and not because the shot was hard to take.
//
// `OFFERED_MAP_THEMES` in ui/mapTheme.ts is `['dong-ho']`, and `getMapTheme()` clamps to it: the
// ink-wash and illustrated-atlas themes were withdrawn on purpose, because the battle screen's
// proportion contract and every prop in ui/ink are tuned against Đông Hồ and the other two had not
// kept pace. So this section set the theme in localStorage three times, got `DongHoMapRenderer`
// three times, and composed a strip of the same square repeated — a picture of a choice the game
// does not offer. Nothing referenced the file.
//
// If the array ever grows back, this is a dozen lines: frame `SEASONS_LAND` once per offered
// theme, exactly as the seasons strip frames it once per season.

// ── 8 · Skirmish: the muster form ───────────────────────────────────────────────────────────────
if (want('skirmish')) {
  console.log('skirmish');
  const page = await newPage();
  await toMenu(page);
  await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').scene.start('BattleArenaScene'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('BattleArenaScene'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await save('skirmish', [await shot(page)]);
  // The counter ring the muster form teaches — cropped out as the fight section's diagram.
  // The ring folds shut by default (`ringOpen`), and the first regeneration after it learned to
  // fold photographed 310x134 of blank paper under a collapsed heading. Opened here, and the crop
  // is read off the toggle zone the scene draws over it rather than guessed: the ring's height is
  // five labels tall and those change with the language.
  const ringAt = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('BattleArenaScene');
    scene.ringOpen = true;
    scene.render();
    // The scene draws an invisible toggle zone over the heading *and* the ring, exactly the
    // rectangle this crop wants — but the page holds several wide zones (the scroll area is one),
    // and taking the last of them photographed the host controls. The ring's zone is the one whose
    // top sits on the heading, so the heading is what finds it.
    const all = scene.children.list.concat(...scene.children.list.map((c) => c.list ?? []));
    const heading = all.find((c) => c.type === 'Text' && /BEATS WHICH/i.test(c.text ?? ''));
    if (!heading) return null;
    const head = heading.getBounds();
    const zone = all
      .filter((c) => c.type === 'Zone' && c.width > 300 && c.height > 40)
      .find((c) => Math.abs(c.getBounds().y - head.y) < 8);
    if (!zone) return null;
    // World bounds, not the object's own x/y: everything the arena draws is added to a layer
    // container, so its coordinates are that container's, not the page's.
    const b = zone.getBounds();
    return { x: b.x, y: b.y, width: b.width, height: b.height, headHeight: head.height };
  });
  await page.waitForTimeout(500);
  if (!ringAt) throw new Error('shapes-ring: the counter ring did not open');
  await save('shapes-ring', [await shot(page, {
    x: ringAt.x, y: ringAt.y + ringAt.headHeight + 4, width: ringAt.width,
    height: ringAt.height - ringAt.headHeight - 4,
  })]);
  await page.close();
}

// ── 9 · the History page, reached by its real button ────────────────────────────────────────────
if (want('history')) {
  console.log('history');
  const page = await newPage();
  await toMenu(page);
  // Polled, not sampled once: the front page builds its diorama over a second or so and the
  // button is not in `children.list` until it does.
  const at = await page.waitForFunction(() => {
    const s = window.__phaserGame.scene.getScene('MenuScene');
    for (const c of s.children.list) {
      const label = c.list?.find?.((k) => k.type === 'Text');
      if (label && /Lịch sử|History/.test(label.text)) {
        const m = label.getWorldTransformMatrix();
        return { x: m.tx, y: m.ty };
      }
    }
    return null;
  }, null, { timeout: 15000 }).then((h) => h.jsonValue());
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('HistoryScene'), null, { timeout: 8000 });
  await page.waitForTimeout(900);
  // The figures tab: real people with their portraits, which is the page's whole argument.
  const SIDE = 12;
  const tabWidth = Math.floor((390 - SIDE * 2 - 4 * 4) / 5);
  await page.mouse.click(SIDE + 1 * (tabWidth + 4) + tabWidth / 2, 84);
  await page.waitForTimeout(600);
  await save('history', [await shot(page)]);
  await page.close();
}

// ── 10 · a row of champions: who a portrait is, before the seed draws it ────────────────────────
if (want('portraits')) {
  console.log('portraits');
  const page = await newPage();
  await boot(page, 1337, 'ascent');
  const rows = [];
  for (const half of [0, 1]) {
    const rowH = await page.evaluate(async ({ half }) => {
      const { renderHeroFace, HERO_FACE_W } = await import('/src/ui/FaceRenderer.ts');
      const { heroTemplates } = await import('/src/data/heroes.ts');
      const { UI_FONT } = await import('/src/ui/fonts.ts');
      // Ten from the roster, one man and one woman from every era the wardrobe knows, so the row
      // itself says what the caption claims: era, office and sex decide the clothes. Templates
      // are keyed by `id` — the first cut deduplicated on a field they don't have, and a set
      // holding one `undefined` vetoed every candidate after the first.
      const SPEC = [
        ['dinh', 'man'], ['ly', 'woman'], ['tran', 'man'], ['le', 'woman'], ['tayson', 'man'],
        ['nguyen', 'woman'], ['tran', 'woman'], ['le', 'man'], ['ly', 'man'], ['nguyen', 'man'],
      ];
      const used = new Set();
      const pick = (era, sex) => {
        const hero = heroTemplates.find((h) => h.era === era && h.sex === sex && !used.has(h.id))
          ?? heroTemplates.find((h) => h.era === era && !used.has(h.id));
        if (hero) used.add(hero.id);
        return hero;
      };
      const picks = SPEC.map(([era, sex]) => pick(era, sex)).filter(Boolean).slice(0, 10);
      const row = picks.slice(half * 5, half * 5 + 5);
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      scene.children.removeAll(true);
      const cellW = 390 / 5;
      const scale = (cellW - 10) / HERO_FACE_W;
      // The frame the renderer draws is bigger than the bare face extents (a border, a pin), so
      // the row is laid out from measured bounds rather than a guessed anchor — the guess put
      // every caption across the chin.
      const faces = row.map((hero, i) => {
        const face = renderHeroFace(scene, hero, i * cellW + cellW / 2, 0, scale);
        scene.add.existing(face);
        return { hero, face };
      });
      let bottom = 0;
      for (const { face } of faces) {
        const b = face.getBounds();
        face.y = 8 - b.top;
        bottom = Math.max(bottom, 8 + b.height);
      }
      const rowH = Math.ceil(bottom + 24);
      scene.add.graphics().fillStyle(0xe8ddc4, 1).fillRect(0, 0, 390, rowH).setDepth(-1);
      faces.forEach(({ hero }, i) => {
        scene.add.text(i * cellW + cellW / 2, bottom + 5, hero.name, {
          fontFamily: UI_FONT, fontSize: '9px', fontStyle: '600', color: '#2a2118', align: 'center',
        }).setOrigin(0.5, 0);
      });
      return rowH;
    }, { half });
    await page.waitForTimeout(400);
    rows.push(await shot(page, { x: 0, y: 0, width: 390, height: rowH }));
  }
  await save('portraits', rows, { gap: 16 });
  await page.close();
}

// ── 11 · the graphics section: invented champions, and the hosts of five kingdoms ───────────────
if (want('graphics')) {
  console.log('graphics');
  const page = await newPage();
  await boot(page, 1337, 'ascent');

  // Ten champions who exist in no roster: the generator invents the person — name, era, office —
  // and the wardrobe dresses them like anyone real. Same layout as the roster strip.
  const genRows = [];
  for (const half of [0, 1]) {
    const rowH = await page.evaluate(async ({ half }) => {
      const { renderHeroFace, HERO_FACE_W } = await import('/src/ui/FaceRenderer.ts');
      const { generateHero } = await import('/src/data/heroFactory.ts');
      const { UI_FONT } = await import('/src/ui/fonts.ts');
      const row = Array.from({ length: 5 }, (_, i) => generateHero(90210 + (half * 5 + i) * 7919));
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      scene.children.removeAll(true);
      const cellW = 390 / 5;
      const scale = (cellW - 10) / HERO_FACE_W;
      const faces = row.map((hero, i) => {
        const face = renderHeroFace(scene, hero, i * cellW + cellW / 2, 0, scale);
        scene.add.existing(face);
        return { hero, face };
      });
      let bottom = 0;
      for (const { face } of faces) {
        const b = face.getBounds();
        face.y = 8 - b.top;
        bottom = Math.max(bottom, 8 + b.height);
      }
      // No name captions here: a generated name arrives with its office attached — "Sư Đề Đốc
      // Chu Nữ Thái" — and five of those in 78px cells print over each other. The roster strip
      // carries the names; this one is about the wardrobe.
      void UI_FONT;
      const rowH = Math.ceil(bottom + 10);
      scene.add.graphics().fillStyle(0xe8ddc4, 1).fillRect(0, 0, 390, rowH).setDepth(-1);
      return rowH;
    }, { half });
    await page.waitForTimeout(400);
    genRows.push(await shot(page, { x: 0, y: 0, width: 390, height: rowH }));
  }
  await save('faces-generated', genRows, { gap: 16 });

  // Five kingdoms, five shapes: the same host drawing that stands on the battlefield, one realm
  // per frame — the men in the shape they hold, the standard carrying the ownership. The kingdom
  // colour is deliberately not on the men (see MapItemRenderer); the banner is the flag.
  const SHAPES = ['chong', 'xung', 'tan', 'quy', 'no'];
  const HOST_H = 200;
  const hostShots = [];
  for (const [k, shape] of SHAPES.entries()) {
    const info = await page.evaluate(async ({ k, shape, HOST_H }) => {
      const st = window.__mandateState;
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      scene.children.removeAll(true);
      const { createMapItemRenderer } = await import('/src/ui/MapItemRenderer.ts');
      const { hostKitFor } = await import('/src/ui/ink/devices.ts');
      const { BATTLE_HOST_SCALE } = await import('/src/game/ascentConfig.ts');
      const { t } = await import('/src/i18n/index.ts');
      const { UI_FONT } = await import('/src/ui/fonts.ts');
      const kingdom = st.kingdoms[k];
      // A real army is the honest template — its units and composition come from the run — and
      // the clone only moves it under another banner.
      const template = st.armies.find((a) => a.kingdomId === 'dai-viet') ?? st.armies[0];
      const clone = { ...template, kingdomId: kingdom.id };
      const items = createMapItemRenderer(scene);
      scene.add.graphics().fillStyle(0xe8ddc4, 1).fillRect(0, 0, 390, HOST_H).setDepth(-1);
      // At the battlefield's own scale — the first cut passed 1 and photographed five smudges
      // with flags in a desert of paper.
      const marker = items.createArmyMarker(
        1400, kingdom.id === 'dai-viet', undefined, Math.max(0, k),
        { ...hostKitFor(st, clone), mustered: 1400, shape },
        BATTLE_HOST_SCALE,
      );
      marker.setPosition(195, 100);
      const gloss = t(`ascent.formation.${shape}.gloss`);
      const name = t(`ascent.formation.${shape}`);
      scene.add.text(195, HOST_H - 30, `${kingdom.name}  ·  Thế ${name} — ${gloss}`, {
        fontFamily: UI_FONT, fontSize: '11px', fontStyle: '700', color: '#2a2118', align: 'center',
      }).setOrigin(0.5, 0);
      return { kingdom: kingdom.name };
    }, { k, shape, HOST_H });
    console.log('   host:', info.kingdom, shape);
    await page.waitForTimeout(700);
    hostShots.push(await shot(page, { x: 0, y: 0, width: 390, height: HOST_H }));
  }
  await save('kingdom-armies', hostShots, { gap: 14, scale: 0.62 });
  await page.close();
}

// ── 12 · the banner ─────────────────────────────────────────────────────────────────────────────
//
// Moved to scripts/build-banner.mjs on 2026-09-07. It used to be composed here, by laying the menu,
// map, founder and battle frames side by side on transparent gutters — a filmstrip with nothing on
// it saying what the game was called. The banner is now a sheet: the wordmark over five of these
// screens fanned like a held hand, cut the same way build-share.mjs cuts the og:image.
//
// It belongs there rather than here because it needs no game and no dev server — only the committed
// webp files this script produces. Run `yarn banner` after a shot pass.

await codec.close();
await browser.close();

console.log('\n=== WRITTEN ===');
for (const w of written) console.log(`${String(w.kb).padStart(5)} KB  ${w.path}`);
console.log(`total ${written.reduce((s, w) => s + w.kb, 0)} KB in ${written.length} files`);
console.log(errors.length ? `console errors:\n  ${errors.slice(0, 8).join('\n  ')}` : 'no console errors');
