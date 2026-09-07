/**
 * One finished story, read from beginning to end.
 *
 * **Sử ký's archive had no way in.** "Đã chép" drew one row per ending — a title and the single
 * flat `chronicle` line a dynastic record would hold — with no tap handler at all, and "Đã nghe"
 * opened a page only while the story behind it was still running, which is precisely backwards:
 * the entries a player wants to go back and read are the ones that are over. Reported as: *Đã
 * nghe, Đã chép — can click to see detail and read as full flow, especially Đã chép: build
 * timeline and can read detail as a story.*
 *
 * The timeline itself is not new work. `storyPage` has drawn a dated beat list — season marker,
 * the scene rather than the annal line, the outcome ledger underneath — since the Chronicle was
 * rewritten; it simply could not be pointed at a story that had ended, because `ActiveStory` and
 * its `history` are deleted the instant a terminal fires. `ChronicleEntry.history` now carries a
 * copy (see `record` in `StorySystem`), and this page is that renderer aimed at it.
 *
 * Deliberately its own file rather than a branch inside `storyPage`: that page is about a story in
 * flight — what it wants, who it is about, which way it is drifting, what is still on offer — and
 * half of that is meaningless once the thing has concluded. This one is a record.
 */
import { GAME_HEIGHT, GAME_WIDTH } from '../../../game/constants';
import { hudSheetHeight } from '../../../game/cameraLayout';
import {
  cssHex, formatOutcomeAmount,
  LANE_CLOSE_BUTTON_HEIGHT, LANE_CLOSE_BUTTON_OFFSET, LANE_FOOTER_HEIGHT,
} from '../constants';
import { storyText, storyTitle } from '../../../i18n/story';
import { INK_UI, INK_UI_HEX } from '../../../ui/InkUI';
import { UI_FONT } from '../../../ui/fonts';
import { heroName, seasonLabel, t } from '../../../i18n';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { heroStatsLine } from '../../../ui/heroPickerRows';
import { dateOfTurn } from '../../../systems/seasonClock';
import { clearLanePage } from '../layers';
import type { ChronicleEntry } from '../../../state/types';
import type { ConquestUIScene } from '../../ConquestUIScene';

export function showChronicleEntry(self: ConquestUIScene, entryId: string): void {
  const state = self.state;
  const entry = (state.chronicle ?? []).find((candidate) => candidate.id === entryId);
  if (!entry) {
    self.showChronicleScreen();
    return;
  }

  clearLanePage(self);

  const cls = entry.historicity;
  const { body, bodyWidth, finish } = self.promptScrollBody(
    storyTitle(entry.templateId),
    cls ? t(('ascent.story.tag.' + cls) as Parameters<typeof t>[0]) : '',
    LANE_FOOTER_HEIGHT,
  );

  let used = 0;
  const heading = (label: string): void => {
    const text = self.add.text(2, used, label.toLocaleUpperCase(), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
    });
    text.setLetterSpacing?.(1.6);
    body.add(text);
    used += 18;
  };

  /**
   * The person it happened to, face first.
   *
   * The live story page opens on them (`storyPage`) and the record did not, which made the archive
   * read as a report about an incident rather than as what became of somebody. Drawn only when the
   * story had a champion in it at all — plenty are about a province or the treasury.
   */
  const hero = entry.heroId
    ? state.heroes.find((candidate) => candidate.id === entry.heroId)
    : undefined;
  if (hero) {
    const faceSize = 52;
    const holder = self.add.container(0, used);
    holder.add(renderHeroFaceInBox(self, hero, { x: 0, y: 0, width: faceSize, height: faceSize }));
    const frame = self.add.graphics();
    frame.lineStyle(1.2, INK_UI.brush, 0.5);
    frame.strokeRect(0, 0, faceSize, faceSize);
    holder.add(frame);
    holder.add(self.ui.label(faceSize + 12, 8, heroName(hero), 'label', { fontSize: '14px' }));
    holder.add(self.ui.label(faceSize + 12, 28, heroStatsLine(hero), 'body', {
      fontSize: '10px', color: INK_UI_HEX.mutedText, wordWrap: { width: bodyWidth - faceSize - 16 },
    }));
    body.add(holder);
    used += faceSize + 12;
  }

  /**
   * The beats, in the order they were spoken.
   *
   * `scene` before `chronicle` for the same reason `storyPage` prefers it: the annal line is seven
   * flat words written to sit in a dynastic record, and a page built out of those reads as a stack
   * of bulletins rather than as the thing the player lived through. The last beat is the terminal
   * and is set in the heavier face — it is the line the archive row already showed, and seeing it
   * arrive at the end of its own telling is the point of the page.
   */
  const beats = entry.history ?? [];
  if (beats.length > 0) {
    heading(t('ascent.chronicle.howItWent'));

    /**
     * An actual line down the page, with a node on every beat.
     *
     * The dates alone were a column of numbers beside a column of prose and read as a table; a
     * chronicle is a *sequence*, and the one mark that says so is a rail. Drawn after the beats are
     * laid out, because it has to know where the last one ended — the graphics object is added to
     * the body now so it sits under the type rather than over it.
     */
    const rail = self.add.graphics();
    body.add(rail);
    // Wide enough for `Năm 12` set at 9px. The column was 22 and clipped `Đông` to `Đôn`; it then
    // carried a bare number over a season, which reads as neither — reported as *what is 4 Đông?*
    const railX = 48;
    const nodes: Array<{ y: number; last: boolean }> = [];
    const railTop = used + 6;

    beats.forEach((beat, index) => {
      const stem = `${entry.templateId}.${beat.fragmentId}`;
      const scene = storyText(`${stem}.scene`, entry.params);
      const line = scene !== `${stem}.scene` ? scene : storyText(`${stem}.chronicle`, entry.params);
      const isLast = index === beats.length - 1;
      const when = dateOfTurn(beat.turn);
      // The year and the season, as the header says them — not the raw tick the record stamps.
      // `M31` was a number in a unit the game explains nowhere.
      body.add(self.add.text(2, used, t('ascent.chronicle.beatDate', {
        year: when.year, season: seasonLabel(when.season),
      }), {
        color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px',
        align: 'right', fixedWidth: 40, lineSpacing: -1,
      }));
      nodes.push({ y: used + 6, last: isLast });
      const beatText = self.ui.label(railX + 14, used, line, 'body', {
        fontSize: isLast ? '12px' : '11px',
        wordWrap: { width: bodyWidth - railX - 18 },
        ...(isLast ? { fontStyle: '700' } : { color: INK_UI_HEX.mutedText }),
      });
      body.add(beatText);
      used += Math.max(18, beatText.height + 7);

      for (const change of beat.outcome ?? []) {
        const key = `ascent.story.outcome.${change.kind}` as Parameters<typeof t>[0];
        const ledger = t(key, { n: formatOutcomeAmount(change), name: change.name ?? '' });
        if (ledger === key) continue;
        const row = self.ui.label(railX + 22, used, ledger, 'caption', {
          fontSize: '10px',
          color: (change.amount ?? 0) < 0 ? cssHex(INK_UI.cinnabar) : INK_UI_HEX.mutedText,
          wordWrap: { width: bodyWidth - railX - 26 },
        });
        body.add(row);
        used += Math.max(14, row.height + 3);
      }
    });

    // The rail itself, and its beads. The terminal's is filled and larger: it is the one beat that
    // ended the thing, and the page should say so before a word of it is read.
    const railBottom = nodes.length ? nodes[nodes.length - 1].y : railTop;
    rail.lineStyle(1.4, INK_UI.softBrush, 0.75);
    rail.lineBetween(railX, railTop, railX, railBottom);
    for (const node of nodes) {
      rail.fillStyle(node.last ? INK_UI.cinnabar : INK_UI.parchment, 1);
      rail.fillCircle(railX, node.y, node.last ? 4.5 : 3.5);
      rail.lineStyle(1.4, node.last ? INK_UI.cinnabar : INK_UI.softBrush, 1);
      rail.strokeCircle(railX, node.y, node.last ? 4.5 : 3.5);
    }
    used += 8;
  }

  // The ending, always — including for an entry written before the beats were kept, which is the
  // whole of what those saves have.
  heading(t('ascent.chronicle.ending'));
  const ending = self.ui.label(
    2, used, storyText(`${entry.templateId}.${entry.fragmentId}.chronicle`, entry.params), 'body',
    { fontSize: '12px', wordWrap: { width: bodyWidth - 6 } },
  );
  body.add(ending);
  used += ending.height + 8;

  // What the ending itself cost or bought. Recorded on every terminal since the Chronicle was
  // rewritten and drawn on no screen until now.
  for (const change of entry.outcome ?? []) {
    const key = `ascent.story.outcome.${change.kind}` as Parameters<typeof t>[0];
    const ledger = t(key, { n: formatOutcomeAmount(change), name: change.name ?? '' });
    if (ledger === key) continue;
    const row = self.ui.label(10, used, ledger, 'caption', {
      fontSize: '10px',
      color: (change.amount ?? 0) < 0 ? cssHex(INK_UI.cinnabar) : INK_UI_HEX.mutedText,
      wordWrap: { width: bodyWidth - 14 },
    });
    body.add(row);
    used += Math.max(14, row.height + 3);
  }

  finish(used);

  self.modalLayer.add(self.ui.button(
    {
      x: 20,
      y: hudSheetHeight() - LANE_CLOSE_BUTTON_OFFSET,
      width: GAME_WIDTH - 40,
      height: LANE_CLOSE_BUTTON_HEIGHT,
    },
    t('ascent.story.back'),
    () => self.showChronicleScreen(),
    { variant: 'primary', fontSize: '13px' },
  ));
}
