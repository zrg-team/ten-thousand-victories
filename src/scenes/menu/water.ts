/**
 * The living parts of the Đông Hồ illustration: the plate drift, the river surface, the touch
 * ripples and wakes, and the lotus waterline swells and their ledger.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../../game/constants';
import { t } from '../../i18n';
import { PIGMENT } from '../../ui/ink/palette';
import { inkPath } from '../../ui/ink/stroke';
import { getGraphicsQuality } from '../../game/graphicsQuality';
import { LOTUS_SINK, MOUNTAIN_DROP } from './constants';
import type { MenuScene } from '../MenuScene';

/**
 * Each registered image plate owns a different movement range: distant mountains barely drift,
 * the bamboo follows a very small breeze, and the close lotus has the most visible sway.
 * Water, mist and touch ripples then add local motion without moving the stable river base.
 */
export function animateDongHoIllustration(self: MenuScene,
  bounds: { left: number; top: number; width: number; height: number },
  layers: {
    ground: Phaser.GameObjects.Image;
    mountains: Phaser.GameObjects.Image;
    mountainMist: Phaser.GameObjects.Container;
    waterFx: Phaser.GameObjects.Container;
    bamboo: Phaser.GameObjects.Image;
    bambooWind: Phaser.GameObjects.Image[];
    lotus: Phaser.GameObjects.Image;
  },
): void {
  const { left, top, width, height } = bounds;
  const at = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(
    left + width * x,
    top + height * y,
  );

  const centreX = GAME_WIDTH / 2;
  const centreY = top + height / 2;
  layers.ground.setData('menuLayerMotion', 'stable-river-base');
  layers.mountains.setData('menuLayerMotion', 'distant-drift');
  layers.bamboo.setData('menuLayerMotion', 'bamboo-breeze');
  layers.lotus.setData('menuLayerMotion', 'foreground-sway');

  // Around where the range was placed, not the plate's centre: see `MOUNTAIN_DROP`.
  const mountainHome = layers.mountains.y;
  self.tweens.add({
    targets: layers.mountains,
    x: { from: centreX - 1.2, to: centreX + 1.2 },
    y: { from: mountainHome + 0.4, to: mountainHome - 0.4 },
    duration: 16_000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  const bambooHome = layers.bamboo.getData('menuBambooHome') as { x: number; y: number };
  self.tweens.add({
    targets: layers.bamboo,
    x: { from: bambooHome.x - 0.55, to: bambooHome.x + 0.55 },
    angle: { from: -0.16, to: 0.16 },
    duration: 7_600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  layers.bambooWind.forEach((wind, index) => {
    const home = wind.getData('menuBambooWindHome') as { x: number; y: number };
    const amplitude = index === 0 ? 0.95 : 1.65;
    const angle = index === 0 ? 0.42 : 0.78;
    self.tweens.add({
      targets: wind,
      x: { from: home.x - amplitude, to: home.x + amplitude },
      y: { from: home.y + 0.15, to: home.y - 0.35 - index * 0.18 },
      angle: { from: -angle, to: angle },
      duration: 4_500 + index * 850,
      delay: 260 + index * 360,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  });
  // Ambient drift and pointer bending use separate proxies, then combine once onto the image.
  // Competing tweens on the image's x/y/angle caused pointer motion either to snap or to vanish
  // on the next ambient frame; two inputs into one transform behave like wind plus a soft stem.
  const lotusAmbient = { x: -0.95, y: 0.8, angle: -0.09 };
  const lotusReaction = { x: 0, y: 0, angle: 0 };
  // Around where the plate was placed, not the picture's centre: see `LOTUS_SINK`.
  const lotusHomeY = top + height * (0.5 + LOTUS_SINK);
  const applyLotusMotion = (): void => {
    layers.lotus
      .setPosition(centreX + lotusAmbient.x + lotusReaction.x, lotusHomeY + lotusAmbient.y + lotusReaction.y)
      .setAngle(lotusAmbient.angle + lotusReaction.angle)
      .setData('menuLotusReaction', { ...lotusReaction });
  };
  layers.lotus
    .setData('menuMotionProxy', lotusAmbient)
    .setData('menuLotusResponse', 'soft-damped-pointer-spring')
    .setData('menuLotusMotionProfile', 'visible-gentle-breeze')
    .setData('menuLotusAmbientRange', { x: 2, y: 1.6, angle: 0.18, duration: 5_800 })
    .setData('menuLotusMaxResponse', { x: 2.2, y: 1.1, angle: 0.7 });
  self.tweens.add({
    targets: lotusAmbient,
    x: { from: -0.95, to: 1.05 },
    y: { from: 0.8, to: -0.8 },
    angle: { from: -0.09, to: 0.09 },
    duration: 5_800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    onUpdate: applyLotusMotion,
  });
  applyLotusMotion();

  // The centre of the painted river, read from the generated plate in normalized coordinates.
  // Effects and hit feedback share this curve, so a ripple cannot appear in a rice plot.
  const river = new Phaser.Curves.Spline([
    at(0.52, 0.43), at(0.46, 0.47), at(0.34, 0.51), at(0.20, 0.57),
    at(0.15, 0.64), at(0.22, 0.71), at(0.38, 0.80), at(0.53, 0.90),
    at(0.60, 0.97),
  ]);
  // The channel opens toward the viewer. All ambient effects use a signed lane within that
  // perspective width instead of collapsing onto the centre spline (the artificial single rail
  // visible in the previous build). `lane = -1..1` means left bank through right bank.
  const riverHalfWidthAt = (t: number): number => width * Phaser.Math.Linear(0.012, 0.16, t);
  const riverLaneAt = (t: number, lane: number): {
    point: Phaser.Math.Vector2;
    tangent: Phaser.Math.Vector2;
  } => {
    const centre = river.getPointAt(t);
    const tangent = river.getTangentAt(t).normalize();
    const normal = new Phaser.Math.Vector2(-tangent.y, tangent.x);
    return {
      point: centre.clone().add(normal.scale(riverHalfWidthAt(t) * Phaser.Math.Clamp(lane, -0.78, 0.78))),
      tangent,
    };
  };

  // The authored river already contains dense engraved water lines. A translucent paper glaze
  // calms those marks without covering the banks, then a few LOCAL highlights breathe in place.
  // Nothing travels the whole channel: that motion looked like loose scratches sliding over art.
  const riverVeil = self.add.graphics()
    .setData('menuWaterTreatment', 'soft-paper-glaze')
    .setData('menuWaterCoverage', 'river-only');
  layers.waterFx.add(riverVeil);
  const glazeBands = [
    { from: 0, to: 0.38, width: width * 0.024, alpha: 0.17 },
    { from: 0.32, to: 0.68, width: width * 0.052, alpha: 0.16 },
    { from: 0.62, to: 1, width: width * 0.105, alpha: 0.14 },
  ];
  for (const band of glazeBands) {
    const points = Array.from({ length: 21 }, (_, sample) => (
      river.getPointAt(Phaser.Math.Linear(band.from, band.to, sample / 20))
    ));
    riverVeil.lineStyle(Math.max(5, band.width * 1.08), PIGMENT.chamPale, band.alpha * 0.78);
    riverVeil.strokePoints(points, false, false);
    riverVeil.lineStyle(Math.max(3, band.width * 0.78), PIGMENT.diepHi, band.alpha);
    riverVeil.strokePoints(points, false, false);
  }
  riverVeil
    .setData('menuRiverVeilBands', glazeBands.length)
    .setData('menuWaterGraphic', 'two-tone-reflection-wash');

  const currentCount = getGraphicsQuality() === 'low' ? 6 : 8;
  const shimmerAnchors = [0.18, 0.3, 0.43, 0.56, 0.68, 0.79, 0.88, 0.95];
  const shimmerLanes = [-0.68, 0.18, 0.66, -0.28, 0.46, -0.58, 0.06, 0.72];
  for (let index = 0; index < currentCount; index += 1) {
    const anchor = shimmerAnchors[index];
    const lane = shimmerLanes[index];
    const { point, tangent } = riverLaneAt(anchor, lane);
    // The earlier cream-on-cream glints were moving, but disappeared into the paper grain at
    // phone size. These are broad indigo-watercolour pools with a paper-bright inner reflection:
    // large enough to read, still far slower than the rejected sliding-scratch current.
    const travel = 12 + (index % 3) * 2;
    const span = 10 + anchor * 10;
    const baseScale = 0.58 + anchor * 0.66;
    const duration = 8_500 + index * 400;
    const flow = { clock: 0 };
    const phaseOffset = (index / currentCount) * 0.86;
    const current = self.add.graphics()
      .setData('menuAmbient', 'river-current')
      .setData('menuCurrentMotion', 'forward-surface-flow')
      .setData('menuCurrentVisibility', 'phone-readable')
      .setData('menuCurrentGraphic', 'layered-watercolour-ripples')
      .setData('menuCurrentInterpolation', 'forward-fade-loop')
      .setData('menuCurrentAnchor', anchor)
      .setData('menuCurrentLane', lane)
      .setData('menuCurrentTravel', travel)
      .setData('menuCurrentDuration', duration)
      .setData('menuCurrentMotionProxy', flow);
    layers.waterFx.add(current);
    const glintHeight = 3.4 + anchor * 1.8;
    current.fillStyle(PIGMENT.chamWash, 0.64);
    current.fillEllipse(-span * 0.18, 0.2, span * 0.72, glintHeight);
    current.fillStyle(PIGMENT.chamPale, 0.42);
    current.fillEllipse(span * 0.36, -0.15, span * 0.58, glintHeight * 0.78);
    current.fillStyle(PIGMENT.diepHi, 0.82);
    current.fillEllipse(-span * 0.14, -0.28, span * 0.36, glintHeight * 0.28);
    current.fillEllipse(span * 0.38, -0.36, span * 0.26, glintHeight * 0.22);
    current
      .setPosition(point.x - tangent.x * travel * 0.5, point.y - tangent.y * travel * 0.5)
      .setRotation(Math.atan2(tangent.y, tangent.x))
      .setScale(baseScale)
      .setAlpha(0.2);
    self.tweens.add({
      targets: flow,
      clock: { from: 0, to: 1 },
      duration,
      repeat: -1,
      ease: 'Linear',
      onUpdate: () => {
        const phase = (flow.clock + phaseOffset) % 1;
        const envelope = Math.sin(Math.PI * phase);
        current
          .setPosition(
            point.x + tangent.x * travel * (phase - 0.5),
            point.y + tangent.y * travel * (phase - 0.5),
          )
          .setScale(
            baseScale * (0.94 + envelope * 0.12),
            baseScale * (0.98 + envelope * 0.04),
          )
          .setAlpha(0.16 + envelope * (0.62 + (index % 2) * 0.04));
      },
    });
  }

  // A moving current can still read as static in a single glance, so the channel also carries
  // staggered surface pulses. These are compact water rings, never long strokes: each quietly
  // opens and disappears before another one answers farther downstream.
  const pulseAnchors = getGraphicsQuality() === 'low'
    ? [0.24, 0.42, 0.6, 0.78, 0.94]
    : [0.2, 0.32, 0.44, 0.56, 0.69, 0.82, 0.94];
  const pulseLanes = [-0.62, 0.44, -0.16, 0.68, -0.7, 0.12, 0.58];
  for (let index = 0; index < pulseAnchors.length; index += 1) {
    const anchor = pulseAnchors[index];
    const lane = pulseLanes[index];
    const { point } = riverLaneAt(anchor, lane);
    const pulse = self.add.graphics({ x: point.x, y: point.y })
      .setData('menuAmbient', 'river-pulse')
      .setData('menuRiverPulse', 'expanding-water-ring')
      .setData('menuRiverPulseAnchor', anchor)
      .setData('menuRiverPulseLane', lane);
    const ringWidth = 22 + anchor * 20;
    const ringHeight = 5 + anchor * 3;
    pulse.lineStyle(1.15, PIGMENT.chamPale, 0.9);
    pulse.strokeEllipse(0, 0, ringWidth, ringHeight);
    pulse.lineStyle(0.78, PIGMENT.diepHi, 0.9);
    pulse.strokeEllipse(0, 0.4, ringWidth * 0.68, ringHeight * 0.68);
    pulse.setScale(0.52).setAlpha(0.76);
    layers.waterFx.add(pulse);
    self.tweens.add({
      targets: pulse,
      scaleX: 1.32,
      scaleY: 1.18,
      alpha: 0.04,
      duration: 2_400 + (index % 3) * 360,
      delay: index * 220,
      repeat: -1,
      repeatDelay: 160 + (index % 2) * 140,
      ease: 'Sine.easeOut',
    });
  }

  // Direction is carried by a sparse set of paper-light flecks following the actual spline.
  // They are intentionally tiny, not lines, and take well over a minute to cross the illustration;
  // this makes the river unmistakably alive without returning to the fast sliding-current look.
  const flowMoteCount = getGraphicsQuality() === 'low' ? 6 : 9;
  const flowMoteLanes = [-0.72, -0.34, 0.12, 0.58, 0.76, -0.52, 0.36, 0.68, -0.12];
  for (let index = 0; index < flowMoteCount; index += 1) {
    const lane = flowMoteLanes[index];
    const mote = self.add.graphics()
      .setData('menuAmbient', 'river-flow-mote')
      .setData('menuRiverMoteMotion', 'smooth-spline-downstream')
      .setData('menuRiverMoteLane', lane);
    const length = 3.2 + (index % 3) * 1.2;
    const thickness = 1.2 + (index % 2) * 0.45;
    mote.fillStyle(PIGMENT.chamPale, 0.58);
    mote.fillEllipse(0, 0.35, length * 1.28, thickness * 1.35);
    mote.fillStyle(PIGMENT.diepHi, 0.92);
    mote.fillEllipse(-length * 0.08, 0, length, thickness);
    layers.waterFx.add(mote);

    const flow = { clock: 0 };
    const offset = (index + 0.35) / flowMoteCount;
    const duration = Math.round((110_000 + (index % 4) * 7_000) * (width / 326));
    mote
      .setData('menuRiverMoteDuration', duration)
      .setData('menuRiverMoteProxy', flow);
    const placeMote = (): void => {
      const phase = (offset + flow.clock) % 1;
      const t = Phaser.Math.Linear(0.1, 0.98, phase);
      const laneWander = lane + Math.sin((flow.clock + index * 0.17) * Math.PI * 2) * 0.055;
      const { point, tangent } = riverLaneAt(t, laneWander);
      const edgeFade = Phaser.Math.Clamp(Math.min(phase / 0.07, (1 - phase) / 0.07), 0, 1);
      mote
        .setPosition(point.x, point.y)
        .setRotation(Math.atan2(tangent.y, tangent.x))
        .setScale(0.72 + t * 0.52)
        .setAlpha(edgeFade * (0.52 + (index % 3) * 0.08));
    };
    placeMote();
    self.tweens.add({
      targets: flow,
      clock: { from: 0, to: 1 },
      duration,
      repeat: -1,
      ease: 'Linear',
      onUpdate: placeMote,
    });
  }

  // Separate wisps cross the actual mountain feet. The previous large paper-coloured ellipses
  // merged with the baked horizon haze, so their 20px tween was technically running but visually
  // unknowable. These narrower blue-grey-bottomed strands keep a readable moving edge.
  const mistStarts = [
    at(0.12, 0.405 + MOUNTAIN_DROP), at(0.31, 0.435 + MOUNTAIN_DROP), at(0.5, 0.405 + MOUNTAIN_DROP),
    at(0.7, 0.43 + MOUNTAIN_DROP), at(0.87, 0.4 + MOUNTAIN_DROP),
  ];
  for (let index = 0; index < mistStarts.length; index += 1) {
    const mist = self.add.graphics()
      .setData('menuAmbient', 'mountain-mist')
      .setData('menuMistLayer', 'mountains')
      .setData('menuMistVisibility', 'distinct-wisp');
    // Wider and deeper than the strands this started as. Once the wisps stopped being sheet
    // colour they could afford to be bigger: at the old size a faint band is a scratch, at this
    // one it is weather sitting in the valley, and it still leaves the pigment above it whole.
    //
    // Taller, stronger and quicker was tried on top of this and rejected: a lit crown over a
    // chàm belly, narrower banks and half the crossing time read as something other than cloud.
    // The shape below is the one that reads; leave its style alone.
    const span = width * (0.26 + (index % 2) * 0.045);
    const bandHeight = Math.max(9, height * (0.046 + (index % 3) * 0.006));
    const travel = width * (0.045 + (index % 2) * 0.012);
    const direction = index % 2 === 0 ? 1 : -1;
    const duration = 6_600 + index * 780;
    mist
      .setData('menuMistTravel', travel)
      // The widest ellipse the bank draws, so its reach can be checked against the plate's own
      // edges without a Graphics having bounds to ask for. See `probe-cloud-bounds.mjs`.
      .setData('menuMistSpan', span)
      .setData('menuMistDuration', duration);
    // A cool, thin haze rather than two near-opaque paper ellipses.
    //
    // The old wisps were `diepHi` at 0.72 over `diep` at 0.66 — sheet colour, laid across the
    // karst feet. Against the softly washed plates they read as morning mist; against these
    // printed ones, which have a hard ink line and no gradation anywhere, they read as a white
    // smear that dissolves the foot of every peak and leaves the range hanging in the air.
    // What is left is a chàm-grey band low enough to sit in the valley and faint enough that
    // the pigment above it stays flat and whole.
    mist.fillStyle(PIGMENT.chamWash, 0.3);
    mist.fillEllipse(-span * 0.13, 0, span * 0.72, bandHeight * 0.62);
    mist.fillStyle(PIGMENT.diep, 0.22);
    mist.fillEllipse(span * 0.17, 0.7, span * 0.7, bandHeight * 0.46);
    mist.fillStyle(PIGMENT.chamPale, 0.2);
    mist.fillEllipse(span * 0.03, bandHeight * 0.18, span * 0.84, bandHeight * 0.2);
    inkPath(mist, [
      { x: -span * 0.39, y: -bandHeight * 0.04 },
      { x: -span * 0.17, y: bandHeight * 0.07 },
      { x: span * 0.05, y: -bandHeight * 0.03 },
      { x: span * 0.24, y: bandHeight * 0.06 },
      { x: span * 0.4, y: -bandHeight * 0.02 },
    ], 7_350 + index, {
      width: 0.6,
      alpha: 0.4,
      colour: PIGMENT.chamPale,
      wobble: 0.32,
      step: 5,
    });
    layers.mountainMist.add(mist);
    const start = mistStarts[index];
    mist.setPosition(start.x, start.y).setAlpha(0.72);
    self.tweens.add({
      targets: mist,
      x: start.x + direction * travel,
      y: start.y + (index % 2 === 0 ? -1.6 : 1.4),
      alpha: { from: 0.58, to: 0.9 },
      scaleX: { from: 0.92, to: 1.1 },
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // Decorative interaction sits below all real menu controls. Even where the art safely
  // overscans beneath the first plate, that plate wins the input sort and keeps its route.
  const touch = self.add.zone(left, top, width, height)
    .setOrigin(0, 0)
    .setDepth(-6)
    .setInteractive()
    .setData('menuLandscapeInteraction', 'river-ripple');
  touch.setData('menuRiverGestures', ['tap', 'drag', 'hover-wake']);
  const nearestOnRiver = (targetX: number, targetY: number): {
    point: Phaser.Math.Vector2;
    tangent: Phaser.Math.Vector2;
    distance: number;
  } => {
    let nearest = river.getPoint(0);
    let nearestT = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let sample = 0; sample <= 96; sample += 1) {
      const t = sample / 96;
      const point = river.getPoint(t);
      const distance = Phaser.Math.Distance.Squared(targetX, targetY, point.x, point.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = point;
        nearestT = t;
      }
    }
    return { point: nearest, tangent: river.getTangent(nearestT).normalize(), distance: nearestDistance };
  };

  touch.on('pointerdown', (_pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
    const nearest = nearestOnRiver(left + localX, top + localY);
    const angle = Math.atan2(nearest.tangent.y, nearest.tangent.x);
    spawnDongHoWake(self, layers.waterFx, nearest.point.x, nearest.point.y, angle, width / GAME_WIDTH, 1);
    spawnDongHoRipple(self, layers.waterFx, nearest.point.x, nearest.point.y, width / GAME_WIDTH);
  });

  let lastWakeAt = -1_000;
  let lastDragRippleAt = -1_000;
  touch.on('pointermove', (pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
    const nearest = nearestOnRiver(left + localX, top + localY);
    const closeToWater = nearest.distance <= (width * 0.075) ** 2;
    if (!closeToWater || self.time.now - lastWakeAt < 90) return;
    lastWakeAt = self.time.now;
    const angle = Math.atan2(nearest.tangent.y, nearest.tangent.x);
    spawnDongHoWake(self, layers.waterFx, nearest.point.x, nearest.point.y, angle, width / GAME_WIDTH, pointer.isDown ? 0.9 : 0.42);
    if (pointer.isDown && self.time.now - lastDragRippleAt >= 260) {
      lastDragRippleAt = self.time.now;
      spawnDongHoRipple(self, layers.waterFx, nearest.point.x, nearest.point.y, width / GAME_WIDTH * 0.72);
    }
  });

  // The foreground lotus owns the top-left water region. A local hit zone keeps this gesture
  // separate from the river wake zone underneath it, while a soft overshooting return gives the
  // cluster the feel of stems bending and settling instead of a sprite following the cursor.
  const lotusTouch = self.add.zone(
    left + width * 0.02,
    top + height * 0.53,
    width * 0.51,
    height * 0.45,
  )
    .setOrigin(0, 0)
    .setDepth(-5.8)
    .setInteractive()
    .setData('menuLandscapeInteraction', 'lotus-sway')
    .setData('menuLotusGestures', ['hover', 'drag', 'water-wake']);
  layers.lotus.setData('menuLotusWaterResponse', 'stem-waterline-ripples');
  const lotusStemAnchors = [
    { id: 'large-flower', touchX: left + width * 0.22, x: left + width * 0.19, y: top + height * (0.915 + LOTUS_SINK) },
    { id: 'small-flower', touchX: left + width * 0.36, x: left + width * 0.345, y: top + height * (0.902 + LOTUS_SINK) },
  ] as const;
  let lastLotusPointer: { x: number; y: number } | undefined;
  let lastLotusWakeAt = -1_000;
  let lastLotusRippleAt = -1_000;
  const wakeBelowLotus = (
    pointer: Phaser.Input.Pointer,
    localX: number,
    localY: number,
    initial = false,
  ): void => {
    if (!initial && self.time.now - lastLotusWakeAt < 110) return;
    lastLotusWakeAt = self.time.now;
    const pointerX = lotusTouch.x + localX;
    const stem = lotusStemAnchors.reduce((closest, candidate) => (
      Math.abs(candidate.touchX - pointerX) < Math.abs(closest.touchX - pointerX) ? candidate : closest
    ));
    // A touch can land on a wide leaf or flower head, but its disturbance belongs where that
    // plant enters the water. Keep a tiny directional nudge so dragging still feels connected.
    const nudgeX = Phaser.Math.Clamp((pointerX - stem.touchX) * 0.16, -width * 0.012, width * 0.012);
    spawnLotusWaterlineWake(self, 
      layers.waterFx,
      stem.x + nudgeX,
      stem.y,
      width / GAME_WIDTH,
      pointer.isDown ? 1 : 0.72,
      stem.id,
    );
    if (pointer.isDown && self.time.now - lastLotusRippleAt >= 260) {
      lastLotusRippleAt = self.time.now;
      spawnDongHoRipple(self, layers.waterFx, stem.x + nudgeX, stem.y, width / GAME_WIDTH * 0.8);
    }
  };
  const bendLotus = (pointer: Phaser.Input.Pointer, localX: number, localY: number): void => {
    const fallbackX = (localX / lotusTouch.width - 0.5) * 5;
    const fallbackY = (localY / lotusTouch.height - 0.5) * 2;
    const dx = lastLotusPointer ? localX - lastLotusPointer.x : fallbackX;
    const dy = lastLotusPointer ? localY - lastLotusPointer.y : fallbackY;
    lastLotusPointer = { x: localX, y: localY };
    const strength = pointer.isDown ? 0.68 : 0.32;
    wakeBelowLotus(pointer, localX, localY);
    self.tweens.killTweensOf(lotusReaction);
    lotusReaction.x = Phaser.Math.Clamp(lotusReaction.x + dx * 0.12 * strength, -2.2, 2.2);
    lotusReaction.y = Phaser.Math.Clamp(lotusReaction.y + dy * 0.055 * strength, -1.1, 1.1);
    lotusReaction.angle = Phaser.Math.Clamp(lotusReaction.angle + dx * 0.035 * strength, -0.7, 0.7);
    applyLotusMotion();
    self.tweens.add({
      targets: lotusReaction,
      x: 0,
      y: 0,
      angle: 0,
      duration: pointer.isDown ? 1_180 : 980,
      ease: 'Sine.easeOut',
      onUpdate: applyLotusMotion,
    });
  };
  lotusTouch.on('pointerover', (pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
    lastLotusPointer = { x: localX, y: localY };
    wakeBelowLotus(pointer, localX, localY, true);
  });
  lotusTouch.on('pointermove', bendLotus);
  lotusTouch.on('pointerdown', bendLotus);
  lotusTouch.on('pointerout', () => {
    lastLotusPointer = undefined;
  });

  // Nobody is touching the pond most of the time, and water that only answers a pointer reads as
  // a printed picture between taps. Wind, fish and the stems themselves keep real water working,
  // so a slow swell opens at a flower base every few seconds on its own — never on a beat, never
  // at quite the same place, and always quieter than the answer a finger gets, so a real touch
  // still reads as the louder of the two.
  const idleWaveGap = getGraphicsQuality() === 'low'
    ? { min: 7_000, max: 13_000 }
    : { min: 4_200, max: 9_400 };
  layers.lotus
    .setData('menuLotusIdleWater', 'random-waterline-swell')
    .setData('menuLotusIdleWaveGap', idleWaveGap)
    .setData('menuLotusIdleWaveLog', self.lotusIdleWaveLog);
  const scheduleLotusIdleWave = (first = false): void => {
    // The first one lands early: a front page whose water holds still for eight seconds has
    // already told the player it is a still image, and nothing after that undoes it.
    const gap = first
      ? Phaser.Math.Between(900, 2_200)
      : Phaser.Math.Between(idleWaveGap.min, idleWaveGap.max);
    self.lotusIdleWaveTimer = self.time.delayedCall(gap, () => {
      self.lotusIdleWaveTimer = undefined;
      const lead = lotusStemAnchors[Phaser.Math.Between(0, lotusStemAnchors.length - 1)];
      spawnLotusIdleWave(self, 
        layers.waterFx,
        lead.x + Phaser.Math.FloatBetween(-width * 0.024, width * 0.024),
        lead.y + Phaser.Math.FloatBetween(-height * 0.005, height * 0.007),
        width / GAME_WIDTH,
        Phaser.Math.FloatBetween(0.62, 1),
        lead.id,
        0,
      );
      // Sometimes — not every time, or the pair would become a rhythm — the other stem answers a
      // moment later, the way one disturbance crosses a pond and reaches the next plant.
      const echo = lotusStemAnchors.find((candidate) => candidate.id !== lead.id);
      if (echo && getGraphicsQuality() !== 'low' && Phaser.Math.FloatBetween(0, 1) < 0.38) {
        spawnLotusIdleWave(self, 
          layers.waterFx,
          echo.x + Phaser.Math.FloatBetween(-width * 0.018, width * 0.018),
          echo.y,
          width / GAME_WIDTH,
          Phaser.Math.FloatBetween(0.4, 0.66),
          echo.id,
          Phaser.Math.Between(520, 1_260),
        );
      }
      scheduleLotusIdleWave();
    });
  };
  scheduleLotusIdleWave(true);
}

/** One touch answer, gone before it can become another permanent object in the composition. */
function spawnDongHoRipple(self: MenuScene, parent: Phaser.GameObjects.Container, x: number, y: number, artScale: number): void {
  const ripple = self.add.graphics({ x, y })
    .setScale(0.35)
    .setData('menuRipple', true);
  parent.add(ripple);
  ripple.lineStyle(0.95, PIGMENT.cham, 0.78);
  ripple.strokeEllipse(0, 0, 20 * artScale, 5.5 * artScale);
  ripple.lineStyle(0.65, PIGMENT.chamPale, 0.66);
  ripple.strokeEllipse(0, 0, 30 * artScale, 8 * artScale);
  self.tweens.add({
    targets: ripple,
    scaleX: 1.7,
    scaleY: 1.7,
    alpha: { from: 0.88, to: 0 },
    duration: 760,
    ease: 'Quad.easeOut',
    onComplete: () => ripple.destroy(),
  });
}

/** A brief current-aligned answer to hover or drag, carried downstream instead of expanding in place. */
function spawnDongHoWake(self: MenuScene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  angle: number,
  artScale: number,
  strength: number,
  source: 'river' | 'lotus' = 'river',
): void {
  const wake = self.add.graphics({ x, y })
    .setRotation(angle)
    .setAlpha(0.82 * strength)
    .setScale(0.7)
    .setData('menuWaterWake', true)
    .setData('menuWakeSource', source);
  parent.add(wake);
  const seed = 7_400 + Math.round(self.time.now) % 997;
  inkPath(wake, [{ x: -7, y: -2 }, { x: -1, y: -1.4 }, { x: 6, y: -2.2 }], seed, {
    width: 0.74,
    alpha: 0.74,
    colour: PIGMENT.cham,
    wobble: 0.24,
    step: 4,
  });
  inkPath(wake, [{ x: -6, y: 2 }, { x: 0, y: 1.4 }, { x: 7, y: 2.2 }], seed + 1, {
    width: 0.58,
    alpha: 0.62,
    colour: PIGMENT.chamPale,
    wobble: 0.2,
    step: 4,
  });
  const travel = 14 * artScale;
  self.tweens.add({
    targets: wake,
    x: x + Math.cos(angle) * travel,
    y: y + Math.sin(angle) * travel,
    scaleX: 1.25,
    scaleY: 1.05,
    alpha: 0,
    duration: 720 + Math.round(180 * strength),
    ease: 'Quad.easeOut',
    onComplete: () => wake.destroy(),
  });
}

/**
 * The rounded rings a disturbance makes at the lotus waterline.
 *
 * Three nested ellipses, flattened hard, because the pond is seen at a low angle: a circle here
 * would be a hoop standing up out of the water. Shared by the touch answer and the pond's own
 * idle swell so the water has one vocabulary — whatever moves it, it moves the same way.
 */
function drawWaterlineRings(g: Phaser.GameObjects.Graphics, artScale: number): void {
  g.lineStyle(1.05, PIGMENT.cham, 0.82);
  g.strokeEllipse(0, 0, 25 * artScale, 6.2 * artScale);
  g.lineStyle(0.72, PIGMENT.chamPale, 0.76);
  g.strokeEllipse(0, 0.8 * artScale, 38 * artScale, 9 * artScale);
  g.lineStyle(0.5, PIGMENT.diepHi, 0.72);
  g.strokeEllipse(0, 1.6 * artScale, 50 * artScale, 11 * artScale);
}

/** Lotus feedback expands from the stems' waterline, never from the distant river centre. */
function spawnLotusWaterlineWake(self: MenuScene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  artScale: number,
  strength: number,
  stem: 'large-flower' | 'small-flower',
): void {
  const wake = self.add.graphics({ x, y })
    .setScale(0.42)
    .setAlpha(0.68 + strength * 0.2)
    .setData('menuWaterWake', true)
    .setData('menuWakeSource', 'lotus')
    .setData('menuWakeOrigin', 'stem-waterline')
    .setData('menuWakeStem', stem)
    .setData('menuWakeBase', { x, y });
  parent.add(wake);
  drawWaterlineRings(wake, artScale);
  self.tweens.add({
    targets: wake,
    scaleX: 1.55 + strength * 0.12,
    scaleY: 1.18 + strength * 0.08,
    y: y + 1.4 * artScale,
    alpha: 0,
    duration: 980,
    ease: 'Sine.easeOut',
    onComplete: () => wake.destroy(),
  });
}

/**
 * The pond's own movement under the flowers: the same rounded rings, opening slowly.
 *
 * An earlier version drew its own travelling sine crests here. They were a wave in the physics
 * sense and wrong in the picture: two different water vocabularies on one plate, and the finer
 * one lost against the printed lines it sat on. The rings the touch already makes are the
 * shape this water uses, so the idle swell borrows it and changes only the pacing — a long fade
 * up instead of an instant strike, three times the time to open, and never as loud.
 */
function spawnLotusIdleWave(self: MenuScene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  artScale: number,
  strength: number,
  stem: 'large-flower' | 'small-flower',
  delay: number,
): void {
  const wave = self.add.graphics({ x, y })
    .setScale(0.38)
    .setAlpha(0)
    .setData('menuAmbient', 'lotus-idle-wave')
    .setData('menuIdleWaveOrigin', 'stem-waterline')
    .setData('menuIdleWaveShape', 'stem-waterline-rings')
    .setData('menuIdleWaveStem', stem)
    .setData('menuIdleWaveBase', { x, y });
  parent.add(wave);
  drawWaterlineRings(wave, artScale * (0.9 + strength * 0.3));

  // One proxy clock rather than a fade-in tween chained to a fade-out: the envelope has to peak
  // in the middle of the spread, and two tweens would put the brightest frame at the wrong size.
  const swell = { clock: 0 };
  const peak = 0.34 + strength * 0.26;
  const duration = Phaser.Math.Between(2_600, 4_200);
  self.lotusIdleWaveLog.push({ stem, x, y, duration, peak });
  if (self.lotusIdleWaveLog.length > 6) self.lotusIdleWaveLog.shift();
  wave
    .setData('menuIdleWaveDuration', duration)
    .setData('menuIdleWaveMotionProxy', swell);
  self.tweens.add({
    targets: swell,
    clock: { from: 0, to: 1 },
    duration,
    delay,
    ease: 'Linear',
    onUpdate: () => {
      // Opening eases out while the envelope stays symmetrical, so the rings are widest as they
      // fade rather than snapping back to nothing at full size.
      const spread = Math.sin(swell.clock * Math.PI * 0.5);
      wave
        .setScale(0.38 + spread * 1.05, 0.38 + spread * 0.82)
        .setY(y + spread * 1.8 * artScale)
        .setAlpha(peak * Math.sin(Math.PI * swell.clock));
    },
    onComplete: () => wave.destroy(),
  });
}
