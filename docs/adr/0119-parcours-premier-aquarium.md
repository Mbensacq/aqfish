# 0119 — Parcours guidé « Mon premier aquarium »

- Statut : acceptée
- Date : 2026-11-08
- Auteur : Dev, cycle 179, issue #512

## Contexte

Le guide du débutant (#240) explique, sans faire pratiquer. Il faut un parcours en cinq étapes
qui se valide en lisant l'état du bac, sans rien bloquer, sans toucher à la simulation ni aux
captures sans interface.

## Décision

- **Module pur** `sim/first-tank-path.ts` : un instantané du bac (`firstTankFacts`) fait avancer
  un état `{ version, startedAt, foodAtStart, done }`. Les conditions réutilisent l'existant :
  journal d'entretien (#513), compteur de granulés, seuils de `sim/water-quality`.
- **Une étape faite avant son tour compte** et reste faite (retirer ses poissons ne l'annule
  pas) ; l'étape affichée est la première non faite. Seul un bac revenu en arrière (temps ou
  granulés plus petits qu'au départ) relance le parcours.
- **« Cycler » est une approximation de jeu** : un quart de journée simulée, eau saine et filtre
  en marche. Le texte rappelle qu'un vrai filtre met 6 à 8 semaines.
- **Hors du monde pendant la partie** (`WeakMap` de l'hôte, piège du cycle 176) ; champ facultatif
  `World.firstTankPath` écrit à la sauvegarde automatique, à l'export et au changement de bac, avec
  son numéro `version`, comme `maintenance` et `waterHistory`. Pas de nouveau schéma global : une
  sauvegarde antérieure se lit sans parcours, un champ invalide est refusé.
- **Interface** : languette repliée par défaut en bordure gauche, sans voile ni focus imposé.
  « Masquer » désactive le parcours (préférence d'affichage, hors de la sauvegarde) ; le guide du
  débutant propose de le reprendre. Absente en capture, en mode décor, au récif et au paludarium
  (parcours prévus au sprint suivant).

## Conséquences

- Aucune allocation de vue à chaque relevé : l'état ne change que lorsqu'une étape est faite.
- Le parcours est par bac : un bac neuf a le sien.
- Un fichier exporté avant la première sauvegarde automatique ne perd rien : l'export écrit l'état.
