/**
 * Everything standing on the ground sorts on the ink its feet are drawn at.
 *
 * The ground band's whole rule is that a thing is in front of another thing when its feet are
 * lower down the sheet. That rule is only as good as the band's idea of where a thing's feet are,
 * and it used to be the box each asset was *fitted into* rather than the drawing inside it. The
 * two disagreed in both directions at once — a soft ridge sorted a median 13 world units behind
 * its own base, a settlement compound 6 units in front of its own — so a town beat any ridge
 * standing up to a stride in front of it, and a house drew over a mountain.
 *
 * This measures the drawn ink of every relief image, scatter prop and settlement compound on a
 * real map against the foot line its depth was actually computed from, then checks the thing that
 * fault was visible as: no settlement may draw over rock that stands in front of it.
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://localhost:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
    errors.push(message.text());
  }
});
await page.addInitScript(() => {
  localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
  // The one tier that keeps settlement ink live alongside the relief, so the two sort against each
  // other as scene objects rather than inside one baked raster. It is where the fault showed.
  localStorage.setItem('mandate:graphics:v1', 'high');
});

await page.goto(`${BASE}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null,
  { timeout: 30_000 },
);
await page.evaluate((seed) => window.__startBenchGame(seed, 'ascent', 'v1'), 20260901);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30_000 });
await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestScene');
  for (const land of scene.state.lands) {
    land.isVisible = true;
    land.isExplored = true;
  }
  scene.refresh();
});
await page.waitForTimeout(2500);

const audit = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestScene');
  const GROUND_DEPTH_BASE = 1.02;
  const GROUND_DEPTH_PER_UNIT = 0.00014;

  // Read the ink out of the texture here rather than calling the renderer's own helper — this
  // has to be able to catch that helper being wrong.
  const footCache = new Map();
  const inkFoot = (textureKey, frameName) => {
    const id = `${textureKey}|${frameName}`;
    if (footCache.has(id)) return footCache.get(id);
    const frame = scene.textures.getFrame(textureKey, frameName);
    const SAMPLE = 128;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      0, 0, SAMPLE, SAMPLE);
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    let foot = 1;
    for (let y = SAMPLE - 1; y >= 0; y -= 1) {
      let opaque = false;
      for (let x = 0; x < SAMPLE; x += 1) {
        if (data[(y * SAMPLE + x) * 4 + 3] > 16) { opaque = true; break; }
      }
      if (opaque) { foot = (y + 1) / SAMPLE; break; }
    }
    footCache.set(id, foot);
    return foot;
  };

  const bandOf = (obj) => {
    if (obj.getData?.('conquestReliefArt')) return 'relief';
    if (obj.getData?.('conquestScatterArt')) return 'scatter';
    if (obj.getData?.('conquestSettlementArt') === true) return 'settlement';
    return null;
  };

  const drift = { relief: [], scatter: [], settlement: [] };
  const relief = [];
  for (const obj of scene.children.list) {
    const kind = bandOf(obj);
    if (!kind || !obj.texture || !obj.frame) continue;
    const foot = obj.y + (inkFoot(obj.texture.key, obj.frame.name) - obj.originY) * obj.displayHeight;
    const sortedOn = (obj.depth - GROUND_DEPTH_BASE) / GROUND_DEPTH_PER_UNIT;
    drift[kind].push(Math.abs(foot - sortedOn));
    if (kind === 'relief') {
      const box = obj.getBounds();
      relief.push({ foot, depth: obj.depth, x0: box.x, x1: box.right, y0: box.y, y1: box.bottom });
    }
  }

  // The visible fault: a compound drawing over rock whose feet are lower than its own.
  const towns = [];
  for (const [id, ink] of scene.landInk ?? []) {
    const land = scene.state.lands.find((candidate) => candidate.id === id);
    const rect = scene.landStructureBounds?.get(id);
    if (!rect || ink.length === 0) continue;
    let depth = -Infinity;
    let foot = -Infinity;
    for (const piece of ink) {
      depth = Math.max(depth, piece.depth);
      if (piece.texture && piece.frame && piece.getData?.('conquestSettlementArt') === true) {
        foot = Math.max(foot, piece.y
          + (inkFoot(piece.texture.key, piece.frame.name) - piece.originY) * piece.displayHeight);
      }
    }
    if (!Number.isFinite(foot)) foot = rect.bottom;
    const inFront = relief.filter((rock) => (
      !(rect.right < rock.x0 || rock.x1 < rect.left || rect.bottom < rock.y0 || rock.y1 < rect.top)
      && rock.foot > foot
    ));
    towns.push({
      name: land?.name ?? id,
      rockInFront: inFront.length,
      rockDrawnBehind: inFront.filter((rock) => rock.depth <= depth).length,
    });
  }

  const stat = (values) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      n: sorted.length,
      median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
      max: Number(sorted[sorted.length - 1].toFixed(2)),
    };
  };
  return {
    drift: {
      relief: stat(drift.relief),
      scatter: stat(drift.scatter),
      settlement: stat(drift.settlement),
    },
    towns: towns.length,
    townsWithRockInFront: towns.filter((town) => town.rockInFront > 0).length,
    townsDrawnOverRock: towns.filter((town) => town.rockDrawnBehind > 0),
  };
});

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

// A world unit is roughly a third of a metre of ground. Two is inside the depth budget a composite
// spends on its own internal paint order, and far below the 6-to-20 the fault ran at.
for (const kind of ['relief', 'scatter', 'settlement']) {
  const summary = audit.drift[kind];
  check(`${kind} sorts on the ink its feet are drawn at`, summary !== null && summary.max <= 2,
    summary ? `${summary.n} objects, median ${summary.median}, worst ${summary.max} world units off` : 'none found');
}
check('rock standing in front of a town is drawn in front of it',
  audit.townsWithRockInFront > 0 && audit.townsDrawnOverRock.length === 0,
  `${audit.townsWithRockInFront}/${audit.towns} towns have rock in front; `
    + `${audit.townsDrawnOverRock.length} drawn over`
    + `${audit.townsDrawnOverRock.length > 0 ? `: ${audit.townsDrawnOverRock.map((town) => town.name).join(', ')}` : ''}`);
check('no browser errors', errors.length === 0, errors[0] ?? 'none');

await browser.close();
for (const result of checks) {
  console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name} — ${result.detail}`);
}
const passed = checks.filter((result) => result.ok).length;
console.log(`\n${passed}/${checks.length} ground-order checks passed`);
if (passed !== checks.length) process.exitCode = 1;
