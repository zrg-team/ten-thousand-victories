import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { livingRivals, pick, playerLands } from '../../systems/story/StorySystem';
import { brokenKey, keptKey, swearCharge } from '../../systems/story/charges';
import {
  bondHeroes,
  disperseIncoming,
  grantPowerCard,
  grantStoryHero,
  killEnemyGeneral,
  launchHostNow,
  heroLeaves,
  loyaltyFloor,
  opinion,
  ourHosts,
  raze,
  reinforceHosts,
  shiftWaveClock,
  spoilRations,
  standing,
  temper,
  terrainWork,
  bounty, windfall,
} from '../../systems/story/effects';
import type { StoryTemplate } from '../../systems/story/types';
import type { GameState, Land } from '../../state/types';

/**
 * The charge-bearing stories: eight histories that ask the realm for something.
 *
 * Every other story in this catalogue speaks and then acts. These ask, wait, and judge — see
 * `systems/story/charges.ts` for why that is a different thing and why it is rationed so hard.
 * **Deliberately eight out of thirty-seven.** `riverStakes.ts` is right that a timer bolted onto a
 * whisper reads as cheap, so the ambient majority of the Chronicle stays exactly as it is; these
 * are the ones where the history itself is an undertaking, and where the payout is a card that
 * exists nowhere else in the game.
 *
 * The shape each one shares:
 *   an opening card that offers the oath beside the option to decline
 *   → a quiet stretch while the realm either does the thing or does not
 *   → a terminal fragment gated on `kept:<key>` or `broken:<key>` that pays or takes.
 */

/** A province with water in it — rivers are where half of this history happened. */
function riverLand(state: GameState): Land | undefined {
  return pick(playerLands(state).filter((land) => (land.terrainSummary?.water ?? 0) > 0))
    ?? pick(playerLands(state));
}

/** A province with high ground. Chi Lăng was a pass, not a field. */
function mountainLand(state: GameState): Land | undefined {
  return pick(playerLands(state).filter((land) => (land.terrainSummary?.mountains ?? 0) > 0))
    ?? pick(playerLands(state));
}

/** The coldest living rival — whoever is most plausibly about to be a problem. */
function coldestRival(state: GameState) {
  return livingRivals(state).sort((a, b) => (a.relations ?? 50) - (b.relations ?? 50))[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1428 · Bình Ngô Đại Cáo — the Great Proclamation
// ─────────────────────────────────────────────────────────────────────────────

export const daiCao: StoryTemplate = {
  id: 'dai-cao',
  record: 'chinh-su',
  seedWeight: 1.4,
  // Late. A proclamation of victory means nothing from a realm that has not won anything, and the
  // charge itself asks for a Great Invasion broken — so seeding it early only wastes a slot.
  minTurn: 60,
  regard: (ctx) => {
    if (ctx.recall(keptKey('proclaim')) === 1) return 'vindicated';
    if (ctx.recall('sworn:proclaim') === 1) return 'drafting';
    return 'watching';
  },
  seed: (state) => {
    const hero = pick(state.heroes.filter((candidate) => candidate.stats.administration >= 45))
      ?? pick(state.heroes);
    if (!hero) return undefined;
    return { heroId: hero.id };
  },
  fragments: [
    {
      id: 'ong-ta-day-hoc-o-lang',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_not-yet') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'muc-mai-san-tren-ban',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-him-write') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-scholar-asks-for-paper',
      volume: 'card',
      weight: 7,
      when: (ctx) => (ctx.state.ascent?.wavesSurvived ?? 0) >= 6,
      salience: (ctx) => (ctx.world.waveBroken ? 8 : 0),
      options: [
        {
          id: 'let-him-write',
          apply: (ctx) => {
            swearCharge(ctx, 'proclaim', [
              { kind: 'battle', count: 1, great: true },
              { kind: 'lands', count: 8 },
              { kind: 'seat', position: 'chancellor', rarity: 'Epic' },
            ]);
          },
        },
        {
          // R1. A boast now is a boast forever, and the man who would have written it waits.
          id: 'not-yet',
          apply: (ctx) => {
            ctx.bump('refused');
            const scholar = ctx.hero();
            if (scholar) temper(ctx, 'loyalty', -6, scholar);
            ctx.heat(-1);
          },
        },
      ],
    },
    {
      id: 'the-proclamation-read-out',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      when: (ctx) => ctx.recall(keptKey('proclaim')) === 1,
      weight: 100,
      effect: (ctx) => {
        grantPowerCard(ctx, 'dai-cao');
        loyaltyFloor(ctx, 70);
        standing(ctx, 14);
        ctx.leaveEcho(ctx.hero()?.name ?? '');
      },
    },
    {
      id: 'the-paper-goes-unused',
      volume: 'card',
      when: (ctx) => ctx.recall('refused') >= 2,
      weight: 4,
      quiet: 8,
      options: [
        {
          // R1. He may still have the words, and being asked twice is worth something.
          id: 'reconsider',
          apply: (ctx) => {
            ctx.remember('refused', 0);
            const scholar = ctx.hero();
            if (scholar) temper(ctx, 'loyalty', 10, scholar);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 4);
            ctx.note('stability', 4);
            ctx.heat(2);
          },
        },
        {
          // R1. Some records are better unwritten, and the man who would have written this one
          // does not stay to be told so twice. A later dynasty may say his name.
          id: 'dismiss-it',
          apply: (ctx) => { heroLeaves(ctx, ctx.hero(), true); ctx.heat(-2); },
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1010 · Chiếu Dời Đô — the Edict on Moving the Capital
// ─────────────────────────────────────────────────────────────────────────────

export const chieuDoiDo: StoryTemplate = {
  id: 'chieu-doi-do',
  record: 'chinh-su',
  seedWeight: 1.6,
  minTurn: 30,
  regard: (ctx) => (ctx.recall('sworn:move') === 1 ? 'surveying' : undefined),
  seed: (state) => {
    // Somewhere that is not the seat, and worth becoming one.
    const capitalId = state.ascent?.capitalLandId;
    const candidates = playerLands(state)
      .filter((land) => land.id !== capitalId)
      .sort((a, b) => (b.buildingCapacity + b.population / 40) - (a.buildingCapacity + a.population / 40));
    const land = candidates[0];
    if (!land) return undefined;
    return { landId: land.id };
  },
  fragments: [
    {
      id: 'cai-cong-thanh-cu',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_hoa-lu-served-our-fathers') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'nguoi-do-dat-ngoai-bai',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_survey-the-plain') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-valley-is-too-narrow',
      volume: 'card',
      weight: 6,
      when: (ctx) => playerLands(ctx.state).length >= 4,
      options: [
        {
          id: 'survey-the-plain',
          apply: (ctx) => {
            const land = ctx.land();
            if (!land) return;
            swearCharge(ctx, 'move', [
              { kind: 'build', building: 'market', landId: land.id },
              { kind: 'build', building: 'wall', landId: land.id },
              { kind: 'hold', landId: land.id, seasons: 14 },
            ]);
          },
        },
        {
          // R2. Easy to hold, and there is nowhere in it to put a market.
          id: 'hoa-lu-served-our-fathers',
          apply: (ctx) => {
            terrainWork(ctx, { defense: 10, gold: -1 }, ctx.land());
            ctx.heat(-2);
            ctx.bump('refused');
          },
        },
      ],
    },
    {
      id: 'the-dragon-rising',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 100,
      when: (ctx) => ctx.recall(keptKey('move')) === 1,
      effect: (ctx) => {
        const land = ctx.land();
        const ascent = ctx.state.ascent;
        // The seat actually moves. Everything that reads `capitalLandId` — the autopilot's build
        // weighting, the invasion targeting, the grace clock that ends the run — follows it, which
        // is what makes this the single largest thing a story in this game can do.
        if (ascent && land && land.ownerId === PLAYER_KINGDOM_ID) {
          ascent.capitalLandId = land.id;
          land.defense += 20;
          loyaltyFloor(ctx, 80, land);
        }
        grantPowerCard(ctx, 'chieu-doi-do');
        ctx.leaveEcho(land?.name ?? '');
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1077 · Nam Quốc Sơn Hà — the poem on the Như Nguyệt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nam Quoc Son Ha - retired, and deliberately still here.
 *
 * The poem was read on the Nhu Nguyet line in 1077, which is the *same campaign* as
 * `tien-phat`: Ly Thuong Kiet struck first at Ung Chau, withdrew, built that line, and held it.
 * Two templates were telling one reign from different ends, so the beats live in `tienPhat.ts`
 * now.
 *
 * It stays registered as a single terminal fragment rather than being deleted, because
 * `storyTemplate(id)` returning undefined leaves a live save holding this story in the list
 * forever - `tickStories` skips it, harmlessly and permanently. This way such a save resolves
 * on the next tick and closes.
 */
export const namQuocSonHa: StoryTemplate = {
  id: 'nam-quoc',
  // Never seeds again. Only an in-flight save can still be standing in it.
  seedWeight: 0,
  minTurn: Number.MAX_SAFE_INTEGER,
  seed: () => undefined,
  fragments: [
    {
      id: 'a-voice-from-the-shrine',
      volume: 'whisper',
      weight: 1,
      terminal: true,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// ~1284 · Hịch Tướng Sĩ — the Proclamation to the Officers
// ─────────────────────────────────────────────────────────────────────────────

export const hichTuongSi: StoryTemplate = {
  id: 'hich-tuong-si',
  record: 'chinh-su',
  seedWeight: 1.8,
  minTurn: 24,
  regard: (ctx) => (ctx.recall('sworn:muster') === 1 ? 'expectant' : undefined),
  seed: (state) => {
    const hero = pick(state.heroes.filter((candidate) => candidate.stats.martial >= 50)) ?? pick(state.heroes);
    if (!hero) return undefined;
    return { heroId: hero.id, kingdomId: coldestRival(state)?.id };
  },
  fragments: [
    {
      id: 'to-hich-con-trong-trap',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_the-men-are-tired') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'ban-sao-chep-tay',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-them-hear-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'he-reads-it-to-the-officers',
      volume: 'card',
      weight: 6,
      when: (ctx) => (ctx.state.ascent?.wavesSurvived ?? 0) >= 3,
      options: [
        {
          id: 'let-them-hear-it',
          apply: (ctx) => {
            swearCharge(ctx, 'muster', [
              { kind: 'host', count: 3, soldiers: 400, generaled: true },
            ], { withinSeasons: 40 });
          },
        },
        {
          // R4. Shame keeps, and so does the sword. A season bought off the clock, not off a stat.
          id: 'the-men-are-tired',
          apply: (ctx) => {
            shiftWaveClock(ctx, 1);
            for (const host of ourHosts(ctx)) host.morale = Math.min(100, host.morale + 5);
            ctx.heat(-1);
          },
        },
      ],
    },
    {
      id: 'three-hosts-under-three-banners',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 100,
      when: (ctx) => ctx.recall(keptKey('muster')) === 1,
      effect: (ctx) => {
        grantPowerCard(ctx, 'hich-van');
        reinforceHosts(ctx, 160);
        grantStoryHero(ctx, { trait: 'Hịch Tướng Sĩ', martial: 62, loyalty: 80 });
        ctx.leaveEcho(ctx.hero()?.name ?? '');
      },
    },
    {
      id: 'the-officers-look-at-their-boots',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 100,
      when: (ctx) => ctx.recall(brokenKey('muster')) === 1,
      effect: (ctx) => {
        // Nothing is destroyed. The cost of a proclamation nobody answered is that it was made.
        for (const army of ctx.state.armies) {
          if (army.kingdomId === PLAYER_KINGDOM_ID) army.morale = Math.max(20, army.morale - 14);
        }
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1427 · Ải Chi Lăng — the pass
// ─────────────────────────────────────────────────────────────────────────────

export const aiChiLang: StoryTemplate = {
  id: 'chi-lang',
  record: 'chinh-su',
  seedWeight: 1.8,
  minTurn: 30,
  regard: (ctx) => (ctx.recall('sworn:ambush') === 1 ? 'waiting-in-the-pass' : undefined),
  seed: (state) => {
    const land = mountainLand(state);
    if (!land) return undefined;
    return { landId: land.id, kingdomId: coldestRival(state)?.id };
  },
  fragments: [
    {
      id: 'canh-dong-ay-de-khong',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_meet-them-on-the-plain') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'co-nguoi-do-lai-cua-ai',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-them-come-in') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-pass-is-narrow-here',
      volume: 'card',
      band: 'mountain',
      weight: 6,
      options: [
        {
          id: 'let-them-come-in',
          apply: (ctx) => {
            const land = ctx.land();
            if (!land) return;
            // Holding the pass while a wave is on the map. Note what is *not* asked for: no timer,
            // no build. The charge is patience under fire, which is the actual history.
            swearCharge(ctx, 'ambush', [
              { kind: 'hold', landId: land.id, seasons: 12 },
              { kind: 'battle', count: 1, great: true },
            ]);
          },
        },
        {
          // R2. Where we can see them coming, and where the pass is nobody's advantage.
          id: 'meet-them-on-the-plain',
          apply: (ctx) => {
            reinforceHosts(ctx, 80);
            terrainWork(ctx, { defense: -4 }, ctx.land());
            ctx.heat(-1);
          },
        },
      ],
    },
    {
      id: 'lieu-thang-does-not-come-out',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 100,
      when: (ctx) => ctx.recall(keptKey('ambush')) === 1,
      effect: (ctx) => {
        killEnemyGeneral(ctx);
        disperseIncoming(ctx, 0.5);
        grantPowerCard(ctx, 'chi-lang');
        ctx.leaveEcho(ctx.land()?.name ?? '');
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1789 · Thần Tốc — the lightning march
// ─────────────────────────────────────────────────────────────────────────────

export const thanToc: StoryTemplate = {
  id: 'than-toc',
  record: 'chinh-su',
  seedWeight: 1.6,
  minTurn: 40,
  regard: (ctx) => (ctx.recall('sworn:march') === 1 ? 'marching' : undefined),
  seed: (state) => {
    const hero = pick(state.heroes.filter((candidate) => candidate.stats.logistics >= 40)) ?? pick(state.heroes);
    if (!hero) return undefined;
    return { heroId: hero.id };
  },
  fragments: [
    {
      id: 'tet-nam-nay-yen-tinh',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_no-army-moves-that-fast') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'vong-khieng-van-treo',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_promise-the-feast') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'we-eat-tet-in-the-capital',
      volume: 'card',
      weight: 6,
      when: (ctx) => ctx.state.armies.some((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy),
      options: [
        {
          id: 'promise-the-feast',
          apply: (ctx) => {
            // A real deadline, and the only one of the eight that carries a short one — because
            // speed is the entire content of this history. Everything else here is open-ended.
            swearCharge(ctx, 'march', [
              { kind: 'lands', count: 6 },
              { kind: 'host', soldiers: 900 },
            ], { withinSeasons: 24 });
          },
        },
        {
          // R1. Nobody is marched through Tết, and every man in the ranks hears that he was not.
          id: 'no-army-moves-that-fast',
          apply: (ctx) => {
            for (const host of ourHosts(ctx)) host.morale = Math.min(100, host.morale + 8);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 4);
            ctx.note('stability', 4);
            ctx.heat(-1);
          },
        },
      ],
    },
    {
      id: 'the-thirtieth-day-of-the-twelfth-month',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 100,
      when: (ctx) => ctx.recall(keptKey('march')) === 1,
      effect: (ctx) => {
        grantPowerCard(ctx, 'than-toc');
        ctx.leaveEcho(ctx.hero()?.name ?? '');
      },
    },
    {
      id: 'the-feast-is-eaten-cold',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 100,
      when: (ctx) => ctx.recall(brokenKey('march')) === 1,
      // The army was promised a feast in the capital and did not get there. It marches on nothing.
      effect: (ctx) => { spoilRations(ctx); },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1075 · Tiên Phát Chế Nhân — strike first to master the enemy
// ─────────────────────────────────────────────────────────────────────────────

export const tienPhat: StoryTemplate = {
  id: 'tien-phat',
  seedWeight: 1.5,
  minTurn: 36,
  regard: (ctx) => (ctx.recall('sworn:strike') === 1 ? 'sharpening' : undefined),
  seed: (state) => {
    const rival = coldestRival(state);
    if (!rival) return undefined;
    return { kingdomId: rival.id };
  },
  fragments: [
    {
      id: 'they-are-stacking-grain-at-the-border',
      volume: 'card',
      weight: 6,
      options: [
        {
          id: 'burn-the-depots',
          apply: (ctx) => {
            const rival = ctx.rival();
            if (!rival) return;
            // The oath is to *make* an enemy and then beat him. Driving relations down is the
            // player's own doing — the charge only asks them to finish what they started.
            swearCharge(ctx, 'strike', [
              { kind: 'relations', kingdomId: rival.id, atMost: 20 },
              { kind: 'battle', count: 2 },
            ], { withinSeasons: 50 });
            // Accepting is itself the provocation. The host is on the road before the ink dries.
            opinion(ctx, -18, rival.id);
            launchHostNow(ctx, 0.85);
          },
        },
        {
          // R4. Letting them come to us is a season they spend walking.
          id: 'wait-for-them',
          apply: (ctx) => { shiftWaveClock(ctx, 1); ctx.heat(-1); ctx.bump('waited'); },
        },
      ],
    },
    {
      id: 'the-depots-burn',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 100,
      when: (ctx) => ctx.recall(keptKey('strike')) === 1,
      effect: (ctx) => {
        grantPowerCard(ctx, 'tien-phat');
        disperseIncoming(ctx, 0.4);
        bounty(ctx, { supplies: 120 });
        ctx.leaveEcho(ctx.rival()?.name ?? '');
      },
    },
    {
      id: 'we-made-an-enemy-and-nothing-else',
      volume: 'blow',
      terminal: true,
      tone: 'threat',
      weight: 100,
      when: (ctx) => ctx.recall(brokenKey('strike')) === 1,
      effect: (ctx) => {
        const rival = ctx.rival();
        if (rival) opinion(ctx, -20, rival.id);
        launchHostNow(ctx, 1.15);
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 40 AD · Hai Bà Trưng — the sisters
// ─────────────────────────────────────────────────────────────────────────────

export const haiBaTrung: StoryTemplate = {
  id: 'hai-ba-trung',
  record: 'chinh-su',
  seedWeight: 1.4,
  minTurn: 34,
  regard: (ctx) => (ctx.recall('sworn:sisters') === 1 ? 'gathering' : undefined),
  seed: (state) => {
    if (livingRivals(state).length < 2) return undefined;
    return { landId: pick(playerLands(state))?.id };
  },
  fragments: [
    {
      id: 'ho-khong-di-qua-day-nua',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_send-them-home') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'hai-con-voi-o-bai-song',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_hear-them-out') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'two-women-at-the-gate',
      volume: 'card',
      weight: 6,
      options: [
        {
          id: 'hear-them-out',
          apply: (ctx) => {
            // The only goal in the game that asks the player to be *liked*, by two different
            // courts at once — and the sisters raised the districts by agreement, not conquest.
            swearCharge(ctx, 'sisters', [
              { kind: 'relationsAny', count: 2, atLeast: 62 },
            ]);
          },
        },
        {
          // R1. Provinces are taken, not asked for — and the asking was done in public.
          id: 'send-them-home',
          apply: (ctx) => {
            standing(ctx, -6);
            const land = ctx.land();
            if (land) land.loyalty = Math.max(0, land.loyalty - 8);
            ctx.heat(-2);
          },
        },
      ],
    },
    {
      id: 'sixty-five-citadels-answer',
      volume: 'blow',
      terminal: true,
      tone: 'milestone',
      weight: 100,
      when: (ctx) => ctx.recall(keptKey('sisters')) === 1,
      effect: (ctx) => {
        // Two, together. `bondHeroes` is applied by the grant helper when both arrive in one beat.
        const first = grantStoryHero(ctx, { trait: 'Trưng Trắc', martial: 68, renown: 80, loyalty: 90 });
        const second = grantStoryHero(ctx, { trait: 'Trưng Nhị', martial: 64, renown: 74, loyalty: 90 });
        bondHeroes(ctx, first, second);
        grantPowerCard(ctx, 'hai-ba');
        ctx.leaveEcho(first?.name ?? second?.name ?? '');
      },
    },
  ],
};

/** Every charge-bearing story, for the catalogue. */
export const CHARGE_STORIES: StoryTemplate[] = [
  daiCao,
  chieuDoiDo,
  namQuocSonHa,
  hichTuongSi,
  aiChiLang,
  thanToc,
  tienPhat,
  haiBaTrung,
];
