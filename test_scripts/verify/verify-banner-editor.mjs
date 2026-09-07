// Exercise the real scrollable banner editor, persistence and shared coronation rendering.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5181';
const OUT = 'output/banner-editor';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const checks = [];
function check(label, ok, detail) {
  checks.push({ label, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
}
async function open(language, height, width = 390) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((lang) => localStorage.setItem('mandate:language:v1', lang), language);
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  await page.evaluate(async () => {
    const { setDynastyFounder } = await import('/src/state/dynasty.ts');
    const { rollFounder } = await import('/src/ui/faces/kingLook.ts');
    const founder = rollFounder(0, () => 0);
    founder.banner = { field: 0x26313c, trim: 0xd8b45a, emblem: 'crown' };
    setDynastyFounder(founder, 'Ngô');
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    menu.mode = 'temple'; menu.render(); menu.templeSheet.step = 1; menu.render();
  });
  await page.waitForTimeout(150);
  return page;
}
async function pick(page, kind, value, host = 'menu') {
  const point = await page.evaluate(({ kind, value, host }) => {
    const menu = window.__phaserGame.scene.getScene(host === 'menu' ? 'MenuScene' : 'ConquestUIScene');
    const area = host === 'menu' ? menu.pageScroll : menu.activeScrollAreas[0];
    const zone = area.content.list.find((o) => o.getData?.('bannerChoice')?.kind === kind && o.getData('bannerChoice').value === value);
    if (!zone) throw new Error(`Missing ${kind}:${value}`);
    area.setScroll(zone.y - area.bounds.height / 2 + zone.height / 2);
    const transform = zone.getWorldTransformMatrix();
    const position = transform.transformPoint(zone.width / 2, zone.height / 2);
    const camera = menu.cameras.main;
    const screen = camera.matrix.transformPoint(position.x - camera.scrollX, position.y - camera.scrollY);
    const canvas = document.querySelector('canvas').getBoundingClientRect();
    return { x: canvas.x + screen.x / menu.scale.width * canvas.width,
      y: canvas.y + screen.y / menu.scale.height * canvas.height, scroll: -area.content.y };
  }, { kind, value, host });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(70);
  return { before: point.scroll, ...await page.evaluate((host) => {
    const scene = window.__phaserGame.scene.getScene(host === 'menu' ? 'MenuScene' : 'ConquestUIScene');
    const text = JSON.parse(window.render_game_to_text());
    return { after: -(host === 'menu' ? scene.pageScroll : scene.activeScrollAreas[0]).content.y,
      banner: (host === 'menu' ? scene.templeSheet : scene.coronationSheet).banner,
      text: host === 'menu' ? text.bannerEditor : text.ascent.ui.bannerEditor };
  }, host) };
}

const page = await open('vi', 844);
await page.screenshot({ path: `${OUT}/vi-top.png` });
const initial = await page.evaluate(() => JSON.parse(window.render_game_to_text()).bannerEditor);
check('sixteen signs with twelve unlockable choices', initial.options.length === 16 && initial.options.filter((x) => x.locked).length === 12, initial);
const field = await pick(page, 'field', 0xaa3a2c);
check('field tap changes preview and text state without losing scroll', field.banner.field === 0xaa3a2c && field.text.field === 0xaa3a2c && field.before === field.after);
const trim = await pick(page, 'trim', 0xaa3a2c);
check('matching colours remain a valid stored choice', trim.banner.field === trim.banner.trim && trim.before === trim.after);
await pick(page, 'trim', 0xd8b45a);
for (const id of ['banner', 'blade', 'grain', 'crown']) {
  const result = await pick(page, 'emblem', id);
  check(`tap selects ${id} and preserves scroll`, result.banner.emblem === id && result.text.emblem === id && result.before === result.after);
}
const locked = await pick(page, 'emblem', 'tortoise');
check('locked turtle cannot replace selection', locked.banner.emblem === 'crown');
await page.screenshot({ path: `${OUT}/vi-choices-locked.png` });
await page.evaluate(async () => {
  const { grantDeed } = await import('/src/state/cabinet.ts');
  grantDeed('era-empires'); grantDeed('era-mandate');
  window.__phaserGame.scene.getScene('MenuScene').render();
});
for (const id of ['branch', 'tortoise']) {
  const result = await pick(page, 'emblem', id);
  check(`earned ${id} can be selected`, result.banner.emblem === id && result.text.options.find((x) => x.id === id).locked === false);
}
await page.screenshot({ path: `${OUT}/vi-choices.png` });
// Save via the sheet's real footer action; reload from browser storage and reopen.
const saved = await page.evaluate(async () => {
  const menu = window.__phaserGame.scene.getScene('MenuScene');
  const { getDynasty } = await import('/src/state/dynasty.ts');
  const before = getDynasty().founder;
  menu.templeSheet.foot().close.onTap();
  const after = getDynasty().founder;
  return { before, after, menuMode: menu.mode, text: JSON.parse(window.render_game_to_text()) };
});
check('save keeps identity and stores the chosen banner', saved.after.banner.emblem === 'tortoise'
  && saved.after.name === saved.before.name && saved.after.armyEra === saved.before.armyEra
  && saved.menuMode === 'dynasty' && !saved.text.bannerEditor);
await page.screenshot({ path: `${OUT}/dynasty.png` });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
const restored = await page.evaluate(() => {
  const menu = window.__phaserGame.scene.getScene('MenuScene');
  menu.mode = 'temple'; menu.render(); menu.templeSheet.step = 1; menu.render();
  return menu.templeSheet.banner;
});
check('banner survives reload and reopens selected', JSON.stringify(restored) === JSON.stringify(saved.after.banner));
await pick(page, 'emblem', 'blade');
const discarded = await page.evaluate(async () => {
  const menu = window.__phaserGame.scene.getScene('MenuScene');
  menu.templeSheet.foot().back.onTap();
  menu.templeSheet.foot().back.onTap();
  return (await import('/src/state/dynasty.ts')).getDynasty().founder.banner;
});
check('discard preserves the saved banner', JSON.stringify(discarded) === JSON.stringify(restored));

// Inspect the art at picker scale and all six-by-five colour combinations.
await page.evaluate(async () => {
  const menu = window.__phaserGame.scene.getScene('MenuScene');
  menu.children.list.forEach((o) => o.setVisible?.(false));
  menu.add.rectangle(0, 0, menu.scale.width, menu.scale.height, 0xf3ecd8).setOrigin(0);
  const { drawHouseBanner } = await import('/src/ui/ascent/houseBanner.ts');
  const { KING_ROBES, BANNER_TRIMS, BANNER_EMBLEMS } = await import('/src/ui/faces/kingLook.ts');
  KING_ROBES.forEach((field, row) => BANNER_TRIMS.forEach((trim, col) => {
    drawHouseBanner(menu, { field, trim, emblem: BANNER_EMBLEMS[row] }, 62, 72).setPosition(12 + col * 73, 30 + row * 100);
  }));
});
await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/colour-matrix.png` });
await page.close();

for (const [language, width, height] of [['vi', 390, 620], ['en', 390, 844], ['vi', 320, 568]]) {
  const compact = await open(language, height, width);
  const result = await pick(compact, 'emblem', 'grain');
  check(`${language} ${width}×${height}: scrolled card responds and holds position`, result.banner.emblem === 'grain' && result.before === result.after);
  if (language === 'vi' && width === 390) {
    const drag = await compact.evaluate(() => {
      const menu = window.__phaserGame.scene.getScene('MenuScene');
      const area = menu.pageScroll;
      const canvas = document.querySelector('canvas').getBoundingClientRect();
      const camera = menu.cameras.main;
      const p = camera.matrix.transformPoint(area.bounds.x + 100, area.bounds.y + 75);
      return { x: canvas.x + p.x / menu.scale.width * canvas.width,
        y: canvas.y + p.y / menu.scale.height * canvas.height,
        before: -area.content.y, banner: JSON.stringify(menu.templeSheet.banner) };
    });
    await compact.mouse.move(drag.x, drag.y);
    await compact.mouse.down();
    await compact.mouse.move(drag.x, drag.y + 60, { steps: 12 });
    await compact.mouse.up();
    const after = await compact.evaluate(() => {
      const menu = window.__phaserGame.scene.getScene('MenuScene');
      return { scroll: -menu.pageScroll.content.y, banner: JSON.stringify(menu.templeSheet.banner) };
    });
    check('drag scroll does not accidentally select a colour or motif', after.banner === drag.banner && after.scroll < drag.before);
    await pick(compact, 'emblem', 'grain');
  }
  await compact.screenshot({ path: `${OUT}/${language}-${width}x${height}-choices.png` });
  await compact.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').pageScroll.setScroll(0));
  await compact.screenshot({ path: `${OUT}/${language}-${width}x${height}-top.png` });
  await compact.close();
}
// The other host: a first-run coronation on a short phone, through to the saved founder.
const rite = await browser.newPage({ viewport: { width: 390, height: 620 }, deviceScaleFactor: 2 });
rite.on('pageerror', (e) => errors.push(e.message));
rite.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await rite.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await rite.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene') && window.__startBenchGame);
await rite.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await rite.waitForFunction(() => window.__phaserGame.scene.getScene('ConquestUIScene').coronationSheet);
await rite.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.coronationSheet.foot().close.onTap();
  ui.coronationSheet.foot().close.onTap();
});
await rite.waitForTimeout(150);
const ritePick = await pick(rite, 'emblem', 'blade', 'coronation');
check('coronation uses the same working choices and preserves scroll', ritePick.banner.emblem === 'blade'
  && ritePick.text.emblem === 'blade' && ritePick.before === ritePick.after);
await rite.screenshot({ path: `${OUT}/coronation-620.png` });
const crowned = await rite.evaluate(async () => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.coronationSheet.foot().close.onTap();
  ui.coronationSheet.foot().close.onTap();
  return (await import('/src/state/dynasty.ts')).getDynasty().founder;
});
check('completing coronation stores the edited banner', crowned.banner.emblem === 'blade');
await rite.close();
check('no browser errors', errors.length === 0, errors);
writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
await browser.close();
process.exitCode = checks.every((x) => x.ok) ? 0 : 1;
