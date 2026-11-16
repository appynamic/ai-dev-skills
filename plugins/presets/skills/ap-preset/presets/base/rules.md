## Règles de travail des agents (preset `base`)

MUST FOLLOW. Chaque règle est née d'un incident réel.

<!-- rule:dev-server -->
- **Ne jamais lancer `pnpm dev` / `pnpm run dev`** : le serveur de dev tourne déjà, lancé à la main, avec HMR. Ne jamais tuer ni redémarrer un serveur qu'on n'a pas lancé soi-même — s'il meurt, le dire et le laisser mort. Un serveur lancé pour un test est arrêté dès le test fini.
- Tant que le serveur tourne : rien qui réinstalle les dépendances ou régénère le build (`pnpm install|add|remove`, `pnpm build`), le dire et laisser le développeur arrêter le serveur. Pas de réécriture en masse de fichiers surveillés (`git stash|checkout -- |reset --hard|switch`, `sed -i` ou script sur plusieurs fichiers, `prettier --write .`, `eslint --fix` sur un dossier) : comparer avec `git show HEAD:<fichier>` / `git diff`. Fichiers jetables dans le scratchpad, jamais dans le repo. Un changement qui exige un redémarrage : le signaler, ne pas redémarrer.
<!-- rule:worktree -->
- **Jamais de worktree en local** (`EnterWorktree`, `git worktree add`), même avec plusieurs sessions en parallèle ou en tâche de fond : travailler directement dans ce checkout, sur la branche courante.
<!-- rule:commit -->
- **Pas de commit en local** : jamais de `git add` / `git commit` / `git push` de sa propre initiative ; le commit se fait à la main. **Exception : Claude Code web** (session cloud, `CLAUDE_CODE_REMOTE=true`) : le bac à sable est éphémère, donc Claude y commite et pousse **de lui-même, sans attendre qu'on le demande**, à la fin de chaque tâche qui modifie des fichiers, sur la branche de la session. Rien ne doit rester non commité quand la session se termine. Toujours Conventional Commits (`feat|fix|refactor|build|ci|chore|docs|style|perf|test`).
<!-- rule:tests -->
- **Tests unitaires rapides** : extraire la logique pure (sans DOM, sans moteur, sans framework) pour la tester, spec à côté du fichier testé ; un test de régression pour chaque bug quand ça s'y prête. Lancer d'abord les fichiers ciblés (JS/TS : `pnpm exec vitest run <fichiers>`, environnement node), la suite complète **une fois** à la fin — jamais en mode watch (`vitest` seul bloque), jamais en boucle, jamais en parallèle d'autres commandes lourdes. Navigateur puis capture d'écran en dernier recours ; dire honnêtement quel niveau de vérification a été fait.
