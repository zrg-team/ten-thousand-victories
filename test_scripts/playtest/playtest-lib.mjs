/**
 * Shared plumbing for the playtest harnesses.
 *
 * The three playtest scripts all need the same three things — a booted run, a way to read the
 * open decision, and a way to answer it — and getting any of them subtly different would make
 * their numbers incomparable. They live here so a change to how a prompt is read lands in the
 * objective metrics, the watched session and the strategy driver at the same time.
 */

/** Dev server the harnesses drive. Override when the default port is taken. */
export const BASE_URL = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';

/**
 * Real option ids for whatever prompt is open, keyed by kind.
 *
 * Deliberately not `render_game_to_text`'s `describeAscentPromptOptions`: that helper has no
 * `famine` case and returns `['ok']`, an id nothing accepts — so a driver using it re-answers the
 * same famine card forever (measured: 561 times in six minutes) and the famine system is never
 * exercised at all. Keep this list in step with `AscentResolver.resolveAscentPrompt`.
 */
export const READ_OPTIONS = `
window.__ptOptions = (forState) => {
  // Headless sweeps hold their own state object; the watched session reads the live one.
  const st = forState || window.__mandateState;
  const p = st && st.pendingAscentPrompt;
  if (!p) return null;
  switch (p.kind) {
    // Lễ Đăng Quang. Answered with anything — the sheet writes the founder into the dynasty
    // store itself, and the resolver rolls a complete king when a driver skips through.
    case 'coronation': return ['crowned'];
    // Gia sản dòng họ. A summary with one button, so like the rite it takes any id — named
    // here rather than left on the ['ok'] fallthrough so a driver's log says which card it read.
    case 'inheritance': return ['acknowledged'];
    // Beta: the goal is won. Rule on first, so every policy keeps playing and waves stay comparable
    // with stable; verify-goal answers 'end' on purpose.
    case 'goal-won': return ['rule-on', 'end'];
    case 'founder': return p.options;
    case 'power-draft': return [...p.cards, 'skip'];
    case 'conquer-target': return [...p.targets.map((t) => t.landId), 'hold'];
    case 'conquer-method': return [...p.target.methods.filter((m) => !m.blockedReason).map((m) => m.method), 'back'];
    case 'hero-choice': return [...p.heroIds, 'pass'];
    case 'court-appointment': return p.options.map((o) => o.id);
    case 'law-choice': return [...p.projectIds.map((i) => 'edict:' + i), ...p.taxOptions.map((t) => 'tax:' + t), 'hold'];
    case 'doctrine': return [...p.options, 'hold'];
    case 'parliament': return (st.politicsDeck.find((c) => c.id === p.cardId)?.choices ?? []).map((c) => c.id);
    case 'envoy': // The province card: take the free, permanent lever where there is one —
    case 'envoy': // posting a champion spends the one person the court has.
    case 'envoy': case 'province-order': return p.options.map((o) => o.id);
    case 'envoy': case 'famine': case 'rival-demand': return p.options.filter((o) => o.affordable).map((o) => o.id);
    // The restore card: haste first, so the engaged policy pays the bill and the cost is measured.
    case 'restore-land': return p.options.filter((o) => o.affordable).map((o) => o.id);
    case 'empire-response': return p.options.map((o) => o.id);
    // **The kinds below fell through to ['ok'], which nothing accepts.**
    //
    // Same defect the game-harness notes record for describeAscentPromptOptions and famine
    // ("561 times in six minutes"), in a second file and on a card that decides the run.
    // muster-proposal is the only way a realm raises a host — autoRecruit proposes rather
    // than mustering unless autoMusterSilently is set, and AscentResolver increments
    // autopilotStats.recruits only on 'accept'. So every playtest driver has been declining
    // every muster since the card existed, and every measured run was of a realm that never
    // fields an army: ourMen reads 0 from wave 4 onward, hosts at end 0, recruits 0 across
    // every seed. The agency dimension in particular was scoring a driver that could not play.
    case 'muster-proposal': return ['accept', 'adjust', 'decline'];
    case 'mandate': return p.options;
    // The run-over ceremony: a trait id, and no skip. 'next-reign' and 'run-over' are terminal —
    // the scene's own buttons walk past them, so they stay on the ['ok'] fallthrough.
    case 'dynasty-level': return p.options;
    // Bind a seal: one of the cards the reign played, and no skip — the resolver refuses a
    // stray id, so ['ok'] here would spin the ceremony forever.
    case 'bind-card': return p.options;
    case 'decree-offer': return [...p.projectIds, 'decline'];
    // A *blow* carries no options at all — the screen shows one Continue button and the resolver
    // accepts any id for it. Returning [] here stopped every headless driver dead: the run kept
    // ticking with the card pending, no later card ever surfaced, and the wave director's
    // the empire-response sat in the queue for ever — measured on seed 55, a one-province realm
    // "held" forty waves that were never launched. That is what the 85/85 baseline was scoring.
    case 'story-beat': {
      const open = p.options.filter((o) => o.affordable).map((o) => o.id);
      return open.length ? open : ['ok'];
    }
    case 'world-event': return p.options.filter((o) => o.affordable).map((o) => o.id);
    default: return ['ok'];
  }
};
`;

/** The "decline this offer" id per prompt kind, where one exists. */
export const DECLINE = {
  doctrine: 'hold',
  'power-draft': 'skip',
  'conquer-target': 'hold',
  'conquer-method': 'back',
  'hero-choice': 'pass',
  'law-choice': 'hold',
  // "Await a command" is the appointment card's decline. Without this the declining policy took
  // the card's *last* option, which is now "let them go" — dismissing every champion it drew and
  // measuring a payroll-free realm against an engaged one.
  'court-appointment': 'reserve',
};

/** Boots a headless Dragon Ascent run on a fixed seed, inside the page. */
export const ENGINE_BOOT = `
window.__ptSeedRandom = (seed) => {
  let g = (seed >>> 0) || 1;
  Math.random = () => {
    g |= 0; g = (g + 0x6d2b79f5) | 0;
    let t = Math.imul(g ^ (g >>> 15), 1 | g);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Builds a seeded run **and leaves the seed installed**.
 *
 * It used to restore Math.random in a finally, so only world *generation* was deterministic and
 * the six hundred ticks that follow ran on the browser's real RNG. Gameplay calls bare
 * Math.random() in scores of places, so every invocation was a different run and the score this
 * file exists to produce was not reproducible: measured, three identical --seeds 16 invocations
 * returned agency ratios of 0.95, 1.08 and 1.21 and objective scores of 47.9, 49.7 and 57.6. A
 * balance change cannot be judged against a number that moves nine points on its own, and every
 * conclusion drawn from this harness -- including "engaged barely beats declining" -- was drawn
 * from noise.
 *
 * The caller owns the restore; __ptRestoreRandom puts the browser's own back.
 */
const __ptRealRandom = Math.random;
window.__ptRestoreRandom = () => { Math.random = __ptRealRandom; };
window.__ptBoot = async (seed, options = {}) => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  window.__ptSeedRandom(seed);
  // A stable run carries no ruleset field, exactly as the game's own door builds it.
  const config = { seaSides: 1, difficulty: 'normal' };
  if (options.ruleset && options.ruleset !== 'stable') config.ruleset = options.ruleset;
  return createAscentGameState(config);
};

/**
 * Wipes every meta store (dynasty, cabinet, legacy, codex, chronicle echoes, tours) and keeps the
 * language, so the next boot is a first-ever profile. Without it each run inherits what the last
 * one banked — the founder card reads the Codex the previous run wrote — and "the same seed under
 * two rulesets" is not the same world. The stores re-read storage on each call, so removing the
 * keys is enough.
 */
window.__ptFreshProfile = () => {
  const language = localStorage.getItem('mandate:language:v1');
  localStorage.clear();
  if (language) localStorage.setItem('mandate:language:v1', language);
};
`;

/** Opens a page pointed at the dev server with the harness helpers installed. */
export async function openGame(browser, { language = 'en', viewport = { width: 390, height: 844 } } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (err) => errors.push(`PAGEERROR ${err.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
  await page.addInitScript((lang) => localStorage.setItem('mandate:language:v1', lang), language);
  await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(READ_OPTIONS);
  await page.evaluate(ENGINE_BOOT);
  return { page, errors };
}

/** Starts a rendered run in the real scenes, so the UI is exercised too. */
export async function startRenderedRun(page, seed, ruleset = 'stable') {
  await page.evaluate(([s, r]) => window.__startBenchGame(s, 'ascent', r), [seed, ruleset]);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
}

/** Mean, and the spread around it, for a list of numbers. */
export function summarise(values) {
  if (!values.length) return { n: 0, mean: 0, min: 0, max: 0, cv: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return {
    n: values.length,
    mean: +mean.toFixed(2),
    min: +Math.min(...values).toFixed(2),
    max: +Math.max(...values).toFixed(2),
    // Coefficient of variation: how much the numbers vary relative to their size. The pacing
    // score reads this — a metronome scores ~0, a run with quiet and loud stretches scores high.
    cv: mean === 0 ? 0 : +(Math.sqrt(variance) / mean).toFixed(3),
  };
}

export function bar(value, max, width = 24) {
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}
