# Dong Ho grass ground experiment

The user requested an actual grass tile background in the game's Vietnamese Dong Ho direction. The decorative ground-strip draft misunderstood that request and has been removed from runtime.

## Compare

- Current: continuous paper/pigment base with existing trees, fields, roads and mountains.
- Candidate: one generated grass-and-earth surface, repeated continuously underneath those same map assets. Muted sage and straw pigments, small carved grass marks, and exposed-earth areas give the terrain a visible material.
- V1 is the user-selected default on ordinary game URLs; `?groundart=grass` also selects it. Use `?groundart=paper` for the former pigment-only comparison or `?groundart=grass-v2` for the backed-up alternate. `mapart=procedural`, `naturalground=0`, or a missing atlas retain the procedural rendering.
- The grass makes trees and buildings feel more grounded. It also adds visual noise and reduces the contrast of the current thin roads. It is a comparison candidate, not a claim that every asset or the entire map art direction is finalized.

## Asset and rendering

The built-in ImageGen master and exact prompt are recorded in `dongho-grass-v1.json`. `scripts/conquest-art/pack-grass-ground.mjs` resizes and slices the material into a shared 512x576 WebP atlas (261,382 bytes; 1.125 MiB decoded). Frames sample continuous world coordinates. Adjacent hexes use matching texture coordinates, including negative map coordinates; there is no random tile choice or isolated alpha patch.

The atlas replaces the opaque ground base in the experiment. Connected terrain-family colors remain a light overlay. Existing water, paddies, coast ink, roads, relief, seasonal ground cast, fog and buildings render above it. Only dry visible cells receive the surface. Province visibility still determines where ground appears under fog.

Images enter the existing terrain chunk cache and share a single atlas. There is no per-frame material mask or per-tile texture allocation. The extra source images do add work during ground preparation; static draw-call counts are not an FPS benchmark.

## Evidence

`output/dongho-grass-ground/` contains matching desktop/phone current and candidate screenshots, a revealed farmland art fixture, winter comparisons, the installed game client's screenshots/state, a production build check, and browser report. The farmland fixture changes ownership only in isolated test state to remove foreign haze. Both alternatives use the same seed, season, camera and static ambient settings.

The separate assembled-tile check tests opaque internal joins (90 samples, alpha 255), an empty pond center, and continuous source sampling. Two independently encoded WebP images have a mean channel difference below 1/255 when assembled; exact RGB equality is not expected after lossy encoding and resampling.
