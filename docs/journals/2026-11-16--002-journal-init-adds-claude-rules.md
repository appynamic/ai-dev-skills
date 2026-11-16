# Journal init adds Claude rules to CLAUDE.md

<!-- journal:session 95abc749-fa86-4355-90f8-2e39ded7893c -->
<!-- journal:auto-title -->

- Plan : —
- Sessions : `95abc749` 2026-11-16 (windows)

## Session 2026-11-16 · 95abc749 (windows)

> en regardant ce que j'ajoute à chaque fois comme consignes dans CLAUDE.md dans ses projets ci-dessous :
> - C:\www\rd\ai-agents
> - C:\www\rcl\rcl-mobile-v2
> - C:\www\appy\game_ohlain
> - C:\www\appy\game_hole
> - C:\www\webcreators\game_meowdoku
>
> cela doit parcourir les thematiques suivantes en principe :
> - ne pas lancer pnpm de
> - pas de worktree en local
> - pas de commit en local excepté si claude web (en version cloud)
> - des tests unitaires rapides
>
> Peux tu me résumer les régles et les lister ici ou dans un doc claude_rules.md pour les inclures automatiquement via une surchage du skill journal qui modifie le claude.md du projet si cela n'existe pas déjà

<!-- journal:turn -->

**Claude** · 11:59 · _fichiers : plugins/journal/skills/journal/templates/claude-rules.md, plugins/journal/skills/journal/scripts/install.mjs, plugins/journal/skills/journal/scripts/install.test.mjs, README.md, plugins/journal/skills/journal/SKILL.md_

C'est en place : `/journal init` ajoute maintenant les règles au CLAUDE.md du projet, sauf les thèmes déjà écrits à la main. Les 92 tests passent, rien n'est commité, et aucun des 5 projets n'a été modifié.

##### Règles retenues
Elles sont dans [templates/claude-rules.md](plugins/journal/skills/journal/templates/claude-rules.md) :

1. **Serveur de dev** : ne jamais lancer `pnpm dev` / `pnpm run dev`, le serveur tourne déjà avec HMR. Ne jamais tuer ni redémarrer un serveur qu'on n'a pas lancé soi-même. Tant qu'il tourne :
   - rien qui régénère `.nuxt/` ou `node_modules/` (`pnpm install`, `nuxt prepare`, build, typecheck) ;
   - pas de réécriture en masse de fichiers (`git stash`, `checkout`, `sed -i` sur plusieurs fichiers, `prettier --write .`) ;
   - les fichiers jetables vont dans le scratchpad ;
   - si un redémarrage est nécessaire, le signaler sans redémarrer.
2. **Worktree** : jamais en local (`EnterWorktree`, `git worktree add`), même avec plusieurs sessions en parallèle. On travaille dans le checkout, sur la branche courante.
3. **Commit** : jamais de `git add` / `commit` / `push` en local à l'initiative de Claude. Seule exception : Claude Code web (`CLAUDE_CODE_REMOTE=true`), où le bac à sable est éphémère, donc commit et push sur la branche de la session. Toujours en Conventional Commits.
4. **Tests unitaires rapides** :
   - Vitest en environnement node, sur de la logique pure, avec la spec à côté du fichier testé ;
   - un test de régression par bug quand ça s'y prête ;
   - d'abord `pnpm exec vitest run <fichiers>`, puis la suite complète une seule fois à la fin ;
   - jamais `vitest` seul, car il reste en mode watch et bloque ;
   - navigateur ou capture d'écran en dernier recours.

##### Fonctionnement
- [install.mjs](plugins/journal/skills/journal/scripts/install.mjs) écrit les règles dans un bloc `<!-- claude-rules:start/end -->`. Relancer l'installation met le bloc à jour sans le dupliquer, et `--uninstall` le retire.
- **« Si ça n'existe pas déjà »** : chaque thème déjà couvert à la main ailleurs dans le CLAUDE.md est laissé de côté, et la sortie l'indique (`left out: …`). Le bloc du journal n'est pas pris en compte dans cette vérification.
- L'option `--no-rules` ignore le bloc. `/journal init` demande maintenant s'il faut l'ajouter (oui par défaut).
- Seul Claude Code est concerné, pas Antigravity.
- Tests de non-régression dans [install.test.mjs](plugins/journal/skills/journal/scripts/install.test.mjs) ; README et SKILL.md sont mis à jour.

##### Ce que ça ajouterait sur tes projets
Vérifié en lecture seule :

| Projet | Ajouté | Déjà présent, laissé de côté |
|---|---|---|
| ai-agents | worktree, commit | serveur de dev, tests |
| rcl-mobile-v2 | worktree, commit, tests | serveur de dev |
| game_ohlain | serveur de dev, commit, tests | worktree |
| game_hole | serveur de dev, commit, tests | worktree |
| game_meowdoku | serveur de dev, tests | worktree, commit |

Pour l'appliquer, lance `/journal init` dans chaque projet. Attention : le CLAUDE.md du projet est commité, donc ces règles seront aussi visibles par toute personne qui l'ouvre.

<!-- journal:reply -->

--------------------------------------------

> pour le worktree il me semble qu'on modifie dans .claude le fichier settings.json, peux tu appliquer l'ajout de la commande si elle n'existe pas déjà :
> {
>   "worktree": {
>     "bgIsolation": "none"
>   }
> }

<!-- journal:turn -->

**Claude** · 12:03 · _fichiers : plugins/journal/skills/journal/scripts/journal-lib.mjs, plugins/journal/skills/journal/scripts/journal-lib.test.mjs, plugins/journal/skills/journal/scripts/install.mjs, plugins/journal/skills/journal/scripts/install.test.mjs_

`/journal init` ajoute maintenant `"worktree": { "bgIsolation": "none" }` dans `.claude/settings.json`, seulement si la clé n'existe pas déjà. Les 96 tests passent, rien n'est commité.

**Comportement**
- **Fusion** : les autres clés de `worktree` (ex. `symlinkDirectories`) et le reste du fichier sont conservés.
- **Valeur déjà présente** : si `bgIsolation` a déjà une valeur, quelle qu'elle soit, on n'y touche pas.
- **`--uninstall`** : retire la clé seulement si elle vaut `"none"`, et retire `worktree` s'il se retrouve vide.
- **`--no-rules`** : ignore à la fois le bloc de règles du CLAUDE.md et ce réglage, pour rester cohérent avec la règle « pas de worktree ».
- Le code est dans `withNoWorktree()` ([journal-lib.mjs](plugins/journal/skills/journal/scripts/journal-lib.mjs)), appelé par `installSettings` ([install.mjs](plugins/journal/skills/journal/scripts/install.mjs)). Tests ajoutés dans [journal-lib.test.mjs](plugins/journal/skills/journal/scripts/journal-lib.test.mjs).

**Bug corrigé au passage**
Une 2ᵉ installation réécrivait le `CLAUDE.md` à chaque fois : un saut de ligne de plus en tête de fichier. Ça arrivait quand il commençait par un bloc géré par l'installation, par exemple un CLAUDE.md vide qui reçoit le bloc journal puis le bloc de règles. C'est corrigé dans `upsertBlock`. Un test de bout en bout dans [install.test.mjs](plugins/journal/skills/journal/scripts/install.test.mjs) vérifie maintenant qu'une 2ᵉ installation ne change rien et que `bgIsolation` est bien posé.

README et SKILL.md mentionnent le réglage. Pour l'appliquer à tes 5 projets, relance `/journal init` dans chacun.

<!-- journal:reply -->

--------------------------------------------

> ajouter plutot un nouveau skills pour l'impact sur claude.md et settings.json enfin de le séparer du journal. On pourrait ajouter une commande "preset" ou un meilleur nom dans journal pour appliquer les regles de "base" sur claude.md. Ensuite on completera avec des regles propres pour "nuxt" ou "unity" ?

<!-- journal:turn -->

**Claude** · 12:07 · _fichiers : plugins/presets/skills/preset/presets/base/preset.json, plugins/presets/skills/preset/scripts/preset.mjs, plugins/presets/skills/preset/scripts/preset.test.mjs, plugins/presets/.claude-plugin/plugin.json, plugins/presets/skills/preset/SKILL.md, README.md, plugins/journal/skills/journal/scripts/install.test.mjs_

Les règles sont maintenant dans un plugin séparé, `presets`, avec sa commande `/preset`. Le journal ne touche plus aux règles ni au `settings.json`. Les 100 tests passent (journal + presets), rien n'est commité, et aucun des 5 projets n'a été modifié.

**Commandes `/preset`**

| Commande | Effet |
|---|---|
| `list` | liste les presets disponibles |
| `status` | presets appliqués au projet, et lesquels sont à rafraîchir |
| `apply base [nuxt…]` | ajoute un bloc `<!-- preset:<nom>:start/end -->` dans `CLAUDE.md` et complète `.claude/settings.json` |
| `remove <nom>` | retire le bloc et les réglages qui ont encore la valeur du preset |

- **Règles déjà écrites à la main** : elles sont laissées de côté, comme avant, et la commande l'indique (`left out: …`).
- **`settings.json`** : on n'ajoute que les clés absentes, une valeur déjà réglée n'est jamais modifiée.
- **Ordre des blocs** : relancer `apply` met un bloc à jour là où il est, sans le déplacer en fin de fichier. `base` puis `nuxt` gardent donc leur ordre.

**Ajouter `nuxt` ou `unity`** : il suffit de créer un dossier `presets/<nom>/` avec deux fichiers, sans toucher au code.
- `rules.md` : les règles, chacune précédée d'un marqueur `<!-- rule:<id> -->`.
- `preset.json` : une description, `covered` (pour chaque règle, une regex qui repère si elle est déjà écrite à la main) et `settings`.

Un preset de stack ne porte que ce qui lui est propre, et s'applique avec `base` : `/preset apply base nuxt`.

**Deux points à savoir**
- **Nom du fichier de règles** : il s'appelle `rules.md` et non `CLAUDE.md`, sinon Claude Code le chargerait comme consignes en travaillant dans ce dossier du dépôt.
- **Correctif gardé dans le journal** : le bug de saut de ligne en tête de `CLAUDE.md` (`upsertBlock`) reste corrigé dans le journal. Un test le couvre, et il échoue bien sans le correctif. Pense à passer le journal en 1.3.9 à la publication.

**Sur tes projets** : en simulation sur game_hole, `apply base` ajouterait serveur de dev, commit et tests ; worktree est déjà écrit à la main. game_hole, game_ohlain et game_meowdoku ont déjà `bgIsolation: "none"`, donc leur `settings.json` ne bougera pas. rcl-mobile-v2 n'a pas de `settings.json` : il sera créé.

Fichiers principaux :
- [preset.mjs](plugins/presets/skills/preset/scripts/preset.mjs)
- [SKILL.md](plugins/presets/skills/preset/SKILL.md)
- [presets/base/](plugins/presets/skills/preset/presets/base/)

Le plugin est ajouté dans [marketplace.json](.claude-plugin/marketplace.json) et le README est à jour.

Je prépare le preset `nuxt` à partir des règles de ai-agents et rcl-mobile-v2 (Nuxt 4, Composition API, i18n, Tailwind, `.nuxt/`) ?

<!-- journal:reply -->

--------------------------------------------

> oui

<!-- journal:turn -->

**Claude** · 12:12 · _(tour interrompu)_ · _fichiers : plugins/presets/skills/preset/presets/nuxt/rules.md, plugins/presets/skills/preset/presets/nuxt/preset.json, plugins/presets/skills/preset/presets/base/rules.md_

game_hole et game_meowdoku n'utilisent pas Tailwind : j'adapte la règle de style pour qu'elle reste valable sans Tailwind.

<!-- journal:reply -->

--------------------------------------------

> utilise plutot le nom appy-preset au lieu de preset pour la commande, comme ca cela fait une sorte d'isolation par rapport à appynamic et empeche d'utiliser ce mot générique en collision avec de possible autres commandes

<!-- journal:turn -->

**Claude** · 12:13 · _fichiers : plugins/presets/skills/preset/presets/nuxt/rules.md, plugins/presets/skills/preset/presets/nuxt/preset.json, plugins/presets/skills/preset/presets/base/rules.md_

Le preset `nuxt` est prêt et la commande s'appelle maintenant `/appy-preset`. Les 100 tests passent, rien n'est commité, et aucun projet n'a été modifié.

**Renommage**
- Le dossier du skill devient `skills/appy-preset/`, avec `name: appy-preset` dans le SKILL.md. Les chemins des outils autorisés et le README suivent.
- Le mot `preset` seul n'apparaît plus comme commande.
- Le plugin s'appelle toujours `presets`, donc l'installation reste `presets@ai-dev-skills`. Je peux aussi le renommer en `appy-presets` pour être cohérent, ce qui est sans risque puisqu'il n'est pas encore publié.

**Preset `nuxt`** (dans [presets/nuxt/](plugins/presets/skills/appy-preset/presets/nuxt/)), tiré surtout d'ai-agents et de rcl-mobile-v2 :
1. Nuxt 4, jamais Nuxt 3.
2. Composition API avec `<script setup lang="ts">`, et vérifier VueUse avant d'écrire un composable.
3. TypeScript, `interface` plutôt que `type`.
4. Fonctions nommées et exports nommés, sauf pour les fichiers qui imposent un `export default` (pages, layouts, plugins, middleware, `server/`).
5. Aucune couleur en dur, et les classes Tailwind si le projet utilise Tailwind. J'ai adapté cette règle parce que game_hole et game_meowdoku n'utilisent pas Tailwind.
6. Commentaires : seulement le pourquoi, et ne jamais en supprimer un.
7. i18n :
   - aucun texte visible en dur ;
   - FR est la source, chaque clé va dans `fr.json` et `en.json` ;
   - le fallback se règle dans `i18n.config.ts` ;
   - valider le JSON après chaque édition, sans `{{…}}` littéral.
8. Ne pas faire tomber le serveur de dev :
   - rien qui régénère `.nuxt/` pendant qu'il tourne ;
   - une seule édition à la fois sur les fichiers de config ;
   - une nouvelle route `server/api` n'est pas prise en compte à chaud sous Windows : le signaler.
9. Documentation : chercher d'abord le `llms.txt`, ne jamais deviner une URL.

Un preset de stack ne règle rien dans `settings.json` pour l'instant.

**`base` rendu indépendant de la stack** : les détails propres à Nuxt sont passés dans `nuxt`. La règle de tests reste écrite pour Vitest (« JS/TS : … »), mais le principe s'applique à n'importe quelle stack, Unity compris.

**Effet en simulation sur tes projets**

| Projet | `base` ajoute | `nuxt` ajoute |
|---|---|---|
| ai-agents | worktree, commit | rien : tout est déjà dans son CLAUDE.md |
| rcl-mobile-v2 | worktree, commit, tests | i18n, stabilité du serveur |
| game_ohlain | serveur de dev, commit, tests | tout sauf i18n |
| game_hole | serveur de dev, commit, tests | les 9 règles |
| game_meowdoku | serveur de dev, tests | tout sauf i18n |

Pour l'appliquer : `/appy-preset apply base nuxt` dans chaque projet. Le preset `unity` viendra quand tu me donneras un projet Unity comme référence.

<!-- journal:reply -->

--------------------------------------------

> ajoute un preset "3d" pour les projets three.js, rapier en physique, toujours utiliser webgpu, tsl pour les shaders, failback only en webgl, toujours les dernieres librairies, regarde les game_ dans "C:\www\appy" comment j'ai fait

<!-- journal:turn -->

**Claude** · 12:17 · _fichiers : plugins/presets/skills/appy-preset/presets/3d/rules.md, plugins/presets/skills/appy-preset/presets/3d/preset.json, plugins/presets/skills/appy-preset/scripts/preset.test.mjs_

Le preset `3d` est prêt : `/appy-preset apply base nuxt 3d` pour un jeu Nuxt + three.js. Les 101 tests passent, rien n'est commité, et aucun projet n'a été modifié.

**Les règles du preset**, dans [presets/3d/rules.md](plugins/presets/skills/appy-preset/presets/3d/rules.md) :
1. **WebGPU d'abord** : `WebGPURenderer`, imports `three/webgpu` et `three/tsl`, jamais `three` ni `WebGLRenderer`. WebGL2 n'est qu'un repli, dans deux cas :
   - le repli automatique de `WebGPURenderer` quand WebGPU manque ;
   - `forceWebGL` quand l'appareil n'offre WebGPU qu'en mode compatibilité (l'écran noir sur Adreno). Ce choix est une fonction pure, testée, avec un délai maximal, comme le fait game_stack.
2. **TSL** : tout matériau est un `*NodeMaterial` ; ni GLSL, ni `ShaderMaterial`, ni `onBeforeCompile`. J'ai ajouté le piège de game_ohlain : une couleur s'écrit `color(new Color())`, pas `vec3(...)`, sinon elle compile en noir sans erreur.
3. **Rapier** (`@dimforge/rapier3d-compat`) :
   - `init()` une seule fois, un seul monde par partie ;
   - pas fixe de 1/60 avec accumulateur, jamais le `dt` brut de l'image ;
   - le code physique ne connaît pas three ; `world.free()` au démontage.
4. **Dernières versions** : vérifier avec `pnpm view` puis lire le guide de migration ; version exacte épinglée, et `three` et `@types/three` toujours à la même version. Aujourd'hui : three 0.187.0 (celle de tes projets) et rapier3d-compat 0.21.0.
5. **Moteur hors de la réactivité** : le handle du jeu ne va jamais dans un `ref` ou un store, et `createGame` est importé dynamiquement.
6. **Couches pures** : règles et données sans three ni DOM, testées sous vitest, avec un test qui vérifie les imports.
7. **Cycle de vie** : un seul jeu par document, aucune taille lue sur `window`, chaque écouteur reçoit le `signal` de la partie, `abort()` puis `dispose()` au démontage.
8. **Boucle** : `setAnimationLoop`, `dt` tiré du timestamp de l'image, plafond à 60 i/s, résolution dynamique et paliers de qualité `low/mid/high`.
9. **Performance mobile** :
   - instancier ce qui se répète, fusionner la géométrie statique ;
   - chauffer toutes les pipelines avant de jouer ; un modèle chauffé est caché, jamais `dispose()` en cours de partie ;
   - pas de `castShadow` sur les personnages : une ombre ronde au sol et une carte d'ombre statique.

**Ce qui vient de toi et ce que j'ai ajouté** : Rapier n'est utilisé dans aucun de tes projets. Cette règle est donc écrite d'après les bonnes pratiques de Rapier, pas d'après ce que tu as fait. Même chose pour « toujours les dernières versions », que tu as demandé mais qui n'était écrit nulle part : relis ces deux règles.

**Effet en simulation**

| Projet | `3d` ajoute | Déjà écrit à la main |
|---|---|---|
| game_ohlain | rapier, latest | les 7 autres |
| game_hole | rapier, latest, layers, frame, perf | webgpu, tsl, handle, lifecycle |
| game_stack | tsl, rapier, latest, layers, lifecycle, perf | webgpu, handle, frame |
| game_platformer, game_squishy | les 9 règles | rien |

Bug évité en route : « D**rapier**s » dans game_ohlain faisait croire que la règle Rapier y existait déjà. Ma première correction était elle-même fausse (en JSON, `"\b"` est un caractère de contrôle, pas une limite de mot) ; c'est corrigé et couvert par un test dans les deux sens.

**À vérifier de ton côté** :
- `game_platformer_extended/CLAUDE.md` contient deux fois le bloc journal.
- Le bloc journal de `game_platformer` dit l'inverse du preset `base` : il demande à Claude de commiter et pousser toujours dans le cloud, sans attendre qu'on le demande.

<!-- journal:reply -->

--------------------------------------------

> utilise plutot la commande ap-preset pour etre plus court

<!-- journal:turn -->

**Claude** · 12:20

La commande s'appelle maintenant `/ap-preset`, par exemple `/ap-preset apply base nuxt 3d`. Les 13 tests du plugin passent.

Le dossier du skill est devenu `plugins/presets/skills/ap-preset/`, avec `name: ap-preset` dans le SKILL.md. Les chemins des outils autorisés et le README sont mis à jour, et il ne reste plus aucune mention de `appy-preset`.

Le plugin s'appelle toujours `presets` : il s'installe avec `presets@ai-dev-skills`.

<!-- journal:reply -->

--------------------------------------------

> Le bloc journal de game_platformer dit l'inverse du preset base : il demande à Claude de commiter et pousser toujours dans le cloud, sans attendre qu'on le demande. => je veux dire que si la modification d'un git vient de claude web (déployé en cloud) alors il a le droit de commiter

<!-- journal:turn -->

**Claude** · 12:24 · _fichiers : plugins/presets/skills/ap-preset/presets/base/rules.md_

Tu as raison, il n'y avait pas de contradiction : le preset `base` autorisait déjà le commit sur Claude Code web. La formulation était juste plus faible que celle de game_platformer, je l'ai alignée dans [presets/base/rules.md](plugins/presets/skills/ap-preset/presets/base/rules.md) :

> **Pas de commit en local**, sauf **Claude Code web** (`CLAUDE_CODE_REMOTE=true`) : Claude y commite et pousse **de lui-même, sans attendre qu'on le demande**, à la fin de chaque tâche qui modifie des fichiers, sur la branche de la session. Rien ne doit rester non commité quand la session se termine.

Les 13 tests passent. Sur game_platformer, `base` ajouterait les 4 règles, dont celle-ci : sa ligne sur le cloud est dans le bloc journal, qui n'est pas pris en compte pour repérer les règles déjà écrites. Les deux textes disent maintenant la même chose.

Attention à un point : cette ligne sur le cloud n'existe pas dans le modèle du journal de ce dépôt ([claude-md-section.md](plugins/journal/skills/journal/templates/claude-md-section.md)). Un `/journal init` sur game_platformer réécrirait son bloc journal et la supprimerait. Ce n'est pas grave si `base` est appliqué, car la règle y est. Je peux aussi l'ajouter au modèle du journal pour que les deux restent cohérents. Je le fais ?

<!-- journal:reply -->

--------------------------------------------

> on garde les modifs dans plugins\journal\skills\journal\scripts\install.mjs ? et plugins\journal\skills\journal\scripts\install.test.mjs ?

<!-- journal:turn -->

**Claude** · 12:25

Oui, je te conseille de garder les deux.

**[install.mjs](plugins/journal/skills/journal/scripts/install.mjs)** : la modification ne touche que `upsertBlock`, sur 4 lignes. Elle corrige un vrai bug du journal, qui existe même sans les presets. Quand `CLAUDE.md` commence par le bloc journal, ce qui est le cas d'un CLAUDE.md créé par `/journal init` puis complété à la main, un nouveau `/journal init` laissait une ligne vide en tête du fichier. Avec un deuxième bloc géré par l'installation, cette ligne vide s'ajoutait à chaque passage.

**[install.test.mjs](plugins/journal/skills/journal/scripts/install.test.mjs)** : c'est le test de non-régression de ce bug. J'ai vérifié qu'il échoue sans le correctif et passe avec. C'est aussi le seul test de bout en bout qui fait tourner `install.mjs` sur un vrai CLAUDE.md, ce qui manquait jusqu'ici.

Le risque est faible : le correctif ne change que le cas d'un bloc placé en tête de fichier. Les 101 tests du dépôt passent.

Si tu préfères un historique propre, fais-en un commit séparé du plugin `presets`, par exemple `fix(journal): no leading blank line when the journal block opens CLAUDE.md`. Pense alors à passer le journal en 1.3.9 dans [plugin.json](plugins/journal/.claude-plugin/plugin.json) et [marketplace.json](.claude-plugin/marketplace.json).

<!-- journal:reply -->

--------------------------------------------

> ajoute un preset pour optimiser le respect totale de la conversion d'un package .unitypackage vers typescript, three.js, webgpu, tsl. En respectant la fidélité des assets et shader provenant de unity mais en compressant les models et textures via ktx. Et les shaders via TSL webgpu. Tu peux regarder dans C:\www\appy\game_platformer_extended\docs les conversions qu'on a déjà fait

<!-- journal:turn -->

**Claude** · 12:29 · _fichiers : plugins/presets/skills/ap-preset/presets/unity-port/rules.md, plugins/presets/skills/ap-preset/presets/unity-port/preset.json, plugins/presets/skills/ap-preset/scripts/preset.test.mjs_

Le preset de portage est prêt sous le nom `unity-port` (pour un portage : `/ap-preset apply base 3d unity-port`). J'ai évité `unity`, que je garde pour les vrais projets Unity. Les 102 tests passent, rien n'est commité, et aucun projet n'a été modifié.

Ses 8 règles viennent des docs de game_platformer_extended (pipeline, format des fiches, rangement de la bibliothèque) et de PP-13 dans game_platformer. Elles sont dans [presets/unity-port/rules.md](plugins/presets/skills/ap-preset/presets/unity-port/rules.md) :

1. **Sources** : le paquet Unity fait foi. On l'extrait avec ses `.meta` et la table `guid-map.json`, et on suit toutes les références par GUID, jamais par nom de fichier. Le dossier extrait n'est jamais modifié, aucun fichier Unity n'entre dans la bibliothèque convertie, les packs achetés restent privés, et l'identifiant d'un asset dérive de son GUID.
2. **Réglages d'import** des `.meta` : échelle, remplacements de matériaux, boucle des clips. On passe du repère main gauche d'Unity au repère main droite de glTF, et une taille se vérifie par une mesure.
3. **Matériaux** reconstruits depuis les `.mat`, avec rugosité = 1 − smoothness et les bons espaces de couleur (sRGB ou linéaire). Le shader d'origine est gardé dans les `extras` du glTF. Une texture introuvable fait échouer l'asset, sans repli silencieux.
4. **Shaders en TSL, formule pour formule** : chaque Shader Graph ou HLSL reprend ses propres nœuds et constantes, avec des paramètres lus dans le `.mat`, jamais réglés à l'œil. Même exigence pour le post-traitement URP et les textures intégrées à Unity. Les particules et VFX sont refaits en TSL avec leurs valeurs, et tout écart volontaire est écrit à côté du code.
5. **Compression** :
   - un GLB sans perte (la référence) et un GLB compressé Draco côte à côte ;
   - textures en KTX2 avec repli PNG : ETC1S pour les couleurs, UASTC + Zstandard pour les normal maps, les atlas en dégradés et ce qui doit rester fidèle ;
   - une texture partagée n'existe qu'une fois, et on ne recompresse jamais un fichier déjà compressé.
6. **Conversion reproductible** : Chromium sans écran puis glTF-Transform. Relancer sur une source inchangée ne change rien, au bit près, et la conversion s'arrête au premier échec.
7. **Gameplay C# → TypeScript** avec les valeurs **sérialisées** de la scène, pas les valeurs par défaut du C#. Les événements câblés dans l'éditeur sont repris, et les scènes passent par un convertisseur. Attention : la physique Unity tourne par défaut à 50 Hz, et c'est ce qui expliquait l'écart de saut mesuré dans PP-13.
8. **Fidélité prouvée** :
   - chaque fichier compressé est rechargé comme dans le jeu, et une miniature vide fait échouer l'import ;
   - comparaisons pixel à pixel avec un seuil chiffré ;
   - les tests sans écran passent en WebGL2, car le WebGPU sans écran de Chromium ne dessine rien ;
   - un audit de fidélité par composant, et les poids mesurés dans le rapport du pack.

Aucun de tes CLAUDE.md ne contient encore ces règles : sur game_platformer_extended, le preset ajouterait les 8. C'est voulu, puisqu'elles ne vivaient que dans les docs.

Deux points à relire :
- **Draco ou meshopt** pour les modèles animés : j'ai écrit « meshopt à mesurer », comme dans ta question ouverte de l'étape AD-3.
- **Licences** : la règle dit « privé, licence notée par pack ». Le niveau de protection par licence reste dans tes docs.

<!-- journal:reply -->

--------------------------------------------

> dans le readme ajoute une consigne pour mettre à jour le plugin presets

<!-- journal:turn -->

**Claude** · 12:52 · _fichiers : README.md_

J'ai ajouté au README, dans la section `presets` juste après l'installation, une consigne de mise à jour en deux étapes. Je n'ai pas lancé ces commandes ici.

1. **Mettre à jour le plugin**, une seule fois, puis ouvrir une nouvelle session :
   ```
   claude plugin marketplace update ai-dev-skills
   claude plugin update presets@ai-dev-skills
   ```
2. **Rafraîchir chaque projet** : `/ap-preset status` liste les blocs dépassés, puis `/ap-preset apply <nom>…` les réécrit en place. Les règles écrites à la main restent laissées de côté. Ensuite, commiter `CLAUDE.md`, et `.claude/settings.json` s'il a changé.

Le README dit pourquoi l'étape 2 est nécessaire : les blocs sont écrits dans le CLAUDE.md de chaque projet, donc mettre à jour le plugin ne les change pas.

J'ai aussi ajouté une note pour toi quand tu publies un preset modifié : augmenter `version` dans [plugin.json](plugins/presets/.claude-plugin/plugin.json) et dans [marketplace.json](.claude-plugin/marketplace.json). Sans nouvelle version, `claude plugin update` garde l'ancienne.

<!-- journal:reply -->
