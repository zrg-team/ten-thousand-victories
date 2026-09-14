/**
 * The first three minutes, timed on the clock the player is actually on.
 *
 * A review asked for a specific promise: inside about three minutes a new player should have met
 * a power draft and a Chronicle line, and should be able to say one true sentence about Ambition.
 * This measures whether they do.
 *
 * **Wall clock, not game seconds.** The two are nowhere near each other and only one of them is
 * the player's. Every card stops the world while it is on screen, and the opening is dense with
 * cards, so three minutes at the wheel is only about a minute of realm time — measured, turn 11
 * to turn 23 depending on the seed. A harness that answered instantly would report a game the
 * player never gets to play, so this one reads each card for `--read` milliseconds (twice that
 * for the founder, which is a page of choices) before answering it, and every timestamp below is
 * seconds since the page started loading.
 *
 * It prints; it does not assert. `verify/verify-first-minutes.mjs` is the gate.
 *
 * Usage: node test_scripts/playtest/playtest-first-minutes.mjs [--seeds 1,2,3] [--read 5000] [--window 180000]
 */
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const BASE = process.env.PLAYTEST_URL ?? process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const SEEDS = String(arg('seeds', '424242,20260901,88881')).split(',').map(Number);
const READ_MS = Number(arg('read', 5000));
const WINDOW_MS = Number(arg('window', 180000));

/** What the review asked to happen inside the window, in the order a player would meet them. */
const MILESTONES = [
  ['first card', 'the game asks the player something'],
  ['first real choice', 'a card with more than one thing that can be pressed'],
  ['first power draft', 'the mode\'s signature reward, offered'],
  ['first chronicle line', 'a story says something about the realm'],
  ['first fight', 'a wave lands and there is a battle to watch'],
];

/** Option ids per prompt kind — kept in step with `AscentResolver.resolveAscentPrompt`. */
const OPTIONS = `
window.__fmOptions = (p) => {
  switch (p.kind) {
    case 'founder': case 'mandate': case 'doctrine': return p.options;
    case 'power-draft': return [...p.cards, 'skip'];
    case 'conquer-target': return [...p.targets.filter((t) => t.methods.some((m) => !m.blockedReason)).map((t) => t.landId), 'hold'];
    // A player told an attempt failed backs out rather than tapping the identical option again.
    case 'conquer-method': return p.notice
      ? ['back']
      : [...p.target.methods.filter((m) => !m.blockedReason).map((m) => m.method), 'back'];
    case 'hero-choice': return [...p.heroIds, 'pass'];
    case 'court-appointment': return p.options.filter((o) => !o.blockedReason).map((o) => o.id);
    case 'law-choice': return [...p.projectIds.map((i) => 'edict:' + i), ...p.taxOptions.map((t) => 'tax:' + t), 'hold'];
    case 'muster-proposal': return ['accept', 'adjust', 'decline'];
    case 'decree-offer': return [...p.projectIds, 'decline'];
    case 'empire-response': return p.options.map((o) => o.id);
    case 'envoy': // The province card: take the free, permanent lever where there is one —
    case 'envoy': // posting a champion spends the one person the court has.
    // An array like every other case: the caller indexes [0], and a bare id string indexed [0]
    // is its first letter — an answer the resolver refuses, leaving the card up for ever.
    case 'province-order': return [(p.options.find((o) => o.role === 'focus') ?? p.options[0]).id];
    case 'envoy': case 'famine': case 'rival-demand': case 'story-beat': case 'world-event':
      return (p.options ?? []).filter((o) => o.affordable !== false).map((o) => o.id);
    default: return ['ok'];
  }
};
`;

/**
 * A reload wipes the run.
 *
 * Vite's dev server watches the whole repository, so writing *any* file while a harness is
 * mid-flight full-reloads the page under it and `window.__mandateState` goes undefined. That
 * used to surface as an uncaught TypeError several frames later with nothing pointing at the
 * cause. Named, and bailed on, so the reading is discarded rather than reported as a game that
 * suddenly had no state.
 */
async function playOneRun(browser, seed) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 140)}`); });

  const t0 = Date.now();
  const at = () => (Date.now() - t0) / 1000;
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
    && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });
  const menuAt = at();
  await page.evaluate((s) => window.__startBenchGame(s, 'ascent', 'v1'), seed);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 40000 });
  const runAt = at();
  await page.evaluate(OPTIONS);
  await page.evaluate(async () => {
    window.__fmRes = await import('/src/systems/ascent/AscentResolver.ts');
  });

  const read = () => page.evaluate(() => {
    const st = window.__mandateState;
    if (!st) return null;
    const a = st.ascent ?? {};
    const p = st.pendingAscentPrompt;
    return {
      kind: p?.kind ?? null,
      // How many things on this card can actually be pressed. One is not a decision.
      pressable: p ? (window.__fmOptions(p) ?? []).length : 0,
      // A Chronicle line is a whisper in the header strip; it is logged with the story it came
      // from, which is what tells it apart from every other notice the realm posts.
      chronicleLines: (st.eventLog ?? []).filter((e) => e.ref?.storyId).length,
      seconds: +(st.realtimeSeconds ?? 0).toFixed(1),
      turn: st.turn, level: a.level, levelUps: a.pendingLevelUps ?? 0,
      wave: a.wave, ambition: Math.round(a.ambition ?? 0),
      inBattle: Boolean(a.activeBattle),
      lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
      defeated: st.isDefeated,
    };
  });

  const marks = {};
  const mark = (name, when) => { if (marks[name] === undefined) marks[name] = when; };
  const timeline = [];
  let shownAt = null;
  let showing = null;
  let cards = 0;

  while (Date.now() - t0 < WINDOW_MS) {
    const now = await read();
    if (!now) { timeline.push({ at: at(), what: 'the page reloaded — reading abandoned' }); break; }
    if (now.defeated) { timeline.push({ at: at(), what: 'defeated' }); break; }
    if (now.chronicleLines > 0) mark('first chronicle line', at());
    if (now.inBattle) mark('first fight', at());

    if (now.kind && now.kind !== showing) {
      showing = now.kind;
      shownAt = Date.now();
      cards += 1;
      mark('first card', at());
      if (now.pressable > 1) mark('first real choice', at());
      if (now.kind === 'power-draft') mark('first power draft', at());
      timeline.push({ at: at(), what: `card ${now.kind}`, pressable: now.pressable, turn: now.turn });
    }

    // Read it, then answer it. The founder card is a page of biographies, not a yes/no.
    const think = showing === 'founder' ? READ_MS * 2 : READ_MS;
    if (showing && showing !== 'run-over' && Date.now() - shownAt >= think) {
      await page.evaluate(() => {
        const st = window.__mandateState;
        const p = st.pendingAscentPrompt;
        if (!p) return;
        const id = (window.__fmOptions(p) ?? [])[0];
        if (!window.__fmRes.resolveAscentPrompt(st, id)) st.pendingAscentPrompt = undefined;
        window.__phaserGame.scene.getScene('ConquestScene')?.refresh?.();
      });
      showing = null;
    }
    await page.waitForTimeout(250);
  }

  const end = (await read()) ?? { seconds: 0, turn: 0, level: 0, levelUps: 0, lands: 0, ambition: 0 };
  await page.close();
  return { seed, menuAt, runAt, marks, timeline, cards, end, errors };
}

const browser = await chromium.launch();
const runs = [];
for (const seed of SEEDS) {
  process.stdout.write(`seed ${seed} … `);
  runs.push(await playOneRun(browser, seed));
  process.stdout.write('done\n');
}
await browser.close();

const fmt = (value) => (value === undefined ? '   —  ' : `${value.toFixed(1).padStart(5)}s`);
console.log(`\nThe first ${WINDOW_MS / 1000} seconds, ${READ_MS / 1000}s of reading per card, ${SEEDS.length} seeds\n`);
console.log(`${'milestone'.padEnd(22)}${SEEDS.map((s) => String(s).padStart(11)).join('')}`);
for (const [name, why] of MILESTONES) {
  console.log(`${name.padEnd(22)}${runs.map((r) => fmt(r.marks[name]).padStart(11)).join('')}   ${why}`);
}
console.log('');
console.log(`${'cards answered'.padEnd(22)}${runs.map((r) => String(r.cards).padStart(11)).join('')}`);
console.log(`${'realm seconds lived'.padEnd(22)}${runs.map((r) => String(r.end.seconds).padStart(11)).join('')}`);
console.log(`${'season reached'.padEnd(22)}${runs.map((r) => String(r.end.turn).padStart(11)).join('')}`);
console.log(`${'level'.padEnd(22)}${runs.map((r) => String(r.end.level).padStart(11)).join('')}`);
console.log(`${'drafts still unspent'.padEnd(22)}${runs.map((r) => String(r.end.levelUps).padStart(11)).join('')}`);
console.log(`${'provinces'.padEnd(22)}${runs.map((r) => String(r.end.lands).padStart(11)).join('')}`);
console.log(`${'ambition'.padEnd(22)}${runs.map((r) => String(r.end.ambition).padStart(11)).join('')}`);

console.log('\nWhat each run met, in order:');
for (const run of runs) {
  console.log(`\n  seed ${run.seed}  (menu at ${run.menuAt.toFixed(1)}s, run at ${run.runAt.toFixed(1)}s)`);
  for (const row of run.timeline) {
    console.log(`   ${row.at.toFixed(1).padStart(6)}s  T${String(row.turn ?? '').padStart(2)}  ${row.what}`
      + `${row.pressable ? `  (${row.pressable} pressable)` : ''}`);
  }
  if (run.errors.length) console.log(`    errors: ${run.errors.slice(0, 2).join(' | ')}`);
}

console.log('\nAgainst the three-minute promise:');
for (const [name] of MILESTONES) {
  const met = runs.filter((r) => r.marks[name] !== undefined);
  const worst = met.length ? Math.max(...met.map((r) => r.marks[name])) : undefined;
  console.log(`  ${met.length}/${runs.length} seeds met "${name}"`
    + `${worst !== undefined ? `, slowest at ${worst.toFixed(1)}s` : ''}`);
}
