import Phaser from 'phaser';
import { PIGMENT } from './palette';
import { inkPath } from './stroke';

/** The menu's translucent indigo-and-paper cloud bank, shared with the battlefield. */
export function drawMountainMist(
  mist: Phaser.GameObjects.Graphics, span: number, bandHeight: number, index: number,
): void {
  mist.fillStyle(PIGMENT.chamWash, 0.3);
  mist.fillEllipse(-span * 0.13, 0, span * 0.72, bandHeight * 0.62);
  mist.fillStyle(PIGMENT.diep, 0.22);
  mist.fillEllipse(span * 0.17, 0.7, span * 0.7, bandHeight * 0.46);
  mist.fillStyle(PIGMENT.chamPale, 0.2);
  mist.fillEllipse(span * 0.03, bandHeight * 0.18, span * 0.84, bandHeight * 0.2);
  inkPath(mist, [
    { x: -span * 0.39, y: -bandHeight * 0.04 },
    { x: -span * 0.17, y: bandHeight * 0.07 },
    { x: span * 0.05, y: -bandHeight * 0.03 },
    { x: span * 0.24, y: bandHeight * 0.06 },
    { x: span * 0.4, y: -bandHeight * 0.02 },
  ], 7_350 + index, {
    width: 0.6,
    alpha: 0.4,
    colour: PIGMENT.chamPale,
    wobble: 0.32,
    step: 5,
  });
}
