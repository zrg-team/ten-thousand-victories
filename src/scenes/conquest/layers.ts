/**
 * Teardown for the battle screen's layers — the other half of the arrangement that keeps the field,
 * the readout, the orders, the moment, the relief strip, the exits and the pips in containers of
 * their own so each can be rebuilt on its own clock.
 *
 * Every one of those rebuilds comes through `clearLayer` rather than `removeAll(true)`, because the
 * layers torn down most often are the ones holding endless tweens. The pair live up here rather
 * than in `battle/` — where every caller is — because a shared helper has to sit in a file that
 * imports no sibling back.
 *
 * `clearLanePage` is the lane's equivalent, and lives here for the same reason.
 */
import Phaser from 'phaser';
import { swallowRestOfPress } from '../../ui/inputGeneration';
import type { ConquestUIScene } from '../ConquestUIScene';
import { stopBattleMusic } from './battle/music';
import { setHudSheet } from './hudSheet';

/**
 * Empties a layer, and takes its tweens with it.
 *
 * `Container.removeAll(true)` destroys the children; it does **not** touch the tweens pointing at
 * them. On Phaser 3 that meant the manager went on updating a tween whose target was gone until
 * the tween ended by itself, and one with `repeat: -1` never did: measured across a single 26-beat
 * engagement it climbed from 11 live tweens to 73 and was still rising — sixty updates a second
 * each, every one writing to an object that no longer existed.
 *
 * **On 4.2.1 that particular leak is gone.** `TweenData.update` bails on `target.isDestroyed` and
 * calls `setCompleteState()`, so an orphaned tween now retires itself a tick later. Left here
 * because the paragraph above is the reason this function exists and a reader who does not know
 * the engine moved will re-derive the bug from the shape of the code — as a review of this very
 * file did, reporting the gold-card glow in `prompts/run.ts` as a live leak. It is not.
 *
 * What the pair still buys is the *tick before* that, and depth. The layers here are rebuilt on
 * every beat — the clash mark over the seam, the four-frame clock inside every host block —
 * so "retires itself a tick later" is a frame of tweens writing to dead objects, sixty times a
 * second, for the length of a siege. Killing them first costs one walk of a container that is
 * about to be destroyed anyway.
 */
export function clearLayer(self: ConquestUIScene, target: Phaser.GameObjects.Container): void {
  for (const child of target.list) killTweensDeep(self, child);
  target.removeAll(true);
}

/**
 * Kills every tween pointing at an object *or at anything inside it*.
 *
 * The depth is the whole point. An authored host's frame clock targets its nested stamped-army
 * container (and the procedural rollback targets its ranks), so `killTweensOf(marker)` finds
 * nothing at all and every rebuilt block would leave an invisible clock behind.
 */
export function killTweensDeep(self: ConquestUIScene, object: Phaser.GameObjects.GameObject): void {
  self.tweens.killTweensOf(object);
  const nested = object as Phaser.GameObjects.Container;
  if (Array.isArray(nested.list)) for (const child of nested.list) killTweensDeep(self, child);
}

/**
 * Takes down whatever page is currently in the lane, so another can be built into it.
 *
 * Nine copies of these three lines were spread across six files, and the one that mattered was the
 * one that had already been forgotten: cancelling a claim repainted the build screen without them,
 * leaving the outgoing page's scroll areas alive. An `InkScrollArea` registers a *global* wheel
 * handler, so a leaked one goes on eating the wheel over a page it no longer draws — and a mask
 * does not clip input, so its dead rows stay tappable underneath the live ones.
 *
 * **And the battle screen has to be taken down with them.** `battleUi` holds nine containers that
 * live in the modal layer, so emptying the layer destroys them — but the handle stayed, and
 * `openPromptKey` is still `lane:battle` while a page *of* the fight (the war board reached from
 * the fronts chip, the relief picker) stands in its place. `refresh` reads that key and calls
 * `updateBattle` on every beat, which rebuilt the dock, the exits and the relief plate into the
 * destroyed containers: nothing drawn, and a fresh set of interactive zones registered with the
 * input plugin each time, invisible, stacked over the page that *is* on screen. The bottom of
 * that stack is where the lane's Close button lives. Reported verbatim: *Chiến sự page crash
 * sometime — I can do nothing.* `releaseOverlay` already did this pair; page turns went round it.
 *
 * The modal layer is emptied with `removeAll(true)` rather than `clearLayer`: a lane page holds no
 * endless tweens, and paying a deep tween sweep on every page turn is not free.
 */
export function clearLanePage(self: ConquestUIScene): void {
  // **The press that tore this page down does not get to press what replaces it.**
  //
  // Reported with a screenshot: *Lập quân -> Quay lại -> it also ticks the checkbox on the Quân đội
  // page underneath.* Back acts on `pointerdown` (`InkUI.button`), this destroys the form, the
  // parent page is drawn in its place, and the parent's checkbox is under the pointer by the time
  // the finger lifts.
  //
  // Here rather than in `replaceLanePage` because this is the single funnel every lane teardown
  // passes through — the page turn, the close, and the broken-page recovery — and the same gesture
  // straddles all three.
  swallowRestOfPress(self);
  self.stopBattleClock();
  // *"stop if users leave"* — every battle teardown funnels through here.
  if (self.battleUi) stopBattleMusic();
  self.battleUi = undefined;
  // And the stage it took goes back to the column — see `hudSheet.ts`.
  setHudSheet(self, false);
  // Only the war board sets this again, on its way in — so every other page of the lane is
  // automatically one that `refresh` will not redraw under the player.
  self.warBoardKey = '';
  for (const scroll of self.activeScrollAreas) scroll.destroy();
  self.activeScrollAreas = [];
  self.modalLayer.removeAll(true);
}
