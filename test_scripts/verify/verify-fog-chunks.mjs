/**
 * The fog band's cover contract, after the blank-map round (see `ChunkedMapLayer.conceal`):
 *
 *   1. A concealed region stands over a stale tile — including one the camera reaches later —
 *      and comes down the moment that tile is current. Cover is the tile's box clipped to the
 *      region, never the tile itself and never the whole world.
 *   2. A stale tile with no region over it keeps its old imagery: paper over imagery that shows
 *      no more than it should is a blank patch for nothing.
 *   3. A conceal that no invalidation follows is released when the scene reports the refresh
 *      settled — it used to stand until some unrelated fog change came along.
 *   4. A conceal an invalidation does follow is held whole while the plans are being prepared,
 *      then per stale tile, then released.
 *
 * Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-fog-chunks.mjs
 */
import assert from 'node:assert/strict';
import { boot, startWorld, resolveOpening } from '../perf/_boot.mjs';
const { browser, page, errors } = await boot({ quality: 'medium', query: '?capture=1&bench=1' });
try {
  await startWorld(page, { mode: 'ascent' }); await resolveOpening(page);
  await page.waitForFunction(() => { const s = window.__phaserGame.scene.getScene('ConquestScene').performanceStats(); return !s.refreshPending && !s.sceneryPending && !s.fog.pending; });
  const result = await page.evaluate(() => {
    const world = window.__phaserGame.scene.getScene('ConquestScene'), layer = world.overlays.fogChunks;
    const rects = () => {
      const cmd = layer.cover?.visible ? layer.cover.commandBuffer : [];
      const out = [];
      for (let i = 0; i < cmd.length;) {
        const op = cmd[i];
        if (op === 3) { out.push({ x: cmd[i + 1], y: cmd[i + 2], w: cmd[i + 3], h: cmd[i + 4] }); i += 5; }
        else if (op === 7) i += 3; else if (op === 6) i += 4; else i += 1;
      }
      return out;
    };
    const full = () => rects().some((r) => r.w >= layer.width && r.h >= layer.height);
    const tile = [...layer.tiles.values()].find((t) => t.visible), box = layer.rectangle(tile.key);
    const original = tile.signature;
    // A region a little smaller than the tile, so the clip is observable.
    const region = { x: box.x + 40, y: box.y + 30, width: box.width - 80, height: box.height - 60 };

    // 1. armed region over a stale tile: covered as the clip, released when the tile is current.
    layer.conceal([region], false);
    tile.signature = 'stale-before-visibility-loss';
    layer.update(0);
    const armed = rects();
    const clipped = armed.some((r) => r.x === region.x && r.y === region.y && r.w === region.width && r.h === region.height);
    const wholeTile = armed.some((r) => r.x === box.x && r.y === box.y && r.w === box.width && r.h === box.height);
    const fullWhileArmed = full();
    tile.signature = original; layer.update(0);
    const releasedAfterRepaint = rects().length === 0 && layer.concealedCount() === 0;

    // 2. stale tile, no region: old imagery stays, no paper.
    tile.signature = 'stale-after-a-reveal'; layer.update(0);
    const noPaperWithoutRegion = rects().length === 0;
    tile.signature = original; layer.update(0);

    // 3. a conceal nothing arms is released when the refresh settles.
    layer.conceal([region]);
    layer.update(0);
    const pendingShown = rects().length === 1 && !full();
    layer.concealSettled(); layer.update(0);
    const settledReleased = rects().length === 0 && layer.concealedCount() === 0;

    // 4. a conceal an invalidation arms: whole while planning, then per stale tile, then gone.
    layer.conceal([region]);
    layer.invalidate(layer.sources, layer.width, layer.height, layer.scale);
    const armedByInvalidate = layer.concealedCount() === 1 && layer.prepare !== undefined;
    const wholeWhilePlanning = rects().length === 1 && !full();
    layer.flush();
    const goneWhenPainted = rects().length === 0 && layer.concealedCount() === 0 && !layer.stats().pending;

    return { clipped, wholeTile, fullWhileArmed, releasedAfterRepaint, noPaperWithoutRegion, pendingShown, settledReleased, armedByInvalidate, wholeWhilePlanning, goneWhenPainted, pending: layer.stats().pending };
  });
  console.log(JSON.stringify(result));
  assert.equal(result.clipped, true, 'an armed region covers a stale tile, clipped to the region');
  assert.equal(result.wholeTile, false, 'the cover is the region, not the tile');
  assert.equal(result.fullWhileArmed, false, 'never the whole world');
  assert.equal(result.releasedAfterRepaint, true, 'the region comes down once the tile is current');
  assert.equal(result.noPaperWithoutRegion, true, 'a stale tile with no region keeps its imagery');
  assert.equal(result.pendingShown, true, 'a pending conceal is drawn whole');
  assert.equal(result.settledReleased, true, 'and released when the refresh settles without a fog change');
  assert.equal(result.armedByInvalidate, true, 'an invalidation arms the pending region');
  assert.equal(result.wholeWhilePlanning, true, 'drawn whole while the plans are being prepared');
  assert.equal(result.goneWhenPainted, true, 'and gone once its tiles are painted');
  assert.equal(result.pending, false);
  // Pre-existing on this checkout: story-print setting images referenced before they exist.
  assert.deepEqual(errors.filter((e) => !/Failed to process file|File failed:|is not valid JSON/.test(e)), []);
  console.log('PASS concealed ground is paper only where its fog is not yet back, and never the whole world');
} finally { await browser.close(); }
