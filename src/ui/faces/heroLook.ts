import {
  garmentsFor, hairOrnamentFor, headwearFor, manHairFor, manKnotFor,
  rankWings, robeColour, womanHairStylesFor,
} from './wardrobe';
import { HAIRS, ROBES, SKINS, shade, type FacePalette } from './palette';
import { dynastyRankRarity, getDynasty } from '../../state/dynasty';
import type { Hero, HeroEra } from '../../state/types';
import type { FaceTintSlot } from './parts.generated';
import { ACTIVE_HERO_FACE_ART_PACK } from './artPack';
import { applyHistoricalPortrait, historicalPortraitFor } from './historicalPortraits';

/**
 * Turns a hero into a stack of portrait parts.
 *
 * The one rule this file exists to enforce: **the seed never decides who someone is.** Sex,
 * monastic vows, role and rank come off the hero's own data and choose a *wardrobe*; only then
 * does the hash pick within it. What that buys is not merely correctness — before this, every
 * one of the five heroes the game names as a woman rendered with facial hair, and the Trúc Lâm
 * Zen master had a full head of hair under a cap — it is also that a portrait becomes readable:
 * a glance at the roster tells you what each person does and roughly when they lived.
 *
 * Era matters as much as role. The roster spans many centuries, while each era pool is a
 * simplified game interpretation. The 1744 Đàng Trong reform was regional, not an immediate
 * replacement of every crossed-lapel garment throughout Vietnam.
 */

export interface HeroLookPart {
  key: string;
  tint: FaceTintSlot;
}

export interface HeroLook {
  parts: HeroLookPart[];
  palette: FacePalette;
  /** Resolved identity, exposed so the UI can label or debug a portrait. */
  sex: 'man' | 'woman';
  monastic: boolean;
  era: HeroEra;
  age: 'young' | 'prime' | 'elder';
  rank: number;
}

const RARITY_RANK: Record<Hero['rarity'], number> = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };
const PLATE = ['plate-common', 'plate-rare', 'plate-epic', 'plate-legendary'];
const RANK_SEAL = [undefined, 'rank-rare', 'rank-epic', 'rank-legendary'];

/** Eras a hero without an explicit one may be drawn in, weighted toward the mode's own period. */
const COMMON_ERAS: HeroEra[] = ['ly', 'tran', 'tran', 'le', 'le', 'dinh', 'nguyen'];

// ── seeding ─────────────────────────────────────────────────────────────────
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function pick<T>(items: readonly T[], next: () => number): T {
  return items[Math.floor(next() * items.length) % items.length];
}

/**
 * Last-resort sex inference, for heroes created without the field.
 *
 * Vietnamese honorifics state it plainly — Bà and Nữ and Công Chúa are not ambiguous — so
 * reading the name is far better than rolling for it. Authored heroes should still set `sex`;
 * this only stops an unlabelled one from defaulting a princess into a beard.
 */
function inferSex(hero: Hero): 'man' | 'woman' {
  if (hero.sex) return hero.sex;
  const name = hero.name.toLocaleLowerCase('vi');
  if (/(^|\s)(bà|nữ|công chúa|hoàng hậu|thái hậu|phu nhân|cô|chị|mẹ)(\s|$)/.test(name)) return 'woman';
  return 'man';
}


/** Headwear that covers the whole head, so no long hair may be drawn under it. */
export const COVERING_HATS = new Set([
  'hat-moqua', 'hat-moqua-brown', 'hat-moqua-tied', 'hat-vanhday', 'hat-khanxep', 'hat-veil',
]);

const SLIM_NECK_HEADS = new Set([
  'head-narrow', 'head-soft', 'head-heart', 'head-tapered', 'head-fine', 'head-slim', 'head-long',
]);
const BROAD_NECK_HEADS = new Set([
  'head-broad', 'head-square', 'head-angular', 'head-wide', 'head-full', 'head-blunt', 'head-stern',
]);

/** A neck is anatomy, not an independent style roll: its width follows the jaw family. */
export function neckForHead(headKey: string): 'neck-slim' | 'neck' | 'neck-broad' {
  if (SLIM_NECK_HEADS.has(headKey)) return 'neck-slim';
  if (BROAD_NECK_HEADS.has(headKey)) return 'neck-broad';
  return 'neck';
}

// Feature pools. These carry no historical claim — unlike a hat, a nose is not an office — so
// they are the widest lists in the wardrobe and are shared across every era.
export const BROWS_MAN = [
  'brow-flat', 'brow-angled', 'brow-thick', 'brow-straight', 'brow-bushy', 'brow-heavy',
  'brow-low', 'brow-sharp', 'brow-short', 'brow-arched',
] as const;
export const BROWS_WOMAN = [
  'brow-arched', 'brow-thin', 'brow-soft', 'brow-sparse', 'brow-raised', 'brow-flat',
  'brow-short', 'brow-straight',
] as const;
export const EYES = [
  'eyes-almond', 'eyes-wide', 'eyes-narrow', 'eyes-hooded', 'eyes-round', 'eyes-upturned',
  'eyes-downturned', 'eyes-sharp', 'eyes-gentle', 'eyes-deepset', 'eyes-bright', 'eyes-crescent', 'eyes-keen',
] as const;
export const EYES_ELDER = [
  'eyes-hooded', 'eyes-narrow', 'eyes-tired', 'eyes-deepset', 'eyes-crescent', 'eyes-almond', 'eyes-gentle',
] as const;
export const NOSES = [
  'nose-straight', 'nose-long', 'nose-soft', 'nose-broad', 'nose-snub', 'nose-aquiline',
  'nose-narrow', 'nose-flat', 'nose-round', 'nose-fine', 'nose-strong', 'nose-short',
] as const;
export const MOUTHS = [
  'mouth-neutral', 'mouth-smile', 'mouth-firm', 'mouth-wide', 'mouth-small', 'mouth-downturned',
  'mouth-pursed', 'mouth-thin', 'mouth-full', 'mouth-grim', 'mouth-soft', 'mouth-broad-smile',
] as const;
export const LACQUERED_MOUTHS = ['mouth-lacquered', 'mouth-lacquered-smile', 'mouth-lacquered-firm'] as const;
// Empty entries are most of these pools on purpose: a clean-shaven prime-age man is the
// commonest face in the roster, and a beard on every one of them reads as a costume shop.
export const BEARDS_PRIME = [
  '', '', '', 'beard-moustache', 'beard-moustache-thin', 'beard-goatee', 'beard-stubble',
  'beard-chinstrap', 'beard-full-short', 'beard-moustache-wide',
] as const;
export const BEARDS_ELDER = [
  '', 'beard-long', 'beard-full', 'beard-threepart', 'beard-forked', 'beard-wispy',
  'beard-patriarch', 'beard-goatee-long', 'beard-moustache', 'beard-threepart',
] as const;
export const EARRINGS_PLAIN = ['earring-jade', 'earring-gold', 'earring-pearl'] as const;
export const EARRINGS_FINE = ['earring-drop', 'earring-jade', 'earring-gold', 'earring-pearl'] as const;

/**
 * Head shapes an identity admits — a narrower jaw on a woman, a slighter one on an elder.
 *
 * Exported because the Coronation's face stepper has to page *this* list rather than a copy: a
 * second head pool would drift from this one and put faces in the creator that no generated
 * champion can wear, which is the same class of bug as a raw part-list picker.
 */
export function headPoolFor(woman: boolean, age: 'young' | 'prime' | 'elder'): readonly string[] {
  if (woman) return ['head-soft', 'head-narrow', 'head-oval', 'head-heart', 'head-tapered', 'head-fine', 'head-round'];
  if (age === 'elder') return ['head-narrow', 'head-oval', 'head-soft', 'head-long', 'head-slim', 'head-fine'];
  return ['head-oval', 'head-broad', 'head-square', 'head-angular', 'head-wide', 'head-full', 'head-blunt', 'head-stern', 'head-round', 'head-long'];
}

/**
 * The Coronation's king, when this hero is him.
 *
 * Keyed on the **name**, not on the id: the throne's hero carries the constant id `'king'`, so
 * anything keyed on that id is keyed on nothing — the same trap `heroBio` is written around and
 * the reason the seed path below hashes `king:${name}`. A hero who merely shares the founder's
 * name and is not the throne's own is vanishingly unlikely and would, at worst, be drawn as the
 * king he is named after; keying on the id alone would instead dress *every* run's king in the
 * made look even after an ascension replaced him.
 */
function madeKingLook(hero: Hero): HeroLook | undefined {
  const store = getDynasty();
  const founder = store.founder;
  const look = founder?.look;
  if (!founder || !look) return undefined;
  if (hero.id !== founder.id && hero.name !== founder.name) return undefined;

  // **The rank is the house's, not the hero's.** It is what makes the crown step's promise true:
  // the same face, the plate stepping Common → Rare → Epic → Legendary and the dragonfly wings
  // lengthening as the ledger fills. Rank-carrying parts are therefore rebuilt here rather than
  // read from the store — see `storedLook`, which strips them on the way in.
  const rank = RARITY_RANK[dynastyRankRarity(store.level)];
  const parts: HeroLookPart[] = [{ key: PLATE[rank], tint: 'none' }];
  for (const part of look.parts) {
    // The store keeps `tint` as a plain string so `state/` never has to import the part
    // manifest; the renderer looks each key up and drops what it does not know, so an
    // unrecognised slot costs one layer rather than a throw.
    parts.push({ key: rankWings(part.key, rank), tint: part.tint as FaceTintSlot });
  }
  const seal = RANK_SEAL[rank];
  if (seal) parts.push({ key: seal, tint: 'none' });

  return {
    parts,
    palette: {
      skin: look.skin,
      skinShadow: shade(look.skin, -30),
      skinLight: shade(look.skin, 20),
      hair: look.hair,
      robe: look.robe,
      robeDark: shade(look.robe, -34),
      robeLight: shade(look.robe, 30),
    },
    sex: founder.sex,
    monastic: founder.monastic === true,
    era: (founder.era as HeroEra) ?? 'le',
    age: 'prime',
    rank,
  };
}

// ── the resolver ────────────────────────────────────────────────────────────
export function resolveHeroLook(hero: Hero): HeroLook {
  // A king the player *made* is not a king the seed may re-roll.
  const made = madeKingLook(hero);
  if (made) return made;
  // The throne's hero keeps the id `king` across every run, so seeding the portrait on the id
  // alone drew the same face for Ngô Quyền and for Minh Mạng. Anything whose id is fixed by
  // role rather than by person has to be seeded on the person.
  const historical = ACTIVE_HERO_FACE_ART_PACK.id === 'dongho-v2' ? historicalPortraitFor(hero) : undefined;
  const next = seededRandom(hashString(historical ? `historical:${historical.identity}` : hero.id === 'king' ? `king:${hero.name}` : hero.id));
  const pick2 = <T,>(items: readonly T[]): T => pick(items, next);
  const woman = (historical?.sex ?? inferSex(hero)) === 'woman';
  const monastic = historical?.monastic ?? hero.monastic === true;
  const rank = RARITY_RANK[hero.rarity] ?? 0;
  const era: HeroEra = historical?.era ?? hero.era ?? pick(COMMON_ERAS, next);
  const age: HeroLook['age'] = historical?.age ?? (monastic ? 'elder' : pick(['young', 'prime', 'prime', 'elder'] as const, next));

  const skin = pick(SKINS, next);
  const hairBase = pick(HAIRS, next);
  // Grey comes with age, not with the dice.
  const hair = age === 'elder' ? shade(hairBase, 74) : hairBase;
  const robe = robeColour(hero.type, woman, monastic, era, rank);

  const parts: HeroLookPart[] = [{ key: PLATE[rank], tint: 'none' }];
  if (historical) {
    // A separate assembly path keeps the same person's anatomy stable when their
    // title, gameplay role or rarity changes. Clothing never consumes this seed.
    const heads = age === 'young' ? ['head-oval', 'head-soft', 'head-round'] : headPoolFor(woman, age);
    const head = pick(heads, next);
    parts.push({ key: neckForHead(head), tint: 'skinShadow' }, { key: head, tint: 'skin' },
      { key: pick(woman ? BROWS_WOMAN : BROWS_MAN, next), tint: 'hair' },
      { key: pick(age === 'elder' ? EYES_ELDER : EYES, next), tint: 'none' },
      { key: pick(NOSES, next), tint: 'skinShadow' },
      { key: pick(MOUTHS, next), tint: 'none' });
    const seal = RANK_SEAL[rank];
    if (seal) parts.push({ key: seal, tint: 'none' });
    return applyHistoricalPortrait({ parts, sex: woman ? 'woman' : 'man', monastic, era, age, rank,
      palette: { skin, skinShadow: shade(skin, -30), skinLight: shade(skin, 20), hair,
        robe, robeDark: shade(robe, -34), robeLight: shade(robe, 30) } }, historical);
  }
  parts.push(...garmentsFor(era, woman, monastic, hero.type, rank, pick2));
  // Preserve the old neck roll's random slot so correcting anatomy does not reshuffle every
  // downstream eye, mouth, hat and hairstyle in already-authored portraits.
  next();
  const ears = monastic ? 'ears-long' : pick(['ears', 'ears', 'ears-small'] as const, next);

  // Head shape carries sex and age before any feature does — a narrower jaw on a woman, a
  // slighter one on an elder — which is what stops a roster reading as one man in many hats.
  const head = pick(headPoolFor(woman, age), next);
  parts.push({ key: neckForHead(head), tint: 'skinShadow' });
  // The long lobe is iconography, not a face shape: it marks a Buddhist teacher and nobody else.
  parts.push({ key: ears, tint: 'skinShadow' });
  parts.push({ key: head, tint: 'skin' });

  // Hair, then whatever goes over it. A covering hat hides everything but the crown, so the
  // hair is chosen *after* the hat rather than before it — otherwise a woman in a khăn mỏ quạ
  // gets a full fall of hair drawn under a scarf that reaches her shoulders.
  const hat = monastic
    ? pick(['scalp', 'scalp', 'scalp', 'hat-muni'] as const, next)
    : rankWings(pick(headwearFor(era, hero.type, woman, rank), next), rank);
  if (monastic) {
    parts.push({ key: 'scalp-shaven', tint: 'skinLight' });
    parts.push({ key: rank >= 2 ? 'scalp-dots-nine' : 'scalp-dots', tint: 'skinShadow' });
  } else if (woman) {
    const covered = COVERING_HATS.has(hat);
    // Hair is selected as a complete historical style. A front, rear mass and pin are a single
    // physical arrangement; rolling them independently created the old curtain-plus-ellipse
    // combinations and could place a crown comb beside a nape bun.
    const hairStyle = pick(womanHairStylesFor(era, age, covered), next);
    for (const key of hairStyle.parts) parts.push({ key, tint: 'hair' });
    // A crown, coronet or nón already fixes and ornaments the hair. A second free-standing pin
    // behind it creates collisions, while a simple cloth band can still coexist with a cord.
    if (!hat || hat.startsWith('hat-band')) {
      const ornament = pick(hairOrnamentFor(rank, hairStyle.ornament), next);
      if (ornament) parts.push({ key: ornament, tint: 'none' });
    }
  } else {
    if (hat === 'scalp-shaven') {
      // Trần visitors repeatedly described shaven men; this is a period marker, not monastic
      // identity, so it carries no urna dots and wears the ordinary skin palette.
      parts.push({ key: 'scalp-shaven', tint: 'skinLight' });
    } else {
      parts.push({ key: pick(manHairFor(era, age), next), tint: 'hair' });
      // The búi tó only shows under a wound/closed cloth or no hat at all; lacquered court caps
      // cover it. Lý closed wrapping is represented by khăn vuông, not Nguyễn khăn vấn.
      if (hat === '' || hat.startsWith('hat-khanvan') || hat === 'hat-khandong' || hat === 'hat-khanvuong') {
        const knot = pick(manKnotFor(era), next);
        parts.push({ key: knot, tint: 'hair' });
        // The pin goes through a crown knot. A nape knot has nothing up there to hold it.
        if (era === 'dinh' && knot !== 'knot-nape') parts.push({ key: 'hairpin', tint: 'none' });
      }
    }
  }
  if (hat && hat !== 'scalp' && hat !== 'scalp-shaven') parts.push({ key: hat, tint: 'none' });

  // Khuyên tai were worn by both sexes in the older centuries and narrowed to women under the
  // Nguyễn, so the era gates them before the seed does.
  const earringChance = woman ? (rank >= 2 ? 0.62 : 0.34) : era === 'nguyen' ? 0 : 0.12;
  if (next() < earringChance) {
    parts.push({ key: pick(rank >= 2 ? EARRINGS_FINE : EARRINGS_PLAIN, next), tint: 'none' });
  }

  // Features.
  parts.push({ key: pick(woman ? BROWS_WOMAN : BROWS_MAN, next), tint: 'hair' });
  parts.push({ key: pick(age === 'elder' ? EYES_ELDER : EYES, next), tint: 'none' });
  parts.push({ key: pick(NOSES, next), tint: 'skinShadow' });

  // Nhuộm răng đen: lacquered teeth were a beauty standard for centuries, commonest among
  // women and in the older eras, and fading under the Nguyễn. Ăn trầu — the betel quid —
  // stains the lips carmine and is the other half of the same habit.
  const lacquered = era === 'nguyen' ? next() > 0.82 : woman ? next() > 0.45 : age === 'elder' ? next() > 0.4 : next() > 0.8;
  if (lacquered) {
    parts.push({ key: pick(LACQUERED_MOUTHS, next), tint: 'none' });
  } else if (next() > 0.9) {
    parts.push({ key: 'mouth-betel', tint: 'none' });
  } else {
    parts.push({ key: pick(MOUTHS, next), tint: 'none' });
  }

  // Facial hair is gated on identity, never rolled for it.
  if (!woman && !monastic && age !== 'young') {
    const pool = age === 'elder' ? BEARDS_ELDER : BEARDS_PRIME;
    const beard = pick(pool, next);
    if (beard) parts.push({ key: beard, tint: 'hair' });
  }

  if (age === 'elder') parts.push({ key: next() > 0.5 ? 'mark-age-deep' : 'mark-age', tint: 'skinShadow' });
  if (hero.type === 'general' && next() > 0.62) {
    parts.push({ key: pick(['mark-scar', 'mark-scar-cheek', 'mark-scar-brow'] as const, next), tint: 'skinShadow' });
  }
  // A quiet mark most people carry, and none of it is a rank signal.
  const blemish = pick(['', '', '', 'mark-mole', 'mark-freckles', 'mark-dimples'] as const, next);
  if (blemish) parts.push({ key: blemish, tint: 'skinShadow' });
  // Tây Sơn field paint: the one marking here that belongs to a single campaign.
  if (era === 'tayson' && hero.type === 'general' && next() > 0.75) parts.push({ key: 'mark-warpaint', tint: 'none' });

  // Court tattoos were the price of entry to the Lý and Trần palaces — borne by emperors,
  // every mandarin, and the women of the harem alike.
  if ((era === 'ly' || era === 'tran') && rank >= 1) {
    parts.push({ key: next() > 0.5 ? 'mark-tattoo' : 'mark-tattoo-wave', tint: 'none' });
    if (rank >= 2) parts.push({ key: next() > 0.5 ? 'mark-tattoo-court' : 'mark-tattoo-drum', tint: 'none' });
  }

  const seal = RANK_SEAL[rank];
  if (seal) parts.push({ key: seal, tint: 'none' });

  const look: HeroLook = {
    parts,
    palette: {
      skin,
      skinShadow: shade(skin, -30),
      skinLight: shade(skin, 20),
      hair,
      robe,
      robeDark: shade(robe, -34),
      robeLight: shade(robe, 30),
    },
    sex: woman ? 'woman' : 'man',
    monastic,
    era,
    age,
    rank,
  };
  return look;
}
