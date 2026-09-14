/**
 * A button inside a list is a list item: it fires on the release, and a finger that travels
 * scrolls instead of firing. Chrome still fires on the press.
 *
 * Reported: *items in a list are too easy to click — I click and drag (basic scroll behaviour)
 * and it triggers immediately instead of behaving like a mobile app.* `InkUI.button` fired on the
 * press, which was right for chrome and wrong for the buttons laid inside scrolling lists all over
 * the game. Three surfaces, three contracts each: a press that drags fires nothing and scrolls; a
 * press that lifts where it landed fires; the chrome under the list still answers the press.
 *
 * Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-list-press.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });

const frame = async () => page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); const s = window.__phaserGame.scale.gameSize; return { ox: c.left, oy: c.top, kx: c.width / s.width, ky: c.height / s.height }; });
/** A press that travels `dy` design units before lifting — a scroll. */
const dragFrom = async (x, y, dy) => {
  const f = await frame();
  await page.mouse.move(f.ox + x * f.kx, f.oy + y * f.ky);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i += 1) { await page.mouse.move(f.ox + x * f.kx, f.oy + (y + (dy * i) / steps) * f.ky); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(400);
};
/** A press that lifts where it landed — a tap. */
const tapAt = async (x, y) => {
  const f = await frame();
  await page.mouse.move(f.ox + x * f.kx, f.oy + y * f.ky);
  await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
  await page.waitForTimeout(400);
};
/** The world-space centre of the first InkUI button in `list` whose label matches. */
const buttonAt = (sceneKey, pattern, fromScroll = true) => page.evaluate(({ sceneKey, pattern }) => {
  const sc = window.__phaserGame.scene.getScene(sceneKey);
  const re = new RegExp(pattern);
  const walk = (o, acc) => { acc.push(o); if (o.list) o.list.forEach((c) => walk(c, acc)); return acc; };
  const all = walk({ list: sc.children.list }, []);
  const hit = all.find((o) => o.type === 'Container' && o.list?.some((c) => c.type === 'Text' && re.test(c.text)) && o.list?.some((c) => c.type === 'Rectangle' && c.input?.enabled));
  if (!hit) return null;
  const rect = hit.list.find((c) => c.type === 'Rectangle' && c.input?.enabled);
  const m = rect.getWorldTransformMatrix();
  return { x: m.tx, y: m.ty };
}, { sceneKey, pattern });

console.log('=== THE VAULT: a card\'s Unlock inside the list ===');
await page.evaluate(() => {
  localStorage.setItem('mandate:language:v1', 'vi');
  localStorage.setItem('mandate:legacy:v1', JSON.stringify({ points: 400, bestScore: 900, ascensions: 1, perks: [], perkLevels: {}, loadout: [], codes: [], ladder: 10 }));
  const g = window.__phaserGame;
  for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key);
  g.scene.start('MenuScene');
});
await page.waitForTimeout(700);
await page.evaluate(() => { const m = window.__phaserGame.scene.getScene('MenuScene'); m.mode = 'legacy'; m.render(); });
await page.waitForTimeout(600);
const points = () => page.evaluate(() => JSON.parse(localStorage.getItem('mandate:legacy:v1')).points);
const scrollOf = () => page.evaluate(() => Math.round(-(window.__phaserGame.scene.getScene('MenuScene').pageScroll?.content.y ?? 0)));
const unlock = await buttonAt('MenuScene', '^Mở khóa$');
check('an Unlock button stands inside the vault\'s list', Boolean(unlock), JSON.stringify(unlock));
if (unlock) {
  const before = await points();
  const scrollBefore = await scrollOf();
  await dragFrom(unlock.x, unlock.y, -90);
  check('a press on Unlock that drags buys nothing', (await points()) === before, `${before} -> ${await points()}`);
  check('… and the list scrolled under the finger', (await scrollOf()) !== scrollBefore, `scroll ${scrollBefore} -> ${await scrollOf()}`);
  const again = await buttonAt('MenuScene', '^Mở khóa$');
  const mid = await points();
  if (again) await tapAt(again.x, again.y);
  check('a press on Unlock that lifts where it landed buys', (await points()) < mid, `${mid} -> ${await points()}`);
}

console.log('=== THE DYNASTY PAGE: a trait row inside the list ===');
await page.evaluate(async () => {
  const dyn = await import('/src/state/dynasty.ts');
  localStorage.removeItem('mandate:dynasty:v1');
  dyn.resetDynastyCache();
  dyn.addRunXp(1200, { house: 'Hà' }, { waves: 8, lands: 4, ending: 'conquest', founderName: 'Hà Việt Vận' });
  const m = window.__phaserGame.scene.getScene('MenuScene'); m.mode = 'dynasty'; m.render();
});
await page.waitForTimeout(700);
const rowY = await page.evaluate(() => {
  const m = window.__phaserGame.scene.getScene('MenuScene');
  m.pageScroll?.setScroll?.(1e6);
  const rows = m.pageScroll?.content.list ?? [];
  // The chevron marks a table row; its y is the row's midline.
  const chevron = rows.find((o) => o.type === 'Text' && o.text === '›');
  if (!chevron) return null;
  return chevron.getWorldTransformMatrix().ty;
});
check('a trait row stands on the dynasty page', rowY !== null, String(rowY));
if (rowY !== null) {
  await dragFrom(195, rowY, 60);
  const sheetsAfterDrag = await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').modalObjects.length);
  check('a press on a trait row that drags opens no sheet', sheetsAfterDrag === 0, `${sheetsAfterDrag} objects`);
  const rowAgain = await page.evaluate(() => {
    const m = window.__phaserGame.scene.getScene('MenuScene');
    const chevron = (m.pageScroll?.content.list ?? []).find((o) => o.type === 'Text' && o.text === '›');
    return chevron ? chevron.getWorldTransformMatrix().ty : null;
  });
  if (rowAgain !== null && rowAgain > 100 && rowAgain < 780) await tapAt(195, rowAgain);
  const sheetsAfterTap = await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').modalObjects.length);
  check('a press on a trait row that lifts where it landed opens its sheet', sheetsAfterTap > 0, `${sheetsAfterTap} objects`);
  await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').closeModal());
}

console.log('=== CHROME: the back bar still answers the press ===');
{
  const f = await frame();
  await page.mouse.move(f.ox + 195 * f.kx, f.oy + 815 * f.ky);
  await page.mouse.down();
  await page.waitForTimeout(250);
  const modeHeld = await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').mode);
  await page.mouse.up();
  check('the back bar acts on the press, before the release', modeHeld === 'main', `mode ${modeHeld} while held`);
}

console.log('=== A RUN: the Build screen rows ===');
await page.evaluate(() => window.__startBenchGame(20260904, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const build = await import('/src/scenes/conquest/screens/build.ts');
  build.showBuildScreen(ui);
});
await page.waitForTimeout(800);
const firstButton = await page.evaluate(() => {
  // The first control INSIDE the Build list: a button's hit rectangle or a row's zone under a
  // container the scroll area stamped.
  const sc = window.__phaserGame.scene.getScene('ConquestUIScene');
  const inList = (o) => { let n = o.parentContainer; while (n) { if (n.getData?.('inkScrollContent')) return true; n = n.parentContainer; } return false; };
  const walk = (o, acc) => { acc.push(o); if (o.list) o.list.forEach((c) => walk(c, acc)); return acc; };
  const all = walk({ list: sc.children.list }, []);
  const hit = all.find((o) => o.input?.enabled && (o.type === 'Rectangle' || o.type === 'Zone') && inList(o));
  if (!hit) return null;
  const m = hit.getWorldTransformMatrix();
  const w = hit.input.hitArea?.width ?? hit.width, hgt = hit.input.hitArea?.height ?? hit.height;
  const origin = hit.type === 'Rectangle' ? 0.5 : 0;
  return { x: m.tx + (0.5 - origin) * w, y: m.ty + (0.5 - origin) * hgt, type: hit.type };
});
const keyBefore = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey);
if (firstButton && firstButton.y > 180 && firstButton.y < 760) {
  await dragFrom(firstButton.x, firstButton.y, -80);
  const keyAfter = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey);
  check('a press on a Build-screen control that drags turns no page', keyAfter === keyBefore, `${keyBefore} -> ${keyAfter} (${firstButton.type})`);
} else {
  check('a button stands inside the Build screen\'s list', false, JSON.stringify(firstButton));
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: list items fire on the lift, chrome on the press' : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
