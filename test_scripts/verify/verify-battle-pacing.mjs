// Does the fight move on screen, or does it jump?
//
// The simulation resolves BATTLE_BEATS_PER_TICK beats in one burst on the economy tick and always
// will — it is deterministic, every harness drives it, and re-timing it would move the RNG order
// for every mode. So the question is not how fast the fight runs, it is how many distinct moments
// a watching player is shown.
//
// Measured before the beat buffer existed: a whole engagement arrived in four or five steps with
// 3,500 ms of unchanged picture between them. This drives the real scenes in real time and samples
// what the view is actually showing, so it measures the screen rather than the model.
//
// Usage: node test_scripts/verify/verify-battle-pacing.mjs [watchSeconds]
//        DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-battle-pacing.mjs
import { chromium } from 'playwright';

const WATCH_MS = Number(process.argv[2] ?? 20) * 1000;
// One beat, plus the deliberate hold on contact and on a host breaking, plus a frame of slack.
// The hit-stop is the screen *choosing* to sit still for 110ms; scoring it as a stall would be
// grading a feature as a fault. See `BATTLE_HIT_STOP_MS`.
//
// 875 is the NORMAL speed profile's beat (`battleOptions` SPEED.normal.tickMs) — the budget was
// written as 560 when that was `BATTLE_TICK_MS`, and slept through the speed-dial rework: at an
// 875ms cadence a perfectly regular screen showed fourteen "stalls" a fight while the actual
// regression (whole ticks of dead air at the opening and after every Moment) hid inside them.
const BEAT_MS = 875;
const GAP_BUDGET = BEAT_MS + 110 + 90;
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const browser = await chromium.launch();
// GAME_HEIGHT is derived from the aspect and clamps as low as 620, so the short screen is a real
// device and not a hypothetical. HEIGHT=620 is the layout's worst case.
const page = await browser.newPage({ viewport: { width: 390, height: Number(process.env.HEIGHT ?? 844) } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260812, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(600);

// Drive the world forward until an engagement opens, exactly as `shot-battle-open` does.
const opened = await page.evaluate(async () => {
  const st = window.__mandateState;
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  const first = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': return 'decline';
      default: {
        const opts = p.options ?? [];
        return opts.length ? (opts.find((o) => o.affordable) ?? opts[0]).id : 'ok';
      }
    }
  };
  for (let tick = 0; tick < 140; tick += 1) {
    advanceAscentTick(st);
    world.refresh();
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 10) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
    ui.events.emit('state-changed');
    // Any engagement is not enough: a levy brushed aside in two beats gives nothing to time.
    // Pacing is measured on a fight with a fight in it, which is a harness choice, not a gate —
    // whether such fights are common at all is `probe-fights`' question, not this one.
    // A fight that finished earlier leaves its Reckoning waiting, and the card holds the world
    // when the screen opens it. A watching player reads it and taps on; a harness that does not is
    // measuring its own inattention, exactly as it would by ignoring a prompt.
    if (st.ascent.pendingAftermath) st.ascent.pendingAftermath = undefined;
    const b = st.ascent.activeBattle;
    if (b && b.ourStart >= 200 && b.theirStart >= 200) return true;
  }
  return false;
});

if (!opened) {
  console.log('FAIL  no engagement opened in 140 ticks — nothing to measure');
  await browser.close();
  process.exit(0);
}

// Release the opening hold so the world runs, then watch. Sampling is done in the page on a
// rAF loop: what matters is when the *picture* changes, not when the model does.
await page.evaluate(async () => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  // A card raised mid-fight pauses the world, and a harness that never answers one measures its
  // own inattention rather than the screen's pacing. Answer them the way a watching player would.
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  // Release the opening hold the way the first tap does. Emitting the order alone is not enough:
  // `releaseBattleHold` runs in the tap handler, and without it `isStrategyPause` stays set and
  // the world — and therefore the fight — never advances.
  ui.battleAwaitingOrder = false;
  window.__mandateState.isStrategyPause = false;
  ui.events.emit('ui:battle-order', 'stance:defend');
  window.__paceSamples = [];
  let lastKey = '';
  const tick = () => {
    const st = window.__mandateState;
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 6) {
      const p = st.pendingAscentPrompt;
      const opts = p.options ?? [];
      const answer = p.kind === 'power-draft' ? (p.cards?.[0] ?? 'skip')
        : p.kind === 'hero-choice' ? (p.heroIds?.[0] ?? 'pass')
          : opts.length ? (opts.find((o) => o.affordable) ?? opts[0]).id : 'ok';
      resolveAscentPrompt(st, answer);
      // The battle lane is closed while a card is up and reopened by `refresh`. Answering the
      // prompt without this leaves the lane shut and its clock dead, which is a harness bug and
      // not a product one — the real UI emits this on every choice.
      ui.events.emit('state-changed');
    }
    // Same during the watch: the fight can end and its card come up while the clock is running.
    //
    // Dismissed through the screen's own handler rather than by clearing the field. Clearing it
    // leaves the lane holding the modal layer with `isStrategyPause` still set, and the harness
    // then measures a world that is not running — measured, two distinct pictures in fourteen
    // seconds with the fight reported as still live.
    if (ui.openPromptKey === 'lane:aftermath') ui.dismissAftermath();
    else if (st.ascent?.pendingAftermath) st.ascent.pendingAftermath = undefined;
    const battle = st.ascent?.activeBattle;
    const shown = ui.battleUi?.shown;
    // The frame identity: what a viewer could actually tell apart.
    const key = shown
      ? `b:${shown.round}:${Math.round(shown.ourNow)}:${Math.round(shown.theirNow)}:${shown.ourAdvance.toFixed(3)}`
      : battle
        ? `l:${battle.round}:${Math.round(battle.ourNow)}:${Math.round(battle.theirNow)}:${battle.ourAdvance.toFixed(3)}`
        : 'none';
    if (key !== lastKey) {
      lastKey = key;
      window.__paceSamples.push({ t: performance.now(), key, queued: battle?.beats?.length ?? 0 });
    }

    if (window.__paceWatching) requestAnimationFrame(tick);
  };
  window.__paceWatching = true;
  requestAnimationFrame(tick);

  // A fixed-interval trace beside the change log: when the picture stops moving, this is what
  // says whether the world was paused, the queue was dry, or the clock had stopped.
  window.__paceTrace = [];
  window.__paceTraceTimer = setInterval(() => {
    const st2 = window.__mandateState;
    const b2 = st2.ascent?.activeBattle;
    window.__paceTrace.push({
      t: Math.round(performance.now()),
      paused: Boolean(st2.isPaused), strat: Boolean(st2.isStrategyPause),
      prompt: st2.pendingAscentPrompt?.kind ?? '-',
      queued: b2?.beats?.length ?? -1,
      turn: st2.turn,
      logLen: b2?.log?.length ?? -1,
      adv: b2 ? Number((b2.ourAdvance + b2.theirAdvance).toFixed(2)) : -1,
      round: b2?.round ?? -1,
      over: b2 ? Boolean(b2.over) : null,
      key: b2?.key ?? '-',
      clock: Boolean(ui.battleClock),
    });
  }, 100);
});

await page.waitForTimeout(WATCH_MS);

const out = await page.evaluate(() => {
  window.__paceWatching = false;
  clearInterval(window.__paceTraceTimer);
  const s = window.__paceSamples ?? [];
  const gaps = [];
  for (let i = 1; i < s.length; i += 1) gaps.push(s[i].t - s[i - 1].t);
  return {
    steps: s.length,
    gaps,
    samples: s,
    maxQueued: s.reduce((m, x) => Math.max(m, x.queued), 0),
    spanMs: s.length > 1 ? s[s.length - 1].t - s[0].t : 0,
    stillFighting: Boolean(window.__mandateState.ascent?.activeBattle),
    trace: window.__paceTrace ?? [],
  };
});

// Proof by picture as well as by number: SHOT=1 leaves a frame from the middle of the fight,
// which is the only way to see that the ribbon, the floaters and the pips are really there.
if (process.env.SHOT) {
  const { mkdirSync } = await import('node:fs');
  mkdirSync('output/web-game', { recursive: true });
  // A card can be over the fight at the instant the watch ends, and a screenshot of a prompt
  // proves nothing about the battle screen. Wait for the lane to own the screen again.
  await page.waitForFunction(
    () => window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey === 'lane:battle',
    null, { timeout: 20000 },
  ).catch(() => console.log('NOTE  battle lane never regained the screen — shot may show a prompt'));
  await page.screenshot({ path: `output/web-game/battle-midfight${process.env.HEIGHT ? `-${process.env.HEIGHT}` : ''}.png` });
}

await browser.close();

// A gap is only the replay's fault if there was a beat in hand to show when the last one went up.
// The queue empties for a moment at the end of every economy tick by design — 6 beats at 560ms
// is 3.36s against a 3.5s tick — and waiting there is the simulation's cadence, not the screen's.
const fed = [];
for (let i = 1; i < out.samples.length; i += 1) {
  if (out.samples[i - 1].queued > 0) fed.push(out.samples[i].t - out.samples[i - 1].t);
}
const gaps = fed.filter((g) => g > 1);
const longest = gaps.length ? Math.max(...gaps) : Infinity;
const median = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : Infinity;
const perSecond = out.spanMs > 0 ? (out.steps / (out.spanMs / 1000)) : 0;

console.log(`═══ BATTLE PACING — ${(WATCH_MS / 1000).toFixed(0)}s of a live engagement ═══\n`);
console.log(`distinct pictures shown   ${out.steps}`);
console.log(`over                      ${(out.spanMs / 1000).toFixed(1)}s`);
console.log(`steps per second          ${perSecond.toFixed(2)}`);
console.log(`median gap                ${median.toFixed(0)}ms`);
console.log(`longest gap               ${longest.toFixed(0)}ms`);
console.log(`deepest queue backlog     ${out.maxQueued} beats`);
console.log(`un-starved gaps           ${gaps.map((g) => Math.round(g)).join(', ')}`);
console.log(`still fighting at the end ${out.stillFighting}`);

console.log('\n── TARGETS ──');
const line = (ok, label, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${detail}`);
// One long gap is a dropped frame in a headless browser, not a stall. A screen that genuinely
// jumps shows *many* — before the beat buffer every gap was a full economy tick.
const overBudget = gaps.filter((g) => g > GAP_BUDGET).length;
line(overBudget <= 1, `at most one gap over ${GAP_BUDGET}ms`, `${overBudget} of ${gaps.length}, longest ${longest.toFixed(0)}ms`);
line(median <= BEAT_MS + 25, 'median gap within a frame of one beat', `${median.toFixed(0)}ms of ${BEAT_MS}`);
line(gaps.length >= 4, 'enough un-starved intervals to judge', `${gaps.length} intervals`);
line(out.maxQueued <= 12, 'the view keeps up with the simulation', `${out.maxQueued} beats deep`);

console.log(`\nconsole errors: ${errors.length ? errors.slice(0, 3).join(' ; ') : 'none'}`);

if (process.env.TRACE) {
  console.log('');
  console.log('-- TRACE --');
  for (const r of out.trace) {
    console.log(`t=${String(r.t).padStart(6)} turn=${String(r.turn).padStart(3)} paused=${r.paused ? 'Y' : '.'} strat=${r.strat ? 'Y' : '.'} `
      + `queued=${String(r.queued).padStart(3)} log=${String(r.logLen).padStart(3)} adv=${String(r.adv).padStart(5)} round=${String(r.round).padStart(3)} `
      + `over=${r.over} clock=${r.clock ? 'Y' : '.'}`);
  }
}
