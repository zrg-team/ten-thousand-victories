import inventory from './royalWardrobe.json';
import type { HeroEra } from '../state/types';

export type RoyalSlot = 'hat' | 'robe' | 'ornament';
export interface RoyalWardrobeItem {
  id: string;
  era: HeroEra;
  slot: RoyalSlot;
  name: string;
  cost: number;
  sex: 'any' | 'man' | 'woman';
}
export const ROYAL_WARDROBE = inventory as RoyalWardrobeItem[];
export const royalWardrobeItem = (id: string | undefined): RoyalWardrobeItem | undefined =>
  ROYAL_WARDROBE.find(item => item.id === id);
export const royalItemFits = (item: RoyalWardrobeItem, choice: { era: HeroEra; sex: string }): boolean =>
  item.era === choice.era && (item.sex === 'any' || item.sex === choice.sex);
