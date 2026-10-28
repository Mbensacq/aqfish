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
| v1.2 | L'aquarium éducatif (fin) et la pièce | Sprint 14 (cycles 91 à 97), dans l'ordre : wiki des espèces lot 2/2 (#291), pièce aux aquariums lot 1/6, état de la pièce et sauvegarde au schéma 2 (#292, premier lot de #264), nouvelles espèces d'eau douce lot 1 (#238), feuilles de catappa (#239), aides pour débutant (#240). Cycle 96 : dette (#281 d'abord), cycle 97 : rétro. En réserve : mode décor (#278) et fond d'écran (#279) après le lot 1 de la pièce, lots 2 à 6 de #264, forme du bassin (#190), #123. Le lot 1 de la pièce passe avant #239 et #240, conformément aux priorités de Mathis (la pièce après #262 et #252) |
| v1.3 | La pièce et la caméra libre | Après v1.2 : pièce complète (#227 : murs, plafond à poutres, fenêtre, détails), caméra libre qui flotte dans la pièce (#228). Cadre optionnel autour du bac, jamais prioritaire sur l'aquarium |
| v1.x | L'ambiance et la mise en ligne | Prévue au sprint 12, repoussée (la numérotation `v1.0.0` a été atteinte au c77) : sons d'ambiance, accessibilité, performances, partage par lien si la sauvegarde locale le permet ; hébergement choisi ; les 3 derniers cycles sans nouvelle fonctionnalité |

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

Toute valeur biologique est sourcée (référence consultable) ou marquée « approximation de jeu » ;
ce qui n'a pas pu être vérifié est signalé, jamais présenté comme réel. Planif replace les
sprints à la rétro : la stabilisation de v1.0 reste prévue en fin de parcours, la date peut
glisser si ces épopées le demandent.

## Après v1.0 — L'aquarium vivant (sprints 13 et suivants)

La roadmap continue : Planif propose de nouvelles épopées `v1.x` cohérentes avec `docs/DA.md`
(nouveaux environnements et espèces, comportements plus riches, éditeur avancé, partage,
performances, accessibilité, finitions visuelles), en privilégiant ce qui rend l'aquarium plus
beau et plus vivant.

## Backlog

Le backlog est l'ensemble des issues ouvertes `fonctionnalite`, `bug` et `dette`. Planif
le maintient : chaque issue a un titre court, un contexte, des **critères d'acceptation
vérifiables** et une estimation (`S` : un cycle facile, `M` : un cycle plein, `L` : à
découper).
