import type { FacePartDef } from './parts.generated';
import type { HeroLookPart } from './heroLook';

export interface FittedFacePart extends FacePartDef {
  /** Normalized source interval. Only wings and separated ear pairs need slices. */
  crop?: { left: number; right: number; top?: number; bottom?: number };
}

/**
  * The jaw of the head every face part is drawn against.
  *
  * `build-faces.mjs` authors the canonical head as 58×78 centred on −12, which puts `CHIN` at 27 —
  * and `head-oval`, the canonical head part, measures to the same 27 once its 2px crop padding is
  * taken off. Features are positioned against that number, so it is the one a fit measures from.
  */
const CANONICAL_CHIN = 27;

// Measured opaque forehead edges at y=-35 in the committed generated head PNGs.
// Canvas widths include transparent padding and are not anatomical attachment widths.
const FOREHEAD: Record<string, [number, number]> = {
  'head-oval': [-26, 26], 'head-narrow': [-23.7, 23.3],
  'head-broad': [-30.3, 29], 'head-square': [-30, 29.7],
  'head-soft': [-25, 24.7], 'head-round': [-28, 28.3],
  'head-long': [-24.7, 24.7], 'head-heart': [-30.7, 29.7],
  'head-angular': [-24.7, 24.7], 'head-wide': [-32, 31],
  'head-slim': [-21.7, 21.3], 'head-full': [-33.3, 32],
  'head-tapered': [-28, 28], 'head-blunt': [-32, 31],
  'head-fine': [-21, 20.7], 'head-stern': [-26, 26],
};

// Authored attachment landmarks in the source design coordinates: left/right of
// the head-facing band, then the center-front lower edge. Exclude knots, tails,
// wings and broad nón rims from the fitted contact width.
export const DONGHO_HAT_CONTACTS: Record<string, [number, number, number]> = {
  'hat-khanvan': [-32, 32, -39.3], 'hat-khanvan-tall': [-32, 32, -37],
  'hat-khanvan-low': [-32, 32, -39.3], 'hat-khanvan-brown': [-32, 32, -36.3],
  'hat-khanvan-indigo': [-32, 32, -39],
  'hat-khandong': [-33, 33, -38.7], 'hat-khandong-jewel': [-33, 33, -38.7],
  'hat-khandong-gold': [-33, 33, -38.3], 'hat-khanxep': [-33, 33, -38.3],
  'hat-khanvuong': [-30, 27, -40.7],
  'hat-dinhtu': [-28, 27, -33.7], 'hat-dinhtu-streamers': [-28, 27, -34.7],
  'hat-phocdau-short': [-22, 23, -37.3], 'hat-phocdau-long': [-26, 23, -37.3],
  'hat-phocdau-grand': [-24, 29, -37.3], 'hat-xungthien': [-29, 22, -37.3],
  'hat-osa': [-24, 24, -37.3], 'hat-binhdinh': [-23, 23, -39.7],
  'hat-tamson': [-26, 27, -37.3], 'hat-duongcan': [-20, 19, -39.3],
  'hat-muni': [-32, 32, -31.3],
  'hat-helm': [-32, 32, -36.3], 'hat-helm-plume': [-32, 32, -36.3],
  'hat-helm-horned': [-32, 32, -36.3], 'hat-helm-lamellar': [-32, 32, -36.3],
  'hat-helm-daumau': [-29, 29, -36.3], 'hat-helm-leather': [-32, 32, -36.3],
  'hat-helm-cheeks': [-34, 34, -37.8], 'hat-helm-crest': [-32, 32, -36.3],
  'hat-helm-dinh': [-32, 32, -36.3],
  'hat-non': [-32, 32, -39.3], 'hat-non-chop': [-31, 31, -39.3],
  'hat-non-dau': [-30, 30, -38.3], 'hat-non-quaithao': [-35, 35, -47],
  'hat-non-batam': [-34, 34, -39.3], 'hat-non-worker': [-32, 32, -37.3],
  'hat-moqua': [-32, 32, -31.3], 'hat-moqua-brown': [-32, 31, -32],
  'hat-moqua-tied': [-31, 32, -35.7], 'hat-vanhday': [-34, 34, -32.3],
  'hat-veil': [-32, 32, -29.3],
  'hat-band': [-27, 28, -33.7], 'hat-band-cloth': [-27, 28, -33.3],
  'hat-band-warrior': [-27, 28, -35], 'hat-band-gold': [-27, 28, -33],
  'hat-fur': [-34, 34, -36.3],
};

/**
 * The broad leaf hats, fitted as a brim over the head rather than a band around it: the conical
 * nón lá, and the flat nón ba tầm, whose inner ring seats a disc wider than the shoulders.
 */
const NON_LA = new Set(['hat-non', 'hat-non-chop', 'hat-non-worker', 'hat-non-batam']);
/** Brim growth over the contact-band fit; the cap keeps the rim inside the ±66 cartouche. */
const NON_LA_BRIM = 1.55, NON_LA_MAX_W = 128;
/** Front of the rim: over the hairline, clear of the common brows (most top out at −31…−29). */
const NON_LA_RIM_Y = -31;

// Measured band contacts in the generated royal PNGs, in their part coordinates.
// Wings and a wrap's side knot are decoration, not part of the head opening.
export const ROYAL_HAT_CONTACTS: Record<string, [number, number, number]> = {
  'royal-dinh-hat-1': [-30, 30, -35], 'royal-dinh-hat-2': [-29, 20, -35],
  'royal-dinh-hat-3': [-29, 29, -35],
  'royal-ly-hat-1': [-28, 28, -35], 'royal-ly-hat-2': [-30, 30, -35],
  'royal-ly-hat-3': [-28, 28, -35],
  'royal-tran-hat-1': [-30, 30, -35], 'royal-tran-hat-2': [-30, 30, -35],
  'royal-tran-hat-3': [-29, 29, -35],
  'royal-le-hat-1': [-30, 30, -35], 'royal-le-hat-2': [-23, 23, -35],
  'royal-le-hat-3': [-24, 24, -35],
  'royal-tayson-hat-1': [-29, 29, -35], 'royal-tayson-hat-2': [-31, 28, -35],
  'royal-tayson-hat-3': [-28, 28, -35],
  'royal-nguyen-hat-1': [-30, 30, -35], 'royal-nguyen-hat-2': [-23, 23, -35],
  'royal-nguyen-hat-3': [-28, 28, -35],
};

/** Pure presentation geometry shared by the live creator, baked portraits and QA. */
export function fitDonghoPart(def: FacePartDef, head?: FacePartDef): FittedFacePart[] {
  if (!head || !FOREHEAD[head.key]) return [{ ...def }];
  const [left, right] = FOREHEAD[head.key], center = (left + right) / 2;
  if (def.key.startsWith('royal-') && def.key.includes('-hat-')) {
    const [l, r, front] = ROYAL_HAT_CONTACTS[def.key] ?? [-30, 30, -35];
    const bandCenter = (l + r) / 2;
    const sx = (right - left + 4) / (r - l);
    const crownHeight = front - (def.cy - def.h / 2);
    const browY = -35;
    // Keep the actual crown above the scalp, without stretching tall crowns out
    // of the portrait. The band attaches just above the brows on every head.
    const sy = Math.min((browY + 84) / crownHeight, Math.max(sx, (browY - (head.cy - head.h / 2) + 1) / crownHeight));
    const fit = { ...def, cx: center + (def.cx - bandCenter) * sx,
      cy: browY + (def.cy - front) * sy, w: def.w * sx, h: def.h * sy };
    const winged = /royal-(ly-hat-1|le-hat-[23]|nguyen-hat-2)$/.test(def.key);
    if (!winged) return [fit];
    const x0 = def.cx - def.w / 2, a = (l - x0) / def.w, b = (r - x0) / def.w;
    return [{ ...fit, crop: { left: a, right: b } }, ...([[0, a, l], [b, 1, r]]).map(([start, end, anchor]) => {
      const edge = center + (anchor - bandCenter) * sx;
      const scale = Math.min(sx, (63 - Math.abs(edge)) / ((end - start) * def.w));
      return { ...fit, cx: edge + (def.cx - anchor) * scale, w: def.w * scale,
        crop: { left: start, right: end } };
    })];
  }
  if (def.key.startsWith('beard-')) {
    /**
     * **A beard follows the chin it grows on — it does not start where the chin ends.**
     *
     * Every beard is authored in `build-faces.mjs` against the canonical head: the moustache sits
     * on `MY` (the mouth line) and the mass hangs from `CHIN`, which is the same 27 the canonical
     * `head-oval` puts its jaw at. The art is already right. All the fit has to do is carry it to
     * a chin that is somewhere else.
     *
     * It was instead *re-deriving* each beard's position from the chin — a goatee hung below it, a
     * full beard a tenth of its own height under it, a chinstrap half its height above it. On the
     * canonical head, where the fit should do nothing at all, that moved the chin beards down by
     * between 9 and 12 units: measured with `test_scripts/scratch/fit-audit.mjs`, and visible on
     * every bearded portrait in the game as a beard sitting on the *throat*, unattached to the
     * face above it. Reported as "beards are not matched with the face", and it was.
     *
     * So the anchor is a delta, not a position: zero on the canonical head, and on any other head
     * exactly how far that head's jaw is from the canonical one. `verify-face-fit` is the gate —
     * it asserts the whole feature set is a no-op on `head-oval`.
     */
    const chinDrop = head.cy + head.h / 2 - 2 - CANONICAL_CHIN;
    const sx = (right - left) / 52;
    const base = { ...def, cx: center + def.cx * sx, w: def.w * sx };
    // A moustache is tied to the mouth, and the mouth does not move with the jaw — it is fitted
    // across (`sx`) and never down, exactly like `mouth-`. Only the mass below follows the chin.
    if (def.key.startsWith('beard-moustache')) return [base];
    // The composite beards carry their own moustache above the mouth. That piece stays with the
    // lip while the mass under it travels; `seam` is the y the two were drawn apart at.
    const split: Record<string, number> = { 'beard-long': 16,
      'beard-threepart': 15, 'beard-forked': 16, 'beard-patriarch': 16 };
    const seam = split[def.key];
    if (seam !== undefined && chinDrop !== 0) {
      const ratio = (seam - (def.cy - def.h / 2)) / def.h;
      return [{ ...base, crop: { left: 0, right: 1, bottom: ratio } },
        { ...base, cy: def.cy + chinDrop, crop: { left: 0, right: 1, top: ratio } }];
    }
    return [{ ...base, cy: def.cy + chinDrop }];
  }
  const contact = DONGHO_HAT_CONTACTS[def.key];
  if (contact) {
    const [l, r, front] = contact;
    const sx = (right - left + 4) / (r - l);
    const straps = def.key === 'hat-non-quaithao';
    const kerchief = /^hat-(moqua|khanvuong|veil)/.test(def.key);
    // Long chin straps follow face height; crown height must still enclose a tall,
    // narrow head when its circumference requires a smaller size.
    const crownHeight = front - (def.cy - def.h / 2 + 2);
    // A kerchief's side folds must not grow down over the eyes when fitted to a
    // narrow crown. Seat the whole cloth higher instead of elongating its sides.
    const targetY = straps ? -43 : def.key === 'hat-helm-cheeks' ? -40
      : kerchief ? Math.min(def.key === 'hat-moqua-tied' ? -38 : -35, head.cy - head.h / 2 - 1 + crownHeight * sx) : -35;
    const sy = straps ? head.h / 82 : kerchief ? sx : Math.min((targetY + 84) / crownHeight,
      Math.max(sx, (targetY - (head.cy - head.h / 2) + 1) / crownHeight));
    if (NON_LA.has(def.key)) {
      /**
       * **A nón lá is a parasol, not a cap.** A real one is 40–50 cm across on a 16 cm head, and
       * its inner ring sits the cone down over the crown until the brim shades the brows. Sized
       * off the contact band like a turban it came out one head-and-a-half wide and perched on
       * the hair like a saucer. So the brim grows past the band — capped inside the cartouche —
       * the cone keeps its own pitch, and the whole hat settles to just above the brows.
       */
      const scale = Math.min(sx * NON_LA_BRIM, NON_LA_MAX_W / def.w);
      // The ba tầm is a disc a finger thick: at the cone's pitch its top face is too shallow to
      // hide the crown, and the hair pokes through the middle. Seen a little more from above, it
      // covers the head without the rim coming down over the brows.
      const sy = def.key === 'hat-non-batam' ? scale * 1.45 : scale;
      return [{ ...def, cx: center + (def.cx - (l + r) / 2) * scale,
        cy: NON_LA_RIM_Y + (def.cy - front) * sy, w: def.w * scale, h: def.h * sy }];
    }
    const fitted: FittedFacePart = { ...def, cx: center + (def.cx - (l + r) / 2) * sx,
      cy: targetY + (def.cy - front) * sy, w: def.w * sx, h: def.h * sy };
    if (!def.key.startsWith('hat-phocdau')) return [fitted];
    // Fit the cap independently of its wings. Three source slices preserve the
    // crown and keep the longest wings inside the existing portrait cartouche.
    const x0 = def.cx - def.w / 2, a = (l - x0) / def.w, b = (r - x0) / def.w;
    const pieces = [{ ...fitted, crop: { left: a, right: b } }];
    for (const [start, end, anchor] of [[0, a, l], [b, 1, r]]) {
      const edge = center + (anchor - (l + r) / 2) * sx;
      const wingScale = Math.min(sx, (64 - Math.abs(edge)) / ((end - start) * def.w));
      pieces.push({ ...fitted, cx: edge + (def.cx - anchor) * wingScale,
        w: def.w * wingScale, crop: { left: start, right: end } });
    }
    return pieces;
  }
  if (/^(ears(?:-|$)|earring-)/.test(def.key)) {
    // Move each ear/earring independently so its shape is never stretched.
    const delta = (head.w - 62) / 2;
    return [-1, 1].map(side => ({ ...def, cx: def.cx + side * delta,
      crop: { left: side < 0 ? 0 : .5, right: side < 0 ? .5 : 1 } }));
  }
  if (/^(hair-(?!comb|flower|ribbon|cord)|topknot|bun-|knot-)/.test(def.key)) {
    const sx = (right - left + 4) / 61, sy = head.h / 82;
    return [{ ...def, cx: center + def.cx * sx, cy: hairY(def.cy, head), w: def.w * sx, h: def.h * sy }];
  }
  if (/^(hairpin(?!-nape)|hair-(comb|flower|ribbon|cord))/.test(def.key)) {
    // What is pinned into the hair travels with it, at its own size.
    const sx = (right - left + 4) / 61;
    return [{ ...def, cx: center + def.cx * sx, cy: hairY(def.cy, head) }];
  }
  if (/^(eyes-|brow-|nose-|mouth-)/.test(def.key)) {
    const sx = (right - left) / 52;
    return [{ ...def, cx: center + def.cx * sx, w: def.w * sx }];
  }
  return [{ ...def }];
}

/** Top of the canonical `head-oval` part (its crop padding included), which hair is authored on. */
const CANONICAL_HEAD_TOP = -53;

/**
 * **Hair grows from the crown, so it is placed from the crown.** A source y on the canonical head
 * goes to the same distance under this head's top, stretched by its height. It used to pivot on
 * the brow line (−27) instead, which left a long head's dome bare above the hair and floated the
 * hair clear of a short round skull.
 */
function hairY(y: number, head: FacePartDef): number {
  return head.cy - head.h / 2 + (y - CANONICAL_HEAD_TOP) * (head.h / 82);
}

/**
 * A line through the body of each hair crescent, in source design coordinates: below the
 * crescent's highest top edge and above its lowest bottom edge, measured on the committed PNGs
 * at the centre and quarter columns (`test_scripts/scratch/hairline-measure.mjs`).
 */
const HAIRLINE: Record<string, number> = {
  'hair-crown': -43.8, 'hair-cropped': -44.9, 'hair-low': -41.5, 'hair-high': -46.7,
  'hair-peak': -44.5, 'hair-swept': -43.7, 'hair-receding': -48.5, 'hair-thick': -42.2,
  'hair-parted': -41, 'hair-wavy': -40.7, 'hair-long': -40.2, 'hair-long-full': -38.4,
  'hair-long-short': -39.3, 'hair-braid': -39, 'hair-tail': -40.9,
  'hair-woman-center': -39.7, 'hair-woman-temple': -39.1, 'hair-woman-short': -39.2,
  'hair-woman-loose': -38.5, 'hair-woman-wrapped': -39.2, 'hair-woman-tran-short': -38.7,
};

/**
 * **The skull above a hairline is hair, whatever shape the skull is.**
 *
 * The v2 hair is a crescent — a hairline, not a cap — sized off the forehead. On the canonical
 * head its top edge meets the crown; on a long head the dome rises past it and reads as a bald
 * patch over a headband, and on a round one the flatter crescent overhangs the skull like a
 * visor with skin under it. So the head's own silhouette, cropped at a line inside the crescent
 * and tinted with the hair, is laid under it: the crown is covered to the outline on every head,
 * and the crescent still draws the hairline.
 */
export function donghoHairCap(def: FacePartDef, head?: FacePartDef): FittedFacePart | undefined {
  const line = HAIRLINE[def.key];
  if (line === undefined || !head || !FOREHEAD[head.key]) return undefined;
  const top = head.cy - head.h / 2;
  const bottom = (hairY(line, head) - top) / head.h;
  if (bottom <= 0) return undefined;
  return { ...head, layer: def.layer - 0.5, crop: { left: 0, right: 1, top: 0, bottom } };
}

export function donghoHead(parts: readonly HeroLookPart[], defs: ReadonlyMap<string, FacePartDef>): FacePartDef | undefined {
  const head = parts.find(p => p.key.startsWith('head-'));
  return head && defs.get(head.key);
}
