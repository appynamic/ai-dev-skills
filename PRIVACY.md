# Privacy

This repository ships Claude Code plugins that run entirely inside Claude Code, on your own machine (or your own Claude Code web sandbox). No plugin here has a backend, calls a third-party service, or collects data of any kind.

## No data collection

- No telemetry, no analytics, no tracking.
- No network requests made by this code. The only network activity involved is Claude Code's own (model calls, plugin/marketplace installation) — see [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy) for that.
- Nothing is sent anywhere by this project. Everything it does is read a local file, write a local file, or run a local `git` command.

## `journal`

- Writes only to files inside the project you're working in (`docs/journals/` by default, `.claude/journal.config.json`, `.claude/journal-git-hook.mjs`) and to `.claude/journal-errors.log`, which stays local and is git-ignored.
- Reads the current session's transcript (the `.jsonl` file Claude Code already keeps locally under `~/.claude/projects/`) to recover prompts, replies, and plan text — never anything from another session or another project.
- Runs local `git` commands only: `add`, `mv`, `diff`, `log`, `config` (to read/set `core.hooksPath`), and — only when you explicitly ask Claude to commit — `commit`. It never pushes, fetches, or talks to a remote.
- Applies a best-effort redaction filter (JWTs, `Bearer` tokens, common API-key prefixes, private-key blocks, `password=`/`token:`-style pairs) before anything is written to a journal file — because **journal files are meant to be committed to your repository**, and once committed, they're visible to anyone with access to that repo, indefinitely, in its history. The filter is a safety net, not a guarantee: use `/journal pause` before pasting client data, credentials, or anything else sensitive, and `/journal resume` after.
- Journal content lives in your repository under your own control: rename it, edit it, delete it, or exclude `docs/journals/` from a repo entirely — this plugin has no opinion on who else can read a repo you choose to share.

## Questions or concerns

Open an issue on [github.com/appynamic/ai-dev-skills](https://github.com/appynamic/ai-dev-skills), or reach out through that repository.
