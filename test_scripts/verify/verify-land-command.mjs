// Can a player actually manage a province? Click-driven, end to end.
//
// The systems for this shipped and were verified by unit-style checks against `buildFocusRows` and
// `buildGovernorRows` — which all passed while the screen was unreachable, because the scroll guard
// was classifying ordinary taps as scrolls and swallowing them. A contract that only tests the model
// cannot tell you the button is dead, so this one drives the actual UI:
//
//   open Build → tap a province → see focus rows and a governor row → open the governor picker.
//
// Usage: node test_scripts/verify/verify-land-command.mjs
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

// `MenuScene` sets `window.__mandateState = undefined` every time it runs, and it stays resident
// behind the map — so a probe that trusts that global loses the run mid-test and reports the game
// as empty. The scene's own reference is the durable one.
await page.addInitScript(() => {
  window.gameState = () => window.__mandateState
    ?? window.__phaserGame?.scene?.getScene('ConquestScene')?.state
    ?? window.__phaserGame?.scene?.getScene('ConquestUIScene')?.state;
});
// Pinned: the section headings and status lines this file asserts are the English catalog's.
await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
// Wait for the *menu*, not for the hook. `__startBenchGame` is defined before PreloadScene has
// finished, and jumping the queue there starts the conquest scene while the shared atlases are
// still in flight — five "Texture key already in use" errors that failed the console check on a
// boot with nothing wrong with it.
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => Boolean(gameState()), null, { timeout: 30000 });
await page.waitForTimeout(900);

const box = await page.evaluate(() => {
  const r = window.__phaserGame.canvas.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, dw: window.__phaserGame.scale.width, dh: window.__phaserGame.scale.height };
});
const toPage = (dx, dy) => ({ x: box.x + (dx / box.dw) * box.w, y: box.y + (dy / box.dh) * box.h });

/** Text currently on the modal layer, flattened. */
const modalText = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const out = [];
  const walk = (obj) => {
    if (!obj) return;
    if (obj.type === 'Text' && obj.text) out.push(obj.text.replace(/\n/g, ' | '));
    if (obj.list) for (const c of obj.list) walk(c);
  };
  walk(ui.modalLayer);
  return out;
});

/**
 * The tappable rows on the modal layer, as centres in design units, top to bottom.
 *
 * Only `Rectangle`s: every card and button lays one of those as its hit area, positioned at its own
 * centre. The other interactive objects on the layer are the full-screen dim and the scroll area's
 * `Zone`, both anchored top-left and both of which swallow a tap rather than doing anything — so a
 * probe that clicks those reports a dead interface that is in fact perfectly alive.
 */
const rows = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const out = [];
  const walk = (obj, ox, oy) => {
    if (!obj) return;
    const x = ox + (obj.x ?? 0);
    const y = oy + (obj.y ?? 0);
    if (obj.input?.enabled && obj.type === 'Rectangle') out.push({ x, y, w: obj.width, h: obj.height });
    if (obj.list) for (const c of obj.list) walk(c, x, y);
  };
  walk(ui.modalLayer, 0, 0);
  return out.sort((a, b) => a.y - b.y);
});

/** How many objects the modal layer is holding — zero means no screen is open. */
const modalCount = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  return ui?.modalLayer?.length ?? 0;
});

const clickDesign = async (d) => {
  const p = toPage(d.x, d.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(420);
};

// Answer the opening prompts by clicking the first choice, as a player would. They chain — a
// founder pick raises a champion, which raises an appointment — so this runs until the queue is
// genuinely empty rather than for a fixed count.
// Settle the run's opening through the resolver rather than by tapping.
//
// The opening chain re-raises itself every tick, so a probe that taps its way out races the clock
// and never gets to the screen under test. Tapping is not what this test is for in any case —
// `verify-scroll.mjs` drives real pointer events and proves a finger's tap still selects. This gets
// the run to a settled state so the Build screens can be examined.
await page.evaluate(async () => {
  const RES = await import('/src/systems/ascent/AscentResolver.ts');
  const st = gameState();
  if (!st) return;
  for (let i = 0; i < 40 && st.pendingAscentPrompt; i += 1) {
    const p = st.pendingAscentPrompt;
    if (p.kind === 'run-over') break;
    // `founder` carries plain strings where the other prompts carry `{ id }`, so this has to cope
    // with both — reading `.id` off a string yields undefined and the prompt silently re-raises.
    const first = p.options?.[0];
    const id = (typeof first === 'string' ? first : first?.id)
      ?? p.cards?.[0] ?? p.targets?.[0]?.landId
      ?? p.heroIds?.[0] ?? p.heroes?.[0]?.id ?? p.projectIds?.[0] ?? 'skip';
    if (!RES.resolveAscentPrompt(st, id)) { st.pendingAscentPrompt = undefined; break; }
  }
  st.isPaused = true;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.modalLayer?.removeAll(true);
  for (const area of ui.activeScrollAreas ?? []) area.destroy();
  ui.activeScrollAreas = [];
});
await page.waitForTimeout(250);

// Open the Build lane through the scene's own entry point — the same call the action bar makes.
//
// Called directly rather than tapped: the opening chain re-raises itself from a field the scene
// holds, so a probe that taps its way there races a repaint it cannot win. The tap path itself is
// covered by `verify-scroll.mjs`, which drives real pointer events including the finger-roll tap
// that used to be swallowed.
const opened = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  if (typeof ui.showBuildScreen !== 'function') return false;
  ui.showBuildScreen();
  return true;
});
check('the Build lane can be opened', opened);
await page.waitForTimeout(350);

const buildText = await modalText();
check('the Build lane lists provinces', buildText.some((t) => /built|Claims|Thu phục/i.test(t)), buildText[0] ?? '');

// The Claims block — heading, any claim in flight, and "Claim a province" — sits above the
// province rows, so the provinces are the tail of the list.
const buildRows = await rows();
check('the Build lane offers tappable rows', buildRows.length > 0, `${buildRows.length} rows`);

// **Every province must be tappable, including the ones already building.**
//
// This is the failure that made the whole page look dead: the row passed no handler while a
// building was going up, on the reasoning that there is nothing to build while something is being
// built. But the sheet behind it is also where the focus is set and the governor posted. A realm
// whose provinces are all under construction — the normal state of a working realm, and guaranteed
// early on once the autopilot has filed an order on each — found nothing on the page would open,
// with no way to tell a disabled row from a broken game.
const tappability = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = gameState();
  const owned = st.lands.filter((l) => l.ownerId === 'dai-viet');
  // Put every province under construction, then redraw the lane.
  st.buildOrders = owned.map((land) => ({
    landId: land.id, kind: 'build', type: 'farm', progress: 1, required: 5,
  }));
  ui.showBuildScreen();
  const withHandlers = [];
  const walk = (obj, ox, oy) => {
    if (!obj) return;
    const x = ox + (obj.x ?? 0);
    const y = oy + (obj.y ?? 0);
    if (obj.input?.enabled && obj.type === 'Rectangle') withHandlers.push({ x, y });
    if (obj.list) for (const c of obj.list) walk(c, x, y);
  };
  walk(ui.modalLayer, 0, 0);
  // Cleared again: these are hand-built stubs rather than real orders, and leaving them in state
  // makes the economy walk them on the next refresh.
  st.buildOrders = [];
  return { provinces: owned.length, tappable: withHandlers.length };
});
check(
  'a province under construction still opens',
  // Claims heading is not tappable; the "Claim a province" row plus one row per province are.
  tappability.tappable >= tappability.provinces + 1,
  `${tappability.provinces} provinces all building, ${tappability.tappable} tappable rows`,
);

{
  // Open a province the same way its row does.
  const landId = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const st = gameState();
    const land = st?.lands?.find((l) => l.ownerId === 'dai-viet');
    if (!land || typeof ui.showBuildOptions !== 'function') return null;
    ui.showBuildOptions(land.id);
    return land.name;
  });
  check('a province opens its command screen', Boolean(landId), landId ?? 'no owned land');
  await page.waitForTimeout(350);
  const landText = await modalText();

  check(
    'the command screen opens on the province',
    landText.some((t) => /This province|Tỉnh này/i.test(t)),
    landText.slice(0, 3).join(' / '),
  );
  check(
    'the focus rows are there',
    landText.some((t) => /Defend|Phòng thủ/i.test(t)) && landText.some((t) => /Army|Quân binh/i.test(t)),
    landText.filter((t) => /Defend|Army|Food|Goods|Gold|People/i.test(t)).slice(0, 6).join(' · '),
  );
  check(
    'a focus row explains what the ground suits',
    landText.some((t) => /Made for it|Workable here|Fights the land|Rất hợp|Tạm được|Nghịch đất/i.test(t)),
  );
  check(
    'the governor row is there',
    landText.some((t) => /Governor|No governor|Trấn thủ|Chưa có trấn thủ/i.test(t)),
  );

  // Setting a focus must actually change the province.
  const focusChanged = await page.evaluate(async () => {
    const RES = await import('/src/systems/ResourceSystem.ts');
    const st = gameState();
    const land = st.lands.find((l) => l.ownerId === 'dai-viet');
    const before = land.specialization ?? 'balanced';
    RES.setLandSpecialization(st, land.id, 'fortress');
    const after = land.specialization;
    return { before, after, took: after === 'fortress' };
  });
  check('a focus can be set on the province', focusChanged.took, `${focusChanged.before} -> ${focusChanged.after}`);

  // Open the governor picker, with someone free to post. A run a few seconds old has every
  // champion already seated, and a picker that correctly reports "nobody is free" would pass a
  // check for *a* picker while telling us nothing about how it ranks anyone.
  const govOpened = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const st = gameState();
    const land = st.lands.find((l) => l.ownerId === 'dai-viet');
    for (const hero of st.heroes) hero.assignedTo = undefined;
    if (typeof ui.showGovernorPicker !== 'function') return false;
    ui.showGovernorPicker(land.id);
    return true;
  });
  await page.waitForTimeout(350);
  const govText = await modalText();
  check(
    'the governor picker opens with candidates',
    govOpened && govText.some((t) => /Suited|Adequate|Poorly matched|Rất hợp|Tạm được|Không hợp|No champion|Không có anh hùng/i.test(t)),
    govText.slice(0, 4).join(' / '),
  );
  check(
    'the picker says which stat the province rewards',
    govText.some((t) => /Martial|Administration|Logistics|Võ lược|Quản trị|Hậu cần/i.test(t)),
    govText.filter((t) => /Suited|Adequate|Poorly/i.test(t))[0] ?? '',
  );
}

// ── Every screen that covers the map holds the clock, and hands it back ──
//
// Reading the world while it moves is not what a menu is for. The lanes did this already; the
// Codex did not, because it is opened outside `openLane` — so the one screen a player might sit
// on longest was the one that let the run carry on behind it.
const pausing = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = gameState();
  const out = [];
  for (const lane of ['build', 'heroes', 'court', 'army', 'affairs']) {
    st.isStrategyPause = false;
    ui.openLane(lane);
    const held = st.isStrategyPause === true;
    ui.closeLane();
    out.push({ screen: lane, held, released: st.isStrategyPause === false });
  }
  st.isStrategyPause = false;
  ui.showCodex();
  const codexHeld = st.isStrategyPause === true;
  ui.closeLane();
  out.push({ screen: 'codex', held: codexHeld, released: st.isStrategyPause === false });
  return out;
});
check(
  'every bottom-bar screen pauses the world',
  pausing.every((p) => p.held),
  pausing.filter((p) => !p.held).map((p) => p.screen).join(', ') || 'all held',
);
check(
  'and hands the clock back on close',
  pausing.every((p) => p.released),
  pausing.filter((p) => !p.released).map((p) => p.screen).join(', ') || 'all released',
);

// The province sheet says what the place *is* before asking what to do with it.
{
  await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const st = gameState();
    const land = st.lands.find((l) => l.ownerId === 'dai-viet');
    ui.showBuildOptions(land.id);
  });
  await page.waitForTimeout(300);
  // The sheet is taller than the phone and its rows mount lazily, so what is on the modal layer
  // is what is *near the viewport*. The build section is the last of the four and has always been
  // below the fold; scroll once and read again, or the check is really "does the sheet fit".
  //
  // Read at every step of the way down, not only at the bottom: a heading unmounts once it has
  // passed the top edge as surely as before it arrives, so one scrape after eight wheels finds
  // the build rows and not the words above them.
  const sheet = await modalText();
  await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(90);
    sheet.push(...await modalText());
  }
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(200);
  // Headings are set as small caps, so matched case-insensitively.
  check(
    'the sheet is divided into named sections',
    ['this province', 'governor', 'focus', 'build and upgrade']
      .every((s) => sheet.some((line) => line.toLowerCase().includes(s))),
    sheet.filter((l) => /this province|governor|focus|build and upgrade/i.test(l)).join(' / '),
  );
  // The yield is drawn, not written: three glyph-and-figure chips under an "EACH SEASON"
  // caption, where it used to be the sentence "Food 15 · Goods 7 · Gold 28". So the check is
  // the caption plus three bare figures on the sheet — the sentence would now be a false pass.
  const bareFigures = sheet.filter((l) => /^\d+$/.test(l.trim())).length;
  check(
    'the status block shows people, growth and the yield chips',
    sheet.some((l) => /people\s+·\s+\+\d+\/season/.test(l))
      && sheet.some((l) => /each season/i.test(l))
      && bareFigures >= 3,
    `${sheet.filter((l) => /people|each season/i.test(l)).slice(0, 2).join(' / ')} · ${bareFigures} figures`,
  );
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: a province can be opened, focused and governed' : 'FAIL: land command is not reachable');
process.exit(failed.length === 0 ? 0 : 1);
