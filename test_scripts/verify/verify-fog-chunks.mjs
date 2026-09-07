/** A stale offscreen fog tile must be covered on a later pan, including after conceal settled. */
import assert from 'node:assert/strict';
import { boot, startWorld, resolveOpening } from '../perf/_boot.mjs';
const { browser, page, errors } = await boot({ quality: 'medium', query: '?capture=1&bench=1' });
try {
  await startWorld(page, { mode: 'ascent' }); await resolveOpening(page);
  await page.waitForFunction(() => { const s = window.__phaserGame.scene.getScene('ConquestScene').performanceStats(); return !s.refreshPending && !s.sceneryPending && !s.fog.pending; });
  const result = await page.evaluate(() => {
    const world = window.__phaserGame.scene.getScene('ConquestScene'), layer = world.overlays.fogChunks;
    const tile = [...layer.tiles.values()].find(tile => tile.visible), box = layer.rectangle(tile.key);
    // Model an old cached tile arriving in view after the previous loss finished elsewhere.
    // Zero preparation allowance holds its replacement pending while exercising the real cover.
    const original = tile.signature; tile.signature = 'stale-before-visibility-loss'; layer.covered = false;
    layer.update(0);
    const commands = layer.cover.commandBuffer;
    const covered = commands.some((op, i) => op === 3 && commands[i+1] === box.x && commands[i+2] === box.y && commands[i+3] === box.width && commands[i+4] === box.height);
    tile.signature = original; layer.update(0);
    return { covered, box: { x: box.x, y: box.y }, pending: layer.stats().pending };
  });
  assert.equal(result.covered, true); assert.equal(result.pending, false); assert.deepEqual(errors, []);
  console.log('PASS stale fog is opaque until its current imagery is ready', result);
} finally { await browser.close(); }
