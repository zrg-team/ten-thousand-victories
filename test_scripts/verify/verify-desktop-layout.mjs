/**
 * The desktop layout: a wide sheet with the world across it and the 390-wide chrome column at the
 * right edge — and the phone untouched.
 *
 * Five contexts. A/B are the desktop at two window sizes, asked for by `?layout=desktop` (a driven
 * browser never gets it by sniffing — see `src/platform/layout.ts`); C is the desktop cabinet,
 * declared on `window.__shell` and given nothing else; D is the phone control; E is a wide window
 * with no ask at all, which must stay the phone layout because `navigator.webdriver` is set.
 *
 * What is asserted is what a player would notice: the canvas fills the window, the column and the
 * world are where the cameras say, a province answers a click through the DOM, a lane dims the map
 * and deafens it, the keys do what the bar does, the wheel zooms about the cursor and not over the
 * column, a resize re-fits the sheet, and a run started from the front page is hands-on.
 *
 *   node test_scripts/verify/verify-desktop-layout.mjs
 */
import { chromium } from 'playwright';
import { READ_OPTIONS } from '../playtest/playtest-lib.mjs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};
const DESKTOP_H = 760;
const expectedWidth = (w, h) => Math.round(Math.max(780, Math.min(1824, DESKTOP_H * (w / h))));

const browser = await chromium.launch();

async function boot({ viewport, query = '', shell, realBrowser = false, stored, tour = false }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('mandate:language:v1', 'en'); } catch { /* blocked */ } });
  // A layout pinned from Settings, as a returning player's browser carries it.
  if (stored) await page.addInitScript((value) => { try { localStorage.setItem('mandate:layout:v1', value); } catch { /* blocked */ } }, stored);
  // A real browser reports `navigator.webdriver` false; that is the one thing the harness gate
  // reads, so spoofing it is how the auto rule is tested as a player would meet it.
  if (realBrowser) {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true }); });
    // ...and a real browser gets the first-run tours, whose veil would take the click meant for
    // Play. Marked seen, the way a returning player's browser has them — unless the tour itself
    // is what the context is about.
    if (!tour) await page.addInitScript(() => {
      try {
        for (const key of ['mandate:tour:v1', 'mandate:tour:run:v1', 'mandate:tour:classic:v1']) localStorage.setItem(key, 'seen');
      } catch { /* blocked */ }
    });
  }
  await page.addInitScript(READ_OPTIONS);
  if (shell) await page.addInitScript(`window.__shell = ${JSON.stringify(shell)};`);
  const errors = [];
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 200)}`); });
  await page.goto(`${URL}/?capture=1${query}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
    null, { timeout: 30000 },
  );
  await page.waitForTimeout(500);
  return { page, context, errors };
}

/** Everything about the sheet and the cameras, in design units. */
const layoutOf = (page) => page.evaluate(() => {
  const game = window.__phaserGame;
  const rs = window.__renderScale();
  const rect = game.canvas.getBoundingClientRect();
  const cams = {};
  for (const scene of game.scene.getScenes(true)) {
    const c = scene.cameras.main;
    if (c) cams[scene.scene.key] = [c.x / rs, c.y / rs, c.width / rs, c.height / rs, c.scrollX];
  }
  return {
    surface: window.__designSurface, rs,
    gameSize: [game.scale.width / rs, game.scale.height / rs],
    canvas: [rect.width, rect.height], window: [window.innerWidth, window.innerHeight], cams,
  };
});

/** The run's state and chrome, read off the scenes themselves (MenuScene nulls the global). */
const runOf = (page) => page.evaluate(() => {
  const game = window.__phaserGame;
  const world = game.scene.getScene('ConquestScene');
  const ui = game.scene.getScene('ConquestUIScene');
  const rs = window.__renderScale();
  const cam = world.cameras.main;
  return {
    prompt: world.state.pendingAscentPrompt?.kind ?? null,
    key: ui.openPromptKey,
    selected: world.state.selectedLandId ?? null,
    paused: world.state.isStrategyPause,
    hardcore: world.state.ascent?.hardcore ?? null,
    mapZoom: +(cam.zoom / rs).toFixed(3),
    dim: world.worldDim ? world.worldDim.visible : null,
    dimWidth: world.worldDim ? Math.round(world.worldDim.width * (cam.zoom / rs)) : null,
    guard: window.__hudTapBounds ?? [],
  };
});

async function startRun(page) {
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
}

/** Answers the opening chain with the playtest library's ids, until a given kind or the map. */
async function drain(page, until = null) {
  const seen = [];
  for (let i = 0; i < 16; i += 1) {
    const kind = await page.evaluate((stop) => {
      const world = window.__phaserGame.scene.getScene('ConquestScene');
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      const prompt = world.state.pendingAscentPrompt;
      if (!prompt || prompt.kind === stop) return null;
      ui.events.emit('ui:ascent-choice', window.__ptOptions(world.state)[0]);
      return prompt.kind;
    }, until);
    if (!kind) break;
    seen.push(kind);
    await page.waitForTimeout(320);
  }
  return seen;
}

/** Sheet design units → CSS pixels, through the world camera (which starts at the sheet's origin). */
const sheetToCss = (page, x, y) => page.evaluate(([sx, sy]) => {
  const game = window.__phaserGame;
  const rs = window.__renderScale();
  const rect = game.canvas.getBoundingClientRect();
  const W = game.scale.width / rs;
  const H = game.scale.height / rs;
  return [rect.left + (sx * rect.width) / W, rect.top + (sy * rect.height) / H];
}, [x, y]);

/** A visible province whose name plate is on the uncovered map, and where its plate is. */
const plateTarget = (page) => page.evaluate(() => {
  const game = window.__phaserGame;
  const world = game.scene.getScene('ConquestScene');
  const ui = game.scene.getScene('ConquestUIScene');
  const rs = window.__renderScale();
  const colX = ui.cameras.main.x / rs;
  const limit = colX > 0 ? colX - 24 : game.scale.width / rs;
  const H = game.scale.height / rs;
  const cam = world.cameras.main;
  const zoom = cam.zoom / rs;
  for (const land of world.state.lands) {
    if (!land.isVisible || land.ownerId === 'dai-viet' || !world.hasVisibleLabel(land.id)) continue;
    const rect = world.labelWorldRect(land.id);
    if (!rect) continue;
    const sx = (rect.x + rect.width / 2 - cam.scrollX) * zoom;
    const sy = (rect.y + rect.height / 2 - cam.scrollY) * zoom;
    if (sx < 40 || sx > limit || sy < 130 || sy > H - 130) continue;
    return { id: land.id, sheet: [sx, sy] };
  }
  return null;
});

/** Where the capital's settlement sits on the sheet, and how wide the uncovered view is. */
const capitalOnSheet = (page) => page.evaluate(() => {
  const game = window.__phaserGame;
  const world = game.scene.getScene('ConquestScene');
  const ui = game.scene.getScene('ConquestUIScene');
  const rs = window.__renderScale();
  const colX = ui.cameras.main.x / rs;
  const cam = world.cameras.main;
  const zoom = cam.zoom / rs;
  const capital = world.state.lands.find((l) => l.ownerId === 'dai-viet' && l.type === 'castle');
  const node = capital ? world.landNodes.get(capital.id) : undefined;
  if (!node) return null;
  return { x: (node.x - cam.scrollX) * zoom, view: colX > 0 ? colX : game.scale.width / rs };
});

/** The first non-system slot of the bar, as the bar itself lays it out. */
const firstLane = (page) => page.evaluate(async () => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const { actionBarSlots } = await import('/src/ui/ActionBar.ts');
  return actionBarSlots(ui.state.gameMode, ui.actionBar.context()).filter((s) => !s.system).map((s) => s.action);
});

async function desktopRun(label, page, errors, { width, height }) {
  console.log(`=== ${label}: the run ===`);
  await startRun(page);
  const lay = await layoutOf(page);
  const W = lay.gameSize[0];
  check(`${label} the world camera spans the sheet`, lay.cams.ConquestScene?.[0] === 0 && Math.abs(lay.cams.ConquestScene?.[2] - W) < 1, JSON.stringify(lay.cams.ConquestScene));
  check(`${label} the HUD camera spans the sheet too`, lay.cams.ConquestUIScene?.[0] === 0 && Math.abs(lay.cams.ConquestUIScene?.[2] - W) < 1, JSON.stringify(lay.cams.ConquestUIScene));
  const chrome = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    return { bar: ui.resourceBar.x, hud: [ui.hud.root.x, ui.hud.root.y], barWidth: ui.actionBar.barWidth, modal: ui.modalLayer.x };
  });
  check(`${label} the top bar is one band: strip at the left, readout beside it`, chrome.bar === 0 && chrome.hud[0] === 390 && chrome.hud[1] === -52, JSON.stringify(chrome));
  // The readout on the strip's rows: every figure inside the band's clear rows (the frieze runs at
  // 3–7 and 45–49), and none under the pause/menu cluster at the bar's right end.
  const rows = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const parts = ui.hud.parts;
    if (!parts) return null;
    const boxes = [parts.powerValue, parts.threatValue, parts.threatVerdict, parts.countdown, parts.ambition, parts.level, parts.wave, ...parts.labels]
      .filter((o) => o.visible && o.text)
      .map((o) => { const b = o.getBounds(); return { text: o.text, top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), right: +b.right.toFixed(1) }; });
    return { boxes, top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)), right: Math.max(...boxes.map((b) => b.right)) };
  });
  check(`${label} the readout keeps to the bar's clear rows`, Boolean(rows) && rows.top >= 7 && rows.bottom <= 47, rows ? `top=${rows.top} bottom=${rows.bottom} ${rows.boxes.map((b) => b.text).join('/')}` : 'no readout');
  check(`${label} the readout stays clear of the top bar's cluster`, Boolean(rows) && rows.right <= W - 90, rows ? `right=${rows.right} of ${W}` : 'no readout');
  check(`${label} the bottom bar spans the sheet`, chrome.barWidth === W, `barWidth=${chrome.barWidth}`);
  check(`${label} the opening card is centred over the map`, chrome.modal === Math.round((W - 390) / 2), `modal.x=${chrome.modal}`);
  const opening = await runOf(page);
  check(`${label} the map dims under the opening card`, opening.prompt !== null && opening.dim === true, `prompt=${opening.prompt} dim=${opening.dim}`);
  const seen = await drain(page);
  const clear = await runOf(page);
  check(`${label} the opening chain drains to the map`, clear.prompt === null && clear.key === '', `${seen.join('>')} -> ${clear.prompt}/${clear.key}`);
  check(`${label} the map brightens once the cards are answered`, clear.dim === false, `dim=${clear.dim}`);
  const cap = await capitalOnSheet(page);
  check(`${label} the capital opens in the middle of the uncovered view`, Boolean(cap) && Math.abs(cap.x - cap.view / 2) < cap.view * 0.3, cap ? `x=${Math.round(cap.x)} of ${Math.round(cap.view)}` : 'no capital node');

  // A province, through the DOM handlers, by its name plate — the thing the mode says to aim at.
  const target = await plateTarget(page);
  check(`${label} a province plate is on the uncovered map`, Boolean(target), target ? target.id : 'none in view');
  if (target) {
    const [cx, cy] = await sheetToCss(page, target.sheet[0], target.sheet[1]);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);
    const after = await runOf(page);
    check(`${label} clicking the plate selects the province`, after.selected === target.id, `selected=${after.selected} wanted=${target.id}`);
    const card = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').inspectObjects[0]?.x ?? null);
    check(`${label} the province card docks at the sheet's right edge`, card === 14 + (W - 390), `card.x=${card}`);
  }

  // A lane by its key. The bar's own order, read at the press.
  const lanes = await firstLane(page);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(400);
  const lane = await runOf(page);
  check(`${label} the 1 key opens the bar's first lane`, lane.key === `lane:${lanes[0]}`, `key=${lane.key} bar=${lanes.join(',')}`);
  check(`${label} the map dims beside the lane`, lane.dim === true && lane.dimWidth >= W - 1, `dim=${lane.dim} width=${lane.dimWidth}`);
  const docked = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    return { modal: ui.modalLayer.x, bar: ui.actionBar.visible };
  });
  check(`${label} the lane docks at the right edge with the bar still up`, docked.modal === W - 390 && docked.bar === true, JSON.stringify(docked));
  const foot = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    let lowest = -Infinity;
    const walk = (items) => { for (const it of items ?? []) { if (it.list) walk(it.list); else if (typeof it.getBounds === 'function' && it.type !== 'Graphics' && it.type !== 'Zone') lowest = Math.max(lowest, it.getBounds().bottom); } };
    walk(ui.modalLayer.list);
    return lowest;
  });
  check(`${label} the docked panel ends above the bottom bar`, foot <= 760 - 50 + 1, `lowest object bottom=${Math.round(foot)} bar top=710`);
  const plate = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const lanes = ['build', 'heroes', 'court', 'army', 'affairs', 'chronicle'].map((a) => ui.actionBar.slotBounds(a)).filter(Boolean);
    return { plate: ui.dockEdge?.visible ?? null, laneRight: Math.max(...lanes.map((b) => b.x + b.width)), dock: ui.modalLayer.x };
  });
  check(`${label} the docked page stands on a solid plate`, plate.plate === true, JSON.stringify(plate));
  // A lane with a bottom sheet (Army) draws the sheet taller than the screen; docked, nothing of
  // it may land on the bar. Two pixels on the bar's row — beside the dock and under the panel —
  // must be the same paper, with the sheet folded and open.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Digit4');
  await page.waitForTimeout(600);
  const barPixels = () => page.evaluate(() => {
    const game = window.__phaserGame; const gl = game.renderer.gl; const rs = window.__renderScale();
    const dock = game.scale.width / rs - 390;
    const read = (x, y) => { const px = new Uint8Array(4); gl.readPixels(Math.round(x * rs), Math.round(gl.drawingBufferHeight - y * rs), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [px[0], px[1], px[2]]; };
    const ui = game.scene.getScene('ConquestUIScene');
    return { key: ui.openPromptKey, beside: read(dock - 120, 735), under: read(dock + 195, 735), foot: read(dock + 60, 745) };
  });
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 6);
  const folded = await barPixels();
  check(`${label} the Army sheet stays off the bar when folded`, folded.key === 'lane:army' && same(folded.beside, folded.under) && same(folded.beside, folded.foot), JSON.stringify(folded));
  await page.evaluate(() => { const ui = window.__phaserGame.scene.getScene('ConquestUIScene'); ui.dockExpanded = true; ui.replaceLanePage(ui.lanePageBuild); });
  await page.waitForTimeout(600);
  const open = await barPixels();
  check(`${label} the Army sheet stays off the bar when open`, open.key === 'lane:army' && same(open.beside, open.under) && same(open.beside, open.foot), JSON.stringify(open));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(400);
  check(`${label} the lane buttons stay left of the dock`, plate.laneRight <= plate.dock, `lanes end at ${plate.laneRight}, dock at ${plate.dock}`);
  if (target) {
    const before = lane.selected;
    const [cx, cy] = await sheetToCss(page, target.sheet[0] * 0.5, target.sheet[1]);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);
    const under = await runOf(page);
    check(`${label} the map is deaf under the lane`, under.key === lane.key && under.selected === before, `key=${under.key} selected=${under.selected}`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await runOf(page);
  check(`${label} Escape closes the lane`, closed.key === '' && closed.dim === false, `key=${closed.key} dim=${closed.dim}`);

  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const paused = (await runOf(page)).paused;
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const resumed = (await runOf(page)).paused;
  check(`${label} Space stops and starts the world`, paused === true && resumed === false, `${paused} -> ${resumed}`);

  const zoom0 = (await runOf(page)).mapZoom;
  await page.mouse.move(width * 0.3, height * 0.5);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(200);
  const zoom1 = (await runOf(page)).mapZoom;
  await page.mouse.move(width - 40, height * 0.5);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(200);
  const zoom2 = (await runOf(page)).mapZoom;
  check(`${label} the wheel zooms over the map and not over the column`, zoom1 > zoom0 && zoom2 === zoom1, `${zoom0} -> ${zoom1} -> ${zoom2}`);
  await page.keyboard.press('Minus');
  await page.waitForTimeout(200);
  check(`${label} the minus key zooms out`, (await runOf(page)).mapZoom < zoom2);
  check(`${label} a bench run is not hands-on`, clear.hardcore !== true, `hardcore=${clear.hardcore}`);
  check(`${label} console clean through the run`, errors.length === 0, errors.slice(0, 3).join(' | '));
}

/** The front page's own Play button, found by its label rather than by a coordinate. */
async function pressPlay(page) {
  // The front page opens as a rolling scroll (`menu/scrollOpening`), and a press during the roll
  // only finishes the roll — so Play is pressed once the page reports itself open.
  await page.waitForFunction(() => !window.__phaserGame.scene.getScene('MenuScene')?.menuOpening, null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(150);
  const at = await page.evaluate(() => {
    const game = window.__phaserGame;
    const menu = game.scene.getScene('MenuScene');
    const rs = window.__renderScale();
    const rect = game.canvas.getBoundingClientRect();
    const W = game.scale.width / rs;
    const H = game.scale.height / rs;
    const cam = menu.cameras.main;
    let found;
    const walk = (items) => {
      for (const item of items ?? []) {
        if (found) return;
        if (item.type === 'Text' && item.text === 'Dragon Ascent') { found = item; return; }
        if (item.list) walk(item.list);
      }
    };
    walk(menu.children.list);
    if (!found) return null;
    const m = found.getWorldTransformMatrix();
    // Through the page camera: its viewport offset out, its scroll in.
    return [rect.left + ((cam.x / rs + m.tx - cam.scrollX) * rect.width) / W, rect.top + ((cam.y / rs + m.ty - cam.scrollY) * rect.height) / H];
  });
  if (!at) return false;
  await page.mouse.click(at[0], at[1]);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  return page.evaluate(() => window.__phaserGame.scene.isActive('ConquestScene'));
}

/** Whether the mandate card's hands-on row is drawn ticked. */
const mandateTicked = (page) => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  let ticked = null;
  const walk = (items) => {
    for (const item of items ?? []) {
      if (item.type === 'Text' && typeof item.text === 'string' && (item.text.startsWith('☑') || item.text.startsWith('☐'))) ticked = item.text.startsWith('☑');
      if (item.list) walk(item.list);
    }
  };
  walk(ui.modalLayer.list);
  return ticked;
});

async function menuStart(label, page, wantHandsOn) {
  console.log(`=== ${label}: a run from the front page ===`);
  const started = await pressPlay(page);
  check(`${label} the front page's Play starts a run`, started);
  if (!started) return;
  const run = await runOf(page);
  check(`${label} the run ${wantHandsOn ? 'is' : 'is not'} hands-on by default`, wantHandsOn ? run.hardcore === true : run.hardcore !== true, `hardcore=${run.hardcore}`);
  const seen = await drain(page, 'mandate');
  const ticked = await mandateTicked(page);
  check(`${label} the mandate card shows the rule ${wantHandsOn ? 'ticked' : 'clear'}`, ticked === wantHandsOn, `${seen.join('>')} -> ticked=${ticked}`);
}

try {
  // ── A: 1280x720, asked for ────────────────────────────────────────────────────────────────
  for (const [label, width, height] of [['A 1280x720', 1280, 720], ['B 1920x1080', 1920, 1080]]) {
    console.log(`=== ${label}: the sheet ===`);
    const { page, context, errors } = await boot({ viewport: { width, height }, query: '&layout=desktop' });
    const lay = await layoutOf(page);
    const want = expectedWidth(width, height);
    check(`${label} the splash and the game agree on the sheet`, lay.surface?.kind === 'desktop' && lay.surface.width === lay.gameSize[0] && lay.surface.height === DESKTOP_H, JSON.stringify(lay.surface));
    check(`${label} the sheet is ${want} x ${DESKTOP_H}`, lay.gameSize[0] === want && lay.gameSize[1] === DESKTOP_H, JSON.stringify(lay.gameSize));
    check(`${label} the canvas fills the window`, lay.canvas[0] >= width * 0.98 && lay.canvas[1] >= height * 0.98, `${lay.canvas} in ${lay.window}`);
    check(`${label} the menu camera spans the sheet with its column in the middle`, lay.cams.MenuScene?.[0] === 0 && Math.abs(lay.cams.MenuScene?.[2] - want) < 1 && lay.cams.MenuScene?.[4] === -Math.round((want - 390) / 2), JSON.stringify(lay.cams.MenuScene));
    const art = await page.evaluate(() => {
      const menu = window.__phaserGame.scene.getScene('MenuScene');
      const artwork = menu.children.list.find((c) => c.getData?.('menuLandscapeRole') === 'illustration');
      return artwork ? { scale: +artwork.scaleX.toFixed(2), x: Math.round(artwork.x) } : null;
    });
    check(`${label} the front page's landscape covers the sheet`, Boolean(art) && art.scale >= (want / 390) * 0.9, JSON.stringify(art));
    // A modal raised from the front page (the "continue?" card, the dynasty sheets) dims the whole
    // sheet, from its left edge — not the column alone.
    const modal = await page.evaluate(() => {
      const menu = window.__phaserGame.scene.getScene('MenuScene');
      const result = menu.ui.modal({ title: 'probe', subtitle: '' });
      const blocker = result.objects.find((o) => o.type === 'Rectangle' && o.width >= 390);
      const out = blocker ? { x: blocker.x, width: blocker.width, scroll: menu.cameras.main.scrollX } : null;
      result.objects.forEach((o) => o.destroy());
      return out;
    });
    check(`${label} a front-page modal dims the whole sheet`, Boolean(modal) && modal.x === modal.scroll && modal.width === want, JSON.stringify(modal));
    await desktopRun(label, page, errors, { width, height });
    if (label.startsWith('A')) {
      console.log('=== A: a resize ===');
      await page.setViewportSize({ width: 1280, height: 1024 });
      await page.waitForTimeout(700);
      const re = await layoutOf(page);
      const want2 = expectedWidth(1280, 1024);
      check('A the sheet follows the window', re.gameSize[0] === want2, `${re.gameSize} wanted ${want2}`);
      check('A both cameras follow the sheet', Math.abs(re.cams.ConquestUIScene?.[2] - want2) < 1 && Math.abs(re.cams.ConquestScene?.[2] - want2) < 1, JSON.stringify(re.cams));
      check('A the canvas still fills the window', re.canvas[0] >= 1280 * 0.98 && re.canvas[1] >= 1024 * 0.98, `${re.canvas}`);
      const narrow = await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        const lanes = ['build', 'heroes', 'court', 'army', 'affairs', 'chronicle'].map((a) => ui.actionBar.slotBounds(a)).filter(Boolean);
        const band = ui.desktopChrome?.[0];
        return { laneRight: Math.max(...lanes.map((b) => b.x + b.width)), dock: ui.game.scale.width / window.__renderScale() - 390, band: band ? band.width : null };
      });
      check('A the lanes narrow to stay left of the dock', narrow.laneRight <= narrow.dock, `lanes end at ${narrow.laneRight}, dock at ${narrow.dock}`);
      check('A the top bar follows the sheet', narrow.band === want2, `band=${narrow.band} wanted ${want2}`);
      check('A console clean after the resize', errors.length === 0, errors.slice(0, 3).join(' | '));
    }
    await context.close();
  }

  // ── C: the desktop cabinet, declared and nothing else ─────────────────────────────────────
  {
    const { page, context, errors } = await boot({ viewport: { width: 1280, height: 720 }, shell: { kind: 'desktop', os: 'windows', version: '0.0.0' } });
    const lay = await layoutOf(page);
    check('C a desktop cabinet gets the desktop sheet with no query', lay.surface?.kind === 'desktop' && lay.gameSize[0] === expectedWidth(1280, 720), JSON.stringify(lay.surface));
    await menuStart('C', page, true);
    // The cards a lane asks for on the player's behalf must come up on a hands-on run: the
    // Court page's edict card and the World lane's envoy card go through the same queue that
    // silences the director's own proposals of those kinds.
    await drain(page);
    const asked = await page.evaluate(async () => {
      const world = window.__phaserGame.scene.getScene('ConquestScene');
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      const state = world.state;
      const out = { hardcore: state.ascent?.hardcore ?? null, law: null, lawKey: null, envoy: null, envoyKey: null, rival: null };
      ui.events.emit('ui:ascent-law');
      out.law = state.pendingAscentPrompt?.kind ?? null;
      out.lawKey = ui.openPromptKey;
      if (state.pendingAscentPrompt?.kind === 'law-choice') ui.events.emit('ui:ascent-choice', 'hold');
      await new Promise((resolve) => setTimeout(resolve, 200));
      const rival = state.kingdoms.find((k) => k.id !== 'dai-viet' && !k.isDefeated);
      out.rival = rival?.id ?? null;
      if (rival) {
        ui.events.emit('ui:ascent-envoy', rival.id);
        out.envoy = state.pendingAscentPrompt?.kind ?? null;
        out.envoyKey = ui.openPromptKey;
        if (state.pendingAscentPrompt?.kind === 'envoy') ui.events.emit('ui:ascent-choice', window.__ptOptions(state)[0]);
      }
      return out;
    });
    check('C the edict card asked for from the Court page comes up on a hands-on run', asked.hardcore === true && asked.law === 'law-choice' && String(asked.lawKey).startsWith('law-choice'), JSON.stringify(asked));
    check('C the envoy card asked for from the World lane comes up on a hands-on run', asked.envoy === 'envoy' && String(asked.envoyKey).startsWith('envoy'), JSON.stringify(asked));
    check('C console clean', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }

  // ── F: the battle takes the stage ─────────────────────────────────────────────────────────
  {
    console.log('=== F: the skirmish on the desktop ===');
    const { page, context, errors } = await boot({ viewport: { width: 1280, height: 720 }, query: '&layout=desktop' });
    const W = expectedWidth(1280, 720);
    await page.evaluate(() => window.__startBenchGame(1337, 'arena'));
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('BattleArenaScene'), null, { timeout: 30000 });
    await page.waitForTimeout(600);
    const arenaCams = (await layoutOf(page)).cams;
    check('F the setup sheet is a page on the whole sheet', arenaCams.BattleArenaScene?.[0] === 0 && Math.abs(arenaCams.BattleArenaScene?.[2] - W) < 1, JSON.stringify(arenaCams.BattleArenaScene));
    const backdrop = await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('BattleArenaScene');
      const c = s.children.list.find((o) => o.type === 'Container' && o.depth === -20);
      return c ? c.list.length : 0;
    });
    check('F the setup sheet has the faint landscape behind its column', backdrop >= 2, `${backdrop} plates`);
    const take = await page.evaluate(() => {
      const game = window.__phaserGame; const s = game.scene.getScene('BattleArenaScene'); const rs = window.__renderScale();
      const rect = game.canvas.getBoundingClientRect(); const Wd = game.scale.width / rs, Hd = game.scale.height / rs; const cam = s.cameras.main;
      let found; const walk = (items) => { for (const it of items ?? []) { if (found) return; if (it.type === 'Text' && /take command/i.test(it.text ?? '')) { found = it; return; } if (it.list) walk(it.list); } };
      walk(s.children.list); if (!found) return null; const m = found.getWorldTransformMatrix();
      return [rect.left + ((cam.x / rs + m.tx - cam.scrollX) * rect.width) / Wd, rect.top + ((cam.y / rs + m.ty - cam.scrollY) * rect.height) / Hd];
    });
    check('F the Take command button is on the sheet', Boolean(take));
    if (take) {
      // The press, and a second one if the first was lost to a busy machine: the button fires on
      // the down and the arena builds the fight on the next frame, which a loaded host can miss.
      const fightUp = () => page.evaluate(() => window.__phaserGame.scene.isActive('ConquestUIScene')
        && window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle');
      for (let attempt = 0; attempt < 2 && !(await fightUp()); attempt += 1) {
        await page.mouse.click(take[0], take[1]);
        await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene')
          && window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle', null, { timeout: 15000 }).catch(() => {});
      }
      await page.waitForTimeout(1200);
      const fight = await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        const rs = window.__renderScale();
        const c = ui?.cameras?.main;
        if (!c) return { key: ui?.openPromptKey ?? 'no scene', cam: [-1, -1], bar: null, modal: null, field: null };
        return { key: ui.openPromptKey, cam: [c.x / rs, c.width / rs], bar: ui.resourceBar.x, modal: ui.modalLayer.x, field: ui.battleUi?.coachBounds?.field?.width ?? null };
      });
      const stage = Math.max(390, Math.min(640, W - 160));
      check('F the fight takes a centred stage', fight.key === 'lane:battle' && fight.modal === Math.round((W - stage) / 2), JSON.stringify(fight));
      check('F the resource strip keeps the corner', fight.bar === 0, `bar.x=${fight.bar}`);
      check('F the field spans the stage', fight.field === stage, `field=${fight.field} stage=${stage}`);
      // The stage is a modal on the desktop: the front page's royal scroll behind the fight, and
      // the fight's own box — exits included — standing inside it, off the top bar and the foot.
      const framed = await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        const scroll = ui.modalLayer.list.find((o) => o.type === 'Image' && String(o.texture?.key ?? '').startsWith('ui:royal-scroll'));
        let leave = null;
        const walk = (items) => { for (const it of items ?? []) { if (leave) return; if (it.list) walk(it.list); else if (it.type === 'Text' && /leave the field|rời trận/i.test(it.text ?? '')) leave = it; } };
        walk(ui.modalLayer.list);
        const exits = leave ? { top: Math.round(leave.getBounds().top), bottom: Math.round(leave.getBounds().bottom) } : null;
        return { scroll: scroll ? { x: Math.round(scroll.x), y: Math.round(scroll.y), w: Math.round(scroll.displayWidth), h: Math.round(scroll.displayHeight) } : null, exits };
      });
      check('F the fight stands on a royal scroll', Boolean(framed.scroll) && framed.scroll.x < 0 && framed.scroll.y > 52 && framed.scroll.y < 130, JSON.stringify(framed.scroll));
      check('F the exits stay inside the scroll, off the sheet\'s foot', Boolean(framed.exits) && framed.exits.bottom <= 760 - 70 && framed.exits.top > 400, JSON.stringify(framed.exits));
      await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').closeLane());
      await page.waitForTimeout(800);
      // Leaving a skirmish's field hands the whole scene back to the setup sheet, so the width has
      // to be proven on the next HUD to boot: a run's column, which would come up 780 wide if the
      // stage had not been given back.
      await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
      await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(800);
      const after = await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        const rs = window.__renderScale();
        const c = ui?.cameras?.main;
        if (!c) return { key: 'no scene', cam: [-1, -1], bar: null, modal: null };
        return { key: ui.openPromptKey, cam: [c.x / rs, c.width / rs], bar: ui.resourceBar.x, modal: ui.modalLayer.x };
      });
      // The next run's first card is centred as a card, not as a stage: the width was given back.
      check('F leaving the field gives the stage back', after.modal === Math.round((W - 390) / 2), JSON.stringify(after));
    }
    check('F console clean', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }

  // ── D: the phone, untouched ───────────────────────────────────────────────────────────────
  {
    const { page, context, errors } = await boot({ viewport: { width: 390, height: 844 } });
    const lay = await layoutOf(page);
    check('D the phone sheet is the column', lay.surface?.kind === 'phone' && lay.gameSize[0] === 390 && lay.gameSize[1] === 844, JSON.stringify(lay.gameSize));
    check('D every phone camera starts at the origin', Object.values(lay.cams).every((c) => c[0] === 0 && c[1] === 0 && c[2] === 390), JSON.stringify(lay.cams));
    await menuStart('D', page, false);
    const cams = (await layoutOf(page)).cams;
    check('D the run\'s cameras stay at the origin', Object.values(cams).every((c) => c[0] === 0 && c[2] === 390), JSON.stringify(cams));
    // A plate on the phone, through the same two tap paths. The one high on the sheet is the
    // case the dedupe in `MapScene` exists for: below `ASCENT_INSPECT_TOP` the inspect card's
    // band hid the double answer, above it the second answer toggled the province off again.
    await drain(page);
    const target = await plateTarget(page);
    check('D a province plate is on the phone map', Boolean(target), target ? `${target.id} at y=${Math.round(target.sheet[1])}` : 'none in view');
    if (target) {
      const [cx, cy] = await sheetToCss(page, target.sheet[0], target.sheet[1]);
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(400);
      const after = await runOf(page);
      check('D clicking the plate selects the province on the phone', after.selected === target.id, `selected=${after.selected} wanted=${target.id}`);
    }
    check('D console clean', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }

  // ── G: a real desktop browser, no ask — the auto rule as a player meets it ────────────────
  {
    console.log('=== G: a real desktop browser ===');
    const { page, context, errors } = await boot({ viewport: { width: 1280, height: 720 }, realBrowser: true });
    const lay = await layoutOf(page);
    check('G a real desktop browser sniffs its way to the desktop sheet', lay.surface?.kind === 'desktop' && lay.gameSize[0] === expectedWidth(1280, 720), JSON.stringify(lay.surface));
    await menuStart('G', page, true);
    check('G console clean', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }

  // ── H: a computer in a portrait window — the column, with the desktop's gameplay ──────────
  {
    console.log('=== H: a portrait window on a computer ===');
    const { page, context, errors } = await boot({ viewport: { width: 700, height: 900 }, realBrowser: true });
    const lay = await layoutOf(page);
    check('H a portrait window on a computer keeps the phone column', lay.surface?.kind === 'phone' && lay.gameSize[0] === 390, JSON.stringify(lay.surface));
    await menuStart('H', page, true);
    await drain(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    const paused = (await runOf(page)).paused;
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    check('H the keys are still there on the column', paused === true && (await runOf(page)).paused === false, `paused=${paused}`);
    check('H console clean', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }

  // ── E: a wide window that never asked — a driven browser stays on the phone layout ────────
  {
    const { page, context } = await boot({ viewport: { width: 1280, height: 720 } });
    const lay = await layoutOf(page);
    check('E a driven browser never sniffs its way to the desktop', lay.surface?.kind === 'phone' && lay.gameSize[0] === 390, JSON.stringify(lay.surface));
    await context.close();
  }

  // ── T: the front page's tour in a real browser — its veil covers the whole sheet, not the column ──
  {
    const { page, context, errors } = await boot({ viewport: { width: 1280, height: 720 }, query: '&layout=desktop', realBrowser: true, tour: true });
    await page.waitForTimeout(900);
    const W = expectedWidth(1280, 720);
    const sample = () => page.evaluate(() => {
      const game = window.__phaserGame; const gl = game.renderer.gl; const rs = window.__renderScale();
      const read = (x, y) => { const px = new Uint8Array(4); gl.readPixels(Math.round(x * rs), Math.round(gl.drawingBufferHeight - y * rs), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [px[0], px[1], px[2]]; };
      const sheet = game.scale.width / rs;
      return { left: read(40, 300), mid: read(sheet / 2, 40), right: read(sheet - 40, 300) };
    });
    const veiled = await sample();
    const skip = await page.evaluate(() => {
      const menu = window.__phaserGame.scene.getScene('MenuScene');
      let found = null;
      const walk = (items) => { for (const it of items ?? []) { if (found) return; if (it.list) walk(it.list); else if (it.type === 'Text' && /^(Skip|Bỏ qua)$/i.test((it.text ?? '').trim())) found = it; } };
      walk(menu.children.list);
      if (!found) return null;
      const b = found.getBounds(); const game = window.__phaserGame; const rs = window.__renderScale(); const cam = menu.cameras.main;
      const rect = game.canvas.getBoundingClientRect(); const Wd = game.scale.width / rs, Hd = game.scale.height / rs;
      return { x: rect.left + ((b.centerX - cam.scrollX) * rect.width) / Wd, y: rect.top + ((b.centerY - cam.scrollY) * rect.height) / Hd };
    });
    check('T the front page shows its tour to a real browser', Boolean(skip), skip ? 'skip link found' : 'no skip link on the page');
    if (skip) {
      await page.mouse.click(skip.x, skip.y);
      await page.waitForTimeout(500);
      const lit = await sample();
      const differs = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 10);
      check('T the tour veil covers the sheet\'s left edge, not just the column', differs(veiled.left, lit.left), `veiled=${veiled.left} lit=${lit.left} sheet=${W}`);
      check('T the tour veil covers the sheet\'s right edge', differs(veiled.right, lit.right), `veiled=${veiled.right} lit=${lit.right}`);
    }
    check('T console clean', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }

  // ── M: the forced layouts a tester types — `mobile` is the phone's alias, `auto` sets a pinned
  // choice aside so the detection itself can be watched ────────────────────────────────────────
  {
    const { page, context } = await boot({ viewport: { width: 1280, height: 720 }, query: '&layout=mobile', realBrowser: true });
    const lay = await layoutOf(page);
    const asked = await page.evaluate(() => window.__layoutDiagnosis?.asked ?? null);
    check('M ?layout=mobile forces the phone column on a computer', lay.surface?.kind === 'phone' && lay.gameSize[0] === 390 && asked === 'phone', `${JSON.stringify(lay.surface)} asked=${asked}`);
    await context.close();
  }
  {
    const { page, context } = await boot({ viewport: { width: 1280, height: 720 }, stored: 'desktop' });
    const lay = await layoutOf(page);
    check('M a pinned desktop choice takes the sheet even in a driven browser', lay.surface?.kind === 'desktop' && lay.gameSize[0] === expectedWidth(1280, 720), JSON.stringify(lay.surface));
    await context.close();
  }
  {
    const { page, context } = await boot({ viewport: { width: 1280, height: 720 }, query: '&layout=auto', stored: 'desktop' });
    const lay = await layoutOf(page);
    const diag = await page.evaluate(() => { const d = window.__layoutDiagnosis; return d ? { asked: d.asked, stored: d.stored } : null; });
    check('M ?layout=auto sets the pinned choice aside and the sniff runs (a driven browser: phone)', lay.surface?.kind === 'phone' && lay.gameSize[0] === 390 && diag?.asked === 'auto', `${JSON.stringify(lay.surface)} ${JSON.stringify(diag)}`);
    await context.close();
  }
} finally {
  await browser.close();
}

const failed = checks.filter((entry) => !entry.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the desktop sheet, its column, its keys and the phone all hold' : `FAIL: ${failed.map((f) => f.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
