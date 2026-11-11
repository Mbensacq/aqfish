# 0132 — Croissance des alevins : trois étapes de taille et de couleur

- Statut : acceptée (complète l'ADR 0107)
- Date : 2026-11-11
- Auteur : Dev, cycle 199, issue #566

## Contexte

Depuis l'ADR 0107, un alevin (guppy né, ou corydoras éclos d'un œuf, ADR 0111) grandit en
4 jalons d'échelle (0,5, 0,65, 0,8, 0,9) et devient adulte, donc reproducteur (`canBreed`,
ponte des corydoras), à `FRY_GROWTH_TIME` (1 200 s). Sur les captures, les jalons 0,8 et 0,9
ne se distinguaient pas à quelques pixels de scène, et l'alevin avait déjà les couleurs de
l'adulte. L'issue #566 demande des étapes visibles, une couleur crédible et un âge adulte
sourcé ou annoncé comme approximation de jeu.

## Décision

1. **Trois jalons** (`FRY_STAGES = 3`, `FRY_STAGE_NAMES`) : nouveau-né, juvénile, subadulte,
   à l'échelle 0,45, 0,65 et 0,85 (`FRY_SCALES`) ; au moins 0,15 d'écart d'un jalon à
   l'autre et avec l'adulte (test).
2. **Pâleur par jalon** (`FRY_PALLORS` : 0,7, 0,4, 0,15 ; `fryPallor`, 0 pour l'adulte),
   fonction pure de l'âge dans `sim/fry.ts`. Le rendu mêle la couleur de chaque voxel au
   sable de la palette (`FRY_PALE_COLOR`) par un attribut d'instance (`aqfishFryPale`,
   `withFryPallor`), avant le ternissement et les maladies. Pâleur nulle : branche non
   prise, captures sans alevin identiques à l'octet.
3. **Âge adulte = âge reproducteur**, inchangé (1 200 s) : approximation de jeu, annoncée
   dans `sim/fry.ts` et la fiche du guppy ; les guides d'élevage situent la maturité
   sexuelle du guppy vers deux à trois mois.
4. Aucun champ nouveau : l'âge `Fish.growth` suffit, sauvegardes inchangées. Une sauvegarde
   antérieure se relit avec ses alevins répartis sur les trois jalons.

## Options écartées

- **Gris froid ou teinte d'eau** pour la pâleur : le gris se confond avec le ternissement
  d'un poisson malade ; la teinte d'eau (`eauTresClaire`, essayée sur capture) faisait
  passer la queue des alevins pour un reflet.
- **Couleur progressive continue** : invisible entre deux images à la passe palette ; trois
  paliers se lisent.

## Conséquences

- La capture `three-quarter-alevins` change ; `front-alevins` et `top-alevins` s'ajoutent.
- Vue de dessus, un alevin pâle sur le sable reste discret (camouflage crédible) ; la vue de
  face est celle qui montre les trois tailles.
