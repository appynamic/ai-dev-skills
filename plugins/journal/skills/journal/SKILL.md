---
name: journal
description: Automatic dev journal in docs/journals (prompts, questions/answers, plan, Claude's replies, written by hooks). Use to name the session's journal, write the synthesis, set verbosity, pause, resume a journal on another machine, search past journals, or set up the journal in a project. Use when the user types /journal, when the user explicitly asks Claude to commit in a repo where the journal is installed (never on Claude's own initiative), and when asked what was decided in a past session.
argument-hint: "[title | note | use <slug> | verbosity <final|text|text+tools> [--web] | pause | resume | search <words> | last [N] | status | init]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/skills/journal/scripts/journal.mjs":*) Bash(node "${CLAUDE_PLUGIN_ROOT}/skills/journal/scripts/install.mjs":*) Bash(git diff:*) Bash(git log:*) Bash(git status:*) Read Grep Glob Edit
---

# /journal

The verbatim is written **by hooks**, not by you: prompts, questions/answers, the approved plan and your own replies land in the journal on their own. Your job is only what needs judgment: naming, summarizing, searching.

CLI: `node "${CLAUDE_PLUGIN_ROOT}/skills/journal/scripts/journal.mjs" <command>`. The current session is read from `$CLAUDE_CODE_SESSION_ID`; don't pass `--session`.

Arguments received: `$ARGUMENTS`

## Commands

Take the first word of the arguments:

| Argument | What you do |
| --- | --- |
| *(empty)* or `status` | `journal.mjs status`, then say in one line: journal, plan, draft or not, verbosity. |
| `note` | Write the synthesis (see "Synthesis"). |
| `use <slug>` | `journal.mjs use <slug>`. Attaches the session to an existing journal — continuing a feature started in another session or on another machine. |
| `verbosity <level> [--web]` | `journal.mjs verbosity <level> [--web]`. Levels: `final` (last message only), `text` (all your text), `text+tools` (text + one line per tool group). `--web` sets the level used on Claude Code web. Takes effect next turn. |
| `pause` / `resume` | `journal.mjs pause` / `resume`. Nothing is journaled while paused. |
| `search <words>` | See "Search". |
| `last [N]` | List the N (default 5) most recent journals in the journals dir with their title (`# …`); for N=1, read it in full and summarize it. |
| `init` | Set up the journal in this project (see "Setup"). |
| anything else | It's a title: `journal.mjs rename <title>`. Date and NNN are kept, only the slug changes (the plan file follows). |

The journals directory is `dir` in `.claude/journal.config.json` (project-level, optional; default `docs/journals`).

## Setup (`/journal init`)

Run once per project (idempotent — safe to run again after a config change).

1. Ask: journals directory (default `docs/journals`), default verbosity locally (default `final`) and on Claude Code web (default `text+tools`).
2. `node "${CLAUDE_PLUGIN_ROOT}/skills/journal/scripts/install.mjs" --dry-run [--dir <path>] [--verbosity <v>] [--verbosity-web <v>]`, show the result.
3. Same command without `--dry-run`, then `install.mjs --check`. If it warns about the install scope, relay the fix as-is (`claude plugin install journal@ai-dev-skills --scope user`): on Windows a project-scope install is invisible to sessions opened with the other drive-letter case (terminal `C:` vs VS Code `c:`).
4. Remind: verify the plugin is enabled with `/plugin`, then start a **new session** — hooks load at session start, so the current one won't journal until the next one.

## Synthesis

Write it on `/journal note`, and **always before a commit you make yourself**.

1. `journal.mjs status`: journal and plan paths.
2. `git add` the commit's files if not staged yet, then `journal.mjs table`: markdown table of staged files.
3. Append to the end of the journal (Edit, end of file only; never touch anything above):

   ```md
   ### Synthèse · YYYY-MM-DD HH:mm

   Résumé : one paragraph, factual, past tense: what was done and why.
   Décisions : the choices made and why (one line each).
   Suites : what's left to do or verify.

   | Fichier | Changement |
   | --- | --- |
   | `path` | modified — what changed, briefly |
   ```

   Fill in the "Changement" column of the table produced by `table` with a few words per file.
4. Cover what happened since the previous synthesis, not the whole session.

## Commit — never on your own initiative

**You only run `git add` or `git commit` when the user explicitly asks for it in this turn.** This isn't specific to the journal: it's the general rule ("commit or push only when the user asks"). The journal doesn't change that — it prepares, it never pushes a commit on its own.

**Locally**: write/update the journal (`/journal note` if asked) in the working tree, that's it. Don't stage anything for the journal, don't branch for it, stay on the current branch. The commit is made by hand by the user, who'll see the journal like any other modified file.

**On Claude Code web**: the sandbox is ephemeral — anything uncommitted disappears with it. The `precommit` hook auto-stages the journal and plan whenever a `git commit` happens (yours on request, or otherwise triggered), so they travel with it. But you still don't commit without being asked — if a session is ending with uncommitted work, say so clearly instead of committing silently.

**If asked to commit** (local or web), the `precommit` hook refuses until the message has this shape:

```
type(scope): subject, Conventional Commits

Résumé : … (from the synthesis)
Décisions : …

Journal: docs/journals/YYYY-MM-DD--NNN-slug.md
Plan: docs/journals/plan-slug.md
Co-Authored-By: …
```

- `Plan:` only if a plan exists (`status` says so).
- Use a heredoc (`git commit -m "$(cat <<'EOF' … EOF)"`) so the hook can read the message.
- If the commit is refused, read the reason, fix the message, retry. Never bypass the hook.

## Pull request

The PR body holds the session's (or branch's) syntheses, then links to the journal and plan. This is a guideline — no hook checks it.

## Search

1. Glob `<dir>/*<word>*.md`: file names carry the feature's slug.
2. If fewer than 3 results: full-text Grep (`-i`, a few lines of context) in `<dir>/`.
3. Answer with a `Journal | Date | Relevance` table, then quote the useful passages (decisions, question answers).
4. Related commits: `git log --oneline --grep "Journal: <dir>/<file>"`.

## Rules

- At the end of implementation work, if the journal is still a draft (`status` → `draft: true`), propose a title and run `/journal <title>` if the user agrees.
- At the start of a session, the `SessionStart` hook lists recent journals: if the request clearly continues one of them, propose `/journal use <slug>`.
- Never edit verbatim content already written, or the `<!-- journal:… -->` markers.
- If the user is about to paste sensitive data, suggest `/journal pause`.
- A hook problem shows up in `.claude/journal-errors.log`.
- Never stage or commit without being explicitly asked in the turn — the journal is prepared, not committed on its own (see "Commit").
