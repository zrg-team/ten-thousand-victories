/** Packed art, lazy families, and both missing/corrupt page fallbacks in production. */
import assert from 'node:assert/strict';
import { boot, startWorld } from '../perf/_boot.mjs';
for (const failure of ['missing', 'corrupt', 'bypass']) {
  const { browser, page, errors } = await boot({ quality: 'medium', query: '?capture=1&bench=1' });
  try {
    if (failure !== 'bypass') await page.route('**/art/atlases/flora-0.png', route => route.fulfill({
      status: failure === 'missing' ? 404 : 200, contentType: 'image/png', body: 'deliberate atlas failure',
    }));
    if (failure === 'bypass') await page.goto(page.url() + '&noartatlas=1'); else await page.reload();
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
    const menu = await page.evaluate(() => Object.keys(window.__phaserGame.textures.list));
    assert.ok(menu.includes('conquest-art:flora.tree.spring'));
    assert.ok(!menu.includes('conquest-atlas:flora-0'));
    assert.ok(!menu.some(key => /conquest-(atlas|art):(?:figures|building)/.test(key)));
    await startWorld(page, { mode: 'ascent' });
    assert.ok(!errors.some(error => error.startsWith('PAGEERROR:')), errors.join('\n'));
    console.log(`PASS ${failure}: original artwork available, map opens, no application errors`);
  } finally { await browser.close(); }
}
