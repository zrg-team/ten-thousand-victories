/**
 * The illustration behind the page: which theme draws what, the column veil, the landscape
 * fit for tall and wide sheets, and the placement of the Đông Hồ plates.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, uiColumnX } from '../../game/constants';
import { t } from '../../i18n';
import { PIGMENT } from '../../ui/ink/palette';
import { fitIllustrationToSheet } from '../../ui/desktopBackdrop';
import { LOTUS_SINK, MOUNTAIN_DROP } from './constants';
import type { MenuScene } from '../MenuScene';

/**
 * On the desktop the illustration is the whole window, not a plate in the column.
 *
 * The page's camera covers the sheet with the column in the middle (`cameraLayout.ts`), so the
 * same container the column was built for is scaled about the sheet's centre until it covers
 * it — the karst across the top of the monitor, the lotus at its foot, and the button column's
 * wash standing on the river in between. The plates are 1536 wide, so at 1080p they arrive
 * about 1.8x upscaled, which a painted backdrop carries. Nothing on the phone.
 */
function fitIllustrationToDesktop(self: MenuScene): void {
  const artwork = self.children.list.find((child) => (child as Phaser.GameObjects.GameObject)
    .getData?.('menuLandscapeRole') === 'illustration') as Phaser.GameObjects.Container | undefined;
  const ground = artwork?.list.find((child) => (child as Phaser.GameObjects.GameObject)
    .getData?.('menuArtworkLayer') === 'ground') as Phaser.GameObjects.Image | undefined;
  if (!artwork || !ground) return;
  fitIllustrationToSheet(artwork, { x: ground.x, y: ground.y }, { width: ground.displayWidth, height: ground.displayHeight });
}

export function drawBackground(self: MenuScene): void {
  self.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT).setDepth(-10);
  const menu = self.mapRenderer.theme.renderers.menu;

  if (menu === 'dongho') {
    // The page's own paper. It is `diep` and not the brighter `diepHi` of the card stock: the
    // shell paints `diep` behind the canvas (index.html), so a lighter sheet here reads as a
    // white panel sitting on the page wherever the canvas is letterboxed, which is every desktop
    // window. The card prints keep their brighter ground; the page under them is the darker one.
    const paper = self.add.graphics().setDepth(-9);
    paper.fillStyle(PIGMENT.diep, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawDongHoIllustration(self);
    fitIllustrationToDesktop(self);
  } else if (menu === 'atlas') {
    fitLandscapeLayer(self, () => {
      self.drawAtlasLandscape();
      self.drawArmies();
    });
  } else {
    fitLandscapeLayer(self, () => {
      self.drawLandscape();
      self.drawArmies();
      self.drawFogBands();
    });
  }

  drawColumnVeil(self);
}

/**
 * A wash of điệp laid back over the lower half of the diorama.
 *
 * The landscape is deliberately sparse — mountains, one river, six broad paddies, two houses and
 * a lotus cluster — but the lower wash still gives the button column a calm sheet to stand on.
 * It gains opacity down the page, making the illustration recede before it reaches the actions.
 *
 * Graded slices with no overlap, for the same reason the horizon haze uses them: sheets that
 * each run from a shared top accumulate their opacity and arrive as a curtain, with a seam
 * everywhere the registration offsets one from the next. Slice edges are rounded to whole
 * pixels and each slice starts where the last one ended, so there is neither a gap nor a
 * double-painted line between them.
 */
function drawColumnVeil(self: MenuScene): void {
  const veil = self.add.graphics().setDepth(-5).setData('menuColumnVeil', true);
  const band = (from: number, to: number, at: (t: number) => number) => {
    const SLICES = 30;
    for (let slice = 0; slice < SLICES; slice += 1) {
      const y0 = Math.round(from + (slice / SLICES) * (to - from));
      const y1 = Math.round(from + ((slice + 1) / SLICES) * (to - from));
      veil.fillStyle(PIGMENT.diep, at((slice + 0.5) / SLICES));
      veil.fillRect(0, y0, GAME_WIDTH, y1 - y0);
    }
  };

  // The plate the wordmark stands on. Type never sits on busy ground in this art — the same rule
  // that puts a `clearPlate` behind a label on hatching. The karst tops reach 204 in the design,
  // well up into the title block, and a gold rule ruled straight across a mountain ridge is the
  // exact thing that rule is there to prevent.
  band(0, self.vy(168), (t) => 0.94 * (1 - t) ** 1.5);

  // And the wash the button column stands on. Squared rather than linear: a straight ramp greys
  // the mountains as much as it settles the foreground, and the mountains were already quiet.
  band(self.vy(196), GAME_HEIGHT, (t) => 0.9 * t ** 1.6);

  // On the desktop the illustration is the whole window at full strength, and a ramp tuned
  // against a plate left the ghost buttons and the footer links standing on paddies. A level
  // wash under the button block makes the column a panel; the ramp above still lets the river
  // through behind the first button. The column's own edges are the panel's edges.
  if (uiColumnX() > 0) band(self.vy(300), GAME_HEIGHT, () => 0.42);
}

/**
 * Runs `draw` and collects everything it created into a landscape fitted onto the device's sheet.
 *
 * Large ground washes and the river may compress vertically; they are the layout. Recognizable
 * objects tagged `menuAspectSafe` counter-scale inside the container, so mountains, houses and
 * lotus flowers keep their authored proportions while their anchor positions still fit the
 * short sheet. This is the difference between moving a tree closer and flattening the tree.
 *
 * Live objects remain outside this container so they can move and use `vy` for the same fitted
 * ground position.
 */
function fitLandscapeLayer(self: MenuScene, draw: () => void): Phaser.GameObjects.Container {
  const before = new Set(self.children.list);
  draw();
  const art = self.add.container(0, 0).setDepth(-8);
  for (const child of self.children.list.slice()) {
    if (before.has(child) || child === art) continue;
    art.add(child as Phaser.GameObjects.GameObject & { x: number; y: number });
  }
  art.setScale(1, self.vScale).setY(-self.vy(90));
  // A tagged object is drawn around its own local origin. Countering the parent's vertical scale
  // restores a 1:1 world aspect without changing the fitted y position of that origin.
  for (const child of art.list) {
    const transform = child as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & {
      getData?: (key: string) => unknown;
    };
    if (transform.getData?.('menuAspectSafe')) {
      transform.setScale(1, 1 / self.vScale);
    }
  }
  return art;
}

/** The approved river scene, registered as four real image layers instead of one static plate. */
function drawDongHoIllustration(self: MenuScene): void {
  const texture = self.textures.get('menu-layer-ground-v5').getSourceImage() as { width: number; height: number };
  // The art lane loses height much faster than width on short browser-chrome viewports. Shrink
  // uniformly instead of squashing the landscape: full bleed on the 844 sheet, a quiet paper
  // margin on the compact sheet, and the lotus/roofs keep their authored proportions on both.
  const fitted = Phaser.Math.Clamp((self.vScale - 0.62) / 0.38, 0, 1);
  // A tall sheet can carry a small, safe overscan; the source keeps clear outer margins around
  // the lotus and roofs. That closes the dead parchment band above the first plate without
  // cropping a focal object. Compact sheets remain at their existing contained width.
  const width = GAME_WIDTH * Math.min(1.08, Phaser.Math.Linear(0.8, 1.2, fitted));
  const height = width * (texture.height / texture.width);
  const top = self.vy(100) + Math.round(16 * fitted);
  const left = (GAME_WIDTH - width) / 2;
  const centreY = top + height / 2;
  const artwork = self.add.container(0, 0)
    .setDepth(-8)
    .setData('menuLandscapeRole', 'illustration')
    .setData('menuArtwork', {
      version: 12,
      layers: ['ground', 'mountains', 'mountain-mist', 'river-fx', 'bamboo', 'lotus'],
      composition: ['karst-mountains', 's-curve-river', 'foreground-lotus', 'right-bank-paddies', 'right-bank-bamboo-grove'],
      motion: ['mountain-drift', 'mountain-mist', 'bamboo-breeze', 'lotus-sway', 'pointer-lotus-spring', 'river-surface-flow', 'lotus-water-wakes', 'lotus-idle-swell', 'tap-and-drag-wakes'],
      width,
      height,
    });

  const layer = (key: string, name: string, alpha: number): Phaser.GameObjects.Image => {
    const source = self.textures.get(key).getSourceImage() as { width: number; height: number };
    const image = self.add.image(GAME_WIDTH / 2, centreY, key)
      .setDisplaySize(width, height)
      .setAlpha(alpha)
      .setData('menuArtworkLayer', name)
      .setData('sourceSize', { width: source.width, height: source.height });
    artwork.add(image);
    return image;
  };

  const ground = layer('menu-layer-ground-v5', 'ground', 0.95)
    .setData('menuFieldContinuity', 'fully-planted-rice');
  // The range is dropped a thirtieth of the plate. Drawn on its own registration the karst feet
  // end at 0.49 of the frame and the ground's far bank begins at 0.455, so between the peaks the
  // plate's bare paper showed through as a pale seam and the mountains read as a separate strip
  // pasted above the valley. At this drop the green skirts sit on the bank the whole way across;
  // much more and the right-hand range starts covering the far paddies. The mist band below
  // moves with it, or it would whiten the join it used to sit on.
  const mountains = layer('menu-layer-mountains-v3', 'mountains', 1)
    .setY(centreY + height * MOUNTAIN_DROP)
    .setData('menuMountainDrop', MOUNTAIN_DROP);
  // This container is deliberately inserted between mountains and village. Mist can cross the
  // feet of the karst without whitening the houses or close lotus in front of it.
  const mountainMist = self.add.container(0, 0)
    .setData('menuArtworkLayer', 'mountain-mist')
    .setData('menuLayerMotion', 'valley-drift');
  artwork.add(mountainMist);
  // Every live water mark belongs inside the illustration, before the bamboo and lotus.
  // Scene-level depth cannot interleave with children of a Container: the old currents were
  // therefore painted over the entire plate, including the foreground flowers.
  const waterFx = self.add.container(0, 0)
    .setData('menuArtworkLayer', 'river-fx')
    .setData('menuCompositing', 'below-bamboo-and-lotus');
  artwork.add(waterFx);
  const bamboo = layer('menu-layer-bamboo-v2', 'bamboo', 0.72)
    .setData('menuBambooPlacement', 'rear-field-edge-windbreak')
    .setData('menuBambooBand', 'rear-right-dike')
    .setData('menuBambooStyle', 'dong-ho-natural-pigment')
    .setData('menuBambooCulmCount', 13)
    .setData('menuBambooWindMode', 'segmented-canopy-lag')
    .setData('menuBambooWindLayers', 2);
  // The isolated grove keeps the registered 1536x1024 frame. Its measured ink bounds are
  // transformed onto the distant outer dike. At one fifth scale the roots sit on the bank line,
  // not inside a planted plot, and the grove reads as a rear windbreak rather than foreground art.
  // The v2 plate's grove is drawn larger in the frame than v1's was (1016 x 649 against
  // 904 x 522), which is why the bounds, and the wind crops below, were re-measured for it.
  const bambooScale = 0.2;
  const bambooSourceBounds = { left: 519, top: 358, right: 1535, bottom: 1007 };
  const bambooSourceCentre = {
    x: (bambooSourceBounds.left + bambooSourceBounds.right) / 2,
    y: (bambooSourceBounds.top + bambooSourceBounds.bottom) / 2,
  };
  // 1380, not the 1400 the v1 grove stood at: the v2 grove is wider, and at 1400 its outer
  // leaves ran past the plate's overscanned right edge on the tall sheet.
  const bambooTargetCentre = { x: 1380, y: 480 };
  const bambooX = left + width * (bambooTargetCentre.x / 1536)
    - width * bambooScale * (bambooSourceCentre.x / 1536 - 0.5);
  const bambooY = top + height * (bambooTargetCentre.y / 1024)
    - height * bambooScale * (bambooSourceCentre.y / 1024 - 0.5);
  bamboo
    .setDisplaySize(width * bambooScale, height * bambooScale)
    .setPosition(bambooX, bambooY)
    .setData('menuBambooHome', { x: bambooX, y: bambooY })
    .setData('menuBambooTransform', {
      scale: bambooScale,
      sourceBounds: bambooSourceBounds,
      targetCentre: bambooTargetCentre,
    });
  // Wind needs parallax inside the grove, not a rigid translation of the full plate. These two
  // cropped copies retain exact registration with the base but let upper culms and leaves lag.
  // The roots remain only in the stable base, so the wind never slides bamboo across the dike.
  const bambooWind = [
    { part: 'upper-culms', crop: { x: 519, y: 533, width: 1017, height: 305 }, alpha: 0.28 },
    { part: 'leaf-canopy', crop: { x: 519, y: 358, width: 1017, height: 311 }, alpha: 0.44 },
  ].map(({ part, crop, alpha }) => {
    const wind = self.add.image(bambooX, bambooY, 'menu-layer-bamboo-v2')
      .setDisplaySize(width * bambooScale, height * bambooScale)
      .setAlpha(alpha)
      .setCrop(crop.x, crop.y, crop.width, crop.height)
      .setData('menuBambooWindPart', part)
      .setData('menuBambooWindHome', { x: bambooX, y: bambooY });
    artwork.add(wind);
    return wind;
  });
  const lotus = layer('menu-layer-lotus-v2', 'lotus', 0.98)
    .setY(centreY + height * LOTUS_SINK)
    .setData('menuLotusSink', LOTUS_SINK);
  const layers = { ground, mountains, mountainMist, waterFx, bamboo, bambooWind, lotus };

  // The illustration carries its own softly stained paper. Feathering that paper back into the
  // scene's điệp sheet avoids a pasted rectangular edge without erasing the pale river and mist
  // inside the composition. This stays above the plate and below every word or control.
  // Inside the illustration's own container, last, so it sits over every plate — and so it
  // scales with them: on the desktop the illustration is fitted to the whole sheet
  // (`fitIllustrationToDesktop`), and a feather left at column size drew the old plate's
  // outline as a pale box over the mountains.
  const edge = Math.max(12, Math.min(22, width * 0.055));
  const feather = self.add.graphics();
  feather.fillGradientStyle(PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, 1, 1, 0, 0);
  feather.fillRect(left - 1, top - 1, width + 2, edge + 1);
  feather.fillGradientStyle(PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, 0, 0, 1, 1);
  feather.fillRect(left - 1, top + height - edge, width + 2, edge + 1);
  feather.fillGradientStyle(PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, 1, 0, 1, 0);
  feather.fillRect(left - 1, top - 1, edge + 1, height + 2);
  feather.fillGradientStyle(PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, PIGMENT.diep, 0, 1, 0, 1);
  feather.fillRect(left + width - edge, top - 1, edge + 1, height + 2);
  artwork.add(feather);

  self.animateDongHoIllustration({ left, top, width, height }, layers);
}
