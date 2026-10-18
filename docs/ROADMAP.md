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

## Phase 2 — Les mondes (sprints 5 à 8)

| Version | Épopée | Contenu visé |
|---|---|---|
| v0.5 | Le bassin | Bassin extérieur à koïs : vue de dessus, nénuphars, lotus, pluie, feuilles flottantes ; motifs de koïs variés |
| v0.6 | Le paludarium | Partie terrestre et aquatique ; amphibiens (axolotl, grenouilles, tritons) et leurs déplacements entre terre et eau |
| v0.7 | Le récif | Récif marin : coraux, anémones, poissons de récif |
| v0.8 | L'éditeur | Éditeur de bac et de bassin (dimensions, forme, placement du décor) ; catalogue d'espèces ; backend NestJS : sauvegarde côté serveur et partage (mis en place dès que la phase 2 en a besoin) |

**Fin de phase 2** : bilan dans le rapport du jour.

## Phase 3 — Le réalisme (sprints 9 à 12)

| Version | Épopée | Contenu visé |
|---|---|---|
| v0.9 | L'eau | Qualité de l'eau simplifiée : température, cycle de l'azote, filtration, entretien |
| v0.10 | Le bien-être | Faim, santé, compatibilité des espèces, comportements selon l'heure |
| v0.11 | L'ambiance | Sons d'ambiance, météo, partage par lien, accessibilité, performances |
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
