/**
 * An enemy that wins the field stays until the flag turns.
 *
 * Reported (2026-09-14): *"when the enemy wins my capital battle they do not capture but leave, and
 * then fight the capital again and again and again."*
 *
 * Winning a fight does not take a province: the winner walks on and lays a `SiegeOrder`, and the
 * flag turns 2–6 seasons later in `progressSiegeOrders`. Five things let that claim evaporate
 * without anybody retaking it:
 *
 *   A. the campaign clock ran out mid-claim and marched the winner home (the capital's clock is
 *      the longest, and the host reaching it has spent most of its season getting there);
 *   B. a column that joined the claim despawned the next tick, and the claim died with whichever
 *      host happened to lay it even with the rest of the coalition standing on the ground;
 *   C. a watched fight won with the lead host dead laid no claim, or laid one for a dead host;
 *   D. our beaten host was walked straight back by its standing order / the autopilot / recall,
 *      re-opening a fight on ground already carried and pausing the claim;
 *   E. a retake that was actually won did nothing, because the claimant stands *on* the land and
 *      the settlement asked for adjacency.
 *
 * Every scenario stages exactly one of those on a fresh reign; the sweep then asks the question
 * the player asked, across eight seeded runs: did any claim vanish without being taken or retaken?
 *
 *   node test_scripts/verify/verify-capital-claim.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
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
console.log(`=== verify-capital-claim — ${URL} ===`);

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { hostileClaimAt } = await import('/src/systems/LandSystem.ts');
  const { openFieldAt, finishBattle } = await import('/src/systems/ascent/BattleSystem.ts');
  const { liveBattles } = await import('/src/systems/ascent/fronts.ts');
  const { setArmyOrders } = await import('/src/systems/ascent/StandingOrders.ts');
  const { buyOffHost } = await import('/src/systems/ascent/CourtBargains.ts');
  const PLAYER = 'dai-viet';
  const size = (a) => a ? a.units.spearmen + a.units.archers + a.units.heavyInfantry : 0;

  const boot = (seed) => {
    let s = seed >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const drain = () => {
      let g = 0;
      while (st.pendingAscentPrompt && g++ < 40) {
        const p = st.pendingAscentPrompt;
        if (p.kind === 'run-over') break;
        // Never the envoy's buy-off: a claim a court was paid to lift is a legitimate end.
        const opts = (p.options ?? []).filter((o) => !String(o?.id ?? o).includes('buyoff'));
        const id = p.kind === 'coronation' ? 'crowned'
          : p.kind === 'founder' ? p.options[0]
          : p.kind === 'power-draft' ? (p.cards?.[0] ?? 'skip')
          : p.kind === 'hero-choice' ? (p.heroIds?.[0] ?? 'pass')
          : p.kind === 'conquer-target' ? 'hold'
          : (opts[0]?.id ?? opts[0] ?? 'ok');
        if (!resolveAscentPrompt(st, String(id))) st.pendingAscentPrompt = undefined;
      }
    };
    drain();
    return { st, drain };
  };

  /**
   * A quiet capital: no invaders on the map, no field hosts of ours on or beside the seat, one
   * neighbour handed to a rival (where the claim's `fromLandId` lives) and the rest ours.
   */
  const stage = (seed = 1337) => {
    const { st, drain } = boot(seed);
    const cap = st.lands.find((l) => l.id === st.ascent.capitalLandId);
    const rival = st.kingdoms.find((k) => k.id !== PLAYER && k.id !== 'neutral' && !k.isDefeated);
    const invading = new Set((st.invasions ?? []).map((r) => r.armyId));
    st.armies = st.armies.filter((a) => !invading.has(a.id));
    st.invasions = [];
    st.siegeOrders = [];
    st.movementOrders = [];
    const ring = cap.neighbors.map((id) => st.lands.find((l) => l.id === id)).filter(Boolean);
    const N = ring[0];
    N.ownerId = rival.id;
    for (const l of ring.slice(1)) l.ownerId = PLAYER;
    const near = new Set([cap.id, ...cap.neighbors]);
    st.armies = st.armies.filter((a) => !(a.kingdomId === PLAYER && !a.isLevy && near.has(a.landId)));
    const hostile = (id, landId, n, campaignTicks = 20) => {
      const army = {
        id, kingdomId: rival.id, name: id, landId,
        units: { spearmen: n, archers: Math.round(n / 3), heavyInfantry: Math.round(n / 5) },
        morale: 85, supply: 80, rations: 999, provisions: 999, level: 2, experience: 0, experienceToNextLevel: 200,
      };
      st.armies.push(army);
      st.invasions.push({ armyId: id, kingdomId: rival.id, intent: 'conquest', plan: 'spearhead', targetLandId: cap.id, mustered: size(army), campaignTicks });
      return army;
    };
    const ours = (id, landId, n) => {
      const army = {
        id, kingdomId: PLAYER, name: id, landId,
        units: { spearmen: n, archers: Math.round(n / 3), heavyInfantry: Math.round(n / 5) },
        morale: 85, supply: 80, rations: 999, provisions: 999, level: 2, experience: 0, experienceToNextLevel: 200,
      };
      st.armies.push(army);
      return army;
    };
    const claim = (armyId, required = 6) => {
      const order = { landId: cap.id, armyId, attackerKingdomId: rival.id, fromLandId: N.id, progress: 0, required, presentAtClaim: [], openedTurn: st.turn };
      st.siegeOrders.push(order);
      return order;
    };
    const tick = () => { advanceAscentTick(st); drain(); };
    const record = (id) => st.invasions?.find((r) => r.armyId === id);
    const army = (id) => st.armies.find((a) => a.id === id);
    const field = () => liveBattles(st).find((b) => b.landId === cap.id);
    return { st, cap, rival, N, ring, hostile, ours, claim, tick, record, army, field };
  };

  const r = {};

  // ── A: the campaign clock does not march a claimant home ─────────────────
  {
    const S = stage();
    S.hostile('H', S.cap.id, 900, 3);
    S.claim('H');
    let stayed = true; let flipped = false; let t = 0;
    for (t = 1; t <= 9; t += 1) {
      S.tick();
      if (S.cap.ownerId === S.rival.id) { flipped = true; break; }
      const order = hostileClaimAt(S.st, S.cap.id);
      if (!order || order.armyId !== 'H' || S.army('H')?.landId !== S.cap.id || S.record('H')?.pillaged) { stayed = false; break; }
    }
    r.A = { stayed, flipped, t, clock: S.record('H')?.campaignTicks ?? null };
  }

  // ── A2: nor does it spend a host out of a live field ─────────────────────
  {
    const S = stage();
    S.hostile('H1', S.N.id, 700, 2);
    S.ours('P', S.cap.id, 300);
    const opened = openFieldAt(S.st, S.cap.id);
    let fought = 0; let quitMidFight = false;
    for (let t = 1; t <= 14; t += 1) {
      const live = S.field();
      if (!live || !(live.theirArmyIds ?? []).includes('H1')) break;
      fought += 1;
      S.tick();
      const after = liveBattles(S.st).find((b) => (b.theirArmyIds ?? []).includes('H1'));
      if (after && S.record('H1')?.pillaged) { quitMidFight = true; break; }
    }
    r.A2 = { opened, fought, quitMidFight };
  }

  // ── B1: the claim passes down the coalition when its bearer falls ─────────
  {
    const S = stage();
    S.hostile('H1', S.cap.id, 600);
    S.hostile('H2', S.cap.id, 900);
    const order = S.claim('H1');
    S.tick();
    const kept = order.progress;
    S.army('H1').units = { spearmen: 0, archers: 0, heavyInfantry: 0 };
    S.tick();
    const after = hostileClaimAt(S.st, S.cap.id);
    const handed = after?.armyId === 'H2' && after.progress >= kept;
    let flipped = false;
    for (let t = 1; t <= 8 && !flipped; t += 1) { S.tick(); flipped = S.cap.ownerId === S.rival.id; }
    r.B1 = { handed, bearer: after?.armyId ?? null, progress: after?.progress ?? null, kept, flipped };
  }

  // ── B2: a column that joins a claim waits with it ─────────────────────────
  {
    const S = stage();
    S.hostile('H1', S.cap.id, 900);
    S.claim('H1');
    S.hostile('H2', S.N.id, 700);
    const trail = [];
    for (let t = 1; t <= 4; t += 1) {
      S.tick();
      if (S.cap.ownerId !== 'dai-viet') break;
      trail.push(S.army('H2') ? S.army('H2').landId : 'gone');
    }
    r.B2 = { trail, joined: trail.includes(S.cap.id), vanished: trail.includes('gone') };
  }

  // ── C: a won field whose lead host died still lays a claim that holds ──────
  for (const variant of ['zeroed', 'removed']) {
    const S = stage();
    S.hostile('H1', S.N.id, 60);
    S.hostile('H2', S.N.id, 1500);
    S.ours('P', S.cap.id, 120);
    const opened = openFieldAt(S.st, S.cap.id);
    const battle = S.st.ascent.activeBattle;
    if (!battle) { r[`C_${variant}`] = { opened, staged: false }; continue; }
    const lead = battle.invaderArmyId;
    battle.theirArmyIds = [...new Set([...(battle.theirArmyIds ?? []), 'H1', 'H2'])];
    battle.outcome = 'we-rout';
    battle.over = true;
    if (variant === 'zeroed') {
      S.army(lead).units = { spearmen: 0, archers: 0, heavyInfantry: 0 };
    } else {
      S.st.armies = S.st.armies.filter((a) => a.id !== lead);
      S.st.invasions = S.st.invasions.filter((x) => x.armyId !== lead);
    }
    finishBattle(S.st, 'hold');
    const now = hostileClaimAt(S.st, S.cap.id);
    const bearerNow = now && S.army(now.armyId);
    const heldNow = Boolean(now && size(bearerNow) > 0 && bearerNow.landId === S.cap.id);
    S.tick();
    const later = hostileClaimAt(S.st, S.cap.id);
    r[`C_${variant}`] = { opened, staged: true, lead, heldNow, bearer: now?.armyId ?? null, heldLater: Boolean(later) || S.cap.ownerId === S.rival.id };
  }

  // ── D: nothing of ours walks back onto carried ground by itself ───────────
  {
    const S = stage();
    S.hostile('H', S.cap.id, 900);
    S.claim('H');
    const [p1, p2] = S.ring.slice(1);
    const P = S.ours('P', p1.id, 400);
    const Q = S.ours('Q', (p2 ?? p1).id, 400);
    P.orders = { kind: 'defend', landId: S.cap.id };
    P.autoDefend = false;
    Q.autoDefend = true;
    let walked = false; let fields = 0;
    for (let t = 1; t <= 5; t += 1) {
      S.tick();
      if (!hostileClaimAt(S.st, S.cap.id)) break;
      if (S.st.movementOrders.some((m) => (m.armyId === 'P' || m.armyId === 'Q') && (m.toLandId === S.cap.id || m.targetLandId === S.cap.id || m.path?.at?.(-1) === S.cap.id))
        || S.army('P')?.landId === S.cap.id || S.army('Q')?.landId === S.cap.id) walked = true;
      if (S.field()) fields += 1;
    }
    r.D = { walked, fields };
    // Control: the player's own order still sends a host to retake it.
    const S2 = stage();
    S2.hostile('H', S2.cap.id, 900);
    S2.claim('H');
    const R = S2.ours('R', S2.ring[1].id, 400);
    setArmyOrders(S2.st, R.id, { kind: 'defend', landId: S2.cap.id });
    r.Dcontrol = S2.st.movementOrders.some((m) => m.armyId === 'R') || R.landId === S2.cap.id;
  }

  // ── E: a won retake lifts the claim ───────────────────────────────────────
  for (const variant of ['won', 'abandoned']) {
    const S = stage();
    S.hostile('H', S.cap.id, 500);
    S.hostile('H2', S.cap.id, 300);
    S.claim('H');
    S.ours('P', S.cap.id, 2400);
    const opened = openFieldAt(S.st, S.cap.id);
    const battle = S.st.ascent.activeBattle;
    if (!battle) { r[`E_${variant}`] = { opened, staged: false }; continue; }
    const retake = battle.retake === true;
    if (variant === 'won') { battle.outcome = 'they-rout'; battle.over = true; finishBattle(S.st, 'hold'); }
    else { finishBattle(S.st, 'retreat'); }
    const liftedNow = hostileClaimAt(S.st, S.cap.id) === undefined;
    let refield = 0;
    for (let t = 1; t <= 3; t += 1) { S.tick(); if (S.field()) refield += 1; }
    r[`E_${variant}`] = {
      opened, staged: true, retake, liftedNow, refield,
      stillOurs: S.cap.ownerId === PLAYER,
      claimLater: Boolean(hostileClaimAt(S.st, S.cap.id)),
      onCap: ['H', 'H2'].filter((id) => S.army(id)?.landId === S.cap.id && size(S.army(id)) > 0),
    };
  }

  // ── control: a court paid to go home still takes its claim with it ────────
  {
    const S = stage();
    S.hostile('H', S.cap.id, 900);
    S.claim('H');
    S.rival.relations = 99;
    S.st.resources.gold = 1e7;
    const paid = buyOffHost(S.st, S.rival.id);
    r.Buy = { paid, lifted: hostileClaimAt(S.st, S.cap.id) === undefined, homeward: S.record('H')?.pillaged === true };
  }

  return r;
});

console.log(JSON.stringify(out));
check('A  a claimant whose campaign clock runs low stays and takes the capital',
  out.A.stayed && out.A.flipped, `stayed ${out.A.stayed}, flipped ${out.A.flipped} at t${out.A.t}, clock ${out.A.clock}`);
check('A2 a host is never called home in the middle of a live field',
  out.A2.opened && out.A2.fought > 2 && !out.A2.quitMidFight, `opened ${out.A2.opened}, fought ${out.A2.fought} ticks, quit ${out.A2.quitMidFight}`);
check('B1 the claim passes to the next host of the coalition, progress kept',
  out.B1.handed, `bearer ${out.B1.bearer}, progress ${out.B1.progress} (was ${out.B1.kept})`);
check('B1 and that host finishes the capture', out.B1.flipped);
check('B2 a column that joins the claim waits on the capital instead of vanishing',
  out.B2.joined && !out.B2.vanished, out.B2.trail.join(' → '));
for (const v of ['zeroed', 'removed']) {
  const c = out[`C_${v}`];
  check(`C  a field won with the lead host ${v} lays a claim a living host carries`,
    c.staged && c.heldNow, `lead ${c.lead}, bearer ${c.bearer}`);
  check(`C  and that claim still stands a season later (${v})`, c.staged && c.heldLater);
}
check('D  neither a "defend the capital" host nor the autopilot walks back onto carried ground',
  !out.D.walked && out.D.fields === 0, `walked ${out.D.walked}, fields ${out.D.fields}`);
check('D  but the player\'s own order still marches a host to retake it', out.Dcontrol === true);
check('E  winning a retake lifts the claim at once',
  out.E_won.staged && out.E_won.retake && out.E_won.liftedNow, JSON.stringify(out.E_won));
check('E  and the capital stays ours with no fresh field on it',
  out.E_won.stillOurs && !out.E_won.claimLater && out.E_won.refield === 0 && out.E_won.onCap.length === 0);
check('E  abandoning a retake leaves the claim standing',
  out.E_abandoned.staged && !out.E_abandoned.liftedNow, JSON.stringify(out.E_abandoned));
check('   a court paid to go home still lifts its claim', out.Buy.paid && out.Buy.lifted && out.Buy.homeward, JSON.stringify(out.Buy));

// ── sweep: did any claim vanish without being taken or retaken? ─────────────
const SEEDS = [1337, 4242, 99, 779, 2026, 31, 7, 55];
const totals = { claims: 0, flipped: 0, retaken: 0, bought: 0, abandoned: 0, refights: 0 };
const notes = [];
for (const seed of SEEDS) {
  const s = await page.evaluate(async ([seed]) => {
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const { liveBattles } = await import('/src/systems/ascent/fronts.ts');
    const PLAYER = 'dai-viet';
    let s = seed >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    let bought = 0;
    const drain = () => {
      let g = 0;
      while (st.pendingAscentPrompt && g++ < 40) {
        const p = st.pendingAscentPrompt;
        if (p.kind === 'run-over') break;
        const opts = (p.options ?? []).filter((o) => !String(o?.id ?? o).includes('buyoff'));
        const id = p.kind === 'coronation' ? 'crowned'
          : p.kind === 'founder' ? p.options[0]
          : p.kind === 'power-draft' ? (p.cards?.[0] ?? 'skip')
          : p.kind === 'hero-choice' ? (p.heroIds?.[0] ?? 'pass')
          : p.kind === 'conquer-target' ? 'hold'
          : (opts[0]?.id ?? opts[0] ?? 'ok');
        if (!resolveAscentPrompt(st, String(id))) st.pendingAscentPrompt = undefined;
      }
    };
    drain();
    const seen = new Set();
    const r = { claims: 0, flipped: 0, retaken: 0, bought, abandoned: 0, refights: 0, notes: [] };
    const abandonedAt = new Map();
    let hist = 0;
    for (let tick = 1; tick <= 400; tick += 1) {
      const before = st.siegeOrders
        .filter((o) => o.attackerKingdomId !== PLAYER && st.lands.find((l) => l.id === o.landId)?.ownerId === PLAYER)
        .map((o) => ({ landId: o.landId, attacker: o.attackerKingdomId, key: `${o.landId}:${o.openedTurn}` }));
      advanceAscentTick(st); drain();
      if (st.isDefeated || st.pendingAscentPrompt?.kind === 'run-over') break;
      for (const o of st.siegeOrders) {
        const key = `${o.landId}:${o.openedTurn}`;
        if (o.attackerKingdomId !== PLAYER && !seen.has(key)) { seen.add(key); r.claims += 1; }
      }
      const fresh = (st.ascent.battleHistory ?? []).slice(hist);
      hist = (st.ascent.battleHistory ?? []).length;
      for (const c of before) {
        if (st.siegeOrders.some((o) => o.landId === c.landId && o.attackerKingdomId !== PLAYER)) continue;
        const land = st.lands.find((l) => l.id === c.landId);
        if (land.ownerId !== PLAYER) { r.flipped += 1; continue; }
        const won = fresh.some((b) => b.landId === c.landId && b.role !== 'offence' && b.ourHosts > 0);
        if (won) { r.retaken += 1; continue; }
        r.abandoned += 1;
        abandonedAt.set(c.landId, tick);
        if (r.notes.length < 4) r.notes.push(`seed ${seed} t${tick}: claim on ${c.landId} vanished, land still ours, no retake`);
      }
      for (const b of liveBattles(st)) {
        const at = abandonedAt.get(b.landId);
        if (at !== undefined && tick - at <= 10 && b.role !== 'offence' && !b._counted) { b._counted = true; r.refights += 1; }
      }
    }
    return r;
  }, [seed]);
  for (const k of Object.keys(totals)) totals[k] += s[k];
  notes.push(...s.notes);
  console.log(`  seed ${seed}: claims ${s.claims}, flipped ${s.flipped}, retaken ${s.retaken}, abandoned ${s.abandoned}, re-fights after ${s.refights}`);
}
for (const n of notes.slice(0, 6)) console.log('     ' + n);
check('sweep saw enough claims to mean something', totals.claims >= 5, `${totals.claims} claims`);
check('sweep: no claim vanished without the flag turning or a retake', totals.abandoned === 0, `${totals.abandoned} abandoned of ${totals.claims}`);
check('sweep: no fresh field at ground whose claim was abandoned', totals.refights === 0, `${totals.refights}`);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: an enemy that wins the field stays until the flag turns'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
