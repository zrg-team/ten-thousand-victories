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
  battleAt, focusBattle, hasRoomForAnotherFront, liveBattleCount,
} from '../../../systems/ascent/fronts';
import { MAX_LIVE_BATTLES } from '../../../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../../../game/constants';
import { INK_UI } from '../../../ui/InkUI';
import { t } from '../../../i18n';
import type { AscentFront } from '../../../systems/ascent/battleReport';
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
 * `refresh` redraws the board when this changes and leaves it alone otherwise, so a fight ending
 * or a new province coming under attack reaches the screen, and a beat of casualties does not
 * destroy the row under the player's thumb.
 */
export function warBoardSignature(self: ConquestUIScene): string {
  const state = self.state;
  const commanded = state.ascent?.activeBattle?.over === false ? state.ascent.activeBattle.landId : '';
  // The claim's remaining seasons are part of the picture: on falling ground nothing else in this
  // signature moves for the 2-6 seasons the province takes to go, so the row's countdown would sit
  // frozen at whatever it read when the board opened.
  return `${commanded}|${contestedFronts(state)
    .map((front) => `${front.landId}${front.live ? '!' : ''}${front.besieged ? '#' : ''}${front.assaultTicks ?? ''}${front.falling ? `~${siegeLeft(self, front.landId) ?? ''}` : ''}`)
    .join(',')}`;
}

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
  const alerted = state.ascent?.frontsOpened ?? 0;
  if (state.ascent?.frontsOpened) {
    state.ascent.frontsOpened = undefined;
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

  const { addRow, addHeading, addNote, finish } = self.laneList(
    alerted > 1 ? t('ascent.war.alertTitle') : t('ascent.war.title'),
    alerted > 1
      ? t('ascent.war.alertSubtitle', { n: alerted })
      : live.length > 0
        ? t('ascent.war.subtitleFighting', { n: live.length, all: fronts.length })
        : fronts.length > 0
          ? t('ascent.war.subtitle', { n: fronts.length })
          : t('ascent.war.subtitleQuiet'),
    {},
  );

  if (live.length > 0) {
    addHeading(t('ascent.war.liveHeading'), t('ascent.war.liveHint'));
    for (const front of live) {
      const fight = battleAt(state, front.landId);
      addRow(
        {
          title: front.landName,
          icon: front.commanded ? 'banner' : undefined,
          subtitle: t('ascent.war.liveLine', {
            kingdom: front.kingdomName,
            ours: Math.round(front.ourMen),
            theirs: Math.round(front.theirMen),
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

  if (pressed.length > 0) {
    addHeading(t('ascent.war.pressedHeading'), t('ascent.war.pressedHint'));
    for (const front of pressed) {
      const left = siegeLeft(self, front.landId);
      const assault = assaultLeft(self, front.landId);
      addRow(
        {
          title: front.landName,
          subtitle: t('ascent.war.frontLine', {
            kingdom: front.kingdomName,
            theirs: Math.round(front.theirMen),
            ours: Math.round(front.ourMen),
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
  }

  if (fronts.length === 0) addNote(t('ascent.war.noFronts'));

  finish();
}

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
