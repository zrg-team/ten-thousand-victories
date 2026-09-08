// The front page and the History page it leads to, in both languages and at the shortest sheet
// the design surface allows. Pairs with verify-history.mjs, which asserts; this one is for looking.
import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
for (const [lang, h] of [['vi', 844], ['vi', 620], ['en', 844]]) {
  const page = await browser.newPage({ viewport: { width: 390, height: h }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `test_scripts/shots/menu-${lang}-${h}.png` });

  // Reach the History page by clicking the real button, not by starting the scene.
  // Polled, not sampled once. The front page builds its diorama over a second or so and the
  // button is not in `children.list` until it does — a single evaluate after a fixed wait reports
  // "no History button on the menu" perhaps one run in six, which reads as a broken page.
  const at = await page.waitForFunction(() => {
    const s = window.__phaserGame.scene.getScene('MenuScene');
    for (const c of s.children.list) {
      const label = c.list?.find?.((k) => k.type === 'Text');
      // `history.menu.button` — "History" / "Lịch sử". The old "Real History" / "Sử thật" wording
      // is gone from the menu, so this never matched. Not a Phaser 4 change; found while migrating.
      if (label && /Lịch sử|History/.test(label.text)) {
        const m = label.getWorldTransformMatrix();
        return { x: m.tx, y: m.ty };
      }
    }
    return null;
  }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
  if (!at) { console.log(`FAIL ${lang} h=${h}: no History button on the menu`); await page.close(); continue; }
  // Design units are CSS pixels here: RENDER_SCALE inflates gameSize and the camera zoom takes it
  // straight back out, so a world coordinate is already where the finger goes.
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('HistoryScene'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  const active = await page.evaluate(() => window.__phaserGame.scene.isActive('HistoryScene'));
  await page.screenshot({ path: `test_scripts/shots/history-${lang}-${h}.png` });

  // Every tab, shut and then opened. Since the lists became drawers there are two things worth
  // looking at per tab and they are different pictures: the headings a reader lands on, and the
  // rows behind one of them. Tab centres are computed the same way the scene lays them out.
  const SIDE = 12;
  const TABS = ['dynasties', 'figures', 'stories', 'army', 'terms'];
  const tabWidth = Math.floor((390 - SIDE * 2 - 4 * 4) / 5);
  for (const [index, tab] of TABS.entries()) {
    const at = await page.evaluate(tab => {
      const scene=window.__phaserGame.scene.getScene('HistoryScene');
      const button=scene.children.list.find(o=>o.getData('historyTab')===tab);
      const label=button.list.find(o=>o.type==='Text');
      const m=label.getWorldTransformMatrix();
      return {x:m.tx,y:m.ty};
    },tab);
    await page.mouse.click(at.x,at.y);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test_scripts/shots/history-${tab}-${lang}-${h}.png` });
    if (tab === 'army') continue;
    // And the same tab with every drawer shut — the state that says what the page even contains.
    await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      scene.openSection[scene.tab] = '';
      scene.render();
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test_scripts/shots/history-${tab}-shut-${lang}-${h}.png` });
  }
  console.log(`${active && !errors.length ? 'PASS' : 'FAIL'} ${lang} h=${h} active=${active} errors=${errors.slice(0,2).join(' | ')}`);
  await page.close();
}
await browser.close();
