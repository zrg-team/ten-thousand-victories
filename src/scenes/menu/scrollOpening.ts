import Phaser from 'phaser';
import { reducedMotion } from '../../game/lifeSettings';
import { swallowRestOfPress } from '../../ui/inputGeneration';
import { royalScrollRoll } from '../../ui/ink/royalScroll';
import type { MenuScene } from '../MenuScene';

const MENU_SCROLL_OPEN_MS = 860;

// A launch gesture: returning from Settings, changing language, resizing or restarting the
// scene must not roll the player's controls away again. A page reload starts a new launch.
let openedThisLaunch = false;

type Revealable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Alpha &
  Phaser.GameObjects.Components.Visible & { y: number; getBounds?(): Phaser.Geom.Rectangle };

export function openMainScroll(self: MenuScene): void {
  if (self.mode !== 'main' || openedThisLaunch) return;
  const panel = self.content.find((item) => item.getData('desktopMenuPanel')) as Phaser.GameObjects.Image | undefined;
  if (!panel) return;
  openedThisLaunch = true;
  if (reducedMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const { width, height } = panel.getData('desktopMenuPanel') as { width: number; height: number };
  const bounds = panel.getBounds();
  const topPad = panel.y - bounds.top;
  const textureScale = panel.height / panel.displayHeight;
  const rows = self.content.filter((item): item is Revealable => item !== panel &&
    'y' in item && 'setAlpha' in item && 'setVisible' in item).map((item) => ({
      item, alpha: item.alpha, visible: item.visible,
      // Graphics-only containers (the language flags) report an empty bounds rectangle.
      bottom: Math.max(item.y, item.getBounds?.().bottom ?? item.y),
    }));
  const roll = royalScrollRoll(self, panel.x, panel.y + 20, width).setDepth(5)
    .setData('menuScrollRoll', true);
  const blocker = self.add.rectangle(panel.x + width / 2, panel.y + height / 2,
    width + 40, height + 32, 0, 0).setDepth(6).setInteractive()
    .setData('menuScrollSkip', true);
  const progress = { height: 20 };
  let tween: Phaser.Tweens.Tween | undefined;
  let finished = false;

  const draw = () => {
    // Crop the cached paper in texture pixels; no stretched lettering, masks, or live paper
    // geometry. Whole rows fade in only after the moving roll has passed their lower edge.
    panel.setCrop(0, 0, panel.width, Math.ceil((topPad + progress.height) * textureScale));
    panel.setData('scrollOpening', progress.height / height);
    roll.y = panel.y + progress.height;
    for (const row of rows) {
      const alpha = Phaser.Math.Clamp((roll.y - row.bottom) / 18, 0, 1);
      row.item.setVisible(row.visible && alpha > 0).setAlpha(row.alpha * alpha);
    }
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    tween?.remove();
    if (panel.scene) panel.setCrop().setData('scrollOpening', 1);
    for (const row of rows) {
      if (row.item.scene) row.item.setVisible(row.visible).setAlpha(row.alpha);
    }
    roll.destroy();
    blocker.destroy();
    self.events.off(Phaser.Scenes.Events.SHUTDOWN, finish);
    const afterOpen = self.menuOpening?.afterOpen;
    self.menuOpening = undefined;
    // Defer one scene tick so a redraw can finish rebuilding before a first-run tour opens.
    if (afterOpen && self.scene.isActive()) self.time.delayedCall(0, afterOpen);
  };
  blocker.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number,
    event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    swallowRestOfPress(self);
    finish();
  });
  self.menuOpening = { finish };
  self.events.once(Phaser.Scenes.Events.SHUTDOWN, finish);
  draw();
  tween = self.tweens.add({
    targets: progress, height, delay: 140, duration: MENU_SCROLL_OPEN_MS - 140,
    ease: 'Cubic.easeInOut', onUpdate: draw, onComplete: finish,
  });
}
