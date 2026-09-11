// Plays a FULL game of Throne of Empires with a reasonably competent bot policy
// (expand, build, recruit, defend, court, edicts, espionage) and prints a year-by-year
// journal + a final verdict. Used to judge whether the game is actually fun to play.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260703, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });

const out = await page.evaluate(async () => {
  const st = window.__mandateState;
  const R = await import('/src/systems/RealtimeSystem.ts');
  const ACQ = await import('/src/systems/AcquisitionSystem.ts');
  const RES = await import('/src/systems/ResourceSystem.ts');
  const WAR = await import('/src/systems/WarSystem.ts');
  const HERO = await import('/src/systems/HeroSystem.ts');
  const COURT = await import('/src/systems/CourtSystem.ts');
  const EDICT = await import('/src/systems/empire/EdictSystem.ts');
  const ESP = await import('/src/systems/empire/EspionageSystem.ts');
  const POL = await import('/src/systems/PoliticsSystem.ts');
  const DIP = await import('/src/systems/DiplomacySystem.ts');

  const PID = 'dai-viet';
  const owned = () => st.lands.filter((l) => l.ownerId === PID);
  const empires = () => st.kingdoms.filter((k) => k.id !== PID && !k.isDefeated);
  const armySize = () => st.armies.filter((a) => a.kingdomId === PID).reduce((s, a) => s + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
  const decisions = { built: 0, upgraded: 0, expanded: 0, recruited: 0, seated: 0, edicts: 0, sabotage: 0, incite: 0, envoy: 0, pacts: 0, cards: 0 };
  const events = [];
  const seenMsg = new Set();

  const noteToasts = () => {
    for (const tItem of (st.toasts ?? [])) {
      if (!seenMsg.has(tItem.id)) { seenMsg.add(tItem.id); if (tItem.kind !== 'reward') events.push(`   · ${tItem.text}`); }
    }
  };

  const play = () => {
    try {
      // Resolve any court card (pick the first option).
      if (st.pendingCourtRequest) { st.activePoliticsCard = st.pendingCourtRequest; st.pendingCourtRequest = undefined; }
      if (st.activePoliticsCard) { POL.choosePoliticsCard(st, st.activePoliticsCard.choices[0].id); decisions.cards++; }

      // Recruit offered heroes.
      if (st.activeHeroDraft && st.activeHeroDraft.length) { HERO.recruitHero(st, st.activeHeroDraft[0].id); }

      // Keep a standing army: if none training/fielded, raise one under a free hero.
      const myArmies = st.armies.filter((a) => a.kingdomId === PID);
      if (myArmies.length === 0 && st.recruitmentOrders.length === 0) {
        const gen = st.heroes.find((h) => !h.assignedTo);
        if (gen && st.resources.humans > 450 && st.resources.food > 200) {
          if (WAR.queueRecruitment(st, gen.id, 700, 250, 180)) decisions.recruited++;
        }
      }

      // Seat remaining free heroes in open court seats.
      const free = st.heroes.filter((h) => !h.assignedTo);
      for (const pos of st.court.unlockedSeats) {
        if (!st.court.seats[pos] && free.length) {
          const h = free.shift();
          if (COURT.assignHeroToPosition(st, h.id, pos)) decisions.seated++;
        }
      }

      // EXPAND FIRST — new land is the engine of the whole economy. Take the cheapest
      // adjacent neutral district each chance, keeping a small gold reserve.
      if (st.acquisitionOrders.length < 2) {
        const ownedIds = new Set(owned().map((l) => l.id));
        const cands = st.lands
          .filter((l) => l.ownerId === 'neutral' && l.neighbors.some((n) => ownedIds.has(n)))
          .sort((a, b) => ACQ.getGoldBribeCost(st, a) - ACQ.getGoldBribeCost(st, b));
        for (const c of cands) {
          if (st.resources.gold >= ACQ.getGoldBribeCost(st, c) && ACQ.bribeLand(st, c.id)) { decisions.expanded++; break; }
          if (st.resources.humans >= ACQ.getSettleHumansCost(st, c) + 200 && ACQ.settleLand(st, c.id)) { decisions.expanded++; break; }
        }
      }

      // Build economy, but keep a reserve so expansion isn't starved.
      for (const land of owned()) {
        if (RES.getBuildOrder(st, land.id)) continue;
        if (st.resources.gold < 55) break;
        let did = false;
        for (const type of ['farm', 'market', 'barracks', 'wall', 'communalHall']) {
          if (RES.buildDistrictBuilding(st, land.id, type)) { decisions.built++; did = true; break; }
        }
        if (!did) {
          for (let i = 0; i < land.buildings.length; i++) {
            if (RES.upgradeDistrictBuilding(st, land.id, i)) { decisions.upgraded++; break; }
          }
        }
      }

      // Enact any affordable edict / wonder.
      for (const p of EDICT.allProjects()) {
        if (!EDICT.projectBlockedReason(st, p)) { if (EDICT.enactProject(st, p.id)) decisions.edicts++; }
      }

      // Statecraft: cripple the strongest rising empire; pact the most warlike; post one envoy.
      const emp = empires();
      if (emp.length) {
        const strongest = [...emp].sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0];
        if ((strongest.power ?? 0) > 80 && st.court.influence > 30) {
          if (ESP.fomentUnrest(st, strongest.id)) decisions.sabotage++;
        }
        const warlike = [...emp].sort((a, b) => (b.warAppetite ?? 0) - (a.warAppetite ?? 0))[0];
        if ((warlike.warAppetite ?? 0) > 65 && st.court.influence > 20) {
          if (DIP.proposePact(st, warlike.id, 0)) decisions.pacts++;
        }
        if (st.court.influence > 55) {
          const rich = [...emp].sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0];
          if (ESP.inciteWar(st, rich.id)) decisions.incite++;
        }
        const noEnvoy = emp.find((k) => !k.ambassadorHeroId);
        if (noEnvoy && st.heroes.filter((h) => !h.assignedTo).length > 2) {
          if (ESP.postAmbassador(st, noEnvoy.id)) decisions.envoy++;
        }
      }
    } catch (e) { events.push(`   !! policy error: ${e.message}`); }
  };

  // ── Main loop: one iteration = one economy tick (~1 season) ──
  let lastYear = st.year;
  const MAX_TICKS = 600;
  for (let i = 0; i < MAX_TICKS; i++) {
    play();
    R.advanceRealtimeMonth(st);
    noteToasts();
    if (st.year !== lastYear) {
      lastYear = st.year;
      const top = [...empires()].sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0];
      events.push(`Y${st.year} ${st.mandate.era.padEnd(8)} | Mandate ${Math.round(st.mandate.points)} | lands ${owned().length} | army ${armySize()} | gold ${Math.round(st.resources.gold)} | top empire ${top ? top.name + ' P' + Math.round(top.power ?? 0) : '-'}`);
    }
    if (st.victory || st.isDefeated) break;
  }

  return {
    outcome: st.victory ? 'ASCENSION VICTORY' : st.isDefeated ? `DEFEAT (${st.defeatReason})` : 'survived to cap',
    finalYear: st.year, finalEra: st.mandate.era, finalMandate: Math.round(st.mandate.points),
    finalLands: owned().length, finalArmy: armySize(), invasionsRepelled: st.invasionsRepelled ?? 0,
    wonders: st.wondersBuilt ?? 0, edictsEnacted: st.mandate.edicts.length,
    decisions, journal: events,
  };
});

console.log('════════ THRONE OF EMPIRES — FULL PLAYTHROUGH ════════');
for (const line of out.journal) console.log(line);
console.log('──────────────────────────────────────────────');
console.log('OUTCOME:', out.outcome, '@ Year', out.finalYear);
console.log('Era:', out.finalEra, '| Mandate:', out.finalMandate, '| Lands:', out.finalLands, '| Army:', out.finalArmy);
console.log('Invasions repelled:', out.invasionsRepelled, '| Edicts:', out.edictsEnacted, '| Wonders:', out.wonders);
console.log('Player decisions:', JSON.stringify(out.decisions));
console.log('Console errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
