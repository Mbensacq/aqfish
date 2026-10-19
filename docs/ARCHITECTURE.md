# Architecture

Ce document décrit la structure du front, les règles qui la protègent et les contrats sur
lesquels reposent les tests. Il est tenu à jour par l'équipe : toute évolution structurelle
passe par une ADR (`docs/adr/`) puis par une mise à jour de ce fichier.

## Couches

```
frontend/src/app/
├── core/     utilitaires purs partagés (contrat de capture, maths, PRNG…)
├── sim/      simulation déterministe : monde, espèces, comportements, eau
├── render/   rendu Three.js : scène, caméra, pipeline pixel art, maillages
└── ui/       composants Angular : hôte du canvas, panneaux, éditeur
```

Le backend NestJS (phase 2) vivra dans `backend/`, à côté de `frontend/`.

Sens des dépendances autorisé : `ui → render → sim → core` (et `ui → sim`, `render → core`).

| Couche | Peut importer | Interdit (vérifié par ESLint) |
|---|---|---|
| `core` | rien d'autre que `core` | Angular, Three.js, `render`, `ui`, horloge réelle et hasard sans graine |
| `sim` | `core` | Angular, Three.js, `render`, `ui`, `Math.random`, `Date.now`, `performance.now`, `new Date` |
| `render` | `sim`, `core`, Three.js | Angular, `ui` |
| `ui` | tout | — |

Ces frontières sont imposées par `frontend/eslint.config.js` : une violation fait échouer
`npm run lint` et donc la CI. Les fichiers `*.spec.ts` de `sim/` sont exemptés des règles de
déterminisme (pas des règles d'import).

## Simulation déterministe (`sim/`)

Objectif : **mêmes entrées ⇒ même état**, à la décimale près. C'est ce qui rend la
simulation testable et les captures reproductibles.

- **Hasard** : générateur mulberry32 à graine 32 bits (`core/random/prng.ts`,
  `createPrng(graine)`) ; jamais de `Math.random`. Pour qu'ajouter une entité ne décale pas
  le hasard des autres, chaque entité dérive son propre sous-générateur de la graine du
  monde et de son identifiant : `createEntityPrng(world.seed, id)` (graine dérivée par
  hachage murmur3 32 bits, `deriveSeed`). Graines et identifiants : entiers dans
  [0, 2^32), sinon `RangeError`.
- **Temps** : pas fixe `SIM_DT = 1 / 60` s (`sim/constants.ts`). La boucle d'affichage
  (`ui/aquarium-host`) accumule le temps réel écoulé et appelle la fonction pure
  `fixedStep({ accumulator, realDt })` (`sim/fixed-step.ts`), qui renvoie le nombre de pas
  à exécuter, le reste à reporter et le facteur d'interpolation `alpha` ∈ [0, 1). Au-delà
  de `MAX_STEPS_PER_FRAME` pas par image, le retard est abandonné (pas de spirale de
  rattrapage).
- **Monde** : `sim/world.ts`. `createWorld(seed, population?)` (vide par défaut), `createDefaultWorld(seed)` (monde de l’application), `step(world, SIM_DT)` (pure : renvoie un
  nouvel état, ne modifie jamais son entrée), `advance(world, n)` (une seule copie puis
  aucune allocation par pas), `advanceTo(world, time)` (`round(time / SIM_DT)` pas au total,
  utilisé par le mode capture avant le premier rendu), et `advanceInPlace(world, n)`
  (modifie le monde, aucune allocation), **réservé à la boucle d'affichage** qui possède
  seule son monde ; tout le reste du code et les tests utilisent les fonctions pures.
- **Temps simulé** : `world.time` est recalculé à chaque pas comme `tick * SIM_DT` (jamais
  cumulé, donc sans dérive flottante : exactement 3600 après 216 000 pas). Un pas libre
  `step(world, dt)` avec `dt ≠ SIM_DT` (tests) cumule `dt`.
- **Boucle d'affichage sans allocation** : hors capture, chaque image appelle
  `fixedStepInto` (résultat réécrit dans un objet réutilisé) puis `advanceInPlace`, avec un
  rappel `requestAnimationFrame` créé une seule fois. Validation du pas : `assertTimeStep`
  (`sim/time-step.ts`), unique.
- **État sérialisable** : l'état du monde (`seed`, `tick`, `time`, `entities`, `obstacles`) est un objet
  de données simple (JSON), sans classe Three.js ni référence circulaire. Il sert à la
  sauvegarde, aux tests et aux captures.
- **Entités** : les poissons (`sim/swimmer.ts`) gardent l'état de leur sous-générateur sous
  forme d'un entier (`rng`, avancé par `prngNextState` / `prngOutput`, même suite que
  `createPrng`), et leur état au pas précédent (`px`, `pyaw`…) pour l'interpolation du rendu.
  Ils sont mis à jour en place, par identifiant croissant, sans allocation par pas.
- **Banc** (ADR 0011, `sim/flocking.ts`) : chaque pas a deux phases. D'abord le pilotage de
  banc (séparation, alignement, cohésion, paramètres `schooling` de l'espèce) de tous les
  poissons, calculé sur les positions du début du pas dans un tampon réutilisé ; puis chaque
  poisson nage (`stepFish`, pilotage passé en trois nombres) ; enfin l'espacement minimal
  entre congénères est imposé (`enforceMinDistance`). Les poissons d'un banc s'influencent :
  en ajouter change la trajectoire des autres (le hasard, lui, reste indépendant).
- **Évitement** (ADR 0012, `sim/avoidance.ts`, `sim/obstacles.ts`) : les obstacles du monde
  (`world.obstacles`, sphères pour l'instant) sont des données, décrites par une distance
  signée et une normale. Dans `stepFish`, parois (au point visé) et obstacles (le long du
  segment position → point visé) donnent une force proportionnelle à la proximité ; elle est
  déviée pour contourner (`deflect`, continue en cap), et son intensité dose le virage aux
  dépens de l'errance et du banc. Filets de sécurité : projection hors d'un obstacle, puis
  dans les bornes `hard`.
- **Unités et repère** : mètres, secondes, degrés Celsius. Axe Y vers le haut ; origine au
  centre du fond du bac.
- **Données réelles** : toute valeur présentée comme réelle (température d'une espèce,
  taille adulte, compatibilité) est sourcée en commentaire ou explicitement marquée comme
  approximation de jeu. Ne jamais inventer un fait biologique.

## Rendu pixel art 3D (`render/`)

Principe : une vraie scène 3D, rendue de façon à rester du pixel art quel que soit l'angle.

1. **Basse résolution** : la scène est rendue dans un `WebGLRenderTarget` dont la taille est
   celle du canvas divisée par `PIXEL_SIZE` (3 ou 4 pixels écran par pixel de scène), sans
   anticrénelage, puis affichée plein écran avec un filtrage `NearestFilter`. Un pixel de
   scène garde ainsi une taille constante à l'écran.
2. **Palette limitée** : une passe de post-traitement ramène les couleurs à la palette
   définie dans un module unique (voir `docs/DA.md`), avec tramage ordonné optionnel pour les
   dégradés.
3. **Contours** : contours sombres d'un pixel sur les silhouettes (animaux, décor). Pas de
   contour sur l'eau. Mise en œuvre actuelle (décor seulement, ADR 0015) : coque de faces
   arrière gonflée d'un pixel de la cible à l'écran ; les poissons n'en ont pas encore.
4. **Stabilité** : quand la caméra bouge, éviter le scintillement des pixels (par exemple en
   alignant la caméra sur la grille de pixels dans l'espace de vue).
5. **Modèles** : voxels ou low-poly **générés par le code** à partir des définitions
   d'espèces (forme, motifs, couleurs). Aucun fichier 3D externe tant qu'une ADR ne
   l'autorise. Les grandes populations utilisent `InstancedMesh`.
6. **Textures** : `NearestFilter`, sans mipmaps.

Mise en œuvre des points 1 et 2 (ADR 0007) : `AquariumView.renderFrame()` rend la scène dans
la cible de `PalettePass` (taille `ceil(canvas / PIXEL_SIZE)`, `PIXEL_SIZE = 3` pixels CSS),
puis un quad plein écran lit chaque pixel de scène par `texelFetch` et écrit la couleur de
palette la plus proche (distance euclidienne en sRGB, première couleur en cas d'égalité).
La cible est en sRGB 8 bits : les surfaces translucides s'y mélangent en espace linéaire.

**Filtre désactivable** (ADR 0010) : avec le filtre `aucun`, `renderFrame()` rend la scène
directement à l'écran en pleine résolution, sans passe palette, et la caméra prend le
rapport d'aspect du canvas. `AquariumView.setFilter()` bascule à chaud sans toucher à la
caméra ni à la scène. Le pixel art reste le mode par défaut.

### Caméra

- `OrbitControls` (`three/examples/jsm/controls/OrbitControls.js`) : rotation au clic gauche,
  zoom à la molette, déplacement au clic droit, gestes tactiles.
- Déplacement au clic droit borné (bug #10) : la cible reste dans une sphère centrée sur le
  bac (`controls.cursor`, `maxTargetRadius`), de rayon `panTargetRadius`
  (`render/camera-presets.ts`), choisi pour que le centre du bac reste dans le champ vertical
  même à la distance d'orbite minimale.
- Préréglages : `top`, `bottom`, `front`, `side`, `three-quarter` (mêmes noms que le contrat
  de capture), accessibles au clavier depuis l'interface.
- La vue `bottom` est une contre-plongée légèrement avant sous un substrat opaque
  (ADR 0006).
- Les préréglages sont calculés par une fonction pure, `cameraPresetPose`
  (`render/camera-presets.ts`) : cible au centre du bac, distance telle que la sphère
  englobant le bac tienne dans le cadre pour le rapport d'aspect courant. Tant que
  l'utilisateur n'a pas bougé la caméra, le cadrage est recalculé au redimensionnement.
- Barre des préréglages (`ui/view-presets-bar/`) et touches `1` à `5` (ignorées dans un
  champ de saisie ou avec Ctrl, Alt, Meta) : l'hôte appelle `AquariumView.animateToPreset`.
  La transition (`CAMERA_TRANSITION_SECONDS`, 0,5 s) est calculée par la fonction pure
  `interpolatePose` (lissage `smoothstep`, coordonnées sphériques autour de la cible) et
  avancée par la boucle de rendu (`stepCameraTransition`), jamais par une minuterie. Une
  interaction à la souris l'annule. En mode capture, placement instantané et aucune barre.
- Bouton actif de la barre (bug #23) : l'hôte expose le signal `activePreset` (préréglage
  suivi ou rejoint, `null` dès le début d'un geste, événement `start` des contrôles via
  `AquariumView.onUserInteraction`) ; la barre le reçoit en entrée et ne mémorise rien.
- La position de la caméra est exposée aux tests de bout en bout par l'attribut
  `data-aqfish-camera="x,y,z"` de `app-aquarium-host`, sa cible par `data-aqfish-target`
  (mis à jour au mouvement, pas à chaque image). L'état de la simulation l'est par
  `data-aqfish-tick` (mis à jour quand le compteur change) et `data-aqfish-seed` (fixé au
  démarrage), présents aussi en build de production : les e2e de simulation n'utilisent plus
  `window.ng`.

### Organisation actuelle

| Fichier | Rôle |
|---|---|
| `core/render-filter/render-filter.ts` | Filtre de rendu `pixel` / `aucun` : décodage, bascule, filtre initial, mémorisation tolérante (`aqfish.filtre`) |
| `core/random/prng.ts` | PRNG mulberry32 à graine, dérivation de sous-générateurs par entité |
| `sim/constants.ts` | `SIM_DT`, `MAX_STEPS_PER_FRAME` |
| `sim/fixed-step.ts` | Accumulateur de la boucle à pas fixe (`fixedStep`, pure ; `fixedStepInto`, sans allocation) |
| `sim/time-step.ts` | `assertTimeStep` : validation unique d'un pas de temps |
| `sim/world.ts` | État du monde sérialisable (dont `decor`), `step`, `advance`, `advanceTo`, `advanceInPlace` (boucle d'affichage), `createDefaultWorld` (population et décor par défaut) |
| `sim/tank.ts` | Dimensions du bac, volume d'eau, `shrinkBox` (partagés par la simulation et le rendu) |
| `sim/species.ts` | Définitions déclaratives des espèces (`NEON`, `GUPPY`, `CORYDORA`), apparences (`speciesVariants`, `speciesVariantIndex`, ADR 0013), préférence de profondeur (`depth`, ADR 0014), `validateSpecies` |
| `sim/swimmer.ts` | Poisson (état sérialisable, sous-générateur en état explicite), nage : errance, banc, évitement, bornes, préférence de profondeur et remontées (ADR 0014) |
| `sim/flocking.ts` | Banc : séparation, alignement, cohésion, pilotage en deux phases, espacement minimal (ADR 0011) |
| `sim/trajectory.ts` | Relevé de trajectoires sur une copie du monde, distance aux vitres et statistiques (mesure et tracé, issue #43) |
| `sim/obstacles.ts` | Obstacles du bac (données : sphère, union de sphères), distance signée et normale (ADR 0012, 0015) |
| `sim/decor.ts` | Décor en données JSON (`DecorItem` : rochers et plantes, validation, `parseDecor`), rochers voxel générés depuis leur graine (`rockModel`), collision en union de sphères (`decorObstacles`), `DEFAULT_DECOR` (ADR 0015, 0016) |
| `sim/plant.ts` | Plantes voxel générées depuis leur graine, deux formes (`tall`, `tuft`), phase d'ondulation, collision des tiges élargie de la borne d'ondulation (`plantCollision`, ADR 0016) |
| `sim/plant-sway.ts` | Ondulation des plantes (fonction pure du temps simulé, de la hauteur relative et de la phase, bornée par `amplitude · h²`, ADR 0016) |
| `sim/undulation.ts` | Ondulation (fonctions pures) : avance de la phase, amplitude selon la vitesse, pose du corps et de la queue (ADR 0009) |
| `sim/avoidance.ts` | Forces d'évitement des parois et des obstacles, proximité, déviation pour contourner (ADR 0012) |
| `render/palette.ts` | Palette unique (32 à 48 couleurs), nommées par usage |
| `render/pixel-art.ts` | `PIXEL_SIZE`, taille de la cible basse résolution, couleur la plus proche (fonctions pures, même métrique que le shader) |
| `render/palette-pass.ts` | Cible basse résolution et passe plein écran palette (`ShaderMaterial`) ; libération |
| `render/camera-presets.ts` | Dimensions du bac, préréglages de caméra, interpolation des transitions (fonctions pures) |
| `render/aquarium-scene.ts` | Scène statique : sable, eau, verre, arêtes, lumières ; libération |
| `render/fish-model.ts` | Modèles voxel des poissons générés depuis un gabarit de profil par silhouette (`SILHOUETTES`, ADR 0009 et 0013) |
| `render/fish-layer.ts` | `InstancedMesh` corps et queue par espèce, interpolation entre deux pas, ondulation ; `AquariumView` en crée une par apparence de chaque entrée de `SPECIES` (ADR 0013) |
| `render/rock-model.ts` | Maillage voxel générique (`buildVoxelMesh`) et maillage d'un rocher (couleurs plates de la palette), normales lissées de sa coque de contour (ADR 0015) |
| `render/plant-model.ts` | Maillage voxel d'une plante (couleurs de végétation), hauteur et phase par sommet, `applyPlantSway` (positions réécrites en place, ADR 0016) |
| `render/decor-layer.ts` | Couche du décor : maillages et coques de contour d'un pixel (décalage en pixels de la cible), placés selon `World.decor` ; `update(time)` fait onduler les plantes (ADR 0015, 0016) |
| `render/aquarium-view.ts` | Vue sans Angular : renderer (fabrique remplaçable), caméra, `OrbitControls`, transitions de caméra, `updateFish`, `setDecor`, `updateDecor` (temps simulé interpolé) |
| `ui/aquarium-host/` | Composant hôte : boucle rAF, avance de la simulation, redimensionnement, contrat de capture, `DestroyRef` |
| `ui/view-presets-bar/` | Barre flottante des 5 préréglages de vue et raccourcis clavier `1` à `5` (émet le préréglage choisi), bascule « Pixel art » et touche `P` (émet la demande de bascule) |

Le renderer est créé par une fabrique (`AQUARIUM_RENDERER_FACTORY`, par défaut
`createWebGLRenderer`) : les tests `TestBed` la remplacent par un double, jsdom n'ayant pas
WebGL.

## Contrat de capture

Le harnais `frontend/e2e/captures.spec.ts` photographie l'application sous 5 angles, chaque
nuit, pour suivre l'évolution visuelle. Il repose sur ce contrat, que toute évolution doit
respecter :

| Élément | Règle |
|---|---|
| Paramètres d'URL | `capture`, `seed`, `camera`, `time`, et `filtre` facultatif, lus par `core/capture/capture-params.ts` |
| `filtre=pixel\|aucun` | Force le filtre de rendu (ADR 0010), y compris hors capture où il prime sur le choix mémorisé. Absent en capture : pixel art, quel que soit le choix mémorisé (séries existantes inchangées) |
| `capture=1` | Simulation avancée de façon déterministe jusqu'à `time` (pas fixe, sans temps réel), puis figée ; interface masquée ; caméra sur le préréglage `camera` ; `devicePixelRatio` forcé à 1 |
| Signal « prêt » | Appeler `markCaptureReady()` (`core/capture/capture-ready.ts`) une fois la première image **complète** rendue ; `resetCaptureReady()` si la scène est rechargée. Implémentation : `AquariumHost` lève le signal à l'image qui suit le premier rendu WebGL de taille non nulle, et le retire à sa destruction |
| Image figée | En mode capture, une seule image est rendue (puis une à chaque redimensionnement) et les contrôles à la souris sont désactivés |
| Attributs de test | `app-aquarium-host` expose `data-aqfish-camera`, `data-aqfish-target`, `data-aqfish-tick`, `data-aqfish-seed` et `data-aqfish-filter` |
| Hors capture | Le signal « prêt » est aussi émis après la première image complète (le test de démarrage l'attend) |
| Erreurs | Aucune erreur de page ne doit survenir (le harnais et le test de démarrage échouent sinon) |
| Tracé de trajectoires | En plus des angles, `trajectoires-top.png` : trajectoires vues de dessus sur `CAPTURE_TRACE_TIME` s simulées (60 par défaut, même graine), calculées avec la simulation pure (`sim/trajectory.ts`) et dessinées en SVG hors de l'application (issue #43). Preuve d'un comportement de nage qu'une image figée ne montre pas |

Dans l'environnement des agents et en CI, WebGL tourne **en rendu logiciel** (SwiftShader) :
c'est lent mais fonctionnel. Les scènes de capture doivent rester raisonnables (délai
maximal : 60 s par angle), et **aucune mesure de performance** ne doit y être faite.

## Interface (`ui/`)

- Angular 21, composants standalone, sans zone.js, signaux, `ChangeDetectionStrategy.OnPush`.
- La boucle `requestAnimationFrame` vit dans un service ou le composant hôte du canvas et ne
  met **pas** à jour de signaux à chaque image : les statistiques affichées (nombre de
  poissons, FPS…) sont rafraîchies au plus 4 fois par seconde.
- Les ressources Three.js (géométries, matériaux, cibles de rendu, contrôles) sont libérées
  à la destruction du composant (`DestroyRef`).
- Textes d'interface en français. Chaque contrôle a un libellé accessible et une alternative
  au clavier.

## Tests

| Niveau | Outil | Portée |
|---|---|---|
| Unitaire | Vitest (`ng test`, jsdom) | `core`, `sim`, fonctions pures de `render` (calculs de palette, positions de préréglages…) |
| Composant | Vitest + `TestBed` | Composants `ui` (sans WebGL : jsdom n'en a pas) |
| Bout en bout | Playwright (`npm run e2e`) | Parcours utilisateur : rotation à la souris, préréglages, nourrissage… |
| Visuel | Playwright (`npm run captures`) | 5 angles fixes, relus chaque nuit par la QA |
| Mutation | StrykerJS (`npm run test:mutation`, à la demande, hors CI) | `src/app/sim` : détecter les tests qui ne testent rien (score suivi dans `equipe/mutation/`) |

Le code qui exige WebGL n'est pas testable en unitaire (jsdom) : il est couvert par le bout
en bout et les captures. Cible de couverture : **≥ 80 % des lignes de `src/app/sim`**.

## Budgets

- Bundle initial : avertissement à 500 kB, erreur à 1 MB (`angular.json`).
- Objectif de fluidité : 60 images/s avec 200 poissons sur un portable de milieu de gamme,
  **mesuré par Mathis sur sa machine**, jamais dans l'environnement des agents.

## Backend

**NestJS**, introduit en phase 2 (voir `docs/adr/0004-backend-nestjs.md`). Pas de dossier
`backend/` en phase 1. Hébergement choisi au point d'étape de la fin de la semaine 4.
