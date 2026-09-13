import { getProject, REALM_PROJECTS } from '../data/edicts';
import { assignHeroDuty } from './heroes/HeroService';
import { PLAYER_KINGDOM_ID } from '../game/constants';
import { ESTATE_IDS, type EstateId, type GameState, type Land } from '../state/types';
import { eraIndex } from './empire/MandateSystem';
import { pushToast } from './empire/notifications';
import { villageCustom } from './decree/rules';
import { hasCapstone } from './decree/SchoolSystem';
import { t } from '../i18n';

/**
 * Chiếu Chỉ — the pressure under the throne's standing law.
 *
 * A decree used to be a purchase: points in, permanent percentage out, nothing pushing back. This
 * module is what pushes back. Three numbers do the work, and they are all one loop:
 *
 *   weight      — what carrying a law costs the throne's finite authority
 *   estates     — who each law pleases and who it angers
 *   compliance  — whether a province actually carries the law out
 *
 * Overreach drains compliance, compliance scales what every decree is worth, and a realm whose
 * laws are worth less needs more of them. That is Hồ Quý Ly's reign as a feedback loop: between
 * 1396 and 1397 he issued the most intelligent legislation in Vietnamese history — paper money,
 * hạn điền, hạn nô — and the country simply refused it, so when the Ming crossed the border in
 * 1406 there was no realm left underneath the laws. Lê Thánh Tông passed fewer laws more slowly
 * and every one of them stuck.
 *
 * Guarded on `state.mandate` throughout, which `createEmpireGameState` alone seeds — so empire and
 * Dragon Ascent run this and rival/campaign are structurally untouched. That guard is what
 * `verify-modes-regression.mjs` proves.
 *
 * No Phaser import: the harnesses run thousands of headless ticks through here.
 */

// ── Constants ───────────────────────────────────────────────────────────────

/** Where a province starts, and where an unmeasured one is assumed to be. */
export const BASE_COMPLIANCE = 65;

/** Where an estate starts, and the point it always drifts back toward. */
export const BASE_ESTATE = 50;

/**
 * Below this an estate stops merely costing you a multiplier and starts refusing to serve.
 *
 * The four bites are deliberately different in kind, not in size — a percentage would just be
 * more of the same tax the multiplier already levies. Sĩ withhold the paperwork, Nông rise,
 * Thương let bought ground drift away, Võ walk off the postings. Each is something the player
 * has to *do* something about, and each names the estate in the toast so the cause is legible.
 */
export const ESTATE_CRISIS = 30;

/** Stability floor the Trúc Lâm capstone puts under the realm. */
export const TRUC_LAM_STABILITY_FLOOR = 60;

/** Compliance the realm settles into per tick simply from habit. */
const HABIT_DRIFT = 0.6;

/** Compliance lost per tick per point of overreach, in every province at once. */
const OVERREACH_BITE = 1.2;

/** How fast an estate forgets. Anger fades and favour is not permanent — you must keep governing. */
const ESTATE_RETURN = 0.15;

/** Below this a province ignores the throne's law entirely. */
export const DEFIANT_BELOW = 25;

/** Below this it stops being yours. */
export const SECEDE_BELOW = 10;

/** Above this it does more than obey. */
export const DEVOTED_FROM = 85;

/** The compliance a realised effect is measured against — 70 is "obedient", i.e. ×1.00. */
const COMPLIANCE_PAR = 70;

const REALISED_FLOOR = 0.3;
const REALISED_CEILING = 1.15;

/** What repeal costs, as a multiple of the decree's original edict-point price. */
export const REPEAL_COST_MULT = 2;

const REPEAL_STABILITY_HIT = 8;
const REPEAL_COMPLIANCE_GIFT = 20;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ── Reading the state ───────────────────────────────────────────────────────

/** True when this save runs the decree system at all. Empire and Dragon Ascent; nothing else. */
export function hasDecrees(state: GameState): boolean {
  return Boolean(state.mandate);
}

export function ourLands(state: GameState): Land[] {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

/** A province's compliance, defaulted for saves written before the system existed. */
export function landCompliance(land: Land): number {
  return typeof land.compliance === 'number' ? land.compliance : BASE_COMPLIANCE;
}

/** One estate's standing, defaulted the same way. */
export function estateStanding(state: GameState, estate: EstateId): number {
  const stored = state.mandate?.estates?.[estate];
  return typeof stored === 'number' ? stored : BASE_ESTATE;
}

export function estateAverage(state: GameState): number {
  if (!state.mandate) return BASE_ESTATE;
  return ESTATE_IDS.reduce((sum, estate) => sum + estateStanding(state, estate), 0) / ESTATE_IDS.length;
}

/**
 * What an estate's standing multiplies its own domain by.
 *
 * ×0.75 at zero, ×1.00 at fifty, ×1.25 at a hundred. Deliberately a narrow band: this rides on top
 * of every other multiplier in the game, and a wider one would swamp the decrees it is meant to
 * qualify.
 */
export function estateMult(state: GameState, estate: EstateId): number {
  return 0.75 + estateStanding(state, estate) / 200;
}

export function averageCompliance(state: GameState): number {
  const lands = ourLands(state);
  if (lands.length === 0) return BASE_COMPLIANCE;
  return lands.reduce((sum, land) => sum + landCompliance(land), 0) / lands.length;
}

// ── Weight and authority ────────────────────────────────────────────────────

/**
 * How much standing law the throne can carry at once.
 *
 * Grows with the reign rather than with the treasury: a longer era, a seated censor keeping the
 * officials honest, and a calm country. Gold buys you nothing here, which is the point — you
 * cannot purchase the right to legislate.
 */
export function authorityCap(state: GameState): number {
  const mandate = state.mandate;
  if (!mandate) return 0;
  // Nghiêm pháp — the Legalist capstone. Weight stops mattering entirely: pass as many laws as you
  // like. What it costs is in `complianceDrift`, where the country begins bleeding obedience every
  // season regardless of how well you govern. Hồ Quý Ly's reign as a *choice* rather than a trap.
  if (hasCapstone(state, 'phap')) return Number.POSITIVE_INFINITY;
  const censorSeated = Boolean(state.court.seats.censor);
  return 4 + eraIndex(mandate.era) * 2 + (censorSeated ? 2 : 0) + Math.floor(state.court.stability / 25);
}

/** Total weight of every law standing right now. */
export function standingWeight(state: GameState): number {
  const mandate = state.mandate;
  if (!mandate) return 0;
  // Lệ làng — recognising the village custom. The country obeys again, and the throne gives up
  // being able to legislate cheaply ever again: every other standing law now costs one more.
  // It is the only decree that changes the price of the decree system itself, which is why it is
  // read here rather than expressed as a modifier.
  const surcharge = villageCustom(state) ? 1 : 0;
  return mandate.edicts.reduce((sum, id) => {
    const project = getProject(id);
    if (!project) return sum;
    // The custom does not surcharge itself, and never surcharges the temporary instruments —
    // a dụ that cost weight would defeat the point of having an instrument that costs none.
    const extra = project.id === 'le-lang' || project.weight === 0 ? 0 : surcharge;
    return sum + project.weight + extra;
  }, 0);
}

/**
 * Law carried past what the realm will bear.
 *
 * Never a wall — you may always pass one more. It is a tax on the whole system instead, because a
 * hard cap would just be a menu that greys out, and the interesting failure is the one you chose.
 */
export function overreach(state: GameState): number {
  return Math.max(0, standingWeight(state) - authorityCap(state));
}

// ── Compliance ──────────────────────────────────────────────────────────────

/** Which band a province sits in. The UI colours from this and the economy reads it. */
export type ComplianceBand = 'devoted' | 'obedient' | 'grudging' | 'defiant';

export function complianceBand(land: Land): ComplianceBand {
  const value = landCompliance(land);
  if (value >= DEVOTED_FROM) return 'devoted';
  if (value >= 45) return 'obedient';
  if (value >= DEFIANT_BELOW) return 'grudging';
  return 'defiant';
}

/**
 * What this province's own compliance does to the realm modifiers it receives.
 *
 * A defiant province returns 0: its output ignores every decree, every court seat and every
 * wonder, and is worth exactly what the ground and the buildings make it. That is the whole
 * mechanic in one number — a law nobody obeys is worth nothing.
 */
export function landRealised(land: Land): number {
  switch (complianceBand(land)) {
    case 'devoted': return REALISED_CEILING;
    case 'obedient': return 1;
    case 'grudging': return 0.5;
    case 'defiant': return 0;
  }
}

/**
 * Bends a realm-derived multiplier back toward 1 by how far a province is obeying.
 *
 * This is the shape every application of compliance takes, and it is deliberately a lerp toward
 * neutral rather than a scaling of the output: a defiant province is not *poorer than the ground
 * it stands on*, it simply stops receiving anything the realm adds on top — the trade network, a
 * seated governor, the standing decrees. What is left is exactly what its terrain and its
 * districts make, which is what "the king's rule loses to the village's custom" has to mean if it
 * is to mean anything mechanically.
 */
export function realmShare(multiplier: number, realised: number): number {
  // Short-circuit at full compliance, and not merely as an optimisation. `1 + (1.09 - 1) * 1` is
  // 1.0900000000000003, not 1.09 — so without this line every province in rival and campaign mode,
  // which pass realised 1 unconditionally, would come back off by a float ulp and the claim that
  // those modes are untouched would be false in exactly the way a fingerprint diff catches.
  if (realised === 1) return multiplier;
  return 1 + (multiplier - 1) * realised;
}

/**
 * The realm-wide factor every court bonus is scaled by.
 *
 * Floored at 0.3 rather than 0: the court itself is still the court even when the countryside has
 * stopped listening, and a run that could drive its own bonuses to zero would be unrecoverable
 * rather than merely losing.
 */
export function realisedFactor(state: GameState): number {
  if (!hasDecrees(state)) return 1;
  return clamp(averageCompliance(state) / COMPLIANCE_PAR, REALISED_FLOOR, REALISED_CEILING);
}

/** Per-tick change in one province's compliance, before clamping. Exposed for the UI readout. */
export function complianceDrift(state: GameState, land: Land): number {
  const taxRate = typeof state.taxRate === 'number' ? state.taxRate : 0.5;
  // A governor is a hero whose `assignedTo` is the province id itself — the same reading
  // `progressCourt` uses for the loyalty bonus, so the two cannot drift apart.
  const governed = state.heroes.some((hero) => hero.assignedTo === land.id);
  // Nghiêm pháp's price: obedience decays everywhere, every season, and nothing the player does
  // stops it. A province that reaches 20 secedes — see `tickDecrees`.
  const legalistBleed = hasCapstone(state, 'phap') ? 1 : 0;
  return (
    HABIT_DRIFT
    - legalistBleed
    - overreach(state) * OVERREACH_BITE
    - (taxRate - 0.5) * 2
    + (estateAverage(state) - BASE_ESTATE) / 40
    + (governed ? 0.4 : 0)
  );
}

// ── Moving the estates ──────────────────────────────────────────────────────

function ensureEstates(state: GameState): Record<EstateId, number> {
  const mandate = state.mandate;
  if (!mandate) return { si: BASE_ESTATE, nong: BASE_ESTATE, thuong: BASE_ESTATE, vo: BASE_ESTATE };
  mandate.estates ??= { si: BASE_ESTATE, nong: BASE_ESTATE, thuong: BASE_ESTATE, vo: BASE_ESTATE };
  for (const estate of ESTATE_IDS) mandate.estates[estate] ??= BASE_ESTATE;
  return mandate.estates;
}

export function shiftEstate(state: GameState, estate: EstateId, by: number): void {
  if (!hasDecrees(state)) return;
  const estates = ensureEstates(state);
  estates[estate] = clamp(estates[estate] + by, 0, 100);
}

/** Applies a decree's whole constituency in one call, in either direction. */
export function applyEstateDeltas(
  state: GameState,
  deltas: Partial<Record<EstateId, number>>,
  sign = 1,
): void {
  for (const [estate, value] of Object.entries(deltas)) {
    shiftEstate(state, estate as EstateId, (value ?? 0) * sign);
  }
}

// ── The tick ────────────────────────────────────────────────────────────────

/**
 * One season of the realm deciding how much it agrees with you.
 *
 * Called from `progressCourt`, which both `advanceRealtimeMonth` and `advanceAscentTick` already
 * run — so this reaches empire and ascent through a single insertion point and neither tick loop
 * needed editing.
 */
export function tickDecrees(state: GameState): void {
  const mandate = state.mandate;
  if (!mandate) return;

  // Trúc Lâm — Trần Nhân Tông's mountain school, taken up after he abdicated. A realm governed by
  // leaving it alone does not come apart: stability simply cannot fall below 60. Every military
  // decree is shut in exchange, which is the whole point of the trade.
  if (hasCapstone(state, 'phat') && state.court.stability < TRUC_LAM_STABILITY_FLOOR) {
    state.court.stability = TRUC_LAM_STABILITY_FLOOR;
  }

  const estates = ensureEstates(state);
  for (const estate of ESTATE_IDS) {
    const standing = estates[estate];
    const step = Math.min(ESTATE_RETURN, Math.abs(standing - BASE_ESTATE));
    estates[estate] = standing > BASE_ESTATE ? standing - step : standing + step;
  }

  const seceded: Land[] = [];
  for (const land of ourLands(state)) {
    const next = clamp(landCompliance(land) + complianceDrift(state, land), 0, 100);
    land.compliance = next;
    // Not the capital: losing the seat of the dynasty to paperwork rather than to an army would
    // end a run with no battle in it, and `checkAscentDefeat` already owns that ending.
    if (next < SECEDE_BELOW && land.id !== state.ascent?.capitalLandId) seceded.push(land);
  }

  for (const land of seceded) {
    land.ownerId = 'neutral';
    land.compliance = BASE_COMPLIANCE;
    land.loyalty = Math.min(land.loyalty, 30);
    // Any host standing there is now standing in someone else's province; the movement system
    // already handles a host on ground it does not own, so nothing else needs unwinding here.
    pushToast(state, t('decree.toast.seceded', { land: land.name }), 'threat');
  }

  tickEstateCrises(state);
}

/**
 * What each estate does once it has stopped merely being unhappy.
 *
 * Rationed hard: at most one of these fires per tick, and each carries its own cooldown through
 * the standing it costs, because four simultaneous crises in a realm that is already failing is a
 * pile-on rather than a decision. The multiplier below `ESTATE_CRISIS` is punishment enough on its
 * own — these exist so the player *notices* which estate they have lost.
 */
function tickEstateCrises(state: GameState): void {
  const lands = ourLands(state);
  if (lands.length === 0) return;

  // Võ — generals will not serve a throne that has no use for soldiers. One posting per tick, so
  // a run does not lose its whole command structure in a single season.
  if (estateStanding(state, 'vo') < ESTATE_CRISIS) {
    const commander = state.heroes.find((hero) => hero.type === 'general' && hero.assignedTo);
    if (commander && Math.random() < 0.25) {
      if (commander.growth) assignHeroDuty(state, commander.id, { kind: 'home' });
      else {
        const army = state.armies.find((host) => host.generalHeroId === commander.id);
        if (army) army.generalHeroId = undefined;
        commander.assignedTo = undefined;
      }
      pushToast(state, t('decree.estate.angry', {
        estate: t('decree.estate.vo'),
        effect: t('decree.estate.vo.angry'),
      }), 'threat');
      return;
    }
  }

  // Nông — the countryside rises. Expressed as compliance and loyalty collapsing in the province
  // that is already worst off, which the bands above then turn into defiance and secession. An
  // actual hostile host would duplicate `revolt` in the story vocabulary, which owns that verb.
  if (estateStanding(state, 'nong') < ESTATE_CRISIS && Math.random() < 0.3) {
    const worst = lands.reduce((low, land) => (landCompliance(land) < landCompliance(low) ? land : low));
    worst.compliance = Math.max(0, landCompliance(worst) - 12);
    worst.loyalty = Math.max(0, worst.loyalty - 8);
    pushToast(state, t('decree.estate.angry', {
      estate: t('decree.estate.nong'),
      effect: t('decree.estate.nong.angry'),
    }), 'threat');
    return;
  }

  // Thương — ground that was bought rather than taken drifts back out of the realm's hands. The
  // merchants who financed the purchase simply stop underwriting it.
  if (estateStanding(state, 'thuong') < ESTATE_CRISIS && Math.random() < 0.25) {
    const bought = lands.filter((land) => land.localSoldiers < 40 && land.id !== state.ascent?.capitalLandId);
    const drifting = bought[Math.floor(Math.random() * bought.length)];
    if (drifting) {
      drifting.loyalty = Math.max(0, drifting.loyalty - 10);
      drifting.compliance = Math.max(0, landCompliance(drifting) - 8);
      pushToast(state, t('decree.estate.angry', {
        estate: t('decree.estate.thuong'),
        effect: t('decree.estate.thuong.angry'),
      }), 'threat');
    }
  }
}

// ── Enacting and repealing ──────────────────────────────────────────────────

/** True once a decree is standing. */
export function isDecreeStanding(state: GameState, id: string): boolean {
  return Boolean(state.mandate?.edicts.includes(id));
}

/**
 * What repeal costs, and what it gives back. See `repealDecree` in `EdictSystem`, which performs
 * it — the act lives beside `enactProject` so both sides of the ledger are written once, and so
 * this module never has to import `CourtSystem` and close an import cycle.
 */
export function repealTerms(state: GameState, id: string): { cost: number; weight: number; affordable: boolean } | undefined {
  const project = getProject(id);
  const mandate = state.mandate;
  if (!project || !mandate) return undefined;
  const cost = (project.edictCost ?? 0) * REPEAL_COST_MULT;
  return { cost, weight: project.weight, affordable: mandate.edictPoints >= cost };
}

/** The stability and compliance halves of a repeal, applied by `repealDecree`. */
export function applyRepealRelief(state: GameState): void {
  state.court.stability = Math.max(0, state.court.stability - REPEAL_STABILITY_HIT);
  for (const land of ourLands(state)) {
    land.compliance = clamp(landCompliance(land) + REPEAL_COMPLIANCE_GIFT, 0, 100);
  }
}

/** Everything standing right now, as project rows — for the court screen and the run summary. */
export function standingDecrees(state: GameState) {
  const ids = state.mandate?.edicts ?? [];
  return REALM_PROJECTS.filter((project) => ids.includes(project.id));
}
