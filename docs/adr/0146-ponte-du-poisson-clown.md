# 0146 — Ponte du poisson-clown : œufs collés près de l'anémone, larves qui quittent le bac

- Statut : acceptée (complète l'ADR 0111)
- Date : 2026-11-16
- Auteur : Dev, cycle 231, issue #653

## Contexte

Épopée v1.22 « Reproduction et vie du bac » : le récif n'avait aucune reproduction. Les œufs
des corydoras (`sim/eggs.ts`, ADR 0111) et les alevins des guppys (`sim/fry.ts`) existent ; il
fallait réutiliser leurs patrons sans en inventer un troisième, et sans élever de larves
(planctoniques dans la nature, hors périmètre).

## Décision

1. **Même calendrier, mêmes conditions** : le poisson-clown rejoint `EGG_SPECIES` (même
   période `SPAWN_PERIOD`, même couple minimal, mêmes adultes en forme, même eau bonne et même
   pH toléré). Seule la température change, par espèce (`spawnTemperature`) : 24–28 °C, la plage
   tolérée de la fiche, au lieu des 22–26 °C du corydoras.
2. **Surface** (`layReefClutch`) : une anémone est tirée de la ponte (hachage, aucun tirage
   pris aux poissons). Si un rocher du décor est à moins de `REEF_ROCK_REACH` (30 cm) d'elle, la
   grappe est collée sur le flanc de sa sphère de collision la plus proche d'un point au ras du
   sable sous l'anémone (`'rocher'`) ; sinon sur le sable à `REEF_SAND_DISTANCE` de l'anémone
   (`'sol'`). Sans anémone (absente, nulle ou vide), aucune ponte.
3. **Ni prédation ni alevin** : les œufs du rocher et du sol ne sont pas mangés (ponte gardée
   par le couple ; la prédation ne vise que la vitre). À `EGG_HATCH_TIME`, l'œuf disparaît :
   `hatchesToFry` est faux, aucun alevin, et la sauvegarde refuse `growth` pour un clown.
4. **Plafonds** (ADR 0111, révisé au cycle 240, #662) : les œufs d'une espèce **sans alevin**
   (`hatchesToFry` faux : larves du clown qui quittent le bac, œufs du poisson rouge) ne
   comptent **pas** dans `maxPopulation` de l'espèce, puisqu'aucun ne deviendra un poisson du
   bac ; seuls les animaux y comptent. Ils restent comptés dans `MAX_TOTAL_FISH` (œufs et
   animaux du bac) et dans `MAX_EGGS` (30 œufs), qui bornent toujours le coût de rendu et de
   simulation. Les œufs d'une espèce à alevins (corydoras) comptent toujours dans son plafond.
   Avant ce changement, la ponte du clown était presque toujours réduite (5 œufs au lieu de 4 à
   10 avec les 3 clowns du récif par défaut, réserve QA du cycle 231).
5. **Sauvegarde** : deux surfaces nouvelles (`'rocher'`, `'sol'`) dans `EGG_SURFACES` ; schéma
   inchangé, champ `eggs` toujours facultatif.
6. **Rendu** : œuf `clownOrange`, `tritonOrange` à la seconde moitié de l'incubation. Quand le
   bac porte une ponte de clown, la couche des œufs passe dans la file des transparents
   (opacité pleine), dessinée après l'eau et le verre comme les poissons ; sous l'eau bleue du
   récif, l'orange virait sinon au rose pâle. Les œufs des corydoras restent dans la file
   opaque : images inchangées. Le calque ne compare aucun identifiant d'espèce
   (`eggDrawnAfterWater`, cycle 240) : sont dessinés après l'eau les œufs des espèces de
   `REEF_EGG_SPECIES` et `VEGETATION_EGG_SPECIES` (`sim/eggs.ts`), en orange ceux de la
   première liste.
7. **Capture** : `recif-three-quarter-oeufs` (`oeufs=1`, graine fixe 7 : avec la graine 42, la
   ponte est sur la face cachée d'un rocher).

Rythme, nombre d'œufs et incubation sont des approximations de jeu (une vraie ponte compte
plusieurs centaines d'œufs et éclot en une semaine environ, non vérifié ici).

## Options écartées

- **Garder les œufs sans alevin dans `maxPopulation`** (choix initial) : la ponte était
  tronquée sans raison biologique ; `MAX_EGGS` et `MAX_TOTAL_FISH` suffisent à borner le coût.

- **Œufs sur l'anémone elle-même** : les poissons-clowns pondent à côté de leur hôte, pas
  dans les tentacules ; et la grappe y disparaîtrait dans l'ondulation.
- **Larves nageuses** : une phase planctonique demanderait une nage passive et une mortalité
  propres, hors périmètre de l'issue.
- **Matériau transparent pour tous les œufs** : changeait les captures des corydoras sans
  besoin.

## Conséquences

- Un récif nourri voit des pontes apparaître, sans changement d'effectif.
- Une autre espèce du récif qui pond près d'une anémone n'a qu'à rejoindre `REEF_EGG_SPECIES`.
