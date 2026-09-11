import type { FieldStance, GameState } from './types';
import { t } from '../i18n';
import { ensureAscentLaneState } from '../systems/ascent/ConquestSystem';
import { clearLiveReign } from './dynasty';

export const SAVE_SNAPSHOT_VERSION = 1;
export const SAVE_SNAPSHOT_KEY = 'mandate:snapshot:v1';

/**
 * Where the game puts a run down by itself — when the player leaves the screen, and on the way
 * out of the page.
 *
 * A slot of its own rather than the one above, because the two are written by different people.
 * `SAVE_SNAPSHOT_KEY` holds a save the *player* asked for; a phone reclaiming memory from a
 * backgrounded tab is not a request to overwrite it. Sharing one key meant glancing at a message
 * during a fresh run silently destroyed the run saved deliberately the night before.
 *
 * The two are never mixed. `loadSnapshot` — what Continue, the lineage card and the flag preview
 * read — sees ONLY the player's own save, so pressing Continue can never hand back something
 * they did not save. This slot is reachable through exactly one door: the sheet
 * `pendingAutosave` raises on the way in, which the player has to answer.
 *
 * It used to be read by whoever asked for "the newest save", which is how a crash on the front
 * page could drop the player into a run — and how Continue could hand back a state they never
 * chose to keep.
 */
export const AUTOSAVE_SNAPSHOT_KEY = 'mandate:autosave:v1';

export interface SaveSnapshot {
  version: typeof SAVE_SNAPSHOT_VERSION;
  savedAt: string;
  state: GameState;
}

// Session flags are deliberately not serialized into either save slot.
const closedRuns = new WeakSet<GameState>();
const finishedRuns = new WeakSet<GameState>();

export function canAutosave(state: GameState): boolean {
  return !state.ascent?.arena && !state.victory && !state.isDefeated && !closedRuns.has(state);
}

/** Terminal campaign results cannot be resumed, even from a later background event. */
export function clearFinishedRunSaves(state: GameState): boolean {
  if (state.ascent?.arena || (!state.victory && !state.isDefeated)) return false;
  if (!finishedRuns.has(state)) {
    finishedRuns.add(state);
    closedRuns.add(state);
    removeSlot(SAVE_SNAPSHOT_KEY);
    clearAutosave();
    clearLiveReign();
  }
  return true;
}

/** Consume recovery only once the resumed/new campaign has actually rendered. */
export function resumeSaveSession(state: GameState): void {
  if (state.ascent?.arena || clearFinishedRunSaves(state)) return;
  closedRuns.delete(state);
  clearAutosave();
}

/** Call before scene shutdown or a native quit can emit blur/pagehide. */
export function endSaveSession(state: GameState): void {
  closedRuns.add(state);
  if (state.ascent?.arena || clearFinishedRunSaves(state)) return;
  clearAutosave();
  clearLiveReign();
}

export function saveSnapshot(state: GameState): SaveSnapshot | undefined {
  if (clearFinishedRunSaves(state) || !canAutosave(state)) return undefined;
  const snapshot = writeSnapshot(state, SAVE_SNAPSHOT_KEY);
  // A failed manual write must retain the last recoverable progress.
  if (snapshot) clearAutosave();
  return snapshot;
}

/**
 * Puts the run down without being asked. Same shape, its own slot.
 *
 * Returns undefined when the write could not happen at all — a full or refused quota, which is
 * a real state on a phone and not an error worth taking the run down over. The caller reports
 * it; a later lifecycle event can retry.
 */
export function autosaveSnapshot(state: GameState): SaveSnapshot | undefined {
  if (clearFinishedRunSaves(state) || !canAutosave(state)) return undefined;
  return writeSnapshot(state, AUTOSAVE_SNAPSHOT_KEY);
}

function writeSnapshot(state: GameState, key: string): SaveSnapshot | undefined {
  if (!canUseLocalStorage()) {
    return undefined;
  }

  const snapshot: SaveSnapshot = {
    version: SAVE_SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    state: normalizeSnapshotState(state),
  };

  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    return undefined;
  }
  return snapshot;
}

/**
 * Forgets the automatic slot.
 *
 * Called after a successful save, resume, or deliberate exit. This removes only the recovery
 * snapshot; the active dynasty line remains until endSaveSession ends the run deliberately.
 */
export function clearAutosave(): void {
  removeSlot(AUTOSAVE_SNAPSHOT_KEY);
}

function removeSlot(key: string): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // A refused write is not worth taking the exit down over.
  }
}

/**
 * The run the device took, if that is what the newest slot is.
 *
 * The automatic slot exists only between leaving the screen and coming back to it: Save & Exit
 * clears it (`clearAutosave`), and so does any deliberate way out. So an automatic snapshot that is
 * still there when the front page opens means the game was ended by something other than the
 * player — the phone reclaimed the app, the tab was closed, the process died — and the run inside
 * it is one they never chose to leave. That is the case worth asking about on the way in, rather
 * than leaving a Continue line for them to notice.
 */
export function pendingAutosave(): SaveSnapshot | undefined {
  const automatic = readSlot(AUTOSAVE_SNAPSHOT_KEY);
  if (!automatic) return undefined;
  const manual = readSlot(SAVE_SNAPSHOT_KEY);
  // A manual save clears this slot on its way past, so an automatic one that is older than the
  // player's own save is a leftover from a version that did not — or from a write that raced it.
  // Either way the player has since said what they wanted kept, so it is dropped rather than
  // offered back to them.
  if (manual && Date.parse(manual.savedAt) >= Date.parse(automatic.savedAt)) {
    removeSlot(AUTOSAVE_SNAPSHOT_KEY);
    return undefined;
  }
  return automatic;
}

/**
 * The save the PLAYER made. Never the automatic slot.
 *
 * Continue, the lineage card's door back into the live reign and the front page's flag preview
 * all read this, and all three mean the same thing: the run the player chose to keep. The run
 * the device took from them is a different question with a different answer — `pendingAutosave`,
 * asked once, through a sheet.
 */
export function loadSnapshot(): SaveSnapshot | undefined {
  return readSlot(SAVE_SNAPSHOT_KEY);
}

function readSlot(key: string): SaveSnapshot | undefined {
  if (!canUseLocalStorage()) {
    return undefined;
  }

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SaveSnapshot;
    if (!isValidSnapshot(parsed) || Number.isNaN(Date.parse(parsed.savedAt))) {
      return undefined;
    }
    // Discard terminal/arena snapshots left by older versions as well.
    if (parsed.state.ascent?.arena || parsed.state.victory || parsed.state.isDefeated) {
      removeSlot(key);
      return undefined;
    }
    parsed.state = normalizeSnapshotState(parsed.state);
    return parsed;
  } catch {
    return undefined;
  }
}

export function hasSnapshot(): boolean {
  return Boolean(loadSnapshot());
}

export function snapshotLabel(snapshot = loadSnapshot()): string {
  if (!snapshot) {
    return t('save.noSavedCampaign');
  }

  const date = new Date(snapshot.savedAt);
  if (Number.isNaN(date.getTime())) {
    return t('save.savedCampaign');
  }

  return t('save.savedDate', { date: date.toLocaleString() });
}

function normalizeSnapshotState(state: GameState): GameState {
  const clone = structuredClone(state);
  for (const land of clone.lands) {
    for (const building of land.buildings) {
      if ((building.type as string) === 'shrine') {
        building.type = 'communalHall';
      }
    }
  }
  for (const order of clone.buildOrders) {
    if ((order.building as string) === 'shrine') {
      order.building = 'communalHall';
    }
  }
  for (const army of clone.armies) {
    army.unpaidTicks ??= 0;
  }
  for (const card of [
    ...clone.politicsDeck,
    clone.activePoliticsCard,
    clone.pendingCourtRequest,
  ]) {
    if (!card) {
      continue;
    }
    for (const choice of card.choices) {
      if ((choice.effects.freeBuilding as string | undefined) === 'shrine') {
        choice.effects.freeBuilding = 'communalHall';
      }
      if ((choice.effects.freeUpgrade as string | undefined) === 'shrine') {
        choice.effects.freeUpgrade = 'communalHall';
      }
    }
  }
  clone.isPaused = false;
  // The away pause is owned by `game/awayPause.ts` and cleared by the player coming back. A run
  // stored while the player was away would restore into a halt nothing is left to lift.
  clone.isAwayPause = undefined;
  clone.latestBattleResult = undefined;
  clone.lastStoryOutcome = undefined;
  // The map now paints itself from the season, so an absent one would leave the world with no
  // palette at all rather than merely with a wrong HUD label.
  clone.season ??= 'Spring';
  // A prompt was mid-decision when the run was saved; its options were priced against a
  // state that no longer exists, so drop it rather than restore a stale choice.
  clone.pendingAscentPrompt = undefined;
  if (clone.ascent) {
    clone.ascent.promptQueue = [];
    // Banner cues are announcements about a moment that has passed, and they belong with the
    // prompt queue above rather than in the save: a run stored while a battle lane or an aftermath
    // card held the screen keeps its undrained cues, and `ConquestUIScene.lastWaveCueId` starts at
    // zero in a freshly created scene — so loading replayed the landing of an invasion the player
    // had already fought. Dropped on load, exactly as a mid-decision prompt is.
    clone.ascent.waveCues = [];
    ensureAscentLaneState(clone);
    // A run saved mid-engagement carries the retired stance ring — `hold` and `loose` are no longer
    // stances at all, and neither side had a formation. Without this the fight resumes on
    // `undefined` and every multiplier in the exchange reads NaN.
    //
    // `loose` becomes `defend` rather than anything cleverer: standing off and shooting is a
    // *shape* now (Thế Nỏ), and the host it described was a cautious one.
    //
    // Every live field, not only the watched one: a run saved with two fronts open restores both,
    // and a side fight resumed on an `undefined` stance is the same NaN as the watched one was.
    const stance = (value: unknown): FieldStance => (
      value === 'press' || value === 'balanced' || value === 'defend' || value === 'withdraw'
        ? value : 'defend'
    );
    // A save written before the war could have more than one field has no `sideBattles` at all,
    // which is exactly the empty list this wants.
    clone.ascent.sideBattles = (clone.ascent.sideBattles ?? []).filter((side) => side && !side.over);
    for (const fight of [clone.ascent.activeBattle, ...clone.ascent.sideBattles]) {
      if (!fight) continue;
      fight.stance = stance(fight.stance);
      fight.theirStance = stance(fight.theirStance);
      fight.ourFormation ??= 'chong';
      fight.theirFormation ??= 'chong';
      fight.stancePending = undefined;
      fight.reformBeats = 0;
      fight.theirReformBeats = 0;
      fight.formationTarget = undefined;
      fight.theirFormationTarget = undefined;
      fight.stamina = undefined;
      fight.staminaClock = undefined;
    }
    // The alert is an announcement about a moment that has passed, like the banner cues above:
    // a run reloaded onto two live fronts should show the board because the fronts are there,
    // not because a flag survived the save.
    clone.ascent.frontsOpened = undefined;
  }
  return clone;
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function isValidSnapshot(value: SaveSnapshot): value is SaveSnapshot {
  return (
    value?.version === SAVE_SNAPSHOT_VERSION &&
    typeof value.savedAt === 'string' &&
    Boolean(value.state) &&
    Array.isArray(value.state.lands) &&
    Array.isArray(value.state.armies) &&
    Array.isArray(value.state.hexTiles)
  );
}
