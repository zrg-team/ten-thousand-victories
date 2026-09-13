/**
 * The trailer, played over the game.
 *
 * A DOM overlay with the browser's own `<video>`, not a Phaser object. The film is sixty-eight
 * seconds of real footage and the browser decodes it on its media pipeline; drawn through the
 * canvas it would be a texture re-uploaded every frame on the one screen the game never needs to
 * render. The overlay also takes every press itself, so nothing reaches the menu behind it — the
 * press-through this game has been caught by twice is a Phaser hit list problem, and there is no
 * Phaser object here to be hit.
 *
 * Four cuts, chosen once on open: the vertical film on the phone column and the landscape one on
 * the desktop sheet, each lettered in the game's language. The files live in `public/trailers/`
 * and stream from the page's own origin. A native shell build does not carry them (seventy
 * megabytes the app would have to install for a film a player may never open — `vite.config.ts`
 * strips the folder), so a shell streams the same file from the published site instead.
 *
 * The game's own sound holds while it plays (`SoundDirector.setHushed`) and picks up where it
 * stopped when the overlay closes.
 */
import { getLanguage, t } from '../i18n';
import { isDesktopLayout } from '../platform/layout';
import { isShellBuild } from '../platform/shell';
import { soundDirector } from './sound/SoundDirector';

const OVERLAY_ID = 'trailer-overlay';

/** The file this device should play: its layout's cut, in the game's language. */
export function trailerUrl(): string {
  const cut = isDesktopLayout() ? 'Desktop' : 'Mobile';
  const file = `${cut}${getLanguage() === 'vi' ? '-vi' : ''}.mp4`;
  const base = isShellBuild() ? __SITE_URL__ : import.meta.env.BASE_URL;
  return `${base}trailers/${file}`;
}

export function isTrailerOpen(): boolean {
  return typeof document !== 'undefined' && document.getElementById(OVERLAY_ID) !== null;
}

/** Opens the trailer over everything and starts it. A second call while it is open does nothing. */
export function openTrailer(): void {
  if (typeof document === 'undefined' || isTrailerOpen()) return;
  const desktop = isDesktopLayout();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('menu.trailer.title'));
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // The paper's ink, not black: the film is a Đông Hồ sheet and a black room around it reads as
    // a different app. Deep enough that the menu behind it is gone.
    background: 'rgba(33, 26, 18, 0.94)',
    padding: desktop ? '48px 64px' : '44px 0 56px',
    boxSizing: 'border-box',
    touchAction: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  const video = document.createElement('video');
  video.src = trailerUrl();
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  Object.assign(video.style, {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '100%',
    width: desktop ? '100%' : 'auto',
    height: desktop ? 'auto' : '100%',
    aspectRatio: desktop ? '16 / 9' : '9 / 16',
    objectFit: 'contain',
    background: '#000',
    borderRadius: desktop ? '6px' : '0',
    boxShadow: '0 12px 48px rgba(0, 0, 0, 0.45)',
  } satisfies Partial<CSSStyleDeclaration>);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '✕';
  close.setAttribute('aria-label', t('menu.trailer.close'));
  Object.assign(close.style, {
    position: 'absolute',
    top: desktop ? '14px' : '8px',
    right: desktop ? '18px' : '10px',
    width: '40px',
    height: '40px',
    border: '1.5px solid #e9dfc2',
    borderRadius: '50%',
    background: 'rgba(33, 26, 18, 0.6)',
    color: '#f3ecd8',
    fontSize: '18px',
    lineHeight: '1',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);

  // A file that will not play (a codec this browser lacks, no network in a shell) says so rather
  // than leaving a black box with a spinner.
  const failed = document.createElement('p');
  failed.textContent = t('menu.trailer.failed');
  failed.hidden = true;
  Object.assign(failed.style, {
    position: 'absolute',
    left: '24px',
    right: '24px',
    bottom: '18px',
    margin: '0',
    color: '#f3ecd8',
    font: '14px/1.4 "Be Vietnam Pro", system-ui, sans-serif',
    textAlign: 'center',
  } satisfies Partial<CSSStyleDeclaration>);
  video.addEventListener('error', () => { failed.hidden = false; });

  const shut = (): void => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    overlay.remove();
    window.removeEventListener('keydown', onKey, true);
    soundDirector.setHushed(false);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      shut();
    }
  };
  close.addEventListener('click', shut);
  // A press on the dark around the film closes it; a press on the film is the film's.
  overlay.addEventListener('click', (event) => { if (event.target === overlay) shut(); });
  // Every press stops here: the canvas under the overlay must not hear any of them.
  // Mouse events too: Phaser hears a release on `window`, not only on the canvas.
  for (const kind of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel']) {
    overlay.addEventListener(kind, (event) => event.stopPropagation());
  }
  video.addEventListener('ended', shut);
  // Captured, so the game's own Esc handlers (a page's way back) do not also fire.
  window.addEventListener('keydown', onKey, true);

  overlay.append(video, close, failed);
  document.body.append(overlay);
  soundDirector.setHushed(true);
  // `autoplay` alone is refused with sound in some browsers even inside the gesture that opened
  // this; the explicit call carries the gesture, and a refusal leaves the controls up to press.
  void video.play().catch(() => undefined);
}
