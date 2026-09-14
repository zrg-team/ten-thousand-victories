import { grantHost, leaveEcho, loyaltyFloor, population, routInvaders } from '../../../systems/story/effects';
import type { StoryFragment, StoryNode } from '../../../systems/story/types';
import { invadersOnOurSoil } from './asks';
import { BAMBOO_SHARE } from './tuning';

/**
 * What happens when the realm stops trusting — one branch per ask, and each costs more than the last.
 *
 * - `khong-tin` — the first ask refused. Nothing given, nothing lost; the child lies still again.
 * - `bo-do` — the second refused. The first sending is eaten, and the village decides the rest.
 * - `tay-khong` — the gold refused. Both sendings are gone into a giant with bare hands, who can
 *   break half the invasion with a bamboo grove, or fall in a field.
 *
 * Every branch owes the engine two endings and does not end on its first node (INV-9/INV-10 in
 * `systems/story/invariants.ts`); a new branch added here has to as well.
 */

export const REFUSAL_NODES: StoryNode[] = [
  { id: 'khong-tin', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'lang-quen' },
  { id: 'thay-thuoc', historicity: 'ngoai-truyen', terminal: true },
  { id: 'lang-quen', historicity: 'ngoai-truyen', terminal: true },

  { id: 'bo-do', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'bo-di' },
  { id: 'nguoi-khong-lo', historicity: 'ngoai-truyen', terminal: true },
  { id: 'bo-di', historicity: 'ngoai-truyen', terminal: true },

  { id: 'tay-khong', historicity: 'ngoai-truyen', patience: 10, onIgnored: 'nga-o-ruong' },
  { id: 'nhung-cay-tre', historicity: 'ngoai-truyen', terminal: true },
  { id: 'nga-o-ruong', historicity: 'ngoai-truyen', terminal: true },
];

export const REFUSAL_FRAGMENTS: StoryFragment[] = [
  // ══ khong-tin — a child is a child ═════════════════════════════════════
  {
    id: 'dua-be-lai-nam-im',
    volume: 'whisper',
    in: ['khong-tin'],
    weight: 6,
    quiet: 0,
  },
  {
    id: 'me-dua-be-len-kinh',
    volume: 'card',
    band: 'court',
    in: ['khong-tin'],
    weight: 9,
    quiet: 2,
    salience: (ctx) => (ctx.said('dua-be-lai-nam-im') ? 9 : -20),
    options: [
      {
        id: 'goi-thay-thuoc',
        cost: { gold: 40 },
        historicity: 'divergent',
        to: 'thay-thuoc',
        apply: (ctx) => { ctx.remember('kham', 1); },
      },
      {
        id: 'cho-ba-ve',
        historicity: 'divergent',
        to: 'lang-quen',
        apply: (ctx) => { ctx.remember('ve', 1); },
      },
    ],
  },
  {
    id: 'khong-co-gi-ca',
    volume: 'whisper',
    in: ['thay-thuoc'],
    weight: 8,
    terminal: true,
    effect: (ctx) => {
      // The realm stops believing in omens for a while. Nothing dramatic; just a court that has
      // been embarrassed once and remembers it.
      ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 4);
    },
  },
  {
    id: 'dua-be-nam-im-mai',
    volume: 'blow',
    band: 'night',
    in: ['lang-quen'],
    weight: 10,
    terminal: true,
    tone: 'threat',
    effect: (ctx) => {
      const land = ctx.land();
      if (land) land.loyalty = Math.max(0, land.loyalty - 6);
    },
  },

  // ══ bo-do — stopped halfway: what was given is eaten ═══════════════════
  {
    id: 'no-ngoi-o-cua',
    volume: 'whisper',
    in: ['bo-do'],
    weight: 6,
    quiet: 0,
  },
  {
    /**
     * Whether the village goes on feeding a half-grown giant out of its own stores is not the
     * throne's to decide any more — it decided. What the province thinks of him decides it.
     */
    id: 'nua-chung',
    volume: 'blow',
    leadsTo: ['nguoi-khong-lo', 'bo-di'],
    band: 'granary',
    in: ['bo-do'],
    weight: 10,
    quiet: 2,
    salience: () => 9,
    effect: (ctx) => {
      ctx.goTo((ctx.land()?.loyalty ?? 0) >= 60 ? 'nguoi-khong-lo' : 'bo-di');
    },
  },
  {
    id: 'nguoi-khong-lo-o-lai',
    volume: 'blow',
    band: 'crowd',
    in: ['nguoi-khong-lo'],
    weight: 10,
    terminal: true,
    effect: (ctx) => {
      population(ctx, 1.18, ctx.land());
      ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 8);
      loyaltyFloor(ctx, 60, ctx.land());
    },
  },
  {
    id: 'mot-dem-no-di',
    volume: 'whisper',
    in: ['bo-di'],
    weight: 8,
    terminal: true,
    effect: (ctx) => { leaveEcho(ctx, ctx.land()?.name ?? ''); },
  },

  // ══ tay-khong — a giant with bare hands ════════════════════════════════
  {
    id: 'roi-sat-khong-co-thi-lay-gi',
    volume: 'whisper',
    in: ['tay-khong'],
    weight: 5,
    quiet: 1,
  },
  {
    id: 'ra-di-tay-khong',
    volume: 'card',
    band: 'march',
    in: ['tay-khong'],
    weight: 9,
    quiet: 2,
    // He goes when there is something to go against, not down an empty road.
    when: (ctx) => invadersOnOurSoil(ctx) || ctx.world.waveIncoming,
    options: [
      {
        id: 'de-no-di',
        historicity: 'divergent',
        to: 'nhung-cay-tre',
        apply: (ctx) => { ctx.remember('tre', 1); },
      },
      {
        id: 'giu-lai-da',
        historicity: 'divergent',
        to: 'nga-o-ruong',
        apply: (ctx) => { ctx.heat(2); },
      },
    ],
  },
  {
    id: 'nhung-cay-tre-dang-nga',
    volume: 'blow',
    band: 'field',
    in: ['nhung-cay-tre'],
    weight: 10,
    terminal: true,
    tone: 'reward',
    effect: (ctx) => {
      // Half the invasion, largest hosts first. No armour, no shrine, and nothing comes back.
      const slain = invadersOnOurSoil(ctx) ? routInvaders(ctx, BAMBOO_SHARE) : 0;
      // The road was empty when he got there: what he leaves is the men who followed him.
      if (slain === 0) grantHost(ctx, 900, ctx.land());
      loyaltyFloor(ctx, 55, ctx.land());
    },
  },
  {
    id: 'nga-xuong-ruong',
    volume: 'blow',
    band: 'field',
    in: ['nga-o-ruong'],
    weight: 10,
    terminal: true,
    tone: 'threat',
    effect: (ctx) => { population(ctx, 0.92, ctx.land()); },
  },
];
