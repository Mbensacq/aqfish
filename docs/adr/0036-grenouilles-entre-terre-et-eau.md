# 0036 — Grenouilles : posée, saut, nage, entre terre et eau

- Statut : acceptée
- Date : 2026-10-22
- Auteur : Dev, cycle 45, issue #131

## Contexte

Les grenouilles (issue #131) sont le premier animal du paludarium qui vit des deux côtés du
rivage : posées sur la berge, elles font de petits sauts, entrent dans l'eau, nagent quelques
secondes et reviennent sur la terre. Ni la nage des poissons (`sim/swimmer.ts`, boîte convexe
d'eau) ni la marche de l'axolotl (`sim/axolotl.ts`, ADR 0035, toujours sous la surface) ne
savent quitter l'eau. Contraintes : simulation pure et déterministe, sauvegarde (ADR 0028)
relue à l'identique, franchissement du rivage continu, autres environnements identiques à
l'octet.

## Décision

- **Module propre** (`sim/frog.ts`, `stepFrog`, `createFrog`) pour toute espèce qui déclare
  `SpeciesDefinition.amphibian` (`AmphibianParams` : garde au sol, profondeur de nage, hauteur
  maximale, durée, portées et hauteur des sauts, créneaux, cycle terre-eau, vitesse de nage).
  `stepInPlace` (`sim/world.ts`) l'appelle à la place de `stepFish`, sans banc ni recherche de
  nourriture. Il réutilise le sol de l'axolotl (`groundHeight`, `WalkerGround`).
- **Cinq états lus sur l'entité**, sans champ nouveau (`frogModeOf`) :
  - `ascent` > 0 : en l'air ; `saut` si le point d'arrivée est sur la terre émergée, `entree`
    s'il est dans l'eau. Pendant un saut, `ascent` est le temps restant, `speed` la vitesse
    horizontale (portée / durée) et `yaw` la direction : le point de départ et le point
    d'arrivée se reconstruisent à chaque pas, la sauvegarde ne change pas et un monde
    rechargé en plein saut le termine à l'identique (testé). `ascent` est le champ de la
    remontée des poissons (ADR 0014), toujours nul pour une espèce sans `depth` : même sens
    (temps restant d'un épisode), bornes de validation inchangées.
  - sinon, sur la terre émergée : `posee` ; dans l'eau : `nage` si l'individu veut l'eau,
    `sortie` sinon.
- **Milieu voulu et sauts, fonctions pures du temps** : `wantsWater` découpe le temps en
  cycles de 40 s décalés par individu, dont les derniers 35 % dans l'eau ; `hopSlotAt`
  découpe le temps en créneaux de 1,6 s, et un saut ne peut partir qu'au pas où le créneau
  change, avec chance, direction et portée tirées d'un hachage de la graine, de l'identifiant
  et du créneau (`hopDrawAt`, sels séparés). À terre, la grenouille saute une fois sur deux
  environ, dans n'importe quelle direction, et doit retomber sur la terre ; quand elle veut
  l'eau, elle saute à chaque créneau vers +X (côté eau du paludarium, ADR 0034), ± 0,5 rad,
  et peut retomber dans l'eau (`entree`).
- **Saut en parabole bornée** : `hopArc(y0, y1, h, s)` = corde de `y0` à `y1` plus
  `4·h·s·(1 − s)` ; portée dans [`hopMinRange`, `hopMaxRange`] et sommet à au plus `h`
  au-dessus de la corde (testé en simulation). Avant de partir, `canHop` vérifie 16 points de
  la trajectoire : dans les vitres, au-dessus du sol plus la garde, sous la borne haute ; sinon
  des directions de repli (± 0,6 rad, jusqu'à ± 1,8 rad) puis la portée minimale sont
  essayées, ou la grenouille reste posée.
- **Hauteur au repos continue** : `restHeight` = sol plus `clearance` sur la terre ; dans
  l'eau, la surface moins `floatDepth`, mais jamais sous le sol plus `clearance`. Au rivage le
  sol est au niveau de l'eau des deux côtés : la hauteur est continue, et la sortie de l'eau
  (nage vers −X puis montée le long du sol) est un déplacement continu, sans téléportation.
  Une grenouille qui nage ne monte jamais sur la terre (pas refusé) ; celle qui sort le peut.
- **Bornes** : `swimBounds` donne à une espèce amphibie une boîte des vitres moins
  `wallMargin`, du fond plus `clearance` à la surface plus `maxRise` (0,26 m : plateau,
  reliefs, roche et sommet des sauts). Propriété testée sur 20 000 pas pour quatre graines :
  dans le bac, jamais sous le sol, déplacement par pas borné, au moins un passage de la
  terre à l'eau et de l'eau à la terre par grenouille.
- **Silhouette** : gabarit voxel `grenouille` (`render/fish-model.ts`) : corps trapu vert
  `#7bc950` taché de vert sombre, ventre clair ; parties paires (ADR 0035) pour les yeux de
  chaque côté du haut de la tête, les cuisses et les pattes. La « queue » est la paire de
  pieds arrière, qui bat à la nage et pendant le saut.

## Options écartées

- **Champs d'état nouveaux** (mode, point de départ du saut) : sauvegarde et validation à
  étendre, alors que `ascent`, `speed` et `yaw` suffisent à décrire un saut en cours.
- **Saut balistique intégré pas à pas** (vitesse verticale) : la vitesse verticale n'est pas
  dans l'entité, et l'arrivée dépendrait du pas de temps.
- **Entrée dans l'eau en marchant** : possible avec `restHeight`, mais le saut dans l'eau est
  le geste attendu d'une grenouille ; la sortie, elle, se fait en remontant la pente.

## Conséquences

- La direction de l'eau (+X) est celle du paludarium (ADR 0034) : un autre environnement à
  berge devra fournir la sienne.
- Les grenouilles ne contournent pas d'obstacles (le paludarium n'en a pas ; décor #132) et
  ne mangent pas (nourrissage hors périmètre).
- Les captures `paludarium-*` montrent trois grenouilles (une sur la berge, deux dans l'eau à
  30 s pour la graine 42) ; celles du bac et du bassin sont inchangées.
- Les tritons (#133), qui passent aussi de la terre à l'eau, pourront partir de ce module.
