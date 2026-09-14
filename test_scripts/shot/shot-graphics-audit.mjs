// Graphics audit shooter: the conquest/ascent map as a player actually sees it, at several
// zooms and states, on phone and on desktop. Purely observational — nothing here changes state
// beyond revealing fog for the "what does the whole board read like" frames.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'output/graphics-audit';
mkdirSync(OUT, { recursive: true });
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';
const SEED = Number(process.argv[2] ?? 1337);

const browser = await chromium.launch();
const errors = [];

async function session({ label, viewport, dsf, mode, worldScene, steps }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dsf });
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${label}] ${String(e)}`));
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
    && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 40000 });
  await page.evaluate(([s, m]) => window.__startBenchGame(s, m, 'v1'), [SEED, mode]);
  await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), worldScene, { timeout: 40000 });
  await page.waitForTimeout(1600);
  for (const step of steps) {
    if (step.run) await page.evaluate(step.run, { key: worldScene, arg: step.arg ?? null });
    await page.waitForTimeout(step.wait ?? 900);
    await page.screenshot({ path: `${OUT}/${label}-${step.name}.png` });
    console.log(`  wrote ${label}-${step.name}.png`);
  }
  await page.close();
}

const setZoom = function ({ key, arg }) {
  const scene = window.__phaserGame.scene.getScene(key);
  const rs = window.__phaserGame.scale.width ? (window.__phaserGame.canvas.width / window.__phaserGame.scale.width) : 1;
  const cam = scene.cameras.main;
  cam.setZoom(arg * rs);
};

const reveal = function ({ key }) {
  const scene = window.__phaserGame.scene.getScene(key);
  const st = scene.state;
  st.lands.forEach((l) => { l.isVisible = true; l.isExplored = true; });
  scene.refresh?.();
};

const centreCapital = function ({ key }) {
  const scene = window.__phaserGame.scene.getScene(key);
  const st = scene.state;
  const own = st.lands.find((l) => l.ownerId === st.playerKingdomId) ?? st.lands[0];
  const node = scene.landNodes?.get?.(own.id);
  const cam = scene.cameras.main;
  if (node) cam.centerOn(node.x, node.y);
};

console.log('== ascent / conquest, phone ==');
await session({
  label: 'ascent-phone', viewport: { width: 390, height: 844 }, dsf: 2,
  mode: 'ascent', worldScene: 'ConquestScene',
  steps: [
    { name: '01-default' },
    { name: '02-revealed', run: reveal, wait: 1800 },
    { name: '03-capital', run: centreCapital },
    { name: '04-zoom-close', run: setZoom, arg: 1.8, wait: 1200 },
    { name: '05-zoom-mid', run: setZoom, arg: 1.15, wait: 1200 },
    { name: '06-zoom-far', run: setZoom, arg: 0.6, wait: 1200 },
  ],
});

console.log('== ascent / conquest, desktop ==');
await session({
  label: 'ascent-desk', viewport: { width: 1512, height: 900 }, dsf: 2,
  mode: 'ascent', worldScene: 'ConquestScene',
  steps: [
    { name: '01-default' },
    { name: '02-revealed', run: reveal, wait: 1800 },
    { name: '03-zoom-close', run: setZoom, arg: 1.8, wait: 1200 },
  ],
});

console.log('== campaign map, phone ==');
await session({
  label: 'campaign-phone', viewport: { width: 390, height: 844 }, dsf: 2,
  mode: 'campaign', worldScene: 'MapScene',
  steps: [
    { name: '01-default' },
    { name: '02-revealed', run: reveal, wait: 1800 },
    { name: '03-zoom-close', run: setZoom, arg: 1.9, wait: 1200 },
  ],
});

console.log(`console errors: ${errors.length}`);
errors.slice(0, 8).forEach((e) => console.log('  ', e));
await browser.close();
