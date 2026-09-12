> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Đông Hồ visual language — first implementation pass

This implements priorities 1, 2 and 5 from the graphics assessment originally referenced at `docs/graphics-review-2026-09-05/review.md`. The original note described that assessment and its screenshots as the pre-change baseline; that referenced folder is not present in this checkout.

## The common drawing language

The visual reference is Vietnamese Đông Hồ folk woodblock printing: distinct contour and color blocks, expressive figures, shallow symbolic space, and compositions that tell an action. The material context is summarized by [UNESCO](https://ich.unesco.org/en/decisions/20.COM/7.A.1). These are game art-direction choices informed by that tradition, not a claim that generated illustrations are historical artifacts or authenticated costume reconstructions.

| Element | Rule |
|---|---|
| Contour | One decisive warm-black contour; light, controlled variation. Small UI frames do not receive heavy multiple outlines or a surrounding halo. |
| Pigment | Broad red, ochre, leaf-green and indigo shapes on light shell paper. Preserve color strength instead of adding a global aging filter. |
| People | Expressive faces, hands and poses; complete head/neck/shoulder relationships; simple, deliberately drawn silhouettes. |
| Soldiers | Separate readable bodies, simple garments and clear weapons. Costume specificity belongs to the existing documented era rules. |
| Buildings | Recognizable roof, timber structure and entrance expressed as large readable masses; fewer interior marks than exterior ones. |
| Landscape | Rice, buffalo, lotus and bamboo support the scene's story; foliage and clouds use decorative rhythms and shallow space. |
| Interface | Light paper, flat color, restrained registration, one contour. Typography carries precise information; illustration carries identity and action. |
| Scale | Judge at 390 CSS pixels wide. Labels and status scraps remain sharp and have a maximum apparent size as the world zooms. |

The three prints below are the reference family: they put people, a village levy, rural architecture, vegetation and court objects under the same drawing rules. The runtime card and interface treatment pairs them with a quieter ink frame. This establishes a direction for future portrait and terrain work.

![Rice collection](../../public/art/story-prints/harvest-v1.webp)

![Village muster](../../public/art/story-prints/muster-v1.webp)

![Court petition](../../public/art/story-prints/petition-v1.webp)

## Priority 1 — map clarity

- Render nameplates and progress numbers at a suitable text resolution.
- Cap annotation growth at a map zoom of 1.15; keep hit geometry aligned with the scaled visible plate and retain generous touch padding.
- Combine each progress glyph, number and progress line in one compact paper scrap, anchored above the measured settlement roof bounds.
- Use light paper and a single ink contour; a capital's outline gets the red accent.
- Keep the full advisor event in the upper strip; the temporary lower signpost names its target lane instead of repeating the entire event.

## Priority 2 — shared style

The UI uses calmer, nearly square print edges, restrained color registration, one main contour, and no button catchlight or drop shadow. Additional framing belongs to ceremonial panels only. The print family is reused in the card face and decision sheet rather than assigning each screen unrelated clip art.

## Priority 5 — illustrated decisions

- Economy power cards use the rice print; military cards use the muster; court and mandate cards use the petition. Each retains its own semantic symbol and name.
- The raised card's detail panel displays its matching print when space allows; small screens retain the illustrated card face and all action controls.
- Recruitment proposals, envoy decisions, law choices and chancery instruments show a print in their existing scroll body. Scrolling and measured card heights continue to place every choice within reach.
- Prints are optional presentation: missing art leaves the original decision flow and card icon available.

## Asset provenance

The three scenes were generated with the built-in ImageGen tool, reviewed together, and encoded as 768×512 WebP runtime assets (about 411 KiB combined). [Full generation prompts](../dong-ho-vignette-prompts.md) are preserved. The originals are retained under `output/imagegen/dongho-vignettes/` in the working directory. The shipped assets are [harvest](../../public/art/story-prints/harvest-v1.webp), [muster](../../public/art/story-prints/muster-v1.webp) and [petition](../../public/art/story-prints/petition-v1.webp), so the game does not depend on an external generated-image directory.

No generated scene names a ruler or claims a particular dynasty's uniform. Existing historical wardrobe distinctions and the research in `research/vietnamese-hero-wardrobe.md` remain the basis for era-specific characters.

## Verified result — 5 September 2026

- Production TypeScript, Vite and service-worker builds pass. All three prints appear in the offline shell asset list. Vite still reports its existing large-bundle and runtime font stylesheet warnings.
- `verify-dongho-presentation.mjs` passes in English at 390×844 and Vietnamese at 390×844 and 390×620, at device pixel ratio 2 and medium graphics. It checks complete 3:2 print fitting, actual pointer choices on all five illustrated prompt types, scrolling to the last choice on shorter sheets, and safe behavior when an optional print is unavailable. No browser errors were reported.
- At 0.6×, 1.2× and 2.4× map zoom, label touch geometry follows the scaled plate. Label textures use resolution 3 or higher; the new progress plate stays below 76 design pixels wide at close zoom.
- Existing checks pass: land tapping 4/4; muster proposal behavior 7/7; all 11 settlement layouts, plus the live map's 42 labels with zero label/structure overlaps.
- The required web-game client passes; its menu screenshot and text state were inspected. A separate seeded realm was progressed to turn 66 / wave 4 / four provinces and reviewed at 1.2× and 2.4×, including a real siege marker and its alert. This is local browser QA, not a physical-phone performance measurement.
- Visual QA led to two additional layout fixes: the card gesture hint is measured above its take button, and the recruitment summary grows with a wrapped location caption.

![Illustrated power choice in Vietnamese](../dong-ho-first-pass/power-vi-844.png)

![Busy realm at normal reading zoom](../dong-ho-first-pass/map-busy-1.2.png)

![The last recruitment choice remains reachable on a short phone](../dong-ho-first-pass/muster-vi-620-bottom.png)

## Completed asset rollout and wider limits

The 6/10 assessment is the saved pre-change baseline; it does not establish a new whole-game score. The [soldier and building continuation](../dong-ho-soldiers-buildings.md) is complete at **234/234**, including repaired Đinh trained armour. The [map continuation](../dong-ho-map-style.md) adds **91/91** seasonal plants, mountains, fields, bridge, villagers, animals, carts, birds, markers and walk sheets. All **325** selected asset entries now share the approved drawing family. Medium/high foliage, relief and structures retain their source contours at close zoom, with view culling and a common ground order.

Ground and fog caches can still soften when enlarged, as can the History page's small soldier animation asset. Modular portraits and the menu illustration are separate art systems; named historical episodes would benefit from their own researched compositions. These broader refinements are outside the completed soldier, structure and map-tile rollout.
