> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# 29 — The Setup Phase and the Scaled Purse

*Dragon Ascent's opening becomes the time to build a realm, and its economy stays a game once the
realm is built.*

## The ask

> Beginning should be a time to learn, not to fight — time to set up the economy (claim the lands
> the realm needs, set the focus correctly, post the heroes). War happens, but limited: fewer than
> three army attacks in the first rounds. In the late game the cost of actions must scale with what
> we have, so resources never become useless; the economy must keep asking for careful choices.

## What the probe found (before)

Eight seeds, headless, the funscore's own engaged driver, measured with
`test_scripts/diag/diag-economy-probe.mjs`:

| Finding | Number |
|---|---|
| Hostile hosts in the first sixty seasons | 5–11 per seed (mean 7) |
| The second host of the run | season 16, in four seeds of eight: a **tribute demand** landed in the first Court window against a treasury of ~100 gold, and the refusal sent a punitive host during wave one |
| Raids | began at wave 1 once the realm held three provinces |
| Wave 4 against a realm that had lost its host | 935–2,165 men: the opening cap only ran while `marchable > 0`, so a hostless realm was quoted the whole curve |
| Provinces held at the end | 0 in every seed, every policy; peak 2–3 |
| Gold gross, naive vs land-reading steward at season 9 | 40 vs 94 |
| Stock of the terrain-favoured resource at the end | 66,050 food (seed 22), 35,615 supplies (seed 11) — nothing in the mode consumed a stock that size |
| Routine prices from founding to fall | farm 32, bribed village ~55, minimum host 70, reroll 68, burnt district tens — flat while gross ran 80 → 330 |

The war card's prices (walls, sellswords, buy-offs, gifts, oaths, tribute) were already pegged to
income. The economy's were not, so a well-run realm banked thousands with nothing left to decide.

## What shipped

### The opening is a setup phase

- `WAVE_GRACE_TICKS` 10 → 16: the first Court window is ten seasons, not four.
- `EARLY_WAVE_GRACE` 2 → 3: waves one to three are single columns (probe, probe, hunt). Through
  the grace there is no unscheduled march (the peace floor still marches), no raid, no rival
  demand, no punitive host — a collapsed empire's opportunist, a story's blow, a court answering
  an encroachment all wait for wave four — and the courts do not settle the map.
- `EARLY_WAVE_FIELD_SHARE` is six entries `[0.62, 0.85, 1.1, 1.3, 1.6, 1.9]`, and the cap reads
  `fieldablePower`: the hosts standing, or the host the realm's people and purse could raise now,
  floored at the minimum muster. A realm that lost its army is sized as though it had re-mustered,
  never as though it had nothing. Wave 4 with the royal host: 728; without it: 464 (was the whole
  curve, 1,553+).
- `RIVAL_LAND_PRESSURE` phases in over six waves after the grace instead of arriving at full
  weight the season the rivals begin settling.
- The seat is asked what it is for, once, before the first wave (`province-order` reason
  `'setup'`): the best of Food / Goods / Gold by aptitude, weighted up to double by a founding
  deficit, never below half suitability. A freshly-set focus is left alone for twelve seasons
  before the shortage card may propose another — it had been flipping the seat Food → Gold inside
  ten.

### Land value is on the card

Every conquest target and every Build-lane claim row says what the ground suits —
`Suits Food · 82%` — from `getLandAptitude`. The reward tag read today's outputs, and an unbuilt
village has none, so every village had said "open country".

### The scaled purse (`src/systems/ascent/priceScale.ts`)

`scale = clamp(1, (gross ÷ 120) ^ 0.6, 6)`, on gross gold income, smoothed 30% a season toward
the live figure so a price quoted on a card is the price charged when it is answered. Worn by
building and upgrade costs, bribed and diplomatic claims, the reroll, the restore bill, the
muster's coin (and `musterLimit`), equip / drill / reinforce coin, and the autopilot's build
reserve. Income rather than treasury on purpose: a stock-based price is a treadmill nobody can
save toward. Sub-linear on purpose: a realm earning five times the base pays about two and a half
times the price, so growth still buys more decisions a season and no decision becomes a rounding
error. Exactly 1 outside Dragon Ascent (`verify-modes-regression` byte-identical). The graft line
moves with the realm: max(4,000, 25 seasons of gross).

| Price | Founding (gross 32) | Grossing 600 |
|---|---|---|
| farm | 32 | 84 |
| bribed village | 57 | 148 |
| minimum host (320 men) | 70 | 182 |

### The stores (`src/systems/ascent/GranarySystem.ts`)

- Grain rots and goods spoil above twenty seasons of the realm's own use (floor 600): five percent
  of the excess a season, taken from the stock once the harvest is in — never from the rate the
  famine card reads. The ledger carries the figure; the Advisor says it once.
- Markets, harbours and guilds sell forty units a level a season, at 0.1 gold a grain and 0.2 a
  supply, from the Books page. The autopilot sells only the lot that would rot; everything under
  the line is the player's to keep, feed a host with, gift, or sell by hand.

## What it measured (after)

Same probe, same seeds, three drivers: `engaged` (the funscore's, first option everywhere),
`landwise` (the same cards, plus the land verbs — focus by aptitude and need, governors posted,
claims chosen by land value and made by hand from the Build lane, surplus sold), and `steward`
(landwise with disciplined spending).

| 8 seeds × 600 seasons | engaged (before) | engaged | landwise | steward |
|---|---|---|---|---|
| waves survived | 11.3 | 19.5 | 16.0 | 21.0 |
| hostile hosts in the first 60 seasons | 7.0 | 4.6 | 4.4 | 4.3 |
| provinces, peak | 3.1 | 6.1 | 6.1 | 5.0 |
| gold gross at season 150 | 98 | 539 | 493 | 404 |
| food / supplies at the end | 392 / 783 (66k, 35k outliers) | 1,015 / 771 | 422 / 210 | 568 / 632 |

The opening is exactly three single-column hosts at seasons 17, 29–31 and 41–46; the war begins
at wave four. The naive driver, which used to die in the opening, now reaches wave 19–20 and
grosses five hundred a season by season 150 — the setup phase does most of that.

**The scripted land-reading driver is not measurably better than the naive one.** At 16 seeds
`engaged` 19.8 waves against `landwise` 20.0, with single seeds swinging 8 ↔ 33 on both. Survival
in this mode is dominated by the war's variance, and a driver that claims by hand and sells its
surplus is a *different* plan, not a better one — it under-expands early (2.0 provinces at season
40 against 3.5) because its claim rule waits for a claim party and a certain method. The lever the
ask actually named — the focus — measured in isolation (`focused`: the naive driver, every province
worked for the focus its ground suits best, nothing else touched) comes out 18.7 waves against 19.8
at 16 seeds: a tilt chosen for the ground alone is a trade, not a bonus, and it does not buy
survival. What reading the land buys is the *resource it was read for* — the seat card and the
suits line make that readable, and the setup card weighs the founding's need — while survival in
this mode is decided by the war, whose sizing reads the realm's strength back (docs/phase-1/24-the-four-courts.md, the
tenure-dividend note in `ascentConfig.ts`). A survival premium for economic play is not a claim
this round can make from scripted drivers.

Funscore, 16 seeds: **85 / 85** (agency 2.00 — engaged 20.3 waves vs declining 10.1; before, 17.4
vs 6.6). Gate: `test_scripts/verify/verify-setup-phase.mjs`, 16/16.

## Round two

Asked *"any point to improve, any bugs?"* after the first pass; this is what was fixed the same day.

**Bugs**

- The reinforcement slider's ceiling read the unscaled bounty while the order charged the scaled
  one, so a rich realm could be offered more men than it could pay for. `reinforcementLimit` reads
  the same rate the order does.
- `verify-economy` had been measuring a frozen realm. Its driver answered every kind it did not
  know with `'ok'`; the resolver refuses that, the card stays pending, and the decision director
  raises nothing while one is pending — so from the first province card the seeded realm sat at
  one province with no host, which is what its three long-standing reds were. It now reads
  options through `READ_OPTIONS`, accepts musters, and never rotates into a siege.
- The opening cap's floor was *the host the purse could raise*, and that scales with wealth: on a
  seed where the founding's second claim party had the realm at six provinces by wave three, a
  932-man column marched on an actual host of 264. The floor is the minimum host, always.
- `ENEMY_CONTACT_FLOOR_TICKS` had no readers since the peace floor replaced it. Deleted.
- `verify-first-minutes` measured the one-button Inheritance card as "the first card"; it steps
  over it as it steps over the Coronation.
- Vite's watcher now ignores `test_scripts/`, `docs/` and `output/`, so writing a harness or a
  note no longer reloads every page a rendered harness is driving.

**Play**

- The setup card never proposes emptying a chair the founder was seated in two cards earlier.
- "Open country — quick to hold" is left off claim cards; the suits line says what the tag could
  not, and the tag still speaks where it says something.
- The markets take a second, thin lot each season at `SALE_THIN_LOT_RATE`, and the steward never
  takes it, so the Books row stays the player's during a glut instead of reading "sold".
- The founding has a second claim party through the grace (`OPENING_CLAIM_PARTIES`), and Ascent
  settles empty ground at half the per-slot pace. One party and a thirteen-season settle had made
  the whole grace a single claim.
- In Ascent a focus's penalty on the other two resources shrinks with aptitude
  (`FOCUS_PENALTY_AT_WORST` 1.1 to `FOCUS_PENALTY_AT_BEST` 0.5). A tilt paid in full whatever the
  ground said was a reallocation, not an advantage.

**Measured after round two** (16 seeds, `diag-economy-probe`; funscore 16 seeds)

| | engaged | focused (every province worked for the focus its ground suits) |
|---|---|---|
| waves survived | 22.5 | 21.3 |
| gold gross at season 40 / 80 / 150 | 153 / 300 / 365 | 290 / 444 / 575 |
| gold in hand at season 40 | 577 | 2,395 |
| provinces, peak | 5.9 | 5.8 |

Reading the land now roughly doubles the early economy; survival stays a wash at 16 seeds, which
is the war's variance, not the lever's. Funscore 85 / 85, agency 2.39 (engaged 24.3 waves against
declining 10.2). `verify-economy` passes for the first time since the costly-victory round, with
provincial demand at 42% of gross on a four-province realm and 33% on nine. `verify-ascent` is
fully green, including the two checks that had been red on HEAD. The opening gate reads its
first-wave floor in battle power, the cap's own unit: 0.46 to 0.53 of the field across four seeds.

**Left for its own round**

The match factor sits at its 1.7 cap from wave one on every seed, because the founding garrison
puts the facing defence near 1,500 against a 420 baseline. The curve the constants describe is
not the curve that runs. Recalibrating it moves every wave and needs a measured pass of its own.

## What did not move, and why

- `verify-ascent`'s single seeded main run diverges from HEAD the moment the opening's card order
  changes (HEAD's realm had 795 gold by its second sample, this build's had 0); its `autopilot
  built` check is one seed's fortune, and the eight-seed probe is the verdict.
- `verify-economy` (3 red on HEAD), `verify-siege-relief` (13/17 on HEAD) and `verify-first-minutes`
  ("the first card is a choice", red on HEAD) stay as they were.
