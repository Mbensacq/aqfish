# 0083 — Pièce complète, lot 2 : fenêtre et lumière du jour

- Statut : acceptée
- Date : 2026-10-31
- Auteur : Dev, cycle 112, issue #342

## Contexte

Lot 2/3 de l'idée de Mathis #227, après la pièce fermée (ADR 0081) : une fenêtre dans l'un des
murs, dont la lumière suit le jour et la nuit (`sim/daylight.ts`) : rectangle lumineux sur le
parquet le jour, bleuté et sombre la nuit. Le bac reste la source de lumière principale. Pièce
masquée, rien ne doit changer (captures à l'octet, sauvegardes inchangées) ; aucune couleur
ajoutée à la palette (ADR 0039).

## Décision

- **Place** (`roomWindow(dims)`, `sim/room-window.ts`, pure) : dans le **mur du fond**, à gauche
  du bac, à `WINDOW_TANK_GAP` (0,6 m) plus la profondeur du bac de son côté gauche, à 0,3 m au
  moins du mur de gauche ; 1 m de large ; haut à 0,2 m sous le dessous des poutres
  (`roomInterior(dims).beamY`), au plus 1,3 m de haut, appui à 0,1 m au moins au-dessus du sol
  du bac. Sans réglage ni champ de sauvegarde : déduite des seules dimensions du bac.
- **Blocs** (`roomWindowBlocks`) : vitre pleine dans l'ouverture (3 cm de saillie, un voxel
  devant la cimaise du mur du fond, qu'elle recouvre), cadre, meneau et croisillon en bois
  (5 cm de saillie), appui plus foncé (7 cm) ; tous de la paroi `fond`. Tache au sol : les
  quatre carreaux projetés sur le parquet devant le mur (0,25 m à 1,45 m du mur, haut de la
  fenêtre le plus loin), découpés dans les lames de `roomBlocks` et gardant la teinte de leur
  lame : la tache se lit comme du parquet éclairé, les ombres du meneau et du croisillon
  comprises.
- **Couleurs** : bois en `sableSombre` et `sableOmbre` (ceux des poutres), en couleurs plates
  avec le mur ; vitre `koiBlanc`, tache `sableSombre` / `sableOmbre`, chacune sous un
  `MeshBasicMaterial` dont la couleur multiplie celle des sommets (`RoomLayer.setDaylight`,
  appelée par `AquariumView.applyLight`). `windowLightInto(light, overcast)` donne ces
  multiplicateurs : exactement neutres à midi (couleurs de la palette telles quelles), vitre
  passant du ciel du jour à `WINDOW_NIGHT_GLASS` (bleu sombre, ramené par la passe aux bleus de
  lune), tache prenant la teinte de la lumière directe (soleil, aube orangée, lune bleutée) à
  une clarté de 15 % la nuit ; les deux multipliées par le ciel couvert de la pluie
  (ADR 0082). **Aucune couleur ajoutée** à la palette.
- **Visibilité** : bois et vitre masqués avec le mur du fond, et dès qu'un des neuf points de
  l'ouverture (coins, milieux des bords, centre) est caché par le volume du bac
  (`isWindowClear`, segments contre la boîte du bac, sans allocation, à chaque image). La tache
  au sol suit le reste de la pièce.

## Options écartées

- **Fenêtre sur le mur de gauche** : en vue de côté, ce mur est le fond de l'image derrière le
  bac ; vers l'avant de la pièce elle sortait de l'eau, mais n'apparaissait plus dans la vue
  trois-quarts, qui regarde le fond et l'angle gauche.
- **Fenêtre toujours affichée** : en vue de côté, le mur du fond se voit en enfilade derrière
  l'eau ; les bords clairs du cadre et de la vitre y traçaient des traits verticaux à travers
  l'eau (piège de l'ADR 0048), et en trois-quarts la vitre claire vue à travers le haut du bac
  virait l'eau à la menthe. L'écart dépendant de la profondeur dégage la vue trois-quarts du
  plus grand bac ; le test d'occultation règle les autres angles.
- **Vitre sous la teinte du ciel la nuit** (multiplicateur `NIGHT_SKY × 12 %`) : la passe
  palette la ramenait au gris-vert de `verreSombre`, pas à un bleu de nuit.
- **Lumière propre** (`SpotLight` ou `RectAreaLight`) : coût d'une lumière de plus pour toute
  la scène et risque de changer les captures sans pièce ; une tache en couleurs plates suffit
  en pixel art.
- **Ouverture percée dans le mur** : le mur est un seul bloc (ADR 0081) ; la fenêtre posée
  dessus garde le mur fermé.

## Conséquences

- Captures avec pièce : la fenêtre et sa tache apparaissent en trois-quarts (jour, minuit, grand
  bac, deux bacs), la tache seule de dessus et de côté ; pièce masquée, aucune capture ne
  change.
- La fenêtre ne bouge pas avec l'heure (tache fixe) ; rayons volumétriques et fenêtre
  déplaçable restent hors périmètre.
- Lot 3 (porte, plinthes, moulures, luminaire) : la porte devra éviter la fenêtre et sa tache
  (`roomWindow`), et la cimaise du mur du fond reste derrière la vitre.
