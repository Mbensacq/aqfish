# 0031 — Bassin enterré : sol de décor autour de la margelle et vue en coupe sous le sol

- Statut : acceptée
- Date : 2026-10-21
- Auteur : Dev, cycle 38, issue #105

## Contexte

La margelle du bassin (ADR 0026) monte du fond jusqu'au-dessus du bord : en vue de
trois-quarts, le bassin ressemblait à une caisse posée dans le vide (revue de #96, issue
#97). L'issue #105 demande un bassin **enterré** : un sol autour, une margelle basse qui
dépasse, la vue de dessus conservée, et des vues de côté, de face et de dessous sans trou ni
artefact. Contraintes : décor purement visuel (bornes de nage et murs invisibles inchangés),
couleurs de la palette, captures du bac tropical identiques à l'octet.

Un sol plein autour du bassin pose un problème évident : vu de côté ou de face (caméra à
mi-hauteur du bassin, sous le niveau du sol), la terre masque toute l'eau, et ces vues ne
montrent plus qu'un mur brun.

## Décision

- **Sol de décor** (`render/pond-ground.ts`) : anneau de dalles autour de la margelle, du
  fond du bassin (2 mm sous y = 0) jusqu'à 1 cm sous son bord, en deux couches (terre
  `sableSombre`, herbe `vegetationClaire` de 3,5 cm à tranche `vegetationOmbre`), sur
  `POND_GROUND_MARGIN` (45 cm) au-delà de la margelle. Le sol entre de 4 mm dans les pierres
  pour qu'aucune fente ne s'ouvre ; aux coins, les dalles se recouvrent. 70 touffes d'herbe
  (`vegetationLumineuse`, `vegetationOmbre`), semées avec une graine fixe, cassent l'aplat.
  Dessous `sableOmbre` non éclairé, distinct du fond du bassin vu de dessous. Lueur de nuit
  comme la margelle (`vegetationLuneSombre`, `rocheLuneSombre`). La margelle n'est pas
  modifiée : seuls 3 à 6 cm de pierre dépassent désormais du sol.
- **Couleurs de l'herbe** : aucune des deux couleurs des feuilles de nénuphar
  (`vegetation`, `vegetationSombre`) n'est employée, pour que les feuilles restent lisibles
  sur l'herbe et que les tests qui les comptent sur les captures gardent leur sens.
- **Vue en coupe** (`render/pond-cutaway.ts`) : quand la caméra passe **sous le niveau du
  sol**, les côtés du sol et de la margelle dont la paroi se trouve entre la caméra et l'eau
  sont masqués (`cutawaySides`, pur et testé ; `AquariumScene.setViewpoint`, appelé à
  chaque image par `AquariumView.renderFrame`). Comme une maquette coupée : l'eau se lit de
  côté comme dans le bac, la tranche de terre et d'herbe reste visible de part et d'autre.
  Au-dessus du sol (dessus, trois-quarts, orbite haute), rien n'est masqué. Sans effet pour
  le bac tropical.

## Options écartées

- **Sol plein sans coupe** : crédible de l'extérieur, mais les vues de côté et de face ne
  montrent plus ni l'eau ni les koïs, ce qui retire tout intérêt à ces préréglages.
- **Plan d'herbe sans épaisseur** : invisible de côté, mais en trois-quarts on voit sous le
  plan, par son bord, les murs de pierre enterrés.
- **Plans de découpe Three.js** (`clippingPlanes`) : coupe plus fine (à travers les pierres),
  mais un réglage du renderer de plus et des faces ouvertes à refermer ; le masquage par côté
  suffit pour des boîtes alignées sur les axes.

## Conséquences

- Les captures `bassin-*` changent (sol visible) ; le harnais ajoute `bassin-side`,
  `bassin-front` et `bassin-bottom`. Les captures du bac tropical sont identiques à l'octet.
- En orbite libre, le passage sous le niveau du sol fait disparaître d'un coup le côté
  proche : c'est voulu (bascule nette, pas de fondu à gérer avec la passe palette).
- Le cadrage reste celui du bassin seul (`framingDistance`) : le sol déborde du cadre en vue
  de dessus, ce qui est le comportement attendu (« sol visible autour »).
