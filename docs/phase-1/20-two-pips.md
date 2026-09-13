> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Two pips — stamina on the fight screen

**Status: live.** Replaces per-shape wind (docs/phase-1/19-five-shapes-one-clock.md) the way wind replaced availability-by-blocks
(docs/phase-1/18-formation-availability-by-blocks.md). The code for both retired rules is gone from the engine; the doc trail is the record.

## The rule, whole

- **Stamina: two pips.** Changing formation costs one pip — any shape, any distance, the same
  every time. A spent pip comes back on its own after `BATTLE_STAMINA_REGEN_BEATS` (7 beats ≈ 6 s).
- **Nothing else touches it.** Not the stance, not a Moment, not a card, not the enemy.
- **Out of pips, you hold your shape.** That is the whole penalty for changing too fast.
- **The stance is the trade and only the trade:** Cố thủ / Cân bằng / Xung phong = take less &
  deal less / even / deal more & take more. Lui binh is an exit and lives with the exits.
- **The enemy holds while he is winning and answers only when losing.** His temper decides how
  fast (hesitation, hasty 2 · measured 3 · stubborn 4 · cunning 1, plus the difficulty's) and
  whether he presses a winning tilt. No rotation on a timer. No reading the player's dock.

## The game it makes

Read their formation and answer it. Miss the read, or be refused the rim on hard, and you are
losing without knowing why — so spend a pip on your best guess, watch the loss numbers, learn.
Spend both pips badly and you are stuck in a countered shape for a few beats: Cố thủ, wait for
the pip, spend it better. Find the counter and the enemy answers; read again.

## Information by difficulty (the rules never change)

| | enemy bubble | chip rims (which beats theirs) | loss numbers + verdict |
|---|---|---|---|
| easy | stays | yes | yes |
| normal | shows, fades 2.4 s | yes | yes |
| hard | fades 1.1 s | **no** | yes |
| nightmare | never | **no** | yes |

## Measured (verify-battle-stamina, 6,000 v 6,600, measured temper, medium)

- The invader holds for 20 beats while winning; answers 4–6 beats after being countered.
- A player who answers every answer is stuck 4–5 times a fight, one or two beats each.
- A player who chases every rotation is refused about seven times.
- Rationing is never worse than chasing; both rout an army 10% larger; a turtle that never
  changes shape is routed with ~6% of its men left.
- Regen tuned by measurement: 5 never bit; 8 stuck a careful player five times and rationing
  stopped paying; 7 is the edge.

## Why wind went

Five clocks, stance-driven recovery, a match exception and a signature shape were four rules to
explain one idea, and the idea was inverted from every convention players know (a cooldown on
the thing you *left*). Nobody knew why a chip was grey or what to do about it. Two pips, spent on
the thing you *do*, refilled by time alone, is a rule a child reads — and the screen now says
the move (`ĐANG THUA · CỐ THỦ`, the glowing button) without a number anywhere on it.
