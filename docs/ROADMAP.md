# Roadmap

Tenue par **Planif**. Ce fichier liste les phases, les versions et les épopées ; le détail
des fonctionnalités vit dans les issues (étiquette `fonctionnalite`), qui forment le backlog.
Planif peut réordonner, découper et compléter à chaque rétrospective, en expliquant ses
choix dans l'issue `retro` du sprint. Mathis oriente par des issues `idee-mathis` ; l'équipe
ne l'attend jamais.

## Calendrier (mode continu)

- L'équipe enchaîne des **cycles** (Planif → Dev → QA → Revue) en continu, jusqu'à
  `experience.plafondParJour` cycles par jour (12 par défaut). Voir `CLAUDE.md`.
- Un **sprint** = 7 cycles : 5 cycles `fonctionnalite`, puis 1 cycle `dette`, puis 1 cycle
  `retro`.
- Pas de pause aux fins de phase : le Superviseur fait un **bilan tous les 4 sprints** dans son
  rapport du jour, et l'équipe continue.
- Les phases ci-dessous comptent en sprints (« semaines » dans les anciens textes).

## Versions

Une version mineure par sprint (`v0.<sprint>`), un correctif par PR fusionnée :
`v0.1.0`, `v0.1.1`… Le sprint 12 produit `v1.0.0` ; ensuite `v1.<sprint − 12>`. La version
est fixée dans `frontend/package.json` par Revue avant la fusion ; le workflow `release.yml`
publie alors le front sur GitHub Pages et crée le tag et la release (notes : `docs/versions/`).

## Phase 1 — Le bac et la vie (sprints 1 à 4, front seul)

| Version | Épopée | Contenu visé |
|---|---|---|
| v0.1 | Le bac | Composant hôte Three.js ; bac vitré, eau, sable ; caméra orbitale à la souris et préréglages ; contrat de capture complet ; pipeline pixel art (basse résolution, `NearestFilter`) ; PRNG à graine et boucle à pas fixe ; une première espèce qui nage |
| v0.2 | Le banc | Comportement de banc (séparation, alignement, cohésion), évitement des parois et obstacles, ondulation du corps ; trois espèces générées par le code ; palette et contours |
| v0.3 | Le décor | Rochers, plantes qui ondulent, bulles, caustiques, cycle jour/nuit, éclairage ; panneau de contrôle |
| v0.4 | La vie | Nourrissage au clic (chute, attraction, faim) ; population réglable ; vitesse de simulation ; sauvegarde dans le navigateur, export et import JSON |

**Fin de phase 1** : bilan dans le rapport du jour. L'hébergement du backend NestJS (NAS
Synology en conteneur, ou Infomaniak) est une décision de Mathis : issue `bloque`, sans
attendre la réponse pour continuer.

## Phase 2 — Les mondes (sprints 5 à 9)

Mise à jour à la rétro du sprint 5 : l'épopée « Le bassin » déborde sur le sprint 6 (le sprint 5
a aussi terminé le reliquat de v0.4 : panneau, population, sauvegarde). Les épopées suivantes
sont décalées d'un sprint ; la phase 3 se resserre pour que **v1.0 reste au sprint 12**.

| Version | Épopée | Contenu visé |
|---|---|---|
| v0.5 | Le bassin (début) | Livré au sprint 5 : bassin extérieur sélectionnable, koïs aux robes tirées de la graine |
| v0.6 | Le bassin (suite) | Nénuphars, lotus, feuilles mortes flottantes, pluie, bassin enterré (sol et berge), robes de koïs plus naturelles |
| v0.7 | Le paludarium | Partie terrestre et aquatique ; amphibiens (axolotl, grenouilles, tritons) et leurs déplacements entre terre et eau |
| v0.8 | Le récif | Livré au sprint 8 : environnement marin, coraux, anémones, poissons-clowns, chirurgiens bleus |
| v0.9 | L'éditeur | Sprint 9, front seul : édition du décor du bac (ajout, déplacement, bois flotté à collision fine, pose par gravité avec Rapier chargé à la demande), dimensions du bac réglables. Sprint 10 : décor de la pièce (#35), catalogue d'espèces, forme du bassin. Le backend NestJS (sauvegarde serveur, partage) n'est lancé que si une fonctionnalité ne tient pas dans la sauvegarde locale et l'export/import JSON (ADR 0004) |

**Fin de phase 2** : bilan dans le rapport du jour.

## Phase 3 — Le réalisme (sprints 10 à 12)

Mise à jour à la rétro du sprint 10 : l'éditeur (pièce, catalogue d'espèces) a occupé le sprint 10 ;
« Le vivant » passe au sprint 11, « L'ambiance » et la mise en ligne se resserrent sur le sprint 12
(les 3 derniers cycles en stabilisation). La forme du bassin (#190) ouvre le sprint 11 en réserve.

| Version | Épopée | Contenu visé |
|---|---|---|
| v0.10 | L'éditeur (fin) | Livré au sprint 10 : éditeur de la pièce, catalogue d'espèces. Reste : forme du bassin (#190) |
| v0.11 | Le vivant | Sprint 11 : qualité de l'eau simplifiée (température, cycle de l'azote, filtration, changement d'eau), bien-être (faim, santé), compatibilité des espèces et comportements selon l'heure |
| v0.12 | L'aquarium éducatif (début) | Livré au sprint 12 (v1.0.0 à v1.0.5) : nourriture en voxels, pH et plages par espèce, fiches d'espèces sourcées, tableau de bord de l'eau, de la santé et des alertes en bordure |
| v1.1 | Des espèces en règle | Livré au sprint 13 (v1.1.0 à v1.1.5, priorité de Mathis #262) : statut légal en France dans les fiches, sonneur oriental et triton à ventre de feu, environnements cohérents (#269 à #271), correctif du changement d'environnement (#277), wiki des espèces lot 1/2 (#252). Reporté au sprint 14 : nouvelles espèces d'eau douce, lot 1 (#238) |
| v1.2 | L'aquarium éducatif (fin) et la pièce | Livré au sprint 14 (v1.2.0 à v1.2.5), dans l'ordre prévu : wiki des espèces lot 2/2 (#291), pièce aux aquariums lot 1/6, état de la pièce et sauvegarde au schéma 2 (#292, premier lot de #264), nouvelles espèces d'eau douce lot 1 (#238, reportée du sprint 13), feuilles de catappa (#239), guide du débutant (#240). Cycle 96 : dette (suites du guide #302, #296), cycle 97 : rétro et mutation de `species-sheet.ts` (#304) |
| v1.3 | La pièce | Livré au sprint 15 (v1.3.0 à v1.3.5) : pièce lot 2/6, bacs et meubles (#305, deux cycles), pièce lot 3/6, liste des bacs, sélection, transfert, tous les bacs vivants et renommage (#306 et #316, deux cycles), mode décor lot 1 (#278), puis ses suites de revue au cycle 103 (dette, #320). Écart : les lots a et b de #305 et #306 ont pris les cycles prévus pour le fond d'écran (#279) et la forme du bassin (#190), reportés au sprint 16 ; le mode décor garde un lot 2 (#323). Captures du bac seul identiques à l'octet à chaque lot de la pièce |
| v1.4 | La pièce complète (début) | Livré au sprint 16 (v1.4.0 à v1.4.5), dans l'ordre prévu : mode décor lot 2, retour en mode Soins (#323), fond d'écran pour Wallpaper Engine (#279, sans le paquet joint à la release : #330, `validation-mathis`), forme du bassin ovale et haricot (#190, ~700 lignes), pièce complète lot 1/3, murs, plafond et poutres (#324), pluie à la lumière légèrement assombrie (#123). Cycle 110 : dette fraîche (#336, #338, #334) au lieu de #26, #127, #40 ; cycle 111 : rétro (#347), suites du fond d'écran (#332) et fondu du ciel couvert (#338). Captures du bac seul identiques à l'octet malgré la pièce fermée |
| v1.5 | La pièce complète (suite) | Livré au sprint 17 (v1.5.0 à v1.5.5), dans l'ordre prévu : pièce complète lot 2/3, fenêtre et lumière du jour (#342), caméra libre lot 1/2, déplacement et limites (#343), lot 2/2, tactile et édition (#344), mode immersif lot 1/2, étalonnage et projection décentrée (#345), lot 2/2 **partiel** (#346 : parallaxe, autorisation, plein écran et limite d'images livrés ; tapotement de la vitre, nourriture au toucher et interface par appui long reportés au sprint 18). Cycle 117 : dette fraîche des caméras (#357, points 1 et 2 de #352) au lieu de la dette ancienne prévue (#26, #127, #40, non traitées) ; cycle 118 : rétro (#364), mutants de `fixed-step.ts` (#359, solde #127). Captures du bac seul identiques à l'octet hors changements voulus |
| v1.6 | Soigner pour de vrai | Livré au sprint 18 (v1.6.0 à v1.6.5) sauf #363 (reportée) ; plan initial, dans l'ordre : maladie des points blancs lot 1/2, apparition, symptômes et contagion (#360), puis points blancs visibles, alerte et lien vers le wiki (#366, cycle 120), nouvelles espèces d'eau douce lot 2, poissons de communauté et premier invertébré (#362), soigner les points blancs lot 2/2, traitements, erreurs et guérison (#361), mode immersif suite, tapotement, nourriture et interface par appui long (#346), pièce complète lot 3/3, porte, plinthes et luminaire (#363). Les cycles 119 à 121 portent sur l'aquarium. Cycle 124 : dette, rééquilibrage des parts e2e (#281) puis #26 ou fermeture expliquée de #40 ; cycle 125 : rétro. En réserve : lots 4 à 6 de #264, #330 et #297 (décisions de Mathis), espèces d'eau douce lot 3 |
| v1.7 | Lisibilité et pièce complète | Livré au sprint 19 (v1.7.0 à v1.7.5) : lisibilité des points blancs, de l'ancistrus et de la liste Population (#370, #372), pièce complète lot 3/3 (#363), choix du bac en mode immersif (#375), espèces d'eau douce lot 3 (#391), pièce aux aquariums lot 4, plafonds de performance (#392), correctifs du bac de départ (#396). Détail dans la rétro du sprint 19 (#399) |
| v1.8 | Aquarium vivant et accessible | Livré au sprint 20 (v1.8.0 à v1.8.6) : lisibilité du lot 3 et e2e plus rapide (#394), récif lot 2 (#403), accessibilité : réduire les mouvements, clavier, focus et contrastes (#406, #407), sons d'ambiance optionnels (#411), dette des sons (#413), mode sans filtre en cible pleine résolution (#40, cycle 139). Cycle 138 : dette fraîche au lieu de #40, soldée au c139 ; l'audit du reliquat de #264 et #340 passe au sprint 21. Détail dans la rétro du sprint 20 (#415) |
| v1.9 | Enrichir et partager | Sprint 21 (cycles 140 à 146) : audit et solde de #264 et #340, récif lot 3 avec #405, espèces d'eau douce lot 4, partage d'un aquarium par fichier ou lien (sans backend sans ADR), comportements plus riches. Cycle 145 : dette (#384 et #405 d'abord) ; cycle 146 : rétro |
| v1.10 | Consolidation | Sprint 22 (v1.10.0 à v1.10.5) : six lots de dette (simulation, allocations et caches, tests et mutants, interface, rendu, documentation, pièce). Bilan : 62 → 40 issues `dette` (objectif 30 non atteint), 0 bug, 0 échec de phase. Détail dans la rétro du sprint 22 (#462) |
| v1.11 | Reproduction et alevins | Sprint 23 (cycles 154 à 160) : fin de la consolidation (#453, #456 avec #446, #450) tant que la dette dépasse 30, puis alevins de guppy (#459), biotope de rivière à courant (#460), audit et solde des épopées de Mathis (#461). Livré (v1.11.0 à v1.11.5) sauf #461 (reportée au sprint 24). Détail dans la rétro du sprint 23 (#480) |
| v1.12 | Entretien et plantes | Sprint 24 (cycles 161 à 167) : audit et solde des épopées de Mathis (#461), algues, lumière et nitrates (#476), plantes qui poussent et se taillent (#477), ponte et œufs des corydoras (#478), photo PNG de l'aquarium (#479). Livré (v1.12.0 à v1.12.5) sauf #478 et #479, reportées au sprint 25 : chaque fonctionnalité a appelé un cycle de finitions. Détail dans la rétro du sprint 24 |
| v1.13 | Reproduction, dureté et santé | Sprint 25 (cycles 168 à 174) : ponte et œufs des corydoras (#478), photo PNG de l'aquarium (#479), dureté de l'eau et fiches complètes (#484), pourriture des nageoires (#485), tableau de bord 3/3 (#483). Livré (v1.13.0 à v1.13.5) sauf #483, reportée au sprint 26. Détail dans la rétro du sprint 25 |
| v1.14 | Comprendre son bac | Sprint 26 (cycles 175 à 181) : animaux concernés par une alerte (#483), calendrier d'entretien (#513), bilan du bac (#514), courbes d'historique de l'eau (#511), parcours guidé « Mon premier aquarium » (#512). Cycle 180 : dette (#450, #468, #498) ; cycle 181 : rétro |
| v1.15 | Soigner avec des produits | Sprint 27 (cycles 182 à 188) : reste de #229, produits simulés et troisième maladie : amorce de bactéries (#529), chlore et conditionneur (#530), charbon actif et régulateur de pH (#531), velours (#532), pharmacie du bac (#533). Cycle 187 : dette (#450, #468, #498) ; cycle 188 : rétro. Livré (v1.15.0 à v1.15.5) sauf #532 et #533, reportées au sprint 28 ; détail dans la rétro #550 |
| v1.16 | Soigner et prévenir | Sprint 28 (cycles 189 à 195) : velours (#532), pharmacie du bac (#533), effets secondaires des traitements (#549), bac de quarantaine (#547), champignons (#548). Cycle 194 : dette (#562, suites de #561 et #559) ; cycle 195 : rétro. Livré en entier (v1.16.0 à v1.16.5), puis bug #553 avec #556 au cycle 195 (v1.16.6) ; détail dans la rétro #568 |
| v1.17 | Un bac qui se lit et se vit | Sprint 29 (cycles 196 à 202) : kits de test de l'eau (#564), hydropisie (#565), alevins qui grandissent (#566), rayons de lumière (#567). Cycle 197 : lot de dette (#574, #572, #554, seuil de 30 dépassé) ; cycle 201 : dette (#450, #498) ; cycle 202 : rétro (#585). Livré (v1.17.0 à v1.17.4) sauf #567 (c200 en échec), reportée au sprint 30 |
| v1.18 | Le bac a une histoire | Sprint 30 (cycles 203 à 209) : rayons de lumière (#567), journal du bac (#581), lampe et durée d'éclairage (#584), distributeur de nourriture (#583), mortalité et épuisette lot 1 (#582). Livré (v1.18.0 à v1.18.5) sauf #582, reportée au sprint 31 : cycle 207 : lot de dette (#597, #595, #592) ; cycle 208 : dette (#599) ; cycle 209 : rétro (#603) |
| v1.19 | Entretenir à la main | Sprint 31 (cycles 210 à 216) : mortalité et épuisette lot 1 (#582), puis l'épopée #593 de Mathis en lots : séance guidée et raclette (#604), siphon et eau neuve (#605), éponge du filtre (#606), encrassement visible (#607). Cycle 215 : dette (#602, #590, #520, #498, #450) ; cycle 216 : rétro. Reste de #593 au sprint 32 : taille aux ciseaux, avant / après, bruitages |
| v1.x | L'ambiance et la mise en ligne | Prévue au sprint 12, repoussée (la numérotation `v1.0.0` a été atteinte au c77) : sons d'ambiance, accessibilité, performances, partage par lien si la sauvegarde locale le permet ; hébergement choisi ; les 3 derniers cycles sans nouvelle fonctionnalité |

## Sprint de consolidation (décision de Mathis du 2026-11-04)

Cycles 146 à 153 (prolongé jusqu'à ce que la dette repasse sous 30, voir la rétro #462) : **aucune nouvelle fonctionnalité**, résorption de la dette (#436). Cycle 146
(rétro) : tri des issues `dette` (fermer les périmées et les doublons, regrouper le reste en lots
par zone, les ordonner) ; cycles 147 à 152 : un lot par cycle ; cycle 153 (rétro) : bilan chiffré,
puis reprise des priorités ci-dessous. Objectif : 30 issues `dette` ouvertes ou moins.

**Règle permanente** : quand plus de 30 issues `dette` sont ouvertes, le prochain cycle de type
`fonctionnalite` traite un lot de dette au lieu d'une fonctionnalité (hors `bug` bloquant),
jusqu'à revenir sous le seuil.

## Priorités de Mathis (2026-10-26)

Le projet reste **centré sur l'aquarium**, à la fois éducatif et agréable : une personne qui n'a
jamais eu d'aquarium doit pouvoir commencer ici et apprendre à s'occuper de ses poissons
(température, pH, nourriture, soins, entretien). Ordre de traitement des idées de Mathis :

1. #226 — nourriture : voxels par défaut, grains mieux définis et naturels (les deux rendus
   restent au choix).
2. #251 — interface en bordure : tableau de bord permanent de l'eau, de la santé et de la
   simulation (les réglages ne gardent que ce qui se règle).
3. #229 — aquarium éducatif (épopée à découper : pH, espèces et fiches, soins, aides), avec
   #237 (fiches d'espèces), puis #262 (espèces en règle : statut légal en France, triton et
   grenouille réels, environnements cohérents) **avant** #252 (wiki des espèces en bas à
   droite). Données de départ : `docs/SOINS.md` et `docs/ESPECES.md`, à recouper et compléter.
4. #264 — pièce aux aquariums : plusieurs bacs et meubles réorganisables, d'un seul poisson à
   une animalerie entière. **L'ADR d'architecture (pièce de N bacs, sauvegarde au schéma 2)
   se fait tôt**, au prochain cycle de dette ou de rétro, pour que le tableau de bord, les
   alertes et le wiki soient écrits « par bac » ; l'implémentation vient après #262 et #252 et
   regroupe la pièce complète (#227), la caméra libre (#228), les meubles (#35) et le décor
   personnalisable (#34).
5. #277 — bug : changer d'environnement efface le bac. **Priorité haute** ; à traiter comme
   premier lot de #264 si l'ADR le permet vite, sinon en correctif autonome compatible avec la
   future sauvegarde au schéma 2.
6. #278 — mode décor (aquarium purement graphique, sans contraintes de soin, un mode par bac),
   puis #279 — vue « fond d'écran » pour Wallpaper Engine. Après l'ADR de #264.
7. #340 — mode immersif : l'écran devient la vitre de l'aquarium, à taille réelle, parallaxe à
   l'inclinaison du téléphone. Plus tard, après #278 et #279.

Toute valeur biologique est sourcée (référence consultable) ou marquée « approximation de jeu » ;
ce qui n'a pas pu être vérifié est signalé, jamais présenté comme réel. Planif replace les
sprints à la rétro : la stabilisation de v1.0 reste prévue en fin de parcours, la date peut
glisser si ces épopées le demandent.

## Après v1.0 — L'aquarium vivant (sprints 13 et suivants)

La roadmap continue : Planif propose de nouvelles épopées `v1.x` cohérentes avec `docs/DA.md`
(nouveaux environnements et espèces, comportements plus riches, éditeur avancé, partage,
performances, accessibilité, finitions visuelles), en privilégiant ce qui rend l'aquarium plus
beau et plus vivant.

## Audit des épopées de Mathis (cycle 161, #461)

Bilan, point par point, des huit épopées `idee-mathis` encore ouvertes au sprint 24. Sources :
issues de lot fermées, PR fusionnées (`Closes #N`) et notes de `docs/versions/`. Une épopée
entièrement livrée est fermée par la PR de l'audit ; Mathis reste libre de la rouvrir. Le reste
d'une épopée partielle est copié dans une issue `fonctionnalite` prête ; l'épopée reste
ouverte jusqu'à ce que ces issues soient livrées.

### #227 — Pièce complète autour du bac : livrée

| Point attendu | Livré par | Reste |
|---|---|---|
| Pièce fermée : sol, quatre murs, plafond à poutres | #324, PR #335 (v1.4.3) | — |
| Fenêtre et lumière du jour suivant `sim/daylight` | #342, PR #350 (v1.5.0) | — |
| Porte, plinthes, moulure, applique | #363, PR #387 (v1.7.1) | — |
| Aménagement existant (meubles, plantes, pose par gravité) dans la pièce | #188, PR #199 (v0.10.2) ; #305, PR #310 et #312 (v1.3.0, v1.3.1) | — |
| Sauvegarde compatible, captures du bac seul identiques | #324, #342, #363 (ADR 0093) | — |

### #228 — Caméra libre dans la pièce : livrée

| Point attendu | Livré par | Reste |
|---|---|---|
| Mode libre activable, retour à l'orbite, touche listée dans « Commandes » | #343, PR #351 (v1.5.1) | — |
| Déplacement, orientation, limites de la pièce et du bac | #343, PR #351 (v1.5.1) | — |
| Tactile, sélection et édition dans les deux modes | #344, PR #353 (v1.5.2) | — |
| Préréglages et captures inchangés | #343, #344 | — |

### #251 — Interface en bordure (tableau de bord) : partielle

| Point attendu | Livré par | Reste |
|---|---|---|
| Cadre en bordure, repli, aucune interface en capture | #256, PR #258 (v1.0.3) | — |
| Jauges d'eau permanentes (température, NH₃/NH₄⁺, nitrite, nitrate, pH), zones et tendance | #256, PR #258 (v1.0.3) ; pH #236, PR #249 (v1.0.1) | — |
| Santé, faim, heure, vitesse, alertes avec cause et action | #260, PR #261 (v1.0.4) | — |
| « Réglages » ne garde que ce qui se règle | #256 (ADR 0059) | — |
| Montrer l'alerte sur les animaux concernés (lot 3/3) | — | #483 |
| Oxygène, chlore, KH/GH, salinité « quand ils existent dans le modèle » | — | Absents du modèle ; dureté dans #484 |

### #252 — Wiki des espèces : partielle

| Point attendu | Livré par | Reste |
|---|---|---|
| Bouton en bas à droite, recherche, liste « dans le bac » et « ajoutables », « Ajouter » | #287, PR #288 (v1.1.4) | — |
| Alimentation, cohabitation avec raisons, comparaison avec le bac | #291, PR #295 (v1.2.0) | — |
| Guides « Produits et traitements » et « Maladies » | #291, PR #295 (v1.2.0) | — |
| Statut légal et sourçage de chaque valeur | #269, PR #275 (v1.1.0) | — |
| Dureté, tolérances azotées, durée de vie dans la fiche | — | #484 |

### #262 — Espèces en règle : livrée

| Point attendu | Livré par | Reste |
|---|---|---|
| Statut légal en France dans chaque fiche, rappels DDPP et « ne jamais relâcher » | #269, PR #275 (v1.1.0) | — |
| Liste d'exclusion testée (*Xenopus*, Pipidae, *Triturus*, espèces protégées) | #269, PR #275 (v1.1.0) | — |
| Corrections de fiches (koï, chirurgien, clown, *Hoplisoma paleatum*) | #269, PR #275 (v1.1.0) | — |
| Triton (*Cynops orientalis*) et grenouille (sonneur oriental) réels | #270, PR #283 (v1.1.2) | — |
| Environnements par défaut compatibles et migration | #271, PR #285 (v1.1.3) | — |

Statuts légaux non confirmés sur le texte consolidé : affichés « à vérifier auprès de la
DDPP », comme le demande l'issue (pas un reste de fonctionnalité).

### #264 — Pièce aux aquariums : livrée

| Point attendu | Livré par | Reste |
|---|---|---|
| ADR pièce de N bacs, sauvegarde au schéma 2 et migration | ADR 0061 (PR #274) ; #292, PR #298 (v1.2.1) | — |
| Catalogue de bacs et meubles, pose sans chevauchement | #305, PR #310 et #312 (v1.3.0, v1.3.1) | — |
| Étagère d'animalerie à plusieurs niveaux | #419, PR #420 (v1.9.0) | — |
| Bac sélectionné, liste des bacs, transfert avec rappel d'acclimatation | #306, PR #314 (v1.3.2) | — |
| Tous les bacs vivants, renommage | #316, PR #317 (v1.3.3) | — |
| Plafonds de performance mesurés (16 bacs, 240 animaux) | #392, PR #395 (v1.7.4) | — |
| Caméra libre entre les bacs | #343, #344 (v1.5.1, v1.5.2) | — |

Le jardin du bassin à koïs (aménagement extérieur) est hors périmètre de l'épopée, décision de
Mathis du 2026-10-27.

### #340 — Mode immersif : livrée

| Point attendu | Livré par | Reste |
|---|---|---|
| Étalonnage à la carte ID-1, taille réelle, projection décentrée | #345, PR #354 (v1.5.3) | — |
| Parallaxe à l'orientation, plein écran, Wake Lock, limite d'images | #346, PR #356 (v1.5.4) | — |
| Tapoter la vitre, nourrir par le haut, interface par appui long | #346, PR #376 (v1.6.4) | — |
| Choix du bac | #375, PR #389 (v1.7.2) | — |

### #229 — Aquarium éducatif : partielle

| Point attendu | Livré par | Reste |
|---|---|---|
| Beaucoup plus d'espèces, chacune avec sa fiche (28 espèces) | #237, PR #254 (v1.0.2) ; #238, PR #299 (v1.2.2) ; #362, PR #371 (v1.6.2) ; #391, PR #393 (v1.7.3) ; #425, PR #428 (v1.9.2) ; récif #403, PR #404 (v1.8.1) et #422, PR #423 (v1.9.1) | — |
| pH simulé, plage par espèce, jauge | #236, PR #249 (v1.0.1) | — |
| Dureté « si utile » | — | #484 |
| Catappa | #239, PR #300 (v1.2.3) | — |
| Points blancs : apparition, symptômes, traitements, guérison | #360, PR #367 (v1.6.0) ; #366, PR #369 (v1.6.1) ; #361, PR #373 (v1.6.3) | — |
| Autres maladies simulées | — | #485 (pourriture des nageoires) ; velours, champignons, hydropisie… ensuite |
| Produits simulés (conditionneur, bactéries, régulateurs, charbon, tests) | Guides du wiki seulement (#291) | À découper par Planif après #485 |
| Aides au débutant, alertes, guide | #240, PR #301 (v1.2.4) ; #260, PR #261 (v1.0.4) | — |
| Rigueur des données (source ou « approximation de jeu ») | #237, #269, chaque lot d'espèces | — |

## Backlog

Le backlog est l'ensemble des issues ouvertes `fonctionnalite`, `bug` et `dette`. Planif
le maintient : chaque issue a un titre court, un contexte, des **critères d'acceptation
vérifiables** et une estimation (`S` : un cycle facile, `M` : un cycle plein, `L` : à
découper).

### Idées notées hors issue

- **Nourriture non mangée qui pollue l'eau** (écart de #583, écarté du lot de dette #597) :
  aujourd'hui, une ration du distributeur automatique que personne ne mange reste sans
  conséquence (modèle existant de la nourriture). Idée de fonctionnalité : la nourriture
  restante se décompose et ajoute de l'ammoniaque, puis des nitrates. À ouvrir en issue
  `fonctionnalite` par Planif.
