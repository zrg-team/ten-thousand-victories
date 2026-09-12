# Phase 2 backlog

Initialized September 13, 2026 from the [bilingual baseline review](gameplay-review-2026-09-12/index.html#features). All 48 original IDs are retained. **No gameplay item has been started under this plan.** See the [implementation sequence](implementation-plan.md) before selecting work.

Danh sách theo dõi Giai đoạn 2 giữ nguyên 48 mã hạng mục từ bản đánh giá. Chưa bắt đầu triển khai gameplay theo kế hoạch này. Xem [bản tiếng Việt](gameplay-review-2026-09-12/index.html?lang=vi#features) để đọc đầy đủ nhận định và đề xuất.

## Status and update rules

Use **Proposed → Ready → In progress → Verify → Done**, or **Deferred**. Before moving to Ready, reproduce the issue in the latest build, choose scope and link a specification. Done requires an implementation revision plus evidence meeting the acceptance criteria. A rejected proposal may become Deferred with a dated reason.

Priorities and effort are the review's initial recommendations, not fixed commitments. P0 addresses immediate trust/control/measurement problems; P1 develops the core experience; P2 needs later validation; P3 is deliberately deferred. S/M/L/XL are relative effort, not calendar estimates. “Improve” and “Extend” refer to existing systems; “New” is a proposed addition; “Validate” requires investigation.

Update the status and evidence columns below as work progresses. Keep the dated review unchanged as the baseline. “L” references in dependencies point to the review's design loops; “M” references point to its market/source discussion.

The [implementation roadmap](implementation-roadmap.html) maps all 48 items to 18 packages (R00–R17). Plan links in the last column are specifications, not evidence that a feature is implemented. The [first batch](first-implementation-batch.md) and [validation protocol](validation-plan.md) define how work starts and how it is accepted.

**2026-09-13 scope refinement:** current code confirms B01's diplomacy percentage is trust progress, not random success probability; its estimate also omits a court multiplier. R01 separates progress, probability and estimate without adding diplomatic RNG. B02/B03 repair the effective behavior of existing preferences. B04 routes the existing battle pause through keyboard ownership. The dated review remains unchanged; these refinements govern implementation.

## Tracker

| ID | Recommendation | Priority | Type | Platform | Effort | Status | Specification / revision / evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [B01](#b01) | Make probability language truthful | P0 | Improve | Both | S | Proposed | [R01 plan](implementation-roadmap.html#R01) |
| [B02](#b02) | Preserve chosen pace and assistance | P0 | Improve | Both | M | Proposed | [R02 plan](implementation-roadmap.html#R02) |
| [B03](#b03) | Separate challenge from reading time | P0 | Extend | Both | M | Proposed | [R02 plan](implementation-roadmap.html#R02) |
| [B04](#b04) | Make pause consistent and explicit | P0 | Improve | Desktop | S | Proposed | [R02 plan](implementation-roadmap.html#R02) |
| [B05](#b05) | Skip empty first-reign inheritance | P0 | Improve | Both | S | Proposed | [R01 plan](implementation-roadmap.html#R01) |
| [B06](#b06) | Fix resume modal text layout | P0 | Improve | Both | S | Proposed | [R01 plan](implementation-roadmap.html#R01) |
| [B07](#b07) | Explain command-mode defaults | P0 | Improve | Both | S | Proposed | [R02 plan](implementation-roadmap.html#R02) |
| [B08](#b08) | Budget full-screen interruptions | P1 | Improve | Mobile | M | Proposed | [R05 plan](implementation-roadmap.html#R05) |
| [B09](#b09) | Show the existing wave phases | P1 | Extend | Both | M | Proposed | [R05 plan](implementation-roadmap.html#R05) |
| [B10](#b10) | Use comparable front forecasts | P0 | Improve | Both | M | Proposed | [R03 plan](implementation-roadmap.html#R03) |
| [B11](#b11) | Replace the single fun proxy with a test dashboard | P0 | Validate | Both | M | Proposed | [R00 plan](implementation-roadmap.html#R00) |
| [B12](#b12) | Add a finite Ascent charter | P1 | New | Both | L | Proposed | [R08 plan](implementation-roadmap.html#R08) |
| [B13](#b13) | Make a chapter safe to stop after | P1 | Extend | Mobile | M | Proposed | [R08 plan](implementation-roadmap.html#R08) |
| [B14](#b14) | Offer longer optional objectives | P1 | Extend | Desktop | M | Proposed | [R08 plan](implementation-roadmap.html#R08) |
| [B15](#b15) | Audit returns to preparation | P1 | Validate | Both | M | Proposed | [R06 plan](implementation-roadmap.html#R06) |
| [B16](#b16) | Explain and bound wave adaptation | P1 | Extend | Both | M | Proposed | [R06 plan](implementation-roadmap.html#R06) |
| [B17](#b17) | Show useful resource forecasts | P1 | Improve | Both | M | Proposed | [R06 plan](implementation-roadmap.html#R06) |
| [B18](#b18) | Add visible automation budgets | P1 | Extend | Both | M | Proposed | [R06 plan](implementation-roadmap.html#R06) |
| [B19](#b19) | Separate run stacks from collection levels | P1 | Improve | Both | M | Proposed | [R07 plan](implementation-roadmap.html#R07) |
| [B20](#b20) | Measure coherent build diversity | P1 | Validate | Both | M | Proposed | [R10 plan](implementation-roadmap.html#R10) |
| [B21](#b21) | Tune interactions in the existing draft pool | P1 | Improve | Both | M | Proposed | [R10 plan](implementation-roadmap.html#R10) |
| [B22](#b22) | Make doctrine consequences visible | P1 | Improve | Both | M | Proposed | [R10 plan](implementation-roadmap.html#R10) |
| [B23](#b23) | Compare hero opportunity costs | P1 | Extend | Both | M | Proposed | [R10 plan](implementation-roadmap.html#R10) |
| [B24](#b24) | Keep shortcuts stable and discoverable | P1 | Improve | Desktop | M | Proposed | [R02 plan](implementation-roadmap.html#R02) |
| [B25](#b25) | Add a command and comparison workspace | P1 | Extend | Desktop | L | Proposed | [R11 plan](implementation-roadmap.html#R11) |
| [B26](#b26) | Make intent orders easy to issue | P1 | Improve | Mobile | M | Proposed | [R11 plan](implementation-roadmap.html#R11) |
| [B27](#b27) | Connect aftermath to the decisive cause | P1 | Improve | Both | M | Proposed | [R09 plan](implementation-roadmap.html#R09) |
| [B28](#b28) | Replay a bounded practice snapshot | P2 | New | Both | L | Proposed | [R13 plan](implementation-roadmap.html#R13) |
| [B29](#b29) | Add terrain problems to selected encounters | P2 | Extend | Both | M | Proposed | [R14 plan](implementation-roadmap.html#R14) |
| [B30](#b30) | Unify inheritance presentation | P1 | Improve | Both | M | Proposed | [R07 plan](implementation-roadmap.html#R07) |
| [B31](#b31) | Offer a normalized skill challenge | P2 | New | Both | M | Proposed | [R15 plan](implementation-roadmap.html#R15) |
| [B32](#b32) | Make diplomacy commitments legible | P2 | Extend | Both | M | Proposed | [R16 plan](implementation-roadmap.html#R16) |
| [B33](#b33) | Make capital recovery actionable | P2 | Improve | Both | M | Proposed | [R16 plan](implementation-roadmap.html#R16) |
| [B34](#b34) | Give bosses a distinct strategic demand | P2 | Extend | Both | M | Proposed | [R14 plan](implementation-roadmap.html#R14) |
| [B35](#b35) | Build one playable historical scenario | P2 | Extend | Both | L | Proposed | [R14 plan](implementation-roadmap.html#R14) |
| [B36](#b36) | Audit touch targets on real devices | P1 | Validate | Mobile | M | Proposed | [R12 plan](implementation-roadmap.html#R12) |
| [B37](#b37) | Provide a readable UI scale | P1 | Extend | Both | M | Proposed | [R12 plan](implementation-roadmap.html#R12) |
| [B38](#b38) | Audit nonvisual and motor access | P2 | Validate | Both | M | Proposed | [R12 plan](implementation-roadmap.html#R12) |
| [B39](#b39) | Run sustained physical-device performance tests | P1 | Validate | Mobile | M | Proposed | [R12 plan](implementation-roadmap.html#R12) |
| [B40](#b40) | Share a reproducible challenge seed | P2 | Extend | Both | M | Proposed | [R15 plan](implementation-roadmap.html#R15) |
| [B41](#b41) | Audit portable save recovery | P2 | Validate | Both | M | Proposed | [R04 plan](implementation-roadmap.html#R04) |
| [B42](#b42) | Use consistent units and glossary | P2 | Improve | Both | S | Proposed | [R01 plan](implementation-roadmap.html#R01) |
| [B43](#b43) | Real-time competitive multiplayer | P3 | Defer | Both | XL | Deferred | [R17 plan](implementation-roadmap.html#R17) |
| [B44](#b44) | Full naval combat layer | P3 | Defer | Both | XL | Deferred | [R17 plan](implementation-roadmap.html#R17) |
| [B45](#b45) | Mandatory worker or squad micromanagement | P3 | Defer | Desktop | L | Deferred | [R17 plan](implementation-roadmap.html#R17) |
| [B46](#b46) | More currencies and progression trees | P3 | Defer | Both | L | Deferred | [R17 plan](implementation-roadmap.html#R17) |
| [B47](#b47) | Larger maps and many new units | P3 | Defer | Both | L | Deferred | [R17 plan](implementation-roadmap.html#R17) |
| [B48](#b48) | Grind gates, energy timers and daily chores | P3 | Defer | Both | M | Deferred | [R17 plan](implementation-roadmap.html#R17) |

## Acceptance criteria and dependencies

These criteria and observations are copied from the review so each item is ready to scope. Revalidate observations against the current build. If acceptance criteria change, record why and link the decision.

### B01

**Make probability language truthful** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B01)

- **Observed problem:** The played envoy method said “certain” beside a 53% chance.
- **Acceptance:** Every certainty claim matches the resolver; display success chance, time and refusal cost from shared data.
- **Dependencies / references:** Lanes / i18n

### B02

**Preserve chosen pace and assistance** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B02)

- **Observed problem:** Wave escalation currently overrides speed and readability.
- **Acceptance:** Slow remains slow at wave 30; intent and counter guidance remain available when enabled.
- **Dependencies / references:** L1

### B03

**Separate challenge from reading time** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B03)

- **Observed problem:** Enemy strength, timing and hints are currently coupled.
- **Acceptance:** Independent difficulty, pace and assistance settings survive save/reload and work in Ascent and Skirmish.
- **Dependencies / references:** B02

### B04

**Make pause consistent and explicit** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B04)

- **Observed problem:** Space pauses the world but is intentionally ignored on the battle screen.
- **Acceptance:** A documented, stable battle-pause key and obvious clock state; no accidental orders while menus own input.
- **Dependencies / references:** L1

### B05

**Skip empty first-reign inheritance** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B05)

- **Observed problem:** The first played reign displayed an empty starting hand and no inherited traits.
- **Acceptance:** A fresh profile proceeds to a strategic choice; returning houses still see relevant inheritance.
- **Dependencies / references:** Opening flow

### B06

**Fix resume modal text layout** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B06)

- **Observed problem:** The inspected 1440×900 resume prompt had its wrapped heading overlap the subtitle.
- **Acceptance:** No overlap at phone, short phone, tablet and desktop sizes in English and Vietnamese.
- **Dependencies / references:** Menu resume

### B07

**Explain command-mode defaults** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B07)

- **Observed problem:** Desktop enables Hands-on; automated factory runs do not.
- **Acceptance:** At start, describe what automation and routine prompts change, allow either mode on either platform.
- **Dependencies / references:** L6

### B08

**Budget full-screen interruptions** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B08)

- **Observed problem:** The played preparation was repeatedly displaced by doctrine, province, conquest, draft and court sheets.
- **Acceptance:** Measure a configurable modal budget; urgent events remain visible and optional advice queues safely.
- **Dependencies / references:** L3

### B09

**Show the existing wave phases** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B09)

- **Observed problem:** Aftermath, court and muster rules exist but deserve a stronger player-facing rhythm.
- **Acceptance:** The player can identify the current phase, what is safe to do and the next commitment.
- **Dependencies / references:** B08

### B10

**Use comparable front forecasts** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B10)

- **Observed problem:** POWER includes an economic component; THREAT is not the same quantity.
- **Acceptance:** Show defence ready by arrival, attacking strength and ETA; keep total realm POWER as a separate progress stat.
- **Dependencies / references:** PowerSystem / WaveDirector

### B11

**Replace the single fun proxy with a test dashboard** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B11)

- **Observed problem:** The current proxy nearly saturates while ignoring readability, fatigue and expert-plan diversity.
- **Acceptance:** Record fresh/progressed profile, layout, command mode, seed, objective outcome, losses and real reading time where applicable.
- **Dependencies / references:** Metrics harness

### B12

**Add a finite Ascent charter** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B12)

- **Observed problem:** No selectable finite victory contract was found in the main Ascent loop.
- **Acceptance:** Complete one clear objective, award a win, then offer bank, next chapter or Endless.
- **Dependencies / references:** L2

### B13

**Make a chapter safe to stop after** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B13)

- **Observed problem:** Local save/resume exists; a satisfying planned stop is different from suspension.
- **Acceptance:** Banked chapter reward and next choice survive interruption, restart and offline resume.
- **Dependencies / references:** B12

### B14

**Offer longer optional objectives** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B14)

- **Observed problem:** Endless waves already exist; experts need a meaningful reason to pursue a longer reign.
- **Acceptance:** An extended charter changes priorities rather than merely doubling required waves.
- **Dependencies / references:** B12

### B15

**Audit returns to preparation** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B15)

- **Observed problem:** Income, wealth, ambition and defensive adaptation can obscure the benefit of investment.
- **Acceptance:** Run paired ablations; report losses and land held alongside waves and stockpiles.
- **Dependencies / references:** B11

### B16

**Explain and bound wave adaptation** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B16)

- **Observed problem:** Several controllers feed the wave budget, with caps and lags.
- **Acceptance:** Debug breakdown reconciles exactly; the player sees a short cause summary and a committed forecast.
- **Dependencies / references:** B10, B15

### B17

**Show useful resource forecasts** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B17)

- **Observed problem:** Rates and detailed province multipliers exist, but choices often omit the practical runway.
- **Acceptance:** At a purchase: cost, upkeep change, expected completion and food/supply runway; mark estimates.
- **Dependencies / references:** B15

### B18

**Add visible automation budgets** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B18)

- **Observed problem:** Autopilot already builds, upgrades and recruits; explicit orders should remain authoritative.
- **Acceptance:** Reserve gold, food and supplies; expose the next automated action and why an action was skipped.
- **Dependencies / references:** B07, B17

### B19

**Separate run stacks from collection levels** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B19)

- **Observed problem:** The draft mixes Lv2, Stack 1/2 and “3 more to combine.”
- **Acceptance:** Every reward label names its scope; players correctly sort three representative rewards.
- **Dependencies / references:** L7

### B20

**Measure coherent build diversity** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B20)

- **Observed problem:** Many modifiers and three evolution recipes exist, but viable expert archetypes are unproven.
- **Acceptance:** Compare at least three competent plans over 32–64 seeds; inspect conditional dominance and draft dead ends.
- **Dependencies / references:** B11

### B21

**Tune interactions in the existing draft pool** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B21)

- **Observed problem:** 22 normal draft cards are a manageable set for an interaction audit.
- **Acceptance:** Two tested interactions create distinct resource or tactical decisions without a universal best pick.
- **Dependencies / references:** B20

### B22

**Make doctrine consequences visible** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B22)

- **Observed problem:** Four doctrines already change multiple autonomous decisions.
- **Acceptance:** Show one core strength, one cost and current automation intent; preview a doctrine change.
- **Dependencies / references:** B18, B20

### B23

**Compare hero opportunity costs** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B23)

- **Observed problem:** Heroes already serve as governors, officers, envoys and commanders; some cards warn about vacated seats.
- **Acceptance:** All assignment entry points show what is gained and what existing role is lost.
- **Dependencies / references:** Existing hero/court screens

### B24

**Keep shortcuts stable and discoverable** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B24)

- **Observed problem:** Number keys derive from dynamic action-bar slots; a battle slot can change lane numbering.
- **Acceptance:** Stable bindings, visible key hints and remapping; switching fronts never silently changes the Build key.
- **Dependencies / references:** L6

### B25

**Add a command and comparison workspace** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B25)

- **Observed problem:** Side sheets and army orders exist; serial navigation limits simultaneous planning.
- **Acceptance:** Pin two provinces/fronts, inspect route ETA and queue an order while retaining map context.
- **Dependencies / references:** B24, B17

### B26

**Make intent orders easy to issue** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B26)

- **Observed problem:** Defend, attack, follow, hunt, recall and withdrawal already exist.
- **Acceptance:** Give a familiar host an intent in at most three major taps; show target and arrival before commitment.
- **Dependencies / references:** L6

### B27

**Connect aftermath to the decisive cause** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B27)

- **Observed problem:** Current reports already show named commanders, casualties and outcomes.
- **Acceptance:** One verifiable cause is linked to the event timeline; detailed numbers remain available.
- **Dependencies / references:** L8, B11

### B28

**Replay a bounded practice snapshot** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B28)

- **Observed problem:** No player-facing deterministic decision replay was found in the reviewed main flow.
- **Acceptance:** Replay one battle state with explicit RNG/version metadata; label deviations and avoid false counterfactual certainty.
- **Dependencies / references:** B11, B27

### B29

**Add terrain problems to selected encounters** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B29)

- **Observed problem:** Terrain, supply and formations are present; historical mechanics can use them more distinctly.
- **Acceptance:** One crossing/prepared-ground scenario supports two solutions with readable costs.
- **Dependencies / references:** L9

### B30

**Unify inheritance presentation** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B30)

- **Observed problem:** Legacy, Dynasty and Cabinet are useful but overlap in explanation.
- **Acceptance:** One summary distinguishes ownership, permanent effects and the next-run choice without deleting earned items.
- **Dependencies / references:** B19

### B31

**Offer a normalized skill challenge** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B31)

- **Observed problem:** Fresh and progressed profiles are currently different balance contexts.
- **Acceptance:** State exactly which progression effects apply; scores cannot mix incompatible presets.
- **Dependencies / references:** B11, B30

### B32

**Make diplomacy commitments legible** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B32)

- **Observed problem:** Envoys, opinion, trade and competing rulers already exist.
- **Acceptance:** Show promise duration, obligations and consequences of breaking an agreement; do not add another currency.
- **Dependencies / references:** B01, B17

### B33

**Make capital recovery actionable** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B33)

- **Observed problem:** Defeat includes a capital-loss grace and refuge rules.
- **Acceptance:** Show remaining recovery time and feasible relief/recapture actions before the loss becomes irreversible.
- **Dependencies / references:** B10, B26

### B34

**Give bosses a distinct strategic demand** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B34)

- **Observed problem:** Great invasions and multiple wave shapes already exist.
- **Acceptance:** At least three boss encounters reward different preparations with a two-season warning that explains the relevant rule.
- **Dependencies / references:** B10, B20

### B35

**Build one playable historical scenario** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B35)

- **Observed problem:** Character stories and Vietnamese identity already exist.
- **Acceptance:** A small authored scenario teaches a real strategic constraint and labels fictional/procedural outcomes.
- **Dependencies / references:** B29

### B36

**Audit touch targets on real devices** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B36)

- **Observed problem:** Phone screenshots and emulation cannot establish physical thumb comfort.
- **Acceptance:** Measure hit regions, target spacing and error rate on phone and tablet; use appropriate CSS/point/dp guidance.
- **Dependencies / references:** M8, M9

### B37

**Provide a readable UI scale** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B37)

- **Observed problem:** Small annotations coexist with detailed canvas screens.
- **Acceptance:** Larger text has no clipped decisions, hidden costs or unscrollable buttons at the supported minimum viewport.
- **Dependencies / references:** B36

### B38

**Audit nonvisual and motor access** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B38)

- **Observed problem:** No assistive-technology certification was performed.
- **Acceptance:** Test keyboard focus, semantic text access, colour-independent cues and alternatives to holds/swipes; scope fixes from findings.
- **Dependencies / references:** B37

### B39

**Run sustained physical-device performance tests** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B39)

- **Observed problem:** This review used desktop Chromium emulation, not a thermally constrained phone.
- **Acceptance:** On a declared low-end target, test a 20-minute run, crowded combat, background/resume, touch latency and memory.
- **Dependencies / references:** Performance harness

### B40

**Share a reproducible challenge seed** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B40)

- **Observed problem:** A seeded debug harness exists; a normal player-facing challenge share flow was not found.
- **Acceptance:** A share code encodes seed, version, rules and progression preset; invalid versions are explained.
- **Dependencies / references:** B11, B31

### B41

**Audit portable save recovery** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B41)

- **Observed problem:** Local persistence and offline resilience exist; cross-device continuity was not verified.
- **Acceptance:** Prove backup/restore across supported shells before adding cloud sync; preserve migration compatibility.
- **Dependencies / references:** Save layer

### B42

**Use consistent units and glossary** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B42)

- **Observed problem:** Seasons, ticks, exchanges, levels and several percentages appear across decisions.
- **Acceptance:** Player text uses consistent time units and labels chance, loyalty and output separately.
- **Dependencies / references:** B01, B19

### B43

**Real-time competitive multiplayer** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B43)

- **Observed problem:** Networking, fairness, persistence and population would multiply scope.
- **Acceptance / reconsideration condition:** Reconsider only after single-player sessions retain users and command rules are stable.
- **Dependencies / references:** Core validation

### B44

**Full naval combat layer** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B44)

- **Observed problem:** A river scenario can test demand with existing systems first.
- **Acceptance / reconsideration condition:** Promote only if the limited scenario adds durable strategic value.
- **Dependencies / references:** B29

### B45

**Mandatory worker or squad micromanagement** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B45)

- **Observed problem:** More repetitive clicks would divide mobile and desktop rules without proving depth.
- **Acceptance / reconsideration condition:** Prefer optional queues and intent commands; demand a new decision before adding a control.
- **Dependencies / references:** B25

### B46

**More currencies and progression trees** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B46)

- **Observed problem:** The existing three progression layers already need explanation.
- **Acceptance / reconsideration condition:** Add only when an existing currency or reward cannot express a verified design need.
- **Dependencies / references:** B30

### B47

**Larger maps and many new units** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B47)

- **Observed problem:** More territory and unit types magnify path, UI, performance and balance problems.
- **Acceptance / reconsideration condition:** Expand after existing terrain and army roles produce distinct plans on current maps.
- **Dependencies / references:** B20, B39

### B48

**Grind gates, energy timers and daily chores** · [Baseline recommendation](gameplay-review-2026-09-12/index.html#B48)

- **Observed problem:** They would conflict with short, self-directed reigns unless a separate product case is demonstrated.
- **Acceptance / reconsideration condition:** Do not use compulsory waiting or stat grinding to compensate for weak run variety.
- **Dependencies / references:** B12, B31

## Decision log

| Date | Items | Decision and evidence |
| --- | --- | --- |
| 2026-09-13 | B01–B48 | Initialize from the review; B01–B42 remain Proposed and B43–B48 remain Deferred. Implementation and human/device validation are pending. |
| 2026-09-13 | B01–B48 | Add R00–R17 implementation scopes, dependency order, code/test references, effort ranges and validation gates. All implementation statuses remain unchanged. |
| 2026-09-13 | B01–B04, B12–B13 | Refine from current code: diplomacy displays trust as chance; preferences already exist but are overridden; battle pause exists without Space; intermediate charter completion must avoid defeat/banking/save-cleanup paths. See the first-batch checklist and R08. |
