# 0040 — Coraux du récif : colonies voxel tirées de la graine, boîte d'obstacle, violets du récif

- Statut : acceptée
- Date : 2026-10-23
- Auteur : Dev, cycle 51, issue #149

## Contexte

L'issue #149 pose des colonies de coraux sur le fond du récif (#148, ADR 0039) : trois formes
(branchu, en table, en dôme), en voxels, aux couleurs rose, orange, violet et jaune ;
positions, tailles et couleurs tirées de la graine ; chaque colonie est un obstacle pour les
poissons et reste dans le bac. Les autres environnements doivent rester identiques à l'octet.

Trois questions : faut-il un état des coraux dans `World` (et dans la sauvegarde) ? Quelle
forme de collision ? Où trouver un violet, absent de la palette commune ?

## Décision

- **Aucun état, flux de hasard séparé** (`sim/corals.ts`), comme les nénuphars (ADR 0029) :
  `coralLayout(graine, dimensions, réglage, décor)` tire tout de
  `deriveSeed(graine, CORAL_STREAM)`. Le réglage est une donnée de l'environnement
  (`Environment.corals` : 7 à 9 colonies, échelle 1 à 1,5 ; `null` ailleurs). La sauvegarde
  ne change pas (schéma 1) : `createWorld` recalcule les coraux de la graine et du décor, et
  `saveData` compte leurs boîtes parmi les obstacles recalculables.
- **Formes** (`sim/coral-shapes.ts`, `coralModel(forme, graine, échelle)`, voxels de 1,2 cm × échelle) :
  - dôme : demi-ellipsoïde plein, hauteur 0,4 à 0,65 fois sa largeur ;
  - table : pied de 2 × 2 voxels, haut de 4 à 6, portant un plateau elliptique de 12 à 17
    voxels de large et son rebord relevé ;
  - branchu : petit socle d'où montent 4 à 6 branches d'un voxel, penchées vers l'extérieur,
    certaines fourchues ; au moins aussi haut que large, clairsemé de dessus.
  Ces proportions sont fixées par des tests sur 50 graines.
- **Formes et teintes en permutations** tirées de la graine, parcourues au fil des colonies
  **placées** : dès 3 colonies, les trois formes ; dès 4, les quatre teintes. Placement par
  rejet borné (150 essais par colonie, colonie omise sinon), emprise à 3 cm des vitres et à
  2 cm des autres colonies et des sphères de collision des rochers. Mesure : sur 2 000 graines,
  4 à 9 colonies (au moins 4 sur 300 graines, test).
- **Quarts de tour seulement** : une colonie tourne de `k · π/2`. Sa boîte englobante reste
  alignée sur les axes du bac, et c'est son **obstacle** : nouvelle forme `box` de
  `sim/obstacles.ts` (centre, demi-dimensions ; distance signée exacte, normale de la face
  la plus proche dedans). L'évitement, la projection de sortie et la ligne de vue n'ont rien
  à changer : ils ne passent que par `obstacleDistance` et `obstacleBound`.
- **Couleurs** (`render/coral-model.ts`) : par teinte, un flanc foncé et un dessus clair,
  pris dans la palette (rose, orange, jaune) ; bouts des branches clairs, rebord des tables
  foncé (de dessus, un disque cerné), polypes foncés sur les dômes. Le violet est un **ton
  du récif** (ADR 0039) : `corailViolet` `#7d4fb8` et `corailVioletClair` `#b58be6`, déclarés
  par `Environment.tones`, écartés ailleurs. Les colonies sont dessinées par la couche du
  décor (ordre après l'eau et le verre, couleurs exactes, contour d'un pixel), masquées avec
  lui, teintées avec lui la nuit.

## Options écartées

- **Union de sphères tirée des voxels**, comme les rochers : plus ajustée (passage sous le
  plateau d'une table), mais l'issue demande une boîte, plus simple à vérifier (contenance
  de chaque voxel, contact de chaque face), et le récif n'a pas encore d'habitants.
- **Rotation quelconque avec boîte orientée** : distance et tests plus lourds pour un gain
  visuel faible sur des colonies presque symétriques.
- **Coraux comme éléments de `World.decor`** (`kind: coral`) : figés dans l'environnement et
  la sauvegarde, et non tirés de la graine du monde.
- **Rouge à la place du violet** (rouge koï, dans la palette) : évite deux tons, mais l'issue
  et `docs/DA.md` demandent du violet.

## Conséquences

- Changer le réglage, le flux, l'ordre des tirages ou les formes change les coraux du récif
  (et ses captures), jamais les autres environnements (vérifié : les 41 captures des autres
  environnements sont identiques à l'octet, hors `front-panneau`, non reproductible, et la
  trace des trajectoires, non produite en local, voir `docs/PIEGES.md`).
- Vue de dessous : les coraux sont cachés par le sable opaque, comme les rochers (capture
  `recif-bottom` inchangée).
- La nuit, la passe ramène le rose assombri sur les violets et l'orange et le jaune sur le
  sable : les teintes se confondent jusqu'à la lumière du récif.
- La boîte d'une table bloque le passage sous son plateau, et celle d'un branchu l'espace
  entre ses branches : à affiner avec les poissons de récif si besoin.
