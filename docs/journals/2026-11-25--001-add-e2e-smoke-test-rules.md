# Add e2e smoke-test rules to base preset

<!-- journal:session 4f4bbc96-6f41-482a-9a04-c6b6310c036f -->
<!-- journal:auto-title -->

- Plan : —
- Sessions : `4f4bbc96` 2026-11-25 (windows)

## Session 2026-11-25 · 4f4bbc96 (windows)

> met à jour le preset de base en regardant le cas du smoke sur C:\www\appy\game_quest

<!-- journal:turn -->

**Claude** · 14:46 · _fichiers : plugins/presets/skills/ap-preset/presets/base/preset.json, plugins/presets/skills/ap-preset/scripts/preset.test.mjs_

J'ai ajouté une règle `e2e` au preset `base`, tirée du smoke de game_quest. Les tests du preset passent (14/14). J'ai aussi fait un `apply base --dry-run` sur game_quest : la nouvelle règle est reconnue comme déjà écrite à la main et laissée de côté, comme prévu.

**La règle ajoutée** dans [rules.md](plugins/presets/skills/ap-preset/presets/base/rules.md), formulée sans rien de propre au jeu :
- **Tests longs (smoke, e2e, navigateur) : ciblés d'abord, complets rarement.**
  - Pour un changement local, ne jouer que la partie touchée, via des variables d'environnement (par exemple `SMOKE_ONLY` / `SMOKE_PAGES`), et noter les durées mesurées dans `CLAUDE.md`.
  - La suite complète seulement quand on touche le code partagé (coque, mise en page, moteur, plusieurs écrans), et une fois avant une sortie.
  - Un bouton ou un calque CSS se vérifie sur la plus grande et la plus petite taille d'écran.
  - Un navigateur headless prouve le câblage, jamais la vitesse.
- **Claude Code web : commiter et pousser avant un test long**, dès que les tests unitaires sont verts. Un défaut trouvé ensuite se corrige par un commit de plus : jamais d'amend, jamais de force-push. En local, la règle « pas de commit » reste valable.

**Autres fichiers modifiés :**
- [preset.json](plugins/presets/skills/ap-preset/presets/base/preset.json) : la regex qui repère si la règle est déjà dans le `CLAUDE.md` d'un projet (`avant un smoke long`, `ciblé d'abord, complet rarement`, et les équivalents en anglais), plus la description.
- [preset.test.mjs](plugins/presets/skills/ap-preset/scripts/preset.test.mjs) : la liste des règles attendues passe à 5, et deux cas reprennent mot pour mot les lignes de game_quest.
- Descriptions mises à jour dans `SKILL.md`, `plugin.json` et `marketplace.json`, et version passée de 0.1.0 à **0.2.0**.

Rien n'est commité. Pour mettre à jour un projet qui a déjà le preset : `/ap-preset apply base`.

<!-- journal:reply -->
