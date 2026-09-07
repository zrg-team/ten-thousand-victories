/** Explicit benchmark URL only. Uses production systems rather than importing /src in the browser. */
import { advanceAscentTick } from '../systems/ascent/AscentTick';
import { resolveAscentPrompt } from '../systems/ascent/AscentResolver';
import { buildDistrictBuilding, progressBuildOrders } from '../systems/ResourceSystem';
import { portraitCacheStats } from '../ui/FaceRenderer';
import { fightRound } from '../systems/ascent/BattleSystem';
import type { GameState, LandBuildingType } from '../state/types';
export function installPerformanceBench(): void {
  if (!new URLSearchParams(location.search).has('bench')) return;
  const state = (): GameState => { if (!window.__mandateState) throw new Error('Start a benchmark run first'); return window.__mandateState; };
  window.__performanceBench = {
    tick: () => advanceAscentTick(state()),
    resolve: (choice: string) => resolveAscentPrompt(state(), choice),
    build: (land: string, type: LandBuildingType) => buildDistrictBuilding(state(), land, type),
    progressBuild: () => progressBuildOrders(state()),
    portraits: portraitCacheStats,
    fightRound: () => fightRound(state()),
  };
}
declare global { interface Window { __performanceBench?: {
  tick(): void; resolve(choice: string): boolean; build(land: string, type: LandBuildingType): boolean;
  progressBuild(): boolean; portraits: typeof portraitCacheStats; fightRound(): void;
} } }
