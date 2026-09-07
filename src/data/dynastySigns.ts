/** Stable cosmetic IDs shared by the sign, flag and saved founder. */
export const DYNASTY_SIGNS = [
  'crown', 'banner', 'blade', 'grain', 'branch', 'tortoise',
  'lotus', 'lacBird', 'dragon', 'phoenix', 'tiger', 'buffalo', 'carp', 'mountain', 'wave', 'star',
] as const;
export type DynastySign = (typeof DYNASTY_SIGNS)[number];

/** One-time prices in the existing banked Legacy (dynasty) currency. */
export const SIGN_COSTS: Record<DynastySign, number> = {
  crown: 0, banner: 0, blade: 0, grain: 0, branch: 80, tortoise: 120,
  lotus: 60, lacBird: 100, dragon: 240, phoenix: 220, tiger: 160,
  buffalo: 80, carp: 100, mountain: 60, wave: 60, star: 140,
};

export function dynastySign(id: string): DynastySign | undefined {
  return (DYNASTY_SIGNS as readonly string[]).includes(id) ? id as DynastySign : undefined;
}
