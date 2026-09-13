/**
 * What a champion is doing, as one of a few kinds — the grouping the Heroes page lists them by.
 *
 * `heroPostingLabel` already says *where* a hero is in words, but a list of eight sentences does
 * not answer the question the page is opened for: *who is free, who is fighting, who is lost?* The
 * kinds are that answer, in the order it matters: the free and the endangered first, the settled
 * postings after, the fallen last.
 */
import { liveBattles } from '../systems/ascent/fronts';
import { ourHosts } from '../systems/ascent/battleMembership';
import type { GameState, Hero } from '../state/types';

export type HeroStatus =
  | 'idle' | 'battle' | 'captive' | 'recovering' | 'transit'
  | 'army' | 'land' | 'court' | 'envoy' | 'away' | 'dead';

export const HERO_STATUS_ORDER: readonly HeroStatus[] = [
  'idle', 'battle', 'captive', 'recovering', 'transit', 'army', 'land', 'court', 'envoy', 'away', 'dead',
];

export function heroStatus(state: GameState, hero: Hero): HeroStatus {
  const life = hero.life;
  if (life?.kind === 'dead') return 'dead';
  if (life?.kind === 'captive') return 'captive';
  if (life?.kind === 'recovering') return 'recovering';
  if (life?.kind === 'transit') return 'transit';
  if (life?.kind === 'active' && life.sheltering) return 'away';

  const at = hero.assignedTo;
  if (!at) return 'idle';
  if (at.startsWith('court:')) return 'court';
  if (at.startsWith('ambassador:') || at.startsWith('diplomacy-')) return 'envoy';
  if (state.recruitmentOrders.some((order) => order.id === at)) return 'army';
  if (state.lands.some((land) => land.id === at)) return 'land';
  if (state.armies.some((army) => army.id === at)) {
    const fighting = liveBattles(state).some((battle) => ourHosts(state, battle).some((host) => host.id === at));
    return fighting ? 'battle' : 'army';
  }
  return 'away';
}

/**
 * The three headings the roster is listed under. Eleven headings were measured as too many to
 * read at a glance (reported: *too much group*), so the kinds fold into the question the player
 * actually asks — free, working, or in trouble — and each card's own chips say the rest.
 * Travelling to a post counts as working; sheltering counts as trouble.
 */
export type HeroGroup = 'idle' | 'working' | 'incident';
export const HERO_GROUP_ORDER: readonly HeroGroup[] = ['idle', 'working', 'incident'];

export function heroGroup(status: HeroStatus): HeroGroup {
  if (status === 'idle') return 'idle';
  if (status === 'captive' || status === 'recovering' || status === 'away' || status === 'dead') return 'incident';
  return 'working';
}

/** Kinds that want the player's eye: drawn in cinnabar. Settled postings are jade, the rest muted. */
export function heroStatusTone(status: HeroStatus): 'alert' | 'settled' | 'quiet' {
  if (status === 'idle' || status === 'battle' || status === 'captive') return 'alert';
  if (status === 'army' || status === 'land' || status === 'court' || status === 'envoy') return 'settled';
  return 'quiet';
}
