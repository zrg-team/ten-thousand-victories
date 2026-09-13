/**
 * When the next champion comes, and the search that brings one now.
 *
 * The court's Favour meter pays out a champion draft on its own clock, and that clock was on no
 * page the player reads — Favour sat as a bare "7/15" on the Court page — so the Heroes page
 * opened with no answer to "when is the next one?". Reported as exactly that question.
 *
 * *Tìm nhân tài trong thiên hạ* is the other door: a search the throne pays for. It never gets
 * cheap — the price is a share of the treasury in hand — and it rests `TALENT_SEARCH_REST_SEASONS`
 * seasons between searches. It does not touch the Favour meter; the two are separate.
 *
 * A Favour draft that has already paid out still waits for a Court window
 * (`tickDecisionDirector`), so it can sit unheard for most of a wave cycle. `searchForTalent`
 * raises a waiting draft for free instead of charging for a search.
 */
import {
  TALENT_SEARCH_BASE_FAR_MULT,
  TALENT_SEARCH_BASE_GOLD,
  TALENT_SEARCH_ESCALATION,
  TALENT_SEARCH_REST_SEASONS,
  TALENT_SEARCH_SHARE_CURVE,
  TALENT_SEARCH_SHARE_FAR,
  TALENT_SEARCH_SHARE_NEAR,
  TALENT_SEARCH_TREASURY_SHARE,
} from '../../game/ascentConfig';
import { rulesOf } from '../../game/ascentRuleset';
import { getCourtBonuses } from '../CourtSystem';
import { createHeroDraft } from '../HeroSystem';
import { applyResourceDelta } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { realmPriceScale } from './priceScale';
import { t } from '../../i18n';
import type { GameState } from '../../state/types';

export interface TalentForecast {
  favor: number;
  threshold: number;
  /** Seasons until the meter fills at the court's current rate; undefined when it is not rising. */
  seasonsLeft?: number;
  /** A Favour draft has already paid out and is waiting for a Court window. */
  draftWaiting: boolean;
  /** Gold a search costs right now. */
  price: number;
  canAfford: boolean;
  /** Seasons before the next search is allowed; 0 = allowed now. */
  seasonsUntilSearch: number;
  /** How far through its rest the search is, 0..1 (1 = ready). */
  restProgress: number;
}

/**
 * Gold for one search: the greater of a base that grows with the realm and a share of the gold
 * held. Read live, so a treasury that has grown since the page opened pays the grown price.
 */
export function talentSearchPrice(state: GameState): number {
  if (rulesOf(state).talentPriceByFavor) return favorPricedSearch(state);
  return Math.ceil(Math.max(
    TALENT_SEARCH_BASE_GOLD * realmPriceScale(state),
    Math.max(0, state.resources.gold) * TALENT_SEARCH_TREASURY_SHARE,
  ));
}

/** Share of the Favour meter still to fill, 0 (a champion is due) .. 1 (one was just dealt). */
export function favorRemaining(state: GameState): number {
  const { favor, favorThreshold } = state.court;
  if (favorThreshold <= 0) return 0;
  return Math.min(1, Math.max(0, (favorThreshold - favor) / favorThreshold));
}

/** How many times dearer the next search is for the searches already bought this reign. */
export function talentSearchEscalation(state: GameState): number {
  return TALENT_SEARCH_ESCALATION ** Math.max(0, state.ascent?.talentSearches ?? 0);
}

/**
 * Beta (`talentPriceByFavor`): priced by what the search skips. A search bought just after a free
 * champion skips a whole Favour cycle and costs more than the treasury holds; one bought a season
 * before the next is only impatience and costs about what the shipped price did. Each search
 * already bought this reign multiplies the price again — see the constants in `ascentConfig`.
 */
function favorPricedSearch(state: GameState): number {
  const skipped = favorRemaining(state) ** TALENT_SEARCH_SHARE_CURVE;
  const share = TALENT_SEARCH_SHARE_NEAR + (TALENT_SEARCH_SHARE_FAR - TALENT_SEARCH_SHARE_NEAR) * skipped;
  const base = TALENT_SEARCH_BASE_GOLD * realmPriceScale(state) * (1 + (TALENT_SEARCH_BASE_FAR_MULT - 1) * skipped);
  const price = Math.max(base, Math.max(0, state.resources.gold) * share);
  return Math.ceil(price * talentSearchEscalation(state));
}

function seasonsUntilSearch(state: GameState): number {
  const ascent = state.ascent;
  if (!ascent || ascent.talentSearchTurn === undefined) return 0;
  return Math.max(0, ascent.talentSearchTurn + TALENT_SEARCH_REST_SEASONS - state.turn);
}

export function talentForecast(state: GameState): TalentForecast {
  const { favor, favorThreshold } = state.court;
  const perSeason = getCourtBonuses(state).favorPerTick;
  const price = talentSearchPrice(state);
  return {
    favor,
    threshold: favorThreshold,
    seasonsLeft: perSeason > 0 ? Math.max(0, Math.ceil((favorThreshold - favor) / perSeason)) : undefined,
    draftWaiting: Boolean(state.activeHeroDraft?.length),
    price,
    canAfford: state.resources.gold >= price,
    seasonsUntilSearch: seasonsUntilSearch(state),
    restProgress: 1 - seasonsUntilSearch(state) / TALENT_SEARCH_REST_SEASONS,
  };
}

/**
 * Raises the champion card now, at the player's request. A Favour draft already waiting comes up
 * for free and spends nothing. Otherwise this is the paid search: refused — charging nothing —
 * while the search is resting or the treasury cannot pay.
 *
 * The draft is dealt *before* the gold is taken: `offerHeroSummon` falls through to the wave
 * gacha when no draft exists, and a search that landed there would spend the player's next wave
 * summon as well as their gold.
 */
export function searchForTalent(state: GameState): boolean {
  const ascent = state.ascent;
  if (!ascent || state.pendingAscentPrompt) return false;

  if (!state.activeHeroDraft?.length) {
    if (seasonsUntilSearch(state) > 0) return false;
    const price = talentSearchPrice(state);
    if (state.resources.gold < price) return false;
    createHeroDraft(state);
    if (!state.activeHeroDraft?.length) return false;
    applyResourceDelta(state, { gold: -price });
    ascent.talentSearchTurn = state.turn;
    // Beta only, so a stable reign's state (and its saves and fingerprint) carry no new field.
    if (rulesOf(state).talentPriceByFavor) ascent.talentSearches = (ascent.talentSearches ?? 0) + 1;
    pushToast(state, t('ascent.talent.paid', { gold: price }), 'reward');
  }

  enqueueAscentPrompt(state, {
    kind: 'hero-choice',
    heroIds: state.activeHeroDraft.map((hero) => hero.id),
    source: 'court',
    pityUsed: false,
  }, { requested: true });
  return true;
}
