import Phaser from 'phaser';

export const DONG_HO_WORDMARK_KEY = 'menu-wordmark-dongho-v2';

/** Contemporary Quốc ngữ brush lettering; provenance in docs/design/dongho-wordmark-v2. */
export function dongHoWordmark(scene: Phaser.Scene, x: number, y: number, width: number): Phaser.GameObjects.Image {
  const title = scene.add.image(x, y, DONG_HO_WORDMARK_KEY);
  // Multiply prints the white-ground master onto the existing paper without a rectangular
  // backing, including through the counters and the dry brush edges.
  return title.setDisplaySize(width, width * title.height / title.width)
    .setBlendMode(Phaser.BlendModes.MULTIPLY)
    .setData('menuHeading', true)
    .setData('headingText', 'VẠN THẮNG');
}
