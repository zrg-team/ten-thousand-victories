/**
 * One story's own page: the person, the path it took, everything said in order with what each
 * beat cost, the stake, a beat held back by muting, and the doors. Reached from the Chronicle's
 * rows and from the whisper strip; the footer button goes back to the Chronicle.
 *
 * Re-entrant — answering a beat or taking an opening redraws by calling `showStoryPage` again,
 * which is why it opens by destroying the scroll areas and emptying `modalLayer`. Everything
 * below that sits on a running `used` cursor, so each card adds its own measured `cardHeight`
 * back and the heights passed in are floors. `storyText` hands back the key it was given when
 * there is no string, so every optional section is gated on the result differing from its key.
 */
import { GAME_HEIGHT, GAME_WIDTH } from '../../../game/constants';
import { hudSheetHeight } from '../../../game/cameraLayout';
import { addStoryIllustration } from '../../../ui/storyIllustration';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import {
  heldBeat,
  heldBeatOptions,
  openingView,
  resolveStoryBeat,
  storyOpening,
  storyParams,
  storyDrift,
  storyPath,
  storyRegard,
  storySpokenHistory,
  takeOpening,
} from '../../../systems/story/StorySystem';
import { storyText, storyTitle } from '../../../i18n/story';
import { INK_UI, INK_UI_HEX } from '../../../ui/InkUI';
import { UI_FONT } from '../../../ui/fonts';
import { formatResourceList, heroName, t } from '../../../i18n';
import type { Historicity } from '../../../state/types';
import {
  LANE_CLOSE_BUTTON_HEIGHT,
  LANE_CLOSE_BUTTON_OFFSET,
  LANE_FOOTER_HEIGHT,
  cssHex,
  formatOutcomeAmount,
} from '../constants';
import { clearLanePage } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * One story, as the player lives it: the person, everything that has happened in order,
 * what hangs on it, and the doors that stand open.
 *
 * This screen renders data the game already stores and used to throw away — the fix for
 * "cannot see detail of story" is mostly `story.history`, finally drawn. Three deliberate
 * absences: no beat counter, no progress, no reward preview. The season markers are memory
 * aids ("when"), never fractions ("how far").
 */
export function showStoryPage(self: ConquestUIScene, storyId: string): void {
  const state = self.state;
  const story = (state.stories ?? []).find((candidate) => candidate.id === storyId);
  if (!story) {
    self.showChronicleScreen();
    return;
  }

  clearLanePage(self);

  const params = storyParams(state, story);
  const hero = state.heroes.find((candidate) => candidate.id === story.cast.heroId);
  const want = storyText(`${story.templateId}.want`, params);
  const { body, bodyWidth, finish } = self.promptScrollBody(
    storyTitle(story.templateId),
    want !== `${story.templateId}.want` ? t('ascent.story.wants', { want }) : '',
    LANE_FOOTER_HEIGHT,
  );

  const held = heldBeat(state, story);
  const shownFragment = held?.fragment.id ?? story.spoken[story.spoken.length - 1];
  let used = addStoryIllustration(self, body, story.templateId, shownFragment, bodyWidth);

  // The person, face first. A story with nobody in it skips straight to the record.
  if (hero) {
    const faceSize = 56;
    const holder = self.add.container(0, used);
    holder.add(renderHeroFaceInBox(self, hero, { x: 0, y: 0, width: faceSize, height: faceSize }));
    const frame = self.add.graphics();
    frame.lineStyle(1.2, INK_UI.brush, 0.5);
    frame.strokeRect(0, 0, faceSize, faceSize);
    holder.add(frame);
    const name = self.ui.label(faceSize + 12, 2, heroName(hero), 'label', { fontSize: '15px', wordWrap: { width: bodyWidth - faceSize - 16 } });
    holder.add(name);
    let personHeight = Math.max(faceSize, name.height + 6);
    const regard = storyRegard(state, story);
    const regardText = regard ? storyText(`${story.templateId}.regard.${regard}`, params) : undefined;
    if (regardText && regardText !== `${story.templateId}.regard.${regard}`) {
      const regardLabel = self.ui.label(faceSize + 12, name.height + 8, regardText, 'body', {
        fontSize: '11px',
        color: INK_UI_HEX.mutedText,
        fontStyle: 'italic',
        wordWrap: { width: bodyWidth - faceSize - 16 },
      });
      holder.add(regardLabel);
      personHeight = Math.max(personHeight, regardLabel.y + regardLabel.height);
    }
    body.add(holder);
    used += personHeight + 14;
  }

  // ── Đã xảy ra: the case this story has been building, in order, dated ──
  const heading = (label: string) => {
    const text = self.add.text(2, used, label.toLocaleUpperCase(), {
      color: INK_UI_HEX.mutedText,
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: '700',
    });
    text.setLetterSpacing?.(1.6);
    body.add(text);
    used += 18;
  };

  // ── The spine: which way this went, and where it left the record ──
  //
  // The decision tree made visible, and the only screen that teaches the player the feature
  // exists. `history` answers what was said; this answers which way it went, and they are not
  // the same question. A template with no trunk returns an empty path and the section is
  // simply omitted.
  const spine = storyPath(state, story);
  if (spine.length > 0) {
    const chipFor = (h: Historicity) =>
      (h === 'chinh-su' ? INK_UI.jade : h === 'da-su' ? INK_UI.gold : INK_UI.cinnabar);

    // The class of the whole path, stated once at the top in words.
    const drift = storyDrift(story);
    const chip = self.ui.card(
      { x: 0, y: used, width: bodyWidth, height: 38 },
      {
        title: '',
        subtitle: t(`ascent.story.class.${drift}` as Parameters<typeof t>[0]),
        border: chipFor(drift),
      },
    );
    body.add(chip);
    used += ((chip.getData('cardHeight') as number) ?? 38) + 8;

    heading(t('ascent.story.path'));
    for (const step of spine) {
      const label = storyText(`${story.templateId}.node.${step.nodeId}`, params);
      const rail = self.add.graphics();
      rail.fillStyle(chipFor(step.historicity), step.current ? 1 : 0.55);
      rail.fillRect(2, used + 4, 3, 14);
      body.add(rail);
      const text = self.ui.label(
        14, used,
        label !== `${story.templateId}.node.${step.nodeId}` ? label : step.nodeId,
        'body',
        {
          fontSize: '11px',
          wordWrap: { width: bodyWidth - 90 },
          ...(step.current ? { fontStyle: '700' } : { color: INK_UI_HEX.mutedText }),
        },
      );
      body.add(text);
      // The step where the realm first left the record is the one worth marking. Every step
      // after it is merely still away.
      if (step.diverged) {
        body.add(self.ui.label(bodyWidth, used, t('ascent.story.leftHere'), 'caption', {
          fontSize: '9px',
          color: cssHex(INK_UI.cinnabar),
        }).setOrigin(1, 0));
      }
      used += Math.max(20, text.height + 6);
    }
    used += 8;
  }


  heading(t('ascent.story.happened'));
  const beats = storySpokenHistory(state, story);
  beats.forEach((beat, index) => {
    // The scene if the story has one, the annal line if it does not.
    //
    // These two keys are doing different jobs and this list wants the first. `chronicle` is
    // the one-line entry a dynastic record would hold - deliberately flat, seven words, no
    // room in it - and a page built from those reads as a stack of bulletins rather than as
    // the story the player actually lived. `scene` is the room it happened in.
    const stem = story.templateId + '.' + beat.fragmentId;
    const scene = storyText(stem + '.scene', params);
    const line = scene !== stem + '.scene'
      ? scene
      : storyText(stem + '.chronicle', params);
    const isLatest = index === beats.length - 1;
    const marker = beat.turn !== undefined ? t('ascent.story.season', { n: beat.turn }) : '·';
    const markerText = self.add.text(2, used, marker, {
      color: INK_UI_HEX.mutedText,
      fontFamily: UI_FONT,
      fontSize: '10px',
    });
    body.add(markerText);
    // Built without `undefined` values: `InkUI.label` spreads overrides over the variant
    // style, so an explicit `color: undefined` erases the ink and Phaser falls back to
    // white — invisible on parchment. The latest beat was rendering as a blank line.
    const beatText = self.ui.label(40, used, line, 'body', {
      fontSize: isLatest ? '12px' : '11px',
      wordWrap: { width: bodyWidth - 44 },
      ...(isLatest ? { fontStyle: '700' } : { color: INK_UI_HEX.mutedText }),
    });
    body.add(beatText);
    used += Math.max(18, beatText.height + 7);

    // What that beat cost and what it bought, under the beat itself.
    //
    // The report card says it once, on the way past; this is where it stays. Three seasons
    // later, "what did giving him the grain actually do" has an answer on the page rather than
    // only in a modal the player has already dismissed.
    for (const entry of beat.outcome ?? []) {
      const key = `ascent.story.outcome.${entry.kind}` as Parameters<typeof t>[0];
      const n = formatOutcomeAmount(entry);
      const ledger = t(key, { n, name: entry.name ?? '' });
      if (ledger === key) continue;
      const row = self.ui.label(48, used, ledger, 'caption', {
        fontSize: '10px',
        color: (entry.amount ?? 0) < 0
          ? cssHex(INK_UI.cinnabar)
          : INK_UI_HEX.mutedText,
        wordWrap: { width: bodyWidth - 52 },
      });
      body.add(row);
      used += Math.max(14, row.height + 3);
    }
  });
  used += 8;

  // ── Đang treo: the stake, named. Only when the template declares one. ──
  const stake = storyText(`${story.templateId}.stake`, params);
  if (stake !== `${story.templateId}.stake`) {
    heading(t('ascent.story.stake'));
    const card = self.ui.card(
      { x: 0, y: used, width: bodyWidth, height: 46 },
      { title: '', subtitle: stake, border: INK_UI.gold },
    );
    body.add(card);
    used += ((card.getData('cardHeight') as number) ?? 46) + 10;
  }

  // ── The beat it is holding, when beats have been muted ──
  //
  // With `storyCardsMuted` the director never raises this as a card, so the story stands here
  // holding it and this is the only place it can be answered. Drawn exactly like the prompt
  // would have been — same options, same prices, same closed-when-unaffordable — because a beat
  // answered here must not behave differently from the same beat answered mid-run.
  if (held) {
    heading(t('ascent.story.heldBeat'));
    const key = (suffix: string) => `${story.templateId}.${held.fragment.id}.${suffix}`;
    const intro = self.ui.card(
      { x: 0, y: used, width: bodyWidth, height: 60 },
      {
        title: storyText(key('title'), held.params),
        subtitle: storyText(key('body'), held.params),
        border: INK_UI.cinnabar,
      },
    );
    body.add(intro);
    used += ((intro.getData('cardHeight') as number) ?? 60) + 8;

    const options = heldBeatOptions(state, story, held.fragment);
    if (options.length === 0) {
      // A blow. There is nothing to choose; acknowledging it is the whole interaction.
      const ack = self.optionCard(
        { x: 0, y: used, width: bodyWidth, height: 52 },
        {
          title: storyText(key('ok'), held.params),
          body: '',
          accent: INK_UI.cinnabar,
          parent: body,
          onTap: () => {
            resolveStoryBeat(state, story.id, held.fragment.id, 'ok');
            showStoryPage(self, storyId);
          },
        },
      );
      used += ((ack.getData('cardHeight') as number) ?? 52) + 8;
    } else {
      for (const option of options) {
        const card = self.optionCard(
          { x: 0, y: used, width: bodyWidth, height: 64 },
          {
            title: storyText(key(option.id), held.params),
            body: storyText(key(`${option.id}.d`), held.params),
            note: option.cost ? formatResourceList(option.cost) : undefined,
            noteColor: option.affordable ? undefined : cssHex(INK_UI.cinnabar),
            accent: INK_UI.cinnabar,
            disabled: !option.affordable,
            parent: body,
            onTap: () => {
              if (resolveStoryBeat(state, story.id, held.fragment.id, option.id)) {
                showStoryPage(self, storyId);
              }
            },
          },
        );
        used += ((card.getData('cardHeight') as number) ?? 64) + 8;
      }
    }
    used += 4;
  }


  // ── Có thể làm / Đang chờ: exactly one of the two, never neither ──
  const opening = storyOpening(state, story);
  if (opening) {
    heading(t('ascent.story.doors'));
    // The door prints its price and greys out when the treasury cannot cover it. It used to
    // draw live and gold regardless, and an unaffordable press died inside `takeOpening`
    // with no feedback at all — the page read as broken, not as expensive.
    const view = openingView(state, opening);
    const door = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: 64 },
      {
        title: storyText(opening.actionKey, opening.params),
        body: storyText(opening.textKey, opening.params),
        note: view.cost ? formatResourceList(view.cost) : undefined,
        noteColor: view.affordable ? undefined : cssHex(INK_UI.cinnabar),
        accent: INK_UI.gold,
        disabled: !view.affordable,
        parent: body,
        onTap: () => {
          if (takeOpening(state, opening.storyId, opening.fragmentId)) showStoryPage(self, storyId);
        },
      },
    );
    used += ((door.getData('cardHeight') as number) ?? 64) + 8;

    // Refusal is a real option and is listed as one — with no button, because the way to
    // take it is to close the page and keep playing. The hint says exactly that.
    const noThing = self.ui.card(
      { x: 0, y: used, width: bodyWidth, height: 44 },
      {
        title: t('ascent.story.doNothing'),
        subtitle: t('ascent.story.doNothingHint'),
        border: INK_UI.softBrush,
        muted: true,
      },
    );
    body.add(noThing);
    used += ((noThing.getData('cardHeight') as number) ?? 44) + 10;
  } else if (!held) {
    // Only when the story is not already showing something to answer. Printing "waiting on the
    // ransom price" directly under the card that sets the ransom price is the page arguing with
    // itself.
    heading(t('ascent.story.waitingFor'));
    const watching = storyText(`${story.templateId}.waiting`, params);
    const card = self.ui.card(
      { x: 0, y: used, width: bodyWidth, height: 44 },
      {
        title: '',
        subtitle: watching !== `${story.templateId}.waiting` ? watching : t('ascent.story.waitingDefault'),
        border: INK_UI.softBrush,
        muted: true,
      },
    );
    body.add(card);
    used += ((card.getData('cardHeight') as number) ?? 44) + 10;
  }

  finish(used);

  // Back to the list, in the lane's standard footer slot.
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
