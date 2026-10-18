# 0009 — Poissons : modèles voxel à couleurs plates, dessinés après l'eau et le verre

- Statut : acceptée
- Date : 2026-10-18
- Auteur : Dev (Claude), cycle 3 (issue #8)

## Contexte

Le néon est le premier animal du bac. À la résolution du pixel art (`PIXEL_SIZE = 3`, un
pixel de scène ≈ 7 mm dans les vues par défaut), un poisson ne mesure que 2 à 4 pixels de
scène de haut. Les premières captures ont montré que ses couleurs ne survivaient pas à la
quantification (ADR 0007) :

- éclairé (`MeshLambertMaterial`), le bleu néon des flancs tombait sur une teinte d'eau ;
- vu à travers l'eau translucide, tout le poisson prenait la teinte de l'eau ;
- vu à travers le verre (8 % d'opacité), le rouge néon devenait le rouge koï et le dos
  passait d'une teinte de roche à l'autre.

## Décision

- **Modèles voxel générés par le code** (`render/fish-model.ts`) à partir de la définition
  déclarative de l'espèce (`sim/species.ts`) et d'un gabarit de profil (une chaîne par
  rangée, un caractère par rôle de couleur). Seules les faces visibles sont émises. Corps et
  queue sont deux géométries distinctes ; la queue pivote à l'arrière du corps.
- **`InstancedMesh`** par espèce et par partie (`render/fish-layer.ts`), matrices
  recalculées à chaque image sans allocation, positions et angles interpolés entre deux pas
  avec le facteur `alpha` de la boucle à pas fixe. En capture, `alpha = 1` : l'image montre
  exactement l'état au temps demandé.
- **Couleurs plates** : `MeshBasicMaterial` à couleurs de sommets, sans éclairage. Les
  couleurs des espèces sont des couleurs de la palette (vérifié par un test unitaire).
- **Ordre de rendu** : file des transparents (opacité pleine), `renderOrder = 2.5`, après
  l'eau (1) et le verre (2), avant les arêtes (3). Les poissons ne sont pas teintés par
  l'eau ni par le verre ; ils restent masqués par les objets opaques (sable) grâce au test
  de profondeur.
- **Ondulation** : lacet du corps et battement de la queue en fonction d'une phase avancée
  par la simulation (proportionnelle à la vitesse), jamais du temps réel.

## Options écartées

- Éclairage Lambert avec une lumière plus forte : la teinte dépend encore de l'angle, et le
  bleu néon bascule sur l'eau sous certaines vues.
- Ajouter à la palette des variantes « vues sous l'eau » de chaque couleur d'animal : la
  palette doublerait à chaque espèce.
- Déformation du corps dans un shader (vertex shader) : plus souple, mais non testable sans
  WebGL et prématurée pour un modèle de 10 voxels de long.

## Conséquences

- Les animaux ressortent nettement sur l'eau, au prix d'un rendu sans ombrage : la forme se
  lit par les couleurs du gabarit (dos sombre, ventre clair). Les contours de silhouette
  (ADR 0002, point 3) compenseront quand ils arriveront.
- Toute nouvelle espèce doit n'utiliser que des couleurs de la palette.
- Une future surface d'eau ou effet de profondeur (brouillard, caustiques) devra s'appliquer
  aux poissons explicitement, puisqu'ils ne passent plus sous les surfaces translucides.
