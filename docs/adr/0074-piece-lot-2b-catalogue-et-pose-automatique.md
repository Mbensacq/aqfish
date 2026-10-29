# 0074 — Pièce de N bacs, lot 2b : catalogue dans l'interface, pose automatique, bacs posés figés

- Statut : acceptée
- Date : 2026-10-29
- Auteur : Dev, cycle 99, issue #305 (épopée #264)

## Contexte

L'ADR 0073 a livré le modèle des meubles supports et des bacs posés (lot 2a) et reporté au
lot 2b l'interface, le rendu, l'e2e et les captures de la pièce à deux bacs. L'hôte n'affiche
et ne simule qu'un monde (le bac affiché), plus les mondes rangés d'un environnement à
l'autre (ADR 0063) ; la sélection et la liste des bacs viennent au lot 3, la caméra libre
plus tard (#228). La dette #311 signale deux cas où la pièce devient insauvegardable ou lève
une `TypeError`.

## Décision

1. **Catalogue dans les réglages** : section « Bacs et meubles » du panneau, après « Décor »
   (l'ordre au clavier des sections précédentes ne change pas), seulement quand la pièce est
   affichée autour du bac tropical : boutons « Commode » et « Étagère basse »,
   choix de l'environnement (hors bassin), de la taille et du support (sol ou meuble) d'un
   bac vide, liste des bacs (affiché, rangé, posé ; nombre d'animaux) et des meubles avec
   « Retirer ». Le bac affiché ne se retire pas ; un meuble qui porte un bac non plus.
   Retirer un bac peuplé demande une **confirmation en ligne** (« Retirer avec N animaux » /
   « Garder »), sans boîte modale du navigateur : testable et accessible au clavier.
2. **Pose automatique** (`sim/room-layout.ts`, pur) au lieu d'une pose à la souris : un meuble
   va à la première place libre de l'aire de la pièce graphique (`roomArea`), du mur vers
   l'avant puis du centre vers les côtés, pas de 10 cm, avec 20 cm de jour si possible ; les
   meubles de la pièce graphique (`settings.room.items`) sont des obstacles. Un bac va au
   centre du plateau de son meuble (ou depuis le bord gauche si le plateau en porte plusieurs
   dans sa longueur), ou au sol comme un meuble. Toute pose est revalidée par
   `tankPlacementRefusal` / `supportRefusal` (ADR 0073).
3. **Bacs posés figés et non sélectionnables** jusqu'au lot 3 : `roomWorlds` n'affiche que les
   bacs à la position historique (la sélection enregistrée est gardée, l'affichage retombe sur
   le premier d'entre eux) ; `syncRoom` garde les bacs posés tels quels et ne fait correspondre
   par environnement que les bacs à la position historique. Deux bacs du même environnement
   sont donc permis dès lors que l'un est posé.
4. **Rendu simplifié** : meubles (plateau, caisson, portes, socle, aux couleurs du meuble
   implicite) et bacs posés (cadre noir, substrat, eau opaque à 90 % de la hauteur) en blocs
   au centimètre (`roomLayoutBlocks`), dessinés par la couche de la pièce avec le sol, dans le
   même maillage. Le choix à la souris ne les voit pas encore.
5. **Dette #311** : `addTank` refuse une taille hors catalogue (`position-invalide`) ;
   `tankResizeRefusal` refuse un redimensionnement qui ferait chevaucher la colonne du bac
   historique (ou un bac posé) avec un meuble ou un bac posé ; l'hôte l'applique avant
   `setTankDimensionsInPlace`.
6. **Capture** : `bacs=` (avec `piece=1`) ajoute meubles et bacs tropicaux vides dans l'ordre
   de l'URL, à la première place libre (`bacs=commode,moyen@0`). Sans `bacs=`, aucun bloc de
   plus : les séries existantes restent identiques à l'octet.

## Options écartées

- **Pose et déplacement à la souris** (glisser un bac comme un meuble de la pièce, ADR 0049) :
  il faut étendre le choix à la souris (`pickRoom`) aux blocs de la pièce de N bacs et gérer
  la caméra au-delà du bac affiché (#228) ; trop pour une PR de ce lot.
- **Rendre les bacs posés avec leurs animaux** (une seconde scène de bac) : coût de rendu et
  de simulation de N bacs, sujet du lot 4 (performance) ; le lot 3 décidera du bac affiché.
- **`window.confirm`** : bloque la boucle de rendu, mal testable, non stylable.

## Conséquences

- Les meubles de la pièce graphique posés **après** un meuble support peuvent le chevaucher
  (ils ne connaissent pas `RoomState`) ; le lot 3, qui dessinera la pièce depuis `RoomState`,
  unifiera les deux.
- Un bac posé est vide à l'ajout et figé : on ne peut pas encore le peupler (lot 3).
- Une pièce sans aucun bac à la position historique ne peut pas être affichée (`roomWorlds`
  lève, l'import est refusé) ; l'interface ne permet pas d'y arriver.
