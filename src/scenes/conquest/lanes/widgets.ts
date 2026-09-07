import { measureInkText } from '../../../ui/InkVirtualList';
import type { InkScrollArea } from '../../../ui/InkUI';
/**
 * The pieces a lane page is built from above the level of a row — owned by no one screen, reached
 * for by court, army, build, the muster form and the conquest prompt alike.
 *
 * `statPanel`, `actionTiles` and `segmentedRow` slot into a list's flow through `addWidget`: each
 * measures its own text and RETURNS its height, which is why all sixteen call sites pass
 * `addWidget(0, …)` and let the return win. `showHeroPicker`, `showHostPicker` and
 * `showConfirmPage` are whole pages rather than pieces — they go through `replaceLanePage`, so
 * backing out of a confirm is the picker calling itself again, and each has to survive being
 * rebuilt from nothing at any moment.
 */
import Phaser from 'phaser';
import { heroTitleLine, type HeroPickerRow, type HostPickerRow } from '../../../ui/heroPickerRows';
import { MARCH_MIN_WIN_CHANCE } from '../../../game/ascentConfig';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap } from '../../../ui/InkUI';
import { UI_FONT } from '../../../ui/fonts';
import { t } from '../../../i18n';
import type { Hero } from '../../../state/types';
import { cssHex } from '../constants';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { soundDirector } from '../../../ui/sound/SoundDirector';


/**
 * Compact pieces for a sheet that is a *screen* rather than a column of cards.
 *
 * The host sheet was thirteen full-width cards in one scroll: every figure, every order, every
 * upgrade and the commander, each in its own box, each the same size and weight as the next. A
 * card says "one thing, and it is as important as every other thing" — so a page made entirely
 * of them has no shape, no reading order and no bottom, and the player scrolls past what they
 * came for. These three give the page its levels: figures are read across, choices are read as a
 * grid, and a question with two answers is a switch and not two cards.
 */

/** The host's figures, read across one surface. */
export function statPanel(self: ConquestUIScene,
  parent: Phaser.GameObjects.Container,
  width: number,
  cells: Array<{ label: string; value: string; accent?: string }>,
): number {
  const height = 44;
  parent.add(self.ui.panel({ x: 0, y: 0, width, height }, {
    border: INK_UI.softBrush,
    borderAlpha: 0.45,
    fillAlpha: 0.5,
  }));
  const cellWidth = width / cells.length;
  cells.forEach((cell, index) => {
    const centre = cellWidth * (index + 0.5);
    if (index > 0) {
      const rule = self.add.graphics();
      rule.lineStyle(1, INK_UI.brush, 0.14);
      rule.lineBetween(cellWidth * index, 8, cellWidth * index, height - 8);
      parent.add(rule);
    }
    const label = self.add.text(centre, 7, cell.label.toLocaleUpperCase(), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '8px', fontStyle: '700',
    }).setOrigin(0.5, 0);
    label.setLetterSpacing?.(1.1);
    parent.add(label);
    parent.add(self.add.text(centre, 18, cell.value, {
      color: cell.accent ?? INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '17px', fontStyle: '700',
    }).setOrigin(0.5, 0));
  });
  return height;
}

/**
 * Choices as a grid of small tiles, two across.
 *
 * Seven orders as seven full-width cards is a page you scroll; seven as a grid is a page you
 * look at. The tiles share one height per row so the grid reads as a grid, which means the text
 * is measured before any surface is drawn.
 */
export function actionTiles(self: ConquestUIScene,
  parent: Phaser.GameObjects.Container,
  width: number,
  tiles: Array<{ title: string; note?: string; border: number; muted?: boolean; onTap?: () => void }>,
  opts: { columns?: 1 | 2 } = {},
): number {
  const GAP = 6, COLUMNS = opts.columns ?? 2;
  const tileWidth = (width - GAP * (COLUMNS - 1)) / COLUMNS, inner = tileWidth - 18;
  const flow = parent.getData('virtualFlow') as { scroll: InkScrollArea; top: number } | undefined;
  const titleStyle = { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '12px', fontStyle: '700', wordWrap: { width: inner }, lineSpacing: -1 };
  const noteStyle = { color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', wordWrap: { width: inner }, lineSpacing: -1 };
  let y = 0;
  for (let index = 0; index < tiles.length; index += COLUMNS) {
    const row = tiles.slice(index, index + COLUMNS);
    const height = Math.max(42, ...row.map(tile => 18 + measureInkText(self, tile.title, titleStyle) + (tile.note ? measureInkText(self, tile.note, noteStyle) + 3 : 0)));
    const top = y + (flow?.top ?? 0);
    const build = () => row.forEach((tile, column) => {
      const holder = self.add.container(column * (tileWidth + GAP), top);
      holder.add(self.ui.panel({ x: 0, y: 0, width: tileWidth, height }, { border: tile.border, borderWidth: 1.5, muted: tile.muted }));
      const title = self.add.text(9, 9, tile.title, titleStyle).setAlpha(tile.muted ? .55 : 1); holder.add(title);
      if (tile.note) holder.add(self.add.text(9, 9 + title.height + 3, tile.note, noteStyle).setAlpha(tile.muted ? .5 : .9));
      if (tile.onTap) {
        const hit = self.add.rectangle(tileWidth / 2, height / 2, tileWidth, height, 0xffffff, .001).setInteractive({ useHandCursor: true });
        hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
          if (scrollGestureConsumedTap(pointer)) return;
          soundDirector.tap(); tile.onTap?.();
        }); holder.add(hit);
      }
      (flow?.scroll.content ?? parent).add(holder);
    });
    if (flow) flow.scroll.lazyRow(`grid:${row.map(tile => tile.title).join('|')}`, top, height + GAP, build);
    else build();
    y += height + GAP;
  }
  return Math.max(0, y - GAP);
}

/**
 * A question with two answers, as one switch.
 *
 * Two cards would ask it twice and answer it never — the selected state of a card is a border
 * colour, which is not what a player reads a card for. A segmented pair reads as one control
 * with one answer showing, and the note under it belongs to whichever side is chosen.
 */
export function segmentedRow(self: ConquestUIScene,
  parent: Phaser.GameObjects.Container,
  width: number,
  opts: { label: string; options: string[]; note: string; selected: number; onPick: (index: number) => void },
): number {
  const heading = self.add.text(2, 0, opts.label.toLocaleUpperCase(), {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
  }).setOrigin(0, 0);
  heading.setLetterSpacing?.(1.2);
  parent.add(heading);

  const top = heading.height + 5;
  const GAP = 5;
  const tileHeight = 30;
  const tileWidth = (width - GAP * (opts.options.length - 1)) / opts.options.length;
  opts.options.forEach((option, index) => {
    const selected = index === opts.selected;
    const x = index * (tileWidth + GAP);
    // Deliberately NOT `crayonTile`. Its "selected" surface is paper with a cinnabar edge and its
    // unselected one is filled gold — which is the game's convention for *action* versus *quiet*,
    // and on a two-way switch it reads exactly backwards: the loud gold half looks like the
    // answer that is chosen. Here the chosen half is filled and edged in red, and the other is
    // flat paper.
    parent.add(self.ui.panel({ x, y: top, width: tileWidth, height: tileHeight }, selected
      ? { fill: INK_UI.goldLight, fillShade: INK_UI.gold, border: INK_UI.cinnabar, borderWidth: 2 }
      : { fill: INK_UI.parchment, fillAlpha: 0.45, border: INK_UI.softBrush, borderWidth: 1.2, muted: true }));
    const label = self.add.text(x + tileWidth / 2, top + tileHeight / 2, option, {
      color: selected ? cssHex(INK_UI.cinnabarDark) : INK_UI_HEX.mutedText,
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontStyle: '700',
      align: 'center',
      wordWrap: { width: tileWidth - 8 },
    }).setOrigin(0.5);
    parent.add(label);
    if (!selected) {
      const hit = self.add
        .rectangle(x + tileWidth / 2, top + tileHeight / 2, tileWidth, tileHeight, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        soundDirector.tap();
        opts.onPick(index);
      });
      parent.add(hit);
    }
  });

  const note = self.add.text(2, top + tileHeight + 5, opts.note, {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', wordWrap: { width: width - 4 },
  }).setOrigin(0, 0);
  parent.add(note);
  return top + tileHeight + 5 + note.height;
}

/**
 * The one hero picker.
 *
 * Every posting a hero can be chosen for — a seat, a province, a host, an embassy — used to
 * have its own way of asking (or none: a host's commander and a claim's envoy were picked for
 * the player). This is the single screen they all open now: each hero with their portrait,
 * what the posting would mean for *them*, where they are today, and what taking them leaves
 * empty — the current holder first, the best fit marked — and a confirm page before anything
 * moves, because heroes are the run's scarcest thing and a mis-tap should cost a tap, not a
 * minister.
 */
export function showHeroPicker(self: ConquestUIScene, opts: {
  title: string;
  subtitle?: string;
  rows: HeroPickerRow[];
  /** The confirm page's headline and lines for a row — the role, in words. */
  confirm: (row: HeroPickerRow) => { title: string; lines: string[] };
  onPick: (heroId: string) => void;
  onBack: () => void;
  /** An extra row at the foot: leave vacant, recall, take the field without a commander. */
  extra?: { title: string; subtitle: string; onTap: () => void };
}): void {
  self.replaceLanePage(() => {
    const { addRow, finish } = self.laneList(opts.title, opts.subtitle ?? t('ascent.pick.subtitle'), { back: opts.onBack });
    if (opts.rows.length === 0) {
      addRow({ title: t('ascent.pick.nobody'), subtitle: '', border: INK_UI.softBrush, muted: true });
    }
    for (const row of opts.rows) {
      const tags = [
        row.isCurrent ? t('ascent.pick.current') : '',
        row.isBest ? t('ascent.pick.recommended') : '',
      ].filter(Boolean);
      const blocked = Boolean(row.blockedReason);
      // A hero already at work is marked before anything else is read: the post is the first
      // line, the card wears a cinnabar status and border. Choosing them pulls them off that post
      // — which the confirm page repeats — so the mark is where the thumb lands.
      const busy = Boolean(row.hero.assignedTo) && !row.isCurrent && !blocked;
      addRow(
        {
          title: tags.length > 0 ? `${heroTitleLine(row.hero)}\n${tags.join('  ·  ')}` : heroTitleLine(row.hero),
          subtitle: [
            busy ? t('ascent.pick.busyLine', { post: row.postingLine }) : '',
            blocked ? row.blockedReason : row.effectLine,
            busy ? '' : row.postingLine,
            row.vacates ?? '',
            row.statsLine,
            row.flavour,
          ].filter(Boolean).join('\n'),
          border: row.isCurrent ? INK_UI.gold : blocked ? INK_UI.softBrush : busy ? INK_UI.cinnabar : row.isBest ? INK_UI.jade : INK_UI.brush,
          muted: blocked,
          portrait: row.hero,
          ...(busy ? { status: t('ascent.pick.busy') } : {}),
        },
        blocked || row.isCurrent
          ? undefined
          : () => {
              const { title, lines } = opts.confirm(row);
              showConfirmPage(self, {
                title,
                subtitle: heroTitleLine(row.hero),
                portrait: row.hero,
                lines: [...lines, row.vacates ?? ''].filter(Boolean),
                confirmLabel: t('ascent.pick.confirm'),
                danger: Boolean(row.vacates),
                onConfirm: () => opts.onPick(row.hero.id),
                onBack: () => showHeroPicker(self, opts),
              });
            },
      );
    }
    if (opts.extra) {
      addRow({ title: opts.extra.title, subtitle: opts.extra.subtitle, border: INK_UI.softBrush }, opts.extra.onTap);
    }
    finish();
  });
}

/** The hosts a military method (or a follow order) could commit — the same shape, for armies. */
export function showHostPicker(self: ConquestUIScene, opts: {
  title: string;
  subtitle?: string;
  rows: HostPickerRow[];
  confirm: (row: HostPickerRow) => { title: string; lines: string[]; danger?: boolean };
  onPick: (armyId: string, force: boolean) => void;
  onBack: () => void;
}): void {
  self.replaceLanePage(() => {
    const { addRow, finish } = self.laneList(opts.title, opts.subtitle ?? t('ascent.pick.hostSubtitle'), { back: opts.onBack });
    if (opts.rows.length === 0) {
      addRow({ title: t('ascent.pick.nobody'), subtitle: '', border: INK_UI.softBrush, muted: true });
    }
    for (const row of opts.rows) {
      const blocked = Boolean(row.blockedReason);
      const thin = row.chance !== undefined && row.chance < MARCH_MIN_WIN_CHANCE && row.chance < 100;
      addRow(
        {
          title: `${row.title}${row.isBest ? `  ·  ${t('ascent.pick.recommended')}` : ''}${thin ? `  ·  ${t('ascent.pick.attackAnyway')}` : ''}`,
          subtitle: [
            blocked ? row.blockedReason : row.chance !== undefined ? t('ascent.pick.hostOdds', { pct: row.chance }) : '',
            row.line,
            row.orderLabel,
          ].filter(Boolean).join('\n'),
          border: blocked ? INK_UI.softBrush : thin ? INK_UI.gold : row.isBest ? INK_UI.jade : INK_UI.brush,
          muted: blocked,
          portrait: row.general,
        },
        blocked
          ? undefined
          : () => {
              const { title, lines, danger } = opts.confirm(row);
              showConfirmPage(self, {
                title,
                subtitle: row.title,
                portrait: row.general,
                lines,
                confirmLabel: thin ? t('ascent.pick.attackAnyway') : t('ascent.pick.confirm'),
                danger: danger || thin,
                onConfirm: () => opts.onPick(row.army.id, thin),
                onBack: () => showHostPicker(self, opts),
              });
            },
      );
    }
    finish();
  });
}

/**
 * A yes-or-back page for anything worth a second look: a hero taken from a seat, a host
 * recalled off a siege. One card with the consequences, one primary button, one way back.
 */
export function showConfirmPage(self: ConquestUIScene, opts: {
  title: string;
  subtitle?: string;
  portrait?: Hero;
  lines: string[];
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onBack: () => void;
}): void {
  self.replaceLanePage(() => {
    const content = self.promptFrame(opts.title, opts.subtitle ?? '');
    let y = content.y;
    if (opts.portrait) {
      const box = { x: content.x + content.width / 2 - 64, y, width: 128, height: 118 };
      self.modalLayer.add(renderHeroFaceInBox(self, opts.portrait, box));
      y += 126;
    }
    const [first, ...rest] = opts.lines.filter(Boolean);
    const card = self.ui.card(
      { x: content.x, y, width: content.width, height: 60 },
      { title: first ?? '', subtitle: rest.join('\n'), border: opts.danger ? INK_UI.cinnabar : INK_UI.gold },
    );
    self.modalLayer.add(card);
    y += ((card.getData('cardHeight') as number) ?? 60) + 14;
    self.modalLayer.add(self.ui.button(
      { x: content.x, y, width: content.width, height: 46 },
      opts.confirmLabel,
      opts.onConfirm,
      { variant: opts.danger ? 'danger' : 'primary', fontSize: '14px' },
    ));
    self.modalLayer.add(self.ui.button(
      { x: content.x, y: y + 58, width: content.width, height: 44 },
      t('ascent.pick.back'),
      opts.onBack,
      { variant: 'ghost', fontSize: '13px' },
    ));
  });
}
