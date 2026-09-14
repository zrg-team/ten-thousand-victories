// The map as it looks once a realm has grown: ownership set directly rather than simulated, since
// this is a drawing audit and 20s of headless sim per step costs minutes for the same picture.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'output/graphics-audit';
mkdirSync(OUT, { recursive: true });
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 40000 });
await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 40000 });
await page.waitForTimeout(1400);

// Grow the realm and hand two rivals a bloc each, so control colour, borders and the foreign
// wash are all on screen at once — the three things a one-owner map never shows.
const shaped = await page.evaluate(() => {
  const g = window.__phaserGame;
  const scene = g.scene.getScene('ConquestScene');
  const st = scene.state;
  window.__auditState = st;
  st.pendingAscentPrompt = undefined;
  if (st.ascent) st.ascent.promptQueue = [];
  st.isPaused = true;
  const rivals = st.kingdoms.filter((k) => k.id !== 'dai-viet').map((k) => k.id);
  const seat = st.lands.find((l) => l.ownerId === 'dai-viet') ?? st.lands[0];
  const byDist = [...st.lands].sort((a, b) =>
    Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(b.x - seat.x, b.y - seat.y));
  byDist.forEach((land, i) => {
    land.isVisible = true;
    land.isExplored = true;
    if (i < 14) land.ownerId = 'dai-viet';
    else if (i < 26 && rivals[0]) land.ownerId = rivals[0];
    else if (i < 36 && rivals[1]) land.ownerId = rivals[1];
  });
  scene.refresh?.();
  return { lands: st.lands.length, mine: st.lands.filter((l) => l.ownerId === 'dai-viet').length, rivals: rivals.length };
});
console.log('shaped', JSON.stringify(shaped));
await page.waitForTimeout(2200);

const zoom = (z) => page.evaluate((v) => {
  const g = window.__phaserGame;
  const rs = g.canvas.width / g.scale.width;
  g.scene.getScene('ConquestScene').cameras.main.setZoom(v * rs);
}, z);
const shot = async (n) => { await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('  ' + n); };

await zoom(1.0); await shot('grown-01-hud');
await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')?.scene.setVisible(false));
await zoom(1.0); await shot('grown-02-nohud');
await zoom(1.9); await shot('grown-03-close');
await zoom(0.55); await shot('grown-04-wide');
await zoom(0.32); await shot('grown-05-whole');

console.log(`console errors: ${errors.length}`);
errors.slice(0, 6).forEach((e) => console.log('  ', e));
await browser.close();
