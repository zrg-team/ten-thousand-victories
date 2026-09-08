# Đông Hồ story choice icons

Story choices and the pending decisions in the Chronicle share fourteen generated bitmap motifs. They use the same warm black contours, vermilion, ochre, indigo and leaf green as the petition and harvest power-card prints.

The pack covers person, crown, grain, purse, scales, wall, scroll, hammer, shield, blade, banner, spark, herd and hut. The current story catalogue uses twelve of these; herd and hut complete the complex choice vocabulary. The existing option IDs still determine meaning through `iconForOption`. Small utility symbols keep their existing drawing code.

## Runtime

- `public/art/story-choice-icons/icons-v1.png` and `icons-v1.json`: a single alpha atlas with fourteen 160×160 frames, four pixels of packing separation on each side, displayed at 36 design pixels.
- `src/ui/storyChoiceIcons.ts`: typed motif list, map-boundary preload, frame lookup and image creation. No download on the initial menu.
- `optionCard` opts into this artwork with `iconArt: 'story'`. Both the interrupt prompt and held Chronicle decisions use it. The text gutter reserves 48 pixels even if an optional download fails; missing art falls back to the existing glyph. Disabled art uses the same 45% alpha as disabled text. Images are not interactive and do not intercept the card's press or scrolling gesture.
- Both atlas files are optional service-worker art, so unavailable artwork does not block offline installation.

## Production and provenance

Generated with built-in ImageGen, one call per motif. Exact initial prompts, style references and targeted transparency-repair prompts are in `dong-ho-story-icon-prompts.json`; accepted source paths and part hashes are in `dong-ho-story-icon-generation-log.json`.

`scripts/conquest-art/story-choice-icons.py export <id> <generated.png>` preserves the generated alpha, trims only empty outer margins, resizes the complete image and centers it in a padded frame. Alpha is validated before export; near-invisible alpha specks are ignored only when checking that the silhouette is not clipped. No colour-keying or procedural repainting is used. `pack` assembles the atlas and produces `dong-ho-story-icons/all-icons.png`, which shows both enlarged and actual-size previews. Masters and intermediate parts stay under `output/story-choice-icons/`.

## Verification

Run `node test_scripts/verify/verify-story-choice-icons.mjs` against the local development server (`DEV_URL`, default port 5183). The suite checks every complex option in the catalogue, decoded alpha and padding, actual prompts for each used motif, disabled choices, held Chronicle decisions, missing-art fallback, wheel scrolling and a real choice resolved by clicking the generated image. It covers Vietnamese phone/desktop and short English phone layouts. Screenshots and results go to `output/story-choice-icons/verification/`.

Verified 2026-09-08: 68/68 icon checks (all 134 complex choices), 80/80 story illustration checks, and 49/49 existing card-print checks passed without browser errors. TypeScript and the production build passed with the existing font-path and bundle-size warnings. The built service worker contains both atlas files as optional art. The PNG atlas is 371,766 bytes. Reviewed the contact sheet, real phone/desktop prompts and held decisions, disabled art, resolved choice state, and the installed web-game client's screenshot/text output. Some legacy story fragments lack localized copy; visual fixtures prefer complete localized beats while renderer coverage still includes every complex option.
