# 0081 — Pièce complète, lot 1 : murs, plafond et poutres

- Statut : acceptée
- Date : 2026-10-30
- Auteur : Dev, cycle 108, issue #324

## Contexte

La pièce autour du bac tropical (ADR 0048 à 0050, 0073 à 0076) n'a qu'un sol, un mur du fond
et des meubles. L'idée de Mathis #227 demande une pièce complète, découpée en trois lots ; le
premier (#324) la ferme : quatre murs, un plafond et des poutres apparentes en bois. Pièce
masquée, rien ne doit changer (captures à l'octet, sauvegardes inchangées).

## Décision

- **Dimensions** : celles de la pièce existante, sans nouveau réglage ni champ de sauvegarde.
  `roomInterior(dims)` (pur) donne les faces intérieures : murs latéraux et mur d'en face sur
  les bords du parquet (`ROOM_MARGIN` des côtés et de la vitre avant), mur du fond inchangé,
  plafond à `WALL_RISE` au-dessus du haut du bac (hauteur du mur du fond), dessous des poutres
  à `BEAM_DROP` (18 cm) sous le plafond. Les murs sont **hors** de l'aire du parquet : l'aire
  des meubles (`roomArea`), la pose et le choix à la souris sont inchangés.
- **Blocs** (`roomBlocks`) : trois murs de 5 cm, du dessous du parquet au plafond, les murs
  latéraux couvrant les coins ; plafond de 5 cm couvrant les murs ; poutres de 14 cm selon Z,
  du mur du fond au mur d'en face (portée la plus courte), en nombre `round(largeur / 1 m)`
  (au moins deux), à entraxe égal au centimètre, une demi-travée contre chaque mur latéral.
  Chaque bloc de l'enveloppe porte sa paroi (`RoomBlock.shell` : `fond`, `gauche`, `droite`,
  `avant`, `plafond`) ; les autres blocs n'en ont pas (objets identiques à avant).
- **Visibilité** (`roomVisibility(dims, y, z, x)`, `isShellVisible`) : sous le fond du bac,
  rien (inchangé) ; sinon chaque mur est masqué dès que la caméra a franchi sa face
  intérieure, le plafond et ses poutres dès qu'elle atteint le dessous des poutres. De
  l'intérieur, tout est affiché ; vue de l'extérieur, le mur proche et le plafond ne cachent
  jamais le bac. La vue `top` par défaut (caméra à ≈ 2,4 m, plafond à 1,8 m) est au-dessus du
  plafond : il y est masqué.
- **Rendu** : une géométrie fusionnée par paroi (cinq maillages de plus au plus, construits
  une fois par `setRoom`), toutes en couleurs plates comme le mur du fond
  (`MeshBasicMaterial`) : mur d'en face `koiNoir` comme le fond, murs latéraux `fondScene`
  (teinte 1 de `mur`, plus sombre, « à l'ombre ») pour que les coins se lisent ; ces deux tons
  gardent la teinte de l'eau vue devant eux (piège de l'ADR 0048). La cimaise du fond est
  reprise sur le mur d'en face, pas sur les murs latéraux : en vue de côté, elle traversait
  l'eau du bac (`docs/PIEGES.md`). Plafond `rocheSombre` ; poutres en deux tons de bois alternés
  (`sableOmbre`, `sableSombre`). **Aucune couleur ajoutée** à la palette (ADR 0039).
  `setViewpoint` ne fait qu'un test par paroi à chaque image, sans allocation.

## Options écartées

- **Plafond et poutres éclairés** (`MeshLambertMaterial`) : la lumière du jour vient d'en
  haut ; leurs faces vues d'en dessous tomberaient sur le fond de la scène.
- **Poutres selon X** (parallèles au mur du fond) : portée de 7,2 m dans la pièce par
  défaut, contre 3,6 m selon Z ; vue de côté, des poutres selon Z se lisent en enfilade.
- **Une seule géométrie masquée par plages (`drawRange`)** : un mur masqué au milieu de la
  liste demande des groupes et un matériau par groupe ; cinq maillages coûtent cinq appels de
  dessin, négligeables devant le bac.
- **Réglage de la hauteur sous plafond** : hors périmètre du lot ; la hauteur suit celle du
  mur du fond, déjà en place.

## Conséquences

- Une pile de meubles peut monter jusqu'au haut du mur (`dropRoomItem`) et donc entrer dans
  les poutres : cas limite (pile de plus de 2 m), à reprendre si le lot 3 ajoute des meubles
  hauts.
  Mise à jour (#336) : la pose est désormais bornée sous le dessous des poutres
  (`roomInterior(dims).beamY`) ; le mur du fond se masque sur sa face arrondie au voxel
  (`inner.minZ`), comme les autres parois.
- Seules les vues de l'intérieur vers le haut changent : `side-piece`, et la nouvelle capture
  `side-piece-grand-bac` (plafond et poutres) ; les vues trois-quarts, de face, de dessus et
  de dessous avec pièce restent identiques à l'octet (mur de gauche du ton du fond de la
  scène qu'il remplace, plafond masqué en vue de dessus) ; pièce masquée, aucune.
- Fenêtre et lumière du jour (lot 2), porte, plinthes des nouveaux murs et luminaire (lot 3)
  s'appuieront sur `roomInterior` et les parois nommées.
