# 0115 — Animaux concernés par une alerte

- Statut : acceptée
- Date : 2026-11-08
- Auteur : Dev, cycle 175, issue #483

## Contexte

Lot 3/3 du tableau de bord (#251), après les ADR 0059 et 0060. Une alerte dit ce qui ne va pas
et quoi faire, mais pas quels animaux sont touchés. Contraintes : simulation inchangée et
déterministe, maillage des poissons intact, aucune mise en évidence par défaut ni en capture.

## Décision

- **Désignation** (`sim/alert-animals.ts`, pur) : `alertTargets` donne les identifiants et les
  espèces concernés par `health`, `hunger`, `ich`, `finRot`, `temperature`, `ph` et `mix`.
  Mêmes lectures que les alertes (`readHealth`, `readHunger`, stades visibles des maladies).
  Température : plage tolérée de la fiche d'espèce (`temperatureTolerated`). pH : hors plage
  tolérée s'il y en a, sinon hors plage idéale (alerte « attention »). Une mesure non finie
  désigne tous les animaux. Les autres alertes (composés, algues, traitement) n'en désignent
  aucun : ni ligne ni bouton.
- **Rythme** : l'hôte relève les désignations avec l'eau et aux changements de population, et
  ne notifie que si les identifiants changent (`sameAlertTargets`).
- **Détail déplié** : ligne « Animaux concernés : 12 néons, 6 corydoras » et bouton natif
  « Montrer les animaux », absent si la liste est vide. Annonce par une région `aria-live`
  distincte de celle des alertes, dont le texte ne doit changer qu'avec elles.
- **Mise en évidence** (`render/alert-highlight-layer.ts`) : flèche voxel jaune (`poissonJaune`)
  à contour sombre au-dessus de chaque animal, sans test de profondeur pour rester visible
  derrière les plantes, sans mouvement propre. Durée : 6 s de temps réel (`ALERT_HIGHLIGHT_MS`),
  pour rester valable simulation en pause ; elle cesse au changement de bac. Exposée par
  `data-aqfish-animaux-signales` (nombre d'animaux).

## Options écartées

- **Contour des poissons** : aurait modifié le maillage ou ses nuanceurs, et disparaît à la
  résolution d'un néon.
- **Mise en évidence au temps simulé** : elle ne finirait jamais en pause.
- **Désignation dans `DashboardAlert`** : les alertes ne connaissent que des synthèses ; y
  ajouter les animaux aurait rendu leur comparaison plus coûteuse à chaque relevé.

## Conséquences

Une nouvelle alerte qui vise des animaux s'ajoute à `TARGETED_ALERTS`. La couche reste masquée
sans désignation, donc les captures ne changent pas.
