<!-- Generated from implementation-roadmap.json by build-implementation-roadmap.mjs. -->
# Phase 2 implementation roadmap

[English](implementation-plan.md) · [Tiếng Việt](implementation-plan.vi.md) · [HTML](implementation-roadmap.html?lang=en)

**2026-09-13 · Plan scoped; gameplay implementation not started**

Make the existing decisions trustworthy, finish a satisfying reign, then prove strategic mastery. Start with R00 baseline capture and R01 correctness fixes.

Planning complete for the next batch; no gameplay implementation is claimed. Backlog status remains authoritative.

[First batch checklist (English)](first-implementation-batch.md) · [Validation protocol (English)](validation-plan.md) · [Live backlog](backlog.md) · [Baseline review](gameplay-review-2026-09-12/index.html?lang=en)

## Inspected code baseline

3914a9db + current working tree, 2026-09-13.

- B01: diplomacy is deterministic trust accumulation while the assignment remains valid; its current percentage is progress. Its ETA omits a court multiplier. Fix the quantity model, not merely the adjective.
- B02/B03: preference storage exists; effective wave/difficulty rules override pace and guidance. Speed also changes beats per economy tick, so benchmark it as a distinct balance context.
- B04/B24: battle pause already exists, but Space explicitly skips it; lane digits are derived from the changing action bar. Share existing actions through stable context bindings.
- B05/B06: inheritance is deliberately queued for every new run; modal title/subtitle positions are fixed. Gate effective inheritance and measure wrapped text in the shared primitive.
- B12/B13: first boss is currently wave 4. endAscentRun marks defeat and banks multiple stores; terminal cleanup clears saves. Intermediate chapters require a separate recoverable state transition.

## Delivery sequence

1. Start: R00 + R01; audit saves in R04. R02 controls and R03 forecasts complete Milestone 1. Begin R12 device/comfort checks now.
2. Then: R05 rhythm, R06 preparation/automation and R07 reward clarity. R08 charter requires these plus R04 recovery. R09 aftermath completes the session feedback.
3. Then: R10 verifies viable plans; R11 provides optional platform command tools. Complete relevant R12 access/performance gates before the core milestone is accepted.
4. Only after core evidence: choose R13–R16 experiments with demonstrated benefit. B43–B48 stay Deferred in R17. Do not start every optional package automatically.

- M1: trustworthy quantities, meaningful opening, persistent controls, comparable fronts and verified recovery fixtures. No new input leaks or unreachable actions.
- M2: one understandable charter can be won, banked, resumed or continued without reward duplication. Preparation and aftermath have evidence beyond a survival score.
- M3: three competent plans have distinct use cases; mobile and desktop commands use the same legal simulation actions. Human and physical-device evidence is attached.

## Core effort envelope

Planning assumption: one experienced engineer familiar with this repository, with playtest/device access arranged separately. Estimates include engineering and targeted QA, exclude recruiting, unavailable hardware and store submission, and are not delivery commitments. Re-estimate after R00/R01.

| Scope | engineer-days |
| --- | --- |
| Milestone 1 · Trust and control (R00–R04) | 18–31 |
| Core R00–R12, including Milestone 1 | 69–117 |
| Conditional experiments R13–R16 | +22–38 |

## Work packages

| ID | Work package | Backlog | Dependencies | engineer-days |
| --- | --- | --- | --- | --- |
| [R00](#r00) | Establish a trustworthy baseline | B11 | — | 3–5 |
| [R01](#r01) | Fix misleading decisions and the opening | B01, B05, B06, B42 | — | 3–5 |
| [R02](#r02) | Respect pace, assistance and commands | B02, B03, B04, B07, B24 | — | 6–10 |
| [R03](#r03) | Make front forecasts comparable | B10 | R00 | 3–5 |
| [R04](#r04) | Establish recovery and migration fixtures | B41 | — | 3–6 |
| [R05](#r05) | Give the session a readable rhythm | B08, B09 | R00, R02 | 4–7 |
| [R06](#r06) | Prove preparation pays, then expose automation budgets | B15, B16, B17, B18 | R00, R02, R03 | 7–12 |
| [R07](#r07) | Clarify rewards and inheritance | B19, B30 | R01 | 4–6 |
| [R08](#r08) | Prototype one complete Ascent charter | B12, B13, B14 | R04, R05, R06, R07 | 10–16 |
| [R09](#r09) | Explain the decisive battle moment | B27 | R00, R03 | 3–5 |
| [R10](#r10) | Validate three coherent strategic plans | B20, B21, B22, B23 | R00, R06, R07 | 8–14 |
| [R11](#r11) | Add optional command depth for each platform | B25, B26 | R02, R03, R06 | 8–14 |
| [R12](#r12) | Validate comfort, access and sustained performance | B36, B37, B38, B39 | — | 7–12 |
| [R13](#r13) | Trial a bounded practice replay | B28 | R00, R09 | 5–8 |
| [R14](#r14) | Expand encounters after strategic validation | B29, B34, B35 | R03, R10 | 8–14 |
| [R15](#r15) | Offer a normalized, shareable challenge | B31, B40 | R00, R07, R10 | 5–9 |
| [R16](#r16) | Clarify commitments and capital recovery | B32, B33 | R01, R03, R06, R11 | 4–7 |
| [R17](#r17) | Keep major expansion out of the current delivery | B43, B44, B45, B46, B47, B48 | — | — |

## R00

**Establish a trustworthy baseline** · Milestone 1 · Trust and control

[B11](backlog.md#b11)

**Dependencies:** No package dependency; revalidate current behavior first

**Player benefit:** Make changes comparable across fresh and progressed profiles, command modes and layouts.

**Critique / risk:** A high automated score can hide unreadable decisions. More telemetry alone does not measure enjoyment.

**Tuned implementation scope:**

1. Extend the existing playtest harness with a versioned result record, isolated storage and declared rule/preferences presets.
2. Record seed, revision, profile, mode, objective, losses, land, resource runway, modal count and outcomes. Measure reading time only in real-time sessions.
3. Capture 16 paired baseline seeds; reuse the review's fresh-profile drivers and keep human observations separate from simulation summaries.

**Completion gate:** Two runs of one declared fixture agree on deterministic outputs; fresh and progressed results cannot mix silently. A baseline artifact and a human-session sheet exist.

**Existing code and references:**

- [test_scripts/playtest/playtest-lib.mjs](../../test_scripts/playtest/playtest-lib.mjs)
- [test_scripts/playtest/playtest-metrics.mjs](../../test_scripts/playtest/playtest-metrics.mjs)
- [docs/phase-2/gameplay-review-2026-09-12/evidence/review-fresh-metrics.mjs](../../docs/phase-2/gameplay-review-2026-09-12/evidence/review-fresh-metrics.mjs)

**Existing checks to extend:**

```text
node test_scripts/playtest/playtest-metrics.mjs --seeds 16 --ticks 600 --json
```

## R01

**Fix misleading decisions and the opening** · Milestone 1 · Trust and control

[B01](backlog.md#b01) · [B05](backlog.md#b05) · [B06](backlog.md#b06) · [B42](backlog.md#b42)

**Dependencies:** No package dependency; revalidate current behavior first

**Player benefit:** Show what a number means and get a new player to the first useful choice without empty ceremony.

**Critique / risk:** Diplomacy's percentage is trust progress, not a random success chance. Removing empty inheritance must not hide real opening benefits; changing a shared modal can affect other screens.

**Tuned implementation scope:**

1. Introduce a typed conquest assessment separating chance, progress and estimate. Reuse the actual acquisition gain including court multipliers; describe cancellation conditions.
2. Derive an effective opening-inheritance summary from Legacy, Dynasty and Cabinet state. Skip only when it has no actionable or applied benefit; keep an optional explanation in the existing guide.
3. Measure wrapped title/subtitle heights in the modal helper and allocate content/scroll space. Apply a bilingual glossary for chance, progress, seasons and reward scope.

**Completion gate:** Diplomacy never labels trust as odds; previews reconcile with unchanged-state execution. Fresh/returning openings preserve all benefits. No title, subtitle or button overlap in the validation matrix.

**Existing code and references:**

- [src/systems/ascent/ConquestSystem.ts](../../src/systems/ascent/ConquestSystem.ts)
- [src/systems/AcquisitionSystem.ts](../../src/systems/AcquisitionSystem.ts)
- [src/state/types.ts](../../src/state/types.ts)
- [src/state/GameState.ts](../../src/state/GameState.ts)
- [src/scenes/conquest/prompts/inheritance.ts](../../src/scenes/conquest/prompts/inheritance.ts)
- [src/scenes/conquest/prompts/conquest.ts](../../src/scenes/conquest/prompts/conquest.ts)
- [src/ui/InkUI.ts](../../src/ui/InkUI.ts)
- [src/scenes/menu/shell.ts](../../src/scenes/menu/shell.ts)
- [src/i18n/catalogs/ascent.ts](../../src/i18n/catalogs/ascent.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-conquest-offer.mjs
node test_scripts/verify/verify-inheritance-screen.mjs
node test_scripts/verify/verify-resume.mjs
```

## R02

**Respect pace, assistance and commands** · Milestone 1 · Trust and control

[B02](backlog.md#b02) · [B03](backlog.md#b03) · [B04](backlog.md#b04) · [B07](backlog.md#b07) · [B24](backlog.md#b24)

**Dependencies:** No package dependency; revalidate current behavior first

**Player benefit:** Keep chosen reading time and guidance available while making input predictable on either platform.

**Critique / risk:** Independent settings already exist but effective settings override them. Slow currently changes beats per economy tick, so pacing is not balance-neutral. Context keys need explicit ownership.

**Tuned implementation scope:**

1. Retain existing preference keys; remove forced pace/hint suppression and separate bubble readability from enemy difficulty. Show effective enemy tier if campaign escalation remains.
2. Keep the current simulation/display clock pair in the first patch; test each pace as its own balance context. Prevent Skirmish bubble overrides leaking into Ascent.
3. Route Space to the active world's or battle's pause action; menus and text input own keys while open. Use stable action IDs, visible hints and conflict-checked remapping instead of dynamic bar indices.
4. Explain Hands-on versus assisted command in the existing opening/menu flow, allow both on both platforms, and record the actual hardcore flag in benchmarks.

**Completion gate:** Slow and enabled guidance remain selected at waves 1/10/30, after reload and after Skirmish. No leaked orders behind overlays; a changing front never changes the Build binding. Pace effects are reported, not assumed equal.

**Existing code and references:**

- [src/game/battleOptions.ts](../../src/game/battleOptions.ts)
- [src/game/ascentConfig.ts](../../src/game/ascentConfig.ts)
- [src/input/desktopKeys.ts](../../src/input/desktopKeys.ts)
- [src/ui/ActionBar.ts](../../src/ui/ActionBar.ts)
- [src/scenes/SettingsScene.ts](../../src/scenes/SettingsScene.ts)
- [src/scenes/menu/front.ts](../../src/scenes/menu/front.ts)
- [src/scenes/conquest/battle/shell.ts](../../src/scenes/conquest/battle/shell.ts)
- [src/scenes/conquest/battle/dock.ts](../../src/scenes/conquest/battle/dock.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-battle-options.mjs
node test_scripts/verify/verify-escalation.mjs
node test_scripts/verify/verify-battle-pacing.mjs
node test_scripts/verify/verify-desktop-layout.mjs
```

## R03

**Make front forecasts comparable** · Milestone 1 · Trust and control

[B10](backlog.md#b10)

**Dependencies:** [R00](#r00)

**Player benefit:** Let the player judge whether defence can reach a threatened place in time.

**Critique / risk:** Realm POWER includes economy. Replacing it with another unlabeled total would retain the confusion; a live estimate cannot promise a frozen future.

**Tuned implementation scope:**

1. Create a read-only front forecast with target, ETA, attackers, defenders ready by arrival and assumptions.
2. Use existing movement/supply and defence readers; keep strategic realm POWER separately labeled.
3. Refresh estimates when orders change and distinguish announced commitments from uncertain reinforcements.

**Completion gate:** Controlled arrival fixtures reconcile with actual participants; late, blocked and recalled defenders are not counted as ready.

**Existing code and references:**

- [src/systems/ascent/PowerSystem.ts](../../src/systems/ascent/PowerSystem.ts)
- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/systems/ascent/fronts.ts](../../src/systems/ascent/fronts.ts)
- [src/systems/WarSystem.ts](../../src/systems/WarSystem.ts)
- [src/ui/ascent/AscentHud.ts](../../src/ui/ascent/AscentHud.ts)
- [src/scenes/conquest/screens/warBoard.ts](../../src/scenes/conquest/screens/warBoard.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-fronts.mjs
node test_scripts/verify/verify-invasion-reach.mjs
```

## R04

**Establish recovery and migration fixtures** · Milestone 1 · Trust and control

[B41](backlog.md#b41)

**Dependencies:** No package dependency; revalidate current behavior first

**Player benefit:** Know exactly what survives restart before adding chapters or reward transactions.

**Critique / risk:** Manual saves, autosaves and progression stores have different ownership. Cloud sync would add an unrelated failure surface.

**Tuned implementation scope:**

1. Inventory snapshot, Legacy, Dynasty, Cabinet and preference storage; document what an export must include and exclude.
2. Create disposable old/current-save fixtures and prove recovery after write failure, backgrounding and terminal cleanup.
3. Audit portable backup/restore across declared supported shells. Report unavailable-device checks as pending; fix proven migration gaps before chapter work.

**Completion gate:** The storage contract and migration fixtures pass without overwriting a player's manual save. Cross-shell results explicitly name tested origins/devices and unresolved checks.

**Existing code and references:**

- [src/state/save.ts](../../src/state/save.ts)
- [src/state/legacy.ts](../../src/state/legacy.ts)
- [src/state/dynasty.ts](../../src/state/dynasty.ts)
- [src/state/cabinet.ts](../../src/state/cabinet.ts)
- [src/game/awayPause.ts](../../src/game/awayPause.ts)
- [src/game/resilience.ts](../../src/game/resilience.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-save-lifecycle.mjs
node test_scripts/verify/verify-resume.mjs
```

## R05

**Give the session a readable rhythm** · Milestone 2 · A complete session

[B08](backlog.md#b08) · [B09](backlog.md#b09)

**Dependencies:** [R00](#r00), [R02](#r02)

**Player benefit:** Make preparation time usable and tell players what phase they are in.

**Critique / risk:** A blanket modal cap can hide famine or invasion decisions; queued events can expire or starve behind repeated prompts.

**Tuned implementation scope:**

1. Extend the current priority queue with urgent, player-requested and optional presentation policies; preserve valid choices and deduplicate stale advice.
2. Initially allow at most one unsolicited optional full-screen prompt per preparation phase; keep remaining advice in the existing affairs/notification flow.
3. Expose aftermath, court and muster with next commitment and clock state. Tune the initial budget from observed sessions.

**Completion gate:** Urgent and requested decisions remain reachable, optional prompts do not starve, and testers can name the current phase and next commitment.

**Existing code and references:**

- [src/systems/ascent/AscentState.ts](../../src/systems/ascent/AscentState.ts)
- [src/systems/ascent/DecisionDirector.ts](../../src/systems/ascent/DecisionDirector.ts)
- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/scenes/conquest/prompts/router.ts](../../src/scenes/conquest/prompts/router.ts)
- [src/scenes/conquest/screens/affairs.ts](../../src/scenes/conquest/screens/affairs.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-prompt-stack.mjs
node test_scripts/verify/verify-claiming-window.mjs
```

## R06

**Prove preparation pays, then expose automation budgets** · Milestone 2 · A complete session

[B15](backlog.md#b15) · [B16](backlog.md#b16) · [B17](backlog.md#b17) · [B18](backlog.md#b18)

**Dependencies:** [R00](#r00), [R02](#r02), [R03](#r03)

**Player benefit:** Make investment and delegated actions produce understandable tradeoffs.

**Critique / risk:** Buffing income can simply feed adaptation. Fixed forecasts can be exploited, and reserves can deadlock an otherwise helpful autopilot.

**Tuned implementation scope:**

1. Run paired preparation ablations before changing coefficients; log every wave-budget contribution and retain zero/negative results.
2. Extract shared cost, upkeep, completion and resource-runway readers. Freeze only the announced near-term invasion commitment and disclose later adaptation.
3. Add explicit gold/food/supply reserves and next-action explanations to current autopilot. Manual orders remain authoritative; surface reserve deadlocks with an optional override.

**Completion gate:** Wave-budget breakdown reconciles; players can explain a purchase's opportunity cost; paired outcomes show where preparation helps. No silent overspend or indefinite reserve deadlock.

**Existing code and references:**

- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/systems/ResourceSystem.ts](../../src/systems/ResourceSystem.ts)
- [src/systems/ascent/SupplySystem.ts](../../src/systems/ascent/SupplySystem.ts)
- [src/systems/ascent/AutopilotSystem.ts](../../src/systems/ascent/AutopilotSystem.ts)
- [src/systems/ascent/priceScale.ts](../../src/systems/ascent/priceScale.ts)
- [src/scenes/conquest/screens/build.ts](../../src/scenes/conquest/screens/build.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-economy.mjs
node test_scripts/verify/verify-delegation.mjs
```

## R07

**Clarify rewards and inheritance** · Milestone 2 · A complete session

[B19](backlog.md#b19) · [B30](backlog.md#b30)

**Dependencies:** [R01](#r01)

**Player benefit:** Let players distinguish a run's power from owned cards and next-run benefits.

**Critique / risk:** A new summary can become a fourth progression system. Renaming must not alter ownership or duplicate payout calculations.

**Tuned implementation scope:**

1. Use consistent scope labels: this reign, collection and next reign, across draft, Cabinet and result screens.
2. Build one read-only summary from existing inheritance readers and stores; retain entry points to detailed collections.
3. Run a three-reward sorting task in both languages before revising reward economics.

**Completion gate:** Players classify all three example scopes without coaching; existing card copies, traits, balances and payout totals remain intact.

**Existing code and references:**

- [src/systems/ascent/Inheritance.ts](../../src/systems/ascent/Inheritance.ts)
- [src/state/legacy.ts](../../src/state/legacy.ts)
- [src/state/dynasty.ts](../../src/state/dynasty.ts)
- [src/state/cabinet.ts](../../src/state/cabinet.ts)
- [src/scenes/CabinetScene.ts](../../src/scenes/CabinetScene.ts)
- [src/scenes/conquest/prompts/run.ts](../../src/scenes/conquest/prompts/run.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-inheritance.mjs
node test_scripts/verify/verify-cabinet.mjs
node test_scripts/verify/verify-dynasty.mjs
```

## R08

**Prototype one complete Ascent charter** · Milestone 2 · A complete session

[B12](backlog.md#b12) · [B13](backlog.md#b13) · [B14](backlog.md#b14)

**Dependencies:** [R04](#r04), [R05](#r05), [R06](#r06), [R07](#r07)

**Player benefit:** Offer a real win and a safe stopping point, with a meaningful option to continue.

**Critique / risk:** The current terminal function marks defeat, banks several stores and blocks later saves. Reusing it for an intermediate chapter would corrupt continuation or duplicate rewards.

**Tuned implementation scope:**

1. Prototype holding the capital through the first great invasion while retaining one chosen border. Current boss cadence is every four waves, so wave 4 is the first candidate horizon; tune it from observed session time.
2. Add versioned charter/chapter progress and explicit active, complete, bank-and-end and continue transitions. Intermediate completion must not call endAscentRun or terminal save cleanup.
3. Use a durable reward receipt/journal keyed by run and chapter; save a recoverable pending choice before showing the result. Make each affected store apply a receipt at most once, then recover partial writes.
4. Offer bank-and-end, a second chapter or Endless. Prototype one longer objective that changes priorities; tune reward-per-time to avoid an early-bank farm.

**Completion gate:** Victory is distinguishable from defeat; chapter choices and rewards survive restart/offline use. Repeated clicks, reloads and injected partial writes neither duplicate nor lose rewards. Continuation remains playable.

**Existing code and references:**

- [src/state/types.ts](../../src/state/types.ts)
- [src/state/save.ts](../../src/state/save.ts)
- [src/systems/ascent/AscentTick.ts](../../src/systems/ascent/AscentTick.ts)
- [src/systems/ascent/AscentResolver.ts](../../src/systems/ascent/AscentResolver.ts)
- [src/systems/ascent/Ceremony.ts](../../src/systems/ascent/Ceremony.ts)
- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/scenes/conquest/prompts/run.ts](../../src/scenes/conquest/prompts/run.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-save-lifecycle.mjs
node test_scripts/verify/verify-dynasty.mjs
node test_scripts/verify/verify-cabinet.mjs
```

## R09

**Explain the decisive battle moment** · Milestone 2 · A complete session

[B27](backlog.md#b27)

**Dependencies:** [R00](#r00), [R03](#r03)

**Player benefit:** Turn a result into a useful next decision.

**Critique / risk:** A confident causal sentence can invent certainty from correlated events.

**Tuned implementation scope:**

1. Record bounded battle events with turn/beat and participants; preserve named commanders and existing casualty summaries.
2. Show one verifiable observation such as late reinforcement or a sustained counter matchup, with a link to the relevant timeline.
3. Keep uncertain explanations labeled and expose detailed numbers on demand.

**Completion gate:** Every highlighted claim is traceable to recorded events; the record is bounded and save/reload does not change its meaning.

**Existing code and references:**

- [src/systems/ascent/battleReport.ts](../../src/systems/ascent/battleReport.ts)
- [src/systems/ascent/BattleSystem.ts](../../src/systems/ascent/BattleSystem.ts)
- [src/scenes/conquest/screens/aftermath.ts](../../src/scenes/conquest/screens/aftermath.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-aftermath.mjs
node test_scripts/verify/verify-costly-victory.mjs
```

## R10

**Validate three coherent strategic plans** · Milestone 3 · Mastery and command

[B20](backlog.md#b20) · [B21](backlog.md#b21) · [B22](backlog.md#b22) · [B23](backlog.md#b23)

**Dependencies:** [R00](#r00), [R06](#r06), [R07](#r07)

**Player benefit:** Reward mastery through different priorities rather than a larger pool of modifiers.

**Critique / risk:** Equal average survival does not prove distinct viable builds; a weak scripted policy can make a good strategy look bad.

**Tuned implementation scope:**

1. Define competent economy/logistics, defensive and offensive plans using the existing pool; review decisions by hand on shared seeds.
2. Compare 32–64 paired seeds with declared modes and profile presets, including objective wins, losses and conditional matchups. Tune two existing card interactions only after the audit.
3. Show doctrine strengths/costs and next automation intent; show the opportunity cost at every hero assignment entry point.

**Completion gate:** Each plan has an evidenced use case and cost; no uninvestigated universally dominant pick remains in the tested pool. Hero previews match the role actually vacated.

**Existing code and references:**

- [src/data/ascentCards.ts](../../src/data/ascentCards.ts)
- [src/systems/ascent/PowerDraftSystem.ts](../../src/systems/ascent/PowerDraftSystem.ts)
- [src/systems/ascent/RealmDoctrineSystem.ts](../../src/systems/ascent/RealmDoctrineSystem.ts)
- [src/systems/ascent/CourtLaneSystem.ts](../../src/systems/ascent/CourtLaneSystem.ts)
- [src/scenes/conquest/screens/court.ts](../../src/scenes/conquest/screens/court.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-draft-depth.mjs
node test_scripts/verify/verify-hero-actions.mjs
```

## R11

**Add optional command depth for each platform** · Milestone 3 · Mastery and command

[B25](backlog.md#b25) · [B26](backlog.md#b26)

**Dependencies:** [R02](#r02), [R03](#r03), [R06](#r06)

**Player benefit:** Desktop compares and queues; mobile issues concise intent orders under the same simulation rules.

**Critique / risk:** A large workspace can obscure the map. More taps or mandatory micromanagement would undermine the phone experience.

**Tuned implementation scope:**

1. Desktop first slice: pin two provinces/fronts, compare ready defence and route ETA, then queue one order with cancel/reorder feedback.
2. Mobile first slice: select host, intent, target/confirm in at most three major taps for a familiar host; show arrival and commitment before execution.
3. Reuse existing order validation and preserve intent through sheet closure; bound mounted rows and reuse current virtualization.

**Completion gate:** Both interfaces produce equivalent legal orders; input counts and map visibility meet the scoped tasks. Dead routes, unavailable hosts and stale selections are explained safely.

**Existing code and references:**

- [src/systems/ascent/armyOrders.ts](../../src/systems/ascent/armyOrders.ts)
- [src/systems/ascent/StandingOrders.ts](../../src/systems/ascent/StandingOrders.ts)
- [src/scenes/conquest/screens/army.ts](../../src/scenes/conquest/screens/army.ts)
- [src/scenes/conquest/screens/armyTargets.ts](../../src/scenes/conquest/screens/armyTargets.ts)
- [src/scenes/conquest/screens/warBoard.ts](../../src/scenes/conquest/screens/warBoard.ts)
- [src/input/desktopKeys.ts](../../src/input/desktopKeys.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-land-command.mjs
node test_scripts/verify/verify-desktop-layout.mjs
```

## R12

**Validate comfort, access and sustained performance** · Throughout · Comfort and reliability

[B36](backlog.md#b36) · [B37](backlog.md#b37) · [B38](backlog.md#b38) · [B39](backlog.md#b39)

**Dependencies:** No package dependency; revalidate current behavior first

**Player benefit:** Keep every milestone usable on real devices, including larger text and alternative input.

**Critique / risk:** Canvas screenshots do not establish thumb comfort or semantic access. A short desktop benchmark cannot establish thermal phone performance.

**Tuned implementation scope:**

1. Audit the first batch on a declared low-end phone and tablet; measure wrong taps, target spacing and the short-screen decision flow.
2. Add readable scale through existing layout primitives, then audit focus order, colour-independent cues, text access and hold/swipe alternatives. Scope any major semantic-layer work from findings.
3. Run an isolated 20-minute production-build soak with busy battles and background/resume; compare frame time, input latency, memory and recovery with the same device baseline.

**Completion gate:** No inaccessible required decision or clipped primary action in the tested matrix. Physical-device results name hardware and settings; missing device evidence remains an open gate, not a pass.

**Existing code and references:**

- [src/ui/InkUI.ts](../../src/ui/InkUI.ts)
- [src/platform/layout.ts](../../src/platform/layout.ts)
- [src/game/renderProfile.ts](../../src/game/renderProfile.ts)
- [docs/development/performance.md](../../docs/development/performance.md)
- [test_scripts/perf/android-emulator.mjs](../../test_scripts/perf/android-emulator.mjs)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-performance-layouts.mjs
node test_scripts/perf/performance-soak.mjs
```

## R13

**Trial a bounded practice replay** · Conditional experiments

[B28](backlog.md#b28)

**Dependencies:** [R00](#r00), [R09](#r09)

**Player benefit:** Let a player retry one decision and understand the limits of the comparison.

**Critique / risk:** An event log is not a deterministic replay; state, RNG consumption and versioned rules all affect the result.

**Tuned implementation scope:**

1. Capture one bounded battle snapshot, RNG state, rule version and decision point.
2. First prove identical input produces identical results; then allow one alternative order without progression rewards.
3. Label unsupported versions and deviations; keep this optional until aftermath comprehension improves.

**Completion gate:** Exact replay passes before counterfactual play is exposed; unsupported snapshots fail clearly and never affect campaign stores.

**Existing code and references:**

- [src/systems/ascent/BattleSystem.ts](../../src/systems/ascent/BattleSystem.ts)
- [src/systems/ascent/battleReport.ts](../../src/systems/ascent/battleReport.ts)
- [src/state/save.ts](../../src/state/save.ts)

**Existing checks to extend:**

Add a focused behavioral harness for this new feature before marking it Done.

## R14

**Expand encounters after strategic validation** · Conditional experiments

[B29](backlog.md#b29) · [B34](backlog.md#b34) · [B35](backlog.md#b35)

**Dependencies:** [R03](#r03), [R10](#r10)

**Player benefit:** Use terrain and Vietnamese historical constraints to demand different preparation.

**Critique / risk:** Three scripted bosses or a history label can add content without adding choices.

**Tuned implementation scope:**

1. Trial one crossing/prepared-ground encounter with two viable solutions using existing terrain and supply.
2. If successful, build three boss demands with explicit two-season warnings and readable rules.
3. Build one small historical scenario from the proven encounter; cite historical premises and label procedural/fictional outcomes.

**Completion gate:** The small scenario demonstrates two useful plans before content expansion; every boss rewards a different preparation instead of just larger numbers.

**Existing code and references:**

- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/systems/ascent/BattleSystem.ts](../../src/systems/ascent/BattleSystem.ts)
- [src/systems/ascent/SupplySystem.ts](../../src/systems/ascent/SupplySystem.ts)
- [src/game/ascentConfig.ts](../../src/game/ascentConfig.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-battle-moments.mjs
```

## R15

**Offer a normalized, shareable challenge** · Conditional experiments

[B31](backlog.md#b31) · [B40](backlog.md#b40)

**Dependencies:** [R00](#r00), [R07](#r07), [R10](#r10)

**Player benefit:** Compare skill without mixing incompatible progression or rules.

**Critique / risk:** A seed alone is not reproducible, and a normalized run must not wipe the player's owned progression.

**Tuned implementation scope:**

1. Run challenges in an isolated preset overlay with declared difficulty, pace, assistance, command mode and progression effects.
2. Encode seed, version and preset in a share code; validate input and explain version mismatch.
3. Keep scores partitioned by compatible rules; start with local comparison, without a server leaderboard.

**Completion gate:** The same supported code recreates the same setup; challenge exit preserves owned progress and incompatible scores cannot mix.

**Existing code and references:**

- [src/state/GameState.ts](../../src/state/GameState.ts)
- [src/state/legacy.ts](../../src/state/legacy.ts)
- [src/state/dynasty.ts](../../src/state/dynasty.ts)
- [src/state/cabinet.ts](../../src/state/cabinet.ts)
- [test_scripts/playtest/playtest-lib.mjs](../../test_scripts/playtest/playtest-lib.mjs)

**Existing checks to extend:**

Add a focused behavioral harness for this new feature before marking it Done.

## R16

**Clarify commitments and capital recovery** · Conditional experiments

[B32](backlog.md#b32) · [B33](backlog.md#b33)

**Dependencies:** [R01](#r01), [R03](#r03), [R06](#r06), [R11](#r11)

**Player benefit:** Make diplomatic obligations and the remaining recovery window actionable.

**Critique / risk:** A countdown without a feasible action creates pressure rather than agency; another diplomatic currency is unnecessary.

**Tuned implementation scope:**

1. Show duration, obligations, cancellation and consequences using existing agreement state.
2. Show capital grace time with feasible relief/recapture intents and arrival estimates.
3. Promote either fix earlier if current playtests show it blocks the core charter.

**Completion gate:** Displayed obligations match resolution; a relief suggestion cannot arrive after the deadline without warning.

**Existing code and references:**

- [src/systems/DiplomacySystem.ts](../../src/systems/DiplomacySystem.ts)
- [src/systems/ascent/EnvoySystem.ts](../../src/systems/ascent/EnvoySystem.ts)
- [src/systems/ascent/AscentTick.ts](../../src/systems/ascent/AscentTick.ts)
- [src/scenes/conquest/screens/affairs.ts](../../src/scenes/conquest/screens/affairs.ts)
- [src/scenes/conquest/screens/armyTargets.ts](../../src/scenes/conquest/screens/armyTargets.ts)

**Existing checks to extend:**

```text
node test_scripts/verify/verify-foreign-relations.mjs
node test_scripts/verify/verify-crisis-vassal.mjs
```

## R17

**Keep major expansion out of the current delivery** · Deferred scope

[B43](backlog.md#b43) · [B44](backlog.md#b44) · [B45](backlog.md#b45) · [B46](backlog.md#b46) · [B47](backlog.md#b47) · [B48](backlog.md#b48)

**Dependencies:** No package dependency; revalidate current behavior first

**Player benefit:** Protect time for a satisfying single-player core.

**Critique / risk:** Multiplayer, naval layers, mandatory micromanagement, new currencies, much larger maps and grind gates multiply scope before the current decisions are proven.

**Tuned implementation scope:**

1. Keep B43–B48 Deferred; use their review conditions for any promotion.
2. Require a demonstrated player need, a bounded prototype and a revised estimate before adding them to a milestone.

**Completion gate:** No implementation scheduled; reconsideration is a recorded design decision, not automatic backlog expansion.

**Existing checks to extend:**

No implementation scheduled.

## The working loop

Idea → critique against current code → smallest useful change → targeted tests and play → tune or reject → repeat. Give every implementation a B-item, an R-package, a revision and evidence. Existing harnesses may encode old behavior: revise those assertions deliberately and retain unrelated protections.

## How we decide whether it is better

Proposed formative round: six mobile and six desktop testers, with both languages represented. Initial gates: 5/6 per cohort explain the goal/cost/reward scope; familiar mobile intent ≤3 major taps; candidate short charter 8–12 minutes, extended desktop objective 20–35 minutes. The review’s ≥70% desire-to-continue target applies to finishers; also report all starters and actual continuation. These are hypotheses, not measured outcomes.

Use 16 paired seeds for the baseline and 32–64 for three coherent builds. Keep profile, pace and command mode explicit. Check EN/VI phone/tablet/desktop layouts, save migration and reward fault recovery. Run a 20-minute isolated production soak on named physical devices. A simulation score or emulator screenshot cannot close a human/device gate.

## Persistence and rollback

Add defaults for old snapshots; keep manual saves distinct from autosaves. Chapter completion must not call the current defeat/banking path. Use durable transaction receipts across progression stores and recover partial writes. A rollback may hide a new entry point but must keep readers for existing saved state and earned rewards.

## Maintain this plan

Edit implementation-roadmap.json, then run node docs/phase-2/build-implementation-roadmap.mjs. The builder regenerates both Markdown languages and this HTML. Keep implementation status and evidence in backlog.md; link scope changes there. The dated research review stays unchanged.

