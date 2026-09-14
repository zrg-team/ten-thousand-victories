// Ascent decision prompts, captured at the SHORT viewport where they actually overflow.
//
// GAME_HEIGHT is clamped to 620 on a wide desktop window (constants.ts), and a four-card level-up
// draft plus its footer needs ~775px — so the last card and both footer buttons used to sit below
// the bottom edge, unreachable. A 390x844 phone fits them, which is why the bug was invisible in
// testing. This captures both heights so the difference is visible.
//
// Prompts are answered through `resolveAscentPrompt` (the same door play-ascent.mjs uses) rather
// than by tapping, because the opening founder card blocks the run until it is answered.
//
// Usage: node test_scripts/shot/shot-prompts.mjs [seed]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SEED = Number(process.argv[2] ?? 1337);
const OUT = 'test_scripts/shots';
mkdirSync(OUT, { recursive: true });

// 1512x900 -> GAME_HEIGHT clamps to 620 (the broken case); 390x844 -> 844 (the case that fit).
const VIEWPORTS = [
  { label: 'short', width: 1512, height: 900 },
  { label: 'tall', width: 390, height: 844 },
];

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('http://127.0.0.1:5179', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
    && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate((s) => window.__startBenchGame(s, 'ascent', 'v1'), SEED);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await page.waitForTimeout(700);

  const height = await page.evaluate(() => window.__phaserGame.scale.height);

  const seen = new Set();
  for (let step = 0; step < 400 && seen.size < 8; step += 1) {
    const kind = await page.evaluate(() => window.__mandateState.pendingAscentPrompt?.kind ?? null);

    if (kind && !seen.has(kind)) {
      seen.add(kind);
      // Let the scene paint the prompt, then capture it.
      await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed'));
      await page.waitForTimeout(420);
      await page.screenshot({ path: `${OUT}/prompt-${vp.label}-${kind}.png` });
    }

    const done = await page.evaluate(async () => {
      const st = window.__mandateState;
      // Imported per step rather than stashed on `window`: the module cache makes this free, and
      // a stashed handle went missing between evaluates.
      const TICK = await import('/src/systems/ascent/AscentTick.ts');
      const RES = await import('/src/systems/ascent/AscentResolver.ts');
      const prompt = st.pendingAscentPrompt;
      if (prompt) {
        if (prompt.kind === 'run-over' || st.isDefeated) return true;
        // First legal option, whatever it is — this harness is about layout, not policy.
        const id = prompt.options?.[0]?.id
          ?? prompt.cards?.[0]
          ?? prompt.targets?.[0]?.landId
          ?? prompt.heroes?.[0]?.id
          ?? 'skip';
        if (!RES.resolveAscentPrompt(st, id)) st.pendingAscentPrompt = undefined;
        return false;
      }
      TICK.advanceAscentTick(st);
      return false;
    });
    if (done) break;
  }

  console.log(`[${vp.label}] ${vp.width}x${vp.height} -> GAME_HEIGHT ${height}`);
  console.log(`[${vp.label}] prompts captured: ${[...seen].join(', ') || '(none)'}`);
  console.log(`[${vp.label}] console errors: ${errors.length}`);
  errors.slice(0, 4).forEach((e) => console.log('   ', e));
  await page.close();
}

console.log(`shots written to ${OUT}/`);
await browser.close();
