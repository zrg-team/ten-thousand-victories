# Đông Hồ rice fields — in-game comparison

**Superseded: the user rejected all three compound sprites.** The earlier comparison below is an archived experiment. Ordinary launches now use connected wet-paddy terrain; see `dongho-rice-ground-v1.md`. These compound sprites remain available only through explicit review URLs.

| Version | Review | URL override |
| --- | --- | --- |
| Original | Rounded, dense compound; seedling parcels have transparent interiors. Preserved. | `?riceart=original` |
| Carved Fields | Earlier internal preference; rejected by the user because it still floats above the ground. | `?riceart=carved` |
| Jade Mosaic | Good palette and rice silhouettes; pointed footprint and inlet attract more attention. | `?riceart=jade` |
| Harvest Rhythm | Strong crop rhythm; diagonal rows and broad silhouette feel heavier. | `?riceart=harvest` |

## Assets and integration

- Each family contains flooded, fallow, nursery, transplanted and ripe frames in a 768×320 WebP atlas, using 256×160 cells. Only the requested family loads. Selected atlas: 95,020 bytes, 0.9375 MiB decoded.
- Generated drafts and isolation masters are retained in `output/rice-fields/`; exact prompts and source paths are in `dongho-rice-v1.json`. Initial RGB checkerboard output and the unsuccessful alpha edit were rejected. ImageGen produced clean chroma masters; the packer isolates the matte, crops and downsamples without redrawing the artwork. Gutters are transparent and the packing audit detects no magenta residue.
- Repack with `node scripts/conquest-art/pack-rice-fields.mjs <master.png> carved|jade|harvest`. The packer refuses to overwrite accepted targets.
- `src/ui/ink/riceFieldArt.ts` selects and preloads the atlas; `DongHoMapRenderer` retains existing field positions, stage selection, mirroring, ground depth and static caching. Tighter crop margins are compensated to keep a comparable world footprint.
- Missing or incomplete new art uses the existing compound family; missing original art still uses the procedural lattice. `mapart=procedural` retains the procedural rendering. Tile assets off continues to disable grass only.
- The existing ground layer is baked in Spring with seasonal color overlays. This change preserves that behavior; five available farming stages do not imply newly animated seasonal crop progression.
- Original assets, other terrain, roads, gameplay rules and user preferences are preserved.

## Review and verification

`output/rice-fields/comparison.html` contains desktop, close and phone selectors, all sprite sheets and playable links. `comparison.png` is a four-way crop of actual gameplay screenshots.

The comparison uses the production build, seed 1337, identical camera and season, and a revealed player-owned map fixture to remove foreign haze. All eight desktop/phone runs preserve the same 51 field placements and four baked Spring stages; all source images enter the static cache below roads. No browser errors. Results: `comparison-report.json`.

Runtime checks cover the default atlas, all five frames, four seasonal overlays, camera drag/zoom, tile-assets-off behavior, the preserved original and corrupt-image fallback. Results: `verification.json`. The installed web-game client renders the production game and emits screenshot/state evidence in `skill-production/`.

TypeScript and the production/offline build pass, with the existing font-path and bundle-size warnings. The asset is included in the generated offline cache. Development-server runs were interrupted by reloads; the completed comparison and skill-client evidence use the production server. No frame-rate or physical-device performance claim is made.
