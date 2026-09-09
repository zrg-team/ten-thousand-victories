import Phaser from 'phaser';
import { INK_UI } from '../InkUI';
import { getDynasty, type DynastyBanner } from '../../state/dynasty';
import { ROYAL_HOUSES } from '../faces/kingLook';
import { BANNER_EMBLEM_SIZE, drawBannerEmblem } from './bannerEmblems';
import { renderScaleNow } from '../../game/graphicsQuality';
import { registerGpuBake } from '../../game/gpuBakes';

/** The same designed motif pressed as a square seal on the menu's royal document. */
export function drawHouseSeal(scene: Phaser.Scene, sign: DynastyBanner, size: number): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setRotation(-0.06)
    .setData('houseSeal', { ...sign, size }).setSize(size, size);
  const half = size / 2;
  const g = scene.add.graphics().fillStyle(sign.field, 0.95).fillRect(-half, -half, size, size);
  g.lineStyle(0.8, sign.trim, 0.75).strokeRect(-half + 1.5, -half + 1.5, size - 3, size - 3);
  root.add(g);
  root.add(drawBannerEmblem(scene, sign.emblem, sign.trim,
    luma(sign.trim) > 140 ? INK_UI.brush : 0xf3e6c4, sign.field)
    .setScale(size * 0.75 / BANNER_EMBLEM_SIZE));
  return root;
}

/** The same dynasty sign mounted on a ceremonial flag. */
export function drawHouseBanner(
  scene: Phaser.Scene,
  banner: DynastyBanner,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  const g = scene.add.graphics();
  // Square cloth, layered bands and flame-shaped fringe draw on Vietnamese ceremonial flags.
  // This two-colour game standard is not a reconstruction of a dynasty's historical flag.
  const unit = Math.min(width / 100, height / 116);
  const side = 80 * unit;
  const x = (width - 94 * unit) / 2 + 9 * unit;
  const y = 14 * unit;
  const path = (points: number[][], colour: number, weight = 1.2): void => {
    const vertices = points.map(([px, py]) => ({ x: px, y: py }));
    g.fillStyle(colour).fillPoints(vertices, true);
    g.lineStyle(weight * unit, INK_UI.brush).strokePoints(vertices, true);
  };
  const pole = x - 4 * unit;
  g.lineStyle(3.8 * unit, INK_UI.brush).lineBetween(pole, 7 * unit, pole, height - unit);
  g.lineStyle(1.2 * unit, 0xc49a57).lineBetween(pole - 0.6 * unit, 9 * unit, pole - 0.6 * unit, height - 2 * unit);
  path([[pole, unit], [pole + 3 * unit, 7 * unit], [pole, 10 * unit], [pole - 3 * unit, 7 * unit]], 0xd8b45a);
  const teeth = width >= 70 ? 8 : 5;
  for (let i = 0; i < teeth; i += 1) {
    const a = side * i / teeth;
    const b = side * (i + 1) / teeth;
    const mid = (a + b) / 2;
    path([[x + a, y], [x + mid - unit, y - 5 * unit], [x + b, y]], banner.trim, 0.8);
    path([[x + side, y + a], [x + side + 6 * unit, y + mid - unit], [x + side, y + b]], banner.trim, 0.8);
    path([[x + a, y + side], [x + mid + unit, y + side + 6 * unit], [x + b, y + side]], banner.trim, 0.8);
  }
  g.fillStyle(banner.trim).fillRect(x, y, side, side);
  g.lineStyle(1.6 * unit, INK_UI.brush).strokeRect(x, y, side, side);
  const edge = luma(banner.trim) > 140 ? INK_UI.brush : 0xf3e6c4;
  g.lineStyle(1.1 * unit, edge, 0.9).strokeRect(x + 3 * unit, y + 3 * unit, side - 6 * unit, side - 6 * unit);
  g.fillStyle(banner.field).fillRect(x + 7 * unit, y + 7 * unit, side - 14 * unit, side - 14 * unit);
  g.lineStyle(1.1 * unit, edge).strokeRect(x + 7 * unit, y + 7 * unit, side - 14 * unit, side - 14 * unit);
  const markColour = banner.trim;
  // Sparse woven ticks; omit at the smallest dynasty-chip sizes.
  if (width >= 70) {
    g.lineStyle(0.65 * unit, markColour, 0.22);
    for (let i = 0; i < 7; i += 1) {
      const iy = y + (14 + i * 9) * unit;
      g.lineBetween(x + 10 * unit, iy, x + 14 * unit, iy + unit);
      g.lineBetween(x + side - 14 * unit, iy, x + side - 10 * unit, iy + unit);
    }
  }
  g.lineStyle(1.5 * unit, 0xd8b45a).lineBetween(pole - unit, y + 7 * unit, x + unit, y + 7 * unit);
  g.lineBetween(pole - unit, y + side - 7 * unit, x + unit, y + side - 7 * unit);
  root.add(g);
  const emblem = drawBannerEmblem(scene, banner.emblem, markColour,
    luma(markColour) > 140 ? INK_UI.brush : 0xf3e6c4, banner.field);
  emblem.setPosition(x + side / 2, y + side / 2);
  emblem.setScale(side * 0.66 / BANNER_EMBLEM_SIZE);
  root.add(emblem);
  root.setData('houseBanner', { ...banner, width, height });
  return root;
}

/**
 * The same flag, drawn once into a texture and then placed as an image.
 *
 * `drawHouseBanner` is about 780 Graphics commands — cloth, fringe teeth, weave ticks, the nested
 * squares and the emblem's own paths — and Phaser 4 replays a live `Graphics` object's whole
 * command list every frame. The standard is not one object on the Conquest map either: every
 * player province flies it, every marching host carries it, and the inheritance chip holds one in
 * the corner of the HUD. Measured on a settled Ascent map at Balanced (2026-09-09), the banner's
 * instances were 4,617 of the 12,960 Graphics commands the map tessellated per frame — 36% of the
 * whole per-frame ink cost — for a drawing that cannot change during a run: the sign is chosen on
 * the menu, between reigns.
 *
 * So it is baked. One texture per design and size (the physical key carries the render scale, so a
 * quality change re-bakes at the new resolution), shared by every instance in every scene, and
 * repainted after a context restore — a `DynamicTexture` comes back empty from one, and an
 * unregistered bake is a blank flag on every province after the phone wakes up.
 *
 * The image is wrapped in a container that carries the same `houseBanner` data as the vector
 * version, so every surface audit still finds the saved identity where it expects it, and so a
 * caller that scales or tweens the standard moves the container rather than the image — a stamped
 * image's rest scale is `1/raster`, and anything that wrote a literal `1` onto it would blow the
 * flag up to raster size.
 */
export function stampHouseBanner(
  scene: Phaser.Scene,
  banner: DynastyBanner,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setData('houseBanner', { ...banner, width, height });
  // The fringe teeth and the mast's finial reach a little past the box the flag is measured by.
  const pad = 4;
  const raster = Math.max(1, Math.min(3, Math.ceil(renderScaleNow())));
  const key = `house-banner:${banner.field.toString(16)}:${banner.trim.toString(16)}:${banner.emblem}`
    + `:${Math.round(width)}x${Math.round(height)}@${raster}`;
  const paint = (host: Phaser.Scene): void => {
    const texture = host.textures.get(key) as unknown as Phaser.Textures.DynamicTexture | undefined;
    if (!texture || typeof (texture as { draw?: unknown }).draw !== 'function') return;
    // Built, drawn and destroyed inside this one synchronous call, so it never reaches a frame.
    const vector = drawHouseBanner(host, banner, width, height)
      .setPosition(pad * raster, pad * raster)
      .setScale(raster);
    texture.clear();
    texture.draw(vector);
    texture.render();
    vector.destroy();
  };
  if (!scene.textures.exists(key)) {
    scene.textures.addDynamicTexture(key,
      Math.ceil((width + pad * 2) * raster), Math.ceil((height + pad * 2) * raster));
    paint(scene);
    registerGpuBake(scene.game, key, () => {
      // The scene that baked it may be long gone; any live scene can repaint the shared texture.
      let host: Phaser.Scene | undefined;
      try { host = scene.sys?.isActive() ? scene : undefined; } catch { host = undefined; }
      host ??= scene.game.scene.getScenes(true)[0];
      if (host) paint(host);
    });
  }
  root.add(scene.add.image(-pad, -pad, key).setOrigin(0, 0).setScale(1 / raster));
  return root;
}

/** A standalone identity seal, using the exact same device and colours as the flag. */
export function drawHouseSign(
  scene: Phaser.Scene, sign: DynastyBanner, width: number, height: number,
): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setData('houseSign', { ...sign, width, height });
  const radius = Math.min(width, height) * 0.46;
  const x = width / 2, y = height / 2;
  const g = scene.add.graphics();
  g.fillStyle(sign.field).fillCircle(x, y, radius);
  g.lineStyle(Math.max(1, radius * 0.05), sign.trim).strokeCircle(x, y, radius);
  g.lineStyle(Math.max(0.6, radius * 0.02), luma(sign.field) > 140 ? INK_UI.brush : 0xf3e6c4, 0.65)
    .strokeCircle(x, y, radius * 0.91);
  root.add(g);
  const colour = sign.trim;
  root.add(drawBannerEmblem(scene, sign.emblem, colour,
    luma(colour) > 140 ? INK_UI.brush : 0xf3e6c4, sign.field)
    .setPosition(x, y).setScale(radius * 1.5 / BANNER_EMBLEM_SIZE));
  return root;
}

/** Keep the player's colours exact; contrast comes from the seam and the motif's ink. */
function luma(colour: number): number {
  return 0.299 * ((colour >> 16) & 255) + 0.587 * ((colour >> 8) & 255) + 0.114 * (colour & 255);
}

/**
 * The house's banner, or the one its họ opens on.
 *
 * A house crowned before the banner step existed — or one whose founder is still the run's
 * champion rather than a made king — has no stored mark, and a sheet with a hole in it where the
 * other sheets have a banner is worse than a default. The fallback is the dynasty's own
 * game-assigned field, which is what the banner step itself opens on.
 */
export function houseBanner(): DynastyBanner {
  const founder = getDynasty().founder;
  if (founder?.banner) return founder.banner;
  const house = getDynasty().house;
  const royal = ROYAL_HOUSES.find((entry) => entry.surname === house);
  return { field: royal?.field ?? 0xaa3a2c, trim: 0xd8b45a, emblem: 'crown' };
}
