# 0042 — Chirurgiens bleus : préférence de mi-hauteur et bleu du récif

- Statut : acceptée
- Date : 2026-10-23
- Auteur : Dev, cycle 53, issue #151

## Contexte

L'issue #151 ajoute au récif des chirurgiens bleus (Paracanthurus hepatus) : banc lâche de 3
à 5, à mi-hauteur (critère : médiane de la hauteur entre 35 % et 65 % de la colonne d'eau sur
60 s), plus grands et plus rapides que les poissons-clowns, sans traverser coraux ni
anémones, d'un bleu distinct de l'eau du récif et du bleu néon. Les autres environnements
doivent rester identiques à l'octet.

La préférence de profondeur existante (ADR 0014) ne sait que tirer vers le bas au-dessus
d'une hauteur (espèces de fond). Le bleu de l'eau du récif (`eauRecif`, `eauRecifClaire`)
est un ton d'environnement tiré du bleu néon (ADR 0039) : un bleu de poisson proche se
fondrait dans l'eau à la quantification.

## Décision

- **Bande de profondeur** : champ optionnel `minHeightRatio` de `DepthPreference`, dans
  [0, `maxHeightRatio`) (`validateSpecies`). `swimBounds` en tire `preferredMinY` (−∞ sans
  lui, pour toutes les espèces existantes) ; sous cette hauteur, `stepFish` fait glisser
  l'inclinaison visée vers la montée, symétrique de la descente au-dessus de
  `preferredMaxY` (pleine à 3 cm de l'écart). Naissance dans la bande. Les espèces sans
  `minHeightRatio` gardent exactement leur nage et leur suite de tirages.
- **Chirurgien** (`CHIRURGIEN`, `sim/species.ts`) : nageur ordinaire en banc lâche, bande de
  40 % à 60 % de la hauteur d'eau, sans remontée, évitement du fond de portée commune
  (7 cm). 11 cm, croisière 6 cm/s (clown : 8 cm, 3 cm/s). Population 4 (réglable de 0 à
  10). Pas d'évitement propre : les coraux et les anémones sont déjà des obstacles du
  monde (ADR 0040, 0041), évités par tous les nageurs.
- **Bleu roi `chirurgienBleu` (#1d3fbf), nouveau ton du récif** : plus sombre et plus saturé
  que l'eau. Distances en sRGB 8 bits : 75 à `eauRecif`, 97 à `eauRecifClaire`, 124 à
  `neonBleu`, plus de 60 à toute couleur de la palette étendue et aux autres tons. Marque
  noire (`koiNoir`) sur le haut du flanc, pédoncule et caudale en croissant jaunes
  (`poissonJaune`). Peu de noir dans le gabarit (#161 : le noir dominait les clowns).
- **Pluriel des noms composés** : `speciesPlural` marque chaque mot séparé par un tiret ou
  une espace (« chirurgiens bleus »).

## Conséquences

- Mesure sur 8 graines (0, 1, 7, 42, 123, 999, 31337, 4294967295), 120 s : médiane de la
  hauteur 0,47 à 0,55 de la colonne d'eau (5e centile ≥ 0,38, 95e ≤ 0,62) ; distance
  minimale à un obstacle 6,6 cm ; distance médiane au plus proche congénère 11 cm (banc
  lâche, environ une longueur de corps).
- Captures : seules celles du récif changent ; les pixels changés y sont tous des couleurs
  du chirurgien (le ton ne capte ni l'eau ni le décor, minuit compris).
- Comme l'orange du clown, le bleu du chirurgien, ton du récif, ne s'assombrit pas la nuit
  (le ton capte le bleu assombri) : la lumière du récif reste à faire.
- En vue trois-quarts par défaut, les chirurgiens nagent souvent vers la caméra : corps
  raccourci (2 voxels d'épaisseur), bleu et caudale jaune restent lisibles ; le profil se
  lit en vues de côté et de face.
