import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { livingRivals, pick, playerLands } from '../../systems/story/StorySystem';
import { brokenKey, keptKey, swearCharge } from '../../systems/story/charges';
import {
  academy,
  amnesty,
  captureHero,
  conscript,
  debaseCurrency,
  defectHost,
  exileHero,
  freeBuilding,
  grantEdictPoints,
  grantPowerCard,
  grantStoryHero,
  heroLeaves,
  killEnemyGeneral,
  loyaltyFloor,
  monument,
  opinion,
  plunderSupply,
  population,
  reinforceHosts,
  sabotageIncoming,
  spoilGranary,
  standing,
  stipend,
  temper,
  terrainWork,
  truce,
  bounty, windfall,
} from '../../systems/story/effects';
import { storyText } from '../../i18n/story';
import type { StoryTemplate } from '../../systems/story/types';
import type { GameState } from '../../state/types';

/**
 * The annals: ten middle-length histories.
 *
 * A deliberate third length. The catalogue already had two: the flagships, which run to sixteen
 * fragments and are the shape of a whole run, and the charge epics, which are three or four beats
 * around one enormous undertaking. Between them was a gap — a story that takes five or six beats,
 * arrives with a decision that costs something, and is finished inside twenty seasons. That is the
 * length a run actually has room for several of, which is what makes it the length that decides
 * whether the Chronicle feels vast or merely deep.
 *
 * Every one of the ten is a real episode, and each is built around a *different verb* rather than
 * a different anecdote — the diver, the grain fleet, the paper money, the wall, the schools, the
 * exile, the amnesty, the captive, the crossbow, the sword. Where an outcome needed a verb the
 * vocabulary did not have, the verb was added to `effects.ts` rather than the story reaching into
 * `GameState` on its own.
 */

const cold = (state: GameState) =>
  livingRivals(state).sort((a, b) => (a.relations ?? 50) - (b.relations ?? 50))[0];

const warmest = (state: GameState) =>
  livingRivals(state).sort((a, b) => (b.relations ?? 50) - (a.relations ?? 50))[0];

// ─────────────────────────────────────────────────────────────────────────────
// 1428 · Hồ Gươm — the sword returned
// ─────────────────────────────────────────────────────────────────────────────

export const hoGuom: StoryTemplate = {
  id: 'ho-guom',
  record: 'da-su',
  seedWeight: 2.2,
  minTurn: 20,
  regard: (ctx) => {
    if (ctx.recall('returned') === 1) return 'at-peace';
    if (ctx.recall('taken') === 1) return 'armed';
    return undefined;
  },
  seed: (state) => {
    const hero = pick(state.heroes.filter((h) => h.stats.martial >= 45)) ?? pick(state.heroes);
    const land = pick(playerLands(state).filter((l) => (l.terrainSummary?.water ?? 0) > 0))
      ?? pick(playerLands(state));
    if (!hero || !land) return undefined;
    return { heroId: hero.id, landId: land.id };
  },
  fragments: [
    {
      id: 'ba-lai-do-thoi-ke',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_leave-it-in-the-water') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'guom-treo-tren-vach',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_take-it-up') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'a-blade-in-the-net',
      volume: 'card',
      band: 'river',
      weight: 6,
      options: [
        { id: 'take-it-up', apply: (ctx) => { ctx.remember('taken', 1); temper(ctx, 'martial', 9); ctx.heat(2); } },
        {
          // R1. He threw it back twice on his own account; a throne that lets him is a throne he
          // is still under in ten years.
          id: 'leave-it-in-the-water',
          apply: (ctx) => {
            ctx.bump('refused');
            const finder = ctx.hero();
            if (finder) temper(ctx, 'loyalty', 8, finder);
            loyaltyFloor(ctx, 55, ctx.land());
            ctx.heat(-1);
          },
        },
      ],
    },
    {
      id: 'it-cuts-better-than-it-should',
      volume: 'whisper',
      repeatable: true,
      maxTimes: 3,
      quiet: 6,
      when: (ctx) => ctx.recall('taken') === 1,
      weight: 4,
      effect: (ctx) => { ctx.bump('victories'); },
    },
    {
      id: 'the-turtle-at-the-lake',
      volume: 'card',
      weight: 8,
      quiet: 5,
      when: (ctx) => ctx.recall('taken') === 1 && (ctx.state.ascent?.wavesSurvived ?? 0) >= 8,
      options: [
        {
          id: 'give-it-back',
          apply: (ctx) => {
            ctx.remember('returned', 1);
            // Peace is the reward, and it is a real one: the sword was only ever a loan.
            amnesty(ctx, 22);
            loyaltyFloor(ctx, 60);
            grantPowerCard(ctx, 'thuan-thien');
          },
        },
        {
          id: 'keep-it',
          apply: (ctx) => {
            ctx.remember('kept-blade', 1);
            temper(ctx, 'martial', 7);
            // A king who will not give the sword back is a king people watch differently.
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 14);
          },
        },
      ],
    },
    {
      id: 'the-lake-is-quiet-now',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 90,
      when: (ctx) => ctx.recall('returned') === 1,
      effect: (ctx) => {
        // The recorded ending pays in permanence, which is the contract the tag is under: the
        // lake keeps the name, and the place keeps a shrine that nothing wears off.
        monument(ctx, { defense: 6, stability: 10 }, ctx.land());
        ctx.leaveEcho(ctx.hero()?.name ?? '');
      },
    },
    {
      id: 'he-will-not-put-it-down',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 90,
      when: (ctx) => ctx.recall('kept-blade') === 1 && ctx.quietFor > 10,
      effect: (ctx) => { heroLeaves(ctx); },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// ~208 BC · Nỏ Thần Cổ Loa — the crossbow, and the marriage
// ─────────────────────────────────────────────────────────────────────────────

export const noThan: StoryTemplate = {
  id: 'no-than',
  record: 'da-su',
  seedWeight: 1.9,
  minTurn: 26,
  regard: (ctx) => {
    if (ctx.recall('betrayed') === 1) return 'ruined';
    if (ctx.recall('married') === 1) return 'trusting';
    return undefined;
  },
  seed: (state) => {
    const rival = cold(state);
    const land = pick(playerLands(state));
    if (!rival || !land) return undefined;
    return { kingdomId: rival.id, landId: land.id };
  },
  fragments: [
    {
      id: 'khong-ai-nhac-cai-no-nua',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_it-is-a-story-for-children') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'tho-lam-no-van-ngoi-do',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_arm-the-walls') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-crossbow-that-fires-a-hundred',
      volume: 'card',
      weight: 6,
      options: [
        {
          id: 'arm-the-walls',
          apply: (ctx) => {
            terrainWork(ctx, { defense: 14 });
            ctx.remember('armed', 1);
          },
        },
        {
          // R2. Walls are men, not machines — so the artificers go where men go.
          id: 'it-is-a-story-for-children',
          apply: (ctx) => { reinforceHosts(ctx, 90); ctx.heat(-2); },
        },
      ],
    },
    {
      id: 'they-offer-a-marriage',
      volume: 'card',
      weight: 7,
      quiet: 4,
      when: (ctx) => ctx.recall('armed') === 1,
      options: [
        {
          id: 'accept-the-match',
          apply: (ctx) => {
            const rival = ctx.rival();
            ctx.remember('married', 1);
            truce(ctx, rival?.id, 40);
            bounty(ctx, { gold: 260, supplies: 90 });
          },
        },
        {
          id: 'refuse-politely',
          apply: (ctx) => {
            const rival = ctx.rival();
            if (rival) opinion(ctx, -12, rival.id);
            ctx.remember('refused-match', 1);
          },
        },
      ],
    },
    {
      id: 'the-trigger-is-gone',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 95,
      when: (ctx) => ctx.recall('married') === 1 && ctx.quietFor >= 8,
      effect: (ctx) => {
        // The son-in-law copied the trigger and went home. The walls are still there; they no
        // longer do the thing they were built to do.
        ctx.remember('betrayed', 1);
        const land = ctx.land();
        if (land) land.defense = Math.max(4, Math.round(land.defense * 0.55));
        const rival = ctx.rival();
        if (rival) {
          rival.warAppetite = Math.min(100, (rival.warAppetite ?? 0) + 55);
          opinion(ctx, -40, rival.id);
        }
      },
    },
    {
      id: 'the-match-was-refused-and-nothing-happened',
      volume: 'blow',
      terminal: true,
      tone: 'info',
      weight: 60,
      when: (ctx) => ctx.recall('refused-match') === 1 && ctx.quietFor >= 14,
      effect: (ctx) => { grantPowerCard(ctx, 'no-than'); },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1288 · Yết Kiêu — the diver
// ─────────────────────────────────────────────────────────────────────────────

export const yetKieu: StoryTemplate = {
  id: 'yet-kieu',
  record: 'da-su',
  seedWeight: 2.4,
  minTurn: 16,
  regard: (ctx) => (ctx.recall('sent') === 1 ? 'in-the-water' : undefined),
  seed: (state) => {
    const land = pick(playerLands(state).filter((l) => (l.terrainSummary?.water ?? 0) > 0));
    if (!land) return undefined;
    return { landId: land.id };
  },
  fragments: [
    {
      id: 'cai-khoan-o-nha-kho',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_no-man-can-do-that') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'nguoi-ta-do-nhau-lan-nua',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_send-him-out-tonight') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'a-man-who-can-stay-under',
      volume: 'card',
      band: 'river',
      weight: 6,
      when: (ctx) => (ctx.state.invasions?.length ?? 0) > 0 || (ctx.state.ascent?.wavesSurvived ?? 0) >= 2,
      options: [
        {
          id: 'send-him-out-tonight',
          apply: (ctx) => {
            ctx.remember('sent', 1);
            const lost = sabotageIncoming(ctx, 0.28);
            ctx.remember('holed', lost);
          },
        },
        {
          // R1. Nobody believes him, and he is kept anyway; the hulls get looked at instead.
          id: 'no-man-can-do-that',
          apply: (ctx) => {
            const diver = ctx.hero();
            if (diver) temper(ctx, 'loyalty', 6, diver);
            terrainWork(ctx, { defense: 4 }, ctx.land());
            ctx.heat(-1);
          },
        },
      ],
    },
    {
      id: 'he-comes-back-before-dawn',
      volume: 'whisper',
      repeatable: true,
      maxTimes: 3,
      quiet: 5,
      when: (ctx) => ctx.recall('sent') === 1,
      weight: 5,
      effect: (ctx) => { sabotageIncoming(ctx, 0.12); ctx.bump('nights'); },
    },
    {
      id: 'they-have-started-netting-the-hulls',
      volume: 'card',
      weight: 7,
      quiet: 6,
      when: (ctx) => ctx.recall('nights') >= 2,
      options: [
        {
          id: 'one-more-night',
          apply: (ctx) => {
            // The gamble: a bigger cut, and a real chance the diver does not come back.
            const lost = sabotageIncoming(ctx, 0.4);
            ctx.remember('holed', ctx.recall('holed') + lost);
            if (Math.random() < 0.45) ctx.remember('drowned', 1);
            else ctx.remember('survived', 1);
          },
        },
        {
          // R1. Enough hulls. Keep the man, and he knows it.
          id: 'call-him-in',
          apply: (ctx) => {
            ctx.remember('survived', 1);
            const diver = ctx.hero();
            if (diver) { temper(ctx, 'martial', 5, diver); temper(ctx, 'loyalty', 8, diver); }
          },
        },
      ],
    },
    {
      id: 'the-nets-were-waiting',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 90,
      when: (ctx) => ctx.recall('drowned') === 1,
      effect: (ctx) => {
        // He drowned under their hulls and the fleet still lost a night's sleep over it.
        // Every court that hears of it thinks a little better of this one.
        standing(ctx, 8);
        ctx.leaveEcho(storyText('yet-kieu.title'));
      },
    },
    {
      id: 'the-fleet-that-was-not-a-fleet',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 90,
      when: (ctx) => ctx.recall('survived') === 1,
      effect: (ctx) => {
        grantStoryHero(ctx, { trait: 'Yết Kiêu', martial: 55, loyalty: 88 });
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1288 · Vân Đồn — the grain fleet
// ─────────────────────────────────────────────────────────────────────────────

export const vanDon: StoryTemplate = {
  id: 'van-don',
  record: 'chinh-su',
  seedWeight: 2,
  minTurn: 22,
  regard: (ctx) => (ctx.recall('let-them-pass') === 1 ? 'waiting-behind' : undefined),
  seed: (state) => {
    const land = pick(playerLands(state).filter((l) => (l.terrainSummary?.water ?? 0) > 0))
      ?? pick(playerLands(state));
    if (!land) return undefined;
    return { landId: land.id, kingdomId: cold(state)?.id };
  },
  fragments: [
    {
      id: 'thuyen-luong-ay-van-nhac',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_fight-them-at-the-mouth') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-war-fleet-passes-first',
      volume: 'card',
      weight: 7,
      when: (ctx) => (ctx.state.invasions?.length ?? 0) > 0,
      options: [
        {
          id: 'let-the-warships-through',
          apply: (ctx) => {
            // Losing the first engagement on purpose. The commander was punished for it before
            // anyone understood what he had done.
            ctx.remember('let-them-pass', 1);
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 10);
          },
        },
        { id: 'fight-them-at-the-mouth', apply: (ctx) => { reinforceHosts(ctx, 90); ctx.heat(-1); } },
      ],
    },
    {
      id: 'the-grain-fleet-behind-them',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 95,
      when: (ctx) => ctx.recall('let-them-pass') === 1 && ctx.quietFor >= 4,
      effect: (ctx) => {
        const food = plunderSupply(ctx);
        ctx.remember('taken', food);
        grantPowerCard(ctx, 'van-don');
        ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 16);
        ctx.leaveEcho(ctx.land()?.name ?? '');
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1400 · Thông Bảo Hội Sao — the paper money
// ─────────────────────────────────────────────────────────────────────────────

export const paperMoney: StoryTemplate = {
  id: 'paper-money',
  record: 'chinh-su',
  seedWeight: 1.8,
  minTurn: 24,
  regard: (ctx) => (ctx.recall('issued') === 1 ? 'committed' : undefined),
  seed: (state) => {
    const hero = pick(state.heroes.filter((h) => h.stats.administration >= 45)) ?? pick(state.heroes);
    if (!hero) return undefined;
    return { heroId: hero.id };
  },
  fragments: [
    {
      id: 'dong-tien-cu-van-chay',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_bronze-has-always-been-bronze') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'to-giay-trong-tay-ao',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_issue-the-notes') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'a-note-instead-of-a-coin',
      volume: 'card',
      weight: 6,
      options: [
        {
          id: 'issue-the-notes',
          apply: (ctx) => {
            ctx.remember('issued', 1);
            debaseCurrency(ctx, 900, 30, storyText('paper-money.title'));
          },
        },
        {
          // R1. Nobody in the market was asking for paper, and a market notices being left alone.
          id: 'bronze-has-always-been-bronze',
          apply: (ctx) => {
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
            ctx.note('stability', 6);
            ctx.heat(-2);
            ctx.remember('refused', 1);
          },
        },
      ],
    },
    {
      id: 'the-markets-will-not-take-them',
      volume: 'card',
      weight: 7,
      quiet: 6,
      when: (ctx) => ctx.recall('issued') === 1,
      options: [
        {
          id: 'make-refusal-a-crime',
          apply: (ctx) => {
            // It was, in fact, made a capital offence. It did not help.
            ctx.remember('enforced', 1);
            for (const land of playerLands(ctx.state)) land.loyalty = Math.max(10, land.loyalty - 14);
            bounty(ctx, { gold: 320 });
          },
        },
        {
          id: 'withdraw-them',
          apply: (ctx) => {
            ctx.remember('withdrawn', 1);
            bounty(ctx, { gold: -220 });
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 10);
          },
        },
      ],
    },
    {
      id: 'the-treasury-is-full-of-paper',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 90,
      when: (ctx) => ctx.recall('enforced') === 1 && ctx.quietFor >= 8,
      effect: (ctx) => {
        spoilGranary(ctx, 0.25);
        stipend(ctx, { gold: -14 }, 24, storyText('paper-money.title'));
      },
    },
    {
      id: 'bronze-comes-back-out-of-the-walls',
      volume: 'blow',
      terminal: true,
      tone: 'info',
      weight: 80,
      when: (ctx) => ctx.recall('withdrawn') === 1 && ctx.quietFor >= 6,
      effect: (ctx) => { temper(ctx, 'administration', 8); },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 17th c. · Lũy Thầy — Đào Duy Từ's wall
// ─────────────────────────────────────────────────────────────────────────────

export const luyThay: StoryTemplate = {
  id: 'luy-thay',
  record: 'chinh-su',
  seedWeight: 1.7,
  minTurn: 34,
  regard: (ctx) => (ctx.recall('sworn:wall') === 1 ? 'digging' : undefined),
  seed: (state) => {
    const owned = playerLands(state);
    // The frontier province — the one with the most neighbours we do not hold.
    const frontier = owned
      .map((land) => ({
        land,
        exposed: land.neighbors.filter((id) => !owned.some((o) => o.id === id)).length,
      }))
      .sort((a, b) => b.exposed - a.exposed)[0]?.land;
    if (!frontier) return undefined;
    return { landId: frontier.id };
  },
  fragments: [
    {
      id: 'buc-tuong-dat-mua-mua',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-him-draw-the-line') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-strategist-who-came-late',
      volume: 'card',
      weight: 6,
      when: (ctx) => playerLands(ctx.state).length >= 5,
      options: [
        {
          id: 'let-him-draw-the-line',
          apply: (ctx) => {
            const land = ctx.land();
            if (!land) return;
            swearCharge(ctx, 'wall', [
              { kind: 'build', building: 'wall', landId: land.id },
              { kind: 'build', building: 'tower', landId: land.id },
              { kind: 'noLandLost', seasons: 12 },
            ]);
          },
        },
        {
          // R2. He is sent politely on his way, and the men who would have moved the earth
          // are put in the ranks instead.
          id: 'we-do-not-hide-behind-earth',
          apply: (ctx) => { reinforceHosts(ctx, 70); ctx.heat(-1); },
        },
      ],
    },
    {
      id: 'the-line-holds',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 95,
      when: (ctx) => ctx.recall(keptKey('wall')) === 1,
      effect: (ctx) => {
        monument(ctx, { defense: 34, stability: 14 }, ctx.land());
        grantPowerCard(ctx, 'luy-thay');
        ctx.leaveEcho(ctx.land()?.name ?? '');
      },
    },
    {
      id: 'the-earth-is-only-earth',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 80,
      when: (ctx) => ctx.recall(brokenKey('wall')) === 1,
      effect: (ctx) => { bounty(ctx, { supplies: -120 }); },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1070–1075 · Văn Miếu — the temple, and the examinations
// ─────────────────────────────────────────────────────────────────────────────

export const vanMieu: StoryTemplate = {
  id: 'van-mieu',
  record: 'chinh-su',
  seedWeight: 2,
  minTurn: 20,
  regard: (ctx) => (ctx.recall('opened') === 1 ? 'teaching' : undefined),
  seed: (state) => {
    const land = state.lands.find((l) => l.id === state.ascent?.capitalLandId) ?? pick(playerLands(state));
    if (!land) return undefined;
    return { landId: land.id };
  },
  fragments: [
    {
      id: 'cai-sao-van-de-trong',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_the-families-have-always-served') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'sam-cua-mot-nha-khac',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_open-the-examinations') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-sons-of-nobody',
      volume: 'card',
      weight: 6,
      options: [
        {
          id: 'open-the-examinations',
          apply: (ctx) => {
            ctx.remember('opened', 1);
            freeBuilding(ctx, 'communalHall', ctx.land());
            academy(ctx, 40, storyText('van-mieu.title'));
            // The aristocracy notices immediately.
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 8);
          },
        },
        {
          // R1. The houses keep the offices. Everyone outside them hears about that too.
          id: 'the-families-have-always-served',
          apply: (ctx) => {
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 8);
            ctx.note('stability', 8);
            standing(ctx, -4);
            ctx.heat(-1);
            ctx.bump('refused');
          },
        },
      ],
    },
    {
      /**
       * Another stele.
       *
       * The doctoral stelae at the Văn Miếu are a list that was added to for three hundred years,
       * one stone per examination, and a story about them that could only be answered once was
       * the wrong shape. Standing, and only once the examinations are open.
       */
      id: 'dung-them-mot-tam-bia',
      volume: 'whisper',
      weight: 5,
      quiet: 6,
      repeatable: true,
      maxTimes: 3,
      when: (ctx) => ctx.recall('opened') === 1,
      opening: { on: 'land', actionKey: 'dungBia' },
      options: [
        {
          id: 'dung-bia',
          cost: { gold: 120, supplies: 40 },
          apply: (ctx) => {
            const stones = ctx.bump('stelae');
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
            ctx.note('stability', 6);
            const scholar = ctx.hero();
            if (scholar) temper(ctx, 'administration', 3, scholar);
            // A courtyard full of names is a reason to sit the examination.
            if (stones >= 2) grantEdictPoints(ctx, 1);
          },
        },
      ],
    },
    {
      id: 'the-first-list-is-posted',
      volume: 'whisper',
      repeatable: true,
      maxTimes: 2,
      quiet: 8,
      weight: 4,
      when: (ctx) => ctx.recall('opened') === 1,
      effect: (ctx) => { ctx.bump('graduates'); },
    },
    {
      id: 'a-name-nobody-recognises-at-the-top',
      volume: 'card',
      weight: 7,
      quiet: 6,
      when: (ctx) => ctx.recall('graduates') >= 1,
      options: [
        {
          id: 'seat-him-anyway',
          apply: (ctx) => {
            grantStoryHero(ctx, { trait: 'Tiến sĩ', admin: 62, loyalty: 78 });
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 6);
            ctx.remember('seated', 1);
          },
        },
        {
          id: 'find-him-a-quiet-post',
          apply: (ctx) => {
            bounty(ctx, { gold: 120 });
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 8);
          },
        },
      ],
    },
    {
      id: 'the-stelae-go-up',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 85,
      when: (ctx) => ctx.recall('seated') === 1 && ctx.quietFor >= 8,
      effect: (ctx) => {
        monument(ctx, { defense: 8, stability: 18 }, ctx.land());
        grantPowerCard(ctx, 'van-mieu');
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 13th c. · Trần Thủ Độ — "my head has not yet fallen"
// ─────────────────────────────────────────────────────────────────────────────

export const thuDo: StoryTemplate = {
  id: 'thu-do',
  record: 'chinh-su',
  seedWeight: 1.8,
  minTurn: 28,
  regard: (ctx) => (ctx.recall('backed') === 1 ? 'indispensable' : undefined),
  seed: (state) => {
    const heroes = state.heroes.filter((h) => h.id !== 'king');
    const minister = pick(heroes.filter((h) => h.stats.loyalty < 70)) ?? pick(heroes);
    const other = pick(heroes.filter((h) => h.id !== minister?.id));
    if (!minister) return undefined;
    return { heroId: minister.id, otherHeroId: other?.id };
  },
  fragments: [
    {
      id: 'trieu-dinh-van-cai-nhau',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_a-court-is-supposed-to-argue') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'ban-danh-sach-da-ngan',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-him-clean-it-out') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-court-is-full-of-cousins',
      volume: 'card',
      weight: 6,
      when: (ctx) => ctx.state.court.stability < 62,
      options: [
        {
          id: 'let-him-clean-it-out',
          apply: (ctx) => {
            ctx.remember('backed', 1);
            exileHero(ctx, ctx.otherHero(), 16);
          },
        },
        {
          // R1. He is told to put the list away, and he puts the list away.
          id: 'a-court-is-supposed-to-argue',
          apply: (ctx) => {
            const reformer = ctx.hero();
            if (reformer) temper(ctx, 'loyalty', -8, reformer);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 5);
            ctx.note('stability', 5);
            ctx.heat(-1);
            ctx.bump('refused');
          },
        },
      ],
    },
    {
      id: 'my-head-has-not-yet-fallen',
      volume: 'card',
      weight: 8,
      quiet: 6,
      when: (ctx) => ctx.recall('backed') === 1 && (ctx.state.invasions?.length ?? 0) > 0,
      options: [
        {
          id: 'keep-him',
          apply: (ctx) => {
            // The famous line, said to a king who wanted to surrender. Steadies everything, and
            // hands one man a great deal of the realm.
            loyaltyFloor(ctx, 55);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 20);
            reinforceHosts(ctx, 120);
            ctx.remember('held-the-line', 1);
          },
        },
        {
          id: 'he-has-gone-too-far',
          apply: (ctx) => {
            exileHero(ctx, ctx.hero(), 6);
            ctx.remember('dismissed', 1);
          },
        },
      ],
    },
    {
      id: 'the-dynasty-outlives-him',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 85,
      when: (ctx) => ctx.recall('held-the-line') === 1 && ctx.quietFor >= 10,
      effect: (ctx) => {
        grantPowerCard(ctx, 'thu-do');
        ctx.leaveEcho(ctx.hero()?.name ?? '');
      },
    },
    {
      id: 'the-cousins-come-back',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 70,
      when: (ctx) => ctx.recall('dismissed') === 1 && ctx.quietFor >= 8,
      effect: (ctx) => {
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 18);
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1285 · Trần Bình Trọng — the captive
// ─────────────────────────────────────────────────────────────────────────────

export const binhTrong: StoryTemplate = {
  id: 'binh-trong',
  record: 'chinh-su',
  seedWeight: 1.9,
  minTurn: 30,
  regard: (ctx) => (ctx.recall('captured') === 1 ? 'held' : undefined),
  seed: (state) => {
    const hero = pick(state.heroes.filter((h) => h.id !== 'king' && h.stats.martial >= 45));
    const rival = cold(state);
    if (!hero || !rival) return undefined;
    return { heroId: hero.id, kingdomId: rival.id };
  },
  fragments: [
    {
      id: 'cai-ten-o-ben-do',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-him-answer-them-himself') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-rearguard-does-not-come-back',
      volume: 'blow',
      weight: 7,
      when: (ctx) => (ctx.state.invasions?.length ?? 0) > 0 && !ctx.said('the-rearguard-does-not-come-back'),
      effect: (ctx) => {
        captureHero(ctx);
        ctx.remember('captured', 1);
        ctx.heat(3);
      },
    },
    {
      id: 'they-offer-him-a-title',
      volume: 'card',
      weight: 9,
      quiet: 3,
      when: (ctx) => ctx.recall('captured') === 1,
      options: [
        {
          id: 'ransom-him',
          apply: (ctx) => {
            const cost = Math.min(Math.floor(ctx.state.resources.gold * 0.5), 900);
            windfall(ctx, { gold: -cost });
            const hero = ctx.hero();
            if (hero) hero.traits = (hero.traits ?? []).filter((trait) => trait !== 'Captive');
            ctx.remember('ransomed', 1);
          },
        },
        {
          // R4. They wrote to you about him and you did not write back. They mark it down.
          id: 'let-him-answer-them-himself',
          apply: (ctx) => { ctx.remember('left-him', 1); opinion(ctx, -10); },
        },
      ],
    },
    {
      id: 'rather-a-ghost-in-the-south',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 95,
      when: (ctx) => ctx.recall('left-him') === 1 && ctx.quietFor >= 3,
      effect: (ctx) => {
        // He refused the title and was killed for it. The realm gets nothing back except the
        // sentence, and the sentence turns out to be worth a great deal.
        const hero = ctx.hero();
        if (hero) ctx.state.heroes = ctx.state.heroes.filter((h) => h.id !== hero.id);
        loyaltyFloor(ctx, 65);
        ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 22);
        reinforceHosts(ctx, 140);
        grantPowerCard(ctx, 'binh-trong');
        ctx.leaveEcho(hero?.name ?? '');
      },
    },
    {
      id: 'he-comes-home-quiet',
      volume: 'blow',
      terminal: true,
      tone: 'info',
      weight: 70,
      when: (ctx) => ctx.recall('ransomed') === 1 && ctx.quietFor >= 5,
      effect: (ctx) => { temper(ctx, 'loyalty', 12); },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 905 · Khúc Thừa Dụ — autonomy without a war
// ─────────────────────────────────────────────────────────────────────────────

export const khucThuaDu: StoryTemplate = {
  id: 'khuc-thua-du',
  record: 'chinh-su',
  seedWeight: 1.7,
  minTurn: 18,
  regard: (ctx) => (ctx.recall('sworn:quiet') === 1 ? 'negotiating' : undefined),
  seed: (state) => {
    const rival = warmest(state);
    if (!rival) return undefined;
    return { kingdomId: rival.id };
  },
  fragments: [
    {
      id: 'khong-ai-hoi-giay-to',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_simply-govern') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'nobody-is-coming-to-govern-us',
      volume: 'card',
      weight: 6,
      options: [
        {
          id: 'simply-govern',
          apply: (ctx) => {
            // No war, no proclamation. Take the seals and keep sending the letters.
            swearCharge(ctx, 'quiet', [
              { kind: 'peace', atLeast: 48 },
              { kind: 'buildings', count: 10 },
            ], { withinSeasons: 60 });
            truce(ctx, ctx.rival()?.id, 25);
          },
        },
        { id: 'declare-it-outright', apply: (ctx) => {
          const rival = ctx.rival();
          if (rival) opinion(ctx, -25, rival.id);
          ctx.remember('declared', 1);
        } },
      ],
    },
    {
      id: 'the-seals-are-simply-used',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 90,
      when: (ctx) => ctx.recall(keptKey('quiet')) === 1,
      effect: (ctx) => {
        grantPowerCard(ctx, 'khuc-thua-du');
        amnesty(ctx, 14);
        ctx.leaveEcho('');
      },
    },
    {
      id: 'they-noticed-after-all',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 70,
      when: (ctx) => ctx.recall(brokenKey('quiet')) === 1 || ctx.recall('declared') === 1,
      effect: (ctx) => {
        const rival = ctx.rival();
        if (rival) rival.warAppetite = Math.min(100, (rival.warAppetite ?? 0) + 35);
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// The dykes — every year, for a thousand years
// ─────────────────────────────────────────────────────────────────────────────

export const theDykes: StoryTemplate = {
  id: 'the-dykes',
  record: 'chinh-su',
  seedWeight: 2.3,
  minTurn: 14,
  allowMultiple: false,
  regard: (ctx) => (ctx.recall('called') === 1 ? 'on-the-banks' : undefined),
  seed: (state) => {
    const land = pick(playerLands(state).filter((l) => (l.terrainSummary?.water ?? 0) > 0))
      ?? pick(playerLands(state));
    if (!land) return undefined;
    return { landId: land.id };
  },
  fragments: [
    {
      id: 'con-de-nam-do',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_call-the-corvee') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-river-is-higher-than-the-fields',
      volume: 'card',
      band: 'river',
      weight: 7,
      options: [
        {
          id: 'call-the-corvee',
          apply: (ctx) => {
            ctx.remember('called', 1);
            // Everyone who can carry earth, off the fields, now. It works, and it costs.
            population(ctx, 0.88);
            terrainWork(ctx, { defense: 6, food: 4 }, ctx.land());
            for (const land of playerLands(ctx.state)) land.loyalty = Math.max(15, land.loyalty - 6);
          },
        },
        {
          // R3. Four dry days and the whole crop is in. The upside was simply missing: the beat
          // that follows already carries the flood, so the gamble read as a loss with a delay
          // on it rather than as a gamble.
          id: 'the-harvest-comes-first',
          apply: (ctx) => {
            ctx.remember('gambled', 1);
            bounty(ctx, { food: 140, gold: 60 });
            ctx.heat(2);
          },
        },
      ],
    },
    {
      id: 'the-water-comes-over-at-night',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 90,
      when: (ctx) => ctx.recall('gambled') === 1 && ctx.quietFor >= 5,
      effect: (ctx) => {
        spoilGranary(ctx, 0.45);
        population(ctx, 0.82);
        const land = ctx.land();
        if (land) land.loyalty = Math.max(10, land.loyalty - 20);
      },
    },
    {
      id: 'the-banks-hold',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 85,
      when: (ctx) => ctx.recall('called') === 1 && ctx.quietFor >= 8,
      effect: (ctx) => {
        stipend(ctx, { food: 10 }, 30, storyText('the-dykes.title'));
        grantPowerCard(ctx, 'de-dieu');
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 14th c. · Chế Bồng Nga — the king who came back three times
// ─────────────────────────────────────────────────────────────────────────────

export const cheBongNga: StoryTemplate = {
  id: 'che-bong-nga',
  record: 'chinh-su',
  seedWeight: 1.6,
  minTurn: 40,
  regard: (ctx) => (ctx.recall('raids') >= 2 ? 'hunted' : undefined),
  seed: (state) => {
    const rival = cold(state);
    if (!rival) return undefined;
    return { kingdomId: rival.id, landId: state.ascent?.capitalLandId };
  },
  fragments: [
    {
      id: 'nguoi-ban-sung-di-roi',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_buy-the-deserter') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'he-was-in-the-capital-before-anyone-knew',
      volume: 'blow',
      weight: 8,
      repeatable: true,
      maxTimes: 3,
      quiet: 9,
      effect: (ctx) => {
        const n = ctx.bump('raids');
        // Not a wave — a raid that ignores the frontier entirely and is gone by morning.
        const capital = ctx.state.lands.find((l) => l.id === ctx.state.ascent?.capitalLandId);
        const take = Math.floor(ctx.state.resources.gold * (0.18 + n * 0.05));
        windfall(ctx, { gold: -take });
        if (capital) capital.loyalty = Math.max(15, capital.loyalty - 10);
        ctx.heat(3);
      },
    },
    {
      id: 'a-gun-on-a-small-boat',
      volume: 'card',
      weight: 9,
      quiet: 4,
      when: (ctx) => ctx.recall('raids') >= 2,
      options: [
        {
          id: 'buy-the-deserter',
          apply: (ctx) => {
            // He was killed because a defector pointed out which boat he was on.
            const cost = Math.min(Math.floor(ctx.state.resources.gold * 0.4), 700);
            windfall(ctx, { gold: -cost });
            ctx.remember('bought', 1);
          },
        },
        {
          // R2. Fight him properly, like a king, in front of everybody.
          id: 'meet-him-in-the-field',
          apply: (ctx) => { ctx.remember('field', 1); reinforceHosts(ctx, 80); standing(ctx, 6); },
        },
      ],
    },
    {
      id: 'which-boat-he-is-on',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 95,
      when: (ctx) => ctx.recall('bought') === 1,
      effect: (ctx) => {
        killEnemyGeneral(ctx);
        const rival = ctx.rival();
        if (rival) {
          rival.warAppetite = Math.max(0, (rival.warAppetite ?? 0) - 55);
          rival.power = Math.max(10, Math.round((rival.power ?? 40) * 0.7));
        }
        grantPowerCard(ctx, 'che-bong-nga');
        ctx.leaveEcho(rival?.name ?? '');
      },
    },
    {
      id: 'he-does-not-fight-in-fields',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 80,
      when: (ctx) => ctx.recall('field') === 1 && ctx.quietFor >= 6,
      effect: (ctx) => {
        const host = ctx.state.armies.find((a) => a.kingdomId === PLAYER_KINGDOM_ID && !a.isLevy);
        if (host) defectHost(ctx, ctx.rival()?.id);
        else conscript(ctx, 200);
      },
    },
  ],
};

/** The ten middle-length annals, for the catalogue. */
export const ANNAL_STORIES: StoryTemplate[] = [
  hoGuom,
  noThan,
  yetKieu,
  vanDon,
  paperMoney,
  luyThay,
  vanMieu,
  thuDo,
  binhTrong,
  khucThuaDu,
  theDykes,
  cheBongNga,
];
