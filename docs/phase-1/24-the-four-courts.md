> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# 24 — The Four Courts

*Foreign relations become Dragon Ascent's difficulty dial, and the wave sizer stops cheating.*

## The two reports

> "Year 4, enemy attack me with 1k army."
> "Other kingdom relation not affected to gameplay at all."

Both were literally true, and neither was a balance choice. They were bugs, and there were nine of
them.

## What was wrong with the wave

| Fault | What it did |
|---|---|
| `clampFactor = totalSoldiers / rawTotal` | **Cancelled difficulty exactly.** `rawSizes` are rolled with `difficultyArmyScale` and this divides it back out. Every wave passes `totalSoldiers`, so easy (0.7) and ironman (1.7) spawned byte-identical hosts. `launchWave` carried a local compensation; the contact floor, story strikes and raids did not. |
| `waveMatchFactor(ascent.power, target)` | Compared the composite POWER scalar — treasury, grain and stores folded in at ×1.5 — against a raw battle-power target. Opening ratio ≈ **3.9**, so it pinned to its 1.7 cap on tick one and never moved. The `threshold: 1.15` grace never engaged once. |
| `laggedDefencePower` | Returned `live × 0.55` with no history and the raw sample the instant one existed: effective share **0.3025 → 0.57**, an 88% step between waves 1 and 2 from the lag machinery alone. |
| the shadow term | Sized against `contestedDefencePower` — three quarters capital masonry for a young realm — and paid out in **bodies** at 0.963. Measured: 460 field soldiers, a floor of 1,505 power, ~1,450 men delivered. |
| `chooseTarget` | Marched at the *nearest* province while the royal host held the seat under `defend`. A 556-man levy against ~1,450. |
| `projectedWinChance` | Computed against realm-wide defence, quoted **100%**, and `RESPONSE_ASK_BELOW_WIN` suppressed the card. Told it was certain, then shown a rout. |
| `ENEMY_CONTACT_FLOOR_TICKS = 30` | Sent a **full wave budget** with no card and no counter, in Year 4, alongside wave 2. |

Fixed in that order, then the baseline was re-tuned so the late game keeps its pressure.

## What was wrong with diplomacy

`tickDiplomacy` opened `if (!isCampaignMode(mode)) return;` — campaign-or-empire. In ascent
**nothing about a relationship ever moved**: a gift was permanent, gift fatigue never faded, trust
never drifted, treaties never expired, neglect cost nothing, and every `decay` field was dead data.
`proposePact` was gated identically, so no treaty was reachable in the one mode whose whole
difficulty is the war.

Relations did exactly one thing: route the wave. `pickAggressor` weighs a rival at
`max(5, hostility + power × 0.5)`, so a perfected court weighs 25 against a hateful one's 125 —
about a quarter of waves down to about a fifteenth, with the other three absorbing every wave it
declined. Same tick, same size, a different flag.

And eleven direct `.relations =` writes across the stories, hero arrivals and the vassal release
were erased by the next `recomputeOpinion`. A truce worth +45 could evaporate inside the game year
that granted it.

## The rule

> **Relations move the wave clock and the wave's size. They never move its existence.**

Read from the court `pickAggressor` actually chose, never an average — so cultivating the wrong
neighbour buys nothing and the player has to read the board.

| Standing with the aggressor | Clock | Budget | Hosts |
|---|---|---|---|
| Sworn friend · 80+ | ×1.6 | ×0.75 | −1 |
| Cordial · 60–79 | ×1.25 | ×0.9 | — |
| Indifferent · 40–59 | ×1.0 | ×1.0 | — |
| Cold · 20–39 | ×0.85 | ×1.15 | — |
| Hateful · under 20 | ×0.7 | ×1.3 | +1 |

### The floor

```
peaceFloorTicks(wave) = lerp(40, 14, min(1, wave / 20)) × random(0.8 .. 1.25)
```

Five played years of grace while the realm is young, under two by the late game, and never the same
number twice. Announced a wave ahead — *"The courts have been quiet too long."* This is what stops
diplomacy becoming a no-lose strategy, and it replaced `ENEMY_CONTACT_FLOOR_TICKS` as the mode's one
guarantee that it is still a siege.

## You cannot befriend everyone

Two hereditary feuds, paired at worldgen, symmetric, shuffled per run. Warming one court applies
half the same value, negative, to its partner (`FEUD_ENVY_SHARE`). Gift the North +16 and the South
loses 8 — so the arithmetic says two friends and two enemies is the ceiling without a word of
tutorial, and *which two* is the strategic question.

Cooling is deliberately **not** mirrored: souring a court does not warm its rival. That is what
`denounce` is for — free, loud, and a deliberate choice of sides.

The courts act on the feud too: `resolveInterEmpireWar` now prefers a feud partner as its target.

## Campaigns that end

`progressArmyLogistics` opens `if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;`, so the
`rations: 350` on every spawned host was decorative and a conquest host that could win marched for
ever at zero upkeep.

Invasions now carry `campaignTicks` — **14** to start, spent every season in the field including
under a siege, refilled by success (**+8** province, **+4** sack, **+2** field battle, capped at
**28**). At zero the host lifts its siege and goes home by the path a spent raider already uses.

A court may commit at most **3** hosts; **6** stand on the map at once. Over three is therefore
necessarily more than one crown, so a coalition reads as a coalition.

## What a warm court is worth

| Action | Costs | Gains |
|---|---|---|
| Send gold (token / standard / lavish) | ×1 / ×2 / ×4, sub-linear return | +6 to +22 |
| Send grain | food, priced at *their* hunger | +6 to +26 |
| Trade charter | influence | +8, and opens the exchange |
| Send a champion | a hero, for years | +5/yr to +28 |
| Non-aggression pact | a large one-off | +20, clock ×1.6 |
| Call for aid (70+) | −15 standing | a relief column, this battle |
| Ask them to go home (45+) | gold by campaign left | the host withdraws |
| Denounce | nothing | −25 there, **+12** with its feud partner |

**Relief is not a new kind of thing.** `Army.patron` already describes a host on our side that the
player cannot order, reinforce, disband or be billed for, and `enrolArrivals` already seats an
arrival every beat. An allied column is a patron host dropped on the contested province — no new
battle machinery at all. Sized against the host it answers, so it is help rather than a rescue.

**The exchange** gives the four courts *different economies* rather than different numbers: a court
whose `stability` has collapsed pays dearly for rice, an `economic` power sells cheap.

## Two prompts that could never be answered

Both found by driving full runs, both pre-existing, both made reachable by this work:

- **`conquer-method`.** `handled = attempt.attempted`, and `executeConquestMethod` refuses outright
  when the chosen method is no longer open — which happens whenever the province changes hands while
  the card stands. The dispatcher puts an unhandled prompt back, the sheet's *snapshot* still lists
  the method as open, and the same choice is refused for ever. Measured: `stuckPrompts:
  ['conquer-method']`, and every card behind it — the Power Draft included — never fired again.
- **`envoy`.** An action the realm could not pay for did the same. Invisible on screen, because
  unaffordable rows are drawn `disabled`; reachable by the autopilot, which chooses by id.

## What the measurements say

16 seeds, A/B against the pre-change build served on its own port.

| | before | after |
|---|---|---|
| agency ratio (mean of 4 pairs) | 0.92 | **1.03** |
| waves survived, engaged play | ~21.3 | **~24.5** |
| peak threat ÷ defence | 17.56 | 15.21 |
| objective score /85 | 51 | 50.4 |
| `verify-modes-regression` | — | **byte-identical** for rival / campaign / empire |

The headline is the first two rows: engaged play now outlives declining play, which it did not
before, and lasts about three waves longer. The objective total is flat inside a metric that swings
±4 at 8 seeds.

## Five gaps a second review found

The first pass shipped nine of the eleven requests and left two half-done. Read again against the
code rather than against the summary:

| Gap | What was actually true |
|---|---|
| the war floor | `peaceFloorBreached` only forced a **raid**, and `startWave` applied the relations dial unconditionally — so a realm at 80+ standing with every court sat on a ×1.6 clock and a ×0.75 budget for the rest of the run. The floor now takes the dial away entirely and says so. |
| one or many kingdoms | Two courts could end up on the map together by coincidence; nothing ever *decided* to pile on. `maybeJoinTheWar` now lets a cold, non-feuding court join a war the realm is visibly losing. |
| random events | Not implemented at all. Six now exist, each naming two courts wherever it can, because the question this mode asks is never *do I want to be liked* but *by whom*. |
| the exchange | Gated on a charter alone, which can be signed with a court that despises us. Now needs standing too. |
| sending a hero | The one warming that carried no envy — and the one the request explicitly named. |

Verified by `verify-foreign-relations.mjs`: **31 checks**, each driving the real function and
asserting the world moved, so a change that quietly disconnects one fails there rather than in a run.

## A third prompt that could stall a run

`resolveWorldEvent` refuses an id it does not define, which is correct — but it means any answerer
that does not know a kind hangs the queue for the rest of the run, and that has now happened three
times. So the dispatcher drops a card after **three** consecutive refusals rather than re-arming it
for ever. The failure is never local: the Power Draft, the appointments and the law cards all go
silent together behind it.

## What the pacing cost, and what it did not

Adding a tenth prompt kind looked like it was starving the decision budget: back-to-back scheduled
cards went from 6 to 13 across six seeds. Four mitigations later — lowest priority, a longer gap, a
required quiet stretch, and raising events only into a Court slot nothing else wanted — it sat at 9.

Then the feature was switched off entirely and **the numbers did not move**. World events were never
the cause; the difference is the wave and relations work changing what a run does, which is the
point of the round. The mitigations are kept because an event genuinely should not outrank the
realm's business, but the diagnosis they were built on was wrong.

`verify-ascent` lands ~3.5 failures a seed against the baseline's ~2.5, in a harness whose own
baseline ranges 1–5. Those are the soft *did this card fire in this run* checks rather than
correctness ones, and the round's own metrics — agency, waves survived, the 31 promises — all moved
the right way.

## Two harnesses that were measuring the wrong thing

- `verify-fronts` sized its probe at a fixed 700 men. That was a fight against the realm the old
  wave curve left behind (24 militia, 462 garrison power) and a walkover against a healthy one — at
  0.38 against 1,647 of defence the watch gate correctly refused it, and the file failed for testing
  the odds band by accident. It now sizes the probe to ~1.2× the defence standing there.
- `verify-ascent`'s orders probe said *"a full treasury, so no host is dissolved for arrears"* and
  topped up only gold. A host starves on **rations**. Across five seed offsets the same build passed
  four and failed one, and the baseline failed a different one.
