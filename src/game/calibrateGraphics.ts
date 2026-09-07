import Phaser from 'phaser';
import { applyPendingRenderScale, applyRenderScale, getGraphicsMode } from './graphicsQuality';
import { cachedLaunchProfile, highAllowed, percentile, rememberLaunch, selectLaunchProfile, type CalibrationSample, type AutoProfile } from './launchGraphics';
import { qualityLadder } from './qualityLadder';
import { InkUI } from '../ui/InkUI';
import { conquestArtStamp } from '../ui/conquestMapArt';
import { placeStamp } from '../ui/ink/stamp';
import { GAME_HEIGHT, GAME_WIDTH, surfaceWidth } from './constants';
import { t } from '../i18n';

/** A bounded real-render probe after loading, using the map's stamps and mounted list cards. */
export function calibrateGraphics(scene: Phaser.Scene): Promise<void> {
  const query = new URLSearchParams(location.search), ladder = qualityLadder();
  if (!ladder || getGraphicsMode() !== 'auto' || cachedLaunchProfile() || query.has('capture') || query.has('noladder')) return Promise.resolve();
  return new Promise(resolve => {
    const deadline = performance.now() + 2000, allowHigh = highAllowed(scene);
    const profiles: AutoProfile[] = allowHigh ? ['high', 'medium'] : ['medium'];
    const samples: CalibrationSample[] = [];
    let objects: Phaser.GameObjects.GameObject[] = [], moving: Phaser.GameObjects.Image[] = [];
    let phase = 0, phaseStart = 0, last = 0, start = 0, frames = 0, gaps: number[] = [], costs: number[] = [], done = false;
    const clean = () => { for (const object of objects) object.destroy(); objects = []; moving = []; };
    const build = () => {
      clean(); ladder.useAuto(profiles[phase]); applyPendingRenderScale(scene.game); applyRenderScale(scene);
      const before = new Set(scene.children.list), ui = new InkUI(scene);
      const width = surfaceWidth();
      // The probe fills the desktop, rather than inheriting the centred page column.
      scene.cameras.main.setScroll(0, 0);
      scene.add.rectangle(0, 0, width, GAME_HEIGHT, 0xe9dfc2).setOrigin(0);
      const ids = ['flora.tree.spring', 'flora.bamboo.spring', 'flora.banyan.spring', 'flora.areca.spring'];
      // A revealed desktop map at .72 zoom submits about 4,400 scenery images at
      // 1920x1080. The former 390-image probe selected High even when panning
      // that same map could not meet its frame budget. Preserve the art density
      // and relative High/Balanced cost in the launch check.
      const count = Math.ceil(1000 * width / GAME_WIDTH * (profiles[phase] === 'high' ? 1.25 : 1));
      for (let i = 0; i < count; i++) {
        const id = i % 233 === 0 ? 'settlement.village' : i % 31 === 0 ? 'terrain.karst-classic' : ids[i % ids.length];
        const stamp = conquestArtStamp(scene, id);
        if (stamp) moving.push(placeStamp(scene, stamp, 20 + (i * 61) % (width - 30), 40 + (i * 97) % (GAME_HEIGHT - 60), .42));
      }
      // High also keeps settlement/contour paths live. Match the map's approximate
      // non-image geometry (30k indices on High, 10k on Balanced), rather than
      // mistaking an inexpensive atlas-only scene for the complete game.
      const ink = scene.add.graphics();
      const patches = Math.ceil((profiles[phase] === 'high' ? 144 : 48) * width / 1351);
      for (let patch = 0; patch < patches; patch++) {
        const x = 30 + (patch * 113) % (width - 60), y = 40 + (patch * 67) % (GAME_HEIGHT - 80);
        const points = Array.from({ length: 24 }, (_, point) => {
          const angle = point * Math.PI / 12, radius = 23 + (point % 3) * 2;
          return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
        });
        ink.fillStyle(0xe9dfc2, .14).fillPoints(points, true);
        ink.lineStyle(.7, 0x30291d, .06).strokePoints(points, true);
      }
      for (let i = 0; i < 10; i++) ui.card({ x: width - GAME_WIDTH + 28, y: 42 + i * 64, width: GAME_WIDTH - 56, height: 58 },
        { title: i % 2 ? 'Đại Việt · mùa xuân' : 'A country in spring', body: '127 · 60 · 40    Làng, thành, sông, núi' });
      scene.add.text(width / 2, GAME_HEIGHT - 26, t('menu.graphics.checking'), { fontSize: 14, color: '#30291d', backgroundColor: '#e9dfc2', padding: { x: 8, y: 5 } }).setOrigin(.5);
      objects = scene.children.list.filter(object => !before.has(object));
      phaseStart = performance.now(); last = 0; frames = 0; gaps = []; costs = [];
    };
    const save = () => samples.push({ profile: profiles[phase], frames: gaps.length, gapP90: percentile(gaps, .9), workP90: percentile(costs, .9),
      // The probe omits the complete HUD, hit testing, culling and simulation.
      // Reserve 60% of the CPU allowance for those systems instead of spending
      // almost the entire real-game frame budget on the rendering probe alone.
      workScale: 2.5 });
    const finish = () => {
      if (done) return; done = true; clearTimeout(timer);
      scene.game.events.off(Phaser.Core.Events.PRE_STEP, pre); scene.game.events.off(Phaser.Core.Events.POST_RENDER, post);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, finish);
      save(); clean(); const profile = selectLaunchProfile(samples, allowHigh); rememberLaunch(profile, samples);
      ladder.useAuto(profile); applyPendingRenderScale(scene.game); applyRenderScale(scene); ladder.calibration(false); resolve();
    };
    const pre = () => { start = performance.now(); for (let i = 0; i < moving.length; i++) moving[i].x += Math.sin(frames * .05 + i) * .3; };
    const post = () => {
      const now = performance.now(); frames++;
      if (last && frames > 4) { gaps.push(now - last); costs.push(now - start); } last = now;
      if (now >= deadline - 150) { finish(); return; }
      if (now - phaseStart >= 700) {
        if (phase + 1 >= profiles.length) finish(); else { save(); phase++; build(); }
      }
    };
    const timer = setTimeout(finish, 1850);
    ladder.calibration(true); build();
    scene.game.events.on(Phaser.Core.Events.PRE_STEP, pre); scene.game.events.on(Phaser.Core.Events.POST_RENDER, post);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, finish);
  });
}
