# 0048 — Pièce autour du bac : sol, mur et meuble support

- Statut : acceptée
- Date : 2026-10-24
- Auteur : Dev, cycle 64, issue #187

## Contexte

L'épopée v0.9 « L'éditeur » (idée de Mathis #35) demande un décor autour de l'aquarium.
L'issue #187 en pose la première moitié : un sol, un mur du fond et un meuble support sous
le bac tropical, **optionnels** (case « Afficher la pièce », désactivée par défaut), purement
graphiques, enregistrés avec la sauvegarde. Pièce masquée, le rendu doit être identique à
l'octet ; la simulation des animaux n'en dépend jamais.

## Décision

- **Modèle** (`sim/room.ts`, pur) : `Room = { shown, cabinetHeight }`. La hauteur du meuble
  (0,6 à 1 m, pas de 5 cm, 75 cm par défaut) est bornée par `clampRoom` comme les dimensions
  du bac (ADR 0047) : hors bornes, ramenée ; non finie, valeur par défaut. Pas encore de
  réglage dans l'interface : elle prépare les meubles de l'issue suivante et fixe la
  disposition. Pièce proposée dans le bac tropical seulement (`ROOM_ENVIRONMENTS`).
- **Disposition** (`roomBlocks`, pure) : des blocs alignés sur les axes aux cotes en
  centimètres entiers (`ROOM_VOXEL`), déduits des dimensions du bac du monde : plateau du
  meuble en y = 0 qui déborde de 2 cm, caisson, portes en nombre pair avec poignées, socle en
  retrait, sol en lames de parquet de deux teintes (hachage fixe), mur à 10 cm de la vitre
  arrière avec cimaise et plinthe. Aucun bloc n'entre dans le volume du bac (testé sur les
  bacs extrêmes).
- **Visibilité selon la caméra** (`roomVisibility`) : caméra sous le fond du bac (y < 0), la
  pièce est masquée (le meuble et le sol cacheraient tout, vue `bottom` identique à l'octet) ;
  caméra derrière le mur, le mur seul est masqué. Rien ne masque le bac sous aucun angle.
- **Rendu** (`render/room-layer.ts`) : deux maillages fusionnés à couleurs par sommet, prises
  dans la palette existante (aucune couleur ajoutée : ADR 0039, `docs/PIEGES.md`). Sol et
  meuble éclairés (`MeshLambertMaterial`), ils suivent le jour et la nuit comme la margelle.
  Mur et cimaise en couleurs plates (`MeshBasicMaterial`) : mur `koiNoir`, presque le fond de
  la scène, pour que l'eau vue devant lui reste verte ; cimaise `rocheSombre` et plinthe
  `sableOmbre` le rendent lisible. Pièce masquée : aucun maillage, racine invisible.
- **Sauvegarde** : champ `settings.room` facultatif, **sans changer de schéma** (comme
  `foodStyle` et `dimensions`) : absent (anciennes sauvegardes), pièce masquée ; présent, validé
  (`readRoom` : objet, `shown` booléen, hauteur finie, propriétés propres seulement) et borné.
  Toujours écrit. Le réglage est gardé hors du bac tropical, où rien n'est dessiné.
- **Capture** : `piece=1` (en capture seulement) affiche la pièce. Sept captures ajoutées
  (`*-piece`, dont `bottom-piece`, identique à `bottom`).

## Options écartées

- **Couleurs nouvelles pour la pièce** (parquet clair, mur crème) : une couleur ajoutée à la
  palette commune change les captures existantes ; un ton d'environnement du bac tropical
  aussi, pièce masquée comprise.
- **Mur éclairé** : éclairé de face par le seul ciel, un mur sombre retombait sur le fond de
  la scène ; un mur plus clair (`roche`, `rocheSombre` éclairé) faisait virer l'eau vue
  devant lui au gris (captures du cycle 64).
- **Sol et mur en un seul grand plan** : sans lames ni cimaise, l'échelle de la pièce ne se
  lit pas et le sol ressemble au fond de la scène.
- **Schéma de sauvegarde 2** : rendrait illisibles les sauvegardes existantes pour un champ
  facultatif qu'un ancien lecteur ignore sans risque.

## Conséquences

- Vue de dessus avec pièce : l'eau des vitres latérales, vue sur le parquet, est plus claire
  qu'au-dessus du fond de la scène (`eauClaire`) ; le bac reste cadré, rien ne masque les
  poissons.
- Les meubles déplaçables (issue suivante) pourront réutiliser `RoomBlock` et la hauteur du
  meuble ; l'éclairage propre de la pièce reste hors périmètre.
- La pièce s'étend de 3 m de chaque côté du bac et devant lui : elle remplit le cadre des
  préréglages ; en orbite très éloignée (zoom maximal), ses bords et le fond de la scène
  peuvent apparaître.
