/**
 * The small card of advice that leans over the front page's play button.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { sheetSpan } from '../../game/cameraLayout';
import { isDesktopSheet } from '../../game/constants';
import { t } from '../../i18n';
import { nextTipKey } from '../../data/tips';
import { INK_UI, INK_UI_HEX, type UIBounds } from '../../ui/InkUI';
import { UI_FONT } from '../../ui/fonts';
import { measureInkTextWidth } from '../../ui/InkVirtualList';
import type { MenuScene } from '../MenuScene';

const WIDTH = 250;
/** Kept as a number, because the hanging indent stacks its two blocks by hand. */
const LINE_SPACING = 3;
const PAD_X = 11;
const PAD_Y = 9;
const TAIL = 8;
/** How long one tip stands before it fades on its own. Long enough to read two lines twice. */
const HOLD_MS = 9000;

/**
 * Greedy wrap with a short first line — the room the cinnabar lead takes on it.
 *
 * Phaser's own word wrap fits one measure for every line, which is right for a paragraph and
 * wrong for a paragraph that begins beside a label: with the full width on line one the sentence
 * ran under the lead, and with the short width on every line the card wasted a fifth of itself.
 */
function wrapAfterLead(
  scene: MenuScene,
  body: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  width: number,
  leadWidth: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  let room = width - leadWidth;
  for (const word of body.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    // A word longer than the measure goes on the line anyway; the alternative is a loop.
    if (!line || measureInkTextWidth(scene, candidate, style) <= room) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    room = width;
  }
  lines.push(line);
  return lines;
}

/**
 * Raise the badge, once per visit to the front page, a moment after the page settles.
 *
 * **Once, and after a pause.** A card that is already up when the page arrives is part of the
 * page, and the player reads past it on their way to the button underneath. One that leans in a
 * second and a half later is somebody speaking, which is the only reason anybody reads a tip at
 * all. The delay is randomised so a player who bounces off this page four times in a row is not
 * shown the same choreography four times.
 *
 * It never opens over something that is already talking: the first-run tour owns the whole page
 * while it is up (`self.copilot`), and a sheet owns it while it is open. In both cases the badge
 * simply does not arm for this visit — it is the least important thing on the page and it should
 * behave like it.
 */
export function armTipBadge(self: MenuScene): void {
  if (self.tipBadgeShown || self.mode !== 'main' || !self.tipAnchor) {
    return;
  }
  if (self.copilot || self.modalObjects.length > 0) {
    return;
  }
  self.tipBadgeShown = true;
  self.tipBadgeTimer?.remove();
  self.tipBadgeTimer = self.time.delayedCall(1400 + Math.random() * 1600, () => {
    self.tipBadgeTimer = undefined;
    // A page can change out from under a delayed call: the tour may have started, a sheet may
    // have opened, or the player may already be on Classic Modes.
    if (!self.scene.isActive() || self.mode !== 'main' || self.copilot || self.modalObjects.length) {
      return;
    }
    showTipBadge(self);
  });
}

/** Draw one tip over the play button, tail down, and set it to fade. */
function showTipBadge(self: MenuScene): void {
  const anchor = self.tipAnchor;
  if (!anchor) {
    return;
  }

  // **"Mẹo" is cinnabar, the advice is ink.**
  //
  // The other two places the game prints a tip — the launch splash and the loading page — have
  // always set the word in cinnabar and the sentence in muted ink, because the lead is a label and
  // the rest is a sentence. This card was the odd one out: one Phaser `Text` for the whole string,
  // and a Phaser `Text` cannot ink part of itself.
  //
  // So the card is three texts with a hanging indent: the red lead, the first line set beside it,
  // and the remaining lines at the full measure below. The wrap is done here rather than by
  // Phaser's, which knows nothing about the room the lead takes on line one.
  const body = t(nextTipKey());
  const inner = WIDTH - PAD_X * 2;
  const textStyle = {
    color: INK_UI_HEX.inkText,
    fontFamily: UI_FONT,
    fontSize: '11px',
    lineSpacing: LINE_SPACING,
  };
  const lead = self.add.text(0, 0, `${t('tips.label')} ·`, {
    ...textStyle, color: INK_UI_HEX.cinnabarDeep, fontStyle: '700',
  }).setOrigin(0, 0);
  // The gap after the middot, measured in the body's own type rather than assumed.
  const leadWidth = lead.width + measureInkTextWidth(self, ' ', textStyle);
  const lines = wrapAfterLead(self, body, textStyle, inner, leadWidth);
  const first = self.add.text(0, 0, lines[0] ?? '', textStyle).setOrigin(0, 0);
  const rest = lines.length > 1
    ? self.add.text(0, 0, lines.slice(1).join('\n'), textStyle).setOrigin(0, 0)
    : undefined;

  const textHeight = first.height + (rest ? LINE_SPACING + rest.height : 0);
  const height = Math.round(textHeight + PAD_Y * 2);
  /**
   * Above the button on the phone, beside the column on the desktop.
   *
   * The phone page keeps the illustration above its play button, and a card that leans down over
   * a river is a card standing on nothing important. The desktop scroll keeps the *wordmark*
   * there — first shot of it on a wide window put the tip squarely across "Vạn Thắng", which is
   * the one thing on that page a passing aside may not cover. There is a whole landscape to the
   * left of the scroll and nothing in it, so on that layout the card stands in the margin and
   * points sideways at the button instead.
   *
   * Either way it is clamped to the *sheet*, which on the desktop is not 390 wide: `sheetSpan` is
   * the box `InkUI.modal` and the tour lay themselves out in, and on the phone it is exactly
   * 0..390 — one rule, both layouts. Clamped to `GAME_WIDTH`, the desktop card was dragged from
   * the column at x = 417 back to x = 132 and left pointing at open water.
   */
  const span = sheetSpan(self);
  const beside = isDesktopSheet();
  const centreX = anchor.x + anchor.width / 2;
  const bounds: UIBounds = beside
    ? {
      x: Math.round(Math.max(span.left + 8, anchor.x - TAIL - 8 - WIDTH)),
      y: Math.round(anchor.y + anchor.height / 2 - height / 2),
      width: WIDTH,
      height,
    }
    : {
      x: Math.round(Phaser.Math.Clamp(
        centreX - WIDTH / 2, span.left + 8, span.left + span.width - 8 - WIDTH,
      )),
      y: Math.round(anchor.y - TAIL - 6 - height),
      width: WIDTH,
      height,
    };

  // The game's own printed surface — an `InkUI` panel with its torn contour — for the same reason
  // the install hint uses one: a plain filled rectangle among this page's paper reads as a browser
  // tooltip that wandered in. Gold border rather than the brush's black, because this is an aside
  // and it must not weigh what the button under it weighs.
  const panel = self.ui.panel(bounds, {
    fill: INK_UI.parchment,
    fillShade: INK_UI.parchmentDark,
    border: INK_UI.gold,
    borderWidth: 1.4,
    radius: 8,
  });

  // The tail, pointing at the button it is about — down from the card's foot, or right from its
  // edge. Filled in the panel's own parchment first and then inked on its two sloping sides only,
  // so the panel's own border reads straight through the base of it rather than being crossed.
  const tail = self.add.graphics();
  tail.fillStyle(INK_UI.parchment, 1);
  tail.lineStyle(1.4, INK_UI.gold, 0.9);
  tail.beginPath();
  if (beside) {
    const edge = bounds.x + WIDTH - 1;
    const tipY = Math.round(Phaser.Math.Clamp(
      anchor.y + anchor.height / 2, bounds.y + 14, bounds.y + height - 14,
    ));
    tail.fillTriangle(edge, tipY - 7, edge, tipY + 7, edge + TAIL, tipY);
    tail.moveTo(edge, tipY - 7);
    tail.lineTo(edge + TAIL, tipY);
    tail.lineTo(edge, tipY + 7);
  } else {
    const tailX = Math.round(Phaser.Math.Clamp(centreX, bounds.x + 20, bounds.x + WIDTH - 20));
    const foot = bounds.y + height - 1;
    tail.fillTriangle(tailX - 7, foot, tailX + 7, foot, tailX, foot + TAIL);
    tail.moveTo(tailX - 7, foot);
    tail.lineTo(tailX, foot + TAIL);
    tail.lineTo(tailX + 7, foot);
  }
  tail.strokePath();

  lead.setPosition(bounds.x + PAD_X, bounds.y + PAD_Y);
  first.setPosition(bounds.x + PAD_X + leadWidth, bounds.y + PAD_Y);
  rest?.setPosition(bounds.x + PAD_X, bounds.y + PAD_Y + first.height + LINE_SPACING);
  // Built before the panel, so they are under it until told otherwise.
  for (const line of [lead, first, rest]) if (line) self.children.bringToTop(line);

  // Tapping it deals the next tip rather than dismissing it: somebody who touched a card of advice
  // wanted advice. It is its own hit area and not the button's — the badge stands *above* the
  // button's rectangle, so a press here cannot start a run by accident.
  const hit = self.add
    .rectangle(bounds.x + WIDTH / 2, bounds.y + height / 2, WIDTH, height, 0xffffff, 0.001)
    .setInteractive({ useHandCursor: true });
  const parts = [panel, tail, lead, first, ...(rest ? [rest] : []), hit];
  hit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    self.tipBadgeTimer?.remove();
    self.tipBadgeTimer = undefined;
    for (const part of parts) part.destroy();
    showTipBadge(self);
  });

  self.content.push(...parts);

  self.tipBadgeTimer?.remove();
  self.tipBadgeTimer = self.time.delayedCall(HOLD_MS, () => {
    self.tipBadgeTimer = undefined;
    // The page may have been re-rendered out from under it, which destroys these.
    if (!lead.scene) {
      return;
    }
    self.tweens.add({
      targets: [panel, tail, lead, first, ...(rest ? [rest] : [])],
      alpha: 0,
      duration: 420,
      ease: 'Sine.easeOut',
      onComplete: () => {
        for (const part of parts) part.destroy();
      },
    });
  });
}
