# 0047 — Dimensions réglables du bac

- Statut : acceptée
- Date : 2026-10-24
- Auteur : Dev, cycle 60, issue #171

## Contexte

L'épopée v0.9 « L'éditeur » demande un éditeur de bac. Jusqu'ici, la géométrie d'un monde
était entièrement déduite de son environnement (`World.environment` → `Environment.dimensions`) :
volume d'eau, bornes de nage, sol des espèces du fond, disposition des coraux, validation du
décor, sauvegarde et rendu lisaient tous `environmentById(id)`. L'issue #171 rend réglables
la longueur, la largeur et la hauteur du **bac tropical** seulement, sans changer les mondes
existants ni les captures aux dimensions par défaut.

## Décision

- **Bornes** (`sim/tank.ts`, `TANK_LIMITS`) : longueur 60 à 200 cm par pas de 10, hauteur 50
  à 90 cm par pas de 5 (au moins 50 cm : la plus haute plante, 45 voxels de 8 mm sur le
  sable, reste sous l'eau ; à 40 cm, elle sortait du bac), profondeur 30 à 90 cm par pas de 5. `clampTankDimensions` borne et
  ramène au pas (arrondi au micron) : une valeur hors bornes est ramenée, jamais refusée ;
  une valeur non finie prend celle de `DEFAULT_TANK`, qui tombe sur un pas de chaque axe.
- **Le monde porte ses dimensions** : `World.dimensions?` facultatif. Absent, ce sont celles
  de l'environnement : un monde jamais redimensionné est identique à celui d'avant (même
  objet, même sauvegarde, mêmes pas, mêmes captures).
- **Lieu** (`sim/environment.ts`) : `Place = EnvironmentId | TankPlace`, où
  `TankPlace = { environment, dimensions? }` ; un `World` en est un. Les fonctions qui
  prenaient un identifiant d'environnement (`environmentWater`, `boundsFor`, `spawnEntity`,
  `createWorld`, `seededFeatures`, l'édition et la chute du décor) acceptent un lieu ;
  passer un identifiant reste valable. `placeDimensions`, `placeEnvironment`, `placeKey`.
- **Tables calculées une fois** (bornes de nage, tranches d'alimentation, sol, eau) : clé
  `placeKey`, l'identifiant seul sans réglage (aucune allocation), sinon identifiant et
  dimensions. La clé est calculée **une fois par pas** (`stepInPlace`), pas par poisson.
  Tables vidées au-delà de `PLACE_CACHE_LIMIT` (256) entrées.
- **Redimensionner** (`sim/tank-resize.ts`, `setTankDimensionsInPlace`) : chaque élément du
  décor est ramené dans le bac compte tenu de son emprise (`clampDecorPosition`, inchangé
  s'il tient déjà) ; graine, forme, rotation et échelle ne changent pas, l'élévation est
  bornée à la hauteur. Obstacles recalculés (`createWorld`). Chaque poisson (position
  courante et précédente) est ramené dans sa zone de nage dure, chaque granulé dans l'eau
  (`restY ≤ y ≤ floatY`). Population, identifiants, temps et générateurs inchangés.
- **Bulles** : le diffuseur suit l'échelle du bac (`bubbleSourceFor`, exactement la position
  par défaut aux dimensions par défaut) ; `MAX_BUBBLES` est dimensionné pour le plus haut
  bac (`MAX_TANK`) ; une bulle qui dériverait contre une vitre d'un bac étroit la longe
  (jamais le cas dans le bac par défaut).
- **Sauvegarde** : champ `dimensions` facultatif, **sans changer de schéma** (comme
  `foodStyle`, issue #117) : absent, ce sont celles de l'environnement ; présent hors d'un
  environnement réglable, refusé ; hors bornes, borné. Poissons, granulés et décor sont
  validés dans les dimensions lues.
- **Rendu** : la vue reçoit l'environnement aux dimensions du monde (`placeEnvironmentData`)
  et calcule l'eau avec `environmentDataWater`. Changer les dimensions **recrée la vue**,
  comme un changement d'environnement : scène, parois, eau, sable, caméra et préréglages
  sont recalculés à partir des dimensions (`render/camera-presets.ts` n'avait aucune
  constante en dur).
- **Interface** : trois curseurs (« Dimensions du bac ») dans l'éditeur de décor, appliqués
  au relâchement (`change`) ; le monde est enregistré aussitôt. Capture : `bac=L:H:P`.

## Options écartées

- **Nouvel environnement par dimensions** : les environnements sont des constantes
  partagées ; en fabriquer à la volée aurait cassé l'égalité par identifiant partout.
- **Schéma de sauvegarde 2** : aurait rendu illisibles par l'application les sauvegardes
  écrites avant, pour un champ facultatif que l'ancien lecteur ignore sans risque.
- **Mise à l'échelle de tout le décor** : changerait la forme des éléments (graine et
  échelle doivent rester), et un élément qui tient déjà ne doit pas bouger.
- **Redimensionner la vue sans la recréer** : demandait de reconstruire à la main parois,
  eau, sable, caustiques et diffuseur ; recréer la vue réutilise un chemin déjà testé.

## Conséquences

- Un poisson ramené contre une vitre en est éloigné par la nage habituelle ; un élément du
  décor ramené peut en chevaucher un autre (chevauchement hérité, accepté comme au
  chargement, ADR 0044).
- Le plus petit bac (60 × 50 × 30 cm) est serré pour le décor par défaut : les éléments se
  rapprochent du centre et peuvent se chevaucher.
- Les autres environnements (bassin, paludarium, récif) gardent leurs dimensions ; les
  étendre consiste à les ajouter à `RESIZABLE_ENVIRONMENTS` et à vérifier leurs coraux,
  berge et bordure.
