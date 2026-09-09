import type Phaser from 'phaser';
import { surfaceWidth, GAME_HEIGHT } from './constants';
import { maxTextureSize } from '../ui/ink/textureLimits';
import type { RungId } from './qualityRungs';
import { isDesktopPlatform } from '../platform/layout';

// 6: phones stopped calibrating onto High (see `highAllowed`); every cached launch record from
// before that is re-measured once.
export const PROFILE_VERSION = 6;
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
  //
  // A phone never calibrates onto High; it can still choose it in Settings. The probe below is
  // CPU-bound — 1,250 stamps and 144 ink patches for 700 ms — and any current phone passes it,
  // but what High then costs on a 390x844 sheet at pixel ratio 3 is fill: a 1170x2544 drawing
  // buffer (3.0 MP, 2.25x Balanced's 780x1696) under two full-screen paper quads and MSAA, ground
  // and fog tiles at 2 texels a unit (60.6 MB against 31.2 MB on Balanced, and every repaint of
  // them 2x the pixels), scatter x1.25 and the settlement ink live. 1.0.1 shipped phones on
  // Balanced with a ladder beneath it; 1.1.0 was the first release to calibrate them onto High,
  // and the report that came back was low FPS on an iPhone 17. The probe cannot see a phone
  // GPU's fill rate from a desktop, so the platform decides: computers earn High by timing,
  // phones by asking.
  return isDesktopPlatform() && maxTextureSize(scene) >= 2048 && (memory === undefined || memory > 2);
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
