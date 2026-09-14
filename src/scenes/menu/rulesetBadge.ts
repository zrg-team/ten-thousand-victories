/**
 * The version mark on the button that starts a reign, when the next reign will not play the default.
 *
 * **A pill inside the button, beside the title** (`InkButtonOptions.badge`) — attached to the control
 * it qualifies, plainly a status rather than part of the game's name, and costing no height, so the
 * column's measured flow is unchanged (`verify-menu-fit`). It began as the beta's mark; with the beta
 * graduated to v2 the same pill now names whatever the player has chosen instead of the default: a
 * legacy version reads "V1", an experiment "V3 · TEST". The default wears nothing.
 */
import { ASCENT_RULESET_INFO, DEFAULT_ASCENT_RULESET, normalizeRulesetId } from '../../game/ascentRuleset';
import { preferredAscentRuleset } from '../../game/rulesetOptions';
import { t } from '../../i18n';
import type { AscentRulesetId } from '../../state/types';

function versionMark(id: AscentRulesetId): string {
  const version = id.toUpperCase();
  return ASCENT_RULESET_INFO[id].status === 'experimental'
    ? t('ruleset.badge.experimental', { version })
    : t('ruleset.badge', { version });
}

/** The badge the play button wears while a non-default version is chosen; `undefined` otherwise. */
export function rulesetBadgeText(): string | undefined {
  const id = preferredAscentRuleset();
  return id === DEFAULT_ASCENT_RULESET ? undefined : versionMark(id);
}

/**
 * " · V1" after a Continue note when the saved reign plays a version other than the default.
 * `ruleset` is the save's raw field: absent is v1, and old saves' `stable` / `beta` are understood.
 */
export function rulesetSaveSuffix(ruleset: string | undefined): string {
  const id = normalizeRulesetId(ruleset) ?? 'v1';
  return id === DEFAULT_ASCENT_RULESET ? '' : ` · ${versionMark(id)}`;
}
