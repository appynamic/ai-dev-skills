## Journal de conversations (skill `/journal`)

- Les conversations sont journalisées **automatiquement** par les hooks du plugin `journal` dans `{{dir}}/` : prompts (`>` sur chaque ligne), questions/réponses, plan validé, réponses de Claude (niveau réglé par `/journal verbosity`). Ne pas éditer le verbatim à la main.
- Journal : `YYYY-MM-DD--NNN-<slug>.md` ; plan : `plan-<slug>.md` (même slug). Une session sans plan écrit dans un brouillon `…--NNN-brouillon-<id>.md` : en fin d'implémentation, le renommer avec `/journal <titre>`.
- **Claude ne stage ni ne commite jamais de lui-même, en local.** Il écrit le journal dans l'arbre de travail (et la synthèse via `/journal note` sur demande) et reste sur la branche courante ; le commit se fait à la main et embarque le journal comme n'importe quel autre fichier modifié.
- **Si on demande explicitement à Claude de commiter** (local ou web) : `/journal note` d'abord (synthèse + table des fichiers), puis commit = sujet Conventional Commits + cette synthèse dans le corps + trailers `Journal: {{dir}}/…` et `Plan: {{dir}}/plan-…` avant `Co-Authored-By`. Le hook `precommit` refuse sinon (et, sur Claude Code web seulement, stage lui-même le journal — le bac à sable y est éphémère).
- **Pull request** : body = synthèses cumulées de la session + liens vers le journal et le plan.
- `/journal pause` avant de coller des données sensibles ; `/journal resume` ensuite. Les secrets courants sont masqués automatiquement, mais ce n'est qu'un filet.
- Session reprise sur une autre machine : `git pull`, puis `/journal use <slug>` pour continuer le même journal.
