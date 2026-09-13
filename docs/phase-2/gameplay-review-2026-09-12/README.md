# Gameplay review — September 12, 2026

This is the **Phase 2 baseline review**, moved from `docs/research/` on September 13. Its observations describe the reviewed build, not an automatically updated assessment of the latest game.

Open [English](index.html?lang=en) or [Tiếng Việt](index.html?lang=vi). The HTML also includes a language switch and remembers your selection. Open it through the development server or directly as a local HTML file.

| File | Purpose |
| --- | --- |
| [index.html](index.html) | Standalone interactive report with embedded screenshots |
| [review-data.json](review-data.json) | Grades, sources, market comparisons, design loops and 48 backlog entries |
| [review-text-en.json](review-text-en.json) | English text/attribute inventory used by localization |
| [translations.vi.json](translations.vi.json) | Vietnamese translation dictionary |
| [localize-report.mjs](localize-report.mjs) | Rebuilds the report's embedded language controls and dictionaries |
| [evidence](evidence/) | Play captures, simulation results, reproduction scripts and report checks |

The evidence includes 112 fresh-profile simulation runs (64 policy runs and 48 economy runs). These are balance probes, not 112 human playtests. The weighted grades are editorial judgments. Screenshots retain the gameplay language captured during the review; the report's explanations and captions support both languages.

Update implementation status in the [Phase 2 backlog](../backlog.md), and new decisions in the [implementation plan](../implementation-plan.md). Preserve this dated assessment for comparison; use a new dated review for reassessment.

The old report URL redirects here and preserves its language query and section anchor. The evidence remains beside this report so relative links and reproduction scripts continue to resolve.

Original gameplay captures, simulation data, reproduction scripts and QA result summaries remain trackable. Regenerated PNGs under `evidence/language-qa/` and `evidence/report-qa/` are local layout checks and are ignored; they are screenshots of this report rather than the game evidence supporting its findings.
