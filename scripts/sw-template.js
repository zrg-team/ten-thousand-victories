/**
 * The service worker — what makes the game playable with the aeroplane switch on.
 *
 * This file is a TEMPLATE. `scripts/build-sw.mjs` walks the finished `dist/` after every build and
 * fills in the three placeholders below, then writes the result to `dist/sw.js`. Editing
 * `dist/sw.js` by hand edits a build artifact; edit this instead.
 *
 * Two decisions worth stating, because both are load-bearing:
 *
 *   · **It never calls `skipWaiting()` on its own.** A new worker installs, fills its cache, and
 *     then sits in `waiting` until the page posts `SKIP_WAITING`. That is what lets the menu say
 *     "new version ready" and hand the player the tap, instead of swapping the app out from under
 *     a run in progress.
 *   · **One cache per version, holding the shell AND its assets.** `index.html` names hashed
 *     chunks; a cache that versioned them separately could serve last week's HTML pointing at
 *     files this week deleted. Sealed together, they cannot disagree.
 */

const VERSION = '__CACHE_VERSION__';
const CACHE = `vanthang-${VERSION}`;

/**
 * The package.json version this worker was built from. The cache VERSION above is a content hash —
 * meaningless to a player — so when the page asks a downloading worker who it is (`GET_VERSION`),
 * this is the number the menu prints: "Downloading version 0.3.1 (current 0.3.0)".
 */
const APP_VERSION = '__APP_VERSION__';

/** The shell. If any one of these fails to cache, the install fails and the old version stays. */
const CRITICAL = __PRECACHE_CRITICAL__;

/**
 * The art. 267 portrait parts and a QR code, fetched by the Phaser loader at runtime rather than
 * named by the HTML — so a single 404 among them must not cost the player their offline copy of
 * the whole game. Cached best-effort, and whatever misses is picked up by the runtime cache on
 * the first online run that draws it.
 */
const OPTIONAL = __PRECACHE_OPTIONAL__;

/** The app shell's URL, and what every navigation is answered with. */
const SHELL = __SHELL_URL__;

/**
 * `ignoreVary` is the difference between an offline game and a blank screen.
 *
 * A module script and a `crossorigin` font preload are both fetched in CORS mode, so they carry an
 * `Origin` header — and a server that answers with `Vary: Origin` (vite preview does; a CDN may)
 * makes `caches.match` refuse a perfectly good entry because the *precache* fetch, which is not
 * CORS, sent no such header. Symptom: 300 files cached, and the bundle and the Vietnamese fonts
 * still fail with ERR_FAILED the moment the network drops. Nothing here is content-negotiated —
 * one URL is one file — so matching on the URL alone is both safe and what was meant.
 */
const MATCH = { cacheName: CACHE, ignoreVary: true };

/**
 * Our own sub-path, computed once. Every request has to be checked against it — on GitHub Pages
 * the scope is one project among many on the same origin — and a cold boot is 303 of them, so
 * recomputing a constant in the handler is 606 URL parses to arrive at the same string.
 */
const SCOPE = new URL('./', self.location.href).pathname;

/**
 * How many art files are fetched at once while installing.
 *
 * Unbounded, the 267 portrait parts go out as a single burst — onto the same connections the page
 * is using, at the exact moment a first-time player is waiting for the 3.4 MB bundle and the
 * fonts. The offline copy is not worth making the first visit feel slow for.
 */
const ART_AT_ONCE = 8;

/** The art pass: best-effort, bounded, and never allowed to fail the install. */
async function cacheArt(cache) {
  let next = 0;
  const pump = async () => {
    while (next < OPTIONAL.length) {
      const url = OPTIONAL[next];
      next += 1;
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch {
        // One missing portrait must not cost the player their offline copy of the whole game.
        // Whatever misses here is picked up by the runtime cache on the first run that draws it.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(ART_AT_ONCE, OPTIONAL.length) }, pump));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `cache: 'reload'` on every request: GitHub Pages serves with `max-age=600`, and without this
    // an install a few minutes after a deploy can seal a stale copy of the shell into a cache
    // named after the new one — a version mismatch with no way to notice it.
    await cache.addAll(CRITICAL.map((url) => new Request(url, { cache: 'reload' })));
    await cacheArt(cache);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (
      name !== CACHE && name.startsWith('vanthang-') ? caches.delete(name) : undefined
    )));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ cache: VERSION, version: APP_VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Outside our own sub-path the worker has no business answering — on GitHub Pages the scope is
  // one project among many on the same origin.
  if (!url.pathname.startsWith(SCOPE)) return;
  // The trailers go straight to the network, untouched. A video is fetched in `Range` pieces: the
  // handler below would try to cache each `206` (the Cache API refuses them) or keep a whole film
  // and answer every later seek from it with the full body, which a player cannot seek through.
  // They are not precached either (`build-sw.mjs`), so there is nothing here to serve offline.
  if (url.pathname.startsWith(`${SCOPE}trailers/`)) return;

  /**
   * Every navigation is the same page. The game is one HTML file and a canvas; there is no route
   * to preserve, and answering from cache is what makes a cold launch work with no network.
   *
   * The privacy policy is the one exception, and it has to be. It is a genuine second document,
   * and its URL is what gets typed into App Store Connect and the Play Console — so it is the one
   * link on this origin a reviewer is certain to open. Without this clause an installed player
   * (or a reviewer who had opened the game first) navigates to `privacy.html` and is served the
   * game instead, which reads as a missing policy rather than as a caching rule.
   *
   * It falls through to the handler below, so it is still answered from the precache and still
   * works with no network.
   */
  if (request.mode === 'navigate' && !url.pathname.endsWith('/privacy.html')) {
    event.respondWith((async () => {
      const cached = await caches.match(SHELL, MATCH);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(SHELL, { ignoreVary: true })) ?? Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, MATCH);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      // Opaque and error responses are not worth keeping: a cached 404 is indistinguishable from
      // a cached asset next time, and it never expires.
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(request, { ignoreVary: true })) ?? Response.error();
    }
  })());
});
