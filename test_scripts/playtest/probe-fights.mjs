// Are the fights the battle screen opens actually in doubt?
//
// `battle-lab` asks whether *playing* a fight beats skipping it. This asks the question one step
// earlier: of the engagements that take the screen at all, how many were ever in question? A
// screen that only ever opens on a walkover cannot be dramatic no matter how well it is tuned.
//
// Measured before this existed: median opening odds 0.12, 76% walkovers, 7% genuinely in doubt —
// because `worthWatching` waves the capital through unconditionally and the capital then musters
// the largest levy in the realm.
//
// Outcomes are read from `ascent.battleHistory`, not from the live battle: an engagement is
// cleared inside the same tick it resolves, so sampling `activeBattle` per tick only ever sees
// `fighting`. The history record is written by `finishBattle` and is the only honest source.
//
// Usage: node test_scripts/playtest/probe-fights.mjs [ticksPerRun] [runs]
//        DEV_URL=http://127.0.0.1:5199 node test_scripts/playtest/probe-fights.mjs
import { chromium } from 'playwright';

const TICKS = Number(process.argv[2] ?? 160);
const RUNS = Number(process.argv[3] ?? 6);
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260812, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });

const out = await page.evaluate(async ({ ticks, runs }) => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { armyPower } = await import('/src/systems/WarSystem.ts');
  const { ourHosts, theirHosts } = await import('/src/systems/ascent/battleMembership.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');

  const fights = [];
  let totalTicks = 0;
  let invasionsResolved = 0;

  for (let run = 0; run < runs; run += 1) {
    // Seeded per run, so a regression is reproducible and two measurements are comparable.
    let rng = (20260808 + run * 7919) >>> 0;
    Math.random = () => {
      rng = (rng + 0x6d2b79f5) | 0;
      let t = Math.imul(rng ^ (rng >>> 15), 1 | rng);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    let methodCursor = 0;
    const pick = (p) => {
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
        case 'parliament': return 'decline';
        case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        // The province card: take the free, permanent lever where there is one —
        // posting a champion spends the one person the court has.
        case 'province-order': return (p.options.find((o) => o.role === 'focus') ?? p.options[0]).id;
        case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
        case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        case 'story-beat': return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
        case 'empire-response': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        default: return 'ok';
      }
    };

    // Opening snapshots, keyed by the engagement id, merged with the history record on resolution.
    const opened = new Map();
    let seenHistory = 0;

    for (let i = 0; i < ticks; i += 1) {
      const invasionsBefore = (st.invasions ?? []).length;
      advanceAscentTick(st);
      totalTicks += 1;
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) resolveAscentPrompt(st, pick(st.pendingAscentPrompt));

      const b = st.ascent.activeBattle;
      if (b) {
        // Both currencies, because they disagree and the disagreement is the point. The rails on
        // the battle screen print *men*; the selection gate weighs *power*, which is what actually
        // decides the fight. A veteran field host of 139 reads as hopeless against 562 levies and
        // holds them for sixteen rounds.
        const powerOf = (hosts) => hosts.reduce((n, h) => n + armyPower(st, h), 0);
        const key = b.key ?? `${b.landId}:${b.invaderArmyId}`;
        let rec = opened.get(key);
        if (!rec) {
          rec = {
            run, tick: i, key,
            role: b.role ?? 'defence',
            isGreat: Boolean(b.isGreat),
            capital: b.landId === st.ascent.capitalLandId,
            ourStart: b.ourStart, theirStart: b.theirStart,
            ourPower: powerOf(ourHosts(st, b)), theirPower: powerOf(theirHosts(st, b)),
            roundsPlanned: b.totalRounds,
            reserve: b.reserve.spearmen + b.reserve.archers + b.reserve.heavyInfantry,
            ourHosts: b.ourHostCount, theirHosts: b.theirHostCount,
            terrain: b.terrainEdge,
            minOurMorale: b.ourMorale,
            // `battle.ourMorale` is whichever host is currently *the line*, and a relief column
            // arriving at full heart replaces a battered one — so that field measures the freshest
            // troops on the field, not the worst moment the defence had. The question "was the
            // line ever threatened" is about the host that was actually suffering.
            minAnyMorale: b.ourMorale,
            hostsBroken: 0,
            minOurShare: 1,
            logLines: 0,
            beatsRecorded: 0,
            rounds: 0,
            outcome: 'unresolved',
          };
          opened.set(key, rec);
          fights.push(rec);
        }
        rec.rounds = Math.max(rec.rounds, b.round);
        rec.logLines = b.log.length;
        // Nothing drains the queue headlessly, so this is every beat the fight has run.
        rec.beatsRecorded = Math.max(rec.beatsRecorded, (b.beats ?? []).length);
        rec.ourPower = Math.max(rec.ourPower, powerOf(ourHosts(st, b)));
        rec.theirPower = Math.max(rec.theirPower, powerOf(theirHosts(st, b)));
        rec.ourStart = Math.max(rec.ourStart, b.ourStart);
        rec.theirStart = Math.max(rec.theirStart, b.theirStart);
        rec.ourHosts = Math.max(rec.ourHosts, b.ourHostCount);
        rec.theirHosts = Math.max(rec.theirHosts, b.theirHostCount);
        rec.minOurMorale = Math.min(rec.minOurMorale, b.ourMorale);
        for (const h of ourHosts(st, b)) rec.minAnyMorale = Math.min(rec.minAnyMorale, h.morale);
        rec.hostsBroken = Math.max(rec.hostsBroken, (b.brokenHostIds ?? []).length);
        rec.minOurShare = Math.min(rec.minOurShare, b.ourNow / Math.max(1, b.ourStart));
      } else if ((st.invasions ?? []).length < invasionsBefore) {
        invasionsResolved += 1;
      }

      // Merge terminal outcomes off the history the moment they are written.
      const history = st.ascent.battleHistory ?? [];
      for (; seenHistory < history.length; seenHistory += 1) {
        const h = history[seenHistory];
        const rec = opened.get(h.key);
        if (!rec) continue;
        rec.outcome = h.outcome;
        rec.rounds = h.rounds;
        rec.ourEnd = h.ourEnd;
        rec.theirEnd = h.theirEnd;
        rec.levyFought = h.levyFought;
      }
      if (st.ascent.runOver) break;
    }
  }

  return { fights, totalTicks, invasionsResolved, runs };
}, { ticks: TICKS, runs: RUNS });

await browser.close();

const f = out.fights;
if (f.length === 0) {
  console.log('FAIL  no watched engagement opened at all — the gate is admitting nothing');
  process.exit(0);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (n, d) => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;
/** What the rails print: bodies against bodies. */
const odds = (x) => x.theirStart / Math.max(1, x.ourStart);
/** What the gate weighs, and what actually predicts the result. */
const pOdds = (x) => x.theirPower / Math.max(1, x.ourPower);

/**
 * Was the fight in doubt — judged on what happened, not on the opening line-up.
 *
 * The opening-odds test was the first instrument here and it has been outgrown. It calls a fight
 * that ran sixteen of its seventeen rounds and left us at 12% strength "not in doubt", because it
 * began at 4:1 on headcount; and it calls a fight between two equal levies "in doubt" when one
 * side's walls make it a formality. Closeness is a property of the exchange, so it is measured on
 * the exchange: the fight went most of its distance, and somebody nearly broke.
 */
const wentTheDistance = (x) => x.rounds >= 0.55 * Math.max(1, x.roundsPlanned || x.rounds);
const closeFight = (x) => x.outcome !== 'unresolved'
  && wentTheDistance(x)
  && (x.minOurShare <= 0.55 || x.minOurMorale <= 55 || x.outcome === 'we-rout' || x.outcome === 'they-rout');

console.log(`═══ WATCHED FIGHTS — ${f.length} across ${out.totalTicks} ticks (${out.runs} runs) ═══\n`);
console.log('run  tick  role      great cap  ourStart theirStart  odds pOdds  rounds outcome     minOurs% minMorale close');
for (const x of f) {
  console.log(
    `${String(x.run).padStart(3)}${String(x.tick).padStart(6)}  ${String(x.role).padEnd(9)} `
    + `${x.isGreat ? 'Y' : '.'}     ${x.capital ? 'Y' : '.'}   ${String(x.ourStart).padStart(8)}${String(x.theirStart).padStart(11)}`
    + `${odds(x).toFixed(2).padStart(6)}${pOdds(x).toFixed(2).padStart(6)}${String(x.rounds).padStart(8)} ${String(x.outcome).padEnd(11)}`
    + `${(x.minOurShare * 100).toFixed(0).padStart(8)}${Math.round(x.minOurMorale).toString().padStart(10)}`
    + `${(closeFight(x) ? 'Y' : '.').padStart(6)}`);
}

const ratios = f.map(odds).sort((a, b) => a - b);
const median = ratios[Math.floor(ratios.length / 2)];
const inBand = ratios.filter((r) => r >= 0.6 && r <= 1.8).length;
const pRatios = f.map(pOdds).sort((a, b) => a - b);
const pMedian = pRatios[Math.floor(pRatios.length / 2)];
const pInBand = pRatios.filter((r) => r >= 0.6 && r <= 1.8).length;
// The band is a rule about *ordinary* defences. A Great Invasion is admitted on a floor with no
// ceiling on purpose — the fight the run turns on has to be watchable even when it is being lost —
// so scoring greats against a ceiling they are exempt from measures the exemption, not the gate.
const ordinary = f.filter((x) => !x.isGreat);
const ordInBand = ordinary.filter((x) => pOdds(x) >= 0.6 && pOdds(x) <= 1.8).length;
const close = f.filter(closeFight).length;
const walkover = ratios.filter((r) => r < 0.35).length;
const perRun = f.length / out.runs;
const lowMorale = mean(f.map((x) => x.minOurMorale));
const lowAny = mean(f.map((x) => x.minAnyMorale));
const brokeSomething = f.filter((x) => x.hostsBroken > 0).length;
const byOutcome = (o) => f.filter((x) => x.outcome === o).length;

console.log('\n── SUMMARY ──');
console.log(`fights per run            ${perRun.toFixed(1)}`);
console.log(`median opening odds       ${median.toFixed(2)}   (theirs ÷ ours)`);
console.log(`median power odds         ${pMedian.toFixed(2)}   (what the gate weighs)`);
console.log(`opening line-up in band   ${pct(inBand, f.length)} by men, ${pct(pInBand, f.length)} by power   (0.6 to 1.8)`);
console.log(`fights that were close    ${pct(close, f.length)}   (went the distance and somebody nearly broke)`);
console.log(`walkovers                 ${pct(walkover, f.length)}   (theirs < 35% of ours)`);
console.log(`outcome                   they-rout ${pct(byOutcome('they-rout'), f.length)}  we-rout ${pct(byOutcome('we-rout'), f.length)}  spent ${pct(byOutcome('spent'), f.length)}  retreat ${pct(byOutcome('retreat'), f.length)}`);
console.log(`mean rounds               ${mean(f.map((x) => x.rounds)).toFixed(1)}`);
console.log(`mean lowest line morale   ${lowMorale.toFixed(0)}   (the host holding the line, refreshed by relief)`);
console.log(`mean lowest any-host heart ${lowAny.toFixed(0)}   (the worst moment the defence had — rout threshold 32)`);
console.log(`fights where a host broke ${pct(brokeSomething, f.length)}`);
console.log(`mean columns              ours ${mean(f.map((x) => x.ourHosts)).toFixed(1)}  theirs ${mean(f.map((x) => x.theirHosts)).toFixed(1)}   (focus is a no-op at 1)`);
console.log(`mean log lines written    ${mean(f.map((x) => x.logLines)).toFixed(0)}`);
console.log(`mean beats recorded       ${mean(f.map((x) => x.beatsRecorded)).toFixed(0)}   (what the beat buffer has to replay)`);
console.log(`on the capital            ${pct(f.filter((x) => x.capital).length, f.length)}`);
console.log(`invasions resolved unseen ${out.invasionsResolved}   (approximate — counts invasion records leaving the map)`);

console.log('\n── TARGETS ──');
const line = (ok, label, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} ${detail}`);
line(median >= 0.7 && median <= 1.4, 'median opening odds in 0.7-1.4', median.toFixed(2));
line(close / f.length >= 0.6, 'at least 60% were close fights', pct(close, f.length));
line(ordInBand / Math.max(1, ordinary.length) >= 0.6, 'ordinary defences open in band on power',
  `${pct(ordInBand, ordinary.length)} of ${ordinary.length}   (greats are uncapped by design: ${pct(pInBand, f.length)} overall)`);
line(walkover / f.length <= 0.15, 'at most 15% walkovers', pct(walkover, f.length));
line(perRun >= 4 && perRun <= 6, 'four to six fights per run', perRun.toFixed(1));
line(lowAny <= 50, 'the line is actually threatened (worst host heart <= 50)', lowAny.toFixed(0));
// Every exchange writes a beat, and the approach writes more on top, so the queue can never hold
// fewer entries than the fight had rounds. An absolute threshold would only measure fight length.
const beatsMean = mean(f.map((x) => x.beatsRecorded));
const roundsMean = mean(f.map((x) => x.rounds));
const missed = f.filter((x) => x.beatsRecorded < x.rounds).length;
line(missed === 0, 'the beat buffer misses no exchange',
  `${beatsMean.toFixed(0)} beats vs ${roundsMean.toFixed(0)} rounds, ${missed} short`);
// At most one per run: the engagement still on the field when the tick budget ran out cannot
// have written a history record yet, and failing on that would be failing on the clock.
const unresolved = f.filter((x) => x.outcome === 'unresolved').length;
line(unresolved <= out.runs, 'every finished fight resolved into battleHistory',
  `${unresolved} unresolved, ${out.runs} runs`);

console.log(`\nconsole errors: ${errors.length ? errors.slice(0, 3).join(' ; ') : 'none'}`);
