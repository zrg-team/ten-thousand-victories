import { royalItemFits, royalWardrobeItem } from '../../data/royalWardrobe';
import { ownsRoyalWardrobe } from '../../state/legacy';
import type { HeroLook } from './heroLook';
import type { KingChoice } from './kingLook';

export const ROYAL_FIELDS = ['royalHat', 'royalRobe', 'royalOrnament'] as const;
export type RoyalField = typeof ROYAL_FIELDS[number];
export const royalField = (slot: string): RoyalField => slot === 'hat' ? 'royalHat' : slot === 'robe' ? 'royalRobe' : 'royalOrnament';

/** Owned IDs are stable across updates; only shop thumbnails may preview a locked item. */
export function applyRoyalWardrobe(look: HeroLook, choice: KingChoice, preview?: string): HeroLook {
  for (const field of ROYAL_FIELDS) {
    const item = royalWardrobeItem(choice[field]);
    if (!item || royalField(item.slot) !== field || !royalItemFits(item, choice)
      || (item.id !== preview && !ownsRoyalWardrobe(item.id))) continue;
    if (item.slot === 'hat') look.parts = look.parts.filter(p => !/^(hat-|topknot|bun-(?!nape)|hairpin|hair-(comb|flower|ribbon|cord))/.test(p.key));
    if (item.slot === 'robe') look.parts = look.parts.filter(p => !/^(robe-|collar-|kesa|yem|guard-|buttons-|sash-|belt-|badge-)/.test(p.key));
    if (item.slot === 'ornament') look.parts = look.parts.filter(p => !/^(sash-|belt-)/.test(p.key));
    look.parts.push({ key: item.id, tint: 'none' });
  }
  return look;
}
