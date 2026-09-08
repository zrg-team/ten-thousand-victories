/**
 * The dynasty page: its title bar, the sheet, the header, the trait row and the doors to the shop
 * and the Temple, and the trait sheet a chip opens. The seen-trait memory lives here with the row
 * that reads it.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../../game/constants';
import { getLegacy, LEGACY_PERKS, LOADOUT_MAX, nextPerkCost, perkLevel } from '../../state/legacy';
import { DYNASTY_TRAITS_PENDING, findDynastyTrait } from '../../data/dynastyTraits';
import {
  dynastyHistory,
  dynastyProgress,
  dynastyProgressForXp,
  getDynasty,
  isCrowned,
  offerable,
  respecDynasty,
  respecsAvailable,
  traitUses,
} from '../../state/dynasty';
import { cabinetProgress, getCabinet } from '../../state/cabinet';
import { dynastyFounderHero } from '../../ui/dynastyPortrait';
import { drawHouseSign, houseBanner } from '../../ui/ascent/houseBanner';
import { renderHeroFaceInBox } from '../../ui/FaceRenderer';
import { t } from '../../i18n';
import { INK_UI } from '../../ui/InkUI';
import { TITLE_FONT, UI_FONT } from '../../ui/fonts';
import { motionMs } from '../../game/lifeSettings';
import { drawHatch, pageFloor, renderPageHead } from './helpers';
import type { MenuScene } from '../MenuScene';

/**
 * Which reign's chosen trait the ledger has already marked as new, so the mark shows once.
 *
 * Its own key rather than a field on the dynasty store: the store is the record and this is a
 * fact about the page, and a store field would have made every harness fixture carry it.
 */
const SEEN_TRAIT_KEY = 'mandate:dynasty:seen-trait:v1';

function readSeenTrait(): number {
  try {
    return Number(localStorage.getItem(SEEN_TRAIT_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function noteSeenTrait(reign: number): void {
  try {
    localStorage.setItem(SEEN_TRAIT_KEY, String(reign));
  } catch {
    // Nothing to do: the mark shows again next visit, which is the harmless failure.
  }
}

/**
 * Tông Phả — the dynasty sheet.
 *
 * Beside the Legacy shop and deliberately unlike it. The shop is a list of things to buy; this
 * is a *record*: who founded the last reign, how many reigns there have been, what the house has
 * learned, and — for the first time anywhere in the game — **the ancestral code, said out loud**.
 * The code has been silently applied to every founding since `applyAncestralCodes` shipped: the
 * best-earned carry-over in the game, and the player had no way to know it existed.
 *
 * The portrait is the wardrobe system, drawn at the *dynasty's* rank rather than the founder's,
 * so the badge steps up as the ledger fills and thirty reigns look like thirty reigns.
 *
 * Chips rather than cards. Eight trait cards at the card's own height do not fit the menu band
 * at the 620 clamp, and a page that has to scroll to show what you own is a page that hides it.
 *
 * **Everything sits on parchment.** The front page's landscape is still painted behind this
 * mode, and 10px captions laid straight onto mountains and a lotus are unreadable — measured by
 * eye on the first pass, where four lines of the page vanished into the art. Each band gets its
 * own panel, which is also what makes the chip grid read as a grid.
 */
/**
 * The dynasty page's own head: the feature's name on one line, and the room under it.
 *
 * The wordmark is not drawn on this page (`render` skips it for the ledger). Two lines of
 * 46-unit type plus a rule took the sheet down to 236 before the page could begin, and on the
 * 620 clamp that was a third of the screen spent on a title the player had already read on the
 * page they came from. The ledger is a document; a document has a heading, not a masthead.
 */
export function renderDynastyTitleBar(self: MenuScene, title: string = t('dynasty.title'), withMark = true): number {
  const store = getDynasty();
  // The head every page off the front page shares (`renderPageHead`). It used to stand on a
  // band of parchment because the front page's seal was painted behind every mode; the
  // landscape is put away on these pages now, and the head sits on the sheet.
  const bodyTop = renderPageHead(self, title);
  // The house's mark rides the head's right edge once there is a house: the same banner the
  // chip carries in-run, so the page and the run agree about whose ledger this is.
  if (withMark && store.founder) {
    const mark = drawHouseSign(self, houseBanner(), 22, 30);
    mark.setPosition(GAME_WIDTH - 44, 11);
    self.content.push(mark);
  }
  return bodyTop;
}

/**
 * The Tông Phả, as one column that reads top to bottom.
 *
 * The sheet this replaces put eight equal chips, a record panel and three doors on one page
 * and the player could not tell the trend from the total. Read one by one on capture, the
 * pages said *what the house had*, never *what it had just done* or *what the next thing was*.
 * The column is ordered by that question: who the house is and how far to the next level,
 * then the reigns as a row of cards with the one in play at the end, then what the house holds
 * with what each thing actually does, then the doors to the other stores, and last — as an
 * overflow row — the one destructive control. Every duration on the page runs through
 * `motionMs`, so the reduced-motion setting cuts all of it to a beat.
 */
export function renderDynastySheet(self: MenuScene): void {
  const store = getDynasty();
  const legacy = getLegacy();
  const PAD = 20;
  const W = GAME_WIDTH - PAD * 2;
  const bodyTop = renderDynastyTitleBar(self, t('dynasty.title'), false);

  // Never played: the page says what it would hold rather than a column of zeroes.
  if (store.reigns === 0 && !store.liveReign) {
    const bodyText = self.ui.label(0, -9999, t('dynasty.emptyBody'), 'caption',
      { fontSize: '11.5px', align: 'center', wordWrap: { width: W - 28 } });
    const bodyHeight = bodyText.height;
    bodyText.destroy();

    const panelHeight = 16 + 18 + 8 + bodyHeight + 16;
    const bandTop = bodyTop + 12;
    const crownedBlock = isCrowned(store) ? 14 + 10 + 68 + 6 + 40 + 12 + 12 + 40 : 0;
    const panelTop = bandTop
      + Math.max(0, Math.round((pageFloor() - bandTop - panelHeight - crownedBlock) / 2));
    self.content.push(self.ui.panel({ x: PAD, y: panelTop, width: W, height: panelHeight },
      { border: INK_UI.softBrush, fillAlpha: 0.92 }));
    self.content.push(self.add.text(GAME_WIDTH / 2, panelTop + 16, t('dynasty.emptyTitle'), {
      color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '13px', align: 'center',
    }).setOrigin(0.5, 0));
    self.content.push(self.ui.label(GAME_WIDTH / 2, panelTop + 16 + 18 + 8, t('dynasty.emptyBody'),
      'caption', { fontSize: '11.5px', align: 'center', wordWrap: { width: W - 28 } })
      .setOrigin(0.5, 0));

    // A crowned house is not an empty one: a king exists the moment the rite is answered, and
    // this page is the only door to the Temple.
    if (isCrowned(store)) {
      const founder = dynastyFounderHero(store);
      const top = panelTop + panelHeight + 14;
      const houseText = store.house
        ? t('dynasty.house', { name: store.house })
        : t('dynasty.houseUnnamed');
      const houseStyle = { fontSize: '14px', align: 'center', wordWrap: { width: W - 24 } } as const;
      const rule = self.ui.label(0, -9999, houseText, 'label', houseStyle);
      const houseHeight = rule.height;
      rule.destroy();

      const plateHeight = 10 + 68 + 6 + houseHeight + 12;
      self.content.push(self.ui.panel({ x: PAD, y: top, width: W, height: plateHeight },
        { border: INK_UI.softBrush, fillAlpha: 0.92 }));
      if (founder) {
        self.content.push(renderHeroFaceInBox(self, founder,
          { x: GAME_WIDTH / 2 - 38, y: top + 10, width: 68, height: 68 }));
      }
      const mark = drawHouseSign(self, houseBanner(), 34, 44);
      mark.setPosition(GAME_WIDTH / 2 + 42, top + 20);
      self.content.push(mark);
      self.content.push(self.ui.label(GAME_WIDTH / 2, top + 10 + 68 + 6, houseText, 'label', houseStyle)
        .setOrigin(0.5, 0));
      self.content.push(self.ui.button({ x: PAD, y: top + plateHeight + 12, width: W, height: 40 },
        t('coronation.temple'), () => { self.returnMode = 'dynasty'; self.mode = 'temple'; self.render(); },
        { variant: 'secondary', fontSize: '12px', subLabel: t('coronation.temple.sub') }));
    }
    self.footBackBar();
    return;
  }

  /** A wrapped line's height before anything is drawn — measured on a throwaway, destroyed. */
  const measure = (text: string, size: string, width: number): number => {
    const probe = self.ui.label(0, -9999, text, 'caption', { fontSize: size, wordWrap: { width } });
    const height = probe.height;
    probe.destroy();
    return height;
  };

  // The body scrolls; the way back does not. `addTo` order parents the swallow-zone before
  // the content, or the zone lands on top and eats every tap the rows were supposed to get.
  const viewport = pageFloor() - bodyTop;
  const area = self.ui.scrollArea({ x: 0, y: bodyTop, width: GAME_WIDTH, height: viewport });
  self.pageScroll = area;
  const layer = self.add.container(0, 0);
  area.addTo(layer);
  self.content.push(layer);
  const body = area.content;
  let y = 0;

  // Verbs first. The doors used to close the page, under the lineage strip, the open reign's
  // epitaph and every trait row — six hundred units down, below the fold on every phone —
  // and the report was *why has the history become more important than the deck? the player
  // needs to do something immediately, not scroll before a tap.* The page is the hub between
  // runs: what can be done now leads, and the history follows as what it was all for.
  y = drawDynastyHeader(self, body, store, PAD, W, y, measure);
  y = drawDynastyDoors(self, body, store, legacy, PAD, W, y);
  y = self.drawDynastyLineage(body, store, PAD, W, y, measure, bodyTop);
  y = drawDynastyTraits(self, body, store, PAD, W, y, measure);
  y = drawDynastyCode(self, body, legacy, PAD, W, y);

  // ── The overflow row: the one way back ──────────────────────────────────
  // Traits are a biography, not a loadout, so a respec is earned by ascending and never
  // offered casually. Last on the page and quiet at rest; danger only once armed.
  const respecs = respecsAvailable(legacy.ascensions);
  if (store.traits.length > 0) {
    const armed = self.respecArmed && respecs > 0;
    body.add(self.ui.button({ x: PAD, y, width: W, height: 30 },
      armed ? t('dynasty.respecArm', { n: store.traits.length }) : t('dynasty.respec'),
      () => {
        if (respecs <= 0) return;
        if (!armed) {
          self.respecArmed = true;
          self.render();
          return;
        }
        self.respecArmed = false;
        respecDynasty(legacy.ascensions);
        self.render();
      },
      { variant: respecs <= 0 ? 'disabled' : armed ? 'danger' : 'ghost', fontSize: '12px' }));
    y += 34;
    const note = armed
      ? t('dynasty.respecWarn', { n: store.traits.length })
      : respecs > 0 ? t('dynasty.respecLeft', { n: respecs }) : t('dynasty.respecNone');
    const noteText = self.ui.label(GAME_WIDTH / 2, y, note, 'caption', {
      fontSize: '9.5px',
      align: 'center',
      wordWrap: { width: W },
      ...(armed ? { color: '#a4402c' } : {}),
      backgroundColor: 'rgba(243,230,196,0.82)',
      padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 0);
    body.add(noteText);
    if (armed) {
      // The warning unfolds under the armed row — read before the second tap, not after it.
      noteText.setAlpha(0).setY(y - 8);
      self.tweens.add({ targets: noteText, alpha: 1, y, duration: motionMs(180), ease: 'Sine.easeOut' });
    }
    y += noteText.height + 10;
  }

  area.setContentHeight(Math.max(viewport, y + 8));
  self.footBackBar();
}

/**
 * Who the house is, and how far it stands from the next level.
 *
 * One bar with three things on it: the filled part is banked, the hatched part is what the
 * reign in play would add if it ended now (read from `liveReign`, which the away pause and
 * every wave held write), and the right-hand label says the distance in the unit the player
 * can act on — points to the next level, not a fraction. Under it, what that level buys: the
 * next level-up lays out two traits. That line is the reason the number matters, and no page
 * said it before.
 */
function drawDynastyHeader(self: MenuScene,
  body: Phaser.GameObjects.Container,
  store: ReturnType<typeof getDynasty>,
  PAD: number,
  W: number,
  y: number,
  measure: (text: string, size: string, width: number) => number,
): number {
  const progress = dynastyProgress(store);
  const live = store.liveReign;
  const pendingLine = store.pendingPicks > 0
    ? t('dynasty.pending', { n: store.pendingPicks })
    : t('dynasty.page.nextOffer');
  const pendingH = measure(pendingLine, '10px', W - 20);
  // The reign in play, said in the header as well as hatched on the bar: "if it ended now"
  // is the number a paused player came back to read.
  const liveLine = live && live.score > 0
    ? t('dynasty.page.liveHeader', { n: live.n, score: live.score.toLocaleString('en-US'), level: live.levelAfter })
    : '';
  const liveH = liveLine ? measure(liveLine, '10px', W - 20) + 3 : 0;
  const headerH = 64 + 12 + 12 + 10 + 8 + pendingH + liveH + 10;

  body.add(self.ui.panel({ x: PAD, y, width: W, height: headerH },
    { border: store.pendingPicks > 0 ? INK_UI.cinnabar : INK_UI.softBrush, fillAlpha: 0.92 }));

  const founder = dynastyFounderHero(store);
  if (founder) {
    body.add(renderHeroFaceInBox(self, founder, { x: PAD + 8, y: y + 6, width: 52, height: 52 }));
  }
  const textX = PAD + (founder ? 70 : 10);
  body.add(self.ui.label(textX, y + 8,
    store.house ? t('dynasty.house', { name: store.house }) : t('dynasty.houseUnnamed'),
    'label', { fontSize: '15px', wordWrap: { width: W - (textX - PAD) - 10 } }));
  body.add(self.ui.label(textX, y + 30,
    `${t('dynasty.reignOrdinal', { n: store.reigns })} · ${t('dynasty.level', { level: store.level })}`,
    'caption', { fontSize: '11px' }));
  body.add(self.ui.label(textX, y + 46,
    t('dynasty.page.best', { score: store.bestScore.toLocaleString('en-US') }),
    'caption', { fontSize: '10px' }));

  // The bar, with its two ends labelled: the level it is on and the level it is climbing to.
  let inner = y + 64 + 12;
  const barX = PAD + 10;
  const barW = W - 20;
  body.add(self.ui.label(barX, inner - 2, t('dynasty.subLevel', { level: store.level }), 'caption',
    { fontSize: '10px', color: '#8a5f1c' }));
  body.add(self.ui.label(barX + barW, inner - 2,
    t('dynasty.page.toNext', {
      short: Math.max(0, progress.need - progress.into).toLocaleString('en-US'),
      next: store.level + 1,
    }), 'caption', { fontSize: '10px', align: 'right' }).setOrigin(1, 0));
  inner += 14;
  const fill = Math.min(1, progress.into / Math.max(1, progress.need));
  const bar = self.add.graphics();
  bar.fillStyle(INK_UI.softBrush, 0.3);
  bar.fillRoundedRect(barX, inner, barW, 8, 4);
  bar.fillStyle(INK_UI.gold, 0.95);
  bar.fillRoundedRect(barX, inner, Math.max(4, barW * fill), 8, 4);
  if (live && live.score > 0) {
    // The reign in play, hatched: promised, not banked. Past the level's end it fills to the
    // end — the rest of the promise is the next level, which the line below already names.
    const ahead = dynastyProgressForXp(store.xp + live.score);
    const to = ahead.level > store.level ? 1 : Math.min(1, ahead.into / Math.max(1, ahead.need));
    drawHatch(bar, barX + barW * fill, inner, barW * Math.max(0, to - fill), 8, INK_UI.jade);
  }
  body.add(bar);
  inner += 8 + 8;
  body.add(self.ui.label(barX, inner, pendingLine, 'caption', {
    fontSize: '10px',
    color: store.pendingPicks > 0 ? '#a4402c' : '#1c6b58',
    wordWrap: { width: W - 20 },
  }));
  if (liveLine) {
    inner += pendingH + 3;
    body.add(self.ui.label(barX, inner, liveLine, 'caption', { fontSize: '10px', color: '#1c6b58', wordWrap: { width: W - 20 } }));
  }
  return y + headerH + 10;
}

/**
 * What the house holds, one row per trait, with what each one does.
 *
 * Held traits first, each with its effect on the row — a chip that said "Quartermaster ✓" left
 * the player to remember what a quartermaster does. The table's remaining traits follow,
 * quieter, so the player can see what a level-up might still lay out. Pending traits — flags
 * nothing reads yet — are not drawn at all. A trait chosen at the last ceremony wears a gold
 * mark on the first visit after it: the page answers "what did I just get" without being asked.
 * Tapping any row opens its sheet: the effect, what changes, when it applies, since when.
 */
function drawDynastyTraits(self: MenuScene,
  body: Phaser.GameObjects.Container,
  store: ReturnType<typeof getDynasty>,
  PAD: number,
  W: number,
  y: number,
  measure: (text: string, size: string, width: number) => number,
): number {
  const held = store.traits.filter((id) => !DYNASTY_TRAITS_PENDING.has(id));
  // What could still be dealt: every un-held trait, and past level 8 the Rank II step of each
  // held one — the same list the ceremony rolls from.
  const table = offerable(store).map((trait) => trait.id);
  const lastRecord = dynastyHistory(store)[dynastyHistory(store).length - 1];
  const fresh = lastRecord?.trait && held.includes(lastRecord.trait) && readSeenTrait() !== lastRecord.n
    ? lastRecord.trait
    : undefined;
  if (fresh && lastRecord) noteSeenTrait(lastRecord.n);

  const headerLeft = self.ui.label(PAD, y, t('dynasty.page.traits', { held: held.length, total: held.length + table.length }),
    'caption', { fontSize: '10px', backgroundColor: 'rgba(243,230,196,0.82)', padding: { x: 4, y: 1 } });
  body.add(headerLeft);
  y += headerLeft.height + 5;
  // What the section is, in one line — *"Phẩm chất": what is that? no information* — and how
  // it is used: two are laid out at each level, one is kept, tap to read one.
  const hintText = self.ui.label(PAD, y, t('dynasty.page.traitsHint'), 'caption',
    { fontSize: '9.5px', color: '#6b5a44', wordWrap: { width: W }, backgroundColor: 'rgba(243,230,196,0.82)', padding: { x: 4, y: 1 } });
  body.add(hintText);
  y += hintText.height + 8;

  const name = (id: string) => t(`dynasty.trait.${id}` as Parameters<typeof t>[0]);
  const effect = (id: string) => t(`dynasty.trait.${id}.d` as Parameters<typeof t>[0]);
  const TAG_W = 64;

  held.forEach((id) => {
    const effectH = measure(effect(id), '9.5px', W - TAG_W - 26);
    const rowH = Math.max(38, 8 + 14 + 2 + effectH + 8);
    const isFresh = id === fresh;
    body.add(self.ui.panel({ x: PAD, y, width: W, height: rowH },
      { border: isFresh ? INK_UI.gold : INK_UI.jade, borderWidth: isFresh ? 1.8 : 1, fillAlpha: 0.94 }));
    if (isFresh) {
      // The first-visit mark: a gold wash that settles, once. Not a badge that stays.
      const wash = self.add.graphics();
      wash.fillStyle(INK_UI.gold, 0.28);
      wash.fillRoundedRect(PAD + 1, y + 1, W - 2, rowH - 2, 5);
      body.add(wash);
      self.tweens.add({ targets: wash, alpha: 0, duration: motionMs(1600), delay: motionMs(500), ease: 'Sine.easeOut' });
    }
    const rankTwo = findDynastyTrait(id)?.rank === 2;
    body.add(self.ui.label(PAD + 10, y + 8, `${name(id)}${rankTwo ? ` ${t('dynasty.page.rank2')}` : ''}`, 'label',
      { fontSize: '12px', ...(rankTwo ? { color: '#8a5f1c' } : {}) }));
    body.add(self.ui.label(PAD + 10, y + 8 + 16, effect(id), 'caption',
      { fontSize: '9.5px', wordWrap: { width: W - TAG_W - 26 } }));
    body.add(self.ui.label(PAD + W - 10, y + 9, isFresh ? t('dynasty.page.new') : t('dynasty.page.held'), 'caption', {
      fontSize: '8.5px', color: isFresh ? '#8a5f1c' : '#1c6b58', align: 'right',
      backgroundColor: isFresh ? 'rgba(232,196,110,0.35)' : 'rgba(120,180,150,0.22)', padding: { x: 5, y: 2 },
    }).setOrigin(1, 0));
    body.add(self.ui.button({ x: PAD, y, width: W, height: rowH }, '', () => openTraitSheet(self, id), { frameless: true }));
    y += rowH + 5;
  });

  // What is still on the table, as one row: the names, and what the next level does with them.
  // One row rather than one per trait, because every one of them is the same fact — not yet
  // taken — and the page's height is the page's fit at the 620 clamp.
  // What is still on the table: one row each, with what it does, and a tap opens its sheet.
  // A joined string of seven names said nothing and answered no tap.
  if (table.length > 0) {
    const tableHead = self.ui.label(PAD, y,
      `${t('dynasty.page.tableRow', { n: table.length })} · ${t(table.length >= 2 ? 'dynasty.page.tableNext' : 'dynasty.page.tableLast')}`,
      'caption', { fontSize: '9.5px', color: '#8a7a60', wordWrap: { width: W }, backgroundColor: 'rgba(243,230,196,0.82)', padding: { x: 4, y: 1 } });
    body.add(tableHead);
    y += tableHead.height + 4;
    for (const id of table) {
      const effectH = measure(effect(id), '9px', W - 40);
      const rowH = 6 + 14 + effectH + 6;
      body.add(self.ui.panel({ x: PAD, y, width: W, height: rowH }, { border: INK_UI.softBrush, fillAlpha: 0.6 }));
      body.add(self.ui.label(PAD + 10, y + 6, name(id), 'label', { fontSize: '11px', color: '#4a3b28' }));
      body.add(self.ui.label(PAD + 10, y + 6 + 14, effect(id), 'caption', { fontSize: '9px', wordWrap: { width: W - 40 } }));
      body.add(self.ui.label(PAD + W - 10, y + rowH / 2, '›', 'label', { fontSize: '14px', color: '#8a7a60' }).setOrigin(1, 0.5));
      body.add(self.ui.button({ x: PAD, y, width: W, height: rowH }, '', () => openTraitSheet(self, id), { frameless: true }));
      y += rowH + 4;
    }
  }
  return y + 6;
}

/**
 * What the player can do right now — first on the page, above the biography.
 *
 * A hub between runs leads with its verbs: the deck when draws wait, the vault when something
 * can be bought, the king. Whatever is owed comes first and wears the page's one primary, and
 * the count sits on the row as a pill so the reason to tap is read before the label is. At one
 * height, in one place, so the eye learns where "do" lives on this page. The uncrowned king's
 * door stays, disabled and last, because its sub-label is the one sentence that says how a
 * king comes to exist.
 */
function drawDynastyDoors(self: MenuScene,
  body: Phaser.GameObjects.Container,
  store: ReturnType<typeof getDynasty>,
  legacy: ReturnType<typeof getLegacy>,
  PAD: number,
  W: number,
  y: number,
): number {
  const ROW = 46;
  const cabinet = getCabinet();
  const seals = cabinetProgress();
  // The cheapest next step on any ladder: the vault is "affordable" when one thing on it is.
  const cheapest = LEGACY_PERKS
    .map((perk) => nextPerkCost(perk, perkLevel(perk.id, legacy)))
    .filter((cost): cost is number => cost !== undefined)
    .reduce((min, cost) => Math.min(min, cost), Infinity);
  const affordable = Number.isFinite(cheapest) && legacy.points >= cheapest;
  const crowned = isCrowned(store);

  type Door = { label: string; sub: string; pending?: string; enabled: boolean; open: () => void };
  const doors: Door[] = [{
    label: t('dynasty.openCabinet'),
    sub: cabinet.rubbings > 0
      ? t('dynasty.openCabinetNow', { n: cabinet.rubbings, found: seals.found, total: seals.total })
      : t('cabinet.subCount', { found: seals.found, total: seals.total }),
    ...(cabinet.rubbings > 0 ? { pending: String(cabinet.rubbings) } : {}),
    enabled: true,
    open: () => self.scene.start('CabinetScene'),
  }];
  if (legacy.points > 0 || legacy.bestScore > 0) {
    doors.push({
      label: t('dynasty.openShop'),
      sub: affordable
        ? t('dynasty.shopAfford', { total: legacy.points })
        : Number.isFinite(cheapest)
          ? t('dynasty.shopShort', { total: legacy.points, n: cheapest - legacy.points })
          : t('dynasty.shopSubPerks', { total: legacy.points, n: legacy.loadout.length, max: LOADOUT_MAX }),
      ...(affordable ? { pending: '✓' } : {}),
      enabled: true,
      open: () => { self.returnMode = 'dynasty'; self.mode = 'legacy'; self.render(); },
    });
  }
  doors.push({
    label: t('coronation.temple'),
    sub: crowned ? t('coronation.temple.sub') : t('coronation.temple.uncrowned'),
    enabled: crowned,
    open: () => { self.returnMode = 'dynasty'; self.mode = 'temple'; self.render(); },
  });
  // Owed rows first; otherwise the order above. Both halves keep it, so the page is stable.
  const ordered = [...doors.filter((door) => door.pending), ...doors.filter((door) => !door.pending)];

  const header = self.ui.label(PAD, y, t('dynasty.page.actNow'), 'caption',
    { fontSize: '10px', backgroundColor: 'rgba(243,230,196,0.82)', padding: { x: 4, y: 1 } });
  body.add(header);
  y += header.height + 5;

  let primaryGiven = false;
  for (const door of ordered) {
    const primary = Boolean(door.pending) && !primaryGiven;
    if (primary) primaryGiven = true;
    body.add(self.ui.button({ x: PAD, y, width: W, height: ROW }, door.label,
      () => { if (door.enabled) door.open(); },
      { variant: !door.enabled ? 'disabled' : primary ? 'primary' : 'secondary', fontSize: '12.5px', subLabel: door.sub }));
    if (door.pending) {
      // The pill: the count on the row's right end, in the page's own cinnabar.
      const count = self.ui.label(0, 0, door.pending, 'label', { fontSize: '11px', color: '#f3e6c4', align: 'center' }).setOrigin(0.5);
      const pillW = Math.max(22, Math.ceil(count.width) + 12);
      const pill = self.add.graphics();
      pill.fillStyle(INK_UI.cinnabar, 1);
      // On the row's midline: a pill in the top half read as a corner mark, not the row's count.
      pill.fillRoundedRect(PAD + W - 12 - pillW, y + ROW / 2 - 10, pillW, 20, 10);
      body.add(pill);
      count.setPosition(PAD + W - 12 - pillW / 2, y + ROW / 2);
      body.add(count);
    }
    y += ROW + 6;
  }
  return y + 6;
}

/**
 * The law that carries over, when there is any. A row that said "none yet" under the doors
 * taught nothing and pushed them further down; the next-reign screen still says it there.
 */
function drawDynastyCode(self: MenuScene,
  body: Phaser.GameObjects.Container,
  legacy: ReturnType<typeof getLegacy>,
  PAD: number,
  W: number,
  y: number,
): number {
  const codeCount = (legacy.codes ?? []).length;
  if (codeCount === 0) return y;
  const ROW = 38;
  body.add(self.ui.panel({ x: PAD, y, width: W, height: ROW }, { border: INK_UI.jade, fillAlpha: 0.9 }));
  body.add(self.ui.label(PAD + 10, y + 6, t('dynasty.codeLabel'), 'label', { fontSize: '11.5px', color: '#1c6b58' }));
  body.add(self.ui.label(PAD + 10, y + 22, t('dynasty.next.codeSome', { n: codeCount }), 'caption',
    { fontSize: '9.5px', wordWrap: { width: W - 20 } }));
  return y + ROW + 10;
}

/**
 * One trait's sheet: the effect, what changes, when it applies, and since when.
 *
 * Slides up rather than appearing — 260 ms, or the reduced beat — so the page and the sheet read
 * as one surface with a layer on it, not as a page replaced. The blocker fades only; a full
 * screen veil that slid would drag the whole page with it.
 */
export function openTraitSheet(self: MenuScene, id: string): void {
  self.closeModal();
  const store = getDynasty();
  const held = store.traits.includes(id);
  const since = dynastyHistory(store).find((record) => record.trait === id);
  const modal = self.ui.modal({
    title: t(`dynasty.trait.${id}` as Parameters<typeof t>[0]),
    subtitle: held
      ? (since ? t('dynasty.page.heldSince', { n: since.n }) : t('dynasty.page.heldFrom'))
      : t('dynasty.page.notHeld'),
    onClose: () => self.closeModal(),
    height: held ? 372 : 320,
  });
  self.modalObjects.push(...modal.objects);
  self.armSheetDismiss(modal.panelBounds);
  const { contentBounds } = modal;
  const x = contentBounds.x + 4;
  const width = contentBounds.width - 8;
  let cursor = contentBounds.y + 4;
  const rows: Phaser.GameObjects.GameObject[] = [];

  const effect = self.ui.label(x, cursor, t(`dynasty.trait.${id}.d` as Parameters<typeof t>[0]), 'body',
    { fontSize: '12.5px', wordWrap: { width } });
  rows.push(effect);
  cursor += effect.height + 14;

  const section = (head: string, text: string, color: string) => {
    const heading = self.ui.label(x, cursor, head, 'caption', { fontSize: '9px', color });
    heading.setLetterSpacing?.(1.6);
    rows.push(heading);
    cursor += 14;
    const line = self.ui.label(x, cursor, text, 'label', { fontSize: '12px', wordWrap: { width } });
    rows.push(line);
    cursor += line.height + 12;
  };
  section(t('dynasty.page.delta'), t(`dynasty.trait.${id}.delta` as Parameters<typeof t>[0]), '#8a5f1c');
  section(t('dynasty.page.when'), t(`dynasty.trait.${id}.when` as Parameters<typeof t>[0]), '#1c6b58');
  if (held) {
    // How often it has already paid — counted at the read site, never estimated.
    const used = traitUses(id, store);
    section(t('dynasty.page.usedHead'), used > 0 ? t('dynasty.page.used', { n: used }) : t('dynasty.page.usedNone'), '#6b5a44');
  }
  // Where the one way back lives, and how the sheet closes — said once, quietly.
  rows.push(self.ui.label(x, cursor + 2, held ? t('dynasty.page.respecHint') : t('dynasty.page.sheetHint'), 'caption',
    { fontSize: '9.5px', color: '#8a7a60', wordWrap: { width } }));
  self.modalObjects.push(...rows);

  self.riseSheet([...modal.objects, ...rows]);
}
