## Règles 3D three.js (preset `3d`)

MUST FOLLOW. S'ajoute au preset `base` (et `nuxt` pour une coque Nuxt).

<!-- rule:webgpu -->
- **WebGPU d'abord, toujours** : `WebGPURenderer`, imports `three/webgpu` et `three/tsl` — **jamais `three`** ni `WebGLRenderer` (les `three/addons/...` restent permis). **WebGL2 n'est qu'un repli** : celui que `WebGPURenderer` prend tout seul quand WebGPU manque, ou `forceWebGL: true` quand l'adaptateur n'offre qu'un WebGPU en mode compatibilité (`requestAdapter({ featureLevel: 'compatibility' })` sans `core-features-and-limits` : Dawn sur OpenGL ES, écran noir sur Adreno). Ce choix est une fonction pure et testée, avec un délai maximal (une sonde qui ne répond pas → WebGPU). Toute fonctionnalité doit marcher sur les deux backends : un rendu se vérifie aussi en WebGL2.
<!-- rule:tsl -->
- **Shaders en TSL, jamais en GLSL** : tout matériau est un `*NodeMaterial` (`MeshStandardNodeMaterial`, `MeshToonNodeMaterial`…) ; ni `ShaderMaterial`, ni `RawShaderMaterial`, ni `onBeforeCompile`. ⚠️ Une couleur en TSL, c'est `color(new THREE.Color(…))`, jamais `vec3(new THREE.Color(…))` : une `Color` n'a pas de `.x/.y/.z`, et le nœud compile **en noir** sans erreur.
<!-- rule:rapier -->
- **Physique : Rapier** (`@dimforge/rapier3d-compat`, `await RAPIER.init()` une seule fois avant de créer le monde). Un seul `World` par partie, avancé à **pas fixe** (`world.timestep = 1/60`, accumulateur, quelques pas au plus par image), jamais avec le `dt` brut de l'image. Le code physique ne connaît pas three : on recopie position et rotation des corps sur les maillages après les pas. Collisions et requêtes par les API de Rapier (`castRay`, `intersectionsWithShape`, événements de contact), pas en refaisant des tests de boîtes à la main. Au démontage : `world.free()`.
<!-- rule:latest -->
- **Toujours les dernières versions stables** de three, Rapier et des autres libs 3D : vérifier avec `pnpm view <paquet> version` avant d'ajouter ou de mettre à jour, puis lire le guide de migration et le changelog de cette version (three change d'API à chaque révision `r1xx`). Version exacte épinglée, et `three` et `@types/three` toujours à la **même** version. Ne jamais copier un exemple écrit pour une ancienne révision sans le vérifier contre la version installée, et jamais d'API dépréciée.
<!-- rule:handle -->
- **Le moteur hors de la réactivité** : le handle du jeu, le renderer, la scène et les objets three ne vont **jamais** dans un `ref`, un `reactive` ou un store (un proxy profond sur un renderer WebGPU casse tout et coûte cher). Le handle reste au niveau du module ; l'UI ne voit que des valeurs plates et sérialisables. `createGame` est importé **dynamiquement** : l'accueil ne télécharge pas three.js.
<!-- rule:layers -->
- **Couches** : le moteur générique n'importe pas le jeu ; les règles et les données (`rules/`, `data/`, la logique de gameplay) sont **pures**, sans three ni DOM, et testées sous vitest ; un test de frontières vérifie les imports.
<!-- rule:lifecycle -->
- **Un seul jeu par document** ; le conteneur est tout le monde du jeu : aucune taille lue sur `window` (ni `vw`/`vh`), un `ResizeObserver` sur le conteneur, chaque écouteur global prend le `signal` de la partie. Démontage = `abort()` synchrone, puis `dispose()` des géométries, matériaux, textures et du renderer.
<!-- rule:frame -->
- **Boucle** : `renderer.setAnimationLoop(time)`, avec un `dt` tiré du timestamp de l'image et lissé, jamais d'un `performance.now()` lu dans la boucle. **Plafond à 60 i/s** (un écran 120 Hz qui ne tient pas 120 saccade), une résolution dynamique, un DPR plafonné et des paliers de qualité `low/mid/high` (ombres, post-process, densités) choisis par une heuristique que l'utilisateur peut forcer.
<!-- rule:perf -->
- **Performance mobile** : compter les appels de dessin et les triangles. Instancier ce qui se répète (`InstancedMesh`), fusionner la géométrie statique, indexer la géométrie instanciée. Chauffer toutes les pipelines avant de jouer (une image de chauffe qui dessine tout ce qui peut apparaître, ou `compileAsync`) ; un modèle chauffé est caché, jamais `dispose()` en cours de partie (three détruit la pipeline avec son dernier utilisateur). Pas de `castShadow` sur les personnages : une ombre ronde au sol et une carte d'ombre statique, redessinée seulement quand le décor change.
