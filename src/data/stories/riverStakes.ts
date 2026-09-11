import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { applyResourceDelta } from '../../systems/ResourceSystem';
import { bounty, terrainWork } from '../../systems/story/effects';
import { livingRivals, pick, playerLands } from '../../systems/story/StorySystem';
import { pushToast } from '../../systems/empire/notifications';
import { storyText } from '../../i18n/story';
import type { StoryTemplate } from '../../systems/story/types';
import type { GameState } from '../../state/types';

/**
 * Cọc Bạch Đằng — The Stakes in the River.
 *
 * Iron-shod stakes driven into a tidal riverbed, hidden at high water. The fleet is lured in on
 * the flood and destroyed on the ebb — twice, in 938 and again in 1288, three hundred and fifty
 * years apart.
 *
 * The design note that matters: **there is no charge and no deadline.** The first draft made this
 * a build-a-trap quest with a six-season timer, which is exactly the thing that reads as cheap.
 * Here the story whispers once about the tide, the player builds a timber yard for their own
 * reasons or does not, and fifty seasons later a fleet either walks into it or never comes. What
 * makes it land is that the player had forgotten they prepared anything.
 */

/** Enemy strength currently standing on or beside the marked province. */
function hostileNear(state: GameState, landId?: string): number {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land) return 0;
  const near = new Set([land.id, ...land.neighbors]);
  return state.armies
    .filter((army) => army.kingdomId !== PLAYER_KINGDOM_ID && near.has(army.landId))
    .reduce((sum, army) => sum + army.units.spearmen + army.units.archers + army.units.heavyInfantry, 0);
}

export const riverStakes: StoryTemplate = {
  id: 'river-stakes',
  record: 'chinh-su',
  pressure: (ctx) => {
    const rows = ctx.recall('rows');
    if (rows >= 3) return 'kin-long';
    if (rows >= 1) return 'mot-hang';
    if (ctx.recall('surveyed') === 1) return 'do-xong';
    return undefined;
  },

  regard: (ctx) => {
    if (ctx.recall('walkedAway') === 1) return 'insulted';
    if (ctx.recall('stakes') === 1) return 'ready';
    if (ctx.recall('surveyed') === 1) return 'measuring';
    return undefined;
  },
  seedWeight: 2,
  minTurn: 12,
  seed: (state) => {
    // Wants water and a neighbour who might one day sail up it.
    const land = pick(playerLands(state).filter(
      (candidate) => (candidate.terrainSummary?.water ?? 0) > 0,
    )) ?? pick(playerLands(state));
    const rival = pick(livingRivals(state).sort(
      (a, b) => (a.relations ?? 50) - (b.relations ?? 50),
    ).slice(0, 2));
    if (!land || !rival) return undefined;
    return { landId: land.id, kingdomId: rival.id };
  },

  fragments: [
    {
      id: 'ong-chai-thoi-ra-ben',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_send-him-home') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'nuoc-rong-thay-dau-coc',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_drive-them') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-fishermans-complaint',
      volume: 'card',
      band: 'river',
      weight: 6,
      quiet: 1,
      salience: (ctx) => (ctx.age >= 2 ? 6 : -20),
      options: [
        {
          id: 'survey-the-bed',
          cost: { gold: 40 },
          apply: (ctx) => {
            ctx.remember('surveyed', 1);
            ctx.remember('echoTurn', ctx.state.turn);
            // Forty gold to have a fisherman listened to, and until now the card said nothing
            // back at all. He was listened to, and the district saw it.
            const bank = ctx.land();
            if (bank) bank.loyalty = Math.min(100, bank.loyalty + 6);
          },
        },
        {
          id: 'send-a-hero',
          enabled: (ctx) => ctx.state.heroes.some((hero) => hero.stats.logistics >= 40),
          blockedKey: 'noSurveyor',
          apply: (ctx) => {
            ctx.remember('surveyed', 1);
            ctx.remember('echoTurn', ctx.state.turn);
            const walker = ctx.state.heroes
              .filter((hero) => hero.stats.logistics >= 40)
              .sort((a, b) => b.stats.logistics - a.stats.logistics)[0];
            if (walker) {
              walker.stats.logistics = Math.min(100, walker.stats.logistics + 3);
              ctx.story.cast.heroId = walker.id;
            }
          },
        },
        {
          id: 'send-him-home',
          apply: (ctx) => {
            // The walk-away branch pays out. You listened to a peasant, and the province noticed.
            const land = ctx.land();
            if (land) land.loyalty = Math.min(100, land.loyalty + 8);
            ctx.remember('walkedAway', 1);
          },
        },
      ],
    },
    {
      id: 'the-tide-was-only-a-tide',
      volume: 'whisper',
      weight: 5,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('walkedAway') === 1,
      salience: () => 10,
    },

    // The offer. No deadline, no reward preview, and free to ignore forever.
    {
      id: 'his-men-would-cut-the-timber',
      volume: 'card',
      weight: 4,
      quiet: 4,
      repeatable: true,
      maxTimes: 3,
      // `stakes` stays a flag — five other beats test it for equality — and `rows` counts how
      // much of the bed has actually been staked. Three tides' work, and each row is in the
      // riverbed from the day it is driven.
      when: (ctx) => ctx.recall('surveyed') === 1 && ctx.recall('rows') < 3,
      salience: () => 3,
      opening: { on: 'land', actionKey: 'driveTheStakes' },
      options: [
        {
          id: 'drive-them',
          cost: { supplies: 180, gold: 90 },
          apply: (ctx) => {
            ctx.remember('stakes', 1);
            ctx.bump('rows');
            ctx.remember('echoTurn', ctx.state.turn);
            // The stakes are in the riverbed from the day they are driven. The fleet that walks
            // onto them is fifty seasons away, and that beat still pays the large one.
            terrainWork(ctx, { defense: 8 }, ctx.land());
          },
        },
      ],
    },
    {
      id: 'the-carpenters-are-done',
      volume: 'whisper',
      weight: 2,
      when: (ctx) => ctx.recall('stakes') === 1,
      quiet: 6,
      tone: 'info',
    },
    {
      id: 'nothing-in-the-water',
      volume: 'whisper',
      weight: 1,
      repeatable: true,
      when: (ctx) => ctx.recall('stakes') === 1 && hostileNear(ctx.state, ctx.story.cast.landId) === 0,
      quiet: 18,
      tone: 'info',
    },

    /**
     * The pay-off, fifty seasons after the fact and only if a fleet ever actually comes.
     * A prepared trap that never fires is a real outcome and it must stay one.
     */
    {
      id: 'the-ebb',
      volume: 'card',
      band: 'river',
      weight: 9,
      tone: 'reward',
      when: (ctx) => ctx.recall('stakes') === 1 && hostileNear(ctx.state, ctx.story.cast.landId) >= 400,
      salience: () => 14,
      terminal: true,
      options: [
        {
          id: 'now',
          apply: (ctx) => {
            const land = ctx.land();
            if (!land) return;
            const near = new Set([land.id, ...land.neighbors]);
            let drowned = 0;
            for (const army of ctx.state.armies) {
              if (army.kingdomId === PLAYER_KINGDOM_ID || !near.has(army.landId)) continue;
              const before = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
              army.units.spearmen = Math.floor(army.units.spearmen * 0.35);
              army.units.archers = Math.floor(army.units.archers * 0.35);
              army.units.heavyInfantry = Math.floor(army.units.heavyInfantry * 0.35);
              army.morale = Math.max(15, army.morale - 40);
              drowned += before - (army.units.spearmen + army.units.archers + army.units.heavyInfantry);
            }
            const rival = ctx.rival();
            if (rival) rival.power = Math.max(10, (rival.power ?? 60) - 18);
            pushToast(ctx.state, storyText('river-stakes.the-ebb.toast', { count: drowned }), 'reward');

          },
        },
        {
          id: 'wait-one-more-tide',
          apply: (ctx) => {
            const land = ctx.land();
            if (!land) return;
            const near = new Set([land.id, ...land.neighbors]);
            // The gamble. Most of the time they smell it and never come that way again.
            const wholeFleet = Math.random() < 0.4;
            const survival = wholeFleet ? 0.15 : 0.8;
            for (const army of ctx.state.armies) {
              if (army.kingdomId === PLAYER_KINGDOM_ID || !near.has(army.landId)) continue;
              army.units.spearmen = Math.floor(army.units.spearmen * survival);
              army.units.archers = Math.floor(army.units.archers * survival);
              army.units.heavyInfantry = Math.floor(army.units.heavyInfantry * survival);
              if (wholeFleet) army.morale = Math.max(10, army.morale - 55);
            }
            const rival = ctx.rival();
            if (rival) rival.power = Math.max(10, (rival.power ?? 60) - (wholeFleet ? 30 : 4));
            pushToast(
              ctx.state,
              storyText(wholeFleet ? 'river-stakes.the-ebb.whole' : 'river-stakes.the-ebb.smelled', {}),
              wholeFleet ? 'reward' : 'threat',
            );
          },
        },
      ],
    },
    {
      id: 'the-stakes-rot',
      volume: 'whisper',
      weight: 2,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('stakes') === 1 && ctx.age >= 90,
      salience: (ctx) => (ctx.age - 90) * 0.3,
    },
    {
      id: 'the-survey-in-a-drawer',
      volume: 'whisper',
      weight: 2,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('surveyed') === 1 && ctx.recall('stakes') === 0 && ctx.age >= 55,
      salience: (ctx) => (ctx.age - 55) * 0.2,
      effect: (ctx) => {
        // Paid the surveyors and never read the survey.
        bounty(ctx, { gold: -30 });
      },
    },
  ],
};
