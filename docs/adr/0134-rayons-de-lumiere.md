# 0134 — Rayons de lumière dans l'eau : traits tramés tournés vers la caméra

- Statut : acceptée (complète les ADR 0017, 0018 et 0098)
- Date : 2026-11-12
- Auteur : Dev, cycle 203, issue #567

## Contexte

`docs/DA.md` prévoit des « rayons de lumière discrets dans l'eau ». L'eau avait ses
caustiques et son reflet (ADR 0017), suivis par la lumière du jour (ADR 0018), mais rien dans
le volume. L'issue #567 demande des rayons selon l'heure et la météo, qui ondulent, s'éteignent
la nuit, fixes sous « Réduire les mouvements », sans bruit en capture et pour un coût mesuré.

## Décision

1. **Grandeurs pures** dans `sim/light-rays.ts` : `lightRaysAt(heure, couverture)` donne la
   force (l'intensité du jour `dayIntensityAt`, nulle la nuit, partielle à l'aube et au
   crépuscule, × `1 − c · (1 − OVERCAST_RAY_RATIO)` sous un ciel couvert, 0,35 sous la pluie)
   et l'inclinaison (`MAX_RAY_TILT · sin(2π (h − 12) / 24)`, verticale à midi, 0,5 rad au plus
   à 6 h et 18 h, valeur de jeu sous la fenêtre de Snell). Variante sans allocation
   `lightRaysInto`. La vue dérive la couverture du facteur de ciel couvert
   (`(1 − overcast) / (1 − RAIN_OVERCAST_BRIGHTNESS)`), fondu de la pluie compris.
2. **Rendu** (`render/light-rays-layer.ts`) : cinq faisceaux à positions fixes (fractions du
   bac, sans tirage), un quadrilatère chacun dans **un seul maillage**, tourné vers la caméra
   autour de la verticale dans le shader et cisaillé par la pente `tan(inclinaison)`. Chaque
   faisceau est découpé en colonnes de cases de 1 cm ; chaque colonne est un **trait continu**
   depuis la surface, plus long au cœur qu'aux bords, absent pour une colonne sur trois
   environ (graine au nombre d'or), le bout effiloché par un Bayer 4 × 4. Une seule couleur
   (`eauTresClaire`, celle du reflet) d'opacité fixe 0,3 ; les traits raccourcissent jusqu'à
   disparaître quand la vue est plongeante (dessus, dessous). Référence TypeScript du GLSL
   (`rayLength`, `rayCellLit`) pour les tests.
3. **Environnements** : bac tropical, récif et bassin (le seul où il pleut). Paludarium et eau
   froide sans rayons.
4. **Mouvement** : balancement du pied et longueur des traits qui respire, au temps d'une
   horloge décorative `raysClock` (ADR 0098, #409) de vitesse `MotionFactors.lightRays` :
   1 normalement, **0 sous « Réduire les mouvements »** (rayons fixes, sans saut à la
   bascule). Exposé aux e2e par `data-aqfish-rayons` (`force;temps`, au plus une écriture par
   seconde).

## Options écartées

- **Tramage ordonné sur toute la surface du faisceau** (premier essai) : nuage de points épars,
  lu comme du bruit sur `side` et `three-quarter`. Les traits continus se lisent comme des
  rayons.
- **Deux plans croisés par faisceau** : vus de chant, ils dessinaient un trait d'un pixel trop
  dense ; un seul plan tourné vers la caméra évite le cas et divise la géométrie par deux.
- **Couleur propre au récif** : `eauRecifClaire` en entrée retombait sur l'eau elle-même après
  la passe palette (invisible), du blanc (`koiBlanc`) sur le violet des coraux. Le vert clair
  du reflet, déjà présent à la surface du récif, est gardé.
- **Opacité selon la force** : un dégradé translucide ternit après la passe palette
  (`docs/PIEGES.md`) ; la force raccourcit les traits à la place.

## Conséquences

- Coût : **1 appel de dessin, 20 sommets, 10 triangles** de plus, 2 attributs de sommet
  (`position`, `aRay` en `vec4`), shader sans boucle ; fragments limités aux faisceaux, la
  plupart rejetés (`discard`). Rien la nuit (maillage masqué sous `MIN_RAY_STRENGTH`) ni hors
  des trois environnements. Ordre de grandeur négligeable devant les poissons instanciés ;
  l'objectif de 60 images/s reste mesuré par Mathis (`docs/ARCHITECTURE.md`, « Budgets »).
- Captures de côté et de trois-quarts changées le jour ; `top`, `bottom` et la nuit
  identiques à l'octet.
- Rien dans `sim/world.ts` ni dans la sauvegarde : la simulation est inchangée.
