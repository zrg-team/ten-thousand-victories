/**
 * The modal layer every sheet on this page is adopted into: the rise, the adoption, the close,
 * and the tap-outside / swipe-down dismiss.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../game/constants';
import { type UIBounds } from '../../ui/InkUI';
import { designLength } from '../../game/graphicsQuality';
import { motionMs } from '../../game/lifeSettings';
import {
  bumpInputGeneration,
  liftForInput,
  quietUntilNextFrame,
  swallowRestOfPress,
} from '../../ui/inputGeneration';
import type { MenuScene } from '../MenuScene';

/**
 * The slide every sheet on this page arrives with: everything but the veil rises 28 units into
 * place over 260 ms (the reduced beat under the motion setting); the veil only fades. A sheet
 * that simply appears reads as a page replaced; one that rises reads as a layer on the page.
 */
export function riseSheet(self: MenuScene, objects: Phaser.GameObjects.GameObject[]): void {
  const rise = motionMs(260);
  for (const object of objects) {
    const target = object as Phaser.GameObjects.GameObject & { y?: number; alpha?: number; height?: number; setAlpha?: (a: number) => unknown; setY?: (y: number) => unknown };
    if (typeof target.y !== 'number' || typeof target.setAlpha !== 'function') continue;
    const veil = (target.height ?? 0) >= GAME_HEIGHT - 30;
    const restY = target.y;
    target.setAlpha(0);
    if (!veil) target.setY?.(restY + 28);
    self.tweens.add({
      targets: target,
      alpha: veil ? 0.88 : 1,
      ...(veil ? {} : { y: restY }),
      duration: rise,
      ease: 'Cubic.easeOut',
    });
  }
}

/** Moves any sheet furniture still on the page into the sheet's own layer. See `modalLayer`. */
export function adoptModal(self: MenuScene): void {
  if (self.modalObjects.length === 0) return;
  let adopted = false;
  for (const item of self.modalObjects) {
    const node = item as Phaser.GameObjects.GameObject & { parentContainer?: unknown };
    if (!node.parentContainer && node.active) {
      self.modalLayer.add(item);
      adopted = true;
    }
  }
  if (!adopted) return;
  // Two guards for the frame the sheet is built in, before it has been drawn: it sorts on top
  // of the page for input, and nothing is pressable until it has actually been drawn once.
  liftForInput(self, self.modalObjects);
  quietUntilNextFrame(self);
}

export function closeModal(self: MenuScene): void {
  // Same boundary on the way out: the press that closed the sheet does not get to press what
  // the sheet was covering.
  swallowRestOfPress(self);
  quietUntilNextFrame(self);
  bumpInputGeneration();
  for (const item of self.modalObjects) {
    item.destroy();
  }
  self.modalObjects = [];
  self.installModalOpen = false;
  if (self.sheetDismiss) {
    self.input.off('pointermove', self.sheetDismiss.move);
    self.sheetDismiss = undefined;
  }
}

/**
 * A sheet closes the way a sheet does: a tap outside its panel, or a swipe down across it.
 *
 * Registered on the scene's own pointer stream because the modal's blocker swallows both
 * halves of a press on purpose (the press-through fix), so a listener on the blocker would
 * never hear the release. Removed by `closeModal`, whichever way the sheet went.
 */
export function armSheetDismiss(self: MenuScene, panel: UIBounds): void {
  // The blocker swallows both halves of a press (the press-through fix) and stops propagation,
  // so a scene-level release would never arrive. Four hit rectangles around the panel take the
  // tap outside instead; they sit above the blocker because they are made after it.
  const outside = [
    { x: 0, y: 0, w: GAME_WIDTH, h: panel.y },
    { x: 0, y: panel.y + panel.height, w: GAME_WIDTH, h: GAME_HEIGHT - panel.y - panel.height },
    { x: 0, y: panel.y, w: panel.x, h: panel.height },
    { x: panel.x + panel.width, y: panel.y, w: GAME_WIDTH - panel.x - panel.width, h: panel.height },
  ];
  let live = false;
  for (const box of outside) {
    if (box.w <= 0 || box.h <= 0) continue;
    const zone = self.add.rectangle(box.x, box.y, box.w, box.h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    zone.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (live) closeModal(self);
    });
    self.modalObjects.push(zone);
  }
  // The swipe down across the sheet: the move stream is not swallowed, and the pointer knows
  // where it went down. Measured in design units, so a render scale does not change the feel.
  const move = (pointer: Phaser.Input.Pointer): void => {
    if (!live || !pointer.isDown) return;
    if (designLength(pointer.y - pointer.downY) > 48) closeModal(self);
  };
  self.sheetDismiss = { move };
  self.input.on('pointermove', move);
  // Next frame, not now: the press that opened the sheet must not also close it.
  self.time.delayedCall(0, () => { live = true; });
}
