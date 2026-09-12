/**
 * Generates the hero-portrait part library: one editable SVG per part in `public/faces/`, a
 * single runtime atlas, and the manifest `src/ui/faces/parts.generated.ts` that tells the
 * renderer where each part sits.
 *
 * Why a generator rather than 55 hand-written files: the parts have to agree with each other
 * to the pixel — an eye drawn against one head shape and composited onto another is the whole
 * failure mode of layered portrait art. Keeping every path in one design space here means the
 * anatomy is defined once, and the crop offsets in the manifest are *measured* from the real
 * rendered geometry rather than typed in by hand.
 *
 * Parts that carry a colour the run chooses — skin, hair, robe — are drawn in white or grey
 * and tinted at runtime, so six skin tones cost one file rather than six. Parts whose colour is
 * fixed (gold coronet, black lacquer turban) are drawn in their own colour and never tinted.
 *
 * The runtime atlas clips two generated neutral material studies into cloth and lacquered
 * headwear. Silhouette and colour remain deterministic vectors; the generated art contributes
 * surface character only, where it cannot invent or misdate a garment.
 *
 * Output is committed. Re-run with `node scripts/build-faces.mjs` after editing a path.
 *
 * Usage: node scripts/build-faces.mjs [--check]
 *   --check  verify the committed output matches what this script would emit, and fail if not
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const OUT_SVG = 'public/faces';
const OUT_MANIFEST = 'src/ui/faces/parts.generated.ts';
const OUT_ATLAS_SVG = join(OUT_SVG, 'atlas.svg');
const OUT_ATLAS_JSON = join(OUT_SVG, 'atlas.json');
const CLOTH_SOURCE = 'scripts/faces/materials/handwoven-cloth.png';
const GAUZE_SOURCE = 'scripts/faces/materials/lacquered-gauze.png';
const CHECK = process.argv.includes('--check');
const RASTER_SCALE = 2;
const ATLAS_WIDTH = 2048;
const ATLAS_GAP = 2;

// ── design space ────────────────────────────────────────────────────────────
// Every part is authored in this one coordinate system, origin at the portrait's centre.
// The renderer never needs to know these numbers: it reads the measured box from the manifest.
const VIEW = { x: -68, y: -88, w: 136, h: 174 };
const W = 58;                    // canonical head width
const H = 78;                    // canonical head height
const TOP = -12 - H / 2;         // crown          = -51
const CHIN = -12 + H / 2;        // chin           =  27
const NECK = CHIN + 10;          // base of throat =  37
const SHY = NECK + 30;           // shoulder line  =  67
const EYE_Y = -18;
const EX = 12.5;                 // eye centre offset from midline

/**
 * Head silhouette. `jaw` narrows the lower half, `temple` the upper; `wide`/`tall` resize the
 * whole skull. Four axes rather than three because jaw alone could not separate a heart-shaped
 * face from a square one — both need the temples moved, in opposite directions.
 */
function headPath(wide = 0, tall = 0, jaw = 1, temple = 1) {
  const w = W + wide, h = H + tall;
  const x = w / 2, y = h / 2, j = x * jaw, t = x * temple;
  return `M ${-t} ${-y * 0.18}
    C ${-t} ${-y * 0.78}, ${-t * 0.56} ${-y}, 0 ${-y}
    C ${t * 0.56} ${-y}, ${t} ${-y * 0.78}, ${t} ${-y * 0.18}
    C ${x} ${y * 0.36}, ${j * 0.9} ${y * 0.82}, 0 ${y}
    C ${-j * 0.9} ${y * 0.82}, ${-x} ${y * 0.36}, ${-t} ${-y * 0.18} Z`;
}

/**
 * One eye, drawn to the left of the midline; the renderer mirrors it for the right.
 * `lid` raises or lowers the upper lid, `tilt` rotates the whole eye at the outer corner —
 * which is what separates an upturned eye from a downturned one without redrawing the lid.
 */
function eyeArt(lid, tilt = 0, iris = 2.5, ink = '#171310') {
  return `
    <path d="M -8 ${lid * 0.4 + tilt} q 4 ${-4.6 - lid} 8.6 ${-0.6 - tilt} q -3.6 5.2 -8.6 ${0.6 + tilt} Z" fill="#ffffff" opacity=".82"/>
    <path d="M -8.4 ${lid * 0.4 + tilt} q 4.2 ${-5.2 - lid} 9 ${-0.8 - tilt}" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="-2.6" cy="${-1.6 + tilt * 0.4}" r="${iris}" fill="${ink}"/>`;
}
const EY_T = EYE_Y;
const pairEyes = (lid, tilt = 0, iris = 2.5) =>
  `<g transform="translate(${-EX},${EY_T})">${eyeArt(lid, tilt, iris)}</g>` +
  `<g transform="translate(${EX},${EY_T}) scale(-1,1)">${eyeArt(lid, tilt, iris)}</g>`;

/** Both brows, mirrored, drawn white so the run's hair colour tints them. */
function brows(curve, drop, weight = 2.6, len = 10.5) {
  const one = `<path d="M -10 ${-9 + drop} q ${len * 0.48} ${curve} ${len} 1.5" stroke="#ffffff" stroke-width="${weight}" fill="none" stroke-linecap="round"/>`;
  return `<g transform="translate(${-EX},${EYE_Y})">${one}</g><g transform="translate(${EX},${EYE_Y}) scale(-1,1)">${one}</g>`;
}

// ── the part library ────────────────────────────────────────────────────────
// `tint` names the colour slot the renderer multiplies this part by. 'none' ships its own
// colour. `layer` is the paint order, low to high.
//
// The library is authored as *families* rather than as individual files: one parameterised
// helper and a table of numbers, so a wardrobe of two hundred parts stays as readable as the
// wardrobe of seventy it grew from, and a family can be retuned in one place.
const PARTS = [];
const part = (key, layer, tint, body) => PARTS.push({ key, layer, tint, body });

// Fixed colours used across families, so a change lands everywhere at once.
const GOLD = '#d9b35a';
const GOLD_DEEP = '#b08a34';
const LACQUER = '#1b1a17';
const LACQUER_HI = '#2d2a24';
const LACQUER_EDGE = '#57524a';
const SON = '#aa3a2c';
const CREAM = '#e8ddc4';
const JADE = '#6f8f64';
const CHAM = '#26313c';
const STEEL = '#6a6f66';
const STRAW = '#c9a860';
const STRAW_DEEP = '#9c7f3f';

// 10 · plate — the lacquered ground and its border. Rank warms the ground and gilds the edge.
for (const [name, ground, edge, weight] of [
  ['common', '#2a241a', '#5a4c33', 1.8],
  ['rare', '#2a2a1a', '#6c5a37', 1.8],
  ['epic', '#2f2618', '#8a6f3c', 1.8],
  ['legendary', '#3a2c14', '#c8a24e', 2.6],
]) {
  part(`plate-${name}`, 10, 'none',
    `<rect x="-66" y="-84" width="132" height="166" rx="3" fill="${ground}"/>
     <rect x="-66" y="-84" width="132" height="166" rx="3" fill="none" stroke="${edge}" stroke-width="${weight}"/>`);
}

// 20 · robe bodies. White, so the realm's colour tints them. `spread` widens the shoulder,
// `slope` drops it — a general in armour needs a square shoulder and a scholar a sloping one,
// and at portrait scale the shoulder line carries more of the read than the collar does.
//
// **The control point beside the neckline is what decides whether the clothes have anything to
// sit on.** At `-20 ${NECK + 2}` the curve left the throat horizontally and then plunged: the
// body was ±9 wide at y 40 and did not pass x 30 until y 51, while collar after collar is drawn
// out at x 24 to 34 around y 33 to 43. Measured across the wardrobe, eleven parts reached ten to
// twenty-eight units past any body beneath them, and on a plain robe they are visibly hanging on
// the paper. Carrying it out to `-30 ${NECK + 4}` gives the shoulder a real slope from the
// throat — three to five units higher at x 27 to 34 — which is where most of that overhang was.
// It is not the whole fix: a lapel tip drawn at jaw height cannot be met by any shoulder, and
// those came down to meet this one.
const shouldersPath = (spread, slope) =>
  `M ${-46 - spread} ${SHY + 26} C ${-44 - spread} ${SHY - 14 + slope}, -30 ${NECK + 4}, 0 ${NECK + 2}
   C 30 ${NECK + 4}, ${44 + spread} ${SHY - 14 + slope}, ${46 + spread} ${SHY + 26} Z`;
for (const [name, spread, slope] of [
  ['body', 0, 0], ['broad', 6, -4], ['slim', -6, 5], ['sloped', -2, 8], ['square', 4, -8],
]) {
  part(`robe-${name}`, 20, 'robe', `<path d="${shouldersPath(spread, slope)}" fill="#ffffff"/>`);
}

// Armour. Five weaves the record actually describes — banded, lamellar plates laced in rows,
// fish-scale, studded brigandine, and plain hardened leather for a captain who is not a lord.
const ARMOUR_BASE = shouldersPath(4, -6);
part('robe-armour', 20, 'robe',
  `<path d="${ARMOUR_BASE}" fill="#ffffff"/>
   <path d="M -42 ${SHY + 4} L 42 ${SHY + 4} M -42 ${SHY + 11} L 42 ${SHY + 11} M -42 ${SHY + 18} L 42 ${SHY + 18}"
     stroke="#9a9a9a" stroke-width="2.4"/>`);
part('robe-armour-lamellar', 20, 'robe',
  `<path d="${ARMOUR_BASE}" fill="#ffffff"/>` +
  [0, 1, 2].map((row) => Array.from({ length: 9 }, (_, i) =>
    `<rect x="${-40 + i * 9 + (row % 2) * 4.5}" y="${SHY + 1 + row * 8}" width="7" height="6.4" rx="1.4" fill="none" stroke="#9a9a9a" stroke-width="1.5"/>`).join('')).join(''));
part('robe-armour-scale', 20, 'robe',
  `<path d="${ARMOUR_BASE}" fill="#ffffff"/>` +
  [0, 1, 2, 3].map((row) => Array.from({ length: 11 }, (_, i) =>
    `<path d="M ${-42 + i * 8 + (row % 2) * 4} ${SHY + row * 6} q 3.6 5.4 7.2 0" fill="none" stroke="#9a9a9a" stroke-width="1.3"/>`).join('')).join(''));
part('robe-armour-brigandine', 20, 'robe',
  `<path d="${ARMOUR_BASE}" fill="#ffffff"/>` +
  [0, 1, 2].map((row) => Array.from({ length: 8 }, (_, i) =>
    `<circle cx="${-36 + i * 10}" cy="${SHY + 3 + row * 8}" r="1.7" fill="#9a9a9a"/>`).join('')).join(''));
part('robe-armour-leather', 20, 'robe',
  `<path d="${ARMOUR_BASE}" fill="#ffffff"/>
   <path d="M -40 ${SHY + 6} q 40 -7 80 0 M -40 ${SHY + 16} q 40 -7 80 0" stroke="#9a9a9a" stroke-width="2" fill="none" opacity=".8"/>`);
// A sixth weave, and the tenth century's: a shell-shaped lame, wider than it is deep, hung in
// courses that overlap downward. It is what separates a Đinh harness from the fish-scale of a
// Trần one, and it is *filled* rather than stroked — `robe-armour-scale` proves the point in
// the other direction, where nine rows of outline average to grey at 42 px and the chest loses
// its weave entirely.
part('robe-armour-fanscale', 20, 'robe',
  `<path d="${ARMOUR_BASE}" fill="#ffffff"/>` +
  [0, 1, 2, 3].map((row) => Array.from({ length: 9 }, (_, i) => {
    const x = -40 + i * 10 + (row % 2) * 5, y = SHY + 1 + row * 6.4;
    return `<path d="M ${x} ${y} a 5 4.6 0 0 0 10 0 Z" fill="#9a9a9a" opacity=".55"/>`
      + `<path d="M ${x} ${y} a 5 4.6 0 0 0 10 0" fill="none" stroke="#787878" stroke-width="1"/>`;
  }).join('')).join(''));

// 21 · hem trim, one band along the bottom of the bust — the cheapest way to say "this robe
// was expensive" without adding a colour the palette does not own.
part('robe-hem-gold', 21, 'none', `<rect x="-48" y="${SHY + 20}" width="96" height="4" fill="${GOLD}" opacity=".9"/>`);
part('robe-hem-dark', 21, 'robeDark', `<rect x="-48" y="${SHY + 20}" width="96" height="5" fill="#ffffff"/>`);

// 22 · robe highlight, one step lighter than the body.
part('robe-sheen', 22, 'robeLight',
  `<path d="M 6 ${NECK + 2} C 26 ${NECK + 6}, 44 ${SHY - 8}, 46 ${SHY + 26} L 18 ${SHY + 26} Z" fill="#ffffff" opacity=".5"/>`);
part('robe-sheen-soft', 22, 'robeLight',
  `<path d="M 10 ${NECK + 6} C 26 ${NECK + 12}, 40 ${SHY - 4}, 42 ${SHY + 26} L 22 ${SHY + 26} Z" fill="#ffffff" opacity=".32"/>`);

// 24 · pauldrons — the flared shoulder of a Trần or Lê field harness, over the body it hangs on.
part('guard-shoulder', 24, 'robeDark',
  `<path d="M -50 ${SHY + 14} C -50 ${SHY - 8}, -26 ${SHY - 14}, -22 ${SHY + 2} C -30 ${SHY + 6}, -40 ${SHY + 10}, -42 ${SHY + 20} Z" fill="#ffffff"/>
   <path d="M 50 ${SHY + 14} C 50 ${SHY - 8}, 26 ${SHY - 14}, 22 ${SHY + 2} C 30 ${SHY + 6}, 40 ${SHY + 10}, 42 ${SHY + 20} Z" fill="#ffffff"/>`);
part('guard-shoulder-gilt', 24, 'none',
  `<path d="M -50 ${SHY + 14} C -50 ${SHY - 8}, -26 ${SHY - 14}, -22 ${SHY + 2}" stroke="${GOLD}" stroke-width="1.8" fill="none"/>
   <path d="M 50 ${SHY + 14} C 50 ${SHY - 8}, 26 ${SHY - 14}, 22 ${SHY + 2}" stroke="${GOLD}" stroke-width="1.8" fill="none"/>`);
// Thôn kiên thú — the beast that swallows the shoulder. A *mask*, not a plate: two eyes and a
// jaw line are the whole read at 42 px, and the same gilt shape without them is a shoulder pad.
// Fixed colour, because cast bronze is not one of the run's dyes.
// Thôn kiên thú — the beast that swallows the shoulder.
//
// Two passes were wrong before this one, and both failures came from drawing a *face* instead of
// copying the object. Pass one — two dots and an upcurved jaw — was a smiley. Pass two added
// fangs hanging below the jaw and they read as a tongue stuck out. Going back to the frame
// (hlts-1, the Hữu tướng quân's pauldron) says what actually dominates a cast one: a big
// scrolled **snout** in the middle, eyes small and tucked beside it, teeth as a zigzag *inside*
// the jaw, and curls of mane filling the top. Density is the read, not expression.
//
// Drawn once for the left shoulder and mirrored, so the two can never drift apart.
const beastMaskHalf =
  `<path d="M -50 ${SHY + 15} C -51 ${SHY - 9}, -26 ${SHY - 15}, -23 ${SHY + 3} C -30 ${SHY + 10}, -40 ${SHY + 14}, -42 ${SHY + 23} Z" fill="${GOLD}" stroke="${GOLD_DEEP}" stroke-width="1.2"/>
   <path d="M -46 ${SHY - 1} q 5 -7 11 -5 M -34 ${SHY - 7} q 5 -2 9 2" stroke="${GOLD_DEEP}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
   <ellipse cx="-37.5" cy="${SHY + 6.5}" rx="6.6" ry="4.4" fill="${GOLD_DEEP}" transform="rotate(-20 -37.5 ${SHY + 6.5})"/>
   <circle cx="-40" cy="${SHY + 6}" r="1" fill="#2b2318"/><circle cx="-35" cy="${SHY + 4}" r="1" fill="#2b2318"/>
   <circle cx="-45.4" cy="${SHY + 2.4}" r="1.6" fill="#2b2318"/>
   <circle cx="-32.6" cy="${SHY - 1.8}" r="1.6" fill="#2b2318"/>
   <path d="M -45.5 ${SHY + 13.4} l 3 -2.2 l 3 1.8 l 3 -2.2 l 3 1.8 l 3 -2.2" stroke="#2b2318" stroke-width="1.25" fill="none" stroke-linejoin="round"/>`;
part('guard-beastmask', 24, 'none', beastMaskHalf + `<g transform="scale(-1,1)">${beastMaskHalf}</g>`);

// 25 · neck. Every neck begins above the shortest jaw (`head-round` ends at y=23.5), so the
// head can never float on paper. A very slight flare replaces the old ruler-straight rectangle;
// width is coupled to the selected head family in `neckForHead`, not rolled independently.
//
// **Widths are a fraction of the jaw they hang from, and the first pass set them too thin.**
// Measured across the roster: a `neck-slim` drew 14 design units under heads 52 to 58 wide —
// a quarter of the jaw, where a person's neck is about a third of it. It reads on paper exactly
// as it measures: a head resting on a post, with the jaw overhanging both sides in one step and
// nothing carrying the eye from one to the other. Reported as the head and body not looking
// joined, and worst on the women, because five of the seven head shapes in their pool select the
// slim neck. Each is now ~0.32 of its head family's width, which is the anatomy, and the flare
// to the shoulders is a little stronger for the same reason.
const neckShape = (topHalf, bottomHalf) =>
  `<path d="M ${-topHalf} ${NECK - 17}
     C ${-topHalf} ${NECK - 8}, ${-topHalf + 0.6} ${NECK + 2}, ${-bottomHalf} ${NECK + 10}
     L ${bottomHalf} ${NECK + 10}
     C ${topHalf - 0.6} ${NECK + 2}, ${topHalf} ${NECK - 8}, ${topHalf} ${NECK - 17} Z" fill="#ffffff"/>`;
part('neck', 25, 'skinShadow', neckShape(10.5, 12));
part('neck-slim', 25, 'skinShadow', neckShape(8.5, 10));
part('neck-broad', 25, 'skinShadow', neckShape(12, 13.5));

// 28 · ears. The long lobe is not a style axis — it is the iconographic mark of a Buddhist
// teacher, and the wardrobe hands it only to monastics.
part('ears', 28, 'skinShadow',
  `<ellipse cx="${-W / 2 - 1}" cy="-10" rx="5.5" ry="11" fill="#ffffff"/>
   <ellipse cx="${W / 2 + 1}" cy="-10" rx="5.5" ry="11" fill="#ffffff"/>`);
part('ears-small', 28, 'skinShadow',
  `<ellipse cx="${-W / 2 - 1}" cy="-10" rx="4.4" ry="8.5" fill="#ffffff"/>
   <ellipse cx="${W / 2 + 1}" cy="-10" rx="4.4" ry="8.5" fill="#ffffff"/>`);
part('ears-long', 28, 'skinShadow',
  `<ellipse cx="${-W / 2 - 1}" cy="-8" rx="5.8" ry="15" fill="#ffffff"/>
   <ellipse cx="${W / 2 + 1}" cy="-8" rx="5.8" ry="15" fill="#ffffff"/>`);

// 30 · head shapes
for (const [name, wide, tall, jaw, temple] of [
  ['oval', 0, 0, 1, 1],
  ['narrow', -4, 4, 0.82, 0.94],
  ['broad', 6, -3, 1.12, 1],
  ['square', 2, 0, 1.2, 1.06],
  ['soft', -2, -2, 0.88, 1],
  ['round', 4, -7, 1.02, 1.02],
  ['long', -3, 8, 0.9, 0.96],
  ['heart', 1, 1, 0.7, 1.1],
  ['angular', 3, 3, 1.16, 0.9],
  ['wide', 8, -2, 1.06, 1.04],
  ['slim', -6, 3, 0.8, 0.9],
  ['full', 5, 1, 1.0, 1.12],
  ['tapered', 0, 5, 0.74, 1.02],
  ['blunt', 4, -4, 1.14, 1.1],
  ['fine', -5, 0, 0.86, 0.86],
  ['stern', 2, 4, 1.08, 0.94],
]) {
  part(`head-${name}`, 30, 'skin', `<path d="${headPath(wide, tall, jaw, temple)}" transform="translate(0,-12)" fill="#ffffff"/>`);
}

// 35 · collars. This is the garment's name made visible: áo giao lĩnh crosses left over right,
// áo viên lĩnh closes in a ring at the throat, áo đối khâm hangs open in two parallel bands,
// áo tứ thân ties in front. Getting the collar right is most of getting the century right, so
// each is two tinted halves — dark under, light over — rather than one flat shape.
//
// **A lapel starts on the shoulder, not at the jaw.** Both tips used to be authored at
// `NECK - 4` — level with the chin — where no shoulder in the set reaches and none can: the
// widest robe does not pass x 26 until y 46. So each flap's whole upper half hung on bare paper,
// joined to nothing, and on a plain robe it read as two planks laid against the throat. Measured
// at 21 units past the body for the plain cut and 28 for the wide, the worst in the wardrobe —
// and the most worn collar in the game, so it is the one that mattered most.
//
// The tip is now given as a point rather than a reach, and both of them land on the shoulder the
// robe actually draws: (24, `NECK + 10`) and (28, `NECK + 14`), against a `robe-slim` shoulder
// that passes those two x at y 47 and 50. The V is lower and shallower than it was, which is the
// price of it resting on something; crossing left over right, which is what names the garment,
// is untouched.
const lapel = (tipX, tipY, dropY, outX, outY) =>
  `M ${-tipX} ${NECK + tipY} L 2 ${NECK + dropY} L 2 ${NECK + dropY + 18} L ${-outX} ${NECK + outY} Z`;
part('collar-giaolinh', 35, 'robeDark', `<path d="${lapel(24, 10, 24, 32, 21)}" fill="#ffffff"/>`);
part('collar-giaolinh-over', 36, 'robeLight',
  `<path d="M 24 ${NECK + 10} L -2 ${NECK + 24} L -2 ${NECK + 42} L 32 ${NECK + 21} Z" fill="#ffffff"/>`);
part('collar-giaolinh-wide', 35, 'robeDark', `<path d="${lapel(28, 14, 28, 36, 27)}" fill="#ffffff"/>`);
part('collar-giaolinh-wide-over', 36, 'robeLight',
  `<path d="M 28 ${NECK + 14} L -2 ${NECK + 28} L -2 ${NECK + 46} L 36 ${NECK + 27} Z" fill="#ffffff"/>`);
part('collar-giaolinh-trim', 37, 'none',
  `<path d="M 24 ${NECK + 10} L -2 ${NECK + 24} L -2 ${NECK + 42}" stroke="${CREAM}" stroke-width="1.6" fill="none" opacity=".85"/>`);
part('collar-twoflap', 35, 'robeDark',
  `<path d="M -26 ${NECK + 12} L 0 ${NECK + 26} L 0 ${NECK + 40} L -32 ${NECK + 21} Z" fill="#ffffff"/>`);
part('collar-twoflap-over', 36, 'robeLight',
  `<path d="M 26 ${NECK + 12} L 0 ${NECK + 26} L 0 ${NECK + 40} L 32 ${NECK + 21} Z" fill="#ffffff"/>`);
// The broad brocade band laid down the leading edge of a wrap. Before the courts wrote rank
// into a cap or a badge, this is where it was carried — the band is wide, contrasting and
// full-length, which is the one garment mark that still reads when the head is too small to
// see. Sits over either the giao lĩnh or the two-flap, so it is one part rather than two.
part('collar-band-brocade', 37, 'none',
  `<path d="M 23 ${NECK + 9} L -2 ${NECK + 24} L -2 ${NECK + 35} L 30 ${NECK + 17} Z" fill="${GOLD}" opacity=".92"/>
   <path d="M 21 ${NECK + 13} L 0 ${NECK + 24}" stroke="${GOLD_DEEP}" stroke-width="1.1" fill="none" opacity=".8"/>`);
part('collar-band-oxblood', 37, 'none',
  `<path d="M 23 ${NECK + 9} L -2 ${NECK + 24} L -2 ${NECK + 35} L 30 ${NECK + 17} Z" fill="#7d4a52"/>
   <path d="M 21 ${NECK + 13} L 0 ${NECK + 24}" stroke="${GOLD_DEEP}" stroke-width="1.1" fill="none" opacity=".7"/>`);
// The placket of square medallions that runs between the two parallel bands of an áo đối khâm.
// Three ô vuông and no more: a fourth pushes the lowest one off the bottom of the bust, and at
// portrait scale four small squares stop being countable anyway.
part('collar-placket-square', 37, 'none',
  `<rect x="-9" y="${NECK + 3}" width="18" height="45" fill="#2f2a21" opacity=".82"/>` +
  [0, 1, 2].map((i) =>
    `<rect x="-5.5" y="${NECK + 8 + i * 14}" width="11" height="10" rx="1" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`).join(''));

// Áo viên lĩnh — the round-collar court robe of the Lý and Trần. A ring at the throat, which
// is precisely what leaves the chest clear for a rank badge.
part('collar-vienlinh', 35, 'robeDark',
  `<path d="M -15 ${NECK - 2} C -15 ${NECK + 15}, 15 ${NECK + 15}, 15 ${NECK - 2}
     C 15 ${NECK + 23}, -15 ${NECK + 23}, -15 ${NECK - 2} Z" fill="#ffffff"/>`);
part('collar-vienlinh-trim', 36, 'none',
  `<path d="M -15 ${NECK - 2} C -15 ${NECK + 15}, 15 ${NECK + 15}, 15 ${NECK - 2}" stroke="${GOLD}" stroke-width="1.6" fill="none"/>`);

// Áo đối khâm — two parallel bands hanging straight, never crossed.
part('collar-doikham', 35, 'robeDark',
  `<path d="M -13 ${NECK - 6} L -5 ${NECK - 6} L -7 ${NECK + 42} L -17 ${NECK + 42} Z" fill="#ffffff"/>`);
part('collar-doikham-over', 36, 'robeLight',
  `<path d="M 13 ${NECK - 6} L 5 ${NECK - 6} L 7 ${NECK + 42} L 17 ${NECK + 42} Z" fill="#ffffff"/>`);

// Áo tứ thân — the four-panel dress of the northern delta, its two front panels knotted at
// the waist and the yếm showing between them.
part('collar-tuthan', 35, 'robeDark',
  `<path d="M -22 ${NECK + 9} C -18 ${NECK + 22}, -10 ${NECK + 32}, -6 ${NECK + 42} L -26 ${NECK + 42} Z" fill="#ffffff"/>`);
part('collar-tuthan-over', 36, 'robeLight',
  `<path d="M 22 ${NECK + 9} C 18 ${NECK + 22}, 10 ${NECK + 32}, 6 ${NECK + 42} L 26 ${NECK + 42} Z" fill="#ffffff"/>`);
part('collar-tuthan-knot', 37, 'none',
  `<path d="M -7 ${NECK + 34} q 7 -6 14 0 q -7 8 -14 0 Z" fill="${CREAM}" opacity=".85"/>`);

// Áo bà ba — the southern working blouse: a plain standing band and a straight front opening.
// **A standing band is a collar, not a plank.** These three were axis-aligned rectangles wider
// than any neck, and they stopped in mid-air: the robe's neckline is at `NECK + 2` and the bands
// ended above it, so six or seven units at each end hung over bare paper with nothing behind
// them. On the page that is a slab laid across the throat with the head above it and the body
// below — reported as the head, neck and body not looking joined, and it was the clearest case
// of it. Each is now a trapezoid: it hugs the throat where it meets the neck, and widens into
// the shoulders, with its base carried below the neckline so it is standing on the body.
part('collar-baba', 35, 'robeLight',
  `<path d="M -11 ${NECK - 5} L 11 ${NECK - 5} L 15.5 ${NECK + 6} L -15.5 ${NECK + 6} Z" fill="#ffffff"/>`);
part('collar-baba-front', 36, 'robeDark',
  `<path d="M -2.5 ${NECK + 2} L 2.5 ${NECK + 2} L 2.5 ${NECK + 42} L -2.5 ${NECK + 42} Z" fill="#ffffff"/>`);

part('sash-ochre', 37, 'none', `<rect x="-24" y="${NECK + 30}" width="48" height="5" rx="2" fill="#b07a24"/>`);
part('sash-baldric', 37, 'none', `<path d="M -34 ${NECK + 22} L 34 ${NECK + 34}" stroke="${GOLD}" stroke-width="5"/>`);
part('sash-baldric-red', 37, 'none', `<path d="M -34 ${NECK + 22} L 34 ${NECK + 34}" stroke="${SON}" stroke-width="5"/>`);
part('sash-silk', 37, 'none', `<path d="M -30 ${NECK + 26} q 30 8 60 -2" stroke="${CREAM}" stroke-width="4" fill="none" opacity=".9"/>`);
part('sash-cord', 37, 'none',
  `<path d="M -20 ${NECK + 20} q 20 10 40 0" stroke="${GOLD_DEEP}" stroke-width="2" fill="none"/>
   <path d="M 0 ${NECK + 28} l 0 10" stroke="${GOLD_DEEP}" stroke-width="2"/>`);
part('sash-waist', 37, 'none', `<rect x="-22" y="${NECK + 32}" width="44" height="5" rx="2" fill="${GOLD}"/>`);
part('sash-waist-red', 37, 'none', `<rect x="-22" y="${NECK + 32}" width="44" height="5" rx="2" fill="${SON}"/>`);

// Đai — the plaque belt. Rank was legible from the number and the material of the plaques, so
// a jade set and a gold set are two parts rather than one recoloured.
// Sits at the very bottom of the bust, where a waist actually is — drawn across the chest it
// read as a necklace of teeth rather than as the belt that carried a mandarin's rank.
const plaqueBelt = (fill, edge) =>
  `<rect x="-34" y="${NECK + 44}" width="68" height="8" rx="1.5" fill="#3a3128"/>` +
  Array.from({ length: 4 }, (_, i) =>
    `<rect x="${-28 + i * 16}" y="${NECK + 45.5}" width="11" height="5" rx="1.5" fill="${fill}" stroke="${edge}" stroke-width="0.7"/>`).join('');
part('belt-jade', 38, 'none', plaqueBelt(JADE, '#4d6b45'));
part('belt-gold', 38, 'none', plaqueBelt(GOLD, GOLD_DEEP));
// What a person with no court to grant them a plaque wears instead: hemp rope, coiled three
// or four turns over a leather band. It sits at the same waist the plaque belt does, and it is
// the cheapest legible mark in the library — three arcs, and it survives every crop.
part('belt-rope-coil', 38, 'none',
  // No leather band under it: drawn first it covered the middle turn, and three coils that
  // touch are a strap. The gap between them is the whole part.
  [0, 1, 2].map((i) =>
    `<path d="M -28 ${NECK + 42 + i * 5.2} q 28 ${i % 2 ? 4.4 : -3.6} 56 0" stroke="${STRAW}" stroke-width="2.9" fill="none" stroke-linecap="round"/>`
    + `<path d="M -28 ${NECK + 42 + i * 5.2} q 28 ${i % 2 ? 4.4 : -3.6} 56 0" stroke="${STRAW_DEEP}" stroke-width="0.9" fill="none" opacity=".55"/>`).join(''));

// Áo ngũ thân — the 1744 reform: a standing collar closing to the right, five buttons.
part('collar-nguthan', 35, 'robeLight',
  `<path d="M -11.5 ${NECK - 6} L 11.5 ${NECK - 6} L 17 ${NECK + 7} L -17 ${NECK + 7} Z" fill="#ffffff"/>`);
part('collar-nguthan-body', 36, 'robe',
  `<path d="M -16 ${NECK + 2} C -6 ${NECK + 12}, 10 ${NECK + 10}, 20 ${NECK + 4} L 24 ${NECK + 40} L -20 ${NECK + 40} Z" fill="#ffffff"/>`);
part('collar-nguthan-tall', 35, 'robeLight',
  `<path d="M -11 ${NECK - 11} L 11 ${NECK - 11} L 16.5 ${NECK + 7} L -16.5 ${NECK + 7} Z" fill="#ffffff"/>`);
part('buttons-five', 39, 'none',
  [0, 1, 2, 3, 4].map((i) => `<circle cx="19" cy="${NECK + 8 + i * 7}" r="1.7" fill="${GOLD}"/>`).join(''));
part('buttons-jade', 39, 'none',
  [0, 1, 2, 3, 4].map((i) => `<circle cx="19" cy="${NECK + 8 + i * 7}" r="1.7" fill="${JADE}"/>`).join(''));
part('buttons-knot', 39, 'none',
  [0, 1, 2, 3].map((i) => `<path d="M 17.5 ${NECK + 10 + i * 8} q 3 -3 6 0 q -3 4 -6 0 Z" fill="${CREAM}" opacity=".9"/>`).join(''));

// Áo yếm — the diamond bodice, tied at neck and back; worn by every class.
part('collar-yem-wrap', 35, 'robeLight',
  `<path d="M -15 ${NECK + 4} C -8 ${NECK + 18}, 8 ${NECK + 18}, 15 ${NECK + 4} L 23 ${NECK + 13} C 11 ${NECK + 32}, -11 ${NECK + 32}, -23 ${NECK + 13} Z" fill="#ffffff"/>`);
// Outlined in cream: on a nâu robe the red separates on its own, but on a vermilion one —
// which is what a Legendary woman wears — red on red is mud without an edge.
const yemArt = (fill) =>
  `<path d="M 0 ${NECK + 2} L 13 ${NECK + 15} L 0 ${NECK + 32} L -13 ${NECK + 15} Z" fill="${fill}" stroke="${CREAM}" stroke-width="1.4"/>
   <path d="M -13 ${NECK + 15} L -20 ${NECK + 8} M 13 ${NECK + 15} L 20 ${NECK + 8}" stroke="${CREAM}" stroke-width="1.6"/>`;
part('yem', 36, 'none', yemArt('#b8443a'));
part('yem-cream', 36, 'none', yemArt('#dcc9a0'));
part('yem-indigo', 36, 'none', yemArt('#2f4f6b'));
part('yem-jade', 36, 'none', yemArt('#6f8f64'));

// Áo nhật bình — the Nguyễn court robe. Its rectangular collar panel is the read.
// A yoke that wraps the throat and runs down the front, not a panel laid on the chest — the
// rectangular *collar* is what names the garment, and a plain filled rectangle reads as a
// signboard hung round the neck.
//
// **The panel can only be as wide as the body underneath it.** The first cut of this shape kept
// the notch but not that rule: it ran a flat top edge at `NECK - 8` out to x ±32, while the
// robe's own neckline is at `NECK + 2` and its shoulder does not reach x 32 until y ≈ 51. So
// twenty-two units at each end of the top band hung over bare paper — the signboard the note
// above says it is not, arrived at from the other direction. Reported as the head, neck and body
// not looking joined, and on this garment it was the largest instance of it.
//
// So the top edge now falls from the throat to the shoulder instead of running straight across.
// The band over the throat is the width of a neck (±12 against necks 17 to 24 wide); from there
// each side slopes out and down to a corner at (±29, `NECK + 19`), which sits inside the shoulder
// of every robe body in the set — the narrowest, `robe-slim`, passes x 29 at y ≈ 56. It is also
// what a nhật bình looks like worn: the square collar sits on the chest, below the shoulder line,
// not floating level with the jaw.
const NHAT_BINH_YOKE = `M -12 ${NECK - 7} L 12 ${NECK - 7}
  L 29 ${NECK + 19} L 29 ${NECK + 26} L 12 ${NECK + 26}
  L 12 ${NECK + 1} C 12 ${NECK - 3}, -12 ${NECK - 3}, -12 ${NECK + 1}
  L -12 ${NECK + 26} L -29 ${NECK + 26} L -29 ${NECK + 19} Z`;
part('collar-nhatbinh', 35, 'robeDark', `<path d="${NHAT_BINH_YOKE}" fill="#ffffff"/>`);
part('collar-nhatbinh-trim', 36, 'none',
  `<path d="${NHAT_BINH_YOKE}" fill="none" stroke="${GOLD}" stroke-width="1.8" stroke-linejoin="round"/>
   <path d="M -26 ${NECK + 21} q 4.5 -6 9 -1" stroke="${GOLD}" stroke-width="1.3" fill="none" opacity=".95"/>
   <path d="M 17 ${NECK + 21} q 4.5 -6 9 -1" stroke="${GOLD}" stroke-width="1.3" fill="none" opacity=".95"/>`);
part('collar-nhatbinh-phoenix', 37, 'none',
  `<path d="M -6 ${NECK + 30} q 6 -8 12 0 q -6 3 -12 0 Z" fill="${SON}" opacity=".9"/>
   <path d="M 0 ${NECK + 30} l 0 8 M -4 ${NECK + 36} l 8 0" stroke="${GOLD}" stroke-width="1.2"/>`);

// Kesa — the monk's, and nobody else's. Ochre is the Trúc Lâm colour; the patched field is the
// older form, sewn from discarded cloth, which is what the word originally meant.
const KESA_PATH = `M -25 ${NECK + 12} L 0 ${NECK + 34} L 25 ${NECK + 12} L 30 ${NECK + 22} L 0 ${NECK + 46} L -30 ${NECK + 22} Z`;
part('kesa', 35, 'none', `<path d="${KESA_PATH}" fill="#b07a24"/>`);
part('kesa-red', 35, 'none', `<path d="${KESA_PATH}" fill="#9c4a2e"/>`);
part('kesa-grey', 35, 'none', `<path d="${KESA_PATH}" fill="#6f6a5e"/>`);
part('kesa-patches', 36, 'none',
  `<path d="M -20 ${NECK + 14} L -14 ${NECK + 26} M -6 ${NECK + 22} L 0 ${NECK + 34} M 10 ${NECK + 22} L 16 ${NECK + 12}"
     stroke="#8c5d18" stroke-width="1.2" fill="none" opacity=".8"/>`);

// 38 · bổ tử — the mandarin rank badge, a square panel worn on the chest of the court robe.
// Civil offices wore birds and military ones beasts, which is a real distinction and a free
// way to read an office off a portrait at a glance.
//
// The motifs are *filled silhouettes*, not line drawings. The square is 22 units and renders
// at roughly eight pixels on a roster row; a stroked crane at that size averages to a grey
// smudge, so each is one solid shape with a single distinguishing tag — an upright body for a
// bird, a low crouching one for a beast.
const badge = (key, motif) => part(`badge-${key}`, 38, 'none',
  `<rect x="-11" y="${NECK + 14}" width="22" height="22" rx="1.5" fill="#241d14" stroke="${GOLD}" stroke-width="1.4"/>${motif}`);
// Birds — civil office. An upright body, a neck that reaches, and a tail that trails.
const bird = (crest, tail) =>
  `<path d="M -2 ${NECK + 33} C -6 ${NECK + 28}, -5 ${NECK + 23}, 0 ${NECK + 22}
     C 4 ${NECK + 21}, 5 ${NECK + 18}, 3 ${NECK + 17} L 7 ${NECK + 16}
     C 8 ${NECK + 20}, 6 ${NECK + 24}, 3 ${NECK + 26}
     C ${tail ? 8 : 5} ${NECK + 30}, ${tail ? 9 : 6} ${NECK + 33}, ${tail ? 7 : 4} ${NECK + 34} Z" fill="${CREAM}"/>`
  + (crest ? `<path d="M 5 ${NECK + 16} l 3 -2.5" stroke="${CREAM}" stroke-width="1.4" stroke-linecap="round"/>` : '');
badge('crane', bird(true, false));
badge('pheasant', bird(false, true));
badge('peacock', bird(true, true) + `<circle cx="7" cy="${NECK + 31}" r="1.6" fill="${JADE}"/>`);
badge('dragon',
  `<path d="M -7 ${NECK + 32} C -3 ${NECK + 30}, -4 ${NECK + 25}, 0 ${NECK + 24}
     C 4 ${NECK + 23}, 3 ${NECK + 19}, 7 ${NECK + 18} L 8 ${NECK + 22}
     C 5 ${NECK + 23}, 6 ${NECK + 27}, 2 ${NECK + 28}
     C -2 ${NECK + 29}, -1 ${NECK + 33}, -5 ${NECK + 35} Z" fill="${GOLD}"/>`);
// Beasts — military office. Low and heavy, filling the bottom of the square.
const beast = (head) =>
  `<path d="M -8 ${NECK + 33} L -8 ${NECK + 27} C -8 ${NECK + 23}, -2 ${NECK + 22}, 1 ${NECK + 24}
     L 6 ${NECK + 24} C 9 ${NECK + 24}, 9 ${NECK + 33}, 9 ${NECK + 33} Z" fill="${CREAM}"/>` + head;
badge('tiger', beast(`<path d="M -9 ${NECK + 27} l -2 -3 M -5 ${NECK + 26} l -1 -4" stroke="${CREAM}" stroke-width="1.5" stroke-linecap="round"/>`));
badge('lion', beast(`<circle cx="-7" cy="${NECK + 24}" r="4" fill="${CREAM}"/><circle cx="-7" cy="${NECK + 24}" r="5.6" fill="none" stroke="${CREAM}" stroke-width="1" opacity=".7"/>`));
badge('bear', beast(`<circle cx="-7" cy="${NECK + 24}" r="3.4" fill="${CREAM}"/><circle cx="-10" cy="${NECK + 21}" r="1.5" fill="${CREAM}"/>`));
badge('rhino', beast(`<path d="M -8 ${NECK + 26} l -4 -1 l 3 -3" fill="${CREAM}"/>`));

// 40 · hair, white so the run's hair colour tints it (and greys it with age).
// `drop` is how far the hairline falls at the temples, `lift` how high it rises at the centre —
// a negative lift is a widow's peak, a large drop a low fringe.
const fringe = (drop, lift) =>
  `<path d="M ${-W / 2 - 1} ${TOP + drop} C ${-W / 2 - 3} ${TOP - 5}, ${W / 2 + 3} ${TOP - 5}, ${W / 2 + 1} ${TOP + drop}
    C ${W / 2 - 4} ${TOP + lift}, ${-W / 2 + 4} ${TOP + lift}, ${-W / 2 - 1} ${TOP + drop} Z" fill="#ffffff"/>`;
for (const [name, drop, lift] of [
  ['crown', 22, 8], ['cropped', 18, 9], ['low', 26, 12], ['high', 15, 4],
  ['peak', 24, 2], ['swept', 21, 13], ['receding', 13, 1], ['thick', 27, 6],
]) {
  part(`hair-${name}`, 40, 'hair', fringe(drop, lift));
}
// A side parting is the fringe plus one sweep across the brow — two strokes, but it is the
// only hairstyle here that is asymmetric, which is worth more variety than a fourth fringe.
part('hair-parted', 40, 'hair',
  fringe(20, 7)
  + `<path d="M ${-W / 2 + 2} ${TOP + 6} C -10 ${TOP + 26}, 14 ${TOP + 24}, ${W / 2 + 1} ${TOP + 14}
       C ${W / 2 - 6} ${TOP + 6}, -6 ${TOP + 14}, ${-W / 2 + 2} ${TOP + 6} Z" fill="#ffffff"/>`);
part('hair-wavy', 40, 'hair',
  fringe(23, 9)
  + `<path d="M ${-W / 2 - 1} ${TOP + 18} q 8 6 16 0 q 8 -6 16 0 q 8 6 16 0" stroke="#ffffff" stroke-width="2.4" fill="none" opacity=".7"/>`);

// Long hair, worn loose or gathered — the delta idiom is a heavy fall at the sides, not a
// Western curtain, and the đuôi gà is the wisp deliberately left out of the knot.
const sideFall = (reach, end) =>
  `<path d="M ${-W / 2 - 1} ${TOP + 24} C ${-W / 2 - reach} ${TOP + 46}, ${-W / 2 - reach + 2} ${end - 6}, ${-W / 2 + 3} ${end + 2}
     C ${-W / 2 + 7} ${end - 10}, ${-W / 2 + 6} ${TOP + 40}, ${-W / 2 - 1} ${TOP + 24} Z" fill="#ffffff"/>
   <path d="M ${W / 2 + 1} ${TOP + 24} C ${W / 2 + reach} ${TOP + 46}, ${W / 2 + reach - 2} ${end - 6}, ${W / 2 - 3} ${end + 2}
     C ${W / 2 - 7} ${end - 10}, ${W / 2 - 6} ${TOP + 40}, ${W / 2 + 1} ${TOP + 24} Z" fill="#ffffff"/>`;
part('hair-long', 40, 'hair', fringe(30, 10) + sideFall(6, CHIN));
part('hair-long-full', 40, 'hair', fringe(32, 11) + sideFall(9, CHIN + 8));
part('hair-long-short', 40, 'hair', fringe(28, 10) + sideFall(4, CHIN - 10));
part('hair-braid', 40, 'hair',
  fringe(28, 10)
  + `<path d="M ${W / 2 - 2} ${TOP + 26} C ${W / 2 + 6} ${TOP + 44}, ${W / 2 + 4} ${CHIN}, ${W / 2 - 2} ${CHIN + 10}
       C ${W / 2 - 8} ${CHIN}, ${W / 2 - 8} ${TOP + 42}, ${W / 2 - 2} ${TOP + 26} Z" fill="#ffffff"/>`
  + [0, 1, 2].map((i) => `<path d="M ${W / 2 - 7} ${TOP + 34 + i * 10} q 5 4 10 0" stroke="#cfcfcf" stroke-width="1" fill="none" opacity=".6"/>`).join(''));
part('hair-tail', 40, 'hair',
  fringe(24, 9)
  + `<path d="M ${W / 2 - 4} ${TOP + 20} q 12 10 6 26 q -3 -12 -10 -18 Z" fill="#ffffff" opacity=".92"/>`);

// 41 · knots and buns — búi tó for a man, the coiled knot for a woman.
part('topknot', 41, 'hair', `<ellipse cx="0" cy="${TOP - 6}" rx="10" ry="8" fill="#ffffff"/>`);
part('topknot-tall', 41, 'hair', `<ellipse cx="0" cy="${TOP - 9}" rx="12" ry="10" fill="#ffffff"/>`);
part('topknot-small', 41, 'hair', `<ellipse cx="0" cy="${TOP - 4}" rx="7.5" ry="6" fill="#ffffff"/>`);
part('topknot-side', 41, 'hair', `<ellipse cx="-11" cy="${TOP - 3}" rx="9" ry="7.5" fill="#ffffff" transform="rotate(-16 -11 ${TOP - 3})"/>`);
// The knot tied low at the nape rather than on the crown — a soldier's, not a scholar's, and
// the form the tenth century wore before a court had an opinion about it. Drawn at the jaw's
// edge because that is where it actually shows on a frontal bust; put on the crown it is just
// `topknot` again.
/**
 * The soldier's nape knot — **behind the head**, like every other thing worn at the nape.
 *
 * Its ellipse sits at x 25, level with the jaw. At 41 it painted in *front* of the face, which
 * put a brown spiral on the sitter's right cheek — on every man the Đinh and Lý wardrobes gave
 * this knot to. `bun-nape-right`/`-left`, the women's equivalent, have always been at 29 with the
 * note that showing only the outer crescent "keeps it behind the jaw instead of turning it into a
 * beard"; this is the same knot on the same nape and belongs on the same side of the head.
 */
part('knot-nape', 29, 'hair',
  `<ellipse cx="25" cy="${CHIN - 4}" rx="9.5" ry="8.5" fill="#ffffff"/>
   <path d="M 16 ${CHIN - 14} q 11 -3 14 4" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round"/>`);
part('topknot-wrapped', 41, 'hair',
  `<ellipse cx="0" cy="${TOP - 7}" rx="11" ry="9" fill="#ffffff"/>
   <path d="M -11 ${TOP - 7} q 11 5 22 0" stroke="#b8b8b8" stroke-width="2" fill="none" opacity=".65"/>`);
part('bun-high', 41, 'hair', `<ellipse cx="0" cy="${TOP - 8}" rx="15" ry="10" fill="#ffffff"/>`);
part('bun-low', 41, 'hair', `<ellipse cx="0" cy="${TOP - 3}" rx="13" ry="9" fill="#ffffff"/>`);
part('bun-double', 41, 'hair',
  `<ellipse cx="-13" cy="${TOP - 4}" rx="9" ry="8" fill="#ffffff"/>
   <ellipse cx="13" cy="${TOP - 4}" rx="9" ry="8" fill="#ffffff"/>`);
part('bun-coil', 41, 'hair',
  `<ellipse cx="0" cy="${TOP - 6}" rx="14" ry="9" fill="#ffffff"/>
   <ellipse cx="0" cy="${TOP - 6}" rx="7" ry="4.5" fill="none" stroke="#c4c4c4" stroke-width="1.4" opacity=".7"/>`);
part('bun-wide', 41, 'hair', `<ellipse cx="0" cy="${TOP - 5}" rx="18" ry="8" fill="#ffffff"/>`);
part('bun-wrapped', 41, 'hair',
  `<ellipse cx="0" cy="${TOP - 6}" rx="15" ry="10" fill="#ffffff"/>
   <path d="M -15 ${TOP - 4} q 15 7 30 0" stroke="#b8b8b8" stroke-width="2.4" fill="none" opacity=".6"/>`);
// The tall knot set high and carried slightly forward of the crown. Every other bun in this
// family is wider than it is tall and sits *on* the head; this one stands off it, which is the
// silhouette that separates a woman of the older courts from the delta's coil at any size.
part('bun-tall-fore', 41, 'hair',
  // Taller than it is wide, which is the entire distinction from `bun-high` — the first pass
  // was 12.5 × 7.5 and came out a loaf of bread sitting on the crown.
  `<ellipse cx="0.5" cy="${TOP - 13}" rx="9.5" ry="13" fill="#ffffff"/>
   <path d="M -9 ${TOP - 1} q 9.5 5 19 -1 Z" fill="#ffffff"/>`);

// Women's historical styles are complete silhouettes rather than a loose fringe randomly
// combined with a bun. The earlier system did exactly that and produced two black curtains
// beside the cheeks with an unrelated ellipse balanced on top. These fronts and backs are
// deliberately paired by `womanHairStylesFor`; rear masses sit below the head (layer 29),
// while the hairline and face-framing locks sit above it (layer 40).
const womanCentreCrown = () =>
  `<path d="M -30 -16 C -31 -39, -20 -52, 0 -53 C 20 -52, 31 -39, 30 -16
     C 24 -26, 13 -31, 0 -24 C -13 -31, -24 -26, -30 -16 Z" fill="#ffffff"/>
   <path d="M 0 -50 C -2 -40, -1 -30, 0 -24" stroke="#c9c9c9" stroke-width="1.2" fill="none" opacity=".62"/>`;

part('hair-woman-center', 40, 'hair', womanCentreCrown());
part('hair-woman-temple', 40, 'hair',
  womanCentreCrown()
  + `<path d="M -27 -27 C -35 -15, -35 5, -28 17 C -23 14, -20 7, -22 -2 C -24 -11, -21 -21, -17 -29 Z" fill="#ffffff"/>
     <path d="M 27 -27 C 35 -15, 35 5, 28 17 C 23 14, 20 7, 22 -2 C 24 -11, 21 -21, 17 -29 Z" fill="#ffffff"/>`);
part('hair-woman-short', 40, 'hair',
  womanCentreCrown()
  + `<path d="M -26 -29 C -37 -11, -36 14, -27 26 C -21 21, -19 12, -22 1 C -25 -11, -21 -23, -16 -30 Z" fill="#ffffff"/>
     <path d="M 26 -29 C 37 -11, 36 14, 27 26 C 21 21, 19 12, 22 1 C 25 -11, 21 -23, 16 -30 Z" fill="#ffffff"/>
     <path d="M -29 18 q 4 6 9 1 M 29 18 q -4 6 -9 1" stroke="#c7c7c7" stroke-width="1.2" fill="none" opacity=".58"/>`);
part('hair-woman-loose', 40, 'hair',
  womanCentreCrown()
  + `<path d="M -26 -30 C -39 -9, -38 22, -28 42 C -21 40, -18 31, -21 20 C -26 5, -23 -17, -16 -31 Z" fill="#ffffff"/>
     <path d="M 26 -30 C 39 -9, 38 22, 28 42 C 21 40, 18 31, 21 20 C 26 5, 23 -17, 16 -31 Z" fill="#ffffff"/>
     <path d="M -29 -8 C -32 8, -30 25, -25 35 M 29 -8 C 32 8, 30 25, 25 35" stroke="#c7c7c7" stroke-width="1.25" fill="none" opacity=".62"/>`);
part('hair-woman-wrapped', 40, 'hair',
  womanCentreCrown()
  + `<path d="M -29 -36 Q 0 -53 29 -36 M -30 -31 Q 0 -47 30 -31 M -28 -26 Q 0 -40 28 -26"
       stroke="#bdbdbd" stroke-width="2" fill="none" opacity=".72"/>`);
// The short Trần crown leaves neither long temple locks nor a nape fall. It is the base for the
// crown-tied brush described by Trần Cương Trung and preserved by Lê Quý Đôn.
part('hair-woman-tran-short', 40, 'hair',
  `<path d="M -29 -18 C -30 -39, -18 -51, 0 -52 C 18 -51, 30 -39, 29 -18
     C 18 -25, -18 -25, -29 -18 Z" fill="#ffffff"/>
   <path d="M -22 -24 Q 0 -33 22 -24" stroke="#c7c7c7" stroke-width="1.2" fill="none" opacity=".58"/>`);

// Artifact-derived Lý–Trần masses. The fan and spiral are reconstructed from surviving heads,
// so the paths preserve the strong silhouette without inventing individual strands.
part('bun-fan-high', 29, 'hair',
  `<path d="M -11 ${TOP - 1} L -22 ${TOP - 25} Q 0 ${TOP - 37} 22 ${TOP - 25} L 11 ${TOP - 1}
     Q 0 ${TOP - 7} -11 ${TOP - 1} Z" fill="#ffffff"/>
   <path d="M -14 ${TOP - 22} Q 0 ${TOP - 29} 14 ${TOP - 22} M -10 ${TOP - 13} Q 0 ${TOP - 19} 10 ${TOP - 13}"
     stroke="#c4c4c4" stroke-width="1.4" fill="none" opacity=".64"/>`);
part('bun-snail-coil', 29, 'hair',
  `<path d="M -12 ${TOP + 5} C -20 ${TOP - 10}, -14 ${TOP - 22}, -4 ${TOP - 21}
     C -8 ${TOP - 29}, 3 ${TOP - 34}, 8 ${TOP - 25} C 19 ${TOP - 20}, 19 ${TOP - 7}, 11 ${TOP + 5} Z" fill="#ffffff"/>
   <path d="M -5 ${TOP - 18} C 8 ${TOP - 26}, 14 ${TOP - 15}, 7 ${TOP - 8} C 2 ${TOP - 3}, -5 ${TOP - 7}, -2 ${TOP - 12}"
     stroke="#c1c1c1" stroke-width="1.5" fill="none" opacity=".72"/>`);
part('bun-side-loops', 29, 'hair',
  `<path d="M -24 -26 C -38 -25, -41 -10, -31 -3 C -23 0, -17 -9, -20 -18 Z" fill="#ffffff"/>
   <path d="M 24 -26 C 38 -25, 41 -10, 31 -3 C 23 0, 17 -9, 20 -18 Z" fill="#ffffff"/>
   <path d="M -32 -19 q -5 7 1 12 M 32 -19 q 5 7 -1 12" stroke="#c4c4c4" stroke-width="1.3" fill="none" opacity=".65"/>`);
part('bun-tran-brush', 29, 'hair',
  `<path d="M -8 ${TOP + 4} C -8 ${TOP - 5}, -5 ${TOP - 14}, 0 ${TOP - 19}
     C 8 ${TOP - 18}, 16 ${TOP - 13}, 18 ${TOP - 8} C 16 ${TOP - 3}, 10 ${TOP}, 4 ${TOP + 1}
     L -8 ${TOP + 4} Z" fill="#ffffff"/>
   <path d="M -5 ${TOP - 3} Q 4 ${TOP - 7} 14 ${TOP - 5}" stroke="#bdbdbd" stroke-width="2" fill="none" opacity=".72"/>`);
// A nape chignon is mostly hidden in a frontal portrait; showing only one outer crescent keeps
// it behind the jaw instead of turning it into a beard. Two mirrors keep the seeded roster from
// leaning in the same direction.
part('bun-nape-right', 29, 'hair',
  `<ellipse cx="21" cy="${CHIN - 12}" rx="7.5" ry="8.5" fill="#ffffff"/>
   <path d="M 18 ${CHIN - 17} q 6 3 4 10" stroke="#c3c3c3" stroke-width="1.2" fill="none" opacity=".68"/>`);
part('bun-nape-left', 29, 'hair',
  `<ellipse cx="-21" cy="${CHIN - 12}" rx="7.5" ry="8.5" fill="#ffffff"/>
   <path d="M -18 ${CHIN - 17} q -6 3 -4 10" stroke="#c3c3c3" stroke-width="1.2" fill="none" opacity=".68"/>`);

// 42 · what goes into the hair. Trâm cài — the pin — is the one piece of jewellery a woman of
// any class might own, so it is the ornament that carries rank least and character most.
part('hairpin', 42, 'none', `<rect x="-3" y="${TOP - 20}" width="6" height="12" rx="2" fill="#b07a24"/>`);
part('hairpin-jade', 42, 'none',
  `<rect x="-2.5" y="${TOP - 20}" width="5" height="12" rx="2" fill="${JADE}"/>
   <circle cx="0" cy="${TOP - 21}" r="2.6" fill="${JADE}"/>`);
part('hairpin-long', 42, 'none',
  `<path d="M -16 ${TOP - 12} L 16 ${TOP - 6}" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round"/>
   <circle cx="-16" cy="${TOP - 12}" r="2.4" fill="${SON}"/>`);
// A plain straight pin driven right through a tall knot and out the other side — one small
// finial at the far end and nothing else. What a woman wore before a court had jade to grant,
// and what the tenth century's men wore too.
part('hairpin-plain', 42, 'none',
  `<path d="M -17 ${TOP - 13} L 17 ${TOP - 17}" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"/>
   <circle cx="18" cy="${TOP - 17}" r="2.4" fill="${GOLD}"/>`);
part('hair-comb', 42, 'none',
  `<path d="M -10 ${TOP - 10} L 10 ${TOP - 10} L 10 ${TOP - 5} L -10 ${TOP - 5} Z" fill="${GOLD_DEEP}"/>
   ${[0, 1, 2, 3].map((i) => `<rect x="${-8 + i * 5}" y="${TOP - 16}" width="1.6" height="6" fill="${GOLD_DEEP}"/>`).join('')}`);
part('hair-flower', 42, 'none',
  `${[0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    return `<ellipse cx="${(15 + Math.cos(a) * 3.4).toFixed(2)}" cy="${(TOP - 6 + Math.sin(a) * 3.4).toFixed(2)}" rx="2.4" ry="2.4" fill="${SON}" opacity=".9"/>`;
  }).join('')}
   <circle cx="15" cy="${TOP - 6}" r="1.8" fill="${GOLD}"/>`);
part('hair-ribbon', 42, 'none',
  `<path d="M -18 ${TOP + 4} q 18 -8 36 0" stroke="${SON}" stroke-width="3" fill="none"/>
   <path d="M 16 ${TOP + 3} q 8 6 3 14" stroke="${SON}" stroke-width="2.4" fill="none"/>`);
part('hair-cord', 42, 'none', `<path d="M -16 ${TOP - 2} q 16 -6 32 0" stroke="${CREAM}" stroke-width="2.2" fill="none" opacity=".9"/>`);
/**
 * The pin that holds a nape chignon — **behind the head, like the chignon it holds.**
 *
 * It runs from x ±18 out to a bead at ±32, at the height of the jaw. At layer 42 — with the
 * ornaments that sit in the hair on top of the crown — that put it in *front* of the face, and a
 * gold needle crossing a cheek horizontally reads as a pipe in the sitter's mouth: it is on the
 * roster contact sheets, on the generated sheets, and it was reported as a face whose parts do
 * not fit each other. `bun-nape-*`, the búi tó này pins, has always been at 29 for exactly this
 * reason — "showing only one outer crescent keeps it behind the jaw" — and the pin belongs on the
 * same side of the head as the hair it is stuck through. What shows is the bead past the
 * silhouette, which is all a frontal portrait should ever show of it.
 */
const napePin = (side, jewel = false) => {
  const startX = side * 18, endX = side * 31;
  return `<path d="M ${startX} ${CHIN - 17} L ${endX} ${CHIN - 11}" stroke="${jewel ? GOLD_DEEP : GOLD}" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="${side * 32}" cy="${CHIN - 10.5}" r="${jewel ? 2.5 : 1.8}" fill="${jewel ? JADE : GOLD}"/>`;
};
part('hairpin-nape-right', 29, 'none', napePin(1));
part('hairpin-nape-right-jade', 29, 'none', napePin(1, true));
part('hairpin-nape-left', 29, 'none', napePin(-1));
part('hairpin-nape-left-jade', 29, 'none', napePin(-1, true));

// 50 · headwear. This is the silhouette that has to survive at 42 px, so it is the richest
// group in the library — and the one that does the most work, because in Đại Việt the hat was
// the office. A khăn vấn is a private man, a mũ cánh chuồn is a mandarin at court, a nón dấu
// is a conscript, and the wing length of the first was written into the 1499 regulations.

// Khăn vấn — cloth wound in coils. Coil count and rake are the whole variation.
const khanVan = (coils, rise, tone) => Array.from({ length: coils }, (_, k) => {
  const y = TOP + 16 - k * (rise);
  return `<path d="M ${-W / 2 - 3} ${y} C ${-W / 2 - 2} ${y - 14}, ${W / 2 + 2} ${y - 14}, ${W / 2 + 3} ${y}
    C ${W / 2 - 1} ${y - 6}, ${-W / 2 + 1} ${y - 6}, ${-W / 2 - 3} ${y} Z" fill="${tone}" opacity="${0.96 - k * 0.05}"/>
    <path d="M ${-W / 2 + 2} ${y - 4} C -14 ${y - 11}, 14 ${y - 11}, ${W / 2 - 2} ${y - 4}" stroke="${LACQUER_EDGE}" stroke-width="1" fill="none" opacity="${0.85 - k * 0.15}"/>`;
}).join('');
part('hat-khanvan', 50, 'none', khanVan(3, 6, LACQUER));
part('hat-khanvan-tall', 50, 'none', khanVan(5, 6, LACQUER));
part('hat-khanvan-low', 50, 'none', khanVan(2, 7, LACQUER));
part('hat-khanvan-brown', 50, 'none', khanVan(3, 6, '#4a3a28'));
part('hat-khanvan-indigo', 50, 'none', khanVan(3, 6, '#26313c'));

// Khăn đóng — the turban sewn to shape rather than wound, with the chữ nhân fold at the front.
const khanDong = (jewel) =>
  `<path d="M ${-W / 2 - 4} ${TOP + 14} C ${-W / 2 - 4} ${TOP - 8}, ${W / 2 + 4} ${TOP - 8}, ${W / 2 + 4} ${TOP + 14} Z" fill="${LACQUER}"/>
   <path d="M ${-W / 2 - 4} ${TOP + 14} C ${-W / 2 - 4} ${TOP + 4}, ${W / 2 + 4} ${TOP + 4}, ${W / 2 + 4} ${TOP + 14} Z" fill="${LACQUER_HI}"/>
   <path d="M -8 ${TOP + 1} l 8 -7 l 8 7" stroke="${LACQUER_EDGE}" stroke-width="1.2" fill="none"/>
   ${jewel ? `<circle cx="0" cy="${TOP + 6}" r="3" fill="${jewel}"/>` : ''}`;
part('hat-khandong', 50, 'none', khanDong(null));
part('hat-khandong-jewel', 50, 'none', khanDong(JADE));
part('hat-khandong-gold', 50, 'none', khanDong(GOLD));
// Khăn xếp — the Nguyễn folded turban: flat pleats stacked, no coil showing.
part('hat-khanxep', 50, 'none',
  `<path d="M ${-W / 2 - 4} ${TOP + 14} C ${-W / 2 - 5} ${TOP - 10}, ${W / 2 + 5} ${TOP - 10}, ${W / 2 + 4} ${TOP + 14} Z" fill="${LACQUER}"/>
   ${[0, 1, 2, 3].map((i) => `<path d="M ${-W / 2 - 2} ${TOP + 10 - i * 5} q ${W / 2 + 2} -4 ${W + 4} 0" stroke="${LACQUER_EDGE}" stroke-width="0.9" fill="none" opacity=".7"/>`).join('')}`);
// Khăn vuông — a plain square of cloth knotted behind. This also supplies the closed-crown
// hair wrapping described for ordinary Lý wear; it is deliberately not the later open-crown
// Nguyễn khăn vấn.
part('hat-khanvuong', 50, 'none',
  `<path d="M ${-W / 2 - 3} ${TOP + 16} C ${-W / 2 - 3} ${TOP - 4}, ${W / 2 + 3} ${TOP - 4}, ${W / 2 + 3} ${TOP + 16}
     C ${W / 2 - 6} ${TOP + 8}, ${-W / 2 + 6} ${TOP + 8}, ${-W / 2 - 3} ${TOP + 16} Z" fill="#4a4238"/>
   <path d="M ${W / 2 - 2} ${TOP + 12} q 9 6 5 16" stroke="#4a4238" stroke-width="3.4" fill="none"/>`);

// Mũ Đinh Tự — the defining Trần civil cap. A 1293 description records dark blue lacquered
// silk held by wire at the brow, rising high in front and bending back to the nape; officials
// added coloured streamers at the rear. The three-quarter lean and rear tail keep that unusual
// profile legible even though the portrait itself is frontal.
const dinhTu = (streamers) =>
  `<path d="M -25 ${TOP + 12} L -24 ${TOP - 1}
     C -23 ${TOP - 14}, -13 ${TOP - 24}, 1 ${TOP - 26}
     C 15 ${TOP - 28}, 25 ${TOP - 17}, 23 ${TOP - 4}
     C 21 ${TOP + 3}, 25 ${TOP + 7}, 25 ${TOP + 12} Z" fill="#1d2a35"/>
   <rect x="-29" y="${TOP + 6}" width="58" height="7" rx="1.5" fill="#17232c"/>
   <path d="M -24 ${TOP + 6} C -9 ${TOP + 1}, 10 ${TOP + 1}, 24 ${TOP + 6}"
     stroke="#59636b" stroke-width="1.5" fill="none" opacity=".9"/>
   <path d="M -19 ${TOP - 5} C -8 ${TOP - 17}, 8 ${TOP - 20}, 19 ${TOP - 11}"
     stroke="#344553" stroke-width="1.2" fill="none" opacity=".8"/>
   <path d="M 22 ${TOP + 4} q 11 7 6 27" stroke="#1d2a35" stroke-width="4" fill="none"/>`
  + (streamers
    ? `<path d="M 25 ${TOP + 10} q 8 8 3 25" stroke="#76506b" stroke-width="2.3" fill="none"/>
       <path d="M 21 ${TOP + 11} q 4 10 -1 27" stroke="#3f6470" stroke-width="2.1" fill="none"/>
       <path d="M -22 ${TOP + 10} q -5 8 -1 21" stroke="#76506b" stroke-width="1.8" fill="none" opacity=".85"/>`
    : '');
part('hat-dinhtu', 50, 'none', dinhTu(false));
part('hat-dinhtu-streamers', 50, 'none', dinhTu(true));

// Phốc đầu / mũ cánh chuồn. Wing length carried rank in the 1499 regulations, so it is three
// parts rather than one — plus the upturned mũ xung thiên, which only a king wears.
for (const [name, wing, boss] of [['short', 17, false], ['long', 26, false], ['grand', 34, true]]) {
  part(`hat-phocdau-${name}`, 50, 'none',
    `<path d="M -25 ${TOP + 10} L -25 ${TOP - 12} C -25 ${TOP - 20}, 25 ${TOP - 20}, 25 ${TOP - 12} L 25 ${TOP + 10} Z" fill="#191713"/>
     <rect x="-29" y="${TOP + 6}" width="58" height="8" rx="2" fill="#191713"/>
     <path d="M -27 ${TOP + 2} q ${-wing} -3 ${-wing} 3 q 0 6 ${wing} 3 Z" fill="#191713"/>
     <path d="M 27 ${TOP + 2} q ${wing} -3 ${wing} 3 q 0 6 ${-wing} 3 Z" fill="#191713"/>
     ${boss ? `<rect x="-7" y="${TOP - 16}" width="14" height="7" rx="2" fill="${GOLD}"/>` : ''}`);
}
part('hat-xungthien', 50, 'none',
  `<path d="M -24 ${TOP + 10} L -24 ${TOP - 12} C -24 ${TOP - 20}, 24 ${TOP - 20}, 24 ${TOP - 12} L 24 ${TOP + 10} Z" fill="#191713"/>
   <rect x="-28" y="${TOP + 6}" width="56" height="8" rx="2" fill="#191713"/>
   <path d="M -26 ${TOP + 2} q -8 -16 -2 -22 q 6 6 8 19 Z" fill="#191713"/>
   <path d="M 26 ${TOP + 2} q 8 -16 2 -22 q -6 6 -8 19 Z" fill="#191713"/>
   <rect x="-8" y="${TOP - 17}" width="16" height="8" rx="2" fill="${GOLD}"/>`);
// Mũ ô sa — plain black gauze, the working cap of a clerk rather than a court officer.
part('hat-osa', 50, 'none',
  `<path d="M -21 ${TOP + 10} L -21 ${TOP - 8} C -21 ${TOP - 15}, 21 ${TOP - 15}, 21 ${TOP - 8} L 21 ${TOP + 10} Z" fill="#211f1a"/>
   <rect x="-24" y="${TOP + 7}" width="48" height="7" rx="2" fill="#211f1a"/>`);
// Mũ bình đính — flat-topped, and mũ tam sơn — three peaks, the ceremonial form.
// Flat-topped, and no wider at the base than the head is: an overhanging brim on a black cap
// reads as a bowler hat, which is the one silhouette this library must never produce.
part('hat-binhdinh', 50, 'none',
  `<path d="M -23 ${TOP + 12} L -21 ${TOP - 11} L 21 ${TOP - 11} L 23 ${TOP + 12} Z" fill="#1f1d18"/>
   <rect x="-21" y="${TOP - 13}" width="42" height="3.4" rx="1" fill="${GOLD_DEEP}" opacity=".85"/>
   <path d="M -22 ${TOP + 4} L 22 ${TOP + 4}" stroke="${LACQUER_EDGE}" stroke-width="1" opacity=".7"/>`);
part('hat-tamson', 50, 'none',
  `<path d="M -24 ${TOP + 10} L -24 ${TOP - 6} L -13 ${TOP - 17} L 0 ${TOP - 7} L 13 ${TOP - 17} L 24 ${TOP - 6} L 24 ${TOP + 10} Z" fill="#1f1d18"/>
   <rect x="-27" y="${TOP + 7}" width="54" height="7" rx="2" fill="#1f1d18"/>
   <circle cx="0" cy="${TOP - 3}" r="2.6" fill="${GOLD}"/>`);
// Mũ đường cân — the scholar's soft cloth cap, no lacquer and no wings.
part('hat-duongcan', 50, 'none',
  `<path d="M -19 ${TOP + 12} C -21 ${TOP - 10}, 21 ${TOP - 10}, 19 ${TOP + 12} Z" fill="#3a352c"/>
   <path d="M -19 ${TOP + 3} q 19 -6 38 0" stroke="#544c3f" stroke-width="1.2" fill="none"/>`);
// Mũ ni — the monk's hood-cap, worn over a shaven scalp in the cold months.
part('hat-muni', 50, 'none',
  `<path d="M ${-W / 2 - 2} ${TOP + 20} C ${-W / 2 - 4} ${TOP - 10}, ${W / 2 + 4} ${TOP - 10}, ${W / 2 + 2} ${TOP + 20}
     C ${W / 2 - 6} ${TOP + 14}, ${-W / 2 + 6} ${TOP + 14}, ${-W / 2 - 2} ${TOP + 20} Z" fill="#8c6a2c"/>`);

// Helms. Đâu mâu is the tall conical war helm; the field forms are a lacquered bowl, a scaled
// bowl with neck lames, and a plain leather cap for a man who commands ten rather than ten
// thousand.
const helmBowl = (fill, rim) =>
  `<path d="M -30 ${TOP + 12} C -32 ${TOP - 16}, 32 ${TOP - 16}, 30 ${TOP + 12} Z" fill="${fill}"/>
   <rect x="-32" y="${TOP + 8}" width="64" height="7" rx="2" fill="${rim}"/>`;
part('hat-helm', 50, 'none',
  helmBowl(STEEL, CHAM)
  + `<path d="M 0 ${TOP - 14} L 0 ${TOP - 26}" stroke="${SON}" stroke-width="3"/>
     <ellipse cx="0" cy="${TOP - 27}" rx="5" ry="4" fill="${SON}"/>`);
part('hat-helm-plume', 50, 'none',
  helmBowl(STEEL, CHAM)
  + `<path d="M 0 ${TOP - 14} q -7 -12 -2 -20 q 7 8 6 20 Z" fill="${SON}"/>
     <path d="M 0 ${TOP - 14} q 8 -11 4 -18" stroke="${GOLD}" stroke-width="1.6" fill="none"/>`);
// Rim wings, not horns. Drawn as a rising pair they read as cat ears at 42 px, which is the
// single most out-of-place silhouette this library has produced; swept low and outward off the
// brow band they read as the lacquered ear-flaps a war helm actually carried.
part('hat-helm-horned', 50, 'none',
  helmBowl(STEEL, CHAM)
  + `<path d="M -31 ${TOP + 8} q -12 0 -15 8 q 8 3 15 0 Z" fill="${LACQUER_HI}"/>
     <path d="M 31 ${TOP + 8} q 12 0 15 8 q -8 3 -15 0 Z" fill="${LACQUER_HI}"/>`);
// Four wide lames, not fourteen narrow ones: at 42 px a fine lattice averages out to a band
// of beads, which reads as a tiara rather than as plate laced in rows.
part('hat-helm-lamellar', 50, 'none',
  helmBowl('#5d635a', CHAM)
  + [0, 1, 2].map((i) =>
    `<path d="M ${-27 + i * 18} ${TOP + 8} L ${-27 + i * 18} ${TOP - 12}" stroke="#8b9186" stroke-width="1.6"/>`).join('')
  + `<path d="M -30 ${TOP - 2} q 30 -6 60 0" stroke="#8b9186" stroke-width="1.6" fill="none"/>
     <ellipse cx="0" cy="${TOP - 18}" rx="4.4" ry="3.6" fill="${GOLD_DEEP}"/>`);
part('hat-helm-daumau', 50, 'none',
  `<path d="M -26 ${TOP + 12} C -26 ${TOP - 24}, 26 ${TOP - 24}, 26 ${TOP + 12} Z" fill="${STEEL}"/>
   <path d="M 0 ${TOP + 10} L 0 ${TOP - 24}" stroke="#4e544c" stroke-width="1.6"/>
   <rect x="-29" y="${TOP + 8}" width="58" height="7" rx="2" fill="${CHAM}"/>
   <path d="M 0 ${TOP - 24} l 0 -8" stroke="${GOLD}" stroke-width="2.4"/>`);
part('hat-helm-leather', 50, 'none',
  helmBowl('#6b533a', '#4a3a28')
  + `<path d="M -26 ${TOP + 2} q 26 -8 52 0" stroke="#4a3a28" stroke-width="1.4" fill="none"/>`);
part('hat-helm-cheeks', 50, 'none',
  helmBowl(STEEL, CHAM)
  + `<path d="M -31 ${TOP + 14} q -3 14 2 22 l 8 -2 q -5 -10 -3 -20 Z" fill="${STEEL}"/>
     <path d="M 31 ${TOP + 14} q 3 14 -2 22 l -8 -2 q 5 -10 3 -20 Z" fill="${STEEL}"/>`);
part('hat-helm-crest', 50, 'none',
  helmBowl(STEEL, CHAM)
  + `<path d="M -8 ${TOP - 15} q 8 -16 16 0 Z" fill="${SON}"/>
     <path d="M 0 ${TOP - 22} l 0 -8" stroke="${GOLD}" stroke-width="2"/>`);
// The tenth century's war helm: a leather-and-bronze bowl under a gilt brow band, a lotus-bud
// finial carrying a straw plume, and lames hanging past the jaw. The wings the 2026
// reconstruction gives it are deliberately left off — swept up as a pair they are exactly the
// cat-ear silhouette this library already had to take back out of `hat-helm-horned` once.
part('hat-helm-dinh', 50, 'none',
  helmBowl('#5a4a34', '#3b2f20')
  + `<rect x="-32" y="${TOP + 8}" width="64" height="4" rx="1.5" fill="${GOLD}" opacity=".92"/>
     <path d="M -29 ${TOP + 1} q 29 -7 58 0" stroke="${GOLD_DEEP}" stroke-width="1.4" fill="none"/>
     <path d="M -31 ${TOP + 15} q 5 10 4 17 l 7 -2 q -4 -8 -4 -15 Z" fill="#4a3a28"/>
     <path d="M 31 ${TOP + 15} q -5 10 -4 17 l -7 -2 q 4 -8 4 -15 Z" fill="#4a3a28"/>
     <path d="M -5 ${TOP - 12} q 5 -7 10 0 q -5 4 -10 0 Z" fill="${GOLD}"/>
     <path d="M 0 ${TOP - 15} q -7 -12 -2 -21 q 7 9 5 21 Z" fill="${STRAW}"/>
     <path d="M 0 ${TOP - 15} q 8 -11 4 -19" stroke="${STRAW_DEEP}" stroke-width="1.5" fill="none"/>`);

// Nón — the leaf hats. The wide flat nón quai thao with its silk chin cords is a woman's; the
// small nón dấu is a soldier's; the tall nón chóp is what a traveller wore in the rain.
part('hat-non', 50, 'none',
  `<path d="M -46 ${TOP + 12} C -30 ${TOP - 26}, 30 ${TOP - 26}, 46 ${TOP + 12} Z" fill="${STRAW}"/>
   <path d="M -34 ${TOP + 6} C -22 ${TOP - 14}, 22 ${TOP - 14}, 34 ${TOP + 6}" stroke="${STRAW_DEEP}" stroke-width="1" fill="none"/>`);
part('hat-non-chop', 50, 'none',
  `<path d="M -40 ${TOP + 12} C -26 ${TOP - 34}, 26 ${TOP - 34}, 40 ${TOP + 12} Z" fill="${STRAW}"/>
   <path d="M -28 ${TOP + 4} C -18 ${TOP - 20}, 18 ${TOP - 20}, 28 ${TOP + 4}" stroke="${STRAW_DEEP}" stroke-width="1" fill="none"/>`);
part('hat-non-dau', 50, 'none',
  `<path d="M -28 ${TOP + 10} C -20 ${TOP - 16}, 20 ${TOP - 16}, 28 ${TOP + 10} Z" fill="#a98b4c"/>
   <rect x="-30" y="${TOP + 8}" width="60" height="5" rx="2" fill="#7d6534"/>`);
part('hat-non-quaithao', 50, 'none',
  `<path d="M -52 ${TOP + 6} C -40 ${TOP - 12}, 40 ${TOP - 12}, 52 ${TOP + 6} Z" fill="${STRAW}"/>
   <ellipse cx="0" cy="${TOP + 6}" rx="52" ry="4" fill="${STRAW_DEEP}" opacity=".7"/>
   <path d="M -30 ${TOP + 8} q -4 16 2 26 M 30 ${TOP + 8} q 4 16 -2 26" stroke="${SON}" stroke-width="2.2" fill="none"/>`);
part('hat-non-batam', 50, 'none',
  `<path d="M -50 ${TOP + 8} C -38 ${TOP - 6}, 38 ${TOP - 6}, 50 ${TOP + 8} Z" fill="#d3b878"/>
   <ellipse cx="0" cy="${TOP + 8}" rx="50" ry="3.6" fill="${STRAW_DEEP}" opacity=".65"/>
   <circle cx="0" cy="${TOP + 1}" r="4" fill="${STRAW_DEEP}" opacity=".8"/>`);
part('hat-non-worker', 50, 'none',
  `<path d="M -42 ${TOP + 14} C -28 ${TOP - 18}, 28 ${TOP - 18}, 42 ${TOP + 14} Z" fill="#b99a5e"/>
   ${[0, 1, 2].map((i) => `<path d="M ${-34 + i * 2} ${TOP + 8 - i * 5} C ${-22 + i} ${TOP - 10 - i * 3}, ${22 - i} ${TOP - 10 - i * 3}, ${34 - i * 2} ${TOP + 8 - i * 5}" stroke="#8a7038" stroke-width="0.9" fill="none" opacity=".7"/>`).join('')}`);

// Khăn mỏ quạ — the crow's-beak headscarf of the northern delta, folded to a point at the brow.
const moQua = (fill) =>
  `<path d="M ${-W / 2 - 4} ${TOP + 34} C ${-W / 2 - 6} ${TOP - 8}, ${W / 2 + 6} ${TOP - 8}, ${W / 2 + 4} ${TOP + 34}
    L ${W / 2 - 4} ${TOP + 34} C ${W / 2 - 2} ${TOP + 6}, 0 ${TOP + 4}, 0 ${TOP + 18}
    C 0 ${TOP + 4}, ${-W / 2 + 2} ${TOP + 6}, ${-W / 2 + 4} ${TOP + 34} Z" fill="${fill}"/>`;
part('hat-moqua', 50, 'none', moQua(LACQUER));
part('hat-moqua-brown', 50, 'none', moQua('#4a3a28'));
part('hat-moqua-tied', 50, 'none',
  moQua(LACQUER)
  + `<path d="M ${-W / 2 - 2} ${TOP + 30} q ${W / 2 + 2} 10 ${W + 4} 0" stroke="${CREAM}" stroke-width="2" fill="none" opacity=".8"/>`);
// Khăn vành dây — the great coiled ceremonial wrap of a Nguyễn court woman. Unmistakable, and
// the only headwear here that is wider than the shoulders.
part('hat-vanhday', 50, 'none',
  [0, 1, 2, 3].map((k) => {
    const y = TOP + 12 - k * 8, rx = 34 - k * 3;
    return `<ellipse cx="0" cy="${y}" rx="${rx}" ry="7" fill="${LACQUER}" opacity="${0.97 - k * 0.03}"/>
      <ellipse cx="0" cy="${y - 1.5}" rx="${rx - 3}" ry="4" fill="none" stroke="${GOLD_DEEP}" stroke-width="0.9" opacity=".55"/>`;
  }).join(''));

// Coronets and crowns.
part('hat-coronet', 50, 'none',
  `<path d="M -22 ${TOP + 8} L -22 ${TOP - 4} L -11 ${TOP - 14} L 0 ${TOP - 6} L 11 ${TOP - 14} L 22 ${TOP - 4} L 22 ${TOP + 8} Z" fill="${GOLD}"/>
   <circle cx="0" cy="${TOP - 2}" r="3.4" fill="${SON}"/>`);
part('hat-coronet-jade', 50, 'none',
  `<path d="M -22 ${TOP + 8} L -22 ${TOP - 4} L -11 ${TOP - 14} L 0 ${TOP - 6} L 11 ${TOP - 14} L 22 ${TOP - 4} L 22 ${TOP + 8} Z" fill="${GOLD_DEEP}"/>
   <circle cx="0" cy="${TOP - 2}" r="3.4" fill="${JADE}"/>`);
part('hat-crown-nhatbinh', 50, 'none',
  `<path d="M -24 ${TOP + 6} L -24 ${TOP - 8} L -12 ${TOP - 18} L 0 ${TOP - 9} L 12 ${TOP - 18} L 24 ${TOP - 8} L 24 ${TOP + 6} Z" fill="${GOLD}"/>
   <circle cx="0" cy="${TOP - 4}" r="3.6" fill="${SON}"/>
   <circle cx="-13" cy="${TOP - 6}" r="2.2" fill="${SON}"/><circle cx="13" cy="${TOP - 6}" r="2.2" fill="${SON}"/>`);
part('hat-crown-phoenix', 50, 'none',
  `<path d="M -25 ${TOP + 6} L -25 ${TOP - 8} L -13 ${TOP - 19} L 0 ${TOP - 10} L 13 ${TOP - 19} L 25 ${TOP - 8} L 25 ${TOP + 6} Z" fill="${GOLD}"/>
   <path d="M 0 ${TOP - 10} q -6 -12 -14 -14 q 6 8 8 16" fill="${SON}" opacity=".92"/>
   <path d="M 0 ${TOP - 10} q 6 -12 14 -14 q -6 8 -8 16" fill="${SON}" opacity=".92"/>
   <circle cx="0" cy="${TOP - 3}" r="3" fill="${SON}"/>`);
part('hat-crown-seven', 50, 'none',
  `<path d="M -25 ${TOP + 6} L -25 ${TOP - 6} L 25 ${TOP - 6} L 25 ${TOP + 6} Z" fill="${GOLD}"/>
   <path d="M -25 ${TOP - 6} L 25 ${TOP - 6}" stroke="${GOLD_DEEP}" stroke-width="1.4"/>
   ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${-18 + i * 6}" cy="${TOP - 8.5}" r="1.7" fill="${GOLD_DEEP}"/>`).join('')}`);
part('hat-veil', 50, 'none',
  `<path d="M ${-W / 2 - 5} ${TOP + 6} C ${-W / 2 - 7} ${TOP - 10}, ${W / 2 + 7} ${TOP - 10}, ${W / 2 + 5} ${TOP + 6}
     C ${W / 2 + 7} ${TOP + 30}, ${-W / 2 - 7} ${TOP + 30}, ${-W / 2 - 5} ${TOP + 6} Z" fill="#3d4a55" opacity=".82"/>`);

// Bands and working headwear.
part('hat-band', 50, 'none',
  `<rect x="${-W / 2 - 3}" y="${TOP + 2}" width="${W + 6}" height="10" rx="3" fill="${SON}"/>
   <path d="M ${W / 2 - 2} ${TOP + 12} q 12 10 6 24" stroke="${SON}" stroke-width="4" fill="none"/>`);
part('hat-band-cloth', 50, 'none',
  `<rect x="${-W / 2 - 3}" y="${TOP + 4}" width="${W + 6}" height="8" rx="3" fill="#4a4238"/>
   <path d="M ${-W / 2 - 1} ${TOP + 12} q -10 8 -5 20" stroke="#4a4238" stroke-width="3.4" fill="none"/>`);
part('hat-band-warrior', 50, 'none',
  `<rect x="${-W / 2 - 4}" y="${TOP + 1}" width="${W + 8}" height="11" rx="2" fill="${CHAM}"/>
   <circle cx="0" cy="${TOP + 6.5}" r="3.4" fill="${GOLD}"/>
   <path d="M ${W / 2 + 1} ${TOP + 12} q 10 12 4 24" stroke="${CHAM}" stroke-width="3.6" fill="none"/>`);
part('hat-band-gold', 50, 'none',
  `<rect x="${-W / 2 - 3}" y="${TOP + 3}" width="${W + 6}" height="9" rx="3" fill="${GOLD_DEEP}"/>
   <circle cx="0" cy="${TOP + 7.5}" r="3" fill="${JADE}"/>`);
part('hat-fur', 50, 'none',
  `<path d="M ${-W / 2 - 6} ${TOP + 16} C ${-W / 2 - 8} ${TOP - 12}, ${W / 2 + 8} ${TOP - 12}, ${W / 2 + 6} ${TOP + 16} Z" fill="#5b4630"/>
   ${Array.from({ length: 9 }, (_, i) => `<path d="M ${-30 + i * 7.5} ${TOP + 15} q 2 -6 4 0" stroke="#7a6244" stroke-width="1.6" fill="none"/>`).join('')}`);

part('scalp-shaven', 50, 'skinLight',
  `<path d="M ${-W / 2 + 1} ${TOP + 20} C ${-W / 2 - 1} ${TOP - 2}, ${W / 2 + 1} ${TOP - 2}, ${W / 2 - 1} ${TOP + 20}
    C ${W / 2 - 5} ${TOP + 12}, ${-W / 2 + 5} ${TOP + 12}, ${-W / 2 + 1} ${TOP + 20} Z" fill="#ffffff" opacity=".55"/>`);
part('scalp-dots', 51, 'skinShadow',
  [0, 1, 2].map((i) => `<circle cx="${-8 + i * 8}" cy="${TOP + 8}" r="2" fill="#ffffff" opacity=".5"/>`).join(''));
// Nine moxibustion scars in three rows — the ordination mark of a fully professed monastic.
part('scalp-dots-nine', 51, 'skinShadow',
  [0, 1, 2].map((r) => [0, 1, 2].map((c) =>
    `<circle cx="${-8 + c * 8}" cy="${TOP + 4 + r * 6}" r="1.8" fill="#ffffff" opacity=".5"/>`).join('')).join(''));

// 52 · earrings. Khuyên tai were worn by both sexes in the older centuries; the jade drop is
// the one a highland or Chăm-descended courtier is likeliest to be wearing.
part('earring-jade', 52, 'none',
  `<circle cx="${-W / 2 - 1}" cy="0" r="2.4" fill="${JADE}"/><circle cx="${W / 2 + 1}" cy="0" r="2.4" fill="${JADE}"/>`);
part('earring-gold', 52, 'none',
  `<circle cx="${-W / 2 - 1}" cy="0" r="2.6" fill="none" stroke="${GOLD}" stroke-width="1.4"/>
   <circle cx="${W / 2 + 1}" cy="0" r="2.6" fill="none" stroke="${GOLD}" stroke-width="1.4"/>`);
part('earring-drop', 52, 'none',
  `<path d="M ${-W / 2 - 1} -2 l 0 5" stroke="${GOLD}" stroke-width="1.2"/><circle cx="${-W / 2 - 1}" cy="5" r="2.2" fill="${SON}"/>
   <path d="M ${W / 2 + 1} -2 l 0 5" stroke="${GOLD}" stroke-width="1.2"/><circle cx="${W / 2 + 1}" cy="5" r="2.2" fill="${SON}"/>`);
part('earring-pearl', 52, 'none',
  `<circle cx="${-W / 2 - 1}" cy="1" r="2.2" fill="${CREAM}"/><circle cx="${W / 2 + 1}" cy="1" r="2.2" fill="${CREAM}"/>`);

// 60 · brows, eyes, nose, mouth. Four families of a dozen each, because these are what stop a
// roster of two hundred from reading as one face in many hats — and unlike headwear, none of
// them carries any historical claim, so they are free to vary as widely as the geometry allows.
for (const [name, curve, drop, weight, len] of [
  ['flat', -4, 0, 2.6, 10.5],
  ['arched', -6, 2, 2.6, 10.5],
  ['angled', -2, -2, 2.6, 10.5],
  ['thick', -4, 0, 3.8, 11],
  ['thin', -4, 1, 1.6, 10],
  ['straight', 0, 0, 2.6, 11],
  ['bushy', -5, -1, 4.6, 12],
  ['sparse', -3, 2, 1.3, 8.5],
  ['raised', -6, -3, 2.4, 10],
  ['low', -3, 3, 3, 10.5],
  ['sharp', 1, -3, 2.4, 11.5],
  ['soft', -7, 1, 2.2, 9.5],
  ['heavy', -2, 1, 4.2, 10],
  ['short', -4, 0, 2.8, 7.5],
]) {
  part(`brow-${name}`, 60, 'hair', brows(curve, drop, weight, len));
}

for (const [name, lid, tilt, iris] of [
  ['almond', 0, 0, 2.5],
  ['wide', -1.4, 0, 2.7],
  ['narrow', 1.2, 0, 2.3],
  ['hooded', 0.9, 0.6, 2.4],
  ['round', -2.2, 0, 2.9],
  ['upturned', 0, -1.5, 2.5],
  ['downturned', 0, 1.5, 2.5],
  ['sharp', 0.7, -1.1, 2.2],
  ['gentle', -0.7, 0.5, 2.6],
  ['deepset', 1.1, -0.3, 2.2],
  ['bright', -1.8, -0.8, 3.0],
  ['crescent', 2.1, 0, 2.0],
  ['keen', 0.4, -0.6, 2.1],
  ['tired', 1.5, 0.8, 2.3],
]) {
  part(`eyes-${name}`, 62, 'none', pairEyes(lid, tilt, iris));
}

// A bridge that fades and a single nostril turn. Longer strokes read as a hook at 1.16×.
const nose = (drop, flick, weight = 1.3) =>
  `<path d="M -1 ${EYE_Y + 5} q -1.6 ${drop} 1.2 ${drop + 2} q ${flick} 0.8 ${flick + 0.8} -1.4"
     stroke="#ffffff" stroke-width="${weight}" fill="none" stroke-linecap="round" opacity=".85"/>`;
for (const [name, drop, flick, weight] of [
  ['straight', 7, 2.4, 1.3],
  ['long', 10, 2.6, 1.3],
  ['soft', 5, 2.2, 1.3],
  ['broad', 7, 3.6, 1.7],
  ['snub', 4, 2.8, 1.5],
  ['aquiline', 11, 1.8, 1.2],
  ['narrow', 8, 1.6, 1.05],
  ['flat', 5, 3.4, 1.6],
  ['round', 6, 3.0, 1.5],
  ['fine', 9, 1.9, 1.0],
  ['strong', 9, 3.2, 1.8],
  ['short', 4, 2.0, 1.25],
]) {
  part(`nose-${name}`, 64, 'skinShadow', nose(drop, flick, weight));
}

const MY = CHIN - 12;
const lip = (half, curve, weight = 2) =>
  `<path d="M ${-half} ${MY} q ${half} ${curve} ${half * 2} 0" stroke="#6b3226" stroke-width="${weight}" fill="none" stroke-linecap="round"/>`;
// Barely curved rather than dead straight: a perfectly flat stroke reads as a dash, and it
// also measures as a zero-height box, which the crop below cannot size.
for (const [name, half, curve, weight] of [
  ['neutral', 5, 2, 2],
  ['smile', 6.5, 3.4, 2],
  ['firm', 6.5, 0.6, 2],
  ['wide', 8.5, 2.6, 2],
  ['small', 4, 1.8, 1.9],
  ['downturned', 6, -2.6, 2],
  ['pursed', 3.6, 3.0, 2.4],
  ['thin', 6.5, 1.2, 1.4],
  ['full', 6, 3.0, 3.2],
  ['grim', 7.5, -1.4, 2.2],
  ['soft', 5.5, 2.4, 2.6],
  ['broad-smile', 9, 4.2, 2],
]) {
  part(`mouth-${name}`, 66, 'none', lip(half, curve, weight));
}
// Nhuộm răng đen — lacquered teeth, a beauty standard for centuries, not a defect.
const lacqueredMouth = (half, curve) =>
  `<path d="M ${-half - 2.5} ${MY - 0.5} q ${half + 2.5} ${curve + 1.6} ${(half + 2.5) * 2} 0 q ${-(half + 2.5)} -1.6 ${-(half + 2.5) * 2} 0 Z" fill="#15120f"/>
   <path d="M ${-half - 3} ${MY - 1} q ${half + 3} ${curve + 2.4} ${(half + 3) * 2} 0" stroke="#6b3226" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
part('mouth-lacquered', 66, 'none', lacqueredMouth(5, 2));
part('mouth-lacquered-smile', 66, 'none', lacqueredMouth(6.5, 3));
part('mouth-lacquered-firm', 66, 'none', lacqueredMouth(6, 0.6));
// Ăn trầu — a betel quid stains the lips carmine, which is a different mark from the black
// lacquer and often worn with it.
part('mouth-betel', 66, 'none',
  `<path d="M -6 ${MY - 1} q 6 4.4 12 0 q -6 3.2 -12 0 Z" fill="#8e2f2a"/>
   <path d="M -6.5 ${MY - 1} q 6.5 3.6 13 0" stroke="#5c2320" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);

// 70 · facial hair
part('beard-moustache', 70, 'hair', `<path d="M -11 ${MY - 5} q 11 -4 22 0 q -11 6 -22 0 Z" fill="#ffffff"/>`);
part('beard-moustache-thin', 70, 'hair', `<path d="M -10 ${MY - 5} q 10 -3 20 0 q -10 3.4 -20 0 Z" fill="#ffffff" opacity=".9"/>`);
part('beard-moustache-wide', 70, 'hair', `<path d="M -15 ${MY - 6} q 15 -5 30 0 q -15 7 -30 0 Z" fill="#ffffff"/>`);
part('beard-goatee', 70, 'hair', `<path d="M -7 ${MY + 5} q 7 10 14 0 q -7 -4 -14 0 Z" fill="#ffffff"/>`);
part('beard-goatee-long', 70, 'hair', `<path d="M -6 ${MY + 5} q 6 22 12 0 q -6 -4 -12 0 Z" fill="#ffffff"/>`);
part('beard-long', 70, 'hair',
  `<path d="M -11 ${MY - 5} q 11 -4 22 0 q -11 6 -22 0 Z" fill="#ffffff"/>
   <path d="M -9 ${MY + 4} q 9 26 18 0 q -9 -5 -18 0 Z" fill="#ffffff" opacity=".92"/>`);
part('beard-full', 70, 'hair',
  `<path d="M -17 ${MY - 6} C -19 ${MY + 22}, 17 ${MY + 22}, 17 ${MY - 6} C 8 ${MY + 2}, -8 ${MY + 2}, -17 ${MY - 6} Z" fill="#ffffff" opacity=".9"/>`);
part('beard-full-short', 70, 'hair',
  `<path d="M -15 ${MY - 5} C -16 ${MY + 13}, 15 ${MY + 13}, 15 ${MY - 5} C 7 ${MY + 2}, -7 ${MY + 2}, -15 ${MY - 5} Z" fill="#ffffff" opacity=".9"/>`);
// Râu ba chòm — the three-tuft beard of the scholar-official in every temple portrait.
part('beard-threepart', 70, 'hair',
  `<path d="M -12 ${MY - 5} q 12 -4 24 0 q -12 6 -24 0 Z" fill="#ffffff"/>
   <path d="M -3 ${MY + 4} q 3 24 6 0 q -3 -4 -6 0 Z" fill="#ffffff" opacity=".92"/>
   <path d="M -15 ${MY + 1} q 3 16 6 2 Z" fill="#ffffff" opacity=".8"/>
   <path d="M 9 ${MY + 1} q 3 14 6 0 Z" fill="#ffffff" opacity=".8"/>`);
part('beard-forked', 70, 'hair',
  `<path d="M -11 ${MY - 5} q 11 -4 22 0 q -11 6 -22 0 Z" fill="#ffffff"/>
   <path d="M -8 ${MY + 4} q 4 20 -1 26 q 8 -8 9 -22 Z" fill="#ffffff" opacity=".9"/>
   <path d="M 8 ${MY + 4} q -4 20 1 26 q -8 -8 -9 -22 Z" fill="#ffffff" opacity=".9"/>`);
part('beard-wispy', 70, 'hair',
  `<path d="M -8 ${MY + 3} q 3 16 1 22 M 0 ${MY + 4} q 1 18 0 24 M 8 ${MY + 3} q -3 16 -1 22"
     stroke="#ffffff" stroke-width="1.6" fill="none" opacity=".85" stroke-linecap="round"/>`);
part('beard-chinstrap', 70, 'hair',
  `<path d="M -19 ${MY - 8} C -20 ${MY + 16}, 19 ${MY + 16}, 19 ${MY - 8} C 15 ${MY + 8}, -15 ${MY + 8}, -19 ${MY - 8} Z" fill="#ffffff" opacity=".8"/>`);
part('beard-stubble', 70, 'hair',
  `<path d="M -16 ${MY - 4} C -17 ${MY + 14}, 16 ${MY + 14}, 16 ${MY - 4} C 8 ${MY + 4}, -8 ${MY + 4}, -16 ${MY - 4} Z" fill="#ffffff" opacity=".42"/>`);
part('beard-patriarch', 70, 'hair',
  `<path d="M -13 ${MY - 6} q 13 -5 26 0 q -13 7 -26 0 Z" fill="#ffffff"/>
   <path d="M -12 ${MY + 3} C -14 ${MY + 34}, 14 ${MY + 34}, 12 ${MY + 3} q -12 -5 -24 0 Z" fill="#ffffff" opacity=".9"/>`);

// 72 · marks the run earns or the era demands
part('mark-age', 72, 'skinShadow',
  `<path d="M -22 ${EYE_Y + 12} q 4 3 8 1" stroke="#ffffff" stroke-width="1" fill="none" opacity=".6"/>
   <path d="M 22 ${EYE_Y + 12} q -4 3 -8 1" stroke="#ffffff" stroke-width="1" fill="none" opacity=".6"/>
   <path d="M -14 ${TOP + 30} q 14 -3 28 0" stroke="#ffffff" stroke-width="1" fill="none" opacity=".45"/>`);
part('mark-age-deep', 72, 'skinShadow',
  `<path d="M -22 ${EYE_Y + 12} q 4 3 8 1 M -21 ${EYE_Y + 16} q 4 3 7 1" stroke="#ffffff" stroke-width="1" fill="none" opacity=".6"/>
   <path d="M 22 ${EYE_Y + 12} q -4 3 -8 1 M 21 ${EYE_Y + 16} q -4 3 -7 1" stroke="#ffffff" stroke-width="1" fill="none" opacity=".6"/>
   <path d="M -14 ${TOP + 28} q 14 -3 28 0 M -13 ${TOP + 34} q 13 -3 26 0" stroke="#ffffff" stroke-width="1" fill="none" opacity=".5"/>`);
part('mark-scar', 72, 'skinShadow', `<path d="M ${-EX - 6} ${EYE_Y - 12} l -3 16" stroke="#ffffff" stroke-width="1.8" opacity=".9"/>`);
part('mark-scar-cheek', 72, 'skinShadow', `<path d="M ${EX + 4} ${EYE_Y + 6} l 4 12" stroke="#ffffff" stroke-width="1.8" opacity=".85"/>`);
part('mark-scar-brow', 72, 'skinShadow', `<path d="M ${EX + 1} ${EYE_Y - 14} l 7 5" stroke="#ffffff" stroke-width="1.6" opacity=".85"/>`);
part('mark-mole', 72, 'skinShadow', `<circle cx="${-EX - 3}" cy="${MY - 6}" r="1.4" fill="#ffffff" opacity=".8"/>`);
part('mark-freckles', 72, 'skinShadow',
  [[-12, -4], [-7, -1], [8, -3], [13, 0], [-2, 1], [4, -6]]
    .map(([dx, dy]) => `<circle cx="${dx}" cy="${EYE_Y + 12 + dy}" r="0.9" fill="#ffffff" opacity=".55"/>`).join(''));
part('mark-dimples', 72, 'skinShadow',
  `<path d="M -14 ${MY - 1} q -1 3 0 5 M 14 ${MY - 1} q 1 3 0 5" stroke="#ffffff" stroke-width="1" fill="none" opacity=".55"/>`);
part('mark-brand', 72, 'skinShadow',
  `<path d="M ${-EX - 8} ${EYE_Y + 16} l 6 0 M ${-EX - 5} ${EYE_Y + 13} l 0 6" stroke="#ffffff" stroke-width="1.4" opacity=".7"/>`);
// Court tattoo. Under the Lý and Trần this was the price of entry to the palace — borne by
// emperors, every mandarin and the women of the harem alike, in patterns the sources compare
// to the designs on Đông Sơn bronze drums.
part('mark-tattoo', 73, 'none',
  // On the throat and the outer temple, clear of the eye. An earlier placement ran a stroke
  // straight across the left eye, which reads as a smudge on the lens rather than as ink.
  // Small and low-contrast on purpose. Spanning the throat, this read as a wrinkled neck
  // rather than as ink, and at 0.32× any busy face marking is simply noise.
  `<path d="M 6.5 ${NECK - 7} q 3.2 4 0 8" stroke="${CHAM}" stroke-width="1.2" fill="none" opacity=".5" stroke-linecap="round"/>`);
part('mark-tattoo-court', 74, 'none',
  `<circle cx="-20" cy="${TOP + 30}" r="2.4" fill="none" stroke="${CHAM}" stroke-width="1.2" opacity=".5"/>`);
part('mark-tattoo-drum', 74, 'none',
  `<circle cx="-20" cy="${TOP + 30}" r="3.2" fill="none" stroke="${CHAM}" stroke-width="1" opacity=".45"/>
   <circle cx="-20" cy="${TOP + 30}" r="1.2" fill="${CHAM}" opacity=".45"/>`);
part('mark-tattoo-wave', 74, 'none',
  `<path d="M 4 ${NECK - 9} q 3 3 0 6 q -3 3 0 6" stroke="${CHAM}" stroke-width="1.1" fill="none" opacity=".48" stroke-linecap="round"/>`);
part('mark-warpaint', 73, 'none',
  `<path d="M ${-EX - 9} ${EYE_Y - 3} l 18 0 M ${EX - 9} ${EYE_Y - 3} l 18 0" stroke="${SON}" stroke-width="2.6" opacity=".55"/>`);

// 80 · rank seal. Deliberately a notched lacquer chop rather than a written character — the
// portrait should not depend on a script the player may not read.
for (const [name, notches] of [['rare', 1], ['epic', 2], ['legendary', 3]]) {
  part(`rank-${name}`, 80, 'none',
    `<rect x="44" y="60" width="16" height="16" rx="2" fill="${SON}"/>
     ${Array.from({ length: notches }, (_, i) =>
       `<rect x="47" y="${63 + i * 4}" width="10" height="2" rx="1" fill="#f3e6c4" opacity=".92"/>`).join('')}`);
}

// ── measure, crop, emit ─────────────────────────────────────────────────────
const svgDoc = (body, view) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" width="${view.w}" height="${view.h}">${body}</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<body style="margin:0">${svgDoc(
    PARTS.map((p) => `<g id="m-${p.key}">${p.body}</g>`).join(''),
    VIEW,
  )}</body>`,
);
const boxes = await page.evaluate((keys) => {
  const out = {};
  for (const k of keys) {
    const el = document.getElementById('m-' + k);
    const b = el.getBBox();
    out[k] = { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  return out;
}, PARTS.map((p) => p.key));

// The generated studies are build inputs, not literal costume references. Downsample them to a
// small neutral tile before embedding so the committed atlas stays light and every portrait
// sees the same restrained frequency of weave at roster scale.
async function materialTile(path) {
  if (!existsSync(path)) throw new Error(`missing generated face material: ${path}`);
  const source = `data:image/png;base64,${readFileSync(path).toString('base64')}`;
  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, 128, 128);
    return canvas.toDataURL('image/png');
  }, source);
}
const materialTextures = {
  cloth: await materialTile(CLOTH_SOURCE),
  gauze: await materialTile(GAUZE_SOURCE),
};
await browser.close();

mkdirSync(OUT_SVG, { recursive: true });
const PAD = 2;                    // room for stroke caps, which getBBox does not include
const manifest = [];
const written = new Set();
const prepared = PARTS.map((p) => {
  const b = boxes[p.key];
  if (!b || (b.w === 0 && b.h === 0)) throw new Error(`part "${p.key}" measured empty — check its paths`);
  return {
    part: p,
    view: {
      x: Math.floor(b.x - PAD), y: Math.floor(b.y - PAD),
      w: Math.max(4, Math.ceil(b.w + PAD * 2)), h: Math.max(4, Math.ceil(b.h + PAD * 2)),
    },
  };
});

for (const { part: p, view } of prepared) {
  // `getBBox` measures geometry, not ink: a stroked path extends half its width past the box
  // on every side, and a flat one measures zero in the thin axis. Both are handled by padding
  // and a floor, or strokes get clipped at the crop.
  const file = join(OUT_SVG, `${p.key}.svg`);
  const svg = svgDoc(p.body, view) + '\n';
  if (CHECK) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== svg) {
      console.error(`stale: ${file}`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(file, svg);
  }
  written.add(`${p.key}.svg`);
  // Centre of the part in design space — what the renderer positions the Image at.
  manifest.push({ key: p.key, layer: p.layer, tint: p.tint, cx: view.x + view.w / 2, cy: view.y + view.h / 2, w: view.w, h: view.h });
}

function materialFor(key) {
  if (/^(robe-(body|slim|sloped|broad|square)|collar-|sash-|yem|kesa)/.test(key)) return 'cloth';
  if (/^hat-(khan|phocdau|xungthien|osa|binhdinh|tamson|duongcan|dinhtu|moqua|vanhday|band|veil|muni)/.test(key)) return 'gauze';
  return undefined;
}

// Height-sorted shelf packing keeps the transparent atlas compact while leaving a two-pixel
// moat around every frame, so linear filtering cannot bleed a gold crown into a black cap.
const packed = [...prepared]
  .map((entry) => ({
    ...entry,
    w: entry.view.w * RASTER_SCALE,
    h: entry.view.h * RASTER_SCALE,
  }))
  .sort((a, b) => b.h - a.h || b.w - a.w || a.part.key.localeCompare(b.part.key));
let shelfX = ATLAS_GAP;
let shelfY = ATLAS_GAP;
let shelfH = 0;
for (const entry of packed) {
  if (shelfX + entry.w + ATLAS_GAP > ATLAS_WIDTH) {
    shelfX = ATLAS_GAP;
    shelfY += shelfH + ATLAS_GAP;
    shelfH = 0;
  }
  entry.x = shelfX;
  entry.y = shelfY;
  shelfX += entry.w + ATLAS_GAP;
  shelfH = Math.max(shelfH, entry.h);
}
const usedHeight = shelfY + shelfH + ATLAS_GAP;
const atlasHeight = 2 ** Math.ceil(Math.log2(usedHeight));

const atlasDefs = [
  `<pattern id="material-cloth" width="128" height="128" patternUnits="userSpaceOnUse"><image href="${materialTextures.cloth}" width="128" height="128"/></pattern>`,
  `<pattern id="material-gauze" width="128" height="128" patternUnits="userSpaceOnUse"><image href="${materialTextures.gauze}" width="128" height="128"/></pattern>`,
  ...packed.flatMap((entry, index) => materialFor(entry.part.key)
    ? [`<clipPath id="part-clip-${index}" clipPathUnits="userSpaceOnUse">${entry.part.body}</clipPath>`]
    : []),
].join('');
const atlasBody = packed.map((entry, index) => {
  const { part: p, view, x, y } = entry;
  const transform = `translate(${x - view.x * RASTER_SCALE} ${y - view.y * RASTER_SCALE}) scale(${RASTER_SCALE})`;
  const material = materialFor(p.key);
  const texture = material
    ? `<rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="url(#material-${material})"
        clip-path="url(#part-clip-${index})" opacity="${material === 'cloth' ? '.14' : '.11'}" style="mix-blend-mode:multiply"/>`
    : '';
  return `<g transform="${transform}">${p.body}${texture}</g>`;
}).join('');
const atlasSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ATLAS_WIDTH}" height="${atlasHeight}" viewBox="0 0 ${ATLAS_WIDTH} ${atlasHeight}"><defs>${atlasDefs}</defs>${atlasBody}</svg>\n`;

const frames = Object.fromEntries(packed
  .sort((a, b) => a.part.key.localeCompare(b.part.key))
  .map((entry) => [entry.part.key, {
    frame: { x: entry.x, y: entry.y, w: entry.w, h: entry.h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: entry.w, h: entry.h },
    sourceSize: { w: entry.w, h: entry.h },
  }]));
const atlasJson = `${JSON.stringify({
  frames,
  meta: {
    app: 'Vạn Thắng face atlas generator',
    version: '1.0',
    image: 'atlas.svg',
    format: 'RGBA8888',
    size: { w: ATLAS_WIDTH, h: atlasHeight },
    scale: '1',
  },
}, null, 2)}\n`;

for (const [file, content] of [[OUT_ATLAS_SVG, atlasSvg], [OUT_ATLAS_JSON, atlasJson]]) {
  if (CHECK) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== content) {
      console.error(`stale: ${file}`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(file, content);
  }
}
written.add('atlas.svg');

// Sweep files the library no longer defines, so a renamed part cannot linger and get loaded.
if (!CHECK) {
  for (const f of readdirSync(OUT_SVG)) {
    if (f.endsWith('.svg') && !written.has(f)) unlinkSync(join(OUT_SVG, f));
  }
}

const ts = `/* eslint-disable */
// GENERATED by scripts/build-faces.mjs — do not edit. Run \`node scripts/build-faces.mjs\`.
//
// \`cx\`/\`cy\` are the part's centre in portrait design space, measured from its real rendered
// bounding box, so the renderer can place every layer with a single \`setPosition\` and no
// per-part fudging. \`tint\` names the colour slot the run multiplies the part by.

export type FaceTintSlot = 'none' | 'skin' | 'skinShadow' | 'skinLight' | 'hair' | 'robe' | 'robeDark' | 'robeLight';

export interface FacePartDef {
  key: string;
  /** Paint order, low to high. */
  layer: number;
  tint: FaceTintSlot;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export const FACE_PART_DEFS: readonly FacePartDef[] = ${JSON.stringify(manifest, null, 2)} as const;

/** Design-space bounds every part is authored against. */
export const FACE_VIEW = ${JSON.stringify(VIEW)} as const;
`;

if (CHECK) {
  if (!existsSync(OUT_MANIFEST) || readFileSync(OUT_MANIFEST, 'utf8') !== ts) {
    console.error(`stale: ${OUT_MANIFEST}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`faces up to date — ${PARTS.length} parts, ${ATLAS_WIDTH}×${atlasHeight} atlas`);
} else {
  mkdirSync('src/ui/faces', { recursive: true });
  writeFileSync(OUT_MANIFEST, ts);
  console.log(`wrote ${PARTS.length} parts → ${OUT_SVG}/, ${ATLAS_WIDTH}×${atlasHeight} atlas, and ${OUT_MANIFEST}`);
}
