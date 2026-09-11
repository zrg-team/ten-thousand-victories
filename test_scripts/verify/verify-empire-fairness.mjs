/**
 * Throne of Empires is a war the realm can fight.
 *
 * The gate for the Year-4 fairness pass. The report was "by year four the invasion is far higher
 * than my empire", and the measurement behind it (see `diag/diag-empire-pressure.mjs` and
 * `diag/diag-invasion-curve.mjs`) found five separate mechanisms, each of which this file pins:
 *
 *   1 · a host on the realm's own ground is supplied and does not quietly starve
 *   2 · a province defending itself is a decision the player is offered, not a hidden roll
 *   3 · invading hosts leave, so pressure arrives in waves instead of accumulating for ever
 *   4 · ground held and invested in is meaningfully harder to take than ground claimed last week
 *   5 · a wave answers the realm rather than only the calendar — and difficulty moves it
 *
 * Each is measured on a real headless run or on the real spawner; none of them is read off a
 * constant. Usage: node test_scripts/verify/verify-empire-fairness.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });

// ── A played realm: muster, claim, build, march to meet what comes, fight it ────────────────
const played = await page.evaluate(async ([seeds, turns]) => {
  const GS = await import('/src/state/GameState.ts');
  const RT = await import('/src/systems/RealtimeSystem.ts');
  const War = await import('/src/systems/WarSystem.ts');
  const Acq = await import('/src/systems/AcquisitionSystem.ts');
  const Res = await import('/src/systems/ResourceSystem.ts');
  const Inv = await import('/src/systems/empire/InvasionSystem.ts');
  const HeroSys = await import('/src/systems/HeroSystem.ts');
  const Pol = await import('/src/systems/PoliticsSystem.ts');
  const Foreign = await import('/src/systems/ForeignEventSystem.ts');
  const PID = 'dai-viet';
  const men = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;

  const runOne = (seed) => {
    const orig = Math.random;
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      const st = GS.createEmpireGameState({ seaSides: 1, difficulty: 'normal' });
      const owned = () => st.lands.filter((l) => l.ownerId === PID);
      const mine = () => st.armies.filter((a) => a.kingdomId === PID && !a.isLevy);
      const hosts = () => (st.invasions ?? []).length;

      let decisions = 0; let garrisonDecisions = 0; let starvedTicks = 0;
      let lost = 0; let regained = 0; let maxHosts = 0; let hostTicks = 0;
      let prev = owned().length;

      for (let i = 0; i < turns; i += 1) {
        let guard = 0;
        while (st.pendingBattle && guard++ < 8) {
          decisions += 1;
          if (st.pendingBattle.garrisonOnly) garrisonDecisions += 1;
          const here = st.pendingBattle.landId;
          const field = st.armies.some((a) => a.kingdomId === PID && a.landId === here && !a.isLevy && men(a) > 0);
          Inv.resolvePendingBattle(st, field ? 'attack' : 'delegate');
        }
        if (st.pendingThreatAlert) { st.pendingThreatAlert = undefined; st.isPaused = false; }
        if (st.pendingForeignCard) {
          const c = st.pendingForeignCard;
          const pick = c.choices.find((o) => !o.requiresArmy) || c.choices[0];
          Foreign.resolveForeignChoice(st, pick.id);
          st.pendingForeignCard = undefined; st.isPaused = false;
        }
        if (st.pendingCourtRequest && !st.activePoliticsCard) {
          st.activePoliticsCard = st.pendingCourtRequest; st.pendingCourtRequest = undefined;
        }
        if (st.activePoliticsCard) {
          Pol.choosePoliticsCard(st, st.activePoliticsCard.choices[0].id);
          st.activePoliticsCard = undefined; st.isPaused = false;
        }
        if (st.activeHeroDraft?.length) {
          const pick = st.activeHeroDraft.find((h) => h.type === 'general') || st.activeHeroDraft[0];
          HeroSys.recruitHero(st, pick.id);
        }

        // March to meet what is coming, by hand — `autoDefend` also means "do not ask me".
        const invs = (st.invasions ?? []).map((r) => st.armies.find((a) => a.id === r.armyId)).filter(Boolean);
        if (invs.length > 0) {
          for (const a of mine()) {
            if (st.movementOrders.some((o) => o.armyId === a.id)) continue;
            if (st.siegeOrders.some((o) => o.armyId === a.id)) continue;
            let best; let bestD = Infinity;
            for (const inv of invs) {
              const il = st.lands.find((l) => l.id === inv.landId);
              if (!il) continue;
              for (const l of owned()) {
                const d = (l.x - il.x) ** 2 + (l.y - il.y) ** 2;
                if (d < bestD) { bestD = d; best = l; }
              }
            }
            if (best && best.id !== a.landId) War.issueMoveOrder(st, a.id, best.id);
          }
        }

        const recLand = War.getRecruitmentLand(st);
        if (recLand && !War.getRecruitmentOrder(st, recLand.id)) {
          const hero = st.heroes.find((h) => !h.assignedTo && h.type === 'general')
            || st.heroes.find((h) => !h.assignedTo);
          const spare = Math.floor(st.resources.humans - 220);
          if (hero && spare >= 200) {
            const n = Math.min(900, spare);
            War.queueRecruitment(st, hero.id, n,
              Math.floor(Math.min(st.resources.food * 0.6, Math.ceil(n / 100) * 40)),
              Math.floor(Math.min(st.resources.supplies * 0.4, Math.ceil(n / 150) * 30)), 'balanced');
          }
        }

        if (st.acquisitionOrders.filter((o) => o.buyerId === PID).length < 2) {
          const held = new Set(owned().map((l) => l.id));
          const adj = st.lands.filter((l) => l.ownerId === 'neutral'
            && l.neighbors.some((n) => held.has(n))
            && !st.acquisitionOrders.some((o) => o.landId === l.id));
          const villages = adj.filter((l) => l.hasVillage).sort((a, b) => Acq.getGoldBribeCost(st, a) - Acq.getGoldBribeCost(st, b));
          const v = villages[0];
          if (v && st.resources.gold >= Acq.getGoldBribeCost(st, v) + 90) Acq.bribeLand(st, v.id);
          else {
            const empty = adj.find((l) => !l.hasVillage);
            if (empty && st.resources.humans > Acq.getSettleHumansCost(st, empty) + 260) Acq.settleLand(st, empty.id);
          }
        }

        for (const land of owned().slice().sort((a, b) => (b.type === 'castle' ? 1 : 0) - (a.type === 'castle' ? 1 : 0))) {
          if (Res.getBuildOrder(st, land.id)) continue;
          const want = st.resourceRates.food < 6
            ? ['farm', 'market', 'wall', 'mine', 'tower', 'barracks']
            : ['wall', 'tower', 'barracks', 'market', 'farm', 'mine'];
          const opts = Res.getBuildOptions(st, land).filter((o) => o.canBuild);
          const ups = Res.getUpgradeOptions(st, land).filter((o) => o.canUpgrade);
          let acted = false;
          for (const w of want) { const o = opts.find((x) => x.type === w); if (o) { acted = Res.buildDistrictBuilding(st, land.id, w); break; } }
          if (!acted) for (const w of want) { const u = ups.find((x) => x.type === w); if (u) { acted = Res.upgradeDistrictBuilding(st, land.id, u.index); break; } }
          if (acted) break;
        }

        RT.advanceRealtimeMonth(st);

        const now = owned().length;
        if (now < prev) lost += prev - now; else if (now > prev) regained += now - prev;
        prev = now;
        maxHosts = Math.max(maxHosts, hosts());
        if (hosts() > 0) hostTicks += 1;
        starvedTicks += mine().filter((a) => a.rations <= 0).length;
        if (st.isDefeated || st.victory) break;
      }
      return {
        seed, decisions, garrisonDecisions, starvedTicks, lost, regained, maxHosts, hostTicks,
        endTurn: st.turn, lands: owned().length,
        repelled: st.invasionsRepelled ?? 0, mandate: Math.round(st.mandate?.points ?? 0),
        defeated: !!st.isDefeated, victory: !!st.victory,
      };
    } finally { Math.random = orig; }
  };

  return seeds.map(runOne);
}, [[1000, 8919, 16838, 24757, 32676], 72]);

const sum = (f) => played.reduce((n, r) => n + f(r), 0);
const totalDecisions = sum((r) => r.decisions);
const hostTicks = sum((r) => r.hostTicks);

console.log('=== A PLAYED REALM (5 seeds x 72 seasons, normal) ===');
for (const r of played) {
  console.log(`  seed ${String(r.seed).padStart(5)}  t${r.endTurn} lands=${r.lands} decisions=${r.decisions} (garrison ${r.garrisonDecisions})`
    + `  lost=${r.lost} retaken=${r.regained} maxHosts=${r.maxHosts} repelled=${r.repelled} mandate=${r.mandate}`
    + `${r.victory ? ' ASCENDED' : r.defeated ? ' DEFEATED' : ''}`);
}

check('a host on its own ground is never left starving', sum((r) => r.starvedTicks) === 0,
  `${sum((r) => r.starvedTicks)} host-seasons at zero rations`);
check('the player is asked to decide its defences', totalDecisions >= hostTicks / 8,
  `${totalDecisions} decisions over ${hostTicks} host-seasons`);
check('and a province defending alone is one of them', sum((r) => r.garrisonDecisions) > 0,
  `${sum((r) => r.garrisonDecisions)} garrison-only decisions`);
check('invading hosts do not accumulate', played.every((r) => r.maxHosts <= 6),
  `peak hosts per run: ${played.map((r) => r.maxHosts).join(', ')}`);
check('lost ground is recoverable', sum((r) => r.regained) > sum((r) => r.lost),
  `${sum((r) => r.lost)} lost, ${sum((r) => r.regained)} taken`);
check('weathering a wave pays', sum((r) => r.repelled) > 0 && sum((r) => r.mandate) > 0,
  `${sum((r) => r.repelled)} hosts repelled, ${sum((r) => r.mandate)} Mandate earned`);
check('a played realm is not simply wiped', played.filter((r) => r.defeated).length <= 1,
  `${played.filter((r) => r.defeated).length}/${played.length} defeated`);

// ── The rule itself: tenure and difficulty must both move what arrives ──────────────────────
const curve = await page.evaluate(async ([samples]) => {
  const GS = await import('/src/state/GameState.ts');
  const War = await import('/src/systems/WarSystem.ts');
  const Inv = await import('/src/systems/empire/InvasionSystem.ts');
  const Res = await import('/src/systems/ResourceSystem.ts');
  const PID = 'dai-viet';
  const men = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;

  const cell = ({ tenure, wall, difficulty, turn = 32, era = 'rivalry', great = false }) => {
    let pFall = 0; let waveMen = 0; let n = 0;
    for (let i = 0; i < samples; i += 1) {
      const orig = Math.random;
      let s = (4242 + i * 977) >>> 0;
      Math.random = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      try {
        const st = GS.createEmpireGameState({ seaSides: 1, difficulty });
        st.turn = turn;
        if (st.mandate) st.mandate.era = era;
        const seat = st.lands.find((l) => l.ownerId === PID);
        const queue = [...seat.neighbors];
        const held = new Set([seat.id]);
        while (held.size < 8 && queue.length) {
          const l = st.lands.find((x) => x.id === queue.shift());
          if (!l || held.has(l.id) || l.ownerId !== 'neutral') continue;
          l.ownerId = PID; held.add(l.id); queue.push(...l.neighbors);
        }
        for (const l of st.lands) { if (l.ownerId === PID && l.type !== 'castle') { l.defense += wall; l.loyalty = 80; } }
        Res.refreshAllLandOutputs(st);
        for (let g = 0; g < tenure; g += 1) Res.growProvincialMilitia(st);
        st.armies.push({
          id: 'h', kingdomId: PID, name: 'Host', landId: seat.id,
          units: { spearmen: 480, archers: 224, heavyInfantry: 96 },
          morale: 85, supply: 90, rations: 9999, provisions: 9999, level: 3, experience: 0, experienceToNextLevel: 999,
        });
        const k = st.kingdoms.find((x) => x.id !== PID && !x.isDefeated);
        // A Great Invasion is what `stageGreatInvasion` sends: a coalition under a named
        // warlord, sized up, marching for conquest. It is the mode's late-game pressure valve
        // and the only thing that should be able to take a province a realm has spent years on.
        Inv.launchOffMapInvasion(st, k.id, great
          ? { forceCoalition: 3, sizeMult: 1.3, warlordName: 'Thoát Hoan', forceConquest: true }
          : {});
        const hs = (st.invasions ?? []).map((r) => st.armies.find((a) => a.id === r.armyId)).filter(Boolean);
        const total = hs.reduce((m, a) => m + men(a), 0);
        const biggest = hs.sort((a, b) => men(b) - men(a))[0];
        const att = biggest ? War.armyPower(st, biggest) : 0;
        const frontier = st.lands.filter((l) => l.ownerId === PID && l.type !== 'castle').sort((a, b) => a.defense - b.defense);
        // A seat with no neutral ground to grow into leaves nothing to measure; skip that sample
        // rather than reading the capital as though it were a frontier province.
        if (frontier.length === 0) continue;
        const med = frontier[Math.floor(frontier.length / 2)];
        const def = (med.defense * 16 + med.localSoldiers * 2.5) * War.terrainDefenseMultiplier(med);
        const ratio = att / Math.max(1, def * 1.06 * (total > 1000 ? 0.8 : 0.85));
        pFall += Math.min(1, Math.max(0, (ratio - 0.9) / 0.2));
        waveMen += total;
        n += 1;
      } finally { Math.random = orig; }
    }
    return { pFall: n ? pFall / n : 0, waveMen: n ? Math.round(waveMen / n) : 0, n };
  };

  return {
    fresh: cell({ tenure: 2, wall: 0, difficulty: 'normal' }),
    settled: cell({ tenure: 12, wall: 8, difficulty: 'normal' }),
    mature: cell({ tenure: 30, wall: 22, difficulty: 'normal' }),
    // The same mature province two eras later. An endless mode must not let a realm buy
    // permanent safety: ground that holds comfortably in the rivalry era has to become
    // genuinely contested once the world has grown into the Mandate era.
    matureLate: cell({ tenure: 30, wall: 22, difficulty: 'normal', turn: 56, era: 'mandate' }),
    matureGreat: cell({ tenure: 30, wall: 22, difficulty: 'normal', turn: 56, era: 'mandate', great: true }),
    easy: cell({ tenure: 12, wall: 8, difficulty: 'easy' }),
    ironman: cell({ tenure: 12, wall: 8, difficulty: 'ironman' }),
  };
}, [20]);

console.log('\n=== THE RULE (turn 32, rivalry era, 8 provinces) ===');
const pct = (v) => `${Math.round(v * 100)}%`;
console.log(`  fresh claim (2 seasons, no wall)   P(falls) ${pct(curve.fresh.pFall)}   wave ${curve.fresh.waveMen} men`);
console.log(`  settled     (12 seasons, a wall)   P(falls) ${pct(curve.settled.pFall)}   wave ${curve.settled.waveMen} men`);
console.log(`  mature      (30 seasons, + tower)  P(falls) ${pct(curve.mature.pFall)}   wave ${curve.mature.waveMen} men`);
console.log(`  mature, two eras later (t56)       P(falls) ${pct(curve.matureLate.pFall)}   wave ${curve.matureLate.waveMen} men`);
console.log(`  mature, Great Invasion (t56)       P(falls) ${pct(curve.matureGreat.pFall)}   wave ${curve.matureGreat.waveMen} men`);
console.log(`  settled on easy                    wave ${curve.easy.waveMen} men`);
console.log(`  settled on ironman                 wave ${curve.ironman.waveMen} men`);

check('ground you just took falls', curve.fresh.pFall >= 0.7, `P=${pct(curve.fresh.pFall)}`);
check('and ground you have held and walled does not, as reliably',
  curve.mature.pFall < curve.settled.pFall - 0.1 && curve.settled.pFall < curve.fresh.pFall,
  `${pct(curve.fresh.pFall)} → ${pct(curve.settled.pFall)} → ${pct(curve.mature.pFall)}`);
check('holding ground buys safety now', curve.mature.pFall < 0.25, `P=${pct(curve.mature.pFall)} at turn 32`);
// The endless mode's other failure is a realm that has made itself permanently safe: there is
// no game left in one. Ordinary waves are *meant* to break on ground a player has spent years
// on — that is what the years bought — so the pressure valve is the Great Invasion, and it has
// to be able to take that ground. If it cannot, nothing can, and the mode is over.
check('an ordinary wave breaks on ground held for years', curve.matureLate.pFall < 0.3,
  `P=${pct(curve.matureLate.pFall)} at turn 56`);
check('but a Great Invasion still takes it', curve.matureGreat.pFall > 0.5,
  `coalition of ${curve.matureGreat.waveMen} men, P=${pct(curve.matureGreat.pFall)}`);
check('the wave answers the realm it faces', curve.mature.waveMen > curve.fresh.waveMen * 1.1,
  `${curve.fresh.waveMen} → ${curve.mature.waveMen} men`);
check('difficulty changes the size of what attacks',
  curve.ironman.waveMen > curve.settled.waveMen * 1.25 && curve.easy.waveMen < curve.settled.waveMen * 0.85,
  `easy ${curve.easy.waveMen} < normal ${curve.settled.waveMen} < ironman ${curve.ironman.waveMen}`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the realm can be defended, the player is asked to defend it, and holding ground pays'
  : 'FAIL: the Year-4 fairness properties do not hold');
process.exit(failed.length === 0 ? 0 : 1);
