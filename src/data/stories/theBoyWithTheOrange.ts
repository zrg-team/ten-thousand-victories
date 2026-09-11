import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { applyResourceDelta } from '../../systems/ResourceSystem';
import { pick, playerLands } from '../../systems/story/StorySystem';
import {
  academy,
  enshrine,
  grantPowerCard,
  killHero,
  leaveEcho,
  loyaltyFloor,
  monument,
  raisePatronHost,
  reinforceHosts,
  reinforcePatron,
  sabotageIncoming,
  stipend,
  temper,
  bounty, windfall,
} from '../../systems/story/effects';
import { generateHero } from '../heroFactory';
import type { Army } from '../../state/types';
import type { StoryCtx, StoryTemplate } from '../../systems/story/types';

/**
 * Quả Cam — The Boy With the Orange. Trần Quốc Toản, 1282–85.
 *
 * ## The annals record two things, and not a third
 *
 * That he was kept out of the war council at Bình Than for being too young and crushed the orange
 * in his fist without noticing; and that he raised a banner embroidered with six characters,
 * **Phá cường địch, báo hoàng ân** — destroy the strong foe, repay the imperial favour. They do
 * not clearly record how he died. The "fell at sixteen" is tradition.
 *
 * That gap is not a problem to paper over. It is the best argument this feature has for carrying
 * three source classes instead of two: his orange is `chinh-su`, his death is `da-su`, and his
 * survival is `ngoai-truyen` — inside one story.
 *
 * ## One card carries the whole design
 *
 * He is about fifteen, he is outside the hall, and he asks to fight.
 *
 * - **No** — send him home. That is what happened. He raises a thousand of his own household and
 *   fights beside you in a host **you do not command and cannot recall**: an `Army.patron`, which
 *   marches itself at whatever invader is nearest, eats nothing of yours, and lives on exactly
 *   what you choose to send it.
 * - **Yes** — let him in. That is not what happened, and the story does not care: `vao-hoi` opens
 *   with two further decisions and four endings of its own. You get a general history never gave
 *   you, and a wing that takes your orders, and every beat from there is stamped ngoại truyện.
 *
 * Answering yes gets you *more* story, not less, which is the only way a player ever risks leaving
 * the record twice. Neither answer is marked on the card; the class appears afterwards.
 *
 * ## The wager underneath
 *
 * The banner is not a gift, it is a standing account. `xin-gao-va-sat`, `lang-gui-gao` and
 * `xin-them-nguoi` are repeatable doors, and each one is men and stores that do not go into your
 * own muster — `(humans − 80) × 0.8` is what actually binds a levy, so this competes with the army
 * you would otherwise raise. Feed it and it thickens, takes a veteran tier at two gifts and a
 * guard's at four, and stands longer before it wears through. Feed it nothing and it wastes at
 * seven per cent a season until there is nothing under the banner at all.
 *
 * And the clock is the war: `chinh-quy` and `co-rieng` hold until a Great Invasion is close, so
 * Hàm Tử **is** the wave. Everything you put into him is standing on the wrong side of the map at
 * the moment the great host lands, and on the record he dies with all of it.
 *
 * Pre-trunk fragment ids are preserved — a live save holds the id of the beat it last spoke.
 */

/**
 * The one host this story ever raises, found by the id `raisePatronHost` mints.
 *
 * By id rather than by the `patron` flag, because `phong-chuc` deliberately clears that flag: a
 * host taken onto the books stops being an auxiliary and becomes an army of the realm, with the
 * wages, the defence arithmetic and the orders that go with it. It is still the same banner, and
 * the doors that feed it must still find it.
 */
const BANNER_ID = 'patron-orange';
/** The wing raised by admitting him, which is yours from the first day. */
const WING_ID = 'orange-wing';

function ourBanner(ctx: StoryCtx): Army | undefined {
  return ctx.state.armies.find((army) => army.id === BANNER_ID || army.id === WING_ID);
}

function headcount(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

/**
 * A gift, whichever kind of host the banner has become.
 *
 * `reinforcePatron` handles the auxiliary; a commissioned host is a plain army and is grown here,
 * so that taking him onto the books does not silently close the door that was feeding him.
 */
function feedBanner(ctx: StoryCtx, soldiers: number, rations: number): void {
  const host = ourBanner(ctx);
  if (!host) return;
  if (host.patron) {
    reinforcePatron(ctx, { soldiers, rations });
    return;
  }
  host.units.spearmen += Math.round(soldiers * 0.6);
  host.units.archers += Math.round(soldiers * 0.28);
  host.units.heavyInfantry += Math.round(soldiers * 0.12);
  host.rations += rations;
  host.morale = Math.min(100, host.morale + 4);
  const fed = ctx.bump('patron:fed');
  if (fed >= 2) host.level = Math.max(host.level, 2);
  if (fed >= 4) host.elite = Math.min(2, (host.elite ?? 0) + 1);
  ctx.remember('patron:men', headcount(host));
  ctx.note('patron', headcount(host));
}

/**
 * His name, frozen on the story rather than on the roster.
 *
 * On the recorded branch he never joins the court — he is refused, and goes anyway — so there is
 * no `Hero` to bind. Before this, `story.names.hero` was simply never set on that whole branch,
 * `{hero}` resolved to nothing, and `the-banner-falls` wrote an **empty name** into the cross-run
 * echo ring every single time. A memorial that does not know who it is for is not a memorial.
 *
 * `storyParams` falls back to `story.names` precisely for this case. The id is story-scoped and
 * never `real-tran-quoc-toan`: that one is a summonable Epic in the hero deck, and minting a
 * second person under the same id makes `heroDeck.filter(id)` remove the wrong champion.
 */
const HIS_NAME = 'Trần Quốc Toản';

function nameHim(ctx: StoryCtx): void {
  ctx.story.names = { ...(ctx.story.names ?? {}), hero: HIS_NAME };
  ctx.remember('bannerSince', ctx.state.ascent?.wavesSurvived ?? 0);
}

/** Great Invasions his banner actually stood through. Exact, and free — the engine already counts. */
function deedsOf(ctx: StoryCtx): number {
  return Math.max(0, (ctx.state.ascent?.wavesSurvived ?? 0) - ctx.recall('bannerSince'));
}

export const theBoyWithTheOrange: StoryTemplate = {
  id: 'orange',
  seedWeight: 3,
  minTurn: 14,

  /**
   * How it stands, which on this story is a fact about a host and not a fraction of anything.
   * Read before `stake` on the page, because the moving sentence is the one worth reading first.
   */
  pressure: (ctx) => {
    if (ctx.recall('patron:fell') === 1) return 'tan';
    const men = ctx.recall('patron:men');
    if (men <= 0) return undefined;
    if (men >= 2000) return 'dong-hon-co-nguoi';
    if (men >= 1400) return 'day-len';
    return 'moi-dung';
  },

  regard: (ctx) => {
    if (ctx.recall('patron:fell') === 1) return 'gone';
    if (ctx.recall('patron:fed') >= 4) return 'swollen';
    if (ctx.recall('patron:fed') >= 2) return 'fed';
    if (ctx.recall('banner') === 1) return 'risen';
    if (ctx.recall('admitted') === 1) return 'seated';
    if (ctx.recall('refused') === 1) return 'dismissed';
    return undefined;
  },

  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent) return undefined;
    // Bình Than was called because an invasion was coming. So is this.
    if (ascent.wavesSurvived < 1 && !ascent.bossTelegraphed) return undefined;
    const home = pick(playerLands(state));
    return home ? { landId: home.id } : undefined;
  },

  entry: 'binh-than',

  nodes: [
    { id: 'binh-than', historicity: 'chinh-su', patience: 5, onIgnored: 'qua-cam' },
    { id: 'qua-cam', historicity: 'chinh-su', patience: 5, onIgnored: 'la-co' },

    // The record: he is turned away and goes anyway.
    { id: 'la-co', historicity: 'chinh-su', patience: 6, onIgnored: 'co-rieng' },
    // The two long ones. A boss cycle is forty-eight seasons; at the old patience of five the
    // ignore-exit fired before the player had been offered a second door, and the whole wager
    // was over before it was legible. Sixteen is four gifts' worth of room and no more.
    { id: 'chinh-quy', historicity: 'chinh-su', patience: 16, onIgnored: 'ham-tu' },
    { id: 'co-rieng', historicity: 'chinh-su', patience: 16, onIgnored: 'ham-tu' },
    { id: 'ham-tu', historicity: 'chinh-su', patience: 4, onIgnored: 'nga-xuong' },
    { id: 'nga-xuong', historicity: 'da-su', terminal: true },
    // Not terminal: he lives, and a life is not an ending. INV-10 caught this as a funnel —
    // one different answer must not mean one predetermined outcome.
    { id: 'song-sot', historicity: 'ngoai-truyen', patience: 6, onIgnored: 've-que' },
    { id: 'tran-bien', historicity: 'ngoai-truyen', terminal: true },
    { id: 've-que', historicity: 'ngoai-truyen', terminal: true },

    // The divergence: admitted at fifteen.
    { id: 'vao-hoi', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'giu-ben-canh' },
    { id: 'giao-quan', historicity: 'ngoai-truyen', patience: 12, onIgnored: 'mat-o-tien-phong' },
    { id: 'tuong-tre', historicity: 'ngoai-truyen', terminal: true },
    { id: 'mat-o-tien-phong', historicity: 'ngoai-truyen', terminal: true },
    { id: 'giu-ben-canh', historicity: 'ngoai-truyen', patience: 5, onIgnored: 'bi-lang-quen' },
    { id: 'mac-ao-tia', historicity: 'ngoai-truyen', terminal: true },
    { id: 'bi-lang-quen', historicity: 'ngoai-truyen', terminal: true },
  ],

  fragments: [
    // ══ binh-than ══════════════════════════════════════════════════════════
    {
      id: 'hoi-nghi-o-ben-song',
      volume: 'whisper',
      in: ['binh-than'],
      weight: 6,
      quiet: 0,
    },
    {
      id: 'ai-duoc-goi-ai-khong',
      volume: 'whisper',
      in: ['binh-than'],
      weight: 5,
      quiet: 2,
      leadsTo: ['qua-cam'],
      effect: (ctx) => { ctx.goTo('qua-cam'); },
    },

    // ══ qua-cam — the card the whole design fits in ════════════════════════
    {
      // Preserved from the pre-trunk version.
      id: 'juice-on-his-wrist',
      volume: 'card',
      band: 'court',
      in: ['qua-cam'],
      weight: 10,
      quiet: 1,
      salience: () => 12,
      options: [
        {
          id: 'he-is-a-child',
          historicity: 'annal',
          to: 'la-co',
          apply: (ctx) => {
            nameHim(ctx);
            ctx.remember('refused', 1);
            // A throne that keeps its own rules in front of a boy everybody in the yard is
            // watching. Small, immediate, and the opposite of what the yard wanted.
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
            for (const land of playerLands(ctx.state)) {
              land.loyalty = Math.min(100, land.loyalty + 3);
            }
            ctx.note('stability', 6);
            ctx.heat(4);
          },
        },
        {
          id: 'admit-him',
          // A price, because an answer that costs nothing is not an answer. Deliberately under the
          // muster reserve, so it is almost never the greyed-out option — the point is to make
          // "yes, and more story please" into a decision, not to close the door.
          cost: { humans: 180 },
          historicity: 'divergent',
          to: 'vao-hoi',
          apply: (ctx) => {
            const boy = generateHero(ctx.state.turn * 5471, {
              id: `orange-${ctx.state.turn}`,
              type: 'general',
              sex: 'man',
              era: 'tran',
            });
            boy.name = HIS_NAME;
            boy.stats.martial = 44;
            boy.stats.loyalty = 92;
            boy.stats.renown = 12;
            boy.traits = [...(boy.traits ?? []), 'Hoài Văn'];
            ctx.state.heroes.push(boy);
            ctx.story.cast.heroId = boy.id;
            ctx.story.names = { ...(ctx.story.names ?? {}), hero: boy.name };
            ctx.note('hero', 1, boy.name);

            // The wing, and it is **yours**. The explicit standing order is load-bearing:
            // `isAutoHost` returns false for a host under orders, so the autopilot will neither
            // march it off nor dissolve it when it thins. That is the whole shape of the
            // divergence — on the record you are given a host you cannot steer; admitted, you
            // are given one you can.
            const home = ctx.land();
            if (home) {
              ctx.state.armies.push({
                id: WING_ID,
                kingdomId: PLAYER_KINGDOM_ID,
                name: 'Hoài Văn',
                landId: home.id,
                units: { spearmen: 250, archers: 110, heavyInfantry: 60 },
                morale: 96,
                supply: 70,
                rations: 130,
                provisions: 90,
                level: 1,
                experience: 0,
                experienceToNextLevel: 140,
                generalHeroId: boy.id,
                orders: { kind: 'defend', landId: home.id },
              });
              ctx.note('soldiers', 420);
            }
            ctx.remember('admitted', 1);
            ctx.remember('bannerSince', ctx.state.ascent?.wavesSurvived ?? 0);
            ctx.remember('echoTurn', ctx.state.turn);
          },
        },
      ],
    },

    // ══ la-co — the record ═════════════════════════════════════════════════
    {
      id: 'sau-chu-tren-la-co',
      volume: 'whisper',
      in: ['la-co'],
      weight: 7,
      quiet: 1,
      tone: 'reward',
    },
    {
      // Preserved: the host arrives, and it is not yours.
      id: 'he-raises-his-banner',
      volume: 'blow',
      band: 'march',
      in: ['la-co'],
      weight: 9,
      quiet: 2,
      tone: 'threat',
      salience: () => 9,
      effect: (ctx) => {
        const home = ctx.land();
        raisePatronHost(ctx, { soldiers: 1000, name: 'Cờ Riêng', at: home, rations: 260 });
        // A thousand of his household are a thousand off your muster roll, and the roll is what
        // binds a levy. The banner costs you before it is worth anything.
        bounty(ctx, { humans: -300 });
        ctx.note('humans', -300);
        ctx.remember('banner', 1);
        // A name from an earlier run, planted here so the whisper at Hàm Tử can use it —
        // `storyParams` is read before `fire`, so it cannot be fetched at the moment it is spoken.
        const ghost = ctx.echoOf('binh-trong', 'rather-a-ghost-in-the-south');
        if (ghost) {
          ctx.story.names = { ...(ctx.story.names ?? {}), other: ghost };
          ctx.remember('ghost', 1);
        }
      },
    },
    {
      // Rescued prose, given a node. Nobody sent for them; they are simply at the gate.
      id: 'six-hundred-of-his-household',
      volume: 'whisper',
      in: ['la-co'],
      weight: 6,
      quiet: 1,
      when: (ctx) => ctx.recall('banner') === 1,
    },
    {
      id: 'cong-nhan-hay-khong',
      volume: 'card',
      band: 'court',
      in: ['la-co'],
      weight: 9,
      quiet: 2,
      when: (ctx) => ctx.recall('banner') === 1,
      salience: () => 10,
      options: [
        {
          id: 'phong-chuc',
          cost: { gold: 90, supplies: 60 },
          historicity: 'annal',
          to: 'chinh-quy',
          apply: (ctx) => {
            const host = ourBanner(ctx);
            if (host) {
              // On the books. It stops being an auxiliary: from here it draws wages and rations
              // like any host of the realm, counts in the defence the next wave is measured
              // against, and can be given a standing order.
              host.patron = undefined;
              host.level = Math.max(host.level, 2);
              host.elite = Math.min(2, (host.elite ?? 0) + 1);
              host.morale = 100;
              ctx.note('elite', 1);
            }
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 5);
            ctx.note('stability', 5);
            ctx.remember('chinh-quy', 1);
          },
        },
        {
          id: 'de-tu-lo',
          historicity: 'annal',
          to: 'co-rieng',
          apply: (ctx) => {
            // A private army with no column in the Ministry's book. The stores you did not have
            // to issue are felt this season; the cost is that nobody in the hall will own it.
            bounty(ctx, { supplies: 40 });
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 4);
            ctx.note('stability', -4);
            ctx.remember('tu-lo', 1);
          },
        },
      ],
    },

    // ══ chinh-quy / co-rieng — the requisition stretch ══════════════════════
    {
      /**
       * The account, kept open. Repeatable, priced in what the muster needs, and named against
       * its own node so the door closes and opens again rather than moving the story on.
       *
       * An `opening` rather than a card on purpose. It costs nothing from the director's fifteen
       * per cent, it stands for twenty-six seasons instead of one tick, it does not silence the
       * story while it waits — and `decisionFragments` filters openings out of the branch-parity
       * count, so twelve player taps add no INV-9 debt at all.
       */
      id: 'xin-gao-va-sat',
      volume: 'whisper',
      in: ['chinh-quy'],
      weight: 8,
      quiet: 2,
      repeatable: true,
      maxTimes: 4,
      opening: { on: 'land', actionKey: 'cap' },
      options: [
        {
          id: 'cap-cho-cau-ta',
          cost: { gold: 70, supplies: 80 },
          historicity: 'annal',
          to: 'chinh-quy',
          apply: (ctx) => {
            feedBanner(ctx, 420, 90);
            const land = ctx.land();
            if (land) land.loyalty = Math.min(100, land.loyalty + 4);
            ctx.heat(1);
          },
        },
      ],
    },
    {
      id: 'lang-gui-gao',
      volume: 'whisper',
      in: ['co-rieng'],
      weight: 8,
      quiet: 2,
      repeatable: true,
      maxTimes: 4,
      opening: { on: 'land', actionKey: 'gui' },
      options: [
        {
          id: 'cho-lang-gui',
          // Off the books, so it comes out of the country rather than the treasury — and men are
          // what a levy is actually short of.
          cost: { food: 120, humans: 90 },
          historicity: 'annal',
          to: 'co-rieng',
          apply: (ctx) => {
            feedBanner(ctx, 300, 110);
            const land = ctx.land();
            if (land) land.loyalty = Math.min(100, land.loyalty + 5);
            // The Ministry of War is watching a private army be provisioned with no column to
            // write it in, and there is nothing it can do about that either.
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 2);
            ctx.note('stability', -2);
            ctx.heat(1);
          },
        },
      ],
    },
    {
      // Rescued prose. He is measured for armour twice in a year, which is the requisition
      // stretch seen from the one room in the house that is not about the war.
      id: 'he-grows-into-it',
      volume: 'whisper',
      in: ['chinh-quy', 'co-rieng'],
      weight: 5,
      quiet: 3,
      when: (ctx) => ctx.recall('patron:fed') >= 1,
    },
    {
      id: 'duoi-co-dong-hon-truoc',
      volume: 'whisper',
      in: ['chinh-quy', 'co-rieng'],
      weight: 6,
      quiet: 3,
      repeatable: true,
      maxTimes: 2,
      when: (ctx) => ctx.recall('patron:fed') >= 2,
    },
    {
      id: 'quan-cua-cau-ta-duoc-cap-luong',
      volume: 'whisper',
      in: ['chinh-quy'],
      weight: 6,
      quiet: 1,
      leadsTo: ['ham-tu'],
      // The clock, and it is the war's. This used to fire on the first quiet season, so the story
      // reached Hàm Tử on a private timer with no relation to anything — the requisition stretch
      // was over before it began. Now Hàm Tử *is* the Great Invasion.
      when: (ctx) => ctx.world.waveIncoming || ctx.world.ticksToBoss <= 6 || ctx.recall('patron:fed') >= 4,
      salience: () => 16,
      effect: (ctx) => {
        reinforceHosts(ctx, 160);
        ctx.goTo('ham-tu');
      },
    },
    {
      id: 'khong-ai-cap-gi-ca',
      volume: 'whisper',
      in: ['co-rieng'],
      weight: 6,
      quiet: 1,
      leadsTo: ['ham-tu'],
      when: (ctx) => ctx.world.waveIncoming || ctx.world.ticksToBoss <= 6 || ctx.recall('patron:fed') >= 4,
      salience: () => 16,
      effect: (ctx) => { ctx.goTo('ham-tu'); },
    },

    // ══ ham-tu — and the honest split ══════════════════════════════════════
    {
      id: 'cau-ta-danh-o-cho-khong-ai-bao',
      volume: 'whisper',
      in: ['ham-tu'],
      weight: 6,
      quiet: 1,
      tone: 'reward',
    },
    {
      /**
       * A name out of a previous run, said to a boy about to make the same choice.
       *
       * Only ever appears if some earlier dynasty watched Trần Bình Trọng refuse a title from the
       * Mongols and die for it. Nothing tells the player where the name came from, which is the
       * point of an echo.
       */
      id: 'nguoi-ta-con-nhac-mot-cai-ten',
      volume: 'whisper',
      in: ['ham-tu'],
      weight: 5,
      quiet: 2,
      when: (ctx) => ctx.recall('ghost') === 1,
    },
    {
      // Rescued prose. He takes the recall order in both hands, reads it, folds it away, and
      // asks which road is shorter. On the record he was never forbidden — he simply went, and
      // that is a different beat from `di-khong-xin-phep`, where he was told and went anyway.
      id: 'he-does-not-wait-for-orders',
      volume: 'whisper',
      in: ['ham-tu'],
      weight: 6,
      quiet: 1,
      tone: 'threat',
    },
    {
      id: 'ham-tu-quan',
      volume: 'card',
      band: 'river',
      in: ['ham-tu'],
      weight: 10,
      quiet: 2,
      salience: () => 11,
      options: [
        {
          id: 'cho-cau-ta-di-dau',
          historicity: 'annal',
          to: 'nga-xuong',
          apply: (ctx) => {
            // The vanguard's payment, delivered *before* he dies, so the trade is legible: his
            // life against a thinner enemy line, and the thinning scales with what you sent him.
            sabotageIncoming(ctx, 0.10 + 0.04 * ctx.recall('patron:fed'));
            ctx.remember('dau', 1);
          },
        },
        {
          id: 'goi-cau-ta-ve',
          historicity: 'divergent',
          to: 'song-sot',
          apply: (ctx) => {
            const host = ourBanner(ctx);
            if (host) {
              // The order arrives under your seal and the banner becomes an army of the realm.
              // From this season he is yours to move, and he has stopped speaking to you.
              host.patron = undefined;
              host.orders = { kind: 'defend', landId: host.landId };
              host.morale = Math.max(20, host.morale - 20);
              ctx.note('soldiers', 0);
            }
            const boy = ctx.hero();
            if (boy) temper(ctx, 'loyalty', -10, boy);
            ctx.remember('goi-ve', 1);
          },
        },
      ],
    },
    {
      id: 'the-banner-falls',
      volume: 'blow',
      band: 'fire',
      in: ['nga-xuong'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => {
        const host = ourBanner(ctx);
        const fed = ctx.recall('patron:fed');
        const deeds = deedsOf(ctx);
        if (host) ctx.state.armies = ctx.state.armies.filter((army) => army.id !== host.id);

        // Some of them walked back, and they went into your hosts. More of them if you had fed
        // them; that is the only part of what you spent that comes home.
        reinforceHosts(ctx, 180 + 90 * fed);

        // Permanence is the record's currency, and the shrine is built to the scale of what he
        // actually did rather than to a flat number: invasions his banner stood through.
        const land = ctx.land();
        monument(ctx, { defense: 10 + 3 * deeds, stability: 8 }, land);
        loyaltyFloor(ctx, 60 + Math.min(12, 3 * deeds), land);
        for (const hero of ctx.state.heroes) {
          hero.stats.loyalty = Math.min(100, hero.stats.loyalty + 8);
        }
        for (const owned of playerLands(ctx.state)) {
          owned.loyalty = Math.min(100, owned.loyalty + 6);
        }
        // A rule the realm now holds because of something that happened to it.
        grantPowerCard(ctx, 'pha-cuong-dich');
        // And this is what "noted" means: a name in the reign's own record, a standing modifier
        // every host feels for the rest of the run, and a line a later dynasty can say aloud.
        enshrine(ctx, {
          name: ctx.story.names?.hero ?? HIS_NAME,
          key: 'ham-tu',
          land,
          armyPower: 0.06,
          loyaltyFloor: 60 + Math.min(12, 3 * deeds),
          deeds,
        });
      },
    },
    {
      id: 'cau-ta-song',
      volume: 'blow',
      band: 'march',
      in: ['song-sot'],
      weight: 10,
      tone: 'reward',
      effect: (ctx) => {
        // The annals do not say he died, so keeping him is a variation rather than a contradiction.
        const boy = generateHero(ctx.state.turn * 7717, {
          id: `orange-grown-${ctx.state.turn}`,
          type: 'general',
          sex: 'man',
          era: 'tran',
        });
        boy.name = ctx.story.names?.hero ?? HIS_NAME;
        boy.stats.martial = 62;
        boy.stats.loyalty = 95;
        boy.stats.renown = 44;
        boy.traits = [...(boy.traits ?? []), 'Hoài Văn'];
        ctx.state.heroes.push(boy);
        ctx.story.cast.heroId = boy.id;
        ctx.story.names = { ...(ctx.story.names ?? {}), hero: boy.name };
        ctx.note('hero', 1, boy.name);
        const host = ourBanner(ctx);
        if (host) host.generalHeroId = boy.id;
        ctx.remember('song', 1);
      },
    },
    {
      id: 'mot-nguoi-song-sot-thi-lam-gi',
      volume: 'card',
      band: 'border',
      in: ['song-sot'],
      weight: 9,
      quiet: 2,
      when: (ctx) => ctx.recall('song') === 1,
      options: [
        {
          id: 'giao-bien-ai',
          historicity: 'divergent',
          to: 'tran-bien',
          apply: (ctx) => {
            // The furthest, coldest province you own, which is exactly the posting nobody wants.
            const worst = playerLands(ctx.state).sort((a, b) => a.loyalty - b.loyalty)[0];
            const host = ourBanner(ctx);
            if (host && worst) host.orders = { kind: 'defend', landId: worst.id };
            monument(ctx, { defense: 12, stability: 0 }, worst);
            ctx.remember('bien', 1);
          },
        },
        {
          id: 'cho-ve-que',
          historicity: 'divergent',
          to: 've-que',
          apply: (ctx) => {
            // A thousand men come off the map and back onto the muster roll, which is a larger
            // gift than it looks: manpower is what actually caps a levy.
            const host = ourBanner(ctx);
            if (host) {
              const men = headcount(host);
              ctx.state.armies = ctx.state.armies.filter((army) => army.id !== host.id);
              windfall(ctx, { humans: men, food: 80 });
            }
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
            ctx.note('stability', 6);
            ctx.remember('que', 1);
          },
        },
      ],
    },
    {
      id: 'tran-bien-mot-doi',
      volume: 'whisper',
      in: ['tran-bien'],
      weight: 8,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        const boy = ctx.hero();
        if (boy) temper(ctx, 'martial', 14, boy);
        for (const land of playerLands(ctx.state)) {
          land.loyalty = Math.min(100, land.loyalty + 4);
        }
      },
    },
    {
      id: 've-que-trong-cam',
      volume: 'whisper',
      in: ['ve-que'],
      weight: 8,
      terminal: true,
      effect: (ctx) => {
        ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 8);
        ctx.note('stability', 8);
        leaveEcho(ctx, ctx.story.names?.hero ?? HIS_NAME);
      },
    },

    // ══ vao-hoi — the divergence, two more decisions ═══════════════════════
    {
      id: 'tieng-noi-tre-nhat-trong-phong',
      volume: 'whisper',
      in: ['vao-hoi'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'lam-gi-voi-cau-ta',
      volume: 'card',
      band: 'court',
      in: ['vao-hoi'],
      weight: 9,
      quiet: 2,
      salience: () => 9,
      options: [
        {
          id: 'giao-mot-quan',
          cost: { supplies: 70 },
          historicity: 'divergent',
          to: 'giao-quan',
          apply: (ctx) => {
            // The household comes in behind the commission.
            feedBanner(ctx, 300, 80);
            const boy = ctx.hero();
            if (boy) temper(ctx, 'renown', 14, boy);
            // A fifteen-year-old with a command, in front of men who have waited twenty years.
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 8);
            ctx.note('stability', -8);
            ctx.remember('giao', 1);
          },
        },
        {
          id: 'giu-ben-canh',
          historicity: 'divergent',
          to: 'giu-ben-canh',
          apply: (ctx) => {
            const boy = ctx.hero();
            if (boy) temper(ctx, 'administration', 12, boy);
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 8);
            ctx.note('stability', 8);
            stipend(ctx, { gold: 6, supplies: 3 }, 20, 'Hoài Văn');
            // A seat gained is a commander lost, and the wing notices within the season.
            const host = ourBanner(ctx);
            if (host) {
              host.generalHeroId = undefined;
              host.morale = Math.max(20, host.morale - 10);
            }
            ctx.remember('ben-canh', 1);
          },
        },
      ],
    },
    {
      id: 'xin-them-nguoi',
      volume: 'whisper',
      in: ['giao-quan'],
      weight: 8,
      quiet: 2,
      repeatable: true,
      maxTimes: 4,
      opening: { on: 'land', actionKey: 'them' },
      options: [
        {
          id: 'cap-them-nguoi',
          cost: { humans: 150, gold: 50 },
          historicity: 'divergent',
          to: 'giao-quan',
          apply: (ctx) => {
            feedBanner(ctx, 380, 70);
            const boy = ctx.hero();
            if (boy) temper(ctx, 'martial', 4, boy);
            // On the record you are feeding something you never see. Admitted, you are handing a
            // fifteen-year-old more of the realm in front of the whole hall, and they count.
            ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 3);
            ctx.note('stability', -3);
          },
        },
      ],
    },
    {
      id: 'cau-xin-tien-phong',
      volume: 'card',
      band: 'march',
      in: ['giao-quan'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'cho-di',
          historicity: 'divergent',
          to: 'tuong-tre',
          apply: (ctx) => {
            const host = ourBanner(ctx);
            if (host) {
              host.elite = Math.min(2, (host.elite ?? 0) + 1);
              host.morale = 100;
              ctx.note('elite', 1);
            }
            sabotageIncoming(ctx, 0.08);
            const boy = ctx.hero();
            if (boy) temper(ctx, 'martial', 10, boy);
            ctx.remember('cho-di', 1);
          },
        },
        {
          id: 'giu-lai',
          historicity: 'divergent',
          to: 'mat-o-tien-phong',
          apply: (ctx) => {
            const host = ourBanner(ctx);
            if (host) host.morale = Math.max(20, host.morale - 15);
            const boy = ctx.hero();
            if (boy) temper(ctx, 'loyalty', -12, boy);
            // The hall approves, and that is the whole of the tragedy.
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
            ctx.note('stability', 6);
            ctx.heat(2);
          },
        },
      ],
    },
    {
      id: 'tuong-tre-lon-len',
      volume: 'whisper',
      in: ['tuong-tre'],
      weight: 8,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        const boy = ctx.hero();
        if (boy) {
          temper(ctx, 'martial', 22, boy);
          boy.traits = [...(boy.traits ?? []), 'Hoài Văn hầu'];
        }
      },
    },
    {
      /**
       * He went anyway.
       *
       * `giu-lai` used to route here, to a node whose only fragment said he died leading the van
       * he had just been forbidden — which reads as the game not having listened. Gated on the
       * answer itself; the older terminal stays ungated so the `onIgnored` path still lands
       * somewhere, because two gated terminals would satisfy INV-4 statically and deadlock at
       * runtime.
       */
      id: 'di-khong-xin-phep',
      volume: 'blow',
      band: 'fire',
      in: ['mat-o-tien-phong'],
      weight: 12,
      terminal: true,
      tone: 'threat',
      when: (ctx) => ctx.recall('chose_giu-lai') === 1,
      salience: () => 20,
      effect: (ctx) => {
        const host = ourBanner(ctx);
        if (host) ctx.state.armies = ctx.state.armies.filter((army) => army.id !== host.id);
        killHero(ctx);
        // His household was never yours, and what came back went into the ranks anyway.
        reinforceHosts(ctx, 120);
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 8);
        ctx.note('stability', -8);
        leaveEcho(ctx, ctx.story.names?.hero ?? HIS_NAME);
      },
    },
    {
      id: 'mat-o-tien-phong-that',
      volume: 'blow',
      band: 'fire',
      in: ['mat-o-tien-phong'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => {
        const host = ourBanner(ctx);
        if (host) ctx.state.armies = ctx.state.armies.filter((army) => army.id !== host.id);
        // `killHero` rather than a hand-rolled filter: it also clears the court seat and any
        // `generalHeroId` pointing at him, which the filter did not, leaving an army commanded by
        // somebody who no longer existed.
        killHero(ctx);
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 12);
        ctx.note('stability', -12);
      },
    },
    {
      id: 'trieu-dinh-cuoi-cau-ta',
      volume: 'whisper',
      in: ['giu-ben-canh'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'ao-tia-hay-la-co',
      volume: 'card',
      band: 'court',
      in: ['giu-ben-canh'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'cho-cau-ta-mot-ghe',
          historicity: 'divergent',
          to: 'mac-ao-tia',
          apply: (ctx) => {
            academy(ctx, 24, 'Hoài Văn');
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 8);
            ctx.note('stability', 8);
            const boy = ctx.hero();
            if (boy) temper(ctx, 'administration', 10, boy);
            // A commander traded for a minister, and the map says so within the season.
            const host = ourBanner(ctx);
            if (host) {
              const men = headcount(host);
              ctx.state.armies = ctx.state.armies.filter((army) => army.id !== host.id);
              windfall(ctx, { humans: men });
            }
            ctx.remember('ghe', 1);
          },
        },
        {
          id: 'de-cau-ta-doi',
          historicity: 'divergent',
          to: 'bi-lang-quen',
          apply: (ctx) => {
            const boy = ctx.hero();
            if (boy) temper(ctx, 'loyalty', -15, boy);
            const host = ourBanner(ctx);
            if (host) host.morale = Math.max(20, host.morale - 8);
            // Nobody had to say no out loud, which is the only thing this buys.
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 4);
            ctx.note('stability', 4);
            ctx.heat(1);
          },
        },
      ],
    },
    {
      id: 'mac-ao-tia-that',
      volume: 'whisper',
      in: ['mac-ao-tia'],
      weight: 8,
      terminal: true,
      effect: (ctx) => {
        ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 12);
        ctx.note('stability', 12);
      },
    },
    {
      id: 'cau-ta-thoi-hoi',
      volume: 'whisper',
      in: ['bi-lang-quen'],
      weight: 8,
      terminal: true,
      effect: (ctx) => {
        // Halved from the pre-trunk version: the card that leads here now takes fifteen of its
        // own, and the two together are the same forty they always were.
        const boy = ctx.hero();
        if (boy) boy.stats.loyalty = Math.max(0, boy.stats.loyalty - 15);
      },
    },
  ],
};
