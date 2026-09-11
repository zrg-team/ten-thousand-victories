/**
 * "By year four the invasion is far bigger than my empire."
 *
 * Plays Throne of Empires headless with a *competent* player policy — muster whenever the
 * capital is free, settle whenever there are settlers, build walls and barracks, keep every
 * host on autoDefend, fight every contact — and prints, per turn: the realm's field power,
 * the province that actually gets attacked, what the invader brings, and what the odds roll
 * makes of it.
 *
 * The point is the gap between "my realm" and "the province the host lands on", which is the
 * shape a fairness complaint takes.
 *
 * Usage: node test_scripts/diag/diag-empire-pressure.mjs [--seeds 6] [--turns 80] [--difficulty normal] [--verbose]
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5199';
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 6));
const TURNS = Number(arg('turns', 80));
const DIFFICULTY = arg('difficulty', 'normal');
const VERBOSE = process.argv.includes('--verbose');
// Counterfactuals, applied by hand to the live state each tick so one cause can be priced
// without changing the shipped systems: fed = hosts never run out of rations; clock = an
// invading host goes home after N seasons in the field; both = the two together.
const FIX = String(arg('fix', '')).split(',').filter(Boolean);
// How hungry for ground the played policy is. The build policy is identical across all three,
// so any difference in what attacks is attributable to province count alone.
const EXPAND = arg('expand', 'balanced'); // tall | balanced | wide

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });

const PLAY = async ([seed, turns, difficulty, fix, expand]) => {
  const orig = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    const GS = await import('/src/state/GameState.ts');
    const RT = await import('/src/systems/RealtimeSystem.ts');
    const War = await import('/src/systems/WarSystem.ts');
    const Acq = await import('/src/systems/AcquisitionSystem.ts');
    const Res = await import('/src/systems/ResourceSystem.ts');
    const Inv = await import('/src/systems/empire/InvasionSystem.ts');
    const Dip = await import('/src/systems/DiplomacySystem.ts');
    const Hero = await import('/src/systems/HeroSystem.ts');
    const Pol = await import('/src/systems/PoliticsSystem.ts');
    const Foreign = await import('/src/systems/ForeignEventSystem.ts');

    const st = GS.createEmpireGameState({ seaSides: 1, difficulty });
    const PID = 'dai-viet';
    const owned = () => st.lands.filter((l) => l.ownerId === PID);
    const myArmies = () => st.armies.filter((a) => a.kingdomId === PID && !a.isLevy);
    const men = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;
    const troops = () => myArmies().reduce((n, a) => n + men(a), 0);
    const invaderArmies = () => (st.invasions ?? [])
      .map((r) => st.armies.find((a) => a.id === r.armyId))
      .filter(Boolean);

    const rows = [];
    const events = [];
    const fights = [];
    let withdrawn = 0;
    let lost = 0;
    let gained = 0;

    // ── a competent player, played as a policy ──────────────────────────────
    const playTurn = () => {
      let guard = 0;
      while (st.pendingBattle && guard < 8) {
        guard += 1;
        const pb = st.pendingBattle;
        const land = st.lands.find((l) => l.id === pb.landId);
        const hasField = st.armies.some((a) => a.kingdomId === PID && a.landId === pb.landId && men(a) > 0 && !a.isLevy);
        fights.push({
          turn: st.turn, land: land ? land.name : '?', att: pb.attackerPower, def: pb.defenderPower,
          great: !!pb.isGreat, field: hasField,
        });
        Inv.resolvePendingBattle(st, hasField ? 'attack' : 'delegate');
      }
      if (st.pendingThreatAlert) { st.pendingThreatAlert = undefined; st.isPaused = false; }
      // Answer the court rather than dropping it — an unanswered card tanks stability and a
      // realm that collapses politically is measuring the wrong thing.
      if (st.pendingForeignCard) {
        const c = st.pendingForeignCard;
        const pick = c.choices.find((o) => !o.requiresArmy && !(o.delta && o.delta.gold < -st.resources.gold)) || c.choices[0];
        Foreign.resolveForeignChoice(st, pick.id);
        st.pendingForeignCard = undefined; st.isPaused = false;
      }
      if (st.pendingCourtRequest && !st.activePoliticsCard) {
        st.activePoliticsCard = st.pendingCourtRequest; st.pendingCourtRequest = undefined;
      }
      if (st.activePoliticsCard) {
        const c = st.activePoliticsCard;
        const pick = c.choices[0];
        Pol.choosePoliticsCard(st, pick.id);
        st.activePoliticsCard = undefined; st.isPaused = false;
      }

      // Take every champion the court offers, generals first — they are what lets a realm
      // field more than one host.
      if (st.activeHeroDraft && st.activeHeroDraft.length > 0) {
        const pick = st.activeHeroDraft.find((h) => h.type === 'general') || st.activeHeroDraft[0];
        Hero.recruitHero(st, pick.id);
      }

      // NOT autoDefend: in empire that flag is both 'march to intercept' and 'fight without
      // asking', so setting it hides the very prompts this harness is counting. Marches are
      // ordered by hand below instead.
      for (const a of myArmies()) a.autoDefend = false;

      // ── counterfactuals ────────────────────────────────────────────────────
      if (fix.includes('fed')) {
        for (const a of myArmies()) { a.rations = 9999; a.provisions = 9999; }
      }
      if (fix.includes('clock')) {
        for (const r of [...(st.invasions || [])]) {
          r.__age = (r.__age || 0) + 1;
          if (r.__age > 14) {
            st.armies = st.armies.filter((a) => a.id !== r.armyId);
            st.siegeOrders = st.siegeOrders.filter((o) => o.armyId !== r.armyId);
            st.invasions = st.invasions.filter((x) => x !== r);
            withdrawn += 1;
          }
        }
      }

      // Meet the wave: send the nearest free host to the owned province closest to a live host.
      const invs = invaderArmies();
      if (invs.length > 0) {
        for (const a of myArmies()) {
          if (st.movementOrders.some((o) => o.armyId === a.id)) continue;
          if (st.siegeOrders.some((o) => o.armyId === a.id)) continue;
          const here = st.lands.find((l) => l.id === a.landId);
          if (!here) continue;
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

      // Muster whenever the capital's yard is free, and provision the host for as long as the
      // larder can pay for — an empire-mode host is never resupplied again (`resupplyHost` is
      // wired only into ConquestScene), so what it leaves with is what it has for life.
      const recLand = War.getRecruitmentLand(st);
      const training = recLand ? War.getRecruitmentOrder(st, recLand.id) : undefined;
      if (!training) {
        const freeHero = st.heroes.find((h) => !h.assignedTo && h.type === 'general')
          || st.heroes.find((h) => !h.assignedTo);
        const spare = Math.floor(st.resources.humans - 220);
        if (freeHero && spare >= 200) {
          const n = Math.min(900, spare);
          const food = Math.max(0, Math.floor(Math.min(st.resources.food * 0.6, Math.ceil(n / 100) * 40)));
          const sup = Math.max(0, Math.floor(Math.min(st.resources.supplies * 0.4, Math.ceil(n / 150) * 30)));
          War.queueRecruitment(st, freeHero.id, n, food, sup, 'balanced');
        }
      }

      // Expand: bribe a village if the purse allows, send a diplomat if not, settle empty ground.
      const landCap = expand === 'tall' ? 4 : expand === 'balanced' ? 9 : 99;
      const purseFloor = expand === 'wide' ? 60 : 220;
      if (owned().length < landCap && st.acquisitionOrders.filter((o) => o.buyerId === PID).length < 2) {
        const mine = new Set(owned().map((l) => l.id));
        const adjacent = st.lands.filter((l) => l.ownerId === 'neutral'
          && l.neighbors.some((n) => mine.has(n))
          && !st.acquisitionOrders.some((o) => o.landId === l.id));
        const empty = adjacent.filter((l) => !l.hasVillage);
        const villages = adjacent.filter((l) => l.hasVillage);
        let done = false;
        for (const v of villages.sort((a, b) => Acq.getGoldBribeCost(st, a) - Acq.getGoldBribeCost(st, b))) {
          if (st.resources.gold >= Acq.getGoldBribeCost(st, v) + purseFloor) { Acq.bribeLand(st, v.id); done = true; break; }
        }
        if (!done) {
          const diplomat = st.heroes.find((h) => !h.assignedTo && h.type !== 'general');
          for (const v of villages.sort((a, b) => Acq.getDiplomacySuppliesCost(st, a) - Acq.getDiplomacySuppliesCost(st, b))) {
            if (diplomat && st.resources.supplies >= Acq.getDiplomacySuppliesCost(st, v) + 40) {
              Acq.startDiplomaticClaim(st, v.id, diplomat.id); done = true; break;
            }
          }
        }
        if (!done && empty.length > 0 && st.resources.humans > Acq.getSettleHumansCost(st, empty[0]) + 260) {
          Acq.settleLand(st, empty[0].id);
        }
      }

      // Build. `BuildOption` is `{ type, canBuild, reason }` and upgrades come from a separate
      // `getUpgradeOptions` — reading `.building`/`.affordable` here silently built nothing at
      // all for the first four measured runs, so the realm never developed and the food rate
      // read as the game's rather than the bot's.
      const seatFirst = owned().slice().sort((a, b) => (b.type === 'castle' ? 1 : 0) - (a.type === 'castle' ? 1 : 0));
      let builtThisTurn = 0;
      for (const land of seatFirst) {
        if (builtThisTurn >= 1) break;
        if (Res.getBuildOrder(st, land.id)) continue;
        // A player watches the ledger: feed the realm first, then pay for it, then fortify.
        const want = st.resourceRates.food < 6
          ? ['farm', 'market', 'wall', 'mine', 'tower', 'barracks']
          : st.resourceRates.gold < 4
            ? ['market', 'mine', 'wall', 'tower', 'barracks', 'farm']
            : ['wall', 'tower', 'barracks', 'market', 'farm', 'mine'];
        const opts = Res.getBuildOptions(st, land).filter((o) => o.canBuild);
        const ups = Res.getUpgradeOptions(st, land).filter((o) => o.canUpgrade);
        let acted = false;
        for (const w of want) {
          const o = opts.find((x) => x.type === w);
          if (o) { acted = Res.buildDistrictBuilding(st, land.id, w); break; }
        }
        if (!acted) {
          for (const w of want) {
            const u = ups.find((x) => x.type === w);
            if (u) { acted = Res.upgradeDistrictBuilding(st, land.id, u.index); break; }
          }
        }
        if (acted) builtThisTurn += 1;
      }
    };

    const snapshot = () => {
      const invs = invaderArmies();
      const lands = owned();
      let contested;
      if (invs.length > 0 && lands.length > 0) {
        // Where a conquest host is headed in empire mode: the seat, always (chooseTarget).
        const target = lands.find((l) => l.type === 'castle') || lands[0];
        const fieldHere = st.armies
          .filter((a) => a.kingdomId === PID && a.landId === target.id && !a.isLevy)
          .reduce((n, a) => n + War.armyPower(st, a), 0);
        const garrison = (target.defense * 16 + target.localSoldiers * 2.5) * War.terrainDefenseMultiplier(target);
        contested = {
          land: target.name, defense: target.defense, militia: Math.round(target.localSoldiers),
          garrisonPower: Math.round(garrison), fieldPower: Math.round(fieldHere),
          total: Math.round(garrison + fieldHere),
        };
      }
      return {
        turn: st.turn, year: st.year, era: st.mandate ? st.mandate.era : '?',
        mandate: Math.round(st.mandate ? st.mandate.points : 0),
        lands: lands.length, troops: troops(), heroes: st.heroes.length,
        freeHeroes: st.heroes.filter((h) => !h.assignedTo).length, hostCount: myArmies().length,
        realmPower: Math.round(myArmies().reduce((n, a) => n + War.armyPower(st, a), 0)),
        wallPower: Math.round(lands.reduce((n, l) => n + l.defense * 16, 0)),
        playerMilitary: Math.round(Dip.getPlayerMilitary(st)),
        threatBudget: Math.round(st.threatBudget || 0),
        hosts: invs.length,
        invaderMen: invs.reduce((n, a) => n + men(a), 0),
        invaderPower: Math.round(invs.reduce((n, a) => n + War.armyPower(st, a), 0)),
        ult: st.pendingUltimatum ? (st.pendingUltimatum.isGreatInvasion ? 'GREAT' : 'minor') : null,
        gold: Math.round(st.resources.gold), food: Math.round(st.resources.food),
        foodRate: Math.round((st.resourceRates.food || 0) * 10) / 10, goldRate: Math.round((st.resourceRates.gold || 0) * 10) / 10,
        eaten: myArmies().reduce((n, a) => n + Math.max(1, Math.ceil(men(a) / 100)), 0),
        humans: Math.round(st.resources.humans), supplies: Math.round(st.resources.supplies),
        contested,
      };
    };

    let prevLands = owned().length;
    let prevArmies = new Map();
    for (let t = 0; t < turns; t += 1) {
      playTurn();
      RT.advanceRealtimeMonth(st);
      const now = owned().length;
      if (now < prevLands) { events.push({ turn: st.turn, kind: 'land-lost', n: prevLands - now, left: now }); lost += prevLands - now; }
      if (now > prevLands) gained += now - prevLands;
      prevLands = now;
      // Hosts that vanished without a fight: starved out or dissolved for arrears.
      const live = new Map(myArmies().map((a) => [a.id, men(a)]));
      for (const [id, was] of prevArmies) {
        if (!live.has(id)) events.push({ turn: st.turn, kind: 'host-gone', id, was });
      }
      prevArmies = live;
      const snap = snapshot();
      // Ration runway: how many more seasons the field can stay in the field at all.
      const hosts = myArmies();
      snap.runway = hosts.length
        ? Math.min(...hosts.map((a) => Math.floor(a.rations / Math.max(1, Math.ceil(men(a) / 100)))))
        : null;
      snap.starving = hosts.filter((a) => a.rations <= 0).length;
      rows.push(snap);
      if (st.isDefeated) { events.push({ turn: st.turn, kind: 'DEFEAT', reason: st.defeatReason }); break; }
    }
    return {
      seed, rows, events, fights,
      repelled: st.invasionsRepelled || 0, withdrawn, lost, gained,
      defeated: !!st.isDefeated, defeatReason: st.defeatReason, ascended: !!st.victory, endTurn: st.turn,
      defeatTurn: st.isDefeated ? st.turn : null,
      peakLands: Math.max(...rows.map((r) => r.lands)),
    };
  } finally {
    Math.random = orig;
  }
};

const runs = [];
for (let i = 0; i < SEEDS; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  runs.push(await page.evaluate(PLAY, [1000 + i * 7919, TURNS, DIFFICULTY, FIX, EXPAND]));
}
await browser.close();

// ── report ──────────────────────────────────────────────────────────────────
const pad = (v, w) => String(v).padStart(w);
console.log(`=== EMPIRE PRESSURE — ${SEEDS} seeds, ${TURNS} turns, difficulty=${DIFFICULTY} ===\n`);

for (const run of runs) {
  const y4 = run.rows.find((r) => r.turn >= 32) || run.rows[run.rows.length - 1];
  console.log(`seed ${run.seed}  ${run.defeated ? `DEFEAT t${run.defeatTurn} (${run.defeatReason})` : run.ascended ? `ASCENDED t${run.endTurn}` : `survived t${run.endTurn}`}  repelled=${run.repelled}  peakLands=${run.peakLands}  endLands=${run.rows[run.rows.length - 1].lands}`);
  if (VERBOSE) {
    console.log('  turn yr era       lands troops realmPow wallPow budget hosts invMen invPow runway ult    contested');
    for (const r of run.rows) {
      console.log(`  ${pad(r.turn, 4)} ${pad(r.year, 2)} ${String(r.era).padEnd(9)} ${pad(r.lands, 5)} ${pad(r.troops, 6)} ${pad(r.realmPower, 8)} ${pad(r.wallPower, 7)} ${pad(r.threatBudget, 6)} ${pad(r.hosts, 5)} ${pad(r.invaderMen, 6)} ${pad(r.invaderPower, 6)} ${pad(r.runway === null ? "-" : r.runway, 6)} ${String(r.ult || '').padEnd(6)} ${r.contested ? `${r.contested.land}: ${r.contested.total} (walls ${r.contested.garrisonPower} + field ${r.contested.fieldPower})` : ''}`);
    }
  }
  console.log(`  YEAR 4 (t${y4.turn}): lands=${y4.lands} troops=${y4.troops} realmPower=${y4.realmPower} wallPower=${y4.wallPower} | hosts=${y4.hosts} men=${y4.invaderMen} power=${y4.invaderPower}`);
  for (const f of run.fights.filter((f) => f.turn <= 44)) {
    console.log(`    t${f.turn} FIGHT ${f.land}${f.great ? ' [GREAT]' : ''}: attacker ${f.att} vs defender ${f.def}  ratio ${(f.att / Math.max(1, f.def)).toFixed(2)}${f.field ? '' : '  (no field army)'}`);
  }
  for (const e of run.events.filter((e) => e.turn <= 44)) console.log(`    t${e.turn} ${e.kind} ${JSON.stringify(e)}`);
  console.log('');
}

console.log('=== RATIO: invader power vs what defends the seat ===');
console.log(' turn |  invPow | seatDef | ratio | hosts | lands | troops | wallPow | runway | starv');
for (let t = 4; t <= TURNS; t += 4) {
  const rs = runs.map((r) => r.rows.find((x) => x.turn === t)).filter(Boolean);
  if (!rs.length) continue;
  const avg = (f) => rs.reduce((n, r) => n + f(r), 0) / rs.length;
  const withInv = rs.filter((r) => r.hosts > 0 && r.contested);
  const invPow = withInv.length ? withInv.reduce((n, r) => n + r.invaderPower, 0) / withInv.length : 0;
  const seat = withInv.length ? withInv.reduce((n, r) => n + r.contested.total, 0) / withInv.length : 0;
  console.log(` ${pad(t, 4)} | ${pad(Math.round(invPow), 7)} | ${pad(Math.round(seat), 7)} | ${pad(seat ? (invPow / seat).toFixed(2) : '-', 5)} | ${pad(avg((r) => r.hosts).toFixed(1), 5)} | ${pad(avg((r) => r.lands).toFixed(1), 5)} | ${pad(Math.round(avg((r) => r.troops)), 6)} | ${pad(Math.round(avg((r) => r.wallPower)), 7)} | ${pad(avg((r) => r.foodRate).toFixed(1), 6)} | ${pad(avg((r) => r.eaten).toFixed(1), 5)} | ${pad((rs.filter((r) => r.runway !== null).length ? (rs.filter((r) => r.runway !== null).reduce((n, r) => n + r.runway, 0) / rs.filter((r) => r.runway !== null).length).toFixed(0) : "-"), 6)} | ${pad(avg((r) => r.starving || 0).toFixed(1), 5)}`);
}

const allFights = runs.flatMap((r) => r.fights);
const lopsided = allFights.filter((f) => f.att > f.def * 1.5);
console.log(`\nfights asked of the player: ${allFights.length}; lopsided (attacker > 1.5x defender): ${lopsided.length} (${allFights.length ? Math.round((lopsided.length / allFights.length) * 100) : 0}%)`);
console.log(`defeats: ${runs.filter((r) => r.defeated).length}/${runs.length}  (turns: ${runs.filter((r) => r.defeated).map((r) => r.defeatTurn).join(', ') || 'none'})`);
console.log(`lands: peak avg ${(runs.reduce((n, r) => n + r.peakLands, 0) / runs.length).toFixed(1)}, end avg ${(runs.reduce((n, r) => n + r.rows[r.rows.length - 1].lands, 0) / runs.length).toFixed(1)}`);
console.log(`provinces lost per run: ${(runs.reduce((n, r) => n + r.lost, 0) / runs.length).toFixed(1)}; taken: ${(runs.reduce((n, r) => n + r.gained, 0) / runs.length).toFixed(1)}; hosts repelled: ${(runs.reduce((n, r) => n + r.repelled, 0) / runs.length).toFixed(1)}`);
const byLand = {};
for (const f of allFights) byLand[f.field ? 'with a field host' : 'garrison alone'] = (byLand[f.field ? 'with a field host' : 'garrison alone'] || 0) + 1;
console.log(`fights by defence: ${JSON.stringify(byLand)}`);
console.log(errors.length ? `console errors: ${errors.slice(0, 3).join(' | ')}` : 'no console errors');
