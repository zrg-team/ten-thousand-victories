import { isCampaignMode, isEndlessMode, PLAYER_KINGDOM_ID } from '../game/constants';
import { FEUD_ENVY_SHARE, OATHBREAK_BYSTANDER_OPINION } from '../game/ascentConfig';
import type { Difficulty, GameState, Kingdom, KingdomPersonality, OpinionModifier } from '../state/types';
import { t } from '../i18n';

/**
 * Opinion engine (Phase 1 of the diplomacy redesign).
 *
 * An empire's `relations` (0-100) is no longer a value you top up directly — it is
 * a cached read of a personality **baseline** plus a list of itemised
 * **opinion modifiers** (gifts, treaties, grievances, war...). Temporary modifiers
 * decay toward zero each tick, so gifts fade; standing modifiers persist while their
 * condition holds. This makes relations transparent (the player sees *why*) and means
 * neglect lets opinion drift back to the empire's natural baseline.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The opinion an empire settles at when nothing else is acting on the relationship. */
export function naturalBaseline(personality: KingdomPersonality): number {
  switch (personality) {
    case 'diplomatic':
      return 58;
    case 'economic':
      return 50;
    case 'defensive':
      return 46;
    case 'expansionist':
      return 38;
    case 'aggressive':
      return 32;
    default:
      return 50;
  }
}

export function sumModifiers(kingdom: Kingdom): number {
  return (kingdom.opinionModifiers ?? []).reduce((sum, mod) => sum + mod.value, 0);
}

/** Recompute the cached `relations` from baseline + modifiers. Call after any change. */
export function recomputeOpinion(kingdom: Kingdom): void {
  kingdom.relations = clamp(naturalBaseline(kingdom.personality) + sumModifiers(kingdom), 0, 100);
}

/**
 * Add (or, for standing modifiers, replace) an opinion modifier and refresh the cache.
 * Decaying modifiers with the same id stack (each fades independently); standing
 * modifiers with the same id are replaced so they don't pile up.
 */
export function addOpinionModifier(kingdom: Kingdom, mod: OpinionModifier): void {
  kingdom.opinionModifiers ??= [];
  if (mod.decay === undefined) {
    const idx = kingdom.opinionModifiers.findIndex((m) => m.id === mod.id);
    if (idx >= 0) {
      kingdom.opinionModifiers[idx] = mod;
    } else {
      kingdom.opinionModifiers.push(mod);
    }
  } else {
    kingdom.opinionModifiers.push(mod);
  }
  recomputeOpinion(kingdom);
}

/**
 * **Warming one court cools the court it feuds with.**
 *
 * Called by every action that deliberately improves a relationship. Half strength rather than a
 * full mirror, on purpose: a full one makes diplomacy zero-sum, and a zero-sum system is one the
 * player correctly stops touching. At a half, four courts can be moved — but not all four up, and
 * the ceiling arrives on its own without a rule anywhere saying so out loud.
 *
 * Silent on cooling: souring a relationship does *not* warm its rival. A court does not befriend
 * you for insulting its enemy — that is what `denounce` is for, and denouncing is a deliberate,
 * public act with its own price rather than a side effect of every setback.
 */
export function applyEnvy(state: GameState, warmed: Kingdom, by: number): void {
  if (by <= 0 || !warmed.feudWith) return;
  const partner = state.kingdoms.find((k) => k.id === warmed.feudWith);
  if (!partner || partner.isDefeated) return;
  addOpinionModifier(partner, {
    id: `envy-${warmed.id}-${state.turn}-${Math.floor(Math.random() * 100000)}`,
    label: t('diplo.mod.envy'),
    value: -Math.round(by * FEUD_ENVY_SHARE),
    decay: 0.5,
    source: 'envy',
  });
}

export function removeOpinionModifier(kingdom: Kingdom, id: string): void {
  if (!kingdom.opinionModifiers) {
    return;
  }
  kingdom.opinionModifiers = kingdom.opinionModifiers.filter((m) => m.id !== id);
  recomputeOpinion(kingdom);
}

export function hasModifier(kingdom: Kingdom, id: string): boolean {
  return (kingdom.opinionModifiers ?? []).some((m) => m.id === id);
}

function moveToZero(value: number, step: number): number {
  if (value > 0) return Math.max(0, value - step);
  if (value < 0) return Math.min(0, value + step);
  return 0;
}

/** Cost of the next gift to this empire — rises with gift fatigue (anti gift-spam). */
export function giftCost(kingdom: Kingdom, state?: GameState): number {
  const fatigue = kingdom.giftFatigue ?? 0;
  const flat = 30 * (1 + fatigue * 0.45);
  if (!state) return Math.ceil(flat);
  // Priced off income, the way `vassalOathGold` and `tributeDemandGold` already are.
  //
  // Thirty gold is a real decision in the first minutes of a run and a rounding error by Year 20,
  // so the only action that reliably moves opinion became free at exactly the point the wave
  // curve stops forgiving anything. Two seasons of income keeps a gift feeling like a gift for
  // the whole run; the flat figure stays as the floor so the opening is unchanged.
  const byIncome = Math.max(0, state.resourceRates.gold) * 2 * (1 + fatigue * 0.45);
  return Math.ceil(Math.max(flat, byIncome));
}

/** Opinion a gift to this empire would grant — shrinks with gift fatigue. */
export function giftOpinionGain(kingdom: Kingdom): number {
  const fatigue = kingdom.giftFatigue ?? 0;
  return Math.max(3, Math.round(16 / (1 + fatigue * 0.6)));
}

/**
 * Which modes keep a living opinion ledger.
 *
 * Ascent belongs here and never was. `isCampaignMode` is campaign-or-empire, so in Dragon Ascent
 * `tickDiplomacy` returned on its first line and **nothing about a relationship ever moved**: a
 * gift was permanent, gift fatigue never faded, trust never drifted, treaties never expired, and
 * neglecting a court cost exactly nothing. Every modifier's `decay` field was dead data. That is
 * the mechanical form of the report *"other kingdom relation not affected to gameplay at all"* —
 * the ledger existed, the screen rendered it, and the clock behind it was stopped.
 */
function keepsOpinionLedger(mode: string): boolean {
  return isCampaignMode(mode) || mode === 'ascent';
}

/** One economy tick of relationship upkeep: decay temporary modifiers, gift fatigue, trust drift, treaty expiry, recache. */
export function tickDiplomacy(state: GameState): void {
  if (!keepsOpinionLedger(state.gameMode)) {
    return;
  }
  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) {
      continue;
    }

    const mods = kingdom.opinionModifiers ?? [];
    for (const mod of mods) {
      if (mod.decay) {
        mod.value = moveToZero(mod.value, mod.decay);
      }
    }
    // Drop spent temporary modifiers (standing ones have no decay and stay).
    kingdom.opinionModifiers = mods.filter((m) => m.decay === undefined || Math.abs(m.value) >= 0.5);

    if (kingdom.giftFatigue) {
      kingdom.giftFatigue = Math.max(0, kingdom.giftFatigue - 0.18);
    }

    // Trust drifts toward a target (higher while a pact holds).
    const trustTarget = hasPact(kingdom) ? 68 : 50;
    kingdom.trust = moveToward(getTrust(kingdom), trustTarget, 0.3);

    expireTreaties(state, kingdom);

    recomputeOpinion(kingdom);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trust, prestige, power & fear (used by treaties + escalation)
// ─────────────────────────────────────────────────────────────────────────────

function moveToward(value: number, target: number, step: number): number {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

export function getTrust(kingdom: Kingdom): number {
  return kingdom.trust ?? 50;
}

export function getPrestige(state: GameState): number {
  return state.prestige ?? 50;
}

export function adjustPrestige(state: GameState, delta: number): void {
  state.prestige = clamp(getPrestige(state) + delta, 0, 100);
}

function difficultyScale(difficulty: Difficulty | undefined): number {
  if (difficulty === 'easy') return 0.8;
  if (difficulty === 'hard') return 1.25;
  if (difficulty === 'ironman') return 1.5;
  return 1.0;
}

function militaryWeight(personality: KingdomPersonality): number {
  switch (personality) {
    case 'aggressive': return 1.25;
    case 'expansionist': return 1.15;
    case 'defensive': return 1.05;
    case 'economic': return 0.85;
    case 'diplomatic': return 0.8;
    default: return 1;
  }
}

/** Rough military weight of an empire — its on-map forces, or a notional off-map host that grows over time. */
export function getEmpirePower(state: GameState, kingdom: Kingdom): number {
  const onMap =
    state.armies
      .filter((a) => a.kingdomId === kingdom.id)
      .reduce((sum, a) => sum + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0) +
    state.lands.filter((l) => l.ownerId === kingdom.id).reduce((sum, l) => sum + l.defense * 10, 0);
  if (onMap > 0) {
    return onMap;
  }
  // Off-map empires: their strength is the evolving `power` index (see GreatPowersSystem),
  // so a realm that grows powerful over the years is genuinely more dangerous. Falls back
  // to a personality/turn estimate before the sim seeds the value.
  const indexed = typeof kingdom.power === 'number'
    ? kingdom.power * 10 * militaryWeight(kingdom.personality) * difficultyScale(state.campaignConfig?.difficulty)
    : 460 * militaryWeight(kingdom.personality) * (1 + state.turn * 0.03) * difficultyScale(state.campaignConfig?.difficulty);
  // Dragon Ascent: the crown that keeps fielding wave-sized hosts is, by demonstration, at
  // least that strong. The index above is clamped at 122 by GreatPowersSystem — a backdrop
  // figure — so against a realm whose own POWER reads in the thousands the world page called
  // every rival a village (user-reported). THREAT is what their armies actually measure at, so
  // it is the floor of what they are said to have, spread by personality.
  if (isEndlessMode(state.gameMode) && state.ascent) {
    return Math.max(indexed, Math.round((state.ascent.threat ?? 0) * militaryWeight(kingdom.personality)));
  }
  return indexed;
}

export function getPlayerMilitary(state: GameState): number {
  const armies = state.armies
    .filter((a) => a.kingdomId === PLAYER_KINGDOM_ID)
    .reduce((sum, a) => sum + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);
  const walls = state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).reduce((sum, l) => sum + l.defense * 10, 0);
  return armies + walls;
}

export function relativeStrength(state: GameState, kingdom: Kingdom): number {
  return getPlayerMilitary(state) / (getEmpirePower(state, kingdom) + 1);
}

/** 0-100: how much this empire fears the player's might. High fear deters invasion and eases extortion. */
export function getFear(state: GameState, kingdom: Kingdom): number {
  return clamp((relativeStrength(state, kingdom) - 0.5) * 70, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Treaties (Phase 2): negotiation, acceptance, expiry, breaking
// ─────────────────────────────────────────────────────────────────────────────

export function hasPact(kingdom: Kingdom): boolean {
  return (kingdom.treaties ?? []).some((tr) => tr.type === 'non-aggression');
}

function pactBias(personality: KingdomPersonality): number {
  switch (personality) {
    case 'diplomatic': return 15;
    case 'economic': return 6;
    case 'defensive': return 2;
    case 'expansionist': return -12;
    case 'aggressive': return -25;
    default: return 0;
  }
}

export interface PactReason {
  label: string;
  value: number;
}

export interface PactEvaluation {
  score: number;
  accepts: boolean;
  reasons: PactReason[];
}

/** Scores whether an empire would sign a non-aggression pact, given an optional gold sweetener. */
export function evaluatePactOffer(state: GameState, kingdom: Kingdom, sweetenerGold: number): PactEvaluation {
  const reasons: PactReason[] = [];
  const opinion = kingdom.relations ?? 50;
  reasons.push({ label: t('diplo.reason.opinion'), value: Math.round((opinion - 45) * 1.0) });
  reasons.push({ label: t('diplo.reason.trust'), value: Math.round((getTrust(kingdom) - 50) * 0.4) });
  reasons.push({ label: t('diplo.reason.strength'), value: Math.round((relativeStrength(state, kingdom) - 1) * 25) });
  reasons.push({ label: t('diplo.reason.temperament'), value: pactBias(kingdom.personality) });
  reasons.push({ label: t('diplo.reason.prestige'), value: Math.round((getPrestige(state) - 50) * 0.2) });
  if (sweetenerGold > 0) {
    reasons.push({ label: t('diplo.reason.gift'), value: Math.round(sweetenerGold * 0.4) });
  }
  const atWar = (kingdom.opinionModifiers ?? []).some((m) => m.source === 'war');
  if (atWar) {
    reasons.push({ label: t('diplo.reason.atWar'), value: -40 });
  }
  const score = reasons.reduce((sum, r) => sum + r.value, 0);
  return { score, accepts: score >= 0, reasons };
}

const PACT_INFLUENCE_COST = 15;
const PACT_DURATION_TURNS = 12;

/** Attempts to seal a non-aggression pact; succeeds only if the empire's acceptance score is non-negative. */
export function proposePact(state: GameState, kingdomId: string, sweetenerGold: number): boolean {
  // Gated the same way `tickDiplomacy` was, with the same consequence: every `hasPact(kingdom)`
  // branch in the envoy sheet, `isWorthVisiting` and `envoyUrgency` was permanently false in
  // ascent, so the one instrument that can actually buy peace was unreachable in the one mode
  // whose whole difficulty is the war.
  if (!keepsOpinionLedger(state.gameMode)) return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated || hasPact(kingdom)) return false;

  if (state.court.influence < PACT_INFLUENCE_COST) {
    state.message = t('diplo.pactNoInfluence');
    return false;
  }
  if (state.resources.gold < sweetenerGold) {
    state.message = t('diplo.pactNoGold', { cost: sweetenerGold });
    return false;
  }

  const evaluation = evaluatePactOffer(state, kingdom, sweetenerGold);
  if (!evaluation.accepts) {
    state.message = t('diplo.pactRefused', { kingdom: kingdom.name });
    return false;
  }

  state.court.influence -= PACT_INFLUENCE_COST;
  state.resources.gold -= sweetenerGold;
  kingdom.treaties = [...(kingdom.treaties ?? []), { type: 'non-aggression', expiresTurn: state.turn + PACT_DURATION_TURNS }];
  kingdom.trust = clamp(getTrust(kingdom) + 4, 0, 100);
  kingdom.hostilityTimer = 0;
  kingdom.warAppetite = 0;
  addOpinionModifier(kingdom, { id: `pact-${kingdomId}`, label: t('diplo.mod.pact'), value: 20, source: 'treaty' });
  state.scheduledCampaignEvents = state.scheduledCampaignEvents.filter(
    (e) => !(e.type === 'dynasty-attack' && e.sourceKingdomId === kingdomId && !e.resolved),
  );
  state.message = t('diplo.pact', { kingdom: kingdom.name });
  return true;
}

function expireTreaties(state: GameState, kingdom: Kingdom): void {
  if (!kingdom.treaties || kingdom.treaties.length === 0) {
    return;
  }
  const expired = (tr: NonNullable<Kingdom['treaties']>[number]) => tr.expiresResolvedWave !== undefined
    ? (state.ascent?.wavesSurvived ?? 0) >= tr.expiresResolvedWave : tr.expiresTurn <= state.turn;
  const lapsed = kingdom.treaties.filter(expired);
  if (lapsed.length === 0) {
    return;
  }
  kingdom.treaties = kingdom.treaties.filter(tr => !expired(tr));
  if (!hasPact(kingdom)) {
    removeOpinionModifier(kingdom, `pact-${kingdom.id}`);
    state.message = t('diplo.pactLapsed', { kingdom: kingdom.name });
  }
}

/**
 * Breaks any pact with an empire. When the player is the breaker it costs prestige
 * and stains the player's reputation with every empire (the oathbreaker penalty).
 */
export function breakPact(state: GameState, kingdomId: string, byPlayer: boolean): void {
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || !hasPact(kingdom)) {
    return;
  }
  kingdom.treaties = (kingdom.treaties ?? []).filter((tr) => tr.type !== 'non-aggression');
  removeOpinionModifier(kingdom, `pact-${kingdomId}`);
  kingdom.trust = Math.max(0, getTrust(kingdom) - 30);
  addOpinionModifier(kingdom, { id: `pactbreak-${kingdomId}`, label: t('diplo.mod.pactbroken'), value: -35, decay: 0.2, source: 'reputation' });

  if (byPlayer) {
    adjustPrestige(state, -15);
    for (const other of state.kingdoms) {
      if (other.id === PLAYER_KINGDOM_ID || other.isDefeated || other.id === kingdomId) continue;
      other.trust = Math.max(0, getTrust(other) - 10);
      addOpinionModifier(other, {
        id: `oathbreaker-${state.turn}-${other.id}`,
        label: t('diplo.mod.oathbreaker'),
        value: OATHBREAK_BYSTANDER_OPINION,
        decay: 0.15,
        source: 'reputation',
      });
    }
    state.message = t('diplo.pactBrokenByUs', { kingdom: kingdom.name });
  }
}
