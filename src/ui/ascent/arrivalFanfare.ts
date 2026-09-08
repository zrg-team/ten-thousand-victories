import Phaser from 'phaser';
import { INK_UI } from '../InkUI';
import { PIGMENT } from '../ink/palette';
import { drawHouseSeal, houseBanner } from './houseBanner';

/**
 * The moment a ruler joins — a **chiếu chỉ**, an imperial edict being sealed.
 *
 * The codebase had no celebration of any kind before this: no particles anywhere (Phaser's
 * emitter is unused in the whole project), no reveal sequence, and the entire premium treatment
 * for a jade pull was a single 3px stroke breathing on the card edge. That restraint is correct
 * for a gacha card and wrong for the one draw in a run that changes the board, so this is the
 * one place the mode is allowed to raise its voice.
 *
 * It is still a woodblock print, not a slot machine. Everything here is drawn with the ink
 * primitives the rest of the game uses — a bronze Đông Sơn band, a lacquer seal stamped down,
 * eight rays swept once and gone. No particles, no confetti, no glow beyond what the paper
 * would actually do: the seal *lands*, the way a chop lands on an edict, and the weight comes
 * from the punch and the rays rather than from colour.
 */
export function playArrivalFanfare(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onDone?: () => void,
): Phaser.GameObjects.Container {
  const root = scene.add.container(x, y).setDepth(900);

  // A ground of its own. Without it the seal lands on top of whatever screen the choice moved
  // the player to and reads as graphics that leaked, not as a moment — the prompt advances the
  // instant the card is tapped, so there is never the card underneath that you would expect.
  const scrim = scene.add.graphics();
  scrim.fillStyle(PIGMENT.muc, 0.74);
  scrim.fillRect(-x, -y, x * 2, y * 2);
  scrim.setAlpha(0);
  root.addAt(scrim, 0);
  scene.tweens.add({ targets: scrim, alpha: 1, duration: 140, ease: 'Sine.easeOut' });

  // No bronze rules here, though the first cut had them. Over a screen of option cards two
  // horizontal bands read as strikethrough on the text beneath rather than as a frame — the
  // device belongs on paper it owns, and this moment borrows the screen for half a second.

  // Eight rays. Drawn once, swept out, gone — a standing ray field reads as a slot machine.
  const rays = scene.add.graphics();
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    rays.lineStyle(2.2, INK_UI.gold, 0.5);
    rays.beginPath();
    rays.moveTo(Math.cos(angle) * 28, Math.sin(angle) * 28);
    rays.lineTo(Math.cos(angle) * 96, Math.sin(angle) * 96);
    rays.strokePath();
  }
  rays.setAlpha(0).setScale(0.5);
  root.add(rays);

  // The chop itself, in lacquer red, stamped down onto the paper.
  const chop = drawHouseSeal(scene, houseBanner(), 54);
  chop.setScale(2.6).setAlpha(0);
  root.add(chop);

  const shadow = scene.add.graphics();
  shadow.fillStyle(PIGMENT.muc, 0.16);
  shadow.fillCircle(0, 0, 34);
  shadow.setAlpha(0).setScale(0.4);
  root.addAt(shadow, 0);

  scene.tweens.chain({
    tweens: [
      // The chop falls and *lands* — the overshoot is the whole feeling.
      {
        targets: [chop, shadow],
        scale: 1,
        alpha: 1,
        duration: 230,
        ease: 'Back.easeIn',
      },
      // Everything the impact throws off, in one sweep.
      {
        targets: rays,
        alpha: { from: 0.9, to: 0 },
        scale: 1.5,
        duration: 480,
        ease: 'Cubic.easeOut',
        offset: '-=40',
      },
      // Held just long enough to read, then gone.
      { targets: root, alpha: 0, duration: 260, delay: 320, ease: 'Sine.easeIn' },
    ],
    onComplete: () => {
      root.destroy(true);
      onDone?.();
    },
  });

  return root;
}
