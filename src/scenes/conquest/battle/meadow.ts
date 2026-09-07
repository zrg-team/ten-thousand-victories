import Phaser from 'phaser';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { PIGMENT } from '../../../ui/ink/palette';
import { mulberry32 } from '../../../ui/ink/stroke';
import { battleScaleAt } from './geometry';
import { hudSheetWidth } from '../../../game/cameraLayout';

/** Tiny meadow life, with a readable wing edge and irregular flights between resting spots. */
export function buildBattleInsects(self: ConquestUIScene, seed: number): void {
  const ui = self.battleUi;
  if (!ui) return;
  const rand = mulberry32(seed + 731);
  const width = hudSheetWidth();
  const layer = self.add.container(0, 0).setData('battleAmbient', 'meadow-insects');
  ui.field.add(layer);
  const spots = [[0.18, 0.68], [0.72, 0.80], [0.38, 0.90], [0.86, 0.63],
    [0.26, 0.55], [0.62, 0.72], [0.50, 0.86]];
  spots.forEach(([across, down], index) => {
    const butterfly = index < 4;
    const homeX = width * across;
    const homeY = ui.content.y + ui.fieldHeight * down;
    // Keep a small screen-space floor: subpixel pale wings disappeared against paper.
    // These remain a fraction of a soldier, with nearer insects slightly larger.
    const scale = butterfly ? Phaser.Math.Clamp(battleScaleAt(self, homeY), 1.65, 2.2)
      : Phaser.Math.Clamp(battleScaleAt(self, homeY), 1.4, 2.2);
    const insect = self.add.container(homeX, homeY).setScale(scale).setAlpha(0.92)
      .setData('battleInsect', butterfly ? 'butterfly' : 'gnat')
      .setData('battleInsectSpan', (butterfly ? 1.3 : 0.42) * scale);
    layer.add(insect);
    let flap: Phaser.Tweens.Tween | undefined;
    if (butterfly) {
      const wings = self.add.graphics();
      // Dark outer wings preserve the silhouette when the coloured centre is only a pixel.
      for (const side of [-1, 1]) {
        wings.fillStyle(PIGMENT.mucSoft, 0.9);
        wings.fillEllipse(side * 0.35, -0.13, 0.6, 0.72);
        wings.fillEllipse(side * 0.27, 0.25, 0.46, 0.43);
        wings.fillStyle(index % 2 === 0 ? PIGMENT.hoePale : PIGMENT.chamPale, 1);
        wings.fillEllipse(side * 0.35, -0.13, 0.4, 0.51);
        wings.fillEllipse(side * 0.27, 0.25, 0.27, 0.26);
      }
      insect.add(wings);
      flap = self.tweens.add({ targets: wings, scaleX: { from: 0.22, to: 1 },
        duration: 95 + index * 19, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const body = self.add.graphics();
    body.fillStyle(PIGMENT.mucSoft, 0.95);
    body.fillEllipse(0, 0, butterfly ? 0.16 : 0.42, butterfly ? 0.7 : 0.24);
    insect.add(body);
    const fly = (delay: number): void => {
      if (!insect.active) return;
      const fromY = insect.y;
      const toX = Phaser.Math.Clamp(homeX + (rand() - 0.5) * 44, 12, width - 12);
      const toY = Phaser.Math.Clamp(homeY + (rand() - 0.5) * 17,
        ui.content.y + ui.fieldHeight * 0.45 + 8, ui.content.y + ui.fieldHeight - 12);
      const lift = butterfly ? 3 + rand() * 5 : 1 + rand() * 2;
      insect.setData('battleInsectMotion', 'resting');
      flap?.pause();
      self.tweens.add({
        targets: insect, x: toX, duration: butterfly ? 1800 + rand() * 2100 : 850 + rand() * 1300,
        delay, ease: 'Sine.easeInOut',
        onStart: () => { insect.setData('battleInsectMotion', 'flying'); flap?.resume(); },
        onUpdate: tween => {
          const t = tween.progress;
          insect.y = Phaser.Math.Linear(fromY, toY, t) - Math.sin(t * Math.PI) * lift
            + Math.sin(t * Math.PI * 4) * Math.sin(t * Math.PI) * (butterfly ? 0.8 : 0.4);
          insect.rotation = Math.sin(t * Math.PI * 2) * 0.22;
        },
        onComplete: () => {
          insect.setPosition(toX, toY).setRotation(0);
          fly(butterfly ? 700 + rand() * 1700 : 200 + rand() * 650);
        },
      });
    };
    fly(index * 180);
  });
  // The field's recursive teardown kills flight and flap tweens, including resting delays.
}
