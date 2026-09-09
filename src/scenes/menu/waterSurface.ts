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
type CanvasGraphics = Phaser.GameObjects.Graphics & {
  renderCanvas: (renderer: Phaser.Renderer.Canvas.CanvasRenderer, source: Phaser.GameObjects.Graphics,
    camera: Phaser.Cameras.Scene2D.Camera, parent: null, context: CanvasRenderingContext2D, clip: boolean) => void;
};
const canvas = (width: number, height: number): HTMLCanvasElement => {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
};

/**
 * How often the surface is re-drawn, and the valve that lowers it.
 *
 * Every draw is Canvas 2D work on the main thread followed by a texture upload, and the whole
 * thing is the one place this game paints pixels on the CPU every frame. Measured per draw on a
 * desktop (Chromium, real GPU): 2.2 ms, of which the upload is 0.7 and the 280 strip blits 0.65;
 * at 4x CPU throttle 5.0 ms. A phone's canvas path is the software one (`willReadFrequently`,
 * which Phaser sets on every canvas texture), so its cost is what the throttled number says or
 * worse, and 30 of those a second is a fifth of every frame before the game has drawn anything.
 * When a draw averages more than `COSTLY_MS` the cadence steps down towards the rate the low tier
 * already ships at, and steps back up once the draws have been cheap for a while — so a device
 * that can afford the full rate keeps it, and one that cannot loses a little smoothness in the
 * ripples instead of frames everywhere else.
 */
const FULL_HZ = 30;
const LOW_TIER_HZ = 20;
const COSTLY_MS = 3.5;
const CHEAP_MS = 1.5;
const CALM_BEFORE_STEP_UP_MS = 4000;

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
  let hz = low ? LOW_TIER_HZ : FULL_HZ, costAverage = 0, draws = 0, calmSince = 0;
  surface.setData('menuWaterCadence', hz);

  // The plates that carve the water out sway by a pixel or two over many seconds, so the mask
  // they carve is re-cut only when one of them has moved half a mask pixel — a few times a second
  // at most, against once per draw before, when three full plates were blitted for every frame.
  const plateMatrix = new Phaser.GameObjects.Components.TransformMatrix();
  let maskPose = '';
  const platePose = (): string => {
    let pose = '';
    for (const layer of [layers.mountains, layers.lotus, layers.bamboo]) {
      const m = layer.getLocalTransformMatrix(plateMatrix);
      pose += `${Math.round(m.tx * scale * 2)}:${Math.round(m.ty * scale * 2)}:${m.a.toFixed(3)}:${m.b.toFixed(3)}:${m.c.toFixed(3)}:${m.d.toFixed(3)}|`;
    }
    return pose;
  };
  const updateMask = (): void => {
    const pose = platePose();
    if (pose === maskPose) return;
    maskPose = pose;
    maskContext.globalCompositeOperation = 'source-over';
    maskContext.clearRect(0, 0, resolution, surfaceHeight);
    maskContext.drawImage(bankMask, 0, 0);
    maskContext.globalCompositeOperation = 'destination-out';
    // These plates still sway. Re-evaluate their actual transforms, never a frozen exclusion.
    for (const layer of [layers.mountains, layers.lotus, layers.bamboo]) {
      maskContext.save();
      maskContext.setTransform(scale, 0, 0, scale, -left * scale, -top * scale - cropTop * ratio);
      layer.getLocalTransformMatrix(plateMatrix).copyToContext(maskContext);
      const image = layer.texture.getSourceImage() as HTMLImageElement;
      maskContext.drawImage(image, -image.width * layer.originX, -image.height * layer.originY);
      maskContext.restore();
    }
    maskContext.globalCompositeOperation = 'source-over';
  };

  // The glaze is the one mark drawn through a blur, and it never moves: its strokes are laid once
  // (`riverVeil`, in water.ts) and only its alpha could change. Blurring six wide strokes on every
  // draw was the whole of the filter cost; they are rendered once into a sheet of their own and
  // that sheet is blitted, which is pixel-identical because the filter never saw anything else.
  let veil: HTMLCanvasElement | undefined;
  let veilKey = '';
  const drawVeil = (graphic: CanvasGraphics): void => {
    const state = `${graphic.commandBuffer.length}:${graphic.alpha}:${graphic.scaleX}:${graphic.scaleY}:${graphic.x}:${graphic.y}`;
    if (!veil || state !== veilKey) {
      veil ??= canvas(resolution, surfaceHeight);
      const glaze = veil.getContext('2d')!;
      glaze.clearRect(0, 0, resolution, surfaceHeight);
      glaze.lineJoin = 'round';
      glaze.lineCap = 'round';
      glaze.filter = 'blur(' + scale * 2 + 'px)';
      camera.renderList.length = 0;
      graphic.renderCanvas(renderer, graphic, camera, null, glaze, false);
      glaze.filter = 'none';
      veilKey = state;
    }
    context.drawImage(veil, 0, 0);
  };

  // The canvas is re-specified into its texture by `CanvasTexture.refresh` — a full `texImage2D`,
  // which allocates texture storage anew every time. After the first upload the storage exists and
  // is the right size, so the pixels go in with `texSubImage2D` instead: the same bytes, no
  // reallocation, which is the difference mobile drivers charge for. Falls back to the full refresh
  // whenever the texture is not simply there (Canvas renderer, a context still being restored).
  let uploaded = false;
  const upload = (): void => {
    const gl = (self.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
    const glTexture = texture.source[0]?.glTexture as (Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper
      & { webGLTexture?: WebGLTexture | null; flipY: boolean; pma: boolean }) | null | undefined;
    const renderer3d = self.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer & {
      glTextureUnits?: { bind(texture: unknown, unit: number): void };
      glWrapper?: { updateTexturing(state: { texturing: { flipY: boolean; premultiplyAlpha: boolean } }): void };
    };
    if (!gl || !glTexture?.webGLTexture || !uploaded || !renderer3d.glTextureUnits || !renderer3d.glWrapper
      || glTexture.width !== texture.canvas.width || glTexture.height !== texture.canvas.height) {
      texture.refresh();
      uploaded = !!gl && !!glTexture?.webGLTexture;
      return;
    }
    try {
      renderer3d.glTextureUnits.bind(glTexture, 0);
      renderer3d.glWrapper.updateTexturing({ texturing: { flipY: glTexture.flipY, premultiplyAlpha: glTexture.pma } });
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, texture.canvas);
    } catch {
      texture.refresh();
    }
  };

  const draw = (): void => {
    const started = performance.now();
    const seconds = elapsed / 1000;
    context.globalAlpha = 1;
    context.clearRect(0, 0, resolution, surfaceHeight);
    context.save();
    context.scale(ratio, ratio);
    context.translate(0, -cropTop);
    // Four source rows a strip: two rows of the surface at the phone's ratio. The displacement's
    // shortest period is 84 source rows, so a strip carries under 0.5 surface pixels of shear
    // between its top and bottom, below what the blit can show — and it is half the blits.
    const strip = 4;
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
      const graphic = child as CanvasGraphics;
      if (!graphic.visible || graphic.alpha <= 0) continue;
      if (graphic.getData('menuWaterTreatment') === 'soft-paper-glaze') drawVeil(graphic);
      else graphic.renderCanvas(renderer, graphic, camera, null, context, false);
    }
    context.globalAlpha = 1;
    updateMask();
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(mask, 0, 0);
    context.globalCompositeOperation = 'source-over';
    upload();
    surface.setData('menuWaterFrame', ++frame)
      .setData('menuWaterRipples', effects.list.filter(o => o.getData('menuRipple') || o.getData('menuWaterWake')).length);

    // The valve. Ten draws settle the average before it is trusted either way.
    const cost = performance.now() - started;
    costAverage = draws === 0 ? cost : costAverage * 0.8 + cost * 0.2;
    draws += 1;
    if (draws < 10) return;
    const floor = LOW_TIER_HZ, ceiling = low ? LOW_TIER_HZ : FULL_HZ;
    if (costAverage > COSTLY_MS && hz > floor) {
      hz = hz > 24 ? 24 : floor; draws = 0; calmSince = elapsed;
      surface.setData('menuWaterCadence', hz).setData('menuWaterDrawMs', +costAverage.toFixed(2));
    } else if (costAverage < CHEAP_MS && hz < ceiling && elapsed - calmSince > CALM_BEFORE_STEP_UP_MS) {
      hz = hz < 24 ? 24 : ceiling; draws = 0; calmSince = elapsed;
      surface.setData('menuWaterCadence', hz).setData('menuWaterDrawMs', +costAverage.toFixed(2));
    } else if (costAverage > CHEAP_MS) {
      calmSince = elapsed;
    }
  };
  const update = (_time: number, delta: number): void => {
    if (!artwork.visible || !layers.waterFx.visible) return;
    elapsed += Math.min(delta, 100);
    pending += Math.min(delta, 100);
    const interval = 1000 / hz;
    if (pending < interval) return;
    pending %= interval;
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
