# The gameplay trailer

A ~68-second vertical trailer for Vạn Thắng, 1080×1920, cut from the game as it is actually played.

It replaces `scripts/promo`, the drawn film that stood here before — the game's own ink primitives
running outside Phaser through a Canvas2D shim, a cinematic that booted no game. (It is in the
history if it is ever wanted again: `git log -- scripts/promo`. The reusable half was `inkCanvas.ts`,
an eleven-method stand-in for `Phaser.GameObjects.Graphics` that let anything under `src/ui/ink/`
draw into a 2D context.) This one is the opposite: it boots the game, stages a real run, and
photographs it. Nothing in it is a mock-up — every province, card, champion, host and number on
screen was produced by the simulation that produces them in play.

## What it shows

| | cut | |
|---|---|---|
| 1 | **the country** | the realm at 1.15×, drifting, the season turning under the camera |
| 2 | **the realm** | the whole map wide — forty-two provinces |
| 3 | **where do we press** | the conquest card, answered on screen |
| 4 | **choose your power** | the fan browsed across all four, the middle one lifted out |
| 5 | **the court** | three champions flicked through, one lifted and posted |
| 6 | **build** | the works sheet, and what expansion costs |
| 7 | **the invasion** | the host at the walls, and a thumb on the lit Battle button |
| 8 | **the field** | both hosts ranked in the shapes they hold |
| 9 | **the five shapes** | the counter to what they are re-forming into, tapped |
| 10 | **the tempo dial** | Press, and the price of it |
| 11 | **the Chronicle** | an illustrated beat out of real history |
| 12 | **the front page** | the end card |

## Running it

Needs a dev server and an ffmpeg. ffmpeg is deliberately **not** a dependency of this repository —
70 MB of binary to cut one marketing asset — so install one wherever and pass it.

```sh
yarn dev                                                   # 5179, or pass --url
node scripts/trailer/build-trailer.mjs                     # capture, compose, encode
node scripts/trailer/build-trailer.mjs --stage compose     # re-letter without recapturing
node scripts/trailer/build-trailer.mjs --stage gif         # rebuild the README's GIF
node scripts/trailer/build-trailer.mjs --only shapes,press  # one chapter, while tuning it
```

`--stage` splits the work into three because the captions get rewritten far more often than the
gameplay gets recaptured: `capture` drives the game into `out/raw`, `compose` crops, letters and
dips into `out/composed`, `encode` makes the mp4. A full run is about nine minutes; a re-letter is
two.

The sidecar `out/raw/specs.json` records only what the capture alone knows — which cut a frame
belongs to, how far into it, and where a thumb went down. **The lettering is not in it.** It was
once, and that quietly made `--stage compose` a lie: a rewritten line re-composed with the *old*
words, because the old words were in the sidecar.

## The screens that have to be *handled*

Most of this film reads from a single frame. Two do not, and they are the two the game is most often
accused of being: a card screen. A still of the draft says the game has cards; a hand crossing all
four and lifting the middle one says the game is *played* — and the description panel above changes
with every card the browse passes, which is the draft's whole readout. Same for the summon: two
sideways flicks through the three who answered, the dots counting them off, then a lift on the one
taken, and the court immediately asks where they will serve.

Those are real gestures against the game's own thresholds, not animations laid over a screenshot:

| | reads | takes |
|---|---|---|
| `CardFan` (the draft) | raises on `pointerover` — a mouse crossing it is a thumb sliding across it | an upward flick of **44** design units that beats its own sideways drift |
| `CardStack` (the summon) | a sideways drag of **52** advances the deck | a lift of **58** that beats its own sideways travel |

A gesture cannot be done between two frames the way a tap can: the browse *is* the pointer crossing
four cards and the flick *is* the distance travelled before release, so both are laid on the
timeline as a pointer track — one move per captured frame — and play on camera. See `gestureTrack`.

## The voice

The captions are a king's account of his own reign, not a list of what the game does. *I was given
one citadel. The country would not wait. My ministers asked me where we should press. Three answered
the call; the treasury could pay one. Then the north came down, the way it always does.* It closes
on the only honest thing a roguelite can promise — *there is no winning this, only how far I got.*

This is deliberate and it is worth keeping. A trailer that narrates its own feature list asks the
viewer to evaluate a product; one that speaks from inside the fiction asks them to want the reign.
The screens underneath are already saying what the systems are — the card says *Summon a Champion*,
the dock says *SPEARS · CHARGE · SPREAD*, the header says *INVASION 8 · LIVE* — so a caption that
repeats them in different words is spending the only three seconds it has on something the picture
already did.

| file | |
|---|---|
| `game.mjs` | staging a run — boot, freeze, advance, frame, settle. Lifted from `test_scripts/shot/shot-readme.mjs` |
| `film.mjs` | the twelve cuts: what each one stages, how the camera moves, what it says |
| `build-trailer.mjs` | the driver: pages, the frame loop, the taps, the compositor, ffmpeg |
| `compose.html` | the lettering, in the game's own paper and type |

## The two things worth knowing before editing

**The game is cranked, not recorded.** Headless Chromium rasterises through SwiftShader and cannot
draw this game in real time at 1170×2080 — a live capture would be a slideshow, and a slideshow
whose framerate depends on what else the machine was doing. So the driver stops Phaser's rAF loop
and hands the game its own clock: `game.step(clock += 1000/30, 1000/30)`, one call per frame of
film. Tweens, timers, the season cross-fade and the ascent tick accumulator all run off that delta,
so a frame that takes 300 ms to draw still lands on the timeline at exactly its own thirtieth of a
second. Everything downstream depends on this. The moment anything in a cut reads a wall clock, the
film stops being reproducible.

Because the clock is stopped, **nothing settles on a timeout**. `settleCranked` cranks frames and
watches the scene's own chunk counters go quiet; a `waitForTimeout` here waits on a page that is
not drawing.

**The capture surface is exactly the output aspect, so there is no room to zoom.** A 360×640
viewport at 3.25× is 1170×2080 device pixels, and the game's variable design height resolves to
390×693 there — a 9:16 sheet, which is why the trailer is full bleed with no letterbox. The
compositor's `zoom` therefore crops real content: at anything above 1.0 the action bar loses its
labels off the bottom edge. The push-in that was here originally is gone for that reason. Camera
movement is the *game's* camera, panned by scroll, which costs nothing and re-bakes nothing.

## The traps this hit, so the next person does not

- **`coachBounds` is on `scene.battleUi`, not on the scene.** Read off the scene it is `undefined`,
  every tap in the fight reports "no target on screen", and the trailer photographs a battle nobody
  is playing.
- **A defence nobody was posted to has no commander**, and the header says so in a grey box where
  the face goes. Correct, and not what the trailer is claiming — so the battle page posts the
  province's commander the way `defenceCommanderOf` looks for one.
- **`advance()` sinks the tick accumulator to `-1e9`.** That is right for a still photograph and
  fatal for a film: the country never ticks again. The run page resets it to 0.
- **The season cannot be pinned.** It is derived from the turn, so setting `state.season` before a
  cut only decides where the cut *starts*. Cuts that let the world run start in Summer so the one
  tick they contain turns the leaves rather than landing in a bare winter.
- **A wide shot of a fogged country is a picture of nothing** — the unexplored provinces wash out
  to bare paper. The wide cut reveals.
- **The four slots that print something else over the country**: the wave banner's queued cue, the
  story ledger, a resolved fight's Reckoning, and the whispers. None of them is touched by clearing
  the prompt queue. `advance()` clears all four; see the same list in `shot-readme.mjs`.

### And the five the fight chapter cost, which were all the same shape

Every one of these made the battle cuts photograph something other than a battle, and none of them
reported anything. They are listed in the order they were found, because each hid the next.

- **A fight opens *held*.** The drum falls, the formation strip is ringed in red, and the beat clock
  does not start until the first order. The real chips call `resumeBattleForOrder()` on the way to
  emitting `ui:battle-order`; emitting the event alone gives the order and leaves the fight standing
  at round 0 for as long as you care to film it.
- **`boot()` sinks `ascentAccumulator` to `-1e9`** and only the *non*-battle branch of `advance()`
  restores it. The battle page has to do it itself, or the world never takes another tick — and the
  fight is driven by the economy tick, in bursts of `BATTLE_BEATS_PER_TICK`.
- **Answering a prompt in state without emitting `state-changed` leaves the card drawn.** The screen
  shows a card that no longer exists, over a fight that is running fine underneath. Nothing reports
  it, because as far as the drain is concerned there is no prompt pending. This one cost two full
  render cycles.
- **A card arriving also closes the lane**, so answering it is only half the repair. There is no
  honest test for "is the fight on screen" via `battleUi` — it is a record and it outlives the page
  it describes. The live test is `battleUi.orders.scene`: a destroyed container has none.
- **Ordering the shape the host already holds is a real order that changes nothing on screen.** Each
  shape beats the two that follow it round the ring, so there are always two answers to theirs; take
  the one that is not the shape we are standing in, or the film shows a thumb going down and the
  ranks not moving.

Two more, cheaper:

- **Several cards are answered by *holding*, not tapping** — "Hold a card to choose it" is printed on
  the conquest sheet. The press goes down on the timeline and the release is scheduled a beat later,
  so the fill that runs round the card plays on camera.
- **`HELPERS` is a template literal.** A nested backtick closes it — including one inside a comment.
  Twice.
- **The caption plate has to end on a seam, and there are two of them.** The map and the prompt
  screens carry two rows — resources, then the power strip — and the seam is at 272. The fight
  carries one row and starts its commander plate straight under it; so does a *lane page*, whose
  own title begins at 210. Both of those want 140. One height for all three put a sawtooth through
  the middle of `POWER · INVASION · THREAT`, and then through the Build lane's subtitle. Hence
  `band: 'hud'` and `band: 'top'`; the short one holds a single line, which is better writing over
  a fight anyway.
- **Answering a card takes three things, not one.** Answer it in state; emit `state-changed` or the
  shell never hears and the card it drew stays up; and then **redraw**, because `page.screenshot`
  captures the canvas as last rendered and nothing has rendered since. Miss the third and a card
  raised by a tick is photographed for the two or three frames between its arrival and the drain —
  a modal that opens and shuts in a tenth of a second, which is what it looks like. `closeOverlay`
  takes the sheet down synchronously; `game.step(clock, 0)` redraws without advancing the world.
  Worth scanning for: a flash is a frame whose JPEG size differs from *both* its neighbours, so
  `os.path.getsize` over `out/composed` finds them all in a second.
- **The plate belongs to the *run* of captions, not to one line.** Deriving the paper from the
  active caption's own alpha means that at a hand-over between two lines it follows the outgoing one
  down to nothing and snaps back for the incoming one — one frame of bare screen between two lines
  that are meant to be on the same sheet, which reads as a hard flicker. The lettering cross-fades;
  the plate ramps only at the two ends of the run. Captions need a gap of at least 0.7 s for the
  text to hand over cleanly and no more than 1.5 s or they stop being one run.
- **Do not animate the plate by sliding the plate.** The obvious version — bring the whole thing
  down from above the top edge — reintroduces the seam bug as motion: for the five frames its
  bottom edge is travelling, that edge is across the resource row, and any frame caught then shows
  the header cut in half with its top under paper. The plate arrives at its seam over three frames
  and stays; the *lettering* slides down inside it behind a clip. Same read, and the edge never
  crosses anything.

### Auditioning the fight

A defence is only a chapter if it *lasts*, and most do not: the first fight this film used was over
in seven seconds of game time because the province simply fell, so two of the three battle cuts
photographed the map with a notice on it. The realm and the fight are therefore seeded separately —
`20260901` at 65 ticks for the country, `1337` at tick 60 for the field, the latter chosen by
driving five seed/tick pairs to exhaustion and taking the one that runs past forty seconds with two
hosts a side. If a balance pass moves the numbers, re-audition rather than nudging them.
