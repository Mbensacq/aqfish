# 0080 — Forme du bassin : ovale et haricot

- Statut : acceptée
- Date : 2026-10-30
- Auteur : Dev, cycle 107, issue #190

## Contexte

Le bassin à koïs était rectangulaire : la boîte d'eau (`Box3`) bornait à la fois la nage, la
nourriture et le rendu. Un bassin crédible a des bords courbes. L'issue demande un réglage
« Forme » (rectangle, ovale, haricot) suivi par la berge, l'eau, le sol et les poissons, sans
changer d'un octet le bassin rectangulaire ni les autres environnements.

## Décision

1. **Représentation : distance signée au bord** dans le plan horizontal, positive dans l'eau
   (`sim/pond-shape.ts`, pur). Rectangle : distance à la boîte ; ovale : ellipse inscrite dans
   la boîte d'eau (approximation du premier ordre, exacte sur le bord et sur les axes) ;
   haricot : intersection adoucie (minimum polynomial) de l'ovale et de l'extérieur d'un
   cercle qui échancre le milieu du côté +Z. Une seule fonction donne le test « dans la
   forme », la normale (différences centrées), la projection et le contour du rendu.
2. **La boîte d'eau ne change pas** : volume, litres, obstacles, décor, nénuphars restent
   ceux du rectangle. La forme est une contrainte **en plus**, portée par les bornes de nage
   (`SwimBounds.outline`, `outlineMargin`), absente pour le rectangle : la nage d'avant est
   exécutée au bit près (aucun tirage en plus).
3. **Évitement des bords** : au point visé, le bord repousse comme une paroi verticale
   (`proximity(distance − wallMargin, AVOID_ZONE)` le long de la normale intérieure), ajouté
   à la force des parois de la boîte avant la déviation (`deflect`, ADR 0012). Filet de
   sécurité après le déplacement, l'espacement des congénères et des espèces rivales :
   `keepInShape` (projection le long de la normale, puis dichotomie vers le centre, toujours
   dedans). Naissance : tirage retenté hors de la forme, puis projection.
4. **Données** : `World.shape?` et `TankPlace.shape?` (`ovale` ou `haricot`, jamais
   `rectangle`), clé de lieu `bassin~ovale` construite une fois ; réglable au bassin seulement
   (`isPondShapeable`). Sauvegarde : champ `shape` facultatif (absent : rectangle, anciennes
   sauvegardes acceptées), refusé hors du bassin ou inconnu. `setPondShapeInPlace` ramène
   poissons et granulés dans la nouvelle forme.
5. **Nourriture** : un clic hors de la forme (sur la berge) ne dépose rien ; dans l'eau, le
   centre du dépôt est écarté du bord du rayon de dispersion.
6. **Rendu** (`render/pond-shape-bank.ts`) : la boîte d'eau reste un pavé ; une **berge**
   extrudée (terre à paroi sombre, herbe dessus) comble l'espace entre le contour et le
   rectangle extérieur de la margelle, jusqu'au niveau du sol, et une margelle de pierres
   tournées suit le contour. Vue de dessus et de trois-quarts, l'eau a la forme du bassin.
7. **Interface et capture** : liste « Forme du bassin » sur la ligne « Lieu » du panneau (à la
   place de « Afficher la pièce », réservée au bac tropical : aucune ligne en plus) ;
   paramètre de capture `forme=ovale|haricot`.

## Options écartées

- **Polygone libre** (liste de sommets) : prépare la forme dessinée à la souris (hors
  périmètre), mais distance et normale plus coûteuses et cas dégénérés à valider. La distance
  signée s'étend à d'autres formes analytiques sans changer les appelants.
- **Eau à la forme exacte** (géométrie de l'eau extrudée) : il faudrait aussi découper le sol,
  les caustiques et la coupe ; la berge opaque donne le même résultat vu d'en haut pour un
  diff bien plus petit.
- **Obstacles en sphères le long du bord** : réutilise l'évitement des obstacles, mais des
  dizaines de sphères à tester par poisson et par pas, et des creux entre elles.

## Conséquences

- Les koïs restent dans la forme (test de 600 pas, graine 42, pour les trois formes).
- Rectangle : mêmes mondes, mêmes sauvegardes, mêmes captures.
- Limites connues : en vue en coupe (caméra sous le sol), la berge est masquée en entier et
  l'eau redevient rectangulaire ; le décor déplacé à la main peut se retrouver sous la berge ;
  les nénuphars et feuilles mortes tirés dans les coins de la boîte y sont cachés par la berge.
