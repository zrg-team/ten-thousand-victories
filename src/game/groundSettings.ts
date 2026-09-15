/** Grass tile images are a separate preference from buildings, trees and map life. */
const STORAGE_KEY = 'mandate:tile-assets:v1';
let enabled: boolean | undefined;

export function tileAssetsEnabled(): boolean {
  if (enabled !== undefined) return enabled;
  try { enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; }
  catch { enabled = true; }
  return enabled;
}

export function setTileAssetsEnabled(value: boolean): void {
  enabled = value;
  try { localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off'); }
  catch { /* Keep the choice for this session when storage is unavailable. */ }
}
