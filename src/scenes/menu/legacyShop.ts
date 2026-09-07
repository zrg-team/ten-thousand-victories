/**
 * The Legacy shop page.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import { GAME_WIDTH } from '../../game/constants';
import {
  getLegacy,
  isEquipped,
  LEGACY_PERKS,
  LOADOUT_MAX,
  nextPerkCost,
  PERK_MAX_LEVEL,
  perkDescription,
  perkLevel,
  purchaseLegacyPerk,
  toggleLoadout,
} from '../../state/legacy';
import { t } from '../../i18n';
import { INK_UI } from '../../ui/InkUI';
import { TITLE_FONT } from '../../ui/fonts';
import { pageFloor } from './helpers';
import type { MenuScene } from '../MenuScene';

/**
 * The vault, as a page with one focus.
 *
 * It was twenty equal cards scrolling under a translucent masthead, over the front page's
 * landscape: the mountains printed through the type, the previous card's button peeked out
 * under the title, every button was the same grey, and nothing said what the page was for —
 * *colours a mess, no focus, nobody knows what this is.* So: its own head on paper, like the
 * ledger. A header that says the two things that matter — how many points you hold and what
 * rides into the next reign, as three slots — and a list in four sections in the order a
 * player acts on them: what is carried, what can be bought right now (the page's one primary),
 * what is unlocked but set down, and what is still locked, cheapest first. Locked cards carry
 * their price and the shortfall, not a row of empty dots and a dead button.
 */
export function renderLegacyShop(self: MenuScene): void {
  const legacy = getLegacy();
  const PAD = 20;
  const W = GAME_WIDTH - PAD * 2;
  const headTop = self.renderDynastyTitleBar(t('empire.legacy.shopTitle'), false) + 10;
  // Paper under the whole page: the front page's landscape and seal are painted behind every
  // mode, and the list scrolled over mountains. A shop is read on a plain sheet.
  self.content.push(self.add.rectangle(0, 56, GAME_WIDTH, pageFloor() - 56, INK_UI.parchment, 0.96).setOrigin(0, 0));

  // ── The header: points, and the three slots that ride ──────────────────
  const HEAD_H = 122;
  self.content.push(self.ui.panel({ x: PAD, y: headTop, width: W, height: HEAD_H },
    { border: INK_UI.gold, borderWidth: 1.4, fillAlpha: 1 }));
  const pointsText = self.add.text(PAD + 14, headTop + 10, legacy.points.toLocaleString('en-US'), {
    color: '#8a5f1c', fontFamily: TITLE_FONT, fontSize: '32px', fontStyle: '700',
  }).setOrigin(0, 0);
  self.content.push(pointsText);
  self.content.push(self.ui.label(PAD + 14, headTop + 52, t('empire.legacy.pointsLabel'), 'caption',
    { fontSize: '10px', color: '#8a5f1c' }));
  self.content.push(self.ui.label(PAD + 14, headTop + 70, t('empire.legacy.howEarned'), 'caption',
    { fontSize: '9px', color: '#8a7a60', wordWrap: { width: 140 } }));

  const slotsX = PAD + 168;
  const slotsW = W - 168 - 12;
  self.content.push(self.ui.label(slotsX, headTop + 12,
    t('empire.legacy.carryHead', { n: legacy.loadout.length, max: LOADOUT_MAX }), 'caption',
    { fontSize: '9px', color: '#1c6b58' }));
  for (let i = 0; i < LOADOUT_MAX; i += 1) {
    const id = legacy.loadout[i];
    const sy = headTop + 30 + i * 28;
    self.content.push(self.ui.panel({ x: slotsX, y: sy, width: slotsW, height: 24 },
      { border: id ? INK_UI.jade : INK_UI.softBrush, borderWidth: id ? 1.4 : 1, fillAlpha: id ? 0.9 : 0.3 }));
    self.content.push(self.ui.label(slotsX + 8, sy + 5,
      id ? `${i + 1} · ${t(`empire.legacy.perk.${id}` as Parameters<typeof t>[0])}` : `${i + 1} · ${t('empire.legacy.slotEmpty')}`,
      id ? 'label' : 'caption', { fontSize: '10px', ...(id ? { color: '#1c6b58' } : { color: '#8a7a60' }) }));
  }

  const bodyTop = headTop + HEAD_H + 10;
  const viewport = pageFloor() - bodyTop;
  const area = self.ui.scrollArea({ x: 0, y: bodyTop, width: GAME_WIDTH, height: viewport });
  self.pageScroll = area;
  const layer = self.add.container(0, 0);
  area.addTo(layer);
  self.content.push(layer);
  const body = area.content;
  let y = 0;

  // ── The four sections ──────────────────────────────────────────────────
  const costOf = (perk: (typeof LEGACY_PERKS)[number]) => nextPerkCost(perk, perkLevel(perk.id, legacy));
  const canBuy = (perk: (typeof LEGACY_PERKS)[number]) => { const c = costOf(perk); return c !== undefined && legacy.points >= c; };
  const carried = LEGACY_PERKS.filter((perk) => isEquipped(perk.id, legacy));
  const affordable = LEGACY_PERKS.filter((perk) => !isEquipped(perk.id, legacy) && canBuy(perk));
  const ownedDown = LEGACY_PERKS.filter((perk) => !isEquipped(perk.id, legacy) && !canBuy(perk) && perkLevel(perk.id, legacy) > 0);
  const locked = LEGACY_PERKS.filter((perk) => perkLevel(perk.id, legacy) === 0 && !canBuy(perk))
    .sort((a, b) => (costOf(a) ?? Infinity) - (costOf(b) ?? Infinity));
  const sections: Array<{ key: 'carried' | 'affordable' | 'owned' | 'locked'; title: string; perks: typeof LEGACY_PERKS }> = [
    { key: 'carried', title: t('empire.legacy.sec.carried', { n: carried.length, max: LOADOUT_MAX }), perks: carried },
    { key: 'affordable', title: t('empire.legacy.sec.affordable'), perks: affordable },
    { key: 'owned', title: t('empire.legacy.sec.owned'), perks: ownedDown },
    { key: 'locked', title: t('empire.legacy.sec.locked'), perks: locked },
  ];
  if (legacy.points === 0 && carried.length === 0 && ownedDown.length === 0) {
    const note = self.ui.label(GAME_WIDTH / 2, y + 2, t('empire.legacy.nothingYet'), 'caption',
      { fontSize: '10.5px', align: 'center', color: '#8a5f1c', wordWrap: { width: W } }).setOrigin(0.5, 0);
    body.add(note);
    y += note.height + 12;
  }

  for (const section of sections) {
    if (section.perks.length === 0) continue;
    const head = self.add.text(28, y, section.title.toLocaleUpperCase('vi'), {
      color: section.key === 'affordable' ? '#a4402c' : '#2a2118', fontFamily: TITLE_FONT, fontSize: '12px', fontStyle: '700',
    }).setOrigin(0, 0);
    head.setLetterSpacing?.(1.2);
    body.add(head);
    body.add(self.add.rectangle(28, y + 20, GAME_WIDTH - 56, 1, section.key === 'affordable' ? INK_UI.cinnabar : INK_UI.gold, 0.7).setOrigin(0, 0));
    y += 30;

    for (const perk of section.perks) {
      const level = perkLevel(perk.id, legacy);
      const owned = level > 0;
      const equipped = isEquipped(perk.id, legacy);
      const cost = costOf(perk);
      const affordableNow = cost !== undefined && legacy.points >= cost;
      const pips = '●'.repeat(level) + '○'.repeat(PERK_MAX_LEVEL - level);
      // The second line says the one thing to know: the level held and the next step's price,
      // or the price and the shortfall. Empty dots on a locked card said nothing.
      const nextLine = cost === undefined
        ? t('empire.legacy.max')
        : affordableNow
          ? (owned ? t('empire.legacy.upgradeCost', { level: level + 1, cost }) : t('empire.legacy.cost', { cost }))
          : t('empire.legacy.short', { cost, n: cost - legacy.points });
      const subtitle = owned ? `${pips} ${t('empire.legacy.level', { level, max: PERK_MAX_LEVEL })} · ${nextLine}` : nextLine;
      const shown = Math.max(1, level);
      const bodyText = shown < PERK_MAX_LEVEL
        ? `${perkDescription(perk, shown)}\n${t('empire.legacy.next', { level: shown + 1, text: perkDescription(perk, shown + 1) })}`
        : perkDescription(perk, shown);
      const action = affordableNow
        ? { label: owned ? t('empire.legacy.upgrade') : t('empire.legacy.buy'), variant: 'primary' as const, onClick: () => { if (purchaseLegacyPerk(perk.id)) self.render(); } }
        : cost === undefined
          ? { label: t('empire.legacy.maxShort'), variant: 'disabled' as const, disabled: true, onClick: () => undefined }
          : undefined;
      const card = self.ui.card({ x: 28, y, width: GAME_WIDTH - 56, height: 74 }, {
        title: t(`empire.legacy.perk.${perk.id}` as Parameters<typeof t>[0]),
        subtitle,
        body: bodyText,
        border: equipped ? INK_UI.jade : affordableNow ? INK_UI.cinnabar : owned ? INK_UI.gold : INK_UI.softBrush,
        borderWidth: affordableNow || equipped ? 1.6 : 1,
        fillAlpha: 1,
        muted: section.key === 'locked',
        actionPlacement: 'right',
        ...(action ? { action } : {}),
      });
      body.add(card);
      y += ((card.getData('cardHeight') as number | undefined) ?? 74) + 4;
      if (owned) {
        const full = !equipped && legacy.loadout.length >= LOADOUT_MAX;
        body.add(self.ui.button({ x: 28, y, width: GAME_WIDTH - 56, height: 26 },
          equipped ? t('empire.legacy.equipped') : full ? t('empire.legacy.loadoutFull', { max: LOADOUT_MAX }) : t('empire.legacy.equip'),
          () => { if (toggleLoadout(perk.id)) self.render(); },
          { variant: equipped ? 'secondary' : full ? 'disabled' : 'ghost', fontSize: '10.5px' }));
        y += 26 + 10;
      } else {
        y += 6;
      }
    }
    y += 8;
  }
  area.setContentHeight(Math.max(viewport, y + 8));

  self.footBackBar();
}
