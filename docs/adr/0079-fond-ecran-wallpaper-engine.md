# 0079 — Vue fond d'écran pour Wallpaper Engine

- Statut : acceptée
- Date : 2026-10-30
- Auteur : Dev, cycle 106, issue #279

## Contexte

Mathis veut voir ses bacs vivre **en fond d'écran avec Wallpaper Engine** (Windows), qui
affiche une page web locale importée comme projet, en général sans interaction. Il faut une
vue sans interface, légère sur des heures, qui montre la scène de l'utilisateur, et un dossier
prêt à importer. Les agents ne peuvent pas lancer Wallpaper Engine : seule la documentation
publique et un Chromium sont disponibles, et la documentation n'a pas pu être relue pendant
le cycle (accès refusé) ; tout ce qui touche à Wallpaper Engine lui-même est donc **à vérifier
par Mathis** (`docs/FOND-ECRAN.md`).

## Décision

1. **Activation** : `fond=1` dans l'URL, ou globale `window.aqfishFond` posée par le script
   `aqfish-fond.js` du paquet (Wallpaper Engine ouvre `index.html` sans paramètre). Lecture
   pure dans `core/wallpaper/wallpaper.ts`.
2. **Sans interface** : `App` n'affiche que l'hôte du canvas (`interfaceShown`), par un
   drapeau et non par CSS ; aucun élément focalisable ; le guide du débutant ne s'ouvre pas.
   Contrôles à la souris désactivés (`interactive: false`, comme en capture) : un clic sur le
   bureau ne nourrit ni ne tourne rien.
3. **Caméra automatique** au temps réel (jamais au temps simulé : la simulation et son
   déterminisme ne sont pas touchés) : balancement sinusoïdal de ±0,6 rad en 90 s autour de
   la vue trois-quarts (`wallpaperOrbitAngle`, `orbitPose`, `AquariumView.applyOrbit`).
   Un balancement plutôt qu'un tour complet : pas de vue de dos ni de mur entre la caméra et
   le bac. Pas de temps borné à 0,25 s : aucun saut après une pause.
4. **Configuration**, premier candidat lisible dans l'ordre (`chooseWallpaperConfig`, relue
   par `parseSaveWorlds`, un candidat invalide est ignoré) : `aqfish-fond.json` à côté de la
   page (un export de l'application, schémas 1 et 2), `aqfishFond.config` du script, la
   sauvegarde locale, la scène par défaut. Un paramètre de monde de l'URL prime, comme
   ailleurs. Jamais d'écriture du stockage : la vue n'écrase pas la sauvegarde de l'application.
5. **Lecture du fichier** (`readLocalText`) : `fetch` en `http(s)`, `XMLHttpRequest` en
   `file://`, où Chromium refuse `fetch` (« URL scheme "file" is not supported ») mais
   accepte XHR si l'hôte autorise l'accès aux fichiers (`--allow-file-access-from-files`).
   Si l'hôte le refuse aussi, le script `aqfish-fond.js` (chargé par une balise `<script>`
   classique, toujours permise) porte la même configuration : repli garanti.
6. **Légèreté** : limiteur d'images (`frameDue`, 30 par défaut, `fps=` ou `aqfishFond.fps`
   bornés à [15, 60]) qui tient la cadence en moyenne sur un écran de fréquence quelconque
   sans allocation ; boucle arrêtée quand la page est masquée (`visibilitychange`), reprise
   sans rattrapage ; pixel ratio 1 (image pixel art).
7. **Routeur retiré** (`provideRouter` avec une liste de routes vide, aucune `router-outlet`) :
   à la navigation initiale, il réécrivait l'URL par `history.replaceState`, ce qu'un
   document `file://` refuse (`SecurityError`, trouvé par la vérification du paquet). Il ne
   servait à rien (application d'une page). La dépendance `@angular/router` reste dans
   `package.json` (retrait à faire avec une mise à jour des dépendances).
8. **Paquet** `npm run paquet-fond` (`scripts/paquet-fond.mjs`) : build `--base-href ./`,
   `aqfish-fond.json` d'exemple (`fond-ecran/aqfish-fond.json`, bac tropical en mode décor,
   pièce affichée, validé par un test unitaire), `aqfish-fond.js`, balise injectée en tête
   d'`index.html`, puis **vérification** : page ouverte en `file://` dans le Chromium de
   Playwright, vue fond d'écran démarrée sur l'exemple sans erreur, `preview.jpg` capturé.
   Le script échoue sinon.

## Options écartées

- **Masquer l'interface par CSS** : les composants (raccourcis clavier, guide) restaient
  actifs et focalisables.
- **Tour complet de la caméra** : vue de dos, mur de la pièce dans le champ.
- **Désactiver le guide, le routeur et l'autosave seulement dans le paquet** (build à part) :
  deux applications à maintenir ; un drapeau d'exécution suffit.
- **Configuration uniquement par script** : l'utilisateur devrait éditer du JavaScript ;
  l'export JSON de l'application, renommé, reste le chemin principal.
- **Publication du paquet comme fichier de release** : exige de modifier
  `.github/workflows/release.yml` (zone protégée) : issue de suite, `validation-mathis`.

## Conséquences

- Le contrat de capture gagne `fond=` et `fps=` (sans effet sur les séries existantes).
- Un bac en mode soins laissé des heures en fond d'écran voit ses animaux avoir faim : le guide
  recommande le mode décor (eau, faim et santé en pause, ADR 0077) ; l'exemple y est.
- La vérification du paquet n'est pas en CI tant que le workflow n'est pas modifié ; elle se
  lance à la main (`npm run paquet-fond`).
- À vérifier par Mathis dans Wallpaper Engine : accès aux fichiers voisins (XHR) ou repli sur
  le script, modules ES en local, visibilité de la page quand une application est en plein
  écran, limiteur d'images de Wallpaper Engine combiné au nôtre.
- Mise à jour (cycle 111, #332) : `aqfish-fond.json` n'est lu que dans le paquet (globale
  `aqfishFond` présente) ou en `file://` (`shouldReadWallpaperFile`) ; en ligne ou sous
  `ng serve` avec `fond=1`, la lecture d'un fichier absent laissait une erreur 404 en console.
  L'e2e simule le paquet en posant la globale (`asPackage`, `e2e/fond-ecran.spec.ts`).
