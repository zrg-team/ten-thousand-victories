> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Three Breaths of Battle

Three Breaths of Battle

Dragon Ascent · fight screen · design plan

# Three Breaths of Battle

The live battle is the best thing in the mode and the most broken. It writes twenty-one lines of drama per fight and shows none of them, resolves six rounds in a single frozen jump onto a blank cream rectangle, and opens almost exclusively on fights that were already won. Here is the measurement, the research, the rebuild — and exactly why the result should feel better to play.

**Measured** 19 Aug 2026, seeds 20260808–20260843
**Harnesses** battle-lab · diag-ascent-battles · probe-fights
**Status** plan only — no code written

The verdict

## The screen cannot show the battle, and the battle is not worth showing

Two independent failures compound. **The presentation is a slideshow**: `advanceBattle` runs six rounds in a burst inside the 3.5-second economy tick, so an entire engagement is four or five frozen jumps. **The content is a walkover**: the seat of the dynasty opens the screen unconditionally and then musters a three-thousand-man levy, so the median watched fight has the enemy bringing **12%** of our numbers. Nothing that follows can be dramatic.

0.12

Median opening odds — enemy men per one of ours, across 46 watched fights

76%

Watched fights that are walkovers (enemy under 35% of our strength)

7%

Watched fights genuinely in doubt (odds between 0.6 and 1.8)

4–5

Visible updates in a whole battle — six rounds land at once, then 3.5 s of nothing

21 → 0

Log lines the simulation writes per fight, versus lines the screen renders

60 / 10

Win rate pressing versus holding. One standing order strictly dominates

1,180

Men still drawn in the ranks of a host that is down to 300 — the block is built once and never rebuilt

#### Where those numbers came from

Three harnesses against the real scenes on a throttled mobile viewport. `battle-lab.mjs` replays identical armies under seven policies; `diag-ascent-battles.mjs` logs every watched engagement beat by beat; a new probe records opening odds and outcome for every fight across six seeded runs of 160 ticks.

| Policy (battle-lab, 200 fights each) | Win rate | Rout rate | Survivors | Reading |
| --- | --- | --- | --- | --- |
| auto — the skip button | 12.0% | 2.5% | 49.6% | baseline |
| always-hold | 10.0% | 1.0% | 49.9% | dominated |
| always-charge | 60.0% | 60.0% | 50.3% | dominant |
| reserve-at-contact | 19.0% | 17.0% | 44.2% | timing barely matters |
| retreat-in-time | 19.0% | 16.5% | 44.2% | costs men vs fighting on |
| adaptive — playing well | 92.0% | 92.0% | 50.0% | wins by pressing, not by playing |

The trap: `battle-lab` passes “playing beats skipping” by 80 points, which looks like a triumph. It is not. **Press and hold have the same exchange ratio** — `1.20 ÷ 1.10 = 1.091` against `0.85 ÷ 0.78 = 1.090` — so pressing is simply the same trade delivered faster, with a free +9 morale on contact and 60% arrow cover on the way in. `adaptive` wins because it presses. There is one order, wearing two labels.

#### What actually opens the screen — 46 fights, six runs

| Opening odds (theirs ÷ ours) | Share | What the player sees |
| --- | --- | --- |
| under 0.35 — walkover | 76% | sixteen rounds of “we lose 7, they lose 3” against a line that never dips below 70 morale |
| 0.35 – 0.60 | 11% | slow certain win |
| 0.60 – 1.80 — in doubt | 7% | the fight the screen was built for |
| over 1.80 — hopeless | 6% | a small host caught by a wave; over in ten rounds |

**The mechanism.** `worthWatching` returns `true` unconditionally when the province is the capital. The capital carries the realm’s largest `defense` value, and `raiseGarrisonLevy` converts that straight into bodies — `3,299` men in one sampled run against a `590`-man raid. The odds band that guards ordinary provinces is never consulted. Thirty-four of the forty-six opened fights were on the seat.

The machine as built

## What is already there, and is good

This is not a rewrite. The simulation underneath is genuinely well made and most of the plan is about *surfacing* what it already computes.

Morale as currency

`armyPower` multiplies by `morale/100`, so a sagging line compounds into collapse on its own. Hosts break individually below 32.

**Already correct.** It is simply never made visible — no rout line, no wavering state.

An archery approach

Before contact, `archers` trade at `VOLLEY_BITE`, and closing fast buys cover. Composition matters here and nowhere else.

**Already correct.** The screen never shows either side’s composition, so the payoff is invisible.

Multi-column fields

Every host draws its own marker; relief marches in mid-fight and enrols on the next beat; focus concentrates 2.2× on one column at 0.35× on the rest.

**Already correct.** Enemies average **1.8** columns, so focus is a live decision roughly half the time.

A reactive enemy

`enemyPosture` reads `kingdom.personality` and the morale gap. Aggressive, defensive and economic powers produce measurably different fights (94% / 80% / 76%).

**Already correct.** The player is never told which one they are facing.

Desperation scaling

Reserve and rally both scale with how far the line has sagged, so holding them is a real gamble in both directions.

**Already correct.** Nothing on screen indicates when the moment has arrived.

A written record

`battle.log` collects volleys, charges, relief, broken hosts and every exchange. `battleHistory` keeps the last 24 engagements.

**Already correct.** Both are write-only. The player sees a one-line toast.

### The call path, end to end

`advanceAscentTick` → `beginBattle` (gated by `worthWatching`) → `advanceBattle` ×6 `fightRound` → `finishBattle` → `resolveBattleRecord`. The view is `ConquestUIScene.showBattle`, three layers (field / readout / orders) polled by a 420 ms timer, wired back through `ui:battle-order` and `ui:battle-focus` events on `ConquestScene`.

The 420 ms screen clock and the 583 ms-per-beat delivery rate are unrelated numbers. `battle-lab` reports “melee lasts 7.6 s” by multiplying beats by `BATTLE_TICK_MS` — a clock that does not drive anything. The real figure is ~10.5 s delivered in three jumps.

Mockup 01

## The screen today

Captured from the real game, seed 20260812, wave 4. The proportions tell the whole story: the fight occupies a fifth of the screen and does not move; the form occupies two thirds and scrolls.

**1**168 px of field — 20% of the screen

**2**no log, no clock, no odds

**3**seven scrolling rows

**4**two orders, one dominant

Year 7 · Summer♛ 20 (−4) · 1.8k (+45) · 26 (−15)

Power

3,181

Threat

420

The great host reaches  
Thanh Châu Hạ

Against Vương Quốc Phương Nam

The realm holds its breath. Give the first order to let the fight begin.

⚑

1192

▲▲▲

⚑

436

▲▲▲

Our host1192

⚑ Fight them all

Spread the line evenly across every host.

⚔ Press the attack

Break them faster, and bleed faster doing it.

🛡 Hold the line CURRENT

Trade cautiously. Fewer of ours fall, and fewer of theirs.

⚑ Commit the reserve

114 men waiting at camp join the line. Once only.

♛ Rally the line

Your general steadies them. Once only.

Close

**As shipped**A diorama with a form bolted under it. Everything below the strength bars is static text that could have been a prompt.

**1**

The field is 168 px and holds two stick markers on flat ground. It updates four or five times in a whole battle, because six rounds resolve at once inside the economy tick.

**2**

No round counter, no odds, no terrain, no enemy intent, no log — although the simulation computes every one of them. `ascent.battle.terrain` and `ascent.battle.moraleOurs` are translated into two languages and never rendered.

**3**

Seven order rows in a scroll area. Retreat — the one way out of a losing fight — sits below the fold.

**4**

Press and hold are presented as a real choice and are not one. Measured, pressing wins 60% of contested fights and holding wins 10%.

**5**

When it ends, the player gets a single line in the message strip. No losses, no spoils, no promotion, no aftermath.

Research

## What makes a fight screen worth watching

Five reference points, chosen because each solves a problem this screen actually has — not because they are famous. What matters is the transferable principle and its cost here.

Into the Breach

Every enemy telegraphs its exact intention before you act. Perfect information moves the player from “figuring out how it works” to “figuring out how to win”, and makes every loss feel earned.

**Free here.** `record.plan` already carries `spearhead / flanker / raider`, and `enemyPosture` already derives the opening posture from `kingdom.personality`. Print it.

Mechabellum

You commit, then you watch. It works because cause and effect are legible — when the plan works you see it work, and when it fails you can see where. The commitment phase is what makes the watching tense.

**The missing phase.** There is no moment of commitment: the screen opens already fighting and offers a list. Add an Order of Battle before the first beat.

Bad North

Three unit types, one screen, broad-stroke orders; time slows while you give one. Minimal input over a rich simulation — accessible without being shallow.

**The layout thesis.** Everything on one screen, nothing scrolls, orders are two taps. Our simulation is already this shape; the UI is not.

Total War morale

Drama comes from stacking negatives until a unit spikes past its breaking point — and a routing unit drags its neighbours down with it. Wavering is a visible state before it is an outcome.

**Half-built.** Morale, per-host breaking and rout losses all exist. Missing: the visible rout line, the wavering state, and any cascade between neighbouring hosts.

Juice, with the warning

Damage floaters, hit-stop and a short directional shake make impacts read as impacts. But the literature is blunt: juice is often a smokescreen for combat that lacks depth.

**Sequenced last, deliberately.** Rounds 1 and 2 fix pacing and agency. Juice only lands in round 3, once there is something worth punctuating.

The mode’s own fantasy

Dragon Ascent is about watching the realm you built hold the line. The battle is the one place that promise is cashed.

**The selection rule.** Rarer and harder beats frequent and safe. Four to six fights a run, every one in doubt.

Research → critical → tune

## Three rounds, in dependency order

Each round fixes a defect the next one depends on. Fixing agency before pacing would be unmeasurable — the player cannot react to a screen that moves four times. Fixing stakes before agency would be decoration.

ROUND 1

### Make it watchable

the screen is a slideshow

Research

Legible cause and effect is the whole engine of a watch-your-army fight (Mechabellum). Legibility needs continuity: a plan that “works in real time” is invisible if the picture updates four times.

Critical

- `advanceBattle` runs `BATTLE_BEATS_PER_TICK = 6` inside a `3,500 ms` economy tick. Six rounds land in one frame; the screen then shows nothing for 3.5 seconds.
- The 420 ms UI clock polls a state that has not changed. Marker tweens run against stale targets.
- The approach phase — the archery opening the code is proudest of — resolves entirely inside the *first* jump. The player never sees an arrow.
- 21 log lines per fight are written and discarded. This is the cheapest content in the codebase.
- **The armies never visibly shrink.** `slideMarkers` updates the strength *label* and moves the container; the block itself is built once. `hostShapeAt` draws one figure per 55 men — so a host ground down from 1,180 to 300 keeps drawing twenty-one ranks of men who are dead. See [the battlefield](#battlefield).

Tune

- **The beat buffer.** Keep the simulation exactly where it is — six rounds per tick, deterministic, harness-safe. Have `fightRound` push a small snapshot per beat (strengths, morale, advances, losses, log line) onto a replay queue. The screen plays them out one per **560 ms**, so the six beats fill 3.36 s of the 3.5 s tick. *No simulation change, no determinism risk, no harness churn.*
- **Show the record.** A two-line log ribbon along the bottom of the field, newest line inked, previous line faded. Zero new content.
- **Show the clock.** A pip track of `totalRounds` across the top. “Spent” outcomes become legible and the last third gains urgency.
- **Show the loss.** A damage floater over each host per beat, straight from the buffer’s per-beat delta.
- **Give the field the room.** 168 px → 320 px. Orders drop to a fixed dock that never scrolls.

Gate — extend `battle-lab` to report wall-clock from the buffer, not `BATTLE_TICK_MS`. Target: **28–45 visible beats** over **18–32 s**, longest gap between updates under **700 ms**.

ROUND 2

### Make the orders real

one order wearing two labels

Research

A choice is only a choice if each option wins under conditions the other loses under. Perfect information (Into the Breach) is what lets the player identify those conditions rather than guess.

Critical

- Trade ratios are identical to three decimals: press `1.20/1.10 = 1.091`, hold `0.85/0.78 = 1.090`. Press is the same trade, faster.
- Press additionally gets `+9` morale on contact, `1.5×` closing speed and `0.4×` incoming arrows. Hold gets nothing in return.
- Reserve and rally already scale with sag — but nothing tells the player the moment has come, so timing measured no better than firing them at contact (19% vs 19%).
- Retreat-in-time *loses* men against fighting on (44.2% vs 49.9% survivors). harness limitation — `battle-lab` never calls `finishBattle`, so it cannot see `WITHDRAW_RECOVERY = 0.45`. Fix the harness before touching the number.
- The enemy’s doctrine changes the fight by 18 points of win rate and is never named on screen.

Tune

- **Separate the two orders by kind, not by degree.** Press becomes *fast and expensive*; hold becomes *slow and efficient*. Proposed: `CHARGE_TRADE {dealt 1.35, taken 1.25}` → ratio 1.08; `HOLD_TRADE {dealt 0.78, taken 0.58}` → ratio 1.34. Now the round limit is the tension: press when you must break them before the pips run out, hold when you can outlast them. superseded — [the posture triangle](#triangle) is the stronger form of this: a three-cycle cannot have a dominant option at all, and these constants become the counter’s *weight* rather than the whole defence against dominance.
- **Charge should fear archers.** `CHARGE_COVER 0.4 → 0.6`, so an arrow-heavy enemy punishes a rush and the approach becomes a real read.
- **Telegraph the enemy.** An intent chip above their line, from `record.plan` + `kingdom.personality`: “Their spearhead means to storm the gate — they will press from the first beat.”
- **Mark the moment.** Reserve and rally show a NOW flag when sag crosses the band where their multiplier peaks. Waiting still pays; waiting too long still loses them.
- **Give the pre-fight a decision.** The Order of Battle (below) — three plans that reuse existing constants, and the one place composition becomes legible.

Gate — `battle-lab`: gap between always-hold and always-charge **≤ 15 pts**; adaptive beats the best fixed policy by **≥ 12 pts**; adaptive win rate lands **40–60%**; each Order of Battle plan wins its own scenario band.

ROUND 3

### Make the fight matter

the showpiece opens on walkovers

Research

Rarity is what makes a showpiece one. The mode’s own fantasy — the realm you built holding the line — is only cashed when the line might actually break.

Critical

- The capital bypasses the odds band entirely, and carries the largest levy in the realm. 34 of 46 opened fights were on the seat, at a median of 0.10 opening odds.
- 5.6 fights per 100 ticks ≈ 9 per run, against a stated design target of 3–5 — and three quarters of them decided before the first beat.
- Our lowest morale across a whole fight averages **70**. The rout threshold is 32. The line is never in danger.
- Roughly two thirds of all engagements resolve invisibly, and produce no report at all.
- The end of a battle is a single line in the message strip. `battleHistory` already records starts, ends, rounds, outcome and whether the levy fought — all unread by the UI.

Tune

- **One gate for everything.** The capital keeps its priority but not its exemption: it must still clear the odds band, unless the seat is genuinely at risk (enemy power ≥ 60% of the seat’s line, or the capital-loss clock has started). Great Invasions stay unconditional — measured, they are usually in band anyway.
- **Prefer fights with shape.** When two engagements qualify in the same window, open the one with more enemy columns — focus is only a decision when there is something to choose between.
- **The aftermath card.** The butcher’s bill, what it bought, and one line of chronicle. Every figure already exists in `battleHistory` and `grantRepelSpoils`.
- **Report the hidden fights.** One dispatch per wave summarising what the generals fought without us — so auto-resolve stops being a silence.
- **Then the juice.** Hit-stop on first contact, a short directional shake when a host breaks, the marker turning and fleeing. Last, on purpose.

Gate — probe: median opening odds **0.7–1.4**, **≥ 60%** in the 0.6–1.8 band, **≤ 15%** walkovers, **4–6** fights per run, our lowest morale averaging **≤ 50**. Then `/funscore` and `/playtest` before and after.

The design

## Three breaths, and a reckoning

The fight gets an explicit shape borrowed from what the simulation already does — a commitment, an archery approach, a clash, a break — plus the payoff it has never had. Total: about 40 seconds, of which two moments are paused and the player’s.

Order of Battle

paused

Enemy intent named. Both compositions shown. Choose one of three plans.

First Breath

~7 s · 12 beats

The approach. Arrows fall, lines close. Focus a column.

Second Breath

~18 s · 20+ beats

The clash. Posture, focus, reserve, rally — with the moment marked.

Third Breath

~4 s

The break. A host turns and runs, or the pips run out.

The Reckoning

paused

The bill, what it bought, one line for the chronicle.

Year 7 · SummerWave 7 · Great Invasion

Power

3,181

Threat

1,340

The great host reaches  
Vân Thành Đông

Against Liên Minh Phương Đông

⚑ Their spearhead means to storm the gate
⛰ Hills — the ground favours us ×1.25

Our host · 2 columns

1,180

✕

Their host · 2 columns

1,340

Spears
Bows
Heavy
They out-shoot us 2 to 1

Order of battle

🛡 Shield Wall

Close under cover, then grind. Fewer of ours fall on the way in and in the line — but they will not break quickly.

🏹 Arrow Storm

Hold the approach four beats longer and shoot. Deadly with bows; a poor line when they finally reach us.

⚔ Hammer Charge

Straight to contact, +12 heart, no cover. Decisive if we are stronger — and we are not.

Give the order

Leave it to my generals

**Mockup 02 — Order of Battle**The commitment the screen never had. Enemy intent is named, both compositions are shown side by side, and the ground’s edge is finally printed. The three plans map onto constants that already exist.

Year 7 · SummerVân Thành Đông · round 13 of 22

Our host

842

Theirs

611

THE CLASH9 rounds left

▲▲▲

our camp

▲▲▲

their camp

⚑

604

Mã Viện

⚑

238

Levy — wavering

⚑

352

Vanguard

⚑

259

Flankers

⚔

−31

−67

Their vanguard is wavering — 34 heart.

Exchange 13: we lose 31, they lose 67.

OUR LINE842 / 1180

611 / 1340THEIRS

🛡 Hold the lineslow · efficient

⚔ Press the attackfast · costly

NOW⚑ Reserve114 fresh men

♛ Rally+18 heart

🎯 Vanguardfocused

⚑exit

**Mockup 03 — The Clash**Field 320 px, dock fixed at four controls, nothing scrolls. The pip track is the clock; the rout line on each morale bar is the threshold; the ribbon is `battle.log`, finally rendered. NOW fires when the sag multiplier on the reserve peaks.

Year 7 · SummerWave 7 broken

Power

2,904

Threat

0

They break and run

Vân Thành Đông holds · 17 rounds

⚑

872

the field is ours

⚐

—

scattered

→→

The butcher’s bill

Our host**1,180 → 872** −308

Wounded carried off the field**+138**

Levy of Vân Thành Đôngreturned to the walls

Their host**1,340 → 0** broken

What it bought

Spoils of a broken wave**+240 gold**

Mã Viện · the host**+15 XP** → level 4

Ambition**+1** · they will come harder

“They came at the gate in two columns and left in none. The levy of Vân Thành Đông stood where the road bends, and did not move.”

Return to the realm

**Mockup 04 — The Reckoning**The payoff the fight has never had. Every figure here is already recorded in `battleHistory`, `grantRepelSpoils` and `XP_PER_BATTLE_WON` — today it is thrown away and replaced with one line of message strip.

Art direction

## It has to look like a fight, on a piece of land worth fighting for

The field today is a cream rectangle 168 px tall containing two clusters of tent glyphs and two blocks of figures standing on nothing. There is no ground, no horizon, no province, no terrain, and — the defect that undoes the rest — **the armies never visibly shrink**.

None of that needs new art. The Đông Hồ renderers already draw villages, citadels, paddy fields, karst ridges, treelines, buffalo and marching host blocks, and the battle screen currently uses exactly one of them. The plan is to compose a scene out of what the map already paints.

#### The defect that matters most, in one function

`hostShapeAt(men)` draws one figure per `MEN_PER_MARK = 55`, so a block’s area already tracks its headcount — a 1,180-man host is 21 marks, a 300-man host is 5. But `slideMarkers` only calls `count.setText(...)` and moves the container. The block is built once in `buildBattleField` and rebuilt only when host *membership* changes. A host ground down from 1,180 to 300 spends the whole battle drawing twenty-one ranks of men who are already dead, with a number above them that says 300.

**The fix is one line of policy:** rebuild a host block whenever its *mark count* changes — that is once per 55 men lost, roughly twenty rebuilds across a fight, at ~21 `figure()` calls each. Cheap, exact, and it makes attrition the most legible thing on the screen without a single number being read.

### The composition, painted bottom-up

Five bands, in paint order — `settlements.ts` already establishes the rule that a scene collects `Standing { y, draw }` and sorts by ascending `y`, because Phaser does not depth-sort container children.

z0

**Distance**

Karst silhouettes and a soft ridge in chàm indigo, a treeline, two herons crossing. Nothing here ever moves or means anything — it exists so the field has a horizon instead of an edge.

karstRange()  
planSoftRidge() / softRidge()  
heron()  
*PIGMENT.cham / chamPale*

z1

**The ground**

Paper texture, then a ground tone laid under the whole killing floor, then scatter drawn from the province’s *real* terrain type — paddy, forest, hills, marsh. The fight happens somewhere specific, and that somewhere is the one already on the map.

createPaperGround()  
groundTone()  
SCATTER[terrain].kinds  
tree() bamboo() grassTuft()

z2

**What is being defended**

Our province at the left edge, drawn from its own data: `village()` for an ordinary district, `citadel(era)` for the seat, paddy strips in front, a buffalo, the realm’s standard on a pole. On an assault the sides swap — their walls are the thing we are running at.

village() / hamlet()  
citadel(era)  
paddyLattice() + drawFieldPlot()  
buffalo() hayStack()

z3

**What came for it**

Their war camp at the right edge — tents, a siege engine if the wave is Great, carts, muted standards. Read together with z2 this is the whole stake of the fight stated as a picture: a village on one side, an army on the other.

hamlet() at camp scale  
house() dinh() thap()  
*mutePigment on their banners*

z4

**The armies, and the dead**

Both host blocks at close-up scale, rebuilt as they thin. Fallen figures accumulate on the killing floor between them, up to a cap. Dust rises where the lines meet. Loss numbers float off the point of contact.

drawHost() + marchInPlace()  
hostShapeAt(currentMen)  
figure() rotated, for the fallen  
groundTone(muc, low alpha)

### Three ways a loss is shown, because one is never enough

#### The ranks thin

The primary channel, and free. One figure per 55 men means the block shrinks in area as the fight runs. Nobody counts figures — the eye compares the two blocks, which is exactly what `MEN_PER_MARK` was designed for.

#### Numbers rise off the contact

Per beat, from the buffer’s own delta: ours in sỏi son, theirs in ink. The palette file is explicit that son is spent on “your banner, your seal, *your losses*” — so our casualties are the one red thing on the field, and the eye goes to them.

#### Bodies stay on the ground

A few `figure()` calls laid flat at the point of contact each beat, capped near 40. The killing floor fills up as the fight goes on, so the field itself is a record of how hard it was — and it is still there on the aftermath card.

### The crash

Two blocks sliding to a stop beside each other is not a fight. Contact — `ourAdvance + theirAdvance ≥ 1` — has to be an event:

- **They interpenetrate.** The front ranks overlap by roughly one file rather than stopping at a gap, so the two blocks read as one contested mass with a seam, not as two rectangles.
- **They shove.** The existing chained tween already does this — it just has nothing to shove into. On contact the shove amplitude scales with the beat’s power ratio, so a side that is winning the exchange visibly pushes the line.
- **Hit-stop.** A 90 ms freeze on the first contact beat and on any beat that breaks a host. The cheapest impact tool there is.
- **Dust and ink.** A low-alpha `groundTone` in mực over the seam, growing with the number of beats fought, plus a scatter of crossed strokes.
- **A rout is a direction.** A broken host does not vanish — its figures turn (`faceTravel`) and run off their own edge over two beats, leaving bodies behind.

Year 7 · Summer · rice terracesround 13 of 22

Our host

842

Theirs

611

−31
−67
⚔

Their vanguard is wavering — 34 heart.

Exchange 13: we lose 31, they lose 67.

OUR LINE842 / 1180

338 fallen

611 / 1340THEIRS

729 fallen

🛡 Hold the lineslow · efficient

⚔ Press the attackfast · costly

NOW⚑ Reserve114 fresh men

♛ Rally+18 heart

🎯 Vanguardfocused

⚑exit

**Mockup 05 — the battlefield**Our village and its paddy terraces on the left, their camp and siege tower on the right, the two hosts crashed together over rice ground with the dead accumulating between them. Every element here is an existing drawing function; the ranks thin as men die, and the only red on the field is ours.

**Approach**beats 1–12 · arrows only

−9
−24

**The crash**contact · hit-stop · the shove

−31
−67
⚔

**The break**they turn · bodies stay

they break and run

**Mockup 06 — the same ground, three moments**Approach, crash, break. Blocks thin between the panels because `hostShapeAt` is recomputed; the dead stay where they fell; a routing host turns and leaves by its own edge rather than being deleted. Note the enemy is never drawn in sỏi son — the palette reserves that red for the player.

#### What this costs, and how not to pay it twice

**Bake the still half.** Sky, ridges, treeline, both settlements, the paddy strips and the terrain scatter never change during a fight. Composite them into one RenderTexture when the battle opens — the same trick `MapScene` uses for terrain, which replaced ~160k per-frame fills with a single textured quad. Only the host blocks, the fallen, the dust and the floaters draw live.

**Budget the live half.** Two to four blocks at up to 21 marks each is ≈ 84 `figure()` calls, rebuilt roughly once per 55 men lost — about twenty rebuilds across a whole fight, not per frame. The fallen are capped near 40 and drawn once each into a single accumulating `Graphics`. This is well inside the budget the map already carries.

**Watch the two traps the skill file names.** Every prop’s first line is `unitScale('<key>', scale)` — the battlefield is a close-up, so it runs at a larger scale than the map and anything that skips this will be the wrong size. And composites must paint bottom-up by ascending `y`: `setDepth` inside a Phaser container is silently a no-op, which is exactly how a soldier ends up standing in front of the tree he is behind.

**Height is the real constraint.** `GAME_HEIGHT` clamps as low as 620, so the battlefield cannot be a fixed 320 px. It should be a fixed aspect band — roughly 4:3 of the content width — that shrinks with the screen, with the dock pinned and the rails between them absorbing the difference. `verify-header-fit` and `verify-scroll` already exist because this has broken before.

Vietnamese sources

## What the record actually says, and the seventeen places it changes the drawing

This is looked up, not guessed, and where the evidence is thin or reconstructed I say so. Three findings change the army silhouette outright, one gives the standard a precise specification it currently lacks, one supplies an entire second battlefield, and one raises a question about a colour in the palette file.

### The print

01

**Five blocks, and the outline is pulled last**

A Đông Hồ print uses five woodblocks of two kinds — colour blocks and one outline block — and is printed five times, the soot-black contour going on over the colour. The misregistration is a property of the process, not a flaw.

*Already right.*  
washFill(registration 1.6)  
inkPath three-pass

02

**Flat space. No perspective.**

The tradition uses flat decorative space with bold silhouettes and text set into the image — not receding depth. So the battlefield must be *banded*, never a ground plane with a vanishing point, and the two host blocks must not foreshorten with distance.

constrains the whole scene  
*the map is already like this*

03

**Five colours, from named materials**

Black from burnt bamboo leaves, white from crushed shell, red from powdered red gravel, yellow from sophora buds, green from cajuput leaves, blue from verdigris. The whole battlefield should be composable in five inks plus the paper — which is also the existing “no new hues” policy, arrived at independently.

PIGMENT muc / diep / son / hoe  
+ cham / giDong  
*see the correction below*

04

**Heroic subjects are in the tradition**

Alongside the pigs and the Rat’s Wedding, Đông Hồ prints Hai Bà Trưng, Bà Triệu, Quang Trung and Thánh Gióng. A battle is not a foreign subject imposed on the style — the aftermath card can legitimately be composed as a print, title cartouche and all.

the Reckoning card  
*UNESCO listing: in need of  
urgent safeguarding*

### The army — where the biggest change is

05

**Mirror armour: one square plate on the chest**

The commonest armour type found in northern Việt Nam is a square or rectangular metal or wooden plate fastened over the chest. **This is the single highest-value stroke in the whole art plan.** The current `figure()` is body, nón and spear — generic. One light rectangle on the torso and the silhouette becomes specifically Đại Việt, at a cost of one fill per figure.

ink/devices.ts → figure()  
*+1 fill, ~21 per host*

06

**The mark on the soldier**

Trần troops bore *Sát Thát* inked on them through the Mongol wars; the Thánh Dực guard of the royal carriage bore *Thiên Tử Quân* on their foreheads; Lý-era tattooing is described as resembling the patterns on bronze drums. So: a veteran or guard host carries a mark. Drawn as a *drum pattern*, never as written characters — the game’s own seal rule already forbids a Hán glyph standing in for information, and the drum reading is both older and more legible.

elite tier marker  
ink/devices.ts sealMotif  
*ties to the Đông Sơn chrome*

07

**Light kit, mobility over protection**

Armour suited to a humid climate and hit-and-run war; spears the primary arm with bows alongside; buffalo hide a standing material (a Lê ordinance has magistrates collecting a hundred hides apiece). Heavy infantry should therefore read as *more plate and a shield* — not as knights.

the three arms are right  
spearmen / archers / heavy

08

**The shield: black lacquer, silver inlay**

A *cái khiên* of wood with a rattan-bound edge, lacquered black and inset with silver foil. Two fills — a dark disc and one pale dot — and the heavy arm has an unmistakable read at eight pixels.

reconstruction  
*concept art, not archaeology  
— stated as such by its author*

09

**Ngụ binh ư nông — the levy is a real institution**

Soldiers were quartered in agriculture: they took turns on guard and returned to their fields, unpaid, with court troops at the capital and local troops in the provinces — a system that could raise 8–10% of the population without stopping the harvest. **This is exactly what `raiseGarrisonLevy` already models.** So a levy host should be drawn as farmers with spears — nón, no chest plate, one or two still carrying farm tools — and “returned to the walls” in the aftermath becomes *“went back to the fields”*, which is historically literal rather than a flourish.

raiseGarrisonLevy()  
army.isLevy → figure variant  
*i18n: one string change*

10

**Elephants, boats, and the scale of a host**

The royal army fielded infantry, light cavalry, an elephant corps and a navy of *mông đồng* boats and junks; siege trains of catapults and trebuchets; fire lances from the 14th century, hand cannon from 1390, muskets from 1516. Recorded field strengths run 30,000 (967) to 250,000 (1471) — which places the game’s 300–4,000-man hosts firmly as provincial levies and field detachments, and confirms `MEN_PER_MARK = 55` is a sane figure-to-man ratio.

elephant marker: Great Invasion  
boats: water terrain  
firearms: late-era hosts

### The standard — a precise specification the game does not yet have

11

**Cờ ngũ sắc**

Five concentric squares — red, green, yellow, white and black (or blue) — with the outermost edge cut into three ragged points. It encodes *ngũ hành*, the five elements, and it is the flag that actually flies at village rites and festivals. The realm’s standard is currently a plain triangle; this is a drawable, documented, unmistakably Vietnamese replacement, and its five colours *are* the five pigments. Rivals fly it through `mutePigment`, so the scarcity law on sỏi son survives intact.

playerFlag.ts  
createPlayerLandFlag()  
the host standard, the seat,  
the aftermath cartouche

### The land and the water

12

**The đình has no walls**

A communal house is a long, high roof on stilts with soaring curved eaves (*đầu đao*), four curved corners and heavy curved tiles — and, unlike a pagoda, it has neither doors nor walls: it opens directly onto the outside. Đình Bảng is the exemplar, and it stands in Bắc Ninh, the same province as Đông Hồ village. Audit `props.dinh()` against this: an enclosed đình is the wrong silhouette.

ink/props.ts → dinh()  
ink/settlements.ts → village()

13

**The village edge is bamboo, not a palisade**

*Lũy tre làng* — the bamboo hedge — is the boundary of a delta village. Mockup 05 above drew a wooden palisade in front of the village, and that is my error, not the game’s: `bamboo()` already exists in `props.ts` and is both cheaper and correct.

correction  
ink/props.ts → bamboo()

14

**Dykes, canals, and paddies that change colour**

The delta is an engineered landscape of dykes and canals, and its paddies run emerald to gold across the season. The game already re-inks scenery per season in ~170 ms; the paddy strips on the battlefield should ride that same switch rather than being painted once.

setFoliageSeason()  
paddyLattice() + drawFieldPlot()

15

**Bạch Đằng: iron-tipped stakes in the riverbed**

Three times — 938 under Ngô Quyền, 981, and 1288 under Trần Hưng Đạo — a fleet was destroyed on stakes planted in the bed of the Bạch Đằng and timed against a falling tide. The stakes were excavated at Yên Giang in 1959; this is real archaeology, not legend. **It supplies a whole second battlefield:** when the contested province is water, the killing ground is a tidal channel, the enemy arrives by boat, and the stakes are already in the water. See mockup 08.

terrain === water  
a second baked ground  
*the set-piece of the mode*

#### One correction to raise, not to make unilaterally

`palette.ts` assigns `giDong` — gỉ đồng, verdigris — to green, captioned “every growing thing”. Every sourced account of the Đông Hồ palette I found puts **verdigris on the blue side and cajuput leaves (lá tràm) on the green**. Vietnamese *xanh* spans blue and green and the sources are not perfectly consistent with each other, so this is a question for you rather than a defect: if it stands, growing things want a `tram` pigment of their own and `giDong` shifts toward `cham`. Flagging it rather than changing it, because you will know which reading your artists use.

Mockup 07

### The host, redrawn from the record

The army is where the user asked for the most improvement and where the sources give the most to work with. Six additions, none costing more than a fill or two per figure.

**The figure and the standard**colour block offset from the outline, as the press leaves it

1
2
3
4
5
6

**The arms, the levy, and what comes with a great host**drawn at true block scale

levy · no plate
spearmen
archers
heavy · khiên

voi chiến — a Great Invasion only
mông đồng — water provinces

**Mockup 07 — the host plate**Everything above is one or two extra fills per figure. The colour block in the top panel is drawn deliberately out of register with the outline, which is how the press actually leaves it.

**1**

*Nón* — a wide, shallow field hat rather than a helmet. Already drawn, and already the right silhouette.

**2**

*Hộ tâm kính*, the mirror plate — one square on the chest. The single cheapest change that makes the figure read as Đại Việt.

**3**

*Khiên* — wood with a rattan-bound edge, lacquered black with a silver-foil inlay. A dark disc and one pale dot.

**4**

The inked mark, carried by veteran and guard hosts. A drum band, not a written character.

**5**

*Cờ ngũ sắc* — five concentric squares and three ragged points at the fly. The realm’s standard, and the five colours are the five pigments.

**6**

The drum. It has a job beyond decoration — see the animation table: the beat clock becomes something you can hear and see struck.

Mockup 08

### The second battlefield: a tidal channel, and the stakes already in the water

When the contested province is water, the ground changes entirely. This is the most Vietnamese battle picture there is, it is documented by excavation rather than legend, and it reuses the same host blocks and the same readouts — only the baked ground and the enemy’s approach differ.

the tide is falling

−14
−118

**Mockup 08 — the river**Same host blocks, same readouts, a different baked ground. Our line holds the near bank behind its bamboo hedge; their fleet comes downstream onto stakes that were planted before the fight began. The tide line falling across the channel is the round clock, said in the language of the place.

### What moves, and when

Animation is where the fight stops being a diagram. Most of these already have a hook; the beat buffer from Round 1 is what gives them all a clock to run on.

| Moment | What moves | Hook |
| --- | --- | --- |
| every beat | ranks march in place, slightly out of phase per rank | `marchInPlace()` exists |
| every beat | the drum is struck; the standard dips; a ring pulses on the pip track | new — one tween, and the clock becomes audible |
| approach | arrows arc between the lines and land; both blocks close | new tween on the volley delta |
| contact | front ranks interpenetrate, shove, and a 90 ms hit-stop | `tweens.chain` exists |
| on loss | the block is rebuilt one mark thinner; a floater rises and fades | `hostShapeAt(currentMen)` |
| wavering | a host’s rank graphics tremble; its morale ring reddens | new — cheap, and the clearest warning on screen |
| break | figures turn and run off their own edge over two beats; short shake; bodies stay | `faceTravel()` exists |
| relief | a column walks in from the map edge rather than appearing | `livingProp()` exists |
| ambient | a heron crosses, banner cloth ripples, dust drifts off the seam | `heron()`, `livingSprite()` exists |
| seasonal | paddy strips turn emerald to gold with the calendar | `setFoliageSeason()` exists |

Sources for this section — Đông Hồ technique, pigments and subjects: [Wikipedia](https://en.wikipedia.org/wiki/%C4%90%C3%B4ng_H%E1%BB%93_painting), [Vinpearl](https://vinpearl.com/en/dong-ho-painting-a-traditional-art-form-to-be-treasured), [UNESCO ICH](https://ich.unesco.org/en/USL/craft-of-making-ong-h-folk-woodblock-printings-01737), [Ancient Origins](https://www.ancient-origins.net/artifacts-other-artifacts/vietnamese-art-0018703). Armour and army: [Vietnamese armour](https://en.wikipedia.org/wiki/Vietnamese_armour), [Royal Vietnamese army](https://en.wikipedia.org/wiki/Royal_Vietnamese_army), and [Dragon’s Armory on Trần cavalry](http://dragonsarmory.blogspot.com/2018/02/ai-viet-cavalry-tran-dynasty.html) — the last is explicitly a reconstruction and is flagged as such above. Tattoos and service: [on military tattooing](https://www.maxduongtattoo.com/dragon-tattoos-in-vietnam-exploring-tradition-culture-and-identity), [Military Service Regime in Đại Việt Monarchies, Vietnam Social Sciences Review](https://vjol.info.vn/VSS/en/article/download/74768/63543/), [ngụ binh ư nông](https://vi.wikipedia.org/wiki/Ng%E1%BB%A5_binh_%C6%B0_n%C3%B4ng). The standard: [Vietnamese five-colour flags](https://en.wikipedia.org/wiki/Vietnamese_five-color_flags). Architecture: [Đình Bảng communal house](https://vinpearl.com/en/dinh-bang-communal-house-bac-ninh), [Đình làng](https://www.vietnammonpaysnatal.fr/communal-house-part-2/). The river: [Bạch Đằng 1288](https://en.wikipedia.org/wiki/Battle_of_B%E1%BA%A1ch_%C4%90%E1%BA%B1ng_(1288)), [Institute of Nautical Archaeology, Bạch Đằng project](https://nauticalarch.org/projects/battle-of-bach-dang-research-project/).

The costume timeline

## What survives at twenty-four pixels

Đạt H. Võ’s *Timeline of Vietnamese army costume* identifies eight periods across roughly a thousand years, and it does so **with no text on the figures at all**. That is the thing worth stealing — not the drawing style, the *information architecture*. Work out which channels are doing the identifying, and you have a soldier system rather than a soldier drawing.

#### Headwear does 70% of the work

Cover every figure below the neck and the periods are still separable: Lý’s domed helm with its long swept crest, Trần’s crested helm with cheek flaps, Later-Lê’s red brimmed dome, Trịnh’s tall dark felt hat, the Nguyễn lords’ bare hair-bun, Tây Sơn’s turban, and the Nguyễn dynasty’s pointed *nón dấu*. Nothing else in the reference discriminates as hard.

#### Torso does the rank

Within a period the officer, the regular and the levy differ by what is on the chest: a plain wrap, then a plate or a round disc, then layered lamellar with shoulder pieces. The Trần officer’s big round chest disc is exactly the mirror armour the written sources describe — the reference and the archaeology agree.

#### One accent colour per period

Lý reads olive-and-yellow, Trần green-gold, Later-Lê red-and-green, Nguyễn lords teal, Tây Sơn orange with a yellow chest roundel, Nguyễn dynasty gold. Each figure carries one dominant hue and everything else is neutral. That is a palette discipline, and it is the same one the game already enforces.

#### The style question, answered honestly

The reference is chibi vector: roughly three heads tall, flat fills, one uniform dark outline, no gradients. The game is a Đông Hồ woodblock. Those look like different worlds — but they are the **same information architecture**, and the sources say so rather than my eye. Đông Hồ’s own most famous figure print, *Vinh Hoa* (the boy holding a rooster, one of the four-virtue series with *Phú Quý*, *Nhân Nghĩa* and *Lễ Trí*), is described in its own tradition as a *chubby* child, the composition “simplified with no surrounding landscape”, the colours “simple and bright, with strong colour blocks boldly contrasted”.

Big head, short body, no background, flat bold blocks, hard outline. That *is* the chibi grammar, arrived at four centuries earlier. So the reference’s readability can be adopted without leaving the game’s style at all. Two things change on the way in: the palette collapses from full RGB to the five pigments, and the line becomes `inkPath`’s three-pass stroke with the colour block deliberately out of register.

### The figure, rebuilt as five slots

`figure()` today is four marks — body, nón, head, spear — and its own comment defends the economy, correctly: it runs up to `HOST_MARK_CAP` times per host. The proposal keeps that discipline and spends the budget where the reference proves it pays.

slot 1

**Crown — the era**

The single most identifying mark, and therefore the one that never drops at any zoom. Topknot, domed helm, crested helm, brimmed dome, hair-bun, pointed nón.

1–3 strokes  
*keyed on era*

slot 2

**Chest — the tier**

Nothing, a square mirror plate, or a round disc with shoulder pieces. This is where levy, trained and royal guard become visible without a label.

0–3 strokes  
*keyed on army.elite*

slot 3

**Sash — the realm**

One diagonal stroke of colour. The player’s is sỏi son; every rival’s is the same stroke run through `mutePigment`. This is the only place the scarcity law touches a soldier.

1 stroke  
*keyed on kingdom*

slot 4

**Arm — the weapon**

Spear held upright, bow drawn, musket shouldered, đại đao raised. Silhouette only; the angle reads at eight pixels where a shape does not.

1–2 strokes  
*spearmen / archers / heavy*

slot 5

**Ground — the standing**

Bare feet, sandals, boots. Small, but it is what makes the levy read as farmers pulled off the fields — which, per *ngụ binh ư nông*, is exactly what they are.

0–2 strokes  
*keyed on tier*

### The ladder, and why it is a reward

Both axes already exist in the game and neither reaches the drawing. `army.elite` runs **levy → trained → royal guard** (`WarSystem.MAX_ELITE_TIER`). The Mandate track runs four eras. `settlements.ts` already declares `Era = 'ly' | 'tran' | 'le' | 'nguyen'` and `citadel()` already takes one — but `DongHoMapItemRenderer.ts:275` passes the literal `'le'`, so the citadel has been stuck in the fifteenth century since the day it was written.

**Wire one era value through and two things advance at once.** Your seat rebuilds itself as the dynasty climbs, and your host re-equips: a run opens with barefoot levies in topknots carrying billhooks and ends with royal guards in pointed nón and gold coats. That is a visible payoff for a progression track that currently pays only in numbers — and it costs one parameter, because both the figure table and the citadel already want it.

| Game era | Dynasty | Crown | Chest | Accent | From the reference |
| --- | --- | --- | --- | --- | --- |
| founding | Lý 1010–1225 | topknot; domed helm with long swept crest | plain wrap; square plate | gỉ đồng | commoners bare-headed and barefoot, big rectangular shield slung on the back |
| rivalry | Trần 1225–1400 | crested helm, cheek flaps | **round chest disc**, shoulder pieces | hoè | the most armoured period in the whole timeline — and the disc matches the written record |
| empires | Later-Lê 1427–1527 | red brimmed dome | patterned robe-armour, longer skirt | sỏi son / nâu | firearms appear; the helm gains a brim |
| mandate | Nguyễn 1545–1802 | hair-bun; pointed **nón dấu** | long coat, plate beneath | hoè + son sash | teal robes and red sashes for the lords; gold coat and pointed hat for the dynasty |

**Out of scope, deliberately.** The reference runs to 2020. The game’s timeline ends with the Nguyễn court, so the Trịnh and Tây Sơn periods fold into `mandate` as variant crowns, and everything from the French colonial kepi onward is simply not drawn. Better to render four eras convincingly than eight thinly.

**Twelve figures from fourteen shapes**era × tier, at plate scale

LEVYTRAINEDROYAL GUARD

FoundingRivalryEmpiresMandate

LýTrầnLater-LêNguyễn

**The same figure at the three sizes it has to survive**and a block of eight at battlefield scale

90 px · plate24 px · field6 px · mapa block, at field scale

**Mockup 09 — the wardrobe**Left column is the levy: no hat, no plate, bare feet, a billhook. Right column is the royal guard: crest or crowned nón, plate with shoulder pieces, the inked mark, boots, đại đao. The chest plate and the crown alone carry the whole ladder — and at 6 px only the crown survives, which is why it is slot one.

### What the reference does *not* get to bring

#### Its colours

Purple, teal and pink do not exist in a Đông Hồ palette. Every accent maps onto gỉ đồng, hoè, nâu or chàm — and the Trịnh soldier’s red coat cannot be red at all for a rival, because sỏi son belongs to the player. That is a real loss and it is worth paying: the map stops having a focal point the moment a second thing earns that red.

#### Its faces

The reference draws eyes and expressions. At 24 px a face is mud, and `figure()`’s own comment already limits it to five marks for good reason. The head stays a circle and the personality lives in the crown and the stance.

#### Its later half

Kepis, pith helmets and camouflage belong to a Việt Nam this game never reaches. Four eras drawn convincingly beats eight drawn thinly — and the four chosen are the four the Mandate track already advances through.

Rock, paper, scissors

## You already have it. The fight screen is the one place it does not apply

`compositionMatchup()` in `WarSystem.ts` is a real, documented rock-paper-scissors: *spearmen rout heavy infantry, heavy infantry crush archers, archers shred spearmen*, returning a ±0.4 multiplier from how one force’s composition meets another’s.

It is a private function with exactly **one** call site — `attackLand`, the classic odds roll. `fightRound` does not use it. `resolveInvaderBattle` does not use it. So in Dragon Ascent, the mode where you actually muster armies and watch them fight, the counters never fire. The single screen that shows the player both compositions is the screen that ignores what they mean.

#### Wiring it in is a one-word change and a multiplication

| Step | Change |
| --- | --- |
| 1 | `export function compositionMatchup(...)` — it is already written, already commented, already correct |
| 2 | In `fightRound`, fold it into the power sums: `ourPower × matchup(ours, theirs)`, and the mirror for theirs |
| 3 | Print it. The Order of Battle already draws both composition bars — add the verdict line: their bows shred our spears |

This is what finally makes the muster screen matter. Choosing a spear-heavy host is currently a number that vanishes into `armyPower`; with the matchup live in the watched fight it becomes a decision the player can see paying off or failing, against an enemy composition they were shown before committing.

### The second triangle — and this one is the real invention

Composition RPS is slow: you choose it at muster and live with it. The live decision is the posture, and two options can never be a proper triangle. **Three can.** Split the posture into a ring where each stance beats one and loses to one:

closes before
the volleys tell
a wall that stands still is shot to pieces
braced spears
break a charge

Charge
CHARGE\_TRADE
CHARGE\_COVER

Loose
VOLLEY\_BITE
approach beats

Brace
HOLD\_TRADE
terrainEdge

Every node runs on a constant that already exists — the ring is a *re-labelling and one new stance*, not a new combat model. `Loose` is the archery phase promoted from an opening into a stance you can hold: keep the range open and shoot instead of closing.

**Why this is structurally better than re-tuning press and hold.** Round 2 proposed splitting the trade constants so the two orders differ in kind. That works, but it is a balance patch — it holds only as long as the numbers hold, and one careless edit later a dominant option is back. **A three-cycle cannot have a dominant option by construction.** The tuning still matters, but it is now tuning how much the counter is worth, not whether a choice exists at all.

#### The trap in rock-paper-scissors, and how this avoids it

Naive RPS against a reactive opponent degenerates into a coin flip: you guess, they guess, skill goes to zero and the fight becomes 33% luck. Three things keep this a read rather than a guess.

- **They telegraph.** `enemyPosture` already resolves their next stance from `kingdom.personality` and the morale gap — deterministically. Printing it turns the ring into Into the Breach, not into a coin toss.
- **Personality is learnable.** Six doctrines, stable across a run: an `aggressive` power charges unless badly beaten, a `defensive` one shoots until it is ahead. A player who has fought the northern lords twice knows what they do.
- **The counter is a lever, not a verdict.** Proposed ×1.35 dealt / ×0.80 taken — enough that being right is clearly worth it, not so much that being wrong ends the fight. Numbers, not the structure, get bisected in the lab.

### One triangle, three timescales

And this is the part that makes it a system rather than three features: **the same triangle** is being played at every scale of the run, so learning it once pays everywhere.

slow

**Composition, at muster**

Spears, bows, heavy. Chosen when you raise a host, lived with for its whole life. You are betting on what you will meet.

compositionMatchup()  
*±0.4, already written*

mid

**The plan, per fight**

Shield Wall, Arrow Storm, Hammer Charge — the same three stances chosen as an opening, against a stated enemy intent, while the world is paused.

Order of Battle  
*sets the opening node*

fast

**The posture, per beat**

Brace, Loose, Charge in the dock. They adapt, you re-read, they adapt again — the conversation that makes an auto-battler worth watching.

setBattlePosture()  
enemyPosture() telegraph

Vân Thành Đông · round 13 of 22Liên Minh Phương Đông · aggressive

Our host

842

Theirs

611

They will charge next beat

An aggressive doctrine comes on hard while it is not badly beaten. Brace breaks a charge.

Our stance

COUNTERS🛡 Bracebreaks a charge  
slow · efficient

🏹 Looseshoot, stay open  
current

COUNTERED⚔ Chargecloses fast  
they brace

Arms

ours · spear-heavy

✕

theirs · bow-heavy

⚠ Their bows shred our spears — ×0.86 to us

✓ Bracing against their charge — ×1.35 dealt

NOW⚑ Reserve114 fresh men

♛ Rally+18 heart

🎯 Vanguardfocused

⚑exit

**Mockup 10 — the ring in the dock**Three stances instead of two, their next move stated above, and the two matchup verdicts printed as plain sentences: one composition line you are stuck with, one posture line you can change this beat. This dock replaces the two-stance version shown in mockups 03 and 05.

Quick time events

## Not as reflex tests. Yes as decisions with a deadline

This is worth separating carefully, because the two things usually called “QTE” are opposites in a game like this one.

No

#### A reflex prompt — tap in 400 ms or lose the bonus

- It tests attention, not judgement. The mode’s whole language is *standing orders*, and the code comments already record that a tap-driven battle “felt like filling in a form”.
- It is hostile to the mode’s own affordance. Dragon Ascent explicitly offers to fight without you, per host and per run. Punishing a player for looking away contradicts a feature that is already shipped.
- The beat clock is 560 ms. A window inside that is either free or unfair — there is no interesting middle.
- It gates strategy behind an unrelated skill, and it is an accessibility wall for anyone playing one-handed on a bus, which is who this game is for.

Yes

#### A Moment — two or three real options, ~1.7 s, and a default

- It tests judgement under pressure, which is the thing a battle is actually about.
- **The timeout is not a punishment — it is delegation.** Let it lapse and your general answers, using the doctrine they would have used all along. Missing a Moment costs you the *edge*, never the fight.
- It fires on triggers the simulation already produces, so it needs no new events — only a reader.
- It is the answer to “why be present?”, which is the one question the current screen cannot answer.

### What raises a Moment

Four triggers, all already computed inside `fightRound`. Capped at **three per fight** and never inside a paused phase — more than that and it becomes whack-a-mole, which is the failure mode of every game that discovered this mechanic and then over-used it.

01

**A host wavers**

Any host crosses ~40 morale, ours or theirs. “Their vanguard is breaking — throw everything at it, or hold the line together?”

host.morale vs BATTLE\_ROUT\_MORALE  
*already checked every beat*

02

**The charge goes in**

They switch to press. “Their charge is coming — brace for it, or meet it head on?” The ring, asked as a question, at the moment it matters most.

enemyPosture() flips to 'press'  
*already computed each beat*

03

**Relief arrives**

A host marches onto the field mid-fight. “Trần Khánh Dư’s column is here — send them straight in, or let them form up first?”

enrolArrivals() raises ourHostCount  
*already logged*

04

**The pips run short**

Four rounds left and the fight is close. “Night is coming. Spend the reserve to force it, or pull back with what we have?”

round vs totalRounds  
*the clock, made into a question*

The general

### Leaving the fight to your hero — made a real choice, not an escape hatch

Delegation is already wired at three levels, and wired well: `army.autoResolve` per host (“Who fights its battles — I take the field / Its general”), `ascent.autoResolveBattles` run-wide from Settings, and the mid-fight *“leave this one to my generals”*. The per-host flag is read in two places — `InvasionSystem` suppresses the defensive engagement and `WarSystem.stageWatchedAssault` suppresses the offensive one — so a host whose general fights simply never raises the screen.

What is missing is that **delegating is currently invisible and undifferentiated**. A 90-martial hero and a 30-martial one differ only by `armyPower`’s general term — about 15% — inside a threshold roll the player never sees. You are told a result and nothing else. So the setting reads as “turn the feature off” rather than “appoint someone I trust”.

#### One switch, two states, reversible from anywhere

This must not become a flow. No confirmation, no wizard, no separate screen — the existing control is already the right shape and only needs to be honoured everywhere:

#### On the army page — the toggle that already exists

**I take the field** / **Mã Viện**. Two states, one tap, no confirm. It is `army.autoResolve`, already stored per host and already read in two places. Change it whenever you like; it applies to the next fight. That is the whole feature.

#### In the fight — one chip, both directions

A single control in the corner of the dock: **Hand to Mã Viện** while you are commanding, **Take the field** while he is. Tap it as often as you want, mid-beat, either way. Handing over does not end the fight — the battlefield keeps running and he takes the orders from there.

#### Everything else follows from the switch

A lapsed Moment is answered by whoever holds the field, at a quality scaled on `stats.martial`. Fights he handled arrive as one line in the wave dispatch. Nothing new to learn and nothing to undo — the toggle is the only surface.

The rule to hold to: **the player can change their mind at any moment and never pays for it.** Today “leave this one to my generals” calls `finishBattle` and ends the engagement on the spot — a one-way door. It should hand over the *rest* of the fight, so stepping back is not the same as skipping to the result.

Gate — battle-lab gains a `general` policy: the general’s doctrine at martial 30, 60 and 90. Target: delegation lands **8–15 points** below skilled play at martial 60, and within **5 points** at martial 90. If a great general is as good as playing, the screen has no reason to exist; if a great general is hopeless, the appointment system does not.

Vân Thành Đông · round 16 of 22⏸ the field holds

Our host

781

Theirs

402

wavering — 34 heart

⚑ The moment

Their vanguard is breaking.

⚔ Everything on the vanguard

Break it now and the flankers stand alone — if our line holds while we swing.

🛡 Hold the line together

Let it go. Fewer of ours fall, and the pips are still on our side.

Mã Viện decides in **1.4s** — martial 78, he answers well

**Mockup 11 — the Moment**Not a reflex prompt: two real options, about 1.7 seconds, and a named fallback. Letting it lapse is not a failure — it is the delegation the mode already offers, taken one decision at a time.

Year 8 · SpringWave 9 · 3 fights

Power

3,402

Threat

980

Second Army

Mã Viện · martial 78 · 604 men

Who fights its battles

I take the field

Mã Viện

Martial 78 — he reads the counter well and rarely mistimes the reserve. Change this whenever you like.

Last wave

**Hải Động** · he braced, and held**−212**

And in the fight itself

Mã Viện has the field

He is answering. Tap to take it back.

Take over

**Mockup 12 — delegation, kept to one switch**Two states on the army page, one chip in the fight that flips it either way mid-beat, and one line of report per wave. No confirmation, no separate flow, and never a decision you cannot walk back.

The invention

## Three new mechanics — and an honest account of what is merely repair

Most of this plan is not invention. The beat buffer, the log ribbon, the aftermath card and the selection gate are all *restoration*: taking things the simulation already computes and putting them on the screen. Worth doing, but nobody should call it design.

Five things in this plan are genuinely new. Two are set out above — [the posture triangle](#triangle), which makes a dominant order structurally impossible rather than merely re-tuned, and [the Moment](#moments), which answers “why be present?” without a reflex test. The other three follow.

All five share a property that makes them cheap: each is built from a quantity the code already tracks and currently hides. That is why this is a two-week plan and not a rewrite.

INVENTION 01

### The Nerve

a rising reward against a cliff you can see coming

Already in the code

Both one-shots are already scaled by how far the line has sagged, and the reserve is already lost outright if the host it belongs to breaks first. The gamble is fully implemented.

sag = (startMorale − morale) / startMorale  
reserve → +CHARGE\_MORALE × (1 + sag×2)  
rally   → +rallyPower × (1 + sag×1.5)  
rout at morale ≤ 32 — reserve dies with the host

What is new

The ladder becomes visible and live. The reserve button carries its *current* worth, recomputed every beat — `114 men · +9 heart` at full strength, climbing to `114 men · +26 heart` as the line buckles. The morale bar gains a rout line at 32, so the cliff has a position on screen. NOW lights in the band where the multiplier is near its peak but the line is not yet close enough to break.

Nothing about the simulation changes. The player is simply allowed to see the curve they have always been gambling against.

Why it is fun

This is the press-your-luck primitive — hitting on sixteen, one more hand in Balatro, one more room before you cash out. Its whole engine is a reward that rises on a visible counter while a loss condition approaches on another. Neither number is hidden; the tension is entirely in *when you decide*.

Every fight now contains at least one moment of “one more beat… no — now.” That moment is a story the player tells themselves afterwards, which is the only kind of story a systems game can generate for free.

INVENTION 02

### The clock as an opponent

the round limit stops being a cutoff and becomes the thing you race

Already in the code

`totalRounds` is computed per fight from the size of both armies — 14 to 22 rounds — and an engagement that reaches it resolves as `spent`, scored on which side kept more of what it brought. Nothing on screen refers to it. Players do not know the number exists.

What is new

A pip track across the top of the field, one pip per round, and a posture pair that races it in opposite directions. Press spends men to break them before the pips run out. Hold trades efficiently and wins on held-share when they do.

That reframing is what makes the trade constants worth splitting at all: with `hold` at a 1.34 exchange ratio against `press` at 1.08, the posture toggle becomes a live arithmetic re-read every few beats — *at this rate of attrition, do I get there first?*

Why it is fun

A deadline gives a fight a middle. Right now the engagement has an opening and an ending with an undifferentiated grind between, which is why it reads as a progress bar. A visible countdown converts grinding into *racing*, and racing has a felt shape: comfortable, then tight, then desperate.

It also makes the losing fight interesting, which the current screen completely fails at. Nine pips left and a wavering enemy column is a live question. Nine pips left and no counter is just waiting.

INVENTION 03

### The Order of Battle

a read, not a gamble — the enemy tells you what they mean to do

Already in the code

The invasion record carries `plan: spearhead | flanker | raider`. `enemyPosture` derives the opening stance from `kingdom.personality`. Both hosts carry a three-way composition. `terrainEdge` is computed and stored. Every input to a proper pre-battle read already exists and none of it is printed.

What is new

A paused commitment before the first beat: the enemy’s intent stated in a sentence, both compositions drawn as bars, the ground’s edge named — then three plans that counter differently. Shield Wall closes under cover and grinds. Arrow Storm extends the approach and shoots. Hammer Charge skips to contact for morale at the cost of cover.

Each maps onto constants that already drive the approach phase, so the simulation gains one field and no new maths.

Why it is fun

Because the information is complete, being right is *insight* rather than luck. “They out-shoot us two to one, so Arrow Storm is a trap and Shield Wall is the answer” is a thought the player has, and then watches be correct. That is the entire appeal of Into the Breach compressed into one card.

It also gives the loss somewhere to land. A defeat after a telegraphed enemy and a chosen plan is a mistake you can name — and a mistake you can name is the reason you start the next run.

#### And here is what is not invention, stated plainly

The beat buffer is an engineering fix for a presentation bug. The log ribbon renders strings that are already written and translated. The pip track, the rout line, the terrain badge, the composition bars and the aftermath card all display fields that already exist on `AscentBattle` and `battleHistory`. The selection gate is a bug fix — the capital’s unconditional pass was never a design decision, it was a patch for a screen that had stopped opening at all. Roughly **70% of the work here is making the existing simulation visible**, and that is the reason to be optimistic about it: the hard part, the fight itself, is already good.

The player’s experience

## Why this should make someone want the next fight

The battle is the receipt for the whole run. The cards you drafted, the general you appointed, the composition you mustered and the province you fortified only ever become visible here.

That is the strongest argument for spending effort on this screen and it is not an argument about the screen at all. Twenty minutes of economy and drafting currently cash out as a one-line toast. Every improvement below is really an improvement to the value of everything the player did beforehand.

### One fight, forty seconds, from the player’s side

A Great Invasion reaching Vân Thành Đông, at the odds the tuned gate would actually admit — 1,180 of ours against 1,340 of theirs, on ground that favours us.

paused

“Their spearhead means to storm the gate.” Two composition bars: they carry nearly twice our bows. The hills give us ×1.25.

Reads the two bars, rejects Arrow Storm, commits to Shield Wall.

Anticipation — *I have a read*

0:00–0:07

Arrows fall across the approach. Floaters over our columns: −12, −9, −14. Fewer than they should be — the shields are working.

Taps their vanguard to focus it.

Validation — *the plan is paying*

0:07–0:16

Contact. The clash mark lands, exchanges of 30 to 60 a beat. Our levy column drops to 41 heart with the rout line visible just beneath it.

Reads their next stance — *they will charge* — and moves from Loose to Brace to break it.

Dawning worry — *this is going to be close*

0:16–0:24

The levy sits at 37 against a rout line at 32. The reserve button has climbed from `+9 heart` to `+21 heart` and is flashing NOW. Every beat it is worth more. Every beat the column might break and take it with it.

Waits. Waits one more beat. Commits.

The Nerve — *the peak of the whole screen*

0:24–0:31

Fresh men steady the line. The ribbon reads “Their vanguard is wavering — 34 heart.” A Moment rises: *everything on the vanguard, or hold the line together?* Mã Viện will answer in 1.7 seconds.

Answers it themselves — everything on the vanguard.

The scent of blood

0:31–0:35

The vanguard turns and runs. A short shake, and the flankers follow it off the field two beats later.

Nothing. This part is the reward.

Catharsis

paused

1,180 → 872, with 138 wounded carried off the field. Their host: broken. Mã Viện to level 4. 240 gold. Ambition +1 — they will come harder.

Reads one line of chronicle naming the levy that held the bend in the road.

Pride, and attachment to a named general

Order of Battle
Approach
The Clash
The Break
Reckoning
FELT TENSION →

The Nerve

They break

Today — flat, and slightly downward: the longer it runs, the more certain it already was
Proposed — two peaks, a release, and a warm ending

### The five principles it is built on, and how each is checked

None of this is a matter of taste. Every claim below has a harness that can falsify it, which is the only reason to trust a design document about fun.

#### No dominant option

An option that is always correct is not a choice, it is a chore with extra steps. Press currently wins 60% of contested fights and hold wins 10% — the player is being asked to press a button that has one right answer, which is worse than no button.

Falsified by

battle-lab: gap between always-hold and always-charge ≤ 15 pts, and neither beats adaptive play.

#### Complete information before commitment

A win the player predicted feels like skill; a win they did not feels like weather. Telegraphing intent and composition costs nothing — every field exists — and converts the fight from a slot machine into a read.

Falsified by

probe: every opened fight carries a non-empty intent chip and both composition bars, on both roles.

#### A middle, not just an opening and an end

Continuity plus a deadline is what produces a middle. The beat buffer supplies the first — 28 to 45 visible beats instead of four jumps — and the pip track supplies the second.

Falsified by

battle-lab: longest gap between visible updates < 700 ms; posture changed at least 1.5 times per fight under adaptive play.

#### Rising reward against an approaching cliff

The Nerve. If players commit the reserve immediately, the ladder is not legible enough; if they never commit it, the cliff is too frightening. The distribution of *when* is the measurement that matters.

Falsified by

probe: reserve committed between 40% and 65% sag in the majority of fights, rather than clustered at contact or never spent.

#### Consequence with a name on it

Attachment comes from specificity. “Victory” is a state; “Mã Viện to level 4, and the levy of Vân Thành Đông held the bend in the road” is a memory. The aftermath card exists to convert the former into the latter.

Falsified by

every aftermath names a hero, a province and three numbers; one chronicle line is drawn per resolved battle.

#### Progress you can see on the field

The Mandate track currently pays in numbers. With the [era wardrobe](#wardrobe) it also pays in a picture: a run opens with barefoot levies in topknots carrying billhooks and ends with royal guards in crowned nón and gold coats, on ground whose citadel has rebuilt itself twice. Both axes — `era` and `army.elite` — already exist in state; neither reaches the drawing today.

Falsified by

a screenshot of the same host at era 1 and era 4 must be identifiable as the same run and obviously better equipped, with no label read.

### The one test that overrules the other five

The screen has a skip button — “leave it to my generals” — and a settings switch that turns it off for the whole run. That makes the design question brutally simple and completely honest: **is playing the fight strictly better than not playing it, and is it better by enough to be worth forty seconds?**

Today the answer is “yes, but only because pressing wins”, which is the same as no. The target is that skilled play beats every fixed policy by at least twelve points *and* lands a win rate between 40% and 60% — because a fight you always win is a fight you should also be allowed to skip. Fun, here, has a number, and the number is falsifiable.

If the tuned version cannot clear the skip-button test in the lab, the honest move is to cut the screen and spend the effort on the map — not to add more animation to a decision that is not there.

Tuning

## The constants to move

All of them live in `src/game/ascentConfig.ts`, by design. Proposed values are starting points for the lab, not final answers — every one gets bisected against `battle-lab`.

| Constant | Now | Propose | Why |
| --- | --- | --- | --- |
| BATTLE\_CHARGE\_TRADE | 1.20 / 1.10 | 1.35 / 1.25 | press = fast and expensive (ratio 1.08) |
| BATTLE\_HOLD\_TRADE | 0.85 / 0.78 | 0.78 / 0.58 | hold = slow and efficient (ratio 1.34) — the two finally differ in kind |
| BATTLE\_CHARGE\_COVER | 0.40 | 0.60 | an arrow-heavy enemy must punish a rush |
| BATTLE\_BEATS\_PER\_TICK | 6 | 6 unchanged | the buffer plays them out; the simulation stays deterministic |
| BATTLE\_TICK\_MS | 420 | 560 | becomes a real beat clock: 6 × 560 = 3.36 s inside a 3.5 s tick |
| BATTLE\_BASE / MAX\_ROUNDS | 14 / 22 | 16 / 26 | a longer second breath, now that beats are actually seen |
| WATCH\_ODDS\_BAND | 0.55 – 2.20 | 0.65 – 1.80 | tighter, and now applied to the capital too |
| capital exemption | always | at risk only | the single biggest defect — 34 of 46 fights, median odds 0.10 |
| ORDINARY\_WATCH\_WAVE\_GAP | 2 | 2 unchanged | the gate fix alone should land 4–6 fights per run |
| BATTLE\_WITHDRAW\_RECOVERY | 0.45 | hold | measure it honestly first — the current harness cannot see it |
| compositionMatchup | ±0.4, unused here | ±0.4, wired in | already written in `WarSystem`; export it and fold it into `fightRound`’s power sums |
| POSTURE\_COUNTER | — | 1.35 / 0.80 | new — dealt and taken when your stance beats theirs. The lever, not the verdict |
| MOMENT\_WINDOW\_MS | — | 1700 | new — three beats. Player setting for longer, or “pause instead” |
| MOMENTS\_PER\_FIGHT | — | 3 | new — above this it is whack-a-mole and the spectacle is lost |

Build order

## Seven changes, each shippable alone

Ordered so every step is measurable when it lands, and so the riskiest simulation change comes after the harness that can judge it.

1

#### Honest harnesses

Before anything is tuned: adopt the odds probe as `test_scripts/playtest/probe-fights.mjs`, and fix `battle-lab` to drive a real `finishBattle` so withdrawal recovery and outcome consequences are visible. Report wall-clock from beats delivered, not from a clock nothing reads.

test\_scripts/playtest/battle-lab.mjs · test\_scripts/playtest/probe-fights.mjs (new)

2

#### The beat buffer and the log ribbon

Round 1. `fightRound` pushes a per-beat snapshot; the screen drains it at 560 ms. Log ribbon, pip track, damage floaters, orders moved into a fixed dock and the field given the room. Purely presentational — no balance moves yet, so the round-1 gate measures pacing in isolation.

BattleSystem.ts · ConquestUIScene.ts · ascentConfig.ts · i18n/catalogs/ascent.ts

3

#### The battlefield and the host the priority

The scene, in paint order: baked still layers (ridges, treeline, both settlements, bamboo hedge, paddy, terrain scatter from the province’s real type), then live host blocks rebuilt on mark-count change, the accumulating dead, dust over the seam, interpenetration and hit-stop at contact, and a rout that turns and leaves.

Then the host itself, from [the sources](#sources) and [the costume timeline](#wardrobe): `figure()` rebuilt as five slots — crown, chest, sash, arm, ground — keyed on `era`, `army.elite` and the unit type, so the host re-equips as the dynasty climbs. Plus the lacquered *khiên* on the heavy arm, the *cờ ngũ sắc* replacing the plain triangle standard, the drum on the beat, and elephants and boats where they belong.

Two one-line unlocks sit inside this: recomputing `hostShapeAt` so the ranks thin, and threading a real era into `citadel()` — `DongHoMapItemRenderer.ts:275` passes the literal `'le'`, so the seat has been stuck in the fifteenth century since it was written. The same value drives both the buildings and the wardrobe.

ConquestUIScene.ts · ink/devices.ts · ink/settlements.ts · ink/props.ts · playerFlag.ts · DongHoMapItemRenderer.ts · ink/sprites.ts

4

#### The selection gate

Round 3’s first half, pulled forward because every later measurement depends on fighting real fights. Capital loses its exemption; band tightened; multi-column engagements preferred. Re-run the probe — this alone should move the median from 0.12 toward 1.0.

BattleSystem.ts · worthWatching · WaveDirector.ts

5

#### The triangle

Round 2. `compositionMatchup` exported and folded into `fightRound`; the posture split three ways into Brace / Loose / Charge with the counter multiplier; the enemy’s next stance telegraphed from `enemyPosture`; trade constants retuned as the counter’s weight; NOW markers on the one-shots; and the Order of Battle pre-fight setting the opening stance. Bisected against the lab until no fixed policy beats adaptive play.

ascentConfig.ts · BattleSystem.ts · WarSystem.ts · ConquestUIScene.ts · ConquestScene.ts · types.ts · i18n

6

#### The Moment, and the general’s fight

Four triggers read off state `fightRound` already computes, a 1.7 s window capped at three per fight, and a lapse that hands the decision to the host’s general. Then the delegation work: the general answers Moments by doctrine scaled on `stats.martial`, mid-fight hand-off keeps the fight running instead of ending it, and every delegated engagement files a per-wave dispatch. Needs the `general` policy added to the lab first.

BattleSystem.ts · armyOrders.ts · InvasionSystem.ts · ConquestUIScene.ts · battle-lab.mjs · i18n

7

#### The reckoning, and the juice

Round 3’s second half. Aftermath card from `battleHistory`, per-wave dispatch for the fights the generals fought alone, then the last of the polish — the shake when a line breaks, the beat that announces relief, and the field settling after. Last, on purpose — `/funscore` and `/playtest` before and after.

ConquestUIScene.ts · InvasionSystem.ts · animations.ts · i18n

Where this could go wrong

## Four things to watch

#### Fewer fights, less mode

Tightening the gate could drop watched fights below four a run and make the showpiece vanish again — the exact failure that produced the current capital exemption. The per-wave dispatch is the hedge: hidden fights still land as content.

#### The buffer drifting from the simulation

A replay queue can disagree with the truth if a beat is dropped or an order lands mid-drain. Rule: the last beat in every drain always snaps to real state, exactly as `slideMarkers` already does with its tween chain.

#### Harder fights, harder run

Fights that are genuinely in doubt are fights sometimes lost. Run length and defeat rate must be re-measured — `verify-ascent` and `verify-modes-regression` both fingerprint this.

#### Moments interrupting the spectacle

The battlefield only just became worth watching; a card sliding over it three times could undo that. Keep the cap at three, never raise one in the first four beats, and let the field stay visible behind the scrim — the Moment is a question about what is on screen, not a replacement for it.

#### The ring collapsing into a guess

If the telegraph is ever wrong, or the enemy switches after it is shown, rock-paper-scissors becomes a coin flip and skill drops to a third. The stated stance must be the stance they actually take that beat — resolve `enemyPosture` once, display it, then use the same value. Never re-roll it after the player has answered.

#### A dock that does not fit

`GAME_HEIGHT` is derived from the aspect ratio and clamps as low as 620. A 320 px field plus a fixed dock must be checked on an iPhone SE — `verify-header-fit` and `verify-scroll` exist because this has broken before.

Measurements taken 19 Aug 2026 against the live scenes at 390×844: battle-lab.mjs 200 · diag-ascent-battles.mjs 20260812 90 · probe-fights.mjs 160 6. No game code was changed to produce this plan.

Research sources — [Into the Breach GDC postmortem](https://ubm-twvideo01.s3.amazonaws.com/o1/vault/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf) · [Mechabellum, PC Gamer](https://www.pcgamer.com/games/strategy/mechabellum-is-a-conversation-you-should-be-having/) · [Bad North, TheSixthAxis](https://www.thesixthaxis.com/2018/04/25/getting-to-grips-with-bad-norths-take-on-real-time-strategy/) · [Morale and cohesion, ACOUP](https://acoup.blog/2022/07/01/collections-total-generalship-commanding-pre-modern-armies-part-iiic-morale-and-cohesion/) · [The juice problem, Wayline](https://www.wayline.io/blog/the-juice-problem-how-exaggerated-feedback-is-harming-game-design)