> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Vạn Thắng FPS Playbook

Vạn Thắng FPS Playbook

Render performance · frame rate · every device · Phaser 4.2.1

# Vạn Thắng FPS Playbook

The frame budget each class of phone actually has, where the map, the HUD and the fight stand against it today, and the render architecture — ink stamping, one paper pass, a measured quality ladder, frame pacing — that gets the game to a steady 60 on mid-tier phones and a locked 30 on the low end. Size and startup are out of scope here by design.

**2026-08-24** · main @ c1fc551

companion to the [Frame Ledger](https://claude.ai/code/artifact/b73ec88a-542d-486a-a6ac-4641ca58a5ba)

measured at **4× CPU** = mid-tier proxy

target **60 fps mid · 30 locked low**

1. I[The target: budgets per device](#target)
2. II[Where each screen stands](#standing)
3. III[What limits the frame rate, ranked](#limits)
4. IV[The render plan](#plan)
5. V[Expected frame rate after each step](#outcome)
6. VI[Proving it on devices](#prove)

I

Part I

## The target: budgets per device

“Smooth” is a p95, not an average: 95% of frames inside the budget, no frame over 50 ms, and a cadence the panel can repeat. The budget depends on the device class and on its refresh rate.

| Class | Reference devices | CPU vs this desktop | GPU · DPR · panel | Frame budget | CPU share | What smooth means |
| --- | --- | --- | --- | --- | --- | --- |
| **High** | iPhone 14–16, Pixel 8–9, Galaxy S23–S25, iPad | 1.5–2× | Apple A16+/Adreno 740 · DPR 3 · 60–120 Hz | 8.3 / 16.7 ms | ≤ 6 / 10 ms | 60 fps locked; 120 only where it is free (cap at 60 otherwise) |
| **Mid** | Galaxy A54 / A35, Pixel 7a / 8a, iPhone 11 / SE 3, Redmi Note 13 | 3–4× | Mali-G68 / Adreno 6xx / A13 · DPR 2.6–3 · 60–120 Hz | 16.7 ms | ≤ 10 ms | 60 fps at p95 on the map and the fight; ticks and beats never over 50 ms |
| **Low** | Galaxy A15 / A05, Redmi 9A / 13C, Moto G24, iPhone 8 / SE 1 | 6–9× | Mali-G52/G57 MC1–2, PowerVR GE8320, A11 · DPR 2 · 60 Hz · 2–4 GB | 33.3 ms (locked 30) | ≤ 22 ms | a steady 30 — every frame on a 2-vsync cadence — beats an unstable 40 |
| **Desktop** | this machine (RTX-class, 120 Hz) | 1× | discrete GPU · DPR 1–2 · 60–144 Hz | 8.3 / 16.7 ms | — | reference only; never the thing to optimise for |

CPU multipliers follow Chrome's calibrated presets (mid-tier ≈ 3.6–3.7×, low-tier up to 9–14×) and the 2025 csswizardry reference devices. Chrome's own caveat applies: CPU throttling under-reports GPU-bound work by 2–3×, so fill-rate costs (pixels × passes) must be read from a real phone. The “CPU share” column keeps ~6 ms of each frame for the browser's compositor and input.

#### The four rules the plan is written against

1. **Judge by p95 and by the worst frame.** A 100 ms hitch every two seconds is “59 fps average” and feels broken. The beat, the tick and the season turn are frames too.
2. **Cap above 60, lock at 30 below it.** Android phones run rAF at the panel rate (90/120 Hz); rendering 120 frames a second of a game that ticks every 3.5 s is wasted heat. On the low tier a locked 30 (one render per two vsyncs) is smoother than 35–50 wobbling between cadences — Android's frame-pacing guidance is explicit that “short frames followed by long frames are perceived by the player as stuttering”.
3. **Pixels are quadratic, passes multiply.** Scale 3 is 9× the pixels of scale 1; every full-screen pass (paper filter, framebuffer composite, clear) is charged at that size. Tiled phone GPUs flush on every framebuffer bind.
4. **Let the device decide.** `deviceMemory` and `hardwareConcurrency` cannot tell an A15 from an A54 and iOS hides both; a measured p95 can. The tiers exist; they need a sampler.

II

Part II

## Where each screen stands

Measured today on the live build. The 4× CPU throttle stands in for a mid-tier phone; headed rows are this machine's GPU and show the fill cost, headless rows are software-rasterised and show the CPU cost. Then: the floor — what a frame costs when the live ink is hidden, which is the number the plan is aiming at.

### 1 · Frame time today, mid-tier proxy (4× CPU)

| Screen · tier | Headed p50 / p95 | ≈ fps | Headless p50 | Indices / frame | Upload / frame | Draw calls (phone) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Classic map, fresh · low | 8.4 / 16.8 | 60+ | 37 | 28,482 | 391 KB | 42 | fine — and the cheapest state the game has |
| Classic map, fresh · high (FX) | 24.8 / 33.4 | 40 | 23 | ~85k | ~1.2 MB | — | GPU-bound on the desktop already; the paper pass is ≥ 8 ms of it |
| Classic map, **revealed** · low | 33.3 / 41.6 | 30 | 41–43 | 66,061 | 904 KB | 45 | CPU-bound: settlements, labels, armies in view |
| Classic map, **revealed** · high (FX) | 66.7 / 83.4 | 15 | 78–82 | 134,698 | 1.84 MB | — | both bound: 2× the geometry (threshold in buffer px) + 9× the pixels + 2 filter passes |
| Dragon Ascent map in play · low | ≈ 33 | 30 | 45–58 | 150,071 | 2.05 MB | 72 | 2.3× the classic map's live ink; the world is drawn under full-bleed prompts |
| Dragon Ascent map in play · high (FX) | — | ~15–20 | 75–81 | 196,763 | 2.69 MB | — | heaviest steady-state screen in the game |
| Fight screen, 2.4k vs 4k men | — | ~25–40 | ~40 (10.7 at 1×) | ~60,000 | ~840 KB | 139 | hosts are 80–86% of render CPU; every Text a draw call on phones |
| Fight screen, 9k vs 12k men | — | ~5–8 | ~195 (48.8 at 1×) | ~250k | — | — | 382 figures × 1,150 commands per frame |
| Fight screen, **one beat** | 85 p50 / 204 worst | hitch | — | — | — | — | 1.2–2.1 times a second; was 23–33 ms after the August fix |
| Front page (menu) | 26 (headless) | ~38 | 26 | — | — | 47 | 71 Graphics, 126k commands, 28 infinite tweens — the battery screen |

Indices and upload bytes are exact (counted at `gl.drawElements` / `gl.bufferSubData`) and transfer to any device; milliseconds are ratios. “Draw calls (phone)” is measured with Phaser's mobile default of one texture per batch. The revealed map and the Ascent map in play are the states players live in; the fresh map is what every earlier benchmark measured.

### 2 · The floor: the same frames with the live ink hidden

Hiding every visible `Graphics` in the world scene (settlements, armies, traffic, accents, flags — the things the plan turns into stamped images) and re-measuring gives the lower bound the plan can reach. Images would add back a few hundred quads; the CPU cost of those is a fraction of a millisecond.

| Screen · tier (4× CPU, headless) | Base p50 | World Graphics hidden | Saving | All Graphics hidden | Indices base → floor | Upload base → floor |
| --- | --- | --- | --- | --- | --- | --- |
| Classic map, revealed · low | 41.2–43.4 ms | 8.5 ms | −80% | 1.6 ms | 66,061 → 8,037 | 904 → 111 KB |
| Classic map, revealed · high | 77.7–81.6 ms | 9.4 ms | −88% | 3.0 ms | 134,698 → 14,666 | 1,843 → 202 KB |
| Dragon Ascent map · low | 45.4–58.2 ms | 8.1 ms | −83% | 8.5 ms | 150,071 → 11,928 | 2,053 → 165 KB |
| Dragon Ascent map · high | 74.9–80.8 ms | 11.8 ms | −85% | 4.1 ms | 196,763 → 15,977 | 2,692 → 220 KB |
| Fight, 2.4k vs 4k (unthrottled) | 10.7 ms | 1.9 ms (hosts hidden) | −82% | 0.3 ms (chrome only) | — | — |
| Fight, 9k vs 12k (unthrottled) | 48.8 ms | 6.8 ms | −86% | 0.5 ms | — | — |

Read the floor as “the CPU frame when the world's ink is images”: 8–12 ms at 4× throttle, i.e. 60 fps on a mid-tier phone with room for the GPU, and ~16–24 ms on a low-tier phone — inside a locked 30. The remaining 8–12 ms is the UI's own live Graphics (cards, bands, buttons: see the “all Graphics hidden” column) and the engine's fixed cost, which Part IV §1 also stamps.

III

Part III

## What limits the frame rate, ranked

Seven limiters, in the order they cost frames. The first is 80–88% of every steady-state frame; the second decides whether the high tier is possible at all; the third is what “laggy” means to a player.

1 · Live ink replay (CPU)revealed map, Ascent map, hosts

80–88%

2 · Pixels × passes (GPU)scale 3 + two paper passes

≥ 8 ms @3×

3 · Rebuild hitchesbeat 85 · tick 46 · season 700–1400 · modal 190

> budget

4 · Garbage12–16 MB per frame

2–3% + pauses

5 · Draw calls on phonesone texture per batch; every Text a call

45–139

6 · Idle tweens & culling gaps100–200 tweens off-screen; accents; world under overlays

small, steady

7 · No frame cap, soft clock120 Hz renders; smoothDelta stretches the tick

battery, drift

**1 · Live ink replay.** A Phaser 4 `Graphics` is replayed every frame: every fill is earcut again, every stroke segment becomes a fresh quad, every vertex a fresh `Point` object, and the whole lot is uploaded with `bufferSubData`. The revealed map submits 61.7k commands (one settlement cluster is 26.8k), the Ascent map in play 155k, two mid-sized hosts 125k. V8 profiles put 75% of the frame in the replay and the batchers; hiding the world's ink removes 80–88% of the frame. Nothing in the game's own code is above 4%.

**2 · Pixels × passes.** Scale 3 is 2.96 Mpx. Both MapScene and UIScene carry PaperFX as an external camera filter, so each frame is two scene renders into pooled framebuffers, two full-screen passes of a 12-`sin`-per-pixel shader, two composites, four framebuffer binds — and MSAA is lost for everything drawn through them. Headed A/B at scale 3: 24.8 ms with the filter, 16.6 (vsync) without, on a desktop GPU; a phone GPU is several times slower per pixel. On top of that `pathDetailThreshold` is measured in buffer pixels, so scale 3 also submits twice the geometry of scale 1 for the same art.

**3 · Rebuild hitches.** A beat on the fight screen is 85 ms p50 (204 worst) at 4× because the orders dock is rebuilt on 70% of beats (17–49 Texts, 25–73 Graphics, 65–106 text rasterisations) and every block redraw re-inks its figures; the classic tick is 46 ms; the season turn re-inks the scatter, rebuilds every visible settlement and re-composites the bake every 7–11 s (0.7–1.4 s on a revealed map); a tap in the build modal is 190 ms; the HUD rebuilds ~20 chrome objects with 8–17 new Texts per tick (29–39 ms in empire mode); and after N runs in a session every one of these happens N times because scene-event listeners are never removed.

**4 · Garbage.** 12–16 MB of short-lived objects per frame from the replay — a young-generation scavenge every one or two frames, 3–5× longer on a phone. It is 2–3% of self-time on the desktop and a source of 2–6 ms stalls on a mid-tier phone; it disappears with limiter 1.

**5 · Draw calls.** Phaser's `autoMobileTextures` gives phones one texture unit per batch, so every `Text` (its own canvas texture) is its own draw call: 139 on the fight screen, 72 on the Ascent map. Not yet the bottleneck (Arm's guidance is < 500) but it compounds with Graphics ↔ Text ↔ Rectangle interleaving in the HUD, which flushes the batch per control.

**6 · Idle tweens and culling gaps.** Flags, army ranks, buffalo and badges keep tweening when culled (100–200 on a developed map); season accents are a whole-map live layer in Spring and Winter (500–700 circle fills per frame); badges, arrows and highlights are never registered with the cull index; the founder pick and the throne hall draw the whole map underneath them (the fight lane correctly hides it).

**7 · No cap, soft clock.** There is no `fps` config: a 120 Hz phone renders 120 frames a second. And Phaser's `smoothDelta` replaces any frame over 200 ms with the last sane delta, so on a device that is already behind the game clock runs slower than wall time and the tick stretches — the hitch hides itself.

IV

Part IV

## The render plan

Eight pieces. The first is an architecture — one cache that turns any deterministic ink into a stamped image — and everything else uses it. Order matters: stamping first, then the paper pass, then the ladder; the hitch fixes can run in parallel.

### 1 · InkStamp: one cache for every piece of deterministic ink

All of the game's ink is drawn by seeded, pure functions of a few parameters — a figure is `(theme, tier, arm, seed)`, a card surface is `(w, h, variant, pressed, seed)`, a settlement cluster is `(land, season, buildings)`. That is exactly the shape a texture cache wants. The map already does this once, in the large (`bakeStaticTerrain`), and the buffalo do it in the small (`bakeProp` in `sprites.ts`); the plan generalises the small one.

```
// src/ui/ink/stamp.ts — sketch
type DrawFn = (g: Phaser.GameObjects.Graphics) => void;

const SUPER = 2;                                  // bake at 2× and downscale: the FBO has no MSAA
const PAGE = 2048;                                // one DynamicTexture page = 16 MB RGBA; 4096 where MAX_TEXTURE_SIZE allows
const pages: Phaser.Textures.DynamicTexture[] = [];
const frames = new Map<string, { page: number; name: string; w: number; h: number; draw: DrawFn }>();
const shelves: ShelfPacker[] = [];                // simple shelf/guillotine packer per page

export function stamp(scene: Phaser.Scene, key: string, w: number, h: number, draw: DrawFn): { texture: string; frame: string; scale: number } {
  const k = `${key}@${RENDER_SCALE}`;
  const hit = frames.get(k);
  if (hit) return { texture: `ink-${hit.page}`, frame: hit.name, scale: 1 / (RENDER_SCALE * SUPER) };
  const pw = Math.ceil(w * RENDER_SCALE * SUPER) + 2, ph = Math.ceil(h * RENDER_SCALE * SUPER) + 2;
  const { page, x, y } = allocate(scene, pw, ph);   // opens a new page when the shelves are full
  const g = scene.make.graphics({ x: 0, y: 0, add: false }).setScale(RENDER_SCALE * SUPER);
  draw(g);                                          // the same seeded draw code the live path uses today
  pages[page].draw(g, x + 1, y + 1);                // one RT draw: costs what one frame of that ink costs, once
  g.destroy();
  pages[page].add(`${k}`, 0, x + 1, y + 1, pw - 2, ph - 2);   // Texture.add works on a DynamicTexture
  frames.set(k, { page, name: k, w: pw, h: ph, draw });
  return { texture: `ink-${page}`, frame: k, scale: 1 / (RENDER_SCALE * SUPER) };
}

// context loss: the pages go black. Keep the DrawFns, clear the packer, and re-stamp lazily on 'restorewebgl'.
renderer.on('restorewebgl', () => { for (const f of frames.values()) dirty.add(f); });
```

- **What a caller does:** `const s = stamp(scene, 'figure:dong-ho:2:spear:7', 26, 34, g => figure(g, …)); scene.add.image(x, y, s.texture, s.frame).setScale(s.scale)`. A figure becomes one quad in the Quad batch — it batches with every other stamp on the same page and with Text, and costs two matrix multiplies and 112 bytes per frame instead of 1,150 commands.
- **Variation survives.** Seeded wobble is part of the key: stamp 2–3 seeds per kind and pick by instance; keep per-instance jitter as position offsets and the facing flip as `scaleX = -1` (what `faceTravel` does already). The eye cannot tell a re-used wobble at 26 px.
- **Animation survives.** `marchInPlace` tweens a rank's `y`; it works unchanged on a Container of stamped Images. Flag cloth, bobs and slides are transforms, not redraws.
- **Edges.** Baking at 2× and displaying at ½ gives the anti-aliasing the FBO lacks; `bakeBattleGround` already does this with `SUPER = 2` and it reads well.
- **Memory.** One 2048² page is 16 MB. Budget per tier: low 1 page (scale 1 — stamps are small), medium 2, high 3; evict by LRU per run. Stamps for a given `RENDER_SCALE` are only valid at that scale, which is fine because the scale is fixed per session today (§6 discusses changing it).
- **Draw-call effect on phones.** One page = one texture = one batch entry even with `autoMobileTextures`. Put the HUD's surfaces and the map's stamps on the same page where they fit and the alternating Graphics/Text/Rectangle flushes stop.

#### Apply it in this order

1. **Soldiers** (fight screen and map army markers): a few hundred kinds, ~30×40 design px each — one page at high, a quarter of one at low. Removes 80–86% of the fight frame and the per-beat block re-inking (`redrawHostBlock` becomes a handful of image moves). Keep the footprint wash and the standards as stamps too.
2. **Settlement clusters**: stamp each node's 1–8 cluster layers at creation (keyed by land, season, building set) and the capital ring; keep the buffalo Images and the label Text live; the label backing becomes a 9-slice. Removes ~60–68% of the revealed map's geometry. Then drop `state.season` from the node signature: a season turn re-stamps the grove layer and re-letters the label instead of rebuilding the node.
3. **Cards, buttons, panels, bands, cartouches** (`printedSurface`, `panel`, `drawButtonSurface`, `sawtoothBand`, `heronMeter`, `drawCartouche`): keyed by `(w, h, variant, pressed, seed)`; 9-slice the variable-width ones. Removes the 8–12 ms of UI ink that is left after the world is stamped, and the HUD's 20 extra draw calls.
4. **Small live ink**: fog puffs, coin glyphs, seals, cart wheels, farmer heads (each circle is a 101-point arc today) — stamps with the drift tween on the Image.
5. **Portraits**: one composite stamp per hero (cartouche + the 17 part Images) for roster rows and cards — the map badge already does this with a RenderTexture.

What stays live, on purpose: Text (until a BitmapText digit strip exists for counters), the rails and arrows that change shape every frame, the selection and highlight outlines, and anything zoomed past 2× where a vector edge still looks better than a stamp — the map's `mapZoom` tops out at 1.65, so nothing on the map qualifies.

### 2 · The map's bands after stamping

- **Accents into the bake.** `paintAccents` (Spring blossoms, Winter ellipses) joins the decoration layer that `rebakeScenery` already repaints each season — it stops being a whole-map live layer.
- **The season turn becomes a stamp swap.** With nodes no longer rebuilt and cast rings replaced by a radial stamp drawn via `rt.draw`, the turn is: repaint scatter → one bake → re-stamp groves → re-letter labels. Target ≤ 250 ms at 4× on a revealed map, down from an estimated 0.7–1.4 s.
- **Per-band invalidation stays.** The six signatures are right; the expensive bands just get cheaper. If a later measurement shows the single static RT re-composite (~50 sources) as the remaining hitch, split decoration into its own RT — +15 MB at medium — so an ownership change re-composites only control and zones.
- **Cull the rest.** Register badges, destination arrows and the army highlight with `ViewIndex`; pause the tweens of culled flags, ranks, buffalo and badges the way `TrafficRenderer.setCulled` does; hide the world under every full-bleed prompt, not only the fight lane.
- **High tier looks like high tier.** The bakes are one design unit per texel and are magnified 3× at high. Once stamping has bought the headroom, bake at `bakeScale × min(RENDER_SCALE, 2)` where `MAX_TEXTURE_SIZE` allows (4488×6060 fits 8192; guard it), or accept 1.5× — today the expensive tier shows a soft map under crisp labels.

### 3 · The fight screen

- Hosts as stamps (§1.1). Block redraws move images; the formation-change path redraws only the side that changed.
- The orders dock is written into, never rebuilt on a beat: take `lastBeatLoss`, `landedBeat` and `stamina.nextIn` out of the signature and update the three readings in place; rebuild exits only on `delegated`/`halted`.
- The field is built once per fight; the seal and the drum redraw the enemy block only.
- `drawBattleRails` once per frame (one counter tween, four values in one `onUpdate`); volley arrows as a short-lived stamped trail rather than a per-frame `clear()` + redraw.
- Under the sheet: skip the hidden map's host-marker rebuilds while the lane is open, and stop running `advisor.render`, `resourceBar.refresh`'s unguarded `setColor`s and `renderInspect` for chrome that is covered.
- Fix the zombie clock and the listener stack first — on the third arena fight every order tap is nine refreshes.

Target: a beat under 25 ms at 4× with zero Text creations on a quiet beat; a steady frame under 4 ms at 4× for 2.4k/4k and under 12 ms for 9k/12k.

### 4 · Pixels and passes: one paper, or none

Three steps that can ship independently, each measured on a device with `?nofx=1` as the control:

1. **Cheaper shader.** Replace the three `valueNoise` evaluations (12 `sin` per pixel) with one sample of the 512² laid-paper tile `ink/paper.ts` already bakes; keep the vignette as arithmetic. Same look, a quarter of the ALU.
2. **One pass, not two.** Remove the filter from the world camera and keep it on the UI camera only — the UI scene renders last, covers the canvas, and its framebuffer already contains the map below. Halves the framebuffer round-trips.
3. **No pass.** Replace the filter with two multiply-blended textured quads at the top of the UI scene — the paper tile as a `TileSprite` (its drift is a slow `tilePosition` tween) and a vignette/tea-stain gradient Image. Zero framebuffers, one blend-mode flush, and the canvas's own MSAA is back for every vector edge. The per-pixel grain becomes a multiply rather than a mix; tune the tile's contrast to taste.

Per-tier policy after step 3: low = scale 1, no paper; medium = scale 2, paper overlay; high = scale 3, paper overlay, only where the ladder (§6) measures headroom. Never two filtered cameras again. With every camera unfiltered, `antialiasGL` matters once more — keep it on at scale 1, try it off at scale ≥ 2 where the pixels are dense enough, and decide by eye.

### 5 · Frame pacing and the clock

- `fps: { limit: 60 }` in the game config (Phaser 4.2's `stepLimitFPS`: rAF still fires every vsync, the game steps at most 60 times a second). 120 Hz phones stop rendering frames nobody asked for.
- On the low tier — and on any device the ladder demotes — `game.loop.setFPSLimit(30)`. A locked 30 on a 60 Hz panel is a clean 2-vsync cadence; movement code already uses `delta`.
- The front page at 30: nothing on it needs 60, and it is the screen that drains the battery while the player reads.
- Detect iOS Low Power Mode by measuring the idle rAF interval (≈ 33 ms on a 60 Hz iPhone means throttled) and budget for 33 ms instead of fighting it.
- Make the tick clock honest: accumulate `min(time - lastTime, 250)` from the rAF timestamp instead of Phaser's smoothed `delta`, so a 400 ms refresh costs the clock 400 ms, not 17 — the stretched tick on slow devices is a symptom worth being able to see.

### 6 · The quality ladder, driven by measured frame time

```
// src/game/qualityLadder.ts — sketch
const RUNGS = [
  { scale: 3, paper: true,  bake: 1.0,  scatter: 1.25, lod: undefined, fps: 60 },   // high
  { scale: 2, paper: true,  bake: 0.75, scatter: 1,    lod: 0.85,      fps: 60 },   // medium
  { scale: 2, paper: false, bake: 0.75, scatter: 0.8,  lod: 0.85,      fps: 60 },
  { scale: 1, paper: false, bake: 0.5,  scatter: 0.6,  lod: 0.85,      fps: 60 },   // low
  { scale: 1, paper: false, bake: 0.5,  scatter: 0.6,  lod: 0.85,      fps: 30 },   // low, locked 30
];

// sampler: runs after the first 5 s of a run (JIT warm-up, shader compiles, the opening bake)
const WINDOW_MS = 2500, DOWN_AT = 1.25, UP_AT = 0.6, UP_AFTER = 5;
let deltas: number[] = [], calmWindows = 0;
function onFrame(dt: number) {
  deltas.push(dt);
  if (sum(deltas) < WINDOW_MS) return;
  const p95 = percentile(deltas, 0.95); deltas = [];
  const budget = 1000 / currentRung().fps;            // 16.7 or 33.3; 33.3 when Low Power Mode is detected
  if (p95 > budget * DOWN_AT) { if (++hotWindows >= 2) stepDown(); calmWindows = 0; }
  else if (p95 < budget * UP_AT) { hotWindows = 0; if (++calmWindows >= UP_AFTER) stepUp(); }
  else { hotWindows = 0; calmWindows = 0; }
}
// persist the chosen rung next to mandate:graphics:v1; cap at two steps per session; never step during a bake or a beat
```

**Which rungs change instantly and which wait.** Paper on/off, scatter density, LOD threshold and the fps limit are flags — apply them at once. Bake scale and `RENDER_SCALE` re-size buffers: the drawing buffer (`game.scale.resize`), every camera's zoom, both map RTs, every `Text`'s `resolution` (set at construction — they must be recreated) and the stamp pages. Apply those at a scene boundary — the next fight open, the next modal close, the next run — and show nothing; today they reload the page. The ladder should step down the cheap rungs immediately and schedule the expensive one.

**The first guess still matters.** Keep `defaultGraphicsQuality()` but start a DPR-3 device on the *medium* rung and let the sampler promote it: a phone that shows 60 fps at scale 2 for five calm windows earns scale 3; a phone that cannot hold scale 2 is demoted within 5 s of play instead of after a support email. On iOS, where `deviceMemory` is undefined and `hardwareConcurrency` is 4 on every model, this is the only signal there is.

### 7 · Engine knobs, in the order to try them

| Knob | Set to | Why | Measured / expected |
| --- | --- | --- | --- |
| `render.pathDetailThreshold` | `2 * RENDER_SCALE` | Screen-space point pruning for whatever Graphics stay live; the default 1 buffer px makes scale 3 submit twice the geometry of scale 1 for the same art. | Indices −30–50% at threshold 4, pixel-identical at scale 1 (screenshots diffed). One line. |
| `fps.limit` / `setFPSLimit` | 60 · 30 on low | Cap above 60; lock the low tier to a 2-vsync cadence. | −50% render work on 120 Hz panels; steadier low-tier pacing. |
| `renderer.renderNodes.setMaxParallelTextureUnits` | A/B 1 vs 16 on devices | Phaser's mobile default is 1; the evidence behind it was buffer churn, not unit count. With stamp pages the game has few textures anyway. | Fight 139 → ~65 draw calls if 16 is not slower on the device. |
| `render.antialiasGL` | try `false` at scale ≥ 2 | Saves the MSAA resolve; with all cameras unfiltered (§4.3) MSAA is visible again, so decide by eye. | Bandwidth on non-Arm GPUs; none on Mali. |
| `render.skipUnreadyShaders` | `true`, or pre-touch | First use of each shader variant compiles synchronously — the first paper frame, the first flat batch. | Removes a one-frame hitch at scene start. |
| `Stencil.stencilCompositeCheck` | `false` on `RectClip` | Skips the per-frame subtree walk for nested stencils that never exist here; use a non-inverted 4-rect frame to drop two canvas-sized stencil fills per clip. | Small, steady. |
| Buffer orphaning ([PR #7345](https://github.com/phaserjs/phaser/pull/7345)) | trial via monkey-patch | `bufferSubData` into in-flight storage can stall on phone drivers; the game uploads 0.9–2.7 MB per frame today. | Progressive frame-time decay reported on a Redmi; verify on devices before shipping. |

### 8 · Hitches into writes

- **Listeners off on shutdown** (UIScene, ConquestUIScene, `registerUiEvents`, scroll areas). Everything else in this list is multiplied by N until this is done.
- **The HUD is persistent chrome written into** — the `AscentHud.write` pattern for the bell, menu button, map controls, minimap toggle, mandate bar, empire chips, badges and the land card; `setColor` guarded everywhere; the action bar rebuilt only when its labels change. Target: ≤ 2 text rasterisations and 0 object creations on a quiet tick.
- **Modals reconcile**: keep rows across taps, update text and variants in place; cap or virtualise the 100-row log. Target: a build-modal tap under 20 ms at 4×.
- **Badges and destination markers updated in place**; flags diffed per land; the road curve built after the leg check; `getCityCenter` cached; the O(n²) scatter and paddy scans bucketed — so exploration and ownership changes stop being 300–450 ms frames.
- **Counters throttled**: POWER and stat count-ups at ≤ 15 Hz, or a stamped digit strip; the rails' strength numbers once per frame.

V

Part V

## Expected frame rate after each step

Projections, not measurements: the CPU column scales today's 4× numbers by the class multipliers in Part I; the GPU column is a judgement from the desktop A/B and Arm's guidance. Each row states what it assumes, and Part VI says how to replace it with a measurement.

| State of the tree | Screen | High phone | Mid phone | Low phone | Assumption |
| --- | --- | --- | --- | --- | --- |
| **Today** | Classic map, revealed | 45–60 · 15–25 @high | 30 | 12–18 | 33 ms at 4× headed; high tier adds 2 filter passes at 9× pixels |
| Dragon Ascent map in play | 40–60 | 20–30 | 8–15 | 45–58 ms headless at 4×; CPU-bound |
| Fight screen (2.4k/4k · 9k/12k) | 60 · 20–30 | 25–40 · 5–8 | 12–20 · 3–4 | 10.7 / 48.8 ms unthrottled × class multiplier; plus the 85–204 ms beat hitch on every class |
| Front page | 60 | 35–40 | 15–20 | 26 ms at 4× |
| **After stamping** (§1–3) + threshold + listener fix | Classic map, revealed | 60 (120 capped) | 60 | 30 locked | floor 8.5 ms at 4× + ~2 ms of stamp quads; low tier ≈ 20 ms < 33 |
| Dragon Ascent map in play | 60 | 55–60 | 30 locked | floor 8.1 ms at 4×; founder/throne overlays hide the world |
| Fight screen (2.4k/4k · 9k/12k) | 60 · 60 | 60 · 45–60 | 30 · 25–30 | hosts 1.9 / 6.8 ms unthrottled → 8 / 27 ms at 4×; beat ≤ 25 ms once the dock is written in place |
| **+ one paper overlay**, no filtered cameras (§4) | Any screen · medium (scale 2) | 60 | 60 | n/a (low = scale 1) | no framebuffer round-trips; 1.3 Mpx + one blended quad; MSAA back |
| Any screen · high (scale 3) | 60 | 45–60 → the ladder decides | n/a | 2.96 Mpx of fill; mid-tier GPUs vary 2× between Mali-G68 and Adreno 6xx |
| **+ ladder and pacing** (§5–6) | Every screen, every device | 60 / 120 where free | 60 at p95 | 30 locked, no > 50 ms frames | the device picks its rung within 5 s; the tick clock tracks wall time |

Where a cell says “30 locked” on a low phone, the CPU floor is 16–24 ms at 6–9× — inside a 33 ms frame with room for the GPU at scale 1. The honest unknown is the GPU column for the high tier on mid-tier Androids; only a device run answers it, which is what the ladder exists to do automatically.

VI

Part VI

## Proving it on devices

Two kinds of evidence, kept separate: deterministic counts that run in CI on any machine, and frame-time histograms that only mean something on a phone.

### 1 · Deterministic gates (CI, headless, any machine)

| Gate | Screen · tier | Today | Target | How |
| --- | --- | --- | --- | --- |
| Indices per frame | Classic map, revealed · high | 134,698 | ≤ 30,000 | wrap `gl.drawElements`; DPR 3 + high via `addInitScript`; reveal all lands |
| Indices per frame | Dragon Ascent map in play · high | 196,763 | ≤ 40,000 | resolve the founder prompt first (the beat harness shows how) |
| Indices per frame | Fight screen 2.4k/4k | ~60,000 | ≤ 15,000 | same counter; hosts must be quads |
| Upload bytes per frame | Any screen · high | 1.8–2.7 MB | ≤ 300 KB | wrap `gl.bufferSubData` |
| Allocation per frame | Any screen | 12–16 MB | ≤ 2 MB | CDP `HeapProfiler.startSampling` with GC'd objects included |
| Text creations on a quiet tick / beat | HUD · fight | 8–17 · 17–49 | 0 | count `Text` constructor calls between two emits |
| Text rasterisations on a quiet tick | HUD | 18–46 | ≤ 2 | wrap `Text.prototype.updateText` |
| Listener count after a restart | all | 2, 3, … | 1 | `ui.events.listenerCount('state-changed')` after two `__startBenchGame` calls |
| Beat cost at 4× | fight | 85 ms p50 | ≤ 25 ms | `measure-battle-beat.mjs`, with `buildBattleExits`, `drawBattleRails`, `bakeBattleGround` wrapped too |
| Season turn at 4× | revealed map | est. 700–1,400 ms | ≤ 250 ms | add a revealed row to `measure-bake.mjs` |
| Framebuffer binds per frame | any · medium/high | 4 | 0–2 | wrap `gl.bindFramebuffer` |
| Draw calls per frame, 1 texture unit | fight | 139 | ≤ 60 | `setMaxParallelTextureUnits(1)` in the harness |

The scratch scripts that produced today's numbers (`test_scripts/scratch/`: `gl-counts`, `floor`, `alloc-sample`, `mobile-drawcalls`, `ascent-play-counts`, `census`) are the seed of these gates; promote them into `test_scripts/perf/` with thresholds. Every one of them must run at `deviceScaleFactor: 3` with the high tier forced, and read the server from `BASE_URL`.

### 2 · Frame-time histograms (on a phone)

```
// add to src/main.ts next to the other window hooks — it is the whole device harness
window.__fpsProbe = (seconds = 10) => new Promise((resolve) => {
  const d = []; let last = performance.now(); const end = last + seconds * 1000;
  const tick = (now) => { d.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve(report(d)); };
  requestAnimationFrame(tick);
  function report(d) { const s = [...d].sort((a, b) => a - b); const p = (q) => s[Math.floor(s.length * q)];
    return { frames: d.length, p50: p(.5), p95: p(.95), p99: p(.99), over16: d.filter((x) => x > 16.7).length, over33: d.filter((x) => x > 33.4).length, over50: d.filter((x) => x > 50).length, worst: s[s.length - 1] }; }
});
// plus: new PerformanceObserver((l) => log(l.getEntries())).observe({ type: 'long-animation-frame', buffered: true })  // Chrome 123+, attributes the script
```

Run it from `chrome://inspect` (Android, including the React Native WebView with `setWebContentsDebuggingEnabled`) or Safari Web Inspector (iOS; Timelines → Frames shows the 30/60 fps lines) on four scripted scenes: the revealed map panning for 10 s, the Ascent map through two ticks, a fight through ten beats, the front page idle. Record p50/p95/p99, the over-budget counts and the worst frame, at each rung of the ladder, on four devices:

- **Galaxy A15** (or any Mali-G57 MC2 / 4 GB phone) — the low tier; the target is a locked 30 with no frame over 50 ms.
- **Galaxy A54** or Pixel 7a — the mid tier; the target is 60 at p95 on the map and the fight at scale 2, and the ladder's verdict on scale 3.
- **iPhone 11 / SE 3** — the iOS mid tier: WebGL on Metal, Low Power Mode throttling, the canvas-memory cap.
- **One 120 Hz flagship** — to confirm the 60 cap holds and nothing renders at 120 unless it is free.

What to write down for each: the rung the ladder settled on, the p95 at that rung, the worst frame and what it was (a tick, a beat, a season turn, a modal), and the GPU string from `WEBGL_debug_renderer_info`. That table — four devices × four scenes × the rung — is the acceptance criterion for “smooth on most devices”, and it is the table Part V's projections are waiting to be replaced by.