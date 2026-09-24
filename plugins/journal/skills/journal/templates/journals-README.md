# Journaux de conversations

Historique des sessions Claude Code sur ce repo, écrit **automatiquement** par le plugin `journal` ([github.com/appynamic/ai-dev-skills](https://github.com/appynamic/ai-dev-skills)) et versionné avec le code.

## Fichiers

| Fichier | Contenu |
| --- | --- |
| `YYYY-MM-DD--NNN-<slug>.md` | le journal d'une feature : date de création + numéro du jour (`NNN`, repart à `001` chaque jour) + nom de la feature |
| `plan-<slug>.md` | le dernier plan validé pour cette feature (les versions précédentes sont dans l'historique git) |
| `…--NNN-brouillon-<id>.md` | journal d'une session pas encore nommée (pas de plan validé, pas de `/journal <titre>`) |

Un journal et son plan partagent le même `<slug>`.

## Lire un journal

- `## Session <date> · <id> (<machine>)` : une session Claude Code (`windows`, `mac`, `linux`, `web`).
- `> …` : ce que l'utilisateur a écrit, verbatim.
- `**Claude demande** — …` puis `> [choix] …` / `> [libre] …` / `> [note] …` : une question posée par Claude et la réponse donnée.
- `**Claude** · HH:mm` : la réponse de Claude. Selon la verbosité : dernier message seulement (`final`), tout le texte du tour (`text`), ou le texte avec une ligne `_⚙ Read ×3, Bash_` pour les outils utilisés (`text+tools`). `_fichiers : …_` liste les fichiers modifiés par le tour.
- `### Synthèse · …` : résumé écrit avant un commit, avec la table des fichiers modifiés. Le même texte est dans le message du commit.
- `--------------------------------------------` : sépare deux échanges.
- Les commentaires `<!-- journal:… -->` sont des marqueurs techniques : ne pas les modifier.

## Retrouver un sujet

- `/journal search <mots>` dans Claude Code.
- `git log --grep "Journal: {{dir}}/<fichier>"` : les commits liés à un journal.
