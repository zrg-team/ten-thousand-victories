/**
 * The CLASSIC battle rules, retired 2026-08 — kept compiled so they cannot rot, wired to nothing.
 *
 * This is the availability-by-blocks mechanic and the two commitment clocks that shipped with
 * `docs/phase-1/14-five-shapes-two-dials.md` and were replaced by the wind mechanic of
 * `docs/phase-1/19-five-shapes-one-clock.md`. The full record — the rule, its tuning, the measured
 * tables and why it went — is `docs/phase-1/18-formation-availability-by-blocks.md`; this module is the
 * code half of that record, so re-instating it is an import away rather than an archaeology dig.
 *
 * Why it went, in one line each:
 *  - availability: only one chip ever actually died (Thế Tán, at 2–11% losses, invisibly and
 *    permanently) — the "open with five shapes, finish with two" arc never happened;
 *  - the stance lock: a second restriction on the dial that exists to cut losses, and once the
 *    stance carried wind recovery it would have frozen a player out of their own dock;
 *  - the re-form table: army quality on a clock nobody could see, where a flat one-beat walk can
 *    be counted by anyone.
 *
 * Deliberately imports only from `formations.ts` — never from `systems/` (the `AscentBattle`
 * fields these rules read no longer exist), and nothing in `src/` may import from here except a
 * harness proving the archive still answers.
 */
import type { ArmyComposition } from '../../state/types';
import {
  blockShares, type BattleFormation, type FormationKey,
} from './formations';

/** The block each shape was built around, and therefore the block whose loss took it away. */
export const CLASSIC_BLOCK_OF: Record<BattleFormation, FormationKey> = {
  chong: 'line',
  xung: 'horse',
  tan: 'screen',
  quy: 'line',
  no: 'bows',
};

/**
 * Whether a host could still form each shape — the retired rule, verbatim.
 *
 * - `gone` — the block it stood on was never in this doctrine, or had been spent. The chip faded
 *   and refused the tap.
 * - `blunt` — the shape could be taken but only half the counter was worth anything
 *   (`BATTLE_FORMATION_TILT_BLUNT`, which the wind mechanic re-spent as the soft-counter half).
 * - `ready` — as intended.
 *
 * Thế Chông and Thế Quy were hardcoded `ready` so the dock could never go fully dark. Measured
 * against the doctrine tables, the narrowing this was meant to produce came down to a cliff on
 * one chip — see docs/phase-1/18-formation-availability-by-blocks.md for the sweep.
 */
export function classicFormationAvailability(
  composition: ArmyComposition, men: number, mustered?: number,
): Record<BattleFormation, 'ready' | 'blunt' | 'gone'> {
  const shares = blockShares(composition, men, mustered);
  const spent = (key: FormationKey): boolean => shares[key].full <= 0 || shares[key].standing <= 0;
  return {
    chong: 'ready',
    quy: 'ready',
    xung: spent('horse') ? 'gone' : 'ready',
    tan: spent('screen') ? 'gone' : 'ready',
    no: spent('bows') ? 'blunt' : 'ready',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The retired clocks, as data. The logic that read them lived in BattleSystem
// (`advanceStance`, `stanceIsLocked`, `reformBeatsFor`) against fields that no
// longer exist, so it is archived here in parameter-taking form.
// ─────────────────────────────────────────────────────────────────────────────

/** Beats a stance held you before it could be changed again. `defend`/`withdraw` ignored it. */
export const CLASSIC_STANCE_LOCK_BEATS = 4;

/** What a host dealt and took while walking between shapes. */
export const CLASSIC_REFORM_DEALT = 0.55;
export const CLASSIC_REFORM_TAKEN = 1.45;

/** How many beats a change of shape took, by what the host was and who led it. */
export const CLASSIC_REFORM_BEATS = {
  /** tier 0 levy, tier 1 trained, tier 2 royal guard — before the general is counted. */
  byTier: [2, 2, 1],
  /** A commander this good shaved a beat off, to a floor of one. */
  martialShavesAt: 45,
  /** A host below the rout line could not re-form cleanly whatever it was. */
  broken: 3,
  /** ...unless it was very well led. */
  brokenWellLed: 2,
  brokenWellLedMartial: 80,
  min: 1,
  max: 3,
};

/** The lock rule: aggression was a commitment, the brake never was. */
export function classicStanceIsLocked(
  lockBeats: number, stance: 'withdraw' | 'defend' | 'balanced' | 'press',
): boolean {
  if (stance === 'defend' || stance === 'withdraw') return false;
  return lockBeats > 0;
}

/** The walk-length rule, parameterized on what `reformBeatsFor` used to read off the battle. */
export function classicReformBeats(
  eliteTier: number, martial: number, brokenMorale: boolean,
): number {
  if (brokenMorale) {
    return martial >= CLASSIC_REFORM_BEATS.brokenWellLedMartial
      ? CLASSIC_REFORM_BEATS.brokenWellLed : CLASSIC_REFORM_BEATS.broken;
  }
  const tier = Math.max(0, Math.min(2, eliteTier));
  let beats = CLASSIC_REFORM_BEATS.byTier[tier] ?? 2;
  if (martial >= CLASSIC_REFORM_BEATS.martialShavesAt) beats -= 1;
  return Math.max(CLASSIC_REFORM_BEATS.min, Math.min(CLASSIC_REFORM_BEATS.max, beats));
}
