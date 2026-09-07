/**
 * The front page and the classic-modes page: the button column, the tour targets it fills in,
 * the classic tour, the new-run confirmation and the settings/dynasty footer pair.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, isDesktopSheet, pageColumnX, surfaceWidth } from '../../game/constants';
import { createAscentGameState, createInitialGameState } from '../../state/GameState';
import { hasSnapshot, loadSnapshot, snapshotLabel } from '../../state/save';
import { hasSeenClassicTour, markClassicTourSeen } from '../../state/tour';
import { seasonLabel, t } from '../../i18n';
import { INK_UI } from '../../ui/InkUI';
import { type CardIconId } from '../../ui/CardIcons';
import { Copilot, type CopilotStep } from '../../ui/Copilot';
import { TITLE_FONT, UI_FONT } from '../../ui/fonts';
import { dongHoWordmark } from '../../ui/ink/dongHoWordmark';
import { royalScroll } from '../../ui/ink/royalScroll';
import { isDesktopPlatform } from '../../platform/layout';
import { SETTINGS_BLOCK_GAP, SETTINGS_TOP, SUPPORT_ROW_HEIGHT, SUPPORT_TOP, VERSION_EDGE } from './constants';
import { pageFloor } from './helpers';
import type { MenuScene } from '../MenuScene';

/**
 * The front page's button column, stacked by flow.
 *
 * Every row used to sit at a fixed y measured against an 844-tall sheet. The gaps between them
 * scale with the sheet; the type inside them does not, and a tagline that is one line in English
 * is two in Vietnamese. On a short viewport the tagline landed across the button under it and
 * the save stamp across the one under that. Measuring each row and starting the next below it
 * cannot produce that, in any language, at any height.
 */
export function renderMain(self: MenuScene): void {
  if (isDesktopSheet()) {
    renderDesktopMain(self);
    return;
  }
  const saved = hasSnapshot();
  const secondaryWidth = 240;
  const secondaryX = Math.round((GAME_WIDTH - secondaryWidth) / 2);
  const classicHeight = Math.max(30, self.vh(32));
  const playHeight = Math.max(48, self.vh(58));
  const continueHeight = saved ? 44 : 0;
  const innerGaps = saved ? 3 : 2;
  // Preserve a full touch row for Continue even on the shortest sheet. On tall phones,
  // the column starts beside the illustration instead of sinking toward the footer.
  const artFloor = Math.min(self.vy(420),
    SETTINGS_TOP - playHeight - continueHeight - 44 - classicHeight - 24);
  const room = SETTINGS_TOP - artFloor;
  const ledgerHeight = Phaser.Math.Clamp(
    room - playHeight - continueHeight - classicHeight - 6 * (innerGaps + 2), 44, 64);
  const rowHeight = playHeight + continueHeight + ledgerHeight + classicHeight;
  const gap = Phaser.Math.Clamp(Math.floor((room - rowHeight) / (innerGaps + 2)), 4, 10);
  let cursor = artFloor;

  self.tourTargets.play = { x: 54, y: cursor, width: 282, height: playHeight };
  self.content.push(self.ui.button(self.tourTargets.play, t('ascent.menu.title'), () => {
    startAscentRun(self);
  }, { variant: 'primary', fontSize: '17px' }).setData('menuPrimary', true));
  cursor += playHeight + gap;

  // This resumes a classic save. Dragon Ascent remains the primary action, and a new
  // install has no empty or disabled Continue row.
  if (saved) {
    const resume = self.ui.textLink(0, 0,
      t('menu.continueLine', { note: self.reloadNote ?? snapshotLabel() }), () => {
        const snapshot = loadSnapshot();
        if (snapshot) self.startGame(snapshot.state);
      }, { fontSize: '11px' }).setData('menuLink', 'continue');
    const linkWidth = resume.getData('linkWidth') as number;
    resume.setPosition(Math.round((GAME_WIDTH - linkWidth) / 2), cursor + continueHeight / 2);
    self.content.push(resume);
    cursor += continueHeight + gap;
  }

  self.renderDynastyTablet(secondaryX, cursor, secondaryWidth, ledgerHeight);
  cursor += ledgerHeight + gap;
  self.tourTargets.classic = { x: secondaryX, y: cursor, width: secondaryWidth, height: classicHeight };
  self.content.push(self.ui.button(self.tourTargets.classic, t('ascent.menu.classic'), () => {
    self.mode = 'classic';
    self.render();
  }, { variant: 'ghost', fontSize: '12px', extraHitPadding: Math.max(0, 44 - classicHeight) })
    .setData('menuSecondary', 'classic')
    .setData('visualBounds', { width: secondaryWidth, height: classicHeight }));
  cursor += classicHeight;

  // Keep the navigation and language picker together; the quiet support/version footer
  // stays at the page edge. These measured positions also drive the first-run tour.
  const utilityTop = Math.min(SETTINGS_TOP, cursor + Math.max(18, gap * 2));
  renderFooterPair(self, utilityTop);
  self.renderLanguageSwitch(utilityTop + 34 + SETTINGS_BLOCK_GAP);
  self.renderSupportRow();
  self.renderVersionLine();
}

/** The desktop title page is an opened royal document beside the landscape. */
function renderDesktopMain(self: MenuScene): void {
  const snapshot = loadSnapshot();
  const saved = Boolean(snapshot);
  const first = self.content.length;
  const panelWidth = 358;
  const panelHeight = saved ? 596 : 544;
  const panelX = (GAME_WIDTH - panelWidth) / 2;
  const panelTop = Math.round((GAME_HEIGHT - panelHeight) / 2);
  const margin = surfaceWidth() < 1000 ? 28 : 56;
  const offsetX = surfaceWidth() - margin - panelWidth - pageColumnX() - panelX;
  self.content.push(royalScroll(self, panelX, panelTop, panelWidth, panelHeight).setDepth(-4)
    .setData('desktopMenuPanel', { width: panelWidth, height: panelHeight }));
  const title = dongHoWordmark(self, GAME_WIDTH / 2, panelTop + 62, 248);
  self.content.push(title, self.ui.label(GAME_WIDTH / 2, panelTop + 107, 'TEN THOUSAND VICTORIES', 'caption', {
    fontFamily: UI_FONT, fontSize: '9px', color: '#5a4c39',
  }).setOrigin(0.5, 0).setLetterSpacing(1.4));

  const x = 44, width = 302;
  let cursor = panelTop + 152;
  if (snapshot) {
    const note = self.reloadNote ?? t('time.yearSeason', {
      year: snapshot.state.year, season: seasonLabel(snapshot.state.season),
    });
    self.content.push(self.ui.button({ x, y: cursor, width, height: 56 }, t('menu.continue'), () => {
      const current = loadSnapshot();
      if (current) self.startGame(current.state);
    }, { variant: 'primary', fontSize: '18px', subLabel: note })
      .setData('menuPrimary', true).setData('menuLink', 'continue'));
    cursor += 64;
  }
  const playHeight = saved ? 44 : 56;
  self.tourTargets.play = { x, y: cursor, width, height: playHeight };
  self.content.push(self.ui.button(self.tourTargets.play, saved ? t('menu.newRun') : t('ascent.menu.title'),
    () => startAscentRun(self), { variant: saved ? 'secondary' : 'primary', fontSize: saved ? '13px' : '18px' })
    .setData('menuPrimary', !saved).setData('menuNewRun', true));
  cursor += playHeight + 20;
  self.renderDynastyTablet(x, cursor, width, 64);
  cursor += 74;
  self.tourTargets.classic = { x, y: cursor, width, height: 40 };
  self.content.push(self.ui.button(self.tourTargets.classic, t('ascent.menu.classic'), () => {
    self.mode = 'classic';
    self.render();
  }, { variant: 'ghost', fontSize: '12px', extraHitPadding: 4 }).setData('menuSecondary', 'classic'));
  cursor += 58;
  renderFooterPair(self, cursor);
  self.renderLanguageSwitch(cursor + 44);

  const supportStart = self.content.length;
  self.renderSupportRow();
  for (const object of self.content.slice(supportStart)) {
    const part = object as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;
    part.y += panelTop + panelHeight - 88 - (SUPPORT_TOP + SUPPORT_ROW_HEIGHT / 2);
  }
  const versionStart = self.content.length;
  self.renderVersionLine();
  for (const object of self.content.slice(versionStart)) {
    const part = object as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;
    part.y += panelTop + panelHeight - 26 - (GAME_HEIGHT - VERSION_EDGE);
  }
  for (const object of self.content.slice(first)) {
    const part = object as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;
    part.x += offsetX;
  }
  for (const key of ['play', 'classic', 'footer'] as const) {
    const bounds = self.tourTargets[key];
    if (bounds) bounds.x += offsetX;
  }
}
/**
 * Both hand-played modes, stacked by flow rather than at fixed heights.
 *
 * `InkUI.card` grows to fit whatever its body wraps to and reports the result — the requested
 * height is only a minimum — so a caller that puts the next card at a hardcoded y is asserting a
 * height the card never promised. In Vietnamese the blurbs run a line longer and the two cards
 * climbed on top of each other. Each one now starts below the last one actually ended.
 */
export function renderClassic(self: MenuScene): void {
  const bandTop = self.vy(250);
  let cursor = bandTop;
  const built: Phaser.GameObjects.Container[] = [];
  const title = self.add.text(GAME_WIDTH / 2, cursor, t('ascent.menu.classicTitle'), {
    color: '#2a2118',
    fontFamily: TITLE_FONT,
    fontSize: '20px',
    fontStyle: '700',
    align: 'center',
    wordWrap: { width: GAME_WIDTH - 56 },
  }).setOrigin(0.5, 0);
  self.content.push(title);
  cursor += title.height + 16;

  /**
   * The Skirmish, and only the Skirmish.
   *
   * Throne of Empires and the Campaign are still built, still reachable by code, and still held
   * to their fingerprints by `verify-modes-regression` — they are simply not offered here any
   * more. Dragon Ascent is the game this is now, and the two long classic runs had drifted into
   * being older, slower versions of it that nothing was being tuned against.
   *
   * The Skirmish stays because it is not a rival to Ascent: it is one fight, set up and taken
   * command of in minutes, and it is the only place the battle system can be learned without a
   * run around it. Called Skirmish rather than "The Field" for the reason the genre settled long
   * ago — that is what a one-off fight outside a campaign is called, everywhere.
   *
   * Restoring either is putting its entry back in this list.
   */
  for (const mode of [
    {
      title: t('arena.title'),
      body: t('arena.menuBlurb'),
      border: INK_UI.cinnabar,
      variant: 'primary' as const,
      start: 'arena' as const,
    },
  ]) {
    const card = self.ui.card({ x: 28, y: cursor, width: GAME_WIDTH - 56, height: self.vh(88) }, {
      title: mode.title,
      body: mode.body,
      border: mode.border,
      actionPlacement: 'bottom',
      action: {
        label: t('ascent.menu.play'),
        variant: mode.variant,
        onClick: () => (mode.start === 'arena'
          ? self.scene.start('BattleArenaScene')
          : self.scene.start('CampaignScene', { mode: mode.start })),
      },
    });
    self.content.push(card);
    // The tour on this page points at the first card, so its measured rectangle is kept. Height
    // comes off the card rather than from the 88 requested: `InkUI.card` grows to fit whatever
    // its body wraps to, and in Vietnamese every one of these blurbs runs a line longer.
    if (mode.start === 'arena') {
      self.tourTargets.skirmish = {
        x: 28,
        y: cursor,
        width: GAME_WIDTH - 56,
        height: card.getData('cardHeight') as number,
      };
    }
    cursor += (card.getData('cardHeight') as number) + 14;
    built.push(card);
  }

  /**
   * Centred in the band between the wordmark and the way back.
   *
   * The page offers one card. Laid out from the top it sat under the title with half a screen of
   * nothing beneath it, which reads as a page that failed to finish loading rather than a page
   * with one thing on it. Shifted after the fact rather than placed there, because `InkUI.card`
   * grows to whatever its body wraps to — a line longer in Vietnamese — and only the card knows
   * how tall it ended up.
   */
  const blockHeight = cursor - 14 - bandTop;
  const shift = Math.max(0, Math.round((pageFloor() - bandTop - blockHeight) / 2));
  if (shift > 0) {
    title.setY(title.y + shift);
    for (const card of built) card.setY(card.y + shift);
    if (self.tourTargets.skirmish) self.tourTargets.skirmish.y += shift;
  }

  // First time on this page, once: what a skirmish is and how one is won.
  startClassicTour(self);

  self.footBackBar();
}

/**
 * Dragon Ascent skips the setup screen entirely: the founder choice is the run's first
 * in-game prompt, so starting a run is one tap and no menu.
 */
export function startAscentRun(self: MenuScene): void {
  const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  // Hands-on by default on the desktop. A mouse and a keyboard are a different pace from a
  // thumb, and the run is meant to be worked there: the lanes' cards and the autopilot stay off
  // unless the player turns them back on — the same switch the mandate card and the run menu
  // already offer. Set here, at the door the player walks through, and nowhere in the state
  // factories, so a harness building a run headlessly measures the same game on every layout.
  if (isDesktopPlatform() && state.ascent) state.ascent.hardcore = true;
  self.scene.start('ConquestScene', { state });
}

/**
 * The three cards on the classic page, explained the first time somebody opens it.
 *
 * Skirmish gets two of the three because it is the one mode nothing else on the front page
 * prepares you for: the other two are runs whose shape the Dragon Ascent tour already
 * described, while a skirmish is a single fight with its own vocabulary — ground, posture,
 * focus, reserve — and no economy underneath to forgive a mistake.
 *
 * Its own storage flag. A player who skipped the front page's tour may still want this one,
 * and a player who watched it has not thereby been told what a skirmish is.
 */
function startClassicTour(self: MenuScene): void {
  if (self.classicTourDone || self.copilot || hasSeenClassicTour()) return;
  self.classicTourDone = true;

  const steps: CopilotStep[] = [
    {
      id: 'skirmish',
      heading: 'copilot.classic.skirmish.h',
      body: 'copilot.classic.skirmish.b',
      target: () => self.tourTargets.skirmish,
    },
    {
      id: 'skirmish-win',
      heading: 'copilot.classic.win.h',
      body: 'copilot.classic.win.b',
      target: () => self.tourTargets.skirmish,
    },
    { id: 'classic-long', heading: 'copilot.classic.long.h', body: 'copilot.classic.long.b' },
  ];

  self.copilotFor = 'classic';
  self.copilot = new Copilot(self, {
    steps,
    // The offer at the end is the thing the tour just spent two of its three cards on.
    onGuide: () => self.scene.start('BattleArenaScene'),
    onClose: () => {
      markClassicTourSeen();
      self.copilot = undefined;
      self.copilotFor = undefined;
    },
  });
}

export function renderConfirmNew(self: MenuScene): void {
  const panel = self.ui.card({ x: 28, y: self.vy(528), width: GAME_WIDTH - 56, height: self.vh(178) }, {
    title: t('menu.startNewQuestion'),
    body: t('menu.savedSnapshotKept'),
    border: INK_UI.gold,
    fill: 0xd9c584,
  });
  self.content.push(panel);

  self.content.push(self.ui.button({ x: 54, y: self.vy(632), width: 282, height: self.vh(46) }, t('menu.startNewCampaign'), () => {
    self.startGame(createInitialGameState());
    // Note: full campaign setup is via "Start Campaign" → CampaignScene
  }, { variant: 'danger', fontSize: '14px' }));
  self.footBackBar();
}

/**
 * The line at the foot of the front page: a coffee, and — better — a hand with the game.
 *
 * One sentence, not two controls. They were a pair of ghost buttons, and a button is the game
 * asking you to press it; these are asides, and drawn as chrome they competed with "Dragon
 * Ascent" for the eye while saying nothing about what they lead to. Written out with the words
 * that join them — "Buy me a coffee — or even better, help build the game" — the sentence itself
 * does the persuading, and the two phrases inside it are simply the parts you can press: marked
 * with a glyph, ruled underneath, and cinnabar under the finger.
 *
 * That is also why the second phrase is lowercase in both catalogues. It is the back half of a
 * sentence, not a label, and a capital there gives the game away as two buttons wearing prose.
 *
 * The parts are measured and then centred as one line, so the connective always sits between
 * them whatever it says. Vietnamese runs longer than English here; if the line ever outgrows the
 * sheet it shrinks to fit rather than wrapping under itself, since there is exactly one line of
 * room above the bottom edge.
 */
/**
 * The three places that are not a game: the manual, the history the game is built out of, and
 * the settings.
 *
 * They were full-width rows in the column above, which put five buttons of the same width down
 * the middle of the page and made a page of choices out of what is really one choice with some
 * doors beside it. Side by side in the footer they are half the height of the page's furniture
 * and read as the tier they are — and none of them lost anything, because a button you can still
 * see and still press has not been demoted, only stopped shouting.
 *
 * How to Play joins them rather than going in the column, and it is worth saying why, because it
 * is the one door here a first-time player actually needs. A manual advertised as loudly as the
 * game would be a front page that leads with homework — and the tour already walks a new player
 * to this exact rectangle on their first load, which is a better introduction than a bigger
 * button would have been. Anyone who skipped the tour finds it where a manual belongs: with the
 * other reference material, at the foot of the page.
 *
 * Ninety units per hit target keeps each control generous under a thumb while bringing the
 * visible icon-label groups into one coherent utility row. The old 104 + 7 rhythm left more air
 * between neighbouring words than inside each control, so the three links looked unrelated.
 */
function renderFooterPair(self: MenuScene, top = SETTINGS_TOP): void {
  const WIDTH = 90;
  const GAP = 0;
  const left = Math.round((GAME_WIDTH - (WIDTH * 3 + GAP * 2)) / 2);
  const height = self.vh(34);
  // Remembered as one rectangle rather than three: the tour's card is about the footer as a
  // tier — the manual, the record and the settings — and framing one of the three would say the
  // other two were something else.
  self.tourTargets.footer = { x: left, y: top, width: WIDTH * 3 + GAP * 2, height };

  // 12px, not 13. "How to Play" is three words where the other two are two and one, and at 13 it
  // wraps to a second line inside a 34-unit button — which centres the pair of lines and leaves
  // the row looking like one button broke.
  const doors: Array<{ id: string; label: string; icon: CardIconId; onPress: () => void }> = [
    { id: 'guide', label: t('guide.menu.button'), icon: 'scroll', onPress: () => self.scene.start('GuideScene') },
    { id: 'history', label: t('history.menu.button'), icon: 'book', onPress: () => self.scene.start('HistoryScene') },
    { id: 'settings', label: t('menu.settings'), icon: 'gear', onPress: () => { self.mode = 'settings'; self.render(); } },
  ];
  doors.forEach((door, index) => {
    const button = self.ui.button(
      { x: left + index * (WIDTH + GAP), y: top, width: WIDTH, height },
      door.label,
      door.onPress,
      {
        variant: 'ghost',
        frameless: true,
        icon: door.icon,
        fontSize: '11px',
        extraHitPadding: 4,
      },
    )
      .setData('menuUtility', door.id)
      .setData('utilityIcon', door.icon)
      .setData('ghostWithIcon', true);
    self.content.push(button);
  });
}
