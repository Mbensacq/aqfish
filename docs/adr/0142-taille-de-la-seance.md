# 0142 — Taille de la séance d'entretien : une coupe par plante, un peu d'ammoniaque

- Statut : acceptée (complète les ADR 0138 et 0110)
- Date : 2026-11-15
- Auteur : Dev, cycle 224, issue #623

## Contexte

Lot 5 de l'épopée « Entretenir à la main » (#593) : l'étape « taille » de la séance guidée
(ADR 0138) reçoit son geste. La pousse des plantes à tige est un nombre réel de voxels par
plante (`WaterState.plantGrowth`, ADR 0110) ; le sécateur du mode Soins (section « Eau ») taille
déjà une plante cliquée (`prunePlantInPlace`, 80 % de la hauteur totale gardés) et marque
aussitôt la tâche `prune` au calendrier.

## Décision

1. **Geste** : à l'étape « taille », le sécateur est en main ; un clic ou un toucher sur une
   plante à tige la taille avec la règle existante (`prunedGrowth`), **cette plante seulement**.
   La plante est l'unité de coupe : son modèle voxel n'a pas de tiges ni de feuilles
   indépendantes dans la simulation (une pousse par plante).
2. **Déchet** : chaque coupe ajoute `PLANT_CUT_AMMONIA` (0,05 unité de jeu, **approximation de
   jeu**) d'ammoniaque, bornée à `MAX_CONCENTRATION` : la partie coupée se décompose, le filtre
   la transforme ensuite en nitrates par la nitrification existante.
3. **Séance** : les coupes sont comptées (`CareSession.cuts`, enregistré avec la séance ;
   absent dans une séance d'avant #623 : aucune coupe). « Étape terminée » n'apparaît qu'après
   une coupe et enregistre alors `prune` ; une étape sautée ne touche ni au calendrier ni à l'eau.
4. **Bac sans plante à tailler** (bassin, récif, bac sans plante à tige) : l'étape est sautée
   d'office (`skipAbsentCareSteps`) et le bilan n'a pas de ligne « taille ».
5. Le sécateur du mode Soins garde son comportement (pas de déchet, calendrier aussitôt).

## Options écartées

- **Couper une tige ou une feuille précise du modèle voxel** : demande une pousse par tige et
  un modèle de plante découpable, hors de la taille S du lot ; la plante entière reste l'unité.
- **Ajouter des nitrates directement** : court-circuite le cycle de l'azote simulé.
- **Déchet aussi au sécateur du mode Soins** : changerait un geste existant et ses tests hors du
  périmètre du lot ; à reprendre si le jeu doit unifier les deux gestes.

## Conséquences

- Tailler pendant la séance charge très légèrement l'eau (0,05 pour un seuil « à surveiller » à
  2) : visible seulement après de nombreuses coupes.
- Aucun changement de rendu hors séance : les captures existantes restent identiques.

## Complément (cycle 227, #644)

- **Écart des deux sécateurs, maintenu et assumé.** Le sécateur de la séance
  (`cutWorldPlantInPlace`) ajoute `PLANT_CUT_AMMONIA` ; celui du mode Soins
  (`pruneWorldPlantInPlace`) non. Décision : **ne pas** appliquer le déchet au mode Soins.
  Le mode Soins est le geste rapide d'entretien courant, réglé et testé depuis #477 (taille
  aussitôt inscrite au calendrier) ; la séance est le geste guidé qui montre le cycle de
  l'azote (phrase « pourquoi » de l'étape). Le déchet (0,05 par coupe pour un seuil « à
  surveiller » à 2) ne change pas l'équilibre d'un bac, mais l'ajouter au mode Soins changerait
  un comportement existant sans gain de jeu visible. Les deux fonctions partagent la même règle
  de coupe (`prunePlantInPlace`, `plantCuttable`) : seul le déchet diffère, et seulement ici.
  À reprendre si le jeu fusionne les deux gestes.
- **Rien à tailler.** Un bac qui a des plantes à tige (étape présente) mais aucune pousse que
  la taille raccourcirait (`worldHasCuttablePlants` faux : toutes à leur hauteur d'origine, ou
  presque) affiche la consigne « Aucune tige ne dépasse : rien à tailler pour l’instant, passez
  l’étape. » ; « Passer » reste le seul bouton, comme avant. Après une coupe, le compte des
  coupes l'emporte.
