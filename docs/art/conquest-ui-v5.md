# Three-shooter formation and consistent troop scale

The shooting icon now contains exactly three standing crossbowmen, all aiming right. All five formations share indigo tunics, vermilion waist sashes, brown trousers and plain ochre conical hats. Tản ra uses a compact loose line with clear gaps between the soldiers, facing the same enemy direction.

Troop scale is based on the visible hat-to-sole height, rather than the outer weapon bounds. The approved spear rank, charge and shield wall are uniformly reframed from their existing generated masters. The charge keeps its forward lean with a 0.9 pose-height factor. No soldier is stretched and no weapon is clipped. The dock also gives every formation the same glyph scale and baseline, including when a translated caption wraps and after the press animation returns to rest.

The fight emblem uses fuller crossed curved sabres, shell-white and indigo blade areas, ochre guards, vermilion grip wraps and a few restrained impact chips. Uneven carved outlines and visible print grain strengthen the Đông Hồ appearance at small UI sizes. The same artwork serves the battle contact marker and existing fight/army meanings.

Generated using **built-in ImageGen**, one original per motif. Three new illustrations replace shooting, loose formation and fight; three approved illustrations are only reframed. [Exact prompts and sizing](conquest-ui-v5-prompts.json), [accepted sources and hashes](conquest-ui-v5/generation.json), and [review sheet at UI sizes](conquest-ui-v5/historical-icons.png). Generated transparency is preserved; rejected drafts with baked backgrounds are not used. The packer only crops, uniformly resizes and packs source pixels.

Runtime files are `public/art/conquest-ui-icons/icons-v5.png` and `icons-v5.json`: 57 semantic frames, 1024×1024, 4 MiB decoded, 747,368 PNG bytes. Six frames are processed. Five have changed pixels; charge already fits the target scale and stays pixel-identical. All 52 unchanged frame entries retain their v4 pixels, and every frame keeps its coordinates. Earlier UI atlases are excluded from the offline shell.

```text
python scripts/conquest-art/conquest-ui-v3.py --revision 5 export <id> <generated.png>
python scripts/conquest-art/conquest-ui-v3.py --revision 5 pack
```

The separate saved-sign atlas follows the workspace's concurrent WebP conversion. Its validation keeps alpha exact and applies the converter's flat-art bounds: opaque RGB delta at most 2 and alpha-weighted RMSE at most 1. Measured against the original sign pixels: alpha delta 0, opaque delta 1, RMSE 0.873. Atlas metadata identifies the format because Phaser can use blob URLs for its decoded images.

Validation complete: **115/115 icon checks** at VI 390×844, EN 390×620 and VI 1440×900; **19/19 compact battle-dock checks**; no browser errors. Coverage includes all 57 frames, all 15 real formation presses and stamina costs, shared scale/baseline before and after presses, the 40px fight marker, navigation, and failed-download recovery.

The installed develop-web-game client completed two interaction/screenshot/text iterations. The art sheet, both phone battle screens, desktop battle screen and final map interaction screenshot/text were inspected. Reports and screenshots are in `output/conquest-ui-v5/verification` and `output/conquest-ui-v5/skill-verified`.

TypeScript and production build pass. The offline shell includes v5 and the current WebP sign atlas; earlier Conquest UI atlases are excluded. The final browser run used a fixed source/public snapshot on port 5197, and the changed game source still matches that tested snapshot. Existing font-path and large-chunk build notices remain. Asset/frame comparison and offline checks are recorded in `output/conquest-ui-v5/final-artifact-check.json`.
