/**
 * The clash mark on the map opens the fight it is a mark of.
 *
 * Reported: *when i click to icon battle in map -> it should show battle screen*. The mark was
 * drawn over every contested province and was not pressable — the press fell through to the
 * province underneath and selected it, so the one thing on the map that points at a live fight
 * looked like it did the wrong thing rather than nothing.
 *
 * Driven through the real canvas, not by calling the handler: the map listens on the canvas
 * element rather than through Phaser's display list (`isScreenPointOverFixedUi` exists because of
 * that), so a check that reached past the pointer would prove nothing about a press.
 *
 *   DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-battle-mark.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const results = [];
const check = (what, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__splashDone?.());
await page.waitForTimeout(1400);

/**
 * A fight of our own, on a province we can see, with the map centred on it.
 *
 * Built rather than waited for: a wave that opens an engagement on a visible province is a dozen
 * seasons away at the earliest, and this check is about a mark and a press, not about the war.
 * `beginBattle` is the real entry point, so the battle it makes is the shape the screen expects.
 */
const setup = await page.evaluate(async () => {
  const { beginBattle } = await import('/src/systems/ascent/BattleSystem.ts');
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const state = map.state;
  state.pendingAscentPrompt = undefined;
  state.isPaused = false;
  state.isStrategyPause = false;

  const ours = state.armies.find((army) => army.kingdomId === 'dai-viet' && !army.isLevy);
  const land = state.lands.find((one) => one.id === ours.landId);
  // An invader standing on the same ground, so the engagement has two sides. Cloned from a real
  // host rather than written out: an army fixture missing `supply`/`rations` makes
  // `createBattlePreview` return undefined and `beginBattle` quietly declines the whole thing.
  const rival = state.kingdoms.find((kingdom) => kingdom.id !== 'dai-viet');
  const invader = JSON.parse(JSON.stringify(ours));
  invader.id = 'probe-invader';
  invader.kingdomId = rival.id;
  invader.landId = land.id;
  state.armies.push(invader);
  state.ascent.activeBattle = undefined;
  state.pendingBattle = {
    invaderArmyId: invader.id, landId: land.id, landName: land.name,
    kingdomId: rival.id, kingdomName: rival.name ?? 'Lab', isGreat: false,
    attackerPower: 0, defenderPower: 0,
  };
  const opened = beginBattle(state);
  map.refresh();
  return { landId: land.id, opened: Boolean(opened && state.ascent.activeBattle) };
});
check('a fight can be put on a province we can see', setup.opened, JSON.stringify(setup));

/**
 * The badge pass is inside the map's incremental refresh job, which spends about 3 ms a frame.
 *
 * So the mark arrives some frames after the state says there is a fight, and a check that read the
 * marker list straight after `refresh()` read it empty — which is a harness that fails because the
 * map is careful, not because the map is wrong.
 */
await page.waitForFunction((landId) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  return (map.battleMarkers ?? []).some((marker) => marker.getData?.('badgeLand') === landId);
}, setup.landId, { timeout: 20000 }).catch(() => {});

/** The mark's centre, in CSS pixels, straight off the badge the map actually drew. */
const markAt = () => page.evaluate((landId) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const camera = map.cameras.main;
  const badge = [...(map.battleMarkers ?? []), ...(map.siegeMarkers ?? [])]
    .find((marker) => marker.getData?.('badgeLand') === landId && marker.visible);
  if (!badge) return null;
  const canvas = window.__phaserGame.canvas.getBoundingClientRect();
  const scale = canvas.width / (camera.width / camera.zoom);
  // The map's own reading of a pointer: world = scroll + screen / zoom, so screen = (world - scroll) * zoom.
  return {
    x: canvas.left + (badge.x - camera.scrollX) * map.mapZoom * scale,
    y: canvas.top + (badge.y - camera.scrollY) * map.mapZoom * scale,
  };
}, setup.landId);

// The map has to be looking at the province before its mark can be pressed. Scrolled directly
// rather than through a pan gesture, which would arm the drag guard and swallow the press.
await page.evaluate((landId) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const badge = (map.battleMarkers ?? []).find((marker) => marker.getData?.('badgeLand') === landId);
  const camera = map.cameras.main;
  const design = { w: camera.width / camera.zoom, h: camera.height / camera.zoom };
  camera.setScroll(badge.x - design.w / (2 * map.mapZoom), badge.y - design.h / (2 * map.mapZoom));
}, setup.landId);
await page.waitForTimeout(400);

const mark = await markAt();
check('the map draws a clash mark over the contested province', Boolean(mark), JSON.stringify(mark));

if (mark) {
  await page.mouse.click(mark.x, mark.y);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    return { key: ui.openPromptKey, selected: ui.state.selectedLandId ?? null };
  });
  check('pressing it opens the battle lane', after.key === 'lane:battle', `openPromptKey ${after.key || 'none'}`);
  // The press is spent on the mark: it must not also select the province under it, which is what
  // it used to do instead.
  check('and does not also select the province underneath', after.selected === null, `selected ${after.selected}`);
}

/**
 * Pre-existing and not this check's business: the battle screen builds a second map-item renderer
 * (`createMapItemRenderer` in `battle/shell.ts`) and the conquest atlas complains that its texture
 * keys are already taken. Reproduced on a clean tree by `scratch/shot-march-column.mjs`, which
 * opens no battle at all.
 */
const noise = /Texture key already in use: conquest-atlas:/;
const real = errors.filter((line) => !noise.test(line));
check('no browser errors', real.length === 0, real.slice(0, 2).join(' | ') || 'none');

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} battle-mark checks passed`);
process.exit(passed === results.length ? 0 : 1);
