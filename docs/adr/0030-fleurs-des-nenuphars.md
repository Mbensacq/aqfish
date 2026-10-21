# 0030 — Fleurs des nénuphars et lotus : nature tirée d'un second flux, ouverture fonction de l'heure

- Statut : acceptée
- Date : 2026-10-21
- Auteur : Dev, cycle 36, issue #104

## Contexte

L'issue #104 ajoute des fleurs aux nénuphars du bassin (ADR 0029) : certaines feuilles
portent une fleur rose au cœur jaune, quelques lotus (feuille plus grande, fleur plus haute)
ponctuent le bassin, et les fleurs s'ouvrent le jour et se ferment la nuit. Contraintes :
choix déterministe pour une graine, aucun état ni champ de sauvegarde, captures du bac
tropical identiques à l'octet, aucune fleur qui masque les koïs en vue de dessus.

## Décision

- **Nature de chaque feuille** (`LilyPad.kind` : `feuille`, `fleur`, `lotus`) et rotation
  propre de la fleur (`flowerTwist`) tirées d'un **second flux** (`LILY_FLOWER_STREAM`),
  deux tirages par feuille visée, **avant** le placement : le rayon d'un lotus
  (`LOTUS_LEAF_SCALE` × rayon tiré) entre ainsi dans l'encombrement, et les garanties de
  l'ADR 0029 (marges, aucun contact) valent aussi pour les lotus. Probabilités
  `LILY_PAD_BLOOM` : 20 % de lotus, 40 % de fleurs. La valeur du flux a été choisie pour que
  la graine des captures (42) montre les trois natures.
- **Ouverture** : fonction pure `flowerOpenness(heure)` (`sim/lily-pads.ts`), `smoothstep`
  de l'élévation du soleil (`sim/daylight.ts`) entre `FLOWER_CLOSED_ELEVATION` (−0,25) et
  `FLOWER_OPEN_ELEVATION` (0,5) : exactement 0 à minuit, 1 à midi, ouverture d'environ 5 h à
  8 h, fermeture de 16 h à 19 h. L'hôte l'applique avec l'éclairage
  (`AquariumView.updateFlowers`), au même pas d'heure.
- **Rendu** (`render/lily-flower-model.ts`, `render/lily-pad-layer.ts`) : cœur octogonal
  `coeurFleur`, deux couronnes de pétales en losange `nenupharRose` articulés à leur base,
  inclinés de `closedTilt` (bouton) à `openTilt` (fleur ouverte). La fleur est un enfant du
  groupe de la feuille (elle suit dérive et balancement), du côté opposé à l'encoche ; celle
  d'un lotus est 1,35 fois plus grande, au bout d'une tige `vegetationSombre` de 7 cm.
  Grande ouverte, une fleur tient dans sa feuille vue de dessus (test unitaire) : elle ne
  cache rien que la feuille ne cache déjà.
- **Contour de silhouette** : contours des fleurs dessinés après les feuilles, sans écrire
  la profondeur (`FLOWER_OUTLINE_RENDER_ORDER`), puis pétales et cœur
  (`FLOWER_RENDER_ORDER`), qui recouvrent les contours intérieurs.

## Options écartées

- **Tirer la nature dans le flux de la disposition** : décalait tous les tirages suivants ;
  un flux séparé garde la nature lisible et indépendante des essais de placement.
- **Ouverture dérivée de l'intensité de la lumière** (`DayLight.intensity`) : liait les
  fleurs à la courbe d'éclairage ; une fonction de l'heure propre est testable seule et
  réglable sans toucher à la lumière.
- **Un contour d'un pixel par pétale** (comme le décor) : sur une fleur de 15 pixels, les
  contours intérieurs noircissaient la fleur en vue trois-quarts.
- **Géométrie recalculée à chaque ouverture** : inutile, les pétales sont des maillages
  partagés que l'on fait pivoter.

## Conséquences

- La disposition des nénuphars du bassin a changé (rayon des lotus avant placement) : les
  captures du bassin changent, pas celles du bac tropical ni les poissons.
- Nouvelles captures du contrat : `bassin-top-minuit` (fleurs fermées) et
  `bassin-top-sans-filtre`.
- La nuit, la teinte du décor multiplie aussi les couleurs des fleurs ; la passe palette
  ramène les boutons au rose nénuphar.
