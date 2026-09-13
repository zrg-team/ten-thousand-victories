> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Twelve Armies, Four Arms

Twelve Armies, Four Arms

Vạn Thắng · figure() · wardrobe extension

# Twelve Armies, Four Arms

The soldier on the field already has five slots and knows four Vietnamese dynasties. This sheet adds the three things the picture is still missing — **who is coming for you**, **what each man is actually carrying**, and **how an army stands** — and draws every combination it proposes, so the plates below are the specification rather than an illustration of one.

**Extends** `src/ui/ink/devices.ts` · `figure()`, `drawHost()`
**Reference** Đạt H. Võ, *Timeline of Vietnamese army costume*
**Status** proposal — no code written

Where this starts

## Five slots, one nationality, three weapons

The wardrobe that shipped keys off `mandate.era` and `army.elite`: a crown carries the century, a chest plate carries the rank, one sash carries the realm, an arm carries the weapon, and boots separate a guard from a farmer. It works — cover everything below the neck of the plates further down and the periods are still separable.

What it cannot do is show you an *enemy*. Every host on the field is drawn in the player's own dynasty and told apart by a muted sash, so a Ming column and a Chăm raid and a rival Việt lord are the same twelve men in three shades of brown. And the arm slot knows `spear | bow | heavy`, which is the shape of the old three-way matchup and not the shape of an army.

| Axis | Today | Proposed | Comes from |
| --- | --- | --- | --- |
| **Faction** | — | viet · han · champa | a lookup on `army.kingdomId` |
| **Theme** | 4 (ly tran le nguyen) | 12 | `mandate.era` for us; the era's historical opponent for them |
| **Arm** | spear · bow · heavy | sword · skirmish · bow · mounted | `army.units`, already real |
| **Tier** | 0 · 1 · 2 | unchanged | `army.isLevy`, `army.elite` |
| **Formation** | one mixed block | screen · line · bows · wing | the same `army.units`, deployed instead of stirred |

The reference, read honestly

## Eight periods on the sheet, seven of them ours

The costume timeline separates eight periods with no text on the figures at all, and the way it does that is the whole design here: **headwear carries most of the identification, the chest carries the rank, one accent carries the period.** Here is what each period contributes, and what is deliberately left on the sheet.

| Period | The mark that identifies it |  | Used as |
| --- | --- | --- | --- |
| **Lý** 1010–1225 | Domed helm with a long crest swept back off it; round shield; bare feet on the levy | take | era `founding` |
| **Trần** 1225–1400 | Crested helm with cheek flaps; a round mirror disc on the chest; layered lamellar on officers | take | era `rivalry` |
| **Later Lê** 1427–1527 | Brimmed dome; patterned robe-armour; the first hand-guns in the row | take | era `empires` |
| **Trịnh lords** 1545–1787 | Tall dark fur cap; red coat; the only mounted figure on the whole sheet | take | Việt rival, north |
| **Nguyễn lords** 1545–1778 | Bare-headed, hair in a bun; plain green tunic; musket and a sword at the hip | take | Việt rival, south |
| **Tây Sơn** 1778–1802 | Soft wrapped turban or a wide nón, red tunic — and the war elephant with a howdah | take | Việt rival, late |
| **Nguyễn dynasty** 1802–1945 | Nón dấu — shallow cone with a spike; long coat over plate | take | era `mandate` |
| **Việt Nam** 1945–2020 | Pith helmet, webbing, rifles | leave | outside the game's timeline |

The three lord periods overlap in time rather than following one another, which is exactly why they are useful: they are not rungs on the Mandate ladder, they are *the other Vietnamese army on the map*. A rival Việt kingdom stops being your own silhouette in a duller brown and becomes a Trịnh column with fur caps, or Tây Sơn in turbans with an elephant behind the line.

Plate one

## Your line of battle

Four eras down, four arms across, all at the trained tier with the player's sash. Every figure here is generated from the slot table by the same code that would run in the game — nothing is hand-drawn per cell, which is the point: twelve themes × four arms × three tiers is 144 soldiers, and none of them is a sprite.

**Đại Việt — era × arm**tier 1 · trained · sash sỏi son

**Read it across.** The arm changes the silhouette's outline — a shield on the left, a low thrown shaft, a bow's curve out from the ribs, or the whole man raised two feet onto a pony. **Read it down.** Only the head changes, and the head is enough.

**One line, not a stack of parts.** Three rules do the joining, and the first draft broke all three. The skull is an *outline*, never a filled disc, so the paper shows through as a face. The crown's brim sits at `-39`, which is *inside* the head circle — a hat lifted clear of the skull reads as a lid resting above a ball, and the overlap is the entire difference. And every weapon is held by an arm that starts at the shoulder: one extra stroke, and a man carrying a spear stops being a spear floating beside a man.

Plate two

## The other Vietnamese armies

Three wardrobes that never enter the Mandate ladder, because they are what a rival Việt kingdom wears. Their sash is nâu, not son — the scarcity law reserves sỏi son for your banner, your seal and your losses, and it outranks the reference.

**Trịnh · Nguyễn lords · Tây Sơn**tier 1 · sash nâu

The Nguyễn lords are the sheet's only bare-headed trained soldiers, which makes them the hardest of the twelve to read at distance — so their tunic hem runs longer and their musket sits lower than anyone else's. When a theme cannot win on the crown it has to win somewhere.

Plate three

## Who comes for you

The northern empire is not one army over four hundred years, and pairing it with the era you are living in is free: each of the four Vietnamese eras already *has* a historical opponent, so the enemy re-equips as you climb without a single new state field.

| Your era | Comes north | The mark | Body silhouette |
| --- | --- | --- | --- |
| **founding** · Lý | **Tống** (Song) | Wide upturned brim over a bowl, a plume at the crown | A straight coat, longer than a Việt robe, with a centre placket — different at the hem even when the head is gone |
| **rivalry** · Trần | **Nguyên** (Yuan) | Conical helm, fur neck lappets, and a bow in most hands |
| **empires** · Lê | **Minh** (Ming) | Wide flat rattan hat; studded brigandine instead of a plate |
| **mandate** · Nguyễn | **Thanh** (Qing) | Tall spiked helm with a tassel; the queue hangs behind |

**The northern empire — dynasty × arm**tier 1 · sash chàm

**Colour is the second carrier, never the first.** The palette is a scarcity system with nine pigments in it; if the north were told apart by being blue, a Ming column on a wet-season map would vanish. It is told apart by a longer coat and a wider hat, and chàm only confirms what the shape already said.

**Chiêm Thành — Champa**tier 0 · 1 · 2, and the mounted arm

Champa is the one faction whose *body* does the identifying: a bare torso above a sarong, so the robe trapezoid every other figure shares is replaced by a short flared hem. Tall pointed crown from the Trà Kiệu and Đồng Dương reliefs, a straight sword and a round shield, elephants where a Việt host would have put a levy. One theme, not four — Champa ends in 1471 and the game's late eras never meet it.

The arm slot

## Four weapons, four outlines

The test an arm has to pass is not "does it look like the weapon" — at a mark's real size on the field nothing looks like anything. It is **does the block's outline change**. Four arms, chosen so that no two disturb the silhouette in the same place.

**The four arms, one theme**Later Lê · tier 1 · at plate scale and at field scale

| Arm | Vietnamese | Drawn as | Disturbs | Maps from |
| --- | --- | --- | --- | --- |
| **sword** | đao thủ | Lacquered round khiên on the left, blade up on the right | the left flank of the block | heavyInfantry, royalGuard |
| **skirmish** | quân khinh | A javelin held low and cocked — or a matchlock from the Lê on | the waist line, diagonally | militia, riverMarines |
| **bow** | cung / nỏ thủ | The bow held out from the ribs, arrow across | the right flank, mid-height | archers, crossbowmen |
| **mounted** | kỵ binh | Rider on a pony, sabre raised | everything — it is half a metre taller | lightCavalry |

`spear` does not disappear. It stays as what it always was: the thing a levy is holding, a billhook off a farm, and the default when a host has no composition to read. The four above are what *trained* men carry.

The one that breaks the table

## It is a pony, and it is 1.25 metres

Every prop in this game passes through `proportion.ts`, whose whole premise is that the corrections in `UNIT` only equalise props *if every call site passes the same caller scale*. A soldier is a measured `drawn 6.6` at `s = 1`. A mounted figure is not a soldier with a decoration — it is a new prop with a new extent, and the last time this contract was broken the field came out with sixteen scales on it.

The horse also has to be the right horse. The Vietnamese cavalry mount is a small southern pony, about **1.25 m at the withers** against a European destrier's 1.6. Drawn at destrier size, a mounted mark is nearly twice a footman and a cavalry wing reads as giants; drawn correctly, the rider's head sits about **2.35 m** up — a head and shoulders above the line, which is exactly how cavalry reads on a real field.

**Standing measure**at the drawn rate, 24.7 units per metre

**The hats break the rule, and they are allowed to.** A nón dấu drawn at its true 0.2 m is four pixels of nothing on the field. Measured against the rule above it runs about half a metre, which is the same deliberate exaggeration `proportion.ts` already applies to every living thing through `LIVING = 1.8` — and it is the entire reason the crown is slot one. The *body* stays honest; the crown is the one thing permitted to lie, because the crown is the thing being read.

The elephant is the same argument at four times the price. Tây Sơn and Champa both want one, it is 2.7 m at the shoulder, and it costs about forty marks against a footman's eight — so it is not a figure at all. It is **a prop drawn once per host**, behind the block, like a standard.

Try the combinations

## The dressing bench

Every one of the 144 combinations, drawn on demand from the same slot table. The code underneath is the call the renderer would make.

Theme

Arm

Tier

The specification

## Six slots, and what each one costs

The budget is the constraint that shapes all of this: `figure()` runs up to `HOST_MARK_CAP` times per host, several hosts can be on screen, and each mark is an `inkPath` with a soaked underlay. The wardrobe that shipped went from five marks to eight. Faction and mount are the two additions, and only one of them is cheap.

1 · crown

**The theme**

The most identifying mark on the figure, so it is the one that never drops at any zoom. Twelve variants; at six pixels it is the only slot still drawing. Its brim overlaps the skull — that overlap is what makes it a hat rather than a lid.

1–3 marks  
*keys on* theme

2 · body

**The faction**

New. Việt robe trapezoid, Hán straight coat with a placket and a lower hem, Chăm bare torso over a flared sarong. The slot that keeps a faction legible after the head is lost.

0 marks  
*reshapes* an existing path

3 · chest

**The tier**

Nothing, a mirror plate, or a plate with shoulder pieces. Trần take a round disc, Ming take studs, Chăm take a collar band instead — the tier ladder is the same three rungs whatever the theme.

0–3 marks  
*keys on* tier

4 · sash

**The realm**

One diagonal stroke, and the only place on a soldier the scarcity law touches: sỏi son for the player, muted for everyone else.

1 mark  
*keys on* kingdomId

5 · arm

**The unit type — and the block**

Four now instead of three, and the fourth one moves the whole figure. It does a second job too: the arm decides *which block of the formation a man stands in*, so `army.units` stops being a texture and becomes a deployment.

1–4 marks  
*keys on* units

6 · mount

**The horse**

New, and the expensive one: a pony is nine marks under a rider who is another eight. Capped — see the traps below — because a block of forty cavalry is a block nobody's phone will draw.

9 marks  
*keys on* arm

Gameplay — deliberately later

## The ring the four arms imply

This is a sketch, not a commitment. It is here because drawing four arms is only worth doing if they will eventually mean four different things, and because the shape of the ring decides which arm gets which silhouette.

A pure four-cycle gives every arm exactly one win, one loss and one neutral pairing, so cost can express role instead of compensating for a lopsided ring. It also lands the Vietnamese answer to northern cavalry in the right place: **loose order and broken ground stop horses** — bamboo, paddy bunds, and men who do not stand still to be charged.

What it costs: `compositionMatchup()` in `WarSystem.ts` is a real documented three-way today — spears rout heavy, heavy crush archers, archers shred spears, ±0.4 — and the cycle above **changes one of its three edges**. That is a balance decision with a lab gate behind it, which is why it is not in this proposal. Drawing the arms does not require it; the arms are drawn from `army.units`, which is already real.

The only test that counts

## Two blocks, forty metres apart

None of the above matters at plate scale. It matters at `BATTLE_HOST_SCALE`, in a block of marks one per fifty-five men, on a 390-wide phone. Here is the same code at the size it will actually run.

**Đại Việt, era mandate · against a Thanh column**390 × 250 — the real surface · one mark per 55 men

Nón dấu against spiked helms; a Việt robe against a long coat; sỏi son sashes against chàm. No label is read, and the picture already says which of those armies is yours. The Thanh column is drawn *facing* you — mirrored here for the picture, but in the game that has to be a redraw and not a negative scale, because the props are baked.

Both sides are **formations, not blocks**: screen, line, bows, wing. And the northern host is not your army in another colour — it brings a heavier line, a thinner screen and its own horse, which is a second thing the picture says before any label is read.

What a host is made of

## An army is not a block. It is four of them.

One block with the weapon types sprinkled through it is a lie about how an army stood, and it throws away the only thing the arm slot is good for. Armies deployed *by arm*: a loose screen of skirmishers out in front to take the first volley and fall back through the line, the shield wall as the main body, the bows behind it shooting over, and the horse as a wing off the flank waiting for something to open.

So a host is drawn as several blocks, one per arm, each standing where that arm actually stood. It costs nothing extra to draw — the same marks, arranged — and it buys three things a mixed block cannot: you can see the **doctrine** at a glance, you can see **which part of the army is dying**, and the shape of the formation tells you what it is *for*.

Switch the doctrine and watch the formation change shape, not its texture.

**The muster**—

This is the whole argument for driving the arm off `army.units` instead of a die roll. `drawHost` used to pick `spear && rand() > 0.25`, so three quarters of every host carried a spear whatever it was made of — a bow-heavy host and a wall of shields drew *identically*, and the one decision the player makes at muster was the one thing the picture would not show.

**The blocks are placed from their centres, not their edges.** Two passes got this wrong and both are worth recording: offsets of thirty units drew all four blocks on top of one another, because the line alone is seven files at a pitch of sixteen and so is ninety-six wide before anything else is placed; and offsets to a block's *left edge* then meant the archer host's nine-file bow block grew rightwards straight through the line it was supposed to be standing behind. Anchored at its centre, a block that gets wider gets wider in both directions and the formation still holds.

Motion

## What a host looks like when it moves

This one runs. Not three canned poses but the real clock: a beat every 520 ms, six of them inside an economy tick, and each beat trades men. Everything else on the field is downstream of that single number — the seam shoves toward whoever lost the exchange, numbers rise off the contact, dust builds with the beats fought, and the frame holds for 110 ms on the first clash and on the break.

**Watch which block is dying.** One mark is fifty-five men, so a rank loses a figure every time the butcher’s bill crosses fifty-five — and because an army is four blocks rather than one, the losses land somewhere meaningful. The screen goes first and is gone inside four beats. Then the line grinds down. When the *bows* start disappearing, the front has collapsed, and the picture has said so without a word of text. The horse is still standing at the end of every fight, which is exactly the complaint a player should have about their own cavalry.

A mixed block cannot do any of that: it loses a mark at random and nothing is learned. The ranks bob out of phase throughout — that is `marchInPlace`, and it is the reason every rank is its own `Graphics` object.

**The field**390 × 264 · one mark per 55 men · closing

| Phase | What is being drawn | Already in state |
| --- | --- | --- |
| **Approach** | Both blocks close on the seam over the beat, ranks bobbing out of phase. The advance is a tween per beat, and the last beat of every drain snaps to real state. | ourAdvance, theirAdvance |
| **Contact** | The screens meet first and are spent; the lines behind them keep coming, so the armies close a little further every beat until the shield walls are the thing touching. The seam shoves toward whoever is losing, and a hit-stop holds the frame for 110 ms on first contact and on any break. | beat.ourLoss, beat.theirLoss, BATTLE\_HIT\_STOP\_MS |
| **Attrition** | Casualties are spent in formation order — the screen first, then the line, then the bows, and the horse last. Within a block the rear rank empties first, so the fighting line stays where it is and the block gets shallower. | army.units, MEN\_PER\_MARK |
| **Rout** | The broken host turns and runs off its own edge over two beats, thinning as it goes, and the dead stay where they fell. | battle.log break events |

**Two clocks, not one.** The beat decides *what happened* — who lost men, what the ranks look like now, what the ribbon says. A separate frame loop decides *where everything is*, and it recomputes that sixty times a second: the seam eases toward the beat’s new target and never quite arrives, a slow grind runs under it so the two lines are always leaning on each other, and each beat adds a kick that decays over about 210 ms. The first version set one transform per beat and let CSS ease the gap, which is a block that walks, stops, walks, stops — the exact fault the real screen had.

Measured the way `verify-battle-motion.mjs` measures the real thing, over a ten-second run: **95.8% of frames move**, the longest still stretch is **116 ms** — which is the hit-stop, the only freeze that is supposed to be there — and the largest single step is **0.70 units per 16 ms**. Nothing teleports.

**The one thing this mockup does that the game must not.** The rout here flips the block with a negative horizontal scale. A baked prop flipped that way comes back soft and mirrors its own lighting, so the renderer has to turn a host by *drawing* it turned — which is what `faceTravel` is for, and why it exists.

Implementation

## Four commits, in this order

1

#### Faction and body

`FigureFaction = 'viet' | 'han' | 'champa'` added to `FigureKit`, defaulting to `viet` so all forty-odd call sites stay valid. `factionFor(kingdomId)` and `themeFor(state, army)` join `figureEraFor` as the single place the mapping is written down. The body path becomes a three-way switch. Nothing else moves.

src/ui/ink/devices.ts · src/data/kingdoms.ts

2

#### Eight new crowns

Trịnh, Nguyễn lords, Tây Sơn, Tống, Nguyên, Minh, Thanh, Chăm — each one to three `inkPath` calls, plus the tier-0 head marks (topknot, bun, cloth cap, queue). This is the whole visible payload and it is pure drawing: no state, no balance, no new strings.

src/ui/ink/devices.ts

3

#### The arm slot, widened

`FigureArm` gains `sword` and `mounted`; `heavy` becomes `sword`; the era-dependent skirmish swap (javelin before the Lê, matchlock after) lives in the arm, not the caller. `drawHost`'s `armFor` reads the widened `army.units`. The mounted cap lands here.

src/ui/ink/devices.ts · src/state/types.ts

4

#### The formation

`drawHost` becomes `drawArmy`: it splits `army.units` into one block per arm and places them from their centres at fixed offsets — screen forward, line at the anchor, bows behind, horse on the near flank. It returns the blocks rather than one shape, because `slideMarkers`, the ground shadow and the standard all need to know where each one is. Casualties are then spent in formation order, which is the whole payoff: `hostShapeAt` is already recomputed per mark, so the block that thins is the block that is fighting.

src/ui/ink/devices.ts · src/scenes/ConquestUIScene.ts

5

#### The measure, re-taken

New `UNIT` / `METRES` / `DRAWN` rows for `rider` and `elephant`, measured at `s = 1` rather than guessed, and the doc table at the top of `proportion.ts` updated in the same edit. Then the elephant as a per-host prop for Tây Sơn and Chăm.

src/ui/ink/proportion.ts · src/ui/ink/devices.ts · test\_scripts/diag/measure-figure.mjs

What will go wrong

## Four traps, all of them previously sprung

#### The mark budget, and a block of cavalry

A pony plus rider is roughly seventeen marks against a footman's eight. A forty-mark host of pure cavalry is a 680-mark draw on a phone, per host, several hosts on screen. The formation fixes this by construction rather than by a cap: horse is one block of the four and its size is bounded by the doctrine, so a cavalry *wing* — which is what a real one looked like — falls out of the drawing rather than being imposed on it. The **Cavalry wing** doctrine above is deliberately the expensive case: eighteen marks of horse, and the picture shows you it was paid for out of the line.

#### The proportion contract

`verify-ground-scale.mjs` exists because this fault has now returned three times. Every prop's first line is `unitScale('<key>', scale)` and the `DRAWN` values are measured, never guessed. A rider added without its own row inherits `figure`'s correction and comes out at a footman's height on a horse.

#### The regression fingerprints

`verify-modes-regression.mjs` pins a 60-tick fingerprint per mode. Nothing in this proposal touches the simulation — no new `Math.random` call, no changed call order — so those fingerprints must come back **unchanged**, and if they move, something in the drawing has reached into state.

#### The scarcity law

Sỏi son is the player's banner, the player's seal, the player's losses. The Song plume is red in every source and it is drawn here in nâu, because a red plume on eleven enemy soldiers would spend the one colour the whole palette is built around reserving.

Gates

## How this gets graded

`npm run build` clean · `smoke.mjs` 15/15 · `verify-ground-scale.mjs` 10/10 with new rows for rider and elephant · `verify-battle-scale.mjs` 6/6 at 3.4–5.0 px per metre across the field · `verify-modes-regression.mjs` unchanged · `measure-render.mjs` before and after, on a block of cavalry specifically · and `shot-battle-open.mjs` at era 1 and era 4, **looked at**, not merely generated.

The test is whether you can name the enemy before you read the label. If you can't, the crown is wrong and no amount of colour will save it.

Companion to *Three Breaths of Battle* — the fight screen rebuild. Figures on this page are generated at load from the proposed slot table; nothing is a stored image.

Reference: Đạt H. Võ, *Timeline of Vietnamese army costume* (`docs/resources/army/`). Champa marks from Trà Kiệu and Đồng Dương relief conventions. Song, Yuan, Ming and Qing helmet forms are stylised to the game's eight-mark budget, not reconstructed.