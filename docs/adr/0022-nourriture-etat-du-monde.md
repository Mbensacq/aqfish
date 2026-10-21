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
- **Rendu** : nuage de points de 2 pixels de scène, `tritonOrange`, file des bulles
  (opacité pleine, couleur exacte), assombri la nuit comme les couleurs plates (ADR 0019).
  Sans granulé, plage de dessin vide : images inchangées.

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
