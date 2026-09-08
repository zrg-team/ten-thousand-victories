/** Real desktop mouse drags plus the culling/ownership regressions behind map stalls. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startWorld, resolveOpening, FIRST_OPTION } from '../perf/_boot.mjs';
const URL = process.env.DEV_URL ?? 'http://localhost:5179/';
const OUT = process.env.OUT ?? 'output/verify-map-drag';
const browser = await chromium.launch({ headless: false });
const results = [];
await mkdir(OUT, { recursive: true });
const cases = [
  { quality: 'high', language: 'vi', width: 1920, height: 1080 },
  { quality: 'medium', language: 'en', width: 1280, height: 720 },
  { quality: 'low', language: 'vi', width: 1920, height: 1080 },
  { quality: 'high', language: 'en', width: 3440, height: 1440 },
];
try {
 for (const options of cases) {
  const page = await browser.newPage({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: 1 });
  // A source edit elsewhere in the shared workspace must not reload a measured run.
  await page.routeWebSocket('**/*', socket => socket.close());
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(o => { localStorage.setItem('mandate:graphics:v1', o.quality); localStorage.setItem('mandate:layout:v1', 'desktop'); localStorage.setItem('mandate:language:v1', o.language); }, options);
  const settled = async () => { await page.waitForFunction(() => { const s = window.__phaserGame?.scene.getScene('ConquestScene')?.performanceStats(); return s && !s.refreshPending && !s.sceneryPending && !s.ground.pending && !s.fog.pending; }, null, { timeout: 120000 }); await page.waitForTimeout(100); };
  const culling = () => page.evaluate(() => {
   const s = window.__phaserGame.scene.getScene('ConquestScene'); let checked = 0, mismatch = 0, invalidBounds = 0;
   for (const [id, entry] of s.viewIndex.entries) if (id.startsWith('decoration::')) {
    checked++; mismatch += Number(entry.object.visible === s.viewIndex.culled.has(id));
    invalidBounds += Number(!['left','right','top','bottom'].every(k => Number.isFinite(entry.bounds[k])));
   }
   return { checked, mismatch, invalidBounds };
  });
  const target=new globalThis.URL(URL);target.searchParams.set('bench','1');
  await page.goto(target.href); await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  await startWorld(page, { mode: 'ascent' }); await resolveOpening(page);
  await page.evaluate(() => { const s = window.__phaserGame.scene.getScene('ConquestScene'); s.state.isStrategyPause = true; for (const land of s.state.lands) { land.isVisible = true; land.isExplored = true; } s.refresh(); }); await settled();
  await page.evaluate(() => { const s = window.__phaserGame.scene.getScene('ConquestScene'); s.setMapZoom(.9); s.cameras.main.setScroll(500, 1050); }); await settled();
  const before = await page.evaluate(() => { const s = window.__phaserGame.scene.getScene('ConquestScene'); return { x: s.cameras.main.scrollX, y: s.cameras.main.scrollY, selected: s.state.selectedLandId }; });
  await page.mouse.move(options.width * .60, options.height * .40); await page.mouse.down();
  await page.mouse.move(options.width * .43, options.height * .58, { steps: 24 }); await page.mouse.up(); await page.waitForTimeout(150);
  const after = await page.evaluate(() => { const s = window.__phaserGame.scene.getScene('ConquestScene'); return { x: s.cameras.main.scrollX, y: s.cameras.main.scrollY, selected: s.state.selectedLandId }; });
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 50, 'real DOM drag moves the map');
  assert.equal(after.selected, before.selected, 'releasing a drag cannot select a province');
  const pan = await culling(); assert.equal(pan.mismatch + pan.invalidBounds, 0, JSON.stringify(pan));
  for (const zoom of [.72, 1, 1.65]) {
   await page.evaluate(z => { const s = window.__phaserGame.scene.getScene('ConquestScene'); s.setMapZoom(z); s.cameras.main.setScroll(350, 950); }, zoom); await settled();
   const check = await culling(); assert.equal(check.mismatch + check.invalidBounds, 0, `zoom ${zoom}: ${JSON.stringify(check)}`);
  }
  const ownership = await page.evaluate(() => {
   const s = window.__phaserGame.scene.getScene('ConquestScene'); const land = s.state.lands.find(l => s.ownershipRegions.has(l.id));
   const prior = new Map(s.ownershipRegions), owner = land.ownerId;
   const player = s.state.lands.find(l => !s.ownershipWash(l.ownerId)).ownerId;
   land.ownerId = player; s.repaintOwnershipTint();
   const removed = !s.ownershipRegions.has(land.id);
   const retained = [...prior].filter(([id]) => id !== land.id).every(([id, r]) => s.ownershipRegions.get(id)?.graphics === r.graphics);
   land.ownerId = owner; s.repaintOwnershipTint();
   s.state.mapRenderMode = 'control'; s.repaintOwnershipTint(); const hidden = !s.ownershipTint.visible;
   s.state.mapRenderMode = 'terrain'; s.repaintOwnershipTint();
   const ordered = s.state.lands.filter(l => s.ownershipRegions.has(l.id)).every((l, i) => s.ownershipTint.list[i] === s.ownershipRegions.get(l.id).graphics);
   return { removed, retained, hidden, ordered, restored: s.ownershipTint.visible && s.ownershipRegions.has(land.id) };
  }); assert.ok(Object.values(ownership).every(Boolean), JSON.stringify(ownership));
  const season = await page.evaluate(async src => {
   const advanceAscentTick = window.__performanceBench ? () => window.__performanceBench.tick() : (await import('/src/systems/ascent/AscentTick.ts')).advanceAscentTick;
   const resolveAscentPrompt = window.__performanceBench ? (_state, choice) => window.__performanceBench.resolve(choice) : (await import('/src/systems/ascent/AscentResolver.ts')).resolveAscentPrompt;
   const s = window.__phaserGame.scene.getScene('ConquestScene'), from = s.state.season, first = eval(src);
   for (let i = 0; i < 5 && s.state.season === from; i++) { let n = 0; while (s.state.pendingAscentPrompt && n++ < 20) resolveAscentPrompt(s.state, first(s.state.pendingAscentPrompt)); advanceAscentTick(s.state); }
   for (const land of s.state.lands) { land.isVisible = true; land.isExplored = true; }
   s.state.isStrategyPause = true; s.refresh(); return { from, to: s.state.season };
  }, FIRST_OPTION); assert.notEqual(season.from, season.to); await settled();
  const seasonalCull = await culling(); assert.equal(seasonalCull.mismatch + seasonalCull.invalidBounds, 0, `season: ${JSON.stringify(seasonalCull)}`);
  await page.screenshot({ path: `${OUT}/${options.quality}-${options.width}-${options.language}.png` });
  await page.setViewportSize({ width: 1440, height: 900 }); await settled();
  const resized = await culling(); assert.equal(resized.mismatch + resized.invalidBounds, 0);
  assert.deepEqual(errors, []);
  results.push({ ...options, dragDistance: Math.hypot(after.x-before.x, after.y-before.y), pan, ownership, season, seasonalCull, errors });
  console.log('PASS', JSON.stringify(results.at(-1))); await page.close();
 }
} finally { await writeFile(`${OUT}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
