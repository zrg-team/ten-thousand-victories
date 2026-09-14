// Verifies the Dragon Ascent march target uses the shared battle clash device instead of the old
// two-line red X. Captures the active attack marker at the same mobile scale players see.
// Needs Vite on http://127.0.0.1:5179.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('output/web-game', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`CONSOLE ${message.text()}`);
});

await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);
await page.evaluate(() => window.__startBenchGame(20260824, 'ascent', 'v1'));
await page.waitForFunction(
  () => window.__phaserGame.scene.isActive('ConquestScene'),
  null,
  { timeout: 30000 },
);
await page.waitForTimeout(800);

const active = await page.evaluate(async () => {
  const state = window.__mandateState;
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');

  // Clear the opening decisions through the real resolver so no modal covers the map capture.
  let guard = 0;
  while (state.pendingAscentPrompt && guard++ < 12) {
    const prompt = state.pendingAscentPrompt;
    const choice = prompt.kind === 'founder'
      ? prompt.options[0]
      : prompt.kind === 'court-appointment'
        ? prompt.options[0].id
        : prompt.kind === 'power-draft'
          ? (prompt.cards[0] ?? 'skip')
          : prompt.kind === 'hero-choice'
            ? 'pass'
            : prompt.kind === 'conquer-target' || prompt.kind === 'law-choice'
              ? 'hold'
              : prompt.kind === 'parliament'
                ? 'decline'
                : (prompt.options?.[0]?.id ?? 'ok');
    resolveAscentPrompt(state, choice);
  }

  const home = state.lands.find((land) => land.ownerId === 'dai-viet');
  const target = state.lands.find((land) => land.ownerId !== 'dai-viet' && home.neighbors.includes(land.id))
    ?? state.lands.find((land) => land.ownerId !== 'dai-viet');
  state.ascent.frontLandId = target.id;
  state.ascent.frontBlocked = false;
  world.refresh();
  ui.events.emit('state-changed');

  const marker = world.frontMarker;
  world.setMapZoom(2.35);
  ui.events.emit('ui:pan-camera', marker.x, marker.y);
  await new Promise((resolve) => setTimeout(resolve, 650));

  return {
    target: target.name,
    role: marker.getData('mapMarkerRole'),
    icon: marker.getData('attackIcon'),
    blocked: marker.getData('blocked'),
    childCount: marker.length,
  };
});

await page.screenshot({ path: 'output/web-game/attack-front-marker.png' });

const blocked = await page.evaluate(() => {
  const state = window.__mandateState;
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  state.ascent.frontBlocked = true;
  world.refresh();
  const marker = world.frontMarker;
  return {
    role: marker.getData('mapMarkerRole'),
    icon: marker.getData('attackIcon'),
    blocked: marker.getData('blocked'),
    childCount: marker.length,
  };
});

const checks = [
  ['active marker role', active.role === 'attack-front'],
  ['active marker icon', active.icon === 'clash-device'],
  ['active marker state', active.blocked === false],
  ['active marker layers', active.childCount === 2],
  ['blocked marker role', blocked.role === 'attack-front'],
  ['blocked marker icon', blocked.icon === 'clash-device'],
  ['blocked marker state', blocked.blocked === true],
  ['blocked marker layers', blocked.childCount === 2],
  ['no browser errors', errors.length === 0],
];

for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
console.log(JSON.stringify({ active, blocked, errors }));

await browser.close();
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
