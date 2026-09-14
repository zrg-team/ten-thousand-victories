import { playerLands } from '../../../systems/story/StorySystem';
import { grantEliteTier, population, reinforceHosts } from '../../../systems/story/effects';
import type { StoryFragment, StoryNode } from '../../../systems/story/types';

/**
 * The court never asks the people. No child, no horse — the war is fought with the army the realm
 * has, and it carries a real win (`tu-lo-lay`) because declining a miracle is a strategy, not a
 * refusal to play. Unchanged from the earlier version of the story, ids included.
 */

export const WITHOUT_MIRACLE_NODES: StoryNode[] = [
  { id: 'khong-goi', historicity: 'ngoai-truyen', patience: 10, onIgnored: 'giu-ai' },
  { id: 'giu-ai', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'tu-lo-lay' },
  { id: 'tu-lo-lay', historicity: 'ngoai-truyen', terminal: true },
  { id: 'mat-phu-dong', historicity: 'ngoai-truyen', terminal: true },
  { id: 'dan-tran', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'tuong-gia' },
  { id: 'tuong-gia', historicity: 'ngoai-truyen', terminal: true },
  { id: 'vua-than-chinh', historicity: 'ngoai-truyen', terminal: true },
];

export const WITHOUT_MIRACLE_FRAGMENTS: StoryFragment[] = [
  {
    id: 'khong-ai-toi',
    volume: 'whisper',
    in: ['khong-goi'],
    weight: 6,
    quiet: 1,
    tone: 'threat',
  },
  {
    id: 'so-quan-la-so-quan',
    volume: 'whisper',
    in: ['khong-goi'],
    weight: 5,
    quiet: 2,
  },
  {
    id: 'danh-the-nao',
    volume: 'card',
    band: 'border',
    in: ['khong-goi'],
    weight: 9,
    quiet: 2,
    salience: (ctx) => (ctx.world.ticksToBoss <= 24 ? 10 : 2),
    options: [
      {
        id: 'giu-ai',
        historicity: 'divergent',
        to: 'giu-ai',
        apply: (ctx) => { ctx.remember('ai', 1); },
      },
      {
        id: 'dan-tran',
        historicity: 'divergent',
        to: 'dan-tran',
        apply: (ctx) => { ctx.remember('tran', 1); },
      },
    ],
  },

  {
    id: 'ai-hep-va-sau',
    volume: 'whisper',
    in: ['giu-ai'],
    weight: 5,
    quiet: 1,
  },
  {
    id: 'dot-kho-hay-cat-duong',
    volume: 'card',
    band: 'mountain',
    in: ['giu-ai'],
    weight: 9,
    quiet: 2,
    options: [
      {
        id: 'dot-kho-truoc-mat-chung',
        cost: { food: 140 },
        historicity: 'divergent',
        to: 'tu-lo-lay',
        apply: (ctx) => { ctx.remember('dot', 1); },
      },
      {
        id: 'cat-duong-sau-lung',
        historicity: 'divergent',
        to: 'mat-phu-dong',
        apply: (ctx) => { ctx.heat(2); },
      },
    ],
  },
  {
    id: 'tu-lo-lay-duoc',
    volume: 'blow',
    band: 'border',
    in: ['tu-lo-lay'],
    weight: 10,
    terminal: true,
    tone: 'reward',
    effect: (ctx) => {
      // The realm learns it does not need miracles. Permanence, for the branch that declined one.
      for (const land of playerLands(ctx.state)) {
        land.loyalty = Math.min(100, land.loyalty + 6);
      }
      ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 10);
      grantEliteTier(ctx);
    },
  },
  {
    id: 'mat-phu-dong-that-thu',
    volume: 'blow',
    band: 'fire',
    in: ['mat-phu-dong'],
    weight: 10,
    terminal: true,
    tone: 'threat',
    effect: (ctx) => { population(ctx, 0.8, ctx.land()); },
  },

  {
    id: 'dan-tran-ngoai-dong',
    volume: 'whisper',
    in: ['dan-tran'],
    weight: 5,
    quiet: 1,
  },
  {
    id: 'ai-cam-quan',
    volume: 'card',
    band: 'march',
    in: ['dan-tran'],
    weight: 9,
    quiet: 2,
    options: [
      {
        id: 'tuong-gia-cam',
        historicity: 'divergent',
        to: 'tuong-gia',
        apply: (ctx) => { ctx.remember('gia', 1); },
      },
      {
        id: 'vua-di',
        historicity: 'divergent',
        to: 'vua-than-chinh',
        apply: (ctx) => { ctx.heat(3); },
      },
    ],
  },
  {
    id: 'tuong-gia-giu-duoc-dat',
    volume: 'blow',
    band: 'field',
    in: ['tuong-gia'],
    weight: 10,
    terminal: true,
    effect: (ctx) => {
      reinforceHosts(ctx, 180);
      ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 4);
    },
  },
  {
    id: 'vua-than-chinh-ra-tran',
    volume: 'blow',
    band: 'crowd',
    in: ['vua-than-chinh'],
    weight: 10,
    terminal: true,
    effect: (ctx) => {
      for (const land of playerLands(ctx.state)) {
        land.loyalty = Math.min(100, land.loyalty + 12);
      }
      ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 14);
      reinforceHosts(ctx, 320);
    },
  },
];
