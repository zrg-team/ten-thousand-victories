import { PLAYER_KINGDOM_ID } from '../../../game/constants';
import { canSpend } from '../../../systems/ResourceSystem';
import { storyText } from '../../../i18n/story';
import { announce, routInvaders, windfall } from '../../../systems/story/effects';
import type { ActiveStory, GameState, ResourceBag } from '../../../state/types';
import type { StoryCtx } from '../../../systems/story/types';
import { ASK, ASKS, ASK_STORES, SPOILS_RETURN, type AskStore } from './tuning';

/**
 * The machinery under the cards: what X is, what each ask costs, what the realm has given, and
 * the ride that pays it back. The story files read these; none of them compute a price themselves.
 */

export type AskName = keyof typeof ASKS;

function askNow(state: GameState, store: AskStore): number {
  const stock = Math.max(0, state.resources[store]);
  const gross = Math.max(0, state.ascentLedger?.[store]?.gross ?? 0);
  return Math.max(ASK.floor[store], Math.round(stock * ASK.share), Math.round(gross * ASK.seasons));
}

/** The locked X for a store, or today's figure for a story that was standing here before the lock existed. */
function xOf(state: GameState, story: ActiveStory, store: AskStore): number {
  return story.memory[`x_${store}`] || askNow(state, store);
}

/** Fixes X against the stores the realm holds on the day it chooses to ask the people. */
export function lockAsk(ctx: StoryCtx): void {
  for (const store of ASK_STORES) ctx.remember(`x_${store}`, askNow(ctx.state, store));
  nameTheInvader(ctx);
}

/**
 * Binds the invading crown when the story has none, so `{rival}` never prints as a gap. The seed always
 * binds one; a story carried over from a save made before it did, would otherwise read "Giặc  vừa…".
 */
export function nameTheInvader(ctx: StoryCtx): void {
  if (ctx.story.cast.kingdomId) return;
  const kingdomId = invadingKingdom(ctx.state);
  if (!kingdomId) return;
  ctx.story.cast.kingdomId = kingdomId;
  ctx.story.names = { ...(ctx.story.names ?? {}), rival: ctx.state.kingdoms.find((k) => k.id === kingdomId)?.name };
}

/**
 * The price of one ask, as a `StoryOption.price`. Read from the locked X, so the second ask is
 * exactly twice the first whatever the treasury has done in between.
 */
export function priceOf(name: AskName): (state: GameState, story: ActiveStory) => Partial<ResourceBag> {
  return (state, story) => {
    const bag: Partial<ResourceBag> = {};
    for (const [store, times] of Object.entries(ASKS[name]) as [AskStore, number][]) {
      bag[store] = xOf(state, story, store) * times;
    }
    return bag;
  };
}

/** Whether the realm can pay an ask right now — the gate on its card, and on the waiting whisper. */
export function canAfford(ctx: StoryCtx, name: AskName): boolean {
  return canSpend(ctx.state, priceOf(name)(ctx.state, ctx.story));
}

/** Books what an answered ask actually took, so the ride can return it. Call from the option's `apply`. */
export function gave(ctx: StoryCtx): void {
  for (const store of ASK_STORES) {
    const amount = ctx.paid?.[store] ?? 0;
    if (amount > 0) ctx.bump(`gave_${store}`, amount);
  }
}

export function invadersOnOurSoil(ctx: StoryCtx): boolean {
  return (ctx.state.invasions?.length ?? 0) > 0;
}

/** The kingdom whose hosts are on the map in the greatest numbers, or any crown still standing. */
export function invadingKingdom(state: GameState): string | undefined {
  const counts = new Map<string, number>();
  for (const record of state.invasions ?? []) {
    const army = state.armies.find((candidate) => candidate.id === record.armyId);
    const size = army ? army.units.spearmen + army.units.archers + army.units.heavyInfantry : 0;
    counts.set(record.kingdomId, (counts.get(record.kingdomId) ?? 0) + size);
  }
  const strongest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return strongest ?? state.kingdoms.find((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated)?.id;
}

/** The ride: the whole invasion broken, and what the realm gave him returned out of their baggage. */
export function ride(ctx: StoryCtx): void {
  nameTheInvader(ctx);
  const slain = routInvaders(ctx, 1);
  const back: Partial<ResourceBag> = {};
  for (const store of ASK_STORES) {
    const amount = Math.round(ctx.recall(`gave_${store}`) * SPOILS_RETURN);
    if (amount > 0) back[store] = amount;
  }
  if (Object.keys(back).length > 0) windfall(ctx, back);
  ctx.remember('rode', 1);
  ctx.remember('slain', slain);
  announce(ctx, storyText('thanh-giong.he-rides.toast', {
    count: slain.toLocaleString('en-US'),
    land: ctx.land()?.name ?? '',
  }), 'reward');
}
