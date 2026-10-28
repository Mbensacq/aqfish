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
- **Sauvegarde** (#70, ADR 0028, `sim/save.ts`) : l'application écrit le **schéma 2** de la
  pièce (`serializeRoom`, `sim/room-save.ts`, ci-dessous) ; le corps de chaque bac est celui
  du schéma 1. `serializeWorld` écrit le schéma 1 (`format: "aqfish"`, `schema: 1` : graine, environnement, `tick`, décor, poissons avec
  l'état de leur sous-générateur, granulés, compteurs, réglages de vitesse et d'horloge ;
  obstacles et temps recalculés) ; `parseWorld` le relit avec une validation stricte qui ne
  lève jamais (`{ ok: false, error }`). Un monde rechargé puis avancé est identique, au bit
  près, au monde jamais sauvegardé. Tout nouveau champ d'état doit y être ajouté. Le
  schéma 1 reste lisible (`parseSave` le migre) ; il ne sert plus qu'aux tests et aux
  fichiers anciens.
- **Un monde par environnement visité** (#277, ADR 0063, `sim/environment-worlds.ts`) :
  changer d'environnement range le monde quitté et reprend celui de l'environnement choisi
  (`switchEnvironment`) ; un environnement non affiché est **figé** (jamais avancé) ;
  l'heure de la journée continue sans saut (`carryClock`). La sauvegarde écrit les mondes
  rangés : au schéma 1 dans le champ facultatif `others`, au schéma 2 comme bacs de la pièce
  (un par environnement visité). La pièce de N bacs (ci-dessous) remplacera ce mécanisme.
- **Pièce de N bacs** (#264, ADR 0061 et 0069 ; lot 1 livré : modèle et sauvegarde) : une
  pièce (`sim/room-state.ts`, `RoomState`) est une liste de mondes `World`
  **indépendants**, un par bac, avec identifiant, nom et lieu (`piece`, ou `jardin` pour le
  bassin) ; `stepRoom` les avance du même pas par identifiant croissant, sans aucune lecture
  croisée ; le bac 0 a la graine de la pièce, les autres `tankSeed` (graine dérivée avec la
  constante `TANK_SEED_SALT`). La sauvegarde est au **schéma 2** (`sim/room-save.ts` :
  `serializeRoom`, `parseSave`, enveloppe de la pièce et corps du schéma 1 pour chaque bac,
  graine comprise), avec migration 1 → 2 (`migrateSchema1` : monde affiché en bac 0, mondes
  de `others` à la suite, graines enregistrées) et copie unique de l'ancien texte sous
  `aqfish.sauvegarde.schema1` (`core/save-storage`). Lot 1 : l'hôte garde le monde affiché
  et les mondes rangés (ADR 0063, bacs non sélectionnés figés) et une `RoomState`
  resynchronisée à chaque sauvegarde (`syncRoom`), avec l'identifiant du bac sélectionné ;
  au plus un bac par environnement. Meubles, supports et positions des bacs arrivent au
  lot 2, la liste des bacs et la simulation de tous les bacs au lot 3. L'hôte expose le
  **bac sélectionné** par ses signaux actuels : tableau de bord, alertes, fiches, wiki et
  actions lisent ces signaux et ne supposent jamais un bac unique ailleurs.
- **Eau** (#206, ADR 0052, `sim/water.ts`) : `World.water` (température, ammoniaque,
  nitrites, nitrates en unités de jeu, filtre), eau saine à la création, avancée à chaque
  pas après la nourriture, sur place et sans hasard (ne change ni la nage ni les captures).
  Charge des habitants au cube de leur taille, conversions par le filtre en forme exacte,
  nitrates retirés par `changeWorldWater`. Champ `water` facultatif de la sauvegarde.
  Consigne du chauffage (#207, ADR 0053) : `water.heater` facultatif, visé à la place de la
  température de l'environnement (`setWorldHeater`). L'hôte relit l'eau toutes les
  `WATER_READOUT_TICKS` pas (`data-aqfish-water`, signal `water`) et trouble la vue quand
  elle est mauvaise. pH (#236, ADR 0057, `sim/water-ph.ts`) : `water.ph` dans [4 ; 9,5],
  eau neuve à `FRESH_PH` de l'environnement, baisse avec la charge, remonte d'une part
  `WATER_CHANGE_SHARE` vers l'eau neuve au changement d'eau ; absent d'une sauvegarde, celui
  de l'eau neuve. Zone de la jauge selon les plages communes des espèces présentes
  (`phBands`, `phZone`), exposée par `data-aqfish-ph` (« 6.9;tolere »).
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
- **Santé** (#208, ADR 0054, `sim/wellbeing.ts`) : `Fish.health` ∈ [0,2 ; 1], avancée en
  fin de pas (après les repas et l'eau), sans hasard ni allocation : baisse tant que la faim
  vaut 1 (espèces qui mangent les granulés) ou que l'eau est « mauvaise » (`waterQuality`),
  et deux fois moins vite pour un pH hors de la plage tolérée de l'espèce (#236,
  `PH_STRESS`), remonte deux fois plus lentement sinon. Sous 1, déplacement multiplié par `vigor` (0,6 au
  plancher) et couleurs ternies au rendu (`dullness`, attribut d'instance de `FishLayer`) ;
  à 1, nage et couleurs exactement celles d'avant. Champ `health` facultatif de la
  sauvegarde (1 par défaut).
- **Compatibilité et rythme du jour** (#209, ADR 0055, `sim/compatibility.ts`,
  `sim/day-rhythm.ts`) : verdict pur par couple d'espèces (tempérament paisible, territorial
  ou prédateur). Entre poissons **nageurs** d'espèces incompatibles, évitement ajouté au
  pilotage de banc puis distance minimale après la nage (`RIVAL_MIN_DISTANCE`) ; sans couple
  incompatible, rien n'est calculé. La simulation lit l'horloge de la journée
  (`advanceInPlace(monde, pas, horloge)`, `null` : plein jour) : la nuit, les espèces
  diurnes ralentissent et descendent sous un plafond ; corydoras inchangés. En plein jour,
  nage exactement celle d'avant.
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
palette commune. Puis les **tons de la nourriture** (ADR 0056, `FOOD_TONES`) : proposés
pixel par pixel, aux seuls pixels de scène dont l'opacité est inférieure à 1. Les granulés
y écrivent un marqueur (`FOOD_ALPHA_MARKER`, mélange qui remplace couleur et opacité) ;
rien d'autre n'écrit d'opacité inférieure à 1 dans la cible, dont les autres pixels restent
ramenés à la palette sans ces tons.

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
| `core/save-storage/save-storage.ts` | Stockage de la sauvegarde automatique (#70, ADR 0028) : texte opaque sous `aqfish.sauvegarde`, lecture et écriture tolérantes, état `active` / `indisponible` / `plein` ; copie unique d'une sauvegarde au schéma 1 sous `aqfish.sauvegarde.schema1` avant la première écriture par-dessus (#264, ADR 0069) |
| `core/random/prng.ts` | PRNG mulberry32 à graine, dérivation de sous-générateurs par entité |
| `core/decor-physics/` | Chute d'un élément lâché dans l'éditeur du décor (#170, ADR 0046) : `decor-physics.ts` importe le moteur Rapier et fait tomber la scène décrite par `sim/decor-drop.ts` ; `load-decor-physics.ts` le charge à la demande (`import()` dynamique, hors du bundle initial). Seul endroit du dépôt qui importe Rapier |
| `core/commands/commands.ts` | Source unique des commandes (ADR 0020) : raccourcis clavier `KEY_COMMANDS` (`keyCommandFor`, `commandKey`), gestes de la caméra `ORBIT_MOUSE_BUTTONS` / `ORBIT_TOUCHES` et leurs libellés (`orbitGestures`), aide-mémoire `helpSections()` |
| `core/keyboard/keyboard.ts` | Règles communes des gestionnaires de raccourcis (#79) : `isTypingContext` (touche laissée au navigateur si une touche de modification est enfoncée ou si le focus est dans un champ de saisie), importé par `ui/view-presets-bar` et `ui/commands-help` |
| `sim/constants.ts` | `SIM_DT`, `MAX_STEPS_PER_FRAME` |
| `sim/fixed-step.ts` | Accumulateur de la boucle à pas fixe (`fixedStep`, pure ; `fixedStepInto`, sans allocation) |
| `sim/sim-speed.ts` | Vitesse de simulation (#52, ADR 0024) : `SIM_SPEEDS` (0 à ×4), `scaledDt`, `maxStepsForSpeed` |
| `sim/time-step.ts` | `assertTimeStep` : validation unique d'un pas de temps |
| `sim/world.ts` | État du monde sérialisable (dont `decor`), `step`, `advance`, `advanceTo`, `advanceInPlace` (boucle d'affichage), `createDefaultWorld` (population et décor par défaut) |
| `sim/save.ts` | Sauvegarde (#70, ADR 0028) : format JSON versionné (`saveData`, `serializeWorld`), relecture validée (`parseWorld`, `parseSaveData` : bornes, effectifs, propriétés propres seulement, champs inconnus ignorés, schéma inconnu refusé) ; mondes des autres environnements visités dans `others` (#277, ADR 0063) |
| `sim/room-state.ts` | Pièce de N bacs (#264, ADR 0061 et 0069) : `RoomState` et `RoomTank` (identifiant, nom, lieu, monde), graines des bacs (`tankSeed`), pièce neuve (`createRoom`), pas commun sans lecture croisée (`stepRoom`), bac sélectionné (`resolveSelectedTank`), passage aux mondes de l'hôte du lot 1 (`roomWorlds`, `syncRoom`) |
| `sim/room-save.ts` | Sauvegarde au schéma 2 (#264, ADR 0069) : `roomSaveData`, `serializeRoom` (256 Kio par bac), relecture validée des schémas 2 et 1 (`parseSave`, `parseRoomSaveData`, ne lève jamais), migration `migrateSchema1`, mondes de l'hôte (`parseSaveWorlds`) |
| `sim/environment-worlds.ts` | Mondes des environnements visités mais non affichés (#277, ADR 0063) : changement d'environnement pur (`switchEnvironment` : monde quitté rangé, figé ; monde repris ou de départ), liste ordonnée pour la sauvegarde (`stashedList`) et table relue (`stashFromList`) |
| `sim/population.ts` | Population réglable (#69, ADR 0025) : `setPopulation` (pure) / `setPopulationInPlace` (hôte), bornes `maxPopulation` par espèce et `MAX_TOTAL_FISH`, `populationCounts`, `populationLimits` |
| `sim/water.ts` | Modèle d'eau (#206, ADR 0052) : `WaterState`, `freshWater`, `stepWaterInPlace` / `stepWater` (charge `waterLoad`, litres `waterLiters`, températures `WATER_TEMPERATURES`), `changeWaterInPlace` / `changeWater`, relecture validée `readWater` ; consigne du chauffage `heater` facultative (#207, ADR 0053 : `setHeaterInPlace`, `targetTemperature`) ; pH `ph` (#236, ADR 0057), remis vers l'eau neuve par `changeWaterInPlace(water, environment)` |
| `sim/water-ph.ts` | pH (#236, ADR 0057) : bornes `MIN_PH` / `MAX_PH`, eau neuve `FRESH_PH`, dérive `stepPh` (`PH_DROP_PER_LOAD_LITER`), changement d'eau `phAfterWaterChange`, plages tolérée et idéale par espèce `SPECIES_PH` (approximations de jeu), `phOutOfTolerance`, plages communes `phBands`, zone de jauge `phZone` (`ideal`, `tolere`, `hors-plage`) |
| `sim/water-quality.ts` | Qualité de l'eau (#207, ADR 0053) : indicateur global `waterQuality` (`bonne`, `a-surveiller`, `mauvaise`, pire de l'ammoniaque, des nitrites, des nitrates et de l'écart de température, seuils `COMPOUND_THRESHOLDS` et `TEMPERATURE_THRESHOLDS`), jauges (`GAUGE_MAX`, `gaugeFill`), relevé au dixième pour l'interface (`waterReadout`, `sameReadout` ; pH, zone et plages des espèces présentes, #236), trouble rendu (`waterTurbidity`), eau d'exemple de `eau=` (`sampleWater`) |
| `sim/compatibility.ts` | Compatibilité des espèces (#209) : `TEMPERAMENTS`, `compatibility(a, b)` (symétrique ; même espèce ou inconnue : compatible), `mixWarnings` (mélanges déconseillés d'une population), évitement entre nageurs incompatibles (`hasRivals`, `addRivalSteering`, `enforceRivalDistance`) |
| `sim/day-rhythm.ts` | Rythme du jour (#209) : espèces diurnes (`DIURNAL`), repos de nuit `nightRest(espèce, intensité)` et facteur de déplacement `nightPace` (exactement 1 le jour) |
| `sim/species-catalog.ts` | Catalogue d'espèces (#189) : `speciesCatalog(env)` (espèces de l'environnement, libellés `SPECIES_LABELS`, effectif par défaut et maximum), `applySpeciesCounts` / `applySpeciesCountsInPlace` (effectifs demandés arrondis et bornés, espèce inconnue ou hors environnement ignorée) |
| `sim/species-sheet.ts` | Fiches d'espèces (#237, ADR 0058) : `speciesSheet(id)` (taille adulte, températures, pH, régime, caractère, groupe minimal, volume conseillé, espèces à éviter ; chaque champ `SheetField` avec un statut `source` + référence ou `approximation`), pH, caractère et voisins à éviter lus de `SPECIES_PH`, `TEMPERAMENTS` et `compatibility` (pas de copie), lignes affichées `sheetRows`, avertissements d'ajout `addWarnings` (volume, groupe, incompatibilité) et `addWarningText` |
| `sim/species-wiki.ts` | Wiki des espèces, lot 1/2 (#287, ADR 0066) : `searchKey` (minuscules, sans accents), `matchesWikiSearch` (nom courant, scientifique, singulier, pluriel), `wikiLists` (présentes dans le bac avec effectif, ajoutables dans l'environnement), `wikiSheet` (modèle de vue d'une fiche : `sheetRows` et `sheetNotes`, sans copie de valeur) ; lot 2/2 (#291, ADR 0068) : `wikiCare` (alimentation, cohabitation en trois groupes : déconseillées, compatibles dans un même environnement, autres milieux) |
| `sim/species-care.ts` | Soins du wiki (#291, ADR 0068) : `feedingRows` (nourriture, fréquence, quantité prudente, zone de nourrissage tirée de `SpeciesDefinition.feeding`, chacune sourcée ou « approximation de jeu »), `cohabitation` (verdict de `compatibility`, environnement commun, raison), `tankFit` / `tankComparison` (eau du bac face aux plages préférée et tolérée de la fiche : dans la plage, limite, hors plage ; écart `gapText`) |
| `sim/care-guide.ts` | Pages « Produits et traitements » et « Maladies » du wiki (#291, ADR 0068) : entrées figées tirées de `docs/SOINS.md` et `docs/ESPECES.md`, chacune avec sa référence ; `guideEntries`, `guideView`, `CARE_DISCLAIMER` |
| `sim/tank.ts` | Dimensions du bac, volume d'eau, `shrinkBox` (partagés par la simulation et le rendu) ; bornes des dimensions réglables (`TANK_LIMITS`, `clampTankDimensions`, #171, ADR 0047) |
| `sim/room.ts` | Pièce autour du bac tropical (#187, ADR 0048) : modèle `Room` (`shown`, `cabinetHeight` bornée par `clampRoom`), relecture validée (`readRoom`), disposition pure en blocs au centimètre (`roomBlocks` : parquet, mur, cimaise, plinthe, meuble et portes, hors du volume du bac), parties visibles selon la caméra (`roomVisibility`), éléments `items` relus par `readRoomItem` ; jamais lue par la simulation |
| `sim/room-furniture.ts` | Meubles et plantes de la pièce (#188, ADR 0049) : catalogue voxel (`ROOM_CATALOG`), boîtes de collision au quart de tour, pose par gravité analytique (`dropRoomItem`, refus), retombée des éléments sans support (`settleRoomItems`, `removeRoomItem`), refus des gestes qui laisseraient un élément en l'air (`floatingRoomItems`), sauvegarde relue rendue cohérente (`tidyRoom`, ADR 0050), blocs à dessiner (`furnitureBlocks`, ou d'un seul élément) et boîtes de choix (`roomItemBounds`) |
| `sim/tank-resize.ts` | Dimensions réglables du bac tropical (#171, ADR 0047) : `setTankDimensionsInPlace` borne les dimensions, ramène le décor (emprise), les poissons et les granulés dans le bac, recalcule les obstacles. Un monde porte ses dimensions (`World.dimensions?`) et sert de lieu (`Place`, `sim/environment.ts`) aux fonctions de géométrie |
| `sim/environment.ts` | Environnements en données (#87, ADR 0026) : bac tropical, bassin, paludarium (#129), récif (#148, ADR 0039) et bac d'eau froide (#271, ADR 0065, axolotls seuls) (dimensions, niveau de l'eau, sol à berge `terrain` et ses mousses et racines `bankDecor` (#132), teintes de l'eau et du sol en noms de la palette, tons d'environnement `tones`, bordure, vue par défaut, bulles, caustiques, décor, espèces et population de départ, ADR 0027) ; `livesIn` ; `World.environment` choisit le volume d'eau des bornes de nage et des dépôts |
| `sim/species.ts` | Définitions déclaratives des espèces (`NEON`, `GUPPY`, `CORYDORA`, `KOI`, `AXOLOTL`), espèces qui marchent sur le fond (`walker`, ADR 0035), apparences (`speciesVariants`, `speciesVariantIndex` en alternance ou tirées de la graine, ADR 0013 et 0027), préférence de profondeur (`depth`, ADR 0014 ; bande de mi-hauteur `minHeightRatio`, ADR 0042), `validateSpecies` |
| `sim/swimmer.ts` | Poisson (état sérialisable, sous-générateur en état explicite), nage : errance, banc, évitement, bornes, préférence de profondeur (fond, ADR 0014 ; mi-hauteur, ADR 0042) et remontées |
| `sim/flocking.ts` | Banc : séparation, alignement, cohésion, pilotage en deux phases, espacement minimal (ADR 0011) |
| `sim/trajectory.ts` | Relevé de trajectoires sur une copie du monde, distance aux vitres et statistiques (mesure et tracé, issue #43) |
| `sim/obstacles.ts` | Obstacles du bac (données : sphère, union de sphères, boîte alignée sur les axes), distance signée et normale (ADR 0012, 0015, 0040) |
| `sim/coral-shapes.ts` | Formes des coraux (#149, ADR 0040) : modèle voxel d'une colonie tiré de sa graine (`coralModel` : branchu, table, dôme), boîte englobante en voxels |
| `sim/corals.ts` | Coraux du récif (#149, ADR 0040) : colonies de trois formes et quatre teintes, disposées d'un flux de hasard séparé (`coralLayout` : sur le sable, quarts de tour, sans chevauchement ni contact avec les rochers, nombre borné) ; boîte d'obstacle par colonie (`coralObstacles`), ajoutée aux obstacles par `createWorld` |
| `sim/anemones.ts` | Anémones du récif (#150, ADR 0041) : modèle voxel (pied, tapis de tentacules), disposition d'un flux de hasard séparé posée avant les coraux (`anemoneLayout`), ondulation des tentacules (`tentacleSway`), boîte d'obstacle du pied seul et points d'attache des poissons-clowns (`anemoneHomes`) |
| `sim/decor-edit.ts` | Édition du décor (#167, ADR 0043) : catalogue (`DECOR_CATALOG`, outils `DecorTool`), `addDecorItem` et `removeDecorItem` (nouveau tableau, graine tirée de celle du monde, bornes et plafond de 64), `setDecorInPlace` / `withDecor` (obstacles recalculés) ; bac tropical seulement (`isDecorEditable`). Pose (#168, ADR 0044) : `moveDecorItem` (borné par l'emprise, `clampDecorPosition`, `decorFootprint`), `rotateDecorItem` (pas de 15°), `scaleDecorItem` (pas de 0,25), chevauchement refusé (`isDecorPoseAllowed`) |
| `sim/decor-drop.ts` | Pose par gravité (#170, ADR 0046) : scène de chute pure (`decorDropScene` : sphères du corps, voisins fixes épaissis, sol, vitres, hauteur de départ), lecture du repos (`settleDecorItem` : élévation, position du lâcher gardée sur le sable libre), repli sans moteur (`groundDecorItem`). `DecorItem.elevation` (facultative) : élément posé sur un autre |
| `sim/decor-release.ts` | Relâcher les éléments dont le support disparaît (#182, ADR 0046) : `isDecorItemSupported` (appui par en dessous d'un rocher ou d'un bois, à `DROP_SKIN` + `SUPPORT_GAP` près), `decorFallScene` (chute depuis la pose), `releaseUnsupportedDecor` (le plus bas d'abord, cascade bornée, repli sur le sable sans moteur ; soutenus rendus tels quels). Appelé par `AquariumHost.applyDecor` après chaque modification du décor |
| `sim/decor.ts` | Décor en données JSON (`DecorItem` : rochers, plantes et bois flottés, validation, `parseDecor`), rochers voxel générés depuis leur graine (`rockModel`), collision en union de sphères (`decorObstacles`, `decorSpheres`), voxels de tout élément (`decorVoxels`), `DEFAULT_DECOR` (ADR 0015, 0016) |
| `sim/wood.ts` | Bois flotté à branches (#169, ADR 0045) : squelette de capsules tiré de la graine (`woodSkeleton`), voxels et sphères fines qui les contiennent (`woodModel`, au plus `MAX_WOOD_SPHERES`), modèles en cache |
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
| `sim/food.ts` | Nourriture (ADR 0022) : granulés sérialisables, dépôt borné et dispersé (`dropFoodInPlace`), sol sous un point (`restHeightAt`, `rockTopAt` sur les voxels des rochers), chute et retrait en place (`stepFoodInPlace`) ; aspect d'un granulé tiré de son identifiant (`foodLook` : grain, flocon ou paillette, nuance, taille, orientation ; #226), sans toucher au hasard de la simulation |
| `sim/feeding.ts` | Faim et repas (ADR 0023) : montée et retrait de la faim (`growHunger`, `satiate`), tranche d'eau par espèce (`feedingBand`), visibilité (`hasLineOfSight`), granulé le plus proche et point visé (`nearestPellet`, `foodTarget`), repas en place sans double prise (`eatInPlace`) |
| `sim/undulation.ts` | Ondulation (fonctions pures) : avance de la phase, amplitude selon la vitesse, pose du corps et de la queue (ADR 0009) |
| `sim/avoidance.ts` | Forces d'évitement des parois et des obstacles, proximité, déviation pour contourner (ADR 0012) |
| `render/palette.ts` | Palette unique (32 à 48 couleurs), nommées par usage ; tons de nuit (`NIGHT_TONES`) et du crépuscule (`TWILIGHT_TONES`), palette étendue de la passe (ADR 0021) ; tons d'environnement (`ENVIRONMENT_TONES`, ADR 0039) ; tons de la nourriture (`FOOD_TONES`, ADR 0056) |
| `render/pixel-art.ts` | `PIXEL_SIZE`, taille de la cible basse résolution, couleur la plus proche avec pénalités facultatives (fonctions pures, même métrique que le shader) |
| `render/palette-pass.ts` | Cible basse résolution et passe plein écran palette (`ShaderMaterial`) ; pénalités des tons de l'heure et des tons d'environnement (`environmentTonePenalties`), tons de la nourriture selon l'opacité du pixel (`FOOD_ALPHA_THRESHOLD`) ; libération |
| `render/camera-presets.ts` | Dimensions du bac, préréglages de caméra, interpolation des transitions (fonctions pures) |
| `render/room-layer.ts` | Pièce autour du bac (#187, ADR 0048) et ses meubles (#188) : blocs de `roomBlocks` et `furnitureBlocks` en deux maillages à couleurs par sommet (sol et meuble éclairés, mur et cimaise en couleurs plates), masqués selon la caméra (`setViewpoint`), contour de l'élément sélectionné (`setSelected`, ADR 0050) ; aucun maillage pièce masquée |
| `render/room-pick.ts` | Éditeur de la pièce (#188, ADR 0050) : meuble ou point du parquet visé par un rayon (`pickRoom`, boîtes alignées, bac et meuble support comme caches), fonctions pures |
| `render/stone-border.ts` | Margelle de pierre du bassin (#87) : anneau de blocs à joints sombres, hauteurs selon un motif fixe (`stoneBorderBlocks`, pur et testé) ; lueur de nuit `rocheLuneSombre` pour rester lisible |
| `render/terrain-mesh.ts` | Sol du paludarium en colonnes (#129, ADR 0034) : grille pure (`terrainGrid`, cellules de 2 cm, hauteurs au centimètre, colonnes émergées au moins un cran au-dessus de l'eau), maillage des seules faces visibles, coupe le long des vitres sans jonction en T |
| `render/bank-decor-mesh.ts` | Mousses et racines de la berge en voxels éclairés (#132, ADR 0038) : mousse posée sur les colonnes dessinées du sol (`terrainGrid`), racines voxelisées autour de leur ligne ; objet `berge` de la scène statique |
| `render/pond-ground.ts` | Sol du bassin enterré (#105, ADR 0031) : anneau de terre et d'herbe autour de la margelle (`pondGroundSlabs`), touffes d'herbe à graine fixe (`pondGrassTufts`), purs et testés ; lueur de nuit ; masquage par côté pour la coupe |
| `render/pond-cutaway.ts` | Vue en coupe du bassin (#105, ADR 0031) : côtés du sol et de la margelle à masquer quand la caméra passe sous le sol (`cutawaySides`, pur) |
| `render/aquarium-scene.ts` | Scène statique d'un environnement (ADR 0026) : sol, eau aux teintes de l'environnement, verre et arêtes ou margelle, lumières ; `setDaylight` (intensité et teinte des lumières, teinte de l'eau entre couleurs de la palette, ADR 0018) ; `setViewpoint` (coupe du bassin enterré sous le niveau du sol, ADR 0031) ; `setTurbidity` (eau trouble et verdâtre, couleur des matériaux seulement, #207, ADR 0053) ; libération |
| `render/fish-model.ts` | Modèles voxel des poissons générés depuis un gabarit de profil par silhouette (`SILHOUETTES`, ADR 0009 et 0013) ; parties paires posées des deux côtés du corps (`FishTemplate.paired` : branchies et pattes de l'axolotl, ADR 0035 ; yeux, cuisses et pattes de la grenouille, ADR 0036 ; pattes du triton, ADR 0037) |
| `render/fish-layer.ts` | `InstancedMesh` corps et queue par espèce, interpolation entre deux pas, ondulation ; `AquariumView` en crée une par apparence de chaque entrée de `SPECIES` (ADR 0013) |
| `render/rock-model.ts` | Maillage voxel générique (`buildVoxelMesh`) et maillage d'un rocher (couleurs plates de la palette), normales lissées de sa coque de contour (ADR 0015) |
| `render/wood-model.ts` | Maillage voxel d'un bois flotté, trois bruns de la palette (`WOOD_COLORS`, ADR 0045) |
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
| `render/food-layer.ts` | Granulés en deux rendus au choix (#117, #226) : voxels par défaut (un maillage instancié par forme, cube unité ombré par face en couleurs de sommet, teinte par instance, sans liseré) ou points (deux nuages sur une même géométrie, liseré `koiNoir` puis cœur de la nuance du granulé, #83) ; nuances ocre, beige et brun-rouge, marqueur d'opacité pour les tons de la nourriture (ADR 0056) ; taille selon le zoom (`render/food-size.ts`), assombris la nuit ; profondeur avancée de 2,5 cm le long du rayon de vue (`withDepthBias`) pour ne pas être mangés par le sable ou un rocher ; positions réécrites en place, rien de dessiné sans granulé (#67) |
| `render/food-size.ts` | Fonctions pures de taille des granulés (#117) : pixels de scène par mètre à la distance de la cible, cœur arrondi avec plancher d'un pixel, liseré réduit sous 2 pixels, côté des voxels, dimensions des formes avec plancher d'un pixel par dimension (`foodVoxelDimensions`, #226) |
| `render/decor-pick.ts` | Point visé sur le dessus du sable (`sandPoint`, et `sandPlanePoint` / `planePoint` non bornés pour le glissement, #168, #188) et type `DecorPick` du clic en mode édition (#167 ; meuble ou parquet de la pièce, #188) ; le choix d'un élément touché passe par `DecorLayer.pickItem` (lancer de rayon sur les maillages voxels) |
| `render/food-pick.ts` | Clic ou glisser (`isClick`, tolérance 4 px), coordonnées normalisées, point visé sur la surface de l'eau par lancer de rayon (`waterSurfacePoint`), fonctions pures (#67) |
| `render/water-light.ts` | Caustiques sur le sable et reflet de surface (visible des deux côtés) : motifs par cases fixes du bac, en GLSL avec référence TypeScript (`causticLit`, `surfaceGlint`), animés par le temps simulé (ADR 0017) ; `setDaylight` : caustiques par paliers de couleurs pleines puis éteintes la nuit, reflet atténué (ADR 0018) |
| `render/night-shade.ts` | `flatBrightness(intensité)` : luminosité des couleurs plates (poissons, bulles, diffuseur), 1 en plein jour, `NIGHT_FLAT_BRIGHTNESS` la nuit (ADR 0019) ; `decorTintInto` (teinte du décor : blanc à midi, clair de lune la nuit) et `tonePenaltiesInto` (pénalités des tons de nuit et du crépuscule de la passe) (ADR 0021) |
| `render/aquarium-view.ts` | Vue sans Angular : renderer (fabrique remplaçable), caméra, `OrbitControls`, transitions de caméra, `updateFish`, `setDecor`, `updateDecor` (temps simulé interpolé), `updateLight` (lumière du jour, luminosité des couleurs plates des poissons, des bulles et des granulés), `updateFood`, `pickWaterSurface` et `onSurfaceClick` (clic sans glisser sur l'eau, #67), glissement du décor (`setDecorDragEnabled`, `onDecorDrag`, `previewDecorMove` : écouteur en phase de capture avant `OrbitControls`, #168, ADR 0044), `setRain` (pluie, refusée hors d'un environnement avec `rain`, #106) |
| `ui/aquarium-host/` | Composant hôte : boucle rAF, avance de la simulation, horloge de journée (`initialDayClock`, `toggleClock`, `freezeClockAt`, `setClockRunning`), vitesse (`setSpeed`) et affichage du décor (`setDecorVisible`) du panneau de contrôle (#52), nourrissage (`feed`, `feedAtCenter`, sans effet en capture), sauvegarde (#70 : restauration au démarrage, écriture automatique `saveNow`, `exportSave`, `importSave`, stockage injectable `SAVE_STORAGE`, rien en capture), pluie (`setRain`, `toggleRain`, `pluie=`, jamais sauvegardée, #106), édition du décor (#167 : `setDecorEditing`, `setDecorTool`, `selectDecor`, `editAt`, `deleteSelectedDecor`, `rotateSelectedDecor`, `scaleSelectedDecor`, glissement `startDecorDrag` / `moveDecorDrag` / `endDecorDrag` et refus `decorRefused` (#168), enregistrement immédiat, `edition=` en capture ; pièce (#188, ADR 0050) : `selectRoomItem`, glissement `startRoomDrag` / `moveRoomDrag` / `endRoomDrag`, `edition-meuble=` en capture), redimensionnement, contrat de capture, `DestroyRef` |
| `ui/view-presets-bar/` | Barre flottante des 5 préréglages de vue et raccourcis clavier `1` à `5` (émet le préréglage choisi), bascule « Pixel art » et touche `P` (émet la demande de bascule), touche `H` (fige ou remet en marche l'heure), touches `J` (plein jour : fige à midi) et `N` (nuit : fige à minuit), issue #75 ; bouton « Nourrir » et touche `G` (granulés au centre du bac, #67) ; touche `R` (pluie, #106) ; touches lues dans `core/commands` |
| `ui/day-indicator/` | Indicateur du moment de la journée (#73) : icône pixel art en SVG (soleil, soleil sur l'horizon, lune), nom accessible, en haut à gauche ; suit `AquariumHost.dayPhase` (`dayPhaseAt`, `sim/daylight.ts`) |
| `ui/control-panel/` | Panneau de contrôle repliable (#52, ADR 0024), en haut à gauche : sections `fieldset` « Simulation » (curseur de vitesse), « Journée » (curseur d'heure, case « Heure automatique », et case « Pluie » sur la même ligne dans le bassin, #106), « Eau » (#207 : indicateur global en toutes lettres et « Changer l'eau » sur la ligne du titre, curseur du chauffage, trois jauges `meter`), « Décor » (case « Afficher le décor », bouton « Éditer le décor » sur la ligne du titre, #167), « Sauvegarde » (#70 : état, « Exporter », « Importer » avec fichier plafonné avant lecture, message d'import) ; entrées depuis l'hôte, sorties vers l'hôte, aucune logique de simulation ; fermé par défaut |
| `ui/decor-editor/` | Panneau de l'éditeur de décor (#167, ADR 0043), à la place de « Réglages » en mode édition : outils (Sélection, Rocher, Grande plante, Touffe), « Supprimer » et Suppr / Retour arrière, « Terminer » et Échap, pose (#168 : −15°, +15°, Réduire, Agrandir ; flèches, + et −) ; aucune logique de simulation |
| `ui/commands-help/` | Aide-mémoire des commandes (#74, ADR 0020) : panneau généré par `helpSections()`, repliable par `?`, état mémorisé (`aqfish.aide-commandes`, repli en mémoire) ; contient le test d'exhaustivité des raccourcis |
| `ui/species-wiki/` | Wiki des espèces (#287, ADR 0066) : bouton « Wiki » (en bas à droite au-delà de 899 px, après « Réglages » en dessous), panneau à droite avec recherche, liste en deux parties et fiche ; « Ajouter au bac » (un individu, avertissements d'ajout #237) ; lot 2/2 (#291, ADR 0068) : comparaison avec l'eau du bac (entrées `waterTemperature`, `waterPh`), alimentation, cohabitation, pages « Produits et traitements » et « Maladies » ; Échap ferme la fiche ou la page, puis le wiki ; exclusif avec « Réglages », « Commandes » et l'éditeur de décor, à toute largeur (`App.onWikiOpened`) ; fermé par défaut |

Le renderer est créé par une fabrique (`AQUARIUM_RENDERER_FACTORY`, par défaut
`createWebGLRenderer`) : les tests `TestBed` la remplacent par un double, jsdom n'ayant pas
WebGL.

## Contrat de capture

Le harnais `frontend/e2e/captures.spec.ts` photographie l'application sous 5 angles, chaque
nuit, pour suivre l'évolution visuelle. Il repose sur ce contrat, que toute évolution doit
respecter :

| Élément | Règle |
|---|---|
| Paramètres d'URL | `capture`, `seed`, `camera`, `time`, et `filtre`, `heure`, `nourrir`, `population`, `environnement`, `granules`, `pluie`, `eau`, `affames`, `piece`, `meubles` et `vitesse` facultatifs, lus par `core/capture/capture-params.ts` |
| `environnement=` | En capture comme hors capture (#87, ADR 0026) : `tropical`, `bassin`, `paludarium` (#129) ou `recif` (#148) ; inconnu ou absent : bac tropical (séries existantes inchangées, à l'octet près). Sans `camera=`, vue par défaut de l'environnement (`top` pour le bassin, `three-quarter` pour le bac, le paludarium et le récif) |
| `population=` | En capture comme hors capture (#69, ADR 0025) : effectifs `espece:n` séparés par des virgules (`neon:12,guppy:2,corydora:0`), appliqués à t = 0 dans l'ordre de l'URL, bornés par `sim/species-catalog.ts` (#189 : `neon:9999` donne le maximum de l'espèce, #95). Entrée mal formée (n de plus de 6 chiffres compris) ou espèce inconnue ignorée, 10 au plus. Absent : population par défaut (séries existantes inchangées, à l'octet près) |
| `nourrir=` | En capture seulement (#67, ADR 0022) : dépôts de nourriture séparés par des virgules, `t` (centre du bac) ou `t:x:z` (temps simulé en s, position en m) ; rejoués au temps simulé de chacun avant le premier rendu (`advanceToWithFeedings`). Entrée invalide ignorée, 20 au plus. Absent : aucun granulé (séries existantes inchangées, à l'octet près) |
| `granules=` | En capture seulement (#117, ADR 0022) : rendu des granulés, `points` ou `voxels`. Absent ou invalide : points (séries existantes inchangées, à l'octet près) |
| `edition=<indice>` | En capture seulement (#167, ADR 0043) : mode édition du décor du bac tropical, élément d'indice donné de `World.decor` sélectionné (contour clair de 2 px). Absent, invalide ou hors du décor : aucune sélection (séries existantes inchangées) |
| `bois=x:z:rotation:echelle:graine` | En capture seulement (#169, ADR 0045) : bois flottés ajoutés au décor par défaut, séparés par des virgules (4 au plus). Entrée mal formée ou bois invalide (hors du bac, échelle hors bornes) ignoré ; absent : décor par défaut (séries existantes inchangées) |
| `bac=longueur:hauteur:profondeur` | En capture seulement (#171, ADR 0047) : dimensions du bac en mètres (trois réels décimaux positifs), bornées à `TANK_LIMITS` ; appliquées avant `bois=` et `population=`. Sans effet hors du bac tropical ; mal formé ou absent : dimensions de l'environnement (séries existantes inchangées) |
| `eau=bonne\|a-surveiller\|mauvaise` | En capture seulement (#207, ADR 0053) : eau d'exemple du niveau à t = 0 (`sampleWater`, nitrates à 1,25 fois le seuil), troublée si mauvaise. Valeur inconnue ou absent : eau saine (séries existantes inchangées, à l'octet près) |
| `affames=1` | En capture seulement (#208, ADR 0054) : animaux affamés de longue date à t = 0 (faim 1, santé au plancher : nage ralentie, couleurs ternies). Toute autre valeur ou absent : animaux nourris en pleine santé (séries existantes inchangées, à l'octet près) |
| `piece=1` | En capture seulement (#187, ADR 0048) : pièce autour du bac tropical affichée (sol, mur, meuble support) ; ailleurs ignoré. Toute autre valeur ou absent : pièce masquée (séries existantes inchangées, à l'octet près) |
| `meubles=type:x:z:quart` | En capture seulement, avec `piece=1` (#188, ADR 0049) : éléments lâchés dans la pièce dans l'ordre de l'URL (`dropRoomItem`), séparés par des virgules (8 au plus) ; type du catalogue (`etagere`, `table-basse`, `canape`, `plante-pot`), centre en mètres, quart de tour de 0 à 3. Mal formé, type inconnu ou pose refusée : ignoré ; absent : pièce nue (séries existantes inchangées) |
| `edition-meuble=<indice>` | En capture seulement, avec `piece=1` et `meubles=` (#188, ADR 0050) : mode édition, élément d'indice donné de la pièce sélectionné (même contour que `edition=`). Absent, invalide ou hors de la pièce : aucune sélection (séries existantes inchangées) |
| `pluie=1` | En capture comme hors capture (#106, ADR 0032) : il pleut dès le départ, dans un environnement qui le permet (le bassin) ; ailleurs ignoré. Gouttes et ronds au temps simulé `time`, déterministes. Toute autre valeur ou absent : pas de pluie (séries existantes inchangées, à l'octet près) |
| `filtre=pixel\|aucun` | Force le filtre de rendu (ADR 0010), y compris hors capture où il prime sur le choix mémorisé. Absent en capture : pixel art, quel que soit le choix mémorisé (séries existantes inchangées) |
| `heure=` | Réel dans [0, 24) (`0` : minuit, `18.5` : 18 h 30) : fige l'heure de la journée simulée (ADR 0018), en capture comme hors capture ; valeur invalide ignorée. Absent en capture : midi figé (séries existantes inchangées, à l'octet près) ; absent hors capture : départ à midi, journée de 1 200 s (20 min) simulées |
| `vitesse=` | Hors capture seulement (#232) : vitesse de la simulation au départ, l'une de `SIM_SPEEDS` (`0`, `0.5`, `1`, `2`, `4`), qui prime sur celle de la sauvegarde ; le curseur reste utilisable. `vitesse=0` : monde à l'arrêt dès t = 0, d'où des **captures d'interface** (panneau ouvert : `front-panneau`, `telephone-catalogue`, `telephone-eau`, `three-quarter-panneau-eau`, `telephone-fiche-espece`, `three-quarter-fiche-chirurgien` (#269) ; tableau de bord, #256 : `three-quarter-tableau-de-bord`, `tablette-tableau-de-bord`, `telephone-tableau-de-bord` et leurs variantes `-alerte`) reproductibles à l'octet. Sans effet en capture ; autre valeur ou absent : vitesse habituelle |
| `capture=1` | Simulation avancée de façon déterministe jusqu'à `time` (pas fixe, sans temps réel), puis figée ; interface masquée ; caméra sur le préréglage `camera` ; `devicePixelRatio` forcé à 1 |
| Signal « prêt » | Appeler `markCaptureReady()` (`core/capture/capture-ready.ts`) une fois la première image **complète** rendue ; `resetCaptureReady()` si la scène est rechargée. Implémentation : `AquariumHost` lève le signal à l'image qui suit le premier rendu WebGL de taille non nulle, et le retire à sa destruction |
| Image figée | En mode capture, une seule image est rendue (puis une à chaque redimensionnement) et les contrôles à la souris sont désactivés |
| Attributs de test | `app-aquarium-host` expose `data-aqfish-camera`, `data-aqfish-target`, `data-aqfish-tick`, `data-aqfish-seed`, `data-aqfish-filter`, `data-aqfish-hour` (heure affichée, 2 décimales), `data-aqfish-hour-frozen` (`true` si l'heure est figée) `data-aqfish-food` (nombre de granulés, #67) `data-aqfish-population` (effectifs `neon:12,guppy:6,corydora:6`, #69) `data-aqfish-environment` (`tropical` ou `bassin`, #87), `data-aqfish-speed` (vitesse de la simulation) et `data-aqfish-rain` (`true` s'il pleut, #106) |
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
- **Tableau de bord de l'eau** (`ui/dashboard-frame`, #256, ADR 0059) : cadre en bordure
  haute (ligne des boutons dès 1100 px, bandeau sous les boutons en deçà), jamais dans le
  rectangle central de 60 % × 60 %. Il lit deux signaux de l'hôte : `water` (relevé arrondi)
  et `waterSample` (relevé exact avec son pas), remplacés au plus 4 fois par seconde dans la
  boucle (`refreshDue`, 250 ms) ; niveaux, valeurs et tendances sont préparés par
  `sim/water-dashboard.ts`. Plan 0 : les panneaux flottants (plan 1) ouverts à la demande
  passent par-dessus ; un panneau ouvert par défaut ne le masque jamais (aide-mémoire décalé
  sur tablette). La section « Eau » du panneau « Réglages » ne garde que ce qui se règle.
  Le cadre montre aussi la simulation (moment de la journée, heure, vitesse) et, dans un
  bandeau bas au-dessus de la barre des vues (`dashboard-status`), la santé des animaux et au
  plus trois alertes avec cause et action (#260, ADR 0060). Synthèse de santé et alertes sont
  des fonctions pures (`sim/health-summary.ts`, `sim/dashboard-alerts.ts`) ; l'hôte expose
  le signal `health`, relevé avec l'eau et remplacé seulement si l'affichage change.
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

En CI (`.github/workflows/ci.yml`), les tests de bout en bout sont répartis sur 6 machines
en parallèle (`npm run e2e -- --shard=N/6`, délai de 45 min par part, #248), à côté d'un job pour formatage, lint, tests
unitaires et build, et d'un job pour les captures. Le job `frontend` regroupe les résultats :
c'est le contrôle exigé pour fusionner dans `main`. Un fichier de test e2e n'est jamais
découpé entre deux machines : garder des fichiers de taille raisonnable.

## Budgets

- Bundle initial : avertissement à 500 kB, erreur à 1 MB (`angular.json`).
- Moteur physique de l'éditeur (Rapier, ADR 0046) : hors du bundle initial, fragment chargé à
  la demande d'environ 4,3 MB (1,2 MB compressé). `npm run build` le vérifie
  (`postbuild` : `scripts/verifier-bundle-initial.mjs`).
- Objectif de fluidité : 60 images/s avec 200 poissons sur un portable de milieu de gamme,
  **mesuré par Mathis sur sa machine**, jamais dans l'environnement des agents.

## Backend

**NestJS**, introduit en phase 2 (voir `docs/adr/0004-backend-nestjs.md`). Pas de dossier
`backend/` en phase 1. Hébergement : GitHub Pages tant que possible, backend sur le NAS à
terme (ADR 0004).
