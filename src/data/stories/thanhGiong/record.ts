import { playerLands } from '../../../systems/story/StorySystem';
import { leaveEcho, loyaltyFloor, monument } from '../../../systems/story/effects';
import type { StoryFragment, StoryNode } from '../../../systems/story/types';
import { canAfford, gave, invadersOnOurSoil, lockAsk, priceOf, ride, type AskName } from './asks';
import { PATIENCE, PEOPLE_LOYALTY, REALM_LOYALTY_FLOOR, SHRINE } from './tuning';

/**
 * The record: a kingdom attacks → the court asks the people → the child asks for X → for 2X → the
 * whole country feeds him → he asks for 3X gold → he rides when they stand on our soil → Sóc Sơn.
 *
 * Each ask is a node holding one card, and the card only comes once the realm can pay it
 * (`canAfford`); until then `no-van-nam-doi` is what the wait sounds like. Refusing an ask leaves
 * the record for the branch in `refusals.ts` that belongs to how far the realm had gone.
 */

export const RECORD_NODES: StoryNode[] = [
  { id: 'tin-giac', historicity: 'chinh-su', patience: PATIENCE.call, onIgnored: 'khong-goi' },
  { id: 'su-gia', historicity: 'chinh-su', patience: PATIENCE.ask, onIgnored: 'khong-tin' },
  { id: 'xin-lan-hai', historicity: 'chinh-su', patience: PATIENCE.ask, onIgnored: 'bo-do' },
  { id: 'ca-lang-gop', historicity: 'chinh-su', patience: PATIENCE.people, onIgnored: 'ren-sat' },
  { id: 'ren-sat', historicity: 'chinh-su', patience: PATIENCE.ask, onIgnored: 'tay-khong' },
  { id: 'ra-tran', historicity: 'chinh-su', patience: PATIENCE.ride, onIgnored: 'soc-son' },
  { id: 'soc-son', historicity: 'chinh-su', terminal: true },
];

/** Which ask each asking node holds. */
const ASK_AT: Record<string, AskName> = { 'su-gia': 'first', 'xin-lan-hai': 'second', 'ren-sat': 'third' };

export const RECORD_FRAGMENTS: StoryFragment[] = [
  // ══ tin-giac — a kingdom attacks, and the court asks the people ════════
  {
    id: 'giac-an-qua-vu-ninh',
    volume: 'whisper',
    in: ['tin-giac'],
    weight: 6,
    quiet: 0,
    tone: 'threat',
    salience: () => 6,
  },
  {
    id: 'ba-ban-tin-khong-khop',
    volume: 'whisper',
    in: ['tin-giac'],
    weight: 4,
    quiet: 2,
  },
  {
    id: 'loi-keu-goi',
    volume: 'card',
    band: 'court',
    in: ['tin-giac'],
    weight: 9,
    quiet: 2,
    salience: (ctx) => (ctx.said('giac-an-qua-vu-ninh') ? 10 : -20),
    options: [
      {
        id: 'sai-su-gia',
        historicity: 'annal',
        to: 'su-gia',
        apply: (ctx) => {
          ctx.remember('herald', 1);
          lockAsk(ctx);
        },
      },
      {
        id: 'ta-co-quan-roi',
        historicity: 'divergent',
        to: 'khong-goi',
        apply: (ctx) => { ctx.remember('refused', 1); ctx.heat(2); },
      },
    ],
  },

  // ══ su-gia — the child who cannot walk or talk, and the first ask ══════
  {
    id: 'a-child-who-has-never-spoken',
    volume: 'whisper',
    in: ['su-gia'],
    weight: 7,
    quiet: 0,
    salience: () => 6,
  },
  {
    id: 'su-gia-di-qua-nhung-lang-khong-tra-loi',
    volume: 'whisper',
    in: ['su-gia'],
    weight: 4,
    quiet: 2,
  },
  {
    // An ask the realm cannot pay yet. The card waits for the stores; this is what the waiting sounds like.
    id: 'no-van-nam-doi',
    volume: 'whisper',
    in: Object.keys(ASK_AT),
    weight: 5,
    quiet: 3,
    when: (ctx) => !canAfford(ctx, ASK_AT[ctx.node()]),
  },
  {
    id: 'lan-xin-thu-nhat',
    volume: 'card',
    band: 'granary',
    in: ['su-gia'],
    weight: 9,
    quiet: 2,
    when: (ctx) => ctx.said('a-child-who-has-never-spoken') && canAfford(ctx, 'first'),
    salience: () => 10,
    options: [
      {
        id: 'gui-gao-va-hang',
        price: priceOf('first'),
        historicity: 'annal',
        to: 'xin-lan-hai',
        apply: (ctx) => { gave(ctx); ctx.remember('fed', 1); },
      },
      {
        id: 'tre-con-la-tre-con',
        historicity: 'divergent',
        to: 'khong-tin',
        apply: (ctx) => { ctx.remember('refused', 1); },
      },
    ],
  },

  // ══ xin-lan-hai — he eats it all, and asks for twice as much ═══════════
  {
    id: 'he-eats-everything-the-village-has',
    volume: 'whisper',
    in: ['xin-lan-hai'],
    weight: 6,
    quiet: 1,
    salience: () => 6,
  },
  {
    id: 'lan-xin-thu-hai',
    volume: 'card',
    band: 'granary',
    in: ['xin-lan-hai'],
    weight: 9,
    quiet: 2,
    when: (ctx) => ctx.said('he-eats-everything-the-village-has') && canAfford(ctx, 'second'),
    salience: () => 10,
    options: [
      {
        id: 'gui-gap-doi',
        price: priceOf('second'),
        historicity: 'annal',
        to: 'ca-lang-gop',
        apply: (ctx) => { gave(ctx); ctx.remember('fed', 2); },
      },
      {
        id: 'dung-lai',
        historicity: 'divergent',
        to: 'bo-do',
        apply: (ctx) => { ctx.remember('stopped', 1); ctx.heat(1); },
      },
    ],
  },

  // ══ ca-lang-gop — the whole country feeds him ══════════════════════════
  {
    id: 'ca-nuoc-nuoi-giong',
    volume: 'blow',
    leadsTo: ['ren-sat'],
    band: 'crowd',
    in: ['ca-lang-gop'],
    weight: 10,
    quiet: 1,
    tone: 'reward',
    salience: () => 12,
    effect: (ctx) => {
      for (const land of playerLands(ctx.state)) {
        land.loyalty = Math.min(100, land.loyalty + PEOPLE_LOYALTY);
      }
      ctx.note('realmLoyalty', PEOPLE_LOYALTY);
      ctx.remember('grown', 1);
      ctx.goTo('ren-sat');
    },
  },

  // ══ ren-sat — the third ask: gold for the horse, the rod and the armour ═
  {
    id: 'vien-thu-lai-coi-kho',
    volume: 'whisper',
    in: ['ren-sat'],
    weight: 5,
    quiet: 1,
    salience: () => 5,
  },
  {
    id: 'lan-xin-thu-ba',
    volume: 'card',
    band: 'fire',
    in: ['ren-sat'],
    weight: 9,
    quiet: 2,
    when: (ctx) => canAfford(ctx, 'third'),
    salience: () => 10,
    options: [
      {
        id: 'ren-ngua-sat',
        price: priceOf('third'),
        historicity: 'annal',
        to: 'ra-tran',
        apply: (ctx) => { gave(ctx); ctx.remember('forged', 1); },
      },
      {
        id: 'khong-con-vang',
        historicity: 'divergent',
        to: 'tay-khong',
        apply: (ctx) => { ctx.remember('tay-khong', 1); },
      },
    ],
  },

  // ══ ra-tran — he rides when they stand on our soil ═════════════════════
  {
    id: 'his-armour-splits',
    volume: 'whisper',
    in: ['ra-tran'],
    weight: 5,
    quiet: 1,
  },
  {
    id: 'nguoi-lang-dung-ben-duong',
    volume: 'whisper',
    in: ['ra-tran'],
    weight: 5,
    quiet: 1,
    when: invadersOnOurSoil,
  },
  {
    id: 'he-rides',
    volume: 'blow',
    leadsTo: ['soc-son'],
    band: 'fire',
    in: ['ra-tran'],
    weight: 12,
    quiet: 1,
    tone: 'reward',
    when: invadersOnOurSoil,
    salience: () => 14,
    effect: (ctx) => {
      ride(ctx);
      ctx.goTo('soc-son');
    },
  },

  // ══ soc-son — the record's ending ══════════════════════════════════════
  {
    id: 'soc-son-khong-xuong-nua',
    volume: 'blow',
    band: 'mountain',
    in: ['soc-son'],
    weight: 10,
    terminal: true,
    tone: 'reward',
    effect: (ctx) => {
      // Reached by the patience clock before anyone came to ride against: he rides whatever is here.
      if (ctx.recall('rode') < 1 && invadersOnOurSoil(ctx)) ride(ctx);
      const land = ctx.land();
      monument(ctx, SHRINE, land);
      loyaltyFloor(ctx, REALM_LOYALTY_FLOOR);
      leaveEcho(ctx, land?.name ?? '');
    },
  },
];
