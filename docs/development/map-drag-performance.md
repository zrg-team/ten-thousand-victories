# Desktop map drag changes — 7 September 2026

Implemented and verified against the user's running game at `http://localhost:5179/`.
This follows the earlier [desktop performance review](desktop-performance-review.md).

## Follow-up: 40 FPS Auto fallback

At the user's request, profile version 5 raises Clarity's target from 30 to **40 FPS**.
Its buffer, ground resolution, artwork, and decoration density are unchanged. The
shared map-preparation allowance is now 4.5 ms at 40 FPS, preserving the same share
of frame time as the 3 ms allowance at 60 FPS. Older automatic calibration records
are invalidated; explicit manual choices remain intact.

A fresh Auto launch at `http://localhost:5179/`, on the same headed AMD 8060S
renderer at 1920×1080 with 4× CPU throttling, selected Clarity at 40 FPS. The two
revealed-map drag samples measured **39.94 and 40.02 FPS**, with p95 CPU work of
**25.4 and 22.3 ms**. Neither recorded a browser task over 50 ms. The drawing buffer
remained **2702×1520** and the profile stayed fixed. Evidence:
`output/map-drag/auto-40-cpu4x.json` and its screenshot.

40 FPS is the lowest Auto target, not a guarantee for every device. On a 60 Hz
screen its presentation alternates one and two refresh intervals; on 120 Hz it
fits evenly into three intervals. Pacing tests now cover 30/40/60 FPS at
60/90/120/144 Hz and preserve the simulation clock. The original 30 FPS results
below are retained as historical measurements.

## What changed

- **Precise offscreen bounds:** copying a Phaser Rectangle with object spread discarded its prototype edge getters. The spatial index now snapshots explicit edges, so its fine visibility test works. Stable grid records and numeric visit stamps also avoid repeatedly hashing thousands of object IDs during a pan.
- **Consistent visibility after refresh:** ground preparation no longer makes all retained decorations visible behind the spatial index's back. Rebound objects inherit the recorded cull state.
- **Province ownership overlays:** each province retains its own Graphics object at the existing depth. Only changed provinces are repainted, offscreen provinces are culled, and restored provinces keep the original paint order. The authored map art remains unchanged.
- **Representative Auto calibration:** the launch check fills the desktop with approximately 4,300 image objects at 1920×1080, plus contour geometry and list cards. It reserves CPU headroom for the full HUD, input, visibility checks, and simulation. Profile version 4 invalidates older automatic calibration results. Manual choices and the fixed-session policy are preserved.

Custom image-rendering and additional geometry-cache experiments were removed because they did not improve the measured drag workload reliably.

## Measurements

Headed Chromium used the computer's AMD Radeon 8060S through ANGLE/Direct3D11.
The viewport was 1920×1080, DPR 1, with a fully revealed map at user zoom 0.72.
These are actual mouse drags with elapsed-time rendering. The world clock was paused
to isolate panning from simulation and decision panels. No software renderer or forced
game steps were used for the timing measurements.

| Configuration | Drag FPS | CPU/frame, median / p95 | Browser tasks over 50 ms |
|---|---:|---:|---:|
| Before, manual High, 4× CPU throttle | 26.1 | 33.8 / 48.8 ms | 56 in approximately 29 seconds |
| After, manual High, 4× CPU throttle | 26.1 | 34.3 / 44.5 ms | 19 in 28.6 seconds |
| After, Auto → High, normal CPU | 59.2–60.0 | 6.7–10.5 / 9.0–19.0 ms | 0 |
| After, Auto → Clarity, 4× CPU throttle from launch | 30.0 | 22.6 / 27.1 ms | 0 in 12.8 seconds |

High's geometry upload during dragging fell from about **1,057 to 896 KiB/frame**
(approximately 15%). Manual High still cannot sustain 60 FPS under this CPU stress.
The Auto result combines reduced rendering work with the existing Clarity profile's
lighter decoration and 30 FPS target; it is not an identical-profile speedup claim.

Both final Auto runs retained a **2702×1520 drawing buffer** and source-resolution
artwork. Clarity uses Balanced's clarity, with less decoration and motion; it does not
select the softer manual Low setting. Its calibration completed in **1,902 ms** in
the throttled run. The selected profile and frame target stayed fixed throughout play.

The machine was unthrottled for the normal run; 4× throttling is a controlled CPU
stress test, not a measurement of an older laptop. Timing varies between runs and
these short samples do not establish sustained performance on every desktop or in
the packaged app. Simulation, battle, and panel-transition costs remain separate
from this isolated map-drag check.

## Verification and reproduction

Run from the repository root with the existing dev server already serving port 5179:

```powershell
npm run verify:map-drag
npm run verify:performance-policy
npm run verify:ladder
node test_scripts/verify/verify-resume.mjs --shots
npm run build

# Hardware-rendered mouse-drag measurements, including manual High at 4× CPU.
npm run perf:drag

# Apply CPU throttling before Auto makes its launch choice.
$env:QUALITY = 'auto'
$env:CPU_RATE = '4'
node test_scripts/perf/measure-map-drag.mjs auto-cpu4x
```

The drag regression passes at 1280×720, 1920×1080, and 3440×1440 in English and
Vietnamese across manual Low, Medium, and High. It checks mouse drag/release,
visibility after real season changes, local ownership updates and restored paint
order, zoom 0.72/1/1.65, and resizing. Auto/manual launch checks pass 10/10; background, context-loss, and saved-run
recovery checks pass 21/21. The production build passes with the existing font-path
and bundle-size warnings. The installed game client completed two gameplay bursts;
its final screenshot and text state were reviewed without browser errors.
The spatial-index unit checks compare 30,000
queries against brute-force visibility. Pacing tests preserve 60 seconds of simulated
time at 30/60 FPS on simulated 60/90/120/144 Hz displays.

Artifacts are under `output/map-drag/` and `output/verify-map-drag/`:
`before.json`, `after.json`, `auto-normal-final.json`, and
`auto-verified-cpu4x.json` contain the measurements above. Benchmark output also
includes the actual GPU, buffer, launch record, session state, and screenshots.
The reproduction script supports `DEV_URL`, `QUALITY`, `CPU_RATE`, `WIDTH`, and
`HEIGHT`; production URLs can use `?bench=1` for the benchmark hooks.

To try the new launch decision in the existing browser, select **Auto** in graphics
settings and reload the game. Saves and explicit manual quality choices are retained.
