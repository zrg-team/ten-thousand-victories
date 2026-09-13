import type { ConquestUIScene } from '../../ConquestUIScene';
import { heroBio, heroName, rarityLabel, t, type TranslationKey } from '../../../i18n';
import { availableHeroPerks, HERO_PERKS, heroCapability, heroLevel, heroActive } from '../../../systems/heroes/heroModel';
import { chooseHeroPerk, heroSummary, respecializeHero, previewHeroTransfer, transferHero, protectHero, holdHero,
  quoteHeroRelease, releaseHeroFromQuote, treatHero, recallResident, residentEntryReason, postResident, residentActionQuote, startResidentAction,
  useHeroPolicy, rerouteHeroHome, heroRiskForecast, heroCommissionReason } from '../../../systems/heroes/HeroService';
import { heroDepartureImpact, heroAssignmentPreview, heroImpactParams } from '../../../systems/heroes/heroPreview';
import { heroProvinceModifierBreakdown } from '../../../systems/heroes/heroContributions';
import { ALL_COURT_POSITIONS, getCourtPositionLabel } from '../../../systems/CourtSystem';
import { PLAYER_KINGDOM_ID } from '../../../game/constants';
import { scaledCost } from '../../../systems/ascent/priceScale';
import { autosaveSnapshot } from '../../../state/save';
import type { HeroAssignment, HeroCommandResult } from '../../../systems/heroes/types';
import { heroProgressLine, heroPortraitCard, heroXpTrack } from '../../../ui/HeroProgress';
import { heroPostingLabel, heroStatsLine } from '../../../ui/heroPickerRows';
import { refreshAllLandOutputs } from '../../../systems/ResourceSystem';
import { INK_UI } from '../../../ui/InkUI';
import { showHeroesScreen } from './court';
import { archiveHeroChronicle, readHeroChronicle } from '../../../state/heroChronicle';

export function showHeroDepth(self: ConquestUIScene, heroId: string, feedback?: string): void {
  const state = self.state, hero = state.heroes.find(candidate => candidate.id === heroId);
  if (!hero?.growth) return;
  const update = (result: HeroCommandResult): void => {
    if (!result.ok) state.message = reasonText(result.reason);
    refreshAllLandOutputs(state);
    const saved = autosaveSnapshot(state);
    if (!saved) state.message = t('hero.depth.savedFailed');
    self.replaceLanePage(() => showHeroDepth(self, heroId, !result.ok ? reasonText(result.reason) : !saved ? t('hero.depth.savedFailed') : undefined));
  };
  const view = heroSummary(state, hero);
  const { addRow, addWidget, addHeading, addNote, finish } = self.laneList(heroName(hero),
    `${rarityLabel(hero.rarity)} · ${heroPostingLabel(state, hero)}`);
  addWidget(144, (holder, width) => {
    holder.add(heroPortraitCard(self, hero, { x: 4, y: 0, width: 68, height: 95 }));
    holder.add(self.ui.panel({ x: 84, y: 0, width: width - 88, height: 95 }, { border: INK_UI.softBrush }));
    holder.add(self.ui.label(92, 7, heroProgressLine(state, hero), 'body', { fontSize: '13px', wordWrap: { width: width - 100 } }));
    holder.add(self.ui.label(92, 45, t('hero.depth.service', { service: view.allowance.service, deed: view.allowance.deed }),
      'caption', { fontSize: '10px', wordWrap: { width: width - 100 } }));
    holder.add(heroXpTrack(self, state, hero, 92, 83, width - 100));
    holder.add(self.ui.label(4, 110, t('hero.depth.reign'), 'caption', { fontSize: '10px', wordWrap: { width: width - 8 } }));
  });
  if (feedback) addNote(feedback);
  addNote(heroStatsLine(hero));
  for (const stat of ['martial', 'logistics', 'administration', 'diplomacy'] as const) if (hero.growth.training[stat]) addNote(t('hero.depth.statCap', {
    stat: t(`stat.${stat}` as TranslationKey), base: hero.stats[stat], earned: hero.growth.training[stat],
    raw: hero.stats[stat] + hero.growth.training[stat], applied: view.stats[stat],
  }));
  if (heroActive(hero) && hero.assignedTo) addNote(t('hero.depth.departure', heroDepartureImpact(state, hero)));
  const governed = state.lands.find(land => land.id === hero.assignedTo);
  if (governed) {
    const modifiers = heroProvinceModifierBreakdown(state, governed);
    for (const stat of ['food', 'supplies'] as const) addNote(t('hero.depth.modifier', {
      stat: t(`resource.${stat}` as TranslationKey), raw: Math.round(modifiers.raw[stat] * 100), applied: Math.round(modifiers.applied[stat] * 100),
    }));
  }
  if (view.next !== null && view.nextStat) addNote(t('hero.depth.next', { stat: t(`stat.${view.nextStat}` as TranslationKey) }));
  addRow({ title: t('hero.depth.manage'), subtitle: t('hero.depth.manageBody'), border: INK_UI.jade }, () => {
    if (heroCapability(state, 'travel')) { self.replaceLanePage(() => showHeroTransfers(self, heroId)); return; }
    self.closeLane(); self.events.emit('ui:ascent-appoint', hero.id);
  });
  const choices = availableHeroPerks(state, hero);
  if (choices.length) {
    addHeading(t('hero.depth.specialize'), t('hero.depth.later'));
    for (const id of choices) {
      const perk = HERO_PERKS.find(candidate => candidate.id === id)!;
      addRow({ title: `${t(`hero.depth.${perk.discipline}`)} · ${t(`hero.perk.${id}`)}`,
        subtitle: t(`hero.perk.${id}.body`), border: INK_UI.gold }, () => {
        update(chooseHeroPerk(state, heroId, id));
      });
    }
  }
  for (const id of view.perks) addNote(`${t(`hero.perk.${id}`)} — ${t(`hero.perk.${id}.body`)}`);
  if (view.perks.length && !hero.growth.respecUsed && hero.life?.kind === 'active' && hero.life.assignment.kind === 'home') {
    addRow({ title: t('hero.depth.respec'), subtitle: t('hero.depth.respecBody'), border: INK_UI.brush }, () => {
      update(respecializeHero(state, heroId));
    });
  }
  const depth = state.ascent!.heroDepth!;
  if (hero.life?.kind === 'transit' && (!hero.life.protected || hero.life.intendedPost.kind === 'embassy')) addRow({ title: t('hero.depth.reroute'), subtitle: heroPostingLabel(state, hero), border: INK_UI.jade }, () => update(hero.life?.kind === 'transit' && hero.life.intendedPost.kind === 'embassy' ? recallResident(state, heroId) : rerouteHeroHome(state, heroId)));
  for (const exposure of Object.values(depth.exposures).filter(item => item.heroId === heroId && !item.resolved)) {
    const displayedRevision = exposure.revision;
    addHeading(state.lands.find(land => land.id === exposure.landId)?.name ?? '', t('hero.depth.warningBody'));
    addNote(t(exposure.trapped ? 'hero.depth.trapped' : 'hero.depth.openRoute'));
    const forecast = heroRiskForecast(state, hero, exposure.landId);
    addNote(forecast.lossIn === undefined ? t('hero.depth.unknownEstimate') : forecast.source === 'capture' ? t('hero.depth.captureCountdown', { n: forecast.lossIn }) : forecast.source === 'field'
      ? t('hero.depth.fieldEstimate', { n: forecast.lossIn }) : t('hero.depth.lossEstimate', { n: forecast.lossIn, risk: forecast.lossPct ?? 100 }));
    const route = forecast.arrivalTurn === undefined ? t('hero.depth.trapped') : t('hero.depth.route', {
      route: [exposure.landId, ...forecast.route].filter((id, i, ids) => i === 0 || id !== ids[i - 1])
        .map(id => state.lands.find(land => land.id === id)?.name ?? id).join(' → '), n: Math.max(0, forecast.arrivalTurn - state.turn),
    });
    addRow({ title: t('hero.depth.protect'), subtitle: route, border: INK_UI.jade }, () => update(protectHero(state, exposure.id)));
    addRow({ title: t('hero.depth.hold'), subtitle: t(heroCapability(state, 'lethal') ? 'hero.depth.holdProtected' : 'hero.depth.holdBody'), border: INK_UI.cinnabar }, () => {
      update(holdHero(state, exposure.id, displayedRevision));
    });
    if (heroCapability(state, 'lethal') && exposure.trapped) addRow({ title: t('hero.depth.lethalTitle'), subtitle: t('hero.depth.lethalBody'), border: INK_UI.cinnabar },
      () => self.replaceLanePage(() => showLastStandConsent(self, heroId, exposure.id, displayedRevision)));
    if (depth.policies.includes('hero-frontier-commission')) {
      const reason = heroCommissionReason(state, heroId, exposure.landId);
      addRow({ title: t('ascent.card.hero-frontier-commission'), subtitle: reason ? reasonText(reason) : t('ascent.card.hero-frontier-commission.d'),
        border: INK_UI.gold }, reason ? undefined : () => update(useHeroPolicy(state, 'hero-frontier-commission', heroId, exposure.landId)));
    }
  }
  if (hero.life?.kind === 'captive') {
    const ransom = quoteHeroRelease(state, heroId, 'gold')!, concession = quoteHeroRelease(state, heroId, 'concession')!;
    addRow({ title: t('hero.depth.ransom', { n: ransom.cost }), subtitle: t('hero.depth.releaseBody'), border: INK_UI.gold }, () => update(releaseHeroFromQuote(state, ransom)));
    addRow({ title: t('hero.depth.concession'), subtitle: t('hero.depth.releaseBody'), border: INK_UI.jade }, () => update(releaseHeroFromQuote(state, concession)));
  }
  if (hero.life?.kind === 'recovering' && !hero.life.respec && !hero.life.treatmentUsed) {
    const cost = scaledCost(state, { supplies: 10 }).supplies!;
    addRow({ title: t('hero.depth.treat', { n: cost }), subtitle: t('hero.depth.treatBody'), border: INK_UI.jade }, () => update(treatHero(state, heroId, cost)));
  }
  if (hero.life?.kind === 'active' && hero.life.assignment.kind === 'embassy') {
    addRow({ title: t('hero.depth.recall'), subtitle: t('hero.depth.releaseBody'), border: INK_UI.brush }, () => update(recallResident(state, heroId)));
    addRow({ title: t('hero.depth.residents'), subtitle: t('hero.depth.entry'), border: INK_UI.jade }, () => self.replaceLanePage(() => showResidentActions(self, heroId)));
  } else if (heroCapability(state, 'residency') && hero.life?.kind === 'active' && hero.life.assignment.kind === 'home') {
    addRow({ title: t('hero.depth.residents'), subtitle: t('hero.depth.entry'), border: INK_UI.jade }, () => self.replaceLanePage(() => showResidentPosting(self, heroId)));
  }
  if (depth.policies.includes('hero-apprenticeship') && heroLevel(hero) >= 3) for (const student of state.heroes.filter(person => person.growth && heroLevel(person) < heroLevel(hero) && heroActive(person))) {
    addRow({ title: t('ascent.card.hero-apprenticeship'), subtitle: t('hero.depth.target', { target: heroName(student) }), border: INK_UI.gold }, () => update(useHeroPolicy(state, 'hero-apprenticeship', heroId, student.id)));
  }
  if (depth.notices.some(notice => notice.heroId === heroId)) addRow({ title: t('hero.depth.acknowledge'), subtitle: '', border: INK_UI.brush }, () => {
    depth.notices = depth.notices.filter(notice => notice.heroId !== heroId); update({ ok: true });
  });
  addHeading(t('hero.depth.deeds'));
  if (!view.deeds.length) addNote(t('hero.depth.noDeeds'));
  for (const deed of [...view.deeds].reverse()) {
    const target = state.lands.find(land => land.id === deed.target)?.name ?? state.kingdoms.find(kingdom => kingdom.id === deed.target)?.name ?? deed.target ?? '';
    addNote(t(`hero.depth.deed.${deed.kind}`, { wave: deed.wave, n: deed.amount ?? 0, target }));
  }
  addNote(heroBio(hero));
  addRow({ title: t('hero.depth.back'), subtitle: '', border: INK_UI.brush }, () => self.replaceLanePage(() => showHeroesScreen(self)));
  finish();
}

function reasonText(reason?: string): string { return t(`hero.depth.reason.${reason ?? 'unavailable'}` as TranslationKey); }
function showLastStandConsent(self: ConquestUIScene, heroId: string, exposureId: string, revision: number): void {
  if (!heroCapability(self.state, 'lethal')) return;
  const { addRow, finish } = self.laneList(t('hero.depth.lethalTitle'), t('hero.depth.lethalBody'));
  addRow({ title: t('hero.depth.protect'), subtitle: t('hero.depth.warningBody'), border: INK_UI.jade }, () => {
    protectHero(self.state, exposureId); refreshAllLandOutputs(self.state); autosaveSnapshot(self.state);
    self.replaceLanePage(() => showHeroDepth(self, heroId));
  });
  addRow({ title: t('hero.depth.lethalAccept'), subtitle: t('hero.depth.lethalBody'), border: INK_UI.cinnabar }, () => {
    const result = holdHero(self.state, exposureId, revision, true); autosaveSnapshot(self.state);
    self.replaceLanePage(() => showHeroDepth(self, heroId, result.ok ? undefined : reasonText(result.reason)));
  });
  finish();
}
export function showHeroTransfers(self: ConquestUIScene, heroId: string): void {
  const state = self.state, hero = state.heroes.find(person => person.id === heroId);
  if (!hero?.growth) return;
  const { addRow, addNote, finish } = self.laneList(t('hero.depth.manage'), heroName(hero));
  addNote(t('hero.depth.departure', heroDepartureImpact(state, hero)));
  const posts: Array<{ title: string; assignment: HeroAssignment }> = [{ title: t('hero.depth.home'), assignment: { kind: 'home' } },
    ...ALL_COURT_POSITIONS.filter(seat => state.court.unlockedSeats.includes(seat)).map(seat => ({ title: getCourtPositionLabel(seat), assignment: { kind: 'court', seat } as HeroAssignment })),
    ...state.lands.filter(land => land.ownerId === PLAYER_KINGDOM_ID).map(land => ({ title: land.name, assignment: { kind: 'province', landId: land.id } as HeroAssignment })),
    ...state.armies.filter(army => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron).map(army => ({ title: army.name, assignment: { kind: 'host', armyId: army.id } as HeroAssignment }))];
  for (const post of posts) {
    const quote = previewHeroTransfer(state, heroId, post.assignment);
    const depart = (safe: boolean) => self.replaceLanePage(() => {
      const fresh = safe ? previewHeroTransfer(state, heroId, post.assignment, true) : quote;
      const preview = heroAssignmentPreview(state, hero, post.assignment);
      const sheet = self.laneList(post.title, heroName(hero));
      sheet.addNote(t('hero.depth.route', { route: [fresh.from, ...fresh.path].filter(Boolean)
        .map(id => state.lands.find(land => land.id === id)?.name ?? id).join(' → '), n: fresh.turns }));
      sheet.addNote(t('hero.depth.travelQuote', { n: fresh.turns, cost: fresh.supplies }));
      sheet.addNote(preview.stat ? t('hero.depth.destinationTraining', { stat: t(`stat.${preview.stat}` as TranslationKey) }) : t('hero.depth.noTraining'));
      sheet.addNote(t('hero.depth.departure', heroDepartureImpact(state, hero)));
      sheet.addNote(t('hero.depth.assignmentDelta', heroImpactParams(preview)));
      sheet.addRow({ title: t('hero.depth.confirm'), subtitle: '', border: INK_UI.jade }, () => {
        const result = transferHero(state, fresh);
        refreshAllLandOutputs(state); const saved = autosaveSnapshot(state);
        self.replaceLanePage(() => showHeroDepth(self, heroId, !result.ok ? reasonText(result.reason) : !saved ? t('hero.depth.savedFailed') : undefined));
      });
      sheet.addRow({ title: t('hero.depth.back'), subtitle: '', border: INK_UI.brush }, () => self.replaceLanePage(() => showHeroTransfers(self, heroId)));
      sheet.finish();
    });
    addRow({ title: t('hero.depth.transfer', { target: post.title }), subtitle: quote.ok
      ? t('hero.depth.travelQuote', { n: quote.turns, cost: quote.supplies }) : reasonText(quote.reason), border: quote.ok ? INK_UI.jade : INK_UI.softBrush }, quote.ok ? () => depart(false) : undefined);
    if (quote.ok && quote.turns > 1 && state.ascent!.heroDepth!.policies.includes('hero-safe-passage')) {
      const passage = previewHeroTransfer(state, heroId, post.assignment, true);
      addRow({ title: `${t('ascent.card.hero-safe-passage')} · ${post.title}`, subtitle: passage.ok ? t('hero.depth.travelQuote', { n: passage.turns, cost: passage.supplies }) : reasonText(passage.reason), border: INK_UI.gold }, passage.ok ? () => depart(true) : undefined);
    }
    if (quote.ok && post.assignment.kind === 'province' && hero.assignedTo?.startsWith('court:') && state.ascent!.heroDepth!.policies.includes('hero-acting-council')) {
      const landId = post.assignment.landId;
      addRow({ title: `${t('ascent.card.hero-acting-council')} · ${post.title}`, subtitle: t('ascent.card.hero-acting-council.d'), border: INK_UI.gold }, () => {
        useHeroPolicy(state, 'hero-acting-council', heroId, landId); refreshAllLandOutputs(state); autosaveSnapshot(state); self.replaceLanePage(() => showHeroDepth(self, heroId));
      });
    }
  }
  finish();
}
export function showResidentPosting(self: ConquestUIScene, heroId?: string, kingdomId?: string): void {
  const state = self.state;
  const { addRow, finish } = self.laneList(t('hero.depth.residents'), t('hero.depth.entry'));
  for (const hero of state.heroes.filter(person => person.growth && (!heroId || person.id === heroId))) {
    for (const kingdom of state.kingdoms.filter(crown => crown.id !== PLAYER_KINGDOM_ID && !crown.isDefeated && (!kingdomId || crown.id === kingdomId))) {
      const reason = residentEntryReason(state, hero, kingdom.id);
      addRow({ title: t('hero.depth.sendEnvoy', { hero: heroName(hero), kingdom: kingdom.name }), subtitle: reason ? reasonText(reason) : t('hero.depth.entry'), portrait: hero, border: reason ? INK_UI.softBrush : INK_UI.jade }, reason ? undefined : () => {
        postResident(state, hero.id, kingdom.id); refreshAllLandOutputs(state); autosaveSnapshot(state); self.replaceLanePage(() => showHeroDepth(self, hero.id));
      });
    }
  }
  finish();
}
export function showResidentActions(self: ConquestUIScene, heroId: string): void {
  const state = self.state, depth = state.ascent!.heroDepth!;
  const { addRow, addNote, finish } = self.laneList(t('hero.depth.residents'), heroName(state.heroes.find(hero => hero.id === heroId)!));
  const targets = [
    ...state.lands.filter(land => land.ownerId === PLAYER_KINGDOM_ID && land.outputs.supplies > 0).map(land => ({ kind: 'supplies' as const, id: land.id, title: land.name })),
    { kind: 'intelligence' as const, id: undefined, title: '—' },
    ...state.heroes.filter(hero => hero.life?.kind === 'captive').map(hero => ({ kind: 'release' as const, id: hero.id, title: heroName(hero) }))];
  for (const target of targets) {
    const quote = residentActionQuote(state, heroId, target.kind, target.id);
    addRow({ title: t(`hero.depth.${target.kind}`), subtitle: quote.ok ? t('hero.depth.residentQuote', { n: quote.influence, seasons: quote.seasons, target: target.title }) : reasonText(quote.reason), border: quote.ok ? INK_UI.jade : INK_UI.softBrush }, quote.ok ? () => {
      startResidentAction(state, quote); autosaveSnapshot(state); self.replaceLanePage(() => showResidentActions(self, heroId));
    } : undefined);
  }
  for (const action of depth.residentActions.filter(item => item.heroId === heroId)) addNote(t('hero.depth.busy', { action: t(`hero.depth.${action.kind}`), n: Math.max(0, action.dueTurn - state.turn) }));
  for (const report of depth.intel.slice(-3)) addNote(report.mix ? t('hero.depth.intelMix', { n: report.wave,
    kingdom: state.kingdoms.find(crown => crown.id === report.kingdomId)?.name ?? '', spears: Math.round(report.mix.spearmen * 100),
    bows: Math.round(report.mix.archers * 100), heavy: Math.round(report.mix.heavy * 100) })
    : t('hero.depth.intelReport', { n: report.wave, kingdom: state.kingdoms.find(crown => crown.id === report.kingdomId)?.name ?? '', composition: report.composition }));
  finish();
}

export function showHeroChronicle(self: ConquestUIScene): void {
  const depth = self.state.ascent?.heroDepth;
  const { addHeading, addNote, addRow, finish } = self.laneList(t('hero.depth.chronicle'), t('hero.depth.cosmetic'));
  if (depth?.chroniclePending) addRow({ title: t('hero.depth.archiveRetry'), subtitle: t('hero.depth.archiveFailed'), border: INK_UI.cinnabar }, () => {
    archiveHeroChronicle(self.state); self.replaceLanePage(() => showHeroChronicle(self));
  });
  const entries = new Map(readHeroChronicle().map(entry => [entry.id, entry]));
  for (const entry of depth?.memorials ?? []) entries.set(entry.id, entry);
  if (!entries.size) addNote(t('hero.depth.noDeeds'));
  for (const entry of [...entries.values()].reverse()) {
    addHeading(`${entry.name} · ${t('hero.depth.level', { n: entry.highestLevel })}`, t(`hero.depth.fate.${entry.fate}`));
    if (entry.formerAssignment) {
      const post = entry.formerAssignment;
      const posting = post.kind === 'court' ? getCourtPositionLabel(post.seat) : entry.formerPlaceName
        ?? (post.kind === 'home' ? t('hero.depth.home') : post.kind === 'embassy' ? t('hero.depth.residents') : t('hero.depth.manage'));
      addNote(t('hero.depth.formerPosting', { posting }));
    }
    if (entry.acceptedRisk) addNote(t('hero.depth.riskRecord', { encounter: entry.encounterId ?? '—', revision: entry.acceptedRisk.revision,
      consent: t(entry.acceptedRisk.consentRevision === entry.acceptedRisk.revision ? 'hero.depth.consentRecorded' : 'hero.depth.consentAbsent') }));
    for (const deed of [...entry.deeds].reverse().slice(0, 5)) addNote(t(`hero.depth.deed.${deed.kind}`, {
      wave: deed.wave, n: deed.amount ?? 0, target: self.state.lands.find(land => land.id === deed.target)?.name ?? deed.target ?? '',
    }));
  }
  finish();
}

export function showHeroAftermath(self: ConquestUIScene): void {
  const depth = self.state.ascent?.heroDepth;
  const { addRow, addNote, finish } = self.laneList(t('hero.depth.aftermath'), t('hero.depth.aftermathBody'));
  const grouped = new Map<string, NonNullable<typeof depth>['notices']>();
  for (const notice of depth?.notices ?? []) grouped.set(notice.heroId, [...(grouped.get(notice.heroId) ?? []), notice]);
  if (!grouped.size) addNote(t('hero.depth.noDeeds'));
  for (const [id, notices] of grouped) {
    const hero = self.state.heroes.find(person => person.id === id); if (!hero) continue;
    const levels = notices.filter(notice => notice.kind === 'level').map(notice => notice.level ?? 1);
    addRow({ title: heroName(hero), subtitle: [levels.length ? t('hero.depth.level', { n: Math.max(...levels) }) : '',
      heroPostingLabel(self.state, hero), heroProgressLine(self.state, hero)].filter(Boolean).join('\n'),
      portrait: hero, border: INK_UI.gold }, () => self.replaceLanePage(() => showHeroDepth(self, id)));
  }
  finish();
}
