import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PLAYER_KINGDOM_ID } from '../game/constants';
import type { GameState, Land, ResourceKey } from '../state/types';
import { getAssignedDiplomaticHero, getBribeSuccessChance, getDiplomacyThreshold, getLandTrust, getNoblePower } from '../systems/AcquisitionSystem';
import { getAcquisitionOrder, getSiegeOrder, isAdjacent } from '../systems/LandSystem';
import { getBuildOrder } from '../systems/ResourceSystem';
import { getRecruitmentOrder } from '../systems/WarSystem';
import { ACTION_BAR_HEIGHT } from './BottomSheet';
import { InkUI, INK_UI } from './InkUI';
import { buildingLabel, heroName, landTypeLabel, resourceLabel, t } from '../i18n';
import { UI_FONT } from './fonts';

const CARD_H = 92;
const CARD_W = GAME_WIDTH - 16;
const CARD_X = 8;
export const COMPACT_CARD_Y = GAME_HEIGHT - ACTION_BAR_HEIGHT - CARD_H - 8;
type LandAction = { id: string; label: string; variant?: 'primary' | 'secondary' | 'danger' | 'disabled' };

export class LandPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly emitAction: (action: string, landId: string) => void,
  ) {}

  /** Renders a compact ~90px card above the action bar. */
  render(land: Land): Phaser.GameObjects.GameObject[] {
    const ui = new InkUI(this.scene);
    const y = COMPACT_CARD_Y;

    const ownerLabel = land.ownerId === PLAYER_KINGDOM_ID ? t('owner.yours')
      : land.ownerId === 'neutral' ? t('owner.neutral')
      : t('owner.rival');
    const borderColor = land.ownerId === PLAYER_KINGDOM_ID ? INK_UI.gold
      : land.ownerId === 'neutral' ? INK_UI.softBrush
      : INK_UI.cinnabar;

    const acquisition = getAcquisitionOrder(this.state, land.id);
    const siege = getSiegeOrder(this.state, land.id);

    const statLine = buildStatLine(land, acquisition, siege);
    const subLine = buildSubLine(land);

    const bg = ui.panel(
      { x: CARD_X, y, width: CARD_W, height: CARD_H },
      { fill: INK_UI.parchmentDark, fillShade: INK_UI.parchment, fillAlpha: 0.97, radius: 10, border: borderColor },
    );

    const nameText = this.scene.add.text(CARD_X + 12, y + 10, land.name, {
      color: INK_UI.inkText,
      fontFamily: UI_FONT,
      fontSize: '14px',
      fontStyle: 'bold',
    }).setDepth(101);

    const closeX = CARD_X + CARD_W - 20;
    const closeY = y + 20;
    const closeBg = this.scene.add.graphics().setDepth(101);
    closeBg.fillStyle(INK_UI.parchment, 0.98);
    closeBg.fillCircle(closeX, closeY, 10);
    closeBg.lineStyle(1.5, INK_UI.brush, 0.82);
    closeBg.strokeCircle(closeX, closeY, 10);

    const closeGlyph = this.scene.add.text(closeX, closeY - 1, 'x', {
      color: INK_UI.inkText,
      fontFamily: UI_FONT,
      fontSize: '12px',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(102);

    const closeHit = this.scene.add
      .circle(closeX, closeY, 13, 0xffffff, 0.001)
      .setDepth(103)
      .setInteractive({ useHandCursor: true });
    closeHit.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      window.__suppressMapInputUntil = performance.now() + 280;
    });
    closeHit.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      window.__suppressMapInputUntil = performance.now() + 280;
      this.emitAction('clear-selection', land.id);
    });

    const statusChip = this.scene.add.text(CARD_X + CARD_W - 38, y + 10, ownerLabel, {
      color: '#2a2118',
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: '700',
      backgroundColor: `#${borderColor.toString(16).padStart(6, '0')}`,
      padding: { x: 6, y: 3 },
    }).setOrigin(1, 0).setDepth(101);

    const stat1 = this.scene.add.text(CARD_X + 12, y + 34, statLine, {
      color: INK_UI.inkText,
      fontFamily: UI_FONT,
      fontSize: '12px',
    }).setDepth(101);

    const stat2 = this.scene.add.text(CARD_X + 12, y + 54, subLine, {
      color: INK_UI.mutedText,
      fontFamily: UI_FONT,
      fontSize: '11px',
    }).setDepth(101);

    const detailsBtn = ui.button(
      { x: CARD_X + CARD_W - 82, y: y + CARD_H - 28, width: 74, height: 22 },
      t('action.details'),
      () => this.emitAction('open-land-detail', land.id),
      { variant: 'secondary', fontSize: '11px' },
    );

    return [bg, nameText, closeBg, closeGlyph, closeHit, statusChip, stat1, stat2, detailsBtn];
  }

  /** Returns the full info and action buttons for the detail modal. */
  renderDetailContent(land: Land): {
    infoLines: string[];
    actions: LandAction[];
  } {
    const acquisition = getAcquisitionOrder(this.state, land.id);
    const siege = getSiegeOrder(this.state, land.id);
    const buildOrder = getBuildOrder(this.state, land.id);
    const recruitment = getRecruitmentOrder(this.state, land.id);

    const owner = this.state.kingdoms.find((k) => k.id === land.ownerId)?.name ?? t('owner.neutral');
    const outputs = formatOutputs(land);
    const terrain = formatTerrain(land);
    const buildings = land.buildings.length > 0
      ? land.buildings.map((b) => `${buildingLabel(b.type)}${b.level > 1 ? ` ${t('building.level', { level: b.level })}` : ''}`).join(', ')
      : t('building.none');

    const infoLines: string[] = [
      t('land.ownerType', { owner, type: landTypeLabel(land.type) }),
      t('land.defenseSize', { defense: land.defense, used: land.buildings.length, max: land.buildingCapacity }),
      t('land.terrain', { terrain }),
      t('land.output', { outputs }),
      t('land.buildings', { buildings }),
    ];

    if (land.ownerId === 'neutral') {
      if (land.hasVillage) {
        const trust = Math.floor(getLandTrust(land, PLAYER_KINGDOM_ID));
        const threshold = Math.ceil(getDiplomacyThreshold(land));
        const power = getNoblePower(land);
        infoLines.push(t('land.populationSoldiers', { population: land.population, soldiers: land.localSoldiers }));
        infoLines.push(t('land.nobleTrust', { power, trust, threshold }));
      } else {
        infoLines.push(t('land.wilderness'));
      }
    }

    if (siege) {
      infoLines.push(`⚔ ${t('land.underSiege', { progress: siege.progress, required: siege.required })}`);
    } else if (acquisition) {
      infoLines.push(formatAcquisitionStatus(this.state, acquisition, land));
    } else if (buildOrder) {
      infoLines.push(`🔨 ${t('land.buildingStatus', {
        kind: t(buildOrder.kind === 'upgrade' ? 'order.upgrading' : 'order.building'),
        building: buildingLabel(buildOrder.building),
        progress: buildOrder.progress,
        required: buildOrder.required,
      })}`);
    } else if (recruitment) {
      infoLines.push(`⚙ ${t('land.recruiting', { progress: recruitment.progress, required: recruitment.required })}`);
    }

    const actions = this.getActions(land, acquisition);
    return { infoLines, actions };
  }

  getActions(land: Land, acquisition = getAcquisitionOrder(this.state, land.id)): LandAction[] {
    if (getSiegeOrder(this.state, land.id)) return [];

    const selectedArmy = this.state.selectedArmyId
      ? this.state.armies.find((a) => a.id === this.state.selectedArmyId)
      : undefined;

    const armyAdjacentToLand = Boolean(
      selectedArmy && isAdjacent(this.state, selectedArmy.landId, land.id),
    );
    const armyInAdjacentOwnedLand = Boolean(
      selectedArmy &&
      this.state.lands.find((l) => l.id === selectedArmy.landId)?.ownerId === PLAYER_KINGDOM_ID &&
      this.state.lands.find((l) => l.id === selectedArmy.landId)?.neighbors.includes(land.id),
    );

    if (land.ownerId === 'neutral') {
      if (acquisition) {
        return armyAdjacentToLand && land.hasVillage ? [{ id: 'preview', label: t('action.conquer'), variant: 'danger' }] : [];
      }

      if (!land.hasVillage) {
        const acts: LandAction[] = [
          { id: 'settle', label: t('action.settle'), variant: 'primary' },
        ];
        if (armyAdjacentToLand) acts.push({ id: 'preview', label: t('action.marchIn'), variant: 'secondary' });
        return acts;
      }

      const bribeChance = Math.round(getBribeSuccessChance(this.state, land) * 100);
      const acts: LandAction[] = [];

      if (armyInAdjacentOwnedLand) {
        acts.push({ id: 'intimidate', label: t('action.intimidate'), variant: 'primary' });
        acts.push({ id: 'bribe', label: t('action.bribe', { chance: bribeChance }), variant: 'secondary' });
        if (armyAdjacentToLand) acts.push({ id: 'preview', label: t('action.conquer'), variant: 'danger' });
      } else if (armyAdjacentToLand) {
        acts.push({ id: 'bribe', label: t('action.bribe', { chance: bribeChance }), variant: 'secondary' });
        acts.push({ id: 'preview', label: t('action.conquer'), variant: 'danger' });
      } else {
        const freeHero = this.state.heroes.find((h) => !h.assignedTo);
        const trust = Math.floor(getLandTrust(land, PLAYER_KINGDOM_ID));
        const threshold = Math.ceil(getDiplomacyThreshold(land));
        acts.push({ id: 'bribe', label: t('action.bribe', { chance: bribeChance }), variant: 'secondary' });
        acts.push(freeHero
          ? { id: 'diplomatize', label: t('action.assignHero', { trust, threshold }), variant: 'primary' }
          : { id: 'diplomatize', label: t('action.needHero'), variant: 'disabled' });
      }
      return acts;
    }

    if (land.ownerId === PLAYER_KINGDOM_ID) {
      return [{ id: 'open-build', label: t('action.build'), variant: 'primary' }];
    }

    return armyAdjacentToLand ? [{ id: 'preview', label: t('action.battle'), variant: 'danger' }] : [];
  }
}

function buildStatLine(
  land: Land,
  acquisition: ReturnType<typeof getAcquisitionOrder>,
  siege: ReturnType<typeof getSiegeOrder>,
): string {
  if (siege) return `⚔ ${t('land.siegeShort', { progress: siege.progress, required: siege.required })}`;
  if (acquisition) {
    switch (acquisition.method) {
      case 'bribe': return `✓ ${t('land.bribeJoiningSoon')}`;
      case 'diplomacy': return `📜 ${t('land.diplomatBuilding')}`;
      case 'intimidation': return `⚔ ${t('land.pressure', { progress: Math.floor(acquisition.progress) })}`;
      case 'settle': return `🏕 ${t('land.settlers', { progress: acquisition.progress, required: acquisition.required })}`;
      case 'occupy': return t('land.movingIn');
      default: return t('land.acquiring', { progress: acquisition.progress, required: acquisition.required });
    }
  }
  if (land.ownerId === 'neutral') {
    return land.hasVillage
      ? t('land.defPopPower', { defense: land.defense, population: land.population, power: getNoblePower(land) })
      : t('land.defWilderness', { defense: land.defense });
  }
  return t('land.defSize', { defense: land.defense, used: land.buildings.length, max: land.buildingCapacity });
}

function buildSubLine(land: Land): string {
  if (land.ownerId === 'neutral' && land.hasVillage) {
    const trust = Math.floor(getLandTrust(land, PLAYER_KINGDOM_ID));
    return t('land.trustSoldiers', { trust, soldiers: land.localSoldiers });
  }
  const outputs = formatOutputs(land);
  return outputs ? t('land.output', { outputs }) : land.special.slice(0, 52);
}

function formatAcquisitionStatus(
  state: GameState,
  order: ReturnType<typeof getAcquisitionOrder>,
  land: Land,
): string {
  if (!order) return '';
  switch (order.method) {
    case 'bribe': return `✓ ${t('land.bribeNextSeason')}`;
    case 'diplomacy': {
      const trust = Math.floor(getLandTrust(land, PLAYER_KINGDOM_ID));
      const hero = getAssignedDiplomaticHero(state, order);
      return hero
        ? `📜 ${t('land.heroTrust', { hero: heroName(hero), trust, required: order.required })}`
        : `📜 ${t('land.missingHeroTrust', { trust, required: order.required })}`;
    }
    case 'intimidation': return `⚔ ${t('land.armyPressure', { progress: Math.floor(order.progress) })}`;
    case 'settle': return `🏕 ${t('land.settlersEnRoute', { progress: order.progress, required: order.required })}`;
    case 'occupy': return t('land.movingIn');
    default: return t('land.acquiring', { progress: order.progress, required: order.required });
  }
}

function formatOutputs(land: Land): string {
  const parts = Object.entries(land.outputs)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `+${v} ${resourceLabel(k as ResourceKey)}`);
  return parts.length === 0 ? t('building.noneYet') : parts.slice(0, 3).join(', ');
}

function formatTerrain(land: Land): string {
  const grass = land.terrainSummary.plains + land.terrainSummary.fields + land.terrainSummary.riceFields + land.terrainSummary.forest;
  const ore = land.terrainSummary.mountains + land.terrainSummary.hills;
  return t('terrain.summary', {
    grass,
    ore,
    water: land.terrainSummary.water,
    city: land.terrainSummary.fortress + land.terrainSummary.shrine,
  });
}
