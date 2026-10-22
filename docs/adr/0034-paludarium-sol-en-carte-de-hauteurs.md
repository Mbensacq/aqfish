# 0034 — Paludarium : sol émergé décrit par une carte de hauteurs pure

- Statut : acceptée
- Date : 2026-10-22
- Auteur : Dev, cycle 43, issue #129

## Contexte

L'épopée v0.7 « Le paludarium » ajoute un troisième environnement (ADR 0026) : un bac vitré
dont une moitié est en eau et l'autre une berge de terre et de roche qui émerge, avec une
pente douce vers l'eau. Jusqu'ici, le sol était une dalle plate de `SAND_THICKNESS` et le
niveau de l'eau une constante commune (`WATER_LEVEL_RATIO`, 90 % de la hauteur). Les
espèces du paludarium (#130, #131) auront besoin de savoir, en tout point, où est le sol et
s'il est sous l'eau ; le rendu, de dessiner ce sol de côté (coupe), de dessus et en
trois-quarts. Contraintes : simulation pure et déterministe, couleurs de la palette,
captures du bac tropical et du bassin identiques à l'octet.

## Décision

- **Carte de hauteurs pure** (`sim/terrain.ts`) : `terrainAt(x, z, réglages, niveau)` donne
  la hauteur du sol, sa nature (`fond`, `terre`, `roche`) et s'il est sous l'eau. Le point
  est d'abord ramené dans le bac (bornée). Profil : fond plat côté eau (+X), montée en
  `t²` jusqu'au rivage (pente nulle au fond, plus raide au bord de l'eau), puis berge en
  `1 − (1 − t)²` qui s'adoucit vers le haut, côté terre (−X). La ligne de rivage ondule en
  z (deux sinusoïdes) et la berge porte de petits reliefs ; quelques bosses de roche
  dépassent de la terre. Ondulations et reliefs sont des sommes de sinusoïdes dont les
  phases sont tirées de la **graine du terrain** (`core/random/prng`) : même graine, même
  sol. Par construction, la hauteur est au-dessus du niveau de l'eau du côté terre du
  rivage et au-dessous du côté eau : le rivage est net.
- **La graine du terrain est une donnée de l'environnement** (`Environment.terrain`), comme
  celles des rochers du décor : un paludarium est un aménagement fixe, le même pour tous les
  mondes. La sauvegarde (ADR 0028) n'a aucun champ nouveau, et la scène statique, construite
  sans le monde, peut dessiner le sol.
- **Niveau d'eau par environnement** (`Environment.waterLevel`, fraction de la hauteur) :
  90 % pour le bac et le bassin (inchangé), 45 % pour le paludarium. `waterVolume` prend ce
  niveau en paramètre facultatif ; les couches qui lisaient `WATER_LEVEL_RATIO` (reflets de
  surface, nénuphars, clic sur l'eau) reçoivent la hauteur de la surface de la vue.
- **Rendu en colonnes** (`render/terrain-mesh.ts`) : le sol est échantillonné au centre de
  cellules de 2 cm, chaque colonne a une hauteur arrondie au centimètre (marches nettes en
  pixel art) ; seules les faces visibles sont émises (dessus, flancs plus hauts que la
  voisine, flancs du bord jusqu'à y = 0 pour la coupe derrière la vitre, un dessous d'un
  seul tenant). Une colonne émergée dépasse toujours l'eau d'au moins un cran, une colonne
  immergée reste sous la surface : le rivage dessiné est celui de la carte. Couleurs :
  fond `sable` (côtés `sableSombre`), terre `sableOmbre` (côtés `rocheSombre`), roche
  `roche` (côtés `rocheSombre`), dessous de la couleur du dessous du sol.
- **Eau du paludarium en retrait d'un millimètre** des vitres et des bords : les flancs de
  la berge, collés à la vitre, passent devant les faces de l'eau au lieu de les disputer à
  la profondeur. Le bac et le bassin gardent leur volume d'eau exact.
- **Contrat de capture** : `environnement=paludarium` (le paramètre existant, pas `env=`),
  vue trois-quarts par défaut. Le paludarium n'a ni bulles, ni caustiques, ni pluie, ni
  nénuphars, ni espèces pour l'instant ; un clic sur la terre ne dépose pas de nourriture.

## Options écartées

- **Graine du monde pour le terrain** : le sol changerait avec la graine, il faudrait le
  reconstruire à chaque nouveau monde et l'exposer à la scène statique, sans bénéfice
  visible.
- **Bruit de valeur sur une grille** (interpolé) : plus de code pour un relief que deux ou
  trois sinusoïdes rendent déjà irrégulier à l'échelle du bac.
- **Maillage lisse** (une surface interpolée) : facettes en biais, mal lues par la passe
  palette et étrangères au style voxel du décor (rochers).
- **Volume d'eau découpé selon le rivage** : un volume en escalier par colonne multiplierait
  les faces translucides superposées ; le retrait d'un millimètre suffit.

## Conséquences

- Les bornes de nage et la nourriture lisent encore le volume d'eau rectangulaire : la
  nourriture tombe jusqu'au fond même sous la pente immergée, et les futures espèces devront
  borner leur nage par `terrainAt` (#130, #131).
- Changer la graine, la pente ou le niveau change les captures `paludarium-*`, pas les
  autres.
- Mousses, racines et plantes terrestres (#132) se poseront sur `terrainAt`.
