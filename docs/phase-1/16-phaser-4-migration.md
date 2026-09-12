> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Upgrading Vạn Thắng to Phaser 4

*Investigation and migration plan — 2026-08-22*
*Current: `phaser@^3.90.0` · Target: `phaser@4.2.1` ("Giedi", released 9 July 2026)*

---

## Status — branch `feat/phaser-4`

The migration has been **carried out** on `feat/phaser-4`. What that branch is at:

| Stage | State |
|---|---|
| 1 — `Point` → `Vector2` | **done**, one declaration file instead of 62 call sites (§3.1) |
| 2 — PaperFX + game config | **done**, `tsc` clean, paper pass renders (§3.2) |
| 3a — `RenderTexture.render()` | **done**, all four bake sites (§4.2) |
| 3b — masks → **stencils** | **done at every tier** — the filter port was a dead end; see §4.1a |
| 4 — full regression + perf | **not started** |
| 5 — Canvas decision | **not started** |

**The game boots and runs on Phaser 4.** `test_scripts/gate/smoke.mjs` is 15/15: all four modes
reach their world scene, tick live state, draw a non-blank frame, and log no console errors. The
menu, the map, the diorama, the Dragon Ascent prompts and the ink chrome all render correctly, and
`verify-culling` and `verify-history` pass in full.

**The mask regression is closed** — 2026-08-22, and not by the camera-viewport rewrite §4.1a
proposed. Phaser 4.2 added a `Stencil` game object, which is the real replacement for v3's
`GeometryMask`: a stencil-buffer layer applied in screen space, with no framebuffer round-trip and
therefore no design-size rectangle to fall out of. It clips identically at `RENDER_SCALE` 1, 2 and
3, and costs one rectangle draw where the filter cost a full-screen shader pass per scroll area.
`src/ui/ink/clipFilters.ts` is gone; `src/ui/ink/clipRect.ts` replaces it. Read §4.1a for what the
filter did and why, since the measurement is what ruled the whole approach out.

**The regression shipped**, which is worth recording. It was live on GitHub Pages and reported from
a phone: the History and How to Play pages painting their lists straight over the page title and
the tab row. It did not show in local development, and the reason was not the graphics tier — the
dev server had been started before the upgrade and was still serving **Phaser 3.90.0** out of
Vite's optimizer cache. `Phaser.Filters.Controller` is undefined there, so `PaperFX.ts` threw at
module scope and the game never booted in a fresh tab; a long-lived tab kept running v3 quite
happily. Restart the dev server after a dependency change, and check `Phaser.VERSION` in the page
before trusting that local disagrees with production.

Everything else in this document held: 160 predicted type errors, 160 found; the four bakes went
blank exactly as predicted until `render()` was added.

**Three stale harnesses were fixed on the way**, none of them Phaser-related — they had been failing
against the live game before any of this. `verify-history.mjs` and `shot-history.mjs` looked for a
menu button reading "Real History"/"Sử thật" that is now "History"/"Lịch sử", and `verify-history.mjs`
clicked Back at a hardcoded (44, 24) long after the exit moved to a button at the foot of the page.
Both now find their control by label. Worth knowing that three checks in the gate set had been
green-lighting nothing.

Also on the branch, and unrelated to the engine: the 28 upstream Phaser skills are vendored into
`.claude/skills/` by `yarn skills` (Appendix C.2), and `.mcp.json` carries an opt-in, tokenless
entry for Phaser's Game Agent MCP (Appendix C.1).

---

## 0. The short version

**There is no Phaser 5.** The `latest` dist-tag on npm is **4.2.1**. The published version list runs
`3.90.0 → 4.0.0-alpha.0 … 4.0.0 → 4.1.0 → 4.2.0 → 4.2.1`, and `beta` still points at `4.0.0-rc.7`.
So "latest" means Phaser 4.2.1, and that is what this document targets.

**The migration is small in code and medium in risk.** A dry type-check of the whole of `src/`
against Phaser 4's own type definitions produces **160 errors in 16 files** out of 224 files and
98,588 lines. Of those 160, **145 are one mechanical change** (`Point` → `Vector2` in polygon
arguments) that does not alter a single byte of runtime behaviour.

The real work is not in the compiler errors. It is in four places where **Phaser 4 changes behaviour
without changing a type**, so `tsc` stays silent and the game breaks at runtime:

| # | What silently breaks | Where | Severity |
|---|---|---|---|
| 1 | `GeometryMask` is **Canvas-only** in v4 — a no-op under WebGL | every `InkScrollArea`, the battle field frame | **Critical** |
| 2 | `RenderTexture.draw()` no longer executes — needs `.render()` | 4 bake sites (map, fog, battle ground, hero faces) | **Critical** |
| 3 | The post-FX pipeline system is gone — `PaperFX` must be rewritten | `src/ui/ink/PaperFX.ts` | High (compile error, so at least it is loud) |
| 4 | `roundPixels` semantics changed + new `vertexRoundMode` | whole game, at `RENDER_SCALE ≥ 2` | Medium (visual drift) |

Everything else — Containers, Graphics, Text, Input, Tweens, the Scale Manager, `game.step()`, all
56 verify harnesses' hooks — is unchanged.

**Recommendation: do it, on a branch, in the five stages in §7.** Estimated ~3½ days, of which ~1½
is verification. The payoff is the new renderer, an actively maintained line (v3 is now in
maintenance), and a set of new performance knobs (`pathDetailThreshold`, `batchSize`,
`autoMobileTextures`, `skipUnreadyShaders`) that land directly on this game's hot spot — it draws
almost everything with `Graphics`.

---

## 1. How this was measured

Not from memory, and not from the release notes alone.

1. **Ground truth for the API.** `phaser@4.2.1` was installed into a scratch directory. Every claim
   below about v4 was checked against that package's own `types/phaser.d.ts` (148,652 lines), its
   `src/`, its bundled `skills/v3-to-v4-migration/SKILL.md`, and `docs/Phaser 4 Shader Guide/`.
2. **Ground truth for the breakage.** `src/` was compiled with `tsc --noEmit` against v4's types via
   a throwaway `tsconfig` that repointed the `phaser` path mapping at the scratch install. The repo
   was not modified; the temp config was deleted afterwards. That run is the source of every error
   count in this document.
3. **Ground truth for behaviour changes that types cannot catch** — read directly out of v4's
   source: `src/display/mask/GeometryMask.js`, `src/gameobjects/container/ContainerWebGLRenderer.js`,
   `src/filters/Vignette.js`, `src/renderer/webgl/renderNodes/filters/FilterVignette.js`,
   `src/gameobjects/graphics/Graphics.js`.

Reproduce the compile check any time:

```bash
# in a scratch dir
npm install phaser@4.2.1
# in the repo, a temp tsconfig extending ./tsconfig.json with
#   "paths": { "phaser": ["<scratch>/node_modules/phaser/types/phaser.d.ts"] }
npx tsc -p tsconfig.v4check.json
```

---

## 2. What this project actually asks of Phaser

The API surface, counted across `src/` (65 of 224 files import Phaser):

| Symbol | Uses | Migration status |
|---|---|---|
| `GameObjects.Container` | 191 | unchanged |
| `GameObjects.Graphics` | 169 | unchanged API; `fillPoints`/`strokePoints` retyped |
| `Scene` | 92 | unchanged |
| `Input.Pointer` | 73 | unchanged |
| `GameObjects.GameObject` | 71 | unchanged |
| `Math.Clamp` | 50 | unchanged |
| `Types.Input.EventData` | 37 | unchanged |
| `GameObjects.Text` | 30 | unchanged |
| `Curves.Spline` | 7 | unchanged |
| `Scenes.Events.SHUTDOWN` / `UPDATE` | 8 | unchanged |
| `Renderer.WebGL.WebGLRenderer` (for `.contextLost`) | 5 | `contextLost` still exists |
| `GameObjects.RenderTexture` | 3 (+1 `make.renderTexture`) | **needs `.render()`** |
| `Renderer.WebGL.Pipelines.PostFXPipeline` | 1 | **removed — rewrite** |
| `Types.Core.PipelineConfig` | 1 | **removed — rewrite** |
| `Geom.Point` | 2 | **removed — use `Vector2`** |
| `createGeometryMask` / `setMask` | 4 | **WebGL no-op — rewrite as filters** |

The shape of the game matters as much as the counts: **this is a `Graphics`-first game.** It draws
the map, the UI chrome, the portraits and the battlefield with vector commands rather than sprites,
then bakes the static parts into `RenderTexture`s. That means the two v4 subsystems it leans on
hardest are exactly the two that were rewritten: the WebGL renderer, and render-texture drawing.

---

## 3. The compile-blocking breakage (proven by `tsc`)

160 errors, 16 files. Complete taxonomy:

| Error | Count | Cause |
|---|---|---|
| `TS2740` — missing `clone, copy, setFromObject, set, …` | 119 | polygon points are not `Vector2` |
| `TS2345` — argument not assignable | 26 | same, via arrays |
| `TS2339` — property does not exist | 10 | PaperFX / pipelines |
| `TS2694` — namespace has no exported member | 2 | `PipelineConfig`, `WebGLPipelineConfig` |
| `TS2724` / `TS2551` — no exported member `Point` | 2 | `Geom.Point` |
| `TS2353` — unknown property `pipeline` | 1 | game config |

### 3.1 `Point` → `Vector2` — 145 errors, 62 call sites, zero behaviour change

v4 deleted `Geom.Point`. Every geometry class now returns `Math.Vector2`, and `Graphics.fillPoints`
/ `strokePoints` are typed `Phaser.Math.Vector2[]`.

The affected files, all of which pass their own plain `{x, y}` structs or a local `Pt` type:

```
src/ui/IsoBuildingRenderer.ts   75      src/scenes/MenuScene.ts            5
src/ui/ink/devices.ts           24      src/ui/ink/stroke.ts               4
src/ui/playerFlag.ts            12      src/ui/DongHoMapRenderer.ts        3
src/ui/ink/props.ts             11      src/ui/AtlasMapRenderer.ts         3
                                        src/scenes/map/OverlayRenderer.ts  3
                                        src/scenes/MapScene.ts             2
                                        src/scenes/BattleArenaScene.ts     2  (Geom.Point)
                                        src/ui/inkTheme.ts                 1
                                        src/ui/InkUI.ts                    1
                                        src/scenes/ConquestScene.ts        1
```

**This is a type-level problem only.** v4's `Graphics.fillPoints` is, verbatim:

```js
fillPoints: function (points, closeShape, closePath, endIndex) {
    this.beginPath();
    this.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < endIndex; i++) { this.lineTo(points[i].x, points[i].y); }
    ...
}
```

It reads `.x` and `.y` and nothing else. Constructing 62 arrays of real `Vector2` objects would
allocate heavily in the map's redraw path for no benefit.

**Fix, as shipped:** one declaration file — `src/phaser-v4-points.d.ts` — and no call-site changes
at all.

```ts
declare namespace Phaser {
  namespace GameObjects {
    interface Graphics {
      fillPoints(points: ReadonlyArray<{ x: number; y: number }>, closeShape?: boolean, closePath?: boolean, endIndex?: number): this;
      strokePoints(points: ReadonlyArray<{ x: number; y: number }>, closeShape?: boolean, closePath?: boolean, endIndex?: number): this;
    }
  }
}
```

Phaser's types declare a global ambient `Phaser` namespace, so an interface of the same name merges
into the class and its members become additional overloads. The `Vector2` overload from Phaser's
own types is untouched and still preferred when a real `Vector2` is passed. **160 errors drop to
15**, and the diff is one new file.

The original plan here was a `pts()` cast helper wrapped around all 62 call sites. Same runtime,
sixty-two more places to get it wrong, and a cast at each one saying nothing about why it is safe.
The merge says it once, in the place where the reason belongs.

The two `Geom.Point` sites in `BattleArenaScene.ts:165,169` become `Phaser.Math.Vector2` outright —
they are constructed there, so there is no reason to widen anything.

> **Line endings.** This repo is CRLF with no `.gitattributes`. A whole-file rewrite through a
> script that reads with universal newlines and writes `\n` turns a two-line edit into a 1,778-line
> diff. Edit in place.

> Watch for `Math.TAU` while you are in here: in v3 it was (wrongly) `PI / 2`, in v4 it is `PI * 2`,
> and `Math.PI2` is gone. **This project uses neither** — checked, zero hits — but it is the classic
> silent v4 regression, and worth knowing if new code arrives during the migration.

### 3.2 `PaperFX` — the post-FX pipeline is gone

11 errors in `src/ui/ink/PaperFX.ts`. v4 deleted the entire v3 pipeline system:
`Renderer.WebGL.Pipelines` does not exist, nor does `renderer.pipelines`, nor
`camera.setPostPipeline`, nor `set1f`/`set2f`.

The replacement is the **Filter** system: a `Controller` (holds the tunable state) plus a
**RenderNode** extending `BaseFilterShader` (holds the shader and pushes uniforms).

**The good news: the GLSL survives almost untouched.** v4's own filter shaders still declare
`uniform sampler2D uMainSampler;` and `varying vec2 outTexCoord;` — verified in
`src/renderer/webgl/shaders/src/FilterVignette.frag`. The whole `PAPER_FX` fragment body ports
verbatim.

The one caveat is **texture orientation**: v4 uses GL convention throughout, Y=0 at the *bottom*.
PaperFX's vignette is radial about the centre, so it is unaffected; the fibre and tea-stain noise
fields simply flip vertically, which is invisible in a noise function. No action needed, but note it
if the shader ever gains a directional term.

Port:

```ts
// src/ui/ink/PaperFX.ts  (Phaser 4)
import Phaser from 'phaser';
import { wantsPaperFX } from '../../game/graphicsQuality';

const FRAGMENT = `
#pragma phaserTemplate(shaderName)
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uStrength;
varying vec2 outTexCoord;
// ...body unchanged from v3...
`;

export const PAPER_FX_KEY = 'PaperFX';

/** Holds the state. One per camera that wears the paper. */
export class PaperFXController extends Phaser.Filters.Controller {
  elapsed = 0;
  /** 0 disables the effect without removing it, so it can be toggled at runtime. */
  strength = 1;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, PAPER_FX_KEY);
  }
}

/** Holds the shader. Registered once with the renderer, shared by every controller. */
export class PaperFXNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(PAPER_FX_KEY, manager, undefined, FRAGMENT);
  }

  setupUniforms(
    controller: PaperFXController,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    controller.elapsed += 1;
    const pm = this.programManager;
    pm.setUniform('uTime', controller.elapsed);
    pm.setUniform('uStrength', controller.strength);
    pm.setUniform('uResolution', [drawingContext.width, drawingContext.height]);
  }
}

export function applyPaperFX(scene: Phaser.Scene): void {
  if (!paperFxEnabled()) return;
  try {
    const nodes = scene.renderer.renderNodes;          // undefined under Canvas
    if (!nodes) return;
    if (!nodes.hasNode(PAPER_FX_KEY)) nodes.addNodeConstructor(PAPER_FX_KEY, PaperFXNode);
    const camera = scene.cameras.main;
    // external: after the camera transform, i.e. the whole screen — world and chrome on one sheet,
    // which is the entire point of the pass. internal would age only the camera's own region.
    camera.filters.external.add(new PaperFXController(camera));
  } catch (error) {
    console.warn('PaperFX unavailable; drawing without it:', error);
  }
}
```

Two structural notes:

- **`elapsed` moves onto the controller.** In v3 the pipeline was the stateful object and was
  shared; in v4 the RenderNode is shared and the controller is per-camera. Keeping the clock on the
  controller means each scene's paper drifts independently — which is what v3 did *not* do, and is
  arguably better, but if a seam ever shows between `MapScene` and `UIScene`, hoist `elapsed` to a
  module-level counter.
- **Registration can move into the game config** rather than being done per scene:
  `render: { renderNodes: { [PAPER_FX_KEY]: { key: PAPER_FX_KEY, function: PaperFXNode } } }`.
  Either works; the scene-level `addNodeConstructor` guarded by `hasNode` is the closer analogue of
  today's `applyPaperFX` and keeps the Canvas-fallback guard in one place.

### 3.3 Game config: `pipeline` → `render.renderNodes`

`src/game/config.ts:52` — 2 errors. The top-level `pipeline` key is gone from `GameConfig`, as is
`Types.Core.PipelineConfig`. Delete the key (and its `as unknown as` cast, which was already a
smell) and either register the node in `applyPaperFX` as above or move it to `render.renderNodes`.

Everything else in the config is valid v4, confirmed against `Types.Core.RenderConfig`:
`preserveDrawingBuffer`, `powerPreference`, `roundPixels`, `Phaser.AUTO`, `Phaser.Scale.FIT`,
`Phaser.Scale.CENTER_BOTH`, `input.activePointers`, `input.touch`, the `scale.width/height`
override, and the scene array all survive untouched.

---

## 4. The silent breakage (`tsc` will not catch these)

This is the part that matters. Each of these compiles cleanly and then misbehaves.

### 4.1 `GeometryMask` is Canvas-only in v4 — **Critical**

Straight from v4's own source, `src/display/mask/GeometryMask.js`:

> *"GeometryMask is only supported in the Canvas Renderer. If you want to use geometry to mask
> objects in WebGL, see `Phaser.GameObjects.Components.FilterList#addMask`."*

The class still exists. `createGeometryMask()` still exists and still returns an object. `setMask()`
still exists and still accepts it. **Nothing errors.** Under WebGL — which is what this game runs —
the mask is simply never consulted, and the masked content renders unclipped.

Two call sites, both load-bearing:

- **`src/ui/InkUI.ts:404`** — `this.content.setMask(this.maskShape.createGeometryMask())`. This is
  `InkScrollArea`, the clipping for every scrolling panel in the game. It is referenced 49 times
  across 7 files: `UIScene`, `ConquestUIScene`, `GuideScene`, `HistoryScene`, `BattleArenaScene`,
  `CardStack`, and `InkUI` itself. Without the mask, **every scroll list spills over its frame and
  paints across the rest of the screen.**
- **`src/scenes/ConquestUIScene.ts:5953–5970`** — `frameMask` clipping the battle field's three
  landscape layers (`far`, `ground`, `g`). The comment there already records why it exists: soft
  ridges are drawn wider than their span and hang past the border. Without it, the hills spill out
  of the panel.

**Fix** — masks are filters now:

```ts
// v3
this.content.setMask(this.maskShape.createGeometryMask());

// v4
this.content.enableFilters();
this.contentMask = this.content.filters.internal.addMask(this.maskShape);
```

Three things to get right while doing it:

1. **`enableFilters()` is required on game objects.** Cameras have `filters` by default; Containers,
   Graphics and Images do not. Forgetting it means `filters` is `null` and you get a *loud* crash —
   which is the good case.
2. **The mask source is re-rendered to a DynamicTexture every frame** while `autoUpdate` is true.
   `InkScrollArea`'s mask is a static rectangle that never changes. Set `mask.autoUpdate = false`
   after the first render and only set `needsUpdate = true` on resize. On a screen with several
   scroll areas that is the difference between free and not.
3. **A mask filter costs a framebuffer per masked object.** Today three separate Graphics layers in
   `ConquestUIScene` share one `frameMask`. Under v4 that is three filter chains. Consider putting
   the three layers in one Container and masking the Container instead — one framebuffer, same
   picture.

**Gated by:** `verify-scroll.mjs`, `verify-tap-after-scroll.mjs`, `verify-history.mjs`,
`verify-guided-run.mjs`, `verify-arena.mjs`.

### 4.1a Why the clip is a stencil and not a filter — **closed 2026-08-22**

> Kept in full because it is the measurement that ruled out object filters for this game. The
> fix that shipped is `Phaser.GameObjects.Stencil` (Phaser 4.2), bracketed around the clipped
> children by `src/ui/ink/clipRect.ts` — screen space, no framebuffer, correct at every tier.
> Option 1 below (a camera viewport per scroll area) was never needed.

The mask port above is written, compiles, and is **pixel-correct at `RENDER_SCALE` 1 and visibly
wrong at 2 and 3** — which are the medium and high graphics tiers, i.e. what nearly every player
gets. This was not predicted by §4.1 and is the one thing on the branch that still needs solving.

**What it looks like.** The History page's list is clipped to a rectangle roughly the size of the
*design surface in device pixels*: the content is cut off part-way across and part-way down, and
what remains sits shifted. Turn the filter off and the page renders perfectly — so the layout, the
scroll maths and the content are all fine. It is the filter composite that is wrong.

**What was measured.** `?capture=1` preserves the drawing buffer, so the surviving pixels can be
read directly. Baseline is a mask covering nothing (whole list hidden); "kept" is the bounding box
of pixels that differ from that baseline. Asking for the real clip rect — design `(12, 108, 366,
675)` — on a 390×844 design surface:

| `RENDER_SCALE` | canvas | kept region | verdict |
|---|---|---|---|
| 1 (`low`) | 390×844 | x 14..374, y 112..782 | **exact** — 2px inside the rect, which is where the content's own edge is |
| 2 (`medium`) | 780×1688 | x 24..354, y 216..824 | wrong |

The top-left corner is right in both cases: at scale 2 the rect's origin `(12, 108)` lands at
device `(24, 216)`, correctly multiplied by the camera zoom. The **far edge is the problem, and it
does not move**. Four different mask rects, both `viewTransform` modes, internal and external, the
rect drawn at design units and at device units — the kept region stops dead at 354×824 every time:

```
world  bounds  (12,108,366,675)   kept x 24..354  y 216..824
local  bounds  (12,108,366,675)   kept x 24..354  y 216..824
local  bounds×2(24,216,732,1350)  kept x 48..354  y 432..824
local  buffer-full (0,0,780,1688) kept x  0..354  y   0..824
world  buffer-full (0,0,780,1688) kept x  0..354  y   0..824
```

A mask covering the entire buffer still loses everything past ~390×844 device pixels. That is the
**design** size, not the buffer size. The mask's `DynamicTexture` is correctly sized (probed: 780×1688,
`scaleFactor` 1, filter camera 780×1688 at zoom 2) — so the mask is not what is cropping. The
composite is.

**The diagnosis.** Object-level filters size their framebuffer from the camera's design dimensions
while drawing into it at the camera's zoomed scale, so everything beyond the design rectangle falls
outside the framebuffer and is discarded. This game inflates `gameSize` by `RENDER_SCALE` and zooms
every camera by the same factor to get back to 390-wide design units (`src/game/graphicsQuality.ts`)
— which is exactly the configuration that trips it. Camera filters are unaffected: `PaperFX` is on
`cameras.main` and renders correctly at every tier.

**Options, in order of preference:**

1. **Clip with a camera viewport instead of a filter.** A Phaser camera clips to its viewport
   natively, in screen space, with no framebuffer round-trip — and it is *cheaper* than a
   full-screen filter pass per scroll area. Cost: one camera per `InkScrollArea`, `camera.ignore`
   lists to keep the content out of the main camera, and the scroll offset applied as camera
   scroll. This is the real fix and it is a design change, not a port.
2. **Report upstream and pin.** The behaviour looks like a defect rather than an intended limit;
   worth a minimal reproduction against `phaserjs/phaser` before building around it.
3. **Do nothing and ship at `RENDER_SCALE` 1.** Rejected — that is the whole mobile-resolution
   feature (`docs`/memory: the "graphics look bad on mobile" fix) traded for a clip.

**What the branch ships in the meantime.** `src/ui/ink/clipFilters.ts` gates the whole thing on
`renderNodes && cameras.main.zoom === 1`. Where the filter is correct it is used; where it is not,
both call sites fall through to `createGeometryMask()`, which is a no-op under WebGL and therefore
means *no clip at all*.

That is a deliberate choice between two bad states, and the screenshots made it obvious which is
which. A cropped filter does not clip in the wrong place — it **deletes content**: Dragon Ascent's
"What kind of realm is this?" prompt came up with its entire card list gone, a header and a "Decide
later" button over blank paper, which is a game you cannot play. Unclipped, the same page is
correct and the only symptom is that the History list runs *under* the footer button instead of
stopping at the frame. Of the two failures, take the one the player can work with.

So on `low` the clip is exact, and on `medium`/`high` lists overflow their frames until the camera
viewport rewrite lands.

Reproduce with the two probes kept in `test_scripts/scratch/` (gitignored): `_maskcal2.mjs` prints
the table above, `QUALITY=low` / `QUALITY=medium` selects the tier.

### 4.2 `RenderTexture.draw()` no longer draws — **Critical**

v4 turns every draw call into a **command buffer entry**. `draw`, `stamp`, `fill`, `clear`, `erase`,
`repeat` and `capture` all queue; **`render()` executes.** From the bundled `render-textures` skill:

```js
rt.clear();
rt.fill(0x000000);
rt.draw(sprite, 128, 128);
rt.render();  // REQUIRED -- nothing appears without this
```

The signatures are unchanged, so nothing errors — the bakes just come back blank, and because each
bake also *hides its source layers* on success, **the affected content disappears entirely.**

Four sites, and each one is a whole visual subsystem:

| Site | What goes blank |
|---|---|
| `src/scenes/MapScene.ts:1169–1205` (`bakeStaticTerrain`) | the entire static map |
| `src/scenes/map/OverlayRenderer.ts:163–180` (fog bake) | fog of war |
| `src/scenes/ConquestUIScene.ts:6543–6559` (battle ground bake) | the battlefield landscape |
| `src/ui/FaceRenderer.ts:141–155` (`heroFaceTextureKey`) | every hero portrait badge |

**Fix** is one line per site, inside the existing `try` so a context loss mid-flush is still caught:

```ts
try {
  this.staticBakeRT.clear();
  this.staticBakeRT.draw(visible, 0, 0);
  this.staticBakeRT.render();     // v4: flush the command buffer
} catch (error) { /* unchanged recovery */ }
```

`FaceRenderer` needs `target.render()` before `target.saveTexture(key)`, or the cached texture is
saved empty and every subsequent lookup hits the empty cache entry.

Two v4 opportunities worth noting while in here:

- **`preserve(true)`** keeps the command buffer so the same drawing replays each render. The fog
  bake redraws on every visibility change from the same source Graphics — a preserved buffer plus
  `renderMode: 'redraw'` may be cheaper than rebuilding the draw list.
- **`capture()`** draws a game object with temporary transform overrides and restores them
  afterwards. All four sites currently do this by hand — `setScale(BAKE_SCALE)`, draw,
  `setScale(1)`. `capture(obj, { scale: BAKE_SCALE })` is the same thing without the mutation
  window, and it captures the current camera view accurately, which `draw` does not.

**Gated by:** `verify-battle-ground-bake.mjs`, `verify-arena-rebake.mjs`, `verify-culling.mjs`,
`verify-render-scale.mjs`, `verify-heroes.mjs`, and `/shot` on the map.

> **Note the interaction with 4.1.** `ConquestUIScene`'s bake currently calls `clearMask()` on its
> sources before drawing, with a comment recording that a geometry mask "simply does not survive
> `RenderTexture.draw`". Once masks are filters, that is no longer the mechanism — a filtered object
> drawn into an RT composites through its filter chain. The `clearMask` dance can probably go, but
> it must be re-measured, not assumed: `verify-battle-ground-bake.mjs` exists precisely because this
> bake is held to pixel equivalence with an unbaked rebuild.

### 4.3 `roundPixels` and the new `vertexRoundMode` — Medium

v4 changes the default from `true` to `false`. **This game sets it explicitly**
(`config.ts:48 roundPixels: true`), so the default change does not bite. What does change is the
*semantics*:

- v4 rounds **only when an object is axis-aligned and unscaled**, to stop flicker on transforming
  objects.
- A new per-object `vertexRoundMode` defaults to `"safeAuto"` — round only on position-only
  transforms, and only when the camera has `roundPixels` on.

This game runs the whole world through `RENDER_SCALE` (1/2/3 by graphics tier) with **every camera
zoomed by the same factor** to put scenes back into 390-wide design units. Under v3's blanket
rounding, zoomed content was still snapped. Under v4's `"safe"` rule a camera zoom is a scale, so
**rounding may stop applying where it used to** — which shows up as hairlines shifting by a
sub-pixel and ink strokes reading slightly softer.

**Action:** this is a look-at-it change, not a fix-it-blind change. Run `/shot` on the map, the menu
and the battle screen at each of the three graphics tiers, before and after. If lines soften, set
`vertexRoundMode: 'full'` on the map's baked layers and the UI chrome. `verify-render-scale.mjs` is
the harness that already covers this axis.

### 4.4 Canvas fallback semantics invert

`type: Phaser.AUTO` still works and Canvas still exists, but it is **deprecated** in v4 and supports
none of the WebGL features. Note the inversion this creates for this codebase: under WebGL, filters
work and `GeometryMask` does not; under Canvas, `GeometryMask` works and filters do not. `PaperFX`
already guards for a missing WebGL renderer. After 4.1, the mask path will need the same courtesy —
`enableFilters()` returns early without WebGL, so `filters` stays `null` and a naive
`filters.internal.addMask()` throws on a Canvas fallback. Guard it, or commit to `Phaser.WEBGL` and
fail honestly on a device that cannot provide it (see Stage 5).

### 4.5 Compressed textures — not applicable

v4 requires compressed textures to be re-compressed with Y flipped. This project ships PNG/SVG and
generates its art procedurally; there are no compressed textures. **No action.**

---

## 5. What is *not* affected

Checked, and confirmed clean — recorded here so the migration does not go hunting:

| v4 breaking change | Applies here? |
|---|---|
| `setTintFill()` / `tintFill` removed | **No** — 0 uses |
| `Phaser.Struct.Set` / `Struct.Map` → native | **No** — 0 uses |
| `Math.TAU` value changed, `Math.PI2` removed | **No** — 0 uses |
| `Mesh` / `Plane` removed | **No** — 0 uses |
| `setPipeline('Light2D')` → `setLighting(true)` | **No** — no lighting |
| `Shader` game object → `ShaderQuadConfig` | **No** — no Shader objects |
| GLSL loader changes (`#pragma` templates) | **No** — shader is inline |
| `TileSprite` cropping removed | **No** — 1 TileSprite, no crop |
| `Grid` shape `outline` → `stroke` | **No** — no Grid |
| `BitmapMask` removed | **No** — 0 uses (GeometryMask is the issue, §4.1) |
| FX `Bloom`/`Shine`/`Circle`/`Gradient` removed | **No** — 0 uses |
| `ColorMatrix` methods moved to `.colorMatrix` | **No** — 0 uses |
| Camera matrix restructure (`matrixExternal`/`matrixCombined`) | **No** — only `scrollX/Y` and `zoom` |
| `Create.GenerateTexture` / `TextureManager.generate` removed | **No** — 0 uses |
| Spine plugins unbundled | **No** — not used |
| Blend modes reduced to 4 under WebGL | **No** — 0 `setBlendMode` calls |
| Legacy polyfills / `phaser-ie9.js` removed | **No** |
| Camera3D / Layer3D / Facebook plugins removed | **No** |

And confirmed still present in v4, because the harnesses depend on them:

- `game.step(time, delta)` — used by `window.advanceTime` and 11 harness sites.
- `game.scene.getScene/isActive/start/stop/getScenes` — 500+ harness references.
- `game.scale.width/height/gameSize/displayScale`, `game.canvas` — 25 harness references.
- `renderer.contextLost` — the four bake guards.
- **`Container` still renders `container.list` in list order**, ignoring child `depth`. Verified in
  v4's `ContainerWebGLRenderer.js`. `MapScene`'s ordering assumption (documented at
  `MapScene.ts:1471`) still holds.
- `scene.make.graphics({}, false)`, `scene.make.renderTexture({...}, false)`, `saveTexture()`,
  `Curves.Spline`, `Geom.Polygon.Contains`, `Geom.Circle.Contains`, `GameObjects.Zone`.

---

## 6. Cost

**Bundle.** Phaser 4 is bigger:

| | minified | gzipped |
|---|---|---|
| `phaser@3.90.0` esm.min | 1,197 KB | 310 KB |
| `phaser@4.2.1` esm.min | 1,378 KB | 347 KB |
| **delta** | +181 KB | **+37 KB (+12%)** |

Against the current shipped bundle (3,528 KB raw / 952 KB gzipped) that is about **+4% of total
transfer**. It matters more than usual here because the service worker precaches the whole bundle
for offline play, and the native shells in `apps/` ship it in the binary — but 37 KB is not a reason
to stay on v3.

**Performance is the open question, and it cuts both ways.** The v4 renderer is a full rewrite
(render nodes, per-node WebGL state, ~16 MB of generic vertex buffers freed). For a sprite game that
is straightforwardly faster. This game is `Graphics`-first with two large `RenderTexture` bakes, and
that path has different characteristics. Nothing can be concluded without measuring — **`/perf`
before and after is not optional**, and the numbers in `test_scripts/perf-results/` will need
re-baselining because they were taken against a renderer that no longer exists.

**New knobs that land on this game's actual bottleneck**, all in `render:` config:

- **`pathDetailThreshold`** — skips vertices closer together than a threshold. This game draws
  hand-inked curves with `Curves.Spline` and thousands of polygon strokes; this is aimed squarely at
  that.
- **`batchSize`** — quads per batch.
- **`autoMobileTextures`** — restricts WebGL to one texture per batch on iOS/Android.
- **`skipUnreadyShaders`** — parallel shader compilation, trading a stutter for brief pop-in.
- **`stencil: false`** — saves stencil buffer memory. Relevant *only after* §4.1: geometry masks are
  the stencil consumer, and once masks are filters this game may not need stencil at all.

---

## 7. Execution plan

Five stages, each ending at a gate that already exists. Do them in order; each is independently
revertable.

### Stage 0 — branch and baseline (4 h)

```bash
git checkout -b feat/phaser-4
/perf                 # baseline on the current renderer — keep the output
/smoke                # confirm green before touching anything
/shot                 # map, menu, battle, at graphics tiers low/medium/high
```

Baseline shots are the only way to judge §4.3, and the only way to catch an ink-weight drift that no
assertion will ever see. Do not skip this.

### Stage 1 — mechanical, no behaviour change (3 h)

1. `yarn add phaser@4.2.1`.
2. Add `src/ui/ink/points.ts` with the `pts()` helper; wrap the 62 `fillPoints`/`strokePoints` call
   sites across the 14 files in §3.1.
3. `BattleArenaScene.ts:165,169` — `Phaser.Geom.Point` → `Phaser.Math.Vector2`.
4. Note `tsconfig.json` already maps `"phaser": ["./node_modules/phaser/types/phaser.d.ts"]` — that
   path is still correct for v4.
5. Free with the install: `node_modules/phaser/skills/` — 28 upstream agent skills that v3 does not
   ship. See Appendix C.

**Gate:** `tsc` errors drop from 160 to ~15 (PaperFX 11, config 2, plus anything the Point fix
uncovered). The game will not run yet.

### Stage 2 — PaperFX and the game config (4 h)

5. Rewrite `src/ui/ink/PaperFX.ts` per §3.2.
6. Remove the `pipeline` key from `src/game/config.ts`.

**Gate:** `tsc` clean. `yarn build` succeeds. `/smoke` boots all four modes without console errors.
`/shot` with and without `?nofx=1` — the paper pass must look like the baseline, and the `?nofx=1`
escape hatch must still work.

### Stage 3 — the silent breakage (6 h)

7. Add `.render()` at the four bake sites (§4.2).
8. Convert the two mask sites to filters (§4.1), including `autoUpdate = false` on the static scroll
   mask.
9. Re-examine the `clearMask()` workaround in `ConquestUIScene`'s ground bake now that masks
   composite differently.
10. Guard the filter path for a Canvas fallback (§4.4).

**Gate:** `/verify scroll`, `/verify tap-after-scroll`, `/verify battle-ground-bake`,
`/verify arena-rebake`, `/verify culling`, `/verify heroes`, `/verify render-scale`. Then `/shot`
every screen with a scroll area — `HistoryScene`, `GuideScene`, `UIScene`, `ConquestUIScene`,
`CardStack` — and compare against the Stage 0 baseline. **A spilling scroll list is the single most
likely way this migration ships broken**, and only eyes catch it if the harness asserts on state
rather than pixels.

### Stage 4 — full regression and re-baseline (8 h)

11. Run the whole `test_scripts/verify/` suite — all 56.
12. `/perf` and compare against Stage 0. Re-baseline `test_scripts/perf-results/`.
13. `/playtest` and `/funscore` — the numbers should be unchanged; if they moved, something visual or
    timing-related moved with them.
14. `/verify pwa` and `/verify shell` — the service worker hashes the bundle, and the bundle changed.
    Also rebuild `apps/` (`yarn build:shell`) and check both cabinets.
15. Only now, tune: try `pathDetailThreshold`, and try `stencil: false` if nothing needs stencil
    after Stage 3. Measure each independently.

### Stage 5 — decide on Canvas (1 h)

16. Either keep `Phaser.AUTO` with the Canvas guards from §4.4, or switch to `Phaser.WEBGL` and fail
    loudly. Given that PaperFX, all masks, and every filter are WebGL-only in v4, a Canvas fallback
    now renders a materially different and partly broken game. **Recommendation: switch to
    `Phaser.WEBGL`** and show an honest "this device cannot run the game" message rather than ship a
    silently degraded one.

---

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ~~A masked scroll area spills and no harness notices~~ **— happened.** Every state assertion in `verify-scroll`, `verify-tap-after-scroll` and `verify-history` passed while the page was visibly cut in half | **Occurred** | High | Only the screenshot caught it. See §4.1a |
| Graphics-heavy map is slower on the new renderer | Medium | High | `/perf` at Stage 0 and Stage 4; `pathDetailThreshold` as the first lever; the bake and culling work is unaffected either way |
| Mask-as-filter costs a framebuffer per object and drops frames on low tier | Medium | Medium | Mask Containers, not individual layers; `autoUpdate = false` on static masks |
| `roundPixels` drift softens the ink line at `RENDER_SCALE ≥ 2` | Medium | Medium | Baseline shots at all three tiers; `vertexRoundMode: 'full'` as the lever |
| The ground-bake `clearMask` equivalence no longer holds | Medium | Low | `verify-battle-ground-bake.mjs` already pins it to a pixel comparison |
| `+37 KB` gzipped hurts first load / offline precache | Low | Low | Accepted; measure with `/verify pwa` |
| Phaser 4 has a regression this project trips over | Low | Medium | 4.2.1 is three point releases in; branch is revertable at any stage |

**Rollback** is `git checkout main` at any stage. Nothing here touches game state, save format, or
the i18n catalogs, so there is no data migration to unwind.

---

## 9. Effort

| Stage | Work |
|---|---|
| 0 — branch and baseline | 4 h |
| 1 — mechanical (`Point` → `Vector2`) | 3 h |
| 2 — PaperFX + config | 4 h |
| 3 — masks + render textures | 6 h |
| 4 — regression + perf re-baseline | 8 h |
| 5 — Canvas decision | 1 h |
| **Total** | **~3½ days**, of which ~1½ is verification |

The upstream guidance is "most games using the standard Phaser API are looking at a few hours of
work." That is roughly right for Stages 1–2 here. Stages 3–4 are the tax this particular game pays
for being `Graphics`-first, mask-heavy and bake-heavy — the three things v4 changed most.

---

## Appendix A — Sources

Primary, read from the `phaser@4.2.1` package itself:

- `skills/v3-to-v4-migration/SKILL.md` — the full 430-line official migration guide
- `skills/filters-and-postfx/SKILL.md` — the Filter system and the v3→v4 FX/mask mapping table
- `skills/render-textures/SKILL.md` — the command-buffer model and `render()`
- `docs/Phaser 4 Shader Guide/` §3 — authoring a custom Filter (Controller + `BaseFilterShader`)
- `changelog/v4/4.0/MIGRATION-GUIDE.md`, `changelog/v4/4.1/`, `changelog/v4/4.2/`, `changelog/v4/4.2.1/`
- `types/phaser.d.ts`, and `src/` for `GeometryMask`, `ContainerWebGLRenderer`, `Graphics`, `Vignette`

Secondary:

- [Migrating from Phaser 3 to Phaser 4](https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know)
- [Phaser 3 vs Phaser 4: What Changed and Why You Should Upgrade](https://phaser.io/news/2026/05/phaser-3-vs-phaser-4)
- [Phaser 4 Renderer: Faster, Cleaner, and Built for Modern Games](https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games)
- [phaserjs/phaser — v3-to-v4-migration skill](https://github.com/phaserjs/phaser/blob/master/skills/v3-to-v4-migration/SKILL.md)
- [Phaser v4.0.0 release discussion](https://github.com/phaserjs/phaser/discussions/7274)

For Appendix C, the published contents of `@phaserjs/game-agent@1.0.0` read locally, plus:

- [Phaser Game Agent MCP setup](https://phaser.io/news/2026/07/phaser-game-agent-mcp-setup)
- [Phaser Game Agent — about](https://phaser.io/agent/about)
- [Phaser Game Agent: Build a Game from a Single Sentence](https://phaser.io/news/2026/06/phaser-game-agent)
- [phaserjs/phaser-game-agent](https://github.com/phaserjs/phaser-game-agent)

## Appendix B — The 16 files that fail to compile against v4

```
src/ui/IsoBuildingRenderer.ts    75   Vector2
src/ui/ink/devices.ts            24   Vector2
src/ui/playerFlag.ts             12   Vector2
src/ui/ink/props.ts              11   Vector2
src/ui/ink/PaperFX.ts            11   pipelines  ← rewrite
src/scenes/MenuScene.ts           5   Vector2
src/ui/ink/stroke.ts              4   Vector2
src/ui/DongHoMapRenderer.ts       3   Vector2
src/ui/AtlasMapRenderer.ts        3   Vector2
src/scenes/map/OverlayRenderer.ts 3   Vector2
src/scenes/MapScene.ts            2   Vector2
src/scenes/BattleArenaScene.ts    2   Geom.Point ← rewrite
src/game/config.ts                2   pipeline   ← rewrite
src/ui/inkTheme.ts                1   Vector2
src/ui/InkUI.ts                   1   Vector2
src/scenes/ConquestScene.ts       1   Vector2
```

Plus the files that compile cleanly and break anyway: `src/ui/InkUI.ts` (mask),
`src/scenes/ConquestUIScene.ts` (mask + bake), `src/scenes/MapScene.ts` (bake),
`src/scenes/map/OverlayRenderer.ts` (bake), `src/ui/FaceRenderer.ts` (bake).

## Appendix C — Phaser's agent tooling: what to take, what to skip

Two separate things share the "Phaser + AI" label. They are not the same offer, and only one of
them belongs anywhere near this repo.

### C.1 `@phaserjs/game-agent` — skip it

**What it is** (read from the published tarball, `@phaserjs/game-agent@1.0.0`, 1 July 2026, 55 KB,
zero dependencies — not from the marketing page): a CLI whose *only* job is to register an MCP
server with a coding agent.

```
index.mjs   targets.mjs   bridge.mjs   skills/phaser-game-agent/SKILL.md
```

`npx @phaserjs/game-agent` detects installed CLIs (Claude Code, VS Code, Cursor, Codex, Gemini,
Windsurf…), signs in through the browser against a Phaser account, and writes each one's MCP config
— native remote-HTTP for Claude Code, a bundled stdio bridge for the rest. The only URLs in the
entire package are `phaser.io` and `mcp.phaser.io`. **It never reads project files.**

The capability is server-side. Its bundled skill gives the tool loop:

`phaser_game_agent_guide` → `open_project` (returns a **cloud** `projectId`) →
`search_games` / `search_blocks` → `add_blocks` / `seed_game` → `write_files` → `verify` →
`preview` (returns a public `playUrl`) → `finish` (pauses the workspace, stops billing).

**Two facts settle it:**

1. **`read_files` / `write_files` are scoped to a managed cloud sandbox**, not the working tree.
   There is no path from this tool to this repository.
2. **It does not build on Phaser 4.** Phaser's own page: *"Every game gets a custom build of
   **Phaser AE** — just the physics, effects and systems your idea needs."* A different,
   agent-oriented engine assembled from prebuilt blocks (2D Arcade / Vector / 3D variants), not the
   engine this game is written against.

Billing is per build-minute against a Phaser account (from $0.01/min), on top of whatever drives the
agent. It is v1.0.0 with a single release.

**Verdict: not applicable.** This repo is 98,588 lines of hand-authored Phaser 3 — three swappable
map themes, a procedural Đông Hồ ink aesthetic drawn almost entirely in `Graphics`, 104 hero
templates with layered SVG portraits, a bilingual catalog with an import-time invariant, a
hand-rolled service worker, native shells in `apps/`, and 56 verify harnesses. The Game Agent is a
green-field prototype generator on another engine in another sandbox; there is no seam where it
attaches. It is not even a dependency that *could* be added — nothing goes in `package.json`; it is
a global CLI plus an MCP entry.

The nearest legitimate use is throwaway: spin up a cloud prototype to feel out a mechanic before
hand-building it here. That is a personal-workflow decision, not a repo change, and it costs credits.

### C.2 The skills bundled with `phaser@4` — take these

`phaser@4.2.1` ships **28 agent skills inside the npm package**, at `node_modules/phaser/skills/`.
`phaser@3.90.0` ships none. They arrive free with Stage 1's `yarn add phaser@4.2.1`:

```
v3-to-v4-migration    filters-and-postfx      render-textures      graphics-and-shapes
game-setup-and-config cameras                 scenes               sprites-and-images
geometry-and-math     text-and-bitmaptext     tweens               time-and-timers
input-keyboard-mouse-touch                    scale-and-responsive groups-and-containers
game-object-components actions-and-utilities  animations           audio-and-sound
curves-and-paths      data-manager            events-system        loading-assets
particles             physics-arcade          physics-matter       tilemaps
v4-new-features
```

These are the primary source for most of this document. Local, versioned with the engine, no
account, no network, no billing — the opposite of C.1 on every axis.

This repo already runs six hand-written skills in `.claude/skills/` (`game-dev`, `game-map`,
`game-mechanics`, `game-art-theme`, `game-heroes`, `game-harness`). The division of labour after the
upgrade is clean: **upstream skills answer engine questions, local skills answer *this game's*
questions.** Worth a line in `game-dev`'s "which deeper skill to load next" section pointing at
`node_modules/phaser/skills/` for raw Phaser API work — particularly `filters-and-postfx` and
`render-textures`, which cover the two subsystems §4.1 and §4.2 rewrite.
