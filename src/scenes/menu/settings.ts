/**
 * The settings page, the setting row it is built from, and the language line.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import { GAME_HEIGHT, GAME_WIDTH } from '../../game/constants';
import { getLanguage, setLanguage, t, type LanguageCode } from '../../i18n';
import { applyUpdate, buildStamp, checkForUpdate, getUpdateStatus } from '../../pwa/updates';
import { canOfferInstall } from '../../pwa/install';
import { BACK_BAR_HEIGHT, INK_UI, INK_UI_HEX } from '../../ui/InkUI';
import {
  BATTLE_DIFFICULTIES,
  BATTLE_SPEEDS,
  getBattleDifficulty,
  getBattleSpeed,
  setBattleDifficulty,
  setBattleSpeed,
} from '../../game/battleOptions';
import { drawLanguageFlag } from '../../ui/languageFlags';
import { TITLE_FONT } from '../../ui/fonts';
import {
  getMapTheme,
  MAP_THEME_OPTIONS,
  mapThemeIsChoosable,
  OFFERED_MAP_THEMES,
  setMapTheme,
  type MapThemeId,
} from '../../ui/mapTheme';
import {
  GRAPHICS_MODES,
  getGraphicsMode,
  setGraphicsMode,
  applyPendingRenderScale,
  renderScale,
  requestRenderScale,
} from '../../game/graphicsQuality';
import { MOTION_LEVELS, TRAFFIC_DENSITIES, getLifeSettings, setLifeSettings } from '../../game/lifeSettings';
import {
  layoutKind,
  layoutPreference,
  layoutRowOffered,
  setLayoutPreference,
  setUiScale,
  uiScale,
} from '../../platform/layout';
import { fullRefreshEnabled, setFullRefresh, qualityLadder } from '../../game/qualityLadder';
import { soundDirector } from '../../ui/sound/SoundDirector';
import { rungForTier } from '../../game/qualityRungs';
import { INSTALL_MARK_GAP, INSTALL_MARK_SIZE, LANGUAGE_ROW_HEIGHT, LANGUAGE_TOP } from './constants';
import type { MenuScene } from '../MenuScene';

/**
 * One row of mutually exclusive settings: a heading and a strip of tiles.
 *
 * Style, graphics and language were three copies of the same twenty lines, which is why they had
 * drifted to three different tile heights.
 */
/**
 * The language switch: two flags and names under the utility row, the inactive one tappable.
 *
 * On the front page at all because it was three taps in — main, settings, then the row — and that
 * is three taps too many for the one control a player needs *before* they can read the rest of
 * the menu: somebody who cannot read "Settings" cannot find the setting that fixes it.
 *
 * It spent one pass beside Settings, where it read as a pair of buttons offering two comparable
 * things (they are not — one opens a page, the other changes the language of every page), and one
 * pass as a pill in the top-right corner, which is worse: on a phone that corner is under the
 * status bar and nowhere near a thumb. Under the settings button it is where the eye already is
 * when it is looking for settings, inside the column, and the last thing above the footer.
 *
 * BOTH languages are shown, Vietnamese first, with the current one inked and the other in muted
 * type. A single
 * button naming only the other language has to be understood before it can be used; a pair says
 * "these are the two, this is the one you are on" at a glance, and the tap target is unambiguous.
 */
export function renderLanguageSwitch(self: MenuScene, top = LANGUAGE_TOP): void {
  const current = getLanguage();
  const options: Array<{ id: LanguageCode; label: string }> = [
    { id: 'vi', label: 'Tiếng Việt' },
    { id: 'en', label: 'English' },
  ];
  const y = top + LANGUAGE_ROW_HEIGHT / 2;
  const FLAG_WIDTH = 22;
  const FLAG_GAP = 6;
  const OPTION_GAP = 20;

  const labels = options.map((option) => self.ui.label(0, y, option.label, 'button', {
    color: option.id === current ? '#3a2a14' : INK_UI_HEX.mutedText,
    fontSize: '11px',
    fontStyle: option.id === current ? '700' : '400',
  }).setOrigin(0, 0.5));
  const widths = labels.map((label) => FLAG_WIDTH + FLAG_GAP + label.width);
  const total = widths[0] + OPTION_GAP + widths[1];
  let cursor = (GAME_WIDTH - total) / 2;

  labels.forEach((label, index) => {
    const option = options[index];
    const width = widths[index];
    const flag = drawLanguageFlag(self, option.id, FLAG_WIDTH, 14)
      .setPosition(cursor + FLAG_WIDTH / 2, y);
    label.setX(cursor + FLAG_WIDTH + FLAG_GAP);
    self.content.push(flag, label);

    // The whole flag-and-name group is the target; neither the star nor a short word has to be
    // hit exactly. The current language remains inert so the selected state is unambiguous.
    const hit = self.add
      .rectangle(cursor + width / 2, y, width + 12, LANGUAGE_ROW_HEIGHT + 12, 0xffffff, 0.001)
      .setData('languageOption', option.id);
    if (option.id !== current) {
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        setLanguage(option.id);
        self.render();
      });
    }
    self.content.push(hit);
    cursor += width + OPTION_GAP;
  });
}

/**
 * One setting: its name on the left, its choices on the right.
 *
 * Written first as a centred caption with the tiles centred under it, which is how a settings
 * page turns into a poster: five headings floating over five bands of buttons, each pair a
 * separate island, nothing lining up with anything, and the tiles wider than the plate they sit
 * on so the outer ones were cut off by its own border. A settings page is a LIST — one line per
 * setting, names in a column you can run your eye down, controls in a column beside it.
 *
 * The selected tile is the FILLED one. `crayonTile` marks its selection with a cinnabar edge on
 * paper and leaves the unselected ones filled gold, which is the game's action-versus-quiet
 * convention and reads backwards here: every screenshot of this page showed the two unchosen
 * qualities looking chosen and the chosen one looking empty.
 */
function renderSettingRow<T extends string>(self: MenuScene,
  box: { x: number; y: number; width: number; height: number },
  name: string,
  options: ReadonlyArray<{ id: T; label: string }>,
  current: T,
  pick: (id: T) => void,
): void {
  const LABEL_WIDTH = 96;
  const GAP = 5;
  const label = self.ui.label(box.x, box.y + box.height / 2, name, 'caption', {
    color: INK_UI_HEX.mutedText,
    fontSize: '10px',
    fontStyle: '700',
    wordWrap: { width: LABEL_WIDTH },
  }).setOrigin(0, 0.5);
  label.setLetterSpacing?.(0.8);
  self.content.push(label);

  const trackX = box.x + LABEL_WIDTH + 8;
  const trackWidth = box.width - LABEL_WIDTH - 8;
  const tileWidth = (trackWidth - GAP * (options.length - 1)) / options.length;

  options.forEach((option, index) => {
    const selected = current === option.id;
    const x = trackX + index * (tileWidth + GAP);
    self.content.push(self.ui.panel({ x, y: box.y, width: tileWidth, height: box.height }, selected
      ? { fill: INK_UI.goldLight, fillShade: INK_UI.gold, border: INK_UI.cinnabar, borderWidth: 2 }
      : { fill: INK_UI.parchment, fillAlpha: 0.5, border: INK_UI.softBrush, borderWidth: 1.2, muted: true }));
    self.content.push(self.ui.label(x + tileWidth / 2, box.y + box.height / 2, option.label, 'button', {
      color: selected ? '#8a2a1b' : INK_UI_HEX.mutedText,
      fontSize: options.length > 3 ? '10px' : '11px',
      fontStyle: selected ? '700' : '400',
      align: 'center',
      wordWrap: { width: tileWidth - 6 },
    }).setOrigin(0.5));
    const hit = self.add
      .rectangle(x + tileWidth / 2, box.y + box.height / 2, tileWidth, box.height + 6, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => pick(option.id));
    self.content.push(hit);
  });
}

export function renderSettings(self: MenuScene): void {
  // A plate to read on. Small labels sitting straight on a landscape is the one place in the game
  // where the art actively fights the text.
  //
  // Laid out as a LIST: one line per setting, names down the left, controls down the right, and
  // the whole thing measured from the rows rather than from a guess — the plate used to be sized
  // by a formula that did not know how many rows it held, so the last one hung out of the bottom
  // and the widest ones were cut off by its own border.
  const ROW_HEIGHT = 30;
  const PAD = 18;
  const life = getLifeSettings();
  const onOff = [
    { id: 'on' as const, label: t('menu.toggle.on') },
    { id: 'off' as const, label: t('menu.toggle.off') },
  ];

  const plateX = 16;
  const plateWidth = GAME_WIDTH - 32;
  const contentX = plateX + PAD;
  const contentWidth = plateWidth - PAD * 2;
  const settings: Array<{ name: string; build: (y: number) => void }> = [
    {
      name: t('menu.graphics'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.graphics'),
        GRAPHICS_MODES.map((id) => ({ id, label: t(`menu.graphics.${id}` as 'menu.graphics.low') })),
        getGraphicsMode(),
        (id) => {
          if (id === getGraphicsMode()) {
            return;
          }
          setGraphicsMode(id);
          // The ladder's rung override shadows the tier inside `profile()` — without re-pointing
          // it, `renderScale()` keeps answering from the old rung and this tap changes nothing.
          if (id === 'auto') qualityLadder()?.useAuto(); else qualityLadder()?.force(rungForTier(id).id);
          // No reload: the new tier's scale is applied to the live buffer at this boundary
          // and the menu rebuilds itself — labels re-rasterise at the new resolution.
          requestRenderScale(renderScale());
          applyPendingRenderScale(self.game);
          self.scene.restart();
        },
      ),
    },
    {
      name: t('menu.graphics.pacing'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT }, t('menu.graphics.pacing'),
        [{ id: '60', label: '60 FPS' }, { id: 'display', label: t('menu.graphics.display') }],
        fullRefreshEnabled() ? 'display' : '60',
        (id) => { setFullRefresh(id === 'display'); self.scene.restart(); },
      ),
    },
    // The shape of the sheet: the phone column, or the desktop's wide map with the column
    // beside it. Offered only where a desktop is possible — see `layoutRowOffered`.
    ...(layoutRowOffered() ? [{
      name: t('menu.layout'),
      build: (y: number) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        // The row says which layout is actually on the glass, because "Auto" alone does not:
        // a computer in a portrait window is on the phone column, and this is where it finds out.
        `${t('menu.layout')} · ${t(`menu.layout.${layoutKind()}` as 'menu.layout.phone').toUpperCase()}`,
        (['auto', 'phone', 'desktop'] as const).map((id) => ({ id, label: t(`menu.layout.${id}` as 'menu.layout.auto') })),
        layoutPreference(),
        (id) => {
          if (id === layoutPreference()) return;
          setLayoutPreference(id);
          // A full reload, not a scene restart: the sheet's height and width are boot constants
          // every scene has laid itself out against — the same reason the render scale used to
          // reload — and the splash in `index.html` sizes itself from the same rule.
          window.location.reload();
        },
      ),
    }] : []),
    // The interface size, on the desktop sheet only: how big the chrome is drawn against the
    // window. Applies on the next launch, for the same reason the layout does.
    ...(layoutKind() === 'desktop' ? [{
      name: t('menu.uiScale'),
      build: (y: number) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.uiScale'),
        (['small', 'normal', 'large'] as const).map((id) => ({ id, label: t(`menu.uiScale.${id}` as 'menu.uiScale.small') })),
        uiScale(),
        (id) => {
          if (id === uiScale()) return;
          setUiScale(id);
          window.location.reload();
        },
      ),
    }] : []),
    // The map style is not offered any more — see `OFFERED_MAP_THEMES`. The row is dropped
    // rather than drawn with a single choice in it, because a picker with one option is a
    // control that does nothing.
    ...(mapThemeIsChoosable() ? [{
      name: t('menu.mapTheme'),
      build: (y: number) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.mapTheme'),
        MAP_THEME_OPTIONS
          .filter((option) => OFFERED_MAP_THEMES.includes(option.id))
          .map((option) => ({ id: option.id, label: t(option.labelKey) })),
        getMapTheme(),
        (id: MapThemeId) => {
          setMapTheme(id);
          self.scene.restart();
        },
      ),
    }] : []),
    /**
     * ── The fight itself ──
     *
     * Not a graphics setting and not a taste setting about the map: these two change how the game
     * plays. Difficulty is how fast an invader answers the shape you are standing in — the fight
     * is a race between spotting a matchup and being countered out of it, so reaction time is the
     * one number that makes it harder without making it a different game. Pace is how long a
     * round is held on screen.
     *
     * Repeated on the skirmish setup page, which is where a player actually tries them out.
     */
    {
      name: t('arena.difficulty'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.battleDifficulty'),
        BATTLE_DIFFICULTIES.map((id) => ({
          id, label: t(`arena.difficulty.${id}` as 'arena.difficulty.easy'),
        })),
        getBattleDifficulty(),
        (id) => {
          setBattleDifficulty(id);
          self.render();
        },
      ),
    },
    {
      name: t('arena.speed'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.battleSpeed'),
        BATTLE_SPEEDS.map((id) => ({ id, label: t(`arena.speed.${id}` as 'arena.speed.slow') })),
        getBattleSpeed(),
        (id) => {
          setBattleSpeed(id);
          self.render();
        },
      ),
    },
    // ── What the map is allowed to be doing ──
    //
    // Not the same question as graphics quality, which buys pixels. These buy *movement*: every
    // bird, cart and traveller is a live object with a tween on it, and a busy map is a hundred
    // of them ticking at once — a cost a resolution slider cannot answer. They are taste
    // settings too: a player who finds the sky distracting should be able to still it without
    // dropping to a 1x buffer.
    {
      name: t('menu.traffic'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.traffic'),
        TRAFFIC_DENSITIES.map((id) => ({ id, label: t(`menu.traffic.${id}` as 'menu.traffic.none') })),
        life.traffic,
        (id) => {
          setLifeSettings({ traffic: id });
          self.render();
        },
      ),
    },
    {
      name: t('menu.birds'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.birds'),
        onOff,
        life.birds ? 'on' : 'off',
        (id) => {
          setLifeSettings({ birds: id === 'on' });
          self.render();
        },
      ),
    },
    {
      name: t('menu.sounds'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.sounds'),
        // Three states on the one row rather than a MUSIC row under it: at 620 tall the extra
        // row pushed the sheet up over the wordmark. "Effects" is the paper under the thumb with
        // no bed — for a player who wants nothing that could ever read as a music player.
        (['off', 'effects', 'all'] as const).map((id) => ({ id, label: t(`menu.sound.${id}` as 'menu.sound.off') })),
        !soundDirector.isEnabled() ? 'off' : soundDirector.isMusicEnabled() ? 'all' : 'effects',
        (id) => {
          soundDirector.setEnabled(id !== 'off');
          if (id !== 'off') soundDirector.setMusicEnabled(id === 'all');
          self.render();
        },
      ),
    },
    {
      name: t('menu.seasons'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.seasons'),
        onOff,
        life.seasons ? 'on' : 'off',
        (id) => {
          setLifeSettings({ seasons: id === 'on' });
          self.render();
        },
      ),
    },
    // How much the interface itself moves. The reign-end sequence and the ledger's page are
    // choreographed; `reduced` cuts every one of those durations to a beat (`motionMs`).
    {
      name: t('menu.motion'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.motion'),
        MOTION_LEVELS.map((id) => ({ id, label: t(`menu.motion.${id}` as 'menu.motion.full') })),
        life.motion,
        (id) => {
          setLifeSettings({ motion: id });
          self.render();
        },
      ),
    },
    // Last, and still here even though the front page carries a switch of its own: this is where
    // a player goes looking for it, and a settings page that does not list the language is a
    // settings page with a hole in it.
    {
      name: t('menu.language'),
      build: (y) => renderSettingRow(self, 
        { x: contentX, y, width: contentWidth, height: ROW_HEIGHT },
        t('menu.language'),
        [{ id: 'vi' as LanguageCode, label: 'Tiếng Việt' }, { id: 'en' as LanguageCode, label: 'English' }],
        getLanguage(),
        (code) => {
          setLanguage(code);
          self.render();
        },
      ),
    },
  ];

  // The gap between rows gives way before the plate climbs over the wordmark: ten rows at a
  // 12-unit gap on the 620 clamp put the plate's head through the title, and the motion row
  // is the tenth. Eight units still reads as a list; the rows are 30 tall.
  const ROW_GAP = settings.length >= 10 ? 8 : 12;

  const title = self.add.text(GAME_WIDTH / 2, 0, t('menu.settingsTitle'), {
    color: '#2a2118',
    fontFamily: TITLE_FONT,
    fontSize: '20px',
    fontStyle: '700',
    align: 'center',
  }).setOrigin(0.5, 0);

  // The sheet is sized from this sum, and the way back is one fixed control on every page now
  // — see `BACK_BAR_HEIGHT`. Scaled, it came out 27 points tall on a 620 sheet.
  const backHeight = BACK_BAR_HEIGHT;
  // The update block: a rule, one line of type, and — only when there is something to take — the
  // button that takes it. Measured here rather than drawn and hoped for, because the plate is
  // sized from this sum and a short sheet (620) has nothing to spare at the bottom.
  const status = getUpdateStatus();
  const VERSION_LINE = 13;
  const STATUS_LINE = 15;
  const updateButtonHeight = status === 'ready' ? self.vh(34) : 0;
  const updateHeight = status === 'unsupported'
    ? 0
    : 14 + VERSION_LINE + 4 + STATUS_LINE + (updateButtonHeight > 0 ? 8 + updateButtonHeight : 0);
  /**
   * The music credit is not decoration: the battle tracks are CC-BY 4.0, and the licence is
   * only satisfied while the credit is *in the work a player uses*. A line in the repo's
   * LICENSE is invisible to somebody who installed the game from a store, so it lives here,
   * and the plate is measured with it.
   */
  const CREDIT_LINE = 26;
  const plateHeight = PAD + title.height + 20
    + settings.length * ROW_HEIGHT + (settings.length - 1) * ROW_GAP
    + updateHeight
    + CREDIT_LINE
    + 22 + backHeight + PAD;
  const plateTop = Math.max(self.vy(150), Math.min(self.vy(232), GAME_HEIGHT - 24 - plateHeight));

  self.content.push(self.ui.panel(
    { x: plateX, y: plateTop, width: plateWidth, height: plateHeight },
    { fill: INK_UI.parchment, fillAlpha: 0.94 },
  ));

  let cursor = plateTop + PAD;
  title.setY(cursor);
  // Built before the plate, because the plate is sized from its height — and Phaser draws in
  // creation order, so without this the page's own title is behind the page.
  self.children.bringToTop(title);
  self.content.push(title);
  cursor += title.height + 20;

  for (const setting of settings) {
    setting.build(cursor);
    cursor += ROW_HEIGHT + ROW_GAP;
  }
  cursor -= ROW_GAP;

  // The credit the battle music is licensed on. Wrapped to the plate and printed small — it is
  // an obligation, not a feature, and it belongs under the switch that governs the sound.
  cursor += 10;
  self.content.push(self.ui.label(contentX, cursor, t('menu.musicCredit'), 'caption', {
    fontSize: '8.5px',
    align: 'left',
    wordWrap: { width: contentWidth },
  }));
  cursor += CREDIT_LINE - 10;

  // ── Which build this is, and whether there is a better one ──
  //
  // Two lines rather than one. The build stamp is a serial number a player reads out to somebody
  // else; the state is a sentence they act on. Run together they were a line nobody finished.
  if (updateHeight > 0) {
    cursor += 14;

    // The install mark rides this stamp the way it rides the front page's colophon. The slot is
    // reserved here rather than filled in afterwards because the plate owns its own measurements:
    // a glyph dropped in later would land on the serial number.
    const markSlot = canOfferInstall() ? INSTALL_MARK_SIZE + INSTALL_MARK_GAP : 0;
    const version = self.ui.label(contentX + markSlot, cursor, buildStamp(), 'caption', {
      color: INK_UI_HEX.mutedText,
      fontSize: '9px',
    }).setOrigin(0, 0);
    if (markSlot > 0) {
      version.setData('menuInstallAnchor', {
        x: contentX + INSTALL_MARK_SIZE / 2,
        y: cursor + version.displayHeight / 2,
      });
    }
    self.content.push(version);

    // The manual check is offered only at rest. While anything is in flight the game is already
    // asking, and a button that re-asks a question being answered is a button that does nothing.
    if (status === 'offlineReady') {
      const check = self.ui.textLink(
        contentX + contentWidth,
        cursor + VERSION_LINE / 2,
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
      if (markSlot + version.width + 10 + linkWidth <= contentWidth) {
        self.content.push(check);
      } else {
        check.destroy();
      }
    }
    cursor += VERSION_LINE + 4;

    self.content.push(self.ui.label(contentX, cursor, t(`menu.update.${status}` as 'menu.update.ready'), 'caption', {
      color: status === 'ready' ? '#8a2a1b' : INK_UI_HEX.mutedText,
      fontSize: '11px',
      fontStyle: status === 'ready' ? '700' : '400',
      wordWrap: { width: contentWidth },
    }).setOrigin(0, 0));
    cursor += STATUS_LINE;

    if (updateButtonHeight > 0) {
      cursor += 8;
      self.content.push(self.ui.button(
        { x: contentX, y: cursor, width: contentWidth, height: updateButtonHeight },
        t('menu.update.reload'),
        () => applyUpdate(),
        { variant: 'primary', fontSize: '13px' },
      ));
      cursor += updateButtonHeight;
    }
  }
  cursor += 22;

  self.footBackBar();
}
