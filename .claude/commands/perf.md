---
description: Measure render, bake and tick cost on a throttled profile — run before and after a change
argument-hint: "[bake|render|bench|cull|all] [--label after]"
allowed-tools: Bash, Read
---

Measure what a change cost, on a CPU profile that resembles a phone. Argument: `$ARGUMENTS`
(default `bake`).

## 1 · Server

```bash
(nohup npx vite --host 127.0.0.1 --port 5199 --strictPort > /tmp/dev.log 2>&1 &)
sleep 6 && export DEV_URL=http://127.0.0.1:5199 BASE_URL=http://127.0.0.1:5199
```

## 2 · Pick the measurement

| Arg | Command | Answers |
|---|---|---|
| `bake` | `node test_scripts/perf/measure-bake.mjs` | how long a scenery re-ink and a full static bake take. Budget is **250ms**; the season turn measures 110–220ms, median ~170, against 1200–1500ms for a full refresh |
| `render` | `node test_scripts/perf/measure-render.mjs` | per-frame render cost with no tick |
| `bench` | `node test_scripts/perf/perf-bench.mjs --label <name>` | median tick ms, frame p50/p95/p99, object count, heap. Writes `test_scripts/perf-results/<label>.json` and **auto-diffs against `baseline.json`** when the label is not `baseline` |
| `cull` | `node test_scripts/verify/verify-culling.mjs` | that culling actually culls, and by how much |
| `all` | run bake, render and bench in sequence | |

For a before/after: run `--label baseline` on the unchanged tree, make the change, run
`--label after`, and quote the printed delta table. The reviewed baselines in `perf-results/`
are committed on purpose; new local runs are ignored by default. To preserve a reviewed new
reference, add its exact `.gitignore` exception and record its revision/fixture context; see
`test_scripts/perf-results/README.md`.

To isolate a cost, re-shoot the same frame with a layer switched off: `?nobake=1` (no
RenderTextures), `?nocull=1` (no view culling), `?nofx=1` (no full-screen paper pass),
`?noseason=1`, `?bakescale=0.5`.

## 3 · Read the numbers honestly

**Headless Chromium rasterises through SwiftShader, in software.** Fill rate is charged to the CPU
and is worth far more here than on a real phone GPU. So:

- **Transferable:** object counts, culled fraction, tick milliseconds, heap.
- **This machine only:** frame milliseconds and anything fill-rate bound.

Run-to-run spread on a throttled browser is wide. One green run near the budget line is weak
evidence — repeat it before trusting it. Say "3 runs, median X" rather than quoting a single
number.

## 4 · Report

The number, the budget it is measured against, and the delta from before. If it regressed, name
the layer: a repaint that should have been gated by one of the six render signatures
(`terrain | control | fog | roads | node | badge`) firing on every tick is the usual cause — check
whether a signature started including a field that changes constantly.

Stop any server you started.
