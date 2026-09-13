import { PLAYER_KINGDOM_ID } from '../game/constants';
import { BATTLE_RALLY_BASE } from '../game/ascentConfig';
import { formatCourtPositionEffect, getCourtPositionLabel } from '../systems/CourtSystem';
import { seatPrimaryStat } from '../systems/ascent/CourtLaneSystem';
import { estimateDiplomacySeasons, getDiplomacyThreshold, getLandTrust } from '../systems/AcquisitionSystem';
import { rulesOf } from '../game/ascentRuleset';
import { armyPower, createBattlePreview, findLandPath } from '../systems/WarSystem';
import { hostOrderLabel } from '../systems/ascent/armyOrders';
import { hostOddsAgainst, hostOrderRefusal } from '../systems/ascent/StandingOrders';
import { buildGovernorRows } from './governorPanel';
import { heroEffect, heroName, rarityLabel, heroTypeLabel, t } from '../i18n';
import type { Army, CourtPositionId, GameState, Hero, HeroStats } from '../state/types';

/**
 * The one hero-picker's data, built "as data" so a screen only draws it — the twin of
 * `governorPanel.ts`, generalised to every posting a hero can be chosen for: a court seat, a
 * province, the command of a host, an embassy. Each row carries what the choice means for
 * *this* posting (the seat's effect at these stats, the odds this general would carry, how many
 * seasons this envoy would take), what the hero is doing now, and what taking them costs — the
 * seat or host they leave. Sorted current-first, then by fit, so the recommendation is the order.
 */

export type HeroPickerTarget =
  | { kind: 'commander'; armyId?: string }
  | { kind: 'court'; seat: CourtPositionId }
  | { kind: 'governor'; landId: string }
  | { kind: 'envoy'; landId: string };

export interface HeroPickerRow {
  hero: Hero;
  /** What this hero would do in the posting. */
  effectLine: string;
  /** Where the hero is now. */
  postingLine: string;
  /** All six stats, two lines. */
  statsLine: string;
  /** Authored flavour: what the hero is known for. */
  flavour: string;
  score: number;
  isCurrent: boolean;
  isBest: boolean;
  /** Warning shown before confirming: what posting them here leaves empty. */
  vacates?: string;
  /** Why they cannot be chosen at all right now. */
  blockedReason?: string;
}

export interface HostPickerRow {
  army: Army;
  general?: Hero;
  title: string;
  line: string;
  chance?: number;
  legs?: number;
  orderLabel: string;
  score: number;
  isBest: boolean;
  blockedReason?: string;
}

const STAT_KEY: Record<keyof HeroStats, string> = {
  martial: 'stat.martial',
  logistics: 'stat.logistics',
  administration: 'stat.administration',
  diplomacy: 'stat.diplomacy',
  loyalty: 'stat.loyalty',
  renown: 'stat.renown',
};

const UNPOSTED_BONUS = 10;

function statWord(key: keyof HeroStats): string {
  return t(STAT_KEY[key] as Parameters<typeof t>[0]);
}

/** Six stats on two lines, named — the appointment card used to show three as glyphs. */
export function heroStatsLine(hero: Hero): string {
  const s = hero.stats;
  return `${statWord('martial')} ${s.martial} · ${statWord('logistics')} ${s.logistics} · ${statWord('administration')} ${s.administration}\n`
    + `${statWord('diplomacy')} ${s.diplomacy} · ${statWord('loyalty')} ${s.loyalty} · ${statWord('renown')} ${s.renown}`;
}

/** Name, rarity and kind on one line: "Trần Hưng Đạo · Legendary · General". */
export function heroTitleLine(hero: Hero): string {
  return `${heroName(hero)}  ·  ${rarityLabel(hero.rarity)}  ·  ${heroTypeLabel(hero.type)}`;
}

/**
 * Where a hero is, in words — every form `assignedTo` can take, including a muster in progress
 * (which used to leak a raw order id onto the roster) and an envoy's destination.
 */
export function heroPostingLabel(state: GameState, hero: Hero): string {
  if (!hero.assignedTo) return t('ascent.lane.unposted');
  if (hero.assignedTo.startsWith('court:')) {
    return getCourtPositionLabel(hero.assignedTo.slice('court:'.length) as CourtPositionId);
  }
  if (hero.assignedTo.startsWith('ambassador:')) {
    const id = hero.assignedTo.slice('ambassador:'.length);
    const kingdom = state.kingdoms.find((candidate) => candidate.id === id);
    return t('ascent.screen.ambassadorTo', { kingdom: kingdom?.name ?? '' });
  }
  if (hero.assignedTo.startsWith('diplomacy-')) {
    const land = state.lands.find((candidate) => candidate.id === hero.assignedTo?.slice('diplomacy-'.length));
    return land ? t('ascent.screen.envoyTo', { land: land.name }) : t('ascent.method.diplomacy');
  }
  const muster = state.recruitmentOrders.find((order) => order.id === hero.assignedTo);
  if (muster) {
    const land = state.lands.find((candidate) => candidate.id === muster.landId);
    return t('ascent.screen.mustering', { n: muster.totalSoldiers, land: land?.name ?? '', progress: muster.progress, required: muster.required });
  }
  const land = state.lands.find((candidate) => candidate.id === hero.assignedTo);
  if (land) return t('ascent.appoint.governor', { land: land.name });
  const army = state.armies.find((candidate) => candidate.id === hero.assignedTo);
  return army ? t('ascent.screen.commands', { army: army.name }) : hero.assignedTo;
}

/** What posting this hero somewhere else would leave behind, if anything. */
function vacatesLine(state: GameState, hero: Hero, target: HeroPickerTarget): string | undefined {
  if (!hero.assignedTo) return undefined;
  if (hero.assignedTo.startsWith('court:')) {
    const seat = hero.assignedTo.slice('court:'.length) as CourtPositionId;
    if (target.kind === 'court' && target.seat === seat) return undefined;
    return t('ascent.pick.vacatesSeat', { seat: getCourtPositionLabel(seat) });
  }
  const land = state.lands.find((candidate) => candidate.id === hero.assignedTo);
  if (land) {
    if (target.kind === 'governor' && target.landId === land.id) return undefined;
    return t('ascent.pick.vacatesLand', { land: land.name });
  }
  const army = state.armies.find((candidate) => candidate.id === hero.assignedTo);
  if (army) {
    if (target.kind === 'commander' && target.armyId === army.id) return undefined;
    return t('ascent.pick.vacatesHost', { army: army.name });
  }
  return undefined;
}

/** Why a hero cannot take this posting at all. */
function blockedLine(state: GameState, hero: Hero, target: HeroPickerTarget): string | undefined {
  const at = hero.assignedTo;
  if (!at) return undefined;
  if (at.startsWith('diplomacy-')) return t('ascent.pick.blocked.envoy');
  if (at.startsWith('ambassador:')) return t('ascent.pick.blocked.ambassador');
  if (state.recruitmentOrders.some((order) => order.id === at)) return t('ascent.pick.blocked.mustering');
  // An envoy is drawn from the court or the bench, never from a host's head — the rule
  // `bestDiplomat` already keeps.
  if (target.kind === 'envoy' && state.armies.some((army) => army.id === at)) return t('ascent.pick.blocked.commands');
  return undefined;
}

function isCurrentFor(state: GameState, hero: Hero, target: HeroPickerTarget): boolean {
  switch (target.kind) {
    case 'court': return hero.assignedTo === `court:${target.seat}`;
    case 'governor': return hero.assignedTo === target.landId;
    case 'commander': return Boolean(target.armyId) && hero.assignedTo === target.armyId;
    case 'envoy': return hero.assignedTo === `diplomacy-${target.landId}`;
  }
}

function envoySeasons(state: GameState, hero: Hero, landId: string): number {
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land) return 0;
  // Beta: the same simulation the method card uses, court multiplier included, for *this* envoy.
  if (rulesOf(state).truthfulNumbers) return estimateDiplomacySeasons(state, land, hero) ?? 0;
  const trust = getLandTrust(land, PLAYER_KINGDOM_ID);
  const threshold = getDiplomacyThreshold(land);
  const gain = Math.max(0.5, 1 + hero.stats.administration * 0.03);
  return Math.max(1, Math.ceil((threshold - trust) / gain));
}

export function buildHeroPickerRows(state: GameState, target: HeroPickerTarget): HeroPickerRow[] {
  // The province picker keeps its own scoring — focus-matched, with the fit line the player
  // already knows — and this generalisation only adds the posting, blocking and vacancy lines.
  const governorRows = target.kind === 'governor'
    ? new Map(buildGovernorRows(state, state.lands.find((land) => land.id === target.landId)!).map((row) => [row.hero.id, row] as const))
    : undefined;

  const scored = state.heroes.map((hero) => {
    const blocked = blockedLine(state, hero, target);
    const unposted = !hero.assignedTo ? UNPOSTED_BONUS : 0;
    let score = 0;
    let effectLine = '';
    switch (target.kind) {
      case 'court': {
        const stat = seatPrimaryStat(target.seat);
        score = hero.stats[stat] + unposted;
        effectLine = formatCourtPositionEffect(target.seat, hero.stats);
        break;
      }
      case 'governor': {
        const row = governorRows?.get(hero.id);
        score = (row?.score ?? 0) + unposted;
        effectLine = row ? `${row.effectLine}\n${row.fitLine}` : t('ascent.pick.governorNoFit');
        break;
      }
      case 'commander': {
        score = hero.stats.martial + unposted;
        effectLine = `${t('ascent.army.mulGeneral', { pct: Math.round((hero.stats.martial / 100) * 25) })}  ·  ${
          t('ascent.pick.rally', { n: Math.round(BATTLE_RALLY_BASE + hero.stats.martial * 0.25) })}`;
        break;
      }
      case 'envoy': {
        score = hero.stats.diplomacy + hero.stats.administration + unposted;
        effectLine = t('ascent.pick.envoyFx', { ticks: envoySeasons(state, hero, target.landId) });
        break;
      }
    }
    return {
      hero,
      effectLine,
      postingLine: heroPostingLabel(state, hero),
      statsLine: heroStatsLine(hero),
      flavour: heroEffect(hero),
      score: blocked ? -1 : score,
      isCurrent: isCurrentFor(state, hero, target),
      isBest: false,
      vacates: blocked ? undefined : vacatesLine(state, hero, target),
      blockedReason: blocked,
    };
  });

  const best = scored.filter((row) => !row.blockedReason && !row.isCurrent).sort((a, b) => b.score - a.score)[0];
  if (best) best.isBest = true;
  return scored.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if (Boolean(a.blockedReason) !== Boolean(b.blockedReason)) return a.blockedReason ? 1 : -1;
    return b.score - a.score;
  });
}

/** Hosts a military method (or a follow order) could commit, with the odds each would carry. */
export function buildHostPickerRows(
  state: GameState,
  target: { kind: 'intimidation' | 'occupy' | 'siege'; landId: string } | { kind: 'follow'; forArmyId: string },
): HostPickerRow[] {
  const land = target.kind === 'follow' ? undefined : state.lands.find((candidate) => candidate.id === target.landId);
  const hosts = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy
    && (target.kind !== 'follow' || army.id !== target.forArmyId));

  const rows = hosts.map((army) => {
    const general = state.heroes.find((hero) => hero.id === army.generalHeroId);
    const men = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
    const power = Math.round(armyPower(state, army));
    const at = state.lands.find((candidate) => candidate.id === army.landId);
    let chance: number | undefined;
    let legs: number | undefined;
    // First, whether this host takes orders at all. `setArmyOrders` refuses an auxiliary and a
    // host mid-refit, and this list used to offer both as tappable rows — so the tap was spent,
    // the order was refused, and the sheet came back saying something that had not happened.
    // Asked before the target-specific reasons below, because "it is refitting" is true of this
    // host wherever it is being sent.
    let blockedReason: string | undefined = hostOrderRefusal(state, army.id);
    if (land && !blockedReason) {
      const adjacentOwned = Boolean(at && at.ownerId === PLAYER_KINGDOM_ID && at.neighbors.includes(land.id));
      if (target.kind === 'intimidation') {
        if (!adjacentOwned) blockedReason = t('ascent.pick.blocked.notBorder', { land: land.name });
        chance = 100;
        legs = 0;
      } else {
        const preview = createBattlePreview(state, army.id, land.id);
        const path = preview ? [land.id] : findLandPath(state, army.landId, land.id);
        if (!path) blockedReason = t('ascent.pick.blocked.noRoad', { land: land.name });
        legs = path?.length;
        chance = hostOddsAgainst(state, army, land.id);
      }
    }
    return {
      army,
      general,
      title: `${army.name}  ·  ${men}`,
      line: t('ascent.pick.hostRow', {
        power,
        general: general ? heroName(general) : t('ascent.screen.noGeneral'),
        land: at?.name ?? '—',
        legs: legs ?? 0,
      }),
      chance,
      legs,
      orderLabel: hostOrderLabel(state, army),
      score: blockedReason ? -1 : (chance ?? power) * 1000 - (legs ?? 0),
      isBest: false,
      blockedReason,
    };
  });
  const best = rows.filter((row) => !row.blockedReason).sort((a, b) => b.score - a.score)[0];
  if (best) best.isBest = true;
  return rows.sort((a, b) => b.score - a.score);
}
