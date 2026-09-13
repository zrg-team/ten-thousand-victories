import type { GameState, Hero } from '../../state/types';
import { heroLevel, heroRulesV2, heroWindow } from './heroModel';
import type { HeroMetricEvent } from './types';

/** Local, bounded measurement only. Never writes names, free text, or network traffic. */
export function heroMeasurements(state: GameState) {
  if (!heroRulesV2(state)) return undefined;
  return state.ascent!.heroDepth!.measurements ??= {
    sequence: 0, events: [], counts: {}, seasons: {}, lastSeason: {}, milestones: {}, recruitedAt: {}, offers: {}, choices: {},
  };
}
export function measureHero(state: GameState, hero: Hero, type: string, receipt: string,
  details: Pick<HeroMetricEvent, 'before' | 'after' | 'choice'> & { window?: number } = {}): void {
  const data = heroMeasurements(state), depth = state.ascent?.heroDepth;
  if (!data || !depth || !hero.growth) return;
  // Transfer revisions include route/front snapshots. Retain a compact identifier, not that payload.
  let receiptKey = receipt;
  if (receipt.length > 120) {
    let hash = 2166136261;
    for (let i = 0; i < receipt.length; i++) hash = Math.imul(hash ^ receipt.charCodeAt(i), 16777619);
    receiptKey = `receipt:${receipt.length}:${(hash >>> 0).toString(16)}`;
  }
  const id = `${hero.growth.instanceId}:${receiptKey}`;
  // Gameplay receipts are authoritative; this extra guard covers repeated UI observations.
  if (data.events.some(event => event.id === id && event.type === type)) return;
  data.sequence++;
  data.events.push({ id, type, runId: depth.runId, rulesVersion: depth.rules.version,
    instanceId: hero.growth.instanceId, role: hero.life?.kind === 'active' ? hero.life.assignment.kind : hero.life?.kind ?? 'home',
    turn: state.turn, window: heroWindow(state), ...details });
  data.events = data.events.slice(-256);
  data.counts[type] = (data.counts[type] ?? 0) + 1;
  if (details.choice) {
    if (type === 'hero_perk_chosen') data.choices[details.choice] = (data.choices[details.choice] ?? 0) + 1;
    else data.counts[`${type}:${details.choice}`] = (data.counts[`${type}:${details.choice}`] ?? 0) + 1;
  }
}
export function measureHeroSeason(state: GameState, hero: Hero, turn: number, productive: boolean): void {
  const data = heroMeasurements(state);
  if (!data || !hero.growth || hero.life?.kind === 'dead' || (data.lastSeason[hero.growth.instanceId] ?? -1) >= turn) return;
  data.lastSeason[hero.growth.instanceId] = turn;
  const level = heroLevel(hero), row = data.seasons[level] ??= { available: 0, productive: 0 };
  row.available++; if (productive) row.productive++;
}
export function measureHeroMilestone(state: GameState, hero: Hero, level: number): void {
  const data = heroMeasurements(state);
  if (!data || !hero.growth) return;
  const rows = data.milestones[hero.growth.instanceId] ??= [];
  if (rows.some(row => row.level === level)) return;
  rows.push({ level, turn: state.turn, window: heroWindow(state),
    recruitedTurn: data.recruitedAt[hero.growth.instanceId] ?? state.turn,
    role: hero.life?.kind === 'active' ? hero.life.assignment.kind : 'home' });
}

export function measureHeroDraft(state: GameState, cards: string[]): void {
  const data = heroMeasurements(state); if (!data) return;
  for (const card of cards) data.offers[card] = (data.offers[card] ?? 0) + 1;
}
