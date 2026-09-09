import Phaser from 'phaser';
import { PIGMENT } from './ink/palette';
import { addConquestUiIcon } from './conquestUiIcons';

/** Semantic IDs shared by the generated Đông Hồ icon atlas and every action surface. */
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
  | 'spears' | 'horse' | 'skirmish' | 'tortoise' | 'bows'
  | 'hero' | 'diplomacy' | 'territory' | 'crossed-weapons';

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

  // Story phrases whose leading verb does not describe the choice's subject.
  'take-him-in': 'person',
  'make-him-repay': 'herd',

  // Conquest methods
  bribe: 'coin',
  diplomacy: 'diplomacy',
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
  ambassador: 'diplomacy',

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
  [/^(bien|border|sea|song|river|water|nuoc)$/, 'territory'],
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

/** Centered, stable container contract for existing layout and press-animation callers. */
export function drawCardIcon(
  scene: Phaser.Scene,
  id: CardIconId,
  color: number = PIGMENT.muc,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0).setSize(CARD_ICON_SIZE, CARD_ICON_SIZE);
  container.setData('cardIcon', id).setData('accent', color);
  const image = addConquestUiIcon(scene, id, CARD_ICON_SIZE);
  container.setData('conquestUiIcon', image.getData('conquestUiIcon'));
  container.add(image);
  return container;
}
