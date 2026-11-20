# 0162 — Caméra et gestes du pointeur hors de `AquariumView`

- Statut : acceptée
- Date : 2026-11-20
- Auteur : Dev
- Chantier : assainissement #686, lot 12 (#698), première tranche

## Contexte

`render/aquarium-view.ts` faisait 2 315 lignes (1 641 hors blancs et commentaires) : la vue
portait à la fois la scène, le pipeline de passes, la caméra (préréglages, transitions,
orbite du fond d'écran, caméra libre, mode immersif) et les gestes du pointeur (clic,
glissement du décor et de la pièce, raclette, orientation et pincement de la caméra libre).
`onDragPointerDown` avait une complexité de 26 et le constructeur 97 lignes.

Deux contraintes :

1. **Ordre des écouteurs du canvas** (`docs/PIEGES.md`, cycle 57) : `OrbitControls` pose son
   `pointerdown` à sa construction ; glisser et raclette écoutent en phase de capture pour
   lui couper la main ; les gestes de la caméra libre lisent l'état du glisser et de la
   raclette, et le pincement efface le clic en attente. Les écouteurs doivent garder leur
   ordre d'enregistrement.
2. **API publique inchangée** : l'hôte (`ui/aquarium-host/`) et les tests appellent la vue.

## Décision

1. **Trois classes dans `render/`, sans Angular**, chacune avec une interface d'hôte étroite
   (pas de référence à `AquariumView`, donc aucun cycle d'import) :
   - `DragController` (`drag-controller.ts`) : clics, glissement du décor et de la pièce,
     raclette ; `DragHost` lui donne le canvas, les contrôles, les lancers de rayon de la vue
     et la pièce courante ;
   - `CameraController` (`camera-controller.ts`) : préréglages, transitions, orbite du fond
     d'écran, mode immersif ; `createOrbitControls` y règle les contrôles ;
   - `FreeCameraGestures` (`free-camera-gestures.ts`) : caméra libre et ses gestes, détenue
     par `CameraController`.
2. **Ordre de construction = ordre des écouteurs** : contrôles, puis `DragController`, puis
   `CameraController` (qui crée `FreeCameraGestures`). Chaque classe pose ses écouteurs dans
   son constructeur, dans l'ordre d'origine, et les retire dans son `dispose`.
3. **La vue délègue** : elle garde toutes ses méthodes publiques et leur documentation ;
   les types et fonctions sortis (`DecorDragListener`, `ImmersiveCamera`, `ORBIT_*_ACTIONS`,
   `strokePoints`, `StrokePoint`, `STROKE_STEP_PX`) sont réexportés par `aquarium-view.ts`.
4. **Contrôles rendus après un geste** : `DragHost.orbitAllowed()` (vue interactive, non
   libérée, hors caméra libre) remplace la lecture directe des champs de la vue ; la sortie
   de la caméra libre lit `DragHost` par `dragging()`, comme avant.

## Conséquences

- `aquarium-view.ts` : 1 542 lignes (994 hors blancs et commentaires) ; exceptions de
  complexité et de longueur de fonction retirées, exception de taille abaissée.
- Tests de caractérisation ajoutés avant l'extraction (`decor-drag.spec.ts` : glisser du
  décor et de la pièce, clics, gestes de la caméra libre). Trois tests de
  `aquarium-view.spec.ts` lisaient des champs privés de la caméra : ils passent désormais par
  `cameras`, mêmes assertions.
- Deuxième tranche : pipeline de passes, construction de la scène
  (`aquarium-scene.ts`) et `buildVoxelMesh` (`fish-model.ts`).
