# 0120 — Amorce de bactéries nitrifiantes

- Statut : acceptée
- Date : 2026-11-09
- Auteur : Dev, cycle 182, issue #529

## Contexte

L'issue demande un produit qui accélère la « maturation du filtre » sans changer le comportement
par défaut. Or `WaterState.filter` n'évolue jamais dans la simulation : il vaut 1 dans tout bac
créé par le jeu, et une valeur plus basse ne peut venir que d'une sauvegarde importée. Il n'y a
pas de courbe de maturation à accélérer.

## Décision

- **Réserve optionnelle** `WaterState.bacteriaStarter` (doses, absente par défaut), consommée à
  vitesse constante sur 7 journées simulées ; chaque dose entière rend 0,5 de filtre. Module pur
  `sim/bacteria-starter.ts`, appelé par `stepWaterInPlace`.
- **Abus bornés sans compteur de temps** : réserve plafonnée à 1 dose, et dose refusée tant que
  la réserve dépasse 0,5. Le délai entre deux doses découle de la consommation.
- **Filtre mûr (1) : dose refusée**, la réserve restante disparaît.
- **Changement d'eau** : dilue la réserve comme les autres produits (`docs/SOINS.md` § 12).

## Options écartées

- Faire démarrer les bacs neufs avec un filtre immature : changerait le comportement par défaut
  et les captures, exclus par l'issue. À décider dans une issue dédiée.
- Vitesse proportionnelle à la réserve : la surdose accélérerait la maturation.

## Conséquences

Tant que les bacs du jeu démarrent à `filter: 1`, le bouton répond « filtre déjà mûr » en partie
normale : le produit n'agit que sur un bac importé avec un filtre plus faible. La maturation
réelle du filtre reste à livrer pour qu'il serve.

Mise à jour (cycle 188, ADR 0123) : les bacs ajoutés par le joueur démarrent avec un filtre
immature qui mûrit seul ; l'amorce y sert en partie normale.
