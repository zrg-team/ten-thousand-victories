/**
 * The Build lane and the Ledger lane — Xây Dựng and Sổ Thu Chi.
 *
 * Claims and the province grid; behind each tile the province sheet — status, governor, focus,
 * what can be built or upgraded, and whatever a story has to offer there. The books live here too
 * because the ledger's shortfall rows open that same sheet: a province going without is reached
 * from the symptom rather than from the map.
 *
 * Each page inside a lane must destroy `self.activeScrollAreas` and clear `modalLayer` before it
 * repaints — `promptFrame` only ever adds. Skip that and the new page stacks on the old one, its
 * dead scroll area's global wheel handler still hooked to the scene.
 */
import { PLAYER_KINGDOM_ID } from '../../../game/constants';
import { buildAllConquestTargets, methodActorLine } from '../../../systems/ascent/ConquestSystem';
import {
  cancelAcquisition,
  claimBlockedReason,
  getClaimRefund,
  getClaimSlots,
} from '../../../systems/AcquisitionSystem';
import {
  buildDistrictBuilding,
  getBuildOptions,
  getLandPopulationGrowth,
  getUpgradeOptions,
  landPopulationCapacity,
  setLandSpecialization,
  upgradeDistrictBuilding,
} from '../../../systems/ResourceSystem';
import {
  ASCENT_MILITIA_REGROW_DELAY, GARRISON_RECOVER_SEASONS, RETAKE_BONUS_WAVES, RETAKE_POWER_BONUS,
} from '../../../game/ascentConfig';
import { wallManning } from '../../../systems/WarSystem';
import { hostileClaimAt } from '../../../systems/LandSystem';
import { STORE_KEYS, saleQuote, sellStores, storeWasteFrom } from '../../../systems/ascent/GranarySystem';
import { STORE_WASTE_RATE } from '../../../game/ascentConfig';
import { buildFocusRows, focusTitle } from '../../../ui/focusPanel';
import { buildGovernorRows } from '../../../ui/governorPanel';
import { buildHeroPickerRows } from '../../../ui/heroPickerRows';
import { compactNumber } from '../../../utils/format';
import { isMarked, openingFor, takeOpening } from '../../../systems/story/StorySystem';
import { storyText } from '../../../i18n/story';
import { INK_UI } from '../../../ui/InkUI';
import { buildingLabel, heroName, resourceLabel, t } from '../../../i18n';
import { RESOURCE_ICON, resourceChips, seasonsChip } from '../../../ui/costChips';
import type { AscentLane, AscentLedgerLine } from '../../../state/types';
import { heroStatLine } from '../constants';
import { clearLanePage } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';


// ── Bar screens ───────────────────────────────────────────────────────────
//
// The same five screens the classic modes reach from their action bar, rebuilt on this
// scene's card components against the same systems. The autopilot still runs everything
// between decisions; these exist so the player can *overrule* it at any moment rather than
// waiting for a card to offer the choice.

/** The sheet's claim button: one full button row, the same height as the tax dial's rows. */
const CLAIM_ACTION_HEIGHT = 44;

/** Build / upgrade a district by hand, ahead of whatever the autopilot would have picked. */
export function showBuildScreen(self: ConquestUIScene): void {
  const state = self.state;
  const lands = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .sort((a, b) => Number(b.id === state.ascent?.capitalLandId) - Number(a.id === state.ascent?.capitalLandId));
  // Read once, ahead of the frame: the sheet's action and the page's own claim row both say
  // the same thing about the same provinces, and two readings could disagree by a tick.
  const targets = buildAllConquestTargets(state);
  const openTargets = targets.filter(
    (target) => target.methods.some((method) => !method.blockedReason),
  );
  const claimBlocked = claimBlockedReason(state);
  /**
   * **The browser opens whenever anything can be done, not only when an envoy is free.**
   *
   * This used to be `!claimBlocked && openTargets.length > 0`, which shut the door on the whole
   * screen the moment the realm's claim parties were committed — including on provinces a host
   * could have marched onto that same season, since siege and occupation spend no claim slot.
   * Reported as the other half of "the limit blocks in some menus but not others": the player was
   * refused here and then took the province straight off the map, and neither screen said why.
   *
   * `openTargets` already asks the right question — it counts provinces with *any* unblocked
   * method, and `buildMethodOptions` has stamped the cap onto the envoy rows before we see them.
   * So the cap still greys every envoy inside the browser; it just no longer hides the door.
   */
  const canClaim = openTargets.length > 0;
  /**
   * What the claim control says, computed once for both the page row and the sheet's footer.
   *
   * This file's standing rule is that those two "say the same thing about the same provinces, and
   * two readings could disagree by a tick" — they had drifted into two expressions of it, and only
   * one of them mentioned the cap.
   */
  const claimActionHint = openTargets.length === 0
    ? claimBlocked ?? t('ascent.claim.startNone')
    // Both facts, when both are true: the envoys are spoken for, and there are still N ways in.
    // Printing only the first reads as "nothing can be done" under a control that opens.
    : claimBlocked
      ? `${claimBlocked} · ${t('ascent.claim.startHint', { n: openTargets.length })}`
      : t('ascent.claim.startHint', { n: openTargets.length });
  const { addRow, addHeading, addWidget, finish } = self.laneList(
    t('action.build'),
    t('ascent.screen.buildBody', { lands: lands.length }),
    {
      // The sheet carries the page's one action, the way the court's sheet carries the tax dial
      // and the course: *"the Build page's sheet must have an action, like the court's"*. It opens
      // the provinces in reach, ordered by what the realm can actually do about each of them now.
      footerWidget: {
        height: CLAIM_ACTION_HEIGHT,
        build: (holder, width) => {
          holder.add(self.ui.button(
            { x: 0, y: 0, width, height: CLAIM_ACTION_HEIGHT },
            `${t('ascent.claim.start')} · ${claimActionHint}`,
            () => { if (canClaim) showClaimTargets(self); },
            { variant: canClaim ? 'primary' : 'disabled', fontSize: '13px' },
          ));
        },
      },
      footerToggle: {
        label: t('ascent.claim.autoAsk'),
        hint: t((state.ascent?.autoClaimSilently ?? false)
          ? 'ascent.claim.autoSilentHint'
          : 'ascent.claim.autoAskHint'),
        checked: !(state.ascent?.autoClaimSilently ?? false),
        onToggle: () => {
          if (state.ascent) state.ascent.autoClaimSilently = !(state.ascent.autoClaimSilently ?? false);
          self.replaceLanePage(() => showBuildScreen(self));
          self.refresh();
        },
      },
    },
  );

  // Claims live at the top of this screen because taking ground and developing it are the same
  // decision — what the realm should spend its next season on. They were previously reachable
  // only by tapping a province on the map and finding the inspect card's "Claim this" button,
  // which meant the cap, the progress and the option to call one off had nowhere to live.
  const claims = state.acquisitionOrders.filter((order) => order.buyerId === PLAYER_KINGDOM_ID);
  const slots = getClaimSlots(state);
  addHeading(
    t('ascent.claim.heading', { used: claims.length, cap: slots }),
    t('ascent.claim.headingHint'),
  );

  for (const order of claims) {
    const target = state.lands.find((candidate) => candidate.id === order.landId);
    addRow(
      {
        title: target?.name ?? order.landId,
        subtitle: t('ascent.claim.row', {
          method: t(`ascent.claim.method.${order.method}` as Parameters<typeof t>[0]),
          progress: Math.round(order.progress),
          required: Math.round(order.required),
        }),
        border: INK_UI.gold,
      },
      () => showClaimDetail(self, order.landId),
    );
  }

  // **The row is shut only when there is genuinely nothing to do.**
  //
  // Three readings have stood here. First "is any province within reach", which left the row
  // tappable at the cap and led to a browser where every method was greyed. Then "is any method
  // open", which was closer. Then "is an envoy free", which over-corrected: siege and occupation
  // spend no claim slot, so that reading hid provinces a host could have marched on that same
  // season — and the player, refused here, took one straight off the map instead. A limit that
  // blocks in one screen and not another teaches nothing; it just looks broken.
  //
  // So: the row opens whenever any way in exists, and the *subtitle* carries the cap. The rule
  // the whole screen is teaching is that envoys and coin are capped and a host is not, and the
  // player should be able to read that off this one line.
  addRow(
    {
      title: t('ascent.claim.start'),
      subtitle: claimActionHint,
      border: canClaim ? INK_UI.jade : INK_UI.softBrush,
      muted: !canClaim,
    },
    canClaim ? () => showClaimTargets(self) : undefined,
  );

  // **Every province opens, always.**
  //
  // This row used to pass no handler at all while a building was going up — `order ? undefined :
  // …` — on the reasoning that there is nothing to build while something is already being built.
  // That reasoning is about one third of the screen behind it. The province sheet is also where
  // the focus is set and where a governor is posted, and neither of those has anything to do with
  // the build queue. A realm whose provinces happened to be under construction — which is the
  // normal state of a working realm, and is *guaranteed* early on when the autopilot has just
  // filed an order on each — found the entire Build page inert, with no way to tell that the rows
  // were disabled rather than the game broken.
  //
  // The order is worth showing, so it stays in the subtitle. It is not worth locking the door.
  addHeading(t('land.section.holdings'));
  // A province is a name and one line of state — two of them fit across the sheet, and a realm of
  // eight provinces is a page you look at instead of a page you scroll. Full-width cards spent
  // the whole width on a four-word name.
  addWidget(0, (parent, width) => self.actionTiles(parent, width, lands.map((land) => {
    const order = state.buildOrders.find((candidate) => candidate.landId === land.id);
    return {
      title: land.id === state.ascent?.capitalLandId ? t('ascent.build.capital', { land: land.name }) : land.name,
      note: order
        ? t('ascent.screen.building', { n: Math.max(0, order.required - order.progress) })
        : t('ascent.screen.slots', {
            used: land.buildings.length,
            cap: land.buildingCapacity,
            defense: land.defense,
          }),
      border: land.id === state.ascent?.capitalLandId ? INK_UI.cinnabar : order ? INK_UI.gold : INK_UI.jade,
      onTap: () => showBuildOptions(self, land.id),
    };
  })));
  self.addStoryOpening('treasury', undefined, addHeading, addRow);

  finish();
}

/**
 * The provinces within reach, as a lane browser.
 *
 * Tapping one emits `ui:ascent-conquer` — the same event the map's inspect card raises — so the
 * method sheet behind it is the existing one rather than a second copy of it.
 */
export function showClaimTargets(self: ConquestUIScene): void {
  const state = self.state;
  clearLanePage(self);

  // The whole border, not the card prompt's short hand: a province left off this list did not
  // exist to the player. Open provinces first, then by odds — the same order as before.
  // What the realm can do about each province *now* decides the order: the ones with an open way
  // in first, the surest way first among those, and the ones nothing can reach at the foot. A
  // list in map order made the player read every row to find the one worth pressing.
  const targets = buildAllConquestTargets(state).slice().sort((a, b) => {
    const bestOf = (target: typeof a): number => Math.max(0, ...target.methods
      .filter((method) => !method.blockedReason).map((method) => method.chance));
    return bestOf(b) - bestOf(a);
  });
  const { addRow, finish } = self.laneList(t('ascent.claim.start'), `${t('ascent.claim.headingHint')}\n${t('ascent.claim.count', { n: targets.length })}`,
    { back: () => self.replaceLanePage(() => showBuildScreen(self)) },
  );

  for (const target of targets) {
    const open = target.methods.filter((method) => !method.blockedReason);
    const best = open.slice().sort((a, b) => b.chance - a.chance)[0];
    const actor = best ? methodActorLine(state, best) : undefined;
    const bestLine = best
      ? t('ascent.claim.bestWay', {
          method: t(`ascent.method.${best.method}` as Parameters<typeof t>[0]),
          actor: actor ? actor.split(' — ')[0] : t('ascent.conquer.actorNone'),
        })
      : '';
    addRow(
      {
        title: target.landName,
        subtitle: `${open.length > 0 ? t('ascent.conquer.ways', { n: open.length }) : target.busyReason ?? t('ascent.conquer.noWay')}  ·  ${t('ascent.march.garrison', { value: target.garrison })}${
          target.suits ? `  ·  ${t('ascent.conquer.suits', { focus: focusTitle(state, target.suits.focus), pct: target.suits.pct })}` : ''
        }${bestLine ? `\n${bestLine}` : ''}`,
        border: open.length > 0 ? INK_UI.jade : INK_UI.softBrush,
        muted: open.length === 0,
      },
      () => {
        self.closeLane();
        self.events.emit('ui:ascent-conquer', target.landId);
      },
    );
  }

  finish();
}

/**
 * One claim in progress, and the option to call it off.
 *
 * The refund is stated before the tap, not after, because it is usually nothing — a bribe's gold
 * is already in the noble's hands and settlers have already left — and a player who is not told
 * that will read a cancel button as a full undo.
 */
function showClaimDetail(self: ConquestUIScene, landId: string): void {
  const state = self.state;
  const order = state.acquisitionOrders.find(
    (candidate) => candidate.landId === landId && candidate.buyerId === PLAYER_KINGDOM_ID,
  );
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!order || !land) return;

  clearLanePage(self);

  const { addRow, finish } = self.laneList(
    land.name,
    t('ascent.claim.row', {
      method: t(`ascent.claim.method.${order.method}` as Parameters<typeof t>[0]),
      progress: Math.round(order.progress),
      required: Math.round(order.required),
    }),
    { back: () => self.replaceLanePage(() => showClaimTargets(self)) },
  );

  const refund = getClaimRefund(state, order);
  const refundChips = resourceChips(refund);
  addRow(
    {
      title: t('ascent.claim.cancel'),
      subtitle: refundChips.length > 0
        ? t('ascent.claim.cancelRefundChips')
        : t('ascent.claim.cancelNothing'),
      costs: refundChips,
      border: INK_UI.cinnabar,
    },
    () => {
      cancelAcquisition(state, landId);
      self.replaceLanePage(() => showBuildScreen(self));
      // The refund has to be repainted from here, because nothing else will: opening a lane
      // holds the world, and a held world never emits `state-changed` — the one signal that runs
      // `refresh` behind an open overlay. Without this the supplies figure the sheet just
      // promised sits unmoved in the strip above until the player closes the lane.
      self.refresh();
    },
  );

  finish();
}

/** The options for one district: every build and upgrade it admits, priced. */
export function showBuildOptions(self: ConquestUIScene, landId: string): void {
  const state = self.state;
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land) return;

  clearLanePage(self);

  const { addRow, addHeading, finish } = self.laneList(
    // The mark. One glyph, and the only signal a story ever gives about a subject: something
    // has taken an interest here. It says nothing at all about what that something wants.
    land.id === state.ascent?.capitalLandId ? t('ascent.build.capital', { land: land.name })
      : land.name,
    t('ascent.screen.slots', { used: land.buildings.length, cap: land.buildingCapacity, defense: land.defense }),
    { back: () => self.replaceLanePage(() => showBuildScreen(self)),
      titleIcon: isMarked(state, 'land', land.id) ? 'scroll' : undefined },
  );

  // Closing re-runs `refresh`, which repaints the resource bar and the bar's status dots
  // against the order just filed — so there is nothing else to notify.
  const act = (run: () => boolean) => {
    if (run()) self.closeLane();
  };

  // ── Status: what the province is worth, before anything is decided about it ──
  //
  // The sheet opened straight onto controls and never said what the place *was*. A player asked
  // to choose a focus for a province could not see what that province currently produced, which
  // is the one number the choice is made against.
  addHeading(t('land.section.status'));
  const outputs = land.outputs;
  const growth = getLandPopulationGrowth(state, land);
  /**
   * What this district is short of, when it is short of something.
   *
   * Both notes are new consequences and both are invisible without a line saying so. A wave held
   * now costs the walls masonry that takes seasons to replace, and the militia does not begin
   * raising again the moment the levy walks home — so a player reading a lower defence figure than
   * they remember has to be told it is a breach being rebuilt rather than a number that changed on
   * its own. See `dissolveGarrisonLevies` and `repairProvincialDefence`.
   */
  const notes: string[] = [];
  if (state.gameMode === 'ascent') {
    // First, above everything else the district has to say about itself: the walls are carried and
    // there is a clock running. Every order on this page is refused while it runs (`getBuildOptions`),
    // so without the line the sheet is a wall of blockers with no stated cause.
    const claim = hostileClaimAt(state, land.id);
    if (claim) {
      notes.push(t('ascent.falling.underClaim', {
        land: land.name,
        ticks: Math.max(0, claim.required - claim.progress),
      }));
    }
    notes.push(t('ascent.land.peopleCap', {
      held: Math.round(land.population),
      cap: landPopulationCapacity(state, land),
    }));
    const breach = Math.round(land.wallsBreached ?? 0);
    if (breach > 0) notes.push(t('ascent.land.wallsBreached', { n: breach }));
    // The fight burnt the district, and the walls need people behind them — both new
    // consequences, both invisible without a line. See `RestoreSystem` and `wallManning`.
    const ruins = land.ruins?.length ?? 0;
    if (ruins > 0) notes.push(t('ascent.land.ruins', { n: ruins }));
    const manned = wallManning(state, land);
    if (manned < 0.995) notes.push(t('ascent.land.wallsUnmanned', { pct: Math.round(manned * 100) }));
    // The clock, on the sheet the player is standing on when they decide whether to buy another
    // course of wall or go and raise a host. It is the whole choice this round rebalanced.
    if (land.siege) notes.push(t('ascent.land.underSiege', { ticks: land.siege.ticksLeft }));
    const spent = land.garrisonExhaustion ?? 0;
    if (spent > 0.005) {
      notes.push(t('ascent.land.garrisonSpent', {
        pct: Math.round(spent * 100),
        n: Math.ceil(spent * GARRISON_RECOVER_SEASONS),
      }));
    }
    const lostAt = land.lostAtWave;
    if (lostAt !== undefined && state.ascent) {
      const elapsed = state.ascent.wave - lostAt;
      if (elapsed >= 0 && elapsed < RETAKE_BONUS_WAVES) {
        notes.push(t('ascent.land.retakeWindow', {
          pct: Math.round(RETAKE_POWER_BONUS * (1 - elapsed / RETAKE_BONUS_WAVES) * 100),
        }));
      }
    }
    const rested = state.turn - (land.levyReturnedTurn ?? -ASCENT_MILITIA_REGROW_DELAY);
    if (rested < ASCENT_MILITIA_REGROW_DELAY) {
      notes.push(t('ascent.land.militiaResting', { n: ASCENT_MILITIA_REGROW_DELAY - rested }));
    }
  }
  addRow({
    title: t('land.status.people', { people: Math.round(land.population), growth }),
    subtitle: [
      t('land.status.hold', {
        defense: Math.round(land.defense),
        loyalty: Math.round(land.loyalty),
      }),
      ...notes,
    ].join('\n'),
    // What the province pays, per season, in the header strip's own glyphs — three figures the
    // player weighs against the treasury and against the province they read a moment ago, which
    // is exactly what a sentence is bad for.
    costsLabel: t('land.status.yieldLabel'),
    costs: resourceChips({
      food: Math.round(outputs?.food ?? 0),
      supplies: Math.round(outputs?.supplies ?? 0),
      gold: Math.round(outputs?.gold ?? 0),
    }),
    border: INK_UI.jade,
  });

  // What the province is already doing, if anything. Shown here so a player arriving at a
  // province mid-build is told why the build rows below are greyed, rather than left to guess.
  const buildOrder = state.buildOrders.find((candidate) => candidate.landId === land.id);
  if (buildOrder) {
    addRow({
      title: t('ascent.screen.building', { n: Math.max(0, buildOrder.required - buildOrder.progress) }),
      subtitle: t('ascent.screen.buildingHint'),
      border: INK_UI.gold,
      muted: true,
    });
  }

  // ── Assignment ──
  //
  // Who holds the province. Neither this nor the focus below was reachable in this mode at all:
  // Dragon Ascent never imported the specialization API, so every province in a run stayed on
  // `balanced` forever, and a champion could be summoned but never posted to a district. The row
  // opens a picker rather than posting anyone itself — it used to assign `idleHeroes[0]`, the
  // first idle hero in state order, which is not a choice the player was making.
  addHeading(t('land.section.assignment'));
  const governor = state.heroes.find((candidate) => candidate.assignedTo === land.id);
  const candidates = buildGovernorRows(state, land);
  addRow(
    {
      title: governor ? t('focus.governor', { hero: heroName(governor) }) : t('gov.none'),
      subtitle: governor ? heroStatLine(governor) : t('gov.noneHint'),
      border: governor ? INK_UI.gold : candidates.length > 0 ? INK_UI.cinnabar : INK_UI.softBrush,
      muted: !governor && candidates.length === 0,
      // The seat is drawn either way: a face when it is held, a dashed frame with the person
      // glyph when it is not. Vacant, this row is the page's one open post, and it used to be
      // the flattest card on it.
      portrait: governor,
      vacantFace: !governor,
    },
    candidates.length > 0 ? () => showGovernorPicker(self, land.id) : undefined,
  );

  addHeading(t('land.section.focus'), t('focus.headingHint'));
  for (const row of buildFocusRows(state, land)) {
    addRow(
      {
        title: row.isBest ? `${row.title}  ·  ${t('focus.best')}` : row.title,
        // The martial focuses pay outside the resource bag, so their tilt line alone reads as a
        // pure loss; `extra` is what they actually buy, and is empty for the economic focuses.
        subtitle: `${row.extra ? `${row.extra}\n` : ''}${row.suitLine}`,
        // The tilt, in glyphs and in the colour of its direction: six focuses each printed the
        // same three resource names, so a column of them was eighteen words to read before three
        // numbers could be found. Above one is green, below one red.
        costs: (['food', 'supplies', 'gold'] as const).map((key) => ({
          icon: RESOURCE_ICON[key],
          value: `×${row.mult[key].toFixed(2)}`,
          label: resourceLabel(key),
          tone: row.mult[key] > 1.005 ? INK_UI.jade : row.mult[key] < 0.995 ? INK_UI.cinnabar : INK_UI.softBrush,
        })),
        border: row.isCurrent
          ? INK_UI.gold
          : row.suitability === 'high' ? INK_UI.jade : INK_UI.softBrush,
        muted: row.suitability === 'low' && !row.isCurrent,
      },
      row.isCurrent ? undefined : () => act(() => setLandSpecialization(state, land.id, row.focus)),
    );
  }

  addHeading(t('land.section.build'));
  for (const option of getBuildOptions(state, land)) {
    addRow(
      {
        title: option.label,
        // The price is chips, not prose — and a barred row keeps its price, in the refusal's
        // own ink, so the player can see what it would have cost as well as why it cannot.
        subtitle: option.canBuild ? '' : option.reason ?? '',
        costs: [
          ...resourceChips(option.cost, option.canBuild ? undefined : INK_UI.cinnabar),
          ...(option.ticks > 0 ? [seasonsChip(option.ticks, option.canBuild ? undefined : INK_UI.cinnabar)] : []),
        ],
        border: option.canBuild ? INK_UI.jade : INK_UI.softBrush,
        muted: !option.canBuild,
      },
      option.canBuild ? () => act(() => buildDistrictBuilding(state, land.id, option.type)) : undefined,
    );
  }

  for (const option of getUpgradeOptions(state, land)) {
    addRow(
      {
        title: t('ascent.screen.upgrade', { building: buildingLabel(option.type), level: option.level + 1 }),
        subtitle: option.canUpgrade ? '' : option.reason ?? '',
        costs: [
          ...resourceChips(option.cost, option.canUpgrade ? undefined : INK_UI.cinnabar),
          ...(option.ticks > 0 ? [seasonsChip(option.ticks, option.canUpgrade ? undefined : INK_UI.cinnabar)] : []),
        ],
        border: option.canUpgrade ? INK_UI.gold : INK_UI.softBrush,
        muted: !option.canUpgrade,
      },
      option.canUpgrade ? () => act(() => upgradeDistrictBuilding(state, land.id, option.index)) : undefined,
    );
  }

  // ── The offer, if a story has one to make here ──
  //
  // Not a task, not a deadline, not a reward preview. It is the last row of a sheet the player
  // was already looking at, and ignoring it costs nothing and is *also an answer* — in more
  // than one story it is the answer that eventually matters.
  const opening = openingFor(state, 'land', land.id);
  if (opening) {
    addHeading(t('land.section.spokenOf'));
    addRow(
      {
        title: storyText(opening.actionKey, opening.params),
        subtitle: storyText(opening.textKey, opening.params),
        border: INK_UI.gold,
      },
      () => {
        if (takeOpening(state, opening.storyId, opening.fragmentId)) self.closeLane();
      },
    );
  }

  finish();
}

/**
 * Who to post to one province, and why.
 *
 * Best-fit first, with the stat the province actually rewards named on every row — because the
 * answer moves with the focus, and a recommendation the player cannot check is one they cannot
 * learn from. Reuses `assignHeroToLand`, which already handles releasing a previous posting.
 */
/**
 * The focus list on a page of its own, so the map can send the player straight to it.
 *
 * The rows are the same `buildFocusRows` the province sheet prints — one table, so the two screens
 * can never recommend different things — and the page exists because the map's inspect card now
 * offers changing a province's focus as one of its two actions. Reported: a tapped province showed
 * four numbers and afforded nothing, and everything worth doing to it was three taps into a lane.
 */
export function showFocusPicker(self: ConquestUIScene, landId: string): void {
  const state = self.state;
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land) return;

  clearLanePage(self);
  const { addRow, addHeading, finish } = self.laneList(
    t('ascent.pick.title.focus', { land: land.name }),
    t('focus.headingHint'),
    { back: () => self.replaceLanePage(() => showBuildOptions(self, landId)) },
  );

  addHeading(t('land.section.focus'));
  for (const row of buildFocusRows(state, land)) {
    addRow(
      {
        title: row.isBest ? `${row.title}  ·  ${t('focus.best')}` : row.title,
        subtitle: `${row.effect}${row.extra ? `
${row.extra}` : ''}
${row.suitLine}`,
        border: row.isCurrent
          ? INK_UI.gold
          : row.suitability === 'high' ? INK_UI.jade : INK_UI.softBrush,
        muted: row.suitability === 'low' && !row.isCurrent,
      },
      row.isCurrent
        ? undefined
        : () => {
            setLandSpecialization(state, land.id, row.focus);
            self.replaceLanePage(() => showBuildOptions(self, landId));
          },
    );
  }
  finish();
}

export function showGovernorPicker(self: ConquestUIScene, landId: string): void {
  const state = self.state;
  const land = state.lands.find((candidate) => candidate.id === landId);
  if (!land) return;
  const governor = state.heroes.find((candidate) => candidate.assignedTo === land.id);
  const back = () => self.replaceLanePage(() => showBuildOptions(self, landId));
  self.showHeroPicker({
    title: t('ascent.pick.title.governor', { land: land.name }),
    subtitle: t('gov.headingHint'),
    rows: buildHeroPickerRows(state, { kind: 'governor', landId }),
    confirm: (row) => ({
      title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role: t('ascent.pick.role.governor', { land: land.name }) }),
      lines: [
        row.effectLine,
        governor && governor.id !== row.hero.id ? t('ascent.pick.replaces', { hero: heroName(governor) }) : '',
      ],
    }),
    onPick: (heroId) => {
      self.events.emit('ui:ascent-assign', { heroId, optionId: `governor:${landId}` });
      back();
    },
    onBack: back,
    // Recalling the governor has to be reachable from the same screen that posted them, or a
    // bad posting is permanent until another province is found to take them.
    extra: governor
      ? {
          title: t('ascent.pick.recall'),
          subtitle: t('ascent.pick.recallBody', { hero: heroName(governor), land: land.name }),
          onTap: () => {
            self.events.emit('ui:ascent-assign', { heroId: governor.id, optionId: 'reserve' });
            back();
          },
        }
      : undefined,
  });
}

/**
 * Sổ Thu Chi — the realm's books: gross, demand and net for every resource, then the
 * provinces currently going without.
 *
 * This screen is what turns demand from a tax into a game. The header has only ever shown
 * one net figure per resource, so a player had no way to learn *why* it moved — and a
 * pressure the player cannot read is a pressure they cannot manage. Reached by tapping the
 * resource strip: the place a player already looks when they want to know about resources.
 */
export function showLedgerScreen(self: ConquestUIScene): void {
  const state = self.state;
  const ledger = state.ascentLedger;
  const { addRow, addHeading, addWidget, finish } = self.laneList(
    t('ascent.ledger.title'),
    t('ascent.ledger.body', {
      lands: state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length,
      people: compactNumber(Math.round(state.resources.humans)),
    }),
  );

  if (!ledger) {
    addRow({ title: t('ascent.ledger.notYet'), subtitle: '', border: INK_UI.softBrush, muted: true });
    finish();
    return;
  }

  // The three flows, side by side rather than three headings each carrying one card.
  //
  // They are the same shape and they are read against each other — which is a comparison, and a
  // comparison belongs on one line. A heading per resource made each of them look like a section
  // of its own, and the page opened with three quarters of its height spent saying three numbers.
  // Signs are formatted here, not in the template: gross can itself go negative (three
  // withholding provinces can outweigh the paying ones), and a hardcoded '+' printed the
  // nonsense "In +-8".
  const flow = (key: 'food' | 'supplies' | 'gold', line: AscentLedgerLine) => {
    const gross = Math.round(line.gross);
    const demand = Math.round(line.demand);
    const net = Math.round(line.net);
    return {
      // `resourceLabel` is written for mid-sentence use and comes back lowercase; at the head of
      // a tile it is a name.
      title: `${resourceLabel(key).charAt(0).toLocaleUpperCase()}${resourceLabel(key).slice(1)}  ${net >= 0 ? `+${net}` : net}`,
      // The same glyph the header strip spends on this resource, so the tile and the running
      // total above it are visibly the same thing.
      icon: RESOURCE_ICON[key],
      note: t('ascent.ledger.line', {
        gross: gross >= 0 ? `+${gross}` : `${gross}`,
        demand: `−${Math.abs(demand)}`,
      }),
      border: net >= 0 ? INK_UI.jade : INK_UI.cinnabar,
    };
  };
  addWidget(0, (parent, width) => self.actionTiles(parent, width, [
    flow('food', ledger.food),
    flow('supplies', ledger.supplies),
    flow('gold', ledger.gold),
  ]));

  // The stores: what would rot, sold through the markets. One row a store, the sale on the tap
  // and the waste line under it, so a granary reading sixty thousand is a number with a verb next
  // to it rather than a scoreboard. See `GranarySystem`.
  addHeading(t('ascent.ledger.stores'));
  for (const key of STORE_KEYS) {
    const quote = saleQuote(state, key);
    const name = resourceLabel(key);
    const wasted = ledger.waste?.[key] ?? 0;
    const body = `${t('ascent.ledger.sellBody', {
      capacity: quote.capacity,
      from: compactNumber(storeWasteFrom(state, key)),
      rate: Math.round(STORE_WASTE_RATE * 100),
    })}${wasted > 0 ? `\n${t('ascent.ledger.wasted', { n: wasted })}` : ''}`;
    if (quote.blocked) {
      const why = quote.blocked === 'no-market'
        ? t('ascent.ledger.sellNoMarket', { resource: name })
        : quote.blocked === 'sold'
          ? t('ascent.ledger.sellDone', { resource: name })
          : t('ascent.ledger.sellNothing', { resource: name });
      addRow({ title: why, subtitle: body, border: wasted > 0 ? INK_UI.cinnabar : INK_UI.softBrush, muted: true });
      continue;
    }
    addRow(
      {
        title: t(quote.thin ? 'ascent.ledger.sellThin' : 'ascent.ledger.sell', { units: quote.units, resource: name, gold: quote.gold }),
        subtitle: body,
        border: wasted > 0 ? INK_UI.cinnabar : INK_UI.jade,
      },
      () => {
        if (sellStores(state, key)) self.replaceLanePage(() => showLedgerScreen(self));
      },
    );
  }

  // Where the gold goes, by name. One figure for "out" told nobody why the treasury moved; the
  // categories say what is eating it and open the screen where it can be answered.
  const parts = ledger.goldParts;
  if (parts) {
    addHeading(t('ascent.ledger.where'));
    const troops = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy)
      .reduce((n, army) => n + army.units.spearmen + army.units.archers + army.units.heavyInfantry, 0);
    const lands = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
    const rows: Array<{ title: string; subtitle: string; lane?: AscentLane; n: number }> = [
      { title: t('ascent.ledger.cat.payroll', { n: parts.payroll }), subtitle: t('ascent.ledger.cat.payrollBody', { heroes: state.heroes.length }), lane: 'heroes', n: parts.payroll },
      { title: t('ascent.ledger.cat.hosts', { n: parts.hosts }), subtitle: t('ascent.ledger.cat.hostsBody', { troops }), lane: 'army', n: parts.hosts },
      { title: t('ascent.ledger.cat.wages', { n: parts.wages }), subtitle: t('ascent.ledger.cat.wagesBody', { lands }), lane: 'build', n: parts.wages },
      { title: t('ascent.ledger.cat.buildings', { n: parts.buildings }), subtitle: '', lane: 'build', n: parts.buildings },
      { title: t('ascent.ledger.cat.graft', { n: parts.graft }), subtitle: '', n: parts.graft },
      { title: t('ascent.ledger.cat.softcap', { n: parts.softcap }), subtitle: '', n: parts.softcap },
    ];
    const biggest = Math.max(...rows.map((row) => row.n));
    addWidget(0, (parent, width) => self.actionTiles(parent, width, rows.filter((row) => row.n > 0).map((row) => ({
      title: row.title,
      note: row.subtitle,
      border: row.n === biggest ? INK_UI.cinnabar : INK_UI.softBrush,
      onTap: row.lane ? () => { const lane = row.lane!; self.closeLane(); self.openLane(lane); } : undefined,
    }))));
    if (parts.withheld > 0) {
      addRow({ title: t('ascent.ledger.withheld', { n: parts.withheld }), subtitle: '', border: INK_UI.softBrush, muted: true });
    }
  }

  if (ledger.shortfalls.length > 0) {
    addHeading(t('ascent.ledger.shortfalls'));
    for (const shortfall of ledger.shortfalls) {
      const land = state.lands.find((candidate) => candidate.id === shortfall.landId);
      if (!land) continue;
      addRow(
        {
          title: `${land.name} · ${t(`ascent.ledger.short.${shortfall.kind}` as Parameters<typeof t>[0])}`,
          subtitle: t('ascent.ledger.since', { n: Math.max(1, state.turn - shortfall.sinceTurn) }),
          border: INK_UI.cinnabar,
        },
        () => showBuildOptions(self, land.id),
      );
    }
  }

  finish();
}
