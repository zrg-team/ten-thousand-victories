/**
 * Two lanes, both about who serves the throne: the champion roster (`heroes`), and the court
 * itself (`court`) — stability and its drift, authority against standing weight, the four estates,
 * the schools of statecraft, the decrees in force, the tax dial, and the four seats with their
 * picker. The roster hands a champion to the Appointment card; the seats are where one is put.
 *
 * Every mutation here — `takeCapstone`, `repealProject`, `setTaxRate` — calls
 * `refreshAllLandOutputs` before anything repaints: land yields are cached, so a law or a tax rate
 * that has not been pushed through them leaves the player reading the old numbers. The tax panel
 * is the only fixed-height widget on the screen (72px), and its slider commits on `onChange` while
 * `onPreview` merely retitles the effect line under the player's thumb.
 */
import { getCourtBonuses, ALL_COURT_POSITIONS, getCourtPositionLabel } from '../../../systems/CourtSystem';
import { showHeroDepth, showHeroChronicle, showHeroAftermath } from './heroDepth';
import { protectHero } from '../../../systems/heroes/HeroService';
import { autosaveSnapshot } from '../../../state/save';
import {
  authorityCap,
  averageCompliance,
  ESTATE_CRISIS,
  estateStanding,
  overreach,
  realisedFactor,
  repealTerms,
  standingWeight,
} from '../../../systems/DecreeSystem';
import { repealProject } from '../../../systems/empire/EdictSystem';
import {
  ALL_SCHOOLS,
  capstoneReady,
  capstonesTaken,
  isSchoolLocked,
  SCHOOL_COMMIT,
  schoolTally,
  takeCapstone,
} from '../../../systems/decree/SchoolSystem';
import {
  currentTaxRate,
  setTaxRate,
  taxGoldMult,
  taxGrowthDelta,
  taxStabilityBase,
} from '../../../systems/TaxSystem';
import { lawCardView, seatedEffectSummary } from '../../../systems/ascent/CourtLaneSystem';
import { ALL_DOCTRINES, adoptDoctrine, doctrineBlurb, doctrineName } from '../../../systems/ascent/RealmDoctrineSystem';
import { heroPayroll, heroWage, refreshAllLandOutputs } from '../../../systems/ResourceSystem';
import { liveBattles } from '../../../systems/ascent/fronts';
import { ourHosts } from '../../../systems/ascent/battleMembership';
import { drawCostChips, type CostChip } from '../../../ui/costChips';
import { favorRemaining, talentForecast, talentSearchEscalation } from '../../../systems/ascent/ChampionSearch';
import { rulesOf } from '../../../game/ascentRuleset';
import { TALENT_SEARCH_REST_SEASONS } from '../../../game/ascentConfig';
import { HERO_GROUP_ORDER, HERO_STATUS_ORDER, heroGroup, heroStatus, heroStatusTone, type HeroGroup, type HeroStatus } from '../../../ui/heroStatus';
import { resourceChip, statChip } from '../../../ui/statChips';
import { buildHeroPickerRows, heroPostingLabel } from '../../../ui/heroPickerRows';
import { eraLabel } from '../../../systems/empire/MandateSystem';
import { INK_UI } from '../../../ui/InkUI';
import { heroName, rarityLabel, t } from '../../../i18n';
import { type CourtPositionId, type GameState, type Hero, ESTATE_IDS } from '../../../state/types';
import { cssHex, heroStatLine } from '../constants';
import type { ConquestUIScene } from '../../ConquestUIScene';

/**
 * The hero roster: who serves, what they cost, when the next one comes, and what each is doing.
 *
 * Read top-down in the order the page is opened for. A one-line lead; the payroll as a coin, not a
 * word; the Favour meter with its sentence; the one paid door; then the champions **grouped by what
 * they are doing** — the free and the endangered first. The roster used to be one column sorted
 * posted-or-not with a posting sentence on every card, which answered *where is Nguyễn Trãi* and
 * not *who is free, who is fighting, who has been taken*.
 *
 * Tapping anyone opens the same Appointment card the game raises when a champion arrives, so a
 * posting can be changed the moment the player wants to.
 */
export function showHeroesScreen(self: ConquestUIScene): void {
  const state = self.state;
  // The throne is not one of the champions serving it.
  //
  // The king is a Hero because half the game looks him up as one, but he is the *player* —
  // listing him beside the champions made a founding that gives you a ruler and one champion
  // read as handing you two heroes, and offered you a card to repost yourself. He is named in
  // the lead instead, so nothing about him is hidden — only the row that invited you to reassign
  // yourself is gone.
  const king = state.heroes.find((hero) => hero.id === 'king');
  const champions = state.heroes.filter((hero) => hero.id !== 'king');
  const { addRow, addHeading, addWidget, finish } = self.laneList(
    t('action.heroes'),
    t('ascent.heroes.lead', { king: king ? heroName(king) : '—' }),
  );

  addRosterHeader(self, addWidget, champions.length);

  // **A page with nothing on it says nothing.**
  //
  // A run opens with no champions at all, and this screen opened as a title, a paragraph and
  // half a screen of empty paper — no card, no mark, nothing to tell the player that the list
  // is empty on purpose or where champions come from. The empty seat now looks like the empty
  // seats everywhere else in the mode: the dashed portrait frame, and a line saying who fills it.
  if (champions.length === 0) {
    addRow({
      title: t('ascent.screen.noChampions'),
      subtitle: t('ascent.screen.noChampionsBody'),
      border: INK_UI.softBrush,
      vacantFace: true,
      muted: true,
    });
  }

  const reports = state.ascent?.heroDepth;
  if (reports) {
    const warnings = Object.values(reports.exposures).filter(item => !item.resolved && !item.acknowledged);
    if (warnings.length) addRow({ title: t('hero.depth.protectAll'), subtitle: t('hero.depth.warningBody'), border: INK_UI.jade }, () => {
      for (const warning of warnings) protectHero(state, warning.id);
      refreshAllLandOutputs(state); autosaveSnapshot(state); self.replaceLanePage(() => showHeroesScreen(self));
    });
    if (warnings.length) addRow({ title: t('hero.depth.warnings', { n: warnings.length }), subtitle: t('hero.depth.warningBody'), border: INK_UI.cinnabar }, () => self.replaceLanePage(() => showHeroDepth(self, warnings[0].heroId)));
    if (reports.notices.length) addRow({ title: t('hero.depth.aftermath'), subtitle: t('hero.depth.aftermathBody'), border: INK_UI.gold },
      () => self.replaceLanePage(() => showHeroAftermath(self)));
    addRow({ title: t('hero.depth.chronicle'), subtitle: t('hero.depth.cosmetic'), border: INK_UI.brush }, () => self.replaceLanePage(() => showHeroChronicle(self)));
  }

  // Three headings — free, working, in trouble — each with its count, and only when non-empty.
  // Inside a heading the finer kind orders the cards (a fight before a governorship), and the
  // card's border and chips carry the difference.
  const byGroup = new Map<HeroGroup, Array<{ hero: Hero; status: HeroStatus }>>();
  for (const hero of champions) {
    const status = heroStatus(state, hero);
    const group = heroGroup(status);
    byGroup.set(group, [...(byGroup.get(group) ?? []), { hero, status }]);
  }
  for (const groupId of HERO_GROUP_ORDER) {
    const group = (byGroup.get(groupId) ?? [])
      .sort((a, b) => HERO_STATUS_ORDER.indexOf(a.status) - HERO_STATUS_ORDER.indexOf(b.status));
    if (!group.length) continue;
    addHeading(`${t(`ascent.heroes.group.${groupId}` as Parameters<typeof t>[0])} · ${group.length}`);
    for (const { hero, status } of group) {
      const tone = heroStatusTone(status);
      const border = tone === 'alert' ? INK_UI.cinnabar : tone === 'settled' ? INK_UI.jade : INK_UI.softBrush;
      addRow(
        {
          title: `${heroName(hero)}  ·  ${rarityLabel(hero.rarity)}`,
          // The bio stays on the hero's own card; a roster row is read at a glance, and three lines
          // of history under every name pushed the fourth champion off a phone screen.
          subtitle: [heroSituationLine(self, hero, status), heroStatLine(hero)]
            .filter(Boolean).join('\n'),
          // What the hero costs, then where they serve — as glyphs, one strip each, so a wage is
          // never read as a posting and a land name never wraps in beside a number.
          stats: [heroWageChip(state, hero)],
          statsSecond: heroPostingChips(state, hero, status),
          border,
          muted: status === 'dead',
          portrait: hero,
        },
        status === 'dead' ? undefined : () => {
          if (hero.growth) { self.replaceLanePage(() => showHeroDepth(self, hero.id)); return; }
          self.closeLane();
          self.events.emit('ui:ascent-appoint', hero.id);
        },
      );
    }
  }
  finish();
}

/** Height of the roster header: payroll row, favour sentence and bar, and the search button. */
const ROSTER_HEADER_HEIGHT = 122;
const SEARCH_BUTTON_HEIGHT = 54;

/**
 * **The roster's header** — payroll, the Favour clock, and *Tìm nhân tài trong thiên hạ*.
 *
 * Drawn bare on the paper, not as a card: a card here read as one more champion (reported, twice).
 *
 * The button is one control in every state and says why when it cannot be pressed. While the
 * search rests, its own face fills with the rest as a bar, so "when can I buy again" is answered
 * where the finger already is; when the treasury is short, the same bar fills with the gold held
 * against the price. A Favour draft already waiting turns it into a free call.
 *
 * Gold is a coin glyph everywhere on this header, never the word — the same chips the rest of the
 * mode prices in. The confirm page, not this tap, is what spends: the price is a share of the
 * treasury, so late in a run one tap is thousands of coin.
 */
function addRosterHeader(
  self: ConquestUIScene,
  addWidget: ReturnType<ConquestUIScene['laneList']>['addWidget'],
  championCount: number,
): void {
  const state = self.state;
  const forecast = talentForecast(state);
  const favor = Math.floor(forecast.favor);
  const search = (): void => {
    self.closeLane();
    self.events.emit('ui:ascent-search-talent');
  };

  addWidget(ROSTER_HEADER_HEIGHT, (holder, width) => {
    // ── Payroll ──
    holder.add(self.ui.label(2, 2, t('ascent.heroes.payroll', { n: championCount }), 'caption', { fontSize: '11px' }));
    const pay = drawCostChips(self, [resourceChip('gold', t('ascent.heroes.perSeason', { gold: heroPayroll(state) }))],
      { x: 0, y: 0, width, size: 'stat' });
    pay.setX(width - 2 - pay.getBounds().width);
    holder.add(pay);

    // ── Favour, in a sentence and a bar ──
    const favourLine = forecast.draftWaiting
      ? t('ascent.talent.waiting')
      : forecast.seasonsLeft === undefined
        ? t('ascent.talent.stalled', { favor, threshold: forecast.threshold })
        : t('ascent.talent.next', { favor, threshold: forecast.threshold, n: forecast.seasonsLeft });
    holder.add(self.ui.label(2, 26, favourLine, 'caption', { fontSize: '11px' }));
    holder.add(self.ui.statBar(
      { x: 2, y: 45, width: width - 4, height: 8 },
      forecast.draftWaiting ? 1 : forecast.favor,
      forecast.draftWaiting ? 1 : forecast.threshold,
      forecast.draftWaiting ? INK_UI.jade : INK_UI.gold,
    ));

    // ── The search ──
    const top = ROSTER_HEADER_HEIGHT - SEARCH_BUTTON_HEIGHT;
    const resting = !forecast.draftWaiting && forecast.seasonsUntilSearch > 0;
    const short = !forecast.draftWaiting && !resting && !forecast.canAfford;
    const ready = forecast.draftWaiting || (!resting && !short);
    const variant = forecast.draftWaiting ? 'primary' : ready ? 'secondary' : 'disabled';
    holder.add(self.ui.button({ x: 0, y: top, width, height: SEARCH_BUTTON_HEIGHT }, '', () => {
      if (!ready) return;
      if (forecast.draftWaiting) { search(); return; }
      self.showConfirmPage({
        title: t('ascent.talent.title'),
        lines: [
          t('ascent.talent.cost', { gold: forecast.price, held: Math.floor(state.resources.gold) }),
          // Beta: why this price — the Favour still to fill, and the searches already bought.
          ...(rulesOf(state).talentPriceByFavor ? [
            t('beta.talent.priceWhy', { pct: Math.round(favorRemaining(state) * 100) }),
            ...((state.ascent?.talentSearches ?? 0) > 0 ? [t('beta.talent.priceRepeat', {
              n: (state.ascent?.talentSearches ?? 0) + 1,
              mult: talentSearchEscalation(state).toFixed(2).replace(/\.?0+$/, ''),
            })] : []),
          ] : []),
          t('ascent.talent.body'),
          t('ascent.talent.limit', { n: TALENT_SEARCH_REST_SEASONS }),
        ],
        confirmLabel: t('ascent.talent.confirm', { gold: forecast.price }),
        onConfirm: search,
        onBack: () => self.replaceLanePage(() => showHeroesScreen(self)),
      });
    }, { variant, fontSize: '13px' }));

    // The face of the button, laid over it: the name, then what it costs or why it waits.
    const cx = width / 2;
    holder.add(self.ui.label(cx, top + 17, forecast.draftWaiting ? t('ascent.talent.callWaiting') : t('ascent.talent.button'), 'button', {
      fontSize: '13px',
      ...(forecast.draftWaiting ? { color: cssHex(INK_UI.cinnabar) } : {}),
    }).setOrigin(0.5).setAlpha(ready ? 1 : 0.6));

    const second = top + 36;
    if (forecast.draftWaiting) {
      holder.add(self.ui.label(cx, second, t('ascent.talent.free'), 'caption', { fontSize: '11px' }).setOrigin(0.5));
    } else if (resting) {
      holder.add(self.ui.label(cx, second - 3, t('ascent.talent.resting', { n: forecast.seasonsUntilSearch }), 'caption', { fontSize: '10px' })
        .setOrigin(0.5).setAlpha(0.8));
    } else {
      const chips = drawCostChips(self, [resourceChip('gold',
        short ? `${Math.floor(state.resources.gold)}/${forecast.price}` : forecast.price,
        short ? INK_UI.cinnabar : undefined)], { x: 0, y: second - 8, width, size: 'stat' });
      chips.setX(cx - chips.getBounds().width / 2);
      holder.add(chips);
    }

    // Progress inside the button whenever it cannot be pressed: the rest, or the gold against the price.
    if (resting || short) {
      holder.add(self.ui.statBar(
        { x: 18, y: top + SEARCH_BUTTON_HEIGHT - 12, width: width - 36, height: 5 },
        resting ? forecast.restProgress : Math.max(0, state.resources.gold),
        resting ? 1 : forecast.price,
        resting ? INK_UI.jade : INK_UI.gold,
      ));
    }
  });
}

/** A hero's wage this season as a coin chip. Half-pay shows its half: 2.5, not a rounded 3. */
function heroWageChip(state: GameState, hero: Hero): CostChip {
  const wage = heroWage(state, hero);
  const figure = Number.isInteger(wage) ? `${wage}` : wage.toFixed(1);
  return resourceChip('gold', t('ascent.heroes.perSeason', { gold: figure }));
}

/**
 * Where a hero serves, as glyph chips: the land they govern, the court seat they hold, the host
 * they lead and where it stands (and the field, if it is fighting). Empty for anyone without a
 * posting — their situation is a sentence instead, see `heroSituationLine`.
 */
function heroPostingChips(state: GameState, hero: Hero, status: HeroStatus): CostChip[] {
  const at = hero.assignedTo;
  if (!at || status === 'captive' || status === 'recovering' || status === 'transit' || status === 'dead') return [];
  const chip = (icon: CostChip['icon'], value: string, label: string): CostChip => ({ icon, value, label });
  if (at.startsWith('court:')) {
    return [chip('crown', getCourtPositionLabel(at.slice('court:'.length) as CourtPositionId), t('ascent.heroes.chip.court'))];
  }
  const land = state.lands.find((candidate) => candidate.id === at);
  if (land) return [chip('territory', land.name, t('ascent.heroes.chip.land'))];
  const army = state.armies.find((candidate) => candidate.id === at);
  if (army) {
    const chips = [chip('banner', army.name, t('ascent.heroes.chip.army'))];
    const battle = liveBattles(state).find((fight) => ourHosts(state, fight).some((host) => host.id === army.id));
    if (battle) chips.push(chip('crossed-weapons', battle.landName, t('ascent.heroes.chip.battle')));
    else {
      const standing = state.lands.find((candidate) => candidate.id === army.landId);
      if (standing) chips.push(chip('territory', standing.name, t('ascent.heroes.chip.land')));
    }
    return chips;
  }
  // Envoys, ambassadors and musters have no single place to name: their posting sentence is the chip.
  const icon: CostChip['icon'] = status === 'envoy' ? 'diplomacy' : status === 'army' ? 'spears' : 'hero';
  return [chip(icon, heroPostingLabel(state, hero), t('ascent.heroes.chip.duty'))];
}

/**
 * The sentence a card carries when chips cannot say it: an idle hero's half pay, a captive's
 * captor, a recovery's seasons, a road's destination. Postings carry chips instead.
 */
function heroSituationLine(self: ConquestUIScene, hero: Hero, status: HeroStatus): string {
  if (status === 'idle') return t('ascent.heroes.halfPay');
  if (status === 'captive' || status === 'recovering' || status === 'transit' || status === 'dead' || status === 'away') {
    return heroPosting(self, hero);
  }
  return '';
}

/** Human-readable posting for a hero, covering every form `assignedTo` can take. */
function heroPosting(self: ConquestUIScene, hero: Hero): string {
  return heroPostingLabel(self.state, hero);
}

/** Seats, the realm's standing, and the laws in force — plus the throne's unspent authority. */
/** The tax dial's height, spent once by the page body and once by the bottom sheet. */
const TAX_DIAL_HEIGHT = 72;

/**
 * The tax dial, as a builder both the court page and its bottom sheet can call.
 *
 * The rate is a standing policy, so it belongs beside the realm's other standing choices in the
 * sheet — asked for directly — and it stays on the page for anyone reading top-down. One builder,
 * so the two can never drift; each reads live state as it draws, so whichever is touched last is
 * what both show on the next repaint.
 */
function buildTaxDial(
  self: ConquestUIScene,
  state: GameState,
): (holder: Phaser.GameObjects.Container, width: number) => void {
  return (holder, width) => {
    holder.add(self.ui.panel(
      { x: 0, y: 0, width, height: TAX_DIAL_HEIGHT },
      { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52 },
    ));

    /**
     * What the dial buys, as three chips rather than a sentence.
     *
     * "gold ×1.00 · stability +0.0/season · growth +0.0" ran the full width of the panel and had
     * to be re-read from the left on every drag of the slider. Three glyphs sit in the same
     * places from one rate to the next, so a drag moves the *figures* and nothing else — which is
     * the only thing the player is watching while they drag.
     */
    const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
    const effectChips = (rate: number) => {
      const fatiguePenalty = (state.taxFatigue ?? 0) * 0.16;
      const drift = Number((taxStabilityBase(rate) - fatiguePenalty).toFixed(1));
      return [
        resourceChip('gold', `×${taxGoldMult(rate).toFixed(2)}`),
        statChip('stability', signed(drift), drift < 0 ? INK_UI.cinnabar : undefined),
        statChip('people', signed(taxGrowthDelta(rate)),
          taxGrowthDelta(rate) < 0 ? INK_UI.cinnabar : undefined),
      ];
    };
    // Redrawn, not retexted: a chip is a glyph and a number, and the glyph does not change.
    let detail = drawCostChips(self, effectChips(currentTaxRate(state)),
      { x: 14, y: 8, width: width - 28, size: 'stat' });
    holder.add(detail);
    const repaint = (rate: number): void => {
      detail.destroy(true);
      detail = drawCostChips(self, effectChips(rate), { x: 14, y: 8, width: width - 28, size: 'stat' });
      holder.add(detail);
    };

    holder.add(self.ui.label(14, 52, t('ascent.tax.light'), 'caption', { fontSize: '10px' }));
    holder.add(
      self.ui.label(width - 14, 52, t('ascent.tax.heavy'), 'caption', { fontSize: '10px' })
        .setOrigin(1, 0),
    );

    holder.add(self.ui.slider(
      { x: 10, y: 24, width: width - 20, height: 22 },
      {
        value: currentTaxRate(state),
        onPreview: repaint,
        onChange: (rate) => {
          setTaxRate(state, rate);
          refreshAllLandOutputs(state);
          repaint(rate);
        },
      },
    ));
  };
}

export function showCourtScreen(self: ConquestUIScene): void {
  const state = self.state;
  const mandate = state.mandate;
  const doctrine = state.ascent?.doctrine;
  // What the throne is waiting on, in the order it costs the realm most to ignore.
  //
  // An empty seat is first because it is the only one of these that is losing the realm something
  // every single season it stands; an unspent edict point keeps until it is spent. Each row goes
  // straight to the page that answers it — see the `dock` note in `lanes/frame`.
  const waiting: Array<{ label: string; onPress: () => void }> = [];
  for (const seat of ALL_COURT_POSITIONS) {
    if (!state.court.unlockedSeats.includes(seat)) continue;
    if (state.court.seats[seat]) continue;
    waiting.push({
      label: t('ascent.lane.waitSeat', { seat: getCourtPositionLabel(seat) }),
      onPress: () => showSeatPicker(self, seat),
    });
  }
  if ((state.mandate?.edictPoints ?? 0) > 0) {
    waiting.push({
      label: t('ascent.lane.waitEdict', { n: state.mandate?.edictPoints ?? 0 }),
      onPress: () => {
        self.closeLane();
        self.events.emit('ui:ascent-law');
      },
    });
  }

  const { addRow, addHeading, addNote, addWidget, finish } = self.laneList(
    t('action.court'),
    t('ascent.lane.courtBody', {
      era: mandate ? eraLabel(mandate.era) : '—',
      stability: Math.round(state.court.stability),
      points: mandate?.edictPoints ?? 0,
    }),
    {
      dock: {
        items: waiting,
        rebuild: () => showCourtScreen(self),
      },
      footerWidget: { height: TAX_DIAL_HEIGHT, build: buildTaxDial(self, state) },
      // The realm's standing course, in the same footer slot the other lanes keep their
      // standing setting. The era card still asks on its own clock; this is the king turning
      // to the ministers whenever he is already reading their page — same `adoptDoctrine`
      // underneath, so both doors move the same autopilot weights.
      footerPicker: {
        label: t('ascent.court.course'),
        options: ALL_DOCTRINES.map((candidate) => doctrineName(candidate)),
        note: doctrine ? doctrineBlurb(doctrine) : t('ascent.court.courseNone'),
        selected: doctrine ? ALL_DOCTRINES.indexOf(doctrine) : -1,
        onPick: (index) => {
          const next = ALL_DOCTRINES[index];
          if (!next) return;
          adoptDoctrine(state, next);
          self.replaceLanePage(() => showCourtScreen(self));
          self.refresh();
        },
      },
    },
  );

  const seated = ALL_COURT_POSITIONS.filter((seat) => state.court.seats[seat]).length;
  const unlockedCount = state.court.unlockedSeats.length;

  // ── The court as it stands ──
  //
  // The same reasoning as the province sheet: the screen opened straight onto a list of seats
  // without saying what state the court was in. Stability and its drift are the two numbers the
  // whole screen is about — an empty seat costs stability every tick — and neither was anywhere
  // except as a bare figure in the subtitle, with no sign of which way it was moving.
  addHeading(t('court.section.state'));
  const regen = getCourtBonuses(state).stabilityRegen;
  const drift = `${regen >= 0 ? '+' : ''}${(Math.round(regen * 10) / 10).toFixed(1)}`;
  addWidget(0, (parent, width) => self.statPanel(parent, width, [
    {
      label: t('court.stat.stability'),
      value: `${Math.round(state.court.stability)}%`,
      accent: state.court.stability < 35 ? cssHex(INK_UI.cinnabar) : undefined,
    },
    { label: t('court.stat.drift'), value: drift },
    { label: t('court.stat.seats'), value: `${seated}/${unlockedCount}` },
    {
      label: t('court.stat.favour'),
      value: `${Math.round(state.court.favor)}/${Math.round(state.court.favorThreshold)}`,
    },
  ]));

  // ── Authority: what the realm will bear, and whether it is obeying ──
  //
  // This is the header the standing-law list never had. A decree used to be a purchase with no
  // running cost, so a list of them told the player nothing about the state they were in. Weight
  // against authority says how much more law the throne can carry; obedience says what the laws
  // already passed are actually worth. Both are the numbers the whole screen is about.
  if (mandate) {
    addHeading(t('decree.section.authority'));
    const weight = standingWeight(state);
    const cap = authorityCap(state);
    const over = overreach(state);
    const obedience = Math.round(averageCompliance(state));
    // Nghiêm pháp lifts the cap to infinity, which would print as "3 / Infinity". A word, not a
    // number, because at that point the number has stopped being the thing the player reads.
    const capLabel = Number.isFinite(cap) ? `${cap}` : t('decree.authority.boundless');
    addWidget(0, (parent, width) => self.statPanel(parent, width, [
      {
        label: t('decree.stat.weight'),
        value: t('decree.authority.value', { weight: `${weight}`, cap: capLabel }),
        accent: over > 0 ? cssHex(INK_UI.cinnabar) : undefined,
      },
      {
        label: t('decree.stat.compliance'),
        value: t('decree.compliance.value', { n: `${obedience}` }),
        accent: obedience < 45 ? cssHex(INK_UI.cinnabar) : undefined,
      },
      { label: t('decree.stat.authority'), value: capLabel },
    ]));
    addNote(
      over > 0
        ? t('decree.authority.over', { n: `${over}` })
        : weight >= cap
          ? t('decree.authority.full')
          : t('decree.authority.room', { n: `${cap - weight}` }),
      over > 0 ? INK_UI.cinnabar : INK_UI.softBrush,
    );
    addNote(t('decree.compliance.effect', { mult: realisedFactor(state).toFixed(2) }));

    // ── The four estates ──
    //
    // One shared 0–100 number per estate is the wire between decrees and everything else in the
    // game, so it has to be visible before a law is passed, not discovered afterwards. An estate
    // in open grievance is called out by name with what it is actually withholding.
    addHeading(t('decree.section.estates'));
    addWidget(0, (parent, width) => self.statPanel(parent, width, ESTATE_IDS.map((estate) => ({
      label: t(`decree.estate.${estate}` as Parameters<typeof t>[0]),
      value: `${Math.round(estateStanding(state, estate))}`,
      accent: estateStanding(state, estate) < ESTATE_CRISIS ? cssHex(INK_UI.cinnabar) : undefined,
    }))));
    for (const estate of ESTATE_IDS) {
      if (estateStanding(state, estate) >= ESTATE_CRISIS) continue;
      addNote(t('decree.estate.angry', {
        estate: t(`decree.estate.${estate}` as Parameters<typeof t>[0]),
        effect: t(`decree.estate.${estate}.angry` as Parameters<typeof t>[0]),
      }), INK_UI.cinnabar);
    }
  }

  // ── Schools of statecraft ──
  //
  // Only once the reign has actually leaned somewhere. Shown from the first decree of a school
  // rather than only at the capstone, so the player can see the commitment coming and decide
  // whether to make it — a fork you discover after crossing it is not a fork.
  if (mandate) {
    const tally = schoolTally(state);
    const leaning = ALL_SCHOOLS.filter((school) => tally[school] > 0);
    if (leaning.length > 0) {
      addHeading(t('decree.section.schools'));
      addWidget(0, (parent, width) => self.statPanel(parent, width, ALL_SCHOOLS.map((school) => ({
        label: t(`decree.school.${school}` as Parameters<typeof t>[0]),
        value: `${tally[school]}`,
        accent: isSchoolLocked(state, school)
          ? cssHex(INK_UI.softBrush)
          : tally[school] >= SCHOOL_COMMIT ? cssHex(INK_UI.jade) : undefined,
      }))));
      for (const school of ALL_SCHOOLS) {
        if (!capstoneReady(state, school)) continue;
        addRow(
          {
            title: t('decree.capstone.offer', { title: t(`decree.capstone.${school}` as Parameters<typeof t>[0]) }),
            subtitle: t(`decree.capstone.${school}.d` as Parameters<typeof t>[0]),
            border: INK_UI.jade,
          },
          () => {
            if (takeCapstone(state, school)) {
              refreshAllLandOutputs(state);
              // Redrawn in place, not closed and reopened: `closeLane` hands the pause back and
              // clears `openPromptKey`, so the run would restart under a sheet the player is still
              // reading and the next tick (3500ms) could pull it away for a card or a fight. The
              // refresh is what `closeLane` used to do for the resource strip above the dim, whose
              // rates a capstone moves.
              self.replaceLanePage(() => showCourtScreen(self));
              self.refresh();
            }
          },
        );
      }
      for (const school of capstonesTaken(state)) {
        addRow({
          title: t(`decree.capstone.${school}` as Parameters<typeof t>[0]),
          subtitle: t(`decree.capstone.${school}.d` as Parameters<typeof t>[0]),
          border: INK_UI.jade,
          muted: true,
        });
      }
    }
  }

  // ── Decrees ──
  if ((mandate?.edictPoints ?? 0) > 0 || (mandate?.edicts.length ?? 0) > 0) {
    addHeading(t('court.section.decrees'));
  }
  if ((mandate?.edictPoints ?? 0) > 0) {
    addRow(
      {
        title: t('ascent.lane.enactLaw'),
        subtitle: t('ascent.lane.enactLawBody', { points: mandate?.edictPoints ?? 0 }),
        border: INK_UI.gold,
      },
      () => {
        self.closeLane();
        self.events.emit('ui:ascent-law');
      },
    );
  }
  for (const edictId of mandate?.edicts ?? []) {
    const view = lawCardView(state, edictId);
    if (!view) continue;
    const terms = repealTerms(state, edictId);
    // A standing law is now a row you can act on rather than a receipt. Repeal is the pressure
    // valve the weight system needs: without it, one bad early pick is a bad whole run.
    addRow(
      {
        title: view.title,
        subtitle: `${view.effect}  ·  ${t('decree.weight.cost', { n: `${terms?.weight ?? 0}` })}`,
        border: INK_UI.gold,
        muted: !terms?.affordable,
      },
      terms?.affordable
        ? () => {
          if (repealProject(state, edictId)) {
            refreshAllLandOutputs(state);
            // Redrawn in place for the same reason as the capstone above: closing the lane here
            // would set the run running again under the sheet the player is reading.
            self.replaceLanePage(() => showCourtScreen(self));
            self.refresh();
          }
        }
        : undefined,
    );
  }

  // ── The tax dial, always directly under the decrees ──
  //
  // Tax used to be reachable only as cards inside the Chiếu Chỉ prompt, which made a standing
  // policy feel like a random event: you set it when the prompt happened to come up, and could
  // not find it again when you wanted it. A dial the player owns lives on the court screen.
  addHeading(t('court.section.tax'));
  addWidget(TAX_DIAL_HEIGHT, buildTaxDial(self, state));

  // ── Seats, ordered by what wants attention ──
  //
  // Fixed order previously, so a locked seat — nothing to be done about it for another era — sat
  // between two vacancies the player could fill today. Vacant-and-open first, then the seats
  // already working, then the ones still shut: the list now reads top-down as "do this, this is
  // fine, this is later".
  addHeading(t('court.section.seats'));
  const seats = [...ALL_COURT_POSITIONS].sort((a, b) => {
    const rank = (seat: CourtPositionId) => {
      if (!state.court.unlockedSeats.includes(seat)) return 2;
      return state.court.seats[seat] ? 1 : 0;
    };
    return rank(a) - rank(b);
  });

  // Four seats, each a title and who holds it — a grid, not four full-width cards. The order
  // above still decides which corner a seat sits in, so "do this, this is fine, this is later"
  // still reads top-left to bottom-right.
  addWidget(0, (parent, width) => self.actionTiles(parent, width, seats.map((seat) => {
    const unlocked = state.court.unlockedSeats.includes(seat);
    const hero = state.heroes.find((candidate) => candidate.id === state.court.seats[seat]);
    return {
      title: getCourtPositionLabel(seat),
      // Held, vacant, shut — three states, three glyphs, before a word is read. A vacancy is the
      // one the player can do something about today, so it carries the same person mark the
      // province sheet's empty post now does.
      icon: hero ? 'person' : unlocked ? 'person' : 'hourglass',
      note: hero
        ? `${heroName(hero)} — ${seatedEffectSummary(state, seat) ?? ''}`
        : unlocked ? t('ascent.lane.seatEmpty') : t('ascent.lane.seatLocked'),
      border: hero ? INK_UI.jade : unlocked ? INK_UI.gold : INK_UI.softBrush,
      muted: !unlocked,
      onTap: () => showSeatPicker(self, seat),
    };
  })));

  finish();
}

/** Who takes this seat. Confirmed; the sitter can also be sent back to the bench. */
export function showSeatPicker(self: ConquestUIScene, seat: CourtPositionId): void {
  const state = self.state;
  const sitter = state.heroes.find((candidate) => candidate.id === state.court.seats[seat]);
  const seatName = getCourtPositionLabel(seat);
  const back = () => self.replaceLanePage(() => showCourtScreen(self));
  self.showHeroPicker({
    title: t('ascent.pick.title.court', { seat: seatName }),
    rows: buildHeroPickerRows(state, { kind: 'court', seat }),
    confirm: (row) => ({
      title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role: t('ascent.pick.role.court', { seat: seatName }) }),
      lines: [
        row.effectLine,
        sitter && sitter.id !== row.hero.id ? t('ascent.pick.replaces', { hero: heroName(sitter) }) : '',
      ],
    }),
    onPick: (heroId) => {
      self.events.emit('ui:ascent-assign', { heroId, optionId: `court:${seat}` });
      back();
    },
    onBack: back,
    extra: sitter
      ? {
          title: t('ascent.pick.vacant'),
          subtitle: t('ascent.pick.vacantBody', { hero: heroName(sitter) }),
          onTap: () => {
            self.events.emit('ui:ascent-assign', { heroId: sitter.id, optionId: 'reserve' });
            back();
          },
        }
      : undefined,
  });
}
