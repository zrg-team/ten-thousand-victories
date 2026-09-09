/** Portrait art is versioned independently of the map. Existing saves only store part IDs. */
export type HeroFaceArtPackId = 'legacy' | 'dongho-v1' | 'dongho-v2';
export const DEFAULT_HERO_FACE_ART_PACK: HeroFaceArtPackId = 'dongho-v2';
const STORAGE_KEY = 'van-thang:hero-face-art';

export const HERO_FACE_ART_PACKS = {
  legacy: { id: 'legacy', texture: 'face:atlas', image: 'faces/atlas.svg', atlas: 'faces/atlas.json' },
  'dongho-v1': {
    id: 'dongho-v1', texture: 'face:atlas:dongho-v1',
    image: 'faces-dongho-v1/atlas.webp', atlas: 'faces-dongho-v1/atlas.json',
  },
  'dongho-v2': {
    id: 'dongho-v2', texture: 'face:atlas:dongho-v2',
    image: 'faces-dongho-v2/atlas.webp', atlas: 'faces-dongho-v2/atlas.json',
  },
} as const;

function isPack(value: unknown): value is HeroFaceArtPackId {
  return value === 'legacy' || value === 'dongho-v1' || value === 'dongho-v2';
}

/** URL override is temporary; a persisted selection takes effect on the next page load. */
export function getHeroFaceArtPackId(): HeroFaceArtPackId {
  if (typeof window !== 'undefined') {
    const query = new URLSearchParams(window.location.search).get('heroArt');
    if (isPack(query)) return query;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isPack(stored)) return stored;
    } catch { /* Private browsing can deny storage; the default still works. */ }
  }
  const configured = import.meta.env.VITE_HERO_FACE_ART_PACK;
  return isPack(configured) ? configured : DEFAULT_HERO_FACE_ART_PACK;
}

export function setHeroFaceArtPack(id: HeroFaceArtPackId): void {
  if (!isPack(id)) throw new Error(`Unknown hero face art pack: ${id}`);
  window.localStorage.setItem(STORAGE_KEY, id);
}

/** Loader, renderer and creator share the same selection until the next page load. */
export const ACTIVE_HERO_FACE_ART_PACK = HERO_FACE_ART_PACKS[getHeroFaceArtPackId()];

/** Do not offer a creator step that the selected renderer intentionally cannot show. */
export function heroFaceHeadwearSupported(key: string): boolean {
  return ACTIVE_HERO_FACE_ART_PACK.id === 'legacy' || !/^hat-coronet(?:-|$)|^hat-crown-/.test(key);
}
