import {
  BEARDS_ELDER, BEARDS_PRIME, BROWS_MAN, BROWS_WOMAN, COVERING_HATS, EARRINGS_FINE, EARRINGS_PLAIN,
  EYES, EYES_ELDER, LACQUERED_MOUTHS, MOUTHS, NOSES, headPoolFor, neckForHead,
  type HeroLook, type HeroLookPart,
} from './heroLook';
import {
  garmentsFor, hairOrnamentFor, headwearFor, manHairFor, manKnotFor, rankWings, womanHairStylesFor,
  type WomanHairStyle,
} from './wardrobe';
import { HAIRS, ROBES, SKINS, shade } from './palette';
import { deedDone } from '../../state/cabinet';
import { dynastyRankRarity, type DynastyLook } from '../../state/dynasty';
import { GIVEN_MAN, GIVEN_WOMAN, MIDDLE_MAN, MIDDLE_WOMAN } from '../../data/heroNames';
import type { HeroEra } from '../../state/types';
import type { DynastyFounder } from '../../state/dynasty';
import { heroFaceHeadwearSupported } from './artPack';
import { applyRoyalWardrobe } from './royalWardrobe';
import { DYNASTY_SIGNS, type DynastySign } from '../../data/dynastySigns';
import { ownsDynastySign } from '../../state/legacy';

/**
 * The Coronation's model: a dozen numbers in, a finished king out.
 *
 * The portrait system was written for *generated* champions — pools filtered by era, sex and
 * office, then a hash picking inside them — and that architecture is already a creator's. The
 * seed is the only thing choosing. This file replaces the seed with a thumb, and nothing else:
 * every list below is a `wardrobe.ts` pool function called with the player's own identity, never
 * a raw part list. That is not a stylistic preference. A picker that let any part meet any part
 * would un-fix the exact defect `heroLook.ts` exists to fix — every named woman once rendered
 * with a beard — and would break the era law the wardrobe documents line by line: a Tran hat
 * never meets a Nguyen collar here because the pool function refuses to offer it.
 *
 * Base identity stays free. Optional royal parts are permanent cosmetic Legacy purchases.
 */

export type KingRegister = 'court' | 'war';
export type KingAge = 'young' | 'prime' | 'elder';

/**
 * What the player chose, as small integers.
 *
 * Stored beside the resolved look rather than instead of it: the parts are what renders (so a
 * pool that gains an entry between builds cannot shift a king's face), and this is what lets
 * the Temple reopen the steppers exactly where they were left. Indices are taken modulo their
 * pool at read time, so a stale index is a different-but-legal choice, never a crash.
 */
export interface KingChoice {
  royalHat?: string;
  royalRobe?: string;
  royalOrnament?: string;
  sex: 'man' | 'woman';
  era: HeroEra;
  /** Court dress (minister pools) or a field harness (general pools) — the wardrobe's `type`. */
  register: KingRegister;
  age: KingAge;
  hat: number;
  hair: number;
  /** One index paging head, brow, eyes, nose and mouth together. Five steppers is not a phone. */
  face: number;
  beard: number;
  /** Seeds the garment pools' own picks, so paging this walks the era's real collars. */
  dress: number;
  skin: number;
  hairColour: number;
  robe: number;
}

/** The courts a king may dress in — the six the wardrobe actually knows. */
export const KING_ERAS: readonly HeroEra[] = ['dinh', 'ly', 'tran', 'le', 'tayson', 'nguyen'];

/** Robe colours offered, in the order the swatch row prints them. */
export const KING_ROBES: readonly number[] = [
  ROBES.vermilion, ROBES.azure, ROBES.jade, ROBES.cham, ROBES.nau, ROBES.ochre,
];

/**
 * The royal ho, each with the century its forces are styled in and the field its banner opens on.
 *
 * Royal only, at launch: the name chosen here becomes the house on the Tong Pha sheet and the
 * line the Chronicle names for every reign after this one, and a house called Nha Pham is a
 * claim the record does not support. `armyEra` styles the *forces* — minted commanders draw
 * toward it — and is deliberately not the king's own dress: a Le house may crown a king who
 * wears the Tran court's cap, exactly as a founder may.
 */
export interface RoyalHouse {
  /** The ho itself. Never translated — it is a name. */
  surname: string;
  armyEra: HeroEra;
  field: number;
}

export const ROYAL_HOUSES: readonly RoyalHouse[] = [
  { surname: 'Ngô', armyEra: 'dinh', field: ROBES.cham },
  { surname: 'Đinh', armyEra: 'dinh', field: ROBES.ochre },
  { surname: 'Lê', armyEra: 'le', field: ROBES.azure },
  { surname: 'Lý', armyEra: 'ly', field: ROBES.vermilion },
  { surname: 'Trần', armyEra: 'tran', field: ROBES.jade },
  { surname: 'Hồ', armyEra: 'tran', field: ROBES.nau },
  { surname: 'Mạc', armyEra: 'le', field: ROBES.cham },
  { surname: 'Trịnh', armyEra: 'le', field: ROBES.nau },
  { surname: 'Nguyễn', armyEra: 'nguyen', field: ROBES.vermilion },
];

/** Sign pigments, also used for the border when mounted on a ceremonial flag. */
export const BANNER_TRIMS: readonly number[] = [0xd8b45a, 0xf3e6c4, 0x2a2118, 0xaa3a2c, 0x6f8f64];

/**
 * Stable saved emblem ids, now drawn by bannerEmblems rather than the tactical card glyphs.
 * The legacy `crown` slot presents a bronze drum. Other card uses of crown are unchanged.
 * These are freely chosen game motifs, not attributed historical coats of arms.
 * Extra signs are earned or purchased permanently — see `emblemLocked`.
 */
export const BANNER_EMBLEMS = DYNASTY_SIGNS;
export type BannerEmblem = DynastySign;

// -- locks -------------------------------------------------------------------
/**
 * What is locked, and by what.
 *
 * The rule, and it is the whole reason locks are allowed inside a creator at all: **ornament,
 * never identity.** Sex, court, face, hair, a full court dress and a banner are free from the
 * first second — a player who cannot make the king they meant to make has been sold a menu, not
 * a creator. What is earned is flourish: a war harness, jade, extra signs. Nothing locked
 * has power, so a lock here is a promise rather than a paywall, and each one names a system the
 * player has not met yet — which is the creator's second job, indexing the game.
 */
export function warRegisterLocked(): boolean {
  return !deedDone('wave-ten');
}

export function jadeLocked(): boolean {
  return !deedDone('first-jade');
}

export function emblemLocked(emblem: string): boolean {
  return !ownsDynastySign(emblem);
}

/** Parts held back until the house has forged a jade seal. Ornament only, by construction. */
function jadeHeld(key: string): boolean {
  return key.endsWith('-jade') || key.startsWith('hat-crown-') || key === 'hat-coronet-jade';
}

// -- pools -------------------------------------------------------------------
/** The wardrobe's own `type` for a register. Nothing else in this file invents an office. */
export function registerType(register: KingRegister): 'general' | 'minister' {
  return register === 'war' ? 'general' : 'minister';
}

/** The rank the wardrobe dresses the king at — the *house's* level, so the wardrobe widens. */
export function kingRank(level: number): number {
  const rarity = dynastyRankRarity(level);
  return rarity === 'Legendary' ? 3 : rarity === 'Epic' ? 2 : rarity === 'Rare' ? 1 : 0;
}

/** Headwear this identity may wear, jade held back until it is earned. */
export function kingHatPool(choice: KingChoice, rank: number): string[] {
  const pool = headwearFor(choice.era, registerType(effectiveRegister(choice)), choice.sex === 'woman', rank)
    .filter((key) => !(jadeLocked() && jadeHeld(key)) && heroFaceHeadwearSupported(key));
  // Every pool the wardrobe returns is weighted by repetition — a Le minister's list holds the
  // dragonfly cap twice because he wears it more often than anything else. Weighting is right
  // for a seed and wrong for a stepper: pressing the arrow twice to reach the same hat reads as
  // a broken control, so the picker takes the distinct set and keeps the pool's own order.
  return Array.from(new Set(pool.length > 0 ? pool : ['']));
}

/** The register actually in force — a locked war harness silently dresses as court. */
export function effectiveRegister(choice: KingChoice): KingRegister {
  return choice.register === 'war' && warRegisterLocked() ? 'court' : choice.register;
}

/** A man's hair, or a woman's complete style, for this era and age. */
export function kingHairPool(choice: KingChoice, hat: string): string[] | WomanHairStyle[] {
  if (choice.sex === 'woman') {
    return dedupeStyles(womanHairStylesFor(choice.era, choice.age, COVERING_HATS.has(hat)));
  }
  return Array.from(new Set(manHairFor(choice.era, choice.age)));
}

function dedupeStyles(styles: WomanHairStyle[]): WomanHairStyle[] {
  const seen = new Set<string>();
  const out: WomanHairStyle[] = [];
  for (const style of styles) {
    const key = style.parts.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(style);
  }
  return out;
}

/** Facial hair a man of this age may wear. Gated on identity, never rolled for it. */
export function kingBeardPool(choice: KingChoice): string[] {
  if (choice.sex === 'woman' || choice.age === 'young') return [''];
  return Array.from(new Set(choice.age === 'elder' ? BEARDS_ELDER : BEARDS_PRIME));
}

/** How many distinct faces the face stepper walks before it repeats. */
export const KING_FACE_COUNT = 24;
/** How many distinct dresses the dress stepper walks. */
export const KING_DRESS_COUNT = 8;

// -- the builder --------------------------------------------------------------
function seeded(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function at<T>(items: readonly T[], index: number): T {
  return items[((index % items.length) + items.length) % items.length];
}

/** The default king the creator opens on — finished and handsome, never blank. */
export function rollKingChoice(next: () => number = Math.random): KingChoice {
  const woman = next() < 0.5;
  return {
    sex: woman ? 'woman' : 'man',
    era: at(KING_ERAS, Math.floor(next() * KING_ERAS.length)),
    register: 'court',
    age: at(['young', 'prime', 'prime', 'elder'] as const, Math.floor(next() * 4)),
    hat: Math.floor(next() * 97),
    hair: Math.floor(next() * 97),
    face: Math.floor(next() * KING_FACE_COUNT),
    beard: Math.floor(next() * 97),
    dress: Math.floor(next() * KING_DRESS_COUNT),
    skin: Math.floor(next() * SKINS.length),
    hairColour: Math.floor(next() * HAIRS.length),
    robe: Math.floor(next() * KING_ROBES.length),
  };
}

/** The hat this choice resolves to, so the caption and the hair pool agree with the portrait. */
export function kingHat(choice: KingChoice, rank: number): string {
  return rankWings(at(kingHatPool(choice, rank), choice.hat), rank);
}

/** The garment stack this choice resolves to — the wardrobe's own picks, seeded by `dress`. */
export function kingGarments(choice: KingChoice, rank: number): HeroLookPart[] {
  const next = seeded(choice.dress * 2654435761 + (choice.era.length << 8) + (choice.sex === 'woman' ? 7 : 3));
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length) % items.length];
  return garmentsFor(
    choice.era,
    choice.sex === 'woman',
    false,
    registerType(effectiveRegister(choice)),
    rank,
    pick,
  );
}

const PLATE = ['plate-common', 'plate-rare', 'plate-epic', 'plate-legendary'];
const RANK_SEAL = [undefined, 'rank-rare', 'rank-epic', 'rank-legendary'];

/**
 * The king, composed.
 *
 * Follows `resolveHeroLook`'s own order and its rules — hair after the hat, because a covering
 * scarf hides everything but the crown; grey with age, not with the dice; facial hair gated on
 * identity — because the two must produce the same *kind* of portrait or a made king would
 * stand out beside a generated champion as obviously assembled.
 */
export function buildKingLook(choice: KingChoice, rank: number, preview?: string): HeroLook {
  const woman = choice.sex === 'woman';
  const age = choice.age;
  const face = seeded(choice.face * 2246822519 + 101);
  const pickFace = <T,>(items: readonly T[]): T => items[Math.floor(face() * items.length) % items.length];

  const skin = at(SKINS, choice.skin);
  const hairBase = at(HAIRS, choice.hairColour);
  const hair = age === 'elder' ? shade(hairBase, 74) : hairBase;
  const robe = at(KING_ROBES, choice.robe);

  const parts: HeroLookPart[] = [{ key: PLATE[rank], tint: 'none' }];
  parts.push(...kingGarments(choice, rank));

  const head = pickFace(headPoolFor(woman, age));
  parts.push({ key: neckForHead(head), tint: 'skinShadow' });
  parts.push({ key: 'ears', tint: 'skinShadow' });
  parts.push({ key: head, tint: 'skin' });

  const hat = kingHat(choice, rank);
  if (hat === 'scalp-shaven') {
    parts.push({ key: 'scalp-shaven', tint: 'skinLight' });
  } else if (woman) {
    const style = at(kingHairPool(choice, hat) as WomanHairStyle[], choice.hair);
    for (const key of style.parts) parts.push({ key, tint: 'hair' });
    if (!hat || hat.startsWith('hat-band')) {
      const ornaments = hairOrnamentFor(rank, style.ornament)
        .filter((key) => !(jadeLocked() && jadeHeld(key)));
      const ornament = ornaments.length > 0 ? pickFace(ornaments) : '';
      if (ornament) parts.push({ key: ornament, tint: 'none' });
    }
  } else {
    parts.push({ key: at(kingHairPool(choice, hat) as string[], choice.hair), tint: 'hair' });
    if (hat === '' || hat.startsWith('hat-khanvan') || hat === 'hat-khandong' || hat === 'hat-khanvuong') {
      parts.push({ key: pickFace(manKnotFor(choice.era)), tint: 'hair' });
      if (choice.era === 'dinh') parts.push({ key: 'hairpin', tint: 'none' });
    }
  }
  if (hat && hat !== 'scalp' && hat !== 'scalp-shaven') parts.push({ key: hat, tint: 'none' });

  // Khuyen tai narrowed to women under the Nguyen, so the era gates them before anything else.
  if (woman && rank >= 1) {
    const earrings = (rank >= 2 ? EARRINGS_FINE : EARRINGS_PLAIN).filter((key) => !(jadeLocked() && jadeHeld(key)));
    if (earrings.length > 0 && face() < 0.5) parts.push({ key: pickFace(earrings), tint: 'none' });
  }

  parts.push({ key: pickFace(woman ? BROWS_WOMAN : BROWS_MAN), tint: 'hair' });
  parts.push({ key: pickFace(age === 'elder' ? EYES_ELDER : EYES), tint: 'none' });
  parts.push({ key: pickFace(NOSES), tint: 'skinShadow' });
  // Nhuom rang den: a beauty standard for centuries, fading under the Nguyen.
  const lacquered = choice.era !== 'nguyen' && face() > (woman ? 0.45 : 0.78);
  parts.push({ key: lacquered ? pickFace(LACQUERED_MOUTHS) : pickFace(MOUTHS), tint: 'none' });

  const beard = woman ? '' : at(kingBeardPool(choice), choice.beard);
  if (beard) parts.push({ key: beard, tint: 'hair' });

  if (age === 'elder') parts.push({ key: 'mark-age', tint: 'skinShadow' });
  // Court tattoos were the price of entry to the Ly and Tran palaces — emperors included.
  if ((choice.era === 'ly' || choice.era === 'tran') && rank >= 1) {
    parts.push({ key: 'mark-tattoo', tint: 'none' });
  }
  const seal = RANK_SEAL[rank];
  if (seal) parts.push({ key: seal, tint: 'none' });

  return applyRoyalWardrobe({
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
    sex: choice.sex,
    monastic: false,
    era: choice.era,
    age,
    rank,
  }, choice, preview);
}

/**
 * The look, flattened for the store. Colours only — the ramps are derived on the way back.
 *
 * The plate and the rank seal are **left out on purpose**. They are the dynasty's rank, not the
 * king's face, and the whole promise the crown step makes is that this portrait grows: baking
 * the founding plate into the stored parts would freeze the badge at Common for ever and turn
 * the ladder on the confirm screen into a lie. `resolveHeroLook` re-adds both from the house's
 * current level every time it draws him.
 */
export function storedLook(look: HeroLook, choice: KingChoice): DynastyLook {
  return {
    parts: look.parts
      .filter((part) => !/^plate-|^rank-/.test(part.key))
      .map((part) => ({ key: part.key, tint: part.tint })),
    skin: look.palette.skin,
    hair: look.palette.hair,
    robe: look.palette.robe,
    choice: { ...choice },
  };
}

/** The stepper positions a stored look was made from, when it still carries them. */
export function choiceFromStored(stored: DynastyLook | undefined): KingChoice | undefined {
  const raw = stored?.choice;
  if (!raw) return undefined;
  const number = (key: string, fallback: number): number => {
    const value = raw[key];
    return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  };
  const era = raw.era;
  const sex = raw.sex;
  const register = raw.register;
  const age = raw.age;
  return {
    sex: sex === 'woman' ? 'woman' : 'man',
    era: KING_ERAS.includes(era as HeroEra) ? era as HeroEra : 'le',
    register: register === 'war' ? 'war' : 'court',
    age: age === 'young' || age === 'elder' ? age : 'prime',
    hat: number('hat', 0),
    hair: number('hair', 0),
    face: number('face', 0),
    beard: number('beard', 0),
    dress: number('dress', 0),
    skin: number('skin', 0),
    hairColour: number('hairColour', 0),
    robe: number('robe', 0),
    ...(typeof raw.royalHat === 'string' ? { royalHat: raw.royalHat } : {}),
    ...(typeof raw.royalRobe === 'string' ? { royalRobe: raw.royalRobe } : {}),
    ...(typeof raw.royalOrnament === 'string' ? { royalOrnament: raw.royalOrnament } : {}),
  };
}

// -- the name, the house and the mark -----------------------------------------
/**
 * A given name for the king — tên đệm plus tên, and no office.
 *
 * Composed from `heroNames.ts`'s own components rather than typed. There is **no text input
 * anywhere in this game**: it is a Phaser canvas, and a soft keyboard over one is the classic
 * mobile-web trap — the field scrolls out from under the caret, the viewport resizes mid-gesture,
 * and on some Android shells the composition events never arrive at all. A composer needs no
 * keyboard, cannot produce an empty or abusive name, and always works.
 */
export function rollGivenName(sex: 'man' | 'woman', next: () => number = Math.random): string {
  const middle = at(sex === 'woman' ? MIDDLE_WOMAN : MIDDLE_MAN, Math.floor(next() * 40));
  const given = at(sex === 'woman' ? GIVEN_WOMAN : GIVEN_MAN, Math.floor(next() * 200));
  return `${middle} ${given}`;
}

/** The house a họ names, for the sheet and the Chronicle. Not translated — it is a name. */
export function houseName(surname: string): string {
  return surname;
}

/**
 * The founder record the store keeps, assembled from the four steps.
 *
 * `id` is the constant `'king'` on purpose and not by accident: it is what `resolveHeroLook` and
 * `generateKingHero` both key on, and it is the same constant the throne's hero has carried
 * since the mode shipped. The *name* is what actually distinguishes one king from another — the
 * documented trap this whole subsystem is written around.
 */
export function makeFounder(opts: {
  choice: KingChoice;
  house: RoyalHouse;
  givenName: string;
  banner: { field: number; trim: number; emblem: string };
  level: number;
}): DynastyFounder {
  const rank = kingRank(opts.level);
  const look = buildKingLook(opts.choice, rank);
  return {
    id: 'king',
    name: `${opts.house.surname} ${opts.givenName}`,
    givenName: opts.givenName,
    // The wardrobe register the king dresses in, not a gameplay office: the throne's hero is a
    // `general` in every run and stays one. This field only tells the portrait which pools to use.
    type: registerType(effectiveRegister(opts.choice)),
    sex: opts.choice.sex,
    era: opts.choice.era,
    armyEra: opts.house.armyEra,
    look: storedLook(look, opts.choice),
    banner: opts.banner,
  };
}

/**
 * A complete, handsome king, rolled — what Skip writes.
 *
 * Skip must leave the store in *exactly* the shape a finished rite does. A skip that wrote
 * nothing would mean every screen downstream needs a second code path for the uncrowned house,
 * and the one that eventually forgot it would be the blank silhouette on the Tông Phả sheet.
 */
export function rollFounder(level: number, next: () => number = Math.random): DynastyFounder {
  const choice = rollKingChoice(next);
  const house = at(ROYAL_HOUSES, Math.floor(next() * ROYAL_HOUSES.length));
  const emblems = BANNER_EMBLEMS.filter((emblem) => !emblemLocked(emblem));
  return makeFounder({
    choice,
    house,
    givenName: rollGivenName(choice.sex, next),
    banner: {
      field: house.field,
      // Never the house's own colour: the trim list and the house fields share cinnabar, and a
      // rolled vermilion-on-vermilion banner has no visible border and no visible emblem. The
      // drawing guards this with contrasting seams, but a skip should not lean on that guard —
      // what it writes is what the Temple reopens on, and it should open on something good.
      trim: at(BANNER_TRIMS.filter((colour) => colour !== house.field),
        Math.floor(next() * BANNER_TRIMS.length)),
      emblem: at(emblems, Math.floor(next() * emblems.length)),
    },
    level,
  });
}
