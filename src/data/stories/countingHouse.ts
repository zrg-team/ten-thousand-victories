import { PRICE_SCALE_BASE_GROSS } from '../../game/ascentConfig';
import { heldSeasons } from '../../systems/ascent/priceScale';
import { applyResourceDelta } from '../../systems/ResourceSystem';
import { pick } from '../../systems/story/StorySystem';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Chín Trăm Lượng — Nine Hundred Gold, Sitting Still.
 *
 * The shortest story in the set and the one that most reliably surprises, because it fires on
 * *prosperity*. Nothing has gone wrong. The player is doing well, the treasury is deep, and
 * somebody in it has begun writing the figure down each month.
 *
 * Spend below the line in time and nothing happens at all — and the player never learns what
 * would have. That silence is the design: an outcome the player avoided without ever being told
 * there was one is worth more than a warning they were allowed to read.
 */
/**
 * Every gate in this story is a reading of the purse, and all of them were absolute gold figures.
 *
 * Four hundred coins is a hoard worth somebody's attention to a realm grossing sixty a season and
 * a fortnight's income to one grossing eight hundred — so from roughly wave ten every gate here
 * stood permanently open, and the story's own pacing (*the hoard builds back up, and so does the
 * counting*) stopped working. They are read in **seasons of the realm's own income** instead,
 * which at the founding is exactly the old figure over the base gross of 120 and goes on asking
 * the same question afterwards.
 */
const HOARD_COUNTED = 400 / PRICE_SCALE_BASE_GROSS;
const HOARD_TEMPTING = 500 / PRICE_SCALE_BASE_GROSS;
const HOARD_NOTICED = 620 / PRICE_SCALE_BASE_GROSS;
const HOARD_DEEP = 900 / PRICE_SCALE_BASE_GROSS;
const PURSE_THIN = 300 / PRICE_SCALE_BASE_GROSS;

export const countingHouse: StoryTemplate = {
  id: 'counting-house',
  record: 'ngoai-truyen',
  pressure: (ctx) => {
    if (ctx.recall('spentInPublic') >= 2) return 'da-voi';
    if (heldSeasons(ctx.state, 'gold') >= HOARD_DEEP) return 'day-len';
    if (heldSeasons(ctx.state, 'gold') >= HOARD_NOTICED) return 'van-ngoi-day';
    return undefined;
  },
  seedWeight: 2,
  minTurn: 16,
  seed: (state) => {
    if (heldSeasons(state, 'gold') < HOARD_NOTICED) return undefined;
    const clerk = pick(state.heroes.filter(
      (hero) => hero.id !== 'king' && hero.stats.loyalty < 55,
    ));
    return { heroId: clerk?.id };
  },

  fragments: [
    {
      id: 'so-van-de-o-gian-ngoai',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_the-treasury-is-mine') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'chua-ay-xay-them-gian',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-them-hold-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      /**
       * Spend it, and be seen to.
       *
       * The story fires on a deep treasury and somebody quietly writing the figure down each
       * month. Until now the only answers were on one card, and the obvious third — put the money
       * to work where everybody can see it go — did not exist. Repeatable, because the hoard
       * builds back up and so does the counting.
       */
      id: 'tieu-cho-ai-cung-thay',
      volume: 'whisper',
      weight: 6,
      quiet: 3,
      repeatable: true,
      maxTimes: 4,
      when: (ctx) => heldSeasons(ctx.state, 'gold') >= HOARD_COUNTED,
      opening: { on: 'treasury', actionKey: 'tieuBot' },
      options: [
        {
          id: 'tieu-bot-di',
          cost: { gold: 200 },
          apply: (ctx) => {
            ctx.bump('spentInPublic');
            const seat = ctx.land();
            if (seat) {
              seat.defense += 4;
              ctx.note('landDefense', 4, seat.name);
            }
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 4);
            ctx.note('stability', 4);
            // The man doing the counting has less to count, and less to say about it.
            ctx.heat(-4);
          },
        },
      ],
    },
    {
      id: 'somebody-is-counting',
      volume: 'whisper',
      weight: 6,
      quiet: 1,
      when: (ctx) => heldSeasons(ctx.state, 'gold') >= HOARD_NOTICED,
      salience: (ctx) => (ctx.age >= 2 ? 6 : -20),
      heat: 2,
      tone: 'info',
    },
    {
      id: 'the-ledger-is-copied',
      volume: 'whisper',
      weight: 3,
      when: (ctx) => ctx.said('somebody-is-counting') && heldSeasons(ctx.state, 'gold') >= HOARD_NOTICED,
      quiet: 6,
      salience: (ctx) => ctx.story.temperature,
      heat: 2.5,
      tone: 'threat',
    },
    {
      id: 'the-temple-offers',
      volume: 'card',
      band: 'shrine',
      weight: 5,
      quiet: 4,
      when: (ctx) => ctx.said('somebody-is-counting') && heldSeasons(ctx.state, 'gold') >= HOARD_COUNTED,
      salience: (ctx) => 3 + ctx.story.temperature * 0.5,
      options: [
        {
          id: 'let-them-hold-it',
          cost: { gold: 300 },
          apply: (ctx) => {
            // Safe, and it earns nothing. The abbot is a careful man.
            //
            // What was *actually* lodged, not the figure written above: story prices wear the
            // realm's scaled purse, so a late-run deposit is several times 300. Remembering the
            // literal would have the abbot hand back a third of what he was given.
            ctx.remember('sheltered', ctx.paid?.gold ?? 300);
            // Cost-only before this: three hundred gold went out and the card said nothing back.
            // What it buys is a ledger anybody may come and read, which is worth something in a
            // court that has been counting the treasury behind your back.
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 5);
            ctx.note('stability', 5);
            ctx.heat(-6);
          },
        },
        {
          id: 'the-treasury-is-mine',
          apply: (ctx) => {
            ctx.remember('refusedShelter', 1);
            // R1. Where it is, is your business — and the man who has been counting it hears
            // exactly that.
            const clerk = ctx.hero();
            if (clerk) clerk.stats.loyalty = Math.max(0, clerk.stats.loyalty - 8);
            ctx.note('stability', 0);
            ctx.heat(2);
          },
        },
      ],
    },

    // Spend it and the story quietly evaporates. The player never learns what almost happened.
    {
      id: 'the-coffers-are-light-again',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'info',
      when: (ctx) => heldSeasons(ctx.state, 'gold') < PURSE_THIN && ctx.recall('sheltered') === 0,
      salience: () => 8,
    },
    {
      id: 'returned-with-interest',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('sheltered') > 0 && ctx.age >= 26,
      salience: () => 6,
      effect: (ctx) => {
        applyResourceDelta(ctx.state, { gold: ctx.recall('sheltered') });
      },
    },

    // The blow. Two whispers came first, and they are in the Chronicle.
    {
      id: 'gone-in-the-night',
      volume: 'blow',
      band: 'night',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.story.temperature >= 7
        && ctx.said('the-ledger-is-copied')
        && heldSeasons(ctx.state, 'gold') >= HOARD_TEMPTING
        && ctx.recall('sheltered') === 0,
      salience: () => 12,
      effect: (ctx) => {
        applyResourceDelta(ctx.state, { gold: -ctx.state.resources.gold });
        const hero = ctx.hero();
        if (hero) {
          ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== hero.id);
          for (const seat of Object.keys(ctx.state.court.seats)) {
            const key = seat as keyof typeof ctx.state.court.seats;
            if (ctx.state.court.seats[key] === hero.id) ctx.state.court.seats[key] = undefined;
          }
        }
      },
    },
  ],
};
