# Phase 2 validation plan

**Status:** proposed protocol, not measured results. This document defines how to decide whether an implementation is correct, readable and worth retaining. See the [bilingual roadmap](implementation-roadmap.html) and [first batch](first-implementation-batch.md).

**Tóm tắt:** tiêu chí dưới đây là mục tiêu thử nghiệm, chưa phải kết quả. Kiểm tra phần mềm, quan sát người chơi và đo trên thiết bị thật là ba loại bằng chứng riêng. Không dùng điểm mô phỏng để kết luận game vui.

## Evidence contract

Each evidence bundle must identify revision plus uncommitted patch, date, fixture/schema version, seeds, profile data, language, input/command mode, difficulty, pace, assistance, viewport/DPR, graphics preset, browser/shell and hardware where applicable. Record invalid runs and the reason; do not silently remove them.

Use a newly dated folder under `docs/phase-2/evidence/` for implementation results. Link summaries from the backlog; keep raw JSON, screenshots, interaction notes and reproduction commands beside them. Preserve the original review as the historical baseline.

## Software matrix

| Dimension | Required coverage |
| --- | --- |
| Layout and language | EN and VI at short phone 390×620, phone 390×844, tablet 768×1024 and desktop 1440×900; inspect 320-wide as a stress case unless explicitly supported |
| Profiles | Empty first house; named frozen progressed fixture; Legacy-only; slotted-card/trait inheritance; old snapshot without new fields |
| Commands | Assisted and Hands-on on both layouts; actual menu start and direct fixture start explicitly distinguished |
| Settings | Easy/hard plus selected slow/normal/fast; hints on/off; bubble readability; waves 1/10/30; Ascent/Skirmish transition |
| Input ownership | Touch, keyboard and pointer; active modal, open lane, battle, held keys, remapped keys, disabled/stale actions |
| Persistence | Manual/autosave distinction; reload/background/offline resume; unavailable storage; stale/malformed new fields; interruption during reward writes |
| Strategic fixtures | Early/late/blocked reinforcements, two fronts competing for a host, capital grace, resource deficit and reserve deadlock |

Do not run the Cartesian product after every small change. Use targeted fixtures for affected rules, pairwise settings coverage, and complete layout/language checks on changed screens. Run one integrated smoke per milestone. A known old assertion that enforces a retired behavior must be deliberately rewritten, not ignored wholesale.

## Human playtest loop

Start with **six mobile participants and six desktop participants per formative round**, including both English and Vietnamese readers and mixed strategy experience. This is a proposed recruitment target; nobody has been recruited. Use at least three readers of each language across the round. These small samples find usability problems; they do not establish population retention or statistically reliable preference differences.

1. Record experience and chosen settings. Let the person use their preferred reading language and control mode.
2. Ask them to start a fresh run, explain their immediate goal, make a conquest/economy decision, prepare for a threat, fight or delegate, and stop/resume.
3. Observe without coaching. Record time to first meaningful choice, wrong taps, unread decisions, interruptions, pauses, goal comprehension and abandonment reason.
4. After the result, ask what caused it, what they would change, whether they want another chapter/build, and why. Record intention separately from actual continuation.
5. For an iteration comparison, use matched tasks and counterbalance order where practical; record learning effects. Do not interpret a repeated seed as a fresh first-play experience.
6. Critique the result, tune one major variable and repeat. Keep rejected ideas and zero-improvement findings in the decision log.

## Proposed decision gates

These are initial design targets. Confirm or revise them after the first baseline round, **before** judging the next revision. Always show participant counts and denominator, including early exits.

| Outcome | Initial target / decision rule |
| --- | --- |
| Decision comprehension | At least 5 of 6 testers in each platform cohort can identify the immediate goal, the selected action's main cost and whether a displayed percentage is chance or progress, without coaching |
| Reward comprehension | At least 5 of 6 in each cohort correctly classify three examples as this-reign, collection or next-reign effects |
| First meaningful choice | Report median and range versus the baseline; remove the empty inheritance acknowledgement without making understanding worse. Set a time target after baseline observation |
| Optional interruption load | Initial design: at most one unsolicited optional full-screen prompt per preparation phase. Compare interruption count and abandoned plans; urgent/requested decisions are exempt and must remain reachable |
| Mobile intent command | A familiar host receives a legal intent in at most three major taps, with target and arrival visible before commitment |
| Short charter length | Hypothesis: 8–12 minutes including reading for typical mobile finishers; report all attempts and incomplete sessions separately. Adjust horizon/pacing after actual timing |
| Extended charter length | Hypothesis: 20–35 minutes for an optional desktop objective that changes priorities; longer duration alone is not success |
| Desire to continue | Review hypothesis: at least 70% of finishers want another chapter or build. Show counts, actual continuation and the all-starters result too; never conceal dropouts or treat intention as retention |
| Strategic diversity | At least three competent plans have demonstrable use cases and costs; investigate dominance by seed/threat/profile, not just average survival |
| Reliability | No reward duplication/loss, unreachable required action or reproducible input leak in the targeted fixtures; a failing invariant blocks that item |

## Balance protocol

- R00: 16 paired seeds for the baseline and obvious regressions. R06: matched preparation ablations before coefficient changes. R10: 32–64 paired seeds comparing three reviewed competent plans.
- Hold map seed, profile, command policy, enemy difficulty, pace and assistance constant within a comparison. Report each profile and pace separately. The current pace implementation changes beats per economy tick, so these contexts are not interchangeable.
- Use objective success, capital/land retained, casualties, resource runway, time and draft dead ends. Preserve waves survived and stockpiles as secondary context.
- Report paired differences and uncertainty where useful. If an interval includes zero, keep the finding uncertain. A scripted policy result does not prove what a human expert can do.
- Inspect at least several successful and failed seeds manually before concluding a plan is weak. Compare reward-per-minute and repeated early banking when testing finite chapters.
- Any rule adjustment needs a stated prediction and a comparison against the prior revision. Avoid simultaneously changing income, adaptation and draft weights; that makes causes hard to identify.

## Physical-device and performance gate

Name the supported low-end phone, representative phone and tablet before signing off. Record OS, shell/browser, refresh rate and graphics setting. Emulators are useful functional evidence, but do not close B36 or B39's physical-device requirements.

Run 20 minutes on a production build, alone, with crowded battles, repeated sheet use and background/resume. Follow the [existing performance protocol](../development/performance.md). Capture frame-time distribution, input latency, memory trend, thermal degradation and recovery. Compare the same fixture on the same hardware; do not compare an isolated production result with a hot-reloading development session.

Initial regression rule: investigate a repeatable degradation greater than 10% in p95 frame time or input latency against that device's baseline, and any persistent memory growth after returning to the same scene. The 10% threshold is a proposed engineering trigger, not a universal hardware standard. Establish an absolute usable target from the selected device before release; a weak baseline alone is not acceptable.

Audit touch spacing and wrong taps with physical hands; audit keyboard focus, colour-independent cues, text access and alternatives to hold/swipe after scaling. Record any substantial semantic-layer work as a separately estimated follow-up; do not imply broad accessibility completion from a canvas screenshot.

## Rollout and rollback

1. Correctness fixes can ship in small batches after their targeted checks. Keep charter, automation-policy and draft experiments separately selectable during development so effects can be compared.
2. Preferences stay in their existing persistence scope. New snapshot fields need defaults for old saves. Export/recovery logic must retain manual and automatic save ownership.
3. Chapter completion uses a durable pending transaction and receipts in affected stores. Inject a failure before/after each write and retry on load; an in-memory boolean is insufficient for cross-store crash recovery.
4. A rollback may hide an experimental entry point, but must retain readers for already-written state and preserve earned rewards. Verify old and new fixtures before reverting a persistence change.
5. Release a milestone only when its selected backlog items have linked revisions and evidence. Missing human or hardware evidence stays open. Re-estimate optional work from the core results.
