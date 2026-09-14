// Completed improvements must share the terrain order, including after baking and rebuilding.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = process.env.DEPTH_OUT ?? 'output/structure-depth';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
const tiers = (process.env.DEPTH_TIERS ?? 'medium,low,high').split(',');
try {
  for (const tier of tiers) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(t => {
      localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
      localStorage.setItem('mandate:graphics:v1', t);
    }, tier);
    await page.goto(`${URL}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await page.evaluate(() => window.__startBenchGame(20260901, 'ascent', 'v1'));
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestScene'), null, { timeout: 30000 });
    await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('ConquestScene');
      s.state.isPaused = true;
      s.ascentAccumulator = -1e9;
      const types = ['farm', 'mine', 'market', 'tower', 'barracks', 'communalHall',
        'harbor', 'workshop', 'guild', 'university', 'wall'];
      for (const land of s.state.lands) {
        land.isVisible = true;
        land.isExplored = true;
        if (land.hasVillage) land.buildings = types.map(type => ({ type, level: 1 }));
      }
      s.refresh();
    });
    const audit = async () => page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('ConquestScene');
      const all = root => [root, ...(root.list ?? []).flatMap(all)];
      // Independently measure alpha rather than reusing stampFootY.
      const feet = new Map();
      const foot = o => {
        const f = o.frame;
        const key = `${o.texture.key}:${f.name}`;
        if (!feet.has(key)) {
          const c = document.createElement('canvas'); c.width = c.height = 128;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, 128, 128);
          const { data } = ctx.getImageData(0, 0, 128, 128);
          let bottom = 1;
          for (let y = 127; y >= 0; y--) {
            if (Array.from({ length: 128 }, (_, x) => data[(y * 128 + x) * 4 + 3]).some(a => a > 16)) {
              bottom = (y + 1) / 128; break;
            }
          }
          feet.set(key, bottom);
        }
        return o.y + (feet.get(key) - o.originY) * o.displayHeight;
      };
      const structures = s.children.list.flatMap(all).filter(o => o.texture &&
        (o.getData('conquestSettlementArt') || ['satellite', 'enclosure'].includes(o.getData('conquestStructureRole'))));
      const escaped = structures.filter(o => o.parentContainer || o.getData('conquestGroundOrder') !== 'settlement');
      const drift = structures.filter(o => !o.parentContainer)
        .map(o => Math.abs(foot(o) - (o.depth - 1.02) / 0.00014));
      const rocks = s.children.list.filter(o => o.getData('conquestReliefArt'));
      let overlapPairs = 0, inversions = 0;
      for (const a of structures) for (const b of rocks) {
        if (a.parentContainer) continue;
        const r = a.getBounds(), q = b.getBounds();
        if (r.left >= q.right || r.right <= q.left || r.top >= q.bottom || r.bottom <= q.top) continue;
        if (Math.abs(foot(a) - foot(b)) < 0.01) continue;
        overlapPairs++;
        if (Math.sign(a.depth - b.depth) !== Math.sign(foot(a) - foot(b))) inversions++;
      }
      const surfaces = [...s.landInk.values()].flat().filter(o => o.getData('conquestGroundSurface'));
      const groundAbove = surfaces.filter(o => o.depth >= 1.015 || o.visible).length;
      return { structures: structures.length, satellites: structures.filter(o => o.getData('conquestStructureRole') === 'satellite').length,
        enclosures: structures.filter(o => o.getData('conquestStructureRole') === 'enclosure').length,
        escaped: escaped.length, drift: Math.max(0, ...drift), overlapPairs, inversions,
        surfaces: surfaces.length, groundAbove, hidden: structures.filter(o => !o.visible).length };
    });
    const initial = await audit();
    await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('ConquestScene');
      s.scene.get('ConquestUIScene').scene.setVisible(false);
      s.overlays.fogBakeRT?.setVisible(false);
      const structures = [...s.landInk.values()].flat().filter(o => o.getData('conquestStructureRole') === 'satellite');
      const rocks = s.children.list.filter(o => o.getData('conquestReliefArt'));
      // Focus the real overlap that was invisible to the old core-only audit.
      const house = structures.find(a => rocks.some(b => {
        const r = a.getBounds(), q = b.getBounds();
        return a.depth < b.depth && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top;
      })) ?? structures[0];
      s.setMapZoom(3.2);
      s.cameras.main.setScroll(house.x - 390 / 6.4, house.y - 10 - 844 / 6.4);
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${tier}.png` });
    writeFileSync(`${OUT}/${tier}-state.json`, await page.evaluate(() => window.render_game_to_text()));
    const culling = await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('ConquestScene');
      const camera = s.cameras.main;
      const home = { x: camera.scrollX, y: camera.scrollY, zoom: s.mapZoom };
      const houses = [...s.landInk.values()].flat().filter(o => o.getData('conquestStructureRole') === 'satellite'
        && s.keepsGroundInkLive(o));
      let checks = 0, missing = 0;
      for (const zoom of [0.8, 1.65, 3.2]) {
        s.setMapZoom(zoom);
        for (const house of houses) {
          // Bring the house to the side of the viewport, not just its province's centre.
          camera.setScroll(house.x - 8 / zoom, house.y - 422 / zoom);
          s.syncViewCulling(true);
          checks++;
          if (!house.visible) missing++;
        }
      }
      s.setMapZoom(home.zoom); camera.setScroll(home.x, home.y); s.syncViewCulling(true);
      return { checks, missing };
    });
    const lifecycle = await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('ConquestScene');
      const land = s.state.lands.find(l => l.hasVillage);
      const old = [...s.landInk.get(land.id)];
      const building = land.buildings.pop();
      s.refresh();
      const destroyed = old.every(o => !o.scene);
      land.buildings.push(building); s.refresh();
      return { destroyed };
    });
    await page.evaluate(() => {
      const s = window.__phaserGame.scene.getScene('ConquestScene');
      s.state.season = 'Winter';
      s.rebakeScenery();
      s.bakeStaticTerrain();
    });
    const rebuilt = await audit();
    const pass = [initial, rebuilt].every(a => a.satellites >= 100 && a.enclosures > 0 && a.escaped === 0
      && a.drift < 0.01 && a.overlapPairs > 0 && a.inversions === 0 && a.surfaces > 0 && a.groundAbove === 0)
      && initial.structures === rebuilt.structures && culling.missing === 0 && lifecycle.destroyed && errors.length === 0;
    results.push({ tier, pass, initial, rebuilt, culling, lifecycle, errors });
    console.log(JSON.stringify(results.at(-1)));
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/audit.json`, JSON.stringify(results, null, 2));
if (results.some(r => !r.pass)) process.exitCode = 1;
