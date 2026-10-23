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
  rattrapage). Vitesse de simulation (#52, ADR 0024) : l'hôte verse `realDt × vitesse`
  (`scaledDt`, `sim/sim-speed.ts`) sans jamais changer le pas ; à 0 le monde s'arrête et le
  rendu continue ; le plafond de pas est multiplié par la vitesse au-delà de ×1.
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
- **État sérialisable** : l'état du monde (`seed`, `tick`, `time`, `entities`, `obstacles`, `decor`,
  `food`, `nextFoodId`) est un objet
  de données simple (JSON), sans classe Three.js ni référence circulaire. Il sert à la
  sauvegarde, aux tests et aux captures.
- **Sauvegarde** (#70, ADR 0028, `sim/save.ts`) : `serializeWorld` écrit un JSON versionné
  (`format: "aqfish"`, `schema: 1` : graine, environnement, `tick`, décor, poissons avec
  l'état de leur sous-générateur, granulés, compteurs, réglages de vitesse et d'horloge ;
  obstacles et temps recalculés) ; `parseWorld` le relit avec une validation stricte qui ne
  lève jamais (`{ ok: false, error }`). Un monde rechargé puis avancé est identique, au bit
  près, au monde jamais sauvegardé. Tout nouveau champ d'état doit y être ajouté.
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
- **Nourriture** (ADR 0022, `sim/food.ts`) : granulés dans `World.food`, déposés par
  `feed` / `feedInPlace` (5 par dépôt, 60 au plus, hasard tiré une fois au dépôt sur un flux
  séparé), puis vieillis à chaque pas après les poissons (flottaison, chute à vitesse
  constante en forme fermée de l'âge, repos sur le sable ou le dessus d'un rocher, retrait).
  `advanceToWithFeedings` rejoue des dépôts datés (paramètre de capture `nourrir=`).
- **Faim et attraction** (ADR 0023, `sim/feeding.ts`) : `Fish.hunger` ∈ [0, 1] monte avec le
  temps (vitesse par espèce, `SpeciesDefinition.feeding`). Au début du pas, chaque poisson
  affamé vise le granulé le plus proche dans sa tranche d'eau, à portée et en vue
  (`foodTarget`) ; `stepFish` y tourne à la place de l'errance et du banc, l'évitement restant
  prioritaire. Après la nage, `eatInPlace` fait manger les poissons dans l'ordre des
  identifiants (un granulé, un seul mangeur). Sans granulé, nage inchangée.
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
La passe connaît aussi des **tons de nuit et du crépuscule** (ADR 0021), placés après les
couleurs de jour et pénalisés selon l'heure : écartés en plein jour (image de midi
identique à celle de la palette de jour seule), libres en pleine nuit ou à mi-crépuscule.
Viennent enfin les **tons d'environnement** (ADR 0039, `ENVIRONMENT_TONES`) : libres dans
l'environnement qui les déclare (`Environment.tones`, les bleus du récif et les violets de
ses coraux, ADR 0040), écartés partout ailleurs, dont les images restent celles de la
palette commune.

**Filtre désactivable** (ADR 0010) : avec le filtre `aucun`, `renderFrame()` rend la scène
directement à l'écran en pleine résolution, sans passe palette, et la caméra prend le
rapport d'aspect du canvas. `AquariumView.setFilter()` bascule à chaud sans toucher à la
caméra ni à la scène. Le pixel art reste le mode par défaut.

### Caméra

- `OrbitControls` (`three/examples/jsm/controls/OrbitControls.js`) : rotation au clic gauche,
  zoom à la molette, déplacement au clic droit, gestes tactiles ; boutons et gestes tactiles réglés
  d'après `core/commands` (ADR 0020), qui alimente aussi l'aide-mémoire.
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
| `core/save-storage/save-storage.ts` | Stockage de la sauvegarde automatique (#70, ADR 0028) : texte opaque sous `aqfish.sauvegarde`, lecture et écriture tolérantes, état `active` / `indisponible` / `plein` |
| `core/random/prng.ts` | PRNG mulberry32 à graine, dérivation de sous-générateurs par entité |
| `core/commands/commands.ts` | Source unique des commandes (ADR 0020) : raccourcis clavier `KEY_COMMANDS` (`keyCommandFor`, `commandKey`), gestes de la caméra `ORBIT_MOUSE_BUTTONS` / `ORBIT_TOUCHES` et leurs libellés (`orbitGestures`), aide-mémoire `helpSections()` |
| `core/keyboard/keyboard.ts` | Règles communes des gestionnaires de raccourcis (#79) : `isTypingContext` (touche laissée au navigateur si une touche de modification est enfoncée ou si le focus est dans un champ de saisie), importé par `ui/view-presets-bar` et `ui/commands-help` |
| `sim/constants.ts` | `SIM_DT`, `MAX_STEPS_PER_FRAME` |
| `sim/fixed-step.ts` | Accumulateur de la boucle à pas fixe (`fixedStep`, pure ; `fixedStepInto`, sans allocation) |
| `sim/sim-speed.ts` | Vitesse de simulation (#52, ADR 0024) : `SIM_SPEEDS` (0 à ×4), `scaledDt`, `maxStepsForSpeed` |
| `sim/time-step.ts` | `assertTimeStep` : validation unique d'un pas de temps |
| `sim/world.ts` | État du monde sérialisable (dont `decor`), `step`, `advance`, `advanceTo`, `advanceInPlace` (boucle d'affichage), `createDefaultWorld` (population et décor par défaut) |
| `sim/save.ts` | Sauvegarde (#70, ADR 0028) : format JSON versionné (`saveData`, `serializeWorld`), relecture validée (`parseWorld`, `parseSaveData` : bornes, effectifs, propriétés propres seulement, champs inconnus ignorés, schéma inconnu refusé) |
| `sim/population.ts` | Population réglable (#69, ADR 0025) : `setPopulation` (pure) / `setPopulationInPlace` (hôte), bornes `maxPopulation` par espèce et `MAX_TOTAL_FISH`, `populationCounts`, `populationLimits` |
| `sim/tank.ts` | Dimensions du bac, volume d'eau, `shrinkBox` (partagés par la simulation et le rendu) |
| `sim/environment.ts` | Environnements en données (#87, ADR 0026) : bac tropical, bassin, paludarium (#129) et récif (#148, ADR 0039) (dimensions, niveau de l'eau, sol à berge `terrain` et ses mousses et racines `bankDecor` (#132), teintes de l'eau et du sol en noms de la palette, tons d'environnement `tones`, bordure, vue par défaut, bulles, caustiques, décor, espèces et population de départ, ADR 0027) ; `livesIn` ; `World.environment` choisit le volume d'eau des bornes de nage et des dépôts |
| `sim/species.ts` | Définitions déclaratives des espèces (`NEON`, `GUPPY`, `CORYDORA`, `KOI`, `AXOLOTL`), espèces qui marchent sur le fond (`walker`, ADR 0035), apparences (`speciesVariants`, `speciesVariantIndex` en alternance ou tirées de la graine, ADR 0013 et 0027), préférence de profondeur (`depth`, ADR 0014), `validateSpecies` |
| `sim/swimmer.ts` | Poisson (état sérialisable, sous-générateur en état explicite), nage : errance, banc, évitement, bornes, préférence de profondeur et remontées (ADR 0014) |
| `sim/flocking.ts` | Banc : séparation, alignement, cohésion, pilotage en deux phases, espacement minimal (ADR 0011) |
| `sim/trajectory.ts` | Relevé de trajectoires sur une copie du monde, distance aux vitres et statistiques (mesure et tracé, issue #43) |
| `sim/obstacles.ts` | Obstacles du bac (données : sphère, union de sphères, boîte alignée sur les axes), distance signée et normale (ADR 0012, 0015, 0040) |
| `sim/coral-shapes.ts` | Formes des coraux (#149, ADR 0040) : modèle voxel d'une colonie tiré de sa graine (`coralModel` : branchu, table, dôme), boîte englobante en voxels |
| `sim/corals.ts` | Coraux du récif (#149, ADR 0040) : colonies de trois formes et quatre teintes, disposées d'un flux de hasard séparé (`coralLayout` : sur le sable, quarts de tour, sans chevauchement ni contact avec les rochers, nombre borné) ; boîte d'obstacle par colonie (`coralObstacles`), ajoutée aux obstacles par `createWorld` |
| `sim/anemones.ts` | Anémones du récif (#150, ADR 0041) : modèle voxel (pied, tapis de tentacules), disposition d'un flux de hasard séparé posée avant les coraux (`anemoneLayout`), ondulation des tentacules (`tentacleSway`), boîte d'obstacle du pied seul et points d'attache des poissons-clowns (`anemoneHomes`) |
| `sim/decor.ts` | Décor en données JSON (`DecorItem` : rochers et plantes, validation, `parseDecor`), rochers voxel générés depuis leur graine (`rockModel`), collision en union de sphères (`decorObstacles`), `DEFAULT_DECOR` (ADR 0015, 0016) |
| `sim/plant.ts` | Plantes voxel générées depuis leur graine, deux formes (`tall`, `tuft`), phase d'ondulation, collision des tiges élargie de la borne d'ondulation (`plantCollision`, ADR 0016) |
| `sim/plant-sway.ts` | Ondulation des plantes (fonction pure du temps simulé, de la hauteur relative et de la phase, bornée par `amplitude · h²`, ADR 0016) |
| `sim/bubbles.ts` | Bulles du diffuseur : fonction fermée de la graine, du numéro de bulle et du temps simulé (émission à cadence fixe, montée, zigzag, fin à la surface), tampon préalloué borné par `MAX_BUBBLES`, flux de hasard séparé (ADR 0017) |
| `sim/axolotl.ts` | Espèces qui marchent sur le fond (#130, ADR 0035) : état `marche` / `nage` / `remontee` fonction pure de la graine, de l'identifiant et du temps (`walkerPhaseAt`, créneaux décalés par individu), naissance au-dessus d'une eau assez profonde (`createWalker`), pas en place (`stepWalker` : à-coups de nage, suivi du fond, refus d'un pas au-dessus d'un fond trop haut, inclinaison bornée par la place autour du corps) ; aucun champ d'état ajouté |
| `sim/frog.ts` | Espèces amphibies (grenouille #131, ADR 0036 ; triton #133, ADR 0037, mêmes états réglés par `AmphibianParams`) : états `posee` / `saut` / `entree` / `nage` / `sortie` lus sur l'entité (`frogModeOf` : `ascent` > 0 en saut, sinon nature du sol et milieu voulu `wantsWater`, fonction pure du temps), sauts au début de créneaux tirés d'un hachage (`hopSlotAt`, `hopDrawAt`), parabole bornée (`hopArc`) vérifiée avant le départ (`canHop`), hauteur au repos continue au rivage (`restHeight`) ; aucun champ d'état ajouté |
| `sim/terrain.ts` | Sol du paludarium (#129, ADR 0034) : carte de hauteurs pure `terrainAt(x, z)` (hauteur, nature `fond`/`terre`/`roche`, immergé ou non) et sa hauteur seule sans allocation `terrainHeightAt` (#130), bornée au bac, phases tirées de la graine du terrain (donnée de l'environnement) ; rivage net (côté terre au-dessus de l'eau, côté eau dessous) ; côté de l'eau réglable (`waterSide`, `waterDirection`, +X par défaut) ; les deux fonctions partagent un calcul interne qui écrit dans un objet de travail propre à chacune (aucun état de module partagé, #142) |
| `sim/bank-decor.ts` | Mousses et racines de la berge du paludarium (#132, ADR 0038) : disposition pure tirée de la graine de l'environnement (`bankDecorLayout` : racines de la terre vers l'eau, tapis sur le sol émergé, sans chevauchement vu de dessus, nombre borné par `MAX_ROOTS` et `MAX_MOSS_PATCHES`) ; aménagement fixe, rien dans la sauvegarde |
| `sim/lily-pads.ts` | Nénuphars (#103, ADR 0029) : disposition tirée d'un flux de hasard séparé (`lilyPadLayout` : nombre, ancres, tailles, encoches, sans recouvrement ni débordement, dérive comprise) et pose pure du temps simulé (`lilyPadPose` : dérive de Lissajous bornée, balancement) ; nature des feuilles (nue, fleur, lotus) tirée d'un second flux et ouverture des fleurs fonction de l'heure (`flowerOpenness`, #104, ADR 0030) ; aucun état, rien dans la sauvegarde |
| `sim/rain.ts` | Pluie (#106, ADR 0032) : gouttes à cadence fixe et ronds à la surface, fonction fermée de la graine (flux séparé `RAIN_STREAM`), du numéro de goutte et du temps simulé (`fillRain`, tampon préalloué borné par `MAX_RAIN_DROPS` et `MAX_RIPPLES`), rayon des ronds (`rippleRadius`), frémissement des nénuphars (`rainShiver`, passé par `lilyPadPose`) ; aucun état, rien dans la sauvegarde |
| `sim/floating-leaves.ts` | Feuilles mortes du bassin (#107, ADR 0033) : créneaux de `LEAF_SLOT_PERIOD`, groupés en vagues d'intensité tirée (souvent faible) et de brise commune ; pose, dérive en ligne droite arrêtée au bord, balancement, rotation et descente, fonction fermée de la graine (flux séparés `FLOATING_LEAF_STREAM` et `FLOATING_LEAF_WAVE_STREAM`), du numéro de créneau et du temps simulé (`fillFloatingLeaves`, tampon préalloué borné par `MAX_FLOATING_LEAVES` = 8) ; aucun état, rien dans la sauvegarde |
| `sim/daylight.ts` | Cycle jour/nuit : horloge de journée (`DayClock`, `hourAt` sur le temps simulé, `freezeClock`, `freezeClockAt`, `resumeClock` ; journée de 1 200 s par défaut, `NOON_HOUR`, `MIDNIGHT_HOUR`), courbe de lumière `lightAt(heure)` et sa variante sans allocation `lightAtInto(heure, tampon)` (intensité, teinte, ciel ; continue, périodique sur 24 h, exactement blanche à midi), moment de la journée `dayPhaseAt` (indicateur, #73), curseur d'heure (`snapHour` au quart d'heure, `formatHour` « 14:30 », #52), sans couleur de la palette (ADR 0018, 0019, 0021) |
| `sim/food.ts` | Nourriture (ADR 0022) : granulés sérialisables, dépôt borné et dispersé (`dropFoodInPlace`), sol sous un point (`restHeightAt`, `rockTopAt` sur les voxels des rochers), chute et retrait en place (`stepFoodInPlace`) |
| `sim/feeding.ts` | Faim et repas (ADR 0023) : montée et retrait de la faim (`growHunger`, `satiate`), tranche d'eau par espèce (`feedingBand`), visibilité (`hasLineOfSight`), granulé le plus proche et point visé (`nearestPellet`, `foodTarget`), repas en place sans double prise (`eatInPlace`) |
| `sim/undulation.ts` | Ondulation (fonctions pures) : avance de la phase, amplitude selon la vitesse, pose du corps et de la queue (ADR 0009) |
| `sim/avoidance.ts` | Forces d'évitement des parois et des obstacles, proximité, déviation pour contourner (ADR 0012) |
| `render/palette.ts` | Palette unique (32 à 48 couleurs), nommées par usage ; tons de nuit (`NIGHT_TONES`) et du crépuscule (`TWILIGHT_TONES`), palette étendue de la passe (ADR 0021) ; tons d'environnement (`ENVIRONMENT_TONES`, ADR 0039) |
| `render/pixel-art.ts` | `PIXEL_SIZE`, taille de la cible basse résolution, couleur la plus proche avec pénalités facultatives (fonctions pures, même métrique que le shader) |
| `render/palette-pass.ts` | Cible basse résolution et passe plein écran palette (`ShaderMaterial`) ; pénalités des tons de l'heure et des tons d'environnement (`environmentTonePenalties`) ; libération |
| `render/camera-presets.ts` | Dimensions du bac, préréglages de caméra, interpolation des transitions (fonctions pures) |
| `render/stone-border.ts` | Margelle de pierre du bassin (#87) : anneau de blocs à joints sombres, hauteurs selon un motif fixe (`stoneBorderBlocks`, pur et testé) ; lueur de nuit `rocheLuneSombre` pour rester lisible |
| `render/terrain-mesh.ts` | Sol du paludarium en colonnes (#129, ADR 0034) : grille pure (`terrainGrid`, cellules de 2 cm, hauteurs au centimètre, colonnes émergées au moins un cran au-dessus de l'eau), maillage des seules faces visibles, coupe le long des vitres sans jonction en T |
| `render/bank-decor-mesh.ts` | Mousses et racines de la berge en voxels éclairés (#132, ADR 0038) : mousse posée sur les colonnes dessinées du sol (`terrainGrid`), racines voxelisées autour de leur ligne ; objet `berge` de la scène statique |
| `render/pond-ground.ts` | Sol du bassin enterré (#105, ADR 0031) : anneau de terre et d'herbe autour de la margelle (`pondGroundSlabs`), touffes d'herbe à graine fixe (`pondGrassTufts`), purs et testés ; lueur de nuit ; masquage par côté pour la coupe |
| `render/pond-cutaway.ts` | Vue en coupe du bassin (#105, ADR 0031) : côtés du sol et de la margelle à masquer quand la caméra passe sous le sol (`cutawaySides`, pur) |
| `render/aquarium-scene.ts` | Scène statique d'un environnement (ADR 0026) : sol, eau aux teintes de l'environnement, verre et arêtes ou margelle, lumières ; `setDaylight` (intensité et teinte des lumières, teinte de l'eau entre couleurs de la palette, ADR 0018) ; `setViewpoint` (coupe du bassin enterré sous le niveau du sol, ADR 0031) ; libération |
| `render/fish-model.ts` | Modèles voxel des poissons générés depuis un gabarit de profil par silhouette (`SILHOUETTES`, ADR 0009 et 0013) ; parties paires posées des deux côtés du corps (`FishTemplate.paired` : branchies et pattes de l'axolotl, ADR 0035 ; yeux, cuisses et pattes de la grenouille, ADR 0036 ; pattes du triton, ADR 0037) |
| `render/fish-layer.ts` | `InstancedMesh` corps et queue par espèce, interpolation entre deux pas, ondulation ; `AquariumView` en crée une par apparence de chaque entrée de `SPECIES` (ADR 0013) |
| `render/rock-model.ts` | Maillage voxel générique (`buildVoxelMesh`) et maillage d'un rocher (couleurs plates de la palette), normales lissées de sa coque de contour (ADR 0015) |
| `render/plant-model.ts` | Maillage voxel d'une plante (couleurs de végétation), hauteur et phase par sommet, `applyPlantSway` (positions réécrites en place, ADR 0016) |
| `render/coral-model.ts` | Maillage voxel d'une colonie de corail : flancs foncés, dessus et bouts clairs, rebord des tables foncé, polypes des dômes (`CORAL_COLORS`, ADR 0040) |
| `render/decor-layer.ts` | Couche du décor : maillages et coques de contour d'un pixel (décalage en pixels de la cible), placés selon `World.decor`, puis les coraux (`setDecor(items, corals, anemones)`, ADR 0040) et les anémones (ADR 0041) ; `update(time)` fait onduler les plantes et les tentacules (ADR 0015, 0016) |
| `render/lily-pad-model.ts` | Maillage d'une feuille de nénuphar (prisme mince à encoche, dessus en deux tons), coque de contour avec onglets aux coins de l'encoche, ombre plate (données brutes, testables sans WebGL) |
| `render/lily-flower-model.ts` | Fleurs des nénuphars et lotus (#104) : prismes convexes indexés (pétales en losange, cœur, tige de lotus) et inclinaison des pétales selon l'ouverture (données brutes, testables sans WebGL) |
| `render/lily-pad-layer.ts` | Couche des nénuphars : feuilles et contours comme le décor (après l'eau, `polygonOffset` contre le contour), ombres en eau profonde sur le fond, dessinées entre l'eau et les rides de la surface ; `update(time)` pose la dérive (ADR 0029) ; fleurs attachées aux feuilles, contour de silhouette, `setOpenness` (ADR 0030) |
| `render/rain-layer.ts` | Couche de la pluie (#106, ADR 0032) : gouttes en traits verticaux, en fondu en haut de leur chute (opacité par sommet, #125), et ronds concentriques (deux cercles de 16 segments par impact, deux paliers de couleur ; vus de biais, rond extérieur seul dans la couleur la plus claire, #125) en `LineSegments` d'un pixel, positions réécrites en place ; masquée sans pluie ; assombrie la nuit comme les bulles |
| `render/floating-leaf-model.ts`, `render/floating-leaf-layer.ts` | Feuilles mortes (#107, ADR 0033) : six formes irrégulières à graine fixe, prisme mince en deux tons (brun ou ocre) et coque de contour d'un pixel (purs et testés) ; couche à `MAX_FLOATING_LEAVES` emplacements créés une fois, géométries partagées, posée au-dessus des nénuphars ; masquée hors d'un environnement avec `floatingLeaves` ; assombrie la nuit comme les bulles |
| `render/effect-layer.ts` | Contrat commun des couches d'effets animés (`EffectLayer` : `update`, `setBrightness`, `setSeed`, `dispose`, `object`, #125) : bulles, pluie et feuilles mortes, parcourues en liste par `AquariumView` ; une couche masquée n'est pas posée |
| `render/bubble-layer.ts` | Bulles en nuages de points de 1 et 2 pixels de la cible (taille fixe à l'écran) et diffuseur ; positions réécrites en place (ADR 0017) |
| `render/food-layer.ts` | Granulés en deux rendus au choix (#117) : points (deux nuages sur une même géométrie, liseré `koiNoir` puis cœur `poissonJaune`, #83) ou voxels (cubes `poissonJaune` instanciés, coque `koiNoir` en faces arrière) ; taille selon le zoom (`render/food-size.ts`), assombris la nuit ; profondeur avancée de 2,5 cm le long du rayon de vue (`withDepthBias`) pour ne pas être mangés par le sable ou un rocher ; positions réécrites en place, rien de dessiné sans granulé (#67) |
| `render/food-size.ts` | Fonctions pures de taille des granulés (#117) : pixels de scène par mètre à la distance de la cible, cœur arrondi avec plancher d'un pixel, liseré réduit sous 2 pixels, côté des voxels |
| `render/food-pick.ts` | Clic ou glisser (`isClick`, tolérance 4 px), coordonnées normalisées, point visé sur la surface de l'eau par lancer de rayon (`waterSurfacePoint`), fonctions pures (#67) |
| `render/water-light.ts` | Caustiques sur le sable et reflet de surface (visible des deux côtés) : motifs par cases fixes du bac, en GLSL avec référence TypeScript (`causticLit`, `surfaceGlint`), animés par le temps simulé (ADR 0017) ; `setDaylight` : caustiques par paliers de couleurs pleines puis éteintes la nuit, reflet atténué (ADR 0018) |
| `render/night-shade.ts` | `flatBrightness(intensité)` : luminosité des couleurs plates (poissons, bulles, diffuseur), 1 en plein jour, `NIGHT_FLAT_BRIGHTNESS` la nuit (ADR 0019) ; `decorTintInto` (teinte du décor : blanc à midi, clair de lune la nuit) et `tonePenaltiesInto` (pénalités des tons de nuit et du crépuscule de la passe) (ADR 0021) |
| `render/aquarium-view.ts` | Vue sans Angular : renderer (fabrique remplaçable), caméra, `OrbitControls`, transitions de caméra, `updateFish`, `setDecor`, `updateDecor` (temps simulé interpolé), `updateLight` (lumière du jour, luminosité des couleurs plates des poissons, des bulles et des granulés), `updateFood`, `pickWaterSurface` et `onSurfaceClick` (clic sans glisser sur l'eau, #67), `setRain` (pluie, refusée hors d'un environnement avec `rain`, #106) |
| `ui/aquarium-host/` | Composant hôte : boucle rAF, avance de la simulation, horloge de journée (`initialDayClock`, `toggleClock`, `freezeClockAt`, `setClockRunning`), vitesse (`setSpeed`) et affichage du décor (`setDecorVisible`) du panneau de contrôle (#52), nourrissage (`feed`, `feedAtCenter`, sans effet en capture), sauvegarde (#70 : restauration au démarrage, écriture automatique `saveNow`, `exportSave`, `importSave`, stockage injectable `SAVE_STORAGE`, rien en capture), pluie (`setRain`, `toggleRain`, `pluie=`, jamais sauvegardée, #106), redimensionnement, contrat de capture, `DestroyRef` |
| `ui/view-presets-bar/` | Barre flottante des 5 préréglages de vue et raccourcis clavier `1` à `5` (émet le préréglage choisi), bascule « Pixel art » et touche `P` (émet la demande de bascule), touche `H` (fige ou remet en marche l'heure), touches `J` (plein jour : fige à midi) et `N` (nuit : fige à minuit), issue #75 ; bouton « Nourrir » et touche `G` (granulés au centre du bac, #67) ; touche `R` (pluie, #106) ; touches lues dans `core/commands` |
| `ui/day-indicator/` | Indicateur du moment de la journée (#73) : icône pixel art en SVG (soleil, soleil sur l'horizon, lune), nom accessible, en haut à gauche ; suit `AquariumHost.dayPhase` (`dayPhaseAt`, `sim/daylight.ts`) |
| `ui/control-panel/` | Panneau de contrôle repliable (#52, ADR 0024), en haut à gauche : sections `fieldset` « Simulation » (curseur de vitesse), « Journée » (curseur d'heure, case « Heure automatique », et case « Pluie » sur la même ligne dans le bassin, #106), « Décor » (case « Afficher le décor »), « Sauvegarde » (#70 : état, « Exporter », « Importer » avec fichier plafonné avant lecture, message d'import) ; entrées depuis l'hôte, sorties vers l'hôte, aucune logique de simulation ; fermé par défaut |
| `ui/commands-help/` | Aide-mémoire des commandes (#74, ADR 0020) : panneau généré par `helpSections()`, repliable par `?`, état mémorisé (`aqfish.aide-commandes`, repli en mémoire) ; contient le test d'exhaustivité des raccourcis |

Le renderer est créé par une fabrique (`AQUARIUM_RENDERER_FACTORY`, par défaut
`createWebGLRenderer`) : les tests `TestBed` la remplacent par un double, jsdom n'ayant pas
WebGL.

## Contrat de capture

Le harnais `frontend/e2e/captures.spec.ts` photographie l'application sous 5 angles, chaque
nuit, pour suivre l'évolution visuelle. Il repose sur ce contrat, que toute évolution doit
respecter :

| Élément | Règle |
|---|---|
| Paramètres d'URL | `capture`, `seed`, `camera`, `time`, et `filtre`, `heure`, `nourrir`, `population`, `environnement`, `granules` et `pluie` facultatifs, lus par `core/capture/capture-params.ts` |
| `environnement=` | En capture comme hors capture (#87, ADR 0026) : `tropical`, `bassin`, `paludarium` (#129) ou `recif` (#148) ; inconnu ou absent : bac tropical (séries existantes inchangées, à l'octet près). Sans `camera=`, vue par défaut de l'environnement (`top` pour le bassin, `three-quarter` pour le bac, le paludarium et le récif) |
| `population=` | En capture comme hors capture (#69, ADR 0025) : effectifs `espece:n` séparés par des virgules (`neon:12,guppy:2,corydora:0`), appliqués à t = 0 dans l'ordre de l'URL, bornés par `sim/population.ts`. Entrée mal formée ou espèce inconnue ignorée, 10 au plus. Absent : population par défaut (séries existantes inchangées, à l'octet près) |
| `nourrir=` | En capture seulement (#67, ADR 0022) : dépôts de nourriture séparés par des virgules, `t` (centre du bac) ou `t:x:z` (temps simulé en s, position en m) ; rejoués au temps simulé de chacun avant le premier rendu (`advanceToWithFeedings`). Entrée invalide ignorée, 20 au plus. Absent : aucun granulé (séries existantes inchangées, à l'octet près) |
| `granules=` | En capture seulement (#117, ADR 0022) : rendu des granulés, `points` ou `voxels`. Absent ou invalide : points (séries existantes inchangées, à l'octet près) |
| `pluie=1` | En capture comme hors capture (#106, ADR 0032) : il pleut dès le départ, dans un environnement qui le permet (le bassin) ; ailleurs ignoré. Gouttes et ronds au temps simulé `time`, déterministes. Toute autre valeur ou absent : pas de pluie (séries existantes inchangées, à l'octet près) |
| `filtre=pixel\|aucun` | Force le filtre de rendu (ADR 0010), y compris hors capture où il prime sur le choix mémorisé. Absent en capture : pixel art, quel que soit le choix mémorisé (séries existantes inchangées) |
| `heure=` | Réel dans [0, 24) (`0` : minuit, `18.5` : 18 h 30) : fige l'heure de la journée simulée (ADR 0018), en capture comme hors capture ; valeur invalide ignorée. Absent en capture : midi figé (séries existantes inchangées, à l'octet près) ; absent hors capture : départ à midi, journée de 1 200 s (20 min) simulées |
| `capture=1` | Simulation avancée de façon déterministe jusqu'à `time` (pas fixe, sans temps réel), puis figée ; interface masquée ; caméra sur le préréglage `camera` ; `devicePixelRatio` forcé à 1 |
| Signal « prêt » | Appeler `markCaptureReady()` (`core/capture/capture-ready.ts`) une fois la première image **complète** rendue ; `resetCaptureReady()` si la scène est rechargée. Implémentation : `AquariumHost` lève le signal à l'image qui suit le premier rendu WebGL de taille non nulle, et le retire à sa destruction |
| Image figée | En mode capture, une seule image est rendue (puis une à chaque redimensionnement) et les contrôles à la souris sont désactivés |
| Attributs de test | `app-aquarium-host` expose `data-aqfish-camera`, `data-aqfish-target`, `data-aqfish-tick`, `data-aqfish-seed`, `data-aqfish-filter`, `data-aqfish-hour` (heure affichée, 2 décimales), `data-aqfish-hour-frozen` (`true` si l'heure est figée) `data-aqfish-food` (nombre de granulés, #67) `data-aqfish-population` (effectifs `neon:12,guppy:6,corydora:6`, #69) `data-aqfish-environment` (`tropical` ou `bassin`, #87) et `data-aqfish-rain` (`true` s'il pleut, #106) |
| Hors capture | Le signal « prêt » est aussi émis après la première image complète (le test de démarrage l'attend) |
| Sauvegarde | En capture, le stockage du navigateur n'est jamais lu ni écrit (#70, ADR 0028) : le monde part toujours de la graine. Hors capture, un paramètre de monde (`seed`, `environnement`, `population`) prime aussi sur la sauvegarde ; `data-aqfish-save` expose son état (`active`, `indisponible`, `plein`), absent en capture |
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
- Raccourcis clavier et gestes : déclarés une seule fois dans `core/commands` (ADR 0020).
  Tout nouveau raccourci y est déclaré avant d'être géré ; l'aide-mémoire (`?`) suit sans
  autre modification, et un test d'exhaustivité échoue si une touche gérée n'est pas
  déclarée.

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

En CI (`.github/workflows/ci.yml`), les tests de bout en bout sont répartis sur 4 machines
en parallèle (`npm run e2e -- --shard=N/4`), à côté d'un job pour formatage, lint, tests
unitaires et build, et d'un job pour les captures. Le job `frontend` regroupe les résultats :
c'est le contrôle exigé pour fusionner dans `main`. Un fichier de test e2e n'est jamais
découpé entre deux machines : garder des fichiers de taille raisonnable.

## Budgets

- Bundle initial : avertissement à 500 kB, erreur à 1 MB (`angular.json`).
- Objectif de fluidité : 60 images/s avec 200 poissons sur un portable de milieu de gamme,
  **mesuré par Mathis sur sa machine**, jamais dans l'environnement des agents.

## Backend

**NestJS**, introduit en phase 2 (voir `docs/adr/0004-backend-nestjs.md`). Pas de dossier
`backend/` en phase 1. Hébergement : GitHub Pages tant que possible, backend sur le NAS à
terme (ADR 0004).
