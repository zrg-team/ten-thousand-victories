/**
 * The player's choice of Dragon Ascent rule version.
 *
 * A preference, like the language and the battle dials — it belongs to the browser, not to a
 * reign. **It decides one thing: which version `newAscentRun` stamps on a new reign.** A run's
 * version is then carried on its config and never re-read from here, so changing it cannot change
 * a reign already in progress, and a save always resumes under the rules it was played with.
 *
 * Unset means `DEFAULT_ASCENT_RULESET`. The old beta opt-in (`mandate:beta:ascent:v1` = `on`) is
 * read as a choice of v2, which is what the beta became; there was no way to record "off", so a
 * player who never opted in simply gets the default too. A stored version this build no longer
 * offers falls back to the default rather than to a rule set nobody can pick.
 *
 * No memo — this is read once per run, and a module-level cache would be one more thing the dev
 * server's second module instance could disagree about.
 */
import {
  ASCENT_RULESET_INFO, DEFAULT_ASCENT_RULESET, normalizeRulesetId, rulesetById,
  type AscentRuleset, type AscentRulesetId,
} from './ascentRuleset';

const RULESET_KEY = 'mandate:ascent:ruleset:v1';
const LEGACY_BETA_KEY = 'mandate:beta:ascent:v1';

export function preferredAscentRuleset(): AscentRulesetId {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_ASCENT_RULESET;
    const chosen = normalizeRulesetId(localStorage.getItem(RULESET_KEY));
    if (chosen && ASCENT_RULESET_INFO[chosen].selectable) return chosen;
    if (localStorage.getItem(LEGACY_BETA_KEY) === 'on') return 'v2';
  } catch { /* a browser that refuses storage plays the default */ }
  return DEFAULT_ASCENT_RULESET;
}

/** Records the choice. Picking the default clears it, so a later default follows automatically. */
export function setPreferredAscentRuleset(id: AscentRulesetId): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(LEGACY_BETA_KEY);
    if (id === DEFAULT_ASCENT_RULESET) localStorage.removeItem(RULESET_KEY);
    else localStorage.setItem(RULESET_KEY, id);
  } catch { /* nothing to remember in a browser that refuses storage */ }
}

/**
 * The rules the next reign will play. For pages outside a run (the menu, the Deck) that word their
 * copy by what the player is about to meet — they read a feature flag here, never an id.
 */
export function preferredAscentRules(): AscentRuleset {
  return rulesetById(preferredAscentRuleset());
}
