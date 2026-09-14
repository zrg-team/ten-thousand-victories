import type { HeroLook, HeroLookPart } from './heroLook';

/** V2 garment frames include sewn facings. Old saves still describe the same outfit. */
const GARMENTS = new Set([
  'collar-giaolinh', 'collar-giaolinh-wide', 'collar-twoflap', 'collar-vienlinh',
  'collar-doikham', 'collar-tuthan', 'collar-baba', 'collar-nguthan',
  'collar-nguthan-tall', 'collar-yem-wrap', 'collar-nhatbinh', 'kesa', 'kesa-red', 'kesa-grey',
]);
const CLOTHING = /^(robe-|collar-|kesa(?:-|$)|yem(?:-|$)|guard-|buttons-)/;

/** Presentation only: never rewrite a stored look or consume the portrait's random seed. */
export function donghoWardrobeParts(look: HeroLook): HeroLookPart[] {
  const armour = look.parts.find(p => p.key.startsWith('robe-armour'));
  const garment = look.parts.find(p => GARMENTS.has(p.key));
  const base = look.parts.find(p => /^robe-(body|broad|slim|sloped|square)$/.test(p.key));
  let primary = look.monastic ? look.parts.find(p => /^kesa(?:-(red|grey))?$/.test(p.key))
    : armour && look.era !== 'nguyen' ? armour : garment ?? base;
  if (look.era === 'nguyen' && armour && !look.monastic) primary = { key: 'collar-nguthan', tint: 'robe' };
  // Detailed tenth-century armour silhouettes lack direct surviving evidence. Use the
  // restrained leather interpretation instead of retaining the film-derived fan-scale claim.
  if (look.era === 'dinh' && armour) primary = { key: 'robe-armour-leather', tint: 'robe' };
  const parts: HeroLookPart[] = [];
  const hat = look.parts.find(p => p.key.startsWith('hat-'))?.key;
  const openCrown = !hat || /^hat-(khanvan(?:-|$)|band(?:-|$))/.test(hat);
  const hasSash = look.parts.some(p => p.key.startsWith('sash-'));
  // A crown pin needs a crown mass to go through. Looks saved before the rule pinned a Đinh
  // man's nape knot at the crown too, leaving the pin floating above a bare head.
  const crownMass = look.parts.some(p => /^(topknot|bun-(?!nape|side))/.test(p.key));
  for (const part of look.parts) {
    if (CLOTHING.test(part.key)) continue;
    if (part.key.startsWith('badge-') && (!['le', 'nguyen'].includes(look.era) || armour)) continue;
    if (part.key === 'badge-dragon') { parts.push({ key: 'badge-crane', tint: 'none' }); continue; }
    if (look.monastic && /^(sash-|belt-)/.test(part.key)) continue;
    // V2 sashes are tied waist cloths. Do not superimpose the old second belt.
    if (hasSash && part.key.startsWith('belt-')) continue;
    // Closed headwear encloses the crown hair and its ornaments. Side/nape hair
    // remains visible; open khăn vấn and cloth bands can show the tied crown.
    if (!crownMass && /^(hairpin(?!-nape)|hair-(comb|flower))/.test(part.key)) continue;
    if (!openCrown && /^(topknot|bun-(?!nape|side)|hairpin(?!-nape)|hair-(comb|flower|ribbon|cord))/.test(part.key)) continue;
    if (look.era === 'nguyen' && part.key.startsWith('hat-helm')) {
      parts.push({ key: 'hat-khandong', tint: 'none' }); continue;
    }
    parts.push({ ...part });
  }
  // Open front panels reveal the under-robe below the throat, never the paper behind the
  // portrait. The slim under-robe fits entirely inside the wider outer garment.
  if (primary && ['collar-doikham', 'collar-tuthan', 'collar-yem-wrap', 'collar-nhatbinh'].includes(primary.key)) {
    parts.push({ key: 'robe-slim', tint: 'robeLight' });
  }
  if (primary) parts.push({ key: primary.key, tint: primary.key.startsWith('kesa') ? 'none' : 'robe' });
  return parts;
}
