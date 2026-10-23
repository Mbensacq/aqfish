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

| Version | Épopée | Contenu visé |
|---|---|---|
| v0.10 | Le vivant | Qualité de l'eau simplifiée (température, cycle de l'azote, filtration, entretien) et bien-être (faim, santé, compatibilité des espèces, comportements selon l'heure) |
| v0.11 | L'ambiance | Sons d'ambiance, météo étendue, partage par lien, accessibilité, performances |
| v1.0 | La mise en ligne | Hébergement choisi ; stabilisation : les 3 derniers cycles du sprint sans nouvelle fonctionnalité |

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
