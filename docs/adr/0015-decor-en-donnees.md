# 0015 — Décor en données, rochers voxel et collision en union de sphères

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev (Claude), cycle 15, issue #48

## Contexte

L'épopée v0.3 « Le décor » commence par les rochers. L'idée #34 demande un décor décrit
par des **données** (type, position, rotation, échelle), jamais codé en dur, avec une forme
de collision assez fine pour laisser passer un poisson entre deux éléments. `sim/obstacles.ts`
ne connaissait que la sphère (ADR 0012), et aucun contour n'était encore dessiné
(`docs/DA.md`, règle 4).

## Décision

- **Données** (`sim/decor.ts`) : `DecorItem = { kind: 'rock', x, z, rotation, scale, seed }`,
  objet JSON. L'altitude n'est pas une donnée : un élément repose toujours sur le sable
  (base enfoncée d'un quart de voxel, `rockBaseY`), ce qui exclut tout flottement par
  construction. `validateDecorItem` refuse objet absent, clé inconnue ou manquante, type
  inconnu, nombre non fini, échelle hors de [0,25 ; 3], graine non entière sur 32 bits,
  position hors du bac ; `parseDecor` / `parseDecorItems` lèvent une `RangeError` listant
  tous les problèmes par élément. `World.decor` garde les éléments ; `createWorld(seed,
population, obstacles, decor)` ajoute leurs formes de collision à `World.obstacles`, après
  les obstacles explicites. `DEFAULT_DECOR` (4 rochers) est écrit en JSON et passe par le
  même parseur.
- **Forme** : un rocher = 2 à 4 **blocs** sphériques tirés de sa graine (`rockBlobs`, en
  voxels). Un voxel (arête 1,2 cm × échelle) est plein si ses **huit coins** sont dans un
  même bloc : chaque voxel est donc contenu dans la forme de collision, et un centre de
  poisson hors de l'union de sphères n'est jamais dans un voxel (testé coin par coin).
- **Collision** : nouvelle variante `Obstacle` `{ shape: 'spheres', spheres }` ;
  `obstacleDistance` renvoie le minimum des distances signées (distance exacte à l'union
  au-dehors) et la normale de la sphère retenue. L'évitement (ADR 0012) est inchangé. Le
  filet de sécurité de `stepFish` fait jusqu'à 4 passes de projection (sorti d'une sphère,
  le centre peut tomber dans la voisine).
- **Rendu** (`render/rock-model.ts`, `render/decor-layer.ts`) : faces exposées seulement,
  couleurs plates de la palette (`roche`, `rocheSombre`, `sableOmbre`) choisies par un
  hachage du voxel, dessinées après l'eau et le verre comme les poissons (ADR 0009) pour
  garder les teintes exactes. **Contour** d'un pixel : coque de faces arrière, gonflée dans
  le shader le long des normales lissées projetées à l'écran, d'`OUTLINE_WIDTH_PX` pixel de
  la cible (résolution passée en uniforme à chaque image), couleur `koiNoir`. L'eau n'a pas
  de coque, donc jamais de contour.

## Options écartées

- **Enveloppe unique** (une sphère par rocher) : ferme les passages entre rochers proches,
  explicitement refusé par l'issue.
- **Boîtes par voxel** : exactes, mais des centaines de primitives par rocher, à évaluer
  trois fois par poisson et par pas.
- **Voxel plein si son centre est dans un bloc** : rocher plus rond, mais des coins de
  voxels dépassent de la forme de collision ; il faudrait gonfler les sphères d'une
  demi-diagonale, ce qui rétrécit les passages.
- **Contour par détection de discontinuités** (profondeur et normales, dans la passe
  palette) : traiterait aussi le sable, les poissons et le bord du bac, donc changerait les
  couleurs de toutes les captures et des tests de couleurs existants. À reconsidérer si les
  poissons reçoivent un contour.
- **Contour gonflé en mètres** : épaisseur variable avec le zoom.

## Conséquences

- Le monde par défaut change : les poissons naissent hors des rochers et les contournent,
  donc les trajectoires des graines existantes changent (captures à revoir). Les tests qui
  comparent les néons d'un monde mixte à ceux d'un monde de néons seuls doivent donner le
  même décor aux deux mondes.
- Les rochers ne sont pas teintés par l'eau (vue de dessus comprise), comme les poissons.
- Les contours couvrent le décor, pas encore les animaux.
- Coût : 2 à 4 sphères par rocher, évaluées comme une sphère chacune ; quelques centaines
  de faces par rocher, statiques.
