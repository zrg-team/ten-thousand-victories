import type { Hero, HeroEra } from '../../state/types';
import type { HeroLookPart } from './heroLook';
import { ROBES } from './palette';
import { ACTIVE_HERO_FACE_ART_PACK } from './artPack';

/**
 * What a person of a given identity is allowed to wear.
 *
 * Split from the renderer and from the resolver on purpose. `FaceRenderer` stacks whatever
 * parts it is handed and knows nothing about heroes; `heroLook` decides *who* someone is; this
 * file is the only place that answers *what they wear*, era by era. Adding a dynasty, or
 * giving an office a new hat, touches this file and the part library and nothing else.
 *
 * The legacy Đinh pool used modern film reconstructions documented in
 * `docs/phase-1/23-the-thirteenth-wardrobe.md`; these are not primary historical evidence.
 * V2 corrections and remaining uncertainties are in `docs/research/vietnamese-wardrobe-v2.md`.
 *
 * Đại Việt did not dress the same way for a thousand years, which is why these are keyed on
 * era first. Nguyễn Phúc Khoát's 1744 reform concerned Đàng Trong; it was not an immediate
 * nationwide replacement of crossed collars. These broad game-era pools simplify regional,
 * rank and ceremonial distinctions and do not authenticate each individual outfit.
 *
 * Every list here is a *pool* the seed then picks from, never a single answer. That is the
 * difference between a roster of two hundred and the same six portraits repeated: the
 * constraint is historical, the choice inside it is not.
 */

type Pick = <T>(items: readonly T[]) => T;

/**
 * Headwear each era actually offers, by role and sex. A monk's list has one entry.
 *
 * The pools are deliberately uneven. Their number of variants is an illustration choice,
 * not the number of historically documented helmet forms.
 */
export function headwearFor(era: HeroEra, type: Hero['type'], woman: boolean, rank: number): string[] {
  if (ACTIVE_HERO_FACE_ART_PACK.id === 'dongho-v2' && !woman) {
    // Historical corrections belong to the new presentation; retain older pack selection.
    if (era === 'nguyen' && type === 'general') return ['hat-khandong', 'hat-non-dau', 'hat-khanvan', 'hat-khandong'];
    if (era === 'dinh' && type === 'general') return ['hat-binhdinh', 'hat-helm-leather', 'hat-band-cloth', ''];
    if (era === 'ly' && type === 'minister') return ['hat-phocdau-short', 'hat-phocdau-short', 'hat-khanvuong'];
    if (era === 'tran' && (type === 'minister' || type === 'governor')) return rank >= 2
      ? ['hat-dinhtu-streamers', 'hat-dinhtu', ''] : ['hat-dinhtu', 'hat-dinhtu', ''];
  }
  if (woman) return womenHeadwear(era, rank);
  if (era === 'dinh') {
    // Weighted to the war helm rather than merely offering it: the Đinh state was a võ trị —
    // the army was the government — and the pool used to be the shortest in this file for want
    // of a source. The 2026 Hoa Lư reconstruction is not a source, but it is a coherent
    // proposal, and one specific helm beats three generic ones.
    if (type === 'general') return ['hat-helm-dinh', 'hat-helm-dinh', 'hat-helm', 'hat-helm-leather', 'hat-band-warrior', ''];
    return ['', '', 'hat-khanvan-low', 'hat-khanvuong', 'hat-band-cloth', 'hat-non'];
  }
  if (era === 'ly') {
    if (type === 'general') return ['hat-helm', 'hat-helm-plume', 'hat-helm-daumau', 'hat-khanvuong', 'hat-band-warrior'];
    // Phốc Đầu entered court regulation in 1059. Outside court the stronger evidence is for a
    // topknot, sometimes enclosed by a closed hair cloth — not the later open-crown khăn vấn.
    if (type === 'minister') return ['hat-phocdau-short', 'hat-phocdau-short', 'hat-duongcan', 'hat-osa', rank >= 3 ? 'hat-xungthien' : 'hat-khanvuong'];
    if (type === 'governor') return ['hat-khanvuong', 'hat-osa', '', 'hat-non'];
    return ['', '', 'hat-khanvuong', 'hat-non', 'hat-non-chop'];
  }
  if (era === 'tran') {
    if (type === 'general') return ['hat-helm', 'hat-helm-lamellar', 'hat-helm-cheeks', 'hat-dinhtu', 'scalp-shaven', ''];
    // In 1301 the Đinh Tự replaced the Lý Phốc Đầu for civil and military officials. Higher
    // office added purple-and-blue rear streamers, so rank changes the cap without inventing
    // another silhouette.
    if (type === 'minister') return rank >= 2
      ? ['hat-dinhtu-streamers', 'hat-dinhtu-streamers', 'hat-dinhtu', 'hat-osa', '']
      : ['hat-dinhtu', 'hat-dinhtu', 'hat-osa', 'scalp-shaven', ''];
    if (type === 'governor') return ['hat-dinhtu', 'hat-osa', 'scalp-shaven', '', 'hat-non-chop'];
    return ['scalp-shaven', 'scalp-shaven', '', '', 'hat-non', 'hat-non-dau'];
  }
  if (era === 'le') {
    if (type === 'general') return ['hat-helm', 'hat-helm-crest', 'hat-helm-horned', 'hat-helm-lamellar', 'hat-khanvan'];
    // 1499: the court wrote wing length into the regulations, so a Lê minister wears the
    // dragonfly cap more often than anything else and the wings say how senior he is.
    if (type === 'minister') return ['hat-phocdau-short', 'hat-phocdau-short', 'hat-osa', 'hat-binhdinh', 'hat-tamson'];
    if (type === 'governor') return ['hat-dinhtu', 'hat-osa', 'hat-khanvuong', 'hat-non', 'hat-binhdinh'];
    return ['hat-dinhtu', '', 'hat-non', 'hat-khanvuong', 'hat-non-dau', 'hat-band-cloth'];
  }
  if (era === 'tayson') {
    if (type === 'general') return ['hat-helm-crest', 'hat-helm-plume', 'hat-band-warrior', 'hat-helm-leather', 'hat-band'];
    if (type === 'minister') return ['hat-khanvan', 'hat-duongcan', 'hat-osa', 'hat-band'];
    return ['hat-band', 'hat-khanvan', 'hat-non', 'hat-non-dau', 'hat-band-cloth'];
  }
  // Nguyễn: the khăn đóng is the everyday form and the folded khăn xếp the formal one; the
  // dragonfly cap survives only at court.
  if (type === 'general') return ['hat-helm-daumau', 'hat-helm', 'hat-khandong', 'hat-band-warrior', 'hat-helm-leather'];
  if (type === 'minister') return ['hat-phocdau-short', 'hat-khanxep', 'hat-khandong', 'hat-osa', 'hat-binhdinh'];
  if (type === 'governor') return ['hat-khandong', 'hat-khanxep', 'hat-khandong-jewel', 'hat-osa', 'hat-non'];
  return ['hat-khandong', 'hat-non', 'hat-khanxep', 'hat-non-chop', 'hat-khanvuong'];
}

/**
 * A woman's headwear, which tracks region and occasion more than office.
 *
 * The khăn mỏ quạ is the northern delta's, the nón quai thao is what a woman wore to a
 * festival, and the khăn vành dây — the great coiled wrap — belongs to the Nguyễn court and
 * nowhere else.
 */
function womenHeadwear(era: HeroEra, rank: number): string[] {
  if (era === 'nguyen') {
    return rank >= 2
      ? ['hat-vanhday', 'hat-crown-nhatbinh', 'hat-crown-phoenix', 'hat-vanhday', 'hat-moqua']
      : ['hat-moqua', 'hat-moqua-tied', 'hat-khanxep', 'hat-non', 'hat-moqua-brown'];
  }
  if (era === 'le' || era === 'tayson') {
    return rank >= 2
      ? ['hat-coronet', 'hat-crown-phoenix', 'hat-coronet-jade', 'hat-non-quaithao', 'hat-moqua']
      : ['hat-moqua', 'hat-non-quaithao', 'hat-moqua-brown', 'hat-non-batam', ''];
  }
  // The mỏ quạ and great festival hats are later northern-delta forms. Lý–Trần portraits are
  // better served by visible hair, a simple band or a restrained court coronet.
  if (era === 'ly' || era === 'tran' || era === 'dinh') {
    return rank >= 2
      ? ['hat-coronet', 'hat-coronet-jade', 'hat-crown-seven', '', 'hat-band-gold']
      : ['', '', 'hat-band', 'hat-band-cloth', 'hat-non'];
  }
  return rank >= 2
    ? ['hat-coronet', 'hat-coronet-jade', 'hat-crown-seven', '', 'hat-band-gold']
    : ['', 'hat-band', 'hat-moqua-brown', 'hat-non', 'hat-band-cloth'];
}

/** Rank lengthens the dragonfly wings, as the 1499 court regulations did. */
export function rankWings(hat: string, rank: number): string {
  if (!hat.startsWith('hat-phocdau')) return hat;
  return rank >= 3 ? 'hat-phocdau-grand' : rank >= 2 ? 'hat-phocdau-long' : 'hat-phocdau-short';
}

/** Hair a man of this era may wear under (or instead of) a hat. */
export function manHairFor(era: HeroEra, age: 'young' | 'prime' | 'elder'): string[] {
  if (age === 'elder') return ['hair-receding', 'hair-high', 'hair-crown', 'hair-parted'];
  // Trần fashion cropped the hair short — Chinese envoys remarked on it, and it is the
  // cheapest way to make a Trần portrait unmistakable beside a Lê one.
  if (era === 'tran') return ['hair-cropped', 'hair-cropped', 'hair-high', 'hair-crown'];
  return ['hair-crown', 'hair-parted', 'hair-thick', 'hair-peak', 'hair-swept', 'hair-low'];
}

/** A man's knot, worn under a wound turban or on its own. */
export function manKnotFor(era: HeroEra): string[] {
  // The nape knot is a soldier's and the crown knot a scholar's, so it belongs to the two eras
  // that had more of the first than the second.
  if (era === 'dinh') return ['topknot-tall', 'knot-nape', 'knot-nape', 'topknot-wrapped', 'topknot'];
  if (era === 'ly') return ['topknot', 'topknot-small', 'knot-nape', 'topknot-wrapped', 'topknot-side'];
  return ['topknot', 'topknot-small', 'topknot-wrapped', 'topknot-side'];
}

export type WomanHairOrnamentPlacement = 'none' | 'crown' | 'brush' | 'band' | 'nape-left' | 'nape-right';

export interface WomanHairStyle {
  /** A reviewed front and, when needed, its compatible rear mass. */
  parts: readonly string[];
  /** Pins have physical locations; a crown pin must never float beside a nape chignon. */
  ornament: WomanHairOrnamentPlacement;
}

const womanStyle = (
  parts: readonly string[],
  ornament: WomanHairOrnamentPlacement,
): WomanHairStyle => ({ parts, ornament });

/**
 * Complete Vietnamese women's hairstyles, gated by period.
 *
 * These must stay as whole styles. Independently rolling “long hair” and “bun” was the visual
 * defect this function replaces: it made straight side curtains and then balanced an unrelated
 * oval on the crown. The pools below instead follow the surviving silhouette evidence:
 *
 * - Lý–Trần artifact heads: face-framing locks, tall fans, spiral coils and restrained side loops;
 * - Trần textual description: short hair tied at the crown and bent like a writing brush;
 * - Lê accounts: neck-length cropped hair, with loose long hair returning later in the period;
 * - Nguyễn visual record: smooth centre parts, northern wrapped crowns and southern nape buns.
 */
export function womanHairStylesFor(
  era: HeroEra,
  age: 'young' | 'prime' | 'elder',
  covered: boolean,
): WomanHairStyle[] {
  // A scarf or great wrap leaves only a quiet hairline visible. No bun or pin is allowed to
  // protrude through it.
  if (covered) {
    return era === 'tran'
      ? [womanStyle(['hair-woman-tran-short'], 'none')]
      : [womanStyle(['hair-woman-center'], 'none'), womanStyle(['hair-woman-short'], 'none')];
  }

  if (era === 'dinh') {
    // Evidence before Lý is sparse; keep a conservative compact early-Vietnamese pool instead
    // of projecting either the rich Lý court fans or the late Nguyễn wrap backward as fact.
    return [
      womanStyle(['bun-snail-coil', 'hair-woman-center'], 'crown'),
      womanStyle(['bun-nape-right', 'hair-woman-temple'], 'nape-right'),
      womanStyle(['bun-nape-left', 'hair-woman-temple'], 'nape-left'),
    ];
  }

  if (era === 'ly') {
    const court = [
      womanStyle(['bun-fan-high', 'hair-woman-center'], 'crown'),
      womanStyle(['bun-snail-coil', 'hair-woman-temple'], 'crown'),
      womanStyle(['bun-fan-high', 'hair-woman-temple'], 'band'),
    ];
    // Two side loops occur on Lý–Trần heads, but the best reconstruction treats them as a
    // young attendant/low-status possibility rather than a generic woman's style.
    if (age === 'young') court.push(womanStyle(['bun-side-loops', 'hair-woman-center'], 'band'));
    if (age === 'elder') court.push(womanStyle(['bun-nape-right', 'hair-woman-temple'], 'nape-right'));
    return court;
  }

  if (era === 'tran') {
    return [
      womanStyle(['bun-tran-brush', 'hair-woman-tran-short'], 'brush'),
      womanStyle(['bun-tran-brush', 'hair-woman-tran-short'], 'brush'),
      womanStyle(['hair-woman-wrapped'], 'band'),
      womanStyle(['bun-snail-coil', 'hair-woman-center'], 'crown'),
    ];
  }

  if (era === 'le') {
    return [
      womanStyle(['hair-woman-short'], 'band'),
      womanStyle(['hair-woman-short'], 'none'),
      womanStyle(['hair-woman-loose'], 'none'),
      womanStyle(['hair-woman-wrapped'], 'band'),
      womanStyle(
        [age === 'young' ? 'bun-nape-left' : 'bun-nape-right', 'hair-woman-center'],
        age === 'young' ? 'nape-left' : 'nape-right',
      ),
    ];
  }

  if (era === 'tayson') {
    return [
      womanStyle(['hair-woman-loose'], 'none'),
      womanStyle(['hair-woman-wrapped'], 'band'),
      womanStyle(['bun-nape-right', 'hair-woman-center'], 'nape-right'),
      womanStyle(['bun-nape-left', 'hair-woman-center'], 'nape-left'),
    ];
  }

  // Nguyễn spans northern hair wrapped smoothly around the head and the low rear chignon seen
  // especially in the south. Loose long hair remains a younger/private option, not the default.
  const nguyen = [
    womanStyle(['hair-woman-wrapped'], 'band'),
    womanStyle(['hair-woman-wrapped'], 'band'),
    womanStyle(['bun-nape-right', 'hair-woman-center'], 'nape-right'),
    womanStyle(['bun-nape-left', 'hair-woman-center'], 'nape-left'),
  ];
  if (age === 'young') nguyen.push(womanStyle(['hair-woman-loose'], 'none'));
  return nguyen;
}

/** What may be pinned into a specific style. Empty entries keep most working hair unadorned. */
export function hairOrnamentFor(
  rank: number,
  placement: WomanHairOrnamentPlacement = 'crown',
): string[] {
  if (placement === 'none') return [''];
  if (placement === 'band') {
    return rank >= 2
      ? ['hair-ribbon', 'hair-cord', 'hair-ribbon', '']
      : ['', '', 'hair-cord', 'hair-ribbon'];
  }
  if (placement === 'brush') {
    return rank >= 2
      ? ['hairpin-plain', 'hairpin-long', 'hair-cord', '']
      : ['hairpin-plain', '', '', 'hair-cord'];
  }
  if (placement === 'nape-left' || placement === 'nape-right') {
    const side = placement === 'nape-left' ? 'left' : 'right';
    return rank >= 2
      ? [`hairpin-nape-${side}-jade`, `hairpin-nape-${side}`, `hairpin-nape-${side}-jade`, '']
      : ['', '', `hairpin-nape-${side}`];
  }
  if (rank >= 3) return ['hairpin-jade', 'hairpin-long', 'hair-comb', 'hair-flower', 'hairpin-plain'];
  if (rank >= 1) return ['', 'hairpin', 'hairpin-jade', 'hairpin-plain', 'hair-ribbon', 'hair-cord'];
  return ['', '', '', 'hairpin-plain', 'hair-cord'];
}

/** The robe, its collar, and whatever fastens it — one coherent set per era and sex. */
export function garmentsFor(
  era: HeroEra,
  woman: boolean,
  monastic: boolean,
  type: Hero['type'],
  rank: number,
  pick: Pick,
): HeroLookPart[] {
  if (monastic) {
    return [
      { key: 'robe-sloped', tint: 'robe' },
      { key: pick(['kesa', 'kesa', 'kesa-red', 'kesa-grey']), tint: 'none' },
      ...(pick([true, false, false]) ? [{ key: 'kesa-patches', tint: 'none' } as HeroLookPart] : []),
    ];
  }
  if (woman) return womenGarments(era, rank, pick);

  const shape = type === 'general'
    ? pick(era === 'dinh'
      // Legacy film-derived variety. Exact tenth-century armour forms lack surviving
      // object evidence; v2 substitutes its restrained leather interpretation at presentation.
      ? ['robe-armour-fanscale', 'robe-armour-fanscale', 'robe-armour-leather', 'robe-armour', 'robe-armour-scale']
      : ['robe-armour', 'robe-armour-lamellar', 'robe-armour-scale', 'robe-armour-brigandine', 'robe-armour-leather'])
    : pick(['robe-body', 'robe-body', 'robe-slim', 'robe-sloped', 'robe-broad']);
  const body: HeroLookPart[] = [
    { key: shape, tint: 'robe' },
    { key: pick(['robe-sheen', 'robe-sheen-soft']), tint: 'robeLight' },
  ];
  // A field harness gets its flared pauldrons, gilded when the man commands armies rather
  // than companies.
  if (type === 'general' && rank >= 1 && pick([true, true, false])) {
    body.push({ key: 'guard-shoulder', tint: 'robeDark' });
    if (rank >= 2) body.push({ key: 'guard-shoulder-gilt', tint: 'none' });
  }

  if (era === 'nguyen') {
    // Áo ngũ thân: a standing collar closing to the right, five buttons for the Five Constants.
    return [
      ...body,
      { key: 'collar-nguthan-body', tint: 'robe' },
      { key: pick(['collar-nguthan', 'collar-nguthan-tall']), tint: 'robeLight' },
      { key: pick(['buttons-five', 'buttons-jade', 'buttons-knot']), tint: 'none' },
      ...beltFor(rank, era, pick),
    ];
  }
  if (era === 'dinh') {
    // A court that has not yet regulated a cap has to carry rank on the body, which is why
    // this era gets its distinctions from the garment rather than from the head. Three marks,
    // in ascending order of office: the rope belt on a man with none, the brocade band down
    // the lapel on a man with some, the beast-mask shoulder on a man who commands armies.
    if ((type === 'minister' || type === 'governor') && rank >= 1) {
      // Áo đối khâm — two parallel bands hanging open, with the placket of ô vuông between
      // them. Keep the old pool; round collars predate Lê, while rank-square chronology differs.
      return [
        ...body,
        { key: 'collar-doikham', tint: 'robeDark' },
        { key: 'collar-doikham-over', tint: 'robeLight' },
        { key: 'collar-placket-square', tint: 'none' },
        { key: pick(['sash-cord', 'sash-silk', 'sash-ochre']), tint: 'none' },
      ];
    }
    // Legacy practical wrap illustration, closed with a sash; not a traced Đông Sơn garment.
    const dinh: HeroLookPart[] = [
      ...body,
      { key: 'collar-twoflap', tint: 'robeDark' },
      { key: 'collar-twoflap-over', tint: 'robeLight' },
    ];
    // A pick, not a rule: the roster's Đinh entries are mostly Legendary generals, so an
    // unconditional beast-mask put it on six of the ten and the sheet read as a uniform.
    if (type === 'general' && rank >= 2 && pick([true, true, false])) {
      dinh.push({ key: 'guard-beastmask', tint: 'none' });
    }
    if (rank >= 1 && pick([true, true, false])) {
      dinh.push({ key: pick(['collar-band-brocade', 'collar-band-brocade', 'collar-band-oxblood']), tint: 'none' });
    }
    dinh.push({ key: pick(['sash-ochre', 'sash-cord', 'sash-silk']), tint: 'none' });
    if (rank === 0) dinh.push({ key: 'belt-rope-coil', tint: 'none' });
    return dinh;
  }

  // Lý · Trần · Lê · Tây Sơn. The round-collar four-panel robe is especially strong in the
  // Trần descriptions. Bổ tử do not appear until Lê regulations, so an earlier round collar
  // remains clear rather than carrying an anachronistic rank square.
  const courtly = (type === 'minister' || type === 'governor') && rank >= 1 && era !== 'tayson';
  const roundCollar = courtly
    ? pick([true, true, false])
    : era === 'tran'
      ? pick([true, true, true, false])
      : era === 'ly' && pick([true, false, false]);
  if (roundCollar) {
    return [
      ...body,
      { key: 'collar-vienlinh', tint: 'robeDark' },
      { key: 'collar-vienlinh-trim', tint: 'none' },
      ...(era === 'le' && rank >= 1 ? [{ key: badgeFor(type, rank, pick), tint: 'none' } as HeroLookPart] : []),
      ...beltFor(rank, era, pick),
    ];
  }
  const giaoLinh: HeroLookPart[] = pick([true, true, true, false])
    ? [...body, { key: 'collar-giaolinh', tint: 'robeDark' }, { key: 'collar-giaolinh-over', tint: 'robeLight' }]
    : [...body, { key: 'collar-giaolinh-wide', tint: 'robeDark' }, { key: 'collar-giaolinh-wide-over', tint: 'robeLight' }];
  if (rank >= 2) giaoLinh.push({ key: 'collar-giaolinh-trim', tint: 'none' });
  if (era === 'tayson') giaoLinh.push({ key: pick(['sash-baldric', 'sash-baldric-red', 'sash-cord']), tint: 'none' });
  else giaoLinh.push(...beltFor(rank, era, pick));
  return giaoLinh;
}

/**
 * A woman's dress. The áo yếm is the constant underneath; what goes over it is what changes —
 * the four-panel áo tứ thân in the Lê delta, the áo nhật bình at the Nguyễn court.
 */
function womenGarments(era: HeroEra, rank: number, pick: Pick): HeroLookPart[] {
  const body: HeroLookPart[] = [
    { key: pick(['robe-body', 'robe-slim', 'robe-sloped']), tint: 'robe' },
    { key: pick(['robe-sheen', 'robe-sheen-soft']), tint: 'robeLight' },
  ];
  if (era === 'nguyen' && rank >= 1) {
    return [
      ...body,
      { key: 'collar-nhatbinh', tint: 'robeDark' },
      { key: 'collar-nhatbinh-trim', tint: 'none' },
      ...(rank >= 2 ? [{ key: 'collar-nhatbinh-phoenix', tint: 'none' } as HeroLookPart] : []),
    ];
  }
  if (era === 'nguyen') {
    return [
      ...body,
      { key: 'collar-nguthan-body', tint: 'robe' },
      { key: 'collar-nguthan', tint: 'robeLight' },
      { key: pick(['buttons-knot', 'buttons-jade']), tint: 'none' },
    ];
  }
  // Before the delta's tứ thân and the Nguyễn court's nhật bình, a woman of rank wore the same
  // crossed lapel a man did and the rank went into the band down it, not into the cut. Without
  // this the older centuries dressed every woman in the yếm wrap regardless of who she was.
  if ((era === 'dinh' || era === 'ly') && rank >= 2) {
    return [
      ...body,
      { key: 'collar-giaolinh', tint: 'robeDark' },
      { key: 'collar-giaolinh-over', tint: 'robeLight' },
      { key: pick(['collar-band-oxblood', 'collar-band-brocade']), tint: 'none' },
      { key: pick(['sash-silk', 'sash-waist']), tint: 'none' },
    ];
  }
  if (era === 'tran' && rank >= 1 && pick([true, true, false])) {
    return [
      ...body,
      { key: 'collar-vienlinh', tint: 'robeDark' },
      { key: 'collar-vienlinh-trim', tint: 'none' },
      ...beltFor(rank, era, pick),
    ];
  }
  const yem = pick(['yem', 'yem', 'yem-cream', 'yem-indigo', 'yem-jade']);
  if ((era === 'le' || era === 'tayson') && pick([true, true, false])) {
    // Áo tứ thân: two front panels knotted at the waist, the yếm showing between them.
    return [
      ...body,
      { key: 'collar-tuthan', tint: 'robeDark' },
      { key: 'collar-tuthan-over', tint: 'robeLight' },
      { key: yem, tint: 'none' },
      { key: 'collar-tuthan-knot', tint: 'none' },
      { key: pick(['sash-waist', 'sash-waist-red', 'sash-silk']), tint: 'none' },
    ];
  }
  const dress: HeroLookPart[] = [
    ...body,
    { key: 'collar-yem-wrap', tint: 'robeLight' },
    { key: yem, tint: 'none' },
  ];
  if (era === 'le' || era === 'tayson') dress.push({ key: pick(['sash-waist', 'sash-waist-red']), tint: 'none' });
  else if (rank >= 1) dress.push({ key: pick(['sash-silk', 'sash-cord']), tint: 'none' });
  return dress;
}

/** Đai — the plaque belt. Only high office wore one, and jade outranked gold at some courts. */
function beltFor(rank: number, era: HeroEra, pick: Pick): HeroLookPart[] {
  if (rank < 2 || era === 'dinh') return [];
  return pick([true, false]) ? [{ key: pick(['belt-jade', 'belt-gold']), tint: 'none' }] : [];
}

/**
 * Bổ tử — the rank badge. Civil offices wore birds and military ones beasts, which is a real
 * distinction and the fastest way to read an office off a portrait.
 */
function badgeFor(type: Hero['type'], rank: number, pick: Pick): string {
  if (type === 'general') {
    return rank >= 3 ? 'badge-lion' : pick(['badge-tiger', 'badge-bear', 'badge-rhino']);
  }
  if (rank >= 3) return pick(['badge-crane', 'badge-dragon']);
  return pick(['badge-pheasant', 'badge-peacock', 'badge-crane']);
}

export function robeColour(type: Hero['type'], woman: boolean, monastic: boolean, era: HeroEra, rank: number): number {
  if (monastic) return ROBES.ochre;
  if (woman) return rank >= 3 ? ROBES.vermilion : rank >= 2 ? ROBES.azure : ROBES.nau;
  if (type === 'minister') return rank >= 2 ? ROBES.azure : ROBES.jade;
  if (type === 'general') return era === 'tayson' ? ROBES.vermilion : ROBES.cham;
  if (type === 'governor') return ROBES.nau;
  return rank >= 2 ? ROBES.jade : ROBES.nau;
}
