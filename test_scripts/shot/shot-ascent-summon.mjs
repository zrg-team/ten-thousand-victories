// Forces the Hero Summon prompt open and captures it, so the portrait-fit fix is verified
// on both hero prompts rather than only the founder one (a summon needs wave 2 to fire).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('output/web-game', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(700);

// Resolve the founder prompt, then force a summon with a deliberately long name in the
// roster so text wrapping beside the portrait is exercised too.
const info = await page.evaluate(async () => {
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { offerHeroSummon } = await import('/src/systems/ascent/SummonSystem.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const st = window.__mandateState;
  if (st.pendingAscentPrompt?.kind === 'founder') {
    resolveAscentPrompt(st, st.pendingAscentPrompt.options[0]);
  }
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  st.heroDeck[0].name = 'Đại Tướng Quân Trấn Bắc Bình Nam';
  offerHeroSummon(st);
  drainAscentPrompts(st);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
  return { kind: st.pendingAscentPrompt?.kind, heroes: st.pendingAscentPrompt?.heroIds };
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'output/web-game/ascent-prompt-hero-summon.png' });
console.log(JSON.stringify(info));
console.log(errors.length ? errors.join('\n') : 'PASS: no console errors');
await browser.close();
