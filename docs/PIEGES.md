# Pièges connus

Base de connaissances de l'équipe. **À lire avant de coder ; à compléter** dès qu'un piège
coûte du temps (symptôme, cause, solution, date). Une entrée par piège, la plus récente en
haut de sa section.

## Environnement des agents

- **Identifiant d'environnement : lettres minuscules seulement** (cycle 87, #271) :
  `environnement=` n'accepte que `^[a-z]{1,20}$` (`core/capture/capture-params.ts`) ; un
  identifiant à tiret (`eau-froide`, essayé d'abord) est ignoré **sans erreur** et l'URL
  retombe sur le bac tropical : les captures du nouvel environnement montraient le bac
  tropical, tests unitaires et e2e du panneau verts. D'où `eaufroide`. Regarder la première
  capture d'un nouvel environnement avant de conclure. (2026-10-27)
- **Ajouter des tests e2e déplace les limites des parts de la CI** (cycle 81, #260) : les
  parts (`--shard=N/4`, 6 parts depuis #248) sont des tranches de fichiers de taille égale en nombre de tests ;
  quatre tests de plus ont fait glisser `meubles-qa.spec.ts` dans la part 2, déjà au ras de
  son délai de 30 min (#248) : part 2 annulée deux fois, sans aucun test touché par la PR.
  Comparer `npx playwright test --project=e2e --shard=2/4 --list` sur `main` et sur la
  branche (worktree de `origin/main` avec un lien vers `node_modules`) ; regrouper les
  vérifications en peu de tests (une boucle de largeurs dans un test, `test.step`) plutôt
  qu'un test par largeur. (2026-10-27)
- **Budget de style du panneau de réglages : 8 kB** (cycle 79, #237) : `control-panel.scss`
  approche déjà du plafond ; les styles des fiches (une soixantaine de lignes) l'ont porté à
  8,01 kB et `ng build` échoue (budget d'erreur 8 kB, `angular.json`), alors que tests et
  lint passaient. Ajouter le nouveau sélecteur aux règles communes existantes (bordure, fond,
  focus des boutons d'espèce) au lieu de les recopier, et lancer `npm run build` tôt.
  (2026-10-26)
- **Prouver « captures identiques à l'octet » en local** (cycle 84, #269) : le Chromium local
  (1243 via le lien ci-dessous) n'est pas celui de la CI, donc comparer aux captures de
  `captures/latest/` n'a pas de sens. Générer celles de `main` dans un worktree
  (`git worktree add ../aqfish-main origin/main`, lien vers `node_modules`, `E2E_PORT=4310`,
  autre `CAPTURE_DIR`) en parallèle des siennes, puis `cmp` fichier par fichier (~10 min
  chacune). Ne pas lancer `verify` sur `main` dans le clone pendant qu'on y modifie le code :
  il lit l'arbre de travail courant. (2026-10-27)
- **Serveur de `ng serve` orphelin après un `verify` interrompu** (cycle 79) : tuer
  `playwright test` laisse `ng serve --port 4300` tourner ; les captures lancées ensuite depuis
  un autre worktree le réutilisent et photographient l'ancien code (capture neuve en délai
  dépassé, captures du panneau identiques à `main`). Vérifier `ps aux | grep "ng serve"` et
  donner un autre port (`E2E_PORT=4310`). (2026-10-26)
- **`npm run verify` complet impossible en local en une session** (cycle 78, #236) : sur
  2 cœurs en rendu logiciel, l'e2e passe ~25 à 50 s par test (22 tests en 12 min, un test du
  récif en délai dépassé à 2 min) : plus de 3 h pour les ~300 tests. Lancer en local
  formatage, lint, tests unitaires, build et captures, puis seulement les specs e2e touchées
  (`npx playwright test --project=e2e e2e/ph.spec.ts …`) ; la suite complète tourne en CI
  (4 lots). Le dire dans la PR. Le lien `chromium_headless_shell-1194` (plus bas) est à
  recréer à chaque session. (2026-10-26)
- **Lancer une seule spec unitaire pendant un `verify`** (cycle 75, #233) : `ng test`
  reconstruit tout et dure ~3 min, et un second `ng` en parallèle du `verify` se dispute le
  cache. Pour une spec de `src/app/sim`, lancer Vitest directement depuis `frontend/` :
  `npx vitest run --globals src/app/sim/frog.spec.ts -t "233"` (quelques secondes, aucun
  fichier de `src/` touché donc aucun rechargement de l'e2e). Le `verify` reste la preuve
  avant la PR. (2026-10-26)

- **Voir l'inclinaison d'un petit amphibien sur capture** (cycle 74, #223) : à 1280 × 720 un
  triton fait une dizaine de pixels. Chercher par la simulation pure les instants où il saute
  de profil (vue `side` : cap ≈ ±π/2 ; vue `front` : cap ≈ 0 ou π), capturer à ces `time=`
  en 1920 × 1080 avec `deviceScaleFactor: 2` et `filtre=aucun`, puis recadrer autour des
  pixels orange (`#e07a2f`). Les positions ne dépendant pas de l'inclinaison, les mêmes
  instants servent avant et après. (2026-10-26)

- **`pkill -f "npm run verify"` tue son propre shell, pas le `verify`** (cycle 61) : le motif
  figure aussi dans la ligne de commande du shell qui lance `pkill` ; il se tue (code 144)
  avant les autres, et le `verify` visé continue. Deux e2e ont alors tourné ensemble sur le
  même serveur (délais dépassés sur `anemones-qa` et `axolotl-qa`). Arrêter par numéro de
  processus (`ps -ef | grep playwright`, puis `kill <pid>`), et vérifier qu'il ne reste
  aucun `playwright test` ni `ng serve` avant de relancer. (2026-10-24)
- **Modifier `src/` pendant un e2e recharge la page** (cycle 60) : le serveur de Playwright
  (`ng serve`, réutilisé hors CI) recompile et recharge l'application à chaque modification
  d'un fichier de l'application ; le test en cours repart d'un monde neuf (`data-aqfish-tick`
  petit, mode édition fermé) et échoue sans raison apparente. Ne pas toucher `src/` pendant
  un e2e ou des captures (les `*.spec.ts` unitaires, `e2e/` et `docs/` ne déclenchent rien).
  (2026-10-24)
- **Panneau « Réglages » à 1280 × 720 : plus de place pour une section** (cycle 71, #207) :
  avant la section « Eau », le contenu laissait ~12 px de marge ; elle en prend ~107. Le
  panneau passe sur deux colonnes (`column-count: 2`, sections `break-inside: avoid`) au-delà
  de 900 px de large et en deçà de 900 px de haut. Mesurer `scrollHeight` et `clientHeight`
  du panneau dans chaque environnement avant d'ajouter une ligne. (2026-10-25)
- **Curseur `range` : `[value]` borné par l'ancien `max`** (cycle 60, #171) : avec
  `[attr.max]` lié dans un `@for`, Angular peut poser la valeur avant les bornes ; une valeur
  au-delà du `max` par défaut (100) est ramenée à 100. Écrire `min`, `max` et `step` en
  attributs statiques (posés à la création de l'élément), puis lier `[value]`. (2026-10-24)
- **`npx prettier --write ../docs` reformate toute la documentation** (cycle 86) : Prettier
  ne couvre que `frontend/` (`format:check`) ; lancé sur `docs/`, il réécrit des dizaines de
  fichiers Markdown sans rapport. Ne formater que les fichiers touchés, ou pas du tout les
  `.md`. Rattrapage : `git checkout HEAD -- docs` puis réappliquer ses propres changements.
  (2026-10-27)
- **Animal sombre sur la berge du paludarium** (cycle 86, #270) : un dos gris roche
  (`#45423e`) disparaît sur les racines et rochers de la berge en vue de trois-quarts. Pour un
  animal de couleur sombre, garder un contraste de clarté avec la roche (noir `koiNoir` taché
  d'une couleur vive) et regarder la capture `paludarium-three-quarter`. (2026-10-27)
- **Captures et `verify` en parallèle : e2e lents en délai dépassé** (cycle 54) : lancer
  `npm run captures` (port 4310) pendant l'e2e de `verify` partage le processeur ;
  `anemones-qa` « tentacules rouges… » (1,4 min seul) a alors dépassé son délai de 2 min.
  Relancer la spec seule avant de conclure à une régression, ou lancer les captures avant
  ou après l'e2e. (2026-10-23)
- **Capture « tracé des trajectoires » : `Unable to capture screenshot`** (cycle 51) : avec le
  navigateur 1243 sous le nom 1194 (voir ci-dessous), cette seule capture échoue en local, sur
  `main` comme sur la branche ; les 49 autres passent, et la CI la produit normalement. Ne pas
  en conclure à une régression. (2026-10-23)

- **Navigateur de Playwright absent : `chromium_headless_shell-1194`** (cycles 49 et 50) :
  Playwright 1.56 cherche `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`,
  alors que l'image fournit la version 1243 (`chrome-headless-shell-linux64/chrome-headless-shell`) :
  tous les e2e et captures échouent en 1 ms (« Executable doesn't exist »). Sans rien
  télécharger, créer le dossier attendu et un lien vers le binaire fourni (`mkdir -p
  …-1194/chrome-linux && ln -s …-1243/chrome-headless-shell-linux64/chrome-headless-shell
  …-1194/chrome-linux/headless_shell`), plus les fichiers vides `INSTALLATION_COMPLETE` et
  `DEPENDENCIES_VALIDATED`. Captures et e2e passent ensuite normalement. (2026-10-23)
- **`git checkout <fichier>` pour retirer un essai jetable efface aussi le travail en cours**
  (cycle 50) : le court-circuit de la passe palette (`vec4(color, 1.0)`, voir « Rendu ») posé
  par `sed` sur `render/palette-pass.ts` puis retiré par `git checkout` a ramené le fichier à
  sa version commitée, modifications du cycle comprises. Retirer l'essai par le `sed` inverse,
  ou copier le fichier avant l'essai. (2026-10-23)
- **Deux clones, un seul serveur e2e** (cycle 46) : Playwright réutilise un serveur déjà
  lancé sur son port (`reuseExistingServer` hors CI). Avec `npm run verify` de `main` encore
  en cours sur le port 4300, un `verify` lancé depuis un second worktree aurait testé le code
  de `main`. Pour travailler en parallèle, donner un autre port au second clone
  (`E2E_PORT=4310`, aussi pour `npm run captures`) ou arrêter le premier serveur ; un worktree
  peut partager `node_modules` par un lien symbolique. Le `verify` complet prend ~30 min en
  local (e2e sur un seul worker) : le lancer en arrière-plan et coder pendant ce temps.
  (2026-10-22)
- **Auteur des commits, pour tous les rôles** (cycles 46 et 61, #178) : l'environnement
  configure un auteur git par défaut qui n'est pas Mathis ; un commit QA (`636e619`, sur la
  branche de la PR #177) est ainsi parti sous un autre nom. Tout rôle qui committe (Dev, QA,
  Revue, Superviseur, sur une branche de code comme sur `equipe`) le fait au nom de Mathis,
  l'auteur des commits de `main` : `Mathis BENSACQ
  <126905623+Mbensacq@users.noreply.github.com>`. Le plus sûr, commit par commit :
  `git -c user.name="Mathis BENSACQ" -c user.email="126905623+Mbensacq@users.noreply.github.com" commit …`
  (ou `git config user.name` / `user.email` dans le clone, avant le premier commit). Vérifier
  avec `git log -1 --format='%an <%ae>'` avant de pousser ; un commit mal attribué déjà poussé
  se corrige à la fusion squash par un message et un auteur explicites, jamais par une
  réécriture d'une branche partagée. (2026-10-24)

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

- **`npm run verify` lit les sources en direct pendant l'e2e** (cycle 26) : `ng serve`
  surveille `src/` ; modifier un fichier pendant que `verify` tourne (sur `main` par
  exemple) fait tester l'e2e sur le code modifié. Attendre la fin de `verify`, ou travailler
  dans un autre worktree. (2026-10-20)
- **Serveur `ng serve` orphelin réutilisé** (cycle 37) : un `verify` interrompu laisse
  `ng serve --port 4300` tourner ; Playwright le réutilise (`reuseExistingServer` hors CI),
  y compris depuis un autre worktree : des captures « avant / après » sortent alors du même
  code (identiques à l'octet, à tort). Vérifier `ps -eo pid,args | grep '[n]g serve'` et
  l'arrêter avant de comparer. Ne pas utiliser `pkill -f "ng serve"` : le motif correspond
  aussi à la commande du shell qui l'exécute, qui se tue elle-même (code 144). (2026-10-21)

## Tests

- **Panneau à droite à 1280 × 720 : le bac finit à 968 px** (cycle 89, #289) : en
  trois-quarts, le bord droit du bac par défaut est à x = 968 px (capture `three-quarter`) ;
  un panneau collé à 12 px du bord droit le recouvre au-delà de 300 px de large (wiki :
  340 px au cycle 88 ; « Commandes », 300 px, le touche). Le wiki fait 288 px. Mesurer le
  bord du bac sur la capture sans interface avant d'élargir un panneau de droite.
  (2026-10-28)

- **Plus de place en bas à droite sous 900 px de large** (cycle 88, #287) : la barre des
  vues fait 660 px sur une ligne (54 px libres à droite à 768 px, rien à 640 px) puis deux
  lignes de 280 px sous 481 px (20 px libres à droite à 320 px). Un bouton d'interface « en
  bas à droite » n'y tient qu'au-delà de 899 px ; en dessous, la ligne des boutons du haut a
  de la place après « Réglages » (47 px seulement à 320 px avant « Commandes » replié). Le
  vérifier à 1280, 900, 768, 640, 390 et 320 px, police de la CI comprise
  (`e2e/wiki-especes.spec.ts`, « bouton « Wiki » libre »). (2026-10-28)

- **Test de l'hôte qui recharge après `setPopulation` : rien d'enregistré** (cycle 85, #277) :
  le réglage de population de l'hôte n'écrit pas la sauvegarde aussitôt (minuterie
  `AUTOSAVE_INTERVAL_MS` et `pagehide` seulement), contrairement au décor, aux dimensions ou
  au changement d'environnement. Dans un test unitaire qui détruit puis recrée l'hôte pour
  vérifier une restauration, appeler `host().saveNow()` avant `fixture.destroy()` ; en e2e,
  `page.reload()` déclenche `pagehide`. (2026-10-27)

- **Composant d'interface sans `font` sur `:host` : police à empattements** (cycle 82, #265) :
  il n'y a pas de police globale (`styles.scss` ne pose que fond et couleur) ; un composant
  dont l'hôte ne déclare pas sa police affiche la police par défaut du navigateur. Le bandeau
  bas du tableau de bord l'avait oubliée (#260) sans qu'aucun test ne le voie. Réutiliser le
  mixin `font` de `ui/dashboard-frame/_dashboard-surface.scss` (ou la même déclaration), et
  regarder les captures. (2026-10-27)
- **Agrandir un élément du bandeau bas sur téléphone** (cycle 82, #265) : à 390 × 844, le
  bandeau tient entre le bas du centre du bac (675 px) et la barre des vues (754 px) ; passer
  les boutons d'alerte de 20 à 24 px l'a fait entrer d'1 px dans le rectangle central (e2e
  rouge). Compenser par `bottom` et le rembourrage, et relancer
  `tableau-de-bord-sante.spec.ts`. Attention, `system-ui` n'est pas la même police en local
  (Inter) et sur la CI (plus large, type DejaVu Sans) : trois alertes tenaient sur deux
  lignes en local et sur trois en CI (bandeau de 98 px, centre mordu). Ne pas dépendre de la
  largeur du texte : borner chaque alerte à une demi-ligne et tronquer le message
  (`text-overflow: ellipsis`) ; tester en local en remplaçant un instant `system-ui` par
  `"DejaVu Sans"` dans le mixin. (2026-10-27)

- **`linkedSignal({ source, computation })` : `previous.value` typé `{}`** (cycle 80, #256) :
  sans paramètres de type, TypeScript infère mal la valeur précédente quand le calcul
  dépend d'elle (`nextTrendState(previous?.value ?? EMPTY, sample)`) : « Type '{}' is missing
  the following properties », puis `unknown` à la lecture du signal. Écrire les types :
  `linkedSignal<WaterSample, TrendState>({ … })` (`ui/dashboard-frame`). (2026-10-26)
- **Mesurer la place de l'interface avant d'y ajouter un élément** (cycle 80, #256) : à
  768 px, l'aide-mémoire déplié par défaut occupe 456 à 756 px en haut à droite, et
  « Réglages » finit à 143 px ; un script Playwright hors du dépôt qui relève
  `getBoundingClientRect()` des éléments d'interface à 1280 × 720, 768 × 1024 et 390 × 844
  (sur un `ng serve --port 4320`) donne la place libre en une minute. (2026-10-26)
- **Capture d'interface non reproductible** (cycle 76, #232) : hors capture, le monde avance
  en temps réel dès le chargement ; l'arrêter au curseur de vitesse après coup fige les
  poissons à un instant qui varie d'un essai à l'autre (`front-panneau` : 3 empreintes sur 3
  essais). Charger la page avec `vitesse=0` : le monde reste à t = 0 (`data-aqfish-tick` à
  `0`), et l'image est identique à l'octet. Toute nouvelle capture d'interface fait de même.
  (2026-10-26)
- **E2e qui compare jour et nuit pixel pour pixel à `time=30`** (cycle 73, #209) : depuis le
  rythme du jour, les poissons diurnes nagent autrement la nuit (plus lents, plus bas) ;
  après 30 s, néons et guppys ne sont plus aux mêmes places, et un compte de pixels de
  poisson « jour = nuit » échoue (`jour-nuit.spec.ts`, 396 contre 360). Pour comparer des
  couleurs de poisson entre deux heures, capturer à `time=0` (positions identiques). Toute
  capture à une autre heure que midi change dès que la nage de nuit change. (2026-10-26)
- **`toHaveText(/^…$/)` ne retire pas les blancs** (cycle 71, #207) : avec une chaîne,
  Playwright compare le texte normalisé ; avec une expression régulière, il teste le
  `textContent` brut, blancs du gabarit Angular compris (`\n  17,2\n`). `/^17,2$/` échoue
  alors que la valeur est juste. Ne pas ancrer l'expression (`/\b17,2\b/`) ou comparer une
  chaîne. (2026-10-25)
- **E2e de la pièce : le parquet est hors de l'écran en trois-quarts** (cycle 66, #188) : à
  1280 × 720, la vue trois-quarts par défaut cadre le bac ; le parquet devant lui se projette
  sous le bas de l'écran (y ≈ 1 000 px) et à gauche il est sous le panneau de l'éditeur.
  Reculer d'abord la caméra à la molette (huit crans), puis chercher un point visible.
  Projeter beaucoup de points par `projectToScreen` est lent (trois allers-retours avec la
  page chacun, 5 min pour 120 points) : lire la caméra une fois (`screenProjector`,
  `e2e/outils-decor.ts`). (2026-10-25)

- **Reconnaître le fragment du moteur physique dans un e2e** (cycle 59, #170) : ses noms de
  fichiers changent (hachage, pré-bundle de `ng serve`). Le chercher par son contenu : la
  variante `compat` de Rapier embarque son WebAssembly en base64, qui commence par `AGFzbQ`
  (`ENGINE_MARKER`, `e2e/outils-decor.ts`). `blockEngine` simule le hors-ligne en refusant
  tout script qui le contient. (2026-10-24)

- **E2e d'édition du décor : une pose refusée ressemble à un geste raté** (cycle 57, #168) :
  agrandir ou déplacer un élément près d'un voisin est refusé s'il le pénètre
  (`isDecorPoseAllowed`), et le test attend en vain une sauvegarde modifiée. Choisir les
  cibles par une sonde unitaire jetable (`moveDecorItem` puis `isDecorPoseAllowed` sur
  `DEFAULT_DECOR`) avant d'écrire l'e2e. Le toucher de Playwright ne sait que taper : un
  glissement au doigt s'envoie en `PointerEvent` (`pointerType: 'touch'`) au canvas
  (`touchDragTank`, `e2e/editeur-decor.spec.ts`). (2026-10-24)

- **E2e qui clique « hors du bac » à droite : l'aide-mémoire ouvert reçoit le clic** (cycle 56,
  #167) : à 800 px de large, « Commandes » (300 px, ouvert par défaut) recouvre la droite du
  bac ; un clic projeté à côté du bac tombe sur le panneau et ne désélectionne rien. Replier
  l'aide-mémoire au début du test. De même, `click()` de Playwright refuse un bouton
  `aria-disabled="true"` (« element is not enabled ») : `dispatchEvent('click')` pour vérifier
  qu'il reste sans effet. Chaque clic sur le canvas coûte plusieurs secondes en rendu
  logiciel : fenêtre réduite et `test.setTimeout(300_000)` dans `editeur-decor.spec.ts`.
  (2026-10-23)

- **Tests du récif qui parcourent `world.entities` comme s'il n'y avait que des clowns**
  (cycle 53, #151) : avec une deuxième espèce au récif, les tests d'attache (`nearShare`,
  rang → anémone) comptaient les chirurgiens comme des clowns et échouaient (8 % du temps
  près de « leur » anémone). Filtrer par espèce (`clowns(world)`, `sim/anemones.spec.ts`)
  plutôt que supposer la population d'un environnement. (2026-10-23)
- **Les poissons n'ont pas de coque de contour** (cycle 53) : contrairement au décor, aucun
  liseré n'entoure les poissons ; le noir visible sur un clown vient de son gabarit (`e`,
  `a`). Pour détacher un poisson de l'eau, jouer sur sa couleur (contraste avec les tons de
  l'eau), pas sur un contour. (2026-10-23)
- **Le noir d'un gabarit de petit poisson se lit d'abord** (cycle 55, #161) : à l'échelle des
  captures, un voxel noir entre deux couleurs claires pèse plus qu'elles ; des bandes
  cerclées de noir des deux côtés deviennent une tache noire. Compter les voxels par rôle
  (test `noir minoritaire`, `render/fish-model.spec.ts`) et vérifier sur fond clair (sable)
  autant que sur l'eau : sans aucun liseré, un blanc se perd sur le sable. (2026-10-23)
- **`npm run verify` lancé en arrière-plan pendant qu'on modifie le code** (cycle 48) : les
  e2e passent par `ng serve`, qui recompile à chaque enregistrement ; un `verify` « de
  santé de `main` » lancé avant de coder teste en réalité le code en cours d'écriture, et son
  verdict ne vaut rien. Le lancer dans un worktree séparé (`git worktree add`), ou attendre
  sa fin avant de toucher aux sources ; à défaut, s'appuyer sur la CI verte de `main`.
  (2026-10-22)
- **Hôte transparent d'un composant qui capte les clics** (cycle 41, #112) : l'hôte
  `position: fixed` de `app-control-panel` forme une boîte invisible aussi large que le
  panneau, du bouton jusqu'au bas du panneau ; placé après `app-commands-help` dans le DOM,
  il interceptait le clic sur le bouton « Commandes » replié (en haut à droite) dès 390 px
  de large, sans que rien ne se voie. Un hôte flottant qui en englobe d'autres prend
  `pointer-events: none`, ses enfants cliquables `pointer-events: auto`.
  `e2e/cadrage-panneaux.spec.ts` (`coveredButtons`) vérifie par `elementFromPoint` le centre
  et les coins de chaque bouton d'interface, à 1280 × 720, 390 × 844 et 320 × 568 : un
  coin pris à moins de 3 px du bord tombe hors de l'arrondi du bouton (rayon 8 à 10 px) et
  touche ce qui est dessous, d'où un retrait de 4 px. (2026-10-22)
- **Capture `front-panneau` non reproductible d'une exécution à l'autre** (cycle 41) :
  même en local, deux `npm run captures` successifs sur le même code donnent quelques
  pixels différents dans le bac (simulation lancée avant la mise à l'arrêt). Les 35 autres
  captures sont identiques à l'octet ; pour `front-panneau`, comparer la zone des panneaux,
  pas le fichier. (2026-10-22)
  Même cas pour `telephone-catalogue` (cycle 68) : deux exécutions sur `main` donnent
  ~15 pixels différents dans le bac, sous le catalogue ouvert ; les 68 autres captures du
  cycle 68 sont identiques à l'octet à celles de c067. (2026-10-25)
- **Hauteur de texte différente en CI : `system-ui` n'est pas la même police** (cycle 34,
  #79) : dans l'environnement des agents, `system-ui` donne **Inter** ; sur le runner
  `ubuntu-latest`, **DejaVu Sans**, plus large (plus de retours à la ligne). Le panneau
  « Commandes » mesurait 608 px en local et 641 px en CI : e2e vert en local, rouge en CI.
  Pour mesurer comme la CI, imposer la police (`page.addStyleTag` avec
  `font-family: 'DejaVu Sans' !important`, installée dans les deux environnements) :
  `e2e/cadrage-panneaux.spec.ts` le fait. Pour la même raison, la capture `front-panneau`
  (seule avec du texte) ne peut pas être comparée à l'octet entre local et CI. (2026-10-20)
- **Panneau d'interface rogné en bas, trouvé tard** (cycles 31 à 34, #101, #79) : chaque
  panneau a sa hauteur maximale (réserve de la barre des préréglages) et défile au-delà ;
  ajouter une ligne ou une section le fait déborder sans qu'aucun test unitaire ne le voie.
  `e2e/cadrage-panneaux.spec.ts` contrôle chaque panneau de `PANELS` à 1280 × 720,
  390 × 844 et 320 × 568 (dans la fenêtre, sans recouvrir la barre ni les boutons) ; **tout nouveau panneau s'y ajoute**.
  Le panneau « Commandes » doit en plus tenir sans défiler à 1280 × 720 : marge de 51 px
  au cycle 34 (contenu 581 px pour 632 px permis, lignes en 12 px, interligne 1,25). Sous
  480 px, la barre passe sur deux lignes : réserver ~120 px en bas, pas 76. (2026-10-20)
- **E2e qui compte un état que la simulation consomme** (cycle 33, #94) : « nourrir 19 fois
  puis attendre `MAX_FOOD` » échouait sur machine chargée, car les poissons mangeaient entre
  deux appuis (chaque appui coûte plusieurs secondes en rendu logiciel). Mettre la
  simulation à l'arrêt depuis le panneau (`Vitesse` à 0, puis replier le panneau : la touche
  `G` est ignorée tant que le focus est dans un champ) et vérifier la valeur exacte après
  chaque action (`e2e/nourrissage.spec.ts`). Prouvé 3 fois de suite avec 4 boucles de
  calcul en parallèle sur 2 cœurs. (2026-10-20)
- **Hauteur du panneau de réglages et barre des préréglages** (cycle 33, #101) : la
  hauteur maximale du panneau réserve la place de la barre en bas, sur une ligne au-delà de
  480 px et sur deux lignes en dessous (`control-panel.scss`). Ajouter une section au
  panneau peut de nouveau rogner le bas à 1280 × 720 : `e2e/sauvegarde.spec.ts` vérifie que
  les boutons de sauvegarde tiennent sans défiler et que le panneau reste au-dessus de la
  barre (1280 × 720 et 390 × 844). (2026-10-20)
- **`setInputFiles` avec un chemin accentué ne sélectionne rien** (cycle 32, #70) : un
  fichier écrit dans `testInfo.outputPath(...)` vit dans un dossier nommé d'après le titre
  du test (« refusé », « altérer »…) ; `setInputFiles(chemin)` n'y attache alors aucun
  fichier, sans erreur (`input.files.length` = 0, aucun événement `change`). Passer le
  fichier en mémoire : `setInputFiles({ name, mimeType, buffer })` (`e2e/sauvegarde.spec.ts`).
  (2026-10-20)
- **Sauvegarde automatique et e2e** (cycle 32, #70) : sans paramètre de monde dans l'URL
  (`seed`, `environnement`, `population`), l'application restaure `aqfish.sauvegarde` au
  démarrage, et quitter une page l'écrit (`pagehide`). Un e2e qui recharge ou renavigue sur
  `/` sans `seed=` retrouve donc le monde précédent (temps, population) ; ajouter `?seed=42`
  pour repartir d'un monde neuf. Dans `aquarium-host.spec.ts`, le stockage est un double en
  mémoire neuf à chaque test (`SAVE_STORAGE`). (2026-10-20)
- **Clic au centre de l'écran en vue trois-quarts ≠ clic sur l'eau** (cycle 24, #67) : le
  centre de l'écran vise la cible de la caméra, au milieu du bac ; le rayon coupe le plan de
  la surface **devant** le bac (hors des vitres), donc rien n'est déposé. Pour un e2e de
  clic sur la surface, projeter le point voulu à l'écran depuis `data-aqfish-camera` et
  `data-aqfish-target` (`e2e/nourrissage.spec.ts`, `projectToScreen`). En vue de dessus, le
  centre convient. (2026-10-19)
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
  Cycle 83 (#244, rétro du sprint 12) : **règle** : tout test mesuré à **400 ms ou plus en
  local** reçoit un délai explicite, 15 s (30 s à partir de 1 s mesurée), sans réduire sa
  charge ; un runner de CI lent sous couverture a multiplié les durées par 7 environ
  (`world.spec.ts` « graine N », 0,7 s en local, a dépassé 5 s). Pour les trouver, depuis
  `frontend/` : `npx vitest run --globals --includeTaskLocation src/app/sim src/app/render
  src/app/core --reporter=./scripts/durees-tests.mjs` (liste ceux restés sur le délai par
  défaut ; `SEUIL_MS`, `SORTIE` facultatifs). Les mesures varient de ±15 % d'un passage à
  l'autre : relancer deux fois. Sous Vitest seul, les specs qui ont besoin du DOM
  (`render/aquarium-view`, `core/capture`, `core/keyboard`, `ui/`) échouent : normal, elles
  ne tournent que dans `ng test` ; leurs durées ne sont pas mesurées par cet outil.
  (2026-10-27)
- **Tests de mutation : `FixtureParseError` avec Vitest 4** (#166) : le lanceur
  `@stryker-mutator/vitest-runner` 9.0.1 écrivait `afterAll((suite) => …)` dans son fichier
  de préparation ; Vitest 4 lit le premier argument d'un crochet comme un contexte de
  fixtures et exige une déstructuration
  (`The 1st argument inside a fixture must use object destructuring pattern`), d'où le
  plantage juste après l'exécution à blanc. Corrigé en amont (`afterAll(({}, suite) => …)`) : `@stryker-mutator/core` et
  `vitest-runner` sont épinglés en **9.6.1** (les deux à la même version exacte). Premier
  score (cycle 69) : `npx stryker run --mutate src/app/sim/sim-speed.ts` → **95,24 %**
  (21 mutants, 20 tués, 1 survivant : le séparateur du message d'erreur), 2 min sur
  2 cœurs. Un fichier plus gros reste long : `anemones.ts` (297 mutants, dont 250
  « statiques » qui relancent toute la suite) dépasse 10 min ; viser un petit fichier par
  session, ou `--ignoreStatic` en le signalant (le score n'est alors plus comparable).
  Installer ces paquets avec `npx -y npm@11 install` (bogue `edgesOut` de npm 10).
  (2026-10-25)
- **Mutation : survivant « statique » avec 0 test exécuté = plantage au chargement** (cycle
  89, #267) : dans `water-dashboard.ts`, 23 survivants restaient après des tests précis
  (tableau `DASHBOARD_GAUGES` comparé à la lettre, niveau de chaque jauge), tous `static`
  avec `testsCompleted: 0` dans `reports/mutation/mutation.json`. Le mutant casse une
  constante calculée au chargement (`DEFAULT_DASHBOARD_GAUGES` : `GAUGE_UNITS['']`
  indéfini, `COMPOUND_THRESHOLDS['temperature']`) : le fichier de test ne se charge pas,
  aucun test ne tourne, et Stryker le compte comme survivant. Ne pas écrire de test pour
  eux : lire `testsCompleted` avant de chercher, et le dire dans la PR. `x + 0` → `x - 0`
  dans `formatTenth` est équivalent (`(-0).toFixed(1)` vaut `"0.0"`). (2026-10-28)
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
- **Serveur e2e réutilisé d'un autre clone** (cycle 22) : hors CI, Playwright réutilise un
  serveur déjà à l'écoute sur le port 4300 (`reuseExistingServer`). Un `verify` interrompu
  (ou lancé depuis un autre worktree) laisse son `ng serve` actif : les e2e suivants testent
  alors **l'autre** code. Tuer ce serveur par son PID (`pgrep -af "ng serve"`), ou lancer
  sur un autre port (`E2E_PORT=4310 npx playwright test …`). Ne pas utiliser
  `pkill -f <motif>` : le motif figure aussi dans la ligne de commande du shell de l'outil,
  qui est tué avec (code 144). (2026-10-19)
  Idem pour `for p in $(pgrep -f <motif>); do kill $p; done` (cycle 28) : `pgrep -f` liste
  aussi le shell de l'outil. Relever le PID avec `pgrep -af "ng serve"` dans un appel à
  part, puis `kill <PID>` dans un autre. (2026-10-20)
- **Tester le code d'une branche pendant le `verify` de `main`** (cycle 22) : travailler
  dans un worktree séparé (`git worktree add ../aqfish-cNNN -b <branche> main`, puis lien
  symbolique vers `frontend/node_modules`) évite de modifier les sources servies par le
  `ng serve` du `verify` en cours. (2026-10-19)
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

- **Arrondir au centimètre en multipliant par 0,01 laisse du bruit** (cycle 65, #188) :
  `Math.round(v / 0.01) * 0.01` donne `-1.4000000000000001` pour `-1.4` ; une pose ainsi
  arrondie ne se compare plus égale à la demande ni à sa relecture. Diviser à la fin :
  `Math.round(v * 100) / 100` (`snap` de `sim/room-furniture.ts`). (2026-10-25)

- **Sphères de collision d'un rocher : une partie enfouie sous sa base** (cycle 59, #170) :
  les blocs d'un rocher sont centrés à 0,2–0,45 r au-dessus de la base, donc descendent
  jusqu'à 0,8 r sous le sable, sans voxel visible. Un rocher posé sur un autre par le moteur
  reposait sur cette partie : 6 cm de vide sous lui. D'où `liftedSphereY` pour tout élément
  élevé (ADR 0046). Toujours regarder un empilement à l'image, pas seulement les tests de
  chevauchement. (2026-10-24)

- **Test de non-traversée : un poisson posé sur la surface « est dedans » à −1e-17 m près**
  (cycle 58, #169) : le filet de sécurité de `stepFish` projette le centre exactement sur la
  sphère ; `obstacleDistance` relu ensuite vaut ±1e-17. Contre un obstacle fin (bois flotté)
  que le poisson touche vraiment, `d < 0` échoue à tort. Compter « dedans » sous −1e-9 m, et
  vérifier que le test n'est pas vide (distance minimale sous `wallMargin`). (2026-10-24)

- **Attacher un poisson à un point : l'évitement l'emporte sur le retour** (cycle 52, #150) :
  passé à `stepFish` comme une nourriture, le point d'attache des poissons-clowns ne les
  ramenait pas : près d'une vitre, du sable ou d'une colonie de corail, l'évitement
  (prioritaire, avec sa mémoire de virage) les faisait longer l'obstacle sur 50 cm au lieu
  de faire demi-tour (trace : cap presque constant, point visé toujours donné). Remèdes
  cumulés : préférence de profondeur basse (évitement du fond réduit), clairière sans corail
  autour de l'anémone, et, pour les seules espèces `anemone`, évitement réduit à sa part
  horizontale et annulé quand le point visé est du côté où il pousse. Mesurer la part du
  temps près de l'ancre sur plusieurs graines (script esbuild hors du dépôt) avant d'écrire
  le test. (2026-10-23)
- **Placer un élément sur un fond déjà plein** (cycle 52, #150) : tirées après les coraux, les
  anémones manquaient sur 40 % des graines. Poser d'abord l'élément indispensable, et faire
  éviter son emprise par les suivants (`coralLayout`, `keepOut`). (2026-10-23)

- **Teinte « parcourue en boucle » sautée par une colonie omise** (cycle 51, #149) : les
  teintes des coraux suivent une permutation tirée de la graine ; indexée par le rang de la
  colonie **visée**, une colonie qui ne trouve pas de place emporte sa teinte avec elle
  (graine 4294967295 : 5 colonies, 3 teintes). Indexer par le rang de la colonie **placée**.
  Le placement par rejet n'assure pas un nombre minimal : le mesurer sur beaucoup de graines
  (script esbuild hors du dépôt) et le figer par un test (300 graines, au moins 4).
  (2026-10-23)

- **Espèce « inconnue » des tests qui devient réelle** (cycle 44, #130) : plusieurs tests
  utilisaient `'axolotl'` comme exemple d'espèce inconnue (`population.spec.ts`,
  `aquarium-host.spec.ts`) ; l'ajouter à `SPECIES` les faisait échouer. Prendre un nom qui
  ne sera jamais une espèce du projet (`'requin'`). Ajouter une espèce change aussi tous les
  objets d'effectifs (`populationCounts`, `NO_FISH` : une clé de plus) et la liste des
  couches de `AquariumView`. (2026-10-22)
- **Nouvelle espèce dans un environnement déjà peuplé** (cycle 45, #131) : les tests de
  l'axolotl parcouraient `world.entities` d'un paludarium par défaut en supposant n'y voir
  que des axolotls, et comptaient sur leurs identifiants (0 à 3) : l'ajout des grenouilles
  (identifiants 2 à 4) les faisait échouer ou changeait les individus observés. Filtrer par
  espèce, et construire le monde observé avec `createWorld(seed, [{ species, count }], [], [],
  environnement)` plutôt que `setPopulation(createDefaultWorld(…))`. (2026-10-22)
- **Graine invalide masquée par un sel** (cycle 44) : `(seed ^ SEL) >>> 0` rend valide une
  graine négative ; valider la graine (`assertSeed`) **avant** de la mélanger. (2026-10-22)

- **Mesurer le coût d'un pas hors CI** (cycle 26, #85) : pas d'horloge murale dans les specs ;
  écrire un script hors du dépôt qui importe `sim/world.ts` (`createDefaultWorld`,
  `advanceInPlace`, `feedInPlace`), le regrouper avec l'esbuild déjà installé
  (`frontend/node_modules/.bin/esbuild bench.ts --bundle --platform=node --format=esm
  --outfile=bench.mjs`) et le lancer avec `node`. Pour compter les appels d'une fonction
  interne (impossible à espionner en ESM), ajouter un compteur `globalThis` le temps du
  regroupement, puis restaurer le fichier **avant** tout test. Vérifier qu'une optimisation
  ne change rien en comparant l'empreinte (`sha256` du JSON) du monde après quelques
  milliers de pas, avant et après. (2026-10-20)
- **Attraction vers un point derrière un obstacle : minimum local** (cycle 25, #68) : un
  poisson attiré par un granulé caché derrière un rocher s'y bloque (attraction et évitement
  s'équilibrent) ou en est dévié jusqu'à perdre le granulé de vue. Ne viser que ce qui est en
  vue (`hasLineOfSight`, `sim/feeding.ts`) ; et arrêter la prospection de l'évitement au
  point visé, sinon un granulé posé au fond ou près d'une plante est repoussé par ce qui se
  trouve au-delà. Les plantes sont aussi des obstacles (`world.obstacles` : 10 dans le décor
  par défaut). (2026-10-19)
- **`SIM_DT` vaut 1/60 s**, pas 1/30 : un test qui compte des pas « à 30 par seconde » simule
  deux fois moins de temps que prévu. Écrire `Math.round(secondes / SIM_DT)`. (2026-10-19)
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

- **Ajouter une couleur à la palette commune change les images d'ailleurs** (cycle 77, #226) :
  trois bruns de granulé ajoutés à `PALETTE` ont pris 19 captures sans nourriture (pièce,
  meubles, bassin, pixels de nuit du paludarium et du récif). Avant d'ajouter une couleur,
  lancer `npm run captures` avant / après et comparer à l'octet (`cmp`). Pour une couleur
  propre à un objet présent partout, la réserver à ses pixels : les granulés écrivent une
  opacité de 0,5 (`FOOD_ALPHA_MARKER`, mélange `One` / `Zero`) et la passe ne leur propose
  les tons de la nourriture que sous l'opacité 1 (ADR 0056). Un nouvel objet à mélange
  personnalisé qui écrirait une opacité inférieure à 1 hériterait de ces tons. (2026-10-26)

- **Ternir un petit poisson : la passe palette le ramène au sable** (cycle 72, #208) : avec
  45 % de désaturation et 25 % d'assombrissement (et même 75 % / 30 %), néons et guppys
  affamés sortaient **à l'identique** en tons de sable et de gris : la passe palette ramène
  toutes ces couleurs ternes aux mêmes voisines, et la nuance réglée ne se voit plus du tout
  (deux captures égales à l'octet pour deux réglages différents). Balayer plusieurs valeurs
  en petit pas (capture `side-affames`, zoom Pillow `NEAREST`) et garder la plus forte qui
  laisse chaque espèce reconnaissable : 30 % / 15 % (`DULL_DESATURATION`,
  `DULL_DARKENING`). (2026-10-25)
- **Teinter l'eau translucide : la passe palette saute d'une couleur à l'autre** (cycle 71,
  #207) : pour l'eau trouble, mêler les teintes d'entrée vers un vert ne donne que des paliers
  (`eauSombre` → `vegetation` → `verreSombre` pour le volume, `eauMoyenne` →
  `vegetation` ou `vegetationClaire` pour la surface), sans nuance entre ; une surface trop
  claire tombe même sur `roche` (gris). Essais à la capture, une valeur à la fois, en
  mesurant quelques pixels (Pillow) : `filtre=aucun` ne donne pas l'entrée de la passe. Un
  serveur `ng serve` séparé (`--port 4310`) recharge la teinte en ~10 s. (2026-10-25)
- **Un fond derrière l'eau change la couleur de l'eau** (cycle 64, #187) : l'eau est
  translucide ; vue devant un mur `roche` ou même `rocheSombre` éclairé, la passe palette la
  ramenait à `roche` (eau grise), alors que sur le fond de la scène (`fondScene`) elle tombe
  sur `eauSombre`. Un mur `koiNoir` éclairé retombait, lui, sur `fondScene` (invisible). Mur
  de la pièce en couleurs plates (`MeshBasicMaterial`, `koiNoir`) et repères plus clairs hors
  de l'axe des vitres (cimaise au-dessus du bac, plinthe au sol). Tout nouvel objet placé
  derrière le bac : regarder la vue `front` et la vue `top`, où l'eau des vitres latérales se
  voit sur le sol. (2026-10-24)
- **Cotes arrondies au centimètre : `Math.round(-17.5)` vaut −17** (cycle 64, #187) : arrondir
  au voxel une cote négative à mi-pas la rapproche de zéro, une positive l'en éloigne ; dans
  le bac de 35 cm (demi-profondeur 17,5 cm), deux cotes voisines arrondies séparément se
  confondaient et la poignée, d'épaisseur nulle, était omise (test « bac de 0,8 × 0,55 ×
  0,35 m »). Arrondir une fois les demi-dimensions (positives, par excès), puis ne construire
  que des sommes de pas (`roomBlocks`, `sim/room.ts`). (2026-10-24)

- **Un ton de crépuscule n'est pas gratuit à 19 h** (cycle 62, #81) : à 19 h, l'intensité
  du jour vaut ≈ 0,15 et le poids du crépuscule ≈ 0,71 ; la pénalité des tons du crépuscule
  est alors ≈ 0,0083 (distance au carré, sRGB sur [0, 1]), soit ≈ 23 niveaux sur 255. Un
  ton ne l'emporte sur une couleur de jour que si l'entrée est **plus loin** de celle-ci que
  √0,0083 : ajouter un ton mauve à côté d'une roche grise ne sert à rien tant que l'entrée
  reste grise. Il faut d'abord déplacer l'entrée (teinte du décor, ciel de crépuscule), puis
  poser le ton sur la couleur mesurée (passe court-circuitée, voir plus bas). La capture
  `filtre=aucun` **n'est pas** l'entrée de la passe (rendu pleine résolution) : pour mesurer,
  court-circuiter la passe (`gl_FragColor = vec4(color, 1.0)`), et vérifier le choix par
  `nameAt` dans `palette.spec.ts`, qui applique les vraies pénalités. (2026-10-24)
- **Éditeur : un élément ajouté au bord était posé sans tenir compte de son emprise**
  (cycle 62, #59) : `addDecorItem` ne bornait que le point cliqué (`DECOR_EDGE_MARGIN`,
  4 cm), et `settleDecorItem` garde la position du lâcher quand l'élément retombe libre sur
  le sable : un rocher posé contre une vitre en dépassait. `addDecorItem` ramène désormais
  le point par `clampDecorPosition`. Les e2e qui posent en `FREE_SAND` (z = 0,17) attendent
  donc la position bornée, pas le point cliqué. (2026-10-24)

- **Écouter le canvas avant `OrbitControls`** (cycle 57, #168) : `OrbitControls` pose son
  `pointerdown` sur le canvas dès sa construction ; un écouteur ajouté ensuite passe après lui,
  trop tard pour lui couper la main (`controls.enabled = false`) avant qu'il ne capture le
  pointeur. Écouter en **phase de capture** (`addEventListener('pointerdown', f, { capture:
  true })`) : au niveau de la cible, Chromium appelle les écouteurs de capture d'abord. Ne
  plus lire `controls.enabled` pour savoir si la vue est interactive (il change pendant un
  glissement) : garder le réglage d'origine à part (`interactive`). (2026-10-24)

- **Un ton d'environnement capte les couleurs assombries de la nuit** (cycle 51, #149) : les
  deux violets des coraux, ajoutés aux tons du récif, captent la nuit le rose assombri des
  coraux roses (`decorTintInto`), qui se confondent alors avec les violets. Les autres
  environnements n'en voient rien (pénalité `TONE_PENALTY_OFF`), mais un ton déclaré reste
  libre la nuit : regarder la capture de minuit de l'environnement qui le déclare. (2026-10-23)

- **Une couleur ajoutée à la palette commune change les images des autres environnements**
  (cycle 50, #148) : deux bleus pour l'eau du récif ont capté, dans les captures du bac
  tropical au crépuscule, l'eau de lune (35 946 pixels) et des néons (396 pixels). Une
  couleur utile à un seul environnement va dans `ENVIRONMENT_TONES` (ADR 0039), proposée par
  la passe seulement là où `Environment.tones` la déclare. Comparer toutes les captures avec
  `cmp`, pas seulement celles de midi. Pour choisir la couleur, calculer le mélange
  translucide (en linéaire : `c · a + fond · (1 − a)`, puis sRGB) : le modèle redonnait
  l'image mesurée à 1 unité près. (2026-10-23)
- **Eau teintée vue de dessus : le sol prend la teinte de la surface** (cycle 50) : vu de
  dessus, le sol est vu à travers la surface (50 %) ; une surface bleue rend tout sable clair
  bleuté, ramené à `eauTresClaire`. Aucune couleur de sable de la palette n'est atteignable
  sans renoncer à une surface bleue en trois-quarts (ADR 0039). (2026-10-23)
- **Voxels de 1 cm vus en trois-quarts : les flancs prennent autant de place que le dessus**
  (cycle 49, #132) : des tapis de mousse en cubes de 1 cm posés sur les marches de la berge
  montrent presque autant de flancs que de dessus. Avec des flancs `vegetationSombre`, moins
  éclairés, la passe palette les affichait presque noirs et la mousse se lisait comme des
  taches sombres (alors que la vue de dessus était juste). Flancs dans la couleur du dessus
  (`vegetation`) : l'éclairage suffit à marquer le relief. Toujours regarder la capture
  trois-quarts zoomée, pas seulement le dessus. (2026-10-23)
- **Points parasites sur un maillage en colonnes : jonctions en T** (cycle 43, #129) : la
  coupe de la berge du paludarium, contre la vitre, était faite d'un rectangle par colonne
  (de y = 0 à sa hauteur). Deux colonnes voisines de hauteurs différentes partagent un bord
  vertical, mais la plus haute n'a pas de sommet à la hauteur de la plus basse : la
  rastérisation laisse des fentes d'un pixel, et l'eau derrière perçait en points isolés
  (`eauSombre`) sur la terre, en vue trois-quarts. Ce n'était pas un conflit de profondeur
  avec l'eau (l'éloigner de 4 mm n'y changeait rien). Solution : un sommet à la hauteur
  partagée sur chaque bord (`pushCut`, `render/terrain-mesh.ts`). Pour vérifier, compter les
  couleurs étrangères dans la zone (Pillow `Counter`) avant et après. (2026-10-22)
- **Flanc éclairé et passe palette : la couleur choisie n'est pas celle affichée** (cycle 43) :
  un flanc vertical en `sableOmbre` ou en `rocheSombre`, moins éclairé que le dessus,
  retombe sur `roche` (gris) ou presque noir ; pour un flanc de terre brun, partir d'une
  couleur plus claire (`sableSombre`, affiché `sableOmbre`). Juger sur capture. (2026-10-22)

- **Petit objet posé sur l'eau du bassin, vu de dessus : les gris se lisent comme des
  pierres** (cycle 42, #107) : des feuilles mortes en `sableOmbre` et `rocheSombre` de 5 à
  7 cm (5 × 3 pixels de scène) ressemblaient aux rochers du fond, que l'eau ramène aux mêmes
  tons. Tons chauds (`sableSombre`, `tritonOrange`) et au moins ~8 pixels de scène de long
  (9 à 13 cm dans le bassin, `LEAF_LENGTH`) pour qu'une forme se lise. Toujours zoomer la
  capture (Pillow, `NEAREST`) avant de juger. (2026-10-22)
- **Épaissir un petit cercle de ligne vu de biais** (ronds de pluie en trois-quarts, #125) :
  un second tracé décalé d'un pixel de scène vers la caméra remplit les ellipses de 3 à
  4 pixels de haut, qui deviennent des taches claires sans forme de rond. Pour la lisibilité
  d'un petit motif écrasé, jouer sur la couleur et le nombre de traits (rond extérieur seul,
  couleur la plus claire), pas sur l'épaisseur. (2026-10-21)
- **Opacité partielle et passe palette** : une couleur mélangée au fond est ramenée à la
  couleur de palette la plus proche, souvent inattendue (gris `roche` pour un vert d'eau à
  moitié sur le fond sombre). Le fondu des gouttes (#125) n'est acceptable que parce qu'il est
  court et placé haut : vérifier sur capture qu'aucun pixel parasite n'apparaît (compter les
  pixels hors fond dans la zone concernée). (2026-10-21)
- **Baisser l'intensité du jour pour assombrir la scène, en plein midi** (cycle 39, #106) :
  multiplier `DayLight.intensity` par 0,85 sous la pluie desserrait aussi les pénalités des
  tons du crépuscule (`tonePenaltiesInto`) et changeait la teinte du décor
  (`decorTintInto`) : stries claires sur les parois intérieures de l'eau du bassin en vue
  trois-quarts, touffes d'herbe claires ternies. L'intensité n'est pas un simple
  « variateur » : elle choisit aussi les tons de la passe palette. Comparer les captures avec
  et sans l'effet avant de le garder (retiré, issue #123). (2026-10-21)
- **Petit objet en plusieurs pièces : un contour par pièce le noircit** (cycle 36, #104) :
  une fleur de ~15 pixels faite de 13 pétales, chacun avec sa coque de contour, montrait en
  vue trois-quarts des traits noirs entre tous les pétales. Dessiner toutes les coques
  d'abord, **sans écrire la profondeur** (`depthWrite: false`, ordre juste après le support),
  puis les pièces, qui recouvrent les contours intérieurs : seule la silhouette garde son
  liseré (`FLOWER_OUTLINE_RENDER_ORDER`, `render/lily-pad-layer.ts`). (2026-10-21)
- **Choisir une constante de flux de hasard pour la graine des captures** (cycle 36) : la
  graine 42 ne tirait aucun lotus. Plutôt que de truquer les probabilités, essayer quelques
  valeurs de flux dans un test jetable (sortie via `throw new Error(...)` : `console.log`
  n'apparaît pas dans `ng test`) et figer la valeur retenue par un test (« graine 42 :
  au moins une fleur, un lotus et une feuille nue »). (2026-10-21)

- **Objet très mince et coque de contour : contour par-dessus l'objet** (cycle 35, #103) :
  la feuille de nénuphar fait 6 mm ; en vue trois-quarts, le dessous de la coque et le
  dessus de la feuille tombaient sur la même profondeur quantifiée et le contour (`koiNoir`)
  couvrait la moitié **lointaine** de chaque feuille (la plus touchée par la perte de
  précision), alors que la vue de dessus était juste. Diagnostic : masquer la coque le temps
  d'une capture. Solution : `polygonOffset` (facteur −2, unités −8) sur le matériau de la
  feuille (`render/lily-pad-layer.ts`). (2026-10-21)
- **Ombre sous l'eau du bassin invisible** (cycle 35, #103) : vu de dessus, le fond du
  bassin n'apparaît pas, la passe palette ramène « eau + fond » à `eauSombre` ; même une
  ombre noire posée sur le fond donnait `eauSombre`. Dessiner l'ombre en couleur pleine
  (`eauProfonde`) **après** le volume d'eau (ordre 1) et **avant** les rides de la surface
  (`SURFACE_RENDER_ORDER`, 1,5). (2026-10-21)
- **Mesurer les couleurs avant quantification sans toucher au harnais** (cycle 23, #73) :
  dans un worktree, remplacer temporairement `gl_FragColor = vec4(best, 1.0)` par
  `vec4(color, 1.0)` dans `render/palette-pass.ts`, servir sur un autre port
  (`npx ng serve --port 4310`), puis photographier avec un petit script Playwright hors du
  dépôt (`chromium.launch()`, `page.goto(...?capture=1&heure=0...)`, attendre
  `body[data-aqfish-ready="true"]`) et compter les couleurs (Pillow `Counter`). Penser à
  remettre `best` avant tout commit. (2026-10-19)
- **Eau translucide : changer sa couleur de nuit change peu l'image** (cycle 23) : à 30 %
  d'opacité, passer l'eau de nuit de `eauProfonde` à un bleu sombre ne bougeait l'eau
  affichée que de quelques unités (`#375058`) ; il faut une couleur d'entrée saturée
  (`#2050a8`) pour une eau franchement bleue. Plantes et rochers (`MeshBasicMaterial`) ne
  réagissent pas à la lumière : les teinter par la couleur du matériau (`DecorLayer.setTint`).
  (2026-10-19)
- **Un ton de nuit peut capter les poissons** (cycle 23) : le bleu néon assombri (`#3086c3`)
  est plus proche d'une eau de nuit que de `neonBleu` ; vérifier les couleurs des poissons
  (histogramme) après tout ajout de ton, et ajouter le ton correspondant (`neonBleuNuit`).
  (2026-10-19)
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
- **Point posé sur une surface vue en biais** (cycle 27) : un point est un carré à l'écran
  mais n'a qu'une profondeur, celle de son centre. Posé sur le sable ou un rocher, la
  surface passe devant sa moitié basse et le cache (un granulé de 4 pixels réduit à un
  trait). Avancer le point le long du rayon de vue dans le shader (`withDepthBias`,
  `render/food-layer.ts`) : position et taille à l'écran inchangées, profondeur seule
  corrigée. Le décalage doit rester petit (2,5 cm) : tout objet plus proche ne cache plus
  le point. (2026-10-20)
- **Liseré d'un nuage de points** : un second `Points` sur la même géométrie, plus grand de
  2 pixels, en couleur sombre et dessiné juste avant (`renderOrder` inférieur) ; le test de
  profondeur garde l'ordre entre points. Une couleur de point qui, assombrie la nuit,
  retombe sur celle d'un animal assombri devient indiscernable : vérifier la couleur de nuit
  ramenée à la palette étendue (`nearestPaletteIndex`). (2026-10-20)
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
