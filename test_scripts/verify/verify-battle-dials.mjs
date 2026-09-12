// Two dials, two clocks — and neither of them can be seen by any harness that existed before.
//
// The whole design rests on the two controls being *different kinds* of control: formation is
// instant to order and slow to complete, stance is slow to order and instant to complete and then
// holds you for four beats. If either clock is wrong the cadence collapses and the dock is two of
// the same dial again. See docs/phase-1/14-five-shapes-two-dials.md.
//
// Two fights, because a probe that spends thirty beats reading the telegraph has no fight left to
// test the dials on — measured, every dial check failed with "battle.over" rather than with
// anything about a dial.
//
// Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-battle-dials.mjs
import { chromium } from 'playwright';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'CHECK'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

/** A fresh engagement in the arena, big enough to survive being stepped through. */
async function openFight() {
  await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const s = window.__phaserGame.scene.getScene('BattleArenaScene');
    s.ourMen = 9000; s.theirMen = 9000; s.martial = 70;
    s.startFight();
  });
  await page.waitForFunction(
    () => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle',
    null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.battleAwaitingOrder = false;
    window.__mandateState.isStrategyPause = false;
  });
}

// ── fight one: the dials ─────────────────────────────────────────────────────
await openFight();
const dials = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const st = window.__mandateState;
  const b = () => st.ascent.activeBattle;
  const step = (n = 1) => { for (let i = 0; i < n; i++) if (!b().over) B.fightRound(st); };
  const out = {};

  // ── the slow dial: slow to order, instant to complete ──────────────────────
  // Steer both dials so the host's own commander leaves the probe's writes alone.
  b().steeredStance = true;
  b().steeredFormation = true;
  b().stance = 'balanced';
  b().stancePending = undefined;
  const ordered = B.setBattleStance(st, 'press');
  out.landsNextBeat = { ordered, stanceNow: b().stance, pending: b().stancePending ?? null };
  step(1);
  out.landed = { stance: b().stance };

  // The lock is retired: every stance must answer on every beat, in any order, forever. Cycle the
  // full dial back-to-back — a single refusal here is the old cage growing back.
  const cycle = ['balanced', 'defend', 'press', 'withdraw', 'defend', 'press'];
  out.stanceCycle = cycle.map((sName) => {
    const took = B.setBattleStance(st, sName);
    step(1);
    return { s: sName, took, now: b().stance };
  });

  // ── the fast dial: instant to order, slow to complete ──────────────────────
  b().stancePending = undefined;
  b().stance = 'balanced';
  b().ourFormation = 'chong';
  b().formationTarget = undefined;
  b().reformBeats = 0;
  b().stamina = 2;
  b().staminaClock = undefined;
  const window0 = B.reformBeatsFor(st, b());
  const gave = B.setBattleFormation(st, 'quy');
  out.ordered = { gave, target: b().formationTarget ?? null, beats: b().reformBeats, shapeNow: b().ourFormation };

  // Every beat of the walk, and the beat it arrives on. The host must still be in the OLD shape
  // for `window0` beats — a re-form that lands without paying the transit is a free dial.
  const transit = [];
  for (let i = 0; i < window0 + 1; i++) {
    const before = { shape: b().ourFormation, walking: (b().reformBeats ?? 0) > 0 };
    step(1);
    transit.push({ ...before, after: b().ourFormation });
  }
  out.transit = transit;
  out.window = window0;

  // The walk is one flat beat for every host — tier and commander no longer touch it. Sweep the
  // hosts through every tier/led pairing and the window must not move.
  const hosts = () => st.armies.filter((a) => (b().ourArmyIds ?? []).includes(a.id));
  const savedElite = hosts().map((h) => h.elite);
  const savedGeneral = hosts().map((h) => h.generalHeroId);
  const savedMorale = b().ourMorale;
  b().ourMorale = 80; // above the rout line, so the stumble is not what is measured
  const byTier = [];
  for (const tier of [0, 1, 2]) {
    for (const led of [false, true]) {
      hosts().forEach((h, i) => {
        h.elite = tier;
        h.generalHeroId = led ? savedGeneral[i] : undefined;
      });
      byTier.push({ tier, led, beats: B.reformBeatsFor(st, b()) });
    }
  }
  hosts().forEach((h, i) => { h.elite = savedElite[i]; h.generalHeroId = savedGeneral[i]; });
  out.byTier = byTier;

  // ...and the stumble, for a host whose heart has already gone.
  b().ourMorale = 5;
  out.brokenWindow = B.reformBeatsFor(st, b());
  b().ourMorale = savedMorale;

  // ── stamina ────────────────────────────────────────────────────────────────
  // Two pips. Two changes in a row are paid for; the third is refused until a pip returns.
  b().theirFormationTarget = undefined;
  b().theirReformBeats = 0;
  b().stamina = 2;
  b().staminaClock = undefined;
  b().formationTarget = undefined;
  b().reformBeats = 0;
  const others = ['chong', 'xung', 'tan', 'quy', 'no'].filter((f) => f !== b().ourFormation);
  const first = B.setBattleFormation(st, others[0]);
  step(1);
  const second = B.setBattleFormation(st, others[1]);
  step(1);
  const third = B.setBattleFormation(st, others[2]);
  out.spends = { first, second, third, pips: B.battleStamina(b()).pips };

  // The pip comes back on its own clock — and the stance has nothing to do with it. Both waits
  // start from a fresh clock, or the first inherits the beats the spends above already paid.
  b().stance = 'press';
  b().stancePending = undefined;
  b().stamina = 0; b().staminaClock = undefined;
  let waited = 0;
  while (B.battleStamina(b()).pips < 1 && waited < 20) { step(1); waited += 1; }
  out.regen = { beats: waited, pips: B.battleStamina(b()).pips };
  b().stance = 'defend';
  b().stamina = 0; b().staminaClock = undefined;
  let waitedDefend = 0;
  while (B.battleStamina(b()).pips < 1 && waitedDefend < 20) { step(1); waitedDefend += 1; }
  out.regenDefend = waitedDefend;
  return out;
});

// ── fight two: the telegraph ─────────────────────────────────────────────────
await openFight();
const wire = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const st = window.__mandateState;
  const b = () => st.ascent.activeBattle;
  // A telegraph that can differ from what happens teaches a rule the game does not keep.
  const promises = [];
  for (let i = 0; i < 40 && !b().over; i++) {
    const read = B.battleTelegraph(st);
    if (!read) break;
    const promised = read.next && read.beatsLeft === 1 ? read.next : null;
    B.fightRound(st);
    if (promised) promises.push({ promised, actual: b().theirFormation, beat: i });
  }
  return { promises, broken: promises.filter((p) => p.promised !== p.actual) };
});

await browser.close();

const p = dials;
check(p.landsNextBeat.ordered && p.landsNextBeat.stanceNow === 'balanced' && p.landsNextBeat.pending === 'press',
  'a stance is ordered now and lands next beat',
  `now ${p.landsNextBeat.stanceNow}, pending ${p.landsNextBeat.pending}`);
check(p.landed.stance === 'press',
  'it lands on the next beat, and arms nothing — the lock is retired',
  p.landed.stance);

check(p.stanceCycle.every((r) => r.took && r.now === r.s),
  'no stance is ever refused, on any beat, in any order',
  p.stanceCycle.map((r) => `${r.s}:${r.took ? r.now : 'REFUSED'}`).join(' '));

check(p.ordered.gave && p.ordered.shapeNow === 'chong' && p.ordered.target === 'quy',
  'a shape is ordered instantly and the host is still in the old one',
  `holding ${p.ordered.shapeNow}, walking to ${p.ordered.target}, ${p.ordered.beats} beats`);
const paid = p.transit.slice(0, p.window);
const arrival = p.transit[p.window];
check(paid.length === p.window && paid.every((s) => s.shape === 'chong' && s.walking)
  && arrival && arrival.after === 'quy',
  'the transit is paid in full before the new shape lands',
  `${p.window}-beat window · ` + p.transit.map((s) => `${s.shape}→${s.after}`).join(' '));

check(p.byTier.every((r) => r.beats === 1),
  'the walk is one flat beat for every host — tier and commander no longer touch it',
  p.byTier.map((r) => `t${r.tier}${r.led ? '+gen' : ''}:${r.beats}`).join(' '));
check(p.brokenWindow === 2, 'a host below the rout line stumbles for two', `${p.brokenWindow} beats`);

check(p.spends.first && p.spends.second && p.spends.third === false && p.spends.pips === 0,
  'two changes in a row are paid for, the third is refused — the meter is empty',
  `first ${p.spends.first}, second ${p.spends.second}, third ${p.spends.third ? 'ACCEPTED' : 'refused'}, pips ${p.spends.pips}`);
check(p.regen.pips >= 1 && p.regen.beats >= 5 && p.regen.beats <= 8,
  'a pip comes back on its own after about seven beats',
  `${p.regen.beats} beats under press`);
check(Math.abs(p.regenDefend - p.regen.beats) <= 1,
  'and the stance has nothing to do with it — the same wait under defend',
  `${p.regen.beats} beats under press, ${p.regenDefend} under defend`);

check(wire.promises.length > 0, 'the telegraph was read at least once', `${wire.promises.length} promises`);
check(wire.broken.length === 0, 'the telegraph is always what actually happens',
  wire.broken.slice(0, 3).map((b) => `beat ${b.beat}: said ${b.promised}, did ${b.actual}`).join(' | ') || 'none broken');

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) console.log('FAIL: a dial is on the wrong clock');
