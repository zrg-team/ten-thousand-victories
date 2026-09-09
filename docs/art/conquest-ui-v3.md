# Historical supplies and formation icons

The current formation uniforms and fight symbol are in [revision 4](conquest-ui-v4.md). This document records the original troop-icon revision.

This revision replaces the six v2 symbols called out in review. Generated raster artwork keeps a restrained Đông Hồ palette and thick printed contours, while the subjects now describe premodern materials and groups of soldiers.

| Runtime ID | Meaning | Replacement subject |
| --- | --- | --- |
| `supplies` | Vật tư / materials | Rope-bound bamboo and timber; coarse utilitarian lashings |
| `spears` | Dựng giáo / brace spears | A shallow rank of infantry bracing spears |
| `horse` | Xung phong / charge | Infantry advancing in a pointed wedge |
| `skirmish` | Tản ra / spread | Skirmishers separated by open ground |
| `tortoise` | Giương khiên / raise shields | A compact overlapping bamboo shield wall |
| `bows` | Bắn / shoot | Crossbowmen in a staggered firing rank |

`horse` remains an internal compatibility ID. The formation data allows every doctrine to choose a wedge, including armies without cavalry; the illustration therefore uses infantry. The shooting order corresponds to the game's Thế Nỏ formation.

The shared loader now uses `public/art/conquest-ui-icons/icons-v3.png` and `.json`. All six replacements propagate to resource bars, cost chips, battle orders, guides and order bubbles through the existing semantic IDs. All 51 other frame entries keep their v2 pixels and coordinates. The separate sixteen dynasty signs retain their existing atlas. Earlier UI atlases remain reproducible packing inputs and are excluded from the offline shell.

Art was generated with **built-in ImageGen**. Exact prompts: [conquest-ui-v3-prompts.json](conquest-ui-v3-prompts.json). Accepted sources, workspace master paths, hashes and framing rectangles: [generation.json](conquest-ui-v3/generation.json). The packer only crops rectangular transparent margins, scales, and packs the generated RGBA; it never repaints the images or synthesizes alpha.

Rebuild with the bundled Python runtime containing Pillow:

```text
python scripts/conquest-art/conquest-ui-v3.py export <id> <generated.png>
python scripts/conquest-art/conquest-ui-v3.py pack
```

Review sheet: [historical-icons.png](conquest-ui-v3/historical-icons.png), including 15, 18, 30 and 42 pixel samples. Runtime dimensions and hit areas remain unchanged.

The final 15/18/30/42px sheet, resource bar, battle dock and installed web-game client screenshots have been visually inspected. TypeScript and production build pass. The offline shell includes both v3 files and preserved sign files, and excludes both older UI atlases. Story coverage passes 71/71 checks across 134 choices; the compact battle dock passes 19/19 checks. The UI atlas remains 1024 square (4 MiB decoded), 753,398 PNG bytes.

Live icon coverage includes every generated frame, original sign pixel comparisons, all five actual formation presses and stamina costs, three viewports (VI 390×844, EN 390×620, VI 1440×900), and loading-failure recovery. Input fixtures pause the simulation scene during order assertions so AI and economy ticks cannot race real pointer events. The final run uses the frozen source server on port 5192; this server was started after exporting the new files because its static asset inventory is frozen at startup.

Final result: **106/106 icon checks pass**, **71/71 story checks pass**, **19/19 compact dock checks pass**; no browser errors. The installed develop-web-game client completed two screenshot/text iterations, both inspected. Production build warnings are the existing font-path and large-chunk notices.
