import packageJson from './package.json';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

const homepagePath = (() => {
  if (typeof packageJson.homepage !== 'string' || packageJson.homepage.length === 0) {
    return '/';
  }

  const { pathname } = new URL(packageJson.homepage);
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
})();

/**
 * The site's own address, absolute, for `%SITE_URL%` in index.html.
 *
 * The canonical link and the share card's `og:image` are the only URLs in this project that may
 * not be relative: a crawler unfurling a link has no document to resolve `./share/og-card.jpg`
 * against, and Facebook, X and Slack all drop a relative one without saying so — which is a link
 * preview that silently loses its picture. Absolute means this address, which is already written
 * down once in `homepage` and derived from there by `base` above and by `build-sw.mjs`. Writing it
 * out a fourth time by hand is how a moved site ships a card pointing at where it used to live.
 */
const siteUrl = (() => {
  if (typeof packageJson.homepage !== 'string' || packageJson.homepage.length === 0) {
    return '/';
  }
  return packageJson.homepage.endsWith('/') ? packageJson.homepage : `${packageJson.homepage}/`;
})();

/**
 * What the settings page prints under "Version".
 *
 * `package.json` is the headline and the thing to bump. The other two exist because it alone
 * cannot answer "which build have you got?" — it moves once a month and every deploy in between
 * wears the same number. So: the commit count, which is a number a player can read out and which
 * only ever goes up, and the date of that commit.
 *
 * The COMMIT's date, deliberately, not the build clock. A build stamp would change on every
 * rebuild of the same source, which changes the bundle, which changes the service worker's content
 * hash — and the player is told there is a new version of code identical to the one they are
 * running. Keyed to the commit, rebuilding the same commit is byte-identical all the way down.
 *
 * Both are empty when git is not available (a source tarball); the settings line simply leaves out
 * the parts it does not have.
 */
const fromGit = (command: string): string => {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
// The deploy workflow checks out with `fetch-depth: 0` for this — the default shallow clone has
// one commit in it and would report every build as build 1.
const buildNumber = fromGit('git rev-list --count HEAD');
const buildDate = fromGit('git log -1 --format=%cs');

export default defineConfig(({ command, isPreview, mode }) => {
  /**
   * `vite build --mode shell` — the one build every cabinet in `apps/` serves.
   *
   * `--mode` rather than an environment variable because this repo is developed on Windows, where
   * `VITE_SHELL=1 vite build` is not a thing any shell there understands and the fix would be a
   * `cross-env` dependency for one flag.
   *
   * Two differences from the web build, and they are the whole of it: a relative `base`, because
   * the shell serves this folder from its own root and a repository sub-path baked into the bundle
   * URL points at nothing there; and `__SHELL_BUILD__`, which `src/platform/shell.ts` reads. The
   * service worker is not disabled here — it is simply never built, because `build:shell` does not
   * run `scripts/build-sw.mjs`.
   */
  const shell = mode === 'shell';

  return {
    // `vite preview` runs with `command === 'serve'`, so a plain `command === 'build'` test served
    // the built app from `/` while its own index.html pointed every asset at `/ten-thousand-victories/`:
    // a preview that 404'd its own bundle and fell through to the SPA fallback, which is not a
    // preview of anything. `isPreview` is the difference between the two serve modes.
    base: shell ? './' : command === 'build' || isPreview ? homepagePath : '/',
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __BUILD_NUMBER__: JSON.stringify(buildNumber),
      __BUILD_DATE__: JSON.stringify(buildDate),
      __SHELL_BUILD__: JSON.stringify(shell),
      __SITE_URL__: JSON.stringify(siteUrl),
    },
    plugins: [
      {
        name: 'van-thang-site-url',
        // `pre`, because vite's own `%KEY%` pass runs after this one and warns about any
        // placeholder it cannot find in the loaded env. By then this one is already a URL.
        transformIndexHtml: {
          order: 'pre',
          handler: (html: string) => html.split('%SITE_URL%').join(siteUrl),
        },
      },
      {
        /**
         * The trailers stay on the web. `public/` is copied whole, and a shell build is zipped into
         * the phone app and copied into the desktop cabinet — seventy megabytes of film every install
         * would carry for a button a player may never press. The shell streams the same files from
         * the published site instead (`src/ui/trailerPlayer.ts`).
         */
        /**
         * Which game a shell build is, readable without running it.
         *
         * The desktop cabinet updates the game it serves by downloading a newer shell build
         * (`apps/desktop/updater.js`), and it has to compare the build it holds against the one
         * published before it can say "newer". The numbers are the bundle's own — the same three
         * `define` bakes in above — so the file and the version line can never disagree.
         */
        name: 'van-thang-shell-version',
        apply: 'build',
        generateBundle() {
          if (!shell) return;
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: `${JSON.stringify({ version: packageJson.version, build: buildNumber, date: buildDate }, null, 2)}\n`,
          });
        },
      },
      {
        name: 'van-thang-shell-without-trailers',
        apply: 'build',
        closeBundle() {
          if (shell) rmSync(join('dist-shell', 'trailers'), { recursive: true, force: true });
        },
      },
    ],
    publicDir: 'public',
    build: {
      copyPublicDir: true,
      // Beside `dist/`, never on top of it. The two builds differ in every asset URL, and a shell
      // build that overwrote the web one would be deployed to Pages by the next push.
      outDir: shell ? 'dist-shell' : 'dist',
    },
    server: {
      port: 5173,
      // Every harness lives under test_scripts/ and writes to output/; a design note lands in
      // docs/. None of them is imported by the game, and a full reload of every open page each
      // time one is written killed four rendered harness runs in one session ("Execution
      // context was destroyed"). The watcher ignores them; src/ and public/ still hot-reload.
      watch: {
        ignored: ['**/test_scripts/**', '**/docs/**', '**/output/**'],
      },
    },
    preview: {
      port: 4173,
    },
  };
});
