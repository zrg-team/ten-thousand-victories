/**
 * The support row, the version line under it, and the coffee sheet with its QR codes.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../game/constants';
import { t } from '../../i18n';
import {
  applyUpdate,
  BUILD_VERSION,
  buildStamp,
  getIncomingVersion,
  getUpdateStatus,
} from '../../pwa/updates';
import { INK_UI, INK_UI_HEX } from '../../ui/InkUI';
import { CARD_ICON_SIZE, drawCardIcon } from '../../ui/CardIcons';
import { PIGMENT } from '../../ui/ink/palette';
import { UI_FONT } from '../../ui/fonts';
import {
  SUPPORT,
  configuredSupportChannels,
  supportQrTextureKey,
  type SupportChannel,
} from '../../data/support';
import { allowsDonationLinks } from '../../platform/shell';
import { copyToClipboard, openExternalLink } from '../../utils/browser';
import { encodeQr, type QrMatrix } from '../../utils/qr';
import { SUPPORT_ROW_HEIGHT, SUPPORT_TOP, VERSION_EDGE } from './constants';
import type { MenuScene } from '../MenuScene';

/**
 * Draws a QR matrix into `size` design units at (x, y), dark modules in soot on whatever the
 * caller painted underneath (a white plate, with the quiet zone the reader needs).
 *
 * Dark runs are merged along each row and every rectangle is drawn a hair taller than its cell:
 * fractional module widths at RENDER_SCALE 2 otherwise leave antialiased hairline seams between
 * neighbouring modules, and a reader looking for solid finder squares does not care for those.
 */
function drawQrCode(g: Phaser.GameObjects.Graphics, matrix: QrMatrix, x: number, y: number, size: number): void {
  const cell = size / matrix.size;
  g.fillStyle(PIGMENT.muc, 1);
  for (let row = 0; row < matrix.size; row += 1) {
    let start = -1;
    for (let col = 0; col <= matrix.size; col += 1) {
      const dark = col < matrix.size && matrix.modules[row][col];
      if (dark && start < 0) {
        start = col;
      } else if (!dark && start >= 0) {
        g.fillRect(x + start * cell, y + row * cell, (col - start) * cell + 0.2, cell + 0.35);
        start = -1;
      }
    }
  }
}

/** `https://me.momo.vn/6Ofbt…` → `me.momo.vn`; falls back to the bare link if it does not parse. */
function linkHost(link: string): string {
  try {
    return new URL(link).host;
  } catch {
    return link.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

export function renderSupportRow(self: MenuScene): void {
  const row = self.add.container(GAME_WIDTH / 2, SUPPORT_TOP + SUPPORT_ROW_HEIGHT / 2)
    .setData('menuSupportRow', true);

  /**
   * In a store build the sentence loses its first half, because neither store will have it —
   * iOS forbids it, and the Play build is sold, so a second ask does not belong there. A link to
   * the repository is neither a tip nor a purchase, so the second half stays in both cases; see
   * `allowsDonationLinks` for which rule bites where.
   *
   * It stays under a different string, though. Beside the coffee link the short lowercase label
   * reads as a peer action; on its own it needs `improveAlone` to stand up as a complete line.
   *
   * The band stays too, at its full height. `SETTINGS_TOP` is measured up from `SUPPORT_TOP`,
   * so a row that removed itself would leave 46 units of nothing at the foot of the menu and
   * float everything above it.
   */
  const alone = !allowsDonationLinks();
  const improve = self.ui.textLink(
    0,
    0,
    t(alone ? 'menu.support.improveAlone' : 'menu.support.improve'),
    () => openExternalLink(SUPPORT.github),
    { icon: 'hammer', fontSize: '10px' },
  ).setData('menuSupportLink', 'improve');
  const improveWidth = improve.getData('linkWidth') as number;

  if (alone) {
    improve.x = -improveWidth / 2;
    row.add(improve);
    self.content.push(row);
    return;
  }

  const coffee = self.ui.textLink(
    0,
    0,
    t('menu.support.coffee'),
    () => renderSupportModal(self),
    { icon: 'cup', fontSize: '10px' },
  ).setData('menuSupportLink', 'coffee');

  // `textLink` grows its invisible hit area seven units beyond each visual edge. Eighteen visual
  // units therefore leave four real units between the two touch rectangles: close enough to read
  // as one row, but never one merged target.
  const gap = 18;
  const coffeeWidth = coffee.getData('linkWidth') as number;
  const total = coffeeWidth + gap + improveWidth;

  /**
   * These are sibling actions, not a sentence: keep them on one centred line in every language.
   * The scale guard is only for a future translation longer than today's English or Vietnamese;
   * it preserves the one-line contract without allowing either edge to leave the sheet.
   */
  const maxWidth = GAME_WIDTH - 64;
  coffee.x = -total / 2;
  improve.x = coffee.x + coffeeWidth + gap;
  if (total > maxWidth) {
    row.setScale(maxWidth / total);
  }

  row.add([coffee, improve]);
  self.content.push(row);
}

/**
 * The build stamp, centred on the bottom edge — and, while a newer game exists than this one,
 * the line that says so.
 *
 * The update notice used to be its own pill under the gold rule, which parked a red badge on
 * the landscape and read as a second, competing headline under the wordmark. But the page
 * already has a line whose whole job is "which version is this" — so the news lives there
 * instead: while the download is on its way it reads "Downloading version 0.3.1 (current
 * 0.3.0)", and once it has landed it becomes the tap that takes it. The incoming number comes
 * from asking the downloading worker itself (`getIncomingVersion`); a worker that never
 * answers, or answers with the version already running — a redeploy that bumped nothing —
 * falls back to the same words without a number.
 *
 * In the resting state it is the same string the settings page prints — one `buildStamp()`, so
 * the two can never disagree about what is running — and never pressable: a fact about the
 * page, not a way off it.
 *
 * Shrinks rather than wraps in the unlikely event it outgrows the sheet, because there is exactly
 * one line of room here and a wrapped colophon would push itself off the bottom edge.
 */
export function renderVersionLine(self: MenuScene): void {
  const status = getUpdateStatus();
  const incoming = getIncomingVersion();
  const versioned = incoming !== undefined && incoming !== BUILD_VERSION;
  const ready = status === 'ready';
  const installing = status === 'installing';
  let text: string;
  if (installing) {
    text = versioned
      ? t('menu.update.downloadingVersion', { version: incoming, current: BUILD_VERSION })
      : t('menu.update.installing');
  } else if (ready) {
    // The sentence carries its own instruction — "no one knew what to do" with a line that
    // only stated a fact, however red it was.
    text = `${versioned
      ? t('menu.update.readyLine', { version: incoming, current: BUILD_VERSION })
      : t('menu.update.ready')} — ${t('menu.update.tapHere')}`;
  } else {
    text = buildStamp();
  }
  if (!text) {
    return;
  }
  // Anchored to the bottom edge by its own baseline rather than centred in the band, so the air
  // in the band is all above it and the line lands where the sheet ends.
  const line = self.ui.label(GAME_WIDTH / 2, GAME_HEIGHT - VERSION_EDGE, text, 'caption', {
    color: ready ? '#8a2a1b' : INK_UI_HEX.mutedText,
    fontSize: '9px',
    fontStyle: ready || installing ? '700' : '400',
  }).setOrigin(0.5, 1).setData('menuVersionLine', true);
  // Both update states carry an icon at the line's left; the room is spent before the
  // shrink-to-fit so icon and glyphs scale as one thing.
  const maxWidth = GAME_WIDTH - 32 - (ready || installing ? 18 : 0);
  if (line.width > maxWidth) {
    line.setScale(maxWidth / line.width);
  }
  self.content.push(line);

  const iconX = line.x - line.displayWidth / 2 - 11;
  const iconY = line.y - line.displayHeight / 2 - 1;

  if (installing) {
    // A little arrow dropping into a tray, on a loop — the universally-read "downloading",
    // so the line is understood before it is read.
    const ink = 0x6f6250;
    const tray = self.add.graphics({ x: iconX, y: iconY });
    tray.lineStyle(1.4, ink, 0.9);
    tray.beginPath();
    tray.moveTo(-5, 3);
    tray.lineTo(-5, 5.5);
    tray.lineTo(5, 5.5);
    tray.lineTo(5, 3);
    tray.strokePath();
    const arrow = self.add.graphics({ x: iconX, y: iconY - 2 });
    arrow.lineStyle(1.6, ink, 1);
    arrow.beginPath();
    arrow.moveTo(0, -5);
    arrow.lineTo(0, 2);
    arrow.moveTo(-2.8, -0.6);
    arrow.lineTo(0, 2.2);
    arrow.lineTo(2.8, -0.6);
    arrow.strokePath();
    const drop = self.tweens.add({
      targets: arrow, y: arrow.y + 3, alpha: { from: 1, to: 0.35 },
      duration: 640, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    arrow.once('destroy', () => drop.stop());
    self.content.push(tray, arrow);
  }

  if (ready) {
    // A checked circle — the download is done — and a slow breathing pulse on the whole
    // line, because a call to action on the quietest strip of the page has to move to be
    // seen at all.
    const red = 0x8a2a1b;
    const icon = self.add.graphics({ x: iconX, y: iconY });
    icon.lineStyle(1.5, red, 1);
    icon.strokeCircle(0, 0, 6);
    icon.lineStyle(1.8, red, 1);
    icon.beginPath();
    icon.moveTo(-2.6, 0.2);
    icon.lineTo(-0.7, 2.2);
    icon.lineTo(3, -2.2);
    icon.strokePath();
    const pulse = self.tweens.add({
      targets: [line, icon], alpha: { from: 1, to: 0.55 },
      duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    icon.once('destroy', () => pulse.stop());
    self.content.push(icon);

    // 9px type on the very edge of the sheet; a finger needs more paper than the glyphs cover.
    const hit = self.add
      .rectangle(
        GAME_WIDTH / 2,
        line.y - line.displayHeight / 2,
        Math.max(line.displayWidth + 44, 200),
        line.displayHeight + 18,
        0xffffff,
        0.001,
      )
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => applyUpdate());
    self.content.push(hit);
  }
}

/**
 * The coffee modal.
 *
 * One channel at a time, chosen by a pair of tabs, because the thing that has to be big is the
 * code: a player on a laptop pays by pointing a phone at the screen, and a code squeezed under
 * two stacked cards is not scannable from arm's length. Under the tabs: what the channel is, the
 * detail a sender would type by hand, Open (the phone path) and Copy link, then the code (the
 * desktop path) — MoMo's own VietQR image when it has been dropped in, otherwise one drawn from
 * the link itself, which any phone camera reads.
 *
 * Everything is measured as it is placed, so a Vietnamese hint that runs a line longer only
 * moves what is under it and the code takes whatever room is left. Nothing sits at a hard y.
 */
export function renderSupportModal(self: MenuScene, activeId?: SupportChannel['id']): void {
  // An id means a channel tile was pressed and this sheet is redrawing itself in place. Only the
  // first call — the one from the coffee link — is an arrival; replaying it on every tile tap
  // would make the sheet flinch each time somebody compared two of them.
  const arriving = activeId === undefined;
  self.closeModal();
  const channels = configuredSupportChannels();
  const active = channels.find((c) => c.id === activeId) ?? channels[0];

  const HEADER = 104;
  const FOOTER = 66;
  const QR_MAX = 200;
  // Ask for the height the content wants; `modal` caps it at the sheet and the code shrinks to
  // what is left. The empty state has no thanks line and gives the footer band back.
  const wanted = HEADER + FOOTER + 20 + (active ? 214 + QR_MAX + 16 : 124 - FOOTER);

  const modal = self.ui.modal({
    title: t('menu.support.title'),
    subtitle: t('menu.support.subtitle'),
    onClose: () => self.closeModal(),
    height: wanted,
  });
  self.modalObjects.push(...modal.objects);
  const { contentBounds, footerBounds } = modal;
  const centreX = contentBounds.x + contentBounds.width / 2;
  let cursor = contentBounds.y;

  if (!active) {
    const body = self.add.text(centreX, cursor + 6, t('menu.support.none'), {
      color: '#2a2118', fontFamily: UI_FONT, fontSize: '13px', align: 'center', lineSpacing: 3,
      wordWrap: { width: contentBounds.width - 24 },
    }).setOrigin(0.5, 0);
    self.modalObjects.push(body);
    cursor += body.height + 18;
    self.modalObjects.push(self.ui.button(
      { x: centreX - 100, y: cursor, width: 200, height: 40 },
      t('menu.support.github'),
      () => openExternalLink(SUPPORT.github),
      { variant: 'primary', fontSize: '14px' },
    ));
    return;
  }

  // Tabs — only when there is a choice to make.
  if (channels.length > 1) {
    const tabHeight = 30;
    const tabWidth = Math.floor((contentBounds.width - 8 * (channels.length - 1)) / channels.length);
    channels.forEach((channel, index) => {
      const selected = channel.id === active.id;
      const bounds = { x: contentBounds.x + index * (tabWidth + 8), y: cursor, width: tabWidth, height: tabHeight };
      const tile = self.ui.crayonTile(bounds, { selected, accent: channel.id === 'momo' ? INK_UI.cinnabar : INK_UI.jade });
      const label = self.ui.label(bounds.x + bounds.width / 2, cursor + tabHeight / 2, t(`menu.support.${channel.id}.title`), 'button', {
        color: '#211103', fontSize: '12px', fontStyle: selected ? '700' : '400', align: 'center',
      }).setOrigin(0.5);
      // A glyph apiece: a globe for the one that takes any currency from anywhere, a phone for
      // the one you open on a phone. The two labels are both "<name> · <place>" at the same size
      // in the same weight, and a tab strip whose only difference is the letters is a tab strip
      // you have to read. Grouped with the label and centred with it, as on a button.
      const glyph = drawCardIcon(self, channel.id === 'momo' ? 'phone' : 'globe', PIGMENT.muc);
      const glyphScale = 0.56;
      glyph.setScale(glyphScale).setAlpha(selected ? 0.9 : 0.6);
      const glyphWidth = CARD_ICON_SIZE * glyphScale;
      const group = glyphWidth + 6 + label.width;
      glyph.setPosition(bounds.x + bounds.width / 2 - group / 2 + glyphWidth / 2, cursor + tabHeight / 2);
      label.setX(bounds.x + bounds.width / 2 - group / 2 + glyphWidth + 6 + label.width / 2);
      self.modalObjects.push(glyph);
      const hit = self.add.rectangle(bounds.x + bounds.width / 2, cursor + tabHeight / 2, bounds.width, tabHeight, 0xffffff, 0.001)
        .setInteractive(selected ? undefined : { useHandCursor: true });
      hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (!selected) {
          renderSupportModal(self, channel.id);
        }
      });
      self.modalObjects.push(tile, label, hit);
    });
    cursor += tabHeight + 14;
  }

  const hint = self.add.text(contentBounds.x + 6, cursor, t(`menu.support.${active.id}.hint`), {
    color: '#5a4c39', fontFamily: UI_FONT, fontSize: '11px', lineSpacing: 2,
    wordWrap: { width: contentBounds.width - 12 },
  }).setOrigin(0, 0);
  self.modalObjects.push(hint);
  cursor += hint.height + 10;

  // What a sender types by hand — the tag — with Open and Copy link on the same row, right-
  // aligned. A channel with no tag shows the link's host instead: `me.momo.vn` says what it is,
  // and the full address is one tap away on either button, so nobody has to read the token.
  const link = active.link.trim();
  const shownHandle = active.handle.trim() || linkHost(link);
  const rowHeight = 30;
  let bx = contentBounds.x + contentBounds.width - 4;
  const copyWidth = 96;
  bx -= copyWidth;
  const copyX = bx;
  self.modalObjects.push(self.ui.button({ x: copyX, y: cursor, width: copyWidth, height: rowHeight }, t('menu.support.copy'), () => {
    void copyToClipboard(link || shownHandle).then((ok) => {
      if (ok) {
        flashCopied(self, copyX + copyWidth / 2, cursor - 6);
      }
    });
  }, { variant: 'secondary', fontSize: '12px' }));
  if (link) {
    const openWidth = 64;
    bx -= openWidth + 8;
    self.modalObjects.push(self.ui.button({ x: bx, y: cursor, width: openWidth, height: rowHeight }, t('menu.support.open'), () => {
      openExternalLink(link);
    }, { variant: 'primary', fontSize: '12px' }));
  }
  const handle = self.add.text(contentBounds.x + 6, cursor + rowHeight / 2, shownHandle, {
    color: '#2a2118', fontFamily: UI_FONT, fontSize: '14px', fontStyle: '700',
    backgroundColor: 'rgba(243,230,196,0.9)', padding: { x: 7, y: 4 },
    wordWrap: { width: Math.max(60, bx - 10 - (contentBounds.x + 6)), useAdvancedWrap: true },
  }).setOrigin(0, 0.5);
  self.modalObjects.push(handle);
  cursor += Math.max(rowHeight, handle.height) + 14;

  // The code: the official image when it is there, else one drawn from the link.
  const qrKey = supportQrTextureKey(active);
  const hasImage = Boolean(active.qrImage && self.textures.exists(qrKey));
  const drawn = !hasImage && link ? encodeQr(link, 'M') : null;

  // Two captions sit under the code; whatever height is left after them is the code's.
  const how = self.add.text(centreX, 0, t('menu.support.how'), {
    color: '#5a4c39', fontFamily: UI_FONT, fontSize: '10.5px', align: 'center', lineSpacing: 2,
    wordWrap: { width: contentBounds.width - 24 },
  }).setOrigin(0.5, 0);
  const scanLabel = self.add.text(centreX, 0, hasImage ? t('menu.support.qrHint') : t('menu.support.qrPhone'), {
    color: '#5a4c39', fontFamily: UI_FONT, fontSize: '10px', align: 'center',
  }).setOrigin(0.5, 0);
  self.modalObjects.push(how, scanLabel);

  const contentBottom = contentBounds.y + contentBounds.height;
  const captions = scanLabel.height + 6 + how.height + 6;
  const plate = 8; // white margin around the code — the quiet zone a reader needs
  const qrSize = Math.max(96, Math.min(QR_MAX, contentBottom - cursor - captions - plate * 2));

  if (hasImage || drawn) {
    const g = self.add.graphics();
    const left = centreX - qrSize / 2;
    g.fillStyle(0xffffff, 1);
    g.fillRect(left - plate, cursor - plate, qrSize + plate * 2, qrSize + plate * 2);
    g.lineStyle(1.2, INK_UI.brush, 0.6);
    g.strokeRect(left - plate, cursor - plate, qrSize + plate * 2, qrSize + plate * 2);
    self.modalObjects.push(g);
    if (hasImage) {
      const source = self.textures.get(qrKey).getSourceImage() as { width: number; height: number };
      const fit = Math.min(qrSize / source.width, qrSize / source.height);
      self.modalObjects.push(self.add.image(centreX, cursor + qrSize / 2, qrKey).setDisplaySize(source.width * fit, source.height * fit));
    } else if (drawn) {
      drawQrCode(g, drawn, left, cursor, qrSize);
    }
    cursor += qrSize + plate + 6;
  }
  scanLabel.setY(cursor);
  cursor += scanLabel.height + 6;
  how.setY(cursor);

  self.modalObjects.push(self.add.text(footerBounds.x + footerBounds.width / 2, footerBounds.y + footerBounds.height / 2, t('menu.support.thanks'), {
    color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '11px', align: 'center', fontStyle: 'italic',
    wordWrap: { width: footerBounds.width - 16 },
  }).setOrigin(0.5));

  // Last, once every piece is where it belongs: the sheet's two captions are only given their
  // final line once the code above them has taken the height it wants, and an arrival measured
  // before that would carry half the sheet back to the wrong place.
  if (arriving) {
    self.revealPage(self.modalObjects);
  }
  self.adoptModal();
}

/** A small "Copied ✓" that rises off the button and fades. */
function flashCopied(self: MenuScene, x: number, y: number): void {
  const note = self.add.text(x, y, t('menu.support.copied'), {
    color: '#fbf2df', fontFamily: UI_FONT, fontSize: '11px', fontStyle: '700',
    backgroundColor: 'rgba(42,33,24,0.92)', padding: { x: 7, y: 3 },
  }).setOrigin(0.5, 1);
  self.modalObjects.push(note);
  self.tweens.add({
    targets: note, y: y - 14, alpha: { from: 1, to: 0 }, duration: 1300, ease: 'Sine.easeOut',
    onComplete: () => note.destroy(),
  });
}
