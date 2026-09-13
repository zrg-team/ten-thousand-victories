/**
 * Beta: the reign's goal is won — end in victory, or rule on (`systems/ascent/Goal.ts`).
 *
 * One fixed page that fits the 620 clamp: the proclamation, a small ledger of what ending here
 * would bank (read live, so it is the Reckoning's own arithmetic), and the two choices, each with
 * the one sentence that says what it does. No close button — the reign cannot carry on until the
 * question is answered, and a blind tap must not end it, so neither choice is a default.
 */
import { computeRunScore } from '../../../state/legacy';
import { INK_UI } from '../../../ui/InkUI';
import { t } from '../../../i18n';
import { goalProvincesPhrase } from '../../../systems/ascent/Goal';
import type { AscentPrompt } from '../../../state/types';
import type { ConquestUIScene } from '../../ConquestUIScene';

export function showGoalWon(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'goal-won' }>): void {
  const state = self.state;
  const goal = state.ascent?.goal;
  const capital = state.lands.find((land) => land.id === state.ascent?.capitalLandId);
  const content = self.promptFrame(
    t('beta.goal.title'),
    (goal?.landsAtWin ?? 0) > 0
      ? t('beta.goal.subtitle', { wave: prompt.wave, capital: capital?.name ?? '', provinces: goalProvincesPhrase(goal?.landsAtWin ?? 0) })
      : t('beta.goal.subtitleAlone', { wave: prompt.wave, capital: capital?.name ?? '' }),
  );

  // What ending here banks. The same numbers the Reckoning will print, because they are the same
  // call — the bonus is already inside `computeRunScore` once the goal is won.
  const score = Math.max(0, Math.round(computeRunScore(state)));
  const bonus = goal?.bonusScore ?? 0;
  const plateH = 92;
  const plateY = content.y + 6;
  self.modalLayer.add(self.ui.panel({ x: content.x, y: plateY, width: content.width, height: plateH },
    { border: INK_UI.gold, borderWidth: 2, fillAlpha: 0.7 }));
  self.modalLayer.add(self.ui.label(content.x + 14, plateY + 10, t('beta.goal.ledgerHead'), 'caption', { fontSize: '10px' }));
  self.modalLayer.add(self.ui.label(content.x + 14, plateY + 26, score.toLocaleString('en-US'), 'label', { fontSize: '28px' }));
  self.modalLayer.add(self.ui.label(content.x + content.width - 14, plateY + 32,
    t('beta.goal.bonusLine', { bonus }), 'caption', { fontSize: '11px', align: 'right' }).setOrigin(1, 0));
  self.modalLayer.add(self.ui.label(content.x + 14, plateY + plateH - 22,
    t('beta.goal.legacyLine', { legacy: Math.round(score / 10) }), 'caption', { fontSize: '10px' }));

  // The two choices. Ending is the primary because it is the new thing this card offers; ruling on
  // is equal in size, because it is never the worse reward (the bonus stays either way).
  const buttonH = 58;
  let y = plateY + plateH + 14;
  let answered = false;
  const answer = (id: string): void => {
    if (answered) return;
    answered = true;
    self.choose(id);
  };
  self.modalLayer.add(self.ui.button({ x: content.x, y, width: content.width, height: buttonH },
    t('beta.goal.end'), () => answer('end'),
    { variant: 'primary', fontSize: '15px', subLabel: t('beta.goal.endSub') }).setData('goalChoice', 'end'));
  y += buttonH + 10;
  self.modalLayer.add(self.ui.button({ x: content.x, y, width: content.width, height: buttonH },
    t('beta.goal.ruleOn'), () => answer('rule-on'),
    { variant: 'secondary', fontSize: '15px', subLabel: t('beta.goal.ruleOnSub', { bonus }) }).setData('goalChoice', 'rule-on'));
}
