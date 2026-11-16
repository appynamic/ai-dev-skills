---
name: ap-preset
description: Apply rule presets to the project's CLAUDE.md and .claude/settings.json — `base` (never run pnpm dev, no local worktree, no local commit except on Claude Code web, fast unit tests), and stack presets as they are added. Use when the user types /ap-preset, or asks to add the usual/base agent rules, or rules for a stack, to a project.
argument-hint: "[list | status | apply <name>... | remove <name>...]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/skills/ap-preset/scripts/preset.mjs":*) Read Grep
---

# /ap-preset

CLI: `node "${CLAUDE_PLUGIN_ROOT}/skills/ap-preset/scripts/preset.mjs" <command>`, run from the project (it finds the git root).

| Command | Effect |
| --- | --- |
| `list` (default) | Presets available, one line each. |
| `status` | Presets applied to this project, and whether each block is up to date. |
| `apply <name>...` | Writes each preset's block into `CLAUDE.md` and merges its settings into `.claude/settings.json`. |
| `remove <name>...` | Removes the blocks and the settings values still equal to the preset's. |

## apply

1. Run with `--dry-run` first, show the result.
2. If the user agrees, run it again without `--dry-run`. Relay the `left out:` line: those rules are already written by hand in `CLAUDE.md`, so the preset does not say them twice. If the user prefers the preset's wording, they remove their own line and re-run `apply`.
3. Remind: `CLAUDE.md` and `.claude/settings.json` are committed files, so the rules apply to everyone who opens the project.

Re-running `apply` refreshes a block after a plugin update (`status` shows `outdated`). Blocks stay where they are in `CLAUDE.md`, between `<!-- preset:<name>:start -->` / `<!-- preset:<name>:end -->`. Never edit inside a block by hand: `apply` overwrites it. Project-specific rules go outside the blocks.

Settings are merged only where the project has no value yet: a key the project already sets is never changed.

## Adding a preset

A folder `presets/<name>/` next to `scripts/`:

- `rules.md`: a heading, then one `<!-- rule:<id> -->` line before each rule. Not `CLAUDE.md`: Claude Code would load it as memory.
- `preset.json`: `description`; `covered` (`{ "<id>": "<regex>" }`, case-insensitive: when it matches the project's `CLAUDE.md` outside managed blocks, that rule is left out); `settings` (merged into `.claude/settings.json`).

Shipped: `base`, `nuxt` (Nuxt 4 / Vue), `3d` (three.js: WebGPU first with WebGL2 only as fallback, TSL, Rapier, latest libs), `unity-port` (faithful `.unitypackage` → TypeScript + three.js WebGPU + TSL conversion, models and textures compressed with Draco/KTX2): `apply base 3d unity-port` for a port. Stack presets only carry what is specific to the stack, so `base` is applied alongside them: `apply base nuxt 3d` for a Nuxt three.js game.
