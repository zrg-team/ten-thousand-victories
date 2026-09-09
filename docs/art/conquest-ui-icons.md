# Conquest — generated Đông Hồ icons

This original pass is superseded by [the restrained historical UI revision](conquest-ui-v2.md). The v1 atlas remains the pixel source for the preserved dynasty signs.

The Conquest interface uses one shared atlas of generated folk-print illustrations. Thick warm-black contours, flat vermilion, ochre, indigo and leaf green, and sparse carved hatching replace procedural icon paths, resource SVGs and font symbols.

## Coverage audit

| Surface | Artwork and behavior |
| --- | --- |
| Resource bar | Rice, supply crates, cash coins and people; 18px images beside the existing values and alerts. |
| Main navigation | Fight, Build, Heroes, Court, Army, Diplomacy and Chronicle; the same semantic IDs feed the generated images. |
| Battle | Three stances, five formations, person/heart rails, command bubbles, formation guides, crossed weapons, selection check, advantage chevrons and four footer actions. |
| Decisions | All 37 card-icon meanings; 36px artwork in a 48px gutter, including the hammer/house/hourglass rebuilding prompt. All 134 complex story options share this atlas. |
| Map and utility controls | Zoom, map mode, pause/play, menu, close, previous/next, checkboxes, disclosure arrows and power-change markers. All five map order types use generated imagery in each of the three map themes; the Đông Hồ theme retains its existing generated marker prints. |
| Lanes and inheritance | Commanded-host banners, marked-province title, dynasty identity, adviser/Chronicle disclosure arrows and the blinking inheritance caret. |
| Dynasty symbols | All 16 saved designs, shared by the picker, seals, cloth banners, map flags and battle standards. The original `crown` save ID still means the bronze drum. Field and trim colors remain on the cloth; generated artwork retains its pigments. |
| Invasion announcements | Crossed weapons for marching, chim Lạc for triumph, lotus for holding, and a breached wall for defeat. Existing timing, dismissal and celebration animation remain. |

Paper borders, diagram connectors, numeric meters, notification dots and animated impact rings remain geometry. They are layout, data visualization or motion effects. Existing map illustrations and hero portraits retain their own asset systems.

## Assets and provenance

- Runtime: `public/art/conquest-ui-icons/icons-v1.png` and `icons-v1.json`.
- Review sheet: [all-icons.png](conquest-ui-icons/all-icons.png), with enlarged artwork and 18/26/36px previews.
- Exact prompts: [conquest-ui-icon-prompts.json](conquest-ui-icon-prompts.json).
- Accepted masters and SHA-256 hashes: [generation.json](conquest-ui-icons/generation.json).
- Generation mode: built-in ImageGen, one call per asset. No API/CLI image-generation fallback.

There are 46 new generated artworks and fourteen reused story motifs, plus two mechanically extracted single-chevron variants: 62 packed images and 65 semantic frames including aliases. The PNG is 1,077,604 bytes, 1024×1024 RGBA (4 MiB decoded), with 120px frames and four pixels of separation on each side. One texture serves all sizes and control states. The old story atlas remains as a packing source; the game loader does not fetch it or the replaced resource SVGs.

`src/ui/conquestUiIcons.ts` loads the atlas before the menu and retries at the map boundary if loading failed. Images do not intercept input. Active/disabled states use existing labels, backgrounds, rims and alpha; the artwork is never tinted. On a failed download, labeled controls reserve their gutter and omit the missing image; utility buttons retain a small readable text fallback.

## Reproduction

Use Python with Pillow:

```text
python scripts/conquest-art/conquest-ui-icons.py export <id> <generated.png>
python scripts/conquest-art/conquest-ui-icons.py pack
```

The exporter copies each accepted generated master to `output/conquest-ui-icons/masters/`, verifies actual transparency and complete silhouette margins, trims only empty outer margins, and resizes into a padded frame. It preserves generated alpha without background removal, color-keying or repainting. The packer isolates one connected printed chevron from each double-chevron asset for the single-chevron variants. Intermediate parts live under `output/conquest-ui-icons/parts/`.

## Verification

Run against Vite with `DEV_URL` set to its address:

```text
node test_scripts/verify/verify-conquest-ui-icons.mjs
node test_scripts/verify/verify-story-choice-icons.mjs
node test_scripts/verify/verify-fight-screen.mjs
node test_scripts/verify/verify-banner-editor.mjs
node test_scripts/verify/verify-kingdom-sign-surfaces.mjs
```

The icon suite checks every frame's pixels, alpha, margins, palette and input behavior; live Vietnamese phone/desktop and short English phone screens; every lane; real rebuilding and formation presses; all dynasty symbols and announcement emblems; and intentional asset-load failure/retry. Screenshots and JSON evidence are written to `output/conquest-ui-icons/verification/`. The installed develop-web-game client is also exercised through `skill-conquest-smoke.mjs`, using its loopback proxy and screenshot/text capture.

Verified 2026-09-09: 82/82 Conquest icon checks, 68/68 story-choice checks, 16/16 fight-screen checks, 19/19 short-phone battle-dock checks, 20/20 banner editor checks and 4/4 kingdom-sign surface checks all passed. TypeScript and the production build passed with the existing font-path and large-chunk warnings. The built service worker includes both shared atlas files in the shell cache. The installed skill client completed both input/screenshot iterations without browser errors; its screenshot and text evidence is under `output/conquest-ui-icons/skill-final/client/`.

Concurrent workspace edits caused Vite to reload pages during two test attempts. Final icon and story checks passed against a fixed source snapshot served locally on port 5187; the snapshot and temporary server are under `output/conquest-ui-icons/`. The final live captures, contact sheet, dynasty designs, battle contact mark, rebuilding cards, announcement emblems and small controls were inspected visually.
