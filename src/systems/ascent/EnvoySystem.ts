import { PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  ALLY_AID_MIN_RELATIONS, BUYOFF_MIN_RELATIONS,
  GIFT_TREASURY_SHARE,
  PACT_TREASURY_SHARE,
} from '../../game/ascentConfig';
import { getEmpirePower, getFear, giftCost, giftOpinionGain, hasPact, proposePact } from '../DiplomacySystem';
import {
  denounce, demandTribute, GIFT_TIERS, proposeTrade, sendGift, sendGrain,
} from '../ForeignAffairsSystem';
import { aidRefusal, battleNeedingRelief, callForAid } from './AllySupport';
import {
  buyoffCost, buyoffRefusal, buyOffHost, canTrade, exchangeRate, hostsInTheField, tradeGrain,
} from './CourtBargains';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { heroName, t } from '../../i18n';
import { breakVassalage, canVassalize, grantVassalage } from './VassalSystem';
import type { EnvoyOption, GameState, Hero, Kingdom } from '../../state/types';

/**
 * What an oath costs.
 *
 * Priced off the realm's own income and capped against the treasury, the same shape
 * `tributeDemandGold` uses — never advertise a price the player cannot pay.
 */
export function vassalOathGold(state: GameState, kingdom: Kingdom): number {
  const byIncome = Math.max(0, state.resourceRates.gold) * 40;
  const byStanding = 400 + (kingdom.power ?? 40) * 8;
  return Math.round(Math.max(600, Math.min(byIncome + byStanding, state.resources.gold * 0.8 || byStanding)));
}

const TRADE_INFLUENCE_COST = 10;

/**
 * The rival most worth a card right now: the one whose hostility is climbing fastest against
 * the realm's ability to answer it. Cultivating this empire measurably lowers how often it
 * shows up as the aggressor — `WaveDirector.pickAggressor` weights by `100 - relations`.
 */
export function pickEnvoyTarget(state: GameState): Kingdom | undefined {
  const candidates = state.kingdoms
    .filter((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated)
    // Filter before ranking, not after. Ranking first and testing the winner meant the
    // strongest empire was always chosen and then rejected for being content — so the card
    // never fired at all while three colder neighbours were worth visiting.
    .filter((kingdom) => isWorthVisiting(kingdom));
  if (candidates.length === 0) return undefined;

  return [...candidates].sort((a, b) => envoyUrgency(state, b) - envoyUrgency(state, a))[0];
}

/**
 * Whether a court is worth a modal: they are cooling toward war, or already keen on it. A
 * placid neighbour under a standing pact is not a decision.
 */
export function isWorthVisiting(kingdom: Kingdom): boolean {
  if (hasPact(kingdom)) return false;
  return (kingdom.relations ?? 50) < 55 || (kingdom.warAppetite ?? 0) >= 30;
}

function envoyUrgency(state: GameState, kingdom: Kingdom): number {
  const hostility = Math.max(0, 60 - (kingdom.relations ?? 50));
  const appetite = kingdom.warAppetite ?? 0;
  const strength = getEmpirePower(state, kingdom) / 40;
  // A pact already holds them off, so they are the least interesting court to visit.
  return (hostility * 1.4 + appetite + strength * 6) * (hasPact(kingdom) ? 0.35 : 1);
}

/** An unposted hero to send as ambassador — diplomacy is what the posting actually uses. */
function bestAmbassador(state: GameState): Hero | undefined {
  return state.heroes
    .filter((hero) => !hero.assignedTo)
    .sort((a, b) => b.stats.diplomacy - a.stats.diplomacy)[0];
}

/**
 * Everything the realm can do about one empire, on one card. Unaffordable actions still show
 * with their price so the player learns what a warmer relationship would have cost.
 */
export function buildEnvoyOptions(state: GameState, kingdom: Kingdom): EnvoyOption[] {
  // Two seasons of income, or a slice of the treasury, whichever is more: a gift from a rich
  // court that cost it nothing would not be one. See `GIFT_TREASURY_SHARE`.
  const giftBase = Math.max(giftCost(kingdom, state), state.resources.gold * GIFT_TREASURY_SHARE);
  const gift = Math.ceil(giftBase * GIFT_TIERS.standard.mult);
  const lavish = Math.ceil(giftBase * GIFT_TIERS.lavish.mult);
  const ambassador = bestAmbassador(state);
  const alreadyPosted = Boolean(kingdom.ambassadorHeroId);
  const relations = kingdom.relations ?? 50;

  // Grain scaled to the realm's own stores rather than a constant, so it stays a real decision
  // for a starving realm and never becomes a rounding error for a fat one.
  const grain = Math.max(40, Math.round(state.resources.food * 0.12));
  const aidBlocked = aidRefusal(state, kingdom);
  const buyoffBlocked = buyoffRefusal(state, kingdom);
  const buyoffTarget = hostsInTheField(state, kingdom.id)[0];
  const buyoff = buyoffTarget ? buyoffCost(state, buyoffTarget) : 0;
  const rate = exchangeRate(kingdom);
  const charter = canTrade(kingdom);

  return [
    {
      id: 'gift',
      cost: { gold: gift },
      affordable: state.resources.gold >= gift,
    },
    {
      id: 'gift-lavish',
      cost: { gold: lavish },
      affordable: state.resources.gold >= lavish,
    },
    {
      id: 'grain',
      cost: { food: grain },
      affordable: state.resources.food >= grain,
    },
    {
      id: 'trade',
      influenceCost: TRADE_INFLUENCE_COST,
      // A charter already standing is renewed rather than re-signed, so the row goes quiet.
      affordable: state.court.influence >= TRADE_INFLUENCE_COST && !charter,
    },
    // The exchange, once a charter stands. Both directions, because a realm short of grain and a
    // realm short of coin are both common and the useful one changes through a run.
    {
      id: 'exchange-buy',
      cost: { gold: rate.buy },
      affordable: charter && state.resources.gold >= rate.buy,
      blockedBy: charter ? undefined : 'no-charter',
    },
    {
      id: 'exchange-sell',
      cost: { food: 100 },
      affordable: charter && state.resources.food >= 100,
      blockedBy: charter ? undefined : 'no-charter',
    },
    // A treaty. Unreachable in this mode until now — `proposePact` was campaign-gated, so every
    // `hasPact` branch on this very card was permanently false.
    {
      id: 'pact',
      cost: { gold: Math.round(Math.max(Math.max(0, state.resourceRates.gold) * 12, state.resources.gold * PACT_TREASURY_SHARE)) },
      affordable: relations >= 60 && !hasPact(kingdom)
        && state.court.influence >= TRADE_INFLUENCE_COST,
      blockedBy: relations >= 60 ? undefined : 'standing',
    },
    // Their army, in a fight we are already losing.
    {
      id: 'aid',
      affordable: !aidBlocked,
      blockedBy: aidBlocked,
    },
    // Their army, called off a fight we are already losing.
    {
      id: 'buyoff',
      cost: { gold: buyoff },
      affordable: !buyoffBlocked && state.resources.gold >= buyoff,
      blockedBy: buyoffBlocked,
    },
    // Free, loud, and it picks a side.
    { id: 'denounce', affordable: true },
    {
      id: 'ambassador',
      heroId: ambassador?.id,
      affordable: Boolean(ambassador) && !alreadyPosted,
    },
    // Demanding a crown, or letting one go. Offered on the card the player already reaches from
    // the World lane rather than as a prompt kind of its own — the prompt budget is contended
    // enough that four kinds already fire zero times in a normal run.
    ...(kingdom.vassalage
      ? [{ id: 'release' as const, affordable: true }]
      : [{
        id: 'vassalize' as const,
        cost: { gold: vassalOathGold(state, kingdom) },
        affordable: canVassalize(state, kingdom).ok
          && state.resources.gold >= vassalOathGold(state, kingdom),
      }]),
    {
      id: 'tribute',
      // Extortion is always *possible*; whether it pays depends on how weak they are, which
      // is the gamble. Refusal costs relations and is the point of the option.
      affordable: true,
    },
    // Always takeable: the player must never be cornered on a card with no legal move.
    { id: 'ignore', affordable: true },
  ];
}

export function offerEnvoy(state: GameState): boolean {
  return offerEnvoyTo(state, pickEnvoyTarget(state)?.id);
}

/**
 * The same card for a named court — how the World lane opens a specific rival. `requested`: asked
 * for from that lane rather than raised by the director's clock.
 */
export function offerEnvoyTo(state: GameState, kingdomId: string | undefined, requested = false): boolean {
  const kingdom = state.kingdoms.find(
    (candidate) => candidate.id === kingdomId && candidate.id !== PLAYER_KINGDOM_ID && !candidate.isDefeated,
  );
  if (!kingdom) return false;

  enqueueAscentPrompt(state, {
    kind: 'envoy',
    kingdomId: kingdom.id,
    kingdomName: kingdom.name,
    relations: Math.round(kingdom.relations ?? 50),
    power: Math.round(getEmpirePower(state, kingdom)),
    options: buildEnvoyOptions(state, kingdom),
  }, { requested });
  return true;
}

/**
 * Applies an envoy action. Gift / trade / tribute are the existing `ForeignAffairsSystem`
 * functions verbatim; posting an ambassador writes the same `ambassadorHeroId` field
 * `tickGreatPowersYear` already reads to warm relations and cool war appetite each year.
 */
export function resolveEnvoy(state: GameState, kingdomId: string, optionId: string): boolean {
  const ascent = state.ascent;
  const kingdom = state.kingdoms.find((candidate) => candidate.id === kingdomId);
  if (!kingdom) return false;

  // **Understood is not the same as achieved, and only the first one closes the card.**
  //
  // `resolveAscentPrompt` puts the prompt straight back when a resolver returns false, so an
  // action the realm simply could not pay for used to leave the envoy card standing as the live
  // question for ever. The screen hides that — unaffordable rows are drawn `disabled` — but the
  // autopilot and the harnesses choose by id, and a run that picks a gift it cannot afford stalls
  // on the same card until something else displaces it. It surfaced the moment relations started
  // moving, because that is when this card began firing at a realm with an empty treasury.
  //
  // So: an id this function knows about closes the card whether or not it succeeded — the envoy
  // rode out and came back with nothing, which is an outcome. Only an id it does not recognise
  // returns false, which is the case the re-arming behaviour was written for.
  let ok = false;
  let known = true;
  switch (optionId) {
    case 'gift':
      ok = sendGift(state, kingdomId, 'standard');
      break;
    case 'gift-lavish':
      ok = sendGift(state, kingdomId, 'lavish');
      break;
    case 'grain':
      ok = sendGrain(state, kingdomId, Math.max(40, Math.round(state.resources.food * 0.12)));
      break;
    case 'trade':
      ok = proposeTrade(state, kingdomId);
      break;
    case 'exchange-buy':
      ok = tradeGrain(state, kingdomId, 'buy');
      break;
    case 'exchange-sell':
      ok = tradeGrain(state, kingdomId, 'sell');
      break;
    case 'pact':
      // The sweetener is the price quoted on the card; `proposePact` still has to be accepted,
      // which is what keeps a treaty something the other side agrees to rather than something
      // bought outright.
      ok = proposePact(state, kingdomId, Math.round(Math.max(0, state.resourceRates.gold) * 12));
      break;
    case 'aid':
      ok = callForAid(state, kingdomId);
      break;
    case 'buyoff':
      ok = buyOffHost(state, kingdomId);
      break;
    case 'denounce':
      ok = denounce(state, kingdomId);
      break;
    case 'tribute':
      ok = demandTribute(state, kingdomId);
      break;
    case 'vassalize': {
      const price = vassalOathGold(state, kingdom);
      if (canVassalize(state, kingdom).ok && state.resources.gold >= price) {
        state.resources.gold -= price;
        ok = grantVassalage(state, kingdom, 'envoy');
      }
      break;
    }
    case 'release':
      breakVassalage(state, kingdom, 'released');
      ok = true;
      break;
    case 'ambassador': {
      const hero = bestAmbassador(state);
      if (hero && !kingdom.ambassadorHeroId) {
        kingdom.ambassadorHeroId = hero.id;
        hero.assignedTo = `ambassador:${kingdom.id}`;
        pushToast(state, t('ascent.envoy.posted', { hero: heroName(hero), kingdom: kingdom.name }), 'milestone');
        ok = true;
      }
      break;
    }
    case 'ignore':
      ok = true;
      break;
    default:
      known = false;
      break;
  }

  if (!ok && known) {
    state.message = t('ascent.envoy.nothingCameOfIt', { kingdom: kingdom.name });
  }

  if (ok && ascent) {
    ascent.laneStats.envoyActions[optionId] = (ascent.laneStats.envoyActions[optionId] ?? 0) + 1;
    ascent.laneState.lastDecisionTurn.world = state.turn;
  }
  return known;
}

/** Card-ready numbers for one envoy option, so the modal never invents its own maths. */
export function envoyOptionDetail(state: GameState, kingdom: Kingdom, option: EnvoyOption): string {
  // Why it cannot be taken comes first, and names the standing it wanted. An option that simply
  // greys out teaches nothing; one that says what a warmer neighbour would have been worth is the
  // argument this mode has to make for diplomacy being worth the gold.
  switch (option.blockedBy) {
    case 'standing':
      return t('ascent.envoy.pactNeeds', {
        n: option.id === 'aid' ? ALLY_AID_MIN_RELATIONS
          : option.id === 'buyoff' ? BUYOFF_MIN_RELATIONS : 60,
      });
    case 'cooling': return t('ascent.envoy.aidCooling');
    case 'no-battle': return t('ascent.envoy.aidNeeds', { n: ALLY_AID_MIN_RELATIONS });
    case 'no-host': return t('ascent.envoy.buyoffNeeds', { n: BUYOFF_MIN_RELATIONS });
    case 'no-charter': return t('ascent.envoy.exchangeNeeds');
    default: break;
  }

  switch (option.id) {
    case 'gift':
      return t('ascent.envoy.giftFx', { gain: giftOpinionGain(kingdom) });
    case 'gift-lavish':
      return t('ascent.envoy.giftFx', {
        gain: Math.round(giftOpinionGain(kingdom) * GIFT_TIERS.lavish.gain),
      });
    case 'grain': {
      // Says *why* it is worth more here, which is the only way the four courts having different
      // economies is visible rather than merely true.
      const hungry = (kingdom.stability ?? 50) < 40;
      return hungry ? t('ascent.envoy.grainHungry') : t('ascent.envoy.grainFx');
    }
    case 'exchange-buy': {
      const rate = exchangeRate(kingdom);
      return t('ascent.envoy.exchangeBuy', { food: 100, gold: rate.buy });
    }
    case 'exchange-sell': {
      const rate = exchangeRate(kingdom);
      return t('ascent.envoy.exchangeSell', { food: 100, gold: rate.sell });
    }
    case 'pact':
      return t('ascent.envoy.pactFx');
    case 'aid': {
      const battle = battleNeedingRelief(state);
      const land = state.lands.find((candidate) => candidate.id === battle?.landId);
      return t('ascent.envoy.aidFx', { land: land?.name ?? '' });
    }
    case 'buyoff': {
      const record = hostsInTheField(state, kingdom.id)[0];
      return t('ascent.envoy.buyoffFx', { gold: record ? buyoffCost(state, record) : 0 });
    }
    case 'denounce': {
      const partner = state.kingdoms.find((k) => k.id === kingdom.feudWith && !k.isDefeated);
      return partner
        ? t('ascent.envoy.denounceFx', { kingdom: partner.name })
        : t('ascent.envoy.denounceFxAlone', { kingdom: kingdom.name });
    }
    case 'trade':
      return t('ascent.envoy.tradeFx');
    case 'ambassador': {
      const hero = state.heroes.find((candidate) => candidate.id === option.heroId);
      return kingdom.ambassadorHeroId
        ? t('ascent.envoy.ambassadorPosted')
        : hero
          ? t('ascent.envoy.ambassadorFx', { hero: heroName(hero) })
          : t('ascent.envoy.ambassadorNone');
    }
    case 'tribute':
      return t('ascent.envoy.tributeFx', { fear: Math.round(getFear(state, kingdom)) });
    case 'ignore':
    default:
      return t('ascent.envoy.ignoreFx');
  }
}
