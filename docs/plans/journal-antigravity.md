# Journal → Google Antigravity (2.0 + IDE + CLI)

## Context
Le plugin `journal` (plugins/journal) repose sur les hooks Claude Code et le parsing du transcript Claude, et écrit un journal verbatim dans `docs/journals`. Objectif : utiliser **la même skill journal** dans Antigravity 2.0 et Antigravity IDE, avec le même format de journal, la même lib et les mêmes trailers git. Mode hooks verbatim, packagé en **plugin Antigravity** dans le même dossier `plugins/journal/`. La config par projet va dans `.agents/` (fallback `.claude/`). Gemini CLI est écarté pour l'instant ; l'architecture d'adaptateurs permet de l'ajouter plus tard.

Faits vérifiés (docs antigravity.google, 2026) :
- **Skills** : `.agents/skills/<name>/SKILL.md` (workspace, commun à 2.0, IDE et CLI) ; global `~/.gemini/config/skills/`. Frontmatter `name`, `description`. Slash `/journal` automatique.
- **Hooks** : `.agents/hooks.json`, global `~/.gemini/config/hooks.json` ou `hooks.json` d'un plugin. Format `{ "<hook-name>": { enabled, PreToolUse|PostToolUse|PreInvocation|PostInvocation|Stop: [{matcher, hooks:[{type:"command",command,timeout}]}] } }`. Payload : `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`, `toolCall{name,args}`, `invocationNum`, `terminationReason`. Sortie PreToolUse : `{decision:"deny",reason}`. **Pas** de SessionStart ni UserPromptSubmit. L'outil shell s'appelle `run_command`.
- **Plugins** : à la racine du plugin, `plugin.json` (`name`, `description`) + `hooks.json` + `skills/` + `rules/` (+ `agents/`, `mcp_config.json`). Installation via `agy plugin install <path>` ou `/plugin install <name>@<marketplace>`. Scope workspace `.agents/plugins/`, global `~/.gemini/config/plugins/`. Pas de collision avec Claude, qui lit `.claude-plugin/plugin.json` + `hooks/hooks.json`.
- **Non documentés** (à établir en tâche 1) : variable racine du plugin dans les commandes de hooks, format du transcript, args des outils d'édition et de `run_command`, format marketplace, namespacing des skills, support des hooks dans l'IDE.

### Établi le 2026-10-06 (Antigravity 2.19.1, voir `antigravity-hooks-reference.md`)
- `PreToolUse` / `PostToolUse` : groupe `{matcher, hooks:[…]}`. `PreInvocation` / `PostInvocation` / `Stop` : liste **plate** `[{type, command, timeout}]` (sinon erreur `command hook must specify 'command'` dans `%APPDATA%\Antigravity\logs\language_server.log`).
- Commande lancée via `cmd /c` sous Windows, avec pour cwd le dossier qui contient `hooks.json`. Plugins : `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` substitués, plus env `PLUGIN_ROOT` / `PLUGIN_DATA`.
- Transcript : `~/.gemini/<antigravity|antigravity-ide|antigravity-cli>/brain/<conversationId>/.system_generated/logs/transcript.jsonl`, une ligne par step `{step_index, source, type, status, created_at, content?, thinking?, tool_calls?[{name,args}]}`. Types `USER_INPUT` (texte dans `<USER_REQUEST>…</USER_REQUEST>`), `PLANNER_RESPONSE`, `GENERIC` (résultat d'outil), `SYSTEM_MESSAGE`, `ERROR_MESSAGE`, `CHECKPOINT`. Les valeurs de `args` sont des chaînes JSON encodées (`"CommandLine":"\"git status\""`).
- **Pas de guillemets dans `command`** sous Windows : Go échappe `"` en `\"` pour `cmd /c` → node reçoit `\"C:\…\"` et le résout relativement au dossier de `hooks.json`. Pour le plugin : chemin **relatif** au cwd (= racine du plugin, qui contient `hooks.json`), par ex. `node skills/journal/scripts/journal.mjs …`. Ça règle aussi le cas des espaces dans `${PLUGIN_ROOT}`.
- **Un `PreToolUse` qui plante bloque tous les outils** : le hook doit toujours répondre `{"decision":"allow"}`, même en cas d'erreur (try/catch global, sortie écrite en premier).
- **Dumps réels (2.0, 2 conversations)** :
  - env `ANTIGRAVITY_CONVERSATION_ID` = `conversationId` ; cwd du hook = dossier de `hooks.json`.
  - `transcriptPath` pointe sur `transcript_full.jsonl`, où les `args` des `tool_calls` sont de vrais objets (alors que `transcript.jsonl` les encode en chaînes JSON).
  - Séquence d'un tour : `PreInvocation(invocationNum 0, initialNumSteps 1)` → `PreToolUse` → `PostToolUse` → `PostInvocation(0)` → `PreInvocation(1)` → `PostInvocation(1)` → `Stop(executionNum 0, terminationReason NO_TOOL_CALL, fullyIdle true)`.
  - Le prompt utilisateur est déjà dans le transcript à `PreInvocation(0)`, et la réponse finale (`PLANNER_RESPONSE` avec `content`) y est déjà au moment du `Stop`.
  - Donc : prompt = `PreInvocation` avec `invocationNum === 0` ; réponse = `Stop`.
- **Session riche (fixtures `scripts/fixtures/antigravity/`)** :
  - Outils d'édition : `write_to_file {TargetFile, CodeContent, Overwrite}` et `replace_file_content {TargetFile, TargetContent, ReplacementContent, StartLine, EndLine}`. Lecture : `view_file {AbsolutePath}`.
  - `ANTIGRAVITY_CONVERSATION_ID` est bien visible dans les commandes lancées par l'agent → le CLI `/journal` l'utilise, pas besoin de `journal-current`.
  - À chaque nouveau prompt, `invocationNum` repart à 0.
  - **Plan** (`/plan`) : un `write_to_file` avec `ArtifactMetadata.RequestFeedback: true`, écrit dans `artifactDirectoryPath` sous un nom libre (ici `plan_ameliorations_claw_machine.md`, avec un `.metadata.json` à côté). Puis `Stop`. L'approbation arrive sous forme de step `SYSTEM_MESSAGE` « …approved the artifact… Proceed to execution. » ; l'exécution reprend **sans nouveau USER_INPUT** (`invocationNum` continue, puis `Stop` avec `executionNum 1`).
  - **Conséquence** : la logique Claude « une réponse en attente par prompt » ne suffit pas, car il peut y avoir plusieurs `Stop` par prompt. Pour Antigravity, on **synchronise depuis le transcript** : on mémorise le dernier `step_index` journalisé par conversation, et à chaque `PreInvocation(0)` / `Stop` on journalise les steps suivants (USER_INPUT → prompt ; PLANNER_RESPONSE → bloc réponse ; write_to_file avec RequestFeedback → plan ; SYSTEM_MESSAGE d'approbation → « plan validé »).
  - IDE : pas encore capturé.
- Payload camelCase : `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`, `toolCall{name,args}`, `stepIdx`.

## Avancement (2026-10-06)
- Fait : tâches 0 à 6 pour Antigravity 2.0. 63 tests verts (lib Claude inchangée hors `renderReply({ speaker })`, adaptateur `agents/antigravity.mjs`, E2E qui rejoue la conversation capturée), `install.mjs --target antigravity` validé (install / check / uninstall / trailer git).
- Écarts au plan : pas d'`agents/claude.mjs` (Claude reste le chemin par défaut de `journal.mjs`, inutile de le déplacer) ; pas de `journal-current` (`ANTIGRAVITY_CONVERSATION_ID` est visible des shells de l'agent) ; pas de `--vendor` (le plugin résout ses scripts via le cwd = racine du plugin) ; état de synchro dans `.agents/journal-state.json`.
- Reste : test live du plugin dans Antigravity 2.0 (installation, `/journal`, plan, commit refusé), puis l'IDE.

## Tâches

### 0. Enregistrer ce plan dans le repo
- Copier ce plan dans `docs/plans/journal-antigravity.md` (première tâche, avant tout code).
- Note : le hook journal enregistre aussi automatiquement le plan validé dans `docs/journals/plan-<slug>.md`.

### 1. Capture des payloads réels
- Nouvelle commande `journal.mjs dump` : écrit stdin, la copie du transcript, `process.cwd()` et l'env filtré (`*PLUGIN*`, `*ANTIGRAVITY*`, `*GEMINI*`, `*AGENT*`) dans `.agents/journal-dump/`.
- `.agents/hooks.json` temporaire sur les 5 events (matcher `*`). Session courte dans **Antigravity 2.0** puis dans **l'IDE** : un prompt, une édition de fichier, une commande shell, un plan (implementation_plan).
- Fixtures anonymisées dans `scripts/fixtures/antigravity/`. On en tire : la racine du plugin, la forme des messages, les noms des outils d'édition et de leurs args, et le fichier plan (`implementation_plan.md` dans `artifactDirectoryPath`).

### 2. Adaptateurs `scripts/agents/`
- `claude.mjs` : comportement actuel extrait tel quel (non-régression).
- `antigravity.mjs` :
  - `configDirs: ['.agents', '.claude']`
  - `normalizeInput(raw)` → `{ sessionId: conversationId, root: workspacePaths[0], transcriptPath, toolName, toolInput, command, lastMessage, artifactDir }`
  - `normalizeTranscript(text)` → entrées au format Claude `{type:'user'|'assistant', message:{content:[text|tool_use{name,input:{file_path}}]}}`. Les outils d'édition sont mappés vers `Edit`/`Write` pour que `turnTouchedFiles` fonctionne.
  - `deny(reason)` → JSON `{decision:"deny",reason}`
  - session courante pour le CLI : fichier `.agents/journal-current` (dernier `conversationId`, écrit par chaque hook)
- `journal-lib.mjs` reste inchangé (`currentTurn`, `previousTurn`, `extractAssistantBlocks`, `turnTouchedFiles`, `reconcileLastMessage`, rendu, trailers).

### 3. `journal.mjs`
- Flag `--agent <claude|antigravity>` (défaut `claude`).
- `context()` gagne `ctx.agent` et `ctx.configDir`. `projectConfigPath`, `.local.json`, `journal-errors.log`, `journal-discarded` passent par `configDir`. `projectRoot` accepte `workspacePaths[0]`. `sessionFrom` passe par l'adaptateur.
- Correspondance des events :
  | journal | Claude | Antigravity |
  |---|---|---|
  | session | SessionStart | pas d'event → `rules/journal.md` + SKILL.md (`/journal last`) ; installation du git hook faite au premier `prompt` |
  | prompt | UserPromptSubmit | PreInvocation : dernier message user du transcript, ajouté seulement s'il n'est pas déjà journalisé (on réutilise `hasPendingReply` et la comparaison normalisée) |
  | stop | Stop | Stop (`fullyIdle` ; dernier texte assistant du transcript) |
  | plan | PostToolUse ExitPlanMode | Stop : `implementation_plan.md` modifié (hash mémorisé dans `.agents/journal-current`) → `recordPlan` |
  | questions | AskUserQuestion | rien (pas d'équivalent) |
  | precommit | PreToolUse Bash | PreToolUse `run_command` |
- `isWebEnv` reste false pour Antigravity : pas d'auto-stage.

### 4. Plugin Antigravity (dans `plugins/journal/`)
- `plugin.json` : `{ "name": "journal", "description": … }`.
- `hooks.json` à la racine : PreInvocation, Stop et PreToolUse(`run_command`) → `node <root>/skills/journal/scripts/journal.mjs <event> --agent antigravity`. `<root>` vient de la variable trouvée en tâche 1 ; sinon on passe par un launcher `scripts/agy-hook.mjs` qui teste `.agents/plugins/journal/`, `~/.gemini/config/plugins/journal/` puis `~/.gemini/antigravity-cli/plugins/journal/`.
- `rules/journal.md` : règles commit/synthèse, plus « en début de conversation, lance `/journal last` et propose `/journal use` si la demande continue une feature ».
- `skills/journal/SKILL.md` partagée, rendue agent-neutre : CLI désigné par chemin relatif à la skill, pas de `${CLAUDE_PLUGIN_ROOT}` obligatoire. `allowed-tools` et `$ARGUMENTS` restent, ignorés par Antigravity. Si ça ne passe pas dans les deux outils, on génère `skills/journal/SKILL.md` depuis un template à l'installation.
- Marketplace : ajouter le fichier Antigravity équivalent à `.claude-plugin/marketplace.json` si le format est documenté ou trouvé en tâche 1 ; sinon installation par chemin ou clone.

### 5. `install.mjs --target antigravity`
- Uniquement le per-projet, comme pour Claude : `.agents/journal.config.json` (+ `.local.json`), section journal dans `AGENTS.md` (template `claude-md-section.md`, bloc marqué), `.gitignore` (`.agents/journal.config.local.json`, `journal-errors.log`, `journal-discarded`, `journal-current`, `journal-dump/`), git hook `prepare-commit-msg` + `journal-git-hook.mjs` (agnostique, placé dans `.agents/`).
- `--vendor` : copie skill + scripts dans `.agents/skills/journal/` et écrit `.agents/hooks.json` (clé `"journal"`, fusion sans écraser l'existant) si le plugin est inutilisable (par exemple dans l'IDE).
- `--check` et `--uninstall` adaptés à la cible.

### 6. Docs
- README : section Antigravity (installation du plugin, `/journal init`, limites : pas de questions journalisées, pas de SessionStart).

## Fichiers
- Nouveaux : `docs/plans/journal-antigravity.md`, `plugins/journal/plugin.json`, `plugins/journal/hooks.json`, `plugins/journal/rules/journal.md`, `scripts/agents/{claude,antigravity}.mjs`, `scripts/agents.test.mjs`, `scripts/fixtures/antigravity/**`, éventuellement `scripts/agy-hook.mjs`.
- Modifiés : `scripts/journal.mjs` (adaptateur, `--agent`, `dump`), `scripts/install.mjs` (`--target`, `--vendor`), `skills/journal/SKILL.md`, `README.md`.
- Inchangés : `journal-lib.mjs`, `hooks/hooks.json` (Claude), `.claude-plugin/*`.

## Vérification
- `node --test plugins/journal/skills/journal/scripts/*.test.mjs` : tests Claude existants verts, plus les tests de l'adaptateur Antigravity sur fixtures (normalizeInput, normalizeTranscript → currentTurn / extractAssistantBlocks / turnTouchedFiles, format du deny, déduplication du prompt sur plusieurs PreInvocation).
- `agy plugin install ./plugins/journal` + `agy plugin list` → plugin actif, `/journal` disponible dans 2.0 et dans l'IDE.
- Claude : `claude plugin install journal@ai-dev-skills` toujours OK, aucun effet de bord.
- E2E Antigravity 2.0 puis IDE :
  - un prompt crée le journal draft, la réponse est journalisée
  - un plan crée `plan-<slug>.md` et renomme le journal
  - un `git commit` sans trailers est refusé, avec trailers il passe
  - `/journal status|note|use|pause` fonctionnent
- `.agents/journal-errors.log` vide.
