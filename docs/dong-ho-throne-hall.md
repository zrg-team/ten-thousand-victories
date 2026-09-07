# Đông Hồ opening throne hall

The “Tân vương đăng cơ” opening-choice page now uses an authored Đông Hồ palace illustration matching the existing power-card prints. Bold warm-black contours, vermilion roofs and columns, ochre throne and leaf-green ornament replace the procedural hall whenever the image is available. The empty seat, paired bronze urns, court steps and two live player standards retain the page's meaning.

- Runtime: `public/art/ascent/throne-hall-dongho-v1.webp` — 1032 × 557, 173,946 bytes.
- Master: `output/throne-hall/masters/throne-hall-dongho-v1.png`.
- Built-in ImageGen; [exact generation and correction prompts](dong-ho-throne-hall-prompts.json). The first result painted a checkerboard; the approved correction uses opaque shell paper. Only mechanical resizing and WebP encoding followed generation.
- References: `public/art/story-prints/petition-v1.webp` and `harvest-v1.webp`.
- Rendering: `src/ui/ascent/throneHall.ts`; preserves the complete aspect ratio, existing responsive height and live player flags. No baked text or flags.
- Loaded at the map scene boundary. The service worker treats the new image as optional art; unavailable art uses the existing procedural hall.

Verified 7 September 2026: production build, TypeScript and scoped whitespace checks passed. Eleven targeted checks cover Vietnamese 390 × 844, English 390 × 620 and Vietnamese 1440 × 900, complete print fit, two live standards, three choices without scrolling, pointer selection and the missing-art fallback, with no browser errors. The required web-game client also passed; menu screenshot and text state were inspected. Existing build warnings concern runtime fonts and bundle size.

Verification artifacts and the local reproduction script are in `output/throne-hall`; desktop test clicks account for the canvas CSS position and camera scaling. Fallback verification bypasses the texture lookup during redraw rather than destroying a texture that a fading prior image still owns.

![Updated opening page](../output/throne-hall/verification/mandate-vi-390x844.png)
