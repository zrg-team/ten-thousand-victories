// Captures the Đông Hồ art direction in the running game, so the screens can be held against the
// mock-ups in docs/phase-1/10-ink-and-shell.md. Set DEV_URL if the dev server is not on 5173.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// Dev server port. Defaults to Vite's, overridable when 5173 is taken by something else.
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const OUT = process.env.SHOT_OUT ?? 'output/dongho';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

const shoot = async (name) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
};

const boot = async (mode) => {
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate((t) => localStorage.setItem('mandate:map-theme:v1', t), 'dong-ho');
  await page.evaluate((m) => window.__startBenchGame(1337, m), mode);
  const sceneKey = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
  await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), sceneKey, { timeout: 30000 });
  await page.waitForTimeout(2400);
  return sceneKey;
};

const zoomTo = async (sceneKey, zoom) => {
  await page.evaluate(({ k, z }) => {
    const scene = window.__phaserGame.scene.getScene(k);
    if (scene?.cameras?.main) scene.cameras.main.setZoom(z);
  }, { k: sceneKey, z: zoom });
  await page.waitForTimeout(900);
};

// ── the menu, where the theme is chosen ──────────────────────────────────────
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(1000);
await shoot('00-menu');

// ── classic campaign, three zooms ────────────────────────────────────────────
let key = await boot('campaign');
for (const [name, zoom] of [['far', 0.7], ['default', 1.15], ['near', 2.1]]) {
  await zoomTo(key, zoom);
  await shoot(`01-campaign-${name}`);
}

// ── Dragon Ascent: the same terrain pipeline, plus its own HUD ───────────────
key = await boot('ascent');
await shoot('02-ascent-founder');

await page.evaluate(async () => {
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const state = window.__mandateState;
  const id = state.pendingAscentPrompt?.options?.[0]?.id ?? state.pendingAscentPrompt?.options?.[0];
  if (id) resolveAscentPrompt(state, id);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await shoot('03-ascent-appointment');

await page.evaluate(async () => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const state = window.__mandateState;
  state.pendingAscentPrompt = undefined;
  state.ascent.promptQueue = [];
  for (let index = 0; index < 90; index += 1) advanceAscentTick(state);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await page.waitForTimeout(900);
await shoot('04-ascent-hud');

for (const [name, zoom] of [['far', 0.7], ['near', 2.1]]) {
  await zoomTo(key, zoom);
  await shoot(`05-ascent-map-${name}`);
}

// ── champion draft: the shipped portraits on the new ground ─────────────────
await page.evaluate(async () => {
  const state = window.__mandateState;
  const { generateHero } = await import('/src/data/heroFactory.ts');
  state.activeHeroDraft = { candidates: [generateHero(11), generateHero(23), generateHero(97)], costGold: 40 };
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
}).catch(() => {});
await shoot('06-champion-draft');

console.log(errors.length ? errors.slice(0, 10) : 'no console errors');
await browser.close();
