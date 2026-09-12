# Performance reference data

This folder contains reviewed historical baselines and local benchmark output.

[perf-bench.mjs](../perf/perf-bench.mjs) compares a labeled run against [baseline.json](baseline.json). The root `.gitignore` keeps the 11 existing reference files trackable while ignoring new run files by default. Their original dates/configurations are part of the evidence; they are not automatically current release targets.

- Run a local comparison with a new label, for example `node test_scripts/perf/perf-bench.mjs --label candidate`.
- Preserve raw output locally until it has been reviewed. To keep a new reference, choose a descriptive name, add its exact exception to the root `.gitignore`, and record revision, fixture and comparison context alongside it.
- Updating an existing baseline remains a visible Git change. `.gitignore` never stops tracking files already in the index.

The historical JSON snapshots and map screenshots stay in their original paths so existing tools and references keep working.
