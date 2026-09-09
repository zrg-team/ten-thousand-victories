/**
 * The three screens at a run's edges: the founding that picks the dynasty's champion, the mandate
 * the new reign chooses on its first morning, and the Reckoning that sums the reign up and sells
 * the next one. `heroDeckPrompt` lives here because the founding is its first
 * caller; `prompts/court.ts` draws the same deck for the summon and the Favor draft.
 *
 * The deck is the one prompt family that skips `promptScrollBody` — an `InkScrollArea` would eat
 * a vertical flick — so nothing it builds is registered in `activeScrollAreas`, and every object
 * it makes must be added to `self.modalLayer` or `releaseOverlay` never destroys it.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../game/constants';
import { codexProgress } from '../../../state/codex';
import { powerCardView } from '../../../systems/ascent/PowerDraftSystem';
import { heroChoiceCard } from '../../../ui/ascent/HeroChoiceCard';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { chronicleTally } from '../../../systems/story/StorySystem';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap } from '../../../ui/InkUI';
import { arrivalPreview } from '../../../data/heroArrivals';
import { sawtoothBand } from '../../../ui/ink/devices';
import { drawHouseSeal, houseBanner } from '../../../ui/ascent/houseBanner';
import { THRONE_HALL_HEIGHT, throneHallDiorama } from '../../../ui/ascent/throneHall';
import { CARD_STACK_PEEK, CardStack } from '../../../ui/ascent/CardStack';
import { CARD_ICON_SIZE, drawCardIcon, iconForOption } from '../../../ui/CardIcons';
import { addStoryPrint, powerStoryPrint } from '../../../ui/storyPrint';
import { staggerIn } from '../../../ui/animations';
import { captureScreen } from '../../../ui/captureScreen';
import { TITLE_FONT, UI_FONT } from '../../../ui/fonts';
import { heroName, t } from '../../../i18n';
import { DYNASTY_TRAITS_LIVE, DYNASTY_TRAITS_PENDING } from '../../../data/dynastyTraits';
import { dynastyHistory, dynastyProgress, dynastyProgressForXp, dynastyXpStep, getDynasty } from '../../../state/dynasty';
import { motionMs, reducedMotion } from '../../../game/lifeSettings';
import { cabinetCard, combineCost, getCabinet, meltValue, openingHand, recipeLearned } from '../../../state/cabinet';
import { findPowerCard } from '../../../data/ascentCards';
import { CardFan } from '../../../ui/ascent/CardFan';
import { dynastyFounderHero, reignFounderHero } from '../../../ui/dynastyPortrait';
import type { AscentPrompt, Hero } from '../../../state/types';
import { PROMPT_FOOTER_HEIGHT, PROMPT_HINT_ROOM, RARITY_COLOR, cssHex } from '../constants';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { soundDirector } from '../../../ui/sound/SoundDirector';

/**
 * The founding: the champion who raises the dynasty you rule, dealt as a hand you hold.
 *
 * Three heroes, one 390-wide screen. Three columns cannot carry a bio, and three full cards
 * do not fit down the page, so the older layout was a carousel with two arrows nobody pressed.
 * A deck fixes the same problem with the gesture a phone already teaches: the front card is
 * whole, the ones behind it are visibly still there, and the thumb decides.
 */
export function showFounder(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'founder' }>): void {
  const codex = codexProgress();
  const heroes = prompt.options
    .map((id) => self.state.heroDeck.find((candidate) => candidate.id === id))
    .filter((hero): hero is Hero => Boolean(hero));
  if (heroes.length === 0) {
    self.promptFrame(t('ascent.founder.title'), t('ascent.founder.subtitle'));
    return;
  }

  heroDeckPrompt(self, {
    title: t('ascent.founder.title'),
    subtitle: `${t('ascent.founder.subtitle')}
${t('ascent.codex.subtitle', codex)}`,
    heroes,
    noteFor: (hero) => arrivalPreview(hero) ?? t(`ascent.founder.gift.${hero.type}` as Parameters<typeof t>[0]),
    confirmLabel: t('ascent.founder.confirm'),
    onSelect: (hero) => self.choose(hero.id),
  });
}

/**
 * The court on the morning it changes hands: the hall, the empty seat, and your two standards.
 *
 * This was a single flag on bare paper, which said "here is a colour" and nothing else. The
 * screen it sits on is the one that announces a reign, so it now draws the place the reign
 * happens — roof, colonnade, steps, bronze urns, and nobody in the courtyard, because the
 * court has not been called yet. The flags stay, one at each side and named underneath: every
 * province the player takes will fly them, and this is still the cheapest place to teach a
 * colour the rest of the run depends on reading quickly.
 */
function addThroneHall(self: ConquestUIScene, parent: Phaser.GameObjects.Container, width: number, maxHeight = Infinity): number {
  // On a short surface — `GAME_HEIGHT` clamps to 620 in a desktop browser — the court plus the
  // three advantages overruns the sheet by about a dozen pixels, and the whole screen starts
  // scrolling for no gain. The diorama is the part that can afford to give: it is a picture,
  // not information. `maxHeight` is the room the rest of the page has left it, measured by
  // the caller, so the page never scrolls: the picture shrinks to fit, down to half size.
  const CAPTION_ROOM = 16 + 14 + 10;
  const fit = Number.isFinite(maxHeight) ? Math.max(0.5, Math.min(1, (maxHeight - CAPTION_ROOM) / THRONE_HALL_HEIGHT)) : 1;
  const scale = Math.min(GAME_HEIGHT < 700 ? 0.84 : 1, fit);
  const drawn = Math.round(THRONE_HALL_HEIGHT * scale);
  const hall = throneHallDiorama(self, width, self.state.mapConfig.seed);
  hall.setScale(scale).setPosition((width * (1 - scale)) / 2, 0);
  parent.add(hall);

  const band = self.add.graphics();
  sawtoothBand(band, 0, drawn + 4, width, 7, 0.5);
  parent.add(band);

  const caption = self.add.text(0, drawn + 16, t('ascent.founder.standard'), {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
    wordWrap: { width },
  }).setFixedSize(width, 0);
  parent.add(caption);
  return drawn + 16 + caption.height + 10;
}

/**
 * The reign's first card: you take the throne, and choose what it already holds.
 *
 * Three across rather than stacked, because these are three *different first moves* and the
 * player should see all three at once to compare them. At 390 wide that is ~109px a column,
 * which fits a glyph, a name and one line and nothing else — no rarity badge in particular,
 * since `BADGE_CLEARANCE` (86) would drive the title width negative.
 *
 * Built the way `actionTiles` builds a row: every text object first, one `Math.max` over their
 * heights, *then* the surfaces. Letting each card size itself independently gives a ragged row.
 */
export function showMandate(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'mandate' }>): void {
  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    t('ascent.mandate.title'),
    t('ascent.mandate.subtitle'),
    0,
  );

  const GAP = 8;
  const column = Math.floor((bodyWidth - GAP * 2) / 3);
  const titleY = 70;

  // Pass one: build the text, keep it, and remember the tallest.
  const built = prompt.options.map((cardId, index) => {
    const view = powerCardView(self.state, cardId);
    const x = index * (column + GAP);
    const title = self.ui.label(x + 10, titleY, view?.name ?? cardId, 'label', {
      fontSize: '11.5px', align: 'center', wordWrap: { width: column - 20 },
    }).setFixedSize(column - 20, 0);
    const desc = self.add.text(x + 10, 0, view?.description ?? '', {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
      wordWrap: { width: column - 20 },
    }).setFixedSize(column - 20, 0);
    return { cardId, x, title, desc };
  });
  const headHeight = titleY + Math.max(...built.map((b) => b.title.height)) + 6;
  const height = headHeight + Math.max(...built.map((b) => b.desc.height)) + 12;

  // The hands-on rule row, measured before the hall is drawn: the hall gets what the cards and the
  // row leave, so this page never scrolls — reported the moment the row was added.
  const note = self.ui.label(12, 0, t('ascent.mandate.hardcoreNote'), 'caption', { fontSize: '9px', wordWrap: { width: bodyWidth - 24 } });
  const ROW_H = 26 + note.height + 8;
  const top = addThroneHall(self, body, bodyWidth, content.height - (height + 14 + ROW_H + 16));

  // Pass two: surfaces behind the measured text, every column the same height.
  const cards = built.map(({ cardId, x, title, desc }) => {
    const card = self.add.container(x, top);
    title.setPosition(10, titleY);
    desc.setPosition(10, headHeight);
    const surface = self.ui.panel({ x: 0, y: 0, width: column, height },
      { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52 });
    card.add(surface);
    const wash = self.add.graphics();
    wash.fillStyle(INK_UI.gold, 0.09);
    wash.fillRoundedRect(2, 2, column - 4, height - 4, 8);
    card.add(wash);
    const print = addStoryPrint(self, card, powerStoryPrint(cardId),
      { x: 6, y: 8, width: column - 12, height: 56 });
    if (!print) {
      const glyph = drawCardIcon(self, iconForOption(cardId) ?? 'crown', INK_UI.gold);
      glyph.setPosition(column / 2, 36);
      card.add(glyph);
    }
    card.add(title);
    card.add(desc);
    const zone = self.add.zone(0, 0, column, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) return;
      // The opening boons are cards and are drawn here rather than by `optionCard`, so they
      // need the voice said out loud — this is the surface the silent-cards report opened on.
      soundDirector.card();
      self.choose(cardId);
    });
    card.add(zone);
    body.add(card);
    return card;
  });
  staggerIn(self, cards);

  // Hands-on rule (tự tay cai trị): the run with no cards the lanes could do for you, and no autopilot. A checkbox at
  // the foot of the first card of the reign, where the player decides how they will play it, and
  // again on the run menu, so it can be turned either way once the run is under way.
  const rowY = top + height + 14;
  note.setY(rowY + 26);
  body.add(self.ui.panel({ x: 0, y: rowY, width: bodyWidth, height: ROW_H }, { border: INK_UI.softBrush, fillAlpha: 0.5 }));
  const box = self.ui.label(12, rowY + 7, '', 'label', { fontSize: '11.5px' });
  const paint = (): void => {
    const on = Boolean(self.state.ascent?.hardcore);
    box.setText(`${on ? '☑' : '☐'}  ${t('ascent.mandate.hardcore')}`);
    box.setColor(on ? cssHex(INK_UI.cinnabar) : '#2a2118');
  };
  paint();
  body.add(box);
  body.add(note);
  body.add(self.ui.button({ x: 0, y: rowY, width: bodyWidth, height: ROW_H }, '', () => {
    if (self.state.ascent) self.state.ascent.hardcore = !self.state.ascent.hardcore;
    paint();
  }, { frameless: true }));
  finish(rowY + ROW_H + 16);
}

/**
 * Every "choose a champion out of a draw" screen in the mode: the founding, the summon, and
 * the court's presentation.
 *
 * One deck, flicked through with the thumb, plus buttons that do exactly what the gestures do —
 * the gestures are the fast path, never the only path, because a mouse has no thumb and a
 * player who has not read the hint still has to be able to finish the screen. Deliberately not
 * built on `promptScrollBody`: an `InkScrollArea` drives itself off the scene's pointer stream,
 * so a vertical flick would scroll the sheet *and* take the card.
 */
export function heroDeckPrompt(self: ConquestUIScene, opts: {
  title: string;
  subtitle: string;
  heroes: Hero[];
  badgeFor?: (hero: Hero) => string | undefined;
  noteFor?: (hero: Hero) => string | undefined;
  confirmLabel: string;
  ignoreLabel?: string;
  onSelect: (hero: Hero) => void;
  onIgnore?: () => void;
}): void {
  const content = self.promptFrame(opts.title, opts.subtitle);

  // Room for the footer buttons, the dots-and-hint strip, and the two cards fanned below.
  const HINT_STRIP = 38;
  const available = content.height - PROMPT_FOOTER_HEIGHT - HINT_STRIP - CARD_STACK_PEEK;
  const cardHeight = Phaser.Math.Clamp(available, 200, 390);
  // The fanned cards rotate a little, so the deck is inset from the content edges or their
  // corners clip through the screen's margin.
  const cardWidth = content.width - 12;
  const cardX = content.x + 6;
  const cardY = content.y + Math.max(0, Math.round((available - cardHeight) / 2));

  const cards = opts.heroes.map((hero) => heroChoiceCard(self, hero, cardWidth, cardHeight, {
    badge: opts.badgeFor?.(hero),
    note: opts.noteFor?.(hero),
  }));

  const stripY = cardY + cardHeight + CARD_STACK_PEEK + 8;

  // Which of them you are holding. Three cards deep, the fan alone does not say "of three".
  const dots = self.add.graphics();
  self.modalLayer.add(dots);
  const paintDots = (index: number): void => {
    dots.clear();
    const span = opts.heroes.length * 14;
    opts.heroes.forEach((_, i) => {
      dots.fillStyle(i === index ? INK_UI.cinnabar : INK_UI.softBrush, i === index ? 1 : 0.35);
      dots.fillCircle(GAME_WIDTH / 2 - span / 2 + 7 + i * 14, stripY + 4, i === index ? 4 : 3);
    });
  };

  const stack = new CardStack(self, {
    x: cardX,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    cards,
    onSelect: (index) => opts.onSelect(opts.heroes[index]),
    onBrowse: paintDots,
  });
  self.modalLayer.add(stack.view);
  paintDots(0);

  // How the deck works, said once, under it. A gesture nobody is told about is a gesture nobody
  // makes — the carousel this replaced had exactly that problem and answered it with arrows.
  self.modalLayer.add(self.add.text(GAME_WIDTH / 2, stripY + 14, t('ascent.pick.hint'), {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
    wordWrap: { width: content.width - 60 },
  }).setOrigin(0.5, 0));

  // The arrows stay, for the mouse and for the player who has not tried the flick yet.
  if (opts.heroes.length > 1) {
    const arrow = (x: number, step: number): void => {
      const glyph = drawCardIcon(self, 'retreat').setPosition(x, stripY + 23).setScale(20 / CARD_ICON_SIZE);
      if (step > 0) glyph.setScale(-20 / CARD_ICON_SIZE, 20 / CARD_ICON_SIZE);
      const hit = self.add.zone(x, stripY + 23, 32, 40).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => stack.browse(step));
      self.modalLayer.add([glyph, hit]);
    };
    arrow(content.x + 10, -1);
    arrow(content.x + content.width - 10, 1);
  }

  const footerY = GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8;
  if (opts.ignoreLabel && opts.onIgnore) {
    const gap = 10;
    const half = Math.floor((content.width - gap) / 2);
    self.modalLayer.add(self.ui.button(
      { x: content.x, y: footerY, width: half, height: 40 },
      opts.ignoreLabel,
      opts.onIgnore,
      { variant: 'ghost', fontSize: '13px' },
    ));
    self.modalLayer.add(self.ui.button(
      { x: content.x + half + gap, y: footerY, width: content.width - half - gap, height: 40 },
      opts.confirmLabel,
      () => stack.select(),
      { variant: 'primary', fontSize: '13px' },
    ));
    return;
  }
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: footerY, width: content.width, height: 40 },
    opts.confirmLabel,
    () => stack.select(),
    { variant: 'primary', fontSize: '14px' },
  ));
}

/**
 * The Reckoning, written as a **chiếu chỉ** — the edict a court promulgates when a reign closes.
 *
 * It was a stack of admin: a score plate, seven label-and-number rows, and a gold panel selling
 * the meta-shop. Correct, and nothing anyone would keep. This is the last thing a run says and
 * the only screen a player has any reason to show somebody else, so it is now the one page in
 * the game built to be *looked at*: the double rule and the sawtooth register the drum uses, the
 * decree line down the middle, and a seal pressed crooked in the corner the way a hand presses
 * one.
 *
 * **What it counts changed with it.** The old rows summed the realm — power, provinces, cards —
 * which is the state of a machine and not the story of a reign. A war is remembered by its dead,
 * and the numbers were already being spent and thrown away: `recordEngagement` now keeps them
 * (`battleReport`), so the edict can say how many of the enemy fell, how many of ours did, and
 * how many hosts were broken.
 *
 * **No Legacy panel.** It was the loudest thing on the page and it was an advertisement — a gold
 * border, a progress bar and a line about what is nearly affordable, on the screen commemorating
 * a dynasty that just ended. Legacy still banks exactly as before and the front page still spends
 * it; it is simply not what this page is for.
 *
 * **It can be kept.** `captureScreen` takes the frame and hands it to the share sheet, which on
 * a phone means Photos. The layout is deliberately fixed rather than scrolling for this reason —
 * a snapshot photographs what is on the glass, so a page that scrolls is a page that saves half
 * of itself.
 */
export function showRunOver(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'run-over' }>): void {
  const ascent = self.state.ascent;
  const score = self.state.campaignScore;
  const beatBest = prompt.score > prompt.previousBest;

  // The reign leads the subtitle when it has a name. The Reckoning previously said only how the
  // dynasty fell, so a run that legislated its way to the Hong Duc code closed on exactly the
  // same sentence as one that never passed a law — the two things it is most worth telling apart.
  const fall = prompt.cause === 'capital'
    ? t('ascent.over.causeCapital', { land: prompt.landName ?? '', waves: ascent?.wavesSurvived ?? 0 })
    : t('ascent.over.causeAnnihilated', { waves: ascent?.wavesSurvived ?? 0 });
  const content = self.promptFrame(
    prompt.reign ?? t('ascent.over.title'),
    prompt.reignDetail ? `${prompt.reignDetail}
${fall}` : fall,
  );

  // Every band on this page is paid for out of one budget, because the page must not scroll and
  // `GAME_HEIGHT` clamps as low as 620 — where the frame above has already spent most of it on a
  // two-line reign name. It is a *document*: a decree that stops two thirds of the way down with a
  // drift of blank paper under it is a form, not an edict, so the slack — nothing at 620, two
  // hundred points at 1040 — is spent on the plate, the tiles and the air between the bands.
  // `tight` is the one hard branch: at the clamp the shelf line goes and the tiles drop to 38.
  // Keep (40) + air + Go again (46) + air + Back to the menu (28).
  //
  // The Codex used to take half of that last row and the return took the other half at the same
  // 40. Two faults: the Codex is a *collection* screen and this page is the one moment a run has
  // to say what the reign did, so a list of things not yet unlocked was competing with the
  // Reckoning for the foot of the page; and the way out of the run was drawn at the same weight
  // as the way back into it. The return is now one quiet full-width rule under the two controls
  // that matter, which also hands 12 points back to the ledger above.
  const BUTTONS = 40 + 8 + 46 + 8 + 28;
  const FLOOR = 92 + 10 + 3 * 38 + 2 * 8 + 10 + 12 + BUTTONS;
  const tight = content.height < FLOOR + 34;
  const slack = Math.max(0, content.height - (FLOOR + (tight ? 0 : 34)));
  const plateH = 92 + Math.min(38, Math.round(slack * 0.26));
  const shelfH = tight ? 0 : 34;
  // The controls take the foot and never move; everything above is measured back from them.
  const buttonY = content.y + content.height - BUTTONS - 2;
  const air = Math.min(20, Math.max(6, Math.round(slack * 0.12)));
  /**
   * The tiles are what *fills* the page, so their height is derived from the room left rather
   * than picked and then padded around. Clamped both ways: 38 is the floor at the 620 clamp, and
   * past 78 a six-tile grid stops reading as a ledger and starts reading as six buttons.
   */
  const gridRoom = buttonY - (content.y + plateH + 10 + air) - air - shelfH - 10;
  const tileH = Math.max(38, Math.min(78, Math.floor((gridRoom - 16) / 3)));

  // ── The edict plate ─────────────────────────────────────────────────────
  const plate = self.add.graphics();
  self.modalLayer.add(plate);
  // Two rules, the outer heavy and the inner hairline, with the drum's sawtooth between them at
  // the head. This is the register the whole game's chrome is drawn in — see `devices.ts` — and
  // it is the difference between a panel and a document.
  plate.fillStyle(INK_UI.parchment, 0.96);
  plate.fillRect(content.x, content.y, content.width, plateH);
  plate.lineStyle(2.2, beatBest ? INK_UI.gold : INK_UI.brush, 0.95);
  plate.strokeRect(content.x, content.y, content.width, plateH);
  plate.lineStyle(0.9, INK_UI.brush, 0.5);
  plate.strokeRect(content.x + 4, content.y + 4, content.width - 8, plateH - 8);
  sawtoothBand(plate, content.x + 8, content.y + 8, content.width - 16, 5, 0.5);

  const edict = self.add.text(content.x + 14, content.y + 20, t('ascent.over.edict'), {
    color: cssHex(INK_UI.cinnabarDark),
    fontFamily: TITLE_FONT,
    fontSize: '13px',
    fontStyle: '700',
  });
  edict.setLetterSpacing?.(2.4);
  self.modalLayer.add(edict);

  // A hand-ruled line under the head, the way a decree separates its formula from its substance.
  plate.lineStyle(0.9, INK_UI.brush, 0.35);
  plate.lineBetween(content.x + 14, content.y + 36, content.x + content.width - 14, content.y + 36);

  const scoreY = content.y + 36 + Math.max(6, Math.round((plateH - 36 - 48) / 2));
  self.modalLayer.add(self.ui.label(content.x + 14, scoreY,
    beatBest ? t('ascent.over.newBest') : t('ascent.over.scoreLabel'), 'caption', { fontSize: '10px' }));
  self.modalLayer.add(self.ui.label(content.x + 14, scoreY + 12,
    prompt.score.toLocaleString('en-US'), 'label', { fontSize: '32px' }));
  self.modalLayer.add(self.ui.label(content.x + content.width - 64, scoreY + 24,
    t('ascent.over.best', { best: Math.max(prompt.previousBest, prompt.score).toLocaleString('en-US') }),
    'caption', { align: 'right', fontSize: '10px' }).setOrigin(1, 0));

  // Pressed, not printed: the seal rides the corner and overhangs the rule, because that is what
  // a seal does to a document and it is the one mark on the page that says somebody signed this.
  const stamp = drawHouseSeal(self, houseBanner(), 46)
    .setPosition(content.x + content.width - 32, content.y + plateH - 32);
  self.modalLayer.add(stamp);

  // ── The ledger: what the reign spent and what it took ───────────────────
  const gridY = content.y + plateH + 10 + air;
  const colW = (content.width - 8) / 2;
  const tiles: Array<[string, string, number]> = [
    [t('ascent.over.waves'), String(ascent?.wavesSurvived ?? 0), INK_UI.gold],
    // The two headline numbers this page exists to add. Both were spent by every fight in the
    // run and neither was ever added up until `recordEngagement`.
    [t('ascent.over.slain'), (score?.enemySoldiersSlain ?? 0).toLocaleString('en-US'), INK_UI.cinnabar],
    [t('ascent.over.hostsBroken'), String(score?.armiesDefeated ?? 0), INK_UI.cinnabar],
    [t('ascent.over.ourDead'), (score?.ownSoldiersLost ?? 0).toLocaleString('en-US'), INK_UI.softBrush],
    [t('ascent.over.peakPower'), Math.round(ascent?.peakPower ?? 0).toLocaleString('en-US'), INK_UI.jade],
    [t('ascent.over.lands'), String(score?.peakLandsHeld ?? 0), INK_UI.jade],
  ];
  tiles.forEach(([label, value, accent], index) => {
    const x = content.x + (index % 2) * (colW + 8);
    const y = gridY + Math.floor(index / 2) * (tileH + 8);
    self.modalLayer.add(self.ui.panel({ x, y, width: colW, height: tileH },
      { border: INK_UI.softBrush, fillAlpha: 0.5 }));
    // A hairline of the tile's own ink down its left edge — the same rule the option cards use
    // to say what class a row belongs to, at a sixth of the width.
    const edge = self.add.graphics();
    edge.fillStyle(accent, 0.9);
    edge.fillRect(x + 1.5, y + 5, 2.5, tileH - 10);
    self.modalLayer.add(edge);
    // The caption sits on the tile's head and the figure on its foot, so the pair reads as a
    // ledger entry at any height the grid takes. Both offsets are `tight`-aware: at the 38-point
    // floor a 9px caption and a 20px figure are 33 points of type in a 38-point box, and the
    // caption printed straight through the number.
    self.modalLayer.add(self.ui.label(x + 12, y + (tight ? 4 : 7), label, 'caption',
      { fontSize: tight ? '8px' : '9px' }));
    self.modalLayer.add(self.ui.label(x + 12, y + tileH - (tight ? 21 : 28), value, 'label',
      { fontSize: tight ? '15px' : '20px' }));
  });
  let cursor = gridY + 3 * (tileH + 8) - 8 + air;

  // ── The shelf, in one line ──────────────────────────────────────────────
  // Champions, powers and stories were three rows of a table each; they are counts, not a
  // reckoning, and they belong under the ledger rather than in it.
  if (!tight) {
    const storyTally = chronicleTally(self.state);
    const endings = storyTally['chinh-su'] + storyTally['da-su'] + storyTally['ngoai-truyen'];
    const cards = Object.values(ascent?.cardStacks ?? {}).reduce((a, b) => a + b, 0);
    self.modalLayer.add(self.ui.label(content.x + content.width / 2, cursor,
      t('ascent.over.shelf', { heroes: ascent?.heroesSummoned ?? 0, cards, stories: endings }),
      'caption', { fontSize: '10px', align: 'center', wordWrap: { width: content.width - 8 } })
      .setOrigin(0.5, 0));
    cursor += 16;

    // The dead this reign put up a shrine to, by name. `state.memorials` is not the Chronicle's
    // sixty-entry ring and is never evicted — a shrine the record forgets is not a shrine. It is
    // the one line here whose height nothing bounds (a long reign enshrines several names and it
    // wraps), so it is only printed when there is room above the controls for it to wrap into.
    const named = (self.state.memorials ?? []).map((entry) => entry.name).filter(Boolean);
    if (named.length > 0 && cursor + 24 < buttonY) {
      const line = self.ui.label(content.x + content.width / 2, cursor,
        t('ascent.over.enshrined', { names: named.join(' · ') }), 'caption',
        { fontSize: '9px', align: 'center', wordWrap: { width: content.width - 8 } })
        .setOrigin(0.5, 0);
      self.modalLayer.add(line);
      cursor += line.height + 4;
    }
  }

  // ── Keep it, then go again ──────────────────────────────────────────────
  const keep = self.ui.button(
    { x: content.x, y: buttonY, width: content.width, height: 40 },
    t('ascent.over.keep'),
    () => {
      // The label is the whole feedback channel: there is no toast on this screen and a share
      // sheet that is still opening looks exactly like a button that did nothing.
      const face = keep.list.find((part): part is Phaser.GameObjects.Text => (
        part instanceof Phaser.GameObjects.Text));
      face?.setText(t('ascent.over.keeping'));
      /**
       * The picture is the edict, not the buttons under it.
       *
       * `captureScreen` photographed the whole frame, so what reached the player's camera roll was
       * a decree with three controls and a half-pressed *Đang đóng ấn…* along the bottom of it —
       * the one thing on the page that is chrome rather than record. Reported as: *game result
       * capture image must not included buttons*.
       *
       * Cropped rather than hidden, because hiding leaves the document floating over a third of a
       * page of blank parchment. `buttonY` is already the line the layout measures the controls
       * back from, so it is exactly the bottom of the document by construction.
       */
      void captureScreen(self.game, prompt.reign ?? t('ascent.over.title'), buttonY - 4)
        .then((result) => {
          face?.setText(t(result === 'failed' ? 'ascent.over.keepFailed' : 'ascent.over.kept'));
        });
    },
    { fontSize: '13px' },
  );
  self.modalLayer.add(keep);

  // "Go again" walks the ceremony rather than restarting.
  //
  // The Reckoning is step one of a chain — the house grows, then the next reign is shown what it
  // carries — and the scene decides how far along that chain it has got. When nothing is left to
  // show (no level earned, the closing screen already seen) the same event starts the run, so a
  // player who has never levelled sees exactly the button they saw before.
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: buttonY + 48, width: content.width, height: 46 },
    t('ascent.over.again'),
    () => self.events.emit('ui:ascent-ceremony'),
    { variant: 'primary', fontSize: '15px' },
  ));
  // The way out, said quietly. `ghost` rather than a second panelled button: leaving is not one of
  // the two things this page is for, and drawn at the same weight as "go again" it read as one.
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: buttonY + 102, width: content.width, height: 28 },
    t('ascent.over.return'),
    () => self.events.emit('ui:exit-to-menu'),
    { variant: 'ghost', fontSize: '12px' },
  ));
}

/**
 * A level's progress, drawn as one filled rule.
 *
 * Deliberately not a component: it is two rectangles, it exists on exactly the two ceremony
 * screens, and an `InkUI` bar would have to grow a variant for the one place that wants the
 * gold fill full rather than proportional.
 */
function xpBar(
  self: ConquestUIScene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  width: number,
  fill: number,
): void {
  const bar = self.add.graphics();
  bar.fillStyle(INK_UI.softBrush, 0.28);
  bar.fillRoundedRect(x, y, width, 7, 3.5);
  bar.fillStyle(INK_UI.gold, 0.92);
  bar.fillRoundedRect(x, y, Math.max(4, width * Math.min(1, Math.max(0, fill))), 7, 3.5);
  parent.add(bar);
}

/**
 * The reign-end sequence: a scripted passage of beats, each one tween on one object.
 *
 * Kept as a list rather than a chain of callbacks so three things are possible that a chain
 * makes hard: a **cut** (the skip, from the second reign on) that lands every beat on its end
 * state at once; a **teardown** that ends every timer and tween the moment the sheet is
 * destroyed, so nothing writes to a dead Text; and a **log** the harness reads to prove the beats
 * ran in order, one at a time, inside the budget. `at` and `duration` are already through
 * `motionMs`, so the reduced-motion setting shortens the whole passage by construction.
 */
interface CeremonyBeat {
  name: string;
  at: number;
  duration: number;
  start: () => void;
  end: () => void;
  started?: boolean;
  ended?: boolean;
}

export class CeremonySequence {
  readonly beats: CeremonyBeat[] = [];
  /** Each beat as it played: measured start and end on the scene clock, and the planned duration. */
  readonly log: Array<{ name: string; start: number; end: number; planned: number }> = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private t0 = 0;
  /** True once every beat has ended, by clock or by cut. */
  done = false;
  /** True when the passage was cut short by a tap. */
  cutShort = false;
  onDone?: () => void;
  /** The bar's start and end, in level units, so a gate can prove it starts below where it ends. */
  bar?: { from: number; to: number };
  /** Level ticks played, so a gate can count one per level crossed. */
  ticks = 0;

  constructor(private readonly scene: Phaser.Scene, owner: Phaser.GameObjects.GameObject) {
    owner.once(Phaser.GameObjects.Events.DESTROY, () => this.dispose());
  }

  add(beat: CeremonyBeat): void {
    this.beats.push(beat);
  }

  /** A tween owned by the passage: killed on cut and on teardown. */
  tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
    const tween = this.scene.tweens.add(config);
    this.tweens.push(tween);
    return tween;
  }

  elapsed(): number {
    return this.scene.time.now - this.t0;
  }

  /**
   * Plays the beats **in a chain**: each one starts when the one before it has ended, after
   * whatever gap the plan left between them. Absolute timers looked equivalent and were not — a
   * frame's slack at the first beat let the second start before the first had finished, which is
   * the one thing the passage promises never to do.
   */
  play(): void {
    this.t0 = this.scene.time.now;
    this.runFrom(0);
  }

  private runFrom(index: number): void {
    if (this.done) return;
    if (index >= this.beats.length) {
      this.settle();
      return;
    }
    const beat = this.beats[index];
    const previous = this.beats[index - 1];
    const gap = previous ? Math.max(0, beat.at - (previous.at + previous.duration)) : beat.at;
    this.timers.push(this.scene.time.delayedCall(gap, () => {
      if (beat.started || this.done) return;
      beat.started = true;
      const entry = { name: beat.name, start: this.elapsed(), end: this.elapsed() + beat.duration, planned: beat.duration };
      this.log.push(entry);
      beat.start();
      this.timers.push(this.scene.time.delayedCall(beat.duration, () => {
        if (beat.ended || this.done) return;
        beat.ended = true;
        beat.end();
        entry.end = this.elapsed();
        this.runFrom(index + 1);
      }));
    }));
  }

  /** Lands every beat on its end state now. The skip is a cut, not a fast-forward. */
  cut(): void {
    if (this.done) return;
    this.cutShort = true;
    for (const timer of this.timers) timer.remove(false);
    this.timers.length = 0;
    for (const tween of this.tweens) tween.stop();
    this.tweens.length = 0;
    const now = this.elapsed();
    for (const beat of this.beats) {
      if (!beat.started) this.log.push({ name: beat.name, start: now, end: now, planned: 0 });
      beat.started = true;
      if (!beat.ended) {
        beat.ended = true;
        beat.end();
      }
    }
    this.settle();
  }

  private settle(): void {
    if (this.done || this.beats.some((beat) => !beat.ended)) return;
    this.done = true;
    this.onDone?.();
  }

  private dispose(): void {
    this.done = true;
    for (const timer of this.timers) timer.remove(false);
    for (const tween of this.tweens) tween.stop();
    this.timers.length = 0;
    this.tweens.length = 0;
  }
}

/** Which reign the ceremony has already poured for, so a second level card in one chain opens at rest. */
let pouredCeremonyReign = -1;

/** Test hook: forget the pour, so a harness can play the passage again on the same reign. */
export function resetCeremonyPour(): void {
  pouredCeremonyReign = -1;
}

/** The system each trait belongs to — the tag on its offer card. */
const TRAIT_SYSTEM: Record<string, 'draft' | 'muster' | 'founding' | 'court' | 'trade' | 'cabinet'> = {
  'wide-draft': 'draft',
  'first-reroll-free': 'draft',
  'second-founder': 'founding',
  'twin-doctrine': 'court',
  'quartermaster': 'muster',
  'old-roads': 'trade',
  'deep-shelf': 'cabinet',
  'long-memory': 'court',
};

function traitName(id: string): string {
  return t(`dynasty.trait.${id}` as Parameters<typeof t>[0]);
}

function traitText(id: string, part: 'd' | 'delta' | 'when'): string {
  return t(`dynasty.trait.${id}.${part}` as Parameters<typeof t>[0]);
}

/**
 * The house grows: the score is seen to go somewhere, the level is seen to tick, the reign is
 * seen to join the line, and the choice is seen to land.
 *
 * Step two of the ceremony, and it fires **while the run's memory is still warm** — that is the
 * whole reason it sits here rather than on the menu. Before this pass it was a card with a full
 * bar: correct, and it showed nothing happening. The passage is 8.6 s at full motion, one beat at
 * a time — count-up, bank, pour with the level tick, the reign card joining the line, the offers
 * fanning in — and from the second reign any tap cuts to the choice. The first reign plays in full
 * because it is the tutorial. A second level card in the same chain opens at rest: the pour has
 * already been watched.
 *
 * No footer and no way past it, exactly like the mandate card: a level-up the player can dismiss
 * is a level-up they will dismiss by accident and then be unable to find again.
 */
export function showDynastyLevel(
  self: ConquestUIScene,
  prompt: Extract<AscentPrompt, { kind: 'dynasty-level' }>,
): void {
  const store = getDynasty();
  const firstReign = store.reigns <= 1;
  const play = pouredCeremonyReign !== store.reigns;
  pouredCeremonyReign = store.reigns;
  const reduced = reducedMotion();

  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    t('dynasty.grows.title'),
    // The first ceremony says the one sentence the empty ledger says; after that, the score.
    firstReign ? t('dynasty.emptyBody') : t('dynasty.grows.subtitle', { score: prompt.score.toLocaleString('en-US') }),
    PROMPT_HINT_ROOM + 20,
  );
  const seq = new CeremonySequence(self, body);
  self.data.set('ceremony', seq);

  let cursor = 4;

  // ── The head: whose house, and the score about to be poured ──
  const founder = dynastyFounderHero(store);
  if (founder) {
    body.add(renderHeroFaceInBox(self, founder, { x: 0, y: cursor, width: 46, height: 46 }));
  }
  const textX = founder ? 56 : 0;
  body.add(self.ui.label(textX, cursor + 4, store.house
    ? t('dynasty.house', { name: store.house })
    : t('dynasty.houseUnnamed'), 'label', { fontSize: '13px' }));
  body.add(self.ui.label(textX, cursor + 22, t('dynasty.reignOrdinal', { n: store.reigns }), 'caption',
    { fontSize: '10px' }));
  // The score, large, at the right of the head: it counts up, then slides into the bar.
  const scoreText = self.add.text(bodyWidth, cursor + 6, '', {
    color: cssHex(INK_UI.gold), fontFamily: TITLE_FONT, fontSize: '24px', fontStyle: '700', align: 'right',
  }).setOrigin(1, 0);
  body.add(scoreText);
  cursor += 54;

  // ── The bar: from where the house stood to where the reign leaves it ──
  const progress = dynastyProgress(store);
  const before = play ? dynastyProgressForXp(Math.max(0, store.xp - prompt.score)) : { level: store.level, ...progress };
  const vFrom = before.level + Math.min(1, before.into / Math.max(1, before.need));
  const vTo = store.level + Math.min(1, progress.into / Math.max(1, progress.need));
  const BAR_Y = cursor + 18;
  const levelLabel = self.ui.label(0, cursor, t('dynasty.subLevel', { level: before.level }), 'label',
    { fontSize: '12px', color: cssHex(INK_UI.gold) }).setOrigin(0, 0);
  body.add(levelLabel);
  const shortLabel = self.ui.label(bodyWidth, cursor + 2, '', 'caption', { fontSize: '10px', align: 'right' }).setOrigin(1, 0);
  body.add(shortLabel);
  const bar = self.add.graphics();
  body.add(bar);
  const banked = self.ui.label(bodyWidth, BAR_Y + 12, t('dynasty.grows.banked', { score: prompt.score.toLocaleString('en-US') }),
    'caption', { fontSize: '9.5px', color: '#a4402c', align: 'right' }).setOrigin(1, 0).setAlpha(0);
  body.add(banked);
  let shownLevel = before.level;
  const paintBar = (v: number): void => {
    const level = Math.floor(v);
    const fill = Math.min(1, v - level);
    const oldFill = level === before.level ? vFrom - before.level : 0;
    bar.clear();
    bar.fillStyle(INK_UI.softBrush, 0.28);
    bar.fillRoundedRect(0, BAR_Y, bodyWidth, 8, 4);
    // The old fill stays gold; the poured segment is cinnabar, so the delta is a thing seen.
    bar.fillStyle(INK_UI.gold, 0.92);
    bar.fillRoundedRect(0, BAR_Y, Math.max(4, bodyWidth * Math.min(fill, oldFill)), 8, 4);
    if (fill > oldFill) {
      bar.fillStyle(INK_UI.cinnabar, 0.9);
      bar.fillRoundedRect(bodyWidth * oldFill, BAR_Y, Math.max(3, bodyWidth * (fill - oldFill)), 8, 4);
    }
    // The old mark stays as a tick.
    if (oldFill > 0 && oldFill < 1) {
      bar.fillStyle(INK_UI.brush, 0.8);
      bar.fillRect(bodyWidth * oldFill - 0.75, BAR_Y - 3, 1.5, 14);
    }
    const need = dynastyXpStep(level + 1);
    shortLabel.setText(t('dynasty.page.toNext', {
      short: Math.max(0, Math.round(need * (1 - fill))).toLocaleString('en-US'),
      next: level + 1,
    }));
    if (level !== shownLevel) {
      shownLevel = level;
      levelLabel.setText(t('dynasty.subLevel', { level }));
    }
  };
  /** The level tick: the numeral punches, a ring sweeps off it, the paper flashes, the seal sounds. */
  const punchLevel = (): void => {
    seq.ticks += 1;
    seq.log.push({ name: 'tick', start: seq.elapsed(), end: seq.elapsed() + motionMs(260), planned: motionMs(260) });
    levelLabel.setScale(1.5);
    seq.tween({ targets: levelLabel, scale: 1, duration: motionMs(260), ease: 'Back.easeOut' });
    const ring = self.add.graphics({ x: levelLabel.width / 2, y: cursor + levelLabel.height / 2 });
    ring.lineStyle(2, INK_UI.gold, 0.9);
    ring.strokeCircle(0, 0, 14);
    body.add(ring);
    seq.tween({ targets: ring, alpha: 0, scale: 2, duration: motionMs(520), ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const flash = self.add.rectangle(0, BAR_Y - 2, bodyWidth, 12, 0xffffff, 0.55).setOrigin(0, 0);
    body.add(flash);
    seq.tween({ targets: flash, alpha: 0, duration: motionMs(120), onComplete: () => flash.destroy() });
    soundDirector.card();
  };
  cursor += 42;

  // ── The reign card: this reign, as the last card of the lineage ──
  const record = dynastyHistory(store)[dynastyHistory(store).length - 1];
  const reignCard = self.add.container(0, cursor);
  body.add(reignCard);
  let reignFace: Phaser.GameObjects.Container | undefined;
  {
    const REIGN_H = 50;
    reignCard.add(self.ui.panel({ x: 0, y: 0, width: bodyWidth, height: REIGN_H }, { border: INK_UI.gold, fillAlpha: 0.55 }));
    const reignHero = record?.founder ? reignFounderHero(record.founder, store.level) : undefined;
    const textX = reignHero ? 52 : 12;
    if (reignHero) {
      reignFace = renderHeroFaceInBox(self, reignHero, { x: 8, y: 7, width: 36, height: 36 });
      reignCard.add(reignFace);
    }
    reignCard.add(self.ui.label(textX, 8, `${t('dynasty.page.reign', { n: store.reigns })} · ${prompt.score.toLocaleString('en-US')}`,
      'label', { fontSize: '12px' }));
    const epitaph = record
      ? [
        t('dynasty.page.epitaph', {
          waves: record.waves, lands: record.lands,
          ending: t(record.ending === 'collapse' ? 'dynasty.page.ending.collapse' : 'dynasty.page.ending.conquest'),
        }),
        record.fight ? t('dynasty.page.fight', {
          land: record.fight.land, n: record.fight.theirStart.toLocaleString('en-US'),
          result: t(record.fight.won ? 'dynasty.page.won' : 'dynasty.page.lost'),
        }) : '',
      ].filter(Boolean).join(' · ')
      : '';
    reignCard.add(self.ui.label(textX, 26, epitaph, 'caption', { fontSize: '9.5px', wordWrap: { width: bodyWidth - textX - 12 }, maxLines: 2 }));
    cursor += REIGN_H + 12;
  }

  // ── The fork ──
  body.add(self.ui.label(0, cursor, t('dynasty.grows.level', { level: prompt.level }), 'label',
    { fontSize: '12px', color: cssHex(INK_UI.gold) }));
  cursor += 20;

  const held = store.traits.filter((id) => !DYNASTY_TRAITS_PENDING.has(id));
  const cards: Phaser.GameObjects.Container[] = [];
  let chosen = false;
  const heldStripY = { y: 0 };
  prompt.options.forEach((traitId) => {
    const card = self.optionCard(
      { x: 0, y: cursor, width: bodyWidth, height: 72 },
      {
        title: traitName(traitId),
        badge: t(`dynasty.system.${TRAIT_SYSTEM[traitId] ?? 'court'}` as Parameters<typeof t>[0]),
        // Three lines in the trait's own units: the effect, what changes, when it applies.
        body: `${traitText(traitId, 'd')}\n${traitText(traitId, 'delta')}\n${t('dynasty.grows.when', { when: traitText(traitId, 'when') })}`,
        accent: INK_UI.gold,
        washAlpha: 0.08,
        parent: body,
        holdMs: 450,
        onTap: () => {
          if (chosen) return;
          chosen = true;
          // The chosen card lifts and hangs into the held list; the other fades. Then the choice.
          const rise = motionMs(500);
          cards.forEach((other) => {
            if (other !== card) self.tweens.add({ targets: other, alpha: 0.25, duration: motionMs(200) });
          });
          self.tweens.add({ targets: card, y: card.y - 6, duration: motionMs(120), ease: 'Sine.easeOut' });
          self.tweens.add({
            targets: card, y: heldStripY.y, scale: 0.92, alpha: 0.7, delay: motionMs(120), duration: rise, ease: 'Cubic.easeInOut',
            onComplete: () => self.choose(traitId),
          });
        },
      },
    );
    cards.push(card);
    cursor += ((card.getData('cardHeight') as number) ?? 72) + 9;
  });
  // The hint where the thumb is, not at the foot of the sheet.
  const hint = self.ui.label(bodyWidth / 2, cursor, t('dynasty.grows.hold'), 'caption',
    { fontSize: '10px', color: cssHex(INK_UI.jade), align: 'center' }).setOrigin(0.5, 0);
  body.add(hint);
  cursor += 20;

  // ── What the house already holds, so the fork is read against the build ──
  heldStripY.y = cursor;
  if (held.length > 0) {
    body.add(self.ui.label(0, cursor, t('dynasty.grows.held'), 'caption', { fontSize: '9.5px' }));
    cursor += 13;
    for (const id of held) {
      const line = self.ui.label(0, cursor, `${traitName(id)} — ${traitText(id, 'delta')}`, 'caption',
        { fontSize: '10px', color: '#1c6b58', wordWrap: { width: bodyWidth } });
      body.add(line);
      cursor += line.height + 2;
    }
    cursor += 6;
  }
  // The remainder as one line, not a card: a card the player can hold that then does nothing is
  // worse than no row at all.
  const untaken = DYNASTY_TRAITS_LIVE.length - held.length - prompt.options.length;
  if (untaken > 0) {
    const scarce = self.ui.label(0, cursor, t('dynasty.grows.scarce', { n: untaken }), 'caption',
      { fontSize: '9.5px', wordWrap: { width: bodyWidth } });
    body.add(scarce);
    cursor += scarce.height + 4;
  }
  if (prompt.remaining > 0) {
    body.add(self.ui.label(0, cursor, t('dynasty.grows.more', { n: prompt.remaining }), 'caption',
      { fontSize: '10px', color: cssHex(INK_UI.jade), wordWrap: { width: bodyWidth } }));
    cursor += 18;
  }
  // Our hint sits under the cards; the frame's own foot hint would say it twice.
  self.promptUsedHoldCards = false;
  finish(cursor);

  // ── The beats ──
  const counter = { v: 0 };
  const showScore = (value: number) => scoreText.setText(Math.round(value).toLocaleString('en-US'));
  seq.add({
    name: 'count', at: 0, duration: motionMs(1200),
    start: () => {
      showScore(0);
      seq.tween({ targets: counter, v: prompt.score, duration: motionMs(1200), ease: 'Cubic.easeOut', onUpdate: () => showScore(counter.v) });
    },
    end: () => showScore(prompt.score),
  });
  seq.add({
    name: 'bank', at: motionMs(1200), duration: motionMs(400),
    start: () => {
      seq.tween({ targets: scoreText, y: BAR_Y - 2, scale: 0.45, alpha: 0.2, duration: motionMs(400), ease: 'Cubic.easeIn' });
    },
    end: () => {
      scoreText.setAlpha(0);
      banked.setAlpha(1);
    },
  });
  const pour = { v: vFrom };
  const pourMs = reduced ? 0 : motionMs(1400);
  seq.add({
    name: 'pour', at: motionMs(1600), duration: pourMs,
    start: () => {
      if (pourMs <= 0) return;
      let lastLevel = Math.floor(vFrom);
      seq.tween({
        targets: pour, v: vTo, duration: pourMs, ease: 'Cubic.easeOut',
        onUpdate: () => {
          paintBar(pour.v);
          const level = Math.floor(pour.v);
          if (level > lastLevel) {
            lastLevel = level;
            punchLevel();
          }
        },
      });
    },
    end: () => {
      paintBar(vTo);
      // A cut, or reduced motion, still owes one tick for every level crossed.
      while (seq.ticks < Math.floor(vTo) - Math.floor(vFrom)) punchLevel();
    },
  });
  seq.bar = { from: vFrom, to: vTo };
  const reignRest = reignCard.x;
  seq.add({
    name: 'reign', at: motionMs(3000), duration: motionMs(600),
    start: () => {
      reignCard.setX(bodyWidth + 30);
      seq.tween({ targets: reignCard, x: reignRest, duration: motionMs(600), ease: 'Cubic.easeOut' });
      if (reignFace) {
        // The portrait sets in after the card has landed — the punch, at the face's own size.
        const faceScale = reignFace.scale;
        reignFace.setAlpha(0).setScale(faceScale * 0.6);
        seq.tween({ targets: reignFace, alpha: 1, scale: faceScale, delay: motionMs(180), duration: motionMs(260), ease: 'Back.easeOut' });
      }
    },
    end: () => {
      reignCard.setX(reignRest);
      if (reignFace) {
        self.tweens.killTweensOf(reignFace);
        reignFace.setAlpha(1);
      }
    },
  });
  const restY = cards.map((card) => card.y);
  seq.add({
    name: 'offers', at: motionMs(3600), duration: motionMs(600),
    start: () => staggerIn(self, cards, { staggerMs: motionMs(120), duration: motionMs(300) }),
    end: () => {
      cards.forEach((card, index) => {
        self.tweens.killTweensOf(card);
        card.setY(restY[index]).setAlpha(1);
      });
      hint.setAlpha(1);
    },
  });

  if (play) {
    // Before the passage: the score at nothing, the bar where the house stood, the reign card and
    // the offers off the page — every beat starts from a state the previous one leaves.
    showScore(0);
    paintBar(vFrom);
    reignCard.setX(bodyWidth + 30);
    cards.forEach((card) => card.setAlpha(0));
    hint.setAlpha(0);
    // From the second reign a tap anywhere on the sheet cuts to the choice.
    if (!firstReign) {
      const skip = self.add.zone(content.x, content.y, content.width, content.height).setOrigin(0, 0).setInteractive();
      skip.on('pointerup', () => {
        seq.cut();
        skip.destroy();
      });
      self.modalLayer.add(skip);
      seq.onDone = () => { if (skip.active) skip.destroy(); };
      const skipHint = self.add.text(GAME_WIDTH / 2, content.y + content.height - 6, t('dynasty.grows.skip'), {
        color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', align: 'center',
      }).setOrigin(0.5, 1).setAlpha(0.8);
      self.modalLayer.add(skipHint);
      skip.once(Phaser.GameObjects.Events.DESTROY, () => { if (skipHint.active) skipHint.destroy(); });
    }
    seq.play();
  } else {
    seq.cut();
    seq.cutShort = false;
  }
}

/**
 * Bind a seal — step three of the ceremony, between the house growing and the closing screen.
 *
 * The three cards fanned out are cards this reign actually **played**, not random loot: the one
 * the player binds is the one they have a story about. The chosen card lands in the Cabinet of
 * Seals as copy-or-new; binding the evolution also teaches the forge its recipe. Like the
 * dynasty-level card there is no way past it — a ceremony step that can be dismissed is a step
 * that gets dismissed by accident and cannot be found again.
 */
export function showBindCard(
  self: ConquestUIScene,
  prompt: Extract<AscentPrompt, { kind: 'bind-card' }>,
): void {
  const content = self.promptFrame(t('ascent.bind.title'), t('ascent.bind.subtitle'));

  const BUTTON = 46;
  const buttonY = content.y + content.height - BUTTON - 2;
  // The same two lanes the draft keeps above its fan: the take-pill's, and the hint's above it.
  const HINT_Y_ABOVE_FAN = 70;
  const LANES = HINT_Y_ABOVE_FAN + 8;
  const fanHeight = Phaser.Math.Clamp(Math.round(content.height * 0.52), 180, 240);
  const fanTop = buttonY - 10 - fanHeight;
  // Capped for the same reason the draft's readout is: the outcome is three lines, not a page.
  const infoHeight = Math.min(fanTop - content.y - LANES, 150);

  const info = self.add.container(content.x, content.y);
  self.modalLayer.add(info);

  // What binding this card does to the cabinet, previewed without making the add.
  const describe = (index: number): void => {
    info.removeAll(true);
    const cardId = prompt.options[index];
    const card = findPowerCard(cardId);
    const view = powerCardView(self.state, cardId);
    const held = cabinetCard(cardId);
    const rarity = card?.rarity ?? 'bronze';

    info.add(self.ui.panel({ x: 0, y: 0, width: content.width, height: infoHeight },
      { border: RARITY_COLOR[rarity], borderWidth: 1.4, fillAlpha: 0.55 }));
    let cursor = 10;
    const title = self.ui.label(14, cursor, view?.name ?? cardId, 'label',
      { fontSize: '13px', wordWrap: { width: content.width - 28 } });
    info.add(title);
    cursor += title.height + 4;

    const outcome = !held
      ? t('ascent.bind.new')
      : held.level >= 3
        ? t('ascent.bind.melted', { n: meltValue(rarity) })
        : held.copies + 1 >= combineCost(held.level)
          ? t('ascent.bind.ready', { n: held.copies + 1 })
          : t('ascent.bind.copy', { n: held.copies + 1, need: combineCost(held.level) });
    info.add(self.add.text(14, cursor, outcome, {
      color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '11px', fontStyle: '700',
      wordWrap: { width: content.width - 28 },
    }));
    cursor += 18;

    if (card?.evolutionOnly && !recipeLearned(cardId) && cursor < infoHeight - 14) {
      info.add(self.add.text(14, cursor, t('ascent.bind.recipe'), {
        color: '#4a6a55', fontFamily: UI_FONT, fontSize: '10px',
        wordWrap: { width: content.width - 28 },
      }));
    }
  };

  const fan = new CardFan(self, {
    x: content.x, y: fanTop, width: content.width, height: fanHeight,
    cards: prompt.options.map((id) => ({ id })),
    // The centre card opens raised — the resting hand stays symmetric.
    initial: Math.floor((prompt.options.length - 1) / 2),
    onRaise: describe,
    onTake: (index) => self.choose(prompt.options[index]),
    takeLabel: t('ascent.bind.confirm'),
  });
  self.modalLayer.add(fan.view);

  self.modalLayer.add(self.add.text(content.x + content.width / 2, fanTop - HINT_Y_ABOVE_FAN,
    t('ascent.draft.fanHint'), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
      wordWrap: { width: content.width - 8 },
    }).setOrigin(0.5, 0));

  self.modalLayer.add(self.ui.button(
    { x: content.x, y: buttonY, width: content.width, height: BUTTON },
    t('ascent.bind.confirm'),
    () => fan.take(),
    { variant: 'primary', fontSize: '15px' },
  ));
}

/**
 * The last step: what the next reign opens holding.
 *
 * The reworked exit. "Go again" used to restart the mode; it now goes through a page that says
 * what is different this time, because a roguelite whose return is indistinguishable from its
 * first run has no return at all.
 *
 * Only what is real. The page used to draw two greyed rows saying which phase would fill them;
 * a row about a feature that does not exist teaches nothing and then changes shape under the
 * player later. Each row carries the concrete number it changes, and the rows count in one by
 * one — the last beat of the reign-end passage.
 *
 * Fixed rather than scrolling, like the Reckoning it follows: the rows and two controls fit the
 * 620 clamp, and a closing page that scrolls is a closing page that shows half of itself.
 */
export function showNextReign(
  self: ConquestUIScene,
  prompt: Extract<AscentPrompt, { kind: 'next-reign' }>,
): void {
  const content = self.promptFrame(t('dynasty.next.title'), t('dynasty.next.subtitle'));

  // The controls take the foot and never move; the rows are measured back from them, so the page
  // holds together at both ends of the `GAME_HEIGHT` clamp.
  const BUTTONS = 46 + 8 + 28;
  const buttonY = content.y + content.height - BUTTONS - 2;
  const hand = openingHand();
  const rows: Array<{ label: string; detail: string; accent: number }> = [
    {
      label: t('dynasty.next.founderN', { n: prompt.founderCount }),
      detail: t('dynasty.next.founderD'),
      accent: INK_UI.gold,
    },
    {
      label: t('dynasty.next.traits'),
      detail: prompt.traits.length > 0
        ? prompt.traits.map((id) => `${traitName(id)} · ${traitText(id, 'delta')}`).join('\n')
        : t('dynasty.next.traitsNone'),
      accent: prompt.traits.length > 0 ? INK_UI.jade : INK_UI.softBrush,
    },
  ];
  if (hand.length > 0) {
    rows.push({
      label: t('dynasty.next.hand'),
      detail: t('dynasty.next.handSome', {
        cards: hand.map((id) => t(`ascent.card.${id}` as Parameters<typeof t>[0])).join(' · '),
        n: hand.length * 2,
      }),
      accent: INK_UI.jade,
    });
  }
  if (prompt.codes > 0) {
    rows.push({
      label: t('dynasty.next.code'),
      detail: t('dynasty.next.codeSome', { n: prompt.codes }),
      accent: INK_UI.jade,
    });
  }
  // The rubbings this reign banked wait on the menu: said here, with the number, or the player
  // leaves not knowing the Cabinet has anything for them.
  const waiting = getCabinet().rubbings;
  if (waiting > 0) {
    rows.push({
      label: t('dynasty.next.rubbings', { n: waiting }),
      detail: t('dynasty.next.rubbingsD'),
      accent: INK_UI.gold,
    });
  }

  const room = buttonY - content.y - 8;
  const rowH = Math.max(44, Math.min(96, Math.floor((room - (rows.length - 1) * 8) / rows.length)));
  let y = content.y + Math.max(0, Math.round((room - (rowH * rows.length + (rows.length - 1) * 8)) / 2));

  const built: Phaser.GameObjects.Container[] = [];
  rows.forEach((row) => {
    const holder = self.add.container(content.x, y);
    holder.add(self.ui.panel({ x: 0, y: 0, width: content.width, height: rowH },
      { border: INK_UI.softBrush, fillAlpha: 0.5 }));
    const edge = self.add.graphics();
    edge.fillStyle(row.accent, 0.9);
    edge.fillRect(1.5, 5, 2.5, rowH - 10);
    holder.add(edge);
    holder.add(self.ui.label(12, 7, row.label, 'label', { fontSize: '12px' }));
    holder.add(self.ui.label(12, 24, row.detail, 'caption',
      { fontSize: '9.5px', wordWrap: { width: content.width - 24 }, maxLines: Math.max(1, Math.floor((rowH - 28) / 12)) }));
    self.modalLayer.add(holder);
    built.push(holder);
    y += rowH + 8;
  });
  // The rows count in, 180 ms apart — the last beat of the reign-end passage.
  staggerIn(self, built, { staggerMs: motionMs(180), duration: motionMs(220) });

  self.modalLayer.add(self.ui.button(
    { x: content.x, y: buttonY, width: content.width, height: 46 },
    t('dynasty.next.begin'),
    () => self.events.emit('ui:restart-ascent'),
    { variant: 'primary', fontSize: '15px' },
  ));
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: buttonY + 54, width: content.width, height: 28 },
    t('dynasty.next.leave'),
    () => self.events.emit('ui:exit-to-menu'),
    { variant: 'ghost', fontSize: '12px' },
  ));
}
