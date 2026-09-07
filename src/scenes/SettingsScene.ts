import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { applyRenderScale, applyPendingRenderScale, renderScale, requestRenderScale, GRAPHICS_MODES, getGraphicsMode, setGraphicsMode } from '../game/graphicsQuality';
import { getLanguage, setLanguage, t, type LanguageCode } from '../i18n';
import { applyUpdate, buildStamp, checkForUpdate, getUpdateStatus, subscribeUpdateStatus } from '../pwa/updates';
import { BACK_BAR_BAND, BACK_BAR_HEIGHT, InkUI, INK_UI, INK_UI_HEX, scrollGestureConsumedTap, type InkScrollArea } from '../ui/InkUI';
import {
  BATTLE_DIFFICULTIES,
  BATTLE_SPEEDS,
  getBattleDifficulty,
  getBattleSpeed,
  setBattleDifficulty,
  setBattleSpeed,
} from '../game/battleOptions';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import {
  getMapTheme,
  MAP_THEME_OPTIONS,
  mapThemeIsChoosable,
  OFFERED_MAP_THEMES,
  setMapTheme,
  type MapThemeId,
} from '../ui/mapTheme';
import { MOTION_LEVELS, TRAFFIC_DENSITIES, getLifeSettings, setLifeSettings } from '../game/lifeSettings';
import {
  desktopPinOverruled,
  layoutKind,
  layoutPreference,
  setLayoutPreference,
  setUiScale,
  uiScale,
} from '../platform/layout';
import { fullRefreshEnabled, setFullRefresh, qualityLadder } from '../game/qualityLadder';
import { soundDirector } from '../ui/sound/SoundDirector';
import { rungForTier } from '../game/qualityRungs';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { attachPagePaper } from '../ui/ink/paperSheet';
import { attachDesktopBackdrop } from '../ui/desktopBackdrop';
import { shellDisplayMode, shellDisplayModes, setShellDisplayMode, type DisplayMode } from '../platform/shell';

const SIDE = 12;
const LIST_WIDTH = GAME_WIDTH - SIDE * 2;
/** Where the list starts: under the title and the subtitle. No tab strip on this page. */
const LIST_TOP = 70;
const CARD_WIDTH = LIST_WIDTH - 6;
const CARD_GAP = 8;
const CARD_PAD = 12;
const ROW_HEIGHT = 30;
const ROW_GAP = 8;
/** Header and the back bar sit above the list, so they win the tap. Same trap as `HistoryScene.chrome`. */
const CHROME_DEPTH = 5;

type Option<T extends string> = { id: T; label: string };
type Row = {
  name: string;
  options: ReadonlyArray<Option<string>>;
  current: string;
  pick: (id: string) => void;
  /** A line under the row, in caption type: what the choice will do, or why it is not doing it. */
  note?: string;
};
type Section = { key: string; heading: string; rows: Row[] };

/**
 * Settings.
 *
 * It was a mode of `MenuScene`: a parchment plate laid over the front page's landscape, with the
 * wordmark and the mountains showing round its edges and, on a 620 sheet, the plate's head
 * standing through the title. The two pages beside it in the footer — How to Play and History —
 * are full sheets: a title, a line under it, a scrolling body of cards and the Back bar at the
 * foot. Three doors in one row that open onto two kinds of page read as a mistake, and the one
 * that was different was the one with the least reason to be.
 *
 * So it is the same page as the other two now, built the way `GuideScene` is. The rows are the
 * rows the plate held, grouped onto cards by what they change — the picture, the fight, the map's
 * traffic, the sound, the interface — and the build stamp with its update line is the last card.
 * The page scrolls, which the plate could not: the plate was measured to the sheet and traded its
 * row gaps away to fit ten rows on 620, and every row added since has had to be argued in.
 *
 * The install mark that rode the plate's version line is not carried over. It rides the front
 * page's colophon, which is where the player is when they are wondering whether to install.
 */
export class SettingsScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  private content: Phaser.GameObjects.GameObject[] = [];
  private scroll?: InkScrollArea;
  /** Where the reader goes when they press Back. See `GuideScene.returnTo`. */
  private returnTo = 'MenuScene';
  private unsubscribeUpdates?: () => void;

  constructor() {
    super('SettingsScene');
  }

  init(data: { returnTo?: string }): void {
    this.returnTo = data?.returnTo ?? 'MenuScene';
  }

  create(): void {
    applyRenderScale(this);
    applyPaperFX(this);
    attachPagePaper(this);
    attachDesktopBackdrop(this);
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT).setDepth(-10);
    // A new build lands minutes after this page was drawn. Redrawing on the change is what lets
    // the build card grow its Reload button without the player leaving and coming back.
    this.unsubscribeUpdates = subscribeUpdateStatus(() => this.render(true));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeUpdates?.();
      this.unsubscribeUpdates = undefined;
      this.clear();
    });
    this.render();
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

  /**
   * Rebuilds the page. `keepScroll` holds the list where it was, so changing a setting halfway
   * down does not throw the reader back to the top — a page that jumps on every tap is a page
   * where a player loses the row they were on.
   */
  private render(keepScroll = false): void {
    const offset = keepScroll ? this.scroll?.offset ?? 0 : 0;
    this.clear();
    this.renderHeader();
    this.renderPage(offset);
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

    this.chrome(this.add.text(GAME_WIDTH / 2, 14, t('menu.settingsTitle'), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '19px',
      fontStyle: '700',
    }).setOrigin(0.5, 0));

    this.chrome(this.add.text(GAME_WIDTH / 2, 44, t('menu.settingsSubtitle'), {
      color: '#6b5230',
      fontFamily: UI_FONT,
      fontSize: '11px',
      align: 'center',
      wordWrap: { width: LIST_WIDTH - 20 },
    }).setOrigin(0.5, 0));
  }

  /** Every row, grouped by what it changes. Rows that are not offered on this platform are absent. */
  private sections(): Section[] {
    const life = getLifeSettings();
    const onOff: Option<string>[] = [
      { id: 'on', label: t('menu.toggle.on') },
      { id: 'off', label: t('menu.toggle.off') },
    ];
    const picture: Row[] = [
      {
        name: t('menu.graphics'),
        options: GRAPHICS_MODES.map((id) => ({ id, label: t(`menu.graphics.${id}` as 'menu.graphics.low') })),
        current: getGraphicsMode(),
        pick: (id) => {
          if (id === getGraphicsMode()) return;
          setGraphicsMode(id as typeof GRAPHICS_MODES[number]);
          // The ladder's rung override shadows the tier inside `profile()` — without re-pointing
          // it, `renderScale()` keeps answering from the old rung and this tap changes nothing.
          if (id === 'auto') qualityLadder()?.useAuto();
          else qualityLadder()?.force(rungForTier(id as Exclude<typeof GRAPHICS_MODES[number], 'auto'>).id);
          // No reload: the new tier's scale is applied to the live buffer at this boundary and
          // the page rebuilds itself — labels re-rasterise at the new resolution.
          requestRenderScale(renderScale());
          applyPendingRenderScale(this.game);
          this.scene.restart({ returnTo: this.returnTo });
        },
      },
      {
        name: t('menu.graphics.pacing'),
        options: [{ id: '60', label: '60 FPS' }, { id: 'display', label: t('menu.graphics.display') }],
        current: fullRefreshEnabled() ? 'display' : '60',
        pick: (id) => { setFullRefresh(id === 'display'); this.scene.restart({ returnTo: this.returnTo }); },
      },
      // How the cabinet's window covers the screen. Only inside a cabinet that says it has modes:
      // a browser tab does not own a window, and the document fullscreen API the web build uses is
      // a different thing that the F key already reaches. The tiles are whatever the shell lists —
      // two on Windows and Linux, where Chromium's fullscreen already *is* a borderless window and
      // a third tile would do nothing, and three on macOS, which also has the fullscreen Space.
      ...(shellDisplayModes().length > 1 ? [{
        name: t('menu.display'),
        options: shellDisplayModes().map((id) => ({ id, label: t(`menu.display.${id}` as 'menu.display.windowed') })),
        current: shellDisplayMode(),
        note: t('menu.display.note'),
        pick: (id: string) => {
          setShellDisplayMode(id as DisplayMode);
          // Restarted, not reloaded: the mode is the shell's to hold and the page has nothing to
          // re-read, but the row has to redraw against the mode that is now on screen.
          this.scene.restart({ returnTo: this.returnTo });
        },
      }] : []),
      // The shape of the sheet: the phone column, or the desktop's wide map with the column
      // beside it. On every device — it used to be offered only where a desktop was already
      // likely, which left a phone with no way to ask for the sheet when it is turned on its
      // side, and a tester no way to see the column on a computer. A pin wins every rule but the
      // box's aspect (`resolveLayoutKind`): a portrait box keeps the column whatever was asked,
      // and the note under the row says so rather than leaving a Desktop tile lit over a column.
      {
        // The row says which layout is actually on the glass, because "Auto" alone does not:
        // a computer in a portrait window is on the phone column, and this is where it finds out.
        name: `${t('menu.layout')} · ${t(`menu.layout.${layoutKind()}` as 'menu.layout.phone').toUpperCase()}`,
        options: (['auto', 'phone', 'desktop'] as const).map((id) => ({ id, label: t(`menu.layout.${id}` as 'menu.layout.auto') })),
        current: layoutPreference(),
        note: desktopPinOverruled() ? t('menu.layout.portraitNote') : t('menu.layout.applyNote'),
        pick: (id: string) => {
          if (id === layoutPreference()) return;
          setLayoutPreference(id as 'auto' | 'phone' | 'desktop');
          // A full reload, not a scene restart: the sheet's height and width are boot constants
          // every scene has laid itself out against, and the splash in `index.html` sizes itself
          // from the same rule.
          window.location.reload();
        },
      },
      // The interface size: how big the chrome is drawn against the desktop sheet. Offered when
      // the page is on that sheet or has asked for it, and applied on the next launch for the
      // same reason the layout is.
      ...(layoutKind() === 'desktop' || layoutPreference() === 'desktop' ? [{
        name: t('menu.uiScale'),
        options: (['small', 'normal', 'large'] as const).map((id) => ({ id, label: t(`menu.uiScale.${id}` as 'menu.uiScale.small') })),
        current: uiScale(),
        pick: (id: string) => {
          if (id === uiScale()) return;
          setUiScale(id as 'small' | 'normal' | 'large');
          window.location.reload();
        },
      }] : []),
    ];
    // The map style is not offered any more — see `OFFERED_MAP_THEMES`. The row is dropped rather
    // than drawn with a single choice in it, because a picker with one option is a control that
    // does nothing.
    const map: Row[] = [
      ...(mapThemeIsChoosable() ? [{
        name: t('menu.mapTheme'),
        options: MAP_THEME_OPTIONS
          .filter((option) => OFFERED_MAP_THEMES.includes(option.id))
          .map((option) => ({ id: option.id, label: t(option.labelKey) })),
        current: getMapTheme(),
        pick: (id: string) => { setMapTheme(id as MapThemeId); this.scene.restart({ returnTo: this.returnTo }); },
      }] : []),
      // Not the same question as graphics quality, which buys pixels. These buy *movement*: every
      // bird, cart and traveller is a live object with a tween on it, and a busy map is a hundred
      // of them ticking at once — a cost a resolution slider cannot answer. They are taste
      // settings too: a player who finds the sky distracting should be able to still it without
      // dropping to a 1x buffer.
      {
        name: t('menu.traffic'),
        options: TRAFFIC_DENSITIES.map((id) => ({ id, label: t(`menu.traffic.${id}` as 'menu.traffic.none') })),
        current: life.traffic,
        pick: (id) => { setLifeSettings({ traffic: id as typeof TRAFFIC_DENSITIES[number] }); this.render(true); },
      },
      {
        name: t('menu.birds'),
        options: onOff,
        current: life.birds ? 'on' : 'off',
        pick: (id) => { setLifeSettings({ birds: id === 'on' }); this.render(true); },
      },
      {
        name: t('menu.seasons'),
        options: onOff,
        current: life.seasons ? 'on' : 'off',
        pick: (id) => { setLifeSettings({ seasons: id === 'on' }); this.render(true); },
      },
    ];
    // Difficulty is how fast an invader answers the shape you are standing in — the fight is a
    // race between spotting a matchup and being countered out of it, so reaction time is the one
    // number that makes it harder without making it a different game. Pace is how long a round
    // is held on screen. Repeated on the skirmish setup page, where a player actually tries them.
    const fight: Row[] = [
      {
        name: t('menu.battleDifficulty'),
        options: BATTLE_DIFFICULTIES.map((id) => ({ id, label: t(`arena.difficulty.${id}` as 'arena.difficulty.easy') })),
        current: getBattleDifficulty(),
        pick: (id) => { setBattleDifficulty(id as typeof BATTLE_DIFFICULTIES[number]); this.render(true); },
      },
      {
        name: t('menu.battleSpeed'),
        options: BATTLE_SPEEDS.map((id) => ({ id, label: t(`arena.speed.${id}` as 'arena.speed.slow') })),
        current: getBattleSpeed(),
        pick: (id) => { setBattleSpeed(id as typeof BATTLE_SPEEDS[number]); this.render(true); },
      },
    ];
    const sound: Row[] = [
      {
        name: t('menu.sounds'),
        // Three states on the one row rather than a MUSIC row under it. "Effects" is the paper
        // under the thumb with no bed — for a player who wants nothing that could ever read as
        // a music player.
        options: (['off', 'effects', 'all'] as const).map((id) => ({ id, label: t(`menu.sound.${id}` as 'menu.sound.off') })),
        current: !soundDirector.isEnabled() ? 'off' : soundDirector.isMusicEnabled() ? 'all' : 'effects',
        pick: (id) => {
          soundDirector.setEnabled(id !== 'off');
          if (id !== 'off') soundDirector.setMusicEnabled(id === 'all');
          this.render(true);
        },
      },
    ];
    const face: Row[] = [
      // How much the interface itself moves. The reign-end sequence and the ledger's page are
      // choreographed; `reduced` cuts every one of those durations to a beat (`motionMs`).
      {
        name: t('menu.motion'),
        options: MOTION_LEVELS.map((id) => ({ id, label: t(`menu.motion.${id}` as 'menu.motion.full') })),
        current: life.motion,
        pick: (id) => { setLifeSettings({ motion: id as typeof MOTION_LEVELS[number] }); this.render(true); },
      },
      // Still here even though the front page carries a switch of its own: this is where a
      // player goes looking for it, and a settings page that does not list the language is a
      // settings page with a hole in it.
      {
        name: t('menu.language'),
        options: [{ id: 'vi', label: 'Tiếng Việt' }, { id: 'en', label: 'English' }],
        current: getLanguage(),
        pick: (id) => { setLanguage(id as LanguageCode); this.render(true); },
      },
    ];
    return [
      { key: 'picture', heading: t('menu.settings.section.picture'), rows: picture },
      { key: 'fight', heading: t('menu.settings.section.fight'), rows: fight },
      { key: 'map', heading: t('menu.settings.section.map'), rows: map },
      { key: 'sound', heading: t('menu.settings.section.sound'), rows: sound },
      { key: 'interface', heading: t('menu.settings.section.interface'), rows: face },
    ];
  }

  private renderPage(offset: number): void {
    const height = GAME_HEIGHT - LIST_TOP - 10 - BACK_BAR_BAND;
    const scroll = this.ui.scrollArea({ x: SIDE, y: LIST_TOP, width: LIST_WIDTH, height });
    this.scroll = scroll;
    // `addTo` is not a convenience: it parents the area's swallow-zone and its content in that
    // order, so the cards sit above the zone. See `GuideScene.renderPage`.
    const layer = this.add.container(0, 0);
    scroll.addTo(layer);
    this.content.push(layer);

    let cursor = 0;
    for (const section of this.sections()) {
      if (section.rows.length === 0) continue;
      cursor += this.sectionCard(scroll, cursor, section) + CARD_GAP;
    }
    cursor += this.buildCard(scroll, cursor) + CARD_GAP;

    // The credit the battle music is licensed on: CC-BY 4.0 is only satisfied while the credit
    // is *in the work a player uses*, and a line in the repo's LICENSE is invisible to somebody
    // who installed the game from a store. Printed small — an obligation, not a feature.
    const credit = this.add.text(6, cursor + 2, t('menu.musicCredit'), {
      color: INK_UI_HEX.mutedText,
      fontFamily: UI_FONT,
      fontSize: '8.5px',
      wordWrap: { width: CARD_WIDTH - 12 },
    });
    scroll.content.add(credit);
    cursor += 2 + credit.height;

    // A tail of air, so the last card can be scrolled clear of the bottom edge.
    scroll.setContentHeight(Math.max(height, cursor + 24));
    scroll.setScroll(offset);
  }

  /** The card's heading, in the manual's own type. Returns the y under it. */
  private cardHeading(holder: Phaser.GameObjects.Container, heading: string): number {
    const text = this.add.text(CARD_PAD, 10, heading, {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '14px',
      fontStyle: '700',
      wordWrap: { width: CARD_WIDTH - CARD_PAD * 2 },
    });
    holder.add(text);
    return text.y + text.height + 8;
  }

  /** The card's skin, drawn last and sent to the back: the parchment, its edge, the son rule. */
  private cardSkin(holder: Phaser.GameObjects.Container, skin: Phaser.GameObjects.Graphics, height: number): void {
    skin.fillStyle(INK_UI.parchment, 0.9);
    skin.fillRoundedRect(0, 0, CARD_WIDTH, height, 6);
    skin.lineStyle(1, INK_UI.parchmentDark, 1);
    skin.strokeRoundedRect(0, 0, CARD_WIDTH, height, 6);
    // A rule down the left edge in son, the mark the manual's entries and the history page's
    // open section carry. Three pages, one edge to run the eye down.
    skin.fillStyle(INK_UI.cinnabar, 0.5);
    skin.fillRect(0, 6, 2.5, height - 12);
    holder.sendToBack(skin);
  }

  /** One card: a heading and the rows under it. Returns its height. */
  private sectionCard(scroll: InkScrollArea, y: number, section: Section): number {
    const holder = this.add.container(0, y);
    const skin = this.add.graphics();
    holder.add(skin);
    let cursor = this.cardHeading(holder, section.heading);
    for (const row of section.rows) {
      cursor += this.settingRow(holder, cursor, row) + ROW_GAP;
    }
    const height = cursor - ROW_GAP + CARD_PAD;
    this.cardSkin(holder, skin, height);
    scroll.content.add(holder);
    return height;
  }

  /**
   * One setting: its name on the left, its choices on the right.
   *
   * A settings page is a LIST — one line per setting, names in a column you can run your eye
   * down, controls in a column beside it. The selected tile is the FILLED one: `crayonTile`
   * marks selection with a cinnabar edge on paper and leaves the unselected ones filled gold,
   * which is the game's action-versus-quiet convention and reads backwards on a row of choices.
   */
  private settingRow(holder: Phaser.GameObjects.Container, y: number, row: Row): number {
    const LABEL_WIDTH = 96;
    const GAP = 5;
    const x = CARD_PAD;
    const width = CARD_WIDTH - CARD_PAD * 2;
    const label = this.ui.label(x, y + ROW_HEIGHT / 2, row.name, 'caption', {
      color: INK_UI_HEX.mutedText,
      fontSize: '10px',
      fontStyle: '700',
      wordWrap: { width: LABEL_WIDTH },
    }).setOrigin(0, 0.5);
    label.setLetterSpacing?.(0.8);
    holder.add(label);

    const trackX = x + LABEL_WIDTH + 8;
    const trackWidth = width - LABEL_WIDTH - 8;
    const tileWidth = (trackWidth - GAP * (row.options.length - 1)) / row.options.length;

    row.options.forEach((option, index) => {
      const selected = row.current === option.id;
      const tileX = trackX + index * (tileWidth + GAP);
      holder.add(this.ui.panel({ x: tileX, y, width: tileWidth, height: ROW_HEIGHT }, selected
        ? { fill: INK_UI.goldLight, fillShade: INK_UI.gold, border: INK_UI.cinnabar, borderWidth: 2 }
        : { fill: INK_UI.parchment, fillAlpha: 0.5, border: INK_UI.softBrush, borderWidth: 1.2, muted: true }));
      holder.add(this.ui.label(tileX + tileWidth / 2, y + ROW_HEIGHT / 2, option.label, 'button', {
        color: selected ? '#8a2a1b' : INK_UI_HEX.mutedText,
        fontSize: row.options.length > 3 ? '10px' : '11px',
        fontStyle: selected ? '700' : '400',
        align: 'center',
        wordWrap: { width: tileWidth - 6 },
      }).setOrigin(0.5));
      const hit = this.add
        .rectangle(tileX + tileWidth / 2, y + ROW_HEIGHT / 2, tileWidth, ROW_HEIGHT + 6, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        // A drag that ends on a tile is a scroll, not a choice.
        if (scrollGestureConsumedTap(pointer)) return;
        soundDirector.tap();
        row.pick(option.id);
      });
      holder.add(hit);
    });

    if (!row.note) return ROW_HEIGHT;
    const note = this.add.text(x, y + ROW_HEIGHT + 4, row.note, {
      color: INK_UI_HEX.mutedText,
      fontFamily: UI_FONT,
      fontSize: '9.5px',
      lineSpacing: 2,
      wordWrap: { width },
    });
    holder.add(note);
    return ROW_HEIGHT + 4 + note.height;
  }

  /**
   * Which build this is, and whether there is a better one.
   *
   * Two lines rather than one. The build stamp is a serial number a player reads out to somebody
   * else; the state is a sentence they act on. Run together they were a line nobody finished.
   * Absent entirely where there is no service worker (dev, the native shells): a card that says
   * "unsupported" is a card about the game's plumbing.
   */
  private buildCard(scroll: InkScrollArea, y: number): number {
    const status = getUpdateStatus();
    if (status === 'unsupported') return -CARD_GAP;
    const holder = this.add.container(0, y);
    const skin = this.add.graphics();
    holder.add(skin);
    let cursor = this.cardHeading(holder, t('menu.settings.section.build'));
    const x = CARD_PAD;
    const width = CARD_WIDTH - CARD_PAD * 2;

    const version = this.ui.label(x, cursor, buildStamp(), 'caption', {
      color: INK_UI_HEX.mutedText,
      fontSize: '9px',
    }).setOrigin(0, 0);
    holder.add(version);

    // The manual check is offered only at rest. While anything is in flight the game is already
    // asking, and a button that re-asks a question being answered is a button that does nothing.
    if (status === 'offlineReady') {
      const check = this.ui.textLink(
        x + width,
        cursor + version.height / 2,
        t('menu.update.check'),
        // Forced: a player who taps a button labelled "check for updates" gets a check, not the
        // throttle that keeps the background poll from spending their data.
        () => checkForUpdate(true),
        { fontSize: '9px' },
      );
      // `textLink` lays its type out rightwards from its origin, so right-aligning it means
      // measuring the drawn thing and stepping back by that — its own hit padding included.
      const linkWidth = check.getBounds().width;
      check.setX(check.x - linkWidth);
      // Both halves share one line, and the stamp is the longer half in Vietnamese. If they would
      // meet, the link goes — the version is the thing that has to be readable, and the check it
      // offers happens on its own every half hour anyway.
      if (version.width + 10 + linkWidth <= width) holder.add(check);
      else check.destroy();
    }
    cursor += version.height + 4;

    const line = this.ui.label(x, cursor, t(`menu.update.${status}` as 'menu.update.ready'), 'caption', {
      color: status === 'ready' ? '#8a2a1b' : INK_UI_HEX.mutedText,
      fontSize: '11px',
      fontStyle: status === 'ready' ? '700' : '400',
      wordWrap: { width },
    }).setOrigin(0, 0);
    holder.add(line);
    cursor += line.height;

    if (status === 'ready') {
      cursor += 8;
      holder.add(this.ui.button(
        { x, y: cursor, width, height: 34 },
        t('menu.update.reload'),
        () => applyUpdate(),
        { variant: 'primary', fontSize: '13px' },
      ));
      cursor += 34;
    }

    const height = cursor + CARD_PAD;
    this.cardSkin(holder, skin, height);
    scroll.content.add(holder);
    return height;
  }
}
