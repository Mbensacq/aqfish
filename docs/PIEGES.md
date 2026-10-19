# Pièges connus

Base de connaissances de l'équipe. **À lire avant de coder ; à compléter** dès qu'un piège
coûte du temps (symptôme, cause, solution, date). Une entrée par piège, la plus récente en
haut de sa section.

## Environnement des agents

- **npm 10 : `Cannot read properties of null (reading 'edgesOut')`** à l'installation
  d'un paquet. Solution : `npx -y npm@11 install <paquet>@<version>`. `npm ci` fonctionne
  normalement avec le `package-lock.json` existant. (2026-10-16)
- **Node 22.22.0** dans l'environnement des agents : Angular 22 refuse de démarrer. Rester
  sur Angular 21 (ADR 0001). (2026-10-16)
- **Maven Central et le portail Gradle sont bloqués** (403 de la politique réseau). Ne pas
  essayer de contourner. Le backend est en NestJS (ADR 0004). (2026-10-16)
- **WebGL en rendu logiciel** (SwiftShader) dans Chromium sans écran : fonctionne, mais
  lent. Ne jamais mesurer de performances ici ; garder les scènes de capture légères.
  (2026-10-16)
- **Navigateurs Playwright** préinstallés dans `/opt/pw-browsers` pour Playwright 1.56 : ne
  pas lancer `playwright install` dans l'environnement des agents, ni changer la version de
  `@playwright/test` sans vérifier que le navigateur correspondant existe. (2026-10-16)

- **Enchaînement des rôles** (mode continu) : chaque rôle déclenche le suivant avec
  `list_triggers` puis `fire_trigger`. Si ces outils manquent ou échouent, ne pas insister :
  la tâche « Relance » relance la chaîne dans l'heure. (2026-10-18)
- **Sessions réveillées après leur phase** : une session qui a ouvert une PR peut être
  relancée par les commentaires de QA ou de Revue. La nuit 0, Dev a ainsi poussé un correctif
  hors cycle (PR #13), sans passer par QA ni Revue. Règle : après la fin de phase, ne plus
  agir (`CLAUDE.md`, démarrage, étape 6). (2026-10-16)
- **Tags et releases refusés** (HTTP 403) dans les sessions des agents : la version se fixe
  dans `frontend/package.json` et c'est le workflow `release.yml` qui crée le tag, la
  release et le déploiement à la fusion. (2026-10-16)
- **Mots-clés de fermeture en anglais uniquement** : `Closes #N` ferme l'issue à la fusion,
  « Ferme #N » ne fait rien. (2026-10-16)
- **GraphQL GitHub indisponible** : `gh issue …`, `gh pr …`, `gh label list`, `gh release …`
  échouent (HTTP 403). Utiliser `gh api` (REST) : `.agents/outils/github-rest.md`. (2026-10-16)
- **Clone superficiel** (`--depth 1`) : seule `main` est suivie. Récupérer une autre branche
  avec une refspec explicite :
  `git fetch origin +refs/heads/<b>:refs/remotes/origin/<b>`. (2026-10-16)
- **Garde-fous de l'environnement** : modifier les réglages du dépôt est refusé (normal :
  interdit de toute façon), et une fusion de PR peut être refusée. Ne jamais contourner :
  étiquette `pret-a-fusionner` et signalement (voir `.agents/prompts/revue.md`). (2026-10-16)

## Tests

- **Mesurer un mouvement du décor sur capture** (cycle 16, #49) : les poissons bougent aussi,
  donc deux captures à 1 s d'écart diffèrent toujours. Ne comparer que les pixels de
  végétation (couleurs que les poissons n'ont pas) et vérifier le test en annulant le
  mouvement (`PLANT_SWAY_RATIO = 0` : 27 pixels changés sur 4 500 contre 2 700 avec
  ondulation). `e2e/plantes.spec.ts`. (2026-10-19)
- **`toBe(0)` et `-0`** : `Object.is(-0, 0)` est faux ; un produit `0 · sin(x)` négatif donne
  `-0`. Comparer `Math.abs(v)` à 0 quand le signe du zéro n'a pas de sens. (2026-10-19)
- **Test de performance : délai Vitest ≠ borne mesurée** (#44) : le délai par défaut d'un
  test Vitest (5 s) couvre tout le test, création du monde et échauffement compris. Un test
  qui borne une durée mesurée à 5 s (`expect(elapsed).toBeLessThan(5000)`) peut donc
  échouer par « Test timed out » sur un runner lent, avant même l'assertion, puis passer à
  la relance. Donner au test un délai explicite nettement supérieur à sa borne
  (`it(nom, fn, 15_000)`), sans relâcher la borne (`flocking.spec.ts`, banc de 60 néons).
  Mesure locale de ce test : ≈ 0,6 à 0,9 s ; la CI a vu 9,3 s pour tout le fichier.
  (2026-10-18)
  Cycle 13 : la CI a vu 6,6 s pour ce test pendant qu'un nouveau test lourd (300 s simulées ×
  3 graines, `trajectory.spec.ts`) tournait en parallèle : un test unitaire de simulation
  longue doit rester court (≲ 2 s par cas en local) pour ne pas affamer les tests de durée.
  (2026-10-18)
  Cycle 14 (#54) : la borne absolue a de nouveau cédé (5,16 s en CI). **Ne plus borner une
  durée en millisecondes** : comparer deux mesures prises dans le même test, en alternance,
  en gardant le minimum de plusieurs essais (`flocking.spec.ts` : 600 pas avec 60 néons
  contre 15, rapport < 40 ; ≈ 10 à 11 mesuré en local, seul comme suite complète, contre
  64 attendu en O(n³)). La charge des fichiers parallèles touche les deux mesures pareil.
  Mesure locale de `trajectory.spec.ts` (3 graines × 60 s simulées) : ≈ 80 à 150 ms par cas.
  (2026-10-19)
  Cycle 18 (#51) : dans `aquarium-host.spec.ts`, faire avancer le monde par défaut image par
  image (`frames.flush`) coûte cher : 45 s simulées passaient en local mais dépassaient 5 s
  en CI. Y garder ≤ 10 s simulées par test, avec un délai explicite (15 s). (2026-10-19)
- **Tests de mutation : délais explicites sous code instrumenté** (#66) : le code instrumenté
  par Stryker est ~5 à 10 fois plus lent. `testTimeout` ne suffit pas : un délai explicite
  (`it(nom, fn, 15_000)`, y compris `it.each(table)(nom, fn, 15_000)`) prime sur la
  configuration. `vitest.mutation.setup.ts` multiplie donc tout délai explicite par 10, sous
  Stryker seulement ; `ng test` n'est pas touché. Un nouveau test lourd n'a rien à faire de
  plus ; une nouvelle forme de déclaration (`it.concurrent`, `test.for`…) avec délai devra
  être ajoutée à ce fichier. (2026-10-19)
- **E2e de geste à la souris lent en rendu logiciel** (#38) : chaque glisser coûte plusieurs
  secondes sous SwiftShader. Pour prouver une borne, un seul glisser long par direction
  suffit s'il la dépasse sans elle ; le vérifier en retirant la borne le temps d'un essai
  (`vues.spec.ts`, pan borné : 29 s → 11 s en local). (2026-10-18)
- **`console.log` invisible dans `ng test`** : la sortie des tests n'est pas affichée. Pour
  explorer des valeurs (réglage de paramètres), les renvoyer dans le message d'un
  `throw new Error(JSON.stringify(…))` d'un spec jetable, puis le supprimer. (2026-10-18)
- **Monde par défaut multi-espèces** (cycle 11) : `createDefaultWorld` contient néons puis
  guppys. Un test qui applique une couche ou un réglage du néon à tout le monde par défaut
  doit d'abord filtrer `species === 'neon'` (`fish-layer.spec.ts`, déphasage des queues).
  Pour prouver qu'une nouvelle espèce ne perturbe pas les autres : comparer les néons d'un
  monde mixte à ceux d'un monde de néons seuls (`world.spec.ts`), et les pixels néon des
  captures avant/après. (2026-10-18)
- **Monde par défaut avec décor** (cycle 15) : `createDefaultWorld` contient des rochers
  (`DEFAULT_DECOR`). Un test qui compare les néons du monde par défaut à ceux d'un monde
  de néons seuls doit donner le même décor aux deux (`createWorld(seed, pop, [],
  DEFAULT_DECOR)`), sinon les trajectoires divergent dès la naissance. (2026-10-19)
- **Population par défaut écrite en dur** : `e2e/neon.spec.ts` compte les poissons du monde
  réel ; changer `defaultPopulation` d'une espèce impose de l'y mettre à jour (cycle 8 :
  8 → 12 ; cycle 11 : 12 néons + 6 guppys). (2026-10-18)
- **Libellé coupé sur deux lignes** : `scrollWidth <= clientWidth` ne détecte pas un retour à
  la ligne dans un bouton. Comparer la hauteur du bouton à celle de ses voisins
  (`white-space: nowrap` sur les boutons de la barre). (2026-10-18)
- **Modifier le code pendant un `npm run verify`** : `ng serve` recompile à chaud et les e2e
  restants testent le code en cours d'écriture (échecs de compilation trompeurs). Lancer
  `verify` sur `main` jusqu'au bout avant de toucher aux sources. (2026-10-18)
- **Analyse pixel art d'une capture hors mode capture** : l'interface (barre des vues) est
  superposée au canvas et n'est pas en pixel art (texte lissé, couleurs hors palette).
  `e2e/pixel-art.spec.ts` masque tout enfant de `app-root` autre que `app-aquarium-host`
  avant la capture ; toute nouvelle interface y échappe ainsi d'office. (2026-10-18)
- **`npm run verify` en parallèle d'autres tâches lourdes** (tests unitaires, build) : le
  test pixel art à pixel ratio 2 a vu une image vide (`colorCount` = 1) sous charge, puis
  est passé seul. Relancer les e2e sans autre charge avant de conclure à une régression.
  (2026-10-18)
- **`requestAnimationFrame` dans `TestBed`** : le remplacer par une file manuelle
  (`vi.spyOn(window, 'requestAnimationFrame')`) pour piloter les images une à une, et
  définir `clientWidth`/`clientHeight` du canvas (jsdom renvoie 0). Exemple :
  `ui/aquarium-host/aquarium-host.spec.ts`. (2026-10-16)
- **jsdom n'a pas WebGL** : tout code qui crée un `WebGLRenderer` échoue dans `ng test`.
  Isoler la logique pure (calculs) pour la tester en unitaire, et couvrir le rendu par le
  bout en bout et les captures. (2026-10-16)

## Simulation

- **Phases tirées de la graine qui coïncident** (cycle 16, #49) : deux graines quelconques
  peuvent donner des phases presque égales (101 et 202 : 0,85 et 0,81 rad), et deux plantes
  voisines bougent alors à l'unisson. Tester l'écart des phases du décor par défaut et
  changer de graine si besoin (`plant.spec.ts`). (2026-10-19)
- **Rapprocher les poissons des vitres** (#43, cycle 13) : raccourcir l'anticipation de
  l'évitement (`LOOKAHEAD_SECONDS`) rapproche bien des vitres mais plaque des poissons dans
  les coins et contre les rochers (tests de coin et `world.spec.ts` rouges). Agir plutôt sur
  `wallMargin` (limite de nage) et `AVOID_ZONE` (portée), puis mesurer avec
  `sim/trajectory.ts` (`glassStats`) sur plusieurs graines, avec et sans rochers : le compte
  de contacts (centre sur la limite `hard`) doit rester nul. La zone de naissance est
  découplée (`SwimBounds.spawn`) : sans cela, les mondes à t = 0 changent et les témoins de
  `e2e/guppy.spec.ts` et `e2e/neon.spec.ts` (vue de dessous à t = 0) voient des poissons
  près de la vitre du fond, au-dessus du bord du sable : le substrat ne cache pas tout.
  (2026-10-18)

- **Cap qui oscille d'un pas à l'autre près d'une paroi** (cycle 9) : une déviation « tourner
  de côté » renormalisée devient discontinue quand le poisson est presque face à la force ;
  dans un coin, une petite force de la seconde paroi qui apparaît ou disparaît (point visé
  qui entre ou sort de sa portée) suffit à inverser le côté du virage, et le cap alterne
  entre deux valeurs à ± `avoidTurnRate · dt` jusqu'au contact. Symptôme : `yaw` identique
  un pas sur deux dans une trace. Solution : déviation continue en cap, calculée dans le
  plan horizontal, et côté départagé par la mémoire du virage (`sim/avoidance.ts`,
  `deflect`, ADR 0012). Explorer une trajectoire avec `npx -y tsx` sur un script hors du
  dépôt (le `console.log` des specs est invisible). (2026-10-18)
- **Tester une trajectoire malgré l'errance** : l'errance aléatoire peut faire demi-tour à un
  poisson sans aucun obstacle (sur 24 poissons lancés en ligne droite, 10 ne dépassent pas
  36 cm en 15 s). Pour tester un comportement géométrique (contourner un rocher), remettre
  `fish.turn = 0` avant chaque pas, et placer la scène dans un grand bac pour qu'aucune paroi
  n'interfère (`swimmer.spec.ts`). (2026-10-18)

## Rendu

- **Ajouter une couleur à la palette sans toucher aux captures de midi** (cycle 19, #64) :
  pour savoir quels pixels une couleur ajoutée capterait, court-circuiter la passe palette
  le temps d'une capture (`gl_FragColor = vec4(color, 1.0)` dans `render/palette-pass.ts`,
  à ne pas committer), puis rejouer la quantification en Python (Numpy) sur toutes les
  captures avant/après. Mesure du cycle 19 : aucun sable nocturne n'était possible, l'eau
  de midi (`#3b685d` avant quantification) étant trop proche du sable de minuit
  (`#486068`) (ADR 0019). Ne pas lancer `prettier` sur `docs/` : il reformate les tableaux
  de tous les documents (`npm run format` ne couvre que `frontend/`). (2026-10-19)
- **Assombrir la scène sans casser les captures de midi** (cycle 18, #51) : la passe
  palette choisit la couleur la plus proche ; une caustique translucide (opacité réduite
  avec la lumière) sur un sable assombri retombe sur des couleurs ternes (craquelures
  brunes), et un reflet de surface trop faible devient brun sur l'eau de nuit. Préférer des
  paliers de couleurs pleines de la palette (`render/water-light.ts`, `CAUSTIC_STAGES`).
  Pour l'identité à l'octet des captures par défaut : mélanges `a · (1 − t) + b · t` ou
  `Color.lerpColors(a, b, 0)` (exacts aux bornes), et `cmp` des captures avant/après.
  (2026-10-19)
- **Face supérieure de l'eau invisible du dessous** (cycle 17, #50) : le volume d'eau est en
  `FrontSide` ; vue de dessous, sa face du haut est éliminée. Un effet de surface visible
  des deux côtés va sur un plan à part en `DoubleSide` (`render/water-light.ts`).
  Et un effet translucide posé sous l'eau (caustiques à 45 % sur le sable) est teinté par
  l'eau puis ramené par la passe palette vers `eauTresClaire` : le dessiner après l'eau et
  le verre, en couleur pleine de la palette. (2026-10-19)
- **Taille de point en pixels de la cible** (cycle 17) : `PointsMaterial` avec
  `sizeAttenuation: false` donne une taille en pixels de la surface de rendu : 1 pixel de
  scène en pixel art, mais 1 pixel d'écran sans filtre. Multiplier par
  `PIXEL_SIZE × pixelRatio` en mode `aucun` (`render/bubble-layer.ts`). (2026-10-19)
- **Contour en coque gonflée sur des voxels** (cycle 15) : gonfler la coque selon les
  normales des faces l'ouvre aux arêtes (faces disjointes). Utiliser des normales lissées
  (moyenne des faces au même sommet, `render/rock-model.ts`) et un décalage en pixels de la
  cible dans le shader (résolution en uniforme, à tenir à jour dans les deux filtres). Aux
  sommets concaves, la normale lissée peut rentrer dans la forme : sans effet visible.
  (2026-10-19)

- **Rendu sans filtre (`filtre=aucun`) : peu de couleurs, teintes différentes** : la scène est
  en couleurs plates sans anticrénelage, donc une vingtaine de couleurs seulement (un test
  « plus de couleurs que la palette » échoue) ; et les translucides s'y mélangent en sRGB à
  l'écran, d'où un sable plus vert et une eau plus sombre qu'en pixel art. Distinguer les
  deux modes par les couleurs hors palette et les blocs de `PIXEL_SIZE` rompus
  (`e2e/filtre.spec.ts`). (2026-10-18)
- **Petits objets et surfaces translucides** : un poisson de 2 à 4 pixels de scène change de
  couleur de palette dès qu'il est éclairé ou vu à travers l'eau ou même le verre (8 %
  d'opacité : le rouge néon devenait rouge koï). Les animaux sont en couleurs plates et
  dessinés après l'eau et le verre (ADR 0009). Vérifier les couleurs exactes d'une capture
  avec un histogramme (Pillow : `Counter(Image.open(p).convert('RGB').getdata())`), pas
  seulement à l'œil. (2026-10-18)

- **Translucides plus clairs dans la cible basse résolution** : dans une `WebGLRenderTarget`
  (sRGB ou linéaire), le mélange alpha se fait en espace linéaire, alors qu'à l'écran il se
  faisait sur des valeurs sRGB. L'eau et le verre à faible opacité paraissent donc plus
  clairs sur fond sombre (la lame d'air tombait sur `rocheSombre`, brun). Vérifier les
  teintes sur capture après tout changement d'opacité, et compléter la palette si besoin.
  (2026-10-17)
- **Doubles du renderer** : l'interface `AquariumRenderer` inclut `setRenderTarget`. Un double
  qui compte les images doit ne compter que les rendus à l'écran (cible `null`), chaque image
  faisant deux `render` (scène puis passe palette). (2026-10-17)

- **Préréglage strictement vertical** (caméra à l'aplomb de sa cible) : `lookAt` et
  `OrbitControls` deviennent indéterminés car l'axe « haut » (Y) est colinéaire à la
  direction de visée. Garder un décalage infime en Z (`render/camera-presets.ts`).
  (2026-10-16)
- **Surfaces translucides superposées** (eau, verre) : `depthWrite: false`, `FrontSide`,
  `renderOrder` explicite (eau puis verre puis arêtes), et le verre légèrement plus grand que
  l'eau pour éviter le scintillement de profondeur entre faces confondues. (2026-10-16)
- **Taille nulle au premier rendu** : à l'exécution de `afterNextRender`, le canvas peut
  encore mesurer 0 × 0. Ne lever le signal « prêt » qu'après un rendu de taille non nulle,
  à l'image suivante (`ui/aquarium-host/aquarium-host.ts`). (2026-10-16)
