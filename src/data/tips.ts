/**
 * Which tip to show, and how the launch splash gets one.
 *
 * The lines themselves are in `i18n/catalogs/tips.ts`; this file is only the picker. Two callers
 * that must not agree with each other — the loading paper (`ui/pageLoading`) and the badge on the
 * front page's play button (`scenes/menu/tipBadge`) — plus one that cannot even see them.
 */

import { enTips } from '../i18n/catalogs/tips';
import { getLanguage, t, type TranslationKey } from '../i18n';

/**
 * Derived from the catalog rather than listed again here.
 *
 * A second hand-kept list is a list that drifts: the fiftieth tip gets added to the catalog, the
 * array is not touched, and the tip is translated into two languages and never shown to anybody.
 * `tips.label` is not a tip, which is what the prefix filter is for.
 */
export const TIP_KEYS: readonly TranslationKey[] = Object.keys(enTips)
  .filter((key): key is TranslationKey => key.startsWith('tip.'));

/**
 * The last one shown, so the next one is a different one.
 *
 * Held in the module *and* in storage: within a page life the menu badge and a loading screen are
 * seconds apart and repeating across them reads as a bug, and across page lives the splash would
 * otherwise show the same line every launch to anybody whose `Math.random` starts cold.
 */
const LAST_KEY = 'mandate:tip:last:v1';
let lastShown: string | undefined;

function readLast(): string | undefined {
  if (lastShown) return lastShown;
  try {
    return localStorage.getItem(LAST_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** A tip key, never the one that came before it. */
export function nextTipKey(): TranslationKey {
  const previous = readLast();
  const pool = TIP_KEYS.length > 1 ? TIP_KEYS.filter((key) => key !== previous) : TIP_KEYS;
  const key = pool[Math.floor(Math.random() * pool.length)];
  lastShown = key;
  try {
    localStorage.setItem(LAST_KEY, key);
  } catch {
    // Private mode. The module-level memory still stops an immediate repeat this visit.
  }
  return key;
}

/** The tip itself, in the player's language. */
export function nextTip(): string {
  return t(nextTipKey());
}

/**
 * Hand the fifty lines to `index.html`, which cannot read a catalog.
 *
 * The launch splash paints 350 ms after the document arrives and *six seconds* before the bundle
 * these strings live in has finished parsing — that is the whole reason the splash exists. So the
 * one screen with the most waiting on it is the one screen that cannot call `t()`.
 *
 * Two ways to fix that and only one of them is honest. Inlining fifty tips in two languages into
 * `index.html` puts ~8 kB of duplicated content on the critical path the splash exists to keep
 * short, and makes the document a second source of truth that drifts the first time a tip is
 * reworded. Instead the game writes the catalog out here, once a launch, and the splash reads
 * whatever the *previous* visit left. A first-ever visit has no cache and prints the splash's own
 * inline fallback line; every visit after that gets the full set in the right language.
 */
const SPLASH_TIPS_KEY = 'mandate:tips:v1';

export function cacheTipsForSplash(): void {
  try {
    const language = getLanguage();
    // Key *and* line. The splash cannot read a catalog, but it can record which key it printed
    // into the same `mandate:tip:last:v1` this module reads, so the boot tip and the first
    // loading screen after it are never the same sentence twice.
    const payload = JSON.stringify({
      lang: language,
      label: t('tips.label'),
      tips: TIP_KEYS.map((key) => [key, t(key)]),
    });
    // Storage writes are synchronous IPC on some browsers and this is fifty strings. Skipped when
    // nothing has changed, which is every launch that is not a language change or a new build.
    if (localStorage.getItem(SPLASH_TIPS_KEY) !== payload) {
      localStorage.setItem(SPLASH_TIPS_KEY, payload);
    }
  } catch {
    // Storage blocked or full. The splash falls back to its inline line; nothing else notices.
  }
}
