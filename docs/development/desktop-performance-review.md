# Desktop performance review — 7 September 2026

Implementation follow-up: [desktop map drag changes and verification](map-drag-performance.md). The findings below record the state before that follow-up.

The desktop game has measurable CPU and update-latency problems. The strongest opportunities are reducing work for standing decoration, caching ownership shading, and making launch calibration represent a developed desktop map. The Codex is currently a lower priority.

## How this was checked

A fresh production build was run in headed Chromium using the computer's **AMD Radeon 8060S / ANGLE Direct3D11** renderer, confirmed through the browser. Tests used the actual desktop layout at 1920×1080 and 3440×1440, DPR 1, with Medium, High and Auto. They covered the starting map, a fully revealed 42-land fixture, zoom 0.72, a real season transition, opening and wheeling the Codex, and a short battle followed by a decision panel.

Slower-CPU comparisons used Chromium's 4× CPU throttling while retaining hardware graphics. These are controlled simulations of CPU pressure, not measurements of a different laptop. They used normal elapsed-time rendering, with no forced game steps and no screenshot-only `capture` rendering mode. Five-second samples are diagnostic windows, not sustained thermal tests. Packaged Electron was inspected in code but was not launched in this review.

Unthrottled, this computer maintained approximately 60 FPS in the tested map and Codex views. That does not rule out the reported lag on other computers. The slower-CPU test reproduced it, and the refresh/transition problems below occur independently of the ordinary frame average.

## Findings and recommended changes

### 1. Reduce the number of individually processed decoration objects

The fully revealed High map had **7,473 image objects**. In the matched 1920×1080, zoom-0.72, 4× CPU comparison:

| Diagnostic condition | FPS | Median CPU work/frame | Geometry upload/frame |
|---|---:|---:|---:|
| Existing rendering | 44.9 | 21.0 ms | 1,080 KiB |
| Ownership shading temporarily hidden | 51.3 | 17.6 ms | 907 KiB |
| Standing decoration temporarily hidden, ownership shading restored | 60.1 | 11.7 ms | 505 KiB |
| All original artwork restored | 43.6 | 21.1 ms | 1,080 KiB |

Hiding art was used only to attribute cost in disposable browser pages. It is not the proposed product change. Atlas pages have reduced texture switching, but thousands of separate images still require CPU processing and vertex submission.

**Improve:** group static vegetation and relief spatially, cache or batch contiguous groups in their existing back-to-front order, and use screen-size-based detail at distant zoom. Preserve authored images at close zoom, readable labels, and the current interleaving with settlements and armies. Avoid flattening the entire world into a single texture.

Source: [standing-decoration creation](C:/Users/zerg/Projects/personal/grand-rts-game/src/ui/DongHoMapRenderer.ts:397).

### 2. Cache the ownership shading that still renders live

`ownershipTint` contains **15,639 Graphics command numbers** on the revealed fixture. It is one large live object at depth 1.95, outside the ground-cache band, and is processed every frame even when ownership is unchanged. Temporarily hiding it removed about 12,669 submitted indices and 173 KiB of geometry upload per frame in the matched comparison above.

**Improve:** cache it per province or chunk and invalidate only regions whose ownership/visibility changed. Preserve its current depth and appearance. This is a gap in the previous cache implementation; rebuilding the shading only when state changes does not stop Phaser from rendering its paths every frame.

Source: [ownership shading](C:/Users/zerg/Projects/personal/grand-rts-game/src/scenes/ConquestScene.ts:164).

### 3. Fix a visibility-cache mismatch after map refreshes

The seasonal update on the ultrawide High fixture left **364 decoration images visible although the spatial index marked them culled**. Reapplying their recorded cull state reduced the mismatch to zero. The cause is the bake path making all retained artwork visible, while incremental culling skips unchanged entries and unchanged visibility transitions.

**Improve:** give visibility one owner. Baking must preserve each retained object's cull state; new/replaced objects should be registered explicitly. Add a regression that checks visibility consistency after seasons, construction and ownership changes. This is a confirmed bug introduced by the interaction of the earlier retention and incremental-culling changes. Its isolated frame-time benefit was small in this fixture, so it is not the sole explanation for the slowdown.

Sources: [visibility reset during baking](C:/Users/zerg/Projects/personal/grand-rts-game/src/scenes/MapScene.ts:1532), [unchanged cull entries](C:/Users/zerg/Projects/personal/grand-rts-game/src/scenes/map/ViewIndex.ts:80), [transition-only callbacks](C:/Users/zerg/Projects/personal/grand-rts-game/src/scenes/map/ViewIndex.ts:173).

### 4. Shorten preparation completion and panel-transition work

Even on this hardware, the revealed-map season update took **2.45 seconds on Medium** and **2.94–3.03 seconds on High** to finish the pending preparation. Revealing the map took roughly 2.4–2.9 seconds. Completed imagery remains displayed during this interval; these are completion delays, not single multi-second blocking tasks.

In a separate short battle test at 4× CPU, a transition to a power-draft decision produced a **103 ms browser task**, including a **79 ms UI refresh**. Ordinary `updateBattle` calls in that sample peaked at 16.9 ms. The long task should therefore be investigated as a panel transition, not described as a 103 ms ordinary battle beat. The sample contained four battle updates and ended when the decision panel opened.

**Improve:** prepare visible seasonal content first, defer distant work, and separate permanent ground from seasonal content so a season does not require repainting unchanged base imagery. Coalesce refresh notifications and reuse unchanged panel elements during transitions. Measure time until the visible area is current and input-to-next-frame latency as acceptance criteria.

The current full-map gate records elapsed time but asserts only slice duration and memory. That is why the earlier 90.8-second software-renderer result could pass. That earlier number and this review's hardware result are different test environments, not a new code-speedup comparison.

Sources: [season preparation](C:/Users/zerg/Projects/personal/grand-rts-game/src/scenes/MapScene.ts:2733), [panel transition](C:/Users/zerg/Projects/personal/grand-rts-game/src/scenes/conquest/shell.ts:390), [current stress assertions](C:/Users/zerg/Projects/personal/grand-rts-game/test_scripts/perf/performance-map-stress.mjs:30).

### 5. Make Auto test a developed desktop map

With 4× CPU throttling active **before launch**, Auto still selected **High**. Its synthetic High probe reported just 2.0 ms of CPU work at the 90th percentile. The subsequently revealed, zoomed-out desktop map ran at **42.7 FPS**, with **28.6 ms** CPU work at the 95th percentile.

The probe renders several hundred stamps and ten cards. It omits the developed map's ownership Graphics, larger object population, chunk preparation and panel transitions. Scaling the probe's sprite count by screen width is insufficient.

**Improve:** calibrate with representative developed-map geometry and object counts, include a bounded update/scroll sample, and test the actual viewport and buffer size. Keep the launch-only policy and Medium-clarity floor. Confirm profile selection against the demanding scene used for acceptance; do not infer that High is sustainable from the lightweight probe alone.

Source: [launch workload](C:/Users/zerg/Projects/personal/grand-rts-game/src/game/calibrateGraphics.ts:27).

### 6. Avoid unnecessary desktop supersampling

At a 1920×1080 DPR-1 viewport, the game allocated a **2702×1520** drawing buffer: about **4.11 million pixels for a 2.07-million-pixel viewport**. Rounding the required render scale upward to an integer causes this nearly twofold pixel cost. High and Medium both used scale 2 in this case.

**Improve:** evaluate a fractional scale matched to actual display pixels, with a small floating-point tolerance and explicit supersampling reserved for a manual option. Keep UI text at native display clarity. This pixel-count saving is confirmed arithmetically; its frame-time benefit was not separately benchmarked here, and it will not eliminate the CPU object-processing problems above.

Source: [render-scale rounding](C:/Users/zerg/Projects/personal/grand-rts-game/src/game/graphicsQuality.ts:159).

## What can wait

The 127-row Codex opened in **7.5–15.4 ms** in these desktop runs and held approximately 60 FPS. Actual mouse-wheel scrolling in the ultrawide and Auto cases advanced the list by about 1,125 design units while keeping only 12 rows mounted. Clipping and layout screenshots were reviewed. More list optimization is lower priority than the map and transition findings.

## Reproduction and artifacts

The review did not change production game code. The production build is under `output/desktop-performance-review/site`; measurements and screenshots are alongside it. The browser scripts are in the ignored scratch folder:

- `test_scripts/scratch/desktop-perf-audit.mjs`: headed desktop views; `QUALITY`, `WIDTH`, `HEIGHT`, `DPR` and `FULL=1` select the fixture.
- `test_scripts/scratch/desktop-map-cost.mjs`: matched decoration/ownership attribution; `AUTOCHECK=1` applies CPU throttling before an Auto launch.
- `test_scripts/scratch/desktop-battle-audit.mjs`: real-time battle-to-panel sample; `THROTTLE=4` selects the slower-CPU check.

The scripts use the production preview at `http://127.0.0.1:5191/ten-thousand-victories/`. Runtime-only diagnostic visibility changes disappear when their isolated browser pages close. Save data was confined to those temporary browser contexts.
