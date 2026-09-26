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

const VERSION = "638a11d18a87";
const CACHE = `vanthang-${VERSION}`;

/**
 * The package.json version this worker was built from. The cache VERSION above is a content hash —
 * meaningless to a player — so when the page asks a downloading worker who it is (`GET_VERSION`),
 * this is the number the menu prints: "Downloading version 0.3.1 (current 0.3.0)".
 */
const APP_VERSION = "1.1.8";

/** The shell. If any one of these fails to cache, the install fails and the old version stays. */
const CRITICAL = [
  "/ten-thousand-victories/app-emblem.webp",
  "/ten-thousand-victories/apple-touch-icon.png",
  "/ten-thousand-victories/art/atlases/buildings-0.json",
  "/ten-thousand-victories/art/atlases/buildings-0.webp",
  "/ten-thousand-victories/art/atlases/figure-shadows-0.json",
  "/ten-thousand-victories/art/atlases/figure-shadows-0.webp",
  "/ten-thousand-victories/art/atlases/figures-0.json",
  "/ten-thousand-victories/art/atlases/figures-0.webp",
  "/ten-thousand-victories/art/atlases/flora-0.json",
  "/ten-thousand-victories/art/atlases/flora-0.webp",
  "/ten-thousand-victories/art/atlases/flora-dongho-v2.json",
  "/ten-thousand-victories/art/atlases/flora-dongho-v2.webp",
  "/ten-thousand-victories/art/atlases/life-0.json",
  "/ten-thousand-victories/art/atlases/life-0.webp",
  "/ten-thousand-victories/art/atlases/markers-0.json",
  "/ten-thousand-victories/art/atlases/markers-0.webp",
  "/ten-thousand-victories/art/atlases/settlements-0.json",
  "/ten-thousand-victories/art/atlases/settlements-0.webp",
  "/ten-thousand-victories/art/atlases/terrain-0.json",
  "/ten-thousand-victories/art/atlases/terrain-0.webp",
  "/ten-thousand-victories/art/atlases/terrain-olive-v1.json",
  "/ten-thousand-victories/art/atlases/terrain-olive-v1.webp",
  "/ten-thousand-victories/art/battle-royal-commendation-v1.webp",
  "/ten-thousand-victories/art/conquest-capitals-v1/settlement/citadel-dinh.webp",
  "/ten-thousand-victories/art/conquest-capitals-v1/settlement/citadel-tran.webp",
  "/ten-thousand-victories/art/conquest-capitals-v2/settlement/citadel-le.webp",
  "/ten-thousand-victories/art/conquest-capitals-v2/settlement/citadel-ly.webp",
  "/ten-thousand-victories/art/conquest-capitals-v2/settlement/citadel-nguyen.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-basket-walk.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-basket.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-fisher-walk.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-fisher.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-merchant-walk.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-merchant.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-pilgrim-walk.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-pilgrim.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-woodcutter-walk.webp",
  "/ten-thousand-victories/art/conquest-travelers-v1/life/traveler-woodcutter.webp",
  "/ten-thousand-victories/art/conquest-ui-icons/banner-medallions-v1.json",
  "/ten-thousand-victories/art/conquest-ui-icons/banner-medallions-v1.png",
  "/ten-thousand-victories/art/conquest-ui-icons/icons-v5.json",
  "/ten-thousand-victories/art/conquest-ui-icons/icons-v5.png",
  "/ten-thousand-victories/art/conquest-ui-icons/signs-v1.json",
  "/ten-thousand-victories/art/conquest-ui-icons/signs-v1.webp",
  "/ten-thousand-victories/art/ground/dongho-grass-v1.webp",
  "/ten-thousand-victories/art/ground/dongho-grass-v2.webp",
  "/ten-thousand-victories/art/ground/dongho-rice-clumps-v5b.webp",
  "/ten-thousand-victories/art/guide/en/battle-orders.webp",
  "/ten-thousand-victories/art/guide/en/battle-overview.webp",
  "/ten-thousand-victories/art/guide/en/battle-result.webp",
  "/ten-thousand-victories/art/guide/en/conquest-army.webp",
  "/ten-thousand-victories/art/guide/en/conquest-build.webp",
  "/ten-thousand-victories/art/guide/en/conquest-court.webp",
  "/ten-thousand-victories/art/guide/en/conquest-decision.webp",
  "/ten-thousand-victories/art/guide/en/conquest-heroes.webp",
  "/ten-thousand-victories/art/guide/en/conquest-map.webp",
  "/ten-thousand-victories/art/guide/en/conquest-relations.webp",
  "/ten-thousand-victories/art/guide/vi/battle-orders.webp",
  "/ten-thousand-victories/art/guide/vi/battle-overview.webp",
  "/ten-thousand-victories/art/guide/vi/battle-result.webp",
  "/ten-thousand-victories/art/guide/vi/conquest-army.webp",
  "/ten-thousand-victories/art/guide/vi/conquest-build.webp",
  "/ten-thousand-victories/art/guide/vi/conquest-court.webp",
  "/ten-thousand-victories/art/guide/vi/conquest-decision.webp",
  "/ten-thousand-victories/art/guide/vi/conquest-heroes.webp",
  "/ten-thousand-victories/art/guide/vi/conquest-map.webp",
  "/ten-thousand-victories/art/guide/vi/conquest-relations.webp",
  "/ten-thousand-victories/art/hero-frames/ring-t0-v1.png",
  "/ten-thousand-victories/art/hero-frames/ring-t1-v1.png",
  "/ten-thousand-victories/art/hero-frames/ring-t2-v1.png",
  "/ten-thousand-victories/art/hero-frames/ring-t3-v1.png",
  "/ten-thousand-victories/art/life/dongho-butterflies-v1.png",
  "/ten-thousand-victories/art/menu-layer-bamboo-v2.png",
  "/ten-thousand-victories/art/menu-layer-ground-v6.webp",
  "/ten-thousand-victories/art/menu-layer-lotus-v2.png",
  "/ten-thousand-victories/art/menu-layer-mountains-v3.png",
  "/ten-thousand-victories/art/menu-wordmark-dongho-v2.webp",
  "/ten-thousand-victories/art/overture/cloud-1.png",
  "/ten-thousand-victories/art/overture/cloud-2.png",
  "/ten-thousand-victories/art/overture/cloud-3.png",
  "/ten-thousand-victories/art/overture/cloud-4.png",
  "/ten-thousand-victories/art/prompted-ui/card-back.png",
  "/ten-thousand-victories/art/prompted-ui/card-corner-bronze.png",
  "/ten-thousand-victories/art/prompted-ui/card-corner-gold.png",
  "/ten-thousand-victories/art/prompted-ui/card-corner-jade.png",
  "/ten-thousand-victories/art/prompted-ui/card-corner-silver.png",
  "/ten-thousand-victories/art/prompted-ui/coronation-dice.png",
  "/ten-thousand-victories/art/prompted-ui/coronation-section-mark.png",
  "/ten-thousand-victories/art/prompted-ui/coronation-trail-seal.png",
  "/ten-thousand-victories/art/prompted-ui/coronation-wardrobe.png",
  "/ten-thousand-victories/art/prompted-ui/hero-card-corner-bronze.png",
  "/ten-thousand-victories/art/prompted-ui/hero-card-corner-gold.png",
  "/ten-thousand-victories/art/prompted-ui/hero-card-corner-jade.png",
  "/ten-thousand-victories/art/prompted-ui/hero-card-corner-silver.png",
  "/ten-thousand-victories/art/prompted-ui/history-plate-army.png",
  "/ten-thousand-victories/art/prompted-ui/history-plate-dynasties.png",
  "/ten-thousand-victories/art/prompted-ui/history-plate-figures.png",
  "/ten-thousand-victories/art/prompted-ui/history-plate-stories.png",
  "/ten-thousand-victories/art/prompted-ui/history-plate-terms.png",
  "/ten-thousand-victories/art/prompted-ui/history-tab-army.png",
  "/ten-thousand-victories/art/prompted-ui/history-tab-dynasties.png",
  "/ten-thousand-victories/art/prompted-ui/history-tab-figures.png",
  "/ten-thousand-victories/art/prompted-ui/history-tab-stories.png",
  "/ten-thousand-victories/art/prompted-ui/history-tab-terms.png",
  "/ten-thousand-victories/art/prompted-ui/icons.json",
  "/ten-thousand-victories/art/prompted-ui/icons.png",
  "/ten-thousand-victories/art/prompted-ui/office-agent.png",
  "/ten-thousand-victories/art/prompted-ui/office-general.png",
  "/ten-thousand-victories/art/prompted-ui/office-governor.png",
  "/ten-thousand-victories/art/prompted-ui/office-minister.png",
  "/ten-thousand-victories/art/terrain/rice-carved-v1.webp",
  "/ten-thousand-victories/art/terrain/rice-harvest-v1.webp",
  "/ten-thousand-victories/art/terrain/rice-jade-v1.webp",
  "/ten-thousand-victories/assets/index-Dd_4WBqU.js",
  "/ten-thousand-victories/assets/mapPreparation.worker-BZVYw1Ik.js",
  "/ten-thousand-victories/cursor/hand-idle.png",
  "/ten-thousand-victories/cursor/hand-idle@2x.png",
  "/ten-thousand-victories/cursor/hand-press.png",
  "/ten-thousand-victories/cursor/hand-press@2x.png",
  "/ten-thousand-victories/cursor/hand-ready.png",
  "/ten-thousand-victories/cursor/hand-ready@2x.png",
  "/ten-thousand-victories/cursor/source/hand-idle.png",
  "/ten-thousand-victories/cursor/source/hand-press.png",
  "/ten-thousand-victories/cursor/source/hand-ready.png",
  "/ten-thousand-victories/faces-royal/atlas.json",
  "/ten-thousand-victories/faces-royal/atlas.webp",
  "/ten-thousand-victories/favicon-16.png",
  "/ten-thousand-victories/favicon-32.png",
  "/ten-thousand-victories/favicon-48.png",
  "/ten-thousand-victories/favicon-96.png",
  "/ten-thousand-victories/favicon-river-v9-16.png",
  "/ten-thousand-victories/favicon-river-v9-32.png",
  "/ten-thousand-victories/favicon-river-v9-48.png",
  "/ten-thousand-victories/favicon-river-v9-96.png",
  "/ten-thousand-victories/favicon-river-v9.ico",
  "/ten-thousand-victories/favicon.ico",
  "/ten-thousand-victories/favicon.svg",
  "/ten-thousand-victories/fonts/BeVietnamPro-400-latin-ext.woff2",
  "/ten-thousand-victories/fonts/BeVietnamPro-400-latin.woff2",
  "/ten-thousand-victories/fonts/BeVietnamPro-400-vietnamese.woff2",
  "/ten-thousand-victories/fonts/BeVietnamPro-600-latin-ext.woff2",
  "/ten-thousand-victories/fonts/BeVietnamPro-600-latin.woff2",
  "/ten-thousand-victories/fonts/BeVietnamPro-600-vietnamese.woff2",
  "/ten-thousand-victories/fonts/BeVietnamPro-700-latin-ext.woff2",
  "/ten-thousand-victories/fonts/BeVietnamPro-700-latin.woff2",
  "/ten-thousand-victories/fonts/BeVietnamPro-700-vietnamese.woff2",
  "/ten-thousand-victories/fonts/SourceSerif4-600-latin-ext.woff2",
  "/ten-thousand-victories/fonts/SourceSerif4-600-latin.woff2",
  "/ten-thousand-victories/fonts/SourceSerif4-600-vietnamese.woff2",
  "/ten-thousand-victories/fonts/SourceSerif4-700-latin-ext.woff2",
  "/ten-thousand-victories/fonts/SourceSerif4-700-latin.woff2",
  "/ten-thousand-victories/fonts/SourceSerif4-700-vietnamese.woff2",
  "/ten-thousand-victories/fonts/fonts.css",
  "/ten-thousand-victories/icon-192.png",
  "/ten-thousand-victories/icon-512.png",
  "/ten-thousand-victories/icon-maskable-192.png",
  "/ten-thousand-victories/icon-maskable-512.png",
  "/ten-thousand-victories/icon-maskable.svg",
  "/ten-thousand-victories/icon.svg",
  "/ten-thousand-victories/icons/food.svg",
  "/ten-thousand-victories/icons/gold.svg",
  "/ten-thousand-victories/icons/influence.svg",
  "/ten-thousand-victories/icons/manpower.svg",
  "/ten-thousand-victories/icons/stability.svg",
  "/ten-thousand-victories/icons/supplies.svg",
  "/ten-thousand-victories/",
  "/ten-thousand-victories/index.html",
  "/ten-thousand-victories/manifest.webmanifest",
  "/ten-thousand-victories/play/index.html",
  "/ten-thousand-victories/privacy.html",
  "/ten-thousand-victories/ui/dominion-gilded-panel-v2.png",
  "/ten-thousand-victories/ui/dominion-gilded-panel.png",
  "/ten-thousand-victories/ui/menu-ceremonial-parchment.png",
  "/ten-thousand-victories/ui/menu-paper-parchment-v2.png",
];

/**
 * The art. 267 portrait parts and a QR code, fetched by the Phaser loader at runtime rather than
 * named by the HTML — so a single 404 among them must not cost the player their offline copy of
 * the whole game. Cached best-effort, and whatever misses is picked up by the runtime cache on
 * the first online run that draws it.
 */
const OPTIONAL = [
  "/ten-thousand-victories/art/ascent/invasion-medallions/medallion-held.png",
  "/ten-thousand-victories/art/ascent/invasion-medallions/medallion-march.png",
  "/ten-thousand-victories/art/ascent/invasion-medallions/medallion-overrun.png",
  "/ten-thousand-victories/art/ascent/invasion-medallions/medallion-triumph.png",
  "/ten-thousand-victories/art/ascent/phase-prints/le-loi-v1.webp",
  "/ten-thousand-victories/art/ascent/phase-prints/ngo-quyen-v1.webp",
  "/ten-thousand-victories/art/ascent/phase-prints/quang-trung-v1.webp",
  "/ten-thousand-victories/art/ascent/phase-prints/thang-long-v1.webp",
  "/ten-thousand-victories/art/ascent/phase-prints/tran-hung-dao-v1.webp",
  "/ten-thousand-victories/art/ascent/phase-prints/trung-sisters-v1.webp",
  "/ten-thousand-victories/art/ascent/run-over/run-over-defeat.png",
  "/ten-thousand-victories/art/ascent/run-over/run-over-grade-1.png",
  "/ten-thousand-victories/art/ascent/run-over/run-over-grade-3.png",
  "/ten-thousand-victories/art/ascent/run-over/run-over-grade-5.png",
  "/ten-thousand-victories/art/ascent/run-over/run-over-victory.png",
  "/ten-thousand-victories/art/ascent/throne-hall-dongho-v2.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/bamboo-hedge.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/baskets.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/buffalo-byre.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/communal-hall.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/grain-bin.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/haystack.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-barracks.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-communal-hall.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-farm.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-guild.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-harbor.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-market.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-mine.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-tower.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-university.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-wall.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/improvement-workshop.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/kitchen.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/mine-adit.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/mine-bank.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/mine-timbers.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/pagoda-tower.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/spoil-heap.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/swept-yard.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/thatched-house.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/tiled-house.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/village-pond.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/building/well.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/champa/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/dinh/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/le/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ly/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/ming/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyen/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/nguyenLord/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/qing/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/song/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tayson/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/tran/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/trinh/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/levy/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/levy/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/levy/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/levy/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/levy/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/royal/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/royal/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/royal/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/royal/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/royal/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/trained/bow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/trained/mounted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/trained/skirmish.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/trained/spear.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/figure/yuan/trained/sword.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/areca/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/areca/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/areca/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/areca/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/bamboo/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/bamboo/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/bamboo/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/bamboo/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/banana/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/banana/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/banana/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/banana/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/banyan/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/banyan/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/banyan/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/banyan/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/grass/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/grass/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/grass/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/grass/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-jackfruit/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-jackfruit/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-jackfruit/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-jackfruit/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-lychee/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-lychee/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-lychee/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-lychee/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-pomelo/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-pomelo/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-pomelo/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-pomelo/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-silk-cotton/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-silk-cotton/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-silk-cotton/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree-silk-cotton/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree/autumn.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree/spring.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree/summer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/flora/tree/winter.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/autumn-leaf.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/buffalo-rider.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/buffalo-walk.png",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/buffalo.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/calf.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/egret-down.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/egret-up.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/farmer-walk.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/farmer.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/ox-cart-walk.png",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/ox-cart.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/spring-petal.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/traveler-walk.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/traveler.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/life/winter-snow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/acquisition.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/battle.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/build.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/capital-highlight.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/capital-standard.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/destination-standard.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/flag-layered-square.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/flag-ngu-sac.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/flag-red-fringe-yellow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/flag-red-moon.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/flag-yellow-medallion.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/flag-yellow-seal.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/march-dust.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/recruit.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/rival-flag-layered-square.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/rival-flag-ngu-sac.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/rival-flag-red-fringe-yellow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/rival-flag-red-moon.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/rival-flag-yellow-medallion.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/rival-flag-yellow-seal.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/route-brush.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/selection-seal.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/marker/siege.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/settlement/farmstead.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/settlement/hamlet.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/settlement/market-town.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/settlement/mine-camp.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/settlement/shrine-village.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/settlement/village.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-classic-olive.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-classic.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-range.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-seven-spire-olive.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-seven-spire.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-stepped-olive.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-stepped.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-three-spire-olive.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-three-spire.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-tower-olive.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/karst-tower.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/paddy-system-fallow.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/paddy-system-flooded.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/paddy-system-nursery.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/paddy-system-ripe.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/paddy-system-transplanted.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/soft-ridge-olive.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/soft-ridge.webp",
  "/ten-thousand-victories/art/conquest-dongho-v4/terrain/timber-bridge.webp",
  "/ten-thousand-victories/art/conquest-dongho/life/buffalo-walk.webp",
  "/ten-thousand-victories/art/conquest-dongho/life/farmer-walk.webp",
  "/ten-thousand-victories/art/conquest-dongho/life/ox-cart-walk.webp",
  "/ten-thousand-victories/art/conquest-dongho/life/traveler-walk.webp",
  "/ten-thousand-victories/art/story-prints/ba-lan-moi-v1.webp",
  "/ten-thousand-victories/art/story-prints/bach-dang-stakes-v1.webp",
  "/ten-thousand-victories/art/story-prints/bamboo-palisade-v1.webp",
  "/ten-thousand-victories/art/story-prints/banh-chung-v1.webp",
  "/ten-thousand-victories/art/story-prints/binh-trong-v1.webp",
  "/ten-thousand-victories/art/story-prints/bronze-drum-v1.webp",
  "/ten-thousand-victories/art/story-prints/bronze-drums-v1.webp",
  "/ten-thousand-victories/art/story-prints/cam-quan-v1.webp",
  "/ten-thousand-victories/art/story-prints/celestial-granary-v1.webp",
  "/ten-thousand-victories/art/story-prints/chan-lap-v1.webp",
  "/ten-thousand-victories/art/story-prints/che-bong-nga-v1.webp",
  "/ten-thousand-victories/art/story-prints/chep-quoc-su-v1.webp",
  "/ten-thousand-victories/art/story-prints/chi-lang-v1.webp",
  "/ten-thousand-victories/art/story-prints/chieu-doi-do-v1.webp",
  "/ten-thousand-victories/art/story-prints/chieu-hien-v1.webp",
  "/ten-thousand-victories/art/story-prints/chim-ung-v1.webp",
  "/ten-thousand-victories/art/story-prints/chinhphat-hoa-uoc-v1.webp",
  "/ten-thousand-victories/art/story-prints/chinhphat-quy-phuc-v1.webp",
  "/ten-thousand-victories/art/story-prints/chinhphat-thanh-chay-v1.webp",
  "/ten-thousand-victories/art/story-prints/chinhphat-truoc-cong-v1.webp",
  "/ten-thousand-victories/art/story-prints/chinhphat-vay-thanh-v1.webp",
  "/ten-thousand-victories/art/story-prints/chinhphat-xuat-quan-v1.webp",
  "/ten-thousand-victories/art/story-prints/corvee-labour-v1.webp",
  "/ten-thousand-victories/art/story-prints/cua-ai-v1.webp",
  "/ten-thousand-victories/art/story-prints/da-trach-v1.webp",
  "/ten-thousand-victories/art/story-prints/dai-cao-v1.webp",
  "/ten-thousand-victories/art/story-prints/dang-tat-v1.webp",
  "/ten-thousand-victories/art/story-prints/de-dieu-v1.webp",
  "/ten-thousand-victories/art/story-prints/doi-hoang-sa-v1.webp",
  "/ten-thousand-victories/art/story-prints/dragon-standard-v1.webp",
  "/ten-thousand-victories/art/story-prints/duc-tien-v1.webp",
  "/ten-thousand-victories/art/story-prints/earthen-ramparts-v1.webp",
  "/ten-thousand-victories/art/story-prints/feigned-retreat-v1.webp",
  "/ten-thousand-victories/art/story-prints/fire-arrows-v1.webp",
  "/ten-thousand-victories/art/story-prints/giong-ca-nuoc-nuoi-v1.webp",
  "/ten-thousand-victories/art/story-prints/giong-lan-xin-thu-ba-v1.webp",
  "/ten-thousand-victories/art/story-prints/giong-lan-xin-thu-hai-v1.webp",
  "/ten-thousand-victories/art/story-prints/giong-lan-xin-thu-nhat-v1.webp",
  "/ten-thousand-victories/art/story-prints/giong-loi-keu-goi-v1.webp",
  "/ten-thousand-victories/art/story-prints/giong-ra-tran-v1.webp",
  "/ten-thousand-victories/art/story-prints/giong-soc-son-v1.webp",
  "/ten-thousand-victories/art/story-prints/granary-edict-v1.webp",
  "/ten-thousand-victories/art/story-prints/hai-ba-v1.webp",
  "/ten-thousand-victories/art/story-prints/harvest-v1.webp",
  "/ten-thousand-victories/art/story-prints/heavenly-mandate-v1.webp",
  "/ten-thousand-victories/art/story-prints/hich-van-v1.webp",
  "/ten-thousand-victories/art/story-prints/ho-nguyen-trung-v1.webp",
  "/ten-thousand-victories/art/story-prints/hom-thu-v1.webp",
  "/ten-thousand-victories/art/story-prints/iron-levy-v1.webp",
  "/ten-thousand-victories/art/story-prints/khan-hoang-v1.webp",
  "/ten-thousand-victories/art/story-prints/kho-lam-v1.webp",
  "/ten-thousand-victories/art/story-prints/khuc-thua-du-v1.webp",
  "/ten-thousand-victories/art/story-prints/kieu-binh-v1.webp",
  "/ten-thousand-victories/art/story-prints/kieu-cong-tien-v1.webp",
  "/ten-thousand-victories/art/story-prints/la-cay-chu-mat-v1.webp",
  "/ten-thousand-victories/art/story-prints/long-dan-v1.webp",
  "/ten-thousand-victories/art/story-prints/luy-thay-v1.webp",
  "/ten-thousand-victories/art/story-prints/mai-an-tiem-v1.webp",
  "/ten-thousand-victories/art/story-prints/mandarin-academy-v1.webp",
  "/ten-thousand-victories/art/story-prints/mot-thuoc-nui-v1.webp",
  "/ten-thousand-victories/art/story-prints/mountain-pass-v1.webp",
  "/ten-thousand-victories/art/story-prints/muster-v1.webp",
  "/ten-thousand-victories/art/story-prints/nam-quan-v1.webp",
  "/ten-thousand-victories/art/story-prints/nem-dao-v1.webp",
  "/ten-thousand-victories/art/story-prints/nguoi-vang-v1.webp",
  "/ten-thousand-victories/art/story-prints/nhiep-chinh-v1.webp",
  "/ten-thousand-victories/art/story-prints/no-than-v1.webp",
  "/ten-thousand-victories/art/story-prints/petition-v1.webp",
  "/ten-thousand-victories/art/story-prints/pha-cuong-dich-v1.webp",
  "/ten-thousand-victories/art/story-prints/pham-ngu-lao-v1.webp",
  "/ten-thousand-victories/art/story-prints/quan-he-v1.webp",
  "/ten-thousand-victories/art/story-prints/quan-so-v1.webp",
  "/ten-thousand-victories/art/story-prints/rice-tribute-v1.webp",
  "/ten-thousand-victories/art/story-prints/royal-guard-v1.webp",
  "/ten-thousand-victories/art/story-prints/salt-roads-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-border-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-coast-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-court-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-crowd-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-field-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-fire-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-granary-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-march-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-mountain-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-night-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-river-v1.webp",
  "/ten-thousand-victories/art/story-prints/setting-shrine-v1.webp",
  "/ten-thousand-victories/art/story-prints/surveyors-corps-v1.webp",
  "/ten-thousand-victories/art/story-prints/tam-cho-quang-khai-v1.webp",
  "/ten-thousand-victories/art/story-prints/than-toc-v1.webp",
  "/ten-thousand-victories/art/story-prints/that-tram-so-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-caravan-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-courier-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-envoy-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-hostage-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-incident-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-league-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-marriage-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-plague-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-revolt-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-spies-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-their-war-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-trade-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-ultimatum-v1.webp",
  "/ten-thousand-victories/art/story-prints/thienha-whispers-v1.webp",
  "/ten-thousand-victories/art/story-prints/thiet-trieu-v1.webp",
  "/ten-thousand-victories/art/story-prints/tho-ca-v1.webp",
  "/ten-thousand-victories/art/story-prints/tho-gioi-sang-bac-v1.webp",
  "/ten-thousand-victories/art/story-prints/tho-than-v1.webp",
  "/ten-thousand-victories/art/story-prints/thu-do-v1.webp",
  "/ten-thousand-victories/art/story-prints/thuan-thien-v1.webp",
  "/ten-thousand-victories/art/story-prints/thunder-march-v1.webp",
  "/ten-thousand-victories/art/story-prints/tien-phat-v1.webp",
  "/ten-thousand-victories/art/story-prints/tienphat-dong-coc-v1.webp",
  "/ten-thousand-victories/art/story-prints/tienphat-dot-kho-v1.webp",
  "/ten-thousand-victories/art/story-prints/tienphat-lay-thanh-v1.webp",
  "/ten-thousand-victories/art/story-prints/tienphat-sa-lay-v1.webp",
  "/ten-thousand-victories/art/story-prints/tienphat-ve-tay-trang-v1.webp",
  "/ten-thousand-victories/art/story-prints/tran-ich-tac-v1.webp",
  "/ten-thousand-victories/art/story-prints/tue-tinh-v1.webp",
  "/ten-thousand-victories/art/story-prints/twice-born-v1.webp",
  "/ten-thousand-victories/art/story-prints/van-don-v1.webp",
  "/ten-thousand-victories/art/story-prints/van-mieu-v1.webp",
  "/ten-thousand-victories/art/story-prints/village-muster-v1.webp",
  "/ten-thousand-victories/art/story-prints/vua-le-chua-trinh-v1.webp",
  "/ten-thousand-victories/art/story-prints/war-drums-v1.webp",
  "/ten-thousand-victories/audio/ambient/bamboo-forest.mp3",
  "/ten-thousand-victories/audio/ambient/jade-kings-throne.mp3",
  "/ten-thousand-victories/audio/ambient/misty-mountains.mp3",
  "/ten-thousand-victories/audio/battle/juggernaut.mp3",
  "/ten-thousand-victories/audio/battle/legionnaire.mp3",
  "/ten-thousand-victories/audio/battle/song-of-the-forge.mp3",
  "/ten-thousand-victories/audio/battle/terminus.mp3",
  "/ten-thousand-victories/audio/battle/vanguard.mp3",
  "/ten-thousand-victories/faces-dongho-v2/atlas.json",
  "/ten-thousand-victories/faces-dongho-v2/atlas.webp",
  "/ten-thousand-victories/faces/atlas.json",
  "/ten-thousand-victories/faces/atlas.svg",
  "/ten-thousand-victories/faces/badge-bear.svg",
  "/ten-thousand-victories/faces/badge-crane.svg",
  "/ten-thousand-victories/faces/badge-dragon.svg",
  "/ten-thousand-victories/faces/badge-lion.svg",
  "/ten-thousand-victories/faces/badge-peacock.svg",
  "/ten-thousand-victories/faces/badge-pheasant.svg",
  "/ten-thousand-victories/faces/badge-rhino.svg",
  "/ten-thousand-victories/faces/badge-tiger.svg",
  "/ten-thousand-victories/faces/beard-chinstrap.svg",
  "/ten-thousand-victories/faces/beard-forked.svg",
  "/ten-thousand-victories/faces/beard-full-short.svg",
  "/ten-thousand-victories/faces/beard-full.svg",
  "/ten-thousand-victories/faces/beard-goatee-long.svg",
  "/ten-thousand-victories/faces/beard-goatee.svg",
  "/ten-thousand-victories/faces/beard-long.svg",
  "/ten-thousand-victories/faces/beard-moustache-thin.svg",
  "/ten-thousand-victories/faces/beard-moustache-wide.svg",
  "/ten-thousand-victories/faces/beard-moustache.svg",
  "/ten-thousand-victories/faces/beard-patriarch.svg",
  "/ten-thousand-victories/faces/beard-stubble.svg",
  "/ten-thousand-victories/faces/beard-threepart.svg",
  "/ten-thousand-victories/faces/beard-wispy.svg",
  "/ten-thousand-victories/faces/belt-gold.svg",
  "/ten-thousand-victories/faces/belt-jade.svg",
  "/ten-thousand-victories/faces/belt-rope-coil.svg",
  "/ten-thousand-victories/faces/brow-angled.svg",
  "/ten-thousand-victories/faces/brow-arched.svg",
  "/ten-thousand-victories/faces/brow-bushy.svg",
  "/ten-thousand-victories/faces/brow-flat.svg",
  "/ten-thousand-victories/faces/brow-heavy.svg",
  "/ten-thousand-victories/faces/brow-low.svg",
  "/ten-thousand-victories/faces/brow-raised.svg",
  "/ten-thousand-victories/faces/brow-sharp.svg",
  "/ten-thousand-victories/faces/brow-short.svg",
  "/ten-thousand-victories/faces/brow-soft.svg",
  "/ten-thousand-victories/faces/brow-sparse.svg",
  "/ten-thousand-victories/faces/brow-straight.svg",
  "/ten-thousand-victories/faces/brow-thick.svg",
  "/ten-thousand-victories/faces/brow-thin.svg",
  "/ten-thousand-victories/faces/bun-coil.svg",
  "/ten-thousand-victories/faces/bun-double.svg",
  "/ten-thousand-victories/faces/bun-fan-high.svg",
  "/ten-thousand-victories/faces/bun-high.svg",
  "/ten-thousand-victories/faces/bun-low.svg",
  "/ten-thousand-victories/faces/bun-nape-left.svg",
  "/ten-thousand-victories/faces/bun-nape-right.svg",
  "/ten-thousand-victories/faces/bun-side-loops.svg",
  "/ten-thousand-victories/faces/bun-snail-coil.svg",
  "/ten-thousand-victories/faces/bun-tall-fore.svg",
  "/ten-thousand-victories/faces/bun-tran-brush.svg",
  "/ten-thousand-victories/faces/bun-wide.svg",
  "/ten-thousand-victories/faces/bun-wrapped.svg",
  "/ten-thousand-victories/faces/buttons-five.svg",
  "/ten-thousand-victories/faces/buttons-jade.svg",
  "/ten-thousand-victories/faces/buttons-knot.svg",
  "/ten-thousand-victories/faces/collar-baba-front.svg",
  "/ten-thousand-victories/faces/collar-baba.svg",
  "/ten-thousand-victories/faces/collar-band-brocade.svg",
  "/ten-thousand-victories/faces/collar-band-oxblood.svg",
  "/ten-thousand-victories/faces/collar-doikham-over.svg",
  "/ten-thousand-victories/faces/collar-doikham.svg",
  "/ten-thousand-victories/faces/collar-giaolinh-over.svg",
  "/ten-thousand-victories/faces/collar-giaolinh-trim.svg",
  "/ten-thousand-victories/faces/collar-giaolinh-wide-over.svg",
  "/ten-thousand-victories/faces/collar-giaolinh-wide.svg",
  "/ten-thousand-victories/faces/collar-giaolinh.svg",
  "/ten-thousand-victories/faces/collar-nguthan-body.svg",
  "/ten-thousand-victories/faces/collar-nguthan-tall.svg",
  "/ten-thousand-victories/faces/collar-nguthan.svg",
  "/ten-thousand-victories/faces/collar-nhatbinh-phoenix.svg",
  "/ten-thousand-victories/faces/collar-nhatbinh-trim.svg",
  "/ten-thousand-victories/faces/collar-nhatbinh.svg",
  "/ten-thousand-victories/faces/collar-placket-square.svg",
  "/ten-thousand-victories/faces/collar-tuthan-knot.svg",
  "/ten-thousand-victories/faces/collar-tuthan-over.svg",
  "/ten-thousand-victories/faces/collar-tuthan.svg",
  "/ten-thousand-victories/faces/collar-twoflap-over.svg",
  "/ten-thousand-victories/faces/collar-twoflap.svg",
  "/ten-thousand-victories/faces/collar-vienlinh-trim.svg",
  "/ten-thousand-victories/faces/collar-vienlinh.svg",
  "/ten-thousand-victories/faces/collar-yem-wrap.svg",
  "/ten-thousand-victories/faces/earring-drop.svg",
  "/ten-thousand-victories/faces/earring-gold.svg",
  "/ten-thousand-victories/faces/earring-jade.svg",
  "/ten-thousand-victories/faces/earring-pearl.svg",
  "/ten-thousand-victories/faces/ears-long.svg",
  "/ten-thousand-victories/faces/ears-small.svg",
  "/ten-thousand-victories/faces/ears.svg",
  "/ten-thousand-victories/faces/eyes-almond.svg",
  "/ten-thousand-victories/faces/eyes-bright.svg",
  "/ten-thousand-victories/faces/eyes-crescent.svg",
  "/ten-thousand-victories/faces/eyes-deepset.svg",
  "/ten-thousand-victories/faces/eyes-downturned.svg",
  "/ten-thousand-victories/faces/eyes-gentle.svg",
  "/ten-thousand-victories/faces/eyes-hooded.svg",
  "/ten-thousand-victories/faces/eyes-keen.svg",
  "/ten-thousand-victories/faces/eyes-narrow.svg",
  "/ten-thousand-victories/faces/eyes-round.svg",
  "/ten-thousand-victories/faces/eyes-sharp.svg",
  "/ten-thousand-victories/faces/eyes-tired.svg",
  "/ten-thousand-victories/faces/eyes-upturned.svg",
  "/ten-thousand-victories/faces/eyes-wide.svg",
  "/ten-thousand-victories/faces/guard-beastmask.svg",
  "/ten-thousand-victories/faces/guard-shoulder-gilt.svg",
  "/ten-thousand-victories/faces/guard-shoulder.svg",
  "/ten-thousand-victories/faces/hair-braid.svg",
  "/ten-thousand-victories/faces/hair-comb.svg",
  "/ten-thousand-victories/faces/hair-cord.svg",
  "/ten-thousand-victories/faces/hair-cropped.svg",
  "/ten-thousand-victories/faces/hair-crown.svg",
  "/ten-thousand-victories/faces/hair-flower.svg",
  "/ten-thousand-victories/faces/hair-high.svg",
  "/ten-thousand-victories/faces/hair-long-full.svg",
  "/ten-thousand-victories/faces/hair-long-short.svg",
  "/ten-thousand-victories/faces/hair-long.svg",
  "/ten-thousand-victories/faces/hair-low.svg",
  "/ten-thousand-victories/faces/hair-parted.svg",
  "/ten-thousand-victories/faces/hair-peak.svg",
  "/ten-thousand-victories/faces/hair-receding.svg",
  "/ten-thousand-victories/faces/hair-ribbon.svg",
  "/ten-thousand-victories/faces/hair-swept.svg",
  "/ten-thousand-victories/faces/hair-tail.svg",
  "/ten-thousand-victories/faces/hair-thick.svg",
  "/ten-thousand-victories/faces/hair-wavy.svg",
  "/ten-thousand-victories/faces/hair-woman-center.svg",
  "/ten-thousand-victories/faces/hair-woman-loose.svg",
  "/ten-thousand-victories/faces/hair-woman-short.svg",
  "/ten-thousand-victories/faces/hair-woman-temple.svg",
  "/ten-thousand-victories/faces/hair-woman-tran-short.svg",
  "/ten-thousand-victories/faces/hair-woman-wrapped.svg",
  "/ten-thousand-victories/faces/hairpin-jade.svg",
  "/ten-thousand-victories/faces/hairpin-long.svg",
  "/ten-thousand-victories/faces/hairpin-nape-left-jade.svg",
  "/ten-thousand-victories/faces/hairpin-nape-left.svg",
  "/ten-thousand-victories/faces/hairpin-nape-right-jade.svg",
  "/ten-thousand-victories/faces/hairpin-nape-right.svg",
  "/ten-thousand-victories/faces/hairpin-plain.svg",
  "/ten-thousand-victories/faces/hairpin.svg",
  "/ten-thousand-victories/faces/hat-band-cloth.svg",
  "/ten-thousand-victories/faces/hat-band-gold.svg",
  "/ten-thousand-victories/faces/hat-band-warrior.svg",
  "/ten-thousand-victories/faces/hat-band.svg",
  "/ten-thousand-victories/faces/hat-binhdinh.svg",
  "/ten-thousand-victories/faces/hat-coronet-jade.svg",
  "/ten-thousand-victories/faces/hat-coronet.svg",
  "/ten-thousand-victories/faces/hat-crown-nhatbinh.svg",
  "/ten-thousand-victories/faces/hat-crown-phoenix.svg",
  "/ten-thousand-victories/faces/hat-crown-seven.svg",
  "/ten-thousand-victories/faces/hat-dinhtu-streamers.svg",
  "/ten-thousand-victories/faces/hat-dinhtu.svg",
  "/ten-thousand-victories/faces/hat-duongcan.svg",
  "/ten-thousand-victories/faces/hat-fur.svg",
  "/ten-thousand-victories/faces/hat-helm-cheeks.svg",
  "/ten-thousand-victories/faces/hat-helm-crest.svg",
  "/ten-thousand-victories/faces/hat-helm-daumau.svg",
  "/ten-thousand-victories/faces/hat-helm-dinh.svg",
  "/ten-thousand-victories/faces/hat-helm-horned.svg",
  "/ten-thousand-victories/faces/hat-helm-lamellar.svg",
  "/ten-thousand-victories/faces/hat-helm-leather.svg",
  "/ten-thousand-victories/faces/hat-helm-plume.svg",
  "/ten-thousand-victories/faces/hat-helm.svg",
  "/ten-thousand-victories/faces/hat-khandong-gold.svg",
  "/ten-thousand-victories/faces/hat-khandong-jewel.svg",
  "/ten-thousand-victories/faces/hat-khandong.svg",
  "/ten-thousand-victories/faces/hat-khanvan-brown.svg",
  "/ten-thousand-victories/faces/hat-khanvan-indigo.svg",
  "/ten-thousand-victories/faces/hat-khanvan-low.svg",
  "/ten-thousand-victories/faces/hat-khanvan-tall.svg",
  "/ten-thousand-victories/faces/hat-khanvan.svg",
  "/ten-thousand-victories/faces/hat-khanvuong.svg",
  "/ten-thousand-victories/faces/hat-khanxep.svg",
  "/ten-thousand-victories/faces/hat-moqua-brown.svg",
  "/ten-thousand-victories/faces/hat-moqua-tied.svg",
  "/ten-thousand-victories/faces/hat-moqua.svg",
  "/ten-thousand-victories/faces/hat-muni.svg",
  "/ten-thousand-victories/faces/hat-non-batam.svg",
  "/ten-thousand-victories/faces/hat-non-chop.svg",
  "/ten-thousand-victories/faces/hat-non-dau.svg",
  "/ten-thousand-victories/faces/hat-non-quaithao.svg",
  "/ten-thousand-victories/faces/hat-non-worker.svg",
  "/ten-thousand-victories/faces/hat-non.svg",
  "/ten-thousand-victories/faces/hat-osa.svg",
  "/ten-thousand-victories/faces/hat-phocdau-grand.svg",
  "/ten-thousand-victories/faces/hat-phocdau-long.svg",
  "/ten-thousand-victories/faces/hat-phocdau-short.svg",
  "/ten-thousand-victories/faces/hat-tamson.svg",
  "/ten-thousand-victories/faces/hat-vanhday.svg",
  "/ten-thousand-victories/faces/hat-veil.svg",
  "/ten-thousand-victories/faces/hat-xungthien.svg",
  "/ten-thousand-victories/faces/head-angular.svg",
  "/ten-thousand-victories/faces/head-blunt.svg",
  "/ten-thousand-victories/faces/head-broad.svg",
  "/ten-thousand-victories/faces/head-fine.svg",
  "/ten-thousand-victories/faces/head-full.svg",
  "/ten-thousand-victories/faces/head-heart.svg",
  "/ten-thousand-victories/faces/head-long.svg",
  "/ten-thousand-victories/faces/head-narrow.svg",
  "/ten-thousand-victories/faces/head-oval.svg",
  "/ten-thousand-victories/faces/head-round.svg",
  "/ten-thousand-victories/faces/head-slim.svg",
  "/ten-thousand-victories/faces/head-soft.svg",
  "/ten-thousand-victories/faces/head-square.svg",
  "/ten-thousand-victories/faces/head-stern.svg",
  "/ten-thousand-victories/faces/head-tapered.svg",
  "/ten-thousand-victories/faces/head-wide.svg",
  "/ten-thousand-victories/faces/kesa-grey.svg",
  "/ten-thousand-victories/faces/kesa-patches.svg",
  "/ten-thousand-victories/faces/kesa-red.svg",
  "/ten-thousand-victories/faces/kesa.svg",
  "/ten-thousand-victories/faces/knot-nape.svg",
  "/ten-thousand-victories/faces/mark-age-deep.svg",
  "/ten-thousand-victories/faces/mark-age.svg",
  "/ten-thousand-victories/faces/mark-brand.svg",
  "/ten-thousand-victories/faces/mark-dimples.svg",
  "/ten-thousand-victories/faces/mark-freckles.svg",
  "/ten-thousand-victories/faces/mark-mole.svg",
  "/ten-thousand-victories/faces/mark-scar-brow.svg",
  "/ten-thousand-victories/faces/mark-scar-cheek.svg",
  "/ten-thousand-victories/faces/mark-scar.svg",
  "/ten-thousand-victories/faces/mark-tattoo-court.svg",
  "/ten-thousand-victories/faces/mark-tattoo-drum.svg",
  "/ten-thousand-victories/faces/mark-tattoo-wave.svg",
  "/ten-thousand-victories/faces/mark-tattoo.svg",
  "/ten-thousand-victories/faces/mark-warpaint.svg",
  "/ten-thousand-victories/faces/mouth-betel.svg",
  "/ten-thousand-victories/faces/mouth-broad-smile.svg",
  "/ten-thousand-victories/faces/mouth-downturned.svg",
  "/ten-thousand-victories/faces/mouth-firm.svg",
  "/ten-thousand-victories/faces/mouth-full.svg",
  "/ten-thousand-victories/faces/mouth-grim.svg",
  "/ten-thousand-victories/faces/mouth-lacquered-firm.svg",
  "/ten-thousand-victories/faces/mouth-lacquered-smile.svg",
  "/ten-thousand-victories/faces/mouth-lacquered.svg",
  "/ten-thousand-victories/faces/mouth-neutral.svg",
  "/ten-thousand-victories/faces/mouth-pursed.svg",
  "/ten-thousand-victories/faces/mouth-small.svg",
  "/ten-thousand-victories/faces/mouth-smile.svg",
  "/ten-thousand-victories/faces/mouth-soft.svg",
  "/ten-thousand-victories/faces/mouth-thin.svg",
  "/ten-thousand-victories/faces/mouth-wide.svg",
  "/ten-thousand-victories/faces/neck-broad.svg",
  "/ten-thousand-victories/faces/neck-slim.svg",
  "/ten-thousand-victories/faces/neck.svg",
  "/ten-thousand-victories/faces/nose-aquiline.svg",
  "/ten-thousand-victories/faces/nose-broad.svg",
  "/ten-thousand-victories/faces/nose-fine.svg",
  "/ten-thousand-victories/faces/nose-flat.svg",
  "/ten-thousand-victories/faces/nose-long.svg",
  "/ten-thousand-victories/faces/nose-narrow.svg",
  "/ten-thousand-victories/faces/nose-round.svg",
  "/ten-thousand-victories/faces/nose-short.svg",
  "/ten-thousand-victories/faces/nose-snub.svg",
  "/ten-thousand-victories/faces/nose-soft.svg",
  "/ten-thousand-victories/faces/nose-straight.svg",
  "/ten-thousand-victories/faces/nose-strong.svg",
  "/ten-thousand-victories/faces/plate-common.svg",
  "/ten-thousand-victories/faces/plate-epic.svg",
  "/ten-thousand-victories/faces/plate-legendary.svg",
  "/ten-thousand-victories/faces/plate-rare.svg",
  "/ten-thousand-victories/faces/rank-epic.svg",
  "/ten-thousand-victories/faces/rank-legendary.svg",
  "/ten-thousand-victories/faces/rank-rare.svg",
  "/ten-thousand-victories/faces/robe-armour-brigandine.svg",
  "/ten-thousand-victories/faces/robe-armour-fanscale.svg",
  "/ten-thousand-victories/faces/robe-armour-lamellar.svg",
  "/ten-thousand-victories/faces/robe-armour-leather.svg",
  "/ten-thousand-victories/faces/robe-armour-scale.svg",
  "/ten-thousand-victories/faces/robe-armour.svg",
  "/ten-thousand-victories/faces/robe-body.svg",
  "/ten-thousand-victories/faces/robe-broad.svg",
  "/ten-thousand-victories/faces/robe-hem-dark.svg",
  "/ten-thousand-victories/faces/robe-hem-gold.svg",
  "/ten-thousand-victories/faces/robe-sheen-soft.svg",
  "/ten-thousand-victories/faces/robe-sheen.svg",
  "/ten-thousand-victories/faces/robe-slim.svg",
  "/ten-thousand-victories/faces/robe-sloped.svg",
  "/ten-thousand-victories/faces/robe-square.svg",
  "/ten-thousand-victories/faces/sash-baldric-red.svg",
  "/ten-thousand-victories/faces/sash-baldric.svg",
  "/ten-thousand-victories/faces/sash-cord.svg",
  "/ten-thousand-victories/faces/sash-ochre.svg",
  "/ten-thousand-victories/faces/sash-silk.svg",
  "/ten-thousand-victories/faces/sash-waist-red.svg",
  "/ten-thousand-victories/faces/sash-waist.svg",
  "/ten-thousand-victories/faces/scalp-dots-nine.svg",
  "/ten-thousand-victories/faces/scalp-dots.svg",
  "/ten-thousand-victories/faces/scalp-shaven.svg",
  "/ten-thousand-victories/faces/topknot-side.svg",
  "/ten-thousand-victories/faces/topknot-small.svg",
  "/ten-thousand-victories/faces/topknot-tall.svg",
  "/ten-thousand-victories/faces/topknot-wrapped.svg",
  "/ten-thousand-victories/faces/topknot.svg",
  "/ten-thousand-victories/faces/yem-cream.svg",
  "/ten-thousand-victories/faces/yem-indigo.svg",
  "/ten-thousand-victories/faces/yem-jade.svg",
  "/ten-thousand-victories/faces/yem.svg",
  "/ten-thousand-victories/support/momo-qr.webp",
  "/ten-thousand-victories/support/qr-wise.png",
];

/**
 * Bytes on disk per precached URL, and their sum — what the page's progress bar is measured in.
 * Sizes rather than a file count: the bundle is 3.4 MB and a portrait part is 2 kB, and a bar that
 * counted files would sit at 1% through the only download that takes time and then leap.
 */
const SIZES = new Map([
  ...CRITICAL.map((url, index) => [url, [97904,65793,5531,3323222,70695,86470,38554,2741132,7771,845550,7784,920554,3073,1188724,4485,277352,2208,2570546,2630,2193136,2634,1808648,264110,336042,301500,261406,247606,257712,748642,196608,877472,231860,668656,173390,731282,195082,774250,209764,1646,316091,22297,798501,5869,288076,261382,231978,128136,22988,83574,30048,48034,28306,46354,82894,34348,99250,41696,25984,84006,32014,51654,30290,46116,89996,33682,99700,42204,36085,38027,38810,46072,22180,1262266,1412134,486145,1135952,24754,712375,609526,809968,975820,939659,17821,15307,22526,10520,46427,30115,33118,56267,17804,19978,19991,17436,169205,1038577,620679,827820,585715,42613,47918,15273,40868,26235,4945,145636,30760,27087,39646,21150,95020,92070,79632,7156345,5092,1563,4835,1663,5290,1515,4644,57929,62111,54907,18924,3105634,996,2979,5804,19903,996,2979,5804,19903,9833,9833,26715,13056,21168,11532,13608,22032,12176,13852,22152,12468,42040,50824,13448,42040,50824,13448,5891,73724,455886,30382,189414,252727,608023,472,327,334,372,338,410,44930,44930,921,24814,9468,1009367,2063592,1425695,2038917][index] || 0]),
  ...OPTIONAL.map((url, index) => [url, [78754,79462,81618,76119,261728,273976,271932,257708,287404,280158,350612,24160,33229,35404,665938,179132,59358,101910,132578,106480,105278,115040,152206,165334,111334,165462,115110,148938,136328,101390,160332,120774,170214,116540,125920,132794,121616,41746,116162,47950,127214,111684,59776,105784,15966,21882,15966,15886,17962,16946,20686,16946,17226,17200,15110,19346,15110,15222,15678,15068,20042,15068,15034,16834,15448,20616,15448,16756,17170,15826,20592,15826,15580,17296,13698,20694,13698,14392,16222,14050,19518,14050,15124,15778,13596,20302,13596,14266,15580,15210,21198,15210,15370,16500,15728,20486,15728,15686,15038,15278,20438,15278,14882,15414,14578,20742,14578,15170,16964,16114,22126,16114,17736,18698,16396,21414,16396,16794,17862,14496,20358,14496,15136,16926,14846,20274,14846,15894,17194,14442,20150,14442,15336,16652,14600,20942,14600,15648,17254,14696,21512,14696,16002,16876,14442,21158,14442,16050,17248,14058,19834,14058,15118,16630,15388,20140,15388,17140,17726,13524,19510,13524,14838,15696,16948,20776,16948,15680,17004,16908,20372,16908,16902,17378,16608,20442,16608,16060,16880,14422,21240,14422,15590,16590,14456,20982,14456,16588,16852,14588,20520,14588,15868,16692,15966,19770,15966,15364,16312,14858,18746,14858,14706,14786,15412,19426,15412,14580,15338,15416,20558,15416,15692,17330,14172,19696,14172,14816,15730,15330,20702,15330,16302,17922,16738,21104,16738,16062,18242,17352,20262,17352,17052,17296,16648,20344,16648,15758,17072,11806,11620,11532,11118,14118,14150,13772,11534,19526,16392,19256,18330,28260,25872,27804,28170,13456,10708,11984,13786,29526,29028,29448,27312,33250,31016,32494,30788,33458,31600,32772,30894,31076,30646,29806,29318,34508,33494,30848,30760,5794,19284,1018815,18520,18642,29852,23588,768230,15596,1163512,20498,6156,782100,17208,7272,17350,19066,18472,14000,9364,8800,9634,9680,9720,9414,9412,9244,15484,17524,9562,9940,9400,9532,9236,8888,17932,17796,18200,148266,174820,211720,207178,184554,200846,44788,37032,30200,42968,35024,41288,34994,38282,29810,42344,33924,282928,270132,269078,289562,276326,29968,27086,83446,1149904,1019136,1152636,824748,94472,78740,72508,90266,58316,69402,56586,78480,74328,81088,63094,83160,90788,73700,66596,88764,51794,51024,68014,59216,55314,69670,62400,81268,97974,63036,73604,79706,96156,61620,69948,75012,70776,64022,94188,89020,81508,92034,82486,82122,78794,71212,65790,148048,73182,69080,85476,84804,68040,102798,69340,75574,92054,79470,87494,76020,73158,94854,66666,86874,83150,145890,94340,85734,92122,87078,72270,126600,63020,89452,87240,69210,65932,74454,73898,124762,143054,103234,126290,127260,116088,133122,130194,132860,122878,132428,118200,83146,85062,66980,86204,67536,62826,58088,59698,66924,54260,66310,67594,68616,41920,58046,58900,55208,54292,82462,67710,86838,77848,61902,78386,62434,70196,58826,55866,65568,56264,69362,84484,88448,59888,75600,82422,78050,80190,67852,630288,660312,660312,1332504,1104408,1235520,1580904,1407456,100977,2593560,100964,215407,391,420,337,432,467,334,343,396,186,315,187,184,154,154,236,169,155,154,247,188,362,254,582,582,708,405,403,401,403,397,399,399,403,429,401,401,423,425,397,257,211,319,151,150,251,246,391,350,209,321,150,249,330,330,388,156,159,257,243,149,155,152,189,152,153,153,169,159,159,244,483,227,469,167,156,163,150,153,184,182,183,315,258,186,186,215,219,217,707,837,827,865,711,839,751,833,719,805,871,777,717,839,1546,281,266,545,402,187,189,189,540,189,376,374,376,189,286,189,189,257,189,270,189,305,349,715,695,575,317,502,213,237,236,236,232,232,234,159,248,213,301,245,328,239,239,342,397,591,891,619,244,882,381,345,362,780,360,571,311,379,351,361,361,315,776,776,553,1235,776,273,542,224,317,224,190,299,255,229,341,486,255,248,462,396,394,310,840,204,455,390,373,367,384,455,457,418,354,361,386,451,389,371,373,431,382,169,219,169,169,256,436,375,187,200,467,151,169,170,172,186,257,213,205,189,265,192,192,195,191,199,269,269,271,189,196,192,195,197,197,196,208,206,210,237,237,234,237,254,252,235,234,252,233,235,236,277,277,277,277,322,401,243,1338,5816,2932,298,3846,287,178,180,152,165,171,169,178,178,180,155,155,235,157,185,157,157,646,270,203,185,151,151,247,150,273,273,273,273,62968,5413][index] || 0]),
]);
const TOTAL_BYTES = [...SIZES.values()].reduce((sum, size) => sum + size, 0);

/** The app shell's URL, and what every navigation is answered with. */
const SHELL = "/ten-thousand-victories/";

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

/**
 * How far this worker's install has got, in bytes, told to every open page.
 *
 * Pages hear it as `INSTALL_PROGRESS` on `navigator.serviceWorker` (`src/pwa/updates.ts`) and draw
 * it under the Downloading version line. Throttled to whole percents: a message per network chunk is a
 * few thousand posts to say the same number, and each one wakes every tab on the origin.
 */
let doneBytes = 0;
let toldPercent = -1;

function progressMessage() {
  return { type: 'INSTALL_PROGRESS', cache: VERSION, version: APP_VERSION, done: Math.min(doneBytes, TOTAL_BYTES), total: TOTAL_BYTES };
}

function addProgress(bytes) {
  doneBytes += bytes;
  const percent = TOTAL_BYTES > 0 ? Math.floor((Math.min(doneBytes, TOTAL_BYTES) / TOTAL_BYTES) * 100) : 100;
  if (percent === toldPercent) return;
  toldPercent = percent;
  const message = progressMessage();
  // Uncontrolled too: a first visit's page is not controlled by anything yet, and it is still the
  // page that wants to know. A post that fails is a bar that lags, never an install that fails.
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => { for (const client of clients) client.postMessage(message); })
    .catch(() => undefined);
}

/**
 * The shell: every file fetched, then every file stored, so one failure still fails the install
 * and keeps the old version — what `cache.addAll` promised. Fetched by hand rather than through
 * `addAll` only so the bytes can be counted as they arrive: a copy of each body is read while the
 * original waits for `put`.
 */
async function cacheShell(cache) {
  const fetched = await Promise.all(CRITICAL.map(async (url) => {
    const request = new Request(url, { cache: 'reload' });
    const response = await fetch(request);
    if (!response.ok) throw new TypeError(`precache failed for ${url}: ${response.status}`);
    let counted = 0;
    const reader = response.clone().body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        counted += value.byteLength;
        addProgress(value.byteLength);
      }
    }
    // A body the server compressed differently from the file on disk still ends at the file's size.
    const expected = SIZES.get(url) || 0;
    if (counted < expected) addProgress(expected - counted);
    return [request, response];
  }));
  await Promise.all(fetched.map(([request, response]) => cache.put(request, response)));
}

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
      // Counted either way: the bar measures the install's way to its end, and a miss is passed.
      addProgress(SIZES.get(url) || 0);
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
    await cacheShell(cache);
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
    // With the progress so far: a page opened halfway through an install has missed every post.
    const progress = progressMessage();
    event.ports[0].postMessage({ cache: VERSION, version: APP_VERSION, done: progress.done, total: progress.total });
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
