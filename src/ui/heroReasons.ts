import { t, type TranslationKey } from '../i18n';

/**
 * A hero service refusal, in words.
 *
 * Every hero command answers with a reason code (`route`, `occupied`, `transit`…) and the words
 * for each live under `hero.depth.reason.*`. Shared so the hero pages and the scene that applies a
 * picker's choice say the same thing about the same refusal.
 */
export function heroReasonText(reason?: string): string {
  return t(`hero.depth.reason.${reason ?? 'unavailable'}` as TranslationKey);
}
