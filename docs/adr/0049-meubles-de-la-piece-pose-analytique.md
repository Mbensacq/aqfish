# 0049 — Meubles de la pièce : catalogue voxel et pose par gravité analytique

- Statut : acceptée
- Date : 2026-10-25
- Auteur : Dev, cycle 65, issue #188

## Contexte

La pièce autour du bac tropical (ADR 0048) n'a qu'un sol, un mur et le meuble support.
L'issue #188 (idée de Mathis #35) y ajoute un petit catalogue de meubles et de plantes
d'intérieur, posés « par gravité » comme le décor du bac (ADR 0046) : lâché, un élément tombe
et se pose sur le parquet ou sur un meuble, sans interpénétration ; même décor et mêmes
gestes, même pose. La pièce reste purement graphique.

## Décision

- **Modèle** : `Room.items` (facultatif) liste des `RoomItem` : type du catalogue, centre de
  l'emprise (x, z, repère du bac, au centimètre), quart de tour (0 à 3) et `elevation`
  (hauteur de la base au-dessus du parquet, omise au sol). Absent ou vide : rien n'est
  écrit, la pièce d'avant #188 est identique à l'octet (sauvegarde et captures). 24 éléments
  au plus.
- **Catalogue** (`sim/room-furniture.ts`, `ROOM_CATALOG`) : étagère à deux rayons garnie de
  livres (80 × 30 × 80 cm), table basse à tablette (100 × 50 × 40), canapé deux places
  (180 × 80 × 80), plante en pot (pot de 32 × 32 × 34, feuillage jusqu'à 96 cm). Modèles en
  blocs aux cotes en centimètres entiers, dessinés par la couche de la pièce avec les
  couleurs de la palette existante (aucune couleur ajoutée) : bois `sableSombre` /
  `sableOmbre`, canapé dans les tons de l'eau, pot `roche`.
- **Collision** : une **boîte alignée sur les axes** par élément, tournée par quarts de tour.
  Celle de la plante est son pot : le feuillage reste traversable, comme celui des plantes du
  bac (ADR 0046), et **rien ne se pose sur une plante** (pose refusée).
- **Pose par gravité analytique**, sans moteur : l'élément descend verticalement et se pose
  sur le dessus de la plus haute boîte que son emprise chevauche, ou sur le parquet
  (`dropRoomItem`). Exact pour des boîtes alignées, instantané, toujours disponible (pas de
  repli à prévoir), pur et déterministe ; par construction, deux éléments ne
  s'interpénètrent jamais (test sur 40 lâchers serrés).
- **Refus** : pièce pleine, emprise hors de la pièce (au-delà des 3 m de marge, dans le mur
  ou sa plinthe), sur le meuble du bac (il est sous le bac), sur une plante, pile plus haute
  que le mur.
- **Support retiré** (#182 transposé) : après chaque retrait ou remplacement, les éléments
  qui ne reposent plus sur rien retombent, du plus bas au plus haut (`settleRoomItems`,
  cascade) ; un élément soutenu garde sa pose à l'identique. Un élément déplacé ou tourné
  n'est pas arrêté par ce qu'il portait (`carriedBy`) : tourné sur place, une étagère garde
  sa plante ; déplacée, la plante tombe.
- **Capture** : `meubles=type:x:z:quart,…` (avec `piece=1`) lâche les éléments dans l'ordre ;
  cinq captures `three-quarter-meuble*` (un élément chacun, puis deux empilements).

## Options écartées

- **Rapier, comme dans le bac** : utile pour des sphères et des rochers irréguliers ; pour
  des boîtes alignées qui ne tournent pas, le résultat est connu d'avance (dessus de la plus
  haute boîte), sans chargement de 1,2 MB compressé, sans pas de simulation ni tolérance de
  contact. Le moteur reste chargé à la demande pour le décor du bac (bundle initial
  inchangé).
- **Rotation libre** : il faudrait des boîtes orientées et une pose sur des dessus inclinés ;
  le quart de tour suffit pour des meubles posés contre un mur.
- **Collision sur le volume du feuillage** : un élément lâché sur une plante se poserait sur
  ses feuilles.

## Conséquences

- **Interaction non livrée dans ce cycle** (PR en deux temps, comme le suggère l'issue) :
  l'éditeur (ajouter, déplacer, tourner, supprimer à la souris), son test de bout en bout
  et le picking du parquet restent à faire ; le modèle, la pose, la sauvegarde et le rendu
  sont prêts pour eux.
- Le redimensionnement du bac ou du meuble ne relâche ni ne refuse rien : un élément peut se
  retrouver contre ou dans un meuble plus large (comme le décor du bac, ADR 0046).
