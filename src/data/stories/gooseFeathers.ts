import { applyResourceDelta } from '../../systems/ResourceSystem';
import { livingRivals, pick, playerLands } from '../../systems/story/StorySystem';
import { pushToast } from '../../systems/empire/notifications';
import { launchPunitiveHost } from '../../systems/ascent/EnemyCommandDirector';
import { bounty, opinion } from '../../systems/story/effects';
import { storyText } from '../../i18n/story';
import { generateHero } from '../heroFactory';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Lông Ngỗng — Goose Feathers.
 *
 * A marriage alliance. The son-in-law learns where the crossbow's trigger is kept and swaps it
 * for a forgery. Fleeing, the princess drops goose feathers along the road to mark her path —
 * for him. Mỵ Châu and Trọng Thủy, and the reason the reversal works is that the boon is real:
 * the hero is genuinely good, the defence bonus genuinely applies, and the player banks both and
 * forgets the story is running.
 *
 * The safe version of the reversal ships here: the bonus is real and expires silently at the
 * worst possible moment. The bolder version — displaying a defence figure that was never applied
 * — would be more talked about and breaks a rule the interface has otherwise always kept.
 */
export const gooseFeathers: StoryTemplate = {
  id: 'goose-feathers',
  record: 'da-su',
  seedWeight: 2,
  minTurn: 14,
  seed: (state) => {
    // Wants a friendly neighbour and somewhere for him to be useful.
    const rival = pick(livingRivals(state).filter((kingdom) => (kingdom.relations ?? 50) >= 52));
    const land = pick(playerLands(state).filter((candidate) => candidate.loyalty >= 45));
    if (!rival || !land) return undefined;
    return { kingdomId: rival.id, landId: land.id };
  },

  regard: (ctx) => {
    if (ctx.recall('arrested') === 1 || ctx.recall('counterspy') === 1) return 'watched';
    if (ctx.recall('posted') === 1 && ctx.age >= 16) return 'athome';
    if (ctx.recall('poison') === 1) return 'correct';
    return undefined;
  },

  fragments: [
    {
      id: 'nguoi-do-tin-van-den',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_feed-him-what-i-want') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'cai-ao-cuoi-con-treo',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_accept') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'a-marriage-offered',
      volume: 'card',
      band: 'court',
      weight: 8,
      quiet: 0,
      salience: (ctx) => (ctx.age >= 1 ? 8 : -20),
      options: [
        {
          id: 'accept',
          apply: (ctx) => {
            const son = generateHero(ctx.state.turn * 7919, { id: `goose-${ctx.state.turn}`, type: 'general' });
            son.stats.martial = 52;
            son.stats.diplomacy = 61;
            son.stats.administration = 48;
            // Reads as "unknown" on the card. It is not unknown to him.
            son.stats.loyalty = 8;
            ctx.state.heroes.push(son);
            ctx.story.cast.heroId = son.id;
            ctx.remember('poison', 1);
            const rival = ctx.rival();
            if (rival) opinion(ctx, 22, rival.id);
          },
        },
        {
          id: 'keep-him-off-the-council',
          apply: (ctx) => {
            const son = generateHero(ctx.state.turn * 7919, { id: `goose-${ctx.state.turn}`, type: 'general' });
            son.stats.martial = 48;
            son.stats.diplomacy = 55;
            son.stats.loyalty = 22;
            ctx.state.heroes.push(son);
            ctx.story.cast.heroId = son.id;
            ctx.remember('poison', 1);
            ctx.remember('guarded', 1);
            const rival = ctx.rival();
            if (rival) opinion(ctx, 14, rival.id);
          },
        },
        {
          id: 'refuse',
          apply: (ctx) => {
            const rival = ctx.rival();
            if (rival) opinion(ctx, -12, rival.id);
            // A third party was watching, and liked what they saw.
            const watcher = pick(livingRivals(ctx.state).filter((k) => k.id !== rival?.id));
            if (watcher) watcher.trust = Math.min(100, (watcher.trust ?? 40) + 10);
            ctx.remember('refused', 1);
          },
        },
      ],
    },
    {
      id: 'refused-and-that-was-that',
      volume: 'whisper',
      weight: 5,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('refused') === 1,
      salience: () => 10,
    },

    // The hook. An ordinary, useful charge that pays out honestly.
    {
      id: 'post-him-somewhere',
      volume: 'card',
      weight: 4,
      quiet: 3,
      when: (ctx) => ctx.recall('poison') === 1 && ctx.recall('posted') === 0 && Boolean(ctx.hero()),
      opening: { on: 'land', actionKey: 'postHim' },
      options: [
        {
          id: 'post-him',
          apply: (ctx) => {
            ctx.remember('posted', 1);
            ctx.remember('echoTurn', ctx.state.turn);
            const land = ctx.land();
            const hero = ctx.hero();
            if (land && hero) {
              hero.assignedTo = land.id;
              // Real. It applies, it helps, and it is why the player stops thinking about this.
              land.defense += 18;
              ctx.remember('bonus', 18);
            }
          },
        },
      ],
    },
    {
      id: 'he-is-good-at-the-job',
      volume: 'whisper',
      weight: 2,
      when: (ctx) => ctx.recall('posted') === 1,
      quiet: 6,
      tone: 'reward',
    },

    // The gown, thinning. The tell before the tell: pure dread, no mechanics, and the reason
    // the feathers land as confirmation rather than as news.
    {
      id: 'the-gown-grows-thin',
      volume: 'whisper',
      weight: 3,
      quiet: 8,
      tone: 'threat',
      when: (ctx) => ctx.recall('posted') === 1 && ctx.age >= 18,
      salience: () => 4,
      heat: 1,
    },

    // The turn.
    {
      id: 'feathers-on-the-road',
      volume: 'card',
      band: 'border',
      weight: 6,
      quiet: 8,
      when: (ctx) => ctx.recall('posted') === 1 && ctx.age >= 26,
      salience: (ctx) => 4 + (ctx.age - 26) * 0.3,
      tone: 'threat',
      options: [
        {
          id: 'arrest-him',
          // Needs someone in that province who can actually do it.
          enabled: (ctx) => ctx.state.heroes.some(
            (hero) => hero.id !== ctx.story.cast.heroId
              && hero.stats.martial >= 55
              && (hero.assignedTo === ctx.story.cast.landId || !hero.assignedTo),
          ),
          blockedKey: 'noStrongHand',
          apply: (ctx) => {
            ctx.remember('arrested', 1);
            const hero = ctx.hero();
            if (hero) {
              hero.stats.loyalty = 40;
              hero.assignedTo = undefined;
            }
            const rival = ctx.rival();
            if (rival) opinion(ctx, -40, rival.id);
          },
        },
        {
          id: 'feed-him-what-i-want',
          apply: (ctx) => {
            ctx.remember('counterspy', 1);
            // R1. An enemy's ear is also yours, and they act on what you put in it.
            const fed = ctx.rival();
            if (fed) opinion(ctx, 10, fed.id);
          },
        },
        {
          id: 'do-nothing',
          apply: (ctx) => {
            ctx.remember('ignored', 1);
            // R4. Nothing is certain yet, and waiting costs a little standing and buys a little
            // trust from the one person who told you.
            const watched = ctx.rival();
            if (watched) opinion(ctx, -6, watched.id);
            const informer = ctx.hero();
            if (informer) informer.stats.loyalty = Math.min(100, informer.stats.loyalty + 4);
          },
        },
      ],
    },

    // Three endings that are not variations of each other.
    {
      id: 'the-punitive-host',
      volume: 'blow',
      band: 'march',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('arrested') === 1,
      salience: () => 12,
      effect: (ctx) => {
        const rival = ctx.rival();
        if (rival) launchPunitiveHost(ctx.state, rival.id);
      },
    },
    {
      id: 'the-ambush',
      volume: 'blow',
      band: 'river',
      weight: 9,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('counterspy') === 1,
      salience: () => 12,
      effect: (ctx) => {
        const rival = ctx.rival();
        if (!rival) return;
        launchPunitiveHost(ctx.state, rival.id);
        // They march into it at a fraction of their strength, and we strike first.
        for (const army of ctx.state.armies) {
          if (army.kingdomId !== rival.id) continue;
          army.units.spearmen = Math.floor(army.units.spearmen * 0.4);
          army.units.archers = Math.floor(army.units.archers * 0.4);
          army.units.heavyInfantry = Math.floor(army.units.heavyInfantry * 0.4);
          army.morale = Math.max(20, army.morale - 30);
        }
        pushToast(ctx.state, storyText('goose-feathers.the-ambush.toast', {}), 'reward');
      },
    },
    {
      id: 'the-claw-is-changed',
      volume: 'blow',
      band: 'fire',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('ignored') === 1,
      salience: () => 12,
      effect: (ctx) => {
        const land = ctx.land();
        const hero = ctx.hero();
        // The bonus expires at the worst possible moment. It was real; it is not any more.
        if (land) {
          land.defense = Math.max(1, land.defense - ctx.recall('bonus'));
          land.loyalty = Math.max(0, land.loyalty - 25);
        }
        if (hero) {
          ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== hero.id);
        }
        const rival = ctx.rival();
        if (rival) launchPunitiveHost(ctx.state, rival.id);
        bounty(ctx, { gold: -60 });
      },
    },
  ],
};
