# Performance without replacing the artwork

The game now bounds long-list rendering, prepares map changes across frames, loads authored art by scene, and chooses automatic graphics once per launch. Gameplay rules, save formats and shell origins are unchanged by this performance work. The desktop layout and menu artwork changes in the same working tree are separate work.

## Rendering and memory

`InkVirtualList` accepts stable keys, measurement and row lifecycle callbacks. It mounts the visible range plus two rows on either side, with at most four detached spare holders. Rows outside the viewport are inactive and invisible, including their input targets. Measurements use Phaser font metrics and wrapping, cached by text and style (including font and width). Item identity and pixel inset preserve scroll position after changes.

Codex, shared lane lists, Guide entries, History collections and Cabinet grids use this path. Small fixed sections remain ordinary content. The adapter reuses holders; immutable card text and surfaces share cached textures. Existing clipping, flick momentum, sheet locks and drag-versus-tap protection remain in use.

Ground and fog use 512-world-unit chunks with two physical pixels of padding and non-overlapping displayed interiors. Complete graphics primitives retain their original geometry across boundaries. Per-chunk signatures leave unchanged tiles intact. Completed imagery remains until a replacement is ready; missing or outdated visible fog is covered conservatively, including on a later pan after an offscreen visibility loss.

Ground, fog and seasonal preparation share a nominal 3 ms budget at 60 FPS or 4.5 ms at 40 FPS (6 ms for legacy 30 FPS diagnostic callers). Jobs yield between bounded primitives or objects. A single operation can exceed the nominal allowance; the regression ceiling is 50 ms per preparation slice in the reference fixture. Scene shutdown, context loss and superseding refreshes cancel obsolete work. Initial construction may synchronously finish the initial viewport.

The shared chunk **color-texture** limit is 64 MiB for Medium/Clarity and 96 MiB for High, including in-progress replacements. Only active queues share the frame allowance, so an idle queue reserves no preparation time. Accounting includes Phaser's even-dimension rounding and possible mip levels. Unused distant textures are evicted first; speculative nearby preparation cannot repeatedly evict other wanted nearby tiles. These limits are not total GPU memory: driver allocations, stencil buffers, authored textures, text canvases and CPU command buffers are additional.

The existing live depth order remains intact for structures, mountains, trees, armies and labels. Seasonal changes retain settlement structures and authored scatter images, changing their seasonal artwork, captured vegetation paths and label colors. One completed refresh requests one ground invalidation and one culling-registration pass. The spatial index registers full bounds where available and preserves unchanged registrations. Scatter exclusion checks use a spatial grid with the same final placement test.

Seven lossless atlas pages contain 326 authored asset identities. Source dimensions, transparent margins, anchors and pixels are preserved; no trimming, rotation or resampling occurs. Menu-required families load first; map, battle and story families load at scene boundaries. Failed downloads and corrupt image decoding both queue the original images before the loader completes. `?noartatlas=1` selects originals directly. Existing procedural fallbacks remain available.

Composed portraits have a 16 MiB eviction target. Referenced portraits survive eviction, including objects owned by hidden scenes. Idle entries are evicted first; a working set of referenced portraits can exceed the target. Existing stamp and effect pools remain in use.

## Graphics selection

The menu exposes Auto, Low, Medium and High. Existing manual choices are preserved; obsolete automatic rung records are removed.

| Auto profile | Buffer / ground density | Presentation | Target |
|---|---|---|---|
| High | Up to 3× / 2× | Full detail and motion | 60 FPS |
| Balanced (`medium`) | Up to 2× / 1.25× | Current Medium clarity | 60 FPS |
| Clarity | Same as Balanced | Reduced decorative motion/detail, labels retained | 40 FPS |

Low remains an explicit softer choice. The buffer multiplier is constrained by display need. Full display refresh is a manual option.

After assets are ready, first-launch calibration renders representative map stamps and list cards at High and Balanced, allowing up to two additional seconds. The probe scales its workload with the surface width. It selects the highest profile with frame-time headroom, otherwise Clarity. Texture limits and available memory hints constrain eligibility; they do not establish GPU speed.

The result is cached by profile version and display/platform characteristics. A passive monitor can recommend a lower profile for the **next launch**. It does not alter the current session, including at scene transitions. `FramePacer` delivers elapsed time separately from its scheduling remainder, so 40/60 FPS caps do not change the simulation clock. Profile version 5 raises Auto’s fallback from 30 to 40 FPS without lowering artwork or buffer resolution. This is a target, not a guaranteed hardware minimum. On a 60 Hz display, 40 FPS alternates one and two display intervals; on 120 Hz, it uses three intervals per frame.

## Verification recorded on 2026-09-07

These are local Chromium/SwiftShader measurements and functional checks. They do not establish sustained FPS on physical mobile devices or packaged applications. Timing checks should run alone against a production preview; concurrent browser tests and development hot reload invalidate comparisons.

| Check | Result |
|---|---|
| 127-row Codex, Medium, DPR 3, 4× CPU | 69.3 ms opening; 11 initially mounted, at most 14 while scrolling |
| Codex drawing | 26 draw calls, 187 KiB geometry upload versus the earlier 280 calls / 2,798 KiB baseline |
| Real Spring → Summer transition, six visible lands | One ground invalidation, one culling-registration pass; settlement objects retained |
| Recurring seasonal preparation, same fixture | Maximum 11.6 ms chunk slice and 7 ms scene-preparation slice |
| Fully revealed 42-land map, real season tick, 4× CPU | One invalidation; maximum 14.2 ms chunk slice and 13 ms scene-preparation slice |
| Construction | Completing a farm rebuilt one of 12 cached ground chunks |
| Scrolling and input | Nine checks pass, including stable item anchoring, final-row access and no accidental activation after a drag |
| Launch selection | Ten checks pass: calibration, cache invalidation, manual settings and fixed-session behavior |
| Pacing | All eight combinations of 60/90/120/144 Hz and 30/60 FPS deliver exactly 60,000 ms over the one-minute simulation |
| Layout matrix | Six cases pass: short phone, Vietnamese phone, High tablet, Clarity desktop, High desktop and ultrawide Medium; map zoom/pan and Codex/Guide/History/Cabinet |
| Recovery | 21 background/resume/context-loss checks passed; stale offscreen fog has a separate regression check |
| Medium map drawing | Latest five gates pass: 51 draw calls and 450 KiB geometry upload |
| Atlas and portraits | All 326 atlas identities/pixels verified; missing/corrupt/bypass loader cases pass; 120-portrait pressure test evicts idle entries while preserving a live owner |
| Real-time soak | 20 minutes, 326 turns, 644 battle samples, 39 repeated list openings, no browser errors; shared chunk memory within budget |
| Retained heap after soak | 29.7 MiB after returning to the starting scene, +8.1 MiB versus its first sample; second-half live heap declined by 7.8 MiB |

After the final scheduler adjustment, a separate two-minute regression run completed 33 turns and four navigation cycles without browser errors or chunk growth.

The soak uses full CDP garbage collection followed by `Runtime.getHeapUsage`. Earlier exploratory runs used `performance.memory`, whose sampled value could lag collection; their raw results remain in the output folder and are not the retained-memory verdict. A changed campaign also changes the active world size, so the final comparison returns to the same seed and scene.

The ordinary season fixture's two gameplay ticks plus dispatch took 82 ms. The bounded visual-preparation result does not claim that the entire simulation/UI dispatch is below 50 ms. The battle-cost harness is production-compatible, but battle transition rebuilding remains a separate optimization opportunity; its output should be read by actual call counts and sample count.

The fully revealed stress fixture took 90.8 seconds to drain all queued preparation and nearby chunk work in throttled software WebGL. A separate instrumented run observed about nine actual frames per second; whole-world scatter and culling work still precede completion, and the 3 ms preparation allowance receives few frames. Existing imagery stays visible while it works, and no measured preparation slice exceeded 50 ms, but this is a significant completion-latency limit of that stress case. The gate records elapsed time as well as slice time; passing the slice gate is not a claim that full-world seasonal preparation is instantaneous or that the 30/60 FPS device targets are achieved. Real-device profiling should specifically check whether frequent state changes outpace preparation.

## Repeat the checks

Run the production build and a preview first. Set `DEV_URL` to the complete preview base path, for example `http://127.0.0.1:5187/ten-thousand-victories`. All commands run from the repository root.

```text
node test_scripts/perf/performance-acceptance.mjs
node test_scripts/perf/performance-map-stress.mjs
node test_scripts/perf/gl-gates.mjs --screen ascent-map --quality medium
node test_scripts/verify/verify-performance-policy.mjs
node test_scripts/verify/verify-map-work-budget.mjs
node test_scripts/verify/verify-ladder.mjs
node test_scripts/verify/verify-scroll.mjs
node test_scripts/verify/verify-performance-layouts.mjs
node test_scripts/verify/verify-fog-chunks.mjs
node test_scripts/verify/verify-atlas-loading.mjs
node test_scripts/verify/verify-resume.mjs
node test_scripts/perf/performance-soak.mjs
```

`verify-portrait-cache.mjs` and the existing tap-after-scroll test use development imports and require the dev-server URL. The layout matrix has a longer completion timeout for manually forced High under software WebGL; it is a functional and visual check, not a sustainable-FPS gate. `CASE=high-1920` selects one layout case.

To reproduce or verify the atlases, use Python with Pillow:

```text
node scripts/export-game-art.mjs output/performance-review/art-registry.json
python scripts/pack-game-art.py output/performance-review/art-registry.json --check
```

Omit `--check` to rebuild the pages and manifest. Test output and screenshots are under `output/performance-review/`.

## Remaining device acceptance

Run sustained sessions on a midrange Android phone, an older supported iPhone and an integrated-graphics laptop, in browsers and the corresponding packaged versions. Record selected Auto profile, frame-time percentiles, input responsiveness, memory, thermal behavior, resume/context recovery and artwork readability. Those physical-device and packaged-runtime measurements could not be performed from this workspace. Browser emulation is supporting evidence only.

The references' pooling, batching and spatial-partitioning ideas are applied within Phaser. A Comlink/OffscreenCanvas renderer migration remains deferred; worker communication alone would not remove redundant rows or duplicate map preparation.
