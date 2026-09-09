import { addConquestUiIcon } from './conquestUiIcons';
/**
 * Ink-wash rendering for items drawn on top of the map: settlements, resource clusters
 * (farms/mines), and army/progress badges.
 *
 * Lives in its own module rather than beside the factory so that a theme renderer can extend it —
 * `DongHoMapItemRenderer` does — without the two files importing each other. A cycle there is not
 * a style problem: the subclass evaluates before its base class exists and the game fails to boot.
 */
import Phaser from 'phaser';
import { COLORS } from '../game/constants';
import { INK, brushStroke } from './inkTheme';
import { type HostKit } from './ink/devices';
import { compactNumber } from '../utils/format';
import { IsoBuildingRenderer } from './IsoBuildingRenderer';
import { SoldierRenderer } from './SoldierRenderer';
import type { LandBuildingType } from '../state/types';
import { UI_FONT } from './fonts';
import { createPlayerLandFlag } from './playerFlag';
import { drawHouseSign, houseBanner } from './ascent/houseBanner';
import type { MapItemRenderer, ProgressBadgeVariant } from './MapItemRenderer';

export class InkMapItemRenderer implements MapItemRenderer {
  private readonly buildings: IsoBuildingRenderer;
  private readonly soldiers: SoldierRenderer;

  constructor(protected readonly scene: Phaser.Scene) {
    this.buildings = new IsoBuildingRenderer(scene);
    this.soldiers = new SoldierRenderer(scene);
  }

  /** A cluster of isometric houses at a single city/shrine hex. */
  addBuildingGroup(cluster: Phaser.GameObjects.Container, x: number, y: number, isShrine: boolean, houseCount: number): void {
    this.buildings.addBuildingGroup(cluster, x, y, isShrine, houseCount);
  }

  /** Unified city cluster: all hex centers rendered as one globally Y-sorted pass with connector buildings. */
  addCityCluster(
    cluster: Phaser.GameObjects.Container,
    centers: ReadonlyArray<{ x: number; y: number }>,
    isShrine: boolean,
    kind?: 'city' | 'market' | 'shrine',
  ): void {
    this.buildings.addCityCluster(cluster, centers, isShrine, kind);
  }

  /** Ink brush-stroke wall outline around a city's contiguous hex cluster. */
  drawCityWall(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>): void {
    for (const [x1, y1, x2, y2] of edges) {
      const seed = Math.round(x1 + y1 * 3 + x2 * 7 + y2 * 11);
      brushStroke(graphics, [{ x: x1, y: y1 }, { x: x2, y: y2 }], 3.5, INK.ink, 0.8, seed);
    }
  }

  /** Small isometric cottage. */
  addCottage(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    this.buildings.addCottage(cluster, x, y, scale);
  }

  /** Small ink rice-paddy patch: wash-fill rect with furrow lines. */
  addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    this.buildings.addCropPatch(cluster, x, y, scale);
  }

  /** Farm village: surrounding crop patches, a barn, and a handful of cottages. */
  createFarmCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    return this.buildings.createFarmCluster(scale, upgradeLevel);
  }

  /** Iron mine village: an ink mound with a dark entrance, a cart, and cottages. */
  createMineCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    return this.buildings.createMineCluster(scale, upgradeLevel);
  }

  /** Small house glyphs for each constructed farm/mine/market building, used as settlement satellites. */
  createBuildingGlyph(building: LandBuildingType, x: number, y: number): Phaser.GameObjects.GameObject[] {
    return this.buildings.createBuildingGlyph(building, x, y);
  }

  /** Tiny ink traveler glyph, used to populate roads between connected settlements. */
  createTraveler(_appearanceSeed = 0, _index = 0): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();

    graphics.fillStyle(INK.ink, 0.8);
    graphics.fillRect(-0.6, -2.2, 1.2, 2.6);

    graphics.fillStyle(0xc9a37a, 1);
    graphics.fillCircle(0, -3, 1.1);

    container.add(graphics);
    return container;
  }

  /** Small ox-cart glyph, used for supply runs travelling roads between farms and cities. */
  createCart(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();

    graphics.fillStyle(INK.ink, 0.85);
    graphics.fillCircle(-3, 3, 2.2);
    graphics.fillCircle(3, 3, 2.2);

    graphics.fillStyle(0x8a6a3f, 0.95);
    graphics.fillRect(-5, -2, 10, 4);
    graphics.lineStyle(0.6, INK.ink, 0.5);
    graphics.strokeRect(-5, -2, 10, 4);

    graphics.fillStyle(0xe3d3a8, 1);
    graphics.fillCircle(-2, -4, 2.4);
    graphics.fillCircle(1.5, -4.2, 2.6);
    graphics.lineStyle(0.5, INK.ink, 0.35);
    graphics.strokeCircle(-2, -4, 2.4);
    graphics.strokeCircle(1.5, -4.2, 2.6);

    container.add(graphics);
    return container;
  }

  /** Red ink seal-stamp army marker with a troop-count glyph and a small marching soldier formation. */
  /**
   * A host's marker: troop count on a seal, over a small formation of soldiers.
   *
   * Two things have to be readable at a glance on a crowded map, and neither was. Whose army is
   * this — mine or theirs? And if theirs, *whose*? Every rival wore the same flat ink seal, so
   * four empires converging on the realm were visually one indistinguishable mass, and the
   * player's own red seal was barely brighter than any of them.
   *
   * So: rivals wear their own kingdom colour, and the player's host gets a bright ring no rival
   * ever has. Colour tells you which empire; the ring tells you it is yours, without relying on
   * the player having memorised a palette.
   */
  createArmyMarker(
    total: number, isPlayer: boolean, kingdomColor?: number, _flagSeed?: number, _kit?: HostKit,
    _drawScale?: number,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const sealColor = isPlayer ? INK.sealRed : (kingdomColor ?? INK.ink);

    if (isPlayer) {
      // Drawn first so it reads as a halo behind the seal rather than a box around it.
      container.add(
        this.scene.add.rectangle(0, -18, 50, 34, COLORS.selected, 0.22).setStrokeStyle(2.5, COLORS.selected, 0.95),
      );
    }

    const seal = this.scene.add.rectangle(0, -18, 42, 26, sealColor, 0.92)
      .setStrokeStyle(2, isPlayer ? INK.inkSoft : 0x1b1712, 0.9);
    const text = this.scene.add.text(0, -18, compactNumber(total), {
      color: '#f3ede0',
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: '700',
    }).setOrigin(0.5);
    container.add([seal, text]);

    const formation = this.soldiers.createFormation(isPlayer, 12);
    container.add(formation);

    if (isPlayer) container.add(drawHouseSign(this.scene, houseBanner(), 18, 18).setPosition(-43, -27));

    return container;
  }

  /**
   * Gold command-pennant planted beside a selected army's seal marker. Reuses the
   * same gold (`COLORS.selected`) as the map's drag/march indicators so "selected"
   * reads consistently across the UI, and a swallowtail shape keeps it visually
   * distinct from the red destination pennant (`createDestinationArrow`).
   */
  createSelectionFlag(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();

    const poleX = -18;
    const poleTop = -58;
    const poleBottom = -26;

    graphics.lineStyle(2, INK.ink, 0.9);
    graphics.lineBetween(poleX, poleBottom, poleX, poleTop);

    graphics.fillStyle(COLORS.selected, 0.95);
    graphics.beginPath();
    graphics.moveTo(poleX, poleTop);
    graphics.lineTo(poleX + 18, poleTop + 4);
    graphics.lineTo(poleX + 10, poleTop + 9);
    graphics.lineTo(poleX + 18, poleTop + 14);
    graphics.lineTo(poleX, poleTop + 18);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(0.8, INK.ink, 0.6);
    graphics.strokePath();

    container.add(graphics);
    return container;
  }

  /** Seeded dynastic standard marking land owned by the player. */
  createPlayerLandFlag(isCapital = false, styleSeed = 0): Phaser.GameObjects.Container {
    return createPlayerLandFlag(this.scene, isCapital, styleSeed);
  }

  /** Gold ink-wash base behind the player capital so it reads as the seat of power. */
  createCapitalHighlight(width = 88, height = 44): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0xf4cf27, 0.18);
    graphics.fillEllipse(0, 4, width, height);
    graphics.lineStyle(2, 0xf4cf27, 0.65);
    graphics.strokeEllipse(0, 4, width * 1.045, height * 1.09);
    graphics.lineStyle(1.2, INK.sealRed, 0.45);
    graphics.strokeEllipse(0, 4, width * 0.82, height * 0.77);
    return graphics;
  }

  /** Small ink pennant/flag, planted on a selected army's march destination. */
  createDestinationArrow(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const graphics = this.scene.add.graphics();

    graphics.lineStyle(2, INK.ink, 0.9);
    graphics.lineBetween(0, 6, 0, -16);

    graphics.fillStyle(INK.sealRed, 0.95);
    graphics.beginPath();
    graphics.moveTo(0, -16);
    graphics.lineTo(13, -11);
    graphics.lineTo(0, -6);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(0.6, INK.ink, 0.5);
    graphics.strokePath();

    container.add(graphics);
    return container;
  }

  /** Circular red ink seal with a brush-stroke progress ring, for acquisition/build orders. */
  createProgressBadge(x: number, y: number, progress: number, required: number, variant: ProgressBadgeVariant): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const ratio = Phaser.Math.Clamp(progress / required, 0, 1);
    const ringColor = variant === 'acquisition' || variant === 'siege' || variant === 'battle'
      ? INK.sealRed : INK.landForest;

    const back = this.scene.add.circle(0, 0, 17, INK.ink, 0.78).setStrokeStyle(2, ringColor, 0.95);
    const wedge = this.scene.add.graphics();
    wedge.fillStyle(ringColor, 0.88);
    wedge.slice(0, 0, 13, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + ratio * 360), false);
    wedge.fillPath();

    container.add([back, wedge]);

    const icon = { build: 'hammer', siege: 'ladder', battle: 'crossed-weapons', recruit: 'banner', acquisition: 'coin' } as const;
    container.add(addConquestUiIcon(this.scene, icon[variant], 24));

    const text = this.scene.add.text(0, 23, `${Math.round(progress)}/${Math.round(required)}`, {
      color: '#f3ede0',
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: '700',
      backgroundColor: '#2b332b',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5);
    container.add(text);

    return container;
  }
}
