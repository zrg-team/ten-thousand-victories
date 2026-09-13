import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * The cabinet's half of the contract in `apps/README.md`: the `window.__shell` descriptor, built
 * as a string for `injectedJavaScriptBeforeContentLoaded`.
 *
 * A string rather than a `postMessage` after load, and that is not a style choice. `src/main.ts`
 * asks `usesServiceWorker()` at module scope, before Phaser exists — so the descriptor has to be
 * on `window` before the bundle's first line runs, and this prop is the only hook that fires that
 * early. A message sent on `onLoadEnd` arrives several hundred milliseconds too late, and the
 * symptom is a service worker registering inside the app.
 *
 * `ready` posts the bare string `boot:ready`, `applyUpdate` the bare string `update:apply`, and
 * `checkForUpdate` the bare string `update:check`. `App.tsx` compares against exactly those.
 */
export function shellDescriptorScript(): string {
  const descriptor = {
    kind: 'mobile' as const,
    // The two stores' rules differ and one build serves both, so this is the field that decides
    // whether the menu may show a donation link. See `allowsDonationLinks` in the game.
    os: Platform.OS === 'ios' ? ('ios' as const) : ('android' as const),
    /**
     * The resolved config, not `app.json`. The version is supplied by `app.config.js` out of the
     * repository root's `package.json`, so it does not exist in the static file at all — reading
     * it from there would report whatever was last hand-typed, or nothing.
     */
    version: Constants.expoConfig?.version ?? '',
    /**
     * Whether the Settings page may offer "Check for updates". A development build has no update
     * server to ask, and a button that can only ever answer "could not check" is worse than none.
     */
    canCheckForUpdate: Updates.isEnabled,
  };

  // JSON.stringify, not a template literal with the values dropped in: the version string comes
  // from a file and an apostrophe in it would end the statement early and white-screen the game.
  return `
    window.__shell = Object.assign(${JSON.stringify(descriptor)}, {
      checkForUpdate: function () {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage('update:check');
        }
      },
      applyUpdate: function () {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage('update:apply');
        }
      },
      ready: function () {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage('boot:ready');
        }
      }
    });
    true;
  `;
}
