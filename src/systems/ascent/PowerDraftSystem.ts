import {
  DRAFT_CARD_COUNT,
  REROLL_BASE_COST,
  REROLL_COST_MULT,
  XP_SKIP_REFUND_SHARE,
} from '../../game/ascentConfig';
import { findPowerCard, ROLLABLE_POWER_CARDS } from '../../data/ascentCards';
import { HERO_POWER_CARDS } from '../../data/heroPolicies';
import { heroCapability } from '../heroes/heroModel';
import { heroMeasurements, measureHeroDraft } from '../heroes/heroMeasurements';
import type { HeroPolicyId } from '../heroes/types';
import { weightedPickIndex } from '../../utils/math';
import { applyCourtEffect } from '../PoliticsSystem';
import { applyResourceDelta, canSpend } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { addAscentXp, computeAscentPower, engineTerm } from './PowerSystem';
import { chargeAmbition } from './AmbitionSystem';
import { doctrineDraftBonus } from './RealmDoctrineSystem';
import { enqueueAscentPrompt } from './AscentState';
import { hasTrait, noteTraitUse } from '../../state/dynasty';
import { cabinetLevel, cabinetWeightMult, grantDeed, learnRecipe, openingHand, recipeLearned } from '../../state/cabinet';
import { noteRubbing } from './Inheritance';
import { realmPriceScale } from './priceScale';
import { t } from '../../i18n';
import { rulesOf } from '../../game/ascentRuleset';
import { masonryPowerPerDefense } from '../WarSystem';
import type { AscentState, CourtModifier, GameState, PowerCardDef } from '../../state/types';

/**
 * The rung of `levels[]` this card plays at — its **cabinet** level, never its stack index.
 *
 * Stacking pushes more copies of the same rung; the ladder is climbed only by combining copies
 * in the Cabinet of Seals between runs. Indexing `levels[]` by stack instead would hand every
 * third copy a free Lv3, which is a meta-progression paid out by nothing.
 */
export function cardLevelEntry(card: PowerCardDef): PowerCardDef['levels'][number] {
  return card.levels[Math.min(cabinetLevel(card.id) - 1, card.levels.length - 1)];
}

/**
 * Opening reroll price for a draft at this level. Doubles again on each use within it.
 *
 * `scale` is the realm's price scale (`realmPriceScale`): the level term tracks the run's
 * progress, the scale tracks its wealth, and a late draft in a rich realm has to cost more than
 * a late draft in a poor one or the reroll stops being a choice for exactly the player with
 * the most gold to make it with.
 */
export function rerollPriceFor(level: number, scale = 1): number {
  return Math.round(REROLL_BASE_COST * (1 + Math.max(0, level - 1) * 0.35) * scale);
}

/** How many times this card has been taken. */
export function cardStack(ascent: AscentState, cardId: string): number {
  return ascent.cardStacks[cardId] ?? 0;
}

function isMaxed(ascent: AscentState, card: PowerCardDef): boolean {
  return cardStack(ascent, card.id) >= card.maxStacks;
}

/**
 * True when this card's evolution partner is already maxed, so taking this one to max
 * completes the pair. Drives both the draft weighting and the card's badge.
 */
export function isEvolutionReady(ascent: AscentState, card: PowerCardDef): boolean {
  if (!card.evolvesWith || ascent.retiredCards.includes(card.id)) return false;
  const partner = findPowerCard(card.evolvesWith);
  if (!partner) return false;
  return cardStack(ascent, partner.id) >= partner.maxStacks;
}

/** Cards that could still be offered: not maxed, not retired by an evolution, requirements met. */
function eligibleCards(state: GameState, ascent: AscentState): PowerCardDef[] {
  return (heroCapability(state, 'cards') ? [...ROLLABLE_POWER_CARDS, ...HERO_POWER_CARDS] : ROLLABLE_POWER_CARDS).filter((card) => {
    if (ascent.retiredCards.includes(card.id)) return false;
    if (isMaxed(ascent, card)) return false;
    if (card.requires && !card.requires(state)) return false;
    return true;
  });
}

/**
 * Rolls `DRAFT_CARD_COUNT` distinct cards, weighted by rarity.
 *
 * Rarity weights live on run state rather than in the data file so they can drift (a shrine
 * province nudges them up). Cards already in progress get a small bonus so the run tends to
 * deepen a build rather than scattering one-offs across everything.
 */
/**
 * How much more likely a card is to be offered again, given how deep the player is already in it.
 *
 * A flat 2.2× for anything with at least one stack was applied *forever*, so the first few cards
 * a run happened to take crowded out the rest of the pool for the remainder of it: measured, a
 * full run built a deck of only five distinct powers however many drafts it saw. The pull toward
 * a coherent build is right — scattering one-offs across everything is worse — but it has to
 * taper, or the deck stops being a choice after the third draft.
 *
 * Peaks at the second copy, where committing actually matters, then falls away; a card already
 * three deep is nearly maxed and is pushed *down* so something new can appear beside it.
 */
function focusBonus(stacks: number): number {
  if (stacks <= 0) return 1;
  // 3.0, up from 2.2: measured over eight seeded runs, upgrades were 13% of the cards offered and
  // a player who wanted to deepen a build saw about three chances a run. This is the "showing
  // up" lever — a card's effect budget does not move — and the taper below is unchanged.
  if (stacks === 1) return 3.0;
  if (stacks === 2) return 1.3;
  return 0.6;
}

/**
 * The deck slot: once the player holds two or more un-maxed cards, one offer is reserved for a
 * held card, chosen by the focus weights among the held cards only.
 *
 * The same shape as the evolution slot above it, for the same reason: a pool of fifty and a hand
 * of four meant a held card competed with forty-odd new ones for every slot, and the pull toward
 * depth was the only pull. The other three slots stay new, so the draft remains a choice; and a
 * card already dealt to the evolution slot counts, so the two reservations never eat half the hand.
 */
const DECK_SLOT_MIN_HELD = 2;

function reservedDeckCard(ascent: AscentState, pool: PowerCardDef[], picks: string[]): string | undefined {
  const held = pool.filter((card) => cardStack(ascent, card.id) > 0);
  if (held.length < DECK_SLOT_MIN_HELD) return undefined;
  if (picks.some((id) => cardStack(ascent, id) > 0)) return undefined;
  const open = held.filter((card) => !picks.includes(card.id));
  const index = weightedPickIndex(open.map((card) => (ascent.draftWeights[card.rarity] ?? 1) * (card.weight ?? 1) * focusBonus(cardStack(ascent, card.id))));
  return index < 0 ? undefined : open[index].id;
}

export function rollPowerDraftCards(state: GameState): string[] {
  const ascent = state.ascent;
  if (!ascent) return [];

  const pool = eligibleCards(state, ascent);
  const picks: string[] = [];

  // A completable evolution is *guaranteed* a slot rather than merely weighted. Evolutions
  // are meant to be the run's landmarks; leaving the final piece to a dice roll meant they
  // almost never fired, and a payoff the player can see coming but never reach is worse
  // than none at all.
  const ready = pool.find((card) => isEvolutionReady(ascent, card));
  if (ready) picks.push(ready.id);
  const deck = reservedDeckCard(ascent, pool, picks);
  if (deck) picks.push(deck);

  // Wide Draft (`dynastyTraits`) lays out one card more. An option count, not a power increase:
  // a fifth card cannot make the realm stronger than the fourth already could, it only makes the
  // build the player was reaching for reachable more often.
  const wanted = DRAFT_CARD_COUNT + (hasTrait('wide-draft') ? 1 : 0) + (hasTrait('wide-draft-2') ? 1 : 0);
  if (hasTrait('wide-draft')) noteTraitUse('wide-draft');
  if (hasTrait('wide-draft-2')) noteTraitUse('wide-draft-2');
  while (picks.length < wanted && picks.length < pool.length) {
    const candidates = pool.filter((card) => !picks.includes(card.id) && (!card.id.startsWith('hero-')
      || (!picks.some(id => id.startsWith('hero-')) && pool.filter(item => !item.id.startsWith('hero-')).length >= 2
        && wanted - picks.length > Math.max(0, 2 - picks.filter(id => !id.startsWith('hero-')).length))));
    const index = weightedPickIndex(
      candidates.map((card) => {
        const rarityWeight = ascent.draftWeights[card.rarity] ?? 1;
        // The standing doctrine leans the table toward its own rarity — a lean, never a lock, so
        // a realm at arms sees more jade without ever ceasing to see bronze. Half of what makes
        // two runs feel different is the deck, and a doctrine that moved only the economy would
        // have left every build identical.
        return rarityWeight
          * (card.weight ?? 1)
          * focusBonus(cardStack(ascent, card.id))
          * doctrineDraftBonus(state, card.rarity)
          // The cabinet's steep step: a levelled seal mostly buys *showing up* (×1.3 / ×1.6).
          // The pool itself is untouched — ownership never gates what can be offered.
          * cabinetWeightMult(cabinetLevel(card.id));
      }),
    );
    if (index < 0) break;
    picks.push(candidates[index].id);
  }

  return picks;
}

/**
 * Deals the opening hand: the seals slotted in the Cabinet arrive at one stack each, and each
 * slot charges `AMBITION_PER_POWER_CARD` (+2) at the founding — the wave director answers the
 * head start honestly, which is the snowball guard the whole feature stands on. Slots are
 * optional; an empty hand starts at zero extra ambition, and the choice is the strategy.
 */
export function applyOpeningHand(state: GameState, countTraitUses = true): void {
  const ascent = state.ascent;
  if (!ascent) return;
  const hand = openingHand();
  for (const cardId of hand) {
    const card = findPowerCard(cardId);
    if (!card || cardStack(ascent, cardId) > 0) continue;
    applyPowerCardEffect(state, card, 0);
    ascent.cardStacks[cardId] = 1;
    chargeAmbition(state, 'card');
  }
  // The shelf paid when the hand actually used the slot it opened.
  if (countTraitUses && hand.length >= 2) noteTraitUse('deep-shelf');
  if (countTraitUses && hand.length >= 3) noteTraitUse('deep-shelf-2');
}

/** Opens a Power Draft for one banked level-up. */
export function offerPowerDraft(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent || ascent.pendingLevelUps <= 0) return;

  const cards = rollPowerDraftCards(state);
  if (cards.length === 0) {
    // Everything is maxed — convert the level into momentum rather than stalling the run.
    ascent.pendingLevelUps -= 1;
    addAscentXp(state, Math.round(ascent.xpToNext * XP_SKIP_REFUND_SHARE));
    return;
  }

  // Priced off the run's progress, not flat: gold income compounds steeply, and a fixed
  // 40g reroll is free money by the time the realm holds a dozen provinces.
  //
  // First Reroll Free (`dynastyTraits`) opens each draft at nothing. Priced rather than counted:
  // there is no per-draft "free reroll used" flag to keep in step with supersede, reload and the
  // level-up that opens a second draft — the zero *is* the state, and `rerollPowerDraft` puts the
  // real price back the moment it is spent.
  ascent.rerollCost = hasTrait('first-reroll-free') ? 0 : rerollPriceFor(ascent.level, realmPriceScale(state));
  enqueueAscentPrompt(state, {
    kind: 'power-draft',
    cards,
    rerollCost: ascent.rerollCost,
    level: ascent.level,
  });
  measureHeroDraft(state, cards);
}

/** Re-rolls the open draft for gold. The price doubles each time within the same draft. */
export function rerollPowerDraft(state: GameState): boolean {
  const ascent = state.ascent;
  const prompt = state.pendingAscentPrompt;
  if (!ascent || prompt?.kind !== 'power-draft') return false;

  const cost = { gold: ascent.rerollCost };
  if (!canSpend(state, cost)) return false;

  applyResourceDelta(state, { gold: -ascent.rerollCost });
  if (ascent.rerollCost <= 0 && hasTrait('first-reroll-free')) noteTraitUse('first-reroll-free');
  // A free first reroll returns to the ordinary opening price, not to zero doubled. At Rank II
  // the price never doubles: every reroll of a draft costs the opening price.
  const steady = hasTrait('first-reroll-free-2');
  if (steady && ascent.rerollCost > 0) noteTraitUse('first-reroll-free-2');
  ascent.rerollCost = ascent.rerollCost <= 0 || steady
    ? rerollPriceFor(ascent.level, realmPriceScale(state))
    : Math.round(ascent.rerollCost * REROLL_COST_MULT);

  const cards = rollPowerDraftCards(state);
  if (cards.length > 0) {
    prompt.cards = cards;
    measureHeroDraft(state, cards);
  }
  prompt.rerollCost = ascent.rerollCost;
  return true;
}

/**
 * When both parents of an evolution are maxed, retire them and grant the unique result.
 * Retirement filters the parents' modifiers out by their `asc:<id>:` label prefix — the
 * reason takes are labelled machine-readably rather than with a display name.
 */
function maybeEvolve(state: GameState, ascent: AscentState, taken: PowerCardDef): void {
  if (!taken.evolvesWith || !taken.evolvesInto) return;

  const partner = findPowerCard(taken.evolvesWith);
  const result = findPowerCard(taken.evolvesInto);
  if (!partner || !result) return;
  if (!isMaxed(ascent, taken) || !isMaxed(ascent, partner)) return;
  if (ascent.retiredCards.includes(taken.id) || ascent.retiredCards.includes(partner.id)) return;

  state.activeCourtModifiers = state.activeCourtModifiers.filter(
    (modifier) =>
      !modifier.label.startsWith(`asc:${taken.id}:`) && !modifier.label.startsWith(`asc:${partner.id}:`),
  );
  ascent.retiredCards.push(taken.id, partner.id);

  applyPowerCardEffect(state, result, 0);
  ascent.cardStacks[result.id] = 1;

  // The forge learns the recipe the moment it is completed in a run: from now on the parents
  // call each other out in every draft, from run one. The first forging is also a deed.
  learnRecipe(result.id);
  if (grantDeed('first-evolution')) noteRubbing(state);

  // pushToast already records the event in the persistent log.
  const name = t(`ascent.card.${result.id}` as Parameters<typeof t>[0]);
  pushToast(state, t('ascent.draft.evolved', { name }), 'reward');
}

function applyPowerCardEffect(state: GameState, card: PowerCardDef, stackIndex: number): void {
  const level = cardLevelEntry(card);
  applyCourtEffect(state, `asc:${card.id}:${stackIndex + 1}`, level.effect);
}

/**
 * Takes a card: applies its payload, bumps the stack counter, checks for an evolution, and
 * consumes one banked level-up. Every take pushes a *new* permanent modifier, which is what
 * makes stacking work without any bespoke machinery.
 */
export function takePowerCard(state: GameState, cardId: string): boolean {
  const ascent = state.ascent;
  const card = findPowerCard(cardId);
  if (!ascent || !card) return false;
  if (cardId.startsWith('hero-') && (!card.requires?.(state) || !heroCapability(state, 'cards'))) return false;

  const stack = cardStack(ascent, cardId);
  if (stack >= card.maxStacks) return false;

  applyPowerCardEffect(state, card, stack);
  ascent.cardStacks[cardId] = stack + 1;
  const measurements = heroMeasurements(state);
  if (measurements) measurements.choices[cardId] = (measurements.choices[cardId] ?? 0) + 1;
  if (cardId.startsWith('hero-')) ascent.heroDepth!.policies.push(cardId as HeroPolicyId);
  if (card.rarity === 'jade' && grantDeed('first-jade')) noteRubbing(state);
  ascent.pendingLevelUps = Math.max(0, ascent.pendingLevelUps - 1);
  ascent.rerollCost = rerollPriceFor(ascent.level, realmPriceScale(state));
  // Power draws attention. Skipping the draft is now a real option rather than a strictly
  // worse one — it refunds momentum *and* leaves the realm quieter for the next wave.
  chargeAmbition(state, 'card');

  maybeEvolve(state, ascent, card);
  return true;
}

/** Declines the draft in exchange for momentum toward the next one. */
export function skipPowerDraft(state: GameState): number {
  const ascent = state.ascent;
  if (!ascent) return 0;

  const refund = Math.round(ascent.xpToNext * XP_SKIP_REFUND_SHARE);
  ascent.pendingLevelUps = Math.max(0, ascent.pendingLevelUps - 1);
  ascent.rerollCost = rerollPriceFor(ascent.level, realmPriceScale(state));
  addAscentXp(state, refund);
  return refund;
}

/** Momentum a skip would refund, for the button label. */
export function skipRefundAmount(state: GameState): number {
  return Math.round((state.ascent?.xpToNext ?? 0) * XP_SKIP_REFUND_SHARE);
}

/**
 * How much POWER this card would actually add, as a percentage.
 *
 * Measured, not guessed: the card's modifier is pushed onto the live modifier list, POWER is
 * recomputed, and the modifier is popped straight back off. That is what lets the card
 * promise "▲ POWER +7%" and have the HUD then move by that much — the honesty of that badge
 * is the thing that makes the draft feel like it matters.
 */
export function estimatePowerGainPct(state: GameState, card: PowerCardDef): number {
  const before = computeAscentPower(state);
  if (before <= 0) return 0;

  const level = cardLevelEntry(card);
  const preview: CourtModifier = { id: 'ascent-preview', label: 'ascent-preview', ...level.effect };

  state.activeCourtModifiers.push(preview);
  let after = computeAscentPower(state);
  state.activeCourtModifiers.pop();

  // Income modifiers only reach `resourceRates` after a real apply refreshes land outputs,
  // and `defenseBoost` is a one-shot grant rather than a modifier, so both are folded in by
  // hand using the same weights `computeAscentPower` uses.
  // Through the same clamp `computeAscentPower` applies, so a gold card offered to a realm in
  // deficit does not promise POWER the engine term (floored at zero) can never deliver.
  const rates = level.effect.resourceRateModifier;
  if (rates) {
    const now = state.resourceRates;
    after += engineTerm({
      gold: now.gold + (rates.gold ?? 0),
      food: now.food + (rates.food ?? 0),
      supplies: now.supplies + (rates.supplies ?? 0),
    }) - engineTerm(now);
  }
  if (level.effect.defenseBoost) {
    // Beta: at what an Ascent wall point is actually worth (8, not the classic 16 — the preview
    // promised defence cards twice the POWER they delivered).
    after += level.effect.defenseBoost * (rulesOf(state).truthfulNumbers ? masonryPowerPerDefense(state) : 16) * 0.6;
  }

  return Math.max(0, Math.round(((after - before) / before) * 100));
}

export interface PowerCardView {
  id: string;
  rarity: PowerCardDef['rarity'];
  name: string;
  description: string;
  /** "NEW", "II → III", or "MAX". */
  stackLabel: string;
  stackCount: string;
  powerGainPct: number;
  maxed: boolean;
  /** Taking this to max completes an evolution — called out on the card. */
  evolutionReady: boolean;
  /** The card's cabinet level — 2 and 3 wear stars on the face. */
  cabinetLevel: 1 | 2 | 3;
  /**
   * The forge remembers: this card's evolution partner, named on the face from run one once
   * some past run has completed the recipe. Empty until the recipe is learned — a hunt the
   * player has not made yet must stay a hunt.
   */
  recipeHint?: string;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

/** Everything the draft panel needs to render one card, with the numbers already resolved. */
export function powerCardView(state: GameState, cardId: string): PowerCardView | undefined {
  const ascent = state.ascent;
  const card = findPowerCard(cardId);
  if (!ascent || !card) return undefined;

  const stack = cardStack(ascent, cardId);
  const level = cardLevelEntry(card);
  const maxed = stack >= card.maxStacks;
  const knownRecipe = card.evolvesWith && card.evolvesInto && recipeLearned(card.evolvesInto)
    ? t('ascent.draft.recipeHint', {
      partner: t(`ascent.card.${card.evolvesWith}` as Parameters<typeof t>[0]),
      result: t(`ascent.card.${card.evolvesInto}` as Parameters<typeof t>[0]),
    })
    : undefined;

  return {
    id: card.id,
    rarity: card.rarity,
    name: t(`ascent.card.${card.id}` as Parameters<typeof t>[0]),
    description: t(`ascent.card.${card.id}.d` as Parameters<typeof t>[0], level.display),
    stackLabel: maxed
      ? t('ascent.draft.maxed')
      : stack === 0
        ? t('ascent.draft.new')
        : t('ascent.draft.stack', { from: roman(stack), to: roman(stack + 1) }),
    stackCount: t('ascent.draft.stackCount', { n: Math.min(stack + 1, card.maxStacks), max: card.maxStacks }),
    powerGainPct: estimatePowerGainPct(state, card),
    maxed,
    // Only worth shouting about when this take is the one that completes the pair.
    evolutionReady: isEvolutionReady(ascent, card) && stack + 1 >= card.maxStacks,
    cabinetLevel: cabinetLevel(card.id),
    ...(knownRecipe ? { recipeHint: knownRecipe } : {}),
  };
}
