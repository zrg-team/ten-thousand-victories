import Phaser from 'phaser';
import { t } from '../i18n';
import { UI_FONT } from './fonts';

type LoadingState = { mode: 'loading'; scene: string; progress: number };
let active: LoadingState | undefined;
export const pageLoadingState = (): LoadingState | undefined => active;

/** Let the browser paint the loader before a cached scene's synchronous construction. */
class PagePaintFile extends Phaser.Loader.File {
  constructor(private readonly scene: Phaser.Scene) {
    super(scene.load, { type: 'page-paint', key: 'page-paint', cache: false });
  }

  load(): void {
    this.state = Phaser.Loader.FILE_LOADING;
    let frame = 0;
    const cleanup = (): void => {
      cancelAnimationFrame(frame);
      this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.scene.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    // Downloads run alongside these frames; no fixed timeout or minimum display duration.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { cleanup(); this.loader.nextFile(this, true); });
    });
  }
}

/** DOM paper survives scene construction and camera resets, until the first real frame. */
function showLoading(scene: Phaser.Scene): { finish: () => void; cancel: () => void } {
  const state: LoadingState = { mode: 'loading', scene: scene.sys.settings.key, progress: 0 };
  active = state;
  const overlay = document.createElement('div');
  overlay.dataset.pageLoading = state.scene;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-content:center;gap:18px;background:#e9dfc2;color:#493a2b;text-align:center;touch-action:none;';
  overlay.style.fontFamily = UI_FONT;
  const label = document.createElement('div');
  label.setAttribute('role', 'status');
  label.textContent = t('page.loading');
  label.style.cssText = 'font-size:18px;letter-spacing:.04em';
  const progress = document.createElement('progress');
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute('aria-label', t('page.loading'));
  progress.style.cssText = 'width:min(240px,70vw);height:6px;accent-color:#ab3924;';
  overlay.append(label, progress);
  document.body.append(overlay);
  const update = (value: number): void => { state.progress = value; progress.value = value; };
  const cancel = (): void => {
    overlay.remove();
    if (active === state) active = undefined;
    scene.load.off(Phaser.Loader.Events.PROGRESS, update);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cancel);
    scene.events.off(Phaser.Scenes.Events.DESTROY, cancel);
    scene.game.events.off(Phaser.Core.Events.POST_RENDER, cancel);
    scene.game.events.off(Phaser.Core.Events.DESTROY, cancel);
  };
  scene.load.on(Phaser.Loader.Events.PROGRESS, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cancel);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cancel);
  scene.game.events.once(Phaser.Core.Events.DESTROY, cancel);
  return {
    cancel,
    finish: () => {
      update(1);
      label.textContent = t('page.preparing');
      scene.game.events.once(Phaser.Core.Events.POST_RENDER, cancel);
    },
  };
}

/** Call in preload; CREATE fires after the complete subclass create() has returned. */
export function showPageLoading(scene: Phaser.Scene): void {
  const loading = showLoading(scene);
  scene.load.addFile(new PagePaintFile(scene));
  const finish = (): void => { cleanup(); loading.finish(); };
  const cleanup = (): void => {
    scene.events.off(Phaser.Scenes.Events.CREATE, finish);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  };
  scene.events.once(Phaser.Scenes.Events.CREATE, finish);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
}

/** Chapters keep their old page until the new chapter's uncached artwork is ready. */
export function loadPageAssets(scene: Phaser.Scene, queue: () => void, render: () => void): void {
  queue();
  if (scene.load.list.size === 0) { render(); return; }
  const loading = showLoading(scene);
  const enabled = scene.input.enabled;
  scene.input.enabled = false;
  const cleanup = (): void => {
    scene.load.off(Phaser.Loader.Events.COMPLETE, complete);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.input.enabled = enabled;
  };
  const complete = (): void => {
    cleanup();
    try { render(); } finally { loading.finish(); }
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.load.once(Phaser.Loader.Events.COMPLETE, complete);
  scene.load.start();
}
