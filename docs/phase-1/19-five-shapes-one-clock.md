> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Five Shapes, One Clock

Five Shapes, One Clock

Vạn Thắng · design doc 19 · supersedes doc 14 §availability

# Five Shapes, One Clock

The shape decides which way the exchange leans. The stance decides how fast you spend it — and how fast your shapes come back. Push hard enough and you will run out of answers, which is the moment the fight actually starts asking you something.

Dragon Ascent · battle screen
replaces `formationAvailability`
revision 4 — the opponent gets a face

01 — the problem

## A counter you always have is not a decision

The ring plus a cooldown gets you a screen where the correct move is legible. That is necessary and it is not enough — simulated, a player who simply takes the best available answer holds the strong counter **78–87% of the time**. They press the lit chip, they win, and nothing was ever asked of them.

Depth does not come from making the right answer harder to find. It comes from making it *sometimes unavailable* — and, critically, unavailable **because of a choice the player made three beats ago**. A cooldown that fires on its own schedule is weather. A cooldown the player controls is a decision.

So the stance stops being a damage dial and becomes the thing that winds the clock.

One new rule connects them, and it is the whole of this revision.

02 — the rule

## The stance sets how fast your shapes recover

Cố thủ recovers two beats of wind a beat. Cân bằng recovers one. Under Xung phong nothing recovers at all — men who are charging do not catch their breath.

That is it. No new resource, no new number to track: it changes the *rate* of the clock that was already on the chip. And it turns the whole screen inside out, because now the cost of pressing is not paid in blood — it is paid in **options**.

| Stance you hold | Recovery | Strong answer ready | Pushed to soft | Down to match + defend |
| --- | --- | --- | --- | --- |
| **Cố thủ***defend* | ×2 | 99% | 1% | 0% |
| **Cân bằng***steady* | ×1 | 89% | 11% | 0% |
| **Xung phong***press* | ×0 | 48% | 23% | 29% |

30-beat engagements, 400 runs per row, against an enemy rotating shape every three beats. Share of the moments a decision is made.

Read the bottom row again. **A player who holds Xung phong has their best answer barely half the time, and is down to matching-and-defending on nearly a third of their decisions.** Not because the game took anything away — because they chose to spend their dock on winning faster.

And the top row is the other half of the deal. Cố thủ is how you **buy your options back**, at ×2, while taking 45% less. The player is never out of moves, but the move available to them is the one they can afford.

03 — the loop

## What a fight now feels like

01 · press

### You hold the counter

Strong answer landed. Go to Xung phong and convert it — 1.55× dealt on a tilt already leaning your way is close to two-to-one.

02 · drain

### The dock stops refilling

Nothing recovers while you charge. Every shape you left stays winded, and each new order adds one more.

03 · exposed

### They rotate, you cannot answer

Strong is winded, soft is winded. Match their shape — always allowed — and drop to Cố thủ before the exchange turns.

04 · rebuild

### Wind comes back at ×2

Two, three beats of holding and the dock lights up again. You bled slowly for it. Now you have a counter, and a choice to make.

↺ and round again — three or four times in a twenty-beat engagement

That is a rhythm rather than a lookup table, and it is the same rhythm a real commander has: commit, overreach, steady the line, commit again. The player is not being asked *which chip is lit*. They are being asked **how long they can afford to keep pressing**, which is a question with no printed answer.

04 — the stances

## Three jobs, and none of them dominates

Simulation caught a real exploit here, and it forced one number to change. With Cố thủ dealing 0.62 against 0.55 taken, its exchange *ratio* was favourable — so a bot that only ever mirrored the enemy and sat in Cố thủ **beat an army 10% larger without making a single real decision**. The turtle was the best player in the room.

| Against a 10% bigger army | Cố thủ deals 0.62 | Cố thủ deals 0.50 |
| --- | --- | --- |
| **Mirror-turtle bot***never counters, always defends* | wins 100% | wins 0% |
| **Active play***counters, manages wind* | wins 100% | wins 100% |

So Cố thủ deals **0.50**, not 0.62 — its exchange ratio drops below one, and "it cannot win a fight, only survive one" stops being a slogan and becomes arithmetic. Passivity now loses to any bigger army; recovery is what you defend *for*.

| Stance | Dealt | Taken | Recovery | Morale drip | The job only it can do |
| --- | --- | --- | --- | --- | --- |
| **Cố thủ***defend* | 0.50 | 0.55 | ×2 | halved | **Refill the dock.** Loses the exchange by design — its pay is wind and time. |
| **Cân bằng***steady* | 1.00 | 1.00 | ×1 | full | **The only stance that damages properly and still recovers.** That is its whole case, and it is a good one. |
| **Xung phong***press* | 1.55 | 1.40 | ×0 | full | **Turn a counter into a decision now**, and mortgage the next four beats to do it. |
| **Lui binh***withdraw* | 0.35 | 0.75 | ×2 | full | Leave. Three beats of walking backwards, badly. |

**No stance is ever locked.** All four are live on every beat — `BATTLE_STANCE_LOCK_BEATS` is retired. And the overtime spiral stays: a fight that drags starts costing both sides heart just for still being there, so even a skilful defensive game must eventually cash its rebuilt dock into an attack.

05 — the ring

## One strong answer, one soft answer

The five-cycle gives every shape two answers, so a cooldown on one of them means the player shrugs and takes the other. The two answers therefore stop being equal: **one step round the ring is a strong counter at full tilt, two steps is a soft counter at half.** A gradient, not a lock — nothing is refused, one answer is simply better.

Pick the shape the enemy is standing in. The two arrows pointing into it are your answers.

Drawn out it is a pentagon with a star inside: **the outer edges are the strong counters, the star is the soft ones.** Against whatever they stand in, the dock is always a fixed **2 / 1 / 2** — two chips beat them, one matches for nothing, two lose.

One honesty note: "the chip to the left of theirs beats them" wraps at the end of the strip, so the spatial rule alone fails one time in five. The rim colours are the real carrier — jade for strong, pale jade for soft, cinnabar for losing — and they never wrap.

| Steps round the ring | Reading | Tilt | Morale drip |
| --- | --- | --- | --- |
| **1 — you are their near answer** | Strong counter | +0.28 | 0.40 / beat |
| **2** | Soft counter | +0.14 | 0.20 / beat |
| **0 — matching them** | Neither | 0.00 | none |
| **3** | Softly countered | −0.14 | −0.20 / beat |
| **4 — their near answer is you** | Strongly countered | −0.28 | −0.40 / beat |

Full tilt is `BATTLE_FORMATION_TILT`, unchanged. The half is `BATTLE_FORMATION_TILT_BLUNT`, already 0.5 and finally doing real work. The drip is `BATTLE_COUNTER_MORALE`, cut from 0.7 to 0.4 and now scaled — so fights run longer, and a soft counter no longer breaks a host as fast as a strong one.

06 — the opponent

## The same rules, played by a different man each time

Everything so far makes one fight deep. What makes a hundred fights different is the other side — and the wind system hands the enemy a personality for free, because the two numbers that define it are numbers the system already has: **how often he rotates, and how willing he is to press.**

The invasion already names its commander. Now the name means something, told to the player before the lines meet:

| Commander | Rotates every | Habit | The fight it produces, measured |
| --- | --- | --- | --- |
| **Nóng vội***the hasty* | 2 beats | Presses whenever he counters | A 12-beat scramble — over half of it spent re-forming, few clean press windows. He also winds his own dock fastest; outlast him and he runs dry first. |
| **Điềm tĩnh***the measured* | 3 beats | Presses with a counter, digs in without one | The baseline fight — ~16 beats, strong answer available two-thirds of the time. |
| **Lì lợm***the stubborn* | 5 beats | Never presses; defends when countered | A siege — long press windows, ~75% of beats holding your counter, but he rebuilds while you spend. Overtime is his friend. |
| **Xảo quyệt***the cunning · late waves* | varies | Rotates into the shape whose answer you just winded | The graduation exam: he reads your dock, so pressing carelessly is what he feeds on. |

Fight-texture figures from 400-run simulations per commander. The telegraph is never a lie — a personality changes when and what he orders, never whether you can trust the banner.

**His wind is real, and you can count it.** The enemy obeys the same three-beat clock, so a shape he left two beats ago is a shape he cannot answer you with yet. The readout says it outright — he cannot re-form: Chông · 2 — which turns memory into reading and opens the one play that makes this a duel: **the bait.** Force his answer with a shape you don't intend to keep, and for three beats his counter to your real plan is off his dock.

**Signature shapes give armies their identity back.** Section 09's ledger admits the price of this design: doctrine stopped shaping the dock. It buys that back with one legible number — each composition has one signature shape whose wind is **2 instead of 3**, printed on the chip from the first beat: spears→Chông, archers→Nỏ, shock and horse→Xung. Yours tells you what you can afford to spam; *theirs* tells you what they will keep coming back to, which is one more thing to read before the lines meet.

**And the roguelite layer finally has a battle dial to turn.** Cards and Moments can now touch wind without touching legibility, because every effect is a visible number on a visible bar: a drum Moment that refills the whole dock at once (doc 15 built the drum for exactly this), a card that lets Xung phong recover ×1, a late-wave mutator that quickens every enemy commander's rotation by one. Waves stop escalating only in men and start escalating in *tempo*.

07 — the screen

## What changes in front of the player

Every one of these exists to answer a question the player is actually asking. Nothing here is decoration, and nothing new is hidden.

Wind bar

A 3px bar at each chip's foot, **filling as the shape recovers**. The note reads winded · 2 rather than the retired đã cạn. The bar already exists — `ConquestUIScene` draws exactly this track-and-fill for the re-form walk; point it at the wind instead. **A countdown says the game forbids this; a bar filling says these men are getting their breath back.**

Recovery on the stance

Each stance prints wind ×2 / ×1 / ×0 under its trade figures. This is now the most consequential number on the stance row and it must be the one that reads first.

Dock readiness

A running **4/5** beside the readout. It is the resource the player is spending, so it gets a number — and it is the tell that tips a player from pressing to steadying before they get caught.

Their spent shapes

One line under the telegraph: he cannot re-form: Chông · 2. The enemy's wind, made readable, so counting his dock is a skill the screen teaches instead of a memory burden it imposes.

The projected beat

A single line above the controls: **what this beat will cost, at the shape you hold and the stance you have set**, before you commit to it. Risk you cannot see is not risk you can control.

Stance no longer advances

Setting a stance is **free and instant** — it updates the projection and waits. Only ordering a shape or holding advances the beat. (In the live game the beats tick on the battle clock regardless; the demo below is turn-based so the forecast can be read at leisure.)

The enemy's shape chip

Always pressable, whatever its wind says. Marked match. It is the floor of the fight and the reason a dead end cannot happen.

Signature mark

The signature chip carries a small wind 2 tag from the first beat — one printed exception, yours and theirs, in place of the four hidden ones this design retired.

08 — the dock

## Play it — against three different men

Switch the enemy general and play the same rules three times. Hasty makes you scramble, Stubborn hands you press windows and dares you to overspend. Then try holding Xung phong five beats against any of them and watch your dock go dark.

**Dragon Ascent · battle**
wind 3 · no stance lock · illustrative numbers

Enemy general

Nhịp 1
—
—
dock **5/5**

Quân ta600

khí thế80

Địch660

khí thế80

Set a stance, then press a shape.

Hold this beat
Start over

**Setting a stance does not advance the beat** — it re-forecasts it. Ordering a shape or holding advances. The enemy plays the same wind rules you do, with the stance habits of the general you picked; the line under the telegraph is his spent dock. A winded chip refuses the press, **except the one he is standing in, which is always pressable**. The thin bars are khí thế; the red line is the rout mark.

09 — the trade

## What we buy, and what we pay

Bought

### A fight with a rhythm, against a man with a face

- **Pressing has a real price** and it is not paid in blood — it is paid in the answers you will want three beats from now.
- **Defending is constructive but cannot win** — it rebuilds the dock at ×2 while losing the exchange by design.
- **No stance dominates, and no policy does either:** the mirror-turtle bot now loses to any bigger army.
- **Fights differ by commander** — a 12-beat scramble against the hasty, a siege against the stubborn — from two numbers the system already had.
- **Baiting exists.** His wind is countable, so forcing his answer is a real play.
- **Still one restriction on the whole screen**, three beats, printed on the chip. No dead ends, ever.

Paid

### One more thing to hold in the head

- **The stance now has a second consequence.** One row on the strip and one bar per chip, but genuinely new to learn.
- **An aggressive player will feel punished before they understand why.** The readiness count, the forecast line and the first-fight advisor exist to shorten that gap.
- **Doctrine's dock identity shrinks to one signature chip** — deliberately: one printed exception instead of four hidden ones.
- **Autopilot gets harder to write.** A delegated general must now decide when to spend the dock, not just which chip is lit — and a general who presses forever is exactly the mistake the mechanic teaches.

10 — the build

## Where it lands

data/ascent/formations.ts

Delete **formationAvailability** and **BLOCK\_OF**. Add **formationTier(a, b)** returning the signed −2…+2 tier, and **SIGNATURE\_SHAPE**: one shape per `ArmyComposition` (spears→chong, archers→no, shock→xung, horse→xung, balanced→none). **Keep** `blockShares`, `DOCTRINE`, `compositionOfUnits` — they draw armies.

state/types.ts

Add **wind** to `AscentBattle`, ours and theirs — five small integers a side — and **commanderTemper** on the invasion: `'hasty' | 'measured' | 'stubborn' | 'cunning'`. Retire `stanceLockBeats` and `reformTotalBeats`.

systems/ascent/BattleSystem.ts

Tick each side's wind by **that side's stance recovery**. **canFormFormation** returns true for the enemy's own shape, else reads wind (signature shapes stamp 2, not 3). **setBattleFormation** stamps the shape being left. **stanceIsLocked** deleted. Tilt and morale drip read the tier.

systems/ascent/BattleSystem.ts · the two AIs

The enemy (~**line 823**) rotates and presses per `commanderTemper`; cunning targets the player's winded answers. The delegated general (~**line 1600**) walks the player's ladder and spends the dock only while it is deep. **Regression harness: the mirror-turtle bot must lose to a 10% bigger army** — that assertion is what keeps Cố thủ honest forever.

game/ascentConfig.ts

**BATTLE\_FORMATION\_WIND = 3**, **BATTLE\_SIGNATURE\_WIND = 2**, **BATTLE\_STANCE\_RECOVERY** `{ withdraw: 2, defend: 2, balanced: 1, press: 0 }`, and **BATTLE\_TEMPER** (rotation period + press policy per temper). `BATTLE_STANCE_TRADE.defend.dealt` **0.62 → 0.50**. Retire **BATTLE\_STANCE\_LOCK\_BEATS**, **BATTLE\_REFORM\_BEATS**; `BATTLE_COUNTER_MORALE` **0.7 → 0.4**, scaled by tier.

scenes/ConquestUIScene.ts

Repoint the chip-foot bar from `reformBeats` to wind; add the recovery figure to each stance segment; delete the `refused` branch. Add the readiness count, the **he-cannot-re-form line**, the forecast line, and the signature tag. Stance presses re-render the forecast without emitting an order.

systems/ascent/DecisionDirector.ts · cards

Three card hooks, all visible numbers: a drum Moment that refills the whole dock; a doctrine card giving Xung phong recovery ×1; a wave mutator quickening enemy rotation by one. Each touches one config knob and nothing else.

i18n/catalogs/ascent.ts

Retire **shapeGone**. Add **winded** ("lấy hơi · {n}"), **recovery**, **dockReady**, **projected**, **cannotReform**, **signature**, and the four **temper** names. Split **weBeatIt** into strong and soft. Both languages, same commit, or the game refuses to import.

test\_scripts/

Seven assertions: wind ticks ×2 / ×0 by stance; a pressed-out dock still offers his shape; no stance ever refused; forecast matches the resolved beat; five beats of press measurably drops readiness; the signature chip stamps 2; **and the turtle bot loses**.

The retired availability mechanic is recorded in full in `docs/phase-1/18-formation-availability-by-blocks.md`.