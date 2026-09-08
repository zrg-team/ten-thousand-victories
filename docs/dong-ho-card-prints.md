# Đông Hồ power and story prints

Expansion requested on 6 September 2026: at least 50 new images matching `public/art/story-prints`.

## Artwork and coverage

- One distinct new scene for each of the 50 existing power card IDs, including ordinary drafts, story rewards, evolutions, and the eight founding advantages. No card IDs, effects, rarity or saved collections change.
- Original `harvest`, `muster`, and `petition` prints are retained, making a 53-image card pool. The [12 story settings added on 8 September](dong-ho-story-settings.md) bring the runtime folder to 65 illustrations.
- Full card faces share the new mappings through `src/ui/storyPrint.ts`; the draft detail and opening power choices use the same selection.
- Sixteen selected Chronicle moments use matching scenes. The mapping names exact fragments so an image does not reveal a future outcome throughout an entire story. The actual speaker keeps their own portrait.
- Images are symbolic scenes, not precise portraits or claims of dynasty-specific uniform reconstruction. Other story moments now use [generated setting prints](dong-ho-story-settings.md); procedural bands are a missing-art fallback only.

## Shared visual rules

Bold warm-black carved contours; expressive simplified faces; broad flat vermilion, ochre, muted leaf-green and indigo shapes; pale shell paper; shallow folk-print space; sparse carved details and lightly imperfect pigment registration. No text baked into the art, realistic shading, glossy rendering or fantasy armour. Strong complete silhouettes take precedence over dense decoration.

The original three prints were supplied as style references in every individual ImageGen call. Fifty separate subjects were generated individually, not cropped from repeated contact sheets. The runtime exports fit the complete drawing into 576 × 384 WebP images without clipping. The 50 new files total 3,552,736 bytes (3.55 MB). Large PNG masters are retained for later reuse. Mechanical resizing/encoding is the only post-processing.

## Files and provenance

- Runtime artwork: `public/art/story-prints/<card-id>-v1.webp`.
- Original generated masters copied into the project: `output/dongho-card-prints/masters/<card-id>.png`.
- [All 50 exact prompts](dong-ho-card-print-prompts.json).
- [Generation log and original output paths](dong-ho-card-print-generation-log.json).
- Runtime catalogue: `src/ui/storyPrintAssets.json`.
- Mode: built-in ImageGen; no API/CLI image-generation fallback.

The pack is optional service-worker art, with icon/band fallbacks. Runtime resolution is deliberately smaller than the masters to limit download and texture-memory growth on phones. Complete images are fitted into existing card bounds instead of stretched or cropped.

## Review boards

![Prints 01–10](dong-ho-card-prints/prints-01-10.jpg)
![Prints 11–20](dong-ho-card-prints/prints-11-20.jpg)
![Prints 21–30](dong-ho-card-prints/prints-21-30.jpg)
![Prints 31–40](dong-ho-card-prints/prints-31-40.jpg)
![Prints 41–50](dong-ho-card-prints/prints-41-50.jpg)

## Verification

Completed on 6 September 2026:

- All 50 new files have distinct SHA-256 hashes, valid 576 × 384 dimensions, individual prompts, provenance records, and PNG masters. All 53 runtime textures load.
- `test_scripts/verify/verify-dongho-card-prints.mjs`: **49/49 checks passed**, with zero browser errors. Covered all 50 power mappings and card-face bakes; all 16 selected story moments; Vietnamese at 390 × 844 and English at 390 × 620; opening choices; scrolling and pointer input; and missing-art icon/band fallbacks.
- Inspected every generated image, all five review boards, all 50 baked card faces, and representative in-game story, draft, opening-choice and fallback screenshots. The complete illustration fits the card; scrolling can temporarily move part of it behind the story viewport, as expected.
- The required web-game Playwright client passed. Its screenshot and `render_game_to_text` output agree on the Vietnamese menu state. The dedicated card/story harness exercised the gameplay surfaces beyond that menu smoke test.
- `npm run build` and scoped whitespace checks passed. The build retains its existing large-bundle and runtime-font warnings. Service-worker verification found **53 optional story prints and zero install-critical story prints**.

The river-stakes timber choice uses the Bạch Đằng illustration. The retired `nam-quoc` whisper was excluded because it cannot open a story card; its Thơ Thần illustration remains available on the power card.

Local verification artifacts: [results](../output/dongho-card-prints/verification/results.json), [power draft](../output/dongho-card-prints/verification/power-draft-vi-844.png), [opening choices on a short phone](../output/dongho-card-prints/verification/mandate-en-620.png), [story choices after scrolling](../output/dongho-card-prints/verification/story-choice-bottom-en.png), and [missing-art fallback](../output/dongho-card-prints/verification/missing-print-vi.png).
