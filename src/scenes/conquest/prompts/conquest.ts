/**
 * The Conquer drill-down, three sheets deep — the provinces in reach, the ways into the one you
 * picked, then who carries the chosen way out — plus the power draft, which sits here because it
 * is built the same way and for no other reason.
 *
 * Each sheet pins its exit under a scrolling list at `GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8`.
 * The conquest three are one back-stack: `showMethodActorPicker` re-enters `showConquerMethod`
 * through `replaceLanePage` and must carry the same `notice` back, or the refusal the player was
 * halfway through reading vanishes on the return trip. `methodPriceTag` is quoted by both the
 * method card and the picker's confirmation, so a way in cannot be priced two ways on two sheets.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, PLAYER_KINGDOM_ID } from '../../../game/constants';
import { cardStack, powerCardView, skipRefundAmount } from '../../../systems/ascent/PowerDraftSystem';
import { findPowerCard } from '../../../data/ascentCards';
import { cabinetCard, cabinetLevel, combineCost, openingHand } from '../../../state/cabinet';
import { buildAllConquestTargets, methodActorLine, methodHasActor }
  from '../../../systems/ascent/ConquestSystem';
import { buildHeroPickerRows, buildHostPickerRows } from '../../../ui/heroPickerRows';
import { CardFan } from '../../../ui/ascent/CardFan';
import { focusTitle } from '../../../ui/focusPanel';
import { TITLE_FONT, UI_FONT } from '../../../ui/fonts';
import { addStoryPrint, powerStoryPrint } from '../../../ui/storyPrint';
import { INK_UI, type UIBounds } from '../../../ui/InkUI';
import { iconForOption } from '../../../ui/CardIcons';
import { staggerIn } from '../../../ui/animations';
import { motionMs } from '../../../game/lifeSettings';
import { formatResourceList, heroName, t } from '../../../i18n';
import type { AscentPrompt, ConquestMethodOption, ConquestTarget } from '../../../state/types';
import { PROMPT_FOOTER_HEIGHT, RARITY_COLOR } from '../constants';
import { promptFoot } from './frame';
import type { ConquestUIScene } from '../../ConquestUIScene';


// ── Prompts ───────────────────────────────────────────────────────────────

/**
 * The Power Draft as a fanned hand — cards get a **body**.
 *
 * The old sheet was a scrolling list of `optionCard` rows: correct, and indistinguishable from
 * every administrative prompt in the mode. This is the run's central reward moment, so the
 * cards are now real card faces (baked once per `(id, level)` — see `cardFace.ts`, and the perf
 * ledger's warning about live Graphics), held across the bottom third the way a hand is held:
 * tap to raise, tap the raised card to take. The reroll and skip stay in the footer, and the
 * prompt bus and resolver are untouched — a reroll re-renders through `promptSignature` exactly
 * as before.
 *
 * Everything the row used to print — description, stack, the power preview, the evolution
 * call-out — moves to a readout above the fan describing the *raised* card, which is also what
 * makes four faces legible at 390 wide: the fan carries identity, the readout carries numbers.
 */
export function showPowerDraft(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'power-draft' }>): void {
  const content = self.promptFrame(
    t('ascent.draft.title', { level: prompt.level }),
    t('ascent.draft.subtitle'),
  );

  const views = prompt.cards
    .map((cardId) => powerCardView(self.state, cardId))
    .filter((view): view is NonNullable<typeof view> => Boolean(view));
  if (views.length === 0) return;

  // The bottom third holds the hand; the readout takes what is left above it. Both are measured
  // back from the pinned footer, so the sheet holds together at the 620 clamp.
  const footerY = GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8;
  // Between the readout and the fan there are two fixed lanes: the floating take-pill's
  // (~30 units around fanTop−40) and, above it, the gesture hint's. Sized apart or the pill
  // prints straight over the hint whenever the raised card sits mid-screen.
  const hint = self.add.text(content.x + content.width / 2, 0, t('ascent.draft.fanHint'), {
    color: '#6f6250', fontFamily: UI_FONT, fontSize: '10px', align: 'center',
    wordWrap: { width: content.width - 8 },
  }).setOrigin(0.5, 1);
  // Reserve the measured hint above the highest edge of the floating take button.
  const HINT_BOTTOM_ABOVE_FAN = 60;
  const LANES = HINT_BOTTOM_ABOVE_FAN + hint.height + 8;
  const fanHeight = Phaser.Math.Clamp(Math.round(content.height * 0.48), 180, 232);
  const fanTop = footerY - 10 - fanHeight;
  // Capped: on a tall sheet the leftover space above the fan runs past 400 units, and a readout
  // stretched to fill it is a page of blank paper with four lines in its corner.
  const infoHeight = Math.min(fanTop - content.y - LANES, 306);

  const info = self.add.container(content.x, content.y);
  self.modalLayer.add(info);

  const describe = (index: number, merged = false): void => {
    info.removeAll(true);
    const view = views[index];
    info.add(self.ui.panel({ x: 0, y: 0, width: content.width, height: infoHeight },
      { border: view.evolutionReady ? INK_UI.gold : RARITY_COLOR[view.rarity], borderWidth: 1.4, fillAlpha: 0.55 }));
    const rail = self.add.graphics();
    rail.fillStyle(RARITY_COLOR[view.rarity], 1);
    rail.fillRect(1.5, 6, 4, infoHeight - 12);
    info.add(rail);

    let cursor = 10;
    const title = self.ui.label(14, cursor, `${view.name}  ·  ${view.stackLabel}`, 'label',
      { fontSize: '13px', wordWrap: { width: content.width - 28 } });
    info.add(title);
    cursor += title.height + 4;
    // After a merge the stack line re-inks with the copy counted — "II" becomes "III" on the
    // card the player is taking, not in a footer later.
    const stackDef = findPowerCard(view.id);
    const stackNow = self.state.ascent ? cardStack(self.state.ascent, view.id) : 0;
    const stackLine = merged && stackDef
      ? t('ascent.draft.stackCount', { n: Math.min(stackNow + 2, stackDef.maxStacks), max: stackDef.maxStacks })
      : view.stackCount;
    const stackText = self.ui.label(14, cursor,
      `${t(`ascent.rarity.${view.rarity}` as Parameters<typeof t>[0])}  ${stackLine}`,
      'caption', { fontSize: '10px', ...(merged ? { color: '#8a5f1c' } : {}) });
    info.add(stackText);
    if (merged) {
      stackText.setAlpha(0);
      self.tweens.add({ targets: stackText, alpha: 1, duration: motionMs(180), ease: 'Sine.easeOut' });
    }
    cursor += 18;
    /**
     * `TITLE_FONT`, not the `'Georgia, serif'` this used to name outright.
     *
     * Georgia has no glyph for the marks that stack — ố, ấ, ề — so Chrome decomposed them and
     * gave the acute its own advance: measured 41.6 units against ê's 19.3, which on the page
     * reads as *tô ́n ít hơn* and *Câ ́p 2*. Every string in this game is Vietnamese first, which
     * is the whole reason `ui/fonts.ts` exists and the reason nothing else names a face inline.
     * Source Serif 4 carries the language's subset and draws all three in one advance.
     */
    const body = self.add.text(14, cursor, view.description, {
      color: '#4a3a28', fontFamily: TITLE_FONT, fontSize: '11.5px',
      wordWrap: { width: content.width - 28 }, lineSpacing: 2,
    });
    info.add(body);
    cursor += body.height + 6;

    // The next cabinet level's line, ghosted under the current one: what a combine would buy,
    // read on the card the player is about to take rather than on a page between runs.
    const def = findPowerCard(view.id);
    const lv = cabinetLevel(view.id);
    if (def && lv < 3 && def.levels.length > lv && cursor < infoHeight - 30) {
      const ghost = self.add.text(14, cursor, t('ascent.draft.nextLevel', {
        level: lv + 1,
        text: t(`ascent.card.${view.id}.d` as Parameters<typeof t>[0], def.levels[lv].display),
      }), {
        color: '#8b7a5e', fontFamily: TITLE_FONT, fontSize: '10px',
        wordWrap: { width: content.width - 28 }, lineSpacing: 1,
      }).setAlpha(0);
      info.add(ghost);
      // Ghosts in beneath the effect on the raise — compare before committing.
      self.tweens.add({ targets: ghost, alpha: 0.8, duration: motionMs(180), ease: 'Sine.easeOut' });
      cursor += ghost.height + 6;
    }

    // The evolution call-out outranks the power preview: completing a pair is the headline
    // reward, and a bare percentage would undersell it.
    const note = view.evolutionReady
      ? t('ascent.draft.evoReady')
      : view.powerGainPct > 0
        ? t('ascent.draft.powerPreview', { pct: view.powerGainPct })
        : undefined;
    if (note && cursor < infoHeight - 14) {
      const noteText = self.add.text(14, cursor, note, {
        color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '11px', fontStyle: '700',
        wordWrap: { width: content.width - 28 },
      });
      info.add(noteText);
      cursor += noteText.height + 4;
    }
    // The forge remembers: a learned recipe names the partner from run one.
    if (view.recipeHint && cursor < infoHeight - 14) {
      const hint = self.add.text(14, cursor, view.recipeHint, {
        color: '#4a6a55', fontFamily: UI_FONT, fontSize: '10px',
        wordWrap: { width: content.width - 28 },
      });
      info.add(hint);
      cursor += hint.height + 6;
    }
    const printHeight = Math.min(152, infoHeight - cursor - 16);
    if (printHeight >= 46) addStoryPrint(self, info, powerStoryPrint(view.id),
      {x:14, y:cursor + 6, width:content.width - 28, height:printHeight});
  };

  // An evolution-ready card sits raised by default — the fan opens on the headline. With no
  // headline it opens on the centre card, which is what keeps the resting hand symmetric.
  const evo = views.findIndex((view) => view.evolutionReady);
  const initial = evo >= 0 ? evo : Math.floor((views.length - 1) / 2);
  // Each card carries what the bake cannot: this run's stack, the cabinet's copies toward the
  // next combine, and whether it rides in the opening hand. A held card is dealt last.
  const ascent = self.state.ascent;
  const hand = openingHand();
  const fan = new CardFan(self, {
    x: content.x, y: fanTop, width: content.width, height: fanHeight,
    cards: views.map((view) => {
      const def = findPowerCard(view.id);
      const stack = ascent ? cardStack(ascent, view.id) : 0;
      const owned = cabinetCard(view.id);
      return {
        id: view.id,
        held: stack > 0,
        overlay: {
          stack,
          maxStack: def?.maxStacks ?? 0,
          level: owned?.level ?? 1,
          copies: owned?.copies ?? 0,
          need: combineCost(owned?.level ?? 1),
          inHand: hand.includes(view.id),
        },
      };
    }),
    initial,
    onRaise: describe,
    onMerge: (index) => describe(index, true),
    onTake: (index) => self.choose(views[index].id),
    takeLabel: t('ascent.fan.take'),
    deal: true,
  });
  self.modalLayer.add(fan.view);

  // The gesture, said once, in its own lane above the take-pill's.
  hint.setY(fanTop - HINT_BOTTOM_ABOVE_FAN);
  self.modalLayer.add(hint);
  const affordable = self.state.resources.gold >= prompt.rerollCost;
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: footerY, width: content.width / 2 - 6, height: 40 },
    affordable
      ? t('ascent.draft.reroll', { cost: prompt.rerollCost })
      : t('ascent.draft.rerollPoor', { cost: prompt.rerollCost }),
    () => self.events.emit('ui:ascent-reroll'),
    { variant: affordable ? 'secondary' : 'disabled', fontSize: '12px' },
  ));
  self.modalLayer.add(self.ui.button(
    { x: content.x + content.width / 2 + 6, y: footerY, width: content.width / 2 - 6, height: 40 },
    t('ascent.draft.skip', { xp: skipRefundAmount(self.state) }),
    () => self.choose('skip'),
    { variant: 'ghost', fontSize: '12px' },
  ));
}

/** One province row, shared by the Conquer prompt and the Conquer lane browser. */
function provinceCard(self: ConquestUIScene,
  bounds: UIBounds,
  target: ConquestTarget,
  onTap: () => void,
  parent?: Phaser.GameObjects.Container,
): Phaser.GameObjects.Container {
  const open = target.methods.filter((method) => !method.blockedReason);
  // The headline is *how many ways in there are*, not the odds: a bare win percentage hides
  // every peaceful path, and "best odds" reads 100% on almost every province because most
  // admit at least one method that cannot fail. What separates provinces at this level is
  // the garrison and the reward, both already on the card; the methods carry their own
  // numbers on the sheet behind it.
  const note = target.busyReason
    ? target.busyReason
    : open.length > 0
      ? t('ascent.conquer.ways', { n: open.length })
      : t('ascent.conquer.noWay');

  return self.optionCard(bounds, {
    title: target.landName,
    body: [
      // What the ground is *for*, beside what it is. The reward tag reads today's outputs, and an
      // unbuilt village has none — so nearly every village read "open country" and the thing a
      // claim is chosen for, what the land can become, was nowhere on the card. The tag still
      // speaks where it says something (a shrine, a district already paying); "open country" is
      // the tag's way of saying nothing, and it is left off.
      [
        t(`ascent.conquer.kind.${target.landKind}` as Parameters<typeof t>[0], { owner: target.ownerName ?? '' }),
        target.suits
          ? t('ascent.conquer.suits', { focus: focusTitle(self.state, target.suits.focus), pct: target.suits.pct })
          : '',
      ].filter(Boolean).join('  ·  '),
      target.rewardTag !== 'plain' ? t(`ascent.march.reward.${target.rewardTag}` as Parameters<typeof t>[0]) : '',
    ].filter(Boolean).join('\n'),
    note: `${note}  ·  ${t('ascent.march.garrison', { value: target.garrison })}`,
    // Green means a road in that cannot fail; amber means every road is a gamble.
    accent: open.length === 0
      ? INK_UI.softBrush
      : target.hasCertainMethod ? INK_UI.jade : target.bestChance >= 45 ? INK_UI.gold : INK_UI.cinnabar,
    disabled: open.length === 0 && !target.busyReason,
    parent,
    onTap,
  });
}

export function showConquerTarget(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'conquer-target' }>): void {
  // `frontLandId` is cleared the moment a province falls, so it cannot distinguish these
  // cases — keying off how much ground the realm holds does.
  const held = self.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    t('ascent.conquer.title'),
    held <= 1 ? t('ascent.conquer.subtitleFirst') : t('ascent.conquer.subtitle', { held }),
    PROMPT_FOOTER_HEIGHT,
  );

  const rowHeight = 92;
  const cards: Phaser.GameObjects.Container[] = [];
  // Stride by each card's measured height, never by the constant: the suits line makes the body
  // two lines, and a card that grows past the constant overlaps the one beneath it.
  let used = 0;
  prompt.targets.forEach((target) => {
    const card = provinceCard(self,
      { x: 0, y: used, width: bodyWidth, height: rowHeight },
      target,
      () => self.choose(target.landId),
      body,
    );
    cards.push(card);
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 10;
  });
  staggerIn(self, cards);
  finish(used);

  promptFoot(self, content, {
    close: { label: t('ascent.march.hold'), onTap: () => self.choose('hold') },
  });
}

/**
 * The price tag on a method card, on one line: cost, duration, resulting loyalty, and the
 * odds. Kept to a single line deliberately — it sits in the card's fixed-height note slot,
 * and a second line would be clipped by the card edge.
 */
function methodPriceTag(option: ConquestMethodOption): string {
  const parts: string[] = [
    option.cost && Object.keys(option.cost).length > 0
      ? formatResourceList(option.cost)
      : t('ascent.conquer.free'),
  ];
  if (option.ticks > 0) parts.push(t('ascent.conquer.ticks', { n: option.ticks }));
  parts.push(t('ascent.conquer.loyalty', { n: option.loyalty }));
  parts.push(option.chance >= 100 ? t('ascent.conquer.certain') : t('ascent.conquer.chance', { pct: option.chance }));
  return parts.join('  ·  ');
}

/**
 * Step two of a conquest: every way into this province, priced.
 *
 * Blocked methods stay on screen greyed with their concrete reason rather than being hidden.
 * Seeing that a bribe needs 74 gold when you hold 51 is how the player learns what the
 * treasury is *for* — a filtered list would just look like the game offering less.
 */
export function showConquerMethod(self: ConquestUIScene, target: ConquestTarget, notice?: string): void {
  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    target.landName,
    t('ascent.conquer.methodSubtitle', {
      kind: t(`ascent.conquer.kind.${target.landKind}` as Parameters<typeof t>[0], { owner: target.ownerName ?? '' }),
      garrison: target.garrison,
    }),
    PROMPT_FOOTER_HEIGHT,
  );

  const rowHeight = 82;
  const cards: Phaser.GameObjects.Container[] = [];
  let used = 0;

  // What the last attempt on this province came to, above the ways still open. Cinnabar and
  // sitting first, because it is news the player did not ask for and must not scroll past.
  if (notice) {
    const banner = self.ui.card(
      { x: 0, y: 0, width: bodyWidth, height: 54 },
      { title: t('ascent.conquer.refused'), subtitle: notice, border: INK_UI.cinnabar },
    );
    body.add(banner);
    used += ((banner.getData('cardHeight') as number) ?? 54) + 12;
  }

  target.methods.forEach((option) => {
    const blocked = Boolean(option.blockedReason);
    const actorLine = !blocked && methodHasActor(option.method) ? methodActorLine(self.state, option) : undefined;

    const card = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: rowHeight },
      {
        icon: iconForOption(option.method),
        title: t(`ascent.method.${option.method}` as Parameters<typeof t>[0]),
        // Description in the wrapping body slot, numbers on the single-line note slot —
        // the reverse clipped the second line of every two-line description.
        body: `${t(`ascent.method.${option.method}.d` as Parameters<typeof t>[0])}${actorLine ? `\n${actorLine}` : ''}`,
        // How productive the province is on the day it changes hands. This is the axis the
        // six methods actually differ on, and until loyalty was given teeth it was invisible
        // *and* inert — so the sheet read as six prices for one outcome.
        badge: blocked ? undefined : t('ascent.conquer.settleBadge', {
          pct: Math.round((0.6 + 0.4 * (option.loyalty / 100)) * 100),
        }),
        note: option.blockedReason ?? methodPriceTag(option),
        noteColor: blocked ? '#6f6250' : undefined,
        accent: blocked ? INK_UI.softBrush : option.chance >= 60 ? INK_UI.jade : INK_UI.gold,
        disabled: blocked,
        parent: body,
        // A method with an actor opens the picker over the sheet: the player names the envoy or
        // the host, confirms, and the choice carries the actor's id. Bribe and settle commit nobody.
        onTap: () => (actorLine ? showMethodActorPicker(self, target, option, notice) : self.choose(option.method)),
      },
    );
    cards.push(card);
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
  });
  staggerIn(self, cards);
  finish(used);

  promptFoot(self, content, {
    back: {
      label: t('ascent.conquer.back'),
      onTap: () => {
        // Genuinely back to the list, rebuilt against the world as it stands. The button was
        // labelled "choose another province" and did not do that: it dismissed the whole sheet.
        self.state.pendingAscentPrompt = {
          kind: 'conquer-target',
          targets: buildAllConquestTargets(self.state),
        };
        self.refresh();
      },
    },
    close: { label: t('ascent.lane.close'), onTap: () => self.choose('back') },
  });
}

/** Who carries a method out: an envoy for diplomacy, a host for the military methods. */
export function showMethodActorPicker(self: ConquestUIScene, target: ConquestTarget, option: ConquestMethodOption, notice?: string): void {
  const state = self.state;
  const back = () => self.replaceLanePage(() => showConquerMethod(self, target, notice));
  const role = t(`ascent.pick.role.${option.method === 'diplomacy' ? 'envoy' : option.method}` as Parameters<typeof t>[0], { land: target.landName });
  if (option.method === 'diplomacy') {
    self.showHeroPicker({
      title: t('ascent.pick.title.envoy', { land: target.landName }),
      rows: buildHeroPickerRows(state, { kind: 'envoy', landId: target.landId }),
      confirm: (row) => ({
        title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role }),
        lines: [row.effectLine, methodPriceTag(option)],
      }),
      onPick: (heroId) => self.choose(`${option.method}:${heroId}`),
      onBack: back,
    });
    return;
  }
  const kind = option.method === 'intimidation' ? 'intimidation' : option.method === 'occupy' ? 'occupy' : 'siege';
  self.showHostPicker({
    title: t('ascent.pick.title.host'),
    rows: buildHostPickerRows(state, { kind, landId: target.landId }),
    confirm: (row) => ({
      title: t('ascent.pick.confirmHost', { army: row.army.name, role }),
      lines: [
        row.chance !== undefined ? t('ascent.pick.hostOdds', { pct: row.chance }) : '',
        kind === 'intimidation' ? '' : t('ascent.pick.willAttack', { land: target.landName }),
      ],
    }),
    onPick: (armyId, force) => self.choose(`${option.method}:${armyId}${force ? ':force' : ''}`),
    onBack: back,
  });
}
