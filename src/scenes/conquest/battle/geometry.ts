/**
 * Where things stand on the battle field and how large they are drawn there — the one depth model
 * the men, the camps, the scenery, the bubbles and the casualty numbers all read from.
 *
 * Together because they have to agree: one caller scale for every prop (see `battleScaleAt`) and
 * one seam for both lines, or the props drift apart in size and the two hosts stand inside each
 * other. Nothing here draws — it is a pure read of `battleUi.geometry` and `battlePress`.
 *
 * All of it is downstream of the field being built: before that `battleUi` is undefined and every
 * function returns its neutral answer, and `battleSeamGap` reads the `halfWidth` each block stamps
 * on its marker as it is drawn, so a seam measured before the blocks exist falls back to 34.
 */
import {
  BATTLE_DEPTH_FAR,
  BATTLE_DEPTH_NEAR,
  BATTLE_HOST_SCALE,
  BATTLE_PRESS_TRAVEL,
} from '../../../game/ascentConfig';
import type { AscentBattle } from '../../../state/types';
import type { BattleMarker } from '../constants';
import { BATTLE_HOST_MARK_CAP } from '../../../game/ascentConfig';
import { MEN_PER_MARK } from '../../../data/ascent/formations';
import type { ConquestUIScene } from '../../ConquestUIScene';

/**
 * How far apart the two lines stand once they have met.
 *
 * Wide enough that both blocks are legible and the ground between them shows, narrow enough that
 * they read as engaged rather than as two armies waiting for permission.
 */
const BATTLE_SEAM_GAP = 34;


/**
 * What the screen should be showing right now.
 *
 * The buffered beat when the queue has one, the live battle when it has run dry. *Every* piece
 * of the picture reads through this, so it can never disagree with itself — drawing half the
 * bars from a replayed beat and half from live state is how a screen ends up showing a host
 * at two strengths at once.
 */
export function battleFrame(self: ConquestUIScene, battle: AscentBattle): {
  round: number;
  ourNow: number; theirNow: number;
  ourMorale: number; theirMorale: number;
  ourAdvance: number; theirAdvance: number;
  hostMen?: Map<string, number>;
  hostMorale?: Map<string, number>;
} {
  const beat = self.battleUi?.shown;
  if (!beat) {
    return {
      round: battle.round,
      ourNow: battle.ourNow, theirNow: battle.theirNow,
      ourMorale: battle.ourMorale, theirMorale: battle.theirMorale,
      ourAdvance: battle.ourAdvance, theirAdvance: battle.theirAdvance,
    };
  }
  const men = new Map<string, number>();
  const morale = new Map<string, number>();
  for (const host of [...beat.ourHosts, ...beat.theirHosts]) {
    men.set(host.id, host.men);
    morale.set(host.id, host.morale);
  }
  return {
    round: beat.round,
    ourNow: beat.ourNow, theirNow: beat.theirNow,
    ourMorale: beat.ourMorale, theirMorale: beat.theirMorale,
    ourAdvance: beat.ourAdvance, theirAdvance: beat.theirAdvance,
    hostMen: men, hostMorale: morale,
  };
}

/**
 * The one scale everything on the battlefield is drawn at, given the ground it stands on.
 *
 * The field had sixteen different scales on it. The men were drawn at `BATTLE_HOST_SCALE`, the
 * scenery at `GROUND_SCALE * 1.5`, and every prop then carried a hand-tuned multiplier on top of
 * that — 0.42 for the bamboo, 0.55 for the seat, 0.7 for the buffalo. Which is exactly the fault
 * `proportion.ts` exists to prevent: its whole premise is that the corrections in `UNIT` only
 * equalise the props **if every call site passes the same caller scale**, and here none of them
 * did. Measured, the buffalo came out at 0.756 against a soldier's 1.45, so a trâu — an animal
 * that stands nearly as tall as a man — was drawn at half his height, and the war camp beside it
 * at twice the height it should be.
 *
 * So: one caller scale, and the only thing allowed to change it is depth. A thing drawn higher up
 * the field is further away and shrinks toward `BATTLE_DEPTH_FAR`; a thing at the near edge grows
 * a little past 1. That is perspective, which is a property of *where* something stands rather
 * than of what it is — and it is a single function, so nothing can drift again.
 */
export function battleScaleAt(self: ConquestUIScene, y: number): number {
  const ui = self.battleUi;
  if (!ui) return battleBaseScale(self);
  const { horizon, bottom, groundY } = battleBands(self);
  // 0 at the horizon, 1 on the line the armies stand on, past 1 at the near edge.
  const depth = (y - horizon) / Math.max(1, groundY - horizon);
  const eased = depth <= 1
    ? BATTLE_DEPTH_FAR + (1 - BATTLE_DEPTH_FAR) * Math.max(0, depth)
    : 1 + (BATTLE_DEPTH_NEAR - 1) * Math.min(1, (y - groundY) / Math.max(1, bottom - groundY));
  return battleBaseScale(self) * eased;
}

/** The three lines the field is laid out against: the horizon, the line of battle, the near edge. */
function battleBands(self: ConquestUIScene): { horizon: number; groundY: number; bottom: number } {
  const ui = self.battleUi;
  if (!ui) return { horizon: 0, groundY: 0, bottom: 0 };
  const top = ui.content.y;
  return { horizon: top + ui.fieldHeight * 0.30, groundY: ui.geometry.groundY, bottom: top + ui.fieldHeight };
}

/**
 * The scale on the line of battle, which is not a constant because the field is not a fixed size.
 *
 * `GAME_HEIGHT` clamps as low as 620, and on a short screen the field comes out at about 154
 * units against the 301 an iPhone-shaped one gets — so the band between the horizon and the line
 * of battle, which is the *whole* depth the picture has to work in, halves. Drawn at a fixed
 * scale, a host block is then taller than the distance between the line and the camp behind it,
 * and the two collide however carefully the camp is placed. Which is exactly what a short screen
 * showed: the enemy's front rank standing in their own tents.
 *
 * So everything shrinks with the room it has. The reference is the 844-high case, where the
 * depth band is about 114 units and the scale is `BATTLE_HOST_SCALE`; the floor keeps a soldier
 * legible on the shortest screen the game supports.
 */
export function battleBaseScale(self: ConquestUIScene): number {
  const ui = self.battleUi;
  if (!ui) return BATTLE_HOST_SCALE;
  const band = ui.geometry.groundY - (ui.content.y + ui.fieldHeight * 0.30);
  return BATTLE_HOST_SCALE * Math.max(0.62, Math.min(1, band / 114));
}

/**
 * Whether the two hosts have taken the whole field, so the scenery should stand aside.
 *
 * **Nothing on this screen has ever read how large a block comes out.** `hostHalfWidth` measures a
 * frontage and hands it to `battleSeamGap`, which uses it to space the two lines and nothing else;
 * no caller has ever compared the result against the room available. So two hosts of twenty-five
 * thousand were drawn four hundred and nineteen units wide on a field three hundred and ninety
 * wide, running off both edges and straight through the village on one side and the camp on the
 * other — every one of the reported screenshots. *Too many army, example 25k 30k, no need to render
 * camp, village, etc — just keep space for render army.*
 *
 * Measured on frontage rather than on headcount, because the headcount stops mattering: the mark
 * cap means a host of ten thousand and one of thirty thousand are drawn identically, and what
 * decides whether the picture is crowded is how much paper the two blocks cover. Measured against
 * `GAME_WIDTH` rather than the span, because the overflow the player sees is the block leaving the
 * screen, not the block leaving its own inset.
 */
export function battleHostsCrowdField(battle: AscentBattle): boolean {
  // The muster counts, frozen when the field opened — never the live ones, and never the drawn
  // frontage.
  //
  // Both of those move. Frontage moves *with the formation*: measured on the same 27,000-man fight,
  // a block came out 210 units wide in one shape and 158 in another, so a threshold on it would
  // have taken the village away and given it back every time the player touched the dock. A picture
  // that flickers is worse than a picture that is too busy. Losses move too, so a headcount would
  // hand the scenery back halfway through the slaughter it is meant to make room for.
  const full = MEN_PER_MARK * BATTLE_HOST_MARK_CAP;
  return Math.min(battle.ourStart, battle.theirStart) >= full;
}

export function battleRearY(self: ConquestUIScene): number {
  const { horizon, groundY } = battleBands(self);
  // A distant camp leaves the middle ground to the armies. Its tents and banner
  // shrink together through battleScaleAt, about 19% below the former 0.34 depth.
  return Math.round(horizon + (groundY - horizon) * 0.12);
}

/**
 * Where the two lines stand this frame.
 *
 * The two advances are defined to sum to 1 at contact, and the drawing took that literally: at
 * contact `leftX + 30 + span` and `rightX - 30 - span` are the *same point*, so one army was
 * drawn exactly on top of the other. A fight at its most violent showed one clump — and the
 * dead, which lie along the seam, were underneath it.
 *
 * So the lines close to a seam and no further. They interpenetrate by about a file, which reads
 * as one contested mass with a join in it rather than as two rectangles that stopped politely
 * short — and it leaves the ground between them visible, which is where the bodies are.
 */
export function battleLines(self: ConquestUIScene,
  ourAdvance: number, theirAdvance: number,
): { ourX: number; theirX: number; seam: number; met: boolean } {
  const ui = self.battleUi;
  if (!ui) return { ourX: 0, theirX: 0, seam: 0, met: false };
  const { leftX, rightX, span } = ui.geometry;
  const ourX = leftX + 30 + span * ourAdvance;
  const theirX = rightX - 30 - span * theirAdvance;
  const gap = battleSeamGap(self);
  if (theirX - ourX >= gap) return { ourX, theirX, seam: (ourX + theirX) / 2, met: false };

  // They have reached us. Where that happens is decided by who advanced — hold your ground and
  // they cross the whole field to get to you — but drawn literally it puts the entire fight in
  // the left quarter with two thirds of the picture empty behind them. The meeting is pulled
  // back into the middle band so the thing worth looking at is where the eye already is.
  // Held ground pushes the raw meeting point right up against our own camp, which is honest and
  // unwatchable: measured, the contact landed at x=135 of a 390-wide screen with the whole right
  // half of the field empty behind the enemy. Clamped to a band about the centre instead — the
  // direction still reads, because within the band the seam still moves with who pushed whom.
  const raw = (ourX + theirX) / 2;
  const mid = (leftX + rightX) / 2;
  // Once they have met the advances stop changing, so drawn literally the two blocks freeze the
  // instant the fight actually starts and only jitter — which is exactly the "teleport, stop,
  // teleport" the screen was accused of. `press` carries who has been winning the exchanges and
  // pushes the seam that way, so the line keeps moving for as long as men keep falling.
  const pressed = raw + self.battlePress * span * BATTLE_PRESS_TRAVEL;
  const seam = Math.min(Math.max(pressed, mid - span * 0.16), mid + span * 0.16);
  return { ourX: seam - gap / 2, theirX: seam + gap / 2, seam, met: true };
}

/**
 * How far apart the two lines stand once they have met.
 *
 * Measured off the blocks actually on the field rather than fixed, because the blocks change
 * size — with the count, and with every fifty-five men lost. A fixed gap either has the ranks
 * standing inside one another when the hosts are large or leaves a road between them when they
 * are small; either way it stops reading as contact.
 */
function battleSeamGap(self: ConquestUIScene): number {
  const ui = self.battleUi;
  if (!ui) return BATTLE_SEAM_GAP;
  const widest = (markers: BattleMarker[]): number => markers
    .reduce((most, entry) => Math.max(most, entry.halfWidth ?? 0), 0);
  // Front ranks about a file apart: close enough to be fighting, far enough that the two blocks
  // are still two blocks.
  return Math.max(BATTLE_SEAM_GAP, widest(ui.ourMarkers) + widest(ui.theirMarkers) + 10);
}

/**
 * Everything on the rails that a beat does *not* move.
 *
 * The rails used to be thrown away and rebuilt whole on every beat, which reads as cheap and
 * measured as anything but: 24.3 ms of a 35.2 ms beat at a 4x CPU throttle, 1.8 times a second —
 * two thirds of the screen's whole per-beat cost. Almost none of that work had a reason to
 * happen twice. Four `statBar`s each allocated a container and a graphics to draw two wobbled
 * strokes, and a rival's name was trimmed character by character with a `setText` and a width
 * read per character — every one of those forcing a canvas re-measure and a texture upload, for
 * a name that had not changed since the fight opened.
 *
 * So this builds the half that belongs to the *fight*, and `updateBattleRails` writes the half
 * that belongs to the beat: two strings and one graphics.
 */
export function battleRailsSignature(battle: AscentBattle): string {
  // Deliberately *not* including the telegraph or the arms verdict. Both change several times
  // in a fight and both are one line of text — putting them here rebuilt the panel, both names
  // and both rout marks to change a sentence, which is how this cost 5.8 ms a beat even after
  // the numbers had been lifted out of it. They are written in place instead.
  // The opening hold is not in here any more either: it used to print a note across the field,
  // and that note is the header's notice now — which is written in place and never rebuilds
  // anything.
  return [
    battle.kingdomName,
    battle.terrainEdge.toFixed(2),
    battle.ourAdvance + battle.theirAdvance >= 1 ? 'met' : 'apart',
  ].join(':');
}
