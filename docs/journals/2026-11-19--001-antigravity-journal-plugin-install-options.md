# Antigravity Journal Plugin Install Options

<!-- journal:session 2c288b21-2ef9-4a34-9a82-421ce685e360 -->
<!-- journal:auto-title -->

- Plan : —
- Sessions : `2c288b21` 2026-11-19 (windows)

## Session 2026-11-19 · 2c288b21 (windows)

> comment faire pour installer mon skill journal sur antigravity en version "web", on a définit une commande simple d'installation dans un projet  ?
> voir https://antigravity.google/blog/plugin-marketplace-in-antigravity

<!-- journal:turn -->

**Claude** · 15:03

🤟 Il y a une commande simple, mais elle vise le CLI. Rien n'indique qu'elle marche en "web".

**Ce que disent les docs** ([blog](https://antigravity.google/blog/plugin-marketplace-in-antigravity) et [docs/marketplace](https://antigravity.google/docs/marketplace)) :
- CLI : `agy plugin install https://github.com/<owner>/<repo>`. Ça clone et installe le plugin depuis GitHub.
- Local : `agy plugin install ./plugins/journal`.
- Gestion : `agy plugin list`, `enable`, `disable`, `uninstall`. Dans le CLI, `/plugin` ouvre le gestionnaire.
- App : panneau **Customizations**, onglet **Plugins**. Ce catalogue est officiel, et on y entre via un formulaire de soumission.
- Les docs ne disent rien d'une version web/cloud, ni d'un `marketplace.json` côté Antigravity.

**Points à vérifier avant de promettre une commande simple :**
1. La commande GitHub installe un plugin à la racine du repo. Le tien est dans `plugins/journal` (monorepo avec deux plugins). L'URL seule ne marchera probablement pas, sauf si Antigravity accepte un sous-dossier. À tester, par exemple `agy plugin install https://github.com/<owner>/ai-dev-skills/tree/main/plugins/journal`.
2. Si le sous-dossier n'est pas supporté, il faut un repo dédié `journal` avec `plugin.json` à la racine, ou un script d'install.
3. Le [README](README.md) dit « pas de marketplace GitHub côté Antigravity » et propose le clone avec `plugins.json`. C'est probablement périmé. Il mentionne `agy plugin install <clone>/plugins/journal` comme alternative « non testée ».
4. `agy plugin validate ./plugins/journal` permet de vérifier le manifest. Il faut sans doute enrichir [plugin.json](plugins/journal/plugin.json), qui n'a ni `version` ni les champs du schéma officiel. Ce schéma n'est pas documenté sur ces pages.

**Je peux faire, si tu veux :**
- tester `agy plugin validate` et `agy plugin install` en local, si `agy` est installé ici ;
- mettre à jour la section Antigravity du README avec la commande retenue ;
- ajouter une étape `/journal init` après l'install.

Par "web", tu veux dire l'app Antigravity, ou une version navigateur/cloud (comme Claude Code web) ? Si c'est le cloud, je n'ai trouvé aucune doc de plugins pour ça.

<!-- journal:reply -->

--------------------------------------------

> oui l'app antigravity qui permet de lancer des commandes dont "/plugin"

<!-- journal:turn -->

**Claude** · 15:06

🤟 Dans l'app Antigravity, tape dans le prompt :

```
/plugin install https://github.com/<owner>/ai-dev-skills
```

Puis `/plugin list` pour vérifier. `/plugin` seul ouvre le gestionnaire. Ça vient des docs : le CLI accepte les commandes `/plugin install|uninstall|enable|disable|list` et une URL GitHub. Je n'ai pas pu l'essayer, car `agy` n'est pas installé dans mon shell.

**Risque principal : le monorepo.** Cette commande installe sans doute un plugin à la racine du repo. Le tien est dans `plugins/journal`, et `plugin.json` n'est pas à la racine. Trois options :
1. Tester l'URL avec sous-dossier : `/plugin install https://github.com/<owner>/ai-dev-skills/tree/main/plugins/journal`.
2. Si ça échoue, publier `journal` dans son propre repo, avec `plugin.json`, `hooks.json` et `skills/` à la racine.
3. En dernier recours, garder le clone local avec `/plugin install <clone>/plugins/journal`.

**Après l'install, dans le projet :** `/journal init`. C'est la seule étape par projet, elle écrit la config et le git hook.

Tu peux tester l'option 1 dans l'app et me dire ce que ça donne ? Selon le résultat, je mets à jour la section Antigravity du [README](README.md) (elle dit encore « pas de marketplace GitHub ») et j'enrichis [plugin.json](plugins/journal/plugin.json) si `/plugin validate` s'en plaint.

<!-- journal:reply -->

--------------------------------------------

> quand j'ai fait /plugin install https://github.com/appynamic/ai-dev-skills.git dans antigravity app :
>
> <pasted_content id="2bbc">
> I cloned https://github.com/appynamic/ai-dev-skills.git into C:\Users\Nikko\.gemini\config\plugins\ai-dev-skills.
>
> However, this repository is structured as a Claude Code plugin collection (containing .claude-plugin/ and a plugins/ subdirectory) rather than an Antigravity plugin with a root plugin.json.
>
> Would you like me to inspect the contents of plugins/ and migrate or set up the skills for Antigravity?
> </pasted_content id="2bbc">

<!-- journal:turn -->

**Claude** · 15:13

🤟 Le clone a marché, mais ton repo n'est pas un plugin Antigravity à la racine. Il contient `plugins/journal` et `plugins/presets`, donc `/plugin install <url>` ne l'active pas.

**Ce que j'ai fait :** le clone est déjà dans `~/.gemini/config/plugins/ai-dev-skills`. J'ai créé `C:\Users\Nikko\.gemini\config\plugins.json`, qui pointe sur le dossier `plugins` de ce clone et n'inclut que `journal`. C'est la méthode du [README](README.md#L143). Redémarre l'app et vérifie que `journal` est listé et activé avec `/plugin list`. Je ne l'ai pas testé.

**Réponse à l'app :** dis-lui **non** pour la migration. Elle n'est pas nécessaire, le plugin est déjà au format Antigravity.

**Après l'install, dans chaque projet :** `/journal init`.

**Pour une vraie commande en une ligne**, il faut qu'un plugin soit à la racine d'un repo. Deux options :
1. Un repo dédié `appynamic/journal` avec `plugin.json`, `hooks.json` et `skills/` à la racine. L'install devient `/plugin install https://github.com/appynamic/journal`.
2. Garder le monorepo avec l'étape `plugins.json` en plus.

Si `journal` apparaît bien, je mets à jour le README. Il dit encore « pas de marketplace GitHub », alors que `/plugin install <url>` clone au moins le repo. Je peux aussi préparer l'option 1.

<!-- journal:reply -->

--------------------------------------------

> ok cela fonctionne, applique sur le repo le plugins.json à la racine pointant sur journal (presets est inutile pour antigravity)

<!-- journal:turn -->

**Claude** · 15:16 · _fichiers : plugins.json, README.md_

🤟 Fait, rien n'est commité.

- [plugins.json](plugins.json) à la racine du repo :
  ```json
  { "entries": [{ "path": "./plugins", "include_only": ["journal"] }] }
  ```
- [README.md](README.md#L131) : la section Antigravity commence maintenant par `/plugin install https://github.com/appynamic/ai-dev-skills.git`. Elle précise que seul `journal` est concerné.

**Deux points non vérifiés :**
- J'ai mis un chemin **relatif** (`./plugins`). Je ne sais pas si Antigravity le résout par rapport au fichier ou lit un `plugins.json` à la racine d'un clone. L'étape 2 du README (le `plugins.json` global avec chemin absolu) reste donc nécessaire pour l'instant. Si tu veux supprimer cette étape, teste en retirant ton `~/.gemini/config/plugins.json`, puis refais `/plugin install`.
- Les étapes 1 et 2 du README disent encore qu'il faut créer le `plugins.json` à la main. Je les simplifierai selon le résultat du test.

Je commite en `docs: antigravity install via /plugin install + root plugins.json` ?

<!-- journal:reply -->

--------------------------------------------

> <pasted_content id="2bbc">
> /plugin install https://github.com/appynamic/ai-dev-skills.git
>
> https://github.com/appynamic/ai-dev-skills.git is already cloned to C:\Users\Nikko\.gemini\config\plugins\ai-dev-skills.
>
> Because it is a Claude Code plugin collection (with a plugins/ subdirectory and no root plugin.json), Antigravity does not load the repository root as a plugin directly. Inside plugins/, it contains:
>
>
>
> journal (already installed as journal)
>
>
> presets
>
>
>
> Would you like me to set up presets as an Antigravity plugin in C:\Users\Nikko\.gemini\config\plugins\presets?
> </pasted_content id="2bbc">

<!-- journal:turn -->

**Claude** · 15:20

🤟 Réponds **non** à la proposition de `presets`. Elle est inutile pour Antigravity, et l'app ne saurait pas l'installer proprement.

Ce retour ne prouve rien sur le [plugins.json](plugins.json) racine. Il n'est ni commité ni poussé, donc le clone dans `~/.gemini/config/plugins/ai-dev-skills` ne l'a pas. Le message « journal (already installed as journal) » vient de ton `~/.gemini/config/plugins.json` global.

L'app a aussi confirmé qu'elle ne charge pas la racine du repo comme un plugin. Le `plugins.json` racine ne sert que si Antigravity le lit dans un clone, et rien ne l'indique pour l'instant.

**Pour trancher :**
1. Je commite et pousse (`docs: antigravity install via /plugin install + root plugins.json`).
2. Tu retires `~/.gemini/config/plugins.json`.
3. Tu fais `cd` dans le clone (`git pull`), puis `/plugin install ...` à nouveau et `/plugin list`.

Si `journal` apparaît, le fichier racine marche et je simplifie le README. Sinon, je supprime `plugins.json` du repo, et la seule voie reste le `plugins.json` global ou un repo dédié `journal`.

Je commite et pousse ?

<!-- journal:reply -->

--------------------------------------------

> si j'avais commité le plugins.json

<!-- journal:turn -->

**Claude** · 15:21

🤟 C'est déjà fait : `35671f1` est commité et poussé (le `HEAD` distant est identique).

Le clone dans `~/.gemini/config/plugins/ai-dev-skills` date d'avant ce push. Au dernier `/plugin install`, l'app a dit « already cloned » et n'a rien mis à jour, donc elle n'a pas vu le fichier. Pour tester maintenant :

```
git -C C:\Users\Nikko\.gemini\config\plugins\ai-dev-skills pull
```

Ensuite :
1. Renomme `~/.gemini/config/plugins.json` en `plugins.json.bak`, pour qu'il ne masque pas le test.
2. Redémarre l'app et lance `/plugin list`.

Si `journal` apparaît, le `plugins.json` racine suffit. Je simplifie alors le README : une seule commande `/plugin install`, sans étape 2. S'il n'apparaît pas, je supprime le fichier du repo et je garde le `plugins.json` global. Remets ton `.bak` en place dans ce cas.

<!-- journal:reply -->

--------------------------------------------

> ajoute la commande /plugin list dans le readme pour vérifier

<!-- journal:turn -->

**Claude** · 15:24 · _fichiers : README.md_

🤟 J'ai mis à jour la section Antigravity du [README](README.md#L131).

- **Étape 1 :** `/plugin install https://github.com/appynamic/ai-dev-skills.git`, puis `/plugin list` pour vérifier que `journal` est activé. J'ai aussi noté que `presets` peut apparaître (comme sur ta capture), que ça ne gêne pas, et que `/plugin disable presets` l'enlève.
- **Étape 2 :** devenue un repli, à utiliser seulement si `/plugin list` ne montre pas `journal`. Elle garde le `plugins.json` manuel.

Ta capture montre que `journal` et `presets` sont tous deux activés. Je ne sais donc pas si le `plugins.json` racine est lu : l'app a peut-être simplement détecté tout le dossier `plugins/`. Il reste inoffensif, mais je peux le supprimer si tu préfères. Pour le savoir, il aurait fallu vérifier que ton `plugins.json` global était bien désactivé pendant le test.

Rien n'est commité. Je commite en `docs: antigravity /plugin list check` ?

<!-- journal:reply -->

--------------------------------------------

> oui j'avais supprimé plugins.json dans C:\Users\Nikko\.gemini\config

<!-- journal:turn -->

**Claude** · 15:26

🤟 Confirmé : sans ton `plugins.json` global, `/plugin install <url>` suffit. `journal` est activé avec le skill `journal`.

`presets` est chargé aussi, alors que mon `plugins.json` racine ne demande que `journal` avec `include_only`. Donc :
- soit l'app ne lit pas ce fichier et découvre tout le dossier `plugins/` ;
- soit elle ignore `include_only`.

Dans les deux cas, il n'apporte rien de vérifié. Je propose de le supprimer du repo, et d'adapter le README en conséquence : la ligne « le `plugins.json` racine pointe sur journal » disparaît, le repli manuel reste.

Les modifs du [README](README.md#L131) ne sont pas commitées. Je supprime `plugins.json` et je commite en `docs: antigravity install via /plugin install, verify with /plugin list` ?

<!-- journal:reply -->

--------------------------------------------

> ok

<!-- journal:turn -->

### Synthèse · 2026-11-19 17:00

Résumé : installation du plugin journal dans l'app Antigravity testée : `/plugin install https://github.com/appynamic/ai-dev-skills.git` clone dans `~/.gemini/config/plugins/` et active `journal` et `presets` (vérifié avec `/plugin list`). README mis à jour (commande d'install, vérification, repli `plugins.json` manuel) ; `plugins.json` racine supprimé.
Décisions : plugins.json racine retiré (pas de preuve qu'il soit lu, `presets` chargé malgré `include_only`) ; repli manuel gardé dans le README.
Suites : tester l'IDE et le CLI Antigravity ; `presets` reste activé côté Antigravity (inoffensif, `/plugin disable presets`).

| Fichier | Changement |
| --- | --- |
| `README.md` | modified — section Antigravity : /plugin install + /plugin list, étape 2 devenue repli |
| `plugins.json` | deleted — fichier racine inutile |
| `docs/journals/2026-11-19--001-antigravity-journal-plugin-install-options.md` | modified — journal + synthèse |

**Claude** · 15:28 · _fichiers : README.md_

🤟 Commité en `8fe3297`, pas poussé.

- Le [README](README.md#L131) décrit `/plugin install <url>` puis `/plugin list`, avec le `plugins.json` manuel en repli.
- Le `plugins.json` racine est supprimé.
- Le commit porte le trailer `Journal:` et la synthèse a été ajoutée au journal.

Je pousse (`git push`) ? Le CLI et l'IDE Antigravity restent à tester.

<!-- journal:reply -->
