import { MUSTER_TICKS } from '../../game/ascentConfig';
import { pick, playerLands } from '../../systems/story/StorySystem';
import { storyText } from '../../i18n/story';
import {
  announce,
  grantEliteTier,
  grantHost,
  leaveEcho,
  loyaltyFloor,
  monument,
  population,
  reinforceHosts,
  bounty, windfall,
} from '../../systems/story/effects';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Thánh Gióng — Phù Đổng Thiên Vương.
 *
 * A three-year-old at Phù Đổng who had never spoken sat up when the king's herald came through
 * the villages calling for anyone who could save the country, and asked for an iron horse, an
 * iron rod and iron armour. He ate what the village had and then what the district had, grew,
 * rode out against the Ân, fought on with a bamboo grove when the rod broke, and went up Sóc Sơn
 * and did not come down.
 *
 * ## This story is a wager, not a conversation
 *
 * Read the tree below as a dialogue graph and you will build the wrong thing. The five clauses:
 *
 * - **gate** — it only seeds when the incoming wave outweighs what the realm can field. A miracle
 *   offered to a realm that is winning is a reward, not a bet.
 * - **stake** — the offering costs `humans` and `supplies`, *not* food. Food does not bind the
 *   muster: `soldiersTheFarmsCanFeed ≈ foodSpare × 15.9` against a hard cap of 2200, so a realm
 *   with five hundred in the granary could feed three armies it is not allowed to raise. What
 *   binds is `(humans − 80) × 0.8`. An offering priced in rice would be a story *about* a
 *   sacrifice; this one is the district's sons going with the rice, which is also what the legend
 *   actually says.
 * - **clock** — it seeds two to three waves out (`ticksToBoss`), and each offering needs a season
 *   of quiet. Three of them barely fit. Hesitate twice and he is not ready.
 * - **payoff** — the host scales with what was sent and arrives *outside* the muster: it does not
 *   eat, and it does not count against the army cap.
 * - **loss** — underfed, he never rides, and the men are gone. A realm that ignored him entirely
 *   has a larger levy than one that fed him twice.
 *
 * So the question the card is really asking is: **six hundred men in the levy now, or two
 * thousand in three seasons — if you can hold three seasons, and if you keep paying.**
 *
 * ## Which is why refusing is a strategy, not a refusal to play
 *
 * `khong-goi` — never sending the herald — is the conservative line: keep the men, raise a normal
 * levy, fight a normal war. It carries a real win (`tu-lo-lay`) because it deserves one.
 *
 * **Ids from the pre-trunk version are preserved and given nodes** — a live save holds the id of
 * the fragment it last spoke.
 */

/** Two to three waves of runway: enough to feed him three times, not enough to dawdle. */
const SEED_WINDOW = { min: 16, max: 40 };

/** Men and stores per offering. Priced against `recruitSoldiers`, which is what actually binds. */
const OFFERING = { humans: 200, supplies: 90 };

/** Soldiers per offering accepted. Three offerings is a host no muster could raise. */
const HOST_PER_OFFERING = 700;

export const thanhGiong: StoryTemplate = {
  id: 'thanh-giong',
  seedWeight: 3,
  minTurn: 20,

  /**
   * The middle of the wager, said out loud. The player is deciding whether to pay a third time
   * and had nothing to read but the door's price; this is the giant, in the doorway, measured
   * against a clock nobody set.
   */
  pressure: (ctx) => {
    if (ctx.recall('rode') >= 1) return undefined;
    const fed = ctx.recall('nuoi');
    if (fed >= 3) return 'san-sang';
    if (fed >= 2) return 'cao-hon-cua';
    if (fed >= 1) return 'an-mot-lan';
    if (ctx.recall('forged') === 1) return 'chua-an';
    return undefined;
  },

  regard: (ctx) => {
    if (ctx.recall('rode') >= 1) return 'gone';
    if (ctx.recall('nuoi') >= 2) return 'rising';
    if (ctx.recall('forged') === 1) return 'fed';
    if (ctx.recall('refused') === 1) return 'unanswered';
    return undefined;
  },

  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent) return undefined;
    // The gate. Only a realm that is losing gets offered a miracle.
    if (ascent.threat <= ascent.defensePower * 1.1) return undefined;
    const village = pick(playerLands(state).filter((land) => land.hasVillage));
    return village ? { landId: village.id } : undefined;
  },

  entry: 'tin-giac',

  nodes: [
    // ── The record ──────────────────────────────────────────────────────────
    { id: 'tin-giac', historicity: 'chinh-su', patience: 6, onIgnored: 'khong-goi' },
    { id: 'su-gia', historicity: 'chinh-su', patience: 6, onIgnored: 'cho-gao' },
    { id: 'ren-sat', historicity: 'chinh-su', patience: 14, onIgnored: 'khong-du-an' },
    { id: 'ra-tran', historicity: 'chinh-su', patience: 4, onIgnored: 'nga-ngua' },
    { id: 'soc-son', historicity: 'chinh-su', terminal: true },
    { id: 'nga-ngua', historicity: 'da-su', terminal: true },
    { id: 'khong-du-an', historicity: 'da-su', terminal: true },

    // ── Fed, never armed ────────────────────────────────────────────────────
    { id: 'cho-gao', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'giu-lang' },
    { id: 'tay-khong', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'nga-o-ruong' },
    { id: 'nhung-cay-tre', historicity: 'ngoai-truyen', terminal: true },
    { id: 'nga-o-ruong', historicity: 'ngoai-truyen', terminal: true },
    { id: 'giu-lang', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'nguoi-khong-lo' },
    { id: 'nguoi-khong-lo', historicity: 'ngoai-truyen', terminal: true },
    { id: 'bo-di', historicity: 'ngoai-truyen', terminal: true },
    { id: 'chuong-chua', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'su-phan-doi' },
    { id: 'giap-dong', historicity: 'ngoai-truyen', terminal: true },
    { id: 'su-phan-doi', historicity: 'ngoai-truyen', terminal: true },

    // ── Taken indoors ───────────────────────────────────────────────────────
    { id: 'dua-ve-trieu', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'phong-vuong' },
    { id: 'phong-vuong', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'chet-yeu' },
    { id: 'hau-tre', historicity: 'ngoai-truyen', terminal: true },
    { id: 'chet-yeu', historicity: 'ngoai-truyen', terminal: true },
    { id: 'thay-thuoc', historicity: 'ngoai-truyen', terminal: true },

    // ── Nobody was called ───────────────────────────────────────────────────
    { id: 'khong-goi', historicity: 'ngoai-truyen', patience: 10, onIgnored: 'giu-ai' },
    { id: 'giu-ai', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'tu-lo-lay' },
    { id: 'tu-lo-lay', historicity: 'ngoai-truyen', terminal: true },
    { id: 'mat-phu-dong', historicity: 'ngoai-truyen', terminal: true },
    { id: 'dan-tran', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'tuong-gia' },
    { id: 'tuong-gia', historicity: 'ngoai-truyen', terminal: true },
    { id: 'vua-than-chinh', historicity: 'ngoai-truyen', terminal: true },
  ],

  fragments: [
    // ══ tin-giac ═══════════════════════════════════════════════════════════
    {
      id: 'giac-an-qua-vu-ninh',
      volume: 'whisper',
      in: ['tin-giac'],
      weight: 6,
      quiet: 0,
      tone: 'threat',
      salience: (ctx) => (ctx.world.ticksToBoss <= SEED_WINDOW.max ? 6 : 0),
    },
    {
      id: 'ba-ban-tin-khong-khop',
      volume: 'whisper',
      in: ['tin-giac'],
      weight: 4,
      quiet: 2,
    },
    {
      id: 'loi-keu-goi',
      volume: 'card',
      band: 'court',
      in: ['tin-giac'],
      weight: 9,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 10 : -20),
      options: [
        {
          id: 'sai-su-gia',
          cost: { gold: 120 },
          historicity: 'annal',
          to: 'su-gia',
          apply: (ctx) => { ctx.remember('herald', 1); },
        },
        {
          id: 'ta-co-quan-roi',
          historicity: 'divergent',
          to: 'khong-goi',
          apply: (ctx) => { ctx.remember('refused', 1); ctx.heat(2); },
        },
      ],
    },

    // ══ su-gia ═════════════════════════════════════════════════════════════
    {
      id: 'a-child-who-has-never-spoken',
      volume: 'whisper',
      in: ['su-gia'],
      weight: 7,
      quiet: 0,
      salience: () => 6,
    },
    {
      id: 'su-gia-di-qua-nhung-lang-khong-tra-loi',
      volume: 'whisper',
      in: ['su-gia'],
      weight: 4,
      quiet: 2,
    },
    {
      id: 'he-asked-for-an-iron-horse',
      volume: 'card',
      band: 'shrine',
      in: ['su-gia'],
      weight: 9,
      quiet: 2,
      when: (ctx) => ctx.said('a-child-who-has-never-spoken'),
      salience: () => 10,
      options: [
        {
          id: 'make-it',
          cost: { supplies: 220, gold: 180 },
          historicity: 'annal',
          to: 'ren-sat',
          apply: (ctx) => {
            ctx.remember('forged', 1);
            ctx.remember('echoTurn', ctx.state.turn);
          },
        },
        {
          id: 'a-child-is-a-child',
          cost: { food: 160 },
          historicity: 'divergent',
          to: 'cho-gao',
          apply: (ctx) => { ctx.remember('gao', 1); },
        },
        {
          id: 'dua-ve-trieu',
          cost: { gold: 60 },
          historicity: 'divergent',
          to: 'dua-ve-trieu',
          apply: (ctx) => { ctx.remember('trieu', 1); },
        },
      ],
    },

    // ══ ren-sat — the forge, and the offering ══════════════════════════════
    {
      id: 'he-eats-everything-the-village-has',
      volume: 'whisper',
      in: ['ren-sat'],
      weight: 5,
      quiet: 2,
    },
    {
      id: 'his-armour-splits',
      volume: 'whisper',
      in: ['ren-sat'],
      weight: 5,
      quiet: 3,
      when: (ctx) => ctx.recall('nuoi') >= 1,
    },
    {
      id: 'vien-thu-lai-coi-kho',
      volume: 'whisper',
      in: ['ren-sat'],
      weight: 4,
      quiet: 3,
      when: (ctx) => ctx.recall('nuoi') >= 2,
    },
    {
      /**
       * The offering. Repeatable, priced in men, and the whole reason this story is a wager: the
       * door stays open and every time it is taken he is bigger and the levy is smaller.
       */
      id: 'bay-nong-com-ba-nong-ca',
      volume: 'whisper',
      in: ['ren-sat'],
      weight: 8,
      quiet: 2,
      repeatable: true,
      maxTimes: 3,
      opening: { on: 'land', actionKey: 'gop' },
      options: [
        {
          id: 'gui-nguoi-va-gao',
          cost: OFFERING,
          historicity: 'annal',
          to: 'ren-sat',
          apply: (ctx) => {
            const fed = ctx.bump('nuoi');
            const land = ctx.land();
            if (land) land.loyalty = Math.min(100, land.loyalty + 5);
            // Which sending this was. The door takes two hundred able men and ninety of stores
            // and used to report nothing whatsoever, so the wager's whole middle — the part
            // where you are deciding whether to pay again — was invisible.
            ctx.note('fed', fed);
            // He is visibly bigger, and the province can see where this is going.
            if (fed >= 2) ctx.heat(1);
          },
        },
      ],
    },
    {
      /**
       * The muster horn. Whether he is ready is decided here and nowhere else — by how many times
       * the player actually paid, against a clock they did not set.
       */
      id: 'ngua-sat-da-xong',
      volume: 'blow',
      leadsTo: ['ra-tran', 'khong-du-an'],
      band: 'march',
      in: ['ren-sat'],
      weight: 10,
      quiet: 1,
      tone: 'threat',
      when: (ctx) => ctx.world.waveIncoming || ctx.world.ticksToBoss <= MUSTER_TICKS,
      salience: () => 14,
      effect: (ctx) => {
        if (ctx.recall('nuoi') >= 2) ctx.goTo('ra-tran');
        else ctx.goTo('khong-du-an');
      },
    },

    // ══ ra-tran ════════════════════════════════════════════════════════════
    {
      id: 'nguoi-lang-dung-ben-duong',
      volume: 'whisper',
      in: ['ra-tran'],
      weight: 5,
      quiet: 1,
    },
    {
      id: 'he-rides',
      volume: 'blow',
      leadsTo: ['soc-son'],
      band: 'fire',
      in: ['ra-tran'],
      weight: 12,
      quiet: 1,
      tone: 'reward',
      salience: () => 14,
      effect: (ctx) => {
        const fed = ctx.recall('nuoi');
        grantHost(ctx, HOST_PER_OFFERING * fed, ctx.land());
        grantEliteTier(ctx);
        ctx.remember('rode', 1);
        announce(ctx, storyText('thanh-giong.he-rides.toast', {
          count: HOST_PER_OFFERING * fed,
          land: ctx.land()?.name ?? '',
        }), 'reward');
        ctx.goTo('soc-son');
      },
    },

    // ══ soc-son — the record's ending ══════════════════════════════════════
    {
      id: 'soc-son-khong-xuong-nua',
      volume: 'blow',
      band: 'mountain',
      in: ['soc-son'],
      weight: 10,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        // Permanence, which is what the record pays in: a shrine that never wears off, and a name
        // a later run may say out loud.
        const land = ctx.land();
        monument(ctx, { defense: 14, stability: 8 }, land);
        loyaltyFloor(ctx, 70, land);
        leaveEcho(ctx, land?.name ?? '');
      },
    },
    {
      id: 'nga-ngua-con-ngua-ve-mot-minh',
      volume: 'blow',
      band: 'field',
      in: ['nga-ngua'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => {
        const land = ctx.land();
        if (land) land.loyalty = Math.max(0, land.loyalty - 8);
      },
    },
    {
      // The pre-trunk id, kept: this is still "no iron horse was ever forged".
      id: 'the-village-forgets-him',
      volume: 'whisper',
      in: ['khong-du-an'],
      weight: 8,
      terminal: true,
      effect: (ctx) => {
        const land = ctx.land();
        if (land) land.loyalty = Math.max(0, land.loyalty - 5);
      },
    },

    // ══ cho-gao — fed, never armed ═════════════════════════════════════════
    {
      id: 'no-lon-nhanh-qua',
      volume: 'whisper',
      in: ['cho-gao'],
      weight: 6,
      quiet: 1,
      effect: (ctx) => { bounty(ctx, { food: -40 }); },
    },
    {
      id: 'lang-bat-dau-so',
      volume: 'whisper',
      in: ['cho-gao'],
      weight: 5,
      quiet: 3,
    },
    {
      id: 'lam-gi-voi-mot-nguoi-khong-lo',
      volume: 'card',
      band: 'granary',
      in: ['cho-gao'],
      weight: 9,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 4 ? 9 : 0),
      options: [
        {
          id: 'cho-di-tay-khong',
          historicity: 'divergent',
          to: 'tay-khong',
          apply: (ctx) => { ctx.remember('tay-khong', 1); },
        },
        {
          id: 'giu-o-lang',
          historicity: 'divergent',
          to: 'giu-lang',
          apply: (ctx) => { ctx.remember('giu', 1); },
        },
        {
          id: 'nau-chuong-chua',
          cost: { gold: 90 },
          historicity: 'divergent',
          to: 'chuong-chua',
          apply: (ctx) => { ctx.remember('dong', 1); },
        },
      ],
    },

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
      options: [
        {
          id: 'de-no-di',
          historicity: 'divergent',
          to: 'nhung-cay-tre',
          apply: (ctx) => { reinforceHosts(ctx, 260); },
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
        grantHost(ctx, 900, ctx.land());
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

    {
      id: 'no-an-het-ca-huyen',
      volume: 'whisper',
      in: ['giu-lang'],
      weight: 5,
      quiet: 1,
      effect: (ctx) => { bounty(ctx, { food: -60 }); },
    },
    {
      id: 'giu-hay-tha',
      volume: 'card',
      band: 'granary',
      in: ['giu-lang'],
      weight: 9,
      quiet: 3,
      options: [
        {
          id: 'nuoi-tiep',
          cost: { food: 220 },
          historicity: 'divergent',
          to: 'nguoi-khong-lo',
          apply: (ctx) => { ctx.remember('nuoi-mai', 1); },
        },
        {
          id: 'de-no-di',
          historicity: 'divergent',
          to: 'bo-di',
          apply: (ctx) => { ctx.remember('tha', 1); },
        },
      ],
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

    {
      id: 'nha-su-khong-dong-y',
      volume: 'whisper',
      in: ['chuong-chua'],
      weight: 5,
      quiet: 1,
    },
    {
      id: 'chuong-hay-giap',
      volume: 'card',
      band: 'shrine',
      in: ['chuong-chua'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'cu-nau',
          historicity: 'divergent',
          to: 'giap-dong',
          apply: (ctx) => { ctx.remember('nau', 1); },
        },
        {
          id: 'nghe-nha-su',
          historicity: 'divergent',
          to: 'su-phan-doi',
          apply: (ctx) => {
            ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
          },
        },
      ],
    },
    {
      id: 'giap-dong-nang-hon',
      volume: 'blow',
      band: 'fire',
      in: ['giap-dong'],
      weight: 10,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        grantHost(ctx, 1100, ctx.land());
        // No shrine. The province that gave up its bells does not get a holy place out of it.
        const land = ctx.land();
        if (land) land.loyalty = Math.max(0, land.loyalty - 10);
      },
    },
    {
      id: 'chuong-van-treo',
      volume: 'whisper',
      in: ['su-phan-doi'],
      weight: 8,
      terminal: true,
    },

    // ══ dua-ve-trieu — taken indoors ═══════════════════════════════════════
    {
      id: 'no-thoi-an',
      volume: 'whisper',
      in: ['dua-ve-trieu'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'trieu-dinh-cai-nhau-ve-no',
      volume: 'whisper',
      in: ['dua-ve-trieu'],
      weight: 5,
      quiet: 3,
    },
    {
      id: 'lam-gi-voi-dua-be-o-trieu',
      volume: 'card',
      band: 'court',
      in: ['dua-ve-trieu'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'phong-cho-no',
          historicity: 'divergent',
          to: 'phong-vuong',
          apply: (ctx) => { ctx.remember('phong', 1); },
        },
        {
          id: 'goi-thay-thuoc',
          cost: { gold: 70 },
          historicity: 'divergent',
          to: 'thay-thuoc',
          apply: (ctx) => { ctx.remember('kham', 1); },
        },
        {
          id: 'tra-ve-lang',
          historicity: 'divergent',
          // The confluence: the forge finishes after all, and the record resumes — but `drift`
          // has already been stamped and does not come back.
          to: 'ren-sat',
          apply: (ctx) => { ctx.remember('forged', 1); ctx.remember('tra-ve', 1); },
        },
      ],
    },
    {
      id: 'mot-tuoc-cho-dua-tre',
      volume: 'card',
      band: 'court',
      in: ['phong-vuong'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'dung-no-that',
          historicity: 'divergent',
          to: 'hau-tre',
          apply: (ctx) => { ctx.remember('dung', 1); },
        },
        {
          id: 'de-no-yen',
          historicity: 'divergent',
          to: 'chet-yeu',
          apply: (ctx) => { ctx.heat(1); },
        },
      ],
    },
    {
      id: 'hau-tre-lon-len',
      volume: 'whisper',
      in: ['hau-tre'],
      weight: 8,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        loyaltyFloor(ctx, 62, ctx.land());
        bounty(ctx, { humans: 260 });
      },
    },
    {
      id: 'chet-o-trieu',
      volume: 'blow',
      band: 'night',
      in: ['chet-yeu'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => {
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 10);
      },
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

    // ══ khong-goi — nobody was called ══════════════════════════════════════
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
  ],
};
