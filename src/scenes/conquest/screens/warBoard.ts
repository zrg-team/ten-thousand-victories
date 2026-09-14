/**
 * The war, listed — and made enterable.
 *
 * The Battle button had exactly one state worth pressing — a live watched engagement — and the
 * screen opens for 6–15 of the 20–96 fights a measured run settles. The rest happened to provinces
 * the player owned, on a map that showed nothing, reported to two channels this mode does not
 * render. *Sometimes the enemy attacks my land but no fight is shown.*
 *
 * So the button always leads somewhere while the realm is under attack: every province the enemy
 * is standing on or beside, worst first.
 *
 * **Every row is a door, and that is the whole of the second round of this screen.** The first
 * version made a door of the live fields only and left the rest as text — which is exactly
 * backwards, because a province with no fight on it is the one the player can do nothing about
 * from anywhere else in the game. Reported verbatim: *some battle i can not click to it — really
 * critical because some battle i still can not control.* A live field walks straight onto its
 * ground; anything else opens the front sheet below, which says who is there, how long the walls
 * have, and offers the two orders that change it.
 *
 * What is deliberately **not** here any more is the ledger of finished fights. It was half the
 * length of the page and none of it was actionable, under a heading — *Trận đã đánh* — that read
 * as the point of the screen. The Reckoning reports a fight when it ends; this page is for the
 * war still being fought.
 */
import { contestedFronts } from '../../../systems/ascent/battleReport';
import { fieldCandidateAt, openFieldAt, summonAdjacentRelief } from '../../../systems/ascent/BattleSystem';
import {
  battleAt, focusBattle, hasRoomForAnotherFront, liveBattleCount, liveBattles,
} from '../../../systems/ascent/fronts';
import { reinforcementCandidates, reinforcementsEnRoute } from '../../../systems/ascent/reinforcement';
import { findFreeCommander } from '../../../systems/ascent/AutopilotSystem';
import { isBossWave, liveInvaderPower } from '../../../systems/ascent/WaveDirector';
import { landGarrisonPower } from '../../../systems/ascent/PowerSystem';
import { forecastInvader } from '../../../systems/ascent/frontForecast';
import { armyPower } from '../../../systems/WarSystem';
import { dateOfTurn } from '../../../systems/seasonClock';
import { rulesOf } from '../../../game/ascentRuleset';
import { MAX_LIVE_BATTLES } from '../../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../../game/constants';
import { INK_UI } from '../../../ui/InkUI';
import { statChips } from '../../../ui/statChips';
import { drawCostChips } from '../../../ui/costChips';
import { seasonLabel, t } from '../../../i18n';
import { hostSize } from '../constants';
import { showHunters } from './armyTargets';
import type { AscentFront } from '../../../systems/ascent/battleReport';
import type { Army, InvasionRecord } from '../../../state/types';
import type { ConquestUIScene } from '../../ConquestUIScene';

/** How the row reads at a glance: the odds said as a word, not as a ratio to do arithmetic on. */
function standingOf(front: AscentFront): string {
  const odds = front.theirMen / Math.max(1, front.ourMen);
  if (front.commanded) return 'live';
  if (front.live) return 'held';
  if (front.besieged) return 'besieged';
  return odds >= 1.6 ? 'losing' : odds >= 0.9 ? 'even' : 'holding';
}

/**
 * The ink is the *odds*, not the standing.
 *
 * A field a general is holding reads `held`, which never matched the losing clause — so the board
 * drew a general 400 against 1,600 in the same gold as one at even numbers, which is the whole
 * thing this board exists to say.
 */
function frontInk(front: AscentFront): number {
  const odds = front.theirMen / Math.max(1, front.ourMen);
  if (front.commanded || front.besieged || odds >= 1.6) return INK_UI.cinnabar;
  return front.live || odds >= 0.9 ? INK_UI.gold : INK_UI.jade;
}

/** Seasons left before a siege takes the province, or undefined when nobody is under the walls. */
function siegeLeft(self: ConquestUIScene, landId: string): number | undefined {
  const order = self.state.siegeOrders.find((siege) => siege.landId === landId);
  return order ? Math.max(0, order.required - order.progress) : undefined;
}

/**
 * Seasons before the host standing at this province storms it.
 *
 * The *other* clock, and the only one the player can still beat: `siegeLeft` counts down a
 * province already carried, this one counts down to the fight. A row that showed neither was the
 * row that made the relief order look decorative.
 */
function assaultLeft(self: ConquestUIScene, landId: string): number | undefined {
  const land = self.state.lands.find((candidate) => candidate.id === landId);
  return land?.siege ? Math.max(0, land.siege.ticksLeft) : undefined;
}

/**
 * Walks the player onto a field that is already being fought.
 *
 * **In place, not out and back in.** `closeLane` runs `refresh`, which is allowed to re-enter
 * this lane on its own — so a tap that closed and reopened could have the lane rebuilt under it
 * and land back on the board with nothing changed but the row order. That is the reported fault
 * word for word: *click battle, nothing happens, it just changes the colour*. The page is
 * replaced where it stands, so there is exactly one rebuild and it is this one.
 */
function takeField(self: ConquestUIScene, landId: string): void {
  const state = self.state;
  // The fight ended between the board being drawn and this row being pressed. Redraw the war as
  // it now stands rather than swallowing the tap — a row that does nothing is the whole reason
  // this screen was rewritten.
  if (!battleAt(state, landId)) {
    self.replaceLanePage(() => showWarBoard(self));
    return;
  }
  focusBattle(state, landId);
  // Choosing a field is an instruction to fight on it — the board's hold ends here rather than
  // being handed back when the lane eventually closes.
  self.lanePauseBeforeOpen = false;
  state.isStrategyPause = false;
  state.isPaused = false;
  self.replaceLanePage(() => self.showBattle());
}

/**
 * What the board is a picture of — the shape of the war, not its arithmetic.
 *
 * `refresh` redraws the board when this changes and leaves it alone otherwise, so a fight ending,
 * a province coming under attack or a host landing reaches the screen, and a beat of casualties or
 * an invader taking one more step does not destroy the row under the player's thumb.
 */
export function warBoardSignature(self: ConquestUIScene): string {
  const state = self.state;
  const commanded = state.ascent?.activeBattle?.over === false ? state.ascent.activeBattle.landId : '';
  // The claim's remaining seasons are part of the picture: on falling ground nothing else in this
  // signature moves for the 2-6 seasons the province takes to go, so the row's countdown would sit
  // frozen at whatever it read when the board opened.
  const invaders = (state.invasions ?? []).map((record) => `${record.armyId}${record.plan === 'withdrawing' ? '<' : ''}`).join(',');
  return `${commanded}|${state.ascent?.pendingWave?.wave ?? ''}:${state.ascent?.pendingWave?.hosts ?? ''}|${invaders}|${contestedFronts(state)
    .map((front) => `${front.landId}${front.live ? '!' : ''}${front.besieged ? '#' : ''}${front.assaultTicks ?? ''}${front.falling ? `~${siegeLeft(self, front.landId) ?? ''}` : ''}`)
    .join(',')}`;
}

/** Player hosts already marching on a province. */
function reliefColumnsTo(self: ConquestUIScene, landId: string): number {
  const state = self.state;
  return state.movementOrders.filter((order) => {
    if (order.path[order.path.length - 1] !== landId) return false;
    const army = state.armies.find((candidate) => candidate.id === order.armyId);
    return army?.kingdomId === PLAYER_KINGDOM_ID;
  }).length;
}

/**
 * **What the war page asks of the player** — the bottom sheet's rows, most urgent first.
 *
 * Only decisions that change an outcome, each one a door to the page that makes it:
 *
 *  - a field being lost (their numbers well past ours) with hosts that could march and none
 *    already on the road — *reinforce*, straight to the picker for that field;
 *  - ground the enemy has carried and is claiming, while the claim still runs — *retake*;
 *  - walls with an assault clock, outnumbered, and no column marching — *relieve* before they fall;
 *  - an invasion on the map and not a single host of ours standing, with someone to lead one —
 *    *raise a host*, on the Army lane where the muster form lives.
 *
 * Nothing that merely reports: the rows above the sheet already say how each field stands.
 */
function warActions(self: ConquestUIScene, fronts: AscentFront[]): Array<{ label: string; onPress: () => void }> {
  const state = self.state;
  const back = (): void => self.replaceLanePage(() => showWarBoard(self));
  const actions: Array<{ label: string; onPress: () => void; urgency: number }> = [];

  for (const fight of liveBattles(state)) {
    const odds = fight.theirNow / Math.max(1, fight.ourNow);
    if (odds < WAR_LOSING_ODDS) continue;
    const sendable = reinforcementCandidates(state, fight).filter((row) => !row.blockedReason && !row.enRoute).length;
    if (sendable === 0 || reinforcementsEnRoute(state, fight).hosts > 0) continue;
    actions.push({
      label: t('ascent.war.act.reinforce', { land: fight.landName, n: sendable }),
      urgency: 300 + odds,
      onPress: () => {
        // The picker sends to the field under the player's hand, so that field is focused first.
        if (state.ascent?.activeBattle?.landId !== fight.landId) focusBattle(state, fight.landId);
        self.showReinforcePicker(back);
      },
    });
  }

  for (const front of fronts) {
    if (front.live) continue;
    const left = siegeLeft(self, front.landId);
    const assault = assaultLeft(self, front.landId);
    if (front.falling && left !== undefined) {
      actions.push({
        label: t('ascent.war.act.retake', { land: front.landName, n: left }),
        urgency: 200 - left,
        onPress: () => self.replaceLanePage(() => showFrontSheet(self, front.landId)),
      });
    } else if (assault !== undefined && front.theirMen > front.ourMen && reliefColumnsTo(self, front.landId) === 0) {
      actions.push({
        label: t('ascent.war.act.relieve', { land: front.landName, n: assault }),
        urgency: 100 - assault,
        onPress: () => self.replaceLanePage(() => showFrontSheet(self, front.landId)),
      });
    }
  }

  const invading = (state.invasions ?? []).some((record) => record.plan !== 'withdrawing');
  const standing = state.armies.some((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy && !army.patron);
  if (invading && !standing && state.recruitmentOrders.length === 0 && findFreeCommander(state)) {
    actions.push({
      label: t('ascent.lane.waitHost'),
      urgency: 50,
      onPress: () => {
        self.closeLane();
        self.openLane('army');
        self.showRaiseHostForm();
      },
    });
  }

  return actions.sort((a, b) => b.urgency - a.urgency).map(({ label, onPress }) => ({ label, onPress }));
}

/**
 * The war page: the invasion as a whole, then every fight, with what can be done in the sheet.
 *
 * Reported: *fight always show with information — the current invasion (total, armies, from when,
 * the enemies' names), the list of fights, and a bottom sheet for the actions I can take*. The
 * invasion used to be spread across the Army page (invader rows, the next-wave line) and this board
 * (fronts only), so neither page said how the war as a whole stood. The invader rows moved here;
 * the Army page is our own hosts now.
 */
export function showWarBoard(self: ConquestUIScene): void {
  /**
   * The board is a page over the world, so the world has to be under it.
   *
   * `beginOverlay` hides the map for `lane:battle` because the *field* is a full sheet of
   * parchment — and this is the other page that lane opens, drawn over the ordinary 0.93 lane
   * dim. With the map hidden the 0.93 showed the six scenes the game keeps resident behind
   * everything: photographed, the board's lower half was the **main menu**, lotus, version line
   * and all. Reached from `showBattle` when no field is live, and from the fight's own fronts
   * chip through `replaceLanePage`, which is why the restore belongs here rather than at either
   * of those call sites.
   */
  self.setMapVisible(true);
  const state = self.state;
  const ascent = state.ascent;
  const fronts = contestedFronts(state);
  self.warBoardKey = warBoardSignature(self);
  const live = fronts.filter((front) => front.live);
  const pressed = fronts.filter((front) => !front.live);

  /**
   * The board raised *at* the player, rather than opened by them.
   *
   * A second field going live is the one event in this mode that changes what the player should
   * be doing rather than merely how well it is going, so `addSideBattle` stops the world and
   * leaves the count here. Read once, and cleared: this is an announcement about a moment, like
   * the wave banner's cues, and it must not be redelivered every time the board is opened again.
   *
   * `lanePauseBeforeOpen` is cleared with it, because the pause belongs to the announcement. The
   * lane hands back whatever pause it opened under, and without this the player would close the
   * board onto a world that stays stopped with no control that says why.
   */
  const alerted = ascent?.frontsOpened ?? 0;
  if (ascent?.frontsOpened) {
    ascent.frontsOpened = undefined;
    self.lanePauseBeforeOpen = false;
    // Only the announcement holds the world, and only for as long as it is on the screen. Held
    // unconditionally — as it was for one round — the hold leaked out through the battle lane's
    // `lanePauseBeforeOpen` and reopened running fights frozen mid-beat.
    state.isStrategyPause = true;
  } else if (liveBattleCount(state) > 0) {
    /**
     * The war waits while the player is reading about it.
     *
     * `clearLanePage` stops the beat *drain* clock when the battle view is torn down, and that is
     * only the presentation: `advanceBattle` runs from the economy tick whether or not anyone is
     * watching, and the battle lane is the one lane that deliberately un-pauses the world. So
     * stepping off a field to look at the list left every fight beating behind the page, and a
     * player came back to a battle several exchanges further on than the one they left.
     *
     * Reported as *pause battle screen if move from fight list page*. Released again by
     * `takeField`, which already writes all three flags on the way back onto a field.
     */
    state.isStrategyPause = true;
  }

  // Hosts on the map under invasion orders, whether or not they have reached our ground yet. The
  // quiet subtitle ("no enemy host on our land") printed over a Great Invasion's summary while its
  // columns were still two provinces out — true, and read as "there is no war".
  const marching = (state.invasions ?? []).filter((record) => record.plan !== 'withdrawing').length;
  const { addRow, addHeading, addNote, addWidget, finish } = self.laneList(
    alerted > 1 ? t('ascent.war.alertTitle') : t('ascent.war.title'),
    alerted > 1
      ? t('ascent.war.alertSubtitle', { n: alerted })
      : live.length > 0
        ? t('ascent.war.subtitleFighting', { n: live.length, all: fronts.length })
        : fronts.length > 0
          ? t('ascent.war.subtitle', { n: fronts.length })
          : marching > 0
            ? t('ascent.war.subtitleMarching', { n: marching })
            : t('ascent.war.subtitleQuiet'),
    {
      dock: {
        items: warActions(self, fronts),
        rebuild: () => showWarBoard(self),
      },
    },
  );

  // ── The invasion ──────────────────────────────────────────────────────────
  addInvasionSection(self, addHeading, addNote, addRow, addWidget);

  // ── The fights ────────────────────────────────────────────────────────────
  addHeading(t('ascent.war.fightsHeading'));
  if (live.length > 0) {
    for (const front of live) {
      const fight = battleAt(state, front.landId);
      addRow(
        {
          title: front.landName,
          icon: front.commanded ? 'banner' : undefined,
          // Who, which round and how it stands are words; the two hosts are the same blade and
          // crossed weapons the HUD, the army lane and the fight screen all use for them.
          stats: statChips([
            ['power', Math.round(front.ourMen)],
            ['threat', Math.round(front.theirMen), INK_UI.cinnabar],
          ]),
          subtitle: t('ascent.war.liveLineShort', {
            kingdom: front.kingdomName,
            round: fight ? fight.round + 1 : 1,
            total: fight?.totalRounds ?? 0,
            standing: t(`ascent.war.standing.${standingOf(front)}` as Parameters<typeof t>[0]),
          }),
          border: frontInk(front),
        },
        () => takeField(self, front.landId),
      );
    }
  }

  for (const front of pressed) {
    const left = siegeLeft(self, front.landId);
    const assault = assaultLeft(self, front.landId);
    addRow(
      {
        title: front.landName,
        stats: statChips([
          ['threat', Math.round(front.theirMen), INK_UI.cinnabar],
          ['defence', Math.round(front.ourMen)],
        ]),
        subtitle: t('ascent.war.frontLineShort', {
          kingdom: front.kingdomName,
          // The province already carried first — it is the worse news of the two — then the
          // walls' own clock, then the plain standing.
          standing: left !== undefined
            ? t('ascent.war.standingSiege', { ticks: left })
            : assault !== undefined
              ? t('ascent.war.standingAssault', { ticks: assault })
              : t(`ascent.war.standing.${standingOf(front)}` as Parameters<typeof t>[0]),
        }),
        border: frontInk(front),
      },
      /**
       * A row about a fight opens the fight.
       *
       * It used to open a sheet, and the sheet's first row then opened the fight — two taps and a
       * page in between to reach the one thing the row is named after. Reported verbatim: *click
       * show list of fight, click a fight, show battle screen directly, no need a middle screen.*
       *
       * The sheet is not gone: it carries the relief order and the reasons a field cannot be
       * stood up, and it is still what a row falls back to when `openFieldAt` refuses — no room
       * under the front cap, or nobody actually standing on the province. So the tap always does
       * the most it can, and only explains itself when it cannot do the main thing.
       */
      () => {
        if (openFieldAt(state, front.landId)) {
          takeField(self, front.landId);
          return;
        }
        self.replaceLanePage(() => showFrontSheet(self, front.landId));
      },
    );
  }

  if (fronts.length === 0) addNote(marching > 0 ? t('ascent.war.noFightsYet') : t('ascent.war.noFronts'));

  finish();
}

/** Odds (their men over ours) at which a live field counts as being lost and asks for relief. */
const WAR_LOSING_ODDS = 1.3;

/**
 * **The invasion as a whole** — which wave, which crowns, since when, how many hosts landed and how
 * many still stand, their weight against ours — then each invading host, then the next wave's clock.
 *
 * Every figure here was already in state and on no page together: `pendingWave` carries the wave,
 * its landing turn and the hosts that landed; `invasionsRepelled` against its `repelledAt` is the
 * hosts broken since; `state.invasions` is who is still marching and where.
 */
function addInvasionSection(
  self: ConquestUIScene,
  addHeading: (title: string, hint?: string) => void,
  addNote: (text: string, tone?: number) => void,
  addRow: ReturnType<ConquestUIScene['laneList']>['addRow'],
  addWidget: ReturnType<ConquestUIScene['laneList']>['addWidget'],
): void {
  const state = self.state;
  const ascent = state.ascent;
  const wave = ascent?.pendingWave;
  const records = (state.invasions ?? [])
    .map((record) => ({ record, invader: state.armies.find((army) => army.id === record.armyId) }))
    .filter((entry): entry is { record: InvasionRecord; invader: Army } => Boolean(entry.invader));

  addHeading(t('ascent.war.invasionHeading'));

  if (wave && (wave.hosts > 0 || records.length > 0)) {
    const kingdoms = [...new Set(records
      .map(({ record }) => state.kingdoms.find((kingdom) => kingdom.id === record.kingdomId)?.name)
      .filter((name): name is string => Boolean(name)))];
    const names = kingdoms.length ? kingdoms.join(', ') : wave.kingdomName ?? '—';
    const when = dateOfTurn(wave.turn);
    const broken = Math.max(0, (state.invasionsRepelled ?? 0) - wave.repelledAt);
    const standing = records.filter(({ record }) => record.plan !== 'withdrawing').length;
    addWidget(INVASION_SUMMARY_HEIGHT, (holder, width) => {
      holder.add(self.ui.label(2, 0, t(wave.boss ? 'ascent.war.invasionTitleGreat' : 'ascent.war.invasionTitle', {
        wave: wave.wave, kingdoms: names,
      }), 'body', { fontSize: '13px', fontStyle: '700', wordWrap: { width: width - 4 } }));
      holder.add(self.ui.label(2, 22, t('ascent.war.invasionSince', {
        season: seasonLabel(when.season), year: when.year, n: Math.max(0, state.turn - wave.turn),
      }), 'caption', { fontSize: '11px' }));
      holder.add(drawCostChips(self, statChips([
        ['hosts', t('ascent.war.invasionHosts', { standing, total: Math.max(wave.hosts, standing), broken })],
        ['threat', Math.round(liveInvaderPower(state)), INK_UI.cinnabar],
        ['defence', Math.round(ascent?.defensePower ?? 0)],
      ]), { x: 2, y: 42, width: width - 4, size: 'stat' }));
    });
  } else {
    addNote(t('ascent.war.invasionNone'));
  }

  const planLabel: Record<NonNullable<InvasionRecord['plan']>, string> = {
    spearhead: t('ascent.war.planSpearhead'),
    flanker: t('ascent.war.planFlanker'),
    raider: t('ascent.war.planRaider'),
    hunter: t('ascent.war.planHunter'),
    withdrawing: t('ascent.war.planWithdrawing'),
  };
  const mine = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
  const fields = liveBattles(state);
  const commandedLand = ascent?.activeBattle?.landId;
  let unseen = 0;
  for (const { record, invader } of records) {
    const at = state.lands.find((candidate) => candidate.id === invader.landId);
    // A host standing in the dark stays a rumour — counted, not named.
    if (!at?.isVisible) {
      unseen += 1;
      continue;
    }
    const kingdom = state.kingdoms.find((candidate) => candidate.id === record.kingdomId);
    const target = state.lands.find((candidate) => candidate.id === record.targetLandId);
    const holding = target
      ? Math.round(landGarrisonPower(state, target)
        + mine.filter((army) => army.landId === target.id).reduce((sum, army) => sum + armyPower(state, army), 0))
      : 0;
    const withdrawing = record.plan === 'withdrawing';
    // Beta (`defenceBand`): what will be standing there when this host arrives, and when that is.
    const forecast = rulesOf(state).defenceBand && !withdrawing ? forecastInvader(state, record) : undefined;
    const fighting = fields.find((field) => field.landId === invader.landId);
    addRow(
      {
        title: (record.great ? t('ascent.war.great') : '')
          + t('ascent.war.invaderRow', { kingdom: kingdom?.name ?? '—', size: hostSize(invader) }),
        stats: statChips([
          ['threat', Math.round(armyPower(state, invader)), withdrawing ? undefined : INK_UI.cinnabar],
          ['defence', forecast ? forecast.ready : holding],
        ]),
        subtitle: t('ascent.war.invaderWhere', {
          plan: planLabel[record.plan ?? 'spearhead'],
          target: target?.name ?? at.name,
        }) + (forecast
          ? ` · ${forecast.reachTicks !== undefined
            ? t('beta.war.forecast', { ticks: forecast.reachTicks, assault: forecast.assaultTicks ?? forecast.reachTicks + 1, pct: forecast.holdPct })
            : t('beta.war.forecastNoRoute', { pct: forecast.holdPct })}`
          : ''),
        border: withdrawing ? INK_UI.softBrush : INK_UI.cinnabar,
        muted: withdrawing,
      },
      // A host already fighting opens its field; every other one asks who marches on it.
      withdrawing ? undefined : fighting
        ? () => {
          if (fighting.landId !== commandedLand) focusBattle(state, fighting.landId);
          takeField(self, fighting.landId);
        }
        : () => showHunters(self, invader.id),
    );
  }
  if (unseen > 0) addNote(t('ascent.war.unseenCount', { n: unseen }));

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
}

const INVASION_SUMMARY_HEIGHT = 62;

/**
 * One province, and the orders that change what is happening on it.
 *
 * The sheet a row opens when there is no field to walk onto. Everything on it was already known
 * to the state and shown nowhere: who is standing there, what they brought, how many seasons the
 * walls have left, and whether the realm can afford to stand a fight up at all.
 */
export function showFrontSheet(self: ConquestUIScene, landId: string): void {
  const state = self.state;
  const front = contestedFronts(state).find((candidate) => candidate.landId === landId);
  // The war moved while the page was open — the host marched off, or a general settled it. Back
  // to the board, rather than a sheet about nobody.
  if (!front) {
    showWarBoard(self);
    return;
  }
  const left = siegeLeft(self, landId);
  const candidate = fieldCandidateAt(state, landId);
  const room = hasRoomForAnotherFront(state, landId);

  const { addRow, addHeading, addNote, addWidget, finish } = self.laneList(
    front.landName,
    t('ascent.war.frontSub', { kingdom: front.kingdomName }),
    { back: () => self.replaceLanePage(() => showWarBoard(self)) },
  );

  // The two headcounts against one scale — the only honest way to show a trade, and the same
  // widget the Reckoning uses, so the two screens are legibly about the same war.
  const worst = Math.max(1, front.ourMen, front.theirMen);
  addWidget(64, (parent, width) => {
    const bar = (y: number, label: string, men: number, colour: number): void => {
      parent.add(self.ui.label(0, y, label, 'caption', {}));
      parent.add(self.ui.label(width, y, `${Math.round(men)}`, 'caption', { align: 'right' })
        .setOrigin(1, 0));
      parent.add(self.ui.statBar({ x: 0, y: y + 16, width, height: 7 }, men, worst, colour));
    };
    bar(0, t('ascent.war.ourMen'), front.ourMen, INK_UI.jade);
    bar(32, t('ascent.war.theirMen'), front.theirMen, INK_UI.cinnabar);
  });

  if (left !== undefined) addNote(t('ascent.war.siegeClock', { ticks: left }), INK_UI.cinnabar);
  // Said out loud, because the headcounts above it changed meaning. On carried ground the walls
  // and the militia turn out for neither side, so `ourMen` is the men the player has actually put
  // there — and a player reading a small number needs to know it is not a bug but the terms of a
  // retake. See `defenderPower` and `enrolArrivals`.
  if (front.falling) addNote(t('ascent.war.claimNoWalls'));
  const assault = assaultLeft(self, landId);
  if (left === undefined && assault !== undefined) {
    addNote(t('ascent.war.assaultClock', { ticks: assault, land: front.landName }), INK_UI.gold);
  }

  addHeading(t('ascent.war.ordersHeading'));

  if (!candidate) {
    addNote(t('ascent.war.noEnemyHere'));
  } else if (!room) {
    // Said, not hidden. A control that vanishes when it cannot be used is a control the player
    // concludes does not exist — which is how this screen earned its report in the first place.
    addRow({
      title: t('ascent.war.takeFieldFull'),
      subtitle: t('ascent.war.takeFieldFullNote', { n: MAX_LIVE_BATTLES }),
      border: INK_UI.softBrush,
      muted: true,
    });
  } else {
    addRow(
      {
        title: t('ascent.war.takeField'),
        subtitle: t('ascent.war.takeFieldNote', { land: front.landName }),
        border: INK_UI.cinnabar,
      },
      () => {
        if (!openFieldAt(state, landId)) {
          self.replaceLanePage(() => showFrontSheet(self, landId));
          return;
        }
        takeField(self, landId);
      },
    );
  }

  // How many hosts are already on the road here. An order with no visible consequence is an
  // order the player presses twice and then stops trusting, and `summonAdjacentRelief` is
  // silent by design — it writes movement orders and a toast this mode does not render.
  const columns = state.movementOrders.filter((order) => {
    if (order.path[order.path.length - 1] !== landId) return false;
    const army = state.armies.find((candidate) => candidate.id === order.armyId);
    return army?.kingdomId === PLAYER_KINGDOM_ID;
  });
  const marching = columns.length;
  /**
   * Seasons the nearest column still needs, against the seasons the walls still have.
   *
   * The only question a relief order actually raises — *does it get there in time* — and the row
   * used to answer neither half of it. One leg is `legRequired - progress` seasons and every leg
   * after it is at least one, which is the floor rather than the figure: terrain can make a leg
   * longer, so a column this says will arrive may still be late, and one this says will be late
   * certainly is.
   */
  const eta = columns.reduce((best, order) => {
    const legs = Math.max(0, Math.ceil(order.legRequired - order.progress)) + Math.max(0, order.path.length - 1);
    return Math.min(best, legs);
  }, Number.POSITIVE_INFINITY);
  addRow(
    {
      title: t('ascent.war.relief'),
      subtitle: marching > 0
        ? assault !== undefined && Number.isFinite(eta)
          ? t(eta <= assault ? 'ascent.war.reliefInTime' : 'ascent.war.reliefTooSlow', {
            n: marching, land: front.landName, eta, ticks: assault,
          })
          : t('ascent.war.reliefMarching', { n: marching, land: front.landName })
        : t('ascent.war.reliefNote', { land: front.landName }),
      border: marching > 0 ? INK_UI.jade : INK_UI.gold,
    },
    () => {
      summonAdjacentRelief(state, landId);
      self.replaceLanePage(() => showFrontSheet(self, landId));
    },
  );

  finish();
}
