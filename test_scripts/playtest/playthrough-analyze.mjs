// Instrumented full playthrough: measures decision density, idle ticks, tension /
// near-losses, territory lost, combat, and whether strategic levers matter — to
// diagnose what would make the game GREAT rather than merely winnable.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(555, 'empire'));
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
  const ABIL = await import('/src/systems/empire/AbilitySystem.ts');
  const FE = await import('/src/systems/ForeignEventSystem.ts');
  const PID = 'dai-viet';
  const owned = () => st.lands.filter((l) => l.ownerId === PID);
  const empires = () => st.kingdoms.filter((k) => k.id !== PID && !k.isDefeated);
  const army = () => st.armies.filter((a) => a.kingdomId === PID).reduce((s, a) => s + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
  const incoming = () => st.armies.filter((a) => a.kingdomId !== PID).reduce((s, a) => s + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
  const stability = () => st.dynastyStatus ? Math.round(st.court.stability * 0.4 + (100 - st.dynastyStatus.farmerUnrest) * 0.35 + st.dynastyStatus.nobleRelations * 0.25) : 100;

  const play = () => {
    let acts = 0;
    try {
      if (st.pendingCourtRequest) { st.activePoliticsCard = st.pendingCourtRequest; st.pendingCourtRequest = undefined; }
      if (st.activePoliticsCard) { POL.choosePoliticsCard(st, st.activePoliticsCard.choices[0].id); acts++; }
      // Resolve vassalage/foreign demands: defy if we have an army, else submit.
      if (st.pendingForeignCard) {
        const hasArmy = st.armies.some((a) => a.kingdomId === PID);
        const choice = st.pendingForeignCard.choices.find((c) => FE.canTakeForeignChoice(st, c)) ?? st.pendingForeignCard.choices[0];
        FE.resolveForeignChoice(st, (hasArmy ? st.pendingForeignCard.choices.find((c) => c.id === 'defy') : null)?.id ?? choice.id);
        acts++;
      }
      // Royal commands: stabilise when shaky, rally weary hosts, levy under heavy threat.
      if (stability() < 48 && !ABIL.abilityBlockedReason(st, ABIL.ABILITIES[2])) { if (ABIL.useAbility(st, 'decree')) acts++; }
      if (st.armies.some((a) => a.kingdomId === PID && a.morale < 55) && !ABIL.abilityBlockedReason(st, ABIL.ABILITIES[0])) { if (ABIL.useAbility(st, 'rally')) acts++; }
      if (st.activeHeroDraft && st.activeHeroDraft.length) { if (HERO.recruitHero(st, st.activeHeroDraft[0].id)) acts++; }
      // Keep a strong standing army — rebuild/reinforce when it drops below strength.
      const myTroops = st.armies.filter((a) => a.kingdomId === PID).reduce((s, a) => s + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
      if (myTroops < 1000 && st.recruitmentOrders.length === 0) {
        const gen = st.heroes.find((h) => !h.assignedTo);
        if (gen && st.resources.humans > 500 && st.resources.food > 250 && st.resources.supplies > 150) { if (WAR.queueRecruitment(st, gen.id, 1000, 300, 220)) acts++; }
      }
      // Seat heroes in court, but keep at least one free to command the army.
      const free = st.heroes.filter((h) => !h.assignedTo);
      for (const pos of st.court.unlockedSeats) { if (free.length <= 1) break; if (!st.court.seats[pos]) { const h = free.shift(); if (COURT.assignHeroToPosition(st, h.id, pos)) acts++; } }
      if (st.acquisitionOrders.length < 2) {
        const ownedIds = new Set(owned().map((l) => l.id));
        const cands = st.lands.filter((l) => l.ownerId === 'neutral' && l.neighbors.some((n) => ownedIds.has(n))).sort((a, b) => ACQ.getGoldBribeCost(st, a) - ACQ.getGoldBribeCost(st, b));
        for (const c of cands) { if (st.resources.gold >= ACQ.getGoldBribeCost(st, c) && ACQ.bribeLand(st, c.id)) { acts++; break; } if (st.resources.humans >= ACQ.getSettleHumansCost(st, c) + 200 && ACQ.settleLand(st, c.id)) { acts++; break; } }
      }
      for (const land of owned()) { if (RES.getBuildOrder(st, land.id)) continue; if (st.resources.gold < 55) break; let did = false; for (const type of ['farm', 'market', 'barracks', 'wall', 'communalHall']) { if (RES.buildDistrictBuilding(st, land.id, type)) { acts++; did = true; break; } } if (!did) { for (let i = 0; i < land.buildings.length; i++) { if (RES.upgradeDistrictBuilding(st, land.id, i)) { acts++; break; } } } }
      for (const p of EDICT.allProjects()) { if (!EDICT.projectBlockedReason(st, p)) { if (EDICT.enactProject(st, p.id)) acts++; } }
      const emp = empires();
      if (emp.length) {
        const strongest = [...emp].sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0];
        if ((strongest.power ?? 0) > 80 && st.court.influence > 30) { if (ESP.fomentUnrest(st, strongest.id)) acts++; }
        const warlike = [...emp].sort((a, b) => (b.warAppetite ?? 0) - (a.warAppetite ?? 0))[0];
        if ((warlike.warAppetite ?? 0) > 65 && st.court.influence > 20) { if (DIP.proposePact(st, warlike.id, 0)) acts++; }
      }
    } catch (e) { /* ignore */ }
    return acts;
  };

  // Metrics
  let idleTicks = 0, ticks = 0, minStability = 100, minArmyWhenThreatened = Infinity, landsLostToSieges = 0, peakIncoming = 0;
  let peakLands = 1, tightestDefense = Infinity; // ratio army/incoming when incoming>0
  const perYearActs = {}; let curYear = st.year; let actsThisYear = 0;
  let prevOwned = new Set(owned().map((l) => l.id));
  // New-mechanic firing counters (Phases 3-6).
  const fired = { secession: 0, coalition: 0, vassalage: 0, eliteArmiesSeen: 0 };
  const seenToast = new Set();
  const scanToasts = () => {
    for (const tt of (st.toasts ?? [])) {
      if (seenToast.has(tt.id)) continue; seenToast.add(tt.id);
      if (/secede|revolt/i.test(tt.text)) fired.secession++;
      if (/COALITION/i.test(tt.text)) fired.coalition++;
    }
    if (st.pendingForeignCard?.id?.startsWith('vassalage')) fired.vassalage++;
    fired.eliteArmiesSeen = Math.max(fired.eliteArmiesSeen, st.armies.filter((a) => a.kingdomId === PID && (a.elite ?? 0) > 0).length);
  };
  const bestGeneral = () => Math.max(0, ...st.heroes.map((h) => h.battlesWon ?? 0));

  for (let i = 0; i < 700; i++) {
    const a = play();
    actsThisYear += a;
    R.advanceRealtimeMonth(st);
    scanToasts();
    ticks++;
    if (a === 0) idleTicks++;
    minStability = Math.min(minStability, stability());
    peakLands = Math.max(peakLands, owned().length);
    const inc = incoming();
    peakIncoming = Math.max(peakIncoming, inc);
    if (inc > 0) { tightestDefense = Math.min(tightestDefense, army() / Math.max(1, inc)); minArmyWhenThreatened = Math.min(minArmyWhenThreatened, army()); }
    // territory lost: an owned land from last tick no longer owned
    const nowOwned = new Set(owned().map((l) => l.id));
    for (const id of prevOwned) if (!nowOwned.has(id)) landsLostToSieges++;
    prevOwned = nowOwned;
    if (st.year !== curYear) { perYearActs[curYear] = actsThisYear; actsThisYear = 0; curYear = st.year; }
    if (st.victory || st.isDefeated) break;
  }

  const yearsPlayed = st.year;
  const actsList = Object.values(perYearActs);
  const avgActsPerYear = actsList.length ? Math.round(actsList.reduce((s, v) => s + v, 0) / actsList.length) : 0;

  return {
    outcome: st.victory ? 'ASCENSION' : st.isDefeated ? `DEFEAT(${st.defeatReason})` : 'cap',
    yearsPlayed, ticks, era: st.mandate.era, mandate: Math.round(st.mandate.points),
    idlePct: Math.round((idleTicks / ticks) * 100),
    avgActsPerYear,
    peakLands, finalLands: owned().length, landsLostToSieges,
    minStability, peakIncoming,
    tightestDefenseRatio: Number.isFinite(tightestDefense) ? Number(tightestDefense.toFixed(2)) : null,
    invasionsRepelled: st.invasionsRepelled ?? 0,
    edicts: st.mandate.edicts.length,
    newMechanics: { ...fired, bestGeneralWins: bestGeneral() },
  };
});

console.log(JSON.stringify(out, null, 2));
console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
