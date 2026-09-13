# V6 — a game action in the approved Đông Hồ style

The user subsequently selected **C: river ambush**. [V7](../game-icon-v7/README.md) is the approved identity and active source across the menu, stores and platforms. The clash review below is historical.

2026-09-06. Current mobile build candidate: **attack meets defense**, a spearman striking a braced shield. The user approved the Đông Hồ drawing style but rejected the previous isolated subjects. This new subject is a design recommendation awaiting their feedback, not a recorded user selection.

![Refinement and mobile previews](refinement-and-mobile.png)

## What changed

The icon now depicts an interaction from the game's combat vocabulary. Two opposing units, a forceful spear diagonal and one impact on a large shield communicate attacking and defending. The red and green figures remain distinct when reduced. The final artwork preserves the folk-print contours and pigment blocks from the supplied references.

We generated three action concepts, compared them at 256, 64, 48 and 32 px, and refined the formation clash twice. The first refinement reduced six soldiers to two but introduced an unwanted oval frame. The second removed it and extended the lower garments into a close square crop.

The formation system in [the combat design](../../phase-1/19-five-shapes-one-clock.md) and [the implementation](../../../src/data/ascent/formations.ts) provides the gameplay connection. This is an illustrative attack/defense moment, not a screenshot or a claim that this individual duel is a playable mode.

## Outputs

- [1024 px square PNG](final-1024.png), [512 px PNG](final-512.png), [Android adaptive layer](adaptive-1024.png).
- [Three candidate comparison](comparison.png), [critique](critique.md), [export verification](verification.json).
- [Original concept prompts](prompts.json), [first refinement](refinement-prompt.txt), [second refinement](refinement-2-prompt.txt).
- `*-master.png` retain the original generated images. `export-review.ps1` mechanically resizes them and builds comparison sheets; it does not draw or modify the illustration.

## Mobile integration

The retained source is `apps/mobile/branding/dongho-clash-v6.png`. The normal mobile sync exports it through `scripts/build-icon.mjs`, so a later sync preserves this candidate. Android uses 0.70 image scale in its layer, keeping the heads, hands and impact central while the lower bodies crop naturally. The comparison shows a rounded approximation and the circular Android crop; it is not a physical-device screenshot.

Both store icons were regenerated from the mobile export. The iOS 1024 px image has no alpha channel; the Play 512 px image is RGBA. Export reproducibility and script syntax checks passed. No native build or store upload was performed; an installed phone receives the icon after a new native build.

Regenerate from the repository root:

```sh
node scripts/build-icon.mjs --mobile apps/mobile/assets
node scripts/build-icon.mjs --mobile apps/mobile/assets --check
node scripts/build-store-kit.mjs --icons-only
```

## Provenance

Generated with the built-in ImageGen tool using the three user-supplied prints preserved in [v5/references](../game-icon-v5/references). The references guide drawing style, not the historical authentication of costumes or weapons. All figures are anonymous game illustrations. No elephants appear.

Original generation identifiers, retained in the local generated-images directory:

| Artifact | Generation |
|---|---|
| Cavalry charge | `exec-6830b344-7f45-4629-813b-132ee34767f3.png` |
| Six-soldier formation clash | `exec-7c82672b-ca30-4015-bfde-c820ac7aa34f.png` |
| River ambush | `exec-f2fa8f09-8572-4b4a-8a6e-ed3f026c05bc.png` |
| First refinement, unwanted oval | `exec-e491452e-888d-464c-8206-67eeef0ff4ec.png` |
| Final clash | `exec-b8e8ddc8-8a3f-493b-868c-1dafddada7c7.png` |
