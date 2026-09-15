# Connected wet-paddy ground

**Rejected and superseded on 16 September 2026.** The user corrected the borderless direction: paddies need water-retaining bunds, localized placement, richer Đông Hồ crop art, tree clearance, and seasonal growth. See [rice-paddies-v3.md](rice-paddies-v3.md) for the replacement. The following records the earlier experiment, not current behavior.

The user rejected every outlined field compound, then correctly rejected the dry rice-on-grass texture. Both approaches are superseded. The ordinary game now fills connected farmland with a shallow flooded surface and young rice transplants, in the existing Đông Hồ-inspired palette.

## What changed

- `riceGround.ts` collects visible rice/field terrain and joins narrow intervening plains. It leaves water, hills, woodland and settlement yards outside the paddy material. This is a visual overlay; gameplay terrain and movement rules are unchanged.
- Adjacent cells share continuous texture coordinates. Sixty-four neighbour masks feather only the outside edge into dry ground; internal joins remain opaque. There are no enclosing field outlines or compound stamps in the default rendering.
- Roads remain above crops. Trees, bushes and grass scatter are excluded when their roots would stand in the flooded field. Trees on dry banks can still overhang naturally.
- Tile assets off and missing atlas pages use a borderless native wet-ground fallback. Explicit `riceart=original|carved|jade|harvest` URLs preserve the older comparison looks. Normal URLs use connected wet rice.
- Two 2048×1152 atlas pages use 128×144 frames to preserve small rice marks. Combined: 1,520,502 bytes on disk, 18 MiB decoded. They use the existing static ground cache; no per-frame crop animation or new live ground pass. The softer initial atlas is archived under `output/rice-ground/`.

## Art reference and limits

The chosen appearance is a young transplanted, irrigated lowland paddy: shallow water around rice roots, with submerged muddy ground. Rice water levels vary with growing stage and water management; this is one visual stage, not a claim that all Vietnamese rice is permanently flooded. Reference: [IRRI Rice Knowledge Bank — water management](https://www.knowledgebank.irri.org/step-by-step-production/growth/water-management).

The existing game bakes its base ground in Spring and applies seasonal overlays. This revision preserves that cache behavior; it does not implement new growth/harvest simulation. Exact ImageGen prompt, masters and rejected draft are recorded in `dongho-rice-ground-v1.json`. Repack with `node scripts/conquest-art/pack-rice-ground.mjs <wet-master.png>`; existing targets are protected.

## Verification

- Production desktop 1440×960 and phone 390×844 use the same seed/camera as the older versions. A revealed player-owned map fixture removes foreign haze for art inspection; saves are untouched.
- The fixture paints 186 farmland cells and zero field compounds. The generated fields stay off river cells, contain no dry vegetation roots, use static caching and sit below roads.
- Four seasonal overlays retain placement. Pointer dragging and native fallback with tile assets off pass. The joined-tile alpha audit samples 150 points at six shared joins: all 255/255, with transparent exterior.
- TypeScript and production/offline build pass with the existing font-path and bundle-size warnings. The installed game client renders the production build; final screenshot/state in `output/rice-ground/skill-v2/` has no browser error files.
- Report and screenshots: `output/rice-ground/report.json`, `desktop-connected.png`, `close-connected.png`, `phone-connected.png`, `join-audit.json`, and `review.html`.

No physical-device frame-rate or memory acceptance is claimed. Earlier compound-comparison evidence remains archived; the interrupted full-map procedural test from that attempt is not a passed check.
