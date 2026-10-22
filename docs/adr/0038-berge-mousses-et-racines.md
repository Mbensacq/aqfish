# 0038 — Paludarium : mousses et racines de la berge, aménagement fixe en voxels

- Statut : acceptée
- Date : 2026-10-23
- Auteur : Dev, cycle 49, issue #132

## Contexte

La berge du paludarium (ADR 0034) n'était que terre et roche. L'issue #132 la couvre de
tapis de mousse vert profond et de racines noueuses qui plongent dans l'eau, de façon
déterministe pour une graine, sans chevauchement, en nombre borné, sans toucher aux autres
environnements (captures identiques à l'octet) ni au flux de hasard du monde.

## Décision

- **Données pures** (`sim/bank-decor.ts`) : `bankDecorLayout(réglage, terrain, eau)` renvoie
  des racines (ligne brisée de `ROOT_SEGMENTS` tronçons, rayon décroissant de la base au
  bout) et des tapis de mousse (disques). Racines d'abord, puis tapis dans la place restante,
  par tirage avec rejet (`BANK_DECOR_ATTEMPTS` essais par élément, puis omission).
  - Un tapis est entièrement sur le sol émergé : centre et 24 points du bord contrôlés à
    1,05 fois le rayon (les cordes entre deux points contrôlés restent sur la terre).
  - Une racine part du sol émergé, à `ROOT_BASE_DISTANCE` du rivage, dans la direction de
    l'eau à ± `ROOT_MAX_ANGLE` près ; son bout est sous l'eau d'au moins `ROOT_TIP_DEPTH`.
    Elle repose sur le sol (enfoncée de `ROOT_SINK_RATIO` de son rayon), se voûte au milieu
    (`ROOT_ARCH`) et ondule latéralement (`ROOT_KINK`, nœuds), nul aux deux bouts. Elle reste
    à `ROOT_EDGE_MARGIN` des vitres.
  - Vus de dessus, deux éléments sont séparés d'au moins `BANK_DECOR_GAP` (distance exacte
    entre segments épaissis).
  - Bornes : au plus `MAX_ROOTS` (5) racines et `MAX_MOSS_PATCHES` (14) tapis, vérifiées par
    `assertBankDecorSettings`. Le paludarium vise 3 à 4 racines et 10 à 13 tapis.
- **Aménagement fixe, graine de l'environnement** (`Environment.bankDecor`, graine 132),
  comme le sol (ADR 0034) : pas de champ dans la sauvegarde, dessiné par la scène statique,
  aucun tirage dans le flux du monde. Le bac et le bassin ont `bankDecor: null`.
- **Rendu en voxels** (`render/bank-decor-mesh.ts`), éclairés comme le sol
  (`MeshLambertMaterial`, opaques) :
  - mousse en voxels de 1 cm (le pas de hauteur du sol) posés sur les colonnes **dessinées**
    (`terrainGrid`), pas sur la carte exacte : le tapis épouse les marches sans flotter.
    Bord en lobes et irrégulier, jamais hors du disque ; coussins d'un voxel de plus au
    centre. Dessus `vegetation` (30 % `vegetationClaire`), flancs `vegetation` ;
  - racines en voxels de 8 mm : centre à moins du rayon local de la ligne. Dessus
    `sableOmbre`, flancs `rocheSombre`. Sous l'eau, l'eau translucide les teinte, comme le
    fond.
- **Pas de brume ni de condensation** : optionnelles dans l'issue, elles auraient ajouté une
  surface translucide devant la scène, que la passe palette ramène à des couleurs imprévues
  (PIEGES, « Opacité partielle et passe palette »). Mousses et racines priment.

## Options écartées

- **Mousse comme couleur des colonnes du sol** (dessus des colonnes de 2 cm repeint) : pas de
  relief, et un bord en marches de 2 cm trop grossier pour un tapis.
- **Racines comme éléments `DecorItem`** (ADR 0015) : le décor est posé sur un sable plat
  (`decorBaseY`) et chaque élément a sa coque de contour ; une racine suit la pente de la
  berge et passe de l'air à l'eau.
- **Flancs de mousse en `vegetationSombre`** (premier essai) : moins éclairés, ils
  s'affichaient presque noirs en trois-quarts, et les tapis se lisaient comme des taches
  sombres.
- **Graine du monde** : le décor changerait d'un monde à l'autre et devrait sortir de la
  scène statique, sans bénéfice visible.

## Conséquences

- Mousses et racines ne sont pas des obstacles : grenouilles, tritons et axolotls les
  traversent (elles sont basses ; à reprendre si une espèce doit s'y percher ou s'y cacher).
- Changer le réglage ou la graine change les captures `paludarium-*`, pas les autres.
- Nouvelle capture `paludarium-three-quarter-sans-filtre` (teintes sans filtre, cf. #40).
