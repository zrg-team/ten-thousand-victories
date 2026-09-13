/**
 * The clocks a host answers to when it is being worked on rather than commanded.
 *
 * Two of them, deliberately different in what they cost:
 *
 *   · A **refit** (`army.refit` — reinforce, re-equip, drill) takes the host off the board.
 *     StandingOrders and the autopilot skip it, no order surface will speak to it, and the gain
 *     the treasury already paid for lands only when the clock runs out. It still defends the
 *     ground it stands on — being attacked is not an action.
 *   · A **supply column** (`army.resupplyRun`) costs only patience: the baggage arrives spread
 *     over the column's ticks, and the host acts freely the whole time.
 *
 * Progressed once per ascent tick, before StandingOrders — so a refit that finishes this tick
 * hands back a host that can take its next order in the same breath.
 */
import { applyArmyUpgradeGain } from '../WarSystem';
import { heroResupplyDelivery } from '../heroes/HeroService';
import { pushToast } from '../empire/notifications';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { t } from '../../i18n';
import type { GameState } from '../../state/types';

export function tickArmyRefits(state: GameState): void {
  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;

    const refit = army.refit;
    if (refit) {
      refit.ticksLeft -= 1;
      if (refit.ticksLeft <= 0) {
        // Clear first: `applyArmyUpgradeGain` announces a finished host, not a busy one.
        army.refit = undefined;
        pushToast(state, applyArmyUpgradeGain(state, army, refit.kind, refit.gain), 'info');
      }
    }

    const run = army.resupplyRun;
    if (run) {
      // An even share per remaining tick, rounded up so the last tick never carries a remainder
      // the division lost.
      const food = Math.min(run.food, Math.ceil(run.food / Math.max(1, run.ticksLeft)));
      const supplies = Math.min(run.supplies, Math.ceil(run.supplies / Math.max(1, run.ticksLeft)));
      const completed = run.ticksLeft <= 1 || (food >= run.food && supplies >= run.supplies);
      const delivered = run.heroReceipt ? heroResupplyDelivery(state, army.id, run.heroReceipt, food, supplies, completed) : { food, supplies };
      army.rations += delivered.food;
      army.provisions += delivered.supplies;
      run.food -= food;
      run.supplies -= supplies;
      run.ticksLeft -= 1;
      if (run.ticksLeft <= 0 || (run.food <= 0 && run.supplies <= 0)) {
        army.resupplyRun = undefined;
        pushToast(state, t('ascent.orders.resupplyArrived', { army: army.name }), 'info');
      }
    }
  }
}
