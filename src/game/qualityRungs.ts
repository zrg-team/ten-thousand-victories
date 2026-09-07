/** Fixed session profiles. Auto may select High, Balanced (medium), or Clarity. */
import type { GraphicsQuality } from './graphicsQuality';

export type RungId = 'high' | 'medium' | 'medium-lite' | 'low' | 'low-30' | 'clarity';

export interface Rung {
  id: RungId;
  /** Drawing-buffer multiplier (capped by the device ratio downstream). */
  scale: 1 | 2 | 3;
  /** Whether the paper sheet shows. */
  paper: boolean;
  /** Resolution of cached world chunks, in texels per design unit (device-capped). */
  bakeScale: number;
  /** Whether settlement ink renders live (vector-crisp) instead of baked. */
  liveSettlementInk: boolean;
  /** Multiplier on landscape scatter counts. */
  scatter: number;
  /** Below this map zoom the small live detail drops; undefined keeps it all. */
  lodZoomBelow?: number;
  lodDropsLabels: boolean;
  /** The pacing target while on this rung. */
  fps: 30 | 40 | 60;
}

/** Softer legacy profiles remain available to explicit diagnostic callers only. */
export const RUNGS: Rung[] = [
  { id: 'high', scale: 3, paper: true, bakeScale: 2, liveSettlementInk: true, scatter: 1.25, lodDropsLabels: false, fps: 60 },
  { id: 'medium', scale: 2, paper: true, bakeScale: 1.25, liveSettlementInk: false, scatter: 1, lodZoomBelow: 0.85, lodDropsLabels: false, fps: 60 },
  { id: 'clarity', scale: 2, paper: false, bakeScale: 1.25, liveSettlementInk: false, scatter: 0.8, lodZoomBelow: 1, lodDropsLabels: false, fps: 40 },
  { id: 'medium-lite', scale: 2, paper: false, bakeScale: 0.75, liveSettlementInk: false, scatter: 0.8, lodZoomBelow: 0.85, lodDropsLabels: false, fps: 60 },
  { id: 'low', scale: 1, paper: false, bakeScale: 0.5, liveSettlementInk: false, scatter: 0.6, lodZoomBelow: 0.85, lodDropsLabels: true, fps: 60 },
  { id: 'low-30', scale: 1, paper: false, bakeScale: 0.5, liveSettlementInk: false, scatter: 0.6, lodZoomBelow: 0.85, lodDropsLabels: true, fps: 30 },
];

export const RUNG_STORAGE_KEY = 'mandate:graphics:rung:v1';

export function rungById(id: string | null | undefined): Rung | undefined {
  return RUNGS.find((rung) => rung.id === id);
}

/** The rung a player-facing tier stands on when nothing has forced it lower. */
export function rungForTier(tier: GraphicsQuality): Rung {
  return rungById(tier === 'high' ? 'high' : tier === 'medium' ? 'medium' : 'low') ?? RUNGS[0];
}

/** Legacy callers get their explicit/default tier; obsolete automatic records are ignored. */
export function startingRung(args: {
  explicitTier?: GraphicsQuality;
  defaultTier: GraphicsQuality;
  devicePixelRatio: number;
  persisted?: string | null;
}): { rung: Rung; ceiling: Rung } {
  const chosen = rungForTier(args.explicitTier ?? args.defaultTier);
  return { rung: chosen, ceiling: chosen };
}
