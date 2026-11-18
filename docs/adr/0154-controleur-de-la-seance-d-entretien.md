# 0154 — Contrôleur de la séance d'entretien

- Statut : acceptée
- Date : 2026-11-18
- Auteur : Dev
- Complète : ADR 0138 (séance d'entretien guidée), ADR 0153 (sonde des attributs de test)

## Contexte

La séance d'entretien guidée (#604 et ses lots #605, #606, #623, #624, #625, #655) vivait
dans `ui/aquarium-host/aquarium-host.ts` : sept signaux, deux relevés d'image et une vingtaine
de méthodes (ouverture, étapes, outils, passages de raclette et de siphon, eau neuve, rinçage,
taille, avant / après, stockage de la séance interrompue). Chantier d'assainissement #686,
lot 8 (#694) : deuxième lot du démontage de l'hôte, après la sonde (ADR 0153).

## Décision

1. **Contrôleur** : `CareSessionController` (`ui/care-session/care-session-controller.ts`),
   une classe simple (pas un service injectable : une séance par hôte), porte l'état affiché
   de la séance en signaux et toute sa logique d'interface. Les règles restent dans `sim/`
   (`care-session.ts`, `siphon.ts`, `filter-rinse.ts`).
2. **Ports** : il reçoit à la construction un objet `CareSessionPorts` (monde, vue, capture,
   stockage, réglage de l'eau, calendrier, journal, historique, sons, sonde, relevé de l'eau,
   enregistrement, image, outils en main, photo). Ce sont des fonctions relues à chaque appel,
   car le monde et la vue changent ; le contrôleur n'importe pas l'hôte.
3. **Hôte** : il construit le contrôleur, expose ses signaux sous leurs anciens noms
   (`careSession`, `careConditioner`…) et délègue ses méthodes publiques (`openCareSession`,
   `completeCareSessionStep`…) : le modèle de `app.html`, les tests et les attributs publiés ne
   changent pas. Les outils en main (raclette, sécateur) restent à l'hôte, partagés avec
   l'entretien hors séance.
4. **Garde-fous** : `aquarium-host.seance.spec.ts` fige le comportement vu de l'hôte avant le
   déplacement ; `care-session-controller.spec.ts` teste le contrôleur seul, avec un monde réel
   et des ports factices.

## Options écartées

- **Service Angular injecté** : il faudrait lui fournir le monde et la vue de l'hôte par un
  autre canal, et sa durée de vie ne suivrait plus celle de l'hôte.
- **Passer l'hôte au contrôleur** : couplage dans les deux sens et cycle d'import.

## Conséquences

- Les lots suivants (contrôleurs extraits de l'hôte) suivent le même patron : classe,
  objet de ports, signaux réexposés par l'hôte le temps de migrer les gabarits.
- Ajouter une étape à la séance se fait dans le contrôleur et `sim/care-session.ts`, sans
  toucher à l'hôte, sauf besoin d'un port nouveau.
