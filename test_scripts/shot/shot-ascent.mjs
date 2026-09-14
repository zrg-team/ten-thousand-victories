// Drives Dragon Ascent through the real scenes and captures each prompt as it appears.
// Run against a dev server on 5173.
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
await page.waitForTimeout(400);
await page.screenshot({ path: 'output/web-game/ascent-1-menu.png' });

// Classic sub-page: both old modes must still be reachable.
await page.evaluate(() => {
  const menu = window.__phaserGame.scene.getScene('MenuScene');
  menu.mode = 'classic';
  menu.render();
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'output/web-game/ascent-2-classic.png' });

await page.evaluate(() => {
  const menu = window.__phaserGame.scene.getScene('MenuScene');
  menu.mode = 'main';
  menu.render();
});
await page.waitForTimeout(200);

// Start a real run through the menu path.
await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);
await page.screenshot({ path: 'output/web-game/ascent-3-founder.png' });

const seen = new Set();
const shots = [];

// Answer the founder prompt, then let real time run and grab each new prompt kind.
for (let round = 0; round < 60; round += 1) {
  const prompt = await page.evaluate(() => {
    const st = window.__mandateState;
    return st?.pendingAscentPrompt ? st.pendingAscentPrompt.kind : null;
  });

  if (prompt && !seen.has(prompt)) {
    seen.add(prompt);
    await page.waitForTimeout(500);
    const file = `output/web-game/ascent-prompt-${prompt}.png`;
    await page.screenshot({ path: file });
    shots.push(file);
  }

  if (prompt) {
    // Answer it the way a player would: tap the first option.
    await page.evaluate(() => {
      const st = window.__mandateState;
      const p = st.pendingAscentPrompt;
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      const id =
        p.kind === 'founder' ? p.options[0]
        : p.kind === 'power-draft' ? (p.cards[0] ?? 'skip')
        : p.kind === 'march-order' ? (p.targets[0]?.landId ?? 'hold')
        : p.kind === 'hero-summon' ? (p.heroIds[0] ?? 'pass')
        : p.kind === 'empire-response' ? (p.options.find((o) => o.affordable) ?? p.options[0]).id
        : 'ok';
      ui.events.emit('ui:ascent-choice', id);
    });
    await page.waitForTimeout(250);
  }

  // Let the real clock advance a few economy ticks.
  await page.evaluate(() => window.advanceTime(4000));
  await page.waitForTimeout(120);
}

await page.waitForTimeout(400);
await page.screenshot({ path: 'output/web-game/ascent-4-playing.png' });

// The persistent chrome: pause / Codex / leave, and the Codex collection screen.
await page.evaluate(() => {
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.refresh();
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'output/web-game/ascent-5-controls.png' });

await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').showCodex());
await page.waitForTimeout(500);
await page.screenshot({ path: 'output/web-game/ascent-6-codex.png' });

const snapshot = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
console.log(JSON.stringify({ ascent: snapshot.ascent, message: snapshot.message }, null, 2));
console.log('prompts captured:', [...seen].join(', '));
console.log('=== ERRORS ===');
errors.forEach((e) => console.log(e));
console.log(errors.length === 0 ? 'PASS: no console errors' : 'FAIL: console errors');

await browser.close();
