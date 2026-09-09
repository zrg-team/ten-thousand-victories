import type {
  Hero,
  HeroType,
  LandBuildingType,
  LandType,
  PoliticsCard,
  PoliticsChoice,
  ResourceKey,
  Season,
} from '../state/types';
import { enAscent, viAscent } from './catalogs/ascent';
import { enCore, viCore } from './catalogs/core';
import { enCoronation, viCoronation } from './catalogs/coronation';
import { enEmpire, viEmpire } from './catalogs/empire';
import { enGuide, viGuide } from './catalogs/guide';
import { enHeroBios, viHeroBios } from './catalogs/heroBios';
import { enHeroes, viHeroes } from './catalogs/heroes';
import { viPolitics } from './catalogs/politics';
import { enTips, viTips } from './catalogs/tips';
import { enWorld, viWorld } from './catalogs/world';

export type LanguageCode = 'en' | 'vi';

export const LANGUAGE_STORAGE_KEY = 'mandate:language:v1';
export const DEFAULT_LANGUAGE: LanguageCode = 'vi';

type TranslationParams = Record<string, string | number>;

const en = {
  ...enCore,
  ...enWorld,
  ...enHeroes,
  ...enHeroBios,
  ...enEmpire,
  ...enAscent,
  ...enCoronation,
  ...enGuide,
  ...enTips,
} as const;

const vi = {
  ...viCore,
  ...viWorld,
  ...viHeroes,
  ...viHeroBios,
  ...viEmpire,
  ...viAscent,
  ...viCoronation,
  ...viGuide,
  ...viTips,
} satisfies Record<keyof typeof en, string>;

export type TranslationKey = keyof typeof en;

const catalogs = { en, vi };
const listeners = new Set<(language: LanguageCode) => void>();

validateCatalogs();

/**
 * Cached, because `t()` calls this on every translation and it read localStorage every time —
 * measured at 191–566 synchronous storage reads per simulation tick, and one per label on every
 * HUD refresh. `localStorage.getItem` is a synchronous IPC on some browsers. `setLanguage` below
 * is the only writer, so the cache can never go stale inside a session.
 */
let cachedLanguage: LanguageCode | undefined;

export function getLanguage(): LanguageCode {
  if (cachedLanguage !== undefined) {
    return cachedLanguage;
  }
  if (typeof localStorage === 'undefined') {
    return DEFAULT_LANGUAGE;
  }
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  cachedLanguage = stored === 'vi' || stored === 'en' ? stored : DEFAULT_LANGUAGE;
  return cachedLanguage;
}

export function setLanguage(language: LanguageCode): void {
  cachedLanguage = language;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
  for (const listener of listeners) {
    listener(language);
  }
}

export function subscribeLanguageChange(listener: (language: LanguageCode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: TranslationKey, params: TranslationParams = {}): string {
  return translateKey(key, undefined, params);
}

export function interpolate(template: string, params: TranslationParams = {}): string {
  // Hyphens count. `\w` does not include one, so `{chinh-su}` never substituted and the
  // Chronicle's identity line rendered as `Chính sử {chinh-su} · Dã sử {da-su}` — at the head of
  // the recorded endings and again at the Reckoning. The only hyphenated tokens in the whole
  // catalogue are those three source classes, so nothing else changes shape.
  return template.replace(/\{([\w-]+)\}/g, (match, name) => {
    const value = params[name];
    return typeof value === 'undefined' ? match : String(value);
  });
}

export function seasonLabel(season: Season): string {
  return t(`season.${season}` as TranslationKey);
}

export function resourceLabel(resource: ResourceKey): string {
  return t(`resource.${resource}` as TranslationKey);
}

export function buildingLabel(building: LandBuildingType): string {
  return t(`building.${building}` as TranslationKey);
}

export function buildBuildingLabel(building: LandBuildingType): string {
  return t('building.buildLabel', { building: buildingLabel(building) });
}

export function landTypeLabel(type: LandType): string {
  return t(`landType.${type}` as TranslationKey);
}

export function heroTypeLabel(type: HeroType): string {
  return t(`heroType.${type}` as TranslationKey);
}

export function rarityLabel(rarity: Hero['rarity']): string {
  return t(`rarity.${rarity}` as TranslationKey);
}

export function politicsTypeLabel(type: PoliticsCard['type']): string {
  return t(`politics.type.${type}` as TranslationKey);
}

export function tickLabel(count: number): string {
  return t(count === 1 ? 'tick.one' : 'tick.many');
}

export function formatResourceList(values: Partial<Record<ResourceKey, number>>): string {
  return Object.entries(values)
    .map(([key, value]) => `${value} ${resourceLabel(key as ResourceKey)}`)
    .join(', ');
}

export function heroName(hero: Hero): string {
  if (hero.id === 'king') {
    return hero.name;
  }
  return translateKey(heroKey(hero.id, 'name'), hero.name);
}

export function heroDescription(hero: Hero): string {
  return translateKey(heroKey(hero.id, 'description'), hero.description);
}

export function heroEffect(hero: Hero): string {
  return translateKey(heroKey(hero.id, 'effect'), hero.effect);
}

export function politicsTitle(card: PoliticsCard): string {
  return getLanguage() === 'vi' ? viPolitics[card.id]?.title ?? card.title : card.title;
}

export function politicsDescription(card: PoliticsCard): string {
  return getLanguage() === 'vi' ? viPolitics[card.id]?.description ?? card.description : card.description;
}

export function politicsChoiceLabel(choice: PoliticsChoice): string {
  return getLanguage() === 'vi' ? findPoliticsChoice(choice.id)?.label ?? choice.label : choice.label;
}

export function politicsChoiceDescription(choice: PoliticsChoice): string {
  return getLanguage() === 'vi' ? findPoliticsChoice(choice.id)?.description ?? choice.description : choice.description;
}

function translateKey(key: string, fallback?: string, params: TranslationParams = {}): string {
  const language = getLanguage();
  const catalog = catalogs[language] as Record<string, string>;
  const englishCatalog = en as Record<string, string>;
  const template = catalog[key] ?? englishCatalog[key] ?? fallback ?? key;
  return interpolate(template, params);
}

function heroKey(heroId: string, field: 'name' | 'description' | 'effect' | 'bio'): string {
  return `heroes.${heroId}.${field}`;
}

/** How many pooled bios each office has. Must match `catalogs/heroBios.ts`. */
const BIOS_PER_ROLE = 25;

/**
 * The champion's life story.
 *
 * People out of the record carry their own; everyone else draws one from their office's pool
 * by a hash of the id, which keeps a champion's past identical in every run — the Codex is a
 * collection, and a collection whose entries rewrite themselves is not one.
 */
export function heroBio(hero: Hero): string {
  const catalog = en as Record<string, string>;
  const dedicated = heroKey(hero.id, 'bio');
  if (catalog[dedicated]) return translateKey(dedicated);

  let hash = 2166136261;
  for (let index = 0; index < hero.id.length; index += 1) {
    hash ^= hero.id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return translateKey(`heroes.bio.${hero.type}.${(hash >>> 0) % BIOS_PER_ROLE}`);
}

function findPoliticsChoice(choiceId: string): { label: string; description: string } | undefined {
  for (const card of Object.values(viPolitics)) {
    const choice = card.choices[choiceId];
    if (choice) {
      return choice;
    }
  }
  return undefined;
}

function validateCatalogs(): void {
  const englishKeys = Object.keys(en);
  const vietnameseKeys = Object.keys(vi);
  const uniqueEnglishKeys = new Set(englishKeys);
  const uniqueVietnameseKeys = new Set(vietnameseKeys);

  if (englishKeys.length !== uniqueEnglishKeys.size || vietnameseKeys.length !== uniqueVietnameseKeys.size) {
    throw new Error('Localization catalogs contain duplicate keys after merge.');
  }

  for (const key of englishKeys) {
    if (!(key in vi)) {
      throw new Error(`Missing Vietnamese translation for "${key}".`);
    }
  }
}
