# The harnesses

There is no test framework here. Every check drives the real game in headless Chromium, so a
"test" is a standalone `.mjs` script run with bare `node`. There are 168 of them, and they are
filed by **the question they answer** rather than by the feature they touch — a battle change
usually means running something from `verify/`, then something from `playtest/`, and those are
two different kinds of answer.

| Folder | Count | Answers | Named |
|---|---|---|---|
| [`verify/`](verify/) | 89 | *Is it broken?* — pass/fail gates worth keeping | `verify-<topic>.mjs` |
| [`shot/`](shot/) | 44 | *What does it look like?* — screenshot drivers | `shot-<topic>.mjs` |
| [`playtest/`](playtest/) | 9 | *Is it any good?* — metrics, sessions, full playthroughs | `playtest-*`, `play-*`, `battle-lab` |
| [`perf/`](perf/) | 9 | *What does it cost?* — render, bake, beat, heap | `measure-*`, `perf-*` |
| [`diag/`](diag/) | 15 | *Why is it doing that?* — prints, does not assert | `diag-<topic>.mjs`, `measure-*` |
| [`gate/`](gate/) | 2 | *Does it still boot?* — the cheapest checks | `smoke`, `check-console` |
| `scratch/` | — | throwaway probes, **gitignored** | `_<topic>.mjs` |

## Desktop map dragging

`npm run perf:drag` measures actual mouse dragging in headed Chromium at
`http://localhost:5179/`, including a fully revealed map and 4× CPU throttling.
Use `QUALITY=auto` and `CPU_RATE=4` to apply throttling before launch calibration.
Results include the actual GPU, drawing buffer, chosen profile, frame timings, long
browser tasks, and drawing work under `output/map-drag/`. Timing is diagnostic,
not a physical-device certification. See [the measured change report](../docs/development/map-drag-performance.md).

`npm run verify:map-drag` checks drag/release behavior, precise offscreen bounds,
seasonal refreshes, ownership changes and paint order, zoom limits, and resizing in
English/Vietnamese across 1280px, 1920px, and ultrawide desktops. It fails on broken
assertions or browser exceptions and writes screenshots under `output/verify-map-drag/`.

## Start here

A dev server must already be running — **no harness starts one** — and every script must be run
**from the repository root**, because output paths are written relative to it.

```bash
node test_scripts/gate/smoke.mjs                    # ascent + skirmish (and the 3 shelved modes) boot, tick, draw — ~45 s
node test_scripts/verify/verify-ascent.mjs          # the Dragon Ascent loop end to end
node test_scripts/verify/verify-dynasty.mjs         # the Tong Pha ledger: XP banks once, the ceremony walks, every trait is read; the dossier gates (page fit, lineage, live reign, the timed reign-end sequence, the chip's house share)
node test_scripts/verify/verify-draft-depth.mjs     # the deck: upgrades >= 25% of offers, a deck slot once two cards are held, a held card's third copy in <= 8 rubbings (8 seeds)
node test_scripts/verify/verify-legacy.mjs          # the Legacy vault: twenty perks on a ten-step ladder (old stores migrate), a loadout of three, only the loadout applies; hands-on rule silences the lane cards and the autopilot
node test_scripts/verify/verify-desktop-layout.mjs  # the desktop sheet: world across the window, the 390 column at the right edge, keys, wheel, resize, the cabinet's hands-on default — and the phone untouched (five viewport contexts)
node test_scripts/verify/verify-list-press.mjs        # a button inside a list fires on the lift and a drag scrolls; chrome still fires on the press
node test_scripts/verify/verify-scroll-under-sheet.mjs  # HOTFIX gate: lists inside a run's pages scroll; only a list under a sheet is locked
node test_scripts/verify/verify-cabinet.mjs         # the Cabinet of Seals: rubbings honour pity, x3 combines, cabinet levels reach the draft, the bind step binds, the page takes taps
node test_scripts/verify/verify-army-plate.mjs      # the History army plates across all 7 wardrobes x 5 weapons x 3 ranks and all 5 doctrines: nothing reaches into the title, the caption or another caption
node test_scripts/verify/verify-inheritance.mjs     # the next-reign chip: promises exactly what the ceremony pays (XP, level, Legacy, rubbings, bind), hides under prompts, opens/shuts, guards its taps
node test_scripts/verify/verify-inheritance-screen.mjs  # the run-start Gia sản dòng họ card: queued after the rite and before the mandate, reads the live stores, both languages, both ends of the height clamp
node test_scripts/verify/verify-coronation.mjs      # Le Dang Quang: the rite raises once ever, a skip writes a whole king, era law holds, the badge steps with the house
node test_scripts/verify/verify-invasion-lifecycle.mjs  # every invasion announces its start and its end
node test_scripts/verify/verify-invasion-reach.mjs      # a wave that is sent can walk to the realm, and does
node test_scripts/verify/verify-war-visibility.mjs      # the war reaches the bar, the map and the advisor — nothing falls silently
node test_scripts/verify/verify-war-board.mjs           # every front on the board is a door; the Reckoning is a report, not a stack of cards
node test_scripts/verify/verify-reinforce.mjs           # a lane page turn tears the fight down; relief always on the field; the call-up is a dial
node test_scripts/verify/verify-expansion-prompt.mjs    # the expansion card only asks when something on it can be pressed
node test_scripts/verify/verify-land-consequences.mjs   # ground is the ceiling on people; losing it costs; a held wave leaves the walls down; the governor commands
node test_scripts/verify/verify-land-restore.mjs        # the people hold the walls; a hidden-roll defence still costs the province; the restore card pays for haste
node test_scripts/verify/verify-setup-phase.mjs        # the opening is three single columns and a setup card; a hostless realm is quoted what it could re-raise; the stores waste and sell; routine prices scale with the realm and stay 1 in the classic modes
node test_scripts/verify/verify-crowding-and-price.mjs   # districts fill and then eat badly; a host is priced, not capped; lost ground ends its battle
node test_scripts/verify/verify-land-tap.mjs             # the name plate is the province's tap target, and the ground answers only where no plate is drawn
node test_scripts/verify/verify-button-press.mjs         # a button acts on the press, once — not on the release
node test_scripts/verify/verify-empire-fairness.mjs      # Throne of Empires is a war the realm can fight: supply, agency, waves that end, ground worth holding
node test_scripts/verify/verify-away-pause.mjs           # leaving the screen is not a move: the world halts, the run is written down, Continue brings it back
node test_scripts/verify/verify-first-minutes.mjs        # a new player is asked something at once and offered a power draft inside three minutes
node test_scripts/verify/verify-conquest-offer.mjs       # a host that will refuse the order is greyed, the refusal says why, and the sheet does not come back for ever
node test_scripts/verify/verify-portrait-fit.mjs        # nothing a hero wears is drawn where there is no body to wear it on
node test_scripts/playtest/playtest-metrics.mjs     # six measured preconditions of fun, /85
node test_scripts/playtest/playtest-first-minutes.mjs  # what the first three minutes actually contain, on the player's clock
node test_scripts/perf/perf-bench.mjs --label wip   # auto-diffs against perf-results/baseline.json
node test_scripts/shot/shot-readme.mjs              # regenerates every picture in the root README
```

## Reading a result

**Exit codes are not reliable.** Only a minority of these scripts call `process.exit` — notably
`verify-ascent.mjs` and `verify-modes-regression.mjs` always exit 0. Parse stdout for `PASS:` /
`ok` against `FAIL:` / `CHECK:` instead, and never conclude a harness passed from its exit code
unless you have checked that that script sets one.

## Two paths that do not move with the scripts

`shots/` and `perf-results/` stay at the top of this tree. Shot scripts write to
`test_scripts/shots/…` relative to the **project root**, so a shooter works from `shot/` with no
path change — and `perf-bench.mjs` reaches back up to `perf-results/` so that `--label` keeps
diffing against the committed `baseline.json` rather than orphaning it.

`shots/` and `scratch/` are gitignored; `perf-results/` holds committed baseline data.

## Adding one

Put it in the folder matching the question, and follow the naming above. If it asserts an
invariant that could break again, it belongs in `verify/` with `ok` / `FAIL` check lines; if it
answered a one-off question, keep the number and delete the script, or leave it in `scratch/`
where it will not be committed. It must live somewhere under `test_scripts/` either way —
outside this tree `import 'playwright'` will not resolve.

The `game-harness` skill in [`.claude/skills/`](../.claude/skills/game-harness/) carries the
bootstrap boilerplate, the window hooks, the prompt-option shapes, and the traps that make a
harness silently pass while testing nothing.

## The Year-4 fairness harnesses (2026-08)

Written for the report *"the enemy invasion is far higher than my empire by year four"* in Throne
of Empires. The gate is `verify/verify-empire-fairness.mjs`; the two `diag/` scripts are how the
numbers behind it were found, and are the ones to re-run when tuning.

- `verify/verify-empire-fairness.mjs` — the keeper. Five properties on a played realm (hosts are
  supplied, defences are decisions, waves end, lost ground comes back, holding pays) plus the
  spawner's own curve by tenure and by difficulty. Fails 10/15 on the build before the pass.
- `diag/diag-empire-pressure.mjs` — plays empire headless with a policy and prints the whole
  pressure curve per turn: field power, the province being attacked, the wave, ration runway.
  `--expand tall|balanced|wide`, `--difficulty`, `--fix fed,clock` (counterfactuals), `--verbose`.
- `diag/diag-invasion-curve.mjs` — the *rule* rather than an outcome: builds realms of an exact
  shape, launches one real wave, and reports the chance the seat / the median province / the
  weakest province falls. Two tables — turn × tenure, and turn × province count.
- `shot/shot-garrison-defence.mjs` — the battle sheet a province with no field host puts up, and
  the same sheet with a host on the tile, so the two sets of words can be read side by side.

**The trap that cost the most here:** `getBuildOptions` returns `{ type, canBuild, reason }` and
upgrades come from a separate `getUpgradeOptions` (`{ index, canUpgrade }`). A driver reading
`.building` / `.affordable` builds *nothing at all*, silently — four measured runs said the
empire economy was food-negative when in fact the harness had never constructed a single farm.

## The FPS-playbook harnesses (2026-08)

- `perf/_boot.mjs` — shared bootstrap: `boot` (DSF 3 / high by default, pins `noladder=1` unless
  `ladder: true`), `startWorld`, `revealAll`, `driveToBattle`, GL counters, `report`.
- `perf/gl-gates.mjs` (`yarn perf:gates`) — the per-screen GL submission thresholds. Counts
  transfer across GPUs; the ms in headless runs do not.
- `perf/measure-ui.mjs` / `perf/measure-battle-beat.mjs` / `perf/measure-bake.mjs` — quiet-emit
  raster counts, the fight beat's cost ledger, and the bake/season-turn regression guards.
- `verify/verify-listeners.mjs` — scene-event listeners must not stack across runs.
- `verify/verify-ink-stamps.mjs` — the stamp registry on both backends, context loss included.
- `verify/verify-ladder.mjs` — launch-only Auto calibration, fixed current sessions, next-launch
  recommendations and preserved manual choices (runs without `?capture=1`).
- `perf/performance-acceptance.mjs` — production-compatible 4x-CPU Codex, scrolling, season,
  construction, ownership and chunk-budget gates. `measure-bake.mjs` also runs the fully
  revealed `performance-map-stress.mjs` gate.
- `perf/performance-soak.mjs` — 20 real minutes, repeated navigation, direct CDP heap samples
  after full collection, and a comparison after returning to the original starting scene.
- `verify/verify-map-work-budget.mjs` — active queue fairness, idle capacity and cleanup.
- `verify/verify-performance-policy.mjs` — simulated 60/90/120/144 Hz, 30/60 FPS pacing,
  exact elapsed-time delivery, full object bounds and the automatic clarity floor.
- `verify/verify-performance-layouts.mjs` — English/Vietnamese, short phones through ultrawide
  desktop mode, all profiles, zoom extremes and list clipping; visual coverage, not an FPS gate.
- `verify/verify-fog-chunks.mjs`, `verify/verify-atlas-loading.mjs` — stale fog on panning,
  missing/corrupt atlas recovery and the original-image bypass.
- `verify/verify-portrait-cache.mjs` — dev-server portrait pressure and live-owner retention.
- `verify/verify-fps-cap.mjs`, `verify/verify-tick-clock.mjs` — pacing and clock-carry contracts.
- `verify/verify-lost-ground.mjs` (`yarn verify:lost-ground`) — a province whose line broke does
  not fight again with its militia remnant that wave: later columns join the standing siege, and
  relief still gets its field (8 seeds × 400 ticks).
- `verify/verify-press-echo.mjs` (`yarn verify:echo`) — a press that ends a run, echoed by the
  platform (compat mouse pair, ghost click, doubled mousedown), never presses the front page it
  revealed; honest single and second taps still land.
- `verify/verify-resume.mjs` (`yarn verify:resume`) — coming back from the background: a throw
  inside a step is re-armed, a lost context that is never restored reloads into the run, a
  restored one repaints the faces, and the away pause sets and clears.
- `diag/diag-army-hash.mjs` (`--save` baseline) — command-stream identity for `drawArmy`;
  `diag/diag-figure-reach.mjs` — no soldier's ink clipped by his stamp box.

node test_scripts/diag/diag-meta-costs.mjs             # what the Legacy vault and the rubbing packs cost, priced in 9,000-score reigns
node test_scripts/diag/diag-economy-probe.mjs          # the opening's hostile hosts, every price the mode quotes against income, and four drivers side by side (naive, land-reading, disciplined, focus-only) — 16 seeds before believing a difference
node test_scripts/diag/diag-wave-parts.mjs             # every term of waveTargetPower at each wave start, and where each opening spawn came from
