# First implementation batch — trust and control

**Scope:** R00–R04, with the first R12 device/layout audit. **Status:** implementation not started. The [roadmap](implementation-roadmap.html) is available in English and Vietnamese; this file is the engineering checklist.

**Tóm tắt:** bắt đầu bằng mốc đo, sửa thông tin chinh phục/gia sản/hộp thoại, giữ tùy chọn người chơi, ổn định phím, rồi dự báo mặt trận. Chưa triển khai gameplay. Không đưa chương mới hoặc chỉnh kinh tế vào đợt sửa độ tin cậy này.

## Delivery order

Use small reviewable changes. Start R00 baseline capture, then R01 correctness fixes. R04 save auditing can proceed independently; R02 controls and R03 forecasts follow. A new analytics UI is not required before fixing a misleading label.

| Change | Deliverable | Evidence before completion |
| --- | --- | --- |
| 01 | R00 versioned baseline record and isolated fixtures | Repeatable seed/profile/mode results; current menu defaults captured alongside factory defaults |
| 02 | R01 conquest assessment semantics | Chance/progress/ETA fixtures and real EN/VI method cards |
| 03 | R01 opening inheritance predicate | Empty first house, Legacy-only, traits-only, slotted-hand and returning-house cases |
| 04 | R01 measured modal header | Short/wrapped titles, no subtitle, large text, short phone, tablet and desktop; resume actions still work |
| 05 | R02 pace/readability contract | Effective settings at waves 1, 10 and 30; Ascent → Skirmish → Ascent and restart |
| 06 | R02 pause, key ownership and command mode | Stable bindings, remapping conflicts, open overlays, held keys, scene shutdown, both platform entry flows |
| 07 | R03 front forecast | Early/late/blocked/recalling defender arrival and multiple simultaneous fronts |
| 08 | R04 recovery fixtures and milestone review | Manual/autosave distinction, denied writes, old snapshots, portable-store audit, initial real-device findings |

The order is an implementation sequence, not eight mandatory equal-sized PRs. Split a shared helper change if its effects need separate review. Do not combine economy coefficient tuning with these correctness changes.

## 01 — Baseline contract (B11)

- [ ] Record revision plus working-tree patch identifier, fixture version, seed, language, viewport/device, command mode, difficulty, pace, hints and profile contents.
- [ ] Use disposable browser contexts and reset **all** progression/preferences between fresh runs. Freeze a named progressed-profile fixture; do not use a developer's personal local storage.
- [ ] Record simulation ticks and wall-clock time separately. Keep existing simulation summaries as diagnostics, not a single pass/fail fun score.
- [ ] Store raw outcomes and a compact summary under a newly dated `docs/phase-2/evidence/` folder when implementation begins. Do not overwrite the September 12 baseline.
- [ ] Run 16 paired seeds with identical settings. Preserve failures, terminal reason, losses and invalid/stuck prompt cases; never drop inconvenient seeds.

Use [playtest-lib.mjs](../../test_scripts/playtest/playtest-lib.mjs) and [playtest-metrics.mjs](../../test_scripts/playtest/playtest-metrics.mjs); adapt the [fresh-profile driver](gameplay-review-2026-09-12/evidence/review-fresh-metrics.mjs). Run the baseline before behavior changes. A later package may extend the record schema; version it rather than silently changing the meaning of existing columns.

## 02 — Typed conquest assessments (B01, part of B42)

**Verified code finding:** `diplomacyOption` places clamped trust/threshold progress in `chance`, and the method card labels it as chance. The actual acquisition loop increases trust deterministically while an assigned envoy remains valid. Its gain also includes `acquisitionSpeedMult`, which the current option ETA omits.

- [ ] Define a discriminated assessment for `chance`, `progress` and `estimate` in [types.ts](../../src/state/types.ts). A progress percentage must not be accepted by a probability formatter.
- [ ] Share trust threshold and per-tick gain calculation between [ConquestSystem.ts](../../src/systems/ascent/ConquestSystem.ts) and [AcquisitionSystem.ts](../../src/systems/AcquisitionSystem.ts). Include the actually selected hero and court effects. Show estimates as estimates when future assignments/effects can change.
- [ ] Audit every `chance`, `bestChance` and `hasCertainMethod` consumer, including AI selection and queued prompts. Preserve intended selection behavior and refuse stale orders using current state.
- [ ] Old saved method prompts must be re-derived or normalized before rendering. Do not interpret an old diplomacy `chance` as a newly introduced probability.
- [ ] EN/VI card: cost, trust progress, estimated seasons, hero role being vacated and cancellation condition. Bribery remains a probability; siege remains a labeled estimate; diplomatic cancellation is not random failure.
- [ ] Acceptance fixtures cover court multiplier changes, hero replacement, zero/near-complete trust, unavailable hero, and canceled assignment. Confirm the resolver's acquisition rules are unchanged.

**Critique → tune:** replacing “certain” with a lower percentage would preserve the semantic bug. Separate quantities and share calculations; do not introduce random diplomatic failure to make the old UI true.

## 03 — Meaningful first inheritance (B05)

- [ ] Extract a read-only opening-benefit summary after `seedAscentOpening` and `applyOpeningHand`; derive it from actual Legacy, Dynasty, Cabinet and applied effects.
- [ ] Gate only the `inheritance` prompt in [GameState.ts](../../src/state/GameState.ts). Preserve coronation, mandate and founder sequencing and all applied bonuses.
- [ ] Empty slots and promises of future traits do not require a full-screen acknowledgement. Preserve a way to learn about inheritance in the existing Guide or collection flow.
- [ ] Test empty profile, Legacy-only bonuses, traits, slotted cards, unslotted owned cards, and a returning house with a relevant summary. A first-reign counter alone is not the predicate.
- [ ] Update [verify-inheritance-screen.mjs](../../test_scripts/verify/verify-inheritance-screen.mjs) to test meaningful behavior; explicitly retire any assertion requiring the empty first-reign screen.

**Critique → tune:** a simple `reigns > 0` check could hide genuine benefits on an imported or unusual profile. Inspect effective inheritance, not only reign count.

## 04 — Measured modal header (B06)

[InkUI.modal](../../src/ui/InkUI.ts) uses a fixed 104-unit header, title at y+18 and subtitle at y+58. [The resume offer](../../src/scenes/menu/shell.ts) also budgets a fixed header. A wrapped title can overlap before the body is involved.

- [ ] Measure wrapped title and subtitle before placing content. Reserve close-button clearance and maintain a minimum header rather than fixed title/subtitle positions.
- [ ] Derive `contentBounds` from the measured header and available viewport height. If the body cannot fit, use the existing scroll pattern; keep primary/close actions reachable.
- [ ] Audit modal call sites relying on a 104-unit header; correct their height contracts instead of compensating with extra blank space in resume alone.
- [ ] Visually verify EN/VI at 390×620, 390×844, 768×1024 and 1440×900, including large text. Check long-title, short-title and empty-subtitle cases and repeated open/close.

## 05 — Effective battle settings (B02, B03)

- [ ] Preserve existing preference keys in [battleOptions.ts](../../src/game/battleOptions.ts). Make enabled hints independent of enemy difficulty and wave. Add explicit bubble readability preference with a migration/default policy.
- [ ] Remove forced pace escalation. Keep enemy escalation separately visible and maintain player-selected challenge settings according to the documented campaign policy.
- [ ] Keep the current `beatsPerTick × tickMs` pairing in this initial change. It affects battle/economy timing: benchmark slow/normal/fast separately and do not claim identical balance across them. A simulation-clock redesign requires its own scoped decision if tests show this coupling defeats the intended control.
- [ ] Preserve the explicit Skirmish override within that fight; reset it and escalation context on scene exit, including error/restart paths.
- [ ] Revise [verify-escalation.mjs](../../test_scripts/verify/verify-escalation.mjs) because it currently asserts forced floors. Keep enemy-strength/cap checks; replace only assertions that contradict the new preference contract.
- [ ] Check actual rendered hints/bubbles and selected controls, not only getters. Cross wave threshold, reload, and return from Skirmish at easy/hard settings.

## 06 — Pause, fixed bindings and command mode (B04, B07, B24)

- [ ] Add one input ownership decision: text input → modal/decision → battle → map/lane. A higher owner consumes the key; no hidden world action should fire.
- [ ] Route Space to the existing battle pause action when a battle owns input, and to strategy pause on the map. Holding Space does not toggle repeatedly. Closing a menu restores its pre-open pause state.
- [ ] Replace lane numbering derived from dynamic [ActionBar](../../src/ui/ActionBar.ts) positions with named action bindings. Choose the current no-battle order as initial defaults; adding a Battle slot must not renumber Build or Court.
- [ ] Keep formation/stance shortcuts explicitly labeled as battle context. Add persistent remapping, conflict validation, reset defaults and a small visible shortcut reference. Never reserve browser/system shortcuts silently.
- [ ] Update hints and bindings through one map, including remaps. Test a held pan key while an overlay opens, front switches, scene teardown and resize.
- [ ] Explain `ascent.hardcore` as command automation/decision policy, distinct from battle difficulty. Preserve current platform defaults initially, but make either mode selectable in the existing start/menu flow and verify saved runs retain their own choice.

## 07–08 — Forecast and recovery prerequisites

R03 uses existing movement, supply and front membership readers. A forecast record should contain target, estimated arrival, committed attackers, defenders arriving in time, uncertainty and source turn. It must not count the same army twice across fronts or equate realm economic POWER with combat strength.

R04 should prove current save ownership and recovery before implementing new chapter state. The existing `endAscentRun` both marks defeat and banks progression; `clearFinishedRunSaves` removes terminal saves. Write down these contracts and create old/current fixtures now. Do not call either path to represent intermediate charter completion later.

## Batch exit and next decision

- [ ] Every selected item has evidence against its acceptance criteria in the [backlog](backlog.md), a linked implementation revision and any changed assumptions.
- [ ] No new reproducible console error, unreachable decision, save-loss case or hidden input leak in affected flows.
- [ ] The [validation matrix](validation-plan.md) passes its software checks; physical checks are explicitly passed or still open.
- [ ] Review idea → criticism → tuned implementation → observed result. Repeat failing items or narrow scope before starting R05–R08.

Use existing relevant harnesses listed in the roadmap; extend them with new behavioral assertions where necessary. Run `yarn build` once the behavior changes are integrated. Do not rerun all balance and performance suites after a copy/layout-only fix; run them when the changed system or an unresolved finding warrants it.
