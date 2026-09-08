/**
 * The drawn landscapes for the other map themes — mountains, ink river, paddies, the marching
 * armies and the fog bands — plus the hand-drawn Đông Hồ landscape and weather.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../game/constants';
import { t } from '../../i18n';
import { PIGMENT } from '../../ui/ink/palette';
import { createPlayerLandFlag } from '../../ui/playerFlag';
import { brushStroke, inkOutline, shade, washFill, waveLine } from '../../ui/inkTheme';
import { inkPath, mulberry32, washFill as washInk, type Pt } from '../../ui/ink/stroke';
import { house, karstRange, softRidge } from '../../ui/ink/props';
import { drawFieldPlot, type FieldPlot } from '../../ui/ink/settlements';
import { createMenuRng, ringEdges, type MenuRiver } from './helpers';
import type { MenuScene } from '../MenuScene';

/** Draw one recognizable landscape object around its anchor, preserving its world aspect. */
function aspectProp(self: MenuScene, x: number, y: number, draw: (g: Phaser.GameObjects.Graphics) => void): Phaser.GameObjects.Graphics {
  const graphics = self.add.graphics({ x, y });
  draw(graphics);
  graphics.setData('menuAspectSafe', true);
  return graphics;
}

/**
 * The menu, drawn in the same hand as the map.
 *
 * A quiet Lý–Trần ceramic composition rather than a miniature strategy map: the mountains stay,
 * while the armies, standards, buffalo, field grid and scattered villages give way to a river,
 * broad right-bank paddies, two farmhouses and lotus. Four ideas can be read at phone scale;
 * forty little objects can only be counted.
 */
function drawDongHoLandscape(self: MenuScene, river: MenuRiver): void {
  const g = self.add.graphics()
    .setData('menuLandscapeRole', 'ground');
  const rand = mulberry32(1307);
  const HORIZON = 292;
  const FLOOR = 500;

  // Limestone at the horizon with soft earth hills tucked in front of it. Two landforms, because
  // one of them used for both gives a row of teeth.
  aspectProp(self, 0, HORIZON, (landforms) => {
    softRidge(landforms, -30, 236, 4, 30, 9021);
    softRidge(landforms, 168, GAME_WIDTH + 30, 2, 25, 9022);
    // The last argument thins the range out. On the map a massif has to fill its tiles; the
    // menu wants a horizon rather than a wall — but not the wide-apart fence posts it asked for
    // at 1.85, drawn back when every tower carried the same contour and overlapping them was
    // the only way they could hide each other. The towers are told their own distance now, so
    // they can stand close and the tone does the separating.
    karstRange(landforms, -24, 200, 0, 88, 4118, false, 1.0);
    karstRange(landforms, 186, GAME_WIDTH + 24, -4, 78, 4119, false, 1.0);
  }).setData('menuLandscapeRole', 'mountains');

  // Mist at the foot of the range. Towers are seated at varying depths, so their base fills stop
  // on a stepped line — invisible on the map, where ground tone covers it, and a row of pale
  // blocks here on bare paper. A band of haze is both the fix and what the eye expects anyway.
  // Laid as a GRADED stack rather than one flat block. A single polygon of paper tone ends
  // on a ruled horizontal edge, and because it is paper-on-paper everywhere except over the
  // towers, the only place that edge shows is across the rock — which is why the foot of the
  // range came out as a row of pale rectangles with a hard line under them. Ten thin slices
  // of falling opacity have no edge to find, and the rock fades into the ground instead of
  // stopping on it.
  const mist: Pt[] = [];
  for (let step = 0; step <= 14; step += 1) {
    mist.push({ x: -20 + (step / 14) * (GAME_WIDTH + 40), y: HORIZON - 14 + (rand() - 0.5) * 9 });
  }
  // Its OWN graphics, created after the landforms. `g` is made before them, and Phaser orders
  // by creation rather than by draw call — so every slice of this laid on `g` went UNDER the
  // range and showed only in the gaps between towers, as pale blocks with the rock stepping
  // over them. The haze has to be able to cover the feet it is there to hide.
  const haze = self.add.graphics();
  // A BAND centred on the feet, not a curtain hung from the horizon. Stacked as overlapping
  // sheets that each ran from the skyline downward, the opacity accumulated and swallowed the
  // range whole; and because each sheet took the print's hand registration, the fourteen of
  // them slipped apart into fourteen horizontal streaks. So: thin non-overlapping slices,
  // opacity rising from nothing at the skyline to full across the zone where the tower bases
  // stop, then back to nothing before the fields — and zero registration, because this is
  // atmosphere rather than a colour block.
  const HAZE_SLICES = 16;
  const HAZE_DEPTH = 54;
  for (let slice = 0; slice < HAZE_SLICES; slice += 1) {
    const t0 = slice / HAZE_SLICES;
    const t1 = (slice + 1) / HAZE_SLICES;
    const mid = (t0 + t1) / 2;
    const strength = Math.min(1, mid / 0.26, (1 - mid) / 0.34);
    washInk(
      haze,
      [
        ...mist.map((point) => ({ x: point.x, y: point.y + t0 * HAZE_DEPTH })),
        ...[...mist].reverse().map((point) => ({ x: point.x, y: point.y + t1 * HAZE_DEPTH })),
      ],
      PIGMENT.diep,
      4200 + slice,
      0.62 * Math.max(0, strength),
      0,
    );
  }

  // Three nearly transparent ground washes, not seven competing terrain bands. They give the
  // houses somewhere to stand without turning the illustration back into a map.
  for (let band = 0; band < 3; band += 1) {
    const y = HORIZON + band * ((FLOOR - HORIZON) / 3);
    g.fillStyle(band % 2 === 0 ? PIGMENT.diepLo : PIGMENT.hoePale, 0.07 - band * 0.012);
    g.fillEllipse(GAME_WIDTH / 2 + (rand() - 0.5) * 45, y + 28, GAME_WIDTH * 1.6, 170);
  }

  // The river as a course rather than a stripe: a band that narrows upstream, with its own inked
  // banks, running off the left edge before it reaches the buttons.
  washInk(g, river.banks, PIGMENT.chamWash, 3007, 0.55);
  inkPath(g, river.banks, 3008, { width: 0.85, alpha: 0.36, colour: PIGMENT.cham, wobble: 1.2, step: 13 });

  // Six large plots sharing their boundaries. The old eleven-unit lattice made a hundred little
  // tiles; these read as one cultivated river plain before they read as individual rectangles.
  const paddies: FieldPlot[] = [
    { points: [{ x: 246, y: 330 }, { x: 310, y: 326 }, { x: 304, y: 359 }, { x: 234, y: 365 }], stage: 0.84, seed: 4201 },
    { points: [{ x: 310, y: 326 }, { x: 402, y: 332 }, { x: 394, y: 361 }, { x: 304, y: 359 }], stage: 0.22, seed: 4202 },
    { points: [{ x: 234, y: 365 }, { x: 304, y: 359 }, { x: 300, y: 400 }, { x: 218, y: 409 }], stage: 0.62, seed: 4203 },
    { points: [{ x: 304, y: 359 }, { x: 394, y: 361 }, { x: 390, y: 402 }, { x: 300, y: 400 }], stage: 0.86, seed: 4204 },
    { points: [{ x: 218, y: 409 }, { x: 300, y: 400 }, { x: 294, y: 449 }, { x: 196, y: 462 }], stage: 0.58, seed: 4205 },
    { points: [{ x: 300, y: 400 }, { x: 390, y: 402 }, { x: 398, y: 448 }, { x: 294, y: 449 }], stage: 0.9, seed: 4206 },
  ];
  for (const plot of paddies) {
    drawFieldPlot(g, plot);
  }
  g.setData('menuRiceFields', paddies.map((plot) => ({
    x: plot.points.reduce((sum, point) => sum + point.x, 0) / plot.points.length,
    y: plot.points.reduce((sum, point) => sum + point.y, 0) / plot.points.length,
  })));

  // Exactly two homes, because this is a farmstead rather than a village icon cluster. They use
  // the map's nhà ba gian renderer: packed-earth walls and low rice-straw roofs, no temple finial.
  aspectProp(self, 290, 385, (prop) => house(prop, -23, 0, 1.58, 4301))
    .setData('menuLandscapeRole', 'farmhouse');
  aspectProp(self, 337, 417, (prop) => house(prop, -21, 0, 1.42, 4302))
    .setData('menuLandscapeRole', 'farmhouse');

  // Ripples ride the surface rather than being scratched onto it at random. Level strokes only:
  // randomising both ends put crossed scratches on the water.
  for (let ripple = 0; ripple < 6; ripple += 1) {
    const y = HORIZON + 20 + rand() * 220;
    const span = river.spanAt(y);
    if (!span) continue;
    const x = span.left + 3 + rand() * Math.max(2, span.right - span.left - 6);
    inkPath(g, [{ x: x - 6, y }, { x: x + 6, y: y + 1 }], 3100 + ripple,
      { width: 0.6, alpha: 0.26, colour: PIGMENT.cham, wobble: 0.4, step: 6 });
  }

  aspectProp(self, 26, 486, (prop) => drawMenuLotusCluster(prop))
    .setData('menuLandscapeRole', 'lotus');
}

/** Two open lotus flowers and three leaves, large enough to read as the foreground at phone size. */
function drawMenuLotusCluster(g: Phaser.GameObjects.Graphics): void {
  const leaf = (cx: number, cy: number, rx: number, ry: number, seed: number): void => {
    const points: Pt[] = [];
    for (let index = 0; index < 28; index += 1) {
      const angle = (index / 28) * Math.PI * 2;
      points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
    }
    washInk(g, points, PIGMENT.tramPale, seed, 0.42, 0.35);
    inkPath(g, [...points, points[0]], seed + 1, {
      width: 0.8, alpha: 0.55, colour: PIGMENT.tramDeep, wobble: 0.3, step: 5,
    });
    for (const angle of [-2.55, -2.05, -1.55, -1.05, -0.55]) {
      inkPath(g, [
        { x: cx, y: cy },
        { x: cx + Math.cos(angle) * rx * 0.86, y: cy + Math.sin(angle) * ry * 0.86 },
      ], seed + 4 + Math.round(angle * 10), {
        width: 0.45, alpha: 0.28, colour: PIGMENT.tramDeep, wobble: 0.15, step: 4,
      });
    }
  };
  const flower = (cx: number, cy: number, scale: number, seed: number, petals: number): void => {
    for (let index = 0; index < petals; index += 1) {
      const t = petals === 1 ? 0.5 : index / (petals - 1);
      const angle = -Math.PI + 0.32 + t * (Math.PI - 0.64);
      const length = scale * (11.5 - Math.abs(t - 0.5) * 5);
      const width = scale * 3.4;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const px = -dy;
      const py = dx;
      const petal: Pt[] = [
        { x: cx, y: cy + scale * 2 },
        { x: cx + dx * length * 0.46 + px * width, y: cy + dy * length * 0.46 + py * width },
        { x: cx + dx * length, y: cy + dy * length },
        { x: cx + dx * length * 0.46 - px * width, y: cy + dy * length * 0.46 - py * width },
      ];
      washInk(g, petal, PIGMENT.diepHi, seed + index, 0.88, 0.18);
      inkPath(g, [...petal, petal[0]], seed + 20 + index, {
        width: 0.7, alpha: 0.68, colour: PIGMENT.nau, wobble: 0.18, step: 4,
      });
    }
    inkPath(g, [{ x: cx - scale * 8, y: cy + scale * 2 }, { x: cx, y: cy + scale * 5 }, { x: cx + scale * 8, y: cy + scale * 2 }], seed + 40, {
      width: 0.8, alpha: 0.58, colour: PIGMENT.nau, wobble: 0.22, step: 4,
    });
  };

  // Still water first, then stems behind the leaves and flowers.
  for (let line = 0; line < 3; line += 1) {
    inkPath(g, [{ x: -4 + line * 6, y: line * 3 }, { x: 92 - line * 4, y: line * 3 + 1 }], 5000 + line, {
      width: 0.55, alpha: 0.24, colour: PIGMENT.cham, wobble: 0.5, step: 9,
    });
  }
  inkPath(g, [{ x: 28, y: 2 }, { x: 30, y: -52 }], 5010, { width: 0.9, alpha: 0.62, colour: PIGMENT.tramDeep, wobble: 0.25, step: 6 });
  inkPath(g, [{ x: 70, y: 2 }, { x: 69, y: -33 }], 5011, { width: 0.8, alpha: 0.58, colour: PIGMENT.tramDeep, wobble: 0.22, step: 6 });
  leaf(12, -8, 20, 8, 5020);
  leaf(47, -9, 17, 7, 5030);
  leaf(76, -5, 19, 8, 5040);
  flower(30, -49, 1.8, 5050, 7);
  flower(69, -31, 1.05, 5060, 5);
}

/**
 * What moves on the front page: only a handful of water strokes.
 *
 * The Đông Hồ menu had four banners twitching and nothing else — a printed picture with a corner
 * flapping. The river is the largest thing on the sheet and was the most obviously frozen, so it
 * carries the load: strokes ride the surface downstream and fade at each end of their run. The
 * farm itself stays still, which is part of the calm the composition is meant to create.
 */
function drawDongHoWeather(self: MenuScene, river: MenuRiver): void {
  const rand = mulberry32(6100);

  for (let index = 0; index < 8; index += 1) {
    const stroke = self.add.graphics().setDepth(-7);
    const width = 5 + rand() * 5;
    inkPath(stroke, [{ x: -width, y: 0 }, { x: width, y: 1 }], 6200 + index,
      { width: 0.6, alpha: 0.5, colour: PIGMENT.cham, wobble: 0.4, step: 6 });

    // Each stroke keeps its own lane across the channel so they do not all run down the middle.
    const lane = rand();
    const drift = { t: rand() };
    const place = (): void => {
      const y = 300 + drift.t * 250;
      const span = river.spanAt(y);
      if (!span) {
        stroke.setAlpha(0);
        return;
      }
      stroke.setPosition(span.left + 4 + lane * Math.max(2, span.right - span.left - 8), self.vy(y));
      // Fade in and out at the ends of the run, so nothing pops into existence mid-water.
      stroke.setAlpha(Math.sin(drift.t * Math.PI) * 0.9);
    };
    place();
    self.tweens.add({
      targets: drift,
      t: 1,
      duration: 9000 + index * 1100,
      repeat: -1,
      ease: 'Linear',
      onUpdate: place,
    });
  }

  // No birds, people, animals or banners. Motion belongs to the water and nowhere else.
}

/** Illustrated parchment landscape matching the selectable atlas map style. */
export function drawAtlasLandscape(self: MenuScene): void {
  const g = self.add.graphics();
  const rng = createMenuRng(1904);
  const { ink, inkSoft, water, waterDeep, waterHighlight, terrain, fog } = self.mapRenderer.palette;

  // Soft horizon haze so the receding ranges read as distance.
  g.fillStyle(fog, 0.45);
  g.fillRect(0, 150, GAME_WIDTH, 96);

  // Layered ink-silhouette ranges along the horizon (drawn before the land so it overlaps their base).
  self.mapRenderer.decorateTerrain(g, 'mountains', [
    { x: 40, y: 214 }, { x: 122, y: 206 }, { x: 210, y: 212 }, { x: 300, y: 204 }, { x: 372, y: 214 },
  ], 58, createMenuRng(806));

  // Rolling plains from the horizon to the foot of the page.
  const mainLand = [
    { x: -20, y: 250 }, { x: 70, y: 232 }, { x: 158, y: 246 }, { x: 246, y: 226 },
    { x: 330, y: 244 }, { x: GAME_WIDTH + 20, y: 250 },
    { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 }, { x: -20, y: GAME_HEIGHT + 20 },
  ];
  washFill(g, mainLand, terrain.plains, 0.92, () => rng());
  inkOutline(g, mainLand.slice(0, 6), inkSoft, 0.2, false, 31);

  // Left-bank forest band with scattered groves.
  const forestShape = [
    { x: -20, y: 238 }, { x: 96, y: 230 }, { x: 196, y: 250 }, { x: 196, y: 320 },
    { x: 158, y: 430 }, { x: 120, y: 540 }, { x: 78, y: 648 }, { x: 36, y: 752 }, { x: -20, y: 844 },
  ];
  washFill(g, forestShape, terrain.forest, 0.78, () => rng());
  // A handful of distinct groves in the upper-left bank, all kept above the button column.
  self.mapRenderer.decorateTerrain(g, 'forest', [
    { x: 56, y: 300 }, { x: 116, y: 356 }, { x: 40, y: 424 }, { x: 100, y: 452 },
  ], 44, createMenuRng(444));

  // Right-bank rice terraces.
  const riceShape = [
    { x: 232, y: 320 }, { x: GAME_WIDTH + 20, y: 296 }, { x: GAME_WIDTH + 20, y: 560 },
    { x: 250, y: 572 }, { x: 214, y: 448 },
  ];
  washFill(g, riceShape, terrain.riceFields, 0.7, () => rng());
  self.mapRenderer.decorateTerrain(g, 'riceFields', [
    { x: 322, y: 372 }, { x: 346, y: 452 },
  ], 50, createMenuRng(555));

  // Lower plains behind the button column.
  const lowerPlains = [
    { x: -20, y: 560 }, { x: GAME_WIDTH + 20, y: 560 },
    { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 }, { x: -20, y: GAME_HEIGHT + 20 },
  ];
  washFill(g, lowerPlains, shade(terrain.plains, 0.96), 0.5, () => rng());

  // A broad hand-drawn river dividing the two banks.
  const river = [
    { x: 214, y: 226 }, { x: 200, y: 320 }, { x: 224, y: 414 }, { x: 196, y: 512 },
    { x: 214, y: 612 }, { x: 178, y: 726 }, { x: 188, y: 844 },
  ];
  brushStroke(g, river, 40, ink, 0.42, 705);
  brushStroke(g, river, 34, water, 0.97, 719);
  brushStroke(g, river, 12, waterHighlight, 0.72, 727);
  for (let index = 0; index < river.length - 1; index += 1) {
    waveLine(g, river[index].x - 12, river[index].y + 10, river[index].x + 12, river[index].y + 10, 2, 4, waterDeep, 0.4);
  }

  // Fortified citadel on the right bank, rendered with the shared iso building renderer.
  const citadelCenter = { x: 312, y: 256 };
  const wallG = self.add.graphics();
  self.mapItems.drawCityWall(wallG, ringEdges(citadelCenter.x, citadelCenter.y, 46, 30));
  const citadel = self.add.container(0, 0);
  self.mapItems.addCityCluster(citadel, [citadelCenter, { x: 328, y: 282 }], false, 'city');

  // Riverside villages in the open strip beside the button column.
  const villages = self.add.container(0, 0);
  self.mapItems.addCottage(villages, 362, 596, 0.95);
  self.mapItems.addCottage(villages, 356, 662, 0.85);
}

export function drawLandscape(self: MenuScene): void {
  const g = self.add.graphics();
  const rng = createMenuRng(1307);

  // Pale mist at the horizon – fades into the sea-teal background
  g.fillGradientStyle(PIGMENT.diepHi, PIGMENT.diepHi, PIGMENT.diepLo, PIGMENT.diepLo, 0.55);
  g.fillRect(0, 0, GAME_WIDTH, 252);

  // Layered mountains drawn before the land polygon so they sit behind it
  drawMenuMountains(g);

  // Main land polygon – rolling fields from horizon to bottom
  const mainLand = [
    { x: -20, y: 252 },
    { x: 64, y: 228 },
    { x: 148, y: 244 },
    { x: 230, y: 218 },
    { x: 312, y: 236 },
    { x: GAME_WIDTH + 20, y: 250 },
    { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 },
    { x: -20, y: GAME_HEIGHT + 20 },
  ];
  washFill(g, mainLand, PIGMENT.hoePale, 0.88, () => rng());
  inkOutline(g, mainLand.slice(0, 6), PIGMENT.mucSoft, 0.22, false, 31);

  // Forest – organic shape that fills the entire left bank of the river.
  // Right edge follows the river control points with a small inset so the
  // river stroke visually reads as the border between forest and fields.
  const forestShape = [
    { x: -20, y: 236 },
    { x: 88, y: 228 },
    { x: 192, y: 246 },
    // river left bank: mirror river control points with ~6 px inset
    { x: 192, y: 306 },
    { x: 166, y: 412 },
    { x: 134, y: 524 },
    { x: 90, y: 632 },
    { x: 46, y: 740 },
    { x: 14, y: 844 },
    { x: -20, y: 844 },
  ];
  washFill(g, forestShape, PIGMENT.tram, 0.80, () => rng());

  // Tree silhouettes distributed across the full forest band
  self.mapRenderer.decorateTerrain(g, 'forest', [
    { x: 42, y: 272 },
    { x: 106, y: 292 },
    { x: 58, y: 362 },
    { x: 144, y: 350 },
    { x: 26, y: 438 },
    { x: 112, y: 424 },
    { x: 62, y: 516 },
    { x: 88, y: 578 },
    { x: 28, y: 618 },
    { x: 56, y: 676 },
    { x: 22, y: 722 },
    { x: 46, y: 774 },
  ], 44, createMenuRng(444));

  // Rice terraces – right side of the river
  const riceShape = [
    { x: 220, y: 328 },
    { x: GAME_WIDTH + 20, y: 300 },
    { x: GAME_WIDTH + 20, y: 540 },
    { x: 234, y: 554 },
    { x: 200, y: 450 },
  ];
  washFill(g, riceShape, PIGMENT.tramPale, 0.74, () => rng());

  const riceRng = createMenuRng(555);
  for (let y = 336; y <= 520; y += 30) {
    waveLine(g, 222, y, GAME_WIDTH - 14, y - 7, 2.5, 8, PIGMENT.mucSoft, 0.28);
  }
  self.mapRenderer.decorateTerrain(g, 'riceFields', [{ x: 306, y: 376 }, { x: 358, y: 442 }, { x: 300, y: 496 }], 52, riceRng);

  // Lower plains behind the button row
  const lowerPlains = [
    { x: -20, y: 498 },
    { x: GAME_WIDTH + 20, y: 498 },
    { x: GAME_WIDTH + 20, y: GAME_HEIGHT + 20 },
    { x: -20, y: GAME_HEIGHT + 20 },
  ];
  washFill(g, lowerPlains, shade(PIGMENT.tramPale, 0.96), 0.60, () => rng());

  for (let y = 518; y < 780; y += 44) {
    brushStroke(g, [{ x: 14, y }, { x: GAME_WIDTH - 14, y: y - 10 }], 0.9, PIGMENT.mucFaint, 0.14, y + 500);
  }

  // River from mountain area, flowing through forest to the sea
  drawInkRiver(self);
}

/**
 * Two-layer mountain range drawn manually for the menu:
 *   – Far layer: pale, low-alpha silhouettes near the horizon
 *   – Near layer: solid peaks with inner ridge, snow cap, and mist band
 */
function drawMenuMountains(g: Phaser.GameObjects.Graphics): void {
  // ── Far range – horizon silhouettes ──────────────────────────────────
  const farRng = createMenuRng(800);
  const farPeaks = [
    { cx: 52,  baseY: 228, halfW: 64, h: 70 },
    { cx: 152, baseY: 218, halfW: 82, h: 88 },
    { cx: 256, baseY: 224, halfW: 70, h: 76 },
    { cx: 362, baseY: 216, halfW: 60, h: 82 },
  ];
  for (const { cx, baseY, halfW, h } of farPeaks) {
    const jx = (farRng() - 0.5) * 14;
    const pts = [
      { x: cx - halfW,            y: baseY },
      { x: cx - halfW * 0.30,     y: baseY - h * 0.44 },
      { x: cx + jx,               y: baseY - h },
      { x: cx + halfW * 0.34,     y: baseY - h * 0.40 },
      { x: cx + halfW,            y: baseY },
    ];
    washFill(g, pts, shade(PIGMENT.diepLo, 1.10), 0.30);
    inkOutline(g, pts, PIGMENT.mucFaint, 0.16, false, cx);
    // Mist streak across lower slopes
    g.fillStyle(PIGMENT.diepHi, 0.16);
    g.fillEllipse(cx, baseY - h * 0.30, halfW * 1.7, h * 0.22);
  }

  // ── Near range – right side, behind citadel ───────────────────────────
  const nearRng = createMenuRng(305);
  const nearPeaks = [
    { cx: 302, baseY: 272, halfW: 76, h: 94 },
    { cx: 368, baseY: 260, halfW: 62, h: 110 },
  ];
  for (const { cx, baseY, halfW, h } of nearPeaks) {
    const jx = (nearRng() - 0.5) * 10;
    // Main silhouette with a secondary shoulder peak
    const pts = [
      { x: cx - halfW,             y: baseY },
      { x: cx - halfW * 0.56,      y: baseY - h * 0.52 },
      { x: cx - halfW * 0.16 + jx, y: baseY - h * 0.80 },
      { x: cx + jx,                y: baseY - h },
      { x: cx + halfW * 0.22 + jx, y: baseY - h * 0.84 },
      { x: cx + halfW * 0.52,      y: baseY - h * 0.48 },
      { x: cx + halfW,             y: baseY },
    ];
    washFill(g, pts, shade(PIGMENT.diepLo, 0.86), 0.88);
    inkOutline(g, pts, PIGMENT.muc, 0.60, false, cx);

    // Fainter inner ridge for depth
    const innerPts = [
      { x: cx - halfW * 0.54,      y: baseY - 2 },
      { x: cx - halfW * 0.20 + jx, y: baseY - h * 0.74 },
      { x: cx + jx,                y: baseY - h * 0.96 },
      { x: cx + halfW * 0.26 + jx, y: baseY - h * 0.76 },
      { x: cx + halfW * 0.52,      y: baseY - 2 },
    ];
    inkOutline(g, innerPts, PIGMENT.mucSoft, 0.26, false, cx + 11);

    // Snow cap at peak
    g.fillStyle(PIGMENT.diepHi, 0.84);
    g.fillTriangle(
      cx + jx,                     baseY - h,
      cx + jx - halfW * 0.22,      baseY - h * 0.72,
      cx + jx + halfW * 0.20,      baseY - h * 0.68,
    );

    // Mist band across mid-slopes
    g.fillStyle(PIGMENT.diepHi, 0.22);
    g.fillEllipse(cx, baseY - h * 0.40, halfW * 1.5, h * 0.20);
  }
}

function drawInkRiver(self: MenuScene): void {
  const river = self.add.graphics();
  const riverPoints = [
    { x: 16,  y: 844 },
    { x: 52,  y: 738 },
    { x: 96,  y: 630 },
    { x: 140, y: 522 },
    { x: 172, y: 410 },
    { x: 194, y: 318 },
    { x: 200, y: 226 },
  ];
  brushStroke(river, riverPoints, 26, PIGMENT.cham, 0.54, 87);
  brushStroke(river, riverPoints, 18,  PIGMENT.chamWash, 0.46, 91);
  const rng = createMenuRng(91);
  for (const point of riverPoints) {
    self.mapRenderer.decorateTerrain(river, 'water', [point], 44, rng);
  }
  for (let index = 0; index < 6; index += 1) {
    waveLine(river, 26 + index * 28, 816 - index * 96, 72 + index * 26, 806 - index * 96, 3, 5, PIGMENT.chamWash, 0.20);
  }
}

/** Two opposing armies facing each other across the river. */
export function drawArmies(self: MenuScene): void {
  const g = self.add.graphics();

  // Right bank – Dai Viet (player), all same red with same flag.
  // Kept in the upper field so nothing collides with the button column below (y ≥ 512).
  const rightFormations = [
    { cx: 268, cy: 356, cols: 5, rows: 3 },
    { cx: 316, cy: 438, cols: 4, rows: 3 },
  ];
  for (const { cx, cy, cols, rows } of rightFormations) {
    drawSoldiers(self, g, cx, cy, self.mapRenderer.palette.mapObjects.player, cols, rows);
    const totalW = (cols - 1) * 11;
    const totalH = (rows - 1) * 11;
    const flag = self.mapItems.createPlayerLandFlag(false, self.previewFlagSeed);
    flag.setPosition(cx + totalW / 2 + 14, cy + totalH / 2 + 4);
  }

  // Left bank – enemy army, all same dark olive with same flag.
  const leftFormations = [
    { cx: 100, cy: 356, cols: 4, rows: 3 },
    { cx: 62,  cy: 438, cols: 5, rows: 3 },
  ];
  const enemySeed = self.previewFlagSeed + 777;
  for (const { cx, cy, cols, rows } of leftFormations) {
    drawSoldiers(self, g, cx, cy, self.mapRenderer.palette.mapObjects.rival, cols, rows);
    const totalW = (cols - 1) * 11;
    const totalH = (rows - 1) * 11;
    const flag = createPlayerLandFlag(self, false, enemySeed, true);
    flag.setPosition(cx - totalW / 2 - 14, cy + totalH / 2 + 4);
  }
}

/** Draws a cols×rows grid of soldier silhouettes (body + head + spear). */
function drawSoldiers(self: MenuScene,
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  bodyColor: number,
  cols: number,
  rows: number,
): void {
  const spacing = 11;
  const startX = x - (cols - 1) * spacing / 2;
  const startY = y - (rows - 1) * spacing / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const sx = startX + col * spacing;
      const sy = startY + row * spacing;
      g.fillStyle(bodyColor, 0.82);
      g.fillRect(sx - 2, sy, 4, 6);
      g.fillStyle(shade(bodyColor, 1.28), 0.82);
      g.fillCircle(sx, sy - 2, 2.4);
      g.lineStyle(0.8, self.mapRenderer.palette.ink, 0.55);
      g.lineBetween(sx + 1, sy - 4, sx + 1, sy - 11);
    }
  }
}

export function drawFogBands(self: MenuScene): void {
  const clouds = [
    { x: 64,  y: 154, radius: 48, seed: 91,  alpha: 0.72 },
    { x: 306, y: 594, radius: 38, seed: 207, alpha: 0.58 },
    { x: 116, y: 736, radius: 42, seed: 332, alpha: 0.42 },
  ];
  for (const config of clouds) {
    const cloud = self.add.graphics();
    self.mapRenderer.drawCloud(cloud, config.x, config.y, config.radius, config.seed, config.alpha);
    self.tweens.add({
      targets: cloud,
      x: 16,
      duration: 9000 + config.x * 12,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
