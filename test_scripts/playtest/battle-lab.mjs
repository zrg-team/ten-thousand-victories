// Does playing the fight screen beat skipping it?
//
// That is the only question that matters about a battle screen with a skip button, and it is
// answerable rather than a matter of taste. This runs the same engagements — identical armies,
// identical ground — under four policies and compares what each achieves:
//
//   auto           the skip button, the baseline to beat
//   always-hold    does one standing order dominate?
//   always-charge  the same question from the other side
//   reserve-*      (retired with the reserve itself — these now play as `auto`)
//   retreat-in-time  does pulling out before the break actually save men?
//   adaptive       charge when out-shot, rally at the morale trough, reserve at contact
//   general-N      the host's own commander at martial N, for the delegation question
//
// If `adaptive` cannot beat `auto`, the screen has no agency and no amount of animation will
// fix that. If `always-hold` or `always-charge` beats `adaptive`, an order dominates and the
// choice is fake.
//
// Usage: node test_scripts/playtest/battle-lab.mjs [fightsPerPolicy]
import { chromium } from 'playwright';

const FIGHTS = Number(process.argv[2] ?? 240);
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260812, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });

const out = await page.evaluate(async (fights) => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const F = await import('/src/data/ascent/formations.ts');
  const RING = F.FORMATION_RING;
  const CFG = await import('/src/game/ascentConfig.ts');
  const st = window.__mandateState;

  const mkArmy = (id, kingdomId, landId, total, archerShare, heavyShare, morale, level) => ({
    id, kingdomId, landId,
    name: id,
    units: {
      archers: Math.round(total * archerShare),
      heavyInfantry: Math.round(total * heavyShare),
      spearmen: total - Math.round(total * archerShare) - Math.round(total * heavyShare),
    },
    morale, supply: 90, level, experience: 0, experienceToNextLevel: 160,
    rations: 999, provisions: 999, autoDefend: false,
  });

  // A deterministic-ish spread of matchups: sometimes we out-shoot them, sometimes not,
  // sometimes we are outnumbered. A policy that only wins one shape of fight is not a policy.
  const scenarios = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < fights; i += 1) {
    scenarios.push({
      ours: 900 + Math.round(rnd() * 700),
      // Scaled against us on purpose: the player's court bonuses and the ground's
      // defensive edge both favour the defender, and at a 100% win rate no policy can
      // possibly differentiate. Contested fights are the only ones that measure anything.
      theirs: Math.round((900 + rnd() * 700) * 1.55),
      ourArch: 0.1 + rnd() * 0.45,
      theirArch: 0.1 + rnd() * 0.45,
      ourHeavy: 0.1 + rnd() * 0.25,
      theirHeavy: 0.1 + rnd() * 0.25,
    });
  }

  const land = st.lands.find((l) => l.ownerId === 'dai-viet');

  /** Sets up one engagement and returns the battle object. */
  const setup = (sc) => {
    st.armies = st.armies.filter((a) => a.id !== 'lab-us' && a.id !== 'lab-them');
    const ours = mkArmy('lab-us', 'dai-viet', land.id, sc.ours, sc.ourArch, sc.ourHeavy, 85, 2);
    const theirs = mkArmy('lab-them', 'northern-rival', land.id, sc.theirs, sc.theirArch, sc.theirHeavy, 85, 2);
    st.armies.push(ours, theirs);
    st.ascent.activeBattle = undefined;
    // The lab is an arena: exactly the two hosts that were dialled in, and nothing else.
    //
    // Without this the province turns out its walls as a levy and `worthWatching` weighs them,
    // which is fatal twice over. It refused to open a controlled 1200-against-1200 at all once the
    // capital lost its blanket exemption — the garrison made the odds a walkover on paper — and
    // when it did open, several thousand militia joined the side whose survivor share is the
    // measurement. A balance instrument cannot have a third army wander into the experiment.
    st.ascent.arena = true;
    st.ascent.lastWatchedWave = -1;
    // Once per province per wave: the lab fights the same province over and over.
    st.ascent.lastWatchedKey = undefined;
    st.pendingBattle = {
      invaderArmyId: 'lab-them', landId: land.id, landName: land.name,
      kingdomId: 'northern-rival', kingdomName: 'Lab', isGreat: true,
      attackerPower: 0, defenderPower: 0,
    };
    B.beginBattle(st);
    return st.ascent.activeBattle;
  };

  /**
   * A general's judgement, deterministically.
   *
   * `martial` is the share of beats they read correctly; on the rest they fall back to their
   * habit — hold the line, and never spend a one-shot early. Deliberately not `Math.random`:
   * the same scenario under the same commander must produce the same fight, or comparing two
   * martial values measures noise.
   */
  const readsIt = (martial, beat, sc) => {
    const h = Math.imul((beat + 1) * 2654435761 ^ Math.round(sc.ours), 2246822519) >>> 0;
    return (h % 100) < martial;
  };

  /** Runs an engagement under a policy and scores it. */
  const run = (sc, policy) => {
    const b = setup(sc);
    if (!b) return null;
    // What the host was told when the fight ended. `finishBattle` reads it to tell an ordered
    // withdrawal (stragglers rejoin) from a field simply lost (they do not).
    let decision = 'hold';
    const generalMartial = policy.startsWith('general-') ? Number(policy.slice(8)) : 0;
    if (generalMartial > 0) {
      B.delegateBattle(st, true);
      b.generalMartial = generalMartial;
    }
    // Every policy that touches a dial has to say so, or the host's own commander goes on giving
    // orders underneath it and the two fight each other over the same two controls every beat.
    // Measured with them both live: `adaptive` scored 14.6%, below `general-60`'s 33.3%, because it
    // spent the whole engagement in transit between shapes neither of them had settled on.
    //
    // `auto` is the one that must NOT: it models a player who gives no orders at all, and in that
    // fight the commander is supposed to be the one playing.
    if (policy !== 'auto' && generalMartial === 0) B.markPlayerSteered(st);

    // The stances are a tempo dial now and the ring is a *formation* — see
    // docs/phase-1/14-five-shapes-two-dials.md. `always-charge` is a host that presses whatever happens;
    // `always-loose` is one that stands in Thế Nỏ and shoots, which is where loosing went.
    if (policy === 'always-charge') B.setBattleStance(st, 'press');
    if (policy === 'always-loose') B.setBattleFormation(st, 'no');
    // Answers the shape they are walking into with one that beats it. If this does not beat every
    // fixed policy, the ring is decoration.
    const answer = (read) => {
      if (!read) return;
      const target = read.next ?? read.formation;
      const shape = RING.find((s) => F.formationBeats(s, target) && B.canFormFormation(st, s));
      if (shape && shape !== b.ourFormation && !(b.reformBeats > 0)) B.setBattleFormation(st, shape);
    };
    let guard = 0;
    while (!b.over && guard++ < 400) {
      // Fixed one-shot timings, to prove no single moment is always right.
      if (policy === 'reserve-at-contact') {
        if (b.ourAdvance + b.theirAdvance >= 1 && !b.reserveSpent) B.commitReserve?.(st);
        if (!b.rallySpent && b.ourAdvance + b.theirAdvance >= 1) B.rally(st);
      }
      if (policy === 'reserve-at-half') {
        if (b.ourNow <= b.ourStart * 0.6 && !b.reserveSpent) B.commitReserve?.(st);
        if (!b.rallySpent && b.ourMorale < 55) B.rally(st);
      }
      // Pull out before the line breaks, rather than being cut down running.
      if (policy === 'retreat-in-time') {
        if (!b.reserveSpent && b.ourAdvance + b.theirAdvance >= 1) B.commitReserve?.(st);
        // Outcome is left as `fighting` on purpose: the field was given up by choice, and that
        // is exactly the case `finishBattle` pays straggler recovery for.
        if (b.ourMorale <= CFG.BATTLE_ROUT_MORALE + 8) { decision = 'retreat'; b.over = true; break; }
      }
      // A general holding the field — the *shipped* one, not a lab-local imitation of one.
      //
      // This used to re-implement the commander here: read the telegraph on `martial`% of beats,
      // otherwise `setBattlePosture('hold')`. That measured a model, and the model was wrong in a
      // way that mattered — reverting the stance on every misread beat is worse than standing
      // still, and it was the whole reason a martial-90 commander scored fourteen points below
      // skilled play. `delegateBattle` hands the fight to `generalPlaysBeat`, so what the lab
      // reports is what a delegating player actually gets.
      if (policy === 'counter-ring') {
        answer(B.battleTelegraph(st));
        if (b.ourAdvance + b.theirAdvance >= 1) {
          if (!b.reserveSpent) B.commitReserve?.(st);
          else if (!b.rallySpent && b.ourMorale < CFG.BATTLE_ROUT_MORALE + 12) B.rally(st);
        }
      }
      if (policy === 'adaptive') {
        const ours = st.armies.find((a) => a.id === 'lab-us');
        const theirs = st.armies.find((a) => a.id === 'lab-them');
        const met = b.ourAdvance + b.theirAdvance >= 1;
        // Playing well means working *both* dials: answer the shape they are standing in, then
        // cash the matchup in with the tempo — press while the shape is ours, steady while it is
        // theirs. This is the same rule `generalPlaysBeat` uses, deliberately: `adaptive` is the
        // lab's model of *best* play, and a model that plays worse than the shipped commander
        // measures nothing. (It did, for one pass: adaptive 17.5% against general-90's 42.1%.)
        answer(B.battleTelegraph(st));
        { // the stance lock is retired — every stance answers on every beat
          const walking = (b.reformBeats > 0) || (b.theirReformBeats > 0);
          const sign = walking ? 0 : F.formationTiltSign(b.ourFormation, b.theirFormation);
          B.setBattleStance(st, sign > 0 && met ? 'press'
            : sign < 0 || b.ourMorale < CFG.BATTLE_ROUT_MORALE + 20 ? 'defend'
              : 'balanced');
        }
        if (met) {
          if (!b.reserveSpent) B.commitReserve?.(st);
          else if (!b.rallySpent && b.ourMorale < CFG.BATTLE_ROUT_MORALE + 12) B.rally(st);
        }
      }
      B.fightRound(st);
    }

    if (decision !== 'retreat') decision = b.stance === 'press' ? 'press' : 'hold';
    const outcome = b.outcome;
    const startedWith = b.ourStart;
    const beats = b.round;

    // The real consequence path, rather than a hand-mirrored approximation of it.
    //
    // This used to be skipped because `finishBattle` resolves invasions and province captures
    // too — but `resolveBattleRecord` returns early when `state.invasions` holds no record for
    // the invader, and the lab keeps none for `lab-them`. So the reserve return, the rout bleed
    // and, crucially, `BATTLE_WITHDRAW_RECOVERY` all run for real, and nothing downstream moves.
    //
    // Without this the lab could not see straggler recovery at all, and reported that retreating
    // in time *cost* men (44.2% against 49.9%) — the exact opposite of what the game does.
    B.finishBattle(st, decision);

    const ours = st.armies.find((a) => a.id === 'lab-us');
    const theirs = st.armies.find((a) => a.id === 'lab-them');
    const ourLeft = ours ? ours.units.spearmen + ours.units.archers + ours.units.heavyInfantry : 0;
    const theirLeft = theirs ? theirs.units.spearmen + theirs.units.archers + theirs.units.heavyInfantry : 0;
    return {
      won: outcome === 'they-rout' || (outcome === 'spent' && ourLeft > theirLeft),
      routed: outcome === 'they-rout' || outcome === 'we-rout',
      weRouted: outcome === 'we-rout',
      beats,
      ourLeftShare: ourLeft / Math.max(1, startedWith),
      ratio: ourLeft / Math.max(1, theirLeft),
    };
  };

  const policies = ['auto', 'always-hold', 'always-loose', 'always-charge',
    'reserve-at-contact', 'reserve-at-half', 'retreat-in-time', 'adaptive',
    // Handing the fight to the host's general. Delegation must be viable and worse: if a great
    // commander is as good as playing, the screen has no reason to exist; if he is hopeless,
    // the appointment system has none.
    'counter-ring', 'general-30', 'general-60', 'general-90'];
  const results = {};
  for (const policy of policies) {
    const rows = scenarios.map((sc) => run(sc, policy)).filter(Boolean);
    const n = rows.length || 1;
    results[policy] = {
      n: rows.length,
      winRate: rows.filter((r) => r.won).length / n,
      routRate: rows.filter((r) => r.routed).length / n,
      weRoutedRate: rows.filter((r) => r.weRouted).length / n,
      survivors: rows.reduce((s, r) => s + r.ourLeftShare, 0) / n,
      beats: rows.reduce((s, r) => s + r.beats, 0) / n,
    };
  }

  // Composition: does bringing bowmen actually pay?
  const compo = (ourArch, theirArch) => {
    const rows = [];
    for (let i = 0; i < 90; i += 1) {
      // A controlled experiment, deliberately unlike the contested scenarios above: equal
      // numbers, and no tempo orders. Measuring this under `adaptive` hid the effect entirely,
      // because charging when out-shot is exactly how a good player *counters* enemy archers —
      // the policy was cancelling the very thing being measured.
      //
      // `counter-ring`, not `always-hold`, since the 2026-09-04 retune: with the tilt at 0.40 and
      // the counter drip at 0.7 a host that never re-forms is answered inside the invader's
      // hesitation and breaks in ~19 beats whatever it is made of (measured: 5.5% vs 7.9%
      // survivors, the arms invisible). Keeping the shapes answered holds the ring even, so what
      // is left to decide the exchange is the composition — the thing this asks about.
      rows.push(run({ ours: 1200, theirs: 1200, ourArch, theirArch, ourHeavy: 0.15, theirHeavy: 0.15 }, 'counter-ring'));
    }
    // Survivor share, not win rate. Win rate is binary and the window where a 1200-strong host
    // sometimes-but-not-always beats a 1500-strong one is too narrow to read anything from:
    // both compositions won at 1500 and both lost at 1860. How many men come home is continuous
    // and answers the actual question — does bringing bowmen pay?
    return rows.reduce((sum, r) => sum + r.ourLeftShare, 0) / rows.length;
  };

  // Each fixed stance against each doctrine.
  //
  // "No stance dominates" cannot be measured against a single opponent: the lab's default enemy
  // is aggressive and therefore always charges, so loosing is always countered and scores zero
  // no matter how it is tuned. A ring is non-dominant when each stance is the best answer to
  // *something* — which is a grid, not a number.
  const kingdomForGrid = st.kingdoms.find((k) => k.id === 'northern-rival');
  const originalForGrid = kingdomForGrid.personality;
  //
  // The doctrine alone does not cover the ring. `enemyPosture` sends a cautious power to `loose`
  // whenever its bow share clears 0.22-0.30 and to `hold` only below that, and every scenario in
  // the list arms the enemy with archers — so the enemy never braced, so Loose (which is the
  // answer to a brace) was the best stance against nothing at all, and scored a flat 0%. That is
  // not a dominance result, it is an arm of the ring that the experiment could not reach.
  //
  // So the grid varies the enemy's bows as well as its doctrine. A crossbow-poor cautious power
  // stands and braces, which is the cell Loose is for.
  const grid = {};
  const gridCases = [
    { name: 'aggressive', personality: 'aggressive', bows: null },
    { name: 'defensive', personality: 'defensive', bows: null },
    { name: 'economic', personality: 'economic', bows: null },
    { name: 'defensive/no-bows', personality: 'defensive', bows: 0.05 },
    { name: 'economic/no-bows', personality: 'economic', bows: 0.05 },
  ];
  for (const gc of gridCases) {
    kingdomForGrid.personality = gc.personality;
    grid[gc.name] = {};
    for (const stance of ['always-hold', 'always-loose', 'always-charge']) {
      const rows = scenarios.slice(0, 90)
        .map((sc) => run(gc.bows === null ? sc : { ...sc, theirArch: gc.bows }, stance))
        .filter(Boolean);
      grid[gc.name][stance] = rows.filter((r) => r.won).length / rows.length;
    }
  }
  kingdomForGrid.personality = originalForGrid;

  // The same fight against different opponents. If these do not differ, the doctrine layer is
  // decoration.
  const kingdom = st.kingdoms.find((k) => k.id === 'northern-rival');
  const original = kingdom.personality;
  const byDoctrine = {};
  for (const personality of ['aggressive', 'defensive', 'economic']) {
    kingdom.personality = personality;
    const rows = scenarios.slice(0, 100).map((sc) => run(sc, 'adaptive')).filter(Boolean);
    byDoctrine[personality] = rows.filter((r) => r.won).length / rows.length;
  }
  kingdom.personality = original;

  return {
    results,
    grid,
    byDoctrine,
    archerHeavyWins: compo(0.5, 0.12),
    archerLightWins: compo(0.12, 0.5),
    // Every clock the pacing question needs. `BATTLE_TICK_MS` alone is not one of them: it is
    // the screen's poll rate, and the fight is delivered six beats at a time on the economy tick.
    tickMs: CFG.BATTLE_TICK_MS,
    beatsPerTick: CFG.BATTLE_BEATS_PER_TICK,
    ascentTickMs: CFG.ASCENT_TICK_MS,
  };
}, FIGHTS);

await browser.close();

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const R = out.results;
console.log(`═══ BATTLE LAB — ${R.auto.n} engagements per policy ═══\n`);
console.log('policy          win rate   rout rate   we routed   survivors   beats');
for (const [name, r] of Object.entries(R)) {
  console.log(
    `${name.padEnd(14)} ${pct(r.winRate).padStart(8)} ${pct(r.routRate).padStart(11)} `
    + `${pct(r.weRoutedRate).padStart(11)} ${pct(r.survivors).padStart(11)} ${r.beats.toFixed(1).padStart(7)}`);
}

const edge = R.adaptive.winRate - R.auto.winRate;
const bestFixed = Math.max(R['always-hold'].winRate, R['always-loose'].winRate, R['always-charge'].winRate);
const worstFixed = Math.min(R['always-hold'].winRate, R['always-loose'].winRate, R['always-charge'].winRate);
// How long a fight actually takes, and how much of it anyone can see.
//
// This used to be `beats x BATTLE_TICK_MS`, which is the screen's *poll* rate — a clock nothing
// drives the fight with. `advanceBattle` runs BEATS_PER_TICK beats in one burst on the economy
// tick, so the wall clock is set by ASCENT_TICK_MS and the number of moments a player can see is
// the number of bursts, not the number of beats.
const seconds = (R.adaptive.beats / out.beatsPerTick) * out.ascentTickMs / 1000;
const stepsToday = Math.ceil(R.adaptive.beats / out.beatsPerTick);
const gapToday = out.ascentTickMs;
const stepsBuffered = Math.round(R.adaptive.beats);

console.log('\n── TARGETS ──');
const line = (ok, label, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${detail}`);
line(edge >= 0.15, 'playing beats skipping (adaptive - auto >= 15pt)', `${(edge * 100).toFixed(1)} pts`);
line(R.adaptive.winRate >= bestFixed, 'no single order beats playing well', `adaptive ${pct(R.adaptive.winRate)} vs best fixed ${pct(bestFixed)}`);
console.log('\n-- THE RING, against each doctrine --');
console.log('doctrine        brace    loose   charge   best');
const stanceNames = { 'always-hold': 'brace', 'always-loose': 'loose', 'always-charge': 'charge' };
const winners = [];
for (const [personality, row] of Object.entries(out.grid)) {
  const best = Object.entries(row).sort((x, y) => y[1] - x[1])[0];
  winners.push(stanceNames[best[0]]);
  console.log(
    `${personality.padEnd(14)} ${pct(row['always-hold']).padStart(6)} ${pct(row['always-loose']).padStart(8)} `
    + `${pct(row['always-charge']).padStart(8)}   ${stanceNames[best[0]]}`);
}
const distinctWinners = new Set(winners).size;
line(distinctWinners >= 2, 'no one stance is the answer to every doctrine',
  `${winners.join(', ')} — ${distinctWinners} distinct`);
void worstFixed;
// What the label always claimed, finally measured.
//
// This used to assert `bestFixed - worstFixed <= 0.45` — the spread between the best and worst
// fixed stance against the *default* enemy — and reported it as "every stance is worth taking
// somewhere". Those are different statements, and the gap showed: it passed while Loose won 0.0%
// of its fights, because 0.0% and 35.5% are less than forty-five points apart. A stance is worth
// taking when it is the best answer to some opponent, which is a question about the grid.
const stanceWins = { 'always-hold': 0, 'always-loose': 0, 'always-charge': 0 };
for (const row of Object.values(out.grid)) {
  stanceWins[Object.entries(row).sort((x, y) => y[1] - x[1])[0][0]] += 1;
}
line(Object.values(stanceWins).every((n) => n > 0), 'every stance is the best answer to something',
  `brace wins ${stanceWins['always-hold']} cells / loose ${stanceWins['always-loose']} / charge ${stanceWins['always-charge']}`);
line(R['counter-ring'].winRate - bestFixed >= 0.12, 'reading them beats any fixed stance by 12pts+',
  `${((R['counter-ring'].winRate - bestFixed) * 100).toFixed(1)} pts over best fixed`);
// Both retired targets described the fight before 787132f. A fight ends only when a line breaks
// now — the `spent` outcome was the failure that pass removed, so 100% routs is the design and
// not a defect — and the same pass set the fight at about a minute on the user's own words
// ("15-20 s is no game feeling at all"). What is still worth holding: that the decision goes
// the player's way often enough, which the win-rate band below already asks, and that the
// minute the user asked for is still a minute.
line(seconds >= 45 && seconds <= 80, 'a fight lasts about a minute (45-80s, per 787132f)', `${seconds.toFixed(1)}s`);
// Retired: two proxies that describe the world before the beat buffer existed.
//
// `gapToday` was the literal constant `ASCENT_TICK_MS`, so "longest gap under 700ms" could never
// pass no matter what the screen did; `stepsBuffered` counted rounds and called them buffered
// beats, when the buffer records an approach beat as well as a clash. Both are now measured for
// real, on the real scenes, in real time by `verify-battle-pacing.mjs` — 574ms median gap over
// eight un-starved intervals at the last run. A proxy that contradicts a direct measurement is
// not a second opinion.
if (process.env.LEGACY_PACING) {
line(stepsBuffered >= 28 && stepsBuffered <= 45, 'the beat buffer would show 28-45 steps',
  `${stepsBuffered} beats`);
line(gapToday < 700, 'longest gap between visible updates < 700ms',
  `${gapToday}ms across ${stepsToday} visible steps today`);
}
line(out.archerHeavyWins - out.archerLightWins >= 0.06, 'archers measurably pay off (survivors)',
  `${pct(out.archerHeavyWins)} vs ${pct(out.archerLightWins)}`);

const bestTiming = Math.max(R['reserve-at-contact'].winRate, R['reserve-at-half'].winRate);
line(R.adaptive.winRate >= bestTiming, 'no fixed one-shot timing beats adaptive timing',
  `adaptive ${pct(R.adaptive.winRate)} vs best fixed ${pct(bestTiming)}`);
// Compared against `always-hold`, not `adaptive`: both mostly lose these fights, so this asks
// the actual question — when the battle is going badly, does pulling out save men? Measuring it
// against a policy that often wins outright compared a withdrawal to a victory.
//
// KNOWN LIMITATION: the lab never calls `finishBattle` (it would resolve invasions and province
// captures), so it cannot see the straggler recovery an orderly withdrawal is granted there. It
// therefore under-reports retreat, and this target should not be read as a verdict on the game
// until the harness drives a real resolution.
line(R['retreat-in-time'].survivors - R['always-hold'].survivors >= 0.06,
  'retreating in time saves men vs fighting on',
  `${pct(R['retreat-in-time'].survivors)} vs ${pct(R['always-hold'].survivors)}`);
// Delegation must be viable and worse. Both halves matter: a general as good as playing makes
// the screen pointless, and a hopeless one makes the appointment system pointless.
const gap60 = (R.adaptive.winRate - R['general-60'].winRate) * 100;
const gap90 = (R.adaptive.winRate - R['general-90'].winRate) * 100;
line(gap60 >= 8 && gap60 <= 15, 'a fair general is 8-15pts below playing well', `${gap60.toFixed(1)} pts`);
line(gap90 <= 5, 'a great general is within 5pts of playing well', `${gap90.toFixed(1)} pts`);
line(R['general-90'].winRate > R['general-30'].winRate, 'martial actually changes the outcome',
  `30 ${pct(R['general-30'].winRate)} -> 90 ${pct(R['general-90'].winRate)}`);

const doct = Object.values(out.byDoctrine);
line(Math.max(...doct) - Math.min(...doct) >= 0.10, 'enemy doctrines produce different fights',
  Object.entries(out.byDoctrine).map(([k, v]) => `${k} ${pct(v)}`).join('  '));
line(R.adaptive.winRate >= 0.35 && R.adaptive.winRate <= 0.60, 'player win rate in 35-60%',
  pct(R.adaptive.winRate));
console.log(`\nconsole errors: ${errors.length ? errors.slice(0, 3).join(' ; ') : 'none'}`);
