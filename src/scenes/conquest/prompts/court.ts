/**
 * The palace paperwork: who serves the throne, and what the throne writes down. A champion is
 * offered and then given a post; around them sit the four instruments, the laws (with the tax
 * dial on the same card), the era's doctrine and the court's motions — none of it touching the map.
 *
 * Law, doctrine and parliament pin a `PROMPT_FOOTER_HEIGHT` footer carrying the refusal — hold,
 * keep, decline; appointment and decree pass 0 and put the way out on a card of their own.
 * `showHeroChoice` is the odd one out: drawn through `heroDeckPrompt`, not `promptScrollBody`,
 * and if every id it was handed has already left `heroDeck` it paints the title over an empty
 * sheet and returns — no card, no button.
 */
import Phaser from 'phaser';
import { storyPrintHeader } from '../../../ui/storyPrint';
import { GAME_HEIGHT } from '../../../game/constants';
import { isHeroUnlocked } from '../../../state/codex';
import { doctrineBlurb, doctrineName } from '../../../systems/ascent/RealmDoctrineSystem';
import { projectDescription, projectEffectSummary, projectTitle } from '../../../systems/empire/EdictSystem';
import { getProject } from '../../../data/edicts';
import { lawCardView } from '../../../systems/ascent/CourtLaneSystem';
import { heroPayroll } from '../../../systems/ResourceSystem';
import { heroTitleLine } from '../../../ui/heroPickerRows';
import { eraLabel } from '../../../systems/empire/MandateSystem';
import { INK_UI } from '../../../ui/InkUI';
import { arrivalPreview } from '../../../data/heroArrivals';
import { resourceChips } from '../../../ui/costChips';
import { staggerIn } from '../../../ui/animations';
import {
  formatResourceList,
  heroName,
  heroTypeLabel,
  politicsChoiceDescription,
  politicsChoiceLabel,
  politicsDescription,
  politicsTitle,
  t,
} from '../../../i18n';
import type { AscentPrompt, Hero } from '../../../state/types';
import { PROMPT_FOOTER_HEIGHT, heroStatLine } from '../constants';
import { promptFoot } from './frame';
import type { ConquestUIScene } from '../../ConquestUIScene';

/**
 * The champion card. One screen for both sources — the court's Favor draft and the wave
 * gacha — because the player should only ever learn one "a hero arrived" interaction.
 */
export function showHeroChoice(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'hero-choice' }>): void {
  // What the roster already costs, when it costs a lot: a champion is another wage, and the
  // card that offers one is where that is worth knowing.
  const gross = Math.max(1, self.state.ascentLedger?.gold.gross ?? 0);
  const payroll = heroPayroll(self.state);
  const payrollShare = Math.round((payroll / gross) * 100);
  const subtitle = prompt.pityUsed
    ? t('ascent.summon.pity')
    : prompt.source === 'court' ? t('ascent.summon.courtSubtitle') : t('ascent.summon.subtitle');
  const title = prompt.source === 'court' ? t('ascent.summon.courtTitle') : t('ascent.summon.title');

  const heroes = prompt.heroIds
    .map((heroId) => self.state.heroDeck.find((candidate) => candidate.id === heroId))
    .filter((hero): hero is Hero => Boolean(hero));
  if (heroes.length === 0) {
    self.promptFrame(title, subtitle);
    return;
  }

  self.heroDeckPrompt({
    title,
    subtitle: payrollShare > 55
      ? `${subtitle}\n${t('ascent.summon.payrollWarn', { pct: payrollShare })}`
      : subtitle,
    heroes,
    // First-time pulls are the collection payoff — say so on the card.
    badgeFor: (hero) => (isHeroUnlocked(hero.id) ? undefined : t('ascent.summon.newCodex')),
    // A champion nobody can afford is the trap this screen sets, so a card with no arrival to
    // announce prints its wage instead of leaving the foot of the paper blank.
    noteFor: (hero) => arrivalPreview(hero) ?? t('ascent.summon.upkeep', { gold: hero.upkeepGold }),
    confirmLabel: t('ascent.summon.recruit'),
    // The draw can be turned down whole — the one screen in the deck family that needs a way
    // out, since a champion nobody wants is still a wage every season.
    ignoreLabel: t('ascent.summon.pass'),
    onSelect: (hero) => self.choose(hero.id),
    onIgnore: () => self.choose('pass'),
  });
}

/**
 * Where a new champion serves.
 *
 * Every option prints the concrete bonus this hero's own stats produce there — `+23% army
 * power`, `+18% output` — so the choice is read off numbers rather than guessed from a job
 * title. That is the difference between a court and a list of nouns.
 */
export function showAppointment(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'court-appointment' }>): void {
  const hero = self.state.heroes.find((candidate) => candidate.id === prompt.heroId);
  const { body, bodyWidth, finish } = self.promptScrollBody(
    t('ascent.appoint.title', { hero: hero ? heroName(hero) : '' }),
    hero ? `${heroTypeLabel(hero.type)}  ·  ${heroStatLine(hero)}` : '',
    0,
  );

  const rowHeight = 74;
  const cards: Phaser.GameObjects.Container[] = [];
  let used = 0;
  prompt.options.forEach((option) => {
    const reserve = option.id === 'reserve';
    const dismiss = option.role === 'dismiss';
    const card = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: rowHeight },
      {
        title: option.title,
        body: option.effect,
        note: option.detail,
        noteColor: option.detail && !reserve && !dismiss ? '#8a5f1c' : undefined,
        badge: t(`ascent.appoint.role.${option.role}` as Parameters<typeof t>[0]),
        accent: dismiss ? INK_UI.cinnabar : reserve ? INK_UI.softBrush : option.role === 'court' ? INK_UI.gold : INK_UI.jade,
        parent: body,
        // Letting a champion go is the one destructive choice on the card, so it asks once
        // more; every posting is reversible from the same card and goes straight through.
        onTap: dismiss && hero
          ? () => self.showConfirmPage({
              title: t('ascent.appoint.dismissConfirm', { hero: heroName(hero) }),
              subtitle: heroTitleLine(hero),
              portrait: hero,
              lines: [option.effect, option.detail ?? ''],
              confirmLabel: t('ascent.appoint.dismiss'),
              danger: true,
              onConfirm: () => self.choose('dismiss'),
              onBack: () => self.replaceLanePage(() => showAppointment(self, prompt)),
            })
          : () => self.choose(option.id),
      },
    );
    cards.push(card);
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
  });
  staggerIn(self, cards);
  finish(used);
}

/**
 * The four instruments the world raises: sắc, dụ, hịch and lệ.
 *
 * One card for all four, because they are one prompt kind and therefore one slot in the
 * director's budget — see the note on `decree-offer`. What differs between them is the framing:
 * a hịch is a war proclamation and gets the cinnabar accent, a lệ is a village asking and gets
 * two answers rather than one, and every instrument may be declined.
 */
export function showDecreeOffer(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'decree-offer' }>): void {
  const instrument = prompt.instrument;
  const { body, bodyWidth, finish } = self.promptScrollBody(
    t(`decree.instrument.${instrument}.title` as Parameters<typeof t>[0]),
    prompt.targetName
      ? t(`decree.instrument.${instrument}.at` as Parameters<typeof t>[0], { target: prompt.targetName })
      : t(`decree.instrument.${instrument}.body` as Parameters<typeof t>[0]),
    0,
  );

  const accent = instrument === 'hich' ? INK_UI.cinnabar
    : instrument === 'du' ? INK_UI.gold
      : instrument === 'sac' ? INK_UI.jade : INK_UI.softBrush;

  const cards: Phaser.GameObjects.Container[] = [];
  let used = storyPrintHeader(self, body, instrument === 'hich' ? 'muster' : instrument === 'le' ? 'harvest' : 'petition', bodyWidth);
  const addCard = (opts: { title: string; bodyText: string; note?: string; badge?: string; onTap: () => void }) => {
    const card = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: 76 },
      {
        title: opts.title,
        body: opts.bodyText,
        note: opts.note,
        badge: opts.badge,
        accent,
        parent: body,
        onTap: opts.onTap,
      },
    );
    cards.push(card);
    used += ((card.getData('cardHeight') as number) ?? 76) + 9;
  };

  for (const projectId of prompt.projectIds) {
    const project = getProject(projectId);
    if (!project) continue;
    const title = projectTitle(project);
    const description = projectDescription(project);

    if (instrument === 'le') {
      // A custom has two answers, not one: keep it to the village that asked (strong, free,
      // local) or write it into the realm's law (weaker, everywhere, and it costs weight).
      addCard({
        title: t('decree.le.grantTitle', { title }),
        bodyText: description,
        note: t('decree.le.grantNote', { land: prompt.targetName ?? '' }),
        badge: t('decree.le.badgeLocal'),
        onTap: () => self.choose(`le:${projectId}:local`),
      });
      addCard({
        title: t('decree.le.ratifyTitle', { title }),
        bodyText: projectEffectSummary(project) || description,
        note: t('decree.weight.cost', { n: `${project.weight}` }),
        badge: t('decree.le.badgeRealm'),
        onTap: () => self.choose(`le:${projectId}:realm`),
      });
      continue;
    }

    addCard({
      title,
      bodyText: description,
      note: (project.edictCost ?? 0) > 0
        ? t('ascent.law.pointCost', { n: project.edictCost ?? 0 })
        : t(`decree.instrument.${instrument}.free` as Parameters<typeof t>[0]),
      badge: t(`decree.instrument.${instrument}.badge` as Parameters<typeof t>[0]),
      onTap: () => self.choose(`decree:${projectId}`),
    });
  }

  // Always declinable. A card the player cannot say no to is not a decision, and refusing a
  // village its custom is the choice this whole instrument exists to make available.
  addCard({
    title: t(`decree.instrument.${instrument}.decline` as Parameters<typeof t>[0]),
    bodyText: t(`decree.instrument.${instrument}.declineBody` as Parameters<typeof t>[0]),
    onTap: () => self.choose('decline'),
  });

  staggerIn(self, cards);
  finish(used);
}

/**
 * A permanent law. Enacting one from an exclusive group locks its sibling out for the whole
 * run, so the card names what it kills — that fork is the main reason two runs diverge.
 */
export function showLawChoice(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'law-choice' }>): void {
  // The longest prompt in the mode: a variable list of laws *plus* the tax options *plus* a
  // footer. It overflowed on every viewport height, not just the short one.
  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    t('ascent.law.title'),
    t('ascent.law.subtitle', {
      points: prompt.points,
      era: self.state.mandate ? eraLabel(self.state.mandate.era) : '—',
    }),
    PROMPT_FOOTER_HEIGHT,
  );

  const rowHeight = 80;
  const cards: Phaser.GameObjects.Container[] = [];
  let cursor = storyPrintHeader(self, body, 'petition', bodyWidth);

  prompt.projectIds.forEach((projectId) => {
    const view = lawCardView(self.state, projectId);
    if (!view) return;
    const card = self.optionCard(
      { x: 0, y: cursor, width: bodyWidth, height: rowHeight },
      {
        title: view.title,
        body: view.effect,
        note: view.locks,
        noteColor: '#8a5f1c',
        badge: view.cost,
        accent: INK_UI.gold,
        parent: body,
        onTap: () => self.choose(`edict:${projectId}`),
      },
    );
    cards.push(card);
    cursor += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
  });

  // The tax dial rides on the same card: it is the other permanent lever on the realm, and
  // giving it its own prompt would be one more modal for one more binary choice.
  prompt.taxOptions.forEach((policy) => {
    const card = self.optionCard(
      { x: 0, y: cursor, width: bodyWidth, height: 58 },
      {
        title: t('ascent.law.taxTitle', { policy: t(`ascent.tax.${policy}` as Parameters<typeof t>[0]) }),
        body: t(`ascent.tax.${policy}.d` as Parameters<typeof t>[0]),
        accent: INK_UI.softBrush,
        parent: body,
        onTap: () => self.choose(`tax:${policy}`),
      },
    );
    cards.push(card);
    cursor += ((card.getData('cardHeight') as number) ?? 58) + 9;
  });
  staggerIn(self, cards);
  finish(cursor);

  promptFoot(self, content, {
    back: { onTap: () => { self.choose('hold'); self.openLane('court'); } },
    close: { label: t('ascent.law.hold'), onTap: () => self.choose('hold') },
  });
}

/**
 * What kind of realm this is going to be. Four times a run, at each era change.
 *
 * Deliberately built from the same `optionCard` rows as the law card rather than given a screen
 * of its own: this is the most consequential decision in the mode, and it must still read as one
 * more card in a stack the player already knows how to answer.
 */
export function showDoctrine(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'doctrine' }>): void {
  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    t('ascent.doctrine.title'),
    t('ascent.doctrine.subtitle', { era: eraLabel(prompt.era) }),
    PROMPT_FOOTER_HEIGHT,
  );

  const standing = self.state.ascent?.doctrine;
  const cards: Phaser.GameObjects.Container[] = [];
  let cursor = 0;

  prompt.options.forEach((doctrine) => {
    const card = self.optionCard(
      { x: 0, y: cursor, width: bodyWidth, height: 74 },
      {
        title: doctrineName(doctrine),
        body: doctrineBlurb(doctrine),
        // The realm's current course is named on its own row rather than hidden, so switching
        // is visibly a change of direction and not just another pick.
        note: standing === doctrine ? t('ascent.doctrine.standing') : undefined,
        noteColor: '#1c6b58',
        accent: INK_UI.gold,
        parent: body,
        onTap: () => self.choose(doctrine),
      },
    );
    cards.push(card);
    cursor += ((card.getData('cardHeight') as number) ?? 74) + 9;
  });

  staggerIn(self, cards);
  finish(cursor);

  promptFoot(self, content, {
    back: { onTap: () => { self.choose('hold'); self.openLane('court'); } },
    close: {
      label: standing ? t('ascent.doctrine.keep') : t('ascent.doctrine.none'),
      onTap: () => self.choose('hold'),
    },
  });
}

/** The court speaks. Two choices, both real, drawn from the shared politics deck. */
export function showParliament(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'parliament' }>): void {
  const card = self.state.politicsDeck.find((candidate) => candidate.id === prompt.cardId);
  if (!card) {
    self.choose('');
    return;
  }

  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    politicsTitle(card),
    politicsDescription(card),
    PROMPT_FOOTER_HEIGHT,
  );

  const rowHeight = 78;
  const cards: Phaser.GameObjects.Container[] = [];
  let used = 0;
  card.choices.forEach((choice) => {
    const cost = Object.entries(choice.effects.resourceDelta ?? {})
      .filter(([, value]) => (value ?? 0) < 0)
      .map(([key, value]) => [key, Math.abs(value ?? 0)] as const);
    const costBag = Object.fromEntries(cost);
    const affordable = cost.every(([key, value]) => (self.state.resources[key as keyof typeof self.state.resources] ?? 0) >= value);

    const option = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: rowHeight },
      {
        title: politicsChoiceLabel(choice),
        body: politicsChoiceDescription(choice),
        costs: resourceChips(costBag, affordable ? undefined : INK_UI.cinnabar),
        note: affordable ? undefined : t('ascent.response.cantAfford'),
        noteColor: affordable ? undefined : '#a4402c',
        accent: affordable ? INK_UI.jade : INK_UI.softBrush,
        disabled: !affordable,
        parent: body,
        onTap: () => self.choose(choice.id),
      },
    );
    cards.push(option);
    used += ((option.getData('cardHeight') as number) ?? rowHeight) + 10;
  });
  staggerIn(self, cards);
  finish(used);

  promptFoot(self, content, {
    back: { onTap: () => { self.choose('decline'); self.openLane('court'); } },
    close: { label: t('ascent.parliament.decline'), onTap: () => self.choose('decline') },
  });
}
