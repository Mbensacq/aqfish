# 0107 — Alevins de guppy : naissance sans état, croissance par l'âge, cachettes

- Statut : acceptée
- Date : 2026-11-06
- Auteur : Dev, cycle 156, issue #459 (épopée v1.11 « Reproduction et alevins »)

## Contexte

L'issue demande que les femelles de guppy en bonne santé, nourries et dans une eau conforme
mettent bas de 2 à 6 alevins, tirés de la graine ; que les alevins grandissent en 4 jalons
jusqu'à l'âge adulte, nagent près des plantes et soient mangés hors de leur protection ; que
le plafond de population tienne ; que sauvegarde, export et lien les conservent ; et que les
5 angles du bac par défaut restent identiques à l'octet.

## Décision

1. **Un alevin est un poisson de l'espèce** avec un champ facultatif `Fish.growth` (âge en
   secondes simulées, dans [0, `FRY_GROWTH_TIME`)). Il passe par le même pas, le même banc,
   la même santé que les adultes ; à `FRY_GROWTH_TIME` (1 200 s), le champ disparaît : c'est
   un adulte. Le rendu applique `fryScale` (`FRY_SCALES` : 0,5, 0,65, 0,8, 0,9 aux 4
   jalons) à la matrice de l'instance ; à 1 pour un adulte, la matrice est celle d'avant.
2. **Mise bas sans état** (`sim/fry.ts`, `stepBroodInPlace` dans `sim/world.ts`) : le temps
   est découpé en portées de `BROOD_PERIOD` (300 s) ; au dernier pas de chaque portée, chaque
   femelle adulte (apparence `femelle`, `speciesVariantIndex`) à santé pleine, sans points
   blancs, nourrie (faim strictement sous `FED_HUNGER` = 0,5, la faim de départ), dans une eau
   « bonne » au pH toléré met bas `broodSize` alevins, tiré du hachage (graine, mère, rang de
   la portée). Aucun tirage n'est pris aux générateurs des poissons : un bac sans mère
   possible avance exactement comme avant. Un bac jamais nourri n'a donc jamais d'alevin.
3. **Plafond** : chaque naissance vérifie `maxPopulation` de l'espèce et `MAX_TOTAL_FISH`
   (déplacé dans `sim/constants.ts` pour éviter un import circulaire, réexporté par
   `sim/population.ts`) ; les alevins comptent dans les deux.
4. **Cachettes et prédation** : un alevin vise un cercle lent autour de la plante du décor la
   plus proche, bas dans l'eau (`fryTarget`, la nourriture en vue l'emporte). Après la nage,
   un adulte nageur (ni marcheur ni amphibie) à moins de `FRY_EAT_RADIUS` (4 cm) d'un alevin
   à plus de `FRY_HIDE_RADIUS` (12 cm, à l'horizontale) de toute plante le mange. En mode
   décor, croissance, prédation et mise bas sont en pause comme l'eau et la santé.
   La prédation (`eatFryInPlace`) compare chaque alevin à chaque animal : coût en
   O(alevins × animaux), borné par `MAX_TOTAL_FISH` (60 animaux, au plus 3 600 distances
   par pas), sans grille. Elle ne tourne qu'en présence d'alevins et n'alloue rien : les
   plantes du décor (`fryPlants`) sont figées et mises en cache par tableau de décor (un
   décor modifié est un nouveau tableau), et la recherche du prédateur est une boucle
   (issue #470).
5. **Sauvegarde** : `growth` est écrit seulement pour un alevin et relu facultatif (schéma
   inchangé) ; une ancienne sauvegarde se relit sans alevin. Un âge hors bornes, ou un alevin
   d'une espèce non vivipare, est refusé.
6. **Capture** : `alevins=1` (capture seulement) fait mettre bas chaque femelle à t = 0,
   alevins répartis sur les 4 jalons (`broodWorldInPlace`) : `three-quarter-alevins`.

Toutes les valeurs sont des approximations de jeu (gestation réelle d'environ quatre semaines).

## Options écartées

- **Gestation avec état** (compteur par femelle) : plus fidèle, mais un champ de plus dans
  chaque sauvegarde de bac nourri et une durée à faire tenir dans le pas ; le calendrier
  suffit au jeu.
- **Entité distincte `Fry`** : dupliquerait le pas, le rendu et la sauvegarde des poissons.

## Conséquences

- Les alevins changent le nombre d'animaux du bac en cours de partie : l'interface lit déjà
  `populationCounts` à chaque image.
- Les autres vivipares (platy, molly…) n'auront qu'à rejoindre `FRY_SPECIES` s'ils ont une
  apparence `femelle`.
