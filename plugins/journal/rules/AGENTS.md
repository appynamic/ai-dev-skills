# Journal (plugin `journal`)

Conversations are journaled **automatically** by the plugin's hooks (prompts, the approved plan, your replies) into the project's journals directory — `docs/journals/` by default, see `/journal status`. You never write that verbatim yourself and never edit it.

- **The synthesis (`/journal note`) is appended at the very end of the journal, nothing else.** Insert it after the file's last line (`replace_file_content` on that last line, or an equivalent append) — **never `write_to_file` on a journal or a plan**: rewriting the whole file can alter the verbatim above it.

- At the start of a conversation, if the request clearly continues a feature already journaled (`/journal last`), offer `/journal use <slug>`.
- At the end of implementation work, if the journal is still a draft (`/journal status` → `draft: true`), offer a title and run `/journal <title>` if the user agrees.
- **Never `git add` or `git commit` on your own initiative.** If the user explicitly asks for a commit: `/journal note` first, then a Conventional Commits subject + that synthesis in the body + the `Journal:` (and `Plan:`) trailers given by `/journal status`. A hook refuses the commit otherwise: read its reason, fix the message, retry — never bypass it.
- If the user is about to paste sensitive data, suggest `/journal pause`.
- Everything else (commands, synthesis format, search): the `journal` skill.
