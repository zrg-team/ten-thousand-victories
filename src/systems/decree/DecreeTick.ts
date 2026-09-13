import { generateHero } from '../../data/heroFactory';
import { initializeRecruitedHero } from '../heroes/HeroService';
import { getProject } from '../../data/edicts';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { unlockHero } from '../../state/codex';
import type { GameState, Hero } from '../../state/types';
import { removeCourtModifier } from '../CourtSystem';
import { applyEstateDeltas, estateStanding } from '../DecreeSystem';
import { pushToast } from '../empire/notifications';
import { refreshAllLandOutputs } from '../ResourceSystem';
import { heroName, t } from '../../i18n';
import {
  EXAM_INTERVAL,
  examinations,
  HINH_THU_STABILITY_FLOOR,
  isFarming,
  paperMoney,
  writtenCode,
} from './rules';

/**
 * The per-tick half of the rule decrees — the ones that *do* something on a clock rather than
 * answer a question at a call site.
 *
 * Split from `rules.ts` deliberately: that module is a pure reader with no side effects and no
 * dependencies beyond `GameState`, so it can be imported from anywhere in the systems layer
 * without dragging half the game in behind it. This one is allowed to mint heroes and push toasts,
 * and is called once from `advanceAscentTick`.
 */
export function tickDecreeEffects(state: GameState): void {
  const mandate = state.mandate;
  if (!mandate) return;

  tickExaminations(state);
  tickTemporaryDecrees(state);
  tickPaperMoneyCrash(state);
  tickRecalls(state);

  // Hình thư, 1042 — Đại Việt's first written code. A realm with law on paper cannot fall apart
  // completely: stability gets a floor. This is the anti-death-spiral decree, and the reason it
  // is a floor rather than a bonus is that a bonus does nothing at the moment you need it.
  if (writtenCode(state) && state.court.stability < HINH_THU_STABILITY_FLOOR) {
    state.court.stability = HINH_THU_STABILITY_FLOOR;
  }
}

/**
 * Khoa cử — the examinations, held from 1075 and made the spine of the state by Lê Thánh Tông.
 *
 * A second talent pipeline that is not the gacha: every `EXAM_INTERVAL` ticks the hall seats a
 * graduate outright, and their calibre is Sĩ standing rather than luck. Being *deterministic* is
 * the whole point — a player who has governed the scholars well can plan on it, which no amount of
 * pity-adjusted rolling lets them do.
 */
function tickExaminations(state: GameState): void {
  const mandate = state.mandate;
  if (!mandate || !examinations(state)) return;

  mandate.examTicks = (mandate.examTicks ?? 0) + 1;
  if (mandate.examTicks < EXAM_INTERVAL) return;
  mandate.examTicks = 0;

  const si = estateStanding(state, 'si');
  const rarity: Hero['rarity'] = si >= 85 ? 'Legendary' : si >= 68 ? 'Epic' : si >= 45 ? 'Rare' : 'Common';

  const taken = new Set([...state.heroDeck.map((h) => h.id), ...state.heroes.map((h) => h.id)]);
  for (let salt = 0; salt < 40; salt += 1) {
    const hero = generateHero((state.turn + 1) * 15013 + salt * 2654435761, { rarity });
    if (taken.has(hero.id)) continue;
    state.heroes.push(hero);
    initializeRecruitedHero(state, hero);
    unlockHero(hero.id);
    pushToast(state, t('decree.exam.graduate', { hero: heroName(hero) }), 'milestone');
    return;
  }
}

/**
 * Counts down every `dụ` and `hịch` in force, and hands its weight back when it lapses.
 *
 * The returned weight is the reason these are worth taking at all: an admonition costs the throne
 * nothing permanent, so a realm already at its authority cap can still act in a crisis. A `dụ`
 * that quietly became a standing law would make the whole instrument pointless.
 */
function tickTemporaryDecrees(state: GameState): void {
  const mandate = state.mandate;
  if (!mandate?.temporary) return;

  for (const [id, until] of Object.entries(mandate.temporary)) {
    if (state.turn < until) continue;
    delete mandate.temporary[id];
    mandate.edicts = mandate.edicts.filter((standing) => standing !== id);
    removeCourtModifier(state, `project-${id}`);
    const project = getProject(id);
    if (project) {
      pushToast(state, t('decree.temporary.lapsed', {
        title: t(`empire.edict.${project.id}` as Parameters<typeof t>[0]),
      }), 'info');
    }
  }
  refreshAllLandOutputs(state);
}

/**
 * Paper money's reckoning.
 *
 * The steady 5%/tick rot lives in `calculatePlayerResourceRates`. This is the other half: below 35
 * stability the note simply stops being money and 40% of the treasury goes at once. Hồ Quý Ly's
 * hội sao was backed by decree and a ban on metal coin, and when the realm stopped believing the
 * decree there was nothing underneath it.
 */
function tickPaperMoneyCrash(state: GameState): void {
  if (!paperMoney(state)) return;
  if (state.court.stability >= 35) return;
  // Once per stretch of collapse, not once per tick — a compounding wipe would end the run before
  // the player could read the toast telling them why.
  if ((state.mandate?.temporary?.['thong-bao-hoi-sao:crash'] ?? 0) > state.turn) return;

  const lost = Math.round(state.resources.gold * 0.4);
  if (lost <= 0) return;
  state.resources.gold -= lost;
  state.mandate!.temporary = state.mandate!.temporary ?? {};
  state.mandate!.temporary['thong-bao-hoi-sao:crash'] = state.turn + 12;
  applyEstateDeltas(state, { thuong: -12, nong: -6 });
  pushToast(state, t('decree.paperMoney.crash', { gold: lost }), 'threat');
}

/**
 * Marks a host that has just been called back off the fields (ngụ binh ư nông).
 *
 * The idle/marching transition has to be *detected*, because nothing else in the game records it:
 * `ascentArmyUpkeep` reads the same condition every tick but is a pure calculation called several
 * times a tick and must not mutate. So the previous tick's answer is stamped on the host itself,
 * and the penalty is set on the edge rather than on the state.
 */
const RECALL_SEASONS = 12;

function tickRecalls(state: GameState): void {
  for (const army of state.armies) {
    // Ngụ binh ư nông sends the realm's own men back to the fields. It has no claim on somebody
    // else's household.
    if (army.kingdomId !== PLAYER_KINGDOM_ID || army.isLevy || army.patron) continue;
    const marching = state.movementOrders.some((order) => order.armyId === army.id);
    const abroad = state.lands.find((land) => land.id === army.landId)?.ownerId !== PLAYER_KINGDOM_ID;
    if (marching || abroad) {
      // Only a host that had actually settled into the fields is unready when it is called up.
      // An ordinary repositioning march is not a recall, which is the distinction `FARMING_AFTER`
      // exists to draw — see the note on `Army.idleTicks`.
      if (isFarming(state, army.idleTicks)) army.recalledUntil = state.turn + RECALL_SEASONS;
      army.idleTicks = 0;
      continue;
    }
    army.idleTicks = (army.idleTicks ?? 0) + 1;
  }
}

/** Provinces that would answer a muster right now — used by the Diên Hồng verdict. */
export function loyalProvinceCount(state: GameState): number {
  return state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
}
