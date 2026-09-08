/**
 * The first-run walkthrough that plays over a live run: `maybeRunTour`, and `tourStages` — the
 * coached moments in the order they can happen, from the throne card through the bar, the first
 * fight and the first wave. Nothing here draws: a stage is a list of `CopilotStep`s handed to
 * `Copilot`, which owns the veil and the arrows.
 *
 * Polled, not scheduled — `renderActionBar` calls `maybeRunTour` on every economy tick, so the
 * `runTour`/`tourActive` guard and `tourStagesShown` are all that stand between a run and a
 * walkthrough restarting every frame. Each stage stops the world and restores the pause it found,
 * because a `Copilot` runs its steps to the end without re-reading the screen; and every rectangle
 * comes off a live widget (`slotBounds`, `actionBarSlots`, `coachBounds`), never recomputed here.
 */
import { battleTelegraph } from '../../systems/ascent/BattleSystem';
import { Copilot, type CopilotStep } from '../../ui/Copilot';
import type { UIBounds } from '../../ui/InkUI';
import { drawFormationCounters } from '../../ui/ascent/formationCounters';
import { markRunTourSeen } from '../../state/tour';
import { ACTION_BUTTON_HEIGHT, ACTION_BUTTON_Y, actionBarSlots } from '../../ui/ActionBar';
import type { ConquestUIScene } from '../ConquestUIScene';
import { realmUnderAttack } from '../../systems/ascent/battleReport';


/**
 * The four cards a first run is shown, once.
 *
 * Deliberately gated on the run being *playable* — no prompt up, the bar and the advisor both on
 * screen. A tour that opened over the founder card would be pointing at a band the player cannot
 * see and a bar that is not drawn, and its own blocker would sit on top of a decision that has
 * to be answered before anything else can happen.
 *
 * The flag is separate from the front page's. They teach different things, a player may well
 * arrive here having skipped the other, and a first run reached from a saved game never saw the
 * front page's at all.
 */
export function maybeRunTour(self: ConquestUIScene, hidden: boolean): void {
  if (self.runTour || !self.tourActive) return;

  /**
   * A stage may speak over a decision card only if it is *about* that card.
   *
   * The first three are, and they have to be: the throne card is the very first thing a run
   * puts on the screen, and it asks a permanent question about three options a new player has
   * never seen. Waiting for a clear frame meant the walkthrough opened by explaining the band
   * to somebody who had already guessed at it. Everything after them describes the map, the
   * bar or the clock, and none of that is visible behind a card — those wait.
   */
  const stage = tourStages(self).find((candidate) => !self.tourStagesShown.has(candidate.id)
    && (!self.state.ascent?.arena || candidate.id === 'fight')
    && (candidate.overCard || !hidden)
    && candidate.when());
  if (!stage) return;

  self.tourStagesShown.add(stage.id);
  /**
   * The world stops while a card is being read.
   *
   * Not politeness — correctness. A stage is chosen against the state of the screen at the
   * moment it opens, but a `Copilot` then runs its own steps to the end without asking again,
   * and the clock underneath was still turning. So the walkthrough would reach "here is the
   * action bar", pointing at a bar that a doctrine card arriving two seconds earlier had
   * already hidden — the coach describing one screen while the player looks at another.
   *
   * Stopping the clock removes the race rather than papering over it: no prompt can be raised
   * between the first card of a stage and the last, so what the coach points at is still there
   * when it points at it. The previous pause state is restored, exactly as `openLane` does,
   * because a player who had deliberately stopped the clock must not find it running again.
   */
  self.tourPauseBefore = self.state.isStrategyPause;
  self.state.isStrategyPause = true;
  self.runTour = new Copilot(self, {
    steps: stage.steps(),
    // Only the stage that ends with "now let it run" may offer to start playing. Every other
    // card in the walkthrough is read in the middle of a run that is already going.
    finishLabel: stage.id === 'opening' ? undefined : 'copilot.gotIt',
    onClose: () => {
      self.state.isStrategyPause = self.tourPauseBefore;
      // Marked on the first stage, not the last. A player who leaves after two cards has still
      // had the introduction offered, and a walkthrough that restarts from the throne every time
      // a run is abandoned is the most irritating thing this could possibly do. The rest of the
      // stages keep coming for the remainder of *this* run, which `tourActive` already decided.
      markRunTourSeen();
      self.runTourDone = true;
      self.runTour = undefined;
    },
  });
}

/**
 * The coached moments of a run, in the order they can happen.
 *
 * Each is keyed to a condition rather than to a tick, and fires once. The point of the later
 * three is that they arrive **while the thing they describe is on the screen**: a paragraph
 * about what a decision costs you is worth very little in a manual and quite a lot immediately
 * after the first one has been answered, with the band showing what it did.
 */
export function tourStages(self: ConquestUIScene): Array<{
  id: string;
  /** May be raised while a decision card owns the screen. Only for stages about that card. */
  overCard?: boolean;
  when: () => boolean;
  steps: () => CopilotStep[];
}> {
  const ascent = self.state.ascent;
  // A one-card stage. Placement is no longer the caller's business: every card is anchored to
  // the foot of the sheet so its buttons are inside a thumb's reach, and the arrow drawn from
  // the card is what connects it to whatever it is describing.
  const card = (id: string, heading: string, body: string): CopilotStep[] =>
    [{ id, heading: heading as CopilotStep['heading'], body: body as CopilotStep['body'] }];
  const showing = (kind: string) => self.openPromptKey.startsWith(kind);
  /**
   * A box off the battle screen, moved onto the sheet the tour draws on.
   *
   * Every part of the fight is built into `modalLayer` in the column's own 390-wide units, and on
   * the desktop that layer is *moved* to centre the 640-wide stage on the sheet
   * (`placeModalLayer`) rather than laid out again. The tour draws in the scene's coordinates, so
   * a rectangle taken straight off the dock lit the patch of dimmed map where the stage would
   * stand on a phone — measured at 319 units left of the fight it was describing on a 1512-wide
   * window. The layer's own position is the exact distance, and it is 0 on the phone.
   */
  const onSheet = (box: UIBounds | undefined): UIBounds | undefined => (box ? {
    x: box.x + self.modalLayer.x,
    y: box.y + self.modalLayer.y,
    width: box.width,
    height: box.height,
  } : undefined);

  return [
    // ── The opening cards, explained while they are on the screen ────────
    {
      id: 'mandate',
      overCard: true,
      when: () => showing('mandate'),
      steps: () => card('mandate', 'copilot.run.mandate.h', 'copilot.run.mandate.b'),
    },
    {
      id: 'founder',
      overCard: true,
      when: () => showing('founder'),
      steps: () => card('founder', 'copilot.run.founder.h', 'copilot.run.founder.b'),
    },
    {
      id: 'court',
      overCard: true,
      when: () => showing('court-appointment'),
      steps: () => card('court', 'copilot.run.court.h', 'copilot.run.court.b'),
    },
    {
      id: 'opening',
      when: () => true,
      steps: () => [
        /**
         * The four stores, one card each, pointed at individually.
         *
         * The strip was the last unexplained thing on the screen and the first thing a player
         * looks at: four icons, four numbers and four signed rates, none of which says what it
         * is or what it is for. One card naming all four would have been cheaper and would have
         * taught nobody which icon was which — so each card lights its own slot, and the slot is
         * read from the strip rather than guessed, because `reflow` packs the row by measured
         * width and a realm holding 29.1k gold puts the people icon somewhere else entirely.
         */
        {
          id: 'res-food',
          heading: 'copilot.run.food.h',
          body: 'copilot.run.food.b',
          target: () => self.resourceBar.slotBounds('food'),
        },
        {
          id: 'res-supplies',
          heading: 'copilot.run.supplies.h',
          body: 'copilot.run.supplies.b',
          target: () => self.resourceBar.slotBounds('supplies'),
        },
        {
          id: 'res-gold',
          heading: 'copilot.run.gold.h',
          body: 'copilot.run.gold.b',
          target: () => self.resourceBar.slotBounds('gold'),
        },
        {
          id: 'res-people',
          heading: 'copilot.run.people.h',
          body: 'copilot.run.people.b',
          target: () => self.resourceBar.slotBounds('humans'),
        },
        {
          id: 'band',
          heading: 'copilot.run.band.h',
          body: 'copilot.run.band.b',
          // Off the band itself: on the desktop it is lifted out of the column and set beside the
          // stores in the top bar (`AscentHud.bounds`).
          target: () => self.hud.bounds(),
        },
        {
          id: 'coach',
          heading: 'copilot.run.coach.h',
          body: 'copilot.run.coach.b',
          target: () => self.advisor.tapBounds()[0],
        },
      ],
    },
    /**
     * The bar, one button at a time.
     *
     * It used to be a single card naming all six screens in a row, which is a paragraph rather
     * than an explanation: a reader finishes it knowing there are six of something and not which
     * is which. Every button now lights on its own and is told what is behind it and — the part
     * that actually changes how the game is played — what its status dot means, because the dot
     * is the game telling you when to open that screen and nothing anywhere says so.
     *
     * Built from `actionBarSlots`, the same function the bar itself lays out from, so the lit
     * rectangle is the button rather than an approximation of where a button probably is. The
     * keys come from the live bar too: `battle` exists only while a siege does, and a card
     * pointing at a button that is not drawn would light up an empty patch of the bar.
     */
    {
      id: 'bar',
      when: () => true,
      steps: () => {
        const context = { battleLive: realmUnderAttack(self.state) };
        // The bar's own width: on the desktop it spans the sheet and the cluster is at its far end.
        const slots = actionBarSlots(self.state.gameMode, context, self.actionBar.barWidth);
        const known = ['battle', 'build', 'heroes', 'court', 'army', 'affairs', 'chronicle', 'pause', 'menu'];
        return slots
          .filter((slot) => known.includes(slot.action))
          .map((slot) => ({
            id: `bar-${slot.action}`,
            heading: `copilot.bar.${slot.action}.h` as CopilotStep['heading'],
            body: `copilot.bar.${slot.action}.b` as CopilotStep['body'],
            // Off the bar itself: on the desktop the pause/menu cluster is lifted into the top bar.
            target: () => self.actionBar.slotBounds(slot.action) ?? ({
              x: slot.x,
              y: ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2,
              width: slot.width,
              height: ACTION_BUTTON_HEIGHT,
            }),
          }));
      },
    },
    {
      id: 'go',
      when: () => true,
      steps: () => {
        // The scripted part ends here, so this is the line the `decision` card measures from.
        self.promptsAtHandover = self.promptsAnswered;
        return card('go', 'copilot.run.go.h', 'copilot.run.go.b');
      },
    },
    /**
     * The fight, the first time one is watched.
     *
     * The screen the coach had least business skipping and skipped anyway: it is a whole
     * interface of its own — two hosts, a round clock, a telegraph line, four stances, five
     * shapes and two ways out — and none of it appears anywhere else in the game. It was
     * skipped because a lane sets `openPromptKey`, which is how `maybeRunTour` decides a card
     * owns the glass; `overCard` is what lets a stage speak when the thing it is about IS the
     * thing owning the glass.
     *
     * Every rectangle comes off `battleUi.coachBounds`, recorded by the dock as it lays itself
     * out. The dock is four constants deep and another session is actively moving it; a second
     * copy of that arithmetic here would be wrong within the week.
     */
    {
      id: 'fight',
      overCard: true,
      when: () => self.openPromptKey === 'lane:battle' && Boolean(self.battleUi?.coachBounds.stance),
      steps: () => {
        const box = (key: 'pips' | 'field' | 'rails' | 'readout' | 'stance' | 'formation') =>
          () => onSheet(self.battleUi?.coachBounds[key]);
        return [
          {
            id: 'fight-rails',
            heading: 'copilot.fight.rails.h',
            body: 'copilot.fight.rails.b',
            target: box('rails'),
          },
          {
            id: 'fight-pips',
            heading: 'copilot.fight.pips.h',
            body: 'copilot.fight.pips.b',
            target: box('pips'),
          },
          {
            // The bubbles, not the dock. What each side is doing is said over its own men now,
            // and the card that explains that has to light the men rather than a band of type
            // three rows below them.
            id: 'fight-read',
            heading: 'copilot.fight.read.h',
            body: 'copilot.fight.read.b',
            target: box('field'),
          },
          {
            id: 'fight-stance',
            heading: 'copilot.fight.stance.h',
            body: 'copilot.fight.stance.b',
            target: box('stance'),
          },
          {
            // The wind, between the stance (which sets its rate) and the shapes (which spend
            // it): the one rule of the rework a first fight must say out loud, because an
            // aggressive player will feel punished before they understand why.
            id: 'fight-wind',
            heading: 'copilot.fight.wind.h',
            body: 'copilot.fight.wind.b',
            // The readout band, not the chips: the dock count and the enemy's spent shapes
            // print there, and the shapes card right after this one already lights the strip.
            target: box('readout'),
          },
          {
            /**
             * The one card in the game that carries a drawing, and the reason `CopilotStep.art`
             * exists at all.
             *
             * The counter ring is the whole of the fight's decision and the only way the coach
             * had to state it was "laid out in the ring order they beat each other in" — a
             * sentence describing a picture. Nobody holds five names, a direction and a step
             * count in their head with a host closing on them. The table says it in one look.
             */
            id: 'fight-shapes',
            heading: 'copilot.fight.shapes.h',
            body: 'copilot.fight.shapes.b',
            target: box('formation'),
            art: (x, y, width) => drawFormationCounters(self, x, y, width, {
              // Lit on the row the fight is actually asking about, when it is asking one.
              highlight: battleTelegraph(self.state)?.formation,
            }),
          },
          {
            id: 'fight-exits',
            heading: 'copilot.fight.exits.h',
            body: 'copilot.fight.exits.b',
            target: () => onSheet(self.battleUi?.exitBounds),
          },
        ];
      },
    },
    // ── The rest of a real run, each at the moment it first happens ─────
    {
      id: 'decision',
      // A decision answered in ordinary play, after the walkthrough let go — not one of the
      // opening cards the walkthrough itself just talked the player through.
      when: () => self.promptsAtHandover >= 0 && self.promptsAnswered > self.promptsAtHandover,
      steps: () => card('decision', 'copilot.run.decision.h', 'copilot.run.decision.b'),
    },
    {
      // The first wave, while it is still coming. `wave` is 0 until one has actually landed, so
      // this is the muster before the first — the one moment in a run where the countdown means
      // something the player has not seen before.
      id: 'muster',
      when: () => Boolean(ascent) && ascent!.wave === 0 && ascent!.ticksToWave <= 2,
      steps: () => card('muster', 'copilot.run.muster.h', 'copilot.run.muster.b'),
    },
    {
      id: 'aftermath',
      when: () => Boolean(ascent) && ascent!.wavesSurvived >= 1,
      steps: () => card('aftermath', 'copilot.run.aftermath.h', 'copilot.run.aftermath.b'),
    },
  ];
}
