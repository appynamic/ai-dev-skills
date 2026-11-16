## Portage Unity → three.js (preset `unity-port`)

MUST FOLLOW. Convertir un `.unitypackage` en TypeScript + three.js WebGPU + TSL **sans perdre la fidélité** : même géométrie, mêmes matériaux, mêmes shaders, mêmes valeurs de gameplay. Seul le poids change, par la compression. S'ajoute aux presets `base` et `3d`.

<!-- rule:sources -->
- **Le paquet Unity est la source de vérité.** On l'extrait avec ses `.meta` et une table `guid-map.json` (GUID → chemin), puis on suit toutes les références par GUID (prefab → FBX par `m_Mesh`, → matériaux par `m_Materials`, → textures), jamais par nom de fichier. Le dossier extrait n'est jamais modifié, et aucun fichier Unity (`.meta`, `.prefab`, `.mat`, `.unity`, `.shadergraph`) n'entre dans la bibliothèque convertie. Les packs achetés restent privés : jamais dans un dépôt public ni sur une URL publique sans contrôle, et la licence est notée par pack. L'identifiant stable d'un asset est dérivé de son GUID Unity, qui survit aux renommages.
<!-- rule:import-settings -->
- **Respecter les réglages d'import Unity** lus dans les `.meta` : échelle (`useFileScale`, `globalScale`), remplacements de matériaux, drapeaux de boucle des clips, compression des animations. Mètres et Y vers le haut. Passer du repère Unity (main gauche) à celui de glTF (main droite) : UV, rotations, et le demi-tour au placement dans les scènes, à vérifier sur un modèle asymétrique. Une taille se vérifie par une mesure (un personnage qui doit faire 1,86 m fait 1,86 m).
<!-- rule:materials -->
- **Matériaux reconstruits depuis les `.mat`**, Standard ou URP : couleur et texture de base, rugosité = 1 − smoothness, métal, émission, découpe alpha, double face, tiling et offset. Espaces de couleur exacts : couleur et émission en sRGB, normal maps et masques en linéaire. Le nom du shader d'origine et tous ses paramètres sont gardés dans les `extras` du glTF, pour que le moteur les relise. Une texture introuvable fait **échouer** l'asset : jamais de repli silencieux vers une couleur unie ou un fichier absent.
<!-- rule:shaders -->
- **Shaders portés en TSL, formule pour formule.** Chaque Shader Graph ou shader HLSL devient une fonction TSL qui reproduit **ses** nœuds et constantes (écrire la formule en commentaire, ex. `base × (1 − N·V)^3 × rim`), avec des paramètres lus dans le `.mat` ou les `extras`, jamais réglés à l'œil. Il en va de même pour le post-traitement (profil Volume URP : tone mapping, exposition, saturation, seuil du bloom en lumière linéaire), les textures intégrées à Unity (ex. `Default-Checker-Gray`) et les effets : un Particle System ou un VFX Graph n'est pas convertible automatiquement, on le refait en TSL (particules calculées sur le GPU) avec ses valeurs (durée de vie, vitesse, taille, dégradé de couleur). Tout écart volontaire est écrit à côté du code, avec sa raison.
<!-- rule:compression -->
- **Deux fichiers côte à côte** : `<slug>.glb` **sans perte** (la référence, d'où l'on repart toujours) et `<slug>-compressed.glb`, celui que charge le jeu (Draco edgebreaker, quantification position 14 / normale 10 / UV 12 bits ; meshopt à mesurer pour les modèles animés). **Textures en KTX2** (`KHR_texture_basisu`, déclarée utilisée mais pas obligatoire, avec le PNG en repli) :
  - **ETC1S** qualité 128 pour les couleurs (sRGB, mipmaps) ;
  - **UASTC + Zstandard** pour les normal maps, les atlas en dégradés (l'ETC1S y fait des bandes) et toute texture où la fidélité prime ;
  - dimensions ramenées à la puissance de 2 la plus proche, comme le fait Unity.

  Encodage en WebAssembly (`ktx2-encoder`), sans binaire externe. Une texture partagée n'existe qu'**une fois** par pack (chemin relatif depuis les GLB, cache par URL dans le moteur). Ne jamais recompresser un fichier déjà compressé (deux quantifications s'empilent) ; ré-encoder seulement si la source ou le mode change. Les sprites d'interface restent en PNG/WebP : KTX2 ne sert qu'aux textures 3D.
<!-- rule:pipeline -->
- **Chaîne de conversion reproductible** : Node et three.js dans Chromium sans écran (`FBXLoader` → `GLTFExporter`), puis glTF-Transform (`dedup`, `weld`, `join`, `prune`, `resample` pour les clips), piloté par un profil par pack. Relancer sur une source inchangée ne change **rien** : fichiers identiques au bit près, aucun diff git. Un import partiel ne réécrit que ses assets. Le script sort en erreur au premier échec et compte les échecs dans son rapport.
<!-- rule:gameplay -->
- **Comportements C# → TypeScript, avec les valeurs de la scène** : un composant porté lit les valeurs **sérialisées** de la scène ou du prefab (YAML), pas les valeurs par défaut du C#. Les événements câblés dans l'éditeur (`UnityEvent` : `onActivate` → `Mover.ApplyOffset`…) sont repris, ainsi que les colliders (forme, taille, déclencheurs) et les calques. Attention au pas physique : Unity tourne par défaut à 50 Hz (`fixedDeltaTime` 0,02 s), donc une trajectoire mesurée à 60 Hz diffère : comparer en le sachant. Une scène `.unity` devient un niveau par un convertisseur (positions et rotations au centimètre près), jamais par une reconstruction à la main.
<!-- rule:fidelity -->
- **Prouver la fidélité, pas la supposer** :
  - chaque `-compressed.glb` est rechargé exactement comme dans le jeu (`GLTFLoader` + Draco + KTX2) et rendu en miniature : une miniature vide fait échouer l'import ;
  - comparaisons pixel à pixel avec un seuil chiffré (écart moyen, pourcentage de pixels au-delà d'un écart) contre la référence sans perte et contre des captures de la démo Unity ;
  - les tests sans écran forcent WebGL2 : le WebGPU logiciel de Chromium headless ne dessine rien, et toutes les comparaisons y seraient trivialement égales ;
  - un audit de fidélité par composant (couvert, champs réglés jamais lus, événements câblés) sert de liste de contrôle, et chaque décision y est notée ;
  - poids mesurés (FBX → GLB source → compressé, PNG → KTX2) et reportés dans le rapport du pack.
