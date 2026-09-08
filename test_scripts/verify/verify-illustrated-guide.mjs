import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/illustrated-guide';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const checks = [], errors = [];
const check = (ok, name, detail) => { checks.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

async function locate(page, data, value) {
  return page.evaluate(([key, value]) => {
    const scene = window.__phaserGame.scene.getScene('GuideScene');
    const walk = list => {
      for (const child of list ?? []) {
        if (child.getData(key) === value) return child;
        const nested = walk(child.list);
        if (nested) return nested;
      }
    };
    const object = walk(scene.children.list);
    if (!object) return null;
    const hit = object.list.find(o => o.input?.enabled);
    const world = object.getWorldTransformMatrix().transformPoint(hit.x, hit.y);
    const camera = scene.cameras.main, origin = camera.getWorldPoint(0, 0), unit = camera.getWorldPoint(1, 1);
    const canvas = scene.game.canvas.getBoundingClientRect();
    return {
      x: canvas.x + ((world.x - origin.x) / (unit.x - origin.x)) / scene.scale.width * canvas.width,
      y: canvas.y + ((world.y - origin.y) / (unit.y - origin.y)) / scene.scale.height * canvas.height,
    };
  }, [data, value]);
}
async function click(page, data, value) {
  const point = await locate(page, data, value);
  if (!point) throw new Error(`Missing ${data} ${value}`);
  await page.mouse.click(point.x, point.y, { delay: 40 });
  await page.waitForTimeout(400);
}
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));

for (const [width, height, language] of [[390, 844, 'vi'], [320, 568, 'vi'], [390, 844, 'en'], [1440, 900, 'vi'], [1440, 900, 'en']]) {
  const tag = `${language}-${width}x${height}`;
  if (process.env.GUIDE_CASE && process.env.GUIDE_CASE !== tag) continue;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  await page.addInitScript(language => localStorage.setItem('mandate:language:v1', language), language);
  await page.goto(`${BASE}/?capture=1&noladder=1&layout=${width > 600 ? 'desktop' : 'phone'}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').scene.start('GuideScene'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('GuideScene') && JSON.parse(window.render_game_to_text()).entries?.every(e => e.imageLoaded));
  await page.waitForTimeout(550);
  check((await state(page)).tab === 'conquest', `${tag}: opens Conquest chapter`);
  const buttons = await Promise.all(['conquest', 'battle', 'menu', 'classic'].map(kind => locate(page, 'guideCopilot', kind)));
  check(buttons.every(p => p && p.x > 0 && p.x < width && p.y > 0 && p.y < Math.min(height - 180, height * 0.5)), `${tag}: all four launchers visible immediately`, buttons);

  for (const tab of ['conquest', 'battle']) {
    await click(page, 'guideTab', tab);
    const before = await state(page);
    check(before.tab === tab && before.entries.length === (tab === 'conquest' ? 7 : 3) && before.entries.every(e => e.imageLoaded), `${tag}/${tab}: real pointer selects all loaded topic captures`, before);
    await page.screenshot({ path: `${OUT}/${tag}-${tab}-top.png` });
    const measured = await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('GuideScene');
      const cards = s.scroll.content.list.filter(o => o.getData('guideEntry'));
      return cards.every((c, i) => !i || c.y >= cards[i - 1].y + cards[i - 1].getData('guideCardHeight'));
    });
    check(measured, `${tag}/${tab}: localized cards do not overlap`);
    check(before.entries.reduce((n, entry) => n + entry.sections.length, 0) >= 13,
      `${tag}/${tab}: detailed chapter includes at least thirteen explained topics`);
    const lastId = before.entries.at(-1).id;
    // The longer Conquest contents list scrolls on small phones. Bring each link into view.
    for (const entry of before.entries) {
      await page.evaluate(id => {
        const s = window.__phaserGame.scene.getScene('GuideScene');
        const link = s.scroll.content.list.find(o => o.getData('guideJump') === id);
        s.scroll.setScroll(Math.max(0, link.y - s.scroll.bounds.height / 2));
      }, entry.id);
      await click(page, 'guideJump', entry.id);
      const reached = await page.evaluate(id => {
        const s = window.__phaserGame.scene.getScene('GuideScene');
        return Math.abs(s.scroll.offset - s.entryTops[id]) < 1;
      }, entry.id);
      check(reached, `${tag}/${tab}: contents opens ${entry.id}`);
      if (tab === 'conquest' && ['conquest-build', 'conquest-relations', 'conquest-heroes', 'conquest-court'].includes(entry.id)) {
        await page.screenshot({ path: `${OUT}/${tag}-${entry.id}.png` });
      }
    }
    await page.evaluate(id => {
      const s = window.__phaserGame.scene.getScene('GuideScene');
      const link = s.scroll.content.list.find(o => o.getData('guideJump') === id);
      s.scroll.setScroll(Math.max(0, link.y - s.scroll.bounds.height / 2));
    }, lastId);
    await click(page, 'guideJump', lastId);
    const jumped = await page.evaluate(id => {
      const s = window.__phaserGame.scene.getScene('GuideScene');
      return Math.abs(s.scroll.offset - s.entryTops[id]) < 1;
    }, lastId);
    check(jumped, `${tag}/${tab}: contents jumps directly to the final topic group`);
    // Read a real detailed section, including its full rendered paragraph on both layouts.
    await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('GuideScene');
      const card = s.scroll.content.list.find(o => o.getData('guideEntry'));
      const heading = card.list.find(o => o.getData('guideSection'));
      s.scroll.setScroll(card.y + heading.y - 8);
    });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/${tag}-${tab}-details.png` });
    if (tab === 'battle') {
      const counters = await page.evaluate(() => {
        const s = window.__phaserGame.scene.getScene('GuideScene');
        const card = s.scroll.content.list.find(o => o.getData('guideEntry') === 'battle-orders');
        const rows = card.list.filter(o => o.getData('guideCounter'));
        s.scroll.setScroll(card.y + rows[0].y - 48);
        return rows.map(o => o.getData('guideCounter'));
      });
      check(counters.length === 5 && counters.find(row => row.enemy === 'no')?.strong === 'quy'
        && counters.find(row => row.enemy === 'no')?.soft === 'tan', `${tag}: complete counter reference includes both answers to Volley`);
      await page.waitForTimeout(100);
      await page.screenshot({ path: `${OUT}/${tag}-formation-table.png` });
    }
    await page.evaluate(id => {
      const s = window.__phaserGame.scene.getScene('GuideScene');
      const card = s.scroll.content.list.find(o => o.getData('guideEntry') === id);
      const button = card.list.find(o => o.getData('guideContents'));
      s.scroll.setScroll(card.y + button.y - s.scroll.bounds.height / 2);
    }, lastId);
    await click(page, 'guideContents', lastId);
    check((await state(page)).scrollOffset === 0, `${tag}/${tab}: return-to-contents resets the long article`);

    // An image scrolled behind the fixed chrome must never receive an invisible tap.
    await page.evaluate(() => window.__phaserGame.scene.getScene('GuideScene').scroll.setScroll(370));
    await page.mouse.click(width / 2, height * 0.055);
    await page.waitForTimeout(400);
    check(!(await state(page)).expandedImage, `${tag}/${tab}: fixed header blocks clipped image taps`);
    await page.evaluate(() => window.__phaserGame.scene.getScene('GuideScene').scroll.setScroll(0));
    await page.mouse.click(width / 2, height - 3);
    await page.waitForTimeout(400);
    check(!(await state(page)).expandedImage && (await state(page)).mode === 'guide', `${tag}/${tab}: fixed footer blocks clipped image taps`);

    const first = before.entries[0].id;
    // Scroll the enlarge control into the actual viewport, then click it normally.
    await page.evaluate(id => {
      const s = window.__phaserGame.scene.getScene('GuideScene');
      const card = s.scroll.content.list.find(o => o.getData('guideEntry') === id);
      const button = card.list.find(o => o.getData('guideExpand') === id);
      s.scroll.setScroll(card.y + button.y - s.scroll.bounds.height / 2);
    }, first);
    const saved = (await state(page)).scrollOffset;
    await click(page, 'guideExpand', first);
    check((await state(page)).expandedImage === first, `${tag}/${tab}: enlarge opens correct capture`);
    await page.screenshot({ path: `${OUT}/${tag}-${tab}-enlarged.png` });
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(100);
    check((await state(page)).scrollOffset === saved, `${tag}/${tab}: enlarged view locks the article`);
    await click(page, 'guideCloseImage', true);
    check(!(await state(page)).expandedImage && (await state(page)).scrollOffset === saved, `${tag}/${tab}: close restores reading position`);
    await click(page, 'guideExpand', first);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    check(!(await state(page)).expandedImage && (await state(page)).mode === 'guide', `${tag}/${tab}: Escape closes image without leaving guide`);
    await page.waitForTimeout(350);

    // A drag begun on the image must scroll rather than open the lightbox.
    await page.evaluate(id => {
      const s = window.__phaserGame.scene.getScene('GuideScene');
      s.scroll.setScroll(s.entryTops[id]);
    }, first);
    const p = await locate(page, 'guideExpandImage', first);
    const fromY = Math.min(p.y, height - 100);
    await page.mouse.move(p.x, fromY);
    await page.mouse.down();
    await page.mouse.move(p.x, fromY - 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    check(!(await state(page)).expandedImage && (await state(page)).scrollOffset > 30, `${tag}/${tab}: drag over capture scrolls without opening`);
    await page.mouse.move(width / 2, height - 150);
    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(350);
    const bottom = await state(page);
    check(bottom.scrollOffset > 100, `${tag}/${tab}: wheel reaches later instructions`);
    await page.screenshot({ path: `${OUT}/${tag}-${tab}-bottom.png` });
    await click(page, 'guideTab', tab === 'conquest' ? 'battle' : 'conquest');
    await click(page, 'guideTab', tab);
    check(Math.abs((await state(page)).scrollOffset - bottom.scrollOffset) <= 1, `${tag}/${tab}: tab switch preserves reading position`);
  }
  if (width > 600) {
    await page.setViewportSize({ width: 1050, height: 800 });
    await page.waitForTimeout(500);
    const p = await locate(page, 'guideCopilot', 'classic');
    check(p.x > 0 && p.x < 1050 && p.y < 400, `${tag}: desktop resize keeps launchers on screen`);
    await page.screenshot({ path: `${OUT}/${tag}-resized.png` });
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MenuScene'));
  check(true, `${tag}: guide returns to menu`);
  await page.close();
}
await browser.close();
check(errors.length === 0, 'no browser or missing-image errors', errors);
writeFileSync(`${OUT}/results${process.env.GUIDE_CASE ? `-${process.env.GUIDE_CASE}` : ''}.json`, JSON.stringify({ checks, errors }, null, 2));
process.exitCode = checks.some(c => !c.ok) ? 1 : 0;
