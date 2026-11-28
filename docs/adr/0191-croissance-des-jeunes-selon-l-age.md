# 0191 — Croissance des jeunes selon l'âge, à l'échelle de rendu seulement

- Statut : acceptée (complète les ADR 0107, 0133 et 0187)
- Date : 2026-11-28
- Auteur : Dev, cycle 325, issue #876

## Contexte

Un alevin grandit en trois jalons de taille (0,45, 0,65, 0,85 de l'adulte, `fryScale`) pendant
`FRY_GROWTH_TIME` (un jour de jeu), puis perd son champ `growth` et saute d'un coup à la taille
adulte. Depuis le vieillissement (ADR 0187), un animal né au bac a une naissance `Fish.bornAt` :
son âge est connu à tout instant, mais la taille ne s'en servait pas.

## Décision

1. **Fonction pure `growthScale(âge, espèce)`** (`sim/fish-growth.ts`), dans [0,45, 1],
   croissante : les jalons de l'alevin pendant son premier jour, puis une droite de 0,85 à 1
   jusqu'à `GROWTH_SECONDS` (`GROWTH_DAYS` = 21 jours de jeu), puis 1. Âge non fini, espèce
   inconnue, marcheurs (crevettes, escargots) et amphibiens : 1 (hors périmètre de l'issue).
2. **Échelle de rendu seulement** : `bodyScale(poisson, temps)` remplace `fryScale` dans
   `render/fish-layer.ts`. Un alevin (champ `growth`) garde `fryScale` ; un animal sans
   naissance (monde neuf, sauvegardes antérieures) reste à 1 sans aucun hachage. La simulation
   (prédation, rayons, nage) ne lit rien de nouveau : empreintes de non-régression inchangées,
   aucun champ de sauvegarde ajouté.
3. **Temps de l'image** : le temps affiché (`BehaviorFrame.time`, déjà passé à la couche).
   Sans ce temps (appel direct sans geste), taille de `fryScale` comme avant.
4. **Exemple de capture `alevins=jeunes`** (`growWorldInPlace`) : la portée d'`alevins=1`, âges
   étalés sur les trois jalons puis au quart, à la moitié et aux trois quarts de la croissance du
   jeune ; capture `three-quarter-jeunes-platy`.

## Options écartées

- **Échelle continue dès la naissance** (courbe unique de 0,45 à 1 sur trois semaines) : les
  trois jalons de l'alevin, choisis pour se distinguer à quelques pixels (#566), auraient été
  écrasés vers 0,45-0,5 et toutes les captures d'alevins auraient changé.
- **Prolonger `Fish.growth` sur trois semaines** : `growth` définit aussi l'alevin (prédation,
  maturité, pâleur, sauvegarde bornée à `FRY_GROWTH_TIME`) ; le prolonger changeait la
  simulation et les sauvegardes.
- **Hitbox à la taille** : la prédation et l'évitement lisent des rayons fixes ; les réduire
  changeait le monde et les empreintes pour un effet invisible.
- **Durée proportionnelle à la durée de vie** : un clown (vie longue) aurait mis des mois de jeu
  à grandir, un guppy quelques jours ; une durée commune est plus lisible et reste sous l'âge
  adulte du monde neuf de toute espèce (test `fish-growth.spec.ts`).

## Conséquences

- Un jeune né au bac reste visiblement plus petit que ses parents pendant trois semaines de jeu.
- Durées : approximations de jeu (croissance réelle d'un platy ou d'un guppy jusqu'à la taille
  adulte : de l'ordre de trois à quatre mois, non chiffrée dans une source du projet).
- Un corps (`World.dead`) d'un jeune est dessiné à la taille de son âge au temps affiché.
