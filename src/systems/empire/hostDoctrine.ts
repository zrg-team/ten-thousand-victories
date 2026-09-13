import type { KingdomPersonality } from '../../state/types';
/** Shared by the real muster and the read-only resident briefing. No random draws. */
export function doctrineHostMix(personality: KingdomPersonality | undefined): { spearmen: number; archers: number; heavy: number } {
  switch (personality) {
    case 'aggressive': return { spearmen: 0.50, archers: 0.15, heavy: 0.35 };
    case 'defensive': return { spearmen: 0.45, archers: 0.42, heavy: 0.13 };
    case 'economic':
    case 'diplomatic': return { spearmen: 0.58, archers: 0.34, heavy: 0.08 };
    default: return { spearmen: 0.60, archers: 0.28, heavy: 0.12 };
  }
}
