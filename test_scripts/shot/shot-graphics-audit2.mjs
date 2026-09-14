// Graphics audit, part 2: the Dragon Ascent conquest map with prompts cleared and time advanced,
// so what is on screen is the map a player stares at for hours, not the opening card.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'output/graphics-audit';
mkdirSync(OUT, { recursive: true });
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';
const SEED = Number(process.argv[2] ?? 1337);

const browser = await chromium.launch();
const errors = [];

async function open(viewport, dsf) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dsf });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
    && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 40000 });
  await page.evaluate((s) => window.__startBenchGame(s, 'ascent', 'v1'), SEED);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 40000 });
  await page.waitForTimeout(1200);
  return page;
}

const drainPrompts = (page) => page.evaluate(async () => {
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const st = window.__mandateState ?? window.__phaserGame.scene.getScene('ConquestScene').state;
  window.__mandateState = st;
  let guard = 0;
  while (st.pendingAscentPrompt && guard++ < 25) {
    const p = st.pendingAscentPrompt;
    const first = p.options?.[0];
    const id = typeof first === 'string' ? first : (first?.id ?? 'ok');
    try { resolveAscentPrompt(st, id); } catch { st.pendingAscentPrompt = undefined; }
  }
  st.ascent.promptQueue = [];
  window.__phaserGame.scene.getScene('ConquestUIScene')?.events.emit('state-changed');
  return guard;
});

const zoom = (page, z) => page.evaluate((v) => {
  const g = window.__phaserGame;
  const rs = g.canvas.width / g.scale.width;
  g.scene.getScene('ConquestScene').cameras.main.setZoom(v * rs);
}, z);

const shoot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  ' + name);
};

// --- phone ---
let page = await open({ width: 390, height: 844 }, 2);
console.log('drained', await drainPrompts(page));
await page.waitForTimeout(1200);
await shoot(page, 'conq-phone-01-map');
await page.evaluate(() => window.advanceTime(45000));
await drainPrompts(page);
await shoot(page, 'conq-phone-02-after-45s');
await page.evaluate(() => window.advanceTime(30000));
await drainPrompts(page);
await shoot(page, 'conq-phone-03-later');
await zoom(page, 1.8); await shoot(page, 'conq-phone-04-zoom-close');
await zoom(page, 0.55); await shoot(page, 'conq-phone-05-zoom-far');
await zoom(page, 1.0);
// open a lane so the surface a player taps into is on record
for (const lane of ['army', 'build', 'court']) {
  await page.evaluate((l) => window.__phaserGame.scene.getScene('ConquestUIScene')?.openLane?.(l), lane);
  await shoot(page, `conq-phone-lane-${lane}`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}
await page.close();

// --- tablet / desktop ---
page = await open({ width: 1024, height: 768 }, 2);
await drainPrompts(page);
await page.evaluate(() => window.advanceTime(60000));
await drainPrompts(page);
await shoot(page, 'conq-tablet-01-map');
await page.close();

console.log(`console errors: ${errors.length}`);
errors.slice(0, 8).forEach((e) => console.log('  ', e));
await browser.close();
