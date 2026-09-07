/**
 * The language line on the front page: two flags and names, the inactive one tappable.
 *
 * The settings page itself is `SettingsScene` now — the same kind of page as How to Play and
 * History — and this file keeps only the line the front page still draws.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import { GAME_WIDTH } from '../../game/constants';
import { getLanguage, setLanguage, type LanguageCode } from '../../i18n';
import { INK_UI_HEX } from '../../ui/InkUI';
import { drawLanguageFlag } from '../../ui/languageFlags';
import { LANGUAGE_ROW_HEIGHT, LANGUAGE_TOP } from './constants';
import type { MenuScene } from '../MenuScene';

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
