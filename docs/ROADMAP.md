# Roadmap

Tenue par **Planif**. Ce fichier liste les phases, les versions et les épopées ; le détail
des fonctionnalités vit dans les issues (étiquette `fonctionnalite`), qui forment le backlog.
Planif peut réordonner et découper à chaque rétrospective, en expliquant ses choix dans
l'issue `retro` de la semaine. Changer le périmètre d'une **phase** (et non d'une semaine)
demande l'accord de Mathis (issue `bloque`).

## Calendrier

- 12 semaines, 3 phases de 4 semaines.
- Semaine type (comptée à partir de la première nuit, voir `CLAUDE.md`) : 5 nuits
  `fonctionnalite`, puis 1 nuit `dette`, puis 1 nuit `retro`.
- **Point d'étape à la fin de chaque phase** : le Superviseur met l'équipe en pause
  (`"pause": true` dans `etat.json`) et rédige un bilan de phase. Mathis décide de
  continuer, d'ajuster ou d'arrêter, puis lève la pause.
- Dates exactes : `experience.premiereNuit` et `experience.finsDePhase` dans `etat.json`.

## Versions

Une version mineure par semaine (`v0.<semaine>`), un correctif par PR fusionnée :
`v0.1.0`, `v0.1.1`… La semaine 12 produit `v1.0.0`. Chaque tag publie le front sur
GitHub Pages.

## Phase 1 — Le bac et la vie (semaines 1 à 4, front seul)

| Version | Épopée | Contenu visé |
|---|---|---|
| v0.1 | Le bac | Composant hôte Three.js ; bac vitré, eau, sable ; caméra orbitale à la souris et préréglages ; contrat de capture complet ; pipeline pixel art (basse résolution, `NearestFilter`) ; PRNG à graine et boucle à pas fixe ; une première espèce qui nage |
| v0.2 | Le banc | Comportement de banc (séparation, alignement, cohésion), évitement des parois et obstacles, ondulation du corps ; trois espèces générées par le code ; palette et contours |
| v0.3 | Le décor | Rochers, plantes qui ondulent, bulles, caustiques, cycle jour/nuit, éclairage ; panneau de contrôle |
| v0.4 | La vie | Nourrissage au clic (chute, attraction, faim) ; population réglable ; vitesse de simulation ; sauvegarde dans le navigateur, export et import JSON |

**Point d'étape 1** : bilan de la phase et choix de l'hébergement du backend NestJS (NAS
Synology en conteneur, ou Infomaniak).

## Phase 2 — Les mondes (semaines 5 à 8)

| Version | Épopée | Contenu visé |
|---|---|---|
| v0.5 | Le bassin | Bassin extérieur à koïs : vue de dessus, nénuphars, lotus, pluie, feuilles flottantes ; motifs de koïs variés |
| v0.6 | Le paludarium | Partie terrestre et aquatique ; amphibiens (axolotl, grenouilles, tritons) et leurs déplacements entre terre et eau |
| v0.7 | Le récif | Récif marin : coraux, anémones, poissons de récif |
| v0.8 | L'éditeur | Éditeur de bac et de bassin (dimensions, forme, placement du décor) ; catalogue d'espèces ; backend NestJS : sauvegarde côté serveur et partage (mis en place dès que la phase 2 en a besoin) |

**Point d'étape 2.**

## Phase 3 — Le réalisme (semaines 9 à 12)

| Version | Épopée | Contenu visé |
|---|---|---|
| v0.9 | L'eau | Qualité de l'eau simplifiée : température, cycle de l'azote, filtration, entretien |
| v0.10 | Le bien-être | Faim, santé, compatibilité des espèces, comportements selon l'heure |
| v0.11 | L'ambiance | Sons d'ambiance, météo, partage par lien, accessibilité, performances |
| v1.0 | La mise en ligne | Hébergement choisi ; stabilisation : les 3 dernières nuits sans nouvelle fonctionnalité |

**Point d'étape final** : bilan de l'expérience.

## Backlog

Le backlog est l'ensemble des issues ouvertes `fonctionnalite`, `bug` et `dette`. Planif
le maintient : chaque issue a un titre court, un contexte, des **critères d'acceptation
vérifiables** et une estimation (`S` : une nuit facile, `M` : une nuit pleine, `L` : à
découper).
