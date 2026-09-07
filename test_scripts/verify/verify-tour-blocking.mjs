// The tour must not outlive the page it is touring.
//
// `Copilot` dims the front page and lays a full-screen `setInteractive` rectangle at depth 900 over
// it, so everything underneath is deaf while a card is up. That is correct — it is a tour, and the
// card is the only thing you should be able to press.
//
// What was not correct: `startTour` runs from `create` and only on the front page, but `render`
// changes `mode` without going near `create`. Open Settings while the tour was up and the veil came
// with you: framing nothing, deafening everything. Tapping a map-theme option did exactly nothing,
// which is what "changing map type does not work any more" was.
//
// Settings is its own scene now, so leaving the front page shuts the menu down, tour and all. The
// second half presses a real row on the settings page — the roads setting, since the map theme is
// no longer offered — to prove the page underneath is alive.
//
// Driven with `?tour=1`, which is the only way to see any of this: `hasSeenTour` refuses to run the
// tour under `navigator.webdriver`, so every other harness in this repo is blind to it.
//
//   node test_scripts/verify/verify-tour-blocking.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1&tour=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(2400);

/** Anything interactive big enough to cover the page, in the menu's own display list. */
const blockers = () => page.evaluate(() => {
  const m = window.__phaserGame.scene.getScene('MenuScene');
  const out = [];
  const walk = (o) => {
    if (o.input && (o.width ?? 0) >= 380 && (o.height ?? 0) >= 600) {
      out.push({ type: o.type, depth: o.depth });
    }
    if (o.list) o.list.forEach(walk);
  };
  m.children.list.forEach(walk);
  return { blockers: out, touring: Boolean(m.copilot), mode: m.mode };
});

const onFront = await blockers();
check(onFront.touring, 'the tour is running', `mode ${onFront.mode}`);
check(onFront.blockers.length === 1,
  'and the front page is deaf underneath it, which is the point',
  `${onFront.blockers.length} full-screen blocker(s)`);

// Now walk away from the page the tour is about.
await page.evaluate(() => {
  window.__phaserGame.scene.getScene('MenuScene').scene.start('SettingsScene');
});
await page.waitForTimeout(1000);

const onSettings = await blockers();
check(!onSettings.touring, 'leaving the front page ends the tour', `mode ${onSettings.mode}`);
check(onSettings.blockers.length === 0,
  'and takes its blocker with it',
  `${onSettings.blockers.length} full-screen blocker(s) over Settings`);

// The thing the player was actually trying to do.
const themed = await page.evaluate(async () => {
  const L = await import('/src/game/lifeSettings.ts');
  const { t } = await import('/src/i18n/index.ts');
  const s = window.__phaserGame.scene.getScene('SettingsScene');
  const before = L.getLifeSettings().traffic;
  const want = L.TRAFFIC_DENSITIES.find((id) => id !== before);
  const wanted = t(`menu.traffic.${want}`);
  const texts = [];
  const walk = (o) => { if (o.type === 'Text') texts.push(o); if (o.list) o.list.forEach(walk); };
  s.children.list.forEach(walk);
  const label = texts.find((entry) => entry.text === wanted);
  if (!label) return { found: false, before };
  const bb = label.getBounds();
  const d = window.__phaserGame.scale.displayScale;
  return {
    found: true, before, want, text: label.text,
    x: (bb.x + bb.width / 2) / d.x, y: (bb.y + bb.height / 2) / d.y,
  };
});
check(themed.found, 'the roads row is on the settings page', themed.text ?? 'not found');

if (themed.found) {
  await page.mouse.click(themed.x, themed.y);
  await page.waitForTimeout(600);
  const after = await page.evaluate(async () => {
    const L = await import('/src/game/lifeSettings.ts');
    return { stored: L.getLifeSettings().traffic };
  });
  check(after.stored === themed.want,
    'and tapping an option actually changes the setting',
    `${themed.before} → ${after.stored} (asked for ${themed.want})`);
}

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: the tour is blocking the page under it');
