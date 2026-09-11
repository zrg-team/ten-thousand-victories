import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { livingRivals, pick, playerLands } from '../../systems/story/StorySystem';
import {
  announce,
  bondHeroes,
  captureHero,
  civilWar,
  coalition,
  defectHost,
  disperseIncoming,
  exactTribute,
  freeBuilding,
  grantClaimSlot,
  grantDraft,
  grantEliteTier,
  grantHost,
  grantPowerCard,
  grantStoryHero,
  heroLeaves,
  joinBloodlessly,
  killHero,
  launchHostNow,
  leaveEcho,
  loyaltyFloor,
  mutinyHosts,
  opinion,
  ourHosts,
  reinforceHosts,
  seizeTreasury,
  shiftWaveClock,
  standing,
  suppressPowerCard,
  temper,
  terrainWork,
  bounty, windfall,
} from '../../systems/story/effects';
import { storyText } from '../../i18n/story';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Eight more stories, each built around a *different* part of the outcome vocabulary rather than
 * around a different anecdote. The catalogue is only as rich as the range of things that can
 * happen in it, and the first seven leaned hard on loyalty, stats and gold — the layers that are
 * forgotten a minute later. These reach the rest: rules taken and given, hosts that defect,
 * heroes you choose to lose, a rival that comes apart, a capital that turns on you.
 */

// ── Hai Bà Trưng, 40–43 ─────────────────────────────────────────────────────

/**
 * Sáu Mươi Lăm Thành — Sixty-Five Citadels.
 *
 * Sixty-five citadels fell in months. Three years later Mã Viện ground all of it back.
 *
 * The largest single gain available anywhere in the game, and the reason it is not simply the
 * best card in the deck is the whisper that follows one season later with a man's name in it and
 * no date attached. The player spends the rest of the run knowing something is coming and unable
 * to find out what or when.
 */
export const sixtyFiveCitadels: StoryTemplate = {
  id: 'sixty-five-citadels',
  record: 'chinh-su',
  regard: (ctx) => {
    if (ctx.recall('refused') === 1) return 'alone';
    if (ctx.recall('named') === 1) return 'named';
    return 'watching';
  },
  seedWeight: 2,
  minTurn: 20,
  seed: (state) => {
    const rival = pick(livingRivals(state).filter((k) => (k.relations ?? 50) < 55));
    const border = pick(playerLands(state));
    if (!rival || !border) return undefined;
    return { kingdomId: rival.id, landId: border.id };
  },

  fragments: [
    {
      id: 'ho-tu-lo-lay-mua-do',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_send-grain-not-men') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'cai-trong-dong-o-san-dinh',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_lead-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-whole-province-has-risen',
      volume: 'card',
      band: 'crowd',
      weight: 8,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 8 : -20),
      options: [
        {
          id: 'lead-it',
          apply: (ctx) => {
            // Two, not five. Measured at five, a run ended holding eighteen provinces against a
            // baseline of eleven and the treasury ran to three times what the sinks could absorb —
            // the largest gain in the game turned out to be a different game.
            let taken = 0;
            for (let i = 0; i < 2; i += 1) {
              if (joinBloodlessly(ctx)) taken += 1;
            }
            ctx.remember('citadels', taken);
            ctx.remember('echoTurn', ctx.state.turn);
            standing(ctx, -8);
            announce(ctx, storyText('sixty-five-citadels.the-whole-province-has-risen.toast', { count: taken }), 'reward');
          },
        },
        {
          id: 'send-grain-not-men',
          cost: { food: 220 },
          apply: (ctx) => {
            // Help without owning it. Smaller, and nobody comes looking for you afterwards.
            bounty(ctx, { humans: 300 });
            standing(ctx, 6);
            ctx.remember('quiet', 1);
          },
        },
        {
          id: 'it-is-not-our-quarrel',
          apply: (ctx) => {
            ctx.remember('refused', 1);
            loyaltyFloor(ctx, 0);
          },
        },
      ],
    },
    {
      id: 'ma-vien-has-been-given-an-army',
      volume: 'whisper',
      weight: 6,
      tone: 'threat',
      quiet: 4,
      when: (ctx) => ctx.recall('citadels') > 0,
      salience: () => 9,
      heat: 4,
      effect: (ctx) => { ctx.remember('named', 1); },
    },
    {
      id: 'no-date-is-given',
      volume: 'whisper',
      weight: 2,
      repeatable: true,
      tone: 'threat',
      quiet: 16,
      when: (ctx) => ctx.recall('named') === 1 && ctx.story.temperature < 9,
      heat: 1.5,
    },
    {
      id: 'he-comes',
      volume: 'blow',
      band: 'march',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('named') === 1 && ctx.story.temperature >= 9,
      salience: () => 14,
      effect: (ctx) => {
        launchHostNow(ctx, 1.8);
        coalition(ctx);
      },
    },
    {
      id: 'nobody-came',
      volume: 'whisper',
      weight: 3,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('quiet') === 1 && ctx.age >= 30,
      effect: (ctx) => { loyaltyFloor(ctx, 64); },
    },
    {
      id: 'they-remember-who-did-not-come',
      volume: 'whisper',
      weight: 3,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('refused') === 1 && ctx.age >= 24,
      effect: (ctx) => { standing(ctx, -5); },
    },
  ],
};

// ── Bà Triệu, 248 ───────────────────────────────────────────────────────────

/**
 * Cưỡi Cơn Gió Mạnh — Ride the Strong Winds.
 *
 * "I want to ride the strong winds, tread the fierce waves… not bend my back to be any man's
 * concubine."
 *
 * A hero with an ambition that is not yours. Give her what she wants and her martial climbs
 * without a cap; refuse and she leaves — and the story does not end when she does, because a
 * later run gets to name her at the head of somebody else's coalition.
 */
export const rideTheWind: StoryTemplate = {
  id: 'ride-the-wind',
  record: 'chinh-su',
  seedWeight: 3,
  minTurn: 10,
  regard: (ctx) => {
    if (ctx.recall('victories') >= 2) return 'risen';
    if (ctx.recall('refusedHer') === 1) return 'burning';
    return undefined;
  },
  seed: (state) => {
    const hero = pick(state.heroes.filter(
      (candidate) => candidate.id !== 'king' && candidate.stats.martial >= 45,
    ));
    return hero ? { heroId: hero.id } : undefined;
  },

  fragments: [
    {
      id: 'so-kho-ghi-tay-ba-ay',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_the-granary-needs-a-hand') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'ao-giap-may-lai-vua-nguoi',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_give-her-the-field') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'she-will-not-take-the-post',
      volume: 'card',
      band: 'mountain',
      weight: 7,
      quiet: 2,
      when: (ctx) => Boolean(ctx.hero()),
      salience: (ctx) => (ctx.age >= 3 ? 7 : -20),
      options: [
        {
          id: 'give-her-the-field',
          cost: { humans: 500, gold: 90 },
          apply: (ctx) => {
            const host = grantHost(ctx, 500);
            const hero = ctx.hero();
            if (host && hero) host.generalHeroId = hero.id;
            ctx.remember('field', 1);
            ctx.remember('echoTurn', ctx.state.turn);
          },
        },
        {
          id: 'the-granary-needs-a-hand',
          apply: (ctx) => {
            ctx.remember('refusedHer', 1);
            temper(ctx, 'loyalty', -25);
            ctx.heat(4);
          },
        },
      ],
    },
    {
      id: 'no-cap-on-what-she-can-become',
      volume: 'whisper',
      weight: 4,
      tone: 'reward',
      repeatable: true,
      quiet: 9,
      when: (ctx) => ctx.recall('field') === 1 && Boolean(ctx.hero()),
      salience: (ctx) => (ctx.world.wonBattle ? 7 : 1),
      effect: (ctx) => {
        // Deliberately uncapped by the usual 100: she is the one hero who keeps getting better.
        temper(ctx, 'martial', 4);
        temper(ctx, 'renown', 3);
        ctx.bump('victories');
      },
    },
    {
      id: 'the-lady-in-gold',
      volume: 'card',
      band: 'march',
      weight: 5,
      quiet: 8,
      tone: 'reward',
      terminal: true,
      when: (ctx) => ctx.recall('victories') >= 3,
      salience: () => 8,
      options: [
        {
          id: 'let-her-lead',
          apply: (ctx) => {
            grantEliteTier(ctx);
            reinforceHosts(ctx, 600);
            temper(ctx, 'loyalty', 30);
            const hero = ctx.hero();
            if (hero) hero.traits = [...(hero.traits ?? []), 'Rides the Wind'];
          },
        },
        {
          id: 'she-is-becoming-larger-than-the-throne',
          apply: (ctx) => {
            // The safe answer, and it costs her.
            heroLeaves(ctx);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 12);
          },
        },
      ],
    },
    {
      id: 'she-goes',
      volume: 'whisper',
      weight: 5,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('refusedHer') === 1,
      salience: () => 9,
      effect: (ctx) => {
        const hero = ctx.hero();
        heroLeaves(ctx);
        if (hero) leaveEcho(ctx, hero.name);
      },
    },
    {
      id: 'at-the-head-of-the-coalition',
      volume: 'blow',
      band: 'march',
      weight: 6,
      terminal: true,
      tone: 'threat',
      when: (ctx) => Boolean(ctx.echoOf('ride-the-wind', 'she-goes')) && ctx.age >= 8,
      salience: () => 8,
      effect: (ctx) => {
        coalition(ctx);
        launchHostNow(ctx, 1.4);
      },
    },
  ],
};

// ── Lê Lai, 1419 ────────────────────────────────────────────────────────────

/**
 * Lê Lai Đổi Áo — The Substitution.
 *
 * Lê Lai put on Lê Lợi's clothes, rode out to be captured and killed, and bought the real leader
 * his escape.
 *
 * The card *is* naming which of your heroes dies. Not a random loss — one you choose, by name,
 * and every survivor is permanently marked by having watched it.
 */
export const theSubstitution: StoryTemplate = {
  id: 'substitution',
  record: 'chinh-su',
  regard: (ctx) => {
    if (ctx.recall('substituted') === 1) return 'remembered';
    if (ctx.recall('refusedToChoose') === 1) return 'unasked';
    return undefined;
  },
  seedWeight: 2,
  minTurn: 24,
  seed: (state) => {
    if (state.heroes.length < 3) return undefined;
    const land = pick(playerLands(state).filter((l) => l.defense < 40));
    return land ? { landId: land.id } : undefined;
  },

  fragments: [
    {
      id: 'khong-ai-biet-dung-o-dau',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_nobody-wears-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'la-co-cu-dot-sau-tran',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_someone-else-wears-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'they-know-which-banner-is-yours',
      volume: 'card',
      band: 'night',
      weight: 8,
      quiet: 2,
      // Only when the realm is genuinely in trouble; this is not a card for a good season.
      when: (ctx) => ctx.state.heroes.length >= 3
        && (ctx.world.lostLand || (ctx.state.ascent?.threat ?? 0) > (ctx.state.ascent?.defensePower ?? 1) * 1.2),
      salience: () => 9,
      tone: 'threat',
      options: [
        {
          id: 'someone-else-wears-it',
          apply: (ctx) => {
            // The most loyal hero volunteers. Naming him is the whole card.
            const willing = ctx.state.heroes
              .filter((hero) => hero.id !== 'king')
              .sort((a, b) => b.stats.loyalty - a.stats.loyalty)[0];
            const fallen = killHero(ctx, willing);
            ctx.remember('substituted', 1);
            if (fallen) {
              ctx.remember('echoTurn', ctx.state.turn);
              leaveEcho(ctx, fallen.name);
              announce(ctx, storyText('substitution.they-know-which-banner-is-yours.toast', { hero: fallen.name }), 'threat');
            }
            for (const hero of ctx.state.heroes) {
              hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 15);
            }
            loyaltyFloor(ctx, 80, ctx.land());
            disperseIncoming(ctx, 0.5);
          },
        },
        {
          id: 'nobody-wears-it',
          apply: (ctx) => {
            // Refusing to choose costs more than choosing.
            ctx.remember('refusedToChoose', 1);
            const host = ourHosts(ctx)[0];
            if (host) {
              host.units.spearmen = Math.floor(host.units.spearmen * 0.4);
              host.units.archers = Math.floor(host.units.archers * 0.4);
              host.morale = Math.max(10, host.morale - 40);
            }
            killHero(ctx, ctx.state.heroes.find((h) => h.id !== 'king'));
          },
        },
      ],
    },
    {
      id: 'his-name-is-read-first',
      volume: 'whisper',
      weight: 5,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('substituted') === 1,
      quiet: 6,
      effect: (ctx) => {
        // Every year, before the king's own. That is the whole reward and it is enough.
        loyaltyFloor(ctx, 72);
        grantDraft(ctx, 1);
      },
    },
    {
      id: 'nobody-speaks-of-it',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('refusedToChoose') === 1,
      quiet: 5,
      effect: (ctx) => {
        for (const hero of ctx.state.heroes) hero.stats.loyalty = Math.max(0, hero.stats.loyalty - 10);
      },
    },
  ],
};

// ── Hoàn Kiếm, 1428 ─────────────────────────────────────────────────────────

/**
 * Thuận Thiên — The Borrowed Sword.
 *
 * The blade came up in a net; the hilt was found later in a banyan tree and fitted it. It won the
 * war, and then the golden turtle surfaced to take it back.
 *
 * A boon so large it is obviously not free, and **nothing ever says it must be given back**.
 * Keeping it simply makes four fragments more salient every season, none of them good.
 */
export const borrowedSword: StoryTemplate = {
  id: 'borrowed-sword',
  record: 'da-su',
  regard: (ctx) => {
    if (ctx.recall('kept') === 1) return 'kept';
    if (ctx.recall('returned') === 1) return 'lightened';
    if (ctx.recall('held') === 1) return 'armed';
    return undefined;
  },
  seedWeight: 2,
  minTurn: 26,
  seed: (state) => {
    const water = pick(state.lands.filter(
      (land) => land.ownerId === PLAYER_KINGDOM_ID && (land.terrainSummary?.water ?? 0) > 0,
    )) ?? pick(playerLands(state));
    return water ? { landId: water.id } : undefined;
  },

  fragments: [
    {
      id: 'luoi-guom-phai-mai-lai',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_it-is-mine') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'nguoi-ta-ra-ho-xem-rua',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_give-it-back') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'a-blade-in-the-net',
      volume: 'card',
      band: 'river',
      weight: 7,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 7 : -20),
      options: [
        {
          id: 'take-it',
          apply: (ctx) => {
            ctx.remember('held', 1);
            ctx.remember('echoTurn', ctx.state.turn);
            grantEliteTier(ctx);
            reinforceHosts(ctx, 400);
            for (const army of ourHosts(ctx)) army.morale = 100;
          },
        },
        {
          id: 'leave-it-in-the-water',
          apply: (ctx) => {
            ctx.remember('declined', 1);
            // A quiet, real reward for not reaching. Nobody will ever tell you it was the right call.
            loyaltyFloor(ctx, 65);
          },
        },
      ],
    },
    {
      id: 'the-war-is-won',
      volume: 'whisper',
      weight: 4,
      tone: 'reward',
      quiet: 8,
      when: (ctx) => ctx.recall('held') === 1 && (ctx.world.waveBroken || ctx.world.wonBattle),
      effect: (ctx) => { ctx.bump('wonWith'); ctx.heat(2); },
    },
    {
      id: 'the-turtle-surfaces',
      volume: 'card',
      band: 'river',
      weight: 8,
      quiet: 6,
      tone: 'info',
      when: (ctx) => ctx.recall('held') === 1 && ctx.recall('wonWith') >= 1,
      salience: (ctx) => 5 + ctx.story.temperature,
      options: [
        {
          id: 'give-it-back',
          apply: (ctx) => {
            ctx.remember('returned', 1);
            // The buff goes. What replaces it is better and slower.
            for (const army of ourHosts(ctx)) army.elite = Math.max(0, (army.elite ?? 1) - 1);
            loyaltyFloor(ctx, 80);
            grantClaimSlot(ctx, 1);
            grantDraft(ctx, 1);
          },
        },
        {
          id: 'it-is-mine',
          apply: (ctx) => {
            ctx.remember('kept', 1);
            // R3. You bled for it and you keep it — blade and edge both. What was lent is taken
            // back later; that beat already exists and does the taking.
            grantEliteTier(ctx);
            ctx.heat(5);
          },
        },
      ],
    },
    {
      id: 'the-water-is-lower-every-year',
      volume: 'whisper',
      weight: 3,
      repeatable: true,
      tone: 'threat',
      quiet: 10,
      when: (ctx) => ctx.recall('kept') === 1,
      heat: 2,
    },
    {
      id: 'what-was-lent-is-taken',
      volume: 'blow',
      band: 'fire',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('kept') === 1 && ctx.story.temperature >= 9,
      salience: () => 13,
      effect: (ctx) => {
        for (const army of ourHosts(ctx)) {
          army.elite = 0;
          army.morale = Math.max(10, army.morale - 45);
        }
        const lost = suppressPowerCard(ctx);
        if (lost) announce(ctx, storyText('borrowed-sword.what-was-lent-is-taken.toast', {}), 'threat');
      },
    },
    {
      id: 'the-lake-keeps-it',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('returned') === 1,
      quiet: 5,
    },
    {
      id: 'it-stayed-in-the-water',
      volume: 'whisper',
      weight: 3,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('declined') === 1 && ctx.age >= 26,
    },
  ],
};

// ── Yi Sun-sin, 1597 ────────────────────────────────────────────────────────

/**
 * Kẻ Bị Vu — The Slandered General.
 *
 * A planted lie persuaded the Joseon court to imprison and torture its best commander. They
 * reinstated him after catastrophe, with thirteen ships left.
 *
 * The only story in the set whose antagonist is **your own court**. There is no good option:
 * believe it and lose him, protect him and the court turns on you.
 */
export const slanderedGeneral: StoryTemplate = {
  id: 'slandered',
  record: 'chinh-su',
  seedWeight: 2,
  minTurn: 22,
  regard: (ctx) => {
    if (ctx.recall('catastrophe') === 1) return 'spared';
    if (ctx.recall('imprisoned') === 1) return 'silent';
    return undefined;
  },
  seed: (state) => {
    const best = state.heroes
      .filter((hero) => hero.id !== 'king')
      .sort((a, b) => b.stats.martial - a.stats.martial)[0];
    return best && best.stats.martial >= 55 ? { heroId: best.id } : undefined;
  },

  entry: 'buc-thu',
  nodes: [
    { id: 'buc-thu', historicity: 'chinh-su', patience: 5, onIgnored: 'bi-cach' },
    { id: 'bi-cach', historicity: 'chinh-su', patience: 8, onIgnored: 'muoi-ba-chiec' },
    { id: 'muoi-ba-chiec', historicity: 'chinh-su', patience: 4, onIgnored: 'khong-goi-ve' },
    { id: 'phuc-chuc', historicity: 'chinh-su', terminal: true },
    { id: 'khong-goi-ve', historicity: 'da-su', terminal: true },
    // Hunting the forger is not what the record did with this.
    { id: 'tim-nguoi-viet', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'khong-tim-ra' },
    { id: 'tim-ra', historicity: 'ngoai-truyen', terminal: true },
    { id: 'khong-tim-ra', historicity: 'ngoai-truyen', terminal: true },
  ],
  fragments: [
    {
      id: 'muoi-ba-chiec-va-mot-nguoi',
      volume: 'blow',
      band: 'river',
      in: ['phuc-chuc'],
      weight: 10,
      terminal: true,
      tone: 'milestone',
      effect: (ctx) => {
        const hero = ctx.hero();
        if (hero) { temper(ctx, 'martial', 12, hero); temper(ctx, 'renown', 20, hero); }
        loyaltyFloor(ctx, 60);
        leaveEcho(ctx, hero?.name ?? '');
      },
    },
    {
      /** Hunting the hand that wrote it. The one decision the divergence owes. */
      id: 'tim-den-dau-thi-dung',
      volume: 'card',
      band: 'court',
      in: ['tim-nguoi-viet'],
      weight: 9,
      quiet: 3,
      salience: (ctx) => (ctx.age >= 3 ? 9 : -20),
      options: [
        {
          id: 'hoi-cho-ra',
          cost: { gold: 140 },
          to: 'tim-ra',
          historicity: 'divergent',
          apply: (ctx) => { ctx.remember('hoi', 1); },
        },
        {
          id: 'dung-o-day',
          to: 'khong-tim-ra',
          historicity: 'divergent',
          apply: (ctx) => {
            ctx.remember('dung', 1);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
            ctx.note('stability', 6);
          },
        },
      ],
    },
    {
      id: 'khong-tim-ra-ai-ca',
      volume: 'whisper',
      in: ['khong-tim-ra'],
      weight: 8,
      terminal: true,
      effect: (ctx) => {
        const hero = ctx.hero();
        if (hero) temper(ctx, 'loyalty', -10, hero);
      },
    },
    {
      id: 'ong-ta-ve-cam-quan-lai',
      volume: 'whisper',
      in: ['phuc-chuc'],
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_reinstate-him') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'buc-thu-ay-van-trong-cap',
      volume: 'whisper',
      in: ['buc-thu', 'tim-nguoi-viet'],
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_find-out-who-wrote-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'a-letter-nobody-can-source',
      volume: 'card',
      in: ['buc-thu'],
      band: 'court',
      weight: 7,
      quiet: 3,
      tone: 'threat',
      when: (ctx) => Boolean(ctx.hero()),
      salience: (ctx) => (ctx.age >= 4 ? 7 : -20),
      options: [
        {
          id: 'believe-it',
          to: 'bi-cach',
          historicity: 'annal',
          apply: (ctx) => {
            captureHero(ctx);
            ctx.remember('imprisoned', 1);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 14);
            const hero = ctx.hero();
            if (hero) hero.assignedTo = undefined;
          },
        },
        {
          id: 'protect-him',
          to: 'bi-cach',
          historicity: 'annal',
          apply: (ctx) => {
            ctx.remember('protected', 1);
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 22);
            temper(ctx, 'loyalty', 30);
            ctx.heat(3);
          },
        },
        {
          id: 'find-out-who-wrote-it',
          to: 'tim-nguoi-viet',
          historicity: 'divergent',
          cost: { gold: 160 },
          apply: (ctx) => {
            ctx.remember('investigated', 1);
            // It was them. Everyone can see it now.
            const rival = ctx.rival() ?? pick(livingRivals(ctx.state));
            if (rival) opinion(ctx, -30, rival.id);
            temper(ctx, 'loyalty', 18);
            standing(ctx, 6);
          },
        },
      ],
    },
    {
      id: 'the-fleet-is-lost-without-him',
      volume: 'blow',
      in: ['bi-cach'],
      band: 'coast',
      weight: 8,
      tone: 'threat',
      when: (ctx) => ctx.recall('imprisoned') === 1,
      quiet: 4,
      salience: () => 10,
      effect: (ctx) => {
        for (const army of ourHosts(ctx)) {
          army.units.spearmen = Math.floor(army.units.spearmen * 0.5);
          army.units.archers = Math.floor(army.units.archers * 0.5);
          army.morale = Math.max(10, army.morale - 35);
        }
        ctx.remember('catastrophe', 1);
      },
    },
    {
      id: 'thirteen-ships',
      volume: 'card',
      in: ['muoi-ba-chiec'],
      band: 'coast',
      weight: 9,
      tone: 'reward',
      when: (ctx) => ctx.recall('catastrophe') === 1,
      salience: () => 12,
      options: [
        {
          id: 'reinstate-him',
          to: 'phuc-chuc',
          historicity: 'annal',
          apply: (ctx) => {
            const hero = ctx.hero();
            if (hero) {
              hero.traits = (hero.traits ?? []).filter((trait) => trait !== 'Captive');
              hero.stats.loyalty = 100;
              hero.stats.martial = Math.min(100, hero.stats.martial + 12);
            }
            grantEliteTier(ctx);
            reinforceHosts(ctx, 500);
            grantPowerCard(ctx, 'feigned-retreat');
          },
        },
        {
          id: 'he-stays-where-he-is',
          to: 'khong-goi-ve',
          historicity: 'annal',
          apply: (ctx) => {
            killHero(ctx);
            coalition(ctx);
          },
        },
      ],
    },
    {
      id: 'the-court-does-not-forget',
      volume: 'whisper',
      in: ['khong-goi-ve'],
      weight: 4,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('protected') === 1 && ctx.story.temperature >= 5,
      effect: (ctx) => {
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 10);
        mutinyHosts(ctx, 3);
      },
    },
    {
      id: 'the-forger-is-found',
      volume: 'whisper',
      in: ['tim-ra'],
      weight: 5,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('investigated') === 1,
      quiet: 6,
      effect: (ctx) => {
        exactTribute(ctx, 14, 20);
        temper(ctx, 'renown', 10);
      },
    },
  ],
};

// ── Honnō-ji, 1582 ──────────────────────────────────────────────────────────

/**
 * Người Được Tin Nhất — The Trusted Subordinate.
 *
 * Akechi Mitsuhide turned on Oda Nobunaga at the height of his success.
 *
 * Weighted by **concentration**: hosts, provinces and seats held by one hero. Efficiency is how
 * you die, and the story only exists at all if the player has been efficient.
 */
export const trustedSubordinate: StoryTemplate = {
  id: 'trusted',
  record: 'chinh-su',
  seedWeight: 2,
  minTurn: 30,
  regard: (ctx) => {
    if (ctx.recall('divided') === 1) return 'passedover';
    return 'diligent';
  },
  seed: (state) => {
    // Whoever holds the most. If nobody has been given much, there is no story here.
    const weight = (heroId: string) =>
      state.armies.filter((a) => a.generalHeroId === heroId).length * 2
      + state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID
        && state.heroes.some((h) => h.id === heroId && h.assignedTo === l.id)).length
      + Object.values(state.court.seats).filter((seat) => seat === heroId).length * 2;
    const top = state.heroes
      .filter((hero) => hero.id !== 'king')
      .sort((a, b) => weight(b.id) - weight(a.id))[0];
    return top && weight(top.id) >= 3 ? { heroId: top.id } : undefined;
  },

  fragments: [
    {
      id: 'khong-ai-dam-hoi-so-quan',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_he-has-earned-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'hai-cai-an-hai-cai-trap',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_split-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'he-holds-a-great-deal',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      when: (ctx) => Boolean(ctx.hero()),
      heat: 2,
      tone: 'info',
    },
    {
      id: 'nobody-else-is-asked',
      volume: 'whisper',
      weight: 3,
      quiet: 8,
      when: (ctx) => ctx.said('he-holds-a-great-deal') && Boolean(ctx.hero()),
      heat: 2.5,
      tone: 'threat',
    },
    {
      id: 'divide-what-he-holds',
      volume: 'card',
      band: 'court',
      weight: 6,
      quiet: 5,
      when: (ctx) => ctx.said('nobody-else-is-asked') && Boolean(ctx.hero()),
      salience: (ctx) => 3 + ctx.story.temperature,
      options: [
        {
          id: 'split-it',
          apply: (ctx) => {
            const hero = ctx.hero();
            if (hero) {
              for (const army of ctx.state.armies) {
                if (army.generalHeroId === hero.id) army.generalHeroId = undefined;
              }
              hero.stats.loyalty = Math.max(0, hero.stats.loyalty - 18);
            }
            ctx.remember('divided', 1);
            ctx.heat(-8);
          },
        },
        {
          id: 'he-has-earned-it',
          apply: (ctx) => {
            temper(ctx, 'loyalty', 10);
            grantEliteTier(ctx);
            ctx.remember('doubledDown', 1);
            ctx.heat(4);
          },
        },
      ],
    },
    {
      id: 'the-tea-house',
      volume: 'blow',
      band: 'fire',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('doubledDown') === 1 && ctx.story.temperature >= 10,
      salience: () => 14,
      effect: (ctx) => {
        const host = defectHost(ctx);
        if (host) announce(ctx, storyText('trusted.the-tea-house.toast', { hero: host.name }), 'threat');
        seizeTreasury(ctx);
      },
    },
    {
      id: 'he-was-only-tired',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('divided') === 1 && ctx.age >= 20,
      effect: (ctx) => { temper(ctx, 'loyalty', 25); },
    },
  ],
};

// ── The Cham engineer ───────────────────────────────────────────────────────

/**
 * Người Thợ Chăm — The Cham Engineer.
 *
 * A prisoner from the last war has been drawing something in the dirt of his cell for a month.
 *
 * The Rules-layer showcase: a real Power card enters the real draft deck, permanently. If the
 * writing budget ever runs short, this is the row to keep — a resource swing is forgotten inside
 * a minute, and a rule you now own changes every decision for the rest of the run.
 */
export const chamEngineer: StoryTemplate = {
  id: 'cham-engineer',
  record: 'ngoai-truyen',
  regard: (ctx) => (ctx.recall('freed') === 1 ? 'gone' : 'drawing'),
  seedWeight: 3,
  minTurn: 16,
  seed: (state) => {
    const rival = pick(livingRivals(state));
    const land = pick(playerLands(state));
    if (!rival || !land) return undefined;
    return { kingdomId: rival.id, landId: land.id };
  },

  fragments: [
    {
      id: 'con-duong-moi-ra-ben',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_roads') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'may-cai-guong-o-xuong',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_ramparts') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'drawing-in-the-dirt',
      volume: 'card',
      weight: 6,
      quiet: 2,
      repeatable: true,
      maxTimes: 3,
      when: (ctx) => ctx.recall('materials') < 3,
      salience: (ctx) => (ctx.age >= 2 ? 6 : -20),
      opening: { on: 'treasury', actionKey: 'giveHimMaterials' },
      options: [
        {
          id: 'give-him-materials',
          cost: { supplies: 140, gold: 80 },
          apply: (ctx) => {
            ctx.remember('freed', 1);
            ctx.bump('materials');
            ctx.remember('echoTurn', ctx.state.turn);
            // He is given materials and he uses them the same week. Cost-only before this.
            // `freeBuilding` refuses once the province is full, which is the right way for a
            // standing door to run out: the ground says no before the story does.
            freeBuilding(ctx, 'workshop');
            const engineer = ctx.hero();
            if (engineer) temper(ctx, 'administration', 4, engineer);
            terrainWork(ctx, { defense: 3 }, ctx.land());
          },
        },
      ],
    },
    {
      id: 'the-first-engine',
      volume: 'card',
      band: 'granary',
      weight: 7,
      quiet: 5,
      tone: 'reward',
      terminal: true,
      when: (ctx) => ctx.recall('freed') === 1,
      salience: () => 9,
      options: [
        {
          id: 'ramparts',
          apply: (ctx) => {
            grantPowerCard(ctx, 'earthen-ramparts');
            terrainWork(ctx, { defense: 10 });
          },
        },
        {
          id: 'arrows',
          apply: (ctx) => {
            grantPowerCard(ctx, 'fire-arrows');
            reinforceHosts(ctx, 200);
          },
        },
        {
          id: 'roads',
          apply: (ctx) => {
            grantPowerCard(ctx, 'salt-roads');
            grantClaimSlot(ctx, 1);
          },
        },
      ],
    },
    {
      id: 'an-unfamiliar-design',
      volume: 'blow',
      band: 'border',
      weight: 6,
      terminal: true,
      tone: 'threat',
      // He was never freed, and twenty seasons later the siege engines outside are not ours.
      when: (ctx) => ctx.recall('freed') === 0 && ctx.age >= 22,
      salience: (ctx) => (ctx.age - 22) * 0.4,
      effect: (ctx) => {
        for (const land of playerLands(ctx.state)) {
          land.defense = Math.max(1, land.defense - 6);
        }
        launchHostNow(ctx, 1.2);
      },
    },
  ],
};

// ── The Assembly ────────────────────────────────────────────────────────────

/**
 * Nghị Viện — The Assembly Voted.
 *
 * A rule you built the run around is struck from the books. You are the king; you were still not
 * consulted. The one outcome that makes the Chronicle genuinely dangerous rather than merely
 * dramatic — and it only exists once the player actually has something to lose.
 */
export const theAssembly: StoryTemplate = {
  id: 'assembly',
  record: 'chinh-su',
  seedWeight: 2,
  minTurn: 34,
  seed: (state) => {
    const held = Object.values(state.ascent?.cardStacks ?? {}).reduce((sum, n) => sum + n, 0);
    if (held < 3) return undefined;
    const minister = pick(state.heroes.filter((hero) => hero.id !== 'king' && hero.stats.diplomacy >= 40));
    return { heroId: minister?.id };
  },

  fragments: [
    {
      id: 'cai-phong-ay-khoa-cua',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_dissolve-it') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'ho-hop-lai-vao-thang-sau',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-them-vote') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'they-are-meeting-without-you',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      heat: 3,
      tone: 'threat',
    },
    {
      id: 'a-list-is-being-drawn-up',
      volume: 'whisper',
      weight: 4,
      quiet: 6,
      when: (ctx) => ctx.said('they-are-meeting-without-you'),
      heat: 3,
      tone: 'threat',
    },
    {
      id: 'buy-the-room',
      volume: 'card',
      band: 'court',
      weight: 6,
      quiet: 4,
      when: (ctx) => ctx.said('a-list-is-being-drawn-up'),
      salience: (ctx) => 4 + ctx.story.temperature,
      options: [
        {
          id: 'pay-them',
          cost: { gold: 320 },
          apply: (ctx) => {
            ctx.remember('bought', 1);
            ctx.heat(-10);
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 6);
          },
        },
        {
          id: 'let-them-vote',
          apply: (ctx) => {
            ctx.remember('allowed', 1);
            // R3. The bribe money stays in the treasury. The vote goes however the vote goes.
            bounty(ctx, { gold: 180 });
            ctx.heat(4);
          },
        },
        {
          id: 'dissolve-it',
          apply: (ctx) => {
            ctx.remember('dissolved', 1);
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 25);
            for (const land of playerLands(ctx.state)) land.loyalty = Math.max(0, land.loyalty - 12);
            ctx.heat(-14);
          },
        },
      ],
    },
    {
      id: 'the-assembly-voted',
      volume: 'blow',
      band: 'court',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('allowed') === 1 && ctx.story.temperature >= 8,
      salience: () => 13,
      effect: (ctx) => {
        const lost = suppressPowerCard(ctx);
        if (lost) announce(ctx, storyText('assembly.the-assembly-voted.toast', {}), 'threat');
      },
    },
    {
      id: 'the-list-is-burned',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('bought') === 1 || ctx.recall('dissolved') === 1,
      quiet: 5,
      effect: (ctx) => { grantDraft(ctx, 1); },
    },
  ],
};

// ── Nika, 532 ───────────────────────────────────────────────────────────────

/**
 * Loạn Gạo — The Rice Riot.
 *
 * There is no enemy. It is your own people, at the palace gate, and **prosperity is what did it**:
 * this fires on a deep treasury and neglected loyalty, so it punishes exactly the run that thinks
 * it is winning.
 */
export const riceRiot: StoryTemplate = {
  id: 'rice-riot',
  record: 'chinh-su',
  seedWeight: 2,
  minTurn: 28,
  seed: (state) => {
    if (state.resources.gold < 500) return undefined;
    const capital = state.lands.find((land) => land.id === state.ascent?.capitalLandId);
    return capital ? { landId: capital.id } : undefined;
  },

  fragments: [
    {
      id: 'linh-canh-cho-hai-ca',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_double-the-watch') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'kho-trong-va-cho-yen',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_give-it-away') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'the-price-in-the-capital',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      when: (ctx) => ctx.state.resources.gold >= 450,
      heat: 2.5,
      tone: 'info',
    },
    {
      id: 'they-are-counting-the-carts',
      volume: 'whisper',
      weight: 4,
      quiet: 7,
      when: (ctx) => ctx.said('the-price-in-the-capital')
        && playerLands(ctx.state).some((land) => land.loyalty < 60),
      heat: 3,
      tone: 'threat',
    },
    {
      id: 'open-the-stores',
      volume: 'card',
      band: 'crowd',
      weight: 6,
      quiet: 4,
      when: (ctx) => ctx.said('they-are-counting-the-carts'),
      salience: (ctx) => 3 + ctx.story.temperature,
      options: [
        {
          id: 'give-it-away',
          cost: { gold: 260, food: 180 },
          apply: (ctx) => {
            loyaltyFloor(ctx, 68);
            ctx.heat(-12);
            ctx.remember('fed', 1);
          },
        },
        {
          id: 'double-the-watch',
          cost: { supplies: 120 },
          apply: (ctx) => {
            const capital = ctx.land();
            if (capital) capital.defense += 12;
            ctx.remember('watched', 1);
            ctx.heat(2);
          },
        },
        {
          id: 'they-will-tire-of-it',
          apply: (ctx) => {
            ctx.remember('ignored', 1);
            // R3. Hunger sends people home, they say. The stores stay shut and full, and that
            // is the whole of what this buys.
            bounty(ctx, { food: 200 });
            ctx.heat(5);
          },
        },
      ],
    },
    {
      id: 'nika',
      volume: 'blow',
      band: 'fire',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.story.temperature >= 9 && ctx.recall('fed') === 0,
      salience: () => 13,
      effect: (ctx) => {
        // No enemy, no army to fight, and the treasury is what they came for.
        const taken = seizeTreasury(ctx);
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 26);
        const capital = ctx.land();
        if (capital) {
          capital.loyalty = Math.max(0, capital.loyalty - 30);
          capital.population = Math.floor(capital.population * 0.88);
        }
        announce(ctx, storyText('rice-riot.nika.toast', { gold: taken }), 'threat');
      },
    },
    {
      id: 'the-carts-run-again',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('fed') === 1,
      quiet: 6,
      effect: (ctx) => {
        loyaltyFloor(ctx, 72);
        standing(ctx, 4);
      },
    },
  ],
};

// ── The king with no heir ───────────────────────────────────────────────────

/**
 * Ông Vua Không Con — The King With No Heir.
 *
 * Their king is dead and his brothers are not speaking. There are three armies and no throne.
 * A gamble: intervene and lose, and all three make peace specifically to deal with you.
 */
export const noHeir: StoryTemplate = {
  id: 'no-heir',
  record: 'chinh-su',
  regard: (ctx) => {
    if (ctx.recall('backed') === 1) return 'yours';
    if (ctx.recall('opportunist') === 1) return 'wary';
    return undefined;
  },
  seedWeight: 2,
  minTurn: 32,
  seed: (state) => {
    const rival = pick(livingRivals(state).filter((k) => (k.stability ?? 60) < 70));
    return rival ? { kingdomId: rival.id } : undefined;
  },

  fragments: [
    {
      id: 'bien-gioi-cam-lai-cot-moi',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_take-the-border-while-they-argue') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'nha-ay-gui-qua-moi-mua',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_back-the-eldest') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'three-armies-and-no-throne',
      volume: 'card',
      band: 'border',
      weight: 7,
      quiet: 2,
      repeatable: true,
      maxTimes: 3,
      when: (ctx) => ctx.recall('backing') < 3,
      salience: (ctx) => (ctx.age >= 2 ? 7 : -20),
      opening: { on: 'rival', actionKey: 'sendTheEnvoy' },
      options: [
        {
          id: 'back-the-eldest',
          cost: { gold: 240 },
          apply: (ctx) => {
            ctx.remember('backed', 1);
            ctx.bump('backing');
            ctx.remember('echoTurn', ctx.state.turn);
            // Two hundred and forty gold went out and the card said nothing back. The house you
            // backed knows who backed it, from the day the money arrives.
            opinion(ctx, 18);
          },
        },
      ],
    },
    {
      id: 'let-them-fight-it-out',
      volume: 'card',
      band: 'border',
      weight: 5,
      quiet: 6,
      when: (ctx) => ctx.recall('backed') === 0 && ctx.age >= 6,
      salience: () => 5,
      options: [
        {
          id: 'wait',
          // R4. Their business, their turn — and nobody is looking at you while it lasts.
          apply: (ctx) => { ctx.remember('waited', 1); shiftWaveClock(ctx, 2); },
        },
        {
          id: 'take-the-border-while-they-argue',
          apply: (ctx) => {
            joinBloodlessly(ctx);
            ctx.remember('opportunist', 1);
            standing(ctx, -10);
          },
        },
      ],
    },
    {
      id: 'the-realm-comes-apart',
      volume: 'blow',
      band: 'crowd',
      weight: 8,
      terminal: true,
      tone: 'reward',
      when: (ctx) => ctx.recall('backed') === 1 || ctx.recall('waited') === 1,
      quiet: 6,
      salience: () => 10,
      effect: (ctx) => {
        civilWar(ctx);
        if (ctx.recall('backed') === 1) {
          exactTribute(ctx, 18, 24);
          joinBloodlessly(ctx);
        }
        shiftWaveClock(ctx, 6);
      },
    },
    {
      id: 'they-make-peace-to-deal-with-you',
      volume: 'blow',
      band: 'march',
      weight: 8,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('opportunist') === 1,
      quiet: 5,
      salience: () => 10,
      effect: (ctx) => {
        coalition(ctx);
        launchHostNow(ctx, 1.5);
      },
    },
  ],
};

// ── Two who fought together ─────────────────────────────────────────────────

/**
 * Ăn Cùng Một Mâm — They Eat Together.
 *
 * The quietest story in the set, and the only wholly positive one. Two heroes who keep being sent
 * out together stop being two heroes. Nothing warns you that splitting them costs anything.
 */
export const eatTogether: StoryTemplate = {
  id: 'eat-together',
  record: 'chinh-su',
  regard: (ctx) => {
    if (ctx.said('one-of-them-is-gone')) return 'alone';
    if (ctx.recall('seasonsTogether') >= 4) return 'inseparable';
    return undefined;
  },
  seedWeight: 3,
  minTurn: 14,
  seed: (state) => {
    const pair = state.heroes.filter((hero) => hero.id !== 'king');
    if (pair.length < 2) return undefined;
    const a = pick(pair);
    const b = pick(pair.filter((hero) => hero.id !== a?.id));
    if (!a || !b) return undefined;
    return { heroId: a.id, otherHeroId: b.id };
  },

  fragments: [
    {
      id: 'hai-doanh-trai-cach-nhau',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_separate-them') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'hai-ong-ay-an-chung-mam',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_let-them-swear') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'they-have-started-eating-together',
      volume: 'whisper',
      weight: 5,
      quiet: 3,
      when: (ctx) => Boolean(ctx.hero() && ctx.otherHero()),
      tone: 'info',
      effect: (ctx) => { ctx.bump('seasonsTogether', 2); },
    },
    {
      id: 'neither-eats-with-anyone-else',
      volume: 'whisper',
      weight: 4,
      quiet: 8,
      when: (ctx) => ctx.said('they-have-started-eating-together') && Boolean(ctx.hero() && ctx.otherHero()),
      effect: (ctx) => { ctx.bump('seasonsTogether', 2); },
      tone: 'info',
    },
    {
      id: 'sworn',
      volume: 'card',
      band: 'shrine',
      weight: 6,
      quiet: 5,
      tone: 'reward',
      terminal: true,
      when: (ctx) => ctx.recall('seasonsTogether') >= 4 && Boolean(ctx.hero() && ctx.otherHero()),
      salience: () => 7,
      options: [
        {
          id: 'let-them-swear',
          apply: (ctx) => {
            bondHeroes(ctx);
            grantDraft(ctx, 1);
          },
        },
        {
          id: 'separate-them',
          apply: (ctx) => {
            // The prudent answer. It costs one of them.
            const other = ctx.otherHero();
            if (other) heroLeaves(ctx, other, false);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 8);
          },
        },
      ],
    },
    {
      id: 'one-of-them-is-gone',
      volume: 'whisper',
      weight: 5,
      terminal: true,
      tone: 'threat',
      when: (ctx) => !ctx.hero() || !ctx.otherHero(),
      salience: (ctx) => (ctx.recall('seasonsTogether') >= 2 ? 8 : 1),
      effect: (ctx) => {
        const left = ctx.hero() ?? ctx.otherHero();
        if (left) {
          left.stats.loyalty = Math.max(0, left.stats.loyalty - 20);
          left.traits = [...(left.traits ?? []), 'Bereaved'];
        }
      },
    },
  ],
};

// ── The unpaid host ─────────────────────────────────────────────────────────

/**
 * Bốn Mùa Chưa Trả Lương — Four Seasons Unpaid.
 *
 * "They have not been paid in four seasons. They have not said anything, which is worse."
 *
 * The best outcome available here is *nothing happens*, which is a hard thing to write and worth
 * writing: paying the arrears buys no bonus, no card, no line of praise. It buys the absence of
 * the blow, and the player never finds out how close it came.
 */
export const unpaidHost: StoryTemplate = {
  id: 'unpaid',
  record: 'ngoai-truyen',
  regard: (ctx) => (ctx.recall('paid') === 1 ? 'squared' : 'patient'),
  seedWeight: 3,
  minTurn: 18,
  seed: (state) => {
    const hosts = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
    if (hosts.length === 0) return undefined;
    const land = state.lands.find((l) => l.id === hosts[0].landId);
    return { landId: land?.id };
  },

  fragments: [
    {
      id: 'linh-gui-tien-ve-nha',
      volume: 'whisper',
      weight: 4,
      quiet: 4,
      when: (ctx) => ctx.recall('chose_pay-them') === 1,
      salience: (ctx) => (ctx.age >= 5 ? 5 : -20),
    },
    {
      id: 'they-have-not-said-anything',
      volume: 'whisper',
      weight: 5,
      quiet: 2,
      when: (ctx) => ourHosts(ctx).some((army) => (army.unpaidTicks ?? 0) > 0 || army.morale < 65),
      heat: 3,
      tone: 'threat',
    },
    {
      id: 'clear-the-arrears',
      volume: 'card',
      weight: 6,
      quiet: 3,
      repeatable: true,
      maxTimes: 4,
      // Standing, and honest about it: wages fall behind again, so the door opens again — but
      // only while somebody is actually owed. A permanently-open "pay them" on a paid-up army is
      // a button, not an offer.
      when: (ctx) => ctx.said('they-have-not-said-anything')
        && ourHosts(ctx).some((army) => (army.unpaidTicks ?? 0) > 0 || army.morale < 70),
      salience: (ctx) => 3 + ctx.story.temperature,
      opening: { on: 'army', actionKey: 'payThem' },
      options: [
        {
          id: 'pay-them',
          cost: { gold: 220 },
          apply: (ctx) => {
            // Nothing. The best outcome in the game is often nothing.
            for (const army of ourHosts(ctx)) {
              army.unpaidTicks = 0;
              army.morale = Math.min(100, army.morale + 18);
            }
            ctx.remember('paid', 1);
            ctx.bump('payments');
            ctx.heat(-12);
          },
        },
      ],
    },
    {
      id: 'nothing-happened',
      volume: 'whisper',
      weight: 4,
      terminal: true,
      tone: 'info',
      when: (ctx) => ctx.recall('paid') === 1,
      quiet: 8,
    },
    {
      id: 'they-will-not-march',
      volume: 'blow',
      band: 'march',
      weight: 9,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('paid') === 0
        && ctx.said('they-have-not-said-anything')
        && ctx.story.temperature >= 7,
      salience: () => 12,
      effect: (ctx) => {
        mutinyHosts(ctx, 6);
        announce(ctx, storyText('unpaid.they-will-not-march.toast', {}), 'threat');
      },
    },
  ],
};
