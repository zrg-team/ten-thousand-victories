import type { ConquestUIScene } from '../../ConquestUIScene';
import { drawMountainMist } from '../../../ui/ink/mountainMist';
import { RectClip } from '../../../ui/ink/clipRect';
import { hudSheetWidth } from '../../../game/cameraLayout';

/** Live menu-style cloud banks above the baked mountains and below camps and hosts. */
export function buildBattleClouds(self: ConquestUIScene): void {
  const ui = self.battleUi;
  if (!ui) return;
  const width = hudSheetWidth();
  const horizon = ui.content.y + ui.fieldHeight * 0.30 + 8;
  const layer = self.add.container(0, 0).setData('battleAmbient', 'mountain-clouds');
  ui.field.add(layer);
  const clip = new RectClip(self, {
    x: 0, y: ui.content.y, width, height: ui.fieldHeight,
  });
  clip.begin(layer);
  for (let index = 0; index < 5; index += 1) {
    const mist = self.add.graphics().setData('battleAmbient', 'mountain-mist');
    const span = width * (0.26 + (index % 2) * 0.045);
    const bandHeight = Math.max(9, ui.fieldHeight * (0.046 + (index % 3) * 0.006));
    drawMountainMist(mist, span, bandHeight, index);
    layer.add(mist);
    clip.apply(mist);
    const x = width * (0.12 + index * 0.19);
    const y = horizon - bandHeight * (index % 2 === 0 ? 0.8 : 0.25);
    mist.setPosition(x, y).setAlpha(0.72);
    self.tweens.add({
      targets: mist,
      x: x + (index % 2 === 0 ? 1 : -1) * width * (0.045 + (index % 2) * 0.012),
      y: y + (index % 2 === 0 ? -1.6 : 1.4),
      alpha: { from: 0.58, to: 0.9 },
      scaleX: { from: 0.92, to: 1.1 },
      duration: 6_600 + index * 780,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  clip.end(layer);
  // Field teardown kills nested tweens before destroying this layer and its clip.
  layer.once('destroy', () => clip.destroy());
}
