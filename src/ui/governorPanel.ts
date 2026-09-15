import { effectiveHeroStats } from '../systems/heroes/heroModel';
/**
 * The province-governor picker, as data.
 *
 * The deliberate twin of `focusPanel.ts`: same shape, same split of responsibilities, because the
 * two screens answer the two halves of the same question. The focus decides what the ground is
 * worked for; the governor decides how much more it yields for being worked by the right person.
 *
 * Dragon Ascent's build sheet used to post `idleHeroes[0]` — the first idle hero in state order,
 * with no list, no comparison and no way to choose. That was not a decision the player was making,
 * and it left five of the six hero stats with nothing to say about the map, because
 * `administration` was the only one a province ever read.
 *
 * What makes a hero *fit* here is the match between their stats and what the province is being
 * worked for, so the answer moves when the focus moves. Rendering stays with the scene, as it does
 * for focus rows.
 */
import type { GameState, Hero, HeroStats, Land } from '../state/types';
import { getLandGovernorEffects, governorKeyStat } from '../systems/CourtSystem';
import { getLandAptitude, getLandSpecialization } from '../systems/ResourceSystem';
import { heroEffect, heroName, t } from '../i18n';

/** How well a hero suits this posting, bucketed for display. */
export type GovernorFit = 'high' | 'mid' | 'low';

export interface GovernorRow {
  hero: Hero;
  /** Display name. */
  title: string;
  /** What this hero would actually do here, e.g. "Output +12%". */
  effectLine: string;
  /** Why they do or do not suit this ground, naming the stat the province rewards. */
  fitLine: string;
  /**
   * The champion's own authored effect line.
   *
   * The written roster claims terrain affinities — river villages, forest hills, border roads —
   * that no code reads, and turning those strings into a scoring rule would mean either parsing
   * prose or inventing an affinity data model the roster does not have. So the flavour is honoured
   * where it is cheap and honest: it is shown at the moment the posting is chosen, while the score
   * itself stays driven by stats and focus.
   */
  flavour: string;
  fit: GovernorFit;
  /** 0..1, the raw score the ordering is built from. */
  score: number;
  isCurrent: boolean;
  /** The single best-fitting available hero for this province. */
  isBest: boolean;
}

/** Stat names as the player sees them, for the fit line. */
const STAT_KEY: Record<keyof HeroStats, string> = {
  martial: 'stat.martial',
  logistics: 'stat.logistics',
  administration: 'stat.administration',
  diplomacy: 'stat.diplomacy',
  loyalty: 'stat.loyalty',
  renown: 'stat.renown',
};

function fitOf(score: number): GovernorFit {
  if (score >= 0.62) return 'high';
  if (score >= 0.34) return 'mid';
  return 'low';
}

/**
 * How well one hero suits one province, from 0 to roughly 1.
 *
 * Three terms, in descending weight: the stat this province's focus actually rewards, the
 * administration every governor contributes whatever the focus, and loyalty — which counts
 * everywhere because it drives loyalty regen on every province regardless of what it is for.
 *
 * Scaled by the land's own aptitude for its focus, so a hero matched to a focus the ground cannot
 * support does not read as a great posting. A province that fights its focus is a bad posting for
 * everyone, and the screen should say so.
 */
export function scoreHero(state: GameState, land: Land, hero: Hero): number {
  const stats = effectiveHeroStats(hero);
  const keyStat = governorKeyStat(land);
  const focus = getLandSpecialization(land);
  // `balanced` has no ground to suit or fight, so it neither helps nor penalises the match.
  const aptitude = focus === 'balanced' ? 0.65 : getLandAptitude(land, state)[focus];

  const keyTerm = (stats[keyStat] / 100) * (0.55 + aptitude * 0.35);
  const adminTerm = (stats.administration / 100) * 0.3;
  const loyaltyTerm = (stats.loyalty / 100) * 0.15;
  return Math.max(0, Math.min(1, keyTerm + adminTerm + loyaltyTerm));
}

/**
 * One row per hero who could govern this province, best fit first.
 *
 * Sorted rather than fixed-order — the opposite of `buildFocusRows`, and on purpose. A focus list
 * is the same six every time and is learned by position; a hero roster changes every summon, so
 * there is no position to learn and the useful ordering is the recommendation itself.
 *
 * The current governor is always included, even though they are not idle, so the player can see
 * what they are giving up before replacing them.
 */
export function buildGovernorRows(state: GameState, land: Land): GovernorRow[] {
  const current = state.heroes.find((hero) => hero.assignedTo === land.id);
  const candidates = state.heroes.filter((hero) => hero.id === current?.id || !hero.assignedTo);
  if (candidates.length === 0) {
    return [];
  }

  const scored = candidates.map((hero) => ({ hero, score: scoreHero(state, land, hero) }));
  scored.sort((a, b) => b.score - a.score);
  const bestId = scored[0]?.hero.id;

  return scored.map(({ hero, score }) => {
    const effects = getLandGovernorEffects(state, land, hero);
    const fit = fitOf(score);
    const statName = t(STAT_KEY[effects.keyStat] as Parameters<typeof t>[0]);
    const statValue = effectiveHeroStats(hero)[effects.keyStat];

    const parts = [t('court.fx.output', { v: `+${Math.round((effects.outputMult - 1) * 100)}` })];
    if (effects.defenseMult > 1) {
      parts.push(t('gov.fx.defence', { pct: Math.round((effects.defenseMult - 1) * 100) }));
    }
    if (effects.loyaltyPerTick > 0) {
      parts.push(t('gov.fx.loyalty', { v: effects.loyaltyPerTick.toFixed(2) }));
    }

    return {
      hero,
      title: heroName(hero),
      effectLine: parts.join('  ·  '),
      fitLine: fit === 'high'
        ? t('gov.fitHigh', { stat: statName, value: statValue })
        : fit === 'mid'
          ? t('gov.fitMid', { stat: statName, value: statValue })
          : t('gov.fitLow', { stat: statName, value: statValue }),
      fit,
      score,
      flavour: heroEffect(hero),
      isCurrent: hero.id === current?.id,
      isBest: hero.id === bestId,
    };
  });
}
