## Journal de conversations (skill `/journal`)

- Les conversations sont journalisées **automatiquement** par les hooks du plugin `journal` dans `{{dir}}/` : prompts (`>` sur chaque ligne), plan validé (artifact de plan approuvé), réponses de l'agent (niveau réglé par `/journal verbosity`). Ne pas éditer le verbatim à la main.
- Journal : `YYYY-MM-DD--NNN-<slug>.md` ; plan : `plan-<slug>.md` (même slug). Une conversation sans plan écrit dans un brouillon `…--NNN-brouillon-<id>.md` : en fin d'implémentation, le renommer avec `/journal <titre>`.
- En début de conversation, si la demande continue une feature déjà journalisée (`/journal last`), proposer `/journal use <slug>`.
- **L'agent ne stage ni ne commite jamais de lui-même.** Il écrit le journal dans l'arbre de travail (et la synthèse via `/journal note` sur demande) et reste sur la branche courante ; le commit se fait à la main et embarque le journal comme n'importe quel autre fichier modifié.
- **Si on demande explicitement de commiter** : `/journal note` d'abord (synthèse + table des fichiers), puis commit = sujet Conventional Commits + cette synthèse dans le corps + trailers `Journal: {{dir}}/…` et `Plan: {{dir}}/plan-…` en fin de message. Le hook refuse le commit sinon.
- **Pull request** : body = synthèses cumulées + liens vers le journal et le plan.
- `/journal discard` pour une conversation sans intérêt : supprime son brouillon et arrête de la journaliser (`/journal resume` pour annuler).
- `/journal pause` avant de coller des données sensibles ; `/journal resume` ensuite. Les secrets courants sont masqués automatiquement, mais ce n'est qu'un filet.
- Conversation reprise sur une autre machine : `git pull`, puis `/journal use <slug>` pour continuer le même journal.
