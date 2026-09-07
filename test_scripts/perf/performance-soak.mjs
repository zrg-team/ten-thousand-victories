/** Real elapsed-time gameplay and navigation soak; production preview compatible. */
import { boot, startWorld, resolveOpening, FIRST_OPTION, arg } from './_boot.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const minutes = Number(arg('minutes', '20'));
const { browser, page, cdp, errors } = await boot({ quality: 'medium', dpr: 2, gc: true, query: '?capture=1&bench=1' });
const directory = arg('out', 'output/performance-review/soak');
await mkdir(directory, { recursive: true });
const samples = [];
let runs = 1, navigations = 0, turns = 0, previousTurn = 0, battleSamples = 0;
try {
  await startWorld(page, { mode: 'ascent' }); await resolveOpening(page);
  const start = Date.now(); let nextSample = start;
  while (Date.now() - start < minutes * 60000) {
    const state = await page.evaluate(src => {
      const st = window.__mandateState, game = window.__phaserGame;
      const ui = game.scene.getScene('ConquestUIScene'), world = game.scene.getScene('ConquestScene');
      const first = eval(src);
      if (!st.isDefeated) {
        let count = 0;
        while (st.pendingAscentPrompt && st.pendingAscentPrompt.kind !== 'run-over' && count++ < 12) {
          if (!window.__performanceBench.resolve(first(st.pendingAscentPrompt))) break;
        }
        ui.battleAwaitingOrder = false;
        st.isPaused = false; st.isStrategyPause = false; st.isAwayPause = false;
        ui.events.emit('state-changed');
      }
      return { defeated: st.isDefeated, turn: st.turn, realtime: st.realtimeSeconds, battle: !!st.ascent?.activeBattle };
    }, FIRST_OPTION);
    turns += Math.max(0, state.turn - previousTurn); previousTurn = state.turn;
    if (state.battle) battleSamples++;
    if (state.defeated) { await startWorld(page, { mode: 'ascent', seed: 1337 + runs++ }); await resolveOpening(page); previousTurn = 0; }
    if (Date.now() >= nextSample) {
      await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        ui.showCodex(); const area = ui.activeScrollAreas[0];
        for (let row = 0; row < 12; row++) area.setScroll(row * 900);
        ui.closeLane(); window.__mandateState.isStrategyPause = false;
      });
      navigations++;
      await page.waitForTimeout(100);
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      const sample = await page.evaluate(() => { const game = window.__phaserGame;
        const world=game.scene.getScene('ConquestScene');
        return { visibleLands:world.state.lands.filter(l=>l.isVisible).length, objects:world.children.list.length, browserReportedHeap: performance.memory?.usedJSHeapSize, textures: Object.keys(game.textures.list).length,
          chunks: Object.keys(game.textures.list).filter(k => k.startsWith('map-chunk:')).length,
          map: game.scene.getScene('ConquestScene').performanceStats(), portraits: window.__performanceBench.portraits() };
      });
      sample.heap = heap;
      samples.push({ seconds: (Date.now() - start) / 1000, ...sample, ...state });
      console.log(JSON.stringify({ seconds: samples.at(-1).seconds, heapMiB: sample.heap / 1048576, chunks: sample.chunks, turn: state.turn, runs, navigations }));
      await writeFile(`${directory}/results.json`, JSON.stringify({ minutes, elapsedSeconds: (Date.now()-start)/1000, runs, turns, battleSamples, navigations, samples, errors }, null, 2));
      nextSample = Date.now() + 30000;
    }
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: `${directory}/final.png` });
  const tail = samples.slice(Math.floor(samples.length / 2));
  const heapGrowth = tail.at(-1).heap - tail[0].heap;
  // Campaigns reveal different amounts of the world. Compare retained memory after returning
  // to the same seed/scene, rather than mistaking newly visible lands for a leak.
  await startWorld(page,{mode:'ascent',seed:1337});await resolveOpening(page);
  await page.evaluate(()=>{window.__mandateState.isStrategyPause=true;const ui=window.__phaserGame.scene.getScene('ConquestUIScene');ui.showCodex();ui.closeLane();});
  await page.waitForFunction(()=>{const s=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !s.refreshPending&&!s.sceneryPending&&!s.ground.pending&&!s.fog.pending;},null,{timeout:60000});
  await page.waitForTimeout(1000);
  await cdp.send('HeapProfiler.collectGarbage');
  const resetHeap=(await cdp.send('Runtime.getHeapUsage')).usedSize;
  const retainedGrowth=(resetHeap-samples[0].heap)/1048576;
  const ok = errors.length === 0 && turns > 0 && samples.every(s => s.map.ground.bytes <= 64 * 1048576 && s.chunks === s.map.ground.tiles + s.map.fog.tiles) && retainedGrowth < 24;
  const result = { ok, minutes, elapsedSeconds: (Date.now()-start)/1000, runs, turns, battleSamples, navigations, tailHeapGrowthMiB: heapGrowth/1048576, resetHeapMiB: resetHeap/1048576, retainedGrowthMiB:retainedGrowth, samples, errors };
  await writeFile(`${directory}/results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, samples: samples.length })); process.exitCode = ok ? 0 : 1;
} finally { await browser.close(); }
