// Captures every screen the player can reach, so the Đông Hồ treatment can be checked past the
// two or three screens a quick pass usually looks at. Set DEV_URL if the dev server is not on 5173.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// Dev server port. Defaults to Vite's, overridable when 5173 is taken by something else.
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const OUT = process.env.SHOT_OUT ?? 'output/ui-sweep';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

const shoot = async (name) => {
  await page.waitForTimeout(520);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  ', name);
};

const boot = async (mode) => {
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('mandate:map-theme:v1', 'dong-ho'));
  await page.evaluate((m) => window.__startBenchGame(1337, m, 'v1'), mode);
  const key = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
  await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), key, { timeout: 30000 });
  await page.waitForTimeout(2300);
};

console.log('menu');
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(1100);
await shoot('00-menu');

console.log('campaign modals');
await boot('campaign');
await shoot('10-map');
const MODALS = ['build', 'heroes', 'court', 'army', 'affairs', 'foreign-affairs', 'directives', 'event-log', 'game-menu', 'land-detail'];
for (const modal of MODALS) {
  const opened = await page.evaluate((k) => {
    const scene = window.__phaserGame.scene.getScene('UIScene');
    try {
      if (k === 'land-detail') {
        const state = window.__mandateState;
        state.selectedLandId = state.lands.find((l) => l.isVisible)?.id;
      }
      scene.openModal(k);
      return true;
    } catch { return false; }
  }, modal);
  if (!opened) { console.log('   (skipped)', modal); continue; }
  await shoot(`11-modal-${modal}`);
  await page.evaluate(() => { try { window.__phaserGame.scene.getScene('UIScene').closeModal(); } catch { /* already closed */ } });
  await page.waitForTimeout(260);
}

console.log('dragon ascent');
await boot('ascent');
await shoot('20-founder');
await page.evaluate(async () => {
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const state = window.__mandateState;
  const id = state.pendingAscentPrompt?.options?.[0]?.id ?? state.pendingAscentPrompt?.options?.[0];
  if (id) resolveAscentPrompt(state, id);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await shoot('21-appointment');

await page.evaluate(async () => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const state = window.__mandateState;
  state.pendingAscentPrompt = undefined;
  state.ascent.promptQueue = [];
  for (let i = 0; i < 120; i += 1) advanceAscentTick(state);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await shoot('22-hud');

// Each lane browser, plus the prompt kinds that carry their own layout.
for (const lane of ['war', 'court', 'realm']) {
  const ok = await page.evaluate((l) => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    try { scene.openLane?.(l); return true; } catch { return false; }
  }, lane);
  if (ok) { await shoot(`23-lane-${lane}`); await page.evaluate(() => { try { window.__phaserGame.scene.getScene('ConquestUIScene').closeOverlay?.(); } catch { /* none open */ } }); }
}

for (const [name, src] of [
  ['conquer', 'C.offerConquestPrompt(st);'],
  ['law', 'L.offerLawChoice(st);'],
  ['parliament', 'L.offerParliament(st);'],
  ['envoy', 'E.offerEnvoy(st);'],
]) {
  const ok = await page.evaluate(async (code) => {
    const state = window.__mandateState;
    state.pendingAscentPrompt = undefined;
    state.ascent.promptQueue = [];
    try {
      const C = await import('/src/systems/ascent/ConquestSystem.ts');
      const L = await import('/src/systems/ascent/CourtLaneSystem.ts');
      const E = await import('/src/systems/ascent/EnvoySystem.ts');
      const S = await import('/src/systems/ascent/AscentState.ts');
      // eslint-disable-next-line no-new-func
      new Function('st', 'C', 'L', 'E', code)(state, C, L, E);
      S.drainAscentPrompts(state);
      window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
      return true;
    } catch { return false; }
  }, src);
  if (ok) await shoot(`24-prompt-${name}`);
}

await page.evaluate(async () => {
  const state = window.__mandateState;
  const { generateHero } = await import('/src/data/heroFactory.ts');
  const { offerHeroSummon } = await import('/src/systems/ascent/SummonSystem.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  state.pendingAscentPrompt = undefined;
  state.ascent.promptQueue = [];
  // The card looks its heroes up by id in `heroDeck`, so a candidate that is not in the deck
  // renders as nothing at all. Seed the deck first, then hand the same three to the draft.
  const candidates = [generateHero(11), generateHero(23), generateHero(97)];
  for (const hero of candidates) {
    if (!state.heroDeck.some((h) => h.id === hero.id)) state.heroDeck.push(hero);
  }
  state.activeHeroDraft = candidates;
  offerHeroSummon(state);
  drainAscentPrompts(state);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
}).catch(() => {});
await shoot('25-champion-draft');

console.log(errors.length ? errors.slice(0, 10) : 'no console errors');
await browser.close();
