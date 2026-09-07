import Phaser from 'phaser';
import { GAME_HEIGHT, PLAYER_KINGDOM_ID, mapViewWidth } from '../game/constants';
import { MAP_SCALE } from '../map/hex';
import type { GameState } from '../state/types';
import { getActiveMapTheme } from './mapTheme';

export const MINIMAP_W = 88;
export const MINIMAP_H = 70;

export interface MinimapWorldInfo {
  worldWidth: number;
  worldHeight: number;
  hexOffsetX: number;
  hexOffsetY: number;
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export function renderMinimap(
  scene: Phaser.Scene,
  state: GameState,
  info: MinimapWorldInfo,
  anchorX: number,
  anchorY: number,
  onTap: (worldX: number, worldY: number) => void,
): Phaser.GameObjects.GameObject[] {
  const { worldWidth, worldHeight, hexOffsetX, hexOffsetY, scrollX, scrollY, zoom } = info;

  if (worldWidth <= 0 || worldHeight <= 0) return [];

  const scaleX = MINIMAP_W / worldWidth;
  const scaleY = MINIMAP_H / worldHeight;

  const bg = scene.add.graphics().setDepth(425);
  const { minimap } = getActiveMapTheme().palette;
  bg.fillStyle(minimap.background, 0.93);
  bg.fillRoundedRect(anchorX, anchorY, MINIMAP_W, MINIMAP_H, 5);
  bg.lineStyle(1.5, minimap.border, 0.7);
  bg.strokeRoundedRect(anchorX, anchorY, MINIMAP_W, MINIMAP_H, 5);

  const dots = scene.add.graphics().setDepth(426);

  for (const land of state.lands) {
    const visible = land.isVisible || land.ownerId === PLAYER_KINGDOM_ID;
    if (!visible) continue;

    const wx = (land.x - hexOffsetX) * MAP_SCALE;
    const wy = (land.y - hexOffsetY) * MAP_SCALE;
    const mmX = anchorX + wx * scaleX;
    const mmY = anchorY + wy * scaleY;

    let color: number;
    let alpha: number;
    let size: number;

    if (land.ownerId === PLAYER_KINGDOM_ID) {
      color = minimap.player;
      alpha = 1;
      size = 3;
    } else if (land.ownerId === 'neutral') {
      color = minimap.neutral;
      alpha = 0.45;
      size = 2;
    } else {
      color = minimap.rival;
      alpha = 0.88;
      size = 3;
    }

    dots.fillStyle(color, alpha);
    dots.fillRect(mmX - size / 2, mmY - size / 2, size, size);
  }

  // Army dots
  // One map instead of a linear scan per army: with a dozen hosts over forty-two lands the old
  // find() was an O(n²) walk on every minimap redraw.
  const landById = new Map(state.lands.map((entry) => [entry.id, entry]));
  for (const army of state.armies) {
    const land = landById.get(army.landId);
    if (!land?.isVisible) continue;
    const wx = (land.x - hexOffsetX) * MAP_SCALE;
    const wy = (land.y - hexOffsetY) * MAP_SCALE;
    const mmX = anchorX + wx * scaleX;
    const mmY = anchorY + wy * scaleY;
    dots.fillStyle(army.kingdomId === PLAYER_KINGDOM_ID ? minimap.playerArmy : minimap.rivalArmy, 1);
    dots.fillCircle(mmX, mmY, 1.5);
  }

  // Viewport rectangle
  // The uncovered view — the whole column on the phone, the map beside the column on the desktop.
  const vpW = (mapViewWidth() / zoom) * scaleX;
  const vpH = (GAME_HEIGHT / zoom) * scaleY;
  const vpX = anchorX + Phaser.Math.Clamp(scrollX * scaleX, 0, MINIMAP_W - 2);
  const vpY = anchorY + Phaser.Math.Clamp(scrollY * scaleY, 0, MINIMAP_H - 2);
  const clampedW = Math.min(vpW, anchorX + MINIMAP_W - vpX);
  const clampedH = Math.min(vpH, anchorY + MINIMAP_H - vpY);
  dots.lineStyle(1, minimap.viewport, 0.7);
  dots.strokeRect(vpX, vpY, Math.max(4, clampedW), Math.max(4, clampedH));

  // Interactive hit area
  const hit = scene.add
    .rectangle(anchorX + MINIMAP_W / 2, anchorY + MINIMAP_H / 2, MINIMAP_W, MINIMAP_H, 0xffffff, 0.001)
    .setDepth(427)
    .setInteractive({ useHandCursor: true });

  hit.on(
    'pointerdown',
    (p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      // Block MapScene's DOM pointerdown/up from treating this as a land-selection tap
      window.__suppressMapInputUntil = performance.now() + 500;
      const fracX = Phaser.Math.Clamp((p.x - anchorX) / MINIMAP_W, 0, 1);
      const fracY = Phaser.Math.Clamp((p.y - anchorY) / MINIMAP_H, 0, 1);
      onTap(fracX * worldWidth, fracY * worldHeight);
    },
  );

  hit.on(
    'pointerup',
    (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      window.__suppressMapInputUntil = performance.now() + 500;
    },
  );

  return [bg, dots, hit];
}
