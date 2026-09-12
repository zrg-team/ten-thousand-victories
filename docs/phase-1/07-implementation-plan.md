> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Implementation Plan

## Phase 1: Scaffold

- Create Vite, TypeScript, and Phaser 3 project files.
- Add a portrait Phaser config using `390x844`.
- Add Boot, Preload, Map, and UI scenes.
- Add mobile-safe `index.html` viewport and no-scroll CSS.

## Phase 2: Map MVP

- Add 15 land nodes with positions and neighbors.
- Draw ownership colors and connection lines.
- Make lands tappable.
- Show a selected-land highlight.
- Draw the player army as a formation marker.

## Phase 3: Touch Controls

- Tap land to inspect.
- Tap action buttons in bottom sheets.
- Tap `War`, then tap an adjacent land to move or attack.
- Keep all main controls within thumb reach.

## Phase 4: Core Systems

- Implement typed game state.
- Add resource income and upkeep.
- Add real-time clock advancement.
- Add order spending.
- Add land acquisition and upgrade actions.

## Phase 5: Heroes, Politics, War, Bots

- Add 12 hero templates and draft 1 of 3.
- Add direct hero recruitment.
- Add 20 politics cards with two choices each.
- Add simple battle preview and battle resolution.
- Add basic bot expansion and attacks.

## Phase 6: Verification

- Run `npm run build`.
- Run the dev server.
- Verify mobile portrait sizes.
- Verify tap land, acquire, upgrade, hero draft, politics card, move, attack, end season, and victory.
