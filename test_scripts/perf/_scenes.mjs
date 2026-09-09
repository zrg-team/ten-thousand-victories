/**
 * The screens the mobile round is judged on, and how to measure one.
 *
 * Shared by `android-emulator.mjs` (Chrome on a device) and `mobile-frame.mjs` (headless Chromium
 * under CPU throttle) so the two rigs put the game in the same state and perform the same gesture.
 * The difference between their numbers is then the rig, not the scenario.
 *
 * Chosen because they are the two things the player named plus their controls:
 *   menu   — the front page, the cheapest screen, a sanity floor
 *   map    — Conquest in play, settled: what a run looks like most of the time
 *   army   — a lane list with eight eager widget blocks, the heaviest scrolling surface in a run
 *   guide  — How to Play: the largest non-virtualised page in the game
 */
import { FIRST_OPTION, fling, stampReport, textureBytes } from './_boot.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Puts the game into the named state. Leaves it settled and ready to sample. */
export const SETUP = {
  menu: async () => {},

  map: async (page) => {
    await page.evaluate(([s, m]) => window.__startBenchGame(s, m), [20260812, 'ascent']);
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestScene')
      && window.__phaserGame.scene.getScene('ConquestScene').landNodes?.size > 0, null, { timeout: 60000 });
    await page.evaluate(async ([src]) => {
      const st = window.__mandateState;
      const bench = window.__performanceBench;
      const resolve = bench
        ? (choice) => bench.resolve(choice)
        : (await import('/src/systems/ascent/AscentResolver.ts')).resolveAscentPrompt.bind(null, st);
      const first = eval(src);
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) resolve(first(st.pendingAscentPrompt));
      window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
      window.__phaserGame.scene.getScene('ConquestScene').refresh();
    }, [FIRST_OPTION]);
    // Chunk preparation runs across frames; sampling into its tail measures the repaint, not the map.
    await page.waitForFunction(() => {
      const s = window.__phaserGame.scene.getScene('ConquestScene').performanceStats();
      return !s.refreshPending && !s.sceneryPending && !s.ground?.pending && !s.fog?.pending;
    }, null, { timeout: 180000 });
    await sleep(400);
  },

  army: async (page) => {
    await SETUP.map(page);
    // `openLane` refuses while a decision card is up (lanes/frame.ts), and the opening chain can
    // raise a fresh one on the refresh that follows it — the first sweep of this harness measured
    // an "army lane" that had never opened and reported a fling across zero lists.
    await page.evaluate(async ([src]) => {
      const st = window.__mandateState;
      const bench = window.__performanceBench;
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      const first = eval(src);
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) bench.resolve(first(st.pendingAscentPrompt));
      ui.events.emit('state-changed');
      ui.openLane('army');
    }, [FIRST_OPTION]);
    await sleep(900);
    const opened = await page.evaluate(() => {
      let lists = 0;
      const walk = (o) => { if (o.getData && o.getData('inkScrollContent')) lists += 1; if (o.list) o.list.forEach(walk); };
      window.__phaserGame.scene.getScene('ConquestUIScene').children.list.forEach(walk);
      return { lists, key: window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey };
    });
    if (!opened.lists) throw new Error(`the army lane did not open (openPromptKey="${opened.key}")`);
  },

  guide: async (page) => {
    await page.evaluate(() => window.__phaserGame.scene.start('GuideScene'));
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('GuideScene'), null, { timeout: 30000 });
    await sleep(900);
  },
};

/** Which scenes are worth dragging. */
export const SCROLLS = { menu: false, map: false, army: true, guide: true };

/**
 * Samples one scene: an idle window, then — where the scene scrolls — three flings.
 * `installGlCounters`, `installFrameProbe` and `installGestureProbe` must already be installed.
 */
export async function measureScene(page, cdp, scene, { idleMs = 4000, flings = 3, reset } = {}) {
  // Every scene starts from a fresh page. Six scenes stay resident in this game, so measuring them
  // in sequence in one page leaves the previous one's lists and tweens alive underneath — the first
  // sweep of this harness silently flung a lane that was no longer on screen and recorded 0 px.
  if (reset) await reset();
  await SETUP[scene](page);
  await sleep(500);

  await page.evaluate(() => window.__frameProbe.start());
  await sleep(idleMs);
  const idle = await page.evaluate(() => window.__frameProbe.stop());

  let gesture = null;
  if (SCROLLS[scene]) {
    const spot = await page.evaluate(() => {
      const canvas = window.__phaserGame.canvas.getBoundingClientRect();
      return { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.6, h: canvas.height };
    });
    // The first touch of a session pays for Phaser's input bootstrap — measured at 363 ms against
    // 5 ms for every one after it. Warm it, then watch, then measure.
    await fling(cdp, { x: spot.x, y: spot.y, dy: -40, steps: 4 });
    await sleep(500);
    spot.lists = await page.evaluate(() => window.__gestureProbe.watch());
    await page.evaluate(() => { window.__gestureProbe.down(); window.__frameProbe.start(); });
    for (let i = 0; i < flings; i += 1) {
      await fling(cdp, { x: spot.x, y: spot.y, dy: -Math.round(spot.h * 0.35), steps: 20 });
      await sleep(700);
    }
    gesture = await page.evaluate(() => ({ ...window.__frameProbe.stop(), ...window.__gestureProbe.read() }));
    gesture.lists = spot.lists;
  }

  const extra = await page.evaluate(() => ({
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    census: (() => {
      const game = window.__phaserGame;
      const out = { visible: 0, visGraphics: 0, visCmds: 0, text: 0, tweens: 0 };
      const walk = (o, vis) => {
        const v = vis && o.visible !== false;
        if (v) out.visible += 1;
        if (o.type === 'Graphics') { if (v) { out.visGraphics += 1; out.visCmds += o.commandBuffer.length; } }
        else if (o.type === 'Text') out.text += 1;
        if (o.list) o.list.forEach((c) => walk(c, v));
      };
      for (const s of game.scene.getScenes(true)) { s.children.list.forEach((c) => walk(c, true)); out.tweens += s.tweens.getTweens().length; }
      return out;
    })(),
  }));

  return { idle, gesture, ...extra, textureMB: await textureBytes(page), stamps: await stampReport(page) };
}

/** One line per scene, so a run is readable without opening the JSON. */
export function line(scene, r) {
  const g = r.gesture;
  return `  ${scene.padEnd(6)} idle p50 ${String(r.idle.gapP50).padStart(5)} p95 ${String(r.idle.gapP95).padStart(6)}`
    + ` over50 ${String(r.idle.over50).padStart(3)} · ${String(r.idle.draws).padStart(3)} draws`
    + ` ${String(r.idle.texBinds).padStart(3)} binds ${String(r.idle.uploadKB).padStart(6)} KB`
    + ` · ${String(r.census.visCmds).padStart(6)} cmds ${String(r.census.text).padStart(4)} text`
    + (g ? ` | fling p95 ${String(g.gapP95).padStart(6)} over50 ${String(g.over50).padStart(3)}`
      + ` in→paint ${String(g.inputToPaintMs ?? '—').padStart(5)}ms` : '');
}
