import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { heroName, t } from '../../i18n';
import { pushToast } from '../empire/notifications';
import { rulesOf } from '../../game/ascentRuleset';
import type { AscentBattleRecord, CourtPositionId, GameState, Hero } from '../../state/types';
import { scaledCost } from '../ascent/priceScale';
import { committedWavePlan } from '../ascent/wavePlanView';
import { forecastInvader } from '../ascent/frontForecast';
import { battleBeatsPerTick } from '../../game/battleOptions';
import { BATTLE_ROUT_MORALE } from '../../game/ascentConfig';
import { heroMeasurements, measureHero, measureHeroMilestone, measureHeroSeason } from './heroMeasurements';
import { heroFate } from './heroFate';
import {
  availableHeroPerks, effectiveHeroStats, emptyTraining, governorTrainingStat, heroFormerPosting,
  HERO_PERKS, HERO_XP, heroActive, heroCapability, heroEventRoll, heroLevel, heroWindow, heroRulesV2, hasHeroPerk, PROFESSIONAL_STATS,
} from './heroModel';
import type {
  HeroAssignment, HeroCommandResult, HeroDeedKind, HeroPerkId, HeroSeasonSnapshot, HeroTransferPreview, HeroRiskForecast, HeroReleaseQuote, ProfessionalStat,
} from './types';

/** Only the new-run door calls this. Never infer opt-in from a loaded Beta save. */
export function initializeHeroDepthRun(state: GameState, runId?: string): void {
  const rules = rulesOf(state);
  if (state.gameMode !== 'ascent' || !state.ascent || state.ascent.arena || !rules.heroGrowth || state.ascent.heroDepth) return;
  state.ascent.heroDepth = {
    rules: { version: rules.heroRulesVersion, capabilities: { growth: true, specializations: rules.heroSpecializations,
      travel: rules.heroTravel, recovery: rules.heroRecovery, residency: rules.heroResidency,
      cards: rules.heroCards, lethal: rules.heroLethal && rules.heroRecovery },
    thresholds: [...HERO_XP], serviceCap: 6, deedCap: 2,
    ...(rules.heroRulesVersion === 2 ? { trainingPerLevel: rules.heroTrainingPerLevel } : {}) },
    runId: runId ?? globalThis.crypto.randomUUID(), sequence: 0, eventSequence: 0,
    encounters: {}, exposures: {}, memorials: [], notices: [], policies: [], policyUses: {},
    residentActions: [], effects: [], concessions: [], intel: [],
  };
  for (const hero of state.heroes) initializeRecruitedHero(state, hero);
}

export function homeProvince(state: GameState): string {
  const safe = state.lands.filter(land => land.ownerId === PLAYER_KINGDOM_ID
    && !state.siegeOrders.some(order => order.landId === land.id && order.attackerKingdomId !== PLAYER_KINGDOM_ID));
  return safe.find(land => land.id === state.ascent?.capitalLandId)?.id ?? safe[0]?.id
    ?? state.lands.find(land => land.ownerId === PLAYER_KINGDOM_ID)?.id ?? '';
}
export function assignmentFromLegacy(state: GameState, hero: Hero): HeroAssignment {
  const at = hero.assignedTo;
  if (!at) return { kind: 'home' };
  if (at.startsWith('court:')) return { kind: 'court', seat: at.slice(6) as CourtPositionId };
  if (at.startsWith('ambassador:')) return { kind: 'embassy', kingdomId: at.slice(11) };
  if (at.startsWith('diplomacy-')) return { kind: 'claim', landId: at.slice(10) };
  if (state.armies.some(army => army.id === at)) return { kind: 'host', armyId: at };
  if (state.recruitmentOrders.some(order => order.id === at)) return { kind: 'muster', orderId: at };
  if (state.lands.some(land => land.id === at)) return { kind: 'province', landId: at };
  return { kind: 'home' };
}
export function assignmentLocation(state: GameState, assignment: HeroAssignment): string {
  if (assignment.kind === 'province' || assignment.kind === 'claim') return assignment.landId;
  if (assignment.kind === 'host') return state.armies.find(army => army.id === assignment.armyId)?.landId ?? homeProvince(state);
  if (assignment.kind === 'embassy') return `embassy:${assignment.kingdomId}`;
  if (assignment.kind === 'muster') return state.recruitmentOrders.find(order => order.id === assignment.orderId)?.landId ?? homeProvince(state);
  return homeProvince(state);
}
export function initializeRecruitedHero(state: GameState, hero: Hero): void {
  if (hero.id === 'king' || !heroCapability(state, 'growth') || hero.growth) return;
  const depth = state.ascent!.heroDepth!;
  const serial = ++depth.sequence;
  hero.growth = { version: 1, instanceId: `${depth.runId}:${serial}`, serial, xp: 0,
    firstWindow: heroWindow(state), training: emptyTraining(), contributions: emptyTraining(),
    lastTrained: hero.type === 'general' ? 'martial' : hero.type === 'agent' ? 'diplomacy' : 'administration',
    perks: [], respecUsed: false, windows: {}, deeds: [], uses: {} };
  const assignment = assignmentFromLegacy(state, hero);
  hero.life = { kind: 'active', locationId: assignmentLocation(state, assignment), assignment };
  const measurement = heroMeasurements(state);
  if (measurement) measurement.recruitedAt[hero.growth.instanceId] = state.turn;
}

/** Complete reference cleanup, also used by capture, authored death and faction removal. */
export function unlinkHeroDuty(state: GameState, hero: Hero): void {
  if (heroRulesV2(state) && hero.growth && hero.life?.kind === 'active' && hero.life.assignment.kind !== 'home') {
    const posting = heroFormerPosting(state, hero);
    hero.growth.lastPosting = { assignment: posting.formerAssignment!, placeName: posting.formerPlaceName };
  }
  if (hero.growth) hero.growth.assignmentRevision = (hero.growth.assignmentRevision ?? 0) + 1;
  for (const seat of Object.keys(state.court.seats) as CourtPositionId[]) {
    if (state.court.seats[seat] === hero.id) delete state.court.seats[seat];
  }
  for (const army of state.armies) if (army.generalHeroId === hero.id) delete army.generalHeroId;
  for (const kingdom of state.kingdoms) if (kingdom.ambassadorHeroId === hero.id) delete kingdom.ambassadorHeroId;
  if (state.heroMissions) state.heroMissions = state.heroMissions.filter(mission => mission.heroId !== hero.id);
  for (const order of state.acquisitionOrders) if (order.heroId === hero.id) delete order.heroId;
  for (const order of state.recruitmentOrders) if (order.heroId === hero.id) delete order.heroId;
  if (state.pendingHeroEvent?.heroId === hero.id) delete state.pendingHeroEvent;
  if (state.ascent) state.ascent.reservedHeroIds = state.ascent.reservedHeroIds.filter(id => id !== hero.id);
  delete hero.assignedTo;
}
/** The compatibility projection has one writer on enabled runs. */
export function commitHeroAssignment(state: GameState, hero: Hero, assignment: HeroAssignment, location?: string): void {
  unlinkHeroDuty(state, hero);
  if (assignment.kind === 'court') {
    const seat = assignment.seat;
    const prior = state.heroes.find(other => other.id === state.court.seats[seat]);
    if (prior && prior.id !== hero.id) commitHeroAssignment(state, prior, { kind: 'home' });
    state.court.seats[assignment.seat] = hero.id; hero.assignedTo = `court:${assignment.seat}`;
  } else if (assignment.kind === 'province') {
    const landId = assignment.landId;
    const prior = state.heroes.find(other => other.id !== hero.id && other.assignedTo === landId);
    if (prior) commitHeroAssignment(state, prior, { kind: 'home' }, assignment.landId);
    hero.assignedTo = assignment.landId;
  } else if (assignment.kind === 'host') {
    const armyId = assignment.armyId;
    const army = state.armies.find(candidate => candidate.id === armyId);
    if (army) {
      const prior = state.heroes.find(other => other.id === army.generalHeroId && other.id !== hero.id);
      if (prior) commitHeroAssignment(state, prior, { kind: 'home' }, army.landId);
      army.generalHeroId = hero.id; hero.assignedTo = army.id;
    } else assignment = { kind: 'home' };
  } else if (assignment.kind === 'embassy') {
    const kingdomId = assignment.kingdomId;
    const kingdom = state.kingdoms.find(candidate => candidate.id === kingdomId);
    if (kingdom) { kingdom.ambassadorHeroId = hero.id; hero.assignedTo = `ambassador:${kingdom.id}`; }
    else assignment = { kind: 'home' };
  } else if (assignment.kind === 'claim') {
    hero.assignedTo = `diplomacy-${assignment.landId}`;
    const landId = assignment.landId;
    const order = state.acquisitionOrders.find(candidate => candidate.landId === landId);
    if (order) order.heroId = hero.id;
  }
  else if (assignment.kind === 'muster') {
    hero.assignedTo = assignment.orderId;
    const orderId = assignment.orderId;
    const order = state.recruitmentOrders.find(candidate => candidate.id === orderId);
    if (order) order.heroId = hero.id;
  }
  hero.life = { kind: 'active', locationId: location ?? assignmentLocation(state, assignment), assignment };
}

export function assignHeroDuty(state: GameState, heroId: string, assignment: HeroAssignment): HeroCommandResult {
  const hero = state.heroes.find(candidate => candidate.id === heroId);
  if (!hero?.growth || hero.id === 'king' || hero.life?.kind !== 'active' || hero.life.sheltering) return { ok: false, reason: 'unavailable' };
  if (assignment.kind === 'court' && !state.court.unlockedSeats.includes(assignment.seat)) return { ok: false, reason: 'unavailable' };
  if (assignment.kind === 'province' && !state.lands.some(land => land.id === assignment.landId && land.ownerId === PLAYER_KINGDOM_ID)) return { ok: false, reason: 'unavailable' };
  if (assignment.kind === 'host' && !state.armies.some(army => army.id === assignment.armyId && army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron)) return { ok: false, reason: 'unavailable' };
  if (heroCapability(state, 'travel')) return transferHero(state, previewHeroTransfer(state, heroId, assignment));
  commitHeroAssignment(state, hero, assignment);
  return { ok: true };
}

export function recordHeroDeed(state: GameState, hero: Hero, kind: HeroDeedKind, target?: string, amount?: number): void {
  if (!hero.growth) return;
  hero.growth.deeds.push({ kind, wave: state.ascent?.wave ?? 0, turn: state.turn, target, amount });
  if (hero.growth.deeds.length > 16) hero.growth.deeds.splice(0, hero.growth.deeds.length - 16);
}

/** Event IDs and their ORIGINAL window travel together, including overlapping battle results. */
export function creditHeroService(state: GameState, hero: Hero, event: {
  id: string; window: number; stat: ProfessionalStat; service?: number; deed?: number; kind?: HeroDeedKind; target?: string;
}): number {
  const growth = hero.growth, depth = state.ascent?.heroDepth;
  if (!heroCapability(state, 'growth') || !growth || !depth || !heroActive(hero)) return 0;
  const current = heroWindow(state);
  if (event.window < growth.firstWindow || event.window > current || event.window < current - 7) return 0;
  const ledger = growth.windows[event.window] ??= { service: 0, deed: 0, events: [] };
  if (ledger.events.includes(event.id)) return 0;
  const service = Math.max(0, Math.min(Math.floor(event.service ?? 0), depth.rules.serviceCap - ledger.service));
  const deed = Math.max(0, Math.min(Math.floor(event.deed ?? 0), depth.rules.deedCap - ledger.deed));
  if (service + deed === 0) {
    if (event.kind && event.kind !== 'service') { ledger.events.push(event.id); recordHeroDeed(state, hero, event.kind, event.target); }
    return 0;
  }
  ledger.events.push(event.id); ledger.service += service; ledger.deed += deed;
  for (const window of Object.keys(growth.windows)) if (Number(window) < current - 7) delete growth.windows[window];
  const oldLevel = heroLevel(hero, depth.rules.thresholds);
  const beforeXP = growth.xp;
  const cap = depth.rules.thresholds[depth.rules.thresholds.length - 1];
  const gained = Math.min(service + deed, cap - growth.xp);
  for (let i = 0; i < gained; i++) {
    growth.xp++; growth.contributions[event.stat]++;
    const level = heroLevel(hero, depth.rules.thresholds);
    if (depth.rules.thresholds[level - 1] !== growth.xp) continue;
    const best = Math.max(...PROFESSIONAL_STATS.map(key => growth.contributions[key]));
    const chosen = growth.contributions[growth.lastTrained] === best ? growth.lastTrained
      : PROFESSIONAL_STATS.find(key => growth.contributions[key] === best)!;
    growth.training[chosen] += heroRulesV2(state) ? depth.rules.trainingPerLevel ?? 2 : 2;
    growth.lastTrained = chosen; growth.contributions = emptyTraining();
  }
  if (event.kind && event.kind !== 'service') recordHeroDeed(state, hero, event.kind, event.target);
  const newLevel = heroLevel(hero, depth.rules.thresholds);
  measureHero(state, hero, 'hero_service_credit', event.id, { before: beforeXP, after: growth.xp, window: event.window });
  for (let level = oldLevel + 1; level <= newLevel; level++) {
    measureHeroMilestone(state, hero, level);
    measureHero(state, hero, 'hero_level_reached', `${event.id}:level:${level}`, { before: level - 1, after: level });
  }
  if (newLevel > oldLevel) {
    measurePerkOffers(state, hero);
    const notice = depth.notices.find(note => note.heroId === hero.id && note.kind === 'level');
    if (notice) notice.level = newLevel; else depth.notices.push({ heroId: hero.id, kind: 'level', level: newLevel });
    recordHeroDeed(state, hero, 'level', undefined, newLevel);
  }
  return gained;
}

function measurePerkOffers(state: GameState, hero: Hero): void {
  const data = heroMeasurements(state), choices = availableHeroPerks(state, hero);
  if (!data || !hero.growth || !choices.length) return;
  const key = `offered:${hero.growth.respecUsed}:${hero.growth.perks.length}`;
  if (hero.growth.uses[key] !== undefined) return;
  hero.growth.uses[key] = heroWindow(state);
  for (const id of choices) data.offers[id] = (data.offers[id] ?? 0) + 1;
}
export function serviceStat(state: GameState, hero: Hero): ProfessionalStat | undefined {
  if (!heroActive(hero) || !hero.assignedTo || hero.id === 'king') return undefined;
  const at = hero.assignedTo;
  const land = state.lands.find(candidate => candidate.id === at);
  if (land) return land.ownerId === PLAYER_KINGDOM_ID && land.outputs.gold + land.outputs.food + land.outputs.supplies > 0 ? governorTrainingStat(land) : undefined;
  if (at.startsWith('court:')) {
    const seat = at.slice(6) as CourtPositionId;
    if (state.court.seats[seat] !== hero.id || !state.court.unlockedSeats.includes(seat)) return undefined;
    // Court offices name a single professional discipline; loyalty and fame are never trained by XP.
    return seat === 'marshal' ? 'martial'
      : seat === 'chancellor' || seat === 'spymaster' ? 'diplomacy'
      : seat === 'quartermaster' || seat === 'masterOfHorse' ? 'logistics' : 'administration';
  }
  const army = state.armies.find(candidate => candidate.id === at && candidate.generalHeroId === hero.id);
  if (army) return Object.values(army.units).some(n => n > 0) && army.rations > 0 && army.provisions > 0 && (army.unpaidTicks ?? 0) === 0
    ? (army.resupplyRun ? 'logistics' : 'martial') : undefined;
  if (at.startsWith('ambassador:')) {
    const kingdom = state.kingdoms.find(candidate => candidate.id === at.slice(11));
    return kingdom && !kingdom.isDefeated && kingdom.ambassadorHeroId === hero.id ? 'diplomacy' : undefined;
  }
  return undefined;
}

export function beginHeroSeason(state: GameState): HeroSeasonSnapshot | undefined {
  if (!heroCapability(state, 'growth')) return undefined;
  const depth = state.ascent!.heroDepth!;
  depth.processingTurn = state.turn;
  prepareHeroProtection(state);
  const service: HeroSeasonSnapshot['service'] = [];
  for (const hero of state.heroes) {
    initializeRecruitedHero(state, hero);
    const stat = serviceStat(state, hero);
    if (!stat || !hero.growth) continue;
    service.push({ heroId: hero.id, instanceId: hero.growth.instanceId, assignment: hero.assignedTo!, stat,
      assignmentRevision: hero.growth.assignmentRevision ?? 0,
      loyalty: state.lands.find(land => land.id === hero.assignedTo)?.loyalty });
  }
  return { turn: state.turn, window: heroWindow(state), service };
}
export function finishHeroSeason(state: GameState, snapshot?: HeroSeasonSnapshot): void {
  if (!snapshot || !state.ascent?.heroDepth) return;
  const productive = new Set<string>();
  for (const job of snapshot.service) {
    const hero = state.heroes.find(candidate => candidate.id === job.heroId && candidate.growth?.instanceId === job.instanceId);
    if (!hero || !serviceStat(state, hero) || hero.assignedTo !== job.assignment || hero.growth?.activityTurn === snapshot.turn
      || (hero.growth?.assignmentRevision ?? 0) !== job.assignmentRevision) continue;
    const stable = job.loyalty !== undefined && job.loyalty < 50
      && (state.lands.find(land => land.id === job.assignment)?.loyalty ?? 0) >= 50;
    creditHeroService(state, hero, { id: `season:${snapshot.turn}`, window: snapshot.window, stat: job.stat,
      service: 1, deed: stable ? 2 : 0, kind: stable ? 'stabilized' : 'service', target: job.assignment });
    productive.add(hero.id);
  }
  for (const hero of state.heroes) measureHeroSeason(state, hero, snapshot.turn, productive.has(hero.id) || hero.growth?.activityTurn === snapshot.turn);
  delete state.ascent.heroDepth.processingTurn;
  tickHeroLifecycle(state);
}
export function chooseHeroPerk(state: GameState, heroId: string, perkId: HeroPerkId): HeroCommandResult {
  const hero = state.heroes.find(candidate => candidate.id === heroId);
  if (!hero?.growth || !availableHeroPerks(state, hero).includes(perkId)) return { ok: false, reason: 'unavailable' };
  const perk = HERO_PERKS.find(candidate => candidate.id === perkId)!;
  hero.growth.discipline = perk.discipline; hero.growth.perks.push(perkId);
  measurePerkOffers(state, hero);
  measureHero(state, hero, 'hero_perk_chosen', `perk:${hero.growth.respecUsed}:${perkId}`, { choice: perkId });
  return { ok: true };
}
export function respecializeHero(state: GameState, heroId: string): HeroCommandResult {
  const hero = state.heroes.find(candidate => candidate.id === heroId);
  if (!hero?.growth || !heroCapability(state, 'specializations') || hero.growth.respecUsed
    || hero.life?.kind !== 'active' || hero.life.assignment.kind !== 'home'
    || hero.life.locationId !== homeProvince(state) || hero.growth.perks.length === 0) return { ok: false, reason: 'unavailable' };
  hero.growth.respecUsed = true; hero.growth.perks = []; delete hero.growth.discipline;
  measurePerkOffers(state, hero);
  hero.life = { kind: 'recovering', locationId: homeProvince(state), readyTurn: state.turn + 2, respec: true };
  return { ok: true };
}

export function heroSummary(state: GameState, hero: Hero) {
  const thresholds = state.ascent?.heroDepth?.rules.thresholds ?? HERO_XP;
  const level = heroLevel(hero, thresholds), xp = hero.growth?.xp ?? 0;
  return { id: hero.id, instanceId: hero.growth?.instanceId, level, xp,
    inLevel: xp - thresholds[level - 1], next: thresholds[level] ?? null,
    needed: thresholds[level] === undefined ? 0 : thresholds[level] - thresholds[level - 1],
    stats: effectiveHeroStats(hero), life: hero.life, perks: hero.growth?.perks ?? [],
    choices: availableHeroPerks(state, hero), window: heroWindow(state),
    allowance: hero.growth?.windows[heroWindow(state)] ?? { service: 0, deed: 0 },
    nextStat: hero.growth ? PROFESSIONAL_STATS.reduce((best, key) => hero.growth!.contributions[key] > hero.growth!.contributions[best] ? key : best, hero.growth.lastTrained) : undefined,
    deeds: hero.growth?.deeds.slice(-3) ?? [] };
}

/** An owned route excludes its origin and includes its destination. No simulation RNG. */
export function heroOwnedRoute(state: GameState, from: string, to: string): string[] | undefined {
  if (!state.lands.some(land => land.id === to && land.ownerId === PLAYER_KINGDOM_ID)) return;
  if (from === to) return [];
  const queue: Array<{ id: string; path: string[] }> = [{ id: from, path: [] }], seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const step = queue[i], land = state.lands.find(candidate => candidate.id === step.id);
    for (const id of land?.neighbors ?? []) {
      if (seen.has(id) || !state.lands.some(candidate => candidate.id === id && candidate.ownerId === PLAYER_KINGDOM_ID)) continue;
      const path = [...step.path, id];
      if (id === to) return path;
      seen.add(id); queue.push({ id, path });
    }
  }
}
/** Prefer home, then the nearest reachable safe province. A threatened capital is not refuge. */
function heroRefuge(state: GameState, landId: string): string | undefined {
  const home = homeProvince(state);
  const threatened = (id: string) => state.siegeOrders.some(order => order.landId === id && order.attackerKingdomId !== PLAYER_KINGDOM_ID)
    || Object.values(state.ascent?.heroDepth?.encounters ?? {}).some(encounter => encounter.landId === id && !encounter.resolved);
  const destinations = state.lands.filter(land => land.ownerId === PLAYER_KINGDOM_ID && land.id !== landId && !threatened(land.id))
    .map(land => ({ id: land.id, route: heroOwnedRoute(state, landId, land.id) }))
    .filter((land): land is { id: string; route: string[] } => land.route !== undefined);
  return destinations.find(land => land.id === home)?.id
    ?? destinations.sort((a, b) => a.route.length - b.route.length || a.id.localeCompare(b.id))[0]?.id;
}
function heroIsTrapped(state: GameState, landId: string): boolean {
  return heroRefuge(state, landId) === undefined;
}
function occupiedHeroPost(state: GameState, post: HeroAssignment, except: string): boolean {
  return state.heroes.some(hero => hero.id !== except && (hero.life?.kind === 'active'
    ? JSON.stringify(hero.life.assignment) === JSON.stringify(post) && post.kind !== 'home'
    : hero.life?.kind === 'transit' && JSON.stringify(hero.life.intendedPost) === JSON.stringify(post) && post.kind !== 'home'));
}
export function previewHeroTransfer(state: GameState, heroId: string, assignment: HeroAssignment, safePassage = false): HeroTransferPreview {
  const hero = state.heroes.find(candidate => candidate.id === heroId);
  const from = hero?.life?.kind === 'active' ? (hero.life.assignment.kind === 'host'
    ? assignmentLocation(state, hero.life.assignment) : hero.life.locationId) : '';
  const exposed = Object.values(state.ascent?.heroDepth?.exposures ?? {}).some(exposure => !exposure.resolved
    && exposure.instanceId === hero?.growth?.instanceId && exposure.landId === from);
  const destination = assignment.kind === 'home' && exposed
    ? heroRefuge(state, from) ?? assignmentLocation(state, assignment) : assignmentLocation(state, assignment);
  const path = heroOwnedRoute(state, from, destination);
  const depth = state.ascent?.heroDepth;
  const usePassage = safePassage && depth?.policies.includes('hero-safe-passage')
    && depth.policyUses['hero-safe-passage'] !== heroWindow(state);
  const supplies = usePassage ? scaledCost(state, { supplies: 10 }).supplies! : 0;
  let reason: string | undefined;
  if (!heroCapability(state, 'travel') || !hero?.growth || hero.life?.kind !== 'active') reason = 'unavailable';
  else if (assignment.kind === 'embassy' || assignment.kind === 'claim' || assignment.kind === 'muster') reason = 'unavailable';
  else if (path === undefined) reason = 'route';
  else if (state.siegeOrders.some(order => order.landId === destination && order.attackerKingdomId !== PLAYER_KINGDOM_ID)) reason = 'contested';
  else if (occupiedHeroPost(state, assignment, heroId)) reason = 'occupied';
  else if (assignment.kind === 'court' && !state.court.unlockedSeats.includes(assignment.seat)) reason = 'unavailable';
  else if (assignment.kind === 'host' && !state.armies.some(army => army.id === assignment.armyId && army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron)) reason = 'unavailable';
  else if (supplies > state.resources.supplies) reason = 'supplies';
  else if (safePassage && !usePassage) reason = 'unavailable';
  const turns = path?.length ? Math.max(1, Math.ceil(path.length / 2) - (usePassage ? 1 : 0)) : 0;
  // Pricing, ownership, posting and front state are part of the quote: a stale confirmation is inert.
  const revision = JSON.stringify([state.turn, hero?.life, hero?.growth?.training, hero?.growth?.perks, assignment, path, supplies,
    state.armies.map(army => [army.id, army.landId, army.generalHeroId]),
    [state.ascent?.activeBattle, ...(state.ascent?.sideBattles ?? [])].filter(Boolean).map(front => [front!.key, front!.round])]);
  return { ok: !reason, reason, heroId, instanceId: hero?.growth?.instanceId ?? '', from, destination,
    path: path ?? [], turns, supplies, assignment, revision, lostStats: hero ? effectiveHeroStats(hero) : undefined };
}
export function transferHero(state: GameState, quote: HeroTransferPreview): HeroCommandResult {
  const current = previewHeroTransfer(state, quote.heroId, quote.assignment, quote.supplies > 0);
  const hero = state.heroes.find(candidate => candidate.id === quote.heroId);
  if (!hero?.growth || !current.ok || current.revision !== quote.revision || hero.growth.instanceId !== quote.instanceId) return { ok: false, reason: current.reason ?? 'stale' };
  if (hero.life?.kind === 'active' && hero.life.assignment.kind === 'host') {
    const armyId = hero.life.assignment.armyId;
    const fronts = [state.ascent?.activeBattle, ...(state.ascent?.sideBattles ?? [])];
    const battles = fronts.filter(front => front && !front.over && front.ourArmyIds?.includes(armyId));
    if (battles.length) {
      // The host remains committed until its existing withdrawal actually finishes.
      hero.growth.withdrawal = { destination: current.destination, assignment: current.assignment };
      for (const battle of battles) battle!.stancePending = 'withdraw';
      measureHero(state, hero, 'hero_transfer_started', `withdraw:${current.revision}`, { before: current.from, after: current.destination });
      return { ok: true };
    }
  }
  applyHeroDepartureEffects(state, hero);
  state.resources.supplies -= current.supplies;
  if (current.supplies) state.ascent!.heroDepth!.policyUses['hero-safe-passage'] = heroWindow(state);
  if (!current.turns) commitHeroAssignment(state, hero, current.assignment, current.destination);
  else {
    unlinkHeroDuty(state, hero);
    hero.life = { kind: 'transit', originId: current.from, locationId: current.from, destinationId: current.destination,
      path: current.path, startedTurn: state.turn, arrivalTurn: state.turn + current.turns, intendedPost: current.assignment };
  }
  measureHero(state, hero, 'hero_transfer_started', `transfer:${current.revision}`, { before: current.from, after: current.destination });
  return { ok: true, cost: current.supplies };
}

/** Read the committed invader forecast or observed field attrition; never roll an outcome. */
export function heroRiskForecast(state: GameState, hero: Hero, landId: string): HeroRiskForecast {
  const quote = previewHeroTransfer(state, hero.id, { kind: 'home' });
  const forecasts = (state.invasions ?? []).filter(record => record.targetLandId === landId && record.plan !== 'withdrawing')
    .map(record => forecastInvader(state, record)).filter(item => item !== undefined);
  const land = state.lands.find(item => item.id === landId);
  const front = [state.ascent?.activeBattle, ...(state.ascent?.sideBattles ?? [])].find(item => item && !item.over && item.landId === landId);
  const hostile = forecasts.map(item => item.armyId);
  if (front?.invaderArmyId && !hostile.includes(front.invaderArmyId)) hostile.push(front.invaderArmyId);
  let source: HeroRiskForecast['source'] = 'unknown', lossIn: number | undefined, lossPct: number | undefined;
  const worst = forecasts.filter(item => item.verdict === 'falls' && item.assaultTicks !== undefined).sort((a, b) => a.assaultTicks! - b.assaultTicks!)[0];
  if (worst) { source = 'invasion'; lossIn = worst.assaultTicks; lossPct = 100 - worst.holdPct; }
  if (front) {
    source = 'field'; lossIn = undefined; lossPct = undefined;
    const beats = front.beats?.slice(-4) ?? [], first = beats[0], last = beats.at(-1);
    if (first && last && first !== last) {
      const ourLoss = beats.reduce((sum, beat) => sum + beat.ourLoss, 0) / beats.length;
      const theirLoss = beats.reduce((sum, beat) => sum + beat.theirLoss, 0) / beats.length;
      const ourBeats = ourLoss > 0 ? front.ourNow / ourLoss : Infinity;
      const theirBeats = theirLoss > 0 ? front.theirNow / theirLoss : Infinity;
      if (ourBeats < theirBeats) lossIn = Math.max(1, Math.ceil(ourBeats / battleBeatsPerTick()));
    }
    if (front.ourNow <= 0 || front.ourMorale <= BATTLE_ROUT_MORALE) lossIn = 0;
  }
  const claim = state.siegeOrders.find(order => order.landId === landId && order.attackerKingdomId !== PLAYER_KINGDOM_ID);
  if (claim) { source = 'capture'; lossIn = Math.max(0, Math.ceil(claim.required - claim.progress)); lossPct = undefined;
    if (!hostile.includes(claim.armyId)) hostile.push(claim.armyId); }
  if (land && land.ownerId !== PLAYER_KINGDOM_ID) { source = 'capture'; lossIn = 0; lossPct = 100; }
  const arrivalTurn = quote.ok && quote.destination !== landId ? state.turn + quote.turns : undefined;
  const ratio = forecasts.length ? Math.max(...forecasts.map(item => item.attack / Math.max(1, item.ready))) : front ? front.theirNow / Math.max(1, front.ourNow) : undefined;
  return { source, lossIn, lossPct, ratio, observedTurn: state.turn, arrivalTurn, destinationId: arrivalTurn === undefined ? undefined : quote.destination,
    route: quote.path, enemyIds: hostile.sort(), signature: JSON.stringify([landId, quote.destination, quote.path, hostile.sort(), lossPct, ratio]) };
}
export function refreshHeroExposure(state: GameState, hero: Hero, exposure: import('./types').HeroExposure): void {
  if (exposure.resolved) return;
  const trapped = heroIsTrapped(state, exposure.landId), old = exposure.forecast;
  const fresh = heroRulesV2(state) ? heroRiskForecast(state, hero, exposure.landId) : undefined;
  const worsened = old && fresh && (JSON.stringify(old.route) !== JSON.stringify(fresh.route)
    || JSON.stringify(old.enemyIds) !== JSON.stringify(fresh.enemyIds)
    || (fresh.lossPct ?? 0) > (old.lossPct ?? 0) || (fresh.ratio ?? 0) > (old.ratio ?? 0) * 1.001
    || (fresh.lossIn !== undefined && (old.lossIn === undefined || state.turn + fresh.lossIn < old.observedTurn + old.lossIn)));
  // Any worsening still invalidates the consent given against the old forecast (a new revision),
  // and a change in *kind* — trapped or freed, another road, another enemy — raises the warning
  // again. **Neither stops the world.** Both used to: first on every worsening, then on every change
  // of kind, and a reign with a governor on a contested border froze every few seasons on a message
  // the player had already read. Reported: *it stops the game frequently to show "… gặp nguy" —
  // don't stop the game, show a bubble on the Heroes icon*. The advisor's `hero-danger` line and the
  // bar's bubble and dot carry it now (`Advisor`, `barStatusColor`).
  const material = trapped !== exposure.trapped || Boolean(old && fresh && (JSON.stringify(old.route) !== JSON.stringify(fresh.route)
    || JSON.stringify(old.enemyIds) !== JSON.stringify(fresh.enemyIds)));
  if (material || worsened) {
    exposure.trapped = trapped; exposure.revision++; delete exposure.deadlyConsentRevision;
    if (heroRulesV2(state)) delete exposure.hold;
    exposure.acknowledged = false;
    if (material) exposure.pauseIssued = false;
  }
  if (fresh) exposure.forecast = fresh;
}
/** Shared by the actual departure and the cloned before/after preview. */
export function applyHeroDepartureEffects(state: GameState, hero: Hero): void {
  retainCommissionCost(state, hero);
  const oldPost = hero.life?.kind === 'active' ? hero.life.assignment : undefined;
  if (oldPost?.kind === 'province' && hasHeroPerk(hero, 'continuity')) {
    const resource = hasHeroPerk(hero, 'granary') ? 'food' : hasHeroPerk(hero, 'works') ? 'supplies' : undefined;
    if (resource && !state.ascent!.heroDepth!.effects.some(effect => effect.id === `continuity:${hero.growth!.instanceId}:${state.turn}`)) state.ascent!.heroDepth!.effects.push({ id: `continuity:${hero.growth!.instanceId}:${state.turn}`,
      kind: 'continuity', heroId: hero.id, targetId: oldPost.landId, untilTurn: state.turn + 2, value: .03, otherId: resource });
  }
}

/** Capture participants before host/province cleanup; reinforcements join the same encounter. */
export function beginHeroEncounter(state: GameState, landId: string, armyIds?: string[], captorId?: string): string | undefined {
  if (!heroCapability(state, 'growth')) return;
  const depth = state.ascent!.heroDepth!;
  let encounter = Object.values(depth.encounters).find(item => item.landId === landId && !item.resolved);
  if (!encounter) {
    const id = `encounter:${++depth.eventSequence}`;
    encounter = depth.encounters[id] = { id, landId, window: heroWindow(state), startedTurn: state.turn, participants: [], captorId };
  }
  const hosts = state.armies.filter(army => army.kingdomId === PLAYER_KINGDOM_ID
    && (armyIds ? armyIds.includes(army.id) : army.landId === landId));
  for (const hero of state.heroes) {
    if (!hero.growth || !heroActive(hero) || (!hosts.some(host => host.generalHeroId === hero.id) && hero.assignedTo !== landId)) continue;
    if (!encounter.participants.some(participant => participant.instanceId === hero.growth!.instanceId)) {
      encounter.participants.push({ heroId: hero.id, instanceId: hero.growth.instanceId,
        role: hero.assignedTo === landId ? governorTrainingStat(state.lands.find(land => land.id === landId)!) : 'martial' });
    }
    if (heroCapability(state, 'recovery')) exposeHero(state, hero, encounter.id, landId, captorId);
  }
  return encounter.id;
}
export function completeHeroEncounter(state: GameState, landId: string, victory: boolean, withdrawal = false): void {
  const depth = state.ascent?.heroDepth;
  if (!depth) return;
  const encounter = Object.values(depth.encounters).find(item => item.landId === landId && !item.resolved);
  if (!encounter) return;
  // A beaten field host can leave a governor under siege. Keep that exposure in the same
  // encounter until relief, evacuation, or actual province loss; receipts prevent repeat XP.
  encounter.resolved = victory || !encounter.participants.some(participant => state.heroes.some(hero => hero.growth?.instanceId === participant.instanceId
    && hero.life?.kind === 'active' && hero.life.assignment.kind === 'province' && hero.life.assignment.landId === landId));
  for (const participant of encounter.participants) {
    const hero = state.heroes.find(candidate => candidate.growth?.instanceId === participant.instanceId);
    if (!hero?.growth) continue;
    creditHeroService(state, hero, { id: encounter.id, window: encounter.window, stat: participant.role,
      service: 2, deed: victory || (heroRulesV2(state) && withdrawal && hero.life?.kind === 'active' && hero.life.assignment.kind === 'host') ? 2 : 0,
      kind: withdrawal ? 'withdrawal' : 'battle', target: landId });
    hero.growth.activityTurn = depth.processingTurn ?? state.turn;
    // Governors are exposed by actual loss of the province, not a host's field withdrawal.
    if (!victory && hero.life?.kind === 'active' && hero.life.assignment.kind === 'host') resolveHeroExposure(state, hero, encounter.id, withdrawal);
    else if (victory) {
      const exposure = depth.exposures[`${encounter.id}:${participant.instanceId}`];
      if (exposure) exposure.resolved = 'safe';
      if (hero.life?.kind === 'active' && hero.life.sheltering === exposure?.id) delete hero.life.sheltering;
    }
  }
}
/** Reports are also the end of watched fights; their snapshot was made when the field opened. */
export function recordHeroBattle(state: GameState, record: AscentBattleRecord): void {
  if (record.role === 'offence') return; // The assault resolver still owns its final outcome.
  completeHeroEncounter(state, record.landId, record.outcome === 'they-rout'
    || (record.outcome === 'spent' && record.ourEnd / Math.max(1, record.ourStart) >= record.theirEnd / Math.max(1, record.theirStart)), record.outcome === 'retreat');
}

export function exposeHero(state: GameState, hero: Hero, encounterId: string, landId: string, captorId?: string): void {
  if (!heroCapability(state, 'recovery') || !hero.growth) return;
  const depth = state.ascent!.heroDepth!, id = `${encounterId}:${hero.growth.instanceId}`;
  const trapped = heroIsTrapped(state, landId);
  const existing = depth.exposures[id];
  if (existing) {
    if (captorId) existing.captorId = captorId;
    refreshHeroExposure(state, hero, existing);
    return;
  }
  depth.exposures[id] = { id, heroId: hero.id, instanceId: hero.growth.instanceId, landId, captorId,
    window: heroWindow(state), warnedTurn: state.turn, revision: 1, trapped };
  if (heroRulesV2(state)) depth.exposures[id].forecast = heroRiskForecast(state, hero, landId);
  measureHero(state, hero, 'hero_exposure_warned', id, { after: trapped ? 'trapped' : 'open' });
  pushToast(state, t(heroCapability(state, 'lethal') ? 'hero.depth.warningConditional' : 'hero.depth.warningNamed', {
    hero: heroName(hero), land: state.lands.find(land => land.id === landId)?.name ?? landId }), 'threat');
}
export function holdHero(state: GameState, exposureId: string, revision: number, lethalConsent = false): HeroCommandResult {
  const exposure = state.ascent?.heroDepth?.exposures[exposureId];
  const hero = state.heroes.find(candidate => candidate.growth?.instanceId === exposure?.instanceId);
  if (exposure && hero) refreshHeroExposure(state, hero, exposure);
  if (!exposure || exposure.resolved || exposure.revision !== revision || !hero || hero.life?.kind !== 'active') return { ok: false, reason: 'stale' };
  delete hero.life.sheltering;
  exposure.hold = true;
  exposure.acknowledged = true;
  delete exposure.deadlyConsentRevision;
  if (lethalConsent && heroCapability(state, 'lethal') && exposure.trapped) exposure.deadlyConsentRevision = revision;
  measureHero(state, hero, 'hero_hold_accepted', `${exposure.id}:${revision}:${lethalConsent}`, { after: lethalConsent ? 'conditional-lethal' : 'recoverable' });
  return { ok: true };
}
function returnTransport(state: GameState, hero: Hero, recovery = 0): void {
  if (!heroCapability(state, 'travel') && !heroCapability(state, 'recovery') && !heroCapability(state, 'residency')) { commitHeroAssignment(state, hero, { kind: 'home' }); return; }
  const origin = hero.life?.kind === 'captive' ? `embassy:${hero.life.captorId}` : hero.life && 'locationId' in hero.life ? hero.life.locationId : homeProvince(state);
  unlinkHeroDuty(state, hero);
  const home = homeProvince(state);
  hero.life = { kind: 'transit', originId: origin, locationId: origin, destinationId: home, path: [],
    startedTurn: state.turn, arrivalTurn: state.turn + 2, intendedPost: { kind: 'home' }, protected: true, recovery };
}
export function recoverStoryHero(state: GameState, hero: Hero): boolean {
  if (!hero.growth) return false;
  if (!heroCapability(state, 'recovery')) { returnTransport(state, hero); return true; }
  if (hero.life?.kind !== 'recovering' && hero.life?.kind !== 'transit') {
    recordHeroDeed(state, hero, 'wounded', hero.life && 'locationId' in hero.life ? hero.life.locationId : undefined);
    returnTransport(state, hero, 3); state.ascent!.heroDepth!.notices.push({ heroId: hero.id, kind: 'wounded' });
  }
  return true;
}
export function captureStoryHero(state: GameState, hero: Hero): boolean {
  if (!hero.growth || !heroCapability(state, 'recovery')) return false;
  if (hero.life?.kind === 'captive' || hero.life?.kind === 'dead' || !heroActive(hero)) return true;
  const captor = state.kingdoms.find(kingdom => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated && !kingdom.vassalage);
  if (!captor) return recoverStoryHero(state, hero);
  unlinkHeroDuty(state, hero);
  hero.life = { kind: 'captive', captorId: captor.id,
    detentionId: state.lands.find(land => land.ownerId === captor.id)?.id ?? `court:${captor.id}`, capturedTurn: state.turn,
    ...(heroRulesV2(state) ? { exposureId: `story:${++state.ascent!.heroDepth!.eventSequence}` } : {}) };
  recordHeroDeed(state, hero, 'captured', captor.id);
  state.ascent!.heroDepth!.notices.push({ heroId: hero.id, kind: 'captured' }); return true;
}
/** Dissolution by payroll or a player command is not a battlefield wound. */
export function returnDisbandedCommander(state: GameState, hero: Hero): void {
  if (hero.growth) returnTransport(state, hero);
}
export function beginHeroClaim(state: GameState, hero: Hero, landId: string): boolean {
  if (!hero.growth || !heroActive(hero) || hero.assignedTo || hero.life?.kind !== 'active') return false;
  const from = hero.life.locationId, target = state.lands.find(land => land.id === landId);
  const route = (target?.neighbors ?? []).map(id => ({ id, path: heroOwnedRoute(state, from, id) }))
    .filter((entry): entry is { id: string; path: string[] } => !!entry.path).sort((a,b)=>a.path.length-b.path.length)[0];
  if (!route) return false;
  hero.growth.uses[`claim:${landId}`] = heroWindow(state);
  if (!heroCapability(state, 'travel')) commitHeroAssignment(state, hero, { kind: 'claim', landId });
  else {
    unlinkHeroDuty(state, hero);
    hero.life = { kind: 'transit', originId: from, locationId: from, destinationId: route.id, path: route.path,
      startedTurn: state.turn, arrivalTurn: state.turn + Math.max(1, Math.ceil((route.path.length + 1) / 2)), intendedPost: { kind: 'claim', landId } };
  }
  return true;
}
export function finishHeroClaim(state: GameState, hero: Hero, landId: string, success: boolean): void {
  if (!hero.growth) return;
  if (success) creditHeroService(state, hero, { id: `claim:${landId}:${hero.growth.uses[`claim:${landId}`]}`, window: hero.growth.uses[`claim:${landId}`] ?? heroWindow(state), stat: 'diplomacy', service: 2, deed: 2, kind: 'agreement', target: landId });
  returnTransport(state, hero);
}
export function resolveHeroExposure(state: GameState, hero: Hero, encounterId: string, escaped = false): void {
  const depth = state.ascent?.heroDepth;
  if (!depth || !hero.growth || !heroCapability(state, 'recovery')) return;
  const exposure = depth.exposures[`${encounterId}:${hero.growth.instanceId}`];
  if (!exposure || exposure.resolved || hero.life?.kind === 'captive' || hero.life?.kind === 'dead' || hero.life?.kind === 'recovering') return;
  if (hero.life?.kind === 'transit' || escaped) { exposure.resolved = 'safe'; return; }
  if (hero.life?.kind === 'active' && hero.life.assignment.kind !== 'host'
    && hero.life.locationId !== exposure.landId) { exposure.resolved = 'safe'; return; }
  // Consent is valid only for the last displayed geometry of this particular encounter.
  if (heroRulesV2(state)) refreshHeroExposure(state, hero, exposure);
  const trapped = heroIsTrapped(state, exposure.landId);
  if (trapped !== exposure.trapped) { exposure.trapped = trapped; exposure.revision++; delete exposure.deadlyConsentRevision; }
  // UUID identifies the recruited instance for receipts; seeded fate uses the stable encounter counter.
  const roll = heroEventRoll(state.mapSettings.seed, hero.growth.serial, encounterId);
  const lethal = heroCapability(state, 'lethal') && trapped && exposure.hold && exposure.deadlyConsentRevision === exposure.revision;
  const captor = state.kingdoms.find(kingdom => kingdom.id === exposure.captorId && !kingdom.isDefeated && kingdom.id !== PLAYER_KINGDOM_ID);
  const fate = heroFate(roll, trapped, !!lethal, !!captor);
  exposure.resolved = fate;
  measureHero(state, hero, 'hero_fate_resolved', exposure.id, { before: 'exposed', after: fate });
  if (fate === 'wounded' || fate === 'captured') recordHeroDeed(state, hero, fate, exposure.landId);
  if (fate === 'safe') returnTransport(state, hero);
  else if (fate === 'wounded') returnTransport(state, hero, 3);
  else if (fate === 'captured') {
    unlinkHeroDuty(state, hero);
    // A field defeat can leave the province ours. Prisoners are taken to the captor's court,
    // not instantly "rescued" by the unchanged owner of the battlefield.
    const detentionId = state.lands.find(land => land.ownerId === captor!.id)?.id ?? `court:${captor!.id}`;
    hero.life = { kind: 'captive', captorId: captor!.id, detentionId, capturedTurn: state.turn,
      ...(heroRulesV2(state) ? { exposureId: exposure.id } : {}) };
  } else memorializeHero(state, hero, 'dead', encounterId);
  if (fate !== 'safe') depth.notices.push({ heroId: hero.id, kind: fate });
}
export function memorializeHero(state: GameState, hero: Hero, fate: 'dead' | 'dismissed' | 'survived', encounterId?: string): void {
  const depth = state.ascent?.heroDepth;
  if (!depth || !hero.growth) return;
  const id = `${hero.growth.instanceId}:${fate}`;
  if (heroRulesV2(state) && depth.memorials.some(item => item.id === id)) return;
  const exposure = encounterId ? depth.exposures[`${encounterId}:${hero.growth.instanceId}`] : undefined;
  if (!depth.memorials.some(item => item.id === id)) depth.memorials.push({ id, heroId: hero.id, name: hero.name,
    highestLevel: heroLevel(hero), deeds: [...hero.growth.deeds], fate, turn: state.turn, wave: state.ascent!.wave, encounterId,
    ...(heroRulesV2(state) ? { ...heroFormerPosting(state, hero),
      acceptedRisk: exposure ? { exposureId: exposure.id, revision: exposure.revision, consentRevision: exposure.deadlyConsentRevision, trapped: exposure.trapped, held: !!exposure.hold } : undefined } : {}) });
  if (fate !== 'survived') { unlinkHeroDuty(state, hero); hero.life = { kind: 'dead', memorialId: id }; }
}
export function releaseKingdomPrisoners(state: GameState, kingdomId: string): void {
  for (const hero of state.heroes) if (hero.life?.kind === 'captive' && hero.life.captorId === kingdomId) returnTransport(state, hero);
  for (const hero of state.heroes) if (hero.assignedTo === `ambassador:${kingdomId}`) returnTransport(state, hero);
}
export function heroRansomCost(state: GameState, hero: Hero): number {
  const captorId = hero.life?.kind === 'captive' ? hero.life.captorId : '';
  const custodian = state.heroes.some(envoy => envoy.assignedTo === `ambassador:${captorId}` && hasHeroPerk(envoy, 'custodian'));
  return Math.ceil(scaledCost(state, { gold: 30 + 10 * heroLevel(hero) }).gold! * (custodian ? .8 : 1));
}
export function quoteHeroRelease(state: GameState, heroId: string, method: 'gold' | 'concession'): HeroReleaseQuote | undefined {
  const hero = state.heroes.find(person => person.id === heroId);
  if (!hero?.growth || hero.life?.kind !== 'captive') return;
  const cost = method === 'gold' ? heroRansomCost(state, hero) : 0;
  return { heroId, instanceId: hero.growth.instanceId, method, cost,
    revision: JSON.stringify([state.turn, hero.growth.instanceId, hero.life, method, cost]) };
}
export function releaseHeroFromQuote(state: GameState, quote: HeroReleaseQuote): HeroCommandResult {
  const fresh = quoteHeroRelease(state, quote.heroId, quote.method);
  if (!fresh || fresh.instanceId !== quote.instanceId || fresh.revision !== quote.revision) return { ok: false, reason: 'stale' };
  return releaseCaptive(state, quote.heroId, quote.method, quote.cost);
}
export function releaseCaptive(state: GameState, heroId: string, method: 'gold' | 'concession', expectedCost?: number): HeroCommandResult {
  const hero = state.heroes.find(candidate => candidate.id === heroId), depth = state.ascent?.heroDepth;
  if (!depth || hero?.life?.kind !== 'captive') return { ok: false, reason: 'unavailable' };
  const cost = method === 'gold' ? heroRansomCost(state, hero) : 0;
  if (expectedCost !== undefined && expectedCost !== cost) return { ok: false, reason: 'stale' };
  if (state.resources.gold < cost) return { ok: false, reason: 'gold' };
  if (method === 'concession') heroReleasePact(state, hero.life.captorId, 3);
  state.resources.gold -= cost;
  measureHero(state, hero, 'hero_recovered', `release:${hero.life.capturedTurn}:${hero.life.exposureId ?? ''}`, { before: 'captive', after: 'returning' });
  returnTransport(state, hero); recordHeroDeed(state, hero, 'rescued');
  return { ok: true, cost };
}
export function treatHero(state: GameState, heroId: string, expectedCost: number): HeroCommandResult {
  const hero = state.heroes.find(candidate => candidate.id === heroId);
  const cost = scaledCost(state, { supplies: 10 }).supplies!;
  if (hero?.life?.kind !== 'recovering' || hero.life.respec || hero.life.treatmentUsed || hero.life.readyTurn <= state.turn + 1
    || expectedCost !== cost || state.resources.supplies < cost) return { ok: false, reason: 'unavailable' };
  state.resources.supplies -= cost; hero.life.treatmentUsed = true; hero.life.readyTurn--;
  return { ok: true, cost };
}
export function tickHeroLifecycle(state: GameState): void {
  const depth = state.ascent?.heroDepth;
  if (!depth) return;
  tickResidency(state);
  const home = homeProvince(state);
  for (const hero of state.heroes) {
    const life = hero.life;
    if (!hero.growth || !life) continue;
    if (life.kind === 'captive') {
      if (!state.kingdoms.some(kingdom => kingdom.id === life.captorId && !kingdom.isDefeated)
        || state.lands.some(land => land.id === life.detentionId && land.ownerId === PLAYER_KINGDOM_ID)) returnTransport(state, hero);
    } else if (life.kind === 'recovering' && state.turn >= life.readyTurn && home) {
      measureHero(state, hero, 'hero_recovered', `recovery:${life.readyTurn}`, { before: 'recovering', after: 'active' });
      commitHeroAssignment(state, hero, { kind: 'home' }); depth.notices.push({ heroId: hero.id, kind: 'recovered' });
    } else if (life.kind === 'transit') {
      if (!home) continue;
      if (!life.protected) {
        if (!state.lands.some(land => land.id === life.locationId && land.ownerId === PLAYER_KINGDOM_ID)) {
          // A route can fall underneath a traveller. This unconsented loss is always recoverable.
          returnTransport(state, hero, heroCapability(state, 'recovery') ? 3 : 0);
          depth.notices.push({ heroId: hero.id, kind: 'wounded' }); continue;
        }
        if (life.intendedPost.kind === 'host') {
          const armyId = life.intendedPost.armyId;
          const host = state.armies.find(army => army.id === armyId && army.kingdomId === PLAYER_KINGDOM_ID);
          if (!host) { life.intendedPost = { kind: 'home' }; life.destinationId = home; }
          else if (host.landId !== life.destinationId) {
            life.destinationId = host.landId;
            const onward = heroOwnedRoute(state, life.locationId, life.destinationId);
            life.arrivalTurn = state.turn + Math.max(1, Math.ceil((onward?.length ?? 2) / 2));
          }
        }
        const route = heroOwnedRoute(state, life.locationId, life.destinationId);
        life.blocked = !route || state.siegeOrders.some(order => order.landId === life.destinationId && order.attackerKingdomId !== PLAYER_KINGDOM_ID);
        if (!route || life.blocked) { life.arrivalTurn = Math.max(life.arrivalTurn, state.turn + 1); continue; }
        const stepCount = Math.max(1, Math.ceil(route.length / Math.max(1, life.arrivalTurn - state.turn + 1)));
        life.locationId = route[Math.min(stepCount, route.length) - 1] ?? life.locationId;
        life.path = route.slice(stepCount);
      }
      if (state.turn < life.arrivalTurn || (!life.protected && life.locationId !== life.destinationId)) continue;
      if (life.intendedPost.kind === 'embassy') {
        const kingdomId = life.intendedPost.kingdomId;
        const host = state.kingdoms.find(crown => crown.id === kingdomId && !crown.isDefeated);
        if (!host || hostileCourt(state, kingdomId) || (host.relations ?? 50) < 40) { returnTransport(state, hero); continue; }
        if (life.audience) { life.arrivalTurn += life.audience; life.audience = 0; continue; }
      }
      if (life.intendedPost.kind === 'claim' && !state.acquisitionOrders.some(order => order.landId === (life.intendedPost as Extract<HeroAssignment, { kind: 'claim' }>).landId)) {
        commitHeroAssignment(state, hero, { kind: 'home' }, life.locationId);
      } else if (life.recovery) {
        const infirmary = depth.policies.includes('hero-field-infirmary') && depth.policyUses['hero-field-infirmary'] !== heroWindow(state);
        if (infirmary) depth.policyUses['hero-field-infirmary'] = heroWindow(state);
        hero.life = { kind: 'recovering', locationId: home, readyTurn: state.turn + Math.max(1, life.recovery - (infirmary ? 1 : 0)), treatmentUsed: infirmary };
      } else if (occupiedHeroPost(state, life.intendedPost, hero.id)) {
        commitHeroAssignment(state, hero, { kind: 'home' }, life.locationId);
      } else commitHeroAssignment(state, hero, life.intendedPost, life.destinationId);
      depth.notices.push({ heroId: hero.id, kind: 'arrived' });
      if (life.intendedPost.kind === 'home') recordHeroDeed(state, hero, 'returned');
    } else if (life.kind === 'active') {
      if (life.assignment.kind === 'host') {
        const army = state.armies.find(candidate => candidate.id === (life.assignment as Extract<HeroAssignment, { kind: 'host' }>).armyId);
        if (army) life.locationId = army.landId;
        else {
          const exposure = Object.values(depth.exposures).find(item => item.instanceId === hero.growth!.instanceId && !item.resolved);
          if (exposure) resolveHeroExposure(state, hero, exposure.id.slice(0, -(hero.growth.instanceId.length + 1)));
          else returnTransport(state, hero, heroCapability(state, 'recovery') ? 3 : 0);
        }
      }
      if ((life.assignment.kind === 'province' || Object.values(depth.exposures).some(exposure => exposure.instanceId === hero.growth!.instanceId && !exposure.resolved && exposure.landId === life.locationId))
        && !state.lands.some(land => land.id === life.locationId && land.ownerId === PLAYER_KINGDOM_ID)) {
        const prior = Object.values(depth.exposures).find(item => item.instanceId === hero.growth!.instanceId && item.landId === life.locationId && !item.resolved);
        const encounter = prior ? prior.id.slice(0, -(hero.growth.instanceId.length + 1)) : beginHeroEncounter(state, life.locationId);
        if (encounter) { exposeHero(state, hero, encounter, life.locationId, state.lands.find(land => land.id === life.locationId)?.ownerId); resolveHeroExposure(state, hero, encounter); }
      }
      if (hero.growth.withdrawal && hero.life?.kind === 'active') {
        const fronts = [state.ascent?.activeBattle, ...(state.ascent?.sideBattles ?? [])];
        if (!fronts.some(front => front && !front.over && front.ourArmyIds?.some(id => state.armies.some(army => army.id === id && army.generalHeroId === hero.id)))) {
          const order = hero.growth.withdrawal; delete hero.growth.withdrawal;
          transferHero(state, previewHeroTransfer(state, hero.id, order.assignment));
        }
      }
    }
  }
  for (const effect of [...depth.effects]) {
    if (effect.kind === 'mentoring' && effect.untilTurn <= state.turn) {
      const mentor = state.heroes.find(hero => hero.id === effect.heroId), student = state.heroes.find(hero => hero.id === effect.otherId);
      if (mentor && student && serviceStat(state, mentor) && serviceStat(state, student)
        && mentor.growth?.instanceId === effect.mentorInstance && student.growth?.instanceId === effect.studentInstance
        && (mentor.growth?.assignmentRevision ?? 0) === effect.mentorRevision && (student.growth?.assignmentRevision ?? 0) === effect.studentRevision
        && mentor.assignedTo === effect.targetId && student.assignedTo === effect.id.split('|')[1]) {
        creditHeroService(state, student, { id: effect.id, window: effect.value!, stat: serviceStat(state, student) ?? 'administration', deed: 2 });
      }
    }
    if (effect.kind === 'commission' && effect.otherId && depth.exposures[effect.otherId]?.resolved) effect.untilTurn = Math.min(effect.untilTurn, state.turn + 1);
    if (effect.kind === 'acting') {
      const hero = state.heroes.find(person => person.id === effect.heroId);
      if (hero?.life?.kind === 'transit' && effect.value === 0) { effect.untilTurn = state.turn + 2; continue; }
      if (hero?.assignedTo === effect.targetId && effect.value === 0) { effect.value = 1; effect.untilTurn = state.turn + 2; }
      if (effect.untilTurn <= state.turn && hero?.life?.kind === 'active' && effect.restore) {
        const result = assignHeroDuty(state, hero.id, effect.restore);
        if (!result.ok && !assignHeroDuty(state, hero.id, { kind: 'home' }).ok) {
          // Waiting for a road must not silently promote a temporary officer to a full governor.
          effect.untilTurn = state.turn + 1;
        }
      }
    }
  }
  depth.effects = depth.effects.filter(effect => effect.untilTurn > state.turn);
  for (const encounter of Object.values(depth.encounters)) {
    const threatened = state.siegeOrders.some(order => order.landId === encounter.landId && order.attackerKingdomId !== PLAYER_KINGDOM_ID)
      || (state.invasions ?? []).some(invasion => invasion.targetLandId === encounter.landId && invasion.plan !== 'withdrawing' && state.armies.some(army => army.id === invasion.armyId))
      || [state.ascent?.activeBattle, ...(state.ascent?.sideBattles ?? [])].some(front => front && !front.over && front.landId === encounter.landId);
    for (const exposure of Object.values(depth.exposures).filter(item => item.id.startsWith(`${encounter.id}:`) && !item.resolved)) {
      const hero = state.heroes.find(person => person.growth?.instanceId === exposure.instanceId);
      const departed = hero?.life?.kind === 'active' && hero.life.locationId !== exposure.landId;
      const relieved = !threatened && state.turn > encounter.startedTurn && state.lands.some(land => land.id === exposure.landId && land.ownerId === PLAYER_KINGDOM_ID);
      if (departed || relieved || !hero) {
        exposure.resolved = 'safe';
        if (hero?.life?.kind === 'active' && hero.life.sheltering === exposure.id) delete hero.life.sheltering;
      }
    }
    if (!threatened && state.turn > encounter.startedTurn) encounter.resolved = true;
  }
  depth.concessions = depth.concessions.filter(pact => pact.expiresWindow > heroWindow(state));
  if (depth.notices.length > 48) depth.notices.splice(0, depth.notices.length - 48);
  // Old windows can no longer grant XP. Keep unresolved fronts, prune settled history for Endless.
  for (const [id, encounter] of Object.entries(depth.encounters)) {
    const receipts = Object.values(depth.exposures).filter(exposure => exposure.id.startsWith(`${id}:`));
    if (!encounter.resolved || encounter.window >= heroWindow(state) - 7 || receipts.some(exposure => !exposure.resolved)) continue;
    for (const exposure of receipts) delete depth.exposures[exposure.id];
    delete depth.encounters[id];
  }
  depth.intel = depth.intel.slice(-8);
}

/** Default protection is automatic when an announced front is close enough to threaten the job. */
function prepareHeroProtection(state: GameState): void {
  const depth = state.ascent?.heroDepth;
  if (!depth || !heroCapability(state, 'recovery')) return;
  if (heroRulesV2(state)) for (const order of state.siegeOrders) {
    if (order.attackerKingdomId !== PLAYER_KINGDOM_ID && state.heroes.some(hero => hero.growth && hero.assignedTo === order.landId && heroActive(hero)))
      beginHeroEncounter(state, order.landId, [], order.attackerKingdomId);
  }
  for (const invasion of state.invasions ?? []) {
    if (!invasion.targetLandId || invasion.plan === 'withdrawing' || !state.armies.some(army => army.id === invasion.armyId)) continue;
    const target = invasion.targetLandId;
    const hero = state.heroes.find(person => person.growth && person.assignedTo === target && heroActive(person));
    if (hero) beginHeroEncounter(state, target, [], invasion.kingdomId);
  }
  const fronts = [state.ascent?.activeBattle, ...(state.ascent?.sideBattles ?? [])];
  for (const exposure of Object.values(depth.exposures)) {
    if (exposure.resolved) continue;
    const hero = state.heroes.find(person => person.growth?.instanceId === exposure.instanceId);
    if (!hero || hero.life?.kind !== 'active') continue;
    refreshHeroExposure(state, hero, exposure);
    // The first season of a warning is still the player's to answer before the court protects the
    // hero on its own — but it is announced, not enforced by stopping the world (see
    // `refreshHeroExposure`). `pauseIssued` keeps its name for save compatibility; it now marks
    // that this revision's grace season has been given.
    if (!exposure.acknowledged && (!heroRulesV2(state) || !exposure.pauseIssued)) {
      exposure.pauseIssued = true;
      if (heroRulesV2(state)) continue;
    }
    if (exposure.hold || (heroRulesV2(state) ? state.turn < exposure.warnedTurn : state.turn <= exposure.warnedTurn)) continue;
    const front = fronts.find(battle => battle && !battle.over && battle.landId === exposure.landId);
    const falling = state.siegeOrders.some(order => order.landId === exposure.landId && order.attackerKingdomId !== PLAYER_KINGDOM_ID);
    const forecast = exposure.forecast;
    const eta = forecast?.arrivalTurn === undefined ? 0 : Math.max(0, forecast.arrivalTurn - state.turn);
    const endangered = heroRulesV2(state) ? forecast?.lossIn !== undefined && forecast.lossIn <= eta + 1
      : falling || (front && front.ourNow / Math.max(1, front.theirNow) < .65);
    if (endangered) protectHero(state, exposure.id);
  }
}
export function protectHero(state: GameState, exposureId: string): HeroCommandResult {
  const exposure = state.ascent?.heroDepth?.exposures[exposureId];
  const hero = state.heroes.find(person => person.growth?.instanceId === exposure?.instanceId);
  if (!exposure || exposure.resolved || !hero || hero.life?.kind !== 'active') return { ok: false, reason: 'unavailable' };
  exposure.acknowledged = true; delete exposure.hold; delete exposure.deadlyConsentRevision;
  const quote = previewHeroTransfer(state, hero.id, { kind: 'home' });
  if (quote.ok && quote.destination !== exposure.landId) return transferHero(state, quote);
  // Trapped does not promise extraction. Sheltering removes the job contribution; fate remains recoverable.
  retainCommissionCost(state, hero);
  hero.life.sheltering = exposure.id;
  return { ok: true };
}

function retainCommissionCost(state: GameState, hero: Hero): void {
  if (!heroRulesV2(state)) return;
  for (const effect of state.ascent!.heroDepth!.effects) if (effect.kind === 'commission' && effect.heroId === hero.id
    && effect.untilTurn > state.turn && hero.assignedTo === effect.targetId) effect.productionUntilTurn = state.turn + 1;
}
export function heroCommissionReason(state: GameState, heroId: string, landId: string): string | undefined {
  if (!heroRulesV2(state)) return;
  if (!state.lands.some(land => land.id === landId && land.ownerId === PLAYER_KINGDOM_ID && land.specialization === 'fortress')) return 'fortress';
  const front = [state.ascent?.activeBattle, ...(state.ascent?.sideBattles ?? [])].find(front => front && !front.over && front.landId === landId);
  if (front && (front.round > 0 || (front.approachBeats ?? 0) > 0 || front.steeredFormation || front.steeredStance || front.stancePending)) return 'orders-locked';
  if (!state.heroes.some(hero => hero.id === heroId && hero.assignedTo === landId && heroActive(hero))) return 'unavailable';
}

export function useHeroPolicy(state: GameState, id: 'hero-apprenticeship' | 'hero-frontier-commission' | 'hero-acting-council', heroId: string, targetId: string): HeroCommandResult {
  const depth = state.ascent?.heroDepth, hero = state.heroes.find(person => person.id === heroId), window = heroWindow(state);
  if (!depth || !heroCapability(state, 'cards') || !depth.policies.includes(id) || depth.policyUses[id] === window || !hero?.growth || !heroActive(hero)) return { ok: false, reason: 'unavailable' };
  if (id === 'hero-apprenticeship') {
    const student = state.heroes.find(person => person.id === targetId);
    if (!student?.growth || !heroActive(student) || heroLevel(hero) < 3 || heroLevel(student) >= heroLevel(hero) || !serviceStat(state, hero) || !serviceStat(state, student)) return { ok: false, reason: 'service' };
    depth.effects.push({ id: `mentor:${++depth.eventSequence}|${student.assignedTo}`, kind: 'mentoring', heroId, otherId: student.id,
      mentorInstance: hero.growth.instanceId, studentInstance: student.growth.instanceId,
      mentorRevision: hero.growth.assignmentRevision ?? 0, studentRevision: student.growth.assignmentRevision ?? 0,
      targetId: hero.assignedTo!, untilTurn: state.turn + 1, value: window });
  } else if (id === 'hero-frontier-commission') {
    const reason = heroCommissionReason(state, heroId, targetId);
    if (reason) return { ok: false, reason };
    const exposure = Object.values(depth.exposures).find(item => item.heroId === heroId && !item.resolved && item.landId === targetId);
    if (!exposure || hero.assignedTo !== targetId) return { ok: false, reason: 'unavailable' };
    exposure.hold = true; exposure.acknowledged = true;
    depth.effects.push({ id: `commission:${++depth.eventSequence}`, kind: 'commission', heroId, targetId,
      untilTurn: state.turn + 10000, otherId: exposure.id });
  } else {
    if (hero.life?.kind !== 'active' || hero.life.assignment.kind !== 'court') return { ok: false, reason: 'home' };
    const restore = hero.life.assignment;
    const quote = previewHeroTransfer(state, heroId, { kind: 'province', landId: targetId });
    if (!quote.ok) return { ok: false, reason: quote.reason };
    transferHero(state, quote);
    depth.effects.push({ id: `acting:${++depth.eventSequence}`, kind: 'acting', heroId, targetId, untilTurn: state.turn + quote.turns + 2, value: quote.turns ? 0 : 1, restore });
  }
  depth.policyUses[id] = window;
  measureHero(state, hero, 'hero_policy_used', `${id}:${window}`, { choice: id });
  return { ok: true };
}

/** The receipt is minted at dispatch, then carried by the real supply column. */
export function heroResupplyDelivery(state: GameState, armyId: string, receipt: { id: string; window: number; instanceId?: string; boosted?: boolean; requested?: boolean }, food: number, supplies: number, completed = false): { food: number; supplies: number } {
  const army = state.armies.find(host => host.id === armyId);
  const hero = state.heroes.find(person => person.id === army?.generalHeroId && (receipt.instanceId === undefined || person.growth?.instanceId === receipt.instanceId));
  if (!hero?.growth || !army || food + supplies <= 0) return { food, supplies };
  const key = `resupply:${receipt.id}`;
  if (hero.growth.uses[key] === undefined) {
    hero.growth.uses[key] = receipt.window;
    creditHeroService(state, hero, { id: key, window: receipt.window, stat: 'logistics', service: 2, kind: 'supply', target: army.landId });
    hero.growth.activityTurn = state.ascent!.heroDepth!.processingTurn ?? state.turn;
    receipt.boosted = hasHeroPerk(hero, 'relief-stores') && hero.growth.uses[`relief-stores:${receipt.window}`] === undefined;
    if (receipt.boosted) hero.growth.uses[`relief-stores:${receipt.window}`] = receipt.window;
  }
  if (heroRulesV2(state) && completed && receipt.requested) creditHeroService(state, hero, {
    id: `${key}:delivered`, window: receipt.window, stat: 'logistics', deed: 2, kind: 'supply', target: army.landId });
  return receipt.boosted ? { food: food * 1.1, supplies: supplies * 1.1 } : { food, supplies };
}

function heroReleasePact(state: GameState, kingdomId: string, waves: number): void {
  const kingdom = state.kingdoms.find(crown => crown.id === kingdomId);
  if (!kingdom) return;
  const until = (state.ascent?.wavesSurvived ?? 0) + waves;
  const pact = kingdom.treaties?.find(treaty => treaty.expiresResolvedWave !== undefined);
  if (pact) pact.expiresResolvedWave = Math.max(pact.expiresResolvedWave!, until);
  else (kingdom.treaties ??= []).push({ type: 'non-aggression', expiresTurn: Number.MAX_SAFE_INTEGER, expiresResolvedWave: until });
}
function hostileCourt(state: GameState, kingdomId: string): boolean {
  return (state.invasions ?? []).some(invasion => invasion.kingdomId === kingdomId && invasion.plan !== 'withdrawing'
    && state.armies.some(army => army.id === invasion.armyId));
}
export function residentEntryReason(state: GameState, hero: Hero, kingdomId: string): string | undefined {
  const kingdom = state.kingdoms.find(crown => crown.id === kingdomId && crown.id !== PLAYER_KINGDOM_ID && !crown.isDefeated);
  if (!heroCapability(state, 'residency') || !hero.growth || !heroActive(hero) || hero.life?.kind !== 'active'
    || hero.life.assignment.kind !== 'home' || hero.life.locationId !== homeProvince(state)) return 'home';
  if (!kingdom || (kingdom.relations ?? 50) < 40 || hostileCourt(state, kingdomId)) return 'acceptance';
  if (kingdom.ambassadorHeroId || state.heroes.some(person => person.life?.kind === 'transit'
    && person.life.intendedPost.kind === 'embassy' && person.life.intendedPost.kingdomId === kingdomId)) return 'occupied';
}
export function postResident(state: GameState, heroId: string, kingdomId: string): HeroCommandResult {
  const hero = state.heroes.find(person => person.id === heroId);
  if (!hero) return { ok: false, reason: 'unavailable' };
  const reason = residentEntryReason(state, hero, kingdomId);
  if (reason) return { ok: false, reason };
  const depth = state.ascent!.heroDepth!, window = heroWindow(state);
  const letters = depth.policies.includes('hero-letters-of-credence') && depth.policyUses['hero-letters-of-credence'] !== window;
  if (letters) depth.policyUses['hero-letters-of-credence'] = window;
  unlinkHeroDuty(state, hero);
  hero.life = { kind: 'transit', originId: homeProvince(state), locationId: homeProvince(state), destinationId: `embassy:${kingdomId}`,
    path: [], startedTurn: state.turn, arrivalTurn: state.turn + 2, intendedPost: { kind: 'embassy', kingdomId }, protected: true, audience: letters ? 0 : 1 };
  return { ok: true };
}
export function recallResident(state: GameState, heroId: string): HeroCommandResult {
  const hero = state.heroes.find(person => person.id === heroId);
  if (!hero || !heroCapability(state, 'residency') || (hero.life?.kind === 'active'
    ? hero.life.assignment.kind !== 'embassy' : hero.life?.kind !== 'transit' || hero.life.intendedPost.kind !== 'embassy')) return { ok: false, reason: 'unavailable' };
  returnTransport(state, hero); return { ok: true };
}
export function rerouteHeroHome(state: GameState, heroId: string): HeroCommandResult {
  const hero = state.heroes.find(person => person.id === heroId), home = homeProvince(state);
  if (hero?.life?.kind !== 'transit' || hero.life.protected) return { ok: false, reason: 'unavailable' };
  const route = heroOwnedRoute(state, hero.life.locationId, home);
  if (!route) return { ok: false, reason: 'route' };
  hero.life.destinationId = home; hero.life.path = route; hero.life.intendedPost = { kind: 'home' };
  hero.life.arrivalTurn = state.turn + Math.max(1, Math.ceil(route.length / 2)); hero.life.blocked = false;
  return { ok: true };
}
export function residentActionQuote(state: GameState, heroId: string, kind: 'supplies' | 'intelligence' | 'release', targetId?: string) {
  const hero = state.heroes.find(person => person.id === heroId), depth = state.ascent?.heroDepth;
  const kingdomId = hero?.life?.kind === 'active' && hero.life.assignment.kind === 'embassy' ? hero.life.assignment.kingdomId : '';
  const kingdom = state.kingdoms.find(crown => crown.id === kingdomId);
  const influence = Math.ceil((kind === 'intelligence' ? 10 : 15) * (hasHeroPerk(hero, 'resident-broker') ? .9 : 1));
  const seasons = hasHeroPerk(hero, 'patient-audience') ? 1 : 2;
  let reason: string | undefined;
  if (!heroCapability(state, 'residency') || !hero?.growth || !heroActive(hero) || !kingdom || kingdom.isDefeated) reason = 'unavailable';
  else if (depth!.residentActions.some(action => action.heroId === heroId)) reason = 'busy';
  else if (hero.growth.uses[`resident:${kind}`] === heroWindow(state)) reason = 'allowance';
  else if (state.court.influence < influence) reason = 'influence';
  else if (hostileCourt(state, kingdomId)) reason = 'acceptance';
  if (!reason && kind === 'supplies') {
    const land = state.lands.find(province => province.id === targetId && province.ownerId === PLAYER_KINGDOM_ID);
    if ((kingdom!.relations ?? 50) < 60 || !kingdom!.opinionModifiers?.some(mod => mod.id === 'trade-charter')) reason = 'charter';
    else if (!land || land.outputs.supplies <= 0 || heroOwnedRoute(state, homeProvince(state), land.id) === undefined) reason = 'supplyProvince';
  }
  if (!reason && kind === 'intelligence') {
    const plan = committedWavePlan(state);
    if (!plan || depth!.intel.some(report => report.wave === plan.wave && report.kingdomId === plan.kingdomId)) reason = 'intel';
  }
  if (!reason && kind === 'release' && !state.heroes.some(person => person.id === targetId
    && person.life?.kind === 'captive' && person.life.captorId === kingdomId)) reason = 'captive';
  const target = kind === 'release' ? state.heroes.find(person => person.id === targetId) : undefined;
  return { ok: !reason, reason, heroId, kingdomId, kind, targetId, influence, seasons, window: heroWindow(state), turn: state.turn,
    ...(heroRulesV2(state) ? { instanceId: hero?.growth?.instanceId,
      targetRevision: target ? JSON.stringify([target.growth?.instanceId, target.life]) : undefined } : {}) };
}
export function startResidentAction(state: GameState, quote: ReturnType<typeof residentActionQuote>): HeroCommandResult {
  const fresh = residentActionQuote(state, quote.heroId, quote.kind, quote.targetId);
  if (!fresh.ok || JSON.stringify(fresh) !== JSON.stringify(quote)) return { ok: false, reason: fresh.reason ?? 'stale' };
  const depth = state.ascent!.heroDepth!, hero = state.heroes.find(person => person.id === quote.heroId)!;
  state.court.influence -= quote.influence;
  hero.growth!.uses[`resident:${quote.kind}`] = quote.window;
  depth.residentActions.push({ id: `resident:${++depth.eventSequence}`, kind: quote.kind, heroId: hero.id, kingdomId: quote.kingdomId,
    targetId: quote.targetId, startedTurn: state.turn, dueTurn: state.turn + quote.seasons, window: quote.window, influence: quote.influence,
    ...(heroRulesV2(state) ? { instanceId: quote.instanceId, targetRevision: quote.targetRevision } : {}) });
  measureHero(state, hero, 'hero_residency_action', `resident:${depth.eventSequence}:queued`, { before: 'available', after: 'queued', choice: quote.kind });
  return { ok: true, cost: quote.influence };
}
function tickResidency(state: GameState): void {
  const depth = state.ascent?.heroDepth;
  if (!depth || !heroCapability(state, 'residency')) return;
  for (const hero of state.heroes) {
    if (hero.life?.kind !== 'active' || hero.life.assignment.kind !== 'embassy') continue;
    const kingdomId = hero.life.assignment.kingdomId;
    const kingdom = state.kingdoms.find(crown => crown.id === kingdomId && !crown.isDefeated);
    if (!kingdom || hostileCourt(state, kingdomId) || (kingdom.relations ?? 50) < 30) recallResident(state, hero.id);
  }
  for (const action of [...depth.residentActions]) {
    const hero = state.heroes.find(person => person.id === action.heroId);
    const valid = heroActive(hero ?? { } as Hero) && hero?.life?.kind === 'active'
      && hero.life.assignment.kind === 'embassy' && hero.life.assignment.kingdomId === action.kingdomId
      && (!action.instanceId || hero.growth?.instanceId === action.instanceId);
    if (!valid) {
      if (hero) measureHero(state, hero, 'hero_residency_action', `${action.id}:resolved`, { before: 'queued', after: 'refunded' });
      state.court.influence = Math.min(100, state.court.influence + action.influence); depth.residentActions = depth.residentActions.filter(item => item.id !== action.id); continue;
    }
    if (state.turn < action.dueTurn) continue;
    let success = false;
    if (action.kind === 'supplies') {
      const land = state.lands.find(province => province.id === action.targetId && province.ownerId === PLAYER_KINGDOM_ID);
      const court = state.kingdoms.find(kingdom => kingdom.id === action.kingdomId);
      if (land && (court?.relations ?? 0) >= 60 && court?.opinionModifiers?.some(modifier => modifier.id === 'trade-charter')
        && land.outputs.supplies > 0 && heroOwnedRoute(state, homeProvince(state), land.id) !== undefined) {
        depth.effects.push({ id: action.id, kind: 'supply', heroId: hero!.id, targetId: land.id, untilTurn: state.turn + 3 }); success = true;
      }
    } else if (action.kind === 'intelligence') {
      const plan = committedWavePlan(state);
      if (plan && !depth.intel.some(report => report.wave === plan.wave && report.kingdomId === plan.kingdomId)) { depth.intel.push(plan); success = true; }
    } else {
      const captive = state.heroes.find(person => person.id === action.targetId && person.life?.kind === 'captive' && person.life.captorId === action.kingdomId
        && (!action.targetRevision || action.targetRevision === JSON.stringify([person.growth?.instanceId, person.life])));
      if (captive) { heroReleasePact(state, action.kingdomId, 1); returnTransport(state, captive); recordHeroDeed(state, captive, 'rescued'); success = true; }
    }
    if (success) creditHeroService(state, hero!, { id: action.id, window: action.window, stat: 'diplomacy', service: 2, deed: 2, kind: 'agreement' });
    else state.court.influence = Math.min(100, state.court.influence + action.influence);
    measureHero(state, hero!, 'hero_residency_action', `${action.id}:resolved`, { before: 'queued', after: success ? 'completed' : 'refunded' });
    depth.residentActions = depth.residentActions.filter(item => item.id !== action.id);
  }
}
