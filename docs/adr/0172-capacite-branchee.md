# 0172 — Capacité du bac branchée sur les compteurs, le bilan et l'import

- Statut : acceptée
- Date : 2026-11-24
- Auteur : Dev, cycle 291, issue #809 (tranche 2 de #729)

## Contexte

L'ADR 0171 a livré le calcul pur de la capacité (`canAdd`, `capacityStatus`, volume d'eau
réel) sans l'appeler. Cette tranche le branche : le joueur doit voir la capacité, être arrêté
par elle en mode soins, et savoir pourquoi.

## Décision

- **Effectifs maximaux** (`sim/tank-capacity-limits.ts`, `capacityLimits`) : pour chaque
  espèce du milieu, le plus grand effectif que `canAdd` accepte, la population des autres
  espèces comprise, au **plafond**. Il est ramené dans [effectif actuel, borne technique] : la
  capacité ne retire jamais un animal (bac trop plein d'une ancienne sauvegarde), et les
  plafonds techniques (`populationLimit`, plafond de la pièce, ADR 0096) restent à part. En
  mode décor, aucune contrainte. L'hôte publie ces maximums dans `populationMax` (curseur,
  champ, « + ») et les applique aussi dans `PopulationController.setPopulation`.
- **Raison du refus** : celle du verdict refusé (`canAdd`), affichée sous la tuile de l'espèce
  quand « + » est refusé à la borne ou après un ajout qui l'a atteinte
  (`data-capacity-refusal`). Elle porte sa source au nom court (« OATA », « RSPCA »,
  « approximation de jeu »).
- **Occupation et volume réel** (`capacityLine`) : une ligne en tête de la section
  « Population » de la fenêtre des réglages (`data-capacity`) et du bilan du bac
  (`data-review-capacity`) : « 63 % de la capacité : 179,3 L demandés pour 283,8 L d'eau
  réelle (288 L bruts, décor déduit) ». Attribut `data-aqfish-capacity` (pourcentage entier,
  `inf` sans eau) pour les tests.
- **Bac trop plein** (`capacityAlert`) : alerte dans la section « Population »
  (`data-capacity-alert`) tant qu'il l'est, et ajoutée au message d'import (fichier ou lien
  partagé). Rien n'est retiré.
- **Coût** : le volume réel construit les voxels du décor ; il est relu au relevé des effectifs,
  au réglage d'un effectif et à l'import, jamais dans la boucle d'affichage.

## Options écartées

- **Retirer les animaux en trop au chargement** : contraire à `docs/ECOSYSTEME.md` § 3.1
  (signaler, jamais corriger) et destructeur pour une sauvegarde.
- **Raison affichée en permanence pour chaque espèce bloquée** : un bac trop plein en
  afficherait une par tuile ; elle n'apparaît que sur demande (« + » refusé).
- **Alerte dans le tableau de bord** : les alertes y portent sur l'eau et la santé, avec leurs
  seuils (ADR 0117) ; la capacité est une règle d'ajout, lue là où l'on ajoute.

## Conséquences

- Le scénario S3 (120 L, deuxième poisson rouge refusé, OATA) est vérifié par test unitaire ;
  il n'est pas jouable dans l'interface : le poisson rouge ne vit que dans le bassin, de
  dimensions fixes (840 L). L'e2e vérifie le même comportement sur le bac tropical.
- Les bacs par défaut du bassin et du paludarium restent au-delà de leur capacité (ADR 0171) :
  leur section « Population » affiche l'alerte et refuse les ajouts. L'arbitrage (populations
  par défaut ou classes de densité sourcées, `docs/ESPECES.md` point 19) reste à faire.
