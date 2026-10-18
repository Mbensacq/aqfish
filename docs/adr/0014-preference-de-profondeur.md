# 0014 — Préférence de profondeur des espèces de fond

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev (Claude), cycle 14 (issue #31)

## Contexte

Le corydora, troisième espèce, fouille le sable : il doit rester près du fond (critère : plus
de 80 % du temps sous 25 % de la hauteur d'eau) et remonter parfois brièvement vers la
surface. Jusqu'ici, toutes les espèces nageaient dans tout le volume, et l'évitement du fond
(portée `AVOID_ZONE`, 7 cm, ADR 0012) repoussait vers le haut tout poisson nageant à moins de
7 cm de sa limite basse : une préférence de profondeur se serait battue en permanence contre
lui (risque signalé dans l'issue).

## Décision

- **Schéma** : champ optionnel `depth` de `SpeciesDefinition` (`DepthPreference` :
  `maxHeightRatio`, `floorZone`, `ascentRate`, `ascentDuration`), vérifié par
  `validateSpecies`. Les espèces sans `depth` sont inchangées.
- **Bornes** (`swimBounds`) : deux champs de plus dans `SwimBounds`. `preferredMaxY` (hauteur
  au-dessus de laquelle l'espèce est tirée vers le bas, +∞ sans préférence) ; `avoid`, la
  boîte dont les parois repoussent le point visé : `hard` lui-même (même objet) sans
  préférence, ou `hard` au fond abaissé de `AVOID_ZONE − floorZone`, si bien que la portée
  effective de l'évitement du fond devient `floorZone` (1,5 cm pour le corydora) sans
  toucher aux vitres, à la surface ni aux obstacles. Naissance dans la tranche basse de
  `hard`.
- **Nage** (`stepFish`) : au-dessus de `preferredMaxY`, l'inclinaison visée glisse vers la
  descente (entièrement à 3 cm au-dessus) ; l'évitement garde la priorité, appliqué ensuite.
- **Remontées** : champ `ascent` du poisson (secondes restantes, 0 sinon). Déclenchement par
  un tirage du sous-générateur du poisson, **seulement pour les espèces avec `depth`** : les
  autres gardent exactement leur suite de tirages et leurs trajectoires. Pendant une remontée,
  inclinaison visée maximale et vitesse visée à mi-chemin entre croisière et maximum ; elle
  s'arrête à la limite `soft` de la surface ou au bout de `ascentDuration`.

## Options écartées

- **Borner `hard` en hauteur** pour le corydora : pas de remontée possible, et un poisson
  plaqué sur un plafond invisible (filet de sécurité sollicité en permanence).
- **Réduire `AVOID_ZONE` pour toutes les espèces** : change les trajectoires des néons et des
  guppys réglées au cycle 13 (#43).
- **Remontée à la vitesse maximale** : essayée ; le poisson arrivait trop vite près d'une
  vitre en sortie de remontée et touchait sa limite de nage (graine 42) ; la vitesse
  intermédiaire supprime ces contacts (test dédié).

## Conséquences

- L'état du poisson gagne un champ (`ascent`) : les mondes sérialisés changent de forme, pas
  les trajectoires des espèces existantes (tests « les corydoras ne changent pas la
  trajectoire des néons »).
- Toute future espèce de fond (crevettes, loches) réutilise `depth` sans nouveau code.
