# Pièges connus

Base de connaissances de l'équipe. **À lire avant de coder ; à compléter** dès qu'un piège
coûte du temps (symptôme, cause, solution, date). Une entrée par piège, la plus récente en
haut de sa section.

## Environnement des agents

- **Bouton de plus dans le bandeau santé et alertes : il casse les e2e de clic sur le bac**
  (cycle 204, #581) : le bandeau s'allonge (centré sous 1100 px, calé à gauche au-delà) et
  couvre des points que `editeur-decor` (`OUTSIDE` à 800 × 500) et `editeur-piece` (parquet
  dans x 700–1100, y 450–650 à 1280 × 720) cliquent comme libres ; `cadrage-panneaux` ne le voit
  pas. Mettre la commande dans un détail déjà déplié (le journal est un bouton du bilan). Un
  bouton toujours affiché casserait aussi `chips()` de `dashboard-status.spec`. (2026-11-12)
- **Relever des processus avec `ps | grep` puis `kill` : même danger que `pkill -f`** (cycle 184,
  #531) : la ligne du shell de l'outil Bash contient le motif (`npm run verify`…), il se tue
  (sortie 144). Viser des PID relevés dans un appel à part. Ne pas non plus modifier l'arbre de
  travail pendant un `verify` lancé sur `main` : le résultat ne vaut plus pour `main`. (2026-11-09)
- **Champ du monde écrit à la sauvegarde : pas dans `saveText`** (cycle 179, #512) :
  `setEnvironment` sauvegarde en quittant le bac ; un champ posé dans `saveText` dès que
  `world.time` a avancé casse `setEnvironment (#277, #316)` (texte du bac repris différent).
  Comme `keepMaintenanceStart` : l'écrire à la sauvegarde automatique, à l'export et au changement
  de bac. Pour faire avancer une étape au temps simulé en e2e, importer un bac au `tick` assez
  grand : un temps de départ négatif refuse toute la sauvegarde, sans erreur visible. (2026-11-08)
- **Écrire dans le monde depuis un relevé de l'hôte : `aquarium-host.spec` compare au bit près**
  (cycle 176, #513) : `exposeWater` tourne aussi après un import ou à monde figé ; y poser un
  champ optionnel casse `toEqual(world)` et `serializeWorld(host.world) === serializeWorld(advance(…))`.
  Garder l'état dérivé à part (`WeakMap` par monde) et n'écrire qu'à une action ou à la sauvegarde
  automatique. `ng test --include=…` échoue sur les `.scss` : lancer la suite. (2026-11-08)
- **Boutons d'une rangée `--halves` : trois au plus** (cycle 184, #531) : à six, les libellés se
  chevauchent sans erreur (visible sur `front-soins.png`) ; ouvrir une rangée de plus. (2026-11-09)
- **Rangée « Outils d'entretien » du panneau : libellés courts obligatoires** (cycle 183, #530) :
  la rangée ne passe pas à la ligne ; un libellé long fait déborder le panneau en largeur à
  1280 × 720 (`e2e/cadrage-panneaux.spec.ts`). Mettre le nom complet dans `aria-label`.
  (2026-11-09)
- **Effet à durée en temps réel : invisible sur une capture en rendu logiciel** (cycle 175,
  #483) : une image peut prendre plusieurs secondes, les 6 s de `ALERT_HIGHLIGHT_MS` sont
  écoulées avant la photo. `e2e/alerte-animaux.spec.ts` allonge ce délai quand `CAPTURE_DIR`
  est défini. (2026-11-08)
- **Tous les e2e échouent en 3 ms en local : navigateur de Playwright introuvable** (cycle
  170, #484) : `browserType.launch: Executable doesn't exist at
  /opt/pw-browsers/chromium_headless_shell-1194/…`. L'environnement fournit un Chromium plus
  récent (`chromium_headless_shell-1243`) que celui attendu par Playwright 1.56 ; sans réseau
  vers le dépôt des navigateurs, `npx playwright install` échoue. Lien symbolique, hors du
  dépôt : `mkdir -p /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux && ln -sf
  /opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
  /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`. La CI, elle,
  installe son navigateur. (2026-11-07)
- **Remplacer la géométrie d'un maillage en cours de partie : `fond-ecran` compte les
  `WebGLBuffer`** (cycle 165, #477) : l'e2e d'endurance de la vue fond d'écran exige qu'aucun
  `WebGLBuffer` de plus ne soit vivant après une minute (`Runtime.queryObjects` après
  ramassage). Une plante qui grandissait d'un voxel recevait une géométrie neuve (l'ancienne
  `dispose()`) : +4 tampons par plante en CI (470 contre 458), le `dispose` ne suffisant pas à
  faire disparaître les objets JS des tampons. Allouer les tampons une fois avec de la marge
  et les réécrire en place (`needsUpdate`, `setDrawRange`), voir `render/plant-model.ts`
  (`paddedPlantMesh`). Pour mesurer en local : importer une sauvegarde juste sous un palier,
  compter les `WebGLBuffer` avant et après le palier. (2026-11-07)
- **Un état qui évolue à chaque pas dans l'eau du bac : deux tests de référence changent**
  (cycle 165, #477) : `room-state.spec.ts` (« reste identique à l'avant-lot », empreinte
  dorée du monde sérialisé) et `water.spec.ts` (« l'eau suit le modèle », `toEqual` sur l'eau
  entière) comparent toute l'eau. Un champ qui change dès le premier pas (pousse des plantes,
  `plantGrowth`) les fait échouer, sans régression. Retirer ce seul champ de la comparaison et
  le vérifier à part (voir ces deux tests), dans un commit `test` séparé expliqué dans la PR ;
  ne jamais réécrire l'empreinte dorée. Les algues (#476) n'y touchaient pas : rien n'est
  écrit sans pousse. (2026-11-07)
- **Quarantaine installée à 1280 × 720 : panneau en quatre colonnes** (cycle 195, #553) : bac
  malade et groupe « Quarantaine » affichés, « Bacs » part en troisième colonne et
  « Sauvegarde » en quatrième (`scrollWidth` 1048 pour 530, DejaVu Sans), déjà sur `main` ;
  `cadrage-panneaux` ne couvre pas ce cas. Le panneau défile en largeur. Mesuré par un script
  Playwright jetable (`?seed=42&points-blancs=1`, puis « Isoler en quarantaine »). (2026-11-11)
  Corrigé au cycle 202 (#571) : « Bacs » mesurait 572 px (deux bacs, transfert, quarantaine,
  renommage, message) pour ~240 px libres en deuxième colonne ; aucun rognage n'y suffisait
  (~410 px de trop, avant même « Animal à ramener »). Quarantaine affichée, le panneau passe
  sur **une colonne de 260 px qui défile** (`control-panel--single-column`), et le focus va au
  choix du bac de quarantaine pour l'amener à l'écran. Cas « Réglages (quarantaine) » et
  « quarantaine installée (#571) » de `cadrage-panneaux` (1280 × 720 et 900 × 700, DejaVu Sans).
  Même recours pour tout autre état qui ne tiendrait plus en deux colonnes. (2026-11-12)
- **Bac malade à 1280 × 720 : la première colonne du panneau est pleine** (cycle 192, #547) :
  avec « Soins » affichée, la colonne 1 finit à ~553 px pour une hauteur de 564 px ; une ligne
  de plus dans « Soins » (même un quatrième bouton qui passe à la ligne) envoie « Sauvegarde »
  en troisième colonne. La colonne 2 garde ~50 px libres : y mettre la ligne (ici, section
  « Bacs »). Mesurer plutôt que deviner : script Playwright qui ouvre `?seed=42&points-blancs=1`
  à 1280 × 720 (clé `aqfish.guide-debutant.v1` à `vu` dans le stockage, sinon le guide
  intercepte le clic) et relève `getBoundingClientRect` de chaque `.control-panel__section`.
  Forcer aussi `DejaVu Sans` (police de la CI, plus large) : « Installer un bac de quarantaine »
  (bouton `nowrap`) passait en local et débordait en CI à 390 et 320 px. (2026-11-10)
- **Section « Soins » du panneau à 1280 × 720 : « Sauvegarde » en troisième colonne, hors
  du panneau** (cycle 163, #488) : en deux colonnes (`column-count: 2` et `max-height`), une
  section qui ne tient plus dans la deuxième colonne en ouvre une troisième, à droite, hors de
  la largeur du panneau (débordement horizontal, sans erreur). Avec « Soins » affichée, la note
  des sources est masquée à ce format (elle reste dans l'infobulle de chaque bouton) : la
  section tient sous « Eau ». Cas couvert par `cadrage-panneaux` (« Réglages (soins) »).
  Depuis le cycle 164 (#490), le message d'un geste de soin n'est plus une ligne de la
  section à ce format : `app-treatment-notice` le pose en bulle (position absolue) à droite du
  panneau, alignée sur son bas ; son bloc conteneur est l'hôte fixe du panneau, donc le
  défilement du panneau ne la rogne pas. Ne pas positionner (`position: relative`) le
  panneau ni la section, sinon la bulle y est enfermée et rognée. Cas « Réglages (soins,
  message) » et « message de soin à 1280 × 720 (#490) ». (2026-11-06)
- **Aide-mémoire des commandes à 1280 × 720 : une ligne de plus le fait défiler** (cycle 163,
  #488) : la ligne de la raclette dépassait de 17 px (police par défaut et DejaVu Sans). Gagné
  sur les espacements (`row-gap: 0`, titres de groupe à 4 px au-dessus) ; pour une ligne de
  plus encore, il faudra regrouper des gestes ou passer en deux colonnes. (2026-11-06)
- **Mutants de `bubbles.ts` : survivants équivalents** (cycle 160, #475) : le score passe de
  76,1 % à 94,8 % (134 mutants : 126 tués, 1 en délai dépassé, 7 équivalents ; 10 à 12 min
  sur 2 cœurs). Les tirages sont verrouillés par un tirage de référence réécrit dans
  `bubbles.spec.ts` (« #475 ») : changer l'ordre ou les intervalles de `bubbleTraits` le fait échouer, c'est
  voulu. Restent sept mutants équivalents : `<=` au lieu de `<` dans les deux tirages à seuil
  (signe du zigzag, grosse bulle : égalité exacte d'un tirage, probabilité 2⁻³²) ; la fenêtre
  de numéros élargie (`water.maxY + BUBBLE_START_Y`, epsilon de `first` inversé) : les bulles
  en plus sont déjà sorties et sautées par `p.y >= water.maxY` ; la garde du courant forcée à
  `true` (ajouter `0 · age` ne change aucun octet) ; les objets de travail `scratchTraits` et
  `scratchPoint` vidés (`{}`), réécrits en entier avant toute lecture. Les messages des
  `RangeError` sont vérifiés par motif : sans cela, un tableau typé de taille invalide ou
  `deriveSeed` lèvent aussi une `RangeError` et les gardes semblent inutiles. (2026-11-06)
- **Mutants de `frog.ts` (lignes 141 à 300) : survivants équivalents et cas construits**
  (cycle 157, #450) : la plage passe de 55,2 % à 98,2 % (163 mutants : 160 tués, 3 équivalents ; ~10 min sur 2 cœurs).
  Restent trois mutants équivalents : `<=` au lieu de `<` dans la garde de l'arc de `canHop`
  et `>` au lieu de `>=` dans la distance aux obstacles de `createFrog` (une égalité exacte de
  réels calculés, hors de portée d'un test honnête), et l'objet `DRAW` vidé (`{}`), dont
  `hopDrawAt` réécrit les trois champs avant toute lecture. Les tests de naissance et de
  grille (`frog.spec.ts`, « #450 ») reposent sur des cas trouvés par une recherche jetable
  (graines 1 et 7, bornes `hard` modifiées, terrain à `waterSide: -1`) : un changement du
  tirage de `createFish` ou du terrain du paludarium peut les rendre caducs, le test le dit
  alors par son assertion de départ (`isOnLand`, `firstLand`). Piège rencontré : une grille
  de pas 1/8 et une de pas 1/10 partagent des points (4/8 = 5/10) ; choisir un premier point
  émergé hors de ces points communs. (2026-11-06)
- **Passer un conteneur flex `row wrap` en colonne : préciser `nowrap`** (cycle 153, #268) :
  `flex-direction: column` seul garde `flex-wrap: wrap` ; un enfant à `flex-basis: 100%`
  (détail d'une alerte du bandeau bas) part alors dans une seconde colonne, à droite, sous
  l'aide-mémoire : « Pourquoi ? » n'était plus cliquable (e2e `guide-debutant.spec.ts` rouge
  en CI, captures et autres e2e verts). Écrire `flex-flow: column nowrap` et remettre la base
  de l'enfant à `auto`. (2026-11-05)
- **Remplacer les couleurs en dur des panneaux par les jetons : garder `rgb(20 20 24 / NN%)`**
  (cycle 153, #92) : `ui/panel-contrast.spec.ts` lit les feuilles en texte et relève les fonds
  translucides par le motif littéral `background: rgb(20 20 24 / NN%)` pour vérifier leur
  opacité. Les écrire `rgba(layout.$panel-background, …)` ferait passer le test sans plus rien
  vérifier. Seuls les hex pleins (`#141418`, `#e8e6e3`, `#5fbfa3`) passent par
  `layout.$panel-…` ; le CSS produit est le même. (2026-11-05)
- **Règle de téléphone d'un composant placée avant la règle commune** (cycle 153, #318) : le
  bloc `@media (max-width: 480px)` de `control-panel.scss` est au milieu de la feuille ; une
  règle de même spécificité écrite plus bas (`.control-panel__row--halves > *`) l'emporte
  malgré la requête média. Doubler la classe (`.control-panel__row.control-panel__row--halves`)
  ou écrire la règle après la règle commune. (2026-11-05)
- **Sortir un morceau de gabarit dans un composant enfant : les classes du parent ne s'y
  appliquent plus** (cycle 149, #255) : avec l'encapsulation émulée, les sélecteurs de
  `control-panel.scss` portent l'attribut du panneau ; la fiche d'espèce sortie dans
  `species-sheet.ts` n'aurait gardé ni `control-panel__note`, ni `__button--compact`, ni
  `__sheet-status`. Recopier dans la feuille de l'enfant les seules valeurs utiles (classes
  propres `species-sheet__…`), poser `display: block` sur l'hôte (élément personnalisé
  `inline` par défaut) et garder les attributs de l'ancienne racine sur l'hôte (`role`,
  `id`, `data-…`) pour que tests et e2e ne changent pas. (2026-11-05)
- **Test de mutation d'un gros fichier de `sim` : hors de portée d'une session** (cycle 148,
  #235) : `npx stryker run --mutate src/app/sim/frog.ts` instrumente 466 mutants, et les
  tests qui les couvrent (`frog.spec.ts`, `triton.spec.ts`, ~36 s à eux deux sans
  instrumentation, plusieurs simulations de 20 000 pas) tournent pour presque chacun : bien
  plus d'une heure sur 2 cœurs. Lancer d'abord la mesure en arrière-plan, sur une plage de
  lignes (`--mutate src/app/sim/frog.ts:1-150`) par session, et consigner le score de
  chaque plage. Un petit fichier (`treatment-text.ts`, 123 mutants) prend ~30 s. (2026-11-05)
  Scores par plage : `1-140` → 95,24 % (cycle 148) ; `141-300` → **98,16 %** (cycle 201 :
  163 mutants, 155 tués, 5 délais, 12 min 16 sur 2 cœurs). Survivants de `141-300` : la
  tolérance `- 1e-9` de `canHop` (`<` → `<=`) et la borne `>= wallMargin` de `createFrog`,
  tués en construisant l'égalité exacte en flottant (milieu de l'arc à s = 1/2 avec
  `hopHeight` négatif ; sphère décalée sur un seul axe, rayon `d - wallMargin` exact quand
  `wallMargin ≥ d / 2`) ; l'objet par défaut `DRAW` (l. 293) est **équivalent** : ses trois
  champs sont réécrits par `hopDrawAt` avant toute lecture. Reste `301-521`.
- **Tests Node d'un outil écrit en TypeScript** (cycle 148, #384) : `scripts/*.test.mjs` peut
  importer `../e2e/outils-pixels.ts` directement (Node 22 efface les types, `import type`
  compris) ; Node affiche l'avertissement `MODULE_TYPELESS_PACKAGE_JSON` (paquet sans
  `"type": "module"`), sans effet sur le résultat. Ajouter `"type": "module"` à `package.json`
  pour le faire taire changerait la lecture de tous les `.js` du projet : pas pour un
  avertissement. (2026-11-05)

- **Un bouton de plus dans une rangée du panneau : il sort de sa colonne, sans erreur** (cycle
  140, #419) : `.control-panel__row` ne passe pas à la ligne ; le troisième bouton de « Bacs et
  meubles » débordait sous la section « Population » et l'e2e attendait 5 min un clic
  « intercepté » (`subtree intercepts pointer events`), tests unitaires, build et
  `cadrage-panneaux` verts (ce dernier n'ouvre pas la pièce). Modificateur
  `control-panel__row--wrap` ; regarder le panneau pièce affichée à 1280 × 720 après tout
  ajout au catalogue. (2026-11-03)
- **Captures faussées par un `ng serve` resté d'une autre campagne** (cycle 139, #40) : hors
  CI, Playwright réutilise un serveur déjà ouvert sur le port (`reuseExistingServer`). Un
  `ng serve` resté d'un essai précédent (compilation alors en erreur) a servi la première
  capture (`top.png`) avec le voile d'erreur de Vite par-dessus : fausse différence avec
  `main`. Pour comparer `main` et la branche, un worktree de `main` (lien vers
  `node_modules`), un port par côté (`E2E_PORT=4320`, `4330`) et un `CAPTURE_DIR` par côté ;
  relever les PID des serveurs restés (`ps aux | grep "[n]g serve"`) et les arrêter avant.
  (2026-11-03)
- **`pkill -f <motif>` tue aussi le shell de l'outil Bash** (cycle 138) : la ligne de
  commande du shell contient le motif (`ng `, `playwright test`…), il se tue lui-même (sortie 144) et la suite de la commande n'est pas exécutée. Lancer les longues commandes avec
  `nohup sh -c '… > journal 2>&1' &` et, pour arrêter, viser des PID relevés à part
  (`ps aux | grep "[p]laywright"`). (2026-11-03)
- **Écrire un signal dans le `stop()` de l'hôte (destruction) : une image de plus en
  attente** (cycle 137, #411) : sans zone, `signal.set()` planifie une détection de
  changements par `requestAnimationFrame` ; deux tests de l'hôte (« libère tout à la
  destruction », « sans effet après la destruction ») vérifient qu'aucune image n'attend après
  `fixture.destroy()` et échouent (`frames.pending.size` 1). Appeler le service directement
  (`ambientSound.setScene(null)`) sans toucher aux signaux du composant. (2026-11-03)
- **Compter les `AudioContext` en e2e** (cycle 137, #411) : Chromium headless crée un
  contexte sans périphérique audio, sans erreur. Remplacer `window.AudioContext` par une
  sous-classe qui compte créations et `close()`, posée par `page.addInitScript` avant
  l'application (`e2e/sons-ambiance.spec.ts`) ; ne jamais vérifier le signal. Un clic sur
  « Réglages » est déjà un geste : un choix « actif » mémorisé crée le contexte à ce clic.
  (2026-11-03)
- **Lire la source d'un module `.ts` dans un test unitaire** (cycle 137, #411) : `import src
from './m.ts' with { loader: 'text' }` fonctionne sous `ng test` comme pour une feuille
  SCSS, mais TypeScript refuse l'import d'un `.ts` : le précéder de `// @ts-expect-error`
  (voir `core/ambient-sound/ambient-sound.spec.ts`, qui vérifie qu'aucun import ne vient de
  `sim/`). (2026-11-03)
- **Parcours e2e à la touche Tab : une image par appui** (cycle 136, #407) : sous le rendu
  logiciel, `page.keyboard.press('Tab')` attend une image (~1,8 s en 1280 × 720, ~1 s en
  800 × 600), et chaque `page.evaluate` en coûte une autre. Un parcours des ~100 contrôles
  (réglages ouverts) relu à chaque appui dépassait 4 min. Consigner le focus dans la page par
  un écouteur `focusin` posé avec `page.addInitScript` (styles calculés compris), lire le
  journal une seule fois à la fin, et parcourir en 800 × 600 (`e2e/clavier-focus.spec.ts`,
  1,9 min). (2026-11-03)
- **Lire une feuille SCSS dans un test unitaire** (cycle 136, #407) : pas de `node:fs` dans
  `ng test` (pas de types Node, bundle esbuild). `import x from './_f.scss' with { loader:
'text' }` fonctionne (attribut d'import du builder Angular), avec la déclaration de module
  `ui/scss-text.d.ts`. Voir `ui/panel-contrast.spec.ts`. (2026-11-03)
- **`npm run verify` sur `main` en arrière-plan pendant qu'on code : il lit le travail en
  cours** (cycle 127, #363) : lancé sur `main` puis suivi de modifications dans le même clone,
  le build (après formatage, lint et unitaires) a compilé les fichiers déjà modifiés et
  échoué. Pour mesurer `main` sans attendre, un worktree séparé (`git worktree add <dossier>
origin/main`, `node_modules` en lien symbolique) ; il sert aussi aux captures « avant ».
  (2026-11-02)
- **Mesurer le temps d'image en local : ~0,6 s par image en 1280 × 720** (cycle 127, #363) :
  le rendu logiciel du navigateur headless est si lent que les écarts d'une scène à l'autre se
  perdent dans le bruit. Servir `dist/aqfish/browser` (`python3 -m http.server`), mesurer
  l'intervalle moyen entre `requestAnimationFrame` sur 6 s en 640 × 360, trois fois par
  scène (médiane), avant et après dans la même session. (2026-11-02)
- **E2e qui modifie la sauvegarde puis recharge : l'application la réécrit en partant**
  (cycle 122, #361) : `localStorage.setItem` puis `page.reload()` ne suffit pas, le
  `pagehide` de la page quittée enregistre l'état courant par-dessus la modification (la page
  rechargée était restée « Pause », cure à 0). Poser le texte modifié avec
  `page.addInitScript((t) => localStorage.setItem('aqfish.sauvegarde', t), texte)` avant
  `reload()` : il s'exécute dans le nouveau document, avant l'application. (2026-11-01)
- **« Réglages » refermé reste dans le DOM** (cycle 114, #344) : après un second clic sur
  « Réglages », `.control-panel` existe encore (masqué) : `toHaveCount(0)` échoue au bout de
  60 s ; attendre `toBeHidden()`. `toHaveCount(0)` ne vaut que quand l'éditeur de décor l'a
  remplacé (`startEditing`). (2026-10-31)
- **Test unitaire de l'hôte qui relit la sauvegarde : pas de `seed=` dans l'URL** (cycle 114,
  #344) : `seed=`, `environnement=` ou `population=` décrivent le monde et la sauvegarde n'est
  pas restaurée (`hasWorldParams`) ; ouvrir `create('?camera=three-quarter')` ou `create('')`.
  (2026-10-31)
- **Caméra hors orbite : ne pas appeler `controls.update()`** (cycle 113, #343) : avec
  `OrbitControls` désactivés, `update()` ramène encore la distance caméra-cible dans
  `[minDistance, maxDistance]` et la cible dans la sphère `maxTargetRadius` : une pose libre
  dans la pièce « saute » vers le bac. Placer `camera.position`, `controls.target` et
  `lookAt` à la main (`AquariumView.applyFreeState`) ; `setPose` (avec `update()`) seulement en
  revenant à l'orbite. (2026-10-31)
- **Aide-mémoire « Commandes » : une ligne de plus au plus** (cycle 113, #343) : à
  1280 × 720 il doit tenir sans défilement (`e2e/cadrage-panneaux.spec.ts`, seul test qui le
  voit, en CI part 1/6) ; un groupe de 4 lignes l'a fait déborder, tests unitaires verts. Une
  nouvelle touche : une ligne dans un groupe existant, description de 38 caractères au plus.
  Ouvert, il apparaît dans 9 captures d'interface, qui changent avec lui (`x ≥ 968`).
  (2026-10-31)
- **Test du fond d'écran qui attend la lecture d'`aqfish-fond.json` : poser la globale**
  (cycle 111, #332) : depuis #332, le fichier n'est lu que dans le paquet (globale
  `aqfishFond`) ou en `file://` ; un test unitaire ou e2e en `?fond=1` sans globale ne lit
  plus rien et démarre aussitôt (source `sauvegarde` ou `defaut`). Pour tester le fichier,
  poser `window.aqfishFond = { config: null, fps: null }` (`packageGlobal` dans
  `aquarium-host.spec.ts`, `asPackage` dans `e2e/fond-ecran.spec.ts`). (2026-10-30)
- **Repère clair sur un mur latéral de la pièce : il traverse l'eau en vue de côté** (cycle
  108, #324) : la cimaise reprise sur les murs de gauche et de droite (à 25 cm au-dessus du
  bac) se voyait, en vue `side`, comme un trait gris en travers de l'eau, au fond du bac ; les
  vues trois-quarts et de dessus n'en montraient rien. Murs latéraux sans repère, en
  `fondScene` (plus sombre que le `koiNoir` du fond) : le coin se lit, l'eau garde sa teinte.
  Pour tout objet sur un mur latéral, regarder `side-piece` et `side-piece-grand-bac`.
  (2026-10-30)
- **Paroi opaque sous la surface de l'eau du bassin : l'eau vire au gris** (cycle 107, #190) :
  la berge d'un bassin ovale entre dans la boîte d'eau (translucide, opacité 0,3) ; vue de
  trois-quarts, sa paroi de terre claire (`sableSombre`) se lisait à travers l'eau et la passe
  palette ramenait le mélange au gris, sur un tiers du bassin. Une paroi `rocheSombre` (comme
  les côtés de la margelle) garde la teinte de l'eau. Regarder la vue trois-quarts, pas
  seulement la vue de dessus. (2026-10-30)
- **Page ouverte en `file://` : trois refus de Chromium** (cycle 106, #279) : (1) le routeur
  d'Angular réécrit l'URL à la navigation initiale (`history.replaceState`) et lève
  `SecurityError` dans un document `file://` (routeur retiré, ADR 0079) ; (2) `fetch` d'un
  fichier voisin échoue toujours (« URL scheme "file" is not supported »), même avec
  `--allow-file-access-from-files` : passer par `XMLHttpRequest` (statut 0 en cas de succès) ;
  (3) sans ce drapeau, les modules ES de la page voisins sont refusés aussi. Seule
  `npm run paquet-fond` (page réelle en `file://`) l'a montré : les e2e passent par `ng serve`.
  (2026-10-30)
- **Endurance en e2e : la simulation avance au rythme du rendu** (cycle 106, #279) : en rendu
  logiciel, à 1280 × 720, 45 s réelles à `vitesse=4` n'ont fait que 32 s simulées (pas
  bornés par image, `maxStepsForSpeed`). Réduire la fenêtre (`setViewportSize` 320 × 180)
  pour viser des minutes simulées. (2026-10-30)
- **Documentation de Wallpaper Engine inaccessible** (cycle 106) : la lecture de
  `docs.wallpaperengine.io` a été refusée (autorisation non accordée en session automatique) ;
  ne pas la contourner, marquer « à vérifier par Mathis » ce qui en dépend. (2026-10-30)
- **`control-panel.scss` au bord du budget de style** (cycle 105, #323) : `anyComponentStyle`
  plafonne à 8 kB (`angular.json`) ; le panneau en est à ~7,9 kB. Les tests unitaires et
  l'e2e passent, seul `ng build` échoue (« exceeded maximum budget »). Réutiliser les classes
  existantes (`control-panel__tanks` pour une liste, `control-panel__warning`), imbriquer
  sous le sélecteur déjà présent, ou sortir un sous-composant. (2026-10-30)
- **Panneau des réglages à 1280 × 720 : pas une ligne de plus** (cycle 101, #316) : en
  deux colonnes de hauteur fixe, la moindre ligne ajoutée au cas par défaut (un seul bac)
  pousse « Sauvegarde » dans une troisième colonne hors du panneau ; seul
  `e2e/cadrage-panneaux.spec.ts` (débord horizontal, part 1/6) le voit, tests unitaires et
  captures restant verts. Toute nouvelle commande du panneau doit être conditionnelle
  (ici : renommage dès deux bacs) ou remplacer une ligne ; lancer cette spec en local.
  (2026-10-29)
  Depuis le cycle 121 (#362, onze espèces au bac tropical), la section « Population » défile
  seule à ce format (`max-height: calc(100vh - 350px)`) : ajouter une espèce ne déborde plus,
  mais toute autre section reste soumise à cette règle. `control-panel.scss` est à ~7,94 kB.
  Depuis le cycle 122 (#361), la section « Soins » (conditionnelle : malades ou traitement)
  raccourcit cette liste par la variable `--soins` posée sur le panneau
  (`max-height: calc(100vh - var(--soins, 350px))`) : une variable plutôt qu'une règle, faute de
  budget de style (~7,96 kB). Mesuré : panneau sans débord à 1280 × 720 avec la section
  affichée et le plus long message (sel avec néons).
  Depuis le cycle 126 (#370), cette hauteur est arrondie à un nombre entier de lignes
  d'espèce (`round(down, …, 46px)`, lignes de 40 px espacées de 6 px, mêmes hauteurs en
  Inter et en DejaVu Sans) : changer la hauteur d'une ligne d'espèce oblige à reprendre ces
  constantes ; `e2e/cadrage-panneaux.spec.ts` (« aucune ligne d'espèce coupée ») le voit.
- **Fonction déjà livrée sous le même nom** (cycle 101, #316) : `renameTank` existait dans
  `sim/room-state.ts` depuis le lot 2 (ADR 0073), sans être utilisée par l'interface ; en
  écrire une seconde a donné « Multiple exports with the same name » au build des tests.
  Avant d'ajouter une fonction de la roadmap, chercher son nom (`grep -rn "export function
<nom>" src`) et le tableau des modules de `docs/ARCHITECTURE.md`. (2026-10-29)
- **Prettier sur `docs/` réaligne tous les tableaux** (cycle 98, #305) : `npx prettier
--write ../docs/ARCHITECTURE.md` depuis `frontend/` a réécrit ~300 lignes (colonnes des
  tableaux), alors que `npm run format:check` ne regarde pas `docs/`. Ne formater que les
  fichiers de `frontend/` ; vérifier `git diff --stat` avant de commiter de la doc.
  (2026-10-29)
- **`pkill -f playwright` tue sa propre commande** (cycle 91, #291) : le motif apparaît dans
  la ligne de commande du shell qui lance `pkill` ; enchaîné à un `npx playwright test` dans
  le même appel, tout s'arrête (code 143 ou 144) sans rien lancer. Arrêter les processus dans
  un appel à part, ou viser un PID (`pgrep -f "ng serve"`). Lancer les e2e longues en tâche de
  fond (`nohup sh -c '…' &`) : un appel d'outil est coupé au bout de 10 min. (2026-10-28)
- **Identifiant d'environnement : lettres minuscules seulement** (cycle 87, #271) :
  `environnement=` n'accepte que `^[a-z]{1,20}$` (`core/capture/capture-params.ts`) ; un
  identifiant à tiret (`eau-froide`, essayé d'abord) est ignoré **sans erreur** et l'URL
  retombe sur le bac tropical : les captures du nouvel environnement montraient le bac
  tropical, tests unitaires et e2e du panneau verts. D'où `eaufroide`. Regarder la première
  capture d'un nouvel environnement avant de conclure. (2026-10-27)
- **Parts de la CI e2e : réparties par durée, pas par nombre de tests** (cycles 81 et 125,
  #260, #281) : `playwright test --shard=N/M` coupe la liste en tranches contiguës de même
  **nombre** de tests, fichiers entiers ; les fichiers lents se suivent dans l'ordre
  alphabétique (`camera-libre…` à `environnement…`) : part 2 à 29 puis 37 min, part 6 à
  12 min, sur la même CI (#248, #260). Depuis #281, `npm run e2e` passe par
  `scripts/parts-e2e.mjs` : avec `--shard=N/M` (seule option que passe la CI), il répartit
  les **fichiers** selon `e2e/durees.json` (plus long d'abord, dans la part la moins
  chargée ; fichier inconnu = durée moyenne) et ne lance que ceux de la part N ; sans
  `--shard`, ou avec des fichiers choisis, Playwright tel quel. La CI affiche la durée de
  chaque test (rapporteur `list`) et, en tête de part, la liste et la durée estimée.
  - **Remesurer** quand un fichier change beaucoup de durée ou qu'une part dépasse 25 min :
    télécharger les journaux des 6 parts
    (`gh api repos/{owner}/{repo}/actions/jobs/<id>/logs > p1.txt`, identifiants dans
    `commits/<sha>/check-runs`), puis `node scripts/parts-e2e.mjs --mesurer p*.txt`
    (réécrit `e2e/durees.json`) et le committer. Donner les journaux de **plusieurs séries**
    (moyenne par fichier) : une seule série garde l'écart de sa machine la plus lente.
  - **Vérifier une répartition** sans rien lancer :
    `for i in 1 2 3 4 5 6; do npm run e2e -- --shard=$i/6 --list | tail -1; done` (total =
    `npx playwright test --project=e2e --list`).
  - Les machines de la CI varient de ±30 % pour un même lot de tests (part 2 : 28,9 puis
    37,5 min, mêmes 63 tests) : au cycle 125, ~130 min de tests au total, soit ~22 min par
    part au mieux ; une part peut encore atteindre 26 min sur une machine lente. Sous 25 min
    à coup sûr : alléger les tests ou ajouter des parts (`ci.yml`, zone protégée).
  - Un test très long reste à découper (`dimensions-bac.spec.ts` : 5 min 20 en un test,
    deux depuis #281) ; une attente fixe qui attend un changement d'état devient
    `expect.poll` (`fond-ecran.spec.ts`). Les attentes fixes qui vérifient que **rien ne
    change** pendant une durée (`vues.spec.ts`, `panneau.spec.ts`) restent : sans elles, le
    test ne vérifie plus rien. (2026-11-01)
- **`DeviceOrientationEvent` en e2e : autorisation exigée ou non selon Chromium** (cycle 116,
  #346) : le Chromium local (1243) expose `DeviceOrientationEvent.requestPermission` (pas
  seulement Safari), celui de la CI non : un e2e ne doit supposer ni l'un ni l'autre. En
  local, elle répond `prompt` (donc refus) sauf si le contexte accorde
  `page.context().grantPermissions(['accelerometer', 'gyroscope'])`, et seulement pendant un
  geste (clic Playwright). Sans `localhost` ou HTTPS, l'API est absente (`about:blank` n'est
  pas un contexte sécurisé). `navigator.wakeLock.request` y est refusé (`NotAllowedError`).
  (2026-10-31)
- **`pointercancel` en test unitaire : `releasePointerCapture` manquant** (cycle 123, #346) :
  les contrôles d'orbite de Three.js écoutent `pointercancel` sur le canvas même désactivés,
  et appellent `releasePointerCapture`, absent de jsdom (erreur non gérée de Vitest, tests
  verts pourtant). Poser `canvas.releasePointerCapture = () => undefined` avant d'émettre
  l'événement. Minuteries : `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`
  et `setTimeout` global dans le composant (pas `defaultView.setTimeout`). (2026-11-01)
- **Minuterie d'interface et rendu logiciel en e2e** (cycle 123, #346) : à 1280 × 720 sous
  SwiftShader, une image du mode immersif peut durer plusieurs secondes ; une interface cachée
  après 5 s seulement disparaissait entre deux assertions, et un appui (`pointerdown` puis
  `pointerup` envoyés en deux appels Playwright) devenait un appui long. Exiger aussi un
  nombre d'images rendues avant de cacher, envoyer les deux événements d'un toucher dans un
  seul `evaluate`, et rendre l'interface par une touche du clavier avant de cliquer. Un clic
  Playwright en délai court (`timeout: 5_000`) peut aussi échouer **après** avoir cliqué
  (« waiting for scheduled navigations ») : ne pas le réessayer à l'aveugle. (2026-11-01)
- **Deux vues WebGL à la fois : e2e en délai dépassé** (cycle 115, #345) : le mode immersif
  a sa propre `AquariumView` ; tant que l'hôte continuait de rendre derrière le plein cadre,
  le parcours à 1280 × 720 dépassait 2 min en rendu logiciel. Suspendre la boucle de l'hôte
  (`setRenderingSuspended`) pendant toute vue plein cadre ajoutée par-dessus. (2026-10-31)
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
- **Panneau « Réglages » à 1280 × 720 : une section de trop ouvre une troisième colonne**
  (cycle 135, #406) : avec `column-count: 2` et une hauteur bornée, une section ajoutée avant
  « Sauvegarde » (deuxième colonne déjà pleine) a poussé « Sauvegarde » dans une troisième
  colonne hors du panneau (`scrollWidth` 789 > `clientWidth` 530 : `cadrage-panneaux` échoue).
  Placée juste après « Décor », sans ligne d'aide, elle tient dans la première colonne
  (~60 px de marge, Inter comme DejaVu Sans). Mesurer le bas de chaque `fieldset` des deux
  colonnes (`getBoundingClientRect().bottom`) avant d'ajouter une section.
  Cycle 143 (#426) : une simple ligne de bouton ajoutée dans « Sauvegarde » a suffi à
  déborder **en CI seulement** (Inter local : 11 px de marge) ; le bouton est passé sur la
  ligne du titre (`control-panel__legend--row`, comme « Changer l'eau »), sans ligne de plus.
  Cycle 162 (#476) : l'éclairage et la raclette (deux lignes, +67 px dans « Eau ») ont fait
  passer « Accessibilité » en deuxième colonne et « Sauvegarde » en troisième. Compensé en
  raccourcissant la liste « Population » d'une hauteur de deux lignes d'espèce (`--soins` par
  défaut 470 px au lieu de 350, 570 px au lieu de 450 avec la section « Soins ») : quatre
  lignes visibles à 1280 × 720, la liste défile. Avec « Soins » affichée, « Sauvegarde » était
  déjà en troisième colonne sur `main` (non testé par `cadrage-panneaux`).
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
- **`npx prettier --write` sur `docs/*.md` réaligne tous les tableaux** (cycle 166) : passer
  Prettier sur `docs/SOINS.md` a réécrit ~100 lignes de tableaux sans rapport avec le
  changement. `npm run format` ne vise que `frontend/` : ne pas y ajouter `../docs` ;
  remettre un document touché par erreur avec `git checkout HEAD -- <doc>` avant
  d'y refaire la seule modification voulue. (2026-11-07)

## Tests

- **Éléments en ligne d'un `@for` : aucun espace entre eux dans le texte** (cycle 197, #574) :
  Angular retire les nœuds de texte faits seulement d'espaces entre deux éléments (option
  `preserveWhitespaces` à `false`). Deux `<strong>` successifs d'un `@for` s'affichent espacés
  par leur marge, mais `textContent` et les lecteurs d'écran lisent « 10 gouttesKH ≈ 6 ». Un
  séparateur doit porter ses propres espaces en interpolation (`{{ ' · ' }}`, avec
  `white-space: pre`) ; tester `textContent`, pas seulement la capture. (2026-11-11)
- **Parcours Tab d'un panneau qui grossit : un test par section, repris par focus direct**
  (cycle 186, #544) : « au clavier : Tab jusqu'au bouton… » (`e2e/panneau.spec.ts`) tenait
  tout le panneau en un test ; chaque contrôle ajouté à « Eau » coûtait deux images (Tab, puis
  `toBeFocused`), et le test a dépassé deux fois son délai relevé à 4 min dans la CI de
  `main`. Relever encore le délai ne fait que reculer l'échéance. Découper par section : chaque
  test ouvre le panneau d'un clic, donne le focus (`locator.focus()`) au dernier contrôle
  vérifié par le test précédent, puis enchaîne les Tab ; la chaîne reste vérifiée maillon par
  maillon. Un nouveau contrôle va dans le test de sa section ; si une section dépasse ~15
  appuis, la couper à son tour. Le chemin depuis le haut de la page jusqu'à « Réglages » (~20
  appuis) ne relit plus le focus à chaque appui : journal `focusin` posé par
  `page.addInitScript`, relu tous les quatre appuis, appuis de trop défaits à Maj+Tab (3,2 →
  2,4 min sur une machine lente) ; il garde son délai de 4 min, avec seulement la courte section
  « Simulation » derrière lui. (2026-11-09)
- **Délai de 5 s de Vitest : la durée locale ne protège pas** (cycle 181, #525) : `catappa.spec.ts`
  (4 × 1 200 pas, ~0,6 s en local) a dépassé 5 s sur un runner chargé de la CI, code hors de
  cause. Une simulation dans un test (~1 000 pas d'un monde peuplé, ou ≥ 0,4 s en local) reçoit
  un délai explicite dès l'écriture (`it(…, () => { … }, 30_000)`), sans toucher aux assertions.
  Le relevé `npx vitest run --globals --reporter=json --outputFile=… src/app/sim` donne les
  durées par test (~3 min). (2026-11-09)

- **Clic sur le bac en e2e : refermer le panneau d'abord** (cycle 162, #476) : le panneau
  « Réglages » ouvert recouvre une partie du canvas et le tableau de bord ; Playwright attend
  alors indéfiniment que l'élément visé ne soit plus masqué (« subtree intercepts pointer
  events »), jusqu'au délai du test. Refermer le panneau (bouton « Réglages ») avant de
  cliquer sur le canvas ou sur une alerte. (2026-11-06)

- **Test unitaire de l'hôte qui rend des centaines d'images : délai de 5 s dépassé en CI**
  (cycle 153) : « limite les images par seconde (fps=, 30 par défaut) »
  (`aquarium-host.spec.ts`) crée deux hôtes et pousse 1 200 images ; il a pris 5,09 s sur la
  CI et échoué au délai par défaut de Vitest, sans rapport avec la PR. Un tel test reçoit un
  délai explicite (`it(…, async () => { … }, 20_000)`), sans toucher à ses assertions.
  (2026-11-05)
- **E2e : `projectToScreen` dans une boucle = trois allers-retours par point** (cycle 148,
  #384) : chaque appel relit la caméra, la cible et la boîte du canevas (deux
  `getAttribute`, un `boundingBox`), et chacun attend une image en rendu logiciel. Huit coins
  sous cinq préréglages : 120 allers-retours par test (`dimensions-bac.spec.ts`, 3,3 min en
  CI). Pour plusieurs points sous la même caméra, `screenProjector(page)` une fois puis la
  fonction rendue (mêmes calculs, aucune assertion en moins). (2026-11-05)

- **Case `[checked]="signal()"` qui reste cochée après un refus** (cycle 138, #413) : si le
  gestionnaire de `change` passe le signal à vrai puis le ramène à faux dans le même geste
  (démarrage refusé), sa valeur ne change pas pour la liaison et Angular ne réécrit pas
  `checked` : la case native reste cochée. Recaler l'élément dans le gestionnaire
  (`input.checked = state.enabled()`), et le tester par un clic réel dans `TestBed`.
  (2026-11-03)
- **`test.use({ reducedMotion: 'reduce' })` est ignoré sans erreur** (cycle 135, #406) :
  `reducedMotion` n'est pas une option de test de Playwright 1.56 ; la page voit
  `prefers-reduced-motion: no-preference`. Passer par le contexte :
  `test.use({ contextOptions: { reducedMotion: 'reduce' } })` (vérifié : `matchMedia` vrai).
- **Une transition de caméra de 0,5 s n'est pas observable en e2e** (cycle 135, #406) : en
  rendu logiciel, une image dure ~0,5 s, donc la transition finit dès la première image après
  le clic ; un test « arrivée immédiate » passe aussi sans saut. La durée se teste en
  unitaire (`presetTransitionSeconds`, hôte avec `FrameQueue`).

- **Compter des pixels en e2e : `locator('canvas').screenshot()` et décodage dans la page
  sont lents** (cycle 133, #394) : en rendu logiciel (~0,5 s par image), une capture d'élément
  du canevas prenait ~14 s en local (vérifications de stabilité de l'élément), et le décodage
  dans la page (`page.evaluate`, `fetch` d'une URL `data:`, `createImageBitmap`) ~7 s, chaque
  étape asynchrone attendant que le fil principal ait fini une image ; la boucle elle-même ne
  coûte presque rien. Utiliser `e2e/outils-pixels.ts` : `canvasShot` (`page.screenshot({ clip
})` sur la boîte du canevas, mêmes pixels, ~5 s) et `countColors` (PNG décodé dans Node par
  `node:zlib`, ~0,1 s, décomptes identiques à ceux du navigateur, vérifiés sur le récif). Les
  actions de l'interface (clic, `fill`) coûtent aussi plusieurs images chacune : en grouper les
  mesures (`evaluateAll`). (2026-11-02)
- **`npm run verify` lancé en arrière-plan pendant qu'on code : l'e2e teste l'arbre modifié**
  (cycle 99, #305) : le serveur des e2e (`ng serve`) sert le dossier de travail, pas `main` ;
  un « verify de `main` » laissé tourner pendant les premières modifications mesure donc la
  branche à moitié écrite. Vérifier `main` d'abord, jusqu'au bout, ou dans un autre clone
  (voir aussi « Deux clones, un seul serveur e2e »). (2026-10-29)
- **`aria-disabled` : Playwright refuse de cliquer** (cycle 99, #305) : un bouton
  `aria-disabled="true"` (resté focalisable, convention du panneau) est « not enabled » pour
  `click()`, qui attend jusqu'au délai du test. Vérifier l'attribut
  (`toHaveAttribute('aria-disabled', 'true')`) au lieu de cliquer. (2026-10-29)

- **Guide du débutant ouvert à la première visite : stockage de départ des e2e** (cycle 95,
  #240) : chaque test Playwright démarre avec un `localStorage` vide, donc le dialogue modal
  du guide couvrirait l'interface de tous les e2e. `playwright.config.ts` pose la clé
  `aqfish.guide-debutant.v1 = vu` par `storageState` ; un test qui veut la première visite
  utilise `test.use({ storageState: { cookies: [], origins: [] } })`. Un test qui vide le
  stockage (`localStorage.clear()`) doit fermer le guide (Échap) ou reposer la clé. (2026-10-28)

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
  Depuis #322 (cycle 104), les largeurs et positions partagées (marges, bord gauche et
  largeur maximale de « Réglages », largeur de l'aide-mémoire) n'existent que dans
  `src/app/ui/_panel-layout.scss` : un élément qui se place entre les panneaux les lit là
  (`@use '../panel-layout' as layout;`), sans recopier de valeur. (2026-10-30)
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
- **Mutation : survivants équivalents par les données** (cycle 97, #304) : dans
  `species-sheet.ts`, une branche que les données ne prennent jamais survit sans que le test
  manque : aucune espèce herbivore (`DIET_LABELS.herbivore`), aucune plage à bornes égales
  (`min === max`), aucune fiche sans espèce à éviter (`length === 0`, branche non couverte),
  `compatibility(a, a)` qui vaut déjà `compatible` (`other === species`), et
  `n === undefined` déjà rattrapé par `!(n > 0)`. Les noter équivalents dans la PR plutôt
  que d'exporter une fonction privée pour les tuer ; un libellé comparé à sa propre
  constante (`SHEET_FIELD_LABELS[f]`) ne tue rien : figer le texte attendu. (2026-10-29)
- **Mutation : bornes « à 0 donne 0 » = mutants équivalents, préférer `Math.max`/modulo**
  (cycle 118, #359) : dans `fixed-step.ts`, `x > 0 ? x : 0` (mutant `>= 0`) et la garde
  `if (rest < 0 || rest >= dt) rest = 0` (mutants `<= 0`, `> dt`) survivaient sans test
  possible : à la borne, les deux branches donnent le même résultat, ou la borne exacte
  (`rest === dt`) est introuvable en flottant. Réécrits en `Math.max(x, 0)` et
  `Math.max(rest, 0) % dt` (le modulo est exact pour `rest < dt`, donc résultats identiques
  à l'octet), le score passe de 72 % à 100 %. Au passage : `MAX_VALUE + MAX_VALUE` vaut
  `Infinity` et `Infinity - Infinity` vaut `NaN`, qu'aucune comparaison ne rattrape ; un
  `Number.isFinite` final le ramène à 0. (2026-10-31)
- **Mutation : garde rejetée en aval = survivant tant que le message n'est pas asserté**
  (cycle 132, #398) : la garde de `maxNewAnimals` dans `switchEnvironment` survivait vidée
  ou inversée parce que `capTotalPopulation` refusait ensuite la même valeur avec une autre
  `RangeError` : `toThrow(RangeError)` ne voit pas la différence. Asserter le message
  (`toThrow(new RangeError('…'))` ou `toThrow(/^maxNewAnimals /)`) et tester aussi le chemin
  où l'aval ne contrôle rien (monde repris). Le `i >= 0` de la boucle de retrait de
  `setPopulationInPlace` reste un mutant équivalent : l'effectif de l'espèce atteint la
  cible avant que l'indice ne passe sous 0. Une égalité testée par un nombre **pair** de
  retraits (6/6 → 5/5) ne distingue pas `>` de `>=` : en tester un nombre impair. (2026-11-02)
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

- **Un monde avancé sous Node ne rend pas la même image que le même monde avancé par
  Chromium** (cycle 143, #426) : la capture `?capture=1&seed=42&time=30` et celle d'un bac
  partagé fabriqué dans l'e2e (Node : `createDefaultWorld(42)` puis `advanceToWithFeedings`
  jusqu'à 30 s) différaient de 441 pixels (les corydoras), alors qu'à `time=0` elles étaient
  identiques et que l'aller-retour sauvegarde → monde est exact sous Node. Les calculs
  flottants de Node et du Chromium de Playwright divergent au fil de 1 800 pas. Pour comparer
  deux captures à l'octet, produire l'état **dans la page** (ici `shareTank()` appelé par
  `ng.getComponent`, `e2e/partage.spec.ts`) plutôt qu'en Node ; un état à t = 0 fabriqué en
  Node reste sûr. (2026-11-04)
- **`Blob.prototype.stream` absent sous `ng test` (jsdom)** (cycle 143) : `new Blob([…]).stream()`
  lève « stream is not a function » dans les tests unitaires alors qu'il marche dans le
  navigateur et sous Vitest seul. Construire le flux avec `new ReadableStream({ start })`
  (`core/share-codec`) ; le type à passer à `pipeThrough(new CompressionStream(…))` est
  `ReadableStream<BufferSource>`. (2026-11-04)

- **Un `expect` par pixel bloque Playwright** (cycle 169, #479) : vérifier l'opacité d'un PNG
  de 1869 × 1400 avec `expect(rgba[i + 3]).toBe(255)` dans la boucle crée 2,6 millions
  d'étapes de test ; le test ne finit pas en 10 min (pas même au délai de 2 min), alors que la
  même vérification comptée dans une variable puis testée une fois prend 14 s. Compter dans la
  boucle, un seul `expect` après. (2026-11-07)

## Simulation

- **Maladie liée à la santé : un bac jamais nourri tombe malade** (cycle 193, #548) : les
  champignons naissent sur un animal affaibli (santé < 0,5) ; or le bac par défaut, jamais
  nourri, passe sous 0,5 vers 5 minutes simulées (faim). Un test « bac par défaut sain sur
  10 minutes » échoue donc pour une maladie qui dépend de la santé : borner la durée (santé
  encore haute) ou nourrir, et tester la chaîne faim → faiblesse → maladie à part. (2026-11-10)
- **`delete` sur l'état d'eau du monde (`changeWaterInPlace`)** (cycle 171, #505) :
  `sim/water.ts` retire la dureté (`gh`, `kh`) de `world.water` par `delete water[key]` quand
  un changement d'eau la ramène à celle du robinet, comme le sel. Décision : on garde ce
  `delete` (action ponctuelle de l'utilisateur, jamais dans la boucle de pas ; l'absence du
  champ est le contrat de la sauvegarde et des empreintes de référence). À reconsidérer
  seulement si l'eau devient un objet lu ou écrit à chaque pas par le moteur : un `delete` y
  change la forme de l'objet (accès moins optimisés) ; préférer alors des champs toujours
  présents, `undefined` exclu de la sérialisation. (2026-11-07)
- **Un objet collé à une vitre n'est jamais à portée d'un nageur** (cycle 168, #478) : les
  bornes de nage (`boundsFor(...).hard`) sont à 3 cm des vitres pour le corydoras (4 cm pour
  le néon), et la marge aux parois les en éloigne encore. Avec une distance brute de 5 cm, les
  adultes ne mangeaient qu'1 œuf de vitre sur 51 en 180 s (neuf graines). Diminuer l'écart
  vers la vitre d'une portée (`EGG_GLASS_REACH`, `eggReachDistance2`) : 13 sur 51. Même
  remarque pour tout futur geste « contre la vitre » (broutage, nettoyage). (2026-11-07)

- **Horloge du jour d'un bac rangé** (cycle 164, #318 point 4, ADR 0076 « Limite connue ») :
  l'horloge du jour (`DayClock`) est celle du bac affiché, mais chaque monde la lit à son
  propre `time` ; un bac rangé dont le temps diffère de celui du bac affiché voit une autre
  heure (rythme jour/nuit décalé). Sans effet sur l'eau, la faim ni la liste des bacs (faim en
  clair depuis #318). À reprendre si un écart se voit à l'écran (bac posé rendu dans son
  repère, lot 3c) ou si la pièce passe à un jour commun : partir de `stepRoom` (ADR 0076).
  (2026-11-07)
- **Nouvel état dans l'eau : le copier dans `copyWater`** (cycle 162, #476) : `copyWater`
  ne recopiait que le tableau `catappa` ; un autre tableau ajouté à `WaterState` (couvertures
  des algues) serait partagé entre le monde et sa copie (`cloneWorld`, sauvegarde), et un
  pas sur l'une changerait l'autre. Tout champ tableau de l'eau doit y être recopié (test
  « copie de l'eau » de `algae.spec.ts`). (2026-11-06)

- **Échelles d'alevin trop proches : invisibles en pixel art** (cycle 199, #566) : à quelques
  pixels de scène, un poisson à 0,8 et un à 0,9 de l'adulte ont la même silhouette. Garder au
  moins 0,15 d'écart entre jalons (test `trois tailles lisibles`) et regarder la vue `front`
  (`front-alevins`) : vue de dessus, un alevin pâle sur le sable ne se distingue presque pas.
  Teinte de pâleur : le sable (`PALETTE.sable`) ; la teinte d'eau claire passe pour un reflet.
  (2026-11-11)
- **Alevin né près de sa mère : mangé au premier pas** (cycle 156, #459) : né à moins de 4 cm
  d'elle, hors des plantes, un alevin est dans le rayon de prédation de tous les adultes du
  banc ; sur la graine 42, 7 des 13 alevins d'exemple disparaissaient dès le premier pas.
  D'où un âge de grâce (`FRY_SAFE_AGE`) et des alevins d'exemple (`alevins=1`) nés près de la
  plante la plus proche. Tester la survie sur le bac par défaut avancé, pas seulement la règle
  de prédation isolée. (2026-11-06)
- **Nouvel animal en cours de partie : le banc de son espèce change** (cycle 156, #459) : des
  alevins ajoutés au bac déplacent aussi les adultes de leur espèce (banc par espèce), donc
  une capture avec alevins n'est pas « la capture par défaut plus des petits poissons ». Les
  angles par défaut, sans alevin, restent identiques à l'octet (vérifié par `cmp`). (2026-11-06)
- **Point visé collé à une vitre : l'évitement des parois le tient à 5 cm** (cycle 144, #427) :
  un point visé sur la limite `hard` est repoussé par `wallAvoidance` (portée `AVOID_ZONE`) ;
  le poisson brouteur restait à ~5 cm de la limite de nage au lieu de la vitre. D'où
  `stepFish(…, hugWalls)` (évitement des parois annulé, obstacles gardés). Autre surprise :
  pour l'ancistrus, `preferredMaxY` est **sous** `hard.minY` (corps épais, `maxHeightRatio`
  0,06) ; toute hauteur bornée par `preferredMaxY` doit d'abord la ramener à `hard.minY`, et un
  point visé au-dessus le fait monter durablement (descente lente : test « au ras du sable »
  de `eau-douce-lot2.spec.ts` rouge). (2026-11-04)
- **Marcheur du fond enfoncé dans le sable** (cycle 142, #425) : la marche pose le **centre** du
  modèle à `walker.clearance` au-dessus du fond. Avec une `clearance` plus petite que la
  demi-hauteur du modèle (`lignes du gabarit × bodyLength / colonnes × 0,75 / 2`), pattes et
  pied disparaissent sous le sable : la néritine de 6 cm à `clearance` 0,004 ne montrait que le
  haut de sa coquille en vue `front`. Prendre `clearance` ≈ demi-hauteur. (2026-11-04)
- **Égalité de taille : l'identifiant départage le mode immersif** (cycle 141, #422) : à
  `bodyLength` égal, `smallSwimmers` range par identifiant ; une blennie (`blennie`) de 0,1
  serait passée devant le gramma (0,1) et l'aurait chassé du mode immersif du récif. Lui donner
  une longueur strictement plus grande (0,106). Une espèce marcheuse (`walker`) n'y entre
  jamais, quelle que soit sa taille. (2026-11-04)
- **Agrandir un poisson du fond le remonte** (cycle 141, #405) : la marge des parois
  (`wallMargin` ≥ demi-longueur) borne aussi le sol ; le gobie passé de 0,105 à 0,13 nage
  donc un peu plus haut (médiane vers 14 % de la hauteur d'eau au lieu de 8 %). Vérifier les
  tests de hauteur et les captures après tout agrandissement. (2026-11-04)
- **Les marcheurs du fond traversent les obstacles** (cycle 141, #422) : `stepWalker` ne
  regarde que le sol ; au récif, une crevette aurait traversé coraux et rochers. Le
  contournement (pas, montée ou descente vers un obstacle refusés, sauf pour s'en éloigner) est
  **opt-in** (`walker.avoidsObstacles`, crevette seulement) : l'activer pour l'axolotl change
  les captures du bac d'eau froide, dont les rochers sont des obstacles (un axolotl s'y pose
  sur un rocher au lieu de le traverser). (2026-11-04)

- **Une espèce marine ajoutée change aussi le mode immersif du récif** (cycle 134, #403) : le
  bac immersif du récif prend ses trois plus petites espèces nageuses (`smallSwimmers`), et il
  n'en avait que deux. Toute espèce du récif, même plus grande que les autres, entre donc dans
  sa population ; une plus petite que le chirurgien (0,11) l'en chasse. Mettre à jour
  `immersive-tank.spec.ts` et `recif-lot2.spec.ts`, et le dire dans l'ADR. (2026-11-03)

- **Plafonds d'ajout ≠ bornes de validation** (cycle 130, #392, ADR 0096) : `ROOM_TANK_CAP`
  (16) et `ROOM_ANIMAL_CAP` (240) ne refusent que les **ajouts** ; `MAX_ROOM_TANKS` (32) et
  `MAX_TOTAL_FISH` (60 par bac) restent les bornes de lecture d'une sauvegarde. Baisser une
  borne de validation rendrait illisibles des sauvegardes existantes. Changer pour un
  environnement jamais visité crée son bac de départ **ramené à la place restante** (vide à la
  pièce pleine, #396) et ajoute un bac même à 16 bacs (seul le catalogue applique
  `ROOM_TANK_CAP`). (2026-11-02)
- **Pièce de N bacs en e2e : injecter la sauvegarde** (cycle 131, #396) : créer 16 bacs par
  le catalogue coûte plusieurs secondes par bac en rendu logiciel. Construire la pièce dans
  le test avec `createRoom`/`addTank` (sim pur, importable depuis `e2e/`), `serializeRoom`,
  puis `page.addInitScript` qui écrit `SAVE_STORAGE_KEY` avant `page.goto('/')`
  (`e2e/plafond-bacs.spec.ts`). (2026-11-02)
- **Temps de `scripts/mesure-piece.mjs` instables** (cycle 130, #392) : d'une exécution à
  l'autre, sur la même machine, les petites pièces varient du simple au double (1 bac de 10
  animaux : 0,11 à 0,26 ms par pas). Comparer les colonnes déterministes (paires par pas,
  sauvegarde, blocs) et ne retenir des temps que l'ordre de grandeur. (2026-11-02)
- **Une espèce plus petite change la population du mode immersif** (cycle 129, #391) : le bac
  immersif se peuple des trois plus petites espèces nageuses de son environnement, triées par
  `bodyLength` puis par identifiant (`smallSwimmers`, `sim/immersive-tank.ts`). Une nouvelle
  espèce tropicale de `bodyLength` ≤ 0,055 (rasbora) entre dans ce trio, même à égalité si son
  identifiant précède dans l'alphabet, et change la population par défaut du mode immersif et
  ses captures. Le tétra braise (2 cm en vrai) a un modèle de 0,056 pour cette raison ; le
  test `wood.spec.ts` épingle aussi la plus petite longueur (0,05). Vérifier
  `immersivePopulation('tropical')` après tout ajout. (2026-11-02)

- **Cache par monde dans l'hôte : un monde rangé a pu changer pendant qu'il était affiché**
  (cycle 100, #306) : `switchEnvironment` reprend l'**objet** rangé comme monde affiché, qui
  avance et change en place, puis le range de nouveau, toujours le même objet. Une valeur
  gardée en cache par identité de monde (`WeakMap<World, …>`, gravité d'alerte de la liste
  des bacs) est donc périmée au retour. Invalider l'entrée du monde affiché à chaque relevé
  (`frozenWorst.delete(world)`), ou ne mettre en cache que des valeurs d'un monde jamais
  affiché depuis. (2026-10-29)

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
- **Nouvelle espèce : tests transverses qui cassent hors des tables** (cycle 121, #362) : en
  plus des listes d'espèces (`kuhli:0,gourami:0` à allonger d'un `sed`, comptes de lignes du
  panneau 7 → 11), trois tests imposent des contraintes globales : le nom scientifique doit être
  un binôme `Genre espèce` (`amphibiens-reels.spec.ts` : pas de « cf. » ni de « sp. ») ; le
  libellé pluriel doit différer du singulier (`species-catalog.spec.ts`, sauf nom invariable en
  -s, -x, -z depuis #362) ; le plus petit poisson (`bodyLength`) fixe la largeur du passage
  entre branches de bois testée (`wood.spec.ts`, 5 cm) : une espèce plus petite casse ce test,
  garder `bodyLength` ≥ 0,05 m. Une espèce de fond épaisse (ancistrus) a son centre vers 12 %
  de la colonne même avec `maxHeightRatio` 0,06. (2026-11-01)
- **Espèce ajoutable à un environnement : l'attribut de population s'allonge** (cycle 93,
  #238) : `data-aqfish-population` liste **toutes** les espèces de `Environment.species`,
  effectif nul compris. Ajouter quatre espèces au bac tropical sans les peupler change donc
  ~30 attentes e2e (`'neon:12,guppy:6,corydora:6'` devient `…,rasbora:0,tetra:0,kuhli:0,gourami:0`)
  et les comptes de lignes du panneau (3 → 7) ; chercher `corydora:` et `toHaveCount(3)` dans
  `e2e/`. Les captures du canevas restent identiques, celles du panneau changent. (2026-10-28)
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
- **Test « tout reste dans la boîte » sur des milliers de points : trop d'`expect`** : un
  `expect` par coordonnée (3 graines × 8 directions × 400 instants × ~40 bulles × 6 bornes)
  dépasse le délai de 5 s de Vitest. Accumuler les écarts dans un tableau de messages et finir
  par un seul `expect(ecarts).toEqual([])` : plus rapide, et l'échec liste les cas fautifs
  (`bubbles.spec.ts`, issue #473). (2026-11-06)

## Rendu

- **Effet translucide d'une couleur « locale » : la passe palette la renvoie ailleurs**
  (cycle 203, #567) : au récif, des rayons en `eauRecifClaire` à 30 % sur l'eau bleue
  retombaient exactement sur l'eau (invisibles), et en `koiBlanc` sur le violet des coraux
  (`corailVioletClair`). Le mélange est classé par la passe, pas la couleur d'entrée : essayer
  la couleur sur chaque environnement concerné et regarder les captures ; une couleur déjà
  employée au même endroit (le reflet `eauTresClaire`) est la valeur sûre. Autre leçon : un
  tramage ordonné épars sur toute une surface se lit comme du bruit à basse résolution ; des
  traits continus au bout tramé se lisent comme des rayons. (2026-11-12)
- **Trop d'attributs de sommet pour les poissons : une maladie = un attribut ne passe plus
  l'échelle** (cycle 200, #578) : hydropisie (#565) et pâleur des alevins (#566), fusionnées
  l'une après l'autre, portaient le matériau à 15 emplacements comptés (position, couleur,
  `instanceMatrix` ×4, rangs de taché et d'effilochage, 7 attributs d'instance) : sous
  Chromium (`MAX_VERTEX_ATTRIBS` = 16 pourtant), `Too many attributes (aqfishSpot)`, programme
  invalide, erreur de page dans tous les e2e qui dessinent un poisson. Chaque PR seule passait.
  Les intensités d'instance sont désormais groupées en deux `vec4` (`SIGNS_A_ATTRIBUTE`,
  `SIGNS_B_ATTRIBUTE`, `render/fish-layer.ts`) : 10 emplacements. Un nouveau signe prend une
  composante libre (il n'y en a plus : ouvrir un troisième `vec4`), jamais un `float` à part ;
  `fish-layer.spec.ts` compte les emplacements du shader complet (≤ 12). Un signe propre au
  corps (comme l'hydropisie) passe à zéro dans le tampon de la queue. (2026-11-11)
- **Shader des poissons : un attribut de plus et plus aucun poisson** (cycle 198, #565) : le
  matériau des poissons lit déjà position, couleur, `instanceMatrix` (4 emplacements), rangs de
  taché et d'effilochage et un attribut d'instance par maladie. Un attribut de sommet `vec2` et un
  attribut d'instance de plus : `Too many attributes (aqfishSpot)` dans la console, programme
  invalide, **aucun poisson** sur les captures (sans échec de test). Regrouper les valeurs dans un
  `vec2`/`vec4`, ou calculer dans le shader à partir de `position` et d'un uniforme par matériau
  (`shader.uniforms` dans `onBeforeCompile`) ; regarder les captures après tout ajout
  d'attribut. (2026-11-11)
- **Teinter un poisson par mélange de couleur : la passe palette change l'espèce** (cycle 189,
  #532) : un voile doré mêlé à 45 % (puis 20 %) à toutes les couleurs du néon faisait retomber
  son rouge et son bleu sur l'orange et le menthe de la palette ; tous les poissons malades
  devenaient jaunes et indiscernables. Pour un signe de maladie, préférer des voxels pleins
  (poussière, points) sur une part des voxels et un mélange global très faible (≤ 10 %), puis
  comparer sur capture zoomée (`front-velours`). (2026-11-10)
  Cycle 195 (#556) : la poussière (voxels pleins) suffisait encore à cacher le néon, ses voxels
  tachables étant justement le rouge et le bleu (ventre et nageoires, trop pâles, ne le sont
  jamais). Épargner les voxels saturés dans le shader (écart max − min des composantes linéaires
  ≥ `VELVET_SPARED_SATURATION`) : rouge et bleu restent, la poussière tombe sur le reste.
- **Petit objet crème dans l'eau : un pixel et l'ombrage par face le font disparaître**
  (cycle 168, #478) : un œuf de 7 mm (un pixel de scène) ombré par face comme les granulés
  (`shadedVoxelGeometry`) tombait, vu de face, sur le ton du sable (flanc à 0,72) et ne se
  distinguait plus du rocher voisin. Couleur plate sur toutes les faces, 13 mm de côté et un
  liseré `koiNoir` (maillage plus grand dessiné avant, sans écrire la profondeur, puis le
  cœur) : la grappe se lit en trois-quarts ; derrière plus d'eau (œufs des plantes), la passe
  palette la tire vers `eauTresClaire`. Vérifier sur une capture recadrée et agrandie (PIL,
  `Image.NEAREST`) : la différence avec la capture sans œuf tient en quelques pixels.
  (2026-11-07)

- **Vert sombre sous l'eau : ramené au bleu-vert de l'eau** (cycle 162, #476) : une tache
  plate opaque dans l'eau (plaque d'algues) en `vegetationSombre` ou `vegetationOmbre` sort
  de la passe palette en `eauSombre`/`eauMoyenne`, couleurs de l'eau voisine : le contour se
  confond avec le fond. `vegetation` (contour) donne un liseré `eauMoyenne` visible autour du
  cœur `vegetationClaire`. Regarder un recadrage agrandi (`PIL`, `Image.NEAREST`) avant de
  conclure. (2026-11-06)

- **Indicateur à montrer sur capture : l'interface Angular est masquée en mode capture**
  (cycle 158, #460) : `app.html` ne dessine ni panneau, ni badge, ni tableau de bord avec
  `capture=1` ; un repère en HTML n'apparaîtrait sur aucune capture. Le repère du courant est
  donc une couche de la scène (`render/current-indicator-layer.ts`), posée au temps simulé,
  et tourne avec la caméra. (2026-11-06)
- **Éclaircir un décor posé sous l'eau peu profonde : la passe palette peut le virer au vert**
  (cycle 154, #155) : les flancs des racines du paludarium passés de `rocheSombre` à un brun
  (`sableOmbre`, dessus `sableSombre`) donnaient, sous la lame d'eau claire de la berge, des
  tirets `vegetationLumineuse` (brun clair mélangé à l'eau claire, plus proche du vert que de
  `eauClaire`) : on aurait dit des algues. Regarder la zone d'eau peu profonde de
  `paludarium-three-quarter` après tout changement de teinte d'un décor de berge ; compter les
  couples de couleurs avant / après (Pillow) plutôt que de se fier à la vignette. (2026-11-05)
- **Captures après une modification du code : `ng serve` resté ouvert sert l'ancien paquet**
  (cycle 154) : une capture relancée sur le port d'une campagne encore en cours
  (`reuseExistingServer`) est sortie identique à l'octet à la précédente malgré la
  modification. Arrêter les serveurs (`ps aux | grep "[n]g serve"`, PID) avant de relancer
  une capture d'essai. (2026-11-05)
- **`filtre=aucun` donne désormais l'entrée de la passe palette, en pleine résolution**
  (cycle 139, #40, ADR 0101) : la scène passe par une cible sRGB 8 bits comme en pixel art,
  donc les translucides s'y mélangent en linéaire. Une couleur lue sans filtre est celle que
  la passe reçoit avant la réduction à la palette, aux pixels près (pleine résolution : bords,
  points et couches dont la taille suit la résolution diffèrent). Les entrées plus anciennes
  ont été corrigées en ce sens (cycle 147, #418) ; pour un pixel précis, le court-circuit de
  la passe reste la mesure exacte. (2026-11-03)
- **Les verts d'eau se confondent avec les reflets de la surface du récif** (cycle 134, #403) :
  un poisson `eauClaire` / `eauTresClaire` (#5fbfa3, #a8e6cf) nageant haut se lit en capture
  comme les taches vertes des reflets. Pour un poisson vert au récif, prendre
  `vegetationLumineuse` / `grenouilleVert` et le garder sous 75 % de la hauteur d'eau
  (chromis). Recadrer et agrandir la capture (`PIL`, `Image.NEAREST`) pour en juger. (2026-11-03)

- **Points blancs invisibles sur un voxel déjà pâle** (cycle 126, #370) : le blanc cassé des
  points (`koiBlanc`) est la couleur exacte du ventre du néon ; tirés au hasard sur tous les
  voxels, la moitié des points du néon ne se voyaient pas et ceux du guppy mâle se perdaient
  entre ses taches roses. Seuls les rôles de couleur à au moins `SPOT_MIN_CONTRAST` du blanc
  cassé portent des points (`spotContrasts`, `render/fish-model.ts`). Une espèce toute pâle
  (koï blanche, axolotl leucique) n'en montre donc aucun : normal. (2026-11-01)
- **Couleur d'un poisson de fond égale à celle de la roche** (cycle 126, #370) : l'ancistrus
  en `roche` / `rocheSombre` se fondait dans les rochers, ses taches crème se lisaient comme
  du sable. Pour un animal posé sur le décor, éviter les tons exacts du décor voisin ; le
  regarder de près en caméra libre (`libre-eau-douce-lot2-fond`). (2026-11-01)

- **Objet posé contre un mur de la pièce : reculer l'aire de pose** (cycle 127, #363) : les
  plinthes des murs latéraux et d'en face entraient d'un voxel dans l'aire du parquet
  (`roomArea`) : un meuble plaqué au mur les aurait traversées. Toute saillie d'un mur se
  retire de `roomArea` (pose des meubles, choix d'un point du parquet, pose automatique du
  catalogue) ; un objet qui interdit une zone (passage devant la porte) y figure aussi
  (`area.door`). Les meubles relus d'une sauvegarde ne sont pas reposés : un meuble ancien
  plaqué au mur garde sa place. Et la plinthe du mur de gauche, en vue de côté, passe derrière
  le bas de l'eau : en `rocheSombre`, elle virait au gris quelques pixels d'eau du coin du
  grand bac ; en `koiNoir`, l'eau ne change pas (vérifier au pixel la zone du bac, pas
  seulement à l'œil). (2026-11-02)
- **Halo d'une lampe en un seul carré : il se lit comme un panneau** (cycle 127, #363) : un
  bloc plat clair derrière l'applique faisait un tableau accroché au mur. Deux croix emboîtées
  en deux tons (la plus claire devant, d'un voxel) donnent une lueur en marches de pixel art.
  (2026-11-02)
- **Objet clair sur le mur du fond : traverse l'eau en vue de côté et de trois-quarts** (cycle
  112, #342) : en vue `side`, le mur du fond se voit en enfilade derrière le bac ; une fenêtre
  posée dessus, même à 1,5 m à gauche du bac, y traçait des traits clairs verticaux à travers
  l'eau ; en trois-quarts, sa vitre vue à travers le haut du bac virait l'eau à la menthe.
  S'éloigner du bac ne suffit pas (la perspective ramène le mur vers le centre) : masquer
  l'objet dès que le bac s'interpose (`isWindowClear`, `sim/room-window.ts`). Et une saillie
  égale à celle de la cimaise (1,5 cm, soit 2 cm au voxel) se confond avec elle : la cimaise
  traversait la vitre ; dépasser d'un voxel. (2026-10-31)
- **Objet plat posé sur le sable : masqué en dessous de 6 mm** (cycle 94, #239) : une feuille
  posée 2 mm au-dessus du sable ne s'affichait pas du tout, même sans filtre ; visible à
  8 mm. Les ombres plates du décor posées sur le sable l'emportent dans le tampon de
  profondeur. Pour un objet au sol, partir de 8 mm et vérifier sur capture. (2026-10-28)
- **Marqueur d'opacité des granulés : dessiner après l'eau et les vitres** (cycle 94, #239) :
  une feuille marquée comme un granulé (`withFoodMarker`) mais dessinée avant l'eau (ordre
  0,5) voyait son opacité remontée par l'eau puis les vitres au-dessus du seuil de la passe :
  gris de la palette au lieu des bruns de la nourriture. Ordre de rendu juste avant
  `FOOD_CORE_RENDER_ORDER`. (2026-10-28)
- **Teinter l'eau d'une couleur absente de la palette** (cycle 94, #239) : un brun d'entrée
  mêlé à 60 % à l'eau de jour tombait sur `rocheSombre` et `roche` (eau grise). Il faut à la
  fois une entrée saturée remplaçant toute la teinte (mélange 1) et des tons d'environnement
  dédiés (ADR 0039) proposés seulement quand la teinte est active ; mesurer quelques pixels
  avec et sans filtre (Pillow) pour régler les tons sur l'entrée réelle de la passe.
  (2026-10-28)

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
  mesurant quelques pixels (Pillow) : `filtre=aucun` donne l'entrée de la passe depuis le
  cycle 139 (ADR 0101, voir plus haut), aux pixels de bord près. Un serveur `ng serve` séparé (`--port 4310`) recharge la teinte en ~10 s. (2026-10-25)
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
  poser le ton sur la couleur mesurée (passe court-circuitée, voir plus bas). Depuis le
  cycle 139 (ADR 0101), la capture `filtre=aucun` donne l'entrée de la passe en pleine
  résolution ; pour un pixel précis, court-circuiter la passe (`gl_FragColor = vec4(color,
1.0)`), et vérifier le choix par `nameAt` dans `palette.spec.ts`, qui applique les vraies
  pénalités. (2026-10-24, corrigé le 2026-11-04)
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
- **Assombrir légèrement une scène : la palette de jour est trop espacée** (cycle 109, #123) :
  un facteur dédié de 0,85 sur les lumières, l'eau et le décor (sans toucher à l'intensité du
  jour) ne changeait presque rien à l'image (herbe et eau ramenées à leur couleur de midi) et
  faisait passer la margelle du beige au gris. Un assombrissement léger demande des tons
  intermédiaires proposés seulement dans ce cas (tons d'environnement, ADR 0082). Mesurer la
  luminance moyenne et l'histogramme des captures avant et après, pas seulement l'œil. (2026-10-30)
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
  « plus de couleurs que la palette » échoue). Jusqu'au cycle 139, les translucides s'y
  mélangeaient en sRGB à l'écran (sable plus vert, eau plus sombre qu'en pixel art) ; depuis
  l'ADR 0101 ils se mélangent dans une cible sRGB 8 bits, comme en pixel art. Distinguer les
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
