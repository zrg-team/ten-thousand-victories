/**
 * The BETA mark on the button that starts a reign, while the player has opted into the beta.
 *
 * **A pill inside the button, beside the title.** It began as a jade pill straddling the button's
 * top edge, which read as a sticker that had slipped off it; then as the word run into the label
 * ("Rồng Thăng Long · BETA"), which read as part of the game's name. A badge printed inside the
 * button (`InkButtonOptions.badge`) is both: attached to the control it qualifies, and plainly a
 * status rather than the title. It costs no height, so the column's measured flow is unchanged
 * (`verify-menu-fit`).
 *
 * Nothing changes when the beta is off, so the stable menu is exactly what it was.
 */
import { isAscentBetaEnabled } from '../../game/betaOptions';
import { t } from '../../i18n';

/** The badge the play button wears while the beta is on; `undefined` when it is off. */
export function betaBadgeText(): string | undefined {
  return isAscentBetaEnabled() ? t('beta.badge') : undefined;
}

/** " · beta" after a Continue note when the saved reign plays the beta rules; empty otherwise. */
export function betaSaveSuffix(ruleset: string | undefined): string {
  return ruleset === 'beta' ? ` · ${t('beta.continueTag')}` : '';
}
