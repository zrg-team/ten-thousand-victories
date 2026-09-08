/** Composite the existing water art through a river-shaped mask, preserving its live tweens. */
import Phaser from 'phaser';
import { getGraphicsQuality } from '../../game/graphicsQuality';
import { isDesktopSheet } from '../../game/constants';
import type { MenuScene } from '../MenuScene';

type Bounds = { left: number; top: number; width: number; height: number };
type Layers = {
  ground: Phaser.GameObjects.Image;
  mountains: Phaser.GameObjects.Image;
  waterFx: Phaser.GameObjects.Container;
  bamboo: Phaser.GameObjects.Image;
  lotus: Phaser.GameObjects.Image;
};
const canvas = (width: number, height: number): HTMLCanvasElement => {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
};

export function createRiverSurface(self: MenuScene, bounds: Bounds, layers: Layers) {
  const { left, top, width, height } = bounds;
  const source = layers.ground.texture.getSourceImage() as HTMLImageElement;
  const plate = canvas(source.width, source.height);
  const plateContext = plate.getContext('2d', { willReadFrequently: true })!;
  plateContext.drawImage(source, 0, 0);
  const pixels = plateContext.getImageData(0, 0, source.width, source.height).data;
  const blue = (x: number, y: number): boolean => {
    const i = (y * source.width + x) * 4;
    return pixels[i + 3] > 180 && pixels[i + 2] - pixels[i] > 18 && pixels[i + 2] - pixels[i + 1] > 5;
  };
  // Preserve the cream engraved lines inside the blue channel; inset both ink shorelines.
  const banks = Array.from({ length: source.height }, (_, y) => {
    let min = source.width, max = -1;
    for (let x = 2; x < source.width - 2; x += 1) {
      if (blue(x - 1, y) && blue(x, y) && blue(x + 1, y)) { min = Math.min(min, x); max = x; }
    }
    return { left: min + 4, right: max - 4 };
  });
  const firstRow = banks.findIndex(bank => bank.right > bank.left);
  const cropTop = Math.max(0, firstRow - 2);
  const low = getGraphicsQuality() === 'low';
  const resolution = low ? 512 : isDesktopSheet() ? 1024 : 768;
  const ratio = resolution / source.width;
  const surfaceHeight = Math.ceil((source.height - cropTop) * ratio);
  plateContext.clearRect(0, 0, source.width, source.height);
  plateContext.fillStyle = '#fff';
  banks.forEach((bank, y) => {
    if (bank.right > bank.left) plateContext.fillRect(bank.left, y, bank.right - bank.left, 1);
  });
  const bankMask = canvas(resolution, surfaceHeight);
  bankMask.getContext('2d')!.drawImage(plate, 0, cropTop, source.width, surfaceHeight / ratio,
    0, 0, resolution, surfaceHeight);
  const mask = canvas(resolution, surfaceHeight);
  const maskContext = mask.getContext('2d', { willReadFrequently: true })!;
  const scale = resolution / width;
  const artwork = layers.waterFx.parentContainer!;

  // The original Graphics and their tween/interaction state stay alive. Only their final
  // compositing changes: all water marks are painted into one surface, then clipped together.
  const effects = self.add.container(0, 0).setVisible(false).setData('menuWaterEffects', 'original-live-effects');
  layers.waterFx.add(effects);
  const key = 'menu-water-' + Phaser.Utils.String.UUID();
  const texture = self.textures.createCanvas(key, resolution, surfaceHeight)!;
  const context = texture.context;
  const surface = self.add.image(left, top + height * cropTop / source.height, key).setOrigin(0)
    .setDisplaySize(width, height * surfaceHeight / ratio / source.height)
    .setData('menuWaterSurface', 'refracted-painted-river')
    .setData('menuWaterMask', mask)
    .setData('menuWaterCropTop', cropTop)
    .setData('menuWaterSourceSize', { width: source.width, height: source.height })
    .setData('menuWaterResolution', resolution);
  layers.waterFx.add(surface);
  layers.waterFx.setData('menuWaterCoverage', 'painted-river-mask');

  // Use Phaser's own Canvas Graphics renderer, the same path as generateTexture, so existing
  // engraved wakes/ellipses/strokes keep their exact drawing commands and animated transforms.
  const camera = new Phaser.Cameras.Scene2D.Camera(0, 0, resolution, surfaceHeight);
  camera.setScene(self);
  camera.matrixCombined.applyITRS(-left * scale, -top * scale - cropTop * ratio, 0, scale, scale);
  const renderer = { blendModes: ['source-over'], antialias: true } as unknown as Phaser.Renderer.Canvas.CanvasRenderer;
  let elapsed = 0, pending = 0, frame = 0;
  const updateMask = (): void => {
    maskContext.globalCompositeOperation = 'source-over';
    maskContext.clearRect(0, 0, resolution, surfaceHeight);
    maskContext.drawImage(bankMask, 0, 0);
    maskContext.globalCompositeOperation = 'destination-out';
    // These plates still sway. Re-evaluate their actual transforms, never a frozen exclusion.
    for (const layer of [layers.mountains, layers.lotus, layers.bamboo]) {
      maskContext.save();
      maskContext.setTransform(scale, 0, 0, scale, -left * scale, -top * scale - cropTop * ratio);
      layer.getLocalTransformMatrix().copyToContext(maskContext);
      const image = layer.texture.getSourceImage() as HTMLImageElement;
      maskContext.drawImage(image, -image.width * layer.originX, -image.height * layer.originY);
      maskContext.restore();
    }
    maskContext.globalCompositeOperation = 'source-over';
  };
  const draw = (): void => {
    const seconds = elapsed / 1000;
    context.globalAlpha = 1;
    context.clearRect(0, 0, resolution, surfaceHeight);
    context.save();
    context.scale(ratio, ratio);
    context.translate(0, -cropTop);
    const strip = low ? 4 : 2;
    for (let y = cropTop; y < source.height; y += strip) {
      const depth = Math.max(0, (y - firstRow) / (source.height - firstRow));
      const dx = (Math.sin(y * 0.075 - seconds * 1.35) + Math.sin(y * 0.031 + seconds * 0.82) * 0.48)
        * (0.55 + depth * 2.5);
      context.drawImage(source, 0, y, source.width, Math.min(strip, source.height - y),
        dx, y, source.width, Math.min(strip, source.height - y));
    }
    context.restore();
    camera.renderList.length = 0;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    for (const child of effects.list) {
      const graphic = child as Phaser.GameObjects.Graphics & {
        renderCanvas: (renderer: Phaser.Renderer.Canvas.CanvasRenderer, source: Phaser.GameObjects.Graphics,
          camera: Phaser.Cameras.Scene2D.Camera, parent: null, context: CanvasRenderingContext2D, clip: boolean) => void;
      };
      context.filter = graphic.getData('menuWaterTreatment') === 'soft-paper-glaze' ? 'blur(' + scale * 2 + 'px)' : 'none';
      if (graphic.visible && graphic.alpha > 0) graphic.renderCanvas(renderer, graphic, camera, null, context, false);
    }
    context.filter = 'none';
    context.globalAlpha = 1;
    updateMask();
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(mask, 0, 0);
    context.globalCompositeOperation = 'source-over';
    texture.refresh();
    surface.setData('menuWaterFrame', ++frame)
      .setData('menuWaterRipples', effects.list.filter(o => o.getData('menuRipple') || o.getData('menuWaterWake')).length);
  };
  const update = (_time: number, delta: number): void => {
    if (!artwork.visible || !layers.waterFx.visible) return;
    elapsed += Math.min(delta, 100);
    pending += Math.min(delta, 100);
    if (pending < 1000 / (low ? 20 : 30)) return;
    pending %= 1000 / (low ? 20 : 30);
    draw();
  };
  updateMask();
  self.events.on(Phaser.Scenes.Events.UPDATE, update);
  surface.once(Phaser.GameObjects.Events.DESTROY, () => {
    self.events.off(Phaser.Scenes.Events.UPDATE, update);
    camera.destroy();
    self.textures.remove(key);
  });
  return {
    effects,
    surface,
    draw,
    banksAt: (y: number) => banks[Phaser.Math.Clamp(Math.round((y - top) / height * source.height), 0, source.height - 1)],
    contains: (x: number, y: number): boolean => {
      const mx = Math.floor((x - left) * scale);
      const my = Math.floor((y - top) * scale - cropTop * ratio);
      return mx >= 0 && mx < resolution && my >= 0 && my < surfaceHeight
        && maskContext.getImageData(mx, my, 1, 1).data[3] > 240;
    },
  };
}
