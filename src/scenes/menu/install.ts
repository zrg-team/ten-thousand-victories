/**
 * The install mark beside the build stamp, the once-per-visit tip, and the install sheet.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../game/constants';
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
import { UI_FONT } from '../../ui/fonts';
import { INSTALL_MARK_GAP, INSTALL_MARK_SCALE, INSTALL_MARK_SIZE } from './constants';
import type { MenuScene } from '../MenuScene';

// ── Putting the game on the home screen ───────────────────────────────────

/**
 * The install mark: the shared install glyph beside the build stamp, and nothing else.
 *
 * An inline colophon mark rather than a row in the column, because installing is not one of the
 * things the player came to this page to do — it is worth offering and not worth spending a
 * button on. It disappears the moment the game is running from the home screen
 * (`canOfferInstall`).
 *
 * It only ever rides a build stamp: the front page's colophon, or the settings plate's own
 * version line, which reserves the slot for it. A page carrying neither gets no mark. The
 * previous rule kept a bottom-left fallback for those pages, and a 16-unit arrow alone on empty
 * parchment is not a quiet mark but an unexplained one — on the settings page it sat below the
 * plate, attached to nothing, captioned by nothing, and read as a printing fault.
 *
 * **No tile, no border, no fill.** A bordered button in the corner of a page whose whole column
 * is bordered buttons reads as a fifth thing to press; the ink alone reads as a mark, which is
 * what it is. It is the quietest thing on the sheet on purpose — the caption below is what tells
 * anybody it is there, and after three seconds the mark is meant to be furniture.
 *
 * The glyph comes from `CardIcons` and uses the exact 0.62 scale of the three utility icons.
 * The previous one-off drawing occupied a 30-unit box against their 16-unit marks, which is the
 * inconsistency this shared source removes.
 */
export function renderInstallMark(self: MenuScene): void {
  if (!canOfferInstall()) {
    return;
  }

  const versionLine = self.children.list.find(
    (child) => child.getData?.('menuVersionLine') === true,
  ) as Phaser.GameObjects.Text | undefined;

  let anchor: { x: number; y: number } | undefined;
  if (versionLine) {
    /**
     * Icon, gap, stamp — one group, laid out against whichever way the stamp is anchored.
     *
     * The desktop page corners its stamp (`renderVersionLine`), so there the group grows leftward
     * from a fixed edge and the line itself does not move; the phone column centres it, and there
     * the pair has to be re-centred as one. Re-centring a cornered line pushed its tail off the
     * column, which is why the two cases are told apart rather than averaged.
     *
     * Visual centres, not object origins: the text is bottom-anchored and the icon is not.
     */
    const cornered = versionLine.originX === 1;
    if (cornered) {
      anchor = {
        x: versionLine.x - versionLine.displayWidth - INSTALL_MARK_GAP - INSTALL_MARK_SIZE / 2,
        y: versionLine.y - versionLine.displayHeight / 2,
      };
    } else {
      const groupWidth = INSTALL_MARK_SIZE + INSTALL_MARK_GAP + versionLine.displayWidth;
      const left = versionLine.x - groupWidth / 2;
      anchor = {
        x: left + INSTALL_MARK_SIZE / 2,
        y: versionLine.y - versionLine.displayHeight / 2,
      };
      versionLine.setX(left + INSTALL_MARK_SIZE + INSTALL_MARK_GAP + versionLine.displayWidth / 2);
    }
  } else {
    // Any page that keeps its own stamp says where the slot it left is. Today that is the
    // settings plate and nothing else.
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
    .setAlpha(0.64)
    .setData('menuInstallMark', true)
    .setData('footerInline', Boolean(versionLine))
    .setData('visualSize', INSTALL_MARK_SIZE);

  // The tap target is bigger than the mark, because the mark is small on purpose and a thumb
  // is not. 44 is the smallest square either platform's guidance will accept.
  // The colophon sits eleven units above the lower edge. Centre the hit area higher than the ink
  // so all 44 units remain on the canvas while still covering the mark.
  const hitCenterY = Math.min(cy, GAME_HEIGHT - 22);
  const hit = self.add
    .rectangle(cx, hitCenterY, 44, 44, 0xffffff, 0.001)
    .setData('menuInstallHit', true)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    openInstall(self);
  });

  self.content.push(glyph, hit);

  // The hint, once per visit. A mark in a corner that has never been pressed is a mark nobody
  // knows is pressable, and this one is offering the difference between a browser tab and an
  // app — so it says what it is, briefly, and then gets out of the way.
  if (!self.installTipShown && !self.installModalOpen) {
    self.installTipShown = true;
    showInstallTip(self, box);
  }
}

/** The corner mark's own caption, set above it and gone in under two seconds. */
function showInstallTip(self: MenuScene, box: UIBounds): void {
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
  // Above the mark and aligned to its left edge. Beside it would run the caption straight across
  // the support sentence, which is centred in this same band.
  const bounds: UIBounds = { x: box.x, y: box.y - 8 - height, width, height };

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
  const tailX = bounds.x + 14;
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

  // Measured, then sized. A three-step sheet asked for a fixed height came out two-thirds empty
  // paper — the steps wrap to one line or two depending on the language and the platform, and
  // there is no number that is right for both. The bodies are built off-screen, their real
  // heights added up, and the sheet cut to fit; then they are moved onto it.
  const BODY_WIDTH = 362 - 28 - 40;
  const bodies = steps.map((step) => self.add.text(-999, -999, step, {
    color: '#2a2118',
    fontFamily: UI_FONT,
    fontSize: '13px',
    lineSpacing: 3,
    wordWrap: { width: BODY_WIDTH },
  }).setOrigin(0, 0));
  const stepHeights = bodies.map((body) => Math.max(28, body.height + 16));
  const needed = stepHeights.reduce((sum, height) => sum + height, 0);

  // 104 header + 20 the modal's own content inset + the steps + a footer band it does not use,
  // because `contentBounds` is measured back off one whether anything is drawn in it or not.
  const modal = self.ui.modal({
    title: t('menu.install.title'),
    subtitle: t('menu.install.subtitle'),
    onClose: () => self.closeModal(),
    height: 104 + 66 + 20 + needed,
  });
  self.modalObjects.push(...modal.objects);

  const { contentBounds } = modal;
  let cursor = contentBounds.y + 4;
  bodies.forEach((body, index) => {
    // The number is set in cinnabar on the margin, the way a printed instruction is — it is what
    // makes three sentences read as an order to follow rather than as a paragraph.
    const numeral = self.ui.label(contentBounds.x + 10, cursor + 2, `${index + 1}`, 'title', {
      color: '#8a2a1b',
      fontSize: '17px',
      fontStyle: '700',
    }).setOrigin(0.5, 0);
    body.setPosition(contentBounds.x + 28, cursor);
    // Built before the sheet was, so it is *under* the sheet. Nothing else in this scene needs
    // depth sorting, so the one line that fixes it beats giving the whole modal a depth band.
    self.children.bringToTop(body);
    self.modalObjects.push(numeral, body);
    cursor += stepHeights[index];
  });
  self.adoptModal();
}
