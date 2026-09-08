# Conquest performance implementation and evidence

Physical Samsung Galaxy Tab A9 performance is **not yet verified**. This change preserves Phaser 4.2.1, the artwork, drawing-buffer resolution, scenery density, effects and gameplay rules. Desktop measurements establish controlled improvements; they cannot establish Android frame pacing, thermal stability or physical touch latency.

## Delivered architecture

- `RetainedMapRenderer.ts` stores immutable image vertices in a persistent GPU buffer. Camera motion changes uniforms; visibility changes update an index buffer. Contiguous compatible image runs replace ordinary submissions in the existing sorted display list. Dynamic objects remain between those runs. No transparent-artwork sorting by texture is introduced. The layer uses existing atlas textures, filtering, origins, tints, alpha, flips and pixel rounding.
- `RetainedPathRenderer.ts` captures Phaser's actual tessellation for immutable ownership and settlement paths. It retains triangles rather than approximating paths with another rasterizer. Commands, transforms, style, camera scale and context restoration invalidate the cache. Both renderers draw through Phaser render nodes and release their owned buffers/VAOs; shared shader programs remain owned by Phaser. Normal Phaser drawing remains available with `?retained=0`; `?retainedpaths=0` isolates the path cache.
- Map decoration placement now registers culling bounds at the point of creation/change. Unrelated economy refreshes skip the full static registration sweep. Static and moving registrations are tracked separately, camera rectangles are reused, and unchanged suppression sets avoid new allocations.
- Refresh requests coalesce while a bounded useful generation completes. Fog concealment still happens immediately when sight is lost. Preparation uses available frame headroom, with the existing minimum allowance and an 8 ms upper allowance. Existing ground/fog chunk budgets still account for replacement textures before releasing their predecessors.
- `GraphicsPartition.ts` is the shared deterministic chunk-command preparation function. `MapPreparationWorker.ts` runs one worker per active map scene, with one active and at most two queued jobs, generation/revision tags, transferable typed buffers, bounded recycling, cancellation, shutdown and error/timeout fallback to the yielding main-thread implementation. It is opt-in with `?mapworker=1` because measured communication costs did not justify a default change.
- Progress badges retain stable order identities and update only changing text/progress. Badge families and marching dust retain at most 32 idle objects each. Exhaustion allocates normally; effects are not dropped.

The retained image buffer admits up to 16,384 quads and eight atlas textures; additional or unsupported objects use Phaser. Immutable path storage is capped at 8 MiB. Worker input/recycle storage is bounded at 16 MiB per pool. Ground/fog retain their shared 64 MiB (Medium/Clarity) or 96 MiB (High) limit. These are separate resource categories, not a claim that their sum is the application's entire memory footprint.

## Frozen source and production builds

The baseline includes the working tree and uncommitted work present before implementation, not just the then-current Git HEAD. Source copies, individual SHA-256 hashes and the original working-tree patch are under `output/a9-performance/baseline/`.

| Build | Source identity | Production service-worker version |
|---|---|---|
| Baseline | `57308399c53f2548d9694e699fcbb57698de31beea9ae09c33e157312fd427e7` | `cc25c9a740fa` |
| Release | `4f549137e23d6355aa13e9bebc7c61df3e0814dfa3d8bff021cf02a9fdfe4611` | `c11035cdf802` |

Release build SHA-256: `d413d506f723907f3a64e3359ce39f5530c20667b9a6d73d3b3980e86862e869`. Baseline and release manifest aggregation methods differ; individual file hashes are the comparison authority. Each measurement also records the loaded hashed JavaScript URL, browser, GPU, viewport, buffer size and visual profile.

During PR preparation, `GraphicsPartition.ts` had its mixed line endings and blank final line normalized. Its normalized contents match the frozen source exactly; the other 2,221 measured source/build-input files remain byte-identical. This formatting-only difference is recorded in [source-normalization.json](conquest-a9-evidence/source-normalization.json). A fresh TypeScript check passed; the benchmark numbers continue to identify the original frozen build above.

## Measurement method

The production harness uses seed `20260812`, the actual Conquest scene and existing benchmark hooks. Five paired runs alternate baseline/candidate order. High, Medium and Clarity are fixed separately. The demanding fixture is a 1920×1080 desktop layout at DPR 1, the revealed 42-land state at zoom 0.72, and a repeatable real CDP touch path under 4× CPU throttling. The two versions receive the same touch positions and event count. Dispatch is awaited, so overloaded browsers take longer instead of skipping input. This is not virtual-time performance testing.

Opening-map drag, revealed idle and unthrottled drag are captured in each run. Raw frame intervals, stage samples, long tasks, input timestamps, GL draw/upload counts and camera poses are retained. Stage wrappers overlap (world update includes some preparation); their durations must not be added together. Texture byte counts are estimated from call arguments, and texture submission time excludes asynchronous GPU execution.

`prestep` to `postrender` measures main-thread frame work and submission. Event timestamp to `postrender` is an input-to-submission proxy. Neither proves physical screen presentation. Separate Chrome frame traces corroborate browser rendering activity. GPU timer queries and allocation sampling run separately, as do screenshots and CPU profiles. Forced garbage collection is limited to lifecycle/soak memory checks, outside timing windows. No screencasting is used.

All runs, variability and gate outcomes are recorded in [the machine-readable report](conquest-a9-evidence/report.json), [the run table](conquest-a9-evidence/runs.md), [the per-window CSV](conquest-a9-evidence/results.csv) and [the acceptance record](conquest-a9-evidence/acceptance.json). These compact copies are committed for PR review; no outlier is removed. Full raw frame samples, CPU profiles, browser traces, frozen builds and screenshots remain local generated artifacts under the existing ignored `output/` directory. Links to those detailed artifacts below require the original workspace or regenerated output.

The timing-capture implementation used for those runs is archived under `release-paired/harness/`. The current harness additionally corrects the cached scene-update hook. The archived helper's later GPU API correction is identified in its README; the raw five-pair GPU fields retain their original unavailable result. The separate `gpu/` probe supplies the available GPU measurements.

## Measured results

The completed five-pair comparison used Chromium 151, ANGLE/D3D11 on an NVIDIA RTX 5070 and an AMD Family 26 Model 112 CPU. The actual drawing buffer was **2702×1520 in both versions and all three profiles**, inside the 1920×1080 viewport. All 15 pairs used matching locked parameters and camera endpoints; no public artwork file changed. The settled fixture verifier also found identical hashes for all scenery transforms, frames, tints and depth, and identical visible identities: 7,130 total scenery images in High, 5,857 in Medium and 4,905 in Clarity. These are the existing profile differences, preserved within every pair.

| Profile | Baseline CPU p95 | Release CPU p95 | Reduction | Buffer upload/frame, baseline → release | Desktop throttled FPS, baseline → release |
|---|---:|---:|---:|---:|---:|
| High | 39.8 ms | 27.1 ms | **31.9%** | 890.0 → 338.9 KiB (**61.9% lower**) | 30.33 → 45.62 |
| Medium | 37.4 ms | 23.8 ms | **36.4%** | 793.8 → 326.1 KiB (**58.9% lower**) | 29.82 → 53.31 |
| Clarity | 40.0 ms | 24.9 ms | **37.8%** | 734.7 → 334.7 KiB (**54.4% lower**) | 29.55 → 39.88 (40 FPS cap) |

Values are medians of the per-run measurements in the demanding 4× CPU touch workload. Taking the median of the five individual paired percentage improvements instead gives **30.11%, 36.36% and 30.86%** for High/Medium/Clarity. Individual pairs varied; the full ranges remain in the run table. Every candidate timing window uploaded **zero unchanged scenery vertex bytes**. Visibility index updates and non-scenery uploads remain included in the total GL byte counter. High's median Phaser submission p95 fell from 23.8 to 11.5 ms; culling fell from 5.8 to 3.9 ms. These overlapping stages are explanatory, not quantities to sum.

Simulation is paused in this controlled workload. The original scene-update timing hook also missed Phaser's cached `Systems.sceneUpdate` function, so the five-pair records cannot provide an isolated world-update duration. The corrected harness wraps that cached entry point. A separate one-pair, two-second instrumentation audit captured world-update calls in all eight windows; its shorter touch path and added wrapper make it supplementary evidence, excluded from the five-pair acceptance calculation. Live gameplay is covered by the soak and motion checks. Missing measurements are not treated as zero-cost simulation.

Unthrottled revealed-drag CPU p95 improved 18.9%, 22.1% and 29.9% in High/Medium/Clarity. Median input-to-submission p95 changed from 30.0→29.5 ms, 29.3→29.0 ms and 39.6→29.6 ms. Opening, idle and unthrottled-drag comparisons had no >5% median CPU or measured input-proxy regression. This is not an exhaustive timing claim about every panel or live seasonal transition.

At the end of some 40 FPS Clarity input windows, raw visibility counters differed by 2–6 objects because the last input can precede the next culling frame. The raw counters are retained in `report.json`. All demanding throttled endpoints matched exactly, and the separate settled fixture matched all profiles' geometry and visible identities. No counter was silently normalized inside a timing window.

There are material tradeoffs:

- **GPU duration increased.** The separate timer probe measured median GPU elapsed time of 0.767→1.032 ms (High), 0.716→1.013 ms (Medium), and 0.724→1.150 ms (Clarity). Draw calls in the demanding workload increased approximately 98→123 per frame. Persistent paths save CPU tessellation but introduce standalone submissions. These desktop GPU measurements are a reason to retain the diagnostic fallback and require physical A9 profiling; CPU improvements alone do not establish a gain on a GPU-limited tablet. The first probe attempted only the WebGL 2 timer API; a separate corrected probe used the WebGL 1 EXT API actually exposed by Phaser's context, with no disjoint or unresolved samples.
- **Seasonal completion improved but failed the one-second gate.** Baseline Summer/Autumn/Winter took 2.815/2.844/2.900 seconds; release took 1.311/1.232/1.203 seconds. Median completion improved 56.7%. The larger useful-work allowance increased transient frame-work p95 from 9.0/8.9/10.6 ms to 17.8/17.0/15.6 ms. This is a measured responsiveness/completion tradeoff, not a universal frame-time win. The worker variant took 1.249/1.184/1.273 seconds and had no consistent ≥20% p95 benefit, so it remains opt-in.
- **Pinch is an existing unsupported workload.** Real two-finger events changed neither baseline nor candidate map zoom; neither build has a pinch handler. The verifier records this rather than comparing logical map zoom to camera zoom (which also includes rendering scale). Real touch drag and the three supported zoom levels are checked. Pinch interaction acceptance remains open.

The isolated allocation probe estimated 1.834 GB of sampled allocations in baseline versus 0.942 GB in release for the same input sequence, including objects subsequently collected. This is a statistical single-probe estimate, not exact bytes or five-pair allocation acceptance. Separate CPU/Chrome traces show GC and browser presentation-pipeline events; nested GC durations must not be summed as non-overlapping pauses.

The attribution limits matter: zero unchanged scenery uploads directly verifies retention, and the culling/submission spans locate the CPU savings. The earlier image-only ablation did not reliably meet the CPU target; retaining paths was also needed in these runs. Badge identity and bounded idle counts directly verify reuse. The allocation estimate covers the combined changes and cannot assign a percentage to pooling alone. Likewise, the five-pair frame result measures the delivered combination, not the sum of independently established gains.

| Acceptance gate | Outcome |
|---|---|
| ≥30% lower demanding 4× CPU p95 | **Pass** for all three profiles, including the median of paired percentage improvements |
| Target ≥50% fewer upload bytes | **Pass** for total GL buffer bytes; unchanged retained scenery vertex bytes are zero during pure pan |
| ≤5% median unthrottled CPU/input regression | **Pass** for the opening, idle and revealed-drag timing workloads; input is a submission proxy |
| Identical visual parameters and correct overlaps | **Pass** in the documented deterministic geometry/painter-order/image comparisons |
| Visible season completion ≤1 second | **Fail**: release median 1.232 seconds; transient refresh CPU cost also increased |
| Equivalent-cycle heap ≤baseline +10 MiB | **Pass** in the repeated-scene verifier; long-session results are reported separately |
| No continuing equivalent-cycle heap growth | **Not established**: both builds still drift upward over 16 cycles; candidate remains below baseline |
| Lower GPU cost | **Regressed** in the separate desktop probe; no GPU-improvement claim |
| Pinch interaction workload | **Unfulfilled**: unsupported by both baseline and release |
| Physical A9 frame pacing, touch latency and thermals | **Not yet verified** |

## Correctness and resource evidence

- Same-frame reference/retained/reference captures passed at zooms 0.72, 1 and 1.65, with English/Vietnamese and landscape/portrait cases across all three profiles. The exact visible painter order is checked by expanding retained runs back to their source identities. Typical RGB differences were one intensity level; mean absolute channel error stayed below 0.001 on the 0–255 scale. Repeat captures also show small raster noise. The verifier explicitly permits mean <0.01, <0.5% changed pixels and <0.01% pixels differing by more than two; it does not claim bit identity. Screenshots were inspected for detail, labels, overlaps and fog edges.
- Sixteen repeated same-seed scene cycles kept candidate buffer/VAO wrapper counts fixed at 23/21 (baseline 9/16). Retained heap after the first two warm-up cycles was 31.80 MiB versus baseline 34.03 MiB under the verifier's upper-median convention, within the baseline+10 MiB gate. **A flat memory trend is not established:** from cycle 2 to 15, baseline grew 1.99 MiB and candidate grew 2.16 MiB. An earlier six-cycle sample ended with a small decline; the longer run is retained to avoid overstating stability. Startup warm-up and every cycle remain in the raw data.
- Stable badge identity and the 32-idle-family cap passed. Context loss/restoration returned to a populated viewport with 1,522 visible scenery images in both builds, unchanged camera pose across restoration, and no continuing GL error; both builds emitted the same transient `INVALID_OPERATION` during restoration. Battle entry and return to the map, real touch panning and resize completed without page errors. Initial sea-only recovery screenshots were insufficient visual evidence and were superseded by this populated-map check.
- The desktop driver kept `document.hidden` false when another tab was brought forward; protocol freeze probes also did not establish a suspended game loop. Actual hidden-tab/process suspension remains unverified in this environment. Explicit blur/focus resilience handlers and return-to-tab rendering were exercised. Initial follow-up harness failures (an implicitly owned Playwright context and an invalid hidden-tab assumption) are preserved separately from the corrected recovery result.
- Fog concealment, ownership changes, culling bounds and season changes passed the existing map regressions. All 25 real/transformed graphics fixtures matched the frozen partitioner in both pure and worker modes, with cancellation, bounded queue and shutdown fallback checks.
- The production worker returned revisioned partition results with the network disabled, served from `vanthang-c11035cdf802`. Production and shell builds include `mapPreparation.worker-BZVYw1Ik.js`. Native shell execution remains untested.
- The marching suite passed 16/16 checks. The traveler suite passed on 62 roads, including six styles, settlement variety, distance-driven animation, pause/cull/resume and missing-art fallback. Old harness assumptions were corrected: wait for Menu asset loading, wait for yielding reveal completion, and recognize packed atlas frames. Initial failures remain in `checks/`; corrected results are recorded separately.
- The installed web-game skill client completed two input bursts without browser errors; screenshots and text state were inspected. Its canvas-readback attempt initially returned the cleared WebGL backbuffer, so the test proxy selects the client's compositor screenshot fallback. No production context attribute changed.

The full elapsed-time soak completed **1,802.978 seconds**, spanning three campaigns, 503 turns, 59 panel openings and 14 simulated blur/focus resumes, with zero browser errors. All 59 memory samples respected the chunk budget, and the chunk count stayed at 24. The sample counter observed an active battle on 1,033 iterations; that is not 1,033 distinct battles. Retained heap fell as campaigns restarted and ended at 32.31 MiB after resetting to the starting seed. This was 10.61 MiB above the cold first sample; the soak harness's existing 24 MiB cold-to-warm allowance passed. That allowance is **not** substituted for the plan's baseline+10 MiB equivalent-cycle gate, which is tested separately. This soak uses normal elapsed time and is a lifecycle/gameplay check, not a clean frame-timing window.

## Alternatives and unsuccessful experiments

| Candidate | Evidence and decision |
|---|---|
| Image retention alone | Earlier production probe reduced upload work but did not consistently meet the 30% CPU gate. The delivered version also retains immutable Phaser path triangles and caches camera-uniform application. Earlier results remain under `production-probe/`, `paired/` and `path-probe/`; they are not pooled with final runs. |
| Loose quadtree / grid sizes | The isolated final run covers 7,130 actual scenery bounds and 194 recorded camera poses, five alternating-order samples, with exact brute-force visibility parity. Median query p95 was 0.1464 ms (128 grid), 0.1048 ms (256), 0.1395 ms (512) and 0.0537 ms (loose quadtree). The quadtree omits the grid's visibility-transition bookkeeping and is therefore a favorable upper bound. It supplies no proof of the separate 5% whole-frame gate. The existing 256-unit grid remains in production. An earlier spatial run overlapped a shell build and is excluded from this comparison. |
| Preparation worker | Pure function parity and bounded lifecycle are implemented. Earlier seasonal runs did not show a consistent main-thread p95 benefit once transfer and completion latency were included. It remains opt-in. |
| OffscreenCanvas rasterization | Main/worker Canvas 2D pixels matched each other, but differed from the existing Phaser WebGL chunks. Measured worker round trips were about 3–4 ms versus 0.1–0.5 ms main-thread Canvas rasterization, before GPU completion. A 1028×1028 canvas plus transfer bitmap requires about 8.45 MiB of staging. Visual and latency gates failed, so the prototype stays disabled. Bitmaps are closed after upload/comparison or discard. |
| Earlier shader/buffer experiments | Early probes exposed incorrect double camera translation and VAO element-buffer binding interference, both fixed before release. The final shaders use Phaser's high precision and matching quad diagonal. Interrupted comparisons are preserved separately and are not final acceptance evidence. |
| WebGPU / WebAssembly | No migration; current measurements justify removing repeated work within Phaser first. |

Relevant primary references from the approved plan: [Phaser render-node shader guide](https://phaser.io/tutorials/phaser-4-shader-guide), [workers and main-thread contention](https://web.dev/articles/off-main-thread), [transferable ownership](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects), [OffscreenCanvas transfer constraints](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen), [ImageBitmap lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap), and [Chrome Android profiling](https://developer.chrome.com/docs/devtools/remote-debugging/).

## Reproduction

The evidence entry points are:

| Evidence | Artifact |
|---|---|
| Every timing sample and raw intervals | [Raw JSON (local)](../../output/a9-performance/release-paired/results.json), [committed CSV](conquest-a9-evidence/results.csv), [committed all-run table](conquest-a9-evidence/runs.md) |
| Frozen identities and unchanged artwork | [Baseline manifest](../../output/a9-performance/baseline/manifest.json), [release manifest](../../output/a9-performance/release/manifest.json), [source verification](../../output/a9-performance/provenance.json) |
| CPU stacks and browser frame events | [Baseline High CPU](../../output/a9-performance/release-paired/baseline-high.cpuprofile), [release High CPU](../../output/a9-performance/release-paired/candidate-high.cpuprofile), [baseline High trace](../../output/a9-performance/release-paired/baseline-high.trace.json), [release High trace](../../output/a9-performance/release-paired/candidate-high.trace.json); equivalent files exist for Medium and Clarity |
| GPU and statistical allocation samples | [GPU](../../output/a9-performance/gpu/results.json), [baseline allocations](../../output/a9-performance/allocations/baseline.json), [release allocations](../../output/a9-performance/allocations/candidate.json) |
| Seasonal completion, including worker alternative | [Baseline](../../output/a9-performance/refresh-baseline/results.json), [release](../../output/a9-performance/refresh-release/results.json) |
| Geometry and image comparisons | [Exact scenery fixture](../../output/a9-performance/fixture/results.json), [High VI landscape](../../output/a9-performance/visual-release/results.json), [High EN landscape](../../output/a9-performance/visual-high-en-landscape/results.json), [Medium VI portrait](../../output/a9-performance/visual-medium-vi-portrait/results.json), [Clarity EN portrait](../../output/a9-performance/visual-clarity-en-portrait/results.json); PNG pairs are beside each result |
| Preparation parity and offline worker | [Partition fixtures](../../output/a9-performance/preparation-final/partition.json), [offline worker](../../output/a9-performance/offline/results.json), [rejected raster prototype](../../output/a9-performance/canvas-worker/results.json) |
| Spatial candidates | [Isolated five-run grid/quadtree comparison](../../output/a9-performance/spatial-final/results.json) |
| Corrected world-update instrumentation | [Supplementary two-second stage audit](../../output/a9-performance/stage-audit/results.json) |
| Sixteen scene cycles and populated context restoration | [Lifecycle results](../../output/a9-performance/lifecycle-populated/results.json), [heap comparison](../../output/a9-performance/lifecycle-populated/memory.json), [restored scenery](../../output/a9-performance/lifecycle-populated/candidate-restored.png) |
| Gameplay and long session | [Map regression](../../output/a9-performance/map-drag/results.json), [traveler audit](../../output/a9-performance/travelers-final/audit.json), [30-minute soak](../../output/a9-performance/soak/results.json) |
| Consolidated outcomes | [Committed acceptance JSON](conquest-a9-evidence/acceptance.json), [corrected check outcomes (local)](../../output/a9-performance/checks/final-results.json) |

Freeze each revision **before editing it**. Build into its own output directory so later source edits cannot change either served artifact:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir output/a9-performance/release/site
node scripts/build-sw.mjs --dist output/a9-performance/release/site
node scripts/performance-manifest.mjs output/a9-performance/release
```

Start the existing frozen baseline and release in separate terminals:

```powershell
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5188 --outDir output/a9-performance/baseline/site
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5193 --outDir output/a9-performance/release/site
```

Run the comparison while no other profiling/build/browser workload is running:

```powershell
$env:BASELINE_URL='http://127.0.0.1:5188/ten-thousand-victories/'
$env:CANDIDATE_URL='http://127.0.0.1:5193/ten-thousand-victories/'
$env:OUT='output/a9-performance/release-paired'
$env:PAIRS='5'; $env:SECONDS='5'; $env:QUALITY='high,medium,clarity'; $env:PROFILE='1'
npm run perf:conquest
$env:INPUT=$env:OUT
node test_scripts/perf/report-conquest-performance.mjs
```

Run functional checks and additional measurements separately:

```powershell
$env:DEV_URL=$env:CANDIDATE_URL
$env:OUT='output/a9-performance/visual-release'
npm run verify:retained-scenery
$env:OUT='output/a9-performance/lifecycle-populated'
$env:CYCLES='16'
node test_scripts/verify/conquest-lifecycle.mjs
node test_scripts/verify/verify-preparation-offline.mjs
$env:OUT='output/a9-performance/refresh-release'
npm run perf:map-refresh
$env:INPUT='output/a9-performance/release-paired/results.json'
$env:OUT='output/a9-performance/spatial-final'
npm run perf:spatial
$env:OUT='output/a9-performance/allocations'
node test_scripts/perf/conquest-allocations.mjs
```

Worker partition parity uses the development server to load both the frozen baseline function and extracted function: `npm run verify:map-preparation`. The raster experiment is `npm run perf:chunk-raster`. Neither is a default-enabled production path.

For the installed web-game skill client, run `node test_scripts/verify/skill-conquest-smoke.mjs` with `DEV_URL` set to release. Its forced software-renderer screenshots and virtual stepping are correctness evidence only.

The live elapsed-time soak:

```powershell
$env:DEV_URL='http://127.0.0.1:5193/ten-thousand-victories'
$env:HEADED='1'
npm run perf:soak -- --minutes 30 --out output/a9-performance/soak
```

The trailing slash is omitted for the shared soak bootstrap. Blur/focus in the harness exercises resilience handlers; it is not physical Android process suspension. Mobile shell packaging is checked with `vite build --mode shell`; no native app or physical tablet was available for execution.

## Physical A9 handoff

Record the precise model, RAM, Android/Chrome versions, profile, buffer dimensions, power state and thermal conditions. Use the same workloads in both orientations and English/Vietnamese. After warm-up, inspect every 10-second window: average at least 40 FPS (target 60), physical touch-to-rendered-response p95 at most 75 ms, and fewer than 1% of intervals over 50 ms. At 40 FPS on a 60 Hz panel, mixed display intervals are expected; do not impose a 25 ms maximum on every presented frame. Run without remote screencasting and retain frame/presentation traces. Until these physical measurements exist, A9 acceptance remains **not yet verified**.
