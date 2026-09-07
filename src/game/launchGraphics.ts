import type Phaser from 'phaser';
import { surfaceWidth, GAME_HEIGHT } from './constants';
import { maxTextureSize } from '../ui/ink/textureLimits';
import type { RungId } from './qualityRungs';

export const PROFILE_VERSION = 5;
const KEY = 'mandate:graphics:launch:v3';
export type AutoProfile = 'high' | 'medium' | 'clarity';
export interface CalibrationSample { profile: AutoProfile; frames: number; gapP90: number; workP90: number; workScale?: number }
interface Record { fingerprint: string; profile: AutoProfile; next?: AutoProfile; samples?: CalibrationSample[] }
function fingerprint(): string {
  return JSON.stringify([PROFILE_VERSION, screen.width, screen.height, window.devicePixelRatio, surfaceWidth(), GAME_HEIGHT,
    navigator.platform, navigator.userAgent, navigator.hardwareConcurrency, (navigator as Navigator & { deviceMemory?: number }).deviceMemory]);
}
export function cachedLaunchProfile(): AutoProfile | undefined {
  try { const record: Record = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (record?.fingerprint === fingerprint() && ['high', 'medium', 'clarity'].includes(record.next ?? record.profile)) return record.next ?? record.profile;
  } catch { /* unavailable or obsolete */ }
  return undefined;
}
export function rememberLaunch(profile: AutoProfile, samples?: CalibrationSample[]): void {
  try { localStorage.setItem(KEY, JSON.stringify({ fingerprint: fingerprint(), profile, samples } satisfies Record)); } catch { /* private mode */ }
}
export function recommendNextLaunch(profile: AutoProfile): void {
  try { const record: Record = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (record?.fingerprint === fingerprint()) localStorage.setItem(KEY, JSON.stringify({ ...record, next: profile }));
  } catch { /* private mode */ }
}
export function highAllowed(scene: Phaser.Scene): boolean {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  // Hints are constraints, never a substitute for timing. Unknown memory is not assumed small.
  return maxTextureSize(scene) >= 2048 && (memory === undefined || memory > 2);
}
export function selectLaunchProfile(samples: CalibrationSample[], allowHigh: boolean): AutoProfile {
  const fits = (id: RungId) => samples.some(s => s.profile === id && s.frames >= 15 && s.gapP90 <= 18.5 && s.workP90 * (s.workScale ?? 1) <= 11.7);
  return allowHigh && fits('high') ? 'high' : fits('medium') ? 'medium' : 'clarity';
}
export function percentile(samples: number[], p: number): number {
  if (!samples.length) return Infinity;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
