# 0155 — Contrôleurs de l'édition du décor et de la pièce

- Statut : acceptée
- Date : 2026-11-19
- Auteur : Dev
- Complète : ADR 0154 (contrôleur de la séance d'entretien), ADR 0153 (sonde des attributs de test)

## Contexte

L'édition du décor (#167, #168, #170, #182, #183 : mode édition, outil, sélection, pose par
gravité avec le moteur Rapier chargé à la demande, glisser, rotation, échelle, chute
affichée) et celle de la pièce (#188 : éléments de la pièce graphique ; #305 : catalogue
« Bacs et meubles » de la pièce de N bacs) vivaient dans `ui/aquarium-host/aquarium-host.ts` :
une quarantaine de méthodes, douze signaux et deux gestes en cours. Chantier d'assainissement
#686, lot 9 (#695), sur le patron de l'ADR 0154.

## Décision

1. **Trois contrôleurs** dans `ui/aquarium-host/`, classes simples construites par l'hôte :
   - `DecorEditingController` (`decor-editing-controller.ts`) : mode édition, outil, sélection,
     refus, moteur de chute (`loadPhysics`, import dynamique conservé), lâcher, chute d'un
     élément privé de support, glisser, rotation, échelle, suppression, chute affichée. C'est
     l'éditeur : un geste qui vise la pièce (clic sur le parquet, Suppr, rotation d'un élément
     de la pièce) passe au port `RoomEditingPort`.
   - `RoomEditingController` (`room-editing-controller.ts`) : sélection, pose par gravité,
     quart de tour, glisser et suppression des éléments de la pièce graphique. Il partage le
     mode édition et le refus de l'éditeur du décor par le port `DecorEditorPort`.
   - `RoomLayoutController` (`room-layout-controller.ts`) : catalogue « Bacs et meubles »
     (ajout à la première place libre, retrait, refus en clair, `bacs=` des captures). Types
     du catalogue, `ROOM_LAYOUT_MESSAGES` et `supportPlaceLabel` y vivent, réexportés par
     l'hôte pour ses importeurs.
2. **Ports** : chaque contrôleur reçoit un objet de fonctions relues à chaque appel (monde,
   vue réduite à ce qu'il lui demande, capture, sonde, enregistrement, image). Les deux
   éditeurs se connaissent par des interfaces étroites câblées par l'hôte, jamais l'un
   l'autre ni l'hôte : aucun cycle d'import.
3. **Hôte** : il garde la pièce de N bacs (`roomState`, resynchronisée avec les mondes rangés)
   et la pièce graphique (`room`, `applyRoom`, qui prévient `roomApplied` et
   `roomShownChanged`), réexpose les signaux sous leurs anciens noms (`decorEditing`,
   `roomSelection`, `roomCatalog`…) et délègue ses méthodes publiques : gabarits, tests et
   attributs publiés ne changent pas.
4. **Garde-fous** : `aquarium-host.edition.spec.ts` fige, avant le déplacement, les
   comportements que `aquarium-host.spec.ts` ne couvrait pas (moteur en erreur ou en
   chargement, support retiré, geste abandonné, refus de la pièce) ; chaque contrôleur a son
   test avec des ports factices.

## Options écartées

- **Un seul contrôleur d'édition** : plus de 600 lignes, et deux sujets (décor du bac,
  meubles de la pièce) qui n'ont en commun que le mode et le refus.
- **Mode et refus dans un objet partagé à part** : un troisième acteur pour deux signaux ;
  l'éditeur du décor en est déjà le propriétaire naturel (l'interface les affiche avec lui).
- **Catalogue dans `RoomEditingController`** : il dépend de la pièce de N bacs et des mondes
  rangés, que l'édition des éléments de la pièce graphique ignore.

## Conséquences

- Le chargement de Rapier reste paresseux : seul `load-decor-physics.ts` importe le moteur ;
  le budget du bundle initial (`scripts/verifier-bundle-initial.mjs`) est inchangé.
- Un nouvel outil d'édition se fait dans le contrôleur concerné, sans toucher à l'hôte, sauf
  besoin d'un port nouveau.
