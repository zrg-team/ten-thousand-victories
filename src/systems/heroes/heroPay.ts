/**
 * What a champion is paid, and what they think they are worth.
 *
 * Reported 2026-09-15 beside a Books page reading "Bổng lộc anh hùng 46" for seven heroes at a
 * gross of 470: pay never moved. `heroWage` was the template's `upkeepGold` (5–16) whatever the
 * champion had become, so a level-eight general who had won a dozen fields drew the same coin as the
 * day they arrived, and nothing about a hero's pay was ever a decision. The asks, in the player's
 * words: *heroes sometimes ask for a raise, sized to the realm's income, by their level and their
 * character; a good hero who wins a lot and is not raised for a long time may leave — not too hard.*
 *
 * Three pieces, all under `heroRaises`:
 *  - **Earned pay** — the wage climbs with level (`HERO_PAY_PER_LEVEL`), plus every raise granted,
 *    stored as coin a season at the size the realm could afford when it was granted.
 *  - **Temperament** — modest, steady, ambitious or greedy; read from who the hero is (renown against
 *    loyalty) and a stable hash of their id, never a random draw, so the same champion is the same
 *    person in every reign and every replay.
 *  - **Patience** — how many seasons a hero serves before they expect more. It runs out faster for
 *    the greedy, and for anyone who has climbed levels or won battles since they were last raised.
 *    `HeroRaiseSystem` turns an exhausted patience into a card.
 *
 * A leaf: state, config, the ruleset registry and the hero model.
 */
import {
  HERO_PATIENCE_SEASONS,
  HERO_PATIENCE_FLOOR,
  HERO_PATIENCE_PER_LEVEL,
  HERO_PATIENCE_PER_WIN,
  HERO_PAY_PER_LEVEL,
} from '../../game/ascentConfig';
import { rulesOf } from '../../game/ascentRuleset';
import type { GameState, Hero } from '../../state/types';
import { heroLevel } from './heroModel';

export type HeroTemperament = 'modest' | 'steady' | 'ambitious' | 'greedy';

/** A champion's pay history, kept on `hero.growth` so it leaves with them. */
export interface HeroPayState {
  /** Raises granted this service. */
  raises: number;
  /** Coin a season the raises add, fixed at the size each was granted. */
  extra: number;
  /** Season the clock last reset (joined, raised, or rewarded). */
  sinceTurn: number;
  /** Level and wins when the clock last reset: patience runs out faster for what was earned since. */
  levelAt: number;
  winsAt: number;
  /** Season the hero last asked, for the gap between asks. */
  askedTurn?: number;
  /** Times refused since the last raise. */
  refusals: number;
  /** The court has been told this hero will leave if refused again. */
  warned: boolean;
  /** Seasons of neglect already charged to loyalty, so the drip is paced. */
  neglectTurn?: number;
}

/** True when this run pays champions by level and lets them ask for more. */
export function heroRaisesActive(state: GameState): boolean {
  return state.gameMode === 'ascent' && !!state.ascent && rulesOf(state).heroRaises;
}

/** Stable 0–99 from a string (FNV-1a), so a champion's temperament is who they are, not a draw. */
function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

/**
 * Who this champion is about money. Renown over loyalty leans proud; loyalty over renown leans
 * modest; the hash spreads the rest. The king is steady and never asks.
 */
export function heroTemperament(hero: Hero): HeroTemperament {
  if (hero.id === 'king') return 'steady';
  const lean = (hero.stats.renown - hero.stats.loyalty) * 0.6;
  const score = stableHash(hero.id) + lean;
  if (score < 22) return 'modest';
  if (score < 62) return 'steady';
  if (score < 88) return 'ambitious';
  return 'greedy';
}

export function heroPayState(hero: Hero): HeroPayState | undefined {
  return (hero.growth as (Hero['growth'] & { pay?: HeroPayState }) | undefined)?.pay;
}

/** The pay record, created the first time it is read for a serving champion. */
export function ensureHeroPay(state: GameState, hero: Hero): HeroPayState | undefined {
  const growth = hero.growth as (Hero['growth'] & { pay?: HeroPayState }) | undefined;
  if (!growth) return undefined;
  growth.pay ??= {
    raises: 0,
    extra: 0,
    sinceTurn: state.turn,
    levelAt: heroLevel(hero),
    winsAt: hero.battlesWon ?? 0,
    refusals: 0,
    warned: false,
  };
  return growth.pay;
}

/** What the hero's level makes their written wage worth: +15% a level past the first. */
export function heroLevelPayMult(hero: Hero): number {
  return 1 + HERO_PAY_PER_LEVEL * (heroLevel(hero) - 1);
}

/**
 * What the hero's level makes their written wage worth. The literal 1 when the rule is off, for the
 * king, and for a hero with no record.
 */
export function heroEarnedPayMult(state: GameState, hero: Hero): number {
  if (!heroRaisesActive(state) || hero.id === 'king' || !hero.growth) return 1;
  return heroLevelPayMult(hero);
}

/**
 * Coin a season the court's granted raises add, at the size each was granted — added after the
 * round, so a raise of 7 pays 7 at full pay and never grows on its own. 0 when the rule is off.
 */
export function heroPayExtra(state: GameState, hero: Hero): number {
  if (!heroRaisesActive(state) || hero.id === 'king') return 0;
  return heroPayState(hero)?.extra ?? 0;
}

/**
 * Seasons this hero serves before they expect more. Shorter for the proud, and shorter for every
 * level climbed and battle won since the clock last reset — a champion who has carried the realm
 * knows it — never under `HERO_PATIENCE_FLOOR` of their temperament's base.
 */
export function heroPatience(hero: Hero): number {
  const base = HERO_PATIENCE_SEASONS[heroTemperament(hero)];
  const pay = heroPayState(hero);
  const levels = Math.max(0, heroLevel(hero) - (pay?.levelAt ?? heroLevel(hero)));
  const wins = Math.max(0, (hero.battlesWon ?? 0) - (pay?.winsAt ?? (hero.battlesWon ?? 0)));
  const earned = 1 / (1 + HERO_PATIENCE_PER_LEVEL * (heroLevel(hero) - 1 + levels) + HERO_PATIENCE_PER_WIN * wins);
  return Math.round(base * Math.max(HERO_PATIENCE_FLOOR, Math.min(1, earned)));
}

/** Seasons served since the clock last reset. */
export function heroSeasonsUnraised(state: GameState, hero: Hero): number {
  const pay = heroPayState(hero);
  return pay ? Math.max(0, state.turn - pay.sinceTurn) : 0;
}
