# 0163 — Couches, chaîne de passes, lumière et lancers de rayon hors de `AquariumView`

- Statut : acceptée
- Date : 2026-11-20
- Auteur : Dev
- Chantier : assainissement #686, lot 12 (#698), deuxième tranche

## Contexte

Après la première tranche (ADR 0162), `render/aquarium-view.ts` faisait encore 1 542 lignes :
déclaration et construction des dix-sept couches, chaîne de passes (`renderFrame`,
`takePhoto`, cibles), lumière du jour, ciel couvert et tons de la passe palette, lancers de
rayon. `createAquariumScene` faisait 163 lignes (complexité 19) et `buildVoxelMesh` 145
(complexité 29). Le rendu doit rester identique au pixel près.

Contrainte cachée : Three.js numérote objets et matériaux à leur création, et le tri des
objets opaques départage par `material.id` puis `id` à égalité d'ordre de rendu. Changer
l'ordre de création des couches par rapport à la scène peut donc changer l'image.

## Décision

1. **`ViewLayers`** (`view-layers.ts`) crée la scène et toutes les couches **dans l'ordre
   d'origine** (décor, pièce, nourriture, œufs, algues, voile, repères d'alerte, puis la
   scène, les poissons et les effets), les ajoute à la scène et les libère ; elle porte les
   réglages communs (`setFlatBrightness`, `setResolution`, `setPointScale`).
2. **`FramePipeline`** (`frame-pipeline.ts`) porte le renderer, la taille du canvas, la passe
   palette, la cible sans filtre, l'image et la photo ; la vue lui passe un `FrameScene`
   créé une fois (scène, caméra, réglages par image), sans allocation par image.
   `AquariumRenderer` y vit, réexporté par `aquarium-view.ts`.
3. **`SceneLighting`** (`scene-lighting.ts`) : lumière du jour, ciel couvert et son fondu,
   rayons, ombre des plantes, teinte brun-thé et tons proposés à la passe palette.
4. **`ViewPicker`** (`view-picker.ts`) : lancers de rayon (surface, décor, plan, rayon brut).
5. La vue garde son API publique par délégation et la garde `disposed`.
6. `createAquariumScene` se découpe en `addFloor`, `addBorder` et `createSceneTone` (mêmes
   créations, même ordre) ; `buildVoxelMesh` garde sa signature dans `fish-model.ts` et
   délègue à `voxel-mesh.ts` (grille, émission des faces, parties paires, rangs de taché et
   d'effilochage, réexportés).

## Conséquences

- `aquarium-view.ts` : 1 127 lignes (653 hors blancs et commentaires) ; exceptions de
  `aquarium-scene.ts` retirées, celles de `fish-model.ts` réduites à la taille du fichier et
  au nombre de paramètres de `buildVoxelMesh`.
- Tests de caractérisation ajoutés avant le découpage : empreinte de la scène construite et
  réglée de chaque environnement (`aquarium-scene.caracterisation.spec.ts`), empreinte des
  maillages de chaque silhouette (`fish-model.spec.ts`). Le test du lancer de rayon du
  pointeur passe par `picker`, mêmes assertions.
- Toute nouvelle couche se déclare dans `ViewLayers`, à la place qui garde l'ordre de
  création des couches existantes.
