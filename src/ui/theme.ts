import Phaser from 'phaser';
import { InkUI, INK_UI, INK_UI_HEX, type InkButtonVariant, type InkSurfaceOptions } from './InkUI';
import { UI_FONT } from './fonts';

export const WOOD = {
  light: INK_UI.parchment,
  base: INK_UI.parchmentShade,
  dark: INK_UI.parchmentDark,
  shadow: INK_UI.brush,
  border: INK_UI.brush,
  highlight: INK_UI.goldLight,
  highlightDark: INK_UI.gold,
};

export const LACQUER = {
  red: INK_UI.cinnabar,
  redDark: INK_UI.cinnabarDark,
  redLight: 0xc3503e,
  gold: INK_UI.gold,
  goldLight: INK_UI.goldLight,
};

export const PARCHMENT = {
  fill: INK_UI.parchment,
  fillShade: INK_UI.parchmentShade,
  border: INK_UI.brush,
  accent: INK_UI.cinnabar,
  dark: INK_UI.backgroundInk,
  darkBorder: INK_UI.cinnabar,
};

export type TextVariant =
  | 'header'
  | 'subheader'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'label'
  | 'caption'
  | 'button'
  | 'buttonDark';

export const TEXT_STYLES: Record<TextVariant, Phaser.Types.GameObjects.Text.TextStyle> = {
  header: { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '15px', fontStyle: '700' },
  subheader: { color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '11px', fontStyle: '700' },
  title: { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '22px', fontStyle: '700' },
  subtitle: { color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '12px' },
  body: { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '13px' },
  label: { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '15px', fontStyle: '700' },
  caption: { color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '11px' },
  button: { color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '13px', fontStyle: '700' },
  buttonDark: { color: INK_UI_HEX.lightText, fontFamily: UI_FONT, fontSize: '13px', fontStyle: '700' },
};

export function createLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  variant: TextVariant = 'body',
  overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { ...TEXT_STYLES[variant], ...overrides });
}

export interface PanelOptions extends InkSurfaceOptions {}

export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: PanelOptions = {},
): Phaser.GameObjects.Graphics {
  return new InkUI(scene).panel({ x, y, width, height }, opts);
}

export type WoodButtonVariant = 'wood' | 'dark' | 'highlight';

export interface WoodButtonOptions {
  variant?: WoodButtonVariant;
  fontSize?: string;
  radius?: number;
  extraHitPadding?: number;
}

export function createWoodButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
  opts: WoodButtonOptions = {},
): Phaser.GameObjects.Container {
  return new InkUI(scene).button(
    { x: x - width / 2, y: y - height / 2, width, height },
    label,
    onClick,
    {
      variant: mapButtonVariant(opts.variant),
      fontSize: opts.fontSize,
      radius: opts.radius,
      extraHitPadding: opts.extraHitPadding,
    },
  );
}

function mapButtonVariant(variant: WoodButtonVariant | undefined): InkButtonVariant {
  if (variant === 'highlight') {
    return 'primary';
  }
  // 'dark' is a neutral/dismiss button (Pass, Cancel, unselected tab) — it must read as
  // secondary, NOT as the red 'danger' style, which is reserved for destructive actions
  // (Remove / Destroy / Disband). Keeps the whole button family consistent.
  return 'secondary';
}
