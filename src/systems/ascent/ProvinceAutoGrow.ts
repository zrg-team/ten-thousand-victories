/**
 * Tự phát triển — a province that builds its own districts.
 *
 * Reported 2026-09-15: "on the Build or Focus screen I should be able to set a province to grow by
 * itself. It should be less effective and slower to decide what to build if no hero is posted there;
 * assigning a hero makes it better. On mobile it is automatic; on desktop I can choose."
 *
 * What there was before (measured, v2, 4 seeds x 80 seasons, first-option driver):
 *  - a phone reign ran one realm-wide autopilot builder: 40-65 orders a run, one a season at most,
 *    anywhere in the realm — and blind to governors: with 0-1 posted, every province grew alike;
 *  - a desktop reign starts hands-on, which switches that whole autopilot off: no orders at all,
 *    the capital sitting on its founding districts while 1-3k gold piled up unspent.
 *
 * Under `provinceAutoGrow` the builder belongs to each province instead:
 *  - **the switch** — `land.autoGrow`, absent = the reign's default: on where the autopilot runs,
 *    off on a hands-on reign. Either can be flipped per province from the province sheet or the
 *    focus page.
 *  - **the pace** — a governed province files its next order the season the last one finishes; an
 *    ungoverned one waits `AUTOGROW_GAP_UNGOVERNED` seasons and its orders take
 *    `AUTOGROW_TICKS_UNGOVERNED` as long.
 *  - **the judgement** — a governor weighs what the realm is short of, the doctrine, the province's
 *    own focus and a wave bearing down, and takes an upgrade when it is the better buy; nobody at
 *    the seat values every resource the same flat way, never reads the threat, and builds something
 *    new before it improves anything. (`AutopilotSystem.autoGrowProvinces` does the choosing.)
 *
 * A leaf: config, the ruleset registry and state.
 */
import {
  AUTOGROW_GAP_GOVERNED,
  AUTOGROW_GAP_UNGOVERNED,
  AUTOGROW_TICKS_UNGOVERNED,
} from '../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { rulesOf } from '../../game/ascentRuleset';
import type { GameState, Hero, Land } from '../../state/types';

/** True when this reign's provinces carry their own grow switch. */
export function autoGrowActive(state: GameState): boolean {
  return state.gameMode === 'ascent' && !!state.ascent && !state.ascent.arena && rulesOf(state).provinceAutoGrow;
}

/** The reign's default for a province that was never switched: on unless the reign is hands-on. */
export function autoGrowDefault(state: GameState): boolean {
  return !state.ascent?.hardcore;
}

/** Whether this province grows by itself. False for ground that is not ours, and without the rule. */
export function landAutoGrows(state: GameState, land: Land): boolean {
  if (!autoGrowActive(state) || land.ownerId !== PLAYER_KINGDOM_ID) return false;
  return land.autoGrow ?? autoGrowDefault(state);
}

/** Flips a province's switch. Returns the new value. */
export function setLandAutoGrow(state: GameState, landId: string, on: boolean): boolean {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land || !autoGrowActive(state)) return false;
  land.autoGrow = on;
  // Switching on means "start now": a province is not made to wait out a gap it never used.
  if (on) land.autoGrowReadyTurn = Math.min(land.autoGrowReadyTurn ?? state.turn, state.turn);
  return on;
}

/** The hero holding the seat, if any. */
export function landGovernor(state: GameState, land: Land): Hero | undefined {
  return state.heroes.find((hero) => hero.assignedTo === land.id);
}

export interface AutoGrowPace {
  governed: boolean;
  /** Seasons the province rests after its own order finishes. */
  gap: number;
  /** How much longer its own orders take. */
  ticksMult: number;
}

export function autoGrowPace(state: GameState, land: Land): AutoGrowPace {
  const governed = Boolean(landGovernor(state, land));
  return governed
    ? { governed, gap: AUTOGROW_GAP_GOVERNED, ticksMult: 1 }
    : { governed, gap: AUTOGROW_GAP_UNGOVERNED, ticksMult: AUTOGROW_TICKS_UNGOVERNED };
}

/** True when the province has rested long enough to file its next order. */
export function autoGrowReady(state: GameState, land: Land): boolean {
  return state.turn >= (land.autoGrowReadyTurn ?? 0);
}

/**
 * Stamps an order the province has just filed: marks it as its own, stretches it by the pace, and
 * sets when the province may file again (after it finishes, plus the rest).
 */
export function stampAutoOrder(state: GameState, land: Land): void {
  const order = state.buildOrders.find((candidate) => candidate.landId === land.id);
  if (!order) return;
  const pace = autoGrowPace(state, land);
  order.auto = true;
  if (pace.ticksMult !== 1) order.required = Math.ceil(order.required * pace.ticksMult);
  land.autoGrowReadyTurn = state.turn + order.required + pace.gap;
}
