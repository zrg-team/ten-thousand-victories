/**
 * The last word before the ledger dissolves a host (Dragon Ascent).
 *
 * **Reported:** a host broke up on the road — "Cấm Quân đã tan rã … 93 quân vẫn còn đứng vững" —
 * while the realm sat on 1.2k grain, 1.1k goods and 2.0k gold. The card told the player what had
 * already happened and offered one button, *So be it*. On a hands-on run (`ascent.hardcore`, the
 * default) the autopilot's `autoResupply` never runs, so a host away from home eats its baggage and
 * starves however full the granaries are; the only lever was *Resupply now*, three screens deep on
 * the Army sheet, and two toasts were the only notice that it was needed.
 *
 * So the breaking point asks first. When a host with men still standing would be dissolved for
 * starvation, spent morale or arrears, and the realm can bear the price, it is held and the
 * `host-lost` card carries a rescue offer: fill the baggage, pay what it is owed, rally the ranks —
 * or let it go home. A realm that cannot bear the price loses the host exactly as before, and the
 * card says what keeping it would have cost.
 *
 * The price is per head and wears the realm's price scale like every other routine cost
 * (`scaledCost`): the founding pays the base, a rich realm pays a rich realm's price. Arrears are
 * owed in coin, and a treasury too thin to pay them in coin pays the rest in goods at the in-kind
 * wage rate (`KIND_GOODS_PER_GOLD`) — a broke realm with full storehouses can still keep its host,
 * which is the whole of the report.
 *
 * Leaf module: no WarSystem import, so the logistics tick and the resolver can both reach it.
 */
import {
  HOST_RESCUE_FOOD_PER_SOLDIER,
  HOST_RESCUE_GOLD_FLOOR,
  HOST_RESCUE_GOLD_PER_SOLDIER,
  HOST_RESCUE_MORALE,
  HOST_RESCUE_SUPPLIES_PER_SOLDIER,
  KIND_GOODS_PER_GOLD,
  SUPPLY_TICKS_HELD,
} from '../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { formatResourceList, t } from '../../i18n';
import type { Army, GameState, ResourceBag } from '../../state/types';
import { applyResourceDelta, ascentArmyUpkeep, getPlayerTroops } from '../ResourceSystem';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { scaledCost } from './priceScale';

export type HostLossReason = 'unpaid' | 'starved' | 'broken';

export interface HostRescueQuote {
  cost: Partial<ResourceBag>;
  affordable: boolean;
}

function men(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

/** What relieving this host costs right now, read from live state. */
export function hostRescueQuote(state: GameState, army: Army): HostRescueQuote {
  const total = Math.max(1, men(army));
  // The same full baggage `resupplyPreview` and `autoResupply` keep to.
  const wantRations = Math.max(1, Math.ceil(total / 100)) * SUPPLY_TICKS_HELD;
  const wantProvisions = Math.max(1, Math.ceil(total / 150)) * SUPPLY_TICKS_HELD;
  const baggageFood = Math.max(0, wantRations - army.rations);
  const baggageSupplies = Math.max(0, wantProvisions - army.provisions);

  // Arrears: this host's share of the season's wage bill, the figure `settleWagesInKind` bills,
  // for every season it has gone unpaid.
  const unpaid = army.unpaidTicks ?? 0;
  const bill = ascentArmyUpkeep(state);
  const share = bill.gold * (total / Math.max(1, getPlayerTroops(state)));
  const arrears = unpaid > 0 ? Math.ceil(Math.max(1, share) * unpaid) : 0;

  const scaled = scaledCost(state, {
    gold: Math.max(HOST_RESCUE_GOLD_FLOOR, Math.ceil(total * HOST_RESCUE_GOLD_PER_SOLDIER)) + arrears,
    food: baggageFood + Math.ceil(total * HOST_RESCUE_FOOD_PER_SOLDIER),
    supplies: baggageSupplies + Math.ceil(total * HOST_RESCUE_SUPPLIES_PER_SOLDIER),
  });

  // Coin the treasury does not hold is paid in goods at the wage-in-kind rate.
  let gold = scaled.gold ?? 0;
  let supplies = scaled.supplies ?? 0;
  const food = scaled.food ?? 0;
  const held = Math.max(0, Math.floor(state.resources.gold));
  if (gold > held) {
    supplies += Math.ceil((gold - held) * KIND_GOODS_PER_GOLD);
    gold = held;
  }
  const cost: Partial<ResourceBag> = {};
  if (gold > 0) cost.gold = gold;
  if (food > 0) cost.food = food;
  if (supplies > 0) cost.supplies = supplies;
  const affordable = state.resources.gold >= gold
    && state.resources.food >= food
    && state.resources.supplies >= supplies;
  return { cost, affordable };
}

/** The rescue card standing for this host, queued or on screen. */
function standingOffer(state: GameState, armyId: string): boolean {
  const offers = (prompt: GameState['pendingAscentPrompt']): boolean =>
    prompt?.kind === 'host-lost' && prompt.rescue?.armyId === armyId;
  return offers(state.pendingAscentPrompt) || (state.ascent?.promptQueue ?? []).some(offers);
}

/**
 * Called by the logistics tick at the moment a host would be dissolved. Returns true when the
 * host is to be held for the player's answer this season.
 *
 * Held only while its card actually stands. A host whose card was dropped (the per-kind queue cap,
 * a harness clearing the queue) is not re-offered — it dissolves as it always did — so nothing can
 * ping-pong a card in and out of the queue every season.
 */
export function holdForRescue(state: GameState, army: Army, reason: HostLossReason): boolean {
  if (state.gameMode !== 'ascent' || !state.ascent) return false;
  if (army.kingdomId !== PLAYER_KINGDOM_ID || men(army) <= 0) return false;
  if (standingOffer(state, army.id)) return true;
  if (army.rescueOffered) return false;
  const quote = hostRescueQuote(state, army);
  if (!quote.affordable) return false;
  enqueueAscentPrompt(state, {
    kind: 'host-lost',
    armyName: army.name,
    reason,
    men: men(army),
    rescue: { armyId: army.id, cost: quote.cost },
  });
  if (!standingOffer(state, army.id)) return false;
  army.rescueOffered = true;
  pushToast(state, t('ascent.hostRescue.toast', { army: army.name }), 'threat');
  return true;
}

/**
 * Pays for the relief and puts the host back on its feet. Priced again from live state: the card
 * may have stood while the stores moved. Returns a reason when it cannot.
 */
export function relieveHost(state: GameState, armyId: string): { ok: boolean; reason?: string } {
  const army = state.armies.find((candidate) => candidate.id === armyId && candidate.kingdomId === PLAYER_KINGDOM_ID);
  if (!army || men(army) <= 0) return { ok: false };
  const quote = hostRescueQuote(state, army);
  if (!quote.affordable) return { ok: false, reason: t('ascent.response.cantAfford') };

  applyResourceDelta(state, {
    gold: -(quote.cost.gold ?? 0),
    food: -(quote.cost.food ?? 0),
    supplies: -(quote.cost.supplies ?? 0),
  });
  const total = men(army);
  army.rations = Math.max(army.rations, Math.max(1, Math.ceil(total / 100)) * SUPPLY_TICKS_HELD);
  army.provisions = Math.max(army.provisions, Math.max(1, Math.ceil(total / 150)) * SUPPLY_TICKS_HELD);
  army.morale = Math.max(army.morale, HOST_RESCUE_MORALE);
  army.starvingTicks = 0;
  army.unpaidTicks = 0;
  army.rescueOffered = undefined;
  pushToast(state, t('ascent.hostRescue.done', {
    army: army.name,
    cost: formatResourceList(quote.cost),
  }), 'reward');
  return { ok: true };
}
