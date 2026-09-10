/**
 * The battle lane's frame — the header band over the fight (the commander's face, the engagement,
 * the round track, the one red notice, the newest line of the log) and the hold that keeps the
 * world still until the first order. Together because the hold is only ever *said* in that band:
 * the drum, the pause and `battleAwaitingOrder` are set here and read back out as
 * `updateBattleNotice`'s single line.
 *
 * `showBattle` runs before anything else in `battle/`: it builds `battleUi` — the layers, the
 * `content` box under the band, the `geometry` — and every other module returns early while that
 * is undefined. The notice and log rows are reserved heights that shrink to 8px rather than wrap,
 * or the band would walk the field up and down every beat. The opening drum is a scene timer
 * started here and cancelled by `closeLane`, which must: left running it calls `buildBattleField`
 * on a lane that is gone.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, HEADER_HEIGHT } from '../../../game/constants';
import { hudSheetWidth } from '../../../game/cameraLayout';
import { battleStageSpan, setHudSheet } from '../hudSheet';
import { royalScroll } from '../../../ui/ink/royalScroll';
import { drawHouseSeal, houseBanner } from '../../../ui/ascent/houseBanner';
import { ourHosts, battleTelegraph } from '../../../systems/ascent/BattleSystem';
import { defenceCommanderOf } from '../../../systems/ascent/landCommand';
import { findLand } from '../../../systems/LandSystem';
import { battleAt, focusBattle } from '../../../systems/ascent/fronts';
import { BATTLE_OPENING_SECONDS } from '../../../game/ascentConfig';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { INK_UI, INK_UI_HEX, type UIBounds } from '../../../ui/InkUI';
import { createMapItemRenderer } from '../../../ui/MapItemRenderer';
import { TITLE_FONT, UI_FONT } from '../../../ui/fonts';
import { t } from '../../../i18n';
import type { AscentBattle } from '../../../state/types';
import {
  BATTLE_DOCK_HEIGHT,
  BATTLE_EXITS_OFFSET,
  BATTLE_RAILS_HEIGHT,
  LANE_CLOSE_BUTTON_HEIGHT,
  cssHex,
} from '../constants';
import { clearLayer } from '../layers';
import { showWarBoard } from '../screens/warBoard';
import { setMapVisible } from '../shell';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { setBattleBubbleOverride, setBattleEscalationWave } from '../../../game/battleOptions';
import { liveBattleCount, promoteNextFront } from '../../../systems/ascent/fronts';
import { startBattleMusic } from './music';

/**
 * How far the two lines stand in from the edge of the sheet.
 *
 * Not zero. The men are drawn outward from their line, so the inset has to cover half a block, and
 * a block grows with its host: measured against the arena at its largest dial, 4,000 men, 26 put
 * the outer file through the left edge and 40 left it touching. 48 keeps the outermost figure and
 * its shadow on the paper at that size, and still leaves the two lines 234 apart against the 202
 * they had when the field was a card inside a margin.
 */
// 58, up from 48: the silhouette loan (`devices.ts`) pushes a shape's lead block further out and
// a shock host's horse sits eight ranks back of its line — at 48 the riders' outer file and the
// banner stood off the left edge of a 3,000-man skirmish.
const BATTLE_FIELD_INSET = 58;

function battleFieldHeight(content: UIBounds): number {
  // `content.height` runs to 20px off the bottom of the screen, but the lane's Close button is
  // pinned inside that band — so the field must pay for it too. Measured on a 620-high screen,
  // leaving it out put the button straight through the order row, which is the exact failure
  // `verify-header-fit` and `verify-scroll` exist to catch and neither of them looks here.
  const closeBand = BATTLE_EXITS_OFFSET - 20 + 12;
  const room = content.height
    - BATTLE_RAILS_HEIGHT - BATTLE_DOCK_HEIGHT - closeBand - 24;
  /**
   * A shade under square was the *floor* of a picture, and it was being used as the ceiling.
   *
   * At 0.86 the field came out 301 units tall on an 844-high phone while `room` offered 398, and
   * the ninety-seven it declined became a band of blank parchment between the order dock and the
   * exits — reported as *battle screen look weird with space between bottom section*. Measured at
   * both clamps: 844 leaves the slack, 620 has none to leave (room binds at 191).
   *
   * 1.15 lets a tall screen spend what it has. Nothing about the men changes: `battleBaseScale`
   * clamps at a depth band of 114 and the band here is 167, so the extra height is ground, which
   * is what a battlefield should do with spare paper.
   */
  return Math.round(Math.max(150, Math.min(content.width * 1.15, room)));
}

/**
 * Opens the war on a named province, because the player pressed its mark on the map.
 *
 * Not `showBattle` directly: `openLane` is what makes `refresh` treat the field as the open sheet,
 * and drawing the page without the lane leaves a fight under a bar that thinks nothing is open
 * (`screens/army.ts` learned this the same way). `focusBattle` seats the player on the field they
 * pointed at, exactly as the war board's own rows do; where there is no engagement — a siege
 * clock, a host standing on our ground — `showBattle` falls through to the board, which is the
 * page that has something to say about both.
 *
 * Refused while a card or another sheet is up. A press that reaches the map through an open prompt
 * is the press-through bug and not a request; the map has its own guard against it
 * (`isScreenPointOverFixedUi`), and this is the second lock on the same door.
 */
export function openBattleAt(self: ConquestUIScene, landId: string): void {
  if (self.state.pendingAscentPrompt || self.openPromptKey !== '') return;
  const fighting = Boolean(battleAt(self.state, landId));
  if (fighting) focusBattle(self.state, landId);
  // Choosing a field is an instruction to fight on it, and the world runs while it is fought —
  // the same release the board's rows make, and for the same reason.
  self.lanePauseBeforeOpen = false;
  self.openLane('battle');
  // A siege clock with no engagement under it has no field to draw, and `showBattle` would seat
  // the player on whichever *other* fight most needs a pair of hands — which is not the mark
  // they pressed. The board is: it lists that province's clock along with the rest of the war.
  // Cast because the early return above narrows the key to '' and TypeScript has not seen
  // `openLane` reassign it.
  if (!fighting && (self.openPromptKey as string) === 'lane:battle') {
    // Straight to that province's own sheet rather than the board it sits on. The board is a list
    // of the whole war, and the player pressed one mark on the map — the sheet is the page with
    // the two orders that answer it: walk onto the field against whoever is standing there, and
    // call the neighbours in. It is the retake screen, and it heals back to the board itself when
    // the province turns out to have no front (a host marched off, a general settled it).
    self.replaceLanePage(() => self.showFrontSheet(landId));
  }
}

/**
 * Opens the battle screen the moment an engagement starts, and holds the world until the
 * player has given a first order.
 *
 * The screen used to wait to be found: `beginBattle` raised no prompt and no toast, the bar
 * grew a small Battle button, and the fight — four to six ticks long — was over before most
 * players noticed it. Now the fight announces itself. The hold is a *strategy* pause, released
 * by the first order (or by closing the screen), so reinforcements can still be marched in
 * once the fight is under way — the battle lane must never keep the world stopped.
 *
 * Returns true when it opened the lane, so the caller lets `openLane`'s own bar render stand.
 */
export function maybeAutoOpenBattle(self: ConquestUIScene): boolean {
  const battle = self.state.ascent?.activeBattle;
  if (!battle || battle.over) {
    self.reopenBattleAfterPrompt = false;
    return false;
  }
  if (self.state.pendingAscentPrompt || self.openPromptKey !== '') return false;
  const key = battle.key ?? `${battle.landId}:${battle.invaderArmyId}`;
  /**
   * New to *this screen* is not the same as new to the war.
   *
   * `promoteNextFront` moves the player onto a field a general has been holding for forty beats
   * when their own fight ends, and that field's key has never been auto-opened — so it read as
   * fresh, and the screen answered a running siege with the opening drum: the enemy's shape sealed
   * back to `?`, the world held for a first order, and a notice reading *the fight begins* over a
   * line that had been in contact since the wave landed. The drum belongs to a fight that has not
   * started, so it is gated on the fight, not on the key.
   */
  const fresh = key !== self.lastAutoOpenedBattleKey;
  const opening = ((battle.approachBeats ?? 0) + battle.round) === 0;
  // Only a fight that is *beginning* brings its screen up on its own, and only a card that
  // interrupted the fight brings it back. A running field the war promoted the chair onto —
  // after the player's own fight ended, or while they were reading elsewhere — is not an event
  // that moves them: it is listed on the board and the fronts chip, and it is theirs to open.
  if (!(fresh && opening) && !self.reopenBattleAfterPrompt) {
    if (fresh) self.lastAutoOpenedBattleKey = key;
    return false;
  }
  self.reopenBattleAfterPrompt = false;
  self.lastAutoOpenedBattleKey = key;
  // Sealed *before* the lane is built, so the first build is the only build. It used to open
  // unsealed and be rebuilt sealed a frame later — a full second field, ground bake and dock
  // whose only purpose was un-naming the shape the first one had leaked.
  self.battleSealPending = fresh && opening;
  self.openLane('battle');
  // `openLane` bails on a race (the fight ended between the tick and this frame).
  if ((self.openPromptKey as string) !== 'lane:battle') {
    self.battleSealPending = false;
    return false;
  }
  /**
   * **A fight that begins stops the world and says so — delegated or not.**
   *
   * Tried the other way for one round, on the reasoning that a fight nobody is going to order
   * has nothing to hold *for*. That was wrong about what the hold is for: it is not a wait for
   * an order, it is the moment the player is told a battle has started, on the screen where they
   * can take it over. Reported verbatim: *when battle start it must pause for information —
   * this fight, I don't know it happened.* It ends on its own after
   * `BATTLE_OPENING_SECONDS`, and "Tiếp tục" or any order ends it sooner.
   *
   * The mid-fight freeze this looked like is a different thing and is fixed where it lived: the
   * lane no longer inherits a stray pause (`openLane`).
   */
  if (fresh && opening) {
    self.battleAwaitingOrder = true;
    self.state.isStrategyPause = true;
    startBattleOpeningDrum(self);
    // The drum's timer now carries the seal (see `battleOpeningSealed`), so the pending flag
    // has done its job the moment the timer exists.
    self.battleSealPending = false;
  }
  return true;
}

/**
 * Counts the opening down and then starts the fight, whatever either side has chosen.
 *
 * A scene timer rather than a simulation one, because the world is strategy-paused for the whole
 * of it — the point of the hold is that no beat is resolved while the two sides are still
 * choosing. `BATTLE_OPENING_BEATS` seconds is enough to read five chips and commit, and short
 * enough that it reads as a drum roll rather than as a menu.
 */
function startBattleOpeningDrum(self: ConquestUIScene): void {
  self.battleOpeningTimer?.remove();
  self.battleOpeningLeft = BATTLE_OPENING_SECONDS;
  self.battleOpeningTimer = self.time.addEvent({
    delay: 1000,
    repeat: BATTLE_OPENING_SECONDS - 1,
    callback: () => {
      self.battleOpeningLeft = Math.max(0, self.battleOpeningLeft - 1);
      if (self.battleOpeningLeft > 0) {
        // Only the line moves. Rebuilding the dock every second would take the chip out from
        // under a thumb already on its way down.
        const battle = self.state.ascent?.activeBattle;
        if (battle) updateBattleNotice(self, battle);
        return;
      }
      self.battleOpeningTimer = undefined;
      releaseBattleHold(self);
      // The seal is off, and everything that hid behind it follows from that one flag flipping:
      // the dock's signature includes it (rims, telegraph), `shapeShown.theirs` moves off '?'
      // (their block stands up in its true shape), and the bubbles and notice re-read it. One
      // `updateBattle` redraws exactly those — the ground, the camps and our own host stand
      // still, where this used to rebuild the whole field a third time.
      if (self.state.ascent?.activeBattle && self.openPromptKey === 'lane:battle') {
        self.updateBattle();
      }
    },
  });
}

/**
 * The first order lets the fight run: the opening hold ends and the world resumes.
 *
 * `false`, not `lanePauseBeforeOpen`, and that is the whole bug. The lane captures whatever pause
 * was in force when it opened and every other screen hands it back on the way out — correct for a
 * screen you were *reading*, and wrong for this one. A battle can open itself while the world is
 * already strategy-paused (the player paused it, or a prompt did), and then the player's first
 * order restored the pause it had just been released from: the note said "the fight begins", the
 * dock accepted the tap, and nothing moved. Close was the only control that did anything, which
 * is exactly what a stuck screen looks like.
 *
 * Ordering a fight to start is an explicit instruction to start it.
 */
export function releaseBattleHold(self: ConquestUIScene): void {
  if (!self.battleAwaitingOrder) return;
  // An order given while the drum is still beating is *taken*, not acted on: the handler that
  // called this goes on to emit it, and the shape changes. What it does not do is start the
  // fight, because starting on your own tap is what let a player wait, read the enemy's shape and
  // then commit. The clock starts the fight, for both sides, at the same moment.
  if (self.battleOpeningTimer) return;
  self.battleAwaitingOrder = false;
  self.lanePauseBeforeOpen = false;
  self.state.isStrategyPause = false;
  // And the hard pause, which is the *other* half of this bug and the half that survived the
  // first fix. `isWorldHalted` is `isDefeated || isPaused || isStrategyPause`, so clearing only
  // the strategy pause still left a fight frozen for a player who had pressed Pause — which is
  // an entirely ordinary thing to do in a real-time game, and after which every tap on the dock
  // did nothing at all and Close was the only control that appeared to work.
  //
  // Ordering a fight to begin is an instruction to begin it, whichever clock was holding it.
  self.state.isPaused = false;
}

/**
 * The fight's own Pause.
 *
 * The battle lane keeps whatever pause was in force when it opened — correct, because the fight
 * is the world and a player who paused the world meant it — but it was the one lane with no
 * control and no word for that state: open a running siege from a paused map and every dial
 * accepted the tap while nothing moved. Resuming here clears both clocks and forgets the pause
 * the lane was opened under, so closing the screen afterwards does not hand the map a pause the
 * player already lifted (the same reasoning as `releaseBattleHold`). Pausing here is recorded
 * the other way round: the map stays paused when the player steps out, because they paused it.
 */
export function toggleBattlePause(self: ConquestUIScene): void {
  if (self.battleAwaitingOrder) return;
  if (self.battleHalted) {
    self.state.isStrategyPause = false;
    self.state.isPaused = false;
    self.lanePauseBeforeOpen = false;
  } else {
    self.state.isStrategyPause = true;
    self.lanePauseBeforeOpen = true;
  }
  self.refresh();
}

/** An order given to a paused fight is an instruction to run it — the opening-hold rule, kept. */
export function resumeBattleForOrder(self: ConquestUIScene): void {
  releaseBattleHold(self);
  if (self.battleHalted) toggleBattlePause(self);
}

/**
 * The fight's own header: who is commanding, where, and what the screen is shouting about.
 *
 * `promptFrame` centres a title over a subtitle, which is right for a card and wrong for this. The
 * fight is about a *person* holding a field, so: portrait hard left, name and the engagement
 * under it. Left-aligned, because a row that starts at the same x every time is read at a glance
 * where a centred one has to be found first.
 *
 * **The exits used to be a column in this corner and are not any more.** They are pressed once a
 * fight and they sat at the very top of a phone the whole rest of the screen is designed to be
 * played one-handed — reachable only by shifting the grip. They are at the foot now, beside the
 * dock the thumb already works; see `buildBattleExits`.
 *
 * What takes the corner instead is the band's third line: the fight's own notice, in sỏi son.
 * Every urgent red sentence this screen had was somewhere else — "the realm holds its breath"
 * was printed across the sky over the battlefield, the enemy's telegraph was a loose line under
 * the rails — so the one thing the player most needed to notice had no fixed place to appear and
 * two different ones to be hunted for. One line, always in the same spot, right of the commander.
 */
function battleHeaderFrame(self: ConquestUIScene, battle: AscentBattle): {
  content: UIBounds;
  exits: UIBounds;
  pips: UIBounds;
  notice: Phaser.GameObjects.Text;
  log: Phaser.GameObjects.Text;
} {
  /**
   * The fight starts under the resource strip, not under the run's readout as well.
   *
   * POWER, the level, the wave countdown and the threat figure are what you read *between*
   * fights; on a battlefield they are forty-eight points of chrome above the one picture the
   * screen exists to show, and this screen already carries three bands of its own. Reported
   * verbatim: *too much space for header — compact it and give the bottom more room for the
   * buttons.* The band below is opaque, so the readout is simply covered while the fight is up
   * and is back the moment it closes.
   */
  // On the desktop the stage is a framed modal rather than the screen (`battleStageSpan`): the
  // front page's royal scroll at the stage's width, and everything below lays out inside it.
  const { top, bottom: stageBottom, frame } = battleStageSpan();
  if (frame > 0) {
    self.modalLayer.add(royalScroll(
      self, -frame, top - frame, hudSheetWidth() + frame * 2, stageBottom - top + frame * 2, false,
    ));
    self.modalLayer.add(drawHouseSeal(self, houseBanner(), 24)
      .setPosition(hudSheetWidth() / 2, top - frame + 130));
  }
  // Opaque, and only this screen is. `beginOverlay` hides the map for the battle lane and for
  // nothing else, so the seven percent showing through at 0.93 was not the world - it was the
  // six scenes this game keeps resident behind everything (MenuScene, GuideScene, HistoryScene,
  // CampaignScene, MapScene, UIScene). The cards cover the middle of the page, so what a player
  // actually saw was two strips of main menu down the left and right margins: "Classic Modes"
  // and "Buy me a coffee" reading faintly beside a battlefield. The prompt frame below keeps
  // 0.93 on purpose - a card is meant to sit *over* the map, and there the map is still there.
  // Inside the scroll the plate is the scroll's own paper, so the cover is only a blocker there.
  const dim = self.add
    .rectangle(0, top, hudSheetWidth(), stageBottom - top, INK_UI.overlay, frame > 0 ? 0.001 : 1)
    .setOrigin(0, 0)
    .setInteractive();
  self.modalLayer.add(dim);

  const left = 20;
  const right = hudSheetWidth() - 20;
  const face = 46;
  const bandY = top + 8;

  // Whoever is actually holding the field. `generalName` is only stamped on delegation, so an
  // unsteered fight has to look its commander up the same way the fight itself does — which now
  // means `defenceCommanderOf`: the general of a host standing here, or the governor the player
  // posted to the province when the hosts are elsewhere. Reading only `generalHeroId` is why every
  // levy-fought defence said *chưa có chủ tướng* over a rally the maths was already granting.
  const led = ourHosts(self.state, battle).find((host) => host.generalHeroId)?.generalHeroId;
  const hero = (led ? self.state.heroes.find((candidate) => candidate.id === led) : undefined)
    ?? (battle.role === 'offence' ? undefined : defenceCommanderOf(self.state, findLand(self.state, battle.landId)));

  const plate = self.add.graphics();
  plate.fillStyle(INK_UI.parchmentShade, 1);
  plate.fillRoundedRect(left, bandY, face, face, 4);
  plate.lineStyle(1, INK_UI.softBrush, 1);
  plate.strokeRoundedRect(left, bandY, face, face, 4);
  self.modalLayer.add(plate);
  if (hero) {
    self.modalLayer.add(renderHeroFaceInBox(
      self, hero, { x: left, y: bandY, width: face, height: face },
    ));
  } else {
    // No commander: say so, rather than leave a hole where a face should be.
    self.modalLayer.add(self.ui.label(
      left + face / 2, bandY + face / 2, t('ascent.battle.noCommander'), 'caption',
      { fontSize: '8px', align: 'center', wordWrap: { width: face - 6 } },
    ).setOrigin(0.5));
  }

  /**
   * The commander's name under their own face, and the *place* takes the title.
   *
   * It was the other way round: the hero at 15px in the title face, the province underneath at
   * 10.5. Reported verbatim — *battle screen title is place of battle; name of hero small and under
   * the image* — and it is the right call for a reason beyond taste. This screen is opened from a
   * war board that lists fronts by province and from a toast that names one; the first thing the
   * player has to confirm is *which fight am I looking at*. A name is who, and who is already drawn
   * six points to the left.
   */
  const underName = self.add.text(
    left + face / 2, bandY + face + 2,
    hero ? hero.name : t('ascent.battle.noCommanderName'),
    {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '8.5px',
      align: 'center', wordWrap: { width: face + 12 },
    },
  ).setOrigin(0.5, 0);
  self.modalLayer.add(underName);
  // What the portrait column now costs in height, which `bandHeight` below has to clear or the
  // field's top edge is drawn straight through the name.
  const faceColumn = face + 2 + underName.height;

  const textX = left + face + 10;
  /**
   * The clock's own corner, opposite the commander.
   *
   * The round track was a full-width band between the header and the field, and it cost the
   * picture twenty-four points to say a thing that needs about twenty: how many rounds are left.
   * The two facts a player checks in the same glance are *who is holding this* and *how long
   * have I got* — so they take the two ends of one row, and the field gets the band back.
   *
   * Narrower beads, and that is fine. Nobody counts them; the row is read as a bar that fills.
   */
  /**
   * One gap between every row in this band, top to bottom.
   *
   * It was 2 under the name, 5 under the engagement and 13 under the notice — three different
   * spacings in four lines of type, because each row had been added at a different time and set
   * its own. Four rows on one rhythm read as a block; four rows on three rhythms read as things
   * that happen to be near each other.
   */
  const ROW_GAP = 3;
  const pipsW = 132;
  const pips = { x: right - pipsW, y: bandY + 2, width: pipsW, height: 24 };
  const textW = right - textX;
  // Only the two rows that sit beside the clock are held off it. The notice and the log line run
  // the full width underneath, where there is nothing to collide with.
  const topW = textW - pipsW - 10;
  const offence = battle.role === 'offence';
  // The place, and not the rival with it. The rails name the rival under their own strength bar
  // — in the size that band deserves — so repeating it here bought nothing and wrapped the line
  // to three at the width the clock leaves.
  const where = offence
    ? t('ascent.battle.assaultTitle', { land: battle.landName })
    : battle.isGreat
      ? t('ascent.battle.greatTitle', { land: battle.landName })
      : t('ascent.battle.title', { land: battle.landName });
  /**
   * **The seat says so, above its own name.**
   *
   * Reported: *fight screen should highlight this is capital*. Nothing on this screen said which
   * province it was — the title reads the same for a border district and for the one whose fall
   * ends the run, and the player has to remember the map to tell them apart. So the capital gets a
   * seal above the title: cinnabar plate, paper-coloured caps, and the stake spelled out on it
   * rather than left to be remembered.
   *
   * A row rather than a chip beside the title, because the title's own column is 162 units on a
   * phone and already wraps to two lines; anything set beside it would push it to three. The
   * header grows by thirteen units, and only for the one fight that is worth thirteen units.
   */
  const atCapital = self.state.ascent?.capitalLandId === battle.landId;
  let sealRoom = 0;
  if (atCapital) {
    const mark = self.ui.label(0, 0, t('ascent.battle.capitalMark'), 'label', {
      color: INK_UI_HEX.lightText, fontSize: '8.5px', fontStyle: '700',
    }).setOrigin(0, 0.5);
    /**
     * Shrunk, never wrapped: the mark is one stamp, and a stamp that breaks in half is a mistake.
     *
     * **No letter spacing**, though caps at this size are asking for it. `Text.width` does not
     * count it, so the fit below measured 210 units for a run that drew 258 and the English mark
     * printed straight out of its own plate and under the round track. The stamp is legible
     * without it; a measurement that lies is not worth the tracking.
     */
    if (mark.width > topW - 10) mark.setScale(Math.max(0.62, (topW - 10) / mark.width));
    const plateW = Math.min(topW, mark.displayWidth + 10);
    const plateH = 13;
    const seal = self.add.graphics();
    seal.fillStyle(INK_UI.cinnabar, 0.92);
    seal.fillRoundedRect(textX, bandY, plateW, plateH, 2);
    self.modalLayer.add(seal);
    mark.setPosition(textX + 5, bandY + plateH / 2);
    // Named so a harness can find the stamp and measure it against the round track beside it.
    mark.setData('capitalMark', true);
    self.modalLayer.add(mark);
    sealRoom = plateH + 2;
  }

  const desc = self.add.text(textX, bandY + 1 + sealRoom, where, {
    color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '15px', fontStyle: '700', lineSpacing: 1,
    wordWrap: { width: topW },
  }).setOrigin(0, 0);
  self.modalLayer.add(desc);

  /**
   * One line of room, kept whether or not there is anything to say.
   *
   * Reserved rather than measured because this line changes on the beat — hold, then telegraph,
   * then tempo — and a header that grew and shrank with it would walk the whole screen up and
   * down every couple of seconds. It used to reserve *two* lines against the longest rival name
   * wrapping the telegraph, which is what put a thirteen-point hole between it and the line
   * under it; `updateBattleNotice` shrinks to fit instead, the same way the log line does.
   */
  const noticeY = Math.max(desc.y + desc.height + ROW_GAP, pips.y + pips.height + ROW_GAP);
  const notice = self.add.text(textX, noticeY, '', {
    color: cssHex(INK_UI.cinnabar),
    fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
  }).setOrigin(0, 0);
  notice.setMaxLines(1);
  self.modalLayer.add(notice);
  const NOTICE_ROOM = 13 + ROW_GAP;

  /**
   * What just happened, in the header — because on a real phone it could not be read where it was.
   *
   * The fight writes about twenty-one lines an engagement and they are printed along the foot of
   * the battlefield, over hatching, on a plate at 0.82. That is the right place for them as
   * *atmosphere* and a hopeless one as information: photographed off an actual handset, the older
   * of the two lines is not legible at all. So the newest one is repeated here, on paper, at the
   * one place on this screen the eye already goes for words.
   *
   * One line, and the newest. A header that scrolled a feed would be a second thing to read
   * during a fight that already asks for a decision every beat.
   */
  const log = self.add.text(textX, noticeY + NOTICE_ROOM, '', {
    color: INK_UI_HEX.mutedText,
    fontFamily: UI_FONT, fontSize: '10px', fontStyle: '400',
  }).setOrigin(0, 0);
  log.setMaxLines(1);
  self.modalLayer.add(log);
  const LOG_ROOM = 13;

  // `faceColumn`, not `face`: the commander's name hangs below the portrait now, and a band sized
  // to the plate alone draws the field's top rule through it.
  const bandHeight = Math.max(faceColumn, noticeY - bandY + NOTICE_ROOM + LOG_ROOM);
  const cursor = bandY + bandHeight + 6;
  return {
    content: { x: left, y: cursor, width: hudSheetWidth() - 40, height: stageBottom - cursor - 20 },
    // The whole row, not one chip: `buildBattleExits` divides it, and the coach lights it. A
    // rectangle that covered only the left button pointed at half of what the card described.
    exits: {
      x: left,
      y: stageBottom - BATTLE_EXITS_OFFSET,
      width: hudSheetWidth() - 40,
      // Four taller than a lane's Close button. These two carry a heading and a line under it,
      // in a language whose `tướng đánh nốt thay bạn` is half again the English.
      height: LANE_CLOSE_BUTTON_HEIGHT + 4,
    },
    notice,
    log,
    pips,
  };
}

/**
 * The field battle, live.
 *
 * Runs on its own clock rather than advancing one exchange per tap. The first version made a
 * battle feel like filling in a form — each press nudged the armies a few pixels closer and
 * nothing happened in between — so the controls are now *standing orders* the player changes
 * while the fight runs, which is what watching a battle has to mean.
 *
 * Each side starts at its own camp. The invader always advances; the player's line advances
 * only on `press` and falls back toward its tents on `hold`, so the posture is visible on the
 * field rather than only readable in a description. Blood is only traded once the lines meet.
 *
 * Built in three layers, each refreshed on its own terms by `updateBattle`. The screen used
 * to be built once and never touched again — `refresh` skips the modal layer while a lane
 * owns it — so the numbers, the bars and the two armies all held their opening values for as
 * long as the player watched, while the real fight ran to its end underneath. A battle screen
 * that cannot show the battle is the whole feature.
 */
/**
 * **If there is a fight, this screen is the fight.** No list, no interstitial, no exceptions.
 *
 * The board briefly stood in front of it whenever the war was on more than one field, so that
 * the bar button could reach the other two — and that was wrong twice over. It put a menu
 * between the player and the one screen the button names; and because tapping a row on it went
 * out through `closeLane` (which calls `refresh`, which can re-enter this lane on its own and
 * eat the request), a tap could land back on the board with nothing changed but the row order.
 * Reported verbatim, and fairly: *a page I click open battle, no other reason than to show the
 * battle screen* — *make click move to top, what logic is that?*
 *
 * The other fields are reached from inside the fight (the fronts chip on the near corner) and
 * from the army screen's war section. The board is what the lane shows when there is nothing to
 * fight yet: a siege, or a host standing on our ground that no engagement has opened over.
 */
export function showBattle(self: ConquestUIScene): void {
  const state = self.state;
  let battle = state.ascent?.activeBattle;
  // A general holding a field with nobody in the chair is not a reason to show a list either:
  // seat the player on it. `promoteNextFront` picks the field that most needs a pair of hands.
  if ((!battle || battle.over) && liveBattleCount(state) > 0) {
    promoteNextFront(state);
    battle = state.ascent?.activeBattle;
  }
  if (!battle || battle.over) {
    // `showWarBoard` restores the map itself — it is reached from more doors than this one.
    showWarBoard(self);
    return;
  }
  // On the desktop the fight takes a wider stage than the column; everything below lays itself
  // out against `hudSheetWidth()`, so this comes before any of it is measured.
  setHudSheet(self, true);
  // ...and the field *is* a sheet instead of it: full-bleed parchment with nothing behind it.
  setMapVisible(self, false);
  // The bed under the fight, and the only music in the game. Sized to the field: the epic pair
  // is held for ten thousand a side, which is the tier the mode already draws.
  startBattleMusic(self, battle);
  // Read here, whichever page was drawn. It is an announcement about a moment, and a flag that
  // outlives the screen it was raised for re-raises that screen every frame — `shell.ts`'s
  // refresh opens this lane while it stands.
  if (state.ascent?.frontsOpened) state.ascent.frontsOpened = undefined;

  // The escalation floors read this run's wave; everything outside Dragon Ascent stays at 0.
  setBattleEscalationWave(self.state.ascent?.wave ?? 0);
  // The Skirmish page's bubble pin rides its state; every other mode clears it here.
  setBattleBubbleOverride(self.state.ascent?.arenaBubbleMs);

  self.battleItems ??= createMapItemRenderer(self);
  // A fresh field starts even: the press belongs to this engagement, not the last one.
  self.battlePress = 0;
  const rival = self.state.kingdoms.find((k) => k.id === battle.kingdomId);
  const rivalColor = rival?.color ?? INK_UI.cinnabar;

  const frame = battleHeaderFrame(self, battle);
  const content = frame.content;

  const fieldHeight = battleFieldHeight(content);
  const fieldY = content.y;
  // The men stand a little below centre, so the camps and the horizon have room above them.
  // Where the two lines stand, as a fraction of the field.
  //
  // 0.56 put the fight in the middle and left the whole bottom four-tenths as bare paper: the
  // horizon takes the top three-tenths, so the picture was a strip of country with an empty
  // apron under it. Dropping the line gives that space to the middle distance, which is the part
  // that has something in it, and leaves the near ground as a margin rather than as a void.
  /**
    * 0.78, down from 0.68.
    *
    * The men are drawn upward from this line, and once they were drawn at 2.2 rather than 1.93
    * the whole engagement rode high in the frame with a bare apron of near ground under it — the
    * opposite of the fault 0.68 was set to fix, and by the same amount. Lower puts the fight
    * where the eye rests and hands the space it takes back to the middle distance, which has the
    * ridges and the paddy in it.
    */
   /**
   * Where the two lines stand, as a share of the field.
   *
   * **0.72, up from 0.78.** The hosts sat low enough that the apron beneath them was a third of
   * the picture doing nothing while the men were crowded against the readout — reported as *can
   * the army up a bit in this fight*. Six points of the field is about twenty units on a tall
   * screen: enough that the blocks sit in the middle of the ground rather than at the bottom of
   * it, and short of the range where `battleBaseScale` starts shrinking the men (the depth band
   * stays clear of its 114-unit floor at every screen height the game supports).
   */
  const groundY = fieldY + Math.round(fieldHeight * 0.72);
  // **The field is full-bleed; the rows under it are not.**
  //
  // Everything else on this screen is a card inside a 20px margin, and the field was drawn as
  // one of them and then inset another 44 on each side for the men — so of a 390-wide sheet the
  // fight had 262 to happen in, a third of the width spent on paper either side of a picture
  // that is the reason the screen exists. The rails, the dock and the exits keep the margin,
  // because they are cards and read as cards. The field is a *view*, and a view wants the glass.
  const leftX = BATTLE_FIELD_INSET;
  const rightX = hudSheetWidth() - BATTLE_FIELD_INSET;
  // Full span, not half: the two meet when `ourAdvance + theirAdvance` reaches 1, so the
  // drawing has to use the same scale or the picture and the fight would disagree about where
  // everyone is standing.
  const span = rightX - leftX - 60;

  const field = self.add.container(0, 0);
  const bubbles = self.add.container(0, 0);
  const floaters = self.add.container(0, 0);
  const pips = self.add.container(0, 0);
  const readout = self.add.container(0, 0);
  const orders = self.add.container(0, 0);
  const exits = self.add.container(0, 0);
  const moment = self.add.container(0, 0);
  const relief = self.add.container(0, 0);
  const fanfare = self.add.container(0, 0);
  const fallen = self.add.graphics();
  field.add(fallen);
  self.modalLayer.add([field, bubbles, floaters, pips, readout, relief, fanfare, orders, exits, moment]);

  self.battleUi = {
    content,
    fieldHeight,
    coachBounds: {},
    field,
    bubbles,
    bubbleSaid: { ours: '', theirs: '' },
    bubbleAt: { ours: 0, theirs: 0 },
    bubbleShoutAt: 0,
    bubbleOf: {},
    bubbleFaded: { ours: false, theirs: false },
    bubbleCalled: {},
    fanfare,
    notice: frame.notice,
    logLine: frame.log,
    pipBounds: frame.pips,
    readout,
    pips,
    floaters,
    orders,
    exits,
    fallen,
    fallenPts: [],
    fallenCount: 0,
    moment,
    momentKey: '',
    relief,
    reliefKey: '',
    groundSources: [],
    exitBounds: frame.exits,
    rivalColor,
    fieldSignature: '',
    orderSignature: '',
    exitsKey: '',
    shapeShown: { ours: '', theirs: '' },
    railsSignature: '',
    ourMarkers: [],
    theirMarkers: [],
    geometry: { leftX, rightX, span, groundY },
  };

  // Come back to a siege already under way and the queue may hold half a minute of beats
  // nobody watched. Replaying them would put the picture a tick behind the numbers, so all
  // but the last are dropped and the screen opens on where the fight actually is.
  const queued = battle.beats;
  if (queued && queued.length > 2) queued.splice(0, queued.length - 2);

  self.buildBattleField(battle);
  self.buildBattleRails(battle);
  self.updateBattleRails(battle);
  buildBattlePips(self, battle);
  self.buildBattleOrders(battle);
  // The two exits ARE the foot of this screen now — the lane's own Close button is not drawn
  // here. Leaving hands the rest of the fight to the general and steps away, which is what
  // closing it did anyway; two buttons that do nearly the same thing, one of them unlabelled as
  // to what it costs, is worse than one that says so.
  self.buildBattleExits(battle);
  self.buildBattleMoment(battle);
  self.updateBattleBubbles(battle);
  updateBattleNotice(self, battle);
  updateBattleLogLine(self, battle);

  self.startBattleClock();
}

/**
 * The round track: `totalRounds` pips, filled as the fight spends them.
 *
 * The round limit has always existed and has never been shown, so an engagement that ground
 * to `spent` looked like it simply stopped. A visible countdown is what turns attrition into
 * a race — and it is what gives the last third of a fight any urgency at all.
 */
export function buildBattlePips(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { pipBounds: box, pips } = ui;
  // The track is one graphics and one label for the whole fight; a beat clears and re-fills it.
  // Throwing both away and making them again cost 5.3 ms a beat to move one pip along.
  if (!ui.pipTrack?.active) {
    clearLayer(self, pips);
    ui.pipTrack = self.add.graphics();
    pips.add(ui.pipTrack);
    ui.pipsLeft = self.ui.label(
      box.x + box.width, box.y + 9, '', 'caption',
      { fontSize: '10px', align: 'right' },
    ).setOrigin(1, 0);
    pips.add(ui.pipsLeft);
  }

  // A gap of one, not two: at 132 points wide a thirty-round fight gives each bead about three,
  // and a two-point gap either side of that is more air than bead.
  /**
   * The track counts down to the grind, not to the end of the fight.
   *
   * Nothing stops at the last bead any more — a fight ends when a line breaks. What the last bead
   * marks is the round at which both sides start losing heart simply for still being there, and
   * once it is passed the whole track goes to sỏi son and the label stops counting down and
   * starts counting up. A player who has watched one fight go into it knows what a full red track
   * means without being told.
   */
  const total = Math.max(1, battle.totalRounds);
  const over = battle.round >= total;
  const gap = 1;
  const width = (box.width - gap * (total - 1)) / total;
  const g = ui.pipTrack;
  g.clear();
  for (let i = 0; i < total; i += 1) {
    const spent = i < battle.round;
    const current = i === battle.round;
    g.fillStyle(
      over ? INK_UI.cinnabar : current ? INK_UI.cinnabar : spent ? INK_UI.gold : INK_UI.softBrush,
      over || spent || current ? 0.95 : 0.3,
    );
    g.fillRect(box.x + i * (width + gap), box.y, Math.max(1, width), over || current ? 6 : 4);
  }

  const left = Math.max(0, battle.totalRounds - battle.round);
  const label = over
    ? t('ascent.battle.overtime', { n: battle.round + 1 })
    : t('ascent.battle.roundsLeft', { n: left });
  if (ui.pipsLeft?.active && ui.pipsLeft.text !== label) {
    ui.pipsLeft.setText(label);
    ui.pipsLeft.setColor(over ? cssHex(INK_UI.cinnabar) : INK_UI_HEX.mutedText);
  }
}

/**
 * The newest line of the fight's own account, repeated in the header.
 *
 * The ribbon along the foot of the field keeps it too — that is where it belongs as atmosphere,
 * printed over the ground it is describing. But it is 10-point type on a 0.82 plate over hatching,
 * and photographed off a real handset the older of its two lines cannot be read at all. The
 * header carries the same sentence on plain paper, and the two never disagree because both are
 * written from `battle.log` on the same beat.
 *
 * Shrunk to fit rather than wrapped: the band's rows are reserved heights, and a second line here
 * would push the field down every time the fight said something long.
 */
export function updateBattleLogLine(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui?.logLine?.active) return;
  const newest = battle.log[battle.log.length - 1] ?? '';
  if (ui.logLine.text === newest) return;
  ui.logLine.setFontSize(10);
  ui.logLine.setText(newest);
  const room = hudSheetWidth() - 20 - ui.logLine.x;
  for (let size = 9.5; size >= 8 && ui.logLine.width > room; size -= 0.5) {
    ui.logLine.setFontSize(size);
  }
}

/**
 * The fight's one red line, in the header band.
 *
 * Everything urgent this screen had to say used to be said somewhere different: the opening hold
 * across the sky over the battlefield, the enemy's telegraph in a loose line under the rails, the
 * stance lock as an eight-point note tucked against the right edge of the dock. Three places for
 * one job, none of them where the eye starts.
 *
 * Ranked, and only ever one at a time. A notice strip that stacks is a notice strip nobody reads
 * — and the ranking is the order the player can act on them: the hold blocks the fight entirely,
 * then what the enemy is walking into, then what they will do next beat.
 *
 * The stance lock is deliberately *not* in the ranking. It has its own eight-point note against
 * the strip it greys out, which is where a refused control should explain itself; repeated up
 * here it was the same four words printed twice on one screen.
 */
export function updateBattleNotice(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui?.notice?.active) return;

  const read = self.battleOpeningSealed ? undefined : battleTelegraph(self.state);
  let line = '';
  if (self.battleOpeningSealed) {
    line = t('ascent.battle.openingDrum', { n: String(self.battleOpeningLeft) });
  } else if (self.battleAwaitingOrder) {
    line = t('ascent.battle.holdNote');
  } else if (self.battleHalted) {
    // Said in the one line the eye already reads for "what is happening": the answer is nothing,
    // and here is how to make it happen.
    line = t('ascent.battle.pausedNote');
  } else if (read?.next) {
    line = t('ascent.battle.theyForm', {
      kingdom: battle.kingdomName,
      shape: t(`ascent.formation.${read.next}.full` as Parameters<typeof t>[0]),
      n: String(read.beatsLeft),
    });
  } else if (read) {
    line = t(`ascent.battle.theyWill.${read.stance}` as Parameters<typeof t>[0], {
      kingdom: battle.kingdomName,
    });
  }
  if (ui.notice.text === line) return;
  // One line, shrunk to fit — see `battleHeaderFrame`. A rival with a four-word name makes the
  // telegraph the longest sentence this band ever prints.
  ui.notice.setFontSize(10);
  ui.notice.setText(line);
  const room = hudSheetWidth() - 20 - ui.notice.x;
  for (let size = 9.5; size >= 8 && ui.notice.width > room; size -= 0.5) {
    ui.notice.setFontSize(size);
  }
}
