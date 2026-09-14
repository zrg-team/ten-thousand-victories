import type { ConquestUIScene } from '../../ConquestUIScene';
import { heroBio, heroName, heroTypeLabel, rarityLabel, t, type TranslationKey } from '../../../i18n';
import { availableHeroPerks, effectiveHeroStats, HERO_PERKS, heroCapability, heroLevel, heroActive } from '../../../systems/heroes/heroModel';
import { chooseHeroPerk, heroFreeReason, heroSummary, respecializeHero, previewHeroTransfer, transferHero, protectHero, holdHero,
  quoteHeroRelease, releaseHeroFromQuote, treatHero, recallResident, residentQuote, postResident, residentActionQuote, startResidentAction,
  useHeroPolicy, rerouteHeroHome, heroRiskForecast, heroCommissionReason } from '../../../systems/heroes/HeroService';
import { heroAssignmentPreview, heroImpactParams } from '../../../systems/heroes/heroPreview';
import { heroProvinceModifierBreakdown } from '../../../systems/heroes/heroContributions';
import { PLAYER_KINGDOM_ID } from '../../../game/constants';
import { getCourtPositionLabel } from '../../../systems/CourtSystem';
import { scaledCost } from '../../../systems/ascent/priceScale';
import { autosaveSnapshot } from '../../../state/save';
import type { HeroAssignment, HeroCommandResult } from '../../../systems/heroes/types';
import type { Hero } from '../../../state/types';
import { heroProgressLine, heroPortraitCard, heroXpTrack } from '../../../ui/HeroProgress';
import { heroPostingLabel, heroTitleLine } from '../../../ui/heroPickerRows';
import { refreshAllLandOutputs } from '../../../systems/ResourceSystem';
import { INK_UI } from '../../../ui/InkUI';
import { resourceChip, statChip } from '../../../ui/statChips';
import { drawCostChips, type CostChip } from '../../../ui/costChips';
import { heroStatus, heroStatusTone } from '../../../ui/heroStatus';
import { heroReasonText } from '../../../ui/heroReasons';
import { postValue, rankPostsForHero, recommendedPosts, type PostFamily, type PostRow } from '../../../ui/heroPostFit';
import type { CardIconId } from '../../../ui/CardIcons';
import { showHeroesScreen, heroPostingChips } from './court';
import { archiveHeroChronicle, readHeroChronicle } from '../../../state/heroChronicle';

/** The tab a hero page was left on, remembered per hero for the length of the lane. */
const TAB_KEY = 'heroDepthTab';
/** The notices a hero page read (and cleared) when it was opened, kept for its own redraws. */
const NOTICE_KEY = 'heroDepthNotice';

/**
 * **One hero, read the way the player reads them: who, what now, what next.**
 *
 * Reported: *"hero detail page — very bad, please deeply revamp and make value."* It was a column
 * of eleven notes and seven rows in whatever order the code happened to reach them — two stat
 * sentences, a "base + trained = applied (cap 100)" formula, a departure impact that cloned the
 * whole realm to print zeros, the transfer button, a retrain button that silently failed, the
 * resident button, an "I have read the report" button — and none of it said what the hero was
 * worth where they stood or where they would be worth more.
 *
 * Now a fixed summary (portrait, level, where they are, six stats as glyphs) over three shelves:
 *
 * - **Việc** — the post they hold and what it brings, and the few postings that would use them
 *   better, each one tap from a confirm. This is the shelf the page is opened for.
 * - **Thăng tiến** — the next level, specializations, training.
 * - **Công trạng** — deeds and bio.
 *
 * Anything that is going wrong for them (danger, captivity, wounds, a journey) sits above the
 * shelves on every tab, because a hero in trouble is not a thing to find on the second tab. The
 * page's standing actions live in the bottom sheet with every other lane's.
 */
export function showHeroDepth(self: ConquestUIScene, heroId: string, feedback?: string): void {
  const state = self.state, hero = state.heroes.find(candidate => candidate.id === heroId);
  if (!hero?.growth) return;
  const depth = state.ascent!.heroDepth!;
  const update = (result: HeroCommandResult): void => {
    if (!result.ok) state.message = heroReasonText(result.reason);
    refreshAllLandOutputs(state);
    const saved = autosaveSnapshot(state);
    if (!saved) state.message = t('hero.depth.savedFailed');
    self.replaceLanePage(() => showHeroDepth(self, heroId, !result.ok ? heroReasonText(result.reason) : !saved ? t('hero.depth.savedFailed') : undefined));
  };
  const rebuild = () => self.replaceLanePage(() => showHeroDepth(self, heroId, feedback));
  const view = heroSummary(state, hero);

  // The "I have read the report" row is gone: opening the hero *is* reading it. What was waiting
  // is said once on the page, and kept for its redraws (tab switches) until another hero is opened.
  const mine = depth.notices.filter(notice => notice.heroId === heroId);
  if (mine.length) {
    depth.notices = depth.notices.filter(notice => notice.heroId !== heroId);
    self.data.set(NOTICE_KEY, { heroId, text: mine.map(notice => t(`hero.notice.${notice.kind}` as TranslationKey, { n: notice.level ?? heroLevel(hero) })).join(' · ') });
  }
  const noticeState = self.data.get(NOTICE_KEY) as { heroId: string; text: string } | undefined;
  const noticeLine = noticeState?.heroId === heroId ? noticeState.text : undefined;

  const savedTab = self.data.get(TAB_KEY) as { heroId: string; index: number } | undefined;
  const tab = savedTab?.heroId === heroId ? savedTab.index : 0;
  const choices = availableHeroPerks(state, hero);
  const exposures = Object.values(depth.exposures).filter(item => item.heroId === heroId && !item.resolved);
  const travel = heroCapability(state, 'travel');
  const life = hero.life;
  const onEmbassy = life?.kind === 'active' && life.assignment.kind === 'embassy';
  const canRespec = view.perks.length > 0 && !hero.growth.respecUsed && life?.kind === 'active' && heroFreeReason(state, hero) === undefined;

  const openTransfers = () => {
    if (travel) { self.replaceLanePage(() => showHeroTransfers(self, heroId)); return; }
    self.closeLane(); self.events.emit('ui:ascent-appoint', hero.id);
  };
  const dockItems: Array<{ label: string; hint?: string; onPress: () => void }> = [];
  if (life?.kind === 'active' && !onEmbassy) dockItems.push({ label: t('hero.dock.appoint'), onPress: openTransfers });
  if (heroCapability(state, 'residency') && life?.kind === 'active' && !onEmbassy) {
    dockItems.push({ label: t('hero.dock.envoy'), onPress: () => self.replaceLanePage(() => showResidentPosting(self, heroId)) });
  }
  if (canRespec) dockItems.push({ label: t('hero.dock.respec'), onPress: () => update(respecializeHero(state, heroId)) });

  const status = heroStatus(state, hero);
  const tone = heroStatusTone(status);
  const { addRow, addHeading, addNote, finish } = self.laneList(heroName(hero), `${rarityLabel(hero.rarity)} · ${heroTypeLabel(hero.type)}`, {
    pinned: {
      height: 100,
      build: (holder, width) => {
        holder.add(heroPortraitCard(self, hero, { x: 2, y: 0, width: 68, height: 95 }));
        const x = 82, inner = width - x;
        holder.add(self.ui.label(x, 0, heroPostingLabel(state, hero), 'body', {
          fontSize: '12px', fontStyle: '700', wordWrap: { width: inner },
          ...(tone === 'alert' ? { color: '#9c3b22' } : {}),
        }));
        holder.add(self.ui.label(x, 22, heroProgressLine(state, hero), 'caption', { fontSize: '10px' }));
        holder.add(heroXpTrack(self, state, hero, x, 38, inner - 4));
        holder.add(drawCostChips(self, heroStatChips(hero), { x, y: 52, width: inner, size: 'stat' }));
      },
    },
    tabs: {
      items: [
        { label: t('hero.tab.work'), count: exposures.length + (life?.kind === 'captive' ? 1 : 0) },
        { label: t('hero.tab.growth'), count: choices.length },
        { label: t('hero.tab.record') },
      ],
      active: tab,
      onSelect: (index) => { self.data.set(TAB_KEY, { heroId, index }); rebuild(); },
    },
    dock: dockItems.length ? { items: dockItems, label: () => t('hero.dock.label'), rebuild } : undefined,
    back: () => self.replaceLanePage(() => showHeroesScreen(self)),
  });

  if (feedback) addNote(feedback, INK_UI.cinnabar);
  if (noticeLine) addNote(noticeLine, INK_UI.jade);

  // ── Above the shelves: whatever is going wrong for this hero ──────────────
  if (life?.kind === 'transit' && (!life.protected || life.intendedPost.kind === 'embassy')) addRow({ title: t('hero.depth.reroute'), subtitle: heroPostingLabel(state, hero), border: INK_UI.jade }, () => update(life.intendedPost.kind === 'embassy' ? recallResident(state, heroId) : rerouteHeroHome(state, heroId)));
  for (const exposure of exposures) {
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
      addRow({ title: t('ascent.card.hero-frontier-commission'), subtitle: reason ? heroReasonText(reason) : t('ascent.card.hero-frontier-commission.d'),
        border: INK_UI.gold }, reason ? undefined : () => update(useHeroPolicy(state, 'hero-frontier-commission', heroId, exposure.landId)));
    }
  }
  if (life?.kind === 'captive') {
    // One way out, priced to the realm. The no-gold "release for a pact" row is gone: it freed the
    // hero for nothing and handed the captor a non-aggression pact, which in this mode stops no
    // wave — a free release dressed as a price, and a word (hòa ước) about a war the player cannot
    // wage. Read as *what does it mean? we cannot attack them, why does it care about a pact?*
    const ransom = quoteHeroRelease(state, heroId, 'gold')!;
    const short = Math.max(0, ransom.cost - state.resources.gold);
    addRow({
      title: t('hero.depth.ransom'),
      subtitle: short > 0 ? t('hero.depth.ransomShort', { n: short }) : t('hero.depth.releaseBody'),
      border: short > 0 ? INK_UI.brush : INK_UI.gold,
      muted: short > 0,
      costs: [resourceChip('gold', ransom.cost, short > 0 ? INK_UI.cinnabar : undefined)],
    }, short > 0 ? undefined : () => update(releaseHeroFromQuote(state, ransom)));
  }
  if (life?.kind === 'recovering' && !life.respec && !life.treatmentUsed) {
    const cost = scaledCost(state, { supplies: 10 }).supplies!;
    addRow({ title: t('hero.depth.treat', { n: cost }), subtitle: t('hero.depth.treatBody'), border: INK_UI.jade }, () => update(treatHero(state, heroId, cost)));
  }

  if (tab === 0) {
    // ── Việc: the post they hold, and where they would do more good ──────────
    addHeading(t('hero.detail.current'));
    if (life?.kind === 'active' && life.assignment.kind !== 'home') {
      const assignment = life.assignment;
      const chips = [...postValue(state, assignment, hero).chips];
      if (assignment.kind === 'province') {
        const land = state.lands.find(item => item.id === assignment.landId);
        if (land) {
          const modifiers = heroProvinceModifierBreakdown(state, land);
          for (const stat of ['food', 'supplies'] as const) {
            if (modifiers.applied[stat]) chips.push(resourceChip(stat, `${modifiers.applied[stat] > 0 ? '+' : '−'}${Math.abs(Math.round(modifiers.applied[stat] * 100))}%`));
          }
        }
      }
      addRow({ key: 'current-post', title: heroPostingLabel(state, hero), subtitle: '', border: INK_UI.gold, icon: postIcon(assignment), stats: chips },
        onEmbassy ? undefined : openTransfers);
    } else {
      addRow({ key: 'current-post', title: heroPostingLabel(state, hero), subtitle: life?.kind === 'active' ? t('hero.detail.idle') : '', border: INK_UI.softBrush, icon: 'hero' },
        life?.kind === 'active' ? openTransfers : undefined);
    }
    if (onEmbassy) {
      addRow({ title: t('hero.depth.recall'), subtitle: t('hero.depth.releaseBody'), border: INK_UI.brush }, () => update(recallResident(state, heroId)));
      addRow({ title: t('hero.depth.residents'), subtitle: t('hero.depth.entry'), border: INK_UI.jade }, () => self.replaceLanePage(() => showResidentActions(self, heroId)));
    }
    if (travel && life?.kind === 'active' && !onEmbassy) {
      const suggested = recommendedPosts(state, hero, 3);
      addHeading(t('hero.detail.suggested'));
      if (!suggested.length) addNote(t('hero.detail.noBetter'));
      for (const row of suggested) addPostRow(self, addRow, hero, row, () => showHeroDepth(self, heroId));
      addRow({ key: 'all-posts', title: t('hero.depth.manage'), subtitle: t('hero.depth.manageBody'), border: INK_UI.brush }, openTransfers);
    }
    if (depth.policies.includes('hero-apprenticeship') && heroLevel(hero) >= 3) for (const student of state.heroes.filter(person => person.growth && heroLevel(person) < heroLevel(hero) && heroActive(person))) {
      addRow({ title: t('ascent.card.hero-apprenticeship'), subtitle: t('hero.depth.target', { target: heroName(student) }), border: INK_UI.gold }, () => update(useHeroPolicy(state, 'hero-apprenticeship', heroId, student.id)));
    }
  } else if (tab === 1) {
    // ── Thăng tiến: the next level, specializations, training ────────────────
    if (view.next !== null && view.nextStat) addNote(t('hero.depth.next', { stat: t(`stat.${view.nextStat}` as TranslationKey) }));
    addNote(t('hero.depth.service', { service: view.allowance.service, deed: view.allowance.deed }));
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
    for (const stat of ['martial', 'logistics', 'administration', 'diplomacy'] as const) if (hero.growth.training[stat]) addNote(t('hero.depth.statCap', {
      stat: t(`stat.${stat}` as TranslationKey), base: hero.stats[stat], earned: hero.growth.training[stat],
      raw: hero.stats[stat] + hero.growth.training[stat], applied: view.stats[stat],
    }));
    if (canRespec) addRow({ title: t('hero.depth.respec'), subtitle: t('hero.depth.respecBody'), border: INK_UI.brush }, () => update(respecializeHero(state, heroId)));
    addNote(t('hero.depth.reign'));
  } else {
    // ── Công trạng: deeds and the story ─────────────────────────────────────
    addHeading(t('hero.depth.deeds'));
    if (!view.deeds.length) addNote(t('hero.depth.noDeeds'));
    for (const deed of [...view.deeds].reverse()) {
      const target = state.lands.find(land => land.id === deed.target)?.name ?? state.kingdoms.find(kingdom => kingdom.id === deed.target)?.name ?? deed.target ?? '';
      addNote(t(`hero.depth.deed.${deed.kind}`, { wave: deed.wave, n: deed.amount ?? 0, target }));
    }
    addNote(heroBio(hero));
  }
  finish();
}

/** A hero's six stats as glyph chips; a trained stat is marked with the arrow it earned. */
function heroStatChips(hero: Hero): CostChip[] {
  const stats = effectiveHeroStats(hero), trained = hero.growth?.training;
  const figure = (key: keyof typeof stats) => `${stats[key]}${trained && (trained as Partial<Record<string, number>>)[key] ? '↑' : ''}`;
  return [
    statChip('martial', figure('martial')), statChip('logistics', figure('logistics')), statChip('administration', figure('administration')),
    statChip('diplomacy', figure('diplomacy')), statChip('fealty', figure('loyalty')), statChip('renown', figure('renown')),
  ];
}

function postIcon(post: HeroAssignment): CardIconId {
  return post.kind === 'court' ? 'crown' : post.kind === 'province' ? 'territory' : post.kind === 'host' ? 'banner'
    : post.kind === 'embassy' ? 'diplomacy' : 'hero';
}

function showLastStandConsent(self: ConquestUIScene, heroId: string, exposureId: string, revision: number): void {
  if (!heroCapability(self.state, 'lethal')) return;
  const { addRow, finish } = self.laneList(t('hero.depth.lethalTitle'), t('hero.depth.lethalBody'));
  addRow({ title: t('hero.depth.protect'), subtitle: t('hero.depth.warningBody'), border: INK_UI.jade }, () => {
    protectHero(self.state, exposureId); refreshAllLandOutputs(self.state); autosaveSnapshot(self.state);
    self.replaceLanePage(() => showHeroDepth(self, heroId));
  });
  addRow({ title: t('hero.depth.lethalAccept'), subtitle: t('hero.depth.lethalBody'), border: INK_UI.cinnabar }, () => {
    const result = holdHero(self.state, exposureId, revision, true); autosaveSnapshot(self.state);
    self.replaceLanePage(() => showHeroDepth(self, heroId, result.ok ? undefined : heroReasonText(result.reason)));
  });
  finish();
}

/**
 * One posting as a row: who holds it, what this hero would bring, the road, and the verdict.
 *
 * Shared by the transfer page and the hero page's suggestions, so a suggestion is exactly the row
 * the player would find on the full list.
 */
function addPostRow(
  self: ConquestUIScene,
  addRow: ReturnType<ConquestUIScene['laneList']>['addRow'],
  hero: Hero,
  row: PostRow,
  back: () => void,
): void {
  const state = self.state;
  const home = row.post.kind === 'home';
  const occupant = row.holder ?? row.traveller;
  const subtitle = [
    row.current ? t('hero.post.here')
      : row.traveller ? t('hero.post.arriving', { hero: heroName(row.traveller), n: row.traveller.life?.kind === 'transit' ? Math.max(0, row.traveller.life.arrivalTurn - state.turn) : 0 })
        : row.holder ? t(row.quote.ok ? 'hero.post.heldReplace' : 'hero.post.held', { hero: heroName(row.holder) })
          : home ? '' : t('hero.post.vacant'),
    !row.current && !row.quote.ok ? heroReasonText(row.quote.reason) : '',
  ].filter(Boolean).join('\n');
  const travelChips: CostChip[] = row.quote.ok && !row.current ? [
    ...(row.quote.turns > 0 ? [statChip('seasons', row.quote.turns)] : []),
    ...(row.quote.supplies > 0 ? [resourceChip('supplies', row.quote.supplies)] : []),
  ] : [];
  const verdict = row.current || !row.quote.ok || home ? undefined
    : row.holder
      ? { caption: t('hero.post.gainCaption'), value: `${row.gain >= 0 ? '+' : '−'}${Math.abs(Math.round(row.gain * 100))}`, tone: row.gain >= 0 ? INK_UI.jade : INK_UI.cinnabar }
      : { caption: t('hero.post.fitCaption'), value: `${Math.round(row.value.fit * 100)}`, tone: INK_UI.gold };
  addRow({
    key: row.key,
    title: home ? t('hero.post.returnSeat') : row.title,
    subtitle,
    border: row.current ? INK_UI.gold : !row.quote.ok ? INK_UI.softBrush : row.holder ? INK_UI.brush : INK_UI.jade,
    muted: row.current || !row.quote.ok,
    // The occupant's face, without their XP bar: this row is about the post, not about them.
    ...(occupant ? { portrait: occupant, hideProgress: true } : home ? { icon: 'hero' as CardIconId } : { vacantFace: true }),
    stats: home ? undefined : row.value.chips,
    statsSecond: travelChips.length ? travelChips : undefined,
    ...(verdict ? { badge: verdict } : {}),
  }, row.quote.ok && !row.current ? () => self.replaceLanePage(() => showTransferConfirm(self, hero.id, row, back)) : undefined);
}

/** Headings for the transfer page, in the order a court is read: seats, lands, hosts, home. */
function familyHeading(family: PostFamily, rows: PostRow[]): string {
  if (family === 'court') {
    const empty = rows.filter(row => !row.holder && !row.traveller && !row.current).length;
    return empty > 0 ? t('hero.post.group.court', { n: empty }) : t('hero.post.group.courtFull');
  }
  if (family === 'province') return t('hero.post.group.land', { n: rows.length });
  if (family === 'host') return t('hero.post.group.host', { n: rows.length });
  return t('hero.post.group.home');
}

/**
 * **Every posting, grouped, with what this hero would bring to each and who holds it now.**
 *
 * Reported: *"Bổ nhiệm và điều chuyển very bad: no group, very long list, cannot see the value,
 * cannot know which positions are taken."* It was one flat column of "Go to X" in enum order —
 * home, eight seats, every province, every host — whose only content was the journey, and a taken
 * seat read "occupied or awaiting someone" without saying by whom.
 *
 * One scroll with a heading per kind (the user's choice over tabs). Each row shows the holder's
 * face or an empty seat, the effect chips this hero would bring, the road, and a badge: how much
 * better or worse than the holder, or how well they fit an empty post. A taken post can be taken —
 * the holder serves until the successor arrives — and says so in cinnabar.
 */
export function showHeroTransfers(self: ConquestUIScene, heroId: string): void {
  const state = self.state, hero = state.heroes.find(person => person.id === heroId);
  if (!hero?.growth) return;
  const rows = rankPostsForHero(state, hero);
  const { addRow, addHeading, finish } = self.laneList(t('hero.depth.manage'), `${heroName(hero)} · ${heroPostingLabel(state, hero)}`,
    { back: () => self.replaceLanePage(() => showHeroDepth(self, heroId)) });
  for (const family of ['court', 'province', 'host', 'home'] as const) {
    const list = rows.filter(row => row.family === family);
    if (!list.length) continue;
    addHeading(familyHeading(family, list));
    for (const row of list) addPostRow(self, addRow, hero, row, () => showHeroTransfers(self, heroId));
  }
  finish();
}

/**
 * The confirm page for one transfer: the road, the exact change on arrival, and who is relieved.
 *
 * The one place the realm is simulated on a copy (`heroAssignmentPreview`) — for the single choice
 * being made, never for a list. Safe passage and the acting council are ways of making *this*
 * journey, so they are offered here rather than as extra rows on the list.
 */
function showTransferConfirm(self: ConquestUIScene, heroId: string, row: PostRow, back: () => void, safe = false): void {
  const state = self.state, hero = state.heroes.find(person => person.id === heroId);
  if (!hero?.growth) return;
  const quote = safe ? previewHeroTransfer(state, heroId, row.post, true) : previewHeroTransfer(state, heroId, row.post);
  const preview = heroAssignmentPreview(state, hero, row.post);
  const sheet = self.laneList(row.post.kind === 'home' ? t('hero.post.returnSeat') : row.title, heroName(hero), { back: () => self.replaceLanePage(back) });
  sheet.addNote(t('hero.depth.route', { route: [quote.from, ...quote.path].filter(Boolean)
    .map(id => state.lands.find(land => land.id === id)?.name ?? id).join(' → '), n: quote.turns }));
  sheet.addNote(t('hero.depth.travelQuote', { n: quote.turns, cost: quote.supplies }));
  if (row.holder) sheet.addNote(t('hero.post.sendsHomeLong', { hero: heroName(row.holder) }), INK_UI.cinnabar);
  sheet.addNote(preview.stat ? t('hero.depth.destinationTraining', { stat: t(`stat.${preview.stat}` as TranslationKey) }) : t('hero.depth.noTraining'));
  sheet.addNote(t('hero.depth.assignmentDelta', heroImpactParams(preview)));
  sheet.addRow({ title: t('hero.depth.confirm'), subtitle: '', border: quote.ok ? INK_UI.jade : INK_UI.softBrush, muted: !quote.ok }, quote.ok ? () => {
    const result = transferHero(state, quote);
    refreshAllLandOutputs(state); const saved = autosaveSnapshot(state);
    self.replaceLanePage(() => showHeroDepth(self, heroId, !result.ok ? heroReasonText(result.reason) : !saved ? t('hero.depth.savedFailed') : undefined));
  } : undefined);
  const heroDepthState = state.ascent!.heroDepth!;
  if (!safe && quote.ok && quote.turns > 1 && heroDepthState.policies.includes('hero-safe-passage')) {
    const passage = previewHeroTransfer(state, heroId, row.post, true);
    sheet.addRow({ title: t('ascent.card.hero-safe-passage'), subtitle: passage.ok ? t('hero.depth.travelQuote', { n: passage.turns, cost: passage.supplies }) : heroReasonText(passage.reason), border: INK_UI.gold },
      passage.ok ? () => self.replaceLanePage(() => showTransferConfirm(self, heroId, row, back, true)) : undefined);
  }
  if (quote.ok && row.post.kind === 'province' && hero.assignedTo?.startsWith('court:') && heroDepthState.policies.includes('hero-acting-council')) {
    const landId = row.post.landId;
    sheet.addRow({ title: t('ascent.card.hero-acting-council'), subtitle: t('ascent.card.hero-acting-council.d'), border: INK_UI.gold }, () => {
      useHeroPolicy(state, 'hero-acting-council', heroId, landId); refreshAllLandOutputs(state); autosaveSnapshot(state); self.replaceLanePage(() => showHeroDepth(self, heroId));
    });
  }
  sheet.finish();
}

/**
 * **Resident diplomacy: which court, or which hero — and whether they can go.**
 *
 * Reported twice over: *"cannot select a hero to assign to a kingdom"* (every row disabled by a
 * location rule nobody could see, fixed in `heroFreeReason`), and *"do not know if the hero is on
 * duty in court/army/land or free"* — the rows were one sentence each, "Send X to Y", with the same
 * reason under all of them.
 *
 * From a hero: one row per court, those that would receive them first, each with the court's
 * opinion and the seasons it would take from where the hero stands. From a court: every hero,
 * grouped free / on another post / cannot go, with their diplomacy, the road, and the chips of the
 * post they would leave. Either way, a tap opens a confirm that says what the hero leaves behind.
 */
export function showResidentPosting(self: ConquestUIScene, heroId?: string, kingdomId?: string): void {
  const state = self.state;
  const back = heroId ? () => self.replaceLanePage(() => showHeroDepth(self, heroId)) : undefined;
  if (heroId) {
    const hero = state.heroes.find(person => person.id === heroId);
    if (!hero?.growth) return;
    const { addRow, addHeading, addNote, finish } = self.laneList(t('hero.depth.residents'), `${heroName(hero)} · ${heroPostingLabel(state, hero)}`, { back });
    addNote(t('hero.resident.rule'));
    const courts = state.kingdoms.filter(crown => crown.id !== PLAYER_KINGDOM_ID && !crown.isDefeated)
      .map(kingdom => ({ kingdom, quote: residentQuote(state, heroId, kingdom.id) }))
      .sort((a, b) => (b.kingdom.relations ?? 50) - (a.kingdom.relations ?? 50));
    for (const open of [true, false]) {
      const list = courts.filter(item => item.quote.ok === open);
      if (!list.length) continue;
      addHeading(t(open ? 'hero.resident.group.open' : 'hero.resident.group.closed', { n: list.length }));
      for (const { kingdom, quote } of list) {
        addRow({
          key: `court:${kingdom.id}`,
          icon: 'diplomacy',
          title: kingdom.name,
          subtitle: open ? '' : quote.reason === 'occupied' ? t('hero.resident.posted') : heroReasonText(quote.reason),
          border: open ? INK_UI.jade : INK_UI.softBrush,
          muted: !open,
          stats: [statChip('relations', Math.round(kingdom.relations ?? 50)), statChip('seasons', quote.turns + quote.audience)],
        }, open ? () => confirmResident(self, hero, kingdom.id, () => showResidentPosting(self, heroId)) : undefined);
      }
    }
    finish();
    return;
  }
  const kingdom = state.kingdoms.find(crown => crown.id === kingdomId);
  if (!kingdom) return;
  const { addRow, addHeading, addNote, finish } = self.laneList(t('hero.resident.title.kingdom', { kingdom: kingdom.name }), t('hero.resident.rule'));
  const candidates = state.heroes.filter(person => person.growth && person.id !== 'king')
    .map(hero => ({ hero, quote: residentQuote(state, hero.id, kingdom.id), diplomacy: effectiveHeroStats(hero).diplomacy }))
    .sort((a, b) => b.diplomacy - a.diplomacy);
  // A court that will receive nobody is one sentence, not a column of identical refusals.
  const courtReason = candidates.find(item => item.quote.reason === 'acceptance' || item.quote.reason === 'occupied')?.quote.reason;
  if (courtReason) addNote(courtReason === 'occupied' ? t('hero.resident.posted') : heroReasonText(courtReason), INK_UI.cinnabar);
  const groupOf = (item: typeof candidates[number]): 'free' | 'busy' | 'blocked' => !item.quote.ok ? 'blocked' : item.quote.vacates ? 'busy' : 'free';
  for (const group of ['free', 'busy', 'blocked'] as const) {
    const list = candidates.filter(item => groupOf(item) === group);
    if (!list.length) continue;
    addHeading(t(`hero.pick.group.${group}`, { n: list.length }));
    for (const { hero, quote, diplomacy } of list) {
      const status = heroStatus(state, hero);
      addRow({
        key: `hero:${hero.id}`,
        portrait: hero,
        title: heroTitleLine(hero),
        // Where they are is the chip under the stats; only a refusal needs words.
        subtitle: group === 'blocked' ? heroReasonText(quote.reason) : '',
        border: group === 'free' ? INK_UI.jade : group === 'busy' ? INK_UI.cinnabar : INK_UI.softBrush,
        muted: group === 'blocked',
        hideProgress: true,
        stats: [statChip('diplomacy', diplomacy), ...(quote.ok ? [statChip('seasons', quote.turns + quote.audience)] : [])],
        statsSecond: heroPostingChips(state, hero, status),
      }, quote.ok ? () => confirmResident(self, hero, kingdom.id, () => showResidentPosting(self, undefined, kingdom.id)) : undefined);
    }
  }
  finish();
}

function confirmResident(self: ConquestUIScene, hero: Hero, kingdomId: string, back: () => void): void {
  const state = self.state;
  const kingdom = state.kingdoms.find(crown => crown.id === kingdomId);
  const quote = residentQuote(state, hero.id, kingdomId);
  self.showConfirmPage({
    title: t('hero.resident.confirmTitle', { hero: heroName(hero), kingdom: kingdom?.name ?? '' }),
    subtitle: heroTitleLine(hero),
    portrait: hero,
    lines: [
      t('hero.depth.entryQuote', { n: quote.turns, audience: quote.audience }),
      quote.vacates ? t('hero.post.leaves', { post: heroPostingLabel(state, hero) }) : '',
    ],
    confirmLabel: t('ascent.pick.confirm'),
    danger: Boolean(quote.vacates),
    onConfirm: () => {
      const result = postResident(state, hero.id, kingdomId);
      refreshAllLandOutputs(state); autosaveSnapshot(state);
      self.replaceLanePage(() => showHeroDepth(self, hero.id, result.ok ? undefined : heroReasonText(result.reason)));
    },
    onBack: () => self.replaceLanePage(back),
  });
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
    addRow({ title: t(`hero.depth.${target.kind}`), subtitle: quote.ok ? t('hero.depth.residentQuote', { n: quote.influence, seasons: quote.seasons, target: target.title }) : heroReasonText(quote.reason), border: quote.ok ? INK_UI.jade : INK_UI.softBrush }, quote.ok ? () => {
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
