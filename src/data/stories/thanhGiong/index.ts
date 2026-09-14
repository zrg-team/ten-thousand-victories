import { pick, playerLands } from '../../../systems/story/StorySystem';
import type { StoryTemplate } from '../../../systems/story/types';
import { invadingKingdom } from './asks';
import { RECORD_FRAGMENTS, RECORD_NODES } from './record';
import { REFUSAL_FRAGMENTS, REFUSAL_NODES } from './refusals';
import { GATE_RATIO, MIN_TURN, SEED_CHANCE, SEED_WEIGHT } from './tuning';
import { WITHOUT_MIRACLE_FRAGMENTS, WITHOUT_MIRACLE_NODES } from './withoutMiracle';

/**
 * Thánh Gióng — Phù Đổng Thiên Vương.
 *
 * A three-year-old at Phù Đổng who could neither walk nor speak sat up when the king's herald came
 * through the villages calling for anyone who could save the country. He asked for rice, then for
 * twice the rice, and the whole country cooked for him; then he asked for an iron horse, an iron
 * rod and iron armour, grew into a giant, rode through the invaders until there were none, and went
 * up Sóc Sơn and did not come down.
 *
 * ## One question asked four times: do you trust the people?
 *
 * - **the gate** — seeds only when the invasion outweighs the realm by `GATE_RATIO`, and even then
 *   only on a `SEED_CHANCE` roll, at most once a run. A miracle that turns up whenever the realm is
 *   losing is a mechanic; this one is a rumour you might never hear.
 * - **the call** — the court sends heralds to ask the people, or fights with what it has.
 * - **the asks** — X grain and X goods, then 2X and 2X, then 3X gold for horse, rod and armour. X is
 *   locked when the heralds go out, from what this realm holds and earns (`asks.ts`), and each card
 *   waits until the realm can actually pay it.
 * - **the people** — between the second ask and the third, the whole country feeds him and every
 *   province's loyalty rises, because it was their rice too.
 * - **the payoff** — he rides when invaders stand on our soil and destroys every host of them, paid
 *   as if each had been beaten; their abandoned baggage returns what the realm gave; Sóc Sơn leaves
 *   a shrine, a realm-wide loyalty floor and an echo.
 *
 * Stopping halfway is the sting: the further the realm went, the more refusing costs (`refusals.ts`).
 *
 * ## Where things live
 *
 * | File | Holds |
 * |---|---|
 * | `tuning.ts` | every balance number — gate, seed chance, X, the asks' multiples, payoff, patience |
 * | `asks.ts` | X, the price of each ask, what was given, and the ride |
 * | `record.ts` | the historical path, node by node |
 * | `refusals.ts` | one branch per refused ask |
 * | `withoutMiracle.ts` | the court never asks the people |
 * | `src/i18n/story/thanhGiong/` | the words, split the same way |
 * | `src/ui/storyMomentAssets.json` | the pictures for the key moments |
 *
 * **To add an ask:** a row in `ASKS` (`tuning.ts`), a node and a card in `record.ts` that uses
 * `priceOf`/`canAfford`/`gave`, a refusal branch in `refusals.ts` with two endings, and its text.
 * `verify-story-wager.mjs` walks every path and `storyViolations` checks the graph.
 *
 * ## Save contract
 *
 * Node and fragment ids are append-only: a save holds them. The record's nodes and the refusal
 * branches kept from the earlier version keep their ids. Branches that no longer exist (the court,
 * the temple bell, the fed-never-armed giant) are dropped: a save standing in one has nothing that
 * can speak there, so it goes dry and retires quietly. Their text stays in `legacy.ts` so an ending
 * already in `state.chronicle` still reads.
 */
export const thanhGiong: StoryTemplate = {
  id: 'thanh-giong',
  seedWeight: SEED_WEIGHT,
  // Asked on its own every seeding tick: the draw would almost never pick it at the moment its gate is open.
  omen: true,
  minTurn: MIN_TURN,

  pressure: (ctx) => {
    if (ctx.recall('rode') >= 1) return undefined;
    if (ctx.recall('forged') >= 1) return 'san-sang';
    if (ctx.recall('grown') >= 1) return 'cao-hon-cua';
    if (ctx.recall('fed') >= 1) return 'an-mot-lan';
    if (ctx.recall('herald') >= 1) return 'chua-an';
    return undefined;
  },

  regard: (ctx) => {
    if (ctx.recall('rode') >= 1) return 'gone';
    if (ctx.recall('grown') >= 1) return 'rising';
    if (ctx.recall('fed') >= 1) return 'fed';
    if (ctx.recall('refused') >= 1) return 'unanswered';
    return undefined;
  },

  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent) return undefined;
    // The gate. Only an invasion that outweighs the realm by half again is answered by a miracle.
    if (ascent.threat <= ascent.defensePower * GATE_RATIO) return undefined;
    if (Math.random() >= SEED_CHANCE) return undefined;
    const village = pick(playerLands(state).filter((land) => land.hasVillage));
    return village ? { landId: village.id, kingdomId: invadingKingdom(state) } : undefined;
  },

  entry: 'tin-giac',
  nodes: [...RECORD_NODES, ...REFUSAL_NODES, ...WITHOUT_MIRACLE_NODES],
  fragments: [...RECORD_FRAGMENTS, ...REFUSAL_FRAGMENTS, ...WITHOUT_MIRACLE_FRAGMENTS],
};
