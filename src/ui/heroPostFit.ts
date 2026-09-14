/**
 * **What a hero is worth in a posting, and how it compares with whoever holds it now.**
 *
 * Three hero screens had to answer the same question and none of them could. The transfer page
 * listed every seat, province and host as "Go to X" with the journey and nothing else, so the
 * player chose a posting without being told what it would do — or who was already in it. The seat
 * picker scored heroes on the seat's first stat alone, ignoring the second term every seat has (the
 * Spymaster's martial, the Marshal's logistics). And the hero page could not suggest anything,
 * because nothing computed "where would this hero do the most good".
 *
 * One module, read by all three, so a hero's value in a post is the same figure everywhere.
 *
 * **No state is cloned here.** `heroAssignmentPreview` answers the exact question by simulating the
 * whole realm on a `structuredClone` of the state — right for a confirm page, and far too slow for
 * a list that asks it thirty times. Every figure below is read off the effect tables the game
 * itself applies (`COURT_POSITION_EFFECTS` with `courtSeatScale`, `getLandGovernorEffects`, the
 * general's multiplier in `armyPower`), so the list and the rules cannot disagree; the confirm page
 * still shows the exact simulated delta for the one choice being made.
 *
 * Data and chips only — no Phaser — so a headless harness can read it.
 */
import { COURT_POSITION_EFFECTS, courtSeatScale, getCourtPositionLabel, getLandGovernorEffects, type NumericCourtBonusKey } from '../systems/CourtSystem';
import { effectiveHeroStats, heroActive, heroCapability } from '../systems/heroes/heroModel';
import { postHolder, previewHeroTransfer } from '../systems/heroes/HeroService';
import type { HeroAssignment, HeroTransferPreview } from '../systems/heroes/types';
import { liveBattles } from '../systems/ascent/fronts';
import { PLAYER_KINGDOM_ID } from '../game/constants';
import { scoreHero } from './governorPanel';
import { resourceChip, statChip, type StatKind } from './statChips';
import type { CostChip } from './costChips';
import type { CourtPositionId, GameState, Hero, HeroStats } from '../state/types';

export type PostFamily = 'court' | 'province' | 'host' | 'home';

export interface PostValue {
  /** 0..1, comparable across heroes for one post and across posts for one hero. */
  fit: number;
  /** What the hero would bring, as the chips the rules would apply. */
  chips: CostChip[];
}

export interface PostRow {
  family: PostFamily;
  post: HeroAssignment;
  /** Unique on a page: `court:marshal`, `province:district-14`, `host:army-3`, `home`. */
  key: string;
  title: string;
  value: PostValue;
  /** Whoever sits in it now (not this hero). */
  holder?: Hero;
  holderValue?: PostValue;
  /** Somebody already on the road to it, which reserves it. */
  traveller?: Hero;
  /** How much better this hero is than the holder (or a vacancy bonus), in fit units. */
  gain: number;
  current: boolean;
  quote: HeroTransferPreview;
}

/** An empty seat is worth filling for its own sake: a mediocre minister beats no minister. */
const VACANT_BONUS = 0.25;
const FULL: HeroStats = { martial: 100, logistics: 100, administration: 100, diplomacy: 100, loyalty: 100, renown: 100 };

/**
 * How much each court effect counts toward a seat's fit.
 *
 * Only ever compared *within* one seat — each seat's fit is divided by what a hero with every stat
 * at 100 would bring to it — so these balance a seat's two or three terms against each other, not
 * seats against seats. A percentage on the realm's gold or army is the headline; a regeneration
 * rate is a few tenths per season and weighs accordingly. Building cost is negative-is-good.
 */
const COURT_FX_WEIGHT: Partial<Record<NumericCourtBonusKey, number>> = {
  armyPowerMult: 1,
  goldOutputMult: 1,
  foodOutputMult: 0.8,
  suppliesOutputMult: 0.8,
  recruitSpeedMult: 0.5,
  acquisitionSpeedMult: 0.5,
  buildingCostMult: -0.5,
  cardFrequencyMult: 0.4,
  buildSpeedBonus: 0.1,
  influenceRegen: 0.05,
  stabilityRegen: 0.08,
  favorPerTick: 0.2,
  armyMoraleRegen: 0.06,
};

const pct = (value: number): string => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value * 100))}%`;
const rate = (value: number): string => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value * 10) / 10)}`;

function courtChip(key: NumericCourtBonusKey, value: number): CostChip | undefined {
  if (!value) return undefined;
  const stat = (kind: StatKind, figure: string) => statChip(kind, figure);
  switch (key) {
    case 'armyPowerMult': return stat('power', pct(value));
    case 'recruitSpeedMult': return stat('recruit', pct(value));
    case 'acquisitionSpeedMult': return stat('acquire', pct(value));
    case 'goldOutputMult': return resourceChip('gold', pct(value));
    case 'foodOutputMult': return resourceChip('food', pct(value));
    case 'suppliesOutputMult': return resourceChip('supplies', pct(value));
    case 'buildingCostMult': return stat('buildCost', pct(value));
    case 'cardFrequencyMult': return stat('cards', pct(value));
    case 'buildSpeedBonus': return stat('buildSpeed', rate(value));
    case 'influenceRegen': return stat('influence', rate(value));
    case 'stabilityRegen': return stat('stability', rate(value));
    case 'favorPerTick': return stat('favor', rate(value));
    case 'armyMoraleRegen': return stat('morale', rate(value));
    default: return undefined;
  }
}

export function courtSeatValue(state: GameState, seat: CourtPositionId, hero: Hero): PostValue {
  const scale = courtSeatScale(state, seat, hero);
  const delta = COURT_POSITION_EFFECTS[seat](effectiveHeroStats(hero));
  const full = COURT_POSITION_EFFECTS[seat](FULL);
  let got = 0;
  let best = 0;
  const chips: CostChip[] = [];
  for (const [key, raw] of Object.entries(delta) as Array<[NumericCourtBonusKey, number]>) {
    const weight = COURT_FX_WEIGHT[key] ?? 0;
    got += weight * (raw ?? 0) * scale;
    const chip = courtChip(key, (raw ?? 0) * scale);
    if (chip) chips.push(chip);
  }
  for (const [key, raw] of Object.entries(full) as Array<[NumericCourtBonusKey, number]>) {
    best += Math.abs((COURT_FX_WEIGHT[key] ?? 0) * (raw ?? 0));
  }
  return { fit: best > 0 ? Math.max(0, Math.min(1, got / best)) : 0, chips };
}

export function provinceValue(state: GameState, landId: string, hero: Hero): PostValue {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land) return { fit: 0, chips: [] };
  // `getLandGovernorEffects` reads nothing for a hero who is not active — a traveller is judged on
  // what they would bring on arrival, so they are read as if they were.
  const standIn = heroActive(hero) ? hero : { ...hero, life: undefined } as Hero;
  const effects = getLandGovernorEffects(state, land, standIn);
  const chips: CostChip[] = [statChip('output', pct(effects.outputMult - 1))];
  if (effects.defenseMult > 1) chips.push(statChip('defence', pct(effects.defenseMult - 1)));
  if (effects.loyaltyPerTick > 0) chips.push(statChip('loyalty', rate(effects.loyaltyPerTick)));
  return { fit: scoreHero(state, land, hero), chips };
}

export function hostValue(state: GameState, armyId: string, hero: Hero): PostValue {
  const martial = effectiveHeroStats(hero).martial;
  const exists = state.armies.some((army) => army.id === armyId);
  return { fit: exists ? martial / 100 : 0, chips: [statChip('power', pct((martial / 100) * 0.25))] };
}

export function embassyValue(hero: Hero): PostValue {
  const stats = effectiveHeroStats(hero);
  return { fit: stats.diplomacy / 100, chips: [statChip('diplomacy', stats.diplomacy)] };
}

export function postValue(state: GameState, post: HeroAssignment, hero: Hero): PostValue {
  switch (post.kind) {
    case 'court': return courtSeatValue(state, post.seat, hero);
    case 'province': return provinceValue(state, post.landId, hero);
    case 'host': return hostValue(state, post.armyId, hero);
    case 'embassy': return embassyValue(hero);
    default: return { fit: 0, chips: [] };
  }
}

export function postKey(post: HeroAssignment): string {
  switch (post.kind) {
    case 'court': return `court:${post.seat}`;
    case 'province': return `province:${post.landId}`;
    case 'host': return `host:${post.armyId}`;
    case 'embassy': return `embassy:${post.kingdomId}`;
    case 'claim': return `claim:${post.landId}`;
    case 'muster': return `muster:${post.orderId}`;
    default: return 'home';
  }
}

/** The postings a hero could be sent to, family by family — the transfer page's rows. */
export function candidatePosts(state: GameState): Array<{ family: PostFamily; post: HeroAssignment; title: string }> {
  return [
    ...state.court.unlockedSeats.map((seat) => ({ family: 'court' as const, post: { kind: 'court', seat } as HeroAssignment, title: getCourtPositionLabel(seat) })),
    ...state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
      .map((land) => ({ family: 'province' as const, post: { kind: 'province', landId: land.id } as HeroAssignment, title: land.name })),
    ...state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron)
      .map((army) => ({ family: 'host' as const, post: { kind: 'host', armyId: army.id } as HeroAssignment, title: army.name })),
    { family: 'home' as const, post: { kind: 'home' }, title: '' },
  ];
}

/**
 * Every posting for one hero, valued and compared with its holder, ready to list.
 *
 * Order within a family: the hero's own post first (so they can see where they stand), then what
 * they could take, best gain first, then what they cannot — each with the transfer quote's reason.
 */
export function rankPostsForHero(state: GameState, hero: Hero): PostRow[] {
  const here = hero.life?.kind === 'active' ? postKey(hero.life.assignment) : undefined;
  const rows = candidatePosts(state).map(({ family, post, title }): PostRow => {
    const key = postKey(post);
    const { holder, traveller } = postHolder(state, post, hero.id);
    const value = postValue(state, post, hero);
    const holderValue = holder ? postValue(state, post, holder) : undefined;
    const current = here === key;
    const gain = current || post.kind === 'home' ? 0 : holderValue ? value.fit - holderValue.fit : value.fit + VACANT_BONUS;
    return { family, post, key, title, value, holder, holderValue, traveller, gain, current, quote: previewHeroTransfer(state, hero.id, post) };
  });
  const order: Record<PostFamily, number> = { court: 0, province: 1, host: 2, home: 3 };
  const tier = (row: PostRow) => row.current ? 0 : row.quote.ok ? 1 : 2;
  return rows.sort((a, b) => order[a.family] - order[b.family] || tier(a) - tier(b) || b.gain - a.gain);
}

/**
 * Up to `n` postings that would do more good than where the hero is now.
 *
 * Only reachable ones, only ones that are an improvement on their holder by a margin a player
 * would act on, and never the hero's own post.
 */
export function recommendedPosts(state: GameState, hero: Hero, n = 3): PostRow[] {
  if (!heroCapability(state, 'travel')) return [];
  return rankPostsForHero(state, hero)
    .filter((row) => !row.current && row.quote.ok && row.post.kind !== 'home' && row.gain > 0.05)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, n);
}

/** True while this army is in the line of a live field — a general there cannot be swapped out. */
export function hostInBattle(state: GameState, armyId: string): boolean {
  return liveBattles(state).some((front) => (front.ourArmyIds ?? []).includes(armyId));
}
