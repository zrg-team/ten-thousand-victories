/**
 * What a house carries into a reign, read from the three meta stores — Legacy, Dynasty, Deck.
 *
 * A reader over the real stores, never a ledger of its own, and it never writes (no `noteTraitUse`):
 * the beta's run-start card (backlog B05/B30) asks it two questions — is there anything to say at
 * all, and what, grouped by what it is to the player:
 *
 *   - **in force** — applied the moment the reign was founded: carried Legacy perks, ancestral
 *     codes, dynasty traits, a founding count above the default, cards dealt into the opening hand;
 *   - **owned** — context: the house's level, the Deck, the Legacy vault;
 *   - **waiting on the menu** — something the player could do before the next reign: draws to open,
 *     combines ready, an empty hand slot with a card to put in it, an empty carry slot with a perk
 *     to carry, a vault that can afford the next rung.
 *
 * Defaults are never benefits: one hand slot, three founders, a level-0 house and the king's look
 * say nothing a first reign needs a full screen for.
 */
import { founderOptionCount, getDynasty } from '../../state/dynasty';
import { DYNASTY_TRAITS_PENDING } from '../../data/dynastyTraits';
import { combinesReady, getCabinet, openingHand, openingHandSlots } from '../../state/cabinet';
import { getLegacy, getLegacyPerk, LEGACY_PERKS, LOADOUT_MAX, nextPerkCost, perkLevel } from '../../state/legacy';

export interface CarriedOver {
  /** Carried Legacy perks at their levels. */
  perks: { id: string; level: number }[];
  codes: number;
  /** Live dynasty traits held (a pending trait does nothing yet). */
  traits: string[];
  founders: number;
  hand: string[];
  // Waiting on the menu.
  draws: number;
  combines: number;
  freeHandSlots: number;
  unslottedCards: number;
  freeCarrySlots: number;
  uncarriedPerks: number;
  // Owned.
  legacyPoints: number;
  cheapestNextRung?: number;
  houseLevel: number;
  reigns: number;
}

export function readCarriedOver(): CarriedOver {
  const legacy = getLegacy();
  const dynasty = getDynasty();
  const cabinet = getCabinet();
  const hand = openingHand();
  const perks = legacy.loadout
    .map((id) => ({ id, level: perkLevel(id, legacy) }))
    .filter((perk) => perk.level > 0 && getLegacyPerk(perk.id));
  const owned = LEGACY_PERKS.filter((perk) => perkLevel(perk.id, legacy) > 0);
  let cheapestNextRung: number | undefined;
  for (const perk of LEGACY_PERKS) {
    const cost = nextPerkCost(perk, perkLevel(perk.id, legacy));
    if (cost !== undefined && (cheapestNextRung === undefined || cost < cheapestNextRung)) cheapestNextRung = cost;
  }
  return {
    perks,
    codes: (legacy.codes ?? []).length,
    traits: dynasty.traits.filter((id) => !DYNASTY_TRAITS_PENDING.has(id)),
    founders: founderOptionCount(),
    hand,
    draws: cabinet.rubbings,
    combines: combinesReady(),
    freeHandSlots: Math.max(0, openingHandSlots() - hand.length),
    unslottedCards: Object.keys(cabinet.cards).filter((id) => !hand.includes(id)).length,
    freeCarrySlots: Math.max(0, LOADOUT_MAX - legacy.loadout.length),
    uncarriedPerks: owned.filter((perk) => !legacy.loadout.includes(perk.id)).length,
    legacyPoints: legacy.points,
    cheapestNextRung,
    houseLevel: dynasty.level,
    reigns: dynasty.reigns,
  };
}

/** Whether the run-start card has anything to report that is in force or waiting to be done. */
export function carriesAnything(carried: CarriedOver): boolean {
  const inForce = carried.perks.length > 0 || carried.codes > 0 || carried.traits.length > 0
    || carried.founders > 3 || carried.hand.length > 0;
  const waiting = carried.draws > 0 || carried.combines > 0
    || (carried.freeHandSlots > 0 && carried.unslottedCards > 0)
    || (carried.freeCarrySlots > 0 && carried.uncarriedPerks > 0)
    || (carried.cheapestNextRung !== undefined && carried.legacyPoints >= carried.cheapestNextRung);
  return inForce || waiting;
}
