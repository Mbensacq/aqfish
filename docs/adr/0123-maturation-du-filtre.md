# 0123 — Maturation du filtre des bacs neufs

- Statut : acceptée
- Date : 2026-11-10
- Auteur : Dev, cycle 188, issue #538

## Contexte

`WaterState.filter` valait 1 dans tout bac créé par le jeu et n'évoluait pas : l'amorce de
bactéries (ADR 0120) répondait toujours « filtre déjà mûr » en partie normale. L'issue demande
qu'un bac neuf démarre avec un filtre immature qui mûrit seul en 6 à 8 semaines (`docs/SOINS.md`
§ 2, « Cyclage », UF/IFAS FA16), sans changer les captures du bac par défaut ni les sauvegardes
existantes.

## Décision

- **Seuls les bacs ajoutés par le joueur** (`addTank`, catalogue « Bacs et meubles ») démarrent
  avec un filtre à `NEW_TANK_FILTER` (0,05) et la marque optionnelle `WaterState.cycling`. Le bac
  de départ (`createDefaultWorld`) est un bac déjà installé : filtre à 1, sans marque. Les
  captures et les sauvegardes antérieures (sans marque) ne changent pas.
- **Croissance logistique** `df/dt = r · f · (1 − f)`, intégrée sous forme exacte (indépendante du
  pas), module pur `sim/filter-maturation.ts` appelé par `stepWaterInPlace` après l'amorce. `r`
  mène de 0,05 à 0,99 en 56 journées simulées : ~0,9 à 5,5 semaines, ~0,95 à 6, mûr à 8. Le filtre
  passe alors à 1 et la marque disparaît. Plancher `FILTER_SEED` (0,01) : un filtre à 0 repart.
- **Amorce** : elle s'ajoute à la croissance (gain linéaire inchangé) et peut finir la maturation.
  Son message affiche l'efficacité du filtre en pour cent.
- **Changement d'eau** : ne touche ni au filtre ni à la marque (les bactéries vivent dans le filtre).
- **Sauvegarde** : `cycling` vaut `true` ou est absent ; toute autre valeur est refusée. Pas de
  migration.

## Options écartées

- Faire mûrir tout filtre inférieur à 1 : un bac importé avec un filtre plus faible changerait de
  comportement (les sauvegardes existantes doivent rester inchangées).
- Démarrer aussi le bac par défaut immature : ammoniaque et alertes dès qu'il est peuplé, captures
  modifiées, parcours « Mon premier aquarium » (ADR 0119) bloqué des semaines.
- Croissance dépendant de l'ammoniaque disponible (cyclage sans poisson) : plus juste, mais un bac
  vide ne mûrirait jamais sans nouveau geste ; reporté.

## Conséquences

- Peupler aussitôt un bac ajouté fait monter ammoniaque puis nitrites : c'est le « syndrome du bac
  neuf » attendu, que l'amorce et les changements d'eau atténuent.
- Le parcours « Mon premier aquarium » d'un bac ajouté attend un filtre à 0,5 (`CYCLE_MIN_FILTER`),
  soit environ 3 semaines simulées sans amorce.
