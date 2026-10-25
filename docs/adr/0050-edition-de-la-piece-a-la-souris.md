# 0050 — Édition de la pièce à la souris

- Statut : acceptée
- Date : 2026-10-25
- Auteur : Dev, cycle 66, issue #188

## Contexte

L'ADR 0049 a livré le catalogue des meubles de la pièce et leur pose par gravité analytique,
sans interface. Le second temps de #188 demande de les ajouter, sélectionner, déplacer,
tourner et supprimer à la souris « comme pour le décor du bac », et de refuser ou corriger les
gestes qui laisseraient un élément en l'air ou traversé (cas 1 et 2 de #200).

## Décision

- **Un seul mode édition** : l'éditeur du décor (ADR 0043) gagne, pièce dessinée, quatre
  outils de plus (`Étagère`, `Table basse`, `Canapé`, `Plante en pot`) et un compte « Pièce :
  n / 24 meubles ». Une seule sélection à la fois, décor ou pièce ; mêmes gestes : clic pour
  poser ou sélectionner, glisser pour déplacer, ← → pour tourner, Suppr pour retirer,
  Échap pour désélectionner. Un meuble tourne d'un **quart de tour** et garde sa taille
  (boutons d'échelle inactifs).
- **Choix à la souris analytique** (`render/room-pick.ts`) : rayon contre les boîtes
  englobant tout le modèle de chaque meuble (`roomItemBounds`, feuillage compris, pour
  qu'une plante se sélectionne par ses feuilles), sinon contre le plan du parquet, borné à
  la pièce (`roomArea`). Le bac et son meuble cachent ce qui est derrière eux ; le sable du
  bac l'emporte s'il est plus proche. Pas de lancer de rayon Three.js : la pièce est un seul
  maillage fusionné (ADR 0048), et des boîtes alignées suffisent.
- **Poser sur un meuble** : avec un outil de la pièce, un clic sur un meuble pose au point
  visé ; l'élément tombe sur le plus haut dessus qu'il chevauche (`dropRoomItem`).
- **Glisser** : sur le plan horizontal de la base de l'élément, décalage du point saisi
  conservé ; chaque mouvement calcule la pose par `dropRoomItem` (avec `replace`) et en
  affiche l'aperçu (`previewRoom`) ; une pose refusée garde l'aperçu précédent. Au
  relâchement, la dernière pose acceptée est appliquée et enregistrée ; sinon la pièce
  revient à son état initial et le refus est affiché.
- **Contour de sélection** : coque « inverted hull » des blocs du meuble sélectionné, même
  matériau que la sélection du décor (`SELECTION_COLOR`, 2 px), normales aux coins dirigées
  hors de chaque bloc.
- **Gestes qui laisseraient un élément en l'air** (#200, cas 1) : un élément porté qui
  retomberait sur une plante sans place au parquet ne peut ni descendre (il traverserait la
  plante) ni rester : `dropRoomItem` refuse (`en-l-air`) et `removeRoomItem` rend `null`.
  On retire d'abord ce qui est porté.
- **Sauvegardes relues** (#200, cas 2) : `tidyRoom` repose les éléments (`settleRoomItems`),
  écarte, dans l'ordre de la liste, ceux qui chevauchent un élément gardé avant eux ou restent
  en l'air, jusqu'à une pièce posée ; une pièce cohérente est rendue à l'identique.
- **Capture** : `edition-meuble=<indice>` (avec `piece=1` et `meubles=`) montre le mode
  édition avec l'élément de la pièce sélectionné ; capture `three-quarter-meubles-edition`.

## Options écartées

- **Un second mode « édition de la pièce »** : deux boutons, deux panneaux et deux jeux de
  raccourcis pour des gestes identiques ; et l'utilisateur ne pourrait pas passer d'un
  rocher à un meuble sans changer de mode.
- **Corriger un geste « en l'air » en cherchant un support sous la plante** : impossible sans
  traverser la plante ; le refus est explicite et réversible.
- **Lancer de rayon sur un maillage par meuble** : un maillage et une géométrie par élément
  pour la seule sélection, alors que les boîtes donnent le même résultat à quelques
  centimètres près (cases vides d'une étagère).

## Conséquences

- La pièce n'a pas d'annulation : un geste accepté est enregistré aussitôt, comme le décor.
- Le contour suit chaque bloc du meuble (plateau et pieds d'une table ont chacun le leur) :
  plus lisible qu'un seul cadre autour d'une plante, mais plus chargé sur une table.
- Restent hors de ce cycle : reposer les éléments au redimensionnement du bac ou du meuble
  et l'échelle des plantes (#200, points 3 et 4).
