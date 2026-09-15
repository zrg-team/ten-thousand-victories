# Dong Ho grass v2 and road visibility

V2 is a separate preview, as requested. It keeps a continuous grass-and-earth surface while reducing the first version's mottled watercolor texture. Flatter sage pigment and clearer small carved grass marks support the existing ink-outlined trees, buildings and mountains.

## Versions and backup

- V1 remains `public/art/ground/dongho-grass-v1.webp`, selected by `?groundart=grass`.
- V2 is `public/art/ground/dongho-grass-v2.webp`, selected by `?groundart=grass-v2`.
- V1 is now the default on the normal game URL. The pigment-only ground remains available with `?groundart=paper`, and the previous comparison page is retained.
- V1 SHA-256 remains `9D48E4F0A7A728351888D0518073F865D2E0D810C8986BB5F2CD11E92B6F0078`.
- Pre-change renderer source snapshots are in `output/dongho-grass-v2/backup/`. Prior screenshots and the original generated master are retained.
- The packer requires a new version and refuses to overwrite an existing runtime asset.

The built-in ImageGen style-transfer prompt, source, and master are in `dongho-grass-v2.json`. V2 uses the same 512x576, 16-frame world-sampled atlas layout as v1 and is 231,978 bytes (1.125 MiB decoded).

## Roads

The missing roads were a layer-order problem: the road Graphics had depth 0, while the opaque grass images had depth 0.01. Roads and bridges now render at 0.5, above grass, terrain color, paddies and coast, and below standing scenery. Both grass previews use a slightly stronger warm ink edge and nearly opaque pale-ochre fill. The v1 asset itself is unchanged; both previews receive the shared road fix.

Road curves, settlement gate anchors, neighbor connectivity, bridge geometry, movement orders, carts, and army path-following code are unchanged.

## Review evidence

`output/dongho-grass-v2/comparison.html` compares v1 and v2 with the road fix, using matching seed, camera, spring/winter season, and desktop/phone views. The farmland view is a revealed test fixture with ownership assigned to remove foreign haze; it is not a gameplay save.

The browser report passes nine checks: road layering/caching, no console errors, one asset request per version, retained ground caching, equal cameras, no water-cell grass, stable seasons and actual pointer drag. The 90 internal-join samples have alpha 255 and the pond center remains transparent. The installed game-client screenshots/state, production build, and separate road movement test are also retained beside the comparison.

The movement test passes 20/21 checks: claim outward travel, frontier hold, return/cancellation, player pause, road alignment, facing, no teleporting, final arrival, and carts all pass. The one failure is the precise arrival-animation timing threshold (450 ms). It also fails with the grass disabled and the old road depth restored in an isolated baseline test: approximately 1.12 s early on baseline versus 0.69 s early on the candidate run. This pre-existing timing mismatch is not fixed by the art change. Raw output is retained in `march-baseline.txt` and `march-roads.txt`.

The first attempt used an outdated harness: it started before preload finished and toggled the temporary modal-pause flag that the game clears when no modal exists. The rerun waits for MenuScene and uses the actual player strategy-pause flag; no production pause or movement code was changed to make the checks pass.
