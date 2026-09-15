import { isCampaignMode, PLAYER_KINGDOM_ID } from '../game/constants';
import {
  addOpinionModifier, applyEnvy, breakPact, getFear, giftCost, giftOpinionGain, hasPact, tickDiplomacy,
} from './DiplomacySystem';
import type { CampaignEvent, GameState, Kingdom, KingdomPersonality } from '../state/types';
import { t } from '../i18n';

const ROYAL_NAMES = [
  // The neighbours' rulers, never the player's own history: reported as *those enemies must not
  // be Vietnamese kingdoms*. Northern courts, Chăm kings, Khmer and Lao and Tai rulers.
  'Lưu Cung', 'Triệu Quang Nghĩa', 'Thoát Hoan', 'Trương Phụ', 'Tôn Sĩ Nghị', 'Liễu Thăng',
  'Chế Bồng Nga', 'Chế Mân', 'Chế Củ', 'Harivarman', 'Indravarman',
  'Jayavarman', 'Suryavarman', 'Fa Ngum', 'Phra Naret', 'Setthathirath',
];

const PERSONALITY_LABELS: Record<KingdomPersonality, string> = {
  player: 'neutral',
  aggressive: 'warlike',
  defensive: 'cautious',
  economic: 'mercantile',
  diplomatic: 'conciliatory',
  expansionist: 'ambitious',
};

function pickRoyalName(): string {
  return ROYAL_NAMES[Math.floor(Math.random() * ROYAL_NAMES.length)];
}

function pickRandomPersonality(): KingdomPersonality {
  const options: KingdomPersonality[] = ['aggressive', 'defensive', 'economic', 'diplomatic', 'expansionist'];
  return options[Math.floor(Math.random() * options.length)];
}

function isKingdomWeak(kingdom: Kingdom, state: GameState): boolean {
  const ownedCount = state.lands.filter((l) => l.ownerId === kingdom.id).length;
  // Off-map empires hold no districts; judge weakness by relations instead of land count.
  if (ownedCount === 0) {
    return (kingdom.relations ?? 50) < 40;
  }
  const playerCount = state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID).length;
  return ownedCount < playerCount * 0.6;
}

function scheduleDynastyAttack(state: GameState, kingdomId: string): void {
  const id = `dynasty-attack-${kingdomId}-${state.turn}`;
  const event: CampaignEvent = {
    id,
    type: 'dynasty-attack',
    scheduledTick: state.turn + 1,
    sourceKingdomId: kingdomId,
    resolved: false,
  };
  state.scheduledCampaignEvents.push(event);
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  state.message = t('msg.newKingAggressive', { kingdom: kingdom?.name ?? kingdomId });
}

/**
 * Which modes let the player act on a foreign court. Dragon Ascent runs the same off-map
 * empires as Throne of Empires and surfaces them through its Envoy card, so it is admitted
 * here; `tickForeignAffairs` itself stays campaign-only because ascent drives succession and
 * war appetite through its own wave director instead.
 */
function canConductForeignAffairs(mode: string): boolean {
  return isCampaignMode(mode) || mode === 'ascent';
}

export function tickForeignAffairs(state: GameState): void {
  if (!isCampaignMode(state.gameMode)) return;

  // Decay temporary opinion modifiers + gift fatigue, then drift toward each empire's baseline.
  tickDiplomacy(state);

  for (const kingdom of state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) continue;
    if (!kingdom.king) continue;

    kingdom.king.age += 1;
    const deathChance = 0.004 + kingdom.king.age * 0.0006;

    if (Math.random() < deathChance) {
      const newPersonality = pickRandomPersonality();
      kingdom.king = { name: pickRoyalName(), personality: newPersonality, age: 0 };

      if (newPersonality === 'aggressive' || newPersonality === 'expansionist') {
        // A warlike successor inflames war appetite rather than a fixed timer.
        kingdom.warAppetite = Math.min(100, (kingdom.warAppetite ?? 0) + 30);
        state.message = t('msg.newKingAggressive', { kingdom: kingdom.name });
      } else {
        state.message = t('msg.newKingPeaceful', {
          kingdom: kingdom.name,
          personality: PERSONALITY_LABELS[newPersonality],
        });
      }
    }

    escalateWarAppetite(state, kingdom);
  }
}

function personalityAggression(personality: KingdomPersonality): number {
  switch (personality) {
    case 'aggressive': return 1.4;
    case 'expansionist': return 0.9;
    case 'economic': return -0.4;
    case 'diplomatic': return -1.2;
    case 'defensive': return -0.2;
    default: return 0;
  }
}

/**
 * Drives the escalation ladder: war appetite rises with low opinion + low fear +
 * a warlike temperament, and falls with friendship, deterrence, or a pact. When it
 * tops out the empire launches an invasion (the consequence of failed diplomacy).
 */
function escalateWarAppetite(state: GameState, kingdom: Kingdom): void {
  const opinion = kingdom.relations ?? 50;
  const fear = getFear(state, kingdom);
  let delta = personalityAggression(kingdom.personality);

  if (hasPact(kingdom)) {
    delta -= 5; // a standing pact rapidly cools aggression
  } else {
    if (opinion < 30) delta += 3;
    else if (opinion < 45) delta += 1.5;
    else if (opinion > 65) delta -= 2;
    else delta -= 0.5;

    if (fear < 25) delta += 2;
    else if (fear > 60) delta -= 2;
  }

  kingdom.warAppetite = Math.max(0, Math.min(100, (kingdom.warAppetite ?? 0) + delta));

  const pendingAttack = state.scheduledCampaignEvents.some(
    (e) => e.type === 'dynasty-attack' && e.sourceKingdomId === kingdom.id && !e.resolved,
  );
  // Telegraph: a brewing host shows the ⚠ threat marker.
  kingdom.hostilityTimer = !hasPact(kingdom) && kingdom.warAppetite >= 70 ? 1 : 0;

  if (kingdom.warAppetite >= 100 && !hasPact(kingdom) && !pendingAttack) {
    scheduleDynastyAttack(state, kingdom.id);
    kingdom.warAppetite = 30; // cool down after committing to war
  }
}

/**
 * How much a gift is, and what it therefore buys.
 *
 * A dial rather than a constant, because a single flat gift is not a decision. `lavish` costs four
 * times `token` and buys a little over twice as much standing — deliberately sub-linear, so
 * emptying the treasury on one court is generous rather than optimal, and the player has a reason
 * to think about *which* court instead of only *whether*.
 */
export const GIFT_TIERS = {
  token: { mult: 1, gain: 0.6 },
  standard: { mult: 2, gain: 1 },
  lavish: { mult: 4, gain: 1.55 },
} as const;
export type GiftTier = keyof typeof GIFT_TIERS;

export function sendGift(state: GameState, kingdomId: string, tier: GiftTier = 'standard', quotedCost?: number): boolean {
  if (!canConductForeignAffairs(state.gameMode)) return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;

  const band = GIFT_TIERS[tier] ?? GIFT_TIERS.standard;
  // A card that quoted its own price (the Ascent envoy floors a gift at a share of the treasury)
  // charges that price; without one, the classic price.
  const cost = quotedCost ?? Math.ceil(giftCost(kingdom, state) * band.mult);
  if (state.resources.gold < cost) {
    state.message = t('diplo.giftNoGold', { cost });
    return false;
  }
  state.resources.gold -= cost;
  const gain = Math.max(1, Math.round(giftOpinionGain(kingdom) * band.gain));
  addOpinionModifier(kingdom, {
    id: `gift-${state.turn}-${Math.floor(Math.random() * 100000)}`,
    label: t('diplo.mod.gift'),
    value: gain,
    decay: 1.1,
    source: 'gift',
  });
  // And the court they feud with hears about it.
  applyEnvy(state, kingdom, gain);
  kingdom.giftFatigue = (kingdom.giftFatigue ?? 0) + 1;
  state.message = t('diplo.gift', { kingdom: kingdom.name, gain });
  return true;
}

/**
 * Grain, and it is worth most to a court that needs it.
 *
 * The point of a second currency here is that the four courts stop differing only by a number.
 * A realm whose `stability` has collapsed is hungry, and rice buys standing there that no amount
 * of gold would; a stable economic power takes the shipment politely and remembers little. It
 * gives the player a reason to read the World lane rather than the relations figure alone.
 */
export function sendGrain(state: GameState, kingdomId: string, food: number): boolean {
  if (!canConductForeignAffairs(state.gameMode)) return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;
  if (state.resources.food < food || food <= 0) return false;

  state.resources.food -= food;
  // 0 at full stability, 1 at collapse. Squared, so only real hunger pays the premium.
  const hunger = Math.min(1, Math.max(0, (60 - (kingdom.stability ?? 50)) / 60)) ** 2;
  const gain = Math.max(2, Math.round((6 + hunger * 20) * (1 - Math.min(0.6, (kingdom.giftFatigue ?? 0) * 0.12))));
  addOpinionModifier(kingdom, {
    id: `grain-${state.turn}-${Math.floor(Math.random() * 100000)}`,
    label: t('diplo.mod.grain'),
    value: gain,
    decay: 0.9,
    source: 'gift',
  });
  applyEnvy(state, kingdom, gain);
  kingdom.giftFatigue = (kingdom.giftFatigue ?? 0) + 1;
  state.message = t('diplo.grain', { kingdom: kingdom.name, gain });
  return true;
}

/**
 * Say publicly that one court is in the wrong — free, loud, and it picks a side.
 *
 * The cheapest instrument on the sheet and the only one that costs no resource at all, because
 * what it spends is the relationship itself. It exists so that *choosing* enemies is an available
 * move rather than something that only happens to the player: a court you were never going to
 * appease can be spent to buy the one that hates it.
 */
export function denounce(state: GameState, kingdomId: string): boolean {
  if (!canConductForeignAffairs(state.gameMode)) return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;

  addOpinionModifier(kingdom, {
    id: `denounced-${state.turn}`,
    label: t('diplo.mod.denounced'),
    value: -25,
    decay: 0.3,
    source: 'reputation',
  });
  const partner = state.kingdoms.find((k) => k.id === kingdom.feudWith && !k.isDefeated);
  if (partner) {
    addOpinionModifier(partner, {
      id: `denounced-their-rival-${state.turn}`,
      label: t('diplo.mod.tookOurSide'),
      value: 12,
      decay: 0.4,
      source: 'reputation',
    });
  }
  state.message = t('diplo.denounce', { kingdom: kingdom.name });
  return true;
}

/** Id of the standing charter a trade agreement writes. The exchange gates on this. */
export const TRADE_CHARTER_ID = 'trade-charter';

export function proposeTrade(state: GameState, kingdomId: string): boolean {
  if (!canConductForeignAffairs(state.gameMode)) return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;
  if (state.court.influence < 10) {
    state.message = t('diplo.tradeNoInfluence');
    return false;
  }
  state.court.influence -= 10;
  state.resources.gold += 20;
  // **Standing, not decaying.** A charter is a thing that is either in force or is not, and the
  // exchange (see `CourtBargains.canTrade`) reads exactly this. `addOpinionModifier` replaces a
  // standing modifier of the same id rather than stacking it, so signing twice is not a stacking
  // exploit — it renews.
  const charter = state.gameMode === 'ascent';
  addOpinionModifier(kingdom, {
    id: charter ? TRADE_CHARTER_ID : `trade-${state.turn}-${Math.floor(Math.random() * 100000)}`,
    label: t('diplo.mod.trade'),
    value: 8,
    // Standing in ascent, where it gates the exchange; decaying elsewhere, as it always was.
    decay: charter ? undefined : 0.7,
    source: 'trade',
  });
  applyEnvy(state, kingdom, 8);
  state.message = t('diplo.trade', { kingdom: kingdom.name });
  return true;
}

export function demandTribute(state: GameState, kingdomId: string): boolean {
  if (!canConductForeignAffairs(state.gameMode)) return false;
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId);
  if (!kingdom || kingdom.isDefeated) return false;

  // Extorting a treaty partner is a hostile act that breaks the pact (our fault).
  if (hasPact(kingdom)) {
    breakPact(state, kingdomId, true);
  }

  if (isKingdomWeak(kingdom, state)) {
    state.resources.gold += 40;
    addOpinionModifier(kingdom, {
      id: `tribute-${state.turn}-${Math.floor(Math.random() * 100000)}`,
      label: t('diplo.mod.tribute'),
      value: -18,
      decay: 0.5,
      source: 'tribute',
    });
    state.message = t('diplo.tributePaid', { kingdom: kingdom.name });
  } else {
    addOpinionModifier(kingdom, {
      id: `tribute-refused-${state.turn}-${Math.floor(Math.random() * 100000)}`,
      label: t('diplo.mod.tributeRefused'),
      value: -28,
      decay: 0.4,
      source: 'tribute',
    });
    kingdom.hostilityTimer = Math.max(0, Math.floor((kingdom.hostilityTimer ?? 0) / 2));
    state.message = t('diplo.tributeRefused', { kingdom: kingdom.name });
  }
  return true;
}
