# Skills in this repo

Two kinds, and the split is the point.

## The six local ones — how *this game* works

`game-dev`, `game-map`, `game-mechanics`, `game-art-theme`, `game-heroes`, `game-harness`.

Hand-written, committed, and about this codebase: where the hex conversion helpers live, which
four mode factories exist, what the localization invariant crashes on, how to prove a change with
`test_scripts/`. Start at `game-dev`.

## The 28 `phaser-*` ones — how the engine works

**Generated. Do not edit them.** They are copied verbatim out of `node_modules/phaser/skills/`,
which is where Phaser 4 ships its own agent documentation — 28 skills covering cameras, filters,
render textures, tilemaps, tweens, input, the scale manager, `v3-to-v4-migration`, and
`v4-new-features`. Phaser 3 shipped none of this; it arrived with the Phaser 4 upgrade.

The only edit the sync makes is to the frontmatter: the `name` is prefixed to match the directory,
and the engine version is appended to the `description` so an agent reading it knows which Phaser
it describes.

```bash
yarn skills          # re-copy from node_modules after a Phaser version bump
yarn skills:check    # exits 1 if the committed copies are stale
```

They are committed rather than gitignored so a fresh clone and a CI run both have them without a
postinstall step.

### Which one answers a question

Engine question — "how do filters compose?", "what replaced `setTintFill`?", "what does
`DynamicTexture.render()` do?" — reach for the `phaser-*` skill. Game question — "where does the
fog live?", "how do I add a hero?", "which harness covers the battle screen?" — reach for the local
one. When both could apply, the local skill wins: it knows what this game does with the engine,
which is usually the part that is load-bearing.

## The MCP server in `.mcp.json`

`phaser-game-agent` is Phaser's own hosted MCP — it builds complete games on a managed cloud
workspace. It is **off by default and it is not part of this game's workflow**: its tools read and
write files in *its* sandbox, not this repo, and it builds on Phaser AE (a separate block-assembled
engine), not the Phaser 4 this game is written against. Its use here would be throwaway prototyping,
and it bills per build-minute against a Phaser account.

It is wired but unauthenticated on purpose. The entry reads `${PHASER_AGENT_TOKEN}`, so nobody's
token is committed and the server simply does not connect until someone opts in:

```bash
npx @phaserjs/game-agent login     # browser sign-in, prints/stores a token
export PHASER_AGENT_TOKEN=<token>  # then restart the CLI
```

Leave the variable unset and nothing happens. See `docs/phase-1/16-phaser-4-migration.md` Appendix C for
why this is opt-in rather than adopted.
