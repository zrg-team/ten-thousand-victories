// The three screens this change touches, shot in order: the mandate (throne hall + two flags),
// the founder deck, and the in-game summon deck. Also drives the gestures — a flick sideways has
// to browse, a flick up has to choose — because a stack that renders and does not respond is the
// exact regression a screenshot cannot see.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
mkdirSync('output/web-game', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

const promptKind = () => page.evaluate(() => window.__mandateState?.pendingAscentPrompt?.kind);

async function flick(from, to, steps = 14) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      from[0] + ((to[0] - from[0]) * step) / steps,
      from[1] + ((to[1] - from[1]) * step) / steps,
    );
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
}

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(900);

const results = [];
const first = await promptKind();
results.push(`first prompt: ${first}`);
if (first === 'mandate') {
  await page.screenshot({ path: 'output/web-game/deck-1-mandate.png' });
  await page.evaluate(async () => {
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const st = window.__mandateState;
    resolveAscentPrompt(st, st.pendingAscentPrompt.options[0]);
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
  });
  await page.waitForTimeout(700);
}

results.push(`second prompt: ${await promptKind()}`);
if ((await promptKind()) === 'founder') {
  await page.screenshot({ path: 'output/web-game/deck-2-founder.png' });

  // Sideways: the deck must show a different champion and stay open.
  const before = await page.evaluate(() => window.__mandateState.pendingAscentPrompt.options);
  await flick([300, 430], [70, 440]);
  await page.screenshot({ path: 'output/web-game/deck-3-founder-browsed.png' });
  results.push(`still open after side flick: ${(await promptKind()) === 'founder'}`);

  // Up: the deck must resolve to one of the offered champions.
  await flick([195, 470], [195, 250]);
  const heroes = await page.evaluate(() => window.__mandateState.heroDeck.filter((h) => h.owned || h.recruited).map((h) => h.id));
  results.push(`founder resolved: ${(await promptKind()) !== 'founder'}`);
  results.push(`offered ${before.length}, owned now: ${heroes.length}`);
}

// The summon, forced the way shot-ascent-summon.mjs forces it.
await page.evaluate(async () => {
  const { offerHeroSummon } = await import('/src/systems/ascent/SummonSystem.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const st = window.__mandateState;
  st.pendingAscentPrompt = undefined;
  st.ascent.promptQueue = [];
  offerHeroSummon(st);
  drainAscentPrompts(st);
  window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
});
await page.waitForTimeout(700);
results.push(`summon prompt: ${await promptKind()}`);
await page.screenshot({ path: 'output/web-game/deck-4-summon.png' });

// Mid-swipe, held: the card should be tilted and the lift cue showing.
await page.mouse.move(195, 470);
await page.mouse.down();
for (let step = 1; step <= 10; step += 1) await page.mouse.move(195, 470 - step * 8);
await page.screenshot({ path: 'output/web-game/deck-5-lift-cue.png' });
await page.mouse.move(195, 470);
await page.mouse.up();
await page.waitForTimeout(400);
results.push(`summon survives a cancelled lift: ${(await promptKind()) === 'hero-choice'}`);

// The ignore button, bottom-left.
await page.mouse.click(105, 812);
await page.waitForTimeout(500);
results.push(`ignore closed the summon: ${(await promptKind()) !== 'hero-choice'}`);

console.log(results.join('\n'));
console.log(errors.length ? `FAIL\n${errors.join('\n')}` : 'PASS: no console errors');
await browser.close();
