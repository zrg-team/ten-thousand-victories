> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Core Loop

## Main Loop

```text
Start with Castle
Scout nearby lands
Choose expansion target
Acquire by war, influence, or mission
Gain land bonus
Recruit and assign heroes
Build stronger economy
Raise larger army
Attack rival kingdoms
Capture enemy castles
Conquer the map
```

## Real-Time Progression Loop

The campaign runs continuously. The clock advances through seasons automatically:

1. Collect food, gold, manpower, and influence.
2. Pay army and hero upkeep.
3. Trigger hero draft or politics card when scheduled.
4. Player gives commands while time continues.
5. Armies move and battles resolve.
6. Bot kingdoms expand, pressure borders, or attack.
7. Stability and win/loss checks resolve.

## Command Flow

The MVP is real-time and does not use turn spending. Player actions are direct commands:

- Acquire neutral land.
- Upgrade owned land.
- Move an army.
- Recruit or accept a hero.
- Attack an enemy land.
- Resolve a political action.

Future versions can add cooldowns or command capacity, but the current direction is not turn-based.

## Win Condition

The MVP win condition is:

```text
Capture all enemy castles.
```

Future versions can add alternate victories such as diplomatic submission, cultural legitimacy, or economic dominance.
