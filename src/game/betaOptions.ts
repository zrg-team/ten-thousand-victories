/**
 * The player's opt-in to the Dragon Ascent beta.
 *
 * A preference, like the language and the battle dials — it belongs to the browser, not to a
 * reign. **It is read in exactly one place: `newAscentRun`, when a run is created.** A run's
 * ruleset is then stamped on its config and never re-read from here, so turning the beta off
 * cannot change a reign already in progress, and a save always resumes under the rules it was
 * played with.
 *
 * Defaults to off: every harness and every player who never opens Settings meets the stable game.
 * No memo — this is read once per run, and a module-level cache would be one more thing the dev
 * server's second module instance could disagree about.
 */

const ASCENT_BETA_KEY = 'mandate:beta:ascent:v1';

export function isAscentBetaEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ASCENT_BETA_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setAscentBetaEnabled(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(ASCENT_BETA_KEY, 'on');
    else localStorage.removeItem(ASCENT_BETA_KEY);
  } catch { /* a browser with storage refused still plays the stable game */ }
}
