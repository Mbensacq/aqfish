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

## Rendu

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
