import { getProject, REALM_PROJECTS, type ProjectUnlock, type RealmProject } from '../../data/edicts';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { GameState, ResourceKey } from '../../state/types';
import { addCourtModifier, removeCourtModifier } from '../CourtSystem';
import { applyEstateDeltas, applyRepealRelief, repealTerms } from '../DecreeSystem';
import { schoolBlockedReason } from '../decree/SchoolSystem';
import { applyResourceDelta, canSpend, refreshAllLandOutputs } from '../ResourceSystem';
import { scaledCost } from '../ascent/priceScale';
import { eraIndex, grantEdictPoints } from './MandateSystem';
import { pushToast } from './notifications';
import { resourceLabel, resourceToken, t } from '../../i18n';

function pct(v: number): string {
  return `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
}

/**
 * A concrete, human-readable summary of exactly what a project's permanent modifier does
 * (e.g. "+30% market gold · −20% building cost"), so enacting an edict shows its payoff in
 * hard numbers rather than a vague blurb — the point of "chiếu chỉ" becomes legible.
 */
export function projectEffectSummary(project: RealmProject): string {
  const m = project.modifier;
  const parts: string[] = [];
  if (m.resourceRateModifier) {
    for (const [k, v] of Object.entries(m.resourceRateModifier)) {
      if (!v) continue;
      parts.push(t('edict.fx.rate', { value: `${resourceToken(k as ResourceKey)}${v > 0 ? '+' : ''}${v}`, res: resourceLabel(k as ResourceKey) }));
    }
  }
  if (m.marketGoldOutputModifier) parts.push(t('edict.fx.marketGold', { pct: pct(m.marketGoldOutputModifier) }));
  if (m.recruitSpeedModifier) parts.push(t('edict.fx.recruitSpeed', { pct: pct(m.recruitSpeedModifier) }));
  if (m.armyXpModifier) parts.push(t('edict.fx.armyXp', { pct: pct(m.armyXpModifier) }));
  if (m.buildingCostModifier) parts.push(t('edict.fx.buildCost', { pct: pct(m.buildingCostModifier) }));
  if (m.buildSpeedBonus) parts.push(t('edict.fx.buildSpeed', { n: m.buildSpeedBonus }));
  if (m.upgradeSpeedBonus) parts.push(t('edict.fx.upgradeSpeed', { n: m.upgradeSpeedBonus }));
  if (m.acquisitionCostModifier) parts.push(t('edict.fx.acqCost', { pct: pct(m.acquisitionCostModifier) }));
  if (m.armyGoldUpkeepModifier) parts.push(t('edict.fx.armyUpkeep', { pct: pct(m.armyGoldUpkeepModifier) }));
  if (m.recruitmentSupplyCostModifier) parts.push(t('edict.fx.recruitSupply', { pct: pct(m.recruitmentSupplyCostModifier) }));
  if (m.courtCardSpeedModifier) parts.push(t('edict.fx.courtCard', { pct: pct(m.courtCardSpeedModifier) }));
  if (m.armyLevelCapBonus) parts.push(t('edict.fx.levelCap', { n: m.armyLevelCapBonus }));
  return parts.join('  ·  ');
}

export function projectTitle(project: RealmProject): string {
  return t(`empire.edict.${project.id}` as Parameters<typeof t>[0]);
}

export function projectDescription(project: RealmProject): string {
  return t(`empire.edict.${project.id}.d` as Parameters<typeof t>[0]);
}

export function isProjectEnacted(state: GameState, id: string): boolean {
  return Boolean(state.mandate?.edicts.includes(id));
}

/** True once the run has produced what this unlock asks for. Non-ascent saves never satisfy one. */
export function isUnlockMet(state: GameState, unlock: ProjectUnlock): boolean {
  const ascent = state.ascent;
  if (!ascent) return false;
  switch (unlock.kind) {
    case 'level': return ascent.level >= unlock.level;
    case 'lands': return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length >= unlock.count;
    case 'waves': return ascent.wavesSurvived >= unlock.count;
    case 'chronicle': return (state.storiesEnded?.length ?? 0) >= unlock.count;
    case 'seat': {
      const wanted: Array<GameState['heroes'][number]['rarity']> = unlock.rarity === 'Epic' ? ['Epic', 'Legendary'] : ['Legendary'];
      return state.heroes.some((hero) => hero.assignedTo?.startsWith('court:') && wanted.includes(hero.rarity));
    }
    // Serving anywhere, not only at court: Trần Hưng Đạo wrote the Hịch tướng sĩ as a field
    // commander, not as a minister. Having drawn them is the gate; where they are posted is the
    // player's business.
    case 'hero':
      return state.heroes.some((hero) => hero.id === unlock.heroId);
  }
}

/** The unmet unlock as a sentence — what play still has to produce before this project exists. */
function unlockBlockedReason(state: GameState, unlock: ProjectUnlock): string | undefined {
  if (isUnlockMet(state, unlock)) return undefined;
  switch (unlock.kind) {
    case 'level': return t('empire.edict.blocked.level', { n: unlock.level });
    case 'lands': return t('empire.edict.blocked.lands', { n: unlock.count });
    case 'waves': return t('empire.edict.blocked.waves', { n: unlock.count });
    case 'chronicle': return t('empire.edict.blocked.chronicle', { n: unlock.count });
    case 'seat': return t('empire.edict.blocked.seat', { rarity: t(`rarity.${unlock.rarity}` as Parameters<typeof t>[0]) });
    case 'hero': return t('empire.edict.blocked.hero', { hero: t(`heroes.${unlock.heroId}.name` as Parameters<typeof t>[0]) });
  }
}

/** Reason a project can't be enacted right now, or undefined if it can. */
export function projectBlockedReason(state: GameState, project: RealmProject): string | undefined {
  const mandate = state.mandate;
  if (!mandate) return t('empire.edict.blocked.mode');
  if (mandate.edicts.includes(project.id)) return t('empire.edict.blocked.done');
  if (project.unlock) {
    const reason = unlockBlockedReason(state, project.unlock);
    if (reason) return reason;
  }
  // A mutually-exclusive sibling was already chosen — this path is locked for the run.
  if (project.exclusiveGroup && mandate.edicts.some((id) => {
    const other = getProject(id);
    return other && other.id !== project.id && other.exclusiveGroup === project.exclusiveGroup;
  })) {
    return t('empire.edict.blocked.exclusive');
  }
  // A school this reign has committed *against* is shut for good. Layered on top of the existing
  // exclusive-group mechanism rather than replacing it: a group is a fork between two laws, a
  // school is a fork between two ways of governing.
  const schoolReason = schoolBlockedReason(state, project.id);
  if (schoolReason) return schoolReason;

  // A law the Chronicle taught the throne arrives out of order — that is the entire point of
  // `grantDecree`. The era gate is what it bypasses; the cost is not.
  const taught = mandate.taughtDecrees?.includes(project.id) ?? false;
  if (!taught && eraIndex(mandate.era) < eraIndex(project.era)) {
    return t('empire.edict.blocked.era', { era: t(`empire.era.${project.era}` as Parameters<typeof t>[0]) });
  }
  if (project.kind === 'edict') {
    if ((mandate.edictPoints ?? 0) < (project.edictCost ?? 0)) return t('empire.edict.blocked.points');
  } else if (project.resourceCost && !canSpend(state, scaledCost(state, project.resourceCost))) {
    return t('empire.edict.blocked.cost');
  }
  return undefined;
}

/** Enacts an edict (spends edict-points) or funds a Wonder (spends resources). */
export function enactProject(state: GameState, id: string): boolean {
  const project = getProject(id);
  const mandate = state.mandate;
  if (!project || !mandate) return false;
  if (projectBlockedReason(state, project)) return false;

  if (project.kind === 'edict') {
    mandate.edictPoints -= project.edictCost ?? 0;
  } else if (project.resourceCost) {
    // The scaled purse (Dragon Ascent; the base cost elsewhere): a wonder is the one prestige
    // purchase in the mode, and at a flat few hundred it was a rounding error by the first era.
    applyResourceDelta(state, Object.fromEntries(Object.entries(scaledCost(state, project.resourceCost)).map(([k, v]) => [k, -(v ?? 0)])));
    state.wondersBuilt = (state.wondersBuilt ?? 0) + 1;
  }

  // Raising a Wonder is a feat of authority — it returns an edict point to spend.
  if (project.kind === 'wonder') {
    grantEdictPoints(state, 1);
  }

  mandate.edicts.push(project.id);
  // Who this pleases and who it angers. Applied here rather than in the UI so an edict enacted by
  // a story, a capstone or a harness carries its constituency exactly as one enacted by hand does.
  applyEstateDeltas(state, project.estates);
  addCourtModifier(state, {
    id: `project-${project.id}`,
    label: projectTitle(project),
    ...project.modifier,
  });
  refreshAllLandOutputs(state);

  const effects = projectEffectSummary(project);
  const baseToast = project.kind === 'wonder'
    ? t('empire.edict.wonderBuilt', { title: projectTitle(project) })
    : t('empire.edict.enacted', { title: projectTitle(project) });
  pushToast(state, effects ? `${baseToast} — ${effects}` : baseToast, 'milestone');
  return true;
}

/**
 * Repeal — phế chiếu.
 *
 * Costs twice what the law cost to pass, and returns none of it. That asymmetry is deliberate:
 * without it, enact→repeal cycling would be a way to farm estate standing for free, and the
 * weight system would be a ratchet a patient player could unwind at no price.
 *
 * What you buy is room. The weight comes back at once and the countryside relaxes by 20, so a bad
 * early pick stops being a bad whole run — the single largest quality-of-life hole in the old
 * system, where an enacted edict could never be undone by anything.
 */
export function repealProject(state: GameState, id: string): boolean {
  const mandate = state.mandate;
  const project = getProject(id);
  if (!mandate || !project) return false;
  if (!mandate.edicts.includes(id)) return false;

  const terms = repealTerms(state, id);
  if (!terms || !terms.affordable) return false;

  mandate.edictPoints -= terms.cost;
  mandate.edicts = mandate.edicts.filter((standing) => standing !== id);
  if (mandate.decreeResentment) delete mandate.decreeResentment[id];

  // Undo the constituency: whoever this law pleased is now the party losing something.
  applyEstateDeltas(state, project.estates, -1);
  // Deterministic id, minted by `enactProject` above — the reason repeal can find the exact
  // bonus this decree added while a court card's `Date.now()` id could never be addressed.
  removeCourtModifier(state, `project-${project.id}`);
  applyRepealRelief(state);
  refreshAllLandOutputs(state);

  pushToast(state, t('decree.repeal.done', { title: projectTitle(project) }), 'milestone');
  return true;
}

/**
 * The projects this save can ever see. Play-unlocked edicts exist only in Dragon Ascent —
 * empire mode has no waves, levels or chronicle, so listing them there would be a column of
 * rows whose requirement can never come true.
 */
export function allProjects(state?: GameState): RealmProject[] {
  // Only the two instruments the throne issues at will. Sắc, dụ, hịch and lệ are all raised *by*
  // something — a champion seated, a famine running, a Great Invasion telegraphed, a village
  // asking — and listing them on a browsable menu would advertise rows whose trigger the player
  // cannot reach from here. They enact through their own prompts, which call `enactProject`
  // directly, so this filter never blocks them.
  const issuable = REALM_PROJECTS.filter((project) => isStandingLaw(project));
  if (state && !state.ascent) return issuable.filter((project) => !project.unlock);
  return issuable;
}

/** True for the instruments the throne may reach for unprompted: chiếu and wonders. */
export function isStandingLaw(project: RealmProject): boolean {
  return project.kind === 'edict' || project.kind === 'wonder';
}
