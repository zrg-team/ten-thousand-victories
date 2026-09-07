import Phaser from 'phaser';
import { FORMATION_RING } from '../data/ascent/formations';
import { isShell, toggleFullscreen } from '../platform/shell';
import { actionBarSlots } from '../ui/ActionBar';
import { handleBarAction } from '../scenes/conquest/shell';
import type { ConquestUIScene } from '../scenes/ConquestUIScene';

/**
 * The keyboard, for Dragon Ascent on the desktop.
 *
 * Every key here is a door the bar or a sheet already has, reached without the mouse — nothing is
 * reachable by key that is not reachable by hand, so the two can never disagree about what the
 * game allows. Installed only on the desktop layout (`conquest/shell.ts`), so the phone registers
 * nothing.
 *
 *   Esc            close the open lane or sheet; with nothing open, the run menu
 *   Space          stop and start the world (not on the battle screen, which has its own clock)
 *   1–7            the bar's lanes, in the order the bar draws them — read at the press, because
 *                  the Battle button appears first mid-siege and the lanes reflow behind it
 *   1–5, Q W E     on the battle screen: the five shapes of the ring, and the three stances
 *   + −            zoom the map (the same step as the buttons)
 *   W A S D, ←↑→↓  pan the map while held
 *   F, F11         fullscreen — F11 only inside a cabinet, where it is not the browser's own key
 */

/** Design units of pan per second while a key is held. */
const PAN_SPEED = 520;

const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

const STANCE_KEYS: Record<string, string> = { KeyQ: 'defend', KeyW: 'balanced', KeyE: 'press' };

function digitOf(code: string): number | undefined {
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return match ? Number(match[1]) : undefined;
}

/** Whether the press belongs to a text field rather than the game. There are none; guarded anyway. */
function typingElsewhere(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(target?.isContentEditable);
}

/** Installs the keys on a run's HUD scene; returns the function that takes them off again. */
export function installDesktopKeys(self: ConquestUIScene): () => void {
  const keyboard = self.input.keyboard;
  if (!keyboard) return () => {};
  const held = new Set<string>();

  const onBattle = (): boolean => self.openPromptKey === 'lane:battle' && Boolean(self.battleUi);

  const onDown = (event: KeyboardEvent): void => {
    if (typingElsewhere(event)) return;
    const { code } = event;

    if (code === 'Escape') {
      if (event.repeat) return;
      const key = self.openPromptKey;
      if (key.startsWith('lane:')) {
        self.closeLane();
      } else if (key === 'menu' || key === 'quit' || key === 'codex') {
        // The same two lines every row of the run menu runs on its way out.
        self.state.isStrategyPause = self.lanePauseBeforeOpen;
        self.closeOverlay();
      } else if (key === 'story-outcome') {
        self.dismissStoryOutcome();
      } else if (key === '' && !self.state.pendingAscentPrompt) {
        handleBarAction(self, 'menu');
      }
      // A card stays: it is a decision, and Esc is not an answer to it.
      return;
    }

    if (code === 'Space') {
      event.preventDefault();
      if (event.repeat || onBattle() || self.state.pendingAscentPrompt) return;
      handleBarAction(self, 'pause');
      return;
    }

    if (code === 'Equal' || code === 'NumpadAdd') { self.events.emit('ui:zoom-map', 1); return; }
    if (code === 'Minus' || code === 'NumpadSubtract') { self.events.emit('ui:zoom-map', -1); return; }

    if (code === 'KeyF' || (code === 'F11' && isShell())) {
      event.preventDefault();
      if (!event.repeat) toggleFullscreen(self.scale);
      return;
    }

    if (onBattle()) {
      // The dock's own strings, so a key and a chip can never name different orders.
      const digit = digitOf(code);
      if (digit !== undefined && digit <= FORMATION_RING.length) {
        if (!event.repeat) self.events.emit('ui:battle-order', `formation:${FORMATION_RING[digit - 1]}`);
        return;
      }
      const stance = STANCE_KEYS[code];
      if (stance && !event.repeat) self.events.emit('ui:battle-order', `stance:${stance}`);
      return;
    }

    const digit = digitOf(code);
    if (digit !== undefined) {
      if (event.repeat || self.state.pendingAscentPrompt) return;
      const key = self.openPromptKey;
      // Only the map and a lane answer a digit; a sheet (menu, codex, quit) or a card does not.
      if (key !== '' && !key.startsWith('lane:')) return;
      const lanes = actionBarSlots(self.state.gameMode, self.actionBar.context())
        .filter((slot) => !slot.system)
        .map((slot) => slot.action);
      const action = lanes[digit - 1];
      if (!action) return;
      if (key === `lane:${action}`) {
        self.closeLane();
        return;
      }
      if (key.startsWith('lane:')) self.closeLane();
      handleBarAction(self, action);
      return;
    }

    if (PAN_KEYS[code] && self.openPromptKey === '' && !self.state.pendingAscentPrompt) {
      event.preventDefault();
      held.add(code);
    }
  };

  const onUp = (event: KeyboardEvent): void => {
    held.delete(event.code);
  };

  // The pan runs on the scene clock while a key is held, so it is smooth rather than a step per
  // key-repeat; a key still held when a sheet comes up is dropped, not stuck.
  const onUpdate = (_time: number, delta: number): void => {
    if (held.size === 0) return;
    if (self.openPromptKey !== '' || self.state.pendingAscentPrompt) {
      held.clear();
      return;
    }
    let dx = 0;
    let dy = 0;
    for (const code of held) {
      const [x, y] = PAN_KEYS[code];
      dx += x;
      dy += y;
    }
    if (dx === 0 && dy === 0) return;
    const step = (PAN_SPEED * delta) / 1000;
    self.events.emit('ui:nudge-camera', dx * step, dy * step);
  };

  keyboard.on('keydown', onDown);
  keyboard.on('keyup', onUp);
  self.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  return () => {
    held.clear();
    keyboard.off('keydown', onDown);
    keyboard.off('keyup', onUp);
    self.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
  };
}
