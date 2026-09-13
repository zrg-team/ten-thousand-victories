> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Game Systems

## Resources

The game uses five core resources:

- `Food`: army upkeep, population pressure, long campaigns.
- `Gold`: buildings, heroes, diplomacy, recruitment.
- `Manpower`: recruiting and replacing troops.
- `Stability`: internal order and rebellion risk.
- `Influence`: peaceful expansion and political decisions.

## Lands

Each land has:

- owner
- type
- resource bonus
- defense
- loyalty
- neighbors
- upgrade level
- special effect or unlock

The land system is the center of the game. The player should always be able to look at the map and think, "I want that land."

## Building

Building is land specialization, not free-form city placement.

Examples:

- Farm upgrades increase food and supply.
- Market upgrades increase gold.
- Iron upgrades improve heavy infantry access.
- Temple upgrades improve influence and stability.
- Castle upgrades increase command capacity and court capacity.

## Heroes

Heroes are drafted as cards. Every few seasons the player chooses 1 hero from a small offer.

Hero types:

- `General`: assigned to armies for battle, siege, and movement bonuses.
- `Governor`: assigned to lands for economy, loyalty, defense, or build bonuses.
- `Minister`: assigned to court for kingdom-wide effects.
- `Agent`: assigned to missions such as peaceful acquisition, sabotage, or suppression.

## Politics

Politics uses decision cards. Cards represent problems, laws, opportunities, and crises.

Good politics cards should:

- create tradeoffs
- affect the map campaign
- shape hero pools and kingdom identity
- remain quick to resolve on mobile

## War

Armies are formations, not single hero units. A general may lead the army, but the army is represented as troops.

MVP unit types:

- Spearmen
- Archers
- Heavy Infantry

Battle factors:

- troop count
- unit composition
- general bonus
- terrain
- morale
- supply
- land defense

## Bot Kingdoms

MVP bots are simple and readable. Each bot uses priority scoring:

- If weak, defend or recruit.
- If rich, build or recruit.
- If a valuable neutral land is adjacent, acquire it.
- If a player land is weak and adjacent, attack.

Bot personalities can later specialize this scoring.
