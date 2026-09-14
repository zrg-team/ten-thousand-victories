// Captures every restored core-system screen in Dragon Ascent: the province/method conquest
// pair, the appointment card, the law decree, the parliament petition, the envoy, and the
// three lane browsers. Run against a dev server on 5173.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('output/web-game', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });

await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

const shoot = async (name) => {
  await page.waitForTimeout(320);
  await page.screenshot({ path: `output/web-game/core-${name}.png` });
};

// Answer the founder + its appointment so the run is under way.
const resolve = (choice) => page.evaluate(async (c) => {
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const st = window.__mandateState;
  const id = c === '#first'
    ? (st.pendingAscentPrompt.options?.[0]?.id ?? st.pendingAscentPrompt.options?.[0])
    : c;
  resolveAscentPrompt(st, id);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
}, choice);

const kind = () => page.evaluate(() => window.__mandateState.pendingAscentPrompt?.kind ?? null);

await shoot('01-founder');
await resolve('#first');                 // pick a founder
await shoot('02-appointment');           // chained appointment card

// Force each remaining core prompt directly, so every screen is captured regardless of pacing.
const force = (fn) => page.evaluate(async (src) => {
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  const mods = {
    C: await import('/src/systems/ascent/ConquestSystem.ts'),
    L: await import('/src/systems/ascent/CourtLaneSystem.ts'),
    E: await import('/src/systems/ascent/EnvoySystem.ts'),
    S: await import('/src/systems/ascent/AscentState.ts'),
  };
  // eslint-disable-next-line no-new-func
  new Function('st', 'C', 'L', 'E', src)(st, mods.C, mods.L, mods.E);
  mods.S.drainAscentPrompts(st);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
}, fn);

await force('C.offerConquestPrompt(st);');
await shoot('03-conquer-provinces');

await force('const t = C.buildConquestTargets(st); C.offerConquestMethods(st, t[0].landId);');
await shoot('04-conquer-methods');

await force('L.offerLawChoice(st);');
await shoot('05-law-decree');

await force('L.offerParliament(st);');
await shoot('06-parliament');

await force('E.offerEnvoy(st);');
await shoot('07-envoy');

// A rival's own demand — the pressure that used to be absent entirely.
await page.evaluate(async () => {
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  const R = await import('/src/systems/ascent/RivalDirector.ts');
  const S = await import('/src/systems/ascent/AscentState.ts');
  const rival = st.kingdoms.find((k) => k.id !== 'dai-viet' && !k.isDefeated);
  rival.relations = 30;
  st.ascent.tributeCooldown = 0;
  st.ascent.vassalCooldown = 999;
  st.ascent.coalitionCooldownTicks = 999;
  R.offerRivalDemand(st);
  S.drainAscentPrompts(st);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await shoot('07b-rival-demand');

// The standing bottom bar on the live map, with a province selected.
await page.evaluate(() => {
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  const target = st.lands.find((l) => l.ownerId !== 'dai-viet' && l.isVisible);
  st.selectedLandId = target ? target.id : undefined;
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await shoot('00-action-bar');

// Same view in control mode, reached through the map toggle.
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.events.emit('ui:toggle-render-mode');
  ui.refresh();
});
await shoot('00-control-mode');
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.events.emit('ui:toggle-render-mode');
  ui.refresh();
});
await page.evaluate(() => {
  window.__mandateState.selectedLandId = undefined;
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});

// The five bar screens, opened the way a player would.
for (const lane of ['build', 'heroes', 'court', 'army', 'affairs']) {
  await page.evaluate((l) => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.openLane(l);
  }, lane);
  await shoot(`09-screen-${lane}`);
  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').closeLane());
}

// Drill into one district's build options.
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = window.__mandateState;
  ui.openLane('build');
  ui.showBuildOptions(st.lands.find((l) => l.ownerId === 'dai-viet').id);
});
await shoot('09-screen-build-options');
await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').closeLane());

console.log('open prompt at end:', await kind());
console.log('=== ERRORS ===');
errors.forEach((e) => console.log(e));
console.log(errors.length === 0 ? 'PASS: no console errors' : `FAIL: ${errors.length} errors`);
await browser.close();
