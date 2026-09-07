import { preloadStoryPrints } from '../ui/storyPrint';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { sheetSpan } from '../game/cameraLayout';
import { applyRenderScale, localPointer } from '../game/graphicsQuality';
import { t } from '../i18n';
import { POWER_CARDS, findPowerCard } from '../data/ascentCards';
import {
  CABINET_DEEDS,
  cabinetProgress,
  canCombine,
  combineCard,
  combineCost,
  combinesReady,
  deedDone,
  getCabinet,
  openingHand,
  openingHandSlots,
  PACK_GROWTH_PCT,
  recordRubbingPack,
  revealRubbing,
  rubbingPackPrice,
  setOpeningHand,
  cabinetWeightMult,
  type RubbingReveal,
} from '../state/cabinet';
import { getLegacy, spendLegacyPoints } from '../state/legacy';
import { AMBITION_PER_POWER_CARD, PITY_HARD_CAP } from '../game/ascentConfig';
import { motionMs, reducedMotion } from '../game/lifeSettings';
import { soundDirector } from '../ui/sound/SoundDirector';
import { liftForInput, quietUntilNextFrame, swallowRestOfPress } from '../ui/inputGeneration';
import { BACK_BAR_HEIGHT, InkUI, INK_UI, scrollGestureConsumedTap, type InkScrollArea } from '../ui/InkUI';
import { CARD_FACE_H, CARD_FACE_W, cardFaceOverlay, stampCardFace } from '../ui/cardFace';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { attachPagePaper } from '../ui/ink/paperSheet';
import { attachDesktopBackdrop } from '../ui/desktopBackdrop';
import { sawtoothBand, seal } from '../ui/ink/devices';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import type { AscentRarity } from '../state/types';

/**
 * Tàng Ấn Các — the Cabinet of Seals. The collection's home, beside the dynasty sheet.
 *
 * Three pages in one scene: the cabinet (rubbings, deeds, the opening hand, the grid of all
 * fifty seals, the forge), the combine ceremony for one seal, and the thác bản scratch reveal.
 * Built on the HistoryScene shape — header and back bar as fixed chrome above an
 * `InkScrollArea` — because that page already solved the two input traps this one would
 * otherwise refind: chrome must sit at a higher depth than scrolled rows (stencils clip pixels,
 * not hit areas), and taps inside the list must check `scrollGestureConsumedTap`.
 *
 * Every card face on this page is a stamped bake (`cardFace.ts`) — the grid is fifty quads,
 * not fifty live Graphics.
 */

const CHROME_DEPTH = 10;
/** Grid geometry: three faces a row, the mock's own proportions. */
const GRID_COLS = 3;
const PAD = 20;

/** The three forge recipes, derived from the card table so a new evolution appears by itself. */
function forgeRecipes(): { a: string; b: string; result: string }[] {
  const seen = new Set<string>();
  const recipes: { a: string; b: string; result: string }[] = [];
  for (const card of POWER_CARDS) {
    if (!card.evolvesWith || !card.evolvesInto || seen.has(card.evolvesInto)) continue;
    seen.add(card.evolvesInto);
    recipes.push({ a: card.id, b: card.evolvesWith, result: card.evolvesInto });
  }
  return recipes;
}

const RARITY_COLOR: Record<AscentRarity, number> = {
  bronze: 0x9c6b3f,
  silver: 0xa8adb4,
  gold: INK_UI.gold,
  jade: INK_UI.jade,
};

/** The binder's sort: rarity first, then the cabinet level, so the strongest seals lead. */
const RARITY_RANK: Record<AscentRarity, number> = { jade: 3, gold: 2, silver: 1, bronze: 0 };

type BinderFilter = 'all' | 'held' | 'lv2' | 'ready';
const BINDER_FILTERS: BinderFilter[] = ['all', 'held', 'lv2', 'ready'];

export class CabinetScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  private mode: 'cabinet' | 'combine' | 'rubbing' = 'cabinet';
  /** The seal the combine page is about. */
  private combineId?: string;
  /** The pull the scratch page is revealing — rolled once on entry, never re-rolled by render. */
  private reveal?: RubbingReveal;
  /** Cover strips still hiding the print, cleared under the pointer. */
  private coverStrips: Phaser.GameObjects.Graphics[] = [];
  private stripsLeft = 0;
  private revealDone = false;
  private resultRows: Phaser.GameObjects.GameObject[] = [];
  private content: Phaser.GameObjects.GameObject[] = [];
  private scroll?: InkScrollArea;
  /** Where the list should stand after the next re-render, so a tap does not throw the reader
   *  back to the top of a seventeen-row grid. */
  private pendingScroll = 0;
  private pendingAnchor?: ReturnType<InkScrollArea['snapshotAnchor']>;
  /** Which seals the binder shows. Kept across re-renders; reset on leaving the scene. */
  private filter: BinderFilter = 'all';
  /** The open card view, above the page. */
  private viewObjects: Phaser.GameObjects.GameObject[] = [];
  /** Set while the combine's fold plays, so the action cannot fire twice. */
  private combining = false;
  /** Whether the "ways to earn more" list is open; unset means open only when nothing waits. */
  private faucetsOpen?: boolean;

  constructor() {
    super('CabinetScene');
  }

  preload(): void {
    preloadStoryPrints(this, import.meta.env.BASE_URL);
  }

  create(): void {
    applyRenderScale(this);
    applyPaperFX(this);
    attachPagePaper(this);
    // The desktop's sheet beyond the column: the front page's landscape, faint, so this reads as a
    // page lying on the same desk. Nothing on the phone.
    attachDesktopBackdrop(this);
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT).setDepth(-10);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
    this.cameras.main.fadeIn(190, 0xe9, 0xdf, 0xc2);
    this.mode = 'cabinet';
    this.render();
  }

  private clear(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.scroll?.destroy();
    this.scroll = undefined;
    for (const item of this.content) item.destroy();
    this.content = [];
    this.closeCardView();
    this.combining = false;
    this.coverStrips = [];
    this.resultRows = [];
  }

  private chrome<T extends Phaser.GameObjects.GameObject & { setDepth(value: number): T }>(object: T): T {
    this.content.push(object.setDepth(CHROME_DEPTH));
    return object;
  }

  private keep<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.content.push(object);
    return object;
  }

  private render(): void {
    // A page rebuilt inside a press must not answer that press's release with what it just built,
    // and nothing built this frame may be pressed this frame. See `ui/inputGeneration`.
    swallowRestOfPress(this);
    quietUntilNextFrame(this);
    this.clear();
    if (this.mode === 'combine' && this.combineId) {
      this.renderCombine(this.combineId);
      return;
    }
    if (this.mode === 'rubbing' && this.reveal) {
      this.renderRubbing(this.reveal);
      return;
    }
    this.mode = 'cabinet';
    this.renderCabinet();
  }

  // ── The cabinet page ──────────────────────────────────────────────────────

  private renderCabinet(): void {
    const progress = cabinetProgress();
    const store = getCabinet();

    // Header chrome: the name, and the two numbers that say how the hunt is going.
    const title = this.chrome(this.add.text(GAME_WIDTH / 2, 26, t('cabinet.title'), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '24px', fontStyle: '700', align: 'center',
    }).setOrigin(0.5, 0));
    title.setLetterSpacing?.(2);
    this.chrome(this.ui.label(GAME_WIDTH / 2, 58,
      t('cabinet.subtitle', { found: progress.found, total: progress.total, ready: combinesReady() }),
      'caption', { fontSize: '11px', align: 'center' }).setOrigin(0.5, 0));

    const backY = GAME_HEIGHT - BACK_BAR_HEIGHT - 10;
    this.chrome(this.ui.backBar(backY, () => this.scene.start('MenuScene', { mode: 'dynasty' })));

    const listTop = 80;
    const scroll = this.ui.scrollArea({ x: 0, y: listTop, width: GAME_WIDTH, height: backY - listTop - 6 });
    // `addTo` is not a convenience: it parents the hit zone *under* the list. Left unparented, the
    // zone — made after the content, so above it — took every tap on the page, and the report
    // was *I cannot click anything, does it really work?* Nothing inside the list had ever fired.
    const layer = this.add.container(0, 0);
    scroll.addTo(layer);
    this.keep(layer);
    this.scroll = scroll;
    const W = GAME_WIDTH - PAD * 2;
    let y = 4;

    // ── What you have, and the one thing to do with it ─────────────────────
    //
    // The page opened on a 52-unit strip and a list of "faucets" captioned in the game's own
    // coinages, and the report was *how do I get something here? it is meaningless*. It now
    // opens the way a shop counter does: how many rubbings you hold, what one does, and the
    // button that does it — then three short steps for the whole loop, and the ways to earn more
    // folded away until asked for.
    const hero = store.rubbings > 0;
    const heroTitle = hero ? t('cabinet.hero.title', { n: store.rubbings }) : t('cabinet.hero.none');
    const heroBody = this.ui.label(PAD + 12, 0, hero ? t('cabinet.hero.body') : t('cabinet.hero.noneBody'), 'caption',
      { fontSize: '10px', wordWrap: { width: W - 24 } });
    // Title, one sentence, the button, then the odds as a footnote under it — in that order.
    // The odds line used to sit between the sentence and the button with a ring floating at
    // the panel's edge, and the block read as three things fighting: *this looks messy*.
    const pityLine = this.ui.label(PAD + 12 + 18, 0, store.rubbingPity >= PITY_HARD_CAP
      ? t('cabinet.rub.pityDue')
      : t('cabinet.rub.pity', { n: store.rubbingPity, cap: PITY_HARD_CAP }), 'caption', { fontSize: '9px', color: '#8a7a60', wordWrap: { width: W - 24 - 18 } });
    const heroH = 12 + 20 + 4 + heroBody.height + (hero ? 10 + 44 : 0) + 8 + pityLine.height + 12;
    scroll.content.add(this.ui.panel({ x: PAD, y, width: W, height: heroH },
      { border: hero ? INK_UI.cinnabar : INK_UI.softBrush, borderWidth: hero ? 1.6 : 1.2, fillAlpha: 0.9 }));
    scroll.content.add(this.ui.label(PAD + 12, y + 12, heroTitle, 'label', { fontSize: '15px', ...(hero ? { color: '#a4402c' } : {}) }));
    heroBody.setY(y + 12 + 20 + 4);
    scroll.content.add(heroBody);
    let cursor = heroBody.y + heroBody.height;
    if (hero) {
      scroll.content.add(this.ui.button(
        { x: PAD + 12, y: cursor + 10, width: W - 24, height: 44 },
        t('cabinet.hero.rub', { n: store.rubbings }),
        () => {
          this.reveal = revealRubbing();
          if (!this.reveal) return;
          this.mode = 'rubbing';
          this.pendingScroll = 0; this.pendingAnchor = undefined;
          this.render();
        },
        { variant: 'primary', fontSize: '14px' },
      ));
      cursor += 10 + 44;
    }
    pityLine.setY(cursor + 8);
    scroll.content.add(pityLine);
    // The pity ring is the line's own icon now, a small dial at its head: it fills toward the
    // hard guarantee of gold-or-better, and turns gold when it is one pull away.
    {
      const cx = PAD + 12 + 7;
      const cy = pityLine.y + 6;
      const share = Math.min(1, store.rubbingPity / PITY_HARD_CAP);
      const ring = this.add.graphics();
      ring.lineStyle(2.5, INK_UI.softBrush, 0.35);
      ring.strokeCircle(cx, cy, 6);
      if (share > 0) {
        ring.lineStyle(2.5, share >= 1 - 1 / PITY_HARD_CAP ? INK_UI.gold : INK_UI.brush, 0.9);
        ring.beginPath();
        ring.arc(cx, cy, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share, false);
        ring.strokePath();
      }
      ring.setData('pityRing', share);
      scroll.content.add(ring);
    }
    y += heroH + 10;

    // The loop, in three steps a first visit can read: play to earn, scratch to reveal, three
    // copies climb a level and the hand carries the seals into the next reign.
    const stepW = Math.floor((W - 12) / 3);
    (['1', '2', '3'] as const).forEach((step, index) => {
      const x = PAD + index * (stepW + 6);
      const text = this.ui.label(x + 6, y + 18, t(`cabinet.steps.${step}` as Parameters<typeof t>[0]), 'caption',
        { fontSize: '9px', wordWrap: { width: stepW - 12 } });
      const h = 18 + text.height + 8;
      scroll.content.add(this.ui.panel({ x, y, width: stepW, height: h }, { border: INK_UI.softBrush, fillAlpha: 0.4 }));
      scroll.content.add(this.ui.label(x + 6, y + 5, step, 'label', { fontSize: '11px', color: '#8a5f1c' }));
      scroll.content.add(text);
      if (index === 2) y += h + 12;
    });

    // ── Ways to earn more, folded: open by tap, and open by default only when there is nothing to scratch ──
    const earnOpen = this.faucetsOpen ?? !hero;
    y = this.sectionHeader(scroll, y, `${t('cabinet.faucets')}  ${earnOpen ? '▾' : '▸'}`);
    this.gridTap(scroll, PAD, y - 30, W, 28, () => {
      this.faucetsOpen = !earnOpen;
      this.pendingScroll = this.scroll ? -this.scroll.content.y : 0;
      this.pendingAnchor = this.scroll?.snapshotAnchor();
      this.render();
    });
    if (earnOpen) {
      y = this.faucetRow(scroll, y, t('cabinet.faucet.run'), '', INK_UI.gold);
      y = this.faucetRow(scroll, y, t('cabinet.faucet.wave'), '', INK_UI.gold);
      for (const deed of CABINET_DEEDS) {
        const done = deedDone(deed);
        y = this.faucetRow(scroll, y,
          t(`cabinet.deed.${deed}` as Parameters<typeof t>[0]),
          done ? t('cabinet.deed.done') : t('cabinet.deed.pending'),
          done ? INK_UI.jade : INK_UI.softBrush);
      }
      // The Legacy pack: the dead surplus finally has a job. The price climbs per purchase.
      const packCost = rubbingPackPrice();
      const legacy = getLegacy();
      const packH = 46;
      scroll.content.add(this.ui.panel({ x: PAD, y, width: W, height: packH },
        { border: INK_UI.softBrush, fillAlpha: 0.45 }));
      scroll.content.add(this.ui.label(PAD + 12, y + 7, t('cabinet.pack', { cost: packCost }), 'label',
        { fontSize: '12px' }));
      scroll.content.add(this.ui.label(PAD + 12, y + 26,
        legacy.points >= packCost ? t('cabinet.pack.note', { pct: PACK_GROWTH_PCT }) : t('cabinet.pack.poor', { have: legacy.points }),
        'caption', { fontSize: '9px' }));
      if (legacy.points >= packCost) {
        scroll.content.add(this.ui.button(
          { x: PAD + W - 118, y: y + 6, width: 110, height: 32 },
          t('cabinet.pack.buy'),
          () => {
            if (!spendLegacyPoints(rubbingPackPrice())) return;
            recordRubbingPack();
            this.pendingScroll = 0; this.pendingAnchor = undefined;
            this.render();
          },
          { variant: 'secondary', fontSize: '10.5px' },
        ));
      }
      y += packH + 16;
    } else {
      y += 6;
    }

    // ── The opening hand ────────────────────────────────────────────────────
    y = this.sectionHeader(scroll, y, t('cabinet.hand.title'));
    const handNote = this.ui.label(PAD, y, t('cabinet.hand.sub'), 'caption',
      { fontSize: '9.5px', wordWrap: { width: W } });
    scroll.content.add(handNote);
    y += handNote.height + 8;
    const hand = openingHand();
    const slots = openingHandSlots();
    const slotW = Math.floor((W - (3 - 1) * 8) / 3);
    const slotH = Math.round(slotW * (CARD_FACE_H / CARD_FACE_W));
    for (let i = 0; i < 3; i += 1) {
      const x = PAD + i * (slotW + 8);
      const locked = i >= slots;
      const cardId = hand[i];
      if (cardId) {
        const face = stampCardFace(this, cardId, { x, y, width: slotW, height: slotH });
        if (face) scroll.content.add(face);
        const tag = this.add.text(x + slotW / 2, y + slotH - 16, t('cabinet.hand.slotted'), {
          color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
          backgroundColor: 'rgba(243,230,196,0.85)', padding: { x: 4, y: 1 },
        }).setOrigin(0.5, 0);
        scroll.content.add(tag);
        this.gridTap(scroll, x, y, slotW, slotH, () => this.toggleHand(cardId));
      } else {
        const g = this.add.graphics();
        g.lineStyle(1.2, locked ? INK_UI.softBrush : INK_UI.brush, locked ? 0.4 : 0.6);
        this.dashedRect(g, x, y, slotW, slotH);
        scroll.content.add(g);
        scroll.content.add(this.ui.label(x + slotW / 2, y + slotH / 2 - 8,
          locked ? '🔒' : '+', 'label', { fontSize: '16px', align: 'center' }).setOrigin(0.5, 0));
        scroll.content.add(this.ui.label(x + 6, y + slotH - 30,
          // One name per trait, everywhere: the lock names the same trait the sheet and the
          // ceremony do, rather than a second translation of it.
          locked ? t('cabinet.hand.locked', { trait: t('dynasty.trait.deep-shelf') }) : t('cabinet.hand.empty'), 'caption',
          { fontSize: '8px', align: 'center', wordWrap: { width: slotW - 12 } }).setFixedSize(slotW - 12, 0));
      }
    }
    y += slotH + 8;
    const price = this.ui.label(PAD, y,
      hand.length > 0
        ? t('cabinet.hand.price', { n: hand.length * AMBITION_PER_POWER_CARD })
        : t('cabinet.hand.priceNone'),
      'caption', { fontSize: '10px', color: '#8a5f1c', wordWrap: { width: W } });
    scroll.content.add(price);
    y += price.height + 16;

    // ── The binder ──────────────────────────────────────────────────────────
    //
    // Real faces for held seals, silhouettes for the unfound, sorted by rarity then level, with
    // four filters. A ready-to-combine seal is edged cinnabar. Tapping a held seal opens it at
    // full size with its ladder — the face is the object, the tile is its place.
    y = this.sectionHeader(scroll, y, t('cabinet.binder.title', { found: progress.found, total: progress.total }));
    const hint = this.ui.label(PAD, y, t('cabinet.binder.hint'), 'caption',
      { fontSize: '9px', wordWrap: { width: W } });
    scroll.content.add(hint);
    y += hint.height + 8;

    const tileW = Math.floor((W - 3 * 6) / 4);
    BINDER_FILTERS.forEach((id, index) => {
      const x = PAD + index * (tileW + 6);
      const selected = id === this.filter;
      scroll.content.add(this.ui.crayonTile({ x, y, width: tileW, height: 28 }, { selected }));
      scroll.content.add(this.ui.label(x + tileW / 2, y + 14, t(`cabinet.filter.${id}` as Parameters<typeof t>[0]), 'button', {
        color: '#211103', fontSize: '10.5px', fontStyle: selected ? '700' : '400', align: 'center',
      }).setOrigin(0.5));
      this.gridTap(scroll, x, y, tileW, 28, () => {
        this.filter = id;
        this.pendingScroll = this.scroll ? -this.scroll.content.y : 0;
      this.pendingAnchor = this.scroll?.snapshotAnchor();
        this.render();
      });
    });
    y += 28 + 10;

    const heldCards = POWER_CARDS.filter((card) => store.cards[card.id]);
    const sorted = [...heldCards].sort((a, b) => {
      const byRarity = RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
      if (byRarity !== 0) return byRarity;
      return (store.cards[b.id]?.level ?? 1) - (store.cards[a.id]?.level ?? 1);
    });
    const shown = this.filter === 'all'
      ? [...sorted, ...POWER_CARDS.filter((card) => !store.cards[card.id]).sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity])]
      : sorted.filter((card) => {
        const held = store.cards[card.id];
        if (!held) return false;
        if (this.filter === 'lv2') return held.level >= 2;
        if (this.filter === 'ready') return canCombine(card.id);
        return true;
      });

    const cellW = Math.floor((W - (GRID_COLS - 1) * 8) / GRID_COLS);
    const cellH = Math.round(cellW * (CARD_FACE_H / CARD_FACE_W));
    if (shown.length === 0) {
      scroll.content.add(this.ui.label(PAD, y, t('cabinet.filter.empty'), 'caption', { fontSize: '10px' }));
      y += 24;
    }
    for (let first = 0; first < shown.length; first += GRID_COLS) {
      const rowCards = shown.slice(first, first + GRID_COLS);
      const rowIndex = first / GRID_COLS;
      const top = y + rowIndex * (cellH + 10);
      scroll.lazyRow(`binder:${rowCards.map(card => card.id).join(',')}`, top, cellH + 10, () => {
      rowCards.forEach((card, index) => {
      const col = index % GRID_COLS;
      const row = Math.floor(index / GRID_COLS);
      const x = PAD + col * (cellW + 8);
      const cy = top;
      const held = store.cards[card.id];
      if (held) {
        const face = stampCardFace(this, card.id, { x, y: cy, width: cellW, height: cellH });
        if (face) scroll.content.add(face);
        const ready = canCombine(card.id);
        if (ready) {
          const edge = this.add.graphics();
          edge.lineStyle(2.5, INK_UI.cinnabar, 0.95);
          edge.strokeRoundedRect(x - 1, cy - 1, cellW + 2, cellH + 2, 7);
          scroll.content.add(edge);
        }
        // The numbers the bake cannot carry: copies toward the next combine and the hand mark.
        scroll.content.add(cardFaceOverlay(this, { x, y: cy, width: cellW, height: cellH }, {
          level: held.level,
          copies: held.copies,
          need: combineCost(held.level),
          inHand: hand.includes(card.id),
          held: held.copies,
        }));
        this.gridTap(scroll, x, cy, cellW, cellH, () => this.openCardView(card.id, {
          x, y: listTop + cy + (this.scroll?.content.y ?? 0), width: cellW, height: cellH,
        }));
      } else {
        // The visible hunt: a dashed silhouette wearing only its rarity — and every one of
        // these is still draftable in a run. Ownership never gates the pool.
        const g = this.add.graphics();
        g.lineStyle(1.2, RARITY_COLOR[card.rarity], 0.55);
        this.dashedRect(g, x, cy, cellW, cellH);
        scroll.content.add(g);
        scroll.content.add(this.ui.label(x + cellW / 2, cy + cellH / 2 - 16, '?', 'label',
          { fontSize: '22px', align: 'center', color: '#8b7a5e' }).setOrigin(0.5, 0));
        scroll.content.add(this.ui.label(x + 6, cy + cellH - 34,
          `${t(`ascent.rarity.${card.rarity}` as Parameters<typeof t>[0])}
${t('cabinet.grid.unfound')}`,
          'caption', { fontSize: '8px', align: 'center' }).setFixedSize(cellW - 12, 0));
      }
      });
      });
    }
    y += Math.ceil(shown.length / GRID_COLS) * (cellH + 10) + 8;


    // ── The forge ───────────────────────────────────────────────────────────
    y = this.sectionHeader(scroll, y, t('cabinet.forge.title'));
    for (const recipe of forgeRecipes()) {
      const learned = store.learnedRecipes.includes(recipe.result);
      const name = (id: string, show: boolean): string => (show
        ? t(`ascent.card.${id}` as Parameters<typeof t>[0])
        : t('cabinet.forge.hidden'));
      // An unlearned recipe shows only the parents the cabinet has already found — the forge is
      // the collection's slow hunt, and a fully-spelled recipe is a hunt already over.
      const line = t('cabinet.forge.row', {
        a: name(recipe.a, learned || Boolean(store.cards[recipe.a])),
        b: name(recipe.b, learned || Boolean(store.cards[recipe.b])),
        result: name(recipe.result, learned),
      });
      const rowH = 44;
      const top = y;
      scroll.lazyRow(`recipe:${recipe.result}`, top, rowH + 8, () => {
        const y = top;
      scroll.content.add(this.ui.panel({ x: PAD, y, width: W, height: rowH },
        { border: learned ? INK_UI.jade : INK_UI.softBrush, fillAlpha: learned ? 0.55 : 0.32 }));
      scroll.content.add(this.ui.label(PAD + 12, y + 7, line, 'label',
        { fontSize: '11px', wordWrap: { width: W - 24 } }));
      scroll.content.add(this.ui.label(PAD + 12, y + 26,
        learned ? t('cabinet.forge.learned') : t('cabinet.forge.hint'), 'caption',
        { fontSize: '8.5px', wordWrap: { width: W - 24 } }));
      });
      y += rowH + 8;
    }
    y += 14;

    scroll.setContentHeight(y);
    if (this.pendingAnchor) scroll.restoreAnchor(this.pendingAnchor); else scroll.setScroll(this.pendingScroll);
  }

  /**
   * A section's name, at a weight the body cannot be mistaken for. The headers were captions at
   * the body's own size — *why is the title not highlighted? all text the same weight and size* —
   * so the page read as one column of grey. Title face, small caps, ink-dark, with the band under.
   */
  private sectionHeader(scroll: InkScrollArea, y: number, text: string): number {
    const label = this.add.text(PAD, y, text.toLocaleUpperCase('vi'), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '13px', fontStyle: '700',
    }).setOrigin(0, 0);
    label.setLetterSpacing?.(1.2);
    scroll.content.add(label);
    const band = this.add.graphics();
    sawtoothBand(band, PAD, y + 20, GAME_WIDTH - PAD * 2, 5, 0.5);
    scroll.content.add(band);
    return y + 30;
  }

  private faucetRow(scroll: InkScrollArea, y: number, label: string, status: string, accent: number): number {
    const W = GAME_WIDTH - PAD * 2;
    const H = 30;
    scroll.content.add(this.ui.panel({ x: PAD, y, width: W, height: H },
      { border: INK_UI.softBrush, fillAlpha: 0.35 }));
    const edge = this.add.graphics();
    edge.fillStyle(accent, 0.9);
    edge.fillRect(PAD + 1.5, y + 4, 2.5, H - 8);
    scroll.content.add(edge);
    scroll.content.add(this.ui.label(PAD + 12, y + 8, label, 'caption', { fontSize: '10px' }));
    if (status) {
      scroll.content.add(this.ui.label(PAD + W - 10, y + 8, status, 'caption',
        { fontSize: '9px', align: 'right' }).setOrigin(1, 0));
    }
    return y + H + 6;
  }

  /** A tap target inside the scroll area that respects the drag gesture. */
  private gridTap(scroll: InkScrollArea, x: number, y: number, w: number, h: number, onTap: () => void): void {
    const zone = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) return;
      onTap();
    });
    scroll.content.add(zone);
  }

  /** Slots a seal into the opening hand, or takes it back out. */
  private toggleHand(cardId: string): void {
    const hand = openingHand();
    if (hand.includes(cardId)) {
      setOpeningHand(hand.filter((id) => id !== cardId));
    } else if (hand.length < openingHandSlots()) {
      setOpeningHand([...hand, cardId]);
    } else {
      return;
    }
    const viewOpen = this.viewObjects.length > 0;
    this.pendingScroll = this.scroll ? -this.scroll.content.y : 0;
      this.pendingAnchor = this.scroll?.snapshotAnchor();
    this.render();
    // The view stays open on the same card, so what the drag did is seen where it was done.
    if (viewOpen) this.openCardView(cardId, { x: PAD, y: 84, width: 128, height: Math.round(128 * (CARD_FACE_H / CARD_FACE_W)) });
  }

  // ── The card view ─────────────────────────────────────────────────────────

  /**
   * A held seal, opened: the face flips up to full size from its tile, the page dims, and beside
   * it the ladder says what each level does and how many copies the next one needs. The hand is
   * set from here — a seal is slotted from its own card, not ticked in a list.
   */
  private openCardView(cardId: string, from: { x: number; y: number; width: number; height: number }): void {
    this.closeCardView();
    const card = findPowerCard(cardId);
    const held = getCabinet().cards[cardId];
    if (!card || !held) return;
    const DEPTH = CHROME_DEPTH + 5;
    const keep = <T extends Phaser.GameObjects.GameObject & { setDepth(value: number): T }>(object: T): T => {
      this.viewObjects.push(object.setDepth(DEPTH));
      return object;
    };
    const span = sheetSpan(this);
    const dim = keep(this.add.rectangle(span.left, 0, span.width, GAME_HEIGHT, INK_UI.overlay, 0.6).setOrigin(0, 0).setInteractive());
    dim.setDepth(DEPTH - 2);
    // The list under the sheet is deaf while the sheet is up: it scrolled off the scene's pointer
    // stream, which no guard over the sheet can intercept. *When a modal shows I can still scroll
    // behind it.*
    this.scroll?.setLocked(true);
    // A tap on the veil closes; a drag that ends on it does not — a finger that tried to scroll
    // and found the page locked should not lose the sheet for it.
    let veilDown: { x: number; y: number } | undefined;
    dim.on('pointerdown', (pointer: Phaser.Input.Pointer) => { veilDown = { x: pointer.x, y: pointer.y }; });
    dim.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const moved = veilDown ? Math.hypot(pointer.x - veilDown.x, pointer.y - veilDown.y) : 0;
      veilDown = undefined;
      if (moved < 12) this.closeCardView();
    });

    const bigW = 128;
    const bigH = Math.round(bigW * (CARD_FACE_H / CARD_FACE_W));
    const bigX = PAD;
    const bigY = 84;
    // The sheet itself swallows what falls on it. Only the veil closed the view, and the veil
    // was under the whole sheet, so a tap on the face, the ladder, the copies bar — anything but
    // a button — closed it. Reported as *why does a click on the card or the content hide the
    // modal?* Sized at the end with the sheet; an invisible rectangle, above the veil, below
    // everything the sheet holds.
    const sheetGuard = keep(this.add.rectangle(PAD - 8, bigY - 12, GAME_WIDTH - PAD * 2 + 16, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0).setInteractive());
    sheetGuard.setDepth(DEPTH - 1);
    sheetGuard.on('pointerdown', () => undefined);
    sheetGuard.on('pointerup', () => undefined);
    // The sheet under the card and its ladder is drawn *last*, from the height the column actually
    // took: sized up front from the face alone, a Vietnamese ladder that wrapped to three lines a
    // level ran under the hand slots and the copies bar, and the buttons sat on the type.
    const face = stampCardFace(this, cardId, { x: bigX, y: bigY, width: bigW, height: bigH }, held.level);
    // The face's scale at rest, read BEFORE the fly-in shrinks it: the drag's return tween read
    // the live scale mid-flight and put the card back at the tile's size, beside its own badges.
    let faceRestScale = 1;
    if (face) {
      keep(face);
      // From the tile to its place: the face is the object, the tile is where it lives.
      const restScale = face.scale;
      faceRestScale = restScale;
      face.setPosition(from.x + from.width / 2, from.y + from.height / 2).setScale(restScale * (from.width / bigW));
      this.tweens.add({ targets: face, x: bigX + bigW / 2, y: bigY + bigH / 2, scale: restScale, duration: motionMs(260), ease: 'Cubic.easeOut' });
    }
    const faceOverlay = keep(cardFaceOverlay(this, { x: bigX, y: bigY, width: bigW, height: bigH }, {
      level: held.level, copies: held.copies, need: combineCost(held.level), inHand: openingHand().includes(cardId), held: held.copies,
    }));

    // The ladder, beside the face: every level's line, the held one marked, the copies bar under it.
    const ladderX = bigX + bigW + 14;
    const ladderW = GAME_WIDTH - ladderX - PAD;
    let ly = bigY;
    keep(this.ui.label(ladderX, ly, t('cabinet.view.ladder'), 'caption', { fontSize: '9.5px' }));
    ly += 16;
    for (let level = 1; level <= 3; level += 1) {
      const entry = card.levels[Math.min(level - 1, card.levels.length - 1)];
      const text = t(`ascent.card.${cardId}.d` as Parameters<typeof t>[0], entry.display);
      const current = level === held.level;
      const line = keep(this.ui.label(ladderX, ly, `${t('cabinet.view.level', { level })} · ${text}`, current ? 'label' : 'caption', {
        fontSize: current ? '10.5px' : '9.5px',
        wordWrap: { width: ladderW },
        ...(current ? { color: '#8a5f1c' } : level < held.level ? { color: '#6f6250' } : {}),
      }));
      ly += line.height + 6;
    }
    if (held.level < 3) {
      const need = combineCost(held.level);
      keep(this.ui.label(ladderX, ly, t('cabinet.view.copies', { n: held.copies, need }), 'caption', { fontSize: '9.5px' }));
      ly += 14;
      const bar = keep(this.add.graphics());
      bar.fillStyle(INK_UI.softBrush, 0.3);
      bar.fillRoundedRect(ladderX, ly, ladderW, 6, 3);
      bar.fillStyle(held.copies >= need ? INK_UI.cinnabar : INK_UI.gold, 0.95);
      bar.fillRoundedRect(ladderX, ly, Math.max(3, ladderW * Math.min(1, held.copies / need)), 6, 3);
      ly += 16;
    }

    const W = GAME_WIDTH - PAD * 2;
    const inHand = openingHand().includes(cardId);
    const handOpen = inHand || openingHand().length < openingHandSlots();

    // The hand, as slots the face can be dragged into: the card shrinks into the slot and the
    // slot's seal stamps. The hand is a deck you build, not a list you tick.
    const slots = openingHandSlots();
    const slotW = 44;
    const slotH = Math.round(slotW * (CARD_FACE_H / CARD_FACE_W));
    // Under whichever is taller, the face or its ladder: the slots had been anchored to the
    // face's foot, which is where the ladder's third line lands in Vietnamese.
    const slotsX = PAD;
    // The hand, named and explained where it is used — *what does "drag the card into a slot"
    // mean, why would I do that?* — before the slots it refers to.
    const blockBottom = Math.max(bigY + bigH, ly) + 14;
    const handHead = keep(this.ui.label(PAD, blockBottom, t('cabinet.view.handHead', { n: openingHand().length, max: slots }), 'label',
      { fontSize: '11px', color: '#1c6b58' }));
    const handWhy = keep(this.ui.label(PAD, blockBottom + 16, t('cabinet.view.handWhy'), 'caption', { fontSize: '9px', wordWrap: { width: W } }));
    const slotsY = handWhy.y + handWhy.height + 8;
    const slotBoxes: Array<{ x: number; y: number; w: number; h: number; filled: string | undefined }> = [];
    const handNow = openingHand();
    for (let i = 0; i < slots; i += 1) {
      const sx = slotsX + i * (slotW + 6);
      const filled = handNow[i];
      slotBoxes.push({ x: sx, y: slotsY, w: slotW, h: slotH, filled });
      if (filled) {
        const small = stampCardFace(this, filled, { x: sx, y: slotsY, width: slotW, height: slotH });
        if (small) keep(small);
      } else {
        const g = keep(this.add.graphics());
        g.lineStyle(1.2, INK_UI.brush, 0.5);
        this.dashedRect(g, sx, slotsY, slotW, slotH);
      }
    }
    keep(this.ui.label(slotsX, slotsY + slotH + 4, t('cabinet.view.dragHint'), 'caption', { fontSize: '8.5px', color: '#8a7a60' }));
    // The actions, under the slots and their hint.
    let by = slotsY + slotH + 22;
    if (face && !inHand && handOpen) {
      face.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(face);
      const restX = bigX + bigW / 2;
      const restY = bigY + bigH / 2;
      const restScale = faceRestScale;
      // Carried, the face rides above everything on the sheet — it was drawn at the sheet's
      // depth, so the labels built after it printed straight over the card as it crossed them
      // (*because the card is transparent, dragging looks buggy*) — and its badges, which do
      // not travel, hide until it lands.
      face.on('dragstart', () => {
        face.setDepth(DEPTH + 3).setScale(restScale * 1.05);
        faceOverlay.setVisible(false);
      });
      face.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        face.setPosition(dragX, dragY);
      });
      face.on('dragend', () => {
        const hit = slotBoxes.find((box) => !box.filled && face.x >= box.x - 8 && face.x <= box.x + box.w + 8 && face.y >= box.y - 8 && face.y <= box.y + box.h + 8);
        if (!hit) {
          this.tweens.add({
            targets: face, x: restX, y: restY, scale: restScale, duration: motionMs(220), ease: 'Cubic.easeOut',
            // A hair under the sheet's depth: set back to DEPTH itself the face re-sorts to the END of
            // its depth band, above the badges it had been under, and the badges vanish behind it.
            onComplete: () => { face.setDepth(DEPTH - 0.5); faceOverlay.setVisible(true); },
          });
          return;
        }
        face.disableInteractive();
        this.tweens.add({
          targets: face, x: hit.x + hit.w / 2, y: hit.y + hit.h / 2, scale: restScale * (hit.w / bigW),
          duration: motionMs(300), ease: 'Cubic.easeOut',
          onComplete: () => {
            const stamp = this.add.graphics().setDepth(DEPTH + 1);
            seal(stamp, hit.x + hit.w / 2, hit.y + hit.h / 2, 26, 'lotus');
            stamp.setScale(1.6).setAlpha(0.3);
            this.tweens.add({
              targets: stamp, scale: 1, alpha: 1, duration: motionMs(200), ease: 'Back.easeOut',
              onComplete: () => this.time.delayedCall(motionMs(200), () => { stamp.destroy(); this.toggleHand(cardId); }),
            });
          },
        });
      });
    }
    keep(this.ui.button({ x: PAD, y: by, width: W, height: 38 },
      inHand ? t('cabinet.view.unslot') : handOpen ? t('cabinet.view.slot') : t('cabinet.view.handFull'),
      () => {
        if (!handOpen) return;
        this.toggleHand(cardId);
      },
      { variant: handOpen ? 'secondary' : 'disabled', fontSize: '12px' }));
    by += 46;
    if (canCombine(cardId)) {
      keep(this.ui.button({ x: PAD, y: by, width: W, height: 38 },
        t('cabinet.view.combine', { n: combineCost(held.level), level: held.level + 1 }),
        () => {
          this.combineId = cardId;
          this.mode = 'combine';
          this.render();
        },
        { variant: 'primary', fontSize: '12px' }));
      by += 46;
    }
    keep(this.ui.button({ x: PAD, y: by, width: W, height: 32 }, t('cabinet.view.close'),
      () => this.closeCardView(), { variant: 'ghost', fontSize: '11px' }));
    by += 32;
    const sheetH = by + 12 - (bigY - 12);
    keep(this.ui.panel({ x: PAD - 8, y: bigY - 12, width: GAME_WIDTH - PAD * 2 + 16, height: sheetH },
      { border: INK_UI.gold, borderWidth: 1.4, fillAlpha: 1 })).setDepth(DEPTH - 1);
    sheetGuard.setSize(GAME_WIDTH - PAD * 2 + 16, sheetH);
    (sheetGuard.input?.hitArea as Phaser.Geom.Rectangle | undefined)?.setSize(GAME_WIDTH - PAD * 2 + 16, sheetH);

    // Fresh furniture sorts at the BOTTOM of Phaser's hit list until it has been rendered once
    // (the list is last frame's); lifted, the sheet is on top from the moment it exists, and the
    // page is quiet until the frame after next.
    liftForInput(this, this.viewObjects);
    quietUntilNextFrame(this);

    // Everything but the veil and the face rises into place behind the face's flip: the sheet is
    // opened, not switched on.
    this.viewObjects.forEach((object, index) => {
      if (object === dim || object === face) return;
      const target = object as Phaser.GameObjects.GameObject & { y?: number; setAlpha?: (a: number) => unknown; setY?: (y: number) => unknown };
      if (typeof target.y !== 'number' || !target.setAlpha) return;
      const restY = target.y;
      target.setAlpha(0);
      target.setY?.(restY + 12);
      this.tweens.add({ targets: target, alpha: 1, y: restY, duration: motionMs(220), delay: Math.min(index, 10) * motionMs(20) + motionMs(120), ease: 'Sine.easeOut' });
    });
  }

  private closeCardView(): void {
    if (this.viewObjects.length === 0) return;
    // Close fires on the press (every InkUI button does), and the release that follows was
    // delivered to whatever the close had just revealed — the binder's tiles and the hand's slots
    // act on release. Reported as *click on the modal also clicks the bottom*. The rest of the
    // gesture is swallowed, and the page stays quiet until it has been drawn once.
    swallowRestOfPress(this);
    quietUntilNextFrame(this);
    for (const object of this.viewObjects) object.destroy();
    this.viewObjects = [];
    this.scroll?.setLocked(false);
  }

  // ── The combine ceremony ──────────────────────────────────────────────────

  private renderCombine(cardId: string): void {
    const card = findPowerCard(cardId);
    const held = getCabinet().cards[cardId];
    // The page only makes sense standing on a combinable seal — the ⇧ tap is the only door in,
    // but a stale re-render after the combine itself must fall back rather than draw a lie.
    if (!card || !held || !canCombine(cardId)) {
      this.mode = 'cabinet';
      this.render();
      return;
    }
    const cost = combineCost(held.level);
    const nextLevel = (held.level + 1) as 2 | 3;
    const name = t(`ascent.card.${cardId}` as Parameters<typeof t>[0]);

    const title = this.chrome(this.add.text(GAME_WIDTH / 2, 26, t('cabinet.combine.title'), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '22px', fontStyle: '700', align: 'center',
    }).setOrigin(0.5, 0));
    title.setLetterSpacing?.(2);
    this.chrome(this.ui.label(GAME_WIDTH / 2, 56,
      t('cabinet.combine.sub', { name, n: held.copies }), 'caption',
      { fontSize: '11px', align: 'center' }).setOrigin(0.5, 0));

    // The parents, small, plus-signed across the sheet; the child large under the arrow. Sized
    // to the sheet: a ×5 combine at the ×3 card size ran 94 units off both edges.
    const GAP = cost >= 5 ? 16 : 26;
    const smallW = Math.min(76, Math.floor((GAME_WIDTH - 24 - (cost - 1) * GAP) / cost));
    const smallH = Math.round(smallW * (CARD_FACE_H / CARD_FACE_W));
    const rowW = cost * smallW + (cost - 1) * GAP;
    const startX = Math.round((GAME_WIDTH - rowW) / 2);
    let cy = 86;
    const copies: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < cost; i += 1) {
      const x = startX + i * (smallW + GAP);
      const face = stampCardFace(this, cardId, { x, y: cy, width: smallW, height: smallH }, held.level);
      if (face) copies.push(this.keep(face));
      if (i > 0) {
        this.keep(this.ui.label(x - Math.round(GAP / 2), cy + smallH / 2 - 10, '+', 'label',
          { fontSize: '16px' }).setOrigin(0.5, 0));
      }
    }
    cy += smallH + 6;
    this.keep(this.ui.label(GAME_WIDTH / 2, cy, '▼', 'label',
      { fontSize: '14px', align: 'center' }).setOrigin(0.5, 0));
    cy += 22;
    const bigW = 128;
    const bigH = Math.round(bigW * (CARD_FACE_H / CARD_FACE_W));
    const big = stampCardFace(this, cardId, {
      x: (GAME_WIDTH - bigW) / 2, y: cy, width: bigW, height: bigH,
    }, nextLevel);
    if (big) {
      this.keep(big);
      big.setAlpha(0.4);
      this.tweens.add({ targets: big, alpha: 1, scale: big.scale * 1.04, duration: 420, ease: 'Quad.easeOut', yoyo: false });
    }
    cy += bigH + 12;

    // What the level buys, said in the card's own numbers: the deepened per-stack line and the
    // steep draft-weight step.
    const before = t(`ascent.card.${cardId}.d` as Parameters<typeof t>[0],
      card.levels[held.level - 1].display);
    const after = t(`ascent.card.${cardId}.d` as Parameters<typeof t>[0],
      card.levels[Math.min(nextLevel - 1, card.levels.length - 1)].display);
    const W = GAME_WIDTH - PAD * 2;
    const effect = this.ui.label(PAD, cy,
      t('cabinet.combine.effect', { before, after }), 'caption',
      { fontSize: '10.5px', color: '#8a5f1c', wordWrap: { width: W } });
    this.keep(effect);
    cy += effect.height + 6;
    this.keep(this.ui.label(PAD, cy,
      t('cabinet.combine.result', { level: nextLevel, mult: cabinetWeightMult(nextLevel) }),
      'caption', { fontSize: '10.5px', wordWrap: { width: W } }));
    cy += 20;
    this.keep(this.ui.label(PAD, cy, t('cabinet.combine.note'), 'caption',
      { fontSize: '9.5px', color: '#6f6250', wordWrap: { width: W } }));

    const backY = GAME_HEIGHT - BACK_BAR_HEIGHT - 10;
    this.chrome(this.ui.button(
      { x: PAD, y: backY - 54, width: W, height: 44 },
      t('cabinet.combine.action', { n: cost }),
      () => {
        if (this.combining || !canCombine(cardId)) return;
        this.combining = true;
        // The fold: the copies fan into the card, the card takes the punch and a gold flash,
        // and only then does the store change — the one between-run upgrade the player makes
        // on purpose is seen to happen. 800 ms at full motion, a beat under reduced.
        const fold = motionMs(500);
        const centreX = big ? big.x : GAME_WIDTH / 2;
        const centreY = big ? big.y : cy;
        copies.forEach((copy, i) => {
          this.tweens.add({
            targets: copy, x: centreX, y: centreY, scale: copy.scale * 0.15, alpha: 0,
            delay: i * motionMs(60), duration: fold, ease: 'Cubic.easeIn',
          });
        });
        if (big) {
          this.tweens.add({ targets: big, scale: big.scale * 1.08, delay: fold, duration: motionMs(150), yoyo: true, ease: 'Sine.easeInOut' });
          const flash = this.keep(this.add.rectangle(big.x, big.y, bigW + 8, bigH + 8, 0xffffff, 0.5));
          flash.setAlpha(0);
          this.tweens.add({ targets: flash, alpha: 0.6, delay: fold, duration: motionMs(120), yoyo: true });
        }
        this.time.delayedCall(fold + motionMs(300), () => {
          this.combining = false;
          if (combineCard(cardId)) {
            this.mode = 'cabinet';
            this.render();
          }
        });
      },
      { variant: 'primary', fontSize: '14px' },
    ));
    this.chrome(this.ui.backBar(backY, () => {
      this.mode = 'cabinet';
      this.render();
    }));
  }

  // ── The thác bản scratch reveal ───────────────────────────────────────────

  /**
   * The reveal *is* the reward moment: the print sits whole under an ink cover, and the cover
   * lifts strip by strip along the pointer. The cover is opaque paint *over* the stamped face
   * and is simply deleted where the thumb passes — no masks (Phaser 4 masks are no-ops under
   * WebGL, the clip-rect-stencil finding) and no per-frame Graphics redraw: each strip is drawn
   * once and only ever tweened out.
   */
  /**
   * The scratch. *Make the scratch really good.*
   *
   * The first version was fourteen strips that vanished when the pointer crossed them: a print
   * uncovered in bands, no grain under the thumb, and the card simply there at the end. This one
   * is built the way a scratch card is played. The cover is a grid of ink cells and a brush clears
   * whatever it passes over — along the whole stroke, not only at the sampled points — with flakes
   * falling off each cell as it goes, a paper rustle and a short buzz under the thumb. A glow in
   * the card's own rarity colour leaks out from behind the card as the cover thins, so a Gold is
   * felt before it is read; past a third cleared, a Gold or Jade glow starts to pulse. At just
   * over half cleared the rest falls away in a wave from the thumb outward, the card punches, the
   * glow flares, a precious card throws sparks (Jade also shakes the page), and the outcome and
   * the next-draw button rise in. Every duration goes through `motionMs`, so the reduced-motion
   * setting gets the same reveal without the theatre.
   */
  private renderRubbing(reveal: RubbingReveal): void {
    this.revealDone = false;
    const title = this.chrome(this.add.text(GAME_WIDTH / 2, 26, t('cabinet.rub.title'), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '22px', fontStyle: '700', align: 'center',
    }).setOrigin(0.5, 0));
    title.setLetterSpacing?.(2);
    this.chrome(this.ui.label(GAME_WIDTH / 2, 56,
      reveal.remaining > 0 ? t('cabinet.rub.sub', { n: reveal.remaining }) : t('cabinet.rub.subLast'),
      'caption', { fontSize: '11px', align: 'center' }).setOrigin(0.5, 0));

    const cardW = 168;
    const cardH = Math.round(cardW * (CARD_FACE_H / CARD_FACE_W));
    const cardX = Math.round((GAME_WIDTH - cardW) / 2);
    const cardY = 92;
    const centreX = cardX + cardW / 2;
    const centreY = cardY + cardH / 2;
    const rarity: AscentRarity = findPowerCard(reveal.cardId)?.rarity ?? 'bronze';
    const tint = RARITY_COLOR[rarity];
    const precious = rarity === 'gold' || rarity === 'jade';

    // The tease: the rarity's colour behind the card, invisible until the cover starts to thin.
    // Drawn about its own centre so the burst can scale it in place.
    // Four rings at falling alpha: a soft light, not a coloured slab behind the card.
    const glow = this.keep(this.add.graphics({ x: centreX, y: centreY }));
    for (let ring = 0; ring < 4; ring += 1) {
      const pad = 6 + ring * 7;
      glow.fillStyle(tint, ring === 0 ? 0.5 : 0.22);
      glow.fillRoundedRect(-cardW / 2 - pad, -cardH / 2 - pad, cardW + pad * 2, cardH + pad * 2, 12 + ring * 4);
    }
    glow.setAlpha(0);

    // The card is revealed at the level it now holds in the cabinet, so a copy that completed a
    // combine-ready set is seen wearing the state it just reached.
    const face = stampCardFace(this, reveal.cardId, { x: cardX, y: cardY, width: cardW, height: cardH }, reveal.level);
    if (face) this.keep(face);

    // The cover: a fine grid of ink cells — *smaller dots, smoother* — each the woodblock's own
    // hatch rather than flat paint, each drawn about its centre so it can shrink as it flakes
    // off. The cover fits the card exactly: no overhang, and the cells that meet a corner are
    // cut to the face's own radius, so the cover reads as ink ON the card, not a slab over it.
    const COLS = 18;
    const ROWS = 24;
    const cellW = cardW / COLS;
    const cellH = cardH / ROWS;
    const corner = 10 * (cardW / CARD_FACE_W);
    const L = cardX;
    const T = cardY;
    const R = cardX + cardW;
    const B = cardY + cardH;
    /** A point outside a corner's arc, moved onto it; every other point stays. */
    const onCard = (x: number, y: number): { x: number; y: number } => {
      let ax: number;
      let ay: number;
      if (x < L + corner && y < T + corner) { ax = L + corner; ay = T + corner; }
      else if (x > R - corner && y < T + corner) { ax = R - corner; ay = T + corner; }
      else if (x < L + corner && y > B - corner) { ax = L + corner; ay = B - corner; }
      else if (x > R - corner && y > B - corner) { ax = R - corner; ay = B - corner; }
      else return { x, y };
      const dx = x - ax;
      const dy = y - ay;
      const d = Math.hypot(dx, dy);
      return d <= corner ? { x, y } : { x: ax + (dx / d) * corner, y: ay + (dy / d) * corner };
    };
    type Cell = { g: Phaser.GameObjects.Graphics; cx: number; cy: number; cleared: boolean };
    const cells: Cell[] = [];
    this.coverStrips = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const cx = cardX + (c + 0.5) * cellW;
        const cy = cardY + (r + 0.5) * cellH;
        // A hair of overlap between cells so no seam shows, clamped to the card's own edge.
        const x0 = Math.max(L, cx - cellW / 2 - 0.6);
        const x1 = Math.min(R, cx + cellW / 2 + 0.6);
        const y0 = Math.max(T, cy - cellH / 2 - 0.6);
        const y1 = Math.min(B, cy + cellH / 2 + 0.6);
        const nearCorner = (x0 < L + corner || x1 > R - corner) && (y0 < T + corner || y1 > B - corner);
        const g = this.add.graphics({ x: cx, y: cy });
        g.fillStyle(0x4a3b28, 0.97);
        if (nearCorner) {
          // The cell's outline sampled and pressed onto the arc: a polygon that follows the corner.
          const pts: Phaser.Types.Math.Vector2Like[] = [];
          const STEPS = 6;
          for (let i = 0; i < STEPS; i += 1) pts.push(onCard(x0 + ((x1 - x0) * i) / STEPS, y0));
          for (let i = 0; i < STEPS; i += 1) pts.push(onCard(x1, y0 + ((y1 - y0) * i) / STEPS));
          for (let i = 0; i < STEPS; i += 1) pts.push(onCard(x1 - ((x1 - x0) * i) / STEPS, y1));
          for (let i = 0; i < STEPS; i += 1) pts.push(onCard(x0, y1 - ((y1 - y0) * i) / STEPS));
          g.fillPoints(pts.map((p) => ({ x: p.x - cx, y: p.y - cy })), true);
        } else {
          g.fillRect(x0 - cx, y0 - cy, x1 - x0, y1 - y0);
          g.lineStyle(1, 0x2a2118, 0.45);
          g.lineBetween(x0 - cx, y1 - cy, x1 - cx, y0 - cy);
        }
        if (((r * 2654435761 + c * 40503) >>> 0) % 5 === 0 && !nearCorner) {
          // Mottling: the ink took unevenly, the way a hand-inked block does.
          g.fillStyle(0x8a6a44, 0.16);
          g.fillRect(x0 - cx, y0 - cy, x1 - x0, y1 - y0);
        }
        this.keep(g);
        this.coverStrips.push(g);
        cells.push({ g, cx, cy, cleared: false });
      }
    }
    this.stripsLeft = cells.length;

    // The invitation, on the cover itself, breathing until the first stroke.
    const coverHint = this.keep(this.ui.label(centreX, centreY, t('cabinet.rub.coverHint'), 'label',
      { fontSize: '12.5px', color: '#f3e6c4', align: 'center' }).setOrigin(0.5));
    let hintShown = true;
    if (motionMs(900) > 0) {
      this.tweens.add({ targets: coverHint, alpha: { from: 1, to: 0.4 }, duration: motionMs(900), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    const hint = this.keep(this.ui.label(GAME_WIDTH / 2, cardY + cardH + 10, t('cabinet.rub.hint'),
      'caption', { fontSize: '10px', align: 'center' }).setOrigin(0.5, 0));

    // Pity, printed under the card — the counter as it stood before this pull, which is the
    // number that explains what just happened.
    this.keep(this.ui.label(GAME_WIDTH / 2, cardY + cardH + 28,
      reveal.pityUsed ? t('cabinet.rub.pityUsed') : getCabinet().rubbingPity >= PITY_HARD_CAP ? t('cabinet.rub.pityDue') : t('cabinet.rub.pity', { n: getCabinet().rubbingPity, cap: PITY_HARD_CAP }),
      'caption', { fontSize: '9.5px', align: 'center', color: '#8a5f1c' }).setOrigin(0.5, 0));

    // A flake: the cleared cell's ink, falling off the card.
    const flake = (cell: Cell): void => {
      if (reducedMotion()) return;
      const bit = this.add.graphics({ x: cell.cx, y: cell.cy });
      bit.fillStyle(0x3a2d1e, 0.9);
      bit.fillRect(-3, -2, 6, 4);
      this.keep(bit);
      this.tweens.add({
        targets: bit,
        x: cell.cx + (Math.random() - 0.5) * 44,
        y: cell.cy + 26 + Math.random() * 34,
        angle: (Math.random() - 0.5) * 180,
        alpha: 0,
        duration: motionMs(420),
        ease: 'Quad.easeIn',
        onComplete: () => bit.destroy(),
      });
    };

    // The brush: every cell under it clears, shrinking as it goes.
    const BRUSH = 22;
    const clearAt = (x: number, y: number): number => {
      let n = 0;
      for (const cell of cells) {
        if (cell.cleared) continue;
        const dx = cell.cx - x;
        const dy = cell.cy - y;
        if (dx * dx + dy * dy > BRUSH * BRUSH) continue;
        cell.cleared = true;
        this.stripsLeft -= 1;
        n += 1;
        this.tweens.add({ targets: cell.g, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: motionMs(220), ease: 'Quad.easeOut' });
        if (n <= 4 && (n + cell.cx) % 2 < 1) flake(cell);
      }
      return n;
    };

    let last: { x: number; y: number } | undefined;
    let lastRustle = 0;
    let lastBuzz = 0;
    let pulsing = false;
    const onMove = (pointer: Phaser.Input.Pointer): void => {
      if (this.revealDone || !pointer.isDown) return;
      // Column-local: on the desktop this page's camera is centred on a wider sheet.
      const at = localPointer(this, pointer);
      if (at.x < cardX - 12 || at.x > cardX + cardW + 12 || at.y < cardY - 12 || at.y > cardY + cardH + 12) {
        last = undefined;
        return;
      }
      // Along the whole stroke, not only at the sampled points: a fast thumb leaves gaps otherwise.
      let n = 0;
      if (last) {
        const steps = Math.max(1, Math.ceil(Phaser.Math.Distance.Between(last.x, last.y, at.x, at.y) / 8));
        for (let i = 1; i <= steps; i += 1) {
          n += clearAt(last.x + ((at.x - last.x) * i) / steps, last.y + ((at.y - last.y) * i) / steps);
        }
      } else {
        n = clearAt(at.x, at.y);
      }
      last = at;
      if (n === 0) return;
      if (hintShown) {
        hintShown = false;
        this.tweens.killTweensOf(coverHint);
        this.tweens.add({ targets: coverHint, alpha: 0, duration: motionMs(160), onComplete: () => coverHint.destroy() });
      }
      const done = 1 - this.stripsLeft / cells.length;
      if (!pulsing) glow.setAlpha(Math.min(0.5, done * 0.75));
      const now = this.time.now;
      if (now - lastRustle > 110) {
        lastRustle = now;
        soundDirector.tap();
      }
      if (now - lastBuzz > 60 && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        lastBuzz = now;
        navigator.vibrate(6);
      }
      if (precious && !pulsing && done > 0.3 && motionMs(500) > 0) {
        // Felt before it is read: a Gold or Jade glow starts to beat.
        pulsing = true;
        this.tweens.add({ targets: glow, alpha: { from: glow.alpha, to: 0.6 }, duration: motionMs(500), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      if (done >= 0.55) {
        this.finishReveal(reveal, hint as Phaser.GameObjects.Text, cardY + cardH,
          { cells, glow, face, from: at, tint, precious, centreX, centreY });
      }
    };
    const onDown = (pointer: Phaser.Input.Pointer): void => {
      last = undefined;
      onMove(pointer);
    };
    const onUp = (): void => { last = undefined; };
    this.input.on('pointermove', onMove);
    this.input.on('pointerdown', onDown);
    this.input.on('pointerup', onUp);
    const unhook = (): void => {
      this.input.off('pointermove', onMove);
      this.input.off('pointerdown', onDown);
      this.input.off('pointerup', onUp);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unhook);

    const backY = GAME_HEIGHT - BACK_BAR_HEIGHT - 10;
    this.chrome(this.ui.backBar(backY, () => {
      unhook();
      this.mode = 'cabinet';
      this.reveal = undefined;
      this.render();
    }));
  }

  /**
   * The last of the cover falls away on its own — nobody should have to scrub the corners — as a
   * wave from the thumb outward; then the card punches, the glow flares, and the words arrive.
   */
  private finishReveal(
    reveal: RubbingReveal,
    hint: Phaser.GameObjects.Text,
    underY: number,
    fx: {
      cells: Array<{ g: Phaser.GameObjects.Graphics; cx: number; cy: number; cleared: boolean }>;
      glow: Phaser.GameObjects.Graphics;
      face: Phaser.GameObjects.GameObject | undefined;
      from: { x: number; y: number };
      tint: number;
      precious: boolean;
      centreX: number;
      centreY: number;
    },
  ): void {
    if (this.revealDone) return;
    this.revealDone = true;
    hint.setText('');

    let lastDelay = 0;
    for (const cell of fx.cells) {
      if (cell.cleared) continue;
      cell.cleared = true;
      const delay = motionMs(Phaser.Math.Distance.Between(fx.from.x, fx.from.y, cell.cx, cell.cy) * 1.6);
      lastDelay = Math.max(lastDelay, delay);
      this.tweens.add({ targets: cell.g, alpha: 0, scaleX: 0.5, scaleY: 0.5, delay, duration: motionMs(240), ease: 'Quad.easeOut' });
    }
    this.stripsLeft = 0;

    const outcome = reveal.outcome === 'new'
      ? t('cabinet.rub.new')
      : reveal.outcome === 'melted'
        ? t('cabinet.rub.melted', { n: reveal.meltedLegacy })
        : reveal.outcome === 'ready'
          ? t('cabinet.rub.ready', { n: reveal.copies })
          : t('cabinet.rub.copy', { n: reveal.copies, need: combineCost(reveal.level) });

    const punch = (): void => {
      this.tweens.killTweensOf(fx.glow);
      // The flare: the glow leaps and spreads, then settles into a halo the card keeps.
      fx.glow.setAlpha(0.75);
      this.tweens.add({ targets: fx.glow, alpha: fx.precious ? 0.3 : 0.16, scaleX: 1.1, scaleY: 1.06, duration: motionMs(700), ease: 'Cubic.easeOut' });
      const face = fx.face as (Phaser.GameObjects.GameObject & { scale?: number }) | undefined;
      if (face && typeof face.scale === 'number' && motionMs(140) > 0) {
        this.tweens.add({ targets: face, scale: face.scale * 1.07, duration: motionMs(140), yoyo: true, ease: 'Quad.easeOut' });
      }
      soundDirector.card();
      if (fx.precious && !reducedMotion()) {
        // Sparks: the card's own colour thrown outward, and a Jade shakes the page.
        for (let i = 0; i < 18; i += 1) {
          const spark = this.add.graphics({ x: fx.centreX, y: fx.centreY });
          spark.fillStyle(fx.tint, 1);
          spark.fillRect(-2.5, -2.5, 5, 5);
          this.keep(spark);
          const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.4;
          const reach = 90 + Math.random() * 70;
          this.tweens.add({
            targets: spark, x: fx.centreX + Math.cos(angle) * reach, y: fx.centreY + Math.sin(angle) * reach,
            alpha: 0, angle: 180, duration: motionMs(650 + Math.random() * 250), ease: 'Cubic.easeOut', onComplete: () => spark.destroy(),
          });
        }
        if (reveal.outcome === 'new' || fx.tint === RARITY_COLOR.jade) this.cameras.main.shake(motionMs(140), 0.004);
      }

      const line = this.keep(this.ui.label(GAME_WIDTH / 2, underY + 10, outcome, 'label', {
        fontSize: '13px', align: 'center', color: reveal.outcome === 'new' ? '#8a5f1c' : undefined,
      }).setOrigin(0.5, 0));
      line.setAlpha(0).setY(underY + 22);
      this.tweens.add({ targets: line, alpha: 1, y: underY + 10, duration: motionMs(300), ease: 'Cubic.easeOut' });

      const backY = GAME_HEIGHT - BACK_BAR_HEIGHT - 10;
      if (reveal.remaining > 0) {
        const again = this.chrome(this.ui.button(
          { x: PAD, y: backY - 54, width: GAME_WIDTH - PAD * 2, height: 44 },
          t('cabinet.rub.again'),
          () => {
            this.reveal = revealRubbing();
            if (!this.reveal) {
              this.mode = 'cabinet';
            }
            this.render();
          },
          { variant: 'primary', fontSize: '13px' },
        ));
        again.setAlpha(0).setY(again.y + 14);
        this.tweens.add({ targets: again, alpha: 1, y: again.y - 14, delay: motionMs(220), duration: motionMs(300), ease: 'Cubic.easeOut' });
      }
    };
    const wait = lastDelay + motionMs(200);
    if (wait > 0) this.time.delayedCall(wait, punch); else punch();
  }

  private dashedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const DASH = 6;
    const step = DASH * 2;
    for (let dx = 0; dx < w; dx += step) {
      g.lineBetween(x + dx, y, x + Math.min(dx + DASH, w), y);
      g.lineBetween(x + dx, y + h, x + Math.min(dx + DASH, w), y + h);
    }
    for (let dy = 0; dy < h; dy += step) {
      g.lineBetween(x, y + dy, x, y + Math.min(dy + DASH, h));
      g.lineBetween(x + w, y + dy, x + w, y + Math.min(dy + DASH, h));
    }
  }
}
