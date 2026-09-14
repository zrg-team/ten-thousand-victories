/**
 * Verifies the Dragon Ascent invasion lifecycle: every invasion announces its landing, every
 * invasion announces its result, and the two pair up.
 *
 * The result used to be reported by the *next* wave's clock — "wave 6 broken" arrived at the
 * moment wave 7 was raised, which could be five seasons after the last host of wave 6 died. This
 * asserts the new contract:
 *
 *   1. a `start` cue is raised the tick a wave's hosts actually land, never before;
 *   2. an `end` cue is raised the tick the map clears, and carries real figures;
 *   3. every end pairs with a start of the same wave, in order;
 *   4. `wavesSurvived` still counts each wave exactly once — the whole risk of moving a payout
 *      is paying it twice, or not at all.
 *
 * Runs headless: the systems are imported and ticked with no renderer. Exits non-zero on failure.
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL_BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

const result = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');

  let s = 20260822 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  window.__mandateState = st;

  let methodCursor = 0;
  let doctrineCursor = 0;
  const firstChoice = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': {
        const open = p.target.methods.filter((m) => !m.blockedReason);
        return open.length > 0 ? open[methodCursor++ % open.length].method : 'back';
      }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'doctrine': return p.options[doctrineCursor++ % p.options.length];
      case 'parliament': {
        const card = st.politicsDeck.find((c) => c.id === p.cardId);
        if (!card) return 'decline';
        const affordable = card.choices.find((c) => Object.entries(c.effects.resourceDelta ?? {})
          .every(([k, v]) => (v ?? 0) >= 0 || st.resources[k] >= Math.abs(v)));
        return affordable ? affordable.id : 'decline';
      }
      case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'battle': return 'hold';
      case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
      case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'story-beat':
        return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
      case 'empire-response':
        return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      default: return 'ok';
    }
  };

  const cues = [];
  /** `wavesSurvived` sampled against the wave counter, every tick. */
  const survivedDrift = [];
  /** Ticks on which a start cue was raised but no invader stood on the map. */
  const phantomStarts = [];
  /** End cues whose reported province count disagreed with the board. */
  const badLandCounts = [];
  let runEnded = false;
  let ticks = 0;

  for (let i = 0; i < 420; i += 1) {
    advanceAscentTick(st);
    ticks += 1;

    // Drain the queue exactly as ConquestUIScene does: take everything raised, clear it, keep it.
    // A wave met without a response card closes the previous invasion and launches the next one in
    // the same tick, so a reader that took only one cue per tick would lose half the run's results.
    const raised = st.ascent.waveCues ?? [];
    if (raised.length > 0) st.ascent.waveCues = [];
    for (const cue of raised) {
      const liveHosts = st.invasions?.length ?? 0;
      const owned = st.lands.filter((l) => l.ownerId === 'dai-viet').length;
      cues.push({
        tick: i, id: cue.id, phase: cue.phase, wave: cue.wave, boss: cue.boss,
        hosts: cue.hosts, power: Math.round(cue.power), outcome: cue.outcome,
        hostsBroken: cue.hostsBroken, landsLost: cue.landsLost, landsHeld: cue.landsHeld,
        momentum: cue.momentum, survived: cue.survived, seasons: cue.seasons,
        kingdomName: cue.kingdomName,
      });
      if (cue.phase === 'start' && liveHosts === 0) phantomStarts.push(i);
      if (cue.phase === 'end' && cue.landsHeld !== owned) {
        badLandCounts.push({ tick: i, said: cue.landsHeld, was: owned });
      }
    }

    survivedDrift.push(st.ascent.wave - st.ascent.wavesSurvived);

    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 40) {
      const prompt = st.pendingAscentPrompt;
      if (prompt.kind === 'run-over') { runEnded = true; break; }
      resolveAscentPrompt(st, firstChoice(prompt));
      if (st.pendingAscentPrompt === prompt) break;
    }
    if (runEnded) break;
  }

  return {
    ticks,
    runEnded,
    cues,
    wave: st.ascent.wave,
    wavesSurvived: st.ascent.wavesSurvived,
    survivedDriftRange: [Math.min(...survivedDrift), Math.max(...survivedDrift)],
    phantomStarts,
    badLandCounts,
    pendingWaveLeft: st.ascent.pendingWave?.wave ?? null,
    cueIdsMonotonic: cues.every((c, i) => i === 0 || c.id > cues[i - 1].id),
  };
});

/**
 * Phase two, in the real scene: the proclamation is raised by a cue on state, it is *lowered* away
 * rather than blinking out, and a tap anywhere dismisses it.
 *
 * The exit is asserted as a duration rather than photographed. A screenshot cannot catch it — a
 * `page.screenshot` at deviceScaleFactor 2 costs several hundred milliseconds of its own, which is
 * longer than the fall, so every timed frame came back empty and the harness would have "proved"
 * the opposite of the truth. Polling the scene for the banner's own lifetime is exact.
 */
await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
// A sentinel on `window`, checked again at the end of the phase.
//
// A dev server that reloads the page mid-run takes `window.__phaserGame` with it, and every
// remaining probe then reads `undefined` — which this harness would otherwise report as "the tap
// does not dismiss the banner". That is the worst kind of failure a harness can produce: a real
// feature marked broken by an accident of the environment. Vite reloads for any edit under `src/`,
// so on a machine where something else is being worked on it happens for reasons that have nothing
// to do with the code under test. The sentinel turns that into a legible CHECK instead of a FAIL.
await page.evaluate(() => { window.__lifecycleRun = 'phase2'; });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestScene');
  scene.state.isPaused = true;
  scene.state.pendingAscentPrompt = undefined;
  scene.state.ascentPromptQueue = [];
  window.__phaserGame.scene.getScene('ConquestUIScene').refresh();
});

const CUE = {
  id: 1, phase: 'end', wave: 7, boss: false, kingdomName: 'Nam Han', hosts: 3, power: 8420,
  outcome: 'triumph', hostsBroken: 3, landsLost: 0, landsHeld: 11, momentum: 340, survived: 7, seasons: 5,
};

const raise = async (id, phase = 'end') => page.evaluate((cue) => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.waveBanner?.destroy();
  ui.waveBanner = undefined;
  ui.waveCueQueue = [];
  ui.lastWaveCueId = 0;
  window.__phaserGame.scene.getScene('ConquestScene').state.ascent.waveCues = [cue];
  ui.refresh();
  return Boolean(ui.waveBanner);
}, { ...CUE, id, phase });

const alive = () => page.evaluate(
  () => Boolean(window.__phaserGame.scene.getScene('ConquestUIScene').waveBanner),
);

/**
 * Waits for the banner to finish leaving, and reports whether it did.
 *
 * Every duration in this phase has to be waited on as a *condition*, because the banner's own
 * clock is `scene.time` and in headless Chromium that runs behind the wall clock — the page is
 * handed far fewer frames than a real device. Measured on this machine: the dismiss zone's 600 ms
 * arming delay had not elapsed after 750 ms of wall time, and had after 1100. Any fixed sleep here
 * is a coin toss that reports a working feature as broken.
 */
const settle = async (budget = 9000) => {
  const began = Date.now();
  try {
    await page.waitForFunction(
      () => !window.__phaserGame.scene.getScene('ConquestUIScene').waveBanner,
      null, { timeout: budget },
    );
    return { gone: true, ms: Date.now() - began };
  } catch {
    return { gone: false, ms: Date.now() - began };
  }
};

/**
 * Waits until the banner has armed its dismissal.
 *
 * It listens on the scene's pointer rather than owning an interactive object, so what is waited on
 * is the listener count rising above whatever the scene already had. The earlier version laid a
 * full-screen interactive `Zone` over everything, which dismissed from anywhere and also swallowed
 * every control underneath it — see the map-control check below.
 */
const zoneArmed = async () => {
  const base = await page.evaluate(
    () => window.__phaserGame.scene.getScene('ConquestUIScene').input.listenerCount('pointerup'),
  );
  try {
    await page.waitForFunction(
      (was) => window.__phaserGame.scene.getScene('ConquestUIScene').input.listenerCount('pointerup') > was,
      base, { timeout: 6000 },
    );
    return true;
  } catch {
    return false;
  }
};

const rendered = {
  raised: await raise(1), midFall: false, settled: false,
  reRaised: false, armed: false, byTap: false, tapMs: -1, mapFree: null, pageHeld: false,
  pausedForResult: false, clockReleased: false, pausedForLanding: null,
  controlFound: false, controlLive: false,
};

// Start the exit by hand and watch it fall. Still up a fifth of a second in, gone within a second:
// that window is the difference between an animation and a disappearance.
await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').waveBanner?.skip());
// 200 ms of *wall* time is safe for this one in the other direction: the fall runs 420 ms on a
// clock that is behind, so a lagging scene can only make the banner more present, never less.
await page.waitForTimeout(200);
rendered.midFall = await alive();
rendered.settled = (await settle()).gone;

// A tap anywhere — well outside the plate, low on the map — dismisses it. And the same tap must
// still reach the map: the banner publishes nothing to `__hudTapBounds` and never sets
// `__suppressMapInputUntil`, which is what "it does not stop the event" means here.
//
// Waited on the *condition*, never on a duration. The dismiss zone arms 600 ms after the banner
// opens, and that delay is counted on the scene clock — which in headless Chromium runs behind the
// wall clock, because the page is handed far fewer frames than a real device. A `waitForTimeout`
// of 750 ms therefore clicked a zone that was still inert roughly half the time and reported a
// working feature as broken. Measured: at 750 ms `zone.input` was null, at 1100 ms it was live.
rendered.reRaised = await raise(2);
rendered.armed = await zoneArmed();
// Two frames between arming the zone and clicking it, and this is a real Phaser rule rather than a
// sleep for luck: `setInteractive` does not put an object into the input plugin's active list, it
// queues it in `_pendingInsertion`, and the plugin drains that at the top of its next update. A
// pointer delivered in the same frame therefore hit-tests against a list the zone is not in yet.
// Measured: clicking immediately, the banner survived and expired on its own at ~4.6 s; with the
// frames, it went in 151 ms. A human tap is always several frames after the 600 ms arming, so this
// is a harness artefact and never something a player could hit.
await page.evaluate(() => new Promise((done) => {
  requestAnimationFrame(() => requestAnimationFrame(() => done()));
}));
await page.mouse.click(60, 700);
// Timed, not merely awaited — and this is the whole point of the check.
//
// The first version just waited for the banner to be gone inside a 4 s budget, which a result
// banner used to satisfy *on its own*: its full life was 3.3 s, so the check went green whether or
// not the tap did anything. It was a false pass, and it only surfaced when the hold was lengthened
// past the budget. A tap dismissal takes the 420 ms fall and nothing else; an untouched banner now
// stands for better than five seconds. Two and a half seconds cleanly separates them.
const tapped = await settle();
rendered.tapMs = tapped.ms;
rendered.byTap = tapped.gone && tapped.ms < 2500;
/**
 * The world stops for a result and does not stop for a landing - and, above all, it starts again.
 *
 * A pause taken by a transient is the kind of bug that ends a run: if the banner's release ever
 * fails to fire, the clock never comes back and the only symptom is a game that has quietly
 * stopped. Checked in all three states rather than just the middle one.
 */
const paused = () => page.evaluate(
  () => window.__phaserGame.scene.getScene('ConquestScene').state.isStrategyPause === true,
);

// **The map controls must keep working while a banner stands over them.**
//
// This is the regression the scene-level listener exists to prevent. A full-screen interactive
// zone at depth 470 outranks the map controls at 430, so Phaser delivered every pointer to the
// banner and none to the buttons: the zoom pair and the terrain/control toggle were visible,
// pressable and inert for the banner's whole life — nine seconds, once a result began holding the
// world. Driven through the button's real coordinates, read off the display list.
await raise(5);
await zoneArmed();
const control = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const c = ui.mapControlObjects[ui.mapControlObjects.length - 1];
  return c ? { x: c.x, y: c.y } : null;
});
rendered.controlFound = Boolean(control);
if (control) {
  const was = await page.evaluate(
    () => window.__phaserGame.scene.getScene('ConquestScene').state.mapRenderMode,
  );
  await page.mouse.click(control.x, control.y);
  await page.waitForTimeout(500);
  rendered.controlLive = await page.evaluate(
    (before) => window.__phaserGame.scene.getScene('ConquestScene').state.mapRenderMode !== before,
    was,
  );
}
await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').waveBanner?.skip());
await settle();

await raise(3);
rendered.pausedForResult = await paused();
await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').waveBanner?.skip());
await settle();
rendered.clockReleased = !(await paused());

await raise(4, 'start');
rendered.pausedForLanding = await paused();
await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').waveBanner?.skip());
await settle();

rendered.mapFree = await page.evaluate(() => {
  const bounds = window.__hudTapBounds ?? [];
  const covering = bounds.some((r) => r.width >= 380 && r.height >= 600);
  return !covering && (window.__suppressMapInputUntil ?? 0) <= performance.now();
});
rendered.pageHeld = await page.evaluate(() => window.__lifecycleRun === 'phase2');

/**
 * Phase three: a run stored mid-invasion must not re-announce it on load.
 *
 * `ascent.waveCues` lives on the serialised state, and `ConquestUIScene.lastWaveCueId` — the thing
 * that stops a cue playing twice — is a scene field that starts at zero in a freshly created scene.
 * So a save written while a battle lane or an aftermath card held the screen (the drain runs at the
 * end of `refresh`, behind several early returns) carried an unplayed cue, and loading it replayed
 * the landing of an invasion the player had already fought. `sanitiseLoadedState` drops them, in
 * the same breath as the mid-decision prompt it was already dropping.
 */
const saveRoundTrip = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { saveSnapshot, loadSnapshot } = await import('/src/state/save.ts');

  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  // Exactly the shape the director leaves behind when the screen was too busy to drain it.
  st.ascent.waveCues = [{
    id: 9, phase: 'end', wave: 4, boss: true, hosts: 2, power: 3000,
    outcome: 'triumph', hostsBroken: 2, landsLost: 0, landsHeld: 6,
    momentum: 200, survived: 4, seasons: 8,
  }];
  st.ascent.waveCueSeq = 9;
  st.pendingAscentPrompt = { kind: 'story-beat', options: [] };

  const wrote = saveSnapshot(st);
  const back = loadSnapshot();
  return {
    saved: Boolean(wrote),
    cuesOnLoad: back?.state?.ascent?.waveCues?.length ?? -1,
    // The counter itself must survive, or a fresh cue raised after the load could collide with an
    // id the scene has already seen.
    seqOnLoad: back?.state?.ascent?.waveCueSeq ?? -1,
    promptDropped: back?.state?.pendingAscentPrompt === undefined,
  };
});

await browser.close();

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const starts = result.cues.filter((c) => c.phase === 'start');
const ends = result.cues.filter((c) => c.phase === 'end');

console.log('=== INVASION LIFECYCLE ===');
console.log(`${result.ticks} ticks, wave ${result.wave}, ${result.wavesSurvived} survived, run ended: ${result.runEnded}`);
for (const cue of result.cues.slice(0, 14)) {
  console.log(cue.phase === 'start'
    ? `  t${String(cue.tick).padStart(3)}  START  wave ${cue.wave}${cue.boss ? ' (great)' : ''}  ${cue.hosts} host(s), power ${cue.power}, ${cue.kingdomName ?? '?'}`
    : `  t${String(cue.tick).padStart(3)}  END    wave ${cue.wave}  ${cue.outcome}  broke ${cue.hostsBroken}, lost ${cue.landsLost}, held ${cue.landsHeld}, +${cue.momentum} momentum, ${cue.seasons} seasons`);
}
if (result.cues.length > 14) console.log(`  … ${result.cues.length - 14} more`);

check('landings are announced', starts.length >= 2, `${starts.length} start cues`);
check('results are announced', ends.length >= 2, `${ends.length} end cues`);

// Pairing: walking the cue list, a start must be open before an end closes it, and the wave
// numbers must agree. This is the property the old header-strip line could not have — it fired on
// the next wave's clock, so "wave N" was reported while wave N+1 was already being raised.
let open = null;
const pairingFaults = [];
for (const cue of result.cues) {
  if (cue.phase === 'start') {
    if (open !== null) pairingFaults.push(`start ${cue.wave} while ${open} still open`);
    open = cue.wave;
  } else {
    if (open === null) pairingFaults.push(`end ${cue.wave} with nothing open`);
    else if (open !== cue.wave) pairingFaults.push(`end ${cue.wave} closed start ${open}`);
    open = null;
  }
}
check('every result closes its own landing', pairingFaults.length === 0, pairingFaults.slice(0, 3).join(' | '));

check('no landing announced without hosts on the map', result.phantomStarts.length === 0,
  `ticks ${result.phantomStarts.slice(0, 4).join(', ')}`);
check('results count the provinces actually held', result.badLandCounts.length === 0,
  JSON.stringify(result.badLandCounts.slice(0, 3)));

// The payout invariant. `wavesSurvived` trails `wave` by 0 (this wave already cleared) or 1 (it is
// still on the map). Anything outside that means a wave was paid twice or never paid.
const [lo, hi] = result.survivedDriftRange;
check('each wave is counted exactly once', lo >= 0 && hi <= 1, `wave - wavesSurvived ranged [${lo}, ${hi}]`);

// Zero provinces held is the honest figure for the invasion that ends a run, so it is only an
// overrun that may report it.
const withFigures = ends.filter((c) => (c.seasons ?? 0) >= 1
  && ((c.landsHeld ?? 0) > 0 || c.outcome === 'overrun'));
check('results carry real figures', ends.length > 0 && withFigures.length === ends.length,
  `${withFigures.length}/${ends.length}`);

check('cues arrive in the order they were raised', result.cueIdsMonotonic);

const graded = ends.filter((c) => ['triumph', 'held', 'overrun'].includes(c.outcome));
check('every result is graded', ends.length > 0 && graded.length === ends.length,
  `${graded.length}/${ends.length}`);

check('landings name the crown that is marching', starts.every((c) => Boolean(c.kingdomName)),
  `${starts.filter((c) => c.kingdomName).length}/${starts.length}`);

console.log('\n=== THE BANNER, IN THE SCENE ===');
if (!rendered.pageHeld) {
  // Nothing below was measured against a live game, so nothing below is reported as a result.
  console.log('CHECK: the dev server reloaded the page mid-run — the rendered phase proved nothing.');
  console.log('       Re-run when nothing under src/ is being edited.');
} else {
  check('a cue on state raises the banner', rendered.raised);
  check('the exit is animated, not a disappearance', rendered.midFall,
    'still on screen 200ms after the roll began');
  check('and it does finish', rendered.settled);
  check('the dismiss zone arms itself', rendered.reRaised && rendered.armed);
  check('a tap anywhere dismisses it', rendered.byTap === true,
    `gone ${rendered.tapMs}ms after the tap; an untouched banner stands ~9400ms`);
  check('dismissing never blocks the map', rendered.mapFree === true);
  check('a result stops the world', rendered.pausedForResult === true);
  check('and the clock starts again when it leaves', rendered.clockReleased === true);
  check('a landing does not stop the world', rendered.pausedForLanding === false);
  check('the map controls still work under a banner', rendered.controlFound && rendered.controlLive,
    rendered.controlFound ? '' : 'no map control found to press');
}

// A reload tears down the page mid-probe, and the resulting "cannot read properties of undefined"
// is the harness's own dying breath rather than anything the game did. Judged only on a page that
// survived; otherwise the errors are printed and left uncounted.
console.log('\n=== A RELOADED SAVE ===');
check('a run saved mid-invasion still saves', saveRoundTrip.saved);
check('an undrained banner cue does not survive the load', saveRoundTrip.cuesOnLoad === 0,
  `${saveRoundTrip.cuesOnLoad} cue(s) restored`);
check('the cue counter does survive', saveRoundTrip.seqOnLoad === 9, `seq=${saveRoundTrip.seqOnLoad}`);
check('and the mid-decision prompt is still dropped', saveRoundTrip.promptDropped);

if (rendered.pageHeld) {
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} else if (errors.length > 0) {
  console.log(`CHECK: ${errors.length} console error(s), all downstream of the reload — not counted.`);
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: every invasion announces its landing and its result, and each is paid once'
  : 'FAIL: the invasion lifecycle does not hold');
process.exit(failed.length === 0 ? 0 : 1);
