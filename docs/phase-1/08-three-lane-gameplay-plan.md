> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Three-Lane Gameplay Rework Plan

> **SUPERSEDED — do not build from this document.**
>
> The doctrine layer proposed below (a "Manage Council" and "War Council" that pick abstract
> realm doctrines) was cut before it shipped. It was an abstraction on top of nothing — its
> "laws" were stored strings no system read — and it hid the real empire systems rather than
> revealing them. What shipped instead wires the *existing* systems to the prompt queue:
> the full acquisition-method sheet, court appointments, Mandate edicts, the parliament deck,
> and the rival empires. See the "Dragon Ascent core-systems restore" entry in `progress.md`
> and `src/systems/ascent/` (`ConquestSystem`, `CourtLaneSystem`, `EnvoySystem`,
> `DecisionDirector`). This file is kept only as a record of the rejected direction.

## Goal

Make the game easy to read without making it shallow. The player should always understand:

- What land can be gained next.
- What internal problem or improvement needs attention.
- What military threat or opportunity is developing.

The new structure should keep the fast replay cadence from Dragon Ascent, but restore the older hand-played strategy systems as visible player choices.

## Current Implementation To Keep

The game already has strong underlying systems. The main problem is presentation and ownership of decisions.

- Land acquisition already supports several methods in `AcquisitionSystem`: bribe, diplomacy, intimidation, settle, occupy, and conquest.
- Neutral land already tracks population, local soldiers, village status, noble power, trust, loyalty, buildings, and resource rewards.
- Management already supports buildings, upgrades, destroy actions, province specialization, tax policy, court seats, governors, directives, edicts, royal abilities, hero missions, and random cards.
- War already supports army recruitment, army composition, rations, provisions, morale, supply, terrain, battle stances, honest win odds, siege orders, invasions, general growth, wounds, and enemy pressure.
- Dragon Ascent currently makes the game feel too simple because `AutopilotSystem` handles building, upgrading, recruiting, resupplying, marching, and defending for the player.

The rework should not throw these systems away. It should expose them through three stable gameplay lanes.

## Target Structure

Replace the scattered bottom actions with three main lanes:

1. Conquer
2. Manage
3. War

Each lane opens a focused screen with 2-4 actionable cards. Each card should answer:

- Why this matters now.
- What it costs.
- What can go wrong.
- What reward or future option it unlocks.

The map remains the center of the game. The lanes explain what the player can do with the map.

## Lane 1: Conquer

Purpose: acquire nearby land through different methods, not only by moving an army.

Use the old acquisition implementation as the core.

### Player-Facing Flow

The Conquer screen lists all visible border lands. Each land card shows:

- Land name and owner.
- Main value: food, gold, supplies, population, chokepoint, shrine, coast, or fortress.
- Difficulty: noble power, militia, defense, trust.
- Recommended method.
- All available methods.
- Active acquisition progress, if any.

### Acquisition Methods

- Bribe: fast, costs gold, can fail, failure lowers trust.
- Diplomacy: assign a free hero, costs supplies, slower, high loyalty result.
- Intimidate: requires adjacent owned army, medium speed, lower loyalty result.
- Settle: for wilderness, costs humans, safe but slow.
- Occupy: for wilderness with an army, fast but lower loyalty.
- Siege: for enemy land, requires army, battle preview, then timed capture.

### Needed UX Changes

- Do not hide land acquisition behind Details only. Border land cards should show method buttons directly.
- Add a small "why recommended" label, such as "High trust", "Weak nobles", "No village", or "Army nearby".
- Show progress orders in one readable place: method, progress, required ticks, assigned hero or army.
- Show consequences before commit: loyalty result, trust impact, population gain, building bonus.
- Let map selection and Conquer screen share the same actions so both paths teach the same rules.

### Strategic Depth

No single method should always be best.

- Bribe wins tempo but risks gold and trust.
- Diplomacy wins loyalty but occupies a hero.
- Intimidation saves resources but creates unstable border land.
- Settle grows safely but spends population.
- Occupy is fast but creates weak loyalty.
- Siege takes enemy land but creates casualties, supply loss, and post-war loyalty damage.

## Lane 2: Manage

Purpose: handle buildings, rules, laws, hero assignments, and random tasks inside the empire.

The Manage screen should group current systems into tabs or sections:

- Provinces
- Court
- Laws
- Tasks

### Provinces

Show owned lands as compact cards:

- Output and net role.
- Building slots used.
- Current build or upgrade order.
- Specialization: balanced, breadbasket, mining, trade, populous, fortress.
- Suggested next action.

Actions:

- Build.
- Upgrade.
- Destroy.
- Change specialization.
- Assign governor.

### Court

Make hero assignment readable:

- Available heroes.
- Busy heroes.
- Court seats.
- Governor assignments.
- Diplomacy assignments.
- Active hero missions.
- Resting or exhausted heroes.

Each hero should show one clear best use, but still allow manual assignment.

### Laws

Start with current tax policy, then expand into a small law system.

Initial law set:

- Tax stance: lenient, balanced, harsh.
- Military service: volunteer, levy, conscription.
- Noble rights: appease, balanced, restrict.
- Trade policy: local markets, open trade, war economy.

Each law should affect at least two systems. Example: harsh taxes raise gold but lower stability and population growth.

### Tasks

Unify directives, politics cards, hero events, foreign requests, and crises into a task board.

Task types:

- Immediate: answer now or soon.
- Standing: complete when able.
- Crisis: dangerous if ignored.
- Opportunity: reward if pursued.

Random tasks should create freshness, but not interrupt constantly. Urgent tasks can pause; normal tasks should wait in Manage.

## Lane 3: War

Purpose: heroes, buildings, armies, and enemies become one readable military loop.

### War Screen

The War screen should show:

- Current threats.
- Player armies.
- Enemy armies or invasion warnings.
- Recruitment options.
- Fortification needs.
- Battle opportunities.

### Armies

Keep the current recruitment system but make its strategy clearer:

- Pick commander.
- Choose soldiers.
- Choose rations and provisions.
- Choose composition: balanced, spears, archers, shock.
- Show expected upkeep and travel endurance before creating.

Army cards should show:

- Location.
- Size and unit mix.
- Morale and supply.
- Commander.
- Current order.
- Can defend, march, resupply, retreat, or disband.

### Battles

Keep honest odds and stances:

- Assault: better odds, higher casualties.
- Measured: baseline.
- Cautious: lower odds, fewer losses.

Add clearer battle reasons:

- Terrain defense.
- Enemy composition.
- Commander bonus.
- Wall and garrison strength.
- Supply state.

### Enemies

Make threats visible before they hit:

- Incoming invasion countdown.
- Rival target if known.
- Estimated strength.
- Possible counter: fortify, intercept, diplomacy, sabotage, tribute.

Enemies should not only be damage spikes. They should force choices between Conquer, Manage, and War.

## Always-Having-Work Rule

The game should try to keep at least one meaningful action available in each lane:

- Conquer: a border land, active claim, or contested frontier.
- Manage: a build, law, assignment, task, or crisis.
- War: a threat, recruitment need, wounded army, fortification gap, or attack target.

The player should rarely have zero meaningful choices for more than two economy ticks after the opening minute.

The player should also not be flooded. At normal difficulty, aim for:

- 1 urgent item at most.
- 2-4 useful choices across all lanes.
- 1 visible long-term goal.

## Balance Targets

### First 2 Minutes

- Player chooses first Conquer target.
- Player starts one building or law change.
- Player recruits or assigns one hero.
- First random task appears after the player has acted at least once.
- First military threat is telegraphed, not instant.

### Mid Game

- Every 30-60 seconds, something meaningful changes: order completes, event appears, enemy moves, hero returns, era advances, land rebels, or a new target appears.
- Expansion grows economy, but also increases governance pressure.
- Ignoring Manage should create loyalty/stability problems.
- Ignoring War should lose land, not instantly end the run.
- Ignoring Conquer should let rivals or threats outscale the player.

### Session Length

Normal difficulty should target 15-25 minutes for a satisfying run:

- Good play can win or ascend.
- Weak play can survive for a while but loses land and tempo.
- Hard and ironman should force sharper choices and produce more defeats.

## Replayability

Replay value should come from different strategic situations, not only bigger numbers.

Keep:

- Random map seed.
- Random province names and terrain.
- Founder/hero variation.
- Legacy progress.
- Codex collection.
- Rival personality and Great Power simulation.
- Event decks.

Add or emphasize:

- Starting law package choices.
- More acquisition method variety by map position.
- Rival agendas that favor different pressure styles.
- Province traits that make some lands worth changing plans for.
- End-of-run score tags such as Diplomatic Unifier, Iron March, Golden Realm, Frontier Settler, or Warlord Breaker.

## Implementation Phases

### Phase 1: Navigation And Readability

- Make the main playable mode a hand-played "Grand Campaign" or "Throne of Empires" loop.
- Keep Dragon Ascent as a separate quick/autoplay mode.
- Replace the crowded action bar with Conquer, Manage, War, and small Menu/Pause controls.
- Add lane badges: pending, urgent, complete.
- Keep the map visible behind lane screens where possible.

### Phase 2: Conquer Screen

- Add a Conquer modal/screen listing border lands.
- Reuse existing acquisition functions instead of rewriting conquest logic.
- Move bribe, diplomacy, intimidation, settle, occupy, and siege choices into direct method cards.
- Show recommended method and consequences.
- Add tests for all acquisition paths and cancellation cases.

### Phase 3: Manage Screen

- Add a Manage modal/screen with Provinces, Court, Laws, and Tasks.
- Move current Build, Court, Heroes, Directives, Edicts, and tax policy into this lane.
- Add province specialization controls to owned land cards.
- Make pending random tasks visible from this board instead of surprising the player too often.
- Add tests for build, upgrade, destroy, specialization, tax, hero assignment, and task resolution.

### Phase 4: War Screen

- Add a War modal/screen with Threats, Armies, Recruitment, and Battle Prep.
- Keep current army creation, composition, logistics, battle preview, stance, siege, and general growth.
- Add clearer combat reason breakdowns.
- Add an optional auto-defend toggle per army, but do not let autopilot own the whole game by default.
- Add tests for recruitment, movement, attack, siege, invasion defense, retreat, and general growth.

### Phase 5: Balance And Replay Pass

- Run scripted playthroughs across multiple seeds and difficulties.
- Track idle ticks, urgent task count, land count, losses, win/defeat time, acquisition method usage, and build diversity.
- Tune until normal difficulty produces varied 15-25 minute runs with real losses but fair recovery.

## Success Criteria

- A new player can name the three lanes after one session.
- A player can tell why a land is worth taking and which method fits it.
- The game never feels like "only move army."
- The game never feels like "nothing new is happening."
- Autoplay is optional, not the default source of progress.
- Replays produce different maps, threats, heroes, laws, and expansion routes.
