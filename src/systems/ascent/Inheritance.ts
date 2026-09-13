import type { GameState } from '../../state/types';
import { ASCENT_SCORE, computeRunScore, getLegacy, LEGACY_PERKS, nextPerkCost, nextRankAbove, perkLevel, rankForScore } from '../../state/legacy';
import { dynastyXpStep, getDynasty, isCrowned, levelForXp, noteLiveReign as writeLiveReign } from '../../state/dynasty';
import { combineCost, deedDone, getCabinet, meltValue } from '../../state/cabinet';
import { DYNASTY_TRAITS } from '../../data/dynastyTraits';
import { findPowerCard } from '../../data/ascentCards';
import { bindOfferCards } from './Ceremony';

/**
 * **What this reign has already earned for the next one, read live.**
 *
 * Every cross-run system in the mode — the house's XP, the rubbings, the bind, the Legacy vault,
 * the record — is paid out inside `endAscentRun`, and until this file existed nothing on the
 * playing screen said so. The player found out what a reign had been worth at the Reckoning, ten
 * seconds before the menu, which is exactly the moment it can no longer change anything they do.
 * Reported verbatim: *it not feel progressive*.
 *
 * So this reads the same books the ceremony will bank from, with the same formulas, and reports
 * the balance **as if the reign ended now**. Nothing here writes: the score is `computeRunScore`
 * (the one the Reckoning prints), the level is `levelForXp` over the house's banked XP plus that
 * score, the Legacy is the same `score / 10`. A number promised here and a number paid at the
 * ceremony can therefore never disagree, which is the whole reason this is a reader over the real
 * stores rather than a second ledger kept beside them.
 *
 * Plain functions over `GameState`, no Phaser — the chip that draws it lives in `ui/ascent`.
 */

export type BindStatus = 'new' | 'copy' | 'ready' | 'melt';

export interface InheritanceLedger {
  /** The Reckoning's figure, right now. */
  score: number;

  // ── The house (Tông Phả) ──
  /** XP the house receives if the reign ends now — the score, verbatim, per `addRunXp`. */
  xp: number;
  houseLevelNow: number;
  houseLevelAfter: number;
  levelsGained: number;
  /** Trait picks those levels would actually hand out — the table caps them, see `addRunXp`. */
  picksGained: number;
  /** Progress inside the level the house would then stand on. */
  xpInto: number;
  xpNeed: number;

  // ── The cabinet (Tàng Ấn Các) ──
  /** Rubbings this reign has banked or been promised: the always-faucet plus what it earned. */
  rubbings: number;
  /** Waves until the next tenth-wave rubbing. */
  wavesToRubbing: number;
  /** The card the bind step would lead with, and what keeping it does to the cabinet. */
  bind?: { cardId: string; status: BindStatus; copies: number; need: number; melt: number };

  // ── Legacy ──
  legacy: number;
  legacyTotalAfter: number;
  /** The cheapest perk not yet owned, and how far the vault would still be from it. */
  nextPerk?: { id: string; short: number };

  // ── The record ──
  bestScore: number;
  /** Positive while chasing; the margin once past it. */
  recordDiff: number;
  recordBeaten: boolean;
  rankNow: string;
  rankAfter: string;
  /** The rung above the one the reign would leave the player on. */
  nextRank?: { label: string; minScore: number; short: number };

  // ── Champions ──
  heroesSummoned: number;
  heroPoints: number;
  /** The wardrobe lock the wave clock opens, while it is still shut. */
  harnessWavesLeft?: number;
  /** The founding champion who would be written in as the house's founder, while the seat is empty. */
  founderName?: string;
}


/** Reads the ledger. Cheap: one score, three store reads (memoised in the stores) and a sort. */
export function readInheritance(state: GameState): InheritanceLedger | undefined {
  const ascent = state.ascent;
  if (!ascent) return undefined;

  const score = Math.max(0, Math.round(computeRunScore(state)));
  const dynasty = getDynasty();
  const legacy = getLegacy();
  const cabinet = getCabinet();

  // ── House ──
  const houseLevelNow = dynasty.level;
  const houseLevelAfter = levelForXp(dynasty.xp + score);
  const levelsGained = Math.max(0, houseLevelAfter - houseLevelNow);
  const room = Math.max(0, DYNASTY_TRAITS.length - dynasty.traits.length - dynasty.pendingPicks);
  const picksGained = Math.min(room, levelsGained);
  let spent = 0;
  for (let level = 1; level <= houseLevelAfter; level += 1) spent += dynastyXpStep(level);
  const xpInto = Math.max(0, dynasty.xp + score - spent);
  const xpNeed = dynastyXpStep(houseLevelAfter + 1);

  // ── Cabinet ──
  const rubbings = 1 + Math.max(0, ascent.rubbingsEarned ?? 0);
  const wavesToRubbing = 10 - (ascent.wavesSurvived % 10);
  const bindId = bindOfferCards(state)[0];
  const bindCard = bindId ? findPowerCard(bindId) : undefined;
  let bind: InheritanceLedger['bind'];
  if (bindId && bindCard) {
    const held = cabinet.cards[bindId];
    if (!held) {
      bind = { cardId: bindId, status: 'new', copies: 1, need: combineCost(1), melt: 0 };
    } else if (held.level >= 3) {
      bind = { cardId: bindId, status: 'melt', copies: held.copies, need: 0, melt: meltValue(bindCard.rarity) };
    } else {
      const need = combineCost(held.level);
      const copies = held.copies + 1;
      bind = { cardId: bindId, status: copies >= need ? 'ready' : 'copy', copies, need, melt: 0 };
    }
  }

  // ── Legacy ──
  const legacyEarned = Math.round(score / 10);
  const legacyTotalAfter = legacy.points + legacyEarned;
  const cheapest = LEGACY_PERKS
    .map((perk) => ({ perk, cost: nextPerkCost(perk, perkLevel(perk.id, legacy)) }))
    .filter((entry): entry is { perk: typeof entry.perk; cost: number } => entry.cost !== undefined)
    .sort((a, b) => a.cost - b.cost)[0];
  const nextPerk = cheapest ? { id: cheapest.perk.id, short: Math.max(0, cheapest.cost - legacyTotalAfter) } : undefined;

  // ── Record ──
  const bestScore = legacy.bestScore;
  const recordBeaten = bestScore > 0 && score > bestScore;
  const rankNow = rankForScore(bestScore);
  const rankAfter = rankForScore(Math.max(bestScore, score));
  const above = nextRankAbove(Math.max(bestScore, score));
  const nextRank = above ? { ...above, short: Math.max(0, above.minScore - score) } : undefined;

  // ── Champions ──
  const founder = !isCrowned(dynasty)
    ? state.heroes.find((hero) => hero.id === ascent.founderHeroId)
    : undefined;

  return {
    score,
    xp: score,
    houseLevelNow,
    houseLevelAfter,
    levelsGained,
    picksGained,
    xpInto,
    xpNeed,
    rubbings,
    wavesToRubbing,
    ...(bind ? { bind } : {}),
    legacy: legacyEarned,
    legacyTotalAfter,
    ...(nextPerk ? { nextPerk } : {}),
    bestScore,
    recordDiff: recordBeaten ? score - bestScore : bestScore - score,
    recordBeaten,
    rankNow,
    rankAfter,
    ...(nextRank ? { nextRank } : {}),
    heroesSummoned: ascent.heroesSummoned,
    heroPoints: ascent.heroesSummoned * ASCENT_SCORE.perHeroCalled,
    ...(deedDone('wave-ten') ? {} : { harnessWavesLeft: Math.max(0, 10 - ascent.wavesSurvived) }),
    ...(founder ? { founderName: founder.name } : {}),
  };
}

/**
 * Records a rubbing the reign earned *while it was running*.
 *
 * The cabinet store is written directly by every faucet (`addRubbings`, `grantDeed`), and the
 * store has no memory of which reign paid it — a count taken at run start would also be wrong the
 * moment the player scratched one on the menu mid-session. So each in-run faucet notes its payout
 * here as well, and the ledger adds the always-faucet on top. Called *beside* the store write, never
 * instead of it: this is a receipt, not a second wallet.
 */
export function noteRubbing(state: GameState, count = 1): void {
  const ascent = state.ascent;
  if (!ascent || count <= 0) return;
  ascent.rubbingsEarned = (ascent.rubbingsEarned ?? 0) + count;
}

/**
 * Writes the reign in progress into the house's store, from the same reading the chip shows.
 *
 * Called when the run is written down (the away pause's autosave) and at every wave held, so the
 * home page can draw a paused run's progress. A run that has already banked writes nothing: the
 * banked number is the truth and the live line would only contradict it.
 */
export function noteLiveReign(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent || state.gameMode !== 'ascent' || state.legacyBanked || ascent.arena) return;
  const ledger = readInheritance(state);
  if (!ledger) return;
  writeLiveReign({ score: ledger.score, levelAfter: ledger.houseLevelAfter, waves: ascent.wavesSurvived });
}
