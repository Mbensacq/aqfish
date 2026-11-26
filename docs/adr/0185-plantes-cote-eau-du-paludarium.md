# 0185 — Plantes côté eau du paludarium, par défaut

- Statut : acceptée (complète les ADR 0034, 0046, 0178 et 0182)
- Date : 2026-11-26
- Auteur : Dev, cycle 312, issue #847

## Contexte

Depuis l'ADR 0182, le triton pond dans les feuilles immergées des plantes enracinées. Le
paludarium n'avait aucune plante dans son décor par défaut et son décor n'est pas éditable
(`EDITABLE_ENVIRONMENTS = ['tropical']`) : la ponte n'apparaissait qu'avec un décor importé.
Caudata Culture décrit pour _Cynops orientalis_ un bac « planté, avec plantes flottantes ».

## Décision

1. **Plantes par défaut, côté eau** : le décor par défaut du paludarium
   (`PALUDARIUM.decor`, `sim/environment.ts`) compte quatre plantes, sur des emplacements fixes
   (`PALUDARIUM_PLANT_SPOTS`) : deux plantes à tige (l'une sur la pente immergée, à l'échelle 0,8,
   l'autre sur le fond plat, à 0,9 : à l'échelle 1, celle de la pente sortait nettement de
   l'eau), une touffe et une plante flottante. Le décor reste non éditable.
2. **Suivre le sol** : `waterSidePlants` (`sim/water-side-plants.ts`) pose une plante
   enracinée à l'élévation (`elevation`, ADR 0046) égale à la hauteur du sol
   (`terrainHeightAt`) au-dessus du sable, arrondie au millionième ; une plante flottante à
   l'élévation qui fait affleurer ses feuilles (`floatingPlantElevation`, ADR 0178). Un
   emplacement côté terre (sol non immergé) lève `RangeError` : une plante ne peut pas
   quitter l'eau par erreur de données. Le décor produit est validé comme un décor chargé.
3. **Sauvegardes** : le décor est sauvegardé avec le monde ; une sauvegarde antérieure du
   paludarium garde son décor vide (aucune migration), un nouveau paludarium est planté.

## Options écartées

- **Décor du paludarium éditable côté eau** : demande de borner l'éditeur au côté eau,
  d'adapter la chute (ADR 0046) au sol en pente et les captures de l'éditeur ; bien plus
  large qu'une issue M, sans gain pour la ponte. À reprendre si le besoin apparaît.
- **Élévation calculée au rendu et dans la simulation** (le sol plutôt qu'une donnée) :
  toucherait `decorBaseY` et tous ses appelants pour un seul environnement ; l'élévation
  existe déjà pour un élément posé plus haut que le sable.
- **Plantes tirées de la graine du monde** : changerait le décor d'une graine à l'autre et
  les captures ; un aménagement fixe, comme les mousses de la berge, suffit.

## Conséquences

- Un couple de tritons nourris pond dans le paludarium par défaut, sans import (test).
- Empreintes de non-régression et captures du paludarium changées (plantes, obstacles,
  croissance des plantes à tige du paludarium) ; autres environnements inchangés.
- Caractérisation des sauvegardes (`sim/save-caracterisation.spec.ts`) : le décor d'avant
  #847 (vide) y est figé, comme les populations d'avant #811 ; ses résultats sont inchangés.
- Les plantes à tige du paludarium poussent (`GROWTH_ENVIRONMENTS`) comme au bac tropical.
