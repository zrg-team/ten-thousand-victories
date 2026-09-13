import { isEndlessMode, PLAYER_KINGDOM_ID } from '../../game/constants';
import type { GameState, Kingdom, KingdomPersonality } from '../../state/types';
import { addOpinionModifier, applyEnvy, naturalBaseline, recomputeOpinion } from '../DiplomacySystem';
import { pushToast } from './notifications';
import { reconcileRivalDecrees, tickRivalDecrees } from '../decree/RivalDecreeSystem';
import { t } from '../../i18n';
import { releaseKingdomPrisoners } from '../heroes/HeroService';

// ─────────────────────────────────────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────────────────────────────────────

/** Hard ceiling on an empire's power index, and the level past which overextension bites. */
const POWER_CAP = 122;
const OVEREXTEND_THRESHOLD = 88;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const moveToward = (v: number, target: number, step: number) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);
const rand = (n: number) => Math.floor(Math.random() * n);

/** How aggressively an empire pursues war and expansion. */
export function ambition(personality: KingdomPersonality): number {
  switch (personality) {
    case 'aggressive': return 1.5;
    case 'expansionist': return 1.2;
    case 'defensive': return 0.6;
    case 'economic': return 0.7;
    case 'diplomatic': return 0.5;
    default: return 0.9;
  }
}

function basePower(personality: KingdomPersonality): number {
  switch (personality) {
    case 'aggressive': return 56;
    case 'expansionist': return 52;
    case 'defensive': return 50;
    case 'economic': return 46;
    case 'diplomatic': return 44;
    default: return 48;
  }
}

function stabilityBaseline(personality: KingdomPersonality): number {
  switch (personality) {
    case 'economic': return 70;
    case 'diplomatic': return 68;
    case 'defensive': return 62;
    case 'expansionist': return 54;
    case 'aggressive': return 48;
    default: return 58;
  }
}

/** Seeds the sim stats for an empire that doesn't have them yet. */
export function initEmpireSim(kingdom: Kingdom): void {
  kingdom.power ??= basePower(kingdom.personality) + rand(12) - 4;
  kingdom.stability ??= stabilityBaseline(kingdom.personality) + rand(16) - 8;
  kingdom.age ??= rand(8);
}

/**
 * The realms a fallen empire can be reborn under — **the neighbours, never a Việt kingdom.**
 *
 * The pool used to open with Đại Nam, Văn Lang, Âu Lạc, Nam Việt, Vạn Xuân and Đại Cồ Việt, and
 * the rival kings were Lý Công Uẩn and Trần Hưng Đạo: the player's own history, marching against
 * them. Reported verbatim: *those enemies and their army styles must not be Vietnamese kingdoms*.
 * The hosts were already dressed as the neighbours (`ENEMY_WARDROBES` is Song, Yuan, Ming, Qing,
 * Chăm); the names now agree, and a reborn realm draws its name from the people its wardrobe
 * belongs to, so a Ming-dressed host is not called Chiêm Thành.
 */
const EMPIRE_NAMES: Record<'han' | 'champa' | 'south', string[]> = {
  // The northern courts, by the dynasty and the name they went by.
  han: ['Nam Hán', 'Đại Tống', 'Đại Nguyên', 'Đại Minh', 'Đại Thanh', 'Nam Chiếu', 'Đại Lý'],
  // The Chăm polities and the coast south of them.
  champa: ['Chiêm Thành', 'Lâm Ấp', 'Hoàn Vương', 'Vijaya', 'Panduranga'],
  // The Khmer, Tai and Lao realms to the south and west.
  south: ['Phù Nam', 'Chân Lạp', 'Cao Miên', 'Xiêm La', 'Ai Lao', 'Lan Xang', 'Bồn Man', 'Thủy Xá', 'Hỏa Xá'],
};
const ROYAL_NAMES: Record<'han' | 'champa' | 'south', string[]> = {
  han: ['Lưu Cung', 'Triệu Quang Nghĩa', 'Quách Quỳ', 'Thoát Hoan', 'Ô Mã Nhi', 'Trương Phụ', 'Liễu Thăng', 'Tôn Sĩ Nghị'],
  champa: ['Chế Bồng Nga', 'Chế Mân', 'Chế Củ', 'Phạm Văn', 'Harivarman', 'Indravarman'],
  south: ['Jayavarman', 'Suryavarman', 'Fa Ngum', 'Phra Naret', 'Setthathirath', 'Chao Anou'],
};
/** Which name pool a realm draws from: the people its hosts are dressed as. */
function namePoolFor(kingdom: Kingdom): 'han' | 'champa' | 'south' {
  const wardrobe = kingdom.wardrobe;
  if (wardrobe === 'champa') return Math.random() < 0.5 ? 'champa' : 'south';
  if (wardrobe === 'song' || wardrobe === 'yuan' || wardrobe === 'ming' || wardrobe === 'qing') return 'han';
  return (['han', 'champa', 'south'] as const)[rand(3)];
}
const PERSONALITIES: KingdomPersonality[] = ['aggressive', 'defensive', 'economic', 'diplomatic', 'expansionist'];

function pickEmpireName(state: GameState, kingdom: Kingdom): string {
  const used = new Set(state.kingdoms.map((k) => k.name));
  const pool = EMPIRE_NAMES[namePoolFor(kingdom)];
  const all = Object.values(EMPIRE_NAMES).flat();
  const free = pool.filter((n) => !used.has(n));
  const from = free.length > 0 ? free : all.filter((n) => !used.has(n));
  const list = from.length > 0 ? from : all;
  return list[rand(list.length)];
}

/** A fallen empire is reborn as a new realm in the same slot — a "new empire rises". */
function rebirthEmpire(state: GameState, kingdom: Kingdom): void {
  if (state.ascent?.heroDepth) releaseKingdomPrisoners(state, kingdom.id);
  const oldName = kingdom.name;
  // Free any ambassador we had posted there.
  if (kingdom.ambassadorHeroId) {
    const hero = state.heroes.find((h) => h.id === kingdom.ambassadorHeroId);
    if (hero && hero.assignedTo === `ambassador:${kingdom.id}`) hero.assignedTo = undefined;
    kingdom.ambassadorHeroId = undefined;
  }
  const personality = PERSONALITIES[rand(PERSONALITIES.length)];
  kingdom.name = pickEmpireName(state, kingdom);
  kingdom.personality = personality;
  const kings = ROYAL_NAMES[namePoolFor(kingdom)];
  kingdom.king = { name: kings[rand(kings.length)], personality, age: 0 };
  kingdom.power = 26 + rand(12);
  kingdom.stability = 44 + rand(16);
  kingdom.age = 0;
  kingdom.warAppetite = 0;
  kingdom.giftFatigue = 0;
  kingdom.treaties = [];
  kingdom.vassalage = undefined;
  kingdom.opinionModifiers = [];
  recomputeOpinion(kingdom);
  pushToast(state, t('empire.world.rebirth', { old: oldName, next: kingdom.name }), 'milestone');
  state.message = t('empire.world.rebirth', { old: oldName, next: kingdom.name });
}

// ─────────────────────────────────────────────────────────────────────────────
// Yearly evolution — the world lives on its own
// ─────────────────────────────────────────────────────────────────────────────

function activeEmpires(state: GameState): Kingdom[] {
  return state.kingdoms.filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
}

/** Called once per in-game year (from the season/year rollover). */
export function tickGreatPowersYear(state: GameState): void {
  if (!isEndlessMode(state.gameMode)) return;

  // The other courts legislate too. On this clock rather than the tick, because these empires
  // already live on their own slower one — a neighbour proclaiming at you every season would be
  // noise instead of an event. `reconcileRivalDecrees` runs first so warming a relationship this
  // year takes their edict off before the same pass considers writing another.
  reconcileRivalDecrees(state);
  tickRivalDecrees(state);

  const empires = activeEmpires(state);
  for (const k of empires) {
    initEmpireSim(k);
    k.age = (k.age ?? 0) + 1;

    // Growth: ambitious, stable empires arm faster — a rich, stable empire becomes
    // a real menace over time (the logic the player expects).
    const amb = ambition(k.personality);
    const growth = (1.1 + amb * 1.2) * (0.5 + (k.stability ?? 50) / 100);
    k.power = clamp((k.power ?? 50) + growth - 0.8, 14, POWER_CAP);

    // Stability drifts toward temperament baseline, buffeted by random fortune.
    const shock = (Math.random() - 0.5) * 15;
    let stab = moveToward(k.stability ?? 50, stabilityBaseline(k.personality), 3) + shock;
    // Overextension: a bloated empire can't hold itself together — the bigger it grows
    // past its means, the faster it destabilises, so no hegemon snowballs forever.
    if ((k.power ?? 0) > OVEREXTEND_THRESHOLD) {
      stab -= ((k.power ?? 0) - OVEREXTEND_THRESHOLD) * 0.4;
    }
    k.stability = clamp(stab, 0, 100);

    // **A new king owes us nothing.**
    //
    // Asked for as *"some hard actions totally lost relation -> new king, etc"*, and the machinery
    // was already here: `rebirthEmpire` clears every modifier and re-rolls the personality. It
    // just only fired on total collapse, which in a normal run is rare enough that a player never
    // sees it. A succession does the same to *one* relationship without destroying the realm.
    //
    // This is the sharpest edge in the diplomacy system on purpose. Twenty years of gifts can be
    // erased by an old man dying, and there is no way to prevent it — which is what stops a
    // maxed relationship being a solved problem and keeps the courts worth re-reading.
    if (k.king && state.gameMode === 'ascent') {
      k.king.age += 1;
      const deathChance = 0.02 + k.king.age * 0.012;
      if (Math.random() < deathChance) {
        const personality = PERSONALITIES[rand(PERSONALITIES.length)];
        const heirs = ROYAL_NAMES[namePoolFor(k)];
        const heir = heirs[rand(heirs.length)];
        const old = k.king.name;
        k.king = { name: heir, personality, age: 0 };
        k.personality = personality;
        // The ledger is wiped, but the ambassador stays: an embassy outlives a reign, and losing
        // the hero as well would make this purely punitive rather than a thing to rebuild from.
        k.opinionModifiers = [];
        k.giftFatigue = 0;
        k.treaties = [];
        recomputeOpinion(k);
        pushToast(state, t('ascent.king.dies', { king: old, kingdom: k.name, heir }), 'threat');
      }
    }

    // A posted ambassador steadily warms relations and cools war appetite.
    if (k.ambassadorHeroId) {
      const existing = (k.opinionModifiers ?? []).find((m) => m.id === `ambassador-${k.id}`);
      const nextValue = Math.min(28, (existing?.value ?? 0) + 5);
      addOpinionModifier(k, { id: `ambassador-${k.id}`, label: t('empire.world.mod.ambassador'), value: nextValue, source: 'treaty' });
      k.warAppetite = Math.max(0, (k.warAppetite ?? 0) - 8);
      // And the court they feud with sees whose hall our champion is sitting in.
      //
      // This was the one warming that carried no envy, and it is the one the player was told to
      // expect it from: *"send a hero to other kingdom to maintain relation. Noted: it not best
      // method everywhere — increase relation this kingdom might affect to relations other
      // kingdom."* An embassy is the most visible thing on the list and it was the only silent one.
      applyEnvy(state, k, nextValue - (existing?.value ?? 0));
    }
  }

  // Collapse: a spent empire falls and a new realm rises in its place.
  for (const k of empires) {
    if ((k.stability ?? 50) <= 0 || (k.power ?? 50) < 12) {
      rebirthEmpire(state, k);
    }
  }

  // One inter-empire war per year, sometimes — the strong prey on the weak, and a
  // conqueror can absorb its victim to become a terrifying hegemon.
  const alive = activeEmpires(state);
  if (alive.length >= 2 && Math.random() < 0.4) {
    resolveInterEmpireWar(state, alive);
  }
}

function resolveInterEmpireWar(state: GameState, alive: Kingdom[]): void {
  // Aggressor = strongest × most ambitious; target = the weakest other empire.
  const attacker = [...alive].sort((a, b) => (b.power ?? 0) * ambition(b.personality) - (a.power ?? 0) * ambition(a.personality))[0];
  const others = alive.filter((k) => k.id !== attacker.id);
  // A standing feud is who you go for first. The pairing set at worldgen is what makes the
  // player's *"each kingdom can conflict with other"* visible in the world's own behaviour rather
  // than only in the arithmetic of their gifts — the courts act on it too.
  const feudPartner = others.find((k) => k.id === attacker.feudWith);
  const defender = feudPartner ?? [...others].sort((a, b) => (a.power ?? 0) - (b.power ?? 0))[0];
  if (!attacker || !defender || ambition(attacker.personality) < 0.7 || (attacker.power ?? 0) < 22) {
    return;
  }
  resolveWar(state, attacker, defender);
}

/** Resolves a war between two empires: a decisive win can absorb the loser into a hegemon. */
export function resolveWar(state: GameState, attacker: Kingdom, defender: Kingdom): void {
  initEmpireSim(attacker);
  initEmpireSim(defender);
  const roll = (attacker.power ?? 0) * (0.8 + Math.random() * 0.5);
  if (roll > (defender.power ?? 0)) {
    const spoils = (defender.power ?? 0) * 0.4;
    defender.power = clamp((defender.power ?? 0) - spoils, 0, POWER_CAP);
    defender.stability = clamp((defender.stability ?? 50) - 28, 0, 100);
    // War exhaustion + digesting conquests bites harder the bigger the victor already is.
    attacker.power = clamp((attacker.power ?? 0) + spoils * 0.5, 14, POWER_CAP);
    attacker.stability = clamp((attacker.stability ?? 50) - 10, 0, 100);

    if ((defender.power ?? 0) < 14 || (defender.stability ?? 0) <= 0) {
      attacker.power = clamp((attacker.power ?? 0) + (defender.power ?? 0) * 0.5, 14, POWER_CAP);
      attacker.stability = clamp((attacker.stability ?? 50) - 8, 0, 100);
      pushToast(state, t('empire.world.conquered', { attacker: attacker.name, defender: defender.name }), 'threat');
      state.message = t('empire.world.conquered', { attacker: attacker.name, defender: defender.name });
      rebirthEmpire(state, defender);
    } else {
      pushToast(state, t('empire.world.war', { attacker: attacker.name, defender: defender.name }), 'info');
    }
  } else {
    attacker.power = clamp((attacker.power ?? 0) * 0.82, 14, 150);
    attacker.stability = clamp((attacker.stability ?? 50) - 12, 0, 100);
    defender.stability = clamp((defender.stability ?? 50) - 5, 0, 100);
    pushToast(state, t('empire.world.repelled', { attacker: attacker.name, defender: defender.name }), 'info');
  }
}
