/**
 * The muster form — the one page in the Army lane that edits a draft rather than the world.
 *
 * Commander, size, baggage, doctrine and standing order, all written into `self.musterDraft`;
 * nothing reaches the game until the footer fires `ui:ascent-raise-host` with the plan whole.
 * Every control ends in `rebuild` and redraws the entire page, because the figures interlock —
 * both sliders quote cost and muster time from `getMusterEstimate`, and moving the size re-fills
 * the baggage under it.
 *
 * The draft outlives the page: only mustering clears it here, and `openLane('army')` clears it on
 * any entry that is not a handover from the muster card.
 */
import Phaser from 'phaser';
import { buildAllConquestTargets } from '../../../systems/ascent/ConquestSystem';
import { getCompositionShares, getMusterEstimate } from '../../../systems/WarSystem';
import {
  baggageSeasons,
  defaultMusterPlan,
  fullBaggage,
  musterBlockedReason,
  musterLimits,
} from '../../../systems/ascent/MusterSystem';
import {
  buildHeroPickerRows,
  buildHostPickerRows,
  heroPostingLabel,
  heroTitleLine,
} from '../../../ui/heroPickerRows';
import { RECRUIT_HUMAN_RESERVE } from '../../../game/ascentConfig';
import { INK_UI } from '../../../ui/InkUI';
import { heroName, t } from '../../../i18n';
import { drawCostChips, resourceChips, seasonsChip } from '../../../ui/costChips';
import type { ArmyComposition, ArmyOrders } from '../../../state/types';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * Raising a host, on purpose.
 *
 * Commander, size, baggage, doctrine and standing order — every figure `raiseHostNow` used to
 * decide alone — with the cost and the muster time quoted from the same arithmetic the muster
 * will run. The Muster button carries the plan whole; the autopilot's own one-tap path still
 * exists for the autopilot.
 */
/** Panel height for the size dial: a line of words, a line of chips, and the rail under both. */
const SOLDIER_SLIDER_HEIGHT = 80;

export function showRaiseHostForm(self: ConquestUIScene): void {
  const state = self.state;
  const draft = (self.musterDraft ??= defaultMusterPlan(state));
  const limits = musterLimits(state);
  const estimate = getMusterEstimate(state, draft.soldiers);
  const blocked = musterBlockedReason(state, draft);
  const commander = state.heroes.find((candidate) => candidate.id === draft.heroId);
  const rebuild = () => self.replaceLanePage(() => showRaiseHostForm(self));

  self.replaceLanePage(() => {
    const { addRow, addHeading, addWidget, finish } = self.laneList(
      t('ascent.raise.title'),
      t('ascent.raise.body', { land: estimate.land?.name ?? '—', ticks: estimate.ticks }),
      {
        back: () => self.replaceLanePage(() => self.showArmyScreen()),
        footer: {
          label: t('ascent.raise.muster'),
          disabled: Boolean(blocked),
          onTap: () => {
            const plan = { ...draft };
            self.musterDraft = undefined;
            self.closeLane();
            self.events.emit('ui:ascent-raise-host', plan);
          },
        },
      },
    );

    // ── Commander ──
    addHeading(t('ascent.raise.commander'));
    addRow(
      {
        title: commander ? heroTitleLine(commander) : t('ascent.orders.commanderNone'),
        subtitle: commander
          ? `${heroPostingLabel(state, commander)}\n${t('ascent.army.mulGeneral', { pct: Math.round((commander.stats.martial / 100) * 25) })}`
          : t('ascent.raise.commanderBody'),
        border: commander ? INK_UI.gold : INK_UI.cinnabar,
        portrait: commander,
        vacantFace: !commander,
      },
      () => self.showHeroPicker({
        title: t('ascent.pick.title.newHost'),
        rows: buildHeroPickerRows(state, { kind: 'commander' }),
        confirm: (row) => ({
          title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role: t('ascent.pick.role.newHost') }),
          lines: [row.effectLine],
        }),
        onPick: (heroId) => { draft.heroId = heroId; rebuild(); },
        onBack: rebuild,
      }),
    );

    // ── Soldiers ──
    addHeading(t('ascent.raise.soldiers'), t('ascent.raise.reserve', { n: RECRUIT_HUMAN_RESERVE }));
    // **The one line on this page that could not be read.**
    //
    // It carried the headcount, the muster time, the gold *and* the supplies as one unwrapped
    // 11px sentence in a fixed panel — and a four-figure host ran it off the right edge, so the
    // last thing a player saw while dragging the slider was "vật tư trang" and then nothing. The
    // words that ran over are the two the glyphs already say, so they moved to a chip strip on
    // its own line and the slider dropped to make room.
    const soldierSlider = (holder: Phaser.GameObjects.Container, width: number) => {
      holder.add(self.ui.panel({ x: 0, y: 0, width, height: SOLDIER_SLIDER_HEIGHT }, { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52 }));
      const line = (n: number) => {
        const est = getMusterEstimate(state, n);
        return t('ascent.raise.soldiersHead', { n, ticks: est.ticks });
      };
      const label = self.ui.label(14, 8, line(draft.soldiers), 'caption', { fontSize: '11px' });
      holder.add(label);
      // Redrawn on every preview frame, because the price is what the drag is about.
      let priceStrip: Phaser.GameObjects.Container | undefined;
      const paintPrice = (n: number) => {
        const est = getMusterEstimate(state, n);
        priceStrip?.destroy();
        priceStrip = drawCostChips(self, resourceChips({ gold: est.goldCost, supplies: est.suppliesCost }),
          { x: 14, y: 24, width: width - 28 });
        holder.add(priceStrip);
      };
      paintPrice(draft.soldiers);
      const span = Math.max(1, limits.maxSoldiers - limits.minSoldiers);
      const toValue = (n: number) => (n - limits.minSoldiers) / span;
      const fromValue = (v: number) => Math.round((limits.minSoldiers + v * span) / 10) * 10;
      holder.add(self.ui.slider(
        { x: 10, y: 46, width: width - 20, height: 22 },
        {
          value: toValue(Math.min(limits.maxSoldiers, Math.max(limits.minSoldiers, draft.soldiers))),
          color: INK_UI.jade,
          onPreview: (v) => {
            label.setText(line(fromValue(v)));
            paintPrice(fromValue(v));
          },
          onChange: (v) => {
            draft.soldiers = Math.min(limits.maxSoldiers, Math.max(limits.minSoldiers, fromValue(v)));
            // Baggage follows the size unless the player has trimmed it below a full train.
            const want = fullBaggage(draft.soldiers);
            draft.rations = Math.min(want.rations, limits.foodSpare);
            draft.provisions = Math.min(want.provisions, limits.suppliesSpare);
            rebuild();
          },
        },
      ));
    };
    addWidget(SOLDIER_SLIDER_HEIGHT, soldierSlider);

    // ── Baggage ──
    addHeading(t('ascent.raise.baggage'));
    const want = fullBaggage(draft.soldiers);
    const seasons = baggageSeasons(draft.soldiers, draft.rations, draft.provisions);
    const baggageSlider = (
      holder: Phaser.GameObjects.Container,
      width: number,
      current: number,
      max: number,
      text: (n: number) => string,
      onSet: (n: number) => void,
    ) => {
      holder.add(self.ui.panel({ x: 0, y: 0, width, height: 64 }, { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52 }));
      const label = self.ui.label(14, 10, text(current), 'caption', { fontSize: '11px' });
      holder.add(label);
      const cap = Math.max(1, max);
      holder.add(self.ui.slider(
        { x: 10, y: 30, width: width - 20, height: 22 },
        {
          value: Math.min(1, current / cap),
          color: INK_UI.gold,
          onPreview: (v) => label.setText(text(Math.round(v * cap))),
          onChange: (v) => { onSet(Math.round(v * cap)); rebuild(); },
        },
      ));
    };
    addWidget(64, (holder, width) => baggageSlider(
      holder, width, draft.rations, Math.max(want.rations * 2, limits.foodHeld),
      (n) => t('ascent.raise.rationsLine', { n, seasons: baggageSeasons(draft.soldiers, n, draft.provisions).food }),
      (n) => { draft.rations = Math.min(n, limits.foodHeld); },
    ));
    addWidget(64, (holder, width) => baggageSlider(
      holder, width, draft.provisions, Math.max(want.provisions * 2, limits.suppliesHeld),
      (n) => t('ascent.raise.provisionsLine', { n, seasons: baggageSeasons(draft.soldiers, draft.rations, n).goods }),
      (n) => { draft.provisions = Math.min(n, limits.suppliesHeld); },
    ));
    if (seasons.food < 6) {
      addRow({ title: t('ascent.raise.baggageThin', { seasons: seasons.food }), subtitle: '', border: INK_UI.cinnabar, muted: true });
    }

    // ── Doctrine ──
    addHeading(t('ascent.raise.doctrine'));
    for (const comp of ['balanced', 'spears', 'archers', 'shock'] as ArmyComposition[]) {
      const shares = getCompositionShares(state, comp);
      const current = draft.composition === comp;
      addRow(
        {
          title: t(`comp.${comp}` as Parameters<typeof t>[0]),
          subtitle: `${t(`ascent.raise.comp.${comp}.d` as Parameters<typeof t>[0])}\n${t('ascent.raise.compShares', {
            s: Math.round(shares.spearmen * 100), a: Math.round(shares.archers * 100), h: Math.round(shares.heavyInfantry * 100),
          })}`,
          border: current ? INK_UI.gold : INK_UI.softBrush,
          muted: current,
        },
        current ? undefined : () => { draft.composition = comp; rebuild(); },
      );
    }

    // ── Standing order ──
    addHeading(t('ascent.raise.order'));
    const musterLand = estimate.land;
    const orderRows: Array<{ orders: ArmyOrders; title: string; subtitle: string; pick?: () => void }> = [
      {
        orders: { kind: 'defend', landId: musterLand?.id ?? '' },
        title: t('ascent.orders.defendHere'),
        subtitle: t('ascent.orders.defendHereBody', { land: musterLand?.name ?? '—' }),
      },
      {
        orders: { kind: 'attack', landId: '' },
        title: t('ascent.orders.attackPick'),
        subtitle: t('ascent.orders.attackPickBody'),
        pick: () => self.replaceLanePage(() => {
          const { addRow: addTarget, finish: finishTargets } = self.laneList(t('ascent.orders.attackPick'), t('ascent.orders.targetHint'), { back: rebuild });
          for (const target of buildAllConquestTargets(state)) {
            addTarget(
              { title: target.landName, subtitle: t('ascent.march.garrison', { value: target.garrison }), border: INK_UI.cinnabar },
              () => { draft.orders = { kind: 'attack', landId: target.landId }; rebuild(); },
            );
          }
          finishTargets();
        }),
      },
      {
        orders: { kind: 'follow', armyId: '' },
        title: t('ascent.orders.followPick'),
        subtitle: t('ascent.orders.followPickBody'),
        pick: () => self.showHostPicker({
          title: t('ascent.orders.followPick'),
          subtitle: t('ascent.orders.followHint'),
          rows: buildHostPickerRows(state, { kind: 'follow', forArmyId: '' }),
          confirm: (row) => ({ title: t('ascent.pick.confirmHost', { army: row.army.name, role: t('ascent.pick.role.follow', { army: t('ascent.raise.title') }) }), lines: [row.line] }),
          onPick: (armyId) => { draft.orders = { kind: 'follow', armyId }; rebuild(); },
          onBack: rebuild,
        }),
      },
      { orders: { kind: 'auto' }, title: t('ascent.orders.autoRow'), subtitle: t('ascent.orders.autoBody') },
    ];
    for (const row of orderRows) {
      const chosen = draft.orders.kind === row.orders.kind;
      const detail = chosen && draft.orders.kind === 'attack'
        ? t('ascent.orders.attack', { land: state.lands.find((land) => land.id === (draft.orders as { landId: string }).landId)?.name ?? '' })
        : chosen && draft.orders.kind === 'follow'
          ? t('ascent.orders.follow', { army: state.armies.find((army) => army.id === (draft.orders as { armyId: string }).armyId)?.name ?? '' })
          : row.subtitle;
      addRow(
        { title: row.title, subtitle: detail, border: chosen ? INK_UI.gold : INK_UI.softBrush },
        row.pick ?? (chosen ? undefined : () => { draft.orders = row.orders; rebuild(); }),
      );
    }

    // ── The bill ──
    // The title says what the row *is*; the figures are the chips under it. It used to be the
    // figures themselves — five numbers and four units run together in 15px bold, which is a
    // headline nobody reads as a headline and a price nobody can weigh against the treasury.
    addRow({
      title: blocked ?? t('ascent.raise.billTitle'),
      costs: [
        { icon: 'humans' as const, value: String(draft.soldiers), label: t('resource.humans'),
          tone: blocked ? INK_UI.cinnabar : undefined },
        // The baggage the plan carries plus the muster's own rations — the same sum
        // `queueRecruitment` will charge, so the quote and the bill cannot disagree.
        ...resourceChips({
          gold: estimate.goldCost,
          food: draft.rations + estimate.foodCost,
          supplies: estimate.suppliesCost + draft.provisions,
        }, blocked ? INK_UI.cinnabar : undefined),
        seasonsChip(estimate.ticks, blocked ? INK_UI.cinnabar : undefined),
      ],
      // Said in words as well as in numbers: the price per man rises with the size of the host, and
      // a player watching one figure move cannot see a curve in it.
      subtitle: blocked
        ? ''
        : `${t('ascent.raise.body', { land: estimate.land?.name ?? '—', ticks: estimate.ticks })}
${t('ascent.raise.costScale')}`,
      border: blocked ? INK_UI.cinnabar : INK_UI.jade,
      muted: Boolean(blocked),
    });
    finish();
  });
}
