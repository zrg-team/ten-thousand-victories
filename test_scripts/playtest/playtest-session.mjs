/**
 * A watched play session: the game driven through its real UI, at real speed, and recorded.
 *
 * The headless sweep in `playtest-metrics.mjs` can tell you whether choices matter. It cannot
 * tell you what the game is like to sit in front of — how long you wait, what a card says, what
 * the four options on it have to do with each other, whether anything explains what just changed
 * on the map. That is what this captures, and it is deliberately slow and literal: it taps the
 * actual buttons, so a control that is drawn but not pressable fails here rather than passing
 * silently, which is how the map controls stayed inert for a whole release.
 *
 * Output — everything under `output/playtest/session/`:
 *   timeline.json   every decision, every gap, every state change between them
 *   NN-<kind>.png   the first sighting of each distinct screen, for a human or a model to read
 *
 * Usage: node test_scripts/playtest/playtest-session.mjs [--minutes 8] [--seed 1337] [--policy engaged]
 * Env:   PLAYTEST_URL to point at a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DECLINE, openGame, startRenderedRun, summarise } from './playtest-lib.mjs';

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const MINUTES = Number(argOf('--minutes', 8));
const SEED = Number(argOf('--seed', 1337));
const POLICY = argOf('--policy', 'engaged');
const LANG = argOf('--lang', 'en');
const OUT = 'output/playtest/session';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const { page, errors } = await openGame(browser, { language: LANG });
await startRenderedRun(page, SEED);

/** The live state, plus everything that is legible on screen right now. */
const look = () => page.evaluate(() => {
  // Trap 2 from the harness notes: the resident MenuScene nulls `__mandateState` mid-run, and a
  // probe trusting the global loses the run and reads the world as zeros. Recover it from the
  // scene's own `.state` and put the global back, which also heals `render_game_to_text` and
  // `__ptOptions` in the same move.
  if (!window.__mandateState) {
    const conquest = window.__phaserGame.scene.getScene('ConquestScene');
    if (conquest?.state) window.__mandateState = conquest.state;
  }
  const state = window.__mandateState;
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  // The UI scene rebuilds between the founding prompts, and for a frame `modalLayer` (or the
  // state itself) is not there — a look() in that frame must read as "nothing on screen", not
  // crash the session or report a run of zeros as a defeat.
  if (!state?.ascent || !scene?.modalLayer?.list) {
    return { kind: null, options: null, onCard: [], power: 0, threat: 0, defence: 0, wave: 0, level: 0, gold: 0, food: 0, lands: 0, armies: 0, heroes: 0, battleOpen: false, message: null, defeated: false, barVisible: false, modalObjects: 0 };
  }
  const text = JSON.parse(window.render_game_to_text());
  // Every string the player can actually read on the open card.
  const onCard = scene.modalLayer.list
    .flatMap((o) => (o.type === 'Text' ? [o] : (o.list ?? []).filter((c) => c.type === 'Text')))
    .map((t) => t.text)
    .filter((s) => s && s.trim());
  return {
    kind: state.pendingAscentPrompt?.kind ?? null,
    options: window.__ptOptions(),
    onCard,
    power: text.ascent.power,
    threat: text.ascent.threat,
    defence: text.ascent.defensePower,
    wave: text.ascent.wave,
    level: text.ascent.level,
    gold: Math.round(text.resources.gold),
    food: Math.round(text.resources.food),
    lands: state.lands.filter((l) => l.ownerId === 'dai-viet').length,
    armies: state.armies.filter((a) => a.kingdomId === 'dai-viet').length,
    heroes: state.heroes.length,
    battleOpen: !!state.ascent.activeBattle,
    message: text.message,
    defeated: !!state.isDefeated,
    barVisible: scene.actionBar?.visible ?? false,
    modalObjects: scene.modalLayer.list.length,
  };
});

/**
 * Screen positions of everything tappable on the open card.
 *
 * Read off the real display list rather than guessed, because a card's rows move with the length
 * of its own title — a fixed offset taps the gap between two options about a third of the time.
 */
const targets = () => page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const out = [];
  const walk = (container) => {
    for (const child of container.list ?? []) {
      // Every prompt lays a full-screen interactive dim behind its cards to swallow stray taps.
      // It is the first thing in the layer, so a naive sweep taps it and nothing happens — which
      // is exactly the silent no-op this harness exists to catch, so it must not commit it.
      const isBackdrop = child.width >= 340 && child.height >= 300;
      if (child.input && !isBackdrop && child.width > 30 && child.height > 20) {
        const m = child.getWorldTransformMatrix();
        if (m.ty > 100 && m.ty < 830) {
          out.push({ x: Math.round(m.tx), y: Math.round(m.ty), w: child.width, h: child.height });
        }
      }
      if (child.list) walk(child);
    }
  };
  if (scene?.modalLayer) walk(scene.modalLayer);
  // Top to bottom, so "the first option" means the one a player reads first.
  return out.sort((a, b) => a.y - b.y);
});

const started = Date.now();
const at = () => +((Date.now() - started) / 1000).toFixed(1);
const timeline = [];
const decisions = [];
const seenKinds = new Set();
let shots = 0;
let lastDecisionAt = 0;
let previous = await look();

const note = (kind, detail) => {
  timeline.push({ t: at(), kind, ...detail });
  console.log(`[${String(at()).padStart(7)}s] ${kind.padEnd(8)} ${JSON.stringify(detail).slice(0, 190)}`);
};
note('start', { power: previous.power, lands: previous.lands, armies: previous.armies });

const deadline = Date.now() + MINUTES * 60000;
while (Date.now() < deadline) {
  const now = await look();

  if (now.defeated) { note('DEFEAT', { wave: now.wave, at: at() }); break; }

  if (now.kind) {
    const gap = at() - lastDecisionAt;
    // First sighting of each screen is worth a picture; the twentieth is not.
    if (!seenKinds.has(now.kind)) {
      seenKinds.add(now.kind);
      await page.screenshot({ path: `${OUT}/${String(shots).padStart(2, '0')}-${now.kind}.png` });
      shots += 1;
    }
    decisions.push({ t: at(), kind: now.kind, gap: +gap.toFixed(1), options: now.options, onCard: now.onCard });
    note('DECIDE', { kind: now.kind, waited: +gap.toFixed(1), options: now.options?.length ?? 0 });

    // Tap it the way a player would, on the real hit area.
    const hits = await targets();
    let index = 0;
    if (POLICY === 'declining') {
      const out = DECLINE[now.kind];
      index = out && now.options?.includes(out) ? now.options.indexOf(out) : Math.max(0, hits.length - 1);
    } else if (POLICY === 'random') {
      index = Math.floor(Math.random() * Math.max(1, hits.length));
    }
    /**
     * **A card whose first row does not commit it must still be answered.**
     *
     * The driver always tapped `hits[0]`, the topmost hit area, on the reasoning that it is the
     * option a player reads first. That is true of a card whose rows *are* the options, and false
     * of a sheet that is built out of settings with its commit pinned at the foot — the Coronation
     * is the whole first minute of the game and its top row is the founder's sex. Measured, the
     * session spent sixty seconds flipping that toggle: 85 "decisions", wave 0, one screenshot,
     * and every later screen unreachable. The harness that exists to catch a control that does
     * nothing was itself looping on one.
     *
     * So the tap is now a *search*: start where the policy points, and if the card is still up
     * afterwards try the next candidate, bottom-first — a pinned foot is the last thing swept.
     * It still fails loudly when nothing on the card advances, which is the bug worth catching.
     */
    /**
     * **A card whose first row does not commit it must still be answered.**
     *
     * The driver always tapped `hits[0]`, the topmost hit area, on the reasoning that it is the
     * option a player reads first. True of a card whose rows *are* the options; false of a sheet
     * built out of settings with its commit pinned at the foot. The Coronation is the whole first
     * minute of the game and its top row is the founder's sex — measured, the session spent sixty
     * seconds flipping that toggle: 85 "decisions", wave 0, one screenshot, every later screen
     * unreachable. The harness that exists to catch a control that does nothing was looping on one.
     *
     * Two things this has to get right, and the first attempt at it got neither:
     *
     *  - **Re-read the hit areas between presses.** A sheet that redraws itself on a stepper tap
     *    (`replaceLanePage`) invalidates every coordinate swept before it.
     *  - **A rite is not one card.** The Coronation walks founder → name → title under a single
     *    prompt kind, so "did `kind` change" reports no progress for three presses that are all
     *    progress. The pinned foot is what carries a sheet like that forward, so press it and
     *    keep pressing until the prompt is actually gone.
     */
    let target;
    let advanced = false;
    let signature = JSON.stringify(now.onCard ?? []);
    let stalled = 0;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const live = attempt === 0 ? hits : await targets();
      if (live.length === 0) break;
      /**
       * The policy's own pick first, then **the pinned foot, every time**.
       *
       * Not alternating between the last two swept: both feet share a y, so the sweep's order
       * between them is insertion order, and "one then the other" presses *Back* on every second
       * attempt. Measured, that walked the rite forward and back and left it on step two after
       * eight presses. Only a card that has stopped responding at all is worth trying elsewhere.
       */
      const pick = attempt === 0
        ? Math.min(index, live.length - 1)
        : stalled >= 2 ? Math.max(0, live.length - 2) : live.length - 1;
      target = live[pick];
      if (!target) continue;
      // Held, not clicked: `optionCard` refuses a press shorter than CARD_HOLD_MS (70ms), and
      // `mouse.click`'s zero-length press is exactly the brush that guard exists to ignore. A
      // zero-delay driver looped on the first appointment card 375 times in eight minutes while
      // reporting 377 "decisions". 120ms is where a deliberate human tap rests.
      await page.mouse.click(target.x, target.y, { delay: 120 });
      await page.waitForTimeout(420);
      const after = await look();
      if (!after.kind || after.kind !== now.kind) { advanced = true; break; }
      // A rite walks several steps under one prompt kind, so the card's own words are the only
      // honest reading of whether a press did anything.
      const next = JSON.stringify(after.onCard ?? []);
      if (next === signature) stalled += 1; else { stalled = 0; signature = next; }
    }
    if (target && !advanced) {
      // Every way into this card was pressed and it is still up. Worth failing loudly for.
      note('STUCK', { kind: now.kind, hits: hits.length });
      await page.screenshot({ path: `${OUT}/stuck-${now.kind}.png` });
      break;
    }
    if (target) {
      // Held, not clicked, in the search above: `optionCard` refuses a press shorter than
      // CARD_HOLD_MS (70ms), and `mouse.click`'s zero-length press is exactly the brush that guard
      // exists to ignore. A zero-delay driver looped on the first appointment card 375 times in
      // eight minutes while reporting 377 "decisions". 120ms is where a deliberate human tap rests.
    } else {
      // Nothing tappable on an open card is a bug worth failing loudly for.
      note('STUCK', { kind: now.kind, modalObjects: now.modalObjects });
      await page.screenshot({ path: `${OUT}/stuck-${now.kind}.png` });
      break;
    }
    lastDecisionAt = at();
    previous = await look();
    continue;
  }

  if (now.battleOpen && !previous.battleOpen) note('siege', { wave: now.wave });

  const moved = {};
  for (const key of ['power', 'threat', 'lands', 'armies', 'wave', 'level', 'heroes', 'gold']) {
    if (now[key] !== previous[key]) moved[key] = `${previous[key]}→${now[key]}`;
  }
  // Does anything on screen explain the change? An unexplained map is the complaint this catches.
  if (Object.keys(moved).length) note('change', { ...moved, said: now.message?.slice(0, 90) ?? null });

  previous = now;
  await page.waitForTimeout(1400);
}

const finished = await look();
// Only real waits. A card that chains straight off the one before it (a conquest target and
// then its method sheet) is the same decision moment, and counting the 0.1s between them as a
// "gap" flatters the pacing figure into meaninglessness.
const gaps = decisions.slice(1).map((d) => d.gap).filter((g) => g >= 1);
const byKind = {};
for (const d of decisions) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;

const report = {
  seed: SEED,
  policy: POLICY,
  language: LANG,
  minutes: MINUTES,
  decisions: decisions.length,
  perMinute: +(decisions.length / MINUTES).toFixed(1),
  gapSeconds: summarise(gaps),
  promptMix: byKind,
  siegesWatched: timeline.filter((e) => e.kind === 'siege').length,
  screenshots: shots,
  unexplainedChanges: timeline.filter((e) => e.kind === 'change' && !e.said).length,
  explainedChanges: timeline.filter((e) => e.kind === 'change' && e.said).length,
  ended: finished,
  timeline,
  decisionLog: decisions,
  errors,
};
writeFileSync(`${OUT}/timeline.json`, JSON.stringify(report, null, 2));

console.log(`\n  WATCHED SESSION — ${MINUTES} min, seed ${SEED}, policy ${POLICY}\n`);
console.log(`  decisions          ${report.decisions} (${report.perMinute}/min)`);
console.log(`  wait between them  ${report.gapSeconds.mean}s mean, ${report.gapSeconds.min}–${report.gapSeconds.max}s, cv ${report.gapSeconds.cv}`);
console.log(`  sieges watched     ${report.siegesWatched}`);
console.log(`  screens captured   ${shots} → ${OUT}/`);
console.log(`  map changes        ${report.explainedChanges} explained, ${report.unexplainedChanges} unexplained`);
console.log(`  ended              wave ${finished.wave}, ${finished.lands} provinces, ${finished.gold.toLocaleString()} gold${finished.defeated ? ', DEFEATED' : ''}`);
if (errors.length) console.log(`\n  \x1b[31m${errors.length} console errors\x1b[0m — ${errors[0]}`);
console.log(`\n  written to ${OUT}/timeline.json\n`);

await browser.close();
