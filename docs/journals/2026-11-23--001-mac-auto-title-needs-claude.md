# Mac auto title needs claude in PATH

<!-- journal:session 0e1627fe-6cbc-48d4-bab4-b6dbecd03168 -->
<!-- journal:auto-title -->

- Plan : —
- Sessions : `0e1627fe` 2026-11-23 (windows)

## Session 2026-11-23 · 0e1627fe (windows)

> sur mac, si j'ai pas le claude accessible via le terminal, auto title ne fonctionne pas ? c'est le cas aujourd'hui

<!-- journal:turn -->

**Claude** · 09:25

Oui, c'est documenté : sans `claude` dans le `PATH`, l'auto title ne se déclenche pas.

**Cause.** Après la première réponse d'un brouillon, le plugin lance en arrière-plan `claude -p --model haiku` pour générer le titre. Cet appel est un processus détaché lancé par le hook. Il hérite du `PATH` du hook, pas de celui de votre shell interactif.

**Sur Mac, voici le cas typique :**
- L'app desktop ou l'extension VS Code embarque son propre binaire de `claude`. Aucun `claude` n'est alors installé dans le `PATH` système.
- Même avec un `claude` installé (`~/.local/bin`, nvm, Homebrew), les apps GUI lancées depuis le Dock n'héritent pas du `PATH` de `.zshrc`.

**Ce qui se passe.** L'échec va dans `journal-errors.log` (dans `.claude/`). Le brouillon reste en `brouillon-<id>`, et il n'y a qu'une seule tentative par session.

**Contournements :**
1. Installer le CLI et le rendre visible aux apps GUI : `npm i -g @anthropic-ai/claude-code`, ou le script d'install officiel. Si le binaire est dans `~/.local/bin`, lancez ensuite `launchctl setenv PATH "$PATH"` et relancez l'app.
2. Mettre un chemin absolu dans la config. `autoTitle` accepte une chaîne qui remplace la commande (prompt sur stdin, titre sur stdout). Exemple dans `journal.config.local.json`, qui est spécifique à la machine et ignoré par git : `"autoTitle": "/Users/<vous>/.local/bin/claude -p --model haiku"`.
3. Mettre `"autoTitle": false` et nommer à la main avec `/journal <titre>`. C'est aussi ce qui s'applique pour cette session.

Je n'ai pas vérifié le contenu de `journal-errors.log` sur votre Mac. Il confirmera la cause si vous le lisez. Je peux aussi ajouter un fallback dans le plugin, par exemple chercher dans les chemins usuels (`~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`) quand `claude` est introuvable. Voulez-vous que je le fasse ?

<!-- journal:reply -->
