import { pick } from '../../systems/story/StorySystem';
import {
  commitHostAbroad,
  monument,
  opinion,
  plunderSupply,
  returnHostFromAbroad,
  sabotageIncoming,
  shiftWaveClock,
  standing,
  truce,
  bounty, windfall,
} from '../../systems/story/effects';
import type { GameState, Kingdom } from '../../state/types';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * Tiên phát chế nhân — Lý Thường Kiệt, 1075–77.
 *
 * Song was massing grain and men at Ung Châu, Khâm Châu and Liêm Châu for an invasion of Đại Việt.
 * He did not wait for it: he took an army over the border in late 1075, reduced Khâm and Liêm
 * quickly, besieged Ung Châu for about six weeks, burned the depots — and then **withdrew**, which
 * is the part everyone forgets and the part that mattered. He built the Như Nguyệt river line,
 * held the Song counter-invasion there through 1077, had *Nam quốc sơn hà* read at night from the
 * shrine on the bank, and then **offered terms instead of pursuing**.
 *
 * ## A lever, not a wager
 *
 * A wager spends resources you could have spent on the army. **A lever spends the army.** Striking
 * first commits the realm's largest host across the border — it is off the map, cannot defend and
 * cannot be recalled — while the wave clock keeps running. The question is not "can I afford this"
 * but *"can my provinces survive without a field army, to make the next invasion smaller?"*
 *
 * Every one of the four decisions on the record is a real strategic call with a live cost, and
 * both divergences are full campaigns rather than consolations:
 *
 * - `cho-giac-toi` — keep the army home and take them at full strength. The conservative line, and
 *   it has a genuine win in it.
 * - `sa-lay` — press on past Ung Châu with the realm behind you empty. Including the ending where
 *   you turn for home and arrive after the wave.
 *
 * ## It absorbs two thin templates
 *
 * `tien-phat` was a charge story about burning border depots — the right event with no campaign
 * around it. `nam-quoc` was the poem, which belongs to *this* campaign: it was read on the Như
 * Nguyệt line in 1077. Its beats live here now, and the old template is left registered as a
 * one-fragment stub so that a live save holding it can still resolve and close.
 */

function coldestRival(state: GameState): Kingdom | undefined {
  return state.kingdoms
    .filter((kingdom) => kingdom.id !== 'player' && !kingdom.isDefeated)
    .sort((a, b) => (a.relations ?? 50) - (b.relations ?? 50))[0];
}

export const tienPhat: StoryTemplate = {
  id: 'tien-phat',
  seedWeight: 2.5,
  minTurn: 24,

  regard: (ctx) => {
    if (ctx.recall('hoa') === 1) return 'settled';
    if (ctx.recall('abroad') > 0) return 'committed';
    if (ctx.recall('waited') === 1) return 'waiting';
    return undefined;
  },

  seed: (state) => {
    const ascent = state.ascent;
    if (!ascent) return undefined;
    // A lever needs something to lever: a host in hand, a rival gone cold, and a Great Invasion
    // far enough off that marching away from home is a decision rather than suicide.
    const host = state.armies.some((army) => army.kingdomId === 'player' && !army.isLevy);
    if (!host) return undefined;
    const rival = coldestRival(state);
    if (!rival || (rival.relations ?? 50) > 45) return undefined;
    const land = pick(state.lands.filter((candidate) => candidate.ownerId === 'player'));
    return { kingdomId: rival.id, landId: land?.id };
  },

  entry: 'tin-bien',

  nodes: [
    // The record.
    { id: 'tin-bien', historicity: 'chinh-su', patience: 6, onIgnored: 'cho-giac-toi' },
    { id: 'xuat-quan', historicity: 'chinh-su', patience: 8, onIgnored: 'sa-lay' },
    { id: 'nhu-nguyet', historicity: 'chinh-su', patience: 7, onIgnored: 'giu-song' },
    { id: 'giu-song', historicity: 'chinh-su', patience: 6, onIgnored: 'song-rut-khong-hoa' },
    { id: 'giang-hoa-thanh', historicity: 'chinh-su', terminal: true },
    { id: 'song-rut-khong-hoa', historicity: 'da-su', terminal: true },

    // Cross and meet them instead of holding behind the stakes.
    { id: 'qua-song', historicity: 'ngoai-truyen', patience: 5, onIgnored: 'mat-phong-tuyen' },
    { id: 'thang-lon', historicity: 'ngoai-truyen', terminal: true },
    { id: 'mat-phong-tuyen', historicity: 'ngoai-truyen', terminal: true },

    // Press on past Ung Châu.
    { id: 'sa-lay', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'quay-ve-khong-kip' },
    { id: 'danh-tiep', historicity: 'ngoai-truyen', patience: 5, onIgnored: 'mat-quan' },
    { id: 'quay-ve-khong-kip', historicity: 'ngoai-truyen', terminal: true },
    { id: 'chiem-dat-tong', historicity: 'ngoai-truyen', terminal: true },
    { id: 'mat-quan', historicity: 'ngoai-truyen', terminal: true },

    // Wait for them. The conservative line.
    { id: 'cho-giac-toi', historicity: 'ngoai-truyen', patience: 8, onIgnored: 'co-thu' },
    { id: 'co-thu', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'giu-duoc-kinh' },
    { id: 'giu-duoc-kinh', historicity: 'ngoai-truyen', terminal: true },
    { id: 'mat-kinh', historicity: 'ngoai-truyen', terminal: true },
    { id: 'chan-bien', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'vo-tran-bien' },
    { id: 'chan-duoc', historicity: 'ngoai-truyen', terminal: true },
    { id: 'vo-tran-bien', historicity: 'ngoai-truyen', terminal: true },

    // Pursue instead of offering terms.
    { id: 'tan-sat', historicity: 'ngoai-truyen', patience: 5, onIgnored: 'hoa-muon' },
    { id: 'chien-tranh-dai', historicity: 'ngoai-truyen', terminal: true },
    { id: 'hoa-muon', historicity: 'ngoai-truyen', terminal: true },
  ],

  fragments: [
    // ══ tin-bien ═══════════════════════════════════════════════════════════
    {
      // Preserved from the pre-trunk charge story.
      id: 'they-are-stacking-grain-at-the-border',
      volume: 'whisper',
      in: ['tin-bien'],
      weight: 7,
      quiet: 0,
      tone: 'threat',
    },
    {
      id: 'ba-chau-cung-mot-luc',
      volume: 'whisper',
      in: ['tin-bien'],
      weight: 5,
      quiet: 2,
    },
    {
      id: 'danh-truoc-hay-doi',
      volume: 'card',
      band: 'border',
      in: ['tin-bien'],
      weight: 10,
      quiet: 2,
      salience: (ctx) => (ctx.age >= 2 ? 11 : -20),
      options: [
        {
          id: 'danh-truoc',
          historicity: 'annal',
          to: 'xuat-quan',
          apply: (ctx) => {
            // The lever pulls here: the host leaves the map and the wave clock does not stop.
            const sent = commitHostAbroad(ctx);
            ctx.remember('sent', sent);
            opinion(ctx, -22, ctx.story.cast.kingdomId);
          },
        },
        {
          id: 'doi-chung-toi',
          historicity: 'divergent',
          to: 'cho-giac-toi',
          apply: (ctx) => { ctx.remember('waited', 1); },
        },
      ],
    },

    // ══ xuat-quan — the army is not home ═══════════════════════════════════
    {
      id: 'lo-bo-van',
      volume: 'whisper',
      in: ['xuat-quan'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'ung-chau-bon-muoi-hai-ngay',
      volume: 'whisper',
      in: ['xuat-quan'],
      weight: 6,
      quiet: 3,
    },
    {
      id: 'nha-khong-co-quan',
      volume: 'whisper',
      in: ['xuat-quan'],
      weight: 5,
      quiet: 3,
      tone: 'threat',
    },
    {
      id: 'dot-kho-roi-rut',
      volume: 'card',
      band: 'fire',
      in: ['xuat-quan'],
      weight: 10,
      quiet: 3,
      salience: () => 11,
      options: [
        {
          id: 'dot-kho-va-ve',
          historicity: 'annal',
          to: 'nhu-nguyet',
          apply: (ctx) => {
            plunderSupply(ctx);
            sabotageIncoming(ctx, 0.35);
            shiftWaveClock(ctx, 4);
            returnHostFromAbroad(ctx, 0.85);
            ctx.remember('burned', 1);
          },
        },
        {
          id: 'danh-tiep-nua',
          historicity: 'divergent',
          to: 'sa-lay',
          apply: (ctx) => { ctx.remember('press', 1); ctx.heat(2); },
        },
      ],
    },

    // ══ nhu-nguyet ═════════════════════════════════════════════════════════
    {
      id: 'dong-coc-ben-song',
      volume: 'whisper',
      in: ['nhu-nguyet'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'giu-song-hay-qua-song',
      volume: 'card',
      band: 'river',
      in: ['nhu-nguyet'],
      weight: 10,
      quiet: 2,
      options: [
        {
          id: 'dong-coc-va-giu',
          historicity: 'annal',
          to: 'giu-song',
          apply: (ctx) => {
            monument(ctx, { defense: 16, stability: 6 }, ctx.land());
            ctx.remember('line', 1);
          },
        },
        {
          id: 'ra-danh-o-ben',
          historicity: 'divergent',
          to: 'qua-song',
          apply: (ctx) => { ctx.heat(2); },
        },
      ],
    },

    // ══ giu-song — the poem, absorbed from nam-quoc ════════════════════════
    {
      id: 'a-voice-from-the-shrine',
      volume: 'whisper',
      in: ['giu-song'],
      weight: 8,
      quiet: 1,
      tone: 'reward',
    },
    {
      id: 'chung-khong-qua-duoc',
      volume: 'whisper',
      in: ['giu-song'],
      weight: 5,
      quiet: 3,
    },
    {
      id: 'giang-hoa-hay-truy-kich',
      volume: 'card',
      band: 'river',
      in: ['giu-song'],
      weight: 10,
      quiet: 2,
      salience: () => 11,
      options: [
        {
          id: 'giang-hoa',
          historicity: 'annal',
          to: 'giang-hoa-thanh',
          apply: (ctx) => {
            truce(ctx, ctx.story.cast.kingdomId, 60);
            standing(ctx, 10);
            ctx.remember('hoa', 1);
          },
        },
        {
          id: 'truy-kich',
          historicity: 'divergent',
          to: 'tan-sat',
          apply: (ctx) => { ctx.remember('duoi', 1); ctx.heat(3); },
        },
      ],
    },
    {
      id: 'giang-hoa-xong',
      volume: 'blow',
      band: 'court',
      in: ['giang-hoa-thanh'],
      weight: 10,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        shiftWaveClock(ctx, 6);
        standing(ctx, 12);
        monument(ctx, { defense: 10, stability: 10 }, ctx.land());
      },
    },
    {
      id: 'chung-rut-khong-hoa',
      volume: 'whisper',
      in: ['song-rut-khong-hoa'],
      weight: 8,
      terminal: true,
      effect: (ctx) => { shiftWaveClock(ctx, 2); },
    },

    // ══ qua-song ═══════════════════════════════════════════════════════════
    {
      id: 'qua-song-luc-nua-dem',
      volume: 'whisper',
      in: ['qua-song'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'danh-o-ben-kia',
      volume: 'card',
      band: 'river',
      in: ['qua-song'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'danh-manh',
          historicity: 'divergent',
          to: 'thang-lon',
          apply: (ctx) => { ctx.remember('lon', 1); },
        },
        {
          id: 'rut-ve-bo-nam',
          historicity: 'divergent',
          to: 'mat-phong-tuyen',
          apply: (ctx) => { ctx.heat(1); },
        },
      ],
    },
    {
      id: 'thang-lon-o-ben-kia',
      volume: 'blow',
      band: 'fire',
      in: ['thang-lon'],
      weight: 10,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        sabotageIncoming(ctx, 0.6);
        shiftWaveClock(ctx, 8);
        bounty(ctx, { gold: 300, supplies: 200 });
      },
    },
    {
      id: 'mat-phong-tuyen-that',
      volume: 'blow',
      band: 'river',
      in: ['mat-phong-tuyen'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => { shiftWaveClock(ctx, -3); },
    },

    // ══ sa-lay ═════════════════════════════════════════════════════════════
    {
      id: 'duong-luong-dai-ra',
      volume: 'whisper',
      in: ['sa-lay'],
      weight: 6,
      quiet: 1,
      tone: 'threat',
    },
    {
      id: 'mua-doi-o-ben-kia',
      volume: 'whisper',
      in: ['sa-lay'],
      weight: 5,
      quiet: 3,
    },
    {
      id: 've-hay-danh-toi-cung',
      volume: 'card',
      band: 'march',
      in: ['sa-lay'],
      weight: 10,
      quiet: 2,
      options: [
        {
          id: 'quay-ve',
          historicity: 'divergent',
          to: 'quay-ve-khong-kip',
          apply: (ctx) => { returnHostFromAbroad(ctx, 0.7); },
        },
        {
          id: 'danh-toi-cung',
          historicity: 'divergent',
          to: 'danh-tiep',
          apply: (ctx) => { ctx.heat(3); },
        },
      ],
    },
    {
      id: 've-khong-kip',
      volume: 'blow',
      band: 'march',
      in: ['quay-ve-khong-kip'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => { shiftWaveClock(ctx, -2); },
    },
    {
      id: 'lay-them-mot-thanh',
      volume: 'card',
      band: 'fire',
      in: ['danh-tiep'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'giu-dat-tong',
          historicity: 'divergent',
          to: 'chiem-dat-tong',
          apply: (ctx) => { ctx.remember('giu-dat', 1); },
        },
        {
          id: 'bo-ma-ve',
          historicity: 'divergent',
          to: 'mat-quan',
          apply: (ctx) => { ctx.heat(2); },
        },
      ],
    },
    {
      id: 'chiem-duoc-dat-tong',
      volume: 'blow',
      band: 'crowd',
      in: ['chiem-dat-tong'],
      weight: 10,
      terminal: true,
      effect: (ctx) => {
        returnHostFromAbroad(ctx, 0.6);
        bounty(ctx, { gold: 600, supplies: 400 });
        // Permanent hostility: you are holding their ground now.
        opinion(ctx, -40, ctx.story.cast.kingdomId);
        standing(ctx, -18);
      },
    },
    {
      id: 'mat-ca-dao-quan',
      volume: 'blow',
      band: 'night',
      in: ['mat-quan'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => {
        ctx.remember('abroad', 0);
        // The host was lost seasons ago, in `commitHostAbroad`, so the ledger has nothing to
        // report here and the ending had no present tense at all. What is happening *now* is
        // that everybody has been told.
        standing(ctx, -10);
      },
    },

    // ══ cho-giac-toi — the conservative line ═══════════════════════════════
    {
      id: 'chung-den-du-quan',
      volume: 'whisper',
      in: ['cho-giac-toi'],
      weight: 6,
      quiet: 1,
      tone: 'threat',
    },
    {
      id: 'co-thu-hay-chan-bien',
      volume: 'card',
      band: 'border',
      in: ['cho-giac-toi'],
      weight: 10,
      quiet: 2,
      options: [
        {
          id: 'co-thu-trong-thanh',
          historicity: 'divergent',
          to: 'co-thu',
          apply: (ctx) => { ctx.remember('thu', 1); },
        },
        {
          id: 'chan-o-bien',
          historicity: 'divergent',
          to: 'chan-bien',
          apply: (ctx) => { ctx.remember('chan', 1); },
        },
      ],
    },
    {
      id: 'trong-thanh-dem-ngay',
      volume: 'whisper',
      in: ['co-thu'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'giu-duoc-hay-khong',
      volume: 'card',
      band: 'fire',
      in: ['co-thu'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'giu-den-cung',
          historicity: 'divergent',
          to: 'giu-duoc-kinh',
          apply: (ctx) => { ctx.remember('giu', 1); },
        },
        {
          id: 'bo-ngoai-thanh',
          historicity: 'divergent',
          to: 'mat-kinh',
          apply: (ctx) => { ctx.heat(2); },
        },
      ],
    },
    {
      id: 'giu-duoc-kinh-thanh',
      volume: 'blow',
      band: 'fire',
      in: ['giu-duoc-kinh'],
      weight: 10,
      terminal: true,
      effect: (ctx) => {
        ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 10);
      },
    },
    {
      id: 'mat-kinh-thanh',
      volume: 'blow',
      band: 'fire',
      in: ['mat-kinh'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => {
        ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 20);
      },
    },
    {
      id: 'dan-quan-o-bien',
      volume: 'whisper',
      in: ['chan-bien'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'chan-duoc-hay-vo',
      volume: 'card',
      band: 'border',
      in: ['chan-bien'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'danh-chan',
          historicity: 'divergent',
          to: 'chan-duoc',
          apply: (ctx) => { ctx.remember('chan-duoc', 1); },
        },
        {
          id: 'lui-ve-giu',
          historicity: 'divergent',
          to: 'vo-tran-bien',
          apply: (ctx) => { ctx.heat(1); },
        },
      ],
    },
    {
      id: 'chan-duoc-o-bien',
      volume: 'blow',
      band: 'border',
      in: ['chan-duoc'],
      weight: 10,
      terminal: true,
      tone: 'reward',
      effect: (ctx) => {
        shiftWaveClock(ctx, 5);
        standing(ctx, 8);
      },
    },
    {
      id: 'vo-o-tran-bien',
      volume: 'blow',
      band: 'field',
      in: ['vo-tran-bien'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => { shiftWaveClock(ctx, -3); },
    },

    // ══ tan-sat — pursue instead of terms ══════════════════════════════════
    {
      id: 'duoi-theo-qua-bien',
      volume: 'whisper',
      in: ['tan-sat'],
      weight: 6,
      quiet: 1,
    },
    {
      id: 'tra-tu-binh-hay-khong',
      volume: 'card',
      band: 'court',
      in: ['tan-sat'],
      weight: 9,
      quiet: 2,
      options: [
        {
          id: 'khong-tra',
          historicity: 'divergent',
          to: 'chien-tranh-dai',
          apply: (ctx) => { ctx.remember('giu-tu', 1); },
        },
        {
          id: 'tra-tu-binh',
          historicity: 'divergent',
          to: 'hoa-muon',
          apply: (ctx) => { ctx.remember('tra', 1); },
        },
      ],
    },
    {
      id: 'chien-tranh-keo-dai',
      volume: 'blow',
      band: 'march',
      in: ['chien-tranh-dai'],
      weight: 10,
      terminal: true,
      tone: 'threat',
      effect: (ctx) => {
        // A long war: the clock never goes back to what it was.
        shiftWaveClock(ctx, -4);
        opinion(ctx, -30, ctx.story.cast.kingdomId);
      },
    },
    {
      id: 'hoa-muon-va-dat',
      volume: 'blow',
      band: 'court',
      in: ['hoa-muon'],
      weight: 10,
      terminal: true,
      effect: (ctx) => {
        truce(ctx, ctx.story.cast.kingdomId, 45);
        bounty(ctx, { gold: -250 });
      },
    },
  ],
};
