import type { FacePartDef } from './parts.generated';
import type { HeroLookPart } from './heroLook';

export interface FittedFacePart extends FacePartDef {
  /** Normalized source interval. Only wings and separated ear pairs need slices. */
  crop?: { left: number; right: number; top?: number; bottom?: number };
}

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

/** Pure presentation geometry shared by the live creator, baked portraits and QA. */
export function fitDonghoPart(def: FacePartDef, head?: FacePartDef): FittedFacePart[] {
  if (!head || !FOREHEAD[head.key]) return [{ ...def }];
  const [left, right] = FOREHEAD[head.key], center = (left + right) / 2;
  if (def.key.startsWith('royal-') && def.key.includes('-hat-')) {
    const sx = (right - left + 4) / 60;
    // Crown height encloses tall, narrow heads. Independently fit the wing slices
    // so broad heads do not push court-cap wings outside the cartouche.
    const sy = Math.max(sx, (-35 - (head.cy - head.h / 2) + 1) / 30);
    const fit = { ...def, cx: center + def.cx * sx, cy: -35 + (def.cy + 35) * sy, w: def.w * sx, h: def.h * sy };
    const winged = /royal-(ly-hat-1|le-hat-[23]|nguyen-hat-2)$/.test(def.key);
    if (!winged) return [fit];
    const a = (64 - 30) / 128, b = (64 + 30) / 128;
    return [{ ...fit, crop: { left: a, right: b } }, ...([-1, 1] as const).map(side => {
      const edge = center + side * 30 * sx, scale = Math.min(sx, (63 - Math.abs(edge)) / 34);
      return { ...fit, cx: edge - side * 30 * scale, w: def.w * scale,
        crop: { left: side < 0 ? 0 : b, right: side < 0 ? a : 1 } };
    })];
  }
  if (def.key.startsWith('beard-') && !def.key.startsWith('beard-moustache')) {
    const chin = head.cy + head.h / 2 - 2;
    const sx = (right - left) / 52;
    const base = { ...def, cx: center + def.cx * sx, w: def.w * sx };
    // Composite resources have a separate moustache above the negative-space mouth.
    // Keep that upper piece below the nose; attach only the beard mass to the chin.
    const split: Record<string, number> = { 'beard-long': 16,
      'beard-threepart': 15, 'beard-forked': 16, 'beard-patriarch': 16 };
    const seam = split[def.key];
    if (seam !== undefined) {
      const ratio = (seam - (def.cy - def.h / 2)) / def.h;
      return [{ ...base, crop: { left: 0, right: 1, bottom: ratio } },
        { ...base, cy: def.cy + chin - seam - 1, crop: { left: 0, right: 1, top: ratio } }];
    }
    // Stubble and chinstraps cover the jaw; pointed goatees begin at its bottom.
    const jaw = /chinstrap|stubble/.test(def.key);
    const full = def.key.startsWith('beard-full');
    return [{ ...base, cy: chin + (full ? def.h * .12 : jaw ? -def.h / 2 + 2 : def.h / 2 - 2) }];
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
    return [{ ...def, cx: center + def.cx * sx, cy: -27 + (def.cy + 27) * sy, w: def.w * sx, h: def.h * sy }];
  }
  if (/^(eyes-|brow-|nose-|mouth-)/.test(def.key)) {
    const sx = (right - left) / 52;
    return [{ ...def, cx: center + def.cx * sx, w: def.w * sx }];
  }
  return [{ ...def }];
}

export function donghoHead(parts: readonly HeroLookPart[], defs: ReadonlyMap<string, FacePartDef>): FacePartDef | undefined {
  const head = parts.find(p => p.key.startsWith('head-'));
  return head && defs.get(head.key);
}
