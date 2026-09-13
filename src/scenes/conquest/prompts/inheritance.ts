/**
 * Gia sản dòng họ — the first thing a reign is told: what the house already owns.
 *
 * Everything this screen reports was applied *before* it was raised, silently, inside
 * `createAscentGameState`: Old Roads had already been spent on the opening trade, the Cabinet's
 * seals had already arrived at one stack each and charged their ambition, the founding count had
 * already been decided. Five stores paid out and the run simply started. The inheritance chip
 * says all of it at the *end* of a run; nothing said it at the beginning, so an hour spent filling
 * the Dynasty Deck opened the next reign on exactly the screen a first-time player sees.
 *
 * It is a summary and not a decision — the same shape as the ceremony's `next-reign` card, at the
 * other end of the loop — so it carries no payload and no options. Every figure is read live from
 * the stores at draw time, the rule `hasTrait` follows at each of its own read sites, which is
 * what keeps it from ever quoting a number the run is not actually holding.
 *
 * There is no "change the hand" affordance on purpose. The hand has already been dealt and its
 * ambition already charged by the time this draws; a control that appeared to re-slot it would be
 * offering to change something the run has spent.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT } from '../../../game/constants';
import { INK_UI, INK_UI_HEX } from '../../../ui/InkUI';
import { CARD_ICON_SIZE, type CardIconId, drawCardIcon } from '../../../ui/CardIcons';
import { drawHouseBanner, houseBanner } from '../../../ui/ascent/houseBanner';
import { staggerIn } from '../../../ui/animations';
import { motionMs } from '../../../game/lifeSettings';
import { UI_FONT } from '../../../ui/fonts';
import { rarityLabel, t } from '../../../i18n';
import { dynastyRankRarity, founderOptionCount, getDynasty, hasTrait } from '../../../state/dynasty';
import { cabinetLevel, getCabinet, openingHand, openingHandSlots } from '../../../state/cabinet';
import { findDynastyTrait } from '../../../data/dynastyTraits';
import { findPowerCard } from '../../../data/ascentCards';
import { powerCardView } from '../../../systems/ascent/PowerDraftSystem';
import { AMBITION_PER_POWER_CARD } from '../../../game/ascentConfig';
import { PROMPT_HINT_ROOM, RARITY_COLOR, RARITY_WASH, cssHex } from '../constants';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { rulesOf } from '../../../game/ascentRuleset';
import { readCarriedOver } from '../../../systems/ascent/CarriedOver';
import { getLegacyPerk, perkDescription, PERK_MAX_LEVEL } from '../../../state/legacy';

/** The way back is the way in: the two controls are the run-start twin of the ceremony's foot. */
const BEGIN_H = 46;
const LEAVE_H = 28;
const FOOTER = BEGIN_H + 8 + LEAVE_H + PROMPT_HINT_ROOM + 12;

/**
 * A glyph per trait, by the *verb* the trait performs rather than by the system it lives in —
 * the rule `CardIcons` already follows, so a trait that widens a draft and a card that widens a
 * draft read as the same idea. Rank II shares its base's glyph: it is the same lever, pulled
 * further, and a second glyph would say it was a second thing.
 */
const TRAIT_ICON: Record<string, CardIconId> = {
  'wide-draft': 'scroll',
  'first-reroll-free': 'spark',
  'second-founder': 'person',
  'twin-doctrine': 'scales',
  quartermaster: 'cart',
  'old-roads': 'coin',
  'deep-shelf': 'book',
  'long-memory': 'banner',
};

function traitIcon(id: string): CardIconId {
  const trait = findDynastyTrait(id);
  return TRAIT_ICON[trait?.base ?? id] ?? TRAIT_ICON[id] ?? 'crown';
}

function traitName(id: string): string {
  return t(`dynasty.trait.${id}` as Parameters<typeof t>[0]);
}

function traitText(id: string, part: 'delta' | 'when'): string {
  return t(`dynasty.trait.${id}.${part}` as Parameters<typeof t>[0]);
}

interface Row {
  icon: CardIconId;
  label: string;
  delta: string;
  when?: string;
  accent: number;
  /** The house's own level the trait was taken at, printed at the right of the title line. */
  tag?: string;
}

export function showInheritance(self: ConquestUIScene): void {
  // Beta (B30): the summary names every layer the house carries, Legacy included.
  const summary = rulesOf(self.state).carriedSummary;
  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    summary ? t('beta.inherit.title') : t('ascent.inheritance.title'),
    summary ? t('beta.inherit.subtitle') : t('ascent.inheritance.subtitle'),
    FOOTER,
  );

  /**
   * Half of the reservation `promptScrollBody` keeps on its right, moved to the left.
   *
   * The scroll body hands back a `bodyWidth` six points narrower than the area it clips, so a
   * card's edge never sits under the stencil — and every caller draws from local x 0, which spends
   * the whole six on the right. A page of three-column cards hides that; a page of full-width slabs
   * does not. Measured on the reported screen: the rows ran 20 → 364 on a 390 sheet (20 left, 26
   * right) while the fixed footer's printed ink ran 14 → 376 (14 and 14), so the body sat three
   * points left of a centred button and read as shoved into the left edge.
   */
  const inset = Math.round((content.width - bodyWidth) / 2);

  const store = getDynasty();
  const cabinet = getCabinet();
  const hand = openingHand();
  const slots = openingHandSlots();
  const built: Phaser.GameObjects.Container[] = [];
  let y = 0;

  // ── The house ───────────────────────────────────────────────────────────────
  y += houseBlock(self, body, built, inset, bodyWidth, y, store, summary);
  y += 10;

  // ── The opening hand ────────────────────────────────────────────────────────
  //
  // Headed by what the hand *cost*, not by how many slots are full: the seals are the one
  // inheritance in the game the player pays for, +2 ambition a slot, and a summary that showed
  // the gift without the price would be selling rather than reporting.
  y += sectionHead(self, body, inset, y, hand.length > 0
    ? t('ascent.inheritance.hand', { n: hand.length * AMBITION_PER_POWER_CARD })
    // "1 slot(s)" is the shape of a string nobody wrote on purpose. One slot is the only case
    // the first reign ever sees, so it gets its own line rather than a parenthesised plural.
    : slots === 1
      ? t('ascent.inheritance.handSlot')
      : t('ascent.inheritance.handSlots', { n: slots }));
  y += handRow(self, body, built, inset, bodyWidth, y, hand, slots);
  y += 10;

  // ── The traits ──────────────────────────────────────────────────────────────
  y += sectionHead(self, body, inset, y, t('dynasty.next.traits'));

  const founderCount = founderOptionCount();
  const rows: Row[] = [{
    icon: 'person',
    label: t('dynasty.next.founderN', { n: founderCount }),
    delta: hasTrait('second-founder')
      ? `${traitName('second-founder')} · ${traitText('second-founder', 'delta')}`
      : t('dynasty.next.founderD'),
    when: t('ascent.inheritance.nextScreen'),
    accent: INK_UI.gold,
  }];
  // The founding count is a trait's effect, so a Second Founder house would otherwise read its
  // own trait twice — once as the count above and once in the list. It is listed where the player
  // can act on it, which is the count.
  for (const id of store.traits.filter((held) => held !== 'second-founder')) {
    rows.push({
      icon: traitIcon(id),
      label: traitName(id),
      delta: traitText(id, 'delta'),
      when: traitText(id, 'when'),
      accent: INK_UI.jade,
    });
  }
  if (store.traits.length === 0 && !summary) {
    rows.push({
      icon: 'scroll',
      label: t('dynasty.next.traitsNone'),
      delta: t('ascent.inheritance.traitsPromise'),
      accent: INK_UI.softBrush,
    });
  }
  // Draws banked and never spent: said here, with the number, or a player who has earned six of
  // them starts another reign without the hand they were for. The same argument, and the same
  // pair of keys, the next-reign card makes at the other end of the loop.
  if (cabinet.rubbings > 0) {
    rows.push({
      icon: 'book',
      label: t('dynasty.next.rubbings', { n: cabinet.rubbings }),
      delta: t('dynasty.next.rubbingsD'),
      accent: INK_UI.gold,
    });
  }

  for (const row of rows) {
    y += traitRow(self, body, built, inset, bodyWidth, y, row);
    y += 8;
  }

  // ── Beta: the Legacy vault ──────────────────────────────────────────────────
  //
  // The one layer this card never mentioned: perks carried at their ranks were applied at the
  // founding (gold, people, walls, standing modifiers) with nothing on the page to say so.
  if (summary) {
    const carried = readCarriedOver();
    const legacyRows: Row[] = carried.perks.flatMap(({ id, level }) => {
      const perk = getLegacyPerk(id);
      return perk ? [{
        icon: 'coin' as CardIconId,
        label: `${t(`empire.legacy.perk.${id}` as Parameters<typeof t>[0])} · ${t('beta.inherit.perkRank', { level, max: PERK_MAX_LEVEL })}`,
        delta: perkDescription(perk, level),
        accent: INK_UI.gold,
      }] : [];
    });
    if (carried.codes > 0) {
      legacyRows.push({ icon: 'scroll', label: t('beta.inherit.codes', { n: carried.codes }), delta: t('beta.inherit.codesD'), accent: INK_UI.jade });
    }
    if (carried.legacyPoints > 0) {
      legacyRows.push({ icon: 'coin', label: t('beta.inherit.vault', { points: carried.legacyPoints }), delta: t('beta.inherit.vaultD'), accent: INK_UI.softBrush });
    }
    if (legacyRows.length > 0) {
      y += 2;
      y += sectionHead(self, body, inset, y, t('beta.inherit.legacyHead'));
      for (const row of legacyRows) {
        y += traitRow(self, body, built, inset, bodyWidth, y, row);
        y += 8;
      }
    }
  }

  finish(y + 8);
  staggerIn(self, built, { staggerMs: motionMs(60), duration: motionMs(200) });

  // ── The foot ────────────────────────────────────────────────────────────────
  const beginY = GAME_HEIGHT - FOOTER + PROMPT_HINT_ROOM;
  // The same box the rows stand in, so the printed button's ink bleeds evenly either side of the
  // column above it rather than hanging twelve points past its right edge.
  const bounds = { x: content.x + inset, width: bodyWidth };
  self.modalLayer.add(self.ui.button(
    { x: bounds.x, y: beginY, width: bounds.width, height: BEGIN_H },
    t('ascent.inheritance.begin'),
    () => self.choose('ok'),
    { variant: 'primary', fontSize: '15px' },
  ));
  // Leaving here costs nothing that was not already banked: the coronation writes the king to the
  // store the moment it is answered, and the run this screen describes has no history to lose. A
  // player who opens the inheritance and finds it is not the hand they meant to slot has to be
  // able to go back and slot another, or the screen is a report on a decision it will not let
  // them revisit.
  self.modalLayer.add(self.ui.button(
    { x: bounds.x, y: beginY + BEGIN_H + 8, width: bounds.width, height: LEAVE_H },
    t('dynasty.next.leave'),
    () => self.events.emit('ui:exit-to-menu'),
    { variant: 'ghost', fontSize: '12px' },
  ));
}

/* -------------------------------------------------------------------------- pieces */

/** A section's name, in the caption's voice. Returns the height it used. */
function sectionHead(
  self: ConquestUIScene,
  body: Phaser.GameObjects.Container,
  inset: number,
  y: number,
  label: string,
): number {
  const text = self.ui.label(inset + 2, y, label, 'caption', { fontSize: '10px' });
  body.add(text);
  return text.height + 4;
}

/**
 * The house's own card: banner, name, the ledger line, and who founded the last reign.
 *
 * A house with no crowned founder still gets all four — `houseBanner` falls back to the họ's
 * historical field, and the two empty lines become the promise the first reign is owed rather
 * than a hole where the other reigns have a record.
 */
function houseBlock(
  self: ConquestUIScene,
  body: Phaser.GameObjects.Container,
  built: Phaser.GameObjects.Container[],
  inset: number,
  width: number,
  y: number,
  store: ReturnType<typeof getDynasty>,
  summary = false,
): number {
  const HEIGHT = 74;
  const holder = self.add.container(inset, y);
  holder.add(self.ui.panel({ x: 0, y: 0, width, height: HEIGHT }, { ornaments: true }));

  const banner = drawHouseBanner(self, houseBanner(), 38, 50);
  banner.setPosition(12, 14);
  holder.add(banner);

  const left = 62;
  const name = store.house
    ? t('ascent.inheritance.house', { house: store.house })
    : t('ascent.inheritance.houseNew');
  const title = self.ui.label(left, 11, name, 'label', {
    fontSize: '14px', wordWrap: { width: width - left - 74 },
  });
  holder.add(title);

  // The badge the coronation draws the king at, quoted rather than re-derived: the ladder is the
  // house's, and two surfaces disagreeing about which rank it stands on is worse than either.
  if (store.reigns > 0) {
    const rank = dynastyRankRarity(store.level);
    const badge = self.add.text(width - 12, 13, rarityLabel(rank), {
      color: cssHex(INK_UI.gold), fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
    }).setOrigin(1, 0);
    holder.add(badge);
  }

  holder.add(self.ui.label(left, 32, store.reigns > 0
    ? t('ascent.inheritance.ledger', {
      level: store.level,
      reigns: store.reigns,
      score: Math.round(store.bestScore).toLocaleString('en-US'),
    })
    : summary ? t('beta.inherit.ledgerFirst') : t('ascent.inheritance.ledgerFirst'), 'caption', {
    fontSize: '10px', wordWrap: { width: width - left - 12 },
  }));

  holder.add(self.ui.label(left, 48, store.founder
    ? t('ascent.inherit.row.founder', { name: store.founder.name })
    : t('ascent.inheritance.housePromise'), 'body', {
    fontSize: '11px', wordWrap: { width: width - left - 12 }, maxLines: 1,
  }));

  body.add(holder);
  built.push(holder);
  return HEIGHT;
}

/**
 * The hand, laid out one column per *slot* rather than one per card.
 *
 * Showing only the cards would hide the thing the player spent a dynasty level on: a house with
 * Deep Shelf and one seal has an empty shelf, and the dashed column is what says so.
 */
function handRow(
  self: ConquestUIScene,
  body: Phaser.GameObjects.Container,
  built: Phaser.GameObjects.Container[],
  inset: number,
  width: number,
  y: number,
  hand: string[],
  slots: number,
): number {
  const GAP = 10;
  const columns = Math.max(1, slots);
  const column = Math.floor((width - GAP * (columns - 1)) / columns);
  // **One slot is a row, not a column.** A house with a single shelf — which is every house until
  // Deep Shelf is taken, so most of them — was given one 344-wide card standing 122 tall to hold a
  // name and one line of effect. On the 620 sheet a desktop window clamps to, that alone pushed the
  // page past its viewport and cut the last trait row in half. Laid on its side it reads the same
  // and costs 40 points less, which is the difference between a page that scrolls and one that
  // does not. Two or three slots keep the columns: side by side is how a hand is compared.
  const wide = columns === 1;
  const HEIGHT = wide ? 82 : 122;

  for (let index = 0; index < columns; index += 1) {
    const holder = self.add.container(inset + index * (column + GAP), y);
    const cardId = hand[index];
    if (cardId) sealCard(self, holder, column, HEIGHT, cardId, wide);
    else emptySlot(self, holder, column, HEIGHT, wide);
    body.add(holder);
    built.push(holder);
  }
  return HEIGHT;
}

function sealCard(
  self: ConquestUIScene,
  holder: Phaser.GameObjects.Container,
  width: number,
  height: number,
  cardId: string,
  wide: boolean,
): void {
  const card = findPowerCard(cardId);
  const rarity = card?.rarity ?? 'bronze';
  const level = cabinetLevel(cardId);
  // Read through the run's own view so the description carries this level's numbers rather than
  // the table's — a Lv 3 seal that printed the Lv 1 figures would understate what it just gave.
  const view = powerCardView(self.state, cardId);

  holder.add(self.ui.panel({ x: 0, y: 0, width, height },
    { border: RARITY_COLOR[rarity], borderWidth: 1.4, fillAlpha: 0.55 }));
  const wash = self.add.graphics();
  wash.fillStyle(RARITY_COLOR[rarity], RARITY_WASH[rarity]);
  wash.fillRoundedRect(2, 2, width - 4, height - 4, 8);
  holder.add(wash);

  const stamp = `${t(`ascent.rarity.${rarity}` as Parameters<typeof t>[0])} · ${t('cabinet.view.level', { level })}`;
  const stampColour = cssHex(rarity === 'silver' ? INK_UI.softBrush : RARITY_COLOR[rarity]);
  const glyph = drawCardIcon(self, iconForCard(cardId), INK_UI.gold);
  holder.add(glyph);
  holder.add(levelPips(self, width - 10, wide ? 20 : 12 + CARD_ICON_SIZE / 2, level));

  if (wide) {
    glyph.setPosition(14 + CARD_ICON_SIZE / 2, height / 2 - 4);
    const left = 14 + CARD_ICON_SIZE + 12;
    holder.add(self.ui.label(left, 11, view?.name ?? cardId, 'label', {
      fontSize: '13px', wordWrap: { width: width - left - 58 }, maxLines: 1,
    }));
    holder.add(self.add.text(left, 32, view?.description ?? '', {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9.5px',
      wordWrap: { width: width - left - 14 }, maxLines: 2,
    }));
    holder.add(self.add.text(left, height - 18, stamp, {
      color: stampColour, fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
    }));
    return;
  }

  glyph.setPosition(10 + CARD_ICON_SIZE / 2, 12 + CARD_ICON_SIZE / 2);
  holder.add(self.ui.label(10, 44, view?.name ?? cardId, 'label', {
    fontSize: '12px', wordWrap: { width: width - 20 }, maxLines: 2,
  }));
  holder.add(self.add.text(10, 74, view?.description ?? '', {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px',
    wordWrap: { width: width - 20 }, maxLines: 3,
  }));
  holder.add(self.add.text(10, height - 16, stamp, {
    color: stampColour, fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
  }));
}

function emptySlot(
  self: ConquestUIScene,
  holder: Phaser.GameObjects.Container,
  width: number,
  height: number,
  wide: boolean,
): void {
  // A dashed rule rather than a panel: an empty slot that carries the same printed surface as a
  // filled one reads as a card whose text failed to load.
  const g = self.add.graphics();
  g.lineStyle(1.4, INK_UI.softBrush, 0.7);
  for (const [x1, y1, x2, y2] of [
    [0, 0, width, 0], [width, 0, width, height], [width, height, 0, height], [0, height, 0, 0],
  ] as const) {
    const span = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(2, Math.round(span / 8));
    for (let i = 0; i < steps; i += 1) {
      if (i % 2 === 1) continue;
      const a = i / steps;
      const b = Math.min(1, (i + 1) / steps);
      g.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
    }
  }
  holder.add(g);

  const glyph = drawCardIcon(self, 'book', INK_UI.softBrush);
  holder.add(glyph);

  if (wide) {
    glyph.setPosition(14 + CARD_ICON_SIZE / 2, height / 2);
    const left = 14 + CARD_ICON_SIZE + 12;
    holder.add(self.ui.label(left, 18, t('ascent.inheritance.slotEmpty'), 'label', {
      fontSize: '12px', color: INK_UI_HEX.mutedText, wordWrap: { width: width - left - 14 }, maxLines: 1,
    }));
    holder.add(self.add.text(left, 40, t('ascent.inheritance.slotEmptyD'), {
      color: cssHex(INK_UI.softBrush), fontFamily: UI_FONT, fontSize: '9px',
      wordWrap: { width: width - left - 14 }, maxLines: 2,
    }));
    return;
  }

  glyph.setPosition(width / 2, 40);
  holder.add(self.ui.label(width / 2, 60, t('ascent.inheritance.slotEmpty'), 'label', {
    fontSize: '11px', color: INK_UI_HEX.mutedText, align: 'center', wordWrap: { width: width - 16 },
  }).setOrigin(0.5, 0));
  holder.add(self.add.text(width / 2, 82, t('ascent.inheritance.slotEmptyD'), {
    color: cssHex(INK_UI.softBrush), fontFamily: UI_FONT, fontSize: '9px', align: 'center',
    wordWrap: { width: width - 16 }, maxLines: 3,
  }).setOrigin(0.5, 0));
}

/** Three lozenges, filled to the cabinet level — the Cabinet's own ladder, at card size. */
function levelPips(
  self: ConquestUIScene,
  right: number,
  centreY: number,
  level: number,
): Phaser.GameObjects.Graphics {
  const g = self.add.graphics();
  const SIZE = 4;
  for (let index = 0; index < 3; index += 1) {
    const cx = right - index * 10 - SIZE;
    const points = [
      { x: cx, y: centreY - SIZE }, { x: cx + SIZE, y: centreY },
      { x: cx, y: centreY + SIZE }, { x: cx - SIZE, y: centreY },
    ];
    if (2 - index < level) {
      g.fillStyle(INK_UI.brush, 0.85);
      g.fillPoints(points, true);
    }
    g.lineStyle(1.2, INK_UI.brush, 0.5);
    g.strokePoints(points, true);
  }
  return g;
}

/**
 * One rule the house holds, as the ledger's own row: an accent edge, a glyph, the name, what it
 * changes, and when it will fire. Height is measured from the text rather than fixed, because the
 * Vietnamese delta lines run a third longer than the English and a fixed row clipped them.
 */
function traitRow(
  self: ConquestUIScene,
  body: Phaser.GameObjects.Container,
  built: Phaser.GameObjects.Container[],
  inset: number,
  width: number,
  y: number,
  row: Row,
): number {
  const holder = self.add.container(inset, y);
  const left = 14 + CARD_ICON_SIZE + 8;
  const textWidth = width - left - 12 - (row.tag ? 40 : 0);

  const label = self.ui.label(left, 8, row.label, 'label', {
    fontSize: '12px', wordWrap: { width: textWidth },
  });
  const delta = self.add.text(left, 0, row.delta, {
    color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '10px',
    wordWrap: { width: width - left - 12 },
  });
  delta.setY(8 + label.height + 2);
  const when = row.when
    ? self.add.text(left, delta.y + delta.height + 2, row.when, {
      color: cssHex(INK_UI.softBrush), fontFamily: UI_FONT, fontSize: '9px',
      wordWrap: { width: width - left - 12 },
    })
    : undefined;

  const height = Math.max(50, (when ? when.y + when.height : delta.y + delta.height) + 8);
  holder.add(self.ui.panel({ x: 0, y: 0, width, height },
    { border: INK_UI.softBrush, fillAlpha: 0.5 }));

  const edge = self.add.graphics();
  edge.fillStyle(row.accent, 0.9);
  edge.fillRect(1.5, 5, 2.5, height - 10);
  holder.add(edge);

  const glyph = drawCardIcon(self, row.icon, row.accent);
  glyph.setPosition(14 + CARD_ICON_SIZE / 2, height / 2);
  glyph.setScale(0.82);
  holder.add(glyph);

  holder.add(label);
  holder.add(delta);
  if (when) holder.add(when);

  body.add(holder);
  built.push(holder);
  return height;
}

/**
 * A seal's glyph. `iconForOption` keys on the mode's *option* ids and knows nothing about card
 * ids, so a card falls back to the one shape every power card shares rather than to nothing.
 */
function iconForCard(cardId: string): CardIconId {
  const card = findPowerCard(cardId);
  if (!card) return 'scroll';
  return card.rarity === 'jade' ? 'crown' : 'scroll';
}
