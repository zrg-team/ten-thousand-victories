> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Five Shapes, Two Dials

Five Shapes, Two Dials

Trận đồ · Fight screen, second pass · Doc 14

# Five Shapes, Two Dials

The fight keeps its QTE and loses its cursor. What replaces tap-a-column-then-order is a shape you hold and a heat you set — against an enemy who is changing both, in front of you, in time you can see.

Vạn Thắng
Companion to Doc 12 · Doc 13
Gameplay brainstorm — not an implementation

**The telegraph is the field**
plan view · ours ● theirs ◆ · **not how the game shows it — see “As built”**

You don’t read a bar. You watch their horse block walk to the front.

Not as built
This page was written before the constraint that the revamp change **logic and UI only**, and
re-arranging the blocks is drawing code. In the game the telegraph is **named on the formation
strip and in the log ribbon** — họ giữ Chông, or
địch chuyển Xung · 2 — and the chip rims say which shapes answer it.
The field below is still the truest picture of what a formation *is*; it is simply not
yet how the game delivers the read. See **As built** at the foot of the page.

Doc 12 gave every army four blocks — **screen, line, bows, horse** — that stand apart, paint back to front, and empty in a fixed order as men fall. That was drawing. This is what the drawing is *for*: the arrangement of those four blocks is now the entire rock-paper-scissors of a battle, and because the blocks are physically drawn where they stand, a change of formation is something you see happen rather than something a label announces.

What leaves

## Three controls come off the dock

Tap a column, then order

A second cursor on a screen designed for one thumb. Worse, it asked the player to *aim* in a game whose whole language is standing orders — and focus fire was very nearly always correct, which makes it a tax rather than a choice. **`focusHostId` goes; so does the Focus/Spread button.**

The Reserve button

Not deleted — **moved into the Moment deck**. Committing the camp guard becomes a question with a deadline instead of a button that is right eventually, which is the difference between a decision and a chore.

The Rally button

Same move, same reason. It becomes **the general’s card**, drawn when the line sags — which is the only moment it was ever worth pressing anyway.

The dock goes from a three-way ring plus five buttons to **two dials and two exits**. Everything removed still exists; it moved to where it asks a question instead of waiting to be noticed.

The first dial

## Five shapes, and no safe one

Each shape is an arrangement of the four blocks the army already owns. Tap one to see what it answers and what answers it.

### —

Every shape beats the two clockwise from it and loses to the two the other way. There is no dominant option, and there is nothing to hide behind.

| Shape | The blocks, arranged | Beats | Loses to | Needs |
| --- | --- | --- | --- | --- |

The ring order is also the **strip order on the dock**, so the rule is legible from the layout itself: the two shapes you beat are always the two to your right, wrapping. A player who never reads a word of this page still learns the geometry from where the buttons sit.

The second dial

## Stance is a temperature, not a tactic

The old ring made stance *and* matchup the same decision, which is why two of its three options had the same exchange ratio to three decimals. Split them: **shape decides which way the men are spent, stance decides how fast.**

Cố thủ
Defensive
deal **×0.62**  
take **×0.55**  
fight runs **~1.7× longer**

How you buy the beats to change shape. A losing matchup survivable only from here.

Cân bằng
Balanced
deal **×1.00**  
take **×1.00**  
fight runs **14 beats**

The baseline the numbers are quoted against. Never wrong, never decisive.

Xung phong
Aggressive
deal **×1.55**  
take **×1.40**  
fight runs **~0.65×**

Cashes a winning shape in. Into a losing one it is the fastest way to lose a battle in this game.

Aggression is a genuinely favourable trade at even shape — 1.55 dealt against 1.40 taken — so it is not a trap, it is a *bet*. What makes it a bet is that the multiplier lands on whichever side the shape has already tilted. Press with the counter and you win at nearly two to one; press into the counter and you lose at better than three to two, in half the time.

### And you cannot take it back for four beats

A stance is an order sent down the line, not a shape the men take. It lands on the **next** beat and then **locks for four**. That single constraint is what turns the bet into a real one — because in four beats the enemy can change shape, and if they do, you are pressing into a counter and the dial that would fix it is greyed out.

You do not lose a battle at the moment you choose aggression. You lose it three beats later, when they answer your shape and you are still committed to the tempo.

The hierarchy

## Two dials, two speeds

These are not two of the same kind of control, and the screen must not present them as if they were. One is touched constantly and the other barely at all — so one of them owns the thumb, and the other sits above it and waits.

3–5times a fight

### Formation — the fast dial

**Instant to order, slow to complete.** You give it the moment you see their blocks move; it costs a beat or two of transit to arrive. This is the reactive layer, the thing you are watching the field *for*, and it gets the largest, lowest, most reachable band on the screen.

1–3times a fight

### Stance — the slow dial

**Slow to order, instant to complete.** It lands next beat and then holds you for four. This is the commitment layer — how the whole passage of the fight is to be fought — and it belongs above the formation strip, compact, out of the way of the thumb that is working.

The inversion is deliberate and it is the mechanism, not the flavour. If both dials were free every beat the fight would be a reflex test with two knobs. Give one of them a **completion cost** and the other a **commitment cost** and they stop competing: formation asks *what is in front of me right now*, stance asks *how do I want the next twenty seconds to go*. A player answers the first question three or four times and the second one twice — and writing an engagement out beat by beat is how that ratio was arrived at, rather than assumed. It is the cadence the dock should be shaped around.

What this costs, and it is worth naming
A locked stance means the screen will sometimes show you the right answer and refuse to let you take it. That is **frustrating on purpose** — it is the only thing that makes choosing aggression feel like a decision rather than a free multiplier. But it has a floor: the lock never blocks **Cố thủ**. You may always cool down, on any beat, at the cost of the change landing a beat late. A game may take your good options away; it may not take away the brake.

The cost of the first dial

## Changing shape takes beats you are still bleeding through

A formation you can swap for free is not a decision, it is a reflex test — and the player would simply mirror-counter every beat. So the change has a window, and during it you have no shape at all.

| While re-forming | Effect | Why |
| --- | --- | --- |
| **Tilt***the counter* | 0 | Men walking between blocks are in no formation. Neither the shape you left nor the one you are heading for applies. |
| **Dealt** | ×0.55 | Half the army is facing the wrong way. |
| **Taken** | ×1.45 | This is the whole cost, and it must hurt or the dial is free. |
| **Stance** | unaffected | The tempo dial keeps running through a re-form — which is precisely how a locked aggressive stance turns a shape change into the worst two beats of a fight. |

Is the counter worth the beats it costs to reach it?

That question, asked three or four times an engagement, is the entire fight. Everything else on this page exists to make it answerable — and the window is deliberately **one or two beats, not three**, because a dial the player is meant to work constantly cannot cost a fifth of the battle every time it is touched. Three beats is a punishment state now, reserved for a host whose morale has already gone.

### How long the window is — and this is where the campaign pays out

| Host | Under nobody | Martial 45 | Martial 80+ |
| --- | --- | --- | --- |
| **Levy***tier 0* | 2 beats | 2 beats | 2 beats |
| **Trained***tier 1* | 2 beats | 1 beat | 1 beat |
| **Royal guard***tier 2* | 1 beat | 1 beat | 1 beat |
| **Any host, morale broken***below the rout line* | 3 beats | 3 beats | 2 beats |

Army quality and the general stop being a percentage bonus and become **reaction time**. A guard host under a great commander answers a shape change inside one beat; a levy under nobody is committed for three and will usually eat the counter it was trying to escape. The same lever, in two hands, is a different game — which is the correct way for a strategy layer to be felt inside a tactical screen.

And the same clock runs for them
Their re-form window **is your reaction time**, and it is visible: their blocks are physically walking. A poor enemy telegraphs for three beats. A Thanh guard army telegraphs for one — and you will miss it if you are reading text instead of watching the field. A general with **martial ≥ 60** earns you the shape *named* in the ribbon a beat early; below that, you read the movement yourself or you don’t read it.

The arc, for free

## The fight closes its own doors

Casualties already empty the blocks in a fixed order — screen first, then the line, then the bows, the horse last. That was drawing. Now it has a consequence.

| Shape | Standing on | When that block is gone |
| --- | --- | --- |
| **Thế Tán***skirmish* | the screen | Gone entirely. Nothing left to scatter. |
| **Thế Nỏ***volley* | the bows | Available but blunt — half tilt. |
| **Thế Xung***wedge* | the horse | Gone entirely. A wedge with no point is a column. |
| **Thế Chông***hedge* | the line | Never gone. The line is the last thing to die. |
| **Thế Quy***tortoise* | the line | Never gone. This is the floor of the fight. |

So every engagement **narrows**. You open holding five shapes and finish holding two, and which two depends entirely on what you spent getting there. A long grinding battle and a short sharp one now feel structurally different without a single rule being added to make them so — and a doctrine choice made back on the map (Doc 12’s five compositions) is what decides which doors you had in the first place. An army with no horse block never had **Thế Xung**, and the enemy’s Thế Tán will make it pay for that all afternoon.

The interrupt

## How a Moment shows

The deck of thirty questions stays exactly as it is. What was never specified is what “time stops” actually looks like on a phone that a second ago was showing a fight in motion. Six things, in the order the player meets them.

The fight stops, and the screen says so

The beat clock halts — the simulation *already* does this and nothing on screen ever admitted it. The field holds mid-beat: no slide, no floaters, no new fallen, no drum. It drains to a flat wash a shade lighter than the paper and a hairline **HELD** mark prints across the middle of it. A fight that merely went quiet reads as a dropped frame; a fight that visibly freezes reads as a stop.

It lands exactly where the thumb already is

The five formation chips slide out of their band and two answers slide into it — **same band, same height, same place**. The hand does not travel and the eye does not hunt. It is not a card floating over the field, because the field is the thing the question is about, and the build this replaces covered the very thing it was asking after.

One control on screen, and only one

Formation and stance both grey out while the question stands. **A stop you can keep playing through is not a stop**, and two sets of live controls in one band is worse than either alone. The question *is* the order for this beat.

The clock is a hairline, not a threat

**One world tick — 3.5 seconds** (ASCENT\_TICK\_MS), drawn as a rule retracting along the top edge of the answer band. Five was the number this page asked for; the simulation is tick-driven so that headless harnesses stay deterministic, and giving the view its own wall clock would let a fight watched and a fight run headless lapse on different beats. It is a *how long you have to think* bar, not a fail bar: nothing flashes, nothing sounds, and it does not accelerate at the end. The tension is meant to come from the question, not from the furniture around it.

Letting it lapse is a move, not a failure

On expiry the general answers it, with the judgement he would have used anyway, and the ribbon says which way he went. This is load-bearing rather than generous: the mode already offers to fight without you, per host and per run, so a timer that punished looking away would contradict a feature that has shipped. **Missing a Moment costs you the edge, never the fight.** A delegated fight is never shown one at all.

And then it resumes from where it held

No rewind, no re-entry flourish, no catch-up burst. The answer applies, the chips slide back in, and the next beat plays. Total interruption, question to resumption, is **under four seconds**.

### Where the question comes from

The fight raises it; no clock does. The deck is filtered every time by what is actually true — the ground, the river, the morale on both sides, the relative numbers, which blocks are still alive — and now by **the shapes on the board as well**. That last filter is what stops it feeling like a card draw: a Moment can be about the very thing you are looking at.

| Family | Commit | Steady |
| --- | --- | --- |
| **Tempo***the slow dial* | One stance change **now**, ignoring the four-beat lock. | The lock resets, and you take ×0.8 for three beats. |
| **Shape***the fast dial* | Your next re-form costs **zero beats** — the counter without the bill. | **Their** shape is locked for three beats. You know what you are answering. |
| **Edge***the tilt* | Tilt sharpened to ±0.42 for four beats, whichever way it is pointing. | The counter cannot be turned against you for four beats. A floor, not a ceiling. |
| **Bodies***the folded-in buttons* | The reserve walks on now, into whichever block is thinnest. | The general rallies — morale scaled by how far the line has already sagged. |

Two answers, never three, and **neither is safe** — that constraint is what has kept this deck good and it does not change. What does change is that both answers now speak the dials’ own language, so a Moment reads as part of the same game rather than a modal from a different one. Not +12% dealt; *your next change of shape is free.*

### And it reads what you are holding

An answer may be conditioned on your own shape, which costs nothing to write and changes how the whole mechanic feels: *“You are in Thế Quy. The shields will hold this. Stand.”* — offered only when you actually are. The fight stops feeling like it is dealing you cards and starts feeling like it is **talking to you about the board**.

A pacing trap I cannot settle from here
A fight is roughly twenty beats at BATTLE\_TICK\_MS 560 — call it **twelve seconds of watching**. Three full stops of five seconds each inside twelve seconds of fight means the screen is frozen for more of the engagement than it is running. The existing constants (3 per fight, gap 8, earliest 4) were tuned when the player had nothing else to do between Moments. Now they have a dial they touch three or four times. My proposal: **two Moments in an ordinary engagement, three only in a great battle** — see the questions at the foot of this page.

The loop, concretely

## One fight, beat by beat

An ordinary engagement, both sides roughly matched, to show what the two dials and the interrupt actually feel like against each other. Nothing here is unusual — this is the median fight.

1. 1–3

   **Approach.** Arrows only. Their blocks settle: the horse walks up to the point and gathers — **Thế Xung** is coming, and you can see it forming. You are in **Thế Chông**, which answers it. Stance **Cân bằng**.
2. 4

   **Contact — and the first Moment.** *“Their horse comes on at the trot. Level the stakes and take the charge, or open lanes and let it through?”* You commit. The tilt sharpens to ±0.42 for four beats.
3. 5

   **You cash it in.** **Xung phong.** The stance lands next beat and locks until beat 9. Their wedge is dying on your points at better than two to one.
4. 6–7

   **They slip out of it.** The horse falls back and the line packs down: **Thế Quy**, which smothers a hedge. You order **Thế Xung** — a wedge splits a turtle. Two beats in transit, and you are still pressing while you walk. *Shape change one.*
5. 8

   **In shape.** The point goes in. Their **screen is gone** on this beat — and with it Thế Tán, for the rest of the fight. They are down to four shapes; you have lost none of yours.
6. 9

   **They answer.** The bows bank up behind a thinning line: **Thế Nỏ**, and massed crossbows are exactly what a wedge dies to. Your stance is locked for one more beat. *This is the bill for having committed on beat 5.*
7. 10–11

   **The worst passage of the fight, and you chose it.** You order **Thế Tán**. Two beats with no shape at all, still pressing, taking ×1.45 for the transit and ×1.40 for the stance. You lose more men here than in any other four — and the alternative was standing still inside a counter. *Shape change two.*
8. 12

   **In shape.** Tán answers Nỏ; loose men in open order waste their arrows. The stance unlocks and you drop to **Cân bằng** to let the line steady. *Stance change two.*
9. 13

   **Second Moment.** *“Your skirmishers are in among their bowmen. Push on, or pull them back before the horse comes round?”* You steady — **their shape locks for three beats**, which is three beats you already know the answer to.
10. 14–15

    Held in Nỏ and bleeding under your skirmishers, they can do nothing about it. Nothing to decide, and nothing needing to be decided. You watch, which is most of what a fight should be.
11. 16

    **Their last card.** The lock ends and the horse comes up: **Thế Xung**, and scattered men in the open are what cavalry was made for. You order **Thế Chông** — **one beat**, because your host is trained and your general is good. That is the campaign paying you back. *Shape change three.*
12. 17

    **The hedge takes the charge** on the beat it arrives. Their wedge is spent on the stakes and their morale goes with it.
13. 18

    **Their line breaks.** Rout. Seven dial-touches across eighteen beats: **three formations, two stances, two answers** — and eleven of those beats were spent watching.

Three changes of shape, two of stance, two questions. Eleven of eighteen beats with nothing to do.

Note what the fight never asked for: a target, a unit selection, a second cursor, or a single input that had to be *fast* rather than *right*. The only pressure anywhere in those eighteen beats is the five seconds on a Moment — and even that one answers itself if you look away. The engagement is mostly watching, punctuated by three or four decisions that matter; if that ratio inverts, the screen has become work.

The model, arguable

## One beat, resolved

Set both sides and watch the exchange fall out. 2,400 men each, breaking at a third lost — the point is not the absolute numbers, it is whether the *shape* of the decision reads right.

**Bàn tính trận**one beat · both sides · 2,400 men

Your stance

Your shape

Their shape

Your state

They lose—

You lose—

Beats to decide—

—

The arithmetic is deliberately small enough to hold in your head: theirLoss = base × yourDealt × theirTaken × (1 + tilt), and the mirror of it for yours. Tilt is ±0.28, zero while either side is re-forming. Everything the campaign contributed — numbers, quality, the general, the ground — lands on base, before any of this.

The honest weighting

## What actually decides a battle

Set before the first arrow

### The opening hand

1. **Numbers.** Headcount both sides, and it is the largest single term by some distance.
2. **Quality.** Levy, trained, guard — sets the re-form window, and a floor under losses.
3. **The general.** Re-form speed, the early read at martial ≥ 60, and one rally in the deck.
4. **Composition.** *Which shapes you own at all*, and how sharp each one is — the doctrine chosen on the map.
5. **Ground.** The terrain multiplier, unchanged from today.

Decided while it runs

### The play

1. **Tilt.** Your shape against theirs, re-read every beat: ±28%.
2. **Stance.** The tempo you spend at: ×0.62 to ×1.55 — but only two or three times, and each one holds you for four beats.
3. **Timing.** Which beats you accept the re-form bleed on — the only real skill on the screen.
4. **Moments.** Two answers, three in a great battle, worth roughly one good exchange each.

Play moves a fight by about a third. It does not overturn one.

A host outnumbered two to one does not win by holding the right shape — it loses more slowly, and over ground it can withdraw across. That is the correct weight for a tactical screen sitting inside a grand-strategy game: **the fight should pay the campaign back, not replace it.** If a player can reliably beat 2:1 odds with good dial work, the map has stopped mattering, and the map is the game.

One hand

## The dock, ranked by how often it is touched

Everything above resolves into one layout rule: **the control you work four times a fight owns the bottom of the screen, and the one you work twice sits above it.** The two exits leave the dock entirely.

Resting — the fight running

THE FIELD — four blocks a side

**Ủy thác****Rời trận**

OURS 1,840BEAT 6/14THEIRS 2,110

Thế đánh — stance LOCKED · 3 BEATS

Cố thủ

Cân bằng

Xung phong

Thế trận — formation

**Chông***HEDGE*

**Xung***WEDGE*

**Tán***SKIRMISH*

**Quy***TORTOISE*

**Nỏ***VOLLEY*

A Moment — the fight held

THE FIELD — four blocks a side

**Ủy thác****Rời trận**

**H E L D**

OURS 1,840BEAT 6/14THEIRS 2,110

Thế đánh — stance

Cố thủ

Cân bằng

Xung phong

Their horse comes on at the trot. Level the stakes and take the charge — or open lanes and let it through?

Level them*tilt ±0.42 · 4 beats*

Open lanes*their shape locked · 3 beats*

### Why formation is the bottom band

It is the widest, lowest and largest thing on the screen because it is the thing a thumb returns to every three or four beats. Chips are **74×62**, the name set large enough to hit without looking. The strip is in **ring order**, so the two shapes you beat are always the two immediately to the right, wrapping — the counter rule is legible from the layout alone.

Four readings, no text: **filled** is what you hold, **green edge** beats what they are telegraphing, **red edge** loses to it, **faded** is a shape whose block is dead and can no longer be formed.

### Why stance is a strip, not a ring

Three flat segments, **34 points** tall — deliberately smaller than a formation chip, and placed above them, further from the thumb’s rest. It carries one extra reading the formation strip does not need: a **lock counter** in its own label, saying how many beats until it can be changed again. A greyed control with no explanation is a bug; a greyed control that says LOCKED · 3 BEATS is a rule.

**Cố thủ is never locked.** Cooling down is always available, one beat late. The lock takes away your good options, never your brake.

### Why the exits left the dock

They are pressed at most once a fight and they are semi-final, which makes the bottom band — where the thumb is working every few beats — the worst place on the screen for them. They move to the **top-right corner of the field** as two small chips: reachable with a small hand-shift, unreachable by accident.

**Ủy thác** hands both dials to the general while you keep watching; reversible on any beat, because the way back has to be as cheap as the way out. **Rời trận** leaves entirely — the engagement runs on the world clock and the aftermath finds you. That is the button for the eleventh battle of a session and it must never read as giving up.

### What the whole screen never asks for

No target. No selection. No drag, no long-press, no gesture, no double-tap. **Every input in a fight is a single tap on one of eight chips**, all of them inside the bottom 190 points — the arc a right thumb covers on a 390×844 screen without the hand shifting. The two exits are the only things above that line, and they are the only things you are not meant to reach quickly.

The seam

## Where this touches the code

Sketched, not specified — the point of this page is to settle the gameplay first.

| Where | Change |
| --- | --- |
| **types.ts***AscentBattle* | Add `ourFormation`, `theirFormation`, `formationTarget`, `theirFormationTarget`, `reformBeats`, `theirReformBeats`, `stanceLockBeats`, `stancePending`. Remove `focusHostId`. `BattlePosture` becomes `BattleStance = 'defend' | 'balanced' | 'press'`. |
| **BattleSystem.ts** | `tradeAgainst` splits into `stanceTrade` (tempo) and `formationTilt` (the ring). `setBattleFocus` deletes; `setBattleFormation` arrives with the re-form window and `setBattleStance` with the lock (and the **Cố thủ** exemption). `generalPlaysBeat` plays two dials on two clocks instead of one dial every beat. |
| **devices.ts***Doc 12’s work* | Already has blocks, offsets and per-block redraw. Needs one addition: a formation table giving each block its *frontage and depth* per shape, so the same men re-arrange rather than teleport. |
| **ConquestUIScene.ts** | `buildBattleOrders` becomes the two strips. The field tweens block positions across the re-form window — that tween *is* the telegraph, so it cannot be skipped for performance. |
| **battleMoments.ts** | Four effect families (tempo · shape · edge · bodies); reserve and rally added as cards; a `requiresFormation` filter so a card can be about the shape you are actually holding. |

Three traps, all previously sprung on this screen
**The regression fingerprint.** This changes the simulation, so `verify-modes-regression` is deliberately re-baselined *once* and must then be stable. **i18n.** Ten new names — five shapes, three stances, two exits — need Vietnamese in the same edit or the game throws at import. **The redraw gate.** Blocks are currently rebuilt only when a mark count changes; a formation change moves marks without changing the count, so the gate needs a second key or the field will simply not move.

Open

## Four I would not decide alone

Is four beats the right hold on a stance?

This is the number that produces the cadence you asked for, so it is the most load-bearing thing on the page. At **four**, a twenty-beat fight allows three stance changes and the lock will bite roughly once a fight — enough to be felt, rare enough not to be resented. At **three** it is barely a constraint and stance drifts back into being a per-beat dial competing with formation. At **six** it dominates: you would commit once and then just watch. I would build at four and only move it after watching ten real fights, because it is the one number here that cannot be reasoned to.

Settled · Two Moments in a fight, or three?

A fight is about twelve seconds of watching. Three five-second stops means the screen is frozen longer than it runs, and those constants were tuned when the player had nothing to do *between* Moments — which is no longer true. **Built: two in an ordinary engagement, three in a great battle**, which also gives a great battle a shape an ordinary one does not have. The counter-argument is that Moments are the most-liked thing on the current screen and cutting them by a third to protect a dial that is not built yet is a bet on unbuilt work.

Settled · Should Withdraw be the fourth notch of the stance dial?

**Built: yes.** The dial is Lui binh · Cố thủ · Cân bằng · Xung phong and Retreat is gone from the dock; breaking off takes BATTLE\_WITHDRAW\_BEATS = 3. You asked for three stances, and Retreat was its own button — which the new dock has no room for, since the bottom band now belongs to formation. Folding it on as the cold end of the same dial makes disengagement **a thing you survive rather than a thing you press**: several beats of taking hits while the blocks walk backwards. It is better design and it is one notch more than you specified, so it is your call.

Should a dead block lock a shape out, or only blunt it?

Hard-locking gives the fight its narrowing arc and reads instantly on the strip — a faded chip needs no explanation. But it can strand a player in a two-shape endgame against an enemy still holding all five, and now that formation is the dial they are meant to work constantly, taking it away is a bigger deal than it was. **Blunting** (half tilt) is gentler and muddier. I would ship the hard lock for the horse and the screen and blunt for the bows — and note that ±0.28 tilt is the other number worth re-reading after ten fights.

After the build

## As built, and the one thing this page mispriced

Everything above is implemented. Four things landed differently, three of them
decisions taken deliberately — and one of them a consequence this page did not see coming.

| On the page | In the game |
| --- | --- |
| **The telegraph is the field** | The telegraph is the **strip**. Re-arranging blocks is drawing code and the revamp was scoped to logic and UI. The shape they hold, the shape they are walking into and the beats left are printed on the formation strip’s own label; the chip rims say which shapes answer it. |
| **Five seconds** | **3.5 seconds** — one world tick. The sim is tick-driven so headless runs stay deterministic. |
| **Withdraw: open question** | **Built.** The fourth, coldest notch of the stance dial, over three beats. |
| **Moments: open question** | **Built** at two, three in a great battle. |

### What this page mispriced

The old dock opened on hold and the invader’s doctrine
opened on press — and under the retired ring, **hold countered
press**. So an engagement nobody steered was a free **2.71-to-1** win before a single order
was given. Measured in battle-lab on the old constants: the player side
won **48.8%** of fights and **routed in none of them**.

This page removes stance-countering on purpose, and it is right to — tempo and
matchup were doing the same job, which is why two of the three old options had the same exchange
ratio to three decimals. But it never priced what that accident had been holding up. With tempo
no longer counterable, a host standing flat while the invader reads the board every beat is not
playing a harder fight; it is not playing at all.

| battle-lab | Before | After |
| --- | --- | --- |
| **Well-led host***general, martial 90* | 46.7% | 43.3% |
| **Fairly led***martial 60* | — | 31.7% |
| **Untouched, unled***nobody on either dial* | 31.7% | 2.9% |
| **Player routs** | 0.0% | 12.9% – 80% |

A well-led host still wins 43% of fights. An unled one now loses almost all of them.

Two root causes were found and fixed. The invader was answering the shape we were
*walking into* rather than the one we were standing in, which made it omniscient and meant
a player could never hold a winning matchup for even one beat; and the invader read the tilt every
beat while our own commander used an ad-hoc rule that mostly returned balanced.
Both sides now play the same rule, and a fight nobody has touched is fought by its commander
rather than left standing flat — which is this page’s own principle about a lapsed Moment,
applied to the dials.

What is **left open** is the last of it: doing nothing has gone from
**31.7%** to **2.9%**. Some of that is the design working as intended — this page says play
should matter — and some of it is a difficulty curve that was tuned against a free win that no
longer exists. Deciding how much of each is a balance pass, not a build, and it is the one piece
of this work that is not finished.

Vạn Thắng
Doc 14 · Trận đồ
Follows Doc 12 (Twelve Armies, Four Arms) and Doc 13 (Three Breaths of Battle)