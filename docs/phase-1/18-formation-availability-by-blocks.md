> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Formation availability by blocks — the retired mechanic

**Status: retired.** Replaced by per-shape cooldowns — see the design doc **Five Shapes, One Clock**.
Kept here in full so the rule, its tuning and its reasoning can be re-instated without archaeology.

This is a verbatim record of how `formationAvailability` decided which of the five shapes a host
could form, from the day the ring shipped until it was replaced.

---

## The rule

A shape stood on one **block** of the army. If that block was spent — or had never been mustered in
the first place — the shape was struck off the dock: its chip faded to `alpha 0.32`, printed
`ascent.battle.shapeGone` ("đã cạn" / "spent"), and **no hit zone was created for it at all**, so
the tap was not refused so much as never offered.

```ts
/** The block each shape is built around, and therefore the block whose loss takes it away. */
export const BLOCK_OF: Record<BattleFormation, FormationKey> = {
  chong: 'line',
  xung:  'horse',
  tan:   'screen',
  quy:   'line',
  no:    'bows',
};

export function formationAvailability(
  composition: ArmyComposition, men: number, mustered?: number,
): Record<BattleFormation, 'ready' | 'blunt' | 'gone'> {
  const shares = blockShares(composition, men, mustered);
  const spent = (key: FormationKey): boolean => shares[key].full <= 0 || shares[key].standing <= 0;
  return {
    chong: 'ready',
    quy: 'ready',
    xung: spent('horse') ? 'gone' : 'ready',
    tan: spent('screen') ? 'gone' : 'ready',
    no: spent('bows') ? 'blunt' : 'ready',
  };
}
```

Three states, not two:

| state   | meaning                                                | dock behaviour                       |
| ------- | ------------------------------------------------------ | ------------------------------------ |
| `ready` | as intended                                            | normal chip, tappable                |
| `blunt` | the shape forms, but only half the counter is worth anything (`BATTLE_FORMATION_TILT_BLUNT = 0.5`) | tappable, prints "cùn" / "blunt" |
| `gone`  | the block it stands on was never mustered, or is spent | faded, prints "đã cạn", **no hit zone** |

## Where the blocks came from

`blockShares` split a host's marks between four blocks by doctrine weight, then spent casualties
**in formation order** — screen first, then line, then bows, horse last.

```ts
export const FORMATION_ORDER: FormationKey[] = ['screen', 'line', 'bows', 'horse'];

export const DOCTRINE: Record<ArmyComposition, Record<FormationKey, { weight: number; aspect: number }>> = {
  balanced: { screen: 5, line: 21, bows: 12, horse:  6 },  // weights only; aspects omitted here
  spears:   { screen: 3, line: 36, bows:  8, horse:  0 },
  archers:  { screen: 4, line: 10, bows: 27, horse:  0 },
  shock:    { screen: 0, line: 32, bows:  3, horse: 10 },
  horse:    { screen: 4, line: 10, bows:  8, horse: 18 },
};
```

`mustered` was **not** `ourStart` — `ourMustered()` subtracted the uncommitted reserve, because a
host measured against everything it brought reads as having lost its whole screen on the opening
beat.

## What it actually did, measured

Sweeping a 1,200-man host's losses from 0% to 100% and recording where each block empties:

| doctrine | Tản ra (screen) | Xung phong (horse) | Bắn (bows)   | Chông / Quy (line) |
| -------- | --------------- | ------------------ | ------------ | ------------------ |
| balanced | **11% losses**  | never empties      | never        | hardcoded `ready`  |
| spears   | **2% losses**   | never mustered     | never        | hardcoded `ready`  |
| archers  | **6% losses**   | never mustered     | never        | hardcoded `ready`  |
| shock    | **never mustered** | never empties   | blunt @ 75%  | hardcoded `ready`  |
| horse    | **6% losses**   | never empties      | blunt @ 52%  | hardcoded `ready`  |

## Why it was retired

The table above is the whole case. The design intent — *"open with five shapes, finish with two"* —
never happened. What happened instead:

1. **Only one chip ever went out, and it went out immediately.** Tản ra stood on the screen, which
   is both first in the casualty order and the smallest block (3–5 marks of ~44). It died at 2–11%
   losses, i.e. within the first two or three beats of almost every fight, and never came back
   unless headcount rose.
2. **Xung phong never narrowed anything.** The horse is *last* in the casualty order and the
   `Math.max(4, …)` floor in `marksFor` means it never empties. It only read `gone` for `spears` and
   `archers` hosts — which have no horse at all, so it was greyed from beat one and read as
   "not my army" rather than as a loss.
3. **Bắn never even blunted** for the three commonest doctrines.
4. **Chông and Quy were hardcoded `ready`** because a dock with every chip dead is a bug.

So of five chips: two could never change state, one could not change state in practice, one changed
state only at army-select time, and one died almost instantly and permanently. The narrowing arc
was a straight cliff on a single chip.

5. **It was invisible.** Nothing on the battle screen showed block strength. A player could not see
   the screen block draining, could not predict when Tản ra would go, and had no way to learn the
   rule from play — the first they knew was a chip that stopped answering. The most common report
   was, verbatim, *"sometimes I cannot click Tản ra"*.
6. **It punished army composition twice.** A `shock` host already gives up the pre-contact exchange
   in the trade maths; taking a whole shape off its dock as well is a second tax on the same choice,
   levied silently.

## What is kept

`blockShares`, `DOCTRINE`, `FORMATION_ORDER`, `MEN_PER_MARK` and `compositionOfUnits` all stay —
they draw the army. `armyShape` needs them, the map marker needs them, the History plate needs them.
Only `formationAvailability` and its `BLOCK_OF` coupling to the dock are retired.
