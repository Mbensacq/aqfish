# 0035 — Axolotl : déplacement sur le fond par machine à états fonction du temps

- Statut : acceptée
- Date : 2026-10-22
- Auteur : Dev, cycle 44, issue #130

## Contexte

L'axolotl (issue #130) est la première espèce du paludarium (ADR 0034) et le premier animal
qui ne nage pas comme un poisson : il marche lentement sur le fond, nage par à-coups et
remonte parfois respirer sous la surface, sans jamais sortir de l'eau. Or la nage des
poissons (`sim/swimmer.ts`) borne le centre dans une boîte convexe (le volume d'eau moins
`wallMargin`, y compris en hauteur) : dans le paludarium, cette boîte couvre aussi la berge
émergée, et une marge verticale de la demi-longueur interdirait de marcher sur le fond.
Contraintes : simulation pure et déterministe, sauvegarde (ADR 0028) relue à l'identique,
autres environnements identiques à l'octet.

## Décision

- **Déplacement propre** (`sim/axolotl.ts`, `stepWalker`) pour toute espèce qui déclare
  `SpeciesDefinition.walker` (`BottomWalkerParams` : garde au sol, marge sous la surface,
  vitesse de marche, durée des créneaux, poids des états, période des à-coups, vitesse de
  montée). `stepInPlace` (`sim/world.ts`) l'appelle à la place de `stepFish`, sans banc
  (`schooling: null`) ni recherche de nourriture. Les poissons ne voient pas les axolotls :
  leur nage est identique avec ou sans eux.
- **État fonction pure du temps** (`walkerPhaseAt`) : le temps est découpé en créneaux de
  12 s, décalés d'une fraction propre à chaque individu ; l'état d'un créneau (`marche`,
  `nage`, `remontee`, poids 0,5 / 0,35 / 0,15) et la hauteur de nage sont tirés d'un hachage
  de la graine, de l'identifiant et du numéro de créneau (`deriveSeed`, sels séparés). Aucun
  champ ajouté à l'entité : la sauvegarde ne change pas et un monde rechargé reprend le même
  état au même instant. Les à-coups de nage suivent aussi le temps (période de 2,4 s :
  `maxSpeed` pendant 30 %, puis glissade).
- **Bornes garanties à chaque pas** : un pas horizontal n'est fait que s'il mène, dans les
  vitres moins `wallMargin`, au-dessus d'un fond assez profond (`walkerCanStand` : sol
  `terrainHeightAt` + garde au sol + `WADE_ROOM` sous le plafond) ; sinon l'animal tourne sur
  place. La hauteur est bornée entre le sol (sous le centre, le museau et la queue) plus la
  garde au sol, et la surface moins `surfaceMargin`. L'inclinaison est bornée par la place
  autour du corps (museau et queue restent sous la surface et au-dessus du sol), et ne
  dépasse `LEVEL_PITCH` (0,4 rad) que pendant la montée de la remontée. Propriété testée sur
  10 000 pas pour quatre graines (`sim/axolotl.spec.ts`).
- **Bornes de sauvegarde** : `swimBounds` donne à une espèce qui marche une boîte sans marge
  verticale de la demi-longueur (du fond plus la garde au sol à la surface moins la marge) ;
  la validation de `parseWorld` reste la même.
- **`terrainHeightAt`** (`sim/terrain.ts`) : la hauteur seule, sans allocation, lue plusieurs
  fois par pas ; `terrainAt` la réutilise (mêmes calculs, même résultat, testé).
- **Silhouette** : gabarit voxel `axolotl` (`render/fish-model.ts`), avec des **parties
  paires** (`FishTemplate.paired`) : branchies et pattes posées des deux côtés du corps,
  contre l'épaisseur de chaque colonne, pour qu'elles dépassent des flancs vu de dessus. Le
  maillage du corps des autres gabarits est inchangé (parties paires émises après).

## Options écartées

- **Réutiliser `stepFish` avec une préférence de profondeur** (comme le corydora, ADR
  0014) : la boîte convexe ne suit pas la pente immergée, et rien n'empêche d'aller au-dessus
  de la berge ; l'évitement par la force des parois ne sait pas lire une carte de hauteurs.
- **État stocké dans l'entité** (mode, minuterie) : nouveaux champs à sauvegarder et à
  valider, pour un comportement que le temps et la graine suffisent à décrire.
- **Tirage de l'état au sous-générateur de l'entité** : la suite des états dépendrait du
  nombre de pas faits, et changer le pas de la marche changerait tout le comportement.

## Conséquences

- Une espèce marcheuse ne contourne pas encore les obstacles en marche (elle naît hors
  d'eux) : le paludarium n'en a pas sous l'eau ; à reprendre avec son décor (#132).
- Grenouilles et tritons (#131), qui passent de la terre à l'eau, pourront partir de ce
  module (même machine à états, autres bornes).
- Les captures `paludarium-*` montrent deux axolotls ; celles du bac et du bassin sont
  inchangées. Les pattes sont fixes (pas d'animation de la marche).
