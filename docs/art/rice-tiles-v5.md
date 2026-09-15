# Rice terrain: connected tiles and small standing crops

## User direction

The rectangular v3 parcels were rejected. Rice must occupy complete game tiles and the user explicitly chose **one outer bund around connected rice tiles**. The subsequent v4 material was also rejected: its individual plants looked oversized beside people and the entire crop looked flat.

This version retains the connected tile footprint and replaces the continuous illustrated texture with small upright crop sprites. It preserves the agricultural and Đông Hồ [research from v3](rice-paddies-v3.md#research-used), including the explicitly simplified northern lowland seasonal convention.

## Rendering

- Select at most eight connected agricultural regions; omit isolated cells and full cells needed for settlement clearance. Never convert neighboring plains into rice.
- Use the actual hex corners. Cancel every shared edge, leaving a single enclosing earth bund around each connected region.
- Lay plant roots on a foreshortened grid whose axes recede at 30 degrees. Narrow open planting furrows follow that ground direction; they are not extra bunds.
- Keep the plant stems upright. Overlapping sprites and small root shadows convey height. Wet soil and plants use separate cached layers, allowing leaf tips to rise above the back edge instead of clipping them into a flat hexagon.
- At a tile radius of 30.96 world units, young plants are 1.9 units high, mature crops 3.2, and stubble 1.05, with ten percent local variation. Map farmers are roughly eight units tall. These are game proportions, not a claim about every rice variety's biological height.
- Spring shows water and transplants, Summer green growth with first-harvest gold, Autumn golden grain and harvested regions, and Winter cut stubble. Each connected field shares one stage. Real calendar changes repaint the existing cache.
- Trees and other vegetation remain outside the cultivated footprint, using full crown clearance. Roads stay above the crop. Tile-assets-off and unavailable-art modes retain small native seasonal crops.

## Artwork

The built-in imagegen tool produced the selected transparent 4×4 sprite sheet. The runtime asset is [`dongho-rice-clumps-v5b.webp`](../../public/art/ground/dongho-rice-clumps-v5b.webp). [Exact final prompt](rice-clumps-v5-final-prompt.txt).

Master: `output/rice-tiles-v5/master-final.png`. Packing: `node scripts/conquest-art/pack-rice-clumps.mjs <master> <versioned-output>`. Packing only crops transparent cell margins, scales and aligns the sixteen sprites, and encodes the sheet at 512×512; it checks that real transparency exists. Two edit attempts returned opaque checkerboards and were rejected by this check. Neither is used in the game.

## Review and verification

The comparison uses the same map and camera for the rejected v4 surface, normal small plants, and a further 22 percent size reduction. The earlier uniformly spaced v5 grid is also retained as a rejected internal candidate. Game screenshots, browser state and regression results are in `output/rice-tiles-v5`.

Selected the normal small-plant version: its leaves and standing crop body remain more readable than the extra-small version, which becomes a dot pattern at map scale. Both use the same connected footprint and outer bund.

- `npm run build` passed; existing font-path and bundle-size warnings remain.
- `node test_scripts/verify/verify-rice-paddies.mjs` passed all 16 checks on the final production build. Four seasons on desktop High and 390×844 phone Medium, the extra-small candidate, tile assets off, and a deliberately unavailable sprite sheet were exercised.
- The seed-1337 fixture retains 49 whole tiles in eight regions: 54 shared edges disappear and 186 outer edges form the bunds. Zero full tree-crown or settlement intersections and zero non-agricultural footprint samples were found.
- Four distinct seasonal crop pixel hashes, stable geometry, an actual Winter-to-Spring calendar tick, road layering, camera dragging, static caching and atlas disposal on rebuild passed. The resident projection atlas is 8.75 MiB for this fixture, plus the 1 MiB decoded source sprite sheet.
- The installed develop-web-game client completed two action/screenshot/state iterations. Final screenshot and text state in `skill-final/` were inspected; no browser errors were recorded.
- Desktop, phone, planting, growing, harvest and stubble screenshots were opened and inspected. The review's twelve season/view selections load successfully with no page errors.

Review: `http://127.0.0.1:5184/ten-thousand-victories/rice-ground-review/review.html?v=5`. Recreate after a production build with `node output/rice-tiles-v5/make-review.mjs`. These are browser viewport checks, not physical phone testing or user acceptance of the art.
