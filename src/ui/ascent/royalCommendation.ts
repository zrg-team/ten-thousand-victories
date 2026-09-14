import Phaser from 'phaser';
import type { AscentBattleRecord } from '../../state/types';

/**
 * The royal commendation: the drawn dragon, the grade behind it, and the words the court says.
 *
 * It was written inside `BattleArenaScene` and stayed there, so the one screen that showed it was
 * the Skirmish report — a mode you reach from the front page. **Every fight inside a run** ended on
 * the aftermath sheet instead, which had the verdict and the bill but no seal and no commendation:
 * reported as *the mock looks good with the icon, the release does not render the dragon sign*. It
 * could not: nothing in a run ever loaded the print.
 *
 * So the three things both screens need live here — the texture's name, a loader that fetches it
 * once, and the grade — and each screen keeps its own layout, because one is a ceremonial sheet
 * and the other is a page in a lane.
 */
export const ROYAL_COMMENDATION_TEXTURE = 'battle-royal-commendation-v1';

const ART_PATH = 'art/battle-royal-commendation-v1.webp';

/** Queues the print on a scene's own preload, where the loader is already running. */
export function preloadRoyalCommendation(scene: Phaser.Scene, base: string): void {
  if (scene.textures.exists(ROYAL_COMMENDATION_TEXTURE)) return;
  scene.load.image(ROYAL_COMMENDATION_TEXTURE, `${base}${ART_PATH}`);
}

/**
 * Fetches the print after boot, for a screen that is opened rather than loaded into.
 *
 * A quarter of a megabyte is not worth putting on every map's boot for a sheet that appears after
 * a battle, so a run loads it the first time one ends and keeps it for the rest of the session.
 * `onReady` fires once the texture is in — the caller redraws then; until it does, the screen draws
 * the plain seal rather than a hole.
 */
export function ensureRoyalCommendation(scene: Phaser.Scene, base: string, onReady: () => void): boolean {
  if (scene.textures.exists(ROYAL_COMMENDATION_TEXTURE)) return true;
  if (scene.load.isLoading()) return false;
  scene.load.image(ROYAL_COMMENDATION_TEXTURE, `${base}${ART_PATH}`);
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    // The scene may have gone while the bytes were in the air.
    if (scene.scene.isActive() && scene.textures.exists(ROYAL_COMMENDATION_TEXTURE)) onReady();
  });
  scene.load.start();
  return false;
}

/**
 * What the fight was worth, out of five.
 *
 * Winning is most of it but deliberately not all of it: a victory that spends the whole host to
 * buy a field is not the same as one that walks off it. The other three terms are the ones a
 * player can actually feel — how many came back, how the exchange went, and whether the odds
 * were against you when it started.
 *
 * Losing floors at one star rather than zero. A defeat is already the feedback; a zero on top of
 * it is a scolding, and the screen exists to make people fight again.
 */
export function gradeFight(record: AscentBattleRecord): { stars: number; score: number } {
  const ourLost = Math.max(0, record.ourStart - record.ourEnd);
  const theirLost = Math.max(0, record.theirStart - record.theirEnd);

  let score = record.outcome === 'they-rout' ? 50
    : record.outcome === 'spent' ? 22
      : record.outcome === 'retreat' ? 16 : 0;

  // Survivors: the whole of the difference between a win and a good win.
  const kept = record.ourStart > 0 ? record.ourEnd / record.ourStart : 0;
  score += Math.round(Math.max(0, Math.min(1, kept)) * 25);

  // The exchange, capped at three to one — past that it is the enemy's mistake, not your skill.
  const exchange = theirLost / Math.max(1, ourLost);
  score += Math.round(Math.max(0, Math.min(3, exchange)) / 3 * 15);

  // And what you were up against. Beating a bigger host is worth more than beating a smaller one.
  const odds = record.ourStart > 0 ? record.theirStart / record.ourStart : 1;
  score += Math.round(Math.max(0, Math.min(2, odds - 0.75)) / 2 * 10);

  // And a ceiling set by what you brought. Survivors and the exchange alone will happily award
  // five stars for walking four thousand men onto nine hundred — measured, exactly that scored
  // 82 — and the top grade's own words are "longer odds, fewer graves", which would be a lie.
  // You cannot buy a famous day with numbers.
  const ceiling = odds >= 0.9 ? 5 : odds >= 0.6 ? 4 : 3;
  const stars = Math.max(1, Math.min(ceiling, Math.ceil(score / 20)));
  return { stars, score: Math.min(100, score) };
}

/** The court's three lines for a graded fight: who speaks, what it is called, and its rank. */
export function commendationKeys(won: boolean, drew: boolean, stars: number): {
  issuer: 'arena.report.royal.issuer' | 'arena.report.royal.dispatch';
  title: string;
  rank: string;
} {
  return {
    issuer: won ? 'arena.report.royal.issuer' : 'arena.report.royal.dispatch',
    title: won ? `arena.report.royal.honor${stars}` : drew ? 'arena.report.royal.regroup' : 'arena.report.royal.resolve',
    rank: ['I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(4, stars - 1))],
  };
}
