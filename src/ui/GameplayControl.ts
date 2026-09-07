import Phaser from 'phaser';
import { t } from '../i18n';
import { cachedText } from './cachedText';
import { UI_FONT } from './fonts';
import { markControlBorn, noteControlFired, pressIsEchoOnto } from './inputGeneration';
import { PIGMENT } from './ink/palette';
import { applyStamp, placeStamp, stampDesign } from './ink/stamp';
import { inkPath, type Pt } from './ink/stroke';
import { soundDirector } from './sound/SoundDirector';

export type GameplayControlIcon = 'zoom-in' | 'zoom-out' | 'territory' | 'terrain' | 'play' | 'pause' | 'menu';

interface ControlOptions {
  x: number;
  y: number;
  icon: GameplayControlIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  width?: number;
  height?: number;
  hitWidth?: number;
  treatment?: 'paper' | 'quiet';
  hintSide?: 'left' | 'above' | 'below';
}

/** Small pieces of the same printed paper used by the game's sheets. All states are baked once. */
export function gameplayControl(scene: Phaser.Scene, options: ControlOptions): Phaser.GameObjects.Container {
  const { x, y, icon, label, onClick, active = false, width = 36, height = 36,
    hitWidth = 44, hintSide = 'left', treatment = 'paper' } = options;
  const root = scene.add.container(x, y).setName(`gameplay-control:${icon}`)
    .setData('label', label).setData('active', active);
  const states = ['rest', 'hover', 'pressed'] as const;
  const stamps = states.map((state) => stampDesign(scene,
    `ui:gameplay-control:v3:${treatment}:${icon}:${width}:${height}:${active}:${state}`,
    { left: -width / 2 - 2, right: width / 2 + 3, top: -height / 2 - 2, bottom: height / 2 + 4 },
    (g, ax, ay) => {
      g.translateCanvas(ax, ay + (state === 'pressed' ? 1 : 0));
      const w = width / 2, h = height / 2, cut = 3;
      const paper: Pt[] = [
        { x: -w + cut, y: -h }, { x: w - cut, y: -h }, { x: w, y: -h + cut },
        { x: w, y: h - cut }, { x: w - cut, y: h }, { x: -w + cut, y: h },
        { x: -w, y: h - cut }, { x: -w, y: -h + cut },
      ];
      const hot = state !== 'rest';
      const ink = active || hot ? PIGMENT.sonDeep : PIGMENT.mucSoft;
      if (treatment === 'quiet') {
        g.fillStyle(PIGMENT.diepHi, 1);
        g.fillPoints(paper, true);
        if (active || hot) {
          g.fillStyle(active ? PIGMENT.son : PIGMENT.mucSoft, state === 'pressed' ? 0.16 : hot ? 0.1 : 0.07);
          g.fillPoints(paper, true);
        }
        inkPath(g, paper, 719, { width: 0.8, alpha: hot ? 0.7 : 0.42,
          colour: active ? PIGMENT.sonDeep : PIGMENT.mucSoft, wobble: 0.12, step: 16, bleed: 0, closed: true });
        drawIcon(g, icon, active ? PIGMENT.sonDeep : PIGMENT.muc);
        g.translateCanvas(-ax, -ay - (state === 'pressed' ? 1 : 0));
        return;
      }
      if (state !== 'pressed') {
        g.fillStyle(PIGMENT.muc, 0.12);
        g.fillPoints(paper.map((p) => ({ x: p.x + 0.5, y: p.y + 2 })), true);
      }
      g.fillStyle(state === 'pressed' ? PIGMENT.diepLo : hot ? PIGMENT.diep : PIGMENT.diepHi, 1);
      g.fillPoints(paper, true);
      if (active) {
        g.fillStyle(PIGMENT.son, 0.07);
        g.fillPoints(paper, true);
      }
      inkPath(g, paper, 719, { width: 1, alpha: hot || active ? 0.9 : 0.65,
        colour: ink, wobble: 0.16, step: 12, bleed: 0.06, closed: true });
      // Short inset corner marks leave the icon room to breathe.
      g.lineStyle(0.7, ink, 0.28);
      g.lineBetween(-w + 4, -h + 9, -w + 4, -h + 4);
      g.lineBetween(-w + 4, -h + 4, -w + 9, -h + 4);
      g.lineBetween(w - 9, h - 4, w - 4, h - 4);
      g.lineBetween(w - 4, h - 4, w - 4, h - 9);
      drawIcon(g, icon, active || hot ? PIGMENT.sonDeep : PIGMENT.muc);
      g.translateCanvas(-ax, -ay - (state === 'pressed' ? 1 : 0));
    }, { pool: 'ui' }));
  const surface = placeStamp(scene, stamps[0], 0, 0);
  const hit = scene.add.rectangle(0, 0, hitWidth, 44, 0xffffff, 0.001)
    .setInteractive({ useHandCursor: true }).setName('control-hit');
  root.add([surface, hit]);
  markControlBorn(hit);

  let hovered = false;
  let firedAt = Number.NEGATIVE_INFINITY;
  let hint: Phaser.GameObjects.Container | undefined;
  let hintDelay: Phaser.Time.TimerEvent | undefined;
  const hideHint = (): void => { hintDelay?.remove(); hintDelay = undefined; hint?.setVisible(false); };
  const showHint = (): void => {
    if (!hint) {
      const text = cachedText(scene, 9, 6, label, {
        fontFamily: UI_FONT, fontSize: '11px', color: '#f3ecd8', padding: { top: 1, bottom: 1 },
      });
      const hw = text.width + 18, hh = text.height + 12;
      hint = scene.add.container(hintSide === 'left' ? -width / 2 - hw - 10 : width / 2 - hw,
        hintSide === 'left' ? -hh / 2 : hintSide === 'below' ? height / 2 + 9 : -height / 2 - hh - 9)
        .setName('control-hint');
      hint.add([scene.add.rectangle(0, 0, hw, hh, PIGMENT.muc, 0.97).setOrigin(0), text]);
      root.add(hint);
    }
    hint.setVisible(true);
  };
  hit.on('pointerover', (p: Phaser.Input.Pointer) => {
    if (p.wasTouch || p.isDown) return;
    hovered = true;
    applyStamp(surface, stamps[1]);
    hintDelay = scene.time.delayedCall(350, showHint);
  });
  hit.on('pointerout', () => {
    hovered = false;
    hideHint();
    applyStamp(surface, stamps[0]);
  });
  hit.on('pointerdown', (p: Phaser.Input.Pointer, _lx: number, _ly: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    hideHint();
    const now = p.downTime || performance.now();
    if (now - firedAt < 120 || pressIsEchoOnto(hit, p)) return;
    firedAt = now;
    applyStamp(surface, stamps[2]);
    noteControlFired(p);
    soundDirector.tap();
    onClick();
  });
  // Chrome acts once on the press. A release or a drag onto a control cannot trigger another action.
  hit.on('pointerup', (p: Phaser.Input.Pointer, _lx: number, _ly: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    applyStamp(surface, stamps[hovered && !p.wasTouch ? 1 : 0]);
  });
  root.once('destroy', hideHint);
  return root;
}

export function mapControlLabel(icon: 'zoom-in' | 'zoom-out' | 'mode', terrain: boolean): string {
  return t(icon === 'zoom-in' ? 'action.zoomIn' : icon === 'zoom-out' ? 'action.zoomOut'
    : terrain ? 'action.showTerritories' : 'action.showTerrain');
}

function drawIcon(g: Phaser.GameObjects.Graphics, icon: GameplayControlIcon, ink: number): void {
  g.lineStyle(1.8, ink, 0.94);
  g.fillStyle(ink, 0.94);
  if (icon === 'zoom-in' || icon === 'zoom-out') {
    g.lineBetween(-7, 0, 7, 0);
    if (icon === 'zoom-in') g.lineBetween(0, -7, 0, 7);
  } else if (icon === 'play') {
    g.fillTriangle(-4.5, -7, 7, 0, -4.5, 7);
  } else if (icon === 'pause') {
    g.fillRect(-6, -7, 3.5, 14);
    g.fillRect(2.5, -7, 3.5, 14);
  } else if (icon === 'menu') {
    g.lineBetween(-7, -5, 7, -5);
    g.lineBetween(-7, 0, 7, 0);
    g.lineBetween(-7, 5, 7, 5);
  } else if (icon === 'territory') {
    const panels = [
      [{ x: -9, y: -6 }, { x: -3, y: -8 }, { x: -3, y: 6 }, { x: -9, y: 8 }],
      [{ x: -3, y: -8 }, { x: 3, y: -6 }, { x: 3, y: 8 }, { x: -3, y: 6 }],
      [{ x: 3, y: -6 }, { x: 9, y: -8 }, { x: 9, y: 6 }, { x: 3, y: 8 }],
    ];
    panels.forEach((panel, i) => {
      g.fillStyle([PIGMENT.tram, PIGMENT.diepDeep, PIGMENT.sonPale][i], 0.68);
      g.fillPoints(panel, true);
      g.lineStyle(1, ink, 0.85);
      g.strokePoints(panel, true);
    });
  } else {
    g.fillStyle(PIGMENT.tram, 0.45);
    g.fillTriangle(-9, 5, -2, -7, 5, 5);
    g.strokePoints([{ x: -9, y: 5 }, { x: -2, y: -7 }, { x: 5, y: 5 }]);
    g.strokePoints([{ x: 2, y: 0 }, { x: 5, y: -4 }, { x: 10, y: 5 }]);
    g.lineStyle(1.2, PIGMENT.cham, 0.9);
    g.lineBetween(-8, 8, 8, 8);
  }
}
