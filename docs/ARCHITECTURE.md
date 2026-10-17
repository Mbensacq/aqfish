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
- **Monde** : `sim/world.ts`. `createWorld(seed)`, `step(world, SIM_DT)` (pure : renvoie un
  nouvel état, ne modifie jamais son entrée), `advance(world, n)` (une seule copie puis
  aucune allocation par pas), `advanceTo(world, time)` (`round(time / SIM_DT)` pas au total,
  utilisé par le mode capture avant le premier rendu).
- **État sérialisable** : l'état du monde (`seed`, `tick`, `time`, `entities`) est un objet
  de données simple (JSON), sans classe Three.js ni référence circulaire. Il sert à la
  sauvegarde, aux tests et aux captures.
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
3. **Contours** : contours sombres d'un pixel sur les silhouettes (animaux, décor), obtenus par
   détection de discontinuités de profondeur et de normales. Pas de contour sur l'eau.
4. **Stabilité** : quand la caméra bouge, éviter le scintillement des pixels (par exemple en
   alignant la caméra sur la grille de pixels dans l'espace de vue).
5. **Modèles** : voxels ou low-poly **générés par le code** à partir des définitions
   d'espèces (forme, motifs, couleurs). Aucun fichier 3D externe tant qu'une ADR ne
   l'autorise. Les grandes populations utilisent `InstancedMesh`.
6. **Textures** : `NearestFilter`, sans mipmaps.

### Caméra

- `OrbitControls` (`three/examples/jsm/controls/OrbitControls.js`) : rotation au clic gauche,
  zoom à la molette, déplacement au clic droit, gestes tactiles.
- Préréglages : `top`, `bottom`, `front`, `side`, `three-quarter` (mêmes noms que le contrat
  de capture), accessibles au clavier depuis l'interface.
- La vue `bottom` est une contre-plongée légèrement avant sous un substrat opaque
  (ADR 0006).
- Les préréglages sont calculés par une fonction pure, `cameraPresetPose`
  (`render/camera-presets.ts`) : cible au centre du bac, distance telle que la sphère
  englobant le bac tienne dans le cadre pour le rapport d'aspect courant. Tant que
  l'utilisateur n'a pas bougé la caméra, le cadrage est recalculé au redimensionnement.
- La position de la caméra est exposée aux tests de bout en bout par l'attribut
  `data-aqfish-camera="x,y,z"` de `app-aquarium-host` (mis à jour au mouvement, pas à
  chaque image).

### Organisation actuelle

| Fichier | Rôle |
|---|---|
| `core/random/prng.ts` | PRNG mulberry32 à graine, dérivation de sous-générateurs par entité |
| `sim/constants.ts` | `SIM_DT`, `MAX_STEPS_PER_FRAME` |
| `sim/fixed-step.ts` | Accumulateur de la boucle à pas fixe (fonction pure) |
| `sim/world.ts` | État du monde sérialisable, `step`, `advance`, `advanceTo` |
| `render/palette.ts` | Palette unique, couleurs nommées par usage |
| `render/camera-presets.ts` | Dimensions du bac, préréglages de caméra (fonctions pures) |
| `render/aquarium-scene.ts` | Scène statique : sable, eau, verre, arêtes, lumières ; libération |
| `render/aquarium-view.ts` | Vue sans Angular : renderer (fabrique remplaçable), caméra, `OrbitControls` |
| `ui/aquarium-host/` | Composant hôte : boucle rAF, avance de la simulation, redimensionnement, contrat de capture, `DestroyRef` |

Le renderer est créé par une fabrique (`AQUARIUM_RENDERER_FACTORY`, par défaut
`createWebGLRenderer`) : les tests `TestBed` la remplacent par un double, jsdom n'ayant pas
WebGL.

## Contrat de capture

Le harnais `frontend/e2e/captures.spec.ts` photographie l'application sous 5 angles, chaque
nuit, pour suivre l'évolution visuelle. Il repose sur ce contrat, que toute évolution doit
respecter :

| Élément | Règle |
|---|---|
| Paramètres d'URL | `capture`, `seed`, `camera`, `time`, lus par `core/capture/capture-params.ts` |
| `capture=1` | Simulation avancée de façon déterministe jusqu'à `time` (pas fixe, sans temps réel), puis figée ; interface masquée ; caméra sur le préréglage `camera` ; `devicePixelRatio` forcé à 1 |
| Signal « prêt » | Appeler `markCaptureReady()` (`core/capture/capture-ready.ts`) une fois la première image **complète** rendue ; `resetCaptureReady()` si la scène est rechargée. Implémentation : `AquariumHost` lève le signal à l'image qui suit le premier rendu WebGL de taille non nulle, et le retire à sa destruction |
| Image figée | En mode capture, une seule image est rendue (puis une à chaque redimensionnement) et les contrôles à la souris sont désactivés |
| Hors capture | Le signal « prêt » est aussi émis après la première image complète (le test de démarrage l'attend) |
| Erreurs | Aucune erreur de page ne doit survenir (le harnais et le test de démarrage échouent sinon) |

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
| Mutation | StrykerJS (à mettre en place par la QA) | Détecter les tests qui ne testent rien |

Le code qui exige WebGL n'est pas testable en unitaire (jsdom) : il est couvert par le bout
en bout et les captures. Cible de couverture : **≥ 80 % des lignes de `src/app/sim`**.

## Budgets

- Bundle initial : avertissement à 500 kB, erreur à 1 MB (`angular.json`).
- Objectif de fluidité : 60 images/s avec 200 poissons sur un portable de milieu de gamme,
  **mesuré par Mathis sur sa machine**, jamais dans l'environnement des agents.

## Backend

**NestJS**, introduit en phase 2 (voir `docs/adr/0004-backend-nestjs.md`). Pas de dossier
`backend/` en phase 1. Hébergement choisi au point d'étape de la fin de la semaine 4.
