/**
 * The install mark beside the build stamp, the once-per-visit tip, and the install sheet.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT } from '../../game/constants';
import { t } from '../../i18n';
import {
  canOfferInstall,
  guideRoute,
  installRoute,
  promptInstall,
  type InstallRoute,
} from '../../pwa/install';
import { INK_UI, INK_UI_HEX, type UIBounds } from '../../ui/InkUI';
import { drawCardIcon } from '../../ui/CardIcons';
import { drawInstallGlyph, type InstallGlyphId } from '../../ui/installGlyphs';
import { UI_FONT } from '../../ui/fonts';
import { INSTALL_MARK_GAP, INSTALL_MARK_SCALE, INSTALL_MARK_SIZE } from './constants';
import type { MenuScene } from '../MenuScene';

// ── Putting the game on the home screen ───────────────────────────────────

/**
 * The install mark: the install glyph, the words *Install app*, and the build stamp — one line.
 *
 * An inline colophon line rather than a row in the column, because installing is not one of the
 * things the player came to this page to do — it is worth offering and not worth spending a
 * button on. It disappears the moment the game is running from the home screen
 * (`canOfferInstall`).
 *
 * **The glyph does not travel alone any more.** It was the arrow and nothing else, on the theory
 * that the caption below it did the explaining for the three seconds it was up — and after that a
 * download arrow beside a version number is a decoration on a version number. Reported in exactly
 * those terms: *instead of showing the download icon only, show "Icon + Install app · version"*.
 * So the line names its own action, permanently, and the caption below it is free to say what
 * installing gets you instead of what the arrow is.
 *
 * The three parts are laid out as one group against whichever way the stamp is anchored — the
 * desktop page corners its stamp and the group grows leftward from that fixed edge; the phone
 * column centres it and the whole group is re-centred. Visual centres, not object origins: the
 * texts are bottom-anchored and the icon is not.
 *
 * It only ever rides a build stamp: the front page's colophon, or a page that reserves the slot
 * with `menuInstallAnchor`. A page carrying neither gets no mark — a 16-unit arrow alone on empty
 * parchment is not a quiet mark but an unexplained one.
 *
 * **No tile, no border, no fill.** A bordered button in the corner of a page whose whole column is
 * bordered buttons reads as a fifth thing to press; ink alone reads as a mark, which is what it
 * is. The glyph comes from `CardIcons` at the exact 0.62 scale of the three utility icons.
 */
export function renderInstallMark(self: MenuScene): void {
  if (!canOfferInstall()) {
    return;
  }

  const versionLine = self.children.list.find(
    (child) => child.getData?.('menuVersionLine') === true,
  ) as Phaser.GameObjects.Text | undefined;

  let anchor: { x: number; y: number } | undefined;
  // The whole line's box, which is what takes the tap. Falls back to the mark's own square on a
  // page that only reserved a slot for the glyph.
  let hitBounds: UIBounds | undefined;
  if (versionLine) {
    /**
     * The words, in ink, between the mark and the stamp.
     *
     * Set in `inkText` at 10px against the stamp's muted 9px, because they are not part of the
     * colophon: the version is a fact about the build and this is a thing the player can do. The
     * middle dot is printed here rather than in the catalog so neither translation has to carry
     * punctuation that belongs to the layout.
     *
     * Only while the stamp is a plain build stamp. Both update states — downloading, and ready to
     * reload — already put their own icon at the line's left and turn the sentence into an
     * instruction, and a second offer wedged into that line would be two calls to action arguing
     * in a 9px strip. The install mark is the quietest thing on the page; it gives way.
     */
    const plain = versionLine.getData('menuVersionPlain') === true;
    const cornered = versionLine.originX === 1;
    const action = plain
      ? self.ui.label(0, versionLine.y, `${t('menu.install.action')} ·`, 'caption', {
        color: INK_UI_HEX.inkText,
        fontSize: '10px',
        fontStyle: '700',
      }).setOrigin(0, 1).setData('menuInstallLabel', true)
      : undefined;

    const WORD_GAP = 4;
    const wordWidth = action ? action.displayWidth + WORD_GAP : 0;
    const groupWidth = INSTALL_MARK_SIZE + INSTALL_MARK_GAP + wordWidth + versionLine.displayWidth;
    // Held inside the sheet: a long stamp in a language with longer words would otherwise push the
    // group's head off the left edge of a centred column.
    const left = Math.max(8, cornered
      ? versionLine.x - groupWidth
      : versionLine.x - groupWidth / 2);

    anchor = {
      x: left + INSTALL_MARK_SIZE / 2,
      y: versionLine.y - versionLine.displayHeight / 2,
    };
    action?.setX(left + INSTALL_MARK_SIZE + INSTALL_MARK_GAP);
    const stampLeft = left + INSTALL_MARK_SIZE + INSTALL_MARK_GAP + wordWidth;
    versionLine.setX(cornered
      ? stampLeft + versionLine.displayWidth
      : stampLeft + versionLine.displayWidth / 2);
    hitBounds = {
      x: left,
      y: versionLine.y - versionLine.displayHeight,
      width: groupWidth,
      height: versionLine.displayHeight,
    };
    if (action) {
      self.content.push(action);
    }
  } else {
    // Any page that keeps its own stamp says where the slot it left is.
    anchor = self.children.list
      .find((child) => child.getData?.('menuInstallAnchor'))
      ?.getData('menuInstallAnchor') as { x: number; y: number } | undefined;
  }
  if (!anchor) {
    return;
  }
  const { x: cx, y: cy } = anchor;
  const box: UIBounds = {
    x: cx - INSTALL_MARK_SIZE / 2,
    y: cy - INSTALL_MARK_SIZE / 2,
    width: INSTALL_MARK_SIZE,
    height: INSTALL_MARK_SIZE,
  };

  const glyph = drawCardIcon(self, 'install', INK_UI.brush)
    .setPosition(cx, cy)
    .setScale(INSTALL_MARK_SCALE)
    .setAlpha(0.78)
    .setData('menuInstallMark', true)
    .setData('footerInline', Boolean(versionLine))
    .setData('visualSize', INSTALL_MARK_SIZE);

  // The tap target is the whole line, not the glyph: the words are the part that reads as
  // pressable, and a player who aims at "Install app" and hits a 16-unit arrow's margin has been
  // shown an offer the page then refuses. Never shorter than 44 — the smallest square either
  // platform's guidance will accept — and its centre is held above the sheet's bottom edge so all
  // 44 units of a colophon eleven units off that edge stay on the canvas.
  const target = hitBounds ?? box;
  const hitCenterY = Math.min(target.y + target.height / 2, GAME_HEIGHT - 22);
  const hit = self.add
    .rectangle(target.x + target.width / 2, hitCenterY, Math.max(44, target.width + 12), 44, 0xffffff, 0.001)
    .setData('menuInstallHit', true)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    openInstall(self);
  });

  self.content.push(glyph, hit);

  // The hint, once per visit. The line now says what pressing it does, so the caption says what
  // installing gets you — offline, full screen, no store — which is the part a player weighs.
  if (!self.installTipShown && !self.installModalOpen) {
    self.installTipShown = true;
    showInstallTip(self, box, target.x + target.width);
  }
}

/**
 * The install line's own caption, set above it and gone in under two seconds.
 *
 * `rightLimit` is the right edge of whatever the caption is about — the colophon's own end. On the
 * desktop scroll that edge is the *column's* (346), not the sheet's, and a caption laid out from
 * the mark's left edge rightward ran off the paper and into the landscape behind it. Aligned to
 * the same edge the line ends at, it cannot.
 */
function showInstallTip(self: MenuScene, box: UIBounds, rightLimit: number): void {
  // Measured first, then the sheet is cut to it — the same order `renderInstallModal` uses, and
  // for the same reason: the line is one length in English and another in Vietnamese.
  const label = self.add.text(0, 0, t('menu.install.tip'), {
    color: INK_UI_HEX.inkText,
    fontFamily: UI_FONT,
    fontSize: '11px',
  }).setOrigin(0, 0);

  const PAD_X = 10;
  const PAD_Y = 6;
  const width = Math.round(label.width + PAD_X * 2);
  const height = Math.round(label.height + PAD_Y * 2);
  // Above the mark and aligned to its left edge, unless that would push its tail past the end of
  // the line it belongs to. Beside the mark would run the caption straight across the support
  // sentence, which is centred in this same band.
  const x = Math.max(8, Math.min(box.x, rightLimit - width));
  const bounds: UIBounds = { x, y: box.y - 8 - height, width, height };

  // The game's own printed surface, not a text object with a background colour behind it. Every
  // other thing on this page that sits *on top of* the page — a card, a modal, the coffee sheet
  // — is an `InkUI` panel with its torn contour and its shade, and a plain rectangle among them
  // reads as a browser tooltip that wandered in.
  const panel = self.ui.panel(bounds, {
    fill: INK_UI.parchment,
    fillShade: INK_UI.parchmentDark,
    border: INK_UI.brush,
    radius: 8,
    borderWidth: 1.6,
  });
  // The tail, pointing down at the mark it is about.
  //
  // A caption floating above an icon is a caption about the whole corner; a caption with a point
  // on it is about that one thing. Drawn rather than taken from the panel because `InkUI.panel`
  // has no notion of a tail — and it is three lines: fill the triangle in the panel's own
  // parchment, then ink only its two sloping sides, so the panel's bottom border reads straight
  // through the top of it instead of being crossed by a line.
  // On the mark itself wherever the panel ended up, not at a fixed inset from its corner.
  const tailX = Phaser.Math.Clamp(box.x + box.width / 2, bounds.x + 12, bounds.x + width - 12);
  const tail = self.add.graphics();
  tail.fillStyle(INK_UI.parchment, 1);
  tail.fillTriangle(tailX - 6, bounds.y + height - 1, tailX + 6, bounds.y + height - 1, tailX, bounds.y + height + 7);
  tail.lineStyle(1.6, INK_UI.brush, 0.9);
  tail.beginPath();
  tail.moveTo(tailX - 6, bounds.y + height - 1);
  tail.lineTo(tailX, bounds.y + height + 7);
  tail.lineTo(tailX + 6, bounds.y + height - 1);
  tail.strokePath();

  label.setPosition(bounds.x + PAD_X, bounds.y + PAD_Y);
  // Built before the panel, so it is under it until told otherwise.
  self.children.bringToTop(label);

  const hit = self.add
    .rectangle(bounds.x + width / 2, bounds.y + height / 2, width, height, 0xffffff, 0.001)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    openInstall(self);
  });

  self.content.push(panel, tail, label, hit);

  self.installTipTimer?.remove();
  // Short on purpose. It is one line naming what the mark under it does, and anybody who wants
  // it can press the mark — a caption that outstays that is a caption sitting on the footer.
  self.installTipTimer = self.time.delayedCall(1800, () => {
    self.installTipTimer = undefined;
    // The page may have been re-rendered out from under it, which destroys these three.
    if (!label.scene) {
      return;
    }
    self.tweens.add({
      targets: [panel, tail, label],
      alpha: 0,
      duration: 420,
      ease: 'Sine.easeOut',
      onComplete: () => {
        panel.destroy();
        tail.destroy();
        label.destroy();
        hit.destroy();
      },
    });
  });
}

/**
 * What the mark does, which is not the same thing on any two platforms.
 *
 * Chromium hands over a real prompt and one tap installs. Everybody else gets the sheet, because
 * everybody else keeps the same command in a menu and there is no API that can reach it. A held
 * prompt that fails falls through to the sheet rather than doing nothing — see `guideRoute`.
 */
function openInstall(self: MenuScene): void {
  if (installRoute() !== 'native') {
    renderInstallModal(self, guideRoute());
    return;
  }
  void promptInstall().then((outcome) => {
    if (!self.scene.isActive()) {
      return;
    }
    if (outcome === 'unavailable') {
      renderInstallModal(self, guideRoute());
      return;
    }
    // Accepted: `canOfferInstall` is false from here and the mark leaves with the re-render.
    // Dismissed: the mark stays, and nothing is said about it.
    self.render();
  });
}

/**
 * Which of the browser's own buttons each step is about.
 *
 * Three per route, in the order the steps run. This table is the reason the sheet is worth
 * opening: a sentence naming a control that is not on this page is a riddle until the control is
 * drawn beside it, and every one of these platforms keeps its install command behind a glyph
 * with no written name — the share square, the ⋮, the little screen at the end of the address bar.
 */
const ROUTE_GLYPHS: Record<Exclude<InstallRoute, 'native' | 'installed'>, readonly InstallGlyphId[]> = {
  // Step three is "tap Add", so it carries the tick, not the home screen: the glyph names the
  // control the sentence asks for, and the phone-with-apps drawn beside "tap Add" was a picture of
  // the *result*, which at 20 units read as a domino.
  'ios-safari': ['share', 'addHome', 'confirm'],
  // Every iOS browser is Safari underneath and every one of them carries the same share sheet, so
  // the first two steps are the same picture; the third is the one that differs — if the row is
  // missing, the answer is Safari itself.
  'ios-other': ['share', 'addHome', 'safari'],
  'android-other': ['dots', 'installApp', 'homeScreen'],
  // Step one is Chromium's own install button, drawn as Chromium draws it. It was the whole
  // address bar with the button inside it — the location as well as the control — and at 20 units
  // the bar reduced the button to three pixels and the picture said nothing. The sentence carries
  // the location; the glyph carries the control.
  desktop: ['installApp', 'bars', 'star'],
};

function renderInstallModal(self: MenuScene, route: Exclude<InstallRoute, 'native' | 'installed'>): void {
  self.closeModal();
  self.installModalOpen = true;
  self.installTipTimer?.remove();
  self.installTipTimer = undefined;

  const group: Record<typeof route, string> = {
    'ios-safari': 'iosSafari',
    'ios-other': 'iosOther',
    'android-other': 'android',
    desktop: 'desktop',
  };
  const steps = [1, 2, 3].map((n) => t(`menu.install.${group[route]}.step${n}` as Parameters<typeof t>[0]));
  const glyphs = ROUTE_GLYPHS[route];

  // Measured, then sized. A three-step sheet asked for a fixed height came out two-thirds empty
  // paper — the steps wrap to one line or two depending on the language and the platform, and
  // there is no number that is right for both. The bodies are built off-screen, their real
  // heights added up, and the sheet cut to fit; then they are moved onto it.
  //
  // The measure lost 26 units to the glyph column, so a step that wrapped to two lines in English
  // may now wrap to three. That is what measuring is for; nothing here assumes a line count.
  const GLYPH_COLUMN = 26;
  const BODY_WIDTH = 362 - 28 - 40 - GLYPH_COLUMN;
  const bodies = steps.map((step) => self.add.text(-999, -999, step, {
    color: '#2a2118',
    fontFamily: UI_FONT,
    fontSize: '13px',
    lineSpacing: 3,
    wordWrap: { width: BODY_WIDTH },
  }).setOrigin(0, 0));
  const stepHeights = bodies.map((body) => Math.max(34, body.height + 18));
  const needed = stepHeights.reduce((sum, height) => sum + height, 0);

  // The line naming the browser these steps are for.
  //
  // Every route's steps are written for one browser and are wrong for the other three, and the
  // player has no way of telling which set they are looking at — a Chrome-on-iOS user following
  // Safari's steps looks for a Share button in the wrong corner and concludes the game is lying.
  // Sniffed, so it can be wrong; stated, so a player it is wrong about can see that at once.
  const forLine = self.add.text(-999, -999, t(`menu.install.for.${group[route]}` as Parameters<typeof t>[0]), {
    color: '#6f6250',
    fontFamily: UI_FONT,
    fontSize: '11px',
    fontStyle: '700',
    wordWrap: { width: 362 - 28 - 40 },
  }).setOrigin(0, 0);
  const forHeight = Math.round(forLine.height + 12);

  // 104 header + 20 the modal's own content inset + the browser line + the steps + a footer band
  // it does not use, because `contentBounds` is measured back off one whether anything is drawn in
  // it or not.
  const modal = self.ui.modal({
    title: t('menu.install.title'),
    subtitle: t('menu.install.subtitle'),
    onClose: () => self.closeModal(),
    height: 104 + 66 + 20 + forHeight + needed,
  });
  self.modalObjects.push(...modal.objects);

  const { contentBounds } = modal;
  let cursor = contentBounds.y + 4;
  forLine.setPosition(contentBounds.x + 10, cursor);
  self.children.bringToTop(forLine);
  self.modalObjects.push(forLine);
  cursor += forHeight;

  bodies.forEach((body, index) => {
    // The number is set in cinnabar on the margin, the way a printed instruction is — it is what
    // makes three sentences read as an order to follow rather than as a paragraph.
    const numeral = self.ui.label(contentBounds.x + 8, cursor + 3, `${index + 1}`, 'title', {
      color: '#8a2a1b',
      fontSize: '17px',
      fontStyle: '700',
    }).setOrigin(0.5, 0);
    // The control itself, between the number and the sentence: the reader's eye goes number →
    // picture → words, which is the order they will use it in — find the button, then read what
    // to do with it.
    const glyph = drawInstallGlyph(self, glyphs[index], INK_UI.brush)
      .setPosition(contentBounds.x + 34, cursor + 11);
    body.setPosition(contentBounds.x + 34 + GLYPH_COLUMN / 2 + 8, cursor);
    // Built before the sheet was, so it is *under* the sheet. Nothing else in this scene needs
    // depth sorting, so the one line that fixes it beats giving the whole modal a depth band.
    self.children.bringToTop(body);
    self.modalObjects.push(numeral, glyph, body);
    cursor += stepHeights[index];
  });
  self.adoptModal();
}
