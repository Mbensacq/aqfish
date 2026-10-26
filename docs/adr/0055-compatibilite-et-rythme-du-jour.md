# 0055 — Compatibilité des espèces et rythme du jour

- Statut : acceptée
- Date : 2026-10-26
- Auteur : Dev, cycle 73, issue #209

## Contexte

L'épopée « Le vivant » se termine par la compatibilité des espèces et des comportements
selon l'heure (#209) : les espèces incompatibles s'évitent, les poissons diurnes se reposent
la nuit (corydoras actifs), et le catalogue (ADR 0051) signale les mélanges déconseillés. Les
captures de jour par défaut doivent rester identiques à l'octet quand tout est compatible.

Chaque environnement n'accueille que ses espèces, et toutes y sont peuplées par défaut : un
couple incompatible accessible depuis l'interface passe donc forcément par une population
par défaut.

## Décision

- **Module pur `sim/compatibility.ts`** : tempérament par espèce (`TEMPERAMENTS`, table
  exhaustive par le typage) et verdict par couple `compatibility(a, b)`, symétrique : même
  espèce ou espèce inconnue, compatible ; prédateur et espèce **strictement plus petite**
  (`bodyLength`), `'predateur'` ; deux espèces territoriales différentes, `'territorial'`.
  Prédateurs : koï et axolotl ; territorial : poisson-clown ; les autres sont paisibles
  (approximations de jeu, d'après les conseils usuels de maintenance, non sourcés).
- **Conséquence voulue** : le paludarium par défaut est un mélange déconseillé (l'axolotl
  avec grenouilles et tritons, conseil courant de le garder seul). Bac tropical, bassin et
  récif par défaut sont compatibles.
- **Évitement, poissons nageurs seulement** : un terme d'éloignement ajouté au pilotage de
  banc (portée 30 cm, même forme que la séparation), puis une distance minimale de 15 cm
  imposée après la nage (`enforceRivalDistance`, jusqu'à 4 passes, bornes `hard`). Si aucun
  couple de nageurs incompatibles n'est présent (`hasRivals`), rien n'est calculé : nage
  d'avant au bit près. Marcheurs et amphibiens (axolotl, grenouille, triton) gardent leur
  déplacement propre : pas d'évitement pour eux dans ce cycle.
- **Rythme du jour** (`sim/day-rhythm.ts`) : la simulation reçoit l'horloge de la journée en
  paramètre facultatif (`step`, `advance`, `advanceInPlace`, `advanceTo`,
  `advanceToWithFeedings` ; `null` = plein jour). L'intensité du jour du pas
  (`dayIntensityAt(hourAt(horloge, time))`) donne un repos `1 − intensité` aux espèces
  diurnes (`DIURNAL`, corydoras exclus) : déplacement × (1 − 0,5 · repos) et descente
  au-dessus de 30 % de la hauteur de nage. Aucun tirage en plus : à midi (intensité 1),
  exactement la nage d'avant.
- **Libellé** : sous la population du panneau, une ligne par couple présent : « Mélange
  déconseillé : axolotls et tritons (prédateur) » (`mixWarningText`).

## Options écartées

- **Horloge dans l'état du monde** : changerait la sauvegarde et le contrat de capture ;
  l'horloge vit déjà dans l'hôte et la sauvegarde.
- **Table explicite par couple** : 36 couples à tenir à jour par espèce ajoutée ; un
  tempérament par espèce et deux règles suffisent.
- **Rendre un couple de nageurs incompatible dans une population par défaut** (par exemple
  le chirurgien territorial) : changerait les captures du récif sans fondement solide.

## Conséquences

- En pratique, aucune population accessible depuis l'interface n'a aujourd'hui deux
  nageurs incompatibles : l'évitement est prouvé par les tests sur des mondes composés
  (koïs et néons). Il servira dès qu'un environnement mêlera de tels nageurs.
- Le libellé du paludarium s'affiche sans que ses animaux s'évitent (marcheurs et
  amphibiens) : à traiter avec un évitement propre à `sim/axolotl.ts` et `sim/frog.ts`.
- Les captures à une autre heure que midi changent (nage de nuit) ; celles de midi, non.
