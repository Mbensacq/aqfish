# 0178 — Plantes flottantes : une forme de plante posée à la surface par son élévation

- Statut : acceptée
- Date : 2026-11-25
- Auteur : Dev, cycle 301, issue #824 (suite de #731)

## Contexte

L'absorption d'une plante flottante est chiffrée depuis l'ADR 0175
(`PLANT_UPTAKE_MG_N_PER_M2_DAY.flottante`, _Salvinia_, Reddy et De Busk 1985) et le refuge des
alevins est gradué par la masse des plantes (ADR 0176), mais aucune plante du décor ne flotte :
les formes sont `tall` (à tige) et `tuft` (touffe), toutes posées sur le sable. Le décor
(`DecorItem`, ADR 0015) ne connaît pas la hauteur de l'eau : la base d'un élément découle de
son type, plus une élévation (`elevation`, ADR 0046) quand il est posé sur un autre.

## Décision

- Nouvelle forme de plante `floating` (`sim/plant.ts`) : un radeau de salvinia en voxels
  généré par la graine, 7 à 11 frondes de 3 × 3 feuilles sur une rangée
  (`FLOATING_LEAF_ROW`), dans un disque de `FLOATING_RAFT_RADIUS` voxels, et une racine courte
  sous chaque fronde. Sans ondulation (`amplitude` 0). Les tirages des formes `tall` et `tuft`
  ne changent pas (même modèle à l'octet).
- **Pose à la surface par l'élévation** : une plante flottante reste un `DecorItem` de type
  `plant`, à l'élévation qui met le milieu de ses feuilles à la surface de l'eau
  (`floatingPlantElevation`, `floatAtSurface`). L'élévation est recalculée à la pose, au
  changement d'échelle et au changement de dimensions du bac. Aucun champ de sauvegarde
  nouveau : une sauvegarde ancienne se relit à l'identique, une plante flottante se relit à la
  surface.
- Elle **ne tombe pas** : pas de scène de chute (`decorDropScene` renvoie `null`), la pose sur
  le sable de repli la laisse inchangée (`groundDecorItem`), elle est toujours soutenue
  (`isDecorItemSupported`). Comme toute plante, elle ne porte rien.
- Collision : la petite sphère de collet d'une touffe, au bout de la racine du centre ; le
  feuillage est traversable. Un obstacle par élément de décor reste garanti.
- Absorption : type `flottante`, emprise 0,02 m² à l'échelle 1 (disque d'environ 8 cm de rayon,
  approximation de jeu) : à masse égale, 406 contre 125 mg N/m²/j pour une plante à tige.
- Refuge : sa masse compte dans la couverture d'un alevin proche (ADR 0176), sans règle
  particulière.
- Rendu : maillage voxel des plantes (`render/plant-model.ts`), placé par la couche du décor ;
  ombre plate sur le fond, un carré par feuille, couleur et décalage de l'ombre des nénuphars
  (`render/floating-plant-shadow.ts`).
- Éditeur : entrée « Salvinia flottante » du catalogue (`floating`).

## Options écartées

- **Une couche à part, comme les nénuphars** (disposition tirée de la graine du monde) : elle
  ne passerait pas par l'éditeur du décor, ni par l'absorption et le refuge, qui lisent le décor.
- **Base à la surface selon le type** (`decorGroundBaseY`) : il faudrait passer les dimensions
  du bac à toutes les fonctions du décor qui n'en ont pas besoin aujourd'hui (chute, rendu,
  volume d'eau).

## Conséquences

- Le bac par défaut n'a pas de plante flottante : les empreintes de non-régression ne changent
  pas.
- Une plante flottante ne dérive pas et ne prolifère pas (hors périmètre de #824).
- L'ombre garde la couleur de jour (celle des nénuphars suit la nuit) : à reprendre si elle se
  voit trop la nuit.
