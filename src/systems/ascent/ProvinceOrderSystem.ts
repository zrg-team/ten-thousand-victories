/**
 * What a province is *for*, and who holds it — asked when the realm is visibly short of something
 * or a province is standing open.
 *
 * **Why the card exists.** Both levers already worked and neither was ever proposed. A focus is
 * buried two taps inside the Build lane and a governorship is one row on an appointment card that
 * only appears when a champion happens to arrive — so a run could bleed nine food a season for
 * twenty ticks with a breadbasket-grade delta sitting unclaimed, and a border province could be
 * overrun with three champions idle at court. Measured over six seeds: the realm ends the opening
 * with 0.8 provinces and every one of them on `balanced`.
 *
 * **Why one card for two answers.** `decree-offer` gives the reason in its own comment — the
 * director already weighs ten kinds, and a new kind does not merely add its own cards, it
 * displaces everyone else's. *Tell this district to grow rice* and *post this champion to it* are
 * two answers to one question, and putting them on one sheet is what makes it a decision: the
 * focus is free, permanent and reversible; the champion is a person you have exactly one of, and
 * spending them here is not spending them at court.
 *
 * **Every number on the card is a projection of this province**, not a promise about provinces in
 * general — `getSpecializationMult` and `getLandGovernorEffects` are the same functions the
 * economy tick reads, so the card cannot quote a figure the next tick disagrees with.
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  getFocusDefenseMult,
  getLandAptitude,
  getLandSpecialization,
  getSpecializationMult,
  refreshAllLandOutputs,
  setLandSpecialization,
} from '../ResourceSystem';
import { assignHeroToLand, getLandGovernorEffects } from '../CourtSystem';
import { provinceIsFalling } from '../LandSystem';
import { pushToast } from '../empire/notifications';
import { t } from '../../i18n';
import { enqueueAscentPrompt } from './AscentState';
import { defenceCommanderOf } from './landCommand';
import type {
  GameState, Hero, Land, LandSpecialization, ProvinceOrderOption,
} from '../../state/types';

/** The focus that answers each shortage. */
const FIX: Record<'food' | 'supplies' | 'gold', LandSpecialization> = {
  // Rice is food; the classic breadbasket multipliers apply unchanged in this mode.
  food: 'breadbasket',
  // Supplies are what arms a host, and `garrison` is the focus that makes a province arm one.
  supplies: 'garrison',
  gold: 'trade',
};

/**
 * How far into the red a rate has to be before the throne is interrupted about it.
 *
 * Not zero. A realm hovering at −0.4 food is a realm one harvest from level, and a card about it
 * would fire in the first season of every run and teach the player to dismiss the kind.
 */
const DEFICIT_RATE = -2;

/** Waves before which nobody is asked to garrison anything — the opening has enough to read. */
const UNDEFENDED_FROM_WAVE = 2;

/** The resource each economic focus is chosen for — `FIX`, read the other way. */
const FOCUS_RESOURCE: Record<'breadbasket' | 'mining' | 'trade', 'food' | 'supplies' | 'gold'> = {
  breadbasket: 'food',
  mining: 'supplies',
  trade: 'gold',
};

/**
 * How well the seat must suit a focus before the opening proposes it. Half: a seat that suits
 * nothing in particular is left `balanced`, which is the honest answer, and the card is not
 * raised to recommend a tilt the ground would pay back at seven tenths.
 */
const SETUP_FOCUS_MIN_APTITUDE = 0.5;

/**
 * Seasons a freshly-set focus is left alone before the shortage card may propose another.
 *
 * Measured on the seeded opening: the card set the seat to Food at season 8 for a food deficit
 * and to Gold at season 18 for a gold deficit — the founding's rates swing as the first farm and
 * market land, and a lever that is "permanent" was being flipped inside one cycle. Twelve is a
 * wave: long enough for the tilt to show in the books, short enough that a real shortage is
 * still answered inside the next Court.
 */
const FOCUS_SETTLE_TICKS = 12;

/**
 * The opening's one economic question: what is the seat for?
 *
 * The opening is the run's setup phase, and the focus is the setup phase's biggest lever —
 * measured, a seat worked for what its ground suits grossed 80-94 gold a season by season nine
 * against 40 for one left alone. It was also the lever nobody was shown: the focus is two taps
 * inside the Build lane, and this card only ever fired on a deficit or on an open border, so a
 * player learned it exists by running short. Asked once, in the grace before the first wave,
 * while the seat is still `balanced`; answered or held, it is not asked again.
 */
function setupOrder(state: GameState, owned: Land[]): { land: Land; focus: keyof typeof FOCUS_RESOURCE; resource: 'food' | 'supplies' | 'gold' } | undefined {
  const ascent = state.ascent;
  if (!ascent || ascent.wave > 0 || ascent.setupOrderOffered) return undefined;
  const seat = owned.find((land) => land.id === ascent.capitalLandId) ?? owned[0];
  if (!seat || getLandSpecialization(seat) !== 'balanced') return undefined;
  const aptitude = getLandAptitude(seat);
  // The ground first, the books second: a deficit at the founding weighs the focus that answers
  // it up to double, but never past what the ground pays back — the founding's rates swing as
  // the first farm and market land, and the seat is set for the run, not for season four.
  const need = (key: 'food' | 'supplies' | 'gold'): number => {
    const rate = state.resourceRates?.[key] ?? 0;
    return rate < 0 ? 1 + Math.min(1, -rate / 10) : 1;
  };
  const score = (focus: keyof typeof FOCUS_RESOURCE): number => aptitude[focus] * need(FOCUS_RESOURCE[focus]);
  const focus = (Object.keys(FOCUS_RESOURCE) as (keyof typeof FOCUS_RESOURCE)[])
    .reduce((best, next) => (score(next) > score(best) ? next : best));
  if (aptitude[focus] < SETUP_FOCUS_MIN_APTITUDE) return undefined;
  return { land: seat, focus, resource: FOCUS_RESOURCE[focus] };
}

function ownedLands(state: GameState): Land[] {
  // Ground an enemy is in the act of taking is out of the throne's hands, and every verb this
  // card offers runs through a guard that says so — `setLandSpecialization` and
  // `assignHeroToLand` both refuse a falling province. Drafting a card for one produced a card
  // whose buttons did nothing: `resolveProvinceOrder` returned false, `resolveAscentPrompt` left
  // it standing, and the player got a dead tap with no explanation.
  //
  // It was not a rare corner either. The `undefended` reason picks `mostExposed`, i.e. the
  // province with the most foreign neighbours — exactly the one most likely to be under a claim
  // when the card is raised. Measured by `verify-ascent`, which reported `province-order` as an
  // unanswerable prompt on the shipped seed.
  return state.lands.filter(
    (land) => land.ownerId === PLAYER_KINGDOM_ID && !provinceIsFalling(state, land.id),
  );
}

/**
 * Who could take the province, and what taking it costs.
 *
 * Unassigned champions first. If none — and by turn 6 there are none, because the founder is
 * appointed on the run's first card — a **seated minister** is offered instead, with the seat
 * named on the option. That is the trade the card exists to put in front of the player: a
 * governor is not a free lever, it is a chair at court you are choosing to empty. Measured: with
 * only idle champions in the pool the card offered a posting in 0 of 6 seeds.
 *
 * A champion already governing somewhere is never offered — moving them is a lateral shuffle
 * that costs one province what it gives another, and the card would be lying about the gain.
 */
function postable(state: GameState): { hero: Hero; fromSeat?: string }[] {
  const idle = state.heroes.filter((hero) => !hero.assignedTo);
  if (idle.length > 0) return idle.map((hero) => ({ hero }));
  return state.heroes
    .filter((hero) => hero.assignedTo?.startsWith('court:'))
    .map((hero) => ({ hero, fromSeat: hero.assignedTo?.slice('court:'.length) }));
}

/** Seasonal output this province would gain from being told what it is for. */
function focusGain(state: GameState, land: Land, focus: LandSpecialization, key: 'food' | 'supplies' | 'gold'): number {
  const before = getSpecializationMult(state, getLandSpecialization(land))[key];
  const after = getSpecializationMult(state, focus)[key];
  return Math.round((land.outputs?.[key] ?? 0) * (after - before));
}

/**
 * The province standing most open: no governor, no host, and the most sides facing somebody else.
 *
 * Border exposure rather than raw weakness, because the point of the card is the province an
 * invader will actually reach first.
 */
function mostExposed(state: GameState): Land | undefined {
  const owned = ownedLands(state);
  if (owned.length <= 1) return undefined;
  return owned
    .filter((land) => !defenceCommanderOf(state, land) && getLandSpecialization(land) !== 'fortress')
    .map((land) => ({
      land,
      open: land.neighbors.filter((id) => {
        const neighbour = state.lands.find((candidate) => candidate.id === id);
        return neighbour && neighbour.ownerId !== PLAYER_KINGDOM_ID;
      }).length,
    }))
    .filter((entry) => entry.open > 0)
    .sort((a, b) => b.open - a.open)[0]?.land;
}

/** The shortage worth interrupting for, worst first, or nothing. */
function worstDeficit(state: GameState): 'food' | 'supplies' | 'gold' | undefined {
  return (['food', 'supplies', 'gold'] as const)
    .filter((key) => (state.resourceRates?.[key] ?? 0) <= DEFICIT_RATE)
    .sort((a, b) => (state.resourceRates?.[a] ?? 0) - (state.resourceRates?.[b] ?? 0))[0];
}

type Draft = Extract<import('../../state/types').AscentPrompt, { kind: 'province-order' }>;

/**
 * The card, or nothing. Pure — `provinceOrderReady` and `offerProvinceOrder` both run it, so the
 * director never advertises a card the builder would then decline to raise.
 */
export function draftProvinceOrder(state: GameState): Draft | undefined {
  if (!state.ascent) return undefined;
  const owned = ownedLands(state);
  if (owned.length === 0) return undefined;

  // In the grace before the first wave the seat's own question comes first: the founding's
  // deficits are the shape of a realm with nothing built yet, and the shortage card answering
  // them set the seat for a season's books rather than for its ground.
  const setup = setupOrder(state, owned);
  const shortage = setup ? undefined : worstDeficit(state);
  const reason: Draft['reason'] = shortage ?? (setup ? 'setup' : 'undefended');
  if (!shortage && !setup && (state.ascent.wave ?? 0) < UNDEFENDED_FROM_WAVE) return undefined;

  // The resource the proposed focus is chosen for: the shortage, or the setup's reading of the
  // seat. Undefined only for the walls, whose gain is not a resource.
  const resource = shortage ?? setup?.resource;
  const focus: LandSpecialization = shortage ? FIX[shortage] : setup ? setup.focus : 'fortress';
  const land = shortage
    ? owned
      .filter((candidate) => getLandSpecialization(candidate) !== focus)
      // A focus set this cycle is given the cycle to work. See `FOCUS_SETTLE_TICKS`.
      .filter((candidate) => state.turn - (candidate.focusSetTurn ?? -FOCUS_SETTLE_TICKS) >= FOCUS_SETTLE_TICKS)
      .sort((a, b) => getLandAptitude(b)[focus] - getLandAptitude(a)[focus])[0]
    : setup
      ? setup.land
      : mostExposed(state);
  if (!land) return undefined;

  const options: ProvinceOrderOption[] = [];

  // 1 · what the ground is for. Free, permanent, and reversible from the Build lane afterwards.
  const gain = resource
    ? focusGain(state, land, focus, resource)
    : Math.round((getFocusDefenseMult(state, land, 'fortress') - 1) * 100);
  if (gain > 0) {
    options.push({
      id: `focus:${focus}`,
      role: 'focus',
      focus,
      effect: gain,
      affordable: true,
    });
  }

  // 2 · who holds it. Judged on what *this* province rewards — a captain on ground held to defend,
  // a clerk on ground held to pay — which is the whole reason the posting is a reading of the map
  // rather than a sort by administration.
  // The opening's card never proposes emptying a chair: the founder was seated two cards ago,
  // and the seat asking for them back reads as the game contradicting itself. A shortage later
  // in the run is a real trade and keeps the minister on offer.
  const candidates = setup ? postable(state).filter((candidate) => !candidate.fromSeat) : postable(state);
  const best = candidates
    .map(({ hero, fromSeat }) => {
      const effects = getLandGovernorEffects(state, land, hero);
      const worth = resource
        ? effects.outputMult
        : 1 + hero.stats.martial * 0.004;
      return { hero, effects, worth, fromSeat };
    })
    .sort((a, b) => b.worth - a.worth)[0];
  if (best) {
    options.push({
      id: `governor:${best.hero.id}`,
      role: 'governor',
      heroId: best.hero.id,
      heroName: best.hero.name,
      fromSeat: best.fromSeat,
      keyStat: resource ? best.effects.keyStat : 'martial',
      effect: resource
        ? Math.round((best.effects.outputMult - 1) * 100)
        : best.hero.stats.martial,
      affordable: true,
    });
  }

  // A card with nothing but "leave it" on it is a notification wearing a decision's clothes —
  // ten of the forty-seven cards in the opening already are, and this kind will not be one.
  if (options.length === 0) return undefined;

  options.push({ id: 'hold', role: 'hold', affordable: true });

  return {
    kind: 'province-order',
    landId: land.id,
    landName: land.name,
    reason,
    resource,
    rate: shortage ? Math.round((state.resourceRates?.[shortage] ?? 0) * 10) / 10 : undefined,
    options,
  };
}

export function provinceOrderReady(state: GameState): boolean {
  return Boolean(draftProvinceOrder(state));
}

export function offerProvinceOrder(state: GameState): boolean {
  const draft = draftProvinceOrder(state);
  if (!draft) return false;
  // Once. Held or answered, the opening's question is not re-asked every cooldown.
  if (draft.reason === 'setup' && state.ascent) state.ascent.setupOrderOffered = true;
  enqueueAscentPrompt(state, draft);
  return true;
}

/**
 * Carries the order out. Returns false only when the world has moved under the card — the
 * province lost, the champion taken — and `resolveAscentPrompt` then leaves the card standing
 * rather than swallowing a tap that did nothing.
 */
export function resolveProvinceOrder(state: GameState, landId: string, choiceId: string): boolean {
  if (choiceId === 'hold') return true;

  // The card was raised for ground that has since come under a claim. Filtering the draft pool
  // stops this being raised in the first place, but a card already standing when the host arrives
  // still has to be answerable — `resolveAscentPrompt` leaves a false return on screen, so without
  // this the province's own misfortune wedged the card that was about to improve it.
  //
  // Answered rather than refused, and said out loud. A tap that reports why it changed nothing is
  // a decision the player can learn from; a tap that silently does nothing is the bug.
  if (provinceIsFalling(state, landId)) {
    const land = state.lands.find((candidate) => candidate.id === landId);
    pushToast(state, t('ascent.order.contested', { land: land?.name ?? '' }), 'threat');
    return true;
  }

  const [verb, value] = choiceId.split(':');
  if (verb === 'focus') {
    const done = setLandSpecialization(state, landId, value as LandSpecialization);
    // The focus changes what every building on the ground is worth; without this the card's own
    // number does not appear until something else happens to recompute the realm.
    if (done) refreshAllLandOutputs(state);
    return done;
  }
  if (verb === 'governor') {
    const done = assignHeroToLand(state, value, landId);
    if (done) refreshAllLandOutputs(state);
    return done;
  }
  return false;
}
