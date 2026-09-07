import Phaser from 'phaser';
import { PIGMENT } from '../ink/palette';
import { DYNASTY_SIGNS as BANNER_EMBLEMS, type DynastySign as BannerEmblem } from '../../data/dynastySigns';

export const BANNER_EMBLEM_SIZE = 64;

/** Saved ids are stable; the old crown is now the bronze-drum motif in the banner picker. */
export function bannerEmblem(id: string): BannerEmblem {
  return (BANNER_EMBLEMS as readonly string[]).includes(id) ? id as BannerEmblem : 'crown';
}

/** Dedicated woodcut devices, independent of the small tactical card glyphs. */
export function drawBannerEmblem(
  scene: Phaser.Scene,
  id: string,
  fill = PIGMENT.hoePale,
  ink = PIGMENT.muc,
  ground = PIGMENT.diepHi,
): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setData('bannerEmblem', bannerEmblem(id));
  const g = scene.add.graphics();
  root.add(g);
  const polygon = (points: number[][], colour = fill, line = ink, weight = 1.8): void => {
    const path = points.map(([x, y]) => ({ x, y }));
    g.fillStyle(colour).fillPoints(path, true);
    g.lineStyle(weight, line).strokePoints(path, true);
  };
  const line = (points: number[][], colour = ink, weight = 1.6): void => {
    g.lineStyle(weight, colour).strokePoints(points.map(([x, y]) => ({ x, y })), false);
  };
  const oval = (x: number, y: number, w: number, h: number, colour = fill): void => {
    g.fillStyle(colour).fillEllipse(x, y, w, h);
    g.lineStyle(1.8, ink).strokeEllipse(x, y, w, h);
  };
  switch (bannerEmblem(id)) {
    case 'crown': {
      // Ngọc Lũ's fourteen-ray sun and geometric bands; an adaptation, not a facsimile.
      oval(0, 0, 58, 58);
      g.lineStyle(1.3, ink).strokeCircle(0, 0, 25).strokeCircle(0, 0, 20).strokeCircle(0, 0, 17);
      const sun: number[][] = [];
      for (let i = 0; i < 28; i += 1) {
        const a = i * Math.PI / 14 - Math.PI / 2;
        const r = i % 2 ? 7 : 16;
        sun.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      polygon(sun, ink, ink, 0.5);
      for (let i = 0; i < 22; i += 1) {
        const a = i * Math.PI * 2 / 22;
        const p = (r: number, delta: number): number[] => [Math.cos(a + delta) * r, Math.sin(a + delta) * r];
        line([p(24, -0.07), p(21, 0), p(24, 0.07)], ink, 1.15);
      }
      g.fillStyle(fill).fillCircle(0, 0, 3);
      break;
    }
    case 'banner': {
      // A square command standard, with nested bands and a flame-cut fly.
      line([[-21, 28], [-21, -27]], ink, 4);
      polygon([[-24, -25], [-21, -31], [-18, -25]], fill);
      for (let i = 0; i < 5; i += 1) {
        const y = -21 + i * 7;
        polygon([[21, y], [28, y + 1], [22, y + 6]], fill, ink, 1);
      }
      polygon([[-18, -23], [22, -21], [22, 16], [-18, 14]]);
      polygon([[-13, -18], [16, -16], [16, 10], [-13, 9]], ground, ink, 1.3);
      polygon([[-9, -14], [12, -13], [12, 6], [-9, 5]], fill, ink, 1);
      line([[-3, -9], [6, -8], [6, 1], [-3, 0], [-3, -9]], ink, 2.3);
      line([[-21, -23], [-27, -14], [-25, -7]], fill, 2.5);
      break;
    }
    case 'blade': {
      // A complete sword: tapered blade, ridge, guard, wrapped grip and pommel.
      g.setRotation(Math.PI / 5);
      polygon([[0, -31], [5, -21], [4, 12], [-4, 12], [-5, -21]]);
      polygon([[0, -27], [3, -20], [2, 10], [0, 10]], ground, ground, 0.5);
      line([[0, -24], [0, 11]], ink, 1.1);
      polygon([[-12, 10], [-8, 8], [-5, 11], [5, 11], [8, 8], [12, 10], [9, 15], [-9, 15]]);
      polygon([[-3, 15], [3, 15], [3, 27], [-3, 27]]);
      for (let y = 17; y < 26; y += 3) line([[-3, y], [3, y + 1]], ink, 1.1);
      oval(0, 28, 9, 5);
      line([[4, 23], [12, 26], [16, 21], [16, 12]], ink, 1.3);
      polygon([[13, 13], [18, 13], [19, 4], [15, 7]], fill, ink, 1.1);
      break;
    }
    case 'grain': {
      const stems = [
        [[-2, 27], [-6, 10], [-10, -3], [-16, -12], [-23, -14], [-29, -10]],
        [[1, 27], [1, 4], [0, -12], [-4, -23], [-12, -27], [-19, -24]],
        [[3, 27], [10, 6], [14, -11], [19, -20], [25, -20], [29, -16]],
      ];
      for (const stem of stems) {
        line(stem, ink, 3.5);
        line(stem, fill, 1.8);
      }
      polygon([[-3, 22], [-22, 8], [-28, -5], [-14, 4]], fill);
      polygon([[3, 23], [23, 11], [29, 0], [14, 6]], fill);
      const kernels = [[-28,-10],[-23,-12],[-18,-10],[-13,-4],[-18,-24],[-12,-25],[-7,-21],[-3,-15],[28,-16],[24,-18],[20,-16],[16,-10]];
      for (const [x, y] of kernels) {
        polygon([[x, y - 3], [x + 4, y - 1], [x + 3, y + 5], [x, y + 7], [x - 2, y + 2]], fill, ink, 1.2);
      }
      polygon([[-6, 18], [7, 18], [6, 22], [-5, 23]], ink);
      break;
    }
    case 'branch': {
      // Jointed bamboo and lance-shaped leaves, not the tactical river-branch glyph.
      polygon([[-9, 29], [-5, -26], [0, -27], [-3, 29]]);
      polygon([[6, 29], [7, -15], [12, -17], [12, 29]]);
      for (const y of [-17, -3, 12, 25]) line([[-9, y], [1, y - 1]], ink, 2);
      for (const y of [-9, 7, 22]) line([[5, y], [13, y]], ink, 2);
      line([[-4, -15], [-15, -22], [-23, -23]], ink, 1.5);
      line([[10, -4], [18, -14], [28, -19]], ink, 1.5);
      line([[-5, 5], [-16, 0], [-28, 2]], ink, 1.5);
      for (const points of [
        [[-13,-20],[-18,-31],[-20,-27],[-18,-20]],
        [[-18,-22],[-31,-25],[-27,-18],[-20,-19]],
        [[17,-12],[18,-26],[23,-22],[21,-16]],
        [[22,-17],[31,-15],[25,-10],[18,-10]],
        [[-16,1],[-26,-9],[-25,-2],[-20,2]],
        [[-18,2],[-30,8],[-23,10],[-13,4]],
        [[11,11],[26,2],[23,10],[13,15]],
      ]) polygon(points, fill, ink, 1.2);
      break;
    }
    case 'tortoise': {
      polygon([[-11,-14],[-25,-20],[-24,-10],[-14,-4]]);
      polygon([[11,-14],[25,-20],[24,-10],[14,-4]]);
      polygon([[-13,9],[-24,19],[-17,23],[-9,17]]);
      polygon([[13,9],[24,19],[17,23],[9,17]]);
      polygon([[-3,21],[0,30],[4,20]]);
      oval(0, -25, 13, 13);
      oval(0, 0, 39, 49);
      g.lineStyle(1.2, ink).strokeEllipse(0, 0, 31, 41);
      polygon([[-7,-10],[0,-15],[8,-10],[8,7],[0,13],[-8,7]], fill, ink, 1.8);
      line([[-7,-10],[-12,-16]], ink); line([[8,-10],[12,-16]], ink);
      line([[-8,0],[-16,0]], ink); line([[8,0],[16,0]], ink);
      line([[-8,7],[-12,15]], ink); line([[8,7],[12,15]], ink);
      line([[0,13],[0,21]], ink);
      g.fillStyle(ink).fillCircle(-3, -27, 1).fillCircle(3, -27, 1);
      break;
    }
    case 'lotus': {
      polygon([[-2,19],[-24,15],[-30,-3],[-14,0],[0,15]]);
      polygon([[2,19],[24,15],[30,-3],[14,0],[0,15]]);
      polygon([[0,21],[-20,5],[-18,-19],[-5,-11],[0,9]]);
      polygon([[0,21],[20,5],[18,-19],[5,-11],[0,9]]);
      polygon([[0,20],[-10,0],[0,-30],[10,0]]);
      line([[-25,25],[0,29],[25,25]]);
      line([[0,-14],[0,13]], ink, 1);
      break;
    }
    case 'lacBird': {
      polygon([[-29,19],[-13,-1],[-21,-19],[-7,-11],[3,0],[10,-15],[16,-20],[20,-18],[30,-13],[18,-13],[13,0],[8,10],[-5,15]]);
      polygon([[-10,1],[-28,-8],[-23,-24],[-13,-13],[4,8]]);
      line([[-23,-16],[-12,-7],[0,7]], ink, 1.2);
      line([[0,14],[-2,23],[8,27]], ink, 2);
      line([[6,12],[7,21],[18,24]], ink, 2);
      g.fillStyle(ink).fillCircle(16,-17,1.2);
      break;
    }
    case 'dragon': {
      polygon([[-29,22],[-16,24],[0,15],[4,3],[-8,-5],[-15,-3],[-14,7],[-7,7],[-7,12],[-19,12],[-24,2],[-19,-11],[-7,-15],[6,-8],[13,3],[10,17],[-2,27],[-19,30]]);
      polygon([[2,-12],[3,-24],[11,-22],[17,-28],[19,-20],[28,-15],[29,-7],[19,-5],[12,0],[7,-5]]);
      polygon([[4,-24],[0,-31],[9,-27],[11,-22]], fill);
      line([[18,-11],[27,-10]], ink, 2);
      line([[25,-5],[30,1],[23,4]], ink, 1.3);
      for (const [x,y] of [[-18,-5],[-13,0],[-4,16],[3,10]]) line([[x-2,y-2],[x+2,y],[x-2,y+2]], ink, 1);
      line([[-10,20],[-5,29],[2,29]], ink, 2);
      g.fillStyle(ink).fillCircle(15,-16,1.7);
      break;
    }
    case 'phoenix': {
      polygon([[0,9],[-13,6],[-29,-10],[-27,-25],[-17,-9],[-12,-22],[-4,-5],[0,1]]);
      polygon([[0,9],[13,6],[29,-10],[27,-25],[17,-9],[12,-22],[4,-5],[0,1]]);
      polygon([[-4,3],[-4,-13],[0,-23],[5,-19],[14,-16],[4,-14],[5,4],[0,13]]);
      for (const s of [-1,1]) {
        polygon([[0,9],[s*10,11],[s*22,28],[s*9,24],[0,15]]);
        line([[s*8,-4],[s*23,-16]], ink, 1.1);
      }
      polygon([[-4,11],[0,31],[5,11]]);
      line([[-1,-23],[-6,-29],[1,-27],[5,-30]], ink, 1.5);
      g.fillStyle(ink).fillCircle(1,-18,1);
      break;
    }
    case 'tiger': {
      oval(-18,-20,17,17); oval(18,-20,17,17);
      polygon([[-22,-19],[-27,-4],[-21,17],[-9,27],[9,27],[21,17],[27,-4],[22,-19],[0,-24]]);
      for (const s of [-1,1]) {
        polygon([[s*24,-9],[s*10,-5],[s*24,0]], ink, ink, 0.5);
        polygon([[s*23,5],[s*12,8],[s*20,12]], ink, ink, 0.5);
        line([[s*6,-5],[s*14,-8]], ink, 2.6);
        oval(s*6,13,13,12,ground);
      }
      polygon([[-5,8],[5,8],[0,14]], ink);
      line([[0,14],[0,20]], ink, 1.5);
      line([[-7,-18],[7,-18]], ink, 2);line([[-5,-13],[5,-13]], ink, 2);line([[0,-22],[0,-9]], ink, 2);
      break;
    }
    case 'buffalo': {
      for (const s of [-1,1]) polygon([[s*12,-10],[s*23,-16],[s*28,-29],[s*30,-14],[s*23,-3],[s*15,0]]);
      polygon([[-16,-14],[-21,-3],[-12,17],[-9,26],[9,26],[12,17],[21,-3],[16,-14],[0,-18]]);
      oval(0,20,24,16);
      line([[-14,-3],[-7,0]], ink, 2.5);line([[14,-3],[7,0]], ink, 2.5);
      g.fillStyle(ink).fillCircle(-6,20,1.5).fillCircle(6,20,1.5);
      line([[-7,25],[7,25]], ink, 1.2);
      break;
    }
    case 'carp': {
      polygon([[12,12],[28,13],[22,24],[9,29],[7,13]]);
      polygon([[-9,-11],[-9,-29],[4,-18],[9,-4]]);
      polygon([[-18,-21],[-26,-8],[-20,8],[-5,19],[10,14],[15,0],[4,-16]]);
      line([[-20,-13],[-10,-11],[-7,-1],[-13,7]], ink, 1.8);
      for (const [x,y] of [[-3,-9],[3,-2],[-3,3],[3,9]]) line([[x-3,y-3],[x,y],[x-3,y+3]], ink, 1.1);
      polygon([[-14,6],[-21,19],[-5,14]]);
      g.fillStyle(ink).fillCircle(-17,-12,2);
      line([[-24,-4],[-30,-2]], ink, 1.4);
      break;
    }
    case 'mountain': {
      polygon([[-31,24],[-16,-10],[-5,7],[5,-28],[30,24]]);
      polygon([[5,-28],[-3,-3],[5,-8],[14,-3]], ground, ink, 1.1);
      line([[-16,-10],[-10,15],[-5,7]], ink, 1.3);
      line([[5,-8],[10,13],[21,21]], ink, 1.3);
      line([[-27,29],[-6,27],[12,29],[29,27]], ink, 1.8);
      break;
    }
    case 'wave': {
      polygon([[-30,17],[-18,8],[-13,-10],[-2,-24],[14,-27],[27,-17],[29,-4],[19,-10],[9,-8],[5,1],[13,7],[26,5],[19,18],[1,25],[-16,23]]);
      line([[-19,15],[-6,13],[-4,-3],[3,-14],[16,-17]], ink, 2);
      line([[0,17],[12,16],[19,12]], ink, 1.2);
      line([[-29,29],[-12,27],[7,30],[29,25]], ink, 1.7);
      break;
    }
    case 'star': {
      const points: number[][] = [];
      for(let i=0;i<16;i++) {
        const angle=i*Math.PI/8-Math.PI/2,r=i%2?10:29;
        points.push([Math.cos(angle)*r,Math.sin(angle)*r]);
      }
      polygon(points);
      oval(0,0,16,16,ground);
      line([[-4,0],[0,-4],[4,0],[0,4],[-4,0]],ink,1.2);
      break;
    }
  }
  return root;
}
