/**
 * Does the fight still ask the same three questions?
 *
 * It used to. There were three Moments, each fired at most once, and every engagement in a run
 * raised the same three in roughly the same order — so by the second fight the player was not
 * answering a question, they were dismissing a card they had already read. That is the whole of
 * the "same questions again and again" complaint.
 *
 * The deck is thirty now (`src/data/ascent/battleMoments.ts`), drawn at random from whichever are
 * true this beat. This runs a lot of real fights and reports what came out: how many distinct
 * questions were asked, what share the commonest one took, and — the one that matters most —
 * which entries never fired, because a question with an unreachable trigger is a question that
 * does not exist. Two of the old three were exactly that.
 *
 * Usage: node test_scripts/verify/verify-battle-moments.mjs [seeds] [ticks]
 * Env:   PLAYTEST_URL to point at a dev server other than 127.0.0.1:5179.
 */
import { chromium } from 'playwright';
import { BASE_URL, DECLINE, ENGINE_BOOT, READ_OPTIONS } from '../playtest/playtest-lib.mjs';

const SEEDS = Number(process.argv[2] ?? 24);
const TICKS = Number(process.argv[3] ?? 420);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const out = await page.evaluate(async ([seeds, ticks, decline]) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { answerBattleMoment } = await import('/src/systems/ascent/BattleSystem.ts');
  const { BATTLE_MOMENTS } = await import('/src/data/ascent/battleMoments.ts');

  /** Every fight's raised ids, keyed by the fight, so a fight is counted once however long it ran. */
  const byFight = new Map();
  let answered = 0;
  let lapsed = 0;

  for (let s = 0; s < seeds; s += 1) {
    const st = await window.__ptBoot(1000 + s * 7919, { ruleset: 'v1' });
    for (let tick = 0; tick < ticks; tick += 1) {
      advanceAscentTick(st);
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) {
        const prompt = st.pendingAscentPrompt;
        const options = window.__ptOptions(st) ?? ['ok'];
        // Half the runs take every province offered. A run that declines every conquest fights
        // only defences, and a third of the deck is about *coming* for somebody — measured, the
        // three assault questions fired zero times until this line existed, and the fault was in
        // the harness rather than in the deck.
        const conquering = s % 2 === 1 && (prompt.kind === 'conquer-target' || prompt.kind === 'conquer-method');
        resolveAscentPrompt(st, conquering ? options[0] : (decline[prompt.kind] ?? options[0] ?? 'ok'));
      }
      const battle = st.ascent.activeBattle;
      if (!battle) continue;
      const key = `${s}:${battle.key ?? battle.landId}`;
      byFight.set(key, [...(battle.momentIds ?? [])]);
      // Answer roughly half, so both the player's path and the general's lapse are exercised.
      if (battle.moment) {
        if ((battle.round + s) % 2 === 0) {
          answerBattleMoment(st, (battle.round + s) % 4 === 0 ? 'commit' : 'steady');
          answered += 1;
        } else {
          lapsed += 1;
        }
      }
    }
  }

  const counts = {};
  let raised = 0;
  const perFight = [];
  for (const ids of byFight.values()) {
    if (ids.length === 0) continue;
    perFight.push(ids.length);
    for (const id of ids) { counts[id] = (counts[id] ?? 0) + 1; raised += 1; }
  }
  const deck = BATTLE_MOMENTS.map((d) => d.id);
  return {
    fights: byFight.size,
    fightsWithMoments: perFight.length,
    raised,
    answered,
    lapsed,
    counts,
    deck,
    never: deck.filter((id) => !counts[id]),
    perFightMean: perFight.length ? perFight.reduce((a, b) => a + b, 0) / perFight.length : 0,
  };
}, [SEEDS, TICKS, DECLINE]);

const ranked = Object.entries(out.counts).sort((a, b) => b[1] - a[1]);
const distinct = ranked.length;
const topShare = out.raised ? ranked[0][1] / out.raised : 1;

console.log(`\n  ${SEEDS} runs x ${TICKS} ticks — ${out.fights} engagements, ${out.raised} questions asked`);
console.log(`  ${out.answered} answered by the player, ${out.lapsed} left to the general\n`);
console.log('  asked, most often first');
for (const [id, n] of ranked) {
  const share = ((n / out.raised) * 100).toFixed(1).padStart(5);
  console.log(`    ${id.padEnd(24)} ${String(n).padStart(4)}  ${share}%  ${'█'.repeat(Math.round((n / ranked[0][1]) * 26))}`);
}
if (out.never.length) console.log(`\n  never asked: ${out.never.join(', ')}`);

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });
check('the deck really is thirty', out.deck.length >= 30, `${out.deck.length} questions defined`);
check('most of it gets used', distinct >= 20, `${distinct} of ${out.deck.length} asked`);
check('no single question dominates', topShare <= 0.25,
  `commonest is ${ranked.length ? ranked[0][0] : '-'} at ${(topShare * 100).toFixed(1)}%`);
// Calibrated for the default sample. A question that needs a fight to run past its tenth exchange
// is legitimately rare — most engagements break before then — so a short run will always leave a
// few unfired without anything being wrong. Run the default before believing this one.
check('nothing is unreachable', out.never.length <= 4,
  `${out.never.length} never fired${SEEDS < 24 || TICKS < 420 ? ' (short sample — run the default)' : ''}`);
check('fights still ask a few, not a stream', out.perFightMean <= 3.05 && out.perFightMean >= 1,
  `${out.perFightMean.toFixed(2)} per fight`);
check('no console errors', errors.length === 0, errors[0] ?? 'none');

console.log('');
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'CHECK'}  ${c.name.padEnd(38)} ${c.detail}`);
console.log(checks.every((c) => c.ok) ? '\nPASS: the fight has more than three things to say' : '\nCHECK: see above');
await browser.close();
