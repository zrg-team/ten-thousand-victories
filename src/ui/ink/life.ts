/**
 * Props that move.
 *
 * Everything in `props.ts` draws straight into a shared `Graphics` at an absolute position, which
 * is right for scenery and wrong for anything alive: a buffalo baked into the same buffer as the
 * houses around it can never take a step. These helpers give one prop its own object so it can.
 *
 * Also the home of the **facing convention**, because getting it wrong is invisible in a still
 * screenshot and glaring in motion. A glyph declares which way it was drawn; the mover multiplies
 * that by the direction of travel. A cart whose ox is drawn on the left, flipped as though the ox
 * were on the right, spends the whole map pushing its cart backwards.
 */
import Phaser from 'phaser';
import { BASE_SCALE_KEY, propImage, type BakedProp } from './sprites';
import {
  conquestWalkSheetForTexture, ensureConquestWalkSheetSmall, inkExtent, walkStrideFor,
  WALK_CELL_SIZE, type ConquestWalkSheet,
} from '../conquestMapArt';

/** Anything that can be walked around: a `Graphics` prop or a baked `Image` one. */
export type Walkable = Phaser.GameObjects.GameObject & {
  x: number;
  y: number;
  setScale(x: number, y: number): unknown;
  getData(key: string): unknown;
  setData(key: string, value: unknown): unknown;
};

/**
 * Flips an object horizontally without losing the scale it was built at.
 *
 * A baked prop is rasterised large and scaled down; writing `setScale(-1, 1)` onto one of those
 * shows it four times the size and mirrored.
 */
function applyFacing(object: Walkable, scaleX: number): void {
  const base = (object.getData(BASE_SCALE_KEY) as number | undefined) ?? 1;
  object.setScale(scaleX * base, base);
}

/** `-1` for a glyph drawn facing left (−x), `+1` for one drawn facing right. */
export type NativeFacing = -1 | 1;

/** Data key a glyph uses to tell a mover which way it was drawn. Absent means facing +x. */
export const NATIVE_FACING_KEY = 'nativeFacing';

/** Data key carrying a grazing animal's home patch, for verification. */
export const GRAZING_KEY = 'grazing';

/** Data key carrying an independent settlement walker's bounded home patch. */
export const WANDERING_KEY = 'settlementWandering';

/** Data key for the tiny travel-only gait applied to a moving sprite's visual child. */
export const NATURAL_MOTION_KEY = 'naturalTravelMotion';

/** Data key for the real four-frame limb/wheel cycle carried by an authored moving image. */
export const WALK_FRAME_KEY = 'walkFrameAnimation';

export type NaturalMotionKind = 'person' | 'buffalo' | 'cart';

interface NaturalMotionState {
  kind: NaturalMotionKind;
  tween?: Phaser.Tweens.Tween;
  target: Phaser.GameObjects.GameObject;
  visualProperty: 'displayOriginY' | 'y';
  baseVisualY: number;
  baseAngle: number;
  bob: number;
  moving: boolean;
  frames?: WalkFrameState;
}

interface WalkFrameState {
  target: Phaser.GameObjects.Image;
  sheet: ConquestWalkSheet;
  index: number;
  distance: number;
  /** World distance between pose changes, derived from this sprite's drawn height. */
  stride: number;
}

/** Marks a container with the direction its art faces, for `faceTravel`. */
export function setNativeFacing(object: Phaser.GameObjects.Container, facing: NativeFacing): void {
  object.setData(NATIVE_FACING_KEY, facing);
}

/**
 * Points a glyph the way it is travelling. `direction` is the sign of the step just taken.
 *
 * Returns the scaleX applied, so a caller tracking changes can skip redundant writes.
 */
export function faceTravel(object: Walkable, direction: -1 | 1): number {
  const native = (object.getData(NATIVE_FACING_KEY) as NativeFacing | undefined) ?? 1;
  const scaleX = direction * native;
  applyFacing(object, scaleX);
  return scaleX;
}

/**
 * Draws one prop into its own `Graphics` at the given position, with the prop's own coordinates
 * centred on the object's origin so the object can be moved, flipped and tweened.
 *
 * Prefer `livingSprite` for anything there are many of: a live `Graphics` re-submits its whole
 * command list every frame, and these props are hundreds of path segments each.
 */
export function livingProp(
  scene: Phaser.Scene,
  x: number,
  y: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics({ x, y });
  draw(graphics);
  return graphics;
}

/** One instance of a baked prop, ready to be walked around. See `ink/sprites.ts`. */
export function livingSprite(
  scene: Phaser.Scene,
  baked: BakedProp,
  x: number,
  y: number,
  scale = 1,
): Phaser.GameObjects.Image {
  const sheet = conquestWalkSheetForTexture(baked.texture, baked.frame);
  if (!sheet || !scene.textures.exists(sheet.textureKey)) {
    return propImage(scene, baked, x, y, scale);
  }

  // Match the still asset's reviewed visible height, not the generated sheet's 627px cell. The
  // four sheet cells have generous transparent padding, so scaling by the full cell would shrink
  // the farmer/animal/cart compared with the original it replaces.
  //
  // **Measured, not declared.** `sheet.contentHeight` is a number written down when the sheet was
  // cut, and every one of them was a little off its own art: on a real map the walking traveller
  // stood 1.73x a soldier, the ox-cart 1.31x and the buffalo 1.26x, against a contract that says
  // every living thing on the ground shares one rate. Reading frame zero's opaque rows at runtime
  // costs a fraction of a millisecond once per sheet and cannot drift from the PNG it describes.
  // Ink against ink, on both sides of the swap.
  //
  // `baked.height` is the raster's cell, and a rasterised prop carries margin of its own — so
  // targeting it made the walking subject as tall as the still one's *padding*, not as tall as the
  // still one. That is the whole of why a walking traveller stood 1.8x a soldier while the standing
  // farmer beside him was exactly right: the still art had already been corrected to its ink and
  // this path had not.
  const stillInk = inkExtent(scene, baked.texture, baked.frame).y;
  const targetVisibleHeight = baked.height * baked.scale * scale * stillInk;
  //
  // Drawn from the reduced sheet, not the authored one. A map walker stands about nine world
  // pixels and the authored cell is 627, so the GPU was minifying 68:1 through a plain LINEAR
  // filter with no mipmaps: four texels out of a 68x68 footprint, which spread the figure over
  // nearly twice its own area and let the sampler straddle the 2x2 cell boundary into the next
  // pose. See `ensureConquestWalkSheetSmall`.
  const smallKey = ensureConquestWalkSheetSmall(scene, sheet);
  const key = smallKey ?? sheet.textureKey;
  const cell = smallKey ? WALK_CELL_SIZE : sheet.frameHeight;
  const inkRows = inkExtent(scene, key, 0).y * cell;
  const size = targetVisibleHeight / Math.max(1, inkRows);
  const image = scene.add.image(x, y, key, 0)
    .setScale(size)
    .setData(BASE_SCALE_KEY, size)
    .setData('walkCell', cell)
    .setData('stampKey', `walk:${sheet.kind}`);
  const frames: WalkFrameState = {
    target: image,
    sheet,
    index: 0,
    distance: 0,
    // The gait belongs to this sprite's drawn size, not to the sheet: the same art is placed at
    // several scales across the map, and one shared constant can only be right at one of them.
    stride: walkStrideFor(sheet, targetVisibleHeight),
  };
  image.setData(WALK_FRAME_KEY, frames);
  applyWalkFrame(frames, 0);
  return image;
}

function frameState(object: Walkable): WalkFrameState | undefined {
  const own = object.getData(WALK_FRAME_KEY) as WalkFrameState | undefined;
  if (own) return own;
  if (object instanceof Phaser.GameObjects.Container) {
    for (const child of object.list) {
      const state = child.getData?.(WALK_FRAME_KEY) as WalkFrameState | undefined;
      if (state) return state;
    }
  }
  return undefined;
}

function applyWalkFrame(state: WalkFrameState, index: number): void {
  state.index = index;
  state.target.setFrame(index);
  // Pin every pose to the same anatomical point: torso horizontally, planted-foot line vertically.
  // Cell centre is not an anatomical anchor—generated figures can sit tens of source pixels apart
  // inside equal cells, which becomes a visible side-to-side pop at map scale.
  //
  // Both are declared against the source's 627-pixel cell. Whatever cell the sprite is actually
  // drawn from — the reduced sheet is smaller, see `ensureConquestWalkSheetSmall` — the anchor
  // sits at the same *fraction* of it, so carry them across rather than keeping two tables that
  // can disagree.
  const cell = (state.target.getData('walkCell') as number | undefined) ?? state.sheet.frameHeight;
  const k = cell / state.sheet.frameHeight;
  state.target.setDisplayOrigin(
    (state.sheet.anchorsX?.[index] ?? state.sheet.frameWidth / 2) * k,
    state.sheet.baselines[index] * k,
  );
}

/** Advances an authored limb/wheel cycle by travelled world distance, not wall-clock time. */
export function advanceNaturalTravelMotion(object: Walkable, distance: number): void {
  if (!Number.isFinite(distance) || distance <= 0) return;
  const motion = object.getData(NATURAL_MOTION_KEY) as NaturalMotionState | undefined;
  const frames = motion?.frames ?? frameState(object);
  if (!motion?.moving || !frames) return;
  frames.distance += distance;
  while (frames.distance >= frames.stride) {
    frames.distance -= frames.stride;
    applyWalkFrame(frames, (frames.index + 1) % 4);
  }
}

/**
 * Gives a rigid stamp a restrained walk cycle without competing with its path tween.
 *
 * The road/grazing tween owns world x/y. This moves only the rendered child (or an Image's display
 * origin) and angle, so the sprite keeps its exact route, home radius, depth and facing scale. The
 * cycle is paused by default and callers enable it only while the object is actually travelling.
 */
export function addNaturalTravelMotion(
  scene: Phaser.Scene,
  object: Walkable,
  kind: NaturalMotionKind,
  seed: number,
): void {
  if (object.getData(NATURAL_MOTION_KEY)) return;

  const child = object instanceof Phaser.GameObjects.Container
    ? object.list.find((candidate) => (
      candidate instanceof Phaser.GameObjects.Image || candidate instanceof Phaser.GameObjects.Graphics
    ))
    : undefined;
  const targetIsRoot = child === undefined;
  const target = (child ?? object) as Phaser.GameObjects.GameObject & {
    y: number;
    angle: number;
    scaleY?: number;
    displayOriginY?: number;
  };
  const frames = frameState(object);
  // The road traveller already has four articulated poses large enough to read. Running the old
  // rigid-stamp bob and tilt on top of those distance-driven frames creates two unrelated clocks:
  // the torso rocks while the feet change elsewhere, which looks like jitter rather than gait.
  const stableRoadTraveler = frames?.sheet.sourceTextureKey.startsWith('conquest-art:life.traveler');
  const profile = stableRoadTraveler
    ? { bob: 0, angle: 0, duration: 420 }
    : kind === 'person'
    ? { bob: 0.32, angle: 1.1, duration: 420 }
    : kind === 'buffalo'
      ? { bob: 0.22, angle: 0.55, duration: 520 }
      : { bob: 0.16, angle: 0.35, duration: 600 };
  const imageTarget = target instanceof Phaser.GameObjects.Image;
  const rootScaleY = targetIsRoot
    ? 1
    : Math.max(0.0001, Math.abs((object as unknown as { scaleY?: number }).scaleY ?? 1));
  const targetScaleY = Math.max(0.0001, Math.abs(target.scaleY ?? 1));
  const baseVisualY = imageTarget ? target.displayOriginY! : target.y;
  const visualProperty: NaturalMotionState['visualProperty'] = imageTarget ? 'displayOriginY' : 'y';
  // `displayOriginY` is measured in source pixels; convert the desired world bob back through the
  // stamp and container scales. Graphics children can use local y directly.
  const bob = imageTarget ? profile.bob / (targetScaleY * rootScaleY) : profile.bob;
  const baseAngle = target.angle;
  const tween = profile.bob !== 0 || profile.angle !== 0
    ? scene.tweens.add({
      targets: target,
      [visualProperty]: baseVisualY + (imageTarget ? bob : -bob),
      angle: baseAngle + profile.angle,
      duration: profile.duration + (Math.abs(Math.round(seed)) % 5) * 24,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      paused: true,
    })
    : undefined;
  const state: NaturalMotionState = {
    kind, tween, target, visualProperty, baseVisualY, baseAngle, bob: profile.bob,
    moving: false, frames,
  };
  object.setData(NATURAL_MOTION_KEY, state);
  if (tween) object.once(Phaser.GameObjects.Events.DESTROY, () => tween.remove());
}

/** Starts or settles a previously installed natural travel cycle. */
export function setNaturalTravelMotionActive(object: Walkable, moving: boolean): void {
  const motion = object.getData(NATURAL_MOTION_KEY) as NaturalMotionState | undefined;
  if (!motion) return;
  motion.moving = moving;
  if (moving) {
    motion.tween?.resume();
    return;
  }
  motion.tween?.pause();
  const target = motion.target as Phaser.GameObjects.GameObject & {
    y: number;
    angle: number;
    displayOriginY?: number;
  };
  target[motion.visualProperty] = motion.baseVisualY;
  target.angle = motion.baseAngle;
  if (motion.frames) {
    // The accumulator resets; the pose does not.
    //
    // This used to snap back to frame zero every time a walker paused — and `wanderInSmallArea`
    // pauses between every leg, so a farmer's legs jumped position four or five times a minute in
    // full view. Measured over 22 s of one farmer: 5 of its 38 pose changes were this reset rather
    // than a step. Freezing mid-stride is what a person who stops walking actually looks like, and
    // the next leg then carries on from the pose the last one ended in.
    motion.frames.distance = 0;
  }
}

/**
 * Sends an animal wandering inside a small patch around its home: a few steps, a pause to crop the
 * grass, a few steps back. Bounded by `radius`, so a grazing beast never drifts off its own field
 * and never has to be cleaned up from somewhere unexpected.
 *
 * Vertical drift is squashed because the ground is seen from a low angle — wandering as far up and
 * down as sideways reads as sliding, not walking.
 */
export function grazeInSmallArea(
  scene: Phaser.Scene,
  animal: Walkable,
  homeX: number,
  homeY: number,
  radius: number,
  seed: number,
  nativeFacing: NativeFacing = 1,
): void {
  let step = Math.abs(Math.round(seed)) % 997;
  let facing = 0;
  // Findable from a driver script, so "the herd is not standing still" can be a check rather than
  // something somebody has to notice in a screenshot.
  animal.setData(GRAZING_KEY, { homeX, homeY, radius });
  animal.setData(NATIVE_FACING_KEY, nativeFacing);
  addNaturalTravelMotion(scene, animal, 'buffalo', seed);

  const next = (): void => {
    if (!animal.active) return;
    step += 1;
    const angle = noise(step * 3.7 + seed) * Math.PI * 2;
    const distance = radius * (0.35 + noise(step * 7.1 + seed) * 0.65);
    const targetX = homeX + Math.cos(angle) * distance;
    const targetY = homeY + Math.sin(angle) * distance * 0.45;

    const heading = targetX - animal.x;
    // A nearly vertical graze can still accumulate visible horizontal travel over its several
    // seconds. Only ignore true sub-pixel noise; otherwise the animal keeps its previous facing
    // and appears to slide backwards for the whole step.
    if (Math.abs(heading) > 0.01) {
      const direction = heading < 0 ? -1 : 1;
      if (direction !== facing) {
        facing = direction;
        applyFacing(animal, direction * nativeFacing);
      }
    }

    setNaturalTravelMotionActive(animal, true);

    let lastX = animal.x;
    let lastY = animal.y;
    scene.tweens.add({
      targets: animal,
      x: targetX,
      y: targetY,
      duration: 2600 + noise(step * 11.3 + seed) * 2800,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const distanceTravelled = Math.hypot(animal.x - lastX, animal.y - lastY);
        advanceNaturalTravelMotion(animal, distanceTravelled);
        lastX = animal.x;
        lastY = animal.y;
      },
      onComplete: () => {
        if (!animal.active) return;
        setNaturalTravelMotionActive(animal, false);
        scene.time.delayedCall(900 + noise(step * 13.9 + seed) * 3000, next);
      },
    });
  };

  scene.time.delayedCall(300 + (Math.abs(Math.round(seed)) % 2400), next);
}

/**
 * Keeps a person walking around one settlement without baking them into its architecture.
 * The path is deliberately compact and vertically compressed to match the isometric ground plane.
 */
export function wanderInSmallArea(
  scene: Phaser.Scene,
  walker: Walkable,
  homeX: number,
  homeY: number,
  radius: number,
  seed: number,
  nativeFacing: NativeFacing = 1,
): void {
  let step = Math.abs(Math.round(seed)) % 991;
  let facing = 0;
  walker.setData(WANDERING_KEY, { homeX, homeY, radius });
  walker.setData(NATIVE_FACING_KEY, nativeFacing);
  addNaturalTravelMotion(scene, walker, 'person', seed);

  const next = (): void => {
    if (!walker.active) return;
    step += 1;
    const angle = noise(step * 5.3 + seed) * Math.PI * 2;
    const distance = radius * (0.3 + noise(step * 8.7 + seed) * 0.7);
    const targetX = homeX + Math.cos(angle) * distance;
    const targetY = homeY + Math.sin(angle) * distance * 0.42;
    const heading = targetX - walker.x;
    if (Math.abs(heading) > 0.01) {
      const direction = heading < 0 ? -1 : 1;
      if (direction !== facing) {
        facing = direction;
        applyFacing(walker, direction * nativeFacing);
      }
    }
    setNaturalTravelMotionActive(walker, true);
    let lastX = walker.x;
    let lastY = walker.y;
    scene.tweens.add({
      targets: walker,
      x: targetX,
      y: targetY,
      duration: 2200 + noise(step * 9.9 + seed) * 2600,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const distanceTravelled = Math.hypot(walker.x - lastX, walker.y - lastY);
        advanceNaturalTravelMotion(walker, distanceTravelled);
        lastX = walker.x;
        lastY = walker.y;
      },
      onComplete: () => {
        if (!walker.active) return;
        setNaturalTravelMotionActive(walker, false);
        scene.time.delayedCall(500 + noise(step * 14.1 + seed) * 1800, next);
      },
    });
  };

  scene.time.delayedCall(180 + (Math.abs(Math.round(seed)) % 1300), next);
}

function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
