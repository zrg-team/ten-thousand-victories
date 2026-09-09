import Phaser from 'phaser';
import { calibrateGraphics } from '../game/calibrateGraphics';
import { preloadHeroFaces } from '../ui/FaceRenderer';
import { preloadConquestUiIcons } from '../ui/conquestUiIcons';
import { applyRenderScale } from '../game/graphicsQuality';
import { configuredSupportChannels, supportQrTextureKey } from '../data/support';
import { allowsDonationLinks } from '../platform/shell';
import { preloadConquestMapArt } from '../ui/conquestMapArt';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const baseUrl = import.meta.env.BASE_URL;
    preloadConquestUiIcons(this, baseUrl);
    // Optional authored world art. Every call site retains its procedural draw as a fallback.
    preloadConquestMapArt(this, baseUrl, ['flora', 'terrain', 'settlements', 'markers'], false);

    // The front-page landscape is a registered four-plate illustration. Mountains, bamboo and
    // lotus retain a shared 1536x1024 frame so MenuScene can move them independently without the
    // perspective drift that comes from rebuilding the scene out of map tokens. Ground v5,
    // mountains v2, bamboo v2 and lotus v2 are the Đông Hồ pigment repaint of the same
    // composition — chàm river and shadow, lá xanh foliage, hòe paddies, son petals, on a plain sheet.
    this.load.image('menu-wordmark-dongho-v2', `${baseUrl}art/menu-wordmark-dongho-v2.webp`);
    this.load.image('menu-layer-ground-v6', `${baseUrl}art/menu-layer-ground-v6.webp`);
    this.load.image('menu-layer-mountains-v3', `${baseUrl}art/menu-layer-mountains-v3.png`);
    this.load.image('menu-layer-bamboo-v2', `${baseUrl}art/menu-layer-bamboo-v2.png`);
    this.load.image('menu-layer-lotus-v2', `${baseUrl}art/menu-layer-lotus-v2.png`);
    // Hero portraits are composed from a part library rather than drawn at runtime; every
    // scene that shows a roster needs these in the texture manager before it renders.
    preloadHeroFaces(this);
    // A support channel's QR is fetched here, not when the coffee modal opens, so the modal
    // never shows a hole while a fetch is in flight. Only configured images are requested — an
    // unconfigured build must not 404 on every launch — and none at all where the modal cannot be
    // reached, which in either store's build it cannot: see `allowsDonationLinks`.
    if (allowsDonationLinks()) {
      for (const channel of configuredSupportChannels()) {
        if (channel.qrImage) {
          this.load.image(supportQrTextureKey(channel), `${baseUrl}${channel.qrImage}`);
        }
      }
    }
  }

  create(): void {
    applyRenderScale(this);
    void calibrateGraphics(this).then(() => { if (this.sys.isActive()) this.scene.start('MenuScene'); });
  }
}
