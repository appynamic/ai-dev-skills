## Règles Nuxt (preset `nuxt`)

MUST FOLLOW. S'ajoute au preset `base`.

<!-- rule:nuxt4 -->
- **Nuxt 4 (Vue 3), jamais Nuxt 3** : structure `app/` · `server/` · `shared/`, docs et exemples de Nuxt 4 uniquement.
<!-- rule:composition -->
- **Composition API + `<script setup lang="ts">`**, jamais l'Options API. Avant d'écrire un composable, vérifier qu'il n'existe pas déjà dans VueUse ou Nuxt.
<!-- rule:typescript -->
- **TypeScript partout**, types à côté du code qui les utilise ; `interface` plutôt que `type` pour les formes d'objet.
<!-- rule:exports -->
- **Fonctions nommées** pour les méthodes, fléchées seulement pour les callbacks. **Exports nommés** plutôt que `export default`, sauf pour les fichiers qui l'exigent (pages, layouts, plugins, middleware, handlers Nitro `server/`).
<!-- rule:styling -->
- **Aucune couleur en dur** : tokens du thème du projet (palette Tailwind, `app/app.config.ts` avec Nuxt UI, ou variables CSS). Si le projet utilise Tailwind, ses classes plutôt que du CSS écrit à la main.
<!-- rule:comments -->
- **Commentaires** : seulement le *pourquoi*, jamais le *quoi* ; **ne jamais supprimer un commentaire existant**.
<!-- rule:i18n -->
- **i18n** : aucun texte visible codé en dur dans un composant. FR est la langue source : toute nouvelle clé va dans `fr.json` **et** `en.json`. Le fallback (`fallbackLocale`) se règle dans `i18n/i18n.config.ts`, jamais dans `nuxt.config.ts` (ignoré sans erreur). Après chaque édition d'un fichier de locale, valider le JSON (`node -e "JSON.parse(require('fs').readFileSync('i18n/locales/fr.json','utf8'))"`) et ne jamais y mettre de `{{…}}` littéral : une locale invalide fait tomber le serveur de dev, et ni tsc, ni eslint, ni vitest ne le voient.
<!-- rule:dev-stability -->
- **Ne pas faire tomber le serveur de dev** : rien qui régénère `.nuxt/` pendant qu'il tourne (`nuxt prepare`, `pnpm install|add|remove` dont le postinstall lance `nuxt prepare`, `nuxt build|generate`, `nuxi typecheck`, `nuxt db generate|migrate`). Pour les types : diagnostics de l'IDE ou vitest ciblé. Une édition de `nuxt.config.ts`, `i18n/i18n.config.ts`, `.env*` ou d'un plugin relance tout le build : une seule édition, jamais plusieurs à la suite. Une nouvelle route `server/api/**` n'est pas prise en compte à chaud sous Windows : tester la logique via vitest et signaler qu'un redémarrage est nécessaire.
<!-- rule:docs -->
- **Documentation** : ne jamais deviner une URL ; chercher d'abord le `llms.txt` de la lib (ex. `https://nuxt.com/llms.txt`), puis suivre ses liens.
