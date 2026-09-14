// The in-run advisor and the tour a first run is given, in both languages.
//
// `verify-advisor.mjs` asserts; this one is for looking at. Each shot forces one situation so the
// strip can be seen in every tone it has — son for something urgent, hoè for an opportunity, soot
// for the steady reading — plus the opened sheet and the four tour cards.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
let failures = 0;
const fail = (message) => { failures += 1; console.log(`FAIL ${message}`); };

for (const [lang, h] of [['en', 844], ['vi', 844], ['vi', 620]]) {
  const page = await browser.newPage({ viewport: { width: 390, height: h }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);

  // ── The tour a first run is given ────────────────────────────────────────
  // `?tour=1` is required: a driven browser never gets one, which is what keeps every other
  // harness here working. See `state/tour.ts`.
  await page.goto(`${BASE}/?capture=1&tour=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  const drain = async () => {
    const barUp = () => page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
      .children.list.some((c) => c.constructor?.name === 'ActionBar' && c.visible));
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
  await page.waitForTimeout(900);

  for (let step = 1; step <= 4; step += 1) {
    await page.screenshot({ path: `test_scripts/shots/runtour-${step}-${lang}-${h}.png` });
    if (step === 4) break;
    const next = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      let found = null;
      for (const child of scene.children.list) {
        const label = child.list?.find?.((k) => k.type === 'Text');
        if (label && /^(Next|Tiếp)$/.test(label.text)) {
          const m = label.getWorldTransformMatrix();
          found = { x: m.tx, y: m.ty };
        }
      }
      return found;
    });
    if (!next) { fail(`${lang} h=${h}: run-tour card ${step} has no Next`); break; }
    await page.mouse.click(next.x, next.y);
    await page.waitForTimeout(400);
  }
  // Close the last card so the strip below is not shot through the tour's veil. Pressed rather
  // than destroyed, because pressing it is what sets the scene's latch — and without that latch
  // `?tour=1` makes the tour reopen from its first card on the very next tick.
  const done = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    for (const child of scene.children.list) {
      const label = child.list?.find?.((k) => k.type === 'Text');
      if (label && /Start playing|Vào chơi/.test(label.text)) {
        child.list.find((k) => k.type === 'Rectangle')
          ?.emit('pointerup', { id: 9, downTime: 0 }, 0, 0, { stopPropagation() {} });
        return true;
      }
    }
    return false;
  });
  if (!done) fail(`${lang} h=${h}: the last run-tour card has no finish button`);
  await page.waitForTimeout(600);
  const veilGone = await page.evaluate(() => !window.__phaserGame.scene.getScene('ConquestUIScene').runTour);
  if (!veilGone) fail(`${lang} h=${h}: the run tour would not close`);

  // ── The strip, in each of its tones ──────────────────────────────────────
  const situations = [
    ['behind', `
      ascent.wave = 7; ascent.ticksToWave = 4;
      ascent.threat = 4820; ascent.defensePower = 1240; ascent.ambition = 0;
      state.resources.gold = 320;`],
    ['ambition', `
      ascent.threat = 900; ascent.defensePower = 2600; ascent.ambition = 62;
      state.resources.gold = 320;`],
    ['gold', `ascent.ambition = 10; state.resources.gold = 9400;`],
    ['steady', `
      ascent.wave = 5; ascent.ticksToWave = 8;
      ascent.threat = 1800; ascent.defensePower = 2000; ascent.ambition = 12;
      state.resources.gold = 900; state.resources.food = 1200; state.resourceRates.food = 8;
      ascent.bossTelegraphed = false;
      if (state.mandate) state.mandate.edictPoints = 0;`],
  ];
  for (const [name, source] of situations) {
    await page.evaluate((code) => {
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      // eslint-disable-next-line no-new-func
      new Function('state', 'ascent', code)(scene.state, scene.state.ascent);
      for (let tick = 0; tick < 4; tick += 1) scene.refresh();
    }, source);
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `test_scripts/shots/advisor-${name}-${lang}-${h}.png`,
      clip: { x: 0, y: 0, width: 390, height: 170 },
    });
  }

  // Opened, on the last situation set — the one with a lane button behind it.
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    // eslint-disable-next-line no-new-func
    new Function('state', 'ascent', 'ascent.threat = 4820; ascent.defensePower = 1240;')(
      scene.state, scene.state.ascent,
    );
    for (let tick = 0; tick < 4; tick += 1) scene.refresh();
    const strip = scene.children.list.find((c) => c.depth === 435);
    strip?.list.find((c) => c.type === 'Rectangle')
      ?.emit('pointerup', { id: 3, downTime: 0 }, 0, 0, { stopPropagation() {} });
  });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: `test_scripts/shots/advisor-open-${lang}-${h}.png`,
    clip: { x: 0, y: 0, width: 390, height: 300 },
  });

  if (errors.length) fail(`${lang} h=${h}: console — ${errors.slice(0, 3).join(' | ')}`);
  else console.log(`ok ${lang} h=${h}: advisor and run tour, errors none`);
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} problem(s)` : '\nall good');
process.exit(failures ? 1 : 0);
