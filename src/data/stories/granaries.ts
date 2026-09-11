import { bounty } from '../../systems/story/effects';
import { applyResourceDelta } from '../../systems/ResourceSystem';
import { pick, playerLands } from '../../systems/story/StorySystem';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Kho Thóc Của Tể Tướng — The Chancellor's Granaries.
 *
 * Hồ Quý Ly's reforms were genuinely advanced — a national paper currency, land caps — and were
 * imposed with no popular consent. Counterfeiting, then famine, then the Ming. Seven years.
 *
 * The point of this story is **attribution**, and it is the cheapest drama in the whole design:
 * it does not cause the famine. The simulation produces famine on its own schedule and always
 * has. This story simply *claims* it, and now the shortage has an author, a signature and a name
 * the player can act against. One hook, eleven words, and the world stops feeling like a
 * spreadsheet with weather.
 *
 * Nothing stops the player taking every reform. The collapse fragment only exists if they did.
 */
export const granaries: StoryTemplate = {
  id: 'granaries',
  record: 'chinh-su',
  pressure: (ctx) => {
    const stored = ctx.recall('stored');
    if (stored >= 3) return 'kho-day';
    if (stored >= 1) return 'kho-co-thoc';
    if (ctx.recall('reforms') >= 2) return 'hai-to-le';
    if (ctx.recall('reforms') >= 1) return 'mot-to-le';
    return undefined;
  },

  regard: (ctx) => {
    if (ctx.recall('dismissed') === 1) return 'dismissed';
    if (ctx.recall('stoodBy') === 1) return 'trusted';
    if (ctx.recall('reforms') >= 2) return 'reforming';
    return undefined;
  },
  seedWeight: 2,
  minTurn: 10,
  seed: (state) => {
    const chancellor = pick(state.heroes.filter(
      (hero) => hero.id !== 'king' && hero.stats.administration >= 40,
    ));
    const land = pick(playerLands(state));
    if (!chancellor || !land) return undefined;
    return { heroId: chancellor.id, landId: land.id };
  },

  entry: 'de-nghi',
  nodes: [
    { id: 'de-nghi', historicity: 'chinh-su', patience: 6, onIgnored: 'de-nghi-hai' },
    { id: 'de-nghi-hai', historicity: 'chinh-su', patience: 6, onIgnored: 'gia-gao' },
    { id: 'gia-gao', historicity: 'chinh-su', patience: 6, onIgnored: 'bay-nam' },
    { id: 'bay-nam', historicity: 'chinh-su', terminal: true },
    { id: 'giu-duoc', historicity: 'chinh-su', terminal: true },
    // Stopping halfway is the one thing he never did.
    { id: 'dung-lai', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'khong-lam-gi' },
    { id: 'khong-lam-gi', historicity: 'ngoai-truyen', terminal: true },
    { id: 'nua-voi', historicity: 'ngoai-truyen', terminal: true },
  ],
  fragments: [
    {
      /** Halfway is its own position, and it has to be held. */
      id: 'nua-voi-thi-lam-gi',
      volume: 'card',
      band: 'granary',
      in: ['dung-lai'],
      weight: 9,
      quiet: 3,
      salience: (ctx) => (ctx.age >= 4 ? 9 : -20),
      options: [
        {
          id: 'giu-nguyen-the',
          to: 'nua-voi',
          historicity: 'divergent',
          apply: (ctx) => { ctx.remember('nguyen', 1); },
        },
        {
          id: 'bo-het-di',
          to: 'khong-lam-gi',
          historicity: 'divergent',
          apply: (ctx) => {
            ctx.remember('bo', 1);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 8);
            ctx.note('stability', 8);
          },
        },
      ],
    },
    {
      id: 'mot-nua-cai-cach',
      volume: 'whisper',
      in: ['nua-voi'],
      weight: 8,
      terminal: true,
      effect: (ctx) => {
        const lands = playerLands(ctx.state);
        lands.forEach((land, i) => {
          land.loyalty = Math.max(10, Math.min(100, land.loyalty + (i % 2 === 0 ? 8 : -8)));
        });
      },
    },
    {
      id: 'ong-ta-ve-ngoi-o-nha',
      volume: 'whisper',
      in: ['bay-nam', 'khong-lam-gi'],
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_dismiss-him') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'ruong-do-lai-thanh-ba',
      volume: 'whisper',
      in: ['de-nghi-hai', 'gia-gao'],
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_enact') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      /**
       * The granaries, used as granaries.
       *
       * The reforms in this story build them; nothing ever put anything in them. A standing door
       * on the treasury, priced in the season's surplus, so the reform the player voted for has
       * a thing they can actually do with it — and so the famine, when it comes, arrives at a
       * realm that either did or did not fill its stores.
       */
      id: 'thoc-vao-kho-nha-nuoc',
      volume: 'whisper',
      in: ['de-nghi-hai', 'gia-gao'],
      weight: 6,
      quiet: 3,
      repeatable: true,
      maxTimes: 4,
      // An absolute figure on purpose, unlike the counting house's gold gates. Grain is bounded
      // where coin is not: anything above `STORE_WASTE_SEASONS` of use rots, and the markets sell
      // what would rot, so a granary settles in the hundreds instead of climbing with the realm.
      // Two hundred therefore goes on meaning "enough to be worth arguing about".
      when: (ctx) => ctx.recall('reforms') >= 1 && ctx.state.resources.food >= 200,
      opening: { on: 'treasury', actionKey: 'guiThoc' },
      options: [
        {
          id: 'gui-thoc',
          to: 'de-nghi-hai',
          historicity: 'annal',
          cost: { food: 150 },
          apply: (ctx) => {
            const stored = ctx.bump('stored');
            // Not a rate and not a stockpile the player can draw on: a floor under the province
            // that gave the grain, and a court that can point at a full building.
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.min(100, land.loyalty + 4);
            }
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 5);
            ctx.note('stability', 5);
            if (stored >= 3) ctx.heat(2);
          },
        },
      ],
    },
    {
      id: 'a-proposal',
      volume: 'card',
      in: ['de-nghi'],
      band: 'court',
      weight: 6,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 6 : -20),
      options: [
        {
          id: 'enact',
          to: 'de-nghi-hai',
          historicity: 'annal',
          apply: (ctx) => {
            ctx.bump('reforms');
            // Genuinely good. That is why it is taken, and why the story works.
            bounty(ctx, { gold: 90 });
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.max(0, land.loyalty - 4);
            }
            ctx.heat(1.5);
          },
        },
        {
          id: 'not-this-one',
          to: 'de-nghi-hai',
          historicity: 'annal',
          apply: (ctx) => {
            ctx.bump('refused');
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 3);
            ctx.heat(-1);
          },
        },
      ],
    },
    {
      id: 'a-second-proposal',
      volume: 'card',
      in: ['de-nghi-hai'],
      band: 'court',
      weight: 4,
      quiet: 7,
      when: (ctx) => ctx.recall('reforms') >= 1,
      salience: (ctx) => 2 + ctx.recall('reforms'),
      options: [
        {
          id: 'enact',
          to: 'gia-gao',
          historicity: 'annal',
          apply: (ctx) => {
            ctx.bump('reforms');
            bounty(ctx, { gold: 110, supplies: 60 });
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.max(0, land.loyalty - 7);
            }
            ctx.heat(2.5);
          },
        },
        {
          id: 'enough',
          to: 'dung-lai',
          historicity: 'divergent',
          apply: (ctx) => {
            ctx.remember('stopped', 1);
            // R1. He is told to stop here, and he stops. The court is steadier for it and he
            // is not.
            const chancellor = ctx.hero();
            if (chancellor) chancellor.stats.loyalty = Math.max(0, chancellor.stats.loyalty - 10);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
            ctx.note('stability', 6);
            ctx.heat(-4);
          },
        },
      ],
    },
    {
      id: 'paper-for-copper',
      volume: 'whisper',
      in: ['gia-gao'],
      weight: 3,
      when: (ctx) => ctx.recall('reforms') >= 2,
      salience: (ctx) => ctx.recall('reforms'),
      heat: 1,
      tone: 'info',
    },
    {
      id: 'price-of-rice',
      volume: 'whisper',
      in: ['gia-gao'],
      weight: 3,
      when: (ctx) => ctx.recall('reforms') >= 2 && ctx.said('paper-for-copper'),
      salience: (ctx) => (ctx.world.starving ? 8 : 1),
      heat: 1.5,
      tone: 'threat',
    },

    /**
     * The attribution fragment. Fires only when the simulation is *already* starving the realm —
     * it takes no food, changes no rate, and invents nothing. It gives the shortage a signature.
     */
    {
      id: 'the-granaries-were-sold',
      volume: 'blow',
      in: ['gia-gao'],
      band: 'granary',
      weight: 8,
      tone: 'threat',
      when: (ctx) => ctx.world.starving && ctx.recall('reforms') >= 2,
      salience: () => 10,
      effect: (ctx) => {
        ctx.remember('blamed', 1);
        // The granaries were sold, so the granaries are empty and the district that paid for
        // them stops paying. This pauses the whole run to say so and used to change nothing.
        applyResourceDelta(ctx.state, { food: -Math.floor(ctx.state.resources.food * 0.25) });
        const robbed = ctx.land();
        if (robbed) robbed.loyalty = Math.max(0, robbed.loyalty - 14);
        ctx.note('food', -Math.floor(ctx.state.resources.food * 0.25));
        ctx.heat(3);
      },
    },
    {
      id: 'the-chancellor-answers',
      volume: 'card',
      in: ['gia-gao'],
      band: 'court',
      weight: 6,
      quiet: 3,
      when: (ctx) => ctx.recall('blamed') === 1,
      salience: () => 8,
      options: [
        {
          id: 'dismiss-him',
          to: 'bay-nam',
          historicity: 'annal',
          apply: (ctx) => {
            const hero = ctx.hero();
            if (hero) {
              hero.assignedTo = undefined;
              for (const seat of Object.keys(ctx.state.court.seats)) {
                const key = seat as keyof typeof ctx.state.court.seats;
                if (ctx.state.court.seats[key] === hero.id) ctx.state.court.seats[key] = undefined;
              }
            }
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.min(100, land.loyalty + 8);
            }
            ctx.remember('dismissed', 1);
          },
        },
        {
          id: 'stand-by-him',
          to: 'giu-duoc',
          historicity: 'annal',
          apply: (ctx) => {
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 10);
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.max(0, land.loyalty - 10);
            }
            ctx.remember('stoodBy', 1);
            ctx.heat(3);
          },
        },
        {
          id: 'open-the-royal-stores',
          to: 'giu-duoc',
          historicity: 'annal',
          cost: { gold: 200 },
          apply: (ctx) => {
            bounty(ctx, { food: 260 });
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.min(100, land.loyalty + 5);
            }
            ctx.remember('paidForIt', 1);
            ctx.heat(-3);
          },
        },
      ],
    },

    // Terminals.
    {
      id: 'seven-years',
      volume: 'blow',
      in: ['bay-nam'],
      band: 'fire',
      weight: 8,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('stoodBy') === 1 && ctx.story.temperature >= 8,
      salience: () => 12,
      effect: (ctx) => {
        // The realm does not rise against the reforms. It simply stops holding together.
        for (const land of playerLands(ctx.state)) {
          land.loyalty = Math.max(0, land.loyalty - 18);
        }
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 22);
      },
    },
    {
      id: 'the-reforms-hold',
      volume: 'whisper',
      in: ['giu-duoc'],
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('reforms') >= 2
        && (ctx.recall('paidForIt') === 1 || ctx.recall('stopped') === 1)
        && ctx.age >= 30,
      salience: () => 6,
      effect: (ctx) => {
        bounty(ctx, { supplies: 90 });
        const hero = ctx.hero();
        if (hero) hero.stats.administration = Math.min(100, hero.stats.administration + 8);
      },
    },
    {
      id: 'nothing-was-enacted',
      volume: 'whisper',
      in: ['khong-lam-gi'],
      weight: 2,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('refused') >= 1 && ctx.recall('reforms') === 0 && ctx.age >= 24,
      salience: () => 4,
    },
  ],
};
