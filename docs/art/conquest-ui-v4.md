# Consistent formation uniforms and Đông Hồ fight print

Archived revision. The current runtime uses [v5: three shooters and consistent troop scale](conquest-ui-v5.md).

The user approved the soldier formation icons currently in the game. This revision retains that direction and the original spear rank. Four formations now share its indigo cross-collar tunics, red waist sashes, dark brown knee-length trousers, ochre conical hats and bare lower legs with simple dark shoes.

| Runtime ID | Meaning | Final composition |
| --- | --- | --- |
| `spears` | Dựng giáo | Original approved compact spear rank, pixel-preserved from v3 |
| `horse` | Xung phong | Three soldiers charging right in a tight wedge, matching indigo uniforms |
| `skirmish` | Tản ra | Three soldiers in a loose staggered line, all facing right with parallel forward-pointing spears |
| `tortoise` | Giương khiên | Overlapping round shields, matching hats, visible tunics, trousers and shoes |
| `bows` | Bắn | Standing and kneeling crossbowmen, matching uniforms, both aiming right |
| `crossed-weapons` | Fight | Crossed curved sabres with carved ink contours, ivory and indigo blade pigments, ochre collars and red grips |

The fight art is shared by the 40px battle contact marker and existing battle/army navigation meanings. Existing contact pulse and strike animations remain attached to the image container. The internal `horse` ID still denotes the charge formation for all doctrines; it does not require cavalry.

The runtime atlas is `public/art/conquest-ui-icons/icons-v4.png` and `icons-v4.json`. Only five frame rectangles change; all 52 other frame entries retain their v3 pixels and coordinates. This includes the approved spear rank and bamboo/timber materials icon. All sixteen saved dynasty signs retain their separate `signs-v1` atlas. Earlier UI atlases are excluded from the offline shell.

Generated using **built-in ImageGen**. [Final prompts](conquest-ui-v4-prompts.json), [accepted sources and hashes](conquest-ui-v4/generation.json), and [review sheet at UI sizes](conquest-ui-v4/historical-icons.png). Reference-edit drafts with baked checkerboard backgrounds were rejected; accepted source PNGs contain generated alpha. The packer only frames, resizes and packs those pixels, without painting or manufacturing transparency.

```text
python scripts/conquest-art/conquest-ui-v3.py --revision 4 export <id> <generated.png>
python scripts/conquest-art/conquest-ui-v3.py --revision 4 pack
```

Validation complete: **109/109 live icon checks pass** on VI 390×844, EN 390×620 and VI 1440×900, with no browser errors. Coverage includes all 57 frames, every actual formation press and stamina cost, the 40px fight contact marker, preserved dynasty-sign pixels, navigation and failed-download recovery. TypeScript and production build pass; the offline shell contains only v4 UI files and the preserved sign files. The atlas remains 1024×1024, 4 MiB decoded, and is 749,210 PNG bytes.

The installed develop-web-game client completed two interaction/screenshot/text iterations without browser errors. Reviewed the 15/18/30/42px art sheet, both phone battle screens, desktop battle screen, and final map interaction screenshot/text. Reports and screenshots are in `output/conquest-ui-v4/verification` and `output/conquest-ui-v4/skill-verified`.

Final verification used port 5194 with both source and public assets copied into one stable snapshot. An earlier run overlapped a separate workspace image-format conversion, which temporarily removed PNG files; those files were restored before the successful run. No image-format repair or unrelated art change is part of this revision. Existing build font-path and large-chunk notices remain.
