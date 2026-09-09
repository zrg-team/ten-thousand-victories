/**
 * Everything round the dials that is not a dial: the readout band above them, the four exit chips
 * along the foot — pause, break off, hand over, step away — and the call for help over our camp.
 *
 * Two clocks and no third. The readout is drawn into the `orders` layer, so it exists only while
 * `buildBattleOrders` is rebuilding — called from anywhere else, the next order erases it; the
 * exits ride that same signature, because the hand-over chip is two chips wearing one slot.
 * Relief gates itself on `ui.reliefKey`, and `showReinforcePicker` is a lane page rather than part
 * of this screen — opened from here and from the army screen's war section.
 */
import Phaser from 'phaser';
import { battleBeatsPerTick } from '../../../game/battleOptions';
import {
  reinforcementCandidates,
  reinforcementsEnRoute,
  sendReinforcement,
} from '../../../systems/ascent/reinforcement';
import { hostOrderLabel } from '../../../systems/ascent/armyOrders';
import { focusBattle, liveBattles } from '../../../systems/ascent/fronts';
import { INK_UI, scrollGestureConsumedTap } from '../../../ui/InkUI';
import { drawCardIcon, type CardIconId } from '../../../ui/CardIcons';
import { t } from '../../../i18n';
import type { AscentBattle } from '../../../state/types';
import { cssHex } from '../constants';
import { clearLayer } from '../layers';
import { showWarBoard } from '../screens/warBoard';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * Hand over and leave, along the foot of the screen.
 *
 * **They were in the header, and the header is the one place on this screen a thumb cannot
 * reach.** Everything else here is built around a one-handed grip — the formation strip owns the
 * bottom band precisely because it is worked three to five times a fight — and the two controls
 * that end a player's involvement in it sat about seven hundred points up a phone held in one
 * hand. The justification was that they are semi-final and should be hard to hit by accident;
 * what it actually bought was two controls that had to be hunted for with the other hand.
 *
 * So they take the foot, where the lane's Close button stood on its own. That is not a lost exit:
 * closing the screen and leaving the field already did the same thing to the fight — the general
 * takes the remainder either way — and one button that says so beats two that differ in a way
 * nothing on the screen explained.
 *
 * Accident is guarded by size and by wording instead of by distance. Neither is the loud
 * cinnabar the dock uses, both say plainly what happens next, and the hand-over is reversible
 * from the same slot: the chip flips to "take the field back" the moment it is pressed.
 */
/**
 * The way to call for help, on the screen where help is needed.
 *
 * The engine has enrolled relief since the membership rewrite — a host that reaches the
 * province is in the line the next beat — but nothing on this screen, or the army screen, ever
 * offered to send one. The control sits in our corner of the field, over the ground our camp
 * stands on, and says one of two things: that a host can be sent, or who is on the road and
 * when they arrive. It stands for as long as the fight does, even when the answer is nobody.
 */
export function buildBattleRelief(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui?.relief?.active) return;
  const coming = reinforcementsEnRoute(self.state, battle);
  const candidates = battle.over ? [] : reinforcementCandidates(self.state, battle);
  const sendable = candidates.filter((row) => !row.blockedReason && !row.enRoute).length;
  // The other fields ride the same key, because they share the layer and a stale key would leave
  // yesterday's front chip sitting over today's battlefield.
  const elsewhere = liveBattles(self.state).filter((other) => other.landId !== battle.landId);
  const key = `${coming.hosts}:${coming.men}:${coming.etaTicks}:${sendable}:${battle.over ? 1 : 0}`
    + `:${elsewhere.map((other) => `${other.landId}@${Math.round(other.ourNow)}/${Math.round(other.theirNow)}`).join('|')}`;
  if (key === ui.reliefKey) return;
  ui.reliefKey = key;
  clearLayer(self, ui.relief);
  if (battle.over) return;
  buildOtherFronts(self, battle, elsewhere);

  const { content } = ui;
  const w = 118;
  const h = 26;
  const x = content.x + 6;
  const y = content.y + ui.fieldHeight - h - 6;
  const onRoad = coming.hosts > 0;
  /**
   * **Standing while the fight is, whatever the answer turns out to be.**
   *
   * It used to hide itself when no host was free — and the moment no host is free is the moment
   * the realm is fighting on three fronts, which is the only moment anybody looks for it.
   * Reported verbatim: *in battle screen, fast reinforcement feature does not show any more.* The
   * page behind it now names every host and why it cannot come (`reinforcementCandidates`), and
   * carries the call-up that needs no host at all, so there is always something on it.
   */
  const label = onRoad
    ? t('ascent.reinforce.coming', { men: coming.men, n: coming.etaTicks === Number.POSITIVE_INFINITY ? 0 : coming.etaTicks })
    : sendable > 0
      ? t('ascent.reinforce.button', { n: sendable })
      : t('ascent.reinforce.buttonNone');
  const plate = self.ui.panel({ x, y, width: w, height: h }, {
    border: onRoad ? INK_UI.jade : sendable > 0 ? INK_UI.gold : INK_UI.softBrush,
    fillAlpha: 0.94, borderWidth: 1.5, radius: 5,
  });
  ui.relief.add(plate);
  ui.relief.add(self.ui.label(x + w / 2, y + h / 2, label, 'label', {
    fontSize: '9.5px', align: 'center', wordWrap: { width: w - 8 },
  }).setOrigin(0.5));
  const hit = self.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => { plate.setScale(0.97); plate.setPosition(x + w * 0.015, y + h * 0.015); });
  const unpress = (): void => { plate.setScale(1); plate.setPosition(x, y); };
  hit.on('pointerout', unpress);
  hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    unpress();
    if (scrollGestureConsumedTap(pointer)) return;
    // Back to the field it was opened from, not to the board: the picker is a page *of* this
    // fight. Rebuilt in place — going out through `closeLane` lets `refresh` re-enter the lane
    // first and the page can end up somewhere neither of them chose.
    showReinforcePicker(self, () => self.replaceLanePage(() => self.showBattle()));
  });
  ui.relief.add(hit);
}

/**
 * The war's other fields, on the near corner of this one.
 *
 * Mirrors the relief plate across the field — same band, same size, opposite corner — because it
 * answers the mirrored question: relief is *who can come here*, and this is *where else is being
 * fought*. It is on the field rather than in the dock because the dock is at its height budget on
 * a 620-high screen (`BATTLE_DOCK_HEIGHT` was already trimmed 122 → 112 for printing through the
 * lane's Close button) and because the field is where the eye already is.
 *
 * One other field names it and its odds, and the tap walks you onto it. Two or more and the chip
 * counts them and opens the board instead, which is the screen built to rank them.
 */
function buildOtherFronts(self: ConquestUIScene, battle: AscentBattle, elsewhere: AscentBattle[]): void {
  const ui = self.battleUi;
  if (!ui?.relief?.active || elsewhere.length === 0) return;
  const { content } = ui;
  const w = 118;
  const h = 26;
  const x = content.x + content.width - w - 6;
  const y = content.y + ui.fieldHeight - h - 6;

  const only = elsewhere.length === 1 ? elsewhere[0] : undefined;
  // Losing somewhere else is the whole reason to look up from the field you are on, so the chip
  // is inked by the worst news it carries rather than by how many fields there are.
  const losing = elsewhere.some((other) => other.theirNow > other.ourNow);
  const label = only
    ? t('ascent.war.otherFront', {
      land: only.landName, ours: Math.round(only.ourNow), theirs: Math.round(only.theirNow),
    })
    : t('ascent.war.otherFronts', { n: elsewhere.length });

  const plate = self.ui.panel({ x, y, width: w, height: h }, {
    border: losing ? INK_UI.cinnabar : INK_UI.gold, fillAlpha: 0.94, borderWidth: 1.5, radius: 5,
  });
  ui.relief.add(plate);
  ui.relief.add(self.ui.label(x + w / 2, y + h / 2, label, 'label', {
    fontSize: '9.5px', align: 'center', wordWrap: { width: w - 8 },
  }).setOrigin(0.5));
  const hit = self.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => { plate.setScale(0.97); plate.setPosition(x + w * 0.015, y + h * 0.015); });
  const unpress = (): void => { plate.setScale(1); plate.setPosition(x, y); };
  hit.on('pointerout', unpress);
  hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    unpress();
    if (scrollGestureConsumedTap(pointer)) return;
    // Straight across to the other field when there is only one — a list of one thing standing
    // between the player and the fight they can already see named on the chip. Two or more and
    // the chip opens the board, which is what its label promises and the only place it is
    // reached from now that the bar button always opens the fight itself.
    if (only) {
      focusBattle(self.state, only.landId);
      self.replaceLanePage(() => self.showBattle());
      return;
    }
    self.replaceLanePage(() => showWarBoard(self));
  });
  ui.relief.add(hit);
  void battle;
}

/**
 * Who could come, how soon, and whether that is soon enough.
 *
 * One page for every entry point — the fight, the army screen's war section, a host's own
 * detail — so the answer reads the same wherever the question was asked.
 *
 * ## What was wrong with it
 *
 * Reported: *fight screen reinforcement look really bad*. Three faults, and the first was not a
 * matter of taste at all.
 *
 * **It had no paper.** `showBattle` hides the map, because the field is a full sheet of parchment
 * with nothing showing through it — and this page is opened *from* the fight through
 * `replaceLanePage`, so it inherited a hidden map and drew an ordinary lane list over the lane's
 * 0.93 dim with nothing behind it. What showed through the seven per cent was the six scenes this
 * game keeps resident: photographed, the lower half of this page was the **main menu**, "Rồng
 * Thăng Long" and the version line and all. `showWarBoard` carries the same restore for the same
 * reason; this one was simply missed.
 *
 * **Every row looked the same.** A host that can march now, a host already marching, and a host
 * that cannot come at all were three cards of the same shape, distinguished by a word buried in
 * the middle of the title and a grey line under it. The one question the page exists to answer —
 * *who can I send* — had to be worked out by reading all of them.
 *
 * **The number was prose.** How many men a host brings is the figure the whole decision turns on,
 * and it was set inline in a run of text between two middots, where no two rows can be compared.
 *
 * So: the hosts are grouped under headings, the men are a badge in the corner where a reader's eye
 * goes for the verdict, and the arrival is the badge's own note — jade when it is in time,
 * cinnabar when it is not.
 */
export function showReinforcePicker(self: ConquestUIScene, onBack: () => void): void {
  const state = self.state;
  const battle = state.ascent?.activeBattle;
  if (!battle || battle.over) { onBack(); return; }
  self.replaceLanePage(() => {
    // The paper. See the note above: without it this page's background is the title screen.
    self.setMapVisible(true);
    const { addRow, addHeading, addNote, finish } = self.laneList(
      t('ascent.reinforce.title', { land: battle.landName }),
      t('ascent.reinforce.subtitle', {
        ours: Math.round(battle.ourNow), theirs: Math.round(battle.theirNow),
        n: Math.max(1, Math.ceil((battle.totalRounds - battle.round) / battleBeatsPerTick())),
      }),
      { back: onBack },
    );

    const rows = reinforcementCandidates(state, battle);
    // What is already on its way, said once at the top rather than left to be counted off the
    // rows: it is the fact that decides whether anything more needs sending at all.
    const coming = reinforcementsEnRoute(state, battle);
    addNote(coming.hosts > 0
      ? t('ascent.reinforce.onWay', {
        n: coming.hosts, men: coming.men,
        eta: coming.etaTicks === Number.POSITIVE_INFINITY ? 0 : coming.etaTicks,
      })
      : t('ascent.reinforce.needed'), coming.hosts > 0 ? INK_UI.jade : INK_UI.softBrush);

    const ready = rows.filter((row) => !row.blockedReason && !row.enRoute);
    const marching = rows.filter((row) => !row.blockedReason && row.enRoute);
    const blocked = rows.filter((row) => Boolean(row.blockedReason));
    if (rows.length === 0) addNote(t('ascent.reinforce.nobody'));

    const draw = (row: typeof rows[number], sendable: boolean): void => {
      const at = state.lands.find((candidate) => candidate.id === row.army.landId);
      const general = state.heroes.find((hero) => hero.id === row.army.generalHeroId);
      const note = row.etaTicks === undefined ? undefined : row.etaTicks === 0
        ? t('ascent.reinforce.noteNow')
        : t(row.inTime ? 'ascent.reinforce.noteInTime' : 'ascent.reinforce.noteLate', { n: row.etaTicks });
      // Gold beats jade on a row that can march but through country that will cost it: the
      // warning is about the road, and the road is what the badge's note is promising.
      const tone = row.routeWarning ? INK_UI.gold : row.inTime ? INK_UI.jade : INK_UI.cinnabar;
      addRow(
        {
          // The host, and nothing else. Its strength is the badge and its errand is the line
          // under it; a title carrying all three is a title nobody scans.
          title: row.army.name,
          subtitle: [row.blockedReason, row.routeWarning, t('ascent.reinforce.row', {
            land: at?.name ?? '—', order: hostOrderLabel(state, row.army),
          })].filter(Boolean).join('\n'),
          border: sendable ? tone : INK_UI.softBrush,
          muted: !sendable,
          portrait: general,
          badge: {
            caption: t('ascent.reinforce.badgeMen'),
            value: String(row.men),
            note,
            tone: sendable ? tone : INK_UI.softBrush,
          },
        },
        sendable ? () => {
          sendReinforcement(state, battle, row.army.id);
          onBack();
        } : undefined,
      );
    };

    // Ordered by what the player can do about it: what will march, what already is, what will not.
    if (ready.length > 0) {
      addHeading(t('ascent.reinforce.groupReady'), t('ascent.reinforce.hint'));
      ready.forEach((row) => draw(row, true));
    }
    if (marching.length > 0) {
      addHeading(t('ascent.reinforce.groupComing'));
      marching.forEach((row) => draw(row, false));
    }
    if (blocked.length > 0) {
      addHeading(t('ascent.reinforce.groupBlocked'));
      blocked.forEach((row) => draw(row, false));
    }
    finish();
  });
}

export function buildBattleExits(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { exits } = ui;
  clearLayer(self, exits);

  const handedOver = Boolean(battle.delegated);
  const halted = self.battleHalted;
  // The exits' own clock: they used to ride the dock's signature and were rebuilt with it —
  // four panels and eight wrapped labels torn down on most beats to change nothing.
  ui.exitsKey = `${handedOver ? 1 : 0}:${halted ? 1 : 0}`;
  // A tab bar, not a rack of chips (user verdict, 2026-08-25): four bordered panels each carrying
  // a wrapped caption read as one more dock of controls fighting the real one above. The exits
  // are secondary — icon over word, a hairline between neighbours, and the STATE carried by
  // colour alone: gold for the dial currently held (paused, or the general commanding), cinnabar
  // for the one exit that spends blood to take (breaking off).
  const chips: Array<{ label: string; icon: CardIconId; tint?: number; order: string }> = [
    {
      // The world's clock, on the screen that is the world. Lit gold while the fight is standing
      // still so a paused fight never again looks like a running one.
      label: halted ? t('ascent.battle.resume') : t('ascent.battle.pause'),
      icon: halted ? 'play' : 'pause',
      tint: halted ? INK_UI.gold : undefined,
      order: 'pause',
    },
    {
      // Breaking off: the cold end of what used to be the stance dial. It is an exit — the line
      // walks backwards for three beats and is clear away — so it stands with the exits, and
      // the stance row is left with the three postures that actually trade.
      label: t('ascent.stance.withdraw'),
      icon: 'retreat',
      tint: INK_UI.cinnabar,
      order: 'stance:withdraw',
    },
    {
      label: handedOver ? t('ascent.battle.takeField') : t('ascent.battle.autoShort'),
      icon: handedOver ? 'crown' : 'banner',
      tint: handedOver ? INK_UI.gold : undefined,
      order: handedOver ? 'take-field' : 'auto',
    },
    {
      // Not a retreat and not a concession: the engagement keeps running on the world clock with
      // the general on both dials, and the aftermath card finds the player wherever they are.
      label: t('ascent.battle.leaveShort'),
      icon: 'globe',
      order: 'leave',
    },
  ];

  const { x: baseX, y, height: h } = ui.exitBounds;
  const gap = 6;
  const w = (ui.exitBounds.width - gap * (chips.length - 1)) / chips.length;
  chips.forEach((chip, index) => {
    const x = baseX + index * (w + gap);

    // The hairline between neighbours — inset from both edges so it reads as a separator, never
    // as a wall of its own.
    if (index > 0) {
      const sep = self.add.graphics();
      sep.lineStyle(1, INK_UI.softBrush, 0.55);
      sep.lineBetween(x - gap / 2, y + 5, x - gap / 2, y + h - 5);
      exits.add(sep);
    }

    // Grouped so the press dip moves icon and word as one thing.
    const group = self.add.container(x + w / 2, y + h / 2);
    const icon = drawCardIcon(self, chip.icon, chip.tint ?? INK_UI.brush);
    icon.setScale(0.55);
    icon.setPosition(0, -h / 2 + 12);
    const label = self.ui.label(0, -h / 2 + 22, chip.label, 'label', {
      fontSize: '10px', align: 'center',
      ...(chip.tint !== undefined ? { color: cssHex(chip.tint) } : {}),
    }).setOrigin(0.5, 0);
    // One line, shrunk to fit — never wrapped. "Giao cho tướng" broke into two stacked lines
    // under its icon and the row read as two different heights of control (user report). The
    // captions themselves were shortened to fit at full size; the shrink is insurance, and the
    // scale floor below it means even a hostile translation cannot push past the chip.
    for (let size = 10; size >= 8 && label.width > w - 8; size -= 0.5) label.setFontSize(size);
    if (label.width > w - 8) label.setScale((w - 8) / label.width);
    group.add([icon, label]);
    exits.add(group);

    const hit = self.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    // The same dip every other control on this screen gives — on the group, since there is no
    // plate left to dip.
    hit.on('pointerdown', () => group.setScale(0.92));
    const unpress = (): void => { group.setScale(1); };
    hit.on('pointerout', unpress);
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      unpress();
      if (scrollGestureConsumedTap(pointer)) return;
      if (chip.order === 'pause') {
        self.toggleBattlePause();
        return;
      }
      self.releaseBattleHold();
      self.events.emit('ui:battle-order', chip.order);
      // Stepping away closes the screen; handing over keeps it open, which is the whole
      // difference between the two chips.
      if (chip.order === 'leave') self.closeLane();
    });
    exits.add(hit);
  });
}
