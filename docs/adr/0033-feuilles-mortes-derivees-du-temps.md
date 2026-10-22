# 0033 — Feuilles mortes : créneaux et vagues dérivés de la graine, sans état

- Statut : acceptée
- Date : 2026-10-22
- Auteur : Dev, cycle 42, issue #107

## Contexte

L'issue #107 ajoute au bassin quelques feuilles mortes (brunes et ocre, petites, de forme
irrégulière) qui flottent, dérivent lentement, passent parfois sur un nénuphar et
apparaissent par vagues faibles, jamais nombreuses. Contraintes : apparition, trajectoire et
disparition déterministes pour une graine (contrat de capture), nombre simultané borné,
feuilles toujours dans le bassin, aucun scintillement, couleurs de la palette, captures du
bac tropical identiques à l'octet, rien de nouveau dans la sauvegarde.

## Décision

- **Simulation sans état** (`sim/floating-leaves.ts`), comme la pluie (ADR 0032) : le temps
  est découpé en créneaux de 7 s ; le créneau n° k donne au plus une feuille, née dans la
  première moitié du créneau et vivant 52 s (pose de 1,5 s, descente de 4 s : la longueur
  affichée passe de 0 à sa valeur, puis revient à 0). Tous les tirages d'une feuille viennent
  de `deriveSeed(deriveSeed(graine, FLOATING_LEAF_STREAM), k)`.
- **Vagues** : six créneaux forment une vague (42 s). Chaque vague tire, d'un flux à part
  (`FLOATING_LEAF_WAVE_STREAM`), une intensité égale au **carré** d'un tirage uniforme (vagues
  le plus souvent faibles, parfois presque nulles) et une direction de brise commune à ses
  feuilles (chacune s'en écarte d'au plus 0,7 rad). Un créneau donne une feuille avec une
  probabilité de 0,75 × intensité. Mesure sur 10 graines et 1 500 s : 1 à 2 feuilles en
  moyenne, des périodes sans aucune.
- **Borne** : `MAX_FLOATING_LEAVES = ⌊52 / 7 + 0,5⌋ + 1 = 8` (pire cas : toutes les feuilles
  nées au plus tard dans leur créneau). Consignée aussi dans `docs/DA.md`.
- **Trajectoire** : départ tiré dans la surface rétrécie de la marge (3 cm + demi-longueur
  maximale + balancement), dérive en ligne droite à 4 à 11 mm/s **jusqu'au bord de cette
  surface, où la feuille s'arrête** (feuilles amassées contre la margelle), balancement
  latéral de 1 cm, rotation lente. Une feuille ne passe donc jamais sur la bordure.
- **Rendu** (`render/floating-leaf-layer.ts`, contrat `EffectLayer`) : 8 emplacements créés
  une fois ; six formes à graine fixe × deux teintes, géométries partagées, échangées par
  référence à chaque image (aucune allocation). Prisme de 3 mm, posé au-dessus du dessus des
  nénuphars (`FLOATING_LEAF_LIFT`) et dessiné après leurs fleurs : une feuille qui passe sur un
  nénuphar le recouvre ; `polygonOffset` comme les nénuphars (piège du cycle 35). Contour
  `koiNoir` d'un pixel, masqué tant que la feuille est trop petite (pose et descente) pour ne
  pas laisser une tache noire. Assombrie la nuit comme les bulles et la pluie.
- **Environnement** : `Environment.floatingLeaves` (vrai pour le bassin). Ailleurs, la couche
  est masquée et n'est pas posée (`updateVisibleEffects`).
- La constante du flux des vagues a été choisie pour que la graine 42 des captures montre des
  feuilles à 30 s ; un test le fige.

## Options écartées

- **Feuilles dans `World`** (intégrées pas à pas) : schéma de sauvegarde 2 pour un phénomène
  qu'une fonction du temps décrit exactement (même raisonnement que la pluie).
- **Disparition en fondu** : l'opacité partielle est ramenée par la passe palette à des
  couleurs imprévisibles ; la feuille rapetisse plutôt (elle « coule »).
- **Couleurs de la roche** (`sableOmbre`, `rocheSombre`) : essayées, les feuilles se
  confondaient avec les rochers vus de dessus. Tons chauds retenus (`sableSombre`,
  `tritonOrange`), sans ajouter de couleur à la palette (les captures du bac seraient
  touchées).
- **Feuille qui monte sur un nénuphar** (hauteur selon le recouvrement) : sauts d'un pixel
  et feuille inclinée à moitié dessus ; une hauteur fixe juste au-dessus des nénuphars suffit.

## Conséquences

- Les captures du bassin changent (feuilles visibles) ; celles du bac tropical non.
- Changer la cadence, la vie, les vagues, les flux ou l'ordre des tirages change les
  captures du bassin seulement.
- Les feuilles n'interagissent ni avec les poissons, ni avec la pluie (hors périmètre).
