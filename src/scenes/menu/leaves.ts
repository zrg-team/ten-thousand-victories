/**
 * The leaves adrift over the sheet: their painting, their currents in `update`, and the gust a
 * moving pointer makes.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../game/constants';
import { PIGMENT } from '../../ui/ink/palette';
import { mixPigment } from '../../ui/ink/season';
import { inkPath, mulberry32, type Pt } from '../../ui/ink/stroke';
import { getGraphicsQuality } from '../../game/graphicsQuality';
import { WIND_MARGIN, WIND_REACH, WIND_TOP_SPEED } from './constants';
import type { MenuScene } from '../MenuScene';

/**
 * A few leaves adrift over the sheet, and a hand that moves them.
 *
 * The first version was one leaf that steered towards the pointer, which is a pet: it looked
 * like something obeying, and a thing that obeys is a thing you then have to play with. Leaves
 * do not take instructions. These have their own slow currents and their own idea of where they
 * are going; what a moving pointer does is displace the air near it, and the ones close enough
 * to that are carried a little way before their own drift takes them back.
 *
 * Behind everything the page draws (`-1`) and above the whole landscape, so they cross the sky
 * and the parchment margins and pass *under* the button column rather than over anybody's words.
 *
 * Outside `content`: that is destroyed and rebuilt on every page change, and leaves that started
 * again from their corners each time somebody opened Settings would be a page transition rather
 * than weather.
 */
export function drawDriftingLeaves(self: MenuScene): void {
  // Quality buys leaves and nothing else — each is static geometry moved by a transform, so the
  // per-frame cost is the same three numbers whatever it looks like.
  const count = getGraphicsQuality() === 'low' ? 6 : 12;
  for (let index = 0; index < count; index += 1) {
    const random = mulberry32(4_700 + index * 613);
    const blade = self.add.graphics()
      .setDepth(-1)
      .setAlpha(0.52 + random() * 0.16)
      .setData('menuLeaf', 'wind-drift')
      .setData('menuLeafIndex', index);
    paintLeaf(blade, 4_700 + index * 613, 15 + random() * 7, index % 3);
    blade
      .setPosition(GAME_WIDTH * (0.1 + random() * 0.8), GAME_HEIGHT * (0.12 + random() * 0.72))
      .setRotation(random() * Math.PI * 2);
    self.leaves.push({
      blade,
      // A drift each, so they never travel as a flock.
      vx: (random() - 0.45) * 0.24,
      vy: (random() - 0.55) * 0.18,
      spin: (random() - 0.5) * 0.004,
      phase: random() * Math.PI * 2,
      sway: 2_600 + random() * 2_600,
      flutter: 1_100 + random() * 1_400,
    });
  }

  // Scene-level rather than a zone: every button on the page swallows its own pointer events,
  // and leaves that stopped feeling the hand the moment it crossed a card would look broken.
  // Registered in `create` and nowhere else — `render` runs many times a visit, and a listener
  // added per render is a listener stack.
  self.input.on('pointermove', (pointer: Phaser.Input.Pointer) => gust(self, pointer));
  self.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    // A tap that never moves still displaces air. Small, and outward from the point pressed.
    self.windLast.x = pointer.worldX;
    self.windLast.y = pointer.worldY;
    for (const leaf of self.leaves) {
      const offsetX = leaf.blade.x - pointer.worldX;
      const offsetY = leaf.blade.y - pointer.worldY;
      const reach = windFalloff(offsetX, offsetY);
      const distance = Math.max(6, Math.hypot(offsetX, offsetY));
      leaf.vx += (offsetX / distance) * 1.4 * reach;
      leaf.vy += (offsetY / distance) * 1.4 * reach;
      leaf.spin += (offsetX / distance) * 0.01 * reach;
    }
  });
}

/** How much of a gust reaches something this far from the hand that made it. */
function windFalloff(offsetX: number, offsetY: number): number {
  const spread = (offsetX * offsetX + offsetY * offsetY) / (WIND_REACH * WIND_REACH);
  return 1 / (1 + spread * spread);
}

/**
 * The air a moving hand pushes.
 *
 * An impulse per pointer event rather than a wind field kept between frames: `pointermove`
 * arrives many times a second while a hand is moving, so the impulses run together into
 * something continuous, and the moment the hand stops the wind stops with it — which is what
 * makes it read as displaced air rather than a force following the cursor around.
 */
function gust(self: MenuScene, pointer: Phaser.Input.Pointer): void {
  // Clamped, because a mouse flung across the sheet in one frame is not a hurricane.
  const dx = Phaser.Math.Clamp(pointer.worldX - self.windLast.x, -36, 36);
  const dy = Phaser.Math.Clamp(pointer.worldY - self.windLast.y, -36, 36);
  self.windLast.x = pointer.worldX;
  self.windLast.y = pointer.worldY;
  if (Math.abs(dx) + Math.abs(dy) < 0.6) {
    return;
  }
  for (const leaf of self.leaves) {
    const reach = windFalloff(leaf.blade.x - pointer.worldX, leaf.blade.y - pointer.worldY);
    leaf.vx += dx * 0.15 * reach;
    leaf.vy += dy * 0.15 * reach;
    leaf.spin += dx * 0.0018 * reach;
  }
}

/**
 * The drift, and the only per-frame work this scene does.
 *
 * Frame-rate independent throughout: `delta` scales every step and the drag is raised to it, so
 * the same leaf crosses the same sheet in the same time on a 60Hz panel and a 120Hz one.
 * Everything else on this page is a tween, which Phaser already paces.
 */
export function update(self: MenuScene, time: number, delta: number): void {
  if (self.leaves.length === 0) {
    return;
  }
  const step = delta / 16.67;
  const drag = 0.972 ** step;
  for (const leaf of self.leaves) {
    // Its own slow current, which is what it returns to once a gust has passed.
    leaf.vx += Math.sin(time / leaf.sway + leaf.phase) * 0.016 * step;
    leaf.vy += Math.cos(time / (leaf.sway * 1.37) + leaf.phase) * 0.011 * step;
    leaf.vx *= drag;
    leaf.vy *= drag;
    const speed = Math.hypot(leaf.vx, leaf.vy);
    if (speed > WIND_TOP_SPEED) {
      leaf.vx *= WIND_TOP_SPEED / speed;
      leaf.vy *= WIND_TOP_SPEED / speed;
    }
    leaf.spin *= drag;
    const blade = leaf.blade;
    blade.x += leaf.vx * step;
    blade.y += leaf.vy * step;
    blade.rotation += leaf.spin * step;
    // Turning edge-on and back: the one thing that says leaf rather than petal, and it costs a
    // scale write. Never all the way to nothing, which reads as a flicker rather than a turn.
    blade.setScale(1, 0.58 + Math.abs(Math.sin(time / leaf.flutter + leaf.phase)) * 0.42);
    // Off one edge, on at the other. A leaf that stopped at the margin would be a leaf in a box.
    if (blade.x < -WIND_MARGIN) blade.x = GAME_WIDTH + WIND_MARGIN;
    if (blade.x > GAME_WIDTH + WIND_MARGIN) blade.x = -WIND_MARGIN;
    if (blade.y < -WIND_MARGIN) blade.y = GAME_HEIGHT + WIND_MARGIN;
    if (blade.y > GAME_HEIGHT + WIND_MARGIN) blade.y = -WIND_MARGIN;
  }
}

/**
 * One leaf, drawn once.
 *
 * A pointed lens with a fold down it: the blade is asymmetric — the upper edge bows harder than
 * the lower — and the whole thing is bent into a shallow arc, because a flat symmetrical lens is
 * a petal. The lower half carries a deeper wash so the fold reads at fifteen units, the midrib
 * runs past the base into a stem, and five pairs of veins leave it swept towards the tip.
 *
 * Three tones in rotation: two cajuput greens and one sophora-and-iron brown, so a handful of
 * these looks like leaves off more than one tree without any of them leaving the palette.
 */
function paintLeaf(g: Phaser.GameObjects.Graphics, seed: number, length: number, tone: number): void {
  const random = mulberry32(seed);
  const width = length * (0.3 + random() * 0.07);
  const bend = length * 0.05;
  // The veins carry their own colour rather than reusing the edge ink: on the deep cajuput green
  // a `tramDeep` vein is the same value as the blade it is drawn on, and the leaf comes out a
  // blob with an outline. Light veins on the dark tone, dark on the two light ones.
  // Pitched at the printed foliage, which is deeper and yellower than the old sage pair: the
  // lotus pads measure #607842 and their veins #808752, the bamboo canopy #43481a, and every
  // leaf on those sheets is closed with a black ink line rather than a darker shade of itself.
  // The pale `tramPale` blade the leaves used to carry was lighter than anything on the page.
  const tones = [
    { fill: mixPigment(PIGMENT.tram, PIGMENT.tramDeep, 0.55), shade: PIGMENT.tramDeep, ink: PIGMENT.muc, vein: PIGMENT.tramPale },
    { fill: PIGMENT.tram, shade: PIGMENT.tramDeep, ink: PIGMENT.muc, vein: PIGMENT.tramPale },
    { fill: mixPigment(PIGMENT.hoePale, PIGMENT.hoe, 0.45), shade: PIGMENT.nau, ink: PIGMENT.muc, vein: PIGMENT.nau },
  ];
  const paint = tones[tone % tones.length];
  const SAMPLES = 18;
  const spine = (u: number): number => -Math.sin(Math.PI * u) * bend;
  const rib = (from: number, to: number): Pt[] => {
    const points: Pt[] = [];
    for (let sample = 0; sample <= SAMPLES; sample += 1) {
      const u = Phaser.Math.Linear(from, to, sample / SAMPLES);
      points.push({ x: -length / 2 + u * length, y: spine(u) });
    }
    return points;
  };
  const upper: Pt[] = [];
  const lower: Pt[] = [];
  for (let sample = 0; sample <= SAMPLES; sample += 1) {
    const u = sample / SAMPLES;
    // Fullest a third of the way up from the base, not halfway: that is where a leaf carries.
    const taper = Math.sin(Math.PI * u ** 0.82) ** 0.9;
    const x = -length / 2 + u * length;
    upper.push({ x, y: spine(u) - taper * width * 0.62 });
    lower.push({ x, y: spine(u) + taper * width * 0.44 });
  }
  const outline = [...upper, ...[...lower].reverse()];
  g.fillStyle(paint.fill, 0.94);
  g.fillPoints(outline, true, true);
  // The fold: everything under the midrib, a shade deeper.
  g.fillStyle(paint.shade, 0.5);
  g.fillPoints([...lower, ...rib(1, 0)], true, true);
  inkPath(g, outline, seed + 1, {
    width: 0.55, alpha: 0.8, colour: paint.ink, wobble: 0.3, step: 4,
  });
  // Midrib, run out past the base into a stem.
  g.lineStyle(0.62, paint.vein, 0.85);
  g.strokePoints([
    { x: -length / 2 - length * 0.11, y: spine(0) + width * 0.06 },
    ...rib(0, 1),
  ], false, false);
  g.lineStyle(0.42, paint.vein, 0.66);
  for (let vein = 1; vein <= 5; vein += 1) {
    const u = 0.16 + vein * 0.13;
    const reach = Math.sin(Math.PI * u ** 0.82) ** 0.9;
    const x = -length / 2 + u * length;
    // Swept towards the tip on both sides, which is what stops it looking like a fish bone.
    g.strokePoints([
      { x, y: spine(u) },
      { x: x + length * 0.1, y: spine(u) - reach * width * 0.46 },
    ], false, false);
    g.strokePoints([
      { x, y: spine(u) },
      { x: x + length * 0.09, y: spine(u) + reach * width * 0.33 },
    ], false, false);
  }
}
