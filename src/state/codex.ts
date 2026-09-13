import { heroTemplates } from '../data/heroes';

const CODEX_KEY = 'mandate:codex:v1';

/**
 * The Hero Codex: the permanent record of every champion ever summoned in a Dragon Ascent
 * run. In-run rosters reset with the run — that keeps each run's balance readable — but the
 * Codex persists, and anything recorded in it can be chosen as the founder of a later run.
 * That's the collection/achievement layer without the power creep of a carried-over squad.
 */
interface CodexStore {
  /** Hero ids ever summoned. */
  unlocked: string[];
  /** Times each hero has been pulled, so duplicates still register as progress. */
  pulls: Record<string, number>;
  /**
   * Story template ids this player has ever actually met.
   *
   * The catalogue is several times larger than one run can walk — measured, seventeen of
   * forty-eight templates never spoke once across eight runs — and nothing anywhere told the
   * player that. A shelf that fills up is the cheapest possible way to say it.
   */
  storiesMet?: string[];
}

/**
 * A fresh empty store on every call — never a shared constant spread with `{ ...EMPTY }`.
 *
 * The spread copied the object but not its `unlocked` array or `pulls` map, so the first summon
 * on an empty profile (`unlockHero` pushes into the store it read) wrote into the module's own
 * default. From then on every "empty" read in that page returned the first run's champions:
 * measured 2026-09-13, a wiped profile's founder card still led with `real-an-tu`, shuffling one
 * extra champion and shifting every roll after it, so two same-seed runs diverged at tick 12.
 */
function emptyCodex(): CodexStore {
  return { unlocked: [], pulls: {} };
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function getCodex(): CodexStore {
  if (!canUseLocalStorage()) return emptyCodex();
  try {
    const raw = localStorage.getItem(CODEX_KEY);
    if (!raw) return emptyCodex();
    const parsed = JSON.parse(raw) as Partial<CodexStore>;
    return {
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => typeof id === 'string') : [],
      pulls: typeof parsed.pulls === 'object' && parsed.pulls ? parsed.pulls : {},
      storiesMet: Array.isArray(parsed.storiesMet)
        ? parsed.storiesMet.filter((id) => typeof id === 'string')
        : [],
    };
  } catch {
    return emptyCodex();
  }
}

function writeCodex(store: CodexStore): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(CODEX_KEY, JSON.stringify(store));
  } catch {
    // A full or blocked storage must never break a run in progress.
  }
}

export function isHeroUnlocked(heroId: string): boolean {
  return getCodex().unlocked.includes(heroId);
}

/** Records a summon. Returns true when this is the first time this hero has been seen. */
export function unlockHero(heroId: string): boolean {
  const store = getCodex();
  const isNew = !store.unlocked.includes(heroId);
  if (isNew) {
    store.unlocked.push(heroId);
  }
  store.pulls[heroId] = (store.pulls[heroId] ?? 0) + 1;
  writeCodex(store);
  return isNew;
}

export function codexProgress(): { unlocked: number; total: number } {
  return { unlocked: getCodex().unlocked.length, total: heroTemplates.length };
}

/** Records that a story actually spoke to this player. Returns true the first time. */
export function unlockStory(templateId: string): boolean {
  const store = getCodex();
  const met = store.storiesMet ?? [];
  if (met.includes(templateId)) return false;
  met.push(templateId);
  store.storiesMet = met;
  writeCodex(store);
  return true;
}

/**
 * How much of the Chronicle this player has met, for the shelf beside the champion count.
 *
 * The catalogue size is passed in rather than imported. `data/stories` pulls in every story file,
 * each of which imports `StorySystem`, which imports this module — and this module is loaded by
 * every mode at boot, so importing the catalogue here closed a cycle that left `storyTemplates`
 * undefined at module init and took rival, campaign and empire down with it.
 */
export function storyProgress(total: number): { met: number; total: number } {
  return { met: (getCodex().storiesMet ?? []).length, total };
}

/**
 * Heroes offered on the founder prompt at the start of a run: everything recorded in the
 * Codex, best first. A first-ever run has an empty Codex, so the caller falls back to a
 * starter set — the founder choice is never a dead end.
 */
export function getFounderPool(): string[] {
  const unlocked = getCodex().unlocked;
  return heroTemplates.filter((hero) => unlocked.includes(hero.id)).map((hero) => hero.id);
}
