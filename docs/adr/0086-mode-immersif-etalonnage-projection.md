# 0086 — Mode immersif, lot 1 : étalonnage et projection décentrée

- Statut : acceptée
- Date : 2026-10-31
- Auteur : Dev, cycle 115, issue #345

## Contexte

Idée de Mathis #340 : l'écran devient la vitre de l'aquarium. Lot 1/2 : étalonner l'écran,
donner au bac la taille de l'écran et coller la vue à la vitre par une projection décentrée.
Le lot 2/2 portera la parallaxe (gyroscope), les interactions, le plein écran et le Wake Lock.
Contraintes : aucune modification de la caméra libre (ADR 0084, 0085), captures de la vue
normale identiques à l'octet, sauvegarde inchangée, `localStorage` faillible.

## Décision

- **Étalonnage** (`core/immersive/screen-calibration.ts`) : carte ID-1 (ISO/IEC 7810,
  85,60 × 53,98 mm) posée contre l'écran, rectangle ajusté à sa largeur ; pixels CSS par
  millimètre = largeur / 85,60. **Défaut estimé** : pixel CSS de référence (96 px par pouce,
  3,78 px/mm), signalé à l'écran (« Taille de l'écran estimée »). Bornes [1 ; 20] px/mm : en
  dehors, la mesure est une erreur de manipulation (refus, `RangeError`). Conservé sous
  `aqfish.etalonnage-ecran`, à part de la sauvegarde (comme `aqfish.filtre`), chaque accès
  protégé, dernière valeur gardée en mémoire pour la session si l'écriture échoue.
- **Projection décentrée** (`core/immersive/off-axis.ts`, fonctions pures) : tronc de vue
  dont les bords passent par ceux de l'écran (Thalès sur le plan proche), matrice en ordre
  colonne posée telle quelle sur la caméra (`AquariumView.setImmersiveCamera`), caméra
  parallèle à la vitre avant. L'œil est centré dans ce lot ; le calcul accepte un œil décalé
  (parallaxe du lot 2). Plan proche à mi-distance de la vitre (rien entre l'œil et la vitre).
- **Distance d'œil** réglable, bornée à [15 ; 150] cm. Défauts selon la diagonale de l'écran :
  **35 cm** au téléphone (moins de 20 cm de diagonale, tenu à la main), **45 cm** à la
  tablette (moins de 33 cm), **60 cm** à l'ordinateur. Ordres de grandeur usuels (lecture sur
  téléphone vers 30 à 40 cm ; écran d'ordinateur à au moins 50 cm selon les recommandations
  d'ergonomie courantes) : **approximations de jeu**, références à consulter, non vérifiées
  ici. Le réglage corrige.
- **Bac aux dimensions de l'écran** (`sim/immersive-tank.ts`) : vitre avant aux proportions
  exactes de l'écran. Le bac réglable (`TANK_LIMITS`, au moins 60 × 50 cm) ne le permet pas
  (un téléphone en portrait fait environ 6,5 × 14 cm) : le monde immersif a ses propres
  bornes `IMMERSIVE_LIMITS` (largeur [0,3 ; 2] m, hauteur [0,4 ; 1,5] m, profondeur
  [0,25 ; 0,9] m, sans pas), par un lieu `immersive: true` lu seulement à la création du
  monde. Les minimums gardent une zone de nage non vide aux marges des petites espèces. Le bac
  est à l'échelle réelle quand l'écran est assez grand, sinon agrandi uniformément du plus
  petit facteur `scale` qui atteint les minimums ; la distance d'œil est multipliée d'autant,
  si bien que l'image est la même qu'à l'échelle 1 (la projection ne dépend que des
  rapports). Les animaux paraissent alors `scale` fois plus petits que nature (environ 4,6 au
  téléphone en portrait, 2 à l'ordinateur portable). Proportions hors de [0,2 ; 5] : bornées
  et signalées (`aspectClamped`).
- **Profondeur** réglable de 2 à 60 cm, défaut 0,6 × le petit côté de l'écran.
- **Contenu** : mode décor (#278, ADR 0077 : ni eau à entretenir ni alerte), sans décor, trois
  plus petites espèces nageuses (8, 5, 3 individus), rappel « pas une simulation réaliste ».
  Monde à graine fixe, jamais sauvegardé.
- **Composant** `ui/immersive-mode/` : plein cadre au-dessus de l'application, sa propre vue
  et sa propre boucle ; bac et vue recréés quand la taille physique change (redimensionnement,
  rotation, étalonnage, profondeur). Entrée : bouton « Mode immersif » sur la ligne du titre
  « Simulation » de « Réglages » (le panneau ne grandit pas). Sortie : « Quitter » ou Échap.

## Options écartées

- **Garder le bac réglable et ne montrer qu'une partie de la vitre** : les coins de l'écran
  ne seraient plus ceux de la vitre (critère de l'issue).
- **Bac à l'échelle réelle sur téléphone** : zone de nage vide ou inversée avec les marges
  actuelles des espèces ; à revoir si des marges proportionnelles à la taille arrivent.
- **Basculer le bac affiché de l'hôte en mode immersif** : il faudrait suspendre la
  sauvegarde, le tableau de bord et l'édition ; un monde à part est plus sûr.
- **Distance d'œil unique** : 60 cm rend un téléphone trop « profond », 35 cm aplatit un
  écran de bureau.

## Conséquences

- La vue normale et ses captures ne changent pas (mode absent en capture, aucun champ de
  sauvegarde) : bac et rendu identiques. Précision (#355) : les quatre captures montrant le
  panneau « Réglages » (`front-panneau`, `telephone-eau`, `telephone-liste-bacs`,
  `three-quarter-panneau-eau`) changent, par le seul bouton « Mode immersif » ajouté au
  panneau. Pendant le mode, l'hôte ne rend plus rien et son bac est en pause
  (`AquariumHost.setRenderingSuspended`) : un seul contexte WebGL travaille ; à la sortie, la
  boucle repart sans rattraper le temps passé. Limitation des images par seconde : lot 2.
- Les animaux ne sont pas à taille réelle sur petit écran (voir l'échelle ci-dessus).
