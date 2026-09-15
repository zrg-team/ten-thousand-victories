/**
 * Xin tăng bổng — a champion asks for more pay.
 *
 * The card half of `heroes/heroPay.ts`. Once a season `tickHeroPay` keeps each serving champion's
 * pay record and charges the slow cost of neglect; in Court, `heroRaiseReady` finds the champion
 * whose patience has run out furthest and `offerHeroRaise` puts their ask on the table.
 *
 * The ask is sized to the realm, the way the player asked: a share of gross gold a season, by the
 * champion's appetite (temperament) and level — so a greedy level-seven general at a gross of 470
 * asks about twenty-nine coin a season, a modest level-two clerk at a gross of 150 about two — never under
 * a fifth of what they already draw. Granted, it is theirs for the rest of their service, at the
 * size it was granted: a raise is a promise, not a peg.
 *
 * Three answers, none of them free:
 *  - **grant** — the wage rises for good, loyalty +8, and the clock resets.
 *  - **reward** — six seasons of the ask paid now in coin; loyalty +3 and half the clock back.
 *  - **refuse** — loyalty falls by temperament. A proud champion refused again and again is told
 *    they will leave, and only a refusal of *that* card, at low loyalty, sends them away.
 *
 * Never a pause of its own and never before `HERO_RAISE_FROM_WAVE`: it waits for the Court window
 * like every scheduled card. The king never asks, and neither does the founder.
 */
import {
  HERO_LEAVE_LOYALTY,
  HERO_LEAVE_REFUSALS,
  HERO_NEGLECT_EVERY,
  HERO_NEGLECT_FLOOR,
  HERO_NEGLECT_OVERDUE,
  HERO_RAISE_APPETITE,
  HERO_RAISE_ASK_GAP,
  HERO_RAISE_FROM_WAVE,
  HERO_RAISE_GRANT_LOYALTY,
  HERO_RAISE_INCOME_SHARE,
  HERO_RAISE_MIN_SHARE,
  HERO_RAISE_REWARD_LOYALTY,
  HERO_RAISE_REWARD_SEASONS,
  HERO_REFUSE_LOYALTY,
  HERO_WAGE_GROSS_CAP,
  HERO_WARN_LOYALTY,
} from '../../game/ascentConfig';
import { applyResourceDelta, canSpend, refreshAllLandOutputs } from '../ResourceSystem';
import { releaseHeroAssignment } from '../CourtSystem';
import { memorializeHero } from '../heroes/HeroService';
import { heroLevel } from '../heroes/heroModel';
import {
  ensureHeroPay,
  heroEarnedPayMult,
  heroPatience,
  heroPayExtra,
  heroPayState,
  heroRaisesActive,
  heroTemperament,
  type HeroTemperament,
} from '../heroes/heroPay';
import { upkeepRoundScale } from './priceScale';
import { ennobled } from '../decree/rules';
import { pushToast } from '../empire/notifications';
import { enqueueAscentPrompt } from './AscentState';
import { heroName, t } from '../../i18n';
import type { GameState, Hero, HeroRaiseOption } from '../../state/types';

/** A champion who can be at the table: serving, free, not the crown. */
function canAsk(state: GameState, hero: Hero): boolean {
  if (hero.id === 'king' || state.ascent?.founderHeroId === hero.id) return false;
  if (!hero.growth) return false;
  if (hero.life && hero.life.kind !== 'active') return false;
  return true;
}

/** What the hero draws a season at full pay (posted), before this ask. */
export function heroFullWage(state: GameState, hero: Hero): number {
  return hero.upkeepGold * heroEarnedPayMult(state, hero) * upkeepRoundScale(state) + heroPayExtra(state, hero);
}

/** Coin a season this champion asks for now. */
export function heroRaiseAsk(state: GameState, hero: Hero): number {
  const gross = Math.max(0, state.ascentLedger?.gold.gross ?? 0);
  const appetite = HERO_RAISE_APPETITE[heroTemperament(hero)];
  const byIncome = gross * HERO_RAISE_INCOME_SHARE * appetite * Math.sqrt(heroLevel(hero) / 3);
  const byWage = heroFullWage(state, hero) * HERO_RAISE_MIN_SHARE;
  return Math.max(1, Math.round(Math.max(byIncome, byWage)));
}

/** How overdue a champion is: seasons unraised over patience. Above 1 means they expect more. */
function overdue(state: GameState, hero: Hero): number {
  const pay = heroPayState(hero);
  if (!pay) return 0;
  return (state.turn - pay.sinceTurn) / Math.max(1, heroPatience(hero));
}

/** The champion whose patience has run out furthest and who may ask now, if any. */
export function heroRaiseCandidate(state: GameState): Hero | undefined {
  if (!heroRaisesActive(state)) return undefined;
  if ((state.ascent?.wave ?? 0) < HERO_RAISE_FROM_WAVE) return undefined;
  if (state.pendingAscentPrompt?.kind === 'hero-raise' || state.ascent?.promptQueue.some((p) => p.kind === 'hero-raise')) return undefined;
  const gross = Math.max(0, state.ascentLedger?.gold.gross ?? 0);
  let best: Hero | undefined;
  let bestOverdue = 1;
  for (const hero of state.heroes) {
    if (!canAsk(state, hero)) continue;
    const pay = heroPayState(hero);
    if (!pay) continue;
    if (pay.askedTurn !== undefined && state.turn - pay.askedTurn < HERO_RAISE_ASK_GAP) continue;
    // Content: a wage already a real share of the realm's income does not ask for more.
    if (gross > 0 && heroFullWage(state, hero) >= gross * HERO_WAGE_GROSS_CAP) continue;
    const late = overdue(state, hero);
    if (late >= bestOverdue) { best = hero; bestOverdue = late; }
  }
  return best;
}

export function heroRaiseReady(state: GameState): boolean {
  return Boolean(heroRaiseCandidate(state));
}

export function buildHeroRaiseOptions(state: GameState, hero: Hero, ask: number): HeroRaiseOption[] {
  const reward = Math.round(ask * HERO_RAISE_REWARD_SEASONS);
  return [
    { id: 'grant', perSeason: ask, affordable: true },
    { id: 'reward', cost: { gold: reward }, affordable: canSpend(state, { gold: reward }) },
    { id: 'refuse', affordable: true },
  ];
}

export function offerHeroRaise(state: GameState): boolean {
  const hero = heroRaiseCandidate(state);
  const pay = hero ? heroPayState(hero) : undefined;
  if (!hero || !pay) return false;
  const ask = heroRaiseAsk(state, hero);
  pay.askedTurn = state.turn;
  enqueueAscentPrompt(state, {
    kind: 'hero-raise',
    heroId: hero.id,
    ask,
    wage: Math.round(heroFullWage(state, hero) * 10) / 10,
    temperament: heroTemperament(hero),
    seasons: Math.max(0, state.turn - pay.sinceTurn),
    warn: pay.warned,
    options: buildHeroRaiseOptions(state, hero, ask),
  });
  return true;
}

function resetClock(state: GameState, hero: Hero, share = 1): void {
  const pay = heroPayState(hero);
  if (!pay) return;
  pay.sinceTurn = share >= 1 ? state.turn : state.turn - Math.floor(heroPatience(hero) * (1 - share));
  pay.levelAt = heroLevel(hero);
  pay.winsAt = hero.battlesWon ?? 0;
  pay.neglectTurn = undefined;
}

function addLoyalty(hero: Hero, delta: number): void {
  hero.stats.loyalty = Math.max(0, Math.min(100, Math.round(hero.stats.loyalty + delta)));
}

/**
 * A champion walks out over pay. The same leaving a dismissal is — the post vacated, the memorial
 * written, the card back in the deck for a later summon — without the dismissal's stability knock,
 * because the court did not choose it.
 */
function heroLeavesOverPay(state: GameState, hero: Hero): void {
  const wasGovernor = Boolean(hero.assignedTo && state.lands.some((land) => land.id === hero.assignedTo));
  releaseHeroAssignment(state, hero);
  state.heroes = state.heroes.filter((candidate) => candidate.id !== hero.id);
  if (hero.growth) { memorializeHero(state, hero, 'dismissed'); delete hero.growth; delete hero.life; }
  if (!state.heroDeck.some((candidate) => candidate.id === hero.id)) state.heroDeck.push(hero);
  if (state.ascent) state.ascent.reservedHeroIds = state.ascent.reservedHeroIds.filter((id) => id !== hero.id);
  if (wasGovernor) refreshAllLandOutputs(state);
  pushToast(state, t('ascent.payRaise.leftToast', { hero: heroName(hero) }), 'threat');
}

/** Whether a refusal now would send this champion away (the card says so before it is tapped). */
export function refusalWouldLose(state: GameState, hero: Hero, temperament: HeroTemperament, warned: boolean): boolean {
  if (!warned || (temperament !== 'ambitious' && temperament !== 'greedy')) return false;
  if (ennobled(hero)) return false;
  return hero.stats.loyalty - HERO_REFUSE_LOYALTY[temperament] <= HERO_LEAVE_LOYALTY;
}

export function resolveHeroRaise(
  state: GameState,
  prompt: { heroId: string; ask: number; temperament: HeroTemperament; warn: boolean },
  choiceId: string,
): boolean {
  const hero = state.heroes.find((candidate) => candidate.id === prompt.heroId);
  const pay = hero ? heroPayState(hero) : undefined;
  // The champion is gone (fell, captured, dismissed) while the card stood: nothing left to answer.
  if (!hero || !pay) return true;
  const options = buildHeroRaiseOptions(state, hero, prompt.ask);
  const option = options.find((candidate) => candidate.id === choiceId);
  if (!option || !option.affordable) return false;
  const name = heroName(hero);

  switch (option.id) {
    case 'grant':
      pay.extra += prompt.ask;
      pay.raises += 1;
      pay.refusals = 0;
      pay.warned = false;
      resetClock(state, hero);
      addLoyalty(hero, HERO_RAISE_GRANT_LOYALTY);
      refreshAllLandOutputs(state);
      pushToast(state, t('ascent.payRaise.grantToast', { hero: name, gold: prompt.ask }), 'reward');
      return true;
    case 'reward':
      applyResourceDelta(state, { gold: -(option.cost?.gold ?? 0) });
      pay.refusals = Math.max(0, pay.refusals - 1);
      resetClock(state, hero, 0.5);
      addLoyalty(hero, HERO_RAISE_REWARD_LOYALTY);
      pushToast(state, t('ascent.payRaise.rewardToast', { hero: name, gold: option.cost?.gold ?? 0 }), 'info');
      return true;
    case 'refuse': {
      const temperament = heroTemperament(hero);
      const leaves = refusalWouldLose(state, hero, temperament, pay.warned);
      addLoyalty(hero, -HERO_REFUSE_LOYALTY[temperament]);
      pay.refusals += 1;
      if (leaves) {
        heroLeavesOverPay(state, hero);
        return true;
      }
      const proud = temperament === 'ambitious' || temperament === 'greedy';
      if (proud && pay.refusals >= HERO_LEAVE_REFUSALS && hero.stats.loyalty < HERO_WARN_LOYALTY) pay.warned = true;
      pushToast(state, t(pay.warned ? 'ascent.payRaise.refuseWarnToast' : 'ascent.payRaise.refuseToast', { hero: name }), 'threat');
      return true;
    }
  }
  return false;
}

/**
 * Once a season: keep every serving champion's pay record, and charge the slow cost of neglect —
 * a point of loyalty every few seasons once a champion who was refused is well past their patience,
 * never below the floor, and never a leaving. Only a card can do that.
 */
export function tickHeroPay(state: GameState): void {
  if (!heroRaisesActive(state)) return;
  for (const hero of state.heroes) {
    if (!canAsk(state, hero)) continue;
    const pay = ensureHeroPay(state, hero);
    if (!pay) continue;
    if (pay.refusals <= 0 || overdue(state, hero) < HERO_NEGLECT_OVERDUE) continue;
    if (pay.neglectTurn !== undefined && state.turn - pay.neglectTurn < HERO_NEGLECT_EVERY) continue;
    pay.neglectTurn = state.turn;
    if (hero.stats.loyalty > HERO_NEGLECT_FLOOR) addLoyalty(hero, -1);
  }
}

/** A champion's pending ask, for the Heroes page chip. */
export function heroAsking(state: GameState, heroId: string): boolean {
  return state.pendingAscentPrompt?.kind === 'hero-raise' && state.pendingAscentPrompt.heroId === heroId
    || Boolean(state.ascent?.promptQueue.some((p) => p.kind === 'hero-raise' && p.heroId === heroId));
}

