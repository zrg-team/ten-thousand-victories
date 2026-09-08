import Phaser from 'phaser';
import type { LandBuildingType } from '../state/types';
import { compactNumber } from '../utils/format';
import type { MapItemRenderer, ProgressBadgeVariant } from './MapItemRenderer';
import type { MapThemeDefinition, MapThemePalette } from './mapTheme';
import { IsoBuildingRenderer } from './IsoBuildingRenderer';
import { SoldierRenderer } from './SoldierRenderer';
import { createPlayerLandFlag } from './playerFlag';
import { drawHouseSign, houseBanner } from './ascent/houseBanner';
import type { HostKit } from './ink/devices';

/**
 * Map glyphs for the illustrated atlas. Settlements reuse the shared isometric
 * building renderer (tiered pagodas, halls, shophouses, lanes) so cities read as
 * hand-drawn places, while banners, flags, and badges stay in the atlas palette.
 */
export class AtlasMapItemRenderer implements MapItemRenderer {
  private readonly colors: MapThemePalette;
  private readonly buildings: IsoBuildingRenderer;
  private readonly soldiers: SoldierRenderer;

  constructor(
    private readonly scene: Phaser.Scene,
    theme: MapThemeDefinition,
  ) {
    this.colors = theme.palette;
    this.buildings = new IsoBuildingRenderer(scene);
    this.soldiers = new SoldierRenderer(scene);
  }

  addBuildingGroup(cluster: Phaser.GameObjects.Container, x: number, y: number, isShrine: boolean, houseCount: number): void {
    this.buildings.addBuildingGroup(cluster, x, y, isShrine, houseCount);
  }

  addCityCluster(
    cluster: Phaser.GameObjects.Container,
    centers: ReadonlyArray<{ x: number; y: number }>,
    isShrine: boolean,
    kind: 'city' | 'market' | 'shrine' = 'city',
  ): void {
    this.buildings.addCityCluster(cluster, centers, isShrine, kind);
  }

  /** Fortified citadel wall: pale parapet, brushed ink shadow, and merlon ticks along the rampart. */
  drawCityWall(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>): void {
    for (const [x1, y1, x2, y2] of edges) {
      graphics.lineStyle(5, this.colors.paperLight, 0.92);
      graphics.lineBetween(x1, y1, x2, y2);
      graphics.lineStyle(2.4, this.colors.mapObjects.stone, 0.95);
      graphics.lineBetween(x1, y1, x2, y2);
      graphics.lineStyle(1.3, this.colors.ink, 0.7);
      graphics.lineBetween(x1, y1, x2, y2);

      // Merlon ticks: short crenellations stepping along the rampart.
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const steps = Math.max(1, Math.floor(length / 9));
      graphics.lineStyle(1.1, this.colors.ink, 0.6);
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const mx = x1 + dx * t;
        const my = y1 + dy * t;
        graphics.lineBetween(mx, my, mx + nx * 2.6, my + ny * 2.6);
      }
      // Corner tower stone.
      graphics.fillStyle(this.colors.mapObjects.stone, 0.96);
      graphics.fillCircle(x1, y1, 2.8);
      graphics.lineStyle(0.8, this.colors.ink, 0.7);
      graphics.strokeCircle(x1, y1, 2.8);
    }
  }

  addCottage(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    this.buildings.addCottage(cluster, x, y, scale);
  }

  addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    this.buildings.addCropPatch(cluster, x, y, scale);
  }

  createFarmCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    return this.buildings.createFarmCluster(scale, upgradeLevel);
  }

  createMineCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    return this.buildings.createMineCluster(scale, upgradeLevel);
  }

  createBuildingGlyph(building: LandBuildingType, x: number, y: number): Phaser.GameObjects.GameObject[] {
    return this.buildings.createBuildingGlyph(building, x, y);
  }

  createTraveler(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(this.colors.ink, 0.9);
    graphics.fillCircle(0, -3, 1.2);
    graphics.fillRect(-1.1, -1.8, 2.2, 3.8);
    graphics.lineStyle(0.7, this.colors.ink, 0.8);
    graphics.lineBetween(1.2, -1, 2.8, -5);
    container.add(graphics);
    return container;
  }

  createCart(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(this.colors.ink, 0.85);
    graphics.fillCircle(-3.4, 3, 2.1);
    graphics.fillCircle(3.4, 3, 2.1);
    graphics.fillStyle(this.colors.mapObjects.timber, 0.96);
    graphics.fillRect(-6, -2, 12, 5);
    graphics.lineStyle(0.8, this.colors.ink, 0.75);
    graphics.strokeRect(-6, -2, 12, 5);
    graphics.fillStyle(this.colors.paperLight, 0.96);
    graphics.fillEllipse(-2.2, -4, 3.5, 2.8);
    graphics.fillEllipse(2, -4, 3.5, 2.8);
    container.add(graphics);
    return container;
  }

  /** Banner plaque with troop count above a small marching formation, so armies read as a host on the move. */
  createArmyMarker(
    total: number, isPlayer: boolean, kingdomColor?: number, _flagSeed?: number, _kit?: HostKit,
    _drawScale?: number,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    // Rivals fly their own colours so two empires on the map are told apart at a glance; the
    // player keeps the theme's player hue plus the ring added below.
    const bannerColor = isPlayer
      ? houseBanner().field
      : (kingdomColor ?? this.colors.mapObjects.rival);
    const graphics = this.scene.add.graphics();
    if (isPlayer) {
      graphics.fillStyle(this.colors.mapObjects.selected, 0.2);
      graphics.fillRoundedRect(-23, -34, 46, 22, 3);
      graphics.lineStyle(2, this.colors.mapObjects.selected, 0.95);
      graphics.strokeRoundedRect(-23, -34, 46, 22, 3);
    }
    graphics.fillStyle(this.colors.paperLight, 0.96);
    graphics.fillRoundedRect(-20, -31, 40, 16, 2);
    graphics.lineStyle(1.4, this.colors.ink, 0.9);
    graphics.strokeRoundedRect(-20, -31, 40, 16, 2);
    graphics.lineStyle(1.6, this.colors.ink, 0.9);
    graphics.lineBetween(-13, -15, -13, -2);
    graphics.fillStyle(bannerColor, 0.96);
    if (!isPlayer) graphics.fillTriangle(-13, -28, 2, -24, -13, -19);
    const text = this.scene.add.text(0, -23, compactNumber(total), {
      color: '#31241b', fontSize: '10px', fontStyle: '700',
    }).setOrigin(0.5);
    const formation = this.soldiers.createFormation(isPlayer, 12);
    container.add([graphics, text, formation]);
    if (isPlayer) container.add(drawHouseSign(this.scene, houseBanner(), 18, 18).setPosition(-43, -31));
    return container;
  }

  createSelectionFlag(): Phaser.GameObjects.Container {
    return this.createFlag(this.colors.mapObjects.selected, -58, 23);
  }

  /** Uses the shared dynastic standard so atlas land flags match the ink-wash theme. */
  createPlayerLandFlag(isCapital = false, styleSeed = 0): Phaser.GameObjects.Container {
    return createPlayerLandFlag(this.scene, isCapital, styleSeed);
  }

  createCapitalHighlight(width = 90, height = 42): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(this.colors.mapObjects.selected, 0.18);
    graphics.fillEllipse(0, 4, width, height);
    graphics.lineStyle(1.5, this.colors.ink, 0.42);
    graphics.strokeEllipse(0, 4, width, height);
    return graphics;
  }

  createDestinationArrow(): Phaser.GameObjects.Container {
    return this.createFlag(this.colors.mapObjects.player, -17, 14);
  }

  createProgressBadge(x: number, y: number, progress: number, required: number, variant: ProgressBadgeVariant): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const ratio = Phaser.Math.Clamp(progress / required, 0, 1);
    const accent = variant === 'build' || variant === 'recruit' ? this.colors.mapObjects.forest : this.colors.mapObjects.player;
    const back = this.scene.add.circle(0, 0, 16, this.colors.paperLight, 0.96).setStrokeStyle(1.5, this.colors.ink, 0.85);
    const wedge = this.scene.add.graphics();
    wedge.fillStyle(accent, 0.9);
    wedge.slice(0, 0, 12, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + ratio * 360), false);
    wedge.fillPath();
    const glyph = this.scene.add.text(0, -1, variant === 'build' ? '⌁' : variant === 'siege' ? '⚔' : variant === 'recruit' ? '⚑' : '●', {
      color: '#2f261d', fontSize: '13px', fontStyle: '700',
    }).setOrigin(0.5);
    const text = this.scene.add.text(0, 22, `${Math.round(progress)}/${Math.round(required)}`, {
      color: '#f8f0d7', fontSize: '9px', fontStyle: '700', backgroundColor: '#4a3b2b', padding: { x: 3, y: 1 },
    }).setOrigin(0.5);
    container.add([back, wedge, glyph, text]);
    return container;
  }

  private createFlag(color: number, poleTop: number, width: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(1.8, this.colors.ink, 0.92);
    graphics.lineBetween(0, 8, 0, poleTop);
    graphics.fillStyle(color, 0.98);
    graphics.beginPath();
    graphics.moveTo(0, poleTop);
    graphics.lineTo(width, poleTop + 5);
    graphics.lineTo(width * 0.6, poleTop + 10);
    graphics.lineTo(width, poleTop + 15);
    graphics.lineTo(0, poleTop + 19);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(0.9, this.colors.ink, 0.72);
    graphics.strokePath();
    container.add(graphics);
    return container;
  }
}
