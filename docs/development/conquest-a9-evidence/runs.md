# Controlled conquest comparison

All samples retained. Medians across five runs; CPU values are p95 frame work in milliseconds. A9: **not yet verified**.

| Profile | Workload | Baseline | Candidate | CPU change | Upload change | CPU gate |
|---|---|---:|---:|---:|---:|---|
| high | opening-touch | 4.60 | 4.10 | -10.87% | -41.08% | PASS |
| high | revealed-idle | 7.00 | 4.80 | -31.43% | -64.10% | PASS |
| high | revealed-touch | 7.40 | 6.00 | -18.92% | -58.95% | PASS |
| high | revealed-touch-cpu4 | 39.80 | 27.10 | -31.91% | -61.93% | PASS |
| medium | opening-touch | 4.40 | 3.90 | -11.36% | -38.67% | PASS |
| medium | revealed-idle | 6.50 | 4.90 | -24.62% | -61.17% | PASS |
| medium | revealed-touch | 7.70 | 6.00 | -22.08% | -56.53% | PASS |
| medium | revealed-touch-cpu4 | 37.40 | 23.80 | -36.36% | -58.92% | PASS |
| clarity | opening-touch | 4.90 | 4.00 | -18.37% | -35.27% | PASS |
| clarity | revealed-idle | 6.90 | 4.70 | -31.88% | -58.00% | PASS |
| clarity | revealed-touch | 8.70 | 6.10 | -29.89% | -53.79% | PASS |
| clarity | revealed-touch-cpu4 | 40.00 | 24.90 | -37.75% | -54.44% | PASS |

## All CPU p95 samples

- high / opening-touch: baseline [4.50, 4.60, 5.30, 4.90, 4.30]; candidate [4.50, 3.80, 4.10, 4.80, 3.50].
- high / revealed-idle: baseline [9.20, 6.20, 7.20, 7.00, 7.00]; candidate [5.30, 4.80, 4.20, 4.80, 5.10].
- high / revealed-touch: baseline [8.00, 6.50, 9.00, 7.40, 7.30]; candidate [6.60, 5.60, 5.20, 6.00, 6.40].
- high / revealed-touch-cpu4: baseline [45.80, 35.00, 45.20, 39.80, 35.20]; candidate [33.20, 24.50, 27.70, 27.10, 24.60].
- medium / opening-touch: baseline [4.50, 4.80, 4.40, 4.30, 4.40]; candidate [3.90, 3.90, 4.20, 3.70, 3.30].
- medium / revealed-idle: baseline [6.60, 7.20, 6.00, 6.50, 5.40]; candidate [4.90, 4.60, 4.60, 5.10, 5.00].
- medium / revealed-touch: baseline [6.90, 10.10, 8.00, 7.70, 6.40]; candidate [6.10, 5.90, 4.80, 6.00, 6.00].
- medium / revealed-touch-cpu4: baseline [42.80, 49.20, 37.40, 36.70, 34.40]; candidate [21.00, 22.40, 23.80, 24.20, 24.60].
- clarity / opening-touch: baseline [5.50, 4.70, 4.30, 5.50, 4.90]; candidate [4.20, 5.80, 3.90, 3.80, 4.00].
- clarity / revealed-idle: baseline [8.80, 10.40, 6.90, 6.10, 6.80]; candidate [5.10, 4.70, 4.60, 5.20, 4.60].
- clarity / revealed-touch: baseline [7.90, 11.10, 8.70, 7.00, 9.20]; candidate [6.20, 7.50, 4.90, 6.10, 5.20].
- clarity / revealed-touch-cpu4: baseline [34.80, 57.00, 40.00, 32.40, 53.40]; candidate [24.90, 26.10, 27.80, 22.40, 24.90].

Median of within-pair CPU percentage improvements (distinct from comparing the two medians above):

- high: 30.11%; all pairs [27.51, 30.00, 38.72, 31.91, 30.11].
- medium: 36.36%; all pairs [50.93, 54.47, 36.36, 34.06, 28.49].
- clarity: 30.86%; all pairs [28.45, 54.21, 30.50, 30.86, 53.37].

Visual-parameter parity: 15/15. Runtime failures: 0.

- prestep/postrender is main-thread frame work and submission, not physical frame presentation.
- Input latency is synthetic event timestamp to submission; physical touch-to-screen is unavailable.
- GPU timer queries and CPU/Chrome traces ran separately from timing windows.
- Desktop CPU throttling is supporting evidence, not a simulation of the A9 GPU, thermals or Android scheduling.
