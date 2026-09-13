> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Land Acquisition — Design Document

## Overview

Land acquisition is a core gameplay pillar of Đại Việt. Every neutral land has its own character —
its wealth, its people, its defenders, and its trust in your kingdom. The player must read each land
and choose the right method to bring it under the banner.

Enemy lands are taken only by force. Neutral lands offer five distinct paths, each with its own
logic, cost, and consequence.

---

## Land Properties

Every neutral land exposes four properties that define how hard it is to take and what you gain.

### `population`
People living in the land. Gained as `humans` resource on acquisition. A larger population means
more future soldiers and workers — but also a larger stake in their own independence.

Generated from terrain: rice fields, plains, and fields produce people; city tiles (fortress,
shrine) produce more.

### `localSoldiers`
The local militia garrison. Represents how much military backing the nobles or chief commands.
Directly affects:
- Bribe risk (more soldiers → nobles are confident → bribe is riskier and more likely to fail)
- Intimidation speed (more soldiers → they hold their nerve longer → slower progress per tick)
- Diplomatic claim threshold (entrenched defenders need more convincing → higher trust threshold)

Generated from: `defense × 0.7 + random`

### `hasVillage`
Whether the land has a settled community. Determines which acquisition methods are available:
- `true` → Bribe, Diplomatic Claim, Army Intimidation available
- `false` → only Settle or Army Occupy available

Wilderness lands (type `'wilderness'`) have no village, no soldiers, and no population.

### `trust`
Per-kingdom trust value (0–100). How much the land's people trust each kingdom right now.
- Starts at ~40 for neutral lands toward all kingdoms
- Increased by: diplomatic claim hero work each tick
- Decreased by: failed bribe (−25), army intimidation on completion (−15), enemy diplomatic pressure

---

## Noble Power

A single derived score representing how hard a land is to acquire through any non-military means:

```
noblePower = localSoldiers
           + buildings.length × 4
           + buildingCapacity × 2
           + floor(population / 20)
```

This score is displayed to the player and feeds into every method's cost, risk, threshold, or speed.
Rich, developed lands are harder — and more rewarding.

---

## Acquisition Resource Bonus

When you acquire any land you receive a one-time burst of resources from its existing buildings:

| Building | Level 1 | Level 2 | Level 3 |
|----------|---------|---------|---------|
| Farm     | +15 food | +24 food | +33 food |
| Mine     | +12 supplies | +19 supplies | +27 supplies |
| Market   | +20 gold | +32 gold | +44 gold |

You also receive all `population` as humans.

---

## Acquisition Methods

### 1. Gold Bribe
**When available:** Land has a village (`hasVillage = true`) and is adjacent to your territory.

**Human logic:** You pay the local nobles to surrender authority. Weak nobles with little military
backing see coin as a better deal than independence. But nobles who command real soldiers have pride
and leverage — they may pocket your gold and refuse. Word spreads. The people of that land now see
you as corrupt, and diplomacy becomes harder.

**Mechanics:**
- Risk preview shown before commitment: `successChance = max(10%, 75% − noblePower × 2%)`
- Gold cost scales with defense, buildingCapacity, and localSoldiers
- Court `acquisitionCostMult` applies
- **On success:** land acquired in 1 tick. Gain `population` as humans + building resource bonuses.
  Loyalty 68.
- **On failure:** gold lost entirely. `trust[player] −= 25`. Land shows as "Distrustful". Starting
  trust for a subsequent diplomatic claim is reduced.

---

### 2. Diplomatic Claim
**When available:** Land has a village (`hasVillage = true`) and is adjacent to your territory.

**Human logic:** You assign a free hero as an administrator to live among the people — attending councils,
distributing supplies, and building genuine relationships. Over weeks and months, the locals come to
see joining your kingdom as their own decision. A skilled administrator does it faster. A failed
bribe means you start from a deficit because you've already shown bad faith.

**Mechanics:**
- Player must assign a free hero before the claim starts. Fails if no free hero is selected.
- Upfront cost: supplies (gifts, hospitality, travel). Scales with `noblePower`.
- Hero becomes busy (`assignedTo = 'diplomacy-{landId}'`). Hero returns with fatigue on completion.
- The claim requires that hero to remain assigned. If the assigned hero is removed or reassigned,
  the claim is cancelled.
- Trust threshold: `65 + noblePower × 0.3`
- Each tick: `trust[player] += (1 + hero.stats.administration × 0.03) × acquisitionSpeedMult`
- When `trust[player] ≥ threshold`: land petitions to join. Gain `population` + building bonuses.
  Loyalty 85.

**Trust interactions:**
- Failed bribe beforehand: claim starts with trust already −25 from base (you're digging out of a hole)
- Active intimidation order on same land simultaneously: `trust[player] −= 3/tick` (conflicting signals
  confuse the population)
- Enemy kingdom doing diplomacy on same land: first to reach threshold wins

---

### 3. Army Intimidation
**When available:** Land has a village, player army is in an adjacent **owned** land, army power
exceeds a minimum threshold relative to `localSoldiers`.

**Human logic:** A powerful army camped on your border changes every calculation. Village elders
see the soldiers from their windows. A weak hamlet surrenders fast. A well-garrisoned town holds
its nerve — their own militia gives them courage. Coerced subjects resent their new rulers.

**Mechanics:**
- Player selects army, then selects neutral land → "Intimidate" button appears.
- Minimum threshold: `armyPower > localSoldiers × 0.5`. Below this: "Your army is not strong enough
  to threaten X."
- Progress per tick: `armyPower / (localSoldiers × RESIST_FACTOR)`. Completes at 100.
- If army moves away: intimidation order cancelled automatically.
- On completion: land surrenders. Gain `population` + building bonuses. Loyalty 50.
- Side effect: `trust[player] −= 15` on completion (coercion leaves resentment).

---

### 4. Settle
**When available:** Land has no village (`hasVillage = false`) and is adjacent to your territory.

**Human logic:** Nobody lives there. You send families, farmers, and craftsmen into the wilderness
to build a new community from nothing. It takes time — clearing land, building homes, establishing
order. The people you send leave your core lands permanently.

**Mechanics:**
- Costs `humans` upfront (settlers permanently leave your population).
- Ticks required: scales with land size (`buildingCapacity`). No risk, no trust needed.
- Loyalty 65 — your own people, but pioneers far from the capital.
- You gain **0 population bonus** — you already sent them.

---

### 5. Army Occupy
**When available:** Land has no village (`hasVillage = false`), army marches into it.

**Human logic:** Your army marches into uninhabited land and plants your banner. There is no one
to resist.

**Mechanics:**
- Happens automatically when army marches to an empty neutral land (no battle triggered).
- Resolves in 1 tick (terrain traversal only).
- Free, no cost. Loyalty 55 (garrison presence, not genuine allegiance).
- You gain **0 population**.

---

## Method Comparison

| Method | Condition | Cost | Risk | Speed | Loyalty | Pop gained |
|--------|-----------|------|------|-------|---------|------------|
| Gold Bribe | Village, adjacent | Gold | Can fail → gold lost + trust −25 | Fast (1 tick if success) | 68 | Yes |
| Diplomatic Claim | Village, adjacent, free hero | Supplies + hero time | No fail, starts slow if trust deficit | Slow (trust-gated) | 85 | Yes |
| Army Intimidation | Village, army adjacent + strong enough | None | Cancelled if army moves | Medium (power vs soldiers) | 50 | Yes |
| Settle | No village, adjacent | Humans | None | Slow (fixed ticks) | 65 | No |
| Army Occupy | No village, army marches in | None | None | Instant | 55 | No |

---

## Method Interactions

```
Failed bribe       → trust −25 → diplomatic claim must rebuild from deficit
Intimidation       → trust −15 on success → diplomatic approach harder after
Bribe + diplomacy  → never mix; bribe first destroys diplomatic capital
Intimidation while diplomacy active → trust −3/tick (conflicting signals)
Enemy kingdom diplomacy on same land → trust race; first to threshold wins
High noblePower    → bribe success near 0% → forces diplomacy or military
Empty land         → bribe/diplomacy/intimidation not available; settle or occupy only
Rich land          → high noblePower → all methods slower/riskier/costlier; reward is larger
```

---

## AI (Bot) Expansion

Bot kingdoms expand using "conquest" acquisition — free, tick-based, representing their own
political machinations and local alliances. Bots do not use the trust system, do not spend
resources, and cannot bribe or diplomatize in the player sense. Bot expansion pace is limited
to one claim at a time every few turns.

---

## Data Model

### Land additions (computed at map generation, not authored)
```typescript
population: number               // humans gained on acquisition
localSoldiers: number            // militia garrison; feeds noblePower
hasVillage: boolean              // gates method availability
trust: Record<string, number>    // per-kingdom trust 0–100 (default 40 if not set)
```

### LandType addition
```typescript
'wilderness'   // uninhabited terrain: hasVillage=false, localSoldiers=0, population=0
```

### AcquisitionOrder additions
```typescript
method: 'bribe' | 'diplomacy' | 'intimidation' | 'settle' | 'occupy' | 'conquest'
heroId?: string    // required for diplomacy: the assigned hero
armyId?: string    // for intimidation: the stationing army
```

### AcquisitionSystem (centralized)
All acquisition logic lives in `src/systems/AcquisitionSystem.ts`:
- `getNoblePower(land)` — derived resistance score
- `getBribeSuccessChance(land)` — 0–1 chance
- `getGoldBribeCost(land)` — gold required
- `getDiplomacyThreshold(land)` — trust needed to claim
- `getLandTrust(land, kingdomId)` — safe accessor (default 40)
- `getAcquisitionResourceBonus(land)` — one-time resource burst from buildings
- `bribeLand(state, landId)` — attempt bribe (may fail)
- `startDiplomaticClaim(state, landId, heroId)` — assign the selected hero, start trust building
- `startIntimidation(state, landId, armyId)` — begin army pressure
- `settleLand(state, landId)` — send settlers to empty land
- `progressAcquisitions(state)` — tick all active acquisition orders
