# ai-dev-skills

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces.md): install once, reuse the same skill across projects instead of copy-pasting `.claude/` folders around.

## Plugins

### [`journal`](plugins/journal)

Automatic dev journal, written by hooks — nothing to type. Every session gets a markdown file in `docs/journals/` with:

- your prompts, verbatim (`>` on every line);
- the questions Claude asked and your answers;
- the plan you approved;
- Claude's replies (how much of them is configurable — see below);
- a `--------------------------------------------` separator between exchanges.

A commit-message guard keeps every commit linked to its journal entry and plan (`Journal:` / `Plan:` trailers + a short synthesis), and never commits on its own initiative — see [plugins/journal/SKILL.md](plugins/journal/SKILL.md) for the full behavior.

Inspired by [juliuszfedyk/dev-journal](https://github.com/juliuszfedyk/dev-journal), reworked so hooks write the verbatim instead of Claude typing it out on request.

## Install

### 1. Add this marketplace

In Claude Code:

```
/plugin marketplace add appynamic/ai-dev-skills
```

Or commit it to a project's `.claude/settings.json` so every collaborator gets it automatically:

```json
{
	"extraKnownMarketplaces": {
		"ai-dev-skills": {
			"source": { "source": "github", "repo": "appynamic/ai-dev-skills" }
		}
	},
	"enabledPlugins": {
		"journal@ai-dev-skills": true
	}
}
```

### 2. Install the plugin

```
/plugin install journal@ai-dev-skills
```

Check it's enabled with `/plugin`.

**On Windows, install at user scope** (`claude plugin install journal@ai-dev-skills --scope user`, or pick "user" in `/plugin`). A project-scope install is keyed on the exact project path, and the drive letter's case depends on the launcher — the terminal CLI records `C:\…`, the VS Code extension `c:\…` — so a project install made from one never loads in the other: no hook fires, `/journal` is "no matching command", and nothing reaches `journal-errors.log`. `/journal init` and `install.mjs --check` warn about it.

### 3. Set up the project

Inside the project you want journaled:

```
/journal init
```

This asks for the journals directory (default `docs/journals`) and the verbosity you want locally vs. on Claude Code web, then writes the small set of files a plugin can't wire up by itself (a plugin's own hooks load automatically — see [How it works](#how-it-works)):

| File | Why |
| --- | --- |
| `.claude/journal.config.json` | project settings: `dir`, `locale`, `enforceCommit`, `verbosity`, `redact` — committed, shared by the team |
| `.claude/journal-git-hook.mjs` | self-contained trailer logic for **manual** commits (GitHub Desktop, terminal, CI) — committed, works even where the plugin isn't installed |
| `.githooks/prepare-commit-msg` (or appended to an existing hook, e.g. husky's) | the actual git hook, wired via `core.hooksPath` |
| `.gitattributes`, `.gitignore` | LF for the hook files; ignores `.claude/settings.local.json` and `.claude/journal-errors.log` |
| `package.json` `prepare` script | re-sets `core.hooksPath` after a fresh clone, only if `.githooks/` was created (skipped if an existing hook manager like husky already owns it) |
| `CLAUDE.md` section, `docs/journals/README.md` | conventions, inserted between `<!-- journal:start -->`/`<!-- journal:end -->` markers |

Then **start a new Claude Code session** — hooks load at session start, so the current one won't journal until the next one.

```
/journal init --uninstall     # or: node .../install.mjs --uninstall
```
removes exactly what `init` added. It never touches the journals themselves.

## How it works

A plugin's hooks (`plugins/journal/hooks/hooks.json`) load automatically once the plugin is enabled — Claude Code resolves `${CLAUDE_PLUGIN_ROOT}` to wherever it cached the plugin, so **no file is copied into your project for the Claude Code side of things**. The only things `/journal init` writes into your project are the two genuinely project-level pieces above: settings meant to be shared with your team (`journal.config.json`), and a git hook, which has to work independent of Claude Code entirely (GitHub Desktop, a teammate without the plugin, CI).

## Configure

`.claude/journal.config.json` (all optional, shown with defaults):

```json
{
	"dir": "docs/journals",
	"locale": "fr",
	"enforceCommit": true,
	"verbosity": { "default": "final", "web": "text+tools" },
	"redact": []
}
```

- `dir` — where journals live.
- `locale` — `fr` or `en`, for the labels ("Claude demande"/"Claude asks", "Synthèse"/"Synthesis"…).
- `enforceCommit` — `false` disables the refuse-incomplete-commit guard; the journal still gets staged on web.
- `verbosity` — see below.
- `redact` — extra regexes (as strings) to mask, on top of the built-in JWT/API-key/`password=`/private-key patterns.

Change `dir` or verbosity later with `/journal init` again, or `/journal verbosity <level> [--web]` for verbosity alone.

### Verbosity

| Level | What's recorded of Claude's replies | Default |
| --- | --- | --- |
| `final` | last message of the turn only | local (CLI, VS Code) |
| `text` | all of Claude's text in the turn, in order | — |
| `text+tools` | text + a `_⚙ Read ×3, Bash ×2_` line per tool group | Claude Code web |

## Daily use

| Command | Effect |
| --- | --- |
| *(nothing)* | verbatim writes itself |
| `/journal <title>` | names the session's journal (draft or existing) |
| `/journal note` | synthesis + file table — required before a Claude-made commit |
| `/journal use <slug>` | continue a journal from another session/machine |
| `/journal pause` / `resume` | stop/resume recording (before pasting sensitive data) |
| `/journal search <words>` / `last [N]` | find a past decision |
| `/journal status` | journal, plan, verbosity of the current session |

Naming: `YYYY-MM-DD--NNN-<slug>.md` (`NNN` = the day's sequence, restarts at `001` daily), paired with `plan-<slug>.md` (no date). A session without an approved plan starts as `…--NNN-brouillon-<id>.md`, renamed automatically at the first approved plan or via `/journal <title>`.

**Commits**: the journal never stages or commits on its own initiative, locally or on the web — see [plugins/journal/SKILL.md § Commit](plugins/journal/SKILL.md#commit--never-on-your-own-initiative). When a commit does happen (yours, or Claude's on your explicit request), the guard requires a synthesis and `Journal:`/`Plan:` trailers.

## Cross-machine / cross-project

- One plugin install serves every project on that machine — journal config stays per-project (`.claude/journal.config.json`), so different repos can use different directories/verbosity.
- Switching machines: `git pull`, then `/journal use <slug>` in the new session to continue the same journal.
- The committed `.claude/journal-git-hook.mjs` and `.githooks/prepare-commit-msg` work identically whether or not the plugin is installed on that particular machine — a teammate without the plugin still gets correct trailers on manual commits.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Nothing gets written | plugin not enabled (`/plugin`), or the session was opened before `/journal init` — open a new one. Check `.claude/journal-errors.log` |
| `/journal` → "no matching command" (Windows), no draft ever created | project-scope install made under the other drive-letter case (terminal `C:` vs VS Code `c:`) — `claude plugin install journal@ai-dev-skills --scope user`, then a new session. `install.mjs --check` flags it |
| Git hook ignored on Mac | `git ls-files -s .githooks/prepare-commit-msg` should show `100755`; otherwise `git update-index --chmod=+x .githooks/prepare-commit-msg` |
| Commit refused | read the reason: `/journal note`, then the synthesis in the commit body + `Journal:`/`Plan:` trailers |
| Question/answer missing from the journal | `AskUserQuestion`'s output shape changed — the raw JSON is in `journal-errors.log`; open an issue |
| Re-run setup after a config change | `/journal init` again — idempotent |

## Contributing

Tests: `node --test plugins/journal/skills/journal/scripts/journal-lib.test.mjs`. Pure logic lives in `journal-lib.mjs` (no filesystem/process access — everything testable goes there); `journal.mjs` and `install.mjs` are the thin I/O layer around it.

To add another plugin to this marketplace: a new `plugins/<name>/` with its own `.claude-plugin/plugin.json`, listed in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).

## Privacy

No data collection, no telemetry, no backend — see [PRIVACY.md](PRIVACY.md).

## License

MIT — see [LICENSE](LICENSE).
