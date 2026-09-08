// Exercise the actual Conquest road/settlement population and distance-driven walk sprites.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5180';
const OUT = process.env.OUT ?? 'output/traveler-variants/runtime';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
  localStorage.setItem('mandate:graphics:v1', 'medium');
  localStorage.setItem('mandate:life:v1', JSON.stringify({ birds: true, traffic: 'busy', seasons: true }));
});

try {
  await page.goto(`${URL}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate(() => window.__startBenchGame(20260906, 'ascent'));
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  // Reveal uses the yielding preparation queue. Inspect population after it is
  // current, rather than racing the first incomplete settlement generation.
  await page.evaluate(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isPaused=true;s.ascentAccumulator=-1e9;for(const l of s.state.lands){l.isVisible=true;l.isExplored=true;}s.refresh();});
  await page.waitForFunction(()=>{const p=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending;},null,{timeout:180000});
  const audit = await page.evaluate(async () => {
    const s = window.__phaserGame.scene.getScene('ConquestScene');
    s.state.isPaused = true; s.ascentAccumulator = -1e9;
    s.state.lands.forEach(l => { l.isVisible = true; l.isExplored = true; });
    s.refresh(); s.traffic.setPaused(true);
    const snapshot = () => Object.fromEntries([...s.traffic.travelerMarkers].map(([key, movers]) => [key,
      movers.map(m => m.object.getData('conquestTravelerStyle'))]));
    const before = snapshot();
    const instances = [...s.traffic.travelerMarkers.values()].flat().map(m => m.object);
    s.refresh();
    const after = snapshot();
    const allChildren = root => [root, ...(root.list ?? []).flatMap(allChildren)];
    const settlementStyles = s.children.list.flatMap(allChildren)
      .filter(c => c.getData?.('conquestLivingPerson') && c.getData('conquestTravelerStyle'))
      .map(c => c.getData('conquestTravelerStyle'));
    const { CONQUEST_TRAVELER_STYLES, conquestTravelerArtId } = await import('/src/ui/conquestTravelerStyles.ts');
    const { inkExtent } = await import('/src/ui/conquestMapArt.ts');
    const { NATURAL_MOTION_KEY, WALK_FRAME_KEY, addNaturalTravelMotion,
      advanceNaturalTravelMotion, setNaturalTravelMotionActive, faceTravel } = await import('/src/ui/ink/life.ts');
    const walks = [];
    // Every style through the same public factory used by real road traffic.
    for (let index = 0; index < CONQUEST_TRAVELER_STYLES.length; index++) {
      const container = s.mapItems.createTraveler(17, index).setPosition(-1000, -1000);
      const sprite = container.list[0];
      addNaturalTravelMotion(s, container, 'person', index);
      setNaturalTravelMotionActive(container, true);
      const frames = sprite.getData(WALK_FRAME_KEY);
      const motion = container.getData(NATURAL_MOTION_KEY);
      const seen = new Set([Number(sprite.frame.name)]);
      const heights = [];
      const origins = [];
      for (let step = 0; step < 4; step++) {
        advanceNaturalTravelMotion(container, frames.stride + .001);
        seen.add(Number(sprite.frame.name));
        heights.push(sprite.displayHeight * inkExtent(s, sprite.texture.key, sprite.frame.name).y);
        origins.push(sprite.displayOriginY);
      }
      const lastFrame = sprite.frame.name;
      setNaturalTravelMotionActive(container, false);
      advanceNaturalTravelMotion(container, frames.stride * 2);
      const pausedFrame = sprite.frame.name;
      faceTravel(container, -1); const left = container.scaleX;
      faceTravel(container, 1); const right = container.scaleX;
      walks.push({ style: container.getData('conquestTravelerStyle'), texture: sprite.texture.key,
        frames: [...seen], heights, origins, bob: motion.bob, left, right,
        holdsPoseOnPause: lastFrame === pausedFrame });
      container.destroy();
    }
    // Move one actual road traveller through its real tween; verify pause/cull lifecycle.
    const [road, movers] = [...s.traffic.travelerMarkers][0];
    const mover = movers[0]; const id = `walk::${road}::0`;
    const initial = { x: mover.object.x, y: mover.object.y };
    s.traffic.setPaused(false); s.traffic.setCulled(id, false);
    mover.tween.seek(3000, 16, true);
    const moved = Math.hypot(mover.object.x - initial.x, mover.object.y - initial.y) > .1;
    s.traffic.setPaused(true); const paused = mover.tween.isPaused();
    s.traffic.setCulled(id, true); s.traffic.setPaused(false);
    const culledStaysPaused = mover.tween.isPaused();
    s.traffic.setCulled(id, false); const resumed = !mover.tween.isPaused();
    s.traffic.setPaused(true);
    const seedChoices = Array.from({ length: 200 }, (_, seed) => conquestTravelerArtId(seed));
    window.__travelerAudit = { before, after, walks, settlementStyles, seedChoices,
      reused: instances.every(c => c.active), moved, paused, culledStaysPaused, resumed };
    return window.__travelerAudit;
  });
  const styles = new Set(Object.values(audit.before).flat());
  writeFileSync(`${OUT}/audit-in-progress.json`, JSON.stringify(audit, null, 2) + '\n');
  assert.equal(styles.size, 6, 'all six looks occur on the map');
  assert.ok(Object.values(audit.before).every(a => a.length === 3 && new Set(a).size === 3), 'busy roads have three different looks');
  assert.deepEqual(audit.before, audit.after, 'refresh preserves appearances');
  assert.ok(audit.reused, 'refresh preserves existing traveller objects');
  assert.ok(new Set(audit.settlementStyles).size >= 4, 'settlement wanderers use varied styles');
  assert.equal(new Set(audit.seedChoices).size, 6, 'different seeds select all looks');
  for (const w of audit.walks) {
    assert.ok(w.texture.startsWith(`conquest-art:${w.style}-walk`), `${w.style}: matching sheet`);
    assert.equal(w.frames.length, 4, `${w.style}: four distance-driven poses`);
    assert.ok(w.holdsPoseOnPause && w.bob === 0, `${w.style}: no pause drift or extra bob`);
    assert.ok(w.left < 0 && w.right > 0, `${w.style}: both travel directions`);
    assert.ok(Math.max(...w.heights) / Math.min(...w.heights) < 1.08, `${w.style}: stable body height`);
    assert.equal(new Set(w.origins).size, 1, `${w.style}: grounded baseline`);
  }
  const firstHeights = audit.walks.map(w => w.heights[0]);
  assert.ok(Math.max(...firstHeights) / Math.min(...firstHeights) < 1.08, 'styles share the original human scale');
  assert.ok(audit.moved && audit.paused && audit.culledStaysPaused && audit.resumed,
    `real road motion/pause/cull/resume: ${JSON.stringify({ moved: audit.moved, paused: audit.paused, culled: audit.culledStaysPaused, resumed: audit.resumed })}`);

  // Capture actual populated roads at overview and close map scales; no staged replacement sprites.
  for (const zoom of [1.2, 2.4]) {
    await page.evaluate(zoom => {
      const s = window.__phaserGame.scene.getScene('ConquestScene');
      window.__phaserGame.scene.getScene('ConquestUIScene').scene.setVisible(false);
      const home = s.state.lands.find(l => l.ownerId === 'dai-viet' && l.type === 'castle')
        ?? s.state.lands.find(l => l.ownerId === 'dai-viet');
      const at = s.getSettlementAnchor(home); s.setMapZoom(zoom);
      const cam = s.cameras.main, scale = cam.zoom / zoom;
      cam.removeBounds(); cam.scrollX = s.wx(at.x) - 390 / (2 * zoom);
      cam.scrollY = s.wy(at.y) - cam.height / scale / (2 * zoom);
    }, zoom);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/conquest-${zoom}.png` });
  }
  const fallback = await page.evaluate(async () => {
    const s = window.__phaserGame.scene.getScene('ConquestScene');
    const { conquestTravelerArtId } = await import('/src/ui/conquestTravelerStyles.ts');
    const art = conquestTravelerArtId(17, 0);
    s.textures.remove(`conquest-art:${art}-walk`);
    const a = s.mapItems.createTraveler(17, 0); const still = a.list[0].texture.key, frame = a.list[0].frame.name; a.destroy();
    if(s.textures.exists(`conquest-art:${art}`))s.textures.remove(`conquest-art:${art}`);
    // Authored stills now share an atlas. Simulate only this frame being absent;
    // destroying the shared texture would invalidate every live traveller.
    const atlas=s.textures.get(still),has=atlas.has;
    if(still.startsWith('conquest-atlas:'))atlas.has=function(name){return name===frame?false:has.call(this,name);};
    let original;
    try{const b = s.mapItems.createTraveler(17, 0); original = b.list[0].texture.key; b.destroy();}
    finally{atlas.has=has;}
    return { art, still, frame, original };
  });
  assert.ok(fallback.still===`conquest-art:${fallback.art}`||fallback.frame===`conquest-art:${fallback.art}`, 'missing walk sheet falls back to matching still or its atlas frame');
  assert.ok(fallback.original.startsWith('conquest-art:life.traveler-walk'), 'missing new art falls back to original traveller');
  assert.deepEqual(errors, []);
  writeFileSync(`${OUT}/audit.json`, JSON.stringify({ ...audit, fallback, errors,
    gameState: JSON.parse(await page.evaluate(() => window.render_game_to_text())) }, null, 2) + '\n');
  console.log(`PASS: ${Object.keys(audit.before).length} roads, six styles, settlement variety, animation, scale, refresh, pause/cull/resume and missing-art fallbacks; no browser errors.`);
} finally { await browser.close(); }
