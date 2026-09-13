> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Dragon Ascent Detailed Gameplay Plan

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

## Purpose

Dragon Ascent should be the fast, replayable, card-driven mode of the game, but it should not feel like the game plays itself.

The current implementation already has a good engine:

- `ConquestScene` reuses the map and runs the Ascent tick.
- `ConquestUIScene` owns the Ascent HUD and full-screen prompts.
- `AscentState` owns prompt queue priority and run stats.
- `AutopilotSystem` files real build, recruit, resupply, march, and defend orders.
- `MarchOrderSystem` chooses border targets.
- `PowerDraftSystem` creates stacking card rewards and evolutions.
- `SummonSystem` creates hero collection and founder replay value.
- `WaveDirector` creates escalating waves and response prompts.

The weakness is decision ownership. The player currently answers a small set of prompt cards while the autopilot silently handles most empire decisions. This makes the mode easy to play, but also makes it hard to understand why the map changes, why power rises, why armies move, and what the player should care about next.

This plan keeps Dragon Ascent fast and mobile-friendly, but reorganizes it around three visible lanes:

1. Conquer
2. Manage
3. War

The player chooses strategic intent in each lane. The game can still automate execution, but only after the player has given the order, policy, or doctrine that explains what the automation is doing.

## Design Target

Dragon Ascent should feel like:

```text
Choose a founder.
Choose how the realm expands.
Choose how the realm is managed.
Choose how the realm meets each wave.
Draft powers that bend those choices.
Watch the map and numbers prove the choices mattered.
Lose the capital or survive longer than before.
Start again with a new founder, map, cards, enemies, and plan.
```

The mode should remain simple to operate:

- One full-screen decision at a time.
- Most decisions are 2-4 cards.
- No dense city-builder menus.
- No unit-by-unit micromanagement.
- No long pause between meaningful changes.

But it should stop being simple in a bad way:

- The player should not only pick the highest win chance.
- The player should not only pick the largest power number.
- The player should not wonder why armies move or buildings appear.
- The player should not sit watching the autoplay with nothing to decide.

## Core Problem In Current Dragon Ascent

### What Works

- The fixed HUD communicates `POWER`, `THREAT`, and `MOMENTUM`.
- Prompt priority is clean and prevents multiple modal conflicts.
- Power Draft cards stack, show previewed power gain, support rerolls, and have evolution payoffs.
- Summons feed the persistent Codex and future founder choices.
- Waves have a readable escalation curve and boss cadence.
- Losing the capital is a clear terminal condition.
- The autopilot uses public systems, so build/recruit/war math stays shared with other modes.

### What Does Not Work

- Conquest is presented as "choose province to march on," even though the wider game has richer acquisition methods.
- Management is mostly hidden. Buildings, upgrades, recruitment pressure, resupply, and disbanding happen without a visible plan.
- War response is one prompt per wave, but army doctrine, defense posture, commander use, and casualty lessons are not visible enough.
- Power Draft choices are mechanically useful but too abstract unless the player can connect them to Conquer, Manage, or War lanes.
- The map often becomes evidence after the fact, not the planning surface.
- The autopilot has more agency than the player.

## New Mode Promise

Dragon Ascent is not "classic empire mode but automated." It is:

```text
A roguelite strategy run where the player sets conquest, management, and war doctrine through card-like decisions, while generals and ministers execute those decisions on a fast clock.
```

That sentence should guide implementation. The player is not dragging every army each season, but the player is still ruling.

## Three Lane Structure

### Lane Summary

| Lane | Player Question | Main Systems | Result |
|------|-----------------|--------------|--------|
| Conquer | Which land do we take, and how? | Acquisition, marching, siege, frontier target | New land, rewards, loyalty, risk |
| Manage | How do we run the realm? | Buildings, laws, hero assignments, projects | Stronger economy, stability, build identity |
| War | How do we survive the next wave? | Armies, commanders, logistics, invasions | Defended capital, spoils, casualties, threat control |

### Lane Buttons

Add three persistent lane buttons to `ConquestUIScene`, below the HUD and above the map:

- `Conquer`
- `Manage`
- `War`

Each button shows one small status:

- `Ready`: a useful decision is available.
- `Busy`: an order is in progress.
- `Alert`: an urgent problem needs input.
- `Blocked`: the lane has no legal action and explains why when opened.

The HUD remains:

- `POWER`: whole-run strength.
- `THREAT`: incoming danger.
- `MOMENTUM`: next power draft progress.

The lane buttons answer "what do I do with those numbers?"

## Run Loop

### Current Loop

```text
Tick income.
Progress orders.
Autopilot builds/recruits/resupplies/marches/defends.
WaveDirector raises waves.
Prompt queue asks for founder/draft/march/summon/response.
Player answers prompt.
Repeat.
```

### Target Loop

```text
Tick income.
Progress existing orders.
Execute player-approved lane plans.
Refresh lane status.
Raise lane decisions when needed.
Raise wave and reward prompts.
Player answers one clear decision.
Map and HUD show the consequence.
Repeat.
```

The important change is "execute player-approved lane plans." Autopilot becomes an executor, not the source of strategy.

## Autopilot Refactor

### Current Responsibility

`tickAscentAutopilot` currently does too much:

- Disbands remnants.
- Recruits armies.
- Builds.
- Upgrades.
- Resupplies.
- Marches.
- Sets auto-defend.

### Target Responsibility

Split autopilot into three layers:

1. Advisor
2. Executor
3. Maintenance

### Advisor

Advisor functions inspect state and return ranked options without mutating state.

Examples:

```typescript
recommendConquestPlans(state): AscentConquestOption[]
recommendManagePlans(state): AscentManageOption[]
recommendWarPlans(state): AscentWarOption[]
```

These recommendations power UI cards and test diagnostics.

### Executor

Executor functions mutate state, but only for an active plan chosen by the player.

Examples:

```typescript
executeConquestPlan(state, plan)
executeManagePlan(state, plan)
executeWarPlan(state, plan)
```

Execution still uses existing public APIs:

- `bribeLand`
- `startDiplomaticClaim`
- `startIntimidation`
- `settleLand`
- `issueMoveOrder`
- `buildDistrictBuilding`
- `upgradeDistrictBuilding`
- `queueRecruitment`
- `resolveEmpireResponse`

### Maintenance

Maintenance can stay automatic because it prevents tedious cleanup:

- `autoResupply`
- safe remnant disbanding below a clear threshold
- prompt queue draining
- capital loss grace tracking
- visibility refresh

Maintenance should report important consequences through toasts or the event log.

### Autopilot Rule

The game can automate execution, but every strategic automation must point to a visible player choice.

Bad:

```text
The game built a tower because the hidden score liked it.
```

Good:

```text
The player chose "Fortress Realm"; the executor prioritised walls, towers, and barracks.
```

## New Ascent State

Add a small amount of mode-specific state. Avoid copying the whole classic campaign model.

```typescript
export type AscentLane = 'conquer' | 'manage' | 'war';

export type AscentLaneStatus = 'ready' | 'busy' | 'alert' | 'blocked';

export type AscentConquestMethod =
  | 'bribe'
  | 'diplomacy'
  | 'intimidation'
  | 'settle'
  | 'occupy'
  | 'siege';

export interface AscentConquestPlan {
  id: string;
  landId: string;
  method: AscentConquestMethod;
  heroId?: string;
  armyId?: string;
  createdTurn: number;
  status: 'queued' | 'executing' | 'blocked' | 'complete' | 'failed';
  reason?: string;
}

export type AscentManageDoctrine =
  | 'balanced'
  | 'granary'
  | 'markets'
  | 'workshops'
  | 'fortress'
  | 'growth';

export type AscentLawId =
  | 'tax-lenient'
  | 'tax-balanced'
  | 'tax-harsh'
  | 'service-volunteer'
  | 'service-levy'
  | 'service-conscription'
  | 'labor-free'
  | 'labor-corvee'
  | 'labor-military';

export interface AscentManagePlan {
  doctrine: AscentManageDoctrine;
  activeLaws: AscentLawId[];
  projectLandId?: string;
  projectBuilding?: LandBuildingType;
  projectKind?: 'build' | 'upgrade';
  createdTurn: number;
}

export type AscentWarDoctrine =
  | 'guard-capital'
  | 'intercept'
  | 'hold-frontier'
  | 'counterattack'
  | 'conserve';

export interface AscentWarPlan {
  doctrine: AscentWarDoctrine;
  preferredComposition: ArmyComposition;
  reserveRatio: number;
  autoDefend: boolean;
  createdTurn: number;
}

export interface AscentLaneState {
  conquer: AscentLaneStatus;
  manage: AscentLaneStatus;
  war: AscentLaneStatus;
  lastDecisionTurn: Partial<Record<AscentLane, number>>;
  tutorialSeen: Partial<Record<AscentLane, boolean>>;
}
```

Extend `AscentState` with:

```typescript
laneState: AscentLaneState;
conquestPlans: AscentConquestPlan[];
managePlan?: AscentManagePlan;
warPlan?: AscentWarPlan;
decisionPressure: number;
idleTicks: number;
laneStats: {
  conquestsByMethod: Record<AscentConquestMethod, number>;
  manageChoices: Record<string, number>;
  warChoices: Record<string, number>;
};
```

## Prompt Model

### Existing Prompt Kinds

Current:

- `founder`
- `power-draft`
- `march-order`
- `hero-summon`
- `empire-response`
- `wave-result`
- `run-over`

### Target Prompt Kinds

Replace or extend:

- `founder`
- `lane-choice`
- `conquer-council`
- `manage-council`
- `war-council`
- `power-draft`
- `hero-summon`
- `event-choice`
- `wave-result`
- `run-over`

### Prompt Priority

Suggested priority, highest first:

| Prompt | Priority | Why |
|--------|----------|-----|
| `run-over` | 0 | Terminal state |
| `founder` | 1 | Run setup |
| `war-council` urgent | 2 | Incoming wave can end run |
| `event-choice` crisis | 3 | Crisis needs answer |
| `wave-result` | 4 | Closure after boss |
| `conquer-council` urgent | 5 | No expansion plan or blocked front |
| `manage-council` urgent | 6 | No project or economic collapse |
| `hero-summon` | 7 | Reward and roster |
| `power-draft` | 8 | Build reward |
| `lane-choice` optional | 9 | Player-directed planning |

Do not let optional rewards bury urgent war response. Do not let normal management cards interrupt every few ticks.

## Opening Flow

The opening 90 seconds must teach the three lanes without a tutorial wall.

### Step 1: Founder Prompt

Existing behavior:

- Offer Codex-unlocked founders first.
- Top up from hero deck.
- Add chosen hero to roster.

Keep this.

Improve the card body:

- Show hero role.
- Show best lane fit.
- Show starting benefit in one sentence.

Examples:

- General: "War: stronger opening host and safer early waves."
- Governor: "Manage: faster economy and safer growth."
- Agent: "Conquer: better diplomacy, sabotage, and border claims."
- Minister: "Manage/War: better laws, faster drafts, or stability."

### Step 2: First Conquer Council

Immediately after founder, ask where and how to expand.

Offer 3 border cards:

- One safe land.
- One rich land.
- One risky land.

Each card includes method options. In the first run, keep methods simple:

- Settle if wilderness.
- Diplomacy if village and a hero is free.
- Intimidate if the starting host can support it.

Avoid presenting bribe failure too early unless the chance is good. The first choice should teach that land acquisition has methods.

### Step 3: First Manage Council

After the first conquest plan starts, ask what kind of realm to build.

Offer 3 doctrines:

- Granary Realm: farms, food, population, safer growth.
- Iron Realm: mines, supplies, faster recruitment.
- Fortress Realm: walls, barracks, capital safety.

This sets `ascent.managePlan.doctrine` and controls build executor priorities.

### Step 4: First War Council

Before wave 1 lands, ask how to prepare:

- Raise Host.
- Fortify Capital.
- Hold and gain momentum.

The player sees this lane before they are punished by a wave.

### Step 5: First Power Draft

First draft should happen after at least one visible map or lane consequence.

The player should already understand:

- "Conquer gives land."
- "Manage builds the engine."
- "War keeps the capital alive."
- "Power Draft modifies those lanes."

## Lane 1: Conquer

### Design Goal

Conquer should stop being "pick the best march target." It should become "choose a frontier strategy."

### Conquer Council

The Conquer Council opens when:

- No active conquest plan exists.
- The active conquest plan is blocked.
- A target was captured.
- The front has been blocked for `MARCH_REPROMPT_TICKS`.
- The player taps the Conquer lane while no urgent prompt is open.

### Target Cards

Each card represents one border land and a selected recommended method.

Card fields:

- Land name.
- Reward tag: food, gold, supplies, shrine, coast, fortress, population, chokepoint.
- Current owner: neutral, wilderness, rival, invader-held.
- Terrain risk.
- Population gain.
- Noble power or garrison.
- Trust toward player.
- Recommended method.
- Time to resolve.
- Failure risk.
- Loyalty after success.

Example card:

```text
Lam Son
Rich village, 94 population, market road
Noble Power 31, Trust 48/75
Recommended: Diplomacy with Nguyen Van
Cost: 24 supplies, hero busy 6 seasons
Result: +94 humans, high loyalty, market bonus
```

### Method Selector

Tapping a land card can either:

- Start the recommended method immediately.
- Open method selector if multiple methods are viable.

Method selector cards:

| Method | Current API | Dragon Ascent Use |
|--------|-------------|-------------------|
| Bribe | `bribeLand` | Fast tempo, gold risk, lowers future diplomacy on failure |
| Diplomacy | `startDiplomaticClaim` | Hero investment, high loyalty, safer long-run expansion |
| Intimidation | `startIntimidation` | Uses army presence, cheaper, creates unrest risk |
| Settle | `settleLand` | Wilderness expansion, spends humans, safe |
| Occupy | `issueMoveOrder` plus `occupyEmptyLand` | Army plants banner in empty land |
| Siege | `issueMoveOrder` plus `attackLand` | Enemy land, casualties and siege timer |

### Recommendation Logic

Add `recommendAcquisitionMethod(state, land)`:

```text
If land is wilderness and army can reach: Occupy.
If land is wilderness and no army can reach: Settle.
If village trust is high and free hero exists: Diplomacy.
If noble power is low and gold reserve is high: Bribe.
If adjacent army is strong and war pressure is low: Intimidation.
If enemy-owned and win chance is acceptable: Siege.
Otherwise: Blocked with exact reason.
```

### Conquer Plan Execution

When the player chooses a plan:

- Store it in `ascent.conquestPlans`.
- Execute the first possible step immediately.
- If blocked later, set plan status to `blocked` and queue Conquer Council again.

Examples:

- Diplomacy plan: assigns hero and waits for trust threshold.
- Intimidation plan: keeps selected army adjacent; if it moves away, plan blocks.
- Siege plan: sends army; if odds are too low, plan waits or asks War lane for a host.

### Map Feedback

Every active Conquer plan should draw a marker:

- Scroll marker for diplomacy.
- Coin marker for bribe.
- Banner marker for settle/occupy.
- Spear marker for intimidation.
- Fire/ring marker for siege.

The marker should show progress as `progress / required`, matching acquisition and siege orders.

### Conquer Rewards

Taking land should do more than increase count:

- Adds Momentum.
- Adds population or resource burst where appropriate.
- Nudges Power Draft weights based on reward tag.
- Updates lane status.
- Creates a short battle/acquisition result message.

Suggested draft weight nudges:

- Shrine: +jade chance slightly for next draft.
- Market/coast: +economy cards.
- Iron/mountain: +war/logistics cards.
- Far frontier/chokepoint: +defense cards.
- Diplomacy success: +hero/governance cards.
- Siege success: +military cards.

### Conquer Failure

Failure should create an interesting recovery action, not dead air.

Examples:

- Bribe failed: land trust drops; next Conquer Council recommends intimidation or a better diplomat.
- Intimidation cancelled: army moved or too weak; War lane gets `Raise Host` or `Move Guard`.
- Siege defeat: army wounded; War lane gets `Recover Host`, Manage lane gets `Levy`.
- Diplomacy cancelled: hero reassigned; Manage lane gets `Resolve Posting`.

## Lane 2: Manage

### Design Goal

Manage should make the hidden empire engine visible without becoming a full city-builder.

Dragon Ascent should ask for strategic management choices:

- What should the realm prioritize?
- Which province gets attention?
- Which law shapes the next phase?
- Which hero should govern, command, or rest?

The executor handles repeated clicks.

### Manage Council

The Manage Council opens when:

- No manage doctrine has been selected.
- A build queue has been idle for too long.
- Economy is failing.
- Stability/loyalty pressure is rising.
- A hero is idle after summon.
- A major province is underdeveloped.
- The player taps Manage.

### Manage Card Types

#### Doctrine Cards

Doctrine defines automatic build priority.

| Doctrine | Building Bias | Resource Bias | Risk |
|----------|---------------|---------------|------|
| Balanced | best overall score | stable mix | lower specialization |
| Granary | farms, public order | food, humans | slower gold/supplies |
| Markets | markets, harbors, guilds | gold | food pressure |
| Workshops | mines, workshops | supplies, heavy troops | needs food |
| Fortress | walls, towers, barracks | defense, recruit speed | slower economy |
| Growth | farms, communal halls, populous focus | humans, stability | weak early war |

Doctrine does not build randomly. It changes the score inside `autoBuild` and `autoUpgrade`.

#### Province Project Cards

Project cards select one concrete province action:

- Build Farm in X.
- Upgrade Market in X.
- Build Barracks in X.
- Build Wall in capital.
- Destroy low-value building in X.
- Change X to Fortress focus.
- Change X to Breadbasket focus.

The card must show:

- Cost.
- Build time.
- Output change.
- Upkeep change.
- Why this province.

#### Law Cards

Add a light law layer for run identity.

Initial laws:

| Law | Options | Effects |
|-----|---------|---------|
| Tax | Lenient, Balanced, Harsh | gold vs stability/growth |
| Service | Volunteer, Levy, Conscription | army size/upkeep vs humans/stability |
| Labor | Free Labor, Corvee, Military Labor | build speed vs stability/pop growth |
| Trade | Local, Open, War Economy | gold/supplies vs diplomacy/food |

These can map into `CourtModifier` or direct Ascent law effects.

#### Hero Assignment Cards

After a summon or when a hero is idle:

- Command a host.
- Govern a province.
- Take court seat.
- Run diplomacy for Conquer lane.
- Sabotage an empire.
- Rest.

Dragon Ascent should not open the full classic roster unless the player taps a detail button. The default should be "pick one of 2-3 good assignments."

#### Random Task Cards

Tasks create freshness:

- Refugees arrive.
- Noble demands privilege.
- Frontier village asks for protection.
- Merchant offers supplies for gold.
- General requests autonomy.
- Spy reports a weak empire.
- Flood damages farms.
- Temple asks for patronage.

Each task should touch at least two lanes.

Example:

```text
Frontier Nobles Withhold Grain
Choice A: Grant privileges
Manage: +food now, -stability, nobles stronger in nearby claims
Choice B: Send an agent
Conquer: +trust on border villages, agent busy
```

### Manage Execution

Refactor `autoBuild`:

Current:

```text
Find best build by hidden score.
Build it if gold reserve allows.
Else upgrade.
```

Target:

```text
If player selected concrete project: execute it.
Else if manage doctrine exists: score options through doctrine.
Else queue Manage Council.
```

`autoResupply` should stay automatic, but it should expose warning states:

- `Supplies low for 2 hosts`.
- `Food reserve below safe line`.
- `One host cannot be fully supplied`.

### Manage Rewards

Management should feed the rest of the run:

- Buildings increase Power through resource rates and defensive power.
- Laws modify card weights and lane status.
- Governors make specific provinces better.
- Public buildings reduce crisis frequency.
- Strong economy makes War response affordable.
- Stable lands make Conquer less likely to trigger rebellion.

## Lane 3: War

### Design Goal

War should make threats, armies, commanders, logistics, and enemy intent visible.

The player should know:

- What is coming.
- Whether the realm can survive it.
- Which response changes the odds.
- What casualties or risks each response creates.

### War Council

War Council opens when:

- A wave starts.
- A boss wave is telegraphed.
- Threat/defense ratio is dangerous.
- A host is wounded or starving.
- The capital is occupied.
- The player taps War.

### Wave Response Cards

Current options:

- Send Host.
- Fortify.
- Buy Off.
- Endure.

Keep these, but make them richer and lane-connected.

Improved options:

| Response | Cost | Effect | Tradeoff |
|----------|------|--------|----------|
| Raise Host | supplies, humans, commander | new army, higher projected hold chance | food/supply upkeep |
| Fortify Capital | gold | capital defense, safer boss | less economy/conquest spending |
| Buy Off | gold | delays or cancels wave | raises future tribute expectations |
| Sabotage March | agent/influence | lowers threat or delays | agent risk, future hostility |
| Field Ambush | strong army/general | chance to damage wave before siege | casualties |
| Endure | none | momentum now | accepts current risk |

Not all options need to appear every wave. Show 3-4 best legal responses.

### War Doctrine

Add persistent doctrine selected from War lane:

| Doctrine | Behavior |
|----------|----------|
| Guard Capital | keep strongest host near capital, build defense |
| Intercept | auto-march to incoming host before siege |
| Hold Frontier | defend border lands, slower capital response |
| Counterattack | after wave clears, push conquest target aggressively |
| Conserve | avoid low-odds battles, preserve army, accept raids |

This controls `autoDefend`, response recommendations, and Conquer/War coordination.

### Army Composition

Current recruitment supports:

- balanced
- spears
- archers
- shock

Expose this in War lane decisions:

- "Raise Spear Wall": better against heavy hosts.
- "Raise Archer Host": better against spear-heavy hosts.
- "Raise Shock Host": better against archer-heavy hosts.
- "Raise Balanced Host": safer when intel is poor.

If enemy composition is unknown, show uncertainty:

```text
Enemy formation unknown. Balanced is safest; scouts can reveal more.
```

If scouts reveal composition, show counter:

```text
Enemy 48% heavy. Spears recommended.
```

### Commander Use

General choice should matter:

- Highest martial improves field power.
- Logistics improves march speed and supply endurance.
- Renown improves morale.
- Wounded/dead risk appears on high-risk battles.

When a hero is pulled from court to raise a host, show the lost court effect.

### Battle Reports

After battles or waves, show concise results:

- Land defended or lost.
- Casualties.
- Commander fate.
- Spoils.
- Momentum gained.
- Strategic consequence.

Ordinary waves can use event log/toasts. Boss waves should keep `wave-result` full-screen.

### Capital Crisis

The capital loss grace window is good. Make it clearer.

When capital falls:

- War lane becomes `Alert`.
- HUD threat text changes to "Capital occupied".
- Conquer lane may offer "Retake Capital".
- Manage lane may offer "Emergency Levy" or "Open Granaries".
- War Council offers only recovery options until resolved.

## Power Draft Rework

### Design Goal

Power Draft should become the bridge between lane choices and roguelite replayability.

Current card pillars:

- Military
- Economy
- Logistics
- Defence

Retain them, but label every card with a lane:

- Conquer cards help take land.
- Manage cards help build/run the realm.
- War cards help survive waves.
- Hybrid cards connect two lanes.

### Card Data Extension

Add optional metadata:

```typescript
export interface PowerCardDef {
  id: string;
  rarity: AscentRarity;
  maxStacks: number;
  lane?: AscentLane;
  tags?: string[];
  unlockHint?: string;
  counterTag?: string;
  // existing fields remain
}
```

### Example New Card Families

#### Conquer Cards

- Frontier Envoys: diplomacy claims gain trust faster.
- Noble Hostages: intimidation completes faster but lowers loyalty more.
- Silver Charters: bribe cost lower and failure penalty smaller.
- Settler Wagons: settle costs fewer humans and completes faster.
- Siege Sappers: siege ticks reduced.
- River Scouts: reveal more border targets and enemy route info.

#### Manage Cards

- Granary Registers: farms produce more food and growth.
- Market Seals: markets add more gold and improve buy-off affordability.
- Corvee Rosters: build speed up, stability pressure up.
- Scholar Officials: court seats are stronger.
- Provincial Census: population growth and labor efficiency up.
- Public Works: communal halls improve loyalty recovery.

#### War Cards

- Iron Levy: army power.
- Royal Guard: level cap and elite tier.
- War Drums: recruit speed and battle supply discount.
- Supply Trains: army rations/provisions last longer.
- Signal Towers: intercept chance and warning time.
- Veteran Captains: generals gain faster.

#### Hybrid Cards

- Fortified Settlers: settle new land with better defense.
- Mandate Roads: conquest speed plus market output.
- Tribute Convoys: bribe/diplomacy plus gold income.
- Frontier Garrisons: new lands start with militia and lower rebellion risk.
- Heroic Chronicles: battle wins increase summon quality.

### Draft Offer Rules

Every draft should offer:

- One card from the player's strongest lane plan.
- One card from their weakest or most threatened lane.
- One random or synergy card.

Example:

- Player has Fortress doctrine and Guard Capital war plan.
- Draft offers: `Earthen Ramparts`, `Supply Trains`, random `Frontier Envoys`.

This avoids drafts becoming pure randomness.

### Evolution Rules

Keep existing pair evolutions, but make paths readable:

- Show "Evolution pair" on parent cards.
- Show progress, e.g. `Iron Levy III + Royal Guard II`.
- Guarantee the partner slot as current implementation already does.
- On evolution, show full-screen or strong toast for first-time evolution.

Add lane-based evolutions later:

- Conquer + Manage: `Mandate Roads`
- Manage + War: `Fortress Granaries`
- War + Conquer: `Dragon Spearhead`

## Hero Summon Rework

### Current Behavior

- Hero summon appears every few waves.
- Three heroes are offered.
- Chosen hero enters roster.
- New hero is recorded in Codex.
- AutoAssign puts hero to work.

### Problem

AutoAssign is useful but hides why the hero matters.

### Target Behavior

When choosing a summoned hero, show:

- Lane fit.
- Best assignment.
- Immediate effect.
- What happens if no slot is available.

After choosing the hero, show a quick assignment prompt if the best assignment is ambiguous:

```text
Tran Hung joins.
Where should he serve?
1. Command Royal Host
2. Train new army
3. Seat as Marshal
```

If the best assignment is obvious, auto-assign but report it:

```text
Tran Hung takes command of the Royal Host. War Power +11%.
```

### Founder Replay

Founder should define the first 3-5 minutes.

Examples:

- General founder: starts with stronger host, War lane is safer, Conquer siege is better.
- Governor founder: starts with extra build project, Manage lane is safer.
- Agent founder: starts with diplomacy/sabotage option, Conquer has more peaceful paths.
- Minister founder: starts with law bonus and better Power Draft weight control.

## Enemy And Wave Variety

### Current Wave Pattern

- Wave every `WAVE_INTERVAL_TICKS`.
- Boss every `BOSS_EVERY_N_WAVES`.
- Threat grows with `THREAT_GROWTH`.
- Host count scales with wave.
- Aggressor chosen by hostility and power.

### Target Additions

Add wave intents:

- Raid: pillage a border province and leave.
- Siege: target capital or important province.
- Harass: force food/supply drain.
- Tribute Demand: pay or fight.
- Coalition: multiple empires.
- Warlord Boss: named boss with special modifier.

Each wave intent should point to a counter:

| Intent | Counter |
|--------|---------|
| Raid | Hold Frontier, intercept, local garrisons |
| Siege | Fortify, Raise Host, Guard Capital |
| Harass | Supply Trains, scouts, mobile army |
| Tribute Demand | Buy Off, prestige, counterattack |
| Coalition | diplomacy, sabotage, strong defense |
| Warlord Boss | boss-specific response card |

### Enemy Personality

Use existing kingdom personality and power/stability where possible.

Examples:

- Aggressive empire: more raids and sieges.
- Economic empire: tribute demands and mercenary-heavy waves.
- Defensive empire: fewer waves, stronger fortifications if counterattacked.
- Diplomatic empire: more vassalage, pacts, and betrayal events.
- Expansionist empire: more coalition and frontier pressure.

## Map Readability

Dragon Ascent should make the map explain the run.

### Required Map Markers

- Current conquest target.
- Active acquisition method.
- Active build/project province.
- Current wave target.
- Capital danger state.
- Army posture: defending, marching, besieging, recovering.
- Newly gained province pulse.
- Lost province danger marker.

### Province Inspect

Current inspect is read-only and minimal. Expand it slightly:

- Owner.
- Garrison.
- Output.
- Reward tag.
- Active plan or reason unavailable.
- A small button to open the relevant lane if no urgent prompt is live.

Do not turn inspect into a dense modal. It should help map comprehension.

## UI Layout

### Main Screen

Top:

- Resource bar.
- Ascent HUD: Power, Threat, Momentum.

Below HUD:

- Three lane buttons.

Map:

- Markers and armies.
- Front marker.
- Threat route marker.

Bottom:

- Pause, Codex, Menu controls.
- Selected province inspect card when tapped.

### Prompt Frame

Every full-screen prompt should include:

- Lane label.
- Title.
- One-line situation.
- 2-4 cards.
- Outcome preview.
- Current relevant HUD number in the card body.

Example War card:

```text
Raise Spear Wall
Commander: Tran Hung
Cost: 520 humans, 35 supplies
Enemy: 46% heavy infantry
Projected hold: 43% -> 61%
Risk: food upkeep rises by 7/season
```

### Text Rules

Keep prompt text short on screen. Put detail into predictable rows:

- Cost
- Time
- Chance
- Reward
- Risk

Long explanation belongs in docs and test comments, not in gameplay panels.

## Balance Targets

### Tick And Prompt Cadence

Current constants:

- `ASCENT_TICK_MS = 3500`
- `WAVE_INTERVAL_TICKS = 18`
- `WAVE_GRACE_TICKS = 16`
- `BOSS_EVERY_N_WAVES = 4`
- `THREAT_GROWTH = 1.14`

Target feel:

- First decision: immediate founder.
- First conquest: within 10 seconds.
- First manage choice: within 20 seconds.
- First wave preparation: before 60 seconds.
- Power Draft: roughly every 30-60 seconds after opening.
- Hero summon: every 2 waves, current behavior is acceptable.
- Boss: every 4 waves, current behavior is acceptable.

### Normal Difficulty Run Shape

Target 15-25 minute run:

| Time | Expected State |
|------|----------------|
| 0-2 min | founder, first land plan, first doctrine, first wave |
| 3-6 min | 4-8 lands, 1-2 armies, first summon, first stack plan |
| 7-12 min | 8-16 lands, boss pressure, first serious loss possible |
| 13-20 min | 16-28 lands, multiple doctrines/cards, capital crisis possible |
| 20+ min | high threat, boss chains, player either collapses or has strong evolved build |

### Quantitative Checks

Track these in a new or expanded test script:

- `idleTicks`: ticks with no active plan and no useful prompt.
- `conquestMethodCounts`: bribe/diplomacy/intimidation/settle/occupy/siege.
- `manageProjectCounts`: build/upgrade/specialize/law/hero assignment.
- `warResponseCounts`: raise/fortify/buy-off/sabotage/endure.
- `promptCounts`: all prompt kinds.
- `mapEvents`: land gained, land lost, capital lost, capital retaken.
- `powerByLane`: estimated contribution from field, hold, engine.
- `threatDefenseRatio`.
- `runOutcome`: collapse wave, score, peak lands, peak power.

Normal target:

- `idleTicks < 12%` after opening.
- At least 3 acquisition methods used by a reasonable bot across 5 seeds.
- At least 4 manage project types used across 5 seeds.
- At least 3 war responses used across 5 seeds.
- At least one land loss or capital scare in 40-60% of normal runs.
- Good automated player survives at least wave 8 in most normal seeds.
- Naive first-card player can lose before wave 10 sometimes.
- Strong player can reach wave 16+ with evolved cards.

## Implementation Phases

### Phase 1: Make Existing Ascent Legible

Scope: no major rule changes.

Files:

- `src/scenes/ConquestUIScene.ts`
- `src/ui/ascent/AscentHud.ts`
- `src/systems/ascent/AscentState.ts`
- `src/i18n/catalogs/ascent.ts`
- `test_scripts/shot/shot-ascent.mjs`
- `test_scripts/verify/verify-ascent.mjs`

Tasks:

- Add Conquer, Manage, War lane buttons under HUD.
- Show lane status from existing state.
- Rename current `march-order` prompt presentation to Conquer.
- Rename current `empire-response` prompt presentation to War.
- Add a Manage lane screen that summarizes current autopilot work: build, recruit, resupply, doctrine placeholder.
- Add active plan markers to map: front, build, wave target.
- Add `render_game_to_text` fields for lane status.

Acceptance:

- Player can see what the current Conquer, Manage, and War states are without waiting for prompts.
- Existing Ascent tests still pass.
- New screenshots cover menu, founder, Conquer prompt, Manage screen, War prompt, Power Draft, Summon, Codex.

### Phase 2: Conquer Council With Real Acquisition Methods

Scope: expose old land acquisition inside Dragon Ascent.

Files:

- `src/state/types.ts`
- `src/systems/ascent/MarchOrderSystem.ts`
- `src/systems/ascent/AscentResolver.ts`
- `src/systems/ascent/AutopilotSystem.ts`
- `src/scenes/ConquestUIScene.ts`
- `src/systems/AcquisitionSystem.ts` if minor helpers are needed

Tasks:

- Add `AscentConquestPlan`.
- Replace simple march target cards with land + method cards.
- Implement recommendation helper for bribe/diplomacy/intimidation/settle/occupy/siege.
- Allow player to choose method.
- Store and execute active plan.
- If plan blocks, queue Conquer Council with exact reason.
- Add method-specific map markers.

Acceptance:

- Wilderness can be settled or occupied.
- Villages can be bribed, diplomatically claimed, or intimidated when legal.
- Enemy or occupied land can be attacked/sieged.
- A failed bribe changes future recommendation.
- Moving army away cancels intimidation and reopens Conquer with explanation.

### Phase 3: Manage Doctrine And Projects

Scope: convert hidden building automation into player-approved management.

Files:

- `src/state/types.ts`
- `src/systems/ascent/AutopilotSystem.ts`
- `src/systems/ResourceSystem.ts` if helper exports are needed
- `src/scenes/ConquestUIScene.ts`
- `src/i18n/catalogs/ascent.ts`

Tasks:

- Add `AscentManagePlan`.
- Add manage doctrine selection.
- Refactor build scoring to apply doctrine.
- Add project cards for concrete build/upgrade/specialization choices.
- Add light law choices.
- Show consequences: cost, output, upkeep, build time, stability effect.
- Add hero assignment prompt after summon when not obvious.

Acceptance:

- No hidden build occurs before a doctrine or project is chosen.
- Doctrine visibly changes build choices over time.
- Player can inspect current project in Manage.
- Economy warnings appear before starvation/supply collapse.

### Phase 4: War Doctrine And Better Wave Response

Scope: deepen War without adding micro.

Files:

- `src/state/types.ts`
- `src/systems/ascent/WaveDirector.ts`
- `src/systems/ascent/AutopilotSystem.ts`
- `src/systems/empire/InvasionSystem.ts` if better wave metadata is needed
- `src/scenes/ConquestUIScene.ts`
- `src/ui/ascent/AscentHud.ts`

Tasks:

- Add `AscentWarPlan`.
- Add war doctrine choices.
- Expand wave response options to 3-4 context-sensitive cards.
- Include projected hold chance before and after response.
- Include commander, composition, cost, and risk.
- Add capital crisis state.
- Add battle/wave report summaries.

Acceptance:

- War doctrine affects autoDefend and response recommendations.
- Player can tell why a wave is dangerous.
- Player can recover from capital loss if fast enough.
- Boss wave response feels different from normal wave response.

### Phase 5: Lane-Based Power Draft

Scope: make cards support replay builds.

Files:

- `src/data/ascentCards.ts`
- `src/systems/ascent/PowerDraftSystem.ts`
- `src/scenes/ConquestUIScene.ts`
- `src/i18n/catalogs/ascent.ts`
- `test_scripts/verify/verify-ascent.mjs`

Tasks:

- Add lane/tags metadata to cards.
- Group card UI by lane.
- Update draft rolling: strongest lane, weakest lane, random/synergy.
- Add Conquer and Manage-specific cards.
- Add lane-based evolutions.
- Show evolution progress clearly.

Acceptance:

- Drafts regularly offer cards relevant to current plans.
- Player can intentionally build toward an evolution.
- Runs produce identifiable archetypes.

### Phase 6: Replay And Scoring

Scope: make repeated runs meaningfully different.

Files:

- `src/state/legacy.ts`
- `src/state/codex.ts`
- `src/scenes/MenuScene.ts`
- `src/scenes/ConquestUIScene.ts`
- `test_scripts/verify/verify-ascent.mjs`

Tasks:

- Add end-of-run tags.
- Score lane-specific achievements.
- Let Codex founders bias starting lane choices.
- Add lightweight run history summary.
- Add difficulty-specific score multipliers.

Example tags:

- Peaceful Unifier: many diplomacy/bribe acquisitions.
- Iron March: many siege wins.
- Wall of the Capital: boss survived with high fortification contribution.
- Golden Mandate: high gold income and buy-off usage.
- Frontier Settler: many wilderness settlements.
- Last Stand: capital retaken during grace window.

Acceptance:

- End screen tells the story of the run.
- Founder choices feel meaningfully different across replays.
- Legacy rewards do not flatten balance.

## Testing Plan

### Unit-Level Pure Checks

Add or extend scriptable checks for:

- Acquisition recommendation legality.
- Conquest plan blocking and recovery.
- Manage doctrine scoring.
- War doctrine behavior.
- Draft lane weighting.
- Capital crisis flow.

### Playthrough Bot

Create a Dragon Ascent strategic bot with selectable personalities:

- Safe: prioritizes survival.
- Greedy: prioritizes conquest/economy.
- Warlord: prioritizes armies and siege.
- Diplomat: prioritizes diplomacy/bribe/avoidance.
- Naive: first legal card.

Run each across 10 seeds.

Report:

- waves survived
- score
- lands gained/lost
- methods used
- lane choices used
- idle ticks
- prompt counts
- power curve
- threat curve
- final cause of death

### Visual Checks

Update screenshot scripts to capture:

- Main Ascent HUD with lane buttons.
- Founder prompt.
- Conquer Council.
- Method selector.
- Manage Council.
- War Council.
- Power Draft with lane labels.
- Hero summon assignment.
- Capital crisis.
- Run-over screen.

### Manual QA Checklist

- Start a new Dragon Ascent run from menu.
- Pick each founder type.
- Choose each Conquer method at least once.
- Let an acquisition complete.
- Force a failed bribe.
- Force intimidation cancellation.
- Change Manage doctrine.
- Start a concrete build project.
- Trigger low food/supply warning.
- Raise host with different composition.
- Buy off a wave.
- Fortify capital.
- Lose capital, retake before grace ends.
- Let capital remain lost until run-over.
- Confirm Codex and Legacy update.

## Success Criteria

Dragon Ascent rework is successful when:

- The player can explain current goals as "I am conquering X, managing Y, preparing for Z."
- The map visibly reflects all three lane plans.
- At least three land acquisition methods are useful in real runs.
- Management choices change what gets built and what shortages occur.
- War choices change survival odds and battle outcomes.
- Power Draft choices support recognizable builds.
- Repeated runs differ by founder, map, card path, enemy waves, and lane doctrine.
- The mode remains faster and lighter than classic campaign.
- Autopilot feels like ministers executing orders, not the actual player.
