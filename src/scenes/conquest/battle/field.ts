/**
 * The two armies themselves on the Dragon Ascent battle screen: one marker per host, the walk that
 * carries them over the ground each beat, the redraw that thins their ranks, and the run they make
 * when they break. `buildBattleField` lays the picture's floor and calls the ground in as well — it
 * is the only rebuild path, and `battleFieldSignature` is the guard `updateBattle` checks so that
 * rebuild fires when relief arrives or a column breaks, and not otherwise.
 *
 * `ui.ourMarkers` and `ui.theirMarkers` are the only record of what is drawn, and everything here
 * writes to them. Two live wires: `redrawHostBlock` destroys a block and puts a fresh one in
 * `entry.marker`, so nothing may hold that container across a call to it; and a marker with
 * `entry.routed` set has left the line — `slideMarkers` skipping it is what lets the rout finish.
 */
import Phaser from 'phaser';
import { ourHosts, theirHosts } from '../../../systems/ascent/BattleSystem';
import { BATTLE_HOST_MARK_CAP, BATTLE_TICK_MS } from '../../../game/ascentConfig';
import { compactNumber } from '../../../utils/format';
import { INK_UI } from '../../../ui/InkUI';
import { faceTravel } from '../../../ui/ink/life';
import { armyShape, compositionFor, hostKitFor, hostShapeAt } from '../../../ui/ink/devices';
import { type BattleFormation } from '../../../data/ascent/formations';
import { inkPath } from '../../../ui/ink/stroke';
import { keepForegroundOnTop } from './ground';
import { buildBattleClouds } from './clouds';
import { buildBattleInsects } from './meadow';
import { createPlayerLandFlag } from '../../../ui/playerFlag';
import { GROUND_SCALE, PX_PER_M } from '../../../ui/ink/proportion';
import type { Army, AscentBattle } from '../../../state/types';
import { battleFieldBox, hostSize, type BattleMarker } from '../constants';
import { clearLayer, killTweensDeep } from '../layers';
import {
  battleBaseScale, battleHostsCrowdField, battleLines, battleRearY, battleScaleAt,
} from './geometry';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { setConquestArmyStepping, warmFigureStamps } from '../../../ui/ink/figureStamps';
import { PIGMENT } from '../../../ui/ink/palette';

/**
 * How far a block must be given to cross before its men are shown walking.
 *
 * A beat runs whether or not either line gives way, so a held line is handed a tween to the `x` it
 * already stands on. Half a world pixel is well under a single stride and well over the rounding
 * in a line position, so it separates "holding" from "advancing" without a magic number pretending
 * to be a distance.
 */
const BATTLE_STEP_MIN = 0.5;


/** Pairs a drawn marker with its host, finding the strength label to keep current. */
function trackMarker(hostId: string, marker: Phaser.GameObjects.Container, mustered?: number): BattleMarker {
  const count = marker.list.find((child) => child.type === 'Text') as Phaser.GameObjects.Text | undefined;
  return { hostId, marker, count, mustered };
}

/** Who is standing on the field, so relief arriving or a column breaking forces a redraw. */
export function battleFieldSignature(self: ConquestUIScene, battle: AscentBattle): string {
  const ours = ourHosts(self.state, battle).map((host) => host.id);
  const theirs = theirHosts(self.state, battle).map((host) => host.id);
  return `${ours.join(',')}|${theirs.join(',')}`;
}

/**
 * The two armies on their ground.
 *
 * Every host on the field gets its own marker, stacked vertically. The maths has summed
 * across hosts since relief arrived, but the field drew one formation a side — so a
 * two-column defence looked exactly like a one-column defence with a bigger number on it.
 * Drawing them separately is what makes "their vanguard is wavering" something you can see,
 * and it is what gives Focus something to point at.
 */
export function buildBattleField(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { content, field, rivalColor } = ui;
  const { leftX, rightX, span, groundY } = ui.geometry;

  clearLayer(self, field);
  ui.groundClip?.destroy();
  ui.groundClip = undefined;
  ui.foregroundClip?.destroy();
  ui.foregroundClip = undefined;
  ui.foreground = undefined;
  ui.groundSources = [];
  ui.ourMarkers = [];
  ui.theirMarkers = [];
  ui.fieldSignature = battleFieldSignature(self, battle);

  // Square and full-bleed. The field is a view rather than a card (see `buildBattleUi`), and a
  // radius on a view is a vignette: on a tall phone the rounded corners and the 2px inset read
  // as the picture being cut short of its own frame.
  // **Two rules, top and bottom. No frame.**
  //
  // This was `ui.panel`, which draws a closed border — and a closed border on a box that spans
  // the whole sheet puts a dark 2px rule hard against the left and right edges of the screen.
  // Measured off the drawing buffer at three device pixels in: 109,97,78 against the 221,208,177
  // of the paper beside it, the full height of the field, both sides. That is the strip that kept
  // being reported, and squaring the corners and taking the backdrop to full opacity did nothing
  // about it because it was never the backdrop — it was the picture's own frame drawn where the
  // page ends.
  //
  // A view that runs to both edges has no left or right; it is bounded by the screen, and the
  // only edges it owns are the two horizontal ones where the rails and the header meet it.
  const box = battleFieldBox(content, ui.fieldHeight);
  const ground = self.add.graphics();
  ground.fillStyle(INK_UI.parchment, 1);
  ground.fillRect(box.x, box.y, box.width, box.height);
  for (const edgeY of [box.y + 0.5, box.y + box.height - 0.5]) {
    inkPath(
      ground,
      [{ x: box.x - 2, y: edgeY }, { x: box.x + box.width + 2, y: edgeY }],
      Math.round(box.width + edgeY),
      { width: 2, alpha: 0.86, colour: INK_UI.softBrush, wobble: 0.5, step: 16 },
    );
  }
  field.add(ground);

  /**
   * Do the hosts leave room for a village and a camp?
   *
   * Asked *before* the ground is drawn, because the ground is drawn first and cannot see the men.
   * The blocks are measured the same way `hostHalfWidth` measures their frontage — `armyShape` at
   * the same scale and mark cap the markers will use — and the tallest one decides. See
   * `battleHostsCrowdField`.
   */
  ui.sceneryHidden = battleHostsCrowdField(battle);

  // The ground itself, before anything stands on it — then flattened into one texture.
  const groundFrom = field.list.length;
  self.buildBattleGround(battle);
  self.bakeBattleGround(groundFrom);
  buildBattleClouds(self);

  // Camps: the ground each side is fighting from, and what "hold" means.
  // Behind their line and a little past the field's edge, at the same scale the hosts are
  // drawn: a camp tuned against a field size that changes with the screen is a camp that is the
  // wrong size on most screens.
  // Behind their line, not on it.
  //
  // It used to be placed eight units above the ground line and drawn at nearly the men's own
  // scale, so their front rank stood *inside* the tents — the two read as one collided object
  // rather than as a line with its camp behind it. Set well back, it takes the depth scale with
  // everything else and the men occlude it, which is what "behind" looks like.
  const campY = battleRearY(self);
  if (!ui.sceneryHidden) {
    /**
     * **Both sides camp.** Ours on the left, theirs on the right, the same object mirrored.
     *
     * Our side used to be the province itself — a citadel or a village, drawn from map art at map
     * scale. It never sat right: a walled town facing a row of tents puts the two halves of the
     * picture out of step, and fitted to the field it was wide enough to hang off the border.
     * Two hosts that have marched to meet each other are both camped, and a picture that says so
     * reads at a glance — which side is which is then the banner's job and the banner's only job.
     *
     * Mirrored rather than drawn twice: `battleCamp` faces its gate one way, and two camps facing
     * the same way read as one army's baggage train strung across the field.
     */
    const campScale = battleScaleAt(self, campY);
    const ourCamp = self.battleCamp(leftX + 4, campY, PIGMENT.muc, 5, campScale, false);
    ourCamp.setScale(-1, 1);
    field.add(ourCamp);
    field.add(self.battleCamp(rightX - 4, campY, rivalColor, 23, campScale));
  }

  // The standards stand their ground (user report, 2026-08-25: the flag walked with the block,
  // so every advance dragged the realm's great banner pacing across the field). The blocks carry
  // no standard on this screen — `standards: false` in every kit below — and each side's flag is
  // planted once at its own edge instead: ours over the ground we fight from, theirs before
  // their camp. Only the soldiers move.
  /**
   * The colours stand over the places they belong to, not in the middle of the men.
   *
   * Ours was planted at `leftX + 4` and theirs at `rightX - 4`, both on the line of battle — which
   * is precisely where the two blocks stand, so each side's own standard was drawn under its own
   * front rank and every screenshot showed a flag with an army on top of it. Reported as: *show
   * flag in castle and camp instead of middle of army to avoid graphic overlay issue.*
   *
   * So ours goes over the settlement it is defending and theirs over the camp it marched from —
   * both set back, both taking the depth scale with everything else standing there, and both clear
   * of the line entirely. When the hosts have crowded the scenery off the field there is nothing to
   * fly them from, so they take the sky at the top corners instead: a picture still has to say
   * whose men are which way round.
   */
  const rearScale = battleScaleAt(self, battleRearY(self));
  const flagScale = 0.37 * (battleBaseScale(self) / GROUND_SCALE)
    * (ui.sceneryHidden ? 0.62 : rearScale / battleBaseScale(self));
  const plant = (x: number, y: number, seed: number, enemy: boolean, scale = flagScale): void => {
    const flag = createPlayerLandFlag(self, false, seed, enemy);
    // `createPlayerLandFlag` carries its own foot offset (pole base at +8, ground ellipse at +10),
    // so the correction puts the foot on whatever line it is standing on.
    flag.setPosition(x, y - 10 * scale);
    flag.setScale(scale);
    field.add(flag);
  };
  const rivalSeed = Math.max(0, self.state.kingdoms.findIndex((k) => k.id === battle.kingdomId));
  if (ui.sceneryHidden) {
    /**
     * No village and no camp, so the standards are planted at the foot of the hills.
     *
     * They were put in the sky at a fifth of the field's height, which is *above* the horizon —
     * two flags floating over the mountains with nothing holding them up. Reported exactly that
     * way. The horizon line is where the ridges stand and where the ground begins; a pole with its
     * foot on it reads as planted, which is the whole of what a standard has to do.
     */
    const footY = content.y + ui.fieldHeight * 0.30 + 8;
    plant(leftX - 18, footY, self.state.mapConfig.seed, false);
    plant(rightX + 6, footY, rivalSeed, true);
  } else {
    // Replace the camp's generic đại kỳ at its gate, at the same metre scale as its tents.
    // Keep the standard outside the mirrored camp so the player's motif is never reversed.
    const homeY = battleRearY(self);
    const metre = PX_PER_M * rearScale;
    plant(leftX + 4, homeY - 1.1 * metre, self.state.mapConfig.seed, false, 0.1 * metre);
    // Theirs is the camp's own đại kỳ (`battleCamp` draws it over the gate), so nothing is planted
    // for them at all — a second enemy standard beside it was the duplicate nobody asked for.
  }

  const ours = ourHosts(self.state, battle);
  const theirs = theirHosts(self.state, battle);
  // Bake both sides' wardrobes before a single marker is built: a first-seen figure kind
  // rasterises through the canvas API, and that cost belongs here, not under a mid-fight redraw.
  for (const host of [...ours, ...theirs]) {
    warmFigureStamps(self, hostKitFor(self.state, host),
      ours.includes(host) ? PIGMENT.muc : PIGMENT.mucSoft, 'f');
  }
  const lane = (index: number, count: number): number => groundY + (index - (count - 1) / 2) * 32;

  const lines = battleLines(self, battle.ourAdvance, battle.theirAdvance);
  ours.forEach((host, index) => {
    const marker = self.battleItems!.createArmyMarker(
      hostSize(host), true, undefined, self.state.mapConfig.seed,
      {
        ...hostKitFor(self.state, host),
        mustered: hostSize(host),
        shape: battle.ourFormation,
        standards: false,
        markCap: BATTLE_HOST_MARK_CAP,
      },
      battleBaseScale(self),
    );
    marker.setPosition(lines.ourX, lane(index, ours.length));
    field.add(marker);
    const tracked = trackMarker(host.id, marker, hostSize(host));
    tracked.halfWidth = hostHalfWidth(self, host, undefined, tracked.mustered, battle.ourFormation);
    ui.ourMarkers.push(tracked);
  });

  theirs.forEach((host, index) => {
    const marker = self.battleItems!.createArmyMarker(
      hostSize(host), false, rivalColor,
      Math.max(0, self.state.kingdoms.findIndex((k) => k.id === battle.kingdomId)),
      // Unshaped while the drum beats. `drawHost` takes `undefined` to mean "not standing in
      // anything yet", which is exactly true here and is the same state a side is drawn in while
      // it re-forms mid-fight — so the picture has a word for this already.
      {
        ...hostKitFor(self.state, host),
        mustered: hostSize(host),
        shape: self.battleOpeningSealed ? undefined : battle.theirFormation,
        standards: false,
        markCap: BATTLE_HOST_MARK_CAP,
      },
      battleBaseScale(self),
    );
    marker.setPosition(lines.theirX, lane(index, theirs.length));
    field.add(marker);
    // They face us. On the map both hosts march the same way and it never mattered; on a field
    // where the two are looking at each other across thirty units it is the difference between
    // a battle and a queue. `faceTravel` reads the prop's own declared facing rather than
    // mirroring it blind, which is the rule for every baked prop in the game.
    faceTravel(marker, -1);
    const tracked = trackMarker(host.id, marker, hostSize(host));
    tracked.halfWidth = hostHalfWidth(self, host, undefined, tracked.mustered, battle.theirFormation);
    ui.theirMarkers.push(tracked);
    // Nothing on an enemy column is tappable any more. Concentrating the line on one of them was
    // a second cursor on a screen designed for one thumb, and it asked the player to *aim* in a
    // game whose whole language is standing orders — see `docs/phase-1/14-five-shapes-two-dials.md`.
    // The cinnabar ring that marked the target goes with the order it belonged to.
  });

  // Last, and that is the whole of the fix for *tree in front should be over the army*. The near
  // foreground used to be drawn into the land's own Graphics, which the bake flattens and inserts
  // at `groundFrom` — under the camp, the fallen and both hosts — so a tree standing at the very
  // bottom edge of the field was composited behind two thousand men. Built here it takes the index
  // it is baked at, which is now above everything on the field.
  buildBattleInsects(self, self.state.mapConfig.seed + battle.landId.length * 977);
  const foregroundFrom = field.list.length;
  self.buildBattleForeground(battle);
  self.bakeBattleGround(foregroundFrom, true);
}

/**
 * A host that broke turns and runs off its own side of the field.
 *
 * Never `setScale(-1, 1)`: these markers are baked props with a declared native facing, and
 * flipping one directly mirrors whatever it was drawn from. `faceTravel` asks the object which
 * way it was drawn and works out the sign from that.
 */
export function routMarker(self: ConquestUIScene, hostId: string): void {
  const ui = self.battleUi;
  if (!ui) return;
  const ours = ui.ourMarkers.find((m) => m.hostId === hostId);
  const marker = ours ?? ui.theirMarkers.find((m) => m.hostId === hostId);
  if (!marker?.marker?.active) return;
  // Ours run left, theirs run right: each side flees the way it came.
  const direction: -1 | 1 = ours ? -1 : 1;
  marker.routed = true;
  self.tweens.killTweensOf(marker.marker);
  faceTravel(marker.marker, direction);
  self.tweens.add({
    targets: marker.marker,
    x: marker.marker.x + direction * (ui.geometry.span * 0.6 + 60),
    alpha: { from: 1, to: 0 },
    duration: BATTLE_TICK_MS * 2,
    ease: 'Quad.easeIn',
  });
}

/**
 * Walks a side's columns to where the fight says they now stand.
 *
 * Chained rather than yoyo'd: a yoyo returns the marker to where it *started*, so shoving on
 * contact would have undone that beat's advance every time the lines touched. The last hop
 * always lands on the true position, so the picture can never drift from the numbers.
 */
export function slideMarkers(self: ConquestUIScene,
  markers: BattleMarker[],
  x: number,
  shove: number,
  sizes: Map<string, number>,
): void {
  for (const entry of markers) {
    const { hostId, count } = entry;
    if (!entry.marker.active) continue;
    // A host that broke is no longer part of the line. Without this, `slideMarkers` dragged it
    // back into formation every beat and killed the tween carrying it off the field — measured,
    // the runner got forty pixels and never faded, because the rout and the formation were both
    // writing the same `x` and the formation won.
    if (entry.routed) continue;
    // And one still walking onto the field is not on the line yet; its own tween lands it there.
    if (entry.arriving) continue;
    const size = sizes.get(hostId);
    if (count?.active && size !== undefined) count.setText(compactNumber(size));
    // The ranks thin. One figure stands for `MEN_PER_MARK` men, so this fires about once per
    // fifty-five lost — twenty-odd redraws across a whole engagement, at ~21 `figure()` calls
    // each. Cheap, exact, and it makes attrition the most legible thing on the screen without
    // a single number being read.
    if (size !== undefined) {
      const marks = hostShapeAt(Math.max(1, size), 1).marks;
      if (entry.marks !== undefined && marks !== entry.marks) redrawHostBlock(self, entry, size);
      entry.marks = marks;
    }
    // Read *after* the possible redraw, and this is the whole of a bug worth writing down.
    //
    // `redrawHostBlock` destroys the block and puts a new one in `entry.marker`. This loop used
    // to hold the old container in a local destructured at the top, so on every beat where a
    // host crossed a mark boundary the tween was added to an object that had just been
    // destroyed — and the new block, having been positioned where the old one stood, simply did
    // not move for that beat. Measured on a real engagement: the field stood perfectly still
    // for 673 ms in the middle of the fight, once per fifty-five men lost. That is the "teleport
    // and freeze" complaint's second half, and it survived the tween timings being fixed
    // because the tween was never running on the thing being drawn.
    const marker = entry.marker;
    // Previous beat's tween is abandoned rather than left to fight this one for the same x.
    //
    // The feet are stopped here rather than in the tween's `onComplete`, because a killed tween
    // never runs one: the next beat cut the previous tween down, its completion never fired, and
    // the block kept stepping for the rest of the fight — including through a decision card, with
    // the whole field otherwise still. Stopped at the top of every beat and started again below
    // only for a block that is given ground to cross.
    self.tweens.killTweensOf(marker);
    setConquestArmyStepping(marker, false);
    if (shove === 0) {
      // The whole interval, and linear. It used to be `BATTLE_TICK_MS * 0.45` on an ease-out,
      // so a host crossed its ground in a quarter of a second and then stood perfectly still
      // for the remaining three tenths — a hop, a freeze, a hop. Measured against the beat, the
      // block was stationary for 55% of the time it was supposedly marching. Linear because a
      // column on the move does not accelerate and brake between each pair of steps.
      // **Feet only when there is ground to cross.**
      //
      // A beat still runs when neither line gives way, and then this tween is handed the `x` the
      // marker is already standing on — a no-op that fills the interval. Starting the gait on it
      // put both hosts marching on the spot in front of a stationary line of battle, which is the
      // opening of most fights and exactly what a player sees first. The tween is still added
      // (harmless, and it keeps one code path), but the men only step if the block moves.
      const crossing = Math.abs(x - marker.x) > BATTLE_STEP_MIN;
      if (crossing) setConquestArmyStepping(marker, true);
      self.tweens.add({
        targets: marker,
        x,
        duration: BATTLE_TICK_MS,
        ease: 'Linear',
        onComplete: () => setConquestArmyStepping(marker, false),
      });
      continue;
    }
    // In contact: lean in, lean back, and let the two halves fill the beat between them, so
    // there is never a moment where nothing on the field is moving.
    setConquestArmyStepping(marker, true);
    self.tweens.chain({
      targets: marker,
      onComplete: () => setConquestArmyStepping(marker, false),
      tweens: [
        { x: x + shove, duration: BATTLE_TICK_MS * 0.46, ease: 'Sine.easeInOut' },
        { x, duration: BATTLE_TICK_MS * 0.54, ease: 'Sine.easeInOut' },
      ],
    });
  }
}

/**
 * Redraws one host's block at the strength it is now.
 *
 * Rebuilt in place rather than through `buildBattleField`, because the whole field carries the
 * focus rings and the tap targets — throwing it away to shrink one column would drop the order
 * the player is in the middle of giving.
 */
/**
 * Half the ground a host's whole formation covers.
 *
 * `BATTLE_SEAM_GAP` is a distance between two hosts' *centres*, so what it has to clear is the
 * deployment, not the shield wall in the middle of it. Measured off one block, a screen thrown
 * forward of the line stands inside the enemy's rear ranks.
 */


function hostHalfWidth(self: ConquestUIScene,
  host: Army, men?: number, mustered?: number, shape?: BattleFormation,
): number {
  const size = Math.max(1, men ?? hostSize(host));
  return armyShape(
    size, compositionFor(hostKitFor(self.state, host)), battleBaseScale(self), mustered, 1, shape,
    BATTLE_HOST_MARK_CAP,
  ).width / 2;
}

export function redrawHostBlock(self: ConquestUIScene, entry: BattleMarker, men: number): void {
  const ui = self.battleUi;
  if (!ui || !self.battleItems) return;
  const battle = self.state.ascent?.activeBattle;
  if (!battle) return;
  const host = self.state.armies.find((army) => army.id === entry.hostId);
  if (!host) return;

  const ours = (battle.ourArmyIds ?? []).includes(entry.hostId);
  const { x, y } = entry.marker;
  const rebuilt = self.battleItems.createArmyMarker(
    Math.max(1, men),
    ours,
    ours ? undefined : ui.rivalColor,
    ours
      ? self.state.mapConfig.seed
      : Math.max(0, self.state.kingdoms.findIndex((k) => k.id === battle.kingdomId)),
    {
      ...hostKitFor(self.state, host),
      mustered: entry.mustered,
      // Sealed the same way the first build is. Attrition redraws a block roughly every
      // fifty-five men, so without this the enemy's shape came back the first time one of their
      // columns crossed a mark boundary — the seal would have lasted until the first casualty.
      shape: ours ? battle.ourFormation
        : self.battleOpeningSealed ? undefined : battle.theirFormation,
      // Planted at the field's edge, not carried — the same rule as the first build, or the
      // banner marched back into the block at the first attrition redraw.
      standards: false,
      // Same ceiling as the first build, or the block would jump to its uncapped size the first
      // time attrition redrew it.
      markCap: BATTLE_HOST_MARK_CAP,
    },
    battleBaseScale(self),
  );
  rebuilt.setPosition(x, y);
  if (!ours) faceTravel(rebuilt, -1);
  entry.halfWidth = hostHalfWidth(self, 
    host, men, entry.mustered, ours ? battle.ourFormation : battle.theirFormation,
  );

  // Nothing rides on a block any more — the target picker and its ring are gone — so only the
  // drawing is replaced here.
  const parent = entry.marker.parentContainer;
  // Deep, because the endless step belongs to the ranks inside the block and not to the block.
  killTweensDeep(self, entry.marker);
  entry.marker.destroy();
  entry.marker = rebuilt;
  entry.count = rebuilt.list.find((child) => child.type === 'Text') as Phaser.GameObjects.Text | undefined;
  if (parent) parent.add(rebuilt);
  else ui.field.add(rebuilt);
  // A rebuilt block is appended to the end of the container, which is above the baked foreground.
  // Put the trees back in front of the men.
  keepForegroundOnTop(self);

}
