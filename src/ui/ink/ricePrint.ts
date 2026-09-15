import type Phaser from 'phaser';
import type { Season } from '../../state/types';
import { tileAssetsEnabled } from '../../game/groundSettings';
import { proceduralConquestArtForced } from '../conquestMapArt';
import { connectedRiceGround, pointInRice, riceStage, type RicePlan, type RiceStage } from './riceGround';

const SOURCE = 'dongho-rice-clumps-v5b';
let serial = 0;

export function preloadRicePrint(scene: Phaser.Scene, baseUrl: string): void {
  if (connectedRiceGround() && tileAssetsEnabled() && !proceduralConquestArtForced()) {
    scene.load.image(SOURCE, `${baseUrl}art/ground/dongho-rice-clumps-v5b.webp`);
  }
}

const SURFACE: Record<RiceStage, string> = {
  flooded: '#a7b9aa', seedlings: '#a7b9aa', green: '#a3a764', ripe: '#baa361', stubble: '#ac9c78',
};

/** Small upright plants on a foreshortened root grid. Footprints remain the actual terrain cells. */
export class RicePrintLayer {
  private readonly key = `rice-parcels:${++serial}`;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly bounds: Array<{ left: number; top: number; width: number; height: number }>;

  static available(scene: Phaser.Scene): boolean {
    return tileAssetsEnabled() && !proceduralConquestArtForced() && scene.textures.exists(SOURCE);
  }

  constructor(private readonly scene: Phaser.Scene, private readonly plan: RicePlan) {
    // Two frames per tile: water/earth below every plant, and transparent standing rice above.
    this.texture = scene.textures.createCanvas(this.key, 2048, Math.max(160, Math.ceil(plan.parcels.length / 8) * 160))!;
    this.bounds = plan.parcels.map(p => {
      const left = Math.min(...p.corners.map(p => p.x)) - 2, top = Math.min(...p.corners.map(p => p.y)) - 5;
      return { left, top, width: Math.max(...p.corners.map(p => p.x)) - left + 2, height: Math.max(...p.corners.map(p => p.y)) - top + 1 };
    });
    plan.parcels.forEach((p, i) => {
      const b = this.bounds[i];
      for (let pass = 0; pass < 2; pass++) {
        this.texture.add(i * 2 + pass, 0, (i % 8) * 256 + pass * 128, Math.floor(i / 8) * 160, 128, 160);
        this.images.push(scene.add.image(b.left, b.top, this.key, i * 2 + pass).setOrigin(0, 0).setDisplaySize(b.width, b.height)
          .setDepth(pass ? .032 + p.centre.y * 1e-8 : .031).setData('riceParcel', p.id).setData('ricePass', pass ? 'plants' : 'soil'));
      }
    });
  }

  *repaint(season: Season): Generator<void> {
    const g = this.texture.context, source = this.scene.textures.get(SOURCE).getSourceImage() as HTMLImageElement;
    const unit = this.plan.tileSize / 30.96;
    // QA comparison only. Neither setting scales the field or changes its connected boundary.
    const plantScale = new URLSearchParams(location.search).get('ricescale') === 'compact' ? .78 : 1;
    const stepX = 3.6 * unit, stepY = stepX * .5 / Math.sqrt(3);
    g.clearRect(0, 0, this.texture.width, this.texture.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    for (let i = 0; i < this.plan.parcels.length; i++) {
      const p = this.plan.parcels[i], stage = riceStage(season, p.seed), b = this.bounds[i];
      const neighbours = this.plan.parcels.filter(n => n.district === p.district && Math.hypot(n.centre.x - p.centre.x, n.centre.y - p.centre.y) < this.plan.tileSize * 2.2);
      const contains = (x: number, y: number): boolean => neighbours.some(n => pointInRice(n, { x, y }));
      const col = i % 8, row = Math.floor(i / 8), scaleX = 128 / b.width, scaleY = 160 / b.height;
      g.save(); g.beginPath();
      p.corners.forEach((at, k) => {
        const x = col * 256 + (p.centre.x + (at.x - p.centre.x) * 1.006 - b.left) * scaleX;
        const y = row * 160 + (p.centre.y + (at.y - p.centre.y) * 1.006 - b.top) * scaleY;
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.closePath(); g.clip();
      g.transform(scaleX, 0, 0, scaleY, col * 256 - b.left * scaleX, row * 160 - b.top * scaleY);
      g.fillStyle = SURFACE[stage]; g.fillRect(b.left, b.top, b.width, b.height);
      g.restore();
      g.save(); g.beginPath(); g.rect(col * 256 + 128, row * 160, 128, 160); g.clip();
      g.transform(scaleX, 0, 0, scaleY, col * 256 + 128 - b.left * scaleX, row * 160 - b.top * scaleY);
      const height = (stage === 'seedlings' ? 1.9 : stage === 'stubble' ? 1.05 : 3.2) * unit * plantScale;
      const spriteRow = stage === 'seedlings' ? 0 : stage === 'green' ? 1 : stage === 'ripe' ? 2 : 3;
      let count = 0;
      // Roots recede at 30 degrees while stalks remain vertical. Draw in root-y order so the
      // front leaves overlap the plants behind them. Adjacent cells draw the same world roots.
      for (let r = Math.floor((b.top - unit) / stepY); r * stepY < b.top + b.height + height; r++) {
        for (let c = Math.floor((b.left - height) / stepX); c * stepX < b.left + b.width + height; c++) {
          const seed = (Math.imul(c, 73856093) ^ Math.imul(r, 19349663) ^ p.seed) >>> 0;
          const x = (c + (r & 1) * .5) * stepX + ((seed % 7) - 3) * .1 * unit;
          const y = r * stepY + (((seed >>> 4) % 7) - 3) * .07 * unit;
          // This cell owns the root, while its leaf tips can rise above the far tile edge.
          if (!pointInRice(p, { x, y })) continue;
          // A narrow wet foot at the outside bund, with no gap at shared hex edges.
          if (!contains(x - .55 * unit, y) || !contains(x + .55 * unit, y) || !contains(x, y + .55 * unit)) continue;
          if ((stage === 'flooded' || stage === 'seedlings') && seed % 4 === 0) {
            g.strokeStyle = 'rgba(231,233,196,.65)'; g.lineWidth = .24 * unit;
            g.beginPath(); g.ellipse(x, y + .12 * unit, .9 * unit, .23 * unit, 0, 0, Math.PI * 2); g.stroke();
          }
          if (stage === 'flooded') continue;
          // Narrow open planting furrows run along a ground-plane axis, breaking the vertical
          // columns produced by an equally spaced wallpaper grid. There is no internal bund.
          const furrow = ((Math.floor(r / 2) - c) % 6 + 6) % 6;
          if (furrow === 0) continue;
          if (stage === 'stubble' && seed % 3 === 0) continue;
          const h = height * (.9 + (seed % 9) * .025), w = h;
          g.fillStyle = stage === 'seedlings' ? 'rgba(42,73,59,.22)' : 'rgba(57,61,32,.25)';
          g.beginPath(); g.ellipse(x + .38 * unit, y + .18 * unit, w * .34, .24 * unit, .12, 0, Math.PI * 2); g.fill();
          g.drawImage(source, (seed % 4) * 128, spriteRow * 128, 128, 128, x - w * .5, y - h * 124 / 128, w, h);
          count++;
        }
      }
      g.restore();
      this.images[i * 2 + 1].setData('riceRelief', { plantHeight: height, rowAngle: 30, plants: count, plantScale });
      yield;
    }
    this.texture.refresh();
  }

  destroy(): void {
    for (const image of this.images) image.destroy();
    this.scene.textures.remove(this.key);
  }
}
