/** Dev-server cache pressure test using the same composed portraits as lists and armies. */
import assert from 'node:assert/strict';
import { boot, startWorld, resolveOpening } from '../perf/_boot.mjs';
const { browser, page, errors } = await boot({ quality: 'medium', query: '?capture=1&bench=1' });
try {
  await startWorld(page, { mode: 'ascent' }); await resolveOpening(page);
  const result = await page.evaluate(async () => {
    const { renderHeroFace, portraitCacheStats } = await import('/src/ui/FaceRenderer.ts');
    const scene = window.__phaserGame.scene.getScene('ConquestScene'), hero = scene.state.heroes[0];
    scene.state.isStrategyPause = true;
    const keep = renderHeroFace(scene, { ...hero, id: 'cache-pressure-pinned' }, 0, 0, .3);
    const key = keep.list.find(object => object.type === 'Image').texture.key;
    for (let i = 0; i < 120; i++) {
      renderHeroFace(scene, { ...hero, id: `cache-pressure-${i}` }, 0, 0, .3).destroy(true);
    }
    const result = { ...portraitCacheStats(), pinnedTextureSurvives: scene.textures.exists(key) };
    keep.destroy(true); return result;
  });
  assert.equal(result.pinnedTextureSurvives, true);
  assert.ok(result.retained >= 1);
  assert.ok(result.count < 120 && result.bytes <= 16 * 1048576);
  assert.deepEqual(errors, []);
  console.log('PASS portrait eviction preserves live owners', result);
} finally { await browser.close(); }
