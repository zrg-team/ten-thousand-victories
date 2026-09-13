/// <reference types="vite/client" />

/**
 * The build's identity, stamped in by `vite.config.ts` and printed on the settings page.
 * `define`s, not env vars, so they are literals in the bundle and cannot be missing at runtime.
 */
declare const __APP_VERSION__: string;
/** Commits on HEAD — a number that only goes up. Empty when git is unavailable. */
declare const __BUILD_NUMBER__: string;
/** The commit's own date, `YYYY-MM-DD`. Empty when git is unavailable. */
declare const __BUILD_DATE__: string;
/**
 * True in a build made by `vite build --mode shell` — the one every native cabinet in `apps/`
 * serves. Relative asset URLs, no service worker. See `src/platform/shell.ts`.
 */
declare const __SHELL_BUILD__: boolean;
/**
 * The published site, absolute, ending in `/` (`package.json` `homepage`). A shell build reaches
 * files it does not carry — the trailers — from here.
 */
declare const __SITE_URL__: string;
