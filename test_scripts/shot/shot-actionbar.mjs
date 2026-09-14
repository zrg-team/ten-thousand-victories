/**
 * The action bar, alone, in every shape it takes: both languages, and Dragon Ascent both with and
 * without the Battle button a live siege adds. The bar is the one strip that has to hold six or
 * seven labels across 390 units, so it is shot on its own and read at 3x.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.env.SHOT_OUT ?? 'output/shots';
mkdirSync(OUT, { recursive: true });
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5199';
const browser = await chromium.launch();

const CLEAR_PROMPTS = async (page) => page.evaluate(async () => {
  const RES = await import('/src/systems/ascent/AscentResolver.ts');
  const st = window.__phaserGame.scene.getScene('ConquestUIScene').state;
  const first = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return 'skip';
      case 'conquer-target': return 'hold';
      case 'conquer-method': return 'back';
      case 'hero-choice': return 'pass';
      case 'court-appointment': return 'reserve';
      case 'law-choice': return 'hold';
      case 'doctrine': return 'hold';
      default: return (p.options?.[0]?.id ?? p.options?.[0] ?? 'ok');
    }
  };
  let guard = 0;
  while (st.pendingAscentPrompt && guard++ < 12) {
    if (!RES.resolveAscentPrompt(st, first(st.pendingAscentPrompt))) { st.pendingAscentPrompt = undefined; break; }
  }
  window.__phaserGame.scene.getScene('ConquestUIScene').refresh();
});

for (const lang of ['en', 'vi']) {
  for (const battle of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);
    await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
    await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
    await page.waitForTimeout(900);
    await CLEAR_PROMPTS(page);
    if (battle) {
      await page.evaluate(() => {
        const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
        scene.actionBar.context = () => ({ battleLive: true });
        scene.actionBar.refresh();
      });
    }
    await page.waitForTimeout(500);
    const tag = `${lang}${battle ? '-battle' : ''}`;
    await page.screenshot({ path: `${OUT}/bar-${tag}.png`, clip: { x: 0, y: 844 - 56, width: 390, height: 56 } });
    await page.close();
  }
}
await browser.close();
console.log('done');
