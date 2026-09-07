import Phaser from 'phaser';
import { GAME_HEIGHT, surfaceWidth } from './constants';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { GuideScene } from '../scenes/GuideScene';
import { HistoryScene } from '../scenes/HistoryScene';
import { SettingsScene } from '../scenes/SettingsScene';
import { CabinetScene } from '../scenes/CabinetScene';
import { CampaignScene } from '../scenes/deprecated/CampaignScene';
import { BattleArenaScene } from '../scenes/BattleArenaScene';
import { ConquestScene } from '../scenes/ConquestScene';
import { ConquestUIScene } from '../scenes/ConquestUIScene';
import { MapScene } from '../scenes/MapScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { UIScene } from '../scenes/deprecated/UIScene';
import { renderScale } from './graphicsQuality';

// The scale the buffer BOOTS at. The quality ladder can change the live scale later through
// `applyPendingRenderScale`, which resizes this same FIT-mode surface in place.
const RENDER_SCALE = renderScale();

// Retaining the WebGL drawing buffer forces the browser to preserve the
// framebuffer every frame — a real GPU-bandwidth/memory cost on mobile tiled
// GPUs. The game never reads back canvas pixels, so we only enable it when an
// external screenshot tool explicitly asks via `?capture=1`.
const needsCapture =
  typeof window !== 'undefined' && /[?&]capture=1\b/.test(window.location.search);

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  // The sheet, not the column: on the desktop the world scene fills a surface wider than 390 and
  // the chrome is placed on it by camera viewport — see `constants.surfaceWidth`.
  width: surfaceWidth() * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
  backgroundColor: '#e9dfc2',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // The drawing buffer, in real pixels. Phaser's own `zoom` option cannot do this — it restyles
    // the canvas and leaves the backing store alone — so the game is sized up here and every
    // camera is zoomed by the same factor, which puts scenes back into 390-wide design units. The
    // net effect is that a phone at pixel ratio 3 draws 1170x2532 real pixels instead of drawing
    // 390x844 and letting the browser blow it up on the way to the glass.
    width: surfaceWidth() * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,
  },
  input: {
    activePointers: 3,
    touch: true,
  },
  // FramePacer caps rendering at 60 by default and passes exact elapsed time to the game.
  // Phaser's own limiter stays disabled; manual full-display refresh remains available.
  fps: { min: 2 },
  render: {
    preserveDrawingBuffer: needsCapture,
    powerPreference: 'high-performance',
    roundPixels: true,
    // Curve subdivision floor for every Graphics path. Phaser resolves per-object thresholds as
    // max(object, config), and at render scale 3 the default of 1 tessellates hairline wobble the
    // buffer cannot even show: measured on the revealed map at DSF 3, threshold 2x scale alone
    // cuts indices 24.3k -> 17.9k and vertex upload 334 -> 247 KB with no visible change.
    pathDetailThreshold: 2 * RENDER_SCALE,
  },
  // One full-screen pass that ages the whole frame — world and chrome alike — so the two sit on
  // the same sheet of paper. Phaser 4 has no `pipeline` config key: the render node is registered
  // with the renderer by `applyPaperFX`, which every scene that wants the paper already calls.
  // Registering it here as well (`render.renderNodes`) would be a second source of truth for a
  // thing that must not exist twice.
  // Only index 0 auto-starts; the rest are registered-but-stopped until started by name.
  scene: [BootScene, PreloadScene, MenuScene, GuideScene, HistoryScene, SettingsScene, CabinetScene, CampaignScene, BattleArenaScene, MapScene, UIScene, ConquestScene, ConquestUIScene],
};
