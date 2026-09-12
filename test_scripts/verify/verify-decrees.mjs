// Verifies Chiếu Chỉ — the pressure under the throne's standing law (docs/phase-1/11-chieu-chi.md).
//
// What is asserted, and why these and not others:
//  - Overreach BITES. A realm forced past its authority cap must realise strictly less from the
//    same decrees than a matched realm inside it. If this fails, weight is decorative and the
//    whole system is a label on a number nobody reads.
//  - Defiance is reachable AND escapable. A province driven under 25 stops receiving decree
//    effects; easing the tax and repealing a law must bring it back. A pressure system with no
//    lever is a timer, and this mode already has enough of those.
//  - Repeal accounts exactly: weight returns, the `project-<id>` modifier is gone, points are
//    spent and NOT refunded (else enact→repeal farms estate standing for free).
//  - Estates move when a decree is enacted, and the crisis floor actually withholds edict points.
//  - Rival/campaign are untouched — `state.mandate` is the guard, so a rival save must have no
//    estates, no compliance drift, and identical court bonuses.
//
// Always exits 0 — parse stdout for `PASS:` vs `CHECK:`.
// Needs a live Vite dev server; set DEV_URL if it is not on 5173.
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(URL, { waitUntil: 'networkidle' });

const out = await page.evaluate(async () => {
  const { createAscentGameState, createInitialGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { advanceRealtimeMonth } = await import('/src/systems/RealtimeSystem.ts');
  const D = await import('/src/systems/DecreeSystem.ts');
  const { enactProject, repealProject } = await import('/src/systems/empire/EdictSystem.ts');
  const { getCourtBonuses } = await import('/src/systems/CourtSystem.ts');
  const { calculatePlayerResourceRates, refreshAllLandOutputs } = await import('/src/systems/ResourceSystem.ts');
  const { refreshPlayerVisibility } = await import('/src/systems/LandSystem.ts');
  const { grantEdictPoints } = await import('/src/systems/empire/MandateSystem.ts');
  const { REALM_PROJECTS } = await import('/src/data/edicts.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');

  const seed = (n) => {
    let s = n >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const results = {};
  const fresh = () => {
    seed(20260820);
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    st.ascent.autoResolveBattles = true;
    st.ascent.promptQueue = [];
    st.isPaused = false;
    return st;
  };

  // ── 1. Overreach bites ────────────────────────────────────────────────────
  //
  // Two identical realms. One is handed enough points to pass every founding-era law it can and
  // does so; the other passes nothing. Then both are ticked and their realised court bonuses
  // compared. The over-legislated realm must end up getting LESS per unit of law.
  {
    const inside = fresh();
    const over = fresh();

    // Same three cheap laws in both, so the modifier stack is identical...
    const cheap = REALM_PROJECTS.filter((p) => p.kind === 'edict' && p.era === 'founding' && !p.unlock).slice(0, 3);
    for (const st of [inside, over]) {
      st.mandate.edictPoints = 40;
      for (const p of cheap) enactProject(st, p.id);
    }
    // ...then the overreached realm is pushed far past what it can carry, by fiat rather than by
    // enacting more laws, so the two realms' MODIFIER stacks stay identical and the only
    // difference measured is the weight.
    over.mandate.edicts.push(...REALM_PROJECTS.filter((p) => p.kind === 'edict' && !cheap.includes(p)).map((p) => p.id));

    results.capInside = D.authorityCap(inside);
    results.weightInside = D.standingWeight(inside);
    results.weightOver = D.standingWeight(over);
    results.overreachInside = D.overreach(inside);
    results.overreachOver = D.overreach(over);

    for (let i = 0; i < 25; i += 1) { advanceAscentTick(inside); advanceAscentTick(over); }

    results.complianceInside = D.averageCompliance(inside);
    results.complianceOver = D.averageCompliance(over);
    results.realisedInside = D.realisedFactor(inside);
    results.realisedOver = D.realisedFactor(over);
    results.overreachBites = results.realisedOver < results.realisedInside;
  }

  // ── 2. Defiance is reachable and escapable ────────────────────────────────
  {
    const st = fresh();
    // Let the realm actually grow first. A one-province realm has a trade multiplier of exactly 1
    // and no court output bonuses, so there is no realm share for defiance to withhold and the
    // comparison below would pass on an equality that proves nothing — which is what the first
    // run of this harness reported (57 == 57), and how the misplaced scaling was found.
    // Grow FIRST, then legislate. Enacting land-survey up front angers the merchants, which now
    // measurably raises acquisition cost — enough to cost this seed its second province, and the
    // check would then be comparing a one-province realm that has no realm share to withhold. The
    // estates working is not a reason for the test to measure nothing.
    for (let i = 0; i < 60; i += 1) advanceAscentTick(st);
    st.mandate.edictPoints = 20;
    enactProject(st, 'land-survey');
    results.landsHeld = st.lands.filter((l) => l.ownerId === PLAYER).length;

    const land = st.lands.filter((l) => l.ownerId === PLAYER)
      .reduce((best, l) => (l.outputs.gold + l.outputs.food > best.outputs.gold + best.outputs.food ? l : best));

    const sum = (o) => o.food + o.supplies + o.gold;
    land.compliance = 65;
    refreshAllLandOutputs(st);
    const obedientOut = sum(land.outputs);
    land.compliance = 20;
    results.defiantBand = D.complianceBand(land);
    results.defiantRealised = D.landRealised(land);
    refreshAllLandOutputs(st);
    const defiantOut = sum(land.outputs);

    results.defiantPoorer = defiantOut < obedientOut;
    results.defiantOut = defiantOut;
    results.obedientOut = obedientOut;

    // Escapable: drive it down, then ease the tax and repeal, and it must climb back over 45.
    land.compliance = 18;
    st.taxRate = 0.2;
    st.taxPolicy = 'lenient';
    st.mandate.edictPoints = 20;
    repealProject(st, 'land-survey');
    for (let i = 0; i < 30; i += 1) advanceAscentTick(st);
    results.recovered = land.compliance;
    results.defianceEscapable = land.compliance > 45;
  }

  // ── 3. Repeal accounts exactly ────────────────────────────────────────────
  {
    const st = fresh();
    st.mandate.edictPoints = 20;
    const before = { points: st.mandate.edictPoints, weight: D.standingWeight(st) };
    enactProject(st, 'levy-reform');
    const project = REALM_PROJECTS.find((p) => p.id === 'levy-reform');
    const afterEnact = {
      points: st.mandate.edictPoints,
      weight: D.standingWeight(st),
      vo: D.estateStanding(st, 'vo'),
      hasModifier: st.activeCourtModifiers.some((m) => m.id === 'project-levy-reform'),
    };
    const terms = D.repealTerms(st, 'levy-reform');
    const repealed = repealProject(st, 'levy-reform');
    const afterRepeal = {
      points: st.mandate.edictPoints,
      weight: D.standingWeight(st),
      hasModifier: st.activeCourtModifiers.some((m) => m.id === 'project-levy-reform'),
    };

    results.repealWorked = repealed;
    results.weightReturned = afterRepeal.weight === before.weight;
    results.modifierAdded = afterEnact.hasModifier;
    results.modifierRemoved = !afterRepeal.hasModifier;
    // Enact cost 1, repeal cost 2 — six points on hand must become three, never four or more.
    results.pointsSpent = before.points - afterRepeal.points;
    results.pointsExpected = (project.edictCost ?? 0) + terms.cost;
    results.repealNotFarmable = results.pointsSpent === results.pointsExpected;
    // Enacting a war edict must have pleased the soldiers.
    results.estatesMoveOnEnact = afterEnact.vo > 50;
  }

  // ── 4. The crisis floor withholds edict points ────────────────────────────
  {
    const st = fresh();
    st.mandate.estates = { si: 10, nong: 50, thuong: 50, vo: 50 };
    const before = st.mandate.edictPoints;
    grantEdictPoints(st, 3);
    results.siCrisisWithholds = st.mandate.edictPoints === before;
    st.mandate.estates.si = 60;
    grantEdictPoints(st, 3);
    results.siHealthyGrants = st.mandate.edictPoints === before + 3;
  }

  // ── 5. The rule decrees actually change a rule ────────────────────────────
  //
  // The whole point of Phase 2 is that a decree can do something a `CourtModifier` cannot express.
  // Each of these compares a realm with the decree against the same realm without it, so a pass
  // means the rule reached the system it claims to change — not merely that the id is in a list.
  {
    const R = await import('/src/systems/decree/rules.ts');
    const { armyPower } = await import('/src/systems/WarSystem.ts');
    const { chargeAmbition } = await import('/src/systems/ascent/AmbitionSystem.ts');
    const { refreshPlayerVisibility } = await import('/src/systems/LandSystem.ts');
    const { famineReady } = await import('/src/systems/ascent/FamineSystem.ts');
    const { rollSummonHeroes } = await import('/src/systems/ascent/SummonSystem.ts');
    const { heroPayroll } = await import('/src/systems/ResourceSystem.ts');

    const withDecree = (id) => { const st = fresh(); st.mandate.edicts.push(id); return st; };

    // Sổ đinh — the registry makes the whole map legible.
    const plain = fresh(); refreshPlayerVisibility(plain);
    const registry = withDecree('so-dinh'); refreshPlayerVisibility(registry);
    results.fogPlain = plain.lands.filter((l) => l.isVisible).length;
    results.fogRegistry = registry.lands.filter((l) => l.isVisible).length;
    results.registryReveals = results.fogRegistry > results.fogPlain
      && results.fogRegistry === registry.lands.length;

    // Nam tiến — conquest charges half the usual ambition.
    const a1 = fresh(); chargeAmbition(a1, 'province');
    const a2 = withDecree('nam-tien'); chargeAmbition(a2, 'province');
    results.ambitionPlain = a1.ascent.ambition;
    results.ambitionSouth = a2.ascent.ambition;
    results.namTienHalves = a2.ascent.ambition < a1.ascent.ambition;

    // Lệ làng — every other standing law costs one more weight.
    const w1 = fresh(); w1.mandate.edicts.push('levy-reform');
    const w2 = fresh(); w2.mandate.edicts.push('levy-reform', 'le-lang');
    results.weightPlain = D.standingWeight(w1);
    results.weightCustom = D.standingWeight(w2);
    // levy-reform 1 + le-lang 1 + surcharge 1 on levy-reform = 3, against a plain 1.
    results.leLangSurcharges = results.weightCustom === results.weightPlain + 2;

    // Ngụ binh ư nông — a recalled host fights at three-quarters.
    const rc = withDecree('ngu-binh-u-nong');
    const host = rc.armies.find((army) => army.kingdomId === PLAYER);
    let recallRatio = null;
    if (host) {
      const before = armyPower(rc, host);
      host.recalledUntil = rc.turn + 5;
      recallRatio = armyPower(rc, host) / (before || 1);
    }
    results.recallRatio = recallRatio;
    results.recallPenalty = recallRatio !== null && Math.abs(recallRatio - 0.75) < 0.01;

    // Hà đê sứ — a delta realm stops raising the famine card.
    const hungry = fresh();
    hungry.resourceRates.food = -20;
    hungry.resources.food = 5;
    const diked = withDecree('ha-de-su');
    diked.resourceRates.food = -20;
    diked.resources.food = 5;
    // The decree only protects a realm that actually holds water or rice ground.
    const wet = diked.lands.find((l) => l.ownerId === PLAYER);
    if (wet) wet.terrainSummary.riceFields = Math.max(1, wet.terrainSummary.riceFields);
    const wetPlain = hungry.lands.find((l) => l.ownerId === PLAYER);
    if (wetPlain) wetPlain.terrainSummary.riceFields = Math.max(1, wetPlain.terrainSummary.riceFields);
    results.faminePlain = famineReady(hungry);
    results.famineDiked = famineReady(diked);
    results.dikeStopsFamine = results.faminePlain && !results.famineDiked;

    // Chiếu cầu hiền — the gacha tilts, and the payroll pays for it.
    const payPlain = fresh();
    const paySeek = withDecree('chieu-cau-hien');
    results.payrollPlain = heroPayroll(payPlain);
    results.payrollSeeking = heroPayroll(paySeek);
    results.seekingCostsMore = results.payrollSeeking > results.payrollPlain;
    // Roll a batch both ways and compare how often a gold-or-better card appears.
    const goldShare = (st) => {
      let high = 0, rolls = 0;
      for (let i = 0; i < 120; i += 1) {
        const { heroIds } = rollSummonHeroes(st);
        for (const id of heroIds) {
          const hero = st.heroDeck.find((h) => h.id === id) ?? st.heroes.find((h) => h.id === id);
          rolls += 1;
          if (hero && (hero.rarity === 'Epic' || hero.rarity === 'Legendary')) high += 1;
        }
      }
      return rolls > 0 ? high / rolls : 0;
    };
    seed(777); results.gachaPlain = goldShare(fresh());
    seed(777); results.gachaSeeking = goldShare(withDecree('chieu-cau-hien'));
    results.seekingTiltsGacha = results.gachaSeeking > results.gachaPlain;

    // Sùng Phật — monastic champions cost nothing.
    const sangha = withDecree('sung-phat');
    const monk = sangha.heroes.find((h) => h.monastic) ?? sangha.heroes[0];
    if (monk) { monk.monastic = true; monk.upkeepGold = Math.max(10, monk.upkeepGold); }
    const sanghaBase = fresh();
    const monkBase = sanghaBase.heroes.find((h) => h.id === monk?.id) ?? sanghaBase.heroes[0];
    if (monkBase) { monkBase.monastic = true; monkBase.upkeepGold = monk?.upkeepGold ?? 10; }
    results.sanghaFrees = heroPayroll(sangha) < heroPayroll(sanghaBase);

    // Every rule reader answers false on a realm that has not passed its decree — the guard that
    // stops a rule leaking into runs that never chose it.
    const clean = fresh();
    results.rulesInertWhenUnpassed = !R.farmsWhenIdle(clean) && !R.paperMoney(clean)
      && !R.marchSouth(clean) && !R.tattooedArms(clean) && !R.registryTallies(clean);
  }

  // ── 6. The raised instruments actually reach the player ───────────────────
  //
  // A decree nobody is ever offered is content that does not exist. These drive the real offer
  // builder against realms constructed to deserve each instrument, then answer the prompt through
  // the real resolver — so a pass means the whole path works, not merely that the data is present.
  {
    const O = await import('/src/systems/decree/OfferSystem.ts');

    // Du — a starving realm must be offered the granaries.
    const starving = fresh();
    starving.resourceRates.food = -30;
    starving.resources.food = 10;
    const duOffer = O.buildDecreeOffer(starving);
    results.duOffered = duOffer?.instrument === 'du' && duOffer.projectIds.includes('du-chan-te');

    // Le — a loyal, obedient province must propose its own custom. Fed and calm, with nobody
    // seated, so a du or a sac cannot outrank it: this must measure the offer, not the ordering.
    const quietVillage = (compliance) => {
      const st = fresh();
      st.resourceRates.food = 20; st.resources.food = 500; st.court.stability = 70;
      st.ascent.waveInFlight = false; st.ascent.capitalLostTicks = 0;
      for (const hero of st.heroes) hero.assignedTo = undefined;
      st.court.seats = {};
      for (const land of st.lands.filter((l) => l.ownerId === PLAYER)) {
        land.loyalty = 90; land.compliance = compliance;
      }
      return st;
    };
    const village = quietVillage(90);
    const leOffer = O.buildDecreeOffer(village);
    results.leOffered = leOffer?.instrument === 'le' && Boolean(leOffer.targetId);

    // Granting a custom locally must move the province that asked, and cost no weight.
    let localWorked = false, localWeight = null;
    if (leOffer?.targetId) {
      const before = D.standingWeight(village);
      const land = village.lands.find((l) => l.id === leOffer.targetId);
      const beforeLoyalty = land.loyalty;
      O.resolveDecreeOffer(village, `le:${leOffer.projectIds[0]}:local`, leOffer);
      localWeight = D.standingWeight(village) - before;
      localWorked = land.loyalty >= beforeLoyalty;
    }
    results.leLocalFree = localWeight === 0 && localWorked;

    // Ratifying it realm-wide must cost weight and reach every province.
    const village2 = quietVillage(85);
    const leOffer2 = O.buildDecreeOffer(village2);
    let realmWeight = null;
    if (leOffer2?.instrument === 'le') {
      const before = D.standingWeight(village2);
      O.resolveDecreeOffer(village2, `le:${leOffer2.projectIds[0]}:realm`, leOffer2);
      realmWeight = D.standingWeight(village2) - before;
    }
    results.leRealmCostsWeight = realmWeight !== null && realmWeight > 0;

    // Refusing a custom must cost the village, not the throne.
    const village3 = quietVillage(90);
    const leOffer3 = O.buildDecreeOffer(village3);
    let refusedDrop = null;
    if (leOffer3?.targetId) {
      const land = village3.lands.find((l) => l.id === leOffer3.targetId);
      const before = D.landCompliance(land);
      O.resolveDecreeOffer(village3, 'decline', leOffer3);
      refusedDrop = before - D.landCompliance(land);
    }
    results.leRefusalCosts = refusedDrop === 15;

    // A du must lapse on its own and hand its weight back.
    const lapse = fresh();
    lapse.resourceRates.food = -30;
    lapse.resources.food = 10;
    const before = D.standingWeight(lapse);
    O.resolveDecreeOffer(lapse, 'decree:du-chan-te', { instrument: 'du' });
    results.duStanding = lapse.mandate.edicts.includes('du-chan-te');
    results.duHasExpiry = Boolean(lapse.mandate.temporary?.['du-chan-te']);
    for (let i = 0; i < 40; i += 1) advanceAscentTick(lapse);
    results.duLapsed = !lapse.mandate.edicts.includes('du-chan-te');
    results.duWeightReturned = D.standingWeight(lapse) === before;

    // Dien Hong reads the estates rather than offering a best answer.
    const united = fresh();
    united.mandate.estates = { si: 70, nong: 70, thuong: 70, vo: 70 };
    results.dienHongUnited = O.resolveDienHong(united);
    const divided = fresh();
    divided.mandate.estates = { si: 70, nong: 20, thuong: 70, vo: 70 };
    results.dienHongDivided = O.resolveDienHong(divided);
    results.dienHongReadsEstates = results.dienHongUnited === 'united' && results.dienHongDivided === 'divided';

    // A quiet, well-fed, ordinary realm must be offered nothing at all — the instruments are
    // raised by circumstance, and one that fires unconditionally is just another law card.
    const quiet = fresh();
    quiet.resourceRates.food = 20;
    quiet.resources.food = 500;
    quiet.court.stability = 70;
    for (const land of quiet.lands.filter((l) => l.ownerId === PLAYER)) {
      land.loyalty = 50; land.compliance = 65;
    }
    for (const hero of quiet.heroes) hero.assignedTo = undefined;
    quiet.ascent.waveInFlight = false;
    quiet.ascent.capitalLostTicks = 0;
    results.quietOffersNothing = O.buildDecreeOffer(quiet) === undefined;
  }

  // ── 7. Sources, schools and the reign's name ──────────────────────────────
  {
    const S = await import('/src/systems/decree/SchoolSystem.ts');
    const RV = await import('/src/systems/decree/RivalDecreeSystem.ts');
    const { buildLawOptions } = await import('/src/systems/ascent/CourtLaneSystem.ts');
    const { projectBlockedReason } = await import('/src/systems/empire/EdictSystem.ts');
    const { tickGreatPowersYear } = await import('/src/systems/empire/GreatPowersSystem.ts');

    // Hero-authored decrees: gated on the champion, not on the era.
    const noHero = fresh();
    noHero.heroes = noHero.heroes.filter((h) => h.id !== 'real-tran-hung-dao');
    const hichDef = REALM_PROJECTS.find((p) => p.id === 'hich-tuong-si');
    results.heroGateBlocks = Boolean(projectBlockedReason(noHero, hichDef));
    const withHero = fresh();
    withHero.heroes.push({ ...withHero.heroes[0], id: 'real-tran-hung-dao', assignedTo: undefined });
    results.heroGateOpens = !projectBlockedReason(withHero, hichDef)
      || !String(projectBlockedReason(withHero, hichDef)).includes('write this');

    // A story teaching a law bypasses the era gate, not the price.
    const taught = fresh();
    const lateDef = REALM_PROJECTS.find((p) => p.id === 'golden-age');
    results.eraGateBlocks = String(projectBlockedReason(taught, lateDef) ?? '').length > 0;
    taught.mandate.taughtDecrees = ['golden-age'];
    taught.mandate.edictPoints = 20;
    results.taughtBypassesEra = !projectBlockedReason(taught, lateDef);

    // Rival counter-decrees: a hostile neighbour legislates, and warming to them clears it.
    const rivalled = fresh();
    // Past the opening grace: a neighbour needs time to notice you before it proclaims.
    rivalled.turn = 200;
    for (const k of rivalled.kingdoms) if (k.id !== PLAYER) k.relations = 10;
    tickGreatPowersYear(rivalled);
    results.rivalDecreed = RV.rivalDecrees(rivalled).length > 0;
    results.rivalModifier = rivalled.activeCourtModifiers.some((m) => m.id.startsWith('rival-decree-'));
    if (results.rivalDecreed) {
      for (const k of rivalled.kingdoms) if (k.id !== PLAYER) k.relations = 80;
      RV.reconcileRivalDecrees(rivalled);
    }
    results.rivalCleared = RV.rivalDecrees(rivalled).length === 0
      && !rivalled.activeCourtModifiers.some((m) => m.id.startsWith('rival-decree-'));

    // Schools: committing to one shuts its opposite, and unlocks a capstone.
    const legalist = fresh();
    legalist.mandate.edicts.push('han-dien', 'coin-reform', 'tribute-system');
    results.committed = S.committedSchool(legalist);
    results.oppositeLocked = S.isSchoolLocked(legalist, 'phat') && !S.isSchoolLocked(legalist, 'phap');
    results.capstoneReady = S.capstoneReady(legalist, 'phap');
    const buddhistDef = REALM_PROJECTS.find((p) => p.id === 'chieu-khuyen-nong');
    results.lockedSchoolBlocks = String(projectBlockedReason(legalist, buddhistDef) ?? '').length > 0;

    // The Legalist capstone frees weight entirely and starts the country bleeding.
    S.takeCapstone(legalist, 'phap');
    results.capstoneTaken = S.hasCapstone(legalist, 'phap');
    results.capstoneFreesWeight = !Number.isFinite(D.authorityCap(legalist)) && D.overreach(legalist) === 0;
    const beforeBleed = D.averageCompliance(legalist);
    for (let i = 0; i < 10; i += 1) advanceAscentTick(legalist);
    results.capstoneBleeds = D.averageCompliance(legalist) < beforeBleed;

    // The reign gets a name off what it actually did.
    results.reignNamed = S.reignName(legalist);
    results.reignIsSpecific = results.reignNamed !== S.reignName(fresh());

    // Runs diverge: the law card is a weighted draw, not a fixed sort.
    //
    // Measured on the ACTUAL CARD — one draw of four, the thing a player is shown — rather than on
    // the eligible pool. Draining the pool with six draws proves nothing: at the founding era only
    // nine laws are reachable at all, so six draws of four necessarily see every one of them and
    // the old form of this check reported 100% overlap for a deck that was working correctly.
    const cards = [];
    const seen = new Set();
    for (let run = 0; run < 12; run += 1) {
      seed(1000 + run * 977);
      const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
      st.mandate.edictPoints = 40;
      const card = buildLawOptions(st);
      cards.push(card);
      for (const id of card) seen.add(id);
    }
    results.distinctLawsSeen = seen.size;
    results.poolSeen = cards[0]?.length ?? 0;
    // Identical cards across every seed is the failure the sort had; anything less is a deck.
    const identical = cards.every((card) => card.join(',') === cards[0].join(','));
    let worstOverlap = 0;
    for (let a = 0; a < cards.length; a += 1) {
      for (let b = a + 1; b < cards.length; b += 1) {
        const shared = cards[a].filter((id) => cards[b].includes(id)).length;
        worstOverlap = Math.max(worstOverlap, shared / Math.max(1, cards[a].length));
      }
    }
    results.worstOverlap = worstOverlap;
    results.distinctCards = new Set(cards.map((c) => [...c].sort().join(','))).size;
    results.runsDiverge = !identical && results.distinctCards >= 4;
  }

  // ── 8. EVERY decree does something ────────────────────────────────────────
  //
  // The guard against the worst failure this system can have: a card that names an effect the
  // code never delivers. It is invisible — the decree enacts, the toast fires, the id joins
  // `mandate.edicts`, and nothing happens. Seven decrees shipped in exactly that state and no
  // other check noticed, because every other check tests a decree it already knows about.
  //
  // So this one knows about none of them. It walks the whole catalogue, enacts each on a fresh
  // realm, and asserts the world is measurably different afterwards — court bonuses, realm rates,
  // province outputs, the capital, the roster, the wave clock, or the vassal list. A decree that
  // moves none of those is not implemented, whatever its card says.
  {
    const R = await import('/src/systems/decree/rules.ts');
    const O = await import('/src/systems/decree/OfferSystem.ts');
    const { getCourtBonuses: courtBonuses } = await import('/src/systems/CourtSystem.ts');

    // A compact reading of everything a decree could plausibly move.
    const snapshot = (st) => JSON.stringify({
      bonuses: courtBonuses(st),
      rates: st.resourceRates,
      outputs: st.lands.filter((l) => l.ownerId === PLAYER).map((l) => [l.id, l.outputs, l.defense, l.localSoldiers, Math.round(l.compliance ?? 65), l.loyalty]),
      capital: st.ascent?.capitalLandId,
      capitalLost: st.ascent?.capitalLostTicks,
      heroes: st.heroes.map((h) => [h.id, h.upkeepGold, JSON.stringify(h.stats), (h.traits ?? []).join('|')]),
      lands: st.lands.map((l) => l.ownerId),
      vassals: st.kingdoms.map((k) => Boolean(k.vassalage)),
      invaders: st.armies.filter((a) => a.kingdomId !== PLAYER).map((a) => a.units),
      modifiers: st.activeCourtModifiers.map((m) => m.id).sort(),
      stability: Math.round(st.court.stability),
      estates: st.mandate?.estates,
      fog: st.lands.filter((l) => l.isVisible).length,
      exam: st.mandate?.examTicks,
      temporary: Object.keys(st.mandate?.temporary ?? {}).sort(),
    });

    // A realm rich enough that every decree has something to act on: provinces to redistribute
    // between, a rival weak enough to crown, a host abroad, a champion at court.
    const rigged = () => {
      const st = fresh();
      st.resources = { food: 500, supplies: 500, gold: 5000, humans: 800 };
      st.mandate.edictPoints = 40;
      st.mandate.era = 'mandate';
      st.court.stability = 55;
      // Twelve, not seven: `wide-registry` unlocks at ten provinces, and a rig that cannot satisfy an
      // unlock reports the decree as unimplemented when it is only unreachable.
      const neutral = st.lands.filter((l) => l.ownerId !== PLAYER).slice(0, 12);
      for (const [i, land] of neutral.entries()) {
        land.ownerId = PLAYER;
        land.loyalty = 90;
        land.compliance = 80;
        land.localSoldiers = 60 + i * 10;
        land.outputs = { food: 5 + i, supplies: 3 + i, gold: 4 + i, humans: 0 };
        land.terrainSummary.riceFields = Math.max(1, land.terrainSummary.riceFields);
      }
      for (const k of st.kingdoms) if (k.id !== PLAYER) { k.power = 20; k.relations = 70; }
      const hero = st.heroes[0];
      if (hero) { hero.assignedTo = 'court:marshal'; st.court.seats.marshal = hero.id; hero.monastic = true; }
      st.ascent.wave = 3;
      st.ascent.ticksToWave = 2;
      st.ascent.lastWaveBoss = true;
      st.ascent.waveInFlight = false;
      // Satisfy every ProjectUnlock, or the enact is refused for reasons that have nothing to do
      // with whether the decree is implemented — which is what this check is actually asking.
      st.ascent.wavesSurvived = 40;
      st.ascent.level = 20;
      st.storiesEnded = ['a', 'b', 'c'];
      const legendary = st.heroes[0];
      if (legendary) legendary.rarity = 'Legendary';
      for (const id of ['real-tran-hung-dao', 'real-nguyen-trai', 'real-chu-van-an', 'quan-ha-de', 'real-le-quy-don']) {
        if (!st.heroes.some((h) => h.id === id)) st.heroes.push({ ...st.heroes[0], id, assignedTo: undefined, traits: [] });
      }
      refreshAllLandOutputs(st);
      st.resourceRates = calculatePlayerResourceRates(st);
      return st;
    };

    const inert = [];
    const checked = [];
    for (const project of REALM_PROJECTS) {
      const st = rigged();
      const before = snapshot(st);
      let applied = false;
      if (project.kind === 'edict' || project.kind === 'wonder') {
        applied = enactProject(st, project.id);
      } else if (project.kind === 'le') {
        applied = O.resolveDecreeOffer(st, `le:${project.id}:realm`, { instrument: 'le', targetId: st.lands.find((l) => l.ownerId === PLAYER)?.id });
      } else {
        applied = O.resolveDecreeOffer(st, `decree:${project.id}`, {
          instrument: project.kind,
          targetId: project.kind === 'sac' ? (st.heroes[0]?.id ?? undefined) : undefined,
        });
      }
      refreshAllLandOutputs(st);
      refreshPlayerVisibility(st);
      st.resourceRates = calculatePlayerResourceRates(st);
      const changed = snapshot(st) !== before;
      // A few decrees only show themselves through a reader at a call site the snapshot cannot
      // reach — a famine that has not happened, a crisis that has not landed. Named explicitly
      // rather than sniffed, so adding a decree and forgetting to implement it still fails here.
      const readers = {
        'ha-de-su': () => R.dikeOffice(st),
        'le-thuy-loi': () => R.dikeOffice(st),
        'hinh-thu': () => R.writtenCodeSeverity(st) < 1,
        'khoa-cu': () => R.examinations(st),
        'ngu-binh-u-nong': () => R.farmsWhenIdle(st),
        'sat-that': () => R.tattooedArms(st),
        'don-dien': () => R.militaryColonies(st),
        'nam-tien': () => R.marchSouth(st),
        'thai-ap': () => R.princelyFiefs(st),
        'chieu-cau-hien': () => R.seekingTheWorthy(st),
        'thong-bao-hoi-sao': () => R.paperMoney(st),
        'le-lang': () => R.villageCustom(st),
        'le-giap-binh': () => R.villageWatch(st),
        'hich-tuong-si': () => R.proclamationInForce(st),
        'du-ti-nan': () => R.courtInRefuge(st),
        'so-dinh': () => R.registryTallies(st),
        'sung-phat': () => R.sanghaPatronage(st),
        'han-dien': () => R.landLimit(st),
      };
      const ruleFires = readers[project.id] ? readers[project.id]() === true : false;
      if (!applied || (!changed && !ruleFires)) inert.push(project.id);
      else checked.push(project.id);
    }
    results.decreesChecked = checked.length;
    results.inertDecrees = inert;
    results.everyDecreeActs = inert.length === 0;
  }

  // ── 9. Rival mode is structurally untouched ───────────────────────────────
  {
    seed(4242);
    const rival = createInitialGameState();
    const bonusesBefore = JSON.stringify(getCourtBonuses(rival));
    const ratesBefore = JSON.stringify(calculatePlayerResourceRates(rival));
    for (let i = 0; i < 20; i += 1) advanceRealtimeMonth(rival);
    results.rivalHasNoMandate = !rival.mandate;
    results.rivalNoCompliance = rival.lands.every((l) => l.compliance === undefined);
    results.rivalRealised = D.realisedFactor(rival);
    // A fresh rival state's bonuses must be exactly what they were before the decree layer existed:
    // realisedFactor returns 1 with no mandate, so nothing is scaled.
    seed(4242);
    const rival2 = createInitialGameState();
    results.rivalBonusesStable = JSON.stringify(getCourtBonuses(rival2)) === bonusesBefore;
    results.rivalRatesStable = JSON.stringify(calculatePlayerResourceRates(rival2)) === ratesBefore;
  }

  return results;
});

await browser.close();

// ── Report ──────────────────────────────────────────────────────────────────
const r = out;
let failures = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`);
  else { failures += 1; console.log(`CHECK: ${label}${detail ? ` — ${detail}` : ''}`); }
};
const n = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v));

console.log('── Overreach ──');
console.log(`   authority cap ${r.capInside} · weight inside ${r.weightInside} · weight over ${r.weightOver}`);
console.log(`   overreach ${r.overreachInside} vs ${r.overreachOver}`);
console.log(`   compliance ${n(r.complianceInside)}% vs ${n(r.complianceOver)}%  ·  realised ×${n(r.realisedInside)} vs ×${n(r.realisedOver)}`);
check(r.overreachOver > 0, 'a realm past its cap is measurably overreached', `by ${r.overreachOver}`);
check(r.overreachBites, 'overreach reduces what the same decrees are worth', `×${n(r.realisedOver)} < ×${n(r.realisedInside)}`);

console.log('── Defiance ──');
check(r.defiantBand === 'defiant', 'a province at 20 is defiant', r.defiantBand);
check(r.defiantRealised === 0, 'a defiant province receives no decree effect', `realised ${r.defiantRealised}`);
check(r.defiantPoorer, 'a defiant province keeps only what it makes itself', `${n(r.defiantOut)} < ${n(r.obedientOut)} across ${r.landsHeld} provinces`);
check(r.defianceEscapable, 'easing tax and repealing brings it back over 45', `${n(r.recovered)}%`);

console.log('── Repeal ──');
check(r.repealWorked, 'repeal succeeds when affordable');
check(r.modifierAdded && r.modifierRemoved, 'the project modifier is added then removed by id');
check(r.weightReturned, 'weight returns exactly');
check(r.repealNotFarmable, 'points are spent, never refunded', `spent ${r.pointsSpent}, expected ${r.pointsExpected}`);
check(r.estatesMoveOnEnact, 'enacting a war edict pleases the soldiers');

console.log('── Estate crisis ──');
check(r.siCrisisWithholds, 'Si below 30 withholds edict points');
check(r.siHealthyGrants, 'a healthy Si grants them again');

console.log('── Rule decrees ──');
check(r.registryReveals, 'So dinh makes the whole map legible', `${r.fogPlain} -> ${r.fogRegistry} provinces`);
check(r.namTienHalves, 'Nam tien halves the ambition a conquest charges', `${n(r.ambitionPlain)} -> ${n(r.ambitionSouth)}`);
check(r.leLangSurcharges, 'Le lang surcharges every other standing law', `weight ${r.weightPlain} -> ${r.weightCustom}`);
check(r.recallPenalty, 'a recalled host fights at three-quarters', `x${n(r.recallRatio)}`);
check(r.dikeStopsFamine, 'Ha de su takes the famine card out of a delta realm deck');
check(r.seekingCostsMore, 'Chieu cau hien raises the payroll', `${r.payrollPlain} -> ${r.payrollSeeking}`);
check(r.seekingTiltsGacha, 'Chieu cau hien tilts the gacha toward gold', `${(r.gachaPlain * 100).toFixed(1)}% -> ${(r.gachaSeeking * 100).toFixed(1)}%`);
check(r.sanghaFrees, 'Sung Phat keeps monastic champions for nothing');
check(r.rulesInertWhenUnpassed, 'every rule reader is inert until its decree is passed');

console.log('── Raised instruments ──');
check(r.duOffered, 'a starving realm is offered the granaries');
check(r.leOffered, 'a loyal, obedient province proposes its own custom');
check(r.leLocalFree, 'granting a custom locally costs no weight');
check(r.leRealmCostsWeight, 'ratifying it realm-wide does');
check(r.leRefusalCosts, 'refusing costs the village 15 compliance', `${r.leRefusalCosts ? 15 : r.leRefusalCosts}`);
check(r.duStanding && r.duHasExpiry, 'a du stands and carries an expiry');
check(r.duLapsed && r.duWeightReturned, 'it lapses on its own and returns its weight');
check(r.dienHongReadsEstates, 'Dien Hong reads the estates', `${r.dienHongUnited} / ${r.dienHongDivided}`);
check(r.quietOffersNothing, 'a quiet realm is offered nothing');

console.log('── Sources, schools, identity ──');
check(r.heroGateBlocks, 'a hero-authored decree is out of reach without its champion');
check(r.heroGateOpens, 'drawing the champion puts it in reach');
check(r.eraGateBlocks && r.taughtBypassesEra, 'a taught decree bypasses the era gate, not the price');
check(r.rivalDecreed && r.rivalModifier, 'a hostile empire legislates against the realm');
check(r.rivalCleared, 'warming the relationship takes their edict off');
check(r.committed === 'phap', 'three decrees of one school commits the reign', String(r.committed));
check(r.oppositeLocked, 'committing shuts the opposing school');
check(r.lockedSchoolBlocks, 'a locked school blocks its decrees');
check(r.capstoneReady && r.capstoneTaken, 'the capstone unlocks and can be taken');
check(r.capstoneFreesWeight, 'Nghiem phap frees weight entirely');
check(r.capstoneBleeds, 'and starts the country bleeding obedience');
check(r.reignIsSpecific, 'the reign is named off what it did', r.reignNamed);
check(r.runsDiverge, 'the law card is a draw, not a sort', `${r.distinctCards} distinct cards over 12 seeds, ${r.distinctLawsSeen} laws seen`);

console.log('── Every decree acts ──');
check(r.everyDecreeActs, 'every decree in the catalogue measurably changes the world',
  r.everyDecreeActs ? `${r.decreesChecked} decrees` : `inert: ${(r.inertDecrees || []).join(', ')}`);

console.log('── Mode isolation ──');
check(r.rivalHasNoMandate, 'rival mode has no mandate, so no decree system');
check(r.rivalNoCompliance, 'rival provinces are never given a compliance field');
check(r.rivalRealised === 1, 'realisedFactor is a no-op without a mandate', `x${r.rivalRealised}`);
check(r.rivalBonusesStable && r.rivalRatesStable, 'rival court bonuses and rates are unchanged');

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} CHECK(S) FAILED`}`);
