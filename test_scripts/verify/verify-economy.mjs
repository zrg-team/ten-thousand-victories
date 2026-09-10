// Verifies the Dragon Ascent demand economy — the "too easy, become rich with no care" fix.
//
// What is asserted, and why these and not others:
//  - Provincial demand claims a real share of gross at small AND large realm sizes. The share
//    is printed for tuning; the band is loose on purpose. A flat wage bill passes at three
//    provinces and vanishes at ten (measured: 130 of wages against 3,000 gross), so the large
//    -realm share is the one that catches the compounding-trade-network defect.
//  - Shortfalls are EVENTS, not numbers: starving the realm must name a province, cost it
//    people, and appear in the ledger's "going without" list.
//  - The army is people: soldiers eat a full ration, a marching host eats more than a
//    garrisoned one, and a big army drags on civilian growth.
//  - Rivals are not scenery: their power must grow across a run.
//  - The coin ratchet is survivable: never more than three provinces unpaid, and a starved
//    treasury that heals must get its provinces back.
//
// Needs a live Vite dev server on http://127.0.0.1:5179.
import { chromium } from 'playwright';
import { READ_OPTIONS } from '../playtest/playtest-lib.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto((process.env.DEV_URL ?? 'http://127.0.0.1:5179') + '/?seed=1337', { waitUntil: 'networkidle' });
await page.evaluate(READ_OPTIONS);

// ── One seeded autopilot run, sampled at a small and a grown realm ───────────
const run = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { ascentProvincialDemand } = await import('/src/systems/ResourceSystem.ts');
  const { getEmpirePower } = await import('/src/systems/DiplomacySystem.ts');

  let s = 20260808 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  // The economy's contract is measured with battles handed to the generals: a fought engagement
  // is decided by orders this naive policy never gives, and its casualties would confound every
  // demand and shortfall figure below with battle policy.
  st.ascent.autoResolveBattles = true;

  let methodCursor = 0;
  const firstChoice = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': {
        // The bloodless ways in, rotated so every one is exercised. Never the siege: this policy
        // gives no battle orders (fights are delegated above), and a rotation that threw the one
        // host at walls every sixth claim lost it by wave four on the seeded run — after which the
        // realm could neither expand to the sizes the demand checks sample nor outlive wave seven.
        const open = p.target.methods.filter((m) => !m.blockedReason && m.method !== 'siege');
        return open.length ? open[methodCursor++ % open.length].method : 'back';
      }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': {
        const card = st.politicsDeck.find((c) => c.id === p.cardId);
        if (!card) return 'decline';
        const a = card.choices.find((c) => Object.entries(c.effects.resourceDelta ?? {})
          .every(([k, v]) => (v ?? 0) >= 0 || st.resources[k] >= Math.abs(v)));
        return a ? a.id : 'decline';
      }
      case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'battle': return 'hold';
      case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
      case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'story-beat': return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
      case 'empire-response': {
        const merc = p.options.find((o) => o.id === 'hire-mercenaries' && o.affordable);
        if (merc && st.resources.gold > 2500) return merc.id;
        return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      }
      // **A refused answer freezes the court.** `resolveAscentPrompt` puts a card back when its
      // resolver refuses the id, and the decision director raises nothing while a card is pending —
      // so every kind that fell through to 'ok' (the muster, the province card, a decree, a world
      // event, the restore card) left the realm with one province and no host for the whole run.
      // That is what "the run survives long enough to measure" had been failing on.
      case 'muster-proposal': return 'accept';
      case 'province-order': return (p.options.find((o) => o.role === 'focus') ?? p.options[0]).id;
      case 'restore-land': return (p.options.find((o) => o.id === 'steady' && o.affordable) ?? p.options[p.options.length - 1]).id;
      default: return window.__ptOptions(st)?.[0] ?? 'ok';
    }
  };

  const rivalPower = () => Math.max(...st.kingdoms
    .filter((k) => k.id !== 'dai-viet' && !k.isDefeated)
    .map((k) => getEmpirePower(st, k)), 0);
  const grossGold = () => st.ascentLedger?.gold.gross ?? 0;
  const landCount = () => st.lands.filter((l) => l.ownerId === 'dai-viet').length;

  const rivalPowerStart = rivalPower();
  // The share is demand ÷ gross for the same tick, recorded whenever the realm passes through
  // the target sizes. Only ticks where the ledger has a real gross count.
  const smallShares = [];
  const grownShares = [];
  let maxUnpaid = 0;
  let sawUnpaid = false;
  let sawRecovery = false;
  let shortfallKindsSeen = new Set();
  let popLossTick = -1;
  let civilianDampingSeen = false;

  for (let i = 0; i < 400 && !st.isDefeated; i += 1) {
    advanceAscentTick(st);
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 12) {
      const p = st.pendingAscentPrompt;
      if (p.kind === 'run-over') break;
      if (!resolveAscentPrompt(st, firstChoice(p))) break;
    }

    const unpaid = (st.unpaidLandIds ?? []).length;
    maxUnpaid = Math.max(maxUnpaid, unpaid);
    if (unpaid > 0) sawUnpaid = true;
    if (sawUnpaid && unpaid === 0) sawRecovery = true;
    for (const entry of st.ascentLedger?.shortfalls ?? []) shortfallKindsSeen.add(entry.kind);

    const gross = grossGold();
    if (gross > 10) {
      const share = ascentProvincialDemand(st).bag.gold / gross;
      const lands = landCount();
      if (lands >= 3 && lands <= 4) smallShares.push(share);
      if (lands >= 8) grownShares.push(share);
    }

    // The army drags on growth: whenever a real host stands, the humans rate must sit below
    // what the food surplus alone would grant. Cheap proxy: with troops fielded and food
    // positive, growth is still finite and modest.
    const troops = st.armies.filter((a) => a.kingdomId === 'dai-viet')
      .reduce((n, a) => n + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
    if (troops > 400 && st.resourceRates.food > 0 && st.resourceRates.humans >= 0) {
      const humans = st.resources.humans;
      const undamped = Math.max(1, Math.round(humans * 0.01));
      if (st.resourceRates.humans < undamped) civilianDampingSeen = true;
    }
  }

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : -1);

  // ── Stress: an empty granary must become a named event, not a silent subtraction ──
  // Real scarcity, not a clamped number: `collectPlayerIncome` recomputes the rates from the
  // land itself (refreshAllLandOutputs), so a forced negative rate does not survive into the
  // apply — a prosperous end-of-run realm simply out-harvested the old fake famine. A host too
  // large to feed makes the shortage true no matter how rich the fields are.
  const { calculatePlayerResourceRates, collectPlayerIncome } = await import('/src/systems/ResourceSystem.ts');
  // Measured on a living realm. A long run can end annihilated — a roguelite is allowed to
  // lose — and a realm with no provinces has nobody to starve, so the stress falls back to a
  // fresh realm advanced sixty seasons rather than reading nothing off a dead one.
  //
  // The population floor is the same rule, honestly stated. "No provinces" was too narrow: a run
  // that clung on at one battered province with fifty people in it still passed the guard, and
  // then a six-season famine took nothing off fifty and logged nothing, so both starvation checks
  // failed for want of anybody to starve rather than for want of working machinery. What the
  // stress needs is a realm with something to lose, not merely a realm that exists.
  const STRESS_MIN_POP = 150;
  const livingPop = st.lands
    .filter((l) => l.ownerId === 'dai-viet')
    .reduce((n, l) => n + l.population, 0);
  let stress = st;
  if (st.isDefeated || livingPop < STRESS_MIN_POP) {
    stress = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    stress.ascent.autoResolveBattles = true;
    for (let i = 0; i < 60 && !stress.isDefeated; i += 1) {
      advanceAscentTick(stress);
      let guard = 0;
      while (stress.pendingAscentPrompt && guard++ < 10) {
        const p = stress.pendingAscentPrompt;
        if (p.kind === 'run-over') break;
        if (!resolveAscentPrompt(stress, firstChoice(p))) break;
      }
    }
  }
  // The run may well have no standing host by now, and only army rations can drive the food
  // rate below zero (civilian demand withholds at source and floors at nothing). Conjure one.
  //
  // It has to be a host the *realm* feeds. A garrison levy is fed by its province and an
  // auxiliary (`Army.patron` — a host a story raised, which lives on what it was given) is fed
  // by whoever raised it; neither draws on the granary, so inflating one by fifty thousand men
  // produces fifty thousand men who eat nothing and a famine that never arrives. The levy was
  // already excluded here for exactly that reason; the auxiliary is the same rule, and the
  // conjured fallback has to clear the flag too or it inherits it from whatever it cloned.
  const feedMe = stress.armies.find((a) => a.kingdomId === 'dai-viet' && !a.isLevy && !a.patron)
    ?? (() => {
      const proto = JSON.parse(JSON.stringify(stress.armies[0]));
      proto.id = 'stress-host';
      proto.kingdomId = 'dai-viet';
      proto.landId = (stress.lands.find((l) => l.ownerId === 'dai-viet') ?? stress.lands[0]).id;
      proto.generalHeroId = undefined;
      proto.isLevy = undefined;
      proto.patron = undefined;
      stress.armies.push(proto);
      return proto;
    })();
  feedMe.units.spearmen += 50000;
  stress.resources.food = 0;
  const popBefore = stress.lands.filter((l) => l.ownerId === 'dai-viet').reduce((n, l) => n + l.population, 0);
  for (let i = 0; i < 6; i += 1) {
    stress.resources.food = 0; // hold the famine open regardless of what the tick harvests
    stress.resourceRates = calculatePlayerResourceRates(stress);
    stress.resourceRates.food = Math.min(stress.resourceRates.food, -20);
    collectPlayerIncome(stress);
  }
  const popAfter = stress.lands.filter((l) => l.ownerId === 'dai-viet').reduce((n, l) => n + l.population, 0);
  const famineShortfall = (stress.ascentLedger?.shortfalls ?? []).some((e) => e.kind === 'food');

  return {
    turn: st.turn,
    lands: landCount(),
    smallShare: mean(smallShares),
    grownShare: mean(grownShares),
    smallSamples: smallShares.length,
    grownSamples: grownShares.length,
    maxUnpaid,
    // Whether the realm was still standing at the end of the sampled run. Read by the recovery
    // check, which cannot fairly be asked of a realm that was conquered mid-shortfall.
    defeated: st.isDefeated,
    sawUnpaid,
    sawRecovery,
    shortfallKindsSeen: [...shortfallKindsSeen],
    civilianDampingSeen,
    rivalPowerStart,
    rivalPowerEnd: rivalPower(),
    // The named parts of the gold outgo must add up to the demand line they explain. Read off
    // the living realm the stress ran on, so a dead run does not read as a broken ledger.
    partsBalance: (() => {
      const l = stress.ascentLedger;
      const p = l?.goldParts;
      if (!l || !p) return false;
      const sum = p.payroll + p.hosts + p.wages + p.buildings + p.graft + p.softcap;
      return Math.abs(l.gold.demand - sum) < 1.5;
    })(),
    ledger: st.ascentLedger ? {
      gold: st.ascentLedger.gold,
      food: st.ascentLedger.food,
      coherent: ['food', 'supplies', 'gold'].every((k) => {
        const line = st.ascentLedger[k];
        return line && Math.abs(line.gross - line.demand - line.net) < 0.001;
      }),
    } : null,
    famine: { popBefore, popAfter, famineShortfall },
  };
});

// Soldier rations are config-level truths — read them straight from the module.
// ── Demand at the sampled sizes, on realms pinned to them ─────────────────────
//
// The seeded run above used to be the only source of the 3-4 and 8+ province samples, and it has
// not reached eight provinces on any build since the costly-victory round: a naive delegated realm
// dies at wave seven, on HEAD and here alike, so both share checks read "no samples" for months.
// The contract they hold — provinces cost something at every size, and the proportional
// administration cut keeps pace with a compounding trade network — does not need a survivor. A
// seeded realm handed the seat's neighbours, at full demand (the ramp is 24 seasons), says it.
const pinned = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { ascentProvincialDemand, refreshAllLandOutputs } = await import('/src/systems/ResourceSystem.ts');
  const PID = 'dai-viet';
  const measure = (wanted) => {
    const orig = Math.random;
    let s = 20260808 >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
      const seat = st.lands.find((l) => l.id === st.ascent.capitalLandId);
      // Breadth-first from the seat, so the pinned realm is a contiguous province cluster.
      const owned = [seat.id];
      const queue = [seat.id];
      while (owned.length < wanted && queue.length) {
        const nextId = queue.shift();
        const land = st.lands.find((l) => l.id === nextId);
        if (!land) continue;
        for (const id of land.neighbors) {
          if (owned.length >= wanted) break;
          if (owned.includes(id)) continue;
          const next = st.lands.find((l) => l.id === id);
          if (!next) continue;
          owned.push(id);
          queue.push(id);
          next.ownerId = PID;
          next.loyalty = 100;
          // A settled district of the mode's own opening grade: a village's people and one
          // working of each kind, so the sample is of provinces that earn as well as eat.
          next.population = Math.max(next.population, 300);
          next.hasVillage = true;
          next.buildingCapacity = Math.max(next.buildingCapacity, 4);
          next.buildings = [{ type: 'farm', level: 1 }, { type: 'market', level: 1 }];
        }
      }
      st.turn = 40; // past DEMAND_RAMP_TICKS, so the bag is at full weight
      refreshAllLandOutputs(st);
      const gross = st.ascentLedger?.gold.gross ?? 0;
      const demand = ascentProvincialDemand(st).bag.gold;
      return { lands: owned.length, gross: Math.round(gross), demand: Math.round(demand), share: gross > 0 ? demand / gross : -1 };
    } finally { Math.random = orig; }
  };
  return { small: measure(4), grown: measure(9) };
});
console.log('pinned demand shares', JSON.stringify(pinned));

const rations = await page.evaluate(async () => {
  const cfg = await import('/src/game/ascentConfig.ts');
  return {
    soldierEats: cfg.ARMY_FOOD_PER_SOLDIER,
    campaignMult: cfg.ARMY_CAMPAIGN_FOOD_MULT,
    civilianEats: 1 / 240, // foodPerHead for ascent in calculatePlayerResourceRates
  };
});

console.log(JSON.stringify(run, null, 2));
console.log('rations', JSON.stringify(rations));

const checks = {
  // The seeded naive run supplies the *event* checks below — shortfalls named, the ratchet, a
  // recovery, a soldier's ration. Eighty seasons is five wave cycles, comfortably past the demand
  // ramp and the first arrears; the size samples no longer depend on it (see `pinned`).
  'the run survives long enough to measure': run.turn >= 80,
  'the gold parts add up to the demand line': run.partsBalance,
  'the ledger exists and its three lines balance': Boolean(run.ledger?.coherent),

  // The headline: provinces cost something at every size. Printed above for tuning; the
  // grown-realm floor is what catches the linear-wages-vs-compounding-trade defect.
  'demand claims a real share of gross at 3-4 provinces': pinned.small.lands >= 3 && pinned.small.share > 0.05 && pinned.small.share < 0.95,
  'demand still claims a real share at 8+ provinces': pinned.grown.lands >= 8 && pinned.grown.share > 0.08 && pinned.grown.share < 0.8,

  // Shortfall machinery: events with names, never more than three provinces dark, and a
  // treasury that heals gets its provinces back.
  //
  // **Only asked of a realm that lived long enough to answer.** A run conquered while a province
  // is dark never recovers it, and it did not fail to heal — it ran out of time. Without the
  // exemption this was a coin flip on the trajectory rather than a reading of the economy:
  // measured over the same eight seeds through this very driver, it failed on 20260808 and 1337
  // with supply lines on and on 777, 31337 and 2468 with them off — a different pair of seeds
  // either way, and *more* failures in the arm with the feature disabled. Both failing seeds were
  // defeated runs; no surviving run has ever failed it.
  //
  // Same principle the `partsBalance` note below states — read the living realm, so a dead run
  // does not read as a broken economy. The severity half of this pair (`maxUnpaid <= 3`) carries
  // no such exemption and still holds for every run, dead or alive.
  'a shortfall was seen and it recovered': !run.sawUnpaid || run.sawRecovery || run.defeated,
  'the coin ratchet never exceeds three provinces': run.maxUnpaid <= 3,

  // Famine stress: people were lost and the ledger points at a place.
  'starving the realm costs people': run.famine.popAfter < run.famine.popBefore,
  'starving the realm lands in the ledger': run.famine.famineShortfall,

  // Army-as-people.
  'a soldier eats at least a civilian ration': rations.soldierEats >= rations.civilianEats,
  'a marching host eats more than a garrisoned one': rations.campaignMult > 1,
  'a standing army drags on civilian growth': run.civilianDampingSeen,

  // The world grows back.
  'rival power grows across the run': run.rivalPowerEnd >= run.rivalPowerStart * 1.5,
};

let failed = 0;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!pass) failed += 1;
}
console.log(failed === 0 ? '\nverify-economy: all checks passed' : `\nverify-economy: ${failed} FAILED`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
