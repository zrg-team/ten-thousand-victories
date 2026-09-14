/**
 * Every number the Thánh Gióng story is balanced on, in one place. Nothing else in this folder
 * should carry a literal that changes how the story plays.
 */

/** How much stronger than the realm the invasion must be before the story will look at it. */
export const GATE_RATIO = 1.5;

/**
 * Even then, the roll it must win on each seeding tick (every 4 seasons) the gate is open. The story is
 * an omen (`StoryTemplate.omen`): this roll and the gate are its whole rate, once per run at most.
 */
export const SEED_CHANCE = 0.2;

/** Relative seed weight. Unused by an omen; kept the lowest in the catalogue (the rest sit at 1.4–3). */
export const SEED_WEIGHT = 0.5;

/** Earliest turn the story may seed. */
export const MIN_TURN = 20;

export type AskStore = 'food' | 'supplies' | 'gold';
export const ASK_STORES: readonly AskStore[] = ['food', 'supplies', 'gold'];

/**
 * X, per store, locked when the heralds go out: the larger of a share of the stock and a number of
 * seasons of gross income, never below the floor. 3X of each store is asked in total — 42% of the
 * grain, goods and gold the realm held at the call, or four and a half seasons of what it earns.
 */
export const ASK = {
  share: 0.14,
  seasons: 1.5,
  floor: { food: 60, supplies: 40, gold: 50 } as Record<AskStore, number>,
};

/**
 * The asks, as multiples of X per store. The order is the order he asks in; each entry is one card.
 * Adding a fourth ask is a row here plus a node and a card in `record.ts`.
 */
export const ASKS = {
  first: { food: 1, supplies: 1 },
  second: { food: 2, supplies: 2 },
  third: { gold: 3 },
} as const satisfies Record<string, Partial<Record<AskStore, number>>>;

/** What the invaders' abandoned baggage returns, as a share of everything the realm gave him. */
export const SPOILS_RETURN = 1;

/** Loyalty every province gains when the whole country feeds him. */
export const PEOPLE_LOYALTY = 6;

/** Bare-handed, with a bamboo grove: the share of the invasion's hosts he breaks before he falls. */
export const BAMBOO_SHARE = 0.5;

/** The shrine at Sóc Sơn, and the loyalty floor the realm keeps after him. */
export const SHRINE = { defense: 14, stability: 8 };
export const REALM_LOYALTY_FLOOR = 60;

/**
 * Patience per node, in seasons. Past patience the story gets louder; past twice patience it takes
 * the node's `onIgnored` door. The asks are generous because each card waits until it is affordable.
 */
export const PATIENCE = {
  call: 12,
  ask: 12,
  people: 6,
  ride: 16,
} as const;
