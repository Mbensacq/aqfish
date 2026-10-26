# 0022 — Nourriture : granulés dans l'état du monde, hasard tiré au dépôt

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev, cycle 24, issue #67

## Contexte

L'épopée v0.4 « La vie » commence par le nourrissage au clic : des granulés déposés à la
surface flottent, coulent lentement, se posent sur le sable ou un rocher, puis disparaissent.
L'issue suivante fera venir les poissons vers la nourriture (attraction, faim) : le modèle de
données choisi ici structure donc ce comportement. Contraintes : déterminisme (même graine et
mêmes dépôts au même temps simulé : même état), contrat de capture (images sans nourriture
inchangées à l'octet), aucune consommation du hasard des poissons, nombre borné, aucune
allocation par pas.

## Décision

- **État sérialisable** : `World.food` (granulés, dans l'ordre des dépôts) et
  `World.nextFoodId` (compteur jamais réutilisé). Un granulé (`sim/food.ts`) est une donnée
  JSON : identifiant, position, vitesse verticale `vy`, âge, altitude de flottaison, durée de
  flottaison et altitude de repos.
- **Hasard tiré au dépôt seulement** : dispersion dans un disque de 2 cm et durée de
  flottaison (1,5 à 3 s) viennent du flux `deriveSeed(deriveSeed(graine, FOOD_STREAM), id)`.
  Rien n'est tiré pendant les pas : le nourrissage ne touche ni le générateur des poissons ni
  leurs trajectoires (test : poissons identiques avec et sans nourriture).
- **Chute en forme fermée** : à chaque pas, l'âge avance, puis
  `y = max(restY, floatY − vitesse · max(0, âge − flottaison))` ; aucun cumul d'erreur sur la
  position. Vitesse de chute constante (2,5 cm/s, approximation de jeu), disparition
  30 s après l'arrivée au sol. Retrait par compactage en place (ordre conservé).
- **Sol calculé au dépôt** : `restY` est le plus haut du sable et du dessus des **voxels**
  des rochers à la verticale du granulé (`rockTopAt`, inverse de `decorToTank`), et non de leur
  forme de collision, plus large. Les plantes sont traversées. Le décor étant immobile, ce
  calcul n'est fait qu'une fois.
- **Bornes** : 5 granulés par dépôt, 60 au plus dans le bac ; un dépôt qui ne tient pas est
  tronqué, un dépôt hors du bac est ignoré, la dispersion est ramenée sous les vitres.
- **Entrées** : `feed` (pure) et `feedInPlace` (propriétaire unique, comme `advanceInPlace`) ;
  `advanceToWithFeedings` rejoue des dépôts datés, pour le paramètre de capture `nourrir=`.
- **Clic** : la vue distingue un clic (bouton principal, déplacement ≤ 4 px entre appui et
  relâchement) d'un glisser de caméra, puis lance un rayon depuis la caméra sur le plan de la
  surface de l'eau (`render/food-pick.ts`) ; hors du bac, rien. Touche `G` et bouton
  « Nourrir » : dépôt au centre du bac.
- **Rendu** (voir l'avenant du cycle 37) : nuage de points de 2 pixels de scène, `tritonOrange`, file des bulles
  (opacité pleine, couleur exacte), assombri la nuit comme les couleurs plates (ADR 0019).
  Sans granulé, plage de dessin vide : images inchangées.

## Avenant — granulés discrets, points ou voxels (cycle 37, issue #117)

- Auteur : Dev, 2026-10-21.
- **Taille selon le zoom** : un granulé a un diamètre dans le monde (`FOOD_PELLET_DIAMETER`,
  1,2 cm, approximation de jeu). À chaque image, la vue calcule les pixels de scène par
  mètre à la distance de la cible de la caméra (`scenePixelsPerMeter`, `render/food-size.ts`)
  et en déduit le côté du cœur, arrondi au pixel, **au moins 1 pixel de scène**. Une seule
  échelle par image (et non par granulé) : pas de taille fractionnaire, mêmes granulés de
  même taille. Vue trois-quarts du bac tropical en 1280 × 720 : 2 pixels (inchangé) ;
  téléphone en portrait (390 × 844) : 1 pixel.
- **Liseré réduit** : complet (un pixel de chaque côté) à partir d'un cœur de 2 pixels,
  réduit à un pixel en tout en dessous (`foodOutlineExtra`) : un granulé lointain fait
  2 × 2 pixels au lieu de 4 × 4.
- **Second rendu, en voxels** : un cube instancié par granulé, du diamètre du granulé (au
  moins un pixel de scène), posé sur son point, en `poissonJaune` sur toutes ses faces (des
  côtés `koiOr` retombaient la nuit sur l'orangé des guppys, écarté par #83), cerné d'une
  coque `koiNoir` (cube grandi d'1 ou 2 pixels, faces arrière seules). Même biais de
  profondeur (`withDepthBias` s'applique aussi au shader `MeshBasicMaterial` : chaque sommet
  avance le long de son propre rayon, la silhouette à l'écran ne change pas), même
  assombrissement de nuit, même file de dessin que les points.
- **Bouton provisoire** : « Granulés : points / voxels » dans le panneau, sur la ligne
  « Afficher le décor » (une section de plus faisait défiler le panneau à 1280 × 720, #101),
  points par défaut, choix enregistré dans les réglages de la sauvegarde
  (`settings.foodStyle`, facultatif : une sauvegarde sans le champ donne des points, schéma
  inchangé). `granules=` le fixe en capture. **Une fois le rendu choisi par Mathis, retirer
  le bouton, le paramètre `granules=` et le rendu écarté** (le champ de sauvegarde pourra
  rester accepté et ignoré).
- Images sans granulé inchangées à l'octet (aucune instance, plage de dessin vide).

### Mise à jour (issue #226, cycle 77) : voxels par défaut, grains naturels

Constat de Mathis après essai : des masses orange fluo, pas de la nourriture. Trois pistes
comparées sur captures (détail dans l'ADR 0056) : bruns mats de la palette commune (granulés
invisibles sur le sable et les rochers, écartée) ; trois bruns ajoutés à la palette commune
(19 captures sans nourriture changées, écartée) ; **les mêmes bruns réservés aux pixels de
granulé par un marqueur d'opacité (retenue)**. Désormais :

- **voxels par défaut** (sauvegarde sans le réglage comprise ; un choix enregistré est
  respecté) ; le bouton et `granules=` restent ;
- **aspect par granulé** tiré de son identifiant (`foodLook`) : grain, flocon ou paillette,
  nuance ocre, beige ou brun-rouge, trois tailles proches, quatre orientations ;
- voxels **ombrés par face**, **sans coque** `koiNoir` ; un maillage instancié par forme ;
- points : liseré conservé, cœur de la nuance du granulé.

Les paragraphes ci-dessus sur `poissonJaune`, la coque et le défaut en points décrivent
l'état d'avant #226.

## Options écartées

- **Granulés sans état, comme les bulles** (fonction fermée du temps) : impossible, ils
  dépendent des actions de l'utilisateur ; il faudrait de toute façon mémoriser les dépôts.
- **Hasard tiré à chaque pas** (dérive latérale, oscillation) : coûte un générateur par
  granulé et rend l'état dépendant de la cadence ; inutile pour quelques pixels.
- **Sol sur la forme de collision des rochers** : les granulés flotteraient au-dessus du
  rocher affiché (sphères englobantes).
- **Supprimer les plus anciens quand le bac est plein** : déplacerait des granulés visibles
  sans action de l'utilisateur ; on préfère ignorer le surplus.

## Conséquences

- L'attraction pourra lire `World.food` (positions, âge, granulé posé ou non) et retirer un
  granulé mangé par identifiant ; les poissons y réagiront dans `stepInPlace`, pas avant.
- La sauvegarde du monde inclura la nourriture sans travail supplémentaire (JSON).
- Le contrat de capture gagne `nourrir=` ; `data-aqfish-food` expose le nombre de granulés.
- En vue de face ou de côté, la surface est vue par la tranche : un clic n'y dépose
  généralement rien (rayon hors du bac) ; le bouton et la touche `G` restent disponibles.
