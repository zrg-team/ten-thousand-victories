# Conquest interface: restrained historical prints

The [v3 historical correction](conquest-ui-v3.md) replaces supplies and all five formation images; the other symbols and preserved dynasty signs below remain current.

The revised icons keep the warm ink contours, broad pigments and hand-cut edges of the game's Đông Hồ art. Small interface marks use a few identifying shapes. Dynasty signs retain their richer illustration because they identify a house rather than an action.

## Meaning audit

| Surface | Final symbol and reason |
| --- | --- |
| Build | One wooden mallet, instead of crossed tools with carved detail. |
| Heroes | A military helmet for the roster of champions; individual portraits remain on the roster. |
| Court | The existing imperial cap, already a clear historical silhouette. |
| Army | Crossed sword and spear for the whole military; three upright spears remain specific to the spear formation. |
| Affairs / diplomacy / ambassador | Joined hands for relations and negotiation, replacing the modern ornamental globe or edict scroll. |
| Story / Chronicle | An open cloth-bound chronicle with sparse ink strokes; scrolls remain edicts and written orders. |
| Food / gold | One rice ear and one square-holed cash coin. |
| Supplies / population | One strapped crate and two villagers in conical hat / wrapped headcloth. |
| Invasion begins | Crossed sword and spear. |
| Invasion defeated | A raised vermilion military standard. |
| Invasion survived with losses | An intact round bamboo shield. |
| Realm overrun | A broken round bamboo shield. |
| Battle stance | Shield, balance scales and blade for defence, balance and pressure. |
| Battle formation | Upright spears, charge arrow, diverging arrows, overlapping round shields, bow and arrow. |
| Leave battle | A folded map, because the action returns to the map. |
| Geography-related choice | Folded map with river, replacing an unrelated leafy branch. |
| Buffalo-feast story | Taking the child in uses a person; making him repay the buffalo uses a buffalo. Leading English verbs had incorrectly produced crown and hammer icons. |
| Navigation / utility | Sparse printed arrows, bars, check, close and magnifiers. Familiar controls retain their conventional meaning. |
| Installation / support | Phone, download tray and tea cup identify device or support actions outside the historical simulation. |

Twelve existing clear illustrations remain: person, imperial cap, purse, gate, edict scroll, sword, command banner, flame, buffalo, hut, branch and ladder. Their silhouettes and period objects already fit the interface. Forty accepted generated images replace the decorated functional marks or add corrected meanings. Two single chevrons are mechanically extracted from the generated pairs; three resource/stance aliases share pixels.

## Assets and reproduction

- Functional atlas: `public/art/conquest-ui-icons/icons-v2.png` / `icons-v2.json`: 54 artworks, 57 meanings, 1024×1024 RGBA, 727,929 PNG bytes / 4 MiB decoded.
- Preserved signs: `public/art/conquest-ui-icons/signs-v1.png` / `signs-v1.json`: 16 original motifs, 512×512 RGBA, 307,766 PNG bytes / 1 MiB decoded. Each frame preserves its original pixels and saved identity.
- [Review sheet](conquest-ui-v2/all-icons.png), showing large artwork and 18/26/36px samples.
- [Base prompts](conquest-ui-v2-prompts.json) and [final historical refinements](conquest-ui-history-refinements.json). Refinements supersede matching base IDs.
- [Accepted source paths and SHA-256 hashes](conquest-ui-v2/generation.json).

Generation used the built-in ImageGen tool, one call per asset. The packer copies accepted masters into the workspace, validates genuine alpha and complete silhouettes, frames the visible print with a small edge allowance, and resizes into padded 120px frames. This framing prevents almost-transparent exterior specks from shrinking an icon. It preserves the original RGBA pixels inside each crop, without drawing, repainting, color-keying or background removal. Intermediate masters and parts live in `output/conquest-ui-v2/`.

```text
python scripts/conquest-art/conquest-ui-v2.py export <id> <accepted-generated.png>
python scripts/conquest-art/conquest-ui-v2.py pack
```

Both atlases load before the menu and retry at the map boundary. The old combined atlas remains a packing source and is excluded from offline installation. All sizes and states share the same textures. Existing labels, control targets, timing and input behavior remain; tint is never applied to the generated pigments.

## Validation

Final checks on 2026-09-10 used a fixed source snapshot on port 5190, avoiding reloads from unrelated concurrent workspace edits:

- `verify-conquest-ui-icons.mjs`: **94/94**. VI 390×844, EN 390×620 and VI 1440×900; all frames, alpha, margins, pigment preservation, direct navigation presses, all four invasion outcomes, decision presses, battle formation input, return-to-map behavior, and failed-load recovery. All sixteen sign frames match the old atlas pixel for pixel.
- `verify-story-choice-icons.mjs`: **71/71**, covering all **134 complex choices**, real prompts, disabled states, Chronicle decisions, scrolling and actual choice resolution. Story screenshots confirm the child/repayment corrections.
- `verify-battle-dock.mjs`: **19/19** on a 620px phone, with no overlapping targets and all exits reachable.
- `verify-banner-editor.mjs`: **20/20**; `verify-kingdom-sign-surfaces.mjs`: **4/4**, including all saved designs, three map themes and battle standards.
- Installed `develop-web-game` client: two final screenshot/text iterations; both inspected. No browser errors in the final runs.
- `npm run build`: passed, including TypeScript and offline worker generation. Both new atlas pairs are in the offline shell; the obsolete UI atlas is excluded. Existing font-path and large-chunk warnings remain.

Screenshots and state: `output/conquest-ui-v2/verification/`; installed skill output: `output/conquest-ui-v2/skill-final/client/`. The new textures total 5 MiB decoded, including 1 MiB reserved to keep dynasty identity art separate from functional UI revisions.
