import type Phaser from 'phaser';
import { isDesktopPlatform } from '../../platform/layout';
import { createAscentGameState } from '../../state/GameState';
import { requestGuidedRun } from '../../state/tour';

export type GuideCopilot = 'conquest' | 'battle' | 'menu' | 'classic';

/** Start only the walkthrough the reader chose, without clearing their other tour preferences. */
export function launchGuideCopilot(scene: Phaser.Scene, kind: GuideCopilot): void {
  if (kind === 'conquest') {
    const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    if (isDesktopPlatform() && state.ascent) state.ascent.hardcore = true;
    requestGuidedRun();
    scene.scene.start('ConquestScene', { state });
    return;
  }
  if (kind === 'battle') {
    scene.scene.start('BattleArenaScene', { guidedCopilot: true });
    return;
  }
  scene.scene.start('MenuScene', {
    mode: kind === 'classic' ? 'classic' : 'main',
    replayCopilot: true,
  });
}
