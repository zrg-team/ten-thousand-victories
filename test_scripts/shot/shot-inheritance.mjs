// The next-reign chip, for looking at: shut, open, mid-punch, under the paused badge, and above
// an inspect card — in both languages and at both ends of the height clamp.
//
// `verify-inheritance.mjs` asserts; this one writes PNGs to output/inherit/.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173';
mkdirSync('output/inherit', { recursive: true });

const browser = await chromium.launch();
let failures = 0;
const fail = (message) => { failures += 1; console.log(`FAIL ${message}`); };

for (const [lang, h] of [['en', 844], ['vi', 620]]) {
  const page = await browser.newPage({ viewport: { width: 390, height: h }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log(`  nav → ${f.url()}`); });
  await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  const barUp = () => page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
    .children.list.some((c) => c.constructor?.name === 'ActionBar' && c.visible));
  const drain = async () => {
    for (let guard = 0; guard < 24 && !(await barUp()); guard += 1) {
      await page.evaluate(() => {
        const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
        if (!scene.openPromptKey) return;
        scene.events.emit('ui:ascent-choice', String(scene.openPromptKey).split(',').pop() || 'ok');
      });
      await page.waitForTimeout(500);
    }
    return barUp();
  };
  if (!(await drain())) fail(`${lang} h=${h}: the run never reached a playable frame`);

  // A reign with something to say: a few waves held, a card taken, a champion called.
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const ascent = scene.state.ascent;
    ascent.wavesSurvived = 7; ascent.peakPower = 9000; ascent.heroesSummoned = 2;
    ascent.cardStacks = { 'iron-levy': 1 };
    scene.refresh();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `output/inherit/chip-${lang}-${h}.png` });

  // Opened.
  const chip = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const b = scene.inheritance.tapBounds()[0];
    return b ? { x: b.x + b.width / 2, y: b.y + b.height - 20 } : null;
  });
  if (!chip) fail(`${lang} h=${h}: the chip published no tap bounds`);
  else {
    await page.mouse.click(chip.x, chip.y);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `output/inherit/sheet-${lang}-${h}.png` });
    await page.mouse.click(chip.x, chip.y);
    await page.waitForTimeout(300);
  }

  // Mid-punch: a rubbing lands.
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.state.ascent.rubbingsEarned = (scene.state.ascent.rubbingsEarned ?? 0) + 1;
    scene.refresh();
  });
  await page.waitForTimeout(260);
  await page.screenshot({ path: `output/inherit/punch-${lang}-${h}.png` });
  await page.waitForTimeout(1500);

  // Paused: the badge stands above the chip.
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.state.isStrategyPause = true;
    scene.refresh();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `output/inherit/paused-${lang}-${h}.png` });

  // A province selected: the chip floats above the inspect card.
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.state.isStrategyPause = false;
    scene.state.selectedLandId = scene.state.ascent.capitalLandId;
    scene.refresh();
    scene.refresh();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `output/inherit/inspect-${lang}-${h}.png` });

  if (errors.length > 0) fail(`${lang} h=${h}: console errors — ${errors.slice(0, 2).join(' | ')}`);
  await page.close();
}

await browser.close();
console.log(failures === 0 ? 'PASS: shots written to output/inherit/' : `FAIL: ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
