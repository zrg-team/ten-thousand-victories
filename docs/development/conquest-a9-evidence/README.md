# Conquest performance review evidence

These files are exact copies of the final controlled desktop measurements, committed so PR reviewers can inspect every per-run/window result and the acceptance gaps without the original workstation.

- `report.json`: five-pair statistics, all individual measurements, parameter parity, failures, and separate trace-event summaries.
- `results.csv`: all 120 timing windows across baseline/candidate and High/Medium/Clarity.
- `runs.md`: readable per-run CPU values and aggregate comparisons.
- `acceptance.json`: measured gates, 30-minute soak, sixteen-cycle memory comparison, recovery, and remaining gaps.
- `source-normalization.json`: the single formatting-only source difference introduced while preparing the PR; all other measured inputs remain byte-identical.

The [implementation report](../conquest-a9-performance.md) records the frozen source/build identities, hardware, capture method, reproduction commands, and attribution limits. Full raw samples, CPU/browser traces, screenshots, and frozen build directories remain under the ignored local `output/a9-performance/` directory; they are not bundled in this PR.

Physical Samsung Galaxy Tab A9 performance is **not yet verified**. CPU/upload improvements do not establish an Android GPU, thermal, or physical touch-latency improvement. GPU duration increased, seasonal completion missed one second, and a flat heap trend remains unproven.
