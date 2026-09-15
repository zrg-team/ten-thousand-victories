# Vietnamese rice paddies — research and implementation

> Superseded: the user rejected this version's independent rectangular plots, then rejected the oversized flat crop material on the corrected tile shapes. Preserve the research and asset provenance below as history. The current work uses full connected terrain tiles, one outer bund, and small upright crop sprites; see [rice tiles v5](rice-tiles-v5.md).

## Direction corrected on 16 September 2026

The previous borderless material is rejected. It made almost every agricultural or neighboring plain tile look flooded, mixed trees into the crop, repeated tiny shoots, and never grew beyond Spring. The user's latest references and explicit request supersede the earlier instruction to remove borders.

### Research used

- [UNESCO: Craft of making Đông Hồ Folk woodblock printings](https://ich.unesco.org/en/USL/craft-of-making-ong-h-folk-woodblock-printings-01737): carved woodblocks, natural pigment impressions, shell-coated paper, and black outlines printed last. The game adaptation uses bounded color masses, narrow dark contours, and hand-drawn rice forms; no watercolor fading or floating plinths.
- [Viet Nam National Authority of Tourism: Đông Hồ craft](https://vietnamtourism.vn/en/index.php/news/items/18832): indigo blue, flower-derived yellow, shell white, and soot black. Screen colors are artistic approximations, not measured historic pigment specifications.
- [IRRI: Water management in irrigated rice, §5.1.4](https://knowledgebank.irri.org/ewatermgt/courses/course1/resources/books/WaterCourse1.pdf): compacted maintained bunds limit seepage and retain shallow ponded water. Hence closed basins with a grassy earth crest and darker wet face; neighboring plots share one bund.
- [IRRI: Crop calendar](https://www.knowledgebank.irri.org/step-by-step-production/pre-planting/crop-calendar): the sequence includes preparation, establishment, growth, harvest, and fallow. Crop durations differ by variety. Young rice exposes water; mature growth fills the surface; harvested plots expose mud and cut stalks.
- [Interacting effects of land-use change and natural hazards on rice agriculture, NHESS, 2021](https://nhess.copernicus.org/articles/21/1473/2021/index.html): the Red River Delta has a February–June crop and a July–October crop, unlike the Mekong Delta's calendar. This informs a northern lowland visual convention, not a historical simulation of every Vietnamese region.

### Reading the supplied references

The game screenshot identifies the problems. The three agricultural paintings guide field structure, vivid green/gold growth, muddy harvest areas, water, and tree placement beyond basins. Their painting medium is not treated as an authentic Đông Hồ print: the final game art translates their agricultural content into the game's woodcut vocabulary.

## Four-season convention

| Game season | Dominant appearance | Variation |
| --- | --- | --- |
| Spring | Flooded young planted rice | A few unplanted water basins and established green crops |
| Summer | Dense green canopy | Some first-harvest gold and newly planted second-crop plots |
| Autumn | Ripe hòe gold and nodding grain | Some harvested plots |
| Winter | Damp brown soil and cut stubble | Same persistent basin boundaries; no snow on rice |

The game has four calendar states, so this is a compressed art direction. Weather and trees retain their existing systems. Geometry does not change when the calendar advances.

## Renderer

- Select compact holdings of adjoining irregular quadrilaterals inside actual agricultural terrain; do not expand rice into plain tiles. Omit small fragments and space separate holdings apart.
- Reserve settlement compound clearance and entire vegetation crown boxes before placing props.
- Generate each shared bund once, from identical polygon endpoints. Roads remain above the rice pass.
- Clip the authored crop material into those polygons. One small resident atlas replaces the old 18 MiB neighbor-mask atlas. The material master has no scenery, borders, trees, or people.
- Repaint material frames and basin drawing through the existing seasonal scenery refresh, then include them in the cached map chunks. No per-frame crop drawing.
- The tile-assets switch and missing-art path retain procedural seasonal basins.

## Asset provenance

[`public/art/ground/dongho-rice-seasons-v3.webp`](../../public/art/ground/dongho-rice-seasons-v3.webp): generated with the built-in imagegen tool. The user's fourth attachment supplies agricultural reference; the first supplies game line-weight context. The prompt explicitly rejects the old rice texture. [Full generation prompt](rice-paddies-v3-prompt.txt).

Master preserved at `output/rice-paddies/master-v3.png`. `scripts/conquest-art/pack-rice-print.mjs` mechanically resizes the 2×2 sheet to 768×512 WebP; it does not draw replacement artwork. Runtime projection/clipping follows the parcel geometry.

## Verification

The initial procedural prototype was rejected internally: only two holdings survived, and its small silhouettes did not match the richer existing art. The authored crop material was selected after comparing actual game renders: leaves and nodding panicles read as a full canopy, while Spring water and Winter stubble remain distinct.

- `npm run build`: passed (existing font-path and bundle-size warnings).
- `node test_scripts/verify/verify-rice-paddies.mjs`: all 15 checks passed on the final build. Desktop High and 390×844 phone Medium; four seasonal screenshots, tile-assets off, and a deliberately unavailable crop texture.
- Zero intersections between crop polygons and rendered tree or settlement bounds. Dense independent footprint sampling found zero non-agricultural pixels after exact convex terrain checks replaced the initial coarse test.
- Four distinct crop-atlas pixel hashes; identical parcel geometry; an actual economy tick advances Winter to Spring and reproduces Spring's crop pixels. Terrain rebuild disposes the previous atlas. Ground sources are cached; roads remain above them.
- Final seed-1337 fixture: 28 plots in eight holdings, 22 shared bunds, 8.2% of eligible agricultural area. Crop artwork is 269,316 bytes on disk; source and projection textures total 3 MiB decoded for this fixture.
- The installed develop-web-game Playwright client completed its action/screenshot/state loop twice. Final screenshots were opened and inspected, and no browser errors were recorded.
- The initial ordinary fogged capital view was also inspected: that forest/plains start has no qualifying paddies. Agricultural appearance is tied to eligible farmland rather than forced around every settlement.

Evidence: `output/rice-paddies/verification.json`, `desktop-*.png`, `phone-*.png`, and `skill-final/`. The review page compares the same camera in all four seasons and includes the user's rejected screenshot. This is browser viewport verification, not physical-device testing.
