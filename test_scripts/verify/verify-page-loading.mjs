import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/page-loading';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

async function ready(page, scene) {
  await page.waitForFunction(scene => window.__phaserGame?.scene.isActive(scene)
    && !document.querySelector('[data-page-loading]'), scene, { timeout: 60000 });
}
async function start(page, from, to) {
  await page.evaluate(([from, to]) => window.__phaserGame.scene.getScene(from).scene.start(to), [from, to]);
}
async function click(page, scene, key, value) {
  const point = await page.evaluate(([scene, key, value]) => {
    const s = window.__phaserGame.scene.getScene(scene);
    const walk = list => {
      for (const child of list ?? []) {
        if (child.getData(key) === value) return child;
        const nested = walk(child.list);
        if (nested) return nested;
      }
    };
    const object = walk(s.children.list);
    const hit = object.list.find(o => o.input?.enabled);
    const world = object.getWorldTransformMatrix().transformPoint(hit.x, hit.y);
    const camera = s.cameras.main, origin = camera.getWorldPoint(0, 0), unit = camera.getWorldPoint(1, 1);
    const canvas = s.game.canvas.getBoundingClientRect();
    return { x: canvas.x + (world.x - origin.x) / (unit.x - origin.x) / s.scale.width * canvas.width,
      y: canvas.y + (world.y - origin.y) / (unit.y - origin.y) / s.scale.height * canvas.height };
  }, [scene, key, value]);
  await page.mouse.click(point.x, point.y);
}

try {
  for (const [width, height, language] of [[390, 844, 'en'], [1440, 900, 'vi']]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.url().includes('/art/')) requests.push(r.url()); });
    await page.addInitScript(language => localStorage.setItem('mandate:language:v1', language), language);
    await page.goto(`${BASE}/?capture=1&noladder=1&layout=${width > 600 ? 'desktop' : 'phone'}`);
    await ready(page, 'MenuScene');
    await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      const create = scene.create;
      let loadingFrame = false;
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[data-page-loading="HistoryScene"]')) return;
        observer.disconnect();
        requestAnimationFrame(() => { loadingFrame = true; });
      });
      observer.observe(document.body, { childList: true });
      scene.create = function () {
        window.__loadingPaintedBeforeCreate = loadingFrame;
        return create.call(this);
      };
    });
    const bootRequests = requests.length;
    const before = Date.now();
    await start(page, 'MenuScene', 'HistoryScene');
    await ready(page, 'HistoryScene');
    const historyMs = Date.now() - before;
    assert.equal(requests.length, bootRequests, 'History opens without downloading unused artwork');
    assert(await page.evaluate(() => window.__loadingPaintedBeforeCreate), 'Cached scene yields a loading frame before construction');
    assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode), 'history');
    await page.screenshot({ path: `${OUT}/${language}-history.png` });

    // Slow first Army visit must stay covered, then display authored soldiers.
    await page.route('**/art/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue();
    });
    await click(page, 'HistoryScene', 'historyTab', 'army');
    await page.locator('[data-page-loading="HistoryScene"]').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode), 'loading');
    await page.screenshot({ path: `${OUT}/${language}-loading-army.png` });
    await ready(page, 'HistoryScene');
    assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).tab), 'army');
    const armyRequests = requests.length;
    await click(page, 'HistoryScene', 'historyTab', 'dynasties');
    await click(page, 'HistoryScene', 'historyTab', 'army');
    await ready(page, 'HistoryScene');
    assert.equal(requests.length, armyRequests, 'Army revisit reuses textures');
    await page.unroute('**/art/**');

    await page.route('**/art/guide/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 600));
      await route.continue();
    });
    const guideStart = requests.length;
    await start(page, 'HistoryScene', 'GuideScene');
    await page.locator('[data-page-loading="GuideScene"]').waitFor();
    await page.screenshot({ path: `${OUT}/${language}-loading-guide.png` });
    await ready(page, 'GuideScene');
    assert.equal(requests.length - guideStart, 7, 'Only the opening guide chapter is downloaded');
    await click(page, 'GuideScene', 'guideTab', 'battle');
    await page.locator('[data-page-loading="GuideScene"]').waitFor();
    await ready(page, 'GuideScene');
    assert.equal(requests.length - guideStart, 10, 'Battle images download on demand');
    assert(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entries.every(e => e.imageLoaded)));
    await page.screenshot({ path: `${OUT}/${language}-guide.png` });
    await click(page, 'GuideScene', 'guideTab', 'conquest');
    await ready(page, 'GuideScene');
    assert.equal(requests.length - guideStart, 10, 'Guide revisit reuses textures');

    // Navigate away during a chapter download, then re-enter: no stale overlay or callback.
    await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('GuideScene');
      for (const key of s.textures.getTextureKeys().filter(k => k.startsWith('guide:') && k.includes('battle'))) s.textures.remove(key);
    });
    await click(page, 'GuideScene', 'guideTab', 'battle');
    await start(page, 'GuideScene', 'MenuScene');
    await ready(page, 'MenuScene');
    assert.equal(await page.locator('[data-page-loading]').count(), 0);
    await page.unroute('**/art/guide/**');

    // An image failure must finish the loader; a later visit can retry the missing image.
    await page.route('**/art/guide/**/battle-result.webp', route => route.abort());
    await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').scene.start('GuideScene', { tab: 'battle' }));
    await ready(page, 'GuideScene');
    assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).tab), 'battle');
    await start(page, 'GuideScene', 'MenuScene');
    await ready(page, 'MenuScene');
    await page.unroute('**/art/guide/**/battle-result.webp');
    await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').scene.start('GuideScene', { tab: 'battle' }));
    await ready(page, 'GuideScene');
    assert(await page.evaluate(() => JSON.parse(window.render_game_to_text()).entries.every(e => e.imageLoaded)), 'Failed image retries on revisit');
    await start(page, 'GuideScene', 'MenuScene');
    await ready(page, 'MenuScene');

    await page.route('**/art/story-prints/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 450));
      await route.continue();
    });
    await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
    await page.locator('[data-page-loading="ConquestScene"]').waitFor();
    await page.screenshot({ path: `${OUT}/${language}-loading-conquest.png` });
    await ready(page, 'ConquestScene');
    await ready(page, 'ConquestUIScene');
    assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode), 'playing');
    await page.screenshot({ path: `${OUT}/${language}-conquest.png` });
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    report.push({ width, height, language, historyMs, historyArtRequests: 0, initialGuideArtRequests: 7, passed: true });
    console.log('PASS', report.at(-1));
    await page.close();
  }
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
