/**
 * A province whose line has broken does not fight again with what is left of it.
 *
 * Reported as *"I lost the fight, it showed me I lost, then another fight happened at the same
 * place in the background and I could go to it"*. Measured before the fix over eight seeded runs:
 * 36 field defences lost, 4 brand-new fights opened at the same province within ten ticks, every
 * one with no field host of ours there — the beaten militia thrown at the next column while the
 * walls were already carried (1,394 → 253 at tick 115, then 253 against 3,734 at tick 116).
 *
 * Two rules hold it: a column reaching walls another column has carried joins the siege instead
 * of making contact (`joinsStandingSiege`), and a province routed this wave raises no fresh field
 * unless a field host of ours has arrived (`routedGround`). Relief must still fight — the last
 * section stages a host of ours on a besieged province and expects a field.
 *
 *   node test_scripts/verify/verify-lost-ground.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
const SEEDS = [1337, 4242, 99, 779, 2026, 31, 7, 55];
const TICKS = 400;
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

console.log(`=== verify-lost-ground — ${URL} ===`);
const totals = { losses: 0, refights: 0, records: 0, siegeDup: 0, fights: 0 };
for (const seed of SEEDS) {
  const out = await page.evaluate(async ([seed, ticks]) => {
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    let s = seed >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const PLAYER = 'dai-viet';
    const options = (p) => {
      switch (p.kind) {
        case 'coronation': return ['crowned'];
        case 'founder': return p.options;
        case 'power-draft': return [...p.cards, 'skip'];
        case 'conquer-target': return [...p.targets.map((t) => t.landId), 'hold'];
        case 'conquer-method': return [...p.target.methods.filter((m) => !m.blockedReason).map((m) => m.method), 'back'];
        case 'hero-choice': return [...p.heroIds, 'pass'];
        case 'court-appointment': return p.options.map((o) => o.id);
        case 'law-choice': return [...p.projectIds.map((id) => `edict:${id}`), ...p.taxOptions.map((x) => `tax:${x}`), 'hold'];
        case 'parliament': return st.politicsDeck.find((c) => c.id === p.cardId)?.choices.map((c) => c.id) ?? ['ok'];
        case 'envoy': case 'rival-demand': return p.options.filter((o) => o.affordable).map((o) => o.id);
        case 'empire-response': return p.options.map((o) => o.id);
        case 'dynasty-level': return p.options;
        case 'famine': return (p.options ?? []).map((o) => o.id ?? o);
        default: return (p.options ?? []).map((o) => o?.id ?? o).concat(['ok']);
      }
    };
    const drain = () => { let guard = 0; while (st.pendingAscentPrompt && guard++ < 40) { const p = st.pendingAscentPrompt; if (p.kind === 'run-over') break; const ids = options(p); resolveAscentPrompt(st, ids[0] ?? 'ok'); } };
    drain();
    const seen = new WeakSet();
    const lossAt = new Map();
    let losses = 0; let refights = 0; let records = 0; let siegeDup = 0; let fights = 0;
    let histSeen = 0;
    const WINDOW = 10;
    const notes = [];
    for (let tick = 1; tick <= ticks; tick += 1) {
      advanceAscentTick(st);
      drain();
      if (st.isDefeated || st.pendingAscentPrompt?.kind === 'run-over') break;
      const a = st.ascent;
      const hist = a.battleHistory ?? [];
      for (let i = histSeen; i < hist.length; i += 1) {
        const r = hist[i];
        if (r.role === 'offence') continue;
        if (r.rounds > 0 && r.outcome === 'we-rout') { losses += 1; lossAt.set(r.landId, { tick, wave: a.wave }); continue; }
        const lost = lossAt.get(r.landId);
        /**
         * A claim that was *already standing* when this roll was made.
         *
         * Two things now legitimately produce a record at a province with a claim on it, and
         * neither is the defect. The dispatch that loses the province lays the claim itself, so it
         * is filed on the very turn the order opens (`openedTurn`) — counting it would flag the
         * fall of a province as a re-roll of it. And a **retake** is a fight deliberately stood up
         * on ground already being claimed, which is the whole point of being able to win it back.
         * The defect is narrower than either: a fresh roll for ground a *previous* column had
         * already carried, fought by nobody but what the province itself had left. `ourHosts` is
         * the record's own count of our field hosts in the line, so `0` is precisely "the militia
         * remnant, alone" — and any retake, however badly it goes, has a host in it.
         */
        const claim = st.siegeOrders.find((o) => o.landId === r.landId && o.attackerKingdomId !== PLAYER);
        const besieged = claim !== undefined && (claim.openedTurn ?? 0) < tick && r.ourHosts === 0;
        if (lost !== undefined && tick - lost.tick <= WINDOW) {
          if (besieged) records += 1;
          notes.push(`t${tick}: dispatch at ${r.landId} ${tick - lost.tick} ticks after its line broke (wave ${lost.wave}->${a.wave}, siege standing: ${besieged}): ${r.outcome} ours ${r.ourStart}->${r.ourEnd}`);
        }
      }
      histSeen = hist.length;
      const live = [a.activeBattle, ...(a.sideBattles ?? [])].filter((b) => b && !b.over);
      for (const b of live) {
        if (seen.has(b)) continue;
        seen.add(b);
        fights += 1;
        if (b.role === 'offence') continue;
        const lost = lossAt.get(b.landId);
        if (lost === undefined || tick - lost.tick > WINDOW) continue;
        const fieldHost = st.armies.some((x) => x.kingdomId === PLAYER && !x.isLevy && x.landId === b.landId && (x.units.spearmen + x.units.archers + x.units.heavyInfantry) > 0);
        const besieged = st.siegeOrders.some((o) => o.landId === b.landId && o.attackerKingdomId !== PLAYER);
        if (!fieldHost && (lost.wave === a.wave || besieged)) {
          refights += 1;
          notes.push(`t${tick}: NEW FIELD at ${b.landId} ${tick - lost.tick} ticks after its line broke (wave ${lost.wave}->${a.wave}, siege standing: ${besieged}), no host of ours there: ${b.ourStart} vs ${b.theirStart}`);
        } else if (!fieldHost) {
          notes.push(`t${tick}: new wave's field at ${b.landId} ${tick - lost.tick} ticks after its line broke (wave ${lost.wave}->${a.wave}) — a new attack, allowed: ${b.ourStart} vs ${b.theirStart}`);
        }
      }
      const byLand = new Map();
      for (const o of st.siegeOrders) byLand.set(o.landId, (byLand.get(o.landId) ?? 0) + 1);
      for (const [, n] of byLand) if (n > 1) siegeDup += 1;
    }
    return { seed, ticks: st.turn, losses, refights, records, siegeDup, fights, notes: notes.slice(0, 6) };
  }, [seed, TICKS]);
  console.log(`  seed ${out.seed}: ${out.ticks} ticks, ${out.fights} fields, ${out.losses} lost — re-fights with militia only: ${out.refights}, dispatches at broken ground: ${out.records}, doubled sieges: ${out.siegeDup}`);
  for (const n of out.notes) console.log('     ' + n);
  for (const k of Object.keys(totals)) totals[k] += out[k];
}
check('the runs still fight (the rule did not empty the war)', totals.fights >= 40 && totals.losses >= 8, `${totals.fights} fields, ${totals.losses} lost`);
check('a province whose line broke raises no fresh field for its militia remnant that wave', totals.refights === 0, `${totals.refights} re-fights`);
check('nor is it rolled for again by dispatch while a siege stands there', totals.records === 0, `${totals.records} dispatches`);
check('no province ever carries two siege orders', totals.siegeDup === 0, `${totals.siegeDup} ticks`);

// ── relief still fights ──────────────────────────────────────────────────────
// A besieged province with a field host of ours on it must still get its field: the rule is about
// the remnant, not about giving up ground.
const relief = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { openFieldAt, fieldCandidateAt } = await import('/src/systems/ascent/BattleSystem.ts');
  let s = 4242;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const PLAYER = 'dai-viet';
  const drain = () => { let guard = 0; while (st.pendingAscentPrompt && guard++ < 40) { const p = st.pendingAscentPrompt; if (p.kind === 'run-over') break; resolveAscentPrompt(st, p.options?.[0]?.id ?? p.options?.[0] ?? p.cards?.[0] ?? p.targets?.[0]?.landId ?? p.heroIds?.[0] ?? 'ok'); } };
  drain();
  // Run until a siege of ours stands somewhere, then drop a field host of ours onto that province.
  for (let tick = 1; tick <= 400; tick += 1) {
    advanceAscentTick(st); drain();
    if (st.isDefeated) return { staged: false, why: 'defeated first' };
    const siege = st.siegeOrders.find((o) => o.attackerKingdomId !== PLAYER && st.lands.find((l) => l.id === o.landId)?.ownerId === PLAYER);
    if (!siege) continue;
    const land = st.lands.find((l) => l.id === siege.landId);
    st.ascent.routedGround = { [land.id]: st.ascent.wave };
    const host = {
      id: 'relief-probe', kingdomId: PLAYER, name: 'Relief', landId: land.id,
      units: { spearmen: 900, archers: 300, heavyInfantry: 200 }, morale: 85, supply: 80, rations: 999, provisions: 999,
      level: 2, experience: 0, experienceToNextLevel: 200,
    };
    st.armies.push(host);
    const candidate = fieldCandidateAt(st, land.id);
    const opened = openFieldAt(st, land.id);
    const live = [st.ascent.activeBattle, ...(st.ascent.sideBattles ?? [])].filter((b) => b && !b.over);
    const field = live.find((b) => b.landId === land.id);
    return { staged: true, tick, land: land.id, candidate: candidate?.id ?? null, opened, field: field ? { ours: field.ourStart, theirs: field.theirStart, theirHosts: (field.theirArmyIds ?? []).length } : null };
  }
  return { staged: false, why: 'no siege in 400 ticks' };
});
check('a relief host on a besieged province still gets its field', relief.staged && relief.opened && relief.field?.ours > 0 && relief.field?.theirs > 0, JSON.stringify(relief));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: a broken line is not stood again with its remnant, and relief still fights' : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
