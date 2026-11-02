# 0093 — Pièce complète, lot 3 : porte, plinthes, moulure et applique

- Statut : acceptée
- Date : 2026-11-02
- Auteur : Dev, cycle 127, issue #363

## Contexte

Lot 3/3 de l'idée de Mathis #227, après la pièce fermée (ADR 0081) et la fenêtre (ADR 0083) :
les derniers détails d'ambiance (une porte, des plinthes au pied des quatre murs, une moulure
sous le plafond, un luminaire allumé à la nuit tombante), sans toucher au bac ni à la
simulation. Pièce masquée, rien ne doit changer (captures à l'octet) ; aucune sauvegarde ne
change de schéma ; aucune couleur ajoutée à la palette (ADR 0039). Le luminaire reste
secondaire par rapport à la lumière du bac.

## Décision

- **Module pur** `sim/room-details.ts`, comme la fenêtre : tout se déduit des dimensions du bac
  et de la hauteur du meuble, sans réglage ni champ de sauvegarde.
- **Porte** (`roomDoor`) dans le **mur de droite** (+X) : la vue `side` regarde depuis +X, ce
  mur est derrière elle ; de face et de trois-quarts (de devant à droite), aucune ligne de
  visée qui traverse le bac ne l'atteint. Vantail de 0,9 × 2,04 m, bord avant à 0,8 m du mur
  d'en face ; dans une pièce basse, la porte baisse pour garder 15 cm de mur sous la moulure
  (au plus bas, bac de 50 cm sur meuble de 60 cm : 2,03 m). Blocs (`roomDoorBlocks`) :
  chambranle de 7 cm en saillie de 3 cm (**un voxel de plus que la plinthe**, qui s'arrête à
  lui), vantail, deux panneaux en relief d'un voxel, poignée côté avant ; porte fermée (hors
  périmètre : porte qui s'ouvre).
- **Passage devant la porte** (`doorClearance`) : 0,6 m depuis le mur sur toute la largeur du
  chambranle, où **rien ne se pose** : nouveau refus `porte` de `dropRoomItem`, emprise
  `area.door` de `roomArea`, ajoutée aux obstacles de la pose automatique du catalogue
  « Bacs et meubles » (#305).
- **Plinthes** (`roomTrimBlocks`) des murs de gauche, de droite (en deux morceaux, de part et
  d'autre du chambranle) et d'en face, à la hauteur (8 cm) et à la saillie (2 cm au voxel) de
  celle du mur du fond ; les latérales s'arrêtent à celles du fond et d'en face (aucun
  recouvrement). **`roomArea` recule d'autant** sur les trois murs : un meuble plaqué contre un
  mur reste devant sa plinthe.
- **Moulure** sous le plafond des quatre murs (5 cm de haut, 3 cm de saillie), du ton du
  plafond (`rocheSombre`) : elle prolonge le plafond sans nouveau repère clair sur les murs
  latéraux. Plinthes et moulure sont dans les parois de leur mur (couleurs plates, masquées avec
  lui, ADR 0081).
- **Applique** (`roomLamp`, `roomLampBlocks`) sur le mur de droite, entre le mur du fond et la
  porte (0,5 m plus un demi-halo du chambranle), centre à 1,7 m du parquet, plus bas dans une
  pièce basse : platine et bras sombres, abat-jour `koiBlanc`, halo sur le mur en **deux croix
  emboîtées** (`sableOmbre` puis `sableSombre` d'un voxel devant), une lueur en marches de
  pixel art. Choisie plutôt qu'une suspension : une lampe pendue au plafond peut passer entre
  la caméra et le bac (vue de dessus, caméra libre).
- **Intensité** (`lampIntensity`, pure) : 0 au-dessus de l'intensité du jour
  `DAY_PHASE_MIN_INTENSITY` (0,6, début du crépuscule), 1 sous `NIGHT_PHASE_MAX_INTENSITY`
  (0,1, nuit), lissage d'Hermite entre les deux ; valeur non finie : 0. `lampColorsInto` en
  tire les multiplicateurs de couleurs plates : abat-jour de 60 % (éteint, tissu terne) à un
  blanc chaud (1 ; 0,82 ; 0,5), halo de 0 à 1, affiché seulement lampe allumée
  (`RoomLayer.setDaylight`). **Pas de lumière Three.js** : la lampe n'éclaire ni le parquet ni
  le bac, elle se voit seulement (lumière du bac dominante, coût nul pour la scène).
- **Visibilité** (`RoomLayer.setViewpoint`) : porte et applique en maillages à part, masqués
  avec le mur de droite et dès qu'un des neuf points de leur rectangle est caché par le volume
  du bac (`isDoorClear`, sur `segmentHitsTank` de la fenêtre, sans allocation).

## Mesure du temps d'image

Rendu logiciel du navigateur headless de l'environnement des agents (pas de GPU), 640 × 360,
build de production servi en statique, intervalle moyen entre `requestAnimationFrame` sur 6 s,
médiane de trois mesures, deux séries alternées avant (`main`, 836ae24) et après :

| Scène | Avant, série 1 | Après, série 1 | Avant, série 2 | Après, série 2 |
|---|---|---|---|---|
| Pièce, trois-quarts (`piece=1`) | 169,4 ms | 343,5 ms (*) | 179,9 ms | 164,4 ms |
| Pièce, vers la porte, minuit (`libre-porte-minuit`) | 174,8 ms | 195,7 ms | 169,4 ms | 169,0 ms |
| Bac seul | 198,9 ms | 173,3 ms | 175,2 ms | 169,9 ms |

(*) Mesure prise pendant un `npm run lint` lancé en parallèle (processeur partagé) : écartée.
Hors cette mesure, les écarts (± 15 ms) restent dans le bruit d'une série à l'autre : **pas de
régression mesurable**. Ces chiffres ne valent que comme comparaison : ils ne disent rien d'un
téléphone, où le GPU dessine.

Le surcoût est de 19 blocs (228 triangles) et de 4 maillages de plus (porte, platine et bras,
abat-jour, halo), soit 4 appels de dessin quand la pièce est affichée ; aucun pièce masquée (aucun maillage).

## Options écartées

- **Porte dans le mur de gauche** : en vue de côté, ce mur est le fond de l'image derrière le
  bac ; une porte claire y aurait traversé l'eau (`docs/PIEGES.md`).
- **Porte dans le mur d'en face** : derrière la caméra des vues de face et de trois-quarts,
  comme le mur de droite ; vue de la caméra libre, la porte du mur de droite fait face à la
  fenêtre et se découvre en se tournant depuis le bac.
- **Suspension au plafond** : voir ci-dessus ; et le plafond est masqué dès que la caméra
  passe au-dessus des poutres.
- **`PointLight` pour l'applique** : une lumière de plus pour toute la scène (programmes de
  rendu recompilés, captures sans pièce menacées) pour un effet secondaire ; en pixel art, un
  abat-jour et un halo en couleurs plates suffisent.
- **Halo d'un seul bloc carré** : il se lisait comme un tableau accroché au mur.
- **Plinthes dans le maillage éclairé du sol** (comme celle du fond) : elles n'auraient pas été
  masquées avec leur mur quand la caméra le traverse.

## Conséquences

- Captures avec pièce : plinthes, moulure, porte et applique apparaissent selon l'angle
  (trois-quarts, côté, caméra libre) ; deux captures ajoutées, `libre-porte` et
  `libre-porte-minuit` (applique allumée). Pièce masquée, aucune capture ne change (5 angles du
  bac seul identiques à l'octet).
- Porte, plinthes et moulure sont en couleurs plates : comme les murs, elles ne s'assombrissent
  pas la nuit ; la porte se détache nettement du mur sombre.
- Un meuble d'une sauvegarde plus ancienne, plaqué contre un mur ou posé devant la future
  porte, n'est pas déplacé (`tidyRoomItems` ne repose que par gravité) ; le premier
  déplacement le soumet aux nouvelles bornes.
- Fin de l'épopée de la pièce complète (#227) : porte qui s'ouvre, éditeur de détails et sons
  restent hors périmètre.
