/**
 * The land the Dragon Ascent fight stands on: everything in the battle screen's field view that is
 * not a man — five bands painted far to near, the dead piling up on them, and the bake.
 *
 * The three run as one sequence and in this order only. `buildBattleField` records
 * `field.list.length`, calls `buildBattleGround`, then `bakeBattleGround` with that index — and the
 * bake flattens and *hides* every child added since it, so anything that has to keep drawing once
 * the fight is under way has no business being added before it. Worth 33.5 ms a frame down to 16.7.
 *
 * `layFallen` is the exception to "static": it writes into `ui.fallen`, never clears, and stops at
 * 40. The clip the layers hang off (`ui.groundClip`) is destroyed by the field's rebuild, not here.
 */
import Phaser from 'phaser';
import { RectClip } from '../../../ui/ink/clipRect';
import { hudSheetWidth } from '../../../game/cameraLayout';
import { areca, bamboo, grassTuft, hayStack, softRidge, tree } from '../../../ui/ink/props';
import { groundTone, inkPath, mulberry32, printedShape } from '../../../ui/ink/stroke';
import { PIGMENT } from '../../../ui/ink/palette';
import { findLand } from '../../../systems/LandSystem';
import type { AscentBattle, BattleBeat } from '../../../state/types';
import { battleFieldBox } from '../constants';
import { battleLines, battleRearY, battleScaleAt } from './geometry';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { maxTextureSize } from '../../../ui/ink/textureLimits';
import { renderScale } from '../../../game/graphicsQuality';
import { registerGpuBake } from '../../../game/gpuBakes';
import { conquestArtStamp, conquestKarstArtId, stampFootY, conquestTreeArtId, type ConquestArtSeason } from '../../../ui/conquestMapArt';
import { placeStamp } from '../../../ui/ink/stamp';
import { getFoliageSeason } from '../../../ui/ink/season';

/**
 * One piece of authored scenery on the field, at the same caller scale the ink version takes.
 *
 * **The map was given reviewed art and this screen was not.** Every tree, hedge, hayrick and
 * village on the battlefield was still the procedural ink the map used before the Đông Hồ pack
 * landed, so the one screen a player looks at closely was the one drawing the oldest marks in the
 * game — reported as exactly that.
 *
 * The multiplier is the same number the procedural call is handed (`battleScaleAt`), which is the
 * same equivalence the map keeps between `drawProp` and `drawAuthoredProp`: a stamp fitted to the
 * prop's design bounds and placed at `scale` lands where the inked one did, at the size it did.
 *
 * Returns false when the asset is missing, corrupt or switched off with `?mapart=procedural`, and
 * every caller falls straight through to the ink it always drew. That is the contract
 * `verify-conquest-art-fallback` holds the map to, and this screen now keeps it too.
 */
function artProp(
  self: ConquestUIScene,
  layer: Phaser.GameObjects.Container,
  id: string,
  x: number,
  y: number,
  scale: number,
): boolean {
  const stamp = conquestArtStamp(self, id);
  if (!stamp) return false;
  layer.add(placeStamp(self, stamp, x, y, scale));
  return true;
}

/** The season the field's plants are drawn in — the same one the map's scatter reads. */
function fieldSeason(): ConquestArtSeason {
  return getFoliageSeason().toLowerCase() as ConquestArtSeason;
}

/**
 * The fight's own account used to be printed along the foot of the field, on a plate over the
 * hatching. It is one line in the header now — see `updateBattleLogLine` — because that is where it
 * can be read, and because a plate of type across the bottom third of the picture was covering the
 * one thing this screen exists to show. Nothing draws inside the field any more except the field.
 */
/**
 * The round pips used to be a full-width band between the header and the field, and they are in
 * the header's own top-right corner now — see `battleHeaderFrame`. The band is gone; the field
 * kept the twenty-four points.
 */
/**
 * Most bodies the killing floor will hold.
 *
 * Capped because they are never cleared — the point of them is that they accumulate — and an
 * engagement can run forty beats. Forty marks is a covered field at this size; beyond that it is
 * a texture, and the two armies stop reading against it.
 */
const BATTLE_FALLEN_CAP = 40;


/**
 * The land the fight is happening on.
 *
 * The field was a cream rectangle with two clusters of tents on it — the thing the screen exists
 * to show, drawn as nothing. None of this needs new art: the Đông Hồ renderers already draw
 * villages, citadels, paddy, karst, bamboo and buffalo for the map, and the battle screen used
 * exactly one of them.
 *
 * Five bands, painted far to near, because the eye reads a scene bottom-up and Phaser does not
 * depth-sort a container's children:
 *
 *   0  distance — karst and a soft ridge along the horizon. Nothing here ever moves.
 *   1  ground   — a tone under the whole killing floor.
 *   2  ours     — the province being defended: its settlement, its paddy, its bamboo hedge.
 *   3  theirs   — what came for it.
 *   4  scatter  — trees and grass drawn from the province's *real* terrain.
 *
 * Static for the length of the fight, so it is drawn once per field rebuild rather than per beat.
 */
/**
 * Where the province being defended stands, shared with `field.ts` so our standard flies over the
 * settlement rather than near it. It was a bare `x0 + 22` written in one place and needed in two.
 */
export const SETTLEMENT_X = 22;

export function buildBattleGround(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { content, field } = ui;
  const { groundY } = ui.geometry;

  const top = content.y;
  const bottom = top + ui.fieldHeight;
  const x0 = 0;
  const x1 = hudSheetWidth();
  const horizon = top + ui.fieldHeight * 0.30;
  const land = findLand(self.state, battle.landId);
  const seed = Math.round((battle.landId.length * 977) + battle.totalRounds * 31);
  const rand = mulberry32(seed);
  // One scale for everything standing on this field, and the only thing allowed to change it
  // is how far back the thing stands. See `battleScaleAt`.
  const scale = (at: number): number => battleScaleAt(self, at);

  // Everything the land is made of is clipped to the frame.
  //
  // `planSoftRidge` places peaks along the span it is given and each peak is wider than its
  // centre, so a range asked to end at the frame still puts a summit and its skirt out past the
  // border — measured, a whole hill hung forty pixels off the right edge with the panel's own
  // rule cut behind it. Narrowing the span only moves the overhang inward. A mask is the only
  // thing that ends a shape exactly where the paper does.
  // A stencil layer, bracketing the three land layers in the field's child list. Phaser 4 made
  // the v3 geometry mask a no-op under WebGL, and the Mask filter that was meant to replace it
  // crops to the design surface, so it had to be gated off above RENDER_SCALE 1 — read
  // `ui/ink/clipRect` for the measurement. The stencil clips in screen space and so is the same
  // shape at every graphics tier.
  const clip = new RectClip(self, {
    x: 0, y: top, width: hudSheetWidth(), height: ui.fieldHeight,
  });
  ui.groundClip = clip;
  clip.begin(field);

  // Three layers, in the order a print is built: distance, then the ground over its feet, then
  // everything standing on the ground.
  const mountains = self.add.container(0, 0).setAlpha(0.64);
  field.add(mountains);
  clip.apply(mountains);
  const far = self.add.graphics();
  far.setAlpha(0.72);
  field.add(far);
  clip.apply(far);
  const ground = self.add.graphics();
  field.add(ground);
  clip.apply(ground);
  const g = self.add.graphics();
  // The land is a backdrop, not a subject. Drawn at half strength as a whole, because at full
  // weight the scenery and the two armies carry the same emphasis and the fight — the thing the
  // screen exists to show — stops being the thing you look at.
  g.setAlpha(0.5);
  field.add(g);
  clip.apply(g);
  // The authored scenery rides above the ink of its own band, at the ink's own weight, and inside
  // the same clip and the same bake. A container rather than loose children so paint order inside
  // the band stays the order these are called in.
  const props = self.add.container(0, 0).setAlpha(0.72);
  field.add(props);
  clip.apply(props);
  const season = fieldSeason();
  // Closes the bracket: everything added to `field` after this — the fallen, the camps, the
  // hosts — is outside the clip, exactly as it was under the three-mask version.
  clip.end(field);

  // ── 0. distance ────────────────────────────────────────────────────────
  // Reuse the map's carved limestone plates: ochre faces, leaf-green shoulders and
  // nested ink contours. Fit by height without stretching; uneven overlapping groups
  // keep the horizon from becoming a repeated row of triangular procedural hills.
  const mountainRand = mulberry32(seed + 905);
  let mountainX = x0 - ui.fieldHeight * 0.1;
  let mountainIndex = 0;
  while (mountainX < x1 + 20) {
    const height = ui.fieldHeight * (0.14 + mountainRand() * 0.065);
    const id = conquestKarstArtId(seed + mountainIndex * 7);
    const stamp = conquestArtStamp(self, id, {
      left: -height, right: height, top: -height, bottom: 0,
    }, { sizing: 'fit-bounds' });
    if (!stamp) {
      softRidge(far, mountainX, mountainX + height * 1.5, horizon + 8,
        height * 0.7, seed + mountainIndex * 37, PIGMENT.diepDeep);
      mountainX += height * 1.3;
    } else {
      const image = placeStamp(self, stamp, mountainX, horizon + 8)
        .setFlipX(mountainIndex % 2 === 1)
        .setData('battleMountainArt', id);
      image.y += horizon + 8 - stampFootY(image);
      mountains.add(image);
      mountainX += image.displayWidth * (0.68 + mountainRand() * 0.12);
    }
    mountainIndex += 1;
  }

  // ── 1. the ground ──────────────────────────────────────────────────────
  // A lightly inked contour and broken treeline tie the printed mountain feet
  // into the open field; paper-coloured mist softens their lower edges.
  const baseY = horizon + 8;

  /**
   * Mist at the feet of the karst, the same trick the front page plays.
   *
   * The ridges stood on a hard line with bare paper under them, so the hills read as a cut-out
   * pasted onto the field rather than as distance. Asked for by name: *can mountains in battle
   * screen also have fog like menu?*
   *
   * Soft ellipses in the same pigments `MenuScene` drifts across its own karst — `diepHi` over
   * `diep` with a breath of `chamPale` under them — but **static**, because this whole band is
   * flattened into one texture by `bakeBattleGround` and a tween on a baked layer animates
   * nothing. Drawn into `far`, so it sits behind everything that stands on the ground.
   */
  // Laid with `groundTone` — rings of jittered circles — rather than as flat ellipses.
  //
  // The first pass used the menu's own ellipse stack and it cost the bake its fidelity: a large
  // translucent ellipse tessellates differently at the supersample the texture is drawn at than at
  // screen scale, and `verify-battle-ground-bake` went from 6.2% of pixels differing to 10.6%,
  // past the bar. `groundTone` is what every other soft wash on this screen is made of and is
  // already proven through that check.
  for (let i = 0; i < 6; i += 1) {
    const mx = x0 + (x1 - x0) * (0.06 + (i / 5) * 0.88) + (rand() - 0.5) * 26;
    const my = baseY - 3 + (rand() - 0.5) * 6;
    groundTone(far, mx, my, ui.fieldHeight * (0.085 + rand() * 0.05), PIGMENT.diepHi, 0.1, 6);
    groundTone(far, mx + 10, my + 3, ui.fieldHeight * (0.055 + rand() * 0.03), PIGMENT.diep, 0.07, 5);
  }

  const horizonPts: Array<{ x: number; y: number }> = [];
  const skyX0 = content.x + 5;
  const skyX1 = content.x + content.width - 5;
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    horizonPts.push({ x: skyX0 + (skyX1 - skyX0) * t, y: baseY + Math.sin(t * Math.PI * 1.7 + seed) * 2.5 });
  }
  inkPath(ground, horizonPts, seed + 71, { colour: PIGMENT.mucFaint, width: 0.8, alpha: 0.5, wobble: 0.8, step: 12 });

  // A broken treeline on the line, at the far distance's weight. Something irregular growing out
  // of a horizon is most of what stops it reading as a border.
  for (let i = 0; i < 34; i += 1) {
    const t = (i + rand() * 0.9) / 34;
    const tx = skyX0 + (skyX1 - skyX0) * t;
    const ty = baseY + Math.sin(t * Math.PI * 1.7 + seed) * 2.5 + 1;
    const th = 3.5 + rand() * 5;
    ground.fillStyle(PIGMENT.tram, 0.16 + rand() * 0.14);
    ground.fillEllipse(tx, ty - th * 0.55, 3.4 + rand() * 3.4, th);
  }

  // Tone on the near ground, so the field is a place and not bare paper — the complaint that
  // started this was literally "no blank screen, make it look like a fight on a land".
  //
  // Every centre jittered and no two radii alike. `groundTone` is rings of hard circles, edgeless
  // only because the map's cells never share a step; laid out as an even row at one height they
  // draw a fresh ruled line straight back in, which is the same fault one layer up.
  const plane = ui.fieldHeight;
  for (let i = 0; i <= 10; i += 1) {
    const px = x0 + ((x1 - x0) * i) / 10 + (rand() - 0.5) * 20;
    groundTone(ground, px, baseY + 30 + (rand() - 0.5) * plane * 0.10,
      plane * (0.16 + rand() * 0.09), PIGMENT.diepLo, 0.09, 6);
  }

  // Barely there: a wash under the men's feet, not a pool of colour the eye lands in.
  groundTone(ground, (x0 + x1) / 2, groundY + 22, content.width * 0.42, PIGMENT.diepDeep, 0.1, 6);

  // The dead, re-laid onto the rebuilt field: on the ground, under everything that stands on it.
  ui.fallen = self.add.graphics();
  field.add(ui.fallen);
  for (const pt of ui.fallenPts) inkFallen(self, pt.x, pt.y, pt.side);

  // ── 2. the middle distance ─────────────────────────────────────────────
  //
  // The band between the horizon and the line the hosts stand on was bare paper — sixty units
  // of nothing across the whole width, directly behind the only thing the screen is about. All
  // the scenery this field had was crammed into the bottom-left corner and along the near edge,
  // along the near edge, where the log ribbon then printed over half of it.
  //
  // What fills it is what is actually there: the bờ ruộng. A delta province is a mosaic of
  // banked paddy, and the banks are long shallow curves running away from the eye and closing up
  // as they recede. Three strokes and the ground has depth, without one thing standing between
  // the player and the two lines.
  const ts = land?.terrainSummary;
  const wooded = ts ? ts.forest + ts.mountains + ts.hills : 0;
  const wet = ts ? ts.riceFields + ts.fields + ts.water : 0;
  const bunds = 5;
  for (let i = 0; i < bunds; i += 1) {
    // Squared so they crowd toward the horizon, which is what perspective does to even spacing.
    const t = ((i + 1) / (bunds + 1)) ** 1.7;
    const by = horizon + 10 + t * (groundY - horizon - 16);
    const sag = 3 + t * 5;
    // Each one a stretch of bank rather than a line across the world. Drawn full width at an
    // even weight they stopped reading as the edges of paddy and started reading as wires strung
    // over the battlefield — a bund is a boundary between two fields, and fields end.
    const from = x0 - 10 + rand() * (x1 - x0) * 0.34;
    const to = from + (x1 - x0) * (0.4 + rand() * 0.5);
    inkPath(
      far,
      [{ x: from, y: by }, { x: (from + to) / 2, y: by + sag }, { x: Math.min(x1 + 10, to), y: by }],
      seed + 101 + i,
      { colour: PIGMENT.mucFaint, width: 0.7, alpha: 0.16 + t * 0.12, wobble: 1.1, step: 14 },
    );
  }
  // No treeline here. There is already one — thirty-four small tram ellipses standing on the
  // drawn horizon, a few lines further down — and it is the better of the two: irregular,
  // low, and at the far distance's own weight. A second row of full `tree()` props at ten
  // metres apiece put evenly spaced canopies across the skyline, which read as boulders rather
  // than as woodland and reached back over the hills.

  // Low irregular meadow patches. Shorter than the existing tall tufts, with
  // more cover near the field edges and bare gaps where the hosts meet.
  const meadowRand = mulberry32(seed + 619);
  for (let patch = 0; patch < 34; patch += 1) {
    const py = baseY + 12 + meadowRand() * Math.max(1, top + ui.fieldHeight - baseY - 22);
    const px = x0 + 12 + meadowRand() * (x1 - x0 - 24);
    if (Math.abs(px - (x0 + x1) / 2) < content.width * 0.14
      && Math.abs(py - groundY) < ui.fieldHeight * 0.15) continue;
    const blades = 2 + Math.floor(meadowRand() * 3);
    for (let tuft = 0; tuft < blades; tuft += 1) {
      const tx = px + (meadowRand() - 0.5) * 12;
      const ty = py + (meadowRand() - 0.5) * 4;
      const size = scale(ty) * (0.55 + meadowRand() * 0.25);
      if (!artProp(self, props, `flora.grass.${season}`, tx, ty, size)) {
        grassTuft(g, tx, ty, size, seed + 619 + patch * 7 + tuft);
      }
    }
  }

  // ── 3. the ground we are fighting from ─────────────────────────────────
  //
  // Set back the same distance as the camps, and for the same reason: anything drawn on the line
  // the armies stand on is something our own front rank is standing inside.
  const homeX = SETTLEMENT_X;
  const homeY = battleRearY(self);
  /**
   * Two hosts of twenty-five thousand leave no room for a village, so it is not drawn.
   *
   * Decided in `buildBattleField` from the blocks' own measured extents — see
   * `battleHostsCrowdField`. The alternative is what the reported screenshots show: a citadel and a
   * war camp with an army standing inside both of them, which reads as a rendering fault rather
   * than as a big battle. When the men have taken the field, the field is what the screen shows.
   */
  const roomForScenery = !ui.sceneryHidden;
  /**
   * **No settlement on the field.** Ours is a camp now, drawn beside theirs in `buildBattleField`.
   *
   * A citadel or a village here was the wrong object twice over. It is drawn for a map — seen from
   * above, sized against a province — so at the field's own scale it arrived either as a doll's
   * house or, fitted to the field, as a compound wide enough to hang off the left border; and it
   * put the two sides of the picture out of step, a walled town facing a row of tents. Two hosts
   * that have marched to meet each other are camped, both of them. The province is named in the
   * header and its terrain is under their feet; it does not also need its town in the shot.
   */

  // Bamboo along our own edge of the field. It was the village's boundary when there was a
  // village; with the camp there instead it is simply what grows at the edge of a delta field,
  // and it still does the one job the composition needs — something standing between the frame
  // and the fight on the side the eye enters from.
  //
  // No paddy plots: `drawFieldPlot` is drawn for map scale, where a plot is a few pixels of
  // texture. Blown up to a close-up they are big pale rectangles that read as scraps of paper
  // lying on the field, and a wrong mark is worse than a missing one — hence the bunds above,
  // which are the same idea drawn as lines instead of as fills.
  for (let i = 0; roomForScenery && i < 4; i += 1) {
    // Along the village's own edge, between it and the fight.
    const hedgeY = homeY + 10 + (i % 2) * 3;
    const hedgeX = x0 + 4 + i * 9;
    if (!artProp(self, props, `flora.bamboo.${season}`, hedgeX, hedgeY, scale(hedgeY))) {
      bamboo(g, hedgeX, hedgeY, scale(hedgeY), seed + 11 + i);
    }
  }
  // No buffalo. It is the right animal for a province at peace and the wrong one for the near
  // edge of a battlefield: drawn at the ground scale it is the largest single object on the
  // field, it stands between the player and the fight, and it is grazing through a battle.
  if (roomForScenery && !artProp(self, props, 'building.haystack', homeX + 26, homeY + 6, scale(homeY + 6))) {
    hayStack(g, homeX + 26, homeY + 6, scale(homeY + 6), seed + 19);
  }

  // ── 4. what came for it ────────────────────────────────────────────────
  //
  // The tents themselves are `battleCamp`; this is the baggage behind them. Drawing a hamlet on
  // top of the camp put two settlements in the same place.
  if (roomForScenery) {
    for (const [bx, by, s] of [[x1 - 26, groundY - 6, seed + 21], [x1 - 46, groundY - 2, seed + 23]] as const) {
      if (!artProp(self, props, 'building.haystack', bx, by, scale(by))) hayStack(g, bx, by, scale(by), s);
    }
  }

  // ── 5. the killing floor ───────────────────────────────────────────────
  //
  // Everything that stands between the player and the fight has moved out of this function
  // entirely — see `buildBattleForeground`, which is drawn *after* the men rather than under them.
}

/**
 * The near foreground: the two corner pieces and the scatter across the apron.
 *
 * Split out of `buildBattleGround` for one reason, and it is the reported one — *tree in front
 * should be over the army not behind*. Every band of this screen is drawn into one of three
 * Graphics that `bakeBattleGround` flattens into a single texture and inserts at `groundFrom`,
 * which is **below** the camp, the fallen and both host markers. So a tree standing four pixels
 * from the bottom edge of the field, in front of the near line by every rule of the picture, was
 * composited behind two thousand men. The depth model said one thing and the child order said
 * another.
 *
 * Building it separately and baking it at the *end* of the field's child list is all it takes: the
 * scale is still `battleScaleAt`, so nothing about how large these are drawn changes, and
 * `verify-battle-scale` still measures them at the same one caller scale as everything else.
 *
 * Scatter chosen by what the province actually is. A fight on rice ground and a fight in the hills
 * are the same two blocks of men on two different pieces of the country.
 */
export function buildBattleForeground(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { content, field } = ui;
  const { groundY } = ui.geometry;

  const top = content.y;
  const bottom = top + ui.fieldHeight;
  const x0 = 0;
  const x1 = hudSheetWidth();
  const land = findLand(self.state, battle.landId);
  // The same seed the ground was drawn from, so the two halves of one picture agree about which
  // province this is and the foreground does not reshuffle when only it is rebuilt.
  const seed = Math.round((battle.landId.length * 977) + battle.totalRounds * 31);
  const rand = mulberry32(seed + 7);
  const scale = (at: number): number => battleScaleAt(self, at);

  const ts = land?.terrainSummary;
  const wooded = ts ? ts.forest + ts.mountains + ts.hills : 0;
  const wet = ts ? ts.riceFields + ts.fields + ts.water : 0;

  // Its own clip bracket. The ground's closed at the end of `buildBattleGround`, and anything
  // added to `field` after that is unclipped — which for props drawn at the field's own edges
  // means a bamboo hanging past the frame onto the rails below it.
  const clip = new RectClip(self, {
    x: 0, y: top, width: hudSheetWidth(), height: ui.fieldHeight,
  });
  ui.foregroundClip = clip;
  clip.begin(field);
  const g = self.add.graphics();
  // The same half strength the land is drawn at. The foreground frames the fight; it does not
  // compete with it, and at full weight a tree in the near corner carries more ink than the men.
  g.setAlpha(0.5);
  field.add(g);
  clip.apply(g);
  const props = self.add.container(0, 0).setAlpha(0.72);
  field.add(props);
  clip.apply(props);
  clip.end(field);
  const season = fieldSeason();
  // The tree a province plants is the tree the map plants there — same picker, same seed, so the
  // wood a player fights in is the wood they were looking at a moment ago.
  const treeId = (s: number): string => conquestTreeArtId(season, s);

  /**
   * Two corner pieces, and they are rooted *below* the frame on purpose.
   *
   * They used to stand on the near edge, where their canopies stopped short of the line of battle
   * — so although the foreground is composited above the men (`keepForegroundOnTop`, and the child
   * order is asserted at build and after every redraw), it never actually covered any of them, and
   * the depth it is there to create could not be read. Reported as: *tree in front, why army over
   * it?* — the answer being that nothing was ever in front of anything.
   *
   * Anchored past `bottom`, their trunks run off the foot of the picture and their crowns rise into
   * the band the hosts stand in, which is what a tree in the immediate foreground does. The clip
   * ends them at the frame.
   */
  const rooted = bottom - 2;
  if (wet > wooded) {
    if (!artProp(self, props, `flora.areca.${season}`, x0 + 14, rooted, scale(rooted))) {
      areca(g, x0 + 14, rooted, scale(rooted), seed + 61);
    }
    if (!artProp(self, props, `flora.areca.${season}`, x0 + 30, rooted + 4, scale(rooted + 4))) {
      areca(g, x0 + 30, rooted + 4, scale(rooted + 4), seed + 63);
    }
  } else if (!artProp(self, props, treeId(seed + 61), x0 + 20, rooted, scale(rooted))) {
    tree(g, x0 + 20, rooted, scale(rooted), seed + 61);
  }
  for (let i = 0; i < 3; i += 1) {
    const py = rooted + 4 - i * 3;
    const px = x1 - 10 - i * 11;
    if (!artProp(self, props, `flora.bamboo.${season}`, px, py, scale(py))) {
      bamboo(g, px, py, scale(py), seed + 65 + i);
    }
  }

  /**
   * ...and two pieces standing *among* the men, at the outer edges of the line.
   *
   * The corner pieces above are rooted on the near edge, and a canopy that tall still stops some
   * fifty units short of the rank line — so although the foreground layer is composited above the
   * hosts (`keepForegroundOnTop`; the child order is asserted at build and after every redraw), it
   * never actually covered a single soldier and the depth it exists to create could not be read.
   * Reported as *tree in front, why army over it?* — and the honest answer was that nothing had
   * ever been in front of anything.
   *
   * Rooted a little below the line of battle rather than at the frame's foot, and pushed hard to
   * the two edges: the seam where the hosts meet is the one thing on this screen that must stay
   * legible, so the overlap is bought at the flanks and nowhere near the middle.
   */
  const amongY = groundY + 10;
  const flank: Array<[number, number, number]> = [
    [x0 + 6, amongY, seed + 71],
    [x1 - 4, amongY + 14, seed + 73],
  ];
  for (const [px, py, s] of flank) {
    const id = wooded >= wet ? treeId(s) : `flora.areca.${season}`;
    if (artProp(self, props, id, px, py, scale(py))) continue;
    if (wooded >= wet) tree(g, px, py, scale(py), s);
    else areca(g, px, py, scale(py), s);
  }

  // And the rest scattered across the near ground. Below the line rather than beside it: the two
  // lines meet *on* the ground line, so anything under it is behind the player's eye rather than
  // between the player and the fight, and the old rule that kept the middle clear was costing
  // the whole apron for a clearance the composition no longer needs.
  const nearTop = groundY + 26;
  const nearDepth = Math.max(12, bottom - nearTop - 8);
  for (let i = 0; i < 11; i += 1) {
    const px = x0 + 16 + rand() * (x1 - x0 - 32);
    const py = nearTop + rand() * nearDepth;
    const id = wooded > wet && i < 2 ? treeId(seed + 33 + i)
      : wet > wooded && i === 0 ? `flora.areca.${season}`
        : `flora.grass.${season}`;
    if (artProp(self, props, id, px, py, scale(py))) continue;
    if (wooded > wet && i < 2) tree(g, px, py, scale(py), seed + 33 + i);
    else if (wet > wooded && i === 0) areca(g, px, py, scale(py), seed + 39);
    else grassTuft(g, px, py, scale(py), seed + 41 + i);
  }
}

/**
 * Puts the near foreground back on top of the men.
 *
 * Z-order on this screen is child order and nothing else — `setDepth` is a no-op inside a Container
 * — so anything that re-adds a marker appends it past the foreground. `redrawHostBlock` does
 * exactly that, roughly once per fifty-five men lost, so without this the trees were correctly in
 * front for the opening of every fight and behind for the rest of it, which is a worse bug than the
 * one being fixed because it looks intermittent.
 */
export function keepForegroundOnTop(self: ConquestUIScene): void {
  const ui = self.battleUi;
  const foreground = ui?.foreground;
  if (!ui || !foreground || !foreground.active) return;
  if (ui.field.list.indexOf(foreground) === ui.field.list.length - 1) return;
  ui.field.bringToTop(foreground);
}

/**
 * Lays out the men who fell this beat, where they fell.
 *
 * One mark per figure's worth of loss, capped — a beat that kills sixty men lays about one body
 * down, so the floor fills at the same rate the ranks thin. Drawn into a graphics that is never
 * cleared, because the dead do not get up: the field carries the whole fight's cost by the end,
 * which is what makes a won battle look like it cost something.
 */
export function layFallen(self: ConquestUIScene, beat: BattleBeat): void {
  const ui = self.battleUi;
  if (!ui || ui.fallenCount >= BATTLE_FALLEN_CAP) return;
  // Sample the actual rendered soldiers, including rank offsets, mirroring and the
  // current movement tween. The midpoint between armies is empty during arrow fire.
  const sides = [
    { side: 'ours' as const, loss: beat.ourLoss, markers: ui.ourMarkers },
    { side: 'theirs' as const, loss: beat.theirLoss, markers: ui.theirMarkers },
  ];
  for (const { side, loss, markers } of sides) {
    if (loss <= 0) continue;
    const candidates: Array<{ x: number; y: number; hostId: string }> = [];
    const fieldMatrix = ui.field.getWorldTransformMatrix();
    for (const entry of markers) {
      if (!entry.marker.active || entry.routed) continue;
      const collect = (object: Phaser.GameObjects.GameObject): void => {
        if (object.getData('conquestFigureAssetId')) {
          const figure = object as Phaser.GameObjects.Container;
          const matrix = figure.getWorldTransformMatrix();
          const point = fieldMatrix.applyInverse(matrix.tx, matrix.ty);
          candidates.push({ x: point.x, y: point.y, hostId: entry.hostId });
          return;
        }
        const children = (object as Phaser.GameObjects.Container).list;
        if (Array.isArray(children)) children.forEach(collect);
      };
      collect(entry.marker);
      // Procedural formations have no individual image anchors. Keep their fallback
      // inside this host's footprint, never at the shared seam.
      if (!candidates.some(point => point.hostId === entry.hostId)) {
        candidates.push({ x: entry.marker.x, y: entry.marker.y, hostId: entry.hostId });
      }
    }
    if (!candidates.length) continue;
    const wanted = Math.min(2, Math.max(1, Math.round(loss / 20)));
    for (let i = 0; i < wanted && ui.fallenCount < BATTLE_FALLEN_CAP; i += 1) {
      const rand = mulberry32((ui.fallenCount + 1) * 2654435761 + beat.round);
      const unoccupied = candidates.filter(candidate => !ui.fallenPts.some(fallen =>
        Math.hypot(candidate.x - fallen.x, candidate.y - fallen.y) < 1.5));
      const pool = unoccupied.length ? unoccupied : candidates;
      const point = pool[Math.floor(rand() * pool.length)];
      // Keep these field coordinates when the host moves or the field rebuilds.
      ui.fallenPts.push({ ...point, side });
      inkFallen(self, point.x, point.y, side);
      ui.fallenCount += 1;
    }
  }
}

/** A small fallen figure: bent limbs, tunic, head, helmet and a dropped spear. */
function inkFallen(self: ConquestUIScene, x: number, y: number, side?: 'ours' | 'theirs'): void {
  const g = self.battleUi?.fallen;
  if (!g?.active) return;
  const seed = Math.round(x * 173 + y * 311);
  const rand = mulberry32(seed);
  const s = battleScaleAt(self, y) * 0.55;
  const facing = rand() > 0.5 ? 1 : -1;
  const angle = (rand() - 0.5) * 0.8;
  const pt = (dx: number, dy: number) => ({
    x: x + (dx * facing * Math.cos(angle) - dy * Math.sin(angle)) * s,
    y: y + (dx * facing * Math.sin(angle) + dy * Math.cos(angle)) * s,
  });
  const path = (points: number[][], colour: number, width: number) => {
    inkPath(g, points.map(([dx, dy]) => pt(dx, dy)), seed, {
      colour, width: width * s, alpha: 0.8, wobble: 0.06 * s, step: 4,
    });
  };
  // Low, warm paper shadow anchors the body without becoming the old dark dash.
  g.fillStyle(PIGMENT.mucFaint, 0.14);
  g.fillEllipse(x, y + 0.4 * s, 7 * s, 1.5 * s);
  path([[0.8, -0.3], [2, -0.7], [3, -0.3]], PIGMENT.mucSoft, 0.7);
  path([[0.7, 0.4], [1.7, 1], [2.8, 0.8]], PIGMENT.mucSoft, 0.7);
  printedShape(g, [[-1.8,-0.65],[0.9,-0.55],[1.1,0.65],[-1.5,0.65]].map(([dx,dy]) => pt(dx,dy)),
    side === 'theirs' ? PIGMENT.cham : PIGMENT.tramDeep, seed + 1,
    { width: 0.35 * s, alpha: 0.8, fillAlpha: 0.8, wobble: 0.05 * s, step: 4 });
  path([[-1,-0.6],[-0.4,-1.2],[0.4,-1]], PIGMENT.diepDeep, 0.48);
  path([[-1,0.4],[-1.3,1.1],[-0.3,1.3]], PIGMENT.diepDeep, 0.48);
  const head = pt(-2.35, 0);
  g.fillStyle(PIGMENT.diepDeep, 0.95);
  g.fillCircle(head.x, head.y, 0.63 * s);
  path([[-2.9,-0.1],[-2.65,-0.6],[-2.1,-0.65]], PIGMENT.mucSoft, 0.4);
  path([[-3,1.7],[2.8,1.3]], PIGMENT.nau, 0.22);
  path([[2.8,1.3],[3.4,1.24]], PIGMENT.cham, 0.45);
}

/**
 * The ground, flattened into a single texture once the fight opens.
 *
 * `buildBattleGround`'s own comment already says it is "static for the length of the fight" — and
 * it was, as far as *building* went. It was still three `Graphics` full of ridges, paddy, bamboo
 * and scatter being re-tessellated and re-uploaded on **every frame**, for a picture that never
 * changes between one beat and the next.
 *
 * Measured at 390x844 with everything else on screen: the fight ran at 33.5 ms a frame, and
 * hiding the ground alone took it to 16.7. Hiding both armies changed nothing at all — the
 * soldiers were never the cost.
 *
 * Lossless, which is the whole reason this is safe to do: those layers are already clipped by a
 * geometry mask to exactly `(content.x + 2, top + 2, width - 4, fieldHeight - 4)`, so a texture of
 * that rect holds precisely what was on screen and no more. Each source keeps its own alpha as it
 * is drawn in, and the texture composites at full strength, which is the same order of operations
 * the live layers had. Verified by pixel diff, not by argument.
 *
 * This is the same trick `MapScene.bakeStaticTerrain` plays for the world, for the same reason.
 */
export function bakeBattleGround(self: ConquestUIScene, from: number, isForeground = false): void {
  const ui = self.battleUi;
  if (!ui) return;
  // The A/B switch `verify-battle-ground-bake` flips to rebuild the same field unbaked. It cannot
  // get its reference by un-hiding the sources: the bake clears their geometry masks, and without
  // those the ridges, the pond and the bamboo all spill past the frame — which is the very thing
  // the masks were added for. The only honest reference is a field that never went through here.
  if (self.skipGroundBake) return;
  const { content, field } = ui;
  // A lost context nulls the GL bindings mid-draw; leave the live layers up and cost the frames
  // rather than throw. `MapScene` learned this one the hard way.
  const renderer = self.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (renderer?.contextLost) return;

  // Whole pixels. A texture landing on a half-pixel resamples everything inside it, which is a
  // broad, low-amplitude difference across the whole picture rather than an obvious fault.
  // The field box — NOT `content`. The frame went full-bleed (`battleFieldBox`) and this bake
  // kept the card column it used to sit in, so the ground was painted 20px short of the frame on
  // either side and read as the picture being cut off. Measured on a 1206-wide phone: a bare
  // parchment strip under the border, both sides, the whole height of the field.
  const box = battleFieldBox(content, ui.fieldHeight);
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  const width = Math.ceil(box.width);
  const height = Math.ceil(box.height);
  if (width <= 0 || height <= 0) return;

  type Hideable = Phaser.GameObjects.GameObject & { visible: boolean; setVisible(v: boolean): unknown };
  const added = field.list.slice(from) as Hideable[];
  // Only the things that were drawn, and only the ones that never draw again. Three kinds of
  // passenger live in this slice and none of them is static art: `draw` does not consult
  // `visible`, so an invisible layer baked in anyway; the clip's stencil pair write to the stencil
  // buffer rather than to the picture; and `ui.fallen` is the one layer built before the bake that
  // keeps drawing after it, so flattening it hid the killing floor for the rest of the fight.
  // Measured with the full forty bodies down: 0 of 105350 field pixels differed, 1057 once live.
  //
  // `isStencilModifier` and not `type`, which is the trap: a `Stencil` extends Container and
  // keeps *its* type string, so a name check catches the closing `StencilReference` and misses
  // the opening half. Measured, that is what it costs — the Stencil was baked into the texture
  // and then hidden along with the real layers, leaving a frame that subtracted a stencil layer
  // it had never added. The buffer wrapped below zero and the readout under the field went with
  // it: 14.5% of the field's pixels differed from the unbaked reference, against 5.4% before.
  const sources = added.filter(
    (obj) => obj !== ui.fallen && obj.visible !== false && !(obj as { isStencilModifier?: boolean }).isStencilModifier,
  );
  if (sources.length === 0) return;

  // Supersampled, because a texture made in game units is drawn onto a canvas that renders at the
  // device ratio — every hairline in the ridges, the paddy bunds and the bamboo came back softer.
  // Measured against an unbaked rebuild of the same field: 14.2% of pixels differed at 1x and the
  // worst was 132/255, which is a visible change and not one anybody asked for.
  //
  // Same trick as `MapScene.bakeStaticTerrain`: scale the sources up, bake big, display small. A
  // Graphics scales its stroke widths with its geometry, so the lines land back at their own width.
  // At render scale 3 a 2x supersample still lands *below* the buffer's own resolution, so
  // the baked field was softer than the live one on exactly the phones the bake is for.
  // Follow the render scale (never below the original 2), clamped so the texture cannot
  // exceed the device's MAX_TEXTURE_SIZE - past it the GL call fails and the field goes black.
  const SUPER = Math.max(1, Math.min(Math.max(2, renderScale()),
    Math.floor(maxTextureSize(self) / Math.max(width, height))));
  const baked = self.add.renderTexture(x, y, width * SUPER, height * SUPER)
    .setOrigin(0, 0)
    .setScale(1 / SUPER);
  const scalable = sources as unknown as Array<{ setScale(v: number): unknown }>;
  for (const source of scalable) source.setScale(SUPER);
  // Drop the clip before drawing, and this is load-bearing rather than tidy.
  //
  // Under Phaser 3 the reason was that a geometry mask is a stencil pass and simply does not
  // survive `RenderTexture.draw` — the masked layers rendered as *nothing*, and the first attempt
  // lost the horizon ridges, the pagoda and the whole settlement. That is still exactly true of
  // the Canvas fallback, which is the only place a geometry mask is still live.
  //
  // Under WebGL the clip is now a stencil layer written by two objects of its own, and those are
  // filtered out of `sources` above rather than cleared off each layer — a stencil belongs to the
  // frame, not to the things it covers, so there is nothing on a source to drop.
  //
  // Either way the answer is safe for the same reason: the texture is created at exactly the rect
  // the clip cut to, so the RT's own bounds do the identical job. That equivalence is why this is
  // a performance change and not an art change; `verify-battle-ground-bake` holds it to it.
  type Maskable = Phaser.GameObjects.GameObject & { clearMask?(d?: boolean): unknown };
  for (const source of sources as Maskable[]) source.clearMask?.(false);
  try {
    baked.draw(sources, -x * SUPER, -y * SUPER);
    // Phaser 4 buffers the draw; `render` executes it. Before the sources are put back to
    // scale 1 and hidden below, or the buffer replays against layers that have already moved.
    baked.render();
  } catch {
    for (const source of scalable) source.setScale(1);
    baked.destroy();
    return;
  }
  for (const source of scalable) source.setScale(1);
  for (const source of sources) source.setVisible?.(false);
  // Appended, not assigned: the bake runs twice per field now — once for the land under the men
  // and once for the foreground over them — and `verify-battle-ground-bake` restores this list to
  // rebuild the picture unbaked. Overwriting it left half the field missing from the reference.
  ui.groundSources = [...ui.groundSources, ...sources];
  // At `from`, so it sits exactly where the layers it replaces stood. For the land that is under
  // the camps, the fallen and the men; for the near foreground — baked from an index past the last
  // marker — that is above all of them.
  field.addAt(baked, from);
  // Told rather than inferred. The obvious test — *did it land last?* — is wrong here: the sources
  // are hidden rather than removed, so the graphics and the clip's stencil pair are still sitting
  // in the list after the texture that replaced them, and a foreground bake never looks last even
  // when it is on top of everything that draws. Measured: `ui.foreground` stayed undefined, so
  // `keepForegroundOnTop` did nothing and the trees sank behind the men on the first attrition
  // redraw.
  if (isForeground) ui.foreground = baked;
  // A restored GL context hands this texture back empty, and the sources it replaced are hidden,
  // so the field would stay bare for the rest of the fight. Forgetting the signature makes the
  // battle clock rebuild the whole field — ground, bakes, camps, men — from live layers on its
  // next beat: the one rebuild path every other change to the field already trusts, rather than
  // a second one that tries to un-hide and re-flatten under a running clock.
  registerGpuBake(self.game, 'battle-ground', () => {
    const live = self.battleUi;
    if (live) live.fieldSignature = '';
  });
}
