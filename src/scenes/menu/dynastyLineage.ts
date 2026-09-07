/**
 * The lineage row on the dynasty page, the swipe that browses it, and the chronicle and reigns
 * sheets a reign card opens.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../game/constants';
import { hasSnapshot, loadSnapshot } from '../../state/save';
import { dynastyHistory, getDynasty, type LiveReign, type ReignRecord } from '../../state/dynasty';
import { reignFounderHero } from '../../ui/dynastyPortrait';
import { renderHeroFaceInBox } from '../../ui/FaceRenderer';
import { getLanguage, t } from '../../i18n';
import { INK_UI } from '../../ui/InkUI';
import { designLength } from '../../game/graphicsQuality';
import { motionMs } from '../../game/lifeSettings';
import type { MenuScene } from '../MenuScene';

/**
 * The reigns, as a row of cards — the trend the count-and-best line could never show.
 *
 * The last five, oldest left, and the reign in play last with a caret under it: *this one is
 * still being written*. Older reigns fold into one stub at the left. Tapping a card opens its
 * epitaph under the row — the fight that decided it, what it taught the house, who its king
 * was — and the score on the epitaph counts in, because a number that arrives is read and a
 * number that is simply there is skimmed.
 */
export function drawDynastyLineage(self: MenuScene,
  body: Phaser.GameObjects.Container,
  store: ReturnType<typeof getDynasty>,
  PAD: number,
  W: number,
  y: number,
  measure: (text: string, size: string, width: number) => number,
  bodyTop: number,
): number {
  const history = dynastyHistory(store);
  const live = store.liveReign;
  const SHOW = 5;
  const recent = history.slice(-SHOW);
  const earlier = history.length - recent.length;
  type Card = { kind: 'stub'; n: number } | { kind: 'reign'; record: ReignRecord } | { kind: 'live'; live: LiveReign };
  const cards: Card[] = [];
  if (earlier > 0) cards.push({ kind: 'stub', n: earlier });
  recent.forEach((record) => cards.push({ kind: 'reign', record }));
  if (live) cards.push({ kind: 'live', live });
  if (cards.length === 0) return y;

  const header = self.ui.label(PAD, y, t('dynasty.page.lineage'), 'caption',
    { fontSize: '10px', backgroundColor: 'rgba(243,230,196,0.82)', padding: { x: 4, y: 1 } });
  body.add(header);
  y += header.height + 5;

  // Which card is open: the one tapped, else the most recent banked reign.
  const defaultIndex = cards.findIndex((card) => card.kind === 'reign') >= 0
    ? cards.map((card) => card.kind).lastIndexOf('reign')
    : cards.length - 1;
  const selected = self.dynastyReign !== undefined && self.dynastyReign < cards.length
    ? self.dynastyReign
    : defaultIndex;

  const GAP = 6;
  const CARD_H = 60;
  const cardW = Math.floor((W - GAP * (cards.length - 1)) / cards.length);
  const maxScore = Math.max(1, ...history.map((record) => record.score), live?.score ?? 0);

  // One reign is not a trend: the strip's only card would repeat the epitaph's own number a
  // finger's width above it. The strip starts at the second reign, when there is a comparison.
  const strip = cards.length > 1;
  if (strip) cards.forEach((card, index) => {
    const x = PAD + index * (cardW + GAP);
    const open = index === selected;
    const accent = card.kind === 'live' ? INK_UI.jade : open ? INK_UI.gold : INK_UI.softBrush;
    body.add(self.ui.panel({ x, y, width: cardW, height: CARD_H },
      { border: accent, borderWidth: open ? 1.6 : 1, fillAlpha: card.kind === 'stub' ? 0.5 : open ? 0.96 : 0.82 }));

    if (card.kind === 'stub') {
      body.add(self.ui.label(x + cardW / 2, y + CARD_H / 2, t('dynasty.page.earlier', { n: card.n }),
        'caption', { fontSize: '9.5px', align: 'center', wordWrap: { width: cardW - 6 } }).setOrigin(0.5));
      // The stub opens the whole list as a sheet: the row shows five, the house keeps twelve.
      body.add(self.ui.button({ x, y, width: cardW, height: CARD_H }, '', () => openReignsSheet(self), { frameless: true }));
      return;
    }
    const n = card.kind === 'live' ? card.live.n : card.record.n;
    const score = card.kind === 'live' ? card.live.score : card.record.score;
    // The best reign wears a star: the record is the one mark a trend needs.
    const best = card.kind === 'reign' && score > 0 && score === store.bestScore;
    body.add(self.ui.label(x + cardW / 2, y + 7, `${best ? '★ ' : ''}${t('dynasty.page.reign', { n })}`, 'caption',
      { fontSize: '9px', align: 'center', ...(card.kind === 'live' ? { color: '#1c6b58' } : best ? { color: '#8a5f1c' } : {}) }).setOrigin(0.5, 0));
    const scoreText = `${card.kind === 'live' ? '+' : ''}${score.toLocaleString('en-US')}`;
    body.add(self.ui.label(x + cardW / 2, y + 20, scoreText, 'label',
      { fontSize: cardW < 60 ? '11px' : '12.5px', align: 'center' }).setOrigin(0.5, 0));
    // The trend, as a mark: each card's bar is its score against the house's best on record.
    const mark = self.add.graphics();
    const markW = cardW - 16;
    mark.fillStyle(INK_UI.softBrush, 0.25);
    mark.fillRoundedRect(x + 8, y + CARD_H - 14, markW, 4, 2);
    mark.fillStyle(accent === INK_UI.softBrush ? INK_UI.gold : accent, 0.9);
    mark.fillRoundedRect(x + 8, y + CARD_H - 14, Math.max(3, markW * Math.min(1, score / maxScore)), 4, 2);
    body.add(mark);
    if (card.kind === 'live') {
      // The ink caret: a reign still being written. One slow breath, never a badge.
      const caret = self.ui.label(x + cardW / 2, y + CARD_H - 6, '▲', 'caption',
        { fontSize: '8px', color: '#1c6b58', align: 'center' }).setOrigin(0.5, 1);
      body.add(caret);
      // A step, not a fade: it reads as a cursor, and it is the page's one loop.
      self.tweens.add({ targets: caret, alpha: { from: 1, to: 0.15 }, duration: motionMs(500), yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [1] });
    }
    body.add(self.ui.button({ x, y, width: cardW, height: CARD_H }, '', () => {
      self.dynastyReign = index;
      self.dynastyCountIn = true;
      self.render();
    }, { frameless: true }));
  });
  // A swipe across the row browses it: the finger moves the open card left or right. Read off
  // the move stream, which nothing swallows, and measured against the row's own rectangle.
  self.lineageSwipe = strip ? { top: bodyTop + y, bottom: bodyTop + y + CARD_H, count: cards.length, selected, handled: -1 } : undefined;
  if (strip) y += CARD_H + 8;

  // ── The open card's epitaph ─────────────────────────────────────────────
  const card = cards[selected];
  if (card.kind === 'stub') return y + 4;
  const lines: Array<{ text: string; color?: string }> = [];
  if (card.kind === 'live') {
    lines.push({
      text: t('dynasty.page.liveLine', {
        n: card.live.n,
        waves: card.live.waves,
        score: card.live.score.toLocaleString('en-US'),
        level: card.live.levelAfter,
      }),
      color: '#1c6b58',
    });
    // The promise, said once where the segment first appears: every term of the run score is a
    // peak or a count, so this is a floor, not a forecast. And a run left for a week carries
    // its date, so a stale segment is not mistaken for tonight's.
    const savedAt = Date.parse(card.live.savedAt);
    const stale = Number.isFinite(savedAt) && Date.now() - savedAt > 7 * 24 * 3600 * 1000;
    lines.push({
      text: stale
        ? `${t('dynasty.page.liveFloor')} ${t('dynasty.page.liveSaved', { date: new Date(savedAt).toLocaleDateString(getLanguage() === 'vi' ? 'vi-VN' : 'en-US') })}`
        : t('dynasty.page.liveFloor'),
    });
  } else {
    const record = card.record;
    lines.push({
      text: t('dynasty.page.epitaph', {
        waves: record.waves,
        lands: record.lands,
        ending: t(record.ending === 'collapse' ? 'dynasty.page.ending.collapse' : 'dynasty.page.ending.conquest'),
      }),
    });
    if (record.fight) {
      lines.push({
        text: t('dynasty.page.fight', {
          land: record.fight.land,
          n: record.fight.theirStart.toLocaleString('en-US'),
          result: t(record.fight.won ? 'dynasty.page.won' : 'dynasty.page.lost'),
        }),
      });
    }
    lines.push(record.trait
      ? { text: t('dynasty.page.left', { trait: t(`dynasty.trait.${record.trait}` as Parameters<typeof t>[0]) }), color: '#8a5f1c' }
      : { text: t('dynasty.page.leftNone') });
    if (record.founderName) lines.push({ text: t('dynasty.page.king', { name: record.founderName }) });
  }
  const isBest = card.kind === 'reign' && card.record.score > 0 && card.record.score === store.bestScore;
  const title = card.kind === 'live'
    ? `${t('dynasty.page.reign', { n: card.live.n })} · ${t('dynasty.page.live')}`
    : `${t('dynasty.page.reign', { n: card.record.n })}${isBest ? ` · ${t('dynasty.page.record')}` : ''}`;
  const score = card.kind === 'live' ? card.live.score : card.record.score;
  const reignHero = card.kind === 'reign' && card.record.founder ? reignFounderHero(card.record.founder, store.level) : undefined;
  const textX = PAD + (reignHero ? 56 : 10);
  const textW = W - (textX - PAD) - 10;
  const lineHeights = lines.map((line) => measure(line.text, '10px', textW));
  // The reign in play is also the door back into it; a banked reign opens its own chronicle.
  const continueH = card.kind === 'live' && hasSnapshot() ? 34 : 0;
  const chronicleH = card.kind === 'reign' && (card.record.chronicle?.length ?? 0) > 0 ? 30 : 0;
  const panelH = Math.max(8 + 16 + 4 + lineHeights.reduce((sum, h) => sum + h + 3, 0) + 6, reignHero ? 64 : 0) + continueH + chronicleH;
  body.add(self.ui.panel({ x: PAD, y, width: W, height: panelH },
    { border: card.kind === 'live' ? INK_UI.jade : INK_UI.gold, fillAlpha: 0.9 }));
  if (reignHero) {
    // The reign has a face of its own; on a tap it sets in with the punch.
    const face = renderHeroFaceInBox(self, reignHero, { x: PAD + 10, y: y + 10, width: 40, height: 40 });
    body.add(face);
    if (self.dynastyCountIn && motionMs(260) > 0) {
      const faceScale = face.scale;
      face.setScale(faceScale * 0.6).setAlpha(0.3);
      self.tweens.add({ targets: face, scale: faceScale, alpha: 1, duration: motionMs(260), ease: 'Back.easeOut' });
    }
  }
  body.add(self.ui.label(textX, y + 8, title, 'label', { fontSize: '12px' }));
  const scoreLabel = self.ui.label(PAD + W - 10, y + 7, '', 'label',
    { fontSize: '13px', color: '#8a5f1c', align: 'right' }).setOrigin(1, 0);
  body.add(scoreLabel);
  const show = (value: number) => scoreLabel.setText(`${card.kind === 'live' ? '+' : ''}${Math.round(value).toLocaleString('en-US')}`);
  if (self.dynastyCountIn && motionMs(600) > 0) {
    // The count-in: only on a tap, never on a settings-driven redraw, or the page fidgets.
    self.dynastyCountIn = false;
    const counter = { v: 0 };
    show(0);
    self.tweens.add({
      targets: counter, v: score, duration: motionMs(600), ease: 'Cubic.easeOut',
      onUpdate: () => show(counter.v), onComplete: () => show(score),
    });
  } else {
    show(score);
  }
  let row = y + 8 + 16 + 4;
  lines.forEach((line, index) => {
    body.add(self.ui.label(textX, row, line.text, 'caption',
      { fontSize: '10px', wordWrap: { width: textW }, ...(line.color ? { color: line.color } : {}) }));
    row += lineHeights[index] + 3;
  });
  if (chronicleH > 0 && card.kind === 'reign') {
    const record = card.record;
    row = y + panelH - continueH - chronicleH + 2;
    body.add(self.ui.button({ x: PAD + 10, y: row, width: W - 20, height: 24 }, t('dynasty.page.viewHistory'),
      () => openChronicleSheet(self, record), { variant: 'ghost', fontSize: '10.5px' }));
  }
  if (continueH > 0) {
    body.add(self.ui.button({ x: PAD + 10, y: row + 2, width: W - 20, height: 28 }, t('dynasty.page.continue'), () => {
      const snapshot = loadSnapshot();
      if (snapshot) self.startGame(snapshot.state);
    }, { variant: 'primary', fontSize: '11px' }));
  }
  return y + panelH + 12;
}

/**
 * A swipe across the lineage row browses it: forty units of travel moves the open card one
 * step, once per press. Read off the move stream, which no button swallows.
 */
export function onLineageSwipe(self: MenuScene, pointer: Phaser.Input.Pointer): void {
  const row = self.lineageSwipe;
  if (!row || !pointer.isDown || self.mode !== 'dynasty' || self.modalObjects.length > 0) return;
  if (row.handled === pointer.downTime) return;
  const downY = pointer.downY;
  if (downY < row.top || downY > row.bottom) return;
  const dx = designLength(pointer.x - pointer.downX);
  const dy = Math.abs(designLength(pointer.y - downY));
  if (Math.abs(dx) < 40 || dy > 30) return;
  row.handled = pointer.downTime;
  const next = Phaser.Math.Clamp(row.selected + (dx < 0 ? 1 : -1), 0, row.count - 1);
  if (next === row.selected) return;
  self.dynastyReign = next;
  self.dynastyCountIn = true;
  self.render();
}

/** A banked reign's chronicle, as it was written, opened from its epitaph. */
function openChronicleSheet(self: MenuScene, record: ReignRecord): void {
  self.closeModal();
  const lines = record.chronicle ?? [];
  const modal = self.ui.modal({
    title: t('dynasty.page.chronicleTitle', { n: record.n }),
    subtitle: t('dynasty.page.epitaph', {
      waves: record.waves, lands: record.lands,
      ending: t(record.ending === 'collapse' ? 'dynasty.page.ending.collapse' : 'dynasty.page.ending.conquest'),
    }),
    onClose: () => self.closeModal(),
    height: Math.min(GAME_HEIGHT - 24, 104 + 66 + 24 + Math.max(1, lines.length) * 34),
  });
  self.modalObjects.push(...modal.objects);
  self.armSheetDismiss(modal.panelBounds);
  const { contentBounds } = modal;
  let cursor = contentBounds.y + 4;
  if (lines.length === 0) {
    self.modalObjects.push(self.ui.label(contentBounds.x + 4, cursor, t('dynasty.page.chronicleNone'), 'caption', { fontSize: '10.5px' }));
    return;
  }
  for (const line of lines) {
    const text = self.ui.label(contentBounds.x + 4, cursor, `· ${line}`, 'caption', { fontSize: '10.5px', wordWrap: { width: contentBounds.width - 8 } });
    self.modalObjects.push(text);
    cursor += text.height + 6;
    if (cursor > contentBounds.y + contentBounds.height - 12) break;
  }
  self.riseSheet(self.modalObjects.filter((o) => !(o instanceof Phaser.GameObjects.Rectangle && o.width < GAME_WIDTH)));
}

/**
 * Every reign the house remembers, as a sheet — opened from the lineage row's "N earlier" stub.
 */
export function openReignsSheet(self: MenuScene): void {
  self.closeModal();
  const store = getDynasty();
  const history = dynastyHistory(store);
  const ROW = 30;
  const modal = self.ui.modal({
    title: t('dynasty.page.allReigns'),
    subtitle: t('dynasty.page.best', { score: store.bestScore.toLocaleString('en-US') }),
    onClose: () => self.closeModal(),
    height: Math.min(GAME_HEIGHT - 24, 104 + 66 + 16 + history.length * ROW),
  });
  self.modalObjects.push(...modal.objects);
  self.armSheetDismiss(modal.panelBounds);
  const { contentBounds } = modal;
  let cursor = contentBounds.y + 4;
  [...history].reverse().forEach((record) => {
    const best = record.score > 0 && record.score === store.bestScore;
    const line = `${t('dynasty.page.reign', { n: record.n })}${best ? ` · ${t('dynasty.page.record')}` : ''} · ${t('dynasty.page.epitaph', {
      waves: record.waves, lands: record.lands,
      ending: t(record.ending === 'collapse' ? 'dynasty.page.ending.collapse' : 'dynasty.page.ending.conquest'),
    })}${record.trait ? ` · ${t(`dynasty.trait.${record.trait}` as Parameters<typeof t>[0])}` : ''}`;
    self.modalObjects.push(self.ui.label(contentBounds.x + 4, cursor, line, 'caption',
      { fontSize: '10px', wordWrap: { width: contentBounds.width - 70 }, ...(best ? { color: '#8a5f1c' } : {}) }));
    self.modalObjects.push(self.ui.label(contentBounds.x + contentBounds.width - 4, cursor, record.score.toLocaleString('en-US'), 'label',
      { fontSize: '12px', align: 'right', ...(best ? { color: '#8a5f1c' } : {}) }).setOrigin(1, 0));
    cursor += ROW;
  });
  self.riseSheet(self.modalObjects.filter((o) => !(o instanceof Phaser.GameObjects.Rectangle && o.width < GAME_WIDTH)));
}
