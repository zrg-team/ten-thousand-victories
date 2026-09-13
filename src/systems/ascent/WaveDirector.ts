import { isVassal } from './VassalSystem';
import { addRubbings, grantDeed } from '../../state/cabinet';
import { noteLiveReign, noteRubbing } from './Inheritance';
import { evaluateGoal } from './Goal';
import { rulesOf } from '../../game/ascentRuleset';
import { liveStrikeSample, strikeReference } from './strikeReference';
import { plannedWaveArrival } from './frontForecast';
import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  BOSS_EVERY_N_WAVES,
  BOSS_PRESSURE_MULT,
  COALITION_WAVE_MULT,
  BOSS_TELEGRAPH_TICKS,
  INVADER_POWER_PER_SOLDIER,
  MAX_HOSTS_PER_KINGDOM,
  EARLY_WAVE_FIELD_SHARE,
  EARLY_WAVE_GRACE,
  RIVAL_LAND_PRESSURE,
  RIVAL_LAND_PRESSURE_RAMP_WAVES,
  MAX_LIVE_INVADER_HOSTS,
  MIN_WAVE_SOLDIERS,
  PEACE_FLOOR_EARLY,
  PEACE_FLOOR_JITTER,
  PEACE_FLOOR_LATE,
  PEACE_FLOOR_RAMP_WAVES,
  RELATIONS_WAVE_DIAL,
  RAID_INTERVAL_TICKS,
  MERCENARY_GOLD_BASE,
  MERCENARY_TREASURY_SHARE,
  FORTIFY_TREASURY_SHARE,
  BUYOFF_TREASURY_SHARE,
  MERCENARY_INCOME_MULT,
  MERCENARY_POWER_SHARE,
  WAR_PURCHASE_ESCALATION,
  MIN_RAID_SOLDIERS,
  RAID_MIN_LANDS,
  RAID_POWER_SHARE,
  FORTIFY_DEFENCE_SHARE,
  FORTIFY_DEFENSE_MIN,
  RESPONSE_ASK_BELOW_WIN,
  RAID_WAVE_CLEARANCE,
  WAVE_BASELINE_GROWTH,
  WAVE_BASELINE_POWER,
  WAVE_INTERVAL_TICKS,
  WAVE_LAG,
  WAVE_FIELD_CEILING,
  WAVE_OPENING_RAMP_WAVES,
  WAVE_OPENING_SHARE,
  WAVE_SHADOW_BASE,
  WAVE_SHADOW_CEIL,
  WAVE_SHADOW_HEAT_SHARE,
  WAVE_SHADOW_MAX,
  WAVE_SHADOW_RAMP,
  XP_PER_WAVE_SURVIVED,
 waveMatchFactor, ASCENT_TUNING } from '../../game/ascentConfig';
import {
  EMERGENCY_LEVY_CAP, MIN_ARMY_SOLDIERS, recruitSoldiers, SUPPLY_TICKS_HELD,
  REINFORCE_SHARE, waveShapeFor, type WaveShape,
} from '../../game/ascentConfig';
import { weightedPick } from '../../utils/math';
import { difficultyArmyScale, launchOffMapInvasion } from '../empire/InvasionSystem';
import { committedAggressor } from './wavePlanView';
import { assignHeroDuty } from '../heroes/HeroService';
import { applyResourceDelta, canSpend } from '../ResourceSystem';
import { armyPower, queueRecruitment } from '../WarSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import {
  ambitionHeat,
  chargeAmbition,
  decayAmbition,
  payAmbitionSpoils,
  recordAmbitionPeak,
} from './AmbitionSystem';
import { waveDelayTicks, warPurchaseDiscount } from './DoctrineSystem';
import {
  addAscentXp, computeFieldDefencePower, contestedDefencePower, ownedLandCount, waveFacingDefencePower, sizingDefencePower } from './PowerSystem';
import { heroName, t } from '../../i18n';
import type {
  AscentPrompt,
  AscentWaveCue,
  AscentWaveOutcome,
  CourtPositionId,
  EmpireResponseOption,
  GameState,
  Hero,
  Army,
  Kingdom,
  Land,
} from '../../state/types';

/**
 * Costs of the prepared responses.
 *
 * Scaled with the wave rather than flat: the realm's gold income compounds hard once it
 * holds a dozen provinces, and fixed prices become rounding errors by mid-run — every
 * option reads "affordable" and the choice stops being a choice.
 */
const FORTIFY_GOLD_BASE = 120;
const BUYOFF_GOLD_BASE = 260;
const SEND_HOST_SUPPLIES = 35;

/**
 * Prices are the greater of a wave-scaled floor and a multiple of the realm's gold income.
 *
 * Income compounds hard enough that a treasury can reach six figures; against that, any
 * fixed or merely wave-scaled price is a rounding error and every option reads "affordable"
 * forever. Pegging to income keeps the decision real however rich the realm gets.
 */
/**
 * Multiplier on every gold price on the response card, from how many the realm has already
 * bought this run. One counter for walls and sellswords alike: they are the same purchase —
 * coin turned into survival — and pricing them independently just moves the win button from
 * one row of the card to the other.
 */
function warPurchaseMultiplier(state: GameState): number {
  const escalation = Math.pow(WAR_PURCHASE_ESCALATION, state.ascent?.warPurchases ?? 0);
  // Salt Roads is a discount on this, not on a market the player never visits — see the note
  // on its rewrite in `ascentCards.ts`.
  return escalation * (1 - warPurchaseDiscount(state));
}

function fortifyCost(state: GameState, wave: number): number {
  // Never below a share of the treasury: a rich crown pays a rich crown's price for its walls.
  // See `FORTIFY_TREASURY_SHARE`.
  const floor = Math.max(
    FORTIFY_GOLD_BASE * (1 + wave * 0.25),
    state.resourceRates.gold * 6,
    state.resources.gold * FORTIFY_TREASURY_SHARE,
  );
  return Math.round(floor * warPurchaseMultiplier(state));
}

function buyOffCost(state: GameState, wave: number): number {
  return Math.round(Math.max(
    BUYOFF_GOLD_BASE * (1 + wave * 0.32),
    state.resourceRates.gold * 14,
    state.resources.gold * BUYOFF_TREASURY_SHARE,
  ));
}

/**
 * Price of a mercenary company, pegged to income like every other response.
 *
 * This is the mode's answer to a treasury that does nothing. Gold compounds hard — a realm
 * ten minutes in banks tens of thousands with no way to convert any of it into survival —
 * so the run needs one lever that turns coin directly into soldiers, now, with no muster
 * timer, no free commander and no manpower cost.
 */
function mercenaryCost(state: GameState, wave: number): number {
  const floor = Math.max(
    MERCENARY_GOLD_BASE * (1 + wave * 0.3),
    state.resourceRates.gold * MERCENARY_INCOME_MULT,
    state.resources.gold * MERCENARY_TREASURY_SHARE,
  );
  return Math.round(floor * warPurchaseMultiplier(state));
}

/** Soldiers a mercenary company brings: a real answer to the wave, not a token. */
function mercenarySize(state: GameState): number {
  return Math.max(MIN_ARMY_SOLDIERS, Math.round(laggedDefencePower(state) * MERCENARY_POWER_SHARE / INVADER_POWER_PER_SOLDIER));
}
/** Ceiling on hosts the emergency levy may add on top of whatever the autopilot keeps. */
const MAX_STANDING_HOSTS = 5;

/**
 * Walls bought by the Fortify option, sized as a share of **the wave they must stop**.
 *
 * A flat +10 was the emptiest option on the card: `landGarrisonPower` values a point of defence
 * at 16, so ten points added 160 power to a realm fielding four thousand — four tenths of one
 * percent for six seasons of income. Scaling it fixed that and created something worse. Sized
 * as a share of the realm's *own* defence, each purchase added 18% of the current total and the
 * next purchase was 18% of that — a compounding engine growing at 1.18 per wave against a
 * threat curve growing at 1.11. Measured with the strategy driver: a run that simply bought
 * walls on every response survived all twenty seeds to the tick limit without dying once, both
 * before and after mercenary prices were made to escalate. Walls, not sellswords, were the win
 * button.
 *
 * Pricing them against the incoming wave keeps both properties and neither pathology. The
 * purchase is always worth its price, because it is always a fixed share of exactly the problem
 * in front of the player; and buying one does not make the next one bigger, so a run's total
 * fortification *tracks* the curve instead of outrunning it.
 */
function fortifyDefenceGain(state: GameState): number {
  const ascent = state.ascent;
  const wave = ascent?.wave ?? 1;
  const incoming = Math.max(
    ascent?.threat ?? 0,
    waveTargetPower(state, wave, ascent?.lastWaveBoss ?? false, liveWaveHeat(state)),
  );
  return Math.max(FORTIFY_DEFENSE_MIN, Math.round((incoming * FORTIFY_DEFENCE_SHARE) / 16));
}
/**
 * The bounds of the ±10% swing `resolveInvaderBattle` rolls on every fight. Mirrored here so the
 * odds the player is shown come from the same distribution that decides the outcome; if that
 * fuzz ever changes, these must change with it.
 */
const FUZZ_MIN = 0.9;
const FUZZ_MAX = 1.1;
/** Invader power above which the attacker counts as a large host and brings heavier siege. */
const LARGE_HOST_POWER = 1000 * INVADER_POWER_PER_SOLDIER;

const BUYOFF_DELAY_TICKS = 6;
const ENDURE_MOMENTUM = 60;

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % BOSS_EVERY_N_WAVES === 0;
}

/**
 * The realm's defensive power as raids, mercenary companies and the wave's shadow see it: what
 * it could field `WAVE_LAG` waves ago, not what it can field now.
 *
 * The pure mirror (`lagged × pressure`, ratio pinned near 1) was removed for making every pick
 * self-cancelling; the shadow in `waveTargetPower` reads this again, but only ever as a
 * SUB-mirror share — the lag is what makes consolidating between waves worth something, and the
 * share below one is where the player's edge lives.
 */
export function laggedDefencePower(state: GameState, lookahead = false): number {
  const ascent = state.ascent;
  const live = sizingDefencePower(state);
  if (!ascent) return live * WAVE_OPENING_SHARE;

  // `lookahead` (beta forecast only): read the sample the *next* wave will be sized against —
  // `startWave` pushes a fresh sample before sizing, so the lag then lands one entry later.
  const samples = ascent.defenceSamples ?? [];
  // With one more sample on the list, the lag reads index `length + 1 − WAVE_LAG`; before there is a
  // sample that old it is the opening share, exactly as for the declared wave.
  const lagged = lookahead
    ? samples[samples.length + 1 - WAVE_LAG]
    : samples[samples.length - WAVE_LAG];

  // The opening share hands off to the real sample over `WAVE_OPENING_RAMP_WAVES` waves rather
  // than in one step, and that ramp is half the fix for the reported Year-4 spike.
  //
  // What it replaces: this returned `live * 0.55` while no sample existed and the raw sample the
  // instant one did. Wave 1's shadow therefore stood at an effective 0.55 x 0.55 = **0.3025** of
  // live defence and wave 2's at **0.57** — an 88% step from the lag machinery alone, before any
  // growth was counted. A player who had done nothing between the two waves still met one nearly
  // twice the size, which reads exactly like the game cheating, because it is.
  const wave = Math.max(1, ascent.wave + (lookahead ? 1 : 0));
  const openingWeight = Math.max(0, 1 - (wave - 1) / WAVE_OPENING_RAMP_WAVES);
  const opening = live * WAVE_OPENING_SHARE;

  // Early on there is no history to lag against, so quote a share of the live figure — the
  // opening waves are meant to be winnable while the realm is still one province and one host.
  if (lagged === undefined) return opening;

  // Never *more* than the live figure: a realm that just lost its army should not keep facing
  // waves sized for the army it no longer has, or a single bad battle ends the run outright.
  const sample = Math.min(lagged, live);
  return sample + (opening - sample) * openingWeight;
}

/**
 * **How dangerous the next wave is, and why.** The one number this whole mode turns on.
 *
 * Two terms, and the split between them is the design:
 *
 *   - a **baseline** that climbs with the wave number alone, which the player cannot influence.
 *     This is the world getting worse on its own schedule, and it is what makes doing nothing a
 *     losing strategy rather than an unbeatable one.
 *   - the **ambition** the player has standing, which multiplies it. This is the half they
 *     chose, they watched themselves choose, and they can let cool.
 *
 * What it replaces — `laggedDefencePower × wavePressure` — read the realm's own defence, so
 * every point of strength bought summoned a matching point of threat and no choice could ever
 * change the outcome. Measured across a full run: a player who declined everything held a
 * defence that plateaued at 3,000 against a threat pinned at 0.94× of it for thirty waves,
 * while a player who engaged climbed to 8,088 with the threat tracking at 0.95× and died for
 * it. That is a treadmill wearing a difficulty curve's clothes.
 *
 * The lag machinery (`laggedDefencePower`, `defenceSamples`) survives because raids and
 * mercenary companies are still sized against what the realm can field — those *should* scale
 * with the player. Only the wave stopped asking.
 */
export function waveTargetPower(
  state: GameState,
  wave: number,
  boss: boolean,
  heat = ambitionHeat(state),
): number {
  return waveSizingParts(state, wave, boss, heat).final;
}

/**
 * Every term a wave is sized from, and which of them set it.
 *
 * `waveTargetPower` is this function's `final`. It exists as a separate, pure read so the things
 * that need to see *why* a wave is the size it is — the skill-ceiling gate's per-wave record, a
 * ruleset that sizes a wave by what it strikes, the THREAT projection — read the same arithmetic
 * the wave is launched with instead of re-deriving it and drifting (`diag-wave-parts.mjs` drifted
 * from this in four places). Reads only; never writes, never draws.
 */
export interface WaveSizingParts {
  /** The calendar: `WAVE_BASELINE_POWER × WAVE_BASELINE_GROWTH^(wave−1)`. */
  baseline: number;
  /** Baseline × ambition heat × boss. */
  target: number;
  /** `waveMatchFactor` against the defence a host has to get through. */
  match: number;
  /** The surcharge for the map the rivals hold. */
  rivalMult: number;
  curve: number;
  rampShare: number;
  heatedShare: number;
  /** What the realm could field a wave ago (`laggedDefencePower`). */
  lagged: number;
  shadow: number;
  ceiling: number;
  /** min(max(curve, shadow), max(curve, ceiling)) — before the opening cap. */
  sized: number;
  /** The wave. */
  final: number;
  /** Which term decided `final`. */
  bound: 'curve' | 'shadow' | 'ceiling' | 'early' | 'floor';
}

export function waveSizingParts(
  state: GameState,
  wave: number,
  boss: boolean,
  heat = ambitionHeat(state),
  /** Beta forecast only: size the next, not-yet-declared wave against the sample it will read. */
  lookahead = false,
): WaveSizingParts {
  const baseline = WAVE_BASELINE_POWER * Math.pow(WAVE_BASELINE_GROWTH, Math.max(0, wave - 1));
  const target = baseline * heat * (boss ? BOSS_PRESSURE_MULT : 1);
  // The run answers strength: a realm marching ahead of the calendar is quoted a wave sized to
  // IT, not to the wave number. Applied at the single source — the soldier budget, the
  // budget-spent skip and the HUD's projection all read this — so the quote on the strength
  // rail can never disagree with the host that lands.
  //
  // **Battle power on both sides.** This read `state.ascent.power` — the composite POWER scalar
  // the HUD shows, which folds in treasury, grain and stores at x1.5 — against a target measured
  // in raw battle power. The two are not the same unit and never were: at the opening board the
  // ratio is about 3.9, so the factor pinned to its `cap: 1.7` on the first tick and stayed
  // there for the whole run. The `threshold: 1.15` grace, which exists so a small lead is free,
  // never engaged once — every wave in every run was quoted 70% larger than the curve intended.
  // `waveFacingDefencePower`, not `contestedDefencePower`: what a host has to get through,
  // not what the realm is worth. See the note on that function — the difference is a term that
  // grows with province count, and it was the only part of the curve that punished expanding.
  // Beta (`strikeSizing`): after the opening, lean every realm reading below toward what this wave's
  // shape actually marches at. Undefined — and every expression below exactly the shipped one — on
  // a stable reign and through the opening waves.
  const strikeShare = rulesOf(state).strikeSizing;
  const strike = strikeShare > 0 && wave > EARLY_WAVE_FIELD_SHARE.length
    ? strikeReference(liveStrikeSample(state), waveShapeFor(wave, boss), boss)
    : undefined;
  const lean = (realm: number): number => (strike === undefined ? realm : realm + (strike - realm) * strikeShare);
  const match = waveMatchFactor(strike === undefined ? waveFacingDefencePower(state) : lean(waveFacingDefencePower(state)), target);
    /**
     * ...and the world the player left to the rivals.
     *
     * Every other term here is measured off what the player *holds*, which is why holding nothing
     * was the strongest line in the mode: twelve tuning attempts could not make engaging beat
     * refusing, and removing the mirror only made refusing better still (103 waves against 84).
     * This term runs the other way. Rivals now settle the neutral map (`tickRivalExpansion`), and
     * every district they end up holding is a district the player did not take — so a realm that
     * sits still does not stay small, it faces a world that grew instead of it.
     */
  const rivalMult = 1 + rivalMapShare(state) * RIVAL_LAND_PRESSURE * rivalPressureRamp(wave);
  const curve = target * match * rivalMult;

  // The realm's shadow (see the WAVE_SHADOW_* block in ascentConfig): the curve above still
  // owns the floor for a realm that has done nothing, but a compounding economy laps any
  // calendar — measured, defence at 17,800 against waves of a few hundred men — so the wave is
  // also floored at a growing, sub-mirror share of what the realm could field WAVE_LAG waves
  // ago. Under the share the fight is always real; over it, the player's edge is their own.
  const rampShare = Math.min(WAVE_SHADOW_MAX, WAVE_SHADOW_BASE + WAVE_SHADOW_RAMP * Math.max(0, wave - 1))
    * ASCENT_TUNING.shadowShareMult;
  const heatedShare = Math.min(WAVE_SHADOW_CEIL, rampShare * (1 + (heat - 1) * WAVE_SHADOW_HEAT_SHARE));
  const laggedRealm = laggedDefencePower(state, lookahead);
  // The strike reference is live; it inherits the realm's lag as a ratio, so a realm that just lost
  // its army is still quoted the army it had a wave ago, exactly as the realm reading is.
  const lagged = strike === undefined
    ? laggedRealm
    : lean(laggedRealm) - (strike - strike * Math.min(1, laggedRealm / Math.max(1, sizingDefencePower(state)))) * strikeShare;
  const shadow = lagged * heatedShare * (boss ? BOSS_PRESSURE_MULT : 1);

  // The shadow may not outgrow what the realm can actually put in the field.
  //
  // The other half of the Year-4 report, and the subtler half. `contestedDefencePower` is the
  // right denominator for *odds* — a wave really does have to pass walls and reinforcements — but
  // `waveSoldierBudget` turns this number into **bodies**, and for a young realm three quarters
  // of it is capital masonry standing somewhere the host is not going. Measured on the reported
  // run: 460 field soldiers, a floor of 1,505 power, ~1,450 men delivered to a district that
  // could raise 556.
  //
  // Capping only the shadow, and flooring the cap at the baseline, is what keeps this honest in
  // both directions. The baseline curve is the world's own schedule and is never capped, so
  // disbanding the army to shrink the wave does not work — passivity stays fatal. The mirror is
  // capped, because a mirror that outgrows the thing it reflects was never a mirror.
  const ceiling = Math.max(target, (strike === undefined ? computeFieldDefencePower(state) : lean(computeFieldDefencePower(state))) * WAVE_FIELD_CEILING);

  const sized = Math.min(Math.max(curve, shadow), Math.max(curve, ceiling));
  const sizedBound: WaveSizingParts['bound'] = sized === curve ? 'curve' : sized === shadow ? 'shadow' : 'ceiling';
  const parts = { baseline, target, match, rivalMult, curve, rampShare, heatedShare, lagged, shadow, ceiling, sized };

  /**
   * The opening is sized against the army, not against the realm.
   *
   * Everything above is the right arithmetic for a run in flight and the wrong one for wave one.
   * `contestedDefencePower` at the opening board is mostly the capital's masonry, so
   * `waveMatchFactor` sits on its 1.7 cap from the first tick and the first host the player ever
   * meets is quoted ~900 power against a field army of 460 men — before they have been shown what
   * commanding a battle does. Measured across three seeded runs, wave 1 landed 864 to 993 men.
   *
   * For `EARLY_WAVE_GRACE` waves the wave may not outweigh a share of what the realm can actually
   * march. Floored at half the baseline so it is still a war and not a formality, and only ever a
   * *reduction* — a realm that has already lost its host does not get a smaller wave than the
   * calendar's own floor, or losing the opening would be the way to make the opening easier.
   */
  // The sizing ramp runs longer than the spawner grace: `EARLY_WAVE_GRACE` decides who may
  // pile on and what opens on screen, this decides how heavy the wave is, and the second has to
  // hand back gradually or wave three is a wall.
  if (wave >= 1 && wave <= EARLY_WAVE_FIELD_SHARE.length) {
    // **Marchable power, not `computeFieldDefencePower`.** That helper adds the capital's garrison
    // to the field hosts, and at the opening board the seat is ~1,000 of a ~1,650 total — so
    // capping against it quoted wave 2 at 1,433 men, *larger* than the 1,364 it replaced. The
    // question this cap is asking is "what can the player put in front of it", and walls do not
    // march.
    const marchable = state.armies.reduce((sum, army) => (
      army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron
        ? sum + armyPower(state, army)
        : sum
    ), 0);
    const share = EARLY_WAVE_FIELD_SHARE[Math.min(EARLY_WAVE_FIELD_SHARE.length - 1, wave - 1)];
    /**
     * **What the realm could field, not only what it fields.**
     *
     * This branch used to run only while `marchable > 0`, so a realm whose one host had just
     * died was handed the whole uncapped curve — and losing the opening host is the *common*
     * case, not the edge: measured across eight seeds, most realms were hostless by season 30.
     * The cliff read as a wall: a hostless realm with 24 men was quoted 210, and the same realm
     * a season later, with none, met 935 to 2,165 (the wave-four hammer, plus the punitive hosts
     * that size themselves off the same figure). The comment that justified it — "losing the
     * opening must not be the way to make the opening easier" — is kept by measuring against
     * the host the realm's people and purse could raise *now* (`fieldablePower`): a realm that
     * lost its army is sized as though it had re-mustered, never as though it had nothing.
     */
    const early = Math.max(WAVE_BASELINE_POWER * 0.5, Math.min(sized, fieldablePower(marchable) * share));
    const bound = early === sized ? sizedBound : early === WAVE_BASELINE_POWER * 0.5 ? 'floor' : 'early';
    return { ...parts, final: early, bound };
  }

  return { ...parts, final: sized, bound: sizedBound };
}

/**
 * The field power the opening cap reads: the hosts standing, floored at the smallest host the
 * mode musters. A realm that lost its army is sized as though it had raised the minimum host
 * again — never as though it had nothing, and never as though it had raised everything it could.
 *
 * The first cut read `max(MIN_ARMY_SOLDIERS, musterLimit(state))`, the host the realm *could*
 * raise, and that scales with wealth: on a seed where the founding's second claim party had the
 * realm at six provinces by wave three, the purse could raise a thousand men, the cap lifted to
 * that potential, and a 932-man column marched on an actual host of 264. What the realm could
 * afford is not what it fields; the cap reads the field, and the floor is the one host every
 * realm can always put back.
 */
function fieldablePower(marchable: number): number {
  return Math.max(marchable, MIN_ARMY_SOLDIERS * INVADER_POWER_PER_SOLDIER);
}

/**
 * How much of `RIVAL_LAND_PRESSURE` applies at this wave: nothing through the opening grace, then
 * phasing in over `RIVAL_LAND_PRESSURE_RAMP_WAVES`. The courts only begin settling the map after
 * the grace (`tickRivalExpansion`), so this is the difference between a surcharge that is at full
 * weight the season it appears and a world that is visibly, gradually, closing in.
 */
function rivalPressureRamp(wave: number): number {
  return Math.min(1, Math.max(0, wave - EARLY_WAVE_GRACE) / RIVAL_LAND_PRESSURE_RAMP_WAVES);
}

/**
 * How much of the settled map belongs to somebody else — a share, not a count.
 *
 * The count was tried first and is not asymmetric enough to matter: rivals reach
 * `RIVAL_CLAIM_MAX_SHARE` whether or not the player expands, so both lines paid nearly the same
 * surcharge and the whole mode simply got harder (measured, engaged fell 37.1 waves to 31.7 for a
 * ratio gain of 0.15). As a share of settled ground, taking a province moves the term *down* —
 * which is the point. A realm holding one district beside twenty rival ones reads 0.95; one
 * holding twelve reads 0.62, and that gap is the reward for having gone out and contested it.
 */
function rivalMapShare(state: GameState): number {
  let rival = 0;
  let mine = 0;
  for (const land of state.lands) {
    if (land.ownerId === PLAYER_KINGDOM_ID) mine += 1;
    else if (land.ownerId !== NEUTRAL_OWNER_ID) rival += 1;
  }
  const settled = rival + mine;
  return settled > 0 ? rival / settled : 0;
}

/** The multiplier the wave on the map was sized with, for everything that must match its quote. */
function liveWaveHeat(state: GameState): number {
  return state.ascent?.waveHeat ?? 1;
}

/**
 * Soldier budget for a wave, from the target above.
 *
 * The target is for the *total* threat standing on the map, not for each spawn: a conquest host
 * takes many seasons to march in and reduce a province, so at a 12-tick cadence the next wave
 * lands while the last is still fighting. Budgeting per-spawn let them pile up until four hosts
 * were live at once and no realm could hold — so whatever is already marching is deducted here.
 */
export function waveSoldierBudget(
  state: GameState,
  wave: number,
  boss: boolean,
  heat = liveWaveHeat(state),
): number {
  const target = waveTargetPower(state, wave, boss, heat);
  const alreadyMarching = liveInvaderPower(state);
  const remaining = Math.max(0, target - alreadyMarching);
  return Math.max(MIN_WAVE_SOLDIERS, Math.round(remaining / INVADER_POWER_PER_SOLDIER));
}

/**
 * Whether the map is already carrying its share of pressure. A wave that would add nothing is
 * skipped entirely rather than spawning a token host on top of the fight in progress.
 */
export function waveBudgetSpent(state: GameState, wave: number, boss: boolean): boolean {
  // A hard ceiling on hosts, not only on power. Power alone let the map accumulate five
  // simultaneous invaders whenever the realm's defence was high enough to justify the budget —
  // which reads as a permanent siege rather than a wave, gives the player no gap in which to
  // retake anything, and made a whole run's midgame one continuous unwinnable fight.
  if ((state.invasions?.length ?? 0) >= MAX_LIVE_INVADER_HOSTS) return true;
  return liveInvaderPower(state) >= waveTargetPower(state, wave, boss, liveWaveHeat(state));
}

/**
 * The *projected* threat for the HUD, before a wave exists to measure.
 *
 * Quotes what the next wave will actually bring rather than an abstract geometric curve: the
 * old projection was computed from `BASE_THREAT × GROWTH^wave` and had no relationship to the
 * host that then spawned, so the readout told the player they were "behind" while a trivial
 * wave landed — or the reverse.
 *
 * Defaults to *live* ambition, not the wave-in-flight's snapshot, because its main job now is
 * to price the next wave while the player is still deciding. That is the moment the whole
 * mechanic exists for: the number on the HUD climbs as they commit, so the danger is something
 * they watched themselves buy.
 */
export function projectedWaveThreat(state: GameState, wave: number, heat = ambitionHeat(state)): number {
  const boss = isBossWave(wave);
  // Beta: the same arithmetic `launchWave` sizes the hosts with, so the number does not jump when
  // they land. Main crown: budget × shape size ÷ crowns × coalition × dial; a second crown brings
  // budget × shape size ÷ crowns × dial; difficulty scales both inside `launchOffMapInvasion`.
  if (rulesOf(state).threatProjection) {
    const ascent0 = state.ascent;
    const lookahead = Boolean(ascent0 && wave === ascent0.wave + 1);
    const target = waveSizingParts(state, wave, boss, heat, lookahead).final;
    const budget = Math.max(MIN_WAVE_SOLDIERS, Math.round(Math.max(0, target - liveInvaderPower(state)) / INVADER_POWER_PER_SOLDIER));
    const shape = waveShapeFor(wave, boss);
    const ascent = state.ascent;
    const dial = ascent && wave === ascent.wave ? ascent.waveDialBudget ?? 1 : expectedDialBudget(state);
    const crowns = shape.kingdoms > 1 ? shape.kingdoms : 1;
    const difficulty = difficultyArmyScale(state.campaignConfig?.difficulty);
    const main = Math.round(budget * shape.sizeMult / crowns * (ascent?.coalitionPending ? COALITION_WAVE_MULT : 1) * dial);
    // The second crown only marches when a second court can (`secondCrown` finds none once every
    // other crown is fallen or sworn), and `launchWave` sizes it *after* the first has landed — its
    // budget deducts the hosts already marching, so it brings what is left of the target, not half.
    // Measured before this: two-crown Great Invasions landed ~25% under the forecast.
    const courts = state.kingdoms.filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated && !isVassal(k)).length;
    let second = 0;
    if (shape.kingdoms > 1 && courts >= 2) {
      const marching = liveInvaderPower(state) + main * difficulty * INVADER_POWER_PER_SOLDIER;
      const allyBudget = Math.max(MIN_WAVE_SOLDIERS, Math.round(Math.max(0, target - marching) / INVADER_POWER_PER_SOLDIER));
      second = Math.round(allyBudget * shape.sizeMult / shape.kingdoms * dial);
    }
    return Math.round((main + second) * difficulty * INVADER_POWER_PER_SOLDIER);
  }
  // `waveSoldierBudget` is the whole wave's budget, split across its hosts — not a per-host
  // figure, so it must not be multiplied by the host count again.
  return Math.round(waveSoldierBudget(state, wave, boss, heat) * INVADER_POWER_PER_SOLDIER);
}

/**
 * Men in a raid: a small share of what the realm could field a wave ago, over its own floor.
 *
 * One formula for both raid doors — the scheduled raid clock here and the contact march in
 * `EnemyCommandDirector` carried identical copies, so a ruleset that resized one would have
 * silently left the other on the old arithmetic.
 */
export function raidSoldierBudget(state: GameState): number {
  const budget = Math.round(laggedDefencePower(state) * RAID_POWER_SHARE / INVADER_POWER_PER_SOLDIER);
  return Math.max(MIN_RAID_SOLDIERS, budget);
}

/** Records what the realm could field, for later waves to be sized against. */
export function sampleDefencePower(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.defenceSamples ??= [];
  // The sizing figure, not the odds figure: the shadow may not mirror the tenure dividend
  // (`TENURE_MILITIA_SIZING_SHARE`). Raids and companies read these samples too, and are sized a
  // little under the whole watch for the same reason.
  ascent.defenceSamples.push(sizingDefencePower(state));
  // Only the recent tail is ever read; keeping the whole run would bloat every save.
  if (ascent.defenceSamples.length > 12) ascent.defenceSamples.shift();
}

/**
 * Battle power of the hosts actually on the map right now.
 *
 * The THREAT readout is *measured*, not invented. `launchOffMapInvasion` clamps a wave's
 * size against the player's own military, so a purely formula-driven number would drift
 * far from what actually attacks and the HUD would lie about whether you are winning.
 */
export function liveInvaderPower(state: GameState): number {
  if (!state.invasions?.length) return 0;
  let total = 0;
  for (const record of state.invasions) {
    const army = state.armies.find((candidate) => candidate.id === record.armyId);
    if (army) total += armyPower(state, army);
  }
  return Math.round(total);
}


/**
 * The relations dial's budget a wave not yet declared should expect: each court's band weighted the
 * way `pickAggressor` weighs its odds of marching. No roll — a forecast must not spend randomness.
 * The peace floor, once breached, forces a full-size wave.
 */
function expectedDialBudget(state: GameState): number {
  if (peaceFloorBreached(state)) return 1;
  // Beta: the court is already chosen, so its own band — not the average — is what will land.
  const next = forecastAggressor(state);
  if (next) return relationsDial(state, next.id).budget;
  let total = 0;
  let weighted = 0;
  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated || isVassal(kingdom)) continue;
    const weight = Math.max(5, 100 - (kingdom.relations ?? 50) + (kingdom.power ?? 40) * 0.5);
    total += weight;
    weighted += weight * relationsDial(state, kingdom.id).budget;
  }
  return total > 0 ? weighted / total : 1;
}

/**
 * Beta: the court drawn for the next wave, while it can still march (not fallen, not sworn).
 * Undefined on stable, before the first draw, and once it can no longer come.
 */
function forecastAggressor(state: GameState): Kingdom | undefined {
  return committedAggressor(state);
}

/** Picks the aggressor: the angriest and strongest surviving empire, with some spread. */
function pickAggressor(state: GameState): Kingdom | undefined {
  // A crown sworn to you does not march on you. Note `tickWaveDirector` counts the wave up and
  // *then* bails when this returns nothing, so an empty pool is a run that cannot be lost —
  // `canVassalize` refuses the last sovereign for exactly that reason.
  const candidates = state.kingdoms.filter(
    (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated && !isVassal(kingdom),
  );
  return weightedPick(candidates, (kingdom) => {
    const hostility = 100 - (kingdom.relations ?? 50);
    return Math.max(5, hostility + (kingdom.power ?? 40) * 0.5);
  });
}

/**
 * **What the realm's standing with one court actually buys.**
 *
 * The answer used to be: whose name is on the wave, and nothing else. `pickAggressor` weighs a
 * rival at `max(5, hostility + power * 0.5)`, so a court you have perfected weighs 25 against a
 * hateful one's 125 — measured, that moves it from about a quarter of waves to about a fifteenth,
 * and the other three courts absorb every wave it declines to send. Same tick, same size, a
 * different flag on it. The player's report was simply accurate: *relations do nothing.*
 *
 * Now standing moves the clock, the budget and the host count, on the bands in
 * `RELATIONS_WAVE_DIAL` — and read from the court that *actually marched*, never an average of
 * the four. That is the part that makes it a strategy rather than a tax: cultivating the wrong
 * neighbour buys nothing at all, so the player has to read the board and choose.
 *
 * What it deliberately cannot do is stop a war. See `peaceFloorTicks`.
 */
export function relationsDial(
  state: GameState,
  kingdomId: string | undefined,
): { clock: number; budget: number; hosts: number } {
  const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
  const relations = kingdom?.relations ?? 50;
  const band = RELATIONS_WAVE_DIAL.find((entry) => relations >= entry.atLeast)
    ?? RELATIONS_WAVE_DIAL[RELATIONS_WAVE_DIAL.length - 1];
  return { clock: band.clock, budget: band.budget, hosts: band.hosts };
}

/**
 * **How long the courts may stay quiet before one marches regardless.**
 *
 * The promise that keeps this a siege. Every multiplier above delays and shrinks a war; none of
 * them cancels one, and this is where that is enforced — if no hostile host has stood on owned
 * ground for this many ticks, the next wave lands at full size whatever the diplomacy screen says.
 *
 * Two properties, both asked for, both load-bearing:
 *
 *  - **Long early, short late.** Forty ticks is five played years for a realm in its first waves,
 *    which is what makes an opening spent on the courts a real strategy; fourteen is barely more
 *    than the ordinary cadence by the late game, when the realm has armies, walls and gold and
 *    "nobody is attacking me because I was polite in Year 2" would be an answer worth nothing.
 *  - **Random.** A guarantee the player can count to the season is an appointment, not a war. The
 *    jitter band is what keeps the realm having to stay ready.
 */
export function peaceFloorTicks(state: GameState): number {
  const wave = Math.max(1, state.ascent?.wave ?? 1);
  const progress = Math.min(1, (wave - 1) / PEACE_FLOOR_RAMP_WAVES);
  const base = PEACE_FLOOR_EARLY + (PEACE_FLOOR_LATE - PEACE_FLOOR_EARLY) * progress;
  const [lo, hi] = PEACE_FLOOR_JITTER;
  return Math.max(1, Math.round(base * (lo + Math.random() * (hi - lo))));
}

/** Whether the courts have been quiet long enough that the next wave ignores the dial entirely. */
export function peaceFloorBreached(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  const since = state.turn - (ascent.lastContactTurn ?? 0);
  // Rolled once per wave and remembered, so the threshold cannot be re-rolled every tick into
  // effectively its own minimum — the classic way a jittered guard degenerates into a constant.
  ascent.peaceFloor ??= peaceFloorTicks(state);
  return since >= ascent.peaceFloor;
}

function playerCapital(state: GameState): Land | undefined {
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  return owned.find((land) => land.type === 'castle') ?? owned[0];
}

/**
 * Odds of holding, computed from the model that actually decides the battle.
 *
 * `resolveInvaderBattle` is not a ratio — it is a threshold with noise:
 *
 *     victory(attacker) ⟺ attackerPower ≥ defenderPower × siegeMult × fuzz,
 *     fuzz ~ Uniform(0.9, 1.1)
 *
 * so with `r = attackerPower / (defenderPower × siegeMult)` the defender holds with probability
 * `P(fuzz > r)`, which is **1 below r = 0.9, 0 above r = 1.1, and linear between**. A sharp
 * band, not a gentle curve.
 *
 * The `power / (power + threat)` shape this replaces was an invented figure that never touched
 * the real maths, and it was wrong in both directions at once: at four thousand defence against
 * two thousand threat it advertised 67% when the true answer was a certainty, and because it can
 * reach neither 0 nor 100 it compressed every option on the card into a five-point huddle. The
 * card differentiated on *axis* while its numbers said nothing.
 *
 * Quoting the real model means an option that pushes the realm across the band swings the number
 * hard — which is exactly when the player most needs to be told that their gold changes the
 * outcome — and a wave that is simply unwinnable, or simply won, now says so.
 */
function projectedWinChance(state: GameState, threat: number, bonus = 0): number {
  // Quoted against what will actually stand at the point of contact — never more.
  //
  // `contestedDefencePower` is the right denominator for *sizing* a wave: a host really does
  // have to cut through a realm's depth. It is the wrong one for *odds* on a young realm, where
  // the blend is dominated by capital masonry and the wave lands on a district holding none of
  // it. On the reported run this returned 100%, which put the number above `RESPONSE_ASK_BELOW_WIN`
  // and suppressed the response card entirely — so the player was told the wave was a certainty,
  // given no options, and then shown a rout. Being beaten is a difficulty problem; being told you
  // could not lose and then losing is a trust problem, and the second one is worse.
  //
  // A realm with real depth is unaffected: with several provinces the two figures converge, and
  // the min simply picks the honest one.
  const contested = contestedDefencePower(state);
  const field = computeFieldDefencePower(state);
  const power = Math.min(contested, ownedLandCount(state) < 3 ? field : contested) * (1 + bonus);
  if (power <= 0) return 0;

  // Great hosts bring siege engines and negate more of the walls; `resolveInvaderBattle` picks
  // the same three tiers off host size and `great`, so the projection has to as well or it will
  // be systematically optimistic about exactly the waves that matter most.
  const boss = state.ascent?.lastWaveBoss ?? false;
  const siegeMult = boss ? 0.72 : threat > LARGE_HOST_POWER ? 0.8 : 0.85;

  const ratio = threat / Math.max(1, power * siegeMult);
  if (ratio <= FUZZ_MIN) return 100;
  if (ratio >= FUZZ_MAX) return 0;
  return Math.round(((FUZZ_MAX - ratio) / (FUZZ_MAX - FUZZ_MIN)) * 100);
}

/**
 * Size of the host raised by the emergency levy.
 *
 * Scaled off available manpower like any other muster, and never below a full host. A fixed
 * small levy is actively harmful: the autopilot counts any army above a fraction of a full
 * host toward its target, so a trickle of tiny emergency armies convinces it the realm is
 * already defended and it stops raising the real one.
 */
function emergencyLevySize(state: GameState): number {
  // Bounded on its own, because nothing is charged for it — see `EMERGENCY_LEVY_CAP`. Every other
  // muster is bounded by what the realm can pay; this one has to be bounded by decree.
  return Math.max(MIN_ARMY_SOLDIERS, Math.min(
    EMERGENCY_LEVY_CAP,
    recruitSoldiers(Math.max(0, state.resources.humans - 60)),
  ));
}

/** Frees a hero from whatever posting they hold so they can take a new command. */
function releaseHero(state: GameState, heroId: string): void {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  if (!hero?.assignedTo) return;
  if (hero.growth) { assignHeroDuty(state, hero.id, { kind: 'home' }); return; }

  if (hero.assignedTo.startsWith('court:')) {
    const seat = hero.assignedTo.slice('court:'.length) as CourtPositionId;
    if (state.court.seats[seat] === hero.id) state.court.seats[seat] = undefined;
  } else {
    const army = state.armies.find((candidate) => candidate.id === hero.assignedTo);
    if (army?.generalHeroId === hero.id) army.generalHeroId = undefined;
  }
  hero.assignedTo = undefined;
}

/**
 * Builds the counter-play menu: everything the player might want to *buy* about an incoming
 * wave, on one modal. Raising a host is not on it — see the note in the return below.
 */
export function buildResponseOptions(state: GameState, threat: number): EmpireResponseOption[] {
  const wave = state.ascent?.wave ?? 1;
  const fortify = fortifyCost(state, wave);
  const buyOff = buyOffCost(state, wave);

  // Each option's odds are derived from what it actually adds to the defence *this* wave,
  // rather than from a hand-picked percentage.
  //
  // The constants this replaces (+0.25 / +0.12 / +0.30) produced five options whose quoted
  // outcomes sat within an average of five percentage points of each other across a whole run —
  // "you will win with 82%, spend nine thousand gold to win with 84%" — so the screen read as a
  // toll booth rather than a decision. Deriving them separates the options honestly: walls are
  // a modest permanent gain, a bought company is a large immediate one, and an emergency levy
  // is worth *nothing* against the host already on its way, because it is still mustering when
  // that host arrives. It pays off from the next wave on, and the card now says so.
  const defence = Math.max(1, contestedDefencePower(state));
  const wallsGain = (fortifyDefenceGain(state) * 16) / defence;
  const mercGain = (mercenarySize(state) * INVADER_POWER_PER_SOLDIER) / defence;

  /**
   * **No `send-host` row.** It was the emergency levy — *Phái {tướng} và mộ binh* — and it is
   * the same act as Lập quân, which the player already has a whole screen for, reachable from
   * the bar at any time and with every dial the muster form offers: how many men, which arms,
   * which commander, what standing order.
   *
   * Two rows for one act is not two choices. This one asked for a commander the realm might not
   * have spare, spent supplies rather than gold, capped itself against `MAX_STANDING_HOSTS`, and
   * — by its own comment above — was worth nothing at all against the host already marching,
   * because the levy it raises is still mustering when that host lands. So the card carried a
   * row that duplicated a better screen and did nothing about the wave it was answering.
   *
   * `applyResponse` still handles `'send-host'`, because a save written before this change can
   * hold a pending prompt that offers it.
   */
  return [
    {
      id: 'fortify',
      cost: { gold: fortify },
      winChance: projectedWinChance(state, threat, wallsGain),
      defence: fortifyDefenceGain(state),
      affordable: canSpend(state, { gold: fortify }),
    },
    {
      id: 'buy-off',
      cost: { gold: buyOff },
      delayTicks: BUYOFF_DELAY_TICKS,
      affordable: canSpend(state, { gold: buyOff }),
    },
    {
      id: 'hire-mercenaries',
      cost: { gold: mercenaryCost(state, wave) },
      winChance: projectedWinChance(state, threat, mercGain),
      // No commander and no manpower needed — that is the point. Coin is the only thing it
      // asks for, so a rich realm always has one more answer than a poor one.
      affordable:
        canSpend(state, { gold: mercenaryCost(state, wave) }) &&
        state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID).length < MAX_STANDING_HOSTS,
    },
    {
      id: 'endure',
      momentum: ENDURE_MOMENTUM,
      winChance: projectedWinChance(state, threat),
      // Always takeable: the player must never be cornered with no legal move.
      affordable: true,
    },
  ];
}

/**
 * Puts a bought company straight onto the capital under no commander.
 *
 * Deliberately bypasses `queueRecruitment`: that spends manpower, needs an unposted hero, and
 * takes seasons to muster — none of which a realm facing a wave *this* season can supply. The
 * whole value of the option is that gold buys time the normal levy cannot.
 */
function hireMercenaries(state: GameState, soldiers: number): void {
  const home = playerCapital(state);
  if (!home) return;

  state.armies.push({
    id: `mercenary-${state.turn}`,
    kingdomId: PLAYER_KINGDOM_ID,
    name: t('ascent.response.mercenaryHost'),
    landId: home.id,
    units: {
      spearmen: Math.floor(soldiers * 0.55),
      archers: Math.floor(soldiers * 0.25),
      heavyInfantry: Math.floor(soldiers * 0.2),
    },
    // Paid soldiers, not levies: they fight well but will not hold a losing line for long.
    morale: 80,
    supply: 85,
    rations: Math.ceil(soldiers / 100) * SUPPLY_TICKS_HELD,
    provisions: Math.ceil(soldiers / 150) * SUPPLY_TICKS_HELD,
    level: 2,
    experience: 0,
    experienceToNextLevel: 160,
    autoDefend: true,
  });
  pushToast(state, t('ascent.response.mercenaryHired', { n: soldiers }), 'reward');
}

/**
 * Queues a banner cue for the UI to play.
 *
 * Appended, never overwritten: a wave the realm plainly holds is met without a response card, so
 * `startWave` closes the previous invasion and launches the next one in the same tick. A single
 * slot lost the older of the two every time, and the older of the two is always the *result* —
 * which is to say the win.
 *
 * Capped at three. A queue that outgrew the screen would be a backlog of proclamations about
 * invasions several seasons behind the one the player is fighting, and the newest is always the
 * one that matters most.
 */
function raiseWaveCue(state: GameState, cue: Omit<AscentWaveCue, 'id'>): void {
  const ascent = state.ascent;
  if (!ascent) return;
  ascent.waveCueSeq = (ascent.waveCueSeq ?? 0) + 1;
  ascent.waveCues ??= [];
  ascent.waveCues.push({ ...cue, id: ascent.waveCueSeq });
  if (ascent.waveCues.length > 3) ascent.waveCues.splice(0, ascent.waveCues.length - 3);
}

/**
 * Pays and announces the result of the invasion that is standing on the map (or has just left it).
 *
 * Called from two places and it must run at most once per wave, which is what `pendingWave`
 * guarantees: the clock calls it the tick the map clears, and `startWave` calls it as a fallback
 * for a wave that never did. The figures are all differences against the snapshot taken when the
 * hosts landed, so the banner can say what the invasion *cost* rather than what the realm happens
 * to hold.
 *
 * The payout is unchanged from when it lived in `startWave` — same momentum, same spoils, same
 * heat, because `waveHeat` is only reset by the next wave being raised. What moved is *when* the
 * player is told, and that is the whole point: "wave 6 broken" arriving five seasons after the
 * last host of wave 6 died is not a reward, it is a footnote.
 */
function resolveWaveResult(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  // The snapshot **is** the "a result is owed for this wave" flag, and clearing it here is what
  // makes the payout idempotent. Without this guard the two callers both paid: the map clearing
  // paid once, and the next wave's clock paid again for a wave already settled — measured over a
  // 337-tick run, 28 waves were paid 33 times, and every one of those was momentum and spoils the
  // realm had not earned.
  const snapshot = ascent.pendingWave;
  if (!snapshot) return;
  ascent.pendingWave = undefined;

  ascent.wavesSurvived += 1;
  // A wave held is the moment the reign's line moves; the house's store keeps it in step.
  noteLiveReign(state);
  // The other end of the dial: surviving a wave you made dangerous pays more than surviving
  // one you hid from. Without this the counter is a pure tax and the correct play is always
  // to take nothing — the reward has to ride the same number as the risk or the choice is
  // not a choice.
  const heat = liveWaveHeat(state);
  const momentum = (XP_PER_WAVE_SURVIVED + (ascent.lastWaveBoss ? XP_PER_WAVE_SURVIVED : 0)) * heat;
  addAscentXp(state, momentum);
  payAmbitionSpoils(state, heat);

  const capital = state.lands.find((land) => land.id === ascent.capitalLandId);
  const heldCapital = !capital || capital.ownerId === PLAYER_KINGDOM_ID;

  // The cabinet's milestone faucet: every 10th wave held pays a rubbing (thác bản). Held, not
  // merely survived — a decade of waves that ends with the seat in enemy hands is not a deed.
  if (heldCapital && ascent.wavesSurvived % 10 === 0) {
    addRubbings(1);
    noteRubbing(state);
    pushToast(state, t('ascent.cabinet.rubbingEarned', { wave: ascent.wavesSurvived }), 'reward');
  }
  // The Coronation's first lock, opened on the same condition and by the same rule — *held*, not
  // merely survived. Ten waves is roughly where a player has learned what the clock is, which is
  // exactly what the greyed war-harness row in the creator promised them it would take.
  if (heldCapital && ascent.wavesSurvived >= 10 && grantDeed('wave-ten')) {
    noteRubbing(state);
    pushToast(state, t('coronation.unlock.warHarness'), 'reward');
  }
  // Beta: whether this settle won the reign's goal. Decided here, on both settle paths, so it can
  // never disagree with the banner below. Inert on a stable reign (no goal).
  evaluateGoal(state, snapshot);

  // Reported, not modal.
  //
  // A Great Invasion surviving deserves acknowledgement, but a full-screen pause whose only
  // control was "Continue" accounted for nearly every remaining prompt in a run and had exactly
  // one legal answer, four to six times each time. The header strip marks the moment in the log;
  // the banner below marks it on the screen, and neither stops the game to collect a tap.
  pushToast(
    state,
    ascent.lastWaveBoss
      ? (heldCapital ? t('ascent.wave.bossTitle', { wave: ascent.wave }) : t('ascent.wave.bossTitleLost'))
      : (heldCapital ? t('ascent.wave.title', { wave: ascent.wave }) : t('ascent.wave.titleLost', { wave: ascent.wave })),
    heldCapital ? 'reward' : 'threat',
  );

  // A wave that never put a host on the map has nothing to report beyond the count — no landing
  // was announced, so announcing its end would be a banner for an invasion the player never saw.
  if (snapshot.hosts <= 0) return;

  const landsHeld = ownedLandCount(state);
  const landsLost = Math.max(0, snapshot.lands - landsHeld);
  const hostsBroken = Math.max(0, (state.invasionsRepelled ?? 0) - snapshot.repelledAt);
  const outcome: AscentWaveOutcome = !heldCapital
    ? 'overrun'
    : landsLost > 0 ? 'held' : 'triumph';

  raiseWaveCue(state, {
    phase: 'end',
    wave: snapshot.wave,
    boss: snapshot.boss,
    hosts: snapshot.hosts,
    power: snapshot.power,
    outcome,
    hostsBroken,
    landsLost,
    landsHeld,
    momentum: Math.round(momentum),
    survived: ascent.wavesSurvived,
    seasons: Math.max(1, state.turn - snapshot.turn),
    kingdomName: snapshot.kingdomName,
  });
}

/**
 * Fires a wave: raises the counter, sets the threat, and asks the player how to meet it.
 * The hosts are not spawned here — they launch when the response resolves, so a preparation
 * actually lands before the enemy does.
 */
function startWave(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  // Reaching a new wave means the previous one is behind you. Normally the result was already
  // paid and announced the tick its last host left the map; this is the fallback for the waves
  // that never clear — an overlapping wave, or one whose hosts were still marching when the next
  // clock ran out. `resolveWaveResult` is a no-op when the wave has already been settled, so the
  // count stays honest either way and is never paid twice.
  resolveWaveResult(state);

  // Recorded before the wave is sized, so this wave is measured against the realm as it
  // stood when the *previous* wave landed — see `laggedDefencePower`.
  sampleDefencePower(state);

  ascent.wave += 1;
  ascent.lastWaveBoss = isBossWave(ascent.wave);

  // The aggressor is chosen *before* the clock, because the clock now reads their standing.
  //
  // Which court marched is the feedback loop the mode was missing. Warm the crown that just came
  // at you and the next war is further off and smaller; ignore them and it is sooner and heavier.
  // Reading an average of all four instead would make every gift equally useful and none of them
  // a decision — the whole point is that the player has to read the board.
  // Beta (`aggressorForecast`): the court was drawn a few seasons early so THREAT could quote its own
  // dial (measured: the averaged dial was the largest part of the landing jump). Spent here.
  const aggressor = forecastAggressor(state) ?? pickAggressor(state);
  // Only touched when set, so a stable reign's state never grows the key.
  if (ascent.nextAggressorId !== undefined) delete ascent.nextAggressorId;

  // **The floor takes the dial away entirely.**
  //
  // Every multiplier in `RELATIONS_WAVE_DIAL` delays and shrinks a war; none of them cancels one,
  // and this is the line that enforces it. Once the courts have been quiet longer than
  // `peaceFloorTicks`, the wave that follows is quoted at full strength on the ordinary clock, no
  // matter how beloved the realm is — and it is announced, so a diplomacy run reads it as a
  // deadline rather than as the game changing its mind.
  //
  // Without this the promise was only half-kept: `EnemyCommandDirector` sent a *raid* when the
  // floor tripped, and a raid is contact, not a war. A realm that had bought 80+ standing with
  // every court sat on a x1.6 clock and a x0.75 budget for the rest of the run, which is exactly
  // the no-lose strategy the floor exists to rule out.
  const forced = peaceFloorBreached(state);
  const dial = forced
    ? { clock: 1, budget: 1, hosts: 0 }
    : relationsDial(state, aggressor?.id);
  if (forced) {
    ascent.quietWarned = false;
    pushToast(state, t('ascent.wave.floorBroken'), 'threat');
  }

  // Mountain Pass buys seasons: waves from beyond the passes arrive late, and the extra Court
  // phase it grants is the whole card.
  ascent.ticksToWave = Math.round((WAVE_INTERVAL_TICKS + waveDelayTicks(state)) * dial.clock);
  ascent.bossTelegraphed = false;
  // Re-rolled once a wave, so the guarantee is never the same number twice and never decays into
  // its own minimum by being re-rolled every tick.
  ascent.peaceFloor = peaceFloorTicks(state);
  ascent.waveDialBudget = dial.budget;
  ascent.waveDialHosts = dial.hosts;

  // The bill for the season the player just spent. Locked here and read by everything that
  // sizes or quotes this wave, then shed — so the wave arrives at exactly the price shown
  // while they were deciding, and the *next* one starts from a realm that has consolidated.
  recordAmbitionPeak(state);
  ascent.waveHeat = ambitionHeat(state);
  decayAmbition(state);

  // The wave's ledger is opened here, the moment its number exists, and `launchWave` fills in what
  // actually lands. Opening it here rather than at the landing is what lets one field answer "is a
  // result owed for this wave" for every path through the director — including the wave whose
  // spawn is skipped for want of budget, which is counted without ever being announced.
  ascent.pendingWave = {
    wave: ascent.wave,
    boss: ascent.lastWaveBoss,
    lands: ownedLandCount(state),
    hosts: 0,
    power: 0,
    repelledAt: state.invasionsRepelled ?? 0,
    turn: state.turn,
  };

  if (!aggressor) return;
  ascent.waveAggressorId = aggressor.id;

  // Before the hosts exist there is nothing to measure, so the modal quotes the projection.
  ascent.threat = projectedWaveThreat(state, ascent.wave, ascent.waveHeat);
  const options = buildResponseOptions(state, ascent.threat);

  // Only interrupt when the answer could change the outcome.
  //
  // Asking about every wave made this a quarter of every decision in a run, and the options on
  // it differed by an average of five percentage points — "you will win with 82%, spend nine
  // thousand gold to win with 84%?" is not a decision, it is a toll booth. Waves the realm is
  // plainly going to hold now resolve themselves and report through the header strip, which
  // both returns the map to the screen and reserves the modal for the waves that are in doubt.
  // Great Invasions and endured coalitions always ask, whatever the odds.
  const best = Math.max(...options.filter((o) => o.affordable && o.winChance).map((o) => o.winChance ?? 0), 0);
  const mustAsk = ascent.lastWaveBoss || ascent.coalitionPending;
  if (!mustAsk && best >= RESPONSE_ASK_BELOW_WIN) {
    addAscentXp(state, ENDURE_MOMENTUM);
    // Beta: posted as the wave launches, before any contact — a forecast, not a result.
    pushToast(state, rulesOf(state).truthfulNumbers
      ? t('beta.wave.metAlone', { kingdom: aggressor.name, chance: best })
      : t('ascent.wave.metAlone', { kingdom: aggressor.name, chance: best }), 'info');
    launchWave(state, aggressor.id, aggressor.king?.name ?? aggressor.name);
    return;
  }

  // Beta: when they reach the realm, walked from where the spawner will muster them — not a flat 3.
  const shapeNow = waveShapeFor(ascent.wave, ascent.lastWaveBoss);
  const arrival = rulesOf(state).truthfulNumbers
    ? plannedWaveArrival(state, [
      { kingdomId: aggressor.id, hosts: waveHostCount(shapeNow, Boolean(ascent.coalitionPending), ascent.waveDialHosts ?? 0) },
      ...(shapeNow.kingdoms > 1 && secondCrown(state, aggressor.id) ? [{ kingdomId: secondCrown(state, aggressor.id)!.id, hosts: 1 }] : []),
    ], shapeNow, aimLandFor(state, shapeNow.aim))
    : undefined;
  enqueueAscentPrompt(state, {
    kind: 'empire-response',
    wave: ascent.wave,
    threat: ascent.threat,
    kingdomId: aggressor.id,
    kingdomName: aggressor.name,
    ticksToArrival: arrival?.ticks ?? 3,
    ...(arrival ? { arrivalLandName: state.lands.find((land) => land.id === arrival.landId)?.name } : {}),
    options,
  });
}

/** Hosts a crown sends for a wave of this shape — shared by `launchWave` and the arrival forecast. */
function waveHostCount(shape: WaveShape, coalition: boolean, dialHosts: number): number {
  return Math.max(1, Math.min(MAX_HOSTS_PER_KINGDOM, shape.hosts + (coalition ? 2 : 0) + dialHosts));
}

/**
 * The province a shape is marching at, or nothing when it is marching at whatever it finds.
 *
 * `host` returns the ground the player's largest field army is standing on — the aim is the army,
 * and `EnemyCommandDirector` re-reads it every tick as that army moves.
 */
const headcount = (army: Army): number =>
  army.units.spearmen + army.units.archers + army.units.heavyInfantry;

function aimLandFor(state: GameState, aim: WaveShape['aim']): string | undefined {
  if (aim === 'capital') return state.ascent?.capitalLandId;
  if (aim !== 'host') return undefined;
  const host = state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy)
    .sort((a, b) => headcount(b) - headcount(a))[0];
  return host?.landId ?? state.ascent?.capitalLandId;
}

/**
 * A second crown for a coalition shape: the angriest court that is not the one already marching.
 *
 * Two hosts from one kingdom read as a bigger wave; two hosts from two kingdoms read as the world
 * agreeing about you, which is the whole point of the shape.
 */
function secondCrown(state: GameState, firstId: string): Kingdom | undefined {
  return state.kingdoms
    .filter((kingdom) => kingdom.id !== firstId
      && kingdom.id !== PLAYER_KINGDOM_ID
      && !kingdom.isDefeated
      && !isVassal(kingdom))
    .sort((a, b) => (a.relations ?? 50) - (b.relations ?? 50))[0];
}

/** Spawns the hosts for a wave through the existing invasion pipeline. */
function launchWave(state: GameState, kingdomId: string, warlordName?: string): void {
  const ascent = state.ascent;
  if (!ascent) return;

  const boss = ascent.lastWaveBoss;
  const shape = waveShapeFor(ascent.wave, boss);
  // Stored so the banner, the war board and the harnesses all name the same thing.
  ascent.waveShape = shape.id;
  // Counted before the spawn so hosts added by *this* wave can be told from whatever a raid or
  // an overlapping wave already had walking in.
  const hostsBefore = state.invasions?.length ?? 0;
  // The map is already carrying this wave's worth of pressure — adding to it would stack
  // hosts the realm has no way to answer. The wave counter still advanced, so the curve keeps
  // rising; what is skipped is the spawn, not the escalation.
  // **A wave the map has no room for reinforces the war instead of not happening.**
  //
  // The old behaviour returned here: the counter advanced, the HUD went on reading INVASION 4 ·
  // LIVE, and nothing arrived. Measured across six seeds, invasion 4 landed in **zero** of them —
  // because a host is nearly always still standing (mean 1.0 to 3.5 per wave turnover) and one
  // standing host is enough to spend the budget. From the throne that is not mercy, it is the
  // mode quietly skipping its own event while the number climbs.
  //
  // The men are sent to the hosts already in the field instead: half the wave's budget, because
  // the other half is the part that would have been spent walking here. The invasion is late and
  // it is the same army as last season — which is exactly what a war looks like when the last
  // wave was never finished off.
  if (waveBudgetSpent(state, ascent.wave, boss)) {
    const standing = (state.invasions ?? [])
      .map((record) => state.armies.find((army) => army.id === record.armyId))
      .filter((army): army is Army => Boolean(army));
    const reinforcement = Math.round(
      waveSoldierBudget(state, ascent.wave, boss) * shape.sizeMult * REINFORCE_SHARE * (ascent.waveDialBudget ?? 1),
    );
    if (standing.length > 0 && reinforcement > 0) {
      const each = Math.max(40, Math.round(reinforcement / standing.length));
      for (const army of standing) {
        army.units.spearmen += Math.floor(each * 0.6);
        army.units.archers += Math.floor(each * 0.28);
        army.units.heavyInfantry += Math.floor(each * 0.12);
        // Men arriving with orders and rations lift a host that has been in the field a while.
        army.morale = Math.min(100, army.morale + 6);
        army.supply = Math.min(100, army.supply + 10);
      }
      const snapshot = ascent.pendingWave;
      if (snapshot && snapshot.wave === ascent.wave) {
        snapshot.hosts = standing.length;
        snapshot.power = liveInvaderPower(state);
        snapshot.kingdomName = state.kingdoms.find((k) => k.id === standing[0]?.kingdomId)?.name;
      }
      ascent.threat = liveInvaderPower(state);
      pushToast(state, t('ascent.wave.reinforced', { n: standing.length }), 'threat');
      /**
       * A reinforcement is still a landing, and it has to announce itself as one.
       *
       * This branch writes `snapshot.hosts`, which is the flag that says a result is owed — so
       * `resolveWaveResult` raises an *end* cue for this wave when the map clears. Without a start
       * cue beside it the banner pairing is broken: an invasion is reported as concluded that was
       * never reported as arriving.
       *
       * Latent until the siege clock shipped. It fires when the previous wave's hosts are still on
       * the map, which used to be rare because an invader resolved its assault the tick it arrived;
       * now a host spends `ceil(defense / SIEGE_DEFENSE_PER_TICK)` seasons at the walls and outlives
       * its own wave routinely. Measured on the seeded run behind `verify-invasion-lifecycle`:
       * four of eighteen waves — 9, 13, 14 and 17, each following a Great Invasion — closed a
       * landing that had never been announced.
       */
      raiseWaveCue(state, {
        phase: 'start',
        wave: ascent.wave,
        boss,
        kingdomName: snapshot?.kingdomName,
        hosts: standing.length,
        power: ascent.threat,
      });
    }
    ascent.waveInFlight = (state.invasions?.length ?? 0) > 0;
    ascent.threat = liveInvaderPower(state);
    return;
  }

  // A coalition the player chose to endure lands as the next wave: more hosts, conquest
  // intent, and a heavier budget. Enduring has to be visibly worse than buying it off.
  const coalition = ascent.coalitionPending;
  ascent.coalitionPending = false;
  // Host count answers the board. A hateful court sends one more; a sworn friend one fewer, and
  // never fewer than one — a wave that arrives with nothing is a wave that did not happen, and
  // the floor below exists precisely so that cannot be bought.
  // Locked at `startWave`, not re-read here. The response card can stand for a whole season and
  // relations move while it does — a wave must land at the size it was quoted at, or the card is
  // lying about what it is asking the player to pay for.

  // Stored so the banner, the war board and the harnesses can all name the same thing.
  ascent.waveShape = shape.id;
  const dialHosts = ascent.waveDialHosts ?? 0;
  const dialBudget = ascent.waveDialBudget ?? 1;
  const hosts = waveHostCount(shape, coalition, dialHosts);
  // Difficulty is applied once, centrally, inside `launchOffMapInvasion` — it used to be
  // compensated for here because the normalisation there divided it back out, which left every
  // caller *without* a local fix (the contact floor, story strikes, raids) silently running at
  // normal difficulty whatever the player had chosen. Fixed at the source, removed here.
  launchOffMapInvasion(state, kingdomId, {
    forceCoalition: hosts,
    // An explicit budget, sized from the realm's lagged defensive power. Without it the
    // spawn is clamped against `getPlayerMilitary` — a headcount blind to every multiplier
    // the Power Draft stacks — and the wave arrives a fraction of the size it should be.
    totalSoldiers: Math.round(
      waveSoldierBudget(state, ascent.wave, boss)
      * shape.sizeMult
      // Two crowns split one wave's budget rather than each bringing their own — a coalition is
      // the same war arriving from two directions, not twice the war.
      / (shape.kingdoms > 1 ? shape.kingdoms : 1)
      * (coalition ? COALITION_WAVE_MULT : 1) * dialBudget,
    ),
    // A hunt is a march on an army, which is a campaign, not a raid — a raider pillages the
    // nearest village and turns for the edge, which is not what this shape was sent to do.
    forceConquest: boss || coalition || shape.aim === 'capital' || shape.aim === 'host',
    staging: shape.staging,
    // A shape that names what it is marching at stamps it on every host; the others leave the
    // board to `assignPlans`, which reads value, softness and distance exactly as before.
    plan: shape.aim === 'host' ? 'hunter' : shape.aim === 'capital' ? 'spearhead' : undefined,
    aimLandId: aimLandFor(state, shape.aim),
    // A named warlord is what flags the record as `great`, which drives the harder siege
    // maths in resolveInvaderBattle and the Great Invasion presentation.
    warlordName: boss ? warlordName : undefined,
  });
  // Two crowns, one season. The second comes from its own frontier with its own half of the
  // budget, so the wave arrives from two directions — which is the difference between a
  // coalition and a wave that merely counted higher.
  const ally = shape.kingdoms > 1 ? secondCrown(state, kingdomId) : undefined;
  if (ally) {
    launchOffMapInvasion(state, ally.id, {
      forceCoalition: 1,
      totalSoldiers: Math.round(
        waveSoldierBudget(state, ascent.wave, boss) * shape.sizeMult / shape.kingdoms * dialBudget,
      ),
      forceConquest: true,
      staging: shape.staging,
      aimLandId: aimLandFor(state, shape.aim),
    });
  }
  ascent.waveInFlight = true;
  // Now that the hosts exist, replace the projection with what is actually marching.
  ascent.threat = liveInvaderPower(state);

  // The landing. Snapshotted here rather than when the counter advanced because the response
  // card can sit open for a season, and a province taken while deciding belongs to the season
  // before the invasion, not to it.
  const landed = Math.max(1, (state.invasions?.length ?? 0) - hostsBefore);
  const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
  // Re-measured at the landing, not left at what `startWave` opened the ledger with: the response
  // card can stand for a season, and a province taken while the player was deciding belongs to the
  // season before this invasion rather than to it.
  const snapshot = ascent.pendingWave;
  if (snapshot && snapshot.wave === ascent.wave) {
    snapshot.kingdomName = kingdom?.name;
    snapshot.lands = ownedLandCount(state);
    snapshot.hosts = landed;
    snapshot.power = ascent.threat;
    snapshot.repelledAt = state.invasionsRepelled ?? 0;
    snapshot.turn = state.turn;
  }
  raiseWaveCue(state, {
    phase: 'start',
    wave: ascent.wave,
    boss,
    kingdomName: kingdom?.name,
    hosts: landed,
    power: ascent.threat,
  });
}

/**
 * Border raids: the run's background pressure between waves.
 *
 * One host, raid intent, sent at the frontier — `tickInvasions` already walks it in, calls
 * `pillage` (which destroys a building) and withdraws it. The permanent income loss is what
 * makes an undefended frontier cost something, and it gives the map activity in the long
 * quiet stretches that made the mode feel abandoned by its enemies.
 */
export function tickRaids(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  ascent.raidCooldown = Math.max(0, (ascent.raidCooldown ?? 0) - 1);
  if (ascent.raidCooldown > 0) return;

  // Not while a wave is on the map, and not on its doorstep: a raid still walking in when the
  // wave lands stacks two hosts on one province, which reads as a difficulty spike rather than
  // as background pressure — and was what made the first tuning pass unsurvivable.
  if ((state.invasions?.length ?? 0) > 0) return;
  if (ascent.ticksToWave <= RAID_WAVE_CLEARANCE) return;
  if (ownedLandCount(state) < RAID_MIN_LANDS) return;
  // Raids begin only once the opening grace is over: the setup phase gets its three single-column
  // waves and nothing between them. A realm that keeps its provinces crosses `RAID_MIN_LANDS`
  // inside the first cycle, and the raid clock then put a second host on the map between waves
  // one and two — measured, the first sixty seasons carried five to eleven hostile hosts.
  if (ascent.wave <= EARLY_WAVE_GRACE) return;

  const raider = pickAggressor(state);
  if (!raider) return;

  ascent.raidCooldown = RAID_INTERVAL_TICKS;
  // Sized off field power directly, with its own small floor. Reusing the wave budget (and
  // its `MIN_WAVE_SOLDIERS` floor) made an early raid as large as the wave it was supposed to
  // be a prelude to, and two of them stacked on the capital ended runs before wave three.
  launchOffMapInvasion(state, raider.id, {
    forceCoalition: 1,
    forceRaid: true,
    totalSoldiers: raidSoldierBudget(state),
  });
  pushToast(state, t('ascent.raid.incoming', { kingdom: raider.name }), 'threat');
}

/**
 * Applies the player's chosen preparation, then launches the wave. Each branch spends real
 * resources through the normal APIs, so the projections shown on the modal are honest.
 */
export function resolveEmpireResponse(state: GameState, prompt: AscentPrompt, optionId: string): void {
  const ascent = state.ascent;
  if (!ascent || prompt.kind !== 'empire-response') return;

  const option = prompt.options.find((candidate) => candidate.id === optionId);
  /**
   * **The wave lands whatever the answer was.** Only the preparation is conditional.
   *
   * This used to return here when the chosen option could not be paid for — and returning skips
   * `launchWave` at the bottom, so the invasion the card had just announced simply never arrived.
   * The counter had already advanced, so the HUD went on reading INVASION 4 · LIVE against a map
   * with nothing on it. Measured over six seeds: invasion 4 landed in **zero** of them, because
   * the response card is only raised when the odds are in doubt, and a realm whose odds are in
   * doubt is usually a realm that cannot afford the first row on the sheet.
   *
   * A player cannot tap a greyed row, so this was never reachable from the screen — it was
   * reachable from every other door into the resolver, which is most of them.
   */
  if (option?.affordable) {

  switch (option.id) {
    case 'send-host': {
      if (option.heroId) {
        applyResourceDelta(state, { supplies: -SEND_HOST_SUPPLIES });
        // `queueRecruitment` only accepts an unposted hero, so the chosen commander vacates
        // their posting here — answering the wave is one decision, not two screens.
        releaseHero(state, option.heroId);
        const soldiers = emergencyLevySize(state);
        if (queueRecruitment(
          state,
          option.heroId,
          soldiers,
          Math.ceil(soldiers / 100) * SUPPLY_TICKS_HELD,
          Math.ceil(soldiers / 150) * SUPPLY_TICKS_HELD,
        )) chargeAmbition(state, 'host');
      }
      break;
    }
    case 'hire-mercenaries': {
      const cost = option.cost?.gold ?? mercenaryCost(state, prompt.wave);
      applyResourceDelta(state, { gold: -cost });
      hireMercenaries(state, mercenarySize(state));
      ascent.warPurchases = (ascent.warPurchases ?? 0) + 1;
      // Bought soldiers count like raised ones. Charging only the levy would make coin the
      // one way to grow that nobody notices, which is a loophole rather than a strategy.
      chargeAmbition(state, 'host');
      break;
    }
    case 'fortify': {
      applyResourceDelta(state, { gold: -(option.cost?.gold ?? fortifyCost(state, prompt.wave)) });
      const capital = playerCapital(state);
      if (capital) capital.defense += fortifyDefenceGain(state);
      ascent.warPurchases = (ascent.warPurchases ?? 0) + 1;
      break;
    }
    case 'buy-off': {
      applyResourceDelta(state, { gold: -(option.cost?.gold ?? buyOffCost(state, prompt.wave)) });
      // Bought off entirely: no hosts this wave, and the next one is pushed back.
      ascent.ticksToWave += BUYOFF_DELAY_TICKS;
      pushToast(state, t('empire.invade.withdraw', { kingdom: prompt.kingdomName }), 'info');
      return;
    }
    case 'endure': {
      addAscentXp(state, ENDURE_MOMENTUM);
      break;
    }
    }
  }

  const aggressor = state.kingdoms.find((kingdom) => kingdom.id === prompt.kingdomId);
  launchWave(state, prompt.kingdomId, aggressor?.king?.name ?? prompt.kingdomName);
}

/** Label parts for the send-host option, so the modal can name the commander inline. */
export function responseCommanderName(state: GameState, heroId: string | undefined): string | undefined {
  const hero = state.heroes.find((candidate) => candidate.id === heroId);
  return hero ? heroName(hero) : undefined;
}

/**
 * Per-tick wave clock: telegraphs a Great Invasion two seasons out, fires the next wave when
 * the countdown elapses, and reports the result once the last host of a wave leaves the map.
 */
/**
 * Beta (`threatProjection`): re-read THREAT once the season's fights are done.
 *
 * `tickWaveDirector` sets the readout before the hosts march and fight, so a season whose last host
 * died left the band quoting that dead host's strength until the next season — measured as the
 * largest single landing "jump" once the forecast itself was right (822 quoted, 6,118 landed). Only
 * that case is re-read: hosts still standing keep the figure they were given this season, and a
 * declared wave waiting on its response card keeps the card's own quote.
 */
export function refreshThreatReadout(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent || !rulesOf(state).threatProjection || !rulesOf(state).threatRefresh) return;
  if ((ascent.invasionsLastTick ?? 0) === 0 || (state.invasions?.length ?? 0) > 0) return;
  const awaitingAnswer = state.pendingAscentPrompt?.kind === 'empire-response'
    || ascent.promptQueue.some((prompt) => prompt.kind === 'empire-response');
  if (awaitingAnswer) return;
  ascent.threat = projectedWaveThreat(state, ascent.wave + 1);
}

export function tickWaveDirector(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  const liveInvasions = state.invasions?.length ?? 0;
  const wasInFlight = (ascent.invasionsLastTick ?? 0) > 0;
  ascent.waveInFlight = liveInvasions > 0;
  ascent.invasionsLastTick = liveInvasions;

  // The map just cleared. This — not the next wave's clock — is the moment the invasion ended,
  // and it is where the result is paid and the banner raised. Guarded on the wave having actually
  // put hosts on the map, so a border raid withdrawing cannot cash a wave whose own hosts have not
  // spawned yet: raids and waves share `state.invasions`, and a raid clears like anything else.
  if (wasInFlight && liveInvasions === 0 && (ascent.pendingWave?.hosts ?? 0) > 0) {
    resolveWaveResult(state);
  }

  // Beta: the next wave's court is drawn `aggressorForecast` seasons before it marches (and again if
  // it falls or swears fealty meanwhile) — here, in the tick, so the forecast below never has to
  // spend randomness itself. `ticksToWave` counts down just below, so this is the lead it will have.
  const lead = rulesOf(state).threatProjection ? rulesOf(state).aggressorForecast : 0;
  if (lead > 0 && ascent.ticksToWave - 1 <= lead && !forecastAggressor(state)) {
    ascent.nextAggressorId = pickAggressor(state)?.id;
  }

  // THREAT tracks the hosts on the map while a wave is live; between waves it shows what
  // the next one is projected to bring, so the readout is never blank or stale.
  ascent.threat = liveInvasions > 0 ? liveInvaderPower(state) : projectedWaveThreat(state, ascent.wave + 1);

  ascent.ticksToWave -= 1;

  const nextWaveIsBoss = isBossWave(ascent.wave + 1);
  if (nextWaveIsBoss && !ascent.bossTelegraphed && ascent.ticksToWave <= BOSS_TELEGRAPH_TICKS) {
    ascent.bossTelegraphed = true;
    pushToast(state, t('ascent.wave.telegraph', { ticks: Math.max(0, ascent.ticksToWave) }), 'threat');
  }

  // The peace floor says so before it fires.
  //
  // A guarantee the player only learns about by being hit is a punishment; one they are warned of
  // is a deadline. This is the moment a diplomacy run is told that the quiet it bought is running
  // out and it is time to spend the seasons it saved.
  if (!ascent.quietWarned && peaceFloorBreached(state) && liveInvasions === 0) {
    ascent.quietWarned = true;
    pushToast(state, t('ascent.wave.quietTooLong'), 'threat');
  }
  if (liveInvasions > 0) ascent.quietWarned = false;

  if (ascent.ticksToWave <= 0) {
    startWave(state);
  }
}
