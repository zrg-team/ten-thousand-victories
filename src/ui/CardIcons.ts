import Phaser from 'phaser';
import { PIGMENT } from './ink/palette';

/**
 * Small hand-inked glyphs for the prompt cards.
 *
 * Code-native symbols share the print palette with the illustrated cards and map assets.
 * Broad silhouettes, flat pigment and warm-black contours stay readable at phone size.
 *
 * They also replace the emoji that had been hardcoded *inside* the wave-response card's
 * translated strings (`"⚔ Send {hero} and raise a host"`) — icons in translated text is the
 * least maintainable place they could live, and it meant one screen had them and no other did.
 *
 * Ids are deliberately about *meaning*, not about the card that uses them: `coin` serves a
 * bribe, a tribute payment and a buy-off alike, so twenty glyphs cover forty-odd options.
 */
export type CardIconId =
  | 'coin' | 'purse' | 'scroll' | 'blade' | 'shield' | 'banner'
  | 'hut' | 'ladder' | 'crown' | 'scales' | 'person' | 'grain'
  | 'herd' | 'cart' | 'branch' | 'retreat' | 'spark' | 'wall'
  | 'hourglass' | 'book' | 'skull' | 'cup' | 'hammer' | 'gear' | 'globe' | 'phone' | 'install'
  // The way out of the cabinet. Not `retreat`: that arrow is already the word "back" everywhere
  // else in the game, and a front page whose last control means "back" says nothing about leaving.
  | 'door'
  // The world clock's two faces. Not the hourglass: its crossed strokes are mud at the exits
  // row's 14-unit scale, and pause/play are the two glyphs nobody has ever had to learn.
  | 'pause' | 'play' | 'heart' | 'balance'
  // The five shapes of the fight screen's fast dial. `shield` and `blade` are spoken for
  // elsewhere, and a formation chip that shared a glyph with a conquest method would read as
  // the same thing twice, so these are their own.
  | 'spears' | 'horse' | 'skirmish' | 'tortoise' | 'bows';

/** Side of the square a glyph is drawn into, centred on the container's origin. */
export const CARD_ICON_SIZE = 26;

/**
 * Every option id in the mode, mapped onto a glyph. Unknown ids fall through to `undefined`
 * so a new option renders without one rather than crashing or drawing something misleading.
 */
const BY_OPTION: Record<string, CardIconId> = {
  // Founding advantages — the reign's opening card. Each is a different first move, so each
  // needs a different glyph; without these they all fell through to the same crown.
  'cam-quan': 'blade',
  'kho-lam': 'grain',
  'duc-tien': 'coin',
  'long-dan': 'person',
  'tho-ca': 'hammer',
  'cua-ai': 'wall',
  'quan-so': 'banner',
  'chieu-hien': 'scroll',

  // Conquest methods
  bribe: 'coin',
  diplomacy: 'scroll',
  intimidation: 'blade',
  settle: 'hut',
  occupy: 'banner',
  siege: 'ladder',

  // Wave response
  'send-host': 'blade',
  fortify: 'wall',
  'buy-off': 'coin',
  'hire-mercenaries': 'purse',
  endure: 'shield',

  // Famine
  'buy-grain': 'grain',
  'slaughter-herds': 'herd',
  requisition: 'cart',

  // Rival demands
  pay: 'coin',
  refuse: 'blade',
  submit: 'crown',
  defy: 'blade',

  // Envoy
  gift: 'purse',
  trade: 'scales',
  tribute: 'coin',
  ambassador: 'scroll',

  // Battle
  press: 'blade',
  hold: 'shield',
  retreat: 'retreat',
  auto: 'banner',

  // Court
  reserve: 'hourglass',

  // Draft / law
  skip: 'hourglass',
  hold_: 'shield',
};

/**
 * The Chronicle's own option ids, matched a word at a time.
 *
 * `BY_OPTION` is a table of the mode's *system* options, and there are forty of them. A story
 * option id is a phrase in one of two languages — `dot-kho-truoc-mat-chung`, `giu-lai`,
 * `pay-the-ransom`, `send-them-home` — and there are a hundred and ninety-nine of them, of which
 * exactly **one** (`refuse`) ever matched. Every story card in the game was an undifferentiated
 * wall of text.
 *
 * Enumerating them would be a table nobody keeps in step with the catalogue, so this reads the
 * words the id is already made of, Vietnamese and English alike. It is not a preview: the glyph
 * only ever restates a word already printed on the card in the option's own title.
 *
 * First match wins, so the order is meaning-first — a refusal is a refusal whatever it is
 * refusing, which is why the negatives sit at the top.
 */
const BY_TOKEN: Array<[RegExp, CardIconId]> = [
  [/^(khong|no|not|refuse|dismiss|decline|de|bo|thoi|never)$/, 'retreat'],
  [/^(rut|lui|ve|retreat|withdraw|back|home|que)$/, 'retreat'],
  [/^(doi|wait|later|yet|cho|chua|hoan|hold|nothing|enough|du|quieter|quiet|festival)$/, 'hourglass'],
  [/^(chet|kill|die|mat|slain|lost|hang|execute)$/, 'skull'],
  [/^(danh|fight|attack|strike|storm|blade|sword|guom|chem|kiem|tien|vanguard|dau|cat|arrows|chan|hunt)$/, 'blade'],
  [/^(giu|keep|defend|shield|thu|canh|guard|watch|double|stays|stay|shut)$/, 'shield'],
  [/^(dot|burn|fire|lua|spark)$/, 'spark'],
  [/^(coc|dyke|wall|walls|ramparts|fortify|thanh|luy|de|ai|pass)$/, 'wall'],
  [/^(vang|gold|tien|pay|ransom|buy|mua|bribe|coin|bac|price|luong)$/, 'coin'],
  [/^(kho|treasury|purse|hoard|shelter|cap|issue|give|grant|tang|gift)$/, 'purse'],
  [/^(quan|host|army|muster|banner|co|dao|linh|lead|dan|corvee|march)$/, 'banner'],
  [/^(gao|grain|rice|com|food|luong|harvest|granary|stores)$/, 'grain'],
  [/^(hoa|peace|truce|letter|thu|proclamation|hich|write|chieu|sac|say|answer|noi|read|doc|declare|proclaim|believe|hear|listen|nghe|wrote|notice|print)$/, 'scroll'],
  [/^(nguoi|hero|him|her|seat|phong|appoint|tuong|man|son|child|cau|goi|summon|trieu|physicians|thay)$/, 'person'],
  [/^(lang|village|nha|home|settle|hut|dan)$/, 'hut'],
  [/^(court|council|hoi|assembly|vote|elders|scales|law|le|convene|decide|enact|dissolve|quyet|accept|agree|nhan|match|allow|let)$/, 'scales'],
  [/^(vua|king|crown|throne|ngoi|emperor|mine|earned|invent|claim|chiem|lay|take)$/, 'crown'],
  [/^(xay|build|forge|ren|make|works|hammer)$/, 'hammer'],
  [/^(trau|herd|buffalo|ngua|horse|thuyen)$/, 'herd'],
  [/^(bien|border|sea|song|river|water|nuoc)$/, 'branch'],
];

/** Resolves an option id — including the `court:`/`governor:`/`general:`/`tax:` prefixes. */
export function iconForOption(optionId: string): CardIconId | undefined {
  if (optionId.startsWith('court:')) return 'scales';
  if (optionId.startsWith('governor:')) return 'person';
  if (optionId.startsWith('general:')) return 'blade';
  if (optionId.startsWith('tax:')) return 'coin';
  if (optionId.startsWith('edict:')) return 'scroll';
  const exact = BY_OPTION[optionId];
  if (exact) return exact;
  for (const part of optionId.split('-')) {
    for (const [token, icon] of BY_TOKEN) {
      if (token.test(part)) return icon;
    }
  }
  return undefined;
}

/**
 * Builds one glyph, centred on (0, 0). Kept to simple primitives — the cards render these at
 * 26px, where anything finer is mud.
 */
export function drawCardIcon(
  scene: Phaser.Scene,
  id: CardIconId,
  color: number = PIGMENT.muc,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const line = (w: number): void => { g.lineStyle(w, color, 0.95); };
  const fill = (alpha = 0.9): void => { g.fillStyle(color, alpha); };
  const r = CARD_ICON_SIZE / 2;
  container.setData('cardIcon', id);

  switch (id) {
    case 'coin':
      g.fillStyle(PIGMENT.hoePale, 1); g.fillCircle(0, 0, r - 3);
      line(2); g.strokeCircle(0, 0, r - 3);
      g.fillStyle(PIGMENT.diepHi, 1); g.fillRect(-3, -3, 6, 6);
      line(1.8); g.strokeRect(-3, -3, 6, 6);
      break;

    case 'purse':
      fill(); g.fillEllipse(0, 3, 18, 15);
      line(2); g.beginPath(); g.arc(0, -6, 5, Math.PI, 0); g.strokePath();
      break;

    // Outlined rather than filled: ruled lines stroked in the same ink over a solid body are
    // invisible, which is exactly how this rendered as a plain rectangle at first.
    case 'scroll':
      line(2); g.strokeRoundedRect(-8, -9, 16, 18, 2);
      line(1.3);
      for (let i = -4; i <= 4; i += 4) g.lineBetween(-4, i, 4, i);
      break;

    case 'blade':
      g.fillStyle(PIGMENT.hoePale, 1);
      g.fillTriangle(-4, 2, 8, -10, 2, 6);
      line(2); g.strokeTriangle(-4, 2, 8, -10, 2, 6);
      line(2.5); g.lineBetween(-7, 0, 2, 8);
      line(3); g.lineBetween(-3, 5, -8, 10);
      break;

    case 'shield':
      g.fillStyle(PIGMENT.hoePale, 1);
      line(2);
      g.beginPath();
      g.moveTo(0, -10); g.lineTo(9, -6); g.lineTo(9, 3);
      g.lineTo(0, 11); g.lineTo(-9, 3); g.lineTo(-9, -6);
      g.closePath(); g.fillPath(); g.strokePath();
      line(1.5); g.lineBetween(0, -6, 0, 6);
      break;

    case 'heart':
      fill(1);
      g.fillCircle(-4.5, -3.5, 5.5); g.fillCircle(4.5, -3.5, 5.5);
      g.fillTriangle(-9, 0, 9, 0, 0, 10);
      break;

    case 'balance':
      // Two equal weights: the neutral posture between shelter and attack.
      line(2.2); g.lineBetween(0, -10, 0, 10); g.lineBetween(-7, 10, 7, 10);
      g.lineBetween(-9, -5, 9, -5);
      line(1.6); g.lineBetween(-8, -5, -8, 2); g.lineBetween(8, -5, 8, 2);
      fill(); g.fillTriangle(-12, 2, -4, 2, -8, 6); g.fillTriangle(4, 2, 12, 2, 8, 6);
      break;

    case 'wall':
      line(2); g.strokeRect(-10, -2, 20, 11);
      fill(); for (let x = -10; x < 10; x += 7) g.fillRect(x, -8, 4, 6);
      break;

    case 'banner':
      line(2); g.lineBetween(-6, 11, -6, -10);
      fill(); g.fillTriangle(-6, -10, 9, -6, -6, -1);
      break;

    // ── the five shapes ──────────────────────────────────────────────────
    //
    // Formation commands use the same symbols in the dock, the speech bubbles and the guide.
    // A weapon or a direction states the action; no fine pattern is needed to tell them apart.

    case 'spears':
      // Three broad spearheads survive a phone-sized chip.
      line(2.2);
      for (const x of [-8, 0, 8]) {
        g.lineBetween(x, 9, x, -5);
        fill(1); g.fillTriangle(x, -12, x - 3, -4, x + 3, -4);
      }
      g.lineBetween(-11, 7, 11, 7);
      break;

    case 'horse':
      // A forward wedge, not a cavalry promise: every army can charge.
      fill(1); g.fillTriangle(0, -12, -8, -2, 8, -2);
      line(3); g.lineBetween(0, -3, 0, 8);
      line(2.5); g.lineBetween(-10, 9, -6, 3); g.lineBetween(10, 9, 6, 3);
      break;

    case 'skirmish':
      // Outward arrows show dispersal; three separate men keep the gaps visible.
      line(2.2); g.lineBetween(-2, -1, -10, -9); g.lineBetween(2, -1, 10, -9);
      g.lineBetween(-10, -9, -4, -9); g.lineBetween(-10, -9, -10, -3);
      g.lineBetween(10, -9, 4, -9); g.lineBetween(10, -9, 10, -3);
      fill(1); g.fillCircle(-9, 7, 2.8); g.fillCircle(0, 3, 2.8); g.fillCircle(9, 7, 2.8);
      break;

    case 'tortoise':
      // Overlapping shields, instead of an abstract nine-cell grid.
      for (const x of [-5, 5]) {
        g.fillStyle(PIGMENT.hoePale, 1); line(2);
        g.beginPath(); g.moveTo(x - 5, -9); g.lineTo(x + 5, -9);
        g.lineTo(x + 5, 3); g.lineTo(x, 10); g.lineTo(x - 5, 3);
        g.closePath(); g.fillPath(); g.strokePath();
        line(1.5); g.lineBetween(x, -5, x, 3);
      }
      break;

    case 'bows':
      line(2.8); g.beginPath(); g.arc(-6, 0, 10, -Math.PI / 2, Math.PI / 2); g.strokePath();
      line(1.6); g.lineBetween(-6, -10, -6, 10);
      line(2.2); g.lineBetween(-10, 0, 11, 0);
      g.lineBetween(11, 0, 6, -4); g.lineBetween(11, 0, 6, 4);
      break;

    case 'hut':
      line(2); g.strokeRect(-8, -1, 16, 10);
      fill(); g.fillTriangle(-10, -1, 0, -10, 10, -1);
      break;

    case 'ladder':
      line(2); g.lineBetween(-7, 11, -1, -10); g.lineBetween(3, 11, 9, -10);
      line(1.4);
      for (let i = -8; i <= 8; i += 5) g.lineBetween(-5, i, 7, i);
      break;

    case 'crown':
      fill();
      g.fillTriangle(-10, 5, -10, -7, -4, 1);
      g.fillTriangle(-4, 1, 0, -9, 4, 1);
      g.fillTriangle(4, 1, 10, -7, 10, 5);
      g.fillRect(-10, 5, 20, 4);
      break;

    case 'scales':
      line(2); g.lineBetween(0, -10, 0, 8); g.lineBetween(-10, -6, 10, -6);
      line(1.6);
      g.beginPath(); g.arc(-10, -6, 5, 0, Math.PI); g.strokePath();
      g.beginPath(); g.arc(10, -6, 5, 0, Math.PI); g.strokePath();
      break;

    case 'person':
      fill(); g.fillCircle(0, -6, 4.5);
      line(2); g.beginPath(); g.arc(0, 12, 9, Math.PI, 0); g.strokePath();
      break;

    case 'grain':
      line(2); g.lineBetween(0, 11, 0, -6);
      fill();
      for (let i = 0; i < 3; i += 1) {
        const y = -6 + i * 5;
        g.fillTriangle(0, y, -7, y + 2, 0, y + 5);
        g.fillTriangle(0, y, 7, y + 2, 0, y + 5);
      }
      break;

    case 'herd':
      line(2);
      g.beginPath(); g.arc(-6, -4, 5, Math.PI * 0.9, Math.PI * 2.1); g.strokePath();
      g.beginPath(); g.arc(6, -4, 5, Math.PI * 0.9, Math.PI * 2.1); g.strokePath();
      fill(); g.fillEllipse(0, 4, 16, 11);
      break;

    case 'cart':
      line(2); g.strokeRect(-10, -6, 20, 9);
      fill(); g.fillCircle(-5, 8, 3.5); g.fillCircle(5, 8, 3.5);
      break;

    case 'branch':
      line(2); g.lineBetween(-8, 10, 8, -9);
      fill();
      g.fillEllipse(-1, 1, 9, 5);
      g.fillEllipse(4, -5, 9, 5);
      break;

    case 'retreat':
      line(2.4); g.lineBetween(9, 0, -7, 0);
      line(2.4); g.lineBetween(-7, 0, -1, -6); g.lineBetween(-7, 0, -1, 6);
      break;

    case 'spark':
      fill();
      g.fillTriangle(0, -11, 4, -2, -4, -2);
      g.fillTriangle(0, 11, 4, 2, -4, 2);
      g.fillTriangle(-11, 0, -2, 4, -2, -4);
      g.fillTriangle(11, 0, 2, 4, 2, -4);
      break;

    case 'globe':
      // A meridian and an equator, and nothing else. Continents at 26 units are three grey blobs.
      line(2); g.strokeCircle(0, 0, 10);
      line(1.6);
      g.lineBetween(-10, 0, 10, 0);
      g.strokeEllipse(0, 0, 9, 20);
      break;

    case 'phone':
      // Wider and heavier than a real handset's proportions. Drawn to scale it is a 6px-wide
      // sliver beside a 20px globe, and the pair reads as one icon and one smudge.
      line(2.4); g.strokeRoundedRect(-8, -10.5, 16, 21, 3.5);
      line(1.6); g.lineBetween(-3, -7, 3, -7);
      fill(); g.fillCircle(0, 7, 1.8);
      break;

    case 'install':
      // Arrow into a tray. Kept inside the same 20-unit visual box as the footer's book, scroll,
      // and gear so installing does not look like a fourth, larger class of navigation control.
      line(2);
      g.lineBetween(0, -10, 0, 2);
      g.lineBetween(-5, -3, 0, 2);
      g.lineBetween(5, -3, 0, 2);
      g.beginPath();
      g.moveTo(-9, 6); g.lineTo(-9, 10); g.lineTo(9, 10); g.lineTo(9, 6);
      g.strokePath();
      break;

    case 'gear':
      // Eight spokes off a ring rather than a toothed outline: a real cog's teeth are a 1px
      // sawtooth at this size and print as a fuzzy circle.
      line(2); g.strokeCircle(0, 0, 5.5);
      line(2.4);
      for (let tooth = 0; tooth < 8; tooth += 1) {
        const angle = (tooth / 8) * Math.PI * 2;
        g.lineBetween(Math.cos(angle) * 7.5, Math.sin(angle) * 7.5, Math.cos(angle) * 11, Math.sin(angle) * 11);
      }
      break;

    case 'door':
      // Three jambs and an arrow through the missing fourth. A closed rectangle at this size
      // reads as a window or a card; the open side is the whole of what makes it a doorway.
      line(2);
      g.lineBetween(-4, -11, -11, -11);
      g.lineBetween(-11, -11, -11, 11);
      g.lineBetween(-11, 11, -4, 11);
      line(2.4);
      g.lineBetween(-2, 0, 8, 0);
      g.lineBetween(8, 0, 2, -6);
      g.lineBetween(8, 0, 2, 6);
      break;

    case 'hourglass':
      line(2);
      g.lineBetween(-8, -10, 8, -10); g.lineBetween(-8, 10, 8, 10);
      g.lineBetween(-8, -10, 8, 10); g.lineBetween(8, -10, -8, 10);
      break;

    case 'pause':
      fill();
      g.fillRoundedRect(-8, -9, 6, 18, 2);
      g.fillRoundedRect(2, -9, 6, 18, 2);
      break;

    case 'play':
      fill();
      g.fillTriangle(-6, -9, -6, 9, 10, 0);
      break;

    case 'book':
      // An open book rather than a closed rectangle: the centre crease and the two rising page
      // edges survive the small footer scale, so this reads as a record instead of another menu.
      line(2);
      g.beginPath();
      g.moveTo(0, -7); g.lineTo(-4, -9); g.lineTo(-10, -8);
      g.lineTo(-10, 8); g.lineTo(-4, 7); g.lineTo(0, 9);
      g.lineTo(4, 7); g.lineTo(10, 8); g.lineTo(10, -8);
      g.lineTo(4, -9); g.lineTo(0, -7);
      g.strokePath();
      line(1.4); g.lineBetween(0, -7, 0, 9);
      break;

    // The two footer links. Not option glyphs — they carry the support row, where a phrase with a
    // mark beside it has to read as pressable without a button drawn around it, and at 18px on a
    // phone the mark gets one shape to say what it is with.
    case 'cup':
      // Steam first, then the cup, then the saucer: the bare trapezoid read as a bucket, and the
      // two curls are the whole difference between a drink and a pot.
      line(1.3);
      for (const sx of [-3.5, 3.5]) {
        g.beginPath(); g.arc(sx, -10, 2.2, Math.PI * 0.5, Math.PI * 1.5); g.strokePath();
        g.beginPath(); g.arc(sx, -6.2, 2.2, Math.PI * 1.5, Math.PI * 0.5); g.strokePath();
      }
      line(2);
      g.beginPath();
      g.moveTo(-8, -2); g.lineTo(8, -2); g.lineTo(6, 8); g.lineTo(-6, 8);
      g.closePath(); g.strokePath();
      line(1.8); g.beginPath(); g.arc(9, 1.5, 3.6, Math.PI * 1.5, Math.PI * 0.5); g.strokePath();
      line(2); g.lineBetween(-10, 11, 10, 11);
      break;

    case 'hammer':
      // The vồ a block-cutter holds — which is the tool this game is made with, and the only shape
      // in the kit that survives being asked to mean "build" at 18px. A brush was drawn here
      // first: at that size a shaft with a tapered head is a diagonal stroke and nothing else,
      // and it read as a slash across the sentence it was meant to mark.
      //
      // Head canted and the handle hung off its underside, because square-on and centred it is a
      // signpost. Solid rather than outlined: an outlined head this small fills in with its own
      // contour.
      fill();
      g.fillTriangle(-10, -8.6, 8, -11, 9, -5.2);
      g.fillTriangle(-10, -8.6, -9.4, -2.6, 9, -5.2);
      line(2.6); g.lineBetween(-0.6, -3.6, 2.4, 12);
      break;

    case 'skull':
      fill(); g.fillCircle(0, -2, 8);
      g.fillRect(-4, 4, 8, 5);
      line(1.6); g.strokeCircle(-3, -3, 1.6); g.strokeCircle(3, -3, 1.6);
      break;
  }

  container.add(g);
  return container;
}
