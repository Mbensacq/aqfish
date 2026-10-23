# 0044 — Déplacer, tourner et redimensionner le décor

- Statut : acceptée
- Date : 2026-10-24
- Auteur : Dev, cycle 57, issue #168

## Contexte

Après l'ajout et la suppression (ADR 0043), l'éditeur de décor doit déplacer un élément en le
faisant glisser (souris ou doigt), le tourner et changer son échelle. Deux risques : le
glissement d'un élément entre en conflit avec l'orbite de la caméra (`OrbitControls`, qui écoute
le même `pointerdown` du canvas), et un élément posé contre un autre peut former une poche où un
poisson resterait enfermé.

## Décision

- **Fonctions pures** (`sim/decor-edit.ts`), sur le modèle de l'ADR 0043 (nouveau tableau,
  `null` si rien ne change) : `moveDecorItem` (position bornée par `clampDecorPosition`),
  `rotateDecorItem` (pas de 15°, angle dans [0, 2π)), `scaleDecorItem` (pas de 0,25, borné à
  [`MIN_DECOR_SCALE`, `MAX_DECOR_SCALE`], position rebornée).
- **Emprise** (`decorFootprint`) : rayon du disque horizontal qui contient tous les voxels de
  l'élément quelle que soit sa rotation (plus l'ondulation d'une plante). Le centre est borné à
  `demi-côté − emprise` (au moins `DECOR_EDGE_MARGIN`) ; un élément plus large que le bac est
  centré sur l'axe concerné. Indépendante de la rotation : tourner ne fait jamais sortir un
  élément.
- **Chevauchement** (`isDecorPoseAllowed`) : une pose est refusée si les formes de collision de
  l'élément (sphères, ADR 0015) pénètrent celles d'un élément qu'il ne pénétrait pas déjà.
  C'est la condition nécessaire pour qu'une poche se forme entre deux éléments ; tolérer un
  chevauchement hérité (décor importé) évite de bloquer l'élément sur place. Rotation et échelle
  refusées laissent la pose inchangée ; un glissement refusé ramène l'élément à sa dernière pose
  valide, et l'éditeur l'annonce.
- **Glissement** (`render/aquarium-view.ts`) : en mode édition, un écouteur `pointerdown` en
  **phase de capture** sur le canvas passe avant `OrbitControls` ; s'il touche un élément
  (`pickDecor`), il coupe les contrôles pour tout le geste, capture le pointeur et suit le rayon
  sur le plan du sable (`sandPlanePoint`, non borné), en gardant l'écart entre le point saisi et
  le centre. Un appui dans le vide laisse la caméra tourner comme avant. Au-delà de 4 px
  seulement (`CLICK_TOLERANCE_PX`) : un simple clic sélectionne sans déplacer.
- **Aperçu sans reconstruction** : pendant le glissement, seul le groupe de l'élément est
  déplacé (`DecorLayer.moveItem`) ; le monde (obstacles) et la sauvegarde ne changent qu'au
  lâcher, une fois la pose acceptée.
- **Commandes** : flèches gauche et droite (±15°), `+` (ou `=`) et `−` (échelle), et quatre
  boutons du panneau, de 44 px au moins sur écran tactile ou étroit.

## Options écartées

- **Couper `OrbitControls` dès l'entrée en mode édition** : on ne pourrait plus tourner autour
  du bac pour viser un élément.
- **Refuser tout chevauchement, y compris hérité** : un élément importé qui touche son voisin ne
  pourrait plus être tourné ni réduit sur place.
- **Détecter réellement une poche fermée** (volume libre clos entre les formes) : coûteux et
  fragile ; le refus du chevauchement suffit à l'empêcher.
- **Mettre à jour les obstacles à chaque mouvement** : recalcul et sauvegarde à chaque image,
  et poissons repoussés par une pose qui sera peut-être refusée.

## Conséquences

- Les touches de l'éditeur sont décrites dans son panneau (consigne et `aria-keyshortcuts`) ;
  l'aide-mémoire « Commandes » ne les liste pas encore (#176).
- Un poisson recouvert par un élément déplacé en est sorti au pas suivant, comme pour un ajout
  (ADR 0043).
