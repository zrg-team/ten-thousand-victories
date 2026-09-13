/**
 * The BETA mark on the button that starts a reign, while the player has opted into the beta.
 *
 * A pill straddling the button's top edge at its right end rather than a sub-label: the phone's
 * play button is 48 units on the shortest sheet and has no room for a second line, and the mark
 * must not change the column's measured flow (`verify-menu-fit`). Jade, not cinnabar — the game's
 * tone grammar keeps cinnabar for alarm; this is an invitation, not a warning.
 *
 * Nothing is drawn when the beta is off, so the stable menu is exactly what it was.
 */
import { isAscentBetaEnabled } from '../../game/betaOptions';
import { t } from '../../i18n';
import { INK_UI, type UIBounds } from '../../ui/InkUI';
import { UI_FONT } from '../../ui/fonts';
import type { MenuScene } from '../MenuScene';

export function drawBetaBadge(self: MenuScene, bounds: UIBounds): void {
  if (!isAscentBetaEnabled()) return;
  // The plate first: a Graphics added after the text paints over it, and the mark read as a blank
  // jade lozenge in the first screenshot.
  const pill = self.add.graphics();
  const label = self.add.text(0, 0, t('beta.badge'), {
    fontFamily: UI_FONT,
    fontSize: '9px',
    fontStyle: '700',
    color: '#fbf2df',
  }).setOrigin(0.5);
  label.setLetterSpacing(1.2);
  const width = Math.max(36, Math.ceil(label.width) + 14);
  const height = 16;
  const x = bounds.x + bounds.width - width - 12;
  const y = bounds.y - height / 2;
  pill.fillStyle(INK_UI.jade, 1);
  pill.fillRoundedRect(x, y, width, height, height / 2);
  pill.lineStyle(1, INK_UI.brush, 0.55);
  pill.strokeRoundedRect(x, y, width, height, height / 2);
  label.setPosition(x + width / 2, y + height / 2);
  self.content.push(pill.setData('menuBetaBadge', true), label.setData('menuBetaBadge', true));
}

/** " · beta" after a Continue note when the saved reign plays the beta rules; empty otherwise. */
export function betaSaveSuffix(ruleset: string | undefined): string {
  return ruleset === 'beta' ? ` · ${t('beta.continueTag')}` : '';
}
