import Phaser from 'phaser';
import { GAME_WIDTH } from '../game/constants';
import { designLength } from '../game/graphicsQuality';

/**
 * Adds a quick press/release scale bounce to a container, driven by an
 * interactive hit area. Layers on top of any existing pointer handlers.
 */
export function addPressFeedback(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  hitArea: Phaser.GameObjects.GameObject,
  bounds?: { width: number; height: number },
): void {
  const press = { ratio: 1 };
  let held = false;
  let base = {
    x: container.x,
    y: container.y,
    scaleX: container.scaleX,
    scaleY: container.scaleY,
  };
  const width = bounds?.width ?? 0;
  const height = bounds?.height ?? 0;
  const applyScale = (ratio: number) => {
    container.setScale(base.scaleX * ratio, base.scaleY * ratio);
    container.setPosition(
      base.x + (width * base.scaleX * (1 - ratio)) / 2,
      base.y + (height * base.scaleY * (1 - ratio)) / 2,
    );
  };

  hitArea.on('pointerdown', () => {
    held = true;
    scene.tweens.killTweensOf(press);
    base = {
      x: container.x,
      y: container.y,
      scaleX: container.scaleX,
      scaleY: container.scaleY,
    };
    press.ratio = 1;
    scene.tweens.add({
      targets: press,
      ratio: 0.94,
      duration: 60,
      ease: 'Quad.Out',
      onUpdate: () => applyScale(press.ratio),
    });
  });

  const release = () => {
    // A hover exit has no press to settle. Its original coordinates may predate a layout move.
    if (!held) return;
    held = false;
    scene.tweens.killTweensOf(press);
    scene.tweens.add({
      targets: press,
      ratio: 1,
      duration: 120,
      ease: 'Back.Out',
      onUpdate: () => applyScale(press.ratio),
      onComplete: () => {
        container.setScale(base.scaleX, base.scaleY);
        container.setPosition(base.x, base.y);
      },
    });
  };

  hitArea.on('pointerup', release);
  hitArea.on('pointerout', release);
}

/**
 * Pops a full-screen container in from a slightly smaller scale, anchored
 * visually at (focusX, focusY) rather than the container's origin.
 */
export function popInModal(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  focusX: number,
  focusY: number,
): void {
  layer.setAlpha(0);
  const proxy = { t: 0 };
  scene.tweens.add({
    targets: proxy,
    t: 1,
    duration: 180,
    ease: 'Back.Out',
    onUpdate: () => {
      const scaleValue = 0.92 + 0.08 * proxy.t;
      layer.setScale(scaleValue);
      layer.setPosition(focusX * (1 - scaleValue), focusY * (1 - scaleValue));
      layer.setAlpha(proxy.t);
    },
  });
}

export interface StaggerInOptions {
  staggerMs?: number;
  offsetY?: number;
  duration?: number;
}

/**
 * Fades and slides a list of containers into place, one after another.
 */
export function staggerIn(
  scene: Phaser.Scene,
  items: Phaser.GameObjects.Container[],
  opts: StaggerInOptions = {},
): void {
  const { staggerMs = 45, offsetY = 14, duration = 220 } = opts;
  items.forEach((item, index) => {
    const targetY = item.y;
    const targetAlpha = item.alpha;
    item.setAlpha(0);
    item.setY(targetY + offsetY);
    scene.tweens.add({
      targets: item,
      alpha: targetAlpha,
      y: targetY,
      duration,
      delay: index * staggerMs,
      ease: 'Sine.Out',
    });
  });
}

export interface SwipeableCardHandlers {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

/**
 * Makes a card container draggable left/right. Past the threshold it flies
 * off-screen and fires the matching handler; otherwise it snaps back.
 */
export function makeSwipeableCard(
  scene: Phaser.Scene,
  card: Phaser.GameObjects.Container,
  hitWidth: number,
  hitHeight: number,
  handlers: SwipeableCardHandlers,
): void {
  const originX = card.x;
  const originRotation = card.rotation;
  const threshold = 70;

  const zone = scene.add
    .zone(0, 0, hitWidth, hitHeight)
    .setInteractive({ draggable: true, useHandCursor: true });
  card.add(zone);

  let dragOffsetX = 0;

  zone.on('dragstart', (pointer: Phaser.Input.Pointer) => {
    dragOffsetX = card.x - designLength(pointer.x);
  });

  zone.on('drag', (pointer: Phaser.Input.Pointer) => {
    const x = designLength(pointer.x) + dragOffsetX;
    card.x = x;
    card.rotation = originRotation + Phaser.Math.Clamp((x - originX) / 400, -0.35, 0.35);
  });

  zone.on('dragend', () => {
    const dx = card.x - originX;
    if (Math.abs(dx) <= threshold) {
      scene.tweens.add({
        targets: card,
        x: originX,
        rotation: originRotation,
        duration: 180,
        ease: 'Back.Out',
      });
      return;
    }

    const direction = dx > 0 ? 1 : -1;
    scene.tweens.add({
      targets: card,
      x: originX + direction * (GAME_WIDTH + 200),
      rotation: originRotation + direction * 0.6,
      alpha: 0,
      duration: 220,
      ease: 'Quad.In',
      onComplete: () => {
        if (direction > 0) {
          handlers.onSwipeRight();
        } else {
          handlers.onSwipeLeft();
        }
      },
    });
  });
}
