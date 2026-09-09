/**
 * The rebuild card is never asked about ground the realm has lost.
 *
 * Reported: *if my land lose should not show modal ask me to rebuild the land.* The card is raised
 * the tick a fight ends and then deliberately held a few seasons so it does not land back-to-back
 * with the wave's own card — and the war does not wait those seasons. The next column takes the
 * province while its rebuilding question is still in the queue, and the player is asked *"{land}
 * was fought over: how hard does the throne push the rebuilding?"* about somebody else's walls.
 *
 * Three checks, and the first of them is the control: the card must still be asked for a province
 * we hold, or "never shows" would be trivially satisfied by never showing it at all.
 *
 *   node test_scripts/verify/verify-restore-card.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

console.log(`=== verify-restore-card — ${URL} ===`);

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { chargeProvinceForDefence } = await import('/src/systems/ascent/RestoreSystem.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const PLAYER = 'dai-viet';

  /**
   * A province of ours that has just paid for a defence, with its card in the queue.
   *
   * `chargeProvinceForDefence` is the real entry point — it burns the buildings, breaches the
   * walls and raises the card off what it actually took, so the card here is the card the game
   * raises rather than a hand-written stand-in.
   */
  const stage = () => {
    const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const land = state.lands.find((one) => one.ownerId === PLAYER && one.buildings.length > 1);
    // The gap rule holds a fresh restore card back for a few seasons; this check is about which
    // province the card names, not about pacing, so the run is given a long enough past that the
    // card is due at once.
    state.turn = 500;
    state.ascent.lastPromptTurn = 0;
    state.ascent.promptQueue.length = 0;
    state.pendingAscentPrompt = undefined;
    land.defense = Math.max(land.defense, 60);
    chargeProvinceForDefence(state, land, 0.6, 40);
    return { state, land };
  };

  // 1 · the control: we still hold it, and the card is asked.
  const held = stage();
  const queuedForHeld = held.state.ascent.promptQueue.some(
    (prompt) => prompt.kind === 'restore-land' && prompt.landId === held.land.id,
  );
  drainAscentPrompts(held.state);
  const shownForHeld = held.state.pendingAscentPrompt?.kind === 'restore-land'
    && held.state.pendingAscentPrompt.landId === held.land.id;

  // 2 · the province falls while its card waits in the queue.
  const lost = stage();
  const queuedForLost = lost.state.ascent.promptQueue.some(
    (prompt) => prompt.kind === 'restore-land' && prompt.landId === lost.land.id,
  );
  lost.land.ownerId = lost.state.kingdoms.find((kingdom) => kingdom.id !== PLAYER).id;
  drainAscentPrompts(lost.state);
  const shownForLost = lost.state.pendingAscentPrompt?.kind === 'restore-land'
    && lost.state.pendingAscentPrompt.landId === lost.land.id;
  const stillQueued = lost.state.ascent.promptQueue.some(
    (prompt) => prompt.kind === 'restore-land' && prompt.landId === lost.land.id,
  );

  // 3 · and the same card already on the screen when the province goes.
  const onScreen = stage();
  drainAscentPrompts(onScreen.state);
  const wasUp = onScreen.state.pendingAscentPrompt?.kind === 'restore-land';
  onScreen.land.ownerId = onScreen.state.kingdoms.find((kingdom) => kingdom.id !== PLAYER).id;
  drainAscentPrompts(onScreen.state);
  const stillUp = onScreen.state.pendingAscentPrompt?.kind === 'restore-land'
    && onScreen.state.pendingAscentPrompt.landId === onScreen.land.id;

  return {
    landId: held.land.id,
    queuedForHeld, shownForHeld,
    queuedForLost, shownForLost, stillQueued,
    wasUp, stillUp,
    paused: onScreen.state.isPaused,
  };
});

check('a province we hold that fought a defence raises the rebuild card',
  out.queuedForHeld && out.shownForHeld, `queued ${out.queuedForHeld}, shown ${out.shownForHeld} (${out.landId})`);
check('the same card is raised for the province that is about to fall',
  out.queuedForLost, 'the control for the check below');
check('but it is never asked once the province is no longer ours',
  !out.shownForLost, out.shownForLost ? 'the rebuild card came up for lost ground' : 'dropped');
check('and it does not sit in the queue waiting for a season that will not come',
  !out.stillQueued, out.stillQueued ? 'still queued' : 'dropped from the queue');
check('a card already on the screen goes with the province',
  out.wasUp && !out.stillUp, `was up ${out.wasUp}, still up ${out.stillUp}`);
// Nothing left to ask means the world runs again; a card silently dropped that left the run
// paused would be a worse bug than the one being fixed.
check('and the run is not left paused behind a card that is gone', !out.paused, `isPaused ${out.paused}`);
check('no browser errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

await browser.close();
const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} restore-card checks passed`);
process.exit(passed === checks.length ? 0 : 1);
