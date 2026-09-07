/**
 * The Army lane: its front page, and the sheet for one host.
 *
 * `showArmyScreen` is what the Army button opens — defence against threat, the war as it stands
 * (the live battle, every invader we can see, our own sieges, the front), musters under way, and
 * a row per standing host. `showArmyDetail` is where a host row leads and where every order is
 * given, so it belongs here: it is that list's tap target, and each order it issues redraws by
 * calling it again.
 *
 * Neither page runs on a clock — `refresh` leaves a non-battle lane alone — so anything that
 * lands back on one must tear the old page down first, as `showArmyDetail` does at its head.
 */
import { PLAYER_KINGDOM_ID } from '../../../game/constants';
import { isBossWave } from '../../../systems/ascent/WaveDirector';
import { buildAllConquestTargets, frontWinChance } from '../../../systems/ascent/ConquestSystem';
import { landGarrisonPower } from '../../../systems/ascent/PowerSystem';
import {
  armyPower,
  getArmyUpgradeOptions,
  musterLimit,
  reinforcementLimit,
  reinforcementTicks,
  upgradeArmy,
} from '../../../systems/WarSystem';
import { getCourtBonuses } from '../../../systems/CourtSystem';
import {
  reinforcementCandidates,
  reinforcementsEnRoute,
  sendReinforcement,
} from '../../../systems/ascent/reinforcement';
import { ascentArmyUpkeep, getPlayerTroops } from '../../../systems/ResourceSystem';
import { findFreeCommander } from '../../../systems/ascent/AutopilotSystem';
import { armyOrders, hostOrderLabel, isAutoHost } from '../../../systems/ascent/armyOrders';
import { resupplyPreview } from '../../../systems/ascent/StandingOrders';
import { focusBattle, liveBattles } from '../../../systems/ascent/fronts';
import { musterRows } from '../../../systems/ascent/MusterSystem';
import {
  ARMY_REINFORCE_GOLD_PER_SOLDIER,
  ARMY_REINFORCE_MIN_SOLDIERS,
  MIN_ARMY_SOLDIERS,
  RECRUIT_HUMAN_RESERVE,
  REMNANT_SHARE,
  recruitSoldiers,
} from '../../../game/ascentConfig';
import { INK_UI, INK_UI_HEX } from '../../../ui/InkUI';
import { UI_FONT } from '../../../ui/fonts';
import { formatResourceList, heroName, t } from '../../../i18n';
import type { ArmyOrders, InvasionRecord } from '../../../state/types';
import { ARMY_RATION_USE_PER_100 } from '../../../game/gameplayConfig';
import { cssHex, hostSize, visibleHostileHosts } from '../constants';
import { showHunters } from './armyTargets';
import { clearLanePage } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';


/** Standing hosts, and the levy the player can raise without waiting for the autopilot. */
export function showArmyScreen(self: ConquestUIScene): void {
  const state = self.state;
  const ascent = state.ascent;
  const mine = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
  // What the war is waiting on, most urgent first.
  //
  // A fight already on the ground outranks everything: it is happening whether or not the player
  // looks, and it is the one item here with a clock on it. A host standing without a general is
  // next — it fights at a penalty every round until somebody is put over it — and raising one at
  // all is last, because that is a plan rather than a debt. See the `dock` note in `lanes/frame`.
  const waiting: Array<{ label: string; onPress: () => void }> = [];
  const live = liveBattles(state).filter((battle) => !battle.over);
  if (live.length > 0) {
    const land = state.lands.find((candidate) => candidate.id === live[0].landId);
    waiting.push({
      label: t('ascent.lane.waitBattle', { land: land?.name ?? '' }),
      onPress: () => self.replaceLanePage(() => self.showBattle()),
    });
  }
  const leaderless = mine.find((army) => !army.isLevy && !army.patron && !army.generalHeroId);
  if (leaderless) {
    waiting.push({
      label: t('ascent.lane.waitGeneral', { host: leaderless.name }),
      onPress: () => showArmyDetail(self, leaderless.id),
    });
  }
  if (mine.filter((army) => !army.isLevy && !army.patron).length === 0 && findFreeCommander(state)) {
    waiting.push({
      label: t('ascent.lane.waitHost'),
      onPress: () => self.showRaiseHostForm(),
    });
  }

  const { addRow, addHeading, addNote, addWidget, finish } = self.laneList(
    t('action.army'),
    t('ascent.screen.armyBody', {
      defense: Math.round(ascent?.defensePower ?? 0),
      threat: Math.round(ascent?.threat ?? 0),
    }),
    {
      dock: {
        items: waiting,
        rebuild: () => showArmyScreen(self),
      },
      footerToggle: {
        label: t('ascent.sys.musterAsked'),
        hint: t((ascent?.autoMusterSilently ?? false)
          ? 'ascent.muster.autoSilentHint'
          : 'ascent.muster.autoAskHint'),
        checked: !(ascent?.autoMusterSilently ?? false),
        onToggle: () => {
          if (state.ascent) state.ascent.autoMusterSilently = !(state.ascent.autoMusterSilently ?? false);
          self.replaceLanePage(() => showArmyScreen(self));
          self.refresh();
        },
      },
    },
  );

  // What the realm can bring against what is coming — the comparison the whole screen exists to
  // inform, and previously a subtitle the eye skips on the way to the rows.
  const defence = Math.round(ascent?.defensePower ?? 0);
  const threat = Math.round(ascent?.threat ?? 0);
  const troops = mine.reduce(
    (sum, army) => sum + army.units.spearmen + army.units.archers + army.units.heavyInfantry,
    0,
  );
  addHeading(t('army.section.state'));
  addWidget(0, (parent, width) => self.statPanel(parent, width, [
    {
      label: t('army.stat.defence'),
      value: String(defence),
      accent: threat > defence ? cssHex(INK_UI.cinnabar) : undefined,
    },
    { label: t('army.stat.threat'), value: String(threat) },
    { label: t('army.stat.hosts'), value: String(mine.length) },
    { label: t('army.stat.soldiers'), value: String(troops) },
  ]));

  // The war as it stands. The header strip says how much danger is coming; this section says
  // where it already is: the live battle, each invader the realm can see and what it is
  // marching on, our own sieges, and the front the autopilot is pressing.
  addHeading(t('army.section.war'));
  /**
   * **Every** field, not the one on screen.
   *
   * This row was `ascent.activeBattle` and nothing else, which was true of a war that could only
   * have one field. A general holding a second front is doing the most consequential thing in the
   * realm and the army screen — the screen about where the realm's soldiers are — said nothing
   * about it. Each row is a door: the commanded field opens the fight, a held one walks you onto
   * it first. Ours first, then worst odds; see `liveBattles`.
   */
  const fields = liveBattles(state);
  const commandedLand = ascent?.activeBattle?.landId;
  const battle = fields[0];
  for (const field of fields) {
    const commanded = field.landId === commandedLand;
    addRow(
      {
        title: (commanded ? '▸ ' : '') + t('ascent.war.battleRow', {
          land: field.landName,
          round: field.round,
          total: field.totalRounds,
        }),
        subtitle: t(commanded ? 'ascent.war.battleBody' : 'ascent.war.battleBodyHeld', {
          ours: Math.round(field.ourNow),
          theirs: Math.round(field.theirNow),
          name: field.generalName ?? t('ascent.aftermath.officers'),
        }),
        border: commanded ? INK_UI.cinnabar : INK_UI.gold,
      },
      // Through the lane, not `showBattle` directly: the lane key is what makes `refresh`
      // beat the screen forward, so a battle opened here used to sit frozen at its first frame.
      () => {
        if (!commanded) focusBattle(state, field.landId);
        self.closeLane();
        self.openLane('battle');
      },
    );
  }
  if (battle) {
    // And the question the war section exists to put: who can be sent. Asked of the field the
    // player is standing on — relief marches to one province, not to "the war".
    const relief = reinforcementsEnRoute(state, battle);
    const sendable = reinforcementCandidates(state, battle).filter((row) => !row.blockedReason && !row.enRoute).length;
    addRow(
      {
        title: t('ascent.reinforce.button', { n: sendable }),
        subtitle: relief.hosts > 0
          ? t('ascent.reinforce.coming', { men: relief.men, n: relief.etaTicks === Number.POSITIVE_INFINITY ? 0 : relief.etaTicks })
          : sendable > 0 ? t('ascent.reinforce.hint') : t('ascent.reinforce.nobody'),
        border: sendable > 0 ? INK_UI.jade : INK_UI.softBrush,
        muted: sendable === 0,
      },
      sendable > 0
        ? () => self.showReinforcePicker(() => self.replaceLanePage(() => showArmyScreen(self)))
        : undefined,
    );
  }

  const nextWave = (ascent?.wave ?? 0) + 1;
  const waveTicks = Math.max(0, ascent?.ticksToWave ?? 0);
  const loud = isBossWave(nextWave) || Boolean(ascent?.coalitionPending);
  addNote(
    [
      isBossWave(nextWave)
        ? t('ascent.war.nextWaveBoss', { ticks: waveTicks })
        : t('ascent.war.nextWave', { wave: nextWave, ticks: waveTicks }),
      ascent?.coalitionPending ? t('ascent.war.coalition') : '',
    ].filter(Boolean).join('  ·  '),
    loud ? INK_UI.cinnabar : undefined,
  );

  const planLabel: Record<NonNullable<InvasionRecord['plan']>, string> = {
    spearhead: t('ascent.war.planSpearhead'),
    flanker: t('ascent.war.planFlanker'),
    raider: t('ascent.war.planRaider'),
    hunter: t('ascent.war.planHunter'),
    withdrawing: t('ascent.war.planWithdrawing'),
  };
  let unseen = 0;
  let seen = 0;
  for (const record of state.invasions ?? []) {
    const invader = state.armies.find((candidate) => candidate.id === record.armyId);
    if (!invader) continue;
    const at = state.lands.find((candidate) => candidate.id === invader.landId);
    // Same honesty gate as the hunt list: a host standing in the dark stays a rumour.
    if (!at?.isVisible) {
      unseen += 1;
      continue;
    }
    seen += 1;
    const kingdom = state.kingdoms.find((candidate) => candidate.id === record.kingdomId);
    const target = state.lands.find((candidate) => candidate.id === record.targetLandId);
    const size = hostSize(invader);
    const attack = Math.round(armyPower(state, invader));
    const holding = target
      ? Math.round(
          landGarrisonPower(state, target) +
            mine
              .filter((army) => army.landId === target.id)
              .reduce((sum, army) => sum + armyPower(state, army), 0),
        )
      : 0;
    const withdrawing = record.plan === 'withdrawing';
    // **And every one of them is a door.**
    //
    // These rows were the one part of the war section you could only look at: an invader marching
    // on a province of yours, its strength and the garrison's, and no way to answer it without
    // leaving, guessing which host to open, and finding the hunt list from the other end. A host
    // already fighting opens its field; every other one asks who marches on it.
    const fighting = fields.find((field) => field.landId === invader.landId);
    addRow(
      {
        title:
          (record.great ? t('ascent.war.great') : '') +
          t('ascent.war.invaderRow', { kingdom: kingdom?.name ?? '—', size }),
        subtitle: t('ascent.war.invaderBody', {
          plan: planLabel[record.plan ?? 'spearhead'],
          target: target?.name ?? at.name,
          attack,
          defence: holding,
        }),
        border: withdrawing ? INK_UI.softBrush : INK_UI.cinnabar,
        muted: withdrawing,
      },
      withdrawing ? undefined : fighting
        ? () => {
          if (fighting.landId !== commandedLand) focusBattle(state, fighting.landId);
          self.closeLane();
          self.openLane('battle');
        }
        : () => showHunters(self, invader.id),
    );
  }
  if (unseen > 0) {
    addNote(t('ascent.war.unseenCount', { n: unseen }));
  }

  for (const order of state.siegeOrders.filter((candidate) => candidate.attackerKingdomId === PLAYER_KINGDOM_ID)) {
    const land = state.lands.find((candidate) => candidate.id === order.landId);
    const besieger = state.armies.find((candidate) => candidate.id === order.armyId);
    addRow({
      title: t('ascent.war.siegeRow', {
        land: land?.name ?? '—',
        pct: Math.round((order.progress / Math.max(1, order.required)) * 100),
      }),
      subtitle: besieger ? t('ascent.war.siegeBody', { army: besieger.name }) : '',
      border: INK_UI.gold,
    });
  }

  const front = state.lands.find((candidate) => candidate.id === ascent?.frontLandId);
  if (front) {
    addRow({
      title: t('ascent.war.frontRow', { land: front.name }),
      subtitle: t('ascent.war.frontBody', { pct: Math.round(frontWinChance(state) * 100) }),
      border: INK_UI.jade,
    });
  }

  if (!battle && seen === 0 && unseen === 0) {
    addNote(t('ascent.war.quiet'));
  }

  addHeading(t('army.section.muster'));
  // Every muster under way. `state.recruitmentOrders` was never read by this mode's screens:
  // "raise a host" closed the lane and nothing anywhere said a muster had begun.
  for (const muster of musterRows(state)) {
    const orders = muster.orders;
    const landName = (id: string): string => state.lands.find((land) => land.id === id)?.name ?? '';
    const orderLabel = orders?.kind === 'defend'
      ? t('ascent.orders.defend', { land: landName(orders.landId) })
      : orders?.kind === 'attack'
        ? t('ascent.orders.attack', { land: landName(orders.landId) })
        : orders?.kind === 'follow'
          ? t('ascent.orders.follow', { army: state.armies.find((army) => army.id === orders.armyId)?.name ?? '' })
          : t('ascent.orders.auto');
    addRow({
      title: t('ascent.muster.row', { n: muster.soldiers, land: muster.land?.name ?? '—' }),
      subtitle: t('ascent.muster.body', {
        hero: muster.heroName,
        progress: muster.progress,
        required: muster.required,
        left: Math.max(0, muster.required - muster.progress),
        comp: t(`comp.${muster.composition}` as Parameters<typeof t>[0]),
        order: orderLabel,
      }),
      border: INK_UI.gold,
    });
  }
  const commanderId = findFreeCommander(state);
  const spare = state.resources.humans - RECRUIT_HUMAN_RESERVE;
  const canRaise = state.heroes.length > 0;
  addWidget(0, (parent, width) => self.actionTiles(parent, width, [
    {
      title: t('ascent.screen.raiseHost'),
      note: commanderId && spare >= MIN_ARMY_SOLDIERS
        ? t('ascent.screen.raiseHostBody', { n: Math.min(recruitSoldiers(spare), musterLimit(state)) })
        : commanderId
          ? t('ascent.screen.raiseNoPeople')
          : t('ascent.conquer.needHero'),
      border: canRaise ? INK_UI.jade : INK_UI.softBrush,
      muted: !canRaise,
      onTap: canRaise ? () => self.showRaiseHostForm() : undefined,
    },
  ]));

  // Standing hosts only: a garrison levy is the province's own walls turned out for one
  // battle (see `raiseGarrisonLevy`) — it takes no orders and goes home when the fight ends.
  const hosts = mine.filter((army) => !army.isLevy);
  if (hosts.length > 0) {
    addHeading(t('army.section.hosts'));
  }
  for (const army of hosts) {
    const land = state.lands.find((candidate) => candidate.id === army.landId);
    const general = state.heroes.find((candidate) => candidate.id === army.generalHeroId);
    const size = hostSize(army);
    const remnant = !isAutoHost(army) && size < MIN_ARMY_SOLDIERS * REMNANT_SHARE;
    // A refit outranks the order line: the host is not doing what it was told, it is standing
    // down until the work finishes, and this row is where that has to be readable.
    const statusLine = army.refit
      ? t('ascent.army.refitStatus', {
          action: t(`ascent.army.${army.refit.kind}` as Parameters<typeof t>[0]),
          n: army.refit.ticksLeft,
        })
      : remnant ? t('ascent.orders.remnantRow', { n: size }) : hostOrderLabel(state, army);
    addRow(
      {
        title: `${army.name}  ·  ${size}`,
        subtitle: `${t('ascent.screen.armyRow', {
          land: land?.name ?? '—',
          general: general ? heroName(general) : t('ascent.screen.noGeneral'),
          morale: Math.round(army.morale),
          supply: Math.round(army.supply),
        })}\n${statusLine}`,
        border: army.refit ? INK_UI.gold
          : remnant || army.morale < 40 || army.supply < 30 ? INK_UI.cinnabar : INK_UI.jade,
      },
      () => showArmyDetail(self, army.id),
    );
  }
  self.addStoryOpening('army', undefined, addHeading, addRow);

  finish();
}

/**
 * One host, and what can be done with it.
 *
 * Exists because a shattered army could not be sent home: `disbandArmy` has always worked and
 * the autopilot uses it on remnants, but nothing in this mode's UI ever called it, so a host
 * that had lost its war sat on the map drawing upkeep forever with no way to release it. That
 * matters far more now that upkeep scales with size — a player has to be able to *choose* the
 * treasury over the field, which is the whole point of charging for an army.
 */
export function showArmyDetail(self: ConquestUIScene, armyId: string): void {
  const state = self.state;
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army) return;

  // The lane key stays `lane:army`: giving this page its own key made every `state-changed`
  // (which each order raises) read as "no overlay open" and tear the page down under the tap.
  clearLanePage(self);

  const size = hostSize(army);
  const general = state.heroes.find((candidate) => candidate.id === army.generalHeroId);
  const land = state.lands.find((candidate) => candidate.id === army.landId);

  // A host mid-refit takes no orders at all: every order surface on the page goes quiet together,
  // with the one sentence that says why, rather than each tile inventing its own excuse.
  const locked = Boolean(army.refit);

  // A host detail is a page you read top to bottom and leave, not a page you steer a run from:
  // the whole of it is already a list of orders, so a sheet over it would be a list over a list.
  // It gets the footer every other sub-page has — the way back, and the way out.
  const { addRow, addHeading, addWidget, finish } = self.laneList(
    army.name,
    t('ascent.army.detailBody', {
      land: land?.name ?? '—',
      general: general ? heroName(general) : t('ascent.screen.noGeneral'),
      morale: Math.round(army.morale),
      supply: Math.round(army.supply),
    }),
    { back: () => self.replaceLanePage(() => showArmyScreen(self)) },
  );

  // ── The host ──
  //
  // Everything that describes it, under one heading and in two surfaces instead of three cards:
  // the figures read across a strip, the multipliers that produced the field power sit under it
  // as a line of text, and what the host costs is one line rather than a card of its own. The
  // commander sits here too — who leads is a *fact about the host*, not an order — with the one
  // control that changes it, instead of a full-width card that only says his name.
  const upkeep = ascentArmyUpkeep(state);
  const troops = Math.max(1, getPlayerTroops(state));
  const shareGold = Math.round(upkeep.gold * (size / troops));
  const shareFood = Math.round(upkeep.food * (size / troops));
  const rationRunway = Math.floor((army.rations ?? 0) / Math.max(1, size / 100 * ARMY_RATION_USE_PER_100));
  const starving = (army.rations ?? 0) <= 0;
  const bonuses = getCourtBonuses(state);
  const eliteTier = army.elite ?? 0;
  const multipliers = [
    t('ascent.army.mulLevel', { level: army.level, pct: Math.round(Math.max(0, army.level - 1) * 8) }),
    eliteTier > 0 ? t('ascent.army.mulElite', { tier: eliteTier, pct: Math.round(eliteTier * 18) }) : '',
    general ? t('ascent.army.mulGeneral', { pct: Math.round((general.stats.martial / 100) * 25) }) : '',
    bonuses.armyPowerMult !== 1
      ? t('ascent.army.mulDraft', { pct: Math.round((bonuses.armyPowerMult - 1) * 100) })
      : '',
  ].filter(Boolean);

  addHeading(t('ascent.army.groupHost'));
  addWidget(0, (parent, width) => {
    let y = self.statPanel(parent, width, [
      { label: t('ascent.army.statPower'), value: String(Math.round(armyPower(state, army))) },
      { label: t('ascent.army.statMen'), value: String(size) },
      { label: t('ascent.army.statMorale'), value: String(Math.round(army.morale)) },
      {
        label: t('ascent.army.statSupply'),
        value: String(Math.round(army.supply)),
        accent: starving ? cssHex(INK_UI.cinnabar) : undefined,
      },
    ]);
    const detail = self.add.text(2, y + 5, [
      multipliers.join('  ·  '),
      `${t('ascent.army.upkeepLine', { gold: shareGold, food: shareFood })}  ·  ${
        starving ? t('ascent.army.runwayOut') : t('ascent.army.runwayShort', { ticks: rationRunway })
      }`,
    ].join('\n'), {
      color: starving ? cssHex(INK_UI.cinnabar) : INK_UI_HEX.mutedText,
      fontFamily: UI_FONT,
      fontSize: '9px',
      lineSpacing: 2,
      wordWrap: { width: width - 4 },
    }).setOrigin(0, 0);
    parent.add(detail);
    return y + 5 + detail.height;
  });
  // `addWidget` takes a height up front, which a measured widget cannot know. Rather than change
  // its contract for one caller, the host block is laid out as a row with a portrait — the one
  // shape in the list that already carries a face — and the figures above it are given their own
  // pass. The commander row keeps `addRow` because a face IS the row here.
  addRow(
    {
      title: general ? heroName(general) : t('ascent.army.noCommander'),
      subtitle: t('ascent.orders.commanderBody'),
      border: locked ? INK_UI.softBrush : general ? INK_UI.gold : INK_UI.cinnabar,
      muted: locked,
      portrait: general,
    },
    locked ? undefined : () => self.showCommanderPicker(armyId),
  );

  // ── Orders ──
  //
  // What the host is doing until told otherwise, the one question about how its fights are
  // resolved, and every way to change either. The autopilot used to move and dissolve every
  // host on its own judgement; a host under any order but `auto` is now moved by that order
  // alone (see `StandingOrders`).
  addHeading(t('ascent.orders.heading'));
  const orders = armyOrders(army);
  addWidget(0, (parent, width) => {
    const heading = locked && army.refit
      ? `${t('ascent.army.refitStatus', {
          action: t(`ascent.army.${army.refit.kind}` as Parameters<typeof t>[0]),
          n: army.refit.ticksLeft,
        })}\n${t('ascent.army.refitBusy')}`
      : t('ascent.orders.current', { order: hostOrderLabel(state, army) });
    const line = self.add.text(2, 0, heading, {
      color: locked ? cssHex(INK_UI.gold) : INK_UI_HEX.inkText,
      fontFamily: UI_FONT, fontSize: '12px', fontStyle: '700',
      wordWrap: { width: width - 4 },
    }).setOrigin(0, 0);
    parent.add(line);
    return line.height;
  });

  const command = (next: ArmyOrders): void => {
    self.events.emit('ui:ascent-army-orders', { armyId, orders: next });
    showArmyDetail(self, armyId);
  };
  const defendingHere = orders.kind === 'defend' && orders.landId === army.landId;
  const owned = state.lands.filter(
    (candidate) => candidate.ownerId === PLAYER_KINGDOM_ID && candidate.id !== army.landId,
  );
  const attackable = buildAllConquestTargets(state);
  const others = state.armies.filter(
    (candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID && !candidate.isLevy && candidate.id !== army.id,
  );
  const quarries = visibleHostileHosts(state);
  // ── Send this host to the fight ──
  //
  // **Always drawn, even with no fight to send it to.** It used to appear only while a battle
  // was live and this host could reach it, and vanish the rest of the time — so the one order
  // that answers "there is a siege on my border, send this army" was invisible on every screen
  // a player ever opened calmly, and nothing on the sheet said the order existed. Every other
  // row here already states its own unavailability in place ("Truy đuổi một đạo quân — không
  // thấy đạo quân địch nào"); this one disappeared instead, which is the only kind of missing
  // control a player cannot learn from.
  //
  // Kept at the head of the list because it is the one order that is about *now*: a fight is
  // running out of beats while the sheet is open, and the rows under it are all about later.
  const live = state.ascent?.activeBattle && !state.ascent.activeBattle.over ? state.ascent.activeBattle : undefined;
  const relief = live ? reinforcementCandidates(state, live).find((row) => row.army.id === army.id) : undefined;
  const alreadyIn = Boolean(live && (live.ourArmyIds ?? []).includes(army.id));
  const reliefNote = (): string => {
    if (!live) return t('ascent.reinforce.noBattle');
    if (alreadyIn) return t('ascent.reinforce.already', { land: live.landName });
    // No candidate row for a fight that is running means this host cannot join it at all — an
    // empty host, or one the candidate list refused for a reason it does not name.
    if (!relief) return t('ascent.reinforce.noRoad');
    if (relief.blockedReason) return relief.blockedReason;
    if (relief.routeWarning) return relief.routeWarning;
    if (relief.enRoute) return t('ascent.reinforce.onRoad');
    if (relief.etaTicks === 0) return t('ascent.reinforce.etaNow');
    return t(relief.inTime ? 'ascent.reinforce.etaInTime' : 'ascent.reinforce.etaLate', { n: relief.etaTicks ?? 0 });
  };
  const canRelieve = Boolean(live && relief && !alreadyIn && !relief.blockedReason && !relief.enRoute);
  const reliefTile = [{
    title: live ? t('ascent.reinforce.tile', { land: live.landName }) : t('ascent.reinforce.tileIdle'),
    note: reliefNote(),
    border: !canRelieve ? INK_UI.softBrush : relief?.routeWarning ? INK_UI.gold : relief?.inTime ? INK_UI.jade : INK_UI.cinnabar,
    muted: !canRelieve,
    onTap: canRelieve && live ? () => {
      sendReinforcement(state, live, armyId);
      showArmyDetail(self, armyId);
    } : undefined,
  }];
  const orderTiles = [
    ...reliefTile,
    {
      title: t('ascent.orders.defendHere'),
      note: t('ascent.orders.defendHereBody', { land: land?.name ?? '—' }),
      border: defendingHere ? INK_UI.gold : INK_UI.jade,
      muted: defendingHere,
      onTap: defendingHere ? undefined : () => command({ kind: 'defend', landId: army.landId }),
    },
    {
      title: t('ascent.army.marchTo'),
      note: owned.length > 0 ? t('ascent.army.marchToBody') : t('ascent.army.noOwnedLand'),
      border: owned.length > 0 ? INK_UI.jade : INK_UI.softBrush,
      muted: owned.length === 0,
      onTap: owned.length > 0 ? () => self.showMarchTargets(armyId) : undefined,
    },
    {
      title: t('ascent.orders.attackPick'),
      note: attackable.length > 0 ? t('ascent.orders.attackPickBody') : t('ascent.army.noOwnedLand'),
      border: attackable.length > 0 ? INK_UI.cinnabar : INK_UI.softBrush,
      muted: attackable.length === 0,
      onTap: attackable.length > 0 ? () => self.showAttackTargets(armyId) : undefined,
    },
    {
      title: t('ascent.orders.followPick'),
      note: t('ascent.orders.followPickBody'),
      border: others.length > 0 ? INK_UI.jade : INK_UI.softBrush,
      muted: others.length === 0,
      onTap: others.length > 0 ? () => self.showFollowTargets(armyId) : undefined,
    },
    {
      title: t('ascent.army.hunt'),
      note: quarries.length > 0 ? t('ascent.army.huntBody', { n: quarries.length }) : t('ascent.army.huntNone'),
      border: quarries.length > 0 ? INK_UI.cinnabar : INK_UI.softBrush,
      muted: quarries.length === 0,
      onTap: quarries.length > 0 ? () => self.showHuntTargets(armyId) : undefined,
    },
    {
      title: t('ascent.orders.autoRow'),
      note: t('ascent.orders.autoBody'),
      border: isAutoHost(army) ? INK_UI.gold : INK_UI.softBrush,
      muted: isAutoHost(army),
      onTap: isAutoHost(army) ? undefined : () => command({ kind: 'auto' }),
    },
  ];
  addWidget(0, (parent, width) => {
    const height = self.actionTiles(parent, width, locked
      // One sentence above already said why; the tiles just go quiet together.
      ? orderTiles.map((tile) => ({ ...tile, muted: true, border: INK_UI.softBrush, onTap: undefined }))
      : orderTiles);
    return height;
  });

  // Who fights this host's battles. The run-wide switch in Settings answers it for every host at
  // once, which is the wrong grain: a border garrison should be left to its general and the royal
  // host should not be.
  addWidget(0, (parent, width) => self.segmentedRow(parent, width, {
    label: t('ascent.battle.whoCommands'),
    options: [t('ascent.battle.commandMine'), t('ascent.battle.commandGeneral')],
    note: army.autoResolve
      ? t('ascent.battle.commandGeneralBody')
      : t('ascent.battle.commandMineBody'),
    selected: army.autoResolve ? 1 : 0,
    onPick: (index) => {
      army.autoResolve = index === 1;
      showArmyDetail(self, armyId);
    },
  }));

  // Recall: out of the fight, off the siege, home. Confirmed, because it can abandon both.
  const siege = state.siegeOrders.find((order) => order.armyId === army.id);
  const engaged = Boolean(state.ascent?.activeBattle && !state.ascent.activeBattle.over
    && (state.ascent.activeBattle.ourArmyIds ?? []).includes(army.id));
  const recall = (): void => {
    const consequences = [
      siege ? t('ascent.orders.recallSiege', { land: state.lands.find((l) => l.id === siege.landId)?.name ?? '' }) : '',
      engaged ? t('ascent.orders.recallBattle', { land: state.ascent?.activeBattle?.landName ?? '' }) : '',
    ].filter(Boolean);
    self.showConfirmPage({
      title: t('ascent.orders.recall'),
      subtitle: army.name,
      lines: [t('ascent.orders.recallBody'), ...consequences],
      confirmLabel: t('ascent.orders.recall'),
      danger: consequences.length > 0,
      onConfirm: () => {
        self.events.emit('ui:ascent-army-recall', armyId);
        showArmyDetail(self, armyId);
      },
      onBack: () => showArmyDetail(self, armyId),
    });
  };

  // ── Reinforcement ──
  //
  // Everything that spends on the host: fresh men, better kit, more drill, full baggage — and,
  // at the end and apart from them, the two ways to take it off the board.
  addHeading(t('ascent.army.groupSupply'));
  const supply = resupplyPreview(state, armyId);
  const upgrades = getArmyUpgradeOptions(state, armyId).map((option) => ({
    title: t(`ascent.army.${option.kind}` as Parameters<typeof t>[0]),
    note: option.available
      ? `${
          option.kind === 'equip'
            ? t('ascent.army.equipBody', { tier: option.gain })
            : option.kind === 'reinforce'
              ? t('ascent.army.reinforceTile', { n: option.gain, ticks: reinforcementTicks(option.gain) })
              : t('ascent.army.drillBody', { level: option.gain })
        }\n${formatResourceList(option.cost)}`
      : option.reason ?? '',
    border: option.available ? INK_UI.gold : INK_UI.softBrush,
    muted: !option.available,
    // Reinforce is the one of the three with a *number* in it, so it asks for the number. The
    // other two buy a tier and a level — there is nothing to dial.
    onTap: option.available
      ? option.kind === 'reinforce'
        ? () => showReinforceForm(self, armyId, option.gain)
        : () => {
            upgradeArmy(state, armyId, option.kind);
            showArmyDetail(self, armyId);
          }
      : undefined,
  }));
  addWidget(0, (parent, width) => {
    const height = self.actionTiles(parent, width, [
      ...upgrades,
      {
        title: t('ascent.orders.resupply'),
        note: supply.blocked ?? t('ascent.orders.resupplyBody', {
          r: Math.round(army.rations),
          wantR: supply.wantRations,
          p: Math.round(army.provisions),
          wantP: supply.wantProvisions,
          food: supply.food,
          supplies: supply.supplies,
        }),
        border: supply.blocked ? INK_UI.softBrush : INK_UI.jade,
        muted: Boolean(supply.blocked),
        onTap: supply.blocked
          ? undefined
          : () => {
              self.events.emit('ui:ascent-army-resupply', armyId);
              showArmyDetail(self, armyId);
            },
      },
      {
        title: t('ascent.orders.recall'),
        note: locked ? t('ascent.army.refitBusy') : t('ascent.orders.recallBody'),
        border: locked ? INK_UI.softBrush : INK_UI.gold,
        muted: locked,
        onTap: locked ? undefined : recall,
      },
      {
        title: t('ascent.army.disband'),
        note: t('ascent.army.disbandBody', { n: size, gold: shareGold, food: shareFood }),
        border: INK_UI.cinnabar,
        onTap: () => {
          self.closeLane();
          self.events.emit('ui:ascent-disband-army', armyId);
        },
      },
    ]);
    return height;
  });

  finish();
}


/**
 * How many men to call up, and what that buys against what it costs.
 *
 * The order used to be a tile with no question on it: a flat two hundred and twenty men, a flat
 * three seasons. Reported verbatim: *current reinforcement only 200 men; click, slide how much I
 * want; as more as numbers it will slower and cost more.* Both halves of that trade are quoted
 * live off the arithmetic the order will actually run — `getArmyUpgradeOptions` for the bill,
 * `reinforcementTicks` for the seasons — so the line under the slider is what pressing Call up
 * does.
 *
 * The count lives in the argument rather than on the scene. The page is rebuilt on every change
 * (the bill and the clock both move with it), and a draft that outlived the page would have to be
 * cleared on every other way out of the lane — which is the trap `musterDraft` already pays for.
 */
export function showReinforceForm(self: ConquestUIScene, armyId: string, men: number): void {
  const state = self.state;
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army) { showArmyDetail(self, armyId); return; }
  const limit = reinforcementLimit(state);
  const floor = Math.min(ARMY_REINFORCE_MIN_SOLDIERS, limit);
  const wanted = Math.max(floor, Math.min(limit, Math.round(men)));
  const option = getArmyUpgradeOptions(state, armyId, wanted).find((row) => row.kind === 'reinforce');
  const gain = option?.gain ?? 0;

  self.replaceLanePage(() => {
    const { addNote, addWidget, finish } = self.laneList(
      t('ascent.army.reinforceTitle'),
      t('ascent.army.reinforceSub', { army: army.name, size: hostSize(army) }),
      {
        back: () => showArmyDetail(self, armyId),
        footer: {
          label: t('ascent.army.reinforceDo', { n: gain }),
          disabled: !option?.available,
          onTap: () => {
            upgradeArmy(state, armyId, 'reinforce', gain);
            showArmyDetail(self, armyId);
          },
        },
      },
    );

    addWidget(64, (holder, width) => {
      holder.add(self.ui.panel({ x: 0, y: 0, width, height: 64 }, {
        border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52,
      }));
      const line = (n: number): string => t('ascent.army.reinforceLine', {
        n,
        ticks: reinforcementTicks(n),
        gold: Math.round(n * ARMY_REINFORCE_GOLD_PER_SOLDIER),
      });
      const label = self.ui.label(14, 10, line(gain), 'caption', { fontSize: '11px' });
      holder.add(label);
      const span = Math.max(1, limit - floor);
      // Rounded to tens, so the thumb lands on a number a player would say out loud.
      const fromValue = (v: number): number => Math.max(
        floor, Math.min(limit, Math.round((floor + v * span) / 10) * 10),
      );
      holder.add(self.ui.slider(
        { x: 10, y: 30, width: width - 20, height: 22 },
        {
          value: limit > floor ? (gain - floor) / span : 0,
          color: INK_UI.jade,
          // Previewed on the drag and committed on release: the page rebuild is too heavy to run
          // per pixel, and the label alone is what the thumb is reading anyway.
          onPreview: (v) => label.setText(line(fromValue(v))),
          onChange: (v) => showReinforceForm(self, armyId, fromValue(v)),
        },
      ));
    });

    // No second copy of the bill: the line above the slider already carries it, and it is the
    // one that moves with the thumb.
    if (option && !option.available && option.reason) addNote(option.reason, INK_UI.cinnabar);
    else {
      addNote(t('ascent.army.reinforceResult', {
        army: army.name, before: hostSize(army), after: hostSize(army) + gain,
      }), INK_UI.jade);
    }
    addNote(t('ascent.army.reinforceHint'));
    finish();
  });
}
