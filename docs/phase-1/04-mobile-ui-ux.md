> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Mobile UI and UX

## Screen Orientation

The primary target is mobile portrait.

Recommended virtual size:

```text
390 x 844
```

The layout should scale with Phaser `FIT` mode and center in the browser window.

## Main Screen

The main screen is always the map.

Top:

- year and season
- food, gold, manpower
- stability, influence

Center:

- land graph
- army markers
- ownership colors
- selected land highlight
- draggable larger map region

Bottom:

- live command status
- action buttons
- bottom sheet for land, hero, politics, and battle decisions

## Touch Rules

- Tap a land to inspect it.
- Tap an action in the bottom sheet to confirm.
- Tap army, then tap adjacent land to move.
- Keep important buttons near the lower half of the screen.
- Avoid tiny controls.
- Avoid hover-only behavior.

## Bottom Sheets

Bottom sheets are the main UI pattern because they are one-hand friendly.

Use them for:

- land details
- acquisition actions
- upgrades
- hero draft
- politics cards
- battle preview

## Readability

Use:

- large enough text for mobile
- short labels
- strong ownership colors
- clear disabled states
- concise action feedback

Avoid:

- dense desktop tables
- wide horizontal panels
- hidden hover tooltips
- controls that require precision dragging
