import Phaser from 'phaser';
import { measureInkText } from '../ui/InkVirtualList';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { applyRenderScale } from '../game/graphicsQuality';
import { t } from '../i18n';
import { GUIDE_ENTRIES, GUIDE_TABS, type GuideEntry, type GuideTab } from '../data/guide';
import { forgetTour, requestGuidedRun } from '../state/tour';
import { createAscentGameState } from '../state/GameState';
import { BACK_BAR_BAND, BACK_BAR_HEIGHT, InkUI, INK_UI, type InkScrollArea } from '../ui/InkUI';
import { CARD_ICON_SIZE, drawCardIcon } from '../ui/CardIcons';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { PIGMENT } from '../ui/ink/palette';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import { attachPagePaper } from '../ui/ink/paperSheet';
import { attachDesktopBackdrop } from '../ui/desktopBackdrop';
import { isDesktopPlatform } from '../platform/layout';

const SIDE = 12;
const LIST_WIDTH = GAME_WIDTH - SIDE * 2;
/** Where the scrolling manual starts: under the title, the subtitle and the tab strip. */
const LIST_TOP = 108;
/**
 * It was a 64x28 ghost button in the top-left corner — about seven hundred points from the thumb of
 * the hand holding an 844-point phone, on a page whose whole content is read one-handed. It is the
 * same bar every other page uses now, at the foot, and the list is shortened to clear it rather
 * than the bar floating over what is being read.
 */
const CARD_GAP = 8;
/** Header and tabs sit above the list, so they win the tap. Same trap as `HistoryScene.chrome`. */
const CHROME_DEPTH = 5;

/**
 * How to Play.
 *
 * The game had no manual at all. Everything a player needed was inferable from the screens — which
 * is a real design goal and is not the same claim as *inferred*: nothing on the HUD says that
 * ambition is a price you pay once rather than a treadmill, nothing on the action bar says pause
 * costs nothing, and the single most important fact about the mode — that refusing every offer is
 * a losing strategy that takes twenty waves to lose — is invisible until it has already happened.
 * A strategy game may fairly ask a player to work out *how* to win. It should not ask them to work
 * out what the numbers mean.
 *
 * A scene rather than a mode on `MenuScene`, for the reason `HistoryScene` is one: this is a
 * scrolling surface with tabs, and the menu is already the longest file in `scenes/`.
 *
 * Deliberately NOT a wizard, a tooltip layer or an interactive tutorial. Those teach by
 * interrupting, and this mode's whole promise is that it stops the player as little as it can. The
 * tour on the front page (`Copilot`) does the interrupting, once, and its last card sends the
 * reader here — where the text sits still and can be read at whatever length they like.
 */
export class GuideScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  private tab: GuideTab = 'start';
  private content: Phaser.GameObjects.GameObject[] = [];
  private scroll?: InkScrollArea;
  /**
   * Where the reader goes when they press Back.
   *
   * The page is reached from the front page and, later, from wherever else it is worth offering.
   * Carried rather than hardcoded to `MenuScene` so it can never strand somebody who arrived from
   * somewhere the menu is not — and defaulted, so a caller that forgets is still correct.
   */
  private returnTo = 'MenuScene';

  constructor() {
    super('GuideScene');
  }

  init(data: { returnTo?: string }): void {
    this.returnTo = data?.returnTo ?? 'MenuScene';
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
    // The sheet and nothing else. The menu's diorama is a fine thing to arrive at and a poor thing
    // to read four pages of prose over.
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT).setDepth(-10);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
    this.render();
    // The page develops onto the paper rather than replacing it. Fading in from the sheet's own
    // colour (`#e9dfc2`) means only the ink arrives: no black flash, no white one, and the
    // parchment under it never appears to change.
    this.cameras.main.fadeIn(190, 0xe9, 0xdf, 0xc2);
  }

  private clear(): void {
    this.scroll?.destroy();
    this.scroll = undefined;
    for (const object of this.content) {
      object.destroy();
    }
    this.content = [];
  }

  private render(): void {
    this.clear();
    this.renderHeader();
    this.renderTabs();
    this.renderPage();
  }

  private chrome<T extends Phaser.GameObjects.GameObject & { setDepth(value: number): T }>(object: T): T {
    this.content.push(object.setDepth(CHROME_DEPTH));
    return object;
  }

  private renderHeader(): void {
    this.chrome(this.ui.backBar(
      GAME_HEIGHT - BACK_BAR_HEIGHT - 10,
      () => this.scene.start(this.returnTo),
    ));

    this.chrome(this.add.text(GAME_WIDTH / 2, 14, t('guide.title'), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '19px',
      fontStyle: '700',
    }).setOrigin(0.5, 0));

    this.chrome(this.add.text(GAME_WIDTH / 2, 44, t('guide.subtitle'), {
      color: '#6b5230',
      fontFamily: UI_FONT,
      fontSize: '11px',
      align: 'center',
      wordWrap: { width: LIST_WIDTH - 20 },
    }).setOrigin(0.5, 0));
  }

  private renderTabs(): void {
    const width = Math.floor((LIST_WIDTH - 3 * 4) / 4);
    GUIDE_TABS.forEach((tab, index) => {
      this.chrome(this.ui.button(
        { x: SIDE + index * (width + 4), y: 70, width, height: 28 },
        t(`guide.tab.${tab}` as 'guide.tab.start'),
        () => {
          if (this.tab === tab) {
            return;
          }
          this.tab = tab;
          this.render();
        },
        { variant: this.tab === tab ? 'secondary' : 'ghost', fontSize: '11px' },
      ));
    });
  }

  private renderPage(): void {
    const height = GAME_HEIGHT - LIST_TOP - 10 - BACK_BAR_BAND;
    const scroll = this.ui.scrollArea({ x: SIDE, y: LIST_TOP, width: LIST_WIDTH, height });
    this.scroll = scroll;
    // `addTo` is not a convenience: it parents the area's swallow-zone and its content in that
    // order, so the cards sit above the zone. Left at the scene root the zone is created after the
    // container and lands on top of it, and with `input.topOnly` on it eats every tap.
    const layer = this.add.container(0, 0);
    scroll.addTo(layer);
    this.content.push(layer);

    // Stacked by each entry's OWN measured height. Every paragraph here wraps to a different
    // number of lines in Vietnamese than in English, and a fixed stride would overlap in one of
    // the two languages whichever number it was tuned to.
    let cursor = 0;
    /**
     * Learn by playing, and it goes first on the page.
     *
     * The rest of this scene is four pages of prose, and prose is the wrong way to learn a
     * real-time game — a reader finishes it having understood every sentence and still not
     * knowing what to do when THREAT passes their defence. This starts an actual Dragon Ascent
     * run with the advisor walking through it: the band, the line, the bar, then the first
     * decision, the first wave mustering, and the first wave survived, each explained at the
     * moment it happens rather than four screens earlier.
     *
     * On the Start tab only. It is the tab a reader lands on, and a button that appears on all
     * four is a button that follows you around the manual asking you to stop reading it.
     */
    if (this.tab === 'start') {
      scroll.content.add(this.ui.button(
        { x: 0, y: cursor, width: LIST_WIDTH - 6, height: 52 },
        t('guide.play.label'),
        () => {
          requestGuidedRun();
          const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
          // The desktop's hands-on default, as on the front page's own button.
          if (isDesktopPlatform() && state.ascent) state.ascent.hardcore = true;
          this.scene.start('ConquestScene', { state });
        },
        { variant: 'primary', fontSize: '15px', subLabel: t('guide.play.note') },
      ));
      cursor += 52 + CARD_GAP;
    }
    for (const entry of GUIDE_ENTRIES.filter((candidate) => candidate.tab === this.tab)) {
      const top = cursor;
      const width = LIST_WIDTH - 54;
      let height = 22 + measureInkText(this, t(entry.heading), {
        fontFamily: TITLE_FONT, fontSize: '14px', fontStyle: '700', wordWrap: { width },
      });
      const bodyStyle = { fontFamily: UI_FONT, fontSize: '11.5px', lineSpacing: 4, wordWrap: { width } };
      if (entry.body) height += 5 + measureInkText(this, t(entry.body), bodyStyle);
      for (const point of entry.points ?? []) height += 7 + measureInkText(this, t(point), { ...bodyStyle, wordWrap: { width: width - 12 } });
      scroll.lazyRow(entry.heading, top, height + CARD_GAP, () => this.entryCard(scroll, top, entry));
      cursor += height + CARD_GAP;
    }
    // The tour, offered back.
    //
    // It runs once and is dismissible from its first card, which is the right default and leaves
    // one hole: a player who skipped it has no way to change their mind. This is that way, and it
    // is on the Start tab because the tour and this tab are the same subject — what the front page
    // is — told at two different lengths.
    if (this.tab === 'start') {
      cursor += 6;
      // Into the scroll's own content, not the scene: a button parked at a scene y would sit still
      // while the entries above it slid under it, and end up printed across a paragraph.
      scroll.content.add(this.ui.button(
        { x: 0, y: cursor, width: LIST_WIDTH - 6, height: 32 },
        t('guide.tour.replay'),
        () => {
          forgetTour();
          this.scene.start('MenuScene');
        },
        { variant: 'ghost', fontSize: '12px' },
      ));
      cursor += 32;
    }
    // A tail of air, so the last entry can be scrolled clear of the bottom edge rather than ending
    // flush against it — a paragraph that stops exactly at the sheet's foot reads as cut off.
    scroll.setContentHeight(Math.max(height, cursor + 24));
    scroll.setScroll(0);
  }

  /**
   * One entry: glyph, heading, paragraph, and any points under it. Returns its height.
   *
   * Hand-drawn rather than `InkUI.card` because a card centres its title and puts its body in a
   * quieter grey — right for a thing you are choosing between, wrong for a thing you are reading.
   * A manual wants a left-ranged heading you can scan down the edge of, and body type at the same
   * weight as the heading's, because the body is the part that matters here.
   */
  private entryCard(scroll: InkScrollArea, y: number, entry: GuideEntry): number {
    const holder = this.add.container(0, y);
    const skin = this.add.graphics();
    holder.add(skin);

    const TEXT_X = 40;
    const textWidth = LIST_WIDTH - TEXT_X - 14;

    const glyph = drawCardIcon(this, entry.icon, PIGMENT.muc);
    glyph.setScale(0.62).setAlpha(0.85);
    glyph.setPosition(14 + (CARD_ICON_SIZE * 0.62) / 2, 12 + (CARD_ICON_SIZE * 0.62) / 2);
    holder.add(glyph);

    const heading = this.add.text(TEXT_X, 10, t(entry.heading), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '14px',
      fontStyle: '700',
      wordWrap: { width: textWidth },
    });
    holder.add(heading);
    let bottom = heading.y + heading.height;

    if (entry.body) {
      const body = this.add.text(TEXT_X, bottom + 5, t(entry.body), {
        color: '#4a3b28',
        fontFamily: UI_FONT,
        fontSize: '11.5px',
        // Vietnamese stacks two marks above the letter, and this is the longest running text in
        // the game. Anything tighter than this clips the upper mark on a wrapped line.
        lineSpacing: 4,
        wordWrap: { width: textWidth },
      });
      holder.add(body);
      bottom = body.y + body.height;
    }

    for (const point of entry.points ?? []) {
      // The marker is drawn, not typed. A bullet character is a font's opinion, and the two faces
      // this game ships disagree about where it sits on the line.
      const line = this.add.text(TEXT_X + 12, bottom + 7, t(point), {
        color: '#4a3b28',
        fontFamily: UI_FONT,
        fontSize: '11.5px',
        lineSpacing: 4,
        wordWrap: { width: textWidth - 12 },
      });
      const marker = this.add.graphics();
      marker.fillStyle(INK_UI.cinnabar, 0.75);
      marker.fillCircle(TEXT_X + 4, line.y + 7, 2.2);
      holder.add([marker, line]);
      bottom = line.y + line.height;
    }

    const height = bottom + 12;
    skin.fillStyle(INK_UI.parchment, 0.9);
    skin.fillRoundedRect(0, 0, LIST_WIDTH - 6, height, 6);
    skin.lineStyle(1, INK_UI.parchmentDark, 1);
    skin.strokeRoundedRect(0, 0, LIST_WIDTH - 6, height, 6);
    // A rule down the left edge in son, the same mark the open section header on the history page
    // carries. It gives a column of entries an edge to run the eye down.
    skin.fillStyle(INK_UI.cinnabar, 0.5);
    skin.fillRect(0, 6, 2.5, height - 12);

    scroll.content.add(holder);
    return height;
  }
}
