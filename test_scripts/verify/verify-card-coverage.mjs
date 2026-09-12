/**
 * **Every card in the pool has to be able to turn up.**
 *
 * `POWER_CARDS` is fifty-odd entries and only some of them are rolled: an evolution result is
 * granted, a founding boon is offered once on the opening screen, a story card is the Chronicle's
 * to give. That leaves several ways a card can exist in the data and never once reach a player,
 * and every one of them is silent:
 *
 *  1. It is `evolutionOnly` but no card's `evolvesInto` names it.
 *  2. It is `openingOnly` but is not in the boon pool the founding screen deals from.
 *  3. It is `storyOnly` but no story calls `grantPowerCard` with it.
 *  4. It is rollable in theory and never in practice — a `requires` gate that cannot pass, a
 *     weight of zero, or a pool so crowded the card never surfaces.
 *
 * (1) and (2) are read off the exported pools. (3) is read off the story sources on disk, because
 * a story hands its card over in a *call* (`grantPowerCard(ctx, 'dai-cao')`) and there is no data
 * field to inspect. (4) is measured: the draft is rolled thousands of times against a real run
 * state, cards taken and retired the way a run takes and retires them, and every id the roller
 * can produce is recorded.
 *
 * The run is set up **twice** — once as a young realm with a single host, once as a late one with
 * several — because a handful of cards are gated on having a field army at all, and a sweep that
 * only ever asks the young question reports them as dead content when they are not.
 */
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173';
const DRAWS = Number(process.env.CARD_DRAWS ?? 4000);

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── what the Chronicle hands out, read off the sources ──────────────────────
const storyGranted = new Set();
for (const file of readdirSync('src/data/stories')) {
  if (!file.endsWith('.ts')) continue;
  const src = readFileSync(`src/data/stories/${file}`, 'utf8');
  for (const m of src.matchAll(/grantPowerCard\s*\([^,]+,\s*['"]([\w-]+)['"]/g)) storyGranted.add(m[1]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });

const report = await page.evaluate(async ({ draws, granted }) => {
  const cards = await import('/src/data/ascentCards.ts');
  const draft = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');

  const all = cards.POWER_CARDS;
  const evolutionResults = new Set(all.map((c) => c.evolvesInto).filter(Boolean));
  const rollable = new Set(cards.ROLLABLE_POWER_CARDS.map((c) => c.id));
  const boons = new Set(cards.OPENING_BOONS.map((c) => c.id));
  const grantedSet = new Set(granted);

  const unreachable = [];
  for (const card of all) {
    if (card.evolutionOnly) {
      if (!evolutionResults.has(card.id)) unreachable.push(`${card.id} — evolutionOnly, nothing evolves into it`);
    } else if (card.openingOnly) {
      if (!boons.has(card.id)) unreachable.push(`${card.id} — openingOnly, not in OPENING_BOONS`);
    } else if (card.storyOnly) {
      if (!grantedSet.has(card.id)) unreachable.push(`${card.id} — storyOnly, no story grants it`);
    } else if (!rollable.has(card.id)) {
      unreachable.push(`${card.id} — not rollable and not flagged`);
    }
  }

  /**
   * A run at a given age. `hosts` is what makes the difference: several cards are gated on having
   * a field army, and one (`bronze-drum`) on having more than one. The extra hosts are copies of
   * a host the map already generated, re-flagged to the player — the gates ask about ownership
   * and count, which is exactly what that gives them.
   */
  const makeState = (hosts) => {
    const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    state.resources.gold = 9000; state.resources.food = 9000; state.resources.supplies = 9000;
    if (state.ascent) { state.ascent.wave = 12; state.ascent.level = 10; }
    const template = state.armies[0];
    for (let i = 0; i < hosts && template; i += 1) {
      const copy = JSON.parse(JSON.stringify(template));
      copy.id = `probe-host-${i}`;
      copy.kingdomId = 'dai-viet';
      copy.isLevy = false;
      state.armies.push(copy);
    }
    return state;
  };

  const seen = new Map();
  let rolls = 0;
  const RUNS = 40;
  for (let run = 0; run < RUNS; run += 1) {
    // Half the runs young (one host), half late (three) — see `makeState`.
    const state = makeState(run % 2 === 0 ? 1 : 3);
    const ascent = state.ascent;
    for (let i = 0; i < draws / RUNS; i += 1) {
      const picks = draft.rollPowerDraftCards(state);
      rolls += 1;
      if (picks.length === 0) break;
      for (const id of picks) seen.set(id, (seen.get(id) ?? 0) + 1);
      const take = picks[Math.floor(Math.random() * picks.length)];
      ascent.cardStacks[take] = (ascent.cardStacks[take] ?? 0) + 1;
    }
  }

  const counts = [...seen.entries()].sort((a, b) => a[1] - b[1]);
  return {
    total: all.length,
    rollable: rollable.size,
    boons: boons.size,
    storyOnly: all.filter((c) => c.storyOnly).length,
    evolutionOnly: all.filter((c) => c.evolutionOnly).length,
    unreachable,
    rolls,
    distinctSeen: seen.size,
    rollableNeverSeen: [...rollable].filter((id) => !seen.has(id)),
    // A card that turns up on fewer than one draft in two hundred is not offered, it is a rumour.
    rarest: counts.slice(0, 6).map(([id, n]) => `${id} ${n}`),
    commonest: counts.slice(-3).map(([id, n]) => `${id} ${n}`),
    leastShare: counts.length ? counts[0][1] / rolls : 0,
  };
}, { draws: DRAWS, granted: [...storyGranted] });

console.log(JSON.stringify({
  total: report.total, rollable: report.rollable, boons: report.boons,
  storyOnly: report.storyOnly, storyGrants: storyGranted.size,
  evolutionOnly: report.evolutionOnly, rolls: report.rolls, distinctSeen: report.distinctSeen,
}, null, 2));

check('every card is reachable by some route',
  report.unreachable.length === 0, report.unreachable.join('; '));
check('every rollable card actually turns up in a draft',
  report.rollableNeverSeen.length === 0, report.rollableNeverSeen.join(', '));
check('the rarest rollable card is still offered often enough to matter',
  report.leastShare >= 0.02, `rarest appears in ${(report.leastShare * 100).toFixed(1)}% of drafts`);
check('the founding screen has boons to deal', report.boons >= 3, `${report.boons}`);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log('rarest:   ', report.rarest.join('  ·  '));
console.log('commonest:', report.commonest.join('  ·  '));

await browser.close();
console.log(failures === 0 ? 'PASS: every card can reach a player' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
