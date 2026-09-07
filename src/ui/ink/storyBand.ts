import Phaser from 'phaser';
import { PIGMENT as P } from './palette';
import { inkPath, printedShape } from './stroke';
import { bamboo, boThoc, dinh, house, karst } from './props';
import type { StoryBand } from '../../state/types';

/** Generic settings composed with the map's own blocks; never a prediction of an ending. */
export function drawStoryBand(scene: Phaser.Scene, band: StoryBand, key: string, width: number, height: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setData('storyBand', band);
  let seed = 2166136261;
  for (const char of `${band}:${key}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  let stroke = 0;
  const path = (points: number[][], colour = P.muc, alpha = 0.8, weight = 1) =>
    inkPath(g, points.map(([x, y]) => ({ x, y })), seed + stroke++, { colour, alpha, width: weight, wobble: 0.22, bleed: 0.1 });
  const block = (points: number[][], colour: number) =>
    printedShape(g, points.map(([x, y]) => ({ x, y })), colour, seed + stroke++, { width: 1.1, alpha: 0.85, fillAlpha: 0.95, wobble: 0.25 });
  g.fillStyle(P.diepHi).fillRect(0, 0, 320, 128);
  for (let i = 0; i < 65; i++) {
    const x = 8 + ((i * 71) % 302), y = 8 + ((i * 43) % 112);
    g.lineStyle(0.45, P.nau, 0.08).lineBetween(x, y, x + 3, y - 0.5);
  }
  g.fillStyle(band === 'night' ? P.chamPale : P.hoePale, 0.65).fillCircle(256, 29, 15);
  for (const [x, y] of [[55, 28], [197, 36]]) {
    path([[x, y], [x - 12, y], [x - 15, y - 4], [x - 12, y - 8], [x - 5, y - 8], [x - 2, y - 13], [x + 6, y - 14], [x + 13, y - 9], [x + 22, y - 9], [x + 27, y - 4], [x + 24, y], [x + 6, y]], P.mucSoft, 0.45);
    path([[x, y - 4], [x + 16, y - 4]], P.mucSoft, 0.35, 0.7);
  }
  block([[8, 92], [58, 78], [119, 87], [185, 77], [247, 90], [312, 81], [312, 120], [8, 120]], P.diepLo);
  // Frontal woodcut figures remain legible on a phone.
  const person = (x: number, y: number, cloth: number, soldier = false) => {
    block([[x - 6, y - 28], [x + 5, y - 28], [x + 9, y - 9], [x - 9, y - 9]], cloth);
    g.fillStyle(P.horn).fillCircle(x, y - 34, 4.5);
    g.lineStyle(1, P.muc, 0.9).strokeCircle(x, y - 34, 4.5);
    block([[x - 9, y - 37], [x, y - 43], [x + 9, y - 37]], soldier ? P.mucSoft : P.hoePale);
    path([[x - 4, y - 9], [x - 5, y], [x - 9, y]], P.muc, 0.95, 1.8);
    path([[x + 4, y - 9], [x + 5, y], [x + 9, y]], P.muc, 0.95, 1.8);
    path([[x - 5, y - 24], [x - 11, y - 15], [x - 2, y - 13]]);
    if (soldier) path([[x + 12, y], [x + 12, y - 51]], P.muc, 0.9, 1.3);
  };
  if (band === 'river' || band === 'coast') {
    block([[8, 84], [75, 77], [160, 87], [232, 76], [312, 84], [312, 120], [8, 120]], P.chamWash);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const x = 15 + col * 76 + row % 2 * 6, y = 91 + row * 8;
      path([[x, y], [x + 10, y - 2], [x + 24, y], [x + 42, y]], P.cham, 0.7, 0.8);
    }
    karst(g, 73, 81, 91, 43, seed, true);
    if (band === 'coast') {
      path([[206, 85], [206, 26]], P.muc, 0.9, 1.6);
      block([[210, 29], [234, 44], [239, 72], [210, 70]], P.hoePale);
      path([[213, 42], [230, 49]]); path([[213, 53], [234, 58]]);
    } else person(211, 88, P.nau);
    block([[168, 88], [185, 101], [231, 101], [249, 85], [226, 91], [185, 92]], P.nau);
  } else if (band === 'mountain' || band === 'border') {
    karst(g, 96, 100, 117, 76, seed);
    karst(g, 212, 101, 89, 52, seed + 4, true);
    path([[141, 117], [172, 98], [160, 84]], P.nau, 0.65, 3);
    if (band === 'border') {
      house(g, 235, 96, 1.2, seed, true);
      for (let x = 227; x < 296; x += 7) path([[x, 105], [x, 86]], P.nau, 0.9, 1.6);
    }
    bamboo(g, 37, 110, 1.8, seed);
  } else if (band === 'field') {
    for (let i = 0; i < 4; i++) {
      const y = 82 + i * 10;
      path([[15, y], [127, y - 8], [292, y + 1]], P.tramDeep, 0.8, 1.5);
      for (let x = 24; x < 294; x += 18) path([[x - 3, y - 5], [x, y], [x + 3, y - 6]], P.tramDeep, 0.8);
    }
    house(g, 55, 70, 1.35, seed);
    person(177, 107, P.cham); person(242, 99, P.nau);
  } else if (band === 'march' || band === 'crowd') {
    if (band === 'crowd') dinh(g, 110, 72, 1.5, seed);
    else {
      path([[72, 89], [72, 24]], P.muc, 0.95, 1.7);
      block([[73, 25], [109, 33], [99, 43], [73, 39]], P.hoe);
    }
    [64, 110, 156, 202, 248].forEach((x, i) => person(x, 108 + i % 2 * 4, i % 2 ? P.nau : P.cham, band === 'march'));
  } else if (band === 'fire') {
    house(g, 120, 100, 2, seed);
    for (let i = 0; i < 4; i++) {
      const x = 143 + i * 17;
      block([[x - 8, 79], [x - 11, 64], [x - 3, 49], [x, 34 + i % 2 * 10], [x + 7, 53], [x + 12, 66], [x + 8, 79]], P.hoe);
    }
    bamboo(g, 58, 107, 1.7, seed);
  } else {
    bamboo(g, 43, 108, 2.3, seed);
    if (band === 'granary') {
      house(g, 114, 96, 2.5, seed);
      [116, 155, 194].forEach((x, i) => boThoc(g, x, 112, 2.8, seed + i));
    } else {
      dinh(g, 115, 96, 2.4, seed);
      if (band === 'court') { person(91, 111, P.cham); person(250, 111, P.nau); }
      if (band === 'shrine') {
        block([[170, 116], [198, 116], [196, 104], [172, 104]], P.hoePale);
        path([[180, 104], [180, 94]]); path([[188, 104], [188, 92]]);
      }
      if (band === 'night') {
        g.fillStyle(P.hoe, 0.9).fillRect(166, 80, 9, 13);
        for (let i = 0; i < 9; i++) g.fillStyle(P.cham, 0.6).fillCircle(91 + i * 19, 13 + i % 3 * 7, 0.8);
      }
    }
  }
  inkPath(g, [{x: 3, y: 3}, {x: 317, y: 3}, {x: 317, y: 125}, {x: 3, y: 125}], seed,
    { width: 1.1, alpha: 0.8, closed: true, wobble: 0.25 });
  // Keep the drawing's proportions at every sheet width.
  const fit = Math.min(width / 320, height / 128);
  g.setScale(fit).setPosition((width - 320 * fit) / 2, (height - 128 * fit) / 2);
  return g;
}
