> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Technical Architecture

## Stack

- Vite
- TypeScript
- Phaser 3
- Data-driven content in TypeScript modules

## Scene Flow

```text
BootScene
PreloadScene
MapScene
UIScene
```

`MapScene` owns the playable map, army markers, land nodes, and game-state mutations.

`UIScene` owns top resource display, action bar, bottom sheets, hero draft panels, and battle previews.

## State Model

Core state is stored in `GameState`:

- resources
- lands
- kingdoms
- armies
- heroes
- real-time clock
- current season/month marker
- active politics card
- active hero draft
- selected land
- message log
- victory state

## Data-Driven Content

Content lives under `src/data/`:

- lands
- kingdoms
- heroes
- politics cards
- units

Systems should operate on typed data rather than hard-coded scene logic.

## System Modules

- `ResourceSystem`: income, upkeep, affordability, spending.
- `LandSystem`: acquisition, upgrades, ownership, land actions.
- `HeroSystem`: draft generation, recruitment, assignment.
- `WarSystem`: army movement, battle preview, battle resolution.
- `PoliticsSystem`: card draw and decision effects.
- `BotSystem`: simple enemy turn decisions.
- `RealtimeSystem`: automatic clock, income, events, bot actions, and stability checks.

## Testing Hooks

Expose:

- `window.render_game_to_text()`: concise JSON state for automated inspection.
- `window.advanceTime(ms)`: deterministic-ish frame stepping for browser tests.

These hooks support Playwright-based verification without adding test UI.
