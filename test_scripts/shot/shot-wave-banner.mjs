/**
 * Shoots the Dragon Ascent invasion proclamation in each of its four states.
 *
 * The banner is raised by the wave director, which needs a real run to reach a wave — but what
 * this script is asking is "does the paper look right", not "does the director fire". So it starts
 * a rendered ascent run, holds the clock, and plays each cue straight onto the live scene.
 *
 * Writes output/web-game/wave-banner-*.png.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/web-game';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL_BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(1200);

// The clock off, and any opening card cleared: the banner draws under the modal layer on purpose,
// so a founder prompt standing would hide the very thing being shot.
await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestScene');
  scene.state.isPaused = true;
  scene.state.pendingAscentPrompt = undefined;
  scene.state.ascentPromptQueue = [];
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane?.();
  ui.refresh();
});
await page.waitForTimeout(300);

const CUES = {
  start: {
    id: 1, phase: 'start', wave: 7, boss: false,
    kingdomName: 'Nam Hán', hosts: 3, power: 8420,
  },
  'start-boss': {
    id: 2, phase: 'start', wave: 8, boss: true,
    kingdomName: 'Đại Nguyên', hosts: 4, power: 24800,
  },
  triumph: {
    id: 3, phase: 'end', wave: 7, boss: false, kingdomName: 'Nam Hán', hosts: 3, power: 8420,
    outcome: 'triumph', hostsBroken: 3, landsLost: 0, landsHeld: 11,
    momentum: 340, survived: 7, seasons: 5,
  },
  'triumph-boss': {
    id: 4, phase: 'end', wave: 8, boss: true, kingdomName: 'Đại Nguyên', hosts: 4, power: 24800,
    outcome: 'triumph', hostsBroken: 4, landsLost: 0, landsHeld: 14,
    momentum: 1280, survived: 8, seasons: 9,
  },
  held: {
    id: 5, phase: 'end', wave: 9, boss: false, kingdomName: 'Chiêm Thành', hosts: 2, power: 11200,
    outcome: 'held', hostsBroken: 1, landsLost: 2, landsHeld: 12,
    momentum: 410, survived: 9, seasons: 7,
  },
  overrun: {
    id: 6, phase: 'end', wave: 10, boss: false, kingdomName: 'Nam Hán', hosts: 4, power: 31000,
    outcome: 'overrun', hostsBroken: 1, landsLost: 5, landsHeld: 4,
    momentum: 260, survived: 10, seasons: 11,
  },
};

/**
 * Raises a cue on the live state and lets the scene play it — the same path the wave director
 * uses, not a hand-built call into the module.
 *
 * Driving it through an in-page `import()` instead was quietly wrong: Vite serves an HMR-stamped
 * URL, so the harness got a *second* copy of the banner module bound to a second copy of the i18n
 * catalogue, and every string on the plate came back as its own key. The scene already holds the
 * one instance that matters; hand it a cue and stay out of the way.
 */
async function shoot(target, name, cue) {
  await target.evaluate((payload) => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.waveBanner?.destroy();
    ui.waveBanner = undefined;
    ui.waveCueQueue = [];
    ui.lastWaveCueId = 0;
    const scene = window.__phaserGame.scene.getScene('ConquestScene');
    scene.state.ascent.waveCues = [payload];
    ui.refresh();
  }, cue);
  // Long enough for the unroll, the seal punch and the count-up to settle, short of the hold.
  await target.waitForTimeout(1150);
  await target.screenshot({ path: `${OUT}/wave-banner-${name}.png` });
  await target.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.waveBanner?.destroy();
    ui.waveBanner = undefined;
    ui.waveCueQueue = [];
  });
  await target.waitForTimeout(120);
}

for (const [name, cue] of Object.entries(CUES)) {
  await shoot(page, name, cue);
}

// The band while an invasion is standing on the map. The countdown slot yields to a pulsing
// INVASION N · LIVE for exactly as long as hosts are on the ground, so the readout is never
// counting down to a different wave than the one being fought.
await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestScene');
  scene.state.ascent.wave = 7;
  scene.state.ascent.waveInFlight = true;
  scene.state.ascent.threat = 8420;
  window.__phaserGame.scene.getScene('ConquestUIScene').refresh();
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/wave-banner-hud-live.png`, clip: { x: 0, y: 0, width: 390, height: 200 } });

// The same two plates in Vietnamese. This is the language the titles are tightest in — "DA PHA"
// with full diacritics runs a third longer than its English, and the squeeze that keeps a title on
// one line is the thing worth looking at.
await page.close();
const viPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
viPage.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
viPage.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });
// Set before navigation: the catalogue is chosen at module scope.
await viPage.addInitScript(() => window.localStorage.setItem('mandate:language:v1', 'vi'));
await viPage.goto(`${URL_BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await viPage.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
await viPage.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await viPage.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await viPage.waitForTimeout(1200);
await viPage.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestScene');
  scene.state.isPaused = true;
  scene.state.pendingAscentPrompt = undefined;
  scene.state.ascentPromptQueue = [];
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane?.();
  ui.refresh();
});
await viPage.waitForTimeout(300);

for (const name of ['start-boss', 'triumph-boss', 'held']) {
  await shoot(viPage, `vi-${name}`, CUES[name]);
}

await browser.close();
console.log(errors.length ? `CONSOLE ERRORS:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
console.log(`wrote ${Object.keys(CUES).length + 4} shots to ${OUT}/wave-banner-*.png`);
