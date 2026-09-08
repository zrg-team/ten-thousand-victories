/** River motion, exact clipping, real pointer registration and surface lifetime. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5187';
const directory = 'output/menu-water';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const results = [];
const failures = [];

function installProbe() {
  window.__waterProbe = () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('MenuScene');
    const art = scene.children.list.find((item) => item.getData?.('menuLandscapeRole') === 'illustration');
    const fx = art?.list.find((item) => item.getData?.('menuArtworkLayer') === 'river-fx');
    const surface = fx?.list.find((item) => item.getData?.('menuWaterSurface') === 'refracted-painted-river');
    if (!surface) throw Error('Missing animated river surface');
    const canvas = surface.texture.getSourceImage();
    const mask = surface.getData('menuWaterMask');
    const pixels = () => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const frame = () => Number(surface.getData('menuWaterFrameCount') ?? surface.getData('menuWaterFrame') ?? 0);
    const ripples = () => {
      const value = surface.getData('menuWaterRipples');
      return Array.isArray(value) ? value.length : Number(value ?? 0);
    };
    const toScreen = (world) => {
      const screen = scene.cameras.main.matrixCombined.transformPoint(world.x, world.y);
      const rect = game.canvas.getBoundingClientRect();
      return {
        x: rect.left + screen.x * rect.width / game.scale.gameSize.width,
        y: rect.top + screen.y * rect.height / game.scale.gameSize.height,
      };
    };
    const at = (u, v) => {
      const source = surface.getData('menuWaterSourceSize');
      const ratio = canvas.width / source.width;
      const cropTop = surface.getData('menuWaterCropTop');
      const world = surface.getWorldTransformMatrix().transformPoint(
        u * source.width * ratio - surface.originX * surface.width,
        (v * source.height - cropTop) * ratio - surface.originY * surface.height,
      );
      return toScreen(world);
    };
    const descendants = (list) => list.flatMap((item) => [item, ...descendants(item.list ?? [])]);
    const textAt = (label) => {
      const object = descendants(scene.children.list).find((item) => item.text === label && item.visible);
      if (!object) throw Error(`Missing menu control: ${label}`);
      return toScreen(object.getWorldTransformMatrix().transformPoint(
        (0.5 - object.originX) * object.width, (0.5 - object.originY) * object.height,
      ));
    };
    return { game, scene, art, fx, surface, canvas, mask, pixels, frame, ripples, at, textAt, descendants };
  };
}

const waitForSurface = (page) => page.waitForFunction(() => {
  const scene = window.__phaserGame?.scene.getScene('MenuScene');
  if (!scene?.sys.isActive()) return false;
  const art = scene.children.list.find((item) => item.getData?.('menuLandscapeRole') === 'illustration');
  return art?.list.find((item) => item.getData?.('menuArtworkLayer') === 'river-fx')?.list
    .some((item) => item.getData?.('menuWaterSurface') === 'refracted-painted-river');
}, null, { timeout: 40000 });

for (const quality of ['low', 'high']) {
  for (const [width, height] of [[390, 844], [390, 620], [1440, 900]]) {
    const name = `${quality}-${width}x${height}`;
    if (process.env.CASE && !name.includes(process.env.CASE)) continue;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width > 1000 ? 1 : 2 });
    // Other workspace tasks can trigger Vite reloads during these temporal checks.
    await page.routeWebSocket(/.*/, client => {
      const server = client.connectToServer();
      server.onMessage(message => {
        if (typeof message === 'string' && /"type":"(?:update|full-reload)"/.test(message)) return;
        client.send(message);
      });
    });
    const errors = [];
    const checks = [];
    const check = (label, passed, detail) => {
      checks.push({ label, passed, detail });
      if (!passed) throw Error(`${label}: ${JSON.stringify(detail)}`);
    };
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.addInitScript((q) => {
        localStorage.setItem('mandate:graphics:v1', q);
        localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
        localStorage.setItem('mandate:language:v1', 'en');
        localStorage.setItem('mandate:tour:v1', 'seen');
        localStorage.removeItem('mandate:graphics:rung:v1');
      }, quality);
      await page.goto(`${BASE}/?capture=1&noladder=1${width > 1000 ? '&layout=desktop' : ''}`, { waitUntil: 'domcontentloaded' });
      await waitForSurface(page);
      await page.evaluate(installProbe);
      await page.waitForTimeout(1100);

      const clipping = await page.evaluate(() => {
        const p = window.__waterProbe();
        const source = p.pixels();
        const mask = p.mask.getContext('2d').getImageData(0, 0, p.mask.width, p.mask.height).data;
        if (p.canvas.width !== p.mask.width || p.canvas.height !== p.mask.height) throw Error('Mask and river resolution differ');
        let escaped = 0;
        let visible = 0;
        for (let i = 3; i < source.length; i += 4) {
          if (source[i] > 0) visible += 1;
          if (mask[i] === 0 && source[i] !== 0) escaped += 1;
        }
        // Independently selected from the authored ground plate, not from the generated mask.
        const dry = [[1000, 560], [1350, 700], [600, 860], [200, 500], [790, 430]];
        const plants = [[340, 655], [430, 880], [650, 895]];
        const alphaAt = ([x, y]) => {
          const px = Math.min(p.canvas.width - 1, Math.floor(x / 1536 * p.canvas.width));
          const py = Math.floor((y - p.surface.getData('menuWaterCropTop')) / 1536 * p.canvas.width);
          if (py < 0 || py >= p.canvas.height) return 0;
          return source[(py * p.canvas.width + px) * 4 + 3];
        };
        window.__waterBaseline = new Uint8ClampedArray(source);
        window.__waterStartFrame = p.frame();
        window.__waterStaticLayers = p.art.list.filter((item) => ['ground', 'mountains', 'bamboo', 'lotus'].includes(item.getData?.('menuArtworkLayer')))
          .map((item) => [item.getData('menuArtworkLayer'), item.x, item.y, item.rotation, item.scaleX, item.scaleY]);
        const ground = p.art.list.find((item) => item.getData?.('menuArtworkLayer') === 'ground');
        const sourceSize = ground.getData('sourceSize');
        return {
          escaped, visible, dryAlpha: dry.map(alphaAt), plantAlpha: plants.map(alphaAt),
          width: p.canvas.width, height: p.canvas.height, texture: p.surface.texture.key,
          touchIsArtChild: p.art.list.some((item) => item.getData?.('menuLandscapeInteraction') === 'river-ripple'),
          mistChildren: p.art.list.find((item) => item.getData?.('menuArtworkLayer') === 'mountain-mist')?.list.length ?? 0,
          leaves: p.descendants(p.scene.children.list).filter((item) => item.getData?.('menuLeaf')).length,
          aspectError: Math.abs(ground.displayWidth / ground.displayHeight - sourceSize.width / sourceSize.height),
          registeredLayers: window.__waterStaticLayers.map(([name]) => name),
          waterBelowForeground: ['bamboo', 'lotus'].every((name) => p.art.list.indexOf(p.fx)
            < p.art.list.findIndex((item) => item.getData?.('menuArtworkLayer') === name)),
        };
      });
      check('All surface pixels stay within the river mask', clipping.escaped === 0 && clipping.visible > 100, clipping);
      check('Authored bank, field and mountain points have no animated pixels', clipping.dryAlpha.every((alpha) => alpha === 0), clipping.dryAlpha);
      check('Foreground flowers and leaves have no animated pixels', clipping.plantAlpha.every((alpha) => alpha === 0), clipping.plantAlpha);
      check('Pointer region inherits the artwork transform', clipping.touchIsArtChild, clipping.touchIsArtChild);
      check('Original cloud effect is preserved', clipping.mistChildren === 5, clipping.mistChildren);
      check('Existing drifting leaves are preserved', clipping.leaves >= 3, clipping.leaves);
      check('Registered artwork keeps its aspect and foreground ordering', clipping.aspectError < 1e-6
        && clipping.registeredLayers.length === 4 && clipping.waterBelowForeground, clipping);
      check('Texture resolution matches device and quality', clipping.width === (quality === 'low' ? 512 : width > 1000 ? 1024 : 768), clipping.width);
      await page.screenshot({ path: `${directory}/${name}-before.png` });
      await page.waitForTimeout(1400);
      const motion = await page.evaluate(() => {
        const p = window.__waterProbe();
        const now = p.pixels();
        const before = window.__waterBaseline;
        let changed = 0;
        let change = 0;
        for (let i = 0; i < now.length; i += 4) {
          const delta = Math.abs(now[i] - before[i]) + Math.abs(now[i + 1] - before[i + 1]) + Math.abs(now[i + 2] - before[i + 2]);
          if (delta > 3) changed += 1;
          change += delta;
        }
        const staticLayers = p.art.list.filter((item) => ['ground', 'mountains', 'bamboo', 'lotus'].includes(item.getData?.('menuArtworkLayer')))
          .map((item) => [item.getData('menuArtworkLayer'), item.x, item.y, item.rotation, item.scaleX, item.scaleY]);
        return {
          changed, change, frames: p.frame() - window.__waterStartFrame,
          landUnchanged: JSON.stringify(staticLayers) === JSON.stringify(window.__waterStaticLayers),
        };
      });
      check('River image changes continuously over time', motion.changed > 100 && motion.frames > 1, motion);
      check('Existing plant and mountain motion is preserved', !motion.landUnchanged, motion);
      const restored = await page.evaluate(() => {
        const p = window.__waterProbe();
        const effects = p.fx.list.find(o => o.getData('menuWaterEffects'));
        return {
          currents: effects.list.filter(o => o.getData('menuAmbient') === 'river-current').length,
          pulses: effects.list.filter(o => o.getData('menuAmbient') === 'river-pulse').length,
          motes: effects.list.filter(o => o.getData('menuAmbient') === 'river-flow-mote').length,
          idleWaves: p.scene.lotusIdleWaveLog.length,
        };
      });
      check('Bubble-like oval highlights and flecks are absent', restored.currents === 0 && restored.motes === 0, restored);
      check('Wave rings and lotus swells remain', restored.pulses >= 5 && restored.idleWaves > 0, restored);
      await page.screenshot({ path: `${directory}/${name}-after.png` });

      const targets = await page.evaluate(() => {
        const p = window.__waterProbe();
        return {
          water: p.at(0.13, 0.58), land: p.at(0.58, 0.57), plant: p.at(340 / 1536, 655 / 1024),
        };
      });
      for (const kind of ['land', 'plant', 'water']) {
        const target = targets[kind];
        check(`${kind} pointer target is on screen`, target.x > 0 && target.x < width && target.y > 0 && target.y < height, target);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(1250);
        const before = await page.evaluate(() => window.__waterProbe().ripples());
        await page.mouse.click(target.x, target.y);
        await page.waitForTimeout(70);
        const after = await page.evaluate(() => window.__waterProbe().ripples());
        check(`Real pointer ${kind === 'land' ? 'ignores dry land' : `activates ${kind} interaction`}`,
          kind === 'land' ? after <= before : after > before, { target, before, after });
      }
      await page.screenshot({ path: `${directory}/${name}-touch.png` });
      await page.mouse.move(targets.water.x, targets.water.y);
      await page.mouse.down();
      await page.mouse.move(targets.water.x - 10, targets.water.y, { steps: 7 });
      await page.waitForTimeout(120);
      const dragWakes = await page.evaluate(() => window.__waterProbe().fx.list
        .find(o => o.getData('menuWaterEffects')).list.filter(o => o.getData('menuWakeSource') === 'river').length);
      await page.mouse.up();
      check('Dragging through the river preserves flowing wake feedback', dragWakes > 0, dragWakes);

      const hiddenStart = await page.evaluate(() => {
        const p = window.__waterProbe();
        p.art.setVisible(false);
        return p.frame();
      });
      await page.waitForTimeout(650);
      const hiddenEnd = await page.evaluate(() => {
        const p = window.__waterProbe();
        const frame = p.frame();
        p.art.setVisible(true);
        return frame;
      });
      check('Hidden landscape stops texture uploads', hiddenStart === hiddenEnd, { hiddenStart, hiddenEnd });

      const classicTarget = await page.evaluate(() => window.__waterProbe().textAt('Classic Modes'));
      await page.mouse.click(classicTarget.x, classicTarget.y);
      await page.waitForFunction(() => window.__phaserGame.scene.getScene('MenuScene').mode === 'classic');
      check('Classic Modes remains reachable with the water hit region', await page.evaluate(() => !window.__waterProbe().art.visible), classicTarget);
      await page.waitForTimeout(400);
      const backTarget = await page.evaluate(() => window.__waterProbe().textAt('‹ Back'));
      await page.mouse.click(backTarget.x, backTarget.y);
      await page.waitForFunction(() => window.__phaserGame.scene.getScene('MenuScene').mode === 'main');
      check('Back restores the animated landscape', await page.evaluate(() => window.__waterProbe().art.visible), backTarget);

      const lifetime = [];
      for (let iteration = 0; iteration < 3; iteration += 1) {
        const old = await page.evaluate(() => {
          const p = window.__waterProbe();
          const snapshot = { texture: p.surface.texture.key, textures: p.game.textures.getTextureKeys().length, updates: p.scene.events.listenerCount('update') };
          p.scene.scene.stop();
          return snapshot;
        });
        await page.waitForFunction(() => !window.__phaserGame.scene.isActive('MenuScene'));
        const removed = await page.evaluate((key) => !window.__phaserGame.textures.exists(key), old.texture);
        check('Shutdown removes the river texture', removed, old);
        await page.evaluate(() => window.__phaserGame.scene.start('MenuScene'));
        await waitForSurface(page);
        await page.waitForTimeout(120);
        const next = await page.evaluate(() => {
          const p = window.__waterProbe();
          return { textures: p.game.textures.getTextureKeys().length, updates: p.scene.events.listenerCount('update'),
            surfaces: p.fx.list.filter(o => o.getData('menuWaterSurface')).length };
        });
        check('Restart retains one surface and no update-listener growth', next.updates <= old.updates && next.textures <= old.textures && next.surfaces === 1, { old, next });
        lifetime.push({ old, next });
      }
      check('No browser errors', errors.length === 0, errors);
      results.push({ name, clipping, motion, targets, lifetime, checks, errors });
      console.log(`PASS ${name}: ${motion.changed} water pixels changed; ${clipping.escaped} escaped pixels`);
    } catch (error) {
      failures.push({ name, error: String(error), checks, errors });
      await page.screenshot({ path: `${directory}/${name}-failure.png` }).catch(() => {});
      console.log(`FAIL ${name}: ${error}`);
    } finally {
      await page.close();
    }
  }
}
await browser.close();
await writeFile(`${directory}/results.json`, JSON.stringify({ results, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
