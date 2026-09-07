# Splitting MenuScene

`src/scenes/MenuScene.ts` reached 5,847 lines and 76 methods. These scripts are how it became a
~390-line scene and 17 modules under `src/scenes/menu/`, and how the result was proved to be the
same code in different places rather than a rewrite. They are the `scripts/conquest-split/`
tooling pointed at a second class; that README explains the shape and the traps in full.

## The shape

The class keeps every field, the Phaser lifecycle, `vy`/`vh`, and a one-line forwarding method for
each function another module needs to reach. Each module function takes the scene as `self`.

| kind | where | called how |
|---|---|---|
| facade | exported from its module, forwarded by the class | `self.renderMain()` |
| local | not exported, only its own file calls it | `renderTitle(self)` |
| leaf | `constants.ts`, `helpers.ts` — these import no sibling | imported directly |

Module-level state moved with its only reader: `continueOffered` sits in `shell.ts` beside
`create`, the seen-trait memory in `dynasty.ts`, the poured/floor-said memories in
`dynastyTablet.ts`. A `let` cannot be assigned through an import, so that placement is not a
choice.

## Re-running it

```bash
cp <pristine copy> src/scenes/MenuScene.ts
rm -rf src/scenes/menu
node scripts/menu-split/extract.cjs scripts/menu-split/partition.json   # --dry to preview
node scripts/menu-split/finish.cjs
node scripts/menu-split/headers.cjs restore scripts/menu-split/headers.json
node scripts/menu-split/verify.cjs <pristine copy>
npx tsc --noEmit
```

`finish.cjs` reuses `prune-imports.cjs` and `format-imports.cjs` from `scripts/conquest-split/`.
The pristine copy is the file as it was before the cut (`git show 55684e7:src/scenes/MenuScene.ts`
plus the working-tree edits of 2026-09-07, which the cut was made on).

Two things learnt on this cut, both fixed in `extract.cjs` / `order-facade.cjs`:

- A forwarding method keeps its parameter defaults, so `renderLanguageSwitch(top = LANGUAGE_TOP)`
  makes the class file a reader of that constant. The extractor now scans stub parameters.
- `vy()` is `return Math.round(...)`, a single call on a namespace, which the facade orderer read
  as a hand-off to a module called `Math`. It now only counts `import * as` names.
