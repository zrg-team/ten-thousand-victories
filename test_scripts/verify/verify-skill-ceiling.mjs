/**
 * Does playing BETTER beat playing at all — and does *which way* you play matter?
 *
 * `playtest-metrics` guards agency (engaged beats declining). This guards the next question: three
 * competent plans on different axes, each over the same seeds, must finish meaningfully apart —
 * best ≥ 1.3× the worst **in raw waves held**, the number a player experiences — while every
 * engaged plan still beats declining by 1.5×.
 *
 * **What was wrong with the first version, and why this one is honest (2026-09-13):**
 *
 *   - *The plans were one plan.* Every "engaged" plan took the same doctrine (the first option,
 *     fortify), the same first draft card, and answered with dead ids (`assault`, `manage`, a
 *     coalition `bribe`) that fell through to the first option; the response card was not filtered
 *     by affordability, so an unaffordable pick did nothing; no plan ever hired mercenaries; and
 *     muster hosts stood on `defend` orders, so a bare `occupy`/`siege` was refused. The plans below
 *     take their own doctrine, lean their own drafts, name the host or envoy that carries a claim
 *     (`occupy:<armyId>`, `diplomacy:<heroId>` — the ids the resolver actually parses), set their
 *     musters' standing orders, and only ever answer with an offered, affordable id.
 *   - *"The same seed" was not the same world.* The founder card reads the Codex, which every run
 *     wrote — and an empty Codex was a shared mutable default, so later runs in one page inherited
 *     earlier runs' champions and diverged by tick 12. Every run now starts from a fresh profile.
 *   - *It was graded in realm, not waves.* Commit 9851ee17 converted the wave gap to 1.11^Δ; the
 *     review that scores the game reads raw waves. Raw waves are the criterion again; realm spread
 *     is printed beside it as context.
 *
 * **Judge on 64 seeds, not 16.** A plan's mean moves ±2–3 waves whenever the random stream is
 * reshuffled (any change that moves a draw), so a 16-seed pass can be luck: the beta passed 6/6 on
 * 16 dev + 32 unseen seeds and then read agency 1.40× on 64. A 64-seed run takes about a minute.
 *
 * Where it stands (64 dev seeds, 2026-09-13): raw spread passes on both rulesets (stable 1.43×,
 * beta 1.39×); agency fails on both (1.38× / 1.40×), and the weakest plan is always Warhost. None of
 * `shadowShareMult` 0.9/0.8, `tenureMilitiaSizingShare` 0.5/0 or `supplyPenaltyMult` 0.5 lifted it
 * past 1.44× — Warhost stays at 16–18 waves and dies at wave 5 on some seeds in every arm, which
 * points at the plan's use of its field army, not at a sizing number.
 *
 * The exit code grades `--gate` (default beta).
 *
 * Usage: node test_scripts/verify/verify-skill-ceiling.mjs [--seeds 64] [--ticks 600]
 *        [--ruleset stable|beta|both] [--gate beta] [--override '{"strikeSizing":1}']
 *        [--tuning '{"shadowShareMult":0.9}'] [--seed-base 11] [--seed-step 11] [--json out.json]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BASE_URL, ENGINE_BOOT, READ_OPTIONS } from '../playtest/playtest-lib.mjs';

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const SEED_COUNT = Number(argOf('--seeds', 64));
const TICKS = Number(argOf('--ticks', 600));
const SEED_BASE = Number(argOf('--seed-base', 11));
const SEED_STEP = Number(argOf('--seed-step', 11));
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => SEED_BASE + i * SEED_STEP);
const RULESET_ARG = argOf('--ruleset', 'both');
const RULESETS = RULESET_ARG === 'both' ? ['stable', 'beta'] : [RULESET_ARG];
const GATE = argOf('--gate', RULESETS.includes('beta') ? 'beta' : RULESETS[0]);
const OVERRIDE = argOf('--override', undefined);
// Exploration only: `ASCENT_TUNING` knobs for both rulesets, e.g. '{"shadowShareMult":0.9}'.
const TUNING = argOf('--tuning', undefined);
const JSON_OUT = argOf('--json', undefined);
const SPREAD_MIN = 1.3;
const PAIRED_MIN = 0.6;
const AGENCY_MIN = 1.5;
const WAVE_GROWTH = 1.11;
const PLANS = ['bastion', 'frontier', 'warhost', 'declining'];
const ENGAGED = ['bastion', 'frontier', 'warhost'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 160)}`); });
if (OVERRIDE) {
  // Seeded before navigation: the registry reads it once at module load (dual-module-instance trap).
  await page.addInitScript((beta) => { globalThis.__ascentRulesetOverride = { beta }; }, JSON.parse(OVERRIDE));
}
if (TUNING) {
  await page.addInitScript((tuning) => { window.__ascentTuning = tuning; }, JSON.parse(TUNING));
}
await page.goto(`${BASE_URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
await page.evaluate(READ_OPTIONS);
await page.evaluate(ENGINE_BOOT);

const playPlan = (plan, ruleset) => page.evaluate(async ({ seeds, ticks, plan, ruleset }) => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const { goalHold } = await import('/src/systems/ascent/Goal.ts');
  const { armyPower, findLandPath } = await import('/src/systems/WarSystem.ts');
  const { setArmyOrders } = await import('/src/systems/ascent/StandingOrders.ts');
  const { commandableHosts, isEngagedHost } = await import('/src/systems/ascent/armyOrders.ts');
  const PLAYER = 'dai-viet';

  const LEAN = {
    bastion: ['bamboo-palisade', 'earthen-ramparts', 'fire-arrows', 'feigned-retreat', 'twice-born', 'mountain-pass', 'salt-roads', 'granary-edict'],
    frontier: ['surveyors-corps', 'march-escort', 'hidden-paths', 'village-muster', 'rice-tribute', 'granary-edict', 'bronze-drum', 'corvee-labour'],
    warhost: ['fire-arrows', 'twice-born', 'dragon-standard', 'royal-guard', 'iron-levy', 'bronze-drums', 'war-drums', 'bronze-drum'],
  };
  const DOCTRINE = { bastion: 'fortify', frontier: 'expand', warhost: 'arm', declining: 'hold' };
  const firstOf = (offered, wants) => wants.find((want) => offered.includes(want));
  const affordable = (prompt) => (prompt.options ?? []).filter((option) => option.affordable !== false).map((option) => option.id);

  /** A border province of ours besides the capital, the weakest held — where Frontier posts a host. */
  const frontierPost = (state) => {
    const owned = new Set(state.lands.filter((l) => l.ownerId === PLAYER).map((l) => l.id));
    return state.lands
      .filter((l) => owned.has(l.id) && l.id !== state.ascent.capitalLandId && l.neighbors.some((n) => !owned.has(n)))
      .sort((a, b) => (a.defense + a.localSoldiers) - (b.defense + b.localSoldiers))[0];
  };

  const answer = (state, prompt, offered) => {
    const lands = state.lands.filter((l) => l.ownerId === PLAYER).length;
    switch (prompt.kind) {
      case 'doctrine': return firstOf(offered, [DOCTRINE[plan]]);
      case 'power-draft': return plan === 'declining' ? 'skip' : firstOf(offered, LEAN[plan]);
      case 'conquer-target':
        if (plan === 'declining' || (plan === 'bastion' && lands >= 4)) return 'hold';
        return offered.find((id) => id !== 'hold');
      case 'conquer-method': {
        if (plan === 'declining') return 'back';
        const open = prompt.target.methods.filter((m) => !m.blockedReason);
        const named = (m) => (m.armyId ? `${m.method}:${m.armyId}` : m.heroId ? `${m.method}:${m.heroId}` : m.method);
        const orderOf = {
          bastion: ['settle'],
          frontier: ['settle', 'occupy', 'diplomacy', 'bribe', 'intimidation'],
          warhost: ['occupy', 'siege', 'intimidation', 'settle'],
        }[plan];
        for (const method of orderOf) {
          const option = open.find((m) => m.method === method);
          if (!option) continue;
          // Warhost revision 1: storm only at good odds — at 55 the plan bled its field army away.
          if (method === 'siege' && option.chance < 70) continue;
          if (method === 'bribe' && option.chance < 50) continue;
          return named(option);
        }
        return 'back';
      }
      case 'muster-proposal': {
        if (plan === 'declining') return 'decline';
        if (plan === 'warhost') prompt.plan.orders = { kind: 'auto' };
        if (plan === 'frontier') {
          const post = frontierPost(state);
          if (post) prompt.plan.orders = { kind: 'defend', landId: post.id };
        }
        return 'accept';
      }
      case 'empire-response': {
        const ids = affordable(prompt);
        return firstOf(ids, {
          bastion: ['fortify', 'endure'],
          frontier: ['hire-mercenaries', 'fortify', 'endure'],
          warhost: ['hire-mercenaries', 'endure'],
          declining: ['endure'],
        }[plan]);
      }
      case 'rival-demand': {
        const ids = affordable(prompt);
        return firstOf(ids, plan === 'bastion'
          ? ['pay', 'buy-off', 'submit', 'refuse', 'endure', 'defy']
          : plan === 'declining' ? ['refuse', 'endure', 'defy'] : ['refuse', 'endure', 'defy']);
      }
      case 'restore-land': return firstOf(affordable(prompt), {
        bastion: ['haste', 'steady', 'endure'], frontier: ['steady', 'endure'], warhost: ['endure'], declining: ['endure'],
      }[plan]);
      case 'famine': return firstOf(affordable(prompt), ['buy-grain', 'slaughter-herds', 'endure']);
      case 'hero-choice': return plan === 'declining' ? 'pass' : undefined;
      case 'law-choice': return plan === 'declining' ? 'hold' : undefined;
      case 'court-appointment': return plan === 'declining' ? 'reserve' : undefined;
      case 'goal-won': return 'rule-on';
      default: return undefined;
    }
  };

  /**
   * Warhost's season (revision 1, 2026-09-13; objective: Warhost's own waves on the dev seeds).
   * The first version only answered cards — it stormed at 55% odds, left every host wherever its
   * last claim put it, and died with its army spent and its seat empty (anatomy: 4.7 sieges a reign,
   * hosts away from the capital on the killing wave). A field army that means it: a free host
   * hunts a column it outweighs 1.3× within three marches; otherwise, while a wave is close, a Great
   * Invasion is telegraphed or an invader stands on our ground, every host holds the capital; in
   * quiet seasons they go back to the autopilot and the claims.
   *
   * Revision 1 took Warhost from 16.2 to 17.2 waves over 64 dev seeds (goals 41 → 46). Two more
   * were tried and reverted: revision 2 (walk home six seasons before a Great Invasion, no
   * host-pinning claims then) cost 1.7 waves; revision 3 (drill / equip / reinforce a host each
   * quiet season from the ~1,300 gold the plan sat on at wave 8) moved it 0.1 — noise.
   */
  const warhostTick = (state) => {
    const capitalId = state.ascent.capitalLandId;
    const invaders = (state.invasions ?? [])
      .map((record) => state.armies.find((army) => army.id === record.armyId))
      .filter(Boolean);
    const danger = state.ascent.bossTelegraphed || state.ascent.ticksToWave <= 3
      || invaders.some((enemy) => state.lands.find((land) => land.id === enemy.landId)?.ownerId === PLAYER);
    const hunted = new Set();
    for (const host of commandableHosts(state)) {
      if (host.refit || isEngagedHost(state, host.id) || state.siegeOrders.some((order) => order.armyId === host.id)) continue;
      const current = host.orders ?? { kind: 'auto' };
      if (current.kind === 'hunt' && invaders.some((enemy) => enemy.id === current.armyId)) { hunted.add(current.armyId); continue; }
      const power = armyPower(state, host);
      const prey = invaders
        .filter((enemy) => !hunted.has(enemy.id) && power >= 1.3 * armyPower(state, enemy))
        .map((enemy) => ({ enemy, path: findLandPath(state, host.landId, enemy.landId, () => true) }))
        .filter((entry) => entry.path && entry.path.length <= 3)
        .sort((a, b) => a.path.length - b.path.length)[0];
      if (prey) {
        hunted.add(prey.enemy.id);
        setArmyOrders(state, host.id, { kind: 'hunt', armyId: prey.enemy.id });
        continue;
      }
      if (danger) {
        if (!(current.kind === 'defend' && current.landId === capitalId)) setArmyOrders(state, host.id, { kind: 'defend', landId: capitalId });
      } else if (current.kind !== 'auto') {
        setArmyOrders(state, host.id, { kind: 'auto' });
      }
    }
  };

  const out = [];
  for (const seed of seeds) {
    window.__ptFreshProfile();
    const state = await window.__ptBoot(seed, { ruleset });
    let over = false;
    let peakLands = 0;
    let conquests = 0;
    let misses = 0;
    // Beta: what the realm held each time a Great Invasion decided the goal (a miss moves the
    // target; a win closes it) — the evidence for tuning the goal's province count.
    const goalChecks = [];
    // How the reign went, for `--anatomy`: every claim answered, and the realm at each wave start.
    const claims = {};
    const waveLog = [];
    let lastWave = state.ascent.wave;
    for (let tick = 0; tick < ticks && !state.isDefeated && !over; tick += 1) {
      const before = state.lands.filter((l) => l.ownerId === PLAYER).length;
      const goalBefore = state.ascent.goal ? `${state.ascent.goal.status}:${state.ascent.goal.targetWave}` : '';
      advanceAscentTick(state);
      const goalNow = state.ascent.goal ? `${state.ascent.goal.status}:${state.ascent.goal.targetWave}` : '';
      if (goalNow !== goalBefore && goalBefore.startsWith('open')) goalChecks.push({ wave: Number(goalBefore.split(':')[1]), ...goalHold(state) });
      drainAscentPrompts(state);
      let guard = 0;
      while (state.pendingAscentPrompt && guard++ < 40) {
        const prompt = state.pendingAscentPrompt;
        if (prompt.kind === 'run-over') { over = true; break; }
        const offered = window.__ptOptions(state);
        if (!offered || !offered.length) break;
        let choice = answer(state, prompt, offered);
        const understood = choice !== undefined && (offered.includes(choice) || /^(occupy|siege|intimidation|diplomacy|bribe):/.test(choice));
        if (!understood) {
          if (choice !== undefined) misses += 1;
          choice = plan === 'declining' ? offered[offered.length - 1] : offered[0];
        }
        if (prompt.kind === 'conquer-method' && typeof choice === 'string') {
          const method = choice.split(':')[0];
          claims[method] = (claims[method] ?? 0) + 1;
        }
        if (!resolveAscentPrompt(state, choice)) break;
        drainAscentPrompts(state);
      }
      if (state.ascent.wave !== lastWave) {
        lastWave = state.ascent.wave;
        const capitalId = state.ascent.capitalLandId;
        const hosts = state.armies.filter((a) => a.kingdomId === PLAYER && !a.isLevy && !a.patron);
        const capital = state.lands.find((l) => l.id === capitalId);
        waveLog.push({
          wave: lastWave, tick, lands: state.lands.filter((l) => l.ownerId === PLAYER).length,
          hosts: hosts.length, atCapital: hosts.filter((a) => a.landId === capitalId).length,
          men: hosts.reduce((sum, a) => sum + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0),
          capitalDefense: Math.round(capital?.defense ?? 0), capitalSoldiers: Math.round(capital?.localSoldiers ?? 0),
          threat: Math.round(state.ascent.threat), defence: Math.round(state.ascent.defensePower ?? 0),
          gold: Math.round(state.resources?.gold ?? 0),
        });
      }
      state.isPaused = false;
      if (plan === 'warhost' && !state.isDefeated) warhostTick(state);
      const after = state.lands.filter((l) => l.ownerId === PLAYER).length;
      if (after > before) conquests += after - before;
      peakLands = Math.max(peakLands, after);
    }
    window.__ptRestoreRandom();
    out.push({ seed, waves: state.ascent.wavesSurvived, died: !!state.isDefeated, peakLands, conquests, misses, goal: state.ascent.goal?.status ?? null, goalChecks,
      anatomy: { cause: state.ascent.endCause ?? null, shape: state.ascent.waveShape ?? null, claims, waveLog } });
  }
  return out;
}, { seeds: SEEDS, ticks: TICKS, plan, ruleset });

console.log(`\n  SKILL CEILING — ${SEED_COUNT} seeds × ${TICKS} ticks, fresh profile per run (${BASE_URL})${OVERRIDE ? `  beta override ${OVERRIDE}` : ''}${TUNING ? `  tuning ${TUNING}` : ''}\n`);
const report = {};
const checks = [];
const check = (label, pass, detail, graded) => {
  if (graded) checks.push(pass);
  console.log(`${graded ? (pass ? 'ok  ' : 'FAIL') : (pass ? '  · ' : '  ! ')} ${label}  — ${detail}`);
};
const mean = (list) => list.reduce((s, v) => s + v, 0) / Math.max(1, list.length);

for (const ruleset of RULESETS) {
  const rows = {};
  for (const plan of PLANS) {
    rows[plan] = await playPlan(plan, ruleset);
    const waves = rows[plan].map((r) => r.waves);
    console.log(`  ${ruleset.padEnd(6)} ${plan.padEnd(10)} ${mean(waves).toFixed(1).padStart(5)} waves  lands ${mean(rows[plan].map((r) => r.peakLands)).toFixed(1).padStart(4)}`
      + `  conquests ${mean(rows[plan].map((r) => r.conquests)).toFixed(1).padStart(4)}  misses ${rows[plan].reduce((s, r) => s + r.misses, 0)}`
      + `${ruleset === 'beta' ? `  goals ${rows[plan].filter((r) => r.goal === 'won').length}/${rows[plan].length}` : ''}   per seed ${waves.join(' ')}`);
  }
  if (ruleset === 'beta') {
    for (const plan of PLANS) {
      const decided = rows[plan].flatMap((r) => r.goalChecks ?? []);
      const firstChecks = rows[plan].map((r) => r.goalChecks?.[0]).filter(Boolean);
      const hist = (list) => [0, 1, 2, 3].map((n) => `${n}${n === 3 ? '+' : ''}:${list.filter((c) => c.capital && (n === 3 ? c.others >= 3 : c.others === n)).length}`).join(' ');
      console.log(`    goal checks ${plan.padEnd(10)} reached ${firstChecks.length}/${rows[plan].length}  first check: capital lost ${firstChecks.filter((c) => !c.capital).length}, others ${hist(firstChecks)}  ·  all ${decided.length} checks: others ${hist(decided)}`);
    }
  }
  const avg = Object.fromEntries(PLANS.map((p) => [p, mean(rows[p].map((r) => r.waves))]));
  const engaged = ENGAGED.map((p) => [p, avg[p]]);
  const best = engaged.reduce((a, b) => (b[1] > a[1] ? b : a));
  const worst = engaged.reduce((a, b) => (b[1] < a[1] ? b : a));
  const raw = best[1] / Math.max(0.001, worst[1]);
  const realm = WAVE_GROWTH ** (best[1] - worst[1]);
  const agency = worst[1] / Math.max(0.001, avg.declining);
  const paired = rows[best[0]].filter((r, i) => r.waves > rows[worst[0]][i].waves).length
    + 0.5 * rows[best[0]].filter((r, i) => r.waves === rows[worst[0]][i].waves).length;
  const pairedShare = paired / SEED_COUNT;
  const landsSpread = Math.max(...ENGAGED.map((p) => mean(rows[p].map((r) => r.peakLands)))) / Math.max(0.001, Math.min(...ENGAGED.map((p) => mean(rows[p].map((r) => r.peakLands)))));
  const graded = ruleset === GATE;
  console.log('');
  check(`${ruleset}: every engaged plan beats declining (agency)`, agency >= AGENCY_MIN,
    `weakest ${worst[0]} ${worst[1].toFixed(1)} vs declining ${avg.declining.toFixed(1)} → ${agency.toFixed(2)}× (want ${AGENCY_MIN}×)`, graded);
  check(`${ruleset}: the best plan is 30%+ more waves than the worst (raw ceiling)`, raw >= SPREAD_MIN,
    `${best[0]} ${best[1].toFixed(1)} vs ${worst[0]} ${worst[1].toFixed(1)} → ${raw.toFixed(2)}× raw (${realm.toFixed(2)}× realm; want ${SPREAD_MIN}× raw)`, graded);
  check(`${ruleset}: and beats it seed for seed`, pairedShare >= PAIRED_MIN,
    `${best[0]} ahead of ${worst[0]} in ${(pairedShare * 100).toFixed(0)}% of seeds (want ${PAIRED_MIN * 100}%)`, graded);
  check(`${ruleset}: the plans are genuinely different (peak provinces spread)`, landsSpread >= 1.15,
    `${landsSpread.toFixed(2)}× between the widest and the tallest plan`, graded);
  check(`${ruleset}: every answer was an offered id`, ENGAGED.every((p) => rows[p].every((r) => r.misses === 0)),
    `${ENGAGED.map((p) => `${p} ${rows[p].reduce((s, r) => s + r.misses, 0)}`).join(', ')} misses`, graded);
  console.log('');
  report[ruleset] = { avg, raw, realm, agency, pairedShare, best: best[0], worst: worst[0], rows };
}
await browser.close();

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none', true);
if (JSON_OUT) {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify({ seeds: SEEDS, ticks: TICKS, override: OVERRIDE ? JSON.parse(OVERRIDE) : null, report }, null, 1));
}
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} graded checks passed (gate: ${GATE})`);
console.log(failed === 0 ? 'PASS: a better plan is a longer reign' : 'FAIL: the plan barely matters');
process.exit(failed === 0 ? 0 : 1);
