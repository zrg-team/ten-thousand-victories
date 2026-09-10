import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { cabinetRuleMult } from '../../state/cabinet';
import { provinceIsFalling } from '../LandSystem';
import type { Army, GameState, Land } from '../../state/types';

/**
 * The Power Draft's rule cards.
 *
 * Every other card in the pool is a percentage applied through `applyCourtEffect` — +14% market
 * gold, 10% cheaper building, 15% less supply on campaign. Measured, that pool was not merely
 * bland but *negative*: once ambition priced every card at 2 points of incoming wave, a run that
 * skipped every draft outlived one that took them. The mode's own progression system was a trap.
 *
 * A rule card is the answer. It has no `CourtEffect` payload at all — its levels are inert — and
 * its power comes from a hook here, read at the moment the rule applies. The test each one has to
 * pass is that it can be said in a sentence beginning "now I can": *now a wave has to break an
 * outer province before it reaches my seat*, *now my archers get a volley in before the lines
 * meet*. A card that can only be described as a number does not belong in this file.
 *
 * These deliberately hook the **auto-resolved** wave path rather than the watched battle. The
 * live battle screen opens 0.8 times per run, so a card whose verb only fires there is a card
 * that does nothing; when the showpiece opens as often as it should, these already reach it
 * through the same defence maths.
 */

/** How many copies of a rule card the run holds. */
export function doctrine(state: GameState, cardId: string): number {
  if (state.gameMode !== 'ascent') return 0;
  return state.ascent?.cardStacks[cardId] ?? 0;
}

/**
 * Fire Arrows — share of an attacking host cut down before the first exchange.
 *
 * Applies whether the defence then holds or breaks, which is the point: it is the one card
 * that pays out on a battle you lose.
 */
export function openingVolleyShare(state: GameState): number {
  // Rule cards level in their rule's own number: the cabinet's ×1.25/×1.5 deepens the per-stack
  // constant, and `ascentCards.ts` quotes the same arithmetic on the card face (9 → 11 → 14).
  return Math.min(0.3, doctrine(state, 'fire-arrows') * 0.09 * cabinetRuleMult('fire-arrows'));
}

/** Feigned Retreat — extra share lost by an attacker that pursues a defence which gave ground. */
export function pursuitLossShare(state: GameState): number {
  return Math.min(0.3, doctrine(state, 'feigned-retreat') * 0.07 * cabinetRuleMult('feigned-retreat'));
}


/**
 * Bamboo Palisade — how much more militia every province turns out.
 *
 * This card used to *grant* the frontier-first rule: a conquest host had to reduce an outer
 * province before it could reach the seat. That rule is now the map's default (see the note in
 * `pickInvasionTarget`), because a realm's width buying nothing was half the reason expanding was
 * survival-neutral — and a silver card drawn maybe once a run is no place for a rule the whole
 * mode depends on.
 *
 * So the card keeps the fantasy and changes its price: a palisade is what lets a district turn
 * more of its own people out behind it. Read by `militiaCapacity`, which is drawn from the
 * province rather than from the national pool, so this compounds with holding ground instead of
 * competing with fielding an army.
 */
export function palisadeMilitiaBonus(state: GameState): number {
  return doctrine(state, 'bamboo-palisade') * 0.35;
}

/** Mountain Pass — seasons of warning the realm gets before each wave. */
export function waveDelayTicks(state: GameState): number {
  return doctrine(state, 'mountain-pass');
}

/**
 * Surveyors' Corps — extra provinces the realm can be courting at once.
 *
 * Says "now I can open a second claim while the first is still running", which is the test every
 * card in this file has to pass. Claiming is capped at one at a time precisely so that raising the
 * cap is worth drafting for.
 */
export function extraClaimSlots(state: GameState): number {
  return doctrine(state, 'surveyors-corps');
}

/** Salt Roads — share off every wall and company bought on the response card. */
export function warPurchaseDiscount(state: GameState): number {
  // The dossier's worked example: 22% → 27% → 33% per stack. The cap keeps a Lv3 double stack
  // from making war purchases near-free — 0.66 uncapped is past "discount" and into "exploit".
  return Math.min(0.6, doctrine(state, 'salt-roads') * 0.22 * cabinetRuleMult('salt-roads'));
}

/**
 * Twice-Born — once each wave, a host that gives ground reforms at the capital rather than
 * scattering: no losses on the withdrawal, and it stands again with its heart half restored.
 *
 * Returns true when it fired, so the caller skips the ordinary retreat. The once-per-wave guard
 * lives on run state rather than on the army, because the card's promise is about the *wave*,
 * not about a particular host — and a realm fielding six of them would otherwise get six.
 */
export function tryReformBrokenHost(state: GameState, defender: Army): boolean {
  const ascent = state.ascent;
  if (!ascent || doctrine(state, 'twice-born') <= 0) return false;
  if (ascent.twiceBornWave === ascent.wave) return false;

  // Not onto a seat that is already being claimed. The ground is still nominally ours, so the
  // lookup used to succeed — and reforming there spent the once-per-wave card to put a host on a
  // province about to flip, where it then read as "relief" and re-opened the fight it had just
  // lost. A rally point has to be somewhere the realm still holds.
  const capital = state.lands.find(
    (land: Land) => land.id === ascent.capitalLandId && land.ownerId === PLAYER_KINGDOM_ID
      && !provinceIsFalling(state, land.id),
  );
  if (!capital) return false;

  ascent.twiceBornWave = ascent.wave;
  defender.landId = capital.id;
  defender.morale = Math.max(defender.morale, 55);
  return true;
}

/**
 * The Bronze Drum — morale every *other* host recovers when one of them breaks.
 *
 * Ordinary until the realm is fighting on more than one front, which is a situation the player
 * can choose to create. That conditionality is the card's whole design: it rewards a wide war
 * rather than paying out flatly.
 */
export function soundTheBronzeDrum(state: GameState, brokenArmyId: string): void {
  const stacks = doctrine(state, 'bronze-drum');
  if (stacks <= 0) return;

  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID || army.id === brokenArmyId) continue;
    army.morale = Math.min(100, army.morale + Math.round(stacks * 7 * cabinetRuleMult('bronze-drum')));
  }
}
